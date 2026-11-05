/**
 * Reading a clip, from the pick to the report (L6.11): `run`, the basket
 * sweep (`compareServes`), the practice session's reading, `openClip` that
 * chooses between them, and the refs they share — moved out of `App.tsx`
 * whole, with their bodies unchanged, so the screen and the work can be read
 * apart. The decisions inside them that are worth a test are pure functions
 * of their own (`runDecisions.ts`).
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { markRead, markReading, type Interrupted } from '../lib/interrupted'
import type { AnalyzeProgress } from '../lib/analysis/analyze'
import type { PoseSample } from '../lib/analysis/kalman'
import { forgetAll, recall, remember } from '../lib/analysisCache'
import type { ServePairFrames } from '../lib/analysis/consistency'
import { SCORING_VERSION, hintsOf, type Analysis, type Frame, type NotAServeError } from '../lib/analysis/types'
import { Cancelled, looksLikeNonVideo } from '../lib/pose/errors'
import { type Prefs } from '../lib/storage/prefs'
import { clipIdOf, fileKeyOf, sessionKeyFor } from '../lib/storage/sessionKey'
import { getPracticeSession, safely, savePracticeSession, type Session } from '../lib/storage/db'
import { drilledFault } from '../lib/weekPlan'
import { isSession } from '../lib/session/length'
import { probeDuration } from '../lib/session/probe'
import { sessionIdFor, type PracticeSession, type SessionStage } from '../lib/session/session'
import type { SessionVideo } from '../lib/session/video'
import { keepClip } from '../lib/storage/clipStore'
import { applyWhenIdle, onUpdateWaiting } from '../lib/updates'
import type { SweepProgress } from '../screens/Analyzing'
import { loadAnalysis, loadAnalyzing, loadReport, loadSessionScreen, loadSessionLive, loadGlance } from '../appLoaders'
import type { View } from '../App'
import { earlyRefusal, readFailure, sweepAfterRead, updateMayLand } from './runDecisions'


/** What the work needs from the app around it, by the names it used there. */
export interface AnalysisRunDeps {
  view: View
  setView: Dispatch<SetStateAction<View>>
  prefs: Prefs
  sessions: Session[]
  refreshSessions: () => void
  trySave: (analysis: Analysis) => Promise<void>
  setPair: Dispatch<SetStateAction<ServePairFrames | undefined>>
  recheckOffline: () => void
  historyRef: MutableRefObject<{ sessions: Session[]; ladder?: Partial<Record<string, number>> }>
  setKeepFailedFor: Dispatch<SetStateAction<string | undefined>>
  setInterrupted: Dispatch<SetStateAction<Interrupted | undefined>>
}

export function useAnalysisRun(deps: AnalysisRunDeps) {
  const { view, setView, prefs, sessions, refreshSessions, trySave, setPair, recheckOffline, historyRef, setKeepFailedFor, setInterrupted } = deps
  const [progress, setProgress] = useState<AnalyzeProgress>({ step: 'engine', ratio: 0 })
  // The bodies the tracker has read in this pass, for the waiting screen. A ref,
  // because a render per pose would compete with the model for the thread.
  const liveFrames = useRef<Frame[]>([])
  const onPose = useCallback((s: PoseSample) => {
    if (s.pose) liveFrames.current.push({ index: liveFrames.current.length, t: s.t, image: s.pose.image, world: s.pose.world, visibility: 1 })
  }, [])
  /**
   * The basket sweep filling in, or nothing when a single serve is being read.
   *
   * Held here rather than inside `compareServes` because it is what the
   * analysing screen draws while the sweep runs, and because its presence is
   * how the cancel button knows it should stop the sweep and keep the results
   * rather than throw the clip away and go home.
   */
  const [sweep, setSweep] = useState<SweepProgress>()
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
    const idle = () => updateMayLand({ view: view.kind, holdsVideo: Boolean(urlRef.current), sweeping: Boolean(sweep) })
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
      /** A full read of a clip first read without the refinement model (M1.3). */
      extra: { waitForRefine?: boolean } = {},
    ): Promise<Analysis | undefined> => {
      const refused = earlyRefusal(file)
      if (refused) {
        setView({ kind: 'error', ...refused })
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
      liveFrames.current = []
      // One serve, so the analysing screen shows steps rather than a basket. A
      // sweep stopped a moment ago would otherwise leave its serve rows under
      // the progress bar of an unrelated clip.
      setSweep(undefined)
      void loadAnalyzing()
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
          waitForRefine: extra.waitForRefine,
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
          onPose,
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

        // The history looks after itself from here: see `storage/protect.ts`.
        void import('../lib/storage/protect').then((m) => m.protectAfterSave())

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
          setView({ kind: 'error', again: true, ...readFailure(globalThis.navigator?.onLine !== false) })
        }
      } finally {
        markRead()
      }
    },
    // `sessions` is read to preserve the original filing date of a re-analysis;
    // leaving it out would capture an empty list from the first render.
    [
      onPose,
      releaseVideo,
      trySave,
      sessions,
      prefs.handedness,
      prefs.serveType,
      prefs.tier,
      prefs.keepClips,
      recheckOffline,
      setInterrupted,
      setKeepFailedFor,
      setPair,
      setView,
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
      liveFrames.current = []
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
          ? (await import('../lib/analysis/progressions')).checkDrill(target, swept.serves)
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
    [trySave, historyRef, setPair, setView],
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
    [closeSessionVideo, releaseVideo, setView],
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
    [closeSessionVideo, releaseVideo, sessionFailed, prefs.serveType, prefs.handedness, setPair, setView],
  )

  /**
   * Read the session on screen, or carry on reading it (L2.5): `driveSession`,
   * handed the video, the screen and the store. Every serve read is saved
   * before the next starts, so a stop of any kind keeps what was read and its
   * place.
   */
  const startSession = useCallback(
    async (mode: 'sample' | 'every', withSpeed = false) => {
      const shown = sessionViewRef.current
      const reader = sessionVideoRef.current
      if (!shown || !reader || !shown.canRead) return
      const perSampleMs =
        shown.stage.state === 'planning' || shown.stage.state === 'paused' ? shown.stage.perSampleMs : undefined
      // A session already begun keeps the choices it began with, speeds included.
      const start: PracticeSession = shown.session.found
        ? shown.session
        : { ...shown.session, mode, ...(withSpeed ? { withSpeed } : {}) }

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
        void import('../lib/storage/protect').then((m) => m.protectAfterSave({ practiceServes: start.chosen?.length ?? start.found?.length ?? 0 }))
      } catch (err) {
        if (sessionAbortRef.current !== controller) return
        sessionFailed(err)
      }
    },
    [prefs.tier, refreshSessions, sessionFailed, setView],
  )

  /** Stop the reading and keep its place. The screen answers the press at once. */
  const stopSession = useCallback((reason: 'player' | 'hidden' | 'warm') => {
    stopReasonRef.current = reason
    sessionAbortRef.current?.abort()
    setView((v) =>
      v.kind === 'session' && v.stage.state === 'running' ? { ...v, stage: { ...v.stage, stopping: true } } : v,
    )
  }, [setView])

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
    [closeSessionVideo, setView],
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
        sweepAfterRead({
          glance,
          serves: analysis.serves.count,
          refused: analysis.triage?.status === 'rejected',
          clipOpen: Boolean(lastFileRef.current && urlRef.current),
        })
      ) {
        await compareServes(analysis)
        return
      }
      show()
    },
    [compareServes, run, openSessionClip, setView],
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

  return { liveFrames, progress, sweep, lastFileRef, urlRef, run, openClip, stopSweep, stopSession, releaseVideo, cancel, startSession, sessionRunning, openPracticeSession, compareServes, closeSessionVideo }
}
