import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Icon, Sheet } from '../components/primitives'
import { NUDGE_COPY, type StorageNudge } from '../lib/storage/nudge'
import { sessionEvidence } from '../lib/session/evidence'
import { buildProgress, streakLine, deltaStatus, sixWeekMilestone } from '../lib/progress'
import { momentsFor, weekRecap } from '../lib/moments'
import MomentCard from '../components/MomentCard'
import { programmeFor } from '../lib/programme'
import { LANDING_PEEK } from '../lib/samplePeek'
import { practiceHeadline, type PracticeFocus } from '../lib/practice'
import { faultForMetric, filmable } from '../lib/analysis/progressions'
import { fastestServe } from '../lib/speedTrend'
import { defaultSpeedUnit, speedFigures } from '../lib/speedCopy'
import type { OfflineWarmup } from '../components/useOfflineWarmup'
import type { ServeTag, Session } from '../lib/storage/db'
import { tagsById } from '../lib/storage/db'
import type { TripRecord } from '../lib/storage/ledger'
import { readPrefs, type Prefs } from '../lib/storage/prefs'
import type { PracticeSession } from '../lib/session/session'
import { DeltaChip } from '../components/DeltaChip'
import { deviceNoun } from '../lib/device'
import type { InfoPageId } from '../lib/routes'
import { useCan } from '../components/usePlan'
import { MOVE_UP } from '../lib/phrases'

const FirstRunStage = lazy(() => import('../components/FirstRunStage'))
const FirstRunMore = lazy(() => import('../components/FirstRunMore'))
/** The landing's top links, out of the entry chunk; a box of their height holds the place, so nothing moves when they arrive. */
const FirstRunTop = lazy(() => import('../components/FirstRunChrome'))
// The landing's top links hold their place in a box of their height (`.top-room`, shell.css).
/** Only wanted once the top buttons scroll away: kept out of the entry chunk. */
const StickyFilmBar = lazy(() => import('../components/StickyFilmBar'))
const WarmupNote = lazy(() => import('../components/WarmupNote'))

/*
 * The landing's and Today's small layouts are classes in shell.css (E5.4):
 * `.bar-room` keeps the sticky bar's height clear at the landing's foot,
 * `.top-actions` sets Upload beside Settings, `.fold-summary` is a fold's
 * tap-down as a link, without the browser's triangle.
 */

/*
 * Upload and the sample, side by side under the one main action (`.second-row`):
 * a clip the player already has is on the first screen, not behind the camera,
 * and the screen still has one main action and no third stacked exit
 * (DESIGN.md). Each label on one line (`.btn-tight`): at 375 px the two fit
 * side by side; narrower, they stack whole.
 */
// Only when a gate is shut, which the app never does until paid plans are on (N6.4).
const Locked = lazy(() => import('../components/Locked'))
const ServeCards = lazy(() => import('../components/ServeCards'))
/** The score's shape, from Progress's own chart: on a laptop's Today only (E5.1). */
const ScoreRibbon = lazy(() => import('../components/ProgressCharts').then((m) => ({ default: m.ScoreRibbon })))
const laptop = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches
const StepPassed = lazy(() => import('../components/StepPassed'))
const SessionBody = lazy(() => import('../components/ProgrammeSheets').then((m) => ({ default: m.SessionBody })))
const ProgrammeBody = lazy(() => import('../components/ProgrammeSheets').then((m) => ({ default: m.ProgrammeBody })))

/** One empty list for every render, so a memo keyed on it holds. */
const NO_TRIPS: TripRecord[] = []
const NO_SESSIONS: PracticeSession[] = []
const NO_TAGS: ServeTag[] = []

/** How long after a week ends its recap is worth a place on Today. */
const RECAP_FRESH_MS = 4 * 86_400_000

interface Props {
  sessions: Session[]
  ledger?: TripRecord[]
  tags?: ServeTag[]
  practiceSessions?: PracticeSession[]
  /** The season's weakest spot, so a stuck drill shows on the goal it is about (N7.4). */
  practice?: PracticeFocus
  prefs: Prefs
  onPrefs: (patch: Partial<Prefs>) => void
  /** Whether storage has answered; until then `sessions` being empty means nothing. */
  sessionsLoaded: boolean
  onOpen: (session: Session) => void
  onOpenPracticeSession?: (session: PracticeSession) => void
  onFilm: () => void
  /** To the viewfinder, counting the next serves for this drill. */
  onCheckDrill?: (flaw: string, drill: string) => void
  onLadderStep?: (flaw: string, step: number, from?: number) => void
  onShowSettings: () => void
  onShowProgress: () => void
  onShowHistory: () => void
  /** Render a report from a simulated serve, so the app can be seen with nothing filmed. */
  onShowExample: () => void
  /** The file picker, for a clip already on the device: on the first screen, beside the sample. */
  onUpload?: () => void
  /** How sure I am, privacy, terms or credits (N6.3). */
  onShowPage?: (page: InfoPageId) => void
  /** `undefined` while the cache is still being asked. */
  offlineReady: boolean | undefined
  /** The one-time download under way, and the tap that starts it from the landing. */
  warming?: OfflineWarmup
  onGetReady?: () => void
  /** The last analysis the page did not live to finish, said once (L6.4). */
  interrupted?: string
  /** Where the history lives, when there is something to say about it (L6.5). */
  nudge?: StorageNudge
  onExportBackup?: () => void
  onQuietMove?: () => void
  /** The history looks emptied or damaged and a copy can bring it back. */
  recovery?: string
  onRestore?: () => void
  onStartFresh?: () => void
}

/** Lime as a whole surface: the one loud thing on the screen, and only when it is earned. */
/**
 * Today: what now, and how it is going.
 *
 * With history this was 2.9 screens: a backup warning first, two competing
 * buttons, the week twice over, help cards, and three serves with one title.
 * It is one "what now" now: the next session of the programme, in minutes, with
 * momentum in one line of real numbers and the last serves told apart.
 *
 * With nothing filmed it is the first run: a real serve, a promise the app can
 * keep, and one thing to do.
 */
export default function Home({
  sessions,
  ledger = NO_TRIPS,
  tags = NO_TAGS,
  practiceSessions = NO_SESSIONS,
  practice,
  prefs,
  onPrefs,
  sessionsLoaded,
  onOpen,
  onOpenPracticeSession,
  onFilm,
  onCheckDrill,
  onLadderStep,
  onShowSettings,
  onShowProgress,
  onShowHistory,
  onShowExample,
  onUpload,
  onShowPage,
  offlineReady,
  warming,
  onGetReady,
  interrupted,
  nudge,
  onExportBackup,
  onQuietMove,
  recovery,
  onRestore,
  onStartFresh,
}: Props) {
  const [sheet, setSheet] = useState<'session' | 'programme' | null>(null)
  // The landing's real serve could not play, so the drawn one stands in (Apex F).
  const [drawn, setDrawn] = useState(false)
  const onDrawn = useCallback(() => setDrawn(true), [])
  const allow = useCan()
  const known = sessionsLoaded && sessions.length > 0
  const evidence = useMemo(() => sessionEvidence(practiceSessions), [practiceSessions])
  const more = useMemo(() => ({ tags, ledger, practice: practiceSessions }), [tags, ledger, practiceSessions])
  const programme = useMemo(() => (known ? programmeFor(sessions, prefs, Date.now(), evidence, more) : undefined), [known, sessions, prefs, evidence, more])
  const moments = useMemo(() => (known ? momentsFor(sessions, prefs, Date.now(), evidence, more) : []), [known, sessions, prefs, evidence, more])
  const recap = useMemo(() => (known ? weekRecap(sessions, prefs, Date.now(), evidence, more) : undefined), [known, sessions, prefs, evidence, more])
  const form = useMemo(() => (known ? buildProgress(sessions, undefined, ledger) : undefined), [known, sessions, ledger])
  const [wide] = useState(laptop)
  const streak = useMemo(
    () => (known ? streakLine(sessions, Date.now(), { ledger, cadence: prefs.cadence, practice: practiceSessions }) : undefined),
    [known, sessions, ledger, prefs.cadence, practiceSessions],
  )
  // Every serve recorded, the same count Progress shows (2026-11-25): it was court trips.
  const servesRecorded = sessions.length
  const fastest = useMemo(() => (known ? fastestServe(sessions) : undefined), [known, sessions])
  const unit = readPrefs().speedUnit ?? defaultSpeedUnit()
  const tagMap = useMemo(() => tagsById(tags), [tags])

  const restore = recovery && (
    <section className="recovery">
      <p role="status">{recovery}</p>
      <div className="recovery-actions">
        <button className="btn btn--primary btn--full" onClick={onRestore}>
          Restore my serves
        </button>
        <button className="btn btn--quiet btn--full" onClick={onStartFresh}>
          Start fresh
        </button>
      </div>
    </section>
  )

  const storage = nudge && (
    <div className="today-nudge">
      <p role="status">{NUDGE_COPY[nudge]}</p>
      {nudge === 'restore' ? (
        <button className="link-btn" onClick={onShowSettings}>
          Restore a backup
        </button>
      ) : (
        <button className="link-btn" onClick={onExportBackup}>
          Save a backup now
        </button>
      )}
      {nudge === 'move' && (
        <button className="link-btn" onClick={onQuietMove}>
          Not now
        </button>
      )}
    </div>
  )
  const cutOff = interrupted && (
    <p className="note" role="status">
      {interrupted}
    </p>
  )

  // New to the app: nothing to navigate, so one screen and one thing to do.
  if (sessionsLoaded && !known) {
    return (
      <>
      <div className="screen first-run">
        <Suspense fallback={<div className="top-room" />}>
          <FirstRunTop onShowPage={onShowPage} />
        </Suspense>
        {restore}
        {cutOff}
        <div className="first-stage">
          <Suspense fallback={null}>
            <FirstRunStage racket={prefs.handedness} onDrawn={onDrawn} />
          </Suspense>
          <div className="hero-veil" aria-hidden="true" />
          {/* What a report says, on the picture (N7.6): the landing shows
              rather than promises. The real serve's own read (Apex F); where
              the drawn serve stands in for it, the label says whose read it is. */}
          <div className="first-peek">
            <span className="first-peek-score">
              <strong className="tnum">{LANDING_PEEK.score}</strong>/100
            </span>
            <span className="first-peek-text">
              <span className="first-peek-label">{drawn ? 'A real serve I checked: work on this next' : 'On this serve, work on this next'}</span>
              <strong>{LANDING_PEEK.fix}</strong>
              <span>
                {LANDING_PEEK.drill}, {LANDING_PEEK.reps}
              </span>
            </span>
          </div>
        </div>
        <div className="first-copy">
          <h1 className="t-display">Film one serve. See what to fix first.</h1>
          <p>I check your toss, legs, swing and contact on this {deviceNoun()}, then show the fix drawn on your own serve.</p>
        </div>
        <div className="first-actions" id="first-actions">
          <button className="btn btn--primary btn--big btn--full" onClick={onFilm}>
            <Icon name="camera" size={21} />
            Film my serve
          </button>
          <div className={onUpload ? 'second-row' : undefined}>
            {onUpload && (
              <button className="btn btn--quiet btn-tight" onClick={onUpload}>
                <Icon name="upload" size={18} />
                Upload a video
              </button>
            )}
            <button className={onUpload ? 'btn btn--quiet btn-tight' : 'btn btn--quiet btn--full'} onClick={onShowExample}>
              See a sample report
            </button>
          </div>
        </div>
        <p className="first-foot">
          Your video never leaves this {deviceNoun()}.
          <Suspense fallback={null}>
            <WarmupNote ready={offlineReady} warming={warming} onGetReady={onGetReady} />
          </Suspense>
        </p>
        {storage}
      </div>
      <Suspense fallback={null}>
        <FirstRunMore onShowPage={onShowPage} />
      </Suspense>
      {/* Room at the foot for the bar below, so it never covers the last links. */}
      <div aria-hidden="true" className="bar-room" />
      <Suspense fallback={null}>
        <StickyFilmBar watchId="first-actions" onFilm={onFilm} onUpload={onUpload} />
      </Suspense>
      </>
    )
  }

  const stepDone = moments.some((m) => m.kind === 'step')
  const recapFresh = recap && Date.now() - recap.to < RECAP_FRESH_MS
  const current = programme?.current
  // The practice card's stuck line, on the goal it is about (N7.4): a drill
  // that has not moved after its rounds was said only under Go deeper.
  const goal = programme?.goal
  const stuck =
    goal?.kind === 'fault' && practice?.verdict === 'stuck' && practice.drilled && faultForMetric(practice.metricId) === goal.flaw
      ? practiceHeadline(practice)
      : undefined

  return (
    <div className="screen today">
      <header className="today-top">
        <h1 className="t-display">Today</h1>
        <div className="top-actions">
          {onUpload && (
            <button className="btn btn--quiet btn-tight" onClick={onUpload} aria-label="Upload a video">
              <Icon name="upload" size={18} />
              Upload
            </button>
          )}
          <button className="icon-btn" onClick={onShowSettings} aria-label="Settings and backups">
            <Icon name="settings" size={22} />
          </button>
        </div>
      </header>

      {restore}
      {cutOff}

      {moments.map((m) => (
        <MomentCard key={m.key} moment={m} />
      ))}
      {!stepDone && prefs.ladderPassedAt && Object.keys(prefs.ladderPassedAt).length > 0 && (
        <Suspense fallback={null}>
          <StepPassed sessions={sessions} passedAt={prefs.ladderPassedAt} ladder={prefs.ladder} />
        </Suspense>
      )}

      {programme && current && !allow('pathway') && (
        <Suspense fallback={null}>
          <Locked feature="pathway">
            <p>
              Your goal: <strong>{programme.title}</strong>, in {programme.weeks.length} steps.
            </p>
          </Locked>
        </Suspense>
      )}
      {programme && current && allow('pathway') && (
        <section className="next-up" aria-labelledby="next-title">
          <button className="next-goal" onClick={() => setSheet('programme')}>
            <span className="next-label">Your goal</span>
            <span className="next-title t-headline" id="next-title">
              {programme.title}
            </span>
            <span className="next-road" aria-label={`${current.label} of ${programme.weeks.length}`}>
              {programme.weeks.map((w) => (
                <span key={w.label} className={`next-tick next-tick--${w.state}`} />
              ))}
            </span>
          </button>
          <div className="next-today">
            <span className="next-label">Next on court</span>
            <strong>{current.drill.name}</strong>
            <span className="next-meta">
              {current.drill.reps}
              {current.step ? `, step ${current.step.at} of ${current.step.of}` : ''}
            </span>
          </div>
          {programme.moveUp && onLadderStep && (
            <button
              className="btn btn--ghost btn--full"
              onClick={() => {
                const m = programme.moveUp!
                onLadderStep(m.flaw, m.to, m.from)
              }}
            >
              {MOVE_UP}
            </button>
          )}
          <button className="btn btn--primary btn--big btn--full" onClick={() => setSheet('session')}>
            Start today’s session
          </button>
          {/* How long it takes, and a drill that has stopped moving, one tap down and
              under the one main action (E1.6): the card leads with the goal and the
              next thing, not with what isn't working. A stalled drill names itself on the tap. */}
          <details className="next-more">
            <summary className="link-btn link-btn--quiet fold-summary">
              {stuck ? 'This drill isn’t working yet. What now?' : 'How long this takes'}
            </summary>
            <p className="next-pace">{programme.pace}</p>
            {stuck && <p className="next-stuck">{stuck}</p>}
          </details>
        </section>
      )}

      {/* Momentum in one line of real numbers, and the door to the rest. */}
      {form && (
        <button className="momentum" onClick={onShowProgress}>
          <span className="momentum-stat">
            <span className="t-figure tnum">{form.latestTrip.overall}</span>
            <span>
              typical score{' '}
              {form.tripDelta !== undefined && deltaStatus(form.tripDelta, 'trip') !== 'flat' && <DeltaChip delta={form.tripDelta} scope="trip" />}
            </span>
          </span>
          {fastest && (
            <span className="momentum-stat">
              <span className="t-figure tnum">
                <span className="momentum-about">about</span>
                {speedFigures(fastest, unit).best}
              </span>
              <span>{speedFigures(fastest, unit).unit} fastest</span>
            </span>
          )}
          <span className="momentum-stat">
            <span className="t-figure tnum">{servesRecorded}</span>
            <span>{servesRecorded === 1 ? 'serve recorded' : 'serves recorded'}</span>
          </span>
        </button>
      )}
      {/* Is it getting better (D1.3): said in a line, even when the change is too small for a chip. */}
      {/* One line under the numbers, not two: the six-week read where there is one, else the streak. */}
      {(form && sixWeekMilestone(form, 0)) || streak ? <p className="today-streak">{(form && sixWeekMilestone(form, 0)) || streak}</p> : null}
      {/* On a laptop the right pane sat empty under three numbers (E5.1): the shape of the serve fills it. */}
      {wide && form && form.trips.length > 1 && (
        <section className="today-ribbon" aria-label="Your typical score over time">
          <Suspense fallback={null}>
            <ScoreRibbon points={form.trips} />
          </Suspense>
        </section>
      )}

      {recapFresh && recap && (
        <section className="recap" aria-label={recap.label}>
          <h2 className="t-subhead">{recap.label}</h2>
          <p>{recap.line}</p>
          {recap.bestSpeed && <p>{recap.bestSpeed.line}</p>}
          {recap.faults.map((f) => (
            <p key={f.flaw}>{f.line}</p>
          ))}
        </section>
      )}

      {sessions.length > 0 && (
        <section aria-labelledby="serves-title">
          <h2 className="t-subhead today-head" id="serves-title">
            Your last serves
          </h2>
          <Suspense fallback={<div className="serve-cards-wait" />}>
            <ServeCards
              sessions={sessions.slice(0, 5)}
              history={sessions}
              tags={tagMap}
              practice={practiceSessions}
              onOpen={onOpen}
              onOpenPractice={onOpenPracticeSession}
              onAll={onShowHistory}
            />
          </Suspense>
        </section>
      )}

      {/*
       * One note at the foot, not two: the backup nudge when there is one (it
       * protects the serves), else the whole-practice tip (N3.6) until it is
       * dismissed.
       */}
      {storage ||
        (practiceSessions.length === 0 && !prefs.practiceTipSeenAt && (
          <p className="today-tip">
            <strong>Check a whole practice.</strong> Turn on Whole practice when you film, or upload a video. I find every serve in it.{' '}
            <button className="link-btn" onClick={() => onPrefs({ practiceTipSeenAt: Date.now() })}>
              Got it
            </button>
          </p>
        ))}

      <Sheet open={sheet === 'session'} onClose={() => setSheet(null)} title="Today’s session">
        <Suspense fallback={null}>
          {programme && (
            <SessionBody
              programme={programme}
              practice={practiceSessions}
              onFilmCheck={() => {
                setSheet(null)
                const first = programme.plan.items[0]
                // A step with no served ball films a plain serve, with nothing counted for it (W5.2).
                if (first?.flaw && filmable(first.flaw, first.drill.name)) onCheckDrill?.(first.flaw, first.drill.name)
                else onFilm()
              }}
            />
          )}
        </Suspense>
      </Sheet>

      <Sheet open={sheet === 'programme'} onClose={() => setSheet(null)} title={programme?.title ?? 'Your goal'}>
        <Suspense fallback={null}>
          {programme && (
            <ProgrammeBody
              programme={programme}
              sessions={sessions}
              prefs={prefs}
              evidence={evidence}
              more={more}
              onChoose={(patch) => {
                onPrefs(patch)
                setSheet(null)
              }}
            />
          )}
        </Suspense>
      </Sheet>
    </div>
  )
}
