/**
 * The joint warning that keeps coming back.
 *
 * `triage` raises an injury flag on the serve in front of it, the report prints
 * it, and that is where the whole subject has ended until now. But a wrist is
 * not hurt by one serve. It is hurt by the same mechanics repeated across a
 * season, and a warning that appears on one report, is read once, and is gone by
 * the next clip is exactly the shape of warning a player dismisses. Every flag
 * this app has ever raised is already sitting in storage on the report that
 * raised it, and nothing has ever read them together.
 *
 * COUNTED IN TRIPS, NOT IN SERVES. A player who films eight serves in one
 * afternoon and folds their back on six of them has one bad afternoon, not six
 * pieces of evidence — the serves inside a trip are the same body, the same
 * warm-up and the same fatigue, so counting them separately would turn one
 * observation into a number that looks like six. A trip counts once, whether it
 * carried one flagged serve or nine. `progress.ts` owns what a trip is; this
 * module is handed them already cut, the same way `carryForward` is handed
 * `sameTrip`, so the analysis layer never has to import the history layer.
 *
 * THE DENOMINATOR IS PER FLAG, AND IT IS THE HARD PART. "Your back folded on 4
 * of your last 6 trips" is only true if the other 2 trips actually showed a back
 * that did not fold. A refused clip raises no flags at all, and a clip whose
 * spine landed behind another player raises none either — in both cases the
 * absence of a flag means "nobody looked", not "nothing there". Counting those
 * trips in the denominator would quietly manufacture good news, which is the
 * house rule (never report confidence the pipeline does not have) inverted and
 * pointed at the one subject where being wrong costs a joint. So a trip only
 * enters a flag's denominator when at least one serve on it was measured AND
 * carried every signal that flag is read from — `INJURY_INPUTS` in `triage.ts`,
 * the same table `injuriesIn` guards itself with.
 *
 * STILL LIVE, OR SILENT. A pattern last seen five trips ago is a thing somebody
 * has already fixed, and repeating it forever would train a player to scroll
 * past the one part of this app that is about their body rather than their
 * score. A flag has to have appeared on the most recent measured trip or the one
 * before it to be worth a sentence.
 *
 * NOT A DIAGNOSIS AND NOT A CLOCK. This counts how often a flag was raised. It
 * does not know whether anything hurts, it cannot see a session that was never
 * filmed, and a player who serves twice a week and films once a month has a
 * history this can only under-count. It never says "you will be injured" and it
 * never softens what it did see, and those two restraints are the whole design.
 */
import { INJURY_INPUTS, injuryInputsRead, type InjuryFlag, type Triage } from './triage'
import { SEVERITY_RANK, worseSeverity, type Severity } from './tiers'

/**
 * Everything this needs off a stored report, and nothing else.
 *
 * Structural rather than `Session` so the analysis layer keeps not importing the
 * storage layer, and so a test can build one in four lines.
 */
export interface StrainSource {
  triage?: Pick<Triage, 'status' | 'injury_risk'>
  diagnosis?: { signals: Record<string, number> }
}

export interface StrainRecord {
  flag: InjuryFlag
  /** Trips in the window where at least one measured serve raised the flag. */
  trips: number
  /**
   * Trips in the window that could have raised it — measured, with this flag's
   * own inputs readable on at least one serve. Never smaller than `trips`.
   */
  of: number
  /** The worst severity the flag was ever raised at inside the window. */
  severity: Severity
  /** Measured trips since it was last raised. 0 is the most recent trip. */
  tripsSince: number
}

/**
 * How far back this looks, in trips that could have answered the question.
 *
 * Six rather than a span of weeks: the question is "how often, lately", and a
 * player who goes to the court twice a week and one who goes monthly both want
 * that answered over their own recent history rather than over a calendar that
 * knows nothing about how much they play.
 */
export const STRAIN_WINDOW = 6

/**
 * Twice before it is a pattern.
 *
 * One trip is the report's own job — it already printed the flag that day, in
 * full, with the mechanics spelled out. Repeating a single occurrence here as a
 * second, graver-looking sentence would be the app raising its voice at the same
 * evidence.
 */
export const MIN_STRAIN_TRIPS = 2

/** Trips back a flag may last have been raised and still count as live. */
const MAX_TRIPS_SINCE = 1

/**
 * Which joint warnings keep recurring, worst-recurring first.
 *
 * `trips` is oldest trip first — the order `tripsOf` returns. Empty for a
 * history with nothing recurring, which is most histories, and that silence is
 * the intended common case rather than a gap to fill.
 */
export function recurringStrain(trips: readonly (readonly StrainSource[])[]): StrainRecord[] {
  const flags = Object.keys(INJURY_INPUTS) as InjuryFlag[]
  const out: StrainRecord[] = []

  for (const flag of flags) {
    // Only the trips that could have answered for THIS flag, newest first. A
    // window counted before this filter would be six trips of which two were
    // silhouettes, and the sentence would then be about a denominator that
    // included them.
    const answerable = trips.filter((trip) => trip.some((s) => couldRaise(s, flag))).slice(-STRAIN_WINDOW)
    if (answerable.length < MIN_STRAIN_TRIPS) continue

    let seen = 0
    let severity: Severity | undefined
    let lastIndex = -1
    answerable.forEach((trip, i) => {
      const worst = worstOn(trip, flag)
      if (!worst) return
      seen++
      lastIndex = i
      severity = severity ? worseSeverity(severity, worst) : worst
    })

    if (seen < MIN_STRAIN_TRIPS || !severity) continue
    const tripsSince = answerable.length - 1 - lastIndex
    if (tripsSince > MAX_TRIPS_SINCE) continue

    out.push({ flag, trips: seen, of: answerable.length, severity, tripsSince })
  }

  // Most trips first, then most recent, then worst — a flag on four of six trips
  // is a louder fact than a worse one on two, because the count is the whole
  // reason this module exists.
  return out.sort(
    (a, b) =>
      b.trips - a.trips ||
      a.tripsSince - b.tripsSince ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  )
}

/** Whether one serve was measured well enough to have raised this flag. */
function couldRaise(s: StrainSource, flag: InjuryFlag): boolean {
  if (s.triage?.status !== 'ok') return false
  return injuryInputsRead(s.diagnosis?.signals, flag)
}

/** The worst severity this flag was raised at on one trip, or nothing. */
function worstOn(trip: readonly StrainSource[], flag: InjuryFlag): Severity | undefined {
  let worst: Severity | undefined
  for (const s of trip) {
    if (s.triage?.status !== 'ok') continue
    for (const risk of s.triage.injury_risk ?? []) {
      if (risk.flag !== flag) continue
      worst = worst ? worseSeverity(worst, risk.severity) : risk.severity
    }
  }
  return worst
}
