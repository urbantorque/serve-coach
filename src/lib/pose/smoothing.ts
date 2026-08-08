import type { Landmark } from '../analysis/types'

/**
 * Light temporal smoothing for the skeleton overlay, applied only at render
 * time.
 *
 * MediaPipe's per-frame landmarks carry a few pixels of noise that the
 * measurement code already copes with by averaging a frame either side (see
 * `smoothedRacket`) — but the live skeleton draws one sampled frame at a
 * time with no such averaging, so that noise shows up as visible shake
 * during playback that the numbers never see.
 *
 * This filters the *drawn* points only. Never feed the output back into
 * `frame.image` or `frame.world`, and never let it touch anything the
 * analysis reads — those have to stay exactly what MediaPipe produced, or a
 * report would be scoring a smoothed pose it never actually saw.
 *
 * A One Euro filter rather than a fixed exponential average: a single alpha
 * gentle enough to settle standing-still jitter is also slow enough to
 * visibly lag a fast swing. One Euro adapts its cutoff to how fast the point
 * is currently moving, so a planted foot stops shaking while a whipping
 * wrist is barely touched.
 *
 * Reference: Casiez, Roussel & Vogel, "1€ Filter: A Simple Speed-based
 * Low-pass Filter for Noisy Input in Interactive Systems" (CHI 2012).
 */

function lowPass(prev: number | undefined, x: number, a: number): number {
  return prev === undefined ? x : prev + a * (x - prev)
}

function cutoffAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

/** One scalar channel of a One Euro filter. */
class OneEuroScalar {
  private x?: number
  private dx = 0

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
    private readonly dCutoff: number,
  ) {}

  next(value: number, dt: number): number {
    const dx = this.x === undefined ? 0 : (value - this.x) / dt
    const edx = lowPass(this.dx, dx, cutoffAlpha(this.dCutoff, dt))
    this.dx = edx
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    const smoothed = lowPass(this.x, value, cutoffAlpha(cutoff, dt))
    this.x = smoothed
    return smoothed
  }

  /** Jump straight to a value with no lag — used on a scrub, a step, or a loop. */
  snap(value: number): void {
    this.x = value
    this.dx = 0
  }
}

/**
 * Tuned empirically for normalised 0–1 landmark coordinates at typical
 * phone-video frame rates (24–60fps): `MIN_CUTOFF` settles near-static
 * jitter to under half its raw spread, and `BETA` is high enough that the
 * fastest joint in a serve — the hitting wrist through contact — lags the
 * true position by under ten milliseconds, well under one video frame.
 */
const MIN_CUTOFF = 1.2
const BETA = 8.0
const D_CUTOFF = 1.5

/**
 * Smooths a stream of landmark frames across time, for drawing only.
 *
 * Reused across frames of the same playback session: create one per player
 * instance and keep calling `frame()` as the video advances, so the filter's
 * notion of velocity is continuous. A jump backwards or a gap bigger than
 * half a second — a scrub, a frame step, or the clip looping — is treated as
 * a cut rather than motion, and the filter snaps to the raw pose instead of
 * dragging it across the screen.
 */
export class SkeletonSmoother {
  private xs: OneEuroScalar[] = []
  private ys: OneEuroScalar[] = []
  private lastT?: number
  private lastOut?: Landmark[]

  /**
   * Smooth one frame's landmarks. `t` is the frame's own timestamp in
   * seconds, so the filter's sense of speed matches real playback speed no
   * matter how often `frame()` happens to be called.
   */
  frame(points: readonly Landmark[], t: number): Landmark[] {
    const dt = this.lastT === undefined ? undefined : t - this.lastT

    // The rAF loop repaints the same sampled frame two to four times before
    // the video advances: identical timestamp, identical points. That is a
    // repaint, not motion — treating it as a discontinuity snapped the drawn
    // pose back to the raw landmarks once per sampled frame and zeroed the
    // filter's velocity, which disabled the smoothing in the only code path
    // that uses it.
    if (dt === 0 && this.lastOut && this.lastOut.length === points.length) {
      return this.lastOut
    }

    const discontinuous = dt === undefined || dt < 0 || dt > 0.5
    this.lastT = t

    if (this.xs.length !== points.length) {
      this.xs = points.map(() => new OneEuroScalar(MIN_CUTOFF, BETA, D_CUTOFF))
      this.ys = points.map(() => new OneEuroScalar(MIN_CUTOFF, BETA, D_CUTOFF))
    }

    const out: Landmark[] = new Array(points.length)
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      if (discontinuous) {
        this.xs[i].snap(p.x)
        this.ys[i].snap(p.y)
        out[i] = p
      } else {
        out[i] = {
          x: this.xs[i].next(p.x, dt as number),
          y: this.ys[i].next(p.y, dt as number),
          z: p.z,
          visibility: p.visibility,
        }
      }
    }
    this.lastOut = out
    return out
  }
}
