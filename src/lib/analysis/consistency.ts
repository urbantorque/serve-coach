import {
  ER_LEAN_SENSITIVITY,
  LANDING_SQUARE_DEVIATION,
  LANDING_WIDE_DEVIATION,
  CHAIN_RATIO_DEVIATION,
  CHAIN_RATIO_PER_SECOND,
} from './diagnose'
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
 *
 * ONE CLIP ONLY. NOT A CROSS-SESSION CHECK, AND THE SIGNATURE CANNOT SAY SO.
 * The whole reading rests on the sentence four paragraphs up — *the same
 * camera position* — because standing height here is a fraction of the frame
 * and nothing in this app converts that to a person. Move the phone closer and
 * the same body reads taller by the same ratio as the distance, so the 0.18
 * threshold is crossed by a camera move of a little under a metre on a six
 * metre shot: 6 / 1.18 is 5.08. Nobody re-props a phone on a fence a week
 * later to within ninety centimetres.
 *
 * Which makes this the wrong hook for a profile switch, and R55·2b proposed it
 * as exactly that. Fed two sessions of one player it would report a hand-off
 * on most of them, and offering to file somebody's serves under another player
 * on that evidence is the confident nonsense constraint 1 exists to stop.
 * `trackPair.ts` refuses `camera_moved` and `no_scale` for this same reason
 * and has a similarity transform at contact to lean on; this has nothing.
 *
 * The parameter type is `Pick<Analysis, 'scale'>[]`, which a stored `Session`
 * now satisfies structurally, so the compiler will not catch the mistake. The
 * checks below are the guard.
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
/**
 * The two serves a gap names, best first, or nothing when either is missing.
 *
 * Split out of `pairStills` because a second caller needs the same lookup for a
 * different reason: the sweep no longer captures keyframe stills for every
 * serve it measures — it captured thirty-six and showed twelve — so something
 * has to say *which* two are worth going back to the video for, before the
 * pictures exist. That question and "pair up the pictures" have to agree about
 * which serves they mean, and they agree by being one function.
 *
 * Matched on the serve's own number in the clip rather than on position in the
 * array, for the same reason `serveNumbers` exists: a sweep skips serves it
 * could not read and covers only the last few of a long basket, so the third
 * entry is routinely not the third serve.
 */
export function servesInGap(analyses: Analysis[], gap: ServeGap): [Analysis, Analysis] | undefined {
  const at = (serveNumber: number) =>
    analyses.find((a, i) => ((a.serves?.index ?? i) + 1) === serveNumber)

  const best = at(gap.best)
  const worst = at(gap.worst)
  return best && worst ? [best, worst] : undefined
}

export function pairStills(analyses: Analysis[], gap: ServeGap): ServePairFrames | undefined {
  const found = servesInGap(analyses, gap)
  if (!found) return undefined
  const [best, worst] = found

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
  /**
   * Readings the engine measures and no band grades, said as a change between
   * two of this player's own serves. Absent when nothing cleared its confounder.
   */
  uncalibrated?: UncalibratedDelta[]
}

/**
 * A change between two of the player's own serves, from a reading in
 * `UNCALIBRATED`.
 *
 * WHY THIS IS THE ONLY HONEST USE OF THAT REGISTER. Every entry in it is a
 * measurement with no band behind it — repeatable enough to compare, with
 * nothing to compare it *to*. `external_rotation_deg` is the sharp case: the
 * same arm reads 57.1° against the trunk and 93.5° against the shoulder line,
 * so there is no zero to hang a target on, and both frames nonetheless agree
 * exactly about the size of a change (14.4° per 15° dialled). A delta between two of one
 * player's serves is a fact. The same number against a target is four invented
 * numbers, and this type exists so the first can ship without the second.
 *
 * NUMBERS, NEVER A SENTENCE, for the reason `diagnose.ts` composes none. What is
 * printed from this is decided by whatever is doing the printing.
 */
export interface UncalibratedDelta {
  /**
   * The `UNCALIBRATED` key in `tiers.ts` this came from.
   *
   * The key rather than a label, so a reading withdrawn from that register and a
   * surface still printing it cannot drift apart silently.
   */
  id: string
  /** One-based serve number in the clip that read lowest. */
  from: number
  /** One-based serve number that read highest. Never the same serve as `from`. */
  to: number
  /** `to` minus `from`, in the reading's own unit. Positive by construction. */
  delta: number
  /**
   * How much of `delta` the reading's named confounder could account for, in the
   * same unit.
   *
   * Carried rather than consumed here, because it is the whole reason the delta
   * may be shown at all: an entry only exists when `delta` exceeds this, and a
   * consumer that wants to know by how much can subtract. A future round that
   * softens the rule has to move a number a test is watching.
   */
  bound: number
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
    uncalibrated: uncalibratedDeltas(analyses, serveNumbers),
  }
}

/* ------------------------------------------------------ uncalibrated deltas */

/**
 * Every ungraded reading that changed across this basket by more than its own
 * confounder could explain.
 *
 * `undefined` rather than an empty array when nothing survives, so a stored
 * report carries no field at all in the ordinary case — which is the ordinary
 * case, because these refuse readily and are meant to.
 */
function uncalibratedDeltas(
  analyses: Analysis[],
  serveNumbers: number[],
): UncalibratedDelta[] | undefined {
  const found = [
    externalRotationDelta(analyses, serveNumbers),
    landingBalanceDelta(analyses, serveNumbers),
    chainRatioDelta(analyses, serveNumbers),
  ].filter((d): d is UncalibratedDelta => !!d)
  return found.length ? found : undefined
}

/**
 * The noise on the *difference* between two landing readings.
 *
 * NOT THE FLOOR, AND THE DISTINCTION IS THE ROUND. R50 asked for this delta
 * "calibrated against the written-down 0.0035 floor", and 0.0035 is the wrong
 * number to bound a difference with: it is where a square landing *sits*, not
 * how far a reading of it wanders. Two independent readings differ with the
 * deviations added in quadrature, and the honest bound uses both measured
 * deviations rather than the smaller one — 0.0028 for a square landing, 0.0045
 * for a wide one, so a comparison spanning the range gets the wider figure on
 * one side of it.
 *
 * Worked, that is about 0.0053 body heights, against a 0.0035-to-0.0657 range.
 * So the smallest change this can report is roughly a twelfth of the full span
 * it is drawn from — which is a real limit and is why the entry refuses often.
 *
 * Computed rather than written down, so the day either deviation is re-measured
 * this follows instead of disagreeing with its own source.
 */
const LANDING_DELTA_NOISE = Math.hypot(LANDING_SQUARE_DEVIATION, LANDING_WIDE_DEVIATION)

/**
 * How much further across their own feet the player finished on one serve than
 * on another.
 *
 * THE CONFOUNDER IS THE READING ITSELF, which is what makes this different in
 * kind from the external-rotation delta above. There the change could be faked
 * by a posture the app can also see, so the bound is arithmetic on a second
 * measurement. Here nothing fakes it — the reading is off image x, which is what
 * the camera actually measured rather than depth a network inferred, and it is
 * the best-conditioned thing in this register. What can fake it is noise, so the
 * bound is the noise.
 *
 * AND IT MAY NOT SAY WHICH WAY. `LandingBalance.offset` is unsigned on purpose,
 * because which way image x points depends on which side of the player the
 * camera stood, so a sign would be a fact about the filming. That carries
 * straight through: this reports that one landing was further across the feet
 * than another, and never which direction either fell.
 *
 * NO EXTRA REFUSALS. `readLandingBalance` already returns `null` on all three of
 * its own — landmarks unseen, feet out of shot, and a clip that ended before the
 * landing happened — so a serve nobody could read never reaches this list, the
 * same inheritance `externalRotationDelta` makes from the lever.
 */
function landingBalanceDelta(
  analyses: Analysis[],
  serveNumbers: number[],
): UncalibratedDelta | undefined {
  const read: { serve: number; offset: number }[] = []
  analyses.forEach((a, i) => {
    const offset = a.diagnosis?.landing?.offset
    if (typeof offset === 'number' && Number.isFinite(offset)) {
      read.push({ serve: serveNumbers[i] ?? i + 1, offset })
    }
  })
  if (read.length < MIN_COMPARABLE_SERVES) return undefined

  let low = read[0]
  let high = read[0]
  for (const r of read) {
    if (r.offset < low.offset) low = r
    if (r.offset > high.offset) high = r
  }
  if (low.serve === high.serve) return undefined

  const delta = high.offset - low.offset
  if (!(delta > LANDING_DELTA_NOISE)) return undefined

  return {
    id: 'landing_offset_ratio',
    from: low.serve,
    to: high.serve,
    delta,
    bound: LANDING_DELTA_NOISE,
  }
}

/**
 * How much further the racket laid back on one serve than on another.
 *
 * THE CONFOUNDER IS POSTURE, AND IT IS ARITHMETIC. The angle is read against the
 * trunk's up vector, so leaning the trunk moves the reference and the reading
 * follows without the shoulder having rotated at all. `ER_LEAN_SENSITIVITY`
 * bounds that at 0.5° per degree of lean — the worse of the two arms it was
 * measured on — and, which is what makes a bound possible rather than a model,
 * it is *additive*: swept across four rotations by four leans the shift is the
 * same at every rotation to within a degree. So two serves whose lean differs
 * by L carry up to 0.5 × L degrees of false change between them, and anything at or under that is posture
 * wearing a shoulder's clothes.
 *
 * REFUSED, NOT HEDGED, when the bound eats the delta. This is an extra line on a
 * panel that is complete without it; a comparison qualified into meaninglessness
 * is worse than no comparison, and the register it comes from exists precisely
 * to stop numbers being asserted past what is behind them.
 *
 * NO LEVER RULE HERE, deliberately: `readExternalRotation` already returns a null
 * `deg` below `MIN_ROTATION_LEVER`, so a serve whose trophy arm was too folded to
 * read never reaches this list. A second copy of that threshold would be one more
 * thing to keep in step.
 */
function externalRotationDelta(
  analyses: Analysis[],
  serveNumbers: number[],
): UncalibratedDelta | undefined {
  const read: { serve: number; deg: number; lean: number }[] = []
  analyses.forEach((a, i) => {
    const deg = a.diagnosis?.externalRotation?.deg
    const lean = a.diagnosis?.signals?.spine_lean_deg
    /*
     * Both halves or neither: without the lean there is no bound, and without a
     * bound the delta is a number nobody can say is not posture.
     *
     * `signals` is already gated on `MIN_EVIDENCE`, so a lean the tracker could
     * not see well enough is absent here rather than present and wrong — which
     * means this refusal inherits that bar instead of setting a second one.
     */
    if (typeof deg === 'number' && Number.isFinite(deg) &&
        typeof lean === 'number' && Number.isFinite(lean)) {
      read.push({ serve: serveNumbers[i] ?? i + 1, deg, lean })
    }
  })
  if (read.length < MIN_COMPARABLE_SERVES) return undefined

  let low = read[0]
  let high = read[0]
  for (const r of read) {
    if (r.deg < low.deg) low = r
    if (r.deg > high.deg) high = r
  }
  if (low.serve === high.serve) return undefined

  const delta = high.deg - low.deg
  const bound = ER_LEAN_SENSITIVITY * Math.abs(high.lean - low.lean)
  if (!(delta > bound)) return undefined

  return { id: 'external_rotation_deg', from: low.serve, to: high.serve, delta, bound }
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

/**
 * How long the serve took, from a stored report.
 *
 * `motionSeconds` is computed inside `diagnose` and never kept — but `phases`
 * carries `t` on every keyframe and is stored, so the tempo is recoverable
 * without a new field on the row. Worth doing rather than adding one: R67
 * measured what a stored report costs and R58·1 checked what survives the prune
 * ladder, and the cheapest field is the one nobody stores.
 *
 * `undefined` when either keyframe is missing, which a pruned or hand-edited
 * report can be.
 */
function motionSecondsOf(a: Analysis): number | undefined {
  const ready = a.phases?.find((p) => p.id === 'ready')?.t
  const contact = a.phases?.find((p) => p.id === 'contact')?.t
  if (typeof ready !== 'number' || typeof contact !== 'number') return undefined
  const span = contact - ready
  return span > 0 ? span : undefined
}

/**
 * How much later the arm followed the legs on one serve than on another.
 *
 * THE CONFOUNDER IS TEMPO, AND ONLY PARTLY. `chain_span_ratio` exists because
 * the raw span grades tempo — the same serve served slowly has a longer chain —
 * and dividing by the motion's own duration removes most of that dependence and
 * not all of it. What is left is 0.0223 per second of tempo difference, measured
 * in R50·3's premise cycle and again after the rig's swing was re-posed on real
 * motion, which doubled it; the larger is the one kept.
 *
 * **THE ROUND'S OWN 21% IS THE WRONG NUMBER AND THIS IS WHY.** That figure is
 * the register's, and it is the *total* spread of the reading across a tempo
 * sweep with seed noise folded in — the right answer to "is this bandable" and
 * the wrong one for a difference. Bounding with it would refuse every comparison
 * there is, and refuse it mostly for a reason that is not tempo. The two terms
 * add in quadrature: 0.0095 at equal tempo, growing as the two serves diverge.
 *
 * REFUSED WITHOUT BOTH TEMPOS. The bound cannot be computed without them, and a
 * delta with no bound is a number nobody can say is not the clock.
 */
const chainRatioBound = (deltaSeconds: number) =>
  Math.hypot(Math.SQRT2 * CHAIN_RATIO_DEVIATION, CHAIN_RATIO_PER_SECOND * Math.abs(deltaSeconds))

function chainRatioDelta(
  analyses: Analysis[],
  serveNumbers: number[],
): UncalibratedDelta | undefined {
  const read: { serve: number; ratio: number; seconds: number }[] = []
  analyses.forEach((a, i) => {
    const ratio = a.diagnosis?.chain?.span_ratio
    const seconds = motionSecondsOf(a)
    if (typeof ratio === 'number' && Number.isFinite(ratio) && seconds !== undefined) {
      read.push({ serve: serveNumbers[i] ?? i + 1, ratio, seconds })
    }
  })
  if (read.length < MIN_COMPARABLE_SERVES) return undefined

  let low = read[0]
  let high = read[0]
  for (const r of read) {
    if (r.ratio < low.ratio) low = r
    if (r.ratio > high.ratio) high = r
  }
  if (low.serve === high.serve) return undefined

  const delta = high.ratio - low.ratio
  const bound = chainRatioBound(high.seconds - low.seconds)
  if (!(delta > bound)) return undefined

  return { id: 'chain_span_ratio', from: low.serve, to: high.serve, delta, bound }
}

/* ------------------------------------------- first serves against second ---- */

/**
 * A basket's spreads, split by what the player said each serve was.
 *
 * WHY THIS IS WORTH HAVING. A club player's second serve is a different motion,
 * not a slower first — and a basket of both, averaged together, reports a spread
 * that is mostly the difference between two intentions. The player who patty-cakes
 * their second is doing something the app currently averages away.
 *
 * **IT PARTITIONS, IT DOES NOT INFER.** R53·1 refused inference by two
 * independent routes, and this only ever reads a tag somebody typed. A serve
 * nobody tagged is in neither bucket rather than guessed into one, which is why
 * the counts below routinely fail to add up to the basket — and that is the
 * honest state, not a rounding error.
 *
 * **REFUSED BELOW `MIN_COMPARABLE_SERVES` ON EITHER SIDE.** One serve has no
 * spread — `max − min` over a single reading is zero, which would score a
 * perfect 100 off a sample containing no repetition. That is
 * `buildConsistency`'s own floor, applied per bucket rather than to the basket,
 * because a basket of six with five firsts and one second has a comparison on
 * one side and none on the other.
 */
export interface SplitConsistency {
  first?: Consistency
  second?: Consistency
  /** Serves in the basket the player never said anything about. */
  untagged: number
}

/**
 * Split a basket by tag.
 *
 * Takes the analyses again rather than a built `Consistency`, because a spread
 * cannot be re-split after the fact: `max`, `min` and the score are computed
 * across whatever went in, and there is no way back from an average to the
 * readings under it. So each side is built by the same function on its own
 * subset, and the two are `Consistency` objects every existing reader already
 * knows how to draw.
 */
export function splitByServeNumber(
  analyses: Analysis[],
  serveNumberOf: (a: Analysis) => 1 | 2 | undefined,
): SplitConsistency {
  const firsts: Analysis[] = []
  const seconds: Analysis[] = []
  let untagged = 0
  for (const a of analyses) {
    const n = serveNumberOf(a)
    if (n === 1) firsts.push(a)
    else if (n === 2) seconds.push(a)
    else untagged++
  }
  return {
    first: firsts.length >= MIN_COMPARABLE_SERVES ? buildConsistency(firsts, firsts.length) : undefined,
    second: seconds.length >= MIN_COMPARABLE_SERVES ? buildConsistency(seconds, seconds.length) : undefined,
    untagged,
  }
}
