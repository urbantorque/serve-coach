/**
 * Serve speed over time (N2.8): the trend between trips, first serves against
 * second serves, and the fastest serve on record.
 *
 * Every reading is a range, so every comparison is between ranges, and two
 * that overlap say nothing — the same rule `secondServeSlower` keeps for a
 * swing time, with the reader's own range standing in for the camera's noise.
 * A trip's figure is its middle serve, and its range the middle of its
 * serves' ranges: held no tighter than one serve is, so a trip of lucky-steady
 * readings cannot claim a change one serve could not.
 *
 * Every serve type, unlike the scores: a speed is not judged on a type's band.
 * Second serves stay out of the trend, which compares like with like; they are
 * set against first serves on their own.
 */
import { tripsOf } from './progress'
import type { ServeTag, Session } from './storage/db'
import type { ServeSpeed } from './vision/serveSpeed'

/** Readings a trip or a side needs before it is said: one serve can be any serve. */
export const MIN_SPEED_SERVES = 2

/** The middle of some serves' readings, metres a second. */
export interface SpeedSummary {
  serves: number
  ms: number
  low: number
  high: number
  /** When the first of them was filed. */
  at: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The reading on a report, if one was taken and the report stood. */
export const readingOf = (s: Session): ServeSpeed | undefined =>
  s.triage?.status !== 'rejected' && s.speed && 'speed' in s.speed ? s.speed.speed : undefined

/** Some serves' readings as one figure and range, when there are enough of them. */
export function summarise(serves: readonly Session[]): SpeedSummary | undefined {
  const read = serves.map((s) => ({ s, r: readingOf(s) })).filter((x): x is { s: Session; r: ServeSpeed } => x.r !== undefined)
  if (read.length < MIN_SPEED_SERVES) return undefined
  return {
    serves: read.length,
    ms: median(read.map((x) => x.r.ms)),
    low: median(read.map((x) => x.r.low)),
    high: median(read.map((x) => x.r.high)),
    at: Math.min(...read.map((x) => x.s.createdAt)),
  }
}

/** Which way one range sits from another: only when they do not overlap. */
export function apart(now: Pick<SpeedSummary, 'low' | 'high'>, then: Pick<SpeedSummary, 'low' | 'high'>): 'faster' | 'slower' | undefined {
  if (now.low > then.high) return 'faster'
  if (now.high < then.low) return 'slower'
  return undefined
}

export interface SpeedTrend {
  direction: 'faster' | 'slower'
  now: SpeedSummary
  then: SpeedSummary
}

/**
 * The newest trip with readings against the one before it with readings, said
 * only when their ranges do not overlap. One trip, or two that overlap, say
 * nothing.
 */
export function speedTrend(sessions: Session[], tags: readonly ServeTag[]): SpeedTrend | undefined {
  const second = new Set(tags.filter((t) => t.serveNumber === 2).map((t) => t.id))
  const trips = tripsOf(sessions.filter((s) => !second.has(s.id)))
    .map(summarise)
    .filter((t): t is SpeedSummary => t !== undefined)
  if (trips.length < 2) return undefined
  const now = trips[trips.length - 1]
  const then = trips[trips.length - 2]
  const direction = apart(now, then)
  return direction && { direction, now, then }
}

export interface ServeNumberSpeeds {
  first: SpeedSummary
  second: SpeedSummary
  /** Set only when the two ranges do not overlap. */
  direction?: 'faster' | 'slower'
}

/** Tagged first serves against tagged second serves, when each side has enough readings. */
export function speedByServeNumber(sessions: Session[], tags: readonly ServeTag[]): ServeNumberSpeeds | undefined {
  const number = new Map(tags.map((t) => [t.id, t.serveNumber]))
  const first = summarise(sessions.filter((s) => number.get(s.id) === 1))
  const second = summarise(sessions.filter((s) => number.get(s.id) === 2))
  if (!first || !second) return undefined
  const direction = apart(second, first)
  return { first, second, ...(direction ? { direction } : {}) }
}

export interface FastestServe {
  /** The report that holds it. */
  id: string
  at: number
  ms: number
  low: number
  high: number
  /** Set by the newest report with a reading: the moment to say so. */
  isNew: boolean
}

/**
 * The fastest serve on record (N2.8), held as a range. Here rather than in
 * `bests.ts` beside the body bests, which the home screen loads up front.
 *
 * A serve takes the record only when its whole range sits above the holder's:
 * a higher best figure inside an overlapping range is not a faster serve the
 * reader can stand behind, the same rule `speedTrend` keeps between trips.
 * So the record is slow to move and never moves on noise. Refused reports
 * never hold it (`readingOf`).
 */
export function fastestServe(sessions: readonly Session[]): FastestServe | undefined {
  const read = sessions
    .map((s) => ({ s, r: readingOf(s) }))
    .filter((x): x is { s: Session; r: ServeSpeed } => x.r !== undefined)
    .sort((a, b) => a.s.createdAt - b.s.createdAt)
  if (!read.length) return undefined
  let holder = read[0]
  for (const x of read.slice(1)) if (x.r.low > holder.r.high) holder = x
  const newest = read[read.length - 1]
  return {
    id: holder.s.id,
    at: holder.s.createdAt,
    ms: holder.r.ms,
    low: holder.r.low,
    high: holder.r.high,
    // A first reading is not a record broken.
    isNew: read.length > 1 && holder === newest,
  }
}

export interface SessionSpeeds {
  /** Serves a speed was read on. */
  read: number
  /** The serve the reader is surest was fast: the highest bottom of a range. */
  fastest: { ms: number; low: number; high: number }
  /** The middle serve and the middle of the ranges, when two or more were read. */
  typical?: { ms: number; low: number; high: number }
}

/**
 * A practice session's speeds (N2.8), from the lines that carry one: the
 * fastest serve and the typical one. Nothing when no serve gave a speed.
 */
export function sessionSpeeds(lines: readonly { speed?: { ms: number; low: number; high: number } }[]): SessionSpeeds | undefined {
  const read = lines.map((l) => l.speed).filter((s): s is NonNullable<typeof s> => s !== undefined)
  if (!read.length) return undefined
  const fastest = read.reduce((a, b) => (b.low > a.low ? b : a))
  const typical =
    read.length >= MIN_SPEED_SERVES
      ? { ms: median(read.map((s) => s.ms)), low: median(read.map((s) => s.low)), high: median(read.map((s) => s.high)) }
      : undefined
  return { read: read.length, fastest, ...(typical ? { typical } : {}) }
}
