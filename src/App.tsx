import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FilmingGuide from './components/FilmingGuide'
import HandednessPicker from './components/HandednessPicker'
import StoragePanel from './components/StoragePanel'
import DeviceCheck from './components/DeviceCheck'
import CorpusIngest from './components/CorpusIngest'
import { Icon, ScoreRing, Sheet } from './components/primitives'
import { useBackLayer } from './components/useBackLayer'
import { useWakeLock } from './components/useWakeLock'
import { findPracticeFocus, type PracticeFocus } from './lib/practice'
import type { InjuryFlag } from './lib/analysis/triage'
import {
  strainBehindLine,
  strainGlanceLine,
} from './lib/analysis/verdict'
import {
  bestConsistencyGap,
  bestOverallScore,
  faultMoveOnTrip,
  rotationMoveOnTrip,
  buildConsistencyTrend,
  gapDeltaFor,
  glanceStrain,
  strainBehindOf,
  streakLine,
  typeOf,
} from './lib/progress'
import {
  analyzeAllServes,
  analyzeServe,
  rediagnose,
  rescore,
  sweepWindow,
  throttleProgress,
  type AnalyzeProgress,
} from './lib/analysis/analyze'
import { forgetAll, recall, remember } from './lib/analysisCache'
import type { FaultMove } from './lib/analysis/carryForward'
import type { ServePairFrames } from './lib/analysis/consistency'
import {
  hintsOf,
  type Analysis,
  type FailedCapture,
  type NotAServeError,
} from './lib/analysis/types'
import { Cancelled, looksLikeNonVideo } from './lib/pose/extract'
import { isCachedOffline, loadEngine } from './lib/pose/poseEngine'
import { isObjectModelCached, loadObjectEngine } from './lib/vision/objectEngine'
import { isRefineModelCached, loadRefineEngine } from './lib/pose/refineEngine'
import {
  deleteSession,
  getSession,
  listPracticeLogs,
  listServeTags,
  listSummaries,
  logPractice,
  safely,
  saveSession,
  unlogPractice,
  type PracticeLog,
  tagServe,
  tagsById,
  untagServe,
  withServeTag,
  type ServeTag,
  type Session,
} from './lib/storage/db'
import { requestPersistence } from './lib/storage/backup'
import { readPrefs, writePrefs, type Prefs, type ServeType } from './lib/storage/prefs'
import { sessionKeyFor } from './lib/storage/sessionKey'
import { applyWhenIdle, onUpdateWaiting } from './lib/updates'
import Analyzing, { type SweepProgress } from './screens/Analyzing'
import Glance from './screens/Glance'
import Home, { type OfflineWarmup } from './screens/Home'
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
  /**
   * The drills the player has marked done, or `undefined` when storage could not
   * be read.
   *
   * The two are different answers and stay different all the way to the card:
   * empty means nothing has been logged, missing means this app cannot say. A
   * player on a browser with no IndexedDB must not be told they have not been
   * practising.
   */
  const [drillLogs, setDrillLogs] = useState<PracticeLog[]>()
  const [sessions, setSessions] = useState<Session[]>([])
  /**
   * Whether storage has answered yet.
   *
   * `sessions` starts empty and a returning player's list arrives a beat later,
   * so without this the home screen spent that beat telling somebody with sixty
   * serves that they had none — an example-report invitation that flashed and
   * vanished on every cold open. Home holds its first-run straps until this is
   * true.
   */
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  /*
   * What the player has said about their own serves, by report id.
   *
   * Held here rather than fetched by the glance, for the reason every other
   * store-backed list on this screen is: a component that fetches on mount
   * refetches on every remount, and the glance is remounted on every serve of a
   * basket. Loaded once beside the sessions and refreshed by the same call.
   */
  const [serveTags, setServeTags] = useState<ServeTag[]>([])
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
  /** `undefined` until the cache has been asked, so the badge does not flash "Download now" at a player who already has. */
  const [offlineReady, setOfflineReady] = useState<boolean>()
  const [warming, setWarming] = useState<OfflineWarmup>()
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
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
   * Show a report built from a simulated serve.
   *
   * Dynamically imported so the rig that generates it stays out of the initial
   * bundle — it is a few tens of kilobytes that most sessions never need, and
   * the first load already has a pose model to fetch.
   */
  const showExample = useCallback(async () => {
    const { sampleAnalysis } = await import('./dev/sampleAnalysis')
    const { frames: _f, ...session } = sampleAnalysis()
    void _f
    setView({ kind: 'saved', session, example: true })
  }, [])

  /**
   * Whether the *whole* offline footprint is in the cache — the pose model
   * and its WASM runtime, and the object model the racket detector needs.
   * Two separate cache checks because the two engines vendor into separate
   * `caches.match` entries; the WASM runtime is not checked twice, since both
   * engines load it from the same URL and `isCachedOffline` already covers
   * it (see the note on `isObjectModelCached`).
   */
  const checkOfflineReady = useCallback(
    () =>
      Promise.all([isCachedOffline(), isObjectModelCached(), isRefineModelCached()]).then(
        ([pose, object, refine]) => pose && object && refine,
      ),
    [],
  )

  /**
   * Fetch both engines now rather than during the first analysis.
   *
   * The same `loadEngine`/`loadObjectEngine` every analysis calls, so this is
   * a warm-up and not a second download path: whatever it caches is what the
   * next analysis skips. The cache is re-read afterwards rather than assumed,
   * because a browser that declined to store 57 MB should leave the badge
   * saying so.
   */
  const makeOffline = useCallback(async () => {
    setWarming({ stage: 'downloading', ratio: 0 })
    try {
      await loadEngine((p) => {
        if (p.stage === 'downloading') setWarming({ stage: 'downloading', ratio: p.ratio })
        else if (p.stage === 'starting') setWarming({ stage: 'starting' })
      })
      // Sequential, not `Promise.all`, so the progress bar reads as one
      // download finishing after another rather than two competing ratios
      // fighting over the same number.
      await loadObjectEngine((p) => {
        if (p.stage === 'downloading') setWarming({ stage: 'downloading', ratio: p.ratio })
        else if (p.stage === 'starting') setWarming({ stage: 'starting' })
      })
      // The swing refinement, last and largest. No byte progress of its own:
      // it reports as setting up, which is what the player needs to know.
      setWarming({ stage: 'starting' })
      await loadRefineEngine()
    } catch {
      setWarming({ stage: 'failed' })
      return
    }
    // Downloading and keeping are separate questions, and only the cache
    // answers the second one. A browser that will not store the download —
    // an iOS private window, service workers turned off — has just loaded
    // both engines for this session and will have nothing after a reload.
    const cached = await checkOfflineReady()
    setOfflineReady(cached)
    setWarming(cached ? undefined : { stage: 'unkept' })
  }, [checkOfflineReady])

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

  /**
   * A seeded history, held in place of the real one. `?demo=history`, dev only.
   *
   * A ref rather than a branch at every read site: `refreshSessions` is the one
   * door into `sessions` and `drillLogs`, and it is called again on every save,
   * every delete and every trip back to the home screen — so a seed that only
   * set state once would survive until the first navigation and then vanish,
   * which is worse than not having it. Nothing writes to storage, deliberately:
   * a dev's own history is real data and fifteen fabricated reports in it is a
   * mess somebody has to clean up by hand.
   */
  const demoHistory = useRef<{ sessions: Session[]; practice: PracticeLog[] }>()

  /*
   * One tap, applied to the row that holds both of them.
   *
   * Optimistic in the same shape the rest of this file is: the merge is pure
   * and the local list is updated from its result, so the screen answers the
   * tap immediately and a failed write leaves the list and the store agreeing
   * on the next refresh rather than the screen showing a tag that was never
   * stored.
   */
  const applyServeTag = useCallback(
    async (id: string, patch: Partial<Pick<ServeTag, 'serveNumber' | 'outcome'>>) => {
      let next: ServeTag | undefined
      setServeTags((tags) => {
        next = withServeTag(tags.find((t) => t.id === id), id, patch, Date.now())
        const rest = tags.filter((t) => t.id !== id)
        return next ? [...rest, next] : rest
      })
      await safely(() => (next ? tagServe(next) : untagServe(id)), undefined)
    },
    [],
  )
  const refreshSessions = useCallback(() => {
    if (demoHistory.current) {
      setSessions(demoHistory.current.sessions)
      setDrillLogs(demoHistory.current.practice)
      setSessionsLoaded(true)
      return
    }
    void safely(listSummaries, []).then((list) => {
      // A read started before `?demo=history` seeded itself can land after
      // it, and used to replace the season with the empty real store.
      if (demoHistory.current) return
      setSessions(list)
      setSessionsLoaded(true)
    })
    void safely(listServeTags, []).then(setServeTags)
    // `undefined` on failure rather than `[]`, and the difference is the whole
    // point of the field it feeds: an empty list is "nothing has been logged"
    // and a missing one is "this app cannot say", and the card says different
    // things about a player in each case.
    void safely<PracticeLog[] | undefined>(listPracticeLogs, undefined).then(setDrillLogs)
  }, [])

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
  const streak = useMemo(() => streakLine(sessions), [sessions])
  const practice = useMemo(
    () => findPracticeFocus(sessions, undefined, undefined, drillLogs),
    [sessions, drillLogs],
  )

  // Read by `logDrill`, which is declared above this and would otherwise have to
  // be redefined every time the focus changes — and it is handed to a button
  // that must not be replaced under the player's finger.
  practiceRef.current = practice
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
   * The single highest score any one serve of this type has earned — see
   * `bestOverallScore`. Same reasoning as `bestGapFor`: recomputed per
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
    (serveType: ServeType) => bestOverallScore(sessions, serveType),
    [sessions],
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
    refreshSessions()
    void checkOfflineReady().then(setOfflineReady)

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
          seedHistory: (history) => {
            demoHistory.current = history
            refreshSessions()
          },
          keepVideoUrl: (url) => {
            urlRef.current = url
          },
        }),
      )
    }
  }, [refreshSessions, checkOfflineReady])

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
          title: 'That video is very large',
          hints: [
            'Trim the clip to just the serve — three to five seconds is all it needs.',
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
          const shown = hit.serveType === serveType ? hit : rescore(hit, serveType) ?? hit
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
      setView({ kind: 'analyzing', fileName: file.name || 'Your serve' })

      try {
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
        void checkOfflineReady().then(setOfflineReady)

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
      checkOfflineReady,
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
      const { first, total } = sweepWindow(analysis.serves.count)
      setSweep({ total, firstNumber: first + 1, done: [] })
      setProgress({ step: 'engine', ratio: 0, detail: 'Comparing your serves' })
      void loadReport()
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
          setView({
            kind: 'error',
            // Said as it happened. The sweep can come back with one readable
            // serve or with none, and a fixed "only one" told the second player
            // about a serve that was never read.
            title:
              swept.serves.length === 1
                ? 'I could only read one of those serves'
                : 'I could not read the serves in that clip',
            hints: [
              'Comparing serves needs at least two clear ones in the same clip.',
              'Keep the whole body in frame for every serve, and avoid anyone walking behind you.',
            ],
          })
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

        const measured: Analysis = { ...analysis, consistency: result }
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
      if (!glance && analysis.serves.count > 1 && lastFileRef.current && urlRef.current) {
        await compareServes(analysis)
        return
      }
      show()
    },
    [compareServes, run],
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
  useWakeLock(view.kind === 'analyzing')

  useBackLayer(view.kind !== 'home', () => {
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

  return (
    <div className="app">
      <main className="shell">
        <Suspense fallback={null}>
          {view.kind === 'home' && (
            <Home
              sessions={sessions}
              offlineReady={offlineReady}
              sessionsLoaded={sessionsLoaded}
              onPick={(f) => void openClip(f)}
              onRecorded={(f) => void openClip(f, true)}
              openFraming={framingNonce}
              onOpen={openSaved}
              onShowGuide={() => setSheet('guide')}
              onShowHistory={() => setSheet('history')}
              onShowSettings={() => setSheet('settings')}
              onShowProgress={() => setView({ kind: 'progress' })}
              needsHandedness={!prefs.handedness}
              onGuideThen={onGuideThen}
              onShowExample={() => void showExample()}
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
              // The one recurring joint warning this serve raised — see
              // `glanceStrain`. Same reasoning as `move` above: it needs the
              // session list, which this screen has no business holding.
              strain={glanceStrainLine(view.analysis)}
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
            />
          )}

          {view.kind === 'report' && (
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
              key={view.analysis.id}
              analysis={view.analysis}
              videoUrl={view.videoUrl}
              previous={priorTo(view.analysis.createdAt, typeOf(view.analysis))}
              fixtureExport={FIXTURE_EXPORT}
              onBack={goHome}
              onAnalyzeAnother={goHome}
              onFlipHandedness={
                lastFileRef.current
                  ? () => {
                      // Correcting the badge is the player stating which hand they
                      // serve with, so it is remembered rather than being asked
                      // again on the next clip.
                      const flipped = view.analysis.handedness === 'right' ? 'left' : 'right'
                      setPrefs(writePrefs({ handedness: flipped }))
                      void run(lastFileRef.current!, flipped, view.analysis.serves.index)
                    }
                  : undefined
              }
              onPickServe={
                lastFileRef.current
                  ? (i) => void run(lastFileRef.current!, view.analysis.handedness, i)
                  : undefined
              }
              onPickServeType={(serveType) => {
                // Remembered, because a player working on their kick serve is
                // going to film several of them in a row.
                setPrefs(writePrefs({ serveType }))
                // The serve type moves target bands and nothing measured, so this
                // is arithmetic on frames already in memory rather than another
                // pass over the video. Instant, where re-running would be half a
                // minute to arrive at the same numbers.
                const rescored = rescore(view.analysis, serveType)
                if (rescored) {
                  remember(
                    { sessionKey: rescored.id, handedness: rescored.handedness },
                    rescored,
                  )
                  setView({ kind: 'report', analysis: rescored, videoUrl: view.videoUrl })
                  void trySave(rescored)
                } else if (lastFileRef.current) {
                  void run(
                    lastFileRef.current,
                    view.analysis.handedness,
                    view.analysis.serves.index,
                    serveType,
                  )
                }
              }}
              statedTier={prefs.tier}
              onPickTier={(tier) => {
                // Remembered for the next clip, and applied to this one without
                // touching the video: the tier moves which band every signal is
                // judged against and nothing that was measured, so re-reading the
                // clip would spend half a minute arriving at the same landmarks.
                setPrefs(writePrefs({ tier }))
                const rejudged = rediagnose(view.analysis, tier)
                if (!rejudged) return
                remember(
                  { sessionKey: rejudged.id, handedness: rejudged.handedness },
                  rejudged,
                )
                setView({ kind: 'report', analysis: rejudged, videoUrl: view.videoUrl })
                void trySave(rejudged)
              }}
              onCheckConsistency={
                lastFileRef.current && view.analysis.serves.count > 1
                  ? () => void compareServes(view.analysis)
                  : undefined
              }
              servePair={pair}
              bestGap={bestGapFor(typeOf(view.analysis))}
              basketGapDelta={gapDeltaForView(view.analysis.id, typeOf(view.analysis))}
              bestScore={bestScoreFor(typeOf(view.analysis))}
              streak={streak}
              strainBehind={strainBehindFor(view.analysis.createdAt)}
              saveWarning={saveWarning}
              practice={practice}
              onLogDrill={logDrill}
              onUndoDrill={practice?.drilled ? undoDrill : undefined}
            />
          )}

          {view.kind === 'progress' && (
            <Progress
              sessions={sessions}
              practice={practice}
              onLogDrill={logDrill}
              onUndoDrill={undoDrill}
              seeded={demoHistory.current !== undefined}
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

          {view.kind === 'saved' && !view.example && (
            <Report
              key={view.session.id}
              analysis={view.session}
              previous={priorTo(view.session.createdAt, typeOf(view.session))}
              fixtureExport={FIXTURE_EXPORT}
              onBack={goHome}
              onAnalyzeAnother={goHome}
              bestGap={bestGapFor(typeOf(view.session))}
              basketGapDelta={gapDeltaForView(view.session.id, typeOf(view.session))}
              bestScore={bestScoreFor(typeOf(view.session))}
              streak={streak}
              strainBehind={strainBehindFor(view.session.createdAt)}
              practice={practice}
              onLogDrill={logDrill}
              onUndoDrill={practice?.drilled ? undoDrill : undefined}
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
        <FilmingGuide />
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
        {!prefs.seenFilmingGuide && <FilmingGuide />}
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
        <p className="sheet-note">
          Reports are kept on this device only. The video itself is never saved.
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
        <StoragePanel count={sessions.length} onImported={refreshSessions} />
        <h3 className="t-overline settings-head">This phone</h3>
        <button className="btn btn--ghost btn--full" onClick={() => setSheet('check')}>
          <Icon name="info" size={17} />
          What this phone can do
        </button>
      </Sheet>

      <Sheet open={sheet === 'check'} onClose={() => setSheet(null)} title="What this phone can do">
        <DeviceCheck />
      </Sheet>

      {/* Dev only. The import is dynamic so neither the ingest nor the pipeline
          it drives reaches the production bundle. */}
      {import.meta.env.DEV && sheet === 'corpus' && (
        <Sheet open onClose={() => setSheet(null)} title="Build a corpus">
          <CorpusIngest />
        </Sheet>
      )}

    </div>
  )
}
