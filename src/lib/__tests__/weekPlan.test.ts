/**
 * Graduation and re-test (L3.4), on seeded histories.
 *
 * The week plan keeps a fault until it graduates — clean on the ladder's bar
 * of its last six judged serves, across two trips — and then says so in one
 * line, with what is next. Every fourth trip after, it asks for a re-check.
 * The basket check runs against the fault being drilled, and a stuck fault is
 * sent to a coach only from the top of its ladder.
 */
import { drilledFault, weekPlan } from '../weekPlan'
import { FAULT_NAME, graduation, RECHECK_EVERY } from '../graduation'
import { CHECK_SERVES, checkDrill, progressionFor } from '../analysis/progressions'
import { practiceHeadline, type PracticeFocus } from '../practice'
import type { FlawId } from '../analysis/flaws'
import type { Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

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
    id: `serve-w${n++}-0`,
    createdAt: at,
    overall: 70,
    overallStatus: 'good',
    serveType: 'flat',
    scoringVersion: 5,
    fundamentals: [],
    phases: [],
    triage: named.length
      ? { status: 'ok', primary_flaw: { flaw: named[0], value: 0.5, target: [0.6, 1], signal: 's' } }
      : { status: 'ok' },
    diagnosis: { flaws: [...named.map((f) => finding(f, true)), ...clean.map((f) => finding(f, false))] },
  } as unknown as Session
}

/** A trip of `count` serves an hour apart, from `day`. */
const trip = (day: number, count: number, named: FlawId[], clean: FlawId[] = []) =>
  Array.from({ length: count }, (_, i) => serve(day * DAY + i * HOUR, named, clean))

/** Newest first, as `listSummaries` hands them back. */
const history = (...trips: Session[][]) => trips.flat().sort((a, b) => b.createdAt - a.createdAt)

const DROP: FlawId = 'shallow_drop'
const TOSS: FlawId = 'toss_height'
const pass = progressionFor(DROP)!.pass
note(`racket drop passes on ${pass} of ${CHECK_SERVES}`)

heading('A fault stays until it graduates')

check('a drilled fault the newest serve did not name is kept, and the hierarchy orders the plan', () => {
  const h = history(trip(0, 3, [DROP]), trip(3, 1, [TOSS], [DROP]))
  const plan = weekPlan(h, undefined, 4 * DAY)!
  note(plan.items.map((i) => `${i.flaw}${i.kept ? ' (kept)' : ''}`).join(', '))
  assert(plan.items[0].flaw === TOSS, 'the toss, higher in the hierarchy, did not lead')
  const drop = plan.items.find((i) => i.flaw === DROP)
  assert(drop?.kept === true, 'the racket drop was dropped the first time one serve missed it')
  assert(/two trips/.test(drop!.check), `the kept fault did not say why: "${drop!.check}"`)
})

check('one good trip is not a fix', () => {
  const h = history(trip(0, 3, [DROP]), trip(3, 6, [], [DROP]))
  assert(graduation(h, DROP) === undefined, 'six clean serves on one afternoon graduated')
  assert(weekPlan(h, undefined, 4 * DAY)!.items.some((i) => i.flaw === DROP), 'the fault left the plan')
})

check('clean across two trips, it graduates, leaves the plan, and earns one line', () => {
  const h = history(trip(0, 3, [DROP]), trip(3, 3, [], [DROP]), trip(6, 2, [], [DROP]), trip(6.5, 1, [TOSS], [DROP]))
  const g = graduation(h, DROP)
  note(JSON.stringify(g))
  assert(g !== undefined && g.clean >= pass && g.trips >= 2, 'it did not graduate')
  const plan = weekPlan(h, undefined, 7 * DAY)!
  assert(!plan.items.some((i) => i.flaw === DROP), 'a graduated fault stayed on the plan')
  const line = plan.graduated.find((x) => x.flaw === DROP)?.line
  note(line ?? 'no line')
  assert(
    line === `${FAULT_NAME[DROP]}: clean on 6 of your last 6 serves, over two trips. Next: the toss.`,
    `the line read "${line}"`,
  )
})

check('a relapse undoes it, and the fault is back', () => {
  const h = history(
    trip(0, 3, [DROP]),
    trip(3, 3, [], [DROP]),
    trip(6, 3, [], [DROP]),
    trip(9, 3, [DROP]),
  )
  assert(graduation(h, DROP) === undefined, 'three named serves out of six still counted as fixed')
  assert(weekPlan(h, undefined, 10 * DAY)!.items[0].flaw === DROP, 'the relapsed fault did not return to the plan')
})

heading('Re-checked every fourth trip')

check('the fourth trip after graduating asks for a re-check, and the third does not', () => {
  const graduated = [trip(0, 3, [DROP]), trip(3, 3, [], [DROP]), trip(6, 3, [], [DROP])]
  const after = (count: number) => Array.from({ length: count }, (_, i) => trip(9 + 3 * i, 1, [TOSS], [DROP]))
  const three = history(...graduated, ...after(2))
  // Two trips done since, so the coming one is the third: not yet.
  assert(weekPlan(three, undefined, 20 * DAY)!.recheck === undefined, 'a re-check came early')
  const four = history(...graduated, ...after(3))
  const plan = weekPlan(four, undefined, 20 * DAY)!
  note(plan.recheck?.line ?? 'no re-check')
  assert(plan.recheck?.flaw === DROP, 'the fourth trip did not ask for a re-check')
  // While that fourth trip is being played, it still asks.
  const playing = history(...graduated, ...after(4))
  const during = weekPlan(playing, undefined, (9 + 3 * 3) * DAY + HOUR)!
  assert(during.recheck?.flaw === DROP, 'the re-check vanished during the trip it was for')
  assert(RECHECK_EVERY === 4, 'the roadmap says every fourth trip')
})

heading('The basket is checked against the fault being drilled')

check('the drilled fault is the plan from before the report, not what the report names', () => {
  const before = history(trip(0, 3, [DROP]))
  const newest = serve(3 * DAY, [TOSS], [DROP])
  assert(drilledFault([newest, ...before], newest.createdAt) === DROP, 'the drilled fault was not the racket drop')
  // So the basket that cleared the drop can say it passed.
  const basket = Array.from({ length: CHECK_SERVES }, () => serve(3 * DAY, [TOSS], [DROP]))
  assert(checkDrill(DROP, basket)?.outcome === 'passed', 'a clean basket on the drilled fault did not pass')
  assert(drilledFault([], 0) === undefined, 'a first report invented a drilled fault')
})

heading('A coach only after the whole ladder')

check('a stuck fault with steps left is sent up its ladder, not to a coach', () => {
  const stuck = { label: 'Racket drop', verdict: 'stuck', drilled: 4, sessionsConsidered: 6, serveType: 'flat' } as PracticeFocus
  const midway = practiceHeadline({ ...stuck, rungsLeft: 2 })
  const top = practiceHeadline({ ...stuck, rungsLeft: 0 })
  const noLadder = practiceHeadline({ ...stuck, rungsLeft: undefined })
  note(midway)
  assert(!/Take this one to a coach/.test(midway) && /rest of its ladder/.test(midway), `midway: "${midway}"`)
  assert(/Take this one to a coach/.test(top), `on the top rung: "${top}"`)
  assert(/Take this one to a coach/.test(noLadder), `with no ladder: "${noLadder}"`)
})

report()
