import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CompareView from './components/CompareView'
import FilmingGuide from './components/FilmingGuide'
import HandednessPicker from './components/HandednessPicker'
import LevelPicker from './components/LevelPicker'
import StoragePanel from './components/StoragePanel'
import PracticeCard from './components/PracticeCard'
import { DeltaBars, DeltaChip, GapTrend, ScoreTrend, TrendTable } from './components/Trend'
import { Icon, ScoreRing, Sheet } from './components/primitives'
import { findPracticeFocus } from './lib/practice'
import { buildConsistencyTrend, buildProgress, typeOf } from './lib/progress'
import {
  MAX_CONSISTENCY_SERVES,
  analyzeAllServes,
  analyzeServe,
  rediagnose,
  rescore,
  type AnalyzeProgress,
} from './lib/analysis/analyze'
import { forgetAll, recall, remember } from './lib/analysisCache'
import { buildConsistency } from './lib/analysis/consistency'
import {
  hintsOf,
  type Analysis,
  type FailedCapture,
  type NotAServeError,
} from './lib/analysis/types'
import { SERVE_TYPES } from './lib/analysis/coaching'
import { Cancelled } from './lib/pose/extract'
import { isCachedOffline } from './lib/pose/poseEngine'
import {
  deleteSession,
  listSessions,
  safely,
  saveSession,
  type Session,
} from './lib/storage/db'
import { requestPersistence } from './lib/storage/backup'
import { readPrefs, writePrefs, type Prefs, type ServeType } from './lib/storage/prefs'
import { sessionKeyFor } from './lib/storage/sessionKey'
import Analyzing from './screens/Analyzing'
import Home from './screens/Home'
import Report from './screens/Report'

type View =
  | { kind: 'home' }
  | { kind: 'analyzing'; fileName: string }
  | { kind: 'report'; analysis: Analysis; videoUrl: string }
  | { kind: 'saved'; session: Session }
  | { kind: 'error'; title: string; hints: string[]; capture?: FailedCapture; fileName?: string }

const MAX_BYTES = 400 * 1024 * 1024

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' })
  const [progress, setProgress] = useState<AnalyzeProgress>({ step: 'engine', ratio: 0 })
  const [sessions, setSessions] = useState<Session[]>([])
  const [sheet, setSheet] = useState<
    'guide' | 'guide-first' | 'history' | 'progress' | 'compare' | null
  >(null)
  const [offlineReady, setOfflineReady] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)

  const abortRef = useRef<AbortController>()
  const urlRef = useRef<string>()
  const lastFileRef = useRef<File>()
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

  /** Mark the guide as seen and open the file picker straight after it. */
  const finishFirstRunGuide = useCallback(() => {
    setPrefs(writePrefs({ seenFilmingGuide: true }))
    setSheet(null)
    // After the sheet unmounts, or the click lands on an element being removed.
    setTimeout(() => firstRunPickRef.current?.click(), 60)
  }, [])

  const refreshSessions = useCallback(() => {
    void safely(listSessions, []).then(setSessions)
  }, [])

  const form = useMemo(() => buildProgress(sessions), [sessions])
  const practice = useMemo(() => findPracticeFocus(sessions), [sessions])
  // Keyed to whatever serve type the form chart settled on, so the two blocks in
  // the sheet cannot end up describing different halves of the history.
  const spread = useMemo(
    () => (form ? buildConsistencyTrend(sessions, form.serveType) : undefined),
    [sessions, form],
  )

  /**
   * The report currently on screen, as a stored session.
   *
   * The comparison works on saved reports, and a live analysis is one of those
   * minus its frames — so this drops them rather than making the comparison
   * handle two shapes of the same thing.
   */
  const comparing: Session | undefined = useMemo(() => {
    if (view.kind === 'saved') return view.session
    if (view.kind === 'report') {
      const { frames: _f, ...session } = view.analysis
      void _f
      return session
    }
    return undefined
  }, [view])

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
            fitted.consistency = buildConsistency(sampleBasket(), 5)
          }
          setView({ kind: 'report', analysis: fitted, videoUrl: url })
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
    ) => {
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

      // Nothing to clear: the spreads ride on the report they were measured for,
      // so a new report simply has none. When they lived in state beside the
      // view this needed an explicit reset at every entry point, and the panel
      // sat clip A's spreads under clip B's report wherever one was missed.

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
      }

      releaseVideo()
      const url = URL.createObjectURL(file)
      urlRef.current = url
      lastFileRef.current = file

      setProgress({ step: 'engine', ratio: 0, detail: 'Loading the pose engine' })
      setView({ kind: 'analyzing', fileName: file.name || 'Your serve' })

      try {
        const analysis = await analyzeServe({
          videoUrl: url,
          fileName: file.name || 'Your serve',
          handedness,
          serveIndex,
          serveType,
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

        setView({ kind: 'report', analysis, videoUrl: url })

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
          setView({
            kind: 'error',
            title: 'Something went wrong reading that video',
            hints: [
              (err as Error)?.message ?? 'Unknown error.',
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
   */
  const compareServes = useCallback(
    async (analysis: Analysis) => {
      const file = lastFileRef.current
      const url = urlRef.current
      if (!file || !url) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setProgress({ step: 'engine', ratio: 0, detail: 'Comparing your serves' })
      setView({ kind: 'analyzing', fileName: file.name || 'Your serve' })

      try {
        const all = await analyzeAllServes({
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
        })
        if (controller.signal.aborted) return

        // What the sweep actually attempted, which is capped — not how many
        // serves are in the clip. Handing over the clip's count reported every
        // serve past the cap as one too unclear to read.
        const result = buildConsistency(
          all,
          Math.min(analysis.serves.count, MAX_CONSISTENCY_SERVES),
        )

        if (!result) {
          setView({
            kind: 'error',
            title: 'I could only read one of those serves',
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
        const measured: Analysis = { ...analysis, consistency: result }
        remember({ sessionKey: measured.id, handedness: measured.handedness }, measured)
        setView({ kind: 'report', analysis: measured, videoUrl: url })
        void safely(() => saveSession(measured), undefined).then(refreshSessions)
      } catch (err) {
        if (controller.signal.aborted || err instanceof Cancelled) return
        setView({ kind: 'report', analysis, videoUrl: url })
      }
    },
    [refreshSessions],
  )

  const cancel = () => {
    abortRef.current?.abort()
    releaseVideo()
    setView({ kind: 'home' })
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
            onPick={(f) => void run(f)}
            onOpen={(s) => setView({ kind: 'saved', session: s })}
            onShowGuide={() => setSheet('guide')}
            onShowHistory={() => setSheet('history')}
            onShowProgress={() => setSheet('progress')}
            needsFilmingGuide={!prefs.seenFilmingGuide}
            onGuideThenPick={() => setSheet('guide-first')}
            onShowExample={() => void showExample()}
          />
        )}

        {view.kind === 'analyzing' && (
          <Analyzing progress={progress} fileName={view.fileName} onCancel={cancel} />
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
            onCompare={
              sessions.some((s) => s.id !== view.analysis.id) ? () => setSheet('compare') : undefined
            }
          />
        )}

        {view.kind === 'saved' && (
          <Report
            key={view.session.id}
            analysis={view.session}
            previous={priorTo(view.session.createdAt, typeOf(view.session))}
            onBack={goHome}
            onAnalyzeAnother={goHome}
            onCompare={
              sessions.some((s) => s.id !== view.session.id) ? () => setSheet('compare') : undefined
            }
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
        <LevelPicker value={prefs.tier} onChange={(tier) => setPrefs(writePrefs({ tier }))} />
      </Sheet>

      {/* The same guide, shown once before the very first clip, with the picker
          on the end of it so reading it is on the way to the task rather than a
          detour away from it. */}
      <Sheet
        open={sheet === 'guide-first'}
        onClose={() => {
          setPrefs(writePrefs({ seenFilmingGuide: true }))
          setSheet(null)
        }}
        title="First, how to film it"
      >
        <FilmingGuide />
        <HandednessPicker
          value={prefs.handedness}
          onChange={(handedness) => setPrefs(writePrefs({ handedness }))}
        />
        {/* Asked here rather than made compulsory: leaving it on "work it out
            for me" is a real answer, and the one most people should give. It is
            the hand that has to be right before the first clip. */}
        <LevelPicker value={prefs.tier} onChange={(tier) => setPrefs(writePrefs({ tier }))} />
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
          if (file) void run(file)
        }}
      />

      <Sheet open={sheet === 'history'} onClose={() => setSheet(null)} title="Your serves">
        {sessions.length === 0 ? (
          <p className="sheet-empty">No serves analysed yet.</p>
        ) : (
          <ul className="history">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  className="recent"
                  onClick={() => {
                    setSheet(null)
                    setView({ kind: 'saved', session: s })
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

      <Sheet open={sheet === 'compare'} onClose={() => setSheet(null)} title="Side by side">
        {comparing ? (
          <CompareView current={comparing} others={sessions} />
        ) : (
          <p className="sheet-empty">Nothing to compare this against yet.</p>
        )}
      </Sheet>

      <Sheet open={sheet === 'progress'} onClose={() => setSheet(null)} title="Your form">
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
                against different targets, so mixing them in would show the change of serve as a
                change in form.
              </p>
            )}

            {practice && <PracticeCard focus={practice} />}

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
                <h3 className="block-title">Best-to-worst gap</h3>
                <GapTrend points={spread.points} />
                {spread.recurring && (
                  <p className="sheet-note">
                    {spread.recurring.label} has been your least repeatable element in{' '}
                    {spread.recurring.sessions} of these. That is the one to groove.
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
