/**
 * "Did it work?" model (METRICS §4.4, §4.5; DESIGN §9.7, §10.11). PURE. The stored
 * `experiment.result` (integration/verdict.ts, run by the coaching sync after a re-test) is
 * authoritative. When it is missing, the SAME function builds it here from the sessions' per-serve
 * values (analysis/stats `didItWork` through `experimentResult`), so there is one verdict
 * implementation in the app and no UI-local statistics.
 *
 * Numbers shown: a side made of one session shows that session's own stored stratum value (the
 * canonical number its report, Today and Progress show, ui/format/sessionValues.ts); a side pooled
 * over several sessions shows the pooled comparison value, labelled as pooled.
 */
import { ci80FromCi95, median, MORE_SERVES_CAP, sdChiSquareInterval, VERDICT_PARAMS } from '../../../../analysis/stats/index.ts'
import type { MetricId, MetricStatus, MetricValue } from '../../../../analysis/types.ts'
import type { VerdictRequest, VerdictSide } from '../../../../coaching/types.ts'
import type { MatchedComparison, SessionStats, StratumKey, VerdictWord } from '../../../../data/domain.ts'
import type { ExperimentRecord, SessionRecord } from '../../../../data/records.ts'
import { experimentResult, TOO_SMALL_TO_CONFIRM_SERVES } from '../../../../integration/verdict.ts'
import { ownSessionValue, sessionMetric, sideMetric } from '../../../format/sessionValues.ts'
import { configFor } from './metricConfig.ts'
import { rateCounts } from './outcomes.ts'
import { apexCm, perServe, type ServeRow } from './serves.ts'

export type Interval = [number, number]

export interface Side {
  sessionIds: string[]
  n: number
  value: number
  low: number
  high: number
}

export interface CompareModel {
  metricId: MetricId
  verdict: VerdictWord
  /** "not-comparable" reason in words. */
  reason?: string
  before: Side
  after: Side
  /** The values shown for each side (canonical session values, or the pooled value). */
  beforeValue: MetricValue
  afterValue: MetricValue
  /** Extra serves to confirm; Infinity = too small to confirm by counting; undefined = settled. */
  moreServes?: number
  withinSession: boolean
  notes: string[]
  /** The stored result was used (true) or it was worked out on the phone from the sessions (false). */
  fromEngine: boolean
}

export interface SessionData {
  session: SessionRecord
  stats: SessionStats | null
  rows: ServeRow[]
}

/** The per-serve metric behind a spread, for the evidence strips (DESIGN §9.7) and the verdict. */
export const SPREAD_SOURCE: Partial<Record<MetricId, MetricId>> = {
  'toss-height-spread': 'toss-apex-height',
  'toss-forward-spread': 'toss-forward',
  'contact-height-spread': 'contact-height-ratio',
  'rhythm-spread': 'rhythm-release-to-contact',
  'toss-lateral-spread': 'toss-lateral',
}

/** Status a comparison's values carry: the baseline's own (measured stays measured), rates player-entered. */
export function comparisonStatus(metricId: MetricId, baseline: readonly SessionData[], stratum?: StratumKey | null): Exclude<MetricStatus, 'unavailable'> {
  if (configFor(metricId)?.kind === 'rate') return 'player-entered'
  const s = baseline.map((d) => sessionMetric(d.stats, metricId, stratum)?.status).find(Boolean)
  return s === 'measured' ? 'measured' : 'estimated'
}

/**
 * One side as displayed: a one-session side takes that session's stored value, n and interval (the
 * same MetricValue the report shows), else the pooled side from the comparison.
 */
function displaySide(metricId: MetricId, side: Side, data: readonly SessionData[], stratum: StratumKey | null | undefined, status: Exclude<MetricStatus, 'unavailable'>): { side: Side; value: MetricValue } {
  const own = ownSessionValue(metricId, side, data, stratum)
  if (!own || typeof own.value !== 'number') return { side, value: sideMetric(metricId, side, data, stratum, status) }
  const counts = configFor(metricId)?.kind === 'rate' ? rateCounts(own) : null
  const u = own.uncertainty
  const bounds = u && u.kind !== 'plusminus' ? { low: u.low, high: u.high } : { low: side.low, high: side.high }
  return { side: { sessionIds: side.sessionIds, n: counts?.n ?? own.n ?? side.n, value: own.value, ...bounds }, value: own }
}

const MIN_CONFIDENCE = 0.5

/** Per-serve verdict inputs of one session (METRICS §1.5 inclusion), in the units the spread is stored in. */
function perServeInputs(metricId: MetricId, d: SessionData, heightM: number | undefined): { values: number[]; sigmas: (number | undefined)[] } {
  const src = SPREAD_SOURCE[metricId] ?? metricId
  const values: number[] = []
  const sigmas: (number | undefined)[] = []
  for (const p of perServe(d.rows, src)) {
    const v = p.row.metrics[src]
    if (!v || v.confidence < MIN_CONFIDENCE) continue
    let x = p.value
    let scale = 1
    if (src === 'toss-apex-height') {
      const cm = apexCm(p.row, heightM)
      if (cm === null) continue
      scale = cm / Math.max(p.value, 1e-9)
      x = cm
    } else if (src === 'contact-height-ratio' && metricId === 'contact-height-spread') {
      if (!heightM) continue
      scale = heightM * 100
      x = p.value * scale
    }
    values.push(x)
    sigmas.push(typeof v.sigmaRandom === 'number' ? v.sigmaRandom * scale : undefined)
  }
  return { values, sigmas }
}

/**
 * The METRICS §4.5 request from the sessions' per-serve values (used only when no stored result
 * exists). Direction follows the metric (lower-is-better spreads, higher-is-better centres); a
 * direction-neutral centre needs its target band (VERDICT_PARAMS), else it is not comparable.
 */
export function localRequest(exp: ExperimentRecord, baseline: readonly SessionData[], follow: readonly SessionData[], heightM?: number): VerdictRequest {
  const metricId = exp.primaryMetricId
  const cfg = configFor(metricId)
  const withinSession = exp.baselineSessionIds.some((id) => exp.retestSessionIds.includes(id))
  const band = VERDICT_PARAMS[metricId]?.band
  const direction: VerdictRequest['direction'] = cfg?.direction === 'lower' ? 'decrease' : cfg?.direction === 'higher' ? 'increase' : 'target-band'
  const empty: VerdictSide = { sessionIds: [] }
  const base = { metricId, kind: cfg?.kind ?? 'centre', direction, ...(band ? { band } : {}), sameSession: withinSession } as const
  if (!cfg) return { ...base, baseline: empty, followUp: empty, notComparableReason: 'this measurement has no before-and-after rule yet' }
  if (direction === 'target-band' && !band) return { ...base, baseline: empty, followUp: empty, notComparableReason: 'this measurement has no better or worse direction' }
  if (cfg.kind === 'rate') {
    const side = (data: readonly SessionData[]): VerdictSide => {
      let k = 0
      let n = 0
      const ids: string[] = []
      for (const d of data) {
        const c = rateCounts(sessionMetric(d.stats, metricId, exp.stratum))
        if (!c) continue
        k += c.k
        n += c.n
        ids.push(d.session.id)
      }
      return { sessionIds: ids, k, n }
    }
    return { ...base, baseline: side(baseline), followUp: side(follow) }
  }
  const side = (data: readonly SessionData[]): VerdictSide => {
    const ids: string[] = []
    const bySession: number[][] = []
    const sig: (number | undefined)[][] = []
    for (const d of data) {
      const { values, sigmas } = perServeInputs(metricId, d, heightM)
      // Spreads pool within-session variances: a session with one value adds nothing (METRICS §4.2).
      if (values.length < (cfg.kind === 'spread' ? 2 : 1)) continue
      ids.push(d.session.id)
      bySession.push(values)
      sig.push(sigmas)
    }
    const all = sig.flat()
    const known = all.every((x) => typeof x === 'number') && all.length > 0
    return {
      sessionIds: ids,
      bySession,
      ...(cfg.kind === 'spread' && known ? { sigmaR: Math.sqrt(all.reduce<number>((a, x) => a + (x as number) ** 2, 0) / all.length), sigmaRBySession: sig as number[][] } : {}),
    }
  }
  const nearLimit = [...baseline, ...follow].some((d) => sessionMetric(d.stats, metricId, exp.stratum)?.nearMeasurementLimit)
  return { ...base, baseline: side(baseline), followUp: side(follow), ...(nearLimit ? { nearMeasurementLimit: true } : {}) }
}

function modelFrom(
  exp: ExperimentRecord,
  r: MatchedComparison,
  baseline: readonly SessionData[],
  follow: readonly SessionData[],
  fromEngine: boolean,
  softNotesList: string[] = [],
): CompareModel {
  const withinSession = exp.baselineSessionIds.some((id) => exp.retestSessionIds.includes(id))
  // A not-comparable result carries its reason as the first caveat (integration/verdict.ts).
  const reason = r.verdict === 'not-comparable' ? (r.caveats[0] ?? 'the two sessions are not like for like') : undefined
  const caveats = reason ? r.caveats.slice(1) : r.caveats
  const status = comparisonStatus(r.metricId, baseline, exp.stratum)
  const b = displaySide(r.metricId, r.baseline, baseline, exp.stratum, status)
  const a = displaySide(r.metricId, r.current, follow, exp.stratum, status)
  const more = r.moreServesToConfirm
  const notes = [...r.softFactors.notes, ...softNotesList]
  return {
    metricId: r.metricId,
    verdict: r.verdict,
    ...(reason ? { reason } : {}),
    before: b.side,
    after: a.side,
    beforeValue: b.value,
    afterValue: a.value,
    moreServes: more === undefined ? undefined : more >= TOO_SMALL_TO_CONFIRM_SERVES || more > MORE_SERVES_CAP ? Number.POSITIVE_INFINITY : more,
    withinSession,
    notes: [...notes, ...caveats.filter((c) => !notes.includes(c))],
    fromEngine,
  }
}

/**
 * Builds the comparison for an experiment. Baseline = the experiment's baseline sessions; follow-up
 * = its re-test sessions (up to 3). Not comparable when either side is missing, below the METRICS
 * §4.1 minimum, from a `poor` capture, or the baseline was deleted.
 */
export function compareExperiment(exp: ExperimentRecord, baseline: readonly SessionData[], retests: readonly SessionData[], heightM?: number): CompareModel {
  const metricId = exp.primaryMetricId
  const withinSession = exp.baselineSessionIds.some((id) => exp.retestSessionIds.includes(id))
  const status = comparisonStatus(metricId, baseline, exp.stratum)
  const emptySide: Side = { sessionIds: [], n: 0, value: 0, low: 0, high: 0 }
  const emptyValue: MetricValue = { id: metricId, value: null, unit: '', status, confidence: 0, basis: '' }
  const nc = (reason: string): CompareModel => ({
    metricId,
    verdict: 'not-comparable',
    reason,
    before: emptySide,
    after: emptySide,
    beforeValue: emptyValue,
    afterValue: emptyValue,
    withinSession,
    notes: [],
    fromEngine: false,
  })
  if (exp.result && !exp.baselineDeleted) return modelFrom(exp, exp.result, baseline, retests, true)
  if (exp.baselineDeleted || !baseline.length) return nc('the baseline session was deleted')
  const follow = retests.slice(0, 3)
  if (!follow.length) return nc('no re-test yet')
  if ([...baseline, ...follow].some((d) => d.session.analysis?.capture.quality.overall === 'poor')) return nc('one session had Limited capture')
  const h = heightM ?? baseline[0]?.session.analysis?.capture.scale.heightM
  const result = experimentResult(localRequest(exp, baseline, follow, h), exp.stratum)
  return modelFrom(exp, result, baseline, follow, false, softNotes(baseline, follow))
}

/** Soft factors in words (METRICS §4.4; PRODUCT §6.10 caveats). */
export function softNotes(baseline: readonly SessionData[], follow: readonly SessionData[]): string[] {
  const notes: string[] = []
  const fps = (d: SessionData) => d.session.analysis?.capture.meta.captureFps
  const b = baseline.at(-1)
  const a = follow.at(-1)
  if (!b || !a) return notes
  if (fps(b) && fps(a) && fps(b) !== fps(a)) notes.push(`Different frame rate: ${fps(b)} fps then ${fps(a)} fps`)
  if (a.session.tiltStatus === 'unknown' && b.session.tiltStatus !== 'unknown') notes.push('Phone tilt unknown on the re-test')
  if (a.session.conditions?.wind === 'windy' || b.session.conditions?.wind === 'windy') notes.push('Windy on one of the days')
  return notes
}

// ---------------------------------------------------------------------------------------------
// Chart inputs (DESIGN §9.7)
// ---------------------------------------------------------------------------------------------

export interface BarSpec {
  estimate: number
  ci95: Interval
  ci80: Interval
}

/** CI80 and CI95 bars for one side, on the metric's display scale. */
export function barSpec(metricId: MetricId, side: Side): BarSpec {
  const cfg = configFor(metricId)
  if (cfg?.kind === 'spread') {
    const lo95 = side.low
    const hi95 = side.high
    const ci = side.n >= 2 ? sdChiSquareInterval(side.value, side.n - 1, 0.8) : { low: lo95, high: hi95 }
    const lo80 = Number.isFinite(ci.low) ? ci.low : lo95
    const hi80 = Number.isFinite(ci.high) ? ci.high : hi95
    return {
      estimate: side.value,
      ci95: [lo95, hi95],
      ci80: [Math.max(lo95, Math.min(lo80, side.value)), Math.min(hi95, Math.max(hi80, side.value))],
    }
  }
  return { estimate: side.value, ci95: [side.low, side.high], ci80: ci80FromCi95(side.low, side.high, side.value) }
}

/** The "About the same" zone around the before estimate (METRICS §4.5 SWC). */
export function sameZone(metricId: MetricId, before: number): Interval | null {
  const cfg = configFor(metricId)
  if (!cfg) return null
  if (cfg.kind === 'spread') return [before * (1 - cfg.swc), before / (1 - cfg.swc)]
  return [before - cfg.swc, before + cfg.swc]
}

/**
 * Each serve's distance from its own session's middle, in display units (cm or ms), for the
 * evidence strips under a spread comparison.
 */
export function deviations(metricId: MetricId, data: readonly SessionData[], heightM?: number): { id: string; index: number; kind: ServeRow['kind']; value: number }[] {
  const src = SPREAD_SOURCE[metricId]
  if (!src) return []
  const out: { id: string; index: number; kind: ServeRow['kind']; value: number }[] = []
  for (const d of data) {
    // Distances from the middle serve are relative, so they hold with an unknown phone tilt too.
    const vals = perServe(d.rows, src, true).map((p) => {
      let v = p.value
      if (src === 'toss-apex-height') v = apexCm(p.row, heightM, true) ?? v
      if (src === 'contact-height-ratio') v = heightM ? v * heightM * 100 : v * 100
      return { row: p.row, v }
    })
    const mid = median(vals.map((x) => x.v))
    for (const x of vals) out.push({ id: x.row.id, index: x.row.index, kind: x.row.kind, value: x.v - mid })
  }
  return out
}

/**
 * Sessions to load for a comparison: the experiment's own baseline (or re-tests) plus every session
 * the stored result pooled, so each side's values can be read from the sessions themselves.
 */
export function comparisonSessionIds(exp: ExperimentRecord, which: 'baseline' | 'retest'): string[] {
  const own = which === 'baseline' ? exp.baselineSessionIds : exp.retestSessionIds
  const stored = which === 'baseline' ? exp.result?.baseline.sessionIds : exp.result?.current.sessionIds
  return [...new Set([...own, ...(stored ?? [])])]
}
