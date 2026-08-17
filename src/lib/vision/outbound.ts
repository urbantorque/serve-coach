/**
 * The ball after it leaves the strings, read as a smear rather than as a ball.
 *
 * WHY A NEW DETECTOR AND NOT THE EXISTING ONE POINTED AT A NEW WINDOW.
 * `findCandidates` looks for a disc: it grows a blob out of a frame difference
 * and scores it on how round and how ball-sized it is. That is the right model
 * for a toss, which hangs. It is the wrong model for a serve, and R61·1
 * measured how wrong — a struck ball smears about **1.50 m across the frame** in
 * one exposure, which is not a disc, is far past `maxRadius`, and is thrown out
 * by the roundness score before anything else looks at it.
 *
 * So this measures the smear itself. A motion-blurred ball is a bright
 * elongated region whose long axis is the direction it travelled during the
 * exposure — which means one frame carries a direction, where a disc carries
 * only a position. That is the whole reason this is worth building at the speeds
 * where the disc model dies.
 *
 * WHAT IT DOES NOT DO, AND WILL NOT.
 *
 *   · **No speed in mph, ever.** R61 is explicit and the arithmetic agrees: a
 *     speed needs a distance, a distance needs a scale, and the only scale this
 *     app has is the player's own body height in the frame — measured at the
 *     baseline, on a ball travelling away from the camera into a plane nothing
 *     calibrated. `serves.ts` already refuses court lines for the same reason at
 *     a much easier distance.
 *   · **No claim past the frame count.** See `OUTBOUND_FLOOR`.
 */

import type { Bitmap } from './ballTrack'

/**
 * One frame's worth of smear.
 *
 * `lengthRatio` and the angle are what a disc cannot give: the long axis of the
 * blur is where the ball went during that exposure, so a single frame carries a
 * heading. `elongation` is how confident this is a smear at all — 1.0 is a
 * circle, and the ball is not the only bright moving thing in a tennis frame.
 */
export interface Streak {
  /** Middle of the smear, 0–1 across the frame. */
  x: number
  y: number
  /** Long axis, as a fraction of frame height. */
  lengthRatio: number
  /** Degrees from horizontal, positive upward — image y is flipped here. */
  angleDeg: number
  /** Long axis over short axis. A disc is 1. */
  elongation: number
  /** Bright pixels in the region. Kept so `finish` can prefer the real ball. */
  pixels: number
}

/**
 * How elongated a region has to be before it is called a smear.
 *
 * Not tuned by eye. R61·1's figure is the derivation: a strong serve crosses
 * about 1.50 m during one exposure against a ball 6.7 cm across, which is an
 * aspect ratio in the twenties — and a club serve, which is the case that has to
 * work, is roughly half that. Three is far below both and comfortably above the
 * rounder things that survive a frame difference: a shoe, a wristband, a hand.
 *
 * Set low on purpose. A missed ball costs the reading; a false streak is caught
 * downstream, where several frames have to agree about a direction.
 */
export const MIN_ELONGATION = 3

/**
 * The fewest frames this will say anything from.
 *
 * **KEYED TO FRAMES, NOT TO SPEED, AND THAT IS THE ROUND'S ONE HARD PART.**
 * R61·3 asks for a refusal "above the speed where the frames run out" — and a
 * refusal keyed to the speed is a refusal the estimate authorises for itself. A
 * ball too fast to measure produces a bad speed; gate on that speed and a bad
 * enough estimate reads as slow and lets itself through. The failure is silent
 * and it is always in the same direction, because the estimates that fail
 * hardest are the ones from the fewest frames.
 *
 * So the gate is on what was actually counted. Three points is the least that
 * can disagree with a straight line at all — two always fit one perfectly — and
 * R61·1 puts a strong serve at 3.9 frames in this window against 8.0 at club
 * speed. A floor of three therefore refuses the fastest serves and passes the
 * ones this app is for, which is the right way round: a recreational player's
 * serve is the case that must work.
 *
 * The count travels with the reading either way, so a caller can be stricter.
 * Nothing may be stated below it.
 */
export const OUTBOUND_FLOOR = 3

/**
 * Where the ball went, and how much was seen of it.
 *
 * `launchDeg` is absent rather than approximate when the floor is not met.
 */
export interface Outbound {
  /** Degrees above horizontal at the strings. Absent when it was not measured. */
  launchDeg?: number
  /** Streaks that agreed. Reported always — it is the caveat and the refusal. */
  frames: number
  /** Why nothing was stated, when nothing was. */
  refusal?: 'too_few_streaks' | 'no_streaks' | 'disagreed'
}

/* ------------------------------------------------------------- the pixels */

/**
 * Bright regions that moved since the previous frame, measured as ellipses.
 *
 * Same first step as `findCandidates` — a frame difference over a threshold —
 * and a different second one. That one grows a blob and asks whether it is
 * round; this one takes each region's second moments and asks which way it is
 * stretched. The two could share the masking step and deliberately do not yet:
 * `findCandidates` is load-bearing for the toss on every clip the app reads,
 * and refactoring it to serve a detector that has never seen real footage is
 * the wrong order to do those in.
 *
 * `previous` absent means the first frame of a pass, which yields nothing
 * rather than treating the whole frame as movement.
 */
export function findStreaks(
  frame: Bitmap,
  previous: Bitmap | undefined,
  opts: { threshold?: number; minPixels?: number } = {},
): Streak[] {
  if (!previous || previous.width !== frame.width || previous.height !== frame.height) return []
  const { width: w, height: h } = frame
  const threshold = opts.threshold ?? 42
  const minPixels = opts.minPixels ?? 6

  const moved = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < moved.length; i++, p += 4) {
    // Green alone. It is 71% of luminance and costs a third of reading three
    // channels — the same trade `findCandidates` makes, and a tennis ball is
    // the brightest thing in the frame in green whatever the court surface.
    if (Math.abs(frame.data[p + 1] - previous.data[p + 1]) > threshold) moved[i] = 1
  }

  const seen = new Uint8Array(w * h)
  const out: Streak[] = []
  const stack: number[] = []
  for (let start = 0; start < moved.length; start++) {
    if (!moved[start] || seen[start]) continue
    // Flood fill, iterative — a recursive one blows the stack on a smear
    // crossing a quarter of a 256-wide frame.
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    let n = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let syy = 0
    let sxy = 0
    while (stack.length) {
      const i = stack.pop()!
      const x = i % w
      const y = (i / w) | 0
      n++
      sx += x
      sy += y
      sxx += x * x
      syy += y * y
      sxy += x * y
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (moved[j] && !seen[j]) {
            seen[j] = 1
            stack.push(j)
          }
        }
      }
    }
    if (n < minPixels) continue

    /*
     * The region as an ellipse, from its second moments. The eigenvalues of the
     * covariance matrix are the variances along the principal axes, so their
     * square roots are the semi-axes and their ratio is the elongation. Four
     * times the larger semi-axis is the conventional length of a blur.
     */
    const mx = sx / n
    const my = sy / n
    const cxx = sxx / n - mx * mx
    const cyy = syy / n - my * my
    const cxy = sxy / n - mx * my
    const half = (cxx + cyy) / 2
    const gap = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy))
    const major = Math.sqrt(Math.max(0, half + gap))
    const minor = Math.sqrt(Math.max(0, half - gap))
    // A single-pixel-wide line has zero variance across itself, which would
    // divide by nothing. Half a pixel is the smallest honest width.
    const elongation = major / Math.max(minor, 0.5)
    // `atan2` of the major eigenvector, then flipped: image y grows downward
    // and every angle this app reports is positive upward.
    const angle = -(Math.atan2(2 * cxy, cxx - cyy) / 2) * (180 / Math.PI)
    out.push({
      x: mx / w,
      y: my / h,
      lengthRatio: (4 * major) / h,
      angleDeg: ((angle + 90) % 180) - 90,
      elongation,
      pixels: n,
    })
  }
  return out
}

/* ------------------------------------------------------- what they add up to */

/**
 * How far two frames' headings may disagree and still be one ball.
 *
 * A serve does not turn much in the tenth of a second after contact — gravity
 * has barely acted and drag is along the path — so the streaks should nearly
 * agree. Twenty-five degrees is loose enough for the angle noise of a smear
 * measured at 256 pixels wide, and tight enough that a wristband and a ball
 * cannot be mistaken for one object travelling.
 */
export const HEADING_TOLERANCE_DEG = 25

/**
 * The launch angle, from a pass's worth of streaks.
 *
 * One streak per frame — the longest, which is the fastest thing that moved, and
 * on a struck serve that is the ball by a wide margin. Ambiguity here is
 * resolved by the agreement test below rather than by scoring: several frames
 * agreeing on a heading is much stronger evidence than any single-frame score.
 *
 * The angle is the median of the agreeing streaks rather than a fit through
 * their positions. The positions are centres of smears whose length varies with
 * how fast the ball was going; the angles are each measured from the exposure
 * itself, and are the more direct reading. A median rather than a mean because
 * one surviving false streak should cost nothing.
 */
export function readOutbound(perFrame: readonly Streak[][]): Outbound {
  const best = perFrame
    .map((frame) => frame.filter((s) => s.elongation >= MIN_ELONGATION))
    .map((frame) => frame.reduce<Streak | undefined>((a, b) => (!a || b.lengthRatio > a.lengthRatio ? b : a), undefined))
    .filter((s): s is Streak => s !== undefined)

  if (!best.length) return { frames: 0, refusal: 'no_streaks' }

  /*
   * The largest set that agrees on a heading, found by taking each streak's
   * angle as a hypothesis and counting who is within tolerance.
   *
   * n² over at most a handful of frames, which is free at these sizes.
   *
   * **AND AT THESE SIZES IT AGREES WITH THE OBVIOUS ALTERNATIVE.** The first
   * version of this comment claimed the cheaper route — take the median, filter
   * around it — lets false streaks drag the middle off the ball. Canaried by
   * swapping one for the other, and the suite stayed green: with eight frames or
   * fewer and one dominant cluster, the median lands inside that cluster and the
   * two give the same answer. No case separating them could be constructed at
   * this scale.
   *
   * Kept anyway, on a narrower claim that is true: this does not depend on the
   * median landing in the cluster, which is an assumption rather than a
   * guarantee, and it costs nothing here. A claim about failure modes it has not
   * been shown to prevent is not one this file gets to make.
   */
  let agreeing: Streak[] = []
  for (const hypothesis of best) {
    const with_ = best.filter((s) => Math.abs(s.angleDeg - hypothesis.angleDeg) <= HEADING_TOLERANCE_DEG)
    if (with_.length > agreeing.length) agreeing = with_
  }

  if (agreeing.length < OUTBOUND_FLOOR) {
    /*
     * Two different failures, told apart because they mean different things to
     * whoever asks next. Streaks that were found and did not agree is a scene
     * with more than one fast thing in it — the ball and a swinging racket, a
     * second player — and no better camera fixes that. Streaks that were never
     * found at all is a ball too fast for the frame rate, which is the case
     * R61·3 was written about.
     */
    return {
      frames: agreeing.length,
      refusal: best.length >= OUTBOUND_FLOOR ? 'disagreed' : 'too_few_streaks',
    }
  }

  const angles = agreeing.map((s) => s.angleDeg).sort((a, b) => a - b)
  const mid = angles.length >> 1
  const launchDeg = angles.length % 2 ? angles[mid] : (angles[mid - 1] + angles[mid]) / 2
  return { launchDeg, frames: agreeing.length }
}
