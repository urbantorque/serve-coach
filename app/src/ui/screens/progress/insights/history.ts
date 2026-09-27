/**
 * Matched-session history for Progress, Metric info and Today (METRICS §1.6, §4.1, §4.4, §4.6;
 * DESIGN §9.2). PURE functions: strata, per-metric session series, the player's usual range, the
 * baseline count, and the trend (or two-session comparison) in words. Demo sessions never reach these
 * functions from Progress (callers filter `isDemo`).
 *
 * Every session value comes from `sessionMetric` (ui/format/sessionValues.ts), the one canonical
 * stored stratum summary, and every statistic from `analysis/stats` (no UI-local copies).
 */
import { logSdSe, relativeSwcToLog, sessionTrend, Z95 } from '../../../../analysis/stats/index.ts'
import type { MetricId, MetricValue, ServeNumber, ServeSide } from '../../../../analysis/types.ts'
import type { SessionStats, StratumKey, VerdictWord } from '../../../../data/domain.ts'
import type { SessionRecord } from '../../../../data/records.ts'
import { sameSessionSetup, sessionMetric, sessionSetupKey, stratumBaseId } from '../../../format/sessionValues.ts'
import { configFor } from './metricConfig.ts'

export interface SessionBundle {
  session: SessionRecord
  stats: SessionStats | null
}

/** Timing metrics may be compared across side set-up classes (METRICS §4.4). */
const TIMING = new Set<string>(['rhythm-release-to-contact', 'rhythm-spread', 'trophy-pause', 'drive-time', 'toss-drop'])

/** The session's headline stratum (the stratum with the most included serves), or its block defaults. */
export function stratumOf(b: SessionBundle): StratumKey {
  const fromStats = b.stats?.strata?.[0]?.key
  if (fromStats) return fromStats
  const s = b.session
  return {
    view: s.view,
    cameraSide: s.cameraSide ?? 'unknown',
    courtSide: s.defaultSide ?? 'unknown',
    serveNumber: s.defaultServeNumber ?? 'unknown',
    intendedType: s.defaultIntendedType ?? 'unknown',
    handedness: s.analysis?.capture.handedness.profile ?? 'right',
  }
}

/** Stratum id (view, camera side, court side, serve number, intended type, handedness). */
export function stratumId(k: StratumKey): string {
  return stratumBaseId(k)
}

/** Set-up class for absolute spatial metrics (portrait near, landscape at the fence, rear). */
export function setupClass(s: SessionRecord): string {
  return s.setup ?? s.analysis?.capture.setup ?? 'unknown'
}

/** The set-up key of a session (orientation, distance class, serving spot; METRICS §4.4). */
export function setupKeyOf(b: SessionBundle): string | undefined {
  return sessionSetupKey(b.session, b.stats)
}

/**
 * The session has this stratum (METRICS §1.6): one of its stored strata, or its headline stratum
 * when it has no stored strata (older records).
 */
export function hasStratum(b: SessionBundle, key: StratumKey): boolean {
  const want = stratumId(key)
  const strata = b.stats?.strata ?? []
  return strata.length ? strata.some((s) => stratumId(s.key) === want) : stratumId(stratumOf(b)) === want
}

/**
 * Two sessions are matched for this metric (METRICS §4.4): same stratum and the same set-up (the
 * capture set-up class and the set-up key: orientation, distance class and serving spot), so a
 * session filmed at 6 m never pools with one at 7.5 m. Timing metrics may cross side set-ups.
 * `key` names the stratum (default: `b`'s headline stratum).
 */
export function matched(a: SessionBundle, b: SessionBundle, metricId?: MetricId, key: StratumKey = stratumOf(b)): boolean {
  if (!hasStratum(a, key) || !hasStratum(b, key)) return false
  if (metricId && TIMING.has(metricId)) return true
  return setupClass(a.session) === setupClass(b.session) && sameSessionSetup(setupKeyOf(a), setupKeyOf(b))
}

const SIDE_WORD: Record<ServeSide, string> = { deuce: 'deuce', ad: 'ad' }
const NUMBER_WORD: Record<ServeNumber, string> = { 1: 'first serves', 2: 'second serves' }

/** "Side view, deuce, first serves" (DESIGN §9.1 subtitle; the glossary word for a stratum is "same set-up"). */
export function stratumWords(k: StratumKey): string {
  const view = k.view === 'rear' ? 'View from behind' : 'Side view'
  const parts = [view]
  if (k.courtSide !== 'unknown') parts.push(SIDE_WORD[k.courtSide])
  if (k.serveNumber !== 'unknown') parts.push(NUMBER_WORD[k.serveNumber])
  return parts.join(', ')
}

/** Distinct strata among the sessions, most sessions first (for the Progress filter row). */
export function strataOf(bundles: readonly SessionBundle[]): { key: StratumKey; id: string; count: number }[] {
  const map = new Map<string, { key: StratumKey; id: string; count: number }>()
  for (const b of bundles) {
    const key = stratumOf(b)
    const id = stratumId(key)
    const cur = map.get(id)
    if (cur) cur.count++
    else map.set(id, { key, id, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

export interface SeriesPoint {
  sessionId: string
  visitId: string
  value: number
  low?: number
  high?: number
  n: number
  provisional: boolean
  nearLimit: boolean
  metric: MetricValue
}

/** A usable session value for trends: measured / estimated (rates: player-entered), never experimental. */
export function trendValue(v: MetricValue | undefined, metricId: string): number | null {
  if (!v) return null
  const rate = configFor(metricId)?.kind === 'rate'
  const ok = v.status === 'measured' || v.status === 'estimated' || (rate && v.status === 'player-entered')
  if (!ok) return null
  return typeof v.value === 'number' && Number.isFinite(v.value) ? v.value : null
}

/** Minimum included serves per session for a trend point of this metric (METRICS §4.6: 8, spreads 12). */
export function minServesFor(metricId: string): number {
  return configFor(metricId)?.minPerSession ?? 8
}

/**
 * The metric's session values over matched sessions, oldest first: each session's canonical stored
 * value for `stratum` (default: the session's headline stratum), the same number its report shows.
 * Sessions below the per-session minimum n (METRICS §4.6) are left out.
 */
export function seriesFor(metricId: MetricId, bundles: readonly SessionBundle[], stratum?: StratumKey): SeriesPoint[] {
  const cfg = configFor(metricId)
  const min = minServesFor(metricId)
  const out: SeriesPoint[] = []
  for (const b of [...bundles].sort((x, y) => x.session.startedAt.localeCompare(y.session.startedAt))) {
    const v = sessionMetric(b.stats, metricId, stratum ?? stratumOf(b))
    const value = trendValue(v, metricId)
    if (value === null || !v) continue
    const n = v.n ?? 0
    if (cfg?.kind !== 'rate' && n < min) continue
    out.push({
      sessionId: b.session.id,
      visitId: b.session.visitId,
      value,
      low: v.uncertainty?.low,
      high: v.uncertainty?.high,
      n,
      provisional: Boolean(v.provisional),
      nearLimit: Boolean(v.nearMeasurementLimit),
      metric: v,
    })
  }
  return out
}

/**
 * The player's usual range (DESIGN §9.2, flagged for METRICS in §15): lowest to highest value of up to
 * 6 previous matched sessions (provisional ones excluded), only with at least 2 such sessions.
 */
export function usualRange(series: readonly SeriesPoint[]): [number, number] | null {
  const prev = series.slice(0, -1).filter((p) => !p.provisional).slice(-6)
  if (prev.length < 2) return null
  const vs = prev.map((p) => p.value)
  return [Math.min(...vs), Math.max(...vs)]
}

// ---------------------------------------------------------------------------------------------
// Building your baseline (METRICS §4.1: < 2 matched sessions with ≥ 8 included serves each)
// ---------------------------------------------------------------------------------------------

/** Sessions a baseline needs before trends and usual ranges (METRICS §4.1). */
export const BASELINE_SESSIONS = 2
/** Included serves in the stratum for a session to count towards the baseline (METRICS §4.1). */
export const BASELINE_MIN_SERVES = 8

/** Included serves of a stratum in one session (its stored stratum n; older records: the session count). */
export function servesInStratum(b: SessionBundle, key: StratumKey): number {
  const want = stratumId(key)
  const s = b.stats?.strata?.find((x) => stratumId(x.key) === want)
  if (s) return s.n
  if (b.stats?.strata?.length) return 0
  return b.session.analysis?.counts.included ?? 0
}

export interface BaselineProgress {
  /** Matched sessions (same stratum and set-up) with at least `minServes` included serves. */
  have: number
  need: typeof BASELINE_SESSIONS
  minServes: number
  /** Included serves of the stratum in the target session, and whether it counted. */
  latestServes: number
  latestCounts: boolean
}

/**
 * How far the baseline is for the stratum of `target` (default: its headline stratum): the matched
 * sessions (same stratum, same set-up) that qualify, counting `target` itself. A 1-serve session
 * does not count, and the words say why (`baselineWords`).
 */
export function baselineProgress(
  bundles: readonly SessionBundle[],
  target: SessionBundle,
  opts: { minServes?: number; key?: StratumKey } = {},
): BaselineProgress {
  const key = opts.key ?? stratumOf(target)
  const minServes = opts.minServes ?? BASELINE_MIN_SERVES
  const pool = bundles.some((b) => b.session.id === target.session.id) ? bundles : [...bundles, target]
  const have = pool.filter((b) => matched(b, target, undefined, key) && servesInStratum(b, key) >= minServes).length
  const latestServes = servesInStratum(target, key)
  return { have, need: BASELINE_SESSIONS, minServes, latestServes, latestCounts: latestServes >= minServes }
}

/** "Building your baseline: 0 of 2 sessions" and the one line that says what counts. */
export function baselineWords(p: BaselineProgress): { title: string; body: string } {
  const title = `Building your baseline: ${p.have} of ${p.need} sessions`
  const rule = `A session counts when at least ${p.minServes} serves from the same side and set-up are measured.`
  if (!p.latestCounts) {
    const last = p.latestServes === 1 ? '1 was' : `${p.latestServes} were`
    return { title, body: `${rule} In your latest, ${last}. Record about 15 serves from one side.` }
  }
  return { title, body: `${rule} Record another session like it to see trends.` }
}

// ---------------------------------------------------------------------------------------------
// Trend (METRICS §4.6)
// ---------------------------------------------------------------------------------------------

export interface TrendSummary {
  /** Fitted change across the window in goodness units (positive = better). */
  change: number
  se: number
  verdict: VerdictWord
}

export type TrendState =
  | { kind: 'empty' }
  | { kind: 'baseline'; have: number; need: 2 }
  | { kind: 'comparison'; before: SeriesPoint; after: SeriesPoint }
  | { kind: 'trend'; result: TrendSummary; sessions: number }

/** METRICS §4.1 and §4.6: building the baseline, a two-session comparison, or a trend verdict. */
export function trendState(metricId: MetricId, series: readonly SeriesPoint[]): TrendState {
  if (!series.length) return { kind: 'empty' }
  if (series.length < 2) return { kind: 'baseline', have: series.length, need: 2 }
  if (series.length === 2) return { kind: 'comparison', before: series[0], after: series[1] }
  const cfg = configFor(metricId)
  const window = series.slice(-6).filter((p) => !p.nearLimit)
  const comparison = { kind: 'comparison', before: series.at(-2)!, after: series.at(-1)! } as const
  if (!cfg || window.length < 3) return comparison
  // Weighted least squares through analysis/stats (sessionTrend), on ln(SD) for spreads.
  const pts =
    cfg.kind === 'spread'
      ? window.map((p, i) => ({ x: i, value: Math.log(Math.max(p.value, 0.1)), se: logSdSe(p.n) }))
      : window.map((p, i) => ({
          x: i,
          value: p.value,
          se: p.low !== undefined && p.high !== undefined ? (p.high - p.low) / (2 * Z95) : cfg.tau,
        }))
  const swc = cfg.kind === 'spread' ? relativeSwcToLog(cfg.swc) : cfg.swc
  const r = sessionTrend(pts, { tau: cfg.tau, swc, sign: cfg.direction === 'lower' ? -1 : 1 })
  if (r.status !== 'trend' || r.change === undefined || r.changeSe === undefined || !r.verdict) return comparison
  const verdict: VerdictWord =
    r.verdict === 'not-a-clear-trend' || r.verdict === 'not-comparable' || r.verdict === 'at-measurement-limit' ? 'too-early' : r.verdict
  return { kind: 'trend', result: { change: r.change, se: r.changeSe, verdict }, sessions: window.length }
}

/** Where the latest value sits against the usual range: 'below' | 'inside' | 'above' | null. */
export function againstUsual(value: number, usual: [number, number] | null): 'below' | 'inside' | 'above' | null {
  if (!usual) return null
  if (value < usual[0]) return 'below'
  if (value > usual[1]) return 'above'
  return 'inside'
}
