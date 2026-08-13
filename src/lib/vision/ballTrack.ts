/**
 * Finding the tossed ball.
 *
 * The Toss area is 22% of the score and until now it never saw the ball — every
 * measurement in it was taken from the tossing *wrist*. That is a real gap:
 * where the hand goes and where the ball goes are only loosely related once it
 * leaves the fingers, and what a coach actually reads is the ball. How high it
 * peaks, and whether you hit it at the top or stand waiting for it to fall, are
 * two of the most common things wrong with a club serve, and neither is visible
 * from the arm.
 *
 * No second model for this. A tennis ball against sky or court is a small, fast,
 * strongly coloured blob, and — decisively — it is the only thing in the frame
 * following a parabola. That last constraint is what makes the detection
 * tractable: candidate blobs are cheap and noisy, but demanding that a run of
 * them fit a free-fall arc with the right sign of curvature eliminates nearly
 * every false positive a colour threshold throws up.
 *
 * DOM-free by construction — it takes raw pixels, so it is testable in Node.
 */

/** Raw RGBA pixels, as `CanvasRenderingContext2D.getImageData` hands them over. */
export interface Bitmap {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** One blob that might be the ball. Coordinates are 0–1 across the frame. */
export interface BallCandidate {
  x: number
  y: number
  /** Radius as a fraction of frame height. */
  r: number
  score: number
}

export interface BallSample {
  t: number
  x: number
  y: number
}

/**
 * A tracked flight. Plain data with no methods, so it survives being stored and
 * read back — see `flightHeightAt` for evaluating it.
 */
export interface BallFlight {
  /** y = c[0] + c[1]·t + c[2]·t², image y (down) against seconds. */
  coefficients: [number, number, number]
  /** Frame-normalised position of the top of the arc, and when it happened. */
  apex: { t: number; x: number; y: number }
  samples: BallSample[]
  /** 0–1. How much of the window was tracked, and how tightly it fitted. */
  confidence: number
}

/* --------------------------------------------------------------- detection */

/**
 * How yellow-green a pixel is, 0–255.
 *
 * `min(R,G) − B` rather than anything fancier: an optic-yellow ball has both R
 * and G high and B near zero, which nothing else on a tennis court manages at
 * once. Sky scores strongly negative, white lines and clothing score zero
 * because all three channels match, and a green court scores low because its red
 * channel is low. Clay is the one surface that scores positively, which is why
 * colour alone is not trusted below.
 */
const yellowness = (r: number, g: number, b: number) => Math.min(r, g) - b

/**
 * Ball candidates in one frame.
 *
 * `previous` is the frame before, used as a motion reference. A tossed ball
 * moves several of its own diameters between samples, so it lights up motion
 * differencing almost perfectly, while the court, the fence and the sky do not.
 * The player moves too — hence the colour term, which the player's kit rarely
 * satisfies and the court furniture never does.
 */
export function findCandidates(
  frame: Bitmap,
  previous: Bitmap | undefined,
  opts: {
    /** Ignore everything at or below this y (0–1). Keeps the player's kit out. */
    belowY?: number
    /** Expected ball radius as a fraction of frame height. */
    minRadius?: number
    maxRadius?: number
    threshold?: number
  } = {},
): BallCandidate[] {
  const { width: w, height: h } = frame
  const belowY = opts.belowY ?? 1
  const minR = opts.minRadius ?? 0.004
  const maxR = opts.maxRadius ?? 0.045
  const threshold = opts.threshold ?? 42

  const limitY = Math.min(h, Math.round(belowY * h))
  const mask = new Uint8Array(w * h)

  for (let y = 0; y < limitY; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const colour = yellowness(frame.data[i], frame.data[i + 1], frame.data[i + 2])
      let motion = 0
      if (previous) {
        motion =
          (Math.abs(frame.data[i] - previous.data[i]) +
            Math.abs(frame.data[i + 1] - previous.data[i + 1]) +
            Math.abs(frame.data[i + 2] - previous.data[i + 2])) /
          3
      }
      // Without a previous frame there is no motion term, so colour has to carry
      // the whole score; the weights below keep the threshold meaning the same.
      const score = previous ? 0.55 * colour + 0.45 * motion : colour
      if (score >= threshold) mask[y * w + x] = 1
    }
  }

  return blobs(mask, w, h, minR, maxR)
}

/** Connected components, filtered to things the size and shape of a ball. */
function blobs(
  mask: Uint8Array,
  w: number,
  h: number,
  minR: number,
  maxR: number,
): BallCandidate[] {
  const seen = new Uint8Array(w * h)
  const out: BallCandidate[] = []
  const minArea = Math.max(2, Math.PI * (minR * h) ** 2)
  const maxArea = Math.PI * (maxR * h) ** 2
  const stack: number[] = []

  const visit = (q: number) => {
    if (mask[q] && !seen[q]) {
      seen[q] = 1
      stack.push(q)
    }
  }

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue

    stack.length = 0
    stack.push(start)
    seen[start] = 1
    let count = 0
    let sumX = 0
    let sumY = 0
    let minX = w
    let maxX = -1
    let minY = h
    let maxY = -1

    while (stack.length) {
      const p = stack.pop() as number
      const px = p % w
      const py = (p / w) | 0
      count++
      sumX += px
      sumY += py
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py

      // Four-connected is enough and half the work of eight; a ball is a solid
      // disc, not a diagonal filament. Marked as seen on the way in rather than
      // on the way out, so a pixel reachable from two directions is only ever
      // pushed once.
      if (px > 0) visit(p - 1)
      if (px < w - 1) visit(p + 1)
      if (py > 0) visit(p - w)
      if (py < h - 1) visit(p + w)
    }

    if (count < minArea || count > maxArea) continue

    const bw = maxX - minX + 1
    const bh = maxY - minY + 1
    // A ball is round. Motion blur stretches it along its travel, so this is
    // generous — but a limb or a fence rail is far longer than it is wide.
    const elongation = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh))
    if (elongation > 2.6) continue
    // And solid: a disc fills most of its bounding box, an outline does not.
    const fill = count / (bw * bh)
    if (fill < 0.45) continue

    out.push({
      x: sumX / count / w,
      y: sumY / count / h,
      r: Math.sqrt(count / Math.PI) / h,
      score: count * fill,
    })
  }

  // Strongest first; the fit below only looks at the best few per frame.
  return out.sort((a, b) => b.score - a.score)
}

/* ----------------------------------------------------------------- fitting */

/**
 * Determinant of a 3×3 given as nine scalars, in the order Cramer's rule wants.
 *
 * Scalars rather than nested arrays because the RANSAC seed loop below runs this
 * up to four times per candidate triple and there are ~10⁵ triples in a densely
 * detected toss. Built as arrays, each of those allocated the matrix, then a
 * fresh copy of it per substituted column — well over a million throwaway arrays
 * for one ball, on the phone that has just spent thirty seconds tracking a body.
 * The expression is the same one, in the same order, so the arithmetic is
 * unchanged down to the last bit.
 */
const det3 = (
  a: number, b: number, c: number,
  d: number, e: number, f: number,
  g: number, h: number, i: number,
) => a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)

/**
 * Least-squares quadratic through (t, y). Returns [c0, c1, c2] or undefined.
 *
 * `curvature`, when given, is a band the fitted t² coefficient must land in —
 * `undefined` comes back when it does not. It is an early exit rather than a
 * courtesy: `c2` is the one coefficient the RANSAC gate below judges a seed on,
 * it needs only two of the four determinants, and the overwhelming majority of
 * triples fail it. Checking it here skips the other two for all of them.
 */
function fitQuadratic(
  pts: { t: number; y: number }[],
  curvature?: { lo: number; hi: number },
): [number, number, number] | undefined {
  if (pts.length < 3) return undefined
  // Centre time before forming the normal equations. In absolute clip time a
  // serve half a minute into a basket puts t⁴ terms near 10¹³ while the true
  // determinant of near-adjacent samples is ~10⁻⁹ — the sums cancel
  // catastrophically and Cramer's rule runs on floating-point noise. The fit
  // is done in centred time and re-expanded, so callers still get
  // coefficients in absolute time.
  const t0 = pts.reduce((s, p) => s + p.t, 0) / pts.length
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0
  let b0 = 0, b1 = 0, b2 = 0
  for (const { t, y } of pts) {
    const tc = t - t0
    const t2 = tc * tc
    s0 += 1
    s1 += tc
    s2 += t2
    s3 += t2 * tc
    s4 += t2 * t2
    b0 += y
    b1 += tc * y
    b2 += t2 * y
  }
  // Solve the 3×3 normal equations by Cramer's rule.
  const d = det3(s0, s1, s2, s1, s2, s3, s2, s3, s4)
  if (Math.abs(d) < 1e-12) return undefined

  // The quadratic coefficient first, and alone when a band was given. Centring
  // time does not change it — a shift in t leaves the t² term untouched — so
  // this is already the coefficient the caller will read off the expansion.
  const a2 = det3(s0, s1, b0, s1, s2, b1, s2, s3, b2) / d
  if (curvature && (a2 < curvature.lo || a2 > curvature.hi)) return undefined

  const a0 = det3(b0, s1, s2, b1, s2, s3, b2, s3, s4) / d
  const a1 = det3(s0, b0, s2, s1, b1, s3, s2, b2, s4) / d
  // y = a0 + a1·(t−t0) + a2·(t−t0)², expanded back to powers of t.
  return [a0 - a1 * t0 + a2 * t0 * t0, a1 - 2 * a2 * t0, a2]
}

export const flightHeightAt = (flight: BallFlight, t: number): number => {
  const [c0, c1, c2] = flight.coefficients
  return c0 + c1 * t + c2 * t * t
}

/**
 * Least-squares straight line through (t, v).
 *
 * Returns the slope as well as an evaluator, because the two callers want
 * opposite halves of the same fit: the toss wants the ball's x *at* a moment
 * and never asks how fast it was drifting, while the outbound track below is
 * nothing but the slope. Fitting twice to get both would be two answers to one
 * question, which is the failure this file spends most of its length avoiding.
 */
function lineFit(pts: { t: number; v: number }[]): { slope: number; at: (t: number) => number } {
  const meanT = pts.reduce((s, p) => s + p.t, 0) / pts.length
  const meanV = pts.reduce((s, p) => s + p.v, 0) / pts.length
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.t - meanT) * (p.v - meanV)
    den += (p.t - meanT) ** 2
  }
  const slope = den > 1e-9 ? num / den : 0
  return { slope, at: (t: number) => meanV + slope * (t - meanT) }
}

/** Straight line through (t, x), evaluated at `t`. Shared by the apex-x fit
 *  below and by `flightXAt` — a ball in flight has no horizontal acceleration
 *  worth modelling, so a line is enough for both. */
function linearAt(pts: { t: number; x: number }[], t: number): number {
  return lineFit(pts.map((p) => ({ t: p.t, v: p.x }))).at(t)
}

/**
 * Ball's fitted horizontal position at a moment, from the same straight-line
 * fit through `flight.samples` that placed the apex's x. Companion to
 * `flightHeightAt` — together the two give a point anywhere along the tracked
 * flight, not just at the three moments (`apex`, and whatever a sample happened
 * to land on) `BallFlight` stores directly.
 */
export const flightXAt = (flight: BallFlight, t: number): number => linearAt(flight.samples, t)

/**
 * The toss boiled down to what a picture needs: three points on the fitted
 * arc — where the ball left the hand, where it topped out, and where it had
 * fallen to by the moment of contact — plus the two ratios a coach actually
 * talks about. Every height here is normalised against the player's own
 * standing height, the same convention every other measurement in the report
 * uses, so a caller never has to redo that division itself.
 *
 * A thin read of `flight`, nothing here is fitted independently — `peakHeight`
 * and `fallToContact` are the same numbers the `tossPeakHeight` and
 * `contactBelowPeak` metrics report, just packaged as plain geometry alongside
 * the points a UI needs to draw them, rather than buried in a metrics list.
 * `releaseT` and `contactT` are normally the toss and contact keyframe times —
 * reading the fit at those moments, rather than at whichever raw detection
 * happened to survive, is what keeps this lined up with every other
 * keyframe-anchored number the app reports.
 */
export interface TossFlight {
  release: { t: number; x: number; y: number }
  apex: { t: number; x: number; y: number }
  drop: { t: number; x: number; y: number }
  /** Peak height above the court, in body heights. */
  peakHeight: number
  /** How far the ball had fallen from its peak by contact, in body heights. */
  fallToContact: number
  /** Sideways drift from release to contact, in body heights. Unsigned. */
  horizontalDrift: number
}

export function summariseToss(
  flight: BallFlight,
  releaseT: number,
  contactT: number,
  scale: { bodyHeight: number; groundY: number; aspect?: number },
): TossFlight {
  const { bodyHeight, groundY } = scale
  const release = { t: releaseT, x: flightXAt(flight, releaseT), y: flightHeightAt(flight, releaseT) }
  const drop = { t: contactT, x: flightXAt(flight, contactT), y: flightHeightAt(flight, contactT) }
  return {
    release,
    apex: { ...flight.apex },
    drop,
    peakHeight: (groundY - flight.apex.y) / bodyHeight,
    fallToContact: Math.max(0, (drop.y - flight.apex.y) / bodyHeight),
    // Ball x is width-normalised while bodyHeight is a fraction of frame
    // height — different units on anything but a square video. The aspect
    // ratio converts the sideways distance onto the height scale before the
    // division; without it the drift read ~1.78× low on landscape and ~1.78×
    // high on portrait.
    horizontalDrift: (Math.abs(drop.x - release.x) * (scale.aspect ?? 1)) / bodyHeight,
  }
}

/**
 * Rotate a tracked flight into the levelled frame the landmarks live in.
 *
 * When a clip needs roll correction the landmarks are rotated back onto
 * gravity, but the ball was found in the raw pixels — so its heights would be
 * compared against a `groundY` from a different frame. A rigid rotation maps
 * the quadratic-in-time flight to another quadratic, so the samples are
 * rotated with the same transform `levelFrames` used and refitted exactly as
 * `trackBall` fitted them.
 *
 * `pivot` must be the centre `levelFrames` rotated about, in landmark units
 * (x in height units). Ball x is width-normalised, so it converts through
 * `aspect` on the way in and back out. Passing a negated `roll_deg` inverts
 * the transform, which is how drawing takes a levelled flight back to pixels.
 */
export function levelFlight(
  flight: BallFlight,
  roll_deg: number,
  pivot: { cx: number; cy: number },
  aspect: number,
): BallFlight {
  const theta = (-roll_deg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const rotate = (p: BallSample): BallSample => {
    const dx = p.x * aspect - pivot.cx
    const dy = p.y - pivot.cy
    return {
      t: p.t,
      x: (pivot.cx + dx * cos - dy * sin) / aspect,
      y: pivot.cy + dx * sin + dy * cos,
    }
  }

  const samples = flight.samples.map(rotate)
  const coeffs = fitQuadratic(samples.map((p) => ({ t: p.t, y: p.y })))
  // A refit that fails or loses its downward curvature means the rotation has
  // nothing trustworthy to offer; the original flight is the lesser wrong.
  if (!coeffs || coeffs[2] <= 0) return flight

  const [c0, c1, c2] = coeffs
  const apexT = -c1 / (2 * c2)
  return {
    coefficients: coeffs,
    apex: { t: apexT, x: linearAt(samples, apexT), y: c0 + c1 * apexT + c2 * apexT * apexT },
    samples,
    confidence: flight.confidence,
  }
}

export interface TrackOptions {
  /**
   * Frame-normalised vertical acceleration of gravity, per second squared.
   * Derived by the caller from the player's measured height in the image, which
   * is the only real-world scale the pipeline has.
   */
  expectedGravity: number
  /** How far the fitted curvature may sit from that before the fit is rejected. */
  gravityTolerance?: number
  /** Residual, as a fraction of frame height, still counted as on the curve. */
  inlierBand?: number
  minInliers?: number
}

/**
 * How many standard errors of its own a fitted curvature may sit from the
 * gravity the image scale implies before the fit is thrown away.
 *
 * The fixed ±`gravityTolerance` band alone is not a usable test, because the
 * precision of a fitted curvature is not a property of the fit's units — it
 * collapses as the tracked span shortens, roughly with span⁻². At the five-sample
 * minimum this function advertises, a ball tossed by a player far enough away to
 * measure 0.32 of the frame moves about 4 mm of image in the whole window, which
 * is under the centroid noise; its curvature is then not measured at all, and the
 * fixed band is narrower than the fit's own noise floor. Gating on the band alone
 * there rejects fits whose apex height is right to within a centimetre, and the
 * player is told nothing about their toss and never told why.
 *
 * So the curvature has to disagree on both counts — outside the fixed band *and*
 * by more than this many standard errors — before the fit is discarded. Three
 * sigma is the usual line for "this did not happen by chance", and it keeps the
 * gate doing the job it was written for: a long, densely sampled track whose
 * curvature is genuinely wrong has a tiny standard error, so its disagreement is
 * significant and it is still rejected.
 */
const GRAVITY_SIGMAS = 3

/**
 * Widest that sigma-scaled allowance may grow, as a multiple of the gravity the
 * image scale implies.
 *
 * The standard error is unbounded from above, and on the shortest tracks this
 * function accepts it is enormous: at five or six inliers over a sixth of a
 * second the three-sigma term runs past `expectedGravity` itself, at which point
 * `gravityAllowed` admits *any* positive curvature and the test is not a test.
 * Measured on the bent refit the suite already keeps: at six inliers the same
 * lean that is rejected at seven or more came back at 2.6–3.4× the expected
 * curvature, with the apex a few thousandths of a frame low and confidence
 * hovering either side of the caller's 0.45 floor.
 *
 * A curvature this far out is not a precision problem. `expectedGravity` comes
 * from the player's measured height, and half again on top of the fixed ±55%
 * band means a ball falling two and a half times as fast as a ball at that
 * distance can — which is a different object, or a fit dragged off by centroids
 * that are not on one arc, whatever the error bars say. Wide enough to leave the
 * short-track acceptance the sigma term was added for very nearly alone (measured
 * on five samples at the far-player scale: 88% → 87% accepted at one pixel of
 * centroid noise, 61% → 54% at two), narrow enough that the gate still means
 * something at that length.
 */
const GRAVITY_ALLOWANCE_MAX = 1.5

/**
 * How many standard errors past the last tracked sample the fitted vertex may
 * sit and still be believed.
 *
 * Some allowance is needed: a genuine toss rarely has a detection exactly on its
 * apex — the ball is at its slowest and dimmest up there, and the true turning
 * point usually falls between two frames or a hair past the last one that
 * survived. Counting that allowance in sampling intervals, as this once did, uses
 * the wrong ruler. The uncertainty in a vertex time comes from centroid noise,
 * the tracked span and the curvature, none of which is the frame interval — at
 * 30 fps with 2 px of noise and a third of a frame of motion-blur lag, a vertex
 * genuinely one interval past the last sample was rejected three times in four.
 * Scaling the allowance by the vertex's own standard error puts the allowance and
 * the error in the same units, which is the only way the number can be tuned.
 *
 * It is not, however, the only thing the allowance has to cover — see
 * `APEX_SLACK_MIN_FRAMES`.
 */
const APEX_SLACK_SIGMAS = 3

/**
 * Floor on that allowance, in frame intervals of the clip the caller sampled.
 *
 * A standard error is a statement about the fit, not about the film. It shrinks
 * as the track lengthens and the residuals tighten, so taken on its own it hands
 * the cleanest, longest, most convincing flights the *narrowest* licence to sit
 * beyond the last sample — exactly backwards, and it fires on extrapolations that
 * are physically nothing. Measured at 32 fps with a pixel of centroid noise and a
 * vertex a quarter of an interval past the last detection, which moves the ball
 * four hundredths of a pixel: 15 detections accepted 100% of runs, 25 accepted
 * 96%, 40 accepted 11%. The fits being thrown out at 40 were the best fits in the
 * set.
 *
 * So the sampling interval is a floor under the whole thing. A vertex cannot be
 * placed to finer than the gap between the frames it was measured from, however
 * clean the fit, so an overshoot smaller than one interval is a vertex between
 * two frames rather than beyond the film — the plain reading of the sampling
 * theorem, and the pre-uncertainty behaviour this file had before it went looking
 * for a better ruler. The two scales are combined by taking whichever is larger:
 * the gate then follows the uncertainty that actually dominates, and more
 * evidence can only widen it.
 */
const APEX_SLACK_MIN_FRAMES = 1

/**
 * Hard ceiling on that allowance, in frame intervals of fully tracked flight.
 *
 * A standard error says how imprecise the vertex is, not how far it is honest to
 * extrapolate: a noisy fit can earn an arbitrarily large allowance and walk the
 * apex off the top of the frame. Two intervals is the point where the vertex
 * stops being a near-miss between frames and starts being a claim about time the
 * camera never covered.
 *
 * Scaled by how much of the window was actually tracked, so the licence follows
 * the evidence. Alternating motion blur — the ball found on every other frame —
 * leaves gaps that are uniformly one frame wide, so the *detections'* own median
 * gap is the sparse interval and a half-evidence track used to buy double the
 * extrapolation. Measured on a vertex 1.6 intervals past the last sample: a fully
 * tracked flight was accepted 6% of the time and the same flight with alternate
 * detections dropped 80%, exactly backwards. The frame interval below comes from
 * the frames the caller offered rather than the frames the ball was found in, so
 * losing detections can only shrink the licence.
 */
const APEX_SLACK_MAX_FRAMES = 2

/**
 * Floor on the residual scale, as a fraction of `inlierBand`.
 *
 * Both gates above divide by the spread of the inliers about the fitted curve,
 * and a fit can have a residual spread of zero — three points define a parabola
 * exactly, and a synthetic or lightly resampled track can land on one to floating
 * point. Taken literally that says the curve is known perfectly and turns both
 * gates into knife edges at exactly the boundary they were widened to soften. No
 * blob centroid is better than about a pixel, whatever the residuals say, and
 * `inlierBand` is the caller's own statement of how far off the curve a detection
 * may sit, so a modest fraction of it is the honest floor.
 */
const NOISE_FLOOR_FRACTION = 0.15

/**
 * How far the inliers' horizontal positions may scatter from their own
 * straight-line fit, in frame widths, before the flight they agree on is
 * rejected as more than one object.
 *
 * R11 in `NEXT.md`: the curvature gate only ever looks at *height*, because
 * that is where gravity shows up. It has nothing to say about *width* — two
 * background objects drifting on unrelated paths can each contribute a couple
 * of frames whose height happens to sit near one shared parabola, and RANSAC
 * has no way to know those points came from different things, because nothing
 * before this checked whether they were also consistent with each other
 * sideways. A real ball has no horizontal acceleration worth modelling (see
 * `linearAt`), so its inliers sit close to one line; a fit stitched together
 * across two objects moving in different horizontal directions does not, and
 * this is what catches that a curvature match alone cannot.
 *
 * Found by measurement, not by argument: tightened against the multi-decoy
 * false-positive ensemble below until it started rejecting `the real ball is
 * picked out from among distractors` above — a genuine toss whose drift
 * amplitude is real, just mostly linear, so the *residual* left after a
 * straight line is much smaller than the drift itself. 0.02 rejects that
 * genuine toss; 0.03 is the tightest value that does not, and it still cuts
 * the multi-decoy false-positive rate from 24% to 6–7% — a real improvement
 * and not a claim that the search is now immune to it. A cross-object fit
 * that happens to share both a curvature and a near-linear width, by
 * coincidence, is not something this gate — or any gate that only reads
 * position — can rule out.
 */
const X_CONSISTENCY_BAND = 0.03

/**
 * How much confidence a fit loses for sitting at the far edge of either gate.
 *
 * A quarter, not a half: the point of widening the gates was that a fit which is
 * imprecise is not thereby wrong, and a penalty steep enough to push every
 * marginal fit under the caller's 0.45 floor would restore the silence the
 * widening was meant to end. A quarter is enough to sink a fit that is also short
 * or sparse or scattered — which is the combination worth doubting — while a fit
 * strong on every other count survives leaning on one allowance.
 */
const MARGINAL_PENALTY = 0.25

/**
 * Typical spacing between consecutive frames the caller sampled, in seconds.
 *
 * The median gap rather than span/(n−1): frame extraction can drop or duplicate a
 * shot, and one long gap averaged in reports a sampling rate two or three times
 * coarser than the clip really was. Used as a tolerance, that would be generous
 * in exactly the case — a clip with holes in it — where generosity is least
 * deserved. The median ignores the hole and returns the interval the clip was
 * actually sampled at.
 */
function medianInterval(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1])
  if (!gaps.length) return 0
  gaps.sort((a, b) => a - b)
  const mid = gaps.length >> 1
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
}

/** How precisely the fitted curve pins down the two numbers the gates test. */
interface FitSpread {
  /** Standard error of the fitted vertical acceleration, 2·c₂. */
  gravity: number
  /** Standard error of the vertex time, in seconds. */
  apexT: number
}

/**
 * Turn the inliers' scatter about the fitted parabola into error bars on the two
 * derived quantities the gates below judge.
 *
 * This is the ordinary least-squares covariance, σ²·(XᵀX)⁻¹, and it is what makes
 * the gates tunable: the same absolute disagreement means something quite
 * different on a five-sample, eighth-of-a-second track than on a thirty-sample
 * one, and only the covariance knows which. The vertex time is not a fitted
 * coefficient but a ratio of two, so it goes through the delta method — and its
 * error grows with how far the vertex sits from the centre of the samples, which
 * is precisely the behaviour the apex gate wants.
 *
 * Time is centred on the samples' mean before the normal equations are formed,
 * for the same reason `fitQuadratic` centres it: in absolute clip time the t⁴
 * sums of a serve half a minute in overwhelm the determinant and the inverse is
 * computed from floating-point noise. The quadratic coefficient is unchanged by a
 * shift in time, and the vertex is put back afterwards.
 */
function fitSpread(
  pts: { t: number; y: number }[],
  coeffs: [number, number, number],
  noiseFloor: number,
): FitSpread {
  const [c0, c1, c2] = coeffs
  const n = pts.length
  const t0 = pts.reduce((s, p) => s + p.t, 0) / n
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0
  let sumSq = 0
  for (const { t, y } of pts) {
    const u = t - t0
    const u2 = u * u
    s0 += 1
    s1 += u
    s2 += u2
    s3 += u2 * u
    s4 += u2 * u2
    const r = y - (c0 + c1 * t + c2 * t * t)
    sumSq += r * r
  }

  // n − 3, not n: three parameters have already been spent making these
  // residuals small, so dividing by n understates the noise — badly at the five
  // samples this function will accept, where it would be out by a factor of √2.5
  // and both gates would inherit the error.
  const sigma = Math.max(noiseFloor, Math.sqrt(sumSq / Math.max(1, n - 3)))

  const det =
    s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2)
  // A degenerate design — every sample at the same instant — would already have
  // failed `fitQuadratic`, but if one reaches here nothing is measured and
  // infinite error bars are the truthful answer: the gates fall back on their
  // absolute limits rather than on a divide-by-zero.
  if (!(Math.abs(det) > 1e-18)) return { gravity: Infinity, apexT: Infinity }

  // Adjugate entries for the linear and quadratic coefficients of the centred
  // fit, and their covariance.
  const varLinear = (sigma * sigma * (s0 * s4 - s2 * s2)) / det
  const varQuad = (sigma * sigma * (s0 * s2 - s1 * s1)) / det
  const covar = (sigma * sigma * (s1 * s2 - s0 * s3)) / det

  // Vertex offset from the centre of the samples, δ = −a₁/(2a₂). The delta
  // method on that ratio gives the bracket below; the cross term matters because
  // unevenly spaced samples correlate the two coefficients.
  const delta = -c1 / (2 * c2) - t0
  const varApex =
    (varLinear + 4 * delta * delta * varQuad + 4 * delta * covar) / (4 * c2 * c2)

  return {
    gravity: 2 * Math.sqrt(Math.max(0, varQuad)),
    apexT: Math.sqrt(Math.max(0, varApex)),
  }
}

/**
 * Pick the one run of candidates that behaves like a thrown ball.
 *
 * RANSAC rather than a plain fit: most detections in most frames are not the
 * ball, and a least-squares curve through a cloud of mostly-wrong points is
 * wrong everywhere. Sampling small subsets and keeping whichever curve the most
 * detections agree with is what tolerates a majority of the input being junk.
 *
 * The curvature is not a free parameter. A ball in flight accelerates downwards
 * at g, and the image scale is known from the player's own height — so any
 * candidate curve whose curvature is not close to g is something else that
 * happened to be moving, and is thrown away rather than reported as a toss.
 */
export function trackBall(
  perFrame: { t: number; candidates: BallCandidate[] }[],
  opts: TrackOptions,
): BallFlight | undefined {
  const tolerance = opts.gravityTolerance ?? 0.55
  const band = opts.inlierBand ?? 0.022
  const minInliers = opts.minInliers ?? 5

  // At most three candidates a frame: past that they are weak detections that
  // only slow the search down.
  const pool: BallSample[] = []
  for (const f of perFrame) {
    for (const c of f.candidates.slice(0, 3)) pool.push({ t: f.t, x: c.x, y: c.y })
  }
  if (pool.length < minInliers) return undefined

  const gLo = opts.expectedGravity * (1 - tolerance)
  const gHi = opts.expectedGravity * (1 + tolerance)

  let best: { coeffs: [number, number, number]; inliers: BallSample[] } | undefined

  // Image y grows downwards, so a falling ball curves positively. The band is
  // halved because the physical quantity is 2·c₂, and the fit gates on c₂ —
  // both are exact, so this is the same test one step earlier.
  const curvature = { lo: gLo / 2, hi: gHi / 2 }
  // One array, rewritten per triple. There are on the order of 10⁵ of them and
  // the fit only reads `.t` and `.y` off each element, so building a fresh
  // three-element array of fresh objects for every one was pure garbage.
  const seed: BallSample[] = [pool[0], pool[0], pool[0]]

  for (let i = 0; i < pool.length; i++) {
    seed[0] = pool[i]
    for (let j = i + 1; j < pool.length; j++) {
      if (pool[j].t === pool[i].t) continue
      seed[1] = pool[j]
      for (let k = j + 1; k < pool.length; k++) {
        if (pool[k].t === pool[j].t || pool[k].t === pool[i].t) continue
        seed[2] = pool[k]

        const coeffs = fitQuadratic(seed, curvature)
        if (!coeffs) continue

        const [k0, k1, k2] = coeffs
        const inliers: BallSample[] = []
        let lastT = -Infinity
        const target = best ? best.inliers.length : 0
        for (let n = 0; n < pool.length; n++) {
          // Nothing left to find. Every remaining point could agree and this
          // hypothesis would still only tie, and a tie loses to the incumbent on
          // the strict comparison below — so the rest of the scan cannot change
          // the answer. This is the whole cost of the search: the triple loop is
          // cubic in the pool and each triple used to walk all of it, which on a
          // densely detected toss is tens of millions of comparisons in the
          // middle of the report. Counting what is left is exact rather than
          // heuristic, so the fit that comes out is the same fit as before.
          if (inliers.length + (pool.length - n) <= target) break
          const p = pool[n]
          const predicted = k0 + k1 * p.t + k2 * p.t * p.t
          if (Math.abs(p.y - predicted) > band) continue
          // One point per frame — the strongest detection that fits, since the
          // candidates arrive ranked by blob score. Two from the same frame both
          // landing near the curve would otherwise inflate the count without
          // adding any evidence.
          if (p.t === lastT) continue
          lastT = p.t
          inliers.push(p)
        }

        if (!best || inliers.length > best.inliers.length) best = { coeffs, inliers }
      }
    }
  }

  if (!best || best.inliers.length < minInliers) return undefined

  // Refit on everything that agreed, which is more accurate than the three
  // points that happened to seed the winning hypothesis.
  const inlierPts = best.inliers.map((p) => ({ t: p.t, y: p.y }))
  const refined = fitQuadratic(inlierPts) ?? best.coeffs
  const [c0, c1, c2] = refined
  if (c2 <= 0) return undefined

  // The curvature agreed on says nothing about whether the same object was
  // seen the whole time — see `X_CONSISTENCY_BAND`. Checked on the inliers
  // that survived the height fit, not the seed, for the same reason the
  // refit above is: three points that happened to seed the hypothesis are
  // not the evidence for it.
  const xFit = lineFit(best.inliers.map((p) => ({ t: p.t, v: p.x })))
  const xResidual =
    best.inliers.reduce((s, p) => s + Math.abs(p.x - xFit.at(p.t)), 0) / best.inliers.length
  if (xResidual > X_CONSISTENCY_BAND) return undefined

  const spread = fitSpread(inlierPts, [c0, c1, c2], NOISE_FLOOR_FRACTION * band)

  // The seed passed the gravity test, but the refit is a different curve and it
  // is the refit that gets reported. An inlier only has to sit within `band` of
  // the seed to be counted, so a run of detections hugging the top of that band
  // at the ends and the bottom in the middle — motion-blurred centroids, or a
  // decoy that happened to agree — bends the least-squares curve well past the
  // curvature a ball at this image scale can have, while every individual point
  // still looks like it belongs. Checking only `c2 <= 0` catches a curve bending
  // the wrong way and nothing else.
  //
  // But the refit is tested against its own error bars as well as the fixed band,
  // and has to fail both. Applying the seed's flat ±55% to it rejects short
  // tracks whose curvature was never measurable in the first place — see
  // `GRAVITY_SIGMAS`. A curvature that is merely imprecise is not evidence of a
  // wrong curve; a curvature that is precise and wrong is, and that is the case
  // this still catches.
  //
  // And that widening is bounded. A standard error has no upper limit, so on a
  // five- or six-sample track it can exceed `expectedGravity` itself and the test
  // stops rejecting anything at all — see `GRAVITY_ALLOWANCE_MAX`.
  const refinedG = 2 * c2
  const gravityMiss = Math.abs(refinedG - opts.expectedGravity)
  // The caller's own band is still the floor, so a caller that asks for a wider
  // one than the cap gets what it asked for rather than a silently tighter gate.
  const gravityAllowed = Math.max(
    tolerance * opts.expectedGravity,
    Math.min(GRAVITY_ALLOWANCE_MAX * opts.expectedGravity, GRAVITY_SIGMAS * spread.gravity),
  )
  if (gravityMiss > gravityAllowed) return undefined

  const times = best.inliers.map((p) => p.t)
  const firstT = Math.min(...times)
  const lastT = Math.max(...times)

  const apexT = -c1 / (2 * c2)
  // A vertex outside the tracked window is an extrapolation, not a measurement.
  // The case that produces it is ordinary: the ball leaves the top of the frame,
  // or is lost against a bright patch of sky before it turns over, and what is
  // left is an ascending-only arc. That still fits a perfectly plausible
  // curvature — nothing above rejects it — but the vertex lands beyond the last
  // sample, sometimes above the top of the frame entirely, and `apex.y` is then
  // a height the ball was never seen at.
  //
  // Rejected rather than reported at lower confidence, and deliberately so. The
  // apex is not one number among several that degrade together: `tossPeakHeight`
  // and `contactBelowPeak` are both computed from it and nothing else, so an
  // extrapolated vertex is not a soft reading of the toss, it is a fabricated
  // one. It also fails in a consistently flattering-to-nobody direction — an
  // apex placed off the top of the frame tells a player to toss lower when they
  // tossed too low, and that they waited on the ball when they never got the
  // chance. Worse, a de-confidenced flight would still often clear the caller's
  // 0.45 floor: this failure comes with a long, densely sampled, tight-residual
  // track, which is precisely what the confidence blend rewards, so any penalty
  // large enough to be safe would be arbitrary. The file already takes the
  // honest line elsewhere — the ball is best-effort, and not finding it costs
  // two measurements rather than the report — so it takes it here too.
  //
  // That argument is about a vertex nowhere near the samples, and it does not
  // license rejecting a near miss. The allowance below is how far the vertex
  // could honestly have slipped past the last frame, and two separate things
  // decide that: how precisely the fit places it — its own standard error — and
  // how finely the film could place anything at all, which is the interval the
  // clip was sampled at. Neither alone is the answer, and taking the smaller of
  // the two was worse than either, because the sharper the track the harder it
  // then rejected. See `APEX_SLACK_SIGMAS` and `APEX_SLACK_MIN_FRAMES`; the
  // ceiling on top of both, earned by the fraction of frames the ball was
  // actually found in, is `APEX_SLACK_MAX_FRAMES`. Inside the allowance the
  // vertex is a near miss rather than a fabrication, and it is the confidence
  // that carries the doubt.
  const framesInWindow = perFrame.filter((f) => f.t >= firstT && f.t <= lastT).length
  const tracked = framesInWindow > 0 ? best.inliers.length / framesInWindow : 1
  const frameInterval = medianInterval(perFrame.map((f) => f.t))
  // Larger of the two uncertainties, not smaller: the vertex is unresolvable to
  // finer than one sampling interval *and* to finer than its own standard error,
  // so the gate has to cover whichever of the two is doing the work. The ceiling
  // is held above the floor as well, so a thinly detected flight is capped at the
  // sampling resolution rather than under it — it still never buys more
  // extrapolation than a fully tracked one, which is the point of scaling it.
  const resolution = APEX_SLACK_MIN_FRAMES * frameInterval
  const ceiling = Math.max(resolution, APEX_SLACK_MAX_FRAMES * frameInterval * tracked)
  const slack = Math.min(ceiling, Math.max(APEX_SLACK_SIGMAS * spread.apexT, resolution))
  const apexOutside = Math.max(0, firstT - apexT, apexT - lastT)
  if (apexOutside > slack) return undefined

  const apexY = c0 + c1 * apexT + c2 * apexT * apexT

  // Horizontal position at the apex, from a straight-line fit — a ball in flight
  // has no horizontal acceleration worth modelling.
  const apexX = linearAt(best.inliers, apexT)

  const span = lastT - firstT
  const residual =
    best.inliers.reduce(
      (s, p) => s + Math.abs(p.y - (c0 + c1 * p.t + c2 * p.t * p.t)),
      0,
    ) / best.inliers.length

  // Both gates above now admit fits they would once have thrown away, and the
  // ones they admit at the very edge are the ones a caller should think hardest
  // about. Rather than pick a second, stricter threshold — which is just the old
  // over-rejection moved one line down — the softness is handed on: a fit that
  // needed its error bars to clear the gravity band, or whose vertex sits outside
  // the samples at all, is reported at reduced confidence. `analyze.ts` already
  // drops the ball below 0.45, so a marginal fit that is marginal in nothing else
  // still reaches the report, and one that is marginal in several ways does not.
  const gravityTrust =
    gravityMiss <= tolerance * opts.expectedGravity
      ? 1
      : 1 - MARGINAL_PENALTY * Math.min(1, gravityMiss / (GRAVITY_SIGMAS * spread.gravity))
  // Measured in the same allowance the gate used, floor and all. Against the bare
  // standard error it inherited the gate's inversion: a long, clean track whose
  // vertex lands a hundredth of a pixel past the last sample has an error bar
  // smaller still, so it was docked toward the full penalty for an extrapolation
  // that is not there, and the accurate fits it hit were the ones nearest the
  // caller's 0.45 floor.
  const apexTrust = slack > 0 ? 1 - MARGINAL_PENALTY * Math.min(1, apexOutside / slack) : 1

  const confidence = Math.max(
    0,
    Math.min(
      1,
      (0.45 * Math.min(1, best.inliers.length / 10) +
        0.3 * Math.min(1, span / 0.6) +
        0.25 * Math.max(0, 1 - residual / band)) *
        gravityTrust *
        apexTrust,
    ),
  )

  return {
    coefficients: [c0, c1, c2],
    apex: { t: apexT, x: apexX, y: apexY },
    samples: best.inliers,
    confidence,
  }
}

/* ------------------------------------------------- the ball after contact */

/**
 * The ball leaves the strings and is gone.
 *
 * Everything above is about the toss, where the ball is slow, high and lit
 * against sky for the better part of a second. After contact it is the opposite
 * on every count, and the number that decides whether any of this is measurable
 * is not about detection at all — it is how long the ball is still in the shot.
 * Measured in `ball.test.ts` against the framing this app tells people to use
 * (side-on, four metres back, the player filling the frame height): a 120 km/h
 * serve crosses the frame and is gone in 33 ms. 80 km/h buys 50 ms, 160 km/h
 * leaves 25 ms.
 *
 * That is the whole problem, and no detector fixes it. At 30 samples a second
 * those 33 ms are one frame; at 60, two; at 120, four — and with the shutter
 * open for a realistic slice of the interval none of those three resolves the
 * ball at all, because at this speed a full-interval exposure smears it well
 * past the elongation cutoff in `blobs`. Filming *closer* makes it worse, not
 * better: at three metres the ball is out of frame before the next frame is
 * taken. A straight line through one or two points is not a measurement of
 * anything, so this function refuses far more often than it answers, and the
 * counts it refuses on are handed back so a caller can say which of the two
 * things went wrong — the film, or the detection.
 *
 * Where it does answer, a straight line is the right model. Over 30 ms gravity
 * moves the ball about 4 mm — a tenth of a ball — against several metres of
 * travel, so the curvature that identifies the toss is not available here and is
 * not needed. What replaces it as the discriminator is speed: the struck ball is
 * by a wide margin the fastest thing in the frame, and it starts from a point
 * the toss fit already knows.
 */
export interface OutboundTrack {
  /**
   * Fitted image velocity — frame widths per second across, frame heights per
   * second down. Two different units, deliberately, because that is what the
   * rest of the file uses: candidate x is width-normalised and y is
   * height-normalised, and quietly unifying them here would be a third
   * convention for a caller to get wrong. `aspect` converts.
   *
   * Image velocity, not the ball's velocity. What separates the two is the
   * camera angle, and this file does not know it — see `axes.ts`, which owns
   * that conversion for the whole app.
   */
  velocity: { x: number; y: number }
  /** The detections the line was fitted through. One per instant, at most. */
  samples: BallSample[]
  /**
   * 0–1. How well a straight line described those detections, how many there
   * were, and whether the line runs back to where the toss says the ball was at
   * contact. Nothing about the camera angle, which the caller applies.
   */
  fitConfidence: number
}

export interface OutboundOptions {
  /**
   * Where the tossed ball was at the moment of contact, from the toss fit.
   *
   * Not an optional convenience. It is what makes a one-point hypothesis enough
   * below, and more importantly it is the only thing that says the streak being
   * tracked is the same ball: after contact the racket, the hand and the
   * follow-through are all moving fast in the same part of the frame, and a
   * line through fast-moving blobs fits whichever of them it is given.
   */
  anchor: { t: number; x: number; y: number }
  /** Frame width over frame height, to put image x into image-y units. */
  aspect: number
  /** The player's standing height as a fraction of frame height. */
  bodyHeight: number
  band?: number
  minSamples?: number
}

/**
 * Fewest detections a reported outbound line may rest on.
 *
 * Five, matching the toss's `minInliers`, and the reasoning is the same shape
 * but the arithmetic is far tighter. Measured in `ball.test.ts` on a rendered
 * 120 km/h serve at the recommended framing, with the shutter open for the whole
 * frame interval: 240 samples a second of real time resolved 8 detections, and
 * 120, 60 and 30 resolved none — they hold 4, 2 and 1 frames of ball
 * respectively, and every one of those is smeared past the elongation cutoff. A
 * quarter-interval shutter recovers 4 at 120 Hz and 2 at 60.
 *
 * So five is not a comfortable floor with room underneath it. It is very nearly
 * the ceiling of what any footage can supply, and it sits here rather than lower
 * because two or three points on a 25 ms baseline give a slope whose error bars
 * are wider than the quantity. The consequence is that this refuses on nearly
 * every real clip, which is the honest reading of the measurement above rather
 * than a threshold anyone would like.
 */
const OUTBOUND_MIN_SAMPLES = 5

/**
 * Detections at which the sample-count term of the confidence saturates.
 *
 * Eight is what a genuinely high-rate clip delivers across the whole visible
 * window at club speeds: measured at 240 Hz, a 120 km/h serve resolves exactly
 * 8 frames and a 160 km/h one resolves 6. Setting the saturation point at what
 * the best realistic footage gives, rather than at some round number above it,
 * keeps the term meaning "how much of what was there did we get" instead of
 * permanently docking every clip for not being a laboratory.
 */
const OUTBOUND_TARGET_SAMPLES = 8

/**
 * How far off the fitted line a detection may sit, in frame heights.
 *
 * Slightly tighter than the toss's 0.022 because the evidence is thinner: over
 * a 30 ms window there is no curvature to disagree with, so the band is doing
 * more of the work of telling the ball from everything else moving at contact.
 * Held above the centroid error a smeared ball actually shows — measured at
 * 5.8 px of a 426 px frame, 0.014 frame heights, at 240 Hz with the shutter open
 * for the whole interval — because that error is a backward lag along the streak
 * rather than scatter: it displaces the whole track together, the residuals
 * about the line stay far smaller than the lag itself, and the recovered speed
 * came out 0.3% from the truth with the lag at its worst.
 */
const OUTBOUND_BAND = 0.018

/**
 * How far the fitted line, run back to the moment of contact, may sit from
 * where the toss fit says the ball was. In frame heights.
 *
 * 0.06 is about a tenth of a body height, or 26 px of the 426 px test frame —
 * several ball diameters. Loose, on purpose: contact is the far end of the toss
 * window, so the toss fit is extrapolating to reach it and carries its own error
 * there, and the outbound centroids are lagging backward along their streaks.
 * Tight enough to be the check it is meant to be: a bird, a distant ball on the
 * next court, or the player's own racket head crossing the sky does not happen
 * to pass through the point the toss ended at.
 *
 * NOT THE OPERATIVE LIMIT, and the comment above said otherwise for a while.
 * Swept in `ball.test.ts` ('where the anchor check actually starts refusing'),
 * the fit survives an anchor put 15 px wrong and refuses from 18 px — 0.042
 * frame heights, comfortably inside this. `OUTBOUND_BAND` and the five-sample
 * minimum bind first, because a misplaced anchor makes every seed velocity
 * wrong and the inlier count collapses before the miss is ever tested. So the
 * real allowance for the toss fit's extrapolation error is about 0.042, not
 * 0.06, and this constant's remaining job is the confidence term below it and
 * a backstop against a line that fits five blobs somewhere else entirely.
 *
 * The figure it was originally justified by — how far the toss fit's own
 * extrapolation lands from the truth at contact — is still not measured
 * anywhere. `anchorFor(c, missPx)` in the suite injects that error and had
 * never been called with a non-zero miss until the sweep above.
 */
const OUTBOUND_ANCHOR_TOLERANCE = 0.06

/**
 * Slowest image travel that can be a struck serve, in body heights per second.
 *
 * IMAGE travel, and the word is load-bearing. This is compared against the raw
 * fitted slope, before `analyze.ts` divides the horizontal by the depth gain at
 * the measured camera yaw, so in world terms the floor is really 5/sin(yaw).
 *
 * The world-speed argument for the number is therefore an argument about the
 * side-on case only, and it is worth stating as such rather than as a fact
 * about serves. Side-on, five body heights a second is about 8.9 m/s — 32 km/h
 * — if the player is the 1.78 m this pipeline assumes, and a serve leaving the
 * strings that slowly from a contact point around 2.5 m falls to the ground
 * about 6.4 m away: it does not reach the net, let alone the service box.
 *
 * Away from side-on the floor rises with it, and at the far end it bites. At
 * 18° of yaw, the lowest `readImageX` will accept, a genuine 100 km/h serve
 * projects to about 5.0 body heights a second of image travel — exactly on this
 * line. So a real serve can be refused here as "not a struck ball" by a
 * threshold whose justification says it could not reach the net.
 *
 * Left as it is, and the direction is why. What that costs is a refusal on a
 * near-face-on clip, and a refusal is the outcome this app is built to prefer;
 * dividing by the gain first to fix it would put the jitter multiplication of
 * `axes.ts` inside a gate whose whole job is to keep fabricated speeds out. The
 * clip that loses its reading here is one where `readOutboundFlight` is about
 * to refuse it anyway.
 *
 * The two things that would otherwise be fitted here both sit far below the
 * line at any angle: the tossed ball is still falling at around one body height
 * a second at contact, and a run of duplicate frames from seeking finer than
 * the film was shot gives a line of slope zero.
 *
 * A floor, not a reading. Nothing downstream ever sees this number; it only
 * decides whether there is a number at all.
 */
const MIN_STRUCK_SPEED = 5

/**
 * Fit the ball's outbound line, or return nothing.
 *
 * One hypothesis per candidate rather than the toss's triples: the anchor
 * supplies the start of the line, so a single detection completes it. That
 * matters here in a way it does not above — with five to nine points in the
 * pool a cubic search over triples would be free, but it would also be free to
 * find a line through any three blobs that happened to be moving, and the whole
 * defence against that is insisting the line begins where the toss ended.
 */
export function trackOutbound(
  perFrame: { t: number; candidates: BallCandidate[] }[],
  opts: OutboundOptions,
): OutboundTrack | undefined {
  const band = opts.band ?? OUTBOUND_BAND
  const minSamples = opts.minSamples ?? OUTBOUND_MIN_SAMPLES
  const { anchor, aspect, bodyHeight } = opts
  if (!(bodyHeight > 0) || !(aspect > 0)) return undefined

  // Everything is compared in frame heights, so image x is scaled once on the
  // way in and the fitted slope is scaled back on the way out. Comparing a
  // width-normalised x against a height-normalised y without this reads a
  // landscape clip's residuals 1.78x small and a portrait clip's 1.78x large —
  // the same unit mismatch `summariseToss` documents for drift.
  const anchorX = anchor.x * aspect

  const pool: BallSample[] = []
  for (const f of perFrame) {
    // Strictly after contact. The contact frame itself holds the ball mid-strike
    // — on the strings, smeared across the racket — and it is the anchor, not a
    // sample.
    if (!(f.t > anchor.t)) continue
    for (const c of f.candidates.slice(0, 3)) pool.push({ t: f.t, x: c.x, y: c.y })
  }
  if (pool.length < minSamples) return undefined

  let best: BallSample[] | undefined
  for (const seed of pool) {
    const dt = seed.t - anchor.t
    if (dt <= 0) continue
    const vx = (seed.x * aspect - anchorX) / dt
    const vy = (seed.y - anchor.y) / dt

    const inliers: BallSample[] = []
    let lastT = -Infinity
    for (const q of pool) {
      const u = q.t - anchor.t
      const ex = anchorX + vx * u - q.x * aspect
      const ey = anchor.y + vy * u - q.y
      if (Math.hypot(ex, ey) > band) continue
      // One detection per instant, and the first that fits is the strongest:
      // `findCandidates` returns them ranked by blob score and the pool is built
      // in that order. Two blobs from one frame both near the line would
      // otherwise count twice while adding no evidence, which on a five-sample
      // minimum is the difference between refusing and answering.
      if (q.t === lastT) continue
      lastT = q.t
      inliers.push(q)
    }
    if (!best || inliers.length > best.length) best = inliers
  }

  if (!best || best.length < minSamples) return undefined

  // Refit on the detections alone. The anchor is deliberately left out even
  // though it is a real point: it sits at the very start of the baseline so it
  // extends nothing, and including it would make the reported speed partly a
  // restatement of the toss fit. Left out, the agreement between the two is an
  // independent check, which is what it is used as below.
  const xFit = lineFit(best.map((p) => ({ t: p.t, v: p.x * aspect })))
  const yFit = lineFit(best.map((p) => ({ t: p.t, v: p.y })))
  const vx = xFit.slope
  const vy = yFit.slope

  // Image speed in the player's own body heights per second. Below the floor
  // this is not a struck ball — see `MIN_STRUCK_SPEED`.
  const imageSpeed = Math.hypot(vx, vy) / bodyHeight
  if (!(imageSpeed >= MIN_STRUCK_SPEED)) return undefined

  // Where the fitted line says the ball was at contact, against where the toss
  // said it was. A line through blobs that are not this ball can be fast, can be
  // straight, and can have five points on it; passing back through the end of
  // the toss as well is what it cannot do by coincidence.
  const anchorMiss = Math.hypot(xFit.at(anchor.t) - anchorX, yFit.at(anchor.t) - anchor.y)
  if (anchorMiss > OUTBOUND_ANCHOR_TOLERANCE) return undefined

  const residual =
    best.reduce((s, p) => s + Math.hypot(xFit.at(p.t) - p.x * aspect, yFit.at(p.t) - p.y), 0) /
    best.length

  const fitConfidence = Math.max(
    0,
    Math.min(
      1,
      0.5 * Math.min(1, best.length / OUTBOUND_TARGET_SAMPLES) +
        0.3 * Math.max(0, 1 - residual / band) +
        0.2 * Math.max(0, 1 - anchorMiss / OUTBOUND_ANCHOR_TOLERANCE),
    ),
  )

  return { velocity: { x: vx / aspect, y: vy }, samples: best, fitConfidence }
}

/**
 * Rotate an outbound track into the levelled frame, as `levelFlight` does for
 * the toss.
 *
 * A velocity has no position, so this is that rotation without the pivot —
 * which is the whole of the difference between the two functions. It matters
 * for one number: the launch angle is measured against image horizontal, and on
 * a clip filmed with the phone cocked ten degrees in somebody's hand, image
 * horizontal is ten degrees off the court. The speed is unchanged by a rotation
 * and is carried through untouched rather than recomputed, so the two cannot
 * drift apart.
 */
export function levelOutbound(
  track: OutboundTrack,
  roll_deg: number,
  aspect: number,
): OutboundTrack {
  const theta = (-roll_deg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const vx = track.velocity.x * aspect
  const vy = track.velocity.y
  return {
    ...track,
    velocity: { x: (vx * cos - vy * sin) / aspect, y: vx * sin + vy * cos },
  }
}

/**
 * Did the film advance between these two frames? Mean absolute channel
 * difference over a strided sample of the pixels, 0–255.
 *
 * This exists because of what the post-contact window has to do to be measured
 * at all: it asks the video for instants far closer together than the pose grid
 * uses, and nothing in this app knows the clip's true frame rate. Asking a
 * 30 fps file for a frame every four milliseconds returns the *same decoded
 * frame* seven times over, each stamped with a different time. The ball is then
 * in the same place at seven different moments, which is a perfectly good
 * straight line of slope zero — a ball that left the strings at nought and hung
 * there. `MIN_STRUCK_SPEED` catches that case, but only after it has been
 * fitted; dropping the repeats here is what keeps the coverage counts honest
 * about how much film there actually was, which is the difference between
 * telling a player their clip was too slow and telling them nothing.
 *
 * Strided rather than exhaustive because the answer is never marginal: a
 * re-decode of the same frame is bit-identical and scores 0, while any real
 * frame interval moves sensor noise, exposure and the ball. One pixel in
 * sixteen tells those apart at a sixteenth of the arithmetic, on a phone that
 * is already paying for the seek.
 */
export function frameChange(frame: Bitmap, previous: Bitmap | undefined): number {
  // No previous frame is not evidence of a repeat. Reported as fully changed, so
  // the first frame of any window is always kept.
  if (!previous || previous.data.length !== frame.data.length) return Infinity
  let sum = 0
  let n = 0
  for (let i = 0; i + 2 < frame.data.length; i += 64) {
    sum +=
      Math.abs(frame.data[i] - previous.data[i]) +
      Math.abs(frame.data[i + 1] - previous.data[i + 1]) +
      Math.abs(frame.data[i + 2] - previous.data[i + 2])
    n += 3
  }
  return n ? sum / n : Infinity
}
