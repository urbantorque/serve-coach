import { useEffect, useMemo, useRef, useState } from 'react'
import { DeltaChip, Sparkline } from '../components/Trend'
import { Icon, ScoreRing } from '../components/primitives'
import { findPracticeFocus } from '../lib/practice'
import { buildProgress, currentRubricEra } from '../lib/progress'
import type { Session } from '../lib/storage/db'

interface Props {
  sessions: Session[]
  offlineReady: boolean
  onPick: (file: File) => void
  onOpen: (session: Session) => void
  onShowGuide: () => void
  onShowHistory: () => void
  onShowProgress: () => void
  /** True until the player has been walked through how to film one. */
  needsFilmingGuide: boolean
  /** Open the guide first, then the picker — the first time only. */
  onGuideThenPick: () => void
  /** Render a report from a simulated serve, so the app can be seen empty. */
  onShowExample: () => void
  /**
   * Fetch the pose engine now, so the app works at a court with no signal.
   *
   * Until this existed the 19 MB of model and runtime were only ever fetched
   * during an analysis, so the one thing a player could not do was get ready.
   * They installed the app at home, read the badge, drove to a court and found
   * the app could not start — at the exact moment the promise on this screen
   * was supposed to hold.
   */
  onMakeOffline: () => void
  /** How that download is going, while it is going. */
  warming?: OfflineWarmup
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
}

const coarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

export default function Home({
  sessions,
  offlineReady,
  onPick,
  onOpen,
  onShowGuide,
  onShowHistory,
  onShowProgress,
  needsFilmingGuide,
  onGuideThenPick,
  onShowExample,
  onMakeOffline,
  warming,
}: Props) {
  const pickRef = useRef<HTMLInputElement>(null)
  const recordRef = useRef<HTMLInputElement>(null)
  const recent = sessions.slice(0, 3)
  const progress = useMemo(() => buildProgress(sessions), [sessions])
  const practice = useMemo(() => findPracticeFocus(sessions), [sessions])
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
  const [dragging, setDragging] = useState(false)
  // A media query, not a render-time question. This was three `matchMedia` calls
  // on every render of the first screen, all of them asking the same thing about
  // a device that cannot change its pointer while the page is open.
  const coarse = useMemo(coarsePointer, [])

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
    if (needsFilmingGuide) onGuideThenPick()
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
      if (needsFilmingGuide) onGuideThenPick()
      else onPick(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [needsFilmingGuide, onGuideThenPick, onPick])

  return (
    <div className="screen home">
      <header className="home-top">
        <span className="brand">
          <span className="brand-dot" />
          Serve Coach
        </span>
        {/* Shown even with nothing saved. Restoring a backup onto a new phone is
            exactly the moment the history is empty, and hiding the only way in
            until there is something to see locks that player out of the one
            thing they came here to do. */}
        <button
          className="icon-btn"
          onClick={onShowHistory}
          aria-label={sessions.length > 0 ? 'Your serves' : 'Your serves and backups'}
        >
          <Icon name="clock" />
        </button>
      </header>

      <section className="home-hero">
        <h1>
          World-class eyes
          <br />
          on your serve.
        </h1>
        <p>
          Film one serve. Get the toss, the load, the swing and the contact measured frame by
          frame — with the fix for whatever is costing you the most.
        </p>
      </section>

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
            onClick={() => (needsFilmingGuide ? onGuideThenPick() : pickRef.current?.click())}
          >
            <Icon name="film" size={19} />
            Analyse a serve
          </button>
          {coarse && (
            <button
              className="btn btn--ghost btn--big"
              onClick={() => (needsFilmingGuide ? onGuideThenPick() : recordRef.current?.click())}
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

      <button className="strap" onClick={onShowGuide}>
        <Icon name="info" size={17} />
        <span>
          <strong>How to film it</strong>
          Thirty seconds of setup makes the numbers far sharper.
        </span>
        <Icon name="chevron" size={16} />
      </button>

      {/* Somebody who has never used this has no serve video on their phone, so
          the only thing the app can currently show them is a file picker. An
          example report is the difference between understanding what this does
          and having to go and film something to find out. */}
      {sessions.length === 0 && (
        <button className="strap strap--quiet" onClick={onShowExample}>
          <Icon name="target" size={17} />
          <span>
            <strong>See an example report</strong>
            What you get back, on a sample serve. No video needed.
          </span>
          <Icon name="chevron" size={16} />
        </button>
      )}

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
            <span className="progress-hero tnum">{progress.recentAverage}</span>
            <span className="progress-unit">
              average of your
              <br />
              {/* Counted over the era, because `recentAverage` is. Taken over all
                  of `points` it claimed three serves right after a
                  recalibration, when the average behind it was of the one serve
                  filmed since — and the line directly below already says so. */}
              last {Math.min(3, eraCount)} {Math.min(3, eraCount) === 1 ? 'serve' : 'serves'}
            </span>
            <DeltaChip delta={progress.formDelta} />
          </div>
          <Sparkline points={progress.points} />
          {/* The older serves are still on the sparkline above, greyed and
              labelled, so the clause explains a figure that shrank rather than
              claiming the history is gone. */}
          <span className="progress-foot tnum">
            {progress.rubricBreakAt
              ? `${eraCount} serves since we changed how we mark · best ${progress.best}`
              : `${eraCount} serves · best ${progress.best}`}
          </span>

          {/* The one actionable thing the app knows, on the first screen rather
              than two taps inside it. */}
          {practice && (
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
        {offlineReady ? (
          <span className="badge badge--on">
            <Icon name="check" size={15} />
            Ready to use offline
          </span>
        ) : (
          // A button rather than a label, because the label was describing
          // something the player had no way to make happen. Downloading is
          // opt-in and the size is on it: 19 MB is real money on a metered
          // connection, and the honest place to say so is before the tap.
          <button
            className="badge"
            onClick={onMakeOffline}
            disabled={warming !== undefined && warming.stage !== 'failed'}
          >
            <Icon name="offline" size={15} />
            {warming?.stage === 'downloading'
              ? `Downloading… ${Math.round((warming.ratio ?? 0) * 100)}%`
              : warming?.stage === 'starting'
                ? 'Setting up…'
                : warming?.stage === 'failed'
                  ? 'Download failed. Tap to try again'
                  : warming?.stage === 'unkept'
                    ? 'Downloaded, but this browser will not keep it'
                    : 'Download now to use offline · 19 MB'}
          </button>
        )}
        <p>
          Your video is read on this device and never uploaded. Analysis runs entirely in your
          browser, on a court with no signal just as well as at home.
        </p>
      </footer>
    </div>
  )
}
