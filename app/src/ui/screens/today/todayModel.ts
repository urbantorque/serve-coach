/**
 * Today's state (PRODUCT §6.2; DESIGN §10.2): which cards show and what the one primary action is.
 * PURE, so every state (empty, sample, baseline building, practise, re-test due, result, pain pause,
 * match day, welcome back) is unit-tested without rendering.
 */
import type { VerdictWord } from '../../../data/domain.ts'
import type { ExperimentRecord, PracticeLogRecord, ProfileRecord, SessionRecord, Weekday } from '../../../data/records.ts'
import { matched, type SessionBundle } from '../progress/insights/history.ts'

export type ExperimentStep =
  | { kind: 'practise'; day: number; practices: 0 }
  | { kind: 'retest-due'; day: number; practices: number; minutes: number }
  | { kind: 'result'; day: number; practices: number; verdict: VerdictWord }

export interface TodayModel {
  mode: 'empty' | 'sample' | 'player'
  painPause: boolean
  matchDay: boolean
  last: SessionBundle | null
  /** Sessions (own, or sample in sample mode) newest first. */
  sessions: SessionBundle[]
  experiment: ExperimentRecord | null
  step: ExperimentStep | null
  /** Matched sessions with ≥ 8 included serves, when fewer than 2 exist (METRICS §4.1). */
  baseline: { have: number; need: 2 } | null
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

export function todayModel(input: {
  bundles: readonly SessionBundle[]
  experiments: readonly ExperimentRecord[]
  practiceLogs: readonly PracticeLogRecord[]
  profile: ProfileRecord | null
  now: Date
}): TodayModel {
  const ready = input.bundles.filter((b) => b.session.status === 'ready')
  const own = ready.filter((b) => b.session.isDemo === 0)
  const sample = ready.filter((b) => b.session.isDemo === 1)
  const mode: TodayModel['mode'] = own.length ? 'player' : sample.length ? 'sample' : 'empty'
  const sessions = [...(mode === 'player' ? own : sample)].sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
  const last = sessions[0] ?? null
  const painPause = input.profile?.comfort.painFlag === 1
  const wantDemo = mode === 'sample' ? 1 : 0
  const experiment = input.experiments.find((e) => e.status === 'active' && (e.isDemo ?? 0) === wantDemo) ?? null
  const step = experiment ? experimentStep(experiment, input.practiceLogs.filter((l) => (l.isDemo ?? 0) === wantDemo), input.now) : null

  let baseline: TodayModel['baseline'] = null
  if (mode === 'player' && last) {
    const enough = (b: SessionBundle) => (b.session.analysis?.counts.included ?? 0) >= 8
    const have = own.filter((b) => enough(b) && matched(b, last)).length
    if (have < 2) baseline = { have, need: 2 }
  }

  const hour = input.now.getHours()
  const matchDay = Boolean(input.profile?.matchNights.includes(WEEKDAYS[input.now.getDay()])) && hour >= 12 && !painPause
  const welcomeBack = mode === 'player' && last ? daysBetween(last.session.startedAt, input.now) >= 14 : false
  return { mode, painPause, matchDay, last, sessions, experiment, step, baseline, welcomeBack }
}

/** "View from behind, 12 serves" / "Side view, 22 serves". */
export function sessionLine(s: SessionRecord): string {
  const n = s.analysis?.counts.analysed ?? 0
  return `${s.view === 'rear' ? 'View from behind' : 'Side view'}, ${n} ${n === 1 ? 'serve' : 'serves'}`
}
