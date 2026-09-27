/**
 * EXPERIMENTAL bounce detection on the outgoing track, and mapping to the court.
 *
 * For a camera above the ground (rear view behind the server, or side-on), the ball's image
 * y increases (moves down the image) while it falls toward the court and decreases after
 * the bounce, so the bounce is a sign change of the vertical image velocity from + to -.
 * Straight lines are fitted to short windows either side of each candidate split; the bounce
 * time is their intersection (sub-frame), and the split with the smallest residual wins.
 *
 * Placement uses the ball's lowest image point (centre + radius): at the bounce that point
 * touches the ground, whereas the centre is one radius up, which projects ~0.5 m long at
 * 20 m from a phone at 1.2 m height.
 */
import type { BallObservation, BallTrack } from '../types.ts'
import { fitLine, median } from './fit.ts'
import { applyHomography, COURT, homographyJacobian, type Mat3, type Point2 } from './homography.ts'

export interface BounceEstimate {
  status: 'experimental'
  tReal: number
  /** Last frame before the bounce. */
  frameIndex: number
  /** Normalised image position of the ball centre at the bounce. */
  x: number
  y: number
  /** Normalised image point where the ball touches the ground (bottom of the ball). */
  groundContact: Point2
  /** 1-sigma timing uncertainty (s). */
  uncertaintyS: number
  /** 1-sigma image uncertainty of groundContact (frame-height units). */
  positionSigmaNorm: number
  confidence: number
  method: 'image-vy-sign-change'
}

export interface BounceUnavailable {
  status: 'unavailable'
  reason: string
}

export interface BounceOptions {
  /** Time span used either side of the split (s); at least 3 points are always used. */
  windowS?: number
  /** Minimum points required either side. */
  minPointsEachSide?: number
  /** Localisation noise floor per detection (frame-height units); default 0.3 x radius. */
  positionSigmaNorm?: number
}

interface SplitFit {
  k: number
  t: number
  x: number
  y: number
  cost: number
  tSigma: number
  ySigma: number
  significance: number
}

export function detectBounce(track: BallTrack, options: BounceOptions = {}): BounceEstimate | BounceUnavailable {
  const minEach = options.minPointsEachSide ?? 3
  const obs = track.observations.filter((o) => o.source === 'detected').sort((a, b) => a.tReal - b.tReal)
  if (obs.length < 2 * minEach) {
    return { status: 'unavailable', reason: `only ${obs.length} detections on the outgoing track; need ${2 * minEach} around the bounce` }
  }
  const radius = median(obs.map((o) => o.radius))
  const sigmaFloor = options.positionSigmaNorm ?? 0.3 * radius
  const periods = obs.slice(1).map((o, i) => (o.tReal - obs[i].tReal) / Math.max(1, o.frameIndex - obs[i].frameIndex))
  const periodS = median(periods)
  // Short windows keep the straight-line approximation valid on the curved pre-bounce path.
  const w = Math.max(minEach, Math.round((options.windowS ?? 0.04) / periodS))

  let best: SplitFit | null = null
  for (let k = minEach - 1; k <= obs.length - minEach - 1; k++) {
    const before = obs.slice(Math.max(0, k - w + 1), k + 1)
    const after = obs.slice(k + 1, k + 1 + w)
    const fit = fitSplit(before, after, sigmaFloor)
    if (!fit) continue
    if (fit.t < obs[k].tReal - 0.5 * periodS || fit.t > obs[k + 1].tReal + 0.5 * periodS) continue
    if (!best || fit.cost < best.cost) best = { ...fit, k }
  }
  if (!best) return { status: 'unavailable', reason: 'no downward-then-upward change in the ball path (bounce not seen)' }
  const confidence = Math.min(0.6, 0.15 * best.significance)
  return {
    status: 'experimental',
    tReal: best.t,
    frameIndex: obs[best.k].frameIndex,
    x: best.x,
    y: best.y,
    groundContact: { x: best.x, y: best.y + radius },
    uncertaintyS: Math.max(best.tSigma, 0.25 * periodS),
    positionSigmaNorm: Math.hypot(best.ySigma, sigmaFloor),
    confidence,
    method: 'image-vy-sign-change',
  }
}

function fitSplit(before: BallObservation[], after: BallObservation[], sigmaFloor: number): Omit<SplitFit, 'k'> | null {
  const yb = fitLine(before.map((o) => o.tReal), before.map((o) => o.y))
  const ya = fitLine(after.map((o) => o.tReal), after.map((o) => o.y))
  const xb = fitLine(before.map((o) => o.tReal), before.map((o) => o.x))
  if (!yb || !ya || !xb) return null
  // Slope uncertainty with a noise floor (two-point windows have zero residual).
  const slopeSigma = (fit: NonNullable<typeof yb>, n: number, ts: number[]) => {
    const mean = ts.reduce((s, t) => s + t, 0) / n
    const stt = ts.reduce((s, t) => s + (t - mean) ** 2, 0)
    return Math.max(fit.slopeSigma, sigmaFloor / Math.sqrt(stt))
  }
  const sb = slopeSigma(yb, before.length, before.map((o) => o.tReal))
  const sa = slopeSigma(ya, after.length, after.map((o) => o.tReal))
  // Falling before (image y increasing), rising after, both clearly non-zero.
  if (!(yb.slope > 2 * sb) || !(ya.slope < -2 * sa)) return null
  // Intersection: yb.intercept + yb.slope (t - yb.t0) = ya.intercept + ya.slope (t - ya.t0)
  const t = (ya.intercept - ya.slope * ya.t0 - yb.intercept + yb.slope * yb.t0) / (yb.slope - ya.slope)
  const y = yb.intercept + yb.slope * (t - yb.t0)
  const varAt = (fit: NonNullable<typeof yb>, s: number, n: number) =>
    Math.max(fit.interceptSigma, sigmaFloor / Math.sqrt(n)) ** 2 + (t - fit.t0) ** 2 * s * s
  const vb = varAt(yb, sb, before.length)
  const va = varAt(ya, sa, after.length)
  const cost = (yb.rmse ** 2 * before.length + ya.rmse ** 2 * after.length) / (before.length + after.length)
  return {
    t,
    x: xb.intercept + xb.slope * (t - xb.t0),
    y,
    cost,
    tSigma: Math.sqrt(vb + va) / (yb.slope - ya.slope),
    ySigma: Math.sqrt(Math.min(vb, va)),
    significance: Math.min(yb.slope / sb, -ya.slope / sa),
  }
}

export interface CourtPlacement {
  status: 'experimental'
  /** Court frame (metres), see homography.ts COURT. */
  court: Point2
  /** 1-sigma along x and y (m), from image noise and calibration error. */
  sigmaXM: number
  sigmaYM: number
}

/**
 * Map the bounce ground-contact point to court metres through an image -> court homography
 * built from normalised image points. `aspect` converts the image sigma (frame-height units)
 * to normalised x; calibrationRmsM is the homography's reprojection RMS on the court.
 */
export function mapBounceToCourt(
  bounce: BounceEstimate,
  imageToCourt: Mat3,
  aspect: number,
  calibrationRmsM = 0,
): CourtPlacement | BounceUnavailable {
  const court = applyHomography(imageToCourt, bounce.groundContact)
  const J = homographyJacobian(imageToCourt, bounce.groundContact)
  if (!court || !J) return { status: 'unavailable', reason: 'bounce point is on or beyond the horizon of the court calibration' }
  // A located bounce off the court is not a serve bounce (clutter picked up by the track, or a
  // wrong court tap); refuse it rather than report a position.
  if (court.y < -2 || court.y > COURT.lengthM + 6 || Math.abs(court.x) > COURT.doublesHalfWidthM + 4) {
    return { status: 'unavailable', reason: `bounce maps off the court (${court.x.toFixed(1)}, ${court.y.toFixed(1)} m): not a ball bounce, or the court tap is wrong` }
  }
  const sx = bounce.positionSigmaNorm / aspect
  const sy = bounce.positionSigmaNorm
  return {
    status: 'experimental',
    court,
    sigmaXM: Math.hypot(J[0][0] * sx, J[0][1] * sy, calibrationRmsM),
    sigmaYM: Math.hypot(J[1][0] * sx, J[1][1] * sy, calibrationRmsM),
  }
}
