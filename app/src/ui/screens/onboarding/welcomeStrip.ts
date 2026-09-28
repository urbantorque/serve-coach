/**
 * The Welcome screen's sample strip (O1; finding 48): the same strip a real report draws, from the
 * sample player's last session, with its status capped by what the CURRENT engine allows. The sample
 * fixtures are hand-made and can lag the catalogue, so each value is capped here with statusCeiling:
 *
 * - absolute peak heights (metres) while toss-apex-height is at least an Estimate;
 * - otherwise, as the report does when absolute heights are experimental, how far each peak sat from
 *   the middle one (centimetres), judged by the toss-height spread's level (statusIfLevel, METRICS §1.1);
 * - nothing, when neither is better than experimental.
 *
 * Front-to-back positions are never drawn here: toss-forward is experimental (V0).
 */
import { lowerStatus, SPREAD_OF, statusCeiling, type ConditionClass } from '../../../analysis/metrics/catalogue.ts'
import { median } from '../../../analysis/stats/index.ts'
import type { MetricStatus, MetricValue } from '../../../analysis/types.ts'
import { DEMO_FIXTURES } from '../../../data/index.ts'
import { relDomain, relWords } from '../../format/tossRelative.ts'

export type SamplePeakKind = 'in' | 'net' | 'long' | 'wide' | 'untagged'
export interface SamplePeak {
  id: string
  value: number
  kind: SamplePeakKind
  callout: string
}

export interface WelcomeStrip {
  mode: 'absolute' | 'relative'
  peaks: SamplePeak[]
  /** The chip: the least certain capped status among the plotted values. */
  status: MetricStatus
  heading: string
  label: string
  median: number
  medianLabel: string
  domain: [number, number]
  unit: 'm' | 'cm'
}

type Serve = { id: string; index: number; included: boolean; metrics: Partial<Record<string, MetricValue>> }
type SampleSession = { serves: readonly Serve[]; tags: readonly { serveId: string; outcome?: string }[] }

const USABLE = new Set<MetricStatus>(['measured', 'estimated'])
const RANK: Record<MetricStatus, number> = { measured: 0, 'player-entered': 0, estimated: 1, experimental: 2, unavailable: 3 }
const worst = (ss: MetricStatus[]): MetricStatus => ss.reduce((a, s) => (RANK[s] > RANK[a] ? s : a), 'measured' as MetricStatus)

/** A stored per-serve toss peak's status, capped by the current catalogue (absolute use). */
export function cappedAbsolute(v: MetricValue, condition: ConditionClass = v.conditionClass ?? 'day'): MetricStatus {
  return lowerStatus(v.status, statusCeiling('toss-apex-height', condition).status)
}

/** Its status for relative use (offset from the middle toss), capped by the toss-height spread's level. */
export function cappedRelative(v: MetricValue, condition: ConditionClass = v.conditionClass ?? 'day'): MetricStatus {
  const spread = SPREAD_OF['toss-apex-height'] ?? 'toss-height-spread'
  return lowerStatus(v.statusIfLevel ?? v.status, statusCeiling(spread, condition).status)
}

const kindOf = (o: string | undefined): SamplePeakKind => (o === 'in' || o === 'net' || o === 'long' || o === 'wide' ? o : 'untagged')

export function welcomeStrip(session: SampleSession | undefined = DEMO_FIXTURES.sessions.at(-1)): WelcomeStrip | null {
  if (!session) return null
  const outcome = new Map(session.tags.map((t) => [t.serveId, t.outcome]))
  const rows = session.serves.flatMap((sv) => {
    const apex = sv.metrics['toss-apex-height']
    const cm = apex?.secondary?.cm
    if (!sv.included || !apex || typeof cm !== 'number' || apex.plausibility === 'hard-reject') return []
    return [{ sv, apex, cm, abs: cappedAbsolute(apex), rel: cappedRelative(apex), kind: kindOf(outcome.get(sv.id)) }]
  })
  const absolute = rows.filter((r) => USABLE.has(r.abs))
  if (absolute.length >= 5) {
    const mid = median(absolute.map((r) => r.cm / 100))
    const values = absolute.map((r) => r.cm / 100)
    return {
      mode: 'absolute',
      peaks: absolute.map((r) => ({ id: r.sv.id, value: r.cm / 100, kind: r.kind, callout: `${(r.cm / 100).toFixed(2)} m · Serve ${r.sv.index}` })),
      status: worst(absolute.map((r) => r.abs)),
      heading: 'How high each toss peaked, one dot per serve',
      label: `Sample strip: how high ${absolute.length} toss peaks went for a computer-generated player.`,
      median: mid,
      medianLabel: `middle ${mid.toFixed(2)} m`,
      domain: [Math.min(...values) - 0.1, Math.max(...values) + 0.1],
      unit: 'm',
    }
  }
  const relative = rows.filter((r) => USABLE.has(r.rel))
  if (relative.length < 5) return null
  const midCm = median(relative.map((r) => r.cm))
  const ds = relative.map((r) => r.cm - midCm)
  return {
    mode: 'relative',
    peaks: relative.map((r, i) => ({ id: r.sv.id, value: ds[i], kind: r.kind, callout: `${relWords(ds[i])} · Serve ${r.sv.index}` })),
    status: worst(relative.map((r) => r.rel)),
    heading: 'How far each toss peak sat from the middle one, one dot per serve',
    label: `Sample strip: how far ${relative.length} toss peaks sat above or below the middle one for a computer-generated player.`,
    median: 0,
    medianLabel: 'middle toss',
    domain: relDomain(ds),
    unit: 'cm',
  }
}
