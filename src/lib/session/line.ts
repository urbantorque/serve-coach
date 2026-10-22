/**
 * One serve's analysis, boiled down to a session line (L2.5).
 *
 * Its own module so the store, which reads `session.ts`, does not carry the
 * engine's fault table into the bundle every cold open parses.
 */
import { MIN_EVIDENCE } from '../analysis/flaws'
import type { FlawId } from '../analysis/flaws'
import { LM, median } from '../analysis/geometry'
import { CAMERA_ALLOWANCE, NOISE_FLOOR } from '../analysis/tiers'
import type { Analysis } from '../analysis/types'
import type { LineReading, ServeLine } from './session'

/**
 * One serve's analysis, boiled down to what a session keeps.
 *
 * Only the graded rows: an ungraded reading has no band to be read against
 * across a session either. A finding counts as judged at `MIN_EVIDENCE`, the bar
 * `checkDrill` already uses, so "named on 9 of 31 serves it could be judged on"
 * means the same thing here as on a basket.
 *
 * Each named fault keeps how far past its floor it was, in floors (L2.7): the
 * floor is the larger of the signal's noise and the camera's allowance, the
 * same pair `judge` names a fault against, so 1 is a fault named by the
 * narrowest margin the engine allows and 2 is one twice as far out.
 */
export function lineOf(analysis: Analysis, number: number, t: number): ServeLine {
  if (analysis.triage?.status === 'rejected') return { number, t, status: 'unclear' }
  const readings: Record<string, LineReading> = {}
  for (const m of analysis.fundamentals.flatMap((f) => f.metrics)) {
    readings[m.id] = { value: round(m.value), confidence: round(m.confidence ?? 1), score: m.score }
  }
  const findings = analysis.diagnosis?.flaws ?? []
  const placement = analysis.diagnosis?.tossPlacement
  const past: Partial<Record<FlawId, number>> = {}
  for (const f of findings) {
    if (!f.detected) continue
    const floor = Math.max(NOISE_FLOOR[f.signal] ?? 0, CAMERA_ALLOWANCE[f.signal] ?? 0)
    if (floor > 0 && Number.isFinite(f.miss)) past[f.flaw] = Math.round((f.miss / floor) * 100) / 100
  }
  // Where across the picture the player stood: the hips' median over the
  // window. From behind, the two sides of the centre mark differ here and
  // nowhere else.
  const x = analysis.frames?.length
    ? median(analysis.frames.map((f) => (f.image[LM.leftHip].x + f.image[LM.rightHip].x) / 2))
    : undefined
  return {
    number,
    t,
    status: 'read',
    overall: analysis.overall,
    readings,
    named: findings.filter((f) => f.detected).map((f) => f.flaw),
    judged: findings.filter((f) => f.confidence >= MIN_EVIDENCE).map((f) => f.flaw),
    ...(Object.keys(past).length ? { past } : {}),
    ...(analysis.speed && 'speed' in analysis.speed
      ? { speed: { ms: round(analysis.speed.speed.ms), low: round(analysis.speed.speed.low), high: round(analysis.speed.speed.high) } }
      : {}),
    ...(placement
      ? {
          toss: {
            ...(placement.ahead !== undefined ? { ahead: round(placement.ahead) } : {}),
            ...(placement.across !== undefined ? { across: round(placement.across) } : {}),
            confidence: round(placement.confidence),
          },
        }
      : {}),
    ...(analysis.scale
      ? {
          scale: {
            bodyHeight: round(analysis.scale.bodyHeight),
            groundY: round(analysis.scale.groundY),
            ...(x !== undefined && Number.isFinite(x) ? { x: round(x) } : {}),
          },
        }
      : {}),
  }
}

/** Four places, which is finer than any reading here is resolved to and keeps a line small. */
const round = (v: number): number => Math.round(v * 1e4) / 1e4
