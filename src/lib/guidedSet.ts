/**
 * A guided set (C1.1): a drill check filmed one serve at a time, hands-free,
 * with the phone on a bag and the app doing the talking.
 *
 * WHAT IT SAYS, AND WHEN. Once, before the first countdown: the step and its
 * spoken cue. After every serve, on the glance: whether that serve was clean of
 * the drill's one fault, with the count so far, and the cue again when it was
 * not. After the last: the result, and the loop back to the camera stops, so
 * the set has an end a player can hear.
 *
 * ONE FAULT ONLY. The read after a rep is the drill's target and nothing else.
 * The score, the speed and the report's first fix are all still on the screen
 * for anyone who walks up to it; said aloud between two serves they are three
 * things to think about where the drill asked for one.
 *
 * COUNTS, NEVER READINGS, the rule `tripCheckLine` keeps. A serve the engine
 * could not judge for this fault is said to be that, and is not counted either
 * way: telling a player "clean" on a serve nothing was read from would be the
 * app inventing progress.
 *
 * Pure, so every line it can say is tested against the copy rules.
 */
import { CHECK_SERVES, progressionFor, type Judged } from './analysis/progressions'
import type { FlawId } from './analysis/flaws'
import { tripCheckLine, type TripCheck } from './tripCheck'

/** Said before the first countdown of a guided set: the step, the count, the cue. */
export function setIntro(flaw: FlawId, step: string): string | undefined {
  const ladder = progressionFor(flaw)
  if (!ladder) return undefined
  return `${step}, ${CHECK_SERVES} serves. ${ladder.say}.`
}

/** Whether the set has an answer: passed, or past reaching the bar, or a full basket read. */
export const setDone = (check: TripCheck | undefined): boolean => !!check && check.outcome !== 'unread'

/**
 * The few words said after one serve of a guided set.
 *
 * `judged` is this serve against the drill's fault; `check` is the set so far,
 * this serve included, and absent when nothing in it could be judged yet.
 */
export function repLine(flaw: FlawId, judged: Judged, check: TripCheck | undefined): string | undefined {
  const ladder = progressionFor(flaw)
  if (!ladder) return undefined
  if (check && setDone(check)) return tripCheckLine(check)
  if (judged === 'unread') return `I could not judge that one for this drill, so it does not count. ${ladder.say}.`
  const so = check ? `, ${check.clean} of ${check.read} clean so far` : ''
  return judged === 'clean' ? `Clean${so}.` : `Not yet${so}. ${ladder.say}.`
}
