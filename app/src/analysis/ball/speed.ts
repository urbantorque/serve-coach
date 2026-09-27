/**
 * EXPERIMENTAL serve speed (DECISIONS D4, revised 2026-09-27). Speed is `unavailable` by
 * default. Every result is a range rounded outward to 5 km/h: there is no centre value, and
 * every refusal says why and what would unlock it.
 *
 * 1. Side view, near contact (`estimateServeSpeedFromTrack`): only when ALL of these hold:
 *    camera view 'side'; capture >= 120 fps; >= 3 clean ball detections in the first ~50 ms
 *    after contact; a height scale; and a player target tag (T / body / wide) that bounds the
 *    ball's angle out of the image plane. A straight-line fit gives the in-image-plane speed;
 *    the range covers localisation noise, scale, time base, perspective, drag between contact
 *    and the measurement window, and the tag's out-of-plane angle band (the cosine error can
 *    only raise the true speed). Quantity: launch speed just after contact.
 * 2. Rear (outcomes) view, contact to a bounce LOCATED IN VIDEO (`speedFromFlightTime`):
 *    average speed over the flight, from the contact time and the bounce time and court
 *    position (homography). The side view never uses flight time: the bounce is out of frame
 *    and its distance unknown (about +-20% error, gap study side-view-geometry §7), so this
 *    function refuses the side view outright and has no audio-only mode.
 */
import type { BallObservation, BallTrack, CameraView } from '../types.ts'
import { clamp } from './colour.ts'
import { fitLine, median } from './fit.ts'
import type { Point2, ServeSide } from './homography.ts'
import { GRAVITY_MPS2, type PixelScale } from './scale.ts'

export const MPS_TO_KMH = 3.6
export const SPEED_OF_SOUND_MPS = 343
/** Ranges are rounded outward to this step (km/h). */
export const SPEED_ROUNDING_KMH = 5

/** Player-entered intended target (D3), used here only to bound the out-of-plane angle. */
export type TargetTag = 'T' | 'body' | 'wide'

/**
 * Angle (deg) between the ball's launch direction and the side-view image plane, per target
 * tag. The side-view camera looks along the baseline, so the angle is the serve's sideways
 * direction. Bounds (our geometry, see README): contact 0.3-1.0 m from the centre mark on the
 * serving side and 0-0.6 m inside the baseline; landing in the tagged third of the diagonal
 * box widened by 0.3 m either side, 14-18.6 m from the server's baseline; camera aim within
 * +-2 deg of the baseline. Geometry alone gives T 0-11.2, body 4.2-16.7, wide 8.4-21.9 deg.
 * This is wider than the gap study's "about +-4 deg" (fixed contact point, zone centre),
 * because stance, landing spread inside the zone and camera aim are included.
 */
export const TARGET_TAG_OUT_OF_PLANE_DEG: Record<TargetTag, [number, number]> = {
  T: [0, 13],
  body: [2, 19],
  wide: [6, 24],
}

/** A speed range in km/h, rounded outward to SPEED_ROUNDING_KMH. There is deliberately no centre value. */
export interface SpeedRange {
  lowKmh: number
  highKmh: number
}

export interface SpeedUnavailable {
  status: 'unavailable'
  reason: string
  unlockHint: string
}

export interface TrackSpeedEstimate extends SpeedRange {
  status: 'experimental'
  /** Launch speed just after contact (the peak of the flight). */
  quantity: 'launch'
  basis: string
  confidence: number
  detectionsUsed: number
  targetTag: TargetTag
  /** Out-of-plane angle band assumed from the tag (deg). */
  outOfPlaneDeg: [number, number]
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
  /** Must be 'side'; any other view (or none) is refused. */
  cameraView?: CameraView
  /** Player's intended target; required (it bounds the out-of-plane angle). */
  targetTag?: TargetTag | null
  /** Window after contact (s). */
  windowS?: number
  minDetections?: number
  minCaptureFps?: number
  /** Ignore detections this soon after contact (ball still on the strings). */
  minDelayS?: number
  minDetectionScore?: number
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

/** Uncertainty in how far the contact point is in front of / behind the player's depth (m). */
const CONTACT_DEPTH_SIGMA_M = 0.3
/** Refuse when the combined 1-sigma relative error exceeds this (+-60% at 95%). */
const MAX_TRACK_REL_SIGMA = 0.3
/**
 * Shortest assumed focal length: the 1x main camera (26 mm equivalent, ~69 deg across the
 * frame's long side), i.e. 0.72 long-side units. The ultra-wide lens is not supported.
 */
export const MAIN_CAMERA_FOCAL_LONG_SIDE = 0.72

/** Round a m/s interval outward to the display step in km/h. */
export function roundSpeedRange(lowMps: number, highMps: number, stepKmh = SPEED_ROUNDING_KMH): SpeedRange {
  return {
    lowKmh: Math.max(0, Math.floor((lowMps * MPS_TO_KMH) / stepKmh) * stepKmh),
    highKmh: Math.ceil((highMps * MPS_TO_KMH) / stepKmh) * stepKmh,
  }
}

function unavailable(reason: string, unlockHint: string): SpeedUnavailable {
  return { status: 'unavailable', reason, unlockHint }
}

const deg = (d: number) => (d * Math.PI) / 180

const TARGET_TAGS: readonly TargetTag[] = ['T', 'body', 'wide']

export function estimateServeSpeedFromTrack(track: BallTrack, options: TrackSpeedOptions): TrackSpeedEstimate | SpeedUnavailable {
  const opts = { ...TRACK_DEFAULTS, ...options }
  if (opts.cameraView !== 'side') {
    return unavailable(
      opts.cameraView === 'rear' || opts.cameraView === 'front45'
        ? `camera view '${opts.cameraView}': the ball travels mostly toward or away from the camera, so its image speed says little about its true speed`
        : 'camera view not confirmed as side-on; the near-contact speed needs the side view',
      'Film side-on from the baseline extension (the standard set-up) for an experimental speed range.',
    )
  }
  if (!(opts.captureFps >= opts.minCaptureFps)) {
    return unavailable(
      `capture frame rate ${Math.round(opts.captureFps)} fps is below ${opts.minCaptureFps} fps; the ball crosses the frame in too few, too blurred frames`,
      `Record in slow motion (${opts.minCaptureFps} or 240 fps).`,
    )
  }
  if (!opts.scale || !(opts.scale.unitsPerM > 0)) {
    return unavailable('no pixel-to-metre scale: the player must be fully visible standing up', 'Frame the whole player, head to feet, before the serve.')
  }
  if (!opts.targetTag || !TARGET_TAGS.includes(opts.targetTag)) {
    return unavailable(
      'no target tag: without it the angle between the serve and the image plane is unbounded',
      'Tag where you aimed the serve (T, body or wide) in the review.',
    )
  }
  const [angleLo, angleHi] = TARGET_TAG_OUT_OF_PLANE_DEG[opts.targetTag]
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
      'Film side-on in good light with the ball path after contact inside the frame (stand the phone 7-8 m away).',
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
  if (relSigma > MAX_TRACK_REL_SIGMA) {
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
  const confidence = clamp(0.6 - 1.5 * relSigma, 0.1, 0.6) * clamp(clean.length / 5, 0.6, 1)
  return {
    status: 'experimental',
    quantity: 'launch',
    ...roundSpeedRange(lowMps, highMps),
    basis:
      `${clean.length} ball detections within ${Math.round(opts.windowS * 1000)} ms after contact at ${Math.round(opts.captureFps)} fps; ` +
      `scale from ${opts.scale.basis}; target tag ${opts.targetTag}: ball assumed ${angleLo}-${angleHi} deg out of the image plane`,
    confidence,
    detectionsUsed: clean.length,
    targetTag: opts.targetTag,
    outOfPlaneDeg: [angleLo, angleHi],
    relSigma,
    errorTerms: { localisation, scale: opts.scale.relSigma, timeBase: opts.timeScaleRelSigma, perspective },
  }
}

/** A bounce found in rear-view video (detectBounce) and mapped to the court (mapBounceToCourt). */
export interface LocatedBounce {
  tReal: number
  /** 1-sigma of the bounce time (s). */
  uncertaintyS: number
  /** Court frame (metres), see homography.ts COURT. */
  court: Point2
  /** 1-sigma of the court position (m). */
  sigmaXM: number
  sigmaYM: number
}

/** Box of possible contact positions in the court frame (metres; zM is height above the court). */
export interface ContactRegion {
  xM: [number, number]
  yM: [number, number]
  zM: [number, number]
}

export interface FlightTimeSpeedOptions {
  /** Must be 'rear'. The side view is refused: its bounce is never in frame. */
  cameraView?: CameraView
  /** Contact time (real seconds): ball-track intersection, or pose/audio fusion with the sound delay removed. */
  contactTReal: number
  /** 1-sigma of the contact time (s). Default 3 ms. */
  contactSigmaS?: number
  /** Bounce located in the video; required. */
  bounce?: LocatedBounce | null
  /** Side the serve was hit from; narrows the contact region (else both halves are allowed). */
  servedFrom?: ServeSide
  /** Override the contact region (e.g. from the server's feet through the homography). */
  contactRegion?: ContactRegion
  /** Flight path length over the contact-to-bounce chord (the arc is 0.5-2% longer). */
  arcFactor?: [number, number]
  minFlightS?: number
  maxFlightS?: number
}

export interface FlightTimeSpeedEstimate extends SpeedRange {
  status: 'experimental'
  /** Average speed over the flight from contact to the bounce. */
  quantity: 'average'
  flightTimeS: { low: number; high: number }
  pathLengthM: { low: number; high: number }
  basis: string
  confidence: number
}

/**
 * Contact region: server within 0.1-1.3 m of the centre mark on the serving side, contact
 * 0.3 m behind to 0.8 m inside the baseline, 2.2-3.0 m high (contact at about 1.4-1.55x the
 * height of 1.6-1.95 m players).
 */
function defaultContactRegion(servedFrom: ServeSide | undefined): ContactRegion {
  // Court frame: x is + to the server's right; the deuce side is the server's right half.
  const xM: [number, number] = servedFrom === 'deuce' ? [0.1, 1.3] : servedFrom === 'ad' ? [-1.3, -0.1] : [-1.3, 1.3]
  return { xM, yM: [-0.3, 0.8], zM: [2.2, 3.0] }
}

/** Nearest and farthest distance between two axis-aligned boxes (per-axis [lo, hi]). */
function boxDistanceRange(a: [number, number][], b: [number, number][]): { min: number; max: number } {
  let min2 = 0
  let max2 = 0
  for (let i = 0; i < a.length; i++) {
    const gap = Math.max(0, b[i][0] - a[i][1], a[i][0] - b[i][1])
    const far = Math.max(Math.abs(b[i][1] - a[i][0]), Math.abs(a[i][1] - b[i][0]))
    min2 += gap * gap
    max2 += far * far
  }
  return { min: Math.sqrt(min2), max: Math.sqrt(max2) }
}

/**
 * EXPERIMENTAL average speed from contact to a bounce located in rear-view video. Flight time
 * is the bounce time minus the contact time (+-2 sigma of both); path length runs from the
 * contact region to the located bounce (+-2 sigma of its court position), times the arc factor.
 * There is no audio-only path: a bounce sound without a located bounce is refused.
 */
export function speedFromFlightTime(options: FlightTimeSpeedOptions): FlightTimeSpeedEstimate | SpeedUnavailable {
  if (options.cameraView === 'side') {
    return unavailable(
      'bounce not in view: from the side the bounce is outside the frame and its distance is unknown (about +-20% error), so flight time is never used',
      'Add the optional rear (outcomes) view with the service boxes visible.',
    )
  }
  if (options.cameraView !== 'rear') {
    return unavailable('average speed to the bounce needs the rear (outcomes) view', 'Record the rear view behind the server, with both service boxes visible.')
  }
  const bounce = options.bounce
  if (!bounce) {
    return unavailable(
      'bounce not located in the video (a bounce sound alone does not say where the ball landed)',
      'Raise the rear camera so the far service boxes are clearly visible, and tap the four court corners.',
    )
  }
  if (![options.contactTReal, bounce.tReal, bounce.court.x, bounce.court.y].every(Number.isFinite)) {
    return unavailable('contact or bounce time missing', 'Keep the whole serve and the ball flight in view.')
  }
  const contactSigma = options.contactSigmaS ?? 0.003
  const flight = bounce.tReal - options.contactTReal
  const flightSigma = Math.hypot(contactSigma, bounce.uncertaintyS)
  const flightLo = flight - 2 * flightSigma
  const flightHi = flight + 2 * flightSigma
  if (!(flightLo >= (options.minFlightS ?? 0.25)) || !(flightHi <= (options.maxFlightS ?? 1.5))) {
    return unavailable(
      `contact-to-bounce time ${flight.toFixed(3)} s is not a plausible serve flight (0.25-1.5 s)`,
      'Keep the whole serve and the ball flight in view.',
    )
  }
  // A serve bounce lies past the net and near the far service boxes.
  if (!(bounce.court.y > 12) || !(bounce.court.y < 30)) {
    return unavailable(
      `located bounce ${bounce.court.y.toFixed(1)} m from the baseline is not a plausible serve landing (12-30 m)`,
      'Re-tap the court corners and keep the far service boxes in view.',
    )
  }
  const region = options.contactRegion ?? defaultContactRegion(options.servedFrom)
  const bounceBox: [number, number][] = [
    [bounce.court.x - 2 * bounce.sigmaXM, bounce.court.x + 2 * bounce.sigmaXM],
    [bounce.court.y - 2 * bounce.sigmaYM, bounce.court.y + 2 * bounce.sigmaYM],
    [0, 0],
  ]
  const chord = boxDistanceRange([region.xM, region.yM, region.zM], bounceBox)
  const [arcLo, arcHi] = options.arcFactor ?? [1.005, 1.02]
  const pathLo = chord.min * arcLo
  const pathHi = chord.max * arcHi
  const lowMps = pathLo / flightHi
  const highMps = pathHi / flightLo
  const relWidth = (highMps - lowMps) / (highMps + lowMps)
  if (relWidth > 0.25) {
    return unavailable(`average speed too uncertain (+-${Math.round(100 * relWidth)}%)`, 'Tap the court corners carefully and record at 60 fps or more.')
  }
  return {
    status: 'experimental',
    quantity: 'average',
    ...roundSpeedRange(lowMps, highMps),
    flightTimeS: { low: flightLo, high: flightHi },
    pathLengthM: { low: pathLo, high: pathHi },
    basis:
      `flight ${flight.toFixed(3)} s from contact to the bounce located in the rear view ` +
      `(${bounce.court.y.toFixed(1)} m from the baseline); path ${pathLo.toFixed(1)}-${pathHi.toFixed(1)} m`,
    confidence: clamp(0.5 - relWidth, 0.1, 0.5),
  }
}
