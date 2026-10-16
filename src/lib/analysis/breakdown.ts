/**
 * Why an area scored what it did (L3.10): its share of the overall, how far
 * its weakest row pulled it down, and which rows this clip left out or read
 * only approximately.
 *
 * Read off the same arithmetic the scores came from — `overallOf` over the
 * measured areas, `chainScore` over each area's rows — so the shares add up to
 * the overall, and the pull is the weakest-link term `chainScore` applies, not
 * a second opinion of it.
 */
import { FUNDAMENTALS, METRICS, isMeasured } from './coaching'
import { SOFT_MEASUREMENT, effectiveWeight } from './confidence'
import { weightedScore } from './geometry'
import type { Fundamental, FundamentalId } from './types'

export interface AreaBreakdown {
  id: FundamentalId
  /** Its share of the overall, 0–1, among the areas this clip measured. */
  share: number
  /** Its points towards the overall: score × share, unrounded. */
  contribution: number
  /** The row the area's score leaned on, and how many points it cost. */
  weakest?: { label: string; score: number; pull: number }
  /** Rows the area grades that this clip could not. */
  dropped: string[]
  /** Rows graded on a reading the card marks approximate. */
  approximate: string[]
}

/** Every measured area, in card order. */
export function scoreBreakdown(fundamentals: readonly Fundamental[]): AreaBreakdown[] {
  const measured = fundamentals.filter(isMeasured)
  const total = measured.reduce((s, f) => s + FUNDAMENTALS[f.id].weight, 0)
  return measured.map((f) => {
    const share = total ? FUNDAMENTALS[f.id].weight / total : 0
    const rows = f.metrics
    const eligible = rows.filter((m) => m.confidence >= SOFT_MEASUREMENT)
    const pool = eligible.length ? eligible : rows
    const weakestRow = pool.reduce<(typeof rows)[number] | undefined>(
      (w, m) => (!w || m.score < w.score ? m : w),
      undefined,
    )
    // What the area would have scored as a plain weighted mean, before the
    // weakest-link share (`chainScore`) leaned on its lowest row.
    const mean = rows.length ? weightedScore(rows.map((m) => ({ score: m.score, weight: effectiveWeight(m) }))) : f.score
    const pull = Math.max(0, mean - f.score)
    const graded = new Set(rows.map((m) => m.id))
    return {
      id: f.id,
      share,
      contribution: f.score * share,
      ...(weakestRow && pull > 0 ? { weakest: { label: weakestRow.label, score: weakestRow.score, pull } } : {}),
      dropped: FUNDAMENTALS[f.id].metrics.filter((id) => !graded.has(id)).map((id) => METRICS[id]?.label ?? id),
      approximate: rows.filter((m) => m.confidence < SOFT_MEASUREMENT).map((m) => m.label),
    }
  })
}

/** A share as a fraction a player would say, not a percentage on screen. */
const FRACTIONS: [number, string][] = [
  [1 / 10, 'a tenth'],
  [1 / 8, 'an eighth'],
  [1 / 6, 'a sixth'],
  [1 / 5, 'a fifth'],
  [1 / 4, 'a quarter'],
  [1 / 3, 'a third'],
  [2 / 5, 'two fifths'],
  [1 / 2, 'half'],
  [1, 'all'],
]
export const shareInWords = (share: number): string =>
  FRACTIONS.reduce((best, f) => (Math.abs(f[0] - share) < Math.abs(best[0] - share) ? f : best))[1]

/** The folded lines under an area's card, one sentence each so each reads at a glance. */
export function breakdownLines(b: AreaBreakdown): string[] {
  const parts = [`Counts for about ${shareInWords(b.share)} of your overall.`]
  if (b.weakest) {
    parts.push(
      `${b.weakest.label}, at ${b.weakest.score}, pulled this area down ${b.weakest.pull} ${b.weakest.pull === 1 ? 'point' : 'points'}.`,
    )
  }
  if (b.dropped.length) parts.push(`Not graded on this clip: ${b.dropped.join(', ')}.`)
  if (b.approximate.length) parts.push(`Approximate on this clip: ${b.approximate.join(', ')}.`)
  return parts
}
