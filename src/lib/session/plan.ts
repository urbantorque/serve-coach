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
import { MIN_SERVE_GAP, SCAN_FPS, planScan } from '../analysis/serves'

/** Clips longer than this are read as a session rather than a basket. */
export const SESSION_SECONDS = 150

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

/** Seeks one serve's light read costs: the player crop, then 2.7 s at 32 fps. */
export const LIGHT_READ_SAMPLES = 91

/** Seeks a full read costs: the light read plus the ball, the racket, the refinement and the stills. */
export const FULL_READ_SAMPLES = 200

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

/** Whether a clip of this length is read as a session. */
export const isSession = (duration: number): boolean => Number.isFinite(duration) && duration > SESSION_SECONDS

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
}): SessionCost {
  const locate = opts.located ? 0 : planScan(opts.duration).times.length + opts.serves * REFINE_SAMPLES
  const reading = Math.max(0, Math.min(opts.reading, opts.serves))
  const read = reading * LIGHT_READ_SAMPLES
  const full = Math.min(FULL_READS, reading) * FULL_READ_SAMPLES
  const seconds = ((locate + read + full) * Math.max(0, opts.perSampleMs)) / 1000
  return { locate, read, full, seconds }
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

/** A duration in whole minutes, for a sentence: "about 7 minutes", never "about 0". */
export function minutesOf(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  return m === 1 ? 'about a minute' : `about ${m} minutes`
}

/** Serves closer together than this in the scan are one. Re-exported for the runner's checks. */
export { MIN_SERVE_GAP }
