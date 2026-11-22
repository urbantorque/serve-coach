/**
 * What the landing says beside its real serve (Apex F; N7.6 before it).
 *
 * The landing plays an openly licensed clip of someone else's serve, read once
 * by the engine (`scripts/landing-serve.mjs`). Beside it, that read's own
 * number, first fix and the fix's drill. Written out, so the landing needs no
 * engine and no download; `landingServe.test.ts` rebuilds the read from the
 * card saved with it and fails the moment these drift from it, on a rubric
 * change included.
 */
export const LANDING_PEEK = {
  score: 79,
  fix: 'Hitting elbow at drop',
  drill: 'Overhead throws',
  reps: '15 throws',
} as const
