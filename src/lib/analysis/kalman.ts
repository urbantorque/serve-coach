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

/**
 * How far a raw, unfiltered track actually moved, as the diagonal of its own
 * bounding box in image space.
 *
 * Built to catch what `wildness` cannot: a landmark MediaPipe has frozen on a
 * stale guess through an occlusion rather than declined to place. That track
 * is often smooth rather than jittery — a model that has learned where a
 * wrist plausibly sits does not hallucinate noisily, it holds roughly still —
 * so its second differences read as clean, whatever the median across the
 * whole clip already accepts as ordinary jitter. A track that barely moved at
 * all is a different question from a track that moved erratically, and the
 * zig-zag statistic can only ever ask the second one.
 *
 * A bounding box rather than a summed path length: both catch a frozen track,
 * and the box is cheaper and needs no ordering assumption about the samples.
 */
function travelOf(points: (Landmark | undefined)[]): number {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (!p) continue
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX)) return 0
  return Math.hypot(maxX - minX, maxY - minY)
}

/**
 * Below this fraction of standing height, the racket hand did not travel far
 * enough across the drop-to-contact window to be a real racket drop.
 *
 * The window exists precisely because that is the biggest, fastest excursion
 * in the whole serve — `drop` is the lowest point after the trophy and
 * `contact` the highest point of the swing, by construction (`phases.ts`) —
 * so a clean serve clears this with enormous margin: the rig's own default
 * dials put the drop-to-contact travel at roughly 0.7 of standing height.
 * Set low enough that no fault this rig can dial — a shallow drop, a low
 * contact reach — comes near it; a real clip clearing it by less than this
 * would need a racket drop-to-contact spanning under a twelfth of the
 * player's own height, which is not a serve a human arm produces.
 */
const FROZEN_TRAVEL = 0.08

/**
 * Whether the racket hand's raw track through the drop-to-contact window is
 * too still to be a real swing.
 *
 * `bodyHeight` in the same image-space units `travelOf` reads its points in —
 * the caller's own scale, not metres.
 */
export function frozenThroughSwing(points: (Landmark | undefined)[], bodyHeight: number): boolean {
  return travelOf(points) / Math.max(bodyHeight, 1e-6) < FROZEN_TRAVEL
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
 * How long a hole may be before filling it stops being interpolation and starts
 * being invention.
 *
 * Two bounds, because the count of missing frames and the time they cover are
 * not the same question. The span is the real one: any curve through the
 * samples either side is an approximation that decays with the interval, and a
 * tenth of a second is a limb passing behind the body — the hand comes out of it
 * close to where the motion either side said it would be. A third of a second
 * is the whole racket drop, and a curve drawn across that is a confident arc
 * through a moment nobody filmed, which is the exact failure this codebase
 * refuses to ship.
 *
 * The count is what stops the span from meaning different things at different
 * frame rates. A slow-motion clip at 120 fps fits twelve samples inside a tenth
 * of a second, and twelve invented frames in a row is a fabricated stretch of
 * serve however briefly it lasted. Together they come to one or two missed
 * samples at the 24–32 fps the app actually reads at, which is what a tracker
 * losing a limb for a moment looks like. 0.112 s: two missed samples from 27 Hz
 * up, one at 24 and 25. At 0.1 a 30.00 Hz read bridged two missed samples and a
 * 29.97 Hz read did not, and refused 16 serves in 180 for it.
 *
 * What it leaves open (H45, H46): two missed samples on any even read under 26.8
 * a second (a 20 to 26 fps file, the blind window of a 60 fps file walked at 20),
 * and on the spread of a clip the budget cannot walk wherever the three gaps
 * around the hole come to more than 0.112 s: any two-frame gap at 30 fps, any
 * three-frame gap at 60, and always on the blind window of a 25 or 50 fps file.
 * A hole left open across contact is refused as a clip that ends before the
 * racket reaches the ball, which is not the reason; bridging one frame more turns
 * those into too few frames, which is not the reason either.
 */
export const MAX_BRIDGED_SAMPLES = 3
export const MAX_BRIDGED_SPAN = 0.112

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
export function bridgeDetectionGaps(samples: PoseSample[], stretch = 1): Frame[] {
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
      // On the serve's clock. The samples are seconds of file, and on slow motion a
      // missed sample is a tenth of a second of file and a fortieth of serve: judged
      // on the file a 4x or 8x clip bridged nothing (H45).
      const coast = (samples[end].t - samples[before].t) / Math.max(1, stretch)
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

  // Each hole is filled from the two measured samples either side of it — a
  // cubic through four points in time, which is placed from the motion on both
  // sides rather than extended from the left.
  //
  // A cubic rather than the Kalman filter this used to run, and the reason is
  // where holes happen. The tracker loses the racket hand at the drop and at
  // contact, which are the two places the hand turns round, and a filter that
  // models constant velocity carries the hand straight past the turn.
  // Measured on the rig at 30 fps with tracker jitter, one lost sample at the
  // drop came back 0.072 body heights from the truth under the filter and 0.014
  // under the cubic; at contact 0.074 against 0.016. Two lost samples at
  // contact at 30 fps are the one case the two tie (0.04–0.05), because four
  // points a fifth of a second apart cannot see a peak that narrow either.
  for (let i = 0; i < poses.length; ) {
    if (poses[i]) {
      i++
      continue
    }
    let end = i
    while (end < poses.length && !poses[end]) end++
    const support = gapSupport(poses, i, end)
    const ts = support.map((k) => frames[k].t)
    for (const side of ['image', 'world'] as const) {
      for (let lm = 0; lm < anchor[side].length; lm++) {
        const at = (axis: 'x' | 'y' | 'z') => support.map((k) => poses[k]![side][lm][axis])
        const xs = at('x')
        const ys = at('y')
        const zs = at('z')
        for (let k = i; k < end; k++) {
          const t = frames[k].t
          frames[k][side][lm] = {
            x: lagrange(ts, xs, t),
            y: lagrange(ts, ys, t),
            z: lagrange(ts, zs, t),
            visibility: BRIDGED_VISIBILITY,
          }
        }
      }
    }
    i = end
  }

  return frames
}

/**
 * The measured samples a hole is filled from: up to two either side, nearest
 * first. Only bridged holes reach here, and those are flanked on both sides by
 * construction, so there is always at least one each side.
 */
function gapSupport(poses: (PoseSample['pose'])[], from: number, to: number): number[] {
  const left: number[] = []
  for (let k = from - 1; k >= 0 && left.length < 2 && poses[k]; k--) left.unshift(k)
  const right: number[] = []
  for (let k = to; k < poses.length && right.length < 2 && poses[k]; k++) right.push(k)
  return [...left, ...right]
}

/** The polynomial through every `(ts[j], vs[j])`, evaluated at `t`. */
export function lagrange(ts: number[], vs: number[], t: number): number {
  let out = 0
  for (let j = 0; j < ts.length; j++) {
    let w = 1
    for (let k = 0; k < ts.length; k++) if (k !== j) w *= (t - ts[k]) / (ts[j] - ts[k])
    out += w * vs[j]
  }
  return out
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
