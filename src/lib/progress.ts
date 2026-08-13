import { FUNDAMENTALS } from './analysis/coaching'
import { statusOf } from './analysis/geometry'
import { LEGACY_SCORING_VERSION, type FundamentalId, type Status } from './analysis/types'
import type { Session } from './storage/db'
import type { ServeType } from './storage/prefs'
import { clipIdOf } from './storage/sessionKey'

export interface TrendPoint {
  id: string
  createdAt: number
  overall: number
  status: Status
  byArea: Record<string, number>
  /** Which rubric these scores came from. Only equal versions may be compared. */
  scoringVersion: number
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
  /**
   * When the scoring changed partway through this history, the moment the
   * current rubric starts — so the chart can draw the break instead of a line
   * across it. Absent when every point was scored the same way.
   *
   * `points` still holds everything before it. The old scores are real, they
   * are simply not the same measurement, and deleting them from the chart would
   * read as the app having lost the player's history.
   */
  rubricBreakAt?: number
}

/** A report saved before serve types existed was scored against the flat bands. */
export const typeOf = (s: Pick<Session, 'serveType'>): ServeType => s.serveType ?? 'flat'

/**
 * Which rubric a report's scores belong to — saved or still on screen.
 *
 * `analyzeServe` stamps a report as it scores it and `normalise` fills the field
 * in on the way out of storage, so in practice the field is there. A report
 * reaching here without one — a hand-edited backup, a fixture, a row written
 * before stamping existed — must land on the old rubric rather than on whatever
 * the current one happens to be, since a missing stamp can only mean it predates
 * stamping.
 *
 * The one way any consumer should read this field. A call site that reaches for
 * `s.scoringVersion` and defaults it itself is how the two halves of the guard
 * came to disagree about what an absent stamp meant.
 */
export const scoringVersionOf = (s: Pick<Session, 'scoringVersion'>): number =>
  typeof s.scoringVersion === 'number' ? s.scoringVersion : LEGACY_SCORING_VERSION

/**
 * The run of reports at the end of a history that were all scored the same way.
 *
 * `oldestFirst` must be in time order. Scanned from the newest backwards rather
 * than filtered by version, so that a backup restored out of order cannot stitch
 * two eras of the same version around a third era in between and then average
 * across the lot.
 *
 * The one place any consumer decides what "comparable" means, so that the trend
 * chart, the report page and the practice card cannot drift into disagreeing
 * about which of a player's serves belong on the same scale.
 */
export function currentRubricEra<T extends Pick<Session, 'scoringVersion'>>(
  oldestFirst: T[],
): T[] {
  for (let i = oldestFirst.length - 1; i > 0; i--) {
    if (scoringVersionOf(oldestFirst[i - 1]) !== scoringVersionOf(oldestFirst[i])) {
      return oldestFirst.slice(i)
    }
  }
  return oldestFirst
}

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
      scoringVersion: scoringVersionOf(s),
    }))

  const latest = points[points.length - 1]

  /*
   * One rubric at a time, for the same reason as one serve type at a time — and
   * with less warning to the player, because nothing about their serve changed.
   *
   * A saved report keeps no frames, so it can never be re-scored: when the
   * scoring is recalibrated the old numbers stay as they were computed, and the
   * two rubrics have to coexist in one history permanently. Subtracting across
   * that boundary measures the recalibration, not the player. Refilming the
   * identical serve after an update moved the total by far more than
   * `MEANINGFUL_DELTA`, so the app congratulated somebody on a gain that did not
   * happen — which is the one lie a coaching app cannot afford, because the
   * trend is the whole reason to come back.
   *
   * So every comparison below is confined to the run of points that share the
   * newest rubric.
   */
  const era = currentRubricEra(points)
  const previous = era.length > 1 ? era[era.length - 2] : undefined

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

  // The rolling average and the personal best come from the era too. A best set
  // under the old rubric is not a bar this one can be held to, and an average
  // taken across the break is part old scoring and part new — a number that
  // describes neither the player's form nor anything else.
  const scores = era.map((p) => p.overall)
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
    rubricBreakAt: era.length < points.length ? era[0].createdAt : undefined,
  }
}

/* ------------------------------------------------- consistency, over time -- */

export interface ConsistencyPoint {
  id: string
  createdAt: number
  /**
   * Points between the best and the worst serve in that basket.
   *
   * The headline number for a club player, and the one a single report cannot
   * produce. An average tells somebody their serve is a 68; this tells them
   * their good one is a 79 and their bad one is a 51, which is the difference
   * between holding serve and double faulting — and it is the number that comes
   * down first when technique starts to groove.
   */
  gap: number
  /** How many serves in that clip were readable. A gap over two is thin. */
  serves: number
  /** The sweep's own repeatability score, which leans on the least steady parts. */
  score: number
}

export interface ConsistencyTrend {
  /** Oldest first. */
  points: ConsistencyPoint[]
  latest: ConsistencyPoint
  /** Change in the gap since the basket before it. Negative is an improvement. */
  gapDelta?: number
  /**
   * The element that came out least repeatable most often, and how many baskets
   * it did that in. What to groove, as opposed to what to fix.
   */
  recurring?: { id: string; label: string; sessions: number }
}

/**
 * Whether a player's serves are converging on each other, across sessions.
 *
 * `buildProgress` answers "is my serve getting better"; this answers "is it
 * getting more repeatable", and for most club players the second is the one
 * holding them back. It has been computable since the sweep shipped and was
 * impossible to build, because the spreads lived in React state and were gone
 * the moment the player pressed back.
 *
 * Guarded the same three ways `buildProgress` is — one serve type, one rubric,
 * and no double counting — because every one of those would otherwise report a
 * change the player did not make.
 */
export function buildConsistencyTrend(
  sessions: Session[],
  serveType?: ServeType,
): ConsistencyTrend | undefined {
  const type = serveType ?? dominantType(sessions)

  const withSpreads = sessions
    .filter(
      (s) =>
        typeOf(s) === type &&
        s.consistency &&
        s.consistency.serves >= 2 &&
        // Gated on the array the gap is actually computed from, not on the count
        // beside it. `serves` and `overallScores` agree on anything this app
        // wrote, and a hand-edited backup can carry a count of three next to an
        // empty list — from which `Math.max` of nothing produces −Infinity, and
        // an infinite gap takes the chart's axis with it.
        s.consistency.overallScores.length >= 2,
    )
    .sort((a, b) => a.createdAt - b.createdAt)

  // One point per clip, not per report. A sweep run from serve three and again
  // from serve four measures the same basket twice, and plotting both would
  // draw a flat stretch that reads as a session where nothing changed.
  const byClip = new Map<string, Session>()
  for (const s of withSpreads) byClip.set(clipIdOf(s.id), s)

  // The consistency score is graded against target bands, and the gap is a
  // difference of two overall scores — both move when the rubric does, so both
  // are confined to the newest era for the same reason the trend chart is.
  const era = currentRubricEra([...byClip.values()].sort((a, b) => a.createdAt - b.createdAt))
  if (era.length === 0) return undefined

  const points: ConsistencyPoint[] = era.map((s) => {
    const c = s.consistency!
    return {
      id: s.id,
      createdAt: s.createdAt,
      gap: Math.max(...c.overallScores) - Math.min(...c.overallScores),
      serves: c.serves,
      score: c.score,
    }
  })

  const latest = points[points.length - 1]
  const previous = points.length > 1 ? points[points.length - 2] : undefined

  // The least repeatable element in each basket, tallied. A single basket's
  // weakest link is noise — a toss wanders on any given day — and the same one
  // coming last three times running is the thing to take to the practice court.
  const tally = new Map<string, { label: string; sessions: number }>()
  for (const s of era) {
    const weakest = s.consistency?.weakest
    if (!weakest) continue
    const seen = tally.get(weakest.id)
    tally.set(weakest.id, {
      label: weakest.label,
      sessions: (seen?.sessions ?? 0) + 1,
    })
  }
  const top = [...tally.entries()].sort((a, b) => b[1].sessions - a[1].sessions)[0]

  return {
    points,
    latest,
    gapDelta: previous ? latest.gap - previous.gap : undefined,
    // Only worth naming once it has happened more than once. Below that it is
    // this clip's weakest element, which the report already said.
    recurring: top && top[1].sessions >= 2 ? { id: top[0], ...top[1] } : undefined,
  }
}

/**
 * Per-area change between one report and the one before it, for the report page.
 *
 * `scoringVersion` is the rubric the fundamentals passed in were scored under:
 * `scoringVersionOf` the report they came off, which carries its own stamp
 * whether it has been saved yet or not. Given it, a comparison across a change
 * of rubric is refused for the same reason `buildProgress` refuses one: the
 * difference would be the recalibration rather than the player, and it is per
 * area, where a fabricated swing of a dozen points reads as a diagnosis.
 *
 * Omitting it keeps the old unchecked behaviour, which is what every caller did
 * before the stamp existed. Left as opt-in rather than defaulting to the current
 * rubric because defaulting would silently blank the deltas on every report
 * saved before stamping, and a caller passing nothing is more likely to be a
 * test or a tool than the report page.
 */
export function deltasAgainst(
  fundamentals: { id: FundamentalId; score: number }[],
  previous?: Session,
  scoringVersion?: number,
): Record<string, number> {
  if (!previous) return {}
  if (scoringVersion !== undefined && scoringVersionOf(previous) !== scoringVersion) return {}
  const before = Object.fromEntries(previous.fundamentals.map((f) => [f.id, f.score]))
  const out: Record<string, number> = {}
  for (const f of fundamentals) {
    if (f.id in before) out[f.id] = f.score - before[f.id]
  }
  return out
}

/** A change smaller than this is serve-to-serve noise, not a trend. */
/**
 * The oldest serve still worth putting beside today's, and today's.
 *
 * The question a trend line cannot answer. A chart says the number went from 58
 * to 66; it cannot show that the racket now falls behind the back where it used
 * to stop at the shoulder, and that is the thing somebody wants to see after six
 * weeks of the same drill.
 *
 * Deliberately the *oldest* kept serve rather than a fixed interval. Stills
 * survive on the newest `KEEP_STILLS` reports and are dropped from everything
 * older, so the furthest-back picture that still exists is the widest honest
 * comparison there is — and asking for "three months ago" would silently return
 * whatever happened to still have images.
 *
 * Both must be the same serve type and the same rubric era, for the reasons
 * `buildProgress` refuses a comparison across either: different target bands and
 * a recalibration that would show up as the player changing.
 */
export function thenAndNow(
  sessions: Session[],
  keepStills: number,
  serveType?: ServeType,
): { then: Session; now: Session } | undefined {
  const type = serveType ?? dominantType(sessions)
  const mine = currentRubricEra(
    sessions.filter((s) => typeOf(s) === type).sort((a, b) => a.createdAt - b.createdAt),
  )
  if (mine.length < 2) return undefined

  /*
   * Chosen by position rather than by looking for pictures.
   *
   * `listSummaries` strips the stills on the way out — that is the whole point
   * of it, since deserialising 120 base64 images to throw them away is the peak
   * it exists to avoid — so nothing here can see which reports still have any.
   * What is knowable is the rule: stills survive on the newest `keepStills`
   * reports across the whole store. So the furthest back worth asking for is
   * that far back, and whether the images are really there is settled by
   * fetching them.
   *
   * Counted over `sessions` rather than over this serve type, because the prune
   * does not care about serve types either.
   */
  const oldestKept = [...sessions].sort((a, b) => b.createdAt - a.createdAt)[keepStills - 1]
  const floor = oldestKept?.createdAt ?? 0
  const eligible = mine.filter((s) => s.createdAt >= floor)
  if (eligible.length < 2) return undefined

  const then = eligible[0]
  const now = eligible[eligible.length - 1]
  // One report cannot be its own before-and-after, and two filed minutes apart
  // are the same trip to the court — a player correcting the handedness and
  // re-reading the same clip would otherwise be shown their serve against
  // itself, and an hour's variation would be printed as progress.
  if (sameTrip(then, now)) return undefined
  return { then, now }
}

/**
 * How far apart two serves have to be before one is a "then".
 *
 * A day. Below that they are the same trip to the court, and a comparison across
 * one basket is what the consistency panel is for — showing it here under a
 * heading about progress would be calling an hour's variation improvement.
 */
export const MIN_THEN_AND_NOW_GAP_MS = 24 * 60 * 60 * 1000

/**
 * Whether two serves happened on the same trip to the court.
 *
 * Not a stored concept — there is no `Trip` row anywhere, and nothing in this
 * codebase persists one. It is a threshold on `createdAt`, used exactly once
 * before this was given a name: `thenAndNow` needed to know that a report
 * filed minutes after another is not a "then" for it, and wrote the check
 * inline. Named here so the concept is one definition rather than a magic
 * comparison a second caller would have to reconstruct correctly by reading
 * this comment rather than a function signature.
 */
export function sameTrip(a: Session, b: Session, gapMs = MIN_THEN_AND_NOW_GAP_MS): boolean {
  return Math.abs(a.createdAt - b.createdAt) < gapMs
}

export const MEANINGFUL_DELTA = 3

export const deltaStatus = (delta: number): Status | 'flat' =>
  Math.abs(delta) < MEANINGFUL_DELTA ? 'flat' : delta > 0 ? 'great' : 'work'

export { statusOf }

/**
 * A date as the trend axis writes it.
 *
 * Here rather than in a component, so the chart's axis and the then-and-now
 * pair's two column captions cannot come out in different formats on one
 * screen — which reads as two different kinds of date rather than as one.
 */
export const shortDate = (t: number): string =>
  new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
