import { clamp, mean, statusOf } from './geometry'
import type { Analysis, Metric, PhaseId, Status } from './types'
import { cue } from './voice'

/**
 * How far a basket's tallest and shortest reading may sit apart, as a
 * fraction of the smaller one, before the serves in it stop looking like one
 * body.
 *
 * `maxTrackingJump`/`IMPLAUSIBLE_JUMP` in `geometry.ts` catches a hand-off
 * *inside* one serve's own window — a mid-swing switch to somebody standing
 * nearby. It has nothing to say about the sweep: each serve is extracted and
 * tracked as its own window, ready to finish, so a coach who serves once in
 * the middle of a basket produces a serve that is internally consistent from
 * its own first frame to its own last — nothing jumps, because the wrong body
 * was there the whole time. R12 in `NEXT.md`.
 *
 * `scale.bodyHeight` is the signal: the same camera position and the same
 * person should read the same standing height, within measurement noise, from
 * one serve to the next in one filming session. A different person reads a
 * different one, roughly in proportion to how different they actually stand —
 * a coach 15 cm taller than the player is about 8% more of the frame.
 *
 * No real basket with a genuine hand-off in it exists to calibrate this
 * against — the same block the fixture shoot is waiting on. Set generously
 * rather than tightly for that reason: a threshold that flagged ordinary
 * session noise would train players to ignore the warning, which is worse
 * than missing a genuine switch to someone close to the player's own height.
 */
export const IMPLAUSIBLE_HEIGHT_SPREAD = 0.18

/**
 * Whether the serves being compared look like they came from more than one
 * body, judged the only way a sweep can: by how much their standing height
 * disagrees.
 *
 * Exported separately from `buildConsistency` so it can be driven on its own
 * — the height reading is the whole of what it looks at, and a caller
 * checking that should not have to build seventeen fundamentals to do it.
 */
export function possibleHandoff(analyses: readonly Pick<Analysis, 'scale'>[]): boolean {
  const heights = analyses.map((a) => a.scale?.bodyHeight).filter((h): h is number => (h ?? 0) > 1e-6)
  if (heights.length < 2) return false
  const spread = Math.max(...heights) - Math.min(...heights)
  return spread / Math.min(...heights) > IMPLAUSIBLE_HEIGHT_SPREAD
}

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

/**
 * One measurement, on the best serve and on the worst one.
 *
 * `size` is the gap divided by the width of the metric's own target band, which
 * is what makes a joint angle in degrees and a height in body-heights sortable
 * against each other — the same normalisation `volatility` already uses, for the
 * same reason.
 */
export interface ServeDifference {
  id: string
  label: string
  bestValue: number
  worstValue: number
  /** How far apart they were, as a multiple of the target band's width. */
  size: number
}

/**
 * The best serve in the basket against the worst one.
 *
 * The spread rows say how far each element travelled and say it anonymously:
 * "struck below full reach → struck at full racket reach" is true of the basket
 * and names neither serve. A player standing on a court can count their serves,
 * and the question they actually have is which one was the good one and what
 * they did differently on it. Both ends of every row are already known per
 * serve; nothing here is a new measurement, only an attribution.
 *
 * Absent when there is nothing to attribute — every serve scoring the same means
 * there is no better one to point at.
 */
export interface ServeGap {
  /** One-based serve numbers, matching the chips. */
  best: number
  worst: number
  bestScore: number
  worstScore: number
  /** Every measurement, ranked by how far apart the two serves were. */
  differences: ServeDifference[]
}

/**
 * The best serve's six keyframes beside the worst serve's, position by position.
 *
 * Held apart from `Consistency` on purpose, and never stored. A stored report is
 * mostly its keyframe stills, which is why `db.ts` drops them from older reports
 * before it drops anything else; putting twelve more into every basket report
 * would be filing the largest thing in the record under the heading of a
 * comparison. So this rides on the screen for as long as the clip is open and is
 * simply absent afterwards — see `ServeGap`, which is the durable half and says
 * the same thing in words.
 */
export interface ServePairFrames {
  best: number
  worst: number
  /** One entry per keyframe both serves reached. Either still may be missing. */
  positions: { id: PhaseId; label: string; best?: string; worst?: string }[]
}

/**
 * Pull the two named serves' stills out of the analyses the sweep produced.
 *
 * Matched on the serve's own number in the clip rather than on position in the
 * array, for the same reason `serveNumbers` exists: a sweep skips serves it
 * could not read and covers only the last few of a long basket, so the third
 * entry is routinely not the third serve.
 *
 * Positions are paired by keyframe id, not by index. Both serves have all six
 * under any ordinary reading, and pairing by index would silently put one
 * serve's trophy beside the other's racket drop on the day that stops being
 * true.
 */
export function pairStills(analyses: Analysis[], gap: ServeGap): ServePairFrames | undefined {
  const at = (serveNumber: number) =>
    analyses.find((a, i) => ((a.serves?.index ?? i) + 1) === serveNumber)

  const best = at(gap.best)
  const worst = at(gap.worst)
  if (!best || !worst) return undefined

  const positions = best.phases
    .map((p) => ({
      id: p.id,
      label: p.label,
      best: p.thumbnail,
      worst: worst.phases.find((q) => q.id === p.id)?.thumbnail,
    }))
    // A position with no picture on either side is a row of two empty boxes.
    .filter((p) => p.best || p.worst)

  return positions.length ? { best: gap.best, worst: gap.worst, positions } : undefined
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
  /** The best serve against the worst one. Absent when they scored the same. */
  gap?: ServeGap
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
  /**
   * The standing heights measured across these serves disagree by more than
   * one body, filmed from one camera, plausibly does — see `possibleHandoff`.
   * A caveat on the whole comparison rather than a refusal: the measurements
   * are not wrong about whichever serves they came from, and the spread below
   * may still be real. What it may not be is a comparison of the same person
   * against themselves.
   */
  possibleHandoff: boolean
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

  const overallScores = analyses.map((a) => a.overall)
  const serveNumbers = analyses.map((a, i) => (a.serves?.index ?? i) + 1)

  return {
    serves: analyses.length,
    overallScores,
    // Falls back to the position when a caller hands over analyses assembled by
    // hand — the tests do — rather than reading through a `serves` that is not there.
    serveNumbers,
    metrics: ranked,
    weakest: ranked[0],
    steadiest: ranked[ranked.length - 1],
    gap: buildGap(metrics, overallScores, serveNumbers),
    score,
    status: statusOf(score),
    skipped: Math.max(0, attempted - analyses.length),
    possibleHandoff: possibleHandoff(analyses),
  }
}

/**
 * Which serve was the good one, and what was different about it.
 *
 * Picked on `overall`, which is the number already on the chips — a "best serve"
 * chosen on some other footing than the one the player can read off the screen
 * is the panel disagreeing with itself.
 *
 * Ties go to the earlier serve for best and the later one for worst, so the pair
 * is stable rather than depending on which way the array happened to be walked.
 * Identical scores throughout produce nothing at all: there is no better serve
 * to point at, and inventing one out of a rounding difference would send the
 * player looking for a difference that is not there.
 *
 * The differences are ranked and not cut. Which of them is worth printing
 * depends on whether the two readings are far enough apart to be said in
 * different words, and the vocabulary that decides that belongs to whatever is
 * doing the saying.
 */
function buildGap(
  metrics: MetricSpread[],
  overallScores: number[],
  serveNumbers: number[],
): ServeGap | undefined {
  if (overallScores.length < MIN_COMPARABLE_SERVES) return undefined

  let bestAt = 0
  let worstAt = 0
  for (let i = 1; i < overallScores.length; i++) {
    if (overallScores[i] > overallScores[bestAt]) bestAt = i
    if (overallScores[i] <= overallScores[worstAt]) worstAt = i
  }
  // On the scores, not on the indices. Every serve scoring the same still walks
  // out of that loop with two different positions — best stays at the first and
  // worst slides to the last — so an index comparison called serve one better
  // than serve three on identical numbers, and the panel would then have printed
  // whichever measurements happened to differ under a heading claiming one of
  // them was the good serve.
  if (overallScores[bestAt] === overallScores[worstAt]) return undefined

  const differences: ServeDifference[] = metrics
    .map((m) => ({
      id: m.id,
      label: m.label,
      bestValue: m.values[bestAt],
      worstValue: m.values[worstAt],
      size:
        Math.abs(m.values[bestAt] - m.values[worstAt]) /
        Math.max(1e-9, Math.abs(m.ideal[1] - m.ideal[0])),
    }))
    .sort((a, b) => b.size - a.size)

  return {
    best: serveNumbers[bestAt] ?? bestAt + 1,
    worst: serveNumbers[worstAt] ?? worstAt + 1,
    bestScore: overallScores[bestAt],
    worstScore: overallScores[worstAt],
    differences,
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
