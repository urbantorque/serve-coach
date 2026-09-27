/**
 * Ball-layer entry points: setup from pose, per-frame detection, and the clip-level
 * analysis (tracks, toss events, time-base check, speed, player-facing metrics).
 *
 * Time base: every time here is in the frames' timestamp base (DecodedFrame.tReal). When
 * the video layer could not prove the capture rate (possible rendered slow motion), pass
 * timeBaseKnown = false: the tracker then allows slow-motion toss durations, and the
 * gravity check says whether a correction should be applied before re-running.
 *
 * Metric ids are the canonical ones (toss-apex-height, speed-experimental,
 * speed-average-rear, spin). Audio is used only to time contact (D4).
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
import { detectBounce, mapBounceToCourt, type BounceEstimate, type BounceUnavailable, type CourtPlacement } from './bounce.ts'
import { clamp } from './colour.ts'
import { BallDetector, BROAD_SIZE_PRIOR, TOSS_PLAIN_SUPPORT_GATE, type DetectorOptions } from './detector.ts'
import { median } from './fit.ts'
import type { Mat3, ServeSide } from './homography.ts'
import {
  bodyHeightFromPose,
  expectedBallRadiusNorm,
  GRAVITY_MPS2,
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
  type SpeedRange,
  type SpeedUnavailable,
  type TargetTag,
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
   * Search only the toss band, with the toss-phase plain-colour gate, before this time: the
   * contact time with the sound delay removed
   * (e.g. strongestTransient(onsets) minus soundDelayEstimateS). The band ends
   * TOSS_ROI_END_MARGIN_S earlier still, so the first outgoing frames are searched whole even
   * when the time is a little late. Omit to never restrict.
   */
  tossRoiUntilTReal?: number
  /**
   * From this time on (default: tossRoiUntilTReal, except in the side view) the size prior is
   * broadened: after contact the ball leaves the player's depth and, in a rear view, shrinks
   * to a third within frames.
   */
  broadSizeFromTReal?: number
  /**
   * Side view: the outgoing ball stays near the player's depth (it leaves the image plane at
   * 0-24 deg), so the toss size prior is kept after contact. The broad prior there only adds
   * sub-ball colour seams from the swinging arm.
   */
  cameraView?: CameraView
  detector?: DetectorOptions
}

/** The toss band ends this long before the given contact time (s). */
export const TOSS_ROI_END_MARGIN_S = 0.02

/** Stateful per-frame detector (owns the running background). Feed frames in time order. */
export function createBallFrameDetector(options: BallFrameDetectorOptions): (frame: DecodedFrame) => FrameCandidates {
  const detector = new BallDetector({ expectedRadiusNorm: options.setup.expectedRadiusNorm, ...options.detector })
  const roiUntil = options.tossRoiUntilTReal !== undefined ? options.tossRoiUntilTReal - TOSS_ROI_END_MARGIN_S : undefined
  const broadFrom = options.broadSizeFromTReal ?? (options.cameraView === 'side' ? undefined : roiUntil)
  return (frame) => {
    const overrides: Parameters<BallDetector['detect']>[1] = {}
    if (roiUntil !== undefined && frame.tReal < roiUntil) {
      // Toss phase: the ball is slow and sharp, so colour seams on the player are gated out.
      Object.assign(overrides, TOSS_PLAIN_SUPPORT_GATE)
      if (options.setup.tossRoi) overrides.roi = options.setup.tossRoi
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
   * assessAudioTiming). Used only to time contact (D4); never for flight-time speed.
   */
  onsets?: AudioOnset[]
  /** Player-entered intended target (D3). Required for the side-view speed range (D4). */
  targetTag?: TargetTag | null
  /** Side the serve was hit from (player-entered or from the session flow). */
  servedFrom?: ServeSide
  /**
   * Rear view only: image -> court homography from the four-corner court tap (normalised image
   * points in, court metres out; see homography.ts) and its reprojection RMS in metres.
   */
  courtCalibration?: { imageToCourt: Mat3; rmsM: number }
  seed?: number
}

export interface BallAnalysis {
  tracker: TrackerResult
  tracks: BallTrack[]
  toss: TossAnalysis | null
  /** Toss events, and contact measured where the outgoing path meets the toss path. */
  events: Pick<ServeEvents, 'tossRelease' | 'tossApex' | 'contact'>
  timeBase: TimeBaseSuggestion
  /** Side view, near contact (speed-experimental). */
  speedFromTrack: TrackSpeedEstimate | SpeedUnavailable
  /** Rear view, contact to a bounce located in video (speed-average-rear). */
  averageSpeedRear: FlightTimeSpeedEstimate | SpeedUnavailable
  /** EXPERIMENTAL bounce on the outgoing track (rear view only). */
  bounce: BounceEstimate | BounceUnavailable
  /** EXPERIMENTAL court position of the bounce (rear view with a court calibration only). */
  placement: CourtPlacement | BounceUnavailable
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

/**
 * The racket pop: the strongest transient inside [from, to] (timestamp base) that is not
 * labelled a bounce. At serving distance the pop is the loudest sound of the serve by far
 * (about 20 dB above footsteps on the synthetic corpus), whereas the video layer's
 * contact / bounce label rests on a sharpness heuristic that is not validated (it labelled
 * the pop "unknown" and a footstep "contact" on the synthetic clips).
 */
export function strongestTransient(onsets: AudioOnset[] | undefined, from = -Infinity, to = Infinity): AudioOnset | undefined {
  return onsets?.filter((o) => o.kind !== 'bounce' && o.tReal >= from && o.tReal <= to).sort((a, b) => b.strength - a.strength)[0]
}

/**
 * Toss acceleration must be gravity within these factors: scale (entered or assumed height,
 * 1.2-5%), perspective (a rear camera sees the toss recede: about 0.85 on the corpus) and drag.
 */
const GRAVITY_BAND: [number, number] = [0.6, 1.5]
/** Time scales an unverified time base may have (standard slow-motion ratios down to 1/8). */
const UNKNOWN_TIME_SCALES = [1, 1 / 2, 1 / 4, 1 / 8]

/** Allowed toss accelerations (frame heights per timestamp-second^2) for the tracker. */
export function gravityBands(scale: PixelScale, timeBaseKnown: boolean): [number, number][] {
  const g = GRAVITY_MPS2 * scale.unitsPerM
  return (timeBaseKnown ? [1] : UNKNOWN_TIME_SCALES).map((s) => [GRAVITY_BAND[0] * g * s * s, GRAVITY_BAND[1] * g * s * s])
}

/** Slowest serve considered (m/s, about 72 km/h), times cos(24 deg) for the largest tag angle. */
const MIN_SERVE_IN_PLANE_MPS = 17
/** Largest launch direction from the image horizontal in the side view (deg): serve launch within about 15 deg, plus perspective and tilt. */
const SIDE_OUTGOING_MAX_ELEVATION_DEG = 30

/**
 * Side view: the outgoing ball is fast and nearly horizontal in the image, whereas colour
 * seams on the swinging arm near the contact point are slower and steep. Speed needs the
 * scale; in an unverified time base it allows the slowest supported slow motion (1/8).
 */
export function sideViewOutgoingLimits(
  scale: PixelScale | null,
  timeBaseKnown: boolean,
): { outgoingMaxElevationDeg: number; minOutgoingSpeedNormPerS?: number } {
  const limits: { outgoingMaxElevationDeg: number; minOutgoingSpeedNormPerS?: number } = { outgoingMaxElevationDeg: SIDE_OUTGOING_MAX_ELEVATION_DEG }
  if (scale) limits.minOutgoingSpeedNormPerS = MIN_SERVE_IN_PLANE_MPS * scale.unitsPerM * (timeBaseKnown ? 1 : MIN_UNKNOWN_TIME_SCALE)
  return limits
}

/** Assumed 1-sigma of the toss speed along the camera axis in a rear or front view (m/s). */
const TOSS_DEPTH_SPEED_SIGMA_MPS = 0.5

/**
 * Rear / front views: the toss also moves along the optical axis, so the image apex (where the
 * image y velocity is zero) is shifted from the true apex by about
 * (height above the camera) x (speed along the axis) / (distance x g). The axis speed is not
 * observable in one view, so it enters as a 1-sigma term (0.5 m/s). On the rendered rear
 * clip the apex error was -4.2 ms, about what this model gives for its 0.17 m/s toss.
 * Zero for the side view, where the toss moves across the image.
 */
export function apexPerspectiveSigmaS(apexY: number, scale: PixelScale | null, aspect: number, view: CameraView | undefined): number {
  if (view !== 'rear' && view !== 'front45') return 0
  if (!scale || !(scale.unitsPerM > 0)) return 0.015
  const distanceM = (MAIN_CAMERA_FOCAL_LONG_SIDE * Math.max(1, aspect)) / scale.unitsPerM
  const heightAboveCameraM = Math.abs(0.5 - apexY) / scale.unitsPerM
  return (heightAboveCameraM * TOSS_DEPTH_SPEED_SIGMA_MPS) / (distanceM * GRAVITY_MPS2)
}

/** 1-sigma of a contact time from pose/audio fusion or a sound onset (s). */
const FUSED_CONTACT_SIGMA_S = 0.01

export function analyseBall(frames: FrameCandidates[], options: BallAnalysisOptions): BallAnalysis {
  const { setup } = options
  const maxTossDurationS = options.timeBaseKnown ? MAX_TOSS_REAL_S : MAX_TOSS_REAL_S / MIN_UNKNOWN_TIME_SCALE
  const trackerBase = {
    aspect: setup.aspect,
    expectedRadiusNorm: setup.expectedRadiusNorm,
    maxTossDurationS,
    seed: options.seed,
    accelerationBandsNorm: setup.scale ? gravityBands(setup.scale, options.timeBaseKnown) : undefined,
    ...(options.cameraView === 'side' ? sideViewOutgoingLimits(setup.scale, options.timeBaseKnown) : {}),
  }
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
    contactOnset = strongestTransient(options.onsets, toss.apex.tReal + 0.05, toss.apex.tReal + 1.0)
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
    const apex = toEventEstimate(toss.apex)
    const perspective = apexPerspectiveSigmaS(toss.apex.y, setup.scale, setup.aspect, options.cameraView)
    events.tossApex = perspective > 0 ? { ...apex, uncertaintyS: Math.hypot(apex.uncertaintyS, perspective) } : apex
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
  const slowMotionHint = 'Share the original slow-motion file, or enter the recording frame rate.'
  const speedFromTrack: TrackSpeedEstimate | SpeedUnavailable =
    options.cameraView === 'side' && !realTime
      ? { status: 'unavailable', reason: slowMotionReason, unlockHint: slowMotionHint }
      : options.cameraView === 'side' && !tracker.outgoing
        ? { status: 'unavailable', reason: 'the ball was not tracked after contact', unlockHint: 'Film side-on at 120 or 240 fps with the ball path inside the frame.' }
        : estimateServeSpeedFromTrack(tracker.outgoing?.track ?? { id: 0, kind: 'outgoing', observations: [] }, {
            // The ball-path intersection is the best contact anchor when the toss was tracked too.
            contactTReal: measuredContact?.tReal ?? tracker.outgoing?.contactTReal ?? Number.NaN,
            captureFps: options.captureFps,
            aspect: setup.aspect,
            scale: setup.scale,
            cameraView: options.cameraView,
            targetTag: options.targetTag,
          })

  // Rear (outcomes) view: bounce and placement from video, then average speed to the bounce.
  const rear = options.cameraView === 'rear'
  const bounce: BounceEstimate | BounceUnavailable = !rear
    ? { status: 'unavailable', reason: 'bounce is only located in the rear (outcomes) view' }
    : tracker.outgoing
      ? detectBounce(tracker.outgoing.track)
      : { status: 'unavailable', reason: 'the ball was not tracked after contact' }
  const placement: CourtPlacement | BounceUnavailable =
    bounce.status !== 'experimental'
      ? { status: 'unavailable', reason: bounce.reason }
      : options.courtCalibration
        ? mapBounceToCourt(bounce, options.courtCalibration.imageToCourt, setup.aspect, options.courtCalibration.rmsM)
        : { status: 'unavailable', reason: 'no court calibration (four-corner tap)' }
  const rearContact = measuredContact
    ? { tReal: measuredContact.tReal, sigma: measuredContact.uncertaintyS }
    : contactTReal !== undefined
      ? { tReal: contactTReal, sigma: FUSED_CONTACT_SIGMA_S }
      : null
  let averageSpeedRear: FlightTimeSpeedEstimate | SpeedUnavailable
  if (rear && !realTime) averageSpeedRear = { status: 'unavailable', reason: slowMotionReason, unlockHint: slowMotionHint }
  else if (rear && !rearContact) {
    averageSpeedRear = { status: 'unavailable', reason: 'contact time not found', unlockHint: 'Keep the toss and the ball after contact in view.' }
  } else {
    averageSpeedRear = speedFromFlightTime({
      cameraView: options.cameraView,
      contactTReal: rearContact?.tReal ?? Number.NaN,
      contactSigmaS: rearContact?.sigma,
      bounce:
        bounce.status === 'experimental' && placement.status === 'experimental'
          ? { tReal: bounce.tReal, uncertaintyS: bounce.uncertaintyS, court: placement.court, sigmaXM: placement.sigmaXM, sigmaYM: placement.sigmaYM }
          : null,
      servedFrom: options.servedFrom,
    })
  }

  return {
    tracker,
    tracks: tracker.tracks,
    toss,
    events,
    timeBase,
    speedFromTrack,
    averageSpeedRear,
    bounce,
    placement,
    metrics: [
      tossHeightMetric('toss-apex-height', 'above the court', toss, setup, 'ground'),
      trackSpeedMetric(speedFromTrack),
      flightTimeSpeedMetric(averageSpeedRear),
      spinMetric(),
    ],
  }
}

/**
 * Toss apex height in metres against a pose reference: 'estimated' (it rests on the player's
 * height and the ball staying near the player's plane), with a ~95% range from the apex fit,
 * the reference landmark, the scale and the depth assumption. The canonical metric is
 * 'toss-apex-height' against the floor; the head reference is for internal use.
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
      `vs ${reference === 'head' ? 'head top' : 'floor'} from pose; scale from ${scale.basis}; ` +
      'a toss nearer the camera than the body reads high',
  }
}

/** Display value of a range-only speed: "150–170" (en dash); the numbers are in `uncertainty`. */
function rangeLabel(range: SpeedRange): string {
  return `${range.lowKmh}–${range.highKmh}`
}

/** speed-experimental: side view, launch speed just after contact, range only. */
export function trackSpeedMetric(estimate: TrackSpeedEstimate | SpeedUnavailable): MetricValue {
  const id = 'speed-experimental'
  if (estimate.status === 'unavailable') {
    return { id, value: null, unit: 'km/h', status: 'unavailable', confidence: 0, basis: 'ball track just after contact (side view)', unavailableReason: estimate.reason, unlockHint: estimate.unlockHint }
  }
  return {
    id,
    value: rangeLabel(estimate),
    unit: 'km/h',
    status: 'experimental',
    uncertainty: { kind: 'range', low: estimate.lowKmh, high: estimate.highKmh },
    confidence: estimate.confidence,
    basis: `launch speed range (peak, just after contact): ${estimate.basis}`,
  }
}

/** speed-average-rear: rear view, average speed from contact to the located bounce, range only. */
export function flightTimeSpeedMetric(estimate: FlightTimeSpeedEstimate | SpeedUnavailable): MetricValue {
  const id = 'speed-average-rear'
  if (estimate.status === 'unavailable') {
    return { id, value: null, unit: 'km/h', status: 'unavailable', confidence: 0, basis: 'contact to the bounce located in the rear view', unavailableReason: estimate.reason, unlockHint: estimate.unlockHint }
  }
  return {
    id,
    value: rangeLabel(estimate),
    unit: 'km/h',
    status: 'experimental',
    uncertainty: { kind: 'range', low: estimate.lowKmh, high: estimate.highKmh },
    confidence: estimate.confidence,
    basis: `average speed over the flight: ${estimate.basis}`,
  }
}

/** spin: always unavailable (D4). */
export function spinMetric(): MetricValue {
  return {
    id: 'spin',
    value: null,
    unit: 'rpm',
    status: 'unavailable',
    confidence: 0,
    basis: 'ball spin',
    unavailableReason: 'a phone video cannot resolve the ball’s spin: the ball is only a few pixels wide and its seams cannot be followed from frame to frame',
    unlockHint: 'Not available from phone video.',
  }
}
