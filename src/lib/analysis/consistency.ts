import { clamp, mean, statusOf } from './geometry'
import type { Analysis, Metric, Status } from './types'
import { cue } from './voice'

export interface MetricSpread {
  id: string
  label: string
  unit: string
  decimals: number
  /** One reading per serve, in the order they were hit. */
  values: number[]
  average: number
  min: number
  max: number
  /** max − min. The honest headline: how far this wandered across the basket. */
  spread: number
  /** Spread as a multiple of the target band's width. 1 means it wanders across the whole band. */
  volatility: number
  score: number
  status: Status
  ideal: [number, number]
  range: [number, number]
}

export interface Consistency {
  /** Number of serves that were successfully measured. */
  serves: number
  overallScores: number[]
  /**
   * Which serve in the clip each of those scores belongs to, one-based.
   *
   * Carried rather than left to the panel to number `1..n` by position. A sweep
   * skips a serve it could not read and covers only the last few of a long
   * basket, so a chip numbered by array index labels the wrong serve — and the
   * player is looking at a clip in which they can count them.
   */
  serveNumbers: number[]
  metrics: MetricSpread[]
  /** The element that varies most — what to groove before anything else. */
  weakest?: MetricSpread
  /** The steadiest element, so the report has something to stand on. */
  steadiest?: MetricSpread
  score: number
  status: Status
  /**
   * Serves the sweep tried to measure and could not.
   *
   * `attempted` is what was actually attempted, which is not the number of
   * serves in the clip: the sweep is capped at `MAX_CONSISTENCY_SERVES`. Passing
   * the clip's own count instead reported the serves beyond the cap as unreadable
   * — a clip of ten came back as "four serves were too unclear to measure", about
   * four serves nothing ever looked at.
   *
   * The same rule decides what a stopped sweep reports. `Sweep.attempted` counts
   * only the serves read to a conclusion, so a player who stops after four of six
   * is told about four serves and nothing else. The two they interrupted were not
   * unclear; nothing finished looking at them either.
   */
  skipped: number
}

/**
 * Fewer serves than this and there is no comparison to draw.
 *
 * One serve has no spread — `max − min` over a single reading is zero, which
 * would score a perfect 100 for repeatability off a sample that contains no
 * repetition. Exported because the screens have to know when a part-finished
 * sweep has become worth showing, and a second hard-coded 2 somewhere else is
 * how a screen ends up offering a comparison this function then refuses to make.
 */
export const MIN_COMPARABLE_SERVES = 2

/**
 * How consistent is this element, given how much it moved?
 *
 * Judged against the width of its own target band rather than an absolute
 * number, because "varies by 15" means something completely different for a
 * joint angle in degrees than for a contact height in body-heights. Wandering
 * across the entire band scores 50; holding perfectly still scores 100.
 */
function consistencyScore(spread: number, ideal: [number, number]): number {
  const band = Math.abs(ideal[1] - ideal[0])
  if (band < 1e-9) return spread < 1e-9 ? 100 : 50
  const volatility = spread / band
  return Math.round(clamp(100 * (1 - volatility / 2), 4, 100))
}

/**
 * Compare the same measurements across several serves from one clip.
 *
 * A single serve tells you about that serve. Five tell you about the technique —
 * and for a club player the gap between their best and worst serve is usually a
 * bigger problem than the average itself. Only metrics present in every serve
 * are compared, since a measurement dropped for one serve (contact depth needs a
 * side-on view) would otherwise skew its own spread.
 */
export function buildConsistency(analyses: Analysis[], attempted: number): Consistency | undefined {
  if (analyses.length < MIN_COMPARABLE_SERVES) return undefined

  const byId = new Map<string, { metric: Metric; values: number[] }>()

  for (const id of analyses[0].fundamentals.flatMap((f) => f.metrics.map((m) => m.id))) {
    const readings: number[] = []
    let template: Metric | undefined

    for (const a of analyses) {
      const m = a.fundamentals.flatMap((f) => f.metrics).find((x) => x.id === id)
      if (!m) break
      template = template ?? m
      readings.push(m.value)
    }

    if (template && readings.length === analyses.length) {
      byId.set(id, { metric: template, values: readings })
    }
  }

  const metrics: MetricSpread[] = [...byId.values()].map(({ metric, values }) => {
    const min = Math.min(...values)
    const max = Math.max(...values)
    const spread = max - min
    const score = consistencyScore(spread, metric.ideal)
    return {
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      decimals: metric.decimals,
      values,
      average: mean(values),
      min,
      max,
      spread,
      volatility: spread / Math.max(1e-9, Math.abs(metric.ideal[1] - metric.ideal[0])),
      score,
      status: statusOf(score),
      ideal: metric.ideal,
      range: metric.range,
    }
  })

  const ranked = [...metrics].sort((a, b) => a.score - b.score)

  // Lean on the least repeatable elements rather than the flat average. A serve
  // is a chain: one toss that wanders ruins the serve no matter how steady the
  // other sixteen measurements are. A plain mean over seventeen metrics buries a
  // single bad one — it scored 97 "great" next to a headline calling out an
  // element drifting across its entire target band, which is the report arguing
  // with itself.
  const worstTwo = ranked.slice(0, 2).map((m) => m.score)
  const score = Math.round(0.4 * mean(metrics.map((m) => m.score)) + 0.6 * mean(worstTwo))

  return {
    serves: analyses.length,
    overallScores: analyses.map((a) => a.overall),
    // Falls back to the position when a caller hands over analyses assembled by
    // hand — the tests do — rather than reading through a `serves` that is not there.
    serveNumbers: analyses.map((a, i) => (a.serves?.index ?? i) + 1),
    metrics: ranked,
    weakest: ranked[0],
    steadiest: ranked[ranked.length - 1],
    score,
    status: statusOf(score),
    skipped: Math.max(0, attempted - analyses.length),
  }
}

/** A sentence for the top of the consistency panel. */
export function consistencyHeadline(c: Consistency): string {
  if (!c.weakest) return ''
  if (c.weakest.score >= 85) {
    return cue(`Almost nothing moved across ${c.serves} serves. That repeatability holds up under pressure.`)
  }
  if (c.weakest.score >= 70) {
    return cue(`Your motion repeats well across ${c.serves} serves. ${c.weakest.label} drifts.`)
  }
  return cue(`Your ${c.weakest.label.toLowerCase()} changes serve to serve. Groove that one thing before anything else.`)
}
