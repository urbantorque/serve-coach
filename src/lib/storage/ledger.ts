/**
 * The season ledger (L3.3): one small row per trip to the court, kept after
 * the reports behind it are gone.
 *
 * Reports are no longer deleted by count. They lose their stills, then their
 * swing tracks, and are deleted only when the device runs out of room — and
 * when that happens the oldest go first, which used to take the start of the
 * season with them: "your first trip", the best, the six-week line and the
 * streaks all moved without a word. A trip's row is about half a kilobyte, so
 * a season of them costs less than one report's stills.
 *
 * One row per serve type and rubric per visit, the unit the trend draws
 * (`tripPoints`). Written as the trip happens (`saveSession`), folded again
 * before a quota prune deletes anything, and carried in the backup.
 *
 * THE RULE THAT JOINS A ROW TO LIVE REPORTS is `sameVisit` and "more serves
 * wins": a pruned trip's row holds every serve it ever had, and its surviving
 * reports hold fewer; a trip still whole in the store is the same either way.
 */
import type { FlawId } from '../analysis/flaws'
import type { FundamentalId } from '../analysis/types'
import { pointOf, sameVisit, tripRuns, typeOf } from '../progress'
import type { Session } from './db'
import { SERVE_TYPES } from '../analysis/coaching'
import type { ServeType } from './prefs'

export interface TripRecord {
  /** `type:rubric:from`, stable for as long as the trip's first serve survives. */
  id: string
  /** When the trip's first and last serves were filed. */
  from: number
  to: number
  serveType: ServeType
  scoringVersion: number
  /** Serves on the trip, of this type and rubric. */
  serves: number
  /** The trip's median overall and the range its serves ran over. */
  median: number
  low: number
  high: number
  /** Each area's median over the serves that graded it. */
  byArea: Partial<Record<FundamentalId, number>>
  /** How many of its serves were told to work on each fault. */
  named: Partial<Record<FlawId, number>>
  /** The ladder step the player was on for each fault, when the row was written. */
  ladder?: Partial<Record<string, number>>
}

/** A row's id. Exported so a test can name the row it expects. */
export const tripRecordId = (type: ServeType, rubric: number, from: number): string => `${type}:${rubric}:${from}`

/**
 * Every trip in `sessions` as a row. Any mix of serve types; each type is
 * cut into trips on its own, the way the trend cuts them.
 */
export function tripRecordsOf(
  sessions: readonly Session[],
  ladder?: Partial<Record<string, number>>,
): TripRecord[] {
  const byType = new Map<ServeType, Session[]>()
  for (const s of sessions) byType.set(typeOf(s), [...(byType.get(typeOf(s)) ?? []), s])
  const out: TripRecord[] = []
  for (const [type, list] of byType) {
    const oldestFirst = [...list].sort((a, b) => a.createdAt - b.createdAt)
    for (const run of tripRuns(oldestFirst)) {
      const p = pointOf(run)
      const named: Partial<Record<FlawId, number>> = {}
      for (const s of run) {
        const flaw = s.triage?.status === 'ok' ? s.triage.primary_flaw?.flaw : undefined
        if (flaw) named[flaw] = (named[flaw] ?? 0) + 1
      }
      out.push({
        id: tripRecordId(type, p.scoringVersion, p.createdAt),
        from: p.createdAt,
        to: p.to,
        serveType: type,
        scoringVersion: p.scoringVersion,
        serves: p.serves,
        median: p.overall,
        low: p.low,
        high: p.high,
        byArea: p.byArea as TripRecord['byArea'],
        named,
        ...(ladder && Object.keys(ladder).length ? { ladder: { ...ladder } } : {}),
      })
    }
  }
  return out
}

/**
 * What writing `incoming` into a ledger holding `existing` changes: the rows
 * to put, and the ids of rows they replace.
 *
 * A row describing the same visit (`sameVisit`, same serve type) is replaced
 * only by one with at least as many serves — so a trip whose oldest reports
 * were pruned keeps the row that knew them all, and a trip still growing, or
 * re-scored, updates. A row identical to what is stored is not written again.
 */
export function mergeTripRecords(
  existing: readonly TripRecord[],
  incoming: readonly TripRecord[],
): { write: TripRecord[]; drop: string[] } {
  const held = [...existing]
  const write: TripRecord[] = []
  const drop = new Set<string>()
  for (const r of incoming) {
    const clashes = held.filter((h) => h.serveType === r.serveType && sameVisit(h, r))
    if (clashes.some((h) => h.serves > r.serves)) continue
    if (clashes.some((h) => JSON.stringify(h) === JSON.stringify(r))) continue
    for (const h of clashes) {
      if (h.id !== r.id) drop.add(h.id)
      held.splice(held.indexOf(h), 1)
    }
    held.push(r)
    write.push(r)
  }
  return { write, drop: [...drop] }
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** A stored or imported row, checked, or nothing. Never repaired: a row with a hole in it is not a trip. */
export function normaliseTripRecord(raw: unknown): TripRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Partial<TripRecord>
  if (typeof r.id !== 'string' || !r.id) return undefined
  if (!isCount(r.from) || !isCount(r.to) || r.to < r.from) return undefined
  if (typeof r.serveType !== 'string' || !(r.serveType in SERVE_TYPES)) return undefined
  if (!isCount(r.scoringVersion) || !isCount(r.serves) || r.serves < 1) return undefined
  if (![r.median, r.low, r.high].every(isCount) || r.low! > r.median! || r.median! > r.high!) return undefined
  const counts = <K extends string>(o: unknown): Partial<Record<K, number>> =>
    o && typeof o === 'object'
      ? (Object.fromEntries(Object.entries(o).filter(([, v]) => isCount(v))) as Partial<Record<K, number>>)
      : {}
  const ladder = counts<string>(r.ladder)
  return {
    id: r.id,
    from: r.from,
    to: r.to,
    serveType: r.serveType,
    scoringVersion: r.scoringVersion,
    serves: r.serves,
    median: r.median!,
    low: r.low!,
    high: r.high!,
    byArea: counts<FundamentalId>(r.byArea),
    named: counts<FlawId>(r.named),
    ...(Object.keys(ladder).length ? { ladder } : {}),
  }
}
