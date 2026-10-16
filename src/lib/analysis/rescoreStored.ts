/**
 * A saved report brought onto the current rubric from the readings it holds
 * (L3.11), when every scoring bump since it was saved only moved the card's
 * bands (`SCORING_KINDS`). Loaded on demand: the history hook asks for it only
 * when a report qualifies, which keeps the measuring code out of the first
 * screen.
 */
import { overallOf } from './coaching'
import { statusOf } from './geometry'
import { rescoreStoredCard } from './metrics'
import { SCORING_VERSION, rescorable, SCORING_KINDS } from './types'
import type { Session } from '../storage/db'

/**
 * The report re-scored and restamped, or nothing when it cannot be: already
 * current, or a measurement changed since it was saved — that history stays its
 * own era, as it always has.
 *
 * The verdict is kept as judged. A `card-bands` bump moves no diagnosis band,
 * which is what that kind promises.
 */
export function rescoreStoredSession(
  session: Session,
  kinds: Record<number, string> = SCORING_KINDS,
): Session | undefined {
  const from = typeof session.scoringVersion === 'number' ? session.scoringVersion : 1
  if (!rescorable(from, kinds)) return undefined
  const fundamentals = rescoreStoredCard(session.fundamentals, session.serveType ?? 'flat')
  const overall = overallOf(fundamentals)
  return { ...session, fundamentals, overall, overallStatus: statusOf(overall), scoringVersion: SCORING_VERSION }
}
