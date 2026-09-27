/**
 * One serve window → events, roles, frame of reference and classification (METRICS §2.3–§2.6).
 * The result (`ServeCore`) is the input of the per-serve metric layer.
 */
import { LM, type AudioOnset, type BallObservation, type BallTrack, type EventEstimate, type Handedness } from '../types.ts'
import type { TossAnalysis } from '../ball/toss.ts'
import { trackingQuality } from '../pose/body.ts'
import { analyseServeBall, ballBracketContact, ballIntersectionContact, xOf, yOf, type ContactMethod, type ServeBall } from './ball.ts'
import {
  asEvent,
  detectLanding,
  detectLandingRear,
  detectMotionStart,
  detectRecoveryEnd,
  detectSetupStart,
  detectTrophy,
  eventAt,
  floorRow,
  fuseEvent,
  measureNoise,
  PLANNING_NOISE,
  heightOf,
  hittingWristAt,
  releaseFromHand,
  swingPeakTime,
  wristApex,
  ARM_UP_BH,
  FOOT_TOE,
  WRIST,
  type FusedEvent,
  type LandingResult,
  type MethodEstimate,
  type NoiseProfile,
  type Reference,
  type TrophyResult,
  type WristSide,
} from './events.ts'
import type { CameraModel } from './geometry.ts'
import { relabelSides, type RelabelReport } from './relabel.ts'
import { headTopY, indexAt, landmarksAt, midHip, midShoulder, pt, rangeIdx, type PoseTrack } from './track.ts'

export const SPEED_OF_SOUND_MPS = 343
/** Calibrated bias terms (initial 0; see validation/results/metrics/SUMMARY.md). */
export const CALIBRATION = {
  /** β_occ: ball-bracket bias (s), calibrated on development seeds s1–s3 (+3.9 ms observed). */
  bracketBiasS: -0.004,
  /** β_w: wrist-apex bias (s), development seeds (−7.4 ms observed). */
  wristBiasS: 0.0074,
  /**
   * Release: the ball hinge fit reads the start of free flight ~12 ms before the hand opens on the
   * synthetic hand model (development seeds; the ball layer reports 8–29 ms). Applied at ≥ 45 fps
   * only; its σ floor (25 ms) stays, because real hands may differ.
   */
  releaseBallBiasS: 0.0125,
  /** Hand separation crosses its 0.06 BH threshold ~60 ms after the release (development seeds). */
  releaseHandLagS: 0.06,
  /** Below this capture rate the hinge fit is unreliable (30 fps: MAE 82 ms on the corpus). */
  releaseMinFps: 45,
  /** Release σ floor below releaseMinFps (s). */
  releaseLowFpsSigmaS: 0.1,
  /**
   * Audio–video offset σ without per-session calibration (s). METRICS §2.4.5 plans 8 ms [inference];
   * phone recordings and edited imports can carry a steady offset of 20–50 ms, which against an 8 ms σ
   * made the D2 check dispute every serve (and pulled contact towards the sound where the ball's
   * method is weak). 20 ms [Our inference: device and container audio–video skew] until the offset is
   * calibrated from the session's own serves (engine.ts, AUDIO_CALIBRATION).
   */
  audioVideoSigmaS: 0.02,
}

/**
 * Session audio–video offset calibration (METRICS §2.4.5): with ≥ 3 serves that have both a hit-sound
 * contact and a `ball-intersection` at ≥ 120 fps, the offset is the median of (t_audio − D/c − t_ball)
 * and σ_AV their scaled median absolute deviation (floor 2 ms). Each serve is judged against the
 * OTHER serves' pairs, so one stray sound still disagrees. An offset beyond ±0.12 s means onset
 * matching picked the wrong transient: no calibration.
 */
export const AUDIO_CALIBRATION = { minPairs: 3, minFps: 120, minOtherPairs: 2, maxOffsetS: 0.12, sigmaFloorS: 0.002 }

export type ServeClass = 'serve' | 'retoss' | 'shadow' | 'other'

/**
 * Fused-event check for contact (DECISIONS D2 addendum, 2026-09-28). The independent timing signals
 * are the ball (intersection and bracket, one signal: both read the same toss track), the hit sound
 * (opt-in) and the hitting wrist's swing peak found on its own, not around the other estimates.
 * Two signals disagree when they are further apart than DISPUTE_K × their combined σ (and at least
 * a frame). Then:
 *   - 'majority': three signals, one disagrees with the two others, which agree: contact is fused
 *     from the agreeing two, and every value that depends on contact is capped at experimental;
 *   - 'spread':   three signals, one pair disagrees, the third agrees with both: contact is fused
 *     from all three (σ inflated by the spread), dependent values capped at experimental;
 *   - 'ball-observed': two signals disagree and one is the ball seen LEAVING on an outgoing track that
 *     meets the toss path (ball-intersection, or a bracket closed by an outgoing detection): the
 *     departure itself was observed, so contact comes from the ball, but dependent values are capped
 *     at experimental (the other signal still disagrees);
 *   - 'unresolved': any other disagreement (two signals, or three that all disagree), e.g. a ball that
 *     only vanished from its path against the swing peak: nothing can say which is right, so contact
 *     keeps its time for the key frame but its confidence drops below 0.5 and its σ covers the
 *     spread, and every dependent value is withheld (CONTACT_NOT_FOUND).
 * A single wrong event (a toss track cut short, a mistimed wrist, a stray sound) therefore never
 * produces a confident-looking `estimated` value.
 */
export interface ContactDispute {
  resolution: 'majority' | 'spread' | 'ball-observed' | 'unresolved'
  signals: { name: 'ball' | 'audio' | 'wrist'; t: number; sigma: number }[]
  /** The signal left out ('majority', 'ball-observed'). */
  dropped?: 'ball' | 'audio' | 'wrist'
  /** Largest pairwise disagreement (s). */
  spreadS: number
}

/** Pairwise gate of the fused-event check, in combined σ (the generic fusion gate, §2.4). */
export const DISPUTE_K = 3
/** The hitting wrist's swing peak is searched from this long before the toss apex (contact on the rise) … */
export const SWING_BEFORE_APEX_S = 0.35
/** … to this long after it (the classification's window, §2.3.4). */
export const SWING_AFTER_APEX_S = 1.2

export interface ServeCore {
  index: number
  window: { start: number; end: number; anchor: number; confidence: number }
  view: 'side' | 'rear' | 'front45' | 'unknown'
  handedness: Handedness
  ref: Reference | null
  /**
   * Where the standing height H_HU came from: ≥ 5 upright setup frames; the session median of such
   * serves ('fallback', METRICS §1.1); fewer than 5 upright frames and no session value yet ('weak':
   * the engine's second pass replaces it with the session median when one exists); or none.
   */
  refSource: 'setup-upright' | 'fallback' | 'weak' | 'none'
  /** Why no frame of reference was found (ref null): no feet, or no upright frame and no session fallback. */
  refFailure?: 'no-feet' | 'no-upright'
  uprightFrames: number
  netDir: 1 | -1
  ball: ServeBall
  events: {
    setupStart?: EventEstimate
    motionStart?: EventEstimate
    tossRelease?: FusedEvent
    tossApex?: EventEstimate
    trophy?: TrophyResult
    contact?: FusedEvent
    landing?: LandingResult
    recoveryEnd?: EventEstimate
  }
  releaseMethods: MethodEstimate[]
  contactMethods: MethodEstimate[]
  /** Contact from the wrist only (no ball near contact). */
  contactWristOnly: boolean
  /** Set when the independent contact signals disagree (D2 fused-event check). */
  contactDispute?: ContactDispute
  audioContact?: AudioOnset
  /**
   * The hit sound's contact time before any audio–video offset is removed (sound travel removed) and
   * the ball-intersection time, when both exist: one pair for the session's offset calibration
   * (METRICS §2.4.5).
   */
  audioPair?: { audioT: number; ballT: number }
  /** The toss came back to a hand (its last detection within 0.15 BH of a wrist, with no contact evidence): a caught toss (§2.3.4). */
  caughtToss?: boolean
  tossWrist: WristSide
  hitWrist: WristSide
  frontFoot: WristSide | null
  frontFootShare: number
  /** Start toe S0 (rectified normalised). */
  s0: { x: number; y: number } | null
  classification: ServeClass
  noContact: boolean
  relabel: RelabelReport | null
  trackingQuality: number
  cameraDistanceM: number | null
  /** Measured noise in the settled stance (§5.5). */
  noise: NoiseProfile
  /** Per-serve notes (engine-internal, logged in basis). */
  notes: string[]
}

export interface ServeInput {
  index: number
  window: { start: number; end: number; anchor: number; confidence: number }
  track: PoseTrack
  cam: CameraModel
  view: ServeCore['view']
  handedness: Handedness
  netDir: 1 | -1
  playerHeightM: number
  playerHeightEntered: boolean
  tracks: readonly BallTrack[]
  observations: readonly BallObservation[]
  tossResults: readonly TossAnalysis[]
  /** Usable contact onsets (audio on and timing usable), else empty. */
  onsets: readonly AudioOnset[]
  realTime: boolean
  /** Real capture frame rate (the pose rate may be lower). */
  captureFps?: number
  /** Earliest time the setup search may reach back to (the window widened towards setupStart, never past a neighbour, §2.3.2). */
  searchStart?: number
  /** Previous serve's recovery end (setupStart never earlier). */
  previousRecoveryEnd?: number
  /** Session fallback H_HU when this serve has too few upright frames. */
  fallbackBodyHeightHU?: number
  /** Audio–video offset (s) and its σ, when calibrated. */
  audioOffset?: { offsetS: number; sigmaS: number }
}

const tossSideOf = (h: Handedness): WristSide => (h === 'right' ? 'left' : 'right')
const hitSideOf = (h: Handedness): WristSide => (h === 'right' ? 'right' : 'left')

/** Standing height from upright frames in [a, b]: vertical extents, not the 2D knee angle (§1.1). */
export function uprightBodyHeight(track: PoseTrack, a: number, b: number, yFloor: number): { heightHU: number; frames: number } | null {
  const idx = rangeIdx(track, a, b)
  const cands: { i: number; hip: number; lean: number }[] = []
  for (const i of idx) {
    const hip = midHip(track, i, 0.5)
    const sh = midShoulder(track, i, 0.5)
    if (!hip || !sh) continue
    const lean = (Math.abs(Math.atan2((sh.x - hip.x) * track.aspect, hip.y - sh.y)) * 180) / Math.PI
    cands.push({ i, hip: yFloor - hip.y, lean })
  }
  const upright = cands.filter((c) => c.lean <= 25)
  if (!upright.length) return null
  const top = Math.max(...upright.map((c) => c.hip))
  const hs: number[] = []
  for (const c of upright) {
    if (c.hip < 0.97 * top) continue
    const head = headTopY(track, c.i, 0.5)
    if (head !== null && yFloor - head > 0) hs.push(yFloor - head)
  }
  if (hs.length < 5) return hs.length ? { heightHU: hs.sort((p, q) => p - q)[hs.length >> 1], frames: hs.length } : null
  hs.sort((p, q) => p - q)
  return { heightHU: hs[hs.length >> 1], frames: hs.length }
}

function frontFootOver(track: PoseTrack, a: number, b: number, netDir: 1 | -1): { foot: WristSide | null; share: number; s0: { x: number; y: number } | null } {
  const idx = rangeIdx(track, a, b)
  let left = 0
  let right = 0
  for (const i of idx) {
    const l = pt(track, i, LM.LEFT_FOOT_INDEX, 0.5)
    const r = pt(track, i, LM.RIGHT_FOOT_INDEX, 0.5)
    if (!l || !r) continue
    if (netDir * l.x > netDir * r.x) left++
    else right++
  }
  const n = left + right
  if (!n) return { foot: null, share: 0, s0: null }
  const foot: WristSide = left >= right ? 'left' : 'right'
  const share = Math.max(left, right) / n
  if (share < 0.7) return { foot: null, share, s0: null }
  const xs: number[] = []
  const ys: number[] = []
  for (const i of idx) {
    const p = pt(track, i, FOOT_TOE[foot], 0.5)
    if (p) {
      xs.push(p.x)
      ys.push(p.y)
    }
  }
  xs.sort((p, q) => p - q)
  ys.sort((p, q) => p - q)
  return { foot, share, s0: xs.length ? { x: xs[xs.length >> 1], y: ys[ys.length >> 1] } : null }
}

/** Rear view front foot: further from the camera (higher in the picture) at release. */
function frontFootRear(track: PoseTrack, a: number, b: number): { foot: WristSide | null; share: number; s0: { x: number; y: number } | null } {
  const idx = rangeIdx(track, a, b)
  let left = 0
  let right = 0
  for (const i of idx) {
    const l = pt(track, i, LM.LEFT_FOOT_INDEX, 0.5)
    const r = pt(track, i, LM.RIGHT_FOOT_INDEX, 0.5)
    if (!l || !r) continue
    if (l.y < r.y) left++
    else right++
  }
  const n = left + right
  if (!n) return { foot: null, share: 0, s0: null }
  const foot: WristSide = left >= right ? 'left' : 'right'
  const share = Math.max(left, right) / n
  const xs: number[] = []
  const ys: number[] = []
  for (const i of idx) {
    const p = pt(track, i, FOOT_TOE[foot], 0.5)
    if (p) {
      xs.push(p.x)
      ys.push(p.y)
    }
  }
  xs.sort((p, q) => p - q)
  ys.sort((p, q) => p - q)
  return { foot: share >= 0.7 ? foot : null, share, s0: share >= 0.7 && xs.length ? { x: xs[xs.length >> 1], y: ys[ys.length >> 1] } : null }
}

function meanTrackingQuality(track: PoseTrack, a: number, b: number, bodyHeightHU: number | undefined): number {
  const idx = rangeIdx(track, a, b)
  if (!idx.length) return 0
  let s = 0
  for (const i of idx) {
    const lms = landmarksAt(track, i)
    if (!lms) continue
    s += trackingQuality({ frameIndex: track.frameIndex[i], tReal: track.t[i], landmarks: lms, score: 1, source: 'mediapipe' }, { frameAspect: track.aspect, bodyHeightHU }).score
  }
  return s / idx.length
}

/** Ball position at t: the parabola after release, detections before. */
function ballAtFn(ball: ServeBall): (t: number) => { x: number; y: number } | null {
  const p = ball.parabola
  const rel = ball.toss?.release?.tReal
  const obs = ball.tossTrack?.observations ?? []
  return (t: number) => {
    if (p && rel !== undefined && t >= rel) return { x: xOf(p, t), y: yOf(p, t) }
    let best: { x: number; y: number } | null = null
    let bd = Infinity
    for (const o of obs) {
      const d = Math.abs(o.tReal - t)
      if (d < bd && d <= 0.02) {
        bd = d
        best = o
      }
    }
    return best
  }
}

export function analyseServe(input: ServeInput): ServeCore {
  const { track, cam, window } = input
  const notes: string[] = []
  const tossWristAnat = tossSideOf(input.handedness)
  const hitWristAnat = hitSideOf(input.handedness)
  const core: ServeCore = {
    index: input.index,
    window,
    view: input.view,
    handedness: input.handedness,
    ref: null,
    refSource: 'none',
    uprightFrames: 0,
    netDir: input.netDir,
    ball: { toss: null, tossTrack: null, outgoing: null, parabola: null, apexCase: 'none', detections: 0 },
    events: {},
    releaseMethods: [],
    contactMethods: [],
    contactWristOnly: false,
    tossWrist: tossWristAnat,
    hitWrist: hitWristAnat,
    frontFoot: null,
    frontFootShare: 0,
    s0: null,
    classification: 'other',
    noContact: false,
    relabel: null,
    trackingQuality: 0,
    cameraDistanceM: null,
    noise: PLANNING_NOISE,
    notes,
  }

  // 1. Preliminary frame of reference from the settled part before the toss (about the first
  //    40% of the window, up to 1.2 s before the anchor).
  const s0t = Math.min(window.start, input.searchStart ?? window.start)
  const preEnd = Math.min(window.anchor - 1.2, window.start + 0.45 * (window.end - window.start))
  const floor0 = floorRow(track, s0t, Math.max(s0t + 0.3, preEnd)) ?? floorRow(track, s0t, window.end)
  if (!floor0) {
    notes.push('no feet visible in the window')
    core.refFailure = 'no-feet'
    return core
  }
  const upright0 = uprightBodyHeight(track, s0t, Math.max(s0t + 0.3, preEnd), floor0.y)
  let bodyHU = upright0 && upright0.frames >= 5 ? upright0.heightHU : input.fallbackBodyHeightHU ?? upright0?.heightHU
  if (!bodyHU) {
    notes.push('no upright frames and no session fallback for body height')
    core.refFailure = 'no-upright'
    return core
  }
  let ref: Reference = { yFloor: floor0.y, bodyHeightHU: bodyHU }

  // 2. Ball.
  const ball = analyseServeBall({
    cam,
    window: { start: window.start, end: window.end },
    tracks: input.tracks,
    observations: input.observations,
    tossResults: input.tossResults,
    bodyHeightHU: bodyHU,
    playerHeightM: input.playerHeightM,
    playerHeightEntered: input.playerHeightEntered,
    realTime: input.realTime,
  })
  core.ball = ball
  const ballAt = ballAtFn(ball)
  const tossOk = ball.toss?.status === 'ok' && !!ball.toss.release && !!ball.toss.apex

  // 3. Preliminary contact (ball methods, else the higher wrist near the anchor).
  const inter = ballIntersectionContact(ball, cam.aspect)
  const bracket = ballBracketContact(ball, track.dt, CALIBRATION.bracketBiasS)
  const prelimContact = inter?.t ?? bracket?.t ?? window.anchor
  const prelimRelease = tossOk ? ball.toss!.release!.tReal : prelimContact - 1.0

  // 4. Relabel left/right (anatomical) before any per-side series.
  core.relabel = relabelSides(track, {
    handedness: input.handedness,
    netDir: input.view === 'side' ? input.netDir : undefined,
    view: input.view,
    bodyHeightHU: bodyHU,
    toss: { tStart: prelimRelease - 0.35, tEnd: prelimRelease + 0.15, ballAt: tossOk ? ballAt : undefined },
    contactT: prelimContact,
    stance: { tStart: Math.max(s0t, prelimRelease - 1.2), tEnd: prelimRelease + 0.05 },
    from: Math.max(0, indexAt(track, s0t)),
    to: Math.max(0, indexAt(track, window.end)),
  })

  // Geometric roles: the tossing wrist is the one nearest the ball before release.
  if (tossOk) {
    let dL = 0
    let dR = 0
    let n = 0
    for (const i of rangeIdx(track, prelimRelease - 0.15, prelimRelease)) {
      const b = ballAt(track.t[i])
      const l = pt(track, i, LM.LEFT_WRIST, 0.3)
      const r = pt(track, i, LM.RIGHT_WRIST, 0.3)
      if (!b || !l || !r) continue
      dL += Math.hypot((l.x - b.x) * cam.aspect, l.y - b.y)
      dR += Math.hypot((r.x - b.x) * cam.aspect, r.y - b.y)
      n++
    }
    if (n >= 2) core.tossWrist = dL <= dR ? 'left' : 'right'
    if (core.tossWrist !== tossWristAnat) notes.push('tossing wrist by geometry differs from the entered handedness after relabelling')
  }
  core.hitWrist = core.tossWrist === 'left' ? 'right' : 'left'
  // The wrist that held the ball before release. Step 8 re-picks the hitting wrist as the higher one
  // near contact, which for a caught toss is the catching (tossing) hand; the classification's swing
  // test (step 9) uses this one.
  const tossWristAtRelease: WristSide = core.tossWrist

  // 5. Release: ball (hinge fit) + hand separation.
  if (tossOk) {
    const r = ball.toss!.release!
    const fps = 1 / track.dt
    const lowFps = input.captureFps !== undefined ? input.captureFps < CALIBRATION.releaseMinFps : fps < CALIBRATION.releaseMinFps
    core.releaseMethods.push({
      method: r.method,
      t: r.tReal + (lowFps ? 0 : CALIBRATION.releaseBallBiasS),
      sigma: Math.max(r.uncertaintyS, 0.5 * track.dt, lowFps ? CALIBRATION.releaseLowFpsSigmaS : 0),
      q: Math.max(0.05, Math.min(1, ball.toss!.confidence)),
    })
    // The hand method lags the release by ~60 ms on the corpus (the separation threshold is reached
    // after the hand has decelerated); it is kept only as a fallback, lag-corrected, never fused.
    core.events.tossRelease = fuseEvent(core.releaseMethods, track) ?? undefined
    if (!core.events.tossRelease || core.events.tossRelease.confidence < 0.5) {
      const detections = [...(ball.tossTrack?.observations ?? [])].filter((o) => o.source !== 'predicted')
      const hand = releaseFromHand(track, ref, core.tossWrist, detections, r.tReal)
      if (hand) {
        const lagged = { ...hand, t: hand.t - CALIBRATION.releaseHandLagS, sigma: 0.06, q: 0.3 }
        core.releaseMethods.push(lagged)
        core.events.tossRelease = fuseEvent([lagged], track) ?? core.events.tossRelease
      }
    }
  }
  const releaseT = core.events.tossRelease?.tReal

  // 6. Motion start, then the refined frame of reference over [motionStart − 0.5, release].
  if (releaseT !== undefined) {
    core.noise = measureNoise(track, ref, Math.max(s0t, releaseT - 2.0), releaseT - 0.9)
    core.events.motionStart = detectMotionStart(track, ref, core.tossWrist, releaseT, s0t, core.noise)
    const floor1 = floorRow(track, core.events.motionStart.tReal - 0.5, releaseT)
    if (floor1 && floor1.n >= 3) ref = { ...ref, yFloor: floor1.y }
    core.events.setupStart = detectSetupStart(track, ref, core.events.motionStart.tReal, Math.max(s0t, input.previousRecoveryEnd ?? -Infinity))
    const upright1 = uprightBodyHeight(track, Math.min(core.events.setupStart.tReal, core.events.motionStart.tReal - 0.3), core.events.motionStart.tReal, ref.yFloor)
    if (upright1 && upright1.frames >= 5) {
      bodyHU = upright1.heightHU
      core.uprightFrames = upright1.frames
      core.refSource = 'setup-upright'
    } else if (upright0 && upright0.frames >= 5) {
      core.uprightFrames = upright0.frames
      core.refSource = 'setup-upright'
    } else {
      // Fewer than 5 upright frames: the session fallback when given (bodyHU is it, step 1), else a
      // weak estimate from 1–4 frames that the engine's second pass replaces when it can.
      core.refSource = input.fallbackBodyHeightHU ? 'fallback' : 'weak'
      core.uprightFrames = Math.max(upright1?.frames ?? 0, upright0?.frames ?? 0)
    }
    ref = { ...ref, bodyHeightHU: bodyHU }
    core.noise = measureNoise(track, ref, Math.max(s0t, releaseT - 2.0), Math.min(releaseT - 0.9, core.events.motionStart.tReal))
  } else {
    core.refSource = upright0 && upright0.frames >= 5 ? 'setup-upright' : input.fallbackBodyHeightHU ? 'fallback' : upright0 ? 'weak' : 'none'
    core.uprightFrames = upright0?.frames ?? 0
  }
  core.ref = ref
  core.cameraDistanceM = (cam.fHU * input.playerHeightM) / ref.bodyHeightHU

  // 7. Apex.
  if (tossOk) {
    const a = ball.toss!.apex!
    const extra = ball.apexCase === 'fitted-above' ? 0.4 * track.dt : 0
    core.events.tossApex = eventAt(track, a.tReal, Math.hypot(a.uncertaintyS, extra), a.confidence, a.method)
  }

  // 8. Contact: ball methods, audio, wrist apex (§2.4.5), then the fused-event check (D2).
  const contactMethods: MethodEstimate[] = []
  if (inter) contactMethods.push(inter as ContactMethod)
  if (bracket) contactMethods.push(bracket as ContactMethod)
  const videoBest = inter?.t ?? bracket?.t
  const apexT = core.events.tossApex?.tReal
  // The toss's highest seen point stands in for the apex when the toss could not be fitted.
  const tossPeakT = apexT ?? tossTrackPeak(ball, ref)?.t
  // The swing peak, found on its own (events.ts swingPeakTime): label-free, from just before the
  // toss apex to the end of the classification window, not anchored on the ball or sound estimates
  // (those anchor the fused `wrist-apex` method below). It is the D2 check's wrist signal only.
  const swingPeak = swingPeakTime(
    track,
    ref,
    tossPeakT !== undefined ? tossPeakT - SWING_BEFORE_APEX_S : window.anchor - 0.6,
    tossPeakT !== undefined ? tossPeakT + SWING_AFTER_APEX_S : window.anchor + 0.6,
  )
  // Sub-frame refinement on that wrist only (±1.5 frames), with the calibrated wrist bias.
  const swing = swingPeak ? wristApex(track, ref, swingPeak.wrist, swingPeak.t, CALIBRATION.wristBiasS, 1.5 * track.dt) : null
  let audioMethod: MethodEstimate | null = null
  if (input.onsets.length && apexT !== undefined) {
    const D = core.cameraDistanceM ?? 7
    const offset = input.audioOffset?.offsetS ?? 0
    const sigmaAV = input.audioOffset?.sigmaS ?? CALIBRATION.audioVideoSigmaS
    // Within ±0.12 s of a video estimate (§2.4.5): the ball's, or the independent swing peak's when
    // the two disagree (so the sound can arbitrate between them).
    const near = [videoBest, videoBest !== undefined && swing ? swing.t : undefined].filter((v): v is number => v !== undefined)
    const cands = input.onsets
      .filter((o) => o.kind === 'contact' && o.sharpness >= 0.6 && o.strength >= 10)
      .map((o) => ({ o, t: o.tReal - D / SPEED_OF_SOUND_MPS - offset }))
      .filter(({ t }) => t >= apexT - 0.05 && t <= apexT + 0.8)
      .filter(({ t }) => near.length === 0 || near.some((v) => Math.abs(t - v) <= 0.12))
      .sort((p, q) => q.o.strength - p.o.strength)
    const best = cands[0]
    if (best) {
      core.audioContact = best.o
      if (inter) core.audioPair = { audioT: best.t + offset, ballT: inter.t }
      audioMethod = {
        method: 'audio-onset',
        t: best.t,
        sigma: Math.hypot(0.0005, (0.06 * D) / SPEED_OF_SOUND_MPS, sigmaAV),
        q: best.o.sharpness * Math.min(1, best.o.strength / 20),
      }
      contactMethods.push(audioMethod)
    }
  }
  const around = contactMethods.length ? contactMethods.map((m) => m.t).sort((p, q) => p - q)[contactMethods.length >> 1] : window.anchor
  const wristSide = hittingWristAt(track, around, ball.parabola ? { x: xOf(ball.parabola, around), y: yOf(ball.parabola, around) } : null) ?? core.hitWrist
  core.hitWrist = wristSide
  core.tossWrist = wristSide === 'left' ? 'right' : 'left'
  const wrist = wristApex(track, ref, wristSide, around, CALIBRATION.wristBiasS)
  if (wrist) contactMethods.push(wrist)
  core.contactMethods = contactMethods
  let fused = fuseEvent(contactMethods, track)
  const ballMethods = contactMethods.filter((m) => m.method.startsWith('ball-'))
  // The ball's departure was observed when an outgoing track meets the toss path (not when the ball
  // only vanished from it).
  const ballObserved = !!inter || (!!bracket && ball.firstOff?.kind === 'outgoing')
  const check = checkContactSignals({ ball: fuseEvent(ballMethods, null), ballObserved, audio: audioMethod, wrist: swing }, track.dt)
  if (check) {
    core.contactDispute = check.dispute
    notes.push(`contact signals disagree (${check.dispute.resolution}): ${check.dispute.signals.map((s) => `${s.name} ${s.t.toFixed(3)} s`).join(', ')}`)
    if (check.methods) {
      core.contactMethods = check.methods
      fused = fuseEvent(check.methods, track)
    }
  }
  if (fused) {
    const ballUsed = fused.used.some((m) => m.method.startsWith('ball-'))
    core.contactWristOnly = !ballUsed && !fused.used.some((m) => m.method === 'audio-onset')
    if (core.contactWristOnly) fused.confidence = Math.min(fused.confidence, 0.6)
    if (core.contactDispute?.resolution === 'unresolved') {
      // Keep the time (the contact key frame) but below the 0.5 confidence every dependent value
      // needs (§1.3 CONTACT_NOT_FOUND), with a σ that covers the disagreement.
      fused.confidence = Math.min(fused.confidence, UNRESOLVED_CONTACT_CONFIDENCE)
      fused.uncertaintyS = Math.max(fused.uncertaintyS, core.contactDispute.spreadS / 2)
      fused.method = 'disputed'
    } else if (core.contactDispute?.resolution === 'spread') {
      // No outlier to drop: the σ covers the disagreement (the χ² inflation alone can be smaller).
      fused.uncertaintyS = Math.max(fused.uncertaintyS, core.contactDispute.spreadS / 2)
    }
    core.events.contact = fused
  }

  // 9. Classification (§2.3.4).
  const contactT = core.events.contact?.tReal
  // A hitting-arm apex: the wrist that did NOT hold the ball before release reaches above the head
  // (≥ 0.95 BH) from just before the toss apex (contact on the rise) to 1.2 s after it. The tossing
  // arm is still up at the apex and a catching hand rises again, so it never counts as a swing.
  const hitCandidate: WristSide = tossWristAtRelease === 'left' ? 'right' : 'left'
  const hitApexOk = (() => {
    if (tossPeakT === undefined) return false
    for (const i of rangeIdx(track, tossPeakT - SWING_BEFORE_APEX_S, tossPeakT + SWING_AFTER_APEX_S)) {
      const w = pt(track, i, WRIST[hitCandidate], 0.3)
      if (w && heightOf(ref, w.y) >= ARM_UP_BH) return true
    }
    return false
  })()
  const contactEvidence = !!(inter || (bracket && ball.firstOff?.kind === 'outgoing') || core.audioContact)
  // A caught toss (§2.3.4 `retoss`): the ball's last detection after the apex is within 0.15 BH of
  // either wrist (it came back to a hand), and nothing says it was hit (no outgoing ball, no hit
  // sound). At contact the ball is a racket length (about 0.35 BH) from the hitting wrist.
  core.caughtToss = (() => {
    if (tossPeakT === undefined || contactEvidence || ball.outgoing) return false
    const after = (ball.tossTrack?.observations ?? []).filter((o) => o.source !== 'predicted' && o.tReal > tossPeakT)
    const last = after[after.length - 1]
    // Caught at a hand above the waist; a ball seen falling below 0.8 BH past a swing is a miss.
    if (!last || heightOf(ref, last.y) < 0.8) return false
    const i = indexAt(track, last.tReal)
    if (i < 0 || Math.abs(track.t[i] - last.tReal) > 0.05) return false
    return (['left', 'right'] as const).some((side) => {
      const w = pt(track, i, WRIST[side], 0.3)
      return !!w && Math.hypot((w.x - last.x) * cam.aspect, w.y - last.y) / ref.bodyHeightHU <= CAUGHT_TOSS_BH
    })
  })()
  const caught = core.caughtToss
  const validToss = tossOk && ball.detections >= 6 && (ball.apexCase === 'bracketed' || ball.apexCase === 'fitted-above' || ball.apexCase === 'censored')
    && (ball.apexCase !== 'bracketed' || heightOf(ref, ball.toss!.apex!.y) >= 1.35)
  // Toss evidence without a full toss analysis: the ball seen rising above the head in the toss
  // track (≥ 6 detections, highest ≥ 1.35 BH, well above a dribble's bounce), even when its fall to
  // contact or its apex could not be fitted. With the swing it counts the serve; the ball-dependent
  // values then carry their own reasons (BALL_NOT_TRACKED, APEX_OUT_OF_FRAME, CONTACT_NOT_FOUND).
  // The ball layer's own toss fit counts too when the engine got no toss track (it can label a toss
  // cut short before its apex `unknown`): a free flight fitted from ≥ 6 detections to an apex ≥ 1.35 BH.
  const fittedToss = tossOk && !ball.tossTrack && (ball.toss!.fit?.detections ?? 0) >= 6 && heightOf(ref, ball.toss!.apex!.y) >= 1.35
  const tossSeen = validToss || tossTrackPeak(ball, ref)?.rose === true || fittedToss
  if (validToss && hitApexOk && !caught) {
    core.classification = 'serve'
    // Swing and miss: the ball stayed on its path to below 0.8 BH, with no outgoing ball or hit sound.
    const continues = ball.continuesBelowY !== undefined && heightOf(ref, ball.continuesBelowY) < 0.8
    if (!contactEvidence && continues && !ball.outgoing) core.noContact = true
  } else if (validToss) {
    core.classification = 'retoss'
    notes.push(caught ? 'toss caught: the ball came back to a hand' : 'toss with no hitting-arm swing')
  } else if (tossSeen && hitApexOk && !caught) {
    core.classification = 'serve'
    notes.push('counted from the swing and a toss seen above the head; the toss could not be fully analysed')
  } else if (tossSeen && caught) core.classification = 'retoss'
  else if (!tossOk && !core.audioContact) core.classification = 'shadow'
  else if (!tossOk && core.audioContact) core.classification = 'serve'
  else core.classification = 'other'
  if (!validToss && tossOk && heightOf(ref, ball.toss!.apex!.y) < 1.35) notes.push('toss track peaks below 1.35 body heights (dribble?)')

  // 10. Trophy, landing, recovery.
  if (releaseT !== undefined && contactT !== undefined && contactT > releaseT + 0.2) {
    const trophy = detectTrophy(track, ref, releaseT, contactT, core.tossWrist, core.noise)
    if (trophy) core.events.trophy = trophy
    // Front foot and S0 (§1.1).
    // S0 over the planted stance up to release (the front foot does not move before landing): a
    // longer window than §1.1's [release − 0.10, release + 0.05] s, because MediaPipe's foot point
    // jumps by up to 0.1 BH for a few frames as the tossing arm passes at release (corpus, §5.5).
    const s0From = Math.max(s0t, (core.events.motionStart?.tReal ?? releaseT - 0.8) - 0.3, releaseT - 1.0)
    const ff =
      input.view === 'rear'
        ? frontFootRear(track, s0From, releaseT + 0.05)
        : frontFootOver(track, s0From, releaseT + 0.05, input.netDir)
    core.frontFoot = ff.foot
    core.frontFootShare = ff.share
    core.s0 = ff.s0
    const trophyT = trophy?.event.tReal ?? (releaseT + contactT) / 2
    const landing = input.view === 'rear' ? detectLandingRear(track, ref, contactT) : detectLanding(track, ref, trophyT, contactT, ff.foot, input.netDir, core.noise)
    if (landing) {
      core.events.landing = landing
      core.events.recoveryEnd = detectRecoveryEnd(track, ref, landing.event.tReal, core.noise)
    }
  }
  core.trackingQuality = meanTrackingQuality(
    track,
    core.events.tossRelease ? core.events.tossRelease.tReal - 0.3 : window.start,
    core.events.contact ? core.events.contact.tReal + 0.3 : window.end,
    ref.bodyHeightHU,
  )
  return core
}

/** Contact confidence when the timing signals disagree with no majority: below the 0.5 every contact-dependent value needs. */
export const UNRESOLVED_CONTACT_CONFIDENCE = 0.45
/** A toss whose last detection is this close to a wrist (BH) came back to the hand (§2.3.4). */
export const CAUGHT_TOSS_BH = 0.15

/**
 * The toss track's highest detection (rectified), and whether the ball was seen RISING to it above
 * the head: ≥ 6 detections, the highest ≥ 1.35 BH (a dribble bounces far lower), and an earlier
 * detection at least 0.15 BH lower. Null without a toss track.
 */
export function tossTrackPeak(ball: ServeBall, ref: Reference): { t: number; h: number; rose: boolean } | null {
  const det = (ball.tossTrack?.observations ?? []).filter((o) => o.source !== 'predicted')
  if (!det.length) return null
  let top = det[0]
  for (const o of det) if (o.y < top.y) top = o
  const h = heightOf(ref, top.y)
  const lowerBefore = det.some((o) => o.tReal < top.tReal && heightOf(ref, o.y) <= h - 0.15)
  return { t: top.tReal, h, rose: det.length >= 6 && h >= 1.35 && lowerBefore }
}

type SignalName = ContactDispute['signals'][number]['name']

/**
 * The D2 fused-event check on the independent contact signals (see ContactDispute). Null when fewer
 * than two signals exist or all agree. `methods` is what the contact should be fused from instead
 * ('majority', 'spread'); absent for 'unresolved' (the caller keeps its fusion, withheld).
 */
export function checkContactSignals(
  input: { ball: FusedEvent | null; ballObserved?: boolean; audio: MethodEstimate | null; wrist: MethodEstimate | null },
  frameS: number,
): { dispute: ContactDispute; methods?: MethodEstimate[] } | null {
  const signals: { name: SignalName; t: number; sigma: number; methods: MethodEstimate[] }[] = []
  if (input.ball) signals.push({ name: 'ball', t: input.ball.tReal, sigma: input.ball.uncertaintyS, methods: input.ball.used })
  if (input.audio) signals.push({ name: 'audio', t: input.audio.t, sigma: input.audio.sigma, methods: [input.audio] })
  if (input.wrist) signals.push({ name: 'wrist', t: input.wrist.t, sigma: input.wrist.sigma, methods: [input.wrist] })
  if (signals.length < 2) return null
  const agree = (a: (typeof signals)[number], b: (typeof signals)[number]) => Math.abs(a.t - b.t) <= Math.max(DISPUTE_K * Math.hypot(a.sigma, b.sigma), frameS)
  const pairs: [number, number][] = []
  for (let i = 0; i < signals.length; i++) for (let j = i + 1; j < signals.length; j++) pairs.push([i, j])
  const disagreeing = pairs.filter(([i, j]) => !agree(signals[i], signals[j]))
  if (!disagreeing.length) return null
  const ts = signals.map((s) => s.t)
  const spreadS = Math.max(...ts) - Math.min(...ts)
  const plain = signals.map(({ name, t, sigma }) => ({ name, t, sigma }))
  if (signals.length === 3) {
    const outlier = signals.findIndex((_, k) => {
      const others = signals.filter((__, m) => m !== k)
      return !agree(signals[k], others[0]) && !agree(signals[k], others[1]) && agree(others[0], others[1])
    })
    if (outlier >= 0) {
      const kept = signals.filter((_, m) => m !== outlier)
      return { dispute: { resolution: 'majority', signals: plain, dropped: signals[outlier].name, spreadS }, methods: kept.flatMap((s) => s.methods) }
    }
    if (disagreeing.length === 1) return { dispute: { resolution: 'spread', signals: plain, spreadS }, methods: signals.flatMap((s) => s.methods) }
  }
  if (signals.length === 2 && input.ballObserved && input.ball) {
    const other = signals.find((s) => s.name !== 'ball')!
    return { dispute: { resolution: 'ball-observed', signals: plain, dropped: other.name, spreadS }, methods: input.ball.used }
  }
  return { dispute: { resolution: 'unresolved', signals: plain, spreadS } }
}

/** Convenience for callers that want the plain events record. */
export function serveEvents(core: ServeCore, track?: PoseTrack): Record<string, EventEstimate | undefined> {
  return {
    setupStart: core.events.setupStart,
    motionStart: core.events.motionStart,
    tossRelease: asEvent(core.events.tossRelease),
    tossApex: core.events.tossApex,
    trophy: core.events.trophy?.event,
    lowestHip: core.events.trophy ? eventAtCore(core, core.events.trophy.lowT, track) : undefined,
    contact: asEvent(core.events.contact),
    landing: core.events.landing?.event,
    recoveryEnd: core.events.recoveryEnd,
  }
}

function eventAtCore(core: ServeCore, t: number, track?: PoseTrack): EventEstimate {
  return { frameIndex: track && track.t.length ? track.frameIndex[indexAt(track, t)] : -1, tReal: t, uncertaintyS: 0.045, confidence: core.events.trophy?.event.confidence ?? 0.5, method: 'pelvis-min-raw' }
}
