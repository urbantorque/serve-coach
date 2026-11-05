import { Suspense, lazy, useMemo, useState } from 'react'
import '../styles/blocks.css'
import '../styles/depth.css'
import '../styles/report.css'
import '../styles/progress.css'
import PracticeCard from '../components/PracticeCard'
import ProgressShare from '../components/ProgressShare'
import { DeltaChip, DeltaBars, GapTrend, TrendTable } from '../components/Trend'
import { Cue, Icon, Sheet } from '../components/primitives'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import { strainClearedLine, strainLine } from '../lib/analysis/verdict'
import type { PracticeFocus } from '../lib/practice'
import {
  MIN_OUTCOMES_FOR_RATE,
  byServeNumber,
  missesInCommon,
  secondServeSlower,
  faultTrends,
  inRateByType,
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
  sixWeekMilestone,
  streakLine,
  tripDay,
  tripRangeLine,
  tripsOf,
  thenAndNow,
} from '../lib/progress'
import { tagsById, type ServeTag, type Session } from '../lib/storage/db'
import type { TripRecord } from '../lib/storage/ledger'
import type { Cadence } from '../lib/storage/prefs'
import { partLabel, servePath, type PartState } from '../lib/servePath'
import { bodyBestLine, bodyBests } from '../lib/bests'
import { fastestServe, speedByServeNumber, speedByTrip, speedTrend } from '../lib/speedTrend'
import SpeedTrips from '../components/SpeedTrips'
import { UNIT_LABEL, defaultSpeedUnit, fastestLine, serveNumberSpeedLine, speedFigures, speedTrendLine } from '../lib/speedCopy'
import { readPrefs } from '../lib/storage/prefs'
import { bestSetLines, type SetResult } from '../lib/sets'
import { serveProfile } from '../lib/serveProfile'
import { graduation } from '../lib/graduation'
import { graduationCard } from '../lib/graduationCard'
import FixedPair from '../components/FixedPair'
import HistoryList from '../components/HistoryList'
import { playerBaseline } from '../lib/baseline'
import { serveLinks } from '../lib/serveLinks'
import { FaultGrid, InRateBars, LoadBars, ScoreRibbon } from '../components/ProgressCharts'
import { weekPlan } from '../lib/weekPlan'
import type { PracticeSession } from '../lib/session/session'
import { SERVE_NUMBER_LABEL } from '../lib/serveTagCopy'
import { serveLoad } from '../lib/serveLoad'
import { replayFrom } from '../lib/storage/poseTrack'
import { usePendingDelete } from '../components/usePendingDelete'

const ThenNow = lazy(() => import('../components/ThenNow'))

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
  /** The season ledger: trips whose reports were pruned, folded into the trend. */
  ledger?: TripRecord[]
  /** How often the player gets to a court, when they have said. */
  cadence?: Cadence
  /** Practice sessions, whose serves count in the weekly tally. */
  practiceSessions?: PracticeSession[]
  /** What the player said about each serve. */
  tags?: ServeTag[]
  /** Finished sets of ten, for the records. */
  sets?: SetResult[]
  /** Which rung of each fault's ladder the player is on. */
  ladder?: Partial<Record<string, number>>
  practice?: PracticeFocus
  onLogDrill: () => void
  onUndoDrill: () => void
  /** The history is the dev seed, not storage. */
  seeded: boolean
  onBack: () => void
  /** Open a report from the list of every serve. */
  onOpen?: (s: Session) => void
  /** Open straight on the list, from "All your serves" on Today. */
  showServes?: boolean
  /** Reload after a serve is deleted. */
  refreshSessions?: () => void
}

/**
 * Is it working? The shape of the player's improvement, as pictures first:
 * the score over time, the speed, the faults going dark, the records, the body
 * then and now, and every serve underneath.
 *
 * It was a document: sixteen sections of sentences around a chart that was
 * mostly empty space. The sentences are still here where a picture needs its
 * reading, and everything derived is still derived from `sessions`.
 */
export default function Progress({
  sessions,
  ledger = NO_TRIPS,
  cadence,
  practiceSessions,
  tags = [],
  sets = [],
  ladder,
  practice,
  onLogDrill,
  onUndoDrill,
  onBack,
  onOpen,
  showServes = false,
  refreshSessions,
}: Props) {
  const form = useMemo(() => buildProgress(sessions, undefined, ledger), [sessions, ledger])
  const path = useMemo(() => servePath(sessions, ladder), [sessions, ladder])
  const bests = useMemo(() => bodyBests(sessions, form?.serveType), [sessions, form])
  const profile = useMemo(() => {
    if (!form) return undefined
    const trips = tripsOf(sessions.filter((s) => (s.serveType ?? 'flat') === form.serveType))
    const trip = trips[trips.length - 1]
    return trip ? { at: trip[0].createdAt, lines: serveProfile(trip) } : undefined
  }, [sessions, form])
  const fixedCards = useMemo(() => {
    const week = weekPlan(sessions, ladder)
    return (week?.graduated ?? [])
      .map((x) => {
        const g = graduation(sessions, x.flaw)
        return g ? graduationCard(sessions, g, week?.items[0]?.flaw) : undefined
      })
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
  }, [sessions, ladder])
  const milestone = useMemo(() => (form ? sixWeekMilestone(form) : undefined), [form])
  const streak = useMemo(() => streakLine(sessions, Date.now(), { ledger, cadence, practice: practiceSessions }), [sessions, ledger, cadence, practiceSessions])
  const tagMap = useMemo(() => tagsById(tags), [tags])
  const numbers = useMemo(() => byServeNumber(sessions, tags, form?.serveType), [sessions, tags, form])
  const misses = useMemo(() => missesInCommon(sessions, tags, form?.serveType), [sessions, tags, form])
  const setLines = useMemo(() => bestSetLines(sets), [sets])
  const inRates = useMemo(() => inRateByType(sessions, tags), [sessions, tags])
  const slowSecond = useMemo(() => secondServeSlower(sessions, tags), [sessions, tags])
  const fastest = useMemo(() => fastestServe(sessions), [sessions])
  const quicker = useMemo(() => speedTrend(sessions, tags), [sessions, tags])
  const numberSpeeds = useMemo(() => speedByServeNumber(sessions, tags), [sessions, tags])
  const tripSpeeds = useMemo(() => speedByTrip(sessions, tags), [sessions, tags])
  const unit = readPrefs().speedUnit ?? defaultSpeedUnit()
  const load = useMemo(() => serveLoad(sessions, Date.now(), practiceSessions), [sessions, practiceSessions])
  const faults = useMemo(() => faultTrends(sessions, ladder, form?.serveType), [sessions, ladder, form])
  const longestStreakText = useMemo(() => longestStreakLine(sessions, Date.now(), { ledger, cadence, practice: practiceSessions }), [sessions, ledger, cadence, practiceSessions])
  const links = useMemo(() => serveLinks(sessions, tags), [sessions, tags])
  const usualReady = useMemo(() => playerBaseline(sessions, { tags }) !== undefined, [sessions, tags])
  const strain = useMemo(() => recurringStrainOf(sessions), [sessions])
  const strainCleared = useMemo(() => clearedStrainOf(sessions), [sessions])
  const spread = useMemo(() => (form ? buildConsistencyTrend(sessions, form.serveType) : undefined), [sessions, form])
  const sheetBestGap = useMemo(() => bestConsistencyGap(spread), [spread])
  const sheetBestScore = useMemo(() => (form ? bestTrip(sessions, form.serveType, ledger) : undefined), [sessions, form, ledger])
  const sheetGapDelta = useMemo(() => (spread ? gapDeltaLine(spread.gapDelta) : undefined), [spread])
  const seasonRecords = useMemo(
    () => ({
      streak,
      longestStreak: longestStreakText,
      bestScore: sheetBestScore && bestTripEverLine(sheetBestScore),
      bestGap: sheetBestGap && bestGapEverLine(sheetBestGap),
    }),
    [streak, longestStreakText, sheetBestScore, sheetBestGap],
  )

  // The widest honest pair among serves that still carry a swing. The rules are
  // `thenAndNow`'s: one serve type, one rubric, never one trip.
  const thenNow = useMemo(() => {
    const swung = sessions.filter((s) => replayFrom(s.track))
    return form ? thenAndNow(swung, swung.length, form.serveType) : undefined
  }, [sessions, form])

  const [changed, setChanged] = useState(0)
  const { pendingDelete, commitDelete, remove, undoDelete } = usePendingDelete({
    refreshSessions: () => {
      refreshSessions?.()
      setChanged(changed + 1)
    },
  })
  const listed = sessions.filter((s) => s.id !== pendingDelete)
  const [servesOpen, setServesOpen] = useState(showServes)

  if (!form || form.points.length < 2) {
    return (
      <div className="screen progress-screen">
        <header className="today-top">
          <h1 className="t-display">Progress</h1>
        </header>
        <div className="progress-empty">
          <p className="t-headline">Film two serves and this shows whether your changes are working.</p>
          <button className="btn btn--primary btn--big btn--full" onClick={onBack}>
            <Icon name="camera" size={20} />
            Film a serve
          </button>
        </div>
        {sessions.length > 0 && onOpen && <HistoryList sessions={listed} tags={tagMap} onOpen={onOpen} onDelete={remove} />}
      </div>
    )
  }

  const trip = form.latestTrip
  const range = tripRangeLine(trip)
  const fig = fastest ? speedFigures(fastest, unit) : undefined

  return (
    <div className="screen progress-screen">
      <header className="today-top">
        <h1 className="t-display">Progress</h1>
      </header>

      <section className="shape" aria-label="Your typical serve over time">
        <div className="shape-head">
          <span className="t-score">{trip.overall}</span>
          <p>
            <strong>Typical {SERVE_TYPES[form.serveType].word} serve</strong>
            <span>{[tripDay(trip.createdAt), range].filter(Boolean).join(', ')}</span>
            {form.tripDelta !== undefined && (
              <span className="shape-delta">
                <DeltaChip delta={form.tripDelta} scope="trip" /> on your last trip
              </span>
            )}
          </p>
        </div>
        <ScoreRibbon points={form.trips} />
        {milestone && <p className="shape-note">{milestone}</p>}
        {form.setAside > 0 && (
          <p className="shape-note">
            Showing your {SERVE_TYPES[form.serveType].word} serves. {form.setAside} other {form.setAside === 1 ? 'serve is' : 'serves are'} scored against different targets.
          </p>
        )}
      </section>

      {(fig || sheetBestScore) && (
        <div className="record-tiles" id="progress-records">
          {fig && (
            <div className="record-tile">
              <span className="t-figure tnum">{fig.best}</span>
              <span>{fig.unit} fastest</span>
            </div>
          )}
          {sheetBestScore && (
            <div className="record-tile">
              <span className="t-figure tnum">{sheetBestScore.score}</span>
              <span>best trip</span>
            </div>
          )}
          <div className="record-tile">
            <span className="t-figure tnum">{sessions.length}</span>
            <span>serves filmed</span>
          </div>
        </div>
      )}

      {!usualReady && (
        <p className="progress-foot">After a dozen serves over three trips, I can read each new serve against your own usual.</p>
      )}

      {fixedCards.length > 0 && (
        <section className="block" id="progress-fixed">
          <h2 className="block-title">Fixed lately</h2>
          {fixedCards.map((c) => (
            <FixedPair key={c.flaw} then={c.then} now={c.now} title={c.name} line={c.line} />
          ))}
        </section>
      )}

      {(strain.length > 0 || strainCleared.length > 0) && (
        <section className="block">
          <h2 className="block-title">{strain.length > 0 ? 'What keeps coming back' : 'What has stopped'}</h2>
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

      {(fastest || quicker || numberSpeeds) && (
        <section className="block" id="progress-speed">
          <h2 className="block-title">Serve speed</h2>
          {tripSpeeds.length >= 2 && (
            <>
              <SpeedTrips trips={tripSpeeds} unit={unit} />
              <p className="progress-foot">
                Your typical first serve each trip, in {UNIT_LABEL[unit]}. Each bar is its likely range. Not checked against a radar.
              </p>
            </>
          )}
          {fastest && <p className="progress-foot">{fastestLine(fastest, unit)}</p>}
          {quicker && <p className="progress-foot">{speedTrendLine(quicker, unit)}</p>}
          {numberSpeeds && <p className="progress-foot">{serveNumberSpeedLine(numberSpeeds, unit)}</p>}
        </section>
      )}

      {links.length > 0 && (
        <section className="block">
          <h2 className="block-title">What your best serves share</h2>
          {links.map((l) => (
            <p key={`${l.kind}${l.metricId}`} className="strain-line strain-line--clear">
              <Cue text={l.line} />
            </p>
          ))}
          <p className="progress-foot">From your own serves, and past what chance would give. It says what goes together, not what causes what.</p>
        </section>
      )}

      {faults.length > 0 && (
        <section className="block">
          <h2 className="block-title">Your faults, serve by serve</h2>
          <FaultGrid faults={faults} />
        </section>
      )}

      {thenNow && (
        <Suspense fallback={null}>
          <ThenNow then={thenNow.then} now={thenNow.now} />
        </Suspense>
      )}

      {(numbers.length > 0 || inRates.length > 0 || slowSecond || misses.length > 0) && (
        <section className="block">
          <h2 className="block-title">First and second serves</h2>
          <InRateBars
            rows={numbers
              .filter((n) => n.outcomes >= MIN_OUTCOMES_FOR_RATE)
              .map((n) => ({ label: `${SERVE_NUMBER_LABEL[n.serveNumber]}s`, inServes: n.inServes, outcomes: n.outcomes }))}
          />
          {numbers.map((n) => (
            <p key={n.serveNumber} className="progress-foot">
              {SERVE_NUMBER_LABEL[n.serveNumber]}s: {n.serves} tagged, averaging {n.average}
              {n.outcomes >= MIN_OUTCOMES_FOR_RATE ? `, in on ${n.inServes} of the ${n.outcomes} you said where they landed.` : '.'}
            </p>
          ))}
          {inRates.map((r) => (
            <p key={r.serveType} className="progress-foot">
              {SERVE_TYPES[r.serveType].label}: in on {r.inServes} of {r.outcomes} tagged.
            </p>
          ))}
          {slowSecond && (
            <p className="progress-foot">
              <Cue text={slowSecond.line} />
            </p>
          )}
          {misses.map((m) => (
            <p key={m.miss} className="progress-foot">
              <Cue text={m.line} />
            </p>
          ))}
        </section>
      )}

      {load.weeks.filter((w) => w.serves > 0).length >= 2 && (
        <section className="block">
          <h2 className="block-title">Serves per week</h2>
          <LoadBars load={load} />
          {load.line && <p className="progress-foot">{load.line}</p>}
        </section>
      )}

      {path && (
        <details className="block progress-more" id="progress-path">
          <summary className="block-title">
            Your serve path
            <Icon name="chevron" size={16} />
          </summary>
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
        </details>
      )}

      {(bests.length > 0 || streak || longestStreakText || setLines.length > 0) && (
        <details className="block progress-more">
          <summary className="block-title">
            All your records
            <Icon name="chevron" size={16} />
          </summary>
          {bests.map((b) => (
            <p key={b.metricId} className="progress-foot">
              {bodyBestLine(b)}
            </p>
          ))}
          {streak && <p className="progress-foot">{streak}</p>}
          {longestStreakText && <p className="progress-foot">{longestStreakText}</p>}
          {sheetBestScore && <p className="progress-foot">{bestTripEverLine(sheetBestScore)}</p>}
          {setLines.map((l) => (
            <p key={l} className="progress-foot">
              {l}
            </p>
          ))}
        </details>
      )}

      {practice && (
        <details className="block progress-more">
          <summary className="block-title">
            The season's weakest spot
            <Icon name="chevron" size={16} />
          </summary>
          <PracticeCard focus={practice} onLogDrill={onLogDrill} onUndoDrill={practice.drilled ? onUndoDrill : undefined} />
        </details>
      )}

      {profile && profile.lines.length > 0 && (
        <details className="block progress-more">
          <summary className="block-title">
            How you served, {tripDay(profile.at)}
            <Icon name="chevron" size={16} />
          </summary>
          <ul className="profile">
            {profile.lines.map((l) => (
              <li key={l.id} className="profile-line">
                <span className="path-name">{l.label}</span>
                <span className="profile-tag">{l.tag}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {form.areaDeltas.length > 0 && (
        <details className="block progress-more">
          <summary className="block-title">
            Change since your last serve
            <Icon name="chevron" size={16} />
          </summary>
          <DeltaBars deltas={form.areaDeltas} />
        </details>
      )}

      {spread && spread.points.length > 1 && (
        <details className="block progress-more">
          <summary className="block-title">
            How repeatable, over time
            <Icon name="chevron" size={16} />
          </summary>
          <GapTrend points={spread.points} />
          {sheetGapDelta && <p className="sheet-note">{sheetGapDelta}</p>}
          {spread.recurring && (
            <p className="sheet-note">
              {spread.recurring.label} has been your least repeatable part in {spread.recurring.sessions} of these. That is the one to practise most.
            </p>
          )}
          {sheetBestGap && <p className="sheet-note">{bestGapEverLine(sheetBestGap)}</p>}
        </details>
      )}

      <details className="block progress-more">
        <summary className="block-title">
          See the numbers as a table
          <Icon name="chevron" size={16} />
        </summary>
        <TrendTable points={form.trips} />
      </details>

      <ProgressShare records={seasonRecords} sessions={sessions} strainLine={strain.map(strainLine).find(Boolean) ?? undefined} fixed={fixedCards} />

      {onOpen && (
        <>
          <button className="progress-all" onClick={() => setServesOpen(true)}>
            <span>Every serve</span>
            <span className="tnum">{listed.length}</span>
            <Icon name="chevron" size={16} />
          </button>
          <Sheet open={servesOpen} onClose={() => setServesOpen(false)} title="Every serve">
            {pendingDelete && (
              <p className="storage-note undo-row" role="status">
                <Icon name="trash" size={15} />
                <span>Serve deleted.</span>
                <button className="levelled-btn" onClick={undoDelete}>
                  Undo
                </button>
              </p>
            )}
            <HistoryList
              sessions={listed}
              tags={tagMap}
              onOpen={(s) => {
                commitDelete(pendingDelete)
                onOpen(s)
              }}
              onDelete={remove}
            />
            <p className="sheet-note">Reports stay on this device only.</p>
          </Sheet>
        </>
      )}
    </div>
  )
}
