/**
 * Planning a practice session: which clips are one, which serves to read, and
 * what it will cost (L2.4).
 *
 * A basket — a couple of minutes, a handful of serves — goes through the report
 * and the comparison as it always has. A clip longer than `SESSION_SECONDS` is a
 * session: tens of serves, ball pickups and walking between them, and a cost the
 * player has to be told before they wait for it. Every second of that cost is a
 * video seek and a pose detection, about 55 ms on a desktop (README §"Locating
 * serves") and several times that on a phone, which nobody has measured — so the
 * estimate is taken on the player's own file, on their own device, before
 * anything is promised (`perSampleMs`).
 *
 * Pure: no video, no storage, no clock. The runner and the screens call it.
 */
import { SPEED_PLACEMENT } from '../placement'
import { MIN_SERVE_GAP, SCAN_FPS, planScan } from '../analysis/serves'

export { SESSION_SECONDS, isSession } from './length'

/** How many serves a sampled session reads. */
export const SESSION_SAMPLE = 12

/**
 * How a sample of the session is spread: five from the first third, two from
 * the middle, five from the last. Weighted to the ends because the question a
 * sample is best placed to answer is whether the serve changed between the start
 * of the session and the end of it, and that comparison needs serves on each
 * side — five is the fewest the misses-in-common rule (D5.2) will speak from.
 */
const THIRDS: [number, number, number] = [5, 2, 5]

/**
 * Seeks one serve's light read costs: the player crop, then 2.7 s at about 32 a
 * second. Priced on the even read, 91, because a walked file is a seek or two less.
 */
export const LIGHT_READ_SAMPLES = 91

/** Seeks a full read costs: the light read plus the ball, the racket, the refinement and the stills. */
export const FULL_READ_SAMPLES = 200

/**
 * Seeks a serve's speed adds to its light read (N2.8): the ball's pass, every
 * frame from two before the toss to two after contact at the light read's 32
 * a second, and the speed pass, every native frame of a quarter second round
 * contact. The rig's toss reaches contact in 28 seeks; a club player's
 * slower toss is priced at a second and a quarter, 45. The speed pass is
 * priced at 60 frames a second, 15; a slow-motion session costs more than this
 * says, and is the rare one.
 */
export const SPEED_READ_SAMPLES = 45 + 15

/** How many serves are read in full, for pictures: the best, the worst and the middle one. */
export const FULL_READS = 3

/** Seeks the refinement spends on each candidate: a second either side at the full rate. */
const REFINE_SAMPLES = Math.round(1.8 * SCAN_FPS)

/**
 * Serves a session of this length is planned for before the scan has counted
 * them: one every twelve seconds, which is a practice basket's pace with the
 * walking to pick balls up included. Only ever used in a sentence that says
 * "about", and replaced by the count the moment the scan has one.
 */
export const guessServes = (duration: number): number => Math.max(1, Math.round(duration / 12))


/**
 * Which of `count` located serves a sample reads, as zero-based indexes in time
 * order. Every serve when there are no more than `size`.
 *
 * Spread across each third rather than taken from the start: a sample of the
 * first twelve serves of a fifty-serve session would say nothing about the end
 * of it, which is where a tiring serve shows.
 */
export function sampleServes(count: number, size = SESSION_SAMPLE): number[] {
  const n = Math.max(0, Math.floor(count))
  if (n <= size) return Array.from({ length: n }, (_, i) => i)
  const total = THIRDS.reduce((a, b) => a + b, 0)
  const ends = Math.round((size * THIRDS[0]) / total)
  const quota = [ends, size - 2 * ends, ends]
  const out: number[] = []
  for (let part = 0; part < 3; part++) {
    // A serve is in the first third when its index is under n / 3, and so on.
    const from = Math.ceil((n * part) / 3)
    const to = Math.ceil((n * (part + 1)) / 3)
    const span = to - from
    const take = Math.min(quota[part], span)
    for (let k = 0; k < take; k++) out.push(from + Math.floor(((k + 0.5) * span) / take))
  }
  // A third shorter than its quota leaves serves unread that the sample was
  // promised; they are taken evenly from what is left.
  const picked = new Set(out)
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !picked.has(i))
  const short = size - picked.size
  for (let k = 0; k < short && rest.length; k++) {
    picked.add(rest[Math.floor(((k + 0.5) * rest.length) / short)])
  }
  return [...picked].sort((a, b) => a - b)
}

export interface SessionCost {
  /** Seeks the scan for the serves costs. */
  locate: number
  /** Seeks reading the chosen serves costs. */
  read: number
  /** Seeks the full reads for the pictures cost. */
  full: number
  /** Seeks reading each serve's speed adds (N2.8): nothing unless asked for. */
  speed: number
  /** All of it, in seconds, at the measured cost of one seek. */
  seconds: number
}

/**
 * What reading a session will cost, in seeks and in seconds.
 *
 * `serves` is the count the scan found, or `guessServes` before it has run;
 * `reading` how many of them will be read. Each read serve is a light read
 * (`LIGHT_READ_SAMPLES`), and `FULL_READS` of them are read again in full for
 * their pictures.
 */
export function sessionCost(opts: {
  duration: number
  serves: number
  reading: number
  perSampleMs: number
  /** The scan has already run, so its cost is spent. */
  located?: boolean
  /** Read each serve's speed too (N2.8). */
  withSpeed?: boolean
}): SessionCost {
  const locate = opts.located ? 0 : planScan(opts.duration).times.length + opts.serves * REFINE_SAMPLES
  const reading = Math.max(0, Math.min(opts.reading, opts.serves))
  const read = reading * LIGHT_READ_SAMPLES
  const full = Math.min(FULL_READS, reading) * FULL_READ_SAMPLES
  const speed = opts.withSpeed ? reading * SPEED_READ_SAMPLES : 0
  const seconds = ((locate + read + full + speed) * Math.max(0, opts.perSampleMs)) / 1000
  return { locate, read, full, speed, seconds }
}

/**
 * The cost of one seek on this file, from a handful of timed samples.
 *
 * The first is dropped: it pays for the decoder starting up, which every later
 * seek does not. The median of the rest, so one seek that waited on a garbage
 * collection does not set the estimate.
 */
export function perSampleMs(timings: readonly number[]): number | undefined {
  const usable = timings.slice(1).filter((t) => Number.isFinite(t) && t > 0)
  if (usable.length < 3) return undefined
  const sorted = [...usable].sort((a, b) => a - b)
  return sorted[sorted.length >> 1]
}

/** One way to read a session, priced for the plan sheet. */
export interface PlanChoice {
  mode: 'sample' | 'every'
  /** Serves it reads: a count once the scan has run, a guess before. */
  reading: number
  /** Seconds, or nothing when this file could not be timed. */
  seconds?: number
  /** Seconds with each serve's speed read too (N2.8). */
  speedSeconds?: number
}

/**
 * The ways to read a session, priced (L2.4).
 *
 * A sample of `SESSION_SAMPLE`, or every serve. When there are no more serves
 * than the sample, the two are the same reading and only "every" is offered.
 * `serves` is the scan's count when it has run (`located`), else the guess.
 */
export function planChoices(opts: {
  duration: number
  serves: number
  perSampleMs?: number
  located?: boolean
}): PlanChoice[] {
  const price = (reading: number, withSpeed = false) =>
    opts.perSampleMs === undefined
      ? undefined
      : sessionCost({ ...opts, reading, perSampleMs: opts.perSampleMs, withSpeed }).seconds
  const choice = (mode: 'sample' | 'every', reading: number): PlanChoice => ({
    mode,
    reading,
    seconds: price(reading),
    speedSeconds: price(reading, true),
  })
  const every = choice('every', opts.serves)
  if (opts.serves <= SESSION_SAMPLE) return [every]
  return [choice('sample', SESSION_SAMPLE), every]
}

/**
 * What is left of a session that was stopped, in seconds, or nothing when the
 * file could not be timed. The scan is spent once it has found the serves.
 */
export function costLeft(
  session: { duration: number; found?: number[]; chosen?: number[]; lines: { number: number }[]; withSpeed?: boolean },
  perSampleMs: number | undefined,
): number | undefined {
  if (perSampleMs === undefined) return undefined
  const done = new Set(session.lines.map((l) => l.number))
  const serves = session.found?.length ?? guessServes(session.duration)
  const left = session.chosen ? session.chosen.filter((i) => !done.has(i + 1)).length : serves
  return sessionCost({ duration: session.duration, serves, reading: left, perSampleMs, located: !!session.found, withSpeed: session.withSpeed }).seconds
}

/** Whole minutes, never 0: the figure every time on the plan is said in. */
const wholeMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60))

/** A duration in whole minutes, for a sentence: "about 7 minutes", never "about 0". */
export function minutesOf(seconds: number): string {
  const m = wholeMinutes(seconds)
  return m === 1 ? 'about a minute' : `about ${m} minutes`
}

/**
 * What reading speeds adds, said before the player chooses (N2.8): the extra
 * minutes on each way to read, and where to have stood for a speed to come
 * out at all. The extra is the gap between the two times the plan shows, as
 * rounded, so the sentence and the figures beside it always agree: priced
 * apart, "about 6 minutes" more sat beside a time going from 15 to 20.
 */
export function speedCostLine(choices: PlanChoice[]): string {
  const extra = choices
    .filter((c) => c.seconds !== undefined && c.speedSeconds !== undefined)
    .map((c) => {
      const more = wholeMinutes(c.speedSeconds!) - wholeMinutes(c.seconds!)
      const said = more < 1 ? 'under a minute' : more === 1 ? 'about a minute' : `about ${more} minutes`
      return `${said} to ${c.mode === 'sample' ? 'the sample' : 'every serve'}`
    })
  const added = extra.length ? `Speeds add ${extra.join(' and ')}.` : 'Speeds add the ball\u2019s flight to every serve read.'
  return `${added} Film from ${SPEED_PLACEMENT.distance} away for them to come out.`
}

/** Serves closer together than this in the scan are one. Re-exported for the runner's checks. */
export { MIN_SERVE_GAP }
