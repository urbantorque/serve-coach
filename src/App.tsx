import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FilmingGuide from './components/FilmingGuide'
import HandednessPicker from './components/HandednessPicker'
import StoragePanel from './components/StoragePanel'
import PracticeCard from './components/PracticeCard'
import { DeltaBars, DeltaChip, GapTrend, ScoreTrend, TrendTable } from './components/Trend'
import { Icon, ScoreRing, Sheet } from './components/primitives'
import { findPracticeFocus, type PracticeFocus } from './lib/practice'
import { buildConsistencyTrend, buildProgress, typeOf } from './lib/progress'
import {
  analyzeAllServes,
  analyzeServe,
  rediagnose,
  rescore,
  sweepWindow,
  type AnalyzeProgress,
} from './lib/analysis/analyze'
import { forgetAll, recall, remember } from './lib/analysisCache'
import { buildConsistency, pairStills, type ServePairFrames } from './lib/analysis/consistency'
import {
  hintsOf,
  type Analysis,
  type FailedCapture,
  type NotAServeError,
} from './lib/analysis/types'
import { SERVE_TYPES } from './lib/analysis/coaching'
import { Cancelled } from './lib/pose/extract'
import { isCachedOffline, loadEngine } from './lib/pose/poseEngine'
import {
  deleteSession,
  getSession,
  listPracticeLogs,
  listSummaries,
  logPractice,
  safely,
  saveSession,
  unlogPractice,
  type PracticeLog,
  type Session,
} from './lib/storage/db'
import { requestPersistence } from './lib/storage/backup'
import { readPrefs, writePrefs, type Prefs, type ServeType } from './lib/storage/prefs'
import { sessionKeyFor } from './lib/storage/sessionKey'
import Analyzing, { type SweepProgress } from './screens/Analyzing'
import Glance from './screens/Glance'
import Home, { type OfflineWarmup } from './screens/Home'
import Report from './screens/Report'

type View =
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
  | { kind: 'glance'; analysis: Analysis; videoUrl: string }
  | { kind: 'saved'; session: Session }
  | { kind: 'error'; title: string; hints: string[]; capture?: FailedCapture; fileName?: string }

const MAX_BYTES = 400 * 1024 * 1024

/**
 * A stand-in keyframe still, for `?demo=basket` only.
 *
 * The synthetic rig has no camera and therefore no pictures, so the paired strip
 * would be the one part of a basket report the demo route could not show — and
 * showing the UI without filming anything is the entire reason that route
 * exists. Labelled and the right aspect, so the layout it produces is the real
 * layout; obviously not a body, so nobody mistakes it for one.
 */
function placeholderStill(label: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 150
  canvas.height = 200
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#151a24'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#232a38'
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1)
  ctx.fillStyle = '#7b8799'
  ctx.font = '13px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, canvas.width / 2, canvas.height / 2)
  return canvas.toDataURL('image/png')
}

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
  const [sheet, setSheet] = useState<'guide' | 'guide-first' | 'history' | 'progress' | null>(null)
  /** Bumped to ask the home screen to open its viewfinder. See Home's `openFraming`. */
  const [framingNonce, setFramingNonce] = useState(0)
  const [offlineReady, setOfflineReady] = useState(false)
  const [warming, setWarming] = useState<OfflineWarmup>()
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)

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
    setView({ kind: 'saved', session })
  }, [])

  /**
   * Fetch the pose engine now rather than during the first analysis.
   *
   * The same `loadEngine` every analysis calls, so this is a warm-up and not a
   * second download path: whatever it caches is what the next analysis skips.
   * The cache is re-read afterwards rather than assumed, because a browser that
   * declined to store 19 MB should leave the badge saying so.
   */
  const makeOffline = useCallback(async () => {
    setWarming({ stage: 'downloading', ratio: 0 })
    try {
      await loadEngine((p) => {
        if (p.stage === 'downloading') setWarming({ stage: 'downloading', ratio: p.ratio })
        else if (p.stage === 'starting') setWarming({ stage: 'starting' })
      })
    } catch {
      setWarming({ stage: 'failed' })
      return
    }
    // Downloading and keeping are separate questions, and only the cache
    // answers the second one. A browser that will not store 19 MB — an iOS
    // private window, service workers turned off — has just loaded an engine
    // this session can use and will have nothing after a reload.
    const cached = await isCachedOffline()
    setOfflineReady(cached)
    setWarming(cached ? undefined : { stage: 'unkept' })
  }, [])

  /** Mark the guide as seen and open the file picker straight after it. */
  const finishFirstRunGuide = useCallback(() => {
    setPrefs(writePrefs({ seenFilmingGuide: true }))
    setSheet(null)
    // After the sheet unmounts, or the click lands on an element being removed.
    setTimeout(() => firstRunPickRef.current?.click(), 60)
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

  const refreshSessions = useCallback(() => {
    void safely(listSummaries, []).then(setSessions)
    // `undefined` on failure rather than `[]`, and the difference is the whole
    // point of the field it feeds: an empty list is "nothing has been logged"
    // and a missing one is "this app cannot say", and the card says different
    // things about a player in each case.
    void safely<PracticeLog[] | undefined>(listPracticeLogs, undefined).then(setDrillLogs)
  }, [])

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

  const form = useMemo(() => buildProgress(sessions), [sessions])
  const practice = useMemo(
    () => findPracticeFocus(sessions, undefined, undefined, drillLogs),
    [sessions, drillLogs],
  )
  // Read by `logDrill`, which is declared above this and would otherwise have to
  // be redefined every time the focus changes — and it is handed to a button
  // that must not be replaced under the player's finger.
  practiceRef.current = practice
  // Keyed to whatever serve type the form chart settled on, so the two blocks in
  // the sheet cannot end up describing different halves of the history.
  const spread = useMemo(
    () => (form ? buildConsistencyTrend(sessions, form.serveType) : undefined),
    [sessions, form],
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
    void isCachedOffline().then(setOfflineReady)

    // Dev-only: `?demo` renders a report from a simulated serve, so the UI can
    // be worked on without filming one. Dynamically imported so it is not in
    // the production bundle.
    const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo')
    if (demo !== null && demo !== false) {
      void import('./dev/sampleAnalysis').then(async ({ sampleAnalysis, sampleBasket, sampleClip, fitToClip, DEMO_DIALS }) => {
        // The two screens that are otherwise unreachable without going out and
        // filming a bad serve: the injury banner, which needs a spine folding
        // under load, and the refusal, which needs a clip the engine throws out.
        // Both were built and neither could be looked at.
        const analysis = sampleAnalysis(DEMO_DIALS[demo as string] ?? {})
        if (demo === 'basket' || demo === 'live') {
          const url = await sampleClip(analysis.window.end - analysis.window.start + 0.4)
          urlRef.current = url
          // The recorded clip is never exactly the requested length, so fit the
          // analysis to what actually came out.
          const probe = document.createElement('video')
          probe.src = url
          await new Promise((r) => {
            probe.onloadedmetadata = r
            setTimeout(r, 3000)
          })
          const fitted = fitToClip(analysis, probe.duration)
          if (demo === 'basket') {
            // Five serves, the last one on screen, and the sweep attempted all
            // five — `sampleBasket` returns the four it could read. The counts
            // have to agree or the demo shows a panel no real clip produces.
            fitted.serves = { count: 5, index: 4 }
            const basket = sampleBasket()
            fitted.consistency = buildConsistency(basket, 5)
            // The rig draws no pictures, so the paired strip would be the one
            // part of a basket report `?demo=basket` could not show — which is
            // the whole reason this route exists. Stand-in tiles rather than
            // nothing: they are the right count, the right shape and the right
            // labels, so the layout is real even though the bodies in them are
            // not. Dev-only, like everything else down this branch.
            // `?demo=basket&nostills` is the state every re-opened report is in:
            // the words kept, the pictures gone with the clip. Reachable on
            // purpose, because it is the branch nobody would otherwise look at
            // and the one where a silent blank reads as a bug.
            const noStills = new URLSearchParams(location.search).has('nostills')
            if (fitted.consistency?.gap && !noStills) {
              const { gap } = fitted.consistency
              for (const a of basket) {
                for (const p of a.phases) p.thumbnail = p.thumbnail ?? placeholderStill(p.label)
              }
              setPair(pairStills(basket, gap))
            }
          }
          setView({ kind: 'report', analysis: fitted, videoUrl: url })
        } else if (demo === 'glance') {
          // The between-serves screen, which is otherwise only reachable by
          // recording a serve on a device with a camera — and no camera has
          // ever pointed at this code. `?demo=glance-refused` is the other half:
          // a clip the engine threw out, which is the branch that must never
          // show a score.
          setView({ kind: 'glance', analysis, videoUrl: '' })
        } else if (demo === 'glance-refused') {
          setView({
            kind: 'glance',
            analysis: {
              ...analysis,
              triage: { ...analysis.triage, status: 'rejected', reason: 'too_few_frames' },
            } as Analysis,
            videoUrl: '',
          })
        } else {
          const { frames: _f, ...session } = analysis
          void _f
          setView({ kind: 'saved', session })
        }
      })
    }
  }, [refreshSessions])

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
            void safely(() => saveSession(shown), undefined).then(refreshSessions)
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
      setView({ kind: 'analyzing', fileName: file.name || 'Your serve' })

      try {
        const analysis = await analyzeServe({
          videoUrl: url,
          fileName: file.name || 'Your serve',
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
          onProgress: setProgress,
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
        void safely(() => saveSession(analysis), undefined).then(refreshSessions)
        void isCachedOffline().then(setOfflineReady)

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
      refreshSessions,
      releaseVideo,
      sessions,
      prefs.handedness,
      prefs.serveType,
      prefs.tier,
      prefs.askedToPersist,
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
          onProgress: setProgress,
          // Each serve as it is measured, so a run of full analysis passes is
          // visible while it happens instead of arriving all at once at the end.
          onServe: ({ number, analysis: serve }) =>
            setSweep((s) => (s ? { ...s, done: [...s.done, { number, score: serve?.overall }] } : s)),
          // The report this was launched from already scanned this clip.
          knownServeTimes: serveTimesRef.current,
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

        // What the sweep actually read to a conclusion — not how many serves are
        // in the clip, and not how many it set out to measure. Either of those
        // would report serves nothing finished looking at as ones too unclear
        // to read: the ones past the cap, or the ones the player stopped.
        const result = buildConsistency(swept.serves, swept.attempted)

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
        // Built here and not inside `buildConsistency`, because this is the last
        // moment the swept analyses exist: that call reduces them to numbers and
        // nothing else holds the originals. The stills go no further than the
        // screen.
        setPair(result.gap ? pairStills(swept.serves, result.gap) : undefined)

        const measured: Analysis = { ...analysis, consistency: result }
        remember({ sessionKey: measured.id, handedness: measured.handedness }, measured)
        setView({ kind: 'report', analysis: measured, videoUrl: url })
        void safely(() => saveSession(measured), undefined).then(refreshSessions)
      } catch (err) {
        if (abortRef.current !== controller || err instanceof Cancelled) return
        setView({ kind: 'report', analysis, videoUrl: url })
      } finally {
        // Guarded, so a sweep that was superseded cannot wipe the rows of the
        // run that replaced it.
        if (abortRef.current === controller) setSweep(undefined)
      }
    },
    [refreshSessions],
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
       * The sweep is a video pass per serve — twenty-five seconds on a full
       * basket — and spending that while somebody is standing on a baseline is
       * the opposite of what this route is for. The comparison is for sitting
       * down with the clip afterwards, and the button for it is still on the
       * report one tap away.
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

  const remove = async (id: string) => {
    await safely(() => deleteSession(id), undefined)
    refreshSessions()
  }

  return (
    <div className="app">
      <main className="shell">
        {view.kind === 'home' && (
          <Home
            sessions={sessions}
            offlineReady={offlineReady}
            onPick={(f) => void openClip(f)}
            onRecorded={(f) => void openClip(f, true)}
            openFraming={framingNonce}
            onOpen={openSaved}
            onShowGuide={() => setSheet('guide')}
            onShowHistory={() => setSheet('history')}
            onShowProgress={() => setSheet('progress')}
            needsFilmingGuide={!prefs.seenFilmingGuide}
            onGuideThenPick={() => setSheet('guide-first')}
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
                void safely(() => saveSession(rescored), undefined).then(refreshSessions)
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
              void safely(() => saveSession(rejudged), undefined).then(refreshSessions)
            }}
            onCheckConsistency={
              lastFileRef.current && view.analysis.serves.count > 1
                ? () => void compareServes(view.analysis)
                : undefined
            }
            servePair={pair}
          />
        )}

        {view.kind === 'saved' && (
          <Report
            key={view.session.id}
            analysis={view.session}
            previous={priorTo(view.session.createdAt, typeOf(view.session))}
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
      </main>

      <Sheet open={sheet === 'guide'} onClose={() => setSheet(null)} title="How to film your serve">
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
        title="First, how to film it"
      >
        <FilmingGuide />
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
          {prefs.handedness ? 'Got it — choose my video' : 'Pick a hand to continue'}
        </button>
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

      <Sheet open={sheet === 'history'} onClose={() => setSheet(null)} title="Your serves">
        {sessions.length === 0 ? (
          <p className="sheet-empty">No serves analysed yet.</p>
        ) : (
          <ul className="history">
            {sessions.map((s) => (
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
                  onClick={() => void remove(s.id)}
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
        <StoragePanel count={sessions.length} onImported={refreshSessions} />
      </Sheet>

      {/* Not "Your form" — the home card already owns that name for the average
          of the last three serves, and this sheet is the whole history behind
          it. Two panels titled the same thing showing different numbers is the
          one thing a player will read as a bug. */}
      <Sheet open={sheet === 'progress'} onClose={() => setSheet(null)} title="Every serve so far">
        {form && form.points.length > 1 ? (
          <div className="progress-sheet">
            <div className="progress-summary">
              <span className="progress-hero tnum">{form.latest.overall}</span>
              <span className="progress-unit">
                latest {SERVE_TYPES[form.serveType].label.split(' ')[0].toLowerCase()} serve
                <DeltaChip delta={form.overallDelta} />
              </span>
            </div>

            {/* Said out loud rather than left as a gap in the chart. Somebody who
                has filmed twenty serves and sees eleven plotted will assume the
                app lost the rest. */}
            {form.setAside > 0 && (
              <p className="progress-aside">
                Showing your {SERVE_TYPES[form.serveType].label.toLowerCase()} serves only.{' '}
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

            <section className="block">
              <h3 className="block-title">Overall score by session</h3>
              <ScoreTrend points={form.points} />
            </section>

            {form.areaDeltas.length > 0 && (
              <section className="block">
                <h3 className="block-title">Change since your last serve</h3>
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
                <h3 className="block-title">How repeatable, over time</h3>
                <GapTrend points={spread.points} />
                {spread.recurring && (
                  <p className="sheet-note">
                    {spread.recurring.label} has been your least repeatable part in{' '}
                    {spread.recurring.sessions} of these. That is the one to practise most.
                  </p>
                )}
              </section>
            )}

            <details className="progress-table">
              <summary>See the numbers as a table</summary>
              <TrendTable points={form.points} />
            </details>
          </div>
        ) : (
          <p className="sheet-empty">
            Analyse two serves and this will show whether your changes are working.
          </p>
        )}
      </Sheet>
    </div>
  )
}
