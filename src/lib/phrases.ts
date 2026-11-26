/**
 * Phrases said in more than one place, said one way (E3.3).
 *
 * The drill check's verdict was written out in three files (the report, the
 * court screen, a practice video) and its button in four, and the tests that
 * held them copied the sentences again, so a wording change was a hunt across
 * seven files. Each phrase lives here once; the screens build their lines from
 * it, and the tests check for the constant, not for a copy of the sentence.
 *
 * Only phrases that are shared belong here. A line said in one place stays
 * beside the code that says it.
 */

/** The verdict on a step whose check came back clean enough. */
export const PASSED_STEP = 'You’ve passed this step.'
/** The same, on the ladder's last step, where there is nowhere to move up to. */
export const PASSED_LAST_STEP = 'You’ve passed the last step of this drill.'
/** The verdict on a step whose check did not. */
export const STAY_ON_STEP = 'Stay on this step for now.'
/** The button that moves a passed step up the ladder, wherever a pass is shown. */
export const MOVE_UP = 'Move up a step'

/** How many of the checked serves came back without the fault, and where. */
export const faultGone = (clean: number, read: number, where?: string): string =>
  `Fault gone on ${clean} of ${read} ${where === undefined ? 'so far' : `serves ${where}`}.`

/** A check still counting: what is left to film. */
export const filmMoreToCheck = (left: number): string =>
  `Film ${left} more ${left === 1 ? 'serve' : 'serves'} and I’ll tell you if you’ve passed this step.`

/** A visit to the court is a session (the owner's word, 2026-11-25), counted. */
export const sessions = (n: number): string => `${n} ${n === 1 ? 'session' : 'sessions'}`
