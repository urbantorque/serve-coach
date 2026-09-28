/**
 * Adapters between the data layer (ARCHITECTURE records) and the coaching engine (COACHING §7.1).
 * Pure functions: the hooks in useFocus.ts read the records and call these.
 */
import type { MetricId, MetricValue } from '../../../analysis/types.ts'
import {
  experimentBlocks,
  getItem,
  itemByFaultId,
  normaliseProfile,
  primarySpec,
  rederiveRetests,
  retestVisitsOf,
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
  /** How many blocks of this template the session's visit holds (real block numbers, CAPTURE §5.5). */
  visit: { blocksInVisit?: number } = {},
): CoachingSession {
  const tagBy = new Map(tags.map((t) => [t.serveId, t]))
  const ordered = [...serves].sort((a, b) => a.index - b.index)
  // An "Experiment" recording that holds both blocks: Block A before the drill's pause, Block B after
  // (coaching experimentBlocks; CAPTURE §5.5). Only Block A can count towards a verdict (§12.3).
  const blocks = rec.template === 'experiment' ? experimentBlocks(ordered.map((s) => s.window?.tStartReal)) : undefined
  const cServes: CoachingServe[] = ordered.map((s, i) => {
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
      ...(blocks ? { block: blocks[i] } : {}),
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
    // The practice visit (local day): a block recorded after the drill that day is never a re-test.
    ...(rec.visitId ? { visitId: rec.visitId } : {}),
    // The recording's block in its visit: an Experiment visit's Block B never reaches a baseline or a re-test.
    ...(rec.blockIndex && rec.blockIndex > 0 ? { blockIndex: rec.blockIndex } : {}),
    ...(visit.blocksInVisit && visit.blocksInVisit > 0 ? { blocksInVisit: visit.blocksInVisit } : {}),
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
    ...(start?.visitId ? { startedVisitId: start.visitId } : {}),
    stratum: e.stratum,
    cueRegister: registerFromCueId(e.cueId) ?? 'outcome',
    drillVariant: variantFromDrillId(e.drillId),
    retests: [],
    status: e.status === 'active' ? 'active' : e.status === 'completed' ? 'worked' : 'parked',
  }
  // Each later visit's re-test is its first recording in the stratum; a block after the drill that
  // day is same-session (§12.3), so it is never attached, pooled or judged as a re-test.
  exp.retestVisits = retestVisitsOf(exp, sessions)
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
    ...(l.createdAt ? { createdAt: l.createdAt } : {}),
  }
}

/** The stored experiment for a focus the player starts working on (§12.1 -> ARCHITECTURE Experiment). */
export function toExperimentRecord(d: FocusDecision, decisionId: string, baselineSessionIds: string[], opts: { isDemo?: boolean } = {}): Omit<ExperimentRecord, 'id' | 'createdAt'> {
  // The item's own primary metric and direction (the one its verdict uses, coaching primarySpec), not
  // whichever evidence stat happened to be shown first: an experimental or missing first stat is
  // filtered out of the evidence and would otherwise name the experiment after another metric.
  const it = getItem(d.itemId)
  const spec = it ? primarySpec(it, normaliseProfile({ level: 'unknown', goal: 'first-serves-in', comfortRegions: [], heightM: 1.75, showExperimental: false })) : undefined
  const primary = (spec?.displayId ?? d.evidence.stats[0]?.metricId ?? 'serve-in-rate') as MetricId
  // A target band of [0, high edge] (toss drop) means lower is better.
  const direction = spec ? (spec.direction === 'increase' ? 'increase' : 'decrease') : d.evidence.stats[0]?.metricId?.endsWith('-spread') ? 'decrease' : 'increase'
  return {
    status: 'active',
    decisionId,
    faultId: d.faultId,
    cueId: `${d.itemId}:${d.cue.register}`,
    drillId: d.drill.id,
    primaryMetricId: primary,
    secondaryMetricIds: d.evidence.stats.map((s) => s.metricId).filter((id) => id !== primary),
    direction,
    stratum: d.stratum,
    baselineSessionIds,
    retestSessionIds: [],
    ...(opts.isDemo ? { isDemo: 1 as const } : {}),
  }
}
