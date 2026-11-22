/**
 * A serve read against the player's own usual and their own best (lift item 8).
 *
 * There is no calibration data from real players, so a band can say where a
 * reading sits against published serves and nothing about whether it is normal
 * for this person. The most honest deep reading left is to compare a player with
 * themselves: same body, same racket, same habits with the phone. The question
 * is no longer "is this good?" but "is this different from what you usually do,
 * by more than your own serve and the camera move on their own?"
 *
 * So each row gets a usual (the median), the player's own spread (the median
 * absolute deviation scaled to a standard deviation, so one wild take cannot
 * widen it) and an effective noise, the larger of that spread and the camera's
 * noise on the row (`CARD_NOISE_SD`). A player steadier than the camera can
 * measure is not held to a line the camera cannot see.
 *
 * WHAT THE FIGURES HERE ARE. Every multiple and floor below is a property of the
 * statistic, re-measured by `baseline.test.ts` on synthetic histories, which
 * fails if a false reading becomes commoner than `FALSE_READINGS_PER_SERVE`.
 * That proves the sums are consistent with their stated rate on the noise they
 * were given. It does not prove a reading is accurate on a real clip: a tracking
 * glitch that clears the confidence gate reads as a real difference, and no real
 * player's serve-to-serve spread or day-to-day shift has been measured.
 *
 * Nothing here reads a clip, so it stays out of the engine's import graph, and
 * nothing here leaves the device.
 */
import { readoutOf } from './analysis/anatomy'
import { CARD_NOISE_SD } from './analysis/cardNoise'
import { isMeasured } from './analysis/coaching'
import { median } from './analysis/geometry'
import { REAL_CHANGE } from './analysis/realChange'
import { SOFT_MEASUREMENT } from './analysis/softness'
import type { Metric, Quality } from './analysis/types'
import { cue } from './analysis/voice'
import { bestPriorTo } from './bestServe'
import { offBand } from './bests'
import { currentRubricEra, dominantType, scoringVersionOf, tripsOf, typeOf } from './progress'
import type { ServeTag, Session } from './storage/db'
import type { ServeType } from './storage/prefs'

/**
 * The fewest serves a row can count (`SERVES_A_TRIP_COUNTS_FOR`) and have a usual.
 *
 * Twelve, from two sums that land in the same place. The scaled MAD keeps 37%
 * of a standard deviation's efficiency at the normal, so its standard error is
 * 1.17 σ/√n, and twelve serves know a spread to about a third of itself. And
 * twelve is the first size at which `spreadMultiple` falls under twice what a
 * spread known exactly would need (5.65 against 5.8): below it, the only serves
 * a baseline could speak about are ones so far out that it would never speak.
 * Absent, then, and not guessed.
 */
export const MIN_BASELINE_SERVES = 12

/**
 * How many serves one trip can count for.
 *
 * Serves on one trip are not independent. They share the phone's placement, the
 * light and the warm-up, so a usual built from one afternoon knows that
 * afternoon. A day's shift half the size of a player's serve-to-serve spread
 * means the serves of a trip correlate at ρ = 0.2, and however many are filmed
 * they never add up to more than 1/ρ independent serves. Four sits just under
 * that. It also means `MIN_BASELINE_SERVES` cannot be met on fewer than three
 * trips, which is the point: twelve serves off one day read the next day's
 * falsely about twice as often as the rate says on that shift, and six times on
 * a shift as big as the spread (`baseline.test.ts`).
 */
export const SERVES_A_TRIP_COUNTS_FOR = 4

/**
 * The gap that starts a new trip in these sums: twelve hours, not `tripsOf`'s day.
 *
 * What a trip stands for here is the phone being picked up and put down again.
 * `tripsOf` chains anything under a day, so a player filming every evening would
 * be on one long trip for as long as the streak ran, and never have a usual.
 */
export const SITTING_GAP_MS = 12 * 60 * 60 * 1000

/**
 * About this many serves make the usual, the newest whole trips that reach it.
 *
 * A usual is what somebody does now, and a player who has changed their toss
 * should not be told for two months that it differs from what they used to do.
 * Past thirty the multiple has done most of its falling (3.75, and only 3.29 at
 * sixty, the most a history holds), so older serves buy little and cost the
 * answer its freshness.
 */
export const MAX_BASELINE_SERVES = 30

/** Readings one serve can carry. More than this is a list, not a coach. */
export const MAX_READINGS = 3

/** A normal distribution's standard deviation, as a multiple of its MAD. */
export const MAD_TO_SD = 1.4826

/**
 * How often a serve may carry a reading that is only noise: one in twenty.
 *
 * Per serve and not per row, and that is the whole of the arithmetic. Fourteen
 * rows have a measured camera noise. Holding each to the usual 1.96 noises lets
 * each be wrong one time in twenty, which is seven false readings in every ten
 * serves. Spent across the fourteen, five per cent leaves 0.37% a row: 2.9
 * noises on a spread known exactly.
 */
export const FALSE_READINGS_PER_SERVE = 0.05

/** Two-sided normal point for `FALSE_READINGS_PER_SERVE` shared over fourteen rows. */
const ROW_Z = 2.9

/**
 * How many of a player's own spreads a serve must clear, with `counted` serves
 * behind that spread.
 *
 * 2.9 is for a spread known exactly, and a scaled MAD off twelve serves is not:
 * it is often well under the truth, and it is the denominator. The tail that
 * leaves is much heavier than a normal's, so the multiple is measured rather
 * than derived. This is the row-level point of |serve − median| / (1.4826 MAD)
 * on normal draws, within 3% of it at every size from 10 to 60 (measured 5.57
 * at 12, 4.28 at 20, 3.74 at 30).
 */
export const spreadMultiple = (counted: number): number => ROW_Z + 22 / (counted - 4)

/**
 * How many camera noises a serve must clear.
 *
 * The camera's noise is a figure measured elsewhere and not estimated from
 * these serves, so it takes no small-sample tail, only the error of the median
 * it is measured from: √(1 + π/2n), since a median has π/2 of a mean's variance.
 */
export const cameraMultiple = (counted: number): number => ROW_Z * Math.sqrt(1 + Math.PI / (2 * counted))

/** A serve's position in the player's serving: a tagged second, or everything else. */
export type ServeNumber = 1 | 2

export interface BaselineOptions {
  /** Which serve. By default whichever `dominantType` picks. */
  serveType?: ServeType
  /** Which rubric. By default the newest era's, and refused if the era is another. */
  scoringVersion?: number
  /**
   * Second serves are a different serve, kept apart once tagged. 1 is every serve
   * not tagged second: most players never tag, a second is the one worth a tap,
   * and `speedByTrip` reads an untagged serve the same way.
   */
  serveNumber?: ServeNumber
  tags?: readonly ServeTag[]
  /**
   * Which camera angle. By default the one most of these serves came from. A
   * reading is not the same number from another angle (the toss hand's drift is
   * read along a different body axis, `anatomy.ts`), and the difference would
   * read as a change in the player.
   */
  view?: Quality['view']
  /** Only serves filed before this moment. */
  before?: number
}

export interface BaselineRow {
  metricId: string
  /** The row as the card names it. */
  label: string
  unit: string
  decimals: number
  /** Trusted readings behind the row. */
  serves: number
  /** What they count for, with no trip worth more than `SERVES_A_TRIP_COUNTS_FOR`. */
  counted: number
  /** The median reading: this player's usual. */
  typical: number
  /** Their own spread: MAD scaled to a standard deviation. */
  spread: number
  /** The camera's noise on this row. */
  camera: number
  /** The larger of the two: never tighter than the camera. */
  noise: number
  /** The furthest either way these serves have read. */
  low: number
  high: number
  /** The row's target band. */
  ideal: [number, number]
  /** The usual, in body language. */
  readout: string
}

export interface PlayerBaseline {
  serveType: ServeType
  scoringVersion: number
  serveNumber: ServeNumber
  view: Quality['view']
  /** Reports behind it. A serve in this list cannot be read against it. */
  ids: string[]
  serves: number
  trips: number
  /** The overall score's own usual, to tell a best from the luckiest serve. */
  overall: { typical: number; spread: number }
  /** Card order. Only rows with a measured camera noise and enough serves. */
  rows: BaselineRow[]
}

/** The parts of a report a reading needs, so a live analysis can be read as well. */
export type ReadableServe = Pick<
  Session,
  'id' | 'createdAt' | 'fundamentals' | 'serveType' | 'scoringVersion' | 'quality' | 'triage'
>

const viewOf = (s: Pick<Session, 'quality'>): Quality['view'] => s.quality?.view

const byTime = (a: Session, b: Session) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)

/**
 * One player's comparable serves, oldest first: one type, one rubric era, and
 * firsts or seconds. `serveLinks` starts from the same place.
 *
 * Sorted before `currentRubricEra`, which scans from the newest backwards, and
 * cut to firsts or seconds after it, so that taking serves away cannot join two
 * runs of one rubric around a third.
 */
export function servesLike(
  history: readonly Session[],
  opts: BaselineOptions = {},
): { serveType: ServeType; scoringVersion: number; serveNumber: ServeNumber; serves: Session[] } | undefined {
  const serveType = opts.serveType ?? dominantType([...history])
  const era = currentRubricEra(
    history
      .filter(
        (s) =>
          typeOf(s) === serveType &&
          s.triage?.status !== 'rejected' &&
          (opts.before === undefined || s.createdAt < opts.before),
      )
      .sort(byTime),
  )
  if (!era.length) return undefined
  const scoringVersion = scoringVersionOf(era[0])
  if (opts.scoringVersion !== undefined && opts.scoringVersion !== scoringVersion) return undefined
  const serveNumber = opts.serveNumber ?? 1
  const second = new Set((opts.tags ?? []).filter((t) => t.serveNumber === 2).map((t) => t.id))
  return {
    serveType,
    scoringVersion,
    serveNumber,
    serves: era.filter((s) => second.has(s.id) === (serveNumber === 2)),
  }
}

/**
 * The rows a report stands behind, by id: graded, finite, and not soft.
 * `SOFT_MEASUREMENT` is the line under which the card hedges a reading itself.
 */
export function trustedRows(s: Pick<Session, 'fundamentals'>): Map<string, Metric> {
  const rows = new Map<string, Metric>()
  for (const f of s.fundamentals.filter(isMeasured)) {
    for (const m of f.metrics) {
      if (Number.isFinite(m.value) && (m.confidence ?? 1) >= SOFT_MEASUREMENT) rows.set(m.id, m)
    }
  }
  return rows
}

/** The commonest of some values, the newest winning a tie. */
function commonest<T>(xs: readonly T[]): T {
  const counts = new Map<T, number>()
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1)
  let best = xs[xs.length - 1]
  for (const [x, n] of counts) if (n > (counts.get(best) ?? 0)) best = x
  return best
}

/**
 * The newest whole trips that hold `MAX_BASELINE_SERVES` and count for
 * `MIN_BASELINE_SERVES`.
 *
 * Whole trips, since half of a day is not a smaller day. And both figures,
 * because the newest thirty serves of a player who films twenty a trip are two
 * trips, which could never make a usual however much they filmed.
 */
function newestTrips(serves: Session[]): Session[][] {
  const trips = tripsOf(serves, SITTING_GAP_MS)
  let from = trips.length
  let held = 0
  let counted = 0
  while (from > 0 && (held < MAX_BASELINE_SERVES || counted < MIN_BASELINE_SERVES)) {
    from--
    held += trips[from].length
    counted += Math.min(trips[from].length, SERVES_A_TRIP_COUNTS_FOR)
  }
  return trips.slice(from)
}

/** A median and a MAD scaled to a standard deviation. */
function usualOf(values: number[]): { typical: number; spread: number } {
  const typical = median(values)
  return { typical, spread: MAD_TO_SD * median(values.map((v) => Math.abs(v - typical))) }
}

/**
 * What this player usually does on one serve, or nothing when too little has
 * been seen to say.
 *
 * A row with no measured camera noise (the ball rows, which the mocap bench has
 * no ball for) has no floor, so its spread could be tighter than the camera and
 * nobody would know. It is left out, the rule `bests.ts` keeps.
 *
 * `history` must be one player's, which `forProfile` sees to at the source.
 */
export function playerBaseline(history: readonly Session[], opts: BaselineOptions = {}): PlayerBaseline | undefined {
  const like = servesLike(history, opts)
  if (!like?.serves.length) return undefined
  const view = opts.view ?? commonest(like.serves.map(viewOf))
  const kept = newestTrips(like.serves.filter((s) => viewOf(s) === view))
  const serves = kept.flat()
  const trips = kept.map((trip) => trip.map(trustedRows))

  const rows: BaselineRow[] = []
  for (const [metricId, camera] of Object.entries(CARD_NOISE_SD)) {
    const byTrip = trips.map((trip) => trip.flatMap((row) => row.get(metricId) ?? []))
    const counted = byTrip.reduce((sum, trip) => sum + Math.min(trip.length, SERVES_A_TRIP_COUNTS_FOR), 0)
    if (counted < MIN_BASELINE_SERVES) continue
    const read = byTrip.flat()
    const values = read.map((m) => m.value)
    const { typical, spread } = usualOf(values)
    const newest = read[read.length - 1]
    rows.push({
      metricId,
      label: newest.label,
      unit: newest.unit,
      decimals: newest.decimals,
      serves: values.length,
      counted,
      typical,
      spread,
      camera,
      noise: Math.max(spread, camera),
      low: Math.min(...values),
      high: Math.max(...values),
      ideal: newest.ideal,
      readout: readoutOf(metricId, typical),
    })
  }
  if (!rows.length) return undefined
  return {
    serveType: like.serveType,
    scoringVersion: like.scoringVersion,
    serveNumber: like.serveNumber,
    view,
    ids: serves.map((s) => s.id),
    serves: serves.length,
    trips: trips.length,
    overall: usualOf(serves.map((s) => s.overall)),
    rows,
  }
}

/**
 * The baseline a serve should be read against: same type, same rubric, same
 * number, same camera angle, and only what came before it. A serve can then
 * neither help set its own usual nor be measured against a future it had not
 * reached, and an old report reads as it would have on the day.
 */
export function baselineFor(
  serve: ReadableServe,
  history: readonly Session[],
  tags: readonly ServeTag[] = [],
): PlayerBaseline | undefined {
  return playerBaseline(history, {
    serveType: typeOf(serve),
    scoringVersion: scoringVersionOf(serve),
    serveNumber: tags.find((t) => t.id === serve.id)?.serveNumber,
    view: viewOf(serve),
    before: serve.createdAt,
    tags,
  })
}

/**
 * How far a serve must sit from the usual on this row before noise cannot
 * explain it, in the row's own unit.
 *
 * Each noise with its own multiple, and the wider of the two wins. The spread's
 * multiple alone holds `FALSE_READINGS_PER_SERVE` whatever the camera does, since
 * a wider line can only lie less often. The camera's stops a player steadier than
 * the camera being held to a line under it.
 */
export function reachOf(row: BaselineRow): number {
  return Math.max(spreadMultiple(row.counted) * row.spread, cameraMultiple(row.counted) * row.camera)
}

/** Which way a serve sits from what it was set against, on the row's own axis. */
export type Direction = 'higher' | 'lower'

/**
 * What the move did against the target band. `level` is neither nearer nor
 * further: both inside the band, which is most often how it happens.
 */
export type BandMove = 'towards' | 'away' | 'level'

export type SelfReference = 'usual' | 'best'

export interface SelfFinding {
  metricId: string
  label: string
  direction: Direction
  band: BandMove
  /** How far apart, in the row's unit and to its decimals. Never negative. */
  size: number
  unit: string
  decimals: number
  /** This serve's reading, and the one it was set against. */
  value: number
  reference: number
  /** Those two in body language (`readoutOf`). */
  readout: string
  referenceReadout: string
  /** The gap in effective noises: how far past the player's own wobble it sits. */
  strength: number
  /** One sentence, in the copy rules' voice. */
  line: string
}

/**
 * What a serve did on each row, in words that take either "than usual" or
 * "than on your earlier best", and that follow "Your fastest serves" as well.
 * A figure never goes in: the copy rules keep raw measurements off the screen,
 * and `size` and `unit` are on the finding for anything that wants to draw one.
 *
 * `more` is further up the row's own axis, which is not always better.
 */
export const ROW_WORDS: Record<string, { more: string; less: string }> = {
  releaseHeight: { more: 'let the ball go higher', less: 'let the ball go lower' },
  tossArmHold: { more: 'hold the tossing arm up longer', less: 'bring the tossing arm down sooner' },
  tossPathWobble: { more: 'lift the toss further off line', less: 'lift the toss straighter' },
  kneeBend: { more: 'bend the knees further', less: 'bend the knees less' },
  shoulderTilt: { more: 'sink the hitting shoulder lower', less: 'keep the hitting shoulder higher' },
  legDrive: { more: 'drive up further off the legs', less: 'push up less off the legs' },
  dropDepth: { more: 'take the racket hand lower behind you', less: 'keep the racket hand higher behind you' },
  elbowAtDrop: {
    more: 'open the hitting elbow wider at the racket drop',
    less: 'fold the hitting elbow tighter at the racket drop',
  },
  handUnderElbow: { more: 'hang the hand under the elbow longer', less: 'hang the hand under the elbow for less time' },
  dropToContact: {
    more: 'take longer from the racket drop to the ball',
    less: 'take less time from the racket drop to the ball',
  },
  contactHeight: { more: 'meet the ball higher', less: 'meet the ball lower' },
  // A label that is a question reads badly inside a sentence (W6.4).
  contactBelowPeak: { more: 'let the ball fall further before you hit it', less: 'hit the ball nearer the top of the toss' },
  tossPeakHeight: { more: 'toss higher', less: 'toss lower' },
  ballContactHeight: { more: 'meet the ball higher', less: 'meet the ball lower' },
  armExtension: { more: 'meet the ball with a straighter arm', less: 'meet the ball with a more bent arm' },
  contactAhead: { more: 'meet the ball further in front', less: 'meet the ball further back' },
  loadRatio: {
    more: 'spend longer from the trophy to the ball',
    less: 'spend less time from the trophy to the ball',
  },
}

const THAN: Record<SelfReference, string> = {
  usual: 'than usual',
  // "Earlier" because the best is `bestPriorTo`'s, and this serve may have beaten it.
  best: 'than on your earlier best',
}

/** The sentence for one finding. `onTarget` is whether this serve sits inside the band. */
export function selfLine(
  metricId: string,
  direction: Direction,
  band: BandMove,
  onTarget: boolean,
  against: SelfReference,
): string {
  const words = ROW_WORDS[metricId][direction === 'higher' ? 'more' : 'less']
  const clause =
    band === 'towards'
      ? ', closer to the target'
      : band === 'away'
        ? ', further from the target'
        : onTarget
          ? ', still on target'
          : ''
  return cue(`I saw you **${words}** ${THAN[against]}${clause}.`)
}

function finding(m: Metric, reference: number, noise: number, against: SelfReference): SelfFinding {
  const direction: Direction = m.value > reference ? 'higher' : 'lower'
  const off = offBand(m.value, m.ideal)
  const before = offBand(reference, m.ideal)
  const band: BandMove = off < before ? 'towards' : off > before ? 'away' : 'level'
  const size = Math.abs(m.value - reference)
  return {
    metricId: m.id,
    label: m.label,
    direction,
    band,
    size: Number(size.toFixed(m.decimals)),
    unit: m.unit,
    decimals: m.decimals,
    value: m.value,
    reference,
    readout: readoutOf(m.id, m.value),
    referenceReadout: readoutOf(m.id, reference),
    strength: Math.round((size / noise) * 10) / 10,
    line: selfLine(m.id, direction, band, off === 0, against),
  }
}

const strongest = (found: SelfFinding[]) => found.sort((a, b) => b.strength - a.strength).slice(0, MAX_READINGS)

/** Whether a serve may be read against a baseline at all. */
export const readable = (s: ReadableServe, b: PlayerBaseline) =>
  s.triage?.status !== 'rejected' &&
  typeOf(s) === b.serveType &&
  scoringVersionOf(s) === b.scoringVersion &&
  viewOf(s) === b.view &&
  !b.ids.includes(s.id)

/**
 * Where this serve differs from the player's usual by more than the noise
 * allows: at most `MAX_READINGS`, strongest first, and nothing at all on the
 * ordinary serve, which is most of them.
 *
 * A reading must clear the row's reach and also fall outside everything the
 * baseline has already held. Frame-counted rows pile up on a few values, so a
 * MAD can read zero over a tail it never sees, and a serve the player has already
 * hit several of is not a departure from their usual however narrow the MAD.
 *
 * A serve from another type, rubric or camera angle has nothing to say here,
 * and nor does a serve inside the baseline: use `baselineFor`.
 */
export function againstUsual(serve: ReadableServe, baseline: PlayerBaseline): SelfFinding[] {
  if (!readable(serve, baseline)) return []
  const here = trustedRows(serve)
  const found: SelfFinding[] = []
  for (const row of baseline.rows) {
    const m = here.get(row.metricId)
    if (!m || Math.abs(m.value - row.typical) <= reachOf(row)) continue
    if (m.value >= row.low && m.value <= row.high) continue
    found.push(finding(m, row.typical, row.noise, 'usual'))
  }
  return strongest(found)
}

/**
 * The player's best serve before this one, when it deserves the name.
 *
 * `bestPriorTo`'s rules, on serves that also share this serve's number and
 * camera angle, and then one of its own. Picking the top of a list picks luck
 * along with the serve: the best of n identical serves sits about √(2 ln n)
 * spreads above their middle for no reason at all. Setting a player against that
 * serve would hold them to a day the camera liked. So a best has to stand clear
 * of the usual by more than that, and by more than one serve's overall can move
 * on the camera alone (`REAL_CHANGE`).
 */
export function earlierBest(
  serve: ReadableServe,
  history: readonly Session[],
  baseline: PlayerBaseline,
  tags: readonly ServeTag[] = [],
): Session | undefined {
  const { serveType, scoringVersion, serveNumber, view } = baseline
  const like = servesLike(history, { serveType, scoringVersion, serveNumber, tags, before: serve.createdAt })
  const pool = like?.serves.filter((s) => viewOf(s) === view) ?? []
  const best = bestPriorTo(pool, serve.createdAt, serveType, scoringVersion)
  if (!best || best.id === serve.id) return undefined
  const chance = Math.sqrt(2 * Math.log(pool.length)) * baseline.overall.spread
  return best.overall - baseline.overall.typical > Math.max(chance, REAL_CHANGE.overall) ? best : undefined
}

/** Whether `best` is a serve this one can be set against: earlier, and on the same footing. */
const comparableBest = (serve: ReadableServe, best: Session, b: PlayerBaseline) =>
  readable(serve, b) &&
  best.id !== serve.id &&
  best.createdAt < serve.createdAt &&
  typeOf(best) === b.serveType &&
  scoringVersionOf(best) === b.scoringVersion &&
  viewOf(best) === b.view

/**
 * Where this serve differs from the player's best, by more than the noise of
 * two single serves allows: at most `MAX_READINGS`, strongest first.
 *
 * The usual is a median and the best is one take, so a gap between two serves
 * carries the noise twice, √2 of it. `best` should come from `earlierBest`.
 */
export function againstBest(serve: ReadableServe, best: Session, baseline: PlayerBaseline): SelfFinding[] {
  if (!comparableBest(serve, best, baseline)) return []
  const here = trustedRows(serve)
  const there = trustedRows(best)
  const found: SelfFinding[] = []
  for (const row of baseline.rows) {
    const m = here.get(row.metricId)
    const b = there.get(row.metricId)
    if (!m || !b || Math.abs(m.value - b.value) <= Math.SQRT2 * reachOf(row)) continue
    found.push(finding(m, b.value, Math.SQRT2 * row.noise, 'best'))
  }
  return strongest(found)
}

export interface BestReached {
  metricId: string
  label: string
  /** One sentence, in the copy rules' voice. */
  line: string
}

/**
 * The row where this serve reached what made the player's best their best: a
 * one-line reward, and rare, because it is only said when it is true.
 *
 * The best serve must stand clear of the usual on the row, past its reach and
 * nearer the target, so it is a row the best really has. This serve must then
 * sit on the same side, within one noise of that reading or past it.
 */
export function closestToBest(serve: ReadableServe, best: Session, baseline: PlayerBaseline): BestReached | undefined {
  if (!comparableBest(serve, best, baseline)) return undefined
  const here = trustedRows(serve)
  const there = trustedRows(best)
  let reached: (BestReached & { margin: number }) | undefined
  for (const row of baseline.rows) {
    const m = here.get(row.metricId)
    const b = there.get(row.metricId)
    if (!m || !b) continue
    const bestGap = b.value - row.typical
    const nowGap = m.value - row.typical
    if (Math.abs(bestGap) <= reachOf(row) || offBand(b.value, row.ideal) >= offBand(row.typical, row.ideal)) continue
    if (Math.sign(nowGap) !== Math.sign(bestGap) || Math.abs(nowGap) < Math.abs(bestGap) - row.noise) continue
    const margin = Math.abs(nowGap) / row.noise
    if (reached && margin <= reached.margin) continue
    const label = `${m.label.charAt(0).toLowerCase()}${m.label.slice(1)}`
    reached = { metricId: m.id, label: m.label, line: cue(`I saw you match your earlier best on **${label}**.`), margin }
  }
  if (!reached) return undefined
  const { margin: _margin, ...said } = reached
  return said
}
