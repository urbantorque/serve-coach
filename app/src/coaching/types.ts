/**
 * Coaching engine contract (COACHING §7.1). Pure types; the engine imports only `analysis/types`.
 *
 * Inputs are structural: a session is a list of per-serve MetricValues plus the player's tags, so the
 * engine does not depend on how storage or the pipeline shape their records (the UI adapter in
 * `ui/screens/focus/useFocusDecision.ts` builds them from the data layer). `CoachingStratum` has the
 * same fields as the data layer's `StratumKey`, so the two are assignable both ways.
 */
import type {
  CameraSide,
  CameraView,
  CaptureSetup,
  EvidenceTier,
  FpsClass,
  Handedness,
  KeyFrameEvent,
  LevelBand,
  MetricId,
  MetricValue,
  QualityCheck,
  ServeNumber,
  ServeOutcome,
  ServePhase,
  ServeSide,
  ServeType,
} from '../analysis/types.ts'

export type { EvidenceTier } from '../analysis/types.ts'

/** COACHING §7.1: ARCHITECTURE 'utr-4-5' and 'utr-6-7' map to 'utr-4-7'; 'unknown' to 'utr-1-3'. */
export type CoachLevel = 'utr-1-3' | 'utr-4-7'
export type Goal = 'first-serves-in' | 'more-pace' | 'second-serve-reliability' | 'less-effort'
/** elbow = elbow or wrist; knee = hip, knee or ankle (COACHING §9.3). */
export type BodyRegion = 'shoulder' | 'elbow' | 'back' | 'knee' | 'other'
/** Requested profile field (§16 item 10); used only for the toss-drop band. */
export type Sex = 'male' | 'female' | 'not-given'
export type CoachingAgeBand = 'under-18' | '18-39' | '40-59' | '60-plus'
export type CueRegister = 'analogy' | 'outcome'
export type DrillVariant = 'base' | 'progression' | 'progression-alt' | 'regression'
/** METRICS §4.5 ids (= ARCHITECTURE VerdictWord). */
export type VerdictId =
  | 'clearly-better'
  | 'likely-better'
  | 'no-clear-change'
  | 'too-early'
  | 'likely-worse'
  | 'clearly-worse'
  | 'not-comparable'
export type ReferralLevel = 'emergency' | 'today' | 'stop-and-book'
export type Severity = 'none' | 'minor' | 'moderate' | 'major'

/** Today's pre-session body check (COACHING §10.1, §10.2). */
export type BodyCheck =
  | { answer: 'fine' }
  | { answer: 'sore'; regions: BodyRegion[] }
  /** "It hurts" with no red flag, or "A bit sore" + sharp/worse/night/lingering: Stop and book. */
  | { answer: 'pain' }
  | { answer: 'red-flag'; level: 'emergency' | 'today' }

export interface CoachingProfile {
  /** Data-layer band or coaching band. */
  level: LevelBand | CoachLevel
  /** Self-reported UTR, when given; below 4.0 is utr-1-3 (§9.1). */
  utr?: number
  goal: Goal
  /** Standing "areas to go easy on" (never a pain flag by itself). */
  comfortRegions: BodyRegion[]
  heightM: number
  sex?: Sex
  /** Coaching band, or the data layer's band ('18-plus' is treated as 18 to 59 until the adult band exists). */
  ageBand?: CoachingAgeBand | 'under-15' | '15-17' | '18-plus'
  handedness?: Handedness
  showExperimental: boolean
  /** "My coach's focus" (research 10 M8). */
  pinnedFocusItemId?: string
  /** The player swapped the cue register ("Try the other cue"). */
  cueRegister?: CueRegister
}

/** Hard matching key (METRICS §1.6, §4.4). Same fields as the data layer's StratumKey. */
export interface CoachingStratum {
  view: CameraView
  cameraSide: CameraSide | 'unknown'
  courtSide: ServeSide | 'unknown'
  serveNumber: ServeNumber | 'unknown'
  intendedType: ServeType | 'unknown'
  handedness: Handedness
  /**
   * The session's set-up key (orientation | distance class | serving spot; analysis/metrics/setup.ts).
   * Matching needs the same set-up (METRICS §1.6, §4.4); a missing key (older sessions) matches any.
   */
  setup?: string
}

export interface CoachingServe {
  id: string
  /** 1-based order in the session. */
  index?: number
  /** Counts toward statistics (not excluded by quality, plausibility or the player). */
  included: boolean
  /** Per-serve engine metrics. */
  metrics: Partial<Record<MetricId, MetricValue>>
  /** Player-entered outcome (D3). */
  outcome?: ServeOutcome
  courtSide?: ServeSide
  serveNumber?: ServeNumber
  intendedType?: ServeType
  /** CAPTURE block index; within-session comparisons never cross blocks. */
  block?: number
}

export interface TallyCounts {
  in: number
  total: number
  net?: number
  long?: number
  wide?: number
}

export interface CoachingSession {
  id: string
  /** ISO 8601. */
  startedAt: string
  view: CameraView
  cameraSide?: CameraSide
  handedness?: Handedness
  fpsClass: FpsClass
  setup?: CaptureSetup
  captureQuality: 'good' | 'usable' | 'poor'
  qualityChecks?: QualityCheck[]
  serves: CoachingServe[]
  /** Block card defaults for serves without their own tags. */
  defaults?: { courtSide?: ServeSide; serveNumber?: ServeNumber; intendedType?: ServeType }
  /** Session tally (D3) when serves were not tagged one by one. */
  tally?: { firstServes?: TallyCounts; secondServes?: TallyCounts; doubleFaults?: number }
  /** METRICS display values by stratum, used for evidence stats when present. */
  strata?: { key: CoachingStratum; metrics: Partial<Record<MetricId, MetricValue>> }[]
  /** METRICS session-level display values. */
  metrics?: Partial<Record<MetricId, MetricValue>>
  /** METRICS session flags (§6.5, §11). */
  flags?: { fatigue?: boolean; load?: boolean }
  bestServeId?: string
  representativeServeId?: string
  template?: string
  isDemo?: boolean
  /** The set-up key (StratumKey.setup). When absent it is read from the METRICS strata keys. */
  setupKey?: string
}

export interface CoachingExperiment {
  id: string
  itemId: string
  faultId: string
  startedSessionId: string
  /** ISO 8601 of the session that started it. */
  startedAt: string
  stratum: CoachingStratum
  fpsClass?: FpsClass
  cueRegister: CueRegister
  drillVariant: DrillVariant
  pinnedByCoach?: boolean
  /** Later matched re-tests only (§12.3). */
  retests: { sessionId: string; verdict: VerdictId; resolvedMet: boolean }[]
  status: 'active' | 'worked' | 'parked' | 'superseded'
}

/** The fields of a practice log that drive rules (COACHING §12.2). */
export interface PracticeLogSummary {
  date: string
  itemId?: string
  drillVariant?: DrillVariant
  successCriterionMet?: 'yes' | 'partly' | 'no'
  feel?: 'natural' | 'ok' | 'awkward'
  cueHelpful?: 'yes' | 'not-sure' | 'no'
  body?: 'fine' | 'sore' | 'pain'
  approxServes?: number
}

/** Serve counts for load guidance (§11). Match serves come from the morning-after log (§11.2). */
export interface LoadInput {
  /** Serves in the last 7 days (recorded + drill + warm-up + logged match serves). */
  last7Days?: number
  /** Weekly mean over days 8 to 35 (METRICS §4.8, uncoupled). */
  chronicWeeklyMean?: number
  /** Days of history available and sessions recorded (the ramp needs 28 days and 3 sessions). */
  historyDays?: number
  sessionsInHistory?: number
  /** Days since the last logged serves. */
  daysSinceLastServes?: number
  /** Weekly average before a break, for the return-after-break guidance. */
  previousWeeklyAverage?: number
  /** Guided serves so far today. */
  servesToday?: number
  /** Guided serves yesterday, for the spacing note (a comp night counts as a big day). */
  servesYesterday?: number
}

export type FpsClassNumber = 30 | 60 | 120

export interface VerdictSide {
  sessionIds: string[]
  /** Per-serve values in the matched stratum, grouped by session (centres and spreads). */
  bySession?: number[][]
  /** Rates: serves in and tagged serves over the side. */
  k?: number
  n?: number
  /**
   * Per-serve random error (1 sigma) for the spread noise correction (METRICS §4.2): the root mean
   * square of the engine's per-serve σ_r over this side's serves, so a one-session side corrects
   * exactly as that session's own spread does (the canonical session value).
   */
  sigmaR?: number
  /** The engine's per-serve σ_r, grouped like bySession (for the stratified bootstrap). */
  sigmaRBySession?: number[][]
  /** Shared per-session scale error sigma_s (METRICS §1.2). */
  sigmaShared?: number
}

/** METRICS §4.5 inputs. Built by experiment.ts from the locked stratum; judged by a VerdictFn. */
export interface VerdictRequest {
  metricId: MetricId
  kind: 'centre' | 'spread' | 'rate'
  direction: 'decrease' | 'increase' | 'target-band'
  /** Target band for target-band metrics (toss drop: 0 to the sex-specific high edge). */
  band?: [number, number]
  baseline: VerdictSide
  followUp: VerdictSide
  /** Within-session mode (display only in coaching; never decides anything, §12.3). */
  sameSession: boolean
  nearMeasurementLimit?: boolean
  /** Set when the pair cannot be compared (unmatched, band, experimental, deleted baseline). */
  notComparableReason?: string
}

export interface VerdictResult {
  verdict: VerdictId
  /** Effect in goodness units (positive = better). */
  delta?: number
  low?: number
  high?: number
  moreServes?: number
  /** "More than 150 serves" message applies. */
  tooSmallToConfirm?: boolean
  /** Which implementation produced it. */
  method: string
  reason?: string
}

/** METRICS §4.5 verdict, injected from `analysis/stats` (coaching adds no verdict rules of its own). */
export type VerdictFn = (req: VerdictRequest) => VerdictResult

export interface CoachingInput {
  profile: CoachingProfile
  /** The session just analysed. */
  session: CoachingSession
  /** Earlier sessions, any order; the engine uses only matched ones (same stratum, never mixed views). */
  history?: CoachingSession[]
  activeExperiment?: CoachingExperiment
  /** Practice logs for the active experiment (newest last). */
  practiceLogs?: PracticeLogSummary[]
  bodyCheck?: BodyCheck
  /** ProfileRecord.comfort.painFlag: a referral is still unresolved. */
  painFlag?: boolean
  /** Level of the unresolved referral, when known. */
  activeReferral?: ReferralLevel
  matchDay?: boolean
  /** Sessions left on cooldown, by item id (§7.4). */
  cooldowns?: Record<string, number>
  load?: LoadInput
  verdict?: VerdictFn
  /** ISO 8601 "now" (tests pass a fixed value). */
  now?: string
}

// ---------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------

export type ConsideredReason =
  | 'later-stage'
  | 'smaller-gap'
  | 'not-clear-yet'
  | 'possible-only'
  | 'comfort-setting'
  | 'age-rule'
  | 'needs-more-serves'
  | 'needs-more-sessions'
  | 'not-in-frame'
  | 'experimental-off'
  | 'other-view'
  /** Addition: the item needs 60 fps (rhythm and pause timing). */
  | 'needs-higher-fps'
  /** Addition: the item is resting after a finished or parked experiment (§7.4). */
  | 'on-cooldown'
  /** Addition: the "slipped" rule fired at severity minor (§6.4); shown, never the focus. */
  | 'slipped'

/** What the engine found for each library item: the "Why?" and "Also noticed" lists. */
export interface ItemCheck {
  itemId: string
  title: string
  status: 'focus' | 'eligible' | 'in-range' | ConsideredReason | 'not-applicable'
  /** One plain sentence without metric numbers (numbers go through `metric`). */
  text: string
  /** A value to render with MetricValue beside the sentence. */
  metric?: { metricId: MetricId; value: MetricValue }
}

export interface RankReason {
  kind: 'pinned' | 'experiment' | 'stage' | 'detection' | 'outcome' | 'goal' | 'relative' | 'fatigue' | 'coach-note'
  text: string
  metric?: { metricId: MetricId; value: MetricValue }
  /** A player-entered count shown as text ("7 of 10 misses"); render with a "You logged" chip. */
  playerEntered?: boolean
}

export interface CueChoice {
  id: string
  text: string
  register: CueRegister
  /** "Try the other cue". Absent for the second-serve outcome cue's pair when identical. */
  other: { register: CueRegister; text: string }
}

export interface DrillChoice {
  id: string
  itemId: string
  variant: DrillVariant
  name: string
  minutes: number
  setup: string
  steps: string[]
  successCriterion: string
  /** Target count parsed from the success criterion ("15 of 20"), for the drill player's counter. */
  counter?: { target: number; of: number; label: string }
  regression: string
  /** The harder version, when unlocked and allowed (§9.1, §12.2). */
  progression?: { text: string; label: 'coaches-differ' | null; variant: 'progression' | 'progression-alt' }
  /** Why the harder version is not offered. */
  progressionLocked?: 'needs-two-logs' | 'paused-sore' | 'level-or-comfort'
  note?: string
  optionalAid?: string
  /** Comfort adjustments that apply today (COACHING §9.3). */
  comfortNotes: string[]
  tossOnlyReps: number
  /** Serves the drill uses, for the practice log and load count. */
  approxServes: number
}

export interface EvidenceStat {
  metricId: MetricId
  value: MetricValue
}

export interface FocusEvidence {
  keyFramePhase: ServePhase | null
  keyFrameEvent: KeyFrameEvent | null
  /** Representative serve (§8.1). */
  keyServeId?: string
  compareTo: 'best-serve' | 'previous-session' | 'none'
  compareServeId?: string
  compareSessionId?: string
  overlay: string
  /** 1 or 2 stats; measured, estimated or player-entered only (§8.2). */
  stats: EvidenceStat[]
  viewNote?: string
  outcomeLine: 'association' | 'no-clear-difference' | 'none'
  outcomeSentence?: string
}

export interface LoadGuidance {
  /** Guided serves per session (warm-up + recorded + drill + transfer). */
  sessionBudget: number
  /** Near-max-effort serves; 0 with shoulder, elbow or other comfort settings. */
  hardServeCap: number
  notes: { id: 'budget' | 'ramp' | 'return' | 'fatigue' | 'spacing' | 'sore' | 'budget-reached'; text: string }[]
}

export interface RetestPlan {
  serves: { min: number; max: number }
  /** Plain words: "deuce first serves, side view". */
  stratumText: string
  text: string
}

export interface TraceEntry {
  step: 'safety' | 'age' | 'match-day' | 'data' | 'pinned' | 'experiment' | 'candidate' | 'rank' | 'select' | 'cue' | 'drill'
  itemId?: string
  passed: boolean
  detail: string
}

export interface ReferralCopy {
  level: ReferralLevel
  title: string
  body: string[]
  /** healthdirect line for "today" (number to verify before release). */
  helpline?: { label: string; tel: string }
  call000?: boolean
  actions: ('call-000' | 'ok' | 'remind-3-days')[]
}

export interface WarmUpRoutine {
  itemId: 'warm-up-routine'
  title: string
  minutes: number
  setup: string
  steps: string[]
  closing: string
  maxServes: number
  comfortNotes: string[]
}

interface DecisionBase {
  sessionId: string
  createdAt: string
  libraryVersion: string
  engineVersion: string
  trace: TraceEntry[]
  /** Safety lines that apply to anything shown (pain rule, soreness). */
  safetyNotes: string[]
  /** Plain context lines (baseline still building, library range). */
  notes: string[]
}

export interface NotAvailableDecision extends DecisionBase {
  kind: 'not-available'
  reason: 'under-18'
  message: string
}

export interface ReferralDecision extends DecisionBase {
  kind: 'referral'
  level: ReferralLevel
  copy: ReferralCopy
}

export interface MatchDayDecision extends DecisionBase {
  kind: 'match-day'
  itemId: string
  cue: CueChoice
  routine: WarmUpRoutine
  message: string
}

export interface CaptureFixDecision extends DecisionBase {
  kind: 'capture-fix'
  issueId: string
  message: string
  fix?: string
  usableServes: number
  captureQuality: 'good' | 'usable' | 'poor'
}

export interface KeepGoingDecision extends DecisionBase {
  kind: 'keep-going'
  itemId: 'keep-going'
  title: string
  stratum: CoachingStratum
  whyItMatters: string
  cue: CueChoice
  drill: DrillChoice
  effectiveTier: EvidenceTier
  checks: ItemCheck[]
  /** "Your comfort settings rule out today's main candidates…" */
  comfortLine?: string
  /** Pinned coach's focus was ruled out by comfort. */
  pinnedRuledOut?: boolean
  load: LoadGuidance
  /** A finished, parked or superseded experiment that led here (§12.5). */
  experiment?: FocusDecision['experiment']
  verdict?: FocusDecision['verdict']
}

export interface FocusDecision extends DecisionBase {
  kind: 'focus'
  itemId: string
  faultId: string
  title: string
  phase: ServePhase | null
  chainStage: number | null
  stratum: CoachingStratum
  cue: CueChoice
  drill: DrillChoice
  whyItMatters: string
  effectiveTier: EvidenceTier
  wording: 'likely' | 'possible'
  severity: Severity
  pinnedByCoach: boolean
  /** False for a pinned coach's focus that this recording cannot measure. */
  measurable: boolean
  evidence: FocusEvidence
  reasons: RankReason[]
  alsoConsidered: ItemCheck[]
  checks: ItemCheck[]
  retest: RetestPlan
  load: LoadGuidance
  /** Present when this session was a later re-test of the active experiment (matched or not). */
  verdict?: VerdictResult & { copy: string; metricId: MetricId; rate: boolean }
  /** What happens to the active experiment (§12.5), including a superseded or finished one. */
  experiment?: {
    id: string
    itemId: string
    status: CoachingExperiment['status'] | 'continue'
    copy: string
    variant?: DrillVariant
    swapCue?: boolean
    unlockProgression?: boolean
    cooldownSessions?: number
  }
  /** "Straight after practice" block comparison (display only, never a verdict, §12.3). */
  sameSession?: { metricId: MetricId; before: MetricValue; after: MetricValue; copy: string }
  /** Re-test timing for the active experiment on this item (§12.3). */
  retestDue?: { state: 'practise-first' | 'ready' | 'overdue'; practices: number; dueBy?: string; text: string }
  /** Practice-log rules (§12.2) that the card should surface. */
  logHints: { suggestRegression: boolean; suggestOtherCue: boolean; progressionUnlocked: boolean }
  detectionConfidence: number
  outcomeGap: number
}

export type CoachingDecision =
  | NotAvailableDecision
  | ReferralDecision
  | MatchDayDecision
  | CaptureFixDecision
  | KeepGoingDecision
  | FocusDecision
