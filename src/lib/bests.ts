/**
 * Personal bests as body positions (L3.8).
 *
 * A best score is a number the camera moves on its own. A best body position is
 * one a player can picture: the first trip their racket hand reached far down
 * their back, the first trip their legs drove up. So a best fires on a card
 * row's readout ladder (`anatomy.ts`), not on its score: when a trip's median
 * reading lands on a rung no earlier trip reached, closer to the target than
 * any trip before it, by more than the camera moves that reading on its own.
 *
 * Trips, not serves, for the reason the headline is a trip (L3.2): one serve
 * can land on any rung by chance. Only readings the card stood behind count
 * (`SOFT_MEASUREMENT`), and only rows whose noise has been measured
 * (`CARD_NOISE_SD`) — a best on a reading of unknown noise would be a guess.
 */
import { rungsOf } from './analysis/anatomy'
import { CARD_NOISE_SD } from './analysis/cardNoise'
import { SOFT_MEASUREMENT } from './analysis/softness'
import { MIN_TRIP_SERVES, currentRubricEra, dominantType, tripRuns, typeOf } from './progress'
import type { Session } from './storage/db'
import type { ServeType } from './storage/prefs'

/** Deviations of camera noise a best must clear: the engine's own rule for a floor. */
const BEST_MARGIN = 1.5

export interface BodyBest {
  metricId: string
  /** The row as the card names it. */
  label: string
  /** The rung reached, in body language. */
  tag: string
  /** When the trip that reached it began. */
  at: number
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** How far a value sits from a band: 0 inside it. */
export const offBand = (v: number, [lo, hi]: [number, number]) => (v < lo ? lo - v : v > hi ? v - hi : 0)

/** The rung a value falls on, by index. */
const rungIndex = (id: string, v: number) => {
  const rungs = rungsOf(id)
  const i = rungs.findIndex((r) => v < r.under)
  return i < 0 ? rungs.length - 1 : i
}

/**
 * The bests the newest trip set, one per row, in card order. Empty on a first
 * trip — nothing to be a best against — and on any trip that set none.
 */
export function bodyBests(sessions: readonly Session[], serveType?: ServeType): BodyBest[] {
  const type = serveType ?? dominantType([...sessions])
  const era = currentRubricEra(
    sessions.filter((s) => typeOf(s) === type && s.triage?.status !== 'rejected').sort((a, b) => a.createdAt - b.createdAt),
  )
  const trips = tripRuns(era)
  if (trips.length < 2) return []
  const latest = trips[trips.length - 1]
  const earlier = trips.slice(0, -1)

  const rows = new Map<string, { label: string; ideal: [number, number] }>()
  for (const s of latest) {
    for (const m of s.fundamentals.flatMap((f) => f.metrics)) {
      if (!rows.has(m.id) && rungsOf(m.id).length && CARD_NOISE_SD[m.id] !== undefined) {
        rows.set(m.id, { label: m.label, ideal: m.ideal })
      }
    }
  }

  /** A trip's median reading of one row, when enough of its serves were stood behind. */
  const medianOf = (trip: Session[], id: string): number | undefined => {
    const values = trip
      .flatMap((s) => s.fundamentals.flatMap((f) => f.metrics))
      .filter((m) => m.id === id && (m.confidence ?? 1) >= SOFT_MEASUREMENT && Number.isFinite(m.value))
      .map((m) => m.value)
    return values.length >= MIN_TRIP_SERVES ? median(values) : undefined
  }

  const out: BodyBest[] = []
  for (const [id, { label, ideal }] of rows) {
    const now = medianOf(latest, id)
    if (now === undefined) continue
    const before = earlier.map((t) => medianOf(t, id)).filter((v): v is number => v !== undefined)
    if (!before.length) continue
    // A rung no earlier trip reached…
    const rung = rungIndex(id, now)
    if (before.some((v) => rungIndex(id, v) === rung)) continue
    // …and closer to the band than every trip before, past the camera's own
    // wobble — which is also what makes it a step towards the target and not
    // away from it. A band can span two rungs, so the band decides, not a rung.
    const best = Math.min(...before.map((v) => offBand(v, ideal)))
    if (!(best - offBand(now, ideal) > BEST_MARGIN * CARD_NOISE_SD[id])) continue
    out.push({ metricId: id, label, tag: rungsOf(id)[rung].tag, at: latest[0].createdAt })
  }
  return out
}

/** A best in words. */
export const bodyBestLine = (b: BodyBest): string => `${b.label}: first trip at "${b.tag}".`
