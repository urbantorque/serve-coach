import { useEffect, useMemo, useRef, useState } from 'react'
import { DeltaChip, Sparkline } from '../components/Trend'
import { Icon } from '../components/primitives'
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
        <span className="brand">Serve Coach</span>
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

      {/* The cover. One headline set hard against the left margin, one line of
          what the thing does, then the only button that matters. Everything
          below this is for somebody who has already used it once. */}
      <section className="home-cover">
        <h1 className="home-headline">
          One serve.
          <br />
          One fix.
        </h1>
        <p className="home-say">
          Film one serve. The app measures it frame by frame and names the one thing to fix.
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
            className="btn btn--primary home-cta"
            onClick={() => (needsFilmingGuide ? onGuideThenPick() : pickRef.current?.click())}
          >
            <Icon name="film" size={20} />
            Analyse a serve
          </button>
          {coarsePointer() && (
            <button
              className="btn btn--ghost home-cta home-cta--alt"
              onClick={() => (needsFilmingGuide ? onGuideThenPick() : recordRef.current?.click())}
            >
              <Icon name="camera" size={18} />
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

      {/* The most persuasive sentence on the page, and it used to be the
          smallest. Stated plainly and given the weight it earns, rather than
          shrunk into a badge at the bottom. */}
      <section className="home-promise">
        <p>
          Your video stays on this device. Nothing is uploaded, and the app works with no signal
          at all.
        </p>
        <span className="home-promise-state">
          {offlineReady ? 'Ready to use offline' : 'Downloads once, then works offline'}
        </span>
      </section>

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
          </div>
          {/* Typeset, not badged: the numeral carries the weight and the small
              caps beside it say what it is measured against. */}
          {progress.formDelta !== undefined && (
            <span className="progress-delta">
              <DeltaChip delta={progress.formDelta} />
              <span className="progress-delta-label">vs your three before</span>
            </span>
          )}
          <Sparkline points={progress.points} />
          {/* The older serves are still on the sparkline above, greyed and
              labelled, so the clause explains a figure that shrank rather than
              claiming the history is gone. */}
          <span className="progress-foot tnum">
            {progress.rubricBreakAt
              ? `${eraCount} serves since the scoring changed · best ${progress.best}`
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
          <ul className="serve-log">
            {recent.map((s) => (
              <li key={s.id}>
                <button className="serve-log-row" onClick={() => onOpen(s)}>
                  <span className={`serve-log-score tnum serve-log-score--${s.overallStatus}`}>
                    {s.overall}
                  </span>
                  <span className="serve-log-text">
                    <strong>{s.focus.title}</strong>
                    <span className="serve-log-date">
                      {new Date(s.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {' · '}
                      {s.handedness === 'right' ? 'right' : 'left'}-handed
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Everything that is not the one button. Kept as one bordered list so it
          reads as a contents page rather than four things competing with the
          cover above it. */}
      <ul className="home-nav">
        <li>
          <button className="home-nav-row" onClick={onShowGuide}>
            <span className="home-nav-label">How to film it</span>
            <span className="home-nav-note">Thirty seconds of setup sharpens every number.</span>
            <Icon name="chevron" size={15} />
          </button>
        </li>
        {/* Somebody who has never used this has no serve video on their phone, so
            the only thing the app can currently show them is a file picker. An
            example report is the difference between understanding what this does
            and having to go and film something to find out. */}
        {sessions.length === 0 && (
          <li>
            <button className="home-nav-row" onClick={onShowExample}>
              <span className="home-nav-label">See an example report</span>
              <span className="home-nav-note">See what you get back. No video needed.</span>
              <Icon name="chevron" size={15} />
            </button>
          </li>
        )}
        {sessions.length > recent.length && (
          <li>
            <button className="home-nav-row" onClick={onShowHistory}>
              <span className="home-nav-label">All {sessions.length} serves</span>
              <span className="home-nav-note">Your whole history, and how to back it up.</span>
              <Icon name="chevron" size={15} />
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
