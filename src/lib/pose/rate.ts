/**
 * How fast a window of video gets read, and the two numbers that decide it.
 *
 * Split out of `extract.ts` rather than left there, and the reason is one line
 * in `detector.test.ts`: a value import of `extract.ts` "would pull
 * `document.createElement` into a Node bundle". `detector.ts` promises in its
 * own header to be DOM-free by construction, and it needs this rate — the whole
 * point of the shared pass is that there is one grid, and a second copy of this
 * arithmetic sitting in the vision layer is exactly the drift `Seconds` exists
 * to prevent.
 *
 * So the rate moved to a file with no imports at all. `extract.ts` re-exports
 * all three, so nothing that already reads them from there had to change.
 */

/**
 * The fastest a window is ever sampled.
 *
 * Phone video is almost universally 30 fps, so sampling faster than this
 * re-reads the same decoded frames at roughly 55 ms a piece and learns nothing.
 * Slow-motion footage still gets more samples through the swing, because it
 * spreads the same motion over more seconds of file. Sub-frame timing is
 * recovered analytically instead — see refineExtremum in phases.ts.
 *
 * Exported for the same reason `MAX_FINE_FRAMES` is: the two together decide
 * which of them binds, and `MAX_FINE_FRAMES / FINE_FPS` is the span either side
 * of which a different one does. A test that wants to say where the budget
 * starts binding has to say it in those terms rather than in the number 32,
 * which would go stale the moment either constant moved.
 */
export const FINE_FPS = 32

/**
 * The most frames one serve is ever extracted at.
 *
 * Exported because it is half of the resident cost of an analysis — `frames` is
 * the largest thing an `Analysis` holds in memory — and `footprint.ts` bounds
 * that cost against this rather than against a number copied out of it. Raising
 * it raises the memory budget, and the budget test is where that has to be
 * argued for.
 */
export const MAX_FINE_FRAMES = 120

/** Samples per second a window of this length will be read at. */
export const samplingRateFor = (span: number) =>
  Math.min(FINE_FPS, MAX_FINE_FRAMES / Math.max(0.2, span))
