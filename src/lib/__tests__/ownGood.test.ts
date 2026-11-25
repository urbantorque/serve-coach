/**
 * Good on the player's own serve (C1.3): the latest earlier serve judged clean
 * of the fault, and never one the engine could not judge, the serve itself, or
 * one filmed after it.
 */
import { ownGoodLine } from '../ownGood'
import { cueIssues } from '../analysis/voice'
import type { FlawId } from '../analysis/flaws'
import type { Session } from '../storage/db'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 10, 22, 12).getTime()
const FLAW: FlawId = 'shallow_drop'

function serve(id: string, at: number, verdict: 'c' | 'n' | 'u'): Session {
  return {
    id,
    createdAt: at,
    triage: { status: 'ok' },
    diagnosis: { flaws: [{ flaw: FLAW, detected: verdict === 'n', confidence: verdict === 'u' ? 0.1 : 0.9 }] },
  } as unknown as Session
}

const NOWSERVE = { id: 'now', createdAt: NOW, serveType: 'flat' } as Session

heading('The player’s own serve that had it right')

check('the latest earlier clean serve, by its day', () => {
  const sessions = [serve('a', NOW - 20 * DAY, 'c'), serve('b', NOW - 2 * DAY, 'c'), serve('c', NOW - DAY, 'n')]
  const line = ownGoodLine(sessions, NOWSERVE, FLAW, NOW)!
  const weekday = new Date(NOW - 2 * DAY).toLocaleDateString(undefined, { weekday: 'long' })
  assert(line.includes(weekday), line)
  assert(cueIssues(line).length === 0, `${line}: ${cueIssues(line).join(', ')}`)
})

check('a serve earlier today says so', () => {
  const line = ownGoodLine([serve('a', NOW - 60 * 60 * 1000, 'c')], NOWSERVE, FLAW, NOW)!
  assert(line.includes('earlier today'), line)
})

check('nothing from a serve it couldn’t judge, the serve itself, or a later one', () => {
  const sessions = [serve('u', NOW - DAY, 'u'), serve('now', NOW, 'c'), serve('later', NOW + DAY, 'c'), serve('n', NOW - DAY, 'n')]
  assert(ownGoodLine(sessions, NOWSERVE, FLAW, NOW) === undefined, 'pointed at a serve that proves nothing')
  assert(ownGoodLine(undefined, NOWSERVE, FLAW, NOW) === undefined, 'no history, and a line anyway')
})

check('never a serve of another type, or one scored by older rules (W5.1)', () => {
  const kick = { ...serve('k', NOW - DAY, 'c'), serveType: 'kick' } as Session
  assert(ownGoodLine([kick], NOWSERVE, FLAW, NOW) === undefined, 'a kick met clean was offered as a flat serve’s proof')
  // Every other serve here is unstamped, so any stamp at all is another rulebook.
  const old = { ...serve('o', NOW - DAY, 'c'), scoringVersion: 99 } as Session
  assert(ownGoodLine([old], NOWSERVE, FLAW, NOW) === undefined, 'a serve scored by older rules was offered')
})

report()
