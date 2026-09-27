/**
 * Outcome statistics for the insight screens (D3, D7; METRICS §3.18, §4.3, §4.5, §4.7). PURE.
 * - pooledRate: first serves in over a rolling window of matched sessions, with a Wilson band and
 *   "about N more serves" to see a 10-point change.
 * - outcomeLink: the signature insight (mechanics of serves that went in vs missed), with Holm's
 *   correction across the fixed family of 7 metrics, |Δ| ≥ SWC, and replication in a second matched
 *   session before anything is shown.
 */
import type { MetricId, MetricValue } from '../../../../analysis/types.ts'
import type { OutcomeLink } from '../../../../data/domain.ts'
import { configFor } from './metricConfig.ts'
import { isFault, perServe, type ServeRow } from './serves.ts'
import { holm, mean, sd, servesToConfirmRate, tCdf, welch, wilson, type Interval } from './stats.ts'

// ---------------------------------------------------------------------------------------------
// Pooled rate (Progress tile 2, PRODUCT §6.9)
// ---------------------------------------------------------------------------------------------

export interface RateSession {
  sessionId: string
  visitId: string
  k: number
  n: number
}

export interface PooledRate {
  k: number
  n: number
  sessions: number
  rate: number
  ci95: Interval
  /** Extra serves for a 10-point change; Infinity = "too small to confirm by counting". */
  moreServes: number
}

/** k and n of a player-entered rate value (secondary.k, else rounded p × n). */
export function rateCounts(v: MetricValue | undefined): { k: number; n: number } | null {
  if (!v || v.status !== 'player-entered' || typeof v.value !== 'number' || !v.n) return null
  const k = typeof v.secondary?.k === 'number' ? v.secondary.k : Math.round(v.value * v.n)
  return { k, n: v.n }
}

/** Pools the most recent sessions until about `window` serves (CAPTURE §5.1: about 100). */
export function pooledRate(sessions: readonly RateSession[], window = 100): PooledRate | null {
  const recent = [...sessions].sort((a, b) => b.visitId.localeCompare(a.visitId))
  let k = 0
  let n = 0
  let used = 0
  for (const s of recent) {
    if (n >= window) break
    k += s.k
    n += s.n
    used++
  }
  if (!n) return null
  const rate = k / n
  return {
    k,
    n,
    sessions: used,
    rate,
    ci95: wilson(k, n),
    moreServes: servesToConfirmRate({ p: rate, nBaseline: n, nFollow: 0, k1: used }),
  }
}

// ---------------------------------------------------------------------------------------------
// Outcome-linked contrast (METRICS §4.7)
// ---------------------------------------------------------------------------------------------

/** The fixed family of 7 metrics (METRICS §4.7). */
export const LINK_FAMILY: MetricId[] = [
  'toss-forward',
  'toss-apex-height',
  'toss-drop',
  'contact-height-ratio',
  'contact-forward',
  'rhythm-release-to-contact',
  'leg-drive',
]
export const MIN_PER_GROUP = 10

/**
 * SWC in the metric's stored unit (METRICS §4.5). Apex height is stored as a ratio of standing
 * height, so its 5 cm SWC is 0.03 × height.
 */
function linkSwc(metricId: MetricId): number {
  if (metricId === 'toss-apex-height') return 0.03
  return configFor(metricId)?.swc ?? 5
}

function groups(rows: readonly ServeRow[], metricId: MetricId) {
  const vals = perServe(rows, metricId).map((p) => ({ kind: p.row.kind, v: p.value }))
  return {
    ins: vals.filter((x) => x.kind === 'in').map((x) => x.v),
    faults: vals.filter((x) => isFault(x.kind)).map((x) => x.v),
  }
}

export interface LinkCandidate {
  metricId: MetricId
  inMean: number
  faultMean: number
  nIn: number
  nFault: number
  diff: number
  p: number
  ratioToSwc: number
}

export type LinkState =
  | { kind: 'engine'; link: OutcomeLink }
  | { kind: 'needs-tags'; tagged: number }
  | { kind: 'too-few'; nIn: number; nFault: number }
  | { kind: 'none' }
  | { kind: 'held'; candidate: LinkCandidate }
  | { kind: 'shown'; candidate: LinkCandidate; replicatedIn: string }

/** Session candidates: Welch per metric, Holm across the family at α 0.05, and |Δ| ≥ SWC. */
export function linkCandidates(rows: readonly ServeRow[]): LinkCandidate[] {
  const tests = LINK_FAMILY.map((metricId) => {
    const { ins, faults } = groups(rows, metricId)
    if (ins.length < MIN_PER_GROUP || faults.length < MIN_PER_GROUP) return null
    const w = welch(faults, ins)
    return { metricId, ins, faults, w }
  }).filter((t): t is NonNullable<typeof t> => t !== null)
  const pass = holm(tests.map((t) => t.w.p))
  return tests
    .map((t, i) => ({
      metricId: t.metricId,
      inMean: mean(t.ins),
      faultMean: mean(t.faults),
      nIn: t.ins.length,
      nFault: t.faults.length,
      diff: t.w.diff,
      p: t.w.p,
      ratioToSwc: Math.abs(t.w.diff) / linkSwc(t.metricId),
      ok: pass[i] && Math.abs(t.w.diff) >= linkSwc(t.metricId),
    }))
    .filter((c) => c.ok)
    .map(({ ok: _ok, ...c }) => c)
    .sort((a, b) => b.ratioToSwc - a.ratioToSwc)
}

/** Replication (METRICS §4.7): same sign, one-sided Welch p < 0.10, in an earlier matched session. */
export function replicates(c: LinkCandidate, rows: readonly ServeRow[]): boolean {
  const { ins, faults } = groups(rows, c.metricId)
  if (ins.length < 2 || faults.length < 2) return false
  const diff = mean(ins) - mean(faults)
  if (Math.sign(diff) !== Math.sign(c.diff) || diff === 0) return false
  const se = Math.sqrt(sd(ins) ** 2 / ins.length + sd(faults) ** 2 / faults.length)
  if (!(se > 0)) return false
  const w = welch(faults, ins)
  const oneSided = 1 - tCdf(Math.abs(diff) / se, w.df)
  return oneSided < 0.1
}

/**
 * The signature insight state for one session. The engine's `outcomeLink` wins when present; the
 * local computation follows METRICS §4.7 and never shows an unreplicated contrast.
 */
export function outcomeLinkState(opts: {
  engineLink: OutcomeLink | null | undefined
  rows: readonly ServeRow[]
  earlier: readonly { sessionId: string; rows: readonly ServeRow[] }[]
}): LinkState {
  if (opts.engineLink) return { kind: 'engine', link: opts.engineLink }
  const tagged = opts.rows.filter((r) => r.kind !== 'untagged' && !r.isLet)
  if (tagged.length < 6) return { kind: 'needs-tags', tagged: tagged.length }
  const inc = opts.rows.filter((r) => r.included && !r.isLet)
  const nIn = inc.filter((r) => r.kind === 'in').length
  const nFault = inc.filter((r) => isFault(r.kind)).length
  if (nIn < MIN_PER_GROUP || nFault < MIN_PER_GROUP) return { kind: 'too-few', nIn, nFault }
  const cands = linkCandidates(opts.rows)
  if (!cands.length) return { kind: 'none' }
  for (const c of cands) {
    const rep = opts.earlier.find((e) => replicates(c, e.rows))
    if (rep) return { kind: 'shown', candidate: c, replicatedIn: rep.sessionId }
  }
  return { kind: 'held', candidate: cands[0] }
}
