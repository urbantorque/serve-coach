/**
 * What good looks like on the player's own serve (C1.3): the latest earlier
 * serve the engine judged clean of a fault, named by its day.
 *
 * Clean, not "not named": a serve the engine could not judge for the fault
 * (`judgeServe` says `unread`) proves nothing either way, and is skipped. Only
 * serves before this one count, so a report never points at its own serve or
 * at one filmed after it.
 */
import type { FlawId } from './analysis/flaws'
import { judgeServe } from './analysis/progressions'
import { tripDay } from './progress'
import type { Session } from './storage/db'

export function ownGoodLine(
  sessions: readonly Session[] | undefined,
  now: { id: string; createdAt: number },
  flaw: FlawId,
  today: number = Date.now(),
): string | undefined {
  const clean = (sessions ?? [])
    .filter((s) => s.id !== now.id && s.createdAt < now.createdAt && judgeServe(s, flaw) === 'clean')
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  if (!clean) return undefined
  const day = tripDay(clean.createdAt, today)
  const when = day === 'today' ? 'earlier today' : `on ${day}`
  return `Your serve ${when} had this right, so your body can already do it.`
}
