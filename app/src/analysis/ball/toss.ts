/**
 * Toss analysis from a toss BallTrack: release, apex (sub-frame, from the parabola fit),
 * apex height against image references, and the gravity time-scale check.
 *
 * Conventions: image y grows downward, so free flight is y(t) = a t^2 + b t + c with
 * a > 0 and vertical image acceleration 2a (frame heights per s^2).
 */
import type { BallObservation, BallTrack, EventEstimate } from '../types.ts'
import { clamp, smoothstep } from './colour.ts'
import { evalPoly, invertMatrix, median, robustFitPolynomial, toAbsoluteQuadratic, weightedLeastSquares, type PolyFit } from './fit.ts'
import { GRAVITY_MPS2, type PixelScale } from './scale.ts'

export interface GravityCheckInput {
  /** Fitted vertical image acceleration d2y/dt2 = 2a (frame heights per timestamp-second^2). */
  accelerationNorm: number
  accelerationSigmaNorm: number
  scale: PixelScale
  /**
   * Relative 1-sigma model error on the acceleration: air drag on a ~5 m/s toss (about +-3%
   * of g, sign flips at the apex), ball depth differing from the player's (perspective) and
   * rolling-shutter skew. Default 0.04.
   */
  modelRelSigma?: number
}

export interface GravityCheck {
  status: 'ok' | 'unavailable'
  reason?: string
  /**
   * Real seconds per timestamp second implied by gravity. 1 = timestamps are real time;
   * 0.125 = footage captured at 8x the rate it is timestamped (240 fps slow motion at 30 fps).
   * Multiply the timestamps by this factor to get real time.
   */
  timeScaleFactor?: number
  /** 1-sigma of timeScaleFactor. */
  timeScaleSigma?: number
  /** Approximate 95% interval of timeScaleFactor. */
  low?: number
  high?: number
  /** True capture fps = fps implied by the timestamps * captureFpsFactor (= 1 / timeScaleFactor). */
  captureFpsFactor?: number
  /** Timestamps are consistent with real time (factor within the interval or within +-12%). */
  plausible?: boolean
  /** Nearest standard slow-motion ratio and whether the measurement is consistent with it. */
  nearestStandard?: { factor: number; label: string; consistent: boolean }
  /** Gravity implied if the timestamps were real time (m/s^2); 9.81 means consistent. */
  apparentGravityMps2?: number
}

const STANDARD_TIME_SCALES: { factor: number; label: string }[] = [
  { factor: 1, label: 'real time' },
  { factor: 1 / 2, label: '2x slow motion (e.g. 60 fps timestamped as 30 fps)' },
  { factor: 1 / 4, label: '4x slow motion (e.g. 120 fps timestamped as 30 fps)' },
  { factor: 1 / 8, label: '8x slow motion (e.g. 240 fps timestamped as 30 fps)' },
  { factor: 1 / 16, label: '16x slow motion (e.g. 480 fps timestamped as 30 fps)' },
]

/**
 * Gravity time-scale check. With y in frame heights and the scale in frame heights per
 * metre, free fall gives d2y/dt_real^2 = g * unitsPerM. If the timestamps tau relate to real
 * time by t_real = s * tau, the fitted acceleration is s^2 * g * unitsPerM, hence
 * s = sqrt(A / (g * unitsPerM)). The relative error of s is half that of A / unitsPerM.
 */
export function gravityTimeScaleCheck(input: GravityCheckInput): GravityCheck {
  const { accelerationNorm: accel, accelerationSigmaNorm: accelSigma, scale } = input
  if (!(scale.unitsPerM > 0)) return { status: 'unavailable', reason: 'no pixel-to-metre scale' }
  if (!(accel > 0)) return { status: 'unavailable', reason: 'fitted acceleration is not downward' }
  const accelRel = accelSigma / accel
  if (!(accelRel <= 0.3)) {
    return { status: 'unavailable', reason: `acceleration too uncertain (+-${Math.round(100 * accelRel)}%); need a longer, cleaner toss track` }
  }
  const modelRel = input.modelRelSigma ?? 0.04
  const factor = Math.sqrt(accel / (GRAVITY_MPS2 * scale.unitsPerM))
  const relSigma = 0.5 * Math.hypot(accelRel, scale.relSigma, modelRel)
  const sigma = factor * relSigma
  const low = factor * Math.exp(-2 * relSigma)
  const high = factor * Math.exp(2 * relSigma)
  const logTolerance = Math.max(2 * relSigma, Math.log(1.12))
  const nearest = STANDARD_TIME_SCALES.reduce((best, s) =>
    Math.abs(Math.log(factor / s.factor)) < Math.abs(Math.log(factor / best.factor)) ? s : best,
  )
  return {
    status: 'ok',
    timeScaleFactor: factor,
    timeScaleSigma: sigma,
    low,
    high,
    captureFpsFactor: 1 / factor,
    plausible: Math.abs(Math.log(factor)) <= logTolerance,
    nearestStandard: { ...nearest, consistent: Math.abs(Math.log(factor / nearest.factor)) <= logTolerance },
    apparentGravityMps2: accel / scale.unitsPerM,
  }
}

export interface TossReferences {
  /** Normalised y of the top of the head (standing), e.g. from scale.bodyHeightFromPose. */
  headTopY?: number
  /** Normalised y of the floor under the player. */
  groundY?: number
  /** Standing stature in frame-height units. */
  bodyHeightNorm?: number
}

export interface TossAnalysisOptions {
  /** Frame width / height. */
  aspect: number
  /** Frame period in the timestamps' time base; derived from the observations when omitted. */
  framePeriodS?: number
  scale?: PixelScale | null
  references?: TossReferences
  /** Relative model error on acceleration for the gravity check (default 0.04). */
  accelerationModelRelSigma?: number
  /**
   * Expected vertical image acceleration d2y/dt2 (frame heights per timestamp-second^2) with
   * its relative 1-sigma, see gravityAccelerationPrior(). Only valid when the timestamps are
   * known to be real time. Used to pin an apex that lies beyond the observed arc (only one
   * side in frame); ignored when the apex is bracketed or when the data contradict it.
   */
  accelerationPrior?: AccelerationPrior
}

export interface TossEvent {
  tReal: number
  frameIndex: number
  /** 1-sigma timing uncertainty (s). */
  uncertaintyS: number
  /** Normalised image position. */
  x: number
  y: number
  confidence: number
  method: string
}

export interface AccelerationPrior {
  accelerationNorm: number
  relSigma: number
}

/** Relative model error of free-flight acceleration vs g (drag on the rise, depth, rolling shutter). */
const GRAVITY_PRIOR_MODEL_REL = 0.04

/**
 * Gravity as a prior on the toss's image acceleration: g * unitsPerM in real time, scaled by
 * timeScale^2 when the timestamps run slower than real time (tReal = timeScale * t).
 */
export function gravityAccelerationPrior(scale: PixelScale, timeScale = 1): AccelerationPrior {
  return {
    accelerationNorm: GRAVITY_MPS2 * scale.unitsPerM * timeScale * timeScale,
    relSigma: Math.hypot(scale.relSigma, GRAVITY_PRIOR_MODEL_REL),
  }
}

/**
 * Gaussian prior on the quadratic coefficient (c2 = A / 2) combined with the fit in
 * information form: C' = (C^-1 + P)^-1, beta' = C' (C^-1 beta + P mu). Exact for the linear
 * model; null when the fit covariance is singular.
 */
export function withAccelerationPrior(fit: PolyFit, prior: AccelerationPrior): PolyFit | null {
  const info = invertMatrix(fit.cov)
  if (!info) return null
  const mean = prior.accelerationNorm / 2
  const precision = 1 / (prior.relSigma * mean) ** 2
  const infoPost = info.map((row, i) => row.map((v, j) => v + (i === 2 && j === 2 ? precision : 0)))
  const covPost = invertMatrix(infoPost)
  if (!covPost) return null
  const rhs = info.map((row, i) => row.reduce((sum, v, j) => sum + v * fit.coeffs[j], 0) + (i === 2 ? precision * mean : 0))
  const coeffs = covPost.map((row) => row.reduce((sum, v, j) => sum + v * rhs[j], 0))
  return { ...fit, coeffs, cov: covPost }
}

export interface TossApex extends TossEvent {
  yUncertaintyNorm: number
  /** Detections exist on both sides of the apex (else the apex is extrapolated). */
  bracketed: boolean
  /** Apex is above the top of the frame (y < 0). */
  aboveFrame: boolean
  /** The gravity prior pinned the curvature (apex beyond the observed arc, time base known). */
  gravityPrior: boolean
}

/** Heights in frame-height units at the player's depth (convert to metres with the scale). */
export interface TossHeights {
  riseAboveReleaseNorm: number
  aboveHeadNorm?: number
  aboveGroundNorm?: number
  /** Apex height over standing stature (dimensionless; times player height = metres). */
  apexOverBodyHeight?: number
  riseOverBodyHeight?: number
}

export interface TossAnalysis {
  status: 'ok' | 'unavailable'
  reason?: string
  release?: TossEvent
  apex?: TossApex
  heights?: TossHeights
  fit?: { a: number; b: number; c: number; rmse: number; tStart: number; tEnd: number; detections: number }
  gravity: GravityCheck
  /** 0..1 data-quality confidence for the toss timing values. */
  confidence: number
}

const MIN_TOSS_DETECTIONS = 6
/** Lead-in used by the release fit, before the first tracked detection (the hand model only holds near release). */
const RELEASE_WINDOW_S = 0.25
/**
 * Model-error floor for the release time (s). The ball path shows where free flight starts,
 * not when the fingers open; on two independent synthetic hand models the estimate ran 8-29 ms
 * early, so the floor is set to cover that definitional gap.
 */
const RELEASE_MODEL_SIGMA_S = 0.025
/** Share of the points that must lie after a candidate release (pure free flight). */
const MIN_FREE_FLIGHT_SHARE = 0.35
/**
 * Relative model error of the fitted vertical acceleration (drag adds ~3% on the way up,
 * perspective and rolling shutter a little more). Only matters when the apex is
 * extrapolated beyond the observed arc: the apex-time error then grows with the
 * extrapolation distance.
 */
const APEX_EXTRAPOLATION_ACCEL_REL = 0.05
/**
 * Largest plausible excess acceleration of the tossing hand over free flight, in g. A toss
 * drive peaks around 2-4 g; a hinge fit implying more is fitting a stray detection.
 */
const MAX_HAND_EXCESS_G = 8
/**
 * Air drag makes the arc slightly asymmetric, shifting the parabola apex by ~0.1% of the
 * release-to-apex time (~0.5 ms for a 1.2 m toss), measured on drag-integrated tosses.
 */
const APEX_DRAG_REL = 0.0012

function framePeriod(observations: BallObservation[]): number {
  const sorted = [...observations].sort((a, b) => a.tReal - b.tReal)
  const steps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const frames = sorted[i].frameIndex - sorted[i - 1].frameIndex
    if (frames > 0) steps.push((sorted[i].tReal - sorted[i - 1].tReal) / frames)
  }
  return steps.length ? median(steps) : NaN
}

function frameIndexAt(observations: BallObservation[], t: number, periodS: number): number {
  let nearest = observations[0]
  for (const o of observations) if (Math.abs(o.tReal - t) < Math.abs(nearest.tReal - t)) nearest = o
  return Math.round(nearest.frameIndex + (t - nearest.tReal) / periodS)
}

/** Apex time and height with 1-sigma from the fit covariance (delta method). */
function apexFromFit(fit: PolyFit): { t: number; y: number; tSigma: number; ySigma: number } {
  const [c0, c1, c2] = fit.coeffs
  const dt = -c1 / (2 * c2)
  const y = c0 - (c1 * c1) / (4 * c2)
  // Gradients w.r.t. (c0, c1, c2).
  const gT = [0, -1 / (2 * c2), c1 / (2 * c2 * c2)]
  const gY = [1, -c1 / (2 * c2), (c1 * c1) / (4 * c2 * c2)]
  const quad = (g: number[]) => g.reduce((sum, gi, i) => sum + gi * g.reduce((s, gj, j) => s + fit.cov[i][j] * gj, 0), 0)
  return { t: fit.t0 + dt, y, tSigma: Math.sqrt(Math.max(0, quad(gT))), ySigma: Math.sqrt(Math.max(0, quad(gY))) }
}


export interface ReleaseEstimate {
  t: number
  sigma: number
  method: string
  confidence: number
}

export interface ReleaseFitOptions {
  /** Time origin for the polynomial terms (centred time). */
  t0: number
  periodS: number
  /** Localisation noise floor (frame-height units). */
  noiseFloor: number
  /** Latest plausible release time, e.g. apex - 0.12 s. */
  tMax: number
  /**
   * Departure model exponents. Excess hand acceleration e(tau) ~ e1 tau + e2 tau^2 near release
   * gives a departure e1 tau^3 / 6 + e2 tau^4 / 12, hence [3, 4].
   */
  hingePowers?: number[]
  /** How far before the first tracked detection lead-in points are used. */
  windowS?: number
}

/**
 * Release (ball leaves hand). In the hand the ball's acceleration exceeds -g; it leaves the
 * hand when the hand decelerates faster than g, so the excess acceleration falls to zero
 * continuously. Before release the ball therefore sits above the backward extrapolation of
 * the free-flight parabola by a departure that starts like (t_r - t)^3. For each candidate
 * t_r the model (parabola + hinge terms) is linear, so t_r is found by a fine grid search on
 * least squares over one fixed point set. Because the departure grows only with the cube of
 * time, release timing is inherently much less precise than apex timing. Without a usable
 * lead-in the release is bounded by the first detection instead.
 *
 * Robustness: hinge fits implying an impossible hand acceleration are rejected (they are the
 * hinge absorbing a stray detection), and points far off the best model are trimmed before
 * the search is repeated.
 */
export function estimateRelease(detected: BallObservation[], leadIn: BallObservation[], options: ReleaseFitOptions): ReleaseEstimate {
  const { periodS, noiseFloor } = options
  const firstDetected = detected[0]
  const fallback: ReleaseEstimate = {
    t: firstDetected.tReal - 0.5 * periodS,
    sigma: periodS,
    method: 'first-detection',
    confidence: 0.4,
  }
  const byFrame = new Map<number, BallObservation>()
  for (const o of [...leadIn, ...detected]) byFrame.set(o.frameIndex, o)
  const tStart = firstDetected.tReal - (options.windowS ?? RELEASE_WINDOW_S)
  let points = [...byFrame.values()].filter((p) => p.tReal >= tStart).sort((p, q) => p.tReal - q.tReal)
  let search: HingeSearch | null = null
  for (let iter = 0; iter < 3; iter++) {
    const next = hingeSearch(points, options)
    if (!next) break
    search = next
    const residuals = points.map((p) => p.y - next.predict(p.tReal))
    const scale = Math.max(1.4826 * median(residuals.map(Math.abs)), noiseFloor)
    const kept = points.filter((_, i) => Math.abs(residuals[i]) <= 4 * scale)
    if (kept.length === points.length || kept.length < 8) break
    points = kept
  }
  if (!search) return fallback
  const { best, plainRss, grid, dof } = search
  const sigma2 = Math.max(best.rss / Math.max(1, dof), noiseFloor * noiseFloor)
  // No clear departure: every observed point is already in free flight, so the release
  // happened before the first one (not observed).
  if (plainRss - best.rss < 9 * sigma2) {
    return { t: points[0].tReal - 0.5 * periodS, sigma: periodS, method: 'before-first-detection', confidence: 0.4 }
  }
  const inside = grid.filter((g) => g.rss <= best.rss + sigma2).map((g) => g.t)
  const halfWidth = 0.5 * (Math.max(...inside) - Math.min(...inside))
  return {
    t: best.t,
    sigma: Math.max(halfWidth, 0.5 * periodS, RELEASE_MODEL_SIGMA_S),
    method: 'hinge-fit',
    confidence: 0.7,
  }
}

interface HingeSearch {
  best: { t: number; rss: number }
  grid: { t: number; rss: number }[]
  plainRss: number
  dof: number
  /** Best model's y(t) (hinge included). */
  predict: (t: number) => number
}

/** Grid search of the release time on one fixed point set; null when the set is too small. */
function hingeSearch(points: BallObservation[], options: ReleaseFitOptions): HingeSearch | null {
  const { t0, periodS, tMax } = options
  const powers = options.hingePowers ?? [3, 4]
  if (points.length < 8) return null
  // Keep a real free-flight segment after any candidate release. Without it (e.g. only the
  // rising arc is in frame) the hinge terms can absorb the whole path and the RSS profile
  // is flat, so the release lands anywhere.
  const minFreeFlightPoints = Math.max(MIN_TOSS_DETECTIONS, Math.ceil(MIN_FREE_FLIGHT_SHARE * points.length))
  const tMaxEffective = Math.min(tMax, points[Math.max(0, points.length - minFreeFlightPoints)].tReal)
  if (points.filter((p) => p.tReal < tMaxEffective).length < 5) return null
  const ys = points.map((p) => p.y)
  const design = (tr: number | null, t: number) => {
    const dt = t - t0
    const row = [1, dt, dt * dt]
    if (tr !== null) for (const power of powers) row.push(t < tr ? -((tr - t) ** power) : 0)
    return row
  }
  const solve = (tr: number | null) => weightedLeastSquares(points.map((p) => design(tr, p.tReal)), ys)
  const plain = solve(null)
  if (!plain) return null
  const tauMax = (tr: number) => tr - points[0].tReal
  const physical = (beta: number[], tr: number): boolean => {
    // The leading departure term must lift the ball above free flight, and the hand's
    // excess acceleration (second derivative of the hinge) must stay physical.
    if (!(beta[3] > 0)) return false
    const gImage = 2 * beta[2]
    if (!(gImage > 0)) return false
    for (const tau of [0.5 * tauMax(tr), tauMax(tr)]) {
      if (!(tau > 0)) continue
      const excess = powers.reduce((sum, p, k) => sum + beta[3 + k] * p * (p - 1) * tau ** (p - 2), 0)
      if (Math.abs(excess) > MAX_HAND_EXCESS_G * gImage) return false
    }
    return true
  }
  const step = periodS / 20
  const grid: { t: number; rss: number; beta: number[] }[] = []
  for (let t = points[0].tReal; t <= tMaxEffective + 1e-12; t += step) {
    const result = solve(t)
    if (result && physical(result.beta, t)) grid.push({ t, rss: result.rss, beta: result.beta })
    else grid.push({ t, rss: plain.rss, beta: plain.beta })
  }
  if (grid.length === 0) return null
  const best = grid.reduce((p, q) => (q.rss < p.rss ? q : p))
  const hinged = best.beta.length > 3
  return {
    best,
    grid,
    plainRss: plain.rss,
    dof: points.length - 3 - powers.length,
    predict: (t) => design(hinged ? best.t : null, t).reduce((sum, v, k) => sum + v * best.beta[k], 0),
  }
}

interface FreeFlightFit {
  yFit: PolyFit
  xFit: PolyFit
  inliers: BallObservation[]
}

function fitFreeFlight(observations: BallObservation[], aspect: number, noiseFloor: number): FreeFlightFit | null {
  if (observations.length < MIN_TOSS_DETECTIONS) return null
  const ts = observations.map((o) => o.tReal)
  const robustY = robustFitPolynomial(ts, observations.map((o) => o.y), 2, { minScale: noiseFloor })
  const robustX = robustFitPolynomial(ts, observations.map((o) => o.x * aspect), observations.length >= 8 ? 2 : 1, {
    minScale: noiseFloor,
  })
  if (!robustY || !robustX || !(robustY.fit.coeffs[2] > 0)) return null
  const inliers = observations.filter((_, i) => robustY.inlier[i])
  if (inliers.length < MIN_TOSS_DETECTIONS) return null
  return { yFit: robustY.fit, xFit: robustX.fit, inliers }
}

/**
 * Toss analysis. The tracker's toss track usually starts while the ball is still in the
 * hand (the in-hand path is within tolerance of the parabola for ~0.1 s), so the release is
 * estimated first on track + lead-in, and the free-flight parabola (apex, gravity check) is
 * then refitted on detections after release only.
 */
export function analyseToss(track: BallTrack, leadIn: BallObservation[], options: TossAnalysisOptions): TossAnalysis {
  const detected = track.observations.filter((o) => o.source !== 'predicted').sort((a, b) => a.tReal - b.tReal)
  const unavailable = (reason: string): TossAnalysis => ({
    status: 'unavailable',
    reason,
    gravity: { status: 'unavailable', reason },
    confidence: 0,
  })
  if (detected.length < MIN_TOSS_DETECTIONS) {
    return unavailable(`only ${detected.length} ball detections in flight; need ${MIN_TOSS_DETECTIONS}`)
  }
  const periodS = options.framePeriodS ?? framePeriod(track.observations)
  if (!(periodS > 0)) return unavailable('cannot determine frame period from timestamps')
  const radius = median(detected.map((o) => o.radius))
  const noiseFloor = 0.2 * radius
  const initial = fitFreeFlight(detected, options.aspect, noiseFloor)
  if (!initial) return unavailable('ball path is not a downward-accelerating free flight')
  const initialApex = apexFromFit(initial.yFit)
  const release = estimateRelease(initial.inliers, leadIn, {
    t0: initial.yFit.t0,
    periodS,
    noiseFloor,
    tMax: initialApex.t - 0.12,
  })
  const afterRelease = release.method === 'hinge-fit' ? detected.filter((o) => o.tReal >= release.t) : detected
  const { yFit, xFit, inliers } = fitFreeFlight(afterRelease, options.aspect, noiseFloor) ?? initial
  const xAt = (t: number) => evalPoly(xFit, t) / options.aspect

  // The gravity check always uses the data-only fit (the prior below must not feed back).
  const accel = 2 * yFit.coeffs[2]
  const accelSigma = 2 * Math.sqrt(Math.max(0, yFit.cov[2][2]))
  const gravity: GravityCheck = options.scale
    ? gravityTimeScaleCheck({
        accelerationNorm: accel,
        accelerationSigmaNorm: accelSigma,
        scale: options.scale,
        modelRelSigma: options.accelerationModelRelSigma,
      })
    : { status: 'unavailable', reason: 'no pixel-to-metre scale (player height in frame unknown)' }

  const dataApex = apexFromFit(yFit)
  const bracketed =
    inliers.filter((o) => o.tReal < dataApex.t).length >= 2 && inliers.filter((o) => o.tReal > dataApex.t).length >= 2
  // An unbracketed apex is an extrapolation; gravity pins its curvature when the time base
  // is known, unless the data themselves contradict g (then the prior would be wrong too).
  const priorFit =
    !bracketed && options.accelerationPrior && (gravity.status !== 'ok' || gravity.plausible)
      ? withAccelerationPrior(yFit, options.accelerationPrior)
      : null
  const apexFit = priorFit ?? yFit
  const apex = priorFit ? apexFromFit(priorFit) : dataApex
  const before = inliers.filter((o) => o.tReal < apex.t)
  const after = inliers.filter((o) => o.tReal > apex.t)
  // Apex beyond the well-observed arc (e.g. only the rise is in frame): t_apex - t_edge = v / A
  // and y_edge - y_apex = v^2 / 2A, so a relative acceleration error moves both
  // proportionally. A side with fewer than two points does not count as observed. With the
  // prior, its sigma already carries the acceleration model error.
  const edge = after.length < 2 && before.length > 0 ? before[before.length - 1] : before.length < 2 && after.length > 0 ? after[0] : null
  const extrapolationS = edge && !priorFit ? Math.abs(apex.t - edge.tReal) : 0
  const yEdge = edge ? evalPoly(apexFit, edge.tReal) : apex.y
  const apexExtrapolationSigmaS = APEX_EXTRAPOLATION_ACCEL_REL * extrapolationS
  const apexExtrapolationSigmaY = extrapolationS > 0 ? APEX_EXTRAPOLATION_ACCEL_REL * Math.abs(yEdge - apex.y) : 0

  const gravityTerm = gravity.status !== 'ok' ? 0.85 : gravity.plausible ? 1 : 0.5
  const fitTerm = clamp(1 - (yFit.rmse / radius - 0.35) / 1.5, 0.3, 1)
  const coverageTerm = bracketed ? 1 : priorFit ? 0.75 : 0.5
  const confidence = smoothstep(4, 15, inliers.length) * fitTerm * coverageTerm * gravityTerm

  const yRelease = evalPoly(apexFit, release.t)
  const refs = options.references ?? {}
  const heights: TossHeights = { riseAboveReleaseNorm: yRelease - apex.y }
  if (refs.headTopY !== undefined) heights.aboveHeadNorm = refs.headTopY - apex.y
  if (refs.groundY !== undefined) {
    heights.aboveGroundNorm = refs.groundY - apex.y
    if (refs.bodyHeightNorm) heights.apexOverBodyHeight = heights.aboveGroundNorm / refs.bodyHeightNorm
  }
  if (refs.bodyHeightNorm) heights.riseOverBodyHeight = heights.riseAboveReleaseNorm / refs.bodyHeightNorm

  const allObservations = [...leadIn, ...track.observations]
  const abs = toAbsoluteQuadratic(yFit)
  return {
    status: 'ok',
    release: {
      tReal: release.t,
      // First frame of free flight: the first frame at or after the release instant.
      frameIndex: frameIndexAt(allObservations, release.t + 0.5 * periodS, periodS),
      uncertaintyS: release.sigma,
      x: xAt(release.t),
      y: yRelease,
      confidence: release.confidence * confidence,
      method: `ball-${release.method}`,
    },
    apex: {
      tReal: apex.t,
      frameIndex: frameIndexAt(allObservations, apex.t, periodS),
      // Fit covariance plus the air-drag asymmetry of the arc (not in the parabola model) and,
      // for an extrapolated apex, the acceleration model error; floor of 5% of a frame
      // against over-confident covariances.
      uncertaintyS: Math.max(
        Math.hypot(apex.tSigma, APEX_DRAG_REL * Math.max(0, apex.t - release.t), apexExtrapolationSigmaS),
        0.05 * periodS,
      ),
      x: xAt(apex.t),
      y: apex.y,
      yUncertaintyNorm: Math.hypot(apex.ySigma, apexExtrapolationSigmaY),
      bracketed,
      gravityPrior: priorFit !== null,
      aboveFrame: apex.y < 0,
      confidence,
      method: priorFit ? 'ball-apex-fit+gravity-prior' : 'ball-apex-fit',
    },
    heights,
    fit: { ...abs, rmse: yFit.rmse, tStart: inliers[0].tReal, tEnd: inliers[inliers.length - 1].tReal, detections: inliers.length },
    gravity,
    confidence,
  }
}

/** Adapter to the shared ServeEvents contract. */
export function toEventEstimate(event: TossEvent): EventEstimate {
  return {
    frameIndex: event.frameIndex,
    tReal: event.tReal,
    uncertaintyS: event.uncertaintyS,
    confidence: event.confidence,
    method: event.method,
  }
}
