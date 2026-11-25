/**
 * A programme: one goal, and the weeks between here and reaching it.
 *
 * The week plan says what to do this week and stops there. A player on step two
 * of a ladder could not see that three more steps and a hold stood between them
 * and the fault being gone, or what any of it was for. This lays the road out,
 * and asks nothing to do it: the goal is the plan's first fault, worst cause
 * first; one tap changes it; and when it is reached the next takes over by
 * itself.
 *
 * WEEKS COME FROM THE LADDER. One row per rung still to pass, then the
 * graduation rule's hold across two trips, each row one trip's worth of work at
 * the player's own cadence: stated, or read off their visits. For each, the step,
 * its drill, the check and how the player will know.
 *
 * EVIDENCE MOVES IT, NOT TIME. A row is done because the ladder moved or the
 * basket came back clean, never because a calendar passed. The week numbers are
 * positions along the road, and a player three weeks late is on the same row
 * they were on, told what is next and nothing else.
 *
 * ONE SMALL THING IS STORED: the goal the player picked, and when (`Prefs.goal`).
 * Everything else is worked out from the history every time, so it cannot drift
 * from the ladders, and a relapse undoes a reached goal the way it undoes a
 * graduation, by itself. A player who never touches any of this stores nothing.
 *
 * A SPEED GOAL IS THE PLAYER'S OWN RANGE, NEVER A NUMBER. It is offered once a
 * trip has given a typical first serve, it is reached when a later trip's range
 * sits clear above that one, and it says it was not checked against a radar. The
 * test is `speedTrend`'s own, `apart` over `speedByTrip`, held against the trip
 * the goal started from rather than the trip before: two trips side by side
 * overlap on any gradual climb, so `speedTrend` alone would never call a month
 * of steady gain anything. Its weeks follow the ladder of the plan's fault that
 * costs racket speed, or the leg drive ladder when the plan has none.
 */
import {
  CHECK_SERVES,
  checkDrill,
  judgeServe,
  lastSeverity,
  progressionFor,
  rungFor,
  startingRung,
  stepCheckLine,
  type Progression,
  type Step,
} from './analysis/progressions'
import type { FlawId } from './analysis/flaws'
import { MAX_PLAN } from './analysis/verdict'
import { cue } from './analysis/voice'
import type { Drill } from './analysis/types'
import { courtPlan, type CourtBlock, type CourtMinutes } from './courtPlan'
import { GRADUATION_TRIPS, graduation, type Graduation } from './graduation'
import { SPEED_PLACEMENT } from './placement'
import { CADENCE_GAP_MS, CADENCE_WORDS, inferCadence, type Visitable } from './progress'
import { aboutSpeed, defaultSpeedUnit, type SpeedUnit } from './speedCopy'
import { apart, speedByTrip, type SpeedSummary } from './speedTrend'
import type { ServeTag, Session } from './storage/db'
import type { TripRecord } from './storage/ledger'
import type { Cadence, Prefs } from './storage/prefs'
import { drilledFault, weekPlan, type WeekItem, type WeekPlan } from './weekPlan'
import { MIN_TAGGED, clearlyMoreIn, inLine, secondInByTrip, type InRate } from './secondServe'

/** The range a speed goal has to clear: one trip's typical first serve. */
export type SpeedRange = Pick<SpeedSummary, 'ms' | 'low' | 'high' | 'at'>

export type Goal = { kind: 'fault'; flaw: FlawId } | { kind: 'speed'; from: SpeedRange } | { kind: 'second'; from: InRate }

export type WeekState = 'done' | 'current' | 'upcoming'

export interface ProgrammeWeek {
  /** "Week 3", or "Weeks 3 to 4" where a trip takes a fortnight. A position, never a date. */
  label: string
  /** The first and last week the row spans, from one. */
  from: number
  to: number
  /** A rung of the ladder, the hold that makes a fix count, or the trip that reads a speed. */
  kind: 'step' | 'hold' | 'speed' | 'second'
  state: WeekState
  /** Where the rung sits, on a step. */
  step?: { at: number; of: number }
  /** The row's name: the step's drill, or the hold. */
  title: string
  drill: Drill
  /** What to do to check it. */
  check: string
  /** Whether that check is a filmed one, or a bar the player holds themselves to. */
  filmed: boolean
  /** How the player will know. */
  know: string
}

export interface Programme {
  goal: Goal
  /** The goal in plain words. */
  title: string
  /** Why this one, in a line: chosen for them, or picked by them. */
  why: string
  /** The player picked it. Otherwise it is the plan's own. */
  chosen: boolean
  /** When they picked it. */
  startedAt?: number
  /** On a speed goal: what the figures are and are not. */
  note?: string
  cadence: Cadence
  weeks: ProgrammeWeek[]
  /** The row being worked on. */
  current: ProgrammeWeek
  /** Rows done over rows, 0 to 1. */
  ratio: number
  /** Weeks left if every remaining step takes one trip. */
  weeksLeft: number
  /** That, in words, with the condition it rests on. */
  pace: string
  /** What is next, in one line. */
  next: string
  /** Longer since the last visit than this player usually goes. Changes `next`, and only that. */
  behind: boolean
  /**
   * A basket has passed the step on and the ladder has not been moved. The
   * ladder moves only on the player's say-so, so the programme waits for it;
   * these are `moveLadder`'s arguments.
   */
  moveUp?: { flaw: FlawId; from: number; to: number }
  /** A retired fault due its re-check on this trip, from the week plan. */
  recheck?: WeekPlan['recheck']
  /** The week plan with the goal's drill first: what today is built from. */
  plan: WeekPlan
  minutes: CourtMinutes
  /** Today on court at `minutes`. `todayFor` gives it at another length. */
  today: CourtBlock[]
}

export interface GoalOption {
  goal: Goal
  title: string
  /** Where it would start from. */
  line: string
}

export interface GoalReached {
  goal: Goal
  title: string
  at: number
  /** The hold that reached a fault goal. */
  graduation?: Graduation
  /** The trip that reached a speed goal. */
  cleared?: SpeedSummary
  /** The trip whose second serves went in clearly more often (N4.3). */
  secondCleared?: InRate
}

/** What else a history can hold, beside the reports and practice evidence. */
export interface ProgrammeContext {
  /** The player's taps: a second serve stays out of a speed trip. */
  tags?: readonly ServeTag[]
  ledger?: readonly TripRecord[]
  practice?: readonly Visitable[]
}

/** Calendar weeks one trip to the court takes at each cadence. Labels, never a clock. */
export const WEEKS_PER_TRIP: Record<Cadence, number> = { weekly: 1, fortnightly: 2, monthly: 4 }

const DEFAULT_MINUTES: CourtMinutes = 45

/** Each fault's goal, in what the player would say they want. */
export const GOAL_TITLE: Record<FlawId, string> = {
  waiters_tray: 'Hold the racket like a hammer',
  toss_height: 'Toss to the right height',
  toss_drift: 'Toss up one straight line',
  toss_arm_drops: 'Keep your tossing arm up',
  contact_behind: 'Meet the ball in front of you',
  no_leg_drive: 'Push up with your legs',
  posture_collapse: 'Stay tall as you hit',
  shallow_drop: 'Let the racket fall behind you',
  collapsed_elbow: 'Throw the racket head up at the ball',
  early_shoulder_rotation: 'Stay sideways for longer',
  arming_the_ball: 'Let your body lead your arm',
  pancake_contact: 'Turn the strings through the ball',
  low_contact: 'Meet the ball at full stretch',
}

export const SPEED_TITLE = 'Serve faster than your usual range'

/** Every speed goal carries this: a reading from a video is not a radar's. */
export const SPEED_NOTE = 'My reading from your video, not checked against a radar.'

/** The faults that cost racket speed, where the hierarchy says so: the legs, then the racket drop. */
const SPEED_WORK: readonly FlawId[] = ['no_leg_drive', 'shallow_drop', 'collapsed_elbow']

const SPEED_DRILL: Drill = {
  name: 'First serves for speed',
  how: `Stand the phone ${SPEED_PLACEMENT.distance} back, ${SPEED_PLACEMENT.where}, and serve at full pace.`,
  reps: `${CHECK_SERVES} serves`,
}

/**
 * A second serve that goes in (N4.3): the trip's second serves the player
 * tagged in, beaten clearly by a later trip (`secondServe.ts`). The first goal
 * read off where the ball went, and only ever off the player's own taps.
 */
export const SECOND_TITLE = 'Get more second serves in'

export const SECOND_NOTE = 'From second serves you tagged in or out; I can’t see the court. Spin keeps a second serve in, and one camera can’t show spin.'

/** The faults a second serve misses with, where the plan has one: the toss, worst first. */
const SECOND_WORK: readonly FlawId[] = ['toss_drift', 'toss_arm_drops', 'toss_height']

const SECOND_DRILL: Drill = {
  name: 'Second serves, tagged',
  how: 'Serve a basket of second serves. After each, tap second serve and where it landed.',
  reps: `${MIN_TAGGED} second serves or more`,
}

export const goalTitle = (goal: Goal): string =>
  goal.kind === 'fault' ? GOAL_TITLE[goal.flaw] : goal.kind === 'speed' ? SPEED_TITLE : SECOND_TITLE

/** The patch that picks a goal: `writePrefs(chooseGoal(option.goal))`. */
export function chooseGoal(goal: Goal, now: number = Date.now()): Pick<Prefs, 'goal'> {
  return {
    goal: goal.kind === 'fault' ? { kind: 'fault', flaw: goal.flaw, startedAt: now } : { kind: goal.kind, startedAt: now },
  }
}

/** One history, read once for everything below. */
interface Reading {
  sessions: Session[]
  /** The reports and the practice serves together: what graduation and a basket count. */
  pool: Session[]
  prefs: Prefs
  now: number
  evidence: readonly Session[]
  week?: WeekPlan
  /** Each trip's typical first serve, oldest first. */
  trips: SpeedSummary[]
  /** Each trip's tagged second serves, in out of told, oldest first (N4.3). */
  seconds: InRate[]
  cadence: Cadence
  unit: SpeedUnit
  more: ProgrammeContext
}

/** The player's cadence: as they stated it, or read off their visits. */
export function cadenceOf(sessions: Session[], prefs: Prefs, more: ProgrammeContext = {}): Cadence {
  // A stored value this build does not know is no answer at all.
  return prefs.cadence && prefs.cadence in CADENCE_GAP_MS ? prefs.cadence : inferCadence(sessions, more.ledger, more.practice)
}

function reading(
  sessions: Session[],
  prefs: Prefs,
  now: number,
  evidence: readonly Session[],
  more: ProgrammeContext,
): Reading {
  return {
    sessions,
    pool: evidence.length ? [...sessions, ...evidence] : sessions,
    prefs,
    now,
    evidence,
    week: weekPlan(sessions, prefs.ladder, now, evidence),
    trips: speedByTrip(sessions, more.tags ?? []),
    seconds: secondInByTrip(sessions, more.tags ?? []),
    cadence: cadenceOf(sessions, prefs, more),
    unit: prefs.speedUnit ?? defaultSpeedUnit(),
    more,
  }
}

/** The goal the player picked, when this build can still read it and it has a ladder to walk. */
function picked(
  prefs: Prefs,
): { kind: 'speed' | 'second'; startedAt: number } | { kind: 'fault'; flaw: FlawId; startedAt: number } | undefined {
  const g = prefs.goal
  if (!g || typeof g.startedAt !== 'number') return undefined
  if (g.kind === 'speed' || g.kind === 'second') return g
  return g.kind === 'fault' && progressionFor(g.flaw as FlawId) ? (g as { kind: 'fault'; flaw: FlawId; startedAt: number }) : undefined
}

/**
 * Where a speed goal stands: the trip it started from, and the first later trip
 * whose range sits clear above it. Later, not newest: a goal reached stays
 * reached when the next trip comes back slower, and a noisy trip that overlaps
 * clears nothing.
 */
function speedFrom(trips: readonly SpeedSummary[], startedAt: number): { from: SpeedSummary; cleared?: SpeedSummary } {
  const before = trips.filter((t) => t.at <= startedAt)
  const from = before[before.length - 1] ?? trips[0]
  return { from, cleared: trips.find((t) => t.at > from.at && apart(t, from) === 'faster') }
}

/**
 * A speed goal nobody picked, once the plan has no fault left: from the first
 * trip, each time a range is cleared the bar moves to that trip. Stored nowhere,
 * so it needs no start, and it comes out the same every time it is worked out.
 */
function speedRun(trips: readonly SpeedSummary[]): { from: SpeedSummary; last?: { from: SpeedSummary; cleared: SpeedSummary } } {
  let at = speedFrom(trips, -Infinity)
  let last: { from: SpeedSummary; cleared: SpeedSummary } | undefined
  while (at.cleared) {
    last = { from: at.from, cleared: at.cleared }
    at = speedFrom(trips, at.cleared.at)
  }
  return { from: at.from, last }
}

const range = ({ ms, low, high, at }: SpeedSummary): SpeedRange => ({ ms, low, high, at })

/**
 * Where a second-serve goal stands: the trip it started from, and the first
 * later trip whose second serves went in clearly more often. Reached stays
 * reached, as a speed goal does.
 */
function secondFrom(seconds: readonly InRate[], startedAt: number): { from: InRate; cleared?: InRate } {
  const before = seconds.filter((t) => t.at <= startedAt)
  const from = before[before.length - 1] ?? seconds[0]
  return { from, cleared: seconds.find((t) => t.at > from.at && clearlyMoreIn(t, from)) }
}

/** The first fault in the plan: the default goal. */
const planFirst = (r: Reading): WeekItem | undefined => r.week?.items.find((i) => i.flaw)

/** The goal in force: the player's while it stands, then the plan's, then speed. */
function goalNow(r: Reading): { goal: Goal; chosen: boolean; startedAt?: number } | undefined {
  const choice = picked(r.prefs)
  if (choice?.kind === 'fault' && !graduation(r.pool, choice.flaw)) {
    return { goal: { kind: 'fault', flaw: choice.flaw }, chosen: true, startedAt: choice.startedAt }
  }
  if (choice?.kind === 'second' && r.seconds.length) {
    const at = secondFrom(r.seconds, choice.startedAt)
    if (!at.cleared) return { goal: { kind: 'second', from: at.from }, chosen: true, startedAt: choice.startedAt }
  }
  if (choice?.kind === 'speed' && r.trips.length) {
    const at = speedFrom(r.trips, choice.startedAt)
    if (!at.cleared) return { goal: { kind: 'speed', from: range(at.from) }, chosen: true, startedAt: choice.startedAt }
  }
  const first = planFirst(r)
  if (first?.flaw) return { goal: { kind: 'fault', flaw: first.flaw }, chosen: false }
  return r.trips.length ? { goal: { kind: 'speed', from: range(speedRun(r.trips).from) }, chosen: false } : undefined
}

/** Whether the newest basket of a fault's judged serves in a stretch of time reaches its ladder's bar. */
export function basketPassed(pool: readonly Session[], flaw: FlawId, since = -Infinity, until = Infinity): boolean {
  const judged = pool
    .filter((s) => s.createdAt >= since && s.createdAt <= until && judgeServe(s, flaw) !== 'unread')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-CHECK_SERVES)
  return judged.length > 0 && checkDrill(flaw, judged)?.outcome === 'passed'
}

/** The rung the player is on: the week plan's, so the two cannot disagree. */
function rungNow(r: Reading, flaw: FlawId, ladder: Progression, item?: WeekItem): number {
  return item?.step ? item.step.at - 1 : rungFor(flaw, ladder, r.prefs.ladder, lastSeverity(r.sessions, flaw))
}

/**
 * The rung a programme starts from. Nothing has been passed until the player
 * has moved the ladder: a ladder that begins on step two because the fault was
 * only slight does not get to say step one is done. Once it has moved, the road
 * starts where the fault's first grade started it.
 */
function startRung(r: Reading, flaw: FlawId, ladder: Progression, rung: number): number {
  const stored = r.prefs.ladder?.[flaw]
  if (stored === undefined || !ladder.steps[stored]) return rung
  const named = (s: Session) => s.diagnosis?.flaws.find((f) => f.flaw === flaw && f.detected)
  const first = [...r.sessions].sort((a, b) => a.createdAt - b.createdAt).find(named)
  return Math.min(rung, startingRung(ladder, first && named(first)?.severity))
}

/** A ladder for a fault that has none: one row, the report's own drill, at graduation's default bar. */
const oneStep = (item: WeekItem): Progression => ({
  cue: '',
  say: '',
  easier: '',
  mistake: '',
  pass: CHECK_SERVES - 1,
  steps: [{ ...item.drill, check: { by: 'engine' } }],
})

type Row = Omit<ProgrammeWeek, 'label' | 'from' | 'to'> & { trips: number }

/** How the player will know a step is passed. */
const knowLine = (ladder: Progression, step: Step): string =>
  step.check.by === 'engine'
    ? `I’ll say so on the report when ${ladder.pass} of ${CHECK_SERVES} come back without this fault.`
    : 'You judge this one yourself. I have no served ball to read on this step.'

const stepRow = (ladder: Progression, index: number, state: WeekState): Row => {
  const step = ladder.steps[index]
  return {
    kind: 'step',
    state,
    step: { at: index + 1, of: ladder.steps.length },
    title: step.name,
    drill: step,
    check: cue(stepCheckLine(ladder, step)),
    filmed: step.check.by === 'engine',
    know: knowLine(ladder, step),
    trips: 1,
  }
}

const holdRow = (ladder: Progression, state: WeekState): Row => ({
  kind: 'hold',
  state,
  title: 'Keep it fixed for two sessions',
  drill: ladder.steps[ladder.steps.length - 1],
  check: `Film ${CHECK_SERVES} serves in each of two sessions.`,
  filmed: true,
  know: `I call it fixed when ${ladder.pass} of your last ${CHECK_SERVES} serves come back without this fault, across two sessions.`,
  trips: GRADUATION_TRIPS,
})

const secondRow = (from: InRate, state: WeekState): Row => ({
  kind: 'second',
  state,
  title: 'Tag your second serves',
  drill: SECOND_DRILL,
  check: `Tag at least ${MIN_TAGGED} second serves, and where each landed.`,
  filmed: false,
  know: cue(`You will know when your second serves go in clearly more often than ${inLine(from)} in a session.`),
  trips: 1,
})

const speedRow = (from: SpeedRange, unit: SpeedUnit, state: WeekState): Row => ({
  kind: 'speed',
  state,
  title: 'Film your speed',
  drill: SPEED_DRILL,
  check: `Film ${CHECK_SERVES} first serves from the side.`,
  filmed: true,
  know: `You will know when you serve clearly faster than this in a session: ${aboutSpeed(from, unit)}.`,
  trips: 1,
})

/** A ladder as rows, from the player's rung, with the last row left to the goal. */
function ladderRows(
  r: Reading,
  flaw: FlawId,
  ladder: Progression,
  rung: number,
  closing: (state: WeekState) => Row,
): { rows: Row[]; moveUp?: Programme['moveUp'] } {
  const last = ladder.steps.length - 1
  const since = r.prefs.ladderMovedAt?.[flaw] ?? -Infinity
  // Evidence, not a tap: the top rung has no step to move to, so its passing
  // basket is what opens the row after it.
  const passed = basketPassed(r.pool, flaw, since)
  const closed = rung === last && passed
  const rows: Row[] = []
  for (let i = startRung(r, flaw, ladder, rung); i <= last; i++) {
    rows.push(stepRow(ladder, i, i < rung || closed ? 'done' : i === rung ? 'current' : 'upcoming'))
  }
  rows.push(closing(closed ? 'current' : 'upcoming'))
  const canMove = rung < last && passed && ladder.steps[rung].check.by === 'engine'
  return { rows, ...(canMove ? { moveUp: { flaw, from: rung, to: rung + 1 } } : {}) }
}

/** The plan with this item first, every other fix after it in the plan's own order. */
function planWith(r: Reading, item: WeekItem): WeekPlan {
  const rest = (r.week?.items ?? []).filter((i) => i.flaw !== item.flaw)
  const from = r.week?.from ?? [...r.sessions].sort((a, b) => b.createdAt - a.createdAt)[0]
  return { graduated: [], ...r.week, from, items: [item, ...rest].slice(0, MAX_PLAN) }
}

/** The goal's item in the week plan, or one built from its ladder when the plan has moved past it. */
function itemFor(r: Reading, flaw: FlawId): { item: WeekItem; ladder: Progression; rung: number } {
  const planned = r.week?.items.find((i) => i.flaw === flaw)
  // Only a fault off an old report can lack a ladder, and only the plan can hold one.
  const ladder = progressionFor(flaw, planned?.axis) ?? oneStep(planned!)
  const rung = rungNow(r, flaw, ladder, planned)
  const step = ladder.steps[rung]
  return {
    ladder,
    rung,
    item: planned ?? {
      title: GOAL_TITLE[flaw],
      flaw,
      drill: step,
      step: { at: rung + 1, of: ladder.steps.length },
      check: cue(stepCheckLine(ladder, step)),
    },
  }
}

/** The ladder a speed goal works up: the plan's fault that costs speed, or the legs. */
function speedWork(r: Reading): FlawId {
  return r.week?.items.find((i) => i.flaw && SPEED_WORK.includes(i.flaw))?.flaw ?? 'no_leg_drive'
}

/** The ladder a second-serve goal works up: the plan's toss fault, or its first fault, or the toss. */
function secondWork(r: Reading): FlawId {
  const items = r.week?.items ?? []
  return items.find((i) => i.flaw && SECOND_WORK.includes(i.flaw))?.flaw ?? items.find((i) => i.flaw)?.flaw ?? 'toss_drift'
}

/** The newest evidence that the player has been on court. */
function lastVisit(r: Reading): number {
  return Math.max(
    -Infinity,
    ...r.pool.map((s) => s.createdAt),
    ...(r.more.ledger ?? []).map((t) => t.to),
    ...(r.more.practice ?? []).map((p) => p.updatedAt),
  )
}

/** What is next, in one line. Never how late it is. */
function nextLine(row: ProgrammeWeek, behind: boolean): string {
  const what = row.kind === 'step' ? `${row.title}, step ${row.step!.at} of ${row.step!.of}` : row.title.toLowerCase()
  return cue(behind ? `Pick up where you left off: ${what}.` : `Next on court: ${what}.`)
}

function paceLine(weeksLeft: number, cadence: Cadence): string {
  const left = weeksLeft === 1 ? 'a week' : `${weeksLeft} weeks`
  return cue(`About ${left} left if you get to the court ${CADENCE_WORDS[cadence]} and pass a step each time.`)
}

function whyLine(goal: Goal, chosen: boolean, unit: SpeedUnit): string {
  if (goal.kind === 'speed') return cue(`The session to beat: ${aboutSpeed(goal.from, unit)}.`)
  if (goal.kind === 'second') return cue(`The session to beat: ${inLine(goal.from)} second serves in.`)
  return chosen ? 'You picked this one.' : 'First in your plan, because fixing it often helps fix the others.'
}

/**
 * The programme for this history, or nothing when there is no goal to give: no
 * serves yet, or nothing left to fix and no speed to beat.
 *
 * `sessions` newest first, as `listSummaries` hands them back, and `evidence`
 * the practice serves `sessionEvidence` gives, as the week plan takes them.
 */
export function programmeFor(
  sessions: Session[],
  prefs: Prefs,
  now: number = Date.now(),
  evidence: readonly Session[] = [],
  more: ProgrammeContext = {},
): Programme | undefined {
  if (!sessions.length) return undefined
  const r = reading(sessions, prefs, now, evidence, more)
  const found = goalNow(r)
  if (!found) return undefined
  const { goal, chosen, startedAt } = found

  const flaw = goal.kind === 'fault' ? goal.flaw : goal.kind === 'speed' ? speedWork(r) : secondWork(r)
  const { item, ladder, rung } = itemFor(r, flaw)
  const closing =
    goal.kind === 'fault'
      ? (state: WeekState) => holdRow(ladder, state)
      : goal.kind === 'speed'
        ? (state: WeekState) => speedRow(goal.from, r.unit, state)
        : (state: WeekState) => secondRow(goal.from, state)
  const { rows, moveUp } = ladderRows(r, flaw, ladder, rung, closing)

  const span = WEEKS_PER_TRIP[r.cadence]
  let week = 1
  const weeks = rows.map(({ trips, ...row }): ProgrammeWeek => {
    const from = week
    const to = week + trips * span - 1
    week = to + 1
    return { ...row, from, to, label: from === to ? `Week ${from}` : `Weeks ${from} to ${to}` }
  })
  const current = weeks.find((w) => w.state === 'current')!
  const done = weeks.filter((w) => w.state === 'done').length
  const weeksLeft = weeks.filter((w) => w.state !== 'done').reduce((n, w) => n + w.to - w.from + 1, 0)
  const behind = now - lastVisit(r) > CADENCE_GAP_MS[r.cadence]

  const plan = planWith(r, item)
  const minutes = prefs.courtMinutes ?? DEFAULT_MINUTES
  const programme: Programme = {
    goal,
    title: goalTitle(goal),
    why: whyLine(goal, chosen, r.unit),
    chosen,
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(goal.kind === 'speed' ? { note: SPEED_NOTE } : goal.kind === 'second' ? { note: SECOND_NOTE } : {}),
    cadence: r.cadence,
    weeks,
    current,
    ratio: done / weeks.length,
    weeksLeft,
    pace: paceLine(weeksLeft, r.cadence),
    next: nextLine(current, behind),
    behind,
    ...(moveUp ? { moveUp } : {}),
    ...(r.week?.recheck ? { recheck: r.week.recheck } : {}),
    plan,
    minutes,
    today: [],
  }
  return { ...programme, today: todayFor(programme, minutes) }
}

/**
 * Today on court at any length (N1.6), the goal's drill first. A speed goal's
 * filmed check is a speed, which the drill's own basket line would not say.
 */
export function todayFor(programme: Pick<Programme, 'goal' | 'plan'>, minutes: CourtMinutes): CourtBlock[] {
  const blocks = courtPlan(programme.plan, minutes)
  if (programme.goal.kind === 'fault') return blocks
  const line =
    programme.goal.kind === 'speed'
      ? `Film ${CHECK_SERVES} first serves from the side for a speed.`
      : `Serve ${MIN_TAGGED} second serves and tag where each landed.`
  return blocks.map((b) => (b.kind === 'check' ? { ...b, line } : b))
}

/**
 * What the player can switch to: the plan's other faults, then speed once a
 * trip has given one. Nothing here is the goal in force, so a tap always changes
 * something.
 */
export function goalOptions(
  sessions: Session[],
  prefs: Prefs,
  now: number = Date.now(),
  evidence: readonly Session[] = [],
  more: ProgrammeContext = {},
): GoalOption[] {
  const r = reading(sessions, prefs, now, evidence, more)
  const inForce = goalNow(r)?.goal
  const out: GoalOption[] = []
  for (const item of r.week?.items ?? []) {
    if (!item.flaw || (inForce?.kind === 'fault' && inForce.flaw === item.flaw)) continue
    out.push({
      goal: { kind: 'fault', flaw: item.flaw },
      title: GOAL_TITLE[item.flaw],
      line: item.step ? `Step ${item.step.at} of ${item.step.of}: ${item.drill.name}.` : `${item.drill.name}.`,
    })
  }
  const second = r.seconds[r.seconds.length - 1]
  if (second && inForce?.kind !== 'second') {
    out.push({
      goal: { kind: 'second', from: second },
      title: SECOND_TITLE,
      line: cue(`Beat ${inLine(second)} second serves in, from the ones you marked.`),
    })
  }
  const newest = r.trips[r.trips.length - 1]
  if (newest && inForce?.kind !== 'speed') {
    out.push({
      goal: { kind: 'speed', from: range(newest) },
      title: SPEED_TITLE,
      line: cue(`Beat ${aboutSpeed(newest, r.unit)}. Not checked against a radar.`),
    })
  }
  return out
}

/**
 * The goals this history has reached lately, newest first: `moments.ts` turns
 * them into something to say.
 *
 * A fault counts when the player picked it, or when it stood first in the plan
 * the moment it cleared, which is the goal the programme had for them then.
 * The week plan decides which faults count as fixed lately, so a fault the
 * engine named once in passing never reads as a goal beaten.
 */
export function goalsReached(
  sessions: Session[],
  prefs: Prefs,
  now: number = Date.now(),
  evidence: readonly Session[] = [],
  more: ProgrammeContext = {},
): GoalReached[] {
  const r = reading(sessions, prefs, now, evidence, more)
  const choice = picked(prefs)
  const out: GoalReached[] = []
  for (const { flaw } of r.week?.graduated ?? []) {
    const held = graduation(r.pool, flaw)
    if (!held) continue
    const wasGoal = (choice?.kind === 'fault' && choice.flaw === flaw) || drilledFault(r.pool, held.since, prefs.ladder) === flaw
    if (wasGoal) out.push({ goal: { kind: 'fault', flaw }, title: GOAL_TITLE[flaw], at: held.since, graduation: held })
  }
  if (choice?.kind === 'second' && r.seconds.length) {
    const at = secondFrom(r.seconds, choice.startedAt)
    if (at.cleared) out.push({ goal: { kind: 'second', from: at.from }, title: SECOND_TITLE, at: at.cleared.at, secondCleared: at.cleared })
  }
  if (r.trips.length) {
    const reachedSpeed =
      choice?.kind === 'speed'
        ? speedFrom(r.trips, choice.startedAt)
        : planFirst(r)
          ? undefined
          : speedRun(r.trips).last
    if (reachedSpeed?.cleared) {
      out.push({
        goal: { kind: 'speed', from: range(reachedSpeed.from) },
        title: SPEED_TITLE,
        at: reachedSpeed.cleared.at,
        cleared: reachedSpeed.cleared,
      })
    }
  }
  return out.sort((a, b) => b.at - a.at)
}
