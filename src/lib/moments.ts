/**
 * Moments worth coming back for.
 *
 * The things a season is made of already happen in this app and pass unmarked:
 * the fault that finally clears, the fastest serve, the first trip the racket
 * reached the back. Each is said once on one screen, or only on a chart a player
 * has to go and read. This gathers them, ranks them, and lets Today lead with
 * what just happened.
 *
 * EVERY ONE IS EARNED. Nothing here can be produced by a tap, the rule
 * `sixWeekMilestone` and the drill button set: a step passed counts only on a
 * step the app read and a basket that reached its bar, so the self-checked steps
 * a player moves up by their own word stay on the ladder and earn no moment. And
 * nothing here outruns the noise. Each kind stands on the test its own module
 * keeps: a fastest serve is a whole range above the holder's, a best trip clears
 * the camera's floor for a trip against every earlier one, a fault has held
 * across two trips, a body best is a rung no trip reached by more than the camera
 * moves it.
 *
 * Derived from the history every time, like the week plan. A relapse takes a
 * fault's moment back with it, and a moment needs no store to fade: it has a date
 * and a length, stretched by how far apart this player's trips are, since a
 * moment is fresh until they have had the chance to see it.
 *
 * `momentOn` asks a harder question of one report: what did this one serve
 * change? The whole history is derived twice, as it stood before the report and
 * after, and a moment is the report's only if it is new. So the third serve of a
 * trip that set a best says so and the fourth does not.
 */
import { bodyBestLine, bodyBests } from './bests'
import { judgeServe, progressionFor } from './analysis/progressions'
import { FLAWS, type FlawId } from './analysis/flaws'
import { changeOf } from './analysis/realChange'
import { cue } from './analysis/voice'
import { FAULT_NAME, graduation } from './graduation'
import {
  CADENCE_GAP_MS,
  CADENCE_WORDS,
  MIN_TRIP_SERVES,
  bestTrip,
  bestTripLine,
  currentRubricEra,
  dominantType,
  servesPerWeek,
  shortDate,
  tripPoints,
  tripStreak,
  tripsOf,
  typeOf,
  visitSpans,
} from './progress'
import { WEEKS_PER_TRIP, basketPassed, cadenceOf, goalsReached, programmeFor, type ProgrammeContext } from './programme'
import type { PracticeSession } from './session/session'
import { aboutSpeed, defaultSpeedUnit, speedFigures, speedGlanceLine } from './speedCopy'
import { fastestServe, readingOf, sessionSpeeds } from './speedTrend'
import type { Session } from './storage/db'
import { DEFAULTS, type Prefs } from './storage/prefs'
import { weekPlan } from './weekPlan'

export type MomentKind = 'goal' | 'fault' | 'fastest' | 'step' | 'best_trip' | 'body_best' | 'streak' | 'first_serve'

export interface Moment {
  kind: MomentKind
  /** One event, however often it is derived: for React, and for telling new from known. */
  key: string
  /** When it happened. */
  at: number
  title: string
  /** One line. */
  body: string
  /** How long it stays fresh from `at`. */
  freshMs: number
}

/** What else a history can hold. A practice session here needs its lines: its serves and speeds count. */
export type MomentContext = Omit<ProgrammeContext, 'practice'> & { practice?: readonly PracticeSession[] }

/** Biggest first: which is said when one trip earned more than one. */
export const MOMENT_RANK: readonly MomentKind[] = ['goal', 'fault', 'fastest', 'step', 'best_trip', 'body_best', 'streak', 'first_serve']

/** Days a moment stays fresh for a player who gets to a court weekly. A slower cadence stretches them. */
const FRESH_DAYS: Record<MomentKind, number> = {
  goal: 14,
  fault: 14,
  fastest: 10,
  step: 7,
  best_trip: 10,
  body_best: 10,
  streak: 7,
  first_serve: 7,
}

/** How many Today shows at once. A third would be a list. */
export const MAX_MOMENTS = 2

/** The runs of trips worth saying. Below three is a coincidence; between these, the streak line has it. */
export const STREAK_MILESTONES = [3, 5, 10, 20, 30, 50]

const DAY = 86_400_000
const SPEED_CAVEAT = 'Not checked against a radar.'
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Serves a fault must have been judged on, each side of a week, before the week is said to have moved it. */
const MIN_SIDE = 3

type Found = Omit<Moment, 'freshMs'>

/** A step passed, when the app read the step and a basket reached its bar. */
function stepsPassed(pool: readonly Session[], prefs: Prefs): Found[] {
  const out: Found[] = []
  for (const [id, at] of Object.entries(prefs.ladderPassedAt ?? {})) {
    const flaw = id as FlawId
    const ladder = progressionFor(flaw)
    const rung = prefs.ladder?.[flaw]
    if (!ladder || at === undefined || rung === undefined) continue
    // A later move is a step back, and the pass no longer stands.
    if (prefs.ladderMovedAt?.[flaw] !== at) continue
    const left = ladder.steps[rung - 1]
    const on = ladder.steps[rung]
    if (!left || !on || left.check.by !== 'engine') continue
    if (!basketPassed(pool, flaw, -Infinity, at)) continue
    out.push({
      kind: 'step',
      key: `step:${flaw}:${at}`,
      at,
      title: 'Step passed',
      body: cue(`You passed ${left.name}. Now on ${on.name}, step ${rung + 1} of ${ladder.steps.length}.`),
    })
  }
  return out
}

/**
 * The newest full trip, when it is the best in the era by more than the camera
 * moves a trip: `bestTrip` names the record, and this asks whether that trip just
 * set it, past `REAL_CHANGE.trip`, against every trip before it.
 */
function newBestTrip(sessions: Session[], more: MomentContext): Found | undefined {
  const type = dominantType(sessions)
  const ledger = more.ledger ?? []
  const record = bestTrip(sessions, type, ledger)
  if (!record) return undefined
  const oldestFirst = sessions.filter((s) => typeOf(s) === type).sort((a, b) => a.createdAt - b.createdAt)
  const era = currentRubricEra(tripPoints(oldestFirst, ledger.filter((r) => r.serveType === type)))
  const full = era.filter((t) => t.serves >= MIN_TRIP_SERVES)
  const latest = full[full.length - 1]
  if (latest.createdAt !== record.from) return undefined
  const before = Math.max(...full.slice(0, -1).map((t) => t.overall))
  if (changeOf(latest.overall - before, 'trip') !== 'up') return undefined
  return {
    kind: 'best_trip',
    key: `best_trip:${record.from}`,
    at: record.to,
    title: 'Best trip yet',
    body: cue(bestTripLine(record, record.to)),
  }
}

/** A run of trips, on the trip that made it a milestone. */
function streakMilestone(sessions: Session[], prefs: Prefs, now: number, more: MomentContext): Found | undefined {
  const cadence = cadenceOf(sessions, prefs, more)
  const n = tripStreak(sessions, now, CADENCE_GAP_MS[cadence], more.ledger ?? [], more.practice ?? [])
  if (!STREAK_MILESTONES.includes(n)) return undefined
  const trips = tripsOf(sessions)
  const at = Math.max(trips[trips.length - 1][0].createdAt, ...(more.practice ?? []).filter((p) => p.lines.length).map((p) => p.createdAt))
  return {
    kind: 'streak',
    key: `streak:${n}:${at}`,
    at,
    title: `${n} trips in a row`,
    body: cue(`${capital(CADENCE_WORDS[cadence])}, and every one of them on film.`),
  }
}

/** Everything this history has earned, fresh or not, as of `now`. */
function derive(sessions: Session[], prefs: Prefs, now: number, evidence: readonly Session[], more: MomentContext): Moment[] {
  if (!sessions.length) return []
  const unit = prefs.speedUnit ?? defaultSpeedUnit()
  const pool = evidence.length ? [...sessions, ...evidence] : sessions
  const found: Found[] = []

  const week = weekPlan(sessions, prefs.ladder, now, evidence)
  const reached = goalsReached(sessions, prefs, now, evidence, more)
  const lineFor = (flaw: FlawId) => week?.graduated.find((g) => g.flaw === flaw)?.line
  for (const goal of reached) {
    if (goal.goal.kind === 'fault') {
      found.push({
        kind: 'goal',
        key: `goal:${goal.goal.flaw}:${goal.at}`,
        at: goal.at,
        title: 'Goal reached',
        body: lineFor(goal.goal.flaw)!,
      })
    } else if (goal.cleared) {
      found.push({
        kind: 'goal',
        key: `goal:speed:${goal.at}`,
        at: goal.at,
        title: 'Goal reached',
        body: cue(`Clear of where you started: ${aboutSpeed(goal.cleared, unit)}. ${SPEED_CAVEAT}`),
      })
    }
  }

  // The rest of the week plan's fixed faults: said in its words, and only the
  // faults it planned, so one named in passing cannot read as one beaten.
  const goals = new Set(reached.map((g) => (g.goal.kind === 'fault' ? g.goal.flaw : undefined)))
  for (const { flaw, line } of week?.graduated ?? []) {
    const held = graduation(pool, flaw)
    if (!held || goals.has(flaw)) continue
    found.push({ kind: 'fault', key: `fault:${flaw}:${held.since}`, at: held.since, title: 'Fault fixed', body: line })
  }

  // A range above the holder's, and a holder to beat: a first reading is no record broken.
  const fastest = fastestServe(sessions)
  if (fastest && sessions.some((s) => readingOf(s) && s.createdAt < fastest.at)) {
    found.push({
      kind: 'fastest',
      key: `fastest:${fastest.id}`,
      at: fastest.at,
      title: 'New fastest serve',
      body: `${speedGlanceLine(speedFigures(fastest, unit))} ${SPEED_CAVEAT}`,
    })
  }

  found.push(...stepsPassed(pool, prefs))

  const bestOfTrips = newBestTrip(sessions, more)
  if (bestOfTrips) found.push(bestOfTrips)

  // One a trip, the first on the card: bests arrive together when a fault clears.
  const [body] = bodyBests(sessions)
  if (body) {
    found.push({
      kind: 'body_best',
      key: `body:${body.metricId}:${body.at}`,
      at: body.at,
      title: 'New best position',
      body: cue(bodyBestLine(body)),
    })
  }

  const streak = streakMilestone(sessions, prefs, now, more)
  if (streak) found.push(streak)

  // The very first, so not a restored history whose oldest reports went to the prune.
  const first = Math.min(...sessions.map((s) => s.createdAt))
  const older = (more.ledger ?? []).some((r) => r.from < first) || (more.practice ?? []).some((p) => p.createdAt < first)
  if (!older) {
    found.push({
      kind: 'first_serve',
      key: 'first_serve',
      at: first,
      title: 'First serve filmed',
      body: 'Your history starts here. Film another next trip and I can start comparing.',
    })
  }

  const pace = WEEKS_PER_TRIP[cadenceOf(sessions, prefs, more)]
  return found.map((m) => ({ ...m, freshMs: FRESH_DAYS[m.kind] * pace * DAY }))
}

const byRank = (a: Moment, b: Moment) => MOMENT_RANK.indexOf(a.kind) - MOMENT_RANK.indexOf(b.kind)

/**
 * What just happened, for Today: the freshest trip's moments first, the biggest
 * first within a trip, at most `MAX_MOMENTS`.
 *
 * By trip rather than by the minute: two things earned one afternoon are one
 * piece of news, and which came twenty minutes first says nothing.
 */
export function momentsFor(
  sessions: Session[],
  prefs: Prefs,
  now: number = Date.now(),
  evidence: readonly Session[] = [],
  more: MomentContext = {},
): Moment[] {
  const starts = tripsOf(sessions).map((t) => t[0].createdAt)
  const tripOf = (at: number) => starts.filter((s) => s <= at).length
  return derive(sessions, prefs, now, evidence, more)
    .filter((m) => m.at <= now && now - m.at < m.freshMs)
    .sort((a, b) => tripOf(b.at) - tripOf(a.at) || byRank(a, b))
    .slice(0, MAX_MOMENTS)
}

/**
 * The moment one report earned, or nothing: the biggest thing true after it and
 * not before.
 *
 * As of the report, so a report reopened next month says what it earned then. A
 * step is never a report's: it is passed afterwards, on the player's say-so, and
 * `momentsFor` carries it. `report` may be a live analysis not yet saved, and
 * `history` may or may not hold it.
 */
export function momentOn(
  report: Session,
  history: readonly Session[],
  ctx: MomentContext & { prefs?: Prefs; evidence?: readonly Session[] } = {},
): Moment | undefined {
  if (report.triage?.status === 'rejected') return undefined
  const at = report.createdAt
  const { prefs = DEFAULTS, evidence = [], ...rest } = ctx
  const earlier = history.filter((s) => s.id !== report.id && s.createdAt < at)
  const more: MomentContext = {
    ...rest,
    ledger: rest.ledger?.filter((r) => r.to < at),
    practice: rest.practice?.filter((p) => p.createdAt < at),
  }
  const before = evidence.filter((s) => s.createdAt < at)
  const known = new Set(derive(earlier, prefs, at, before, more).map((m) => m.key))
  return derive([report, ...earlier], prefs, at, before, more)
    .filter((m) => m.kind !== 'step' && !known.has(m.key))
    .sort(byRank)[0]
}

/* ------------------------------------------------------------- a week back -- */

export interface RecapFault {
  flaw: FlawId
  /** Held across two trips that week, or named on fewer or more serves than before it. */
  moved: 'fixed' | 'fewer' | 'more'
  line: string
}

export interface WeekRecap {
  /** Local midnight on its Monday, and on the Monday after. */
  from: number
  to: number
  /** "Last week", or the week's date when the last week with serves is further back. */
  label: string
  serves: number
  trips: number
  /** The whole week in a line. */
  line: string
  /** The serve the reader was surest was fast, read off its range. Absent when nothing gave a speed. */
  bestSpeed?: { ms: number; low: number; high: number; line: string }
  faults: RecapFault[]
  /** Steps passed that week, by name, and whether the app read the basket or the player judged it. */
  steps: { flaw: FlawId; step: string; by: 'engine' | 'self' }[]
  /** What is next, in one sentence. */
  next?: string
}

/** Weeks back a recap looks: a monthly player's last trip is still inside it. */
const RECAP_WEEKS = 9

/** The faults the engine can name: one it never names has nothing to move. */
const NAMED: readonly FlawId[] = FLAWS.filter((s) => s.notNamed === undefined).map((s) => s.flaw)

/**
 * Which faults a week moved: those it fixed, in the week plan's words, and those
 * named on fewer or more of its serves than of the same number before it. Two
 * serves or more apart, the rule `faultTrends` keeps: one serve either way is a
 * coin.
 */
function faultsMoved(sessions: Session[], prefs: Prefs, evidence: readonly Session[], from: number, to: number): RecapFault[] {
  const upTo = (s: Session) => s.createdAt < to
  const reports = sessions.filter(upTo)
  const practice = evidence.filter(upTo)
  const pool = [...reports, ...practice]
  const fixed = new Set<FlawId>()
  const out: RecapFault[] = []
  for (const { flaw } of weekPlan(reports, prefs.ladder, to, practice)?.graduated ?? []) {
    const held = graduation(pool, flaw)
    if (!held || held.since < from) continue
    fixed.add(flaw)
    out.push({ flaw, moved: 'fixed', line: cue(`${FAULT_NAME[flaw]}: clean on ${held.clean} of your last ${held.read} serves.`) })
  }
  const era = currentRubricEra([...pool].sort((a, b) => a.createdAt - b.createdAt))
  for (const flaw of NAMED) {
    if (fixed.has(flaw)) continue
    const judged = era
      .map((s) => ({ at: s.createdAt, v: judgeServe(s, flaw) }))
      .filter((x) => x.v !== 'unread')
    const during = judged.filter((x) => x.at >= from)
    const earlier = judged.filter((x) => x.at < from)
    const side = Math.min(during.length, earlier.length)
    if (side < MIN_SIDE) continue
    const named = (xs: typeof judged) => xs.slice(-side).filter((x) => x.v === 'named').length
    const was = named(earlier)
    const now = named(during)
    if (now <= was - 2) out.push({ flaw, moved: 'fewer', line: cue(`${FAULT_NAME[flaw]} came up less often.`) })
    else if (now >= was + 2) out.push({ flaw, moved: 'more', line: cue(`${FAULT_NAME[flaw]} came up more often.`) })
  }
  return out
}

/** Steps passed in a span. Only the last move of a ladder is on record, so this can under-count and never over-counts. */
function stepsIn(prefs: Prefs, from: number, to: number): WeekRecap['steps'] {
  const out: WeekRecap['steps'] = []
  for (const [id, at] of Object.entries(prefs.ladderPassedAt ?? {})) {
    const flaw = id as FlawId
    const rung = prefs.ladder?.[flaw]
    const left = rung === undefined ? undefined : progressionFor(flaw)?.steps[rung - 1]
    if (left && at !== undefined && at >= from && at < to && prefs.ladderMovedAt?.[flaw] === at) {
      out.push({ flaw, step: left.name, by: left.check.by })
    }
  }
  return out
}

/**
 * The last complete week with any serves in it, in numbers, or nothing when
 * there is no such week to speak of. Monday to Sunday, the weeks `servesPerWeek`
 * counts, so the two cannot disagree.
 */
export function weekRecap(
  sessions: Session[],
  prefs: Prefs,
  now: number = Date.now(),
  evidence: readonly Session[] = [],
  more: MomentContext = {},
): WeekRecap | undefined {
  const practice = more.practice ?? []
  const weeks = servesPerWeek(sessions, now, RECAP_WEEKS, practice)
  let last = weeks.length - 2
  while (last >= 0 && weeks[last].serves === 0) last--
  if (last < 0) return undefined
  const week = weeks[last]
  const from = week.start
  const to = weeks[last + 1].start

  const inWeek = (at: number) => at >= from && at < to
  const reports = sessions.filter((s) => inWeek(s.createdAt))
  const sessionsThatWeek = practice.filter((p) => inWeek(p.createdAt))
  const trips = visitSpans(reports, [], sessionsThatWeek).length
  const speeds = sessionSpeeds([
    ...reports.map((s) => ({ speed: readingOf(s) })),
    ...sessionsThatWeek.flatMap((p) => p.lines),
  ])
  const unit = prefs.speedUnit ?? defaultSpeedUnit()

  const count = week.serves === 1 ? '1 serve' : `${week.serves} serves`
  const where = trips === 1 ? 'on one trip' : `over ${trips} trips`
  return {
    from,
    to,
    label: last === weeks.length - 2 ? 'Last week' : `Week of ${shortDate(from)}`,
    serves: week.serves,
    trips,
    line: cue(`${count} ${where}.`),
    ...(speeds
      ? { bestSpeed: { ...speeds.fastest, line: cue(`Fastest serve ${aboutSpeed(speeds.fastest, unit)}. ${SPEED_CAVEAT}`) } }
      : {}),
    faults: faultsMoved(sessions, prefs, evidence, from, to),
    steps: stepsIn(prefs, from, to),
    next: programmeFor(sessions, prefs, now, evidence, more)?.next,
  }
}
