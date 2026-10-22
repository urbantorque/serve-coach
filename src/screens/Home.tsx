import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { DeltaChip, Sparkline } from '../components/Trend'
import { Cue, Icon, ScoreRing, Sheet } from '../components/primitives'
import { engineMegabytes } from '../lib/engineManifest'
import { NUDGE_COPY, type StorageNudge } from '../lib/storage/nudge'
import { previewSupported } from '../lib/framing/access'
import { findPracticeFocus } from '../lib/practice'
import { weekPlan } from '../lib/weekPlan'
import { faultForMetric } from '../lib/analysis/progressions'
import { buildProgress, currentRubricEra, sixWeekMilestone, streakLine, tripDay } from '../lib/progress'
import type { Session } from '../lib/storage/db'
import type { TripRecord } from '../lib/storage/ledger'
import type { Cadence } from '../lib/storage/prefs'
import { bodyBestLine, bodyBests } from '../lib/bests'
import { clipLabel } from '../lib/clipLabel'
import type { PracticeSession } from '../lib/session/session'

/** The viewfinder, a sheet opened on demand: out of the first screen's bundle. */
const FramingCheck = lazy(() => import('../components/FramingCheck'))
// Glossary words in the week plan (N3.4), kept out of the entry chunk.
const TermCue = lazy(() => import('../components/TermCue'))
// Today's plan and its court card (N1.6, N1.7), out of the entry chunk.
const TodayPlan = lazy(() => import('../components/TodayPlan'))

/** One empty ledger for every render, so a memo keyed on it holds. */
const NO_TRIPS: TripRecord[] = []

interface Props {
  sessions: Session[]
  /**
   * The season ledger (L3.3): trips whose reports were pruned, folded into the
   * trend, the records and the streaks. Empty for a seeded history.
   */
  ledger?: TripRecord[]
  /** How often the player gets to a court, when they have said (L3.6). */
  cadence?: Cadence
  /** `undefined` while the cache is still being asked. */
  offlineReady: boolean | undefined
  /** Whether storage has answered; until then `sessions` being empty means nothing. */
  sessionsLoaded: boolean
  onPick: (file: File) => void
  /**
   * A clip recorded inside the app, which is a different claim from a picked
   * one: the player is demonstrably still on a court.
   */
  onRecorded?: (file: File) => void
  /**
   * Bumped to ask for the viewfinder to open on arrival.
   *
   * A counter rather than a boolean, because the request is "open it now" and
   * that has to be distinguishable from the last time it was asked — a boolean
   * would need clearing, and a caller that forgot would reopen the camera every
   * time this screen rendered. Zero is never a request, so the home screen does
   * not open a camera on first load.
   */
  openFraming?: number
  /**
   * "Check this drill" on a week-plan item (N1.4): which drill the next
   * recorded serves are counted for, and the tap that sets it.
   */
  checkTarget?: string
  onCheckDrill?: (flaw: string, drill: string) => void
  onOpen: (session: Session) => void
  /** Which rung of each fault's ladder the player is on — see `Prefs.ladder`. */
  ladder?: Partial<Record<string, number>>
  onShowGuide: () => void
  onShowHistory: () => void
  /** Hand, backup and the device check — see the settings sheet in `App.tsx`. */
  onShowSettings: () => void
  onShowProgress: () => void
  /**
   * True until the player has stated which hand holds the racket.
   *
   * Deliberately not "has the guide been read" — those are separate
   * questions. A stranger who reads "How to film it" first has seen the four
   * rules but has not said which hand is theirs, and every route in still
   * has to ask that before it can proceed. `App.tsx` decides on its own
   * whether the interstitial it opens for this also shows the rules again.
   */
  needsHandedness: boolean
  /**
   * Open the guide first, then continue to whichever of the three routes in
   * asked for it — the first time only. One sheet, three reasons to open it:
   * picking a file, recording one, or just checking the framing, and each
   * has to land where it actually said it would rather than all funnelling
   * into the file picker regardless of which button was pressed.
   */
  onGuideThen: (intent: 'pick' | 'record' | 'check') => void
  /** Render a report from a simulated serve, so the app can be seen empty. */
  onShowExample: () => void
  /**
   * Fetch the pose engine now, so the app works at a court with no signal.
   *
   * Until this existed the 57 MB of models and runtime were only ever fetched
   * during an analysis, so the one thing a player could not do was get ready.
   * They installed the app at home, read the badge, drove to a court and found
   * the app could not start — at the exact moment the promise on this screen
   * was supposed to hold.
   */
  onMakeOffline: () => void
  /** How that download is going, while it is going. */
  warming?: OfflineWarmup
  /**
   * The connection costs money per megabyte, as far as the browser says
   * (`meteredConnection`, L6.1): said beside the button, before the tap.
   */
  metered?: 'saveData' | 'cellular'
  /** The last analysis the page did not live to finish, said once (L6.4). */
  interrupted?: string
  /** Where the history lives, when there is something to say about it (L6.5). */
  nudge?: StorageNudge
  onExportBackup?: () => void
  onQuietMove?: () => void
  /** Long clips read as practice sessions (L2.4), newest first. */
  practiceSessions?: PracticeSession[]
  onOpenPracticeSession?: (session: PracticeSession) => void
}

/**
 * The state of a warm-up, as the badge needs to say it.
 *
 * `unkept` is the case worth having a name for: the engine downloaded and this
 * session can analyse with it, but it is not in the cache, so a reload starts
 * from nothing. That is an iOS private window, a browser with service workers
 * off, or a dev build. Reporting it as a failed download would be untrue, and
 * reporting it as ready would be the untruth that actually strands somebody.
 */
export type OfflineWarmup = {
  stage: 'downloading' | 'starting' | 'failed' | 'unkept'
  ratio?: number
  /** Whole megabytes in so far, and in all, on the one bar across every file (L6.1). */
  loadedMb?: number
  totalMb?: number
  /** Failed because nothing arrived for a while, rather than refused. */
  stalled?: boolean
}

const coarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export default function Home({
  sessions,
  ledger = NO_TRIPS,
  cadence,
  offlineReady,
  metered,
  interrupted,
  nudge,
  onExportBackup,
  onQuietMove,
  sessionsLoaded,
  onPick,
  onRecorded,
  openFraming = 0,
  checkTarget,
  onCheckDrill,
  onOpen,
  ladder,
  onShowGuide,
  onShowHistory,
  onShowSettings,
  onShowProgress,
  needsHandedness,
  onGuideThen,
  onShowExample,
  onMakeOffline,
  warming,
  practiceSessions = [],
  onOpenPracticeSession,
}: Props) {
  const pickRef = useRef<HTMLInputElement>(null)
  const recordRef = useRef<HTMLInputElement>(null)
  const recent = sessions.slice(0, 3)
  /*
   * This week's plan: the last report's ranked fixes, each on the rung of its
   * ladder the player is on, with what to film to check it (`weekPlan`).
   *
   * It replaces a single line naming the last drill, which stood here because a
   * second copy of the report's queue was refused (R57b): the report already
   * says what was found and in what order. What it never says is where the
   * player has got to on each ladder since, or what basket would move them on,
   * and that is what this carries. Newest report first, walking past a refused
   * clip, so one bad clip does not blank the plan.
   */
  const week = useMemo(() => weekPlan(sessions, ladder), [sessions, ladder])
  const progress = useMemo(() => buildProgress(sessions, undefined, ledger), [sessions, ledger])
  const milestone = useMemo(() => (progress ? sixWeekMilestone(progress) : undefined), [progress])
  // The newest trip's first body-position best, if it set one (L3.8).
  const bodyBest = useMemo(() => bodyBests(sessions, progress?.serveType)[0], [sessions, progress])
  const streak = useMemo(
    () => streakLine(sessions, Date.now(), { ledger, cadence, practice: practiceSessions }),
    [sessions, ledger, cadence, practiceSessions],
  )
  const practice = useMemo(
    () => findPracticeFocus(sessions, undefined, undefined, undefined, ladder),
    [sessions, ladder],
  )
  const agreesWithWeek =
    !week ||
    (practice !== undefined &&
      week.items.some(
        (item) =>
          item.title === practice.label || (item.flaw !== undefined && item.flaw === faultForMetric(practice.metricId)),
      ))
  // `best` is era-only by construction, so a count taken over all of `points`
  // puts the two halves of one sentence on different sets of serves: after a
  // recalibration the personal best drops while the total still counts the
  // serve that set it. A best going down on its own is read as the app having
  // docked the player, and there is nothing on the card to say otherwise.
  // Counted through `currentRubricEra` rather than by filtering on
  // `rubricBreakAt`, so this cannot drift from whatever `best` was taken over.
  const eraCount = useMemo(
    () => (progress ? currentRubricEra(progress.points).length : 0),
    [progress],
  )
  const eraTrips = useMemo(
    () => (progress ? currentRubricEra(progress.trips).length : 0),
    [progress],
  )
  const [dragging, setDragging] = useState(false)
  // A media query, not a render-time question. This was three `matchMedia` calls
  // on every render of the first screen, all of them asking the same thing about
  // a device that cannot change its pointer while the page is open.
  const coarse = useMemo(coarsePointer, [])
  const [checking, setChecking] = useState(false)

  // Asked for by the glance screen's "Record another", which is the loop this
  // whole route exists for: record, glance, record. Guarded on zero so the
  // first render of the home screen never opens a camera nobody asked for.
  useEffect(() => {
    if (openFraming > 0) setChecking(true)
  }, [openFraming])
  // Whether a live preview is possible at all. Asked once, for the same reason
  // as the pointer above, and a page served over plain http has no camera API to
  // find — so on those the offer is simply not made rather than made and broken.
  const canPreview = useMemo(() => previewSupported(), [])

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file twice still fires a change event.
    e.target.value = ''
    if (file) onPick(file)
  }

  // A phone's camera roll rarely benefits from this — dragging a file only
  // exists as a gesture on a desktop trackpad — but on a laptop it is the
  // fastest way in, and without a visible target for it a player has no way
  // to discover it works at all.
  const dropFile = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    // The dropped file is not carried through the guide — a first run still
    // has to pick it again afterwards. Not fixed here; see NEXT.md.
    if (needsHandedness) onGuideThen('pick')
    else onPick(file)
  }

  // The hint promises "anywhere here", and the browser's default for a drop
  // that misses the zone by a few pixels is to navigate the tab to the raw
  // video file — unloading the app. So the whole window accepts the drop; the
  // zone's own handler runs first and marks the event handled.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      if (e.defaultPrevented) return
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      if (needsHandedness) onGuideThen('pick')
      else onPick(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [needsHandedness, onGuideThen, onPick])

  // A returning player (L4.10): history loaded and not empty.
  const known = sessionsLoaded && sessions.length > 0

  return (
    <div className="screen home">
      <header className="home-top">
        <span className="brand">
          <span className="brand-dot" />
          Serve Coach
        </span>
        <span className="home-top-actions">
          <button className="icon-btn" onClick={onShowHistory} aria-label="Your serves">
            <Icon name="clock" />
          </button>
          {/* Shown even with nothing saved. Restoring a backup onto a new phone
              is exactly the moment the history is empty, and the backup lives
              here now rather than at the foot of the history list. */}
          <button className="icon-btn" onClick={onShowSettings} aria-label="Settings and backups">
            <Icon name="settings" />
          </button>
        </span>
      </header>

      {/* An analysis the page reloaded under (L6.4): the first thing said, once. */}
      {interrupted && (
        <p className="note home-interrupted" role="status">
          {interrupted}
        </p>
      )}

      {/* Where the history lives (L6.5): moving from Safari to the Home Screen,
          restoring into an empty install, or a backup overdue. One at a time. */}
      {nudge && (
        <div className="note home-nudge">
          <span role="status">{NUDGE_COPY[nudge]}</span>
          <span className="home-nudge-actions">
            {nudge === 'restore' ? (
              <button className="chip chip--button" onClick={onShowSettings}>
                Restore a backup
              </button>
            ) : (
              <button className="chip chip--button" onClick={onExportBackup}>
                Export now
              </button>
            )}
            {nudge === 'move' && (
              <button className="chip chip--button" onClick={onQuietMove}>
                Not now
              </button>
            )}
          </span>
        </div>
      )}

      {/* Once there is history the pitch has done its job (L4.10): the hero
          shrinks to one line, so what this player is working on and how they
          are doing reach the first screen instead of a promise they have
          already taken up. */}
      {known ? (
        <section className="home-hero home-hero--compact">
          <h1>Your next serve</h1>
        </section>
      ) : (
        <section className="home-hero">
          <h1>
            World-class eyes
            <br />
            on your serve.
          </h1>
          <p>
            Film one serve. Get the toss, the load, the swing and the contact measured frame by
            frame — with the fix that matters most.
          </p>
        </section>
      )}

      <div
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={dropFile}
      >
        <div className="home-actions">
          {/* The first clip decides whether anyone comes back, and the four rules
              that make it usable take thirty seconds to read. So the guide is
              shown once, at the moment of intent, rather than waiting behind a
              link nobody taps until their clip has already been rejected. */}
          <button
            className="btn btn--primary btn--big"
            onClick={() => (needsHandedness ? onGuideThen('pick') : pickRef.current?.click())}
          >
            <Icon name="film" size={19} />
            Analyse a serve
          </button>
          {/* Two different routes share this one label on purpose. Both end
              with a serve recorded on this device — the question is only
              whether the phone's own camera app gets there blind or the live
              preview gets there with a running framing verdict on screen the
              whole time, the thing this app can do that a camera app never
              will. Wherever the preview can run, "Record now" opens that one:
              a player who taps the button that says what they want to do
              should not have to separately discover the better way to do it.
              The blind hand-off stays the button's job only where the preview
              cannot start at all, which `previewSupported` already knows
              before either ever renders. */}
          {coarse && canPreview && (
            <button
              className="btn btn--ghost btn--big"
              onClick={() => (needsHandedness ? onGuideThen('check') : setChecking(true))}
            >
              <Icon name="camera" size={19} />
              Record now
            </button>
          )}
          {coarse && !canPreview && (
            <button
              className="btn btn--ghost btn--big"
              onClick={() => (needsHandedness ? onGuideThen('record') : recordRef.current?.click())}
            >
              <Icon name="camera" size={19} />
              Record now
            </button>
          )}
          <input
            ref={pickRef}
            type="file"
            accept="video/*"
            onChange={handle}
            hidden
          />
          <input
            ref={recordRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={handle}
            hidden
          />
        </div>
        {/* Dragging a file is a desktop-only gesture — a touch device has no
            equivalent — so the hint only appears where it is actually true.
            "Drag", never "drop": in this app the drop is the racket drop. */}
        {!coarse && (
          <p className="dropzone-hint">
            <Icon name="upload" size={14} />
            or drag a video file anywhere here
          </p>
        )}
      </div>

      {/* Numbered, in the report's causal order, with the report's own queue
          styles: the order is the instruction. The rung and the check are
          what the report does not say. */}
      {week && week.items.length > 0 && (
        <Suspense fallback={null}>
          <TodayPlan week={week} />
        </Suspense>
      )}

      {week && (
        <section className="block week" aria-labelledby="week-title">
          <div className="block-head">
            <h2 className="block-title" id="week-title">
              This week
            </h2>
            <button className="week-open" onClick={() => onOpen(week.from)}>
              Last report
              <Icon name="chevron" size={14} />
            </button>
          </div>
          {/* A fault fixed lately, and what comes next; then a retired
              fault's re-check when this is its trip (L3.4). Above the list,
              because they say why the list is what it is. */}
          {week.graduated.map((g) => (
            <p className="week-note" key={g.flaw}>
              <Icon name="check" size={15} />
              <span>{g.line}</span>
            </p>
          ))}
          {week.recheck && (
            <p className="week-note week-note--recheck">
              <Icon name="info" size={15} />
              <span>{week.recheck.line}</span>
            </p>
          )}
          {week.items.length > 0 && (
          <ol className="week-list">
            {week.items.map((item, i) => (
              <li className="focus-next-item" key={item.flaw ?? item.drill.name}>
                <span className="focus-next-rank">{i + 1}</span>
                <div className="focus-next-body">
                  <h3 className="focus-next-title">{item.title}</h3>
                  <p className="focus-next-drill">
                    <Icon name="target" size={14} />
                    <span>
                      <strong>{item.drill.name}</strong>
                      {item.step && `, step ${item.step.at} of ${item.step.of}`}
                    </span>
                  </p>
                  <p className="focus-next-why">
                    <Suspense fallback={<Cue text={item.check} />}>
                      <TermCue text={item.check} />
                    </Suspense>
                  </p>
                  {/* Straight to the viewfinder, with this drill as what the
                      next serves are counted for (N1.4). */}
                  {onCheckDrill && onRecorded && item.flaw && (
                    <button
                      type="button"
                      className="chip chip--button week-check"
                      onClick={() => {
                        onCheckDrill(item.flaw!, item.drill.name)
                        setChecking(true)
                      }}
                    >
                      <Icon name="camera" size={14} />
                      Check this drill
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          )}
        </section>
      )}

      {/* The player's form beside This week (L4.10): both in the first screen
          once there is history, above the help straps a returning player has
          already read. */}
      {progress && progress.points.length > 1 && (
        <button className="progress-card" onClick={onShowProgress}>
          <div className="progress-head">
            <span className="block-title">Your form</span>
            <span className="progress-jump">
              Details
              <Icon name="chevron" size={14} />
            </span>
          </div>
          <div className="progress-figures">
            {/* The latest trip's median and what its serves ran over
                (L3.2), against the trip before when both had enough serves
                for the median to stand for them. */}
            <span className="progress-hero tnum">{progress.latestTrip.overall}</span>
            <span className="progress-unit">
              typical serve, {tripDay(progress.latestTrip.createdAt)}
              <br />
              {progress.latestTrip.serves === 1
                ? 'one serve'
                : progress.latestTrip.low === progress.latestTrip.high
                  ? `${progress.latestTrip.serves} serves, all ${progress.latestTrip.low}`
                  : `${progress.latestTrip.serves} serves, ${progress.latestTrip.low}–${progress.latestTrip.high}`}
            </span>
            <DeltaChip delta={progress.tripDelta} scope="trip" />
          </div>
          <Sparkline points={progress.trips} />
          {/* The older serves are still on the sparkline above, greyed and
              labelled, so the clause explains a figure that shrank rather than
              claiming the history is gone. */}
          <span className="progress-foot tnum">
            {`${eraCount} ${eraCount === 1 ? 'serve' : 'serves'} on ${eraTrips} ${eraTrips === 1 ? 'trip' : 'trips'}`}
            {progress.rubricBreakAt ? ' since the scoring changed' : ''}
            {progress.best !== undefined ? ` · best trip ${progress.best}` : ''}
          </span>

          {/* A fact about the training block, not a reward for one — see
              `sixWeekMilestone`. Absent until there has been six weeks of
              comparable serves to say anything true about, and worded the
              same way whichever direction the number moved: nothing here
              can be produced by a tap, so nothing here is a badge for one. */}
          {milestone && <span className="progress-foot tnum">{milestone}</span>}

          {/* A body position the newest trip reached for the first time
              (L3.8): a best a player can picture, rather than a score. */}
          {bodyBest && <span className="progress-foot">{bodyBestLine(bodyBest)}</span>}

          {/* A fact about attendance, counted the same way `sixWeekMilestone`
              insists a fact has to be: nothing here can be produced by a tap,
              only by a clip that went all the way through analysis — see
              `tripStreak`. Silent below two trips for the same reason the
              milestone above is silent before six real weeks: a number this
              small reads as the app inventing a reason to congratulate. */}
          {streak && <span className="progress-foot tnum">{streak}</span>}

          {/* The one actionable thing the app knows, on the first screen rather
              than two taps inside it — when it agrees with "This week" above
              (L1.6). The season's weakest reading and the last report's plan
              are different questions, and printing both answers on one screen
              when they differ gave the player two things they were "working
              on". The plan wins; the season's word stays on Progress. */}
          {practice && agreesWithWeek && (
            <span className={`progress-practice progress-practice--${practice.verdict}`}>
              <Icon name="target" size={14} />
              <span>
                Working on <strong>{practice.label.toLowerCase()}</strong>
                {practice.verdict === 'improving' && ' · improving'}
                {practice.verdict === 'slipping' && ' · slipping'}
              </span>
            </span>
          )}
        </button>
      )}

      <button className="strap" onClick={onShowGuide}>
        <Icon name="info" size={17} />
        <span>
          <strong>How to film it</strong>
          Thirty seconds of setup makes the numbers far sharper.
        </span>
        <Icon name="chevron" size={16} />
      </button>

      {/* Sessions had no way in a player could see (N3.6): a clip over two and
          a half minutes becomes one, and nothing said so. Offered once there
          is a report, until there is a session. */}
      {sessions.length > 0 && practiceSessions.length === 0 && (
        <button className="strap" onClick={() => (needsHandedness ? onGuideThen('pick') : pickRef.current?.click())}>
          <Icon name="target" size={17} />
          <span>
            <strong>Read a whole practice</strong>
            Film it with your camera app, then pick it here. I find every serve in it.
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      {/* The guide's four rules, checked against the camera the player is
          actually holding. Everything the engine gives up on because of where
          the phone was — the depth axis outside eighteen to seventy-eight
          degrees of yaw, a body with one end out of shot, a hand it never found
          — is decided by the framing and knowable before the serve. Until this
          existed the earliest anyone could learn it was half a minute after
          they had finished filming. Offered rather than imposed: it sits below
          both ways in, and both still work without ever opening it.

          Desktop only. On a phone this is what "Record now" above already
          opens — a second control here would be the same destination twice,
          one of them mislabelled as a mere preview. A laptop has no "Record
          now" at all, coarse-pointer-gated as it is, so this strap stays its
          only way to the live check. */}
      {canPreview && !coarse && (
        <button
          className="strap"
          onClick={() => (needsHandedness ? onGuideThen('check') : setChecking(true))}
        >
          <Icon name="camera" size={17} />
          <span>
            <strong>Check your framing first</strong>
            Point the phone at your spot and see what the coach can read.
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      {/* Somebody who has never used this has no serve video on their phone, so
          the only thing the app can currently show them is a file picker. An
          example report is the difference between understanding what this does
          and having to go and film something to find out. */}
      {sessionsLoaded && sessions.length === 0 && (
        <button className="strap strap--quiet" onClick={onShowExample}>
          <Icon name="target" size={17} />
          <span>
            <strong>See an example report</strong>
            What you get back, on a sample serve. No video needed.
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

      {practiceSessions.length > 0 && (
        <section className="block" aria-labelledby="sessions-title">
          <div className="block-head">
            <h2 className="block-title" id="sessions-title">
              Practice sessions
            </h2>
          </div>
          <ul className="recents">
            {practiceSessions.slice(0, 3).map((p) => (
              <li key={p.id}>
                <button className="recent" onClick={() => onOpenPracticeSession?.(p)}>
                  <span className={`session-mark${p.phase === 'done' ? '' : ' is-paused'}`} aria-hidden="true">
                    <Icon name={p.phase === 'done' ? 'film' : 'pause'} size={18} />
                  </span>
                  <span className="recent-text">
                    <strong>{clipLabel(p.fileName) === 'Your clip' ? 'Practice session' : clipLabel(p.fileName)}</strong>
                    <span className="tnum">
                      {new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      {' · '}
                      {sessionLine(p)}
                    </span>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="block">
          <div className="block-head">
            <h2 className="block-title">Recent serves</h2>
            {progress && <span className="block-aside tnum">best {progress.best}</span>}
          </div>
          <ul className="recents">
            {recent.map((s) => (
              <li key={s.id}>
                {/* Literally the same row the history sheet draws — same
                    `.recent` rules, same ring. A past serve was two objects in
                    this app, which made the history read as a separate feature
                    rather than the same list seen somewhere else. */}
                <button className="recent" onClick={() => onOpen(s)}>
                  <ScoreRing score={s.overall} status={s.overallStatus} size={44} animate={false} />
                  <span className="recent-text">
                    <strong>{s.focus.title}</strong>
                    <span>
                      {new Date(s.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {' · '}
                      {s.handedness === 'right' ? 'right' : 'left'}-handed
                    </span>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              </li>
            ))}
          </ul>
          {sessions.length > recent.length && (
            <button className="btn btn--ghost btn--full" onClick={onShowHistory}>
              All {sessions.length} serves
            </button>
          )}
        </section>
      )}

      <footer className="home-foot">
        {offlineReady === undefined ? (
          // Space held, nothing said: the badge height is reserved so the
          // footer does not jump when the cache answers a moment later.
          <span className="badge" aria-hidden="true" style={{ visibility: 'hidden' }}>
            <Icon name="offline" size={15} />
            Checking
          </span>
        ) : offlineReady ? (
          <span className="badge badge--on">
            <Icon name="check" size={15} />
            Ready to use offline
          </span>
        ) : (
          // A button rather than a label, because the label was describing
          // something the player had no way to make happen. Downloading is
          // opt-in and the size is on it: 57 MB is real money on a metered
          // connection, and the honest place to say so is before the tap.
          <button
            className="badge"
            onClick={onMakeOffline}
            disabled={warming !== undefined && warming.stage !== 'failed'}
          >
            <Icon name="offline" size={15} />
            {warming?.stage === 'downloading'
              ? warming.totalMb
                ? `Downloading… ${warming.loadedMb ?? 0} of ${warming.totalMb} MB`
                : `Downloading… ${Math.round((warming.ratio ?? 0) * 100)}%`
              : warming?.stage === 'starting'
                ? 'Setting up…'
                : warming?.stage === 'failed'
                  ? warming.stalled
                    ? 'The download stopped. Tap to try again'
                    : 'Download failed. Tap to try again'
                  : warming?.stage === 'unkept'
                    ? 'Downloaded, but this browser will not keep it'
                    : `Download now to use offline · ${engineMegabytes()} MB`}
          </button>
        )}
        {/* Before the tap, on a connection the browser says is metered (L6.1). */}
        {offlineReady === false && metered && (warming === undefined || warming.stage === 'failed') && (
          <p className="home-foot-warn">
            {metered === 'saveData'
              ? `Data Saver is on. The download is ${engineMegabytes()} MB, so wait for Wi-Fi if you can.`
              : `You are on mobile data. The download is ${engineMegabytes()} MB, so wait for Wi-Fi if you can.`}
          </p>
        )}
        {/* A second, quieter copy of the same news for a screen reader.
            `onProgress` below fires once a network chunk, tens of times over a
            57 MB download — wiring the button's own precise percentage to
            `aria-live` would announce every single one. Rounded to the nearest
            ten, the text in this region only changes ten times across the
            whole download, which is a progress update rather than noise. */}
        {warming && (
          <p className="sr-only" role="status" aria-live="polite">
            {warming.stage === 'downloading'
              ? `Downloading the coach, ${Math.floor((warming.ratio ?? 0) * 10) * 10} percent.`
              : warming.stage === 'starting'
                ? 'Setting up the coach.'
                : warming.stage === 'failed'
                  ? warming.stalled
                    ? 'The download stopped.'
                    : 'Download failed.'
                  : 'Downloaded, but this browser will not keep it.'}
          </p>
        )}
        {/* The signal half follows the cache (L6.2): "with or without a signal"
            was printed under a button offering the download it depends on. */}
        <p>
          Your video stays on this device and never leaves it. Everything runs in your browser
          {offlineReady
            ? ', with or without a signal.'
            : offlineReady === false
              ? ', and works without a signal once it is downloaded.'
              : '.'}
        </p>
      </footer>

      {/* Mounted only while it is open, which is what guarantees the camera is
          released: the component stops its own tracks on unmount, and closing
          the sheet is an unmount. Through `Sheet` for the focus trap and the
          Escape key, rather than a second overlay with its own half of that. */}
      <Sheet open={checking} onClose={() => setChecking(false)} title="Check your framing">
        {/* A recording goes down exactly the path a picked file does. Closing
            the sheet first, so the camera is released before the analysis asks
            the same device for the GPU — and so the player is not left looking
            at a viewfinder while the screen behind it starts working. */}
        <Suspense fallback={null}>
          <FramingCheck
            target={checkTarget}
            onRecorded={
              onRecorded &&
              ((file) => {
                setChecking(false)
                onRecorded(file)
              })
            }
          />
        </Suspense>
      </Sheet>
    </div>
  )
}

/** Where a practice session got to, for its row on the home screen. */
function sessionLine(p: PracticeSession): string {
  const read = p.lines.filter((l) => l.status === 'read').length
  if (p.phase === 'done') {
    const found = p.found?.length ?? 0
    return found === 0 ? 'no serves found' : `${read} of ${found} serves read`
  }
  return p.chosen ? `paused at ${p.lines.length} of ${p.chosen.length}` : 'paused while finding serves'
}
