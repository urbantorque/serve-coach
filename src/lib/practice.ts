import { FUNDAMENTALS, METRICS } from './analysis/coaching'
import { mean } from './analysis/geometry'
import { cue } from './analysis/voice'
import type { Drill, FundamentalId } from './analysis/types'
import { MEANINGFUL_DELTA, buildConsistencyTrend, currentRubricEra, dominantType, typeOf } from './progress'
import type { Session } from './storage/db'
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
}

/** How to refer to each serve in a sentence. */
const SERVE_WORD: Record<ServeType, string> = {
  flat: 'flat',
  kick: 'kick',
  slice: 'slice',
}

/** How many recent sessions a practice recommendation looks across. */
export const PRACTICE_WINDOW = 5

/**
 * Work out what is actually worth practising, across sessions rather than within one.
 *
 * A single report picks the weakest thing in that serve, which on any given day
 * might just be the serve you happened to film. What a coach notices is the
 * thing that is *still* wrong three weeks later. So this ranks by the lowest
 * average across recent sessions rather than by whoever lost the most recent
 * report, and then says whether it is actually moving — because being told to
 * work on the same thing forever, with no sense of whether it is working, is the
 * fastest way to stop bothering.
 *
 * Only metrics present in every session considered are eligible: one that
 * appears intermittently (contact depth needs a side-on view) would otherwise
 * be compared on an uneven number of readings.
 */
export function findPracticeFocus(
  sessions: Session[],
  windowSize = PRACTICE_WINDOW,
  serveType?: ServeType,
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
   * Trimmed before the window rather than after, so five sessions are counted
   * from the era rather than the era being whatever survives five sessions.
   */
  const recent = currentRubricEra(sameServe).slice(-windowSize)

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

  const verdict: Verdict =
    trend === undefined || Math.abs(trend) < MEANINGFUL_DELTA
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
    drill: METRICS[pick.id]?.drill ?? fundamental.drill,
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
  const baskets = `${r.sessions} of your baskets`

  if (r.same) {
    // The same measurement failing both tests. Worth saying plainly: it is the
    // strongest case this app can make for spending a session on one thing.
    return cue(`It also moves more than anything else you do, in ${baskets}. Both point the same way.`)
  }
  return cue(`Your ${r.label.toLowerCase()} scores fine and moves more than anything else you do, in ${baskets}. Groove it once this is fixed.`)
}

/** The line at the top of the practice card. */
export function practiceHeadline(f: PracticeFocus): string {
  const across = `across your last ${f.sessionsConsidered} ${SERVE_WORD[f.serveType]} serves`
  const it = f.label.toLowerCase()

  if (f.verdict === 'improving') {
    return cue(`Your ${it} still trails ${across}, but it moves in the right direction. Keep going.`)
  }
  if (f.verdict === 'slipping') {
    return cue(`Your ${it} has gone backwards ${across}. Take it back to basics now.`)
  }
  if (f.timesWeakest >= Math.ceil(f.sessionsConsidered / 2)) {
    return cue(`Your ${it} lost ${f.timesWeakest} of your last ${f.sessionsConsidered} ${SERVE_WORD[f.serveType]} serves and has not shifted. Spend your time here.`)
  }
  return cue(`Your ${it} scores lowest ${across} and has not moved. Spend your time here.`)
}
