/**
 * Which clips are practice sessions (L2.4).
 *
 * Alone in a module because the app decides it the moment a clip is picked,
 * from the entry bundle, and the rest of the planning (`plan.ts`) brings the
 * serve scan's arithmetic with it.
 */

/** Clips longer than this are read as a session rather than a basket. */
export const SESSION_SECONDS = 150

/** Whether a clip of this length is read as a session. */
export const isSession = (duration: number): boolean => Number.isFinite(duration) && duration > SESSION_SECONDS
