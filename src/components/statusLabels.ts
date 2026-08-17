import type { Status } from '../lib/analysis/types'

/**
 * What each score band is called on screen.
 *
 * In its own module rather than alongside the components that use it. A file that
 * exports both components and plain values is not a clean fast-refresh boundary:
 * editing anything in it forces a full page reload instead of a component swap,
 * and in this app a full reload throws away the analysis — thirty seconds of pose
 * detection on a video the page no longer has a handle to.
 */
export const STATUS_LABEL: Record<Status, string> = {
  great: 'Strong',
  good: 'Solid',
  // Not "Refine". Beside "Strong" and "Solid" — two plain judgements — a lone
  // abstract verb asks the player to work out what it is even rating.
  fair: 'Nearly there',
  // Not "Work on this": the report's one priority is headed "Work on this next",
  // and a fair report can tag five cards with it. The tag names the band; the
  // heading names the single thing to do about it.
  work: 'Needs work',
}

/**
 * How well the app could see this clip, said as what it did rather than a score.
 *
 * "68% confidence" invites arithmetic nobody performs: a player cannot act on
 * the difference between 68 and 74, and the figure reads as precision the
 * estimate does not have. Four phrases carry the only decision it feeds —
 * whether to trust the report or refilm.
 *
 * Phrased as the app reporting on itself, because the earlier set graded the
 * clip — "Sharp read" over "Clear read" — and those are the same word to
 * anybody not holding the ladder that separates them. Two of four bands may as
 * well not have existed.
 */
export function readQuality(confidence: number): string {
  if (confidence >= 0.8) return 'Saw it clearly'
  if (confidence >= 0.6) return 'Saw it well'
  if (confidence >= 0.4) return 'Saw it partly'
  return 'Struggled to see it'
}

/** Below this the read is hedged on screen rather than stated flat. */
export const SOFT_READ = 0.6

/**
 * Which of two paired serves may be shown as the better one — or neither.
 *
 * `FramePair` draws two serves side by side for two different callers, and only
 * one of them has a "better" to claim. The basket comparison does:
 * `ConsistencyPanel` builds its captions from `pair.best` and `pair.worst`, so
 * left is the higher score by construction. "Then, and now" does not: it orders
 * by date, because the whole point is showing what changed over six weeks
 * whichever direction it went, and a player whose serve has gone backwards has
 * their *worse* serve on the left.
 *
 * The component has said exactly this since it was written — `leftIsBetter` is
 * optional, and the screen-reader text is emitted only for the caller that
 * passes it. The stylesheet did not: `.pair-shots figure:first-child figcaption`
 * carried the accent unconditionally, so the progress sheet tinted the older,
 * worse serve as the good one about half the time, on the one screen built to
 * show somebody whether they are improving. Named in `FramePair.tsx` and in
 * `NEXT.md` since Phase 3 and left for a round allowed to move a pixel.
 *
 * So the claim now travels as a class rather than as a position, and this is
 * the function that decides it. Absent means neither caption is accented, which
 * is the case that was wrong; `false` accents the right-hand one, because a
 * boolean that is read in only one of its two states is a boolean waiting to be
 * misread by its next caller.
 */
export type PairRankModifier = '' | 'pair-shots--better-left' | 'pair-shots--better-right'

export function pairRankModifier(leftIsBetter?: boolean): PairRankModifier {
  if (leftIsBetter === undefined) return ''
  return leftIsBetter ? 'pair-shots--better-left' : 'pair-shots--better-right'
}

/**
 * One ungraded reading, said as a change between two serves.
 *
 * NO NUMBER IN IT, AND THAT IS THE ROUND'S ONE DEPARTURE FROM ITS OWN BRIEF.
 * R50 proposed "your shoulder laid back 18° further on serve 4 than on serve 1"
 * as the model of an honest sentence, and it is honest — but `voice.ts`'s `MATH`
 * rule fails any line carrying a figure in degrees, on the standing rule that a
 * readout says it in body language. The usual escape is `readoutOf`, and it is
 * shut here: `external_rotation_deg` has no ladder in `anatomy.ts` and cannot be
 * given one, because a ladder is a set of absolute stops and the whole reason
 * this reading is in `UNCALIBRATED` is that it has no zero to put stops around.
 *
 * So the direction ships and the magnitude does not. That is a smaller claim
 * than the round wanted and it is the largest one the app is entitled to make:
 * `uncalibratedDeltas` has already proved the change is bigger than the posture
 * that could fake it, which licenses "further" and nothing past it.
 *
 * `undefined` for an identifier this does not know, so a reading added to
 * `UNCALIBRATED` and pushed onto `Consistency` without a line here prints
 * nothing rather than something generic.
 */
export function uncalibratedLine(id: string, from: number, to: number): string | undefined {
  if (id === 'external_rotation_deg') {
    return `Your hitting shoulder laid back further on serve ${to} than on serve ${from}.`
  }
  return undefined
}
