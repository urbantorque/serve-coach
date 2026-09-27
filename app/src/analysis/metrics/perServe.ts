/**
 * Per-serve metric values (METRICS §3) from a ServeCore: formulas, prerequisites, the §1.2 error
 * components, plausibility bounds (§4.2) and honesty labels. Values are in the catalogue units
 * (ratio, cm, ms, % of height); the 95% interval is value ± 1.96·√(σ_r² + σ_leak² + σ_s² + σ_p²).
 */
import { LM, type MetricId, type MetricValue, type ReasonCode, type TargetZone } from '../types.ts'
import { estimateServeSpeedFromTrack } from '../ball/speed.ts'
import { scaleFromBodyHeight } from '../ball/scale.ts'
import { kneeFlexionDeg } from '../pose/body.ts'
import type { CameraModel } from '../serve/geometry.ts'
import { heightOf, FOOT_TOE, WRIST, type WristSide } from '../serve/events.ts'
import { xOf, yOf } from '../serve/ball.ts'
import type { ServeCore } from '../serve/analyse.ts'
import { indexAt, landmarksAt, localQuadratic, midHip, pointSpeed, pt, rangeIdx, velocityHalfWindow, type PoseTrack } from '../serve/track.ts'
import { bandProbabilities } from '../stats/aggregate.ts'
import { METRIC_VIEWS, MIN_VALIDATED_DISTANCE_M, PITCH_SENSITIVE_IDS, PLAUSIBILITY, type ConditionClass } from './catalogue.ts'
import { finalizeMetric, unavailable, wrongViewReason, type Downgrade, type MetricDraft } from './status.ts'

export const G = 9.81

/**
 * trophy-pause stillness floors (BH/s): §3.13 starts at pelvis 0.15 and wrists 0.6 and grid-searches
 * them on synthetic data; the values below are the grid result on development seeds (see
 * validation/results/metrics/SUMMARY.md). The metric stays experimental.
 */
export const PAUSE_THRESHOLDS = { hipFloor: 0.02, wristFloor: 0.2 }
const Z = 1.959964

export type TimeBaseClass = 'proven' | 'physics' | 'normal' | 'unknown'

export interface MetricContext {
  view: 'side' | 'rear' | 'front45' | 'unknown'
  viewMismatch: boolean
  cam: CameraModel
  captureFps: number
  timeBase: TimeBaseClass
  /** Relative σ of the time base (0.003 proven; ≥ 2% physics-fixed). */
  timeScaleRelSigma: number
  condition: ConditionClass
  playerHeightM: number
  heightEntered: boolean
  intendedType: 'flat' | 'slice' | 'kick' | 'unknown'
  cameraSide: 'chest' | 'back'
  servedFrom?: 'deuce' | 'ad'
  targetTag?: TargetZone
  /** Session-level blocks that make metrics unavailable. */
  cameraMoved?: boolean
  /** Per-serve share of missing frames in the serve window (0..1). */
  framesMissingShare?: number
}

export interface PerServeResult {
  metrics: Partial<Record<MetricId, MetricValue>>
  hardRejects: string[]
  softFlags: string[]
  /** Values kept for session aggregation in natural units, with σ components. */
  raw: {
    apexM?: number
    apexRatio?: number
    censoredApexM?: number
    forwardCm?: number
    lateralCm?: number
    contactRatio?: number
    contactCm?: number
    contactForwardCm?: number
    rhythmMs?: number
    dropCm?: number
    legDrivePct?: number
    loadingPct?: number
    driveMs?: number
    pauseMs?: number
    landingCm?: number
    shoulderTiltDeg?: number
    kneeDeg?: number
    sosDeg?: number
  }
  sigmas: Partial<Record<MetricId, { r: number; leak: number; shared: number }>>
  /** Detected-view evidence for the view check (§2.3.7). */
  viewEvidence?: { outgoingHorizontal?: boolean; landingHorizontal?: boolean }
}

// ---------- depth-offset priors (§3.2, §3.8) ----------

export function tossDepthPrior(ctx: Pick<MetricContext, 'view' | 'intendedType' | 'cameraSide'>): { mean: number; sigma: number } {
  if (ctx.view === 'rear') return { mean: -0.3, sigma: 0.2 }
  const sign = ctx.cameraSide === 'back' ? -1 : 1
  if (ctx.intendedType === 'kick') return { mean: sign * 0.1, sigma: 0.2 }
  if (ctx.intendedType === 'flat' || ctx.intendedType === 'slice') return { mean: sign * 0.3, sigma: 0.15 }
  return { mean: sign * 0.25, sigma: 0.2 }
}

export function contactDepthPrior(ctx: Pick<MetricContext, 'view' | 'intendedType' | 'cameraSide'>): { mean: number; sigma: number } {
  if (ctx.view === 'rear') return { mean: -0.35, sigma: 0.2 }
  const sign = ctx.cameraSide === 'back' ? -1 : 1
  if (ctx.intendedType === 'kick') return { mean: 0, sigma: 0.2 }
  if (ctx.intendedType === 'flat' || ctx.intendedType === 'slice') return { mean: sign * 0.3, sigma: 0.15 }
  return { mean: sign * 0.25, sigma: 0.2 }
}

/** ratio_corr = r_h + (ratio − r_h)·(1 − δ/D) (§3.2). */
export function depthCorrect(value: number, pivot: number, delta: number, distanceM: number): number {
  return pivot + (value - pivot) * (1 - delta / distanceM)
}

function inRange(v: number, [lo, hi]: readonly [number, number]): boolean {
  return v >= lo && v <= hi
}

function tiltDowngrades(id: MetricId, ctx: MetricContext): { unavailable?: ReasonCode; downgrades: Downgrade[] } {
  if (!(PITCH_SENSITIVE_IDS as readonly string[]).includes(id)) return { downgrades: [] }
  if (ctx.cam.tiltStatus === 'measured-over-cap') return { unavailable: 'CAMERA_TILTED', downgrades: [] }
  if (ctx.cam.tiltStatus === 'unknown') return { downgrades: [{ cap: 'experimental', reason: 'PITCH_UNKNOWN' }] }
  return { downgrades: [] }
}

function ci(value: number, sig: { r: number; leak: number; shared: number }): { kind: 'ci95'; low: number; high: number } {
  const s = Math.sqrt(sig.r * sig.r + sig.leak * sig.leak + sig.shared * sig.shared)
  return { kind: 'ci95', low: value - Z * s, high: value + Z * s }
}

const r2 = (x: number) => Math.round(x * 100) / 100

/** Median of a landmark-derived quantity over trophy ± 2 frames. */
function medianAround(track: PoseTrack, t: number, f: (i: number) => number | null): number | null {
  const i0 = indexAt(track, t)
  const vals: number[] = []
  for (let i = Math.max(0, i0 - 2); i <= Math.min(track.t.length - 1, i0 + 2); i++) {
    const v = f(i)
    if (v !== null && Number.isFinite(v)) vals.push(v)
  }
  if (!vals.length) return null
  vals.sort((a, b) => a - b)
  return vals[vals.length >> 1]
}

export function computeServeMetrics(core: ServeCore, track: PoseTrack, ctx: MetricContext): PerServeResult {
  const res: PerServeResult = { metrics: {}, hardRejects: [], softFlags: [], raw: {}, sigmas: {} }
  const M = res.metrics
  const basisView = ctx.view === 'rear' ? 'rear view' : 'side view'
  const set = (id: MetricId, v: MetricValue) => (M[id] = v)
  const H = ctx.playerHeightM
  const ref = core.ref

  // View gating first (§1.3, §2.8): wrong view → unavailable; detected view mismatch → VIEW_MISMATCH.
  const viewOk = (id: MetricId): boolean => {
    const views = METRIC_VIEWS[id] as readonly string[]
    if (ctx.view !== 'side' && ctx.view !== 'rear') {
      set(id, unavailable(id, views.length ? 'NEEDS_SIDE_VIEW' : 'NOT_MEASURABLE', basisView))
      return false
    }
    if (!views.includes(ctx.view)) {
      set(id, unavailable(id, wrongViewReason(views), basisView))
      return false
    }
    if (ctx.viewMismatch) {
      set(id, unavailable(id, 'VIEW_MISMATCH', basisView))
      return false
    }
    return true
  }

  set('spin', unavailable('spin', 'NOT_MEASURABLE', 'ball spin'))
  const ALL: MetricId[] = [
    'toss-apex-height', 'toss-forward', 'toss-lateral', 'toss-drop', 'contact-height-ratio', 'contact-forward',
    'rhythm-release-to-contact', 'trophy-pause', 'leg-drive', 'drive-time', 'loading-depth', 'deep-bend-flag',
    'shoulder-tilt-trophy', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'landing-distance', 'speed-experimental', 'speed-average-rear',
  ]
  const live = ALL.filter(viewOk)
  const want = (id: MetricId) => live.includes(id)

  if (!ref || core.classification === 'shadow' || core.classification === 'other') {
    const reason: ReasonCode = !ref ? (core.refSource === 'none' ? 'FEET_NOT_VISIBLE' : 'BODY_NOT_UPRIGHT') : 'BALL_NOT_TRACKED'
    for (const id of live) set(id, unavailable(id, reason, basisView))
    return res
  }
  const bh = ref.bodyHeightHU
  const mPerHU = H / bh
  const D = core.cameraDistanceM ?? (ctx.cam.fHU * H) / bh
  const aspect = track.aspect
  const pivotY = 0.5
  const rH = heightOf(ref, pivotY)
  const fpsOk = ctx.captureFps >= 30
  const timeOk = ctx.timeBase !== 'unknown'
  const e = core.events
  const release = e.tossRelease
  const apex = e.tossApex
  const contact = e.contact
  const toss = core.ball.toss
  const p = core.ball.parabola
  const trackingOk = core.trackingQuality >= 0.5
  const tossPrior = tossDepthPrior(ctx)
  const contactPrior = contactDepthPrior(ctx)
  const bodyRel = { p: 0.025, s: 0.015 }
  const pitchSigmaDeg = ctx.cam.pitch?.sigma ?? 2
  const tossTime = core.ball.apexCase
  const retoss = core.classification === 'retoss'
  const noContact = core.noContact
  const commonDown: Downgrade[] = []
  // Depth-corrected heights were validated at the D1 distances only (7–9 m); nearer, the §3.2 prior
  // over-corrects (synthetic 5 m set-ups read 4–7% of height low; the 5 m rear view likewise).
  const nearDown: Downgrade[] = D < MIN_VALIDATED_DISTANCE_M ? [{ cap: 'experimental', reason: 'VALIDATION_PENDING' }] : []
  if ((ctx.framesMissingShare ?? 0) > 0.1) commonDown.push({ cap: 'unavailable', reason: 'FRAMES_DROPPED' })

  const plaus = (key: string, value: number, hard: (v: number) => boolean, soft: (v: number) => boolean): 'ok' | 'soft-flag' | 'hard-reject' => {
    if (hard(value)) {
      res.hardRejects.push(key)
      return 'hard-reject'
    }
    if (soft(value)) {
      res.softFlags.push(key)
      return 'soft-flag'
    }
    return 'ok'
  }
  /** Applies a plausibility outcome to a draft. */
  const withPlaus = (draft: MetricDraft, outcome: 'ok' | 'soft-flag' | 'hard-reject'): MetricDraft => {
    if (outcome === 'hard-reject') return { ...draft, plausibility: 'hard-reject', downgrades: [...(draft.downgrades ?? []), { cap: 'unavailable', reason: 'IMPLAUSIBLE_VALUE' }] }
    if (outcome === 'soft-flag') return { ...draft, plausibility: 'soft-flag', confidence: draft.confidence * 0.7, infoReason: draft.infoReason ?? 'CHECK_THIS_SERVE' }
    return { ...draft, plausibility: 'ok' }
  }

  // Fitted gravity on the toss (near-apex window, stature scale, time base): per-toss plausibility.
  let gravityReject = false
  if (toss?.gravity?.status === 'ok' && toss.gravity.apparentGravityMps2 !== undefined && timeOk) {
    const g = toss.gravity.apparentGravityMps2
    const o = plaus('fittedGravityMps2', g, (v) => !inRange(v, PLAUSIBILITY.fittedGravityMps2.hard), (v) => !inRange(v, PLAUSIBILITY.fittedGravityMps2.soft))
    if (o === 'hard-reject') gravityReject = true
  }

  // ---------- toss-apex-height (§3.2) ----------
  const apexUnavailable = (): ReasonCode | null => {
    if (!fpsOk) return 'FPS_TOO_LOW'
    if (!toss || toss.status !== 'ok' || !apex) return 'BALL_NOT_TRACKED'
    if (tossTime === 'censored') return 'APEX_OUT_OF_FRAME'
    if (tossTime === 'too-few' || tossTime === 'none') return 'BALL_NOT_TRACKED'
    return null
  }
  let apexRatio: number | undefined
  if (want('toss-apex-height')) {
    const id: MetricId = 'toss-apex-height'
    const why = apexUnavailable()
    const tilt = tiltDowngrades(id, ctx)
    if (tossTime === 'censored' && core.ball.frameTopY !== undefined) res.raw.censoredApexM = heightOf(ref, core.ball.frameTopY) * H
    if (why) set(id, unavailable(id, why, 'ball apex fit vs floor from pose', why === 'APEX_OUT_OF_FRAME' ? { censored: 'right' } : {}))
    else if (tilt.unavailable) set(id, unavailable(id, tilt.unavailable, 'ball apex fit vs floor from pose'))
    else {
      const raw = heightOf(ref, toss!.apex!.y)
      const ratio = depthCorrect(raw, rH, tossPrior.mean, D)
      apexRatio = ratio
      const period = track.dt
      const extraM = tossTime === 'fitted-above' ? G * ((core.ball.apexGapS ?? 0) / 2) * (period / 2) : 0
      const sr = Math.hypot((toss!.apex!.yUncertaintyNorm ?? 0) / bh, extraM / H)
      const leak = (Math.abs(ratio - rH) * 0.15) / D
      const shared = Math.hypot(0.005 / 1, bodyRel.s * ratio, 0.005 * ratio * pitchSigmaDeg, bodyRel.p * ratio, (Math.abs(ratio - rH) * tossPrior.sigma) / D)
      const sig = { r: sr, leak, shared }
      res.sigmas[id] = sig
      const apexM = ratio * H
      res.raw.apexRatio = ratio
      res.raw.apexM = apexM
      const downs: Downgrade[] = [...commonDown, ...tilt.downgrades, ...nearDown]
      if (tossTime === 'fitted-above') downs.push({ cap: 'estimated', reason: 'APEX_EXTRAPOLATED' })
      if (gravityReject) downs.push({ cap: 'unavailable', reason: 'IMPLAUSIBLE_VALUE' })
      // Plausibility: hard below contact height − 0.10 m (checked after contact below), above 5.5 m.
      const outcome = plaus('apexHeightM', apexM, (v) => v > PLAUSIBILITY.apexHeightM.hardAbove, (v) =>
        v < PLAUSIBILITY.apexHeightM.softBelow || v > PLAUSIBILITY.apexHeightM.softAbove || ratio < PLAUSIBILITY.apexHeightM.softRatioBelow || ratio > PLAUSIBILITY.apexHeightM.softRatioAbove,
      )
      const draft: MetricDraft = {
        value: r2(ratio),
        confidence: toss!.apex!.confidence,
        basis: `ball apex fit (${core.ball.detections} detections) vs the floor from pose; scale from your height; a toss nearer the camera than your body reads high (corrected with a ${tossPrior.mean.toFixed(2)} m prior)`,
        uncertainty: ci(ratio, sig),
        secondary: ctx.heightEntered ? { cm: Math.round(apexM * 100), rawRatio: r2(raw) } : { rawRatio: r2(raw) },
        sigmaRandom: sig.r,
        sigmaLeak: sig.leak,
        sigmaShared: sig.shared,
        downgrades: downs,
        infoReason: ctx.heightEntered ? undefined : 'PLAYER_HEIGHT_MISSING',
      }
      set(id, finalizeMetric(id, withPlaus(draft, outcome), ctx.condition))
    }
  }

  // ---------- contact time, ball position ----------
  const contactReason = (): ReasonCode | null => {
    if (retoss) return 'CONTACT_NOT_FOUND'
    if (noContact) return 'NO_CONTACT'
    if (!contact || contact.confidence < 0.5) return 'CONTACT_NOT_FOUND'
    return null
  }
  const tc = contact?.tReal
  const sigmaTc = contact?.uncertaintyS ?? 0.05
  const lastOn = core.ball.lastOnT
  const contactBall = (() => {
    if (!p || tc === undefined || core.contactWristOnly) return null
    if (lastOn !== undefined && tc - lastOn > 0.1) return null
    return { x: xOf(p, tc), y: yOf(p, tc), extrapS: lastOn !== undefined ? Math.max(0, tc - lastOn) : 0 }
  })()

  // ---------- toss-drop (§3.5) ----------
  if (want('toss-drop')) {
    const id: MetricId = 'toss-drop'
    const why = apexUnavailable() ?? contactReason() ?? (!timeOk ? 'TIME_BASE_UNKNOWN' : null)
    if (why) set(id, unavailable(id, why, 'free fall from apex to contact'))
    else {
      const dt = tc! - apex!.tReal
      const drop = 0.5 * G * dt * Math.abs(dt) * 100
      const sDt = Math.hypot(sigmaTc, apex!.uncertaintyS)
      const sr = G * Math.abs(dt) * sDt * 100
      const shared = 2 * Math.abs(drop) * ctx.timeScaleRelSigma
      const sig = { r: sr, leak: 0, shared }
      res.sigmas[id] = sig
      res.raw.dropCm = drop
      const downs: Downgrade[] = [...commonDown]
      if (core.contactWristOnly) downs.push({ cap: 'experimental', reason: 'CONTACT_NOT_FOUND' })
      if (tossTime === 'fitted-above') downs.push({ cap: 'estimated', reason: 'APEX_EXTRAPOLATED' })
      // Image cross-check.
      let info: ReasonCode | undefined
      if (contactBall) {
        const img = (contactBall.y - toss!.apex!.y) * mPerHU * 100
        if (Math.abs(img - drop) > Math.max(6, 0.2 * Math.abs(drop))) info = 'SCALE_INCONSISTENT'
      }
      const o1 = plaus('apexToContactSignedS', dt, (v) => !inRange(v, PLAUSIBILITY.apexToContactSignedS.hard), (v) => !inRange(v, PLAUSIBILITY.apexToContactSignedS.soft))
      const o2 = plaus('dropM', drop / 100, (v) => v > PLAUSIBILITY.dropM.hardAbove, (v) => v < PLAUSIBILITY.dropM.softBelow || v > PLAUSIBILITY.dropM.softAbove)
      const outcome = o1 === 'hard-reject' || o2 === 'hard-reject' ? 'hard-reject' : o1 === 'soft-flag' || o2 === 'soft-flag' ? 'soft-flag' : 'ok'
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: Math.round(drop),
              confidence: Math.min(apex!.confidence, contact!.confidence),
              basis: 'free fall from the toss apex to contact (½·g·t²); scale-free',
              uncertainty: ci(drop, sig),
              secondary: { timeMs: Math.round(dt * 1000), ...(dt < 0 ? { observation: 'contact on the rise' } : drop < 10 ? { observation: 'very low toss' } : {}) },
              sigmaRandom: sig.r,
              sigmaLeak: 0,
              sigmaShared: sig.shared,
              downgrades: downs,
              infoReason: info,
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }

  // ---------- contact-height-ratio (§3.8) ----------
  let contactRatio: number | undefined
  if (want('contact-height-ratio')) {
    const id: MetricId = 'contact-height-ratio'
    const tilt = tiltDowngrades(id, ctx)
    const why = !fpsOk ? 'FPS_TOO_LOW' : contactReason() ?? (!contactBall ? 'CONTACT_NOT_FOUND' : null)
    if (why) set(id, unavailable(id, why, 'toss parabola at the fused contact time'))
    else if (tilt.unavailable) set(id, unavailable(id, tilt.unavailable, 'toss parabola at the fused contact time'))
    else {
      const raw = heightOf(ref, contactBall!.y)
      const ratio = depthCorrect(raw, rH, contactPrior.mean, D)
      contactRatio = ratio
      const vy = Math.abs(2 * p!.a * tc! + p!.b) / bh
      const sr = Math.hypot(vy * sigmaTc, (toss?.fit?.rmse ?? 0) / bh)
      const leak = (Math.abs(ratio - rH) * 0.15) / D
      const shared = Math.hypot(0.005, bodyRel.s * ratio, 0.005 * ratio * pitchSigmaDeg, bodyRel.p * ratio, (Math.abs(ratio - rH) * contactPrior.sigma) / D)
      const sig = { r: sr, leak, shared }
      res.sigmas[id] = sig
      res.raw.contactRatio = ratio
      res.raw.contactCm = ratio * H * 100
      const downs: Downgrade[] = [...commonDown, ...tilt.downgrades, ...nearDown]
      if (contactBall!.extrapS > 0.05) downs.push({ cap: 'experimental', reason: 'CONTACT_NOT_FOUND' })
      const outcome = plaus('contactHeightRatio', ratio, (v) => !inRange(v, PLAUSIBILITY.contactHeightRatio.hard), (v) => !inRange(v, PLAUSIBILITY.contactHeightRatio.soft))
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: r2(ratio),
              confidence: contact!.confidence,
              basis: `ball on its toss path at the contact time (${contact!.method}); scale from your height`,
              uncertainty: ci(ratio, sig),
              secondary: ctx.heightEntered ? { cm: Math.round(ratio * H * 100), rawRatio: r2(raw) } : { rawRatio: r2(raw) },
              sigmaRandom: sig.r,
              sigmaLeak: sig.leak,
              sigmaShared: sig.shared,
              downgrades: downs,
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }
  // Apex below contact height − 0.10 m: hard reject of the apex (an apex cannot be below a later point).
  if (apexRatio !== undefined && contactRatio !== undefined && apexRatio * H < contactRatio * H - PLAUSIBILITY.apexHeightM.hardBelowContactMinusM) {
    res.hardRejects.push('apexHeightM')
    const m = M['toss-apex-height']
    if (m) set('toss-apex-height', unavailable('toss-apex-height', 'IMPLAUSIBLE_VALUE', m.basis, { plausibility: 'hard-reject' }))
  }

  // ---------- forward / lateral positions (§3.3, §3.4, §3.10) ----------
  const s0 = core.s0
  const posUnavailable = (): ReasonCode | null => {
    if (!s0) return core.frontFootShare > 0 && core.frontFoot === null ? 'ROLE_AMBIGUOUS' : 'FEET_NOT_VISIBLE'
    if (!ctx.heightEntered) return 'PLAYER_HEIGHT_MISSING'
    return null
  }
  const dirSign = ctx.view === 'rear' ? (ctx.cameraSide === 'back' ? -1 : 1) * (core.handedness === 'right' ? 1 : -1) : core.netDir
  const toPPF = (x: number) => dirSign * (x - (s0?.x ?? 0.5)) * aspect * mPerHU
  const uPP = toPPF(0.5)
  const forwardCm = (id: 'toss-forward' | 'toss-lateral' | 'contact-forward', x: number, prior: { mean: number; sigma: number }, extraR = 0) => {
    const u = toPPF(x)
    const uc = depthCorrect(u, uPP, prior.mean, D)
    const toeR = 0.021 * H
    const sig = {
      r: Math.hypot(toeR, extraR) * 100,
      leak: ((Math.abs(u - uPP) * (id === 'toss-lateral' ? 0.2 : 0.15)) / D) * 100,
      shared: Math.hypot(0.015 * Math.abs(uc), 0.015 * H, 0.025 * Math.abs(uc), 0.012 * Math.abs(uc), (Math.abs(u - uPP) * prior.sigma) / D) * 100,
    }
    return { cm: uc * 100, sig }
  }
  if (want('toss-forward') || want('toss-lateral')) {
    const id: 'toss-forward' | 'toss-lateral' = ctx.view === 'rear' ? 'toss-lateral' : 'toss-forward'
    const tilt = tiltDowngrades(id, ctx)
    const why = apexUnavailable() ?? posUnavailable()
    if (why) set(id, unavailable(id, why, 'ball apex vs your start toe'))
    else if (tilt.unavailable) set(id, unavailable(id, tilt.unavailable, 'ball apex vs your start toe'))
    else {
      const { cm, sig } = forwardCm(id, toss!.apex!.x, tossPrior)
      res.sigmas[id] = sig
      if (id === 'toss-forward') res.raw.forwardCm = cm
      else res.raw.lateralCm = cm
      const downs: Downgrade[] = [...commonDown, ...tilt.downgrades]
      if (tossTime === 'fitted-above') downs.push({ cap: 'estimated', reason: 'APEX_EXTRAPOLATED' })
      const outcome = id === 'toss-forward' ? plaus('tossForwardM', cm / 100, (v) => !inRange(v, PLAUSIBILITY.tossForwardM.hard), (v) => !inRange(v, PLAUSIBILITY.tossForwardM.soft)) : 'ok'
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: Math.round(cm),
              confidence: Math.min(toss!.apex!.confidence, core.frontFootShare),
              basis: id === 'toss-forward' ? 'ball apex in front of your front toe at release; scale from your height' : 'ball apex left–right of your front toe; scale from your height',
              uncertainty: ci(cm, sig),
              sigmaRandom: sig.r,
              sigmaLeak: sig.leak,
              sigmaShared: sig.shared,
              downgrades: downs,
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }
  if (want('contact-forward')) {
    const id: MetricId = 'contact-forward'
    const tilt = tiltDowngrades(id, ctx)
    const why = contactReason() ?? (!contactBall ? 'CONTACT_NOT_FOUND' : null) ?? posUnavailable()
    if (why) set(id, unavailable(id, why, 'ball at contact vs your start toe'))
    else if (tilt.unavailable) set(id, unavailable(id, tilt.unavailable, 'ball at contact vs your start toe'))
    else {
      const vx = Math.abs(2 * p!.xa * tc! + p!.xb) * aspect * mPerHU
      const { cm, sig } = forwardCm(id, contactBall!.x, contactPrior, vx * sigmaTc)
      res.sigmas[id] = sig
      res.raw.contactForwardCm = cm
      const downs: Downgrade[] = [...commonDown, ...tilt.downgrades]
      if (contactBall!.extrapS > 0.05) downs.push({ cap: 'experimental', reason: 'CONTACT_NOT_FOUND' })
      const outcome = plaus('contactForwardM', cm / 100, (v) => !inRange(v, PLAUSIBILITY.contactForwardM.hard), (v) => !inRange(v, PLAUSIBILITY.contactForwardM.soft))
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: Math.round(cm),
              confidence: Math.min(contact!.confidence, core.frontFootShare),
              basis: 'ball at contact in front of your front toe at release; scale from your height',
              uncertainty: ci(cm, sig),
              sigmaRandom: sig.r,
              sigmaLeak: sig.leak,
              sigmaShared: sig.shared,
              downgrades: downs,
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }

  // ---------- rhythm-release-to-contact (§3.11) ----------
  if (want('rhythm-release-to-contact')) {
    const id: MetricId = 'rhythm-release-to-contact'
    const why = !fpsOk ? 'FPS_TOO_LOW' : !timeOk ? 'TIME_BASE_UNKNOWN' : !release || release.confidence < 0.5 ? (toss ? 'RELEASE_NOT_FOUND' : 'BALL_NOT_TRACKED') : contactReason()
    if (why || !release) set(id, unavailable(id, why ?? 'RELEASE_NOT_FOUND', 'toss release to contact'))
    else {
      const T = (tc! - release.tReal) * 1000
      const sig = { r: Math.hypot(release.uncertaintyS, sigmaTc) * 1000, leak: 0, shared: T * ctx.timeScaleRelSigma }
      res.sigmas[id] = sig
      res.raw.rhythmMs = T
      const downs: Downgrade[] = [...commonDown]
      if (core.contactWristOnly) downs.push({ cap: 'experimental', reason: 'CONTACT_NOT_FOUND' })
      // Below 45 fps the toss release is not resolved (30 fps corpus MAE 82 ms): experimental.
      if (ctx.captureFps < 45) downs.push({ cap: 'experimental', reason: 'FPS_TOO_LOW' })
      const outcome = plaus('releaseToContactS', T / 1000, (v) => !inRange(v, PLAUSIBILITY.releaseToContactS.hard), (v) => !inRange(v, PLAUSIBILITY.releaseToContactS.soft))
      if (apex) plaus('releaseToApexS', apex.tReal - release.tReal, (v) => !inRange(v, PLAUSIBILITY.releaseToApexS.hard), (v) => !inRange(v, PLAUSIBILITY.releaseToApexS.soft))
      const secondary: Record<string, number> = {}
      if (e.trophy?.method === 'pelvis-min') {
        secondary.loadingMs = Math.round((e.trophy.event.tReal - release.tReal) * 1000)
        secondary.driveMs = Math.round((tc! - e.trophy.event.tReal) * 1000)
      }
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: Math.round(T),
              confidence: Math.min(release.confidence, contact!.confidence),
              basis: `toss release (${release.method}) to contact (${contact!.method})`,
              uncertainty: ci(T, sig),
              secondary,
              sigmaRandom: sig.r,
              sigmaLeak: 0,
              sigmaShared: sig.shared,
              downgrades: downs,
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }

  // ---------- lower body: leg drive, drive time, loading depth (§3.27–§3.29) ----------
  const trophy = e.trophy
  const hipH = (i: number) => {
    const m = midHip(track, i, 0.5)
    return m ? heightOf(ref, m.y) : null
  }
  const hw = velocityHalfWindow(track)
  const lowerWhy = (): ReasonCode | null => {
    if (!fpsOk) return 'FPS_TOO_LOW'
    if (!release) return toss ? 'RELEASE_NOT_FOUND' : 'BALL_NOT_TRACKED'
    const cr = contactReason()
    if (cr) return cr
    if (!trophy) return 'OCCLUDED'
    if (!trackingOk) return 'POSE_LOW_QUALITY'
    return null
  }
  let hContact: number | null = null
  if (trophy && tc !== undefined) hContact = localQuadratic(track, hipH, tc, hw)?.value ?? null
  if (want('leg-drive')) {
    const id: MetricId = 'leg-drive'
    const why = lowerWhy() ?? (hContact === null ? 'OCCLUDED' : null)
    if (why) set(id, unavailable(id, why, 'mid-hip rise from its lowest point to contact'))
    else {
      const pct = 100 * (hContact! - trophy!.lowH)
      const vHip = Math.abs(localQuadratic(track, hipH, tc!, hw)?.slope ?? 0)
      const sig = { r: 100 * Math.hypot(Math.SQRT2 * 0.02, vHip * sigmaTc), leak: 0, shared: 1.5 }
      res.sigmas[id] = sig
      res.raw.legDrivePct = pct
      // Peak upward hip speed between the low point and contact (experimental secondary).
      let peak = 0
      for (const i of rangeIdx(track, trophy!.lowT, tc!)) {
        const f = localQuadratic(track, hipH, track.t[i], hw)
        if (f) peak = Math.max(peak, f.slope)
      }
      const downs: Downgrade[] = [...commonDown]
      if (core.contactWristOnly) downs.push({ cap: 'experimental', reason: 'CONTACT_NOT_FOUND' })
      const outcome = plaus('legDrivePctHeight', pct, (v) => !inRange(v, PLAUSIBILITY.legDrivePctHeight.hard), (v) => !inRange(v, PLAUSIBILITY.legDrivePctHeight.soft))
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: Math.round(pct),
              confidence: Math.min(trophy!.event.confidence, contact!.confidence),
              basis: 'mid-hip height from its lowest point after release to contact, as % of your height',
              uncertainty: ci(pct, sig),
              secondary: {
                ...(ctx.heightEntered ? { cm: Math.round((pct / 100) * H * 100) } : {}),
                airborneAtContact: e.landing?.airborneAtContact ? 'yes' : 'no',
                peakHipSpeedMpsExperimental: r2(peak * H),
              },
              sigmaRandom: sig.r,
              sigmaLeak: 0,
              sigmaShared: sig.shared,
              downgrades: downs,
              infoReason: 'BASELINE_BUILDING',
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }
  if (want('drive-time')) {
    const id: MetricId = 'drive-time'
    const why = lowerWhy() ?? (!timeOk ? 'TIME_BASE_UNKNOWN' : trophy!.method !== 'pelvis-min' ? 'POSE_LOW_QUALITY' : null)
    if (why) set(id, unavailable(id, why, 'lowest hip point to contact'))
    else {
      const ms = (tc! - trophy!.event.tReal) * 1000
      const sig = { r: Math.hypot(trophy!.event.uncertaintyS, sigmaTc) * 1000, leak: 0, shared: ms * ctx.timeScaleRelSigma }
      res.sigmas[id] = sig
      res.raw.driveMs = ms
      const outcome = plaus('driveTimeS', ms / 1000, (v) => !inRange(v, PLAUSIBILITY.driveTimeS.hard), (v) => !inRange(v, PLAUSIBILITY.driveTimeS.soft))
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: Math.round(ms / 10) * 10,
              confidence: Math.min(trophy!.event.confidence, contact!.confidence),
              basis: 'time from your lowest hip point to contact',
              uncertainty: ci(ms, sig),
              sigmaRandom: sig.r,
              sigmaLeak: 0,
              sigmaShared: sig.shared,
              downgrades: [...commonDown, ...(core.contactWristOnly ? [{ cap: 'experimental' as const, reason: 'CONTACT_NOT_FOUND' as const }] : [])],
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }
  if (want('loading-depth')) {
    const id: MetricId = 'loading-depth'
    const hRel = release ? localQuadratic(track, hipH, release.tReal, hw)?.value ?? null : null
    const why = lowerWhy() ?? (hRel === null ? 'OCCLUDED' : null)
    if (why) set(id, unavailable(id, why, 'mid-hip dip from release to its lowest point'))
    else {
      const pct = 100 * (hRel! - trophy!.lowH)
      const sig = { r: 100 * Math.SQRT2 * 0.02, leak: 0, shared: 1.5 }
      res.sigmas[id] = sig
      res.raw.loadingPct = pct
      // Hip dips (experimental): local minima of the mid-hip height with prominence ≥ 0.03 BH, ≥ 0.25 s apart.
      let dips = 0
      let lastDip = -Infinity
      const ms0 = e.motionStart?.tReal ?? release!.tReal - 0.8
      const idx = rangeIdx(track, ms0, tc! - 0.08)
      const hs = idx.map((i) => localQuadratic(track, hipH, track.t[i], hw)?.value ?? null)
      for (let k = 1; k < idx.length - 1; k++) {
        const h = hs[k]
        if (h === null || hs[k - 1] === null || hs[k + 1] === null || !(h < hs[k - 1]! && h <= hs[k + 1]!)) continue
        const t = track.t[idx[k]]
        const left = Math.max(...hs.slice(Math.max(0, k - Math.round(0.3 / track.dt)), k).filter((v): v is number => v !== null))
        const right = Math.max(...hs.slice(k + 1, k + 1 + Math.round(0.3 / track.dt)).filter((v): v is number => v !== null))
        if (Math.min(left, right) - h >= Math.max(0.01, 3 * core.noise.hipSd) && t - lastDip >= 0.25) {
          dips++
          lastDip = t
        }
      }
      const outcome = plaus('loadingDepthPctHeight', pct, (v) => !inRange(v, PLAUSIBILITY.loadingDepthPctHeight.hard), (v) => v > PLAUSIBILITY.loadingDepthPctHeight.softAbove)
      set(
        id,
        finalizeMetric(
          id,
          withPlaus(
            {
              value: Math.round(pct),
              confidence: trophy!.event.confidence,
              basis: 'mid-hip dip from toss release to its lowest point, as % of your height (a description, never a target)',
              uncertainty: ci(pct, sig),
              secondary: { ...(ctx.heightEntered ? { cm: Math.round((pct / 100) * H * 100) } : {}), hipDipCountExperimental: dips },
              sigmaRandom: sig.r,
              sigmaLeak: 0,
              sigmaShared: sig.shared,
              downgrades: commonDown,
            },
            outcome,
          ),
          ctx.condition,
        ),
      )
    }
  }

  // ---------- deep-bend-flag (§3.30, experimental) ----------
  if (want('deep-bend-flag')) {
    const id: MetricId = 'deep-bend-flag'
    const tilt = tiltDowngrades(id, ctx)
    const why = lowerWhy() ?? (!core.frontFoot ? 'ROLE_AMBIGUOUS' : null)
    if (why) set(id, unavailable(id, why, 'front-leg segment heights at the trophy'))
    else if (tilt.unavailable) set(id, unavailable(id, tilt.unavailable, 'front-leg segment heights at the trophy'))
    else {
      const side = core.frontFoot!
      const hip = side === 'left' ? LM.LEFT_HIP : LM.RIGHT_HIP
      const knee = side === 'left' ? LM.LEFT_KNEE : LM.RIGHT_KNEE
      const ankle = side === 'left' ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE
      const seg = (i: number, a: number, b: number) => {
        const pa = pt(track, i, a, 0.5)
        const pb = pt(track, i, b, 0.5)
        return pa && pb ? { len: Math.hypot((pa.x - pb.x) * aspect, pa.y - pb.y), dy: Math.abs(pa.y - pb.y) } : null
      }
      const setupIdx = rangeIdx(track, e.setupStart?.tReal ?? core.window.start, e.motionStart?.tReal ?? release!.tReal - 0.5)
      const lt = setupIdx.map((i) => seg(i, hip, knee)?.len).filter((v): v is number => v !== undefined).sort((a, b) => a - b)
      const ls = setupIdx.map((i) => seg(i, knee, ankle)?.len).filter((v): v is number => v !== undefined).sort((a, b) => a - b)
      const et = medianAround(track, trophy!.lowT, (i) => seg(i, hip, knee)?.dy ?? null)
      const es = medianAround(track, trophy!.lowT, (i) => seg(i, knee, ankle)?.dy ?? null)
      if (lt.length < 5 || ls.length < 5 || et === null || es === null) set(id, unavailable(id, 'OCCLUDED', 'front-leg segment heights at the trophy'))
      else {
        const Lt = lt[Math.floor(lt.length * 0.75)]
        const Ls = ls[Math.floor(ls.length * 0.75)]
        const theta = ((Math.acos(Math.min(1, et / Lt)) + Math.acos(Math.min(1, es / Ls))) * 180) / Math.PI
        const pDeep = 1 - bandProbabilities(theta, 11.5, [45, 45]).probabilities.low
        const flag = pDeep >= 0.7
        set(
          id,
          finalizeMetric(
            id,
            {
              value: flag ? 'yes' : 'no',
              flag,
              confidence: trophy!.event.confidence,
              basis: 'front-leg thigh and shin heights at the lowest hip point vs their standing lengths (experimental; never "little bend")',
              secondary: { probabilityDeep: r2(pDeep) },
              downgrades: [...commonDown, ...tilt.downgrades],
            },
            ctx.condition,
          ),
        )
      }
    }
  }

  // ---------- shoulder-tilt-trophy (§3.15) ----------
  if (want('shoulder-tilt-trophy')) {
    const id: MetricId = 'shoulder-tilt-trophy'
    const tilt = tiltDowngrades(id, ctx)
    const why = lowerWhy()
    if (why) set(id, unavailable(id, why, 'shoulder line at the trophy position'))
    else if (tilt.unavailable) set(id, unavailable(id, tilt.unavailable, 'shoulder line at the trophy position'))
    else {
      const phi = medianAround(track, trophy!.lowT, (i) => {
        const l = pt(track, i, LM.LEFT_SHOULDER, 0.5)
        const r = pt(track, i, LM.RIGHT_SHOULDER, 0.5)
        if (!l || !r) return null
        const [F, B] = core.netDir * l.x > core.netDir * r.x ? [l, r] : [r, l]
        if ((Math.abs(F.x - B.x) * aspect) / bh < 0.05) return null
        return (Math.atan2(B.y - F.y, core.netDir * (F.x - B.x) * aspect) * 180) / Math.PI
      })
      if (phi === null) set(id, unavailable(id, 'ROLE_AMBIGUOUS', 'shoulder line at the trophy position'))
      else {
        res.raw.shoulderTiltDeg = phi
        set(
          id,
          finalizeMetric(
            id,
            {
              value: null,
              confidence: trophy!.event.confidence,
              basis: 'shoulder line at the lowest hip point, compared only with your own range (never shown in degrees)',
              bandBasis: 'player-relative',
              downgrades: [...commonDown, ...tilt.downgrades],
              infoReason: 'BASELINE_BUILDING',
            },
            ctx.condition,
          ),
        )
      }
    }
  }

  // ---------- rear bands (§3.14, §3.31) ----------
  if (want('knee-bend-band')) {
    const id: MetricId = 'knee-bend-band'
    const why = lowerWhy()
    if (why) set(id, unavailable(id, why, 'nearer knee at the trophy (rear view)'))
    else {
      const la = medianAround(track, trophy!.lowT, (i) => pt(track, i, LM.LEFT_ANKLE, 0.6)?.y ?? null)
      const ra = medianAround(track, trophy!.lowT, (i) => pt(track, i, LM.RIGHT_ANKLE, 0.6)?.y ?? null)
      if (la === null || ra === null) set(id, unavailable(id, 'OCCLUDED', 'nearer knee at the trophy (rear view)'))
      else if (Math.abs(la - ra) / bh < 0.02) {
        set(id, finalizeMetric(id, { value: 'unclear', band: 'unclear', bandBasis: 'fixed-geometric', confidence: 0.5, basis: 'ankles level: the nearer knee is ambiguous', downgrades: commonDown, infoReason: 'ROLE_AMBIGUOUS' }, ctx.condition))
      } else {
        const side = la > ra ? 'left' : 'right'
        const theta = medianAround(track, trophy!.lowT, (i) => {
          const lms = landmarksAt(track, i)
          return lms ? kneeFlexionDeg(lms, side, aspect, 0.6) : null
        })
        if (theta === null) set(id, unavailable(id, 'OCCLUDED', 'nearer knee at the trophy (rear view)'))
        else {
          res.raw.kneeDeg = theta
          const bp = bandProbabilities(theta, 6.5, [20, 45])
          set(
            id,
            finalizeMetric(
              id,
              {
                value: bp.band,
                band: bp.band,
                bandBasis: 'fixed-geometric',
                bandProbabilities: bp.probabilities,
                confidence: trophy!.event.confidence,
                basis: 'nearer (back) knee at the lowest hip point, rear view; no degrees are shown',
                downgrades: commonDown,
              },
              ctx.condition,
            ),
          )
        }
      }
    }
  }
  if (want('shoulder-over-shoulder-contact')) {
    const id: MetricId = 'shoulder-over-shoulder-contact'
    const why = contactReason() ?? (!trackingOk ? 'POSE_LOW_QUALITY' : null)
    if (why) set(id, unavailable(id, why, 'shoulder line at contact (rear view)'))
    else {
      const hitDir = dirSign
      const hs = core.hitWrist === 'left' ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER
      const ts = core.hitWrist === 'left' ? LM.RIGHT_SHOULDER : LM.LEFT_SHOULDER
      const i0 = indexAt(track, tc!)
      const vals: number[] = []
      for (let i = Math.max(0, i0 - 1); i <= Math.min(track.t.length - 1, i0 + 1); i++) {
        const h = pt(track, i, hs, 0.5)
        const t = pt(track, i, ts, 0.5)
        if (h && t) vals.push((Math.atan2(t.y - h.y, hitDir * (h.x - t.x) * aspect) * 180) / Math.PI)
      }
      if (!vals.length) set(id, unavailable(id, 'OCCLUDED', 'shoulder line at contact (rear view)'))
      else {
        vals.sort((a, b) => a - b)
        res.raw.sosDeg = vals[vals.length >> 1]
        set(
          id,
          finalizeMetric(
            id,
            { value: null, bandBasis: 'player-relative', confidence: contact!.confidence, basis: 'shoulder line at contact, rear view, against your own range', downgrades: commonDown, infoReason: 'BASELINE_BUILDING' },
            ctx.condition,
          ),
        )
      }
    }
  }

  // ---------- trophy-pause (§3.13, experimental) ----------
  if (want('trophy-pause')) {
    const id: MetricId = 'trophy-pause'
    const why = ctx.captureFps < 60 ? 'FPS_TOO_LOW' : lowerWhy() ?? (trophy!.method !== 'pelvis-min' ? 'POSE_LOW_QUALITY' : !timeOk ? 'TIME_BASE_UNKNOWN' : null)
    if (why) set(id, unavailable(id, why, 'still period at the top'))
    else {
      const hitW = (i: number) => pt(track, i, WRIST[core.hitWrist], 0.5)
      const tossW = (i: number) => pt(track, i, WRIST[core.tossWrist], 0.5)
      const still = (t: number) => {
        const hipV = Math.abs(localQuadratic(track, hipH, t, hw)?.slope ?? Infinity)
        const hv = pointSpeed(track, hitW, t, hw, bh) ?? Infinity
        const tv = pointSpeed(track, tossW, t, hw, bh) ?? Infinity
        const nz = core.noise
        return hipV < Math.max(PAUSE_THRESHOLDS.hipFloor, 3 * nz.hipSpeed) && hv < Math.max(PAUSE_THRESHOLDS.wristFloor, 3 * nz.wristSpeed) && tv < Math.max(PAUSE_THRESHOLDS.wristFloor, 3 * nz.wristSpeed)
      }
      const idx = rangeIdx(track, release!.tReal, tc! - 0.08)
      const k0 = idx.findIndex((i) => track.t[i] >= trophy!.event.tReal)
      let pause = 0
      if (k0 >= 0 && still(track.t[idx[k0]])) {
        let a = k0
        let b = k0
        while (a > 0 && still(track.t[idx[a - 1]])) a--
        while (b < idx.length - 1 && still(track.t[idx[b + 1]])) b++
        pause = (track.t[idx[b]] - track.t[idx[a]] + track.dt) * 1000
      }
      res.raw.pauseMs = pause
      const s = 2 * track.dt * 1000 + 40
      set(
        id,
        finalizeMetric(
          id,
          {
            value: Math.round(pause / 10) * 10,
            confidence: trophy!.event.confidence * 0.7,
            basis: 'hips and both hands still around the lowest hip point (experimental thresholds)',
            uncertainty: { kind: 'range', low: Math.max(0, pause - s), high: pause + s },
            downgrades: [...commonDown, { cap: 'experimental', reason: 'VALIDATION_PENDING' }],
          },
          ctx.condition,
        ),
      )
    }
  }

  // ---------- landing-distance (§3.16) ----------
  if (want('landing-distance')) {
    const id: MetricId = 'landing-distance'
    const tilt = tiltDowngrades(id, ctx)
    const land = e.landing
    const why = lowerWhy() ?? (!land || land.event.confidence < 0.5 ? 'LANDING_NOT_FOUND' : posUnavailable())
    if (why) set(id, unavailable(id, why, 'landing toe vs your start toe'))
    else if (tilt.unavailable) set(id, unavailable(id, tilt.unavailable, 'landing toe vs your start toe'))
    else {
      const foot: WristSide = land!.foot === 'left' || land!.foot === 'right' ? land!.foot : core.frontFoot ?? 'left'
      const i0 = indexAt(track, land!.event.tReal + 2 * track.dt)
      const xs: number[] = []
      for (let i = i0; i <= Math.min(track.t.length - 1, i0 + 2); i++) {
        const q = pt(track, i, FOOT_TOE[foot], 0.5)
        if (q) xs.push(q.x)
      }
      if (!xs.length) set(id, unavailable(id, 'FEET_NOT_VISIBLE', 'landing toe vs your start toe'))
      else {
        xs.sort((a, b) => a - b)
        const u = toPPF(xs[xs.length >> 1]) * 100
        const sig = { r: Math.hypot(0.021, 0.021) * H * 100, leak: 0, shared: Math.hypot(0.015 * Math.abs(u), 0.015 * H * 100) }
        res.sigmas[id] = sig
        res.raw.landingCm = u
        const outcome = plaus('landingM', u / 100, (v) => !inRange(v, PLAUSIBILITY.landingM.hard), (v) => !inRange(v, PLAUSIBILITY.landingM.soft))
        set(
          id,
          finalizeMetric(
            id,
            withPlaus(
              {
                value: Math.round(u),
                confidence: Math.min(land!.event.confidence, core.frontFootShare),
                basis: `where your ${foot === core.frontFoot ? 'front' : 'back'} foot landed, from your front toe at release (trend only)`,
                uncertainty: ci(u, sig),
                secondary: { pctHeight: Math.round(u / H), foot: foot === core.frontFoot ? 'front' : 'back' },
                sigmaRandom: sig.r,
                sigmaLeak: 0,
                sigmaShared: sig.shared,
                downgrades: [...commonDown, ...tilt.downgrades],
              },
              outcome,
            ),
            ctx.condition,
          ),
        )
      }
    }
  }

  // ---------- speed (§3.22, §3.32) ----------
  if (want('speed-experimental')) {
    const id: MetricId = 'speed-experimental'
    const why: ReasonCode | null =
      ctx.captureFps < 120
        ? 'FPS_TOO_LOW'
        : ctx.timeBase !== 'proven'
          ? 'TIME_BASE_UNKNOWN'
          : !ctx.heightEntered
            ? 'PLAYER_HEIGHT_MISSING'
            : !ctx.targetTag
              ? 'TARGET_NOT_TAGGED'
              : contactReason() ?? (!core.ball.outgoing ? 'BALL_NOT_TRACKED' : null)
    if (why) set(id, unavailable(id, why, 'ball track just after contact (side view)', { quantity: 'launch-speed' }))
    else {
      const est = estimateServeSpeedFromTrack(core.ball.outgoing!, {
        contactTReal: tc!,
        captureFps: ctx.captureFps,
        aspect,
        scale: scaleFromBodyHeight(bh, 0.03, H),
        cameraView: 'side',
        targetTag: ctx.targetTag,
        focalLengthFhu: ctx.cam.fHU,
      })
      if (est.status === 'unavailable') set(id, unavailable(id, 'BALL_NOT_TRACKED', est.reason, { quantity: 'launch-speed' }))
      else {
        const mid = (est.lowKmh + est.highKmh) / 2
        if ((est.highKmh - est.lowKmh) / mid > 0.35) set(id, unavailable(id, 'RANGE_TOO_WIDE', est.basis, { quantity: 'launch-speed' }))
        else {
          const outcome = plaus('launchSpeedKmh', mid, (v) => !inRange(v, PLAUSIBILITY.launchSpeedKmh.hard), (v) => !inRange(v, PLAUSIBILITY.launchSpeedKmh.soft))
          set(
            id,
            finalizeMetric(
              id,
              withPlaus(
                {
                  value: `${est.lowKmh}–${est.highKmh}`,
                  quantity: 'launch-speed',
                  confidence: est.confidence,
                  basis: `launch speed just after contact (experimental range): ${est.basis}`,
                  uncertainty: { kind: 'range', low: est.lowKmh, high: est.highKmh },
                  downgrades: [{ cap: 'experimental', reason: 'VALIDATION_PENDING' }],
                },
                outcome,
              ),
              ctx.condition,
            ),
          )
        }
      }
    }
  }
  if (want('speed-average-rear')) set('speed-average-rear', unavailable('speed-average-rear', 'NEEDS_CALIBRATION', 'contact to the bounce located in the rear view', { quantity: 'average-speed' }))

  // View evidence (§2.3.7): outgoing ball mainly horizontal in the side view.
  const out = core.ball.outgoing?.observations.filter((o) => o.source !== 'predicted') ?? []
  if (out.length >= 2) {
    const dx = (out[out.length - 1].x - out[0].x) * aspect
    const dy = out[out.length - 1].y - out[0].y
    res.viewEvidence = { outgoingHorizontal: Math.abs(dx) > 2 * Math.abs(dy) }
  }
  return res
}

