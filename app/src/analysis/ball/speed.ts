/**
 * EXPERIMENTAL serve-speed estimation. Every result is a range; there is no path that
 * returns a single number without low / high, and every refusal says why.
 *
 * 1. From the outgoing track (side-on camera, >= 120 fps): straight-line fit to clean
 *    detections in the first ~0.05 s after contact gives the in-image-plane speed; the scale
 *    comes from the player's height. The range covers localisation noise, scale error, time
 *    base error, perspective (ball leaving the player's depth), air drag between contact and
 *    the measurement window, and an assumed range of angles between the ball's direction
 *    and the image plane (the cosine error, which can only make the true speed larger).
 * 2. From flight time (contact "pop" to bounce sound): average speed over an assumed path
 *    length, corrected for sound travel time to the phone, and a drag-based launch speed.
 */
import type { BallObservation, BallTrack, CameraView } from '../types.ts'
import { clamp } from './colour.ts'
import { fitLine, median } from './fit.ts'
import { GRAVITY_MPS2, type PixelScale } from './scale.ts'

export const MPS_TO_KMH = 3.6
export const SPEED_OF_SOUND_MPS = 343

export interface SpeedInterval {
  valueMps: number
  lowMps: number
  highMps: number
  valueKmh: number
  lowKmh: number
  highKmh: number
}

export interface SpeedUnavailable {
  status: 'unavailable'
  reason: string
  unlockHint: string
}

export interface TrackSpeedEstimate extends SpeedInterval {
  status: 'experimental'
  /** Launch speed range (m/s, km/h); the value is the centre of the range, not a measurement. */
  basis: string
  confidence: number
  detectionsUsed: number
  /** Measured in-image-plane speed at the window's mid-time before corrections (m/s). */
  inPlaneSpeedMps: number
  /** Combined 1-sigma relative error of the in-plane speed (the range uses 2 sigma). */
  relSigma: number
  /** Individual 1-sigma relative error terms, for display and debugging. */
  errorTerms: { localisation: number; scale: number; timeBase: number; perspective: number }
}

export interface TrackSpeedOptions {
  contactTReal: number
  /** True capture frame rate (after slow-motion correction). */
  captureFps: number
  /** Frame width / height. */
  aspect: number
  scale: PixelScale | null
  cameraView?: CameraView
  /** Window after contact (s). */
  windowS?: number
  minDetections?: number
  minCaptureFps?: number
  /** Ignore detections this soon after contact (ball still on the strings). */
  minDelayS?: number
  minDetectionScore?: number
  /** Assumed angle range between the ball's direction and the image plane (degrees). */
  outOfPlaneDegRange?: [number, number]
  /** 1-sigma localisation error per detection (frame-height units). Default 0.3 x ball radius. */
  positionSigmaNorm?: number
  /** Relative 1-sigma of the time base (0.003 for container fps; larger if fps came from physics). */
  timeScaleRelSigma?: number
  /**
   * Focal length in frame heights, if known (e.g. from lens metadata). Tightens the
   * perspective term; otherwise the 1x main camera (the widest supported lens) is assumed.
   */
  focalLengthFhu?: number
  /** Air-drag decay length range (m) used to extrapolate back to launch. */
  dragLengthM?: [number, number]
}

const TRACK_DEFAULTS = {
  windowS: 0.05,
  minDetections: 3,
  minCaptureFps: 120,
  minDelayS: 0.004,
  minDetectionScore: 0.15,
  timeScaleRelSigma: 0.003,
  // L = 2m / (rho Cd A): Cd 0.5-0.75 (spin and felt wear) gives roughly 36-55 m.
  dragLengthM: [36, 55] as [number, number],
}

const SIDE_VIEW_ANGLES: [number, number] = [0, 25]
const UNKNOWN_VIEW_ANGLES: [number, number] = [0, 35]
/** Uncertainty in how far the contact point is in front of / behind the player's depth (m). */
const CONTACT_DEPTH_SIGMA_M = 0.3
/**
 * Shortest assumed focal length: the 1x main camera (26 mm equivalent, ~69 deg across the
 * frame's long side), i.e. 0.72 long-side units. The ultra-wide lens is not supported.
 */
export const MAIN_CAMERA_FOCAL_LONG_SIDE = 0.72

function interval(valueMps: number, lowMps: number, highMps: number): SpeedInterval {
  return {
    valueMps,
    lowMps,
    highMps,
    valueKmh: valueMps * MPS_TO_KMH,
    lowKmh: lowMps * MPS_TO_KMH,
    highKmh: highMps * MPS_TO_KMH,
  }
}

function unavailable(reason: string, unlockHint: string): SpeedUnavailable {
  return { status: 'unavailable', reason, unlockHint }
}

const deg = (d: number) => (d * Math.PI) / 180

export function estimateServeSpeedFromTrack(track: BallTrack, options: TrackSpeedOptions): TrackSpeedEstimate | SpeedUnavailable {
  const opts = { ...TRACK_DEFAULTS, ...options }
  if (!(opts.captureFps >= opts.minCaptureFps)) {
    return unavailable(
      `capture frame rate ${Math.round(opts.captureFps)} fps is below ${opts.minCaptureFps} fps; the ball crosses the frame in too few, too blurred frames`,
      `Record in slow motion (${opts.minCaptureFps} or 240 fps).`,
    )
  }
  if (!opts.scale || !(opts.scale.unitsPerM > 0)) {
    return unavailable('no pixel-to-metre scale: the player must be fully visible standing up', 'Frame the whole player, head to feet, before the serve.')
  }
  if (opts.cameraView === 'rear' || opts.cameraView === 'front45') {
    return unavailable(
      `camera view '${opts.cameraView}': the ball travels mostly toward or away from the camera, so image speed says little about true speed`,
      'Film side-on, level with the baseline, for a speed estimate.',
    )
  }
  const [angleLo, angleHi] = opts.outOfPlaneDegRange ?? (opts.cameraView === 'side' ? SIDE_VIEW_ANGLES : UNKNOWN_VIEW_ANGLES)
  const clean = track.observations
    .filter(
      (o: BallObservation) =>
        o.source === 'detected' &&
        o.score >= opts.minDetectionScore &&
        o.tReal >= opts.contactTReal + opts.minDelayS &&
        o.tReal <= opts.contactTReal + opts.windowS,
    )
    .sort((a, b) => a.tReal - b.tReal)
  if (clean.length < opts.minDetections) {
    return unavailable(
      `only ${clean.length} clean ball detections within ${Math.round(opts.windowS * 1000)} ms after contact; need ${opts.minDetections}`,
      'Film side-on in good light with the ball flight path inside the frame (landscape framing helps).',
    )
  }
  const k = opts.scale.unitsPerM
  const ts = clean.map((o) => o.tReal - opts.contactTReal)
  const xs = clean.map((o) => o.x * opts.aspect)
  // Remove the (tiny) gravity drop so the fit is a pure straight line.
  const ys = clean.map((o, i) => o.y - 0.5 * GRAVITY_MPS2 * k * ts[i] * ts[i])
  const lineX = fitLine(ts, xs)
  const lineY = fitLine(ts, ys)
  if (!lineX || !lineY) return unavailable('could not fit the outgoing ball path', 'Film side-on at 120 or 240 fps.')

  const radius = median(clean.map((o) => o.radius))
  const assumedSigma = opts.positionSigmaNorm ?? 0.3 * radius
  const residualRms = Math.hypot(lineX.rmse, lineY.rmse) / Math.SQRT2
  // With 3 points the residual has 1 dof and says little; with more, trust it if larger.
  const positionSigma = clean.length >= 4 ? Math.max(assumedSigma, residualRms * Math.sqrt(clean.length / (clean.length - 2))) : assumedSigma
  if (clean.length >= 4 && residualRms > 4 * assumedSigma) {
    return unavailable('outgoing detections are not on a straight line (likely mixed with racket or other objects)', 'Film against a plain background.')
  }
  const meanT = ts.reduce((s, t) => s + t, 0) / ts.length
  const stt = ts.reduce((s, t) => s + (t - meanT) ** 2, 0)
  const vImg = Math.hypot(lineX.slope, lineY.slope)
  const inPlaneMps = vImg / k

  const localisation = positionSigma / Math.sqrt(stt) / vImg
  // Perspective. A ball leaving the image plane changes depth (scale drift) and, off the
  // optical axis, also drifts in the image as it looms or recedes (relative error ~ (u / f) tan(angle)
  // for image offset u from the centre). Half the worst case is used as 1 sigma, plus the
  // uncertainty of the contact point's depth relative to the player's body.
  const focal = opts.focalLengthFhu ?? MAIN_CAMERA_FOCAL_LONG_SIDE * Math.max(1, opts.aspect)
  const cameraDistance = focal / k
  const vHigh3d = inPlaneMps / Math.cos(deg(angleHi))
  const offsetMax = Math.max(...clean.map((o) => Math.hypot((o.x - 0.5) * opts.aspect, o.y - 0.5)))
  const perspectiveWorst = (Math.sin(deg(angleHi)) * vHigh3d * meanT) / cameraDistance + (offsetMax / focal) * Math.tan(deg(angleHi))
  const perspective = Math.hypot(perspectiveWorst / 2, CONTACT_DEPTH_SIGMA_M / cameraDistance)
  const relSigma = Math.hypot(localisation, opts.scale.relSigma, opts.timeScaleRelSigma, perspective)
  if (relSigma > 0.3) {
    return unavailable(
      `speed too uncertain (+-${Math.round(200 * relSigma)}% at 95%)`,
      'Use 240 fps, frame the player larger, and keep the ball path inside the frame.',
    )
  }
  // Drag between contact and the window's mid-time: v_launch = v_mid * exp(s / L).
  const [dragLo, dragHi] = opts.dragLengthM
  const pathLo = inPlaneMps * meanT
  const pathHi = vHigh3d * meanT
  const lowMps = (inPlaneMps * (1 - 2 * relSigma) * Math.exp(pathLo / dragHi)) / Math.cos(deg(angleLo))
  const highMps = (inPlaneMps * (1 + 2 * relSigma) * Math.exp(pathHi / dragLo)) / Math.cos(deg(angleHi))
  const valueMps = Math.sqrt(lowMps * highMps)
  const confidence = clamp(0.6 - 1.5 * relSigma, 0.1, 0.6) * clamp(clean.length / 5, 0.6, 1)
  return {
    status: 'experimental',
    ...interval(valueMps, lowMps, highMps),
    basis: `${clean.length} ball detections within ${Math.round(opts.windowS * 1000)} ms after contact at ${Math.round(opts.captureFps)} fps; scale from ${opts.scale.basis}; ball assumed ${angleLo}-${angleHi} deg out of the image plane`,
    confidence,
    detectionsUsed: clean.length,
    inPlaneSpeedMps: inPlaneMps,
    relSigma,
    errorTerms: { localisation, scale: opts.scale.relSigma, timeBase: opts.timeScaleRelSigma, perspective },
  }
}

export interface FlightTimeSpeedOptions {
  /** Audio onset of racket contact (real seconds, as heard at the phone). */
  contactOnsetTReal: number
  /** Audio onset of the bounce (real seconds, as heard at the phone). */
  bounceOnsetTReal: number
  /**
   * Path length range contact -> bounce (m). Default: contact just inside the baseline, bounce
   * anywhere in the service box, including the 2.6-2.8 m drop.
   */
  distanceRangeM?: [number, number]
  /** Phone-to-contact and phone-to-bounce distance ranges (m) for sound travel time. */
  cameraToContactM?: [number, number]
  cameraToBounceM?: [number, number]
  /** 343 m/s at 20 C; about 352 m/s at 35 C. */
  speedOfSoundMps?: number
  /** 1-sigma timing error of each audio onset (s). */
  onsetSigmaS?: number
  dragLengthM?: [number, number]
}

export interface FlightTimeSpeedEstimate {
  status: 'experimental'
  flightTimeS: { value: number; low: number; high: number }
  /** Average speed over the flight. */
  average: SpeedInterval
  /** Launch speed implied by quadratic drag: v0 = L (exp(D / L) - 1) / T. */
  launch: SpeedInterval
  basis: string
  confidence: number
}

const FLIGHT_DEFAULTS = {
  distanceRangeM: [14, 19] as [number, number],
  cameraToContactM: [1, 10] as [number, number],
  cameraToBounceM: [10, 28] as [number, number],
  speedOfSoundMps: SPEED_OF_SOUND_MPS,
  onsetSigmaS: 0.003,
  dragLengthM: TRACK_DEFAULTS.dragLengthM,
}

/** Flight-time bounds are the worst-case combinations of sound delays and onset errors. */
export function speedFromFlightTime(options: FlightTimeSpeedOptions): FlightTimeSpeedEstimate | SpeedUnavailable {
  const opts = { ...FLIGHT_DEFAULTS, ...options }
  if (!Number.isFinite(opts.contactOnsetTReal) || !Number.isFinite(opts.bounceOnsetTReal)) {
    return unavailable('contact or bounce sound not detected', 'Record with sound on, close enough to hear the bounce.')
  }
  const heard = opts.bounceOnsetTReal - opts.contactOnsetTReal
  const c = opts.speedOfSoundMps
  const [contactLo, contactHi] = opts.cameraToContactM
  const [bounceLo, bounceHi] = opts.cameraToBounceM
  const onsetSlack = 2 * Math.SQRT2 * opts.onsetSigmaS
  const flightLo = heard - (bounceHi - contactLo) / c - onsetSlack
  const flightHi = heard - (bounceLo - contactHi) / c + onsetSlack
  const flightMid = heard - ((bounceLo + bounceHi) / 2 - (contactLo + contactHi) / 2) / c
  if (!(flightLo > 0.2) || !(flightHi < 2.0)) {
    return unavailable(
      `contact-to-bounce time ${heard.toFixed(3)} s is not a plausible serve flight (0.2-2.0 s); the two sounds are probably not contact and bounce`,
      'Record with sound on in a quiet setting.',
    )
  }
  const [distLo, distHi] = opts.distanceRangeM
  const distMid = (distLo + distHi) / 2
  const average = interval(distMid / flightMid, distLo / flightHi, distHi / flightLo)
  const [dragLo, dragHi] = opts.dragLengthM
  const launchSpeed = (dist: number, flight: number, dragLength: number) => (dragLength * Math.expm1(dist / dragLength)) / flight
  // Launch speed rises with distance and falls with flight time and drag length.
  const launch = interval(
    launchSpeed(distMid, flightMid, (dragLo + dragHi) / 2),
    launchSpeed(distLo, flightHi, dragHi),
    launchSpeed(distHi, flightLo, dragLo),
  )
  return {
    status: 'experimental',
    flightTimeS: { value: flightMid, low: flightLo, high: flightHi },
    average,
    launch,
    basis: `contact-to-bounce sound interval ${heard.toFixed(3)} s, sound delay corrected; path length assumed ${distLo}-${distHi} m`,
    confidence: clamp(0.5 - (average.highMps - average.lowMps) / (4 * average.valueMps), 0.1, 0.5),
  }
}
