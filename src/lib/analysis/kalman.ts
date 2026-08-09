/**
 * Holding onto a landmark the tracker has lost.
 *
 * At 30 fps a serving racket hand crosses a quarter of the frame between
 * samples, and on a phone in daylight it arrives as a smear. The pose model
 * still returns a wrist for every frame — it is obliged to — but through the
 * blur those coordinates stop being measurements and start being the model's
 * best guess, flagged only by a visibility score nobody downstream was reading.
 * Two of those in the fifty milliseconds around contact are enough to invent a
 * racket drop that never happened.
 *
 * A constant-velocity filter is the right shape for this. A hand through the
 * swing is not moving arbitrarily: it is on a smooth arc with continuous
 * velocity, so the position two frames ago and the speed it was travelling
 * predict the next one better than a blurred detection does. The filter leans on
 * the prediction exactly as far as the detection is untrustworthy — a
 * well-tracked frame is left essentially alone, and a frame the model admits it
 * guessed is replaced by physics.
 *
 * Deliberately one dimension per axis and no cross terms. A full 2D filter with
 * a shared covariance is more correct on paper and needs a motion model this
 * data does not support; the axes of a serving hand are close enough to
 * independent, and the simpler filter has one tuning constant instead of six.
 */
import { clamp, keyVisibility } from './geometry'
import type { Frame, Landmark } from './types'

export interface FilterOptions {
  /**
   * How much the tracked thing is expected to deviate from constant velocity,
   * per second. Larger lets the filter follow a real acceleration; smaller makes
   * it lean harder on its own prediction.
   */
  process?: number
  /** Measurement noise on a perfectly seen landmark, in frame units. */
  noise?: number
}

/**
 * A serving hand accelerates hard — that is the entire point of the motion — so
 * the process noise has to be generous or the filter smooths away the swing it
 * is meant to be tracking. Tuned so a clean, fully visible track comes back
 * within a landmark's own jitter of where it started.
 */
const DEFAULT_PROCESS = 6
const DEFAULT_NOISE = 0.004

interface State {
  x: number
  v: number
  /** Covariance of position and velocity, and their correlation. */
  pxx: number
  pxv: number
  pvv: number
}

/**
 * One axis, forward pass.
 *
 * Returns both the filtered series and the innovation on each sample — how far
 * the detection sat from what the physics predicted. That residual is the most
 * honest blur signal the pipeline has: a smooth arc produces small ones, and a
 * hand the model is hallucinating through a smear produces large ones without
 * necessarily having a low visibility score to show for it.
 */
function filterAxis(
  values: number[],
  times: number[],
  weights: number[],
  process: number,
  noise: number,
): { filtered: number[]; innovation: number[] } {
  const n = values.length
  const filtered = new Array<number>(n)
  const innovation = new Array<number>(n).fill(0)
  if (!n) return { filtered, innovation }

  let s: State = { x: values[0], v: 0, pxx: noise * noise, pxv: 0, pvv: 1 }
  filtered[0] = values[0]

  for (let i = 1; i < n; i++) {
    const dt = Math.max(1e-3, times[i] - times[i - 1])

    // Predict: constant velocity, with the uncertainty growing as the square of
    // how long we have been coasting.
    const px = s.x + s.v * dt
    const pv = s.v
    const q = process * process * dt
    const pxx = s.pxx + 2 * s.pxv * dt + s.pvv * dt * dt + q * dt * dt
    const pxv = s.pxv + s.pvv * dt + q * dt
    const pvv = s.pvv + q

    // A landmark the model barely saw is a weak measurement, not a wrong one —
    // its noise is inflated rather than the sample being dropped, so the filter
    // still uses whatever information it carries.
    const trust = clamp(weights[i], 0.05, 1)
    const r = (noise / trust) ** 2

    const residual = values[i] - px
    const k = pxx / (pxx + r)

    s = {
      x: px + k * residual,
      v: pv + (pxv / (pxx + r)) * residual,
      pxx: (1 - k) * pxx,
      pxv: (1 - k) * pxv,
      pvv: pvv - (pxv * pxv) / (pxx + r),
    }
    filtered[i] = s.x
    innovation[i] = Math.abs(residual)
  }

  return { filtered, innovation }
}

export interface StabilisedTrack {
  /**
   * The filtered path. `z` rides along because a landmark handed back to the
   * measurements needs all three of its coordinates — hip–shoulder separation
   * and shoulder tilt are read from world z and nothing else — but it stays out
   * of `innovation` and `step` below. Those two describe how well the *camera*
   * followed the hand, and z was never in the picture: it is the network's
   * inference from apparent size, and folding it in would let a depth guess
   * decide whether a clip is called blurred.
   */
  points: { x: number; y: number; z: number }[]
  /**
   * Median distance between what was detected and what the physics predicted, in
   * frame units. High means the track is not describing a smooth motion —
   * blur, a lost limb, or the tracker jumping to somebody else.
   */
  innovation: number
  /** Mean visibility across the track, carried so callers need not walk it twice. */
  seen: number
  /**
   * Median distance the raw detections moved between samples.
   *
   * Carried for callers that want the raw scale of the motion. It is *not* what
   * the innovation is read against any more — see `wildness`.
   */
  step: number
  /**
   * How much the raw detections zig-zag, in frame units.
   *
   * Divided by the player's standing height where it is read — `blurOf` — since
   * that is where the height is known. The median second difference of the
   * unfiltered track: how far each detection
   * sits from the straight line between its neighbours. A hand on a smooth arc
   * produces a small one whatever it is doing; a hand the model is guessing at
   * through a smear produces a large one, because the guesses are independent
   * frame to frame and the truth is not.
   *
   * Measured against the player's own height, which is the one scale in the
   * picture that does not move with the frame rate. The previous statistic
   * divided the filter's prediction error by `step`, the median inter-frame
   * travel, on the documented grounds that this "lands in the same place at
   * every rate". It does not: `step` halves when the rate doubles and the
   * tracker's per-frame jitter does not, so the identical clip scored 0.02 at
   * 24 fps and 0.93 at 120 — and the refusal it drove tells the player to refilm
   * in slow motion, which makes it worse. Measured across 24/30/50/120 fps at
   * fixed jitter, this reads within 1.0–1.5x of itself where the old ratio
   * moved 2.0–2.3x, and the difference is concentrated exactly in the band
   * where clips were being turned away.
   *
   * The one thing it also picks up is real curvature in the swing itself, which
   * at 24 fps is about 0.008 of a body height. That sits an order below the
   * refusal and is the reason this is a median rather than a mean.
   */
  wildness: number
}

/**
 * Stabilise one landmark across a run of frames.
 *
 * The filter runs forwards, then backwards over its own output, and the two are
 * averaged. A single forward pass lags — it has only ever seen the past, so at
 * the sharpest part of the swing it sits a frame behind the hand — and a lag of
 * one frame at 30 fps is 33 ms of timing error on measurements whose whole
 * target band is a hundred. Running it both ways cancels the lag to first order,
 * which is what makes this safe to use on a series that timing is read from.
 */
export function stabilise(
  track: (Landmark | undefined)[],
  times: number[],
  options: FilterOptions = {},
): StabilisedTrack {
  const process = options.process ?? DEFAULT_PROCESS
  const noise = options.noise ?? DEFAULT_NOISE

  const n = track.length
  const xs = new Array<number>(n)
  const ys = new Array<number>(n)
  const zs = new Array<number>(n)
  const weights = new Array<number>(n)
  let seenSum = 0

  for (let i = 0; i < n; i++) {
    const p = track[i]
    xs[i] = p?.x ?? xs[i - 1] ?? 0
    ys[i] = p?.y ?? ys[i - 1] ?? 0
    zs[i] = p?.z ?? zs[i - 1] ?? 0
    const v = clamp(p?.visibility ?? 0, 0, 1)
    weights[i] = v
    seenSum += v
  }
  if (n === 0) return { points: [], innovation: 0, seen: 0, step: 0, wildness: 0 }

  const reversed = [...times].reverse().map((t, _i, arr) => arr[0] - t + times[0])
  const backwards = (forward: number[]) =>
    filterAxis([...forward].reverse(), reversed, [...weights].reverse(), process, noise)
      .filtered.reverse()

  const fx = filterAxis(xs, times, weights, process, noise)
  const fy = filterAxis(ys, times, weights, process, noise)
  const fz = filterAxis(zs, times, weights, process, noise)
  const bxf = backwards(fx.filtered)
  const byf = backwards(fy.filtered)
  const bzf = backwards(fz.filtered)

  const points = new Array<{ x: number; y: number; z: number }>(n)
  for (let i = 0; i < n; i++) {
    points[i] = {
      x: (fx.filtered[i] + bxf[i]) / 2,
      y: (fy.filtered[i] + byf[i]) / 2,
      z: (fz.filtered[i] + bzf[i]) / 2,
    }
  }

  const residuals: number[] = []
  const steps: number[] = []
  for (let i = 1; i < n; i++) {
    residuals.push(Math.hypot(fx.innovation[i], fy.innovation[i]))
    steps.push(Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
  }

  // Read off the raw detections rather than anything the filter produced: the
  // filter's job is to remove exactly the zig-zag being measured here.
  const zigzag: number[] = []
  for (let i = 1; i < n - 1; i++) {
    zigzag.push(Math.hypot(xs[i - 1] - 2 * xs[i] + xs[i + 1], ys[i - 1] - 2 * ys[i] + ys[i + 1]))
  }

  const mid = (a: number[]) => {
    if (!a.length) return 0
    const sorted = [...a].sort((p, q) => p - q)
    return sorted[sorted.length >> 1]
  }

  return {
    points,
    innovation: mid(residuals),
    seen: n ? seenSum / n : 0,
    step: mid(steps),
    wildness: mid(zigzag),
  }
}

/**
 * How badly a track is degraded, 0 (clean) to 1 (unusable).
 *
 * Combines the two independent things that go wrong on a scrappy clip: the
 * tracker admitting it cannot see the landmark, and the landmark refusing to
 * follow a plausible motion. Either alone is survivable; the pair together is
 * what a blurred serve looks like.
 *
 * The zig-zag is read against the player's standing height, which is the only
 * scale in the picture the frame rate does not move. It used to be read against
 * `step`, the distance the hand travelled between samples, on the stated grounds
 * that this made it rate-invariant. Measured, it did the opposite: `step` halves
 * when the rate doubles while the tracker's per-frame jitter does not, so one
 * clip at a fixed jitter scored 0.02 at 24 fps and 0.93 at 120. Every refusal in
 * the app's own scrappy-clip ensemble came through this gate, and the copy on
 * the refusal tells the player to refilm in slow motion — advice that made the
 * number worse and refused them twice.
 *
 * The band is set from where the engine stops missing faults and starts naming
 * the wrong ones, measured by dialling a known fault into the synthetic rig and
 * sweeping the tracker jitter. Below CLEAN sits everything up to and including
 * the rig's own figure for a well-lit modern phone; a dialled fault is still
 * found on two clips in three there and the third reports nothing rather than
 * something false. Past UNREADABLE — around twice the rig's figure for dusk or
 * a cluttered background — the flaws that come back start being inventions of
 * the noise, in a different group of the hierarchy and at a higher severity
 * than the real one. In between the clip is measured, the swing readings are
 * hedged and the whole-clip confidence falls, which is what the rest of the
 * pipeline is built to carry.
 */
const CLEAN_ZIGZAG = 0.02
const UNREADABLE_ZIGZAG = 0.085

export function blurOf(track: StabilisedTrack, bodyHeight: number): number {
  const zigzag = track.wildness / Math.max(bodyHeight, 1e-6)
  const wildness = clamp((zigzag - CLEAN_ZIGZAG) / (UNREADABLE_ZIGZAG - CLEAN_ZIGZAG), 0, 1)
  const unseen = clamp((0.75 - track.seen) / 0.5, 0, 1)
  return clamp(Math.max(wildness, unseen * 0.9), 0, 1)
}

/* ------------------------------------------------------------------ bridging */

/**
 * One slot of the sampling grid, and whatever the pose model made of it.
 *
 * The null is the whole reason this type exists. `extractFrames` asks for an
 * evenly spaced run of moments and gets a pose back for most of them; the
 * misses used to be dropped on the spot, which closed the hole before anything
 * could see it was there. A hole cannot be bridged once the array no longer
 * records that it happened, so the grid is carried here intact.
 */
export interface PoseSample {
  t: number
  pose: { image: Landmark[]; world: Landmark[] } | null
}

/**
 * How long the filter may coast before it stops interpolating and starts
 * inventing.
 *
 * Two bounds, because the count of missing frames and the time they cover are
 * not the same question. The span is the real one: constant velocity is an
 * approximation that decays with the interval, and a tenth of a second is a limb
 * passing behind the body — the hand comes out of it within a centimetre or two
 * of where the physics said it would be. A third of a second is the whole racket
 * drop, and a filter run across that draws a confident arc through a moment
 * nobody filmed, which is the exact failure this codebase refuses to ship.
 *
 * The count is what stops the span from meaning different things at different
 * frame rates. A slow-motion clip at 120 fps fits twelve samples inside a tenth
 * of a second, and twelve invented frames in a row is a fabricated stretch of
 * serve however briefly it lasted. Together they come to one or two missed
 * samples at the 24–32 fps the app actually reads at, which is what a tracker
 * losing a limb for a moment looks like.
 */
export const MAX_BRIDGED_SAMPLES = 3
export const MAX_BRIDGED_SPAN = 0.1

/**
 * What a bridged landmark admits about itself.
 *
 * Zero, because zero is true: nobody saw it. Everything downstream that decides
 * how far to trust a number already reads visibility — `metricConfidence`
 * averages it over the landmarks each measurement is taken from, `keyVisibility`
 * feeds the refusal threshold, and `blurOf` scores a track partly on it — so a
 * bridged frame is discounted by every one of them without a single call site
 * having to learn a new concept. Handing back the filter's confidence here
 * instead would buy the clip credit for a frame that was never filmed.
 */
export const BRIDGED_VISIBILITY = 0

/**
 * Fill in the detections the model missed, where the gap is short enough that
 * the motion either side genuinely says where the body was.
 *
 * This is the connection the filter above was written for and never had. It ran
 * on one landmark, in one window, to produce a blur statistic — so on the
 * measurement path a lost frame was simply a lost frame, and the array closed
 * over it. Closing over it is what makes a clip's timestamps stop matching its
 * indices, and every span the detector measures in samples then covers more of
 * the serve than it was meant to.
 *
 * Deliberately not a repair of bad frames: a pose the model returned is handed
 * back untouched, however poorly it was seen. Smoothing those would replace real
 * measurements with the filter's opinion of them, and the residual between the
 * two is the most honest blur signal the pipeline has. Only the slots where
 * there was no pose at all are written, and only when they are flanked on both
 * sides — a hole running off either end of the clip is extrapolation, and there
 * is no evidence whatsoever about where the motion went after the last thing
 * anybody saw.
 */
export function bridgeDetectionGaps(samples: PoseSample[]): Frame[] {
  const bridged = new Set<number>()
  for (let i = 0; i < samples.length; ) {
    if (samples[i].pose) {
      i++
      continue
    }
    let end = i
    while (end < samples.length && !samples[end].pose) end++
    const before = i - 1
    if (before >= 0 && end < samples.length) {
      const coast = samples[end].t - samples[before].t
      if (end - i <= MAX_BRIDGED_SAMPLES && coast <= MAX_BRIDGED_SPAN + 1e-9) {
        for (let k = i; k < end; k++) bridged.add(k)
      }
    }
    i = end
  }

  const keep = samples.filter((s, i) => s.pose !== null || bridged.has(i))
  const frames: Frame[] = keep.map((s, index) => ({
    index,
    t: s.t,
    image: s.pose ? s.pose.image : [],
    world: s.pose ? s.pose.world : [],
    visibility: 0,
  }))
  if (!bridged.size) return frames

  const poses = keep.map((s) => s.pose)
  const anchor = poses.find((p) => p !== null)
  if (!anchor) return frames
  const times = frames.map((f) => f.t)

  // One pass per landmark, over the whole reconstructed clip rather than over
  // the gap alone. The filter runs forwards and backwards and averages, so a
  // point inside a hole is placed from the motion on both sides of it — which is
  // the difference between interpolation and a guess extended from the left.
  const fill = (side: 'image' | 'world') => {
    for (let lm = 0; lm < anchor[side].length; lm++) {
      const track = stabilise(
        poses.map((p) => (p ? p[side][lm] : undefined)),
        times,
      )
      for (let i = 0; i < poses.length; i++) {
        if (poses[i]) continue
        frames[i][side][lm] = { ...track.points[i], visibility: BRIDGED_VISIBILITY }
      }
    }
  }
  fill('image')
  fill('world')

  return frames
}

/**
 * How many of the samples between two keyframes the tracker actually saw.
 *
 * The honest form of `contact - drop`. That subtraction counts array positions,
 * and once short gaps are bridged some of those positions hold a frame nobody
 * filmed — so a clip that lost detections through the swing would come back
 * claiming the sample count of one that did not, and the swing timing it earned
 * a caveat for would be reported crisply. Bridging is allowed to put the
 * keyframes back where they belong; it is not allowed to buy evidence.
 *
 * A frame with no visibility anywhere in the body is unseen whether this module
 * put it there or the tracker did, so no marker beyond that is needed and none
 * is invented. On a clip with nothing bridged this returns exactly what the
 * subtraction did.
 */
export function capturedSamples(frames: Frame[], from: number, to: number): number {
  const last = frames.length - 1
  if (last < 0) return 0
  const lo = clamp(Math.round(from), 0, last)
  const hi = clamp(Math.round(to), 0, last)
  let n = 0
  for (let i = lo + 1; i <= hi; i++) if (keyVisibility(frames[i]) > 0) n++
  return n
}
