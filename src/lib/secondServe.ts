/**
 * A second serve that goes in (N4.3): the share of a trip's second serves the
 * player tagged as in, and whether a later trip's share is clearly higher.
 *
 * The first goal in the app read off what happened to the ball. Nothing here
 * sees the court: every count is the player's own tap after the serve
 * (`ServeTag`), and only serves tagged both "second serve" and with where they
 * landed are counted. A serve tagged second with no outcome says nothing.
 *
 * "Clearly higher" is a one-sided two-proportion test at 95%, continuity
 * corrected for the small counts a trip gives, with at least
 * `MIN_TAGGED` second serves on each trip, so one lucky basket of six never reads
 * as a fixed second serve. A UTR 3 who goes from 6 in 10 to 8 in 10 has not
 * shown anything yet; from 9 in 20 to 17 in 20 has.
 */
import { tripsOf } from './progress'
import type { ServeTag, Session } from './storage/db'

/** Second serves tagged in, out of those tagged with where they landed, on one trip. */
export interface InRate {
  inn: number
  of: number
  /** The trip's first serve, for ordering and for picking the trip a goal starts from. */
  at: number
}

/** The fewest tagged second serves a trip needs before its share means anything. */
export const MIN_TAGGED = 8

/** One-sided 95%. */
const Z_95 = 1.645

/** Each trip's second serves, in or out, oldest first. Trips with fewer than `MIN_TAGGED` are left out. */
export function secondInByTrip(sessions: Session[], tags: readonly ServeTag[]): InRate[] {
  const byId = new Map(tags.map((t) => [t.id, t]))
  const out: InRate[] = []
  for (const trip of tripsOf(sessions)) {
    const told = trip.map((s) => byId.get(s.id)).filter((t): t is ServeTag => !!t && t.serveNumber === 2 && t.outcome !== undefined)
    if (told.length < MIN_TAGGED) continue
    out.push({
      inn: told.filter((t) => t.outcome === 'in').length,
      of: told.length,
      at: Math.min(...trip.map((s) => s.createdAt)),
    })
  }
  return out
}

/** Whether `now` lands in clearly more often than `then`. */
export function clearlyMoreIn(now: InRate, then: InRate): boolean {
  if (now.of < MIN_TAGGED || then.of < MIN_TAGGED) return false
  const p1 = now.inn / now.of
  const p0 = then.inn / then.of
  if (p1 <= p0) return false
  const pooled = (now.inn + then.inn) / (now.of + then.of)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / now.of + 1 / then.of))
  if (se === 0) return false
  // With a continuity correction: on a dozen serves a side the plain test calls
  // 6.5% of unchanged pairs better; corrected it stays under 5% (the test says).
  const corrected = p1 - p0 - 0.5 * (1 / now.of + 1 / then.of)
  return corrected / se >= Z_95
}

/** "13 of 20", the way the goal says a trip's second serves. */
export const inLine = (r: InRate): string => `${r.inn} of ${r.of}`
