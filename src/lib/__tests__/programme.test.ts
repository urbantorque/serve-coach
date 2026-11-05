/**
 * A programme with a goal: chosen for the player, moved by evidence, and honest
 * about a speed. Seeded histories for each rule, and the demo season at the end
 * for what a real one comes out as.
 */
import {
  GOAL_TITLE,
  SPEED_NOTE,
  SPEED_TITLE,
  WEEKS_PER_TRIP,
  chooseGoal,
  goalOptions,
  goalTitle,
  goalsReached,
  programmeFor,
  todayFor,
  type Programme,
} from '../programme'
import { COURT_MINUTES } from '../courtPlan'
import { GRADUATION_TRIPS } from '../graduation'
import { CADENCE_GAP_MS } from '../progress'
import { CHECK_SERVES, everyProgression, progressionFor } from '../analysis/progressions'
import { cueIssues } from '../analysis/voice'
import { weekPlan } from '../weekPlan'
import { sessionEvidence } from '../session/evidence'
import { DEFAULTS, type Prefs } from '../storage/prefs'
import type { FlawId } from '../analysis/flaws'
import type { PracticeSession } from '../session/session'
import type { ServeTag, Session } from '../storage/db'
import { sampleHistory } from '../../dev/sampleAnalysis'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = 200 * DAY

let n = 0
/** A report naming `named` (the first as primary) and judging `clean` clean, as `weekPlan.test.ts` builds them. */
function serve(at: number, named: FlawId[], clean: FlawId[] = [], ms?: number): Session {
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
    id: `serve-p${n++}-0`,
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
    ...(ms ? { speed: { speed: { ms, low: ms * 0.95, high: ms * 1.05, samples: 3, span: 0.05, depthAngle: 4 } } } : {}),
  } as unknown as Session
}

/** A trip of `count` serves an hour apart, from `day`. */
const trip = (day: number, count: number, named: FlawId[], clean: FlawId[] = [], ms?: number) =>
  Array.from({ length: count }, (_, i) => serve(day * DAY + i * HOUR, named, clean, ms))

/** Newest first, as `listSummaries` hands them back. */
const history = (...trips: Session[][]) => trips.flat().sort((a, b) => b.createdAt - a.createdAt)

const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULTS, speedUnit: 'kmh', ...over })

const DROP: FlawId = 'shallow_drop'
const TOSS: FlawId = 'toss_height'
const LEGS: FlawId = 'no_leg_drive'
const LOW: FlawId = 'low_contact'

/** Every player-facing string on a programme. */
const linesOf = (p: Programme): string[] => [
  p.title,
  p.why,
  p.pace,
  p.next,
  ...(p.note ? [p.note] : []),
  ...p.weeks.flatMap((w) => [w.title, w.check, w.know, w.drill.how]),
  ...p.today.map((b) => b.line),
]

const clean = (lines: string[]) => {
  for (const line of lines) {
    const issues = cueIssues(line)
    assert(issues.length === 0, `"${line}": ${issues.join('; ')}`)
    assert(!/—/.test(line), `an em dash in "${line}"`)
    assert(line[0] === line[0].toUpperCase(), `not sentence case: "${line}"`)
  }
}

heading('A goal chosen for the player')

check('no serves, no programme; the default goal is the plan\'s first fault, worst cause first', () => {
  assert(programmeFor([], prefs(), NOW) === undefined, 'a programme with nothing filmed')
  const h = history(trip(190, 3, [TOSS, DROP]))
  const p = programmeFor(h, prefs(), 191 * DAY)!
  const plan = weekPlan(h, undefined, 191 * DAY)!
  assert(p.goal.kind === 'fault' && p.goal.flaw === plan.items[0].flaw, 'the goal was not the plan\'s first fault')
  assert(p.title === GOAL_TITLE[TOSS] && !p.chosen, `title "${p.title}", chosen ${p.chosen}`)
  note(`${p.title}: ${p.why}`)
})

check('every goal has plain words of its own', () => {
  for (const title of [...Object.values(GOAL_TITLE), SPEED_TITLE, SPEED_NOTE]) clean([title])
  assert(new Set(Object.values(GOAL_TITLE)).size === Object.keys(GOAL_TITLE).length, 'two goals share a title')
  assert(goalTitle({ kind: 'fault', flaw: DROP }) === GOAL_TITLE[DROP], 'goalTitle read the wrong table')
})

heading('Weeks come from the ladder')

check('one row per rung from the player\'s own, then the hold across two trips', () => {
  const ladder = progressionFor(DROP)!
  const h = history(trip(190, 3, [DROP]))
  const p = programmeFor(h, prefs({ ladder: { [DROP]: 2 }, ladderMovedAt: { [DROP]: 150 * DAY } }), 191 * DAY)!
  note(p.weeks.map((w) => `${w.label} ${w.title} [${w.state}]`).join(' | '))
  const steps = p.weeks.filter((w) => w.kind === 'step')
  assert(steps[steps.length - 1].step!.at === ladder.steps.length, 'the ladder\'s last rung is missing')
  assert(p.weeks[p.weeks.length - 1].kind === 'hold', 'the last row was not the hold')
  assert(GRADUATION_TRIPS === 2, 'the copy says two trips')
  const current = p.weeks.find((w) => w.state === 'current')!
  assert(current === p.current && current.step!.at === 3, `current was ${current.title}`)
  assert(current.title === ladder.steps[2].name && current.drill.name === ladder.steps[2].name, 'the current row is not the player\'s rung')
  assert(current.filmed && /Film a basket of 6/.test(current.check), `the check read "${current.check}"`)
  assert(current.know.includes(`${ladder.pass} of ${CHECK_SERVES}`), `how to know read "${current.know}"`)
})

check('a step with nothing to film says so, and who judges it', () => {
  // Rung two of the racket drop is the ball in a sock: nothing served to read.
  const p = programmeFor(history(trip(190, 3, [DROP])), prefs({ ladder: { [DROP]: 1 } }), 191 * DAY)!
  assert(p.current.step!.at === 2 && !p.current.filmed, 'a self-checked step claimed a filmed check')
  assert(/Move up when/.test(p.current.check) && /judge this one yourself/.test(p.current.know), p.current.know)
})

check('a ladder the player never moved has nothing done on it', () => {
  const p = programmeFor(history(trip(190, 3, [DROP])), prefs(), 191 * DAY)!
  assert(p.weeks[0].state === 'current' && p.ratio === 0, `first row ${p.weeks[0].state}, ratio ${p.ratio}`)
  assert(p.weeks[0].step!.at === p.plan.items[0].step!.at, 'the programme and the week plan disagree on the rung')
  assert(!p.weeks.some((w) => w.state === 'done'), 'a medium fault starts on step two: step one was never passed')
})

check('a fault that eased from serious to medium has passed nothing by easing', () => {
  // Named serious first, so its ladder began on step one; medium now, so the
  // plan stands on step two. Nobody moved anything, and step one was never done.
  const serious = trip(180, 3, [DROP]).map((s) => ({
    ...s,
    diagnosis: { flaws: s.diagnosis!.flaws.map((f) => ({ ...f, severity: 'high' })) },
  })) as Session[]
  const p = programmeFor(history(serious, trip(190, 3, [DROP])), prefs(), 191 * DAY)!
  assert(p.weeks[0].state === 'current' && p.weeks[0].step!.at === 2, `${p.weeks[0].title}: ${p.weeks[0].state}`)
  assert(p.ratio === 0, `ratio ${p.ratio}`)
})

check('a moved ladder is done up to the rung, from where the fault started it', () => {
  const p = programmeFor(history(trip(190, 3, [DROP])), prefs({ ladder: { [DROP]: 3 } }), 191 * DAY)!
  const done = p.weeks.filter((w) => w.state === 'done')
  note(`done: ${done.map((w) => w.title).join(', ')}; ratio ${p.ratio.toFixed(2)}`)
  // Medium severity starts this ladder on rung 1: rungs 1 and 2 are the player's.
  assert(done.length === 2 && done[0].step!.at === 2, `done rows ${done.map((w) => w.step?.at).join()}`)
  assert(Math.abs(p.ratio - 2 / p.weeks.length) < 1e-9, `ratio ${p.ratio}`)
})

check('the player\'s cadence, stated or read, sets the labels and the estimate', () => {
  const h = history(trip(190, 3, [DROP]))
  const at = (cadence: Prefs['cadence']) => programmeFor(h, prefs({ cadence }), 191 * DAY)!
  for (const cadence of ['weekly', 'fortnightly', 'monthly'] as const) {
    const p = at(cadence)
    const span = WEEKS_PER_TRIP[cadence]
    assert(p.cadence === cadence && p.weeks[0].to - p.weeks[0].from + 1 === span, `${cadence}: ${p.weeks[0].label}`)
    assert(p.weeks[1].from === p.weeks[0].to + 1, `${cadence}: rows overlap`)
    note(`${cadence}: ${p.weeks.map((w) => w.label).join(', ')}. ${p.pace}`)
  }
  assert(at('monthly').weeks[0].label === 'Weeks 1 to 4', at('monthly').weeks[0].label)
  // Never said, and three visits a fortnight apart read as fortnightly.
  const spaced = history(trip(150, 2, [DROP]), trip(164, 2, [DROP]), trip(178, 2, [DROP]))
  assert(programmeFor(spaced, prefs(), 179 * DAY)!.cadence === 'fortnightly', 'the cadence was not read off the visits')
  assert(at('sometimes' as never).cadence === 'weekly', 'a stored cadence this build does not know was believed')
})

heading('Evidence moves it, not time')

check('a calendar never completes a week', () => {
  const h = history(trip(190, 3, [DROP]))
  const soon = programmeFor(h, prefs(), 191 * DAY)!
  const late = programmeFor(h, prefs(), 400 * DAY)!
  assert(JSON.stringify(soon.weeks) === JSON.stringify(late.weeks), 'time alone moved a row')
  assert(soon.ratio === late.ratio && soon.weeksLeft === late.weeksLeft, 'time alone moved the ratio')
})

check('falling behind says what is next and does not scold', () => {
  const h = history(trip(190, 3, [DROP]))
  const onTime = programmeFor(h, prefs(), 195 * DAY)!
  const late = programmeFor(h, prefs(), 190 * DAY + CADENCE_GAP_MS.weekly + DAY)!
  assert(!onTime.behind && late.behind, `on time ${onTime.behind}, late ${late.behind}`)
  note(`${onTime.next} / ${late.next}`)
  assert(late.next.includes(late.current.title), 'it did not say what is next')
  assert(!/miss|behind|late|overdue|should|fell|lost|again/i.test(late.next), `a scolding line: "${late.next}"`)
  // The same gap is on time for a monthly player.
  assert(!programmeFor(h, prefs({ cadence: 'monthly' }), 190 * DAY + CADENCE_GAP_MS.weekly + DAY)!.behind, 'a monthly player was called behind after ten days')
})

check('a practice session counts as a visit', () => {
  const h = history(trip(100, 3, [DROP]))
  const practice = [{ createdAt: 150 * DAY, updatedAt: 150 * DAY, lines: [{}] }]
  assert(programmeFor(h, prefs(), 151 * DAY)!.behind, 'the fixture meant a long gap')
  assert(!programmeFor(h, prefs(), 151 * DAY, [], { practice })!.behind, 'a practice session did not count as being on court')
})

check('passing a basket offers the move and does not make it: the ladder moves on the player\'s say-so', () => {
  const rung = 2 // Rung three is the first served step of this ladder.
  const moved = { ladder: { [DROP]: rung }, ladderMovedAt: { [DROP]: 150 * DAY } }
  const before = programmeFor(history(trip(160, 3, [DROP])), prefs(moved), 170 * DAY)!
  assert(before.moveUp === undefined, 'offered a move with no clean basket')
  const after = programmeFor(history(trip(160, 3, [DROP]), trip(170, 6, [], [DROP])), prefs(moved), 171 * DAY)!
  assert(after.moveUp?.from === rung && after.moveUp.to === rung + 1 && after.moveUp.flaw === DROP, JSON.stringify(after.moveUp))
  assert(after.current.step!.at === rung + 1, 'the row moved before the ladder did')
  const moving = { ladder: { [DROP]: rung + 1 }, ladderMovedAt: { [DROP]: 171 * DAY } }
  const next = programmeFor(history(trip(160, 3, [DROP]), trip(170, 6, [], [DROP])), prefs(moving), 172 * DAY)!
  assert(next.current.step!.at === rung + 2 && next.moveUp === undefined, 'moving the ladder did not move the row, or old serves passed the new step')
})

check('a step the player judges is theirs to call: a clean basket does not offer it', () => {
  // Rung two is the ball in a sock: no served ball, so nothing filmed speaks for it.
  const h = history(trip(160, 3, [DROP]), trip(170, 6, [], [DROP]))
  const p = programmeFor(h, prefs({ ladder: { [DROP]: 1 } }), 171 * DAY)!
  assert(p.title === GOAL_TITLE[DROP] && !p.current.filmed && p.moveUp === undefined, JSON.stringify(p.moveUp))
})

check('a serve the fault could not be judged on passes nothing', () => {
  const unread = trip(170, 6, [], [])
  const p = programmeFor(history(trip(160, 3, [DROP]), unread), prefs({ ladder: { [DROP]: 2 }, ladderMovedAt: { [DROP]: 165 * DAY } }), 171 * DAY)!
  assert(p.moveUp === undefined, 'serves that never judged the fault moved a step')
})

check('the top rung passed opens the hold, and the hold closes on two trips', () => {
  const last = progressionFor(DROP)!.steps.length - 1
  const top = { ladder: { [DROP]: last }, ladderMovedAt: { [DROP]: 165 * DAY } }
  const onTop = programmeFor(history(trip(160, 3, [DROP])), prefs(top), 170 * DAY)!
  assert(onTop.current.kind === 'step' && onTop.current.step!.at === last + 1, `on the top rung: ${onTop.current.title}`)
  const oneTrip = history(trip(160, 3, [DROP]), trip(170, 6, [], [DROP]))
  const holding = programmeFor(oneTrip, prefs(top), 171 * DAY)!
  assert(holding.current.kind === 'hold' && holding.goal.kind === 'fault', `after a clean basket: ${holding.current.title}`)
  assert(holding.weeks.filter((w) => w.kind === 'step').every((w) => w.state === 'done'), 'a step was left undone under the hold')
  note(holding.next)
  const twoTrips = history(trip(160, 3, [DROP]), trip(170, 3, [], [DROP]), trip(177, 3, [], [DROP]))
  const fixed = programmeFor(twoTrips, prefs(top), 178 * DAY)
  assert(fixed === undefined || fixed.goal.kind !== 'fault' || fixed.goal.flaw !== DROP, 'a graduated fault stayed the goal')
})

check('a fault off an old report with no ladder is still a goal, of one step and a hold', () => {
  const stale = serve(190 * DAY, [])
  ;(stale as { focus?: unknown }).focus = { flaw: 'arming_the_ball', title: 'The arm goes first', why: 'x', drill: { name: 'Old drill', how: 'Do it.', reps: '10' } }
  const p = programmeFor([stale], prefs(), 191 * DAY)!
  assert(p.goal.kind === 'fault' && p.goal.flaw === 'arming_the_ball', JSON.stringify(p.goal))
  assert(p.weeks.length === 2 && p.weeks[0].title === 'Old drill' && p.weeks[1].kind === 'hold', p.weeks.map((w) => w.title).join())
})

heading('A goal reached moves on by itself')

check('the next fault takes over, with nothing stored', () => {
  const h = history(trip(160, 3, [DROP, LOW]), trip(170, 3, [LOW], [DROP]), trip(177, 3, [LOW], [DROP]))
  const p = programmeFor(h, prefs(), 178 * DAY)!
  assert(p.goal.kind === 'fault' && p.goal.flaw === LOW, `the goal stayed ${JSON.stringify(p.goal)}`)
  const reached = goalsReached(h, prefs(), 178 * DAY)
  note(reached.map((g) => `${g.title} at day ${g.at / DAY}`).join())
  assert(reached.length === 1 && reached[0].goal.kind === 'fault' && reached[0].goal.flaw === DROP, JSON.stringify(reached))
})

check('a fault that was not the goal clearing is not a goal reached', () => {
  // The legs lead this plan; the racket drop clears beneath them.
  const h = history(trip(160, 3, [LEGS, DROP]), trip(170, 3, [LEGS], [DROP]), trip(177, 3, [LEGS], [DROP]))
  const reached = goalsReached(h, prefs(), 178 * DAY)
  assert(reached.length === 0, JSON.stringify(reached))
})

check('a practice session\'s judged serves count towards reaching it', () => {
  // Three, with the three clean report serves: six across two trips.
  const lines = Array.from({ length: 3 }, (_, i) => ({ number: i + 1, t: i * 20, status: 'read', named: [], judged: [DROP] }))
  const practice = [{ id: 'practice-a', createdAt: 177 * DAY, updatedAt: 177 * DAY, lines, scoringVersion: 5 }] as unknown as PracticeSession[]
  const h = history(trip(160, 3, [DROP, LOW]), trip(170, 3, [LOW], [DROP]))
  assert((programmeFor(h, prefs(), 178 * DAY)!.goal as { flaw: FlawId }).flaw === DROP, 'the fixture meant it not to have graduated')
  const p = programmeFor(h, prefs(), 178 * DAY, sessionEvidence(practice))!
  assert((p.goal as { flaw: FlawId }).flaw === LOW, 'the practice serves did not move the goal on')
})

check('a picked goal holds over the plan, ends when reached, and a relapse brings it back', () => {
  const chosen = chooseGoal({ kind: 'fault', flaw: DROP }, 165 * DAY)
  assert(chosen.goal?.kind === 'fault' && chosen.goal.flaw === DROP && chosen.goal.startedAt === 165 * DAY, JSON.stringify(chosen))
  const mixed = history(trip(160, 3, [TOSS, DROP]))
  const held = programmeFor(mixed, prefs(chosen), 166 * DAY)!
  assert((held.goal as { flaw: FlawId }).flaw === DROP && held.chosen && held.startedAt === 165 * DAY, 'the pick did not take')
  assert(held.why === 'You picked this one.', held.why)
  assert(held.plan.items[0].flaw === DROP && held.plan.items[1].flaw === TOSS, 'today does not lead with the goal')
  const clear = history(trip(160, 3, [TOSS, DROP]), trip(170, 3, [TOSS], [DROP]), trip(177, 3, [TOSS], [DROP]))
  const moved = programmeFor(clear, prefs(chosen), 178 * DAY)!
  assert((moved.goal as { flaw: FlawId }).flaw === TOSS && !moved.chosen, 'a reached pick did not move on')
  assert(goalsReached(clear, prefs(chosen), 178 * DAY).length === 1, 'a reached pick was not reached')
  const relapse = history(trip(160, 3, [TOSS, DROP]), trip(170, 3, [TOSS], [DROP]), trip(177, 3, [TOSS], [DROP]), trip(184, 3, [TOSS, DROP]))
  assert((programmeFor(relapse, prefs(chosen), 185 * DAY)!.goal as { flaw: FlawId }).flaw === DROP, 'a relapse did not undo it')
})

check('a pick this build cannot read is no pick at all', () => {
  const h = history(trip(190, 3, [DROP]))
  for (const goal of [{ kind: 'fault', flaw: 'nonsense', startedAt: 1 }, { kind: 'fault', flaw: 'pancake_contact', startedAt: 1 }, { kind: 'moon' }]) {
    const p = programmeFor(h, prefs({ goal: goal as Prefs['goal'] }), 191 * DAY)!
    assert(p.title === GOAL_TITLE[DROP] && !p.chosen, `${JSON.stringify(goal)} gave ${p.title}`)
  }
})

heading('A speed goal is the player\'s own range')

const flatTrip = (day: number, ms: number) => trip(day, 3, [DROP], [], ms)

check('offered only once a trip has given a typical first serve', () => {
  assert(!goalOptions(history(trip(190, 3, [DROP, TOSS])), prefs(), 191 * DAY).some((o) => o.goal.kind === 'speed'), 'offered with no reading')
  // One reading a trip is one serve, and one serve can be any serve.
  const thin = history([serve(190 * DAY, [DROP], [], 36)])
  assert(!goalOptions(thin, prefs(), 191 * DAY).some((o) => o.goal.kind === 'speed'), 'offered on a single reading')
  const options = goalOptions(history(flatTrip(190, 36)), prefs(), 191 * DAY)
  const speed = options.find((o) => o.goal.kind === 'speed')!
  assert(speed.title === SPEED_TITLE && /Not checked against a radar/.test(speed.line), speed.line)
  note(speed.line)
})

check('second serves stay out of it, as they do from the trend', () => {
  const trips = flatTrip(190, 30)
  const tags: ServeTag[] = trips.map((s) => ({ id: s.id, serveNumber: 2, taggedAt: s.createdAt }))
  assert(!goalOptions(trips, prefs(), 191 * DAY, [], { tags }).some((o) => o.goal.kind === 'speed'), 'second serves made a speed range')
})

check('picked, it is defined against the trip it started from, and always carries the radar line', () => {
  const h = history(flatTrip(180, 36))
  const start = goalOptions(h, prefs(), 181 * DAY).find((o) => o.goal.kind === 'speed')!
  const p = programmeFor(h, prefs(chooseGoal(start.goal, 181 * DAY)), 182 * DAY)!
  assert(p.goal.kind === 'speed' && p.chosen && p.note === SPEED_NOTE, JSON.stringify(p.goal))
  assert(p.goal.kind === 'speed' && p.goal.from.ms === 36, 'the bar is not the player\'s own trip')
  const last = p.weeks[p.weeks.length - 1]
  assert(last.kind === 'speed' && /range clears about/.test(last.know) && /likely/.test(last.know), last.know)
  // A range, never a promised number.
  assert(!/reach \d|hit \d|target/i.test(linesOf(p).join(' ')), 'a number was promised')
  note(`${p.title}: ${p.why}`)
  note(last.know)
})

check('reached only when a later trip\'s range clears it, not on an overlap, and not on one serve', () => {
  const picked = prefs(chooseGoal({ kind: 'speed', from: { ms: 0, low: 0, high: 0, at: 0 } }, 181 * DAY))
  const overlap = history(flatTrip(180, 36), flatTrip(190, 39))
  assert(programmeFor(overlap, picked, 191 * DAY)!.goal.kind === 'speed', 'a change inside the ranges reached the goal')
  assert(goalsReached(overlap, picked, 191 * DAY).length === 0, 'an overlap was a goal reached')
  const oneServe = history(flatTrip(180, 36), [serve(190 * DAY, [DROP], [], 50)])
  assert(programmeFor(oneServe, picked, 191 * DAY)!.goal.kind === 'speed', 'one fast serve reached the goal')
  const clear = history(flatTrip(180, 36), flatTrip(190, 42))
  const moved = programmeFor(clear, picked, 191 * DAY)!
  assert(moved.goal.kind === 'fault' && !moved.chosen, 'a cleared range did not move on')
  const reached = goalsReached(clear, picked, 191 * DAY)
  assert(reached[0]?.goal.kind === 'speed' && reached[0].cleared?.ms === 42, JSON.stringify(reached))
})

check('a slow climb still gets there, and a goal reached stays reached when the next trip is slower', () => {
  const picked = prefs(chooseGoal({ kind: 'speed', from: { ms: 0, low: 0, high: 0, at: 0 } }, 181 * DAY))
  // A twentieth a side: each trip overlaps the one before, and the third clears the first.
  const climb = history(flatTrip(180, 36), flatTrip(187, 38), flatTrip(194, 40))
  assert(goalsReached(climb, picked, 195 * DAY)[0]?.cleared?.ms === 40, 'a steady climb never reached it')
  const after = history(flatTrip(180, 36), flatTrip(190, 42), flatTrip(200, 35))
  assert(goalsReached(after, picked, 201 * DAY).length === 1, 'a slower trip took a reached goal back')
})

check('its weeks follow the plan\'s fault that costs speed, or the legs', () => {
  const picked = prefs(chooseGoal({ kind: 'speed', from: { ms: 0, low: 0, high: 0, at: 0 } }, 181 * DAY))
  const drop = progressionFor(DROP)!
  const toss = history(trip(180, 3, [TOSS, DROP], [], 36))
  const p = programmeFor(toss, picked, 181 * DAY)!
  assert(p.plan.items[0].flaw === DROP, `led by ${p.plan.items[0].flaw}`)
  assert(p.weeks[0].step!.of === drop.steps.length && p.weeks[0].title === drop.steps[1].name, p.weeks[0].title)
  const noSpeedFault = history(trip(180, 3, [TOSS], [], 36))
  const legs = progressionFor(LEGS)!
  const q = programmeFor(noSpeedFault, picked, 181 * DAY)!
  assert(q.plan.items[0].flaw === LEGS && q.weeks[0].step!.of === legs.steps.length, 'the leg drive ladder did not stand in')
  assert(q.today.some((b) => b.kind === 'check' && /first serves from the side/.test(b.line)), 'today\'s check did not ask for a speed')
})

check('with no fault left, speed is the goal the programme picks by itself', () => {
  const none = history(trip(180, 3, [], [], 36))
  const p = programmeFor(none, prefs(), 181 * DAY)!
  assert(p.goal.kind === 'speed' && !p.chosen, JSON.stringify(p.goal))
  // The bar moves up when a range clears it, and a stored nothing keeps it stable.
  const up = history(trip(180, 3, [], [], 36), trip(190, 3, [], [], 42))
  const q = programmeFor(up, prefs(), 191 * DAY)!
  assert(q.goal.kind === 'speed' && q.goal.from.ms === 42, JSON.stringify(q.goal))
  assert(goalsReached(up, prefs(), 191 * DAY)[0]?.cleared?.ms === 42, 'the clear was not a goal reached')
  const twice = history(trip(180, 3, [], [], 36), trip(190, 3, [], [], 42), trip(200, 3, [], [], 50))
  const r = programmeFor(twice, prefs(), 201 * DAY)!
  assert(r.goal.kind === 'speed' && r.goal.from.ms === 50, `the bar stopped at ${JSON.stringify(r.goal)}`)
  assert(goalsReached(twice, prefs(), 201 * DAY)[0]?.cleared?.ms === 50, 'the newest clear was not the one said')
  assert(programmeFor(history(trip(180, 3, [], [])), prefs(), 181 * DAY) === undefined, 'a goal out of nothing')
})

heading('Today, and what can be switched to')

check('today is the court plan with the goal first, at any length', () => {
  const h = history(trip(190, 3, [TOSS, DROP, LEGS]))
  const p = programmeFor(h, prefs({ courtMinutes: 30 }), 191 * DAY)!
  assert(p.minutes === 30, `minutes ${p.minutes}`)
  assert(p.today.reduce((s, b) => s + b.minutes, 0) === 30, 'today did not add up to the player\'s minutes')
  for (const m of COURT_MINUTES) {
    const blocks = todayFor(p, m)
    assert(blocks.reduce((s, b) => s + b.minutes, 0) === m, `${m} minutes added up wrong`)
    assert(blocks.find((b) => b.kind === 'drill')!.line.startsWith(p.plan.items[0].drill.name), 'the first drill is not the goal\'s')
  }
  const picked = programmeFor(h, prefs(chooseGoal({ kind: 'fault', flaw: LEGS }, 190 * DAY)), 191 * DAY)!
  assert(picked.today.find((b) => b.kind === 'drill')!.line.startsWith(picked.current.drill.name), 'a picked goal did not lead today')
})

check('a picked fault the plan has moved past still has a day', () => {
  const pick = prefs(chooseGoal({ kind: 'fault', flaw: 'posture_collapse' }, 190 * DAY))
  const p = programmeFor(history(trip(190, 3, [DROP])), pick, 191 * DAY)!
  assert(p.plan.items[0].flaw === 'posture_collapse' && p.plan.items[1].flaw === DROP, p.plan.items.map((i) => i.flaw).join())
})

check('the options are the plan\'s other faults, then speed, and never the goal in force', () => {
  const h = history(trip(190, 3, [TOSS, DROP, LEGS], [], 36))
  const options = goalOptions(h, prefs(), 191 * DAY)
  note(options.map((o) => `${o.title} (${o.line})`).join(' | '))
  assert(options.every((o) => !(o.goal.kind === 'fault' && o.goal.flaw === TOSS)), 'the goal in force was offered')
  assert(options[options.length - 1].goal.kind === 'speed' && options.length >= 2, 'speed did not come last')
  clean(options.flatMap((o) => [o.title, o.line]))
  // One tap: the first option, picked, is the programme.
  const tapped = programmeFor(h, prefs(chooseGoal(options[0].goal, 191 * DAY)), 191 * DAY)!
  assert(tapped.title === options[0].title, 'a tap did not change the goal')
  assert(!goalOptions(h, prefs(chooseGoal(options[options.length - 1].goal, 191 * DAY)), 191 * DAY).some((o) => o.goal.kind === 'speed'), 'speed was offered while it was the goal')
})

check('a re-check due is passed on from the week plan', () => {
  const graduated = [trip(0, 3, [DROP]), trip(3, 3, [], [DROP]), trip(6, 3, [], [DROP])]
  const after = Array.from({ length: 3 }, (_, i) => trip(9 + 3 * i, 1, [TOSS], [DROP]))
  const p = programmeFor(history(...graduated, ...after), prefs(), 20 * DAY)!
  assert(p.recheck?.flaw === DROP, JSON.stringify(p.recheck))
})

heading('The copy')

check('every line of every programme, on every rung of every ladder, passes the voice', () => {
  let lines = 0
  for (const [flaw, ladder] of everyProgression()) {
    for (let rung = 0; rung < ladder.steps.length; rung++) {
      for (const cadence of ['weekly', 'monthly'] as const) {
        const p = programmeFor(history(trip(190, 3, [flaw], [], 36)), prefs({ ladder: { [flaw]: rung }, cadence }), 300 * DAY)!
        clean(linesOf(p))
        lines += linesOf(p).length
      }
    }
    const speed = programmeFor(history(trip(190, 3, [flaw], [], 36)), prefs(chooseGoal({ kind: 'speed', from: { ms: 0, low: 0, high: 0, at: 0 } }, 191 * DAY)), 192 * DAY)!
    clean(linesOf(speed))
  }
  note(`${lines} lines read`)
})

heading('On the demo season')

;(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => null }) }
const season = sampleHistory(NOW)

check('the season comes out as a programme somebody could follow', () => {
  const p = programmeFor(season.sessions, prefs(), NOW)!
  note(`${p.title} (${p.chosen ? 'picked' : p.why}), ${p.cadence}, ratio ${p.ratio.toFixed(2)}`)
  for (const w of p.weeks) note(`${w.label} [${w.state}] ${w.title}: ${w.check} / ${w.know}`)
  note(`${p.next} ${p.pace}`)
  for (const b of p.today) note(`${b.minutes} min: ${b.line}`)
  note(goalOptions(season.sessions, prefs(), NOW).map((o) => `${o.title}: ${o.line}`).join(' | '))
  clean(linesOf(p))
  assert(p.goal.kind === 'fault', 'the season has faults to work on')
})

report()
