/**
 * Which kept serves stand beside this one in the studio (Apex E, "two or four
 * up"): the player's best, their last, and one from about a month before.
 *
 * Only serves whose clip is still on the device: a pane with nothing to play
 * is a hole in the grid. Each serve once, so a best that is also the last
 * serve is shown as the best, and the serve before it is not called the last. The
 * same serve type throughout, for the reason the delta keeps it: a kick beside
 * a flat serve shows the switch, not the player. A refused clip never, whose
 * read nobody believed.
 */
import { bestPriorTo } from './bestServe'
import { scoringVersionOf, typeOf } from './progress'
import type { Session } from './storage/db'

export type CompareWho = 'best' | 'last' | 'month'

export interface CompareSlot {
  who: CompareWho
  session: Session
}

const DAY_MS = 24 * 60 * 60 * 1000
/** "About a month before": the serve nearest thirty days earlier, and at least three weeks earlier. */
export const MONTH_BACK_MS = 30 * DAY_MS
export const MONTH_AT_LEAST_MS = 21 * DAY_MS

/**
 * Up to three earlier serves, in the order they are shown: best, last, a month
 * before. `kept` says whether a serve's clip is on this device.
 */
export function compareSet(sessions: Session[], shown: Session, kept: (s: Session) => boolean): CompareSlot[] {
  const type = typeOf(shown)
  const usable = (s: Session) =>
    s.id !== shown.id && s.createdAt < shown.createdAt && typeOf(s) === type && s.triage?.status !== 'rejected' && kept(s)
  const earlier = sessions.filter(usable).sort((a, b) => b.createdAt - a.createdAt)
  const out: CompareSlot[] = []
  const taken = (s: Session) => out.some((o) => o.session.id === s.id)

  // The best among the kept, on this rubric: the best overall may not have its clip.
  const best = bestPriorTo(earlier, shown.createdAt, type, scoringVersionOf(shown))
  if (best) out.push({ who: 'best', session: best })
  // The last serve, unless it is the best: the one before it is not "your last".
  const last = earlier[0]
  if (last && !taken(last)) out.push({ who: 'last', session: last })
  const target = shown.createdAt - MONTH_BACK_MS
  const month = earlier
    .filter((s) => !taken(s) && s.createdAt <= shown.createdAt - MONTH_AT_LEAST_MS)
    .sort((a, b) => Math.abs(a.createdAt - target) - Math.abs(b.createdAt - target))[0]
  if (month) out.push({ who: 'month', session: month })
  return out
}
