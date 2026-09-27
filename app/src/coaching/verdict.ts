/**
 * "Did it work?" verdict (METRICS §4.5). METRICS owns the rules and `analysis/stats` owns the ONE
 * implementation (didItWork: Pocock looks, τ, the stratified bootstrap of corrected variances for
 * spreads, Newcombe for rates, "about N more serves"). Coaching adds no verdict rules of its own
 * (COACHING §12.4): `metricsVerdict` only adapts coaching's request to it, so the verdict is the same
 * whether the app injects `CoachingInput.verdict` (integration/verdict.ts) or not. The earlier
 * coaching-local approximation (log-SD normal spreads, 1.2533² medians) is gone.
 */
import { didItWork, MIN_N, VERDICT_PARAMS, type CentreSession, type Direction, type SpreadSession, type VerdictOutput } from '../analysis/stats/index.ts'
import type { VerdictRequest, VerdictResult, VerdictSide } from './types.ts'

export const VERDICT_MINIMUM = { centre: MIN_N.didItWork.centrePerSide, spread: MIN_N.didItWork.spreadPerSide, rate: MIN_N.didItWork.ratePerSide } as const

const groups = (side: VerdictSide) => (side.bySession ?? []).filter((g) => g.length > 0)
const idAt = (side: VerdictSide, i: number, fallback: string) => side.sessionIds[i] ?? `${fallback}-${i + 1}`

/** The analysis/stats verdict output for a coaching request (undefined when refused before any maths). */
export function verdictOutput(req: VerdictRequest): VerdictOutput | undefined {
  if (req.notComparableReason) return undefined
  const p = VERDICT_PARAMS[req.metricId]
  if (!p) return undefined
  const common = { metricId: req.metricId, swc: p.swc, tau: p.tau, withinSession: req.sameSession, seed: req.metricId }
  if (req.kind === 'rate') {
    return didItWork({
      ...common,
      kind: 'rate',
      direction: req.direction === 'decrease' ? 'lower' : 'higher',
      baseline: { sessionIds: req.baseline.sessionIds, k: req.baseline.k ?? 0, n: req.baseline.n ?? 0 },
      followUp: { sessionIds: req.followUp.sessionIds, k: req.followUp.k ?? 0, n: req.followUp.n ?? 0 },
    })
  }
  if (req.kind === 'spread') {
    const sessions = (side: VerdictSide, name: string): SpreadSession[] =>
      groups(side).map((values, i) => ({
        sessionId: idAt(side, i, name),
        values,
        sigmaRandom: side.sigmaRBySession?.[i]?.length === values.length ? side.sigmaRBySession[i] : side.sigmaR ?? 0,
        ...(req.nearMeasurementLimit ? { nearMeasurementLimit: true } : {}),
      }))
    return didItWork({ ...common, kind: 'spread', baseline: sessions(req.baseline, 'baseline'), followUp: sessions(req.followUp, 'follow-up') })
  }
  const band = req.band ?? p.band
  const direction: Direction = req.direction === 'increase' ? 'higher' : req.direction === 'decrease' ? 'lower' : band ? { band } : 'higher'
  const sessions = (side: VerdictSide, name: string): CentreSession[] =>
    groups(side).map((values, i) => ({ sessionId: idAt(side, i, name), values, ...(side.sigmaShared !== undefined ? { sigmaShared: side.sigmaShared } : {}) }))
  return didItWork({ ...common, kind: 'centre', centre: p.centre ?? 'median', direction, baseline: sessions(req.baseline, 'baseline'), followUp: sessions(req.followUp, 'follow-up') })
}

/** METRICS §4.5 verdict through analysis/stats (the same maths as the injected canonical verdict). */
export function metricsVerdict(req: VerdictRequest): VerdictResult {
  if (req.notComparableReason) return { verdict: 'not-comparable', method: 'none', reason: req.notComparableReason }
  const out = verdictOutput(req)
  if (!out) return { verdict: 'not-comparable', method: 'none', reason: 'this measurement has no before-and-after rule yet' }
  const limit = out.verdict === 'at-measurement-limit'
  return {
    verdict: limit ? 'not-comparable' : out.verdict,
    method: out.method,
    ...(out.delta !== undefined ? { delta: out.delta } : {}),
    ...(out.ci95 ? { low: out.ci95[0], high: out.ci95[1] } : {}),
    ...(out.moreServes !== undefined ? { moreServes: out.moreServes } : {}),
    ...(out.tooSmallToConfirm ? { tooSmallToConfirm: true } : {}),
    ...(limit ? { reason: 'both spreads are at the limit of what we can measure' } : out.reason ? { reason: out.reason } : {}),
  }
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
