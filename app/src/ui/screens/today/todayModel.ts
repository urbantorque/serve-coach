/**
 * Today's state (PRODUCT §6.2; DESIGN §10.2): which cards show and what the one primary action is.
 * PURE, so every state (empty, sample, baseline building, practise, re-test due, result, pain pause,
 * match day, welcome back) is unit-tested without rendering.
 */
import type { ReferralLevel } from '../../../coaching/index.ts'
import type { VerdictWord } from '../../../data/domain.ts'
import type { ExperimentRecord, PracticeLogRecord, ProfileRecord, SessionRecord, Weekday } from '../../../data/records.ts'
import { baselineProgress, type BaselineProgress, type SessionBundle } from '../progress/insights/history.ts'

export type ExperimentStep =
  | { kind: 'practise'; day: number; practices: 0 }
  | { kind: 'retest-due'; day: number; practices: number; minutes: number }
  | { kind: 'result'; day: number; practices: number; verdict: VerdictWord }

export interface TodayModel {
  mode: 'empty' | 'sample' | 'player'
  /**
   * A referral is active (COACHING §7.5, §7.9, §10.3): this session's answer ("It hurts" or a red flag,
   * kept in memory only) or the saved pain flag (kept only with consent, D8). No cue, drill, re-test
   * or match-day card shows while it is.
   */
  painPause: boolean
  /** Its level: this session's answer wins; the saved flag alone is "Stop and book". */
  referral: ReferralLevel | null
  matchDay: boolean
  last: SessionBundle | null
  /** Sessions (own, or sample in sample mode) newest first. */
  sessions: SessionBundle[]
  /**
   * The experiment Today talks about: the active one, else one that just finished (its verdict came
   * from the newest session), so the result shows once before the next focus takes over.
   */
  experiment: ExperimentRecord | null
  step: ExperimentStep | null
  /** Building your baseline (METRICS §4.1): shown while fewer than 2 matched sessions qualify. */
  baseline: BaselineProgress | null
  welcomeBack: boolean
}

const DAY_MS = 86_400_000
const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function daysBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY_MS)
}

export function experimentStep(exp: ExperimentRecord, logs: readonly PracticeLogRecord[], now: Date): ExperimentStep {
  const day = Math.max(1, daysBetween(exp.createdAt, now) + 1)
  const practices = logs.filter((l) => l.experimentId === exp.id)
  const minutes = practices.reduce((a, l) => a + l.minutes, 0)
  if (exp.result && exp.retestSessionIds.length) return { kind: 'result', day, practices: practices.length, verdict: exp.result.verdict }
  if (!practices.length) return { kind: 'practise', day, practices: 0 }
  return { kind: 'retest-due', day, practices: practices.length, minutes }
}

/**
 * The experiment Today shows (sample experiments only in sample mode): the active one; else a
 * completed one whose verdict came from the newest session. Once a verdict ends an experiment it is
 * stored as `completed` (coaching `experimentRecordStatus`), never left active.
 */
export function currentExperiment(experiments: readonly ExperimentRecord[], newestSessionId: string | undefined, demo: boolean): ExperimentRecord | null {
  const want = demo ? 1 : 0
  const mine = experiments.filter((e) => (e.isDemo ?? 0) === want)
  const active = mine.find((e) => e.status === 'active')
  if (active) return active
  if (!newestSessionId) return null
  return mine.find((e) => e.status === 'completed' && e.result && e.retestSessionIds.at(-1) === newestSessionId) ?? null
}

export function todayModel(input: {
  bundles: readonly SessionBundle[]
  experiments: readonly ExperimentRecord[]
  practiceLogs: readonly PracticeLogRecord[]
  profile: ProfileRecord | null
  now: Date
  /** The referral raised this session (focus/focusStore.ts), which is never saved without consent. */
  referral?: ReferralLevel
}): TodayModel {
  const ready = input.bundles.filter((b) => b.session.status === 'ready')
  const own = ready.filter((b) => b.session.isDemo === 0)
  const sample = ready.filter((b) => b.session.isDemo === 1)
  const mode: TodayModel['mode'] = own.length ? 'player' : sample.length ? 'sample' : 'empty'
  const sessions = [...(mode === 'player' ? own : sample)].sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
  const last = sessions[0] ?? null
  // The same rule as /focus (useFocus.ts): the in-memory referral or the saved flag.
  const referral: ReferralLevel | null = input.referral ?? (input.profile?.comfort.painFlag === 1 ? 'stop-and-book' : null)
  const painPause = referral !== null
  const wantDemo = mode === 'sample' ? 1 : 0
  const experiment = currentExperiment(input.experiments, last?.session.id, mode === 'sample')
  const step = experiment ? experimentStep(experiment, input.practiceLogs.filter((l) => (l.isDemo ?? 0) === wantDemo), input.now) : null

  // METRICS §4.1: sessions from the same stratum and set-up with ≥ 8 included serves in it. A short
  // session (one serve, or a warm-up) does not count, and the card says why.
  let baseline: TodayModel['baseline'] = null
  if (mode === 'player' && last) {
    const p = baselineProgress(own, last)
    if (p.have < p.need) baseline = p
  }

  const hour = input.now.getHours()
  const matchDay = Boolean(input.profile?.matchNights.includes(WEEKDAYS[input.now.getDay()])) && hour >= 12 && !painPause
  const welcomeBack = mode === 'player' && last ? daysBetween(last.session.startedAt, input.now) >= 14 : false
  return { mode, painPause, referral, matchDay, last, sessions, experiment, step, baseline, welcomeBack }
}

/** "View from behind, 12 serves" / "Side view, 22 serves". */
export function sessionLine(s: SessionRecord): string {
  const n = s.analysis?.counts.analysed ?? 0
  return `${s.view === 'rear' ? 'View from behind' : 'Side view'}, ${n} ${n === 1 ? 'serve' : 'serves'}`
}

export interface MorningAfter {
  /** The comp night, "YYYY-MM-DD" (yesterday, local). */
  date: string
}

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The morning-after card (PRODUCT §6.11, D11; U3): the day after one of the player's comp nights (set
 * in their profile), a gentle prompt to log the match while it is fresh. Never for sample data, never
 * while coaching is paused for pain, not once that night is logged, and not after "Not now".
 */
export function morningAfter(input: {
  profile: ProfileRecord | null
  now: Date
  mode: TodayModel['mode']
  painPause: boolean
  /** Match log dates already logged (own entries only). */
  loggedDates: readonly string[]
  /** The comp-night date the player dismissed the card for. */
  dismissed?: string
}): MorningAfter | null {
  if (input.mode !== 'player' || input.painPause) return null
  const nights = input.profile?.matchNights ?? []
  if (!nights.length) return null
  const yesterday = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate() - 1, 12)
  if (!nights.includes(WEEKDAYS[yesterday.getDay()])) return null
  const date = ymdOf(yesterday)
  if (input.loggedDates.includes(date) || input.dismissed === date) return null
  return { date }
}
