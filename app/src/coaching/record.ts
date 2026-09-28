/**
 * Engine decision -> stored record. Type-only imports from the data layer; no runtime dependency.
 */
import type { CoachingDecision as StoredDecision, RuleTraceEntry } from '../data/domain.ts'
import type { CoachingRecord } from '../data/records.ts'
import { getItem } from './library.ts'
import type { CoachingDecision, FocusDecision, TraceEntry } from './types.ts'

const TRACE_STEP: Record<TraceEntry['step'], RuleTraceEntry['step']> = {
  safety: 'safety',
  age: 'safety',
  'match-day': 'safety',
  data: 'confidence',
  pinned: 'candidate',
  experiment: 'candidate',
  candidate: 'candidate',
  rank: 'chain-order',
  select: 'select',
  cue: 'cue',
  drill: 'drill',
}

/**
 * The stored record for a decision (ARCHITECTURE §6.5 shape; COACHING §7.8 mapping). The analysis
 * pipeline calls this as `toCoachingRecord(decision, { sessionId })` after `decideFocus`.
 */
export function toCoachingRecord(
  d: CoachingDecision,
  context: { sessionId?: string; id?: string; isDemo?: boolean; experimentId?: string } = {},
): CoachingRecord {
  const id = context.id ?? `dec-${d.sessionId}-${d.kind === 'focus' || d.kind === 'keep-going' ? d.itemId : d.kind}`
  const opts = context
  const gate: StoredDecision['gate'] =
    d.kind === 'referral' ? 'pain-referral' : d.kind === 'capture-fix' ? (d.usableServes < 6 ? 'too-few-serves' : 'low-confidence') : 'ok'
  const base: CoachingRecord = {
    id,
    sessionId: d.sessionId,
    createdAt: d.createdAt,
    libraryVersion: d.libraryVersion,
    engineVersion: d.engineVersion,
    gate,
    alternatives: [],
    trace: d.trace.map((t) => ({ step: TRACE_STEP[t.step], ...(t.itemId ? { faultId: getItem(t.itemId)?.faultId ?? t.itemId } : {}), passed: t.passed, detail: t.detail })),
    phrasing: { source: 'template' },
    ...(opts.experimentId ? { experimentId: opts.experimentId } : {}),
    ...(opts.isDemo ? { isDemo: 1 as const } : {}),
  }
  if (d.kind === 'referral') return { ...base, referral: { message: d.copy.title } }
  if (d.kind === 'capture-fix') return { ...base, captureFix: { message: d.message, ...(d.fix ? { fix: d.fix } : {}), usableServes: d.usableServes } }
  if (d.kind === 'focus' || d.kind === 'keep-going') {
    const focus = d.kind === 'focus' ? (d as FocusDecision) : undefined
    return {
      ...base,
      focus: {
        faultId: focus?.faultId ?? 'none',
        title: d.title,
        phase: focus?.phase ?? 'contact',
        evidenceTier: d.effectiveTier,
        // A reason that names a comfort setting is stored in its neutral form (D8; RankReason.storedText).
        whyChosen: focus ? focus.reasons.map((r) => r.storedText ?? r.text).filter(Boolean).join(' ') : d.whyItMatters,
      },
      ...(focus && focus.evidence.keyServeId && focus.evidence.keyFrameEvent
        ? {
            evidence: {
              event: focus.evidence.keyFrameEvent,
              keyFrameId: `${focus.evidence.keyServeId}-${focus.evidence.keyFrameEvent}-evidence`,
              ...(focus.evidence.compareServeId ? { compareKeyFrameId: `${focus.evidence.compareServeId}-${focus.evidence.keyFrameEvent}-evidence` } : {}),
              metricIds: focus.evidence.stats.map((s) => s.metricId),
              sentences: [focus.whyItMatters],
            },
          }
        : {}),
      ...(focus?.stratum ? { stratum: focus.stratum } : {}),
      cue: { id: d.cue.id, text: d.cue.text, style: d.cue.register === 'analogy' ? 'analogy' : 'external-target' },
      drill: { id: d.drill.id, title: d.drill.name, minutes: d.drill.minutes, steps: d.drill.steps, equipment: ['Ball basket'] },
      // Today's soreness is session only (COACHING §9.3; D8): never stored as part of the decision.
      alternatives: (focus?.alsoConsidered ?? []).filter((c) => !c.soreToday).map((c) => ({ faultId: getItem(c.itemId)?.faultId ?? c.itemId, reason: c.text })),
    }
  }
  return base
}

