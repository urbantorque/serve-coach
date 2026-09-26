/**
 * Links per-frame ball candidates into a toss track and an outgoing (post-contact) track.
 *
 * Toss: RANSAC over candidate triplets from distinct frames. Each hypothesis is an exact
 * quadratic y(t) (image y grows downward, so free flight has a > 0) plus a linear x(t);
 * support is MSAC-scored (at most one candidate per frame). The winner is refined with a
 * contiguity constraint and Tukey-biweight IRLS. Frames between inliers with no detection
 * get 'predicted' observations from the fit when the gap is short.
 *
 * Outgoing: after contact the ball is fast and nearly straight over the first ~0.1 s.
 * Hypotheses are pairs of candidates from different frames after contact whose line passes
 * back near the contact point and which are NOT explained by the toss parabola continuing.
 * The best line is then extended frame by frame with an alpha-beta (constant velocity)
 * predictor, so curved paths (gravity, perspective in a rear view) are followed.
 *
 * All distances are in frame-height units (x multiplied by aspect).
 */
import type { BallObservation, BallTrack } from '../types.ts'
import { clamp } from './colour.ts'
import { evalPoly, evalPolyDerivative, fitPolynomial, invertMatrix, median, robustFitPolynomial, toAbsoluteQuadratic, type PolyFit } from './fit.ts'
import { createRng, randomInt, type Rng } from './random.ts'

export interface CandidateLike {
  x: number
  y: number
  radiusNorm: number
  score: number
  streakLengthNorm?: number
}

export interface FrameCandidates {
  frameIndex: number
  tReal: number
  candidates: CandidateLike[]
}

export interface TrackerOptions {
  /** Frame width / height. */
  aspect: number
  /** Expected ball radius (frame-height units); defaults to the median candidate radius. */
  expectedRadiusNorm?: number
  /** Contact time from audio / pose fusion. Toss candidates after it are ignored. */
  contactTReal?: number
  /** Where the ball was at contact (normalised), when there is no toss track to supply it. */
  contactPoint?: { x: number; y: number }
  /** Restrict the toss search to this time window (e.g. from the tossing-arm motion). */
  tossSearchWindow?: { tStart: number; tEnd: number }
  /**
   * Longest plausible toss flight in the timestamps' time base (default 3 s; raise it for
   * un-corrected slow-motion media time). Also sets the stationary-clutter window (a quarter
   * of it either side), so it must not be smaller than the real toss in timestamp units.
   */
  maxTossDurationS?: number
  /** Candidates present at one spot in at least this fraction of the window's frames are clutter. */
  stationaryOccupancy?: number
  /** Sequential RANSAC rounds: a rejected hypothesis's support is removed and the search rerun. */
  tossSearchRounds?: number
  ransacIterations?: number
  seed?: number
  /** Gaps up to max(maxGapFrames, maxGapS * fps) are bridged and filled with predictions. */
  maxGapFrames?: number
  maxGapS?: number
  minTossDetections?: number
  /** How far before the first free-flight detection to follow the ball back into the hand. */
  leadInMaxS?: number
  /** Minimum image speed of an outgoing ball (frame heights per second). */
  minOutgoingSpeedNormPerS?: number
  outgoingSeedWindowS?: number
  outgoingMaxDurationS?: number
  /** Timing error tolerated in contactTReal (s; at least 3 frame periods): the outgoing path may meet the toss anywhere within it. */
  contactSlackS?: number
}

export interface TossTrackResult {
  track: BallTrack
  /** Robust fits in centred time, frame-height units (x includes aspect). */
  yFit: PolyFit
  xFit: PolyFit
  /** Ball followed backwards from the first free-flight detection (usually in the hand). */
  leadIn: BallObservation[]
  detections: number
}

export interface TrackContact {
  /** Time where the outgoing path, extended back, meets the toss parabola. */
  tReal: number
  /** 1-sigma (s): back-projected position error over the closing image speed, plus string dwell. */
  uncertaintyS: number
  /** Closest distance between the two paths (frame-height units). */
  missDistanceNorm: number
}

export interface OutgoingTrackResult {
  track: BallTrack
  contactTReal: number
  /** Normalised contact point used to seed the track. */
  contactPoint: { x: number; y: number }
  /** Initial image velocity from the seed line fit (frame-height units per second, x includes aspect). */
  initialVelocity: { vx: number; vy: number }
  /** Contact time measured from the ball paths alone (needs a toss track); see contactFromTracks. */
  contactFromTracks?: TrackContact
}

export interface TrackerResult {
  toss: TossTrackResult | null
  outgoing: OutgoingTrackResult | null
  tracks: BallTrack[]
}

interface Flat {
  frame: number
  t: number
  xh: number
  y: number
  radius: number
  score: number
  streak: number
  /** Occupies the same spot for most of a long window (see markStationary). */
  stationary: boolean
}

interface Context {
  frames: FrameCandidates[]
  byFrame: Flat[][]
  flat: Flat[]
  aspect: number
  radius: number
  baseTol: number
  periodS: number
  gapFrames: number
}

const DEFAULTS = {
  maxTossDurationS: 3,
  stationaryOccupancy: 0.6,
  tossSearchRounds: 3,
  ransacIterations: 1500,
  seed: 1,
  maxGapFrames: 4,
  maxGapS: 0.1,
  minTossDetections: 6,
  leadInMaxS: 0.5,
  minOutgoingSpeedNormPerS: 0.8,
  outgoingSeedWindowS: 0.1,
  outgoingMaxDurationS: 1.5,
  contactSlackS: 0.03,
}

type Options = TrackerOptions & typeof DEFAULTS

function buildContext(frames: FrameCandidates[], opts: Options): Context {
  const sorted = [...frames].sort((a, b) => a.tReal - b.tReal)
  const byFrame: Flat[][] = sorted.map((frame, index) =>
    frame.candidates.map((c) => ({
      frame: index,
      t: frame.tReal,
      xh: c.x * opts.aspect,
      y: c.y,
      radius: c.radiusNorm,
      score: Math.max(1e-3, c.score),
      streak: c.streakLengthNorm ?? 0,
      stationary: false,
    })),
  )
  const flat = byFrame.flat()
  const radius = opts.expectedRadiusNorm ?? (flat.length ? median(flat.map((f) => f.radius)) : 0.01)
  const dts = sorted.slice(1).map((f, i) => f.tReal - sorted[i].tReal).filter((dt) => dt > 0)
  const periodS = dts.length ? median(dts) : 1 / 30
  return {
    frames: sorted,
    byFrame,
    flat,
    aspect: opts.aspect,
    radius,
    // Localisation of a small blurred ball is ~0.2-0.5 radius; allow for model error on top.
    baseTol: Math.max(1.5 * radius, 0.004),
    periodS,
    gapFrames: Math.max(opts.maxGapFrames, Math.round(opts.maxGapS / periodS)),
  }
}

/**
 * Flag candidates that occupy one spot in most frames of a long window: a spare ball on the
 * ground, a logo, a yellow shirt at rest. A ball in free flight stays within the tolerance
 * of one spot for at most ~0.2 s of real time (around the apex), far below the occupancy
 * threshold over a window of a quarter of the maximum toss duration either side.
 */
function markStationary(ctx: Context, halfWindowS: number, minOccupancy: number, minWindowFrames = 6): void {
  const tol2 = ctx.baseTol * ctx.baseTol
  for (let f = 0; f < ctx.frames.length; f++) {
    if (ctx.byFrame[f].length === 0) continue
    const lo = lowerBoundFrame(ctx.frames, ctx.frames[f].tReal - halfWindowS)
    const hi = lowerBoundFrame(ctx.frames, ctx.frames[f].tReal + halfWindowS + 1e-9)
    const otherFrames = hi - lo - 1
    if (otherFrames < minWindowFrames) continue
    const needed = Math.ceil(minOccupancy * otherFrames)
    for (const c of ctx.byFrame[f]) {
      let occupied = 0
      let remaining = otherFrames
      for (let g = lo; g < hi && occupied < needed && occupied + remaining >= needed; g++) {
        if (g === f) continue
        remaining--
        if (ctx.byFrame[g].some((d) => (d.xh - c.xh) ** 2 + (d.y - c.y) ** 2 < tol2)) occupied++
      }
      c.stationary = occupied >= needed
    }
  }
}

function tolFor(ctx: Context, c: Flat, factor = 1): number {
  return factor * ctx.baseTol + 0.5 * c.streak
}

/** First frame index with t >= time (binary search). */
function lowerBoundFrame(frames: FrameCandidates[], time: number): number {
  let lo = 0
  let hi = frames.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].tReal < time) lo = mid + 1
    else hi = mid
  }
  return lo
}

interface TossModel {
  y: Pick<PolyFit, 't0' | 'coeffs'>
  x: Pick<PolyFit, 't0' | 'coeffs'>
}

function nearestInFrame(
  ctx: Context,
  frame: number,
  xh: number,
  y: number,
  allowed?: (c: Flat) => boolean,
): { c: Flat; d2: number } | null {
  let best: Flat | null = null
  let bestD2 = Infinity
  for (const c of ctx.byFrame[frame]) {
    if (allowed && !allowed(c)) continue
    const d2 = (c.xh - xh) ** 2 + (c.y - y) ** 2
    if (d2 < bestD2) {
      bestD2 = d2
      best = c
    }
  }
  return best ? { c: best, d2: bestD2 } : null
}

function scoreTossModel(ctx: Context, model: TossModel, f0: number, f1: number, allowed: (c: Flat) => boolean): number {
  let score = 0
  for (let f = f0; f < f1; f++) {
    const t = ctx.frames[f].tReal
    const y = evalPoly(model.y, t)
    if (y < -0.3 || y > 1.3) continue
    const hit = nearestInFrame(ctx, f, evalPoly(model.x, t), y, allowed)
    if (!hit) continue
    const tol = tolFor(ctx, hit.c)
    if (hit.d2 < tol * tol) score += hit.c.score * (1 - hit.d2 / (tol * tol))
  }
  return score
}

/**
 * Exact parabola through three candidates. Rejects hypotheses without real vertical motion
 * (a static yellow object gives a flat 'parabola' with a ~ 0).
 */
function hypothesisFromTriplet(sample: Flat[], minRise: number): TossModel | null {
  const ys = sample.map((s) => s.y)
  if (Math.max(...ys) - Math.min(...ys) < minRise) return null
  const ts = sample.map((s) => s.t)
  const t0 = (ts[0] + ts[1] + ts[2]) / 3
  const yFit = fitPolynomial(ts, sample.map((s) => s.y), 2, undefined, t0)
  const xFit = fitPolynomial(ts, sample.map((s) => s.xh), 1, undefined, t0)
  if (!yFit || !xFit) return null
  if (!(yFit.coeffs[2] > 0)) return null
  const apexY = yFit.coeffs[0] - (yFit.coeffs[1] * yFit.coeffs[1]) / (4 * yFit.coeffs[2])
  if (apexY < -0.6) return null
  return { y: yFit, x: xFit }
}

function pickWeighted(rng: Rng, cumulative: number[]): number {
  const target = rng() * cumulative[cumulative.length - 1]
  let lo = 0
  let hi = cumulative.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

function ransacToss(ctx: Context, pool: Flat[], opts: Options, rng: Rng): TossModel | null {
  if (pool.length < 3) return null
  const half = opts.maxTossDurationS / 2
  const cumulative: number[] = []
  pool.reduce((sum, c, i) => (cumulative[i] = sum + c.score), 0)
  const allowed = new Set(pool)
  const isAllowed = (c: Flat) => allowed.has(c)
  let best: TossModel | null = null
  let bestScore = 0
  for (let iter = 0; iter < opts.ransacIterations; iter++) {
    const seed = pool[pickWeighted(rng, cumulative)]
    const lo = lowerBoundPool(pool, seed.t - half)
    const hi = lowerBoundPool(pool, seed.t + half + 1e-9)
    if (hi - lo < 3) continue
    const a = pool[lo + randomInt(rng, hi - lo)]
    const b = pool[lo + randomInt(rng, hi - lo)]
    const sample = [seed, a, b].sort((p, q) => p.t - q.t)
    if (sample[1].frame - sample[0].frame < 2 || sample[2].frame - sample[1].frame < 2) continue
    const model = hypothesisFromTriplet(sample, 2 * ctx.baseTol)
    if (!model) continue
    const f0 = lowerBoundFrame(ctx.frames, sample[0].t - half)
    const f1 = lowerBoundFrame(ctx.frames, sample[2].t + half + 1e-9)
    const score = scoreTossModel(ctx, model, f0, f1, isAllowed)
    if (score > bestScore) {
      bestScore = score
      best = model
    }
  }
  return best
}

function lowerBoundPool(pool: Flat[], time: number): number {
  let lo = 0
  let hi = pool.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pool[mid].t < time) lo = mid + 1
    else hi = mid
  }
  return lo
}

function collectInliers(ctx: Context, model: TossModel, allowed: (c: Flat) => boolean, tolFactor: number, f0: number, f1: number): Flat[] {
  const inliers: Flat[] = []
  for (let f = f0; f < f1; f++) {
    const t = ctx.frames[f].tReal
    const y = evalPoly(model.y, t)
    if (y < -0.3 || y > 1.3) continue
    const hit = nearestInFrame(ctx, f, evalPoly(model.x, t), y, allowed)
    if (!hit) continue
    const tol = tolFor(ctx, hit.c, tolFactor)
    if (hit.d2 < tol * tol) inliers.push(hit.c)
  }
  return inliers
}

/** Frame visibility predicate: false when the model puts the ball outside the frame. */
type VisibleAt = (frame: number) => boolean

/**
 * The ball is expected to be detectable when its centre is at least one radius inside the
 * frame. A toss whose apex leaves the top of the frame is therefore not "missing" there.
 */
function visibleUnder(ctx: Context, model: TossModel): VisibleAt {
  return (frame) => {
    const t = ctx.frames[frame].tReal
    const y = evalPoly(model.y, t)
    const xh = evalPoly(model.x, t)
    return y > ctx.radius && y < 1 - ctx.radius && xh > ctx.radius && xh < ctx.aspect - ctx.radius
  }
}

/** Frames strictly between two frame indices where the ball should have been visible. */
function missedVisibleFrames(from: number, to: number, visible?: VisibleAt): number {
  if (!visible) return to - from - 1
  let missed = 0
  for (let f = from + 1; f < to; f++) if (visible(f)) missed++
  return missed
}

/** Minimum detections for a segment on the far side of an out-of-frame gap. */
const MIN_SEGMENT_DETECTIONS = 2

/** Vertical image-velocity reversal assumed when following the outgoing ball through a bounce. */
const BOUNCE_RESTITUTION_GUESS = 0.6

/**
 * Split time-sorted inliers at out-of-frame gaps (the model puts the ball outside the frame
 * for at least one frame between them) and drop segments of fewer than
 * MIN_SEGMENT_DETECTIONS: one stray candidate on the far side of such a gap would otherwise
 * pin the parabola with a long lever arm. Keeps the largest segment if all are small.
 */
function dropIsolatedSegments(inliers: Flat[], visible: VisibleAt): Flat[] {
  const segments: Flat[][] = []
  for (const c of inliers) {
    const current = segments[segments.length - 1]
    const previous = current?.[current.length - 1]
    let outOfFrame = false
    if (previous) for (let f = previous.frame + 1; f < c.frame && !outOfFrame; f++) outOfFrame = !visible(f)
    if (!current || outOfFrame) segments.push([c])
    else current.push(c)
  }
  const kept = segments.filter((s) => s.length >= MIN_SEGMENT_DETECTIONS)
  if (kept.length === 0) return segments.reduce((a, b) => (b.length > a.length ? b : a), [] as Flat[])
  return kept.flat()
}

/**
 * Split time-sorted inliers where more than ctx.gapFrames frames in a row went undetected
 * while the ball should have been visible, and keep the heaviest run.
 */
function heaviestContiguousRun(ctx: Context, inliers: Flat[], visible?: VisibleAt): Flat[] {
  let best: Flat[] = []
  let bestWeight = -1
  let run: Flat[] = []
  let weight = 0
  const flush = () => {
    if (weight > bestWeight) {
      best = run
      bestWeight = weight
    }
  }
  for (const c of inliers) {
    if (run.length && missedVisibleFrames(run[run.length - 1].frame, c.frame, visible) > ctx.gapFrames) {
      flush()
      run = []
      weight = 0
    }
    run.push(c)
    weight += c.score
  }
  flush()
  return best
}

function refineToss(ctx: Context, initial: TossModel, allowed: (c: Flat) => boolean, opts: Options): { yFit: PolyFit; xFit: PolyFit; inliers: Flat[] } | null {
  let model = initial
  let result: { yFit: PolyFit; xFit: PolyFit; inliers: Flat[] } | null = null
  const f0 = 0
  const f1 = ctx.frames.length
  for (let iter = 0; iter < 4; iter++) {
    const visible = visibleUnder(ctx, model)
    const inliers = dropIsolatedSegments(
      heaviestContiguousRun(ctx, collectInliers(ctx, model, allowed, iter === 0 ? 1 : 1.2, f0, f1), visible),
      visible,
    )
    if (inliers.length < Math.max(4, opts.minTossDetections - 2)) return result
    const ts = inliers.map((c) => c.t)
    const weights = inliers.map((c) => c.score)
    const robustY = robustFitPolynomial(ts, inliers.map((c) => c.y), 2, { minScale: 0.25 * ctx.radius, priorWeights: weights })
    const robustX = robustFitPolynomial(ts, inliers.map((c) => c.xh), inliers.length >= 6 ? 2 : 1, {
      minScale: 0.25 * ctx.radius,
      priorWeights: weights,
    })
    if (!robustY || !robustX || !(robustY.fit.coeffs[2] > 0)) return result
    const kept = inliers.filter((_, i) => robustY.inlier[i] && robustX.inlier[i])
    result = { yFit: robustY.fit, xFit: robustX.fit, inliers: kept }
    model = { y: robustY.fit, x: robustX.fit }
  }
  return result
}

function observation(ctx: Context, c: Flat, source: BallObservation['source']): BallObservation {
  return {
    frameIndex: ctx.frames[c.frame].frameIndex,
    tReal: c.t,
    x: c.xh / ctx.aspect,
    y: c.y,
    radius: c.radius,
    score: source === 'detected' ? c.score : 0,
    source,
  }
}

/**
 * Detected observations plus model predictions for short gaps between them. Frames where
 * the model puts the ball outside the frame get no observation.
 */
function withGapPredictions(
  ctx: Context,
  detected: Flat[],
  predict: (t: number) => { xh: number; y: number },
  visible?: VisibleAt,
): BallObservation[] {
  const out: BallObservation[] = []
  for (let i = 0; i < detected.length; i++) {
    out.push(observation(ctx, detected[i], 'detected'))
    const next = detected[i + 1]
    if (!next) break
    const gap = missedVisibleFrames(detected[i].frame, next.frame, visible)
    if (gap <= 0 || gap > ctx.gapFrames) continue
    for (let f = detected[i].frame + 1; f < next.frame; f++) {
      if (visible && !visible(f)) continue
      const t = ctx.frames[f].tReal
      const p = predict(t)
      out.push({
        frameIndex: ctx.frames[f].frameIndex,
        tReal: t,
        x: p.xh / ctx.aspect,
        y: p.y,
        radius: ctx.radius,
        score: 0,
        source: 'predicted',
      })
    }
  }
  return out
}

/** Follow the ball backwards from the first free-flight detection (into the tossing hand). */
function followLeadIn(ctx: Context, first: Flat, fit: { yFit: PolyFit; xFit: PolyFit }, opts: Options, exclude: Set<Flat>): Flat[] {
  const chain: Flat[] = []
  let pos = { xh: first.xh, y: first.y, t: first.t }
  let vel = { xh: evalPolyDerivative(fit.xFit, first.t), y: evalPolyDerivative(fit.yFit, first.t) }
  let misses = 0
  for (let f = first.frame - 1; f >= 0; f--) {
    const t = ctx.frames[f].tReal
    if (first.t - t > opts.leadInMaxS) break
    const dt = pos.t - t
    const pred = { xh: pos.xh - vel.xh * dt, y: pos.y - vel.y * dt }
    const hit = nearestInFrame(ctx, f, pred.xh, pred.y)
    const gate = 1.5 * ctx.baseTol + 0.5 * Math.hypot(vel.xh, vel.y) * dt
    if (hit && !exclude.has(hit.c) && hit.d2 < gate * gate) {
      const measured = { xh: (pos.xh - hit.c.xh) / dt, y: (pos.y - hit.c.y) / dt }
      vel = { xh: 0.5 * vel.xh + 0.5 * measured.xh, y: 0.5 * vel.y + 0.5 * measured.y }
      pos = { xh: hit.c.xh, y: hit.c.y, t }
      chain.push(hit.c)
      misses = 0
    } else if (++misses > ctx.gapFrames) {
      break
    }
  }
  return chain.reverse()
}

/**
 * Sequential RANSAC: when the best hypothesis does not survive refinement (e.g. a flat arc
 * through clutter), its support is removed from the pool and the search is repeated.
 * Stationary clutter never enters the pool.
 */
function findToss(ctx: Context, opts: Options): TossTrackResult | null {
  const tEnd = Math.min(opts.contactTReal ?? Infinity, opts.tossSearchWindow?.tEnd ?? Infinity)
  const tStart = opts.tossSearchWindow?.tStart ?? -Infinity
  let pool = ctx.flat.filter((c) => !c.stationary && c.t >= tStart && c.t <= tEnd + 1e-9)
  const rng = createRng(opts.seed)
  for (let round = 0; round < opts.tossSearchRounds; round++) {
    const poolSet = new Set(pool)
    const allowed = (c: Flat) => poolSet.has(c)
    const hypothesis = ransacToss(ctx, pool, opts, rng)
    if (!hypothesis) return null
    const accepted = acceptToss(ctx, hypothesis, allowed, opts)
    if (accepted) return accepted
    const support = new Set(collectInliers(ctx, hypothesis, allowed, 1, 0, ctx.frames.length))
    if (support.size === 0) return null
    pool = pool.filter((c) => !support.has(c))
  }
  return null
}

/** Refine a RANSAC hypothesis into a toss track, or reject it. */
function acceptToss(ctx: Context, hypothesis: TossModel, allowed: (c: Flat) => boolean, opts: Options): TossTrackResult | null {
  const refined = refineToss(ctx, hypothesis, allowed, opts)
  if (!refined || refined.inliers.length < opts.minTossDetections) return null
  const { yFit, xFit, inliers } = refined
  const yValues = inliers.map((c) => c.y)
  if (Math.max(...yValues) - Math.min(...yValues) < 3 * ctx.radius) return null

  const leadIn = followLeadIn(ctx, inliers[0], refined, opts, new Set(inliers))
  const first = inliers[0]
  const last = inliers[inliers.length - 1]
  const abs = toAbsoluteQuadratic(yFit)
  const apexT = yFit.t0 - yFit.coeffs[1] / (2 * yFit.coeffs[2])
  const span = last.t - first.t
  // Near-vertical: horizontal speed at the first detection no more than its vertical speed.
  const vx0 = Math.abs(evalPolyDerivative(xFit, first.t))
  const vy0 = Math.abs(evalPolyDerivative(yFit, first.t))
  // A parabola peaking above the top edge left the frame upward: a toss even when only one
  // side of the apex is in view (a pre-serve bounce never reaches the top of the frame).
  const apexAboveFrame = evalPoly(yFit, apexT) < 0
  const apexNearTrack = (apexT >= first.t - 0.25 * span && apexT <= last.t + 0.25 * span) || apexAboveFrame
  const kind: BallTrack['kind'] = apexNearTrack && vx0 <= Math.max(vy0, 0.5 * ctx.baseTol / ctx.periodS) ? 'toss' : 'unknown'
  const track: BallTrack = {
    id: 1,
    kind,
    observations: withGapPredictions(
      ctx,
      inliers,
      (t) => ({ xh: evalPoly(xFit, t), y: evalPoly(yFit, t) }),
      visibleUnder(ctx, { x: xFit, y: yFit }),
    ),
    fit: { a: abs.a, b: abs.b, c: abs.c, rmse: yFit.rmse, tStart: first.t, tEnd: last.t },
  }
  return {
    track,
    yFit,
    xFit,
    leadIn: leadIn.map((c) => observation(ctx, c, 'detected')),
    detections: inliers.length,
  }
}

/** Half the ~4 ms string dwell: the path intersection falls somewhere inside it (1 sigma, s). */
const CONTACT_DWELL_SIGMA_S = 0.002

/**
 * Contact time from the ball alone: where the outgoing path, extended back, meets the toss
 * parabola. The outgoing path is fitted to its first few detections (quadratic from 4, so a
 * ball decelerating in the image is followed), then Gauss-Newton on the squared distance.
 * Uncertainty: back-projected position error over the closing image speed, plus the dwell.
 * Null when the paths do not meet within tolerance (e.g. the outgoing track is not this ball).
 */
function contactFromTracks(ctx: Context, toss: TossTrackResult, outgoing: Flat[], tGuess: number): TrackContact | null {
  // Two points always define a path that can meet the toss, even when one is a stray
  // candidate (racket, blur fringe): at least three, and they must agree with the fit.
  const first = outgoing.slice(0, 5)
  if (first.length < 3) return null
  const degree = first.length >= 4 ? 2 : 1
  const ts = first.map((c) => c.t)
  const fx = fitPolynomial(ts, first.map((c) => c.xh), degree, undefined, first[0].t)
  const fy = fitPolynomial(ts, first.map((c) => c.y), degree, undefined, first[0].t)
  if (!fx || !fy) return null
  const worstResidual = Math.max(...first.map((c) => Math.hypot(evalPoly(fx, c.t) - c.xh, evalPoly(fy, c.t) - c.y)))
  if (worstResidual > ctx.baseTol) return null
  const gap = (t: number) => ({ xh: evalPoly(fx, t) - evalPoly(toss.xFit, t), y: evalPoly(fy, t) - evalPoly(toss.yFit, t) })
  const closing = (t: number) => ({
    xh: evalPolyDerivative(fx, t) - evalPolyDerivative(toss.xFit, t),
    y: evalPolyDerivative(fy, t) - evalPolyDerivative(toss.yFit, t),
  })
  let t = tGuess
  for (let iter = 0; iter < 8; iter++) {
    const d = gap(t)
    const v = closing(t)
    const v2 = v.xh * v.xh + v.y * v.y
    if (!(v2 > 0)) return null
    const step = -(d.xh * v.xh + d.y * v.y) / v2
    t += clamp(step, -2 * ctx.periodS, 2 * ctx.periodS)
    if (Math.abs(step) < 1e-7) break
  }
  const d = gap(t)
  const miss = Math.hypot(d.xh, d.y)
  const speed = Math.hypot(closing(t).xh, closing(t).y)
  if (!(speed > 0) || miss > 2 * ctx.baseTol || t > first[0].t || t < first[0].t - 4 * ctx.periodS - 0.02) return null
  // Extrapolation variance of the outgoing fit at t for localisation noise ~0.3 radius per
  // detection: sigma^2 g' (X'X)^-1 g with g = (1, dt, dt^2); the toss fit adds a little.
  const noise = 0.3 * ctx.radius
  const row = (time: number) => Array.from({ length: degree + 1 }, (_, k) => (time - first[0].t) ** k)
  const xtx = Array.from({ length: degree + 1 }, (_, i) => Array.from({ length: degree + 1 }, (_, j) => ts.reduce((s, time) => s + row(time)[i] * row(time)[j], 0)))
  const inverse = invertMatrix(xtx)
  if (!inverse) return null
  const g = row(t)
  const leverage = g.reduce((s, gi, i) => s + gi * g.reduce((s2, gj, j) => s2 + inverse[i][j] * gj, 0), 0)
  const positionSigma = noise * Math.sqrt(Math.max(0, leverage) + 1 / Math.max(1, toss.detections))
  return { tReal: t, uncertaintyS: Math.hypot(positionSigma / speed, CONTACT_DWELL_SIGMA_S), missDistanceNorm: miss }
}

interface LineHypothesis {
  p0: { xh: number; y: number }
  v: { xh: number; y: number }
  t0: number
}

function lineAt(line: LineHypothesis, t: number): { xh: number; y: number } {
  return { xh: line.p0.xh + line.v.xh * (t - line.t0), y: line.p0.y + line.v.y * (t - line.t0) }
}

function findOutgoing(ctx: Context, toss: TossTrackResult | null, opts: Options): OutgoingTrackResult | null {
  const lastToss = toss ? toss.track.observations.filter((o) => o.source === 'detected').at(-1) : undefined
  const tC = opts.contactTReal ?? (lastToss ? lastToss.tReal + 0.5 * ctx.periodS : undefined)
  if (tC === undefined) return null
  const anchor = toss
    ? { xh: evalPoly(toss.xFit, tC), y: evalPoly(toss.yFit, tC) }
    : opts.contactPoint
      ? { xh: opts.contactPoint.x * ctx.aspect, y: opts.contactPoint.y }
      : null
  if (!anchor) return null

  // The given contact time may be off by the sound delay or fusion error: search +- slack.
  const slack = Math.max(3 * ctx.periodS, opts.contactSlackS)
  const f0 = lowerBoundFrame(ctx.frames, tC - slack + 1e-9)
  const fSeedEnd = lowerBoundFrame(ctx.frames, tC + slack + Math.max(opts.outgoingSeedWindowS, 4 * ctx.periodS) + 1e-9)
  const moving = (c: Flat) => !c.stationary
  const explainedByToss = (c: Flat) => {
    if (!toss) return false
    const d = Math.hypot(c.xh - evalPoly(toss.xFit, c.t), c.y - evalPoly(toss.yFit, c.t))
    return d < tolFor(ctx, c)
  }
  const seeds = ctx.byFrame.slice(f0, fSeedEnd).flat().filter((c) => moving(c) && !explainedByToss(c))
  // Closest approach of a line to the contact reference (the toss path, else the fixed
  // contact point) within tC +- slack.
  const meetStep = ctx.periodS / 8
  const meet = (line: LineHypothesis): { t: number; d: number } => {
    let best = { t: tC, d: Infinity }
    for (let t = tC - slack; t <= tC + slack + 1e-12; t += meetStep) {
      const p = lineAt(line, t)
      const q = toss ? { xh: evalPoly(toss.xFit, t), y: evalPoly(toss.yFit, t) } : anchor
      const d = Math.hypot(p.xh - q.xh, p.y - q.y)
      if (d < best.d) best = { t, d }
    }
    return best
  }

  let best: { line: LineHypothesis; score: number; inliers: Flat[] } | null = null
  for (let i = 0; i < seeds.length; i++) {
    for (let j = 0; j < seeds.length; j++) {
      const a = seeds[i]
      const b = seeds[j]
      if (b.frame <= a.frame) continue
      const v = { xh: (b.xh - a.xh) / (b.t - a.t), y: (b.y - a.y) / (b.t - a.t) }
      const speed = Math.hypot(v.xh, v.y)
      if (speed < opts.minOutgoingSpeedNormPerS) continue
      const line: LineHypothesis = { p0: { xh: a.xh, y: a.y }, v, t0: a.t }
      // The line must come back to the contact reference, before its own first point.
      const met = meet(line)
      if (met.d > 3 * ctx.baseTol + 0.5 * speed * meetStep || met.t > a.t + 1e-9) continue
      let score = 0
      const inliers: Flat[] = []
      for (let f = f0; f < fSeedEnd; f++) {
        if (ctx.frames[f].tReal <= met.t) continue
        const p = lineAt(line, ctx.frames[f].tReal)
        const hit = nearestInFrame(ctx, f, p.xh, p.y, moving)
        if (!hit) continue
        const tol = tolFor(ctx, hit.c) + 0.05 * speed * ctx.periodS
        if (hit.d2 < tol * tol && !explainedByToss(hit.c)) {
          score += hit.c.score * (1 - hit.d2 / (tol * tol))
          inliers.push(hit.c)
        }
      }
      if (inliers.length >= 2 && (!best || score > best.score)) best = { line, score, inliers }
    }
  }
  if (!best) return null

  const ts = best.inliers.map((c) => c.t)
  const fitX = fitPolynomial(ts, best.inliers.map((c) => c.xh), 1)
  const fitY = fitPolynomial(ts, best.inliers.map((c) => c.y), 1)
  if (!fitX || !fitY) return null
  const initialVelocity = { vx: fitX.coeffs[1], vy: fitY.coeffs[1] }

  // Extend forward. Prediction: quadratic through the last few accepted points (a ball
  // receding from a rear camera loses ~40% of its image speed per frame at 30 fps), else the
  // alpha-beta smoothed constant velocity (longer gaps, too few points).
  const track: Flat[] = [...best.inliers]
  let last = track[track.length - 1]
  let vel = { xh: initialVelocity.vx, y: initialVelocity.vy }
  let misses = 0
  let bounced = false
  let segmentStart = 0
  const predict = (t: number): { xh: number; y: number } => {
    const recent = track.slice(Math.max(segmentStart, track.length - 4))
    if (recent.length >= 3 && t - last.t <= 3 * ctx.periodS) {
      const ts = recent.map((c) => c.t)
      const fx = fitPolynomial(ts, recent.map((c) => c.xh), 2, undefined, last.t)
      const fy = fitPolynomial(ts, recent.map((c) => c.y), 2, undefined, last.t)
      if (fx && fy) return { xh: evalPoly(fx, t), y: evalPoly(fy, t) }
    }
    return { xh: last.xh + vel.xh * (t - last.t), y: last.y + vel.y * (t - last.t) }
  }
  for (let f = last.frame + 1; f < ctx.frames.length; f++) {
    const t = ctx.frames[f].tReal
    if (t - tC > opts.outgoingMaxDurationS) break
    const dt = t - last.t
    const pred = predict(t)
    if (pred.y < -0.2 || pred.y > 1.2 || pred.xh < -0.2 * ctx.aspect || pred.xh > 1.2 * ctx.aspect) break
    const hit = nearestInFrame(ctx, f, pred.xh, pred.y, moving)
    // Until a quadratic can be fitted, the linear prediction ignores any deceleration: wider gate.
    const gateGrowth = track.length - segmentStart >= 3 ? 0.25 : 0.5
    const gate = tolFor(ctx, hit?.c ?? last) + gateGrowth * Math.hypot(vel.xh, vel.y) * dt
    let accepted = hit && hit.d2 < gate * gate ? hit.c : null
    let bounceNow = false
    if (!accepted && !bounced && vel.y > 0) {
      // Bounce hypothesis (once): a ball moving down the image meets the court and its
      // vertical image velocity reverses (restitution unknown, ~0.6 +- 0.3).
      const predBounce = { xh: pred.xh, y: last.y - BOUNCE_RESTITUTION_GUESS * vel.y * dt }
      const hitBounce = nearestInFrame(ctx, f, predBounce.xh, predBounce.y, moving)
      const gateBounce = tolFor(ctx, hitBounce?.c ?? last) + 0.25 * Math.abs(vel.xh) * dt + 0.5 * vel.y * dt
      if (hitBounce && hitBounce.d2 < gateBounce * gateBounce) {
        accepted = hitBounce.c
        bounceNow = true
      }
    }
    if (accepted) {
      const measured = { xh: (accepted.xh - last.xh) / dt, y: (accepted.y - last.y) / dt }
      // After a bounce the old vertical velocity is meaningless: restart from the measurement.
      vel = bounceNow ? measured : { xh: 0.6 * vel.xh + 0.4 * measured.xh, y: 0.6 * vel.y + 0.4 * measured.y }
      if (bounceNow) {
        bounced = true
        segmentStart = track.length
      }
      track.push(accepted)
      last = accepted
      misses = 0
    } else if (++misses > ctx.gapFrames) {
      break
    }
  }

  const observations = withGapPredictions(ctx, track, (t) => {
    // Linear interpolation between neighbouring detections.
    const after = track.findIndex((c) => c.t > t)
    const a = track[Math.max(0, after - 1)]
    const b = track[after]
    const w = (t - a.t) / (b.t - a.t)
    return { xh: a.xh + w * (b.xh - a.xh), y: a.y + w * (b.y - a.y) }
  })
  const quad = track.length >= 3 ? fitPolynomial(track.map((c) => c.t), track.map((c) => c.y), 2) : null
  const abs = quad ? toAbsoluteQuadratic(quad) : null
  return {
    track: {
      id: 2,
      kind: 'outgoing',
      observations,
      fit: quad && abs ? { ...abs, rmse: quad.rmse, tStart: track[0].t, tEnd: track[track.length - 1].t } : undefined,
    },
    contactTReal: tC,
    contactFromTracks: toss ? (contactFromTracks(ctx, toss, track, tC) ?? undefined) : undefined,
    contactPoint: { x: anchor.xh / ctx.aspect, y: anchor.y },
    initialVelocity,
  }
}

/** Merge options over defaults, ignoring keys explicitly set to undefined. */
function withDefaults(options: TrackerOptions): Options {
  const defined = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined))
  return { ...DEFAULTS, ...defined } as Options
}

export function trackBall(frames: FrameCandidates[], options: TrackerOptions): TrackerResult {
  const opts = withDefaults(options)
  const ctx = buildContext(frames, opts)
  markStationary(ctx, opts.maxTossDurationS / 4, opts.stationaryOccupancy)
  const toss = findToss(ctx, opts)
  const outgoing = findOutgoing(ctx, toss, opts)
  const tracks = [toss?.track, outgoing?.track].filter((t): t is BallTrack => !!t)
  return { toss, outgoing, tracks }
}
