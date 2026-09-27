/**
 * When the Plus offer may appear (PRODUCT §6.15, §5.2, §7.4). Pure and framework-free: screens pass
 * in what they already read, and get back whether a trigger is due. The stored state (what was shown
 * when) lives in the `paywall` setting; store.ts reads and writes it.
 *
 * - T1, first loop complete: after the player's first "Did it work?" verdict (anything but
 *   "Not comparable yet"), an inline card below the verdict, once.
 * - T2, allowance reached: the free plan analyses the first loop, then 2 practice days a calendar
 *   month (all blocks on one day count once). Analysing a third day in a month shows the notice once
 *   that month. The recording is never lost.
 * - T3, a Plus feature tapped: a sheet naming the feature, every time it is tapped.
 *
 * Never: before the first report; during set-up or recording; on body-check, referral or pain
 * screens (and not while the player has paused for pain); on export, deletion or privacy screens;
 * more than once a day outside T3.
 */
import type { EntitlementSetting, PaywallStateSetting } from '../data/records.ts'

export type PaywallTrigger = 't1' | 't2' | 't3'

/** PRODUCT §5.2: analysed practice days per calendar month on the free plan, after the first loop. */
export const FREE_DAYS_PER_MONTH = 2

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day, "YYYY-MM-DD". */
export const localDay = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Local calendar month, "YYYY-MM". */
export const monthKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

/** Plus is on (the prototype's test flag), and a season pass has not run out. */
export function isPlus(e: EntitlementSetting | undefined, now: Date = new Date()): boolean {
  if (!e || e.tier !== 'plus') return false
  if (e.endsAt && new Date(e.endsAt).getTime() < now.getTime()) return false
  return true
}

// ---------- inputs (the few fields the rules need) ----------

export interface SessionLike {
  id: string
  /** Local practice day, "YYYY-MM-DD" (the allowance counts days, not blocks). */
  visitId: string
  status: string
  isDemo: 0 | 1
  startedAt: string
}

export interface ExperimentLike {
  id: string
  createdAt: string
  isDemo?: 0 | 1
  baselineSessionIds: readonly string[]
  retestSessionIds: readonly string[]
  baselineDeleted?: boolean
  result?: { verdict: string; computedAt: string }
}

const real = <T extends { isDemo?: 0 | 1 }>(xs: readonly T[]) => xs.filter((x) => x.isDemo !== 1)

/** A verdict that completes a loop (PRODUCT §7.4: anything but "Not comparable yet"). */
export function completesLoop(e: ExperimentLike): boolean {
  return Boolean(e.result && e.result.verdict !== 'not-comparable' && !e.baselineDeleted)
}

/** The player's first completed experiment (earliest verdict), or null. Sample data never counts. */
export function firstCompletedExperiment<E extends ExperimentLike>(experiments: readonly E[]): E | null {
  const done = real(experiments).filter(completesLoop)
  done.sort((a, b) => (a.result!.computedAt < b.result!.computedAt ? -1 : a.result!.computedAt > b.result!.computedAt ? 1 : 0))
  return done[0] ?? null
}

/**
 * The sessions of the free first loop: the first experiment's baseline and its first re-test. Before
 * any experiment exists, the earliest analysed session (the baseline being built) is the first loop.
 */
export function firstLoopSessionIds(experiments: readonly ExperimentLike[], sessions: readonly SessionLike[]): Set<string> {
  const exps = real(experiments).slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const first = firstCompletedExperiment(exps) ?? exps[0]
  if (first) return new Set([...first.baselineSessionIds, ...first.retestSessionIds.slice(0, 1)])
  const ready = real(sessions)
    .filter((s) => s.status === 'ready')
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
  return new Set(ready.slice(0, 1).map((s) => s.id))
}

export interface Allowance {
  /** Analysed practice days counted against this month (first-loop days are free). */
  used: number
  limit: number
  /** The counted days, oldest first. */
  countedDays: string[]
  /** Days of the first loop in this month (not counted). */
  freeDays: string[]
}

function meter(sessions: readonly SessionLike[], loop: ReadonlySet<string>, month: string, skipDay?: string): Allowance {
  const inMonth = real(sessions).filter((s) => s.visitId.startsWith(month) && s.visitId !== skipDay)
  // A day with any first-loop block is free (the loop's other blocks that day included).
  const freeDays = new Set(inMonth.filter((s) => loop.has(s.id)).map((s) => s.visitId))
  const ready = inMonth.filter((s) => s.status === 'ready')
  const counted = [...new Set(ready.filter((s) => !freeDays.has(s.visitId)).map((s) => s.visitId))].sort()
  return { used: counted.length, limit: FREE_DAYS_PER_MONTH, countedDays: counted, freeDays: [...freeDays].sort() }
}

/** The free-tier meter for a month ("YYYY-MM"), counting days (visits), not blocks. */
export function allowance(sessions: readonly SessionLike[], experiments: readonly ExperimentLike[], month: string): Allowance {
  return meter(sessions, firstLoopSessionIds(experiments, sessions), month)
}

/** "1 of 2 analysed days this month" (PRODUCT §6.13 Plan). */
export function allowanceLine(a: Pick<Allowance, 'used' | 'limit'>): string {
  return `${Math.min(a.used, 99)} of ${a.limit} analysed days this month`
}

/** T1 and T2 appear at most once a local day (T3 is exempt: the player asked by tapping). */
export function canShowToday(state: PaywallStateSetting, now: Date): boolean {
  return state.lastShownDay !== localDay(now)
}

export interface T1Input {
  plus: boolean
  experiment: ExperimentLike
  experiments: readonly ExperimentLike[]
  state: PaywallStateSetting
  now: Date
  /** The player has paused for pain (Profile comfort): no offer then. */
  painPause?: boolean
}

/**
 * T1: the inline card below the first verdict. Due when this experiment is the player's first
 * completed loop and the card has not been shown yet. Once shown, it stays for the rest of that day
 * on the same experiment (a reload does not make it flicker away), then never again.
 */
export function t1Due({ plus, experiment, experiments, state, now, painPause }: T1Input): boolean {
  if (plus || painPause || experiment.isDemo === 1 || !completesLoop(experiment)) return false
  const first = firstCompletedExperiment(experiments)
  if (!first || first.id !== experiment.id) return false
  if (state.t1ShownAt) return state.t1ExperimentId === experiment.id && localDay(new Date(state.t1ShownAt)) === localDay(now)
  return canShowToday(state, now)
}

export interface T2Input {
  plus: boolean
  /** The session just analysed (or being analysed). */
  session: SessionLike
  sessions: readonly SessionLike[]
  experiments: readonly ExperimentLike[]
  state: PaywallStateSetting
  now: Date
  painPause?: boolean
}

/**
 * T2: this session starts a third (or later) analysed day this month, outside the free first loop,
 * and the notice has not been shown this month (nor any offer today).
 */
export function t2Due({ plus, session, sessions, experiments, state, now, painPause }: T2Input): boolean {
  if (plus || painPause || session.isDemo === 1) return false
  const month = session.visitId.slice(0, 7)
  if (state.t2Months?.includes(month)) return false
  if (!canShowToday(state, now)) return false
  const all = sessions.some((s) => s.id === session.id) ? sessions : [...sessions, session]
  const loop = firstLoopSessionIds(experiments, all)
  // A day that is part of the first loop (this block or another that day) stays free.
  if (all.some((s) => s.visitId === session.visitId && loop.has(s.id))) return false
  // This day is the one being started; count the other analysed days this month.
  return meter(all, loop, month, session.visitId).used >= FREE_DAYS_PER_MONTH
}

const LOG_MAX = 20

/** The state after a showing (pure; store.ts persists it). */
export function afterShown(state: PaywallStateSetting, trigger: PaywallTrigger, now: Date, extra: { feature?: string; experimentId?: string; month?: string } = {}): PaywallStateSetting {
  const at = now.toISOString()
  const log = [...(state.log ?? []), { trigger, at, ...(extra.feature ? { feature: extra.feature } : {}) }].slice(-LOG_MAX)
  const next: PaywallStateSetting = { ...state, log }
  if (trigger === 't1') {
    if (!state.t1ShownAt) {
      next.t1ShownAt = at
      if (extra.experimentId) next.t1ExperimentId = extra.experimentId
    }
    next.lastShownDay = localDay(now)
  }
  if (trigger === 't2') {
    const month = extra.month ?? monthKey(now)
    next.t2Months = [...new Set([...(state.t2Months ?? []), month])].slice(-12)
    next.lastShownDay = localDay(now)
  }
  return next
}
