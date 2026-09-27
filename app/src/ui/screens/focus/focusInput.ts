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
  cooldownsFrom,
  getItem,
  itemByFaultId,
  type EndedExperiment,
} from '../../../coaching/index.ts'
import {
  getActiveExperiment,
  getProfile,
  getStats,
  getTally,
  listExperiments,
  listMatchLogs,
  listPracticeByExperiment,
  listPracticeSince,
  listServesBySession,
  listSessions,
  listTags,
} from '../../../data/index.ts'
import { SAMPLE_PROFILE } from '../../../data/sample.ts'
import type { ExperimentRecord, MatchLogRecord, PracticeLogRecord, ProfileRecord, SessionRecord } from '../../../data/records.ts'
import { canonicalVerdict } from '../../../integration/verdict.ts'
import { toCoachingExperiment, toCoachingProfile, toCoachingSession, toPracticeSummary } from './adapter.ts'
import { todayYmd } from './focusStore.ts'

type Loaded = { record: SessionRecord; session: CoachingSession }

/** What the load guidance counts over its window (COACHING §11.2; METRICS §4.8 needs 35 days). */
export interface LoadEvents {
  /** Every ready session in the window with its analysed serve count. */
  sessions: { startedAt: string; serves: number }[]
  /** Every practice log in the window (drill serves), whatever experiment it belongs to. */
  practice: PracticeLogRecord[]
  /** Match logs in the window: about 10 serves per service game plus 10 warm-up serves (load only). */
  matches: MatchLogRecord[]
}

export interface FocusRaw {
  /** Newest first; the detection history (newest 12). */
  sessions: Loaded[]
  /**
   * The active experiment's own sessions outside the newest 12 (its start, baseline candidates and
   * re-tests), so a long experiment keeps its baseline. Read by the verdict only, never by detection.
   */
  experimentSessions: Loaded[]
  profile: ProfileRecord | null
  experiment?: ExperimentRecord
  /** Finished, parked or superseded experiments of the same kind of data (cooldowns, COACHING §7.4). */
  endedExperiments: ExperimentRecord[]
  logs: PracticeLogRecord[]
  load: LoadEvents
  isDemo: boolean
}

const HISTORY_LIMIT = 12
/** Sessions at or before an experiment's start searched for its baseline (up to 3 matched, METRICS §4.5). */
const BASELINE_LOOKBACK = 8
/** Later sessions kept for an experiment's follow-up pools and earlier re-tests. */
const FOLLOW_UP_LIMIT = 40
/** Days of history the load guidance reads (last 7 days + the 28 before them). */
const LOAD_DAYS = 36

async function load(record: SessionRecord): Promise<Loaded> {
  const [serves, tags, tally, stats] = await Promise.all([listServesBySession(record.id), listTags(record.id), getTally(record.id), getStats(record.id)])
  return { record, session: toCoachingSession(record, serves, tags, tally, stats) }
}

export async function readFocusData(now: Date = new Date()): Promise<FocusRaw> {
  const since = todayYmd(new Date(now.getTime() - LOAD_DAYS * 86_400_000))
  const [all, profile, experiments, practiceSince, matchLogs] = await Promise.all([
    listSessions({ includeDemo: true }),
    getProfile(),
    listExperiments(),
    listPracticeSince(since),
    listMatchLogs(),
  ])
  const ready = all.filter((s) => s.status === 'ready' && s.analysis)
  const real = ready.filter((s) => s.isDemo !== 1)
  const isDemo = real.length === 0
  const exp = await getActiveExperiment({ demo: isDemo })
  const ordered = (isDemo ? ready.filter((s) => s.isDemo === 1) : real).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  const pool = ordered.slice(0, HISTORY_LIMIT)
  const sessions = await Promise.all(pool.map(load))
  const experiment = exp && (exp.isDemo === 1) === isDemo ? exp : undefined
  // The experiment's own sessions, whatever their age (a long experiment must not lose its baseline).
  let experimentSessions: Loaded[] = []
  if (experiment) {
    const inPool = new Set(pool.map((s) => s.id))
    const own = new Set([...experiment.baselineSessionIds, ...experiment.retestSessionIds])
    const start = ordered.find((s) => s.id === experiment.baselineSessionIds.at(-1))
    const startAt = start?.startedAt ?? experiment.createdAt
    const before = ordered.filter((s) => s.startedAt <= startAt && s.view === experiment.stratum.view).slice(0, BASELINE_LOOKBACK)
    const after = ordered.filter((s) => s.startedAt > startAt && s.view === experiment.stratum.view).slice(0, FOLLOW_UP_LIMIT)
    const extra = new Map<string, SessionRecord>()
    for (const s of [...ordered.filter((x) => own.has(x.id)), ...before, ...after]) if (!inPool.has(s.id)) extra.set(s.id, s)
    experimentSessions = await Promise.all([...extra.values()].map(load))
  }
  const logs = experiment ? await listPracticeByExperiment(experiment.id) : []
  const sameKind = (r: { isDemo?: 0 | 1 }) => (r.isDemo === 1) === isDemo
  const sinceIso = new Date(now.getTime() - LOAD_DAYS * 86_400_000).toISOString()
  return {
    sessions,
    experimentSessions,
    profile: profile ?? null,
    experiment,
    endedExperiments: experiments.filter((e) => e.status !== 'active' && sameKind(e)),
    logs,
    load: {
      sessions: ordered.filter((s) => s.startedAt >= sinceIso).map((s) => ({ startedAt: s.startedAt, serves: s.analysis?.counts.analysed ?? 0 })),
      practice: practiceSince.filter(sameKind),
      matches: matchLogs.filter((m) => m.date >= since && sameKind(m)),
    },
    isDemo,
  }
}

/** The profile coaching sees: the sample player's own on sample data (never the player's). */
export function coachingProfileRecord(raw: Pick<FocusRaw, 'isDemo' | 'profile'>): ProfileRecord | null {
  return raw.isDemo ? SAMPLE_PROFILE : raw.profile
}

/** COACHING §11.2: match serves ≈ 10 × service games + 10 warm-up serves (load flag only). */
export const matchServes = (m: Pick<MatchLogRecord, 'serviceGames'>) => 10 * (m.serviceGames ?? 0) + 10

/**
 * Serve counts for the load guidance (COACHING §11.2; METRICS §4.8) from their own date window, not
 * from the detection history: recorded serves of every ready session in the window, drill serves from
 * every practice log, and match serves from the match log (never pooled with practice statistics).
 * `historyDays` and `sessionsInHistory` still describe only what is recorded in the app.
 */
export function loadFrom(events: LoadEvents, now: Date): LoadInput {
  const day = 86_400_000
  const all = [
    ...events.sessions.map((s) => ({ t: new Date(s.startedAt).getTime(), n: s.serves, session: true })),
    ...events.practice.map((l) => ({ t: new Date(`${l.date}T12:00:00`).getTime(), n: l.reps ?? 0, session: false })),
    ...events.matches.map((m) => ({ t: new Date(`${m.date}T19:00:00`).getTime(), n: matchServes(m), session: false })),
  ].filter((e) => Number.isFinite(e.t) && e.t <= now.getTime())
  const age = (t: number) => (now.getTime() - t) / day
  const sum = (lo: number, hi: number) => all.filter((e) => age(e.t) >= lo && age(e.t) < hi).reduce((a, e) => a + e.n, 0)
  const first = all.length ? Math.min(...all.map((e) => e.t)) : now.getTime()
  const last = all.length ? Math.max(...all.map((e) => e.t)) : undefined
  const today = todayYmd(now)
  const yesterday = todayYmd(new Date(now.getTime() - day))
  return {
    last7Days: sum(0, 7),
    chronicWeeklyMean: sum(7, 35) / 4,
    historyDays: Math.floor(age(first)),
    sessionsInHistory: all.filter((e) => e.session).length,
    ...(last !== undefined ? { daysSinceLastServes: Math.floor(age(last)) } : {}),
    servesToday: all.filter((e) => todayYmd(new Date(e.t)) === today).reduce((a, e) => a + e.n, 0),
    servesYesterday: all.filter((e) => todayYmd(new Date(e.t)) === yesterday).reduce((a, e) => a + e.n, 0),
  }
}

/**
 * Cooldowns (COACHING §7.4) from the experiments that ended: worked items rest 2 sessions, parked or
 * superseded ones 3, counted from the session whose decision ended them.
 */
export function cooldownsFor(ended: readonly ExperimentRecord[], sessionsById: ReadonlyMap<string, { startedAt: string }>, pool: readonly { startedAt: string }[], currentStartedAt: string): Record<string, number> {
  const list: EndedExperiment[] = []
  for (const e of ended) {
    const itemId = itemByFaultId(e.faultId)?.id ?? getItem(e.cueId.split(':')[0])?.id
    if (!itemId) continue
    const endedAt =
      (e.endedSessionId ? sessionsById.get(e.endedSessionId)?.startedAt : undefined) ??
      e.endedAt ??
      (e.retestSessionIds.length ? sessionsById.get(e.retestSessionIds.at(-1)!)?.startedAt : undefined) ??
      e.result?.computedAt
    if (!endedAt) continue
    list.push({ itemId, kind: e.status === 'completed' ? 'worked' : 'parked', endedAt })
  }
  return cooldownsFrom(list, pool, currentStartedAt)
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
  /** Earlier sessions the "Did it work?" verdict reads: the history plus the experiment's own older sessions. */
  verdictHistory: CoachingSession[]
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
  // The experiment's sessions outside the newest 12, never later than the session decided on.
  const extra = (raw.experimentSessions ?? []).map((s) => s.session).filter((s) => s.startedAt <= latest.session.startedAt && s.id !== latest.session.id)
  const forExperiment = [...upToLatest, ...extra].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
  const experiment = raw.experiment ? toCoachingExperiment(raw.experiment, forExperiment, profile, latest.session.id, canonicalVerdict) : undefined
  if (experiment && o.cueOverride?.[experiment.itemId]) experiment.cueRegister = o.cueOverride[experiment.itemId]
  const now = o.now
  const logs: PracticeLogSummary[] = raw.logs.filter((l) => l.date <= todayYmd(now)).map(toPracticeSummary)
  const known = new Map([...raw.sessions, ...(raw.experimentSessions ?? [])].map((s) => [s.record.id, { startedAt: s.record.startedAt }]))
  const cooldowns = cooldownsFor(raw.endedExperiments ?? [], known, raw.sessions.map((s) => s.record), latest.record.startedAt)
  const input: CoachingInput = {
    profile,
    session: latest.session,
    history: upToLatest.slice(1),
    ...(extra.length ? { experimentHistory: extra } : {}),
    ...(experiment ? { activeExperiment: experiment } : {}),
    practiceLogs: logs,
    ...(o.bodyCheck ? { bodyCheck: o.bodyCheck } : {}),
    ...(o.painFlag ? { painFlag: true } : {}),
    ...(o.referral ? { activeReferral: o.referral } : {}),
    matchDay: o.matchDay ?? false,
    ...(Object.keys(cooldowns).length ? { cooldowns } : {}),
    load: loadFrom(raw.load ?? { sessions: upToLatest.map((s) => ({ startedAt: s.startedAt, serves: s.serves.length })), practice: raw.logs, matches: [] }, now),
    verdict: canonicalVerdict,
    now: now.toISOString(),
  }
  return { input, profile, latest, ...(experiment ? { experiment } : {}), heightM, verdictHistory: [...upToLatest.slice(1), ...extra] }
}
