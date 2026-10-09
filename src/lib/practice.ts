import { FUNDAMENTALS, SERVE_TYPES, metricCopy } from './analysis/coaching'
import { drillForMetric } from './analysis/progressions'
import { SOFT_MEASUREMENT } from './analysis/confidence'
import { mean } from './analysis/geometry'
import { rowChange } from './analysis/realChange'
import { cue } from './analysis/voice'
import type { Drill, FundamentalId } from './analysis/types'
import {
  buildConsistencyTrend,
  currentRubricEra,
  dominantType,
  tripsOf,
  typeOf,
} from './progress'
import type { PracticeLog, Session } from './storage/db'
import type { ServeType } from './storage/prefs'

export type Verdict = 'improving' | 'stuck' | 'slipping'

export interface PracticeFocus {
  metricId: string
  label: string
  fundamentalId: FundamentalId
  fundamentalLabel: string
  drill: Drill
  /** This metric's score in each session considered, oldest first. */
  scores: number[]
  average: number
  /** How many of those sessions had this as their single weakest measurement. */
  timesWeakest: number
  sessionsConsidered: number
  /** Later sessions minus earlier ones. Undefined when there are too few to say. */
  trend?: number
  verdict: Verdict
  /** The most recent advice given for it, so the card can say what to change. */
  fix?: string
  /**
   * Which serve this advice is about.
   *
   * Named rather than implied. Advice can legitimately be about a serve the
   * player is not currently filming — somebody with two months of flat serves who
   * has just tried one kick gets flat-serve advice, because that is where the
   * history is. "Across your last five serves" would then be quietly wrong, and
   * wrong in a way that makes the player doubt the rest of it.
   */
  serveType: ServeType
  /**
   * The element that came out least repeatable in more than one basket.
   *
   * A different question from the rest of this object, and the reason it is
   * here. Everything above ranks by score, so a measurement that lands in its
   * band on average is invisible however far it moves around inside it — and for
   * a club player that wandering is usually the thing actually costing them
   * points. The app has been computing this since the sweep started being
   * stored and printing it only on the trend screen, two taps from the card that
   * tells them what to practise.
   *
   * `same` says whether it is the measurement this focus already names, which is
   * the difference between a second thing to do and a stronger reason to do the
   * first one.
   *
   * Absent until the same element has topped that list in at least two baskets;
   * one basket's least steady element is just that basket's, which the report
   * already said.
   */
  repeatability?: { id: string; label: string; sessions: number; same: boolean }
  /**
   * How many times the player marked this drill done, inside the same window.
   *
   * Zero and undefined are different answers and both are kept. Zero means the
   * card has been asking and nothing has been logged; undefined means this
   * history has no drill records at all, which is every history before the
   * button existed and every player who has never used it. Telling the second
   * group they have not been drilling would be the app inventing a fact about
   * somebody from its own missing feature.
   */
  drilled?: number
}

/**
 * How to refer to each serve in a sentence.
 *
 * Read off `SERVE_TYPES` rather than restated here, which it was. Two tables
 * naming one thing is how "Showing your flat / first serve serves only" reached
 * a screen: this file had the right word and `App.tsx`, which had no way to know
 * that, sliced the chip label instead.
 */
const SERVE_WORD = (type: ServeType): string => SERVE_TYPES[type].word

/**
 * How many recent trips to the court a practice recommendation looks across.
 *
 * TRIPS, NOT SESSIONS, and it counted sessions until R38. The difference is the
 * whole point of having a window: this advice is about what is *still* wrong on
 * the next visit, and five sessions could be filled entirely by one afternoon.
 * That became the ordinary case rather than the unlucky one when R18 made the
 * coached live preview the default way in on a phone — record, glance, record —
 * so a player who films five serves in one basket had a window holding one
 * visit's own variance, and was told a measurement "has not moved in 5
 * sessions" on the strength of five serves hit ten minutes apart. The headline
 * that grows out of that window sends somebody to a coach.
 *
 * Five stays the number. A window of five trips spanning a month is what the
 * doc comment below has always described.
 */
export const PRACTICE_WINDOW = 5

/**
 * Work out what is actually worth practising, across sessions rather than within one.
 *
 * A single report picks the weakest thing in that serve, which on any given day
 * might just be the serve you happened to film. What a coach notices is the
 * thing that is *still* wrong three weeks later. So this ranks by the lowest
 * average across recent *trips to the court* rather than by whoever lost the
 * most recent report, and then says whether it is actually moving — because
 * being told to work on the same thing forever, with no sense of whether it is
 * working, is the fastest way to stop bothering.
 *
 * Trips rather than reports is what makes "still wrong three weeks later" a
 * claim about three weeks. See `PRACTICE_WINDOW`.
 *
 * Only metrics present in every session considered are eligible: one that
 * appears intermittently (contact depth needs a side-on view) would otherwise
 * be compared on an uneven number of readings.
 */
export function findPracticeFocus(
  sessions: Session[],
  /** How many trips to the court to look across — see `PRACTICE_WINDOW`. */
  windowSize = PRACTICE_WINDOW,
  serveType?: ServeType,
  /**
   * Every drill the player has marked done, or nothing if this app has never
   * been asked to keep any.
   *
   * An empty array and an absent one mean different things and are treated
   * differently all the way to the sentence on the card — see
   * `PracticeFocus.drilled`.
   */
  logs?: PracticeLog[],
  /** Which rung of each fault's ladder the player is on (`Prefs.ladder`). */
  rungs?: Partial<Record<string, number>>,
): PracticeFocus | undefined {
  if (sessions.length === 0) return undefined

  // One serve type at a time, for the same reason the trend chart is: the target
  // bands differ, so a kick serve and a flat one score their contact depth
  // against different targets. Averaging across both would rank a measurement by
  // which serve happened to be filmed more often.
  // Same choice the trend chart makes, so the two never disagree about which
  // serve the player is being told about.
  const type = serveType ?? dominantType(sessions)

  // `listSessions` returns newest first; work oldest → newest.
  const sameServe = sessions
    .filter((s) => typeOf(s) === type)
    .sort((a, b) => a.createdAt - b.createdAt)

  /*
   * One rubric at a time, for the same reason the trend chart is — and here it
   * decides what the player practises, not just what a chip says.
   *
   * A saved report keeps no frames, so a recalibration leaves two sets of scores
   * in one history permanently. Averaging a measurement across that break makes
   * the recalibration look like the player: a racket drop that never moved comes
   * out "improving" because the newer half was scored more generously, which
   * retires the drill that was actually working. Worse, the ranking itself moves,
   * so the app changes its mind about what to work on for a reason that has
   * nothing to do with the serve.
   *
   * Trimmed before the window rather than after, so five trips are counted
   * from the era rather than the era being whatever survives five trips.
   */
  /*
   * The last `windowSize` trips to the court, flattened back into serves.
   *
   * Every serve on those trips counts, not the last `windowSize` serves — see
   * `PRACTICE_WINDOW`. Two consequences worth naming rather than discovering:
   *
   *   · A player on their first visit still gets advice. One trip is all the
   *     history there is, so the window is that trip and the floor below stays
   *     what it always was — two comparable serves. Nothing here withholds the
   *     card until somebody has come back twice; it only stops one visit
   *     crowding out the four before it.
   *   · The `eligible` filter below gets stricter, because a metric now has to
   *     appear in every serve of every trip in the window rather than in each
   *     of five. That is the existing rule meeting more evidence, not a new
   *     one: a measurement that needs a side-on view and did not get one is
   *     exactly what it was written to exclude, and averaging it over an uneven
   *     number of readings is the thing it refuses to do.
   */
  const recent = tripsOf(currentRubricEra(sameServe))
    .slice(-windowSize)
    .flat()

  // Fewer than two comparable serves says nothing worth saying — the same answer
  // a player gets on their first day, which is honest: after a recalibration the
  // history behind them cannot be spoken about on this scale, and `sessionsConsidered`
  // below counts only what the headline is allowed to claim.
  if (recent.length < 2) return undefined

  type Row = {
    scores: number[]
    label: string
    fundamentalId: FundamentalId
    weakest: number
    fix?: string
  }
  const rows = new Map<string, Row>()

  for (const session of recent) {
    // An imported backup can carry a fundamental this version has never heard
    // of; it survives `normalise` by design, but recommending practice for it
    // would reach for a label and a drill that do not exist here.
    const all = session.fundamentals
      .filter((f) => f.id in FUNDAMENTALS)
      .flatMap((f) => f.metrics.map((m) => ({ metric: m, fundamentalId: f.id })))
      // Only readings the card stood behind (L1.6), the rule `pickFocus` and
      // the plan follow: a number marked approximate on a serve is not evidence
      // that it is the season's weakest. A reading soft on any serve in the
      // window then fails the every-serve rule below and drops out.
      .filter(({ metric }) => (metric.confidence ?? 1) >= SOFT_MEASUREMENT)
    if (!all.length) continue

    const weakestId = [...all].sort((a, b) => a.metric.score - b.metric.score)[0].metric.id

    for (const { metric, fundamentalId } of all) {
      const row =
        rows.get(metric.id) ??
        { scores: [], label: metric.label, fundamentalId, weakest: 0, fix: undefined }
      row.scores.push(metric.score)
      if (metric.id === weakestId) row.weakest++
      // Keep the latest advice, which is the one that still applies.
      if (metric.fix) row.fix = metric.fix
      rows.set(metric.id, row)
    }
  }

  const eligible = [...rows.entries()]
    .filter(([, r]) => r.scores.length === recent.length)
    .map(([id, r]) => ({ id, ...r, average: mean(r.scores) }))
    .sort((a, b) => a.average - b.average)

  const pick = eligible[0]
  if (!pick) return undefined

  // Compare the newer half against the older half rather than first-vs-last, so
  // one unusually good or bad serve at either end does not decide the verdict.
  const half = Math.floor(pick.scores.length / 2)
  const older = pick.scores.slice(0, half)
  const newer = pick.scores.slice(pick.scores.length - half)
  const trend = half >= 1 ? Math.round(mean(newer) - mean(older)) : undefined

  // Held to how far the camera alone moves this row's mean over that many
  // serves a side (L3.1). One row moves much further than a whole area does,
  // and some rows far further than others, so the line is the row's own.
  const verdict: Verdict =
    trend === undefined || Math.abs(trend) < rowChange(pick.id, pick.fundamentalId, half)
      ? 'stuck'
      : trend > 0
        ? 'improving'
        : 'slipping'

  const fundamental = FUNDAMENTALS[pick.fundamentalId]

  // Read off the same trend the progress screen draws, rather than re-derived
  // here from the stored spreads. Two functions with their own opinion about
  // which element is least repeatable would eventually disagree, on two screens
  // the player can hold open at once.
  const recurring = buildConsistencyTrend(sessions, type)?.recurring

  return {
    metricId: pick.id,
    label: pick.label,
    fundamentalId: pick.fundamentalId,
    fundamentalLabel: fundamental.label,
    // The measurement's own corrective first. A player told for three weeks to
    // work on their racket drop should be handed the drop drill, not the area's
    // general swing session that also spends reps on things they already do.
    // From one source since L1.4: a row that is a fault's number hands out that
    // fault's ladder on the player's rung, the same step the report's plan
    // shows, and the serve type's own drill where it has one.
    drill: drillForMetric(pick.id, metricCopy(pick.id, type)?.drill ?? fundamental.drill, rungs).drill,
    scores: pick.scores,
    average: Math.round(pick.average),
    timesWeakest: pick.weakest,
    sessionsConsidered: recent.length,
    trend,
    verdict,
    fix: pick.fix,
    serveType: type,
    repeatability: recurring
      ? { ...recurring, same: recurring.id === pick.id }
      : undefined,
    // Counted from the first serve in the window rather than over all time. The
    // claim the card makes is about this run of sessions, and a drill done last
    // winter is not evidence about a measurement that has been flat since May.
    drilled: logs
      ? logs.filter((l) => l.metricId === pick.id && l.doneAt >= recent[0].createdAt).length
      : undefined,
  }
}

/**
 * What to groove, as opposed to what to fix.
 *
 * A second sentence rather than a second drill. The card already carries one
 * instruction and one drill, and the ranked plan on the report is where more
 * than one thing to do belongs; this says which measurement wanders, which is a
 * different claim about the same serve and often about a different measurement
 * entirely.
 *
 * Empty when there is nothing to add, so the caller can drop the line rather
 * than print a hedge.
 */
export function repeatabilityNote(f: PracticeFocus): string {
  const r = f.repeatability
  if (!r) return ''
  const baskets = `${r.sessions} baskets`

  if (r.same) {
    // The same measurement failing both tests. Worth saying plainly: it is the
    // strongest case this app can make for spending a session on one thing.
    return cue(`It also moves more than anything else you do, in ${baskets}. Both point the same way.`)
  }
  /*
   * Rewritten twice by C5's audit, and the second time is the real finding.
   *
   * It read "…moves more than anything else you do, in N of your baskets. Groove
   * it once this is fixed." The passive clause was the first catch. The second
   * was worse: **the sentence was already over the twenty-five word cap in
   * production**, because `r.label` is interpolated and the longest real label is
   * "Hitting the ball at its peak" — six words against the two in "Racket drop".
   * At that label the old line ran twenty-seven words and nothing had ever
   * counted them.
   *
   * Caught because nothing was reading it at all. This function assembles its
   * sentence at runtime from parts, so it is in no table for `copy.test.ts` and
   * in no component for `jsxCopy.test.ts`. That gap is what the audit turned up;
   * the over-cap line is what was sitting in it.
   *
   * So it is shorter, active, and points at the other thing plainly rather than
   * saying "this" — which could have meant the measurement the sentence has just
   * been about. Checked against the longest label the app can produce, not a
   * convenient one.
   */
  /*
   * NO POSSESSIVE IN FRONT OF THE LABEL, and the canary is what showed why.
   *
   * It read "Your ${label} …". `METRICS` labels are not all noun phrases — the
   * longest is "Hitting the ball at its peak" — so a player whose least steady
   * element is that one was reading **"Your hitting the ball at its peak scores
   * fine"**, which is not a sentence. Two words of the label made it invisible in
   * every fixture anybody had tried.
   *
   * The label leads instead, in its own capitalisation, which reads correctly
   * either way: "Racket drop scores fine…" and "Hitting the ball at its peak
   * scores fine…".
   */
  return cue(`${r.label} scores fine but varies most, across ${baskets}. Groove it after you fix the one above.`)
}

/**
 * A count of drills, said the way somebody would say it.
 *
 * `voice.ts` lints length, hedging and lab jargon and has no opinion about
 * grammar, so "drilled it 1 times" passed every check the build makes and
 * reached a real screen. One and two get words because that is how a sentence
 * about doing a drill twice is spoken; past that the digit reads better than
 * "seventeen times".
 */
const times = (n: number): string =>
  n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`

/** The line at the top of the practice card. */
export function practiceHeadline(f: PracticeFocus): string {
  const across = `across your last ${f.sessionsConsidered} ${SERVE_WORD(f.serveType)} serves`
  /*
   * The label leads, in its own capitalisation, and never after "Your" (L1.5).
   * The fix `repeatabilityNote` below made for the same bug, which this
   * function kept: "Your tossing arm stays up has lost 4 serves" was on
   * screen, and "lost serves" never said what had happened.
   */
  const it = f.label

  if (f.verdict === 'improving') {
    // Said differently when the player has been putting the work in, because
    // "keep going" to somebody who has logged four sessions of it is the app
    // failing to notice.
    if (f.drilled) {
      return cue(`${it} is moving, and you have drilled it ${times(f.drilled)}. That is the drill working.`)
    }
    return cue(`${it} still trails ${across}, but it moves in the right direction. Keep going.`)
  }
  if (f.verdict === 'slipping') {
    return cue(`${it} has gone backwards ${across}. Take it back to basics now.`)
  }

  /*
   * Stuck, which is the case this whole record exists to split in two.
   *
   * Drilled and not moving is a fact about the drill: the player has done the
   * work and the measurement has not answered, so telling them to spend more
   * time here is the wrong instruction and, repeated for long enough, is how
   * somebody stops opening the app. Never logged is a fact about nothing yet.
   *
   * `drilled === undefined` — a history with no records in it at all — takes
   * neither branch, because the app not having been asked to keep any is not
   * evidence that the player has not been drilling.
   */
  /*
   * A coach only once the drill has had a fair go (L1.5). Two logged sessions
   * is a week of practice, and sending somebody away after it gives up on the
   * ladder before its easier steps were tried; slowing the drill down is what a
   * coach would say first anyway.
   */
  if (f.drilled && f.drilled >= COACH_AFTER_DRILLS) {
    return cue(`${it} has not moved after ${times(f.drilled)} of its drill. Take this one to a coach.`)
  }
  if (f.drilled) {
    return cue(`${it} has not moved after ${times(f.drilled)} of its drill. Do it at half pace, then film again.`)
  }
  if (f.drilled === 0 && f.timesWeakest >= 2) {
    return cue(`${it} was your weakest reading on ${f.timesWeakest} serves, and you have not logged its drill. Start there.`)
  }
  if (f.timesWeakest >= Math.ceil(f.sessionsConsidered / 2)) {
    return cue(`${it} was your weakest reading on ${f.timesWeakest} of your last ${f.sessionsConsidered} ${SERVE_WORD(f.serveType)} serves. Start here.`)
  }
  return cue(`${it} scores lowest ${across} and has not moved. Start here.`)
}

/** Logged sessions of a drill before a stuck reading is sent to a coach. */
export const COACH_AFTER_DRILLS = 4
