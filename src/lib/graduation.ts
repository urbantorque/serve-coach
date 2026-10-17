/**
 * When a fault is fixed (L3.4).
 *
 * Nothing used to mark one. The basket check ran against whatever the newest
 * report named, so when the fault a player was drilling cleared, "passed"
 * never showed for it; the week plan quietly moved on to the next fault, and a
 * retired fault was only ever re-checked by accident.
 *
 * A fault graduates on the engine's own judgement, serve by serve, and on the
 * ladder's own bar: of its last `CHECK_SERVES` judged serves, at least the
 * ladder's `pass` came back clean, across `GRADUATION_TRIPS` trips or more. One
 * good afternoon is not a fix. A serve the fault could not be judged on does
 * not count either way, the rule `checkDrill` keeps.
 *
 * Stateless: worked out from the history every time, so a relapse — the fault
 * named again on enough of its newest serves — undoes a graduation by itself.
 */
import { CHECK_SERVES, judgeServe, progressionFor } from './analysis/progressions'
import { HIERARCHY, hierarchyFor } from './analysis/triage'
import type { FlawId } from './analysis/flaws'
import { MIN_THEN_AND_NOW_GAP_MS, currentRubricEra, sameTrip, tripsOf } from './progress'
import type { Session } from './storage/db'

/** Trips a fault must hold clean across before it counts as fixed. */
export const GRADUATION_TRIPS = 2

/** Trips between re-checks of a retired fault. */
export const RECHECK_EVERY = 4

/** A fault's short name, for lines that set one beside another. */
export const FAULT_NAME: Record<FlawId, string> = {
  waiters_tray: 'Your grip',
  toss_height: 'Toss height',
  toss_drift: 'Toss placement',
  no_leg_drive: 'Leg drive',
  posture_collapse: 'Posture',
  shallow_drop: 'Racket drop',
  collapsed_elbow: 'Elbow at the racket drop',
  early_shoulder_rotation: 'Shoulder timing',
  arming_the_ball: 'Arm timing',
  pancake_contact: 'The racket face',
  low_contact: 'Contact height',
  contact_behind: 'Contact in front',
}

/** Each part of the serve path, as "Next:" names it. */
export const PART_NAME: Record<string, string> = {
  grip: 'the grip',
  toss: 'the toss',
  legs: 'the legs',
  posture: 'posture',
  drop: 'the racket drop',
  sequence: 'the timing of the swing',
  contact: 'contact',
}

/** Where a fault sits in the hierarchy at a level: grip first, contact last (L3.9). */
export const hierarchyIndex = (flaw: FlawId | undefined, tier?: number): number => {
  const order = hierarchyFor(tier)
  const i = flaw ? order.findIndex((g) => g.flaws.includes(flaw)) : -1
  return i < 0 ? order.length : i
}

export interface Graduation {
  flaw: FlawId
  /** Of the last `read` judged serves, how many came back clean. */
  clean: number
  read: number
  /** Trips those serves were filmed on. */
  trips: number
  /** When it first held and kept holding: the newest serve of the first passing window. */
  since: number
}

/** The serves a fault could be judged on, oldest first. */
function judged(oldestFirst: Session[], flaw: FlawId): { at: number; clean: boolean }[] {
  const out: { at: number; clean: boolean }[] = []
  for (const s of oldestFirst) {
    const v = judgeServe(s, flaw)
    if (v !== 'unread') out.push({ at: s.createdAt, clean: v === 'clean' })
  }
  return out
}

/** How many trips a run of serves spans, chained the way `tripsOf` chains them. */
function tripsIn(run: { at: number }[]): number {
  let n = run.length ? 1 : 0
  for (let i = 1; i < run.length; i++) {
    if (!sameTrip({ createdAt: run[i - 1].at }, { createdAt: run[i].at })) n++
  }
  return n
}

/**
 * Whether a fault has graduated, and on what.
 *
 * Over the current rubric era, every serve type: a fault is about the body,
 * and the bands each type is judged against are already in the verdicts.
 */
export function graduation(sessions: readonly Session[], flaw: FlawId): Graduation | undefined {
  return standing(sessions, flaw).held
}

/** Where a fault stands, for the serve path (L3.5). */
export interface Standing {
  flaw: FlawId
  /** Serves it could be judged on, in the current rubric era. */
  judged: number
  /** Of its last `CHECK_SERVES` judged serves, how many named it. */
  namedLately: number
  /** How many those were — fewer than `CHECK_SERVES` early on. */
  lately: number
  /** Holding now: the graduation, when it has one. */
  held?: Graduation
  /** It held at some point and does not now: a relapse. */
  heldBefore: boolean
}

export function standing(sessions: readonly Session[], flaw: FlawId): Standing {
  const oldestFirst = currentRubricEra([...sessions].sort((a, b) => a.createdAt - b.createdAt))
  const serves = judged(oldestFirst, flaw)
  const recent = serves.slice(-CHECK_SERVES)
  const base = {
    flaw,
    judged: serves.length,
    namedLately: recent.filter((s) => !s.clean).length,
    lately: recent.length,
    heldBefore: false,
  }
  if (serves.length < CHECK_SERVES) return base
  const pass = progressionFor(flaw)?.pass ?? CHECK_SERVES - 1
  const window = (end: number) => serves.slice(end - CHECK_SERVES + 1, end + 1)
  const holds = (end: number) => {
    const w = window(end)
    return w.filter((s) => s.clean).length >= pass && tripsIn(w) >= GRADUATION_TRIPS
  }
  const last = serves.length - 1
  if (!holds(last)) {
    let before = false
    for (let end = CHECK_SERVES - 1; end < last && !before; end++) before = holds(end)
    return { ...base, heldBefore: before }
  }
  let first = last
  while (first - 1 >= CHECK_SERVES - 1 && holds(first - 1)) first--
  const w = window(last)
  return {
    ...base,
    held: { flaw, clean: w.filter((s) => s.clean).length, read: w.length, trips: tripsIn(w), since: serves[first].at },
  }
}

/** Trips begun after a moment, chained the way `tripsOf` chains them. */
export const tripsAfter = (sessions: readonly Session[], at: number): number =>
  tripsOf([...sessions]).filter((t) => t[0].createdAt > at && !sameTrip(t[0], { createdAt: at })).length

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const count = (n: number) => COUNT_WORDS[n] ?? String(n)

/**
 * The one line a fixed fault earns, and what comes next in the serve path:
 * "Racket drop: clean on 5 of your last 6 serves, over two trips. Next: the toss."
 */
export function graduationLine(g: Graduation, next?: FlawId): string {
  const part = next ? PART_NAME[HIERARCHY[hierarchyIndex(next)]?.group] : undefined
  return (
    `${FAULT_NAME[g.flaw]}: clean on ${g.clean} of your last ${g.read} serves, over ${count(g.trips)} trips. ` +
    (part ? `Next: ${part}.` : 'Keep filming to hold it.')
  )
}

/**
 * A retired fault due its re-check, or nothing (L3.4).
 *
 * Every `RECHECK_EVERY`th trip after it graduated: the trip being played, when
 * one is under way, or else the next one. Each serve already judges every
 * fault, so the re-check is not a different measurement — it is the one trip
 * where the plan asks the player to look, rather than the fault only coming
 * back if it happens to be named.
 */
export function recheckDue(
  sessions: readonly Session[],
  retired: readonly Graduation[],
  now: number = Date.now(),
): Graduation | undefined {
  const trips = tripsOf([...sessions])
  const latest = trips[trips.length - 1]
  const playing = latest !== undefined && now - latest[latest.length - 1].createdAt < MIN_THEN_AND_NOW_GAP_MS
  const due = retired.filter((g) => {
    const after = tripsAfter(sessions, g.since)
    const upcoming = playing ? after : after + 1
    return upcoming >= RECHECK_EVERY && upcoming % RECHECK_EVERY === 0
  })
  return due.sort((a, b) => a.since - b.since)[0]
}

/** What a re-check asks for. */
export const recheckLine = (g: Graduation): string =>
  `Time to re-check ${FAULT_NAME[g.flaw].toLowerCase()}: film a basket of ${CHECK_SERVES} and see that it stays clean.`
