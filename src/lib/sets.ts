/**
 * Sets from the player's own taps (L3.7): "Start a set of 10" on the glance,
 * aimed at their own in-rate plus one, first and second serves kept apart, and
 * the best set kept as a record.
 *
 * Built only from what the player said: the serve number and where it landed,
 * tapped on the glance (`ServeTag`). The app never sees the court, and a set
 * is the one place it turns those taps into a target — so the target is the
 * player's own rate, never a number the app made up. Without enough taps to
 * read a rate from, the first set has no aim: it finds one.
 */
import { MIN_OUTCOMES_FOR_RATE } from './progress'
import type { ServeTag, Session } from './storage/db'

/** Serves in a set. */
export const SET_SIZE = 10

/** Tapped serves an in-rate is read from, at most: the player's serve now. */
const RATE_WINDOW = 40

/** Finished sets kept. */
export const SETS_KEPT = 60

export interface ActiveSet {
  startedAt: number
  serveNumber: 1 | 2
  /** In of `SET_SIZE` to aim for, when there was a rate to aim from. */
  target?: number
}

export interface SetResult extends ActiveSet {
  /** When its last serve was filed. */
  endedAt: number
  inServes: number
}

/**
 * The player's own in-rate on one serve number: serves they tagged with that
 * number and with where it landed, the newest `RATE_WINDOW`. Absent below
 * `MIN_OUTCOMES_FOR_RATE`, the floor the in-rate block already holds.
 */
export function inRateFor(
  sessions: readonly Session[],
  tags: readonly ServeTag[],
  serveNumber: 1 | 2,
): { inServes: number; outcomes: number } | undefined {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const said = [...sessions]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => byId.get(s.id))
    .filter((t): t is ServeTag => t !== undefined && t.serveNumber === serveNumber && t.outcome !== undefined)
    .slice(0, RATE_WINDOW)
  if (said.length < MIN_OUTCOMES_FOR_RATE) return undefined
  return { inServes: said.filter((t) => t.outcome === 'in').length, outcomes: said.length }
}

/** The aim for a set: the player's own rate over ten, plus one, never past ten. */
export function setTarget(rate: { inServes: number; outcomes: number } | undefined): number | undefined {
  if (!rate) return undefined
  return Math.min(SET_SIZE, Math.round((rate.inServes / rate.outcomes) * SET_SIZE) + 1)
}

/**
 * The serves a set has counted so far: filed after it started, tagged with
 * where they landed, and of its serve number — or of none, since a player in
 * the middle of a set of first serves need not say so every time.
 */
export function setServes(
  active: ActiveSet,
  sessions: readonly Session[],
  tags: readonly ServeTag[],
): { id: string; at: number; isIn: boolean }[] {
  const byId = new Map(tags.map((t) => [t.id, t]))
  return [...sessions]
    .filter((s) => s.createdAt >= active.startedAt)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => ({ s, t: byId.get(s.id) }))
    .filter(({ t }) => t?.outcome !== undefined && (t.serveNumber === undefined || t.serveNumber === active.serveNumber))
    .slice(0, SET_SIZE)
    .map(({ s, t }) => ({ id: s.id, at: s.createdAt, isIn: t!.outcome === 'in' }))
}

/** A set's result once it has `SET_SIZE` serves, or nothing while it runs. */
export function finishedSet(
  active: ActiveSet,
  sessions: readonly Session[],
  tags: readonly ServeTag[],
): SetResult | undefined {
  const counted = setServes(active, sessions, tags)
  if (counted.length < SET_SIZE) return undefined
  return { ...active, endedAt: counted[counted.length - 1].at, inServes: counted.filter((c) => c.isIn).length }
}

/** The best finished set of a serve number — ties to the earlier, which set it first. */
export function bestSet(results: readonly SetResult[], serveNumber: 1 | 2): SetResult | undefined {
  return results
    .filter((r) => r.serveNumber === serveNumber)
    .reduce<SetResult | undefined>((best, r) => (!best || r.inServes > best.inServes ? r : best), undefined)
}

const SERVES_WORD: Record<1 | 2, string> = { 1: 'first serves', 2: 'second serves' }

/** The running line for a set under way. */
export function setRunningLine(active: ActiveSet, counted: number, inServes: number): string {
  const aim = active.target !== undefined ? ` Aim: ${active.target} of ${SET_SIZE}.` : ''
  // Before the first landing is tapped there is no count to give, only the way to start one.
  if (counted === 0) return `Set of ${SERVES_WORD[active.serveNumber]} started: tap where each one lands.${aim}`
  return `Set of ${SERVES_WORD[active.serveNumber]}: ${inServes} in of ${counted}.${aim}`
}

/**
 * The line a finished set earns, and the record when it set one. Said the
 * same whichever way it went: a set that fell short is a number to aim past
 * next time, not a failure.
 */
export function setDoneLine(result: SetResult, results: readonly SetResult[]): string {
  const head = `Set of ${SET_SIZE} ${SERVES_WORD[result.serveNumber]}: ${result.inServes} in.`
  const aim =
    result.target === undefined
      ? ' That is your mark to beat next time.'
      : result.inServes >= result.target
        ? ` You reached your aim of ${result.target}.`
        : ` Your aim was ${result.target}.`
  const others = results.filter((r) => r.serveNumber === result.serveNumber && r.startedAt !== result.startedAt)
  const record = others.length > 0 && others.every((r) => result.inServes > r.inServes)
  return head + aim + (record ? ` Your best set of ${SERVES_WORD[result.serveNumber]} yet.` : '')
}
