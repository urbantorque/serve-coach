/**
 * The drill check from serves recorded one at a time (N1.3).
 *
 * Record, glance, record: the route the app recommends on court. Each serve
 * was judged and saved, and none was ever pooled, so that route could never say
 * "move up a step". `tripDrillCheck` pools the trip's newest judged serves,
 * since the player last moved the ladder.
 */
import { canMoveUp, tripCheckLine, tripDrillCheck } from '../tripCheck'
import { CHECK_SERVES, progressionFor } from '../analysis/progressions'
import { cueIssues } from '../analysis/voice'
import type { FlawId } from '../analysis/flaws'
import type { Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

let n = 0
/** A report naming `named` (the first as its primary) and judging `clean` clean. */
function serve(at: number, named: FlawId[], clean: FlawId[] = []): Session {
  const finding = (flaw: FlawId, detected: boolean) => ({
    flaw,
    detected,
    signal: 's',
    value: 0.5,
    unit: 'ratio',
    miss: detected ? 0.2 : 0,
    target: [0.6, 1],
    target_tier: 4,
    severity: detected ? 'medium' : 'none',
    confidence: 0.9,
  })
  return {
    id: `serve-t${n++}-0`,
    createdAt: at,
    overall: 70,
    overallStatus: 'good',
    serveType: 'flat',
    scoringVersion: 5,
    fundamentals: [],
    phases: [],
    triage: named.length
      ? { status: 'ok', primary_flaw: { flaw: named[0], value: 0.5, target: [0.6, 1], signal: 's', severity: 'medium' } }
      : { status: 'ok' },
    diagnosis: { flaws: [...named.map((f) => finding(f, true)), ...clean.map((f) => finding(f, false))] },
  } as unknown as Session
}

const DROP: FlawId = 'shallow_drop'
const TOSS: FlawId = 'toss_height'
const need = progressionFor(DROP)!.pass

/** Last week's trip, which named the drop: the fault the player is drilling. */
const lastWeek = () => Array.from({ length: 4 }, (_, i) => serve(i * MIN, [DROP]))

/** Today's serves, three minutes apart, each either clean or named for the drop. */
const today = (pattern: ('c' | 'n')[], from = 7 * DAY) =>
  pattern.map((p, i) => serve(from + i * 3 * MIN, p === 'n' ? [DROP] : [TOSS], p === 'c' ? [DROP] : []))

heading('A drill check from serves recorded one at a time')

check('a trip with the bar of clean serves passes the step, and offers the move', () => {
  const pattern = Array.from({ length: CHECK_SERVES }, (_, i) => (i < need ? 'c' : 'n')) as ('c' | 'n')[]
  const serves = [...lastWeek(), ...today(pattern)]
  const c = tripDrillCheck(serves, serves[serves.length - 1])!
  note(`${c.flaw}: ${tripCheckLine(c)}`)
  assert(c.flaw === DROP, `checked ${c.flaw}, not the fault being drilled`)
  assert(c.outcome === 'passed' && canMoveUp(c), `outcome ${c.outcome}`)
  assert(c.read === CHECK_SERVES && c.clean === need, `${c.clean} of ${c.read}`)
})

check('a trip short of the bar says stay on this step', () => {
  const serves = [...lastWeek(), ...today(['c', 'n', 'n', 'c', 'n', 'n'])]
  const c = tripDrillCheck(serves, serves[serves.length - 1])!
  assert(c.outcome === 'not_yet' && !canMoveUp(c), `outcome ${c.outcome}`)
  assert(/Stay on this step/.test(tripCheckLine(c)), tripCheckLine(c))
})

check('too few judged serves asks for more, by how many', () => {
  const serves = [...lastWeek(), ...today(['c', 'c', 'c'])]
  const c = tripDrillCheck(serves, serves[serves.length - 1])!
  assert(c.outcome === 'unread', `outcome ${c.outcome}`)
  assert(tripCheckLine(c).includes(`Film ${CHECK_SERVES - 3} more serves`), tripCheckLine(c))
})

check('serves from another trip don’t count', () => {
  // Two days back: the app's trip is any run of serves under a day apart.
  const yesterday = today(['c', 'c', 'c'], 5 * DAY)
  const serves = [...lastWeek(), ...yesterday, ...today(['c', 'c', 'c'])]
  const c = tripDrillCheck(serves, serves[serves.length - 1])!
  assert(c.read === 3, `pooled ${c.read} serves across two days`)
})

check('serves filmed before the player moved up count for the step below, not this one', () => {
  const morning = today(['c', 'c', 'c', 'c', 'c', 'c'])
  const moved = morning[morning.length - 1].createdAt + MIN
  const after = today(['c', 'n'], moved + MIN)
  const serves = [...lastWeek(), ...morning, ...after]
  const c = tripDrillCheck(serves, serves[serves.length - 1], { [DROP]: 2 }, { [DROP]: moved })!
  assert(c.read === 2, `counted ${c.read} serves, including ones from before the move`)
  assert(c.rung === 2, `on rung ${c.rung}`)
})

check('only the newest six count, so a trip that faded hasn’t passed', () => {
  const serves = [...lastWeek(), ...today(['c', 'c', 'c', 'c', 'c', 'c', 'n', 'n', 'n', 'n', 'n', 'n'])]
  const c = tripDrillCheck(serves, serves[serves.length - 1])!
  assert(c.outcome === 'not_yet' && c.clean === 0, `${c.clean} clean, outcome ${c.outcome}`)
})

check('a drill chosen from the week plan is the one checked, over the plan\'s top (N1.4)', () => {
  // Today's serves name the toss and leave the drop clean; the plan's top is
  // the drop, but the player chose to check the toss.
  const serves = [...lastWeek(), ...today(['c', 'c', 'c'])]
  const c = tripDrillCheck(serves, serves[serves.length - 1], undefined, undefined, TOSS)!
  assert(c.flaw === TOSS, `checked ${c.flaw}`)
  assert(c.clean === 0 && c.read === 3, `${c.clean} of ${c.read}`)
})

check('a refused serve isn’t judged, and nothing is said from none', () => {
  const refused = { ...serve(7 * DAY, []), triage: { status: 'rejected' } } as unknown as Session
  assert(tripDrillCheck([refused], refused) === undefined, 'a check was built from a refused serve')
})

check('every line it can say passes the copy lint', () => {
  const lines = [
    tripCheckLine({ flaw: DROP, read: 6, clean: 5, need, outcome: 'passed', rung: 1, steps: 4, step: 'x', since: 0 }),
    tripCheckLine({ flaw: DROP, read: 6, clean: 5, need, outcome: 'passed', rung: 3, steps: 4, step: 'x', since: 0 }),
    tripCheckLine({ flaw: DROP, read: 6, clean: 2, need, outcome: 'not_yet', rung: 1, steps: 4, step: 'x', since: 0 }),
    tripCheckLine({ flaw: DROP, read: 2, clean: 2, need, outcome: 'unread', rung: 1, steps: 4, step: 'x', since: 0 }),
  ]
  for (const l of lines) {
    const issues = cueIssues(l)
    assert(issues.length === 0, `"${l}": ${issues.join('; ')}`)
  }
})

report()
