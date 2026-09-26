/**
 * Ball-layer entry points: setup from pose, per-frame detection, and the clip-level
 * analysis (tracks, toss events, time-base check, speed, player-facing metrics).
 *
 * Time base: every time here is in the frames' timestamp base (DecodedFrame.tReal). When
 * the video layer could not prove the capture rate (possible rendered slow motion), pass
 * timeBaseKnown = false: the tracker then allows slow-motion toss durations, and the
 * gravity check says whether a correction should be applied before re-running.
 */
import type {
  AudioOnset,
  BallTrack,
  CameraView,
  DecodedFrame,
  Handedness,
  Landmark,
  MetricValue,
  PoseFrame,
  ServeEvents,
} from '../types.ts'
import { clamp } from './colour.ts'
import { BallDetector, BROAD_SIZE_PRIOR, type DetectorOptions } from './detector.ts'
import { median } from './fit.ts'
import {
  bodyHeightFromPose,
  expectedBallRadiusNorm,
  scaleFromBodyHeight,
  tossRegionFromPose,
  type BodyHeightEstimate,
  type PixelScale,
  type RegionOfInterest,
} from './scale.ts'
import {
  estimateServeSpeedFromTrack,
  MAIN_CAMERA_FOCAL_LONG_SIDE,
  SPEED_OF_SOUND_MPS,
  speedFromFlightTime,
  type FlightTimeSpeedEstimate,
  type SpeedUnavailable,
  type TrackSpeedEstimate,
} from './speed.ts'
import { analyseToss, gravityAccelerationPrior, toEventEstimate, type GravityCheck, type TossAnalysis, type TossAnalysisOptions } from './toss.ts'
import { trackBall, type FrameCandidates, type TrackerResult } from './tracker.ts'

/** Longest real toss flight the tracker should consider (s). */
const MAX_TOSS_REAL_S = 3
/** Slowest supported un-corrected slow motion (1/8: 240 fps timestamped as 30 fps). */
const MIN_UNKNOWN_TIME_SCALE = 1 / 8
/** Head-top from the nose landmark is uncertain by ~2% of stature (1 sigma). */
const HEAD_TOP_REL_SIGMA = 0.02
/** Floor from the heel landmarks, ~1% of stature (1 sigma). */
const GROUND_REL_SIGMA = 0.01
/** Ball a few tens of cm in front of / behind the player's plane changes the scale by ~5%. */
const TOSS_DEPTH_REL_SIGMA = 0.05

export interface BallSetup {
  /** Frame width / height. */
  aspect: number
  body: BodyHeightEstimate | null
  scale: PixelScale | null
  /** Expected ball radius (frame-height units) at the player's depth; enables size gating. */
  expectedRadiusNorm?: number
  /** Band above the server where the toss should appear (union of both hands if handedness is unknown). */
  tossRoi: RegionOfInterest | null
  notes: string[]
}

export interface BallSetupOptions {
  aspect: number
  handedness?: Handedness
  /** Player-entered height (m); the adult default is used otherwise (wider range). */
  playerHeightM?: number | null
  /** Poses from the first setupWindowS seconds are treated as the standing setup phase. Default 1.0. */
  setupWindowS?: number
  /**
   * Standing stature in frame-height units from elsewhere (e.g. the pose layer's
   * estimateStandingBodyHeight) with its 1-sigma relative error; overrides the estimate here.
   */
  bodyHeightNorm?: { value: number; relSigma: number }
}

function medianPose(frames: PoseFrame[]): Landmark[] | null {
  const withPose = frames.filter((f): f is PoseFrame & { landmarks: Landmark[] } => !!f.landmarks)
  if (withPose.length === 0) return null
  return withPose[withPose.length >> 1].landmarks
}

function unionRoi(a: RegionOfInterest | null, b: RegionOfInterest | null): RegionOfInterest | null {
  if (!a) return b
  if (!b) return a
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

/**
 * Scale, expected ball size and toss band from the setup phase (player standing still before
 * the toss). Median over the setup window; falls back to the whole clip with a wider error.
 */
export function ballSetupFromPoses(poses: PoseFrame[], options: BallSetupOptions): BallSetup {
  const notes: string[] = []
  const sorted = [...poses].sort((a, b) => a.tReal - b.tReal)
  const t0 = sorted[0]?.tReal ?? 0
  let window = sorted.filter((p) => p.tReal <= t0 + (options.setupWindowS ?? 1.0))
  const estimate = (frames: PoseFrame[]) =>
    frames.map((p) => (p.landmarks ? bodyHeightFromPose(p.landmarks, options.aspect) : null)).filter((b): b is BodyHeightEstimate => !!b)
  let bodies = estimate(window)
  let fallbackRel = 0
  if (bodies.length < 3) {
    notes.push('player not fully visible during setup; stature taken from the whole clip')
    window = sorted
    bodies = estimate(window)
    fallbackRel = 0.05
  }
  let body: BodyHeightEstimate | null = null
  if (bodies.length > 0) {
    const heights = bodies.map((b) => b.heightNorm)
    const heightNorm = median(heights)
    const spread = median(heights.map((h) => Math.abs(h - heightNorm))) * 1.4826
    body = {
      heightNorm,
      relSigma: Math.hypot(median(bodies.map((b) => b.relSigma)), spread / heightNorm, fallbackRel),
      groundY: median(bodies.map((b) => b.groundY)),
      headTopY: median(bodies.map((b) => b.headTopY)),
    }
  } else {
    notes.push('stature unavailable (nose or feet not visible): no metre scale, ball size not gated')
  }
  const external = options.bodyHeightNorm && options.bodyHeightNorm.value > 0 ? options.bodyHeightNorm : null
  if (external && body) body = { ...body, heightNorm: external.value, relSigma: external.relSigma }
  if (external && !body) notes.push('stature given, but no head or floor reference from pose: toss heights unavailable')
  const statureNorm = external?.value ?? body?.heightNorm
  const statureRel = external?.relSigma ?? body?.relSigma ?? 0.05
  const scale = statureNorm ? scaleFromBodyHeight(statureNorm, statureRel, options.playerHeightM ?? null) : null
  const reference = medianPose(window)
  let tossRoi: RegionOfInterest | null = null
  if (reference && statureNorm) {
    const hands: Handedness[] = options.handedness ? [options.handedness] : ['right', 'left']
    for (const hand of hands) tossRoi = unionRoi(tossRoi, tossRegionFromPose(reference, hand, options.aspect, statureNorm))
  }
  return {
    aspect: options.aspect,
    body,
    scale,
    expectedRadiusNorm: scale ? expectedBallRadiusNorm(scale) : undefined,
    tossRoi,
    notes,
  }
}

export interface BallFrameDetectorOptions {
  setup: Pick<BallSetup, 'expectedRadiusNorm' | 'tossRoi'>
  /**
   * Search only the toss band for frames before this time (e.g. the contact onset from audio);
   * later frames are searched whole so the outgoing ball is not cut off. Omit to never restrict.
   */
  tossRoiUntilTReal?: number
  /**
   * From this time on (default: tossRoiUntilTReal) the size prior is broadened: after contact
   * the ball leaves the player's depth and, in a rear view, shrinks to a third within frames.
   */
  broadSizeFromTReal?: number
  detector?: DetectorOptions
}

/** Stateful per-frame detector (owns the running background). Feed frames in time order. */
export function createBallFrameDetector(options: BallFrameDetectorOptions): (frame: DecodedFrame) => FrameCandidates {
  const detector = new BallDetector({ expectedRadiusNorm: options.setup.expectedRadiusNorm, ...options.detector })
  const broadFrom = options.broadSizeFromTReal ?? options.tossRoiUntilTReal
  return (frame) => {
    const overrides: Parameters<BallDetector['detect']>[1] = {}
    if (options.setup.tossRoi && options.tossRoiUntilTReal !== undefined && frame.tReal < options.tossRoiUntilTReal) {
      overrides.roi = options.setup.tossRoi
    }
    if (broadFrom !== undefined && frame.tReal >= broadFrom) overrides.sizePrior = BROAD_SIZE_PRIOR
    const candidates = detector.detect({ image: frame.image, tReal: frame.tReal }, overrides)
    return { frameIndex: frame.index, tReal: frame.tReal, candidates }
  }
}

export interface TimeBaseSuggestion {
  /**
   * consistent: timestamps match real time (keep them);
   * apply-correction: timestamps are slowed by a standard slow-motion ratio; multiply them by
   *   timeScale (e.g. VideoMeta via applyTimeScale(meta, captureFps, timeScale, 'physics'))
   *   and re-run the analysis;
   * inconclusive: the check could not decide (see basis).
   */
  status: 'consistent' | 'apply-correction' | 'inconclusive'
  timeScale?: number
  /** Multiply the timestamp frame rate by this to get the capture frame rate. */
  captureFpsFactor?: number
  basis: string
}

export function suggestTimeBase(gravity: GravityCheck): TimeBaseSuggestion {
  if (gravity.status !== 'ok') return { status: 'inconclusive', basis: gravity.reason ?? 'gravity check unavailable' }
  const range = `implied factor ${gravity.timeScaleFactor!.toFixed(3)} (${gravity.low!.toFixed(3)}-${gravity.high!.toFixed(3)})`
  if (gravity.plausible) return { status: 'consistent', timeScale: 1, captureFpsFactor: 1, basis: `toss falls at g in real time: ${range}` }
  const nearest = gravity.nearestStandard
  if (nearest && nearest.consistent && nearest.factor !== 1) {
    return {
      status: 'apply-correction',
      timeScale: nearest.factor,
      captureFpsFactor: 1 / nearest.factor,
      basis: `toss falls too slowly for real time: ${range}, consistent with ${nearest.label}`,
    }
  }
  return {
    status: 'inconclusive',
    basis: `${range} matches neither real time nor a standard slow-motion ratio; check the player height and camera view`,
  }
}

export interface BallAnalysisOptions {
  setup: Pick<BallSetup, 'aspect' | 'scale' | 'expectedRadiusNorm' | 'body'>
  /** True capture frame rate (after any slow-motion correction). */
  captureFps: number
  /** The video layer proved the time base (container / metadata) or it was corrected already. */
  timeBaseKnown: boolean
  cameraView?: CameraView
  /** Fused contact time (pose + audio), when known. */
  contactTReal?: number
  /**
   * Audio onsets in the same time base, only when audio timing is usable (video layer
   * assessAudioTiming). Used for the contact time (if not given) and flight-time speed.
   */
  onsets?: AudioOnset[]
  seed?: number
}

export interface BallAnalysis {
  tracker: TrackerResult
  tracks: BallTrack[]
  toss: TossAnalysis | null
  /** Toss events, and contact measured where the outgoing path meets the toss path. */
  events: Pick<ServeEvents, 'tossRelease' | 'tossApex' | 'contact'>
  timeBase: TimeBaseSuggestion
  speedFromTrack: TrackSpeedEstimate | SpeedUnavailable
  speedFromFlightTime: FlightTimeSpeedEstimate | SpeedUnavailable
  metrics: MetricValue[]
}

/**
 * Sound travel time player -> phone. Distance from the scale and the 1x main camera's focal
 * length (zoomed shots are further away than this implies), clamped to 2-12 m; 10 ms
 * without a scale.
 */
export function soundDelayEstimateS(scale: PixelScale | null, aspect: number): number {
  if (!scale || !(scale.unitsPerM > 0)) return 0.01
  const focalFhu = MAIN_CAMERA_FOCAL_LONG_SIDE * Math.max(1, aspect)
  return clamp(focalFhu / scale.unitsPerM, 2, 12) / SPEED_OF_SOUND_MPS
}

function nearestFrameIndex(frames: FrameCandidates[], t: number): number {
  let best = frames[0]
  for (const f of frames) if (Math.abs(f.tReal - t) < Math.abs(best.tReal - t)) best = f
  return best?.frameIndex ?? -1
}

/** First onset of a kind inside [from, to] (timestamp base). */
function firstOnset(onsets: AudioOnset[] | undefined, kind: AudioOnset['kind'], from: number, to: number): AudioOnset | undefined {
  return onsets?.filter((o) => o.kind === kind && o.tReal >= from && o.tReal <= to).sort((a, b) => a.tReal - b.tReal)[0]
}

export function analyseBall(frames: FrameCandidates[], options: BallAnalysisOptions): BallAnalysis {
  const { setup } = options
  const maxTossDurationS = options.timeBaseKnown ? MAX_TOSS_REAL_S : MAX_TOSS_REAL_S / MIN_UNKNOWN_TIME_SCALE
  const trackerBase = { aspect: setup.aspect, expectedRadiusNorm: setup.expectedRadiusNorm, maxTossDurationS, seed: options.seed }
  // Gravity pins an apex beyond the observed arc, but only in a proven real-time base.
  const tossOptions: TossAnalysisOptions = {
    aspect: setup.aspect,
    scale: setup.scale,
    accelerationPrior: options.timeBaseKnown && setup.scale ? gravityAccelerationPrior(setup.scale) : undefined,
  }
  // Pass 1 finds the toss; the contact onset is then searched after its apex.
  let tracker = trackBall(frames, { ...trackerBase, contactTReal: options.contactTReal })
  let toss = tracker.toss ? analyseToss(tracker.toss.track, tracker.toss.leadIn, tossOptions) : null
  let contactOnset: AudioOnset | undefined
  if (toss?.status === 'ok' && toss.apex) {
    contactOnset = firstOnset(options.onsets, 'contact', toss.apex.tReal, toss.apex.tReal + 1.0)
  }
  // The pop reaches the phone after the ball left the strings; the tracker tolerates the
  // residual error of this estimate (contactSlackS).
  const contactTReal =
    options.contactTReal ?? (contactOnset ? contactOnset.tReal - soundDelayEstimateS(setup.scale, setup.aspect) : undefined)
  if (options.contactTReal === undefined && contactTReal !== undefined) {
    tracker = trackBall(frames, { ...trackerBase, contactTReal })
    toss = tracker.toss ? analyseToss(tracker.toss.track, tracker.toss.leadIn, tossOptions) : null
  }
  const timeBase = suggestTimeBase(toss?.gravity ?? { status: 'unavailable', reason: 'no toss track found' })
  const realTime = options.timeBaseKnown || timeBase.status === 'consistent'

  const events: BallAnalysis['events'] = {}
  if (toss?.status === 'ok' && toss.release && toss.apex) {
    events.tossRelease = toEventEstimate(toss.release)
    events.tossApex = toEventEstimate(toss.apex)
  }
  const measuredContact = tracker.outgoing?.contactFromTracks
  if (measuredContact) {
    events.contact = {
      frameIndex: nearestFrameIndex(frames, measuredContact.tReal),
      tReal: measuredContact.tReal,
      uncertaintyS: measuredContact.uncertaintyS,
      confidence: measuredContact.uncertaintyS < 0.005 ? 0.8 : 0.5,
      method: 'ball-track-intersection',
    }
  }

  const slowMotionReason =
    timeBase.status === 'apply-correction'
      ? `timestamps look like ${Math.round(1 / timeBase.timeScale!)}x slow motion; apply the time-scale correction and re-run`
      : 'the time base is not verified (possible slow motion) and the toss check could not confirm real time'
  const speedFromTrack: TrackSpeedEstimate | SpeedUnavailable = !realTime
    ? { status: 'unavailable', reason: slowMotionReason, unlockHint: 'Share the original slow-motion file, or enter the recording frame rate.' }
    : !tracker.outgoing
      ? { status: 'unavailable', reason: 'the ball was not tracked after contact', unlockHint: 'Film side-on at 120 or 240 fps with the ball path inside the frame.' }
      : estimateServeSpeedFromTrack(tracker.outgoing.track, {
          // The ball-path intersection is the best contact anchor when the toss was tracked too.
          contactTReal: measuredContact?.tReal ?? tracker.outgoing.contactTReal,
          captureFps: options.captureFps,
          aspect: setup.aspect,
          scale: setup.scale,
          cameraView: options.cameraView,
        })

  let speedFromAudio: FlightTimeSpeedEstimate | SpeedUnavailable
  const bounceOnset = contactOnset ? firstOnset(options.onsets, 'bounce', contactOnset.tReal + 0.2, contactOnset.tReal + 2.0) : undefined
  if (!realTime) speedFromAudio = { status: 'unavailable', reason: slowMotionReason, unlockHint: 'Share the original file with sound.' }
  else if (!contactOnset || !bounceOnset) {
    speedFromAudio = {
      status: 'unavailable',
      reason: !contactOnset ? 'racket contact sound not found after the toss' : 'bounce sound not found 0.2-2.0 s after contact',
      unlockHint: 'Record with sound on in a quiet setting, close enough to hear the bounce.',
    }
  } else speedFromAudio = speedFromFlightTime({ contactOnsetTReal: contactOnset.tReal, bounceOnsetTReal: bounceOnset.tReal })

  return {
    tracker,
    tracks: tracker.tracks,
    toss,
    events,
    timeBase,
    speedFromTrack,
    speedFromFlightTime: speedFromAudio,
    metrics: [
      tossHeightMetric('ball.tossApexAboveHeadM', 'above the top of the head', toss, setup, 'head'),
      tossHeightMetric('ball.tossApexHeightM', 'above the court', toss, setup, 'ground'),
      trackSpeedMetric(speedFromTrack),
      flightTimeSpeedMetric(speedFromAudio),
    ],
  }
}

/**
 * Toss apex height in metres against a pose reference: 'estimated' (it rests on the player's
 * height and the ball staying near the player's plane), with a ~95% range from the apex fit,
 * the reference landmark, the scale and the depth assumption.
 */
export function tossHeightMetric(
  id: string,
  what: string,
  toss: TossAnalysis | null,
  setup: Pick<BallSetup, 'scale' | 'body'>,
  reference: 'head' | 'ground',
): MetricValue {
  const unavailable = (reason: string, unlockHint: string): MetricValue => ({
    id,
    value: null,
    unit: 'm',
    status: 'unavailable',
    confidence: 0,
    basis: `toss apex height ${what}`,
    unavailableReason: reason,
    unlockHint,
  })
  if (!toss || toss.status !== 'ok' || !toss.apex) {
    return unavailable(toss?.reason ?? 'no toss found', 'Keep the whole toss in frame against a plain background.')
  }
  if (!setup.scale || !setup.body) {
    return unavailable('no metre scale: the player was not fully visible standing', 'Frame the whole player, head to feet, before the serve.')
  }
  const { body, scale } = setup
  const referenceY = reference === 'head' ? body.headTopY : body.groundY
  const referenceSigma = (reference === 'head' ? HEAD_TOP_REL_SIGMA : GROUND_REL_SIGMA) * body.heightNorm
  const valueM = (referenceY - toss.apex.y) / scale.unitsPerM
  const sigmaM = Math.hypot(
    Math.hypot(toss.apex.yUncertaintyNorm, referenceSigma) / scale.unitsPerM,
    Math.hypot(scale.relSigma, TOSS_DEPTH_REL_SIGMA) * Math.abs(valueM),
  )
  return {
    id,
    value: valueM,
    unit: 'm',
    status: 'estimated',
    uncertainty: { kind: 'range', low: valueM - 2 * sigmaM, high: valueM + 2 * sigmaM },
    confidence: toss.apex.confidence,
    basis:
      `ball-apex fit (${toss.fit?.detections ?? 0} detections${toss.apex.aboveFrame ? ', apex above the frame, extrapolated' : ''}) ` +
      `vs ${reference === 'head' ? 'head top' : 'floor'} from pose; scale from ${scale.basis}`,
  }
}

export function trackSpeedMetric(estimate: TrackSpeedEstimate | SpeedUnavailable): MetricValue {
  const id = 'ball.serveSpeedKmh'
  if (estimate.status === 'unavailable') {
    return { id, value: null, unit: 'km/h', status: 'unavailable', confidence: 0, basis: 'ball track after contact', unavailableReason: estimate.reason, unlockHint: estimate.unlockHint }
  }
  return {
    id,
    value: estimate.valueKmh,
    unit: 'km/h',
    status: 'experimental',
    uncertainty: { kind: 'range', low: estimate.lowKmh, high: estimate.highKmh },
    confidence: estimate.confidence,
    basis: estimate.basis,
  }
}

export function flightTimeSpeedMetric(estimate: FlightTimeSpeedEstimate | SpeedUnavailable): MetricValue {
  const id = 'ball.serveSpeedAverageAudioKmh'
  if (estimate.status === 'unavailable') {
    return { id, value: null, unit: 'km/h', status: 'unavailable', confidence: 0, basis: 'contact and bounce sounds', unavailableReason: estimate.reason, unlockHint: estimate.unlockHint }
  }
  return {
    id,
    value: estimate.average.valueKmh,
    unit: 'km/h',
    status: 'experimental',
    uncertainty: { kind: 'range', low: estimate.average.lowKmh, high: estimate.average.highKmh },
    confidence: estimate.confidence,
    basis: `average speed over the flight: ${estimate.basis}`,
  }
}
