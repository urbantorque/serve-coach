import { useMemo, useRef, useState } from 'react'
import { DeltaChip, Sparkline } from '../components/Trend'
import { Icon, ScoreRing } from '../components/primitives'
import { findPracticeFocus } from '../lib/practice'
import { buildProgress } from '../lib/progress'
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
}: Props) {
  const pickRef = useRef<HTMLInputElement>(null)
  const recordRef = useRef<HTMLInputElement>(null)
  const recent = sessions.slice(0, 3)
  const progress = useMemo(() => buildProgress(sessions), [sessions])
  const practice = useMemo(() => findPracticeFocus(sessions), [sessions])
  const [dragging, setDragging] = useState(false)

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
          {coarsePointer() && (
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
            equivalent — so the hint only appears where it is actually true. */}
        {!coarsePointer() && (
          <p className="dropzone-hint">
            <Icon name="upload" size={14} />
            or drop a video file anywhere here
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
              last {Math.min(3, progress.points.length)} serves
            </span>
            <DeltaChip delta={progress.formDelta} />
          </div>
          <Sparkline points={progress.points} />
          <span className="progress-foot tnum">
            {progress.points.length} serves · best {progress.best}
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
        <span className={`badge${offlineReady ? ' badge--on' : ''}`}>
          <Icon name={offlineReady ? 'check' : 'offline'} size={15} />
          {offlineReady ? 'Ready to use offline' : 'Downloads once, then works offline'}
        </span>
        <p>
          Your video is read on this device and never uploaded. Analysis runs entirely in your
          browser, on a court with no signal just as well as at home.
        </p>
      </footer>
    </div>
  )
}
