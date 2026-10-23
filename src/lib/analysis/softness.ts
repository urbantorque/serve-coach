/*
 * The confidence below which a reading is hedged, on its own (Q12).
 *
 * `confidence.ts` computes confidences and so imports the keyframes and the
 * camera read. A screen that only compares a stored confidence with this line
 * should not load those to do it, so the line lives here and `confidence.ts`
 * re-exports it.
 */

/** Below this a measurement is shown hedged and never becomes the focus. */
export const SOFT_MEASUREMENT = 0.55
