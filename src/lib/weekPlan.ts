/**
 * The week's plan on the home screen: each of the last report's ranked fixes,
 * on the rung of its ladder the player is on, with what to film to check it.
 *
 * Not the report's plan again. The report says what was found and why, in the
 * order that causes the others; this says what to do about each of them now —
 * the step the player has moved to since (`Prefs.ladder`), which the report's
 * later fixes never show, and the basket that would move them on. Read straight
 * off the stored report with the same `causalPlan` the report uses, so the two
 * cannot disagree about the order.
 */
import { CHECK_SERVES, progressionFor } from './analysis/progressions'
import { causalPlan } from './analysis/verdict'
import { cue } from './analysis/voice'
import type { FlawId } from './analysis/flaws'
import type { Drill } from './analysis/types'
import type { Session } from './storage/db'

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
}

export interface WeekPlan {
  /** The report the plan came from. */
  from: Session
  items: WeekItem[]
}

/**
 * The newest report that said something to work on, as this week's plan.
 *
 * Newest first, walking past a refused clip or a report with nothing in it, so
 * one bad clip does not blank the plan the player was given last time. A
 * report filed before the diagnosis existed falls back to its single focus, as
 * the report itself does.
 */
export function weekPlan(
  sessions: Session[],
  rungs?: Partial<Record<string, number>>,
): WeekPlan | undefined {
  for (const session of sessions) {
    // A refused clip's numbers were not believed, so neither is anything
    // ranked from them — its stored focus included.
    if (session.triage?.status === 'rejected') continue
    const ranked = causalPlan(session.triage, session.diagnosis)
    const plan = ranked.length ? ranked : session.focus?.drill ? [session.focus] : []
    if (plan.length) return { from: session, items: plan.map((entry) => itemFor(entry, rungs)) }
  }
  return undefined
}

function itemFor(entry: Session['focus'], rungs?: Partial<Record<string, number>>): WeekItem {
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
    check: cue(
      `Film a basket of ${CHECK_SERVES} on this step. Move up when ${ladder.pass} come back without this fault.`,
    ),
  }
}
