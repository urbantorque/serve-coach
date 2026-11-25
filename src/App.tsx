import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon, Sheet } from './components/primitives'
import AppSheets, { type AppSheet } from './components/AppSheets'
import TabBar from './components/TabBar'
import { useBackLayer } from './components/useBackLayer'
import { PageNav } from './components/pageNav'
import { PAYMENTS } from './lib/billing/config'
import { useWakeLock, wakeLockLine } from './components/useWakeLock'
import { useHistory } from './components/useHistory'
import { useOfflineWarmup } from './components/useOfflineWarmup'
import { useAnalysisRun } from './components/useAnalysisRun'
import { useSets } from './components/useSets'
import { useHistoryLookups } from './components/useHistoryLookups'
import { loadAnalysis, loadAnalyzing, loadReport, loadSessionScreen, loadGlance } from './appLoaders'
import { meteredConnection } from './lib/engineDownload'
import { interruptedLine, takeInterrupted } from './lib/interrupted'
import { findPracticeFocus, type PracticeFocus } from './lib/practice'
import { captureAgainWith } from './components/captureAgain'
import { previewSupported } from './lib/framing/access'
import { withTransition } from './components/viewTransition'
import { leaveForHome } from './components/runDecisions'
import { forgetAll } from './lib/analysisCache'
import type { FlawId } from './lib/analysis/flaws'
import { faultMoveOnTrip, rotationMoveOnTrip, scoreMoveAgainst, scoringVersionOf, streakLine, typeOf } from './lib/progress'
import { bestPriorTo } from './lib/bestServe'
import { selfRead } from './lib/selfRead'
import { momentOn } from './lib/moments'
import { unlockEarcons } from './lib/earcon'
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
import { parsePath, pathFor, titleFor, type InfoPageId } from './lib/routes'
import { getPracticeSession, getSession, logPractice, safely, saveSession, tagsById, unlogPractice, type Session } from './lib/storage/db'
import { downloadBackup, isIOS, isInstalled } from './lib/storage/backup'
import { storageNudge } from './lib/storage/nudge'
import { readPrefs, writePrefs, type Prefs } from './lib/storage/prefs'
import { clipIdOf } from './lib/storage/sessionKey'
import type { PracticeSession, SessionStage } from './lib/session/session'
import { clipFor, keptClips } from './lib/storage/clipStore'
import type { KeptOther } from './screens/Report'
import { guessServeNumber } from './lib/serveGuess'
import type { ProtectionStatus, RecoveryOffer } from './lib/storage/protect'
import Home from './screens/Home'
import { deviceNoun } from './lib/device'

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
/** The camera, a full-screen sheet: the viewfinder and its pose loop load with the tap. */
const FramingCheck = lazy(() => import('./components/FramingCheck'))
const InfoPage = lazy(() => import('./screens/InfoPage'))


/**
 * The analysis the last page load did not live to finish (L6.4), read once
 * when the app's code loads. Not in a state initializer: development's strict
 * mode runs those twice, and the first run would take the marker from the
 * second, which then says nothing.
 */
const INTERRUPTED_AT_LOAD = takeInterrupted()

/**
 * The screen. The legal moves between these are data in `lib/screenFlow.ts`, and
 * a test walks them: nothing is stranded, nothing is unreachable, and no screen
 * here is missing there.
 *
 * `report` to `report` is re-scoring, re-diagnosing, switching serves or flipping
 * handedness. `glance` to `report` does no re-analysis. Only `home` and `report`
 * ever call `run`.
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
  | {
      kind: 'error'
      title: string
      hints: string[]
      capture?: FailedCapture
      fileName?: string
      /** Nothing about the filming: the same clip may well read on another go. */
      again?: boolean
    }
  /** Every serve so far — see `screens/Progress.tsx`. A screen, not a sheet. */
  | { kind: 'progress'; serves?: boolean }
  /**
   * A practice session: a clip past `SESSION_SECONDS`, read a serve at a time
   * (L2.4). `canRead` is whether the file is open here; a session reopened
   * from home after a reload is not, and carrying on means picking it again.
   */
  | { kind: 'session'; session: PracticeSession; stage: SessionStage; canRead: boolean }
  /** How sure I am, privacy, terms or credits (N6.3): read, not used. */
  | { kind: 'page'; page: InfoPageId }


/**
 * Whether this session may turn a report into a ground-truth fixture.
 *
 * `?fixture`, in the production bundle, for the reason `?check` is: five threads
 * in `NEXT.md` are blocked on somebody filming a real serve, that somebody is
 * standing on a court holding a phone, and a path that only runs in a dev build
 * cannot be run there.
 *
 * Read once, at module scope, because the query string cannot change without a
 * navigation and a second reader is how a screen and its router come to disagree
 * about which mode the app is in.
 */
const FIXTURE_EXPORT = new URLSearchParams(location.search).has('fixture')

/**
 * Arrived back from paying, or with Plus brought from another device (N6.5).
 * Read once at load, because the address effect renames `/plus` to the plans
 * page on the first paint.
 */
const ARRIVED_FOR_PLUS = /\/plus\/?$/.test(location.pathname)

/**
 * The screen the address asks for, where it can be shown at once (N3.1).
 *
 * Progress and every serve need nothing but the history already being loaded,
 * so a reload or a pasted link opens them without a flash of Today. A stored
 * serve, the sample and a practice session are read from storage first, in
 * `App`. A `?demo` route owns the screen in development and is left alone.
 */
function initialView(): View {
  if (typeof location === 'undefined' || new URLSearchParams(location.search).has('demo')) return { kind: 'home' }
  const route = parsePath(location.pathname, import.meta.env.BASE_URL)
  if (route.kind === 'progress') return { kind: 'progress' }
  if (route.kind === 'serves') return { kind: 'progress', serves: true }
  if (route.kind === 'page') return { kind: 'page', page: route.page }
  return { kind: 'home' }
}

export default function App() {
  const [view, setView] = useState<View>(initialView)
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
  const [keptMedia, setKeptMedia] = useState<{ id: string; url: string; others: KeptOther[] }>()
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
  const [sheet, setSheet] = useState<AppSheet>(null)
  /**
   * The camera, when it is open. `rearm` is the glance's "Record another": the
   * next serve may start by itself once the player stands ready (C3).
   */
  const [film, setFilm] = useState<{ rearm: boolean } | null>(null)
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
  const moveLadder = useCallback((flaw: string, step: number, from?: number) => {
    setCheckTarget((t) => (t?.flaw === flaw ? undefined : t))
    const now = Date.now()
    // A move up is a step passed (Q10), and Home shows it; a step back is not.
    const passed = from !== undefined && step > from
    setPrefs((p) =>
      writePrefs({
        ladder: { ...p.ladder, [flaw]: step },
        ladderMovedAt: { ...p.ladderMovedAt, [flaw]: now },
        ...(passed ? { ladderPassedAt: { ...p.ladderPassedAt, [flaw]: now } } : {}),
      }),
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

  /** What the automatic copy of the history covers, and any restore it can offer. */
  const [protection, setProtection] = useState<ProtectionStatus>()
  const [recovery, setRecovery] = useState<RecoveryOffer>()

  const firstRunPickRef = useRef<HTMLInputElement>(null)
  const cameraAppRef = useRef<HTMLInputElement>(null)

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

  /** A page a visitor reads, from the first run's foot, Settings or another page (N6.3). */
  const showPage = useCallback((page: InfoPageId) => {
    setSheet(null)
    setView({ kind: 'page', page })
    window.scrollTo(0, 0)
  }, [])

  /**
   * Film: the camera where the page can have one, the phone's own camera app
   * where it cannot, and the file picker on a machine with neither. Upload
   * (`pick`, from the first screen): the picker, inside the tap. Either way the
   * coach comes down when first wanted, unless the connection costs money,
   * where Settings offers it with its size.
   */
  const startFilming = useCallback((pick?: 'pick') => {
    unlockEarcons()
    if (offlineReady === false && !metered && !warming) void makeOffline()
    if (pick !== 'pick' && previewSupported()) setFilm({ rearm: false })
    else firstRunPickRef.current?.click()
  }, [offlineReady, metered, warming, makeOffline])

  /** The clip the viewfinder's Videos button picked: the picker opens inside the tap. */
  const pickFromFilm = useCallback(() => {
    unlockEarcons()
    firstRunPickRef.current?.click()
    setFilm(null)
  }, [])

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
          `This report couldn’t be saved, because your ${deviceNoun()} has run out of storage. Export your history from Settings, or free up space and try this video again.`,
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
    liveFrames,
  } = useAnalysisRun({
    view,
    setView,
    prefs,
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
    if (!sessionsLoaded) return
    let live = true
    void import('./lib/storage/protect').then(async (m) => {
      const [status, offer] = await Promise.all([m.protectionStatus(), m.recoveryOffer(sessions.length)])
      if (!live) return
      setProtection(status)
      setRecovery(offer)
    })
    return () => {
      live = false
    }
  }, [sessionsLoaded, sessions.length])

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
          setCheckTarget,
        }),
      )
    }
  }, [seedHistory, urlRef])


  // The clip goes with the report (L6.10), before home shows: `leaveForHome`.
  const goHome = () => leaveForHome({ releaseVideo, showHome: () => setView({ kind: 'home' }), refresh: refreshSessions })

  const captureAgain = captureAgainWith({ goHome, openFilm: () => setFilm({ rearm: false }), pickRef: firstRunPickRef })

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


  /*
   * The rest of what an address can ask for (N3.1): a stored serve, the sample
   * or a practice session, each read from storage. Declared before the effect
   * below so it reads the address the page was loaded at, before that effect
   * writes Today's over it. An id that is not on this device opens Today.
   */
  useEffect(() => {
    if (new URLSearchParams(location.search).has('demo')) return
    const route = parsePath(location.pathname, import.meta.env.BASE_URL)
    if (route.kind === 'sample') void showExample()
    if (route.kind === 'serve') {
      void safely(() => getSession(route.id), undefined).then((s) => {
        if (s) openSaved(s)
      })
    }
    if (route.kind === 'practice') {
      void safely(() => getPracticeSession(route.id), undefined).then((s) => {
        if (s) openPracticeSession(s)
      })
    }
    // Once, on load: the address is only an instruction when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * The address and the tab's title follow the screen (N3.1). Replaced, never
   * pushed: `backStack.ts` owns the history entries, one per open layer, and
   * this only names the entry the player is on, so back still closes what is
   * on top and the browser shows the address of the place it lands.
   */
  useEffect(() => {
    const want = pathFor(view, import.meta.env.BASE_URL)
    if (location.pathname !== want) history.replaceState(history.state, '', want + location.search + location.hash)
    document.title = titleFor(view)
  }, [view])

  /*
   * Plus, where the owner has switched payments on (N6.5): the pass kept on
   * this device is checked and renewed near its end, or claimed on the way back
   * from paying. Off, which is how the app ships, this loads nothing and asks
   * no server anything.
   */
  useEffect(() => {
    // Read straight from the build, so a build without payments folds this
    // whole step away, the client's import with it (the entry chunk's budget).
    if (!import.meta.env.VITE_PAYMENTS || PAYMENTS === 'off') return
    void import('./lib/billing/client').then(async (pay) => {
      const arrived = ARRIVED_FOR_PLUS ? await pay.arrive(new URL(location.href)) : 'none'
      // A plain reload of `/plus` brought nothing new: the pass kept here stands.
      if (arrived === 'none') await pay.restore()
      // The checkout id and any pass leave the address once they are used, and
      // the address names the page the player is on.
      if (ARRIVED_FOR_PLUS) history.replaceState(history.state, '', pathFor({ kind: 'page', page: 'pricing' }, import.meta.env.BASE_URL))
    })
  }, [])

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
  const shownSelf = useMemo(() => (shownReport ? selfRead(shownReport, sessions, serveTags) : undefined), [shownReport, sessions, serveTags])
  const shownMoment = useMemo(
    () => (shownReport ? momentOn(shownReport as Session, sessions, { ledger: tripLedger, practice: practiceSessions, prefs }) : undefined),
    [shownReport, sessions, tripLedger, practiceSessions, prefs],
  )
  // A reopened report's kept clip, and the earlier serves' kept clips to set
  // beside it (D6.4; four up, Apex E): read from the device as object URLs, and
  // revoked when the report changes. Which serves is `compareSet`, loaded with
  // the clips, so it stays off the first screen.
  const reopenedId = liveReport ? undefined : shownReport?.id
  useEffect(() => {
    if (!reopenedId) return
    let cancelled = false
    const urls = new Map<string, string>()
    void (async () => {
      const own = await clipFor(clipIdOf(reopenedId))
      if (!own || cancelled) return
      const all = historyRef.current.sessions
      const shown = all.find((s) => s.id === reopenedId)
      const [{ compareSet }, list] = await Promise.all([import('./lib/compareSet'), keptClips().catch(() => [])])
      const have = new Set(list.map((c) => c.id))
      const slots = shown ? compareSet(all, shown, (s) => have.has(clipIdOf(s.id))) : []
      // A basket's serves share one video, which then plays more than once,
      // each copy from its own toss.
      const urlOf = async (clipId: string, file?: File) => {
        if (urls.has(clipId)) return urls.get(clipId)
        const f = file ?? (await clipFor(clipId))
        if (!f || cancelled) return undefined
        const u = URL.createObjectURL(f)
        urls.set(clipId, u)
        return u
      }
      const url = (await urlOf(clipIdOf(reopenedId), own))!
      const others: KeptOther[] = []
      for (const slot of slots) {
        const u = await urlOf(clipIdOf(slot.session.id))
        if (u) others.push({ who: slot.who, session: slot.session, url: u })
      }
      if (!cancelled) setKeptMedia({ id: reopenedId, url, others })
    })()
    return () => {
      cancelled = true
      for (const u of urls.values()) URL.revokeObjectURL(u)
      setKeptMedia(undefined)
    }
  }, [reopenedId, sessions.length])

  return (
    <div className={(view.kind === 'home' || view.kind === 'progress') && sessions.length > 0 ? 'app has-bar' : 'app'}>
      {/* Any paywall below opens the plans through this (N6.4). */}
      <PageNav.Provider value={showPage}>
      <main className="shell">
        <Suspense fallback={null}>
          {view.kind === 'home' && (
            <Home
              sessions={sessions}
              ledger={tripLedger}
              tags={serveTags}
              practiceSessions={practiceSessions}
              practice={practice}
              prefs={prefs}
              onPrefs={(patch) => setPrefs(writePrefs(patch))}
              sessionsLoaded={sessionsLoaded}
              offlineReady={offlineReady}
              interrupted={interrupted ? interruptedLine() : undefined}
              nudge={storageNudge({
                ios: isIOS(),
                installed: isInstalled(),
                loaded: sessionsLoaded,
                filed: sessions.map((s) => s.createdAt),
                lastExportedAt: prefs.lastExportedAt,
                quietedAt: prefs.moveQuietedAt,
                now: Date.now(),
                snapshotAt: protection?.lastSnapshotAt,
                persisted: protection?.persisted,
              })}
              recovery={recovery?.line}
              onRestore={() =>
                void import('./lib/storage/protect').then(async (m) => {
                  await m.restoreFromSnapshot()
                  setRecovery(undefined)
                  refreshSessions()
                })
              }
              onStartFresh={() =>
                void import('./lib/storage/protect').then(async (m) => {
                  await m.forgetSnapshots()
                  setRecovery(undefined)
                })
              }
              onExportBackup={() =>
                void downloadBackup()
                  .then(() => setPrefs(readPrefs()))
                  .catch(() => {})
              }
              onQuietMove={() => setPrefs(writePrefs({ moveQuietedAt: Date.now() }))}
              onOpen={openSaved}
              onOpenPracticeSession={openPracticeSession}
              onFilm={startFilming}
              onCheckDrill={(flaw, drill) => {
                setCheckTarget({ flaw: flaw as FlawId, drill })
                setFilm({ rearm: false })
              }}
              onLadderStep={moveLadder}
              onShowSettings={() => setSheet('settings')}
              onShowPage={showPage}
              onShowProgress={() => setView({ kind: 'progress' })}
              onShowHistory={() => setView({ kind: 'progress', serves: true })}
              onShowExample={() => void showExample()}
              onUpload={() => startFilming('pick')}
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
              live={liveFrames}
            />
          )}

          {view.kind === 'session' && (
            <SessionScreen
              session={view.session}
              previous={previousSession}
              videoUrl={view.canRead ? urlRef.current : undefined}
              stage={view.stage}
              canRead={view.canRead}
              onStart={(mode, withSpeed) => void startSession(mode, withSpeed)}
              onStop={() => stopSession('player')}
              onPickAgain={() => setTimeout(() => firstRunPickRef.current?.click(), 0)}
              onLeave={leaveSession}
              history={sessions}
              ladder={prefs.ladder}
              movedAt={prefs.ladderMovedAt}
              onLadderStep={moveLadder}
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
              trip={{ ladder: prefs.ladder, movedAt: prefs.ladderMovedAt, target: checkTarget?.flaw }}
              history={sessions}
              onLadderStep={moveLadder}
              speak={prefs.speakGlance}
              onToggleSpeak={(on) => setPrefs(writePrefs({ speakGlance: on }))}
              onBack={goHome}
              // Home owns the viewfinder sheet, so going back and reopening it is
              // the honest route — and it releases this clip's object URL on the
              // way, which a second recording would otherwise leak.
              onRecordAnother={() => {
                goHome()
                setFilm({ rearm: true })
              }}
              onOpenReport={() =>
                withTransition(() =>
                  setView(
                    view.videoUrl && 'frames' in view.analysis
                      ? { kind: 'report', analysis: view.analysis, videoUrl: view.videoUrl }
                      : { kind: 'saved', session: view.analysis },
                  ),
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
              // The first serve is read in full on any plan (N6.4).
              firstServe={sessions.length === 0 || shownReport.id === sessions[sessions.length - 1]?.id}
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
              self={shownSelf}
              drillLogs={drillLogs}
              moment={shownMoment}
              coachContext={() => import('./lib/share/coachContext').then((c) => c.coachContextOf(shownReport, sessions, serveTags, prefs))}
              sessions={sessions}
              tags={serveTags}
              serveNumber={tagsById(serveTags).get(shownReport.id)?.serveNumber}
              serveGuess={guessServeNumber(shownReport as Session, sessions, serveTags)}
              outcome={tagsById(serveTags).get(shownReport.id)?.outcome}
              onTagServe={(n) => void applyServeTag(shownReport.id, { serveNumber: n })}
              onTagOutcome={(o) => void applyServeTag(shownReport.id, { outcome: o })}
              marks={tagsById(serveTags).get(shownReport.id)?.marks}
              onMarks={(m) => void applyServeTag(shownReport.id, { marks: m })}
              tossMap={tossMapFor(shownReport, sessions, serveTags)}
              kept={keptMedia?.id === shownReport.id ? { url: keptMedia.url, others: keptMedia.others } : undefined}
              keepsClips={Boolean(prefs.keepClips)}
              keepFailed={keepFailedFor === shownReport.id}
              fixtureExport={FIXTURE_EXPORT}
              onBack={goHome}
              onAnalyzeAnother={() => captureAgain(shownReport.capture ? 'framing' : 'pick')}
              onFilmAgain={() => captureAgain('framing')}
              onReadFully={
                liveReport?.analysis.firstRead && lastFileRef.current
                  ? () => {
                      forgetAll()
                      void run(lastFileRef.current!, liveReport.analysis.handedness, liveReport.analysis.serves.index, liveReport.analysis.serveType, 'report', { waitForRefine: true })
                    }
                  : undefined
              }
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
              onFilmCheck={(flaw, drill) => {
                setCheckTarget({ flaw: flaw as FlawId, drill })
                captureAgain('framing')
              }}
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
              scoring={liveReport && sweep ? { done: sweep.done.length, total: sweep.total, stopping: sweep.stopping } : undefined}
              onStopScoring={stopSweep}
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
              onBack={startFilming}
              onOpen={openSaved}
              showServes={view.serves}
              refreshSessions={refreshSessions}
            />
          )}

          {view.kind === 'page' && <InfoPage page={view.page} onBack={goHome} onPage={showPage} onFilm={startFilming} />}

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
            <div className="screen problem">
              <div className="problem-text">
                <span className="next-label problem-kicker">I couldn’t check that video</span>
                <h1 className="t-display">{view.title}</h1>
                <ul>
                  {view.hints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
              <div className="problem-actions">
                {view.again && lastFileRef.current ? (
                  <button className="btn btn--primary btn--big btn--full" onClick={() => void openClip(lastFileRef.current!)}>
                    Try again
                  </button>
                ) : (
                  <button className="btn btn--primary btn--big btn--full" onClick={() => captureAgain('framing')}>
                    <Icon name="camera" size={20} />
                    Film it again
                  </button>
                )}
                {/* One action (DESIGN.md): the other ways out are a line, not two more buttons (N7.6). */}
                <p className="problem-also">
                  Or{' '}
                  <button type="button" className="link-btn" onClick={() => captureAgain('pick')}>
                    pick another video
                  </button>
                  {!view.again && (
                    <>
                      , or read{' '}
                      <button type="button" className="link-btn" onClick={() => setSheet('guide')}>
                        how to film it
                      </button>
                    </>
                  )}
                  .
                </p>
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

      {(view.kind === 'home' || view.kind === 'progress') && sessions.length > 0 && (
        <TabBar
          on={view.kind === 'home' ? 'today' : 'progress'}
          onTab={(tab) => setView({ kind: tab === 'today' ? 'home' : 'progress' })}
          onFilm={startFilming}
          loading={warming?.stage === 'downloading' ? warming.ratio : undefined}
          onStudio={() => setView({ kind: 'saved', session: sessions[0] })}
        />
      )}

      <AppSheets
        sheet={sheet}
        onSheet={setSheet}
        prefs={prefs}
        onPrefs={setPrefs}
        serves={sessions.length}
        onImported={refreshSessions}
        offline={{ ready: offlineReady, warming, metered, onDownload: () => void makeOffline() }}
        protection={protection?.line}
        onPage={showPage}
      />

      {/* Mounted only while it is open, which is what guarantees the camera is
          released: the viewfinder stops its own tracks on unmount. */}
      <Sheet open={film !== null} onClose={() => setFilm(null)} title="Film a serve" full>
        <Suspense fallback={null}>
          <FramingCheck
            target={checkTarget?.drill}
            targetFlaw={checkTarget?.flaw}
            rearm={film?.rearm}
            onClose={() => setFilm(null)}
            onPick={pickFromFilm}
            onHelp={() => setSheet('guide')}
            firstTime={!prefs.seenFilmingGuide}
            onSeenRules={() => setPrefs(writePrefs({ seenFilmingGuide: true }))}
            onCameraApp={() => {
              setFilm(null)
              cameraAppRef.current?.click()
            }}
            onRecorded={(file) => {
              setFilm(null)
              void openClip(file, true)
            }}
          />
        </Suspense>
      </Sheet>

      <input
        ref={firstRunPickRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openClip(file)
        }}
      />
      <input
        ref={cameraAppRef}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void openClip(file)
        }}
      />
      </PageNav.Provider>
    </div>
  )
}
