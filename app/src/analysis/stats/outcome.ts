/**
 * Outcome-linked contrasts, the D3 signature insight (METRICS §4.7): within a stratum, tagged "in"
 * vs fault serves, each group with ≥ 10 included values, Welch's t per metric over a fixed family of
 * 7, Holm's step-down correction at a family-wise α of 0.05 and |Δ| ≥ SWC, then replication in a
 * second matched session (same sign, one-sided p < 0.10) before anything is shown.
 */
import { mean, variance } from './descriptive.ts'
import { tCdf, tQuantile } from './distributions.ts'
import { MIN_N } from './aggregate.ts'

export const OUTCOME_FAMILY = [
  'toss-forward',
  'toss-apex-height',
  'toss-drop',
  'contact-height-ratio',
  'contact-forward',
  'rhythm-release-to-contact',
  'leg-drive',
] as const
export type OutcomeFamilyId = (typeof OUTCOME_FAMILY)[number]

export interface WelchResult {
  diff: number
  se: number
  df: number
  t: number
  /** Two-sided p. */
  p: number
  low95: number
  high95: number
}

/** Welch's unequal-variance t-test for mean(a) − mean(b). */
export function welch(a: readonly number[], b: readonly number[]): WelchResult | null {
  if (a.length < 2 || b.length < 2) return null
  const va = variance(a) / a.length
  const vb = variance(b) / b.length
  const se = Math.sqrt(va + vb)
  const diff = mean(a) - mean(b)
  if (!(se > 0)) return { diff, se: 0, df: a.length + b.length - 2, t: diff === 0 ? 0 : Infinity, p: diff === 0 ? 1 : 0, low95: diff, high95: diff }
  const df = (va + vb) ** 2 / (va * va / (a.length - 1) + vb * vb / (b.length - 1))
  const t = diff / se
  const p = 2 * (1 - tCdf(Math.abs(t), df))
  const q = tQuantile(0.975, df)
  return { diff, se, df, t, p, low95: diff - q * se, high95: diff + q * se }
}

/** Holm step-down: returns which of the p-values are rejected at family-wise α. */
export function holm(pValues: readonly number[], alpha = 0.05): boolean[] {
  const order = pValues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p)
  const m = pValues.length
  const rejected = new Array<boolean>(m).fill(false)
  for (let k = 0; k < m; k++) {
    if (order[k].p <= alpha / (m - k)) rejected[order[k].i] = true
    else break
  }
  return rejected
}

export interface ContrastInputMetric {
  metricId: OutcomeFamilyId
  inValues: readonly number[]
  faultValues: readonly number[]
  swc: number
}

export interface ContrastCheck {
  metricId: OutcomeFamilyId
  nIn: number
  nFault: number
  difference?: number
  p?: number
  ratioToSwc?: number
  passed: boolean
  reason?: 'TOO_FEW_SERVES' | 'no-clear-difference'
}

export interface ContrastCandidate extends WelchResult {
  metricId: OutcomeFamilyId
  ratioToSwc: number
  nIn: number
  nFault: number
}

/** One session's contrast screen: Welch per metric, Holm across the family, |Δ| ≥ SWC. */
export function screenOutcomeContrasts(metrics: readonly ContrastInputMetric[], alpha = 0.05): { checks: ContrastCheck[]; candidates: ContrastCandidate[] } {
  const rows = metrics.map((m) => {
    const enough = m.inValues.length >= MIN_N.outcomeContrast.perGroup && m.faultValues.length >= MIN_N.outcomeContrast.perGroup
    return { m, enough, w: enough ? welch(m.inValues, m.faultValues) : null }
  })
  const tested = rows.filter((r) => r.w)
  const rejected = holm(tested.map((r) => r.w!.p), alpha)
  const checks: ContrastCheck[] = []
  const candidates: ContrastCandidate[] = []
  for (const r of rows) {
    const idx = tested.indexOf(r)
    if (!r.w) {
      checks.push({ metricId: r.m.metricId, nIn: r.m.inValues.length, nFault: r.m.faultValues.length, passed: false, reason: 'TOO_FEW_SERVES' })
      continue
    }
    const ratio = Math.abs(r.w.diff) / r.m.swc
    const passed = rejected[idx] && ratio >= 1
    checks.push({
      metricId: r.m.metricId,
      nIn: r.m.inValues.length,
      nFault: r.m.faultValues.length,
      difference: r.w.diff,
      p: r.w.p,
      ratioToSwc: ratio,
      passed,
      reason: passed ? undefined : 'no-clear-difference',
    })
    if (passed) candidates.push({ ...r.w, metricId: r.m.metricId, ratioToSwc: ratio, nIn: r.m.inValues.length, nFault: r.m.faultValues.length })
  }
  return { checks, candidates }
}

/**
 * Replication (§4.7): the candidate is shown only when a second matched session has the same sign
 * with a one-sided Welch p < 0.10 for that metric. Returns the best replicated candidate (largest
 * |Δ| ÷ SWC), or null.
 */
export function replicatedContrast(
  candidates: readonly ContrastCandidate[],
  previous: readonly { metricId: OutcomeFamilyId; inValues: readonly number[]; faultValues: readonly number[] }[],
): ContrastCandidate | null {
  const ok = candidates.filter((c) => {
    const prev = previous.find((p) => p.metricId === c.metricId)
    if (!prev) return false
    const w = welch(prev.inValues, prev.faultValues)
    if (!w || Math.sign(w.diff) !== Math.sign(c.diff)) return false
    const oneSided = 1 - tCdf(Math.abs(w.t), w.df)
    return oneSided < 0.1
  })
  return ok.sort((a, b) => b.ratioToSwc - a.ratioToSwc)[0] ?? null
}
