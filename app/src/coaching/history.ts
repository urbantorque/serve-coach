/**
 * The player's own history in one stratum (COACHING §6.4): personal best, baseline and the relative
 * and "slipped" rules. Only matched sessions count (same view, camera side, court side, serve number,
 * intended type and handedness; METRICS §4.4), never a poor capture, never mixed views.
 */
import type { MetricId } from '../analysis/types.ts'
import { seriesFor, type SeriesOptions, type SessionSummary, summariseCentre, values } from './series.ts'
import { mad, median, normalCdf, sd } from './stats.ts'
import { matchedHistory, servesInStratum } from './strata.ts'
import type { CoachingSession, CoachingStratum } from './types.ts'

export interface HistoryStats {
  /** Earlier matched sessions that met the per-session minimum, newest first (at most 10). */
  sessions: SessionSummary[]
  /** Best centre or spread among them (COACHING §6.4, METRICS request 2). */
  best?: SessionSummary
  /** Median of the last 5 per-session values. */
  baseline?: number
  /** Typical error: SD of consecutive-session differences / sqrt(2). */
  typicalError?: number
}

/** Noise-corrected spread of one session with its SE on the natural scale. */
export function summariseSpread(sessionId: string, startedAt: string, xs: readonly number[], e: number): SessionSummary | null {
  const n = xs.length
  if (n < 2) return null
  const s = n >= 15 ? sd(xs) : 1.4826 * mad(xs)
  const sigma = Math.sqrt(Math.max(0, s * s - e * e))
  // SE of an SD ~ sigma / sqrt(2(n - 1)); floor at e / sqrt(2(n-1)) so a spread at the limit is not certain.
  const se = Math.max(sigma, e) / Math.sqrt(2 * (n - 1))
  return { sessionId, startedAt, n, value: sigma, se }
}

export interface HistoryQuery {
  metricId: MetricId
  kind: 'centre' | 'spread'
  /** Higher is better for centres like leg drive and contact height; spreads are always lower-is-better. */
  better: 'higher' | 'lower'
  minServes: number
  /** Measurement error for spreads, in threshold units. */
  e?: number
  opts: SeriesOptions
}

export function historyStats(history: readonly CoachingSession[], key: CoachingStratum, before: string, q: HistoryQuery): HistoryStats {
  const matched = matchedHistory(history, key, before).slice(0, 10)
  const sessions: SessionSummary[] = []
  for (const h of matched) {
    const xs = values(seriesFor(h, servesInStratum(h, key), q.metricId, q.opts))
    if (xs.length < q.minServes) continue
    const sum = q.kind === 'spread' ? summariseSpread(h.id, h.startedAt, xs, q.e ?? 0) : summariseCentre(h.id, h.startedAt, xs)
    if (sum) sessions.push(sum)
  }
  if (sessions.length === 0) return { sessions }
  const better = q.kind === 'spread' ? 'lower' : q.better
  const best = sessions.reduce((a, b) => (better === 'higher' ? (b.value > a.value ? b : a) : b.value < a.value ? b : a))
  const last5 = sessions.slice(0, 5).map((s) => s.value)
  const diffs: number[] = []
  for (let i = 1; i < sessions.length; i++) diffs.push(sessions[i - 1].value - sessions[i].value)
  const te = diffs.length >= 2 ? sd(diffs) / Math.SQRT2 : undefined
  return { sessions, best, baseline: median(last5), typicalError: te }
}

/**
 * P(this session is worse than the reference by at least `margin`), normal approximation with the
 * METRICS §4.4 between-session SE (including the 2 sigma_s^2 shared-scale term).
 */
export function probWorseBy(
  thisValue: number,
  thisSe: number,
  ref: number,
  refSe: number,
  margin: number,
  better: 'higher' | 'lower',
  sigmaShared = 0,
): number {
  const gap = better === 'higher' ? ref - thisValue : thisValue - ref
  const se = Math.sqrt(thisSe ** 2 + refSe ** 2 + 2 * sigmaShared ** 2)
  if (!(se > 0)) return gap >= margin ? 1 : 0
  return normalCdf((gap - margin) / se)
}

/**
 * Spread relative rule on the log scale: P(sigma_this >= ratio x sigma_best), with
 * SE^2 = 1/(2(n1 - 1)) + 1/(2(n2 - 1)) (research 06 §7.2).
 */
export function probSpreadRatioAbove(thisSigma: number, nThis: number, best: SessionSummary, ratio: number): number {
  if (!(thisSigma > 0) || !(best.value > 0)) return thisSigma > 0 && !(best.value > 0) ? 1 : 0
  const se = Math.sqrt(1 / (2 * (nThis - 1)) + 1 / (2 * (best.n - 1)))
  return normalCdf((Math.log(thisSigma / best.value) - Math.log(ratio)) / se)
}
