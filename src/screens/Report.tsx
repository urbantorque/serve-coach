import { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react'
import '../styles/blocks.css'
import '../styles/depth.css'
import '../styles/fundamentals.css'
import '../styles/player.css'
import '../styles/report.css'
import ConsistencyPanel from '../components/ConsistencyPanel'
import TossMap from '../components/TossMap'
import FiringTimeline from '../components/FiringTimeline'
import KeptVideo from '../components/KeptVideo'
import type { CompareWho } from '../lib/compareSet'
import type { TossMap as TossMapData } from '../lib/tossMap'
import FundamentalCard from '../components/FundamentalCard'
import Locked from '../components/Locked'
import { PageNav } from '../components/pageNav'
import { useCan } from '../components/usePlan'
import LevelPicker from '../components/LevelPicker'
import PosePlayer from '../components/PosePlayer'
import PracticeCard from '../components/PracticeCard'
import { DeltaChip } from '../components/DeltaChip'
import { Cue, Icon, Sheet } from '../components/primitives'
import type { SelfRead } from '../lib/selfRead'
import type { CoachContext } from '../lib/share/coachContext'
import type { Moment } from '../lib/moments'
import { earcon } from '../lib/earcon'
import MomentCard from '../components/MomentCard'
import { useCountUp } from '../components/useCountUp'
import { NBSP, SPEED_MISS_LINE, defaultSpeedUnit, speedFigures } from '../lib/speedCopy'
import { SOFT_READ, readQuality, VERDICT } from '../components/statusLabels'
import ModelServe from '../components/ModelServe'
import Term from '../components/Term'
import { faultMetric, faultMoment, momentChecks } from '../lib/lookFor'
import { targetDrawn } from '../lib/analysis/targetShape'
import TargetShape from '../components/TargetShape'
import { drillCheckLine, progressionFor, rungFor } from '../lib/analysis/progressions'
import { ownGoodLine } from '../lib/ownGood'
import { drillLoop } from '../lib/drillLoop'
import { FAULT_NAME } from '../lib/graduation'
import TrackPlayer from '../components/TrackPlayer'
import { replayFrom } from '../lib/storage/poseTrack'
import { pairTracks } from '../lib/trackPair'
import { focusAgainstBest } from '../lib/bestServe'
import { OUTCOME_LABEL, SERVE_NUMBER_LABEL, serveTagSummary } from '../lib/serveTagCopy'
import { SERVE_OUTCOMES, type ServeOutcome } from '../lib/storage/db'
import { FIXTURE_PLAN } from '../lib/fixturePlan'
import { useShareState } from '../components/useShareState'
import { MAX_CONSISTENCY_SERVES } from '../lib/analysis/analyze'
import { SERVE_TYPES } from '../lib/analysis/coaching'
import { unseenLines } from '../lib/analysis/angleReach'
import { consistencyHeadline, type ServePairFrames } from '../lib/analysis/consistency'
import { readAlike } from '../lib/analysis/realChange'
import { scoreBreakdown } from '../lib/analysis/breakdown'
import { injuryNotes, legLeadLine, refusalFor, suppressedNote, tierLabel } from '../lib/analysis/verdict'
import { linkedPlan, missLinks } from '../lib/missLinks'
import { guessLine, type ServeGuess } from '../lib/serveGuess'
import type { InjuryFlag } from '../lib/analysis/triage'
import type { PracticeFocus } from '../lib/practice'
import { readPrefs, type ServeType } from '../lib/storage/prefs'
import {
  bestTripLine,
  deltasAgainst,
  scoreMoveCaption,
  scoringVersionOf,
  type BestGap,
  type BestTrip, deltaStatus, shortDate } from '../lib/progress'
import { clipsWork, shareReportCard, shareServeClip } from '../lib/share/reportCard'
import { swingOf, rowParts, workParts } from '../lib/figure/swing'
import { SCORING_VERSION, type Analysis, type PhaseId } from '../lib/analysis/types'
import type { PracticeLog, ServeTag, Session, StudioMark } from '../lib/storage/db'
import DrillCard from './report/DrillCard'
import RevealStage from './report/RevealStage'
import ShareChoice from './report/ShareChoice'
import SideBySide from './report/SideBySide'
import { deviceNoun } from '../lib/device'

/*
 * The band in words, as a caption to the score. Said once, and short: the fix
 * is the headline.
 */

/** An earlier serve whose clip is kept, to play beside this one (four up, Apex E). */
export interface KeptOther {
  who: CompareWho
  session: Session
  url: string
}

/** What each kept serve beside this one is called, under its clip. */
const KEPT_LABEL: Record<CompareWho, (at: number) => string> = {
  best: () => 'Your best',
  last: (at) => `Your last, ${shortDate(at)}`,
  month: (at) => `A month before, ${shortDate(at)}`,
}

interface Props {
  analysis: Analysis | Session
  videoUrl?: string
  /** The report filed before this one, if any: what the deltas compare against. */
  previous?: Session
  /** The player's best earlier serve of this type, under this rubric. */
  best?: Session
  /** This serve against the player's own usual and best, past their own noise. */
  self?: SelfRead
  /**
   * The drills the player marked done, for reading this serve against the one
   * done just before it (C1.4). Read here rather than in the app shell, so the
   * check loads with the report and not with the first screen.
   */
  drillLogs?: PracticeLog[]
  /** What this report earned, as of the day it was filmed. */
  moment?: Moment
  /** What a coach would ask first. Worked out only if a page is asked for. */
  coachContext?: () => Promise<CoachContext>
  /**
   * The player's history and what they said about each serve: where a fault
   * this serve shows went with one kind of miss, past chance, the plan moves it
   * up (N2.9). Absent on the example, which has no history.
   */
  sessions?: Session[]
  tags?: ServeTag[]
  /** What the player said about this serve, and the taps that change it. */
  serveNumber?: 1 | 2
  outcome?: ServeOutcome
  onTagServe?: (n: 1 | 2 | undefined) => void
  onTagOutcome?: (o: ServeOutcome | undefined) => void
  /** What was drawn on this serve in the studio (E1.2), and the way to keep more. */
  marks?: StudioMark[]
  onMarks?: (marks: StudioMark[]) => void
  /** Which serve this looks like, from the player's own record. Never stored as a tag. */
  serveGuess?: ServeGuess
  /** Show this clip as the glance: the one-screen read for the court. */
  onGlance?: () => void
  /** Every toss in this basket, when two or more were read. */
  tossMap?: TossMapData
  /** The clip this report came from, kept on this device, and the best serve's. */
  /** This serve's kept clip, and earlier serves' kept clips to set beside it. */
  kept?: { url: string; others?: KeptOther[] }
  /** Whether the player keeps videos, so the "never saved" lines follow it. */
  keepsClips?: boolean
  /** The keep for this clip failed, said on the live report. */
  keepFailed?: boolean
  onBack: () => void
  onAnalyzeAnother: () => void
  /** The refusal's "Film it again": straight to the framing check. */
  onFilmAgain?: () => void
  /** Read this clip again with the refinement model, after a first read. */
  onReadFully?: () => void
  onFlipHandedness?: () => void
  /** Re-run against a different serve in the same clip. */
  onPickServe?: (index: number) => void
  /** Re-score against a different serve type's target bands. */
  onPickServeType?: (type: ServeType) => void
  /** Re-judge against a different rung of the level ladder. */
  onPickTier?: (tier: number | undefined) => void
  /** What the engine estimated, when the player has stated nothing. */
  statedTier?: number
  /** Measure every serve in the clip and compare them. */
  onCheckConsistency?: () => void
  /** Every serve in the basket being scored behind this report (Apex A), and how far it has got. */
  scoring?: { done: number; total: number; stopping?: boolean }
  /** Stop scoring; what was scored is still compared. */
  onStopScoring?: () => void
  /** The best and worst serve as pictures, while the clip they came from is open. */
  servePair?: ServePairFrames
  /** The tightest best-against-worst gap swept across every basket. */
  bestGap?: BestGap
  /** How this basket's gap compared to the one right before it. */
  basketGapDelta?: number
  /** The best trip of this serve type so far, by its median. */
  bestScore?: BestTrip
  /** The trip streak line, carried onto the share card. */
  streak?: string
  /** Per injury flag, what it did on the trips before this serve. */
  strainBehind?: Partial<Record<InjuryFlag, string>>
  /** The report on screen could not be written to storage. */
  saveWarning?: string
  /** The season-long thing worth practising, shown when it agrees with the first fix. */
  practice?: PracticeFocus
  onLogDrill?: () => void
  onUndoDrill?: () => void
  /** Which rung of each fault's ladder the player is on. */
  ladder?: Partial<Record<string, number>>
  /** `from` is the rung being left, so a move up can be told from a step back. */
  onLadderStep?: (flaw: string, step: number, from?: number) => void
  /** To the viewfinder, with this fix's drill as what the next serves are counted for. */
  onFilmCheck?: (flaw: string, drill: string) => void
  /** Whether this session may turn a report into a ground-truth fixture. */
  fixtureExport?: boolean
  /** This is the example report, not the player's own serve. */
  example?: boolean
  /** The player's first serve, which any plan reads in full (N6.4). */
  firstServe?: boolean
}

/** The scoring line and its stop, on one row. Inline: the report's stylesheet is at its budget. */
/** The serve-tag fold's line: a link, without the browser's triangle. */
const SCORING_ROW = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } as const

/** A saved session has no `frames`, so the player is only offered live. */
const isLive = (a: Analysis | Session): a is Analysis =>
  Array.isArray((a as Analysis).frames) && (a as Analysis).frames.length > 0

/**
 * The report: how did I do, what do I fix, what do I do now, on the first
 * screen, on the player's own serve. Everything else is depth they can choose.
 *
 * It used to run to five screens and forty controls, with the serve itself on
 * screen four. The order now follows what a player reads for: the picture and
 * the number, the one fix, the one thing to do. Then the rest of the plan, the
 * serve side by side and in motion, and one fold for everything measured.
 */
export default function Report({
  firstServe,
  analysis,
  videoUrl,
  previous,
  best,
  self,
  drillLogs,
  moment,
  coachContext,
  sessions,
  tags,
  serveNumber,
  outcome,
  onTagServe,
  onTagOutcome,
  marks,
  onMarks,
  serveGuess,
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
  scoring,
  onStopScoring,
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
  onFilmCheck,
  fixtureExport,
  example,
}: Props) {
  const playerRef = useRef<HTMLDivElement>(null)
  const [seek, setSeek] = useState<{ phase: PhaseId; n: number }>()
  /** The last fixture saved from this report, and what it is still missing. */
  const [saved, setSaved] = useState<{ file: string; gaps: string[] }>()
  const [pickingLevel, setPickingLevel] = useState(false)
  // Answered, either way: "work it out for me" leaves no level stored (N2.12).
  const [levelAnswered, setLevelAnswered] = useState(false)
  /** The first serve's level guess, opened to correct it (N7.6). */
  const [asking, setAsking] = useState(false)
  /** Which fix of the plan is open as a lesson. */
  const [lesson, setLesson] = useState<number>()
  const [sharingOpen, setSharingOpen] = useState(false)
  /** Hiding the spreads, not deleting them: they feed the consistency trend. */
  const [hidSpreads, setHidSpreads] = useState(false)
  const consistency = hidSpreads ? undefined : analysis.consistency
  // One fold, closed, until a basket the player asked for arrives.
  const [moreOpen, setMoreOpen] = useState(false)
  // The paid gates (N6.4). The sample report is a demonstration, so it is always whole.
  const allow = useCan()
  const openPage = useContext(PageNav)
  const fullRead = example || allow('breakdown', { firstServe })
  const showCompare = example || allow('compare')
  const hadBasket = useRef(Boolean(consistency))
  useEffect(() => {
    if (consistency && !hadBasket.current) setMoreOpen(true)
    hadBasket.current = Boolean(consistency)
  }, [consistency])
  /** Whether the player has asked to see numbers off a clip that was refused. */
  const [overrode, setOverrode] = useState(false)
  /** The picture has arrived, so the numbers and words can come in. */
  const [settled, setSettled] = useState(false)
  // "Play it again" (B1.1): each press is a fresh stage, played through to the hold.
  const [replays, setReplays] = useState(0)
  const [replaying, setReplaying] = useState(false)
  // Nothing may keep the words off the screen: a clip that stalls settles anyway.
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 6000)
    return () => clearTimeout(t)
  }, [])

  // A good score under an injury warning says the warning comes first (N7.4).
  const warned = injuryNotes(analysis.triage).length > 0
  const verdict =
    warned && (analysis.overallStatus === 'great' || analysis.overallStatus === 'good')
      ? 'A good score. Fix the warnings first.'
      : VERDICT[analysis.overallStatus]
  const live = isLive(analysis) && Boolean(videoUrl)
  // A laptop that shows the clip in its left pane (N7.6). The right pane's
  // picture would be a second copy of it, 300 px tall, between the warnings and
  // the fix; there the number sits on a panel and nothing replays.
  const [studio] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(min-width: 1024px)').matches === true &&
      (live || Boolean(kept) || Boolean(analysis.track)),
  )
  useEffect(() => {
    if (studio) setSettled(true)
  }, [studio])
  // Which rubric these numbers were computed under: this build's for a fresh
  // report, and an unstamped saved one predates stamping.
  const rubric = isLive(analysis) ? (analysis.scoringVersion ?? SCORING_VERSION) : scoringVersionOf(analysis)
  // A delta across a recalibration measures the rubric, not the serve.
  const comparable = previous !== undefined && scoringVersionOf(previous) === rubric

  const deltas = useMemo(
    () => deltasAgainst(analysis.fundamentals, previous, rubric),
    [analysis.fundamentals, previous, rubric],
  )
  const heroAlike = previous ? readAlike(analysis.fundamentals, previous.fundamentals) : true
  const breakdowns = useMemo(
    () => new Map(scoreBreakdown(analysis.fundamentals).map((b) => [b.id, b])),
    [analysis.fundamentals],
  )
  const swing = useMemo(() => swingOf(analysis), [analysis])
  const replay = useMemo(() => replayFrom(analysis.track), [analysis.track])
  /*
   * The best earlier serve drawn under this one, when the two may honestly be
   * drawn together: what good looks like for this player, or else their last.
   */
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

  const { sharing, trigger: share } = useShareState(() =>
    shareReportCard(analysis, streak, bestScore && bestTripLine(bestScore, analysis.createdAt)),
  )
  const { sharing: clipping, trigger: makeClip } = useShareState(() =>
    shareServeClip(analysis, streak, bestScore && bestTripLine(bestScore, analysis.createdAt)),
  )

  const goToPhase = (phase: PhaseId) => {
    setSeek((prev) => ({ phase, n: (prev?.n ?? 0) + 1 }))
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    playerRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  }

  const refusal = refusalFor(analysis.triage)
  const injuries = injuryNotes(analysis.triage)
  // Worst cause first, falling back to the single focus on a report filed
  // before the diagnostic pass, so there is always a first entry. A fault the
  // player's own tags tie to a kind of miss, past chance, comes up the plan
  // behind the first fix, with a line saying why (N2.9).
  const linked = useMemo(
    () =>
      linkedPlan(
        analysis.triage,
        analysis.diagnosis,
        example || !sessions?.length ? [] : missLinks(analysis, sessions, tags ?? []),
      ),
    [analysis, sessions, tags, example],
  )
  const ranked = linked.plan
  const plan = ranked.length ? ranked : [analysis.focus]
  const first = plan[0]

  // The coach's page lists the plan as this report orders it (N7.5).
  const { sharing: sendingCoach, trigger: sendCoach } = useShareState(() =>
    import('../lib/share/coachShare').then(async ({ sendCoachReport }) =>
      sendCoachReport(analysis, await coachContext?.(), ranked),
    ),
  )

  /** Where one fix's drill sits on its ladder, or -1 where it has none. */
  const rungOf = (item: Analysis['focus']): number => {
    const own = item.flaw ? progressionFor(item.flaw, item.axis) : undefined
    if (!own || !item.flaw) return -1
    const at = own.steps.findIndex((s) => s.name === item.drill.name)
    const stored = rungs?.[item.flaw]
    return stored !== undefined && Number.isInteger(stored) && stored >= 0 && stored < own.steps.length ? stored : at
  }
  const firstLadder = first.flaw ? progressionFor(first.flaw, first.axis) : undefined
  const firstRung = rungOf(first)
  const firstDrill = firstLadder && firstRung >= 0 ? firstLadder.steps[firstRung] : first.drill

  // A basket judged against the fix on screen, or against the fault the player
  // was drilling when that is no longer this report's first fix.
  const check = analysis.drillCheck?.flaw === first.flaw ? analysis.drillCheck : undefined
  const drilledCheck = analysis.drillCheck && !check ? analysis.drillCheck : undefined
  const drilledLadder = drilledCheck ? progressionFor(drilledCheck.flaw) : undefined
  const drilledRung = drilledCheck && drilledLadder ? rungFor(drilledCheck.flaw, drilledLadder, rungs) : -1

  const suppressed = suppressedNote(analysis.triage, plan.length)
  // The drill just done, read first (C1.4). Never on the example, which has no history.
  const loop = useMemo(
    () => (example || !sessions ? undefined : drillLoop(analysis as Session, sessions, drillLogs, tags)),
    [example, analysis, sessions, drillLogs, tags],
  )
  const againstBest = focusAgainstBest(first.flaw, analysis, best, previous && scoringVersionOf(previous) === rubric ? previous : undefined)
  const levelled = tierLabel(analysis.triage)

  // A fix led by a card row rather than a named fault holds at that row's own
  // moment (W5.3): a racket drop held at contact showed the wrong instant.
  const focusRow = first.flaw ? undefined : analysis.fundamentals.flatMap((f) => f.metrics).find((m) => m.label === first.title)
  const focusMoment = faultMoment(analysis.fundamentals, first.flaw) ?? focusRow?.phase
  const focusPhase = focusMoment ? analysis.phases.find((p) => p.id === focusMoment) : undefined
  /**
   * The fix's moment beside a model serve, played phase for phase (N4.1).
   * Where it shows, the example's separate looped model serve is the same
   * serve a second time, so it gives way (N5.1).
   */
  const besideModel = Boolean(swing && focusMoment && focusPhase)
  const stageMoment: PhaseId = focusMoment ?? 'contact'
  // And it paints the body part that row is about (W6.4): the fault its row reads,
  // painted over the player's own footage, where a named fault already was.
  const work = first.flaw ? workParts(first.flaw, analysis.handedness) : focusRow ? rowParts(focusRow.id, analysis.handedness) : []

  // Fresh out of the analysis: played through once. Reopened, it opens at rest.
  const fresh = 'frames' in analysis && !example
  const clip = videoUrl ?? kept?.url
  const speed = analysis.speed && 'speed' in analysis.speed ? analysis.speed.speed : undefined
  const unit = readPrefs().speedUnit ?? defaultSpeedUnit()
  const figures = speed ? speedFigures(speed, unit) : undefined
  const shown = useCountUp(analysis.overall, fresh && settled)
  const landed = useRef(false)
  useEffect(() => {
    if (!fresh || !settled || landed.current || readPrefs().sounds === false) return
    landed.current = true
    earcon(moment ? 'moment' : 'reveal', true)
  }, [fresh, settled, moment])

  // The row the fix reads, for the target shape on the held frame (B1.1).
  const leadMetric = faultMetric(analysis.fundamentals, first.flaw)
  const heldTarget = leadMetric && targetDrawn(leadMetric) ? leadMetric : undefined
  const stageLabel = `Your serve at ${(focusPhase?.label ?? 'contact').toLowerCase()}${work.length ? ', with the part to work on picked out' : ''}.`

  // The score and the speed: on the picture beside the studio's clip, and on a
  // phone under the fix, so the held frame carries the correction (B2.1). Under
  // a warning the picture is short and keeps the number, as N7.8 fitted it.
  const below = !studio && !injuries.length
  const numbers = (
    <div className="hero-numbers">
      <div className="hero-score">
        <span className="hero-scoreline">
          <span className="t-score" aria-label={`${analysis.overall} out of 100`}>
            {shown}
          </span>
          <span className="hero-outof" aria-hidden="true">
            /100
          </span>
        </span>
        <p className="hero-band">{verdict}</p>
      </div>
      {figures && (
        <section className="hero-speed" aria-label="Serve speed">
          <p className="hero-speed-figure">
            <span className="hero-speed-about">about</span>
            <span className="hero-speed-line">
              <strong>{figures.best}</strong>
              {NBSP}
              {figures.unit}
            </span>
          </p>
          <p className="hero-speed-range">
            <Term id="likelyRange">Likely</Term> {figures.low} to {figures.high}
            {NBSP}
            {figures.unit}. No radar has checked it.
          </p>
        </section>
      )}
    </div>
  )
  // The same two figures, small, under the fix on the held frame's report.
  const tally = (
    <div className="hero-tally">
      <p className="hero-tally-score">
        <span className="sr-only">{`${analysis.overall} out of 100.`}</span>
        <span className="hero-tally-num" aria-hidden="true">
          {shown}
        </span>
        <span className="hero-outof" aria-hidden="true">
          /100
        </span>
        <span className="hero-tally-band">{verdict}</span>
      </p>
      {figures && (
        <section className="hero-tally-speed" aria-label="Serve speed">
          <p className="hero-tally-figure">
            about <strong>{figures.best}</strong>
            {NBSP}
            {figures.unit}
          </p>
          <p className="hero-tally-range">
            <Term id="likelyRange">Likely</Term> {figures.low} to {figures.high}
            {NBSP}
            {figures.unit}. No radar has checked it.
          </p>
        </section>
      )}
    </div>
  )
  const settledView = (settled || !fresh) && !replaying

  const topbar = (
    <header className="report-top">
      <button className="glass-btn" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>
      <span className="report-when">
        {example
          ? 'Example report'
          : new Date(analysis.createdAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
      {!example ? (
        <button className="glass-btn" onClick={() => setSharingOpen(true)} aria-label="Share this serve">
          <Icon name="share" />
        </button>
      ) : (
        <span className="report-top-gap" aria-hidden="true" />
      )}
    </header>
  )

  const shareSheet = (
    <Sheet open={sharingOpen} onClose={() => setSharingOpen(false)} title="Share this serve">
      <ShareChoice
        card={sharing}
        onCard={() => void share()}
        coach={sendingCoach}
        onCoach={
          allow('coachShare')
            ? () => void sendCoach()
            : () => {
                setSharingOpen(false)
                openPage('pricing')
              }
        }
        coachPlus={!allow('coachShare')}
        clip={clipping}
        onClip={swing && clipsWork() ? () => void makeClip() : undefined}
      />
    </Sheet>
  )

  // Refused, and not yet overridden: the numbers exist and stay off the screen.
  if (refusal && !overrode) {
    return (
      <div className="screen report" data-screen="report">
        {topbar}
        <section className="refusal">
          <div className="hero-stage hero-stage--short" aria-hidden="true">
            {swing && <RevealStage analysis={analysis} swing={swing} moment="contact" work={[]} reveal={false} onSettled={() => {}} label="" />}
            <div className="hero-veil" />
          </div>
          <div className="refusal-body">
            <span className="t-overline refusal-label">No score for this clip</span>
            <h1 className="t-display">{refusal.title}</h1>
            <ul className="refusal-hints">
              {refusal.hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <p className="refusal-note">
              I measured this video, but I don’t trust the results. Numbers from footage this hard to see look
              like real ones.
            </p>
            <button className="link-btn link-btn--quiet" onClick={() => setOverrode(true)}>
              Show me the numbers anyway
            </button>
          </div>
        </section>
        <div className="report-bar">
          <button className="btn btn--primary btn--big report-bar-main" onClick={onFilmAgain ?? onAnalyzeAnother}>
            <Icon name="camera" size={20} />
            Film it again
          </button>
        </div>
      </div>
    )
  }

  const moved = previous && comparable ? analysis.overall - previous.overall : undefined

  return (
    <div className="screen report" data-screen="report">
      {topbar}

      {/* Injuries lead, above the score and everything else. */}
      {injuries.length > 0 && (
        <section className="injuries" aria-label="Injury risk">
          {injuries.map((n) => (
            <div key={n.flag} className={`injury injury--${n.severity}`}>
              <span className="t-overline injury-label">Injury risk</span>
              <strong className="t-headline injury-title">{n.title}</strong>
              <p>
                <Cue text={n.body} />
              </p>
              {strainBehind?.[n.flag] && <p className="injury-behind">{strainBehind[n.flag]}</p>}
            </div>
          ))}
          {/* The stop line, where the warning is (N7.3), not only in the terms. */}
          <p className="injury-stop">If it hurts, stop and see someone qualified.</p>
        </section>
      )}

      <section className="hero" data-settled={settled || !fresh ? 'true' : 'false'}>
        <div
          className={`hero-stage${injuries.length ? ' hero-stage--short' : ''}${injuries.length > 1 ? ' hero-stage--shorter' : ''}${studio ? ' hero-stage--panel' : ''}${below ? ' hero-stage--held' : ''}`}
          onClick={() => setSettled(true)}
        >
          {fresh && !settled && !studio && (
            <button type="button" className="sr-only" onClick={() => setSettled(true)}>
              Skip the replay
            </button>
          )}
          {!studio && (
          <RevealStage
            key={replays}
            analysis={analysis}
            swing={swing}
            videoUrl={clip}
            moment={stageMoment}
            work={work}
            reveal={fresh || replays > 0}
            onSettled={() => {
              setSettled(true)
              setReplaying(false)
            }}
            label={stageLabel}
          />
          )}
          {!studio && <div className="hero-veil" aria-hidden="true" />}
          {!studio && clip && settledView && (
            <button
              type="button"
              className="hero-replay"
              onClick={(e) => {
                e.stopPropagation()
                setReplaying(true)
                setReplays((n) => n + 1)
              }}
            >
              <Icon name="repeat" size={17} />
              Play it again
            </button>
          )}
          {!below && numbers}
          {below && settledView && (heldTarget ? (
            <div className="hero-plate">
              <TargetShape metric={heldTarget} />
            </div>
          ) : (
            <p className="hero-moment">{heldAt(focusPhase?.id ?? 'contact')}</p>
          ))}
        </div>

        <div className="hero-fix">
          {previous &&
            (comparable ? (
              <p className="hero-delta">
                {deltaStatus(moved ?? 0, 'overall', heroAlike) === 'flat' ? (
                  <span>About the same as your last serve</span>
                ) : (
                  <>
                    <DeltaChip delta={moved ?? 0} scope="overall" alike={heroAlike} />
                    <span>{scoreMoveCaption({ delta: moved ?? 0, alike: heroAlike })}</span>
                  </>
                )}
              </p>
            ) : (
              <p className="hero-delta">I changed how I score serves since your last one, so I can’t compare the two.</p>
            ))}
          {bestScore && <p className="hero-best">{bestTripLine(bestScore, analysis.createdAt)}</p>}
          {self?.reward && (
            <p className="hero-best">
              <Cue text={self.reward.line} />
            </p>
          )}
          {/* The drill just done, read first (C1.4): did this serve move past the player's own spread? */}
          {loop && (
            <p className="hero-best">
              <Cue text={loop.line} />
            </p>
          )}
          <span className="t-overline hero-kicker">Work on this next</span>
          <h1>{first.title}</h1>
          <p className="hero-why">
            <Cue text={first.why} />
          </p>
          {below && tally}
          {/* The shape to aim for, under the fix it belongs to (B1.1), where the
              studio's clip has the picture. */}
          {studio && heldTarget && (
            <div className="hero-target">
              <TargetShape metric={heldTarget} />
            </div>
          )}
          {first.flaw && linked.why[first.flaw] && <p className="hero-note">{linked.why[first.flaw]}</p>}
          {!refusal && analysis.quality.confidence < SOFT_READ && (
            <p className="hero-rough">
              <Icon name="warn" size={15} />
              <span>Rough result: I only saw part of this serve. Film it again from the side to be sure.</span>
            </p>
          )}
          {refusal && (
            <p className="hero-rough">
              <Icon name="warn" size={15} />
              <span>
                <strong>{refusal.title}.</strong> Everything here comes from that video, so treat it as a rough guess.
              </span>
            </p>
          )}
          {analysis.firstRead && (
            <p className="hero-note">
              <strong>A quick check.</strong> I checked your swing before the more accurate tracker finished downloading.{' '}
              {onReadFully && (
                <button type="button" className="link-btn" onClick={onReadFully}>
                  Check it again in full
                </button>
              )}
            </p>
          )}
          {saveWarning && (
            <p className="hero-rough">
              <Icon name="warn" size={15} />
              <span>{saveWarning}</span>
            </p>
          )}
          {example && (
            <p className="hero-note">
              <strong>This is an example.</strong> It comes from a simulated serve, so you can see what you get back.
            </p>
          )}
        </div>

        <button className="now" onClick={() => setLesson(0)}>
          <span className="now-text">
            <span className="now-label">What to do now</span>
            <strong>{firstDrill.name}</strong>
            <span className="now-meta">
              {firstDrill.reps}
              {firstLadder && firstRung >= 0 ? `, step ${firstRung + 1} of ${firstLadder.steps.length}` : ''}
            </span>
          </span>
          <Icon name="chevron" size={20} />
        </button>
        {/* After the four answers, not between the number and the fix (N7.6). */}
        {moment && (settled || !fresh) && <MomentCard moment={moment} />}
      </section>

      {/* The drills after the first are part of the full breakdown (N6.4). */}
      {fullRead && plan.length > 1 && (
        <section className="plan" aria-labelledby="plan-title">
          <h2 className="t-headline" id="plan-title">
            Then work on these, in order
          </h2>
          <ol className="plan-list">
            {plan.slice(1).map((item, i) => (
              <li key={item.drill.name}>
                <button className="plan-item" onClick={() => setLesson(i + 1)}>
                  <span className="plan-rank">{i + 2}</span>
                  <span className="plan-text">
                    <strong>{item.title}</strong>
                    <span>
                      {item.drill.name}, {item.drill.reps}
                    </span>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
                {item.flaw && linked.why[item.flaw] && <p className="plan-why">{linked.why[item.flaw]}</p>}
              </li>
            ))}
          </ol>
          {suppressed && (
            <p className="plan-held">
              <Cue text={suppressed} />
            </p>
          )}
        </section>
      )}
      {(plan.length === 1 || !fullRead) && suppressed && (
        <p className="plan-held">
          <Cue text={suppressed} />
        </p>
      )}

      {/* The level, asked once on the first serve (N2.12): it orders the faults
          (arm before legs at club level and below), so it is asked where the
          order first shows, just under the first screen, and gone once told. */}
      {firstServe && !example && onPickTier && statedTier === undefined && !levelAnswered && isLive(analysis) && (
        <section className="level-ask" aria-label="Your level">
          <div className="levelled levelled--ask">
            <span className="levelled-text">{levelled ?? 'Fixes ordered for club level'}. Not your level?</span>
            <button className="levelled-btn" onClick={() => setAsking((v) => !v)} aria-expanded={asking}>
              {asking ? 'Close' : 'Change'}
              <Icon name="chevron" size={13} />
            </button>
          </div>
          {asking && (
            <LevelPicker
              value={statedTier}
              estimated={analysis.triage?.tier?.current}
              onChange={(tier) => {
                setLevelAnswered(true)
                onPickTier(tier)
              }}
            />
          )}
        </section>
      )}

      {againstBest && (
        <p className="against-best">
          <Cue text={againstBest} />
        </p>
      )}

      {self && self.usual.length + self.best.length > 0 && (
        <section className="own-read" aria-labelledby="own-title">
          <h2 className="t-headline" id="own-title">
            Compared with your usual serve
          </h2>
          <ul>
            {[...self.usual, ...self.best].map((f) => (
              <li key={f.metricId} className={`own-row own-row--${f.band}`}>
                <Icon name={f.band === 'towards' ? 'up' : f.band === 'away' ? 'warn' : 'progress'} size={18} />
                <span>
                  <Cue text={f.line} />
                  <small className="tnum">
                    {f.readout}. Usually: {f.referenceReadout.charAt(0).toLowerCase() + f.referenceReadout.slice(1)}.
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {besideModel && !showCompare && (
        <Locked feature="compare">
          <p>
            Your <strong>{focusPhase!.label.toLowerCase()}</strong>, set beside a model serve's at the same moment.
          </p>
          {best && best.id !== analysis.id && (
            <p>
              Your best so far scored <strong className="tnum">{best.overall}</strong>.
            </p>
          )}
        </Locked>
      )}
      {besideModel && showCompare && (
        <SideBySide
          swing={swing!}
          moment={focusMoment!}
          label={focusPhase!.label}
          work={work}
          racket={analysis.handedness}
          checks={momentChecks(analysis.fundamentals, focusMoment!)}
          best={best}
          last={previous}
        />
      )}

      {live && (
        <section className="watch" ref={playerRef} aria-labelledby="watch-title">
          <h2 className="t-headline" id="watch-title">
            Watch your serve
          </h2>
          <PosePlayer
            videoUrl={videoUrl!}
            analysis={analysis as Analysis}
            seek={seek}
            paired={ghost?.pair}
            tools={studio && Boolean(onMarks)}
            marks={marks}
            onMarks={onMarks}
          />
          {ghost && !analysis.tilt && (
            <p className="player-note">
              {ghost.who === 'best'
                ? 'The dashed outline is your best serve so far, lined up at the moment you hit the ball.'
                : 'The dashed outline is your last serve, lined up at the moment you hit the ball.'}
            </p>
          )}
        </section>
      )}

      {!live && kept && (
        <section className="watch" aria-labelledby="watch-title">
          <h2 className="t-headline" id="watch-title">
            Watch your serve
          </h2>
          <KeptVideo
            url={kept.url}
            phases={analysis.phases}
            aspect={analysis.video.width / Math.max(1, analysis.video.height)}
            marks={marks}
            others={(kept.others ?? []).map((o) => ({
              label: KEPT_LABEL[o.who](o.session.createdAt),
              url: o.url,
              phases: o.session.phases,
              aspect: o.session.video.width / Math.max(1, o.session.video.height),
            }))}
            four={showCompare}
            racket={analysis.handedness}
          />
          <p className="player-note">This video is saved on this {deviceNoun()}. It’s deleted with this report, or sooner if space runs short.</p>
        </section>
      )}

      {!live && !kept && replay && analysis.track && (
        <section className="watch" aria-labelledby="watch-title">
          <h2 className="t-headline" id="watch-title">
            Watch your serve
          </h2>
          <TrackPlayer
            track={analysis.track}
            replay={replay}
            phases={analysis.phases}
            racket={analysis.handedness}
            paired={ghost?.pair}
            bodyHeight={analysis.scale?.bodyHeight}
            fundamentals={analysis.fundamentals}
          />
          <p className="player-note">
            {keepsClips
              ? `This video wasn’t saved on your ${deviceNoun()}, so this is an outline of your body, moving as you filmed it.`
              : `Your video never left your ${deviceNoun()} and wasn’t saved, so this is an outline of your body, moving as you filmed it.`}
            {ghost
              ? ghost.who === 'best'
                ? ' The dashed outline is your best serve so far, lined up at the moment you hit the ball.'
                : ' The dashed outline is your last serve, lined up at the moment you hit the ball.'
              : ''}
          </p>
        </section>
      )}

      {example && !besideModel && (
        <section className="watch" aria-labelledby="model-title">
          <h2 className="t-headline" id="model-title">
            A model serve to watch
          </h2>
          <ModelServe racket={analysis.handedness} />
        </section>
      )}

      {analysis.serves && analysis.serves.count > 1 && (
        <section className="serves">
          <p className="serves-lead">
            Showing serve <strong>{analysis.serves.index + 1}</strong> of {analysis.serves.count} in this video.
          </p>
          {consistency && (
            <p className="serves-spread">
              <Cue text={consistencyHeadline(consistency)} />
            </p>
          )}
          {scoring && !consistency && (
            <div className="serves-scoring" style={SCORING_ROW}>
              <p className="serves-spread" role="status">
                {scoring.stopping
                  ? 'Stopping. I’ll compare the serves already scored.'
                  : `I’m scoring each serve in this clip to compare them, ${scoring.done} of ${scoring.total} done.`}
              </p>
              {onStopScoring && !scoring.stopping && (
                <button type="button" className="chip chip--button" onClick={onStopScoring} aria-label="Stop scoring the serves">
                  Stop
                </button>
              )}
            </div>
          )}
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

      {/* A guess and one tap, not a form. The app never sees the court, so where
          it landed stays the player's to say, and saying it is optional: folded
          to one line that says what is known, opened on a tap (2026-11-25). */}
      {(onTagServe || onTagOutcome) && (
        <details className="serve-tags" aria-label="What you said about this serve">
          <summary className="link-btn tag-summary">
            {serveTagSummary(serveNumber, outcome, serveGuess?.serveNumber)}
            <Icon name="chevron" size={16} />
          </summary>
          {onTagServe && (
            <div className="serve-tags-row">
              <span className="serve-tags-lead">Which serve</span>
              <div className="serve-tags-options">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    className={`serve-tag${serveNumber === n ? ' is-on' : ''}${serveNumber === undefined && serveGuess?.serveNumber === n ? ' is-guess' : ''}`}
                    aria-pressed={serveNumber === n}
                    onClick={() => onTagServe(serveNumber === n ? undefined : n)}
                  >
                    {SERVE_NUMBER_LABEL[n]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {serveNumber === undefined && serveGuess && <p className="serve-tags-guess">{guessLine(serveGuess)}</p>}
          {onTagOutcome && (
            <div className="serve-tags-row">
              <span className="serve-tags-lead">Where it landed</span>
              <div className="serve-tags-options">
                {SERVE_OUTCOMES.map((o) => (
                  <button
                    key={o}
                    className={`serve-tag${outcome === o ? ' is-on' : ''}`}
                    aria-pressed={outcome === o}
                    onClick={() => onTagOutcome(outcome === o ? undefined : o)}
                  >
                    {OUTCOME_LABEL[o]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </details>
      )}

      {/* The two moment names a club player is least likely to know, defined on a tap. */}
      <p className="terms-row">
        <span>Tap a word to see what it means:</span>
        <Term id="trophy" />
        <Term id="racketDrop" />
        <Term id="score" />
      </p>

      {fullRead ? (
        <details className="report-more" open={moreOpen} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="report-more-head">
            <span>Everything I measured</span>
            <Icon name="chevron" size={18} />
          </summary>
          <div className="report-more-body">
            {analysis.speed && 'miss' in analysis.speed && (
              <section className="speed-why" aria-label="Serve speed">
                <h2 className="block-title">Serve speed</h2>
                <p className="speed-range">{SPEED_MISS_LINE[analysis.speed.miss]}</p>
              </section>
            )}

            {analysis.serves && analysis.serves.count > 1 && onCheckConsistency && !consistency && !scoring && (
              <section className="serves-compare">
                <button className="btn btn--ghost btn--full" onClick={onCheckConsistency}>
                  <Icon name="target" size={16} />
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

            {tossMap && (
              <section className="block">
                <h2 className="block-title">{tossMap.axis === 'ahead' ? 'Your tosses, front to back' : 'Your tosses, side to side'}</h2>
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

            <section className="reading" aria-label="What I saw in this video">
              <h2 className="block-title">What I saw in this video</h2>
              <div className="reading-chips">
                {onFlipHandedness ? (
                  <button className="chip chip--button" onClick={onFlipHandedness} aria-label={`${analysis.handedness === 'right' ? 'Right-handed' : 'Left-handed'}. Tap if I got your hand wrong`}>
                    {analysis.handedness === 'right' ? 'Right-handed' : 'Left-handed'}
                    <Icon name="chevron" size={13} />
                  </button>
                ) : (
                  <span className="chip">{analysis.handedness === 'right' ? 'Right-handed' : 'Left-handed'}</span>
                )}
                <span className="chip">
                  {analysis.quality.view === 'side' ? 'Side view' : analysis.quality.view === 'front-back' ? 'Front / back view' : 'Angled view'}
                </span>
                <span className={`chip${analysis.quality.confidence < SOFT_READ ? ' chip--warn' : ''}`}>
                  {readQuality(analysis.quality.confidence)}
                </span>
                {analysis.diagnosis?.stance && (
                  <span className="chip">
                    <Term id="stance">{analysis.diagnosis.stance.kind === 'pinpoint' ? 'Pinpoint stance' : 'Platform stance'}</Term>
                  </span>
                )}
              </div>

              {unseenLines(analysis.diagnosis).map((line) => (
                <p key={line} className="reading-unseen">
                  {line}
                </p>
              ))}

              <div className="judged">
                <span className="t-overline judged-lead">Judged as</span>
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

              {levelled && (
                <div className="levelled">
                  <span className="levelled-text">{levelled}</span>
                  {onPickTier && (
                    <button className="levelled-btn" onClick={() => setPickingLevel((v) => !v)} aria-expanded={pickingLevel}>
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
                  {!isLive(analysis) && (
                    <p className="levelled-note">
                      The video for this report wasn’t saved, so I can’t score it again. Your new level applies from your next video.
                    </p>
                  )}
                </>
              )}
              {onGlance && (
                <button className="link-btn" onClick={onGlance}>
                  At a glance
                  <Icon name="chevron" size={13} />
                </button>
              )}
            </section>

            <section className="block">
              <h2 className="block-title">Every area I scored</h2>
              <div className="fcards">
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

            {!analysis.diagnosis?.firingOrder && analysis.diagnosis?.legLead && (
              <section className="block">
                <h2 className="block-title">
                  <Term id="firingOrder">Your legs and your arm</Term>
                </h2>
                <p className="reading-unseen">{legLeadLine(analysis.diagnosis.legLead)}</p>
              </section>
            )}

            {analysis.diagnosis?.firingOrder && (
              <section className="block">
                <h2 className="block-title">
                  <Term id="firingOrder">The order your body moved in</Term>
                </h2>
                <FiringTimeline chain={analysis.diagnosis.chain} order={analysis.diagnosis.firingOrder} />
              </section>
            )}
          </div>
        </details>
      ) : (
        <Locked feature="breakdown">
          {plan.length > 1 && (
            <p>
              <strong className="tnum">{plan.length - 1}</strong> more {plan.length === 2 ? 'fix' : 'fixes'} after this one, worst first.
            </p>
          )}
          <div className="locked-rows">
            {analysis.fundamentals.map((f) => (
              <Fragment key={f.id}>
                <span>{f.label}</span>
                <span className="tnum">{f.score}</span>
              </Fragment>
            ))}
          </div>
        </Locked>
      )}

      {/* Ground-truth fixtures, behind `?fixture`: no ordinary player meets this. */}
      {fixtureExport && isLive(analysis) && (
        <details className="report-more">
          <summary className="report-more-head">
            <span>Save as a test fixture</span>
            <Icon name="chevron" size={18} />
          </summary>
          <div className="report-more-body">
            <p className="note">Six clips clear the gate. Film them in this order; the first one matters most.</p>
            {FIXTURE_PLAN.map((f) => (
              <p className="note" key={f.n}>
                {f.n}. {f.what} {f.why}
              </p>
            ))}
            <button
              className="btn btn--ghost btn--full"
              onClick={() => void import('../dev/exportFixture').then((m) => setSaved(m.downloadFixture(analysis as Analysis)))}
            >
              Save as test fixture
            </button>
            {saved && (
              <>
                <p className="note">
                  Saved {saved.file}. {saved.gaps.length === 0 ? 'Nothing left to fill in.' : `${saved.gaps.length} things left before it counts as ground truth.`}
                </p>
                {saved.gaps.map((gap) => (
                  <p className="note" key={gap}>
                    {gap}
                  </p>
                ))}
              </>
            )}
          </div>
        </details>
      )}

      <p className="fineprint">
        {example
          ? 'Built from a simulated serve. Nothing on this page was measured from a video.'
          : isLive(analysis)
            ? `Measured on this device from ${analysis.frames.length} tracked frames. Nothing was uploaded.` +
              (keepFailed ? ` I couldn’t keep this video on the ${deviceNoun()}, so it won’t play here later.` : '')
            : kept
              ? `Measured on this device. Nothing was uploaded, and the video is kept on this ${deviceNoun()} only.`
              : keepsClips
                ? 'Measured on this device. Nothing was uploaded, and this video wasn’t kept.'
                : 'Measured on this device. Nothing was uploaded, and the video itself was never saved.'}
      </p>

      <div className="report-bar">
        {example ? (
          <button className="btn btn--primary btn--big report-bar-main" onClick={onAnalyzeAnother}>
            <Icon name="camera" size={20} />
            Film your serve
          </button>
        ) : (
          <>
            <button className="btn btn--primary btn--big report-bar-main" onClick={() => setLesson(0)}>
              Start the drill
            </button>
            <button className="round-btn" onClick={onAnalyzeAnother} aria-label="Film another serve">
              <Icon name="camera" size={22} />
            </button>
          </>
        )}
      </div>

      <Sheet open={lesson !== undefined} onClose={() => setLesson(undefined)} title={lesson !== undefined ? (plan[lesson]?.drill.name ?? first.drill.name) : ''}>
        {lesson !== undefined && plan[lesson] && (
          <DrillCard
            item={lesson === 0 ? { ...first, drill: firstDrill } : plan[lesson]}
            racket={analysis.handedness}
            ownGood={plan[lesson].flaw ? ownGoodLine(sessions, analysis, plan[lesson].flaw!) : undefined}
            check={lesson === 0 ? check : undefined}
            rung={rungOf(plan[lesson])}
            onLadderStep={onLadderStep}
            onFilmCheck={
              onFilmCheck && plan[lesson].flaw
                ? () => {
                    const item = plan[lesson]
                    setLesson(undefined)
                    onFilmCheck(item.flaw!, item.drill.name)
                  }
                : undefined
            }
            drilled={
              lesson === 0 && drilledCheck && drilledLadder && drilledRung >= 0 ? (
                <DrilledLine
                  check={drilledCheck}
                  rung={drilledRung}
                  steps={drilledLadder.steps.length}
                  stepName={drilledLadder.steps[drilledRung + 1]?.name}
                  onLadderStep={onLadderStep}
                />
              ) : undefined
            }
            season={
              lesson === 0 &&
              practice &&
              (practice.drill.name === firstDrill.name || practice.drill.name === first.drill.name || practice.label === first.title) ? (
                <PracticeCard focus={practice} onLogDrill={onLogDrill} onUndoDrill={practice.drilled ? onUndoDrill : undefined} sameAsFocus />
              ) : undefined
            }
          />
        )}
      </Sheet>

      {shareSheet}
    </div>
  )
}

/** The fault the player was drilling, when it has stopped being the first fix. */
function DrilledLine({
  check,
  rung,
  steps,
  stepName,
  onLadderStep,
}: {
  check: NonNullable<Analysis['drillCheck']>
  rung: number
  steps: number
  stepName?: string
  onLadderStep?: (flaw: string, step: number, from?: number) => void
}) {
  const [moved, setMoved] = useState(false)
  const name = FAULT_NAME[check.flaw]
  return (
    <div className="drill-check">
      <p>{moved ? `${name}: now on step ${rung + 2} of ${steps}, ${stepName}.` : `${name}, which you were drilling: ${drillCheckLine(check)}`}</p>
      {onLadderStep && !moved && check.outcome === 'passed' && rung < steps - 1 && (
        <button
          className="btn btn--ghost btn--full"
          onClick={() => {
            onLadderStep(check.flaw, rung + 1, rung)
            setMoved(true)
          }}
        >
          Move up a step
        </button>
      )}
    </div>
  )
}

/** What the held frame is stopped on, in words under it. */
function heldAt(phase: PhaseId): string {
  return phase === 'contact' ? 'Paused at contact' : phase === 'ready' ? 'Paused at the ready position' : `Paused at the ${PHASE_NAME[phase]}`
}

const PHASE_NAME: Record<PhaseId, string> = {
  ready: 'ready position',
  toss: 'toss',
  trophy: 'trophy',
  drop: 'racket drop',
  contact: 'contact',
  finish: 'finish',
}
