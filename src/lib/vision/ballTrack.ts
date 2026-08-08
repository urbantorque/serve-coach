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

/** Least-squares quadratic through (t, y). Returns [c0, c1, c2] or undefined. */
function fitQuadratic(pts: { t: number; y: number }[]): [number, number, number] | undefined {
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
  const m = [
    [s0, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ]
  const det3 = (a: number[][]) =>
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0])

  const d = det3(m)
  if (Math.abs(d) < 1e-12) return undefined
  const withCol = (col: number, v: number[]) => m.map((row, i) => row.map((x, j) => (j === col ? v[i] : x)))
  const rhs = [b0, b1, b2]
  const a0 = det3(withCol(0, rhs)) / d
  const a1 = det3(withCol(1, rhs)) / d
  const a2 = det3(withCol(2, rhs)) / d
  // y = a0 + a1·(t−t0) + a2·(t−t0)², expanded back to powers of t.
  return [a0 - a1 * t0 + a2 * t0 * t0, a1 - 2 * a2 * t0, a2]
}

export const flightHeightAt = (flight: BallFlight, t: number): number => {
  const [c0, c1, c2] = flight.coefficients
  return c0 + c1 * t + c2 * t * t
}

/** Least-squares straight line through (t, x), evaluated at `t`. Shared by the
 *  apex-x fit below and by `flightXAt` — a ball in flight has no horizontal
 *  acceleration worth modelling, so a line is enough for both. */
function linearAt(pts: { t: number; x: number }[], t: number): number {
  const meanT = pts.reduce((s, p) => s + p.t, 0) / pts.length
  const meanX = pts.reduce((s, p) => s + p.x, 0) / pts.length
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.t - meanT) * (p.x - meanX)
    den += (p.t - meanT) ** 2
  }
  const slope = den > 1e-9 ? num / den : 0
  return meanX + slope * (t - meanT)
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

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (pool[j].t === pool[i].t) continue
      for (let k = j + 1; k < pool.length; k++) {
        if (pool[k].t === pool[j].t || pool[k].t === pool[i].t) continue

        const coeffs = fitQuadratic([pool[i], pool[j], pool[k]].map((p) => ({ t: p.t, y: p.y })))
        if (!coeffs) continue
        // Image y grows downwards, so a falling ball curves positively.
        const g = 2 * coeffs[2]
        if (g < gLo || g > gHi) continue

        const inliers: BallSample[] = []
        let lastT = -Infinity
        for (const p of pool) {
          const predicted = coeffs[0] + coeffs[1] * p.t + coeffs[2] * p.t * p.t
          if (Math.abs(p.y - predicted) > band) continue
          // One point per frame — the closest. Two candidates from the same
          // frame both landing near the curve would otherwise inflate the
          // score without adding any evidence.
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
  const refined = fitQuadratic(best.inliers.map((p) => ({ t: p.t, y: p.y }))) ?? best.coeffs
  const [c0, c1, c2] = refined
  if (c2 <= 0) return undefined

  const apexT = -c1 / (2 * c2)
  const apexY = c0 + c1 * apexT + c2 * apexT * apexT

  // Horizontal position at the apex, from a straight-line fit — a ball in flight
  // has no horizontal acceleration worth modelling.
  const apexX = linearAt(best.inliers, apexT)

  const span = Math.max(...best.inliers.map((p) => p.t)) - Math.min(...best.inliers.map((p) => p.t))
  const residual =
    best.inliers.reduce(
      (s, p) => s + Math.abs(p.y - (c0 + c1 * p.t + c2 * p.t * p.t)),
      0,
    ) / best.inliers.length

  const confidence = Math.max(
    0,
    Math.min(
      1,
      0.45 * Math.min(1, best.inliers.length / 10) +
        0.3 * Math.min(1, span / 0.6) +
        0.25 * Math.max(0, 1 - residual / band),
    ),
  )

  return {
    coefficients: [c0, c1, c2],
    apex: { t: apexT, x: apexX, y: apexY },
    samples: best.inliers,
    confidence,
  }
}
