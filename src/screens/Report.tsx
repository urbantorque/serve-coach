import { useMemo, useRef, useState } from 'react'
import ConsistencyPanel from '../components/ConsistencyPanel'
import FundamentalCard from '../components/FundamentalCard'
import PosePlayer from '../components/PosePlayer'
import { DeltaChip } from '../components/Trend'
import { Cue, Icon, ScoreRing } from '../components/primitives'
import { SOFT_READ, readQuality } from '../components/statusLabels'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import type { Consistency } from '../lib/analysis/consistency'
import type { ServeType } from '../lib/storage/prefs'
import { deltasAgainst, scoringVersionOf } from '../lib/progress'
import { shareReportCard } from '../lib/share/reportCard'
import { SCORING_VERSION, type Analysis, type PhaseId, type Status } from '../lib/analysis/types'
import type { Session } from '../lib/storage/db'

const VERDICT: Record<Status, { title: string; sub: string }> = {
  great: {
    title: 'A seriously good serve',
    sub: 'Every fundamental holds. Keep filming and prove it stays there.',
  },
  good: {
    title: 'A solid, repeatable serve',
    sub: 'The shape is right. One or two details keep you off your best.',
  },
  fair: {
    title: 'Good bones, a few gaps',
    sub: 'The motion works. Real speed and consistency are still on the table.',
  },
  work: {
    title: 'Plenty of free speed here',
    sub: 'Two basics are missing. Fix them and everything after gets easier.',
  },
}

interface Props {
  analysis: Analysis | Session
  videoUrl?: string
  /** The report filed before this one, if any — what the deltas compare against. */
  previous?: Session
  onBack: () => void
  onAnalyzeAnother: () => void
  onFlipHandedness?: () => void
  /** Re-run against a different serve in the same clip. */
  onPickServe?: (index: number) => void
  /** Re-score against a different serve type's target bands. */
  onPickServeType?: (type: ServeType) => void
  /** Put this serve side by side with another saved one. */
  onCompare?: () => void
  /** Measure every serve in the clip and compare them. */
  onCheckConsistency?: () => void
  /** Result of that comparison, once it has run. */
  consistency?: Consistency
  onDismissConsistency?: () => void
}

/** A saved session has no `frames`, so the player is only offered live. */
const isLive = (a: Analysis | Session): a is Analysis =>
  Array.isArray((a as Analysis).frames) && (a as Analysis).frames.length > 0

export default function Report({
  analysis,
  videoUrl,
  previous,
  onBack,
  onAnalyzeAnother,
  onFlipHandedness,
  onPickServe,
  onCheckConsistency,
  consistency,
  onDismissConsistency,
  onPickServeType,
  onCompare,
}: Props) {
  const playerRef = useRef<HTMLDivElement>(null)
  const [seek, setSeek] = useState<{ phase: PhaseId; n: number }>()
  const verdict = VERDICT[analysis.overallStatus]
  const live = isLive(analysis) && Boolean(videoUrl)
  /*
   * Which rubric the numbers on this page were computed under.
   *
   * A report still on screen from the run that produced it carries no stamp yet
   * — the stamp is written as it reaches storage — so an unstamped live analysis
   * was scored by this build. An unstamped *saved* report is the opposite: it
   * predates stamping and is old-rubric by definition, which is what
   * `scoringVersionOf` says. Reading both the same way would either blank the
   * deltas on every fresh report or compare one straight across a recalibration.
   */
  const rubric = isLive(analysis)
    ? (analysis.scoringVersion ?? SCORING_VERSION)
    : scoringVersionOf(analysis)

  // A recalibration moves a saved score with nothing about the serve having
  // changed, so a delta across one measures the rubric. Refilming the identical
  // serve after the last change showed roughly twenty points of "gain" on knee
  // bend, racket drop and toss arm — a fabricated diagnosis, per area.
  const comparable = previous !== undefined && scoringVersionOf(previous) === rubric

  const deltas = useMemo(
    () => deltasAgainst(analysis.fundamentals, previous, rubric),
    [analysis.fundamentals, previous, rubric],
  )
  const [sharing, setSharing] = useState<'idle' | 'working' | 'done'>('idle')

  const share = async () => {
    setSharing('working')
    const outcome = await shareReportCard(analysis)
    setSharing(outcome === 'failed' ? 'idle' : 'done')
    if (outcome !== 'failed') setTimeout(() => setSharing('idle'), 2500)
  }

  const goToPhase = (phase: PhaseId) => {
    setSeek((prev) => ({ phase, n: (prev?.n ?? 0) + 1 }))
    // `behavior: 'smooth'` overrides the CSS `scroll-behavior: auto !important`
    // that the reduced-motion block in tokens.css sets — a JS-requested behaviour
    // wins over the stylesheet. So this is the one animation on the page the
    // reset cannot reach, and it has to ask for itself.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    playerRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  }

  return (
    <div className="screen report">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <span className="topbar-title">
          {new Date(analysis.createdAt).toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
        </span>
        <button className="icon-btn" onClick={onAnalyzeAnother} aria-label="Analyse another serve">
          <Icon name="camera" />
        </button>
      </header>

      <section className="hero">
        <ScoreRing score={analysis.overall} status={analysis.overallStatus} size={148} label="overall" />
        {/* The break is said out loud rather than left as an absence. Every
            comparison on this page goes at once when the rubric changes — this
            chip and the per-area ones on the cards below — and a player who saw
            them last time reads the silence as the app having broken. */}
        {previous &&
          (comparable ? (
            <span className="hero-delta">
              <DeltaChip delta={analysis.overall - previous.overall} />
              <span>vs your last serve</span>
            </span>
          ) : (
            <span className="hero-delta">
              The scoring changed between these two serves, so this one starts a fresh run.
            </span>
          ))}
        <h1>{verdict.title}</h1>
        <p>{verdict.sub}</p>
        <div className="hero-chips">
          <button
            className="chip chip--button"
            onClick={onFlipHandedness}
            disabled={!onFlipHandedness}
            title={onFlipHandedness ? 'Tap if I read the wrong hand' : undefined}
          >
            {analysis.handedness === 'right' ? 'Right-handed' : 'Left-handed'}
            {onFlipHandedness && <Icon name="chevron" size={13} />}
          </button>
          <span className="chip">
            {analysis.quality.view === 'side'
              ? 'Side view'
              : analysis.quality.view === 'front-back'
                ? 'Front / back view'
                : 'Angled view'}
          </span>
          <span className={`chip${analysis.quality.confidence < SOFT_READ ? ' chip--warn' : ''}`}>
            {readQuality(analysis.quality.confidence)}
          </span>
        </div>

        {/* Which serve this was judged as. A kick serve measured against flat
            bands is marked down for contacting the ball over the head, which is
            the whole point of a kick — so the assumption has to be visible and
            changeable, not buried. */}
        <div className="serve-type">
          <span className="serve-type-lead">Judged as</span>
          <div className="serve-type-options">
            {(Object.keys(SERVE_TYPES) as ServeType[]).map((t) => (
              <button
                key={t}
                className={`serve-chip${analysis.serveType === t ? ' is-on' : ''}`}
                aria-pressed={analysis.serveType === t}
                disabled={!onPickServeType || analysis.serveType === t}
                onClick={() => onPickServeType?.(t)}
              >
                {SERVE_TYPES[t].label}
              </button>
            ))}
          </div>
          <p className="serve-type-note">{SERVE_TYPES[analysis.serveType].blurb}</p>
        </div>
      </section>

      {analysis.serves && analysis.serves.count > 1 && (
        <section className="serves">
          <p className="serves-lead">
            <Icon name="film" size={15} />
            <span>
              {analysis.serves.count} serves in this clip — showing number{' '}
              <strong>{analysis.serves.index + 1}</strong>.
            </span>
          </p>
          {onPickServe && (
            <div className="serves-pick">
              {Array.from({ length: analysis.serves.count }, (_, i) => (
                <button
                  key={i}
                  className={`serve-chip${i === analysis.serves.index ? ' is-on' : ''}`}
                  onClick={() => i !== analysis.serves.index && onPickServe(i)}
                  aria-current={i === analysis.serves.index}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          {onCheckConsistency && !consistency && (
            <button className="btn btn--ghost btn--full serves-cta" onClick={onCheckConsistency}>
              <Icon name="target" size={16} />
              Compare all {analysis.serves.count} serves
            </button>
          )}
        </section>
      )}

      {consistency && onDismissConsistency && (
        <ConsistencyPanel consistency={consistency} onDismiss={onDismissConsistency} />
      )}

      {analysis.quality.warnings.length > 0 && (
        <section className="notes">
          {analysis.quality.warnings.map((w) => (
            <p key={w} className="note">
              <Icon name="warn" size={16} />
              <span>{w}</span>
            </p>
          ))}
        </section>
      )}

      <section className="focus">
        <span className="focus-kicker">
          <Icon name="target" size={15} />
          Work on this next
        </span>
        <h2>{analysis.focus.title}</h2>
        <p>
          <Cue text={analysis.focus.why} />
        </p>
        <div className="focus-drill">
          <span className="drill-kicker">The drill</span>
          <h3>{analysis.focus.drill.name}</h3>
          <p>{analysis.focus.drill.how}</p>
          <span className="drill-reps">{analysis.focus.drill.reps}</span>
        </div>
      </section>

      {live && (
        <section className="block" ref={playerRef}>
          <h2 className="block-title">Your serve, frame by frame</h2>
          <PosePlayer videoUrl={videoUrl!} analysis={analysis as Analysis} seek={seek} />
        </section>
      )}

      <section className="block">
        <div className="block-head">
          <h2 className="block-title">The six key positions</h2>
          {onCompare && (
            <button className="block-aside block-aside--btn" onClick={onCompare}>
              Compare
              <Icon name="chevron" size={13} />
            </button>
          )}
        </div>
        <div className="strip">
          {analysis.phases.map((p) =>
            // A clickable <figure> is invisible to a keyboard. When these seek
            // the video they have to be real buttons; when there is no video to
            // seek they stay plain figures rather than advertising an action
            // that does nothing.
            live ? (
              <button
                key={p.id}
                type="button"
                className="strip-item strip-item--live"
                onClick={() => goToPhase(p.id)}
              >
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt="" loading="lazy" />
                ) : (
                  <div className="strip-placeholder" />
                )}
                <span className="strip-caption">
                  <strong>{p.label}</strong>
                  <span>{p.caption}</span>
                </span>
              </button>
            ) : (
              <figure key={p.id} className="strip-item">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={p.label} loading="lazy" />
                ) : (
                  <div className="strip-placeholder" />
                )}
                <figcaption className="strip-caption">
                  <strong>{p.label}</strong>
                  <span>{p.caption}</span>
                </figcaption>
              </figure>
            ),
          )}
        </div>
      </section>

      {/* Dev-only: turn this analysis into a ground-truth test fixture. The
          import is dynamic so none of it reaches the production bundle. */}
      {import.meta.env.DEV && isLive(analysis) && (
        <button
          className="btn btn--ghost btn--full"
          onClick={() =>
            void import('../dev/exportFixture').then((m) => m.downloadFixture(analysis as Analysis))
          }
        >
          Save as test fixture
        </button>
      )}

      <section className="block">
        <h2 className="block-title">The fundamentals</h2>
        <div className="fcards">
          {analysis.fundamentals.map((f, i) => (
            <FundamentalCard
              key={f.id}
              fundamental={f}
              delta={deltas[f.id]}
              defaultOpen={i === 0}
              onSeek={live ? goToPhase : undefined}
            />
          ))}
        </div>
      </section>

      <footer className="report-foot">
        <button className="btn btn--primary btn--full" onClick={onAnalyzeAnother}>
          <Icon name="camera" size={18} />
          Analyse another serve
        </button>
        <button
          className="btn btn--ghost btn--full"
          onClick={() => void share()}
          disabled={sharing === 'working'}
        >
          <Icon name={sharing === 'done' ? 'check' : 'share'} size={17} />
          {sharing === 'working'
            ? 'Preparing…'
            : sharing === 'done'
              ? 'Saved'
              : 'Save or share this report'}
        </button>
        <p className="fineprint">
          {isLive(analysis)
            ? `Measured on this device from ${analysis.frames.length} tracked frames. Nothing was uploaded.`
            : 'Measured on this device. Nothing was uploaded, and the video itself was never saved.'}
        </p>
      </footer>
    </div>
  )
}
