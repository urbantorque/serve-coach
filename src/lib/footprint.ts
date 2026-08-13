/**
 * What one analysis is holding, in bytes.
 *
 * THE ASSERTION THIS REPLACES. The brief this codebase is worked to says no
 * component may hold more than about 500 MB on a phone, and that has been a
 * sentence in a document rather than a number anybody produced. A serve analysis
 * holds a decoded video, a pose graph in WASM, up to 120 sampled frames of 33
 * landmarks twice over, six JPEG stills as data URLs, and two canvases — and not
 * one of those had a figure against it.
 *
 * WHAT THIS CAN AND CANNOT SEE. It counts what lives on the JavaScript heap,
 * from the objects themselves, exactly. It cannot see the decoded video frames
 * the browser is holding for a `<video>` element, and it cannot see MediaPipe's
 * WASM heap — neither is reachable from script, and both are large. Those are
 * named in `UNSEEN` rather than estimated. A number that silently omitted them
 * while calling itself the footprint would be the same defect as a measurement
 * the app cannot stand behind, which is the rule this repo is built on.
 *
 * THE CONSTANTS ARE MEASURED, NOT GUESSED. `__tests__/footprint.test.ts`
 * allocates the real shapes and reads the heap, on every run, and fails if the
 * per-object cost has moved past a ratchet. It measures in Node, which is V8 —
 * the same engine Chrome runs, and not the one Safari runs. JavaScriptCore's
 * object layout differs and these figures are therefore an Android and desktop
 * reading. That is a limit on the number, not a reason not to have one.
 */
import type { Analysis, Frame } from './analysis/types'

/** MediaPipe Pose returns 33 landmarks, image and world. */
export const LANDMARKS_PER_FRAME = 33

/**
 * One `Landmark` on the heap.
 *
 * Four doubles is 32 bytes and this is 120, which is the thing worth knowing:
 * a landmark costs nearly four times its own numbers. V8 boxes each double into
 * a heap number rather than storing it in-object, because the fields are written
 * once from JSON-shaped data and the object never transitions to a
 * double-fields map. Two landmark arrays of 33 per frame means the arithmetic
 * below is dominated by this constant, and halving it would halve the resident
 * cost of an analysis — see the note in the test about what that would take.
 */
export const BYTES_PER_LANDMARK = 120

/**
 * One `Frame`, not counting its landmarks: the object, `index`, `t`,
 * `visibility`, and the two arrays' own headers.
 */
export const BYTES_PER_FRAME = 980

/** A string's own cost, on top of one byte per character for Latin-1 content. */
export const BYTES_PER_STRING = 24

/**
 * What is resident during an analysis and cannot be counted from script.
 *
 * Kept as prose because that is what it is: an honest list of the parts of the
 * answer this module does not have. Anything here that becomes measurable
 * should move out of this list and into the arithmetic, not stay as a hedge.
 */
export const UNSEEN: readonly string[] = [
  'the decoded video the browser holds for the <video> element',
  "MediaPipe's WASM heap, including the ~9 MB model",
  'the GPU-side copies of anything drawn to a canvas',
]

export interface Footprint {
  /** Bytes on the JavaScript heap, counted from the objects themselves. */
  frames: number
  stills: number
  total: number
  /** How many sampled frames the total is over, so a number can be read per frame. */
  frameCount: number
}

/** The heap cost of a run of sampled frames, from the count alone. */
export function frameBytes(count: number, landmarks = LANDMARKS_PER_FRAME): number {
  // Two landmark arrays per frame — image and world — each of `landmarks`.
  return count * (BYTES_PER_FRAME + 2 * landmarks * BYTES_PER_LANDMARK)
}

/**
 * The heap cost of the keyframe stills.
 *
 * Counted from the strings rather than from a count, because a data URL's length
 * is the whole of its cost and it varies by an order of magnitude with the
 * clip — a 4K still at quality 0.72 is not a 720p one. Base64 is Latin-1, so V8
 * holds one byte per character.
 */
export function stillBytes(stills: readonly (string | undefined)[]): number {
  let total = 0
  for (const s of stills) if (s) total += s.length + BYTES_PER_STRING
  return total
}

/** A canvas backing store: four bytes a pixel, plus whatever the compositor keeps. */
export function canvasBytes(width: number, height: number): number {
  return Math.max(0, Math.round(width)) * Math.max(0, Math.round(height)) * 4
}

/** What a finished analysis is holding. */
export function footprintOf(a: Pick<Analysis, 'frames' | 'phases'>): Footprint {
  const frames = frameBytes(a.frames.length)
  const stills = stillBytes(a.phases.map((p) => p.thumbnail))
  return { frames, stills, total: frames + stills, frameCount: a.frames.length }
}

/** Megabytes, rounded the way the rest of the app counts storage. */
export const mb = (bytes: number) => Math.round((bytes / 1e6) * 10) / 10

/**
 * The same accounting for a sweep, which holds one analysis per serve.
 *
 * A basket is where the ceiling is actually in play: a single serve is small and
 * eight of them are not, and the sweep keeps every one so the comparison can be
 * built from them.
 */
export function sweepFootprint(analyses: readonly Pick<Analysis, 'frames' | 'phases'>[]): Footprint {
  const each = analyses.map(footprintOf)
  return {
    frames: each.reduce((n, f) => n + f.frames, 0),
    stills: each.reduce((n, f) => n + f.stills, 0),
    total: each.reduce((n, f) => n + f.total, 0),
    frameCount: each.reduce((n, f) => n + f.frameCount, 0),
  }
}

/**
 * The most the countable half of the pipeline may hold, in bytes.
 *
 * A RATCHET, NOT A DEVICE LIMIT, and the difference matters. Nobody here has
 * measured a phone, and `UNSEEN` names three things larger than everything this
 * module counts. So this cannot be "the 500 MB constraint, divided" — that would
 * be arithmetic dressed as evidence. It is set at roughly six times today's
 * worst case, which leaves room for an honest change and fails on a change in
 * kind: another landmark set per frame, a serve cap raised past what a basket
 * needs, stills kept for every serve instead of two.
 *
 * If a real device reading ever exists, this becomes the smaller of the two and
 * the reasoning above gets deleted rather than qualified.
 */
export const HEAP_BUDGET_BYTES = 64e6

/**
 * The worst case the constants allow, rather than the worst case anybody has
 * seen.
 *
 * Read from `MAX_FINE_FRAMES` and `MAX_SERVES` themselves, so raising either
 * moves this number and the budget test is where that gets argued. A still is
 * passed in because its size is a property of the footage rather than of the
 * code — see `stillBytes`.
 */
export function worstCase(maxFrames: number, maxServes: number, stillChars: number): Footprint {
  const frames = frameBytes(maxFrames) * maxServes
  // Six keyframes a serve. The paired strip holds two serves' worth again, and
  // those are the same strings rather than copies, so they are not counted twice.
  const stills = maxServes * 6 * (stillChars + BYTES_PER_STRING)
  return { frames, stills, total: frames + stills, frameCount: maxFrames * maxServes }
}

/** A frame shaped like the real thing, for measuring and for tests. */
export function blankFrame(index: number, landmarks = LANDMARKS_PER_FRAME): Frame {
  const set = () =>
    Array.from({ length: landmarks }, () => ({ x: 0.5, y: 0.5, z: 0.5, visibility: 0.9 }))
  return { index, t: index / 30, image: set(), world: set(), visibility: 0.9 }
}
