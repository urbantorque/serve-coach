import { useMemo, useRef, useState } from 'react'
import ConsistencyPanel from '../components/ConsistencyPanel'
import FundamentalCard from '../components/FundamentalCard'
import LevelPicker from '../components/LevelPicker'
import PosePlayer from '../components/PosePlayer'
import { DeltaChip } from '../components/Trend'
import { Cue, Icon } from '../components/primitives'
import { SOFT_READ, readQuality } from '../components/statusLabels'
import { MAX_CONSISTENCY_SERVES } from '../lib/analysis/analyze'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import { injuryNotes, refusalFor, suppressedNote, tierLabel } from '../lib/analysis/verdict'
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
  /**
   * Re-read the clip against a different rung of the tier ladder.
   *
   * A full re-run rather than a rescore: the tier decides every band the
   * diagnostic pass judges against, and those bands are applied while the flaws
   * are found, not after. `rescore` only moves the serve-type bands.
   */
  onPickTier?: (tier: number | undefined) => void
  /** What the engine estimated, when the player has stated nothing. */
  statedTier?: number
  /** Put this serve side by side with another saved one. */
  onCompare?: () => void
  /**
   * Measure every serve in the clip and compare them.
   *
   * The result of that comparison is not a prop. It rides on the report as
   * `analysis.consistency`, so it survives the back button and reaches the trend
   * — which is what it is for. Passing it in beside the report is what let the
   * two disagree about which clip they described.
   */
  onCheckConsistency?: () => void
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
  onPickServeType,
  onPickTier,
  statedTier,
  onCompare,
}: Props) {
  const playerRef = useRef<HTMLDivElement>(null)
  const [seek, setSeek] = useState<{ phase: PhaseId; n: number }>()
  const [pickingLevel, setPickingLevel] = useState(false)
  /*
   * Hiding the spreads, not deleting them.
   *
   * They cost a full pass over the video per serve and they are the input to the
   * consistency trend, so "dismiss" has to mean "off my screen" rather than
   * "throw it away" — which is what it meant while they lived in state above
   * this component, and the player had no way to know.
   */
  const [hidSpreads, setHidSpreads] = useState(false)
  const consistency = hidSpreads ? undefined : analysis.consistency
  /**
   * Whether the player has asked to see numbers off a clip that was refused.
   *
   * The escape hatch exists because the alternative is worse in both directions:
   * throwing the report away loses work the engine already did, and showing it
   * unmarked is the confident wrong answer the refusal exists to prevent. Behind
   * a deliberate tap, under a banner that stays up, it is neither.
   */
  const [overrode, setOverrode] = useState(false)
  const verdict = VERDICT[analysis.overallStatus]
  const live = isLive(analysis) && Boolean(videoUrl)
  /*
   * Which rubric the numbers on this page were computed under.
   *
   * `analyzeServe` and `rescore` both stamp a report where they score it, so a
   * live analysis normally arrives carrying its own. One that does not — a dev
   * fixture, an `Analysis` assembled by hand — was still produced by this build,
   * so it reads as current. An unstamped *saved* report is the opposite: it
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

  /*
   * The engine's own verdict on this clip, finally on screen.
   *
   * All three of these have been computed, stored and read back out again since
   * the diagnostic pass shipped, and none of them had a consumer. The refusal is
   * the one that mattered most: a clip the engine had already decided was not
   * evidence still rendered as a full report, scores and drill and all, and
   * looked identical to one off a clean side-on clip.
   */
  const refusal = refusalFor(analysis.triage)
  const injuries = injuryNotes(analysis.triage)
  const suppressed = suppressedNote(analysis.triage)
  const levelled = tierLabel(analysis.triage)

  /*
   * Injuries lead, above the score and above everything else on the page.
   *
   * Not above a refusal, though — and that is the engine's decision rather than
   * this component's. `triage` returns an empty `injury_risk` on any clip it
   * rejects, because the flags are built from the same measurements the
   * rejection has just declared confabulated, and a warning about somebody's
   * wrist assembled from numbers the app does not believe is worse than no
   * warning at all. So there is deliberately no injury block on the refusal
   * screen: it would be unreachable code standing for a promise the engine does
   * not make.
   */
  const injuryBlock = injuries.length > 0 && (
    <section className="injuries" aria-label="Injury risk">
      {injuries.map((n) => (
        <div key={n.flag} className={`injury injury--${n.severity}`}>
          {/* The label does the work a warning glyph used to. A red rule plus a
              word reads at arm's length; a triangle is one more small shape on
              a page that already has several. */}
          <span className="t-overline injury-label">Injury risk</span>
          <div className="injury-text">
            <strong>{n.title}</strong>
            <p>
              <Cue text={n.body} />
            </p>
          </div>
        </div>
      ))}
    </section>
  )

  const topbar = (
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
  )

  // Refused, and not yet overridden: the numbers exist and stay off the screen.
  if (refusal && !overrode) {
    return (
      <div className="screen report">
        {topbar}
        <section className="refusal">
          {/* No alarm glyph. The player has not broken anything — the app is
              declining to invent a score, which is a statement, not a fault. */}
          <span className="t-overline refusal-label">No score for this clip</span>
          <h1>{refusal.title}</h1>
          <ul className="refusal-hints">
            {refusal.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <p className="refusal-note">
            I measured this clip and I do not trust what came out. Numbers off footage this hard to
            read look exactly like real ones.
          </p>
        </section>
        <footer className="report-foot">
          <button className="btn btn--primary btn--full" onClick={onAnalyzeAnother}>
            <Icon name="camera" size={18} />
            Film it again
          </button>
          <button className="btn btn--ghost btn--full" onClick={() => setOverrode(true)}>
            Show me the numbers anyway
          </button>
        </footer>
      </div>
    )
  }

  return (
    <div className="screen report">
      {topbar}
      {injuryBlock}

      {/* Overridden, so the banner stays up for as long as the numbers do. A
          one-off dismissible warning would be gone by the time the player
          scrolled to the fundamentals, which is where the invented precision
          actually lives. */}
      {refusal && (
        <section className="unreliable">
          <strong>{refusal.title}.</strong> Everything below came off that clip, so read it as a
          rough sketch rather than a measurement.
        </section>
      )}

      <section className="hero">
        {/*
         * The score, flush left and as large as the type scale goes.
         *
         * The tier rides on the meter rather than on the digits: three of the
         * four ramp colours cannot hold their contrast as type on this
         * background, so a coloured score would have been hardest to read
         * exactly where it matters most.
         */}
        <span className="t-overline hero-label">Serve score</span>
        <span className="hero-score">
          <span className="t-display tnum">{analysis.overall}</span>
          <span className="hero-out-of">/100</span>
        </span>
        <span className="hero-meter" aria-hidden="true">
          <span
            className={`hero-meter-fill hero-meter-fill--${analysis.overallStatus}`}
            style={{ transform: `scaleX(${Math.max(0, Math.min(100, analysis.overall)) / 100})` }}
          />
        </span>
        <h1>{verdict.title}</h1>
        <p>{verdict.sub}</p>
        {/* The break is said out loud rather than left as an absence. Every
            comparison on this page goes at once when the rubric changes — this
            chip and the per-area ones on the cards below — and a player who saw
            them last time reads the silence as the app having broken. */}
        {previous &&
          (comparable ? (
            <span className="hero-note">
              <DeltaChip delta={analysis.overall - previous.overall} />
              <span>vs your last serve</span>
            </span>
          ) : (
            <span className="hero-note">
              The scoring changed between these two serves, so this one starts a fresh run.
            </span>
          ))}
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
              {/* The sweep is capped, so a longer basket cannot promise all of
                  them. Said on the button rather than discovered afterwards as a
                  count that does not match the clip. */}
              {analysis.serves.count > MAX_CONSISTENCY_SERVES
                ? `Compare your last ${MAX_CONSISTENCY_SERVES} serves`
                : `Compare all ${analysis.serves.count} serves`}
            </button>
          )}
        </section>
      )}

      {consistency && <ConsistencyPanel consistency={consistency} onDismiss={() => setHidSpreads(true)} />}

      {analysis.quality.warnings.length > 0 && (
        <section className="notes">
          {analysis.quality.warnings.map((w) => (
            <p key={w} className="note">
              {w}
            </p>
          ))}
        </section>
      )}

      <section className="focus">
        <span className="t-overline focus-kicker">Work on this next</span>
        <h2>{analysis.focus.title}</h2>
        <p>
          <Cue text={analysis.focus.why} />
        </p>

        {/* A count, never a list. Six faults printed out is the list nobody acts
            on that the hierarchy exists to prevent — but saying nothing at all
            means a second fault appearing on the next clip reads as the app
            changing its mind. */}
        {suppressed && (
          <p className="focus-suppressed">
            <Cue text={suppressed} />
          </p>
        )}

        <div className="focus-drill">
          <span className="t-overline focus-drill-kicker">The drill</span>
          <h3>{analysis.focus.drill.name}</h3>
          <p>{analysis.focus.drill.how}</p>
          <span className="focus-reps">{analysis.focus.drill.reps}</span>
        </div>

        {/* The targets above are one rung up from wherever the engine has put
            this player, and until now that was invisible — which made every band
            look like an absolute somebody had chosen. */}
        {levelled && (
          <div className="levelled">
            <span className="levelled-text">{levelled}</span>
            {onPickTier && (
              <button
                className="levelled-btn"
                onClick={() => setPickingLevel((v) => !v)}
                aria-expanded={pickingLevel}
              >
                {pickingLevel ? 'Close' : 'Change'}
                <Icon name="chevron" size={13} />
              </button>
            )}
          </div>
        )}
        {levelled && onPickTier && pickingLevel && (
          <LevelPicker
            value={statedTier}
            estimated={analysis.triage?.tier?.current}
            onChange={(tier) => {
              setPickingLevel(false)
              onPickTier(tier)
            }}
          />
        )}
      </section>

      {/*
       * How the clip was read: which hand, what angle, how clearly it came
       * through, and which kind of serve the targets came from.
       *
       * Under the fix rather than above it. Every one of these is an assumption
       * the player can correct — a kick serve marked against flat bands is
       * penalised for contacting the ball over the head, which is the whole
       * point of a kick — so it has to be visible and changeable. But none of
       * them is the thing to do next, and stacked between the score and the fix
       * they pushed the one instruction on the page off the first screen.
       */}
      <section className="reading" aria-label="How this clip was read">
        <h2 className="t-overline reading-title">How I read this clip</h2>
        <div className="reading-chips">
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

        <div className="judged">
          <span className="t-overline judged-lead">Judged as</span>
          <div className="judged-options">
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
          <p className="judged-note">{SERVE_TYPES[analysis.serveType].blurb}</p>
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
