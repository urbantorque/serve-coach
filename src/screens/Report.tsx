import { useEffect, useMemo, useRef, useState } from 'react'
import ConsistencyPanel from '../components/ConsistencyPanel'
import FundamentalCard from '../components/FundamentalCard'
import LevelPicker from '../components/LevelPicker'
import PosePlayer from '../components/PosePlayer'
import PowerPanel from '../components/PowerPanel'
import PracticeCard from '../components/PracticeCard'
import { DeltaChip } from '../components/Trend'
import { Cue, Icon, ScoreRing } from '../components/primitives'
import { SOFT_READ, readQuality } from '../components/statusLabels'
import { MAX_CONSISTENCY_SERVES } from '../lib/analysis/analyze'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import { consistencyHeadline, type ServePairFrames } from '../lib/analysis/consistency'
import { causalPlan, injuryNotes, refusalFor, suppressedNote, tierLabel } from '../lib/analysis/verdict'
import type { PracticeFocus } from '../lib/practice'
import type { ServeType } from '../lib/storage/prefs'
import {
  bestOverallScoreLine,
  deltasAgainst,
  scoringVersionOf,
  type BestGap,
  type BestHandSpeed,
  type BestScore,
} from '../lib/progress'
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
    // Not "the one thing" any more: the report hands over a short ordered plan
    // rather than a single instruction, and a line promising one item above a
    // list of three is the page disagreeing with itself. Phrased so it stays
    // true whether the plan came out at one entry or at four.
    sub: 'The motion works. Start with the first fix below and the rest gets easier.',
  },
  work: {
    title: 'Plenty of free speed here',
    // Not "two basics are missing" — nothing in this band guarantees two, and a
    // count the report cannot stand behind is the kind of small invented
    // certainty that makes a player stop believing the numbers.
    sub: 'Some basics are missing. Fix them and everything after gets easier.',
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
  /**
   * Measure every serve in the clip and compare them.
   *
   * The result of that comparison is not a prop. It rides on the report as
   * `analysis.consistency`, so it survives the back button and reaches the trend
   * — which is what it is for. Passing it in beside the report is what let the
   * two disagree about which clip they described.
   */
  onCheckConsistency?: () => void
  /**
   * The best and worst serve as pictures, while the clip they came from is open.
   *
   * A prop rather than something read off the analysis, because it deliberately
   * never joins the analysis — a saved report gets the words and not the images.
   */
  servePair?: ServePairFrames
  /**
   * The tightest best-vs-worst gap swept across every basket — see
   * `bestConsistencyGap`. Computed across sessions in `App.tsx`, the same
   * way `practice` below is, and handed to `ConsistencyPanel` unmodified,
   * which decides whether this specific report set it against `createdAt`.
   */
  bestGap?: BestGap
  /**
   * How this basket's own gap compared to the one right before it — a
   * different question from `bestGap` above, which is the all-time record.
   * The raw number from `gapDeltaFor` in `App.tsx`; `ConsistencyPanel` turns
   * it into a sentence itself, the same split `bestGap`/`bestGapLine` use.
   */
  basketGapDelta?: number
  /**
   * The single highest score any one serve of this type has earned — see
   * `bestOverallScore`. A different record from `bestGap` above: that is
   * about repeatability across a basket, this is about the one best serve
   * this report's own `analysis.overall` is compared against.
   */
  bestScore?: BestScore
  /**
   * The trip streak line, already worded by `streakLine` in `App.tsx` —
   * carried onto the share card `share()` below builds, unmodified.
   */
  streak?: string
  /** The fastest hand speed measured across every session — see `bestHandSpeed`. */
  bestSpeed?: BestHandSpeed
  /**
   * The report on screen could not be written to storage.
   *
   * Storage is best-effort — see `db.ts` — so a save failure never blocks this
   * screen from rendering. It must not be invisible either: a report that looks
   * saved and quietly is not is the confident-nonsense failure this app is built
   * to avoid, just aimed at the player's history instead of at their serve.
   */
  saveWarning?: string
  /**
   * The season-long thing worth practising, computed across sessions rather
   * than from this one — see `findPracticeFocus`. A different question from
   * "Work on this next" above, which is this serve's own causal read, and the
   * two can legitimately name different measurements.
   *
   * Used to be reachable only from the progress sheet: back to the home
   * screen, into "Your form", then down to the card — three taps and two
   * screens away from the exact moment a player has just read what to fix.
   * Rendered here too, unmodified, so logging it costs the one tap it should.
   */
  practice?: PracticeFocus
  /** Record that the drill on `practice` was done. Absent where nothing can store it. */
  onLogDrill?: () => void
  /** Take back the most recent one. */
  onUndoDrill?: () => void
  /**
   * The player's standing height, if they have ever stated one.
   *
   * The only thing that turns the two speeds on this page from body heights per
   * second into km/h — see `Prefs.heightCm` for why the app will not assume one.
   * A preference rather than something read off the report, because it is a fact
   * about the player and not about this clip.
   */
  heightCm?: number
  /** Remember a height. Absent where nothing can store one. */
  onSetHeight?: (cm: number | undefined) => void
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
  servePair,
  bestGap,
  basketGapDelta,
  bestScore,
  streak,
  bestSpeed,
  saveWarning,
  practice,
  onLogDrill,
  onUndoDrill,
  heightCm,
  onSetHeight,
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

  // The "Saved" confirmation clears itself after a couple of seconds, and the
  // report is very often gone before then — sharing is the last thing a player
  // does on this screen. Held so it can be cancelled, rather than left to fire
  // into a component that no longer exists.
  const sharedTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(sharedTimer.current), [])

  const share = async () => {
    setSharing('working')
    const outcome = await shareReportCard(analysis, streak)
    // Nothing happened when the player backed out of the share sheet, so the
    // button says nothing happened rather than claiming the card was saved.
    const done = outcome === 'shared' || outcome === 'downloaded'
    setSharing(done ? 'done' : 'idle')
    if (done) {
      clearTimeout(sharedTimer.current)
      sharedTimer.current = setTimeout(() => setSharing('idle'), 2500)
    }
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
  /*
   * The queue of things to work on, worst cause first.
   *
   * Falls back to `analysis.focus` — which is the ranked lowest measurement —
   * for a report filed before the diagnostic pass existed, or one whose faults
   * were all attributed to each other. That fallback is why the plan is read as
   * an array with a guaranteed first entry rather than as an optional.
   */
  const ranked = causalPlan(analysis.triage, analysis.diagnosis)
  const plan = ranked.length ? ranked : [analysis.focus]
  const suppressed = suppressedNote(analysis.triage, plan.length)
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
            <strong className="t-headline injury-title">{n.title}</strong>
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
      <span className="t-overline topbar-title">
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
          {/* Headline, not display. These titles run to eight words — "I could
              not work out where the camera was" — and at 40px in a phone column
              that is five lines of very large serif, which reads as a
              pronouncement rather than an explanation. Same scale as the injury
              title and the focus instruction, which keeps the ladder honest. */}
          <h1 className="t-headline">{refusal.title}</h1>
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

      {saveWarning && (
        <p className="storage-warn">
          <Icon name="warn" size={15} />
          <span>{saveWarning}</span>
        </p>
      )}

      {/* Overridden, so the banner stays up for as long as the numbers do. A
          one-off dismissible warning would be gone by the time the player
          scrolled to the fundamentals, which is where the invented precision
          actually lives. */}
      {refusal && (
        <section className="unreliable">
          {/* One flex item, not two. The banner is laid out as a row for the
              caution glyph that used to lead it, so a bare `<strong>` beside a
              bare text node became two columns and broke the sentence in half. */}
          <span>
            <strong>{refusal.title}.</strong> Everything below came off that clip, so read it as a
            rough sketch rather than a measurement.
          </span>
        </section>
      )}

      <section className="hero">
        {/*
         * The score, as the ring. One big gauge, centred, and the tier carried
         * by the arc's own colour — the number and the band said once, in one
         * shape, rather than a figure with a second coloured mark under it
         * restating the same fact in a different visual language.
         */}
        <ScoreRing
          score={analysis.overall}
          status={analysis.overallStatus}
          size={148}
          label="overall"
        />
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
        {/* A fact about the whole history, not this one serve — the same
            reason `bestGap`/`bestSpeed` below sit apart from the numbers they
            are records among. Ungameable the same way: the only way to move
            it is to actually serve a higher score. */}
        {bestScore && <p>{bestOverallScoreLine(bestScore, analysis.createdAt)}</p>}
        <h1>{verdict.title}</h1>
        <p>{verdict.sub}</p>
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

          {/*
            * The basket's verdict, up where the serve chips are, when there is
            * one.
            *
            * A clip of several serves is now measured all the way through
            * before this screen appears, so arriving at a report about one of
            * them with no word about the rest until two screens down would be
            * the app hiding work it has already done.
            *
            * One sentence, not the panel. The spread charts stay below the
            * focus card, where `740a9d8` deliberately put them: the fix is what
            * this report exists to deliver, and it used to arrive under a serve
            * picker and a stack of charts. A sentence costs the focus card
            * nothing and still says which thing moved.
            */}
          {consistency && <p className="serves-spread"><Cue text={consistencyHeadline(consistency)} /></p>}
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
        </section>
      )}

      <section className="focus">
        <span className="t-overline focus-kicker">Work on this next</span>
        <h2 className="t-headline">{plan[0].title}</h2>
        <p>
          <Cue text={plan[0].why} />
        </p>

        {/* A count, never a list. Whatever the plan did not print is held back
            on purpose — but saying nothing at all means a fault appearing on the
            next clip reads as the app changing its mind. */}
        {suppressed && (
          <p className="focus-suppressed">
            <Cue text={suppressed} />
          </p>
        )}

        <div className="focus-drill">
          <span className="t-overline focus-drill-kicker">The drill</span>
          <h3 className="t-subhead">{plan[0].drill.name}</h3>
          <p>{plan[0].drill.how}</p>
          <span className="focus-reps">{plan[0].drill.reps}</span>
        </div>

        {/*
         * The rest of the plan, in causal order rather than by score.
         *
         * Numbered, because the order is the whole point: these are not four
         * equal options to choose between, they are a queue. Deliberately
         * quieter than the first — same information, less of the page — so the
         * report still answers "what do I fix" before it answers "what else".
         */}
        {plan.length > 1 && (
          <ol className="focus-next">
            <li className="focus-next-kicker t-overline" aria-hidden>
              Then, in this order
            </li>
            {plan.slice(1).map((item, i) => (
              <li className="focus-next-item" key={item.drill.name}>
                <span className="focus-next-rank">{i + 2}</span>
                <div className="focus-next-body">
                  <h3 className="focus-next-title">{item.title}</h3>
                  <p className="focus-next-why">
                    <Cue text={item.why} />
                  </p>
                  <p className="focus-next-drill">
                    <Icon name="target" size={14} />
                    <span>
                      <strong>{item.drill.name}</strong> — {item.drill.reps}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

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
          <>
            <LevelPicker
              value={statedTier}
              estimated={analysis.triage?.tier?.current}
              onChange={(tier) => {
                setPickingLevel(false)
                onPickTier(tier)
              }}
            />
            {/* A reopened report has no frames, so `rediagnose` cannot re-judge
                it and returns undefined — deliberately, because the bands are
                applied while the flaws are found and there is nothing left to
                find them in. The level still saves and still applies to the next
                clip. Left unsaid, the control looked like it had failed. */}
            {!isLive(analysis) && (
              <p className="levelled-note">
                This report was saved without its footage, so its verdict stays as it is.
                The level applies from your next clip on.
              </p>
            )}
          </>
        )}
      </section>

      {/*
       * What the serve produced, under what to fix about it.
       *
       * Below the plan on purpose: a speed is the most interesting number on
       * this page and it is not an instruction, so it goes after the one thing
       * the report exists to deliver rather than above it. Above everything
       * else, though, because it is the only part of the report that looks at
       * the outcome rather than at the shape — and because the ball speed here
       * has been measured on every clip since `findOutbound` was written and
       * shown to nobody. `PowerPanel` renders nothing at all when neither
       * reading cleared its evidence gate, which is the common case.
       */}
      <PowerPanel analysis={analysis} heightCm={heightCm} onSetHeight={onSetHeight} bestSpeed={bestSpeed} />

      {/* The season-long focus, not this serve's own. See `Props.practice` —
          absent for anyone without two comparable sessions yet, exactly the
          condition the progress sheet's copy of this card already applies. */}
      {practice && (
        <PracticeCard
          focus={practice}
          onLogDrill={onLogDrill}
          onUndoDrill={practice.drilled ? onUndoDrill : undefined}
        />
      )}

      {/*
       * Comparing the serves in the clip, and the caveats on how it was read.
       *
       * Both sat above the focus card until now, which meant the one
       * instruction the report exists to deliver arrived two phone screens
       * down, under a serve picker, a scored panel of per-position spread
       * charts and a stack of quality notes. Consistency is worth showing and
       * it is not the answer to "what do I fix" — it is rung four of five.
       *
       * The button and the panel it opens stay together, so tapping Compare
       * still makes the thing appear directly underneath it. Only the picker
       * chips stay up by the score, because they change which serve every
       * number above is describing.
       */}
      {analysis.serves && analysis.serves.count > 1 && onCheckConsistency && !consistency && (
        <section className="serves-compare">
          <button className="btn btn--ghost btn--full serves-cta" onClick={onCheckConsistency}>
            <Icon name="target" size={16} />
            {/* The sweep is capped, so a longer basket cannot promise all of
                them. Said on the button rather than discovered afterwards as a
                count that does not match the clip. */}
            {analysis.serves.count > MAX_CONSISTENCY_SERVES
              ? `Score your last ${MAX_CONSISTENCY_SERVES} serves`
              : `Score all ${analysis.serves.count} serves in this clip`}
          </button>
        </section>
      )}

      {consistency && (
        <ConsistencyPanel
          consistency={consistency}
          onDismiss={() => setHidSpreads(true)}
          pair={servePair}
          createdAt={analysis.createdAt}
          bestGap={bestGap}
          gapDelta={basketGapDelta}
        />
      )}

      {analysis.quality.warnings.length > 0 && (
        <section className="notes">
          {analysis.quality.warnings.map((w) => (
            <p key={w} className="note">
              {w}
            </p>
          ))}
        </section>
      )}

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
          {/* A fact rather than a dead button once the frames are gone.
              Reopening a serve from history is the main way saved work is read,
              and it arrives with no handlers at all — so this whole row used to
              be controls that looked tappable, did nothing, and offered no
              reason. Worst on exactly the clip that needs it: when the hand is
              uncertain the report prints "check the badge below and switch it
              if wrong" directly above a badge that had been disabled. The
              disabled button already rendered identically to a plain chip, so
              nothing on screen changes; what goes is a control the keyboard and
              the screen reader had to walk past. */}
          {onFlipHandedness ? (
            <button
              className="chip chip--button"
              onClick={onFlipHandedness}
              title="Tap if I read the wrong hand"
            >
              {analysis.handedness === 'right' ? 'Right-handed' : 'Left-handed'}
              <Icon name="chevron" size={13} />
            </button>
          ) : (
            <span className="chip">
              {analysis.handedness === 'right' ? 'Right-handed' : 'Left-handed'}
            </span>
          )}
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
          {/* Same rule as the hand above: three dead chips on a reopened report
              become the one name that is still true. The row is kept rather
              than dropped because `judged-note` underneath explains what that
              serve type means for the targets, and without the label it
              explains nothing. */}
          <div className="judged-options">
            {onPickServeType ? (
              (Object.keys(SERVE_TYPES) as ServeType[]).map((t) => (
                <button
                  key={t}
                  className={`serve-chip${analysis.serveType === t ? ' is-on' : ''}`}
                  aria-pressed={analysis.serveType === t}
                  disabled={analysis.serveType === t}
                  onClick={() => onPickServeType(t)}
                >
                  {SERVE_TYPES[t].label}
                </button>
              ))
            ) : (
              <span className="chip">{SERVE_TYPES[analysis.serveType].label}</span>
            )}
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
        <h2 className="block-title">Six moments in your serve</h2>
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
        <h2 className="block-title">Every area we scored</h2>
        <div className="fcards">
          {/* Nothing opens by itself. `defaultOpen={i === 0}` opened whatever
              sat first in the array, and that order is hard-coded in
              `measure()` — toss, loading, swing, contact, rhythm — so it was
              always the toss, and the toss card is the largest of the five. A
              player whose problem is the racket drop read a ranked plan saying
              so and then found a different area expanded underneath it,
              offering up to five more instructions about something else. The
              plan above decides what to do first; this list is for looking
              things up. */}
          {analysis.fundamentals.map((f) => (
            <FundamentalCard
              key={f.id}
              fundamental={f}
              delta={deltas[f.id]}
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
