/**
 * Domain types for engine output, statistics, experiments and coaching (ARCHITECTURE §6.2 to §6.5).
 *
 * They build on the shared contract in `analysis/types.ts` and are defined here, in the data layer,
 * until the engine modules that own them (`analysis/serve`, `analysis/pipeline`, `coaching/`) land.
 * When they do, those modules should export these same shapes and this file should re-export them,
 * so UI and storage code keeps importing from `data/domain`.
 */
import type {
  AudioOnset,
  Band,
  CameraOrientation,
  CameraSide,
  CameraView,
  CaptureSetup,
  Estimate,
  EventEstimate,
  EvidenceTier,
  FpsClass,
  Handedness,
  KeyFrameEvent,
  MetricId,
  MetricValue,
  PhaseSpan,
  PoseFrame,
  QualityReport,
  ReasonCode,
  ServeEvents,
  ServeNumber,
  ServeOutcome,
  ServePhase,
  ServeSide,
  ServeType,
  SessionMode,
  TargetZone,
  TiltStatus,
  VideoMeta,
} from '../analysis/types.ts'

export type * from '../analysis/types.ts'

// ---------- §6.2 pipeline and serve finding ----------

/** Normalised to the displayed frame. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ServeCandidate {
  tAnchor: number
  anchor: 'audio-contact' | 'pose-arm-run'
  score: number
  cues: Array<'audio-contact' | 'toss-arm' | 'ball-above-head' | 'motion'>
  kind: 'serve' | 'toss-only' | 'uncertain'
  playerBox: Rect
}

export interface ServeWindow {
  index: number
  startFrame: number
  endFrame: number
  coreStartFrame: number
  coreEndFrame: number
  roi: Rect
  candidate: ServeCandidate
}

export type AnalysisStage = 'probe' | 'audio' | 'sparse' | 'dense' | 'keyframes' | 'session' | 'done'

export type AnalysisErrorCode =
  | 'unsupported-codec' | 'probe-failed' | 'too-long' | 'storage-full' | 'no-webgl'
  | 'pose-init-failed' | 'decoder-reclaimed' | 'cancelled' | 'internal'
  /** Pass A found no serve (PRODUCT §6.4 "We couldn't find a serve in this video"). Added by engine-pipeline. */
  | 'no-serves'

export interface AnalysisProgress {
  jobId: string
  stage: AnalysisStage
  /** Plain-English, specific ("Tracking the toss (serve 3 of 9)"). */
  label: string
  /** 0..1, monotonic. */
  overall: number
  servesFound?: number
  servesDone?: number
  /** Omitted until >= 5 s of throughput data. */
  etaS?: number
}

// ---------- §6.3 ServeAnalysis ----------

export interface EngineStamp {
  engineVersion: string
  contract: 1
  catalogueVersion: string
  poseModel: string
  poseBackend: 'gpu' | 'cpu' | 'apple-vision'
  decodePath: 'webcodecs' | 'media-element' | 'native'
  analysedAt: string
  durationMs: number
  paramsHash: string
  bandsVersion: string
  device?: string
}

export interface RectificationInfo {
  status: TiltStatus
  source: 'motion-sensor' | 'native-attitude' | 'none' | 'mount-answer'
  orientation: CameraOrientation
  fovDeg: number
  fovSource: 'intrinsics' | 'videoFieldOfView' | 'lens-default'
  pitchDeg?: Estimate
  rollDeg?: Estimate
  yawDeg?: Estimate
}

/** Compact pose for overlays and re-computation. Typed arrays store natively in IndexedDB. */
export interface PoseTrackCompact {
  frameIndices: Int32Array
  tReal: Float64Array
  /** frames x 33 x (x, y, visibility); NaN where absent. */
  xyv: Float32Array
  flags: Uint8Array
  source: PoseFrame['source']
  frameAspect: number
  bodyHeightHU: number
  pitchDeg: Float32Array
  rollDeg: Float32Array
}

export interface BallTrackCompact {
  frameIndices: Int32Array
  tReal: Float64Array
  x: Float32Array
  y: Float32Array
  r: Float32Array
  score: Float32Array
  /** 0 toss, 1 outgoing, 2 bounce, 3 unknown */
  kind: Uint8Array
  /** 1 = gap-filled prediction, not a detection */
  predicted: Uint8Array
  tossFit?: { a: number; b: number; c: number; rmse: number; tStart: number; tEnd: number }
}

export interface ServeDetection {
  confidence: number
  cues: ServeCandidate['cues']
  kind: ServeCandidate['kind']
  anchor: ServeCandidate['anchor']
}

export interface TossSummary {
  release: EventEstimate
  apex: EventEstimate & { bracketed: boolean; aboveFrame: boolean; extrapolated: boolean; aboveTopM?: Estimate }
  apexXY: { x: number; y: number }
  /** Stature units (dimensionless). */
  apexAboveGroundBH?: Estimate
  /** + = into the court (side view only). */
  apexForwardOfToeBH?: Estimate
  /** + = hitting-arm side (rear view only). */
  apexLateralBH?: Estimate
  dropApexToContactBH?: Estimate
  gravity: { status: 'ok' | 'unavailable'; plausible?: boolean; timeScaleFactor?: number; apparentGravityMps2?: number }
  fitRmseNorm: number
  detections: number
}

export interface ContactSummary {
  event: EventEstimate
  ballXY?: { x: number; y: number }
  wristXY?: { x: number; y: number }
  heightOverStature?: Estimate
  forwardOfToeBH?: Estimate
  methodSpreadMs?: number
}

/** Side view, rectified mid-hip trajectory. No 2D knee angle is computed here. */
export interface LegDriveSummary {
  lowestHip: EventEstimate
  /** loading-depth: release -> lowest point, % of height; descriptive only. */
  hipDropPctH?: Estimate
  /** leg-drive: lowest point -> contact, % of height. */
  hipRisePctH?: Estimate
  /** drive-time: lowest hip -> contact. */
  driveTimeMs?: Estimate
  peakHipSpeedMps?: Estimate
  airborneAtContact?: boolean
  /** deep-bend-flag (experimental); never "little bend". */
  deepBend?: { flag: boolean; probability: number }
}

/** Side view, at the trophy position. Replaces the removed trunk-tilt-band summary. */
export interface ShoulderSummary {
  /** Rectified shoulder line vs horizontal; NEVER displayed (D5). */
  trophyTilt2DDeg?: Estimate
  sideBend2DDeg?: Estimate
  /** Per-serve band against the player's reference; never against published trunk angles. */
  band?: Band
  bandConfidence: number
}

/** Rear view only. Angles are never displayed. */
export interface RearBandsSummary {
  knee?: { flexion2DDeg: Estimate; band?: Band; bandConfidence: number }
  shoulderOverShoulder?: { atContact2DDeg: Estimate; band?: Band; bandConfidence: number }
}

export interface LandingSummary {
  event: EventEstimate
  foot: 'front' | 'back' | 'both' | 'unknown'
  forwardOfSetupToeBH?: Estimate
  footPoint: 'heel-toe' | 'ankle-corrected'
}

/** Experimental only (D4). There is no audio flight-time method. */
export interface SpeedSummary {
  metricId: 'speed-experimental' | 'speed-average-rear'
  quantity: 'launch-near-contact' | 'average-contact-to-bounce'
  method: 'track-side' | 'flight-rear-located-bounce'
  targetTag?: TargetZone
  lowKmh: number
  highKmh: number
  assumptions: string[]
}

export interface CourtCalibration {
  id: string
  frameIndex: number
  imagePoints: { x: number; y: number }[]
  courtKeypoints: string[]
  H: [number, number, number, number, number, number, number, number, number]
  reprojectionRmsPx: number
  source: 'tap' | 'auto'
}

export interface ServeAnalysis {
  schemaVersion: 1
  id: string
  sessionId: string
  videoId: string
  /** 1-based order in the session. */
  index: number
  mode: SessionMode
  view: CameraView
  handedness: Handedness
  window: { startFrame: number; endFrame: number; tStartReal: number; tEndReal: number }
  detection: ServeDetection
  events: ServeEvents
  phases: PhaseSpan[]
  rectification: RectificationInfo
  toss: TossSummary | null
  contact: ContactSummary | null
  legDrive: LegDriveSummary | null
  shoulder: ShoulderSummary | null
  rear: RearBandsSummary | null
  landing: LandingSummary | null
  /** Contact timing only (D4). */
  audio: { usable: boolean; reason?: string; contact?: AudioOnset }
  speed: SpeedSummary | null
  /** Per-serve metrics; session-level ids are absent here. */
  metrics: Partial<Record<MetricId, MetricValue>>
  quality: QualityReport
  plausibility: { hardRejects: string[]; softFlags: string[] }
  /** Counts toward session statistics. */
  included: boolean
  exclusions: ReasonCode[]
  keyFrames: Partial<Record<KeyFrameEvent, { thumbId: string; evidenceId?: string }>>
  engine: EngineStamp
}

// ---------- §6.4 SessionAnalysis and SessionStats ----------

export interface StageTimings {
  probeMs: number
  audioMs: number
  sparseMs: number
  denseMs: number
  keyFramesMs: number
  sessionMs: number
  totalMs: number
  framesDecoded: number
  poseFrames: number
  ballFrames: number
}

export interface CaptureSummary {
  meta: VideoMeta
  quality: QualityReport
  fpsClass: FpsClass
  setup: CaptureSetup
  rectification: RectificationInfo
  frameTopM?: Estimate
  bodyPx?: number
  scale: { bodyHeightHU: number; source: 'setup-frames' | 'median-serves'; heightM?: number; metresPerHU?: Estimate }
  handedness: { profile: Handedness; inferred?: Handedness; confidence?: number; agrees: boolean }
  facing?: 'front' | 'back' | 'left' | 'right' | 'unknown'
  calibration?: CourtCalibration
}

export interface SessionAnalysis {
  schemaVersion: 1
  sessionId: string
  videoIds: string[]
  mode: SessionMode
  view: CameraView
  capture: CaptureSummary
  counts: {
    candidates: number
    tossOnly: number
    analysed: number
    included: number
    excluded: number
    exclusionsByReason: Partial<Record<ReasonCode, number>>
  }
  serveIds: string[]
  engine: EngineStamp
  timings: StageTimings
}

/** Hard matching key (METRICS §1.6, §4.4). */
export interface StratumKey {
  view: CameraView
  cameraSide: CameraSide | 'unknown'
  courtSide: ServeSide | 'unknown'
  serveNumber: ServeNumber | 'unknown'
  intendedType: ServeType | 'unknown'
  handedness: Handedness
  /**
   * Addition: the set-up key `${orientation}|${distanceClass}|${servingSpot}` (METRICS §1.6, §4.4:
   * set-up class is a matching key; analysis/metrics/setup.ts). Absent on sessions analysed before it
   * existed, where matching falls back to the session record.
   */
  setup?: string
}

export interface SoftFactors {
  fpsClass: FpsClass
  setup: CaptureSetup
  tiltStatus: TiltStatus
  captureQuality: 'good' | 'usable' | 'poor'
  engineMajor: number
}

export interface StratumStats {
  key: StratumKey
  n: number
  nTotal: number
  metrics: Partial<Record<MetricId, MetricValue>>
}

/** METRICS §4.7. At most one is surfaced per session. */
export interface OutcomeLink {
  metricId:
    | 'toss-forward' | 'toss-apex-height' | 'toss-drop' | 'contact-height-ratio'
    | 'contact-forward' | 'rhythm-release-to-contact' | 'landing-distance'
  stratum: StratumKey
  inGroup: { n: number; mean: number }
  faultGroup: { n: number; mean: number }
  difference: { value: number; low99: number; high99: number }
  swc: number
  ratioToSwc: number
  unit: string
  /** Association wording, never a cause. */
  sentence: string
}

/** Pure function of serves + tags + tallies + profile + settings; recomputed when inputsHash changes. */
export interface SessionStats {
  sessionId: string
  inputsHash: string
  computedAt: string
  /** Session-level, with n / nEligible / intervals. */
  metrics: Partial<Record<MetricId, MetricValue>>
  strata: StratumStats[]
  outcomeLink: OutcomeLink | null
  outcomeLinkChecks: { metricId: MetricId; ratioToSwc?: number; passed: boolean; reason?: ReasonCode }[]
  derivedPerServe: Record<string, Partial<Record<MetricId, MetricValue>>>
  bestServeId?: string
  representativeServeId?: string
  /** One or two sentence headline (COACHING/PRODUCT templates; DESIGN §10.6 length rules). */
  headline?: string
  /** Addition: METRICS §1.1 set-up class, the set-up key (StratumKey.setup) and the median camera distance. */
  setupClass?: 'portrait-near' | 'landscape-fence' | 'landscape-near' | 'rear'
  setupKey?: string
  cameraDistanceM?: number
}

// ---------- §6.5 comparisons, experiments and coaching ----------

/**
 * Verdict ids. METRICS §4.5 ids plus the COACHING §12.4 spellings (DESIGN §15 flag 2); the UI maps
 * every spelling to one display vocabulary (DESIGN §3.5).
 */
export type VerdictWord =
  | 'clearly-better' | 'likely-better' | 'no-clear-change' | 'too-early'
  | 'likely-worse' | 'clearly-worse' | 'not-comparable'
  | 'clear-improvement' | 'clear-decline' | 'too-early-to-tell'

export interface MatchedComparison {
  metricId: MetricId
  matchedOn: StratumKey
  softFactors: { baseline: SoftFactors; current: SoftFactors; notes: string[] }
  baseline: { sessionIds: string[]; n: number; value: number; low: number; high: number }
  current: { sessionIds: string[]; n: number; value: number; low: number; high: number }
  difference: { value: number; low: number; high: number }
  probabilityImproved?: number
  verdict: VerdictWord
  moreServesToConfirm?: number
  notes: ReasonCode[]
  caveats: string[]
}

export interface Experiment {
  id: string
  createdAt: string
  status: 'active' | 'completed' | 'abandoned'
  decisionId: string
  faultId: string
  cueId: string
  drillId: string
  primaryMetricId: MetricId
  secondaryMetricIds: MetricId[]
  direction: 'decrease' | 'increase'
  stratum: StratumKey
  baselineSessionIds: string[]
  retestSessionIds: string[]
  result?: MatchedComparison & { computedAt: string }
  /** Set when a baseline session was deleted; the verdict becomes not-comparable. */
  baselineDeleted?: boolean
}

export interface RuleTraceEntry {
  step: 'safety' | 'confidence' | 'candidate' | 'chain-order' | 'outcome-gap' | 'goal' | 'select' | 'cue' | 'drill'
  faultId?: string
  passed: boolean
  detail: string
}

export interface CoachingDecision {
  id: string
  sessionId: string
  createdAt: string
  libraryVersion: string
  engineVersion: string
  gate: 'pain-referral' | 'low-confidence' | 'too-few-serves' | 'ok'
  focus?: { faultId: string; title: string; phase: ServePhase; evidenceTier: EvidenceTier; whyChosen: string }
  evidence?: {
    event: KeyFrameEvent
    keyFrameId: string
    compareKeyFrameId?: string
    metricIds: MetricId[]
    sentences: string[]
  }
  cue?: { id: string; text: string; style: 'analogy' | 'external-target' }
  drill?: { id: string; title: string; minutes: number; steps: string[]; equipment: string[] }
  referral?: { message: string }
  /**
   * Integration addition: a capture-fix decision's player-facing reason and next step (COACHING
   * DECISION_COPY), so Today and the report can say why there is no focus and what to film next.
   */
  captureFix?: { message: string; fix?: string; usableServes: number }
  alternatives: { faultId: string; reason: string }[]
  trace: RuleTraceEntry[]
  phrasing: { source: 'template' | 'on-device-llm' | 'cloud-llm'; model?: string; consentVersion?: string }
}

// ---------- §6.6 validation annotation ----------

export type AnnotatedEvent =
  | 'motionStart' | 'tossRelease' | 'tossApex' | 'trophyStart' | 'trophyEnd' | 'lowestHip' | 'contact' | 'landing'
export type AnnotatedPoint =
  | 'ballAtApex' | 'ballAtContact' | 'frontToeSetup' | 'frontToeLanding' | 'headTopSetup' | 'floorSetup'
  | 'midHipLowest' | 'midHipContact' | 'netPostTop' | 'netPostBase'

export interface ServeAnnotation {
  id: string
  sessionId: string
  videoId: string
  serveId?: string
  annotator: string
  createdAt: string
  tool: 'in-app@1'
  captureFps: number
  setup?: { setup: CaptureSetup; distanceFromCentreMarkM?: number; phoneHeightM?: number; pitchDegLevel?: number }
  events: Partial<Record<AnnotatedEvent, { frameIndex: number; sure: boolean }>>
  points: Partial<Record<AnnotatedPoint, { frameIndex: number; x: number; y: number }>>
  bands?: { shoulderTiltTrophy?: Band; knee?: Band; shoulderOverShoulder?: Band }
  outcome?: ServeOutcome
  reference?: { radarKmh?: number; radarDevice?: string; tapeLandingM?: number; poleApexM?: number }
  notes?: string
}
