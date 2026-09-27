/**
 * The one "Did it work?" verdict (METRICS §4.5) for the whole app. Coaching builds the request from
 * the locked stratum (coaching/experiment.ts buildVerdictRequest); analysis/stats owns the rules
 * (didItWork). This adapter joins the two, so Focus, Today and Compare all show the same verdict,
 * and turns a verdict into the stored ExperimentRecord.result (data/domain MatchedComparison) that
 * Compare reads first.
 */
import {
  didItWork,
  medianInterval,
  meanInterval,
  sdChiSquareInterval,
  VERDICT_PARAMS,
  wilson,
  type CentreSession,
  type Direction,
  type SpreadSession,
  type VerdictOutput,
} from '../analysis/stats/index.ts'
import type { MetricId } from '../analysis/types.ts'
import type { CoachingStratum, VerdictFn, VerdictRequest, VerdictResult, VerdictSide } from '../coaching/types.ts'
import type { MatchedComparison } from '../data/domain.ts'

export interface VerdictDetail {
  result: VerdictResult
  /** The analysis/stats output (absent when the request was refused before any maths). */
  output?: VerdictOutput
}

const groups = (side: VerdictSide) => (side.bySession ?? []).filter((g) => g.length > 0)
const sessionIdAt = (side: VerdictSide, i: number, fallback: string) => side.sessionIds[i] ?? `${fallback}-${i + 1}`

/** METRICS §4.5 through analysis/stats, from coaching's request. Never throws. */
export function verdictDetail(req: VerdictRequest): VerdictDetail {
  if (req.notComparableReason) return { result: { verdict: 'not-comparable', method: 'none', reason: req.notComparableReason } }
  const p = VERDICT_PARAMS[req.metricId]
  if (!p) return { result: { verdict: 'not-comparable', method: 'none', reason: 'this measurement has no before-and-after rule yet' } }
  const common = { metricId: req.metricId, swc: p.swc, tau: p.tau, withinSession: req.sameSession, seed: req.metricId }
  let output: VerdictOutput
  if (req.kind === 'rate') {
    output = didItWork({
      ...common,
      kind: 'rate',
      direction: req.direction === 'decrease' ? 'lower' : 'higher',
      baseline: { sessionIds: req.baseline.sessionIds, k: req.baseline.k ?? 0, n: req.baseline.n ?? 0 },
      followUp: { sessionIds: req.followUp.sessionIds, k: req.followUp.k ?? 0, n: req.followUp.n ?? 0 },
    })
  } else if (req.kind === 'spread') {
    const sessions = (side: VerdictSide, name: string): SpreadSession[] =>
      groups(side).map((values, i) => ({
        sessionId: sessionIdAt(side, i, name),
        values,
        sigmaRandom: side.sigmaR ?? 0,
        ...(req.nearMeasurementLimit ? { nearMeasurementLimit: true } : {}),
      }))
    output = didItWork({ ...common, kind: 'spread', baseline: sessions(req.baseline, 'baseline'), followUp: sessions(req.followUp, 'follow-up') })
  } else {
    const band = req.band ?? p.band
    const direction: Direction =
      req.direction === 'increase' ? 'higher' : req.direction === 'decrease' ? 'lower' : band ? { band } : 'higher'
    const sessions = (side: VerdictSide, name: string): CentreSession[] =>
      groups(side).map((values, i) => ({
        sessionId: sessionIdAt(side, i, name),
        values,
        ...(side.sigmaShared !== undefined ? { sigmaShared: side.sigmaShared } : {}),
      }))
    output = didItWork({
      ...common,
      kind: 'centre',
      centre: p.centre ?? 'median',
      direction,
      baseline: sessions(req.baseline, 'baseline'),
      followUp: sessions(req.followUp, 'follow-up'),
    })
  }
  const limit = output.verdict === 'at-measurement-limit'
  const result: VerdictResult = {
    verdict: output.verdict === 'at-measurement-limit' ? 'not-comparable' : output.verdict,
    method: output.method,
    ...(output.delta !== undefined ? { delta: output.delta } : {}),
    ...(output.ci95 ? { low: output.ci95[0], high: output.ci95[1] } : {}),
    ...(output.moreServes !== undefined ? { moreServes: output.moreServes } : {}),
    ...(output.tooSmallToConfirm ? { tooSmallToConfirm: true } : {}),
    ...(limit ? { reason: 'both spreads are at the limit of what we can measure' } : output.reason ? { reason: output.reason } : {}),
  }
  return { result, output }
}

/** Coaching's injected VerdictFn (CoachingInput.verdict). */
export const canonicalVerdict: VerdictFn = (req) => verdictDetail(req).result

/** "More than 150 serves" is stored as this many (JSON has no Infinity); Compare shows the words. */
export const TOO_SMALL_TO_CONFIRM_SERVES = 9999

function side(req: VerdictRequest, which: 'baseline' | 'followUp', out: VerdictOutput | undefined): MatchedComparison['baseline'] {
  const s = req[which]
  const ids = [...s.sessionIds]
  if (req.kind === 'rate') {
    const k = s.k ?? 0
    const n = s.n ?? 0
    const w = wilson(k, n)
    return { sessionIds: ids, n, value: n > 0 ? k / n : 0, low: Number.isFinite(w.low) ? w.low : 0, high: Number.isFinite(w.high) ? w.high : 0 }
  }
  const values = groups(s).flat()
  const o = which === 'baseline' ? out?.baseline : out?.followUp
  const n = o?.n ?? values.length
  if (req.kind === 'spread') {
    const value = o?.value ?? 0
    const ci = sdChiSquareInterval(value, Math.max(1, n - groups(s).length))
    return { sessionIds: ids, n, value, low: Number.isFinite(ci.low) ? ci.low : value, high: Number.isFinite(ci.high) ? ci.high : value }
  }
  const p = VERDICT_PARAMS[req.metricId]
  const ci = p?.centre === 'mean' ? meanInterval(values) : medianInterval(values)
  const value = o?.value ?? ci.value
  return { sessionIds: ids, n, value, low: Number.isFinite(ci.low) ? ci.low : value, high: Number.isFinite(ci.high) ? ci.high : value }
}

/**
 * The stored "Did it work?" result for an experiment (ExperimentRecord.result). Side values are in
 * the metric's display units (the same units the request's per-serve values use).
 */
export function experimentResult(req: VerdictRequest, stratum: CoachingStratum, now: Date = new Date()): MatchedComparison & { computedAt: string } {
  const { result, output } = verdictDetail(req)
  const reason = result.verdict === 'not-comparable' ? result.reason ?? req.notComparableReason : undefined
  const settled = result.verdict === 'clearly-better' || result.verdict === 'clearly-worse' || result.verdict === 'no-clear-change'
  const more = settled || result.verdict === 'not-comparable' ? undefined : result.tooSmallToConfirm ? TOO_SMALL_TO_CONFIRM_SERVES : result.moreServes
  return {
    metricId: req.metricId as MetricId,
    matchedOn: stratum,
    softFactors: { baseline: {} as MatchedComparison['softFactors']['baseline'], current: {} as MatchedComparison['softFactors']['current'], notes: [] },
    baseline: side(req, 'baseline', output),
    current: side(req, 'followUp', output),
    difference: { value: result.delta ?? 0, low: result.low ?? 0, high: result.high ?? 0 },
    verdict: result.verdict,
    ...(more !== undefined ? { moreServesToConfirm: more } : {}),
    notes: [],
    caveats: [...(reason ? [reason] : []), ...(output?.caveats ?? [])],
    computedAt: now.toISOString(),
  }
}
