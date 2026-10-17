import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import HandednessPicker from './components/HandednessPicker'
import { Icon, ScoreRing, Sheet } from './components/primitives'
import { useBackLayer } from './components/useBackLayer'
import { useWakeLock, wakeLockLine } from './components/useWakeLock'
import { useHistory } from './components/useHistory'
import { useOfflineWarmup } from './components/useOfflineWarmup'
import { meteredConnection } from './lib/engineDownload'
import { interruptedLine, markRead, markReading, takeInterrupted } from './lib/interrupted'
import { findPracticeFocus, type PracticeFocus } from './lib/practice'
import type { InjuryFlag } from './lib/analysis/triage'
import {
  strainBehindLine,
  strainGlanceLine,
} from './lib/analysis/verdict'
import {
  bestConsistencyGap,
  bestTrip,
  faultMoveOnTrip,
  rotationMoveOnTrip,
  scoreMoveAgainst,
  buildConsistencyTrend,
  gapDeltaFor,
  glanceStrain,
  strainBehindOf,
  streakLine,
  typeOf,
  scoringVersionOf,
} from './lib/progress'
import { bestPriorTo } from './lib/bestServe'
import { tossMapFor } from './lib/tossMap'
import type { AnalyzeProgress } from './lib/analysis/analyze'
/*
 * The engine, loaded when there is a serve to read or re-judge and not before.
 * Statically imported it was most of the entry chunk, which every player
 * parses before the home screen draws — including one who only opens a saved
 * report. Each call site below awaits it; after the first analysis it is a
 * resolved module and costs nothing.
 */
const loadAnalysis = () => import('./lib/analysis/analyze')
import { forgetAll, recall, remember } from './lib/analysisCache'
import type { FaultMove } from './lib/analysis/carryForward'
import type { ServePairFrames } from './lib/analysis/consistency'
import {
  SCORING_VERSION,
  hintsOf,
  type Analysis,
  type FailedCapture,
  type NotAServeError,
} from './lib/analysis/types'
import { Cancelled, looksLikeNonVideo } from './lib/pose/errors'
import {
  deleteSession,
  getSession,
  logPractice,
  safely,
  saveSession,
  unlogPractice,
  tagsById,
  type Session,
} from './lib/storage/db'
import { downloadBackup, isIOS, isInstalled, requestPersistence } from './lib/storage/backup'
import { storageNudge } from './lib/storage/nudge'
import { readPrefs, writePrefs, type Prefs, type ServeType } from './lib/storage/prefs'
import { clipIdOf, fileKeyOf, sessionKeyFor } from './lib/storage/sessionKey'
import { getPracticeSession, savePracticeSession } from './lib/storage/db'
import { drilledFault } from './lib/weekPlan'
import {
  SETS_KEPT,
  finishedSet,
  inRateFor,
  setDoneLine,
  setRunningLine,
  setServes,
  setTarget,
} from './lib/sets'
import { isSession } from './lib/session/length'
import { probeDuration } from './lib/session/probe'
import { sessionIdFor, type PracticeSession, type SessionStage } from './lib/session/session'
import type { SessionVideo } from './lib/session/video'
import { clipFor, keepClip } from './lib/storage/clipStore'
import { applyWhenIdle, onUpdateWaiting } from './lib/updates'
import Analyzing, { type SweepProgress } from './screens/Analyzing'
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
const loadReport = () => import('./screens/Report')
const Report = lazy(loadReport)
/*
 * A practice session (L2.4): the screen, and the video work behind it, which
 * brings the engine with it. Both fetched when a long clip is picked.
 */
const loadSessionScreen = () => import('./screens/Session')
const SessionScreen = lazy(loadSessionScreen)
const loadSessionLive = () => import('./lib/session/live')
/*
 * The glance, fetched when an analysis starts the way the report is: it is
 * only ever drawn after one. And the filming guide, a sheet opened on demand.
 * Both out of the entry, which the level-up work had brought to within two
 * kilobytes of its budget.
 */
const loadGlance = () => import('./screens/Glance')
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
  | { kind: 'glance'; analysis: Analysis; videoUrl: string; move?: FaultMove }
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

const MAX_BYTES = 400 * 1024 * 1024

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
  const [progress, setProgress] = useState<AnalyzeProgress>({ step: 'engine', ratio: 0 })
  /**
   * The basket sweep filling in, or nothing when a single serve is being read.
   *
   * Held here rather than inside `compareServes` because it is what the
   * analysing screen draws while the sweep runs, and because its presence is
   * how the cancel button knows it should stop the sweep and keep the results
   * rather than throw the clip away and go home.
   */
  const [sweep, setSweep] = useState<SweepProgress>()
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

  /** The player moving a fault's ladder a rung, from the report. */
  const moveLadder = useCallback((flaw: string, step: number) => {
    setPrefs((p) => writePrefs({ ladder: { ...p.ladder, [flaw]: step } }))
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

  const abortRef = useRef<AbortController>()
  const urlRef = useRef<string>()
  const lastFileRef = useRef<File>()
  /**
   * Where the serves in the clip currently loaded are, once anything has looked.
   *
   * Cleared with the clip, in `run`, because the times index into that video and
   * nothing else. Tapping a serve chip for a serve not yet measured used to
   * re-scan the whole clip to re-derive an answer the first pass already had —
   * up to 420 seek-and-detect pairs, twenty-odd seconds, before the two seconds
   * of footage the player actually asked about were even opened.
   */
  const serveTimesRef = useRef<number[]>()
  const firstRunPickRef = useRef<HTMLInputElement>(null)
  /**
   * A practice session's reading: its own stop, its open video, and why it last
   * stopped. Separate from `abortRef` because a session and a single serve
   * never run together and stopping one must not be read as stopping the other.
   */
  const sessionAbortRef = useRef<AbortController>()
  const sessionVideoRef = useRef<SessionVideo>()
  const stopReasonRef = useRef<'player' | 'hidden' | 'warm'>('player')
  /** The session view as last rendered, for the callbacks that start and stop it. */
  const sessionViewRef = useRef<Extract<View, { kind: 'session' }>>()
  sessionViewRef.current = view.kind === 'session' ? view : undefined

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

  /*
   * Sets from the player's own taps (L3.7). A set finishes the moment its
   * tenth landing is tapped: the result moves into the records and the glance
   * that took it says so.
   */
  const startSet = useCallback(
    (serveNumber: 1 | 2) =>
      setPrefs(
        writePrefs({
          activeSet: { startedAt: Date.now(), serveNumber, target: setTarget(inRateFor(sessions, serveTags, serveNumber)) },
        }),
      ),
    [sessions, serveTags],
  )
  useEffect(() => {
    const active = prefs.activeSet
    if (!active) return
    const done = finishedSet(active, sessions, serveTags)
    if (done) setPrefs(writePrefs({ activeSet: undefined, sets: [...(prefs.sets ?? []), done].slice(-SETS_KEPT) }))
  }, [prefs.activeSet, prefs.sets, sessions, serveTags])
  const glanceSet = (analysis: Analysis): { line: string; running: boolean } | undefined => {
    const active = prefs.activeSet
    if (active) {
      const counted = setServes(active, sessions, serveTags)
      return { line: setRunningLine(active, counted.length, counted.filter((c) => c.isIn).length), running: true }
    }
    const just = (prefs.sets ?? []).find((r) => r.endedAt === analysis.createdAt)
    return just ? { line: setDoneLine(just, prefs.sets ?? []), running: false } : undefined
  }
  // Read by the sweep, which is declared once and would otherwise judge a
  // basket against the history it was created with (L3.4).
  historyRef.current = { sessions, ladder: prefs.ladder }
  /**
   * The tightest best-vs-worst gap swept, for whichever serve type is on
   * screen — see `bestConsistencyGap`.
   *
   * Deliberately not read off `spread` above, which is pinned to the
   * dominant type for the progress screen's own two blocks. A report open on
   * a kick serve while the player mostly films flat ones would otherwise show
   * a flat-serve record under a kick-serve basket with nothing on screen
   * saying so — the same confidently-wrong-type mismatch `priorTo` below
   * already guards against for a score delta.
   */
  const bestGapFor = useCallback(
    (serveType: ServeType) => bestConsistencyGap(buildConsistencyTrend(sessions, serveType)),
    [sessions],
  )
  /**
   * The best trip of this serve type so far, by its median — see
   * `bestTrip` (L3.2). Same reasoning as `bestGapFor`: recomputed per
   * viewed type rather than pinned to the sheet's dominant one, so a report
   * open on a type the player rarely films still shows its own record and
   * not a mismatched one.
   */
  /**
   * What each joint warning did on the trips before the report being read —
   * see `strainBehindOf`. Keyed to the viewed report's own date rather than to
   * today, and turned into sentences here so `Report.tsx` never has to know
   * what a trip is, matching how `streak` is already handed down.
   */
  /**
   * The glance's own one-line form of the same warning — see `glanceStrain`.
   * Worded here rather than in the screen for the same reason `streak` is:
   * `Glance.tsx` takes sentences, never records.
   */
  const glanceStrainLine = useCallback(
    (current: Pick<Session, 'triage'>) => {
      const record = glanceStrain(sessions, current)
      return record && strainGlanceLine(record)
    },
    [sessions],
  )
  const strainBehindFor = useCallback(
    (at: number) => {
      const out: Partial<Record<InjuryFlag, string>> = {}
      for (const [flag, record] of Object.entries(strainBehindOf(sessions, at))) {
        const line = record && strainBehindLine(record)
        if (line) out[flag as InjuryFlag] = line
      }
      return out
    },
    [sessions],
  )
  const bestScoreFor = useCallback(
    (serveType: ServeType) => bestTrip(sessions, serveType, tripLedger),
    [sessions, tripLedger],
  )
  // Same reasoning as bestGapFor: recomputed for whichever type is actually
  // on screen rather than read off `spread`, which is pinned to the
  // dominant type for the progress screen's own purposes.
  const gapDeltaForView = useCallback(
    (id: string, serveType: ServeType) => gapDeltaFor(buildConsistencyTrend(sessions, serveType), id),
    [sessions],
  )

  /**
   * The most recent report filed before this one — what a delta is measured against.
   *
   * Restricted to the same serve type. A kick serve and a flat one are scored
   * against different target bands, so "+11 vs your last serve" across a switch
   * measures the switch rather than the player, and points at a change they did
   * not make.
   */
  const priorTo = useCallback(
    (createdAt: number, serveType: ServeType) =>
      sessions
        .filter((s) => s.createdAt < createdAt && typeOf(s) === serveType)
        .sort((a, b) => b.createdAt - a.createdAt)[0],
    [sessions],
  )

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
  }, [seedHistory])

  /*
   * Take a waiting version the moment nothing would be lost by it.
   *
   * The home screen with no clip open is the only state where a reload costs
   * the player nothing: everything else on the way through this app is either
   * work in flight (an analysis, a sweep) or work that only exists in memory (a
   * report and its object URL, the paired stills, a glance between serves). A
   * reload through any of those throws it away with no message.
   *
   * Checked on every view change *and* on the update arriving, because either
   * can be the later of the two — the app can be sitting on the home screen
   * when a deploy lands, or be mid-sweep when it lands and reach home minutes
   * later. `applyWhenIdle` re-asks the predicate at the moment of acting rather
   * than trusting this render's answer.
   */
  useEffect(() => {
    const idle = () => view.kind === 'home' && !urlRef.current && !sweep
    applyWhenIdle(idle)
    return onUpdateWaiting(() => applyWhenIdle(idle))
  }, [view.kind, sweep])

  const releaseVideo = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = undefined
    }
  }, [])

  useEffect(() => releaseVideo, [releaseVideo])

  const run = useCallback(
    async (
      file: File,
      handedness = prefs.handedness,
      serveIndex?: number,
      serveType = prefs.serveType,
      /**
       * Where this run finishes.
       *
       * `report` puts the serve on screen, which is what a correction and a
       * serve switch want. `sweep` returns the analysis without showing it, so
       * the caller can go straight into measuring the whole basket — otherwise
       * the report renders for two frames and is replaced by a progress screen,
       * which reads as a glitch rather than as a step.
       */
      landOn: 'report' | 'sweep' = 'report',
    ): Promise<Analysis | undefined> => {
      if (file.size > MAX_BYTES) {
        setView({
          kind: 'error',
          // Said for a session as well as a single serve (L2.2). "Three to
          // five seconds is all it needs" told somebody who filmed a whole
          // practice that it was the wrong thing to have done.
          title: 'That video is too large to read here',
          hints: [
            'For one serve, trim the clip to a few seconds around it.',
            'For a whole session, trim it into clips of a few minutes, or film at 1080p rather than 4K.',
            'Most phones let you trim in the photo library before sharing.',
          ],
        })
        return
      }

      // Caught before the decoder is asked to explain a failure it did not
      // have — see `looksLikeNonVideo` for why this cannot be left to
      // `describeDecodeFailure` alone, on a browser with no HEVC support.
      if (looksLikeNonVideo(file.type)) {
        setView({
          kind: 'error',
          title: 'That does not look like a video',
          hints: [
            'Pick a video clip from your camera roll rather than a photo or a document.',
            'MP4 and MOV clips from a phone camera work best.',
          ],
        })
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      // The spreads need no clearing: they ride on the report they were measured
      // for, so a new report simply has none. When they lived in state beside
      // the view this needed an explicit reset at every entry point, and the
      // panel sat clip A's spreads under clip B's report wherever one was
      // missed.
      //
      // The paired stills are the exception and are cleared here for exactly
      // that reason. They deliberately do not ride on the report — twelve images
      // is the largest thing a stored report would carry — so they are the one
      // piece of the comparison that can outlive the clip it describes, and this
      // is every entry point.
      setPair(undefined)

      // Already worked out during this session? Switching between the serves in
      // a basket, or correcting the hand and changing it back, otherwise pays
      // the full pipeline again for a result we are still holding.
      const wanted = sessionKeyFor(file, serveIndex ?? -1)
      const isSameClip = lastFileRef.current === file
      if (isSameClip && serveIndex !== undefined && handedness) {
        const hit = recall({ sessionKey: wanted, handedness })
        if (hit && urlRef.current) {
          const shown = hit.serveType === serveType ? hit : (await loadAnalysis()).rescore(hit, serveType) ?? hit
          setView({ kind: 'report', analysis: shown, videoUrl: urlRef.current })
          if (shown !== hit) {
            // Put the rescored copy back, or the cache keeps handing out the old
            // serve type and every return to this serve pays for the rescore
            // again — and hands `remember` an analysis whose stored scores no
            // longer match the ones on screen.
            remember({ sessionKey: shown.id, handedness: shown.handedness }, shown)
            void trySave(shown)
          }
          return
        }
      }

      if (!isSameClip) {
        // A different clip: the cached analyses describe a video whose object URL
        // is about to be revoked, so nothing can play them back.
        forgetAll()
        serveTimesRef.current = undefined
      }

      releaseVideo()
      const url = URL.createObjectURL(file)
      urlRef.current = url
      lastFileRef.current = file

      setProgress({ step: 'engine', ratio: 0, detail: 'Getting the coach ready' })
      // One serve, so the analysing screen shows steps rather than a basket. A
      // sweep stopped a moment ago would otherwise leave its serve rows under
      // the progress bar of an unrelated clip.
      setSweep(undefined)
      void loadReport()
      void loadGlance()
      setView({ kind: 'analyzing', fileName: file.name || 'Your serve' })
      // Cleared in `finally` below however this ends; still set on the next
      // load means the page did not live to finish it (L6.4).
      markReading(file.name || 'Your serve')
      setInterrupted(undefined)

      try {
        const { analyzeServe, throttleProgress } = await loadAnalysis()
        const analysis = await analyzeServe({
          videoUrl: url,
          fileName: file.name || 'Your serve',
          // Its own timing boxes, read for a slow-motion stretch — see
          // `pose/container.ts`. Nothing leaves the device.
          file,
          handedness,
          serveIndex,
          serveType,
          // Same clip, so the serves are in the same places. This is what makes
          // tapping a second serve chip cost the two seconds of footage it is
          // about rather than another full scan of the video.
          knownServeTimes: serveTimesRef.current,
          onServesLocated: (times) => {
            serveTimesRef.current = times
          },
          // Absent unless the player has told us their rating, in which case the
          // diagnostic pass estimates one from the serve rather than asking.
          tier: prefs.tier,
          // Dev only: lets a refused clip be filed as a ground-truth fixture,
          // which is otherwise impossible — the capture button lives on the
          // report and a refusal never reaches one.
          captureOnFailure: import.meta.env.DEV,
          signal: controller.signal,
          // Rate-limited on the way to the screen. Every one of these is a
          // render of the whole app, and the pipeline reports hundreds of them
          // per pass on the same thread the pose model is running on.
          onProgress: throttleProgress(setProgress),
        })
        if (controller.signal.aborted) return

        // One stored report per serve, not per analysis run. Correcting the
        // handedness or flicking between the serves in a clip re-runs this, and
        // each of those would otherwise file a duplicate that skews the trend
        // chart and the practice window.
        analysis.id = sessionKeyFor(file, analysis.serves.index)
        const existing = sessions.find((s) => s.id === analysis.id)
        // Keep the moment the serve was first filed, not the moment it was re-read.
        if (existing) analysis.createdAt = existing.createdAt

        // Keyed on the serve the pipeline actually settled on, which is not
        // necessarily the one that was asked for: with no index given it picks
        // the last serve in the clip.
        remember({ sessionKey: analysis.id, handedness: analysis.handedness }, analysis)

        if (landOn === 'report') setView({ kind: 'report', analysis, videoUrl: url })

        // A clip the engine refused is dropped on the way into storage rather
        // than here — see `saveSession`. It stays in the in-memory cache above,
        // so flicking between the serves in the clip is still instant; it just
        // never becomes part of the record.
        void trySave(analysis)
        // The clip itself, on this phone, when the player keeps them (D6.4).
        // Not for a refused clip, which never enters the record either.
        if (prefs.keepClips && analysis.triage?.status !== 'rejected') {
          // A keep that fails is said on the report (L6.7), rather than found
          // later as a reopened report with nothing to play.
          const id = analysis.id
          void keepClip(clipIdOf(id), file, { optedIn: true }).then((ok) => {
            if (!ok) setKeepFailedFor(id)
          })
        }
        recheckOffline()

        // Ask the browser not to evict the history, once, at the first moment
        // there is a history to lose. Asking on first load would be asking
        // before the player has done anything — which is exactly when engagement
        // heuristics say no, and the answer sticks.
        if (!prefs.askedToPersist) {
          setPrefs(writePrefs({ askedToPersist: true }))
          void requestPersistence()
        }

        return analysis
      } catch (err) {
        if (controller.signal.aborted || err instanceof Cancelled) return
        releaseVideo()
        // Anything that arrived carrying its own advice — a clip that is not a
        // serve, a file the browser cannot decode — already knows how to
        // explain itself better than a generic message can.
        const hints = hintsOf(err)
        if (hints) {
          setView({
            kind: 'error',
            title: (err as Error).message,
            hints,
            capture: (err as NotAServeError).capture,
            fileName: file.name || 'refused-clip',
          })
        } else {
          // The exception text used to be printed as one of the two bullets
          // telling the player what to do next. It is a stack-trace sentence
          // written for whoever wrote the decoder, and there is no action in
          // it — so it goes to the console, where it is actually useful, and
          // the player gets the two things that do sometimes fix this.
          console.error(err)
          setView({
            kind: 'error',
            title: 'Something went wrong reading that video',
            hints: [
              'Try a clip straight from your camera roll, not a shared link.',
              'MP4 or MOV clips from a phone camera work best.',
            ],
          })
        }
      } finally {
        markRead()
      }
    },
    // `sessions` is read to preserve the original filing date of a re-analysis;
    // leaving it out would capture an empty list from the first render.
    [
      releaseVideo,
      trySave,
      sessions,
      prefs.handedness,
      prefs.serveType,
      prefs.tier,
      prefs.askedToPersist,
      prefs.keepClips,
      recheckOffline,
    ],
  )

  /**
   * Measure every serve in the clip. Deliberately opt-in: it re-reads the video
   * once per serve, so it is worth several seconds and the player should be the
   * one deciding to spend them.
   *
   * Every serve is surfaced as it lands rather than at the end, which is what
   * makes stopping early survivable: the screen fills in serve by serve, and
   * whatever was measured before the player stopped is still compared.
   */
  const compareServes = useCallback(
    async (analysis: Analysis) => {
      const file = lastFileRef.current
      const url = urlRef.current
      if (!file || !url) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      // The same window the sweep itself walks, so the rows on screen are
      // labelled with the serve numbers that will end up on the chips. Working
      // it out separately here is how a screen ends up counting from one while
      // the sweep measures serves five through ten.
      const { analyzeAllServes, sweepWindow, throttleProgress, withoutComparison } = await loadAnalysis()
      const { first, total } = sweepWindow(analysis.serves.count)
      setSweep({ total, firstNumber: first + 1, done: [] })
      setProgress({ step: 'engine', ratio: 0, detail: 'Comparing your serves' })
      void loadReport()
      void loadGlance()
      setView({ kind: 'analyzing', fileName: file.name || 'Your serve' })

      try {
        const swept = await analyzeAllServes({
          videoUrl: url,
          fileName: file.name || 'Your serve',
          handedness: analysis.handedness,
          // Judged as the same serve the report on screen was, or the comparison
          // silently scores a basket of kick serves against flat-serve targets
          // and disagrees with the report it is sitting underneath.
          serveType: analysis.serveType,
          count: analysis.serves.count,
          signal: controller.signal,
          onProgress: throttleProgress(setProgress),
          // Each serve as it is measured, so a run of full analysis passes is
          // visible while it happens instead of arriving all at once at the end.
          onServe: ({ number, analysis: serve }) =>
            setSweep((s) => (s ? { ...s, done: [...s.done, { number, score: serve?.overall }] } : s)),
          // The report this was launched from already scanned this clip.
          knownServeTimes: serveTimesRef.current,
          // And already settled its clock, which a sweep cannot re-check: it
          // skips the ball, and the ball is one of the two ways to tell.
          file,
          knownStretch: analysis.stretch,
          onServesLocated: (times) => {
            serveTimesRef.current = times
          },
        })

        // A newer run owns the screen — the player stopped this and picked
        // another clip. Checking the controller rather than its abort flag,
        // because a stopped sweep is now an ordinary result with serves in it
        // and this is the only thing that still distinguishes "stale" from
        // "finished early".
        if (abortRef.current !== controller) return

        // Read off the sweep rather than computed here. It used to be this
        // screen's job, and it moved into `analyzeAllServes` when the sweep
        // stopped capturing keyframe stills for every serve: which two serves
        // are worth pictures *is* this calculation, and it has to be made while
        // the video element is still open, which is in there and not out here.
        //
        // It is still the same rule about what counts — what the sweep actually
        // read to a conclusion, not how many serves are in the clip and not how
        // many it set out to measure. Either of those would report serves
        // nothing finished looking at as ones too unclear to read: the ones past
        // the cap, or the ones the player stopped.
        const result = swept.consistency

        if (!result) {
          // Stopped before there were two serves to compare. Nothing failed and
          // nothing is wrong with the clip, so this is not an error screen —
          // it is the report they launched the sweep from, exactly as it was.
          if (swept.cancelled) {
            setView({ kind: 'report', analysis, videoUrl: url })
            return
          }
          // Too few readable serves to compare. The report it started from was
          // read and saved already, so it stays on screen with a line saying
          // why there is no comparison, rather than an error screen in its
          // place (L1.7, `withoutComparison`).
          setView({ kind: 'report', analysis: withoutComparison(analysis, swept.serves.length), videoUrl: url })
          return
        }

        // Onto the report, and therefore into storage. This is the most
        // expensive thing the app computes — one full pass over the video per
        // serve — and it used to be discarded by the back button.
        //
        // A stopped sweep is filed on the same terms as a complete one, and it
        // is not a half-written report: it describes the serves it measured,
        // says how many that was, and claims nothing about the ones it never
        // reached. Throwing four measured serves away because a fifth was never
        // started would be the dishonest half of that trade, not the safe one.
        //
        // The paired stills arrive with the sweep now rather than being built
        // here. They have to: only the two serves the comparison names have any
        // stills at all, and going back to the video for them needs a decoder
        // that this screen no longer has by the time it gets here. Absent on a
        // sweep the player stopped, which is deliberate — see `analyzeAllServes`.
        // They still go no further than the screen.
        setPair(swept.pair)

        // The basket against the ladder of the fault the player was drilling
        // — the top of the week plan before this report (L3.4) — and only
        // when there was none, the fault this report names. Judged against
        // the new report's fault, a drilled fault that cleared could never
        // show "passed".
        const primary = analysis.triage?.status === 'ok' ? analysis.triage.primary_flaw?.flaw : undefined
        const drilled = drilledFault(historyRef.current.sessions, analysis.createdAt, historyRef.current.ladder)
        const target = drilled ?? primary
        // Loaded here rather than with the app: the ladders are a page of copy,
        // and only a finished sweep ever reads them.
        const drillCheck = target
          ? (await import('./lib/analysis/progressions')).checkDrill(target, swept.serves)
          : undefined
        const measured: Analysis = { ...analysis, consistency: result, ...(drillCheck ? { drillCheck } : {}) }
        remember({ sessionKey: measured.id, handedness: measured.handedness }, measured)
        setView({ kind: 'report', analysis: measured, videoUrl: url })
        void trySave(measured)
      } catch (err) {
        if (abortRef.current !== controller || err instanceof Cancelled) return
        setView({ kind: 'report', analysis, videoUrl: url })
      } finally {
        // Guarded, so a sweep that was superseded cannot wipe the rows of the
        // run that replaced it.
        if (abortRef.current === controller) setSweep(undefined)
      }
    },
    [trySave],
  )

  /**
   * A clip the player has just picked, as opposed to a serve they switched to.
   *
   * One serve behaves exactly as it always has. More than one goes straight into
   * the sweep, because for a club player the gap between the best serve and the
   * worst one is usually a bigger problem than the average of them — which this
   * app has argued in its own README for a long time while putting the
   * comparison behind a button most people never pressed.
   *
   * It costs a video pass per serve, and that is the trade. The analysing screen
   * already draws a row per serve as each one lands, so the wait is watched
   * rather than blank, and stopping it early keeps whatever was measured.
   *
   * The comparison button stays on the report for the cases this does not cover:
   * a sweep the player stopped, and a report reached by any other route.
   */
  /** Let a session's video go, and stop whatever it was doing. */
  const closeSessionVideo = useCallback(() => {
    sessionAbortRef.current?.abort()
    sessionAbortRef.current = undefined
    sessionVideoRef.current?.close()
    sessionVideoRef.current = undefined
  }, [])

  /** A session's video failed; say so in the words the decoder's errors carry. */
  const sessionFailed = useCallback(
    (err: unknown) => {
      closeSessionVideo()
      releaseVideo()
      const hints = hintsOf(err)
      if (!hints) console.error(err)
      setView({
        kind: 'error',
        title: hints ? (err as Error).message : 'Something went wrong reading that video',
        hints: hints ?? [
          'Try it again. A long video can stall when the phone is busy.',
          'If it fails again, trim it into clips of a few minutes and pick one.',
        ],
      })
    },
    [closeSessionVideo, releaseVideo],
  )

  /**
   * A long clip, opened as a practice session (L2.4).
   *
   * Not refused for its size, and never kept on the phone: the file is read
   * through an object URL and nothing copies it. The same file picked again
   * finds its stored row and carries on from it. Before anything is offered,
   * eight seeks on this file time this device, so the choices are priced from
   * the phone in the player's hand rather than from a desktop.
   */
  const openSessionClip = useCallback(
    async (file: File, duration: number) => {
      abortRef.current?.abort()
      closeSessionVideo()
      setPair(undefined)
      setSweep(undefined)
      forgetAll()
      serveTimesRef.current = undefined
      releaseVideo()
      const url = URL.createObjectURL(file)
      urlRef.current = url
      lastFileRef.current = file
      void loadSessionScreen()

      const id = sessionIdFor(fileKeyOf(file))
      const stored = await safely(() => getPracticeSession(id), undefined)
      const now = Date.now()
      const session: PracticeSession = stored ?? {
        id,
        createdAt: now,
        updatedAt: now,
        fileName: file.name || 'Your session',
        duration,
        serveType: prefs.serveType,
        handedness: prefs.handedness ?? 'right',
        mode: 'sample',
        lines: [],
        phase: 'locating',
        scoringVersion: SCORING_VERSION,
      }
      if (session.phase === 'done') {
        setView({ kind: 'session', session, stage: { state: 'done' }, canRead: true })
        return
      }
      setView({ kind: 'session', session, stage: { state: 'planning', timed: false }, canRead: true })

      const controller = new AbortController()
      sessionAbortRef.current = controller
      try {
        const { openSessionVideo, perSampleMs: perSampleOf } = await loadSessionLive()
        if (sessionAbortRef.current !== controller) return
        const reader = openSessionVideo(url, file)
        sessionVideoRef.current = reader
        const timings = await reader.calibrate(controller.signal)
        if (sessionAbortRef.current !== controller) return
        const perSampleMs = perSampleOf(timings)
        setView((v) =>
          v.kind === 'session' && v.session.id === id
            ? { ...v, stage: { state: 'planning', timed: true, perSampleMs } }
            : v,
        )
      } catch (err) {
        if (sessionAbortRef.current !== controller || err instanceof Cancelled) return
        sessionFailed(err)
      }
    },
    [closeSessionVideo, releaseVideo, sessionFailed, prefs.serveType, prefs.handedness],
  )

  /**
   * Read the session on screen, or carry on reading it (L2.5): `driveSession`,
   * handed the video, the screen and the store. Every serve read is saved
   * before the next starts, so a stop of any kind keeps what was read and its
   * place.
   */
  const startSession = useCallback(
    async (mode: 'sample' | 'every') => {
      const shown = sessionViewRef.current
      const reader = sessionVideoRef.current
      if (!shown || !reader || !shown.canRead) return
      const perSampleMs =
        shown.stage.state === 'planning' || shown.stage.state === 'paused' ? shown.stage.perSampleMs : undefined
      const start: PracticeSession = { ...shown.session, mode: shown.session.found ? shown.session.mode : mode }

      sessionAbortRef.current?.abort()
      const controller = new AbortController()
      sessionAbortRef.current = controller
      stopReasonRef.current = 'player'
      // Already loaded by `openSessionClip`, so this is a resolved module.
      const { driveSession } = await loadSessionLive()
      if (sessionAbortRef.current !== controller) return
      try {
        await driveSession({
          start,
          reader,
          tier: prefs.tier,
          perSampleMs,
          signal: controller.signal,
          show: (session: PracticeSession, stage: SessionStage) =>
            setView({ kind: 'session', session, stage, canRead: true }),
          save: (s) => safely(() => savePracticeSession(s), undefined),
          stopReason: () => stopReasonRef.current,
          current: () => sessionAbortRef.current === controller,
        })
        refreshSessions()
      } catch (err) {
        if (sessionAbortRef.current !== controller) return
        sessionFailed(err)
      }
    },
    [prefs.tier, refreshSessions, sessionFailed],
  )

  /** Stop the reading and keep its place. The screen answers the press at once. */
  const stopSession = useCallback((reason: 'player' | 'hidden' | 'warm') => {
    stopReasonRef.current = reason
    sessionAbortRef.current?.abort()
    setView((v) =>
      v.kind === 'session' && v.stage.state === 'running' ? { ...v, stage: { ...v.stage, stopping: true } } : v,
    )
  }, [])

  /**
   * A stored session, from the home screen. Its file is not open here, so a
   * finished one is shown and an unfinished one asks for the video again.
   */
  const openPracticeSession = useCallback(
    (session: PracticeSession) => {
      closeSessionVideo()
      setView({
        kind: 'session',
        session,
        stage: session.phase === 'done' ? { state: 'done' } : { state: 'paused', reason: 'player' },
        canRead: false,
      })
      void loadSessionScreen()
    },
    [closeSessionVideo],
  )

  const openClip = useCallback(
    async (
      file: File,
      /**
       * Land on the glance rather than the report.
       *
       * Set only by the in-app recorder. It is the one entry point that knows
       * the player is on a court rather than on a sofa, and guessing that from
       * anything else — the file's age, its name — would be guessing.
       */
      glance = false,
    ) => {
      /*
       * A long clip is a practice session (L2.4), decided by its length before
       * anything else, so a session is never refused for its size the way a
       * basket is. A file whose length cannot be read takes the ordinary path,
       * whose refusals already explain an unreadable video.
       */
      if (!looksLikeNonVideo(file.type)) {
        const duration = await probeDuration(file)
        if (duration !== undefined && isSession(duration)) {
          await openSessionClip(file, duration)
          return
        }
      }

      // Positional `undefined` so the defaults on `run` still apply — restating
      // them here would be two places to change the day one of them moves.
      const analysis = await run(file, undefined, undefined, undefined, 'sweep')
      if (!analysis) return

      // `run` was told not to show it, so nothing else can, and the analysing
      // screen has no way out on its own. Every path below this line has to
      // either start the sweep or put the report up.
      const show = () => {
        if (!urlRef.current) return
        setView({ kind: glance ? 'glance' : 'report', analysis, videoUrl: urlRef.current })
      }

      // The same two things `compareServes` needs before it will do anything.
      // Asked here as well, because it returns quietly when they are missing and
      // the screen it would have been leaving is a progress bar that never ends.
      /*
       * A basket recorded on court is still glanced at, not swept.
       *
       * The sweep is a video pass per serve, up to `MAX_CONSISTENCY_SERVES` of
       * them, and spending that while somebody is standing on a baseline is the
       * opposite of what this route is for. The comparison is for sitting down
       * with the clip afterwards, and the button for it is still on the report
       * one tap away.
       *
       * That used to read "twenty-five seconds on a full basket", which was a
       * number nobody had measured — `analyzeAllServes` says so in as many
       * words, and it was the module actually doing the work. It was also not
       * consistent with the rest of this codebase's own arithmetic: a single
       * pipeline pass is described as about half a minute in half a dozen
       * places, and six of those cannot come to twenty-five seconds. The honest
       * unit is a pass per serve; what a pass costs on a phone is step 8 of
       * `COURT-CHECK.md` and has never been run.
       */
      // Not on a clip the engine refused (L1.7): its own read was not
      // believed, and up to six more passes over the same footage would cost a
      // minute to fill a comparison with serves it believes no better.
      if (
        !glance &&
        analysis.serves.count > 1 &&
        analysis.triage?.status !== 'rejected' &&
        lastFileRef.current &&
        urlRef.current
      ) {
        await compareServes(analysis)
        return
      }
      show()
    },
    [compareServes, run, openSessionClip],
  )

  const cancel = () => {
    abortRef.current?.abort()
    releaseVideo()
    setSweep(undefined)
    setView({ kind: 'home' })
  }

  /**
   * Stop the sweep, keep the clip, keep the serves already measured.
   *
   * Deliberately not `cancel`: that one is for a single analysis, where
   * stopping means there is nothing to show and the object URL should go. A
   * sweep is launched from a report that is still there behind it, and every
   * serve it has finished is a complete measurement — so stopping hands back
   * what it has and `compareServes` carries on from the line after the await.
   *
   * The flag is set here rather than left to the abort, because the abort is
   * not visible to the player: the signal is read at the seek checks in the
   * extraction pass, so the screen would carry on filling in rows for the rest
   * of a serve while the button still read "Stop and compare these 4". Marking
   * it answers the press in the same frame; the sweep itself unwinds when it
   * gets there.
   */
  const stopSweep = () => {
    abortRef.current?.abort()
    setSweep((s) => (s ? { ...s, stopping: true } : s))
  }

  const goHome = () => {
    setView({ kind: 'home' })
    refreshSessions()
  }

  /** Off the session screen: the reading stops with its place kept, and the video goes. */
  const leaveSession = () => {
    closeSessionVideo()
    releaseVideo()
    lastFileRef.current = undefined
    goHome()
  }

  /*
   * A session pauses when the page is hidden or the phone runs hot (L2.5).
   *
   * Hidden first: a backgrounded tab gets no frames, so every seek would wait
   * out its timeout and the reading would crawl. Stopping keeps the place, and
   * the screen says why when the player comes back.
   */
  const sessionRunning = view.kind === 'session' && view.stage.state === 'running'
  useEffect(() => {
    if (!sessionRunning) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') stopSession('hidden')
    }
    document.addEventListener('visibilitychange', onHide)
    let live = true
    let unwatch = () => {}
    void loadSessionLive().then((m) => {
      if (live) unwatch = m.watchWarmth(() => stopSession('warm'))
    })
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onHide)
      unwatch()
    }
  }, [sessionRunning, stopSession])

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

  /**
   * A delete that can be taken back for a few seconds.
   *
   * The trash icon sat beside every row with no confirmation, so one mis-tap
   * lost a serve for good. The row disappears at once and the delete itself
   * waits: a second delete, the sheet closing, or the timer running out
   * commits it, and "Undo" in between simply forgets it was asked for. Held
   * rather than re-saved on undo, because `saveSession` takes a full analysis
   * and a stored report no longer is one.
   */
  const [pendingDelete, setPendingDelete] = useState<string>()
  const pendingTimer = useRef<ReturnType<typeof setTimeout>>()
  const commitDelete = useCallback(
    (id: string | undefined) => {
      clearTimeout(pendingTimer.current)
      setPendingDelete(undefined)
      if (!id) return
      void safely(() => deleteSession(id), undefined).then(refreshSessions)
    },
    [refreshSessions],
  )
  const remove = (id: string) => {
    commitDelete(pendingDelete)
    setPendingDelete(id)
    pendingTimer.current = setTimeout(() => commitDelete(id), 5000)
  }
  const undoDelete = () => {
    clearTimeout(pendingTimer.current)
    setPendingDelete(undefined)
  }
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
                setView({ kind: 'report', analysis: view.analysis, videoUrl: view.videoUrl })
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
              onAnalyzeAnother={goHome}
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
              onGlance={
                liveReport
                  ? () => setView({ kind: 'glance', analysis: liveReport.analysis, videoUrl: liveReport.videoUrl })
                  : undefined
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
                <button className="btn btn--primary btn--full" onClick={goHome}>
                  Try another video
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
          <p className="sheet-empty">No serves analysed yet.</p>
        ) : (
          <ul className="history">
            {sessions.filter((s) => s.id !== pendingDelete).map((s) => (
              <li key={s.id}>
                {/* Literally the same row Home draws — same `.recent` rules,
                    same ring. A past serve was two objects in this app, which
                    made the history read as a separate feature rather than the
                    same list seen somewhere else. */}
                <button
                  className="recent"
                  onClick={() => {
                    setSheet(null)
                    openSaved(s)
                  }}
                >
                  <ScoreRing score={s.overall} status={s.overallStatus} size={42} animate={false} />
                  <span className="recent-text">
                    <strong>{s.focus.title}</strong>
                    <span>
                      {new Date(s.createdAt).toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn icon-btn--quiet"
                  onClick={() => remove(s.id)}
                  aria-label={`Delete serve from ${new Date(s.createdAt).toLocaleDateString()}`}
                >
                  <Icon name="trash" size={17} />
                </button>
              </li>
            ))}
          </ul>
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
