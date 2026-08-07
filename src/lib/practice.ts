import { FUNDAMENTALS } from './analysis/coaching'
import { mean } from './analysis/geometry'
import type { Drill, FundamentalId } from './analysis/types'
import { MEANINGFUL_DELTA, dominantType, typeOf } from './progress'
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
  const recent = sessions
    .filter((s) => typeOf(s) === type)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-windowSize)

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
    const all = session.fundamentals.flatMap((f) =>
      f.metrics.map((m) => ({ metric: m, fundamentalId: f.id })),
    )
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

  return {
    metricId: pick.id,
    label: pick.label,
    fundamentalId: pick.fundamentalId,
    fundamentalLabel: fundamental.label,
    drill: fundamental.drill,
    scores: pick.scores,
    average: Math.round(pick.average),
    timesWeakest: pick.weakest,
    sessionsConsidered: recent.length,
    trend,
    verdict,
    fix: pick.fix,
    serveType: type,
  }
}

/** The sentence at the top of the practice card. */
export function practiceHeadline(f: PracticeFocus): string {
  const across = `across your last ${f.sessionsConsidered} ${SERVE_WORD[f.serveType]} serves`

  if (f.verdict === 'improving') {
    return `Your ${f.label.toLowerCase()} is still the weakest part of your serve ${across}, but it is moving in the right direction. Keep at it.`
  }
  if (f.verdict === 'slipping') {
    return `Your ${f.label.toLowerCase()} has gone backwards ${across}. Worth taking back to basics before it settles in.`
  }
  if (f.timesWeakest >= Math.ceil(f.sessionsConsidered / 2)) {
    return `Your ${f.label.toLowerCase()} has been the weakest part of ${f.timesWeakest} of your last ${f.sessionsConsidered} ${SERVE_WORD[f.serveType]} serves, and it has not shifted. This is the one to put time into.`
  }
  return `Your ${f.label.toLowerCase()} is the lowest-scoring part of your serve ${across} and has not moved. This is the one to put time into.`
}
