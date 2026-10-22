/**
 * The week's plan on the home screen: each fault the player is working on, on
 * the rung of its ladder they are on, with what to film to check it.
 *
 * Not the report's plan again. The report says what was found and why, in the
 * order that causes the others; this says what to do about each of them now —
 * the step the player has moved to since (`Prefs.ladder`), which the report's
 * later fixes never show, and the basket that would move them on. Built with
 * the same `causalPlan` the report uses.
 *
 * A FAULT STAYS UNTIL IT GRADUATES (L3.4). The plan used to be the newest
 * report's alone, so a fault the player had been drilling for weeks vanished
 * the first time one serve happened not to name it, and the next fault took
 * its place without a word. Now each plan keeps the faults of the plans before
 * it until they graduate (`graduation.ts`), the whole is ordered by the
 * hierarchy, and a fault that graduates earns one line saying so, and what is
 * next. Every fourth trip after, it is re-checked.
 */
import { progressionFor, stepCheckLine } from './analysis/progressions'
import { MAX_PLAN, causalPlan } from './analysis/verdict'
import { cue } from './analysis/voice'
import type { FlawId } from './analysis/flaws'
import type { Drill } from './analysis/types'
import type { Session } from './storage/db'
import {
  graduation,
  graduationLine,
  hierarchyIndex,
  recheckDue,
  recheckLine,
  type Graduation,
} from './graduation'
import { tripsOf } from './progress'

export interface WeekItem {
  /** The fix, as the report titled it. */
  title: string
  flaw?: FlawId
  /** The drill for this week: the rung the player is on, or the report's own drill. */
  drill: Drill
  /** Where that rung sits, when the fix has a ladder. */
  step?: { at: number; of: number }
  /** What to film to know whether it worked. */
  check: string
  /** Carried from an earlier plan: the newest report did not name it, and it has not graduated. */
  kept?: boolean
}

export interface WeekPlan {
  /** The report the plan came from. */
  from: Session
  items: WeekItem[]
  /** Faults fixed lately, one line each (L3.4). */
  graduated: { flaw: FlawId; line: string }[]
  /** A retired fault due its re-check on this trip (L3.4). */
  recheck?: { flaw: FlawId; line: string }
}

/** How many plan-bearing reports back a fault can be carried from. */
export const PLAN_MEMORY = 12

type Entry = Session['focus']

/**
 * This week's plan, from the newest reports that said something to work on.
 *
 * `sessions` newest first, as `listSummaries` hands them back. A refused clip
 * or a report with nothing in it is walked past, so one bad clip does not
 * blank the plan. A report filed before the diagnosis existed falls back to
 * its single focus, as the report itself does.
 */
export function weekPlan(
  sessions: Session[],
  rungs?: Partial<Record<string, number>>,
  now: number = Date.now(),
  /**
   * Judged serves from practice sessions (N1.5, `sessionEvidence`): counted
   * towards graduation, never planned from.
   */
  evidence: readonly Session[] = [],
): WeekPlan | undefined {
  const bearing: { session: Session; plan: Entry[] }[] = []
  for (const session of sessions) {
    // A refused clip's numbers were not believed, so neither is anything
    // ranked from them — its stored focus included.
    if (session.triage?.status === 'rejected') continue
    const ranked = causalPlan(session.triage, session.diagnosis)
    const plan = ranked.length ? ranked : session.focus?.drill ? [session.focus] : []
    if (plan.length) bearing.push({ session, plan })
    if (bearing.length >= PLAN_MEMORY) break
  }
  if (!bearing.length) return undefined

  // Every fault any of those plans named, judged once against the history now.
  const named = new Set(bearing.flatMap((b) => b.plan.map((e) => e.flaw)).filter((f): f is FlawId => !!f))
  const fixed = new Map<FlawId, Graduation>()
  for (const flaw of named) {
    const g = graduation(evidence.length ? [...sessions, ...evidence] : sessions, flaw)
    if (g) fixed.set(flaw, g)
  }

  // Oldest plan first, each newer one keeping what the one before still had.
  let carried: { entry: Entry; kept: boolean }[] = []
  for (const { plan } of [...bearing].reverse()) {
    const fresh = new Set(plan.map((e) => e.flaw))
    carried = [
      ...plan.map((entry) => ({ entry, kept: false })),
      // Only faults carry: a report with no diagnosis has a focus but no fault
      // to graduate, so it would never leave.
      ...carried.filter((c) => c.entry.flaw && !fresh.has(c.entry.flaw)).map((c) => ({ ...c, kept: true })),
    ]
  }
  // The order at the player's level, as the newest report was judged (L3.9).
  const tier = bearing[0].session.triage?.tier?.current
  const open = carried
    .filter((c) => !c.entry.flaw || !fixed.has(c.entry.flaw))
    // Stable: the hierarchy decides, and within a part the newest plan's order.
    .sort((a, b) => hierarchyIndex(a.entry.flaw, tier) - hierarchyIndex(b.entry.flaw, tier))
    .slice(0, MAX_PLAN)

  const items = open.map((c) => {
    const item = itemFor(c.entry, rungs)
    // Said, so a fault the newest serve happened not to show does not read as
    // a plan that forgot to update.
    return c.kept
      ? { ...item, kept: true, check: cue('Not seen on your last serve. Stay on this step until it holds across two trips.') }
      : item
  })
  const next = items[0]?.flaw

  /*
   * One line per fault fixed lately: on the newest trip or the one before.
   * Older graduations have been said, and the serve path (L3.5) carries them
   * from there.
   */
  const trips = tripsOf([...sessions])
  const recent = trips.length >= 2 ? trips[trips.length - 2][0].createdAt : 0
  const graduated = [...fixed.values()]
    .filter((g) => g.since >= recent)
    .sort((a, b) => hierarchyIndex(a.flaw, tier) - hierarchyIndex(b.flaw, tier))
    .map((g) => ({ flaw: g.flaw, line: graduationLine(g, next) }))

  const due = recheckDue(sessions, [...fixed.values()], now)
  // Everything graduated long ago and nothing due: nothing to say this week.
  if (!items.length && !graduated.length && !due) return undefined

  return {
    from: bearing[0].session,
    items,
    graduated,
    ...(due ? { recheck: { flaw: due.flaw, line: recheckLine(due) } } : {}),
  }
}

function itemFor(entry: Entry, rungs?: Partial<Record<string, number>>): WeekItem {
  const ladder = entry.flaw ? progressionFor(entry.flaw, entry.axis) : undefined
  if (!ladder) {
    return {
      title: entry.title,
      flaw: entry.flaw,
      drill: entry.drill,
      check: cue('Film your next serve and see whether this reading moves.'),
    }
  }
  // The rung the player chose, when it is one this ladder has; otherwise the
  // rung the report's own drill sits on, by name, since it has been stored.
  const stored = entry.flaw ? rungs?.[entry.flaw] : undefined
  const own = ladder.steps.findIndex((s) => s.name === entry.drill.name)
  const rung =
    stored !== undefined && Number.isInteger(stored) && stored >= 0 && stored < ladder.steps.length
      ? stored
      : Math.max(0, own)
  return {
    title: entry.title,
    flaw: entry.flaw,
    drill: ladder.steps[rung],
    step: { at: rung + 1, of: ladder.steps.length },
    // The step's own check (L4.2): a filmed basket, or the bar the player
    // checks themselves on a step the app has nothing to read in.
    check: cue(stepCheckLine(ladder, ladder.steps[rung])),
  }
}

/**
 * The fault the player was drilling before a report: the top of the week plan
 * the history up to it gives (L3.4). The basket check runs against this, not
 * against whatever the new report happens to name.
 */
export function drilledFault(
  sessions: Session[],
  before: number,
  rungs?: Partial<Record<string, number>>,
): FlawId | undefined {
  const earlier = sessions.filter((s) => s.createdAt < before)
  return weekPlan(earlier, rungs, before)?.items[0]?.flaw
}
