import {
  faultMove,
  rotationMove,
  previousOnTrip,
  type ComparableServe,
  type FaultMove,
  type RotationMove,
} from './analysis/carryForward'
import { FUNDAMENTALS, isMeasured } from './analysis/coaching'
import { mean, statusOf } from './analysis/geometry'
import {
  clearedStrain,
  recurringStrain,
  strainBehind,
  type StrainCleared,
  type StrainRecord,
} from './analysis/strain'
import { INJURY_INPUTS } from './analysis/faultOrder'
import type { InjuryFlag } from './analysis/triage'
import {
  LEGACY_SCORING_VERSION,
  type Analysis,
  type Fundamental,
  type FundamentalId,
  type Status,
} from './analysis/types'
import { NOISE_FLOOR } from './analysis/tiers'
import { CARD_NOISE_SD } from './analysis/cardNoise'
import { MIN_EVIDENCE, type FlawId } from './analysis/flaws'
import { progressionFor } from './analysis/progressions'
import {
  GAP_CHANGE,
  REAL_CHANGE,
  changeOf,
  readAlike,
  type ChangeScope,
} from './analysis/realChange'
import { VERDICT_TABLES } from './analysis/verdict'
import { cue } from './analysis/voice'
import type { ServeOutcome, ServeTag, Session } from './storage/db'
import type { TripRecord } from './storage/ledger'
import type { PracticeSession } from './session/session'
import type { Cadence, ServeType } from './storage/prefs'
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

/** One area's change against the report before, and whether the two were graded alike. */
/**
 * One trip to the court, as the trend draws it (L3.2): the median of its
 * serves, with the range they ran over. A single serve is too noisy to be the
 * headline — on club serves the camera moves it further than fixing a fault
 * does — and the median of a trip moves less than any one of them
 * (`realChange.test.ts`).
 *
 * Only one serve type and one rubric: a trip that straddles an update is two
 * points, one either side of the break.
 */
export interface TripPoint extends TrendPoint {
  /** When its last serve was filed. `createdAt` is when its first was. */
  to: number
  /** Serves of this type, under this rubric, on the trip. */
  serves: number
  /** The trip's lowest and highest overall. */
  low: number
  high: number
}

/**
 * How many serves a trip needs before its median stands for it: in a chip,
 * a record, or the six-week line (L3.2). The trip floor in `REAL_CHANGE` is
 * measured on three a side; a trip of two is a pair, and its middle is
 * whichever of the two the camera favoured.
 */
export const MIN_TRIP_SERVES = 3

export interface AreaChange {
  delta: number
  alike: boolean
}

export interface AreaDelta {
  id: FundamentalId
  label: string
  from: number
  to: number
  delta: number
  /**
   * Whether the two serves graded the same rows in this area (`readAlike`).
   * When they did not — the drop collapsed on one of them, say — the delta is
   * two measurements rather than one taken twice, and is held to a wider floor.
   */
  alike: boolean
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
  /** Whether those two were graded on the same rows — see `AreaDelta.alike`. */
  overallAlike?: boolean
  areaDeltas: AreaDelta[]
  /**
   * Every trip, oldest first, one point each — what the charts plot (L3.2).
   * Like `points`, it keeps the trips from before a recalibration.
   */
  trips: TripPoint[]
  /** The newest trip in the current rubric era: the headline. */
  latestTrip: TripPoint
  /** The trip before it in the era. */
  previousTrip?: TripPoint
  /**
   * The newest trip's median against the previous trip's, when both had
   * `MIN_TRIP_SERVES`. Absent otherwise: a trip of one or two serves is not
   * steadier than a serve, so its "change" would be the camera.
   */
  tripDelta?: number
  /** The best trip median in the era, among trips of `MIN_TRIP_SERVES` — see `bestTrip`. */
  best?: number
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
export function buildProgress(
  sessions: Session[],
  serveType?: ServeType,
  /** The season ledger (L3.3), any serve type: trips whose reports were pruned. */
  ledger: readonly TripRecord[] = [],
): Progress | undefined {
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
  const oldestFirst = [...matching].sort((a, b) => a.createdAt - b.createdAt)
  const points: TrendPoint[] = oldestFirst.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    overall: s.overall,
    status: s.overallStatus,
    // An area the clip could not grade has no score to chart (L1.1), so it
    // is absent here rather than a 0 the next serve would 'gain' from.
    byArea: Object.fromEntries(s.fundamentals.filter(isMeasured).map((f) => [f.id, f.score])),
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
   * identical serve after an update moved the total by far more than the
   * camera does (`REAL_CHANGE`), so the app congratulated somebody on a gain that did not
   * happen — which is the one lie a coaching app cannot afford, because the
   * trend is the whole reason to come back.
   *
   * So every comparison below is confined to the run of points that share the
   * newest rubric.
   */
  const era = currentRubricEra(points)
  const previous = era.length > 1 ? era[era.length - 2] : undefined

  // The two reports themselves, for whether they were graded on the same rows
  // (L3.1). The points keep only the scores.
  const cards = new Map(oldestFirst.map((s) => [s.id, s.fundamentals]))
  const alikeOn = (scope: 'overall' | FundamentalId) =>
    previous ? readAlike(cards.get(latest.id) ?? [], cards.get(previous.id) ?? [], scope) : true

  const areaDeltas: AreaDelta[] = previous
    ? (Object.keys(FUNDAMENTALS) as FundamentalId[])
        .filter((id) => id in latest.byArea && id in previous.byArea)
        .map((id) => ({
          id,
          label: FUNDAMENTALS[id].label,
          from: previous.byArea[id],
          to: latest.byArea[id],
          delta: latest.byArea[id] - previous.byArea[id],
          alike: alikeOn(id),
        }))
    : []

  // Trips (L3.2), and the headline, its change and the best from the era's.
  // A best set under the old rubric is not a bar this one can be held to.
  const trips = tripPoints(
    oldestFirst,
    ledger.filter((r) => r.serveType === type),
  )
  const tripEra = currentRubricEra(trips)
  const latestTrip = tripEra[tripEra.length - 1]
  const previousTrip = tripEra.length > 1 ? tripEra[tripEra.length - 2] : undefined
  const full = (t?: TripPoint) => t !== undefined && t.serves >= MIN_TRIP_SERVES

  return {
    points,
    latest,
    previous,
    first: era[0],
    overallDelta: previous ? latest.overall - previous.overall : undefined,
    overallAlike: previous ? alikeOn('overall') : undefined,
    areaDeltas,
    trips,
    latestTrip,
    previousTrip,
    tripDelta: full(latestTrip) && full(previousTrip) ? latestTrip.overall - previousTrip!.overall : undefined,
    best: bestOf(tripEra)?.overall,
    serveType: type,
    setAside: sessions.length - matching.length,
    rubricBreakAt: era.length < points.length ? era[0].createdAt : undefined,
  }
}

/** The middle score; for an even count, the two middle ones' mean, rounded. */
function medianOf(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * A history of one serve type as trips (L3.2), oldest first: `tripsOf`'s
 * visits, each split where the rubric changed, each one point.
 *
 * `oldestFirst` must already be one serve type and in time order. Areas are
 * the median over the serves that graded them, so an area a serve could not
 * grade neither drags the trip down nor props it up.
 */
export function tripPoints(oldestFirst: Session[], ledger: readonly TripRecord[] = []): TripPoint[] {
  const live = tripRuns(oldestFirst).map(pointOf)
  return ledger.length ? withLedger(live, ledger) : live
}

/**
 * `tripsOf`'s visits, each split where the rubric changed: the serves behind
 * each trip point. `oldestFirst` must be one serve type, in time order.
 */
export function tripRuns(oldestFirst: Session[]): Session[][] {
  const runs: Session[][] = []
  for (const trip of tripsOf(oldestFirst)) {
    let run: Session[] = []
    for (const s of trip) {
      if (run.length && scoringVersionOf(run[0]) !== scoringVersionOf(s)) {
        runs.push(run)
        run = []
      }
      run.push(s)
    }
    if (run.length) runs.push(run)
  }
  return runs
}

/** One run of serves as a trip point. */
export function pointOf(run: Session[]): TripPoint {
  const scores = run.map((r) => r.overall)
  const overall = medianOf(scores)
  const byArea: Record<string, number> = {}
  for (const id of Object.keys(FUNDAMENTALS)) {
    const graded = run.flatMap((r) =>
      r.fundamentals.filter((f) => f.id === id && isMeasured(f)).map((f) => f.score),
    )
    if (graded.length) byArea[id] = medianOf(graded)
  }
  return {
    id: run[0].id,
    createdAt: run[0].createdAt,
    to: run[run.length - 1].createdAt,
    overall,
    status: statusOf(overall),
    byArea,
    scoringVersion: scoringVersionOf(run[0]),
    serves: run.length,
    low: Math.min(...scores),
    high: Math.max(...scores),
  }
}

/**
 * Whether two trips, live or recorded, are the same visit: one rubric, and
 * their spans touching. The serve type is the caller's to match.
 */
export const sameVisit = (
  a: { scoringVersion: number; from: number; to: number },
  b: { scoringVersion: number; from: number; to: number },
): boolean => a.scoringVersion === b.scoringVersion && a.from <= b.to && b.from <= a.to

/**
 * Live trips with the season ledger's (L3.3) folded in, oldest first.
 *
 * A recorded trip whose reports are all gone joins as it was written. Where a
 * record and live reports describe one visit, the one with more serves wins,
 * and live on a tie: the record is the whole trip when the oldest of its
 * reports were pruned, and the live serves are the truth when nothing was.
 * `ledger` must already be the caller's serve type.
 */
export function withLedger(live: TripPoint[], ledger: readonly TripRecord[]): TripPoint[] {
  const span = (t: TripPoint) => ({ scoringVersion: t.scoringVersion, from: t.createdAt, to: t.to })
  const out = [...live]
  for (const r of ledger) {
    const clashes = out.filter((t) => sameVisit(span(t), r))
    if (clashes.some((t) => t.serves >= r.serves)) continue
    for (const t of clashes) out.splice(out.indexOf(t), 1)
    out.push({
      id: r.id,
      createdAt: r.from,
      to: r.to,
      overall: r.median,
      status: statusOf(r.median),
      byArea: { ...r.byArea } as Record<string, number>,
      scoringVersion: r.scoringVersion,
      serves: r.serves,
      low: r.low,
      high: r.high,
    })
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

/**
 * The best trip among those of `MIN_TRIP_SERVES` or more, once there are two
 * to choose between. Ties go to the earlier trip: the record was set the
 * first time it was reached.
 */
function bestOf(eraTrips: TripPoint[]): TripPoint | undefined {
  const full = eraTrips.filter((t) => t.serves >= MIN_TRIP_SERVES)
  if (full.length < 2) return undefined
  return full.reduce((a, b) => (b.overall > a.overall ? b : a))
}

/**
 * The day a trip is named by in a headline: "today", a weekday within the
 * last week, or a date beyond that, where a weekday would be ambiguous.
 */
export function tripDay(at: number, now: number = Date.now()): string {
  const day = (t: number) => new Date(t).toDateString()
  if (day(at) === day(now)) return 'today'
  if (now - at < 6 * 24 * 60 * 60 * 1000) return new Date(at).toLocaleDateString(undefined, { weekday: 'long' })
  return shortDate(at)
}

/**
 * What a trip's serves ran over, in words — or nothing for a trip of one,
 * which has no range to give.
 */
export function tripRangeLine(trip: Pick<TripPoint, 'serves' | 'low' | 'high'>): string | undefined {
  if (trip.serves < 2) return undefined
  return trip.low === trip.high
    ? `your ${trip.serves} serves all scored ${trip.low}`
    : `your ${trip.serves} serves ran ${trip.low}–${trip.high}`
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
 * Confined to the current rubric era, for the reason every other comparison
 * in this file is: the score on the far side of a recalibration is not a fair
 * "before" for the score it produced.
 *
 * Trip against trip (L3.2): the era's first trip of `MIN_TRIP_SERVES` or more
 * against its latest, each by its median. A single first serve as the
 * "before" let one lucky or unlucky take decide the whole sentence.
 */
export function sixWeekMilestone(progress: Progress): string | undefined {
  const full = currentRubricEra(progress.trips).filter((t) => t.serves >= MIN_TRIP_SERVES)
  if (full.length < 2) return undefined
  const first = full[0]
  const latest = full[full.length - 1]
  if (latest.createdAt - first.createdAt < MILESTONE_SPAN_MS) return undefined

  const weeks = Math.floor((latest.createdAt - first.createdAt) / (7 * 24 * 60 * 60 * 1000))
  const delta = latest.overall - first.overall
  if (Math.abs(delta) < REAL_CHANGE.trip) {
    return `${weeks} weeks in, a typical serve scores ${latest.overall} — about where you started.`
  }
  return delta > 0
    ? `${weeks} weeks in: a typical serve scored ${first.overall} on ${shortDate(first.createdAt)}, and ${latest.overall} on ${shortDate(latest.createdAt)}.`
    : `${weeks} weeks in: a typical serve scores ${latest.overall}, down from ${first.overall} on ${shortDate(first.createdAt)}.`
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
 *
 * Each delta carries whether the two graded the same rows in that area
 * (`readAlike`, L3.1), which decides the floor its chip is held to.
 */
export function deltasAgainst(
  fundamentals: Pick<Fundamental, 'id' | 'score' | 'metrics'>[],
  previous?: Session,
  scoringVersion?: number,
): Record<string, AreaChange> {
  if (!previous) return {}
  if (scoringVersion !== undefined && scoringVersionOf(previous) !== scoringVersion) return {}
  // Only between two areas that were both graded (L1.1): a delta out of or
  // into an empty area is the clip changing, not the serve.
  const before = Object.fromEntries(previous.fundamentals.filter(isMeasured).map((f) => [f.id, f.score]))
  const out: Record<string, AreaChange> = {}
  for (const f of fundamentals) {
    if (isMeasured(f) && f.id in before) {
      out[f.id] = { delta: f.score - before[f.id], alike: readAlike(fundamentals, previous.fundamentals, f.id) }
    }
  }
  return out
}

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
 * The same join for the racket's lay-back — see `rotationMove`.
 *
 * A second function rather than a second return value, because the two ask
 * genuinely different questions and refuse for different reasons: one follows
 * the fault the player was told about, the other a reading nothing grades. A
 * trip where the named fault held still while the racket moved is exactly the
 * case worth seeing, and one function returning both would invite a caller to
 * treat them as a pair.
 */
export function rotationMoveOnTrip(
  history: Session[],
  current: ComparableServe,
): RotationMove | undefined {
  const previous = previousOnTrip(history, current, sameTrip)
  return previous ? rotationMove(previous, current) : undefined
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
 * Which joint warnings keep coming back, across this player's recent trips.
 *
 * The join between `recurringStrain`, which counts flags and knows nothing about
 * when anybody went to the court, and `tripsOf`, which is the threshold this
 * file owns — the same split `faultMoveOnTrip` above uses, and for the same
 * reason: the analysis layer does not import the history layer.
 *
 * Not confined to a serve type or a rubric era, unlike every record in this
 * file. Those confinements exist because a score is only comparable against the
 * bands it was graded under, and a re-scored history would otherwise produce a
 * record nothing can beat. A joint has the same range on a kick serve as on a
 * flat one, `injuriesIn` reads its flags against absolute limits for exactly
 * that reason, and a back that folded under the old rubric folded.
 */
export function recurringStrainOf(
  sessions: Session[],
  gapMs = MIN_THEN_AND_NOW_GAP_MS,
): StrainRecord[] {
  return recurringStrain(tripsOf(sessions, gapMs))
}

/**
 * The one recurring warning worth saying on the glance, or nothing.
 *
 * Gated twice, and both gates matter. It has to be a live recurring pattern —
 * `recurringStrain`'s own floor, window and per-flag denominator — AND the serve
 * just hit has to have raised it. The second gate is what keeps this from being
 * a nag: a warning about a back that did not fold on the serve in front of
 * somebody is a non-sequitur between serves, and the glance is the one screen
 * where a sentence nobody asked for costs a serve not hit.
 *
 * One flag, never a list. `recurringStrain` already sorts worst-recurring first,
 * and a second warning on this screen would be the report arriving in pieces.
 *
 * Silent on a refused clip for free: `triage` returns an empty `injury_risk` on
 * anything it rejects, so `raised` is empty and there is nothing to match.
 */
export function glanceStrain(
  sessions: Session[],
  current: Pick<Session, 'triage'>,
  gapMs = MIN_THEN_AND_NOW_GAP_MS,
): StrainRecord | undefined {
  const raised = new Set((current.triage?.injury_risk ?? []).map((r) => r.flag))
  if (raised.size === 0) return undefined
  return recurringStrainOf(sessions, gapMs).find((r) => raised.has(r.flag))
}

/**
 * What each joint warning did on the trips before one particular serve.
 *
 * The join `Report.tsx` needs: a map from flag to the sentence that goes under
 * its card, keyed so the screen never has to know what a trip is. Cut at the
 * viewed serve's own trip rather than at today, so a report reopened next month
 * still says what was true when it was filed — the same correctness `bestGapLine`
 * had to be redesigned to get, and the reason this takes `at` rather than
 * reading `Date.now()`.
 *
 * Excludes the viewed serve's whole trip, not just the serve: `strainBehind`
 * counts what came before, and a second serve from the same afternoon is the
 * same afternoon.
 */
export function strainBehindOf(
  sessions: Session[],
  at: number,
  gapMs = MIN_THEN_AND_NOW_GAP_MS,
): Partial<Record<InjuryFlag, { trips: number; of: number }>> {
  const trips = tripsOf(sessions, gapMs)
  // Every trip that finished before the viewed serve's own began. A trip is
  // "before" when its newest serve is, which is what `tripsOf`'s own chaining
  // makes true of every serve in it.
  const before = trips.filter((trip) => trip.every((s) => !sameTrip(s, { createdAt: at }, gapMs) && s.createdAt < at))

  const out: Partial<Record<InjuryFlag, { trips: number; of: number }>> = {}
  for (const flag of Object.keys(INJURY_INPUTS) as InjuryFlag[]) {
    const found = strainBehind(before, flag)
    if (found) out[flag] = found
  }
  return out
}

/**
 * Which of those warnings have stopped. The same join, the other direction.
 *
 * Separate from `recurringStrainOf` rather than one call returning both, because
 * the two answers are drawn differently and rendered under different conditions,
 * and a caller wanting only the warning should not have to compute the rest.
 * `tripsOf` is cheap and both memoise on the same `sessions` reference.
 */
export function clearedStrainOf(
  sessions: Session[],
  gapMs = MIN_THEN_AND_NOW_GAP_MS,
): StrainCleared[] {
  return clearedStrain(tripsOf(sessions, gapMs))
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

/** What a practice session needs to count as a visit. */
export interface Visitable {
  createdAt: number
  updatedAt: number
  lines: readonly unknown[]
}

/**
 * The longest gap that keeps a streak, by how often the player plays (L3.6):
 * the cadence and a few days over, so a trip moved by a weekend does not break
 * it. Weekly is the nine days the streak always allowed.
 */
export const CADENCE_GAP_MS: Record<Cadence, number> = {
  weekly: STREAK_GAP_MS,
  fortnightly: 18 * 24 * 60 * 60 * 1000,
  monthly: 38 * 24 * 60 * 60 * 1000,
}

/** The cadence as the streak line says it. */
export const CADENCE_WORDS: Record<Cadence, string> = {
  weekly: 'roughly weekly',
  fortnightly: 'roughly every two weeks',
  monthly: 'roughly monthly',
}

/** How a streak is counted: the ledger and practice sessions beside the reports, and the cadence. */
export interface StreakContext {
  ledger?: readonly TripRecord[]
  /** Set in Settings; inferred from the visits when absent. */
  cadence?: Cadence
  practice?: readonly Visitable[]
}

/** Visits the cadence is read off, at most: the player's habit now, not last year's. */
const CADENCE_WINDOW = 8

/**
 * How often this player gets to a court, from the median gap between their
 * last visits (L3.6). A median, so one missed fortnight does not turn a weekly
 * player monthly. Weekly until there are three visits to read a gap from.
 */
export function inferCadence(
  sessions: Session[],
  ledger: readonly TripRecord[] = [],
  practice: readonly Visitable[] = [],
): Cadence {
  const visits = visitSpans(sessions, ledger, practice).slice(-CADENCE_WINDOW)
  if (visits.length < 3) return 'weekly'
  const gaps = visits.slice(1).map((v, i) => v.from - visits[i].from).sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]
  const days = median / (24 * 60 * 60 * 1000)
  return days <= 10 ? 'weekly' : days <= 21 ? 'fortnightly' : 'monthly'
}

function streakTerms(sessions: Session[], ctx: StreakContext) {
  const ledger = ctx.ledger ?? []
  const practice = ctx.practice ?? []
  // A stored value this build does not know is no answer at all.
  const cadence = ctx.cadence && ctx.cadence in CADENCE_GAP_MS ? ctx.cadence : inferCadence(sessions, ledger, practice)
  return { cadence, gap: CADENCE_GAP_MS[cadence], ledger, practice }
}

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
  /** The season ledger (L3.3): visits whose reports were pruned still count. */
  ledger: readonly TripRecord[] = [],
  /** Practice sessions (L3.6): a long clip read is a visit too. */
  practice: readonly Visitable[] = [],
): number {
  const visits = visitSpans(sessions, ledger, practice)
  if (visits.length === 0) return 0
  const latest = visits[visits.length - 1]
  if (now - latest.to > gapMs) return 0

  let streak = 1
  for (let i = visits.length - 1; i > 0; i--) {
    const gap = visits[i].from - visits[i - 1].to
    if (gap > gapMs) break
    streak++
  }
  return streak
}

/**
 * Every visit to the court as a span, oldest first, for the streaks: the live
 * trips, and the ledger's trips whose reports are gone (L3.3). Any serve
 * type, so recorded trips of two types on one afternoon are one visit,
 * chained by the same gap `tripsOf` uses.
 */
export function visitSpans(
  sessions: Session[],
  ledger: readonly TripRecord[],
  practice: readonly Visitable[] = [],
): { from: number; to: number }[] {
  const live = tripsOf(sessions, MIN_THEN_AND_NOW_GAP_MS).map((t) => ({
    from: t[0].createdAt,
    to: t[t.length - 1].createdAt,
  }))
  const gone = ledger
    .filter((r) => !live.some((v) => v.from <= r.to && r.from <= v.to))
    .map((r) => ({ from: r.from, to: r.to }))
  // Only a session that read a serve is a visit: a clip opened and stopped
  // before anything was read is not evidence of a trip (L3.6).
  const sessionsRead = practice
    .filter((p) => p.lines.length > 0)
    .map((p) => ({ from: p.createdAt, to: Math.max(p.createdAt, p.updatedAt) }))
  const spans = [...live, ...gone, ...sessionsRead].sort((a, b) => a.from - b.from)
  const out: { from: number; to: number }[] = []
  for (const s of spans) {
    const last = out[out.length - 1]
    if (last && s.from - last.to < MIN_THEN_AND_NOW_GAP_MS) last.to = Math.max(last.to, s.to)
    else out.push({ ...s })
  }
  return out
}

/**
 * The longest run of trips ever kept, not just the one still standing —
 * `tripStreak`'s all-time counterpart, the same "durable fact, not a live
 * one" distinction `bestConsistencyGap`/`bestTrip`
 * already draw against their own per-report readings. A current streak
 * resets to zero the moment a gap runs long; this never does, which is
 * exactly what makes it worth stating on its own during a slump rather
 * than only while the streak itself is intact.
 *
 * Walked across the whole history rather than read off `tripStreak` at
 * every point in time: the same trip boundaries, counted for the longest
 * unbroken run anywhere in them, not only the run touching `now`.
 */
export function longestStreak(
  sessions: Session[],
  gapMs = STREAK_GAP_MS,
  ledger: readonly TripRecord[] = [],
  practice: readonly Visitable[] = [],
): number {
  const visits = visitSpans(sessions, ledger, practice)
  if (visits.length === 0) return 0
  let longest = 1
  let current = 1
  for (let i = 1; i < visits.length; i++) {
    const gap = visits[i].from - visits[i - 1].to
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
export function longestStreakLine(
  sessions: Session[],
  now: number = Date.now(),
  ctx: StreakContext = {},
): string | undefined {
  const { gap, ledger, practice } = streakTerms(sessions, ctx)
  const longest = longestStreak(sessions, gap, ledger, practice)
  if (longest < 2) return undefined
  const current = tripStreak(sessions, now, gap, ledger, practice)
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
 * Silent below `GAP_CHANGE`, how far the camera alone moves one basket's gap
 * against another's (L3.1). Its own floor and a wide one: a gap is the
 * difference of the two most extreme serves in a basket, and the extremes are
 * where noise lands.
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
  if (delta === undefined || Math.abs(delta) < GAP_CHANGE) return undefined
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
export function streakLine(
  sessions: Session[],
  now: number = Date.now(),
  ctx: StreakContext = {},
): string | undefined {
  const { gap, cadence, ledger, practice } = streakTerms(sessions, ctx)
  const n = tripStreak(sessions, now, gap, ledger, practice)
  if (n < 2) return undefined
  return `${n} trips to the court in a row, ${CADENCE_WORDS[cadence]}.`
}

/**
 * The best trip so far, for a given serve type.
 *
 * Scoped by type for the same reason `bestConsistencyGap` is: the
 * fundamentals are judged against a different target band per serve type
 * (`coaching.ts`'s `SERVE_TYPES`), so a 90 on a kick serve and a 90 on a flat
 * one are graded against different rubrics, not the same claim twice.
 *
 * AND SCOPED BY RUBRIC ERA, which it was not. Every other cross-session figure
 * in this file already refuses to reach across a recalibration — `buildProgress`
 * confines its own `best` to `era`, `buildConsistencyTrend` confines its points,
 * `thenAndNow` confines its pair — and this one walked the whole history. The
 * consequence was on screen in two places at once: the home card prints
 * `progress.best`, which is era-confined, and the report prints
 * the record line off this, which was not. A player whose top score was
 * set under the old rubric therefore saw "best 72" on the home screen and "your
 * best serve so far scored 88" on the report, two numbers for one fact,
 * disagreeing — which is exactly the reading this app treats as a bug rather
 * than as a rounding difference. It is also a record nothing can ever beat,
 * because the scores that could beat it are on a different scale.
 *
 * `sessions` is sorted before `currentRubricEra` sees it: that function scans
 * from the newest backwards and is documented as requiring time order, and
 * `listSummaries` hands back newest first.
 *
 * `undefined` below two trips of `MIN_TRIP_SERVES` of the type *in the era*, the
 * same floor every other cross-session record in this file holds — one trip is
 * just that trip, not a record yet.
 */
export interface BestTrip {
  /** The trip's median overall. */
  score: number
  /** When its first and last serves were filed. */
  from: number
  to: number
}

/**
 * The best trip so far (L3.2): the highest median among the era's trips of
 * `MIN_TRIP_SERVES` or more, once there are two such trips. A record used to
 * be one serve, so a noise outlier became a record the player never saw
 * again — and on club serves the camera moves one serve further than a fixed
 * fault does.
 */
export function bestTrip(
  sessions: Session[],
  serveType: ServeType,
  ledger: readonly TripRecord[] = [],
): BestTrip | undefined {
  const oldestFirst = sessions
    .filter((s) => typeOf(s) === serveType)
    .sort((a, b) => a.createdAt - b.createdAt)
  const best = bestOf(
    currentRubricEra(
      tripPoints(
        oldestFirst,
        ledger.filter((r) => r.serveType === serveType),
      ),
    ),
  )
  return best && { score: best.overall, from: best.createdAt, to: best.to }
}

/**
 * The sentence a best-trip record becomes, matching `bestGapLine`'s own
 * restraint — the number is left to say whether it was good, not told to.
 * `viewedAt` is the report on screen; inside the record trip, the trip is
 * this one.
 */
export function bestTripLine(record: BestTrip, viewedAt: number): string {
  return viewedAt >= record.from && viewedAt <= record.to
    ? `Your best trip yet: a typical serve scored ${record.score}.`
    : `Your best trip so far: a typical serve scored ${record.score}, on ${shortDate(record.from)}.`
}

/**
 * The best-trip record stated plainly, for `bestGapEverLine`'s reason: the
 * progress sheet has no single report on screen to ask "is *this* the one".
 */
export function bestTripEverLine(record: BestTrip): string {
  return `Your best trip yet: a typical serve scored ${record.score}, on ${shortDate(record.from)}.`
}

/**
 * A score change as the chips draw it (L3.1): a status colour past the floor
 * for its scope, `flat` for a change the camera alone could have made, and
 * `soft` for one between two serves graded on different rows that is not
 * past the wider floor for that — see `changeOf`.
 *
 * The scope is required. An area's floor is not the overall's: the camera
 * moves contact and loading three times as far as it moves the overall, so a
 * chip that defaulted to the overall's line would call noise a change there.
 */
export const deltaStatus = (delta: number, scope: ChangeScope, alike = true): Status | 'flat' | 'soft' => {
  const change = changeOf(delta, scope, alike)
  return change === 'same' ? 'flat' : change === 'soft' ? 'soft' : change === 'up' ? 'great' : 'work'
}

/** One serve's overall against the last one's, and whether the two were graded alike. */
export type ScoreMove = AreaChange

/**
 * This serve's overall against the serve before it, for the glance (L3.1).
 *
 * The same `previous` the report's hero is handed, so the two screens never
 * disagree about which serve "your last serve" is. Refused across a change of
 * rubric for the reason `buildProgress` refuses one: the difference would be
 * the recalibration.
 */
export function scoreMoveAgainst(
  current: Pick<Analysis, 'overall' | 'fundamentals'>,
  rubric: number,
  previous: Session | undefined,
): ScoreMove | undefined {
  if (!previous || scoringVersionOf(previous) !== rubric) return undefined
  return { delta: current.overall - previous.overall, alike: readAlike(current.fundamentals, previous.fundamentals) }
}

/**
 * What goes beside the overall's chip: the soft chip declines to compare, and
 * "vs your last serve" beside it would read as a verdict of no change.
 */
export const scoreMoveCaption = (move: ScoreMove): string =>
  deltaStatus(move.delta, 'overall', move.alike) === 'soft'
    ? 'measured differently from your last serve'
    : 'vs your last serve'

/**
 * The same move in words, for the glance read aloud. A digit is said only
 * when the chip would print one: "about the same" for a move the camera makes
 * on its own, which is what stops a player on a fence hearing 68 and then 74
 * and taking the six points home.
 */
export function scoreMoveWords(move: ScoreMove): string {
  switch (deltaStatus(move.delta, 'overall', move.alike)) {
    case 'great':
      return `up ${move.delta} on your last serve`
    case 'work':
      return `down ${-move.delta} on your last serve`
    case 'soft':
      return 'measured differently from your last serve'
    default:
      return 'about the same as your last serve'
  }
}

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

/* ------------------------------------------------ a trip, for somebody else -- */

/**
 * What one trip to the court amounted to, from stored reports only.
 *
 * R58's content, decided separately from R58's drawing — the same split R49 took
 * for the ghost, and for the same reason: what is honest to say about a trip is
 * the hard part, and a decision taken inside a canvas call is a decision nobody
 * can test.
 *
 * **EVERY FIELD SURVIVES A REOPENED REPORT WITH NO CLIP**, which R58 claims and
 * which is checked here rather than assumed. That is the whole reason this can
 * be a card at all: a coach is shown it days later, on a phone that threw the
 * video away the moment it finished reading it.
 *
 * A TRIP, NOT A BASKET, and that is the difference from `renderBasketCard`.
 * `Consistency` is one clip swept; this is every report filed within one visit,
 * which is what somebody means when they say how it went on Tuesday.
 */
export interface TripSummary {
  /** When the trip started — its oldest report. */
  from: number
  /** Reports filed on it. Never fewer than one. */
  serves: number
  /** Best and worst overall on the trip, and which serve each was. */
  best: { id: string; overall: number }
  worst: { id: string; overall: number }
  /**
   * The tightest best-against-worst gap any basket on this trip managed.
   *
   * Absent when nothing on the trip was swept — a trip of single serves has no
   * repeatability reading at all, and inventing one from the spread of separate
   * clips would be comparing serves the app never compared.
   */
  tightestGap?: number
  /**
   * What the player was asked to work on, taken from the trip's LAST report.
   *
   * The last rather than the most common, because that is the instruction they
   * left with. A trip whose fault changed partway through is a trip where the
   * earlier advice was superseded, and averaging the two would produce a
   * sentence nobody was ever given.
   */
  focus?: string
  /** Joint warnings that recur across trips and were raised on this one. */
  strain: StrainRecord[]
}

/**
 * Summarise one trip.
 *
 * `trip` must be the reports of a single visit — `tripsOf` produces them. Takes
 * the whole history too, because the strain reading is a fact about trips
 * *plural*: a warning is only worth showing when it keeps coming back, and one
 * trip cannot know that about itself.
 *
 * `undefined` for an empty trip, which is not a state `tripsOf` produces and is
 * the honest answer if a caller assembles one by hand.
 */
export function tripSummary(trip: Session[], history: Session[]): TripSummary | undefined {
  if (trip.length === 0) return undefined
  const byTime = [...trip].sort((a, b) => a.createdAt - b.createdAt)

  let best = byTime[0]
  let worst = byTime[0]
  for (const s of byTime) {
    if (s.overall > best.overall) best = s
    if (s.overall < worst.overall) worst = s
  }

  /*
   * The tightest gap on the trip, out of whatever was actually swept.
   *
   * Read off each report's own stored `consistency`, not recomputed: the spread
   * across a basket is a comparison the app made at the time, between serves
   * from one clip. Assembling one here across separate clips would compare
   * serves nothing ever compared, on a trip where the camera may have moved
   * between them.
   */
  const gaps = byTime
    .map((s) => s.consistency?.gap)
    .filter((g): g is NonNullable<typeof g> => !!g)
    .map((g) => Math.abs(g.bestScore - g.worstScore))

  /*
   * The strain reading is the one field that needs more than this trip, and it
   * is filtered to what this trip actually raised — a warning that recurs across
   * a season but was silent on Tuesday has no business on Tuesday's card.
   */
  const raised = new Set(
    byTime.flatMap((s) => (s.triage?.injury_risk ?? []).map((i) => i.flag)),
  )

  return {
    from: byTime[0].createdAt,
    serves: byTime.length,
    best: { id: best.id, overall: best.overall },
    worst: { id: worst.id, overall: worst.overall },
    tightestGap: gaps.length ? Math.min(...gaps) : undefined,
    focus: byTime[byTime.length - 1].focus?.title,
    strain: recurringStrainOf(history).filter((r) => raised.has(r.flag)),
  }
}

/* ------------------------------------------------ what the misses share (D5.2) */

/** Serves needed on each side before a difference between them is worth a sentence. */
export const MIN_SERVES_EACH_SIDE = 5

/**
 * How each graded reading reads when the misses had more of it, and less.
 *
 * Only the readings the engine grades and names faults from. The hip lead and
 * the forearm turn are measured and never named (`UNDER_RESOLVED`), so a gap in
 * them would be the first thing the app ever said about either, arriving
 * through a side door.
 */
const MISS_PHRASE: Record<string, { more: string; less: string }> = {
  toss_drift_ratio: { more: 'the toss wandering further', less: 'the toss steadier' },
  toss_peak_ratio: { more: 'the toss higher', less: 'the toss lower' },
  contact_height_ratio: { more: 'contact higher', less: 'contact lower' },
  drop_depth_ratio: { more: 'the racket hand lower behind you', less: 'the racket hand higher behind you' },
  elbow_lift_ratio: { more: 'the elbow higher at the drop', less: 'the elbow lower at the drop' },
  leg_drive_rise_ratio: { more: 'more push from the legs', less: 'less push from the legs' },
  spine_lean_deg: { more: 'more sideways lean', less: 'less sideways lean' },
  palm_to_sky_deg: { more: 'the palm turned further up', less: 'the palm turned less' },
  separation_deg: { more: 'more coil at the trophy', less: 'less coil at the trophy' },
}

const MISS_WHERE: Record<Exclude<ServeOutcome, 'in'>, string> = {
  net: 'into the net',
  long: 'that went long',
  wide: 'that went wide',
}

export interface MissPattern {
  /** The miss the serves were tagged with. */
  miss: Exclude<ServeOutcome, 'in'>
  signal: string
  /** Mean over the misses minus mean over the serves that went in, in the signal's units. */
  gap: number
  /** The gap over its own standard error: how far past chance it sits. */
  strength: number
  inServes: number
  missServes: number
  /** One sentence, in the copy rules' voice. */
  line: string
}

/**
 * What the player's serves of one kind of miss have in common, against the
 * serves they tagged as in.
 *
 * Said only when it would survive a sceptic, because R56 named the trap when
 * the taps were added: "your toss drifts more on the serves you miss" is a
 * correlation, and over six points it is noise with a sentence attached. So,
 * for each graded reading and each kind of miss:
 *
 *   - at least `MIN_SERVES_EACH_SIDE` tagged serves on each side;
 *   - one serve type, and one rubric era, so neither the bands nor the engine
 *     moved under the comparison;
 *   - a gap wider than that reading's `NOISE_FLOOR`, so it is bigger than the
 *     camera alone moves it between takes of one serve; and
 *   - a gap at least twice its own standard error, so it is bigger than the
 *     player's own serve-to-serve spread would make it by chance.
 *
 * The strongest pattern per kind of miss, strongest first. Nothing at all is
 * the common answer, and the right one, for most histories.
 */
export function missesInCommon(
  sessions: Session[],
  tags: readonly ServeTag[],
  serveType?: ServeType,
): MissPattern[] {
  const type = serveType ?? dominantType(sessions)
  const tagged = new Map(tags.map((t) => [t.id, t.outcome]))
  const era = currentRubricEra(
    sessions
      .filter((s) => typeOf(s) === type && s.triage?.status !== 'rejected' && s.diagnosis)
      .sort((a, b) => a.createdAt - b.createdAt),
  ).filter((s) => tagged.get(s.id) !== undefined)

  const inServes = era.filter((s) => tagged.get(s.id) === 'in')
  const out: MissPattern[] = []
  for (const miss of ['net', 'long', 'wide'] as const) {
    const missed = era.filter((s) => tagged.get(s.id) === miss)
    let best: MissPattern | undefined
    for (const [signal, phrase] of Object.entries(MISS_PHRASE)) {
      const a = inServes.map((s) => s.diagnosis!.signals[signal]).filter(Number.isFinite)
      const b = missed.map((s) => s.diagnosis!.signals[signal]).filter(Number.isFinite)
      if (a.length < MIN_SERVES_EACH_SIDE || b.length < MIN_SERVES_EACH_SIDE) continue
      const gap = mean(b) - mean(a)
      const variance = (xs: number[]) => xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1)
      const error = Math.sqrt(variance(a) / a.length + variance(b) / b.length)
      const strength = Math.abs(gap) / Math.max(error, 1e-9)
      if (Math.abs(gap) < (NOISE_FLOOR[signal] ?? Number.POSITIVE_INFINITY) || strength < 2) continue
      if (best && strength <= best.strength) continue
      best = {
        miss,
        signal,
        gap,
        strength: Math.round(strength * 10) / 10,
        inServes: a.length,
        missServes: b.length,
        line: cue(`Your serves ${MISS_WHERE[miss]} had ${gap > 0 ? phrase.more : phrase.less}.`),
      }
    }
    if (best) out.push(best)
  }
  return out.sort((x, y) => y.strength - x.strength)
}

/* -------------------------------------- first and second serves apart (D5.3) */

/** Outcome taps needed before an in-rate is printed: below this it is anecdote. */
export const MIN_OUTCOMES_FOR_RATE = 5

export interface ServeNumberSummary {
  serveNumber: 1 | 2
  /** Reports tagged with this serve number, of this type, in this rubric era. */
  serves: number
  /** Their mean overall score. */
  average: number
  /** Of those with an outcome tapped, how many went in. */
  inServes: number
  outcomes: number
}

/**
 * First serves and second serves, kept apart (D5.3).
 *
 * A second serve is meant to be safer, slower and spun, so its score and its
 * in-rate answer a different question from a first serve's; averaged together
 * they answer neither. Only the serves the player tagged with a number, one
 * serve type, one rubric era — the same rules every other figure on the
 * progress screen keeps.
 */
export function byServeNumber(
  sessions: Session[],
  tags: readonly ServeTag[],
  serveType?: ServeType,
): ServeNumberSummary[] {
  const type = serveType ?? dominantType(sessions)
  const byId = new Map(tags.map((t) => [t.id, t]))
  const era = currentRubricEra(
    sessions
      .filter((s) => typeOf(s) === type && s.triage?.status !== 'rejected')
      .sort((a, b) => a.createdAt - b.createdAt),
  )
  const out: ServeNumberSummary[] = []
  for (const n of [1, 2] as const) {
    const these = era.filter((s) => byId.get(s.id)?.serveNumber === n)
    if (!these.length) continue
    const outcomes = these.map((s) => byId.get(s.id)?.outcome).filter((o) => o !== undefined)
    out.push({
      serveNumber: n,
      serves: these.length,
      average: Math.round(mean(these.map((s) => s.overall))),
      inServes: outcomes.filter((o) => o === 'in').length,
      outcomes: outcomes.length,
    })
  }
  return out
}

/* --------------------------------------- the second serve that slows (L5.8) */

export interface SecondServeTempo {
  /** Mean racket-drop-to-contact time over the tagged first serves, ms. */
  firstMs: number
  /** The same over the tagged second serves, ms. */
  secondMs: number
  firstServes: number
  secondServes: number
  /** One sentence, in the copy rules' voice. */
  line: string
}

/**
 * Whether the player swings their second serve slower than their first, from
 * the racket drop to the ball (L5.8).
 *
 * Good servers do not: the racket travels about as fast on a second serve as
 * on a first, and the safety comes from the spin and the path (Chow 2003;
 * Sheets 2011). A club player's second serve that is safer because it is
 * slower is pushed in, the habit that ball is meant to replace.
 *
 * Said only past the camera and the player's own spread, the rules
 * `missesInCommon` keeps:
 *
 *   - `MIN_SERVES_EACH_SIDE` tagged serves of each number, each with a
 *     drop-to-contact time the card trusts;
 *   - one rubric era, so the engine did not move under the comparison. Every
 *     serve type, unlike the rest of this screen: a time is not judged on a
 *     type's band, and a second serve is usually a different type;
 *   - slower by more than one take's camera noise on this reading
 *     (`CARD_NOISE_SD.dropToContact`, measured on the Bath serves by
 *     `realiseReal`); and
 *   - slower by twice the gap's standard error, with each side's spread held
 *     to at least that noise, so a few lucky-steady serves cannot shrink it.
 *
 * A faster second serve is not a fault and says nothing.
 */
export function secondServeSlower(sessions: Session[], tags: readonly ServeTag[]): SecondServeTempo | undefined {
  const number = new Map(tags.map((t) => [t.id, t.serveNumber]))
  const era = currentRubricEra(
    sessions.filter((s) => s.triage?.status !== 'rejected').sort((a, b) => a.createdAt - b.createdAt),
  )
  const timeOf = (s: Session) => {
    const row = s.fundamentals.flatMap((f) => f.metrics ?? []).find((m) => m.id === 'dropToContact')
    return row && Number.isFinite(row.value) && (row.confidence ?? 0) >= MIN_EVIDENCE ? row.value : undefined
  }
  const times = (n: 1 | 2) =>
    era.filter((s) => number.get(s.id) === n).map(timeOf).filter((v): v is number => v !== undefined)
  const first = times(1)
  const second = times(2)
  if (first.length < MIN_SERVES_EACH_SIDE || second.length < MIN_SERVES_EACH_SIDE) return undefined

  const noise = CARD_NOISE_SD.dropToContact
  const spread = (xs: number[]) => Math.max(noise ** 2, xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / (xs.length - 1))
  const gap = mean(second) - mean(first)
  const error = Math.sqrt(spread(first) / first.length + spread(second) / second.length)
  if (gap < noise || gap < 2 * error) return undefined
  return {
    firstMs: Math.round(mean(first)),
    secondMs: Math.round(mean(second)),
    firstServes: first.length,
    secondServes: second.length,
    line: cue(
      // No number: the copy rules keep raw measurements off the screen. The
      // two times are on the result for anything that wants to draw them.
      'Your second serve swings **a beat slower** from the racket drop to the ball. Swing it as fast as your first; spin keeps it in.',
    ),
  }
}

export interface InRate {
  serveType: ServeType
  inServes: number
  outcomes: number
}

/**
 * How often each serve type went in, from the player's own taps (D5.3).
 *
 * Every era, unlike the scores: where the ball landed does not change when the
 * rubric does. A type appears only once it has `MIN_OUTCOMES_FOR_RATE` taps.
 */
export function inRateByType(sessions: Session[], tags: readonly ServeTag[]): InRate[] {
  const outcome = new Map(tags.map((t) => [t.id, t.outcome]))
  const out: InRate[] = []
  for (const type of ['flat', 'kick', 'slice'] as const) {
    const said = sessions
      .filter((s) => typeOf(s) === type)
      .map((s) => outcome.get(s.id))
      .filter((o) => o !== undefined)
    if (said.length < MIN_OUTCOMES_FOR_RATE) continue
    out.push({ serveType: type, inServes: said.filter((o) => o === 'in').length, outcomes: said.length })
  }
  return out
}

/* ----------------------------------------------- serves per week (D5.4) */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface WeekCount {
  /** Start of the week, local midnight on Monday. */
  start: number
  serves: number
}

/** Local midnight on the Monday of the week holding `t`. */
function weekStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/**
 * Serves filmed in each of the last `weeks` weeks, oldest first, this week
 * last — empty weeks included, because a week off is part of the count.
 *
 * Every report is a serve, refused ones too: the arm served whether or not the
 * camera could read it. So is every serve a practice session found, read or
 * not (L2.8): a forty-serve session is forty serves, not one report.
 */
export function servesPerWeek(
  sessions: Session[],
  now: number = Date.now(),
  weeks = 8,
  practice: readonly Pick<PracticeSession, 'createdAt' | 'found'>[] = [],
): WeekCount[] {
  const thisWeek = weekStart(now)
  const out: WeekCount[] = []
  for (let k = weeks - 1; k >= 0; k--) {
    const d = new Date(thisWeek)
    d.setDate(d.getDate() - 7 * k)
    out.push({ start: d.getTime(), serves: 0 })
  }
  for (const s of sessions) {
    const w = weekStart(s.createdAt)
    const slot = out.find((o) => o.start === w)
    if (slot) slot.serves++
  }
  for (const p of practice) {
    const slot = out.find((o) => o.start === weekStart(p.createdAt))
    if (slot) slot.serves += p.found?.length ?? 0
  }
  return out
}

/**
 * One plain sentence when this week's count is well above the four before it.
 *
 * A count and nothing more: the app cannot see how hard anybody served, how
 * long they rested or what their shoulder feels like, and a load warning built
 * from a tally of clips would be a medical claim it has no business making.
 * Said when the week is at least half again the recent average and at least
 * ten serves over it, so a jump from two to four is not news; and only with
 * four earlier weeks that had any serves at all to be a baseline.
 */
export function weekJumpLine(weeks: WeekCount[]): string | undefined {
  if (weeks.length < 5) return undefined
  const current = weeks[weeks.length - 1].serves
  const before = weeks.slice(-5, -1).map((w) => w.serves)
  if (before.some((n) => n === 0)) return undefined
  const usual = mean(before)
  if (current < usual * 1.5 || current - usual < 10) return undefined
  return cue(
    `You have filmed ${current} serves this week, against about ${Math.round(usual)} in each of the four before.`,
  )
}

/* ------------------------------------------------- progress by fault (D6.6) */

/** How many recent serves a fault's trend is read across. */
export const FAULT_WINDOW = 10

export interface FaultTrend {
  flaw: FlawId
  /** The fault as the report names it. */
  title: string
  /** Serves in the window it was named on, and how many could be judged on it. */
  named: number
  judged: number
  /** Named less often in the newer half of the window than the older, or more. */
  direction: 'fewer' | 'same' | 'more'
  /** The ladder step the player is on for it, when it has a ladder. */
  step?: { at: number; of: number }
  /** Named (true) or clean on each judged serve, oldest first: the strip on Progress draws it (N4.3). */
  sequence: boolean[]
}

/**
 * Each fault the engine named in the player's recent serves, and whether it is
 * being named less (D6.6).
 *
 * A fault counts on a serve only when the serve could be judged on it — the
 * finding exists and its evidence cleared the bar — so a clip where the hand was
 * never seen does not count as a clean serve, the same rule `checkDrill` keeps.
 * One serve type, one rubric era, the last `FAULT_WINDOW` serves. "Fewer" and
 * "more" need the two halves of the window to differ by two serves or more;
 * one serve either way is a coin.
 */
export function faultTrends(
  sessions: Session[],
  rungs?: Partial<Record<string, number>>,
  serveType?: ServeType,
): FaultTrend[] {
  const type = serveType ?? dominantType(sessions)
  const recent = currentRubricEra(
    sessions
      .filter((s) => typeOf(s) === type && s.triage?.status === 'ok' && s.diagnosis)
      .sort((a, b) => a.createdAt - b.createdAt),
  ).slice(-FAULT_WINDOW)
  const flaws = new Set(recent.flatMap((s) => s.diagnosis!.flaws.filter((f) => f.detected).map((f) => f.flaw)))
  const out: FaultTrend[] = []
  for (const flaw of flaws) {
    const verdicts = recent
      .map((s) => s.diagnosis!.flaws.find((f) => f.flaw === flaw))
      .filter((f) => f !== undefined && f.confidence >= MIN_EVIDENCE)
      .map((f) => f!.detected)
    if (!verdicts.length) continue
    const half = Math.floor(verdicts.length / 2)
    const older = verdicts.slice(0, half).filter(Boolean).length
    const newer = verdicts.slice(verdicts.length - half).filter(Boolean).length
    const ladder = progressionFor(flaw)
    const stored = rungs?.[flaw]
    out.push({
      flaw,
      title: VERDICT_TABLES.flaws[flaw].title,
      named: verdicts.filter(Boolean).length,
      judged: verdicts.length,
      direction: newer <= older - 2 ? 'fewer' : newer >= older + 2 ? 'more' : 'same',
      sequence: verdicts,
      step:
        ladder && stored !== undefined && Number.isInteger(stored) && stored >= 0 && stored < ladder.steps.length
          ? { at: stored + 1, of: ladder.steps.length }
          : undefined,
    })
  }
  return out.sort((a, b) => b.named - a.named)
}
