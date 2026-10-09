/**
 * A practice session's serves read together (L2.7). Numbers only: the
 * sentences are the dashboard's (L2.8), and nothing here decides how a finding
 * is said, only whether there is one.
 *
 * Five questions, each answered with the rule the app already uses for it:
 *
 *   - How much did each reading wander? The basket's statistic, made robust: a
 *     standard deviation from the median absolute deviation, with the camera's
 *     own deviation (`CARD_NOISE_SD`) taken out.
 *   - Where did the player stand, and did the phone move? Sides are told apart
 *     by size and place in the picture, a move of the phone by a lasting step
 *     in the footing that one body moving cannot explain (`SAME_BODY_SLOPE`).
 *   - Did the serve change from the start to the end? D5.2's rule for the
 *     serves that missed, applied to the first and last serves on one side and
 *     one footing: enough serves at each end, a gap past the camera's noise, and
 *     a gap well past its own standard error.
 *   - Which faults came up, and how often? Counted against the serves each
 *     could be judged on, in `HIERARCHY`'s order.
 *   - Which faults does the session as a whole have? Named on most of the
 *     serves that could show it, or on a good share of them by a wide margin.
 *     One serve can be read either side of a floor by the camera alone; a
 *     majority of thirty cannot.
 */
import { SOFT_MEASUREMENT } from '../analysis/confidence'
import { CARD_NOISE_SD, SAME_BODY_SLOPE } from '../analysis/consistency'
import type { FlawId } from '../analysis/flaws'
import { HIERARCHY } from '../analysis/triage'
import type { ServeLine } from './session'

/** Serves needed at each end before the two ends are compared: D5.2's five. */
export const MIN_EACH_END = 5

/** A change from start to end is a gap this many standard errors wide... */
export const DRIFT_STRENGTH = 3

/** ...and this many of the camera's own deviations, so the camera cannot make it. */
export const DRIFT_NOISE = 1.5

/** Serves a fault must be judgeable on before the session is said to have it. */
export const MIN_JUDGED = 5

/** A fault named on at least this share of the serves it could be judged on is the session's. */
export const MAJORITY = 0.5

/** So is one named on this share, when its median miss is `FAR_PAST` floors out. */
export const FAR_SHARE = 1 / 3
export const FAR_PAST = 2

/** How many serves stand for the session: the dashboard's strip, and L2.11's picks. */
export const REPRESENTATIVE = 8

/** Serves on each side of a split before it is believed. */
const MIN_SIDE = 3

/**
 * How far apart two places must be to be two sides: a quarter of the body
 * across the picture, or an eighth of its size. From the guide's placement the
 * sides differ by 44% in size; from behind, by a body or more across.
 */
const SIDE_ACROSS = 0.25
const SIDE_SIZE = Math.log(1.12)

/** A lasting step in the footing worth calling a moved phone, in frame heights. */
const BUMP_FOOTING = 0.02

/** And in size, as a share. */
const BUMP_SIZE = Math.log(1.06)

export interface ReadingSummary {
  id: string
  /** Serves it was read on with confidence. */
  n: number
  median: number
  /** How far it wandered, the camera's part taken out: a robust standard deviation. */
  spread: number
  /** Its median card score. */
  score: number
}

export interface Side {
  /** Line numbers, in the order they were hit. */
  lines: number[]
  bodyHeight: number
  groundY: number
  x?: number
}

export interface Drift {
  id: string
  early: number
  late: number
  /** Late minus early, in the reading's units. */
  gap: number
  /** The gap over its standard error. */
  strength: number
  earlyServes: number
  lateServes: number
}

export interface FaultCount {
  flaw: FlawId
  /** Its `HIERARCHY` group, or nothing for a fault outside it. */
  group?: string
  /** Serves it could be judged on. */
  judged: number
  /** Serves it was named on. */
  named: number
  rate: number
  /** The median miss over the serves it was named on, in floors. */
  past?: number
  /** Whether the session as a whole has it. */
  verdict: boolean
}

export interface SessionStats {
  read: number
  unclear: number
  /** The median overall score of the serves read, and the best and worst of them by line number. */
  overall?: { median: number; best: number; worst: number }
  readings: ReadingSummary[]
  /** One place, or two; in the order they were first served from. */
  sides: Side[]
  /** Line numbers between moves of the phone, in time order. One segment when it never moved. */
  segments: number[][]
  /**
   * How many serves the start-to-end comparison stood on: the largest group on
   * one side and one footing. Zero when no group had enough at each end.
   */
  driftOver: number
  /** Readings that changed from the start of the session to the end, strongest first. */
  drifts: Drift[]
  /** Every fault judged on at least one serve, in `HIERARCHY`'s order, then by how often. */
  faults: FaultCount[]
  /** The faults the session as a whole has, in `HIERARCHY`'s order. */
  verdict: FlawId[]
  /** Up to `REPRESENTATIVE` line numbers spanning the scores, in time order. */
  representative: number[]
}

/* ---------------------------------------------------------------- helpers */

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** A standard deviation from the median absolute deviation: one wild serve does not set it. */
const robustSd = (xs: readonly number[]) => {
  const m = median(xs)
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)))
}

const variance = (xs: readonly number[]) => {
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)
}

/** A reading taken with enough confidence to count. */
const confident = (line: ServeLine, id: string): number | undefined => {
  const r = line.readings?.[id]
  return r && Number.isFinite(r.value) && r.confidence >= SOFT_MEASUREMENT ? r.value : undefined
}

/* ------------------------------------------------------------------ sides */

type Placed = { line: ServeLine; h: number; g: number; x?: number }

/**
 * The best split of these lines in two along one feature, or nothing: the
 * widest gap between neighbours in sorted order, kept only when it is wide in
 * itself and wide against the scatter on either side of it.
 */
function splitAlong(points: Placed[], feature: (p: Placed) => number, wide: number) {
  const sorted = [...points].sort((a, b) => feature(a) - feature(b))
  let best: { at: number; gap: number; ratio: number } | undefined
  for (let i = MIN_SIDE; i <= sorted.length - MIN_SIDE; i++) {
    const gap = feature(sorted[i]) - feature(sorted[i - 1])
    if (gap < wide) continue
    const scatter = Math.max(robustSd(sorted.slice(0, i).map(feature)), robustSd(sorted.slice(i).map(feature)), 1e-6)
    const ratio = gap / scatter
    if (ratio >= 4 && (!best || ratio > best.ratio)) best = { at: i, gap, ratio }
  }
  return best && { low: sorted.slice(0, best.at), high: sorted.slice(best.at), ratio: best.ratio }
}

function sidesOf(points: Placed[]): Placed[][] {
  if (points.length < 2 * MIN_SIDE) return [points]
  const size = median(points.map((p) => p.h))
  const across = points.every((p) => p.x !== undefined) ? splitAlong(points, (p) => p.x! / size, SIDE_ACROSS) : undefined
  let bySize = splitAlong(points, (p) => Math.log(p.h), SIDE_SIZE)
  if (bySize) {
    // Further from the lens is smaller and stands higher in the picture, by
    // the slope one body moving gives. A change of size the footing does not
    // follow is the phone, not the player.
    const dh = median(bySize.high.map((p) => p.h)) - median(bySize.low.map((p) => p.h))
    const dg = median(bySize.high.map((p) => p.g)) - median(bySize.low.map((p) => p.g))
    const slope = dg / dh
    if (!(slope >= SAME_BODY_SLOPE[0] && slope <= SAME_BODY_SLOPE[1])) bySize = undefined
  }
  const split = [across, bySize].filter((s) => s !== undefined).sort((a, b) => b!.ratio - a!.ratio)[0]
  if (!split) return [points]
  const byTime = (ps: Placed[]) => [...ps].sort((a, b) => a.line.number - b.line.number)
  return [byTime(split.low), byTime(split.high)].sort((a, b) => a[0].line.number - b[0].line.number)
}

/**
 * Where on one side the phone moved: a lasting step in the footing, or in the
 * size, between two runs of at least `MIN_SIDE` serves, that one body moving
 * along the lens does not explain. The line number the new footing starts at.
 */
function moveOn(side: Placed[]): number | undefined {
  // Where: the split whose two runs differ most against their own scatter. A
  // mean rather than a median, because a median barely moves as the split
  // slides a serve or two past the step, and the place would be a guess.
  const g = (p: Placed) => p.g
  const lh = (p: Placed) => Math.log(p.h)
  const tOf = (before: Placed[], after: Placed[], f: (p: Placed) => number, least: number) =>
    Math.abs(mean(after.map(f)) - mean(before.map(f))) /
    Math.max(Math.sqrt(variance(before.map(f)) / before.length + variance(after.map(f)) / after.length), least)
  let best: { k: number; t: number } | undefined
  for (let k = MIN_SIDE; k <= side.length - MIN_SIDE; k++) {
    const t = tOf(side.slice(0, k), side.slice(k), g, 1e-4) + tOf(side.slice(0, k), side.slice(k), lh, 1e-3)
    if (!best || t > best.t) best = { k, t }
  }
  if (!best) return undefined

  // Whether: a lasting step, wide in itself and against the scatter, that a
  // body stepping back along the lens does not explain.
  const before = side.slice(0, best.k)
  const after = side.slice(best.k)
  const dg = median(after.map(g)) - median(before.map(g))
  const dh = median(after.map((p) => p.h)) - median(before.map((p) => p.h))
  const dlh = Math.log(median(after.map((p) => p.h)) / median(before.map((p) => p.h)))
  if (Math.abs(dg) < BUMP_FOOTING && Math.abs(dlh) < BUMP_SIZE) return undefined
  // A body that stepped back shrinks and stands higher together.
  const slope = dg / dh
  if (Math.abs(dlh) >= BUMP_SIZE && slope >= SAME_BODY_SLOPE[0] && slope <= SAME_BODY_SLOPE[1]) return undefined
  const scatter = Math.max(robustSd(before.map(g)), robustSd(after.map(g)), 0.002)
  if (Math.abs(dg) / scatter < 4 && Math.abs(dlh) < BUMP_SIZE) return undefined
  return after[0].line.number
}

/* ------------------------------------------------------------------- main */

export function sessionStats(lines: readonly ServeLine[]): SessionStats {
  const read = lines.filter((l) => l.status === 'read').sort((a, b) => a.number - b.number)
  const unclear = lines.length - read.length

  // Every reading, wandering with the camera's part taken out.
  const ids = [...new Set(read.flatMap((l) => Object.keys(l.readings ?? {})))]
  const readings: ReadingSummary[] = []
  for (const id of ids) {
    const values = read.map((l) => confident(l, id)).filter((v): v is number => v !== undefined)
    if (values.length < MIN_EACH_END) continue
    const noise = CARD_NOISE_SD[id] ?? 0
    const sd = robustSd(values)
    readings.push({
      id,
      n: values.length,
      median: median(values),
      spread: Math.sqrt(Math.max(0, sd * sd - noise * noise)),
      score: Math.round(median(read.filter((l) => confident(l, id) !== undefined).map((l) => l.readings![id].score))),
    })
  }

  // Where they stood, and whether the phone moved.
  const placed: Placed[] = read
    .filter((l) => l.scale && l.scale.bodyHeight > 1e-6 && Number.isFinite(l.scale.groundY))
    .map((l) => ({ line: l, h: l.scale!.bodyHeight, g: l.scale!.groundY, x: l.scale!.x }))
  const sidePoints = placed.length ? sidesOf(placed) : []
  const moves = [...new Set(sidePoints.map(moveOn).filter((n): n is number => n !== undefined))].sort((a, b) => a - b)
  const segments: number[][] = []
  {
    let current: number[] = []
    let next = 0
    for (const l of read) {
      if (next < moves.length && l.number >= moves[next]) {
        if (current.length) segments.push(current)
        current = []
        while (next < moves.length && l.number >= moves[next]) next++
      }
      current.push(l.number)
    }
    if (current.length) segments.push(current)
  }
  const sides: Side[] = sidePoints.map((ps) => {
    const xs = ps.map((p) => p.x).filter((v): v is number => v !== undefined)
    return {
      lines: ps.map((p) => p.line.number),
      bodyHeight: median(ps.map((p) => p.h)),
      groundY: median(ps.map((p) => p.g)),
      ...(xs.length === ps.length ? { x: median(xs) } : {}),
    }
  })

  // Start against end, on the largest group with one side and one footing.
  const segmentOf = new Map(segments.flatMap((s, i) => s.map((n) => [n, i] as const)))
  const sideOf = new Map(sides.flatMap((s, i) => s.lines.map((n) => [n, i] as const)))
  const groups = new Map<string, ServeLine[]>()
  for (const l of read) {
    const key = `${sideOf.get(l.number) ?? 0}:${segmentOf.get(l.number) ?? 0}`
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []
  const drifts: Drift[] = []
  let driftOver = 0
  if (largest.length >= 2 * MIN_EACH_END) {
    const end = Math.max(MIN_EACH_END, Math.floor(largest.length / 3))
    const early = largest.slice(0, end)
    const late = largest.slice(-end)
    driftOver = largest.length
    for (const id of ids) {
      const noise = CARD_NOISE_SD[id]
      if (!noise) continue
      const a = early.map((l) => confident(l, id)).filter((v): v is number => v !== undefined)
      const b = late.map((l) => confident(l, id)).filter((v): v is number => v !== undefined)
      if (a.length < MIN_EACH_END || b.length < MIN_EACH_END) continue
      const gap = mean(b) - mean(a)
      const error = Math.sqrt(variance(a) / a.length + variance(b) / b.length)
      const strength = Math.abs(gap) / Math.max(error, 1e-9)
      if (Math.abs(gap) < DRIFT_NOISE * noise || strength < DRIFT_STRENGTH) continue
      drifts.push({
        id,
        early: mean(a),
        late: mean(b),
        gap,
        strength: Math.round(strength * 10) / 10,
        earlyServes: a.length,
        lateServes: b.length,
      })
    }
    drifts.sort((x, y) => y.strength - x.strength)
  }

  // Faults: how often, against the serves each could be judged on.
  const order = new Map(HIERARCHY.flatMap((g, i) => g.flaws.map((f) => [f, { i, group: g.group }] as const)))
  const flaws = [...new Set(read.flatMap((l) => l.judged ?? []))]
  const faults: FaultCount[] = flaws.map((flaw) => {
    const judged = read.filter((l) => l.judged?.includes(flaw))
    const named = judged.filter((l) => l.named?.includes(flaw))
    const pasts = named.map((l) => l.past?.[flaw]).filter((v): v is number => v !== undefined)
    const rate = judged.length ? named.length / judged.length : 0
    const past = pasts.length ? median(pasts) : undefined
    const verdict =
      judged.length >= MIN_JUDGED && (rate >= MAJORITY || (rate >= FAR_SHARE && past !== undefined && past >= FAR_PAST))
    return {
      flaw,
      ...(order.has(flaw) ? { group: order.get(flaw)!.group } : {}),
      judged: judged.length,
      named: named.length,
      rate,
      ...(past !== undefined ? { past } : {}),
      verdict,
    }
  })
  faults.sort(
    (a, b) =>
      (order.get(a.flaw)?.i ?? HIERARCHY.length) - (order.get(b.flaw)?.i ?? HIERARCHY.length) || b.rate - a.rate,
  )

  // The serves that stand for the session: evenly spaced through the scores.
  const scored = read.filter((l) => l.overall !== undefined).sort((a, b) => a.overall! - b.overall!)
  const picks = new Set<number>()
  if (scored.length <= REPRESENTATIVE) scored.forEach((l) => picks.add(l.number))
  else
    for (let k = 0; k < REPRESENTATIVE; k++) {
      picks.add(scored[Math.round((k * (scored.length - 1)) / (REPRESENTATIVE - 1))].number)
    }

  return {
    read: read.length,
    unclear,
    ...(scored.length
      ? {
          overall: {
            median: Math.round(median(scored.map((l) => l.overall!))),
            best: scored[scored.length - 1].number,
            worst: scored[0].number,
          },
        }
      : {}),
    readings,
    sides,
    segments,
    driftOver,
    drifts,
    faults,
    verdict: faults.filter((f) => f.verdict).map((f) => f.flaw),
    representative: [...picks].sort((a, b) => a - b),
  }
}

/** How many of the best and of the worst serves a session pictures (L2.8). */
export const PICTURED = 3

/**
 * The best and worst serves read, by line number: the ones a session keeps a
 * still of and the dashboard shows. Best first, then worst first; a serve is in
 * only one list, so a short session pictures each serve once.
 */
export function extremes(lines: readonly ServeLine[], k = PICTURED): { best: number[]; worst: number[] } {
  const scored = lines
    .filter((l) => l.status === 'read' && l.overall !== undefined)
    .sort((a, b) => b.overall! - a.overall! || a.number - b.number)
  const best = scored.slice(0, k).map((l) => l.number)
  const worst = scored
    .slice(k)
    .reverse()
    .slice(0, k)
    .map((l) => l.number)
  return { best, worst }
}
