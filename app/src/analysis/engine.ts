/**
 * Engine entry point (engine-core). engine-pipeline imports only from this file.
 *
 *   findServeWindows: coarse serve finding on sparse poses (METRICS §2.3.1–§2.3.2).
 *   analyseSession:   per serve: rectification (§1.1) → left/right relabelling → events and
 *                     phases (§2.4–§2.6) → classification (§2.3.4) → metrics with honesty labels
 *                     (§3) → plausibility (§4.2) → quality (§3.25) → session statistics (§4).
 *
 * Pure and deterministic (seeded bootstraps). No DOM; runs in Node, a worker or a WKWebView.
 */
import type {
  AudioOnset,
  BallObservation,
  BallTrack,
  CameraView,
  CaptureContext,
  Handedness,
  MetricId,
  MetricValue,
  PoseFrame,
  QualityReport,
  ReasonCode,
  VideoMeta,
} from './types.ts'
import type { ServeAnalysis, SessionStats, StratumKey } from '../data/domain.ts'
import type { TossAnalysis } from './ball/toss.ts'
import { assessAudioTiming } from './video/audio.ts'
import { bodyAxisRollDeg, cameraModel, ROLL_SANITY_LIMIT_DEG, setupClassOf, type CameraModel, type SetupClass } from './serve/geometry.ts'
import { setupKeyOf } from './metrics/setup.ts'
import { buildTrack, indexAt, pt, rangeIdx, type PoseTrack } from './serve/track.ts'
import { findServeWindows as findWindows, type ServeWindowSpan } from './serve/windows.ts'
import { analyseServe, AUDIO_CALIBRATION, serveEvents, type ServeCore } from './serve/analyse.ts'
import { FOOT_TOE } from './serve/events.ts'
import { buildPhases } from './serve/phases.ts'
import { computeServeMetrics, SERVE_SCALE_FLAG, type MetricContext, type PerServeResult, type TimeBaseClass } from './metrics/perServe.ts'
import { buildSessionStats, type SessionServe } from './metrics/session.ts'
import { bodyPx1080Of, computeQuality, scaleRatioOf, sustainedOrientationChange, type TimeBaseNote } from './quality/checks.ts'
import { BANDS_VERSION, CATALOGUE_VERSION, ENGINE_VERSION, type ConditionClass } from './metrics/catalogue.ts'
import type { LightEvidence } from './quality/light.ts'
import { finalizeMetric, unavailable } from './metrics/status.ts'
import { hashString, median } from './stats/descriptive.ts'
import { LM, METRIC_IDS } from './types.ts'

export interface EngineInput {
  meta: VideoMeta
  view: CameraView
  capture?: CaptureContext
  profile: { heightM: number; handedness: Handedness; sex?: 'female' | 'male' | 'unspecified' }
  /** Cleaned, full-frame normalised, one per analysed frame. */
  poses: PoseFrame[]
  /**
   * Ball-layer output. `toss` entries are either TossAnalysis objects or the pipeline's per-window
   * records ({ startReal, endReal, toss: TossAnalysis, contactFromTracks, … }).
   */
  ball: { observations: BallObservation[]; tracks: BallTrack[]; toss?: unknown[] }
  onsets: AudioOnset[]
  /** Aimed target per 1-based serve index (player-entered, D3/D4). */
  targetTags?: Record<number, 'T' | 'body' | 'wide'>
  // ---- optional additions (engine-core) ----
  /** Stable ids for the output records (the pipeline may re-assign them). */
  ids?: { sessionId: string; videoId: string }
  /** Whether the player entered their height (else the default 1.75 m is an assumption). */
  heightEntered?: boolean
  /**
   * Light measured from the pixels on the sparse pass (quality/light.ts lightEvidence): flicker and a
   * dark sky lower the condition class the answer gave (conditionClassOf). Absent: the answer alone.
   */
  light?: LightEvidence | null
}

export interface EngineOutput {
  serves: ServeAnalysis[]
  stats: SessionStats
  quality: QualityReport
  warnings: string[]
}

/** Coarse pass: serve windows from sparse poses (~15–30 Hz); label-free anchors on the higher wrist. */
export function findServeWindows(poses: PoseFrame[], meta: VideoMeta, handedness: Handedness): { startReal: number; endReal: number; confidence: number }[] {
  return findWindows(poses, meta, handedness).map(({ startReal, endReal, confidence }) => ({ startReal, endReal, confidence }))
}

// ---------- helpers ----------

interface PipelineTossEntry {
  startReal?: number
  endReal?: number
  toss?: TossAnalysis | null
  contactFromTracks?: { tReal: number; uncertaintyS: number } | null
}

function parseTossEntries(raw: unknown[] | undefined): { toss: TossAnalysis[]; windows: { start: number; end: number }[] } {
  const toss: TossAnalysis[] = []
  const windows: { start: number; end: number }[] = []
  for (const e of raw ?? []) {
    if (!e || typeof e !== 'object') continue
    const o = e as Record<string, unknown>
    if (typeof o.status === 'string' && 'gravity' in o) toss.push(o as unknown as TossAnalysis)
    else {
      const p = o as PipelineTossEntry
      if (p.toss && typeof p.toss === 'object' && typeof (p.toss as TossAnalysis).status === 'string') toss.push(p.toss)
      if (typeof p.startReal === 'number' && typeof p.endReal === 'number' && p.endReal > p.startReal) windows.push({ start: p.startReal, end: p.endReal })
    }
  }
  return { toss, windows }
}

/**
 * The light condition class (METRICS §1.3): the player's answer, then the pixels (quality/light.ts,
 * measured on the sparse pass). The answer: 'day' is day; court lights and indoor courts (artificial
 * light, validated nowhere yet) are night-lights; no answer is 'unknown' (nothing is validated for it,
 * every value at most experimental). The pixels can only LOWER that: mains flicker at or above 3%
 * makes the class 'flicker' whatever was answered (it also blocks speed, §3.25), and a dark sky over a
 * lit court turns a 'day' (or missing) answer into night-lights. A bright picture never turns an
 * answer into daylight. Without a capture context at all (tests, offline tools that pass none) the
 * class stays 'day' unless the pixels say otherwise.
 */
export function conditionClassOf(capture?: CaptureContext, light?: LightEvidence | null): ConditionClass {
  const answer = capture?.conditions?.light
  const fromAnswer: ConditionClass = !capture || answer === 'day' ? 'day' : answer === 'lights' || answer === 'indoor' ? 'night-lights' : 'unknown'
  if (light?.flickering) return 'flicker'
  if (light?.dark && (fromAnswer === 'day' || fromAnswer === 'unknown')) return 'night-lights'
  return fromAnswer
}

/** A plain sentence when the pixels changed the class the answer gave (engine warning). */
export function conditionOverrideNote(capture: CaptureContext | undefined, light: LightEvidence | null | undefined, condition: ConditionClass): string | null {
  const answered = capture?.conditions?.light
  if (condition === 'flicker') {
    return `The court lights are flickering in this video (about ${Math.round((light?.flicker?.amplitude ?? 0) * 100)}% of the brightness), so readings are experimental and speed isn't available (FLICKER). At night, use 25 or 50 fps if your phone offers it.`
  }
  if (condition === 'night-lights' && light?.dark && answered !== 'lights' && answered !== 'indoor') {
    return answered === 'day'
      ? 'This video looks like it was filmed under court lights (a dark sky over a lit court), not in daylight, so it was analysed as a night session: readings checked only in daylight are experimental (CONDITION_NOT_VALIDATED).'
      : 'This video looks like it was filmed under court lights (a dark sky over a lit court), so readings checked only in daylight are experimental (CONDITION_NOT_VALIDATED).'
  }
  return null
}

export interface TimeBaseInfo {
  cls: TimeBaseClass
  relSigma: number
  realTimePrior: boolean
  note: TimeBaseNote
}

/**
 * The time base class (METRICS §2.9, CAPTURE §11.3):
 *   - 'proven' only from container evidence (timestamps or capture-rate metadata): relSigma 0.003, speed allowed;
 *   - 'physics': slow motion corrected with the toss's fall (fpsSource 'physics'), or a player's
 *     slow-motion answer the toss's fall confirms. Timing estimated, relSigma ≥ 2%, speed never;
 *   - 'normal': real time confirmed by the toss's fall, or assumed for a clip with nothing against it;
 *   - 'unknown': timing unavailable. The toss's fall contradicts the clip's rate (or the player's
 *     answer), or a slow-motion answer the toss could not check.
 * A player's answer is always checked against the toss's fall here (the pipeline only checks an
 * unknown time base).
 */
export function timeBaseOf(meta: VideoMeta, cores: readonly ServeCore[]): TimeBaseInfo {
  const factors = cores
    .map((c) => c.ball.toss?.gravity)
    .filter((g): g is NonNullable<typeof g> => !!g && g.status === 'ok' && g.timeScaleFactor !== undefined)
  const gravity = factors.length
    ? (() => {
        const f = median(factors.map((g) => g.timeScaleFactor!))
        const sigma = median(factors.map((g) => (g.timeScaleSigma ?? 0.05) / (g.timeScaleFactor ?? 1)))
        return { consistent: Math.abs(Math.log(f)) <= Math.max(2 * sigma, Math.log(1.12)), relSigma: Math.max(0.02, sigma / Math.sqrt(factors.length)) }
      })()
    : null
  if (meta.fpsSource === 'physics') return { cls: 'physics', relSigma: gravity?.relSigma ?? 0.02, realTimePrior: true, note: 'toss-corrected' }
  if (meta.timeBaseStatus === 'proven' && (meta.fpsSource === 'container' || meta.fpsSource === 'timestamps')) return { cls: 'proven', relSigma: 0.003, realTimePrior: true, note: 'container' }
  if (meta.fpsSource === 'user') {
    const slowMotion = Math.abs(meta.timeScale - 1) > 1e-6
    if (gravity && !gravity.consistent) return { cls: 'unknown', relSigma: 0.02, realTimePrior: false, note: 'declared-contradicted' }
    if (gravity) return slowMotion ? { cls: 'physics', relSigma: gravity.relSigma, realTimePrior: true, note: 'declared-confirmed' } : { cls: 'normal', relSigma: gravity.relSigma, realTimePrior: true, note: 'toss-confirmed' }
    // Before the ball pass (no cores) a slow-motion answer is not trusted as real time either: no
    // gravity prior in the toss fit, so the check above stays independent.
    return slowMotion ? { cls: 'unknown', relSigma: 0.02, realTimePrior: false, note: 'declared-unconfirmed' } : { cls: 'normal', relSigma: 0.02, realTimePrior: true, note: 'assumed' }
  }
  if (gravity) return gravity.consistent ? { cls: 'normal', relSigma: gravity.relSigma, realTimePrior: true, note: 'toss-confirmed' } : { cls: 'unknown', relSigma: 0.02, realTimePrior: false, note: 'toss-contradicted' }
  if (meta.timeBaseKind === 'possible-rendered-slomo') return { cls: 'unknown', relSigma: 0.02, realTimePrior: false, note: 'unconfirmed-slomo' }
  return { cls: 'normal', relSigma: 0.02, realTimePrior: true, note: 'assumed' }
}

/**
 * The session's audio–video offset for serve k (METRICS §2.4.5, AUDIO_CALIBRATION), from the OTHER
 * serves' (hit sound, ball-intersection) pairs; undefined when it cannot be calibrated.
 */
function audioOffsetFor(k: number, cores: readonly ServeCore[], captureFps: number): { offsetS: number; sigmaS: number } | undefined {
  if (captureFps < AUDIO_CALIBRATION.minFps) return undefined
  const pairs = cores.map((c) => (c.audioPair ? c.audioPair.audioT - c.audioPair.ballT : null))
  if (pairs.filter((r) => r !== null).length < AUDIO_CALIBRATION.minPairs) return undefined
  const others = pairs.filter((r, j): r is number => r !== null && j !== k)
  if (others.length < AUDIO_CALIBRATION.minOtherPairs) return undefined
  const offsetS = median(others)
  if (Math.abs(offsetS) > AUDIO_CALIBRATION.maxOffsetS) return undefined
  const mad = median(others.map((r) => Math.abs(r - offsetS)))
  return { offsetS, sigmaS: Math.max(AUDIO_CALIBRATION.sigmaFloorS, 1.4826 * mad) }
}

/** netDir prior from handedness and camera side (§1.1): chest side, right-hander → net to the right. */
function netDirPrior(handedness: Handedness, cameraSide: 'chest' | 'back'): 1 | -1 {
  const base = handedness === 'right' ? 1 : -1
  return (cameraSide === 'back' ? -base : base) as 1 | -1
}

/**
 * Session evidence rule for the data checks that can override what the player told us: the netDir
 * check (METRICS §1.1) and the view check (§2.3.7). Evidence is counted per serve (one vote per
 * serve, from that serve's own ball and body), never per ball track, so a stray or mis-associated
 * track can move at most one serve's vote. The check acts only with at least
 * SESSION_EVIDENCE_MIN_SERVES serves carrying evidence (every counted serve when a clip has fewer)
 * and at least SESSION_EVIDENCE_SHARE of them contradicting.
 */
export const SESSION_EVIDENCE_MIN_SERVES = 3
export const SESSION_EVIDENCE_SHARE = 0.7

export interface SessionEvidence {
  /** Serves with evidence either way. */
  decided: number
  /** Serves whose evidence contradicts what was declared. */
  contradicting: number
  /** contradicting / decided (0 with no evidence). */
  share: number
  /** Enough serves carry evidence for the check to act. */
  enough: boolean
  /** Enough evidence, and at least SESSION_EVIDENCE_SHARE of it contradicts. */
  contradicted: boolean
}

/** `votes`: per serve, true = contradicts, false = agrees, null = no evidence. `counted`: serves in the clip. */
export function sessionEvidence(votes: readonly (boolean | null)[], counted: number): SessionEvidence {
  const decided = votes.filter((v) => v !== null).length
  const contradicting = votes.filter((v) => v === true).length
  const share = decided ? contradicting / decided : 0
  const needed = Math.max(1, Math.min(SESSION_EVIDENCE_MIN_SERVES, Math.max(counted, decided)))
  const enough = decided >= needed
  return { decided, contradicting, share, enough, contradicted: enough && share >= SESSION_EVIDENCE_SHARE }
}

/** "2 of 5 serves", "1 of 1 serve". */
const servesOf = (k: number, n: number) => `${k} of ${n} serve${n === 1 ? '' : 's'}`

/** Smallest outgoing-ball travel across the picture that shows a direction (BH). */
const NETDIR_BALL_MIN_BH = 0.1
/** Smallest landing step from the start toe that shows a direction (BH; about 14 cm at 1.8 m). */
const NETDIR_STEP_MIN_BH = 0.08

/**
 * One serve's evidence for netDir (METRICS §1.1), in image x (+1 = towards the right):
 *   - the served ball: this serve's own outgoing track (ServeBall.outgoing, the first outgoing track
 *     after this serve's toss apex; never a track from another window), detections only, moving
 *     mainly across the picture;
 *   - the landing step: the landing toe (2 frames after a real foot contact, as landing-distance)
 *     minus the start toe S0. S0 is the netDir front toe, so under a wrong prior it is the back toe
 *     and the step still points to the net.
 * When both exist and disagree the serve gives no evidence. null = no evidence.
 */
export function netDirVote(core: ServeCore, track: PoseTrack, aspect: number): 1 | -1 | null {
  const bh = core.ref?.bodyHeightHU
  if (!bh) return null
  let ball: 1 | -1 | null = null
  const o = (core.ball.outgoing?.observations ?? []).filter((x) => x.source !== 'predicted')
  if (o.length >= 2) {
    const dx = (o[o.length - 1].x - o[0].x) * aspect
    const dy = o[o.length - 1].y - o[0].y
    if (Math.abs(dx) >= NETDIR_BALL_MIN_BH * bh && Math.abs(dx) > Math.abs(dy)) ball = dx > 0 ? 1 : -1
  }
  let step: 1 | -1 | null = null
  const land = core.events.landing
  if (land && land.event.method === 'foot-contact' && (land.foot === 'left' || land.foot === 'right') && core.s0 && track.t.length) {
    const i0 = indexAt(track, land.event.tReal + 2 * track.dt)
    const xs: number[] = []
    for (let i = i0; i <= Math.min(track.t.length - 1, i0 + 2); i++) {
      const q = pt(track, i, FOOT_TOE[land.foot], 0.5)
      if (q) xs.push(q.x)
    }
    if (xs.length) {
      xs.sort((p, q) => p - q)
      const dx = (xs[xs.length >> 1] - core.s0.x) * aspect
      if (Math.abs(dx) >= NETDIR_STEP_MIN_BH * bh) step = dx > 0 ? 1 : -1
    }
  }
  if (ball !== null && step !== null) return ball === step ? ball : null
  return ball ?? step
}

/** Missing-frame share in [a, b] when the pose rate is dense (≈ capture rate); null otherwise. */
/**
 * Share of the video's frames missing in [a, b]: time gaps between consecutive analysed frames that
 * their frame numbers do not account for (a phone that dropped frames while recording). Frames the
 * pipeline chose not to run pose on (every 3rd outside a serve's core, ARCHITECTURE §5.4) and frames
 * where no body was found are not dropped frames; body tracking has its own check (cq.tracking).
 */
export function missingShare(track: Pick<PoseTrack, 't' | 'frameIndex'>, a: number, b: number, fps: number): number | null {
  if (!(fps > 0)) return null
  const idx: number[] = []
  for (let i = 0; i < track.t.length; i++) if (track.t[i] >= a - 1e-9 && track.t[i] <= b + 1e-9) idx.push(i)
  if (idx.length < 2) return null
  let missing = 0
  for (let k = 1; k < idx.length; k++) {
    const byTime = Math.round((track.t[idx[k]] - track.t[idx[k - 1]]) * fps)
    const byIndex = track.frameIndex[idx[k]] - track.frameIndex[idx[k - 1]]
    if (byTime > byIndex) missing += byTime - byIndex
  }
  const expected = Math.max(1, Math.round((b - a) * fps) + 1)
  return Math.min(1, missing / expected)
}

/** §3.25 framing: the body must stay inside this margin of the picture (fraction of each side). */
export const FRAMING_MARGIN = 0.03

/** Framing from raw (unrectified) landmarks: cut at contact, or feet out at landing (outside the 3% margin). */
function framingOf(poses: readonly PoseFrame[], core: ServeCore): 'ok' | 'feet-at-landing' | 'contact-cut' | 'unknown' {
  const c = core.events.contact?.tReal
  if (c === undefined) return 'unknown'
  const near = (t: number) => poses.reduce<PoseFrame | null>((best, p) => (p.landmarks && (!best || Math.abs(p.tReal - t) < Math.abs(best.tReal - t)) ? p : best), null)
  const lo = FRAMING_MARGIN
  const hi = 1 - FRAMING_MARGIN
  const out = (lm: { x: number; y: number; visibility: number } | undefined) => !!lm && lm.visibility >= 0.3 && (lm.x < lo || lm.x > hi || lm.y < lo || lm.y > hi)
  const pc = near(c)
  if (pc?.landmarks) {
    const hitWrist = core.hitWrist === 'left' ? LM.LEFT_WRIST : LM.RIGHT_WRIST
    if ([LM.NOSE, hitWrist].some((k) => out(pc.landmarks![k]))) return 'contact-cut'
  }
  const l = core.events.landing?.event.tReal
  if (l !== undefined) {
    const pl = near(l)
    if (pl?.landmarks && [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX, LM.LEFT_HEEL, LM.RIGHT_HEEL].some((k) => out(pl.landmarks![k]))) return 'feet-at-landing'
  }
  return 'ok'
}

/** k-means (k = 2) on H_HU for the court side (§2.3.6). */
function courtSides(cores: readonly ServeCore[], handedness: Handedness, cameraSide: 'chest' | 'back'): Map<number, { side: 'deuce' | 'ad'; confidence: number }> {
  const out = new Map<number, { side: 'deuce' | 'ad'; confidence: number }>()
  const hs = cores.filter((c) => c.ref).map((c) => ({ i: c.index, h: c.ref!.bodyHeightHU }))
  if (hs.length < 6) return out
  let a = Math.min(...hs.map((x) => x.h))
  let b = Math.max(...hs.map((x) => x.h))
  let groups: { i: number; h: number }[][] = [[], []]
  for (let it = 0; it < 20; it++) {
    groups = [[], []]
    for (const x of hs) groups[Math.abs(x.h - a) <= Math.abs(x.h - b) ? 0 : 1].push(x)
    if (!groups[0].length || !groups[1].length) return out
    a = median(groups[0].map((x) => x.h))
    b = median(groups[1].map((x) => x.h))
  }
  const rel = Math.abs(b - a) / Math.min(a, b)
  if (rel < 0.06 || groups[0].length < 3 || groups[1].length < 3) return out
  const confidence = rel >= 0.1 ? 0.9 : 0.7
  // Larger H_HU = nearer the camera: deuce for right-handers (chest side), ad for left-handers.
  const nearSide: 'deuce' | 'ad' = (handedness === 'right') === (cameraSide === 'chest') ? 'deuce' : 'ad'
  const farSide = nearSide === 'deuce' ? 'ad' : 'deuce'
  const nearGroup = b > a ? 1 : 0
  groups[nearGroup].forEach((x) => out.set(x.i, { side: nearSide, confidence }))
  groups[1 - nearGroup].forEach((x) => out.set(x.i, { side: farSide, confidence }))
  return out
}

/**
 * Two floor rows closer than this share of the standing height are the same distance: about 1% of the
 * frame at D1 set-ups, where the two court sides differ by 2–3% (the session clip: 0.678 against 0.705).
 */
export const FLOOR_MATCH_BH = 0.05

/**
 * The session's standing height in the picture (H_HU) for a serve that had fewer than 5 upright frames
 * (METRICS §1.1 fallback), from the serves that had them. H_HU depends on the distance, and so does
 * the floor row: for a level camera both are proportional to 1/D, so H_HU is linear in the floor row
 * (H_HU = (H / h_camera)·(yFloor − y_horizon)). The fallback therefore comes from the serves at the
 * same floor row (median), else from a straight line through them (clamped near the measured values),
 * else the plain median. A median over both court sides would put a near-side serve at the average
 * distance: on the session clip one serve's heights read 11% high that way (final e2e re-run).
 */
export function sessionBodyHeight(refs: readonly { yFloor: number; bodyHeightHU: number }[]): ((yFloor: number) => number) | undefined {
  if (!refs.length) return undefined
  const hs = refs.map((r) => r.bodyHeightHU)
  const all = median(hs)
  const tol = FLOOR_MATCH_BH * all
  const ys = refs.map((r) => r.yFloor)
  const span = Math.max(...ys) - Math.min(...ys)
  let line: { a: number; b: number } | null = null
  if (refs.length >= 2 && span > tol) {
    const my = ys.reduce((p, q) => p + q, 0) / ys.length
    const mh = hs.reduce((p, q) => p + q, 0) / hs.length
    let syy = 0
    let syh = 0
    for (const r of refs) {
      syy += (r.yFloor - my) ** 2
      syh += (r.yFloor - my) * (r.bodyHeightHU - mh)
    }
    const b = syy > 0 ? syh / syy : 0
    // Nearer serves have a lower floor row (larger y) and a taller body: a slope of the other sign is noise.
    if (b > 0) line = { a: mh - b * my, b }
  }
  const lo = 0.85 * Math.min(...hs)
  const hi = 1.15 * Math.max(...hs)
  return (yFloor: number) => {
    const near = refs.filter((r) => Math.abs(r.yFloor - yFloor) <= tol)
    if (near.length) return median(near.map((r) => r.bodyHeightHU))
    if (line) return Math.max(lo, Math.min(hi, line.a + line.b * yFloor))
    return all
  }
}

/**
 * Per-serve scale check against the session (E1, 2026-09-28). The time base is a clip property (the
 * container, else the session's gravity check over every toss: timeBaseOf); a single serve's toss fit
 * never changes it or any value's scale. What a serve's own toss can do is FLAG the serve: its fall
 * (apparent gravity from this serve's body scale) disagreeing with the other serves' median by more
 * than SERVE_SCALE_FLAG and 3σ means this serve's standing-height scale is off (a fallback H_HU, a
 * bent setup), so its body-scaled values are capped at experimental (perServe.ts, SCALE_INCONSISTENT).
 * Returns |g_serve / median(g_others) − 1| for the flagged serves only; needs 2 other serves.
 */
export function serveScaleOffsets(cores: readonly ServeCore[], timeBase: TimeBaseClass): Map<number, number> {
  const out = new Map<number, number>()
  if (timeBase === 'unknown') return out
  const gs = cores
    .filter((c) => c.classification === 'serve')
    .map((c) => ({ index: c.index, grav: c.ball.toss?.gravity }))
    .filter((x): x is { index: number; grav: NonNullable<typeof x.grav> } => !!x.grav && x.grav.status === 'ok' && Number.isFinite(x.grav.apparentGravityMps2 ?? Number.NaN))
  for (const x of gs) {
    const others = gs.filter((y) => y.index !== x.index).map((y) => y.grav.apparentGravityMps2!)
    if (others.length < 2) continue
    const off = Math.abs(x.grav.apparentGravityMps2! / median(others) - 1)
    // σ of the apparent gravity: twice the relative σ of the time-scale factor.
    const rel = 2 * ((x.grav.timeScaleSigma ?? 0.05) / (x.grav.timeScaleFactor ?? 1))
    if (off > SERVE_SCALE_FLAG && off > 3 * rel) out.set(x.index, off)
  }
  return out
}

// ---------- analyseSession ----------

export function analyseSession(input: EngineInput): EngineOutput {
  const warnings: string[] = []
  const meta = input.meta
  const capture = input.capture
  const view = input.view
  const handedness = input.profile.handedness
  const sessionId = input.ids?.sessionId ?? ''
  const videoId = input.ids?.videoId ?? ''
  const heightEntered = input.heightEntered ?? (capture ? capture.playerHeightSource === 'entered' : true)
  const H = input.profile.heightM > 0 ? input.profile.heightM : 1.75
  if (H < 1.3 || H > 2.2) warnings.push('Entered height is outside the adult range; check it in Profile.')
  const cam: CameraModel = cameraModel(meta, capture, { view })
  const condition = conditionClassOf(capture, input.light)
  const lightNote = conditionOverrideNote(capture, input.light, condition)
  if (lightNote) warnings.push(lightNote)
  const cameraSide = capture?.cameraSide ?? 'chest'
  const track = buildTrack(input.poses, cam)
  const parsed = parseTossEntries(input.ball.toss)
  const captureFps = meta.captureFps || meta.nominalFps || 30

  // Windows: the pipeline's planned windows when given (dense data lives there), else our own pass.
  let spans: ServeWindowSpan[]
  if (parsed.windows.length) {
    spans = parsed.windows.map((w) => ({ startReal: w.start, endReal: w.end, confidence: 0.8, anchorReal: w.end - Math.min(2.0, (w.end - w.start) * 0.45) }))
    // Refine the anchor with our own coarse pass where it falls inside a planned window.
    const own = findWindows(input.poses, meta, handedness)
    for (const s of spans) {
      const a = own.find((o) => o.anchorReal >= s.startReal && o.anchorReal <= s.endReal)
      if (a) {
        s.anchorReal = a.anchorReal
        s.confidence = a.confidence
      }
    }
  } else spans = findWindows(input.poses, meta, handedness)
  if (!spans.length) {
    // Fall back to toss tracks (e.g. a pose pass that never saw the wrist above the head).
    for (const t of input.ball.tracks.filter((tr) => tr.kind === 'toss' && tr.observations.length >= 6)) {
      const last = t.observations[t.observations.length - 1].tReal
      spans.push({ startReal: Math.max(0, last - 2.4), endReal: last + 1.8, confidence: 0.5, anchorReal: last })
    }
    if (spans.length) warnings.push('Serves were found from the ball only; body tracking did not see a serve motion.')
  }

  // Audio: contact timing only, when the hit sound is on (or an import has audio) and usable.
  const audioOn = capture ? capture.hitSoundTiming || capture.source === 'import' : input.onsets.length > 0
  const audioTiming = assessAudioTiming(meta)
  const onsets = audioOn && audioTiming.usable ? input.onsets : []

  // Time base prior before the ball pass.
  const prior = timeBaseOf(meta, [])

  // Per-serve analysis (two passes: the second fills body height from the session when a serve lacks upright frames).
  const firstT = input.poses.length ? Math.min(...input.poses.map((p) => p.tReal)) : 0
  const searchStartOf = (k: number) => Math.max(firstT, spans[k].anchorReal - 8, k > 0 ? Math.max(spans[k - 1].endReal, spans[k - 1].anchorReal + 1.5) : -Infinity)
  const analyseAll = (netDir: 1 | -1): ServeCore[] => {
    const cores: ServeCore[] = []
    let prevRecovery: number | undefined
    spans.forEach((s, k) => {
      const core = analyseServe({
        index: k + 1,
        window: { start: s.startReal, end: s.endReal, anchor: s.anchorReal, confidence: s.confidence },
        track,
        cam,
        view,
        handedness,
        netDir,
        playerHeightM: H,
        playerHeightEntered: heightEntered,
        tracks: input.ball.tracks,
        observations: input.ball.observations,
        tossResults: parsed.toss,
        onsets,
        realTime: prior.realTimePrior,
        previousRecoveryEnd: prevRecovery,
        searchStart: searchStartOf(k),
        captureFps,
      })
      prevRecovery = core.events.recoveryEnd?.tReal
      cores.push(core)
    })
    // Second pass: (a) a serve with fewer than 5 upright frames ('weak') or none takes H_HU from the
    // serves that had them AT ITS DISTANCE (sessionBodyHeight: matched by the floor row), never from a
    // median over both court sides (METRICS §1.1); weak serves never feed it. (b) With the hit sound,
    // the audio–video offset calibrated from the other serves (METRICS §2.4.5).
    const fallbackAt = sessionBodyHeight(cores.filter((c) => c.ref && c.refSource === 'setup-upright').map((c) => ({ yFloor: c.ref!.yFloor, bodyHeightHU: c.ref!.bodyHeightHU })))
    const firstPass = [...cores]
    for (let k = 0; k < cores.length; k++) {
      const needsHeight = cores[k].refSource !== 'setup-upright' && !!fallbackAt
      const audioOffset = onsets.length ? audioOffsetFor(k, firstPass, captureFps) : undefined
      if (!needsHeight && !audioOffset) continue
      cores[k] = analyseServe({
        index: k + 1,
        window: cores[k].window,
        track,
        cam,
        view,
        handedness,
        netDir,
        playerHeightM: H,
        playerHeightEntered: heightEntered,
        tracks: input.ball.tracks,
        observations: input.ball.observations,
        tossResults: parsed.toss,
        onsets,
        realTime: prior.realTimePrior,
        previousRecoveryEnd: k > 0 ? cores[k - 1].events.recoveryEnd?.tReal : undefined,
        fallbackBodyHeightAt: needsHeight ? fallbackAt : undefined,
        audioOffset,
        searchStart: searchStartOf(k),
        captureFps,
      })
    }
    return cores
  }

  // netDir (§1.1): the prior from the entered hand and camera side, checked against the data: one
  // vote per counted serve from its own served ball and landing step (netDirVote). The prior is
  // overridden only when enough serves carry evidence and ≥ 70% of them contradict it
  // (sessionEvidence); a stray ball track from another court or window never decides it.
  let netDir: 1 | -1 = view === 'side' ? netDirPrior(handedness, cameraSide) : 1
  let cores = analyseAll(netDir)
  if (view === 'side') {
    const counted = cores.filter((c) => c.classification === 'serve')
    const dirs = counted.map((c) => netDirVote(c, track, cam.aspect))
    const ev = sessionEvidence(dirs.map((d) => (d === null ? null : d !== netDir)), counted.length)
    const seen = `on ${servesOf(ev.contradicting, ev.decided)} where it could be seen`
    if (ev.contradicted) {
      netDir = (netDir === 1 ? -1 : 1) as 1 | -1
      cores = analyseAll(netDir)
      warnings.push(`The served ball or the landing step went towards the other side of the picture than expected for your hand and camera side ${seen} (VIEW_MISMATCH, info). Using the direction they showed.`)
    } else if (ev.contradicting > 0) {
      warnings.push(`The served ball or the landing step went towards the other side of the picture than expected for your hand and camera side ${seen} (info). Not enough to override your entries, so your hand and camera side were used.`)
    }
  }
  const tb = timeBaseOf(meta, cores)
  if (tb.cls === 'unknown') {
    warnings.push(
      tb.note === 'declared-contradicted'
        ? "The toss fell at a rate that doesn't match the frame rate given for this clip: timing metrics are unavailable."
        : 'The time base could not be confirmed (possible slow motion): timing metrics are unavailable.',
    )
  }

  // View check (§2.3.7) from the outgoing ball. In a true side view the served ball crosses the
  // picture (|dx| > 2|dy|) and does not climb steeply (image speed ≥ −2.5 BH/s). From behind
  // it shrinks as it travels away. Returns true when the evidence
  // CONTRADICTS the declared view, null when there is no outgoing ball.
  const sideEvidence = cores.map((c) => {
    const o = (c.ball.outgoing?.observations ?? []).filter((x) => x.source !== 'predicted')
    if (o.length < 2 || !c.ref) return null
    const first = o[0]
    const last = o[o.length - 1]
    const dt = last.tReal - first.tReal
    if (!(dt > 0)) return null
    const dx = (last.x - first.x) * cam.aspect
    const dy = last.y - first.y
    // Only a fast ball is evidence (a served ball crosses ~20 BH/s; slower tracks are clutter).
    if (Math.hypot(dx, dy) / dt / c.ref.bodyHeightHU < 8) return null
    const horizontal = Math.abs(dx) > 2 * Math.abs(dy)
    // Beginners can hit slightly upwards (about −2 BH/s on the corpus); from 45° in front the ball
    // climbs at −3 to −7 BH/s.
    const rising = dy / dt / c.ref.bodyHeightHU < -2.5
    // Size trend from the halves of the track (single radii are noisy for a small, fast ball).
    const radii = o.map((x) => x.radius)
    const half = Math.max(1, Math.floor(radii.length / 2))
    const medOf = (xs: number[]) => [...xs].sort((p, q) => p - q)[xs.length >> 1]
    const growth = medOf(radii.slice(radii.length - half)) / Math.max(1e-6, medOf(radii.slice(0, half)))
    if (view === 'side') return !horizontal || rising
    if (view === 'rear') return horizontal && growth > 0.7
    return null
  })
  // One vote per serve (sessionEvidence): a single fast stray track in a long session cannot
  // withhold every view-specific value; a short clip still needs every counted serve's evidence.
  const viewEv = sessionEvidence(sideEvidence, cores.filter((c) => c.classification === 'serve').length)
  const mismatchShare = viewEv.share
  const viewMismatch = viewEv.contradicted && (view === 'side' || view === 'rear')
  if (viewMismatch) warnings.push('This clip does not look like the view that was chosen; view-specific metrics are unavailable.')
  else if (viewEv.contradicting > 0 && (view === 'side' || view === 'rear')) {
    warnings.push(`The served ball did not move as it would in the chosen view on ${servesOf(viewEv.contradicting, viewEv.decided)} with a fast served ball (info). Not enough to call the view wrong, so view-specific metrics were kept.`)
  }

  // Roll sanity check (METRICS §1.1.3a). A level that is only ASSUMED from the import's mount answer
  // must agree with the standing player: the mid-ankle to mid-shoulder line within 3° of the image
  // vertical over the upright setup frames. Otherwise the answer is not trusted and the pitch is unknown.
  let metricCam: CameraModel = cam
  const setupFrames = cores.flatMap((c) =>
    c.events.setupStart && c.events.motionStart && c.events.motionStart.tReal > c.events.setupStart.tReal ? rangeIdx(track, c.events.setupStart.tReal, c.events.motionStart.tReal) : [],
  )
  const standingRoll = cam.tiltStatus === 'assumed-level'
    ? bodyAxisRollDeg(setupFrames, cam.aspect, (i) => ({
        ankleL: pt(track, i, LM.LEFT_ANKLE, 0.5),
        ankleR: pt(track, i, LM.RIGHT_ANKLE, 0.5),
        shoulderL: pt(track, i, LM.LEFT_SHOULDER, 0.5),
        shoulderR: pt(track, i, LM.RIGHT_SHOULDER, 0.5),
      }))
    : null
  const rollFlag = standingRoll !== null && Math.abs(standingRoll.rollDeg) > ROLL_SANITY_LIMIT_DEG
  if (rollFlag) {
    metricCam = { ...cam, tiltStatus: 'unknown' }
    warnings.push(
      `The standing player leans ${Math.abs(standingRoll!.rollDeg).toFixed(1)} degrees from the picture's vertical, so the phone was probably not level: heights are experimental (PITCH_UNKNOWN).`,
    )
  }

  // Court side per serve.
  const clustered = view === 'side' && capture?.serveSide === 'both' ? courtSides(cores, handedness, cameraSide) : new Map()
  const intended = capture?.intendedType
  const serveNumber: 1 | 2 | 'unknown' = capture?.serveNumber === 1 || capture?.serveNumber === 2 ? capture.serveNumber : 'unknown'

  // Capture checks that gate values (METRICS §3.25 "Block"), computed before the metrics that depend on
  // them: subject size, framing at contact, scale (toss gravity vs body), and the phone moving.
  const framing = cores.map((c) => framingOf(input.poses, c))
  const bodyPx1080 = bodyPx1080Of(cores, meta.height, Math.min(meta.width, meta.height)) ?? undefined
  const scaleRatio = scaleRatioOf(cores, tb.cls)
  const serveScale = serveScaleOffsets(cores, tb.cls)
  const cameraMoved = sustainedOrientationChange(capture?.orientationSamples, cores.filter((c) => c.classification === 'serve').map((c) => ({ start: c.window.start, end: c.window.end })))
  if (cameraMoved) warnings.push('The phone moved during the serves: positions and spreads are unavailable (CAMERA_MOVED).')

  // Metrics per serve.
  const results: PerServeResult[] = []
  const framesMissing: (number | null)[] = []
  cores.forEach((core, k) => {
    const a = core.events.tossRelease ? core.events.tossRelease.tReal - 0.5 : core.window.start
    const b = core.events.contact ? core.events.contact.tReal + 0.5 : core.window.end
    const miss = missingShare(track, a, b, captureFps)
    framesMissing.push(miss)
    const servedFrom = capture?.serveSide === 'deuce' || capture?.serveSide === 'ad' ? capture.serveSide : clustered.get(core.index)?.side
    const ctx: MetricContext = {
      view,
      viewMismatch,
      cam: metricCam,
      captureFps,
      timeBase: tb.cls,
      timeScaleRelSigma: tb.relSigma,
      condition,
      playerHeightM: H,
      heightEntered,
      intendedType: intended ?? 'unknown',
      cameraSide,
      servedFrom,
      targetTag: input.targetTags?.[core.index] ?? (capture?.intendedTarget && capture.intendedTarget !== 'mixed' ? capture.intendedTarget : undefined),
      framesMissingShare: miss ?? 0,
      ...(bodyPx1080 !== undefined ? { bodyPx1080 } : {}),
      contactCut: framing[k] === 'contact-cut',
      ...(scaleRatio !== null ? { scaleOff: Math.abs(scaleRatio - 1) } : {}),
      ...(serveScale.has(core.index) ? { serveScaleOff: serveScale.get(core.index)! } : {}),
      cameraMoved,
    }
    results.push(computeServeMetrics(core, track, ctx))
  })

  // Quality.
  const lostTimes = input.poses.filter((p) => p.track?.reason === 'lost').map((p) => p.tReal)
  const lost = cores.map((c) => lostTimes.some((t) => t >= c.window.start && t <= c.window.end))
  const quality = computeQuality({
    serves: cores,
    cam,
    captureFps,
    timeBase: tb.cls,
    timeBaseNote: tb.note,
    displayedHeightPx: meta.height,
    shortSidePx: Math.min(meta.width, meta.height),
    condition,
    ...(input.light ? { light: input.light } : {}),
    lightAnswer: capture?.conditions?.light,
    audio: { on: audioOn, usable: audioTiming.usable && onsets.length > 0, reason: audioTiming.usable ? undefined : audioTiming.reason },
    view: { declared: view, mismatch: viewMismatch, mismatchShare, decided: viewEv.decided, contradicting: viewEv.contradicting },
    framesMissing,
    hardRejects: results.map((r) => r.hardRejects.length),
    framing,
    lostTracking: lost,
    cameraBump: cameraMoved,
    ...(standingRoll ? { standingRoll: { rollDeg: standingRoll.rollDeg, flagged: rollFlag } } : {}),
  })

  // Assemble ServeAnalysis records.
  const distances = cores.filter((c) => c.cameraDistanceM).map((c) => c.cameraDistanceM!)
  const cameraDistanceM = distances.length ? median(distances) : undefined
  const setupClass: SetupClass = setupClassOf(view, cam, cameraDistanceM || 7)
  // The set-up key (METRICS §1.6, §4.4): orientation, distance class and serving spot. Every stratum
  // of this clip shares it; coaching and the UI never pool or compare across set-ups.
  const setupKey = setupKeyOf({ orientation: cam.orientation, distanceM: cameraDistanceM, servingSpot: capture?.servingSpot })
  const analysedAt = new Date().toISOString()
  const stamp = {
    engineVersion: ENGINE_VERSION,
    contract: 1 as const,
    catalogueVersion: CATALOGUE_VERSION,
    poseModel: input.poses[0]?.source ?? 'unknown',
    poseBackend: 'cpu' as const,
    decodePath: meta.decodePath ?? 'webcodecs',
    analysedAt,
    durationMs: 0,
    paramsHash: String(hashString(JSON.stringify({ v: ENGINE_VERSION, view, H, handedness }))),
    bandsVersion: BANDS_VERSION,
  }
  const rectification = {
    status: metricCam.tiltStatus,
    source: cam.tiltSource,
    orientation: cam.orientation,
    fovDeg: Math.round(cam.fovLongDeg * 10) / 10,
    fovSource: cam.fovSource,
    ...(cam.pitch ? { pitchDeg: cam.pitch } : {}),
    ...(cam.roll ? { rollDeg: cam.roll } : {}),
  }
  const sessionServes: SessionServe[] = []
  const analyses: ServeAnalysis[] = cores.map((core, k) => {
    const r = results[k]
    const ev = serveEvents(core, track)
    const exclusions: ReasonCode[] = []
    if (core.classification !== 'serve') exclusions.push(core.classification === 'retoss' ? 'NO_CONTACT' : 'BALL_NOT_TRACKED')
    if (core.noContact) exclusions.push('NO_CONTACT')
    if (quality.blockedServeIds.has(core.index)) exclusions.push('EXCLUDED_BY_QUALITY')
    if (r.hardRejects.length && r.hardRejects.length >= 3) exclusions.push('IMPLAUSIBLE_VALUE')
    const included = core.classification === 'serve' && !quality.blockedServeIds.has(core.index)
    const ref = core.ref
    const toss = core.ball.toss
    const tr = track
    const frameAt = (t: number) => (tr.t.length ? tr.frameIndex[indexAt(tr, t)] : -1)
    const id = `${sessionId || 'session'}-serve-${String(core.index).padStart(2, '0')}`
    const hitWrist = core.hitWrist === 'left' ? LM.LEFT_WRIST : LM.RIGHT_WRIST
    const tc = core.events.contact?.tReal
    const wristAtContact = tc !== undefined ? pt(track, indexAt(track, tc), hitWrist, 0.3) : null
    const metricsOut = r.metrics as Partial<Record<MetricId, MetricValue>>
    for (const m of Object.values(metricsOut)) {
      if (!m) continue
      m.evidence = m.status !== 'unavailable' ? evidenceFor(m.id as MetricId, id, ev) : undefined
      if (!m.evidence) delete m.evidence
    }
    const analysis: ServeAnalysis = {
      schemaVersion: 1,
      id,
      sessionId,
      videoId,
      index: core.index,
      mode: view === 'rear' ? 'outcomes' : 'technique',
      view,
      handedness,
      window: { startFrame: frameAt(core.window.start), endFrame: frameAt(core.window.end), tStartReal: core.window.start, tEndReal: core.window.end },
      detection: {
        confidence: core.window.confidence,
        cues: ['toss-arm', ...(core.ball.toss ? (['ball-above-head'] as const) : []), ...(core.audioContact ? (['audio-contact'] as const) : [])],
        kind: core.classification === 'serve' ? 'serve' : core.classification === 'retoss' ? 'toss-only' : 'uncertain',
        anchor: 'pose-arm-run',
      },
      events: Object.fromEntries(Object.entries(ev).filter(([, v]) => v !== undefined)),
      phases: buildPhases(core, track),
      rectification,
      toss:
        toss?.status === 'ok' && toss.release && toss.apex && ref
          ? {
              release: ev.tossRelease!,
              apex: {
                ...ev.tossApex!,
                bracketed: core.ball.apexCase === 'bracketed',
                aboveFrame: core.ball.apexCase === 'fitted-above' || core.ball.apexCase === 'censored',
                extrapolated: core.ball.apexCase === 'fitted-above',
              },
              apexXY: { x: toss.apex.x, y: toss.apex.y },
              apexAboveGroundBH: { value: (ref.yFloor - toss.apex.y) / ref.bodyHeightHU, sigma: (toss.apex.yUncertaintyNorm ?? 0) / ref.bodyHeightHU },
              apexForwardOfToeBH: core.s0 && view === 'side' ? { value: (core.netDir * (toss.apex.x - core.s0.x) * cam.aspect) / ref.bodyHeightHU, sigma: 0.021 } : undefined,
              gravity: toss.gravity.status === 'ok' ? { status: 'ok', plausible: toss.gravity.plausible, timeScaleFactor: toss.gravity.timeScaleFactor, apparentGravityMps2: toss.gravity.apparentGravityMps2 } : { status: 'unavailable' },
              fitRmseNorm: toss.fit?.rmse ?? 0,
              detections: core.ball.detections,
            }
          : null,
      contact: core.events.contact
        ? {
            event: ev.contact!,
            ballXY: !core.contactWristOnly && core.ball.parabola && tc !== undefined ? { x: core.ball.parabola.xa * tc * tc + core.ball.parabola.xb * tc + core.ball.parabola.xc, y: core.ball.parabola.a * tc * tc + core.ball.parabola.b * tc + core.ball.parabola.c } : undefined,
            wristXY: wristAtContact ? { x: wristAtContact.x, y: wristAtContact.y } : undefined,
            heightOverStature: r.raw.contactRatio !== undefined ? { value: r.raw.contactRatio, sigma: r.sigmas['contact-height-ratio']?.r ?? 0 } : undefined,
            methodSpreadMs: core.contactMethods.length >= 2 ? (Math.max(...core.contactMethods.map((m) => m.t)) - Math.min(...core.contactMethods.map((m) => m.t))) * 1000 : undefined,
          }
        : null,
      legDrive:
        view === 'side' && core.events.trophy
          ? {
              lowestHip: ev.lowestHip!,
              hipDropPctH: r.raw.loadingPct !== undefined ? { value: r.raw.loadingPct, sigma: 2.8 } : undefined,
              hipRisePctH: r.raw.legDrivePct !== undefined ? { value: r.raw.legDrivePct, sigma: r.sigmas['leg-drive']?.r ?? 3 } : undefined,
              driveTimeMs: r.raw.driveMs !== undefined ? { value: r.raw.driveMs, sigma: r.sigmas['drive-time']?.r ?? 50 } : undefined,
              airborneAtContact: core.events.landing?.airborneAtContact,
              deepBend: metricsOut['deep-bend-flag']?.flag !== undefined ? { flag: !!metricsOut['deep-bend-flag']!.flag, probability: Number(metricsOut['deep-bend-flag']!.secondary?.probabilityDeep ?? 0) } : undefined,
            }
          : null,
      shoulder: view === 'side' && r.raw.shoulderTiltDeg !== undefined ? { trophyTilt2DDeg: { value: r.raw.shoulderTiltDeg, sigma: 6 }, bandConfidence: 0 } : null,
      rear:
        view === 'rear'
          ? {
              knee: r.raw.kneeDeg !== undefined ? { flexion2DDeg: { value: r.raw.kneeDeg, sigma: 6.5 }, band: metricsOut['knee-bend-band']?.band === 'unclear' ? undefined : (metricsOut['knee-bend-band']?.band as 'low' | 'typical' | 'high' | undefined), bandConfidence: Math.max(...Object.values(metricsOut['knee-bend-band']?.bandProbabilities ?? { a: 0 })) } : undefined,
              shoulderOverShoulder: r.raw.sosDeg !== undefined ? { atContact2DDeg: { value: r.raw.sosDeg, sigma: 6 }, bandConfidence: 0 } : undefined,
            }
          : null,
      landing: core.events.landing
        ? {
            event: core.events.landing.event,
            foot: core.events.landing.foot === 'both' || core.events.landing.foot === 'unknown' ? core.events.landing.foot : core.events.landing.foot === core.frontFoot ? 'front' : 'back',
            forwardOfSetupToeBH: r.raw.landingCm !== undefined && ref ? { value: r.raw.landingCm / 100 / H, sigma: 0.03 } : undefined,
            footPoint: 'heel-toe',
          }
        : null,
      audio: { usable: onsets.length > 0, reason: onsets.length ? undefined : audioOn ? audioTiming.reason : 'Hit-sound timing was off.', contact: core.audioContact },
      speed:
        metricsOut['speed-experimental']?.status === 'experimental' && metricsOut['speed-experimental']!.uncertainty
          ? { metricId: 'speed-experimental', quantity: 'launch-near-contact', method: 'track-side', targetTag: input.targetTags?.[core.index], lowKmh: metricsOut['speed-experimental']!.uncertainty!.low, highKmh: metricsOut['speed-experimental']!.uncertainty!.high, assumptions: ['target tag bounds the angle out of the picture', 'scale from your height'] }
          : null,
      metrics: metricsOut,
      quality: { overall: included ? (r.softFlags.length ? 'usable' : 'good') : 'poor', checks: [] },
      plausibility: { hardRejects: r.hardRejects, softFlags: r.softFlags },
      included,
      exclusions,
      keyFrames: {},
      engine: stamp,
    }
    const stratum: StratumKey = {
      view,
      cameraSide: view === 'side' ? cameraSide : 'unknown',
      courtSide: capture?.serveSide === 'deuce' || capture?.serveSide === 'ad' ? capture.serveSide : clustered.get(core.index)?.side ?? 'unknown',
      serveNumber,
      intendedType: intended ?? 'unknown',
      handedness,
      setup: setupKey,
    }
    sessionServes.push({ analysis, core, result: r, stratum })
    return analysis
  })

  // Speed session values (experimental): typical = median of per-serve midpoints; fastest = max. Only
  // serves kept for statistics count (a serve blocked for dropped frames or lost tracking does not).
  const ranged = (m: MetricValue | undefined): m is MetricValue => !!m && m.status === 'experimental' && !!m.uncertainty
  const speeds = analyses.filter((a) => a.included).map((a) => a.metrics['speed-experimental']).filter(ranged)
  const speedMetrics: MetricValue[] = []
  if (view === 'side') {
    const nServes = analyses.filter((a) => a.detection.kind === 'serve').length
    if (speeds.length) {
      const mids = speeds.map((m) => (m.uncertainty!.low + m.uncertainty!.high) / 2)
      const lows = speeds.map((m) => m.uncertainty!.low)
      const highs = speeds.map((m) => m.uncertainty!.high)
      speedMetrics.push(
        finalizeMetric('speed-experimental', { value: `${Math.round(median(lows) / 5) * 5}–${Math.round(median(highs) / 5) * 5}`, quantity: 'launch-speed', confidence: 0.4, basis: `typical launch speed range over ${speeds.length} of ${nServes} serves (experimental)`, uncertainty: { kind: 'range', low: Math.round(median(lows) / 5) * 5, high: Math.round(median(highs) / 5) * 5 }, secondary: { fastestMidKmh: Math.round(Math.max(...mids)) }, n: speeds.length, nEligible: nServes, downgrades: [{ cap: 'experimental', reason: 'VALIDATION_PENDING' }] }, condition),
      )
    } else {
      const excludedOnly = analyses.some((a) => !a.included && ranged(a.metrics['speed-experimental']))
      const reason = excludedOnly ? 'EXCLUDED_BY_QUALITY' : analyses.map((a) => a.metrics['speed-experimental']?.reasonCode).find((r) => r) ?? 'FPS_TOO_LOW'
      speedMetrics.push(unavailable('speed-experimental', reason, 'launch speed from the ball track just after contact', { quantity: 'launch-speed' }))
    }
    speedMetrics.push(unavailable('speed-average-rear', 'NEEDS_REAR_VIEW', 'average speed to a bounce seen from behind', { quantity: 'average-speed' }))
  } else if (view === 'rear') {
    speedMetrics.push(unavailable('speed-experimental', 'NEEDS_SIDE_VIEW', 'launch speed needs the side view', { quantity: 'launch-speed' }))
    speedMetrics.push(unavailable('speed-average-rear', 'NEEDS_CALIBRATION', 'average speed to the located bounce', { quantity: 'average-speed' }))
  } else {
    speedMetrics.push(unavailable('speed-experimental', 'NEEDS_SIDE_VIEW', 'launch speed needs the side view', { quantity: 'launch-speed' }))
    speedMetrics.push(unavailable('speed-average-rear', 'NEEDS_REAR_VIEW', 'average speed needs the view from behind', { quantity: 'average-speed' }))
  }
  // Capture quality (DECISIONS D2 addendum, 2026-09-28): a data-quality gate, always shown, labelled
  // experimental ("Automatic check, experimental") until its checks pass validation on real footage.
  // Its status comes from the catalogue like every other value: target measured, validation V0
  // (metrics.json validationState V0-synthetic-inconclusive), so experimental with VALIDATION_PENDING.
  const captureQuality: MetricValue = finalizeMetric(
    'capture-quality',
    {
      value: quality.report.overall,
      confidence: 1,
      basis: `Automatic check, experimental (tested on simulated footage only): ${quality.reasons.length ? quality.reasons.join(' ') : 'all capture checks passed'}`,
      display: quality.report.overall === 'good' ? 'Good' : quality.report.overall === 'usable' ? 'Fair' : 'Limited',
      secondary: { score: quality.score },
    },
    condition,
  )
  const inputsHash = String(hashString(JSON.stringify({ n: input.poses.length, t: input.ball.tracks.length, o: input.onsets.length, view, H, handedness, tags: input.targetTags ?? {} })))
  const { stats } = buildSessionStats(
    sessionServes,
    {
      sessionId: sessionId || 'session',
      view,
      condition,
      captureFps,
      playerHeightM: H,
      heightEntered,
      sex: input.profile.sex,
      quality: quality.report,
      intendedType: intended,
      targetTags: input.targetTags,
      track,
      blockRejectShare: quality.blockRejectShare,
      cameraMoved,
    },
    { captureQuality, speed: speedMetrics, inputsHash },
  )
  if (sessionId) stats.sessionId = sessionId
  // With no serve at all, still return every id with a status (D2).
  for (const id of METRIC_IDS) if (!stats.metrics[id]) stats.metrics[id] = unavailable(id, 'TOO_FEW_SERVES', 'no serves were analysed', { n: 0 })
  // Setup class and the representative serve, for matching and key frames.
  stats.derivedPerServe = Object.fromEntries(analyses.map((a) => [a.id, {}]))
  stats.setupClass = setupClass
  stats.setupKey = setupKey
  if (cameraDistanceM !== undefined) stats.cameraDistanceM = Math.round(cameraDistanceM * 100) / 100
  if (!analyses.length) warnings.push('No serve was found in this video.')
  return { serves: analyses, stats, quality: quality.report, warnings }
}

/** Key-frame evidence events per metric (the event whose frame supports the value). */
function evidenceFor(id: MetricId, serveId: string, ev: Record<string, { frameIndex: number } | undefined>): MetricValue['evidence'] {
  const map: Partial<Record<MetricId, ('apex' | 'contact' | 'trophy' | 'lowestHip' | 'release' | 'landing')[]>> = {
    'toss-apex-height': ['apex'],
    'toss-forward': ['apex'],
    'toss-lateral': ['apex'],
    'toss-drop': ['apex', 'contact'],
    'contact-height-ratio': ['contact'],
    'contact-forward': ['contact'],
    'rhythm-release-to-contact': ['release', 'contact'],
    'leg-drive': ['lowestHip', 'contact'],
    'drive-time': ['lowestHip', 'contact'],
    'loading-depth': ['release', 'lowestHip'],
    'deep-bend-flag': ['lowestHip'],
    'shoulder-tilt-trophy': ['trophy'],
    'knee-bend-band': ['trophy'],
    'shoulder-over-shoulder-contact': ['contact'],
    'landing-distance': ['landing'],
    'trophy-pause': ['trophy'],
  }
  const key: Record<string, string> = { apex: 'tossApex', contact: 'contact', trophy: 'trophy', lowestHip: 'lowestHip', release: 'tossRelease', landing: 'landing' }
  const events = map[id]
  if (!events) return undefined
  const out = events
    .map((e) => ({ e, x: ev[key[e]] }))
    .filter((x) => x.x && x.x.frameIndex >= 0)
    .map((x) => ({ serveId, event: x.e, frameIndex: x.x!.frameIndex }))
  return out.length ? out : undefined
}
