/**
 * Practice sessions move the ladder (N1.5).
 *
 * A session's serves are judged line by line and were never counted anywhere a
 * drill moves: not the drill check, not graduation, not the week plan.
 */
import { sessionDrillCheck, sessionEvidence } from '../session/evidence'
import { graduation } from '../graduation'
import { progressionFor } from '../analysis/progressions'
import type { FlawId } from '../analysis/flaws'
import { SCORING_VERSION } from '../analysis/types'
import type { PracticeSession, ServeLine } from '../session/session'
import type { Session } from '../storage/db'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const DAY = 86_400_000
const DROP: FlawId = 'shallow_drop'

/** A saved report naming the drop: what makes it the fault being drilled. */
const named = (at: number) =>
  ({
    id: `serve-r${at}-0`,
    createdAt: at,
    overall: 70,
    fundamentals: [],
    phases: [],
    triage: { status: 'ok', primary_flaw: { flaw: DROP, value: 0.5, target: [0.6, 1], signal: 's', severity: 'medium' } },
    diagnosis: { flaws: [{ flaw: DROP, detected: true, severity: 'medium', confidence: 0.9 }] },
  }) as unknown as Session

/** A practice session whose serves were judged for the drop: `c` clean, `n` named, `u` unclear. */
function practice(at: number, pattern: string): PracticeSession {
  const lines: ServeLine[] = [...pattern].map((p, i) => ({
    number: i + 1,
    t: 20 * i,
    status: p === 'u' ? 'unclear' : 'read',
    judged: p === 'u' ? undefined : [DROP],
    named: p === 'n' ? [DROP] : [],
  }))
  return { id: `p${at}`, createdAt: at, lines } as unknown as PracticeSession
}

heading('Practice sessions as evidence for the ladder')

check('six clean judged serves in a practice pass the step of the fault being drilled', () => {
  const reports = [named(0), named(DAY)]
  const c = sessionDrillCheck(practice(8 * DAY, 'cccccc'), reports)!
  assert(c.flaw === DROP && c.outcome === 'passed', `${c.flaw} ${c.outcome}`)
  const short = sessionDrillCheck(practice(8 * DAY, 'cnncnn'), reports)!
  assert(short.outcome === 'not_yet', `a mostly-named practice was ${short.outcome}`)
  assert(sessionDrillCheck(practice(8 * DAY, 'uuu'), reports) === undefined, 'unclear serves were judged')
})

check('only the newest six count, and none from before the ladder moved', () => {
  const reports = [named(0)]
  const faded = sessionDrillCheck(practice(8 * DAY, 'ccccccnnnnnn'), reports)!
  assert(faded.clean === 0, `a practice that faded counted ${faded.clean} clean`)
  const moved = sessionDrillCheck(practice(8 * DAY, 'cccccc'), reports, { [DROP]: 2 }, { [DROP]: 8 * DAY + 50_000 })!
  assert(moved.read === 3, `counted ${moved.read} serves from either side of the move`)
})

check('a practice counts as one trip towards graduation, not one per serve', () => {
  const need = progressionFor(DROP)!.pass
  // One trip of reports naming the drop, then one practice of clean serves:
  // graduation wants two trips, so this is not yet a graduation.
  const reports = [named(0)]
  const evidence = sessionEvidence([practice(5 * DAY, 'c'.repeat(need + 4))])
  const trips = new Set(evidence.map((e) => Math.floor(e.createdAt / DAY)))
  assert(trips.size === 1, `one practice spread over ${trips.size} days`)
  assert(graduation([...reports, ...evidence], DROP) === undefined, 'one practice graduated a fault on its own')
  // The newest six judged serves have to span two trips: three clean from
  // each of two practices on two days does it.
  const stamped = (s: Session) => ({ ...s, scoringVersion: SCORING_VERSION }) as Session
  const both = sessionEvidence([practice(5 * DAY, 'cccccc'), practice(9 * DAY, 'ccc')])
  assert(graduation([stamped(named(0)), ...both], DROP) !== undefined, 'clean serves across two practices on two days did not graduate it')
  assert(both.every((e) => e.scoringVersion === SCORING_VERSION), 'evidence went unstamped, which cuts the rubric era')
})

report()
