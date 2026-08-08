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
import { clamp } from './geometry'
import type { Landmark } from './types'

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
  points: { x: number; y: number }[]
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
   * The scale the innovation has to be read against. A prediction error of two
   * centimetres is nothing on a hand crossing ten between frames and is the
   * whole motion on a hand crossing three — and which of those a clip produces
   * is decided by its frame rate, not by how good it is.
   */
  step: number
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
  const weights = new Array<number>(n)
  let seenSum = 0

  for (let i = 0; i < n; i++) {
    const p = track[i]
    xs[i] = p?.x ?? xs[i - 1] ?? 0
    ys[i] = p?.y ?? ys[i - 1] ?? 0
    const v = clamp(p?.visibility ?? 0, 0, 1)
    weights[i] = v
    seenSum += v
  }
  if (n === 0) return { points: [], innovation: 0, seen: 0, step: 0 }

  const fx = filterAxis(xs, times, weights, process, noise)
  const fy = filterAxis(ys, times, weights, process, noise)

  const reversed = [...times].reverse().map((t, _i, arr) => arr[0] - t + times[0])
  const bx = filterAxis([...fx.filtered].reverse(), reversed, [...weights].reverse(), process, noise)
  const by = filterAxis([...fy.filtered].reverse(), reversed, [...weights].reverse(), process, noise)
  const bxf = bx.filtered.reverse()
  const byf = by.filtered.reverse()

  const points = new Array<{ x: number; y: number }>(n)
  for (let i = 0; i < n; i++) {
    points[i] = { x: (fx.filtered[i] + bxf[i]) / 2, y: (fy.filtered[i] + byf[i]) / 2 }
  }

  const residuals: number[] = []
  const steps: number[] = []
  for (let i = 1; i < n; i++) {
    residuals.push(Math.hypot(fx.innovation[i], fy.innovation[i]))
    steps.push(Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
  }
  residuals.sort((a, b) => a - b)
  steps.sort((a, b) => a - b)

  return {
    points,
    innovation: residuals.length ? residuals[residuals.length >> 1] : 0,
    seen: n ? seenSum / n : 0,
    step: steps.length ? steps[steps.length >> 1] : 0,
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
 * The prediction error is read against the motion itself rather than against the
 * player's height, because frame rate decides both. Measured on the same serve,
 * the raw error at 120 fps is a tenth of what it is at 24 — not because the clip
 * is better but because there is a twentieth of a second less to be wrong about.
 * As a fraction of how far the hand travelled between samples it lands in the
 * same place at every rate, which is the only version of this number that can
 * carry a threshold. A clean track sits near a third; an incoherent one
 * approaches one, where the error is the size of the motion.
 */
export function blurOf(track: StabilisedTrack, bodyHeight: number): number {
  // A hand that is barely moving would divide by almost nothing, so the scale
  // has a floor: half a percent of standing height, which is under the tracker's
  // own jitter and therefore never the dominant term on a real swing.
  const scale = Math.max(track.step, 0.005 * Math.max(bodyHeight, 1e-6))
  const ratio = scale > 0 ? track.innovation / scale : 0
  const wildness = clamp((ratio - 0.35) / 0.45, 0, 1)
  const unseen = clamp((0.75 - track.seen) / 0.5, 0, 1)
  return clamp(Math.max(wildness, unseen * 0.9), 0, 1)
}
