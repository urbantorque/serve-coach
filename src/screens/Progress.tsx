import { useEffect, useMemo, useState } from 'react'
import FramePair, { type PairPosition } from '../components/FramePair'
import PracticeCard from '../components/PracticeCard'
import SeasonShareButton from '../components/SeasonShareButton'
import TripShareButton from '../components/TripShareButton'
import { DeltaBars, DeltaChip, GapTrend, ScoreTrend, TrendTable } from '../components/Trend'
import { Icon } from '../components/primitives'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import { strainClearedLine, strainLine } from '../lib/analysis/verdict'
import type { PracticeFocus } from '../lib/practice'
import {
  MIN_OUTCOMES_FOR_RATE,
  byServeNumber,
  faultTrends,
  inRateByType,
  servesPerWeek,
  weekJumpLine,
  bestConsistencyGap,
  bestGapEverLine,
  bestTrip,
  bestTripEverLine,
  buildConsistencyTrend,
  buildProgress,
  clearedStrainOf,
  gapDeltaLine,
  longestStreakLine,
  recurringStrainOf,
  shortDate,
  sixWeekMilestone,
  streakLine,
  thenAndNow,
  tripDay,
  tripRangeLine,
} from '../lib/progress'
import { KEEP_STILLS, getSession, safely, type ServeTag, type Session } from '../lib/storage/db'
import type { TripRecord } from '../lib/storage/ledger'
import type { Cadence } from '../lib/storage/prefs'
import { partLabel, servePath, type PartState } from '../lib/servePath'
import { bodyBestLine, bodyBests } from '../lib/bests'
import type { PracticeSession } from '../lib/session/session'
import { SERVE_NUMBER_LABEL } from '../lib/serveTagCopy'

/** One empty ledger for every render, so a memo keyed on it holds. */
const NO_TRIPS: TripRecord[] = []

/** A part's state as the status tags colour it: a part being worked on is not a failing grade. */
const PART_TAG: Record<PartState, string> = {
  locked: 'great',
  holding: 'good',
  working: 'fair',
  not_seen: 'none',
}

interface Props {
  sessions: Session[]
  /**
   * The season ledger (L3.3): trips whose reports were pruned, folded into the
   * trend, the records and the streaks. Empty for a seeded history.
   */
  ledger?: TripRecord[]
  /** How often the player gets to a court, when they have said (L3.6). */
  cadence?: Cadence
  /** Practice sessions, whose serves count in the weekly tally (L2.8). */
  practiceSessions?: PracticeSession[]
  /** What the player said about each serve — see `ServeTag`. */
  tags?: ServeTag[]
  /** Which rung of each fault's ladder the player is on — see `Prefs.ladder`. */
  ladder?: Partial<Record<string, number>>
  practice?: PracticeFocus
  onLogDrill: () => void
  onUndoDrill: () => void
  /**
   * The history is the dev seed, not storage — see `demoHistory` in
   * `App.tsx`. The seed carries its own pictures, so there is nothing to
   * fetch for the then-and-now pair.
   */
  seeded: boolean
  onBack: () => void
}

/**
 * Every serve so far, as a screen of its own.
 *
 * This was a bottom sheet capped at 88% of the viewport: a hero score, the
 * strain lines, the records, two share cards, the practice card, the
 * then-and-now pictures, three charts and a table, all inside a panel with a
 * grip that suggested it was a glance. It is the most substantial thing the
 * app shows after the report, and the one a returning player opens to see
 * whether the practice is working — so it gets the report's own frame: a
 * page, a back arrow, and the phone's back gesture.
 *
 * Everything it derives, it derives from `sessions` here. These selectors
 * were computed in `App.tsx` on every render of every screen for a sheet that
 * was usually closed; the two the rest of the app also needs (`practice`, and
 * the streak) are recomputed or passed in rather than shared.
 */
export default function Progress({
  sessions,
  ledger = NO_TRIPS,
  cadence,
  practiceSessions,
  tags = [],
  ladder,
  practice,
  onLogDrill,
  onUndoDrill,
  seeded,
  onBack,
}: Props) {
  const logDrill = onLogDrill
  const undoDrill = onUndoDrill

  const form = useMemo(() => buildProgress(sessions, undefined, ledger), [sessions, ledger])
  // Each part of the serve as holding or still being worked on (L3.5).
  const path = useMemo(() => servePath(sessions, ladder), [sessions, ladder])
  // Bests as body positions the newest trip reached (L3.8).
  const bests = useMemo(() => bodyBests(sessions, form?.serveType), [sessions, form])
  // Read straight off `form`, the same object Home.tsx's own copy of this call
  // is read off — a fact about the score trend this screen already draws.
  const sheetMilestone = useMemo(() => (form ? sixWeekMilestone(form) : undefined), [form])
  // Not type-restricted: a streak is about showing up at all, across every
  // serve type, the same choice `Home.tsx` makes with its own copy.
  const streak = useMemo(
    () => streakLine(sessions, Date.now(), { ledger, cadence, practice: practiceSessions }),
    [sessions, ledger, cadence, practiceSessions],
  )
  // First and second serves apart, and how often each serve type went in
  // (D5.3), from the player's own taps. Serves per week, and one plain line
  // when a week jumps (D5.4).
  const numbers = useMemo(() => byServeNumber(sessions, tags, form?.serveType), [sessions, tags, form])
  const inRates = useMemo(() => inRateByType(sessions, tags), [sessions, tags])
  const weeks = useMemo(
    () => servesPerWeek(sessions, undefined, undefined, practiceSessions),
    [sessions, practiceSessions],
  )
  const weekJump = useMemo(() => weekJumpLine(weeks), [weeks])
  // Each named fault over the recent serves, and the step of its ladder (D6.6).
  const faults = useMemo(() => faultTrends(sessions, ladder, form?.serveType), [sessions, ladder, form])
  const longestStreakText = useMemo(
    () => longestStreakLine(sessions, Date.now(), { ledger, cadence, practice: practiceSessions }),
    [sessions, ledger, cadence, practiceSessions],
  )
  // Not type-restricted and not era-restricted — see `recurringStrainOf`. A
  // joint has the same range whatever the serve was aiming at.
  const strain = useMemo(() => recurringStrainOf(sessions), [sessions])
  const strainCleared = useMemo(() => clearedStrainOf(sessions), [sessions])
  // Keyed to whatever serve type the form chart settled on, so the blocks on
  // this screen cannot end up describing different halves of the history.
  const spread = useMemo(
    () => (form ? buildConsistencyTrend(sessions, form.serveType) : undefined),
    [sessions, form],
  )
  const sheetBestGap = useMemo(() => bestConsistencyGap(spread), [spread])
  const sheetBestScore = useMemo(
    () => (form ? bestTrip(sessions, form.serveType, ledger) : undefined),
    [sessions, form, ledger],
  )
  const sheetGapDelta = useMemo(() => (spread ? gapDeltaLine(spread.gapDelta) : undefined), [spread])
  // The same facts this screen renders, worded the same way, handed to the
  // season card as strings — so the card cannot say anything this does not.
  const seasonRecords = useMemo(
    () => ({
      streak,
      longestStreak: longestStreakText,
      bestScore: sheetBestScore && bestTripEverLine(sheetBestScore),
      bestGap: sheetBestGap && bestGapEverLine(sheetBestGap),
    }),
    [streak, longestStreakText, sheetBestScore, sheetBestGap],
  )

  /**
   * The oldest serve that still has pictures, beside the newest, once both
   * have been fetched.
   *
   * Fetched rather than read off `sessions`, because `listSummaries` strips
   * the stills on the way out. Held only while this screen is mounted: two
   * full reports is twelve base64 images, and holding them for a screen
   * nobody has opened is the cost `listSummaries` exists to avoid.
   */
  const [thenNow, setThenNow] = useState<{ then: Session; now: Session; positions: PairPosition[] }>()
  useEffect(() => {
    const pick = thenAndNow(sessions, KEEP_STILLS)
    if (!pick) return
    let live = true
    void (async () => {
      const [then, now] = seeded
        ? [pick.then, pick.now]
        : await Promise.all([
            safely(() => getSession(pick.then.id), undefined),
            safely(() => getSession(pick.now.id), undefined),
          ])
      if (!live || !then || !now) return
      // Paired by keyframe id, never by index, for the reason `pairStills`
      // gives; both sides or neither, since a row with one picture compares
      // nothing.
      const positions: PairPosition[] = then.phases
        .map((p) => ({
          id: p.id,
          label: p.label,
          left: p.thumbnail,
          right: now.phases.find((q) => q.id === p.id)?.thumbnail,
        }))
        .filter((p) => p.left && p.right)
      if (positions.length) setThenNow({ then, now, positions })
    })()
    return () => {
      live = false
    }
  }, [sessions, seeded])

  return (
    <div className="screen progress-screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        {/* Not "Your form" — the home card already owns that name for the
            average of the last three serves, and this is the whole history
            behind it. Two panels titled the same thing showing different
            numbers is the one thing a player will read as a bug. */}
        <h1 className="t-overline topbar-title">Every serve so far</h1>
        <span className="topbar-spacer" aria-hidden="true" />
      </header>

      {form && form.points.length > 1 ? (
        <div className="progress-sheet">
          {/* The latest trip, not the latest serve (L3.2): its median, the
              range its serves ran over, and the change against the trip
              before when both had enough serves to stand for themselves. One
              serve moves further on camera noise than a fixed fault moves
              it, so a single serve was a headline that could not show
              progress. */}
          <div className="progress-summary">
            <span className="progress-hero tnum">{form.latestTrip.overall}</span>
            <span className="progress-unit">
              <span>
                typical {SERVE_TYPES[form.serveType].word} serve, {tripDay(form.latestTrip.createdAt)}
                {tripRangeLine(form.latestTrip) && (
                  <>
                    <br />
                    {tripRangeLine(form.latestTrip)}
                  </>
                )}
              </span>
              {form.tripDelta !== undefined && (
                <span className="hero-delta">
                  <DeltaChip delta={form.tripDelta} scope="trip" />
                  <span>vs your last trip</span>
                </span>
              )}
            </span>
          </div>

          {/* The serve path (L3.5): progress as parts that hold, rather than
              as points the camera moves by as much. Under the headline score
              because it is the other half of the same answer. */}
          {path && (
            <section className="block">
              <h2 className="block-title">Your serve path</h2>
              <p className="path-headline">{path.headline}</p>
              <ol className="path">
                {path.parts.map((part) => (
                  <li key={part.group} className={`path-part path-part--${part.state}`}>
                    <span className="path-name">{part.name.charAt(0).toUpperCase() + part.name.slice(1)}</span>
                    <em className={`tag tag--${PART_TAG[part.state]}`}>{partLabel(part)}</em>
                    {part.slipped && <span className="path-slipped">{part.slipped}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Above the records rather than below them, and above the charts,
              because it is the one thing on this sheet that is about the
              player's body rather than their score — and because a warning
              filed underneath a celebration reads as a footnote to it.

              Plain sentences in the same block furniture every other section
              here uses, not the report's `.injury` card. That card carries an
              icon, a title and the mechanics because it is explaining a fault
              on the serve in front of you; this is a count, the explanation
              already happened on each of those reports, and reproducing the
              card would restate three paragraphs to add one number. */}
          {(strain.length > 0 || strainCleared.length > 0) && (
            <section className="block">
              {/* Named for what the block actually contains. A player with
                  nothing recurring and one thing fixed should not read a
                  heading about things coming back, and a player with both
                  gets the heading for the half that needs acting on — the
                  warnings lead, the cleared lines read as the counterpoint
                  underneath rather than softening them. */}
              <h2 className="block-title">
                {strain.length > 0 ? 'What keeps coming back' : 'What has stopped'}
              </h2>
              {strain.map((record) => {
                const line = strainLine(record)
                return line ? (
                  <p key={record.flag} className="strain-line">
                    {line}
                  </p>
                ) : null
              })}
              {strainCleared.map((record) => {
                const line = strainClearedLine(record)
                return line ? (
                  <p key={record.flag} className="strain-line strain-line--clear">
                    {line}
                  </p>
                ) : null
              })}
            </section>
          )}

          {/* Facts about the whole journey rather than about form —
              which is what the rest of this sheet (the trend, the delta
              bars, the repeatability chart) is otherwise entirely about.
              Each was added incrementally and reasoned, on its own, not to
              need its own heading — but read together, with all of them
              present, several unlabelled sentences in a row stopped reading
              as a group and started reading as a wall of text. This gives
              them the same overline every sibling section on this sheet
              already has, and nothing else changes: same lines, same
              order, same conditions. Guarded on the whole cluster so a
              player short of every record never sees a heading over
              nothing. */}
          {(streak || longestStreakText || sheetBestScore || bests.length > 0) && (
            <section className="block">
              <h2 className="block-title">Your records</h2>
              {bests.map((b) => (
                <p key={b.metricId} className="progress-foot">
                  {bodyBestLine(b)}
                </p>
              ))}
              {streak && <p className="progress-foot">{streak}</p>}
              {longestStreakText && <p className="progress-foot">{longestStreakText}</p>}
              {sheetBestScore && <p className="progress-foot">{bestTripEverLine(sheetBestScore)}</p>}
            </section>
          )}

          {/* The faults themselves, beside the measurements the charts below are
              about: whether the thing the reports keep naming is being named
              less. Counted only on serves that could be judged for it. */}
          {faults.length > 0 && (
            <section className="block">
              <h2 className="block-title">Faults over your last serves</h2>
              {faults.map((f) => (
                <p key={f.flaw} className="progress-foot">
                  <strong>{f.title}</strong>: named on {f.named} of {f.judged} serves
                  {f.direction === 'fewer' ? ', less often lately' : f.direction === 'more' ? ', more often lately' : ''}
                  {f.step ? `. On step ${f.step.at} of ${f.step.of}.` : '.'}
                </p>
              ))}
            </section>
          )}

          {/* Kept apart because a second serve is meant to be safer, slower
              and spun: averaged with first serves, its score and its in-rate
              answer neither question. Only serves the player tagged. */}
          {(numbers.length > 0 || inRates.length > 0) && (
            <section className="block">
              <h2 className="block-title">First and second serves</h2>
              {numbers.map((n) => (
                <p key={n.serveNumber} className="progress-foot">
                  {SERVE_NUMBER_LABEL[n.serveNumber]}s: {n.serves} tagged, averaging {n.average}
                  {n.outcomes >= MIN_OUTCOMES_FOR_RATE
                    ? `, in on ${n.inServes} of the ${n.outcomes} you said where they landed.`
                    : '.'}
                </p>
              ))}
              {inRates.map((r) => (
                <p key={r.serveType} className="progress-foot">
                  {SERVE_TYPES[r.serveType].label}: in on {r.inServes} of {r.outcomes} tagged.
                </p>
              ))}
            </section>
          )}

          {/* A count, never a load warning: the app cannot see how hard anybody
              served or what their shoulder feels like. Shown once there are two
              weeks of serves to set side by side. */}
          {weeks.filter((w) => w.serves > 0).length >= 2 && (
            <section className="block">
              <h2 className="block-title">Serves per week</h2>
              <p className="progress-foot tnum">
                This week {weeks[weeks.length - 1].serves}. The four before:{' '}
                {weeks
                  .slice(-5, -1)
                  .map((w) => w.serves)
                  .join(', ')}
                .
              </p>
              {weekJump && <p className="sheet-note">{weekJump}</p>}
            </section>
          )}

          {/* Every record this sheet already shows, in one image — see
              `renderSeasonCard`. Placed with the records it shares rather
              than at the bottom of the sheet with the table, so the
              button sits next to the exact facts it is about. */}
          <SeasonShareButton records={seasonRecords} />
          {/* The last trip, as one image. Beside the season card rather than
              on the report, because a trip is a run of serves and the report
              is one — and because this is where the spread and the strain
              line the card draws are already on screen. */}
          <TripShareButton sessions={sessions} strainLine={strain.map(strainLine).find(Boolean) ?? undefined} />

          {/* Said out loud rather than left as a gap in the chart. Somebody who
              has filmed twenty serves and sees eleven plotted will assume the
              app lost the rest. */}
          {form.setAside > 0 && (
            <p className="progress-aside">
              Showing your {SERVE_TYPES[form.serveType].word} serves only.{' '}
              {form.setAside} other {form.setAside === 1 ? 'serve is' : 'serves are'} scored
              against different targets, so mixing them in would look like a change in form.
            </p>
          )}

          {practice && (
            <PracticeCard
              focus={practice}
              onLogDrill={logDrill}
              onUndoDrill={practice.drilled ? undoDrill : undefined}
            />
          )}

          {/* Then against now. A chart says the number went from 58 to 66; it
              cannot show that the racket now falls behind the back where it
              used to stop at the shoulder, which is the thing somebody wants
              after six weeks of the same drill. */}
          {thenNow && (
            <FramePair
              heading="Then, and now"
              leftCaption={shortDate(thenNow.then.createdAt)}
              rightCaption={shortDate(thenNow.now.createdAt)}
              positions={thenNow.positions}
            />
          )}

          <section className="block">
            <h2 className="block-title">Typical score by trip</h2>
            <ScoreTrend points={form.trips} />
            {/* The sentence the chart above never states in words: `form`
                already carries everything `sixWeekMilestone` needs, and
                the home card already shows this same sentence — this
                screen, built specifically to look back across a whole
                history, had the chart but not the reading of it. */}
            {sheetMilestone && <p className="sheet-note">{sheetMilestone}</p>}
          </section>

          {form.areaDeltas.length > 0 && (
            <section className="block">
              <h2 className="block-title">Change since your last serve</h2>
              <DeltaBars deltas={form.areaDeltas} />
            </section>
          )}

          {/* The long loop: not whether one serve scored higher, but whether
              the serves are converging on each other. Only appears once the
              sweep has been run on more than one clip, because a single
              basket is a reading rather than a trend. */}
          {spread && spread.points.length > 1 && (
            <section className="block">
              {/* No summary chip on the head. The rows already show the
                  direction, and a chip here would be one more number in a
                  sheet that already carries the hero score, its own chip, a
                  sparkline and a value per fundamental. */}
              {/* "Repeatable" is the one word this app uses for the idea, on
                  the report and here. It was "gap" in this heading and
                  "steadier" in the chart's own note — three names for one
                  thing the player is meant to be tracking. */}
              <h2 className="block-title">How repeatable, over time</h2>
              <GapTrend points={spread.points} />
              {/* buildConsistencyTrend has computed this since it was
                  written; the chart above never said it in words. */}
              {sheetGapDelta && <p className="sheet-note">{sheetGapDelta}</p>}
              {spread.recurring && (
                <p className="sheet-note">
                  {spread.recurring.label} has been your least repeatable part in{' '}
                  {spread.recurring.sessions} of these. That is the one to practise most.
                </p>
              )}
              {/* Read straight off the trend this section already draws —
                  one number this chart's own shape already contains, not a
                  second computation that could disagree with it. */}
              {sheetBestGap && <p className="sheet-note">{bestGapEverLine(sheetBestGap)}</p>}
            </section>
          )}

          <details className="progress-table">
            <summary>See the numbers as a table</summary>
            <TrendTable points={form.trips} />
          </details>
        </div>
      ) : (
        // Reachable with nothing to show now — the installed icon's shortcut
        // opens this screen directly — so it says what fills it and offers
        // the way there, rather than a sentence with nothing to press.
        <div className="progress-empty">
          <p className="sheet-empty">
            Analyse two serves and this will show whether your changes are working.
          </p>
          <button className="btn btn--primary btn--full" onClick={onBack}>
            <Icon name="film" size={18} />
            Analyse a serve
          </button>
        </div>
      )}
    </div>
  )
}
