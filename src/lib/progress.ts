import {
  faultMove,
  previousOnTrip,
  type ComparableServe,
  type FaultMove,
} from './analysis/carryForward'
import { FUNDAMENTALS } from './analysis/coaching'
import { mean, statusOf } from './analysis/geometry'
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
  /**
   * The oldest point in the current rubric era — where this run of
   * comparable scores began.
   *
   * Not necessarily `points[0]`: a recalibration starts a fresh era, and a
   * comparison spanning the break would measure the rubric change rather
   * than the player, the same reason every other figure below is confined
   * to `era`. Kept apart from `latest` even when they are the same point,
   * so a caller asking "how long has this era run" never has to rebuild
   * the era to find out.
   */
  first: TrendPoint
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
    first: era[0],
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

/**
 * How long a stretch of practice has to span before it is worth naming as
 * one.
 *
 * Six weeks: long enough that one good or bad basket cannot decide it, short
 * enough to still be about the training block somebody is actually in.
 */
export const MILESTONE_SPAN_MS = 6 * 7 * 24 * 60 * 60 * 1000

/**
 * One honest sentence about a real stretch of practice, or nothing.
 *
 * Not a reward for a tap. `PracticeCard`'s own drill button is deliberately
 * "not a streak, a badge or a congratulation" — logging a rep gets no
 * celebration, because a control that rewards the tap fills the record with
 * drills nobody did. The same restraint applies here, stretched from a
 * single rep to a training block: nothing below can be produced by pressing
 * anything, only by real analyses filed over real time, and it reports
 * whichever way the number actually moved. A stretch that went backwards
 * still gets a sentence — a milestone that only ever appears on good news is
 * a quieter version of the same lie a badge would tell.
 *
 * Confined to `progress.first`, the current rubric era's oldest point, for
 * the reason every other comparison in this file is: the score on the far
 * side of a recalibration is not a fair "before" for the score it produced.
 */
export function sixWeekMilestone(progress: Progress): string | undefined {
  const { first, latest, recentAverage } = progress
  if (first.id === latest.id) return undefined
  if (latest.createdAt - first.createdAt < MILESTONE_SPAN_MS) return undefined

  const weeks = Math.floor((latest.createdAt - first.createdAt) / (7 * 24 * 60 * 60 * 1000))
  const delta = recentAverage - first.overall
  if (Math.abs(delta) < MEANINGFUL_DELTA) {
    return `${weeks} weeks in, averaging ${recentAverage} — about where you started.`
  }
  return delta > 0
    ? `${weeks} weeks in: your first serve scored ${first.overall}, and you're averaging ${recentAverage} now.`
    : `${weeks} weeks in: averaging ${recentAverage}, down from your first serve's ${first.overall}.`
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
 *
 * Takes the one field it reads rather than a whole `Session`, so that a caller
 * holding a live `Analysis` — which is not a `Session` and never becomes one
 * until it is saved — can ask the same question. It only ever compared two
 * numbers; requiring the rest of a stored report to hand them over was an
 * accident of where it was first written.
 */
export function sameTrip(
  a: Pick<Session, 'createdAt'>,
  b: Pick<Session, 'createdAt'>,
  gapMs = MIN_THEN_AND_NOW_GAP_MS,
): boolean {
  return Math.abs(a.createdAt - b.createdAt) < gapMs
}

/**
 * Whether the previous serve on this trip's named fault moved, on this one.
 *
 * The join between `previousOnTrip`/`faultMove`, which are pure analysis and
 * know nothing about a trip, and `sameTrip`, which is the threshold this file
 * owns. It lives here rather than in `analysis/` for exactly that reason:
 * `carryForward.ts` takes the trip test as an argument so that the analysis
 * layer never has to import this one, and something has to supply it.
 *
 * `undefined` on the first serve of a trip and on every comparison
 * `faultMove` declines — which is most of them, by design.
 */
export function faultMoveOnTrip(
  history: Session[],
  current: ComparableServe,
): FaultMove | undefined {
  const previous = previousOnTrip(history, current, sameTrip)
  return previous ? faultMove(previous, current) : undefined
}

/**
 * A history cut into trips to the court, oldest trip first and oldest serve
 * first inside each.
 *
 * `sameTrip` answers this for two reports. Everything that wants to reason
 * about a *run* of them wants this instead, and until `findPracticeFocus`
 * needed it there was nothing that did — `thenAndNow` only ever compares two.
 *
 * Chained rather than measured from the first serve of the trip: a report is on
 * the same trip as the one before it if the gap to *that* report is under the
 * threshold. So a player filming every few hours through a long afternoon is on
 * one trip however long the afternoon runs, which is the right answer, and a
 * player filming every twenty hours for a week is also on one trip, which is a
 * known property of any gap rule rather than a bug in this one. There is no
 * clock in a `Session` that would do better — `createdAt` is when the report
 * was filed, and nothing records where anybody was standing.
 *
 * Never mutates the input: `listSummaries` hands the same array to several
 * readers, and a sort in place here would reorder a list the trend chart is
 * holding.
 */
export function tripsOf(sessions: Session[], gapMs = MIN_THEN_AND_NOW_GAP_MS): Session[][] {
  const ordered = [...sessions].sort((a, b) => a.createdAt - b.createdAt)
  const trips: Session[][] = []
  for (const session of ordered) {
    const current = trips[trips.length - 1]
    const previous = current?.[current.length - 1]
    if (current && previous && sameTrip(previous, session, gapMs)) current.push(session)
    else trips.push([session])
  }
  return trips
}

/**
 * How long a gap between trips still counts as "kept the streak".
 *
 * Nine days rather than seven: a player whose week runs Tuesday one week and
 * Thursday the next has not broken a habit, and a strict calendar week would
 * tell them they had. Loose enough to absorb a day or two of drift, tight
 * enough that a streak still means roughly weekly.
 */
export const STREAK_GAP_MS = 9 * 24 * 60 * 60 * 1000

/**
 * How many trips to the court in a row have landed within `STREAK_GAP_MS` of
 * the one before, counting back from the most recent — and zero once the
 * most recent trip itself has fallen outside that window, because a streak
 * that never resets is a lifetime count wearing a different word.
 *
 * A trip, not a tap. `tripsOf`'s unit only exists once a clip has gone all
 * the way through pose landmarking and come back with a score, so nobody
 * inflates this by opening the app — only by filming a serve, which is the
 * behaviour retention is actually meant to reward. `sixWeekMilestone` and the
 * drill button on `PracticeCard` both turned down a version of this feature
 * that a tap could produce; this is the version they left on the table, and
 * it survives the same objection because a tap cannot fake it.
 *
 * `now` is a parameter rather than `Date.now()` read inline, for the same
 * reason `BackupStore` takes its database as one: a streak is "as of when",
 * and a test should be able to say when without waiting for a clock.
 */
export function tripStreak(
  sessions: Session[],
  now: number = Date.now(),
  gapMs = STREAK_GAP_MS,
): number {
  if (sessions.length === 0) return 0
  const trips = tripsOf(sessions, MIN_THEN_AND_NOW_GAP_MS)
  const tripEnd = (trip: Session[]) => trip[trip.length - 1].createdAt
  const latest = trips[trips.length - 1]
  if (now - tripEnd(latest) > gapMs) return 0

  let streak = 1
  for (let i = trips.length - 1; i > 0; i--) {
    const gap = trips[i][0].createdAt - tripEnd(trips[i - 1])
    if (gap > gapMs) break
    streak++
  }
  return streak
}

/**
 * The longest run of trips ever kept, not just the one still standing —
 * `tripStreak`'s all-time counterpart, the same "durable fact, not a live
 * one" distinction `bestConsistencyGap`/`bestOverallScore`
 * already draw against their own per-report readings. A current streak
 * resets to zero the moment a gap runs long; this never does, which is
 * exactly what makes it worth stating on its own during a slump rather
 * than only while the streak itself is intact.
 *
 * Walked across the whole history rather than read off `tripStreak` at
 * every point in time: the same trip boundaries, counted for the longest
 * unbroken run anywhere in them, not only the run touching `now`.
 */
export function longestStreak(sessions: Session[], gapMs = STREAK_GAP_MS): number {
  if (sessions.length === 0) return 0
  const trips = tripsOf(sessions, MIN_THEN_AND_NOW_GAP_MS)
  const tripEnd = (trip: Session[]) => trip[trip.length - 1].createdAt
  let longest = 1
  let current = 1
  for (let i = 1; i < trips.length; i++) {
    const gap = trips[i][0].createdAt - tripEnd(trips[i - 1])
    current = gap > gapMs ? 1 : current + 1
    longest = Math.max(longest, current)
  }
  return longest
}

/**
 * The longest-streak record in words — `yet` when the player is currently
 * living it, the same framing `bestGapLine` uses for whichever basket set
 * its own record, plainly stated otherwise, including once a record run
 * has long since lapsed and `tripStreak` itself has fallen back to zero.
 * Silent below two trips, the same floor `tripStreak`'s own line holds.
 */
export function longestStreakLine(sessions: Session[], now: number = Date.now()): string | undefined {
  const longest = longestStreak(sessions)
  if (longest < 2) return undefined
  const current = tripStreak(sessions, now)
  return current === longest
    ? `Your longest run yet — ${longest} trips in a row.`
    : `Your longest run was ${longest} trips in a row.`
}

/**
 * The tightest gap between a player's best and worst serve, across every
 * basket they've swept — and whether the basket that just finished is the
 * one that set it.
 *
 * A different superlative from `progress.best`, which is a score; this is a
 * spread, and a smaller one is the improvement. Ungameable the same way
 * `tripStreak` is: `ConsistencyPoint.gap` only exists once a basket has gone
 * through the sweep and come back with at least two readable serves
 * (`buildConsistencyTrend`'s own gate), so the only way to move this number
 * is to actually serve a tighter basket, never to reopen an old report.
 *
 * `undefined` below two baskets, for the same reason `sixWeekMilestone` is
 * silent on a single report — one basket's gap is just that basket's, not a
 * record yet.
 */
export interface BestGap {
  gap: number
  createdAt: number
}

export function bestConsistencyGap(trend: ConsistencyTrend | undefined): BestGap | undefined {
  if (!trend || trend.points.length < 2) return undefined
  const best = trend.points.reduce((a, b) => (b.gap < a.gap ? b : a))
  return { gap: best.gap, createdAt: best.createdAt }
}

/**
 * The sentence a tightest-gap record becomes.
 *
 * States the fact rather than congratulating it, the same restraint
 * `sixWeekMilestone` holds: "your tightest yet" lets a smaller number speak
 * for itself, which is a different sentence from telling somebody they did
 * well.
 *
 * `viewedAt` is the `createdAt` of whichever basket is actually on screen,
 * not "the most recent basket in the whole history" — those are different
 * baskets the moment somebody reopens an old report. The first version of
 * this compared the record against the trend's own latest point regardless
 * of which report was open, which told a player looking at an old, wide
 * basket that it was their tightest "yet" — confident nonsense caught by
 * actually opening two different reports rather than by reasoning about the
 * code. Dated when the basket on screen is not the record, using the same
 * `shortDate` the then-and-now pair already stamps its two columns with, so
 * a record from three weeks ago and one set just now do not read as the
 * same claim.
 */
export function bestGapLine(record: BestGap, viewedAt: number): string {
  return record.createdAt === viewedAt
    ? `Your tightest gap yet — ${record.gap} points between your best serve and your worst.`
    : `Your tightest gap so far is ${record.gap} points, set ${shortDate(record.createdAt)}.`
}

/**
 * The tightest-gap record stated plainly, for a view with no single basket
 * on screen to compare it against.
 *
 * `bestGapLine` answers "did *this* basket set the record", which only
 * means something on `ConsistencyPanel`, where one basket is what's open.
 * The progress sheet — "Every serve so far" — is the opposite kind of
 * screen on purpose: an aggregate across the whole history, with no single
 * basket to be the "current" one. Forcing `bestGapLine`'s two-branch
 * question onto a screen with no current basket would need a fake
 * `viewedAt` no real basket has, so this is a second, simpler sentence
 * instead — always the record, plainly, the same register
 * `sixWeekMilestone` already uses on the same sheet.
 */
export function bestGapEverLine(record: BestGap): string {
  return `Your tightest gap yet was ${record.gap} points, set ${shortDate(record.createdAt)}.`
}

/**
 * How the most recent basket's gap compared to the one before it, in words —
 * `buildConsistencyTrend` has computed `gapDelta` since it was written and
 * nothing has ever said it aloud.
 *
 * Silent below `MEANINGFUL_DELTA`, the same noise floor every other score-
 * point comparison in this file already uses. Reusing it here is not a new
 * number: `gapDelta` is a difference of two differences of overall scores,
 * the same point scale `MEANINGFUL_DELTA` was calibrated against, so the
 * existing threshold is being asked a second question, not invented for
 * this one.
 *
 * Negative is the improvement — a shrinking gap — the opposite sign
 * convention from every other delta in this app, where positive is always
 * the good direction. Said in words rather than handed to `DeltaChip`,
 * which assumes that convention and would show a real improvement as the
 * "down and bad" colour without a flip nobody reading the component call
 * site would notice was missing.
 *
 * Takes the delta itself rather than a `ConsistencyTrend`, so the same
 * sentence can serve two different questions: `trend.gapDelta` for "how did
 * the most recent basket in the whole history compare", and `gapDeltaFor`
 * below for "how did *this* basket compare", which are the same number only
 * when the basket on screen happens to be the newest one.
 */
export function gapDeltaLine(delta: number | undefined): string | undefined {
  if (delta === undefined || Math.abs(delta) < MEANINGFUL_DELTA) return undefined
  return delta < 0
    ? `${Math.abs(delta)} points tighter than your last basket.`
    : `${delta} points wider than your last basket.`
}

/**
 * How a specific basket's gap compared to the one right before it — the
 * question `ConsistencyPanel` actually has, for whichever basket is open,
 * not the trend's own fixed "latest vs previous" snapshot `gapDelta` is.
 *
 * `undefined` for a basket not in the trend at all (a different serve type,
 * or one dropped by `currentRubricEra`) and for the first basket in the era,
 * which has nothing before it to compare against — the same "nothing to be
 * a record against" floor every other cross-basket comparison in this file
 * already holds.
 */
export function gapDeltaFor(trend: ConsistencyTrend | undefined, viewedId: string): number | undefined {
  if (!trend) return undefined
  const i = trend.points.findIndex((p) => p.id === viewedId)
  if (i <= 0) return undefined
  return trend.points[i].gap - trend.points[i - 1].gap
}

/**
 * The sentence a streak becomes, or nothing where a number would say more
 * than it should.
 *
 * Silent below two, and not just below one: a streak of one trip is what
 * `sixWeekMilestone`'s "first serve" already implicitly says, and printing
 * "1 trip in a row" the moment somebody's history stops being empty reads as
 * the app congratulating a null result.
 */
export function streakLine(sessions: Session[], now: number = Date.now()): string | undefined {
  const n = tripStreak(sessions, now)
  if (n < 2) return undefined
  return `${n} trips to the court in a row, roughly weekly.`
}

/**
 * The single highest score any one serve has earned, for a given serve type.
 *
 * Scoped by type for the same reason `bestConsistencyGap` is: the
 * fundamentals are judged against a different target band per serve type
 * (`coaching.ts`'s `SERVE_TYPES`), so a 90 on a kick serve and a 90 on a flat
 * one are graded against different rubrics, not the same claim twice.
 *
 * `undefined` below two reports of the type, the same floor every other
 * cross-session record in this file holds — one score is just that score,
 * not a record yet.
 */
export interface BestScore {
  score: number
  createdAt: number
}

export function bestOverallScore(sessions: Session[], serveType: ServeType): BestScore | undefined {
  const usable = sessions.filter((s) => typeOf(s) === serveType)
  if (usable.length < 2) return undefined
  const best = usable.reduce((a, b) => (b.overall > a.overall ? b : a))
  return { score: best.overall, createdAt: best.createdAt }
}

/**
 * The sentence a best-score record becomes, matching `bestGapLine`'s own
 * restraint — the number is left to say whether it was good, not told to.
 */
export function bestOverallScoreLine(record: BestScore, viewedAt: number): string {
  return record.createdAt === viewedAt
    ? `Your best serve yet — ${record.score}.`
    : `Your best serve so far scored ${record.score}, set ${shortDate(record.createdAt)}.`
}

/**
 * The best-score record stated plainly, for `bestGapEverLine`'s reason: the
 * progress sheet has no single report on screen to ask "did *this* one set
 * it", so `bestOverallScoreLine`'s two-branch question has nothing to
 * compare against here.
 */
export function bestOverallScoreEverLine(record: BestScore): string {
  return `Your best serve yet scored ${record.score}, set ${shortDate(record.createdAt)}.`
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
