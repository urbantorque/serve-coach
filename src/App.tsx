import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HandednessPicker from './components/HandednessPicker'
import { Icon, Sheet } from './components/primitives'
import { useBackLayer } from './components/useBackLayer'
import { useWakeLock, wakeLockLine } from './components/useWakeLock'
import { useHistory } from './components/useHistory'
import { useOfflineWarmup } from './components/useOfflineWarmup'
import { useAnalysisRun } from './components/useAnalysisRun'
import { useSets } from './components/useSets'
import { useHistoryLookups } from './components/useHistoryLookups'
import { usePendingDelete } from './components/usePendingDelete'
import { loadAnalysis, loadAnalyzing, loadReport, loadSessionScreen, loadGlance } from './appLoaders'
import { meteredConnection } from './lib/engineDownload'
import { interruptedLine, takeInterrupted } from './lib/interrupted'
import { findPracticeFocus, type PracticeFocus } from './lib/practice'
import HistoryEmpty from './components/HistoryEmpty'
import HistoryList from './components/HistoryList'
import FirstRunDownload from './components/FirstRunDownload'
import { captureAgainWith } from './components/captureAgain'
import { tripDrillCheck } from './lib/tripCheck'
import type { FlawId } from './lib/analysis/flaws'
import { faultMoveOnTrip, rotationMoveOnTrip, scoreMoveAgainst, scoringVersionOf, streakLine, typeOf } from './lib/progress'
import { bestPriorTo } from './lib/bestServe'
import { tossMapFor } from './lib/tossMap'
/*
 * The engine, loaded when there is a serve to read or re-judge and not before.
 * Statically imported it was most of the entry chunk, which every player
 * parses before the home screen draws — including one who only opens a saved
 * report. Each call site below awaits it; after the first analysis it is a
 * resolved module and costs nothing.
 */
import { remember } from './lib/analysisCache'
import type { FaultMove } from './lib/analysis/carryForward'
import type { ServePairFrames } from './lib/analysis/consistency'
import { SCORING_VERSION, type Analysis, type FailedCapture } from './lib/analysis/types'
import { getSession, logPractice, safely, saveSession, tagsById, unlogPractice, type Session } from './lib/storage/db'
import { downloadBackup, isIOS, isInstalled } from './lib/storage/backup'
import { storageNudge } from './lib/storage/nudge'
import { readPrefs, writePrefs, type Prefs } from './lib/storage/prefs'
import { clipIdOf } from './lib/storage/sessionKey'
import type { PracticeSession, SessionStage } from './lib/session/session'
import { clipFor } from './lib/storage/clipStore'
import Home from './screens/Home'

/*
 * Split off the entry chunk. The progress screen, with its charts, share cards
 * and then-and-now pictures, is opened by a returning player a few times a
 * season; the entry chunk is parsed on every cold open, on a phone, often
 * without signal. The service worker precaches every built chunk, so offline
 * this costs nothing but a microtask.
 */
const Progress = lazy(() => import('./screens/Progress'))
/*
 * The report too, which is the larger half: the player, the fundamentals, the
 * comparison panel and the share-card renderer. Nothing on the first screen
 * needs it, and `run` starts fetching it the moment an analysis begins, so it
 * has half a minute to arrive before the report is drawn.
 */
/*
 * The analysing screen, fetched the moment a clip is picked rather than with
 * the home screen (L6.8's bundle note): nobody sees it before choosing a file,
 * and the entry chunk is held under its budget.
 */
const Analyzing = lazy(loadAnalyzing)
const Report = lazy(loadReport)
/*
 * A practice session (L2.4): the screen, and the video work behind it, which
 * brings the engine with it. Both fetched when a long clip is picked.
 */
const SessionScreen = lazy(loadSessionScreen)
/*
 * The glance, fetched when an analysis starts the way the report is: it is
 * only ever drawn after one. And the filming guide, a sheet opened on demand.
 * Both out of the entry, which the level-up work had brought to within two
 * kilobytes of its budget.
 */
const Glance = lazy(loadGlance)
const FilmingGuide = lazy(() => import('./components/FilmingGuide'))
/*
 * The settings and the device check: sheets opened on demand, and the backup
 * code and the device probes behind them. Out of the entry, which had come
 * within half a kilobyte of its budget (L3.4).
 */
const StoragePanel = lazy(() => import('./components/StoragePanel'))
const KeepClipsPanel = lazy(() => import('./components/KeepClipsPanel'))
const CadencePicker = lazy(() => import('./components/CadencePicker'))
const DeviceCheck = lazy(() => import('./components/DeviceCheck'))
const CorpusIngest = lazy(() => import('./components/CorpusIngest'))


/**
 * The analysis the last page load did not live to finish (L6.4), read once
 * when the app's code loads. Not in a state initializer: development's strict
 * mode runs those twice, and the first run would take the marker from the
 * second, which then says nothing.
 */
const INTERRUPTED_AT_LOAD = takeInterrupted()

/**
 * The screen, and the fellow-travellers that are stages of the same machine
 * without being part of this type: `sweep` (the basket comparison filling
 * in), `pair` (the best-vs-worst stills) and the refs below (`urlRef`,
 * `lastFileRef`, `serveTimesRef`, `abortRef`). The progress screen's
 * paired report used to be a third; it moved into `screens/Progress.tsx` with
 * the screen. R7 asked whether that machine should be made
 * explicit — a reducer, a single tagged state. It stays implicit: every one of
 * them is scoped to exactly the screens that read it (`sweep` only
 * `analyzing`, `pair` only `report`), so a single combined state
 * would carry fields most screens never touch rather than removing anything —
 * and every transition below was walked by hand for a screen it could strand
 * and none was found. What follows is that walk, written down rather than
 * repeated: not runtime-enforced, but this is every legal move, and a change
 * that adds one belongs here too.
 *
 * THE TABLE ITSELF NOW LIVES IN `lib/screenFlow.ts`, as data, and a test walks
 * it: nothing is stranded, nothing is unreachable, and no screen exists here
 * that is missing there. It is not a reducer and `App.tsx` does not import it —
 * R7's argument against routing transitions through one still stands. What
 * changed is only that the table is checkable, because this one was written by
 * hand and was wrong in two places, in opposite directions:
 *
 *   · It claimed `analyzing` → `saved`. Nothing does that; `saved` is only ever
 *     reached from `home`.
 *   · It omitted `home` → `error` and `report` → `error`. `run` refuses an
 *     oversized file and a non-video by declared type *before* it sets
 *     `analyzing`, and returns — so the error screen is reachable without the
 *     analysing screen ever being shown.
 *
 * Neither was a bug in the app. Both were a map disagreeing with the ground,
 * which is what a table nothing executes eventually becomes.
 *
 * What is worth keeping here is the reasoning the table cannot carry:
 *
 * `report` ⇄ `report` is re-scoring, re-diagnosing, switching serves, flipping
 *   handedness, or a cache hit — all same-kind. Re-scoring, re-diagnosing and a
 *   cache hit reuse the existing `videoUrl` outright — no seek, no decoder
 *   rebuild, arithmetic or a map lookup on data already in memory. A correction
 *   `recall` has not seen before still goes through `run`, which revokes the
 *   old object URL and mints a new one from the same `File` — a fresh decoder,
 *   because there is no cheaper way to read a clip again.
 * `glance` → `report` does no re-analysis — the same object, a fuller screen.
 * Only `home` and `report` ever call `run` — `openClip` and a correction.
 *
 * `sweep` lives only while `view.kind === 'analyzing'` and a comparison is
 * running; it is always cleared (`undefined` or a fresh one) at every entrance
 * to `analyzing`, and `compareServes`'s `finally` clears it again unless a
 * newer sweep has already taken its place — the `abortRef.current === controller`
 * check that guards every async continuation in this file.
 * `pair` lives only while `view.kind === 'report'`; `run` clears it at every
 * entry, because it does not ride on the analysis the way the report itself
 * does — see the field's own comment.
 */
export type View =
  | { kind: 'home' }
  | { kind: 'analyzing'; fileName: string }
  | { kind: 'report'; analysis: Analysis; videoUrl: string }
  /**
   * The same analysis, said in one number and one line.
   *
   * Only ever reached from a clip recorded inside the app, because that is the
   * only route where the player is demonstrably still on a court holding a
   * phone. A file picked from the camera roll is somebody sitting down with
   * their serve, and the report is the right screen for that.
   */
  /**
   * `move` is the demo route's only way in. Every real glance computes it from
   * the session list at the render site — see `faultMoveOnTrip` — because the
   * comparison depends on what is in storage, and this screen is reachable in
   * production only by recording a serve on a phone. `?demo=glance-move`
   * supplies one directly, for the same reason `?demo=glance-refused` exists:
   * the branch would otherwise never be looked at.
   */
  // A reopened report has no clip, so no `videoUrl` (N1.8).
  | { kind: 'glance'; analysis: Analysis | Session; videoUrl?: string; move?: FaultMove }
  /**
   * `example` marks the simulated serve from "See an example report". It
   * renders with none of the player's own history attached — no deltas
   * against their last serve, no streak, no drill to log — because every one
   * of those would be a real record compared with, or written from, a serve
   * nobody hit.
   */
  | { kind: 'saved'; session: Session; example?: boolean }
  | { kind: 'error'; title: string; hints: string[]; capture?: FailedCapture; fileName?: string }
  /** Every serve so far — see `screens/Progress.tsx`. A screen, not a sheet. */
  | { kind: 'progress' }
  /**
   * A practice session: a clip past `SESSION_SECONDS`, read a serve at a time
   * (L2.4). `canRead` is whether the file is open here; a session reopened
   * from home after a reload is not, and carrying on means picking it again.
   */
  | { kind: 'session'; session: PracticeSession; stage: SessionStage; canRead: boolean }


/**
 * Whether this session may turn a report into a ground-truth fixture.
 *
 * `?fixture`, in the production bundle, for the reason `?check` is: five threads
 * in `NEXT.md` are blocked on somebody filming a real serve, that somebody is
 * standing on a court holding a phone, and a path that only runs in a dev build
 * cannot be run there. A dev build keeps it without the query string, since that
 * is where the labelling actually gets finished.
 *
 * Read once, at module scope, because the query string cannot change without a
 * navigation and a second reader is how a screen and its router come to disagree
 * about which mode the app is in.
 */
const FIXTURE_EXPORT =
  import.meta.env.DEV || new URLSearchParams(location.search).has('fixture')

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' })
  /**
   * The best serve's keyframes beside the worst serve's, for as long as the clip
   * is open.
   *
   * In state rather than on the analysis, which is the difference between this
   * and every other part of the comparison. The spreads ride on the report and
   * therefore survive the back button, reach storage and feed the trend; twelve
   * keyframe stills doing the same would put the largest thing in a stored
   * report there under the heading of a comparison, in an app that already drops
   * stills from older reports before it drops anything else.
   *
   * The cost of that choice is that it does not survive a reload, which is the
   * right way round: `ServeGap` says the same thing in words and does survive.
   */
  const [pair, setPair] = useState<ServePairFrames>()
  /** The kept clip on screen for a reopened report — see the effect beside `shownReport`. */
  const [keptMedia, setKeptMedia] = useState<{ id: string; url: string; bestUrl?: string }>()
  // The saved reports, the practice log and the serve tags, loaded and
  // refreshed together — see `useHistory` (W5.2).
  const {
    sessions,
    sessionsLoaded,
    drillLogs,
    serveTags,
    refresh: refreshSessions,
    applyServeTag,
    practiceSessions,
    tripLedger,
    seed: seedHistory,
    seeded: historySeeded,
  } = useHistory()
  const [sheet, setSheet] = useState<
    'guide' | 'guide-first' | 'history' | 'settings' | 'check' | 'corpus' | null
  >(null)
  /** Bumped to ask the home screen to open its viewfinder. See Home's `openFraming`. */
  const [framingNonce, setFramingNonce] = useState(0)
  /**
   * Where the first-run guide continues to, once it closes.
   *
   * The guide is one sheet shared by three different reasons to open it —
   * pick a video, record one, or just check the framing — and until this
   * existed it only ever remembered one of them: `finishFirstRunGuide` always
   * opened the file picker, whatever the player had actually tapped. A first
   * run through "Record now" got a generic file browser instead of the
   * camera, and "Check your framing first" had no route through the guide at
   * all — seeing R15 in `NEXT.md` for how that surfaced.
   */
  const [firstRunIntent, setFirstRunIntent] = useState<'pick' | 'record' | 'check'>('pick')
  // The offline badge and the download behind it — see `useOfflineWarmup` (W5.2).
  const { offlineReady, warming, makeOffline, recheck: recheckOffline } = useOfflineWarmup()
  // Read once: a connection that turns metered mid-visit is rare, and the line
  // it drives is advice before a tap, not a guard (L6.1).
  // An analysis the last load did not finish, said once on the home screen (L6.4).
  const [interrupted, setInterrupted] = useState(INTERRUPTED_AT_LOAD)
  // The report whose clip could not be kept, when the player keeps them (L6.7).
  const [keepFailedFor, setKeepFailedFor] = useState<string>()
  const [metered] = useState(() => meteredConnection(navigator as Navigator & { connection?: { saveData?: boolean; type?: string } }))
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)

  /** The drill a week-plan "Check this drill" tap chose (N1.4), until it moves. */
  const [checkTarget, setCheckTarget] = useState<{ flaw: FlawId; drill: string }>()

  /** The player moving a fault's ladder a rung, from the report. */
  const moveLadder = useCallback((flaw: string, step: number) => {
    setCheckTarget((t) => (t?.flaw === flaw ? undefined : t))
    setPrefs((p) =>
      writePrefs({ ladder: { ...p.ladder, [flaw]: step }, ladderMovedAt: { ...p.ladderMovedAt, [flaw]: Date.now() } }),
    )
  }, [])
  /**
   * The report on screen looks saved and is not.
   *
   * `safely(() => saveSession(x), undefined)` cannot tell a caller this: its
   * fallback and its success value are both `void`, so the two are the same
   * value. A save that fails after `saveSession`'s own quota retries are
   * exhausted — a device with truly no room left — used to vanish exactly like
   * a successful one, and the player found out only when the serve was not in
   * their history weeks later.
   */
  const [saveWarning, setSaveWarning] = useState<string>()

  const firstRunPickRef = useRef<HTMLInputElement>(null)

  /**
   * Show a report built from a simulated serve.
   *
   * Dynamically imported so the rig that generates it stays out of the initial
   * bundle — it is a few tens of kilobytes that most sessions never need, and
   * the first load already has a pose model to fetch.
   */
  const showExample = useCallback(async () => {
    const { DEMO_DIALS, sampleAnalysis } = await import('./dev/sampleAnalysis')
    const { frames: _f, ...session } = sampleAnalysis(DEMO_DIALS.example)
    void _f
    setView({ kind: 'saved', session, example: true })
  }, [])

  /**
   * Open the guide, remembering which of the three reasons for opening it
   * this is — see `firstRunIntent`.
   */
  const onGuideThen = useCallback((intent: typeof firstRunIntent) => {
    setFirstRunIntent(intent)
    setSheet('guide-first')
  }, [])

  /** Mark the guide as seen and continue to whichever intent opened it. */
  const finishFirstRunGuide = useCallback(() => {
    setPrefs(writePrefs({ seenFilmingGuide: true }))
    setSheet(null)
    if (firstRunIntent === 'check') {
      setFramingNonce((n) => n + 1)
      return
    }
    // After the sheet unmounts, or the click lands on an element being
    // removed. `firstRunPickRef`'s own `capture` attribute already tracks
    // `firstRunIntent` — see where it is rendered — so the same input opens
    // a file browser for "pick" and the camera app for "record".
    setTimeout(() => firstRunPickRef.current?.click(), 60)
  }, [firstRunIntent])

  /**
   * Reload the history, without its keyframe images.
   *
   * Nothing rendered from this list draws a still — the home card and the
   * history sheet draw a ring, a title and a date, and the trend, practice and
   * consistency blocks read numbers. `openSaved` fetches the images back for
   * the one report actually being looked at.
   */
  const practiceRef = useRef<PracticeFocus | undefined>(undefined)
  const historyRef = useRef<{ sessions: Session[]; ladder?: Partial<Record<string, number>> }>({ sessions: [] })

  /**
   * Save a report and say so when it did not work.
   *
   * `saveSession` already retries through its own pressure ladder — stripping
   * stills, then deleting the oldest reports — before it ever throws, so a
   * failure reaching here means that ladder ran out of room. Cleared before the
   * attempt rather than only on success, so a warning from the last report never
   * outlives it by even one frame: `setView` for the new report and this run in
   * the same synchronous stretch of `run`, so React batches them into one paint.
   */
  const trySave = useCallback(
    async (analysis: Analysis) => {
      setSaveWarning(undefined)
      try {
        await saveSession(analysis)
      } catch {
        setSaveWarning(
          'This report could not be saved — your device has run out of storage. Export your history from Your serves, or free up space and analyse it again.',
        )
      }
      refreshSessions()
    },
    [refreshSessions],
  )

  /**
   * Record that the drill on the practice card was done.
   *
   * Stamped with the moment it was tapped rather than the moment the card was
   * rendered — the card can sit on a home screen for a week, and a record dated
   * from the render would be evidence about the wrong session.
   */
  const logDrill = useCallback(() => {
    if (!practiceRef.current) return
    const f = practiceRef.current
    const now = Date.now()
    void safely(
      () =>
        logPractice({
          id: `${f.metricId}-${now}`,
          metricId: f.metricId,
          drill: f.drill.name,
          // The app does not record when the card first offered it, so this is
          // the same instant. The field is kept because "assigned and not done"
          // is a state worth being able to write later, and a reader that has
          // to guess whether it is meaningful is worse than one told plainly.
          assignedAt: now,
          doneAt: now,
        }),
      undefined,
    ).then(refreshSessions)
  }, [refreshSessions])

  /** Take back the most recent one for this measurement. */
  const undoDrill = useCallback(() => {
    const f = practiceRef.current
    if (!f || !drillLogs?.length) return
    const last = drillLogs.filter((l) => l.metricId === f.metricId)[0]
    if (!last) return
    void safely(() => unlogPractice(last.id), undefined).then(refreshSessions)
  }, [drillLogs, refreshSessions])

  /**
   * Open a stored report, fetching the keyframe stills it needs on the way.
   *
   * Falls back to the summary if the read fails rather than refusing to open:
   * a report with no images in its phase strip is still the report, and the
   * strip already handles a phase that never got a thumbnail.
   */
  const openSaved = useCallback((summary: Session) => {
    setView({ kind: 'saved', session: summary })
    void safely(() => getSession(summary.id), undefined).then((full) => {
      if (full) setView((v) => (v.kind === 'saved' && v.session.id === full.id ? { kind: 'saved', session: full } : v))
    })
  }, [])

  // Not type-restricted, unlike `bestGapFor` below — a streak is about
  // showing up at all, across every serve type, the same choice `Home.tsx`
  // already makes with its own copy of this same call.
  const streak = useMemo(
    () => streakLine(sessions, Date.now(), { ledger: tripLedger, cadence: prefs.cadence, practice: practiceSessions }),
    [sessions, tripLedger, prefs.cadence, practiceSessions],
  )
  const practice = useMemo(
    () => findPracticeFocus(sessions, undefined, undefined, drillLogs, prefs.ladder),
    [sessions, drillLogs, prefs.ladder],
  )

  // Read by `logDrill`, which is declared above this and would otherwise have to
  // be redefined every time the focus changes — and it is handed to a button
  // that must not be replaced under the player's finger.
  practiceRef.current = practice

  // Sets of ten — see `useSets` (L6.11).
  const { startSet, glanceSet, bestSets } = useSets({ prefs, setPrefs, sessions, serveTags })
  // Read by the sweep, which is declared once and would otherwise judge a
  // basket against the history it was created with (L3.4).
  historyRef.current = { sessions, ladder: prefs.ladder }
  // What a report is set against — see `useHistoryLookups` (L6.11).
  const { bestGapFor, glanceStrainLine, strainBehindFor, bestScoreFor, gapDeltaForView, priorTo } = useHistoryLookups({
    sessions,
    tripLedger,
  })

  // Reading a clip, from the pick to the report — see `useAnalysisRun` (L6.11).
  const {
    progress,
    sweep,
    lastFileRef,
    urlRef,
    run,
    openClip,
    stopSweep,
    stopSession,
    releaseVideo,
    cancel,
    startSession,
    sessionRunning,
    openPracticeSession,
    compareServes,
    closeSessionVideo,
  } = useAnalysisRun({
    view,
    setView,
    prefs,
    setPrefs,
    sessions,
    refreshSessions,
    trySave,
    setPair,
    recheckOffline,
    historyRef,
    setKeepFailedFor,
    setInterrupted,
  })

  useEffect(() => {
    // `?check` opens the device report. Deliberately NOT dev-only, unlike
    // `?demo` below: its whole purpose is to be run on a phone, and a dev build
    // is the one place it can tell nobody anything. It is a URL rather than a
    // navigation path because that is what can be handed to somebody standing
    // on a baseline.
    if (new URLSearchParams(location.search).has('check')) setSheet('check')

    // The installed icon's long-press shortcuts — see `shortcuts` in
    // vite.config.ts. Production, unlike `?demo`: a shortcut is a way in.
    const opening = new URLSearchParams(location.search).get('open')
    if (opening === 'progress') setView({ kind: 'progress' })
    if (opening === 'guide') setSheet('guide')

    // `?corpus` turns a folder of clips into landmark dumps — see CORPUS.md.
    // Dev only, unlike `?check`: it is a tool for building the engine, not for
    // a player standing on a baseline, and it has no business in the bundle a
    // player downloads.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('corpus')) {
      setSheet('corpus')
    }

    // Dev-only: `?demo` renders a report from a simulated serve, so the UI can
    // be worked on without filming one. Dynamically imported so it is not in
    // the production bundle.
    const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo')
    if (demo !== null && demo !== false) {
      void import('./dev/demoRoutes').then(({ runDemoRoute }) =>
        runDemoRoute(demo, {
          setView,
          setPair,
          seedHistory,
          keepVideoUrl: (url) => {
            urlRef.current = url
          },
        }),
      )
    }
  }, [seedHistory, urlRef])


  const goHome = () => {
    // The clip goes with the report (L6.10). Home holding its object URL kept
    // the update gate above shut — it waits for no video to be held — so a
    // player who had looked at a report never got a waiting update until
    // they analysed again.
    releaseVideo()
    setView({ kind: 'home' })
    refreshSessions()
  }

  const captureAgain = captureAgainWith({ goHome, setFramingNonce, setFirstRunIntent, pickRef: firstRunPickRef })

  /** Off the session screen: the reading stops with its place kept, and the video goes. */
  const leaveSession = () => {
    closeSessionVideo()
    releaseVideo()
    lastFileRef.current = undefined
    goHome()
  }


  /*
   * Back from any screen but home comes home, the way the on-screen back
   * arrow does. Analysing is the exception with two meanings: a single serve
   * has nothing to show yet, so back cancels it; a basket sweep was launched
   * from a report and every serve it has finished is real, so back stops it
   * and keeps them — the same split as the analysing screen's own button.
   * Sheets carry their own layer in `Sheet`, so one open over a screen closes
   * first.
   */
  /*
   * A new screen starts at its top. The shell is one scrolling document, so
   * without this a report opened from halfway down the home screen opened
   * halfway down itself — past its own score, and on the example, past the
   * banner saying it was one. Keyed on the kind alone: re-scoring a report
   * swaps the analysis in place and must leave the player where they were.
   */
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view.kind])

  // A locked screen stalls the analysis; see `useWakeLock`.
  const wakeLock = useWakeLock(view.kind === 'analyzing' || sessionRunning)

  useBackLayer(view.kind !== 'home', () => {
    // Back stops a session that is reading and keeps it; from anywhere else it leaves.
    if (view.kind === 'session') {
      if (view.stage.state === 'running') stopSession('player')
      else leaveSession()
      return
    }
    if (view.kind === 'analyzing') {
      if (sweep) stopSweep()
      else cancel()
      return
    }
    goHome()
  })

  // An undoable delete — see `usePendingDelete` (L6.11).
  const { pendingDelete, commitDelete, remove, undoDelete } = usePendingDelete({ refreshSessions })
  const closeHistory = () => {
    commitDelete(pendingDelete)
    setSheet(null)
  }

  /*
   * The session before this one, to set it against (L2.8): finished, the same
   * serve type and scored on the same rubric, so the two are read alike.
   */
  const previousSession =
    view.kind === 'session'
      ? practiceSessions
          .filter(
            (p) =>
              p.id !== view.session.id &&
              p.phase === 'done' &&
              p.serveType === view.session.serveType &&
              p.scoringVersion !== undefined &&
              p.scoringVersion === view.session.scoringVersion &&
              p.createdAt < view.session.createdAt,
          )
          .sort((a, b) => b.createdAt - a.createdAt)[0]
      : undefined

  // The report on screen, live or reopened, and the live one when there is one
  // — see the single `<Report>` below (W5.3).
  const liveReport = view.kind === 'report' ? view : undefined
  const shownReport = liveReport?.analysis ?? (view.kind === 'saved' && !view.example ? view.session : undefined)
  // A reopened report's kept clip, and its best serve's (D6.4) — read from the
  // device as object URLs, and revoked when the report changes.
  const reopenedId = liveReport ? undefined : shownReport?.id
  const reopenedBestId = shownReport && !liveReport
    ? bestPriorTo(sessions, shownReport.createdAt, typeOf(shownReport), scoringVersionOf(shownReport))?.id
    : undefined
  useEffect(() => {
    if (!reopenedId) return
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      const own = await clipFor(clipIdOf(reopenedId))
      if (!own || cancelled) return
      // The best serve may come from the same basket video, which then plays
      // twice from one file, each copy from its own toss.
      const sameClip = reopenedBestId !== undefined && clipIdOf(reopenedBestId) === clipIdOf(reopenedId)
      const best = reopenedBestId && !sameClip ? await clipFor(clipIdOf(reopenedBestId)) : undefined
      if (cancelled) return
      const url = URL.createObjectURL(own)
      const bestUrl = sameClip ? url : best ? URL.createObjectURL(best) : undefined
      urls.push(url, ...(bestUrl && bestUrl !== url ? [bestUrl] : []))
      setKeptMedia({ id: reopenedId, url, bestUrl })
    })()
    return () => {
      cancelled = true
      for (const u of urls) URL.revokeObjectURL(u)
      setKeptMedia(undefined)
    }
  }, [reopenedId, reopenedBestId])

  return (
    <div className="app">
      <main className="shell">
        <Suspense fallback={null}>
          {view.kind === 'home' && (
            <Home
              sessions={sessions}
              ledger={tripLedger}
              cadence={prefs.cadence}
              offlineReady={offlineReady}
              metered={metered}
              interrupted={interrupted ? interruptedLine() : undefined}
              nudge={storageNudge({
                ios: isIOS(),
                installed: isInstalled(),
                loaded: sessionsLoaded,
                filed: sessions.map((s) => s.createdAt),
                lastExportedAt: prefs.lastExportedAt,
                quietedAt: prefs.moveQuietedAt,
                now: Date.now(),
              })}
              onExportBackup={() =>
                void downloadBackup()
                  .then(() => setPrefs(readPrefs()))
                  .catch(() => {})
              }
              onQuietMove={() => setPrefs(writePrefs({ moveQuietedAt: Date.now() }))}
              sessionsLoaded={sessionsLoaded}
              onPick={(f) => void openClip(f)}
              onRecorded={(f) => void openClip(f, true)}
              openFraming={framingNonce}
              checkTarget={checkTarget?.drill}
              onCheckDrill={(flaw, drill) => setCheckTarget({ flaw: flaw as FlawId, drill })}
              onOpen={openSaved}
              ladder={prefs.ladder}
              onShowGuide={() => setSheet('guide')}
              onShowHistory={() => setSheet('history')}
              onShowSettings={() => setSheet('settings')}
              onShowProgress={() => setView({ kind: 'progress' })}
              needsHandedness={!prefs.handedness}
              onGuideThen={onGuideThen}
              onShowExample={() => void showExample()}
              practiceSessions={practiceSessions}
              onOpenPracticeSession={openPracticeSession}
              onMakeOffline={() => void makeOffline()}
              warming={warming}
            />
          )}

          {view.kind === 'analyzing' && (
            <Analyzing
              progress={progress}
              fileName={view.fileName}
              sweep={sweep}
              onCancel={sweep ? stopSweep : cancel}
              racket={prefs.handedness ?? 'right'}
              screenLine={wakeLockLine(wakeLock)}
              history={sessions}
              cold={offlineReady === false}
            />
          )}

          {view.kind === 'session' && (
            <SessionScreen
              session={view.session}
              previous={previousSession}
              videoUrl={view.canRead ? urlRef.current : undefined}
              stage={view.stage}
              canRead={view.canRead}
              onStart={(mode) => void startSession(mode)}
              onStop={() => stopSession('player')}
              onPickAgain={() => {
                setFirstRunIntent('pick')
                setTimeout(() => firstRunPickRef.current?.click(), 0)
              }}
              onLeave={leaveSession}
            />
          )}

          {view.kind === 'glance' && (
            <Glance
              analysis={view.analysis}
              // Whether the fault the previous serve on this trip was told about
              // actually moved — see `faultMove`. Computed here rather than in
              // the screen because it needs the session list, which the glance
              // has no business holding; recomputed per render because it is two
              // array walks over a list already in memory and the screen it
              // feeds is only ever mounted one at a time.
              move={view.move ?? faultMoveOnTrip(sessions, view.analysis)}
              rotation={rotationMoveOnTrip(sessions, view.analysis)}
              // Against the serve the report's hero sets it beside, so "your
              // last serve" is one serve on both screens. A glance is always a
              // fresh analysis, so its rubric is this build's.
              scoreMove={scoreMoveAgainst(
                view.analysis,
                view.analysis.scoringVersion ?? SCORING_VERSION,
                priorTo(view.analysis.createdAt, typeOf(view.analysis)),
              )}
              // The one recurring joint warning this serve raised — see
              // `glanceStrain`. Same reasoning as `move` above: it needs the
              // session list, which this screen has no business holding.
              strain={glanceStrainLine(view.analysis)}
              tripCheck={tripDrillCheck(sessions, view.analysis, prefs.ladder, prefs.ladderMovedAt, checkTarget?.flaw)}
              onLadderStep={moveLadder}
              speak={prefs.speakGlance}
              onToggleSpeak={(on) => setPrefs(writePrefs({ speakGlance: on }))}
              onBack={goHome}
              // Home owns the viewfinder sheet, so going back and reopening it is
              // the honest route — and it releases this clip's object URL on the
              // way, which a second recording would otherwise leak.
              onRecordAnother={() => {
                goHome()
                setFramingNonce((n) => n + 1)
              }}
              onOpenReport={() =>
                setView(
                  view.videoUrl && 'frames' in view.analysis
                    ? { kind: 'report', analysis: view.analysis, videoUrl: view.videoUrl }
                    : { kind: 'saved', session: view.analysis },
                )
              }
              /*
               * The two taps, and they were unreachable until now.
               *
               * The serve-number block shipped with its screen three rounds ago
               * and nothing ever passed `onTagServe`, so it has never rendered in
               * the running app — found while wiring the outcome tap beside it,
               * which would have shipped the same way.
               *
               * One row carries both facts and one tap must not clear the other,
               * which is what `withServeTag` is for. A row left saying nothing is
               * deleted rather than stored.
               */
              serveNumber={tagsById(serveTags).get(view.analysis.id)?.serveNumber}
              outcome={tagsById(serveTags).get(view.analysis.id)?.outcome}
              onTagServe={(n) => void applyServeTag(view.analysis.id, { serveNumber: n })}
              onTagOutcome={(o) => void applyServeTag(view.analysis.id, { outcome: o })}
              set={glanceSet(view.analysis)}
              onStartSet={startSet}
              bestSets={bestSets}
              onStopSet={() => setPrefs(writePrefs({ activeSet: undefined }))}
            />
          )}

          {/*
           * One report, live or reopened (W5.3). Everything a report shows from
           * the history — the last serve, the best, the toss map, the tags, the
           * records, the practice — is passed the same way to both, so a
           * reopened report cannot fall a prop behind a live one again. What
           * only a live report can do — re-read the clip, rescore it, re-judge
           * it, compare a basket — needs the frames, so it is passed only when
           * there are frames.
           */}
          {shownReport && (
            <Report
              /*
               * Keyed, so the report's own state cannot outlive the report.
               *
               * Two things in there are decisions about one specific serve: having
               * chosen to see the numbers off a clip that was refused, and having
               * hidden the spreads. Switching serves inside a basket is a cache
               * hit, which swaps the analysis without passing through the
               * analysing screen — so without a key the component is never
               * remounted, and serve three's override silently applies to serve
               * two's refusal.
               */
              key={shownReport.id}
              analysis={shownReport}
              videoUrl={liveReport?.videoUrl}
              previous={priorTo(shownReport.createdAt, typeOf(shownReport))}
              best={bestPriorTo(sessions, shownReport.createdAt, typeOf(shownReport), scoringVersionOf(shownReport))}
              serveNumber={tagsById(serveTags).get(shownReport.id)?.serveNumber}
              outcome={tagsById(serveTags).get(shownReport.id)?.outcome}
              onTagServe={(n) => void applyServeTag(shownReport.id, { serveNumber: n })}
              onTagOutcome={(o) => void applyServeTag(shownReport.id, { outcome: o })}
              tossMap={tossMapFor(shownReport, sessions, serveTags)}
              kept={keptMedia?.id === shownReport.id ? { url: keptMedia.url, bestUrl: keptMedia.bestUrl } : undefined}
              keepsClips={Boolean(prefs.keepClips)}
              keepFailed={keepFailedFor === shownReport.id}
              fixtureExport={FIXTURE_EXPORT}
              onBack={goHome}
              onAnalyzeAnother={() => captureAgain(shownReport.capture ? 'framing' : 'pick')}
              onFilmAgain={() => captureAgain('framing')}
              bestGap={bestGapFor(typeOf(shownReport))}
              basketGapDelta={gapDeltaForView(shownReport.id, typeOf(shownReport))}
              bestScore={bestScoreFor(typeOf(shownReport))}
              streak={streak}
              strainBehind={strainBehindFor(shownReport.createdAt)}
              practice={practice}
              onLogDrill={logDrill}
              onUndoDrill={practice?.drilled ? undoDrill : undefined}
              ladder={prefs.ladder}
              onLadderStep={moveLadder}
              // From a reopened report too (N1.8): the glance reads the report,
              // never the clip.
              onGlance={() =>
                setView(
                  liveReport
                    ? { kind: 'glance', analysis: liveReport.analysis, videoUrl: liveReport.videoUrl }
                    : { kind: 'glance', analysis: shownReport },
                )
              }
              onFlipHandedness={
                liveReport && lastFileRef.current
                  ? () => {
                      // Correcting the badge is the player stating which hand they
                      // serve with, so it is remembered rather than being asked
                      // again on the next clip.
                      const flipped = liveReport.analysis.handedness === 'right' ? 'left' : 'right'
                      setPrefs(writePrefs({ handedness: flipped }))
                      void run(lastFileRef.current!, flipped, liveReport.analysis.serves.index)
                    }
                  : undefined
              }
              onPickServe={
                liveReport && lastFileRef.current
                  ? (i) => void run(lastFileRef.current!, liveReport.analysis.handedness, i)
                  : undefined
              }
              onPickServeType={
                liveReport
                  ? async (serveType) => {
                      // Remembered, because a player working on their kick serve is
                      // going to film several of them in a row.
                      setPrefs(writePrefs({ serveType }))
                      // The serve type moves target bands and nothing measured, so
                      // this is arithmetic on frames already in memory rather than
                      // another pass over the video. Instant, where re-running would
                      // be half a minute to arrive at the same numbers.
                      const rescored = (await loadAnalysis()).rescore(liveReport.analysis, serveType)
                      if (rescored) {
                        remember({ sessionKey: rescored.id, handedness: rescored.handedness }, rescored)
                        setView({ kind: 'report', analysis: rescored, videoUrl: liveReport.videoUrl })
                        void trySave(rescored)
                      } else if (lastFileRef.current) {
                        void run(
                          lastFileRef.current,
                          liveReport.analysis.handedness,
                          liveReport.analysis.serves.index,
                          serveType,
                        )
                      }
                    }
                  : undefined
              }
              statedTier={liveReport ? prefs.tier : undefined}
              onPickTier={
                liveReport
                  ? async (tier) => {
                      // Remembered for the next clip, and applied to this one
                      // without touching the video: the tier moves which band every
                      // signal is judged against and nothing that was measured, so
                      // re-reading the clip would spend half a minute arriving at
                      // the same landmarks.
                      setPrefs(writePrefs({ tier }))
                      const rejudged = (await loadAnalysis()).rediagnose(liveReport.analysis, tier)
                      if (!rejudged) return
                      remember({ sessionKey: rejudged.id, handedness: rejudged.handedness }, rejudged)
                      setView({ kind: 'report', analysis: rejudged, videoUrl: liveReport.videoUrl })
                      void trySave(rejudged)
                    }
                  : undefined
              }
              onCheckConsistency={
                liveReport && lastFileRef.current && liveReport.analysis.serves.count > 1
                  ? () => void compareServes(liveReport.analysis)
                  : undefined
              }
              servePair={liveReport ? pair : undefined}
              saveWarning={liveReport ? saveWarning : undefined}
            />
          )}

          {view.kind === 'progress' && (
            <Progress
              sessions={sessions}
              ledger={tripLedger}
              cadence={prefs.cadence}
              practiceSessions={practiceSessions}
              tags={serveTags}
              sets={prefs.sets}
              ladder={prefs.ladder}
              practice={practice}
              onLogDrill={logDrill}
              onUndoDrill={undoDrill}
              seeded={historySeeded}
              onBack={goHome}
            />
          )}

          {view.kind === 'saved' && view.example && (
            <Report
              key={view.session.id}
              analysis={view.session}
              example
              onBack={goHome}
              onAnalyzeAnother={goHome}
            />
          )}

          {view.kind === 'error' && (
            <div className="screen empty">
              <div className="empty-inner">
                <span className="empty-mark">
                  <Icon name="warn" size={26} />
                </span>
                <h1>{view.title}</h1>
                <ul className="empty-hints">
                  {view.hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
                <button className="btn btn--primary btn--full" onClick={() => captureAgain('pick')}>
                  Try another video
                </button>
                <button className="btn btn--ghost btn--full" onClick={() => captureAgain('framing')}>
                  Check your framing
                </button>
                <button className="btn btn--ghost btn--full" onClick={() => setSheet('guide')}>
                  How to film it
                </button>
                {/* Dev-only: file this refusal as a ground-truth fixture. The
                    import is dynamic so none of it reaches the production bundle. */}
                {import.meta.env.DEV && view.capture && (
                  <button
                    className="btn btn--ghost btn--full"
                    onClick={() => {
                      const { capture, fileName, title } = view
                      if (!capture) return
                      void import('./dev/exportFixture').then((m) =>
                        m.downloadRejectedFixture(capture, fileName ?? 'refused-clip', title),
                      )
                    }}
                  >
                    Save refusal as test fixture
                  </button>
                )}
              </div>
            </div>
          )}
        </Suspense>
      </main>

      <Sheet
        open={sheet === 'guide'}
        onClose={() => {
          // Reading the rules here is the same fact as reading them inside
          // the first-run guide — a stranger who opens this one first must
          // not be shown the identical four rules again the moment they tap
          // into an analysis. Handedness is untouched: this sheet never asks
          // for it, so `needsHandedness` still gates the interstitial on it.
          setPrefs(writePrefs({ seenFilmingGuide: true }))
          setSheet(null)
        }}
        title="How to film your serve"
      >
        <Suspense fallback={null}>
          <FilmingGuide racket={prefs.handedness ?? 'right'} />
        </Suspense>
      </Sheet>

      {/* The same guide, shown once before the very first clip, with the hand
          on the end of it so reading it is on the way to the task rather than a
          detour away from it.

          The hand and nothing else. A rating used to be asked for here too, and
          it is the one question this screen cannot help with: it comes before
          the player has filmed anything, so there is no estimate to show them
          and no report to check the answer against — and "work it out for me"
          was both the default and the right answer, which makes it a question
          standing between somebody and their first clip for no gain. The engine
          estimates a rung from the serve itself, and the report says which one
          it used and offers to change it, where the targets it moves are on
          screen to be judged against. */}
      <Sheet
        open={sheet === 'guide-first'}
        onClose={() => {
          setPrefs(writePrefs({ seenFilmingGuide: true }))
          setSheet(null)
        }}
        title={prefs.seenFilmingGuide ? 'One more thing' : 'First, how to film it'}
      >
        {/* Skipped for a stranger who already read the rules through the
            read-only "How to film it" strap — showing the same four rules
            twice was R17's fix. Handedness still has to be asked either way,
            which is why this sheet opens at all: `needsHandedness` in
            `Home.tsx` gates on the hand, not on the rules. */}
        {!prefs.seenFilmingGuide && (
          <Suspense fallback={null}>
            <FilmingGuide racket={prefs.handedness ?? 'right'} />
          </Suspense>
        )}
        {/* The hand is the one thing that has to be right before the first clip:
            every swing measurement is read off the racket arm, and the detector
            cross-checks a stated hand rather than being overridden by it. */}
        <HandednessPicker
          value={prefs.handedness}
          onChange={(handedness) => setPrefs(writePrefs({ handedness }))}
        />
        <FirstRunDownload ready={offlineReady} busy={warming !== undefined && warming.stage !== 'failed'} onDownload={() => void makeOffline()} />
        <button
          className="btn btn--primary btn--full"
          onClick={finishFirstRunGuide}
          disabled={!prefs.handedness}
        >
          <Icon name="film" size={18} />
          {!prefs.handedness
            ? 'Pick a hand to continue'
            : firstRunIntent === 'record'
              ? 'Got it — open my camera'
              : firstRunIntent === 'check'
                ? 'Got it — check my framing'
                : 'Got it — choose my video'}
        </button>
      </Sheet>

      {/* Shared by "pick" and "record" — `capture` is the only difference
          between a generic file browser and the phone's camera app, and
          setting it from `firstRunIntent` here means `finishFirstRunGuide`
          only has to click one ref rather than choose between two. Absent
          entirely for "check", which never reaches this input at all. */}
      <input
        ref={firstRunPickRef}
        type="file"
        accept="video/*"
        capture={firstRunIntent === 'record' ? 'environment' : undefined}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openClip(file)
        }}
      />

      <Sheet open={sheet === 'history'} onClose={closeHistory} title="Your serves">
        {pendingDelete && (
          <p className="storage-note undo-row" role="status">
            <Icon name="trash" size={15} />
            <span>Serve deleted.</span>
            <button className="levelled-btn" onClick={undoDelete}>
              Undo
            </button>
          </p>
        )}
        {sessions.filter((s) => s.id !== pendingDelete).length === 0 ? (
          <HistoryEmpty
            onAnalyse={() => {
              setSheet(null)
              if (prefs.handedness) captureAgain('pick')
              else onGuideThen('pick')
            }}
            onExample={() => {
              setSheet(null)
              void showExample()
            }}
          />
        ) : (
          <HistoryList
            sessions={sessions.filter((s) => s.id !== pendingDelete)}
            onOpen={(s) => {
              setSheet(null)
              openSaved(s)
            }}
            onDelete={remove}
          />
        )}
        {/* Follows the setting (L6.7). Passive on purpose, as `jsxCopy.test.ts`
            ruled when it was plain text: the promise is that nobody does the
            keeping — no server, no account. */}
        <p className="sheet-note">
          {prefs.keepClips
            ? 'Reports, and the videos you chose to keep, stay on this device only.'
            : 'Reports are kept on this device only. The video itself is never saved.'}
        </p>
        <button className="btn btn--ghost btn--full history-backup" onClick={() => setSheet('settings')}>
          <Icon name="upload" size={17} />
          Back up or restore
        </button>
      </Sheet>

      {/*
       * The choices that used to be trapped elsewhere. Handedness could only be
       * changed by re-running a report, the backup sat at the foot of the
       * history list, and the device check — a diagnostic for a court trip,
       * not for playing — sat in that same list as though it were a feature.
       */}
      <Sheet open={sheet === 'settings'} onClose={() => setSheet(null)} title="Settings">
        <HandednessPicker
          value={prefs.handedness}
          onChange={(handedness) => setPrefs(writePrefs({ handedness }))}
        />
        <Suspense fallback={null}>
          <CadencePicker value={prefs.cadence} onChange={(cadence) => setPrefs(writePrefs({ cadence }))} />
          <StoragePanel count={sessions.length} onImported={refreshSessions} />
          <KeepClipsPanel keep={Boolean(prefs.keepClips)} onChange={(keepClips) => setPrefs(writePrefs({ keepClips }))} />
        </Suspense>
        <h3 className="t-overline settings-head">This phone</h3>
        <button className="btn btn--ghost btn--full" onClick={() => setSheet('check')}>
          <Icon name="info" size={17} />
          What this phone can do
        </button>
      </Sheet>

      <Sheet open={sheet === 'check'} onClose={() => setSheet(null)} title="What this phone can do">
        <Suspense fallback={null}>
          <DeviceCheck />
        </Suspense>
      </Sheet>

      {/* Dev only. The import is dynamic so neither the ingest nor the pipeline
          it drives reaches the production bundle. */}
      {import.meta.env.DEV && sheet === 'corpus' && (
        <Sheet open onClose={() => setSheet(null)} title="Build a corpus">
          <Suspense fallback={null}>
            <CorpusIngest />
          </Suspense>
        </Sheet>
      )}

    </div>
  )
}
