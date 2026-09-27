/**
 * Per-serve data for the insight screens: outcome marks from the player's tags, and the per-serve
 * values each chart needs, read from `ServeAnalysis.metrics` (falling back to the engine summaries).
 * PURE functions, no React.
 */
import type { MetricId, MetricValue, ReasonCode, ServeOutcome } from '../../../../analysis/types.ts'
import type { ServeAnalysis } from '../../../../data/domain.ts'
import type { ServeTagRecord } from '../../../../data/records.ts'
import type { OutcomeMarkKind } from '../../../copy/strings.ts'

export function outcomeKind(outcome: ServeOutcome | undefined): OutcomeMarkKind {
  switch (outcome) {
    case 'in':
    case 'net':
    case 'long':
    case 'wide':
      return outcome
    default:
      return 'untagged'
  }
}

export const isFault = (k: OutcomeMarkKind) => k === 'net' || k === 'long' || k === 'wide' || k === 'fault'

export interface ServeRow {
  id: string
  index: number
  included: boolean
  exclusions: ReasonCode[]
  kind: OutcomeMarkKind
  /** 'let' serves are listed but never plotted (DESIGN §2.6). */
  isLet: boolean
  tag?: ServeTagRecord
  softFlag: boolean
  /** Per-serve metric values (only usable, non-experimental numbers are read by the charts). */
  metrics: Partial<Record<MetricId, MetricValue>>
}

export function serveRows(serves: readonly ServeAnalysis[], tags: readonly ServeTagRecord[]): ServeRow[] {
  const byServe = new Map(tags.map((t) => [t.serveId, t]))
  return [...serves]
    .sort((a, b) => a.index - b.index)
    .map((s) => {
      const tag = byServe.get(s.id)
      return {
        id: s.id,
        index: s.index,
        included: s.included,
        exclusions: s.exclusions,
        kind: outcomeKind(tag?.outcome),
        isLet: tag?.outcome === 'let',
        tag,
        softFlag: s.plausibility.softFlags.length > 0 || Object.values(s.metrics).some((m) => m?.plausibility === 'soft-flag'),
        metrics: s.metrics,
      }
    })
}

/** A usable per-serve number: present, finite, and measured or estimated (never experimental). */
export function usableNumber(v: MetricValue | undefined): number | null {
  if (!v || (v.status !== 'measured' && v.status !== 'estimated')) return null
  if (v.plausibility === 'hard-reject') return null
  return typeof v.value === 'number' && Number.isFinite(v.value) ? v.value : null
}

/**
 * A value for a relative comparison only (a spread, or each serve against the session's middle one):
 * usable, or experimental only because the phone tilt is unknown (METRICS §1.1 item 3). Never shown
 * as an absolute value.
 */
export function relativeNumber(v: MetricValue | undefined): number | null {
  if (!v) return null
  return usableNumber(v.status === 'experimental' && v.statusIfLevel ? { ...v, status: v.statusIfLevel } : v)
}

/** Apex height above the floor in cm for one serve (secondary.cm, else ratio × player height). */
export function apexCm(row: ServeRow, heightM: number | undefined, relative = false): number | null {
  const v = row.metrics['toss-apex-height']
  const ratio = relative ? relativeNumber(v) : usableNumber(v)
  if (ratio === null || !v) return null
  const cm = v.secondary?.cm
  if (typeof cm === 'number') return cm
  return heightM ? ratio * heightM * 100 : null
}

export interface TossDatum {
  id: string
  index: number
  kind: OutcomeMarkKind
  xCm: number
  yCm: number
  extrapolated: boolean
  softFlag: boolean
}

/** Side-view toss peaks (forward vs height) for the toss map. Serves without both values are counted, not plotted. */
export function tossData(rows: readonly ServeRow[], heightM: number | undefined): { points: TossDatum[]; missing: number; extrapolated: number } {
  const points: TossDatum[] = []
  let missing = 0
  let extrapolated = 0
  for (const r of rows) {
    if (!r.included || r.isLet) continue
    const y = apexCm(r, heightM)
    const x = usableNumber(r.metrics['toss-forward'])
    if (y === null || x === null) {
      missing++
      continue
    }
    const ext = r.metrics['toss-apex-height']?.reasonCode === 'APEX_EXTRAPOLATED'
    if (ext) extrapolated++
    points.push({ id: r.id, index: r.index, kind: r.kind, xCm: x, yCm: y, extrapolated: ext, softFlag: r.softFlag })
  }
  return { points, missing, extrapolated }
}

/** Per-serve values of one metric for included, non-let serves (`relative`: see relativeNumber). */
export function perServe(rows: readonly ServeRow[], metricId: MetricId, relative = false): { row: ServeRow; value: number }[] {
  const out: { row: ServeRow; value: number }[] = []
  for (const r of rows) {
    if (!r.included || r.isLet) continue
    const v = relative ? relativeNumber(r.metrics[metricId]) : usableNumber(r.metrics[metricId])
    if (v !== null) out.push({ row: r, value: v })
  }
  return out
}

export interface OutcomeCounts {
  tagged: number
  in: number
  net: number
  long: number
  wide: number
  lets: number
  untagged: number
}

export function outcomeCounts(rows: readonly ServeRow[]): OutcomeCounts {
  const c: OutcomeCounts = { tagged: 0, in: 0, net: 0, long: 0, wide: 0, lets: 0, untagged: 0 }
  for (const r of rows) {
    if (r.isLet) {
      c.lets++
      continue
    }
    if (r.kind === 'untagged') c.untagged++
    else {
      c.tagged++
      if (r.kind === 'in' || r.kind === 'net' || r.kind === 'long' || r.kind === 'wide') c[r.kind]++
    }
  }
  return c
}
