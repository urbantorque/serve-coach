/**
 * "Did it work?" model (METRICS §4.4, §4.5; DESIGN §9.7, §10.11). PURE. The engine's stored
 * `experiment.result` is authoritative; when it is missing the same rules run here on the stored
 * session statistics (intervals from the engine), with Pocock boundaries and "About N more serves".
 */
import type { MetricId, MetricValue } from '../../../../analysis/types.ts'
import type { MatchedComparison, SessionStats, VerdictWord } from '../../../../data/domain.ts'
import type { ExperimentRecord, SessionRecord } from '../../../../data/records.ts'
import { configFor } from './metricConfig.ts'
import { rateCounts } from './outcomes.ts'
import {
  ci80From95,
  classifyVerdict,
  MAX_SERVES_TO_CONFIRM,
  median,
  newcombe,
  POCOCK_95,
  roundUp5,
  sdInterval,
  servesToConfirmRate,
  Z95,
  Z_POWER,
  type Interval,
} from './stats.ts'
import { apexCm, perServe, type ServeRow } from './serves.ts'

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
  /** Extra serves to confirm; Infinity = too small to confirm by counting; undefined = settled. */
  moreServes?: number
  withinSession: boolean
  notes: string[]
  /** Engine result was used (true) or computed on the phone from session statistics (false). */
  fromEngine: boolean
}

export interface SessionData {
  session: SessionRecord
  stats: SessionStats | null
  rows: ServeRow[]
}

const MIN_PER_SIDE = { spread: 12, centre: 8, rate: 10 } as const

function sideFrom(metricId: MetricId, data: readonly SessionData[]): Side | null {
  const cfg = configFor(metricId)
  const vals = data
    .map((d) => ({ id: d.session.id, v: d.stats?.metrics[metricId] }))
    .filter((x): x is { id: string; v: MetricValue } => Boolean(x.v) && typeof x.v?.value === 'number')
  if (!vals.length) return null
  if (cfg?.kind === 'rate') {
    let k = 0
    let n = 0
    for (const x of vals) {
      const c = rateCounts(x.v)
      if (c) {
        k += c.k
        n += c.n
      }
    }
    if (!n) return null
    return { sessionIds: vals.map((x) => x.id), n, value: k / n, low: k, high: n }
  }
  // Several sessions: n-weighted value; intervals from the most recent session widened by nothing
  // extra (the engine owns the pooled interval). One session is the common case (demo and v1 loop).
  const n = vals.reduce((a, x) => a + (x.v.n ?? 0), 0)
  const w = vals.map((x) => x.v.n ?? 1)
  const value = vals.reduce((a, x, i) => a + (x.v.value as number) * w[i], 0) / w.reduce((a, b) => a + b, 0)
  const last = vals.at(-1)!.v
  return {
    sessionIds: vals.map((x) => x.id),
    n,
    value,
    low: last.uncertainty?.low ?? value,
    high: last.uncertainty?.high ?? value,
  }
}

/** "About N more serves" for spreads, planned on the log scale (METRICS §4.5 steps 1 to 4). */
export function servesToConfirmSpread(opts: { deltaLog: number; seLog: number; n1: number; n2: number; swcLog: number; tau: number; k1: number; k2?: number }): number {
  const { deltaLog, seLog, n1, n2, swcLog, tau, k1, k2 = 3 } = opts
  const shrunk = (deltaLog * 4 * swcLog ** 2) / (4 * swcLog ** 2 + seLog ** 2)
  const aboutSame = Math.abs(shrunk) < swcLog / 2
  const seStar = aboutSame ? (swcLog - Math.abs(shrunk)) / POCOCK_95 : Math.max(swcLog, Math.abs(shrunk)) / (POCOCK_95 + Z_POWER)
  const rest = seStar ** 2 - 1 / (2 * Math.max(n1 - 1, 1)) - tau ** 2 * (1 / k1 + 1 / k2)
  if (rest > 0) {
    const need = 1 + 1 / (2 * rest)
    return need - n2 <= 0 ? 0 : roundUp5(need - n2)
  }
  const restEq = seStar ** 2 - tau ** 2 * (2 / 3)
  if (restEq <= 0) return Number.POSITIVE_INFINITY
  const needEq = 1 + 1 / restEq
  const cur = Math.min(n1, n2)
  return needEq - cur <= 0 ? 0 : roundUp5(needEq - cur)
}

function fromResult(r: MatchedComparison & { computedAt: string }, withinSession: boolean): CompareModel {
  // A not-comparable result carries its reason as the first caveat (integration/verdict.ts).
  const reason = r.verdict === 'not-comparable' ? (r.caveats[0] ?? 'the two sessions are not like for like') : undefined
  const caveats = reason ? r.caveats.slice(1) : r.caveats
  return {
    metricId: r.metricId,
    verdict: r.verdict,
    ...(reason ? { reason } : {}),
    before: r.baseline,
    after: r.current,
    moreServes: r.moreServesToConfirm,
    withinSession,
    notes: [...r.softFactors.notes, ...caveats.filter((c) => !r.softFactors.notes.includes(c))],
    fromEngine: true,
  }
}

/**
 * Builds the comparison for an experiment. Baseline = the experiment's baseline sessions; follow-up
 * = its re-test sessions (up to 3). Not comparable when either side is missing, below the METRICS
 * §4.1 minimum, from a `poor` capture, or the baseline was deleted.
 */
export function compareExperiment(exp: ExperimentRecord, baseline: readonly SessionData[], retests: readonly SessionData[]): CompareModel {
  const metricId = exp.primaryMetricId
  const withinSession = exp.baselineSessionIds.some((id) => exp.retestSessionIds.includes(id))
  const empty: Side = { sessionIds: [], n: 0, value: 0, low: 0, high: 0 }
  if (exp.result && !exp.baselineDeleted) return fromResult(exp.result, withinSession)
  const nc = (reason: string, before = empty, after = empty): CompareModel => ({
    metricId,
    verdict: 'not-comparable',
    reason,
    before,
    after,
    withinSession,
    notes: [],
    fromEngine: false,
  })
  if (exp.baselineDeleted || !baseline.length) return nc('the baseline session was deleted')
  const follow = retests.slice(0, 3)
  if (!follow.length) return nc('no re-test yet')
  if ([...baseline, ...follow].some((d) => d.session.analysis?.capture.quality.overall === 'poor')) return nc('one session had Limited capture')
  const cfg = configFor(metricId)
  const before = sideFrom(metricId, baseline)
  const after = sideFrom(metricId, follow)
  if (!cfg || !before || !after) return nc('this measurement is missing from one of the sessions')
  const min = MIN_PER_SIDE[cfg.kind]
  if (before.n < min || after.n < min) return nc(`needs ${min} serves on each side`, before, after)
  if ([...baseline, ...follow].some((d) => d.stats?.metrics[metricId]?.nearMeasurementLimit)) {
    // METRICS §4.5 `at-measurement-limit` has no direction; the display vocabulary shows it as not comparable.
    return nc('both spreads are at the limit of what we can measure', before, after)
  }
  const k1 = baseline.length
  const k2 = follow.length
  const cluster = withinSession ? 0 : cfg.tau ** 2 * (1 / k1 + 1 / k2)
  let delta: number
  let se: number
  let swc: number
  let moreServes: number
  if (cfg.kind === 'spread') {
    // Positive = tighter. Log-SD SE from the engine's intervals (fallback: the planning form).
    const seOf = (s: Side) =>
      s.low > 0 && s.high > s.low ? (Math.log(s.high) - Math.log(s.low)) / (2 * Z95) : 1 / Math.sqrt(2 * Math.max(s.n - 1, 1))
    delta = Math.log(before.value / Math.max(after.value, 0.1))
    se = Math.sqrt(seOf(before) ** 2 + seOf(after) ** 2 + cluster)
    swc = -Math.log(1 - cfg.swc)
    moreServes = servesToConfirmSpread({ deltaLog: delta, seLog: se, n1: before.n, n2: after.n, swcLog: swc, tau: cfg.tau, k1 })
  } else if (cfg.kind === 'rate') {
    const [lo, hi] = newcombe(before.low, before.high, after.low, after.high)
    delta = after.value - before.value
    se = Math.sqrt(((hi - lo) / (2 * Z95)) ** 2 + cluster)
    swc = cfg.swc
    moreServes = servesToConfirmRate({ p: (before.low + after.low) / (before.high + after.high), nBaseline: before.high, nFollow: after.high, k1 })
  } else {
    const seOf = (s: Side) => (s.high > s.low ? (s.high - s.low) / (2 * Z95) : cfg.tau)
    const sign = cfg.direction === 'lower' ? -1 : 1
    delta = sign * (after.value - before.value)
    se = Math.sqrt(seOf(before) ** 2 + seOf(after) ** 2 + cluster)
    swc = cfg.swc
    const seStar = Math.max(swc, Math.abs(delta)) / (POCOCK_95 + Z_POWER)
    const v2 = (seOf(after) * Math.sqrt(after.n)) ** 2
    const denom = seStar ** 2 - seOf(before) ** 2 - cluster
    moreServes = denom > 0 ? Math.max(0, roundUp5(v2 / denom - after.n)) : Number.POSITIVE_INFINITY
  }
  const verdict = classifyVerdict({ delta, se, swc, withinSession })
  const settled = verdict === 'clearly-better' || verdict === 'clearly-worse' || verdict === 'no-clear-change'
  return {
    metricId,
    verdict,
    before,
    after,
    moreServes: settled ? undefined : moreServes > MAX_SERVES_TO_CONFIRM ? Number.POSITIVE_INFINITY : moreServes,
    withinSession,
    notes: softNotes(baseline, follow),
    fromEngine: false,
  }
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
    const [lo80, hi80] = side.n >= 2 ? sdInterval(side.value, side.n, 0.8) : [lo95, hi95]
    return {
      estimate: side.value,
      ci95: [lo95, hi95],
      ci80: [Math.max(lo95, Math.min(lo80, side.value)), Math.min(hi95, Math.max(hi80, side.value))],
    }
  }
  return { estimate: side.value, ci95: [side.low, side.high], ci80: ci80From95([side.low, side.high], side.value) }
}

/** The "About the same" zone around the before estimate (METRICS §4.5 SWC). */
export function sameZone(metricId: MetricId, before: number): Interval | null {
  const cfg = configFor(metricId)
  if (!cfg) return null
  if (cfg.kind === 'spread') return [before * (1 - cfg.swc), before / (1 - cfg.swc)]
  return [before - cfg.swc, before + cfg.swc]
}

/** The per-serve metric behind a spread, for the evidence strips (DESIGN §9.7). */
export const SPREAD_SOURCE: Partial<Record<MetricId, MetricId>> = {
  'toss-height-spread': 'toss-apex-height',
  'toss-forward-spread': 'toss-forward',
  'contact-height-spread': 'contact-height-ratio',
  'rhythm-spread': 'rhythm-release-to-contact',
  'toss-lateral-spread': 'toss-lateral',
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
