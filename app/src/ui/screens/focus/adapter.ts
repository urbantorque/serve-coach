/**
 * Adapters between the data layer (ARCHITECTURE records) and the coaching engine (COACHING §7.1).
 * Pure functions: the hooks in useFocus.ts read the records and call these.
 */
import type { MetricId, MetricValue } from '../../../analysis/types.ts'
import {
  getItem,
  itemByFaultId,
  normaliseProfile,
  rederiveRetests,
  type CoachingExperiment,
  type CoachingProfile,
  type CoachingServe,
  type CoachingSession,
  type CueRegister,
  type DrillVariant,
  type FocusDecision,
  type PracticeLogSummary,
  type VerdictFn,
} from '../../../coaching/index.ts'
import type { SessionStats } from '../../../data/domain.ts'
import type {
  ExperimentRecord,
  PracticeLogRecord,
  ProfileRecord,
  ServeRecord,
  ServeTagRecord,
  SessionRecord,
  SessionTallyRecord,
} from '../../../data/records.ts'
import { sessionSetupKey } from '../../format/sessionValues.ts'

export function toCoachingSession(
  rec: SessionRecord,
  serves: readonly ServeRecord[],
  tags: readonly ServeTagRecord[],
  tally: SessionTallyRecord | null | undefined,
  stats: SessionStats | null | undefined,
): CoachingSession {
  const tagBy = new Map(tags.map((t) => [t.serveId, t]))
  const cServes: CoachingServe[] = [...serves]
    .sort((a, b) => a.index - b.index)
    .map((s) => {
      const t = tagBy.get(s.id)
      const derived = (stats?.derivedPerServe?.[s.id] ?? {}) as Partial<Record<MetricId, MetricValue>>
      return {
        id: s.id,
        index: s.index,
        included: s.includedFlag === undefined ? s.included : s.includedFlag === 1,
        metrics: { ...s.metrics, ...derived },
        ...(t?.outcome ? { outcome: t.outcome } : {}),
        ...(t?.side ? { courtSide: t.side } : {}),
        ...(t?.serveNumber ? { serveNumber: t.serveNumber } : {}),
        ...(t?.intendedType ? { intendedType: t.intendedType } : {}),
      }
    })
  const useTally = tally && (tally.conflictResolution === 'tally' || !tags.some((t) => t.outcome))
  const fatigue = stats?.metrics['fatigue-flag']
  // The set-up key every screen matches on (older sessions derive it from their capture summary).
  const setupKey = sessionSetupKey(rec, stats)
  return {
    id: rec.id,
    startedAt: rec.startedAt,
    view: rec.view,
    ...(rec.cameraSide ? { cameraSide: rec.cameraSide } : {}),
    handedness: rec.analysis?.capture.handedness.profile ?? serves[0]?.handedness ?? 'right',
    fpsClass: rec.fpsClass ?? rec.analysis?.capture.fpsClass ?? 'fps60',
    ...(rec.setup ? { setup: rec.setup } : {}),
    ...(setupKey ? { setupKey } : {}),
    captureQuality: rec.analysis?.capture.quality.overall ?? 'usable',
    qualityChecks: rec.analysis?.capture.quality.checks ?? [],
    serves: cServes,
    defaults: {
      ...(rec.defaultSide ? { courtSide: rec.defaultSide } : {}),
      ...(rec.defaultServeNumber ? { serveNumber: rec.defaultServeNumber } : {}),
      ...(rec.defaultIntendedType ? { intendedType: rec.defaultIntendedType } : {}),
    },
    ...(useTally && tally
      ? { tally: { firstServes: tally.firstServes, secondServes: tally.secondServes, doubleFaults: tally.doubleFaults } }
      : {}),
    ...(stats ? { strata: stats.strata.map((s) => ({ key: s.key, metrics: s.metrics })), metrics: stats.metrics } : {}),
    flags: { fatigue: fatigue?.flag === true || fatigue?.value === 'yes' },
    ...(stats?.bestServeId ? { bestServeId: stats.bestServeId } : {}),
    ...(stats?.representativeServeId ? { representativeServeId: stats.representativeServeId } : {}),
    ...(rec.template ? { template: rec.template } : {}),
    isDemo: rec.isDemo === 1,
  }
}

export function toCoachingProfile(p: ProfileRecord | null | undefined, showExperimental: boolean, cueRegister?: CueRegister): CoachingProfile {
  return {
    level: p?.level ?? 'unknown',
    ...(p?.utr !== undefined ? { utr: p.utr } : {}),
    goal: p?.goal ?? 'first-serves-in',
    comfortRegions: p?.comfortRegions ?? [],
    heightM: p?.heightM ?? 1.75,
    ageBand: p?.ageBand ?? '18-plus',
    handedness: p?.handedness ?? 'right',
    showExperimental,
    ...(p?.pinnedFocusItemId ? { pinnedFocusItemId: p.pinnedFocusItemId } : {}),
    ...(cueRegister ? { cueRegister } : {}),
  }
}

export const registerFromCueId = (cueId: string | undefined): CueRegister | undefined =>
  cueId?.includes(':analogy') ? 'analogy' : cueId?.includes(':outcome') ? 'outcome' : undefined

const variantFromDrillId = (drillId: string | undefined): DrillVariant => {
  const v = drillId?.split(':')[1]
  return v === 'progression' || v === 'progression-alt' || v === 'regression' ? v : 'base'
}

/** The stored experiment as the engine sees it; earlier re-test verdicts are re-derived from sessions. */
export function toCoachingExperiment(
  e: ExperimentRecord,
  sessions: readonly CoachingSession[],
  profile: CoachingProfile,
  currentSessionId: string,
  verdict?: VerdictFn,
): CoachingExperiment | undefined {
  const it = itemByFaultId(e.faultId) ?? getItem(e.cueId.split(':')[0])
  if (!it) return undefined
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const start = byId.get(e.baselineSessionIds.at(-1) ?? '')
  const exp: CoachingExperiment = {
    id: e.id,
    itemId: it.id,
    faultId: it.faultId ?? e.faultId,
    startedSessionId: start?.id ?? e.baselineSessionIds.at(-1) ?? '',
    startedAt: start && start.startedAt > e.createdAt ? start.startedAt : e.createdAt,
    stratum: e.stratum,
    cueRegister: registerFromCueId(e.cueId) ?? 'outcome',
    drillVariant: variantFromDrillId(e.drillId),
    retests: [],
    status: e.status === 'active' ? 'active' : e.status === 'completed' ? 'worked' : 'parked',
  }
  const earlier = e.retestSessionIds.filter((id) => id !== currentSessionId).map((id) => byId.get(id)).filter((s): s is CoachingSession => !!s)
  exp.retests = rederiveRetests(exp, earlier, sessions, normaliseProfile(profile), verdict)
  return exp
}

export function toPracticeSummary(l: PracticeLogRecord): PracticeLogSummary {
  return {
    date: l.date,
    ...(l.itemId ? { itemId: l.itemId } : {}),
    ...(l.drillVariant ? { drillVariant: l.drillVariant } : {}),
    ...(l.successCriterionMet ? { successCriterionMet: l.successCriterionMet } : {}),
    ...(l.feel ? { feel: l.feel } : {}),
    ...(l.cueHelpful ? { cueHelpful: l.cueHelpful } : {}),
    ...(l.body ? { body: l.body } : {}),
    ...(l.reps !== undefined ? { approxServes: l.reps } : {}),
  }
}

/** The stored experiment for a focus the player starts working on (§12.1 -> ARCHITECTURE Experiment). */
export function toExperimentRecord(d: FocusDecision, decisionId: string, baselineSessionIds: string[], opts: { isDemo?: boolean } = {}): Omit<ExperimentRecord, 'id' | 'createdAt'> {
  const spread = d.evidence.stats[0]?.metricId?.endsWith('-spread')
  const primary = (d.evidence.stats[0]?.metricId ?? getItem(d.itemId)?.detection.metricIds[0] ?? 'serve-in-rate') as MetricId
  return {
    status: 'active',
    decisionId,
    faultId: d.faultId,
    cueId: `${d.itemId}:${d.cue.register}`,
    drillId: d.drill.id,
    primaryMetricId: primary,
    secondaryMetricIds: d.evidence.stats.slice(1).map((s) => s.metricId),
    direction: spread || d.itemId === 'toss-within-reach' || d.itemId === 'flowing-motion' ? 'decrease' : 'increase',
    stratum: d.stratum,
    baselineSessionIds,
    retestSessionIds: [],
    ...(opts.isDemo ? { isDemo: 1 as const } : {}),
  }
}
