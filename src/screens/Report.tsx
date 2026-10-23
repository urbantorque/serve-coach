import { useEffect, useMemo, useRef, useState } from 'react'
import ConsistencyPanel from '../components/ConsistencyPanel'
import TossMap from '../components/TossMap'
import FiringTimeline from '../components/FiringTimeline'
import KeptVideo from '../components/KeptVideo'
import type { TossMap as TossMapData } from '../lib/tossMap'
import FundamentalCard from '../components/FundamentalCard'
import LevelPicker from '../components/LevelPicker'
import PosePlayer from '../components/PosePlayer'
import PracticeCard from '../components/PracticeCard'
import { DeltaChip } from '../components/Trend'
import { Cue, Icon, ScoreRing } from '../components/primitives'
import SpeedRow from '../components/SpeedRow'
import { SPEED_MISS_LINE } from '../lib/speedCopy'
import { SOFT_READ, readQuality } from '../components/statusLabels'
import PoseStill from '../components/PoseStill'
import FaultDemoPanel from '../components/FaultDemoPanel'
import ModelServe from '../components/ModelServe'
import MomentPair from '../components/MomentPair'
import Term from '../components/Term'
import { LOOK_FOR, faultMoment, momentChecks, momentMark } from '../lib/lookFor'
import { hasDemo } from '../lib/faultDemoDials'
import { CHECK_SERVES, drillCheckLine, progressionFor, rungFor, stepCheckLine } from '../lib/analysis/progressions'
import { FAULT_NAME } from '../lib/graduation'
import TrackPlayer from '../components/TrackPlayer'
import { filmstripPoses, replayFrom } from '../lib/storage/poseTrack'
import { pairTracks } from '../lib/trackPair'
import { focusAgainstBest } from '../lib/bestServe'
import { OUTCOME_LABEL, SERVE_NUMBER_LABEL } from '../lib/serveTagCopy'
import { SERVE_OUTCOMES, type ServeOutcome } from '../lib/storage/db'
import { FIXTURE_PLAN } from '../lib/fixturePlan'
import { useShareState } from '../components/useShareState'
import { MAX_CONSISTENCY_SERVES } from '../lib/analysis/analyze'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import { unseenLines } from '../lib/analysis/angleReach'
import { consistencyHeadline, type ServePairFrames } from '../lib/analysis/consistency'
import { readAlike } from '../lib/analysis/realChange'
import { scoreBreakdown } from '../lib/analysis/breakdown'
import { causalPlan, injuryNotes, refusalFor, suppressedNote, tierLabel } from '../lib/analysis/verdict'
import type { InjuryFlag } from '../lib/analysis/triage'
import type { PracticeFocus } from '../lib/practice'
import type { ServeType } from '../lib/storage/prefs'
import {
  bestTripLine,
  deltasAgainst,
  scoreMoveCaption,
  scoringVersionOf,
  type BestGap,
  type BestTrip,
} from '../lib/progress'
import { shareReportCard } from '../lib/share/reportCard'
import { SCORING_VERSION, type Analysis, type PhaseId, type Status } from '../lib/analysis/types'
import type { Session } from '../lib/storage/db'

/*
 * The band in words, as a caption to the score ring. It used to be the page's
 * headline with a sub-line under it; the fix is the headline now, so the band
 * is said once, and short.
 */
const VERDICT: Record<Status, string> = {
  great: 'A seriously good serve',
  good: 'A solid, repeatable serve',
  fair: 'Good bones, a few gaps',
  work: 'Plenty of free speed here',
}

interface Props {
  analysis: Analysis | Session
  videoUrl?: string
  /** The report filed before this one, if any — what the deltas compare against. */
  previous?: Session
  /**
   * The player's best earlier serve of this type, under this rubric — see
   * `bestPriorTo`. The ghost's first choice, and what the focus is set against.
   */
  best?: Session
  /**
   * What the player said about this serve, and the taps that change it (D5.1)
   * — the same store and the same rule as the glance: a tap on one fact never
   * clears the other, and tapping the chosen one again takes it back.
   */
  serveNumber?: 1 | 2
  outcome?: ServeOutcome
  onTagServe?: (n: 1 | 2 | undefined) => void
  onTagOutcome?: (o: ServeOutcome | undefined) => void
  /**
   * Show this clip as the glance (D6.1): the one-screen read the app lands on
   * after a serve recorded in it, reachable from any clip's report.
   */
  onGlance?: () => void
  /** Every toss in this basket, when two or more were read — see `tossMapFor`. */
  tossMap?: TossMapData
  /**
   * The clip this report came from, kept on this device (D6.4), and the best
   * serve's when it was kept too — object URLs, on a reopened report only.
   */
  kept?: { url: string; bestUrl?: string }
  /** Whether the player keeps videos, so the "never saved" lines follow it (L6.7). */
  keepsClips?: boolean
  /** The keep for this clip failed, said on the live report (L6.7). */
  keepFailed?: boolean
  onBack: () => void
  onAnalyzeAnother: () => void
  /**
   * The refusal's "Film it again": straight to the framing check, which is
   * the fix a refusal is asking for (N0.4). Falls back to `onAnalyzeAnother`
   * where the caller has no viewfinder to open, as the example report does not.
   */
  onFilmAgain?: () => void
  /** Read this clip again with the refinement model, after a first read (M1.3). */
  onReadFully?: () => void
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
   * The best trip of this serve type so far, by its median — see
   * `bestTrip` (L3.2). A different record from `bestGap` above: that is
   * about repeatability across a basket, this is about the best visit.
   */
  bestScore?: BestTrip
  /**
   * The trip streak line, already worded by `streakLine` in `App.tsx` —
   * carried onto the share card `share()` below builds, unmodified.
   */
  streak?: string
  /**
   * Per injury flag, what it did on the trips before this serve — see
   * `strainBehindOf`. A warning read once is a warning dismissed, and this card
   * is the one moment a player is actually reading about that joint.
   *
   * Sentences rather than counts, and computed for this report's own date rather
   * than for today, so a reopened report cannot start claiming a history it did
   * not have when it was filed.
   */
  strainBehind?: Partial<Record<InjuryFlag, string>>
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
  /** Which rung of each fault's ladder the player is on — see `progressions.ts`. */
  ladder?: Partial<Record<string, number>>
  /** Move the player to another rung of a fault's ladder. */
  onLadderStep?: (flaw: string, step: number) => void
  /**
   * Whether this session may turn a report into a ground-truth fixture.
   *
   * Decided in `App.tsx` from the query string, and passed rather than read here,
   * so `location.search` has exactly one reader. Two places asking the same
   * question of the URL is how a screen and its router come to disagree about
   * which mode the app is in.
   */
  fixtureExport?: boolean
  /**
   * This is the example report, built from the simulated serve, not the
   * player's own.
   *
   * It used to render exactly like a saved serve: dated today, "measured on
   * this device", with a share button that would put a simulated serve on a
   * card under the player's name. The flag relabels the page and removes the
   * one action that would pass it off as real.
   */
  example?: boolean
}

/** A saved session has no `frames`, so the player is only offered live. */
const isLive = (a: Analysis | Session): a is Analysis =>
  Array.isArray((a as Analysis).frames) && (a as Analysis).frames.length > 0

export default function Report({
  analysis,
  videoUrl,
  previous,
  best,
  serveNumber,
  outcome,
  onTagServe,
  onTagOutcome,
  onGlance,
  tossMap,
  kept,
  keepsClips,
  keepFailed,
  onBack,
  onAnalyzeAnother,
  onFilmAgain,
  onReadFully,
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
  strainBehind,
  saveWarning,
  practice,
  onLogDrill,
  onUndoDrill,
  ladder: rungs,
  onLadderStep,
  fixtureExport,
  example,
}: Props) {
  const playerRef = useRef<HTMLDivElement>(null)
  const [seek, setSeek] = useState<{ phase: PhaseId; n: number }>()
  /**
   * The last fixture saved from this report, and what it is still missing.
   *
   * Typed structurally rather than imported from `dev/exportFixture`, so the
   * screen does not pull that module into the entry chunk to name its return
   * value — the dynamic import is the whole reason the fixture machinery is not
   * weight every player pays for.
   */
  const [saved, setSaved] = useState<{ file: string; gaps: string[] }>()
  const [pickingLevel, setPickingLevel] = useState(false)
  /** Whether the top fix is being shown moving — see `FaultDemoPanel`. */
  const [showingFault, setShowingFault] = useState(false)
  /** Whether the top fix's whole ladder is open — see `progressions.ts`. */
  const [showingSteps, setShowingSteps] = useState(false)
  /** The rung the player just moved to from this report, so the button is spent. */
  const [movedTo, setMovedTo] = useState<number>()
  // A move up off a step the player checks themselves (L4.2), kept apart from
  // `movedTo` so the drilled fault's line never reads this ladder's move.
  const [selfMoved, setSelfMoved] = useState<number>()
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
  // "More about this clip" (L4.1): closed, until a basket the player asked for
  // arrives — a sweep finished while this report was on screen.
  const [moreOpen, setMoreOpen] = useState(false)
  const hadBasket = useRef(Boolean(consistency))
  useEffect(() => {
    if (consistency && !hadBasket.current) setMoreOpen(true)
    hadBasket.current = Boolean(consistency)
  }, [consistency])
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
  // Whether this serve and the last were graded on the same rows, which sets
  // the floor the hero's chip is held to (L3.1).
  const heroAlike = previous ? readAlike(analysis.fundamentals, previous.fundamentals) : true
  // Each area's share of the overall and what pulled it down (L3.10).
  const breakdowns = useMemo(
    () => new Map(scoreBreakdown(analysis.fundamentals).map((b) => [b.id, b])),
    [analysis.fundamentals],
  )
  // The filmstrip's bodies, from whichever form this report is carrying — a
  // stored swing, or the six keyframes a quota-pruned one was left with. Memoed
  // because lifting six rows out of a track on every render would repeat the
  // whole map per keystroke on any state this screen holds.
  const stripPoses = useMemo(() => filmstripPoses(analysis), [analysis])
  // Whether this report can move at all, decided here rather than inside the
  // player: the section, its heading and the note under it are only worth
  // rendering if there is a swing to play, and two independent answers to that
  // question is one more than the page can be sure agree.
  const replay = useMemo(() => replayFrom(analysis.track), [analysis.track])
  /*
   * The last serve, drawn under this one — when the two may honestly be drawn
   * together at all.
   *
   * `previous` is already here, for the deltas, and it is the only second serve
   * this screen ever holds. Worth saying plainly, because R49 assumed otherwise:
   * the round's own sequencing note says to build the same-session case first,
   * since two serves from one basket share a camera by construction and satisfy
   * the 5° gate for free. That case cannot reach this player. `TrackPlayer`
   * renders only when there is no video (`!live`), and a basket always has one —
   * so the ghost's home is here, across sessions, which is precisely the case
   * the yaw gate was written for and the case R49b is an open question about.
   *
   * Refusals are silent and there are seven of them, all inside `pairTracks`.
   * Nothing on this screen explains them: an extra picture that does not appear
   * is not a failure a player needs an account of.
   */
  //
  // The best earlier serve first (D4.5): what good looks like for this player
  // is a more useful thing to draw under them than whatever they did last. The
  // last serve when the best cannot be paired — usually a camera that moved.
  const ghost = useMemo(() => {
    for (const [who, other] of [
      ['best', best],
      ['last', previous],
    ] as const) {
      if (!other) continue
      const paired = pairTracks(analysis, other)
      if (paired.ok) return { pair: paired.pair, who }
    }
    return undefined
  }, [analysis, best, previous])
  // "Nothing happened" when the player backs out of the share sheet is
  // handled inside `useShareState` itself (cancelled/failed both read as
  // idle, only shared/downloaded count as done) — the button says nothing
  // happened rather than claiming the card was saved.
  const { sharing, trigger: share } = useShareState(() =>
    shareReportCard(analysis, streak, bestScore && bestTripLine(bestScore, analysis.createdAt)),
  )
  // The coach's report (M3.2): one self-contained page, built only when asked.
  const { sharing: sendingCoach, trigger: sendCoach } = useShareState(() =>
    import('../lib/share/coachShare').then(({ sendCoachReport }) => sendCoachReport(analysis)),
  )

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
  // The top fix's ladder, and where its drill sits on it. By name rather than
  // by identity: a reopened report's drill has been through storage.
  const ladder = plan[0].flaw ? progressionFor(plan[0].flaw, plan[0].axis) : undefined
  // The rung the report's own drill sits on, unless the player has moved.
  const ownRung = ladder ? ladder.steps.findIndex((s) => s.name === plan[0].drill.name) : -1
  const storedRung = plan[0].flaw ? rungs?.[plan[0].flaw] : undefined
  const rung =
    ladder &&
    storedRung !== undefined &&
    Number.isInteger(storedRung) &&
    storedRung >= 0 &&
    storedRung < ladder.steps.length
      ? storedRung
      : ownRung
  const drill = ladder && rung >= 0 ? ladder.steps[rung] : plan[0].drill
  // How a later plan item's step is passed, off its own ladder (L4.2).
  const nextCheck = (item: Analysis['focus']) => {
    const own = item.flaw ? progressionFor(item.flaw, item.axis) : undefined
    const step = own?.steps.find((s) => s.name === item.drill.name)
    return own && step ? stepCheckLine(own, step) : undefined
  }
  // The basket swept from this report, judged against this fault's bar.
  const check = analysis.drillCheck?.flaw === plan[0].flaw ? analysis.drillCheck : undefined
  /*
   * The basket judged against the fault the player was drilling, when that is
   * no longer this report's top fix (L3.4) — usually because it has cleared.
   * Said under its own name, with its own move up the ladder.
   */
  const drilledCheck = analysis.drillCheck && !check ? analysis.drillCheck : undefined
  const drilledLadder = drilledCheck ? progressionFor(drilledCheck.flaw) : undefined
  const drilledRung = drilledCheck && drilledLadder ? rungFor(drilledCheck.flaw, drilledLadder, rungs) : -1
  const suppressed = suppressedNote(analysis.triage, plan.length)
  const againstBest = focusAgainstBest(
    plan[0].flaw,
    analysis,
    best,
    previous && scoringVersionOf(previous) === rubric ? previous : undefined,
  )
  const levelled = tierLabel(analysis.triage)
  // The moment the top fault shows at, for the player's frame beside the
  // model's (L4.6), and each moment's tick or cross for the strip.
  const focusMoment = faultMoment(analysis.fundamentals, plan[0].flaw)
  const focusIndex = focusMoment ? analysis.phases.findIndex((p) => p.id === focusMoment) : -1
  const look = (id: PhaseId) => {
    const mark = momentMark(analysis.fundamentals, id)
    return (
      <span className="strip-look">
        {mark && (
          <span className={`strip-mark strip-mark--${mark}`}>
            <Icon name={mark === 'tick' ? 'check' : 'close'} size={11} />
            <span className="sr-only">{mark === 'tick' ? 'On target.' : 'Off target here.'}</span>
          </span>
        )}
        {LOOK_FOR[id]}
      </span>
    )
  }

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
            {/* The history behind this card, where there is one. Inside the
                card rather than under it, because it is the same subject: the
                count is only meaningful attached to the mechanics the body
                has just described. Absent on a first occurrence, which is
                most of them.

                Deliberately no style of its own — it takes `.injury-text p`,
                the card's own body voice. Written first as a dimmer caveat and
                looked at: demoting the count made the strongest fact on the
                card the quietest thing on it, and this is not a footnote to the
                warning, it is the warning's evidence. The class is left as a
                name for the element, not as a hook for a rule. */}
            {strainBehind?.[n.flag] && <p className="injury-behind">{strainBehind[n.flag]}</p>}
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
        {example
          ? 'Example report'
          : new Date(analysis.createdAt).toLocaleDateString(undefined, {
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
          <button className="btn btn--primary btn--full" onClick={onFilmAgain ?? onAnalyzeAnother}>
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

      {example && (
        <p className="example-banner">
          <Icon name="info" size={16} />
          <span>
            <strong>This is an example.</strong> It comes from a simulated serve, so you can see
            what a report looks like before you film your own.
          </span>
        </p>
      )}

      {/* A first read (M1.3): read before the sharper swing model was on the
          phone, rather than waiting on its download. Said, with the full read
          a tap away; the model keeps coming down behind this report. */}
      {analysis.firstRead && (
        <p className="example-banner">
          <Icon name="info" size={16} />
          <span>
            <strong>A first read.</strong> I read your swing before the sharper swing model finished
            downloading.{' '}
            {onReadFully && (
              <button type="button" className="levelled-btn" onClick={onReadFully}>
                Read it in full
              </button>
            )}
          </span>
        </p>
      )}

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
          // Fills once, on the report just made (N4.6); a reopened one opens filled.
          animate={'frames' in analysis && !example}
        />
        {/* The break is said out loud rather than left as an absence. Every
            comparison on this page goes at once when the rubric changes — this
            chip and the per-area ones on the cards below — and a player who saw
            them last time reads the silence as the app having broken. */}
        {previous &&
          (comparable ? (
            <span className="hero-delta">
              <DeltaChip delta={analysis.overall - previous.overall} scope="overall" alike={heroAlike} />
              {/* Said in words when the chip is the soft one: the two serves
                  were measured on different rows, and "vs your last serve"
                  beside a mark that declines to compare them would read as a
                  verdict of no change. */}
              <span>{scoreMoveCaption({ delta: analysis.overall - previous.overall, alike: heroAlike })}</span>
            </span>
          ) : (
            <span className="hero-delta">
              The scoring changed between these two serves, so this one starts a fresh run.
            </span>
          ))}
        {/* A fact about the whole history, not this one serve — the same
            reason `bestGap` below sits apart from the numbers it is a record
            among. Ungameable the same way: the only way to move it is to
            actually serve a higher score. */}
        {bestScore && <p>{bestTripLine(bestScore, analysis.createdAt)}</p>}
        {/* The band is a caption to the ring now, and the fix is the headline.
            A player opens this page to learn what to change; four stock
            phrases for the band said nothing that the ring had not, and the
            fix itself started most of a screen further down. */}
        <p className="hero-band">{verdict}</p>
        <span className="t-overline focus-kicker hero-kicker">Work on this next</span>
        <h1>{plan[0].title}</h1>
        <p>
          <Cue text={plan[0].why} />
        </p>
        {/* A soft read said beside the score it softens, not in the fold at
            the foot of the page. Degrading confidence is only forgiving if the
            player can see that it happened. A refused clip carries its own
            banner, so it does not get this one too. */}
        {!refusal && analysis.quality.confidence < SOFT_READ && (
          <p className="hero-rough">
            <Icon name="warn" size={14} />
            <span>Rough read: I only saw part of this serve. Film it again side-on to be sure.</span>
          </p>
        )}
        {onGlance && (
          <button className="drill-show hero-glance" onClick={onGlance}>
            At a glance
            <Icon name="chevron" size={13} />
          </button>
        )}
      </section>

      {/* The serve's speed, when one was read (N2.7). A miss is said in the
          fold, not here: a player who did not film for a speed should not
          meet a refusal under their score. */}
      {analysis.speed && 'speed' in analysis.speed && <SpeedRow speed={analysis.speed.speed} />}

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
        {/* The fix and its why are the page's headline, above; this card is
            how to work on it. */}
        <h2 className="t-overline focus-kicker">How to fix it</h2>
        {/* Leads the card since N4.2: a step passed or not is the first news a
            basket brings, so it sits under the why rather than after the drill.

            What the last basket said about this step, and the one move it
            earns. Moving is the player's tap, never automatic: a step is
            theirs to take, and a ladder that moved itself would be a ladder
            nobody trusted. */}
        {check && ladder && rung >= 0 && (
          <div className="drill-check">
            <p>
              {movedTo === undefined
                ? drillCheckLine(check)
                : `Now on step ${movedTo + 1} of ${ladder.steps.length}: ${ladder.steps[movedTo].name}.`}
            </p>
            {onLadderStep && plan[0].flaw && movedTo === undefined && (
              <>
                {check.outcome === 'passed' && rung < ladder.steps.length - 1 && (
                  <button
                    className="drill-show"
                    onClick={() => {
                      onLadderStep(plan[0].flaw!, rung + 1)
                      setMovedTo(rung + 1)
                    }}
                  >
                    Move up a step
                  </button>
                )}
                {check.outcome === 'not_yet' && check.clean <= check.need / 2 && rung > 0 && (
                  <button
                    className="drill-show"
                    onClick={() => {
                      onLadderStep(plan[0].flaw!, rung - 1)
                      setMovedTo(rung - 1)
                    }}
                  >
                    Try the step before
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {/* How this step is passed, when no basket has judged it yet
            (L4.2). A step the app cannot read — a toss, a throw, a swing
            with no ball — is the player's to pass, so it gets its own tap. */}
        {/* The same reading on the player's own best serve: the model they can
            reach. Silent for a fault with no row on the cards. */}
        {againstBest && (
          <p className="focus-best">
            <Cue text={againstBest} />
          </p>
        )}

        {/* Your frame beside the model's, at the moment this fault shows. */}
        {focusMoment && focusIndex >= 0 && (
          <MomentPair
            poses={stripPoses}
            index={focusIndex}
            phase={focusMoment}
            label={analysis.phases[focusIndex].label}
            racket={analysis.handedness}
            checks={momentChecks(analysis.fundamentals, focusMoment)}
          />
        )}

        {/* A count, never a list. Whatever the plan did not print is held back
            on purpose — but saying nothing at all means a fault appearing on the
            next clip reads as the app changing its mind. */}
        {suppressed && (
          <p className="focus-suppressed">
            <Cue text={suppressed} />
          </p>
        )}

        <div className="focus-drill">
          <span className="t-overline focus-drill-kicker">
            The drill{rung >= 0 && ladder ? ` · step ${rung + 1} of ${ladder.steps.length}` : ''}
          </span>
          <h3 className="t-subhead">{drill.name}</h3>
          <p>{drill.how}</p>
          {/* The feel, unfolded (L4.2): it is what to think about during the
              drill, so it belongs with the drill rather than under a tap. */}
          {ladder && (
            <p className="drill-feel">
              <strong>Feel:</strong> {ladder.cue}
            </p>
          )}
          <div className="focus-drill-foot">
            <span className="focus-reps">{drill.reps}</span>
            <span className="drill-actions">
            {/* Only for a fault the rig can pose and the engine names on it —
                see `faultDemoDials.ts`. A fallback focus from the ranking has
                no fault behind it, and neither does a report saved before the
                focus carried one. */}
            {hasDemo(plan[0].flaw) && (
              <button
                className="drill-show"
                onClick={() => setShowingFault((v) => !v)}
                aria-expanded={showingFault}
              >
                {showingFault ? 'Hide' : 'Show me'}
                <Icon name="chevron" size={13} />
              </button>
            )}
            {ladder && rung >= 0 && (
              <button
                className="drill-show"
                onClick={() => setShowingSteps((v) => !v)}
                aria-expanded={showingSteps}
              >
                {showingSteps ? 'Hide steps' : 'All steps'}
                <Icon name="chevron" size={13} />
              </button>
            )}
            </span>
          </div>
          {!check && ladder && rung >= 0 && (
            <div className="drill-check">
              <p>
                {selfMoved === undefined
                  ? stepCheckLine(ladder, ladder.steps[rung])
                  : `Now on step ${selfMoved + 1} of ${ladder.steps.length}: ${ladder.steps[selfMoved].name}.`}
              </p>
              {onLadderStep &&
                plan[0].flaw &&
                selfMoved === undefined &&
                ladder.steps[rung].check.by === 'self' &&
                rung < ladder.steps.length - 1 && (
                  <button
                    className="drill-show"
                    onClick={() => {
                      onLadderStep(plan[0].flaw!, rung + 1)
                      setSelfMoved(rung + 1)
                    }}
                  >
                    I can do this
                  </button>
                )}
            </div>
          )}
          {drilledCheck && drilledLadder && drilledRung >= 0 && (
            <div className="drill-check">
              <p>
                {movedTo === undefined
                  ? `${FAULT_NAME[drilledCheck.flaw]}, which you were drilling: ${drillCheckLine(drilledCheck)}`
                  : `${FAULT_NAME[drilledCheck.flaw]}: now on step ${movedTo + 1} of ${drilledLadder.steps.length}, ${drilledLadder.steps[movedTo].name}.`}
              </p>
              {onLadderStep &&
                movedTo === undefined &&
                drilledCheck.outcome === 'passed' &&
                drilledRung < drilledLadder.steps.length - 1 && (
                  <button
                    className="drill-show"
                    onClick={() => {
                      onLadderStep(drilledCheck.flaw, drilledRung + 1)
                      setMovedTo(drilledRung + 1)
                    }}
                  >
                    Move up a step
                  </button>
                )}
            </div>
          )}
          {showingFault && hasDemo(plan[0].flaw) && (
            <FaultDemoPanel flaw={plan[0].flaw} racket={analysis.handedness} />
          )}
          {/* The ladder the drill above is one rung of: easiest first, the
              current rung marked, and the bar for moving up. Folded by default
              — the drill is the instruction, and this is the plan around it. */}
          {showingSteps && ladder && rung >= 0 && (
            <div className="drill-ladder">
              <ol className="drill-steps">
                {ladder.steps.map((step, i) => (
                  <li key={step.name} className={i === rung ? 'is-now' : undefined} aria-current={i === rung ? 'step' : undefined}>
                    <span className="drill-step-name">
                      {step.name}
                      {i === rung && <span className="drill-step-now">Now</span>}
                    </span>
                    <span className="drill-step-how">{step.how}</span>
                    <span className="drill-step-reps">
                      {step.reps} · {step.check.by === 'engine' ? 'film it to check' : 'check it yourself'}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="drill-note">
                <strong>Too hard?</strong> {ladder.easier}
              </p>
              <p className="drill-note">
                <strong>Watch for:</strong> {ladder.mistake}
              </p>
              <p className="drill-note">
                A step you film moves up when {ladder.pass} of {CHECK_SERVES} serves come back without this fault.
              </p>
            </div>
          )}
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
                  {/* Folded to the drill's name, and open to its how and its
                      check on a tap (L4.2): these are the queue, so the first
                      fix keeps the page, but each one is a plan of its own. */}
                  <details className="focus-next-how">
                    <summary className="focus-next-drill">
                      <Icon name="target" size={14} />
                      <span>
                        <strong>{item.drill.name}</strong> — {item.drill.reps}
                      </span>
                      <Icon name="chevron" size={13} />
                    </summary>
                    <p className="focus-next-how-text">{item.drill.how}</p>
                    {nextCheck(item) && <p className="focus-next-how-text">{nextCheck(item)}</p>}
                  </details>
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
                This report has no footage behind it, so its verdict stays as it is.
                The level applies from your next clip on.
              </p>
            )}
          </>
        )}
      </section>

      {/* Out of the fold since N1.9: in-rate, first and second serves, sets and
          the toss map all read these taps, and folded they were rarely made.

          What the player says about this serve, on every report and not only
          after a recorded one (D5.1): which serve it was and where it went. The
          app never sees the court, so these are taps and nothing else, stored
          exactly as given. Built from the "Judged as" row above, so it adds
          no styles. */}
      {(onTagServe || onTagOutcome) && (
        <section className="reading" aria-label="What you said about this serve">
          <h2 className="t-overline reading-title">Tag this serve</h2>
          {onTagServe && (
            <div className="judged">
              <span className="t-overline judged-lead">Which serve</span>
              <div className="judged-options">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    className={`serve-chip${serveNumber === n ? ' is-on' : ''}`}
                    aria-pressed={serveNumber === n}
                    onClick={() => onTagServe(serveNumber === n ? undefined : n)}
                  >
                    {SERVE_NUMBER_LABEL[n]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {onTagOutcome && (
            <div className="judged">
              <span className="t-overline judged-lead">Where it landed</span>
              <div className="judged-options">
                {SERVE_OUTCOMES.map((o) => (
                  <button
                    key={o}
                    className={`serve-chip${outcome === o ? ' is-on' : ''}`}
                    aria-pressed={outcome === o}
                    onClick={() => onTagOutcome(outcome === o ? undefined : o)}
                  >
                    {OUTCOME_LABEL[o]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* The season-long focus, not this serve's own. See `Props.practice` —
          absent for anyone without two comparable sessions yet, exactly the
          condition the progress sheet's copy of this card already applies.

          Only when the season agrees with this serve's first fix. A report
          that heads "Work on this next" with one fault and then a "Practise
          this" card with another hands the player two first priorities, and
          the promise of the page is one. The season's card is still on
          Progress when it disagrees. When it agrees (L1.6) it keeps its trend
          and its log and does not print the drill twice. */}
      {practice &&
        (practice.drill.name === drill.name ||
          practice.drill.name === plan[0].drill.name ||
          practice.label === plan[0].title) && (
          <PracticeCard
            focus={practice}
            onLogDrill={onLogDrill}
            onUndoDrill={practice.drilled ? onUndoDrill : undefined}
            sameAsFocus
          />
        )}

      {live && (
        <section className="block" ref={playerRef}>
          <h2 className="block-title">Your serve, frame by frame</h2>
          <PosePlayer videoUrl={videoUrl!} analysis={analysis as Analysis} seek={seek} paired={ghost?.pair} />
          {/* The same sentence the replay carries, when the same body is drawn (L4.8). */}
          {ghost && !analysis.tilt && (
            <p className="player-note">
              {ghost.who === 'best'
                ? 'The dashed body is your best serve so far, lined up at the moment you hit the ball.'
                : 'The dashed body is your last serve, lined up at the moment you hit the ball.'}
            </p>
          )}
        </section>
      )}

      {/* The same slot, for a reopened report whose clip the player kept on
          this phone (D6.4): the real video, which carries the ball, the racket
          and the court that a tracked body cannot. It takes the replay's place
          rather than sitting beside it, for the reason the replay gives. */}
      {!live && kept && (
        <section className="block">
          <h2 className="block-title">Your serve, as you filmed it</h2>
          <KeptVideo
            url={kept.url}
            phases={analysis.phases}
            aspect={analysis.video.width / Math.max(1, analysis.video.height)}
            beside={
              kept.bestUrl && best
                ? { url: kept.bestUrl, phases: best.phases, aspect: best.video.width / Math.max(1, best.video.height) }
                : undefined
            }
          />
          <p className="player-note">
            You kept this clip on this phone. It goes when you delete this report, or first when space
            runs short.
          </p>
        </section>
      )}

      {/* The same slot, for a report whose clip is gone. Never both: `live`
          means there is a video to draw over, and where there is one the
          photograph wins — a replay is what a report has instead, not a second
          opinion beside it. */}
      {!live && !kept && replay && analysis.track && (
        <section className="block">
          <h2 className="block-title">Your serve, played back</h2>
          <TrackPlayer
            track={analysis.track}
            replay={replay}
            phases={analysis.phases}
            racket={analysis.handedness}
            paired={ghost?.pair}
          />
          {/* Says what it is before a player decides it is a broken video.
              Two sentences, and the first one is the good news: the clip is
              gone because it was never kept, which is the promise on the tin. */}
          <p className="player-note">
            {keepsClips
              ? 'This clip was not kept on your phone, so there is nothing to replay.'
              : 'Your clip never left your phone, so there is nothing to replay.'}{' '}
            This is the tracked body, moving at the speed you filmed.
          </p>
          {/* Only when there is a second body on screen. Silence otherwise —
              `pairTracks` refuses most pairs and none of its reasons is the
              player's fault or the player's problem. */}
          {ghost && (
            <p className="player-note">
              {ghost.who === 'best'
                ? 'The dashed body is your best serve so far, lined up at the moment you hit the ball.'
                : 'The dashed body is your last serve, lined up at the moment you hit the ball.'}
            </p>
          )}
        </section>
      )}

      <section className="block">
        <h2 className="block-title">Six moments in your serve</h2>
        {/* The two moment names a club player is least likely to know,
            defined on a tap (L4.11). */}
        <p className="terms-row">
          <span>Tap a word:</span>
          <Term id="trophy" />
          <Term id="racketDrop" />
        </p>
        <div className="strip">
          {/* `i` is the row `keyframePoses` wrote — position in this same array,
              so a drawn keyframe can never be captioned as a different one. */}
          {analysis.phases.map((p, i) =>
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
                  /* The photograph is gone — pruned past `KEEP_STILLS` — so the
                     body the tracker saw is drawn instead, from the poses the
                     report still carries. `PoseStill` falls back to the same
                     placeholder when there is no row either. */
                  <PoseStill poses={stripPoses} index={i} racket={analysis.handedness} label={p.label} />
                )}
                <span className="strip-caption">
                  <strong>{p.label}</strong>
                  {look(p.id)}
                </span>
              </button>
            ) : (
              <figure key={p.id} className="strip-item">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt={p.label} loading="lazy" />
                ) : (
                  <PoseStill poses={stripPoses} index={i} racket={analysis.handedness} label={p.label} />
                )}
                <figcaption className="strip-caption">
                  <strong>{p.label}</strong>
                  {look(p.id)}
                </figcaption>
              </figure>
            ),
          )}
        </div>
      </section>

      {/* The model to watch, on the example only (L4.3): a first look at
          what a report is for, beside what the serve is aiming at. A player's
          own report has the fault demonstration under its drill instead. */}
      {example && (
        <section className="block">
          <h2 className="block-title">A model serve to watch</h2>
          <ModelServe racket={analysis.handedness} />
        </section>
      )}

      {/*
       * More about this clip (L4.1), folded. The report reads hero, the one
       * thing to fix, the plan, then the serve itself — the video and its six
       * moments — and stops. Everything else a player may want is here, one
       * tap down: the basket, where the tosses went, how the clip was read,
       * tagging it, every area and the order the body fired in. It opens by
       * itself when the player asks for the basket to be scored, because they
       * then want to see it.
       */}
      <details
        className="report-more"
        open={moreOpen}
        onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="report-more-head">
          <span className="block-title">More about this clip</span>
          <Icon name="chevron" size={16} />
        </summary>
        <div className="report-more-body">
        {analysis.speed && 'miss' in analysis.speed && (
          <section className="speed-why" aria-label="Serve speed">
            <h2 className="block-title">Serve speed</h2>
            <p className="speed-range">{SPEED_MISS_LINE[analysis.speed.miss]}</p>
          </section>
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
            clipServes={analysis.serves?.count}
          />
        )}

        {/* Where every toss in this basket peaked, against the front foot
            (D6.3). One axis, the one this camera reads, and said so. */}
        {tossMap && (
          <section className="block">
            <h2 className="block-title">
              {tossMap.axis === 'ahead' ? 'Your tosses, front to back' : 'Your tosses, side to side'}
            </h2>
            <TossMap map={tossMap} />
          </section>
        )}

        {!example && analysis.quality.warnings.length > 0 && (
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
            {/* Which of two correct stances, not a verdict on either (D3.2).
                Absent when the camera stood where the feet could not be read. */}
            {analysis.diagnosis?.stance && (
              <span className="chip">
                <Term id="stance">
                  {analysis.diagnosis.stance.kind === 'pinpoint' ? 'Pinpoint stance' : 'Platform stance'}
                </Term>
              </span>
            )}
          </div>

          {/* What this angle could not see, and where to stand to see it (D3.9).
              Read off the findings this clip has rather than the angle's name, so
              a corner that caught one axis of the toss hears only of the other. */}
          {unseenLines(analysis.diagnosis).map((line) => (
            <p key={line} className="reading-unseen">
              {line}
            </p>
          ))}

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


        <section className="block">
          <h2 className="block-title">Every area I scored</h2>
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
                change={deltas[f.id]}
                breakdown={breakdowns.get(f.id)}
                onSeek={live ? goToPhase : undefined}
              />
            ))}
          </div>
        </section>

        {/* The order the body fired in (D3.8), at 60 fps and above. */}
        {analysis.diagnosis?.firingOrder && (
          <section className="block">
            <h2 className="block-title">
              <Term id="firingOrder">The order you fired in</Term>
            </h2>
            <FiringTimeline chain={analysis.diagnosis.chain} order={analysis.diagnosis.firingOrder} />
          </section>
        )}

        </div>
      </details>

      {/*
        Turn this analysis into a ground-truth test fixture.

        REACHABLE ON A PHONE NOW, which is the whole of R59. It used to be behind
        `import.meta.env.DEV`, and everything about it assumed a desk: a console
        for the list of what was still missing, a dev server to run at all. Five
        threads in this ledger are blocked on somebody filming a serve, and that
        somebody is standing on a court. `?fixture` is the same door `?check`
        already uses, for the reason that one gives — a path that only runs in a
        dev build cannot be run on the phone that matters — and it stays behind a
        query string so no ordinary player ever meets it.

        The import is still dynamic, so the fixture machinery is a chunk fetched
        on demand rather than weight in the entry bundle. That is R44's finding
        applied to a second module.
      */}
      {fixtureExport && isLive(analysis) && (
        <>
          {/*
            The six clips, so the shoot is not a thing you do by reading the
            repo — which is the whole of R59 and the half R59·1 left out.

            NOT A PROGRESS BAR, and it must not become one. Which clips are
            already committed is a fact about a git repository; a phone standing
            on a court cannot see it and never will. So this is a list to work
            down, and the app claims to know nothing about where anybody is on it.

            `.note` again, as with the gaps above: no new class, no new CSS, and a
            surface no ordinary player reaches is the last place to spend design.
          */}
          <p className="note">
            Six clips clear the gate. Film them in this order — the first one matters most.
          </p>
          {FIXTURE_PLAN.map((clip) => (
            <p className="note" key={clip.n}>
              {clip.n}. {clip.what} {clip.why}
            </p>
          ))}
          <button
            className="btn btn--ghost btn--full"
            onClick={() =>
              void import('../dev/exportFixture').then((m) =>
                setSaved(m.downloadFixture(analysis as Analysis)),
              )
            }
          >
            Save as test fixture
          </button>
          {/*
            On screen and not only in the console, because whoever just filmed
            the serve is holding a phone.

            `.note` and nothing else — no new class and no new CSS. This is a
            list of caveats about a file, which is exactly what that class
            already carries elsewhere on this screen, and a bare `<ul>` here
            would have needed styling invented for a surface no player reaches.
            Every line is the validator's own wording, so what this says and what
            the suite says about the same file cannot drift apart.
          */}
          {saved && (
            <>
              <p className="note">
                Saved {saved.file}.{' '}
                {saved.gaps.length === 0
                  ? 'Nothing left to fill in.'
                  : `${saved.gaps.length} things left before it counts as ground truth.`}
              </p>
              {saved.gaps.map((gap) => (
                <p className="note" key={gap}>
                  {gap}
                </p>
              ))}
            </>
          )}
        </>
      )}

      <footer className="report-foot">
        <button className="btn btn--primary btn--full" onClick={onAnalyzeAnother}>
          <Icon name="camera" size={18} />
          {example ? 'Analyse your own serve' : 'Analyse another serve'}
        </button>
        {/* `aria-live` so "Preparing…"/"Saved" reaches a screen reader as
            the button's own text changes under it — see ConsistencyPanel's
            own share button for the same reasoning. Not on the example: a
            simulated serve on a share card reads as the sender's own. */}
        {!example && (
          <button
            className="btn btn--ghost btn--full"
            onClick={() => void share()}
            disabled={sharing === 'working'}
            aria-live="polite"
          >
            <Icon name={sharing === 'done' ? 'check' : 'share'} size={17} />
            {sharing === 'working'
              ? 'Preparing…'
              : sharing === 'done'
                ? 'Saved'
                : 'Save or share this report'}
          </button>
        )}
        {!example && (
          <button
            className="btn btn--ghost btn--full"
            onClick={() => void sendCoach()}
            disabled={sendingCoach === 'working'}
            aria-live="polite"
          >
            <Icon name={sendingCoach === 'done' ? 'check' : 'share'} size={17} />
            {sendingCoach === 'working' ? 'Preparing…' : sendingCoach === 'done' ? 'Ready to send' : 'Send to my coach'}
          </button>
        )}
        <p className="fineprint">
          {example
            ? 'Built from a simulated serve. Nothing on this page was measured from a video.'
            : isLive(analysis)
              ? `Measured on this device from ${analysis.frames.length} tracked frames. Nothing was uploaded.` +
                (keepFailed ? ' I could not keep this video on the phone, so it will not play here later.' : '')
              : // Follows the setting (L6.7): "never saved" was printed under a kept video.
                kept
                ? 'Measured on this device. Nothing was uploaded, and the video is kept on this phone only.'
                : keepsClips
                  ? 'Measured on this device. Nothing was uploaded, and this video was not kept.'
                  : 'Measured on this device. Nothing was uploaded, and the video itself was never saved.'}
        </p>
      </footer>
    </div>
  )
}
