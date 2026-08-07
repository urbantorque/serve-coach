import { FUNDAMENTALS } from './analysis/coaching'
import { statusOf } from './analysis/geometry'
import type { FundamentalId, Status } from './analysis/types'
import type { Session } from './storage/db'
import type { ServeType } from './storage/prefs'

export interface TrendPoint {
  id: string
  createdAt: number
  overall: number
  status: Status
  byArea: Record<string, number>
}

export interface AreaDelta {
  id: FundamentalId
  label: string
  from: number
  to: number
  delta: number
}

export interface Progress {
  /** Oldest first — charts read left to right. */
  points: TrendPoint[]
  latest: TrendPoint
  previous?: TrendPoint
  /** Change in overall score against the session before it. */
  overallDelta?: number
  areaDeltas: AreaDelta[]
  best: number
  /** Mean of the three most recent, which is steadier than any single serve. */
  recentAverage: number
  /** Change in that rolling average against the three before it. */
  formDelta?: number
  /** Which serve these points all are. */
  serveType: ServeType
  /** Reports set aside because they were a different serve. */
  setAside: number
}

/** A report saved before serve types existed was scored against the flat bands. */
export const typeOf = (s: Pick<Session, 'serveType'>): ServeType => s.serveType ?? 'flat'

/**
 * Which serve type a trend should be about, when nobody has said.
 *
 * What they filmed most recently is what they are working on, so that comes
 * first — but only if there is enough of it to draw a trend from. Otherwise a
 * player with two months of flat serves who tries a single kick would open the
 * progress view to find their entire history gone, replaced by one point, which
 * looks exactly like the app having lost it. In that case the type with the most
 * reports behind it is the more useful answer, and the caller says which one it
 * settled on so the UI can label it.
 */
export function dominantType(sessions: Session[]): ServeType {
  if (sessions.length === 0) return 'flat'

  const counts = new Map<ServeType, number>()
  for (const s of sessions) counts.set(typeOf(s), (counts.get(typeOf(s)) ?? 0) + 1)

  const newest = typeOf([...sessions].sort((a, b) => b.createdAt - a.createdAt)[0])
  if ((counts.get(newest) ?? 0) >= 2) return newest

  // Ties go to the most recent, which `sessions` order already reflects closely
  // enough — a tie means neither has enough history for the choice to matter.
  let best = newest
  let most = counts.get(newest) ?? 0
  for (const [type, n] of counts) {
    if (n > most) {
      best = type
      most = n
    }
  }
  return best
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * Turn saved reports into something that answers "am I actually getting better?"
 *
 * A single serve is noisy — toss height and knee bend move a few points between
 * two serves hit minutes apart — so alongside the raw last-vs-previous delta
 * this also reports a rolling three-serve average, which is what a player should
 * actually judge a change of technique by.
 */
export function buildProgress(sessions: Session[], serveType?: ServeType): Progress | undefined {
  if (sessions.length === 0) return undefined

  /*
   * One serve type at a time.
   *
   * The target bands differ between a flat serve and a kick, so the scores are
   * not on the same scale — a player who spends a month on their flat serve and
   * then starts working on a kick would see the switch itself as a step change in
   * form, and the app would report it as progress or a slump depending on which
   * way it fell. Neither is true, and "your serve got worse" for changing what
   * you were practising is the kind of wrong that makes somebody stop trusting
   * the whole chart.
   *
   * Defaults to whatever they filmed most recently, which is what they are
   * working on now.
   */
  const type = serveType ?? dominantType(sessions)
  const matching = sessions.filter((s) => typeOf(s) === type)
  if (matching.length === 0) return undefined

  // `listSessions` hands back newest first; charts want the opposite.
  const points: TrendPoint[] = [...matching]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      overall: s.overall,
      status: s.overallStatus,
      byArea: Object.fromEntries(s.fundamentals.map((f) => [f.id, f.score])),
    }))

  const latest = points[points.length - 1]
  const previous = points.length > 1 ? points[points.length - 2] : undefined

  const areaDeltas: AreaDelta[] = previous
    ? (Object.keys(FUNDAMENTALS) as FundamentalId[])
        .filter((id) => id in latest.byArea && id in previous.byArea)
        .map((id) => ({
          id,
          label: FUNDAMENTALS[id].label,
          from: previous.byArea[id],
          to: latest.byArea[id],
          delta: latest.byArea[id] - previous.byArea[id],
        }))
    : []

  const scores = points.map((p) => p.overall)
  const recent = scores.slice(-3)
  const priorWindow = scores.slice(-6, -3)

  return {
    points,
    latest,
    previous,
    overallDelta: previous ? latest.overall - previous.overall : undefined,
    areaDeltas,
    best: Math.max(...scores),
    recentAverage: Math.round(mean(recent)),
    formDelta:
      priorWindow.length >= 2 ? Math.round(mean(recent) - mean(priorWindow)) : undefined,
    serveType: type,
    setAside: sessions.length - matching.length,
  }
}

/** Per-area change between one report and the one before it, for the report page. */
export function deltasAgainst(
  fundamentals: { id: FundamentalId; score: number }[],
  previous?: Session,
): Record<string, number> {
  if (!previous) return {}
  const before = Object.fromEntries(previous.fundamentals.map((f) => [f.id, f.score]))
  const out: Record<string, number> = {}
  for (const f of fundamentals) {
    if (f.id in before) out[f.id] = f.score - before[f.id]
  }
  return out
}

/** A change smaller than this is serve-to-serve noise, not a trend. */
export const MEANINGFUL_DELTA = 3

export const deltaStatus = (delta: number): Status | 'flat' =>
  Math.abs(delta) < MEANINGFUL_DELTA ? 'flat' : delta > 0 ? 'great' : 'work'

export { statusOf }
