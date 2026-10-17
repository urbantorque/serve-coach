/**
 * Noise that behaves like a tracker (L5.9), fitted on the pose bench.
 *
 * Every noise floor in this engine came from landmark jitter the suite chose:
 * `IN_PLANE`, 0.006 of the frame either way, which is 0.45% of standing
 * height per axis on the rig's player, independent from frame to frame, never
 * swapping a left for a right. Nothing measured it.
 *
 * MEASURED ON 500 LABELLED FRAMES (`bench.html`, ANALYSIS-REVIEW.md §7). The
 * labels are consecutive frames of real serves, so each landmark's error has a
 * history as well as a size. A model's residual against the labels mixes the
 * model's error with the labeller's. With two models on the same frames, three
 * pairwise differences give three variances, and those split three ways:
 *
 *     Var(MediaPipe − label) = M + L
 *     Var(RTMPose − label)   = R + L
 *     Var(MediaPipe − RTMPose) = M + R
 *
 * About each sequence's own mean, so a fixed offset (the hip conventions
 * differ) is not counted as noise. Assuming the three errors independent,
 * whatever the two models get wrong together lands in L, so M and R here are
 * floors on each model's error, not ceilings. The lag-1 autocovariance splits
 * the same way and gives each its own frame-to-frame correlation.
 *
 * The models are the ones the app runs: MediaPipe full on the crop the app's
 * own person detector finds (`det-mp-crop`, the whole clip), and RTMPose-s on
 * the same box (`det-rtm-s`, the swing's second read).
 *
 * THE FRAMES ARE ABOUT A TENTH OF A SECOND APART. The bench does not say; the
 * labelled racket wrist moves up to 40–68% of standing height between frames,
 * and a serve's racket wrist peaks near five standing heights a second, which
 * puts the spacing at 0.08–0.14 s. The correlation is carried to a clip's own
 * rate as an exponential decay from that spacing (`correlationAt`).
 */

/** One part of the body, by the bench's grouping. */
export type TrackedPart = 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle'

export interface TrackerFit {
  /** Error per axis, in standing heights. */
  sd: Record<TrackedPart, number>
  /** Correlation between consecutive bench frames, `BENCH_SPACING_S` apart. */
  benchRho: Record<TrackedPart, number>
  /** Share of frames whose left and right of this part came back swapped. */
  swap: Record<TrackedPart, number>
}

/** Seconds between consecutive labelled bench frames, from the wrist's travel. */
export const BENCH_SPACING_S = 0.1

/**
 * MediaPipe full on the detector's crop: the tracker every frame of a clip is
 * read with. Measured 2026-10-17 over 489 frames found on the right player.
 *
 * Swaps are against the labels, counted only where swapping the pair explains
 * at least half the straight error and the two are apart in the picture; some
 * are the labeller's, so these are ceilings.
 */
export const MEDIAPIPE_FIT: TrackerFit = {
  sd: { shoulder: 0.0087, elbow: 0.0205, wrist: 0.0174, hip: 0.0107, knee: 0.0137, ankle: 0.0124 },
  benchRho: { shoulder: 0.22, elbow: 0.13, wrist: 0.01, hip: 0.43, knee: 0.23, ankle: 0.25 },
  swap: { shoulder: 0.012, elbow: 0.01, wrist: 0.014, hip: 0.012, knee: 0.016, ankle: 0.037 },
}

/** RTMPose-s on the same box, for comparison: the swing's second read. */
export const RTMPOSE_FIT: TrackerFit = {
  sd: { shoulder: 0.0071, elbow: 0.0073, wrist: 0.014, hip: 0.008, knee: 0.006, ankle: 0.0087 },
  benchRho: { shoulder: 0.07, elbow: 0, wrist: 0.16, hip: 0.26, knee: 0.07, ankle: 0.03 },
  swap: { shoulder: 0.01, elbow: 0.008, wrist: 0.012, hip: 0.008, knee: 0.002, ankle: 0.016 },
}

/**
 * What `IN_PLANE` modelled, in the same terms: 0.006 of the frame either way
 * as the sum of two uniforms is 0.00245 of the frame per axis, on a player
 * 0.54 of the frame tall.
 */
export const IN_PLANE_SD = 0.006 / Math.sqrt(6) / 0.54

/**
 * Frame-to-frame correlation at a clip's own rate: the bench's lag-1
 * correlation decayed exponentially from its spacing to this one. Negative
 * bench figures are sampling noise about zero and read as none.
 */
export function correlationAt(benchRho: number, fps: number): number {
  if (!(benchRho > 0) || !(fps > 0)) return 0
  return Math.pow(benchRho, 1 / (fps * BENCH_SPACING_S))
}

/** MediaPipe's landmarks, by the part whose error each one carries. */
const PARTS: Record<TrackedPart, [number[], number[]]> = {
  // Left side, right side. The face takes the shoulders' spread, the hand the
  // wrist's and the foot the ankle's, and a swap moves a limb whole.
  shoulder: [[11, 1, 2, 3, 7, 9], [12, 4, 5, 6, 8, 10]],
  elbow: [[13], [14]],
  wrist: [[15, 17, 19, 21], [16, 18, 20, 22]],
  hip: [[23], [24]],
  knee: [[25], [26]],
  ankle: [[27, 29, 31], [28, 30, 32]],
}
/** The nose has no side; it takes the shoulders' spread, unswapped. */
const NOSE = 0

export interface TrackerOptions {
  fit: TrackerFit
  fps: number
  /** The player's standing height in the picture, in frame heights. */
  stature: number
  /** The same in the world skeleton, in metres. */
  statureM: number
  seed: number
  /** Depth error as a multiple of the in-plane error, as `DEPTH_MULTIPLIER` is. */
  depthMultiplier?: number
  /** A depth offset shared by the whole frame, half-width in frame heights, as `DEPTH_BIAS` is. */
  depthBias?: number
  /** Scales the fitted spread, for a sweep either side of it. */
  scale?: number
  /** Leaves the swaps out, to see what the spread alone does. */
  noSwaps?: boolean
}

/**
 * A clean filming with a tracker's error on it: each landmark's error carried
 * from frame to frame at the fitted correlation, its size the fitted spread,
 * and now and then a part's left and right traded whole. Image and world move
 * together, as a tracker's two outputs do.
 */
export function withTrackerNoise<F extends { image: { x: number; y: number; z: number; visibility?: number }[]; world: { x: number; y: number; z: number; visibility?: number }[] }>(
  frames: readonly F[],
  o: TrackerOptions,
): F[] {
  let s = o.seed >>> 0
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand())
  const toMetres = o.statureM / o.stature
  const depth = o.depthMultiplier ?? 1
  const scale = o.scale ?? 1
  // One error per landmark slot and axis, carried across frames.
  const state = new Map<number, [number, number, number]>()
  const step = (slot: number, sigma: number, rho: number): [number, number, number] => {
    const prev = state.get(slot)
    const fresh = Math.sqrt(1 - rho * rho)
    const next: [number, number, number] = prev
      ? [rho * prev[0] + fresh * sigma * gauss(), rho * prev[1] + fresh * sigma * gauss(), rho * prev[2] + fresh * sigma * depth * gauss()]
      : [sigma * gauss(), sigma * gauss(), sigma * depth * gauss()]
    state.set(slot, next)
    return next
  }

  return frames.map((f) => {
    const image = f.image.map((l) => ({ ...l }))
    const world = f.world.map((l) => ({ ...l }))
    const bias = o.depthBias ? ((rand() + rand()) / 2 - 0.5) * 2 * o.depthBias : 0
    const shift = (k: number, e: [number, number, number]) => {
      image[k] = { ...image[k], x: image[k].x + e[0], y: image[k].y + e[1], z: image[k].z + e[2] + bias }
      world[k] = {
        ...world[k],
        x: world[k].x + e[0] * toMetres,
        y: world[k].y + e[1] * toMetres,
        z: world[k].z + (e[2] + bias) * toMetres,
      }
    }
    for (const part of Object.keys(PARTS) as TrackedPart[]) {
      const [left, right] = PARTS[part]
      const sigma = o.fit.sd[part] * o.stature * scale
      const rho = correlationAt(o.fit.benchRho[part], o.fps)
      if (!o.noSwaps && rand() < o.fit.swap[part]) {
        for (let i = 0; i < left.length; i++) {
          const a = left[i]
          const b = right[i]
          ;[image[a], image[b]] = [image[b], image[a]]
          ;[world[a], world[b]] = [world[b], world[a]]
        }
      }
      // Each landmark its own error, at its part's spread, drawn after the
      // swap: the error belongs to the slot the tracker reported, not to the
      // limb it meant.
      for (const k of [...left, ...right]) shift(k, step(k, sigma, rho))
    }
    shift(NOSE, step(NOSE, o.fit.sd.shoulder * o.stature * scale, correlationAt(o.fit.benchRho.shoulder, o.fps)))
    return { ...f, image, world }
  })
}
