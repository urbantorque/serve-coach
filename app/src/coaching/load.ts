/**
 * Load guidance (COACHING §11). Every number is [Our inference] and deliberately conservative; the
 * guidance is a gentle nudge, never a lock, never an injury warning and never a reason to change the
 * focus. The copy makes no claim that the budget prevents injury (§14).
 */
import type { NormalisedProfile } from './profile.ts'
import { sorenessLine } from './safety.ts'
import type { Goal, LoadGuidance, LoadInput } from './types.ts'

export const LOAD_COPY = {
  budget: (n: number) => `Aim for about ${n} guided serves today, warm-up included.`,
  budgetReached: "That's your serve budget for today. Nice work.",
  ramp: "You've served a lot more this week than usual. Build up gradually if you can.",
  returnAfterBreak: (n: number) => `Welcome back. For the first week, keep to about ${n} serves, around half your usual week.`,
  returnAfterBreakNoHistory: 'Welcome back. For the first week, keep to about half your usual number of serves.',
  fatigue: 'Your contact point dropped in the last part of the session, which can be a sign of tiring. A shorter block next time?',
  spacing: 'Yesterday was a big serving day, so keep today a little lighter.',
  hardServes: (n: number) => `Keep near-full-effort serves to ${n} or fewer, and only after your warm-up.`,
  noHardServes: 'No full-effort serves today; keep every serve comfortable.',
} as const

export function loadGuidance(
  profile: NormalisedProfile,
  goal: Goal,
  load: LoadInput | undefined,
  opts: { fatigue?: boolean } = {},
): LoadGuidance {
  const anyComfort = profile.comfort.size > 0
  // Back after a break (§11): the first week stays at or under half the previous weekly average, so
  // one session never asks for more than that week's serves (the budget and the note agree).
  const onBreak = load?.daysSinceLastServes !== undefined && load.daysSinceLastServes >= 14
  const prev = load?.previousWeeklyAverage
  const returnWeek = onBreak && prev && prev > 0 ? Math.max(10, Math.round((prev * 0.5) / 5) * 5) : undefined
  const baseBudget = anyComfort || goal === 'less-effort' ? 40 : profile.level === 'utr-1-3' ? 60 : 80
  const sessionBudget = returnWeek !== undefined ? Math.min(baseBudget, returnWeek) : baseBudget
  const noHard = goal === 'less-effort' || profile.comfort.has('shoulder') || profile.comfort.has('elbow') || profile.comfort.has('other')
  // Never more hard serves than the budget leaves after the 10-serve warm-up (§11.1: none before it).
  const hardServeCap = noHard ? 0 : Math.min(30, Math.max(0, sessionBudget - 10))
  const notes: LoadGuidance['notes'] = [{ id: 'budget', text: LOAD_COPY.budget(sessionBudget) }]
  notes.push({ id: 'budget', text: hardServeCap === 0 ? LOAD_COPY.noHardServes : LOAD_COPY.hardServes(hardServeCap) })
  if (profile.soreToday.length) notes.push({ id: 'sore', text: sorenessLine(profile.soreToday) })
  if (load?.servesToday !== undefined && load.servesToday >= sessionBudget) notes.push({ id: 'budget-reached', text: LOAD_COPY.budgetReached })
  if (rampFlag(load)) notes.push({ id: 'ramp', text: LOAD_COPY.ramp })
  if (onBreak) {
    notes.push({ id: 'return', text: returnWeek !== undefined ? LOAD_COPY.returnAfterBreak(returnWeek) : LOAD_COPY.returnAfterBreakNoHistory })
  }
  if (load?.servesYesterday !== undefined && load.servesYesterday > 60) notes.push({ id: 'spacing', text: LOAD_COPY.spacing })
  if (opts.fatigue) notes.push({ id: 'fatigue', text: LOAD_COPY.fatigue })
  return { sessionBudget, hardServeCap, notes }
}

/**
 * METRICS §4.8 load-flag: last 7 days / weekly mean of days 8 to 35 > 1.5 and >= 100 serves in the
 * last 7 days; needs >= 28 days of history and >= 3 sessions.
 */
export function rampFlag(load: LoadInput | undefined): boolean {
  if (!load || load.last7Days === undefined || load.chronicWeeklyMean === undefined) return false
  if ((load.historyDays ?? 0) < 28 || (load.sessionsInHistory ?? 0) < 3) return false
  if (load.last7Days < 100) return false
  if (!(load.chronicWeeklyMean > 0)) return true
  return load.last7Days / load.chronicWeeklyMean > 1.5
}
