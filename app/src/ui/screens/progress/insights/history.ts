/**
 * Matched-session history for Progress, Metric info and Today (METRICS §1.6, §4.1, §4.4, §4.6;
 * DESIGN §9.2). PURE functions: strata, per-metric session series, the player's usual range, and the
 * trend (or two-session comparison) in words. Demo sessions never reach these functions from
 * Progress (callers filter `isDemo`).
 */
import type { MetricId, MetricValue, ServeNumber, ServeSide } from '../../../../analysis/types.ts'
import type { SessionStats, StratumKey } from '../../../../data/domain.ts'
import type { SessionRecord } from '../../../../data/records.ts'
import { configFor } from './metricConfig.ts'
import { logSdSe, relativeSwcToLog, trendVerdict, Z95, type TrendResult } from './stats.ts'

export interface SessionBundle {
  session: SessionRecord
  stats: SessionStats | null
}

/** Timing metrics may be compared across side set-up classes (METRICS §4.4). */
const TIMING = new Set<string>(['rhythm-release-to-contact', 'rhythm-spread', 'trophy-pause', 'drive-time', 'toss-drop'])

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

export function stratumId(k: StratumKey): string {
  return [k.view, k.cameraSide, k.courtSide, k.serveNumber, k.intendedType, k.handedness].join('|')
}

/** Set-up class for absolute spatial metrics (portrait near, landscape at the fence, rear). */
export function setupClass(s: SessionRecord): string {
  return s.setup ?? s.analysis?.capture.setup ?? 'unknown'
}

/** Two sessions are matched for this metric (METRICS §4.4). */
export function matched(a: SessionBundle, b: SessionBundle, metricId?: MetricId): boolean {
  if (stratumId(stratumOf(a)) !== stratumId(stratumOf(b))) return false
  if (metricId && TIMING.has(metricId)) return true
  return setupClass(a.session) === setupClass(b.session)
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

/**
 * The metric's session values over matched sessions, oldest first. Sessions below the per-session
 * minimum n (METRICS §4.6) are left out.
 */
export function seriesFor(metricId: MetricId, bundles: readonly SessionBundle[]): SeriesPoint[] {
  const cfg = configFor(metricId)
  const min = cfg?.minPerSession ?? 8
  const out: SeriesPoint[] = []
  for (const b of [...bundles].sort((x, y) => x.session.startedAt.localeCompare(y.session.startedAt))) {
    const v = b.stats?.metrics[metricId]
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

export type TrendState =
  | { kind: 'empty' }
  | { kind: 'baseline'; have: number; need: 2 }
  | { kind: 'comparison'; before: SeriesPoint; after: SeriesPoint }
  | { kind: 'trend'; result: TrendResult; sessions: number }

/** METRICS §4.1 and §4.6: building the baseline, a two-session comparison, or a trend verdict. */
export function trendState(metricId: MetricId, series: readonly SeriesPoint[]): TrendState {
  if (!series.length) return { kind: 'empty' }
  if (series.length < 2) return { kind: 'baseline', have: series.length, need: 2 }
  if (series.length === 2) return { kind: 'comparison', before: series[0], after: series[1] }
  const cfg = configFor(metricId)
  const window = series.slice(-6).filter((p) => !p.nearLimit)
  if (!cfg || window.length < 3) return { kind: 'comparison', before: series.at(-2)!, after: series.at(-1)! }
  const pts =
    cfg.kind === 'spread'
      ? window.map((p) => ({ value: Math.log(Math.max(p.value, 0.1)), se: logSdSe(p.n) }))
      : window.map((p) => ({
          value: p.value,
          se: p.low !== undefined && p.high !== undefined ? (p.high - p.low) / (2 * Z95) : cfg.tau,
        }))
  const swc = cfg.kind === 'spread' ? relativeSwcToLog(cfg.swc) : cfg.swc
  const result = trendVerdict(pts, { tau: cfg.tau, swc, lowerIsBetter: cfg.direction === 'lower' })
  if (!result) return { kind: 'comparison', before: series.at(-2)!, after: series.at(-1)! }
  return { kind: 'trend', result, sessions: window.length }
}

/** Where the latest value sits against the usual range: 'below' | 'inside' | 'above' | null. */
export function againstUsual(value: number, usual: [number, number] | null): 'below' | 'inside' | 'above' | null {
  if (!usual) return null
  if (value < usual[0]) return 'below'
  if (value > usual[1]) return 'above'
  return 'inside'
}
