/**
 * The drill check, from serves recorded one at a time on court (N1.3).
 *
 * `checkDrill` judges a basket against the bar of a fault's ladder, and until
 * this it only ever saw a basket picked from the gallery and swept in one go.
 * The route the app recommends on court is the other one: record a serve, read
 * the glance, record the next. Every one of those serves was judged and saved,
 * and none was ever pooled, so that route could never say "move up a step".
 *
 * So the trip's own single-serve reports are pooled: the newest `CHECK_SERVES`
 * that could be judged for the fault, filmed since the player last moved its
 * ladder. Newest, not all: a trip of twelve serves where the first five were
 * clean and the last seven were not has not passed, and counting them all would
 * say it had. Since the move, not the whole trip: serves filmed on the step
 * below are evidence about that step.
 *
 * Pure. The glance draws it; `App.tsx` hands it the history.
 */
import { CHECK_SERVES, checkDrill, judgeServe, lastSeverity, progressionFor, rungFor, type DrillCheck } from './analysis/progressions'
import type { FlawId } from './analysis/flaws'
import { tripsOf } from './progress'
import type { Session } from './storage/db'
import { drilledFault } from './weekPlan'

export interface TripCheck extends DrillCheck {
  /** The rung the player is on, zero-based, and how many the ladder has. */
  rung: number
  steps: number
  /** That rung's drill, by name. */
  step: string
}

export function tripDrillCheck(
  sessions: readonly Session[],
  latest: Session,
  rungs?: Partial<Record<string, number>>,
  movedAt?: Partial<Record<string, number>>,
  /** A drill the player chose to check from the week plan (N1.4), over the plan's top. */
  target?: FlawId,
): TripCheck | undefined {
  const all = [...sessions.filter((s) => s.id !== latest.id), latest]
  const trip = tripsOf(all).find((t) => t.some((s) => s.id === latest.id)) ?? [latest]
  // The fault the player came to court drilling — the top of the week plan
  // before this trip began, as a basket's check uses the plan before it — and
  // only when there was none, this serve's. Read before the trip, not before
  // this serve: the trip's own serves would otherwise move the target under
  // the player halfway through checking it.
  const primary = latest.triage?.status === 'ok' ? latest.triage.primary_flaw?.flaw : undefined
  const flaw: FlawId | undefined = target ?? drilledFault(all, trip[0].createdAt, rungs) ?? primary
  if (!flaw) return undefined
  const ladder = progressionFor(flaw)
  if (!ladder) return undefined

  const since = movedAt?.[flaw] ?? -Infinity
  const judged = trip
    .filter((s) => s.createdAt >= since && s.createdAt <= latest.createdAt)
    .filter((s) => judgeServe(s, flaw) !== 'unread')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-CHECK_SERVES)
  if (!judged.length) return undefined
  const check = checkDrill(flaw, judged)
  if (!check) return undefined
  const rung = rungFor(flaw, ladder, rungs, lastSeverity(all, flaw))
  return { ...check, rung, steps: ladder.steps.length, step: ladder.steps[rung].name }
}

/** Whether the glance should offer "Move up a step": passed, and a step left to move to. */
export const canMoveUp = (c: TripCheck): boolean => c.outcome === 'passed' && c.rung < c.steps - 1

/** The glance's line for it, in the copy rules' voice: counts, never readings. */
export function tripCheckLine(c: TripCheck): string {
  if (c.outcome === 'passed') {
    return canMoveUp(c)
      ? `Clean on ${c.clean} of ${c.read} serves this trip. You have passed this step.`
      : `Clean on ${c.clean} of ${c.read} serves this trip, on the last step of this drill.`
  }
  if (c.outcome === 'not_yet') return `Clean on ${c.clean} of ${c.read} serves this trip. Stay on this step for now.`
  const left = CHECK_SERVES - c.read
  return `${c.clean} of ${c.read} clean so far this trip. Film ${left} more to check this step.`
}
