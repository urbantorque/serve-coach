/**
 * The ONE session value per metric, and the sentences built from it. Every screen that shows a
 * session's number (report headline and tiles, Today, the focus card, Compare, Progress, Metric info)
 * reads it through `sessionMetric` and prints it through `formatMetric` (METRICS §4.9 precision via
 * analysis/metrics/precision.ts), so the same quantity reads the same everywhere.
 *
 * - A session value is the engine's stored stratum summary (METRICS §1.6): the named stratum's, or
 *   the headline stratum's. It is never recomputed on a screen.
 * - "Did it work?" sides show the session's own value when the side is one session; a pooled side
 *   (several sessions) shows the pooled comparison value, labelled with its session count.
 * - The headline is rebuilt from the stored values with the engine's own sentence
 *   (analysis/metrics/headline.ts) and the capture line's counts, so older sessions read like new ones.
 */
import { sessionHeadline } from '../../analysis/metrics/headline.ts'
import { distanceFromSummary, sameSetup, setupKeyOf } from '../../analysis/metrics/setup.ts'
import type { MetricId, MetricStatus, MetricValue } from '../../analysis/types.ts'
import type { MatchedComparison, SessionStats, StratumKey } from '../../data/domain.ts'
import type { SessionRecord } from '../../data/records.ts'

/** Stratum id without the set-up (the set-up is matched separately, with older sessions as wildcards). */
export function stratumBaseId(k: Pick<StratumKey, 'view' | 'cameraSide' | 'courtSide' | 'serveNumber' | 'intendedType' | 'handedness'>): string {
  return [k.view, k.cameraSide, k.courtSide, k.serveNumber, k.intendedType, k.handedness].join('|')
}

type StatsLike = Pick<SessionStats, 'metrics' | 'strata'> | null | undefined

/**
 * The canonical session value of a metric (METRICS §1.6): the stored value of the named stratum, or
 * of the headline stratum (`stats.metrics`, the stratum with the most included serves) when no
 * stratum is named. A session with several strata that lacks the named one has no value for it
 * (strata never pool); with one stratum or none stored, its session value stands (the same rule as
 * coaching's `metricsValue`, so the focus card and the report agree).
 */
export function sessionMetric(stats: StatsLike, metricId: MetricId | string, stratum?: Partial<StratumKey> | null): MetricValue | undefined {
  if (!stats) return undefined
  const strata = stats.strata ?? []
  if (stratum && stratum.view && strata.length) {
    const want = stratumBaseId(stratum as StratumKey)
    const hit = strata.find((s) => stratumBaseId(s.key) === want)
    // Session-level-only metrics (rates from tags, capture quality) are not stored per stratum.
    if (hit) return hit.metrics[metricId as MetricId] ?? stats.metrics[metricId as MetricId]
    if (strata.length > 1) return undefined
  }
  return stats.metrics[metricId as MetricId]
}

/**
 * The session's set-up key (analysis/metrics/setup.ts): the engine's when stored, else derived from
 * the stored analysis summary (orientation and camera distance) for sessions analysed before the key
 * existed. The record's serving spot fills in when the key has none.
 */
export function sessionSetupKey(session: Pick<SessionRecord, 'orientation' | 'servingSpot' | 'analysis'>, stats?: Pick<SessionStats, 'setupKey' | 'strata'> | null): string | undefined {
  const stored = stats?.setupKey ?? stats?.strata?.find((s) => s.key.setup)?.key.setup
  if (stored) {
    if (session.servingSpot && stored.endsWith('|unknown')) return `${stored.slice(0, -'unknown'.length)}${session.servingSpot}`
    return stored
  }
  const a = session.analysis
  if (!a) return undefined
  const orientation = session.orientation ?? a.capture.rectification.orientation
  const distanceM = distanceFromSummary({
    fovDeg: a.capture.rectification.fovDeg,
    width: a.capture.meta.width,
    height: a.capture.meta.height,
    bodyHeightHU: a.capture.scale.bodyHeightHU,
    heightM: a.capture.scale.heightM,
  })
  return setupKeyOf({ orientation, distanceM, servingSpot: session.servingSpot })
}

/** Same set-up for matching (METRICS §4.4); unknown parts match. */
export function sameSessionSetup(a: string | undefined, b: string | undefined): boolean {
  return sameSetup(a, b)
}

/** The session headline sentence from the stored values (same counts as the capture line). */
export function headlineFor(session: Pick<SessionRecord, 'analysis'>, stats: SessionStats | null | undefined): string | null {
  const a = session.analysis
  if (!stats || !a) return stats?.headline ?? null
  const strata = stats.strata?.length ? stats.strata : [{ key: { courtSide: 'unknown' as const }, metrics: stats.metrics }]
  return sessionHeadline({ metrics: stats.metrics, strata, measured: a.counts.included, detected: a.counts.analysed })
}

/** One focus-card stat: a metric and the value shown for it. */
export interface DecisionStat {
  metricId: MetricId
  value: MetricValue
}

/**
 * The evidence stats of a stored coaching decision (COACHING §8.2): the canonical session value of
 * each evidence metric in the decision's own stratum (stored on the decision; older decisions fall
 * back to the headline stratum), measured or estimated only. Today, the report's focus card and the
 * focus screen all read it here, so the focus shows the same number as the report's tiles.
 */
export function decisionEvidence(
  decision: { evidence?: { metricIds: readonly MetricId[] }; stratum?: Partial<StratumKey> } | null | undefined,
  stats: StatsLike,
): DecisionStat[] {
  if (!decision?.evidence) return []
  return decision.evidence.metricIds
    .map((metricId) => ({ metricId, value: sessionMetric(stats, metricId, decision.stratum) }))
    .filter((e): e is DecisionStat => e.value?.status === 'measured' || e.value?.status === 'estimated')
}

/** One side of a stored "Did it work?" result. */
export type ComparisonSide = MatchedComparison['baseline']

/**
 * A one-session side's own stored value for the experiment's stratum (the canonical session value),
 * or undefined for a pooled side, a missing session or an unavailable value.
 */
export function ownSessionValue(
  metricId: MetricId,
  side: Pick<ComparisonSide, 'sessionIds'>,
  sessions: readonly { session: { id: string }; stats: StatsLike }[],
  stratum: Partial<StratumKey> | null | undefined,
): MetricValue | undefined {
  // A spread pools within-session variances (METRICS §4.2): a listed session with fewer than 2 serves
  // in the stratum adds nothing, so a side whose other sessions are like that is one session.
  const contributes = (id: string) => {
    if (!metricId.endsWith('-spread')) return true
    const s = sessions.find((x) => x.session.id === id)
    return !s || (sessionMetric(s.stats, metricId, stratum)?.n ?? 0) >= 2
  }
  const ids = side.sessionIds.filter(contributes)
  if (ids.length !== 1) return undefined
  const own = sessions.find((s) => s.session.id === ids[0])
  const v = own ? sessionMetric(own.stats, metricId, stratum) : undefined
  return v && typeof v.value === 'number' && v.status !== 'unavailable' ? v : undefined
}

/**
 * The value a "Did it work?" side shows. One session: that session's own stored value for the
 * experiment's stratum (the canonical number the report, Today and Progress show). Several sessions:
 * the pooled comparison value with its interval and n, as a derived estimate.
 */
export function sideMetric(
  metricId: MetricId,
  side: ComparisonSide,
  sessions: readonly { session: { id: string }; stats: StatsLike }[],
  stratum: Partial<StratumKey> | null | undefined,
  pooledStatus: Exclude<MetricStatus, 'unavailable'>,
): MetricValue {
  const own = ownSessionValue(metricId, side, sessions, stratum)
  if (own) return own
  return {
    id: metricId,
    value: side.value,
    unit: '',
    status: pooledStatus,
    confidence: 1,
    basis: side.sessionIds.length > 1 ? `Pooled over ${side.sessionIds.length} matched sessions (METRICS §4.2).` : 'From the stored comparison.',
    n: side.n,
    ...(Number.isFinite(side.low) && Number.isFinite(side.high) && side.high > side.low ? { uncertainty: { kind: 'ci95' as const, low: side.low, high: side.high } } : {}),
  }
}
