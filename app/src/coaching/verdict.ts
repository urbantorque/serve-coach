/**
 * "Did it work?" verdict (METRICS §4.5). METRICS owns the rules and `analysis/stats` owns the
 * implementation; coaching adds no verdict rules of its own (COACHING §12.4). Until `analysis/stats`
 * exports its verdict, this module implements §4.5 on top of the `analysis/stats` intervals so the
 * experiment loop can run; callers can inject the canonical one through `CoachingInput.verdict`.
 *
 * Simplifications, flagged for the integrator: spreads use the log-SD normal approximation (the
 * §4.5 planning form) instead of the stratified bootstrap; medians use 1.2533^2 x the variance of the
 * mean; tau uses the METRICS priors (no empirical-Bayes update yet).
 */
import type { MetricId } from '../analysis/types.ts'
import { newcombe } from '../analysis/stats/intervals.ts'
import { mean, sd } from './stats.ts'
import type { VerdictId, VerdictRequest, VerdictResult } from './types.ts'

/** METRICS §4.5 SWC and tau priors (goodness units: cm, ratio, % of height, ms, proportion). */
const SWC_TAU: Partial<Record<MetricId, { swc: number; tau: number }>> = {
  'toss-apex-height': { swc: 5, tau: 4 },
  'toss-forward': { swc: 5, tau: 5 },
  'contact-forward': { swc: 5, tau: 5 },
  'toss-drop': { swc: 6, tau: 5 },
  'contact-height-ratio': { swc: 0.015, tau: 0.01 },
  'rhythm-release-to-contact': { swc: 30, tau: 30 },
  'leg-drive': { swc: 2, tau: 1.5 },
  'serve-in-rate': { swc: 0.1, tau: 0.05 },
  'first-serve-in-rate': { swc: 0.1, tau: 0.05 },
  'second-serve-in-rate': { swc: 0.1, tau: 0.05 },
}
/** Spreads: SWC 15% relative, tau 0.15 on the log scale. */
const SPREAD_SWC_LOG = -Math.log(0.85)
const SPREAD_TAU_LOG = 0.15
/** Pocock constants for 3 looks (two-sided alpha 0.05 and 0.20). */
const Z95_LOOKS = 2.29
const Z80_LOOKS = 1.65
const Z_POWER = 0.84
const MEDIAN_METRICS = new Set<MetricId>(['toss-apex-height', 'toss-drop', 'rhythm-release-to-contact', 'trophy-pause', 'leg-drive', 'drive-time'])

export const VERDICT_MINIMUM = { centre: 8, spread: 12, rate: 10 } as const

const ceil5 = (x: number) => Math.max(5, Math.ceil(x / 5) * 5)

function classify(delta: number, se: number, swc: number, sameSession: boolean): VerdictId {
  const z95 = sameSession ? 1.96 : Z95_LOOKS
  const z80 = sameSession ? 1.2816 : Z80_LOOKS
  const lo95 = delta - z95 * se
  const hi95 = delta + z95 * se
  const lo80 = delta - z80 * se
  const hi80 = delta + z80 * se
  if (!sameSession && lo95 > 0 && delta >= swc) return 'clearly-better'
  if (!sameSession && hi95 < 0 && delta <= -swc) return 'clearly-worse'
  if (lo95 > -swc && hi95 < swc) return 'no-clear-change'
  if (lo80 > 0 || lo95 > 0) return 'likely-better'
  if (hi80 < 0) return 'likely-worse'
  return 'too-early'
}

/** "About N more serves" (METRICS §4.5 steps 1 to 4). Returns undefined for "more than 150". */
function moreServes(
  delta: number,
  se: number,
  swc: number,
  v1: number,
  n1: number,
  v2: number,
  n2: number,
  fixed: number,
): number | undefined {
  const shrunk = (delta * 4 * swc * swc) / (4 * swc * swc + se * se)
  const design = Math.max(swc, Math.abs(shrunk))
  const target = Math.abs(shrunk) < swc / 2 ? (swc - Math.abs(shrunk)) / Z95_LOOKS : design / (Z95_LOOKS + Z_POWER)
  const t2 = target * target
  const denom = t2 - v1 / n1 - fixed
  let need: number
  if (denom > 0) need = v2 / denom - n2
  else {
    const d2 = t2 - fixed
    if (d2 <= 0) return undefined
    need = (v1 + v2) / d2 - Math.max(n1, n2)
  }
  if (!Number.isFinite(need) || need > 150) return undefined
  return ceil5(Math.max(0, need))
}

function pooledSd(groups: readonly number[][]): { s: number; df: number } {
  let ss = 0
  let df = 0
  for (const g of groups) {
    if (g.length < 2) continue
    ss += (g.length - 1) * sd(g) ** 2
    df += g.length - 1
  }
  return { s: df > 0 ? Math.sqrt(ss / df) : Number.NaN, df }
}

/** METRICS §4.5 verdict (fallback implementation; see the module note). */
export function metricsVerdict(req: VerdictRequest): VerdictResult {
  const method = 'coaching-fallback:metrics-4.5'
  if (req.notComparableReason) return { verdict: 'not-comparable', method, reason: req.notComparableReason }
  const kb = Math.max(1, req.baseline.sessionIds.length)
  const kf = Math.max(1, req.followUp.sessionIds.length)
  const tauTerm = (tau: number) => (req.sameSession ? 0 : tau * tau * (1 / kb + 1 / kf))

  if (req.kind === 'rate') {
    const k1 = req.baseline.k ?? 0
    const n1 = req.baseline.n ?? 0
    const k2 = req.followUp.k ?? 0
    const n2 = req.followUp.n ?? 0
    if (n1 < VERDICT_MINIMUM.rate || n2 < VERDICT_MINIMUM.rate) {
      return { verdict: 'not-comparable', method, reason: `Needs at least ${VERDICT_MINIMUM.rate} tagged serves each side.` }
    }
    const st = SWC_TAU[req.metricId] ?? { swc: 0.1, tau: 0.05 }
    const sign = req.direction === 'decrease' ? -1 : 1
    const d = newcombe(k2, n2, k1, n1, 1.96)
    const delta = sign * d.delta
    // Approximate SE from the Newcombe half-width, widened in quadrature by tau_rate.
    const se = Math.sqrt(((d.high - d.low) / (2 * 1.96)) ** 2 + tauTerm(st.tau))
    const verdict = classify(delta, se, st.swc, req.sameSession)
    const p = (k1 + k2) / (n1 + n2)
    const more = verdict === 'clearly-better' || verdict === 'clearly-worse' || verdict === 'no-clear-change' ? undefined : moreServes(delta, se, st.swc, p * (1 - p), n1, p * (1 - p), n2, tauTerm(st.tau))
    return withMore({ verdict, delta, low: delta - Z95_LOOKS * se, high: delta + Z95_LOOKS * se, method }, verdict, more)
  }

  const base = req.baseline.bySession ?? []
  const follow = req.followUp.bySession ?? []
  const nb = base.reduce((a, g) => a + g.length, 0)
  const nf = follow.reduce((a, g) => a + g.length, 0)

  if (req.kind === 'spread') {
    if (nb < VERDICT_MINIMUM.spread || nf < VERDICT_MINIMUM.spread) {
      return { verdict: 'not-comparable', method, reason: `Needs at least ${VERDICT_MINIMUM.spread} measured serves each side.` }
    }
    const pb = pooledSd(base)
    const pf = pooledSd(follow)
    const eb = req.baseline.sigmaR ?? 0
    const ef = req.followUp.sigmaR ?? 0
    const cb = Math.sqrt(Math.max(0, pb.s ** 2 - eb ** 2))
    const cf = Math.sqrt(Math.max(0, pf.s ** 2 - ef ** 2))
    if (req.nearMeasurementLimit || cb <= 0 || cf <= 0) {
      return { verdict: 'not-comparable', method, reason: 'At the limit of what we can measure.' }
    }
    const delta = Math.log(cb / cf)
    const fixed = tauTerm(SPREAD_TAU_LOG)
    const se = Math.sqrt(1 / (2 * pb.df) + 1 / (2 * pf.df) + fixed)
    const verdict = classify(delta, se, SPREAD_SWC_LOG, req.sameSession)
    // Planning on the log scale: V/n ~ 1/(2(n - 1)), so V ~ 0.5 per serve.
    const more = verdict === 'clearly-better' || verdict === 'clearly-worse' || verdict === 'no-clear-change' ? undefined : moreServes(delta, se, SPREAD_SWC_LOG, 0.5, pb.df, 0.5, pf.df, fixed)
    return withMore({ verdict, delta, low: delta - Z95_LOOKS * se, high: delta + Z95_LOOKS * se, method }, verdict, more)
  }

  // Centres.
  if (nb < VERDICT_MINIMUM.centre || nf < VERDICT_MINIMUM.centre) {
    return { verdict: 'not-comparable', method, reason: `Needs at least ${VERDICT_MINIMUM.centre} measured serves each side.` }
  }
  const st = SWC_TAU[req.metricId] ?? { swc: 0, tau: 0 }
  const g = (x: number) => {
    if (req.direction === 'decrease') return -x
    if (req.direction === 'target-band' && req.band) return -(x < req.band[0] ? req.band[0] - x : x > req.band[1] ? x - req.band[1] : 0)
    return x
  }
  const gb = base.flat().map(g)
  const gf = follow.flat().map(g)
  const medianFactor = MEDIAN_METRICS.has(req.metricId) ? 1.2533 ** 2 : 1
  const v1 = sd(gb) ** 2 * medianFactor
  const v2 = sd(gf) ** 2 * medianFactor
  const sigmaS = req.sameSession ? 0 : (req.baseline.sigmaShared ?? 0)
  const fixed = 2 * sigmaS * sigmaS + tauTerm(st.tau)
  const se = Math.sqrt(v1 / gb.length + v2 / gf.length + fixed)
  const delta = mean(gf) - mean(gb)
  const verdict = classify(delta, se, st.swc, req.sameSession)
  const more = verdict === 'clearly-better' || verdict === 'clearly-worse' || verdict === 'no-clear-change' ? undefined : moreServes(delta, se, st.swc, v1, gb.length, v2, gf.length, fixed)
  return withMore({ verdict, delta, low: delta - Z95_LOOKS * se, high: delta + Z95_LOOKS * se, method }, verdict, more)
}

function withMore(r: VerdictResult, verdict: VerdictId, more: number | undefined): VerdictResult {
  const needsCount = verdict === 'likely-better' || verdict === 'likely-worse' || verdict === 'too-early'
  if (!needsCount) return r
  return more === undefined ? { ...r, tooSmallToConfirm: true } : { ...r, moreServes: more }
}

/** Player-facing verdict sentence (METRICS §4.5 words, COACHING §12.4 examples). No metric numbers. */
export function verdictSentence(v: VerdictResult, opts: { rate?: boolean } = {}): string {
  const tags = opts.rate ? ' (from your tags)' : ''
  const more = v.moreServes !== undefined ? v.moreServes : undefined
  const tooSmall = opts.rate
    ? 'More than 150 serves; this difference is too small to confirm by counting. Watch toss spread and contact height instead.'
    : 'A change this size needs more than 150 serves to confirm, so keep practising and re-test.'
  switch (v.verdict) {
    case 'clearly-better':
      return `Clearly better${tags}.`
    case 'clearly-worse':
      return `Clearly worse${tags}.`
    case 'no-clear-change':
      return `About the same${tags}. Changes like this often take a few sessions.`
    case 'likely-better':
      return `Likely better${tags}. ${more !== undefined ? `About ${more} more serves to confirm.` : tooSmall}`
    case 'likely-worse':
      return `Likely worse${tags}. ${more !== undefined ? `About ${more} more serves to confirm.` : tooSmall}`
    case 'too-early':
      return `Too early to tell${tags}. ${more !== undefined ? `About ${more} more serves would settle it.` : tooSmall}`
    case 'not-comparable':
      return `Not comparable yet${v.reason ? `: ${v.reason.charAt(0).toLowerCase()}${v.reason.slice(1)}` : '.'}`
  }
}
