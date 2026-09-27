/**
 * What the coaching engine needs, read from the data layer and turned into a CoachingInput. Shared by
 * the live /focus model (useFocus.ts) and the stored-decision sync (integration/coachingSync.ts), so
 * the focus screen and Today always see the same decision. No React here.
 *
 * Real sessions win; demo sessions are used only when there are no real ones, and they never mix
 * (PRODUCT §4.4 rule 11).
 */
import type {
  BodyCheck,
  CoachingExperiment,
  CoachingInput,
  CoachingProfile,
  CoachingSession,
  CueRegister,
  LoadInput,
  PracticeLogSummary,
  ReferralLevel,
} from '../../../coaching/index.ts'
import {
  getActiveExperiment,
  getProfile,
  getStats,
  getTally,
  listPracticeByExperiment,
  listServesBySession,
  listSessions,
  listTags,
} from '../../../data/index.ts'
import { SAMPLE_PROFILE } from '../../../data/sample.ts'
import type { ExperimentRecord, PracticeLogRecord, ProfileRecord, SessionRecord } from '../../../data/records.ts'
import { canonicalVerdict } from '../../../integration/verdict.ts'
import { toCoachingExperiment, toCoachingProfile, toCoachingSession, toPracticeSummary } from './adapter.ts'
import { todayYmd } from './focusStore.ts'

export interface FocusRaw {
  /** Newest first. */
  sessions: { record: SessionRecord; session: CoachingSession }[]
  profile: ProfileRecord | null
  experiment?: ExperimentRecord
  logs: PracticeLogRecord[]
  isDemo: boolean
}

const HISTORY_LIMIT = 12

export async function readFocusData(): Promise<FocusRaw> {
  const [all, profile] = await Promise.all([listSessions({ includeDemo: true }), getProfile()])
  const ready = all.filter((s) => s.status === 'ready' && s.analysis)
  const real = ready.filter((s) => s.isDemo !== 1)
  const isDemo = real.length === 0
  const exp = await getActiveExperiment({ demo: isDemo })
  const pool = (isDemo ? ready.filter((s) => s.isDemo === 1) : real)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, HISTORY_LIMIT)
  const sessions = await Promise.all(
    pool.map(async (record) => {
      const [serves, tags, tally, stats] = await Promise.all([listServesBySession(record.id), listTags(record.id), getTally(record.id), getStats(record.id)])
      return { record, session: toCoachingSession(record, serves, tags, tally, stats) }
    }),
  )
  const experiment = exp && (exp.isDemo === 1) === isDemo ? exp : undefined
  const logs = experiment ? await listPracticeByExperiment(experiment.id) : []
  return { sessions, profile: profile ?? null, experiment, logs, isDemo }
}

/** The profile coaching sees: the sample player's own on sample data (never the player's). */
export function coachingProfileRecord(raw: Pick<FocusRaw, 'isDemo' | 'profile'>): ProfileRecord | null {
  return raw.isDemo ? SAMPLE_PROFILE : raw.profile
}

/** Serve counts for the load guidance (COACHING §11.2): recorded serves plus logged drill serves. */
export function loadFrom(sessions: readonly CoachingSession[], logs: readonly PracticeLogRecord[], now: Date): LoadInput {
  const day = 86_400_000
  const events = [
    ...sessions.map((s) => ({ t: new Date(s.startedAt).getTime(), n: s.serves.length })),
    ...logs.map((l) => ({ t: new Date(`${l.date}T12:00:00`).getTime(), n: l.reps ?? 0 })),
  ].filter((e) => e.t <= now.getTime())
  const age = (t: number) => (now.getTime() - t) / day
  const sum = (lo: number, hi: number) => events.filter((e) => age(e.t) >= lo && age(e.t) < hi).reduce((a, e) => a + e.n, 0)
  const first = events.length ? Math.min(...events.map((e) => e.t)) : now.getTime()
  const last = events.length ? Math.max(...events.map((e) => e.t)) : undefined
  const today = todayYmd(now)
  return {
    last7Days: sum(0, 7),
    chronicWeeklyMean: sum(7, 35) / 4,
    historyDays: Math.floor(age(first)),
    sessionsInHistory: sessions.length,
    ...(last !== undefined ? { daysSinceLastServes: Math.floor(age(last)) } : {}),
    servesToday: events.filter((e) => todayYmd(new Date(e.t)) === today).reduce((a, e) => a + e.n, 0),
  }
}

export interface FocusInputOptions {
  experimental: boolean
  now: Date
  /** The session the decision is about (default: the newest). */
  sessionId?: string
  bodyCheck?: BodyCheck
  referral?: ReferralLevel
  painFlag?: boolean
  matchDay?: boolean
  cueOverride?: Record<string, CueRegister>
}

export interface BuiltFocusInput {
  input: CoachingInput
  profile: CoachingProfile
  latest: FocusRaw['sessions'][number]
  experiment?: CoachingExperiment
  heightM: number
}

/**
 * CoachingInput for one session: its matched history is every earlier session in the pool (never
 * later ones), the active experiment with its earlier re-tests re-derived, and the METRICS §4.5
 * verdict from analysis/stats (canonicalVerdict). Null when there is no analysed session.
 */
export function buildFocusInput(raw: FocusRaw, o: FocusInputOptions): BuiltFocusInput | null {
  const idx = o.sessionId ? raw.sessions.findIndex((s) => s.record.id === o.sessionId) : 0
  const latest = raw.sessions[idx]
  if (!latest) return null
  const profileRecord = coachingProfileRecord(raw)
  const heightM = profileRecord?.heightM ?? 1.75
  const profile = toCoachingProfile(profileRecord, o.experimental)
  const upToLatest = raw.sessions.slice(idx).map((s) => s.session)
  const experiment = raw.experiment ? toCoachingExperiment(raw.experiment, upToLatest, profile, latest.session.id, canonicalVerdict) : undefined
  if (experiment && o.cueOverride?.[experiment.itemId]) experiment.cueRegister = o.cueOverride[experiment.itemId]
  const now = o.now
  const logs: PracticeLogSummary[] = raw.logs.filter((l) => l.date <= todayYmd(now)).map(toPracticeSummary)
  const input: CoachingInput = {
    profile,
    session: latest.session,
    history: upToLatest.slice(1),
    ...(experiment ? { activeExperiment: experiment } : {}),
    practiceLogs: logs,
    ...(o.bodyCheck ? { bodyCheck: o.bodyCheck } : {}),
    ...(o.painFlag ? { painFlag: true } : {}),
    ...(o.referral ? { activeReferral: o.referral } : {}),
    matchDay: o.matchDay ?? false,
    load: loadFrom(upToLatest, raw.logs, now),
    verdict: canonicalVerdict,
    now: now.toISOString(),
  }
  return { input, profile, latest, ...(experiment ? { experiment } : {}), heightM }
}
