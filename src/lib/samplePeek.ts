/**
 * What the sample report says, for the landing (N7.6).
 *
 * The landing used to promise a fix and show a model serve with nothing on it.
 * It now shows the top of the sample report: its number, its first fix and
 * that fix's first drill. Written out, so the landing needs no engine and no
 * download; `samplePeek.test.ts` builds the sample report and fails the moment
 * these drift from it.
 */
export const SAMPLE_PEEK = {
  score: 75,
  fix: 'Your tossing arm comes down early',
  drill: 'Toss and point',
  reps: '15 tosses',
} as const
