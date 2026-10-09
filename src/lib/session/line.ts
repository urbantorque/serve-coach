/**
 * One serve's analysis, boiled down to a session line (L2.5).
 *
 * Its own module so the store, which reads `session.ts`, does not carry the
 * engine's fault table into the bundle every cold open parses.
 */
import { MIN_EVIDENCE } from '../analysis/flaws'
import type { Analysis } from '../analysis/types'
import type { LineReading, ServeLine } from './session'

/**
 * One serve's analysis, boiled down to what a session keeps.
 *
 * Only the graded rows: an ungraded reading has no band to be read against
 * across a session either. A finding counts as judged at `MIN_EVIDENCE`, the bar
 * `checkDrill` already uses, so "named on 9 of 31 serves it could be judged on"
 * means the same thing here as on a basket.
 */
export function lineOf(analysis: Analysis, number: number, t: number): ServeLine {
  if (analysis.triage?.status === 'rejected') return { number, t, status: 'unclear' }
  const readings: Record<string, LineReading> = {}
  for (const m of analysis.fundamentals.flatMap((f) => f.metrics)) {
    readings[m.id] = { value: round(m.value), confidence: round(m.confidence ?? 1), score: m.score }
  }
  const findings = analysis.diagnosis?.flaws ?? []
  const placement = analysis.diagnosis?.tossPlacement
  return {
    number,
    t,
    status: 'read',
    overall: analysis.overall,
    readings,
    named: findings.filter((f) => f.detected).map((f) => f.flaw),
    judged: findings.filter((f) => f.confidence >= MIN_EVIDENCE).map((f) => f.flaw),
    ...(placement
      ? {
          toss: {
            ...(placement.ahead !== undefined ? { ahead: round(placement.ahead) } : {}),
            ...(placement.across !== undefined ? { across: round(placement.across) } : {}),
            confidence: round(placement.confidence),
          },
        }
      : {}),
    ...(analysis.scale ? { scale: { bodyHeight: round(analysis.scale.bodyHeight), groundY: round(analysis.scale.groundY) } } : {}),
  }
}

/** Four places, which is finer than any reading here is resolved to and keeps a line small. */
const round = (v: number): number => Math.round(v * 1e4) / 1e4
