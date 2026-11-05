/**
 * Moments and the week's recap: what earns one, what cannot, and how long it
 * stays fresh. Seeded histories for each rule; the demo season at the end.
 */
import { MAX_MOMENTS, MOMENT_RANK, STREAK_MILESTONES, momentOn, momentsFor, weekRecap, type Moment } from '../moments'
import { chooseGoal, programmeFor } from '../programme'
import { CADENCE_GAP_MS } from '../progress'
import { REAL_CHANGE } from '../analysis/realChange'
import { METRICS } from '../analysis/coaching'
import { rungsOf } from '../analysis/anatomy'
import { progressionFor } from '../analysis/progressions'
import { cueIssues } from '../analysis/voice'
import { bodyBestLine } from '../bests'
import { FAULT_NAME, graduationLine } from '../graduation'
import { DEFAULTS, type Prefs } from '../storage/prefs'
import type { FlawId } from '../analysis/flaws'
import type { PracticeSession } from '../session/session'
import type { Session } from '../storage/db'
import type { TripRecord } from '../storage/ledger'
import { sampleHistory } from '../../dev/sampleAnalysis'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

let n = 0
interface Dials {
  named?: FlawId[]
  clean?: FlawId[]
  ms?: number
  overall?: number
  drop?: number
  refused?: boolean
}
function serve(at: number, d: Dials = {}): Session {
  const { named = [], clean = [] } = d
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
    id: `serve-m${n++}-0`,
    createdAt: at,
    overall: d.overall ?? 70,
    overallStatus: 'good',
    serveType: 'flat',
    scoringVersion: 5,
    fundamentals:
      d.drop === undefined
        ? []
        : [{ id: 'swing', score: 70, metrics: [{ id: 'dropDepth', label: 'Racket drop', value: d.drop, ideal: [-0.1, 0.3], confidence: 1, score: 70 }] }],
    phases: [],
    triage: d.refused
      ? { status: 'rejected' }
      : named.length
        ? { status: 'ok', primary_flaw: { flaw: named[0], value: 0.5, target: [0.6, 1], signal: 's' } }
        : { status: 'ok' },
    diagnosis: { flaws: [...named.map((f) => finding(f, true)), ...clean.map((f) => finding(f, false))] },
    ...(d.ms ? { speed: { speed: { ms: d.ms, low: d.ms * 0.95, high: d.ms * 1.05, samples: 3, span: 0.05, depthAngle: 4 } } } : {}),
  } as unknown as Session
}
const trip = (day: number, count: number, d: Dials = {}) => Array.from({ length: count }, (_, i) => serve(day * DAY + i * HOUR, d))
const history = (...trips: Session[][]) => trips.flat().sort((a, b) => b.createdAt - a.createdAt)
const prefs = (over: Partial<Prefs> = {}): Prefs => ({ ...DEFAULTS, speedUnit: 'kmh', ...over })

const DROP: FlawId = 'shallow_drop'
const LOW: FlawId = 'low_contact'
const LEGS: FlawId = 'no_leg_drive'

const kinds = (ms: Moment[]) => ms.map((m) => m.kind).join()
const has = (ms: Moment[], kind: Moment['kind']) => ms.find((m) => m.kind === kind)

const clean = (lines: string[]) => {
  for (const line of lines) {
    const issues = cueIssues(line)
    assert(issues.length === 0, `"${line}": ${issues.join('; ')}`)
    assert(!/—/.test(line), `an em dash in "${line}"`)
  }
}

heading('Each kind, and what it stands on')

check('nothing filmed, nothing to say', () => {
  assert(momentsFor([], prefs(), 10 * DAY).length === 0, 'a moment from nothing')
})

check('the first serve filmed is a moment, once', () => {
  const first = trip(100, 1)
  const m = momentsFor(first, prefs(), 100 * DAY + HOUR)
  assert(m.length === 1 && m[0].kind === 'first_serve', kinds(m))
  note(`${m[0].title}: ${m[0].body}`)
  assert(momentsFor(first, prefs(), 130 * DAY).length === 0, 'still fresh a month on')
  const ledger = [{ from: 50 * DAY, to: 50 * DAY }] as TripRecord[]
  assert(!has(momentsFor(first, prefs(), 100 * DAY + HOUR, [], { ledger }), 'first_serve'), 'a pruned history read as a first serve')
})

check('a fastest serve is a whole range above the holder, and never a first reading', () => {
  const quick = [serve(100 * DAY, { ms: 36 })]
  assert(!has(momentsFor(quick, prefs(), 100 * DAY + HOUR), 'fastest'), 'a first reading broke a record')
  const inside = history([serve(90 * DAY, { ms: 36 })], [serve(100 * DAY, { ms: 38 })])
  assert(!has(momentsFor(inside, prefs(), 100 * DAY + HOUR), 'fastest'), 'a higher figure inside the range was a record')
  const clear = history([serve(90 * DAY, { ms: 36 })], [serve(100 * DAY, { ms: 42 })])
  const m = has(momentsFor(clear, prefs(), 100 * DAY + HOUR), 'fastest')!
  note(`${m.title}: ${m.body}`)
  assert(/about|About/.test(m.body) && /likely/.test(m.body) && /Not checked against a radar/.test(m.body), m.body)
  assert(m.title === 'New fastest serve', m.title)
  const refused = history([serve(90 * DAY, { ms: 36 })], [serve(100 * DAY, { ms: 42, refused: true })])
  assert(!has(momentsFor(refused, prefs(), 100 * DAY + HOUR), 'fastest'), 'a refused report held the record')
})

check('a fault beaten holds across two trips, in the week plan\'s words, and a relapse takes it back', () => {
  const low = { named: [LEGS], clean: [DROP] }
  const oneTrip = history(trip(160, 3, { named: [LEGS, DROP] }), trip(170, 6, low))
  assert(!has(momentsFor(oneTrip, prefs(), 171 * DAY), 'fault'), 'one good afternoon beat a fault')
  const twoTrips = history(trip(160, 3, { named: [LEGS, DROP] }), trip(170, 3, low), trip(177, 3, low))
  const m = has(momentsFor(twoTrips, prefs(), 178 * DAY), 'fault')!
  note(`${m.title}: ${m.body}`)
  assert(m.body === graduationLine({ flaw: DROP, clean: 6, read: 6, trips: 2, since: 0 }, LEGS), m.body)
  const relapse = history(trip(160, 3, { named: [LEGS, DROP] }), trip(170, 3, low), trip(177, 3, low), trip(179, 3, { named: [LEGS, DROP] }))
  assert(!has(momentsFor(relapse, prefs(), 180 * DAY), 'fault'), 'a relapse kept its moment')
})

check('a fault named in passing and never planned is no fault beaten', () => {
  // Seen on one serve of many and never the plan's: clean is the ordinary state.
  const h = history(trip(150, 3, { clean: [DROP] }), trip(160, 3, { clean: [DROP] }), trip(170, 3, { clean: [DROP] }))
  assert(!has(momentsFor(h, prefs(), 171 * DAY), 'fault'), 'a fault nobody was told about was beaten')
})

check('the goal reached says so, in place of the fault that reached it', () => {
  const clear = { named: [LOW], clean: [DROP] }
  const h = history(trip(160, 3, { named: [DROP, LOW] }), trip(170, 3, clear), trip(177, 3, clear))
  const m = momentsFor(h, prefs(), 178 * DAY)
  note(m.map((x) => `${x.title}: ${x.body}`).join(' | '))
  assert(has(m, 'goal')?.title === 'Goal reached', kinds(m))
  assert(!has(m, 'fault'), 'the same news said twice')
  assert(has(m, 'goal')!.body.includes('Next:'), has(m, 'goal')!.body)
})

check('a speed goal reached reads as a range, with the radar line', () => {
  const p = prefs(chooseGoal({ kind: 'speed', from: { ms: 0, low: 0, high: 0, at: 0 } }, 181 * DAY))
  const h = history(trip(180, 3, { named: [DROP], ms: 36 }), trip(190, 3, { named: [DROP], ms: 42 }))
  const m = has(momentsFor(h, p, 191 * DAY), 'goal')!
  note(m.body)
  assert(/likely/.test(m.body) && /Not checked against a radar/.test(m.body), m.body)
})

check('a step passed needs a basket at its bar; a tap alone earns nothing', () => {
  const on = 3 // Left rung 2 (Let the racket fall), which the app reads.
  const passed = 171 * DAY
  const moved = prefs({ ladder: { [DROP]: on }, ladderMovedAt: { [DROP]: passed }, ladderPassedAt: { [DROP]: passed } })
  const basket = history(trip(160, 3, { named: [DROP] }), trip(170, 6, { clean: [DROP] }))
  const m = has(momentsFor(basket, moved, passed + HOUR), 'step')!
  const ladder = progressionFor(DROP)!
  note(m.body)
  assert(m.body.includes(ladder.steps[on - 1].name) && m.body.includes(ladder.steps[on].name), m.body)
  // The tap with no clean serves behind it: a fine thing to do, and no moment.
  const noBasket = history(trip(160, 3, { named: [DROP] }))
  assert(!has(momentsFor(noBasket, moved, passed + HOUR), 'step'), 'a tap alone made a moment')
})

check('a self-checked step moved up by the player\'s own word is no moment', () => {
  // Rung 1 of this ladder is the ball in a sock: nothing served to read.
  const passed = 171 * DAY
  const selfMoved = prefs({ ladder: { [DROP]: 2 }, ladderMovedAt: { [DROP]: passed }, ladderPassedAt: { [DROP]: passed } })
  assert(progressionFor(DROP)!.steps[1].check.by === 'self', 'the fixture meant rung two to be self-checked')
  const basket = history(trip(170, 6, { clean: [DROP] }))
  assert(!has(momentsFor(basket, selfMoved, passed + HOUR), 'step'), 'a self-checked step earned a moment')
})

check('a step taken back since is no moment', () => {
  const passed = 171 * DAY
  const back = prefs({ ladder: { [DROP]: 2 }, ladderMovedAt: { [DROP]: passed + HOUR }, ladderPassedAt: { [DROP]: passed } })
  assert(!has(momentsFor(history(trip(170, 6, { clean: [DROP] })), back, passed + 2 * HOUR), 'step'), 'a step back kept its moment')
})

check('a best trip beats every trip before it by more than the camera moves a trip', () => {
  const at = (overall: number) => history(trip(150, 3, { overall: 60 }), trip(160, 3, { overall: 64 }), trip(170, 3, { overall }))
  const inside = at(64 + REAL_CHANGE.trip - 1)
  assert(!has(momentsFor(inside, prefs(), 171 * DAY), 'best_trip'), 'a record inside the camera\'s floor')
  const past = at(64 + REAL_CHANGE.trip)
  const m = has(momentsFor(past, prefs(), 171 * DAY), 'best_trip')!
  note(`${m.title}: ${m.body}`)
  assert(/best trip yet/.test(m.body), m.body)
  const thin = history(trip(150, 3, { overall: 60 }), trip(160, 3, { overall: 64 }), trip(170, 2, { overall: 90 }))
  assert(!has(momentsFor(thin, prefs(), 171 * DAY), 'best_trip'), 'a trip of two set a best')
  const single = history(trip(170, 3, { overall: 90 }))
  assert(!has(momentsFor(single, prefs(), 171 * DAY), 'best_trip'), 'one trip is not a record')
})

check('a new body position is the one bests.ts names', () => {
  const h = history(trip(160, 3, { drop: -0.2 }), trip(170, 3, { drop: 0.18 }))
  const m = has(momentsFor(h, prefs(), 171 * DAY), 'body_best')!
  note(`${m.title}: ${m.body}`)
  assert(m.body === 'Racket drop: first trip at "Hand below the shoulder".', m.body)
  assert(!has(momentsFor(history(trip(160, 3, { drop: -0.2 }), trip(170, 3, { drop: -0.19 })), prefs(), 171 * DAY), 'body_best'), 'the same serve again set a best')
})

check('a streak speaks on its milestones and nowhere between', () => {
  const weekly = (count: number) => history(...Array.from({ length: count }, (_, i) => trip(100 + i * 7, 1)))
  const at = (count: number) => 100 * DAY + (count - 1) * 7 * DAY + HOUR
  assert(!has(momentsFor(weekly(2), prefs(), at(2)), 'streak'), 'two trips were a milestone')
  const three = has(momentsFor(weekly(3), prefs(), at(3)), 'streak')!
  note(`${three.title}: ${three.body}`)
  assert(three.title === '3 trips in a row', three.title)
  assert(!has(momentsFor(weekly(4), prefs(), at(4)), 'streak'), 'four trips were a milestone')
  assert(has(momentsFor(weekly(5), prefs(), at(5)), 'streak')?.title === '5 trips in a row', 'five trips went unsaid')
  assert(STREAK_MILESTONES[0] === 3, 'the first milestone moved')
  // Spaced for a monthly player, three visits run; a weekly reading would break it.
  const monthly = history(trip(100, 1), trip(130, 1), trip(160, 1))
  assert(!has(momentsFor(monthly, prefs({ cadence: 'weekly' }), 160 * DAY + HOUR), 'streak'), 'a broken weekly run was a streak')
  assert(has(momentsFor(monthly, prefs({ cadence: 'monthly' }), 160 * DAY + HOUR), 'streak') !== undefined, 'a monthly run went unsaid')
})

heading('Fresh, ranked and few')

check('at most two, the newest trip first, the biggest first within a trip', () => {
  // On one trip: the goal, a fastest serve and a body best.
  const clear = { named: [LOW], clean: [DROP] }
  const h = history(
    trip(160, 3, { named: [DROP, LOW], ms: 36, drop: -0.2 }),
    trip(170, 3, { ...clear, ms: 37, drop: -0.2 }),
    trip(177, 3, { ...clear, ms: 44, drop: 0.18 }),
  )
  const m = momentsFor(h, prefs(), 178 * DAY)
  note(m.map((x) => x.title).join(', '))
  assert(m.length === MAX_MOMENTS, `${m.length} moments`)
  assert(m[0].kind === 'goal' && m[1].kind === 'fastest', kinds(m))
  assert(MOMENT_RANK[0] === 'goal' && MOMENT_RANK[MOMENT_RANK.length - 1] === 'first_serve', 'the rank moved')
})

check('a fresher small thing goes above a staler big one', () => {
  const clear = { named: [LOW], clean: [DROP] }
  const h = history(
    trip(165, 3, { named: [DROP, LOW], ms: 36 }),
    trip(170, 3, clear),
    trip(174, 3, clear),
    trip(176, 3, { ...clear, ms: 44 }),
  )
  const m = momentsFor(h, prefs(), 177 * DAY)
  note(m.map((x) => `${x.title} day ${Math.round(x.at / DAY)}`).join(', '))
  assert(m[0].kind === 'fastest' && m[1].kind === 'goal', kinds(m))
})

check('a moment fades, and a slower cadence holds it for longer', () => {
  const h = history([serve(90 * DAY, { ms: 36 })], [serve(100 * DAY, { ms: 42 })])
  const m = has(momentsFor(h, prefs(), 100 * DAY + HOUR), 'fastest')!
  note(`fresh for ${m.freshMs / DAY} days`)
  assert(has(momentsFor(h, prefs(), 100 * DAY + m.freshMs - HOUR), 'fastest') !== undefined, 'gone before its time')
  assert(!has(momentsFor(h, prefs(), 100 * DAY + m.freshMs + HOUR), 'fastest'), 'still fresh past its time')
  const slow = has(momentsFor(h, prefs({ cadence: 'monthly' }), 100 * DAY + 25 * DAY), 'fastest')
  assert(slow !== undefined && slow.freshMs > m.freshMs, 'a monthly player never saw it')
  assert(momentsFor(h, prefs(), 200 * DAY).length === 0, 'something from three months ago is still news')
  assert(CADENCE_GAP_MS.monthly > CADENCE_GAP_MS.weekly, 'cadences reversed')
})

heading('The moment a report earned')

check('the first serve earns the first moment; the report may be unsaved', () => {
  const report = serve(100 * DAY)
  assert(momentOn(report, [])?.kind === 'first_serve', 'nothing on the first report')
  assert(momentOn(report, [report])?.kind === 'first_serve', 'the report in its own history hid the moment')
})

check('a report earns what it changed, and the next serve of the trip does not repeat it', () => {
  const before = trip(90, 2, { named: [DROP], ms: 36 })
  const fast = serve(100 * DAY, { named: [DROP], ms: 42 })
  assert(momentOn(fast, before, { prefs: prefs() })?.kind === 'fastest', 'the record-setting serve said nothing')
  const next = serve(100 * DAY + HOUR, { named: [DROP], ms: 42 })
  assert(momentOn(next, [fast, ...before], { prefs: prefs() }) === undefined, 'the same news on the next serve')
})

check('a trip\'s best lands on the serve that made it one, and only there', () => {
  const earlier = [...trip(150, 3, { overall: 60 }), ...trip(160, 3, { overall: 64 })]
  const a = serve(170 * DAY, { overall: 80 })
  const b = serve(170 * DAY + HOUR, { overall: 80 })
  const c = serve(170 * DAY + 2 * HOUR, { overall: 80 })
  const d = serve(170 * DAY + 3 * HOUR, { overall: 80 })
  assert(momentOn(b, [a, ...earlier])?.kind !== 'best_trip', 'a trip of two was a best')
  assert(momentOn(c, [b, a, ...earlier])?.kind === 'best_trip', 'the third serve did not say so')
  assert(momentOn(d, [c, b, a, ...earlier]) === undefined, 'the fourth said it again')
})

check('a report reopened later says what it earned then, not what is true now', () => {
  const fast = serve(100 * DAY, { ms: 42 })
  const faster = serve(120 * DAY, { ms: 52 })
  const before = trip(90, 2, { ms: 36 })
  assert(momentOn(fast, [faster, fast, ...before])?.kind === 'fastest', 'a later record took an earlier report\'s moment')
})

check('a refused clip earns nothing, and a step is never a report\'s', () => {
  assert(momentOn(serve(100 * DAY, { refused: true }), []) === undefined, 'a refused clip earned a moment')
  const passed = 99 * DAY
  const moved = prefs({ ladder: { [DROP]: 3 }, ladderMovedAt: { [DROP]: passed }, ladderPassedAt: { [DROP]: passed } })
  const h = trip(90, 6, { clean: [DROP] })
  const on = momentOn(serve(100 * DAY), h, { prefs: moved })
  assert(on?.kind !== 'step', 'a report claimed a step')
})

heading('The week back')

const TUE = (weeksAgo: number) => {
  const monday = new Date(2026, 10, 2, 12) // This week's Monday, a Thursday's now.
  monday.setDate(monday.getDate() - 7 * weeksAgo + 1)
  return monday.getTime()
}
const NOW = new Date(2026, 10, 5, 12).getTime()
const servesAt = (at: number, count: number, d: Dials = {}) => Array.from({ length: count }, (_, i) => serve(at + i * HOUR, d))

check('the last complete week with serves, never the week under way, and nothing when there is none', () => {
  assert(weekRecap([], prefs(), NOW) === undefined, 'a recap of nothing')
  assert(weekRecap(servesAt(TUE(0), 3), prefs(), NOW) === undefined, 'the week under way was recapped')
  const h = history(servesAt(TUE(0), 3), servesAt(TUE(1), 4), servesAt(TUE(1) + 2 * DAY, 2))
  const r = weekRecap(h, prefs(), NOW)!
  note(`${r.label}: ${r.line}`)
  assert(r.serves === 6 && r.trips === 2 && r.label === 'Last week', `${r.serves} serves on ${r.trips} trips, ${r.label}`)
  assert(r.from <= TUE(1) && r.to > TUE(1) + 2 * DAY && r.to - r.from > 6 * DAY, 'the wrong week')
  const further = weekRecap(history(servesAt(TUE(3), 2)), prefs(), NOW)!
  note(`${further.label}: ${further.line}`)
  assert(/^Week of/.test(further.label), further.label)
  assert(weekRecap(history(servesAt(TUE(20), 2)), prefs(), NOW) === undefined, 'a recap from months ago')
})

check('a practice session\'s serves count, and its trip, and its fastest serve', () => {
  const lines = [{ number: 1, t: 1, status: 'read', speed: { ms: 44, low: 41, high: 47 } }]
  const practice = [{ id: 'p', createdAt: TUE(1) + 3 * DAY, updatedAt: TUE(1) + 3 * DAY, found: [1, 2, 3, 4, 5], lines }] as unknown as PracticeSession[]
  const r = weekRecap(history(servesAt(TUE(1), 2, { ms: 36 })), prefs(), NOW, [], { practice })!
  assert(r.serves === 7 && r.trips === 2, `${r.serves} serves on ${r.trips} trips`)
  assert(r.bestSpeed?.ms === 44 && /likely/.test(r.bestSpeed.line) && /radar/.test(r.bestSpeed.line), JSON.stringify(r.bestSpeed))
  note(r.bestSpeed!.line)
})

check('no reading, no speed: a recap never makes one up', () => {
  assert(weekRecap(history(servesAt(TUE(1), 3)), prefs(), NOW)!.bestSpeed === undefined, 'a speed from nothing')
})

check('faults that moved are the ones past a coin toss', () => {
  // The toss's bar is five of six, so four clean serves move it and do not fix it.
  const TOSS: FlawId = 'toss_height'
  const before = servesAt(TUE(3), 4, { named: [TOSS] })
  const better = servesAt(TUE(1), 4, { clean: [TOSS] })
  const r = weekRecap(history(before, better), prefs(), NOW)!
  note(r.faults.map((f) => f.line).join(' | '))
  assert(r.faults.length === 1 && r.faults[0].moved === 'fewer' && r.faults[0].line.startsWith(FAULT_NAME[TOSS]), JSON.stringify(r.faults))
  const worse = weekRecap(history(servesAt(TUE(3), 4, { clean: [TOSS] }), servesAt(TUE(1), 4, { named: [TOSS] })), prefs(), NOW)!
  assert(worse.faults[0]?.moved === 'more', JSON.stringify(worse.faults))
  // One serve either way is a coin.
  const coin = weekRecap(history(servesAt(TUE(3), 4, { named: [TOSS] }), servesAt(TUE(1), 3, { named: [TOSS] }), servesAt(TUE(1) + DAY, 1, { clean: [TOSS] })), prefs(), NOW)!
  assert(coin.faults.length === 0, JSON.stringify(coin.faults))
  // Two serves each side is too few to say.
  const thin = weekRecap(history(servesAt(TUE(3), 2, { named: [TOSS] }), servesAt(TUE(1), 2, { clean: [TOSS] })), prefs(), NOW)!
  assert(thin.faults.length === 0, JSON.stringify(thin.faults))
})

check('a fault fixed that week is said as fixed, once', () => {
  const low = { named: [LOW], clean: [DROP] }
  const h = history(servesAt(TUE(4), 3, { named: [DROP, LOW] }), servesAt(TUE(2), 3, low), servesAt(TUE(1), 3, low))
  const r = weekRecap(h, prefs(), NOW)!
  const drop = r.faults.filter((f) => f.flaw === DROP)
  note(drop.map((f) => f.line).join(' | '))
  assert(drop.length === 1 && drop[0].moved === 'fixed', JSON.stringify(r.faults))
})

check('steps passed that week are named, and what is next is one sentence', () => {
  const at = TUE(1) + DAY
  const p = prefs({ ladder: { [DROP]: 3 }, ladderMovedAt: { [DROP]: at }, ladderPassedAt: { [DROP]: at } })
  const r = weekRecap(history(servesAt(TUE(1), 3, { named: [DROP] })), p, NOW)!
  assert(r.steps.length === 1 && r.steps[0].step === progressionFor(DROP)!.steps[2].name && r.steps[0].by === 'engine', JSON.stringify(r.steps))
  const self = prefs({ ladder: { [DROP]: 2 }, ladderMovedAt: { [DROP]: at }, ladderPassedAt: { [DROP]: at } })
  assert(weekRecap(history(servesAt(TUE(1), 3, { named: [DROP] })), self, NOW)!.steps[0].by === 'self', 'a step the player judged read as one the app did')
  assert(r.next === programmeFor(history(servesAt(TUE(1), 3, { named: [DROP] })), p, NOW)!.next, r.next ?? 'no next')
  note(r.next!)
})

heading('The copy')

check('every moment and recap line passes the voice', () => {
  const lines: string[] = []
  const take = (ms: Moment[]) => lines.push(...ms.flatMap((m) => [m.title, m.body]))
  // Every fault's fixed line, as the goal and as a fault beneath one.
  for (const flaw of Object.keys(FAULT_NAME) as FlawId[]) {
    if (!progressionFor(flaw)) continue
    const clear = { named: flaw === LOW ? [LEGS] : [LOW], clean: [flaw] }
    const h = history(trip(160, 3, { named: [flaw, ...clear.named] }), trip(170, 3, clear), trip(177, 3, clear))
    take(momentsFor(h, prefs(), 178 * DAY))
    const recap = weekRecap(h, prefs(), 177 * DAY + 9 * DAY)!
    lines.push(recap.line, ...recap.faults.map((f) => f.line))
  }
  // Every body best a card can name.
  for (const [id, metric] of Object.entries(METRICS)) {
    for (const rung of rungsOf(id)) lines.push(bodyBestLine({ metricId: id, label: metric.label ?? id, tag: rung.tag, at: 0 }))
  }
  note(`${lines.length} lines`)
  clean(lines)
})

heading('On the demo season')

;(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => null }) }
const SEASON_NOW = new Date(2026, 10, 5, 12).getTime()
const season = sampleHistory(SEASON_NOW)

check('the season says what a season would', () => {
  const moments = momentsFor(season.sessions, prefs(), SEASON_NOW)
  for (const m of moments) note(`${m.title}: ${m.body} (fresh ${m.freshMs / DAY} days)`)
  const recap = weekRecap(season.sessions, prefs(), SEASON_NOW)!
  note(`${recap.label}: ${recap.line}`)
  if (recap.bestSpeed) note(recap.bestSpeed.line)
  for (const f of recap.faults) note(`${f.moved}: ${f.line}`)
  note(recap.next ?? 'nothing next')
  clean(moments.flatMap((m) => [m.title, m.body]))
  clean([recap.line, ...recap.faults.map((f) => f.line), ...(recap.bestSpeed ? [recap.bestSpeed.line] : [])])
  const oldestFirst = [...season.sessions].sort((a, b) => a.createdAt - b.createdAt)
  const newest = oldestFirst[oldestFirst.length - 1]
  const on = momentOn(newest, oldestFirst.slice(0, -1), { prefs: prefs() })
  note(`on the newest report: ${on ? `${on.title}: ${on.body}` : 'nothing new'}`)
})

report()
