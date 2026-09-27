/**
 * Analysis engine contract (v0). Shared by video decode, pose, ball tracking,
 * serve segmentation, metrics, coaching and UI. Extend, don't break: add optional
 * fields rather than renaming. All times are in REAL seconds (capture time) unless
 * the name says `Media` (container/playback time). Image coordinates are normalised
 * to [0,1] with origin top-left in the displayed (rotation-corrected) frame.
 */

export type Handedness = 'right' | 'left'
export type CameraView = 'side' | 'rear' | 'front45' | 'unknown'

export interface VideoMeta {
  fileName: string
  mimeType?: string
  codec?: string
  durationMediaS: number
  width: number // displayed width after rotation
  height: number // displayed height after rotation
  rotationDeg: 0 | 90 | 180 | 270
  hasAudio: boolean
  /** Frame rate implied by container timestamps (media time). */
  nominalFps: number
  /** Best estimate of the true capture frame rate (e.g. 240 for slo-mo originals). */
  captureFps: number
  /** Real seconds per media second. 1 for normal clips; 0.125 for 240fps rendered as 30fps slo-mo. */
  timeScale: number
  fpsSource: 'container' | 'timestamps' | 'user' | 'physics'
  isVariableFrameRate: boolean
  frameCount: number
  // ---- v1 additions (ARCHITECTURE §6.1), all optional ----
  /** From assessTimeBase(): 'proven' only with >=100 fps timestamps, an Android capture-fps key, or a gravity proof. */
  timeBaseStatus?: 'proven' | 'unknown'
  timeBaseKind?: 'normal' | 'native-high-fps' | 'metadata-time-scaled' | 'possible-rendered-slomo'
  /** Piecewise-linear media->real map for rendered slow motion with 1x ramps. */
  timeMap?: { tMedia: number; tReal: number }[]
  codedWidth?: number
  codedHeight?: number
  decodePath?: 'webcodecs' | 'media-element' | 'native'
  /** Container creation time (ISO 8601) when present; used as the session start time. */
  createdAt?: string
}

export interface DecodedFrame {
  index: number
  tMedia: number
  tReal: number
  /** RGBA pixels at analysis resolution. */
  image: ImageDataLike
}

/** Minimal ImageData shape so pure-TS modules can run in Node tests. */
export interface ImageDataLike {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** BlazePose / MediaPipe 33-landmark topology. */
export enum LM {
  NOSE = 0, LEFT_EYE_INNER = 1, LEFT_EYE = 2, LEFT_EYE_OUTER = 3,
  RIGHT_EYE_INNER = 4, RIGHT_EYE = 5, RIGHT_EYE_OUTER = 6,
  LEFT_EAR = 7, RIGHT_EAR = 8, MOUTH_LEFT = 9, MOUTH_RIGHT = 10,
  LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12, LEFT_ELBOW = 13, RIGHT_ELBOW = 14,
  LEFT_WRIST = 15, RIGHT_WRIST = 16, LEFT_PINKY = 17, RIGHT_PINKY = 18,
  LEFT_INDEX = 19, RIGHT_INDEX = 20, LEFT_THUMB = 21, RIGHT_THUMB = 22,
  LEFT_HIP = 23, RIGHT_HIP = 24, LEFT_KNEE = 25, RIGHT_KNEE = 26,
  LEFT_ANKLE = 27, RIGHT_ANKLE = 28, LEFT_HEEL = 29, RIGHT_HEEL = 30,
  LEFT_FOOT_INDEX = 31, RIGHT_FOOT_INDEX = 32,
}

export interface Landmark {
  x: number
  y: number
  z?: number
  /** 0..1 model visibility/presence; 0 when interpolated across a gap. */
  visibility: number
  interpolated?: boolean
}

export interface PoseFrame {
  frameIndex: number
  tReal: number
  landmarks: Landmark[] | null
  worldLandmarks?: { x: number; y: number; z: number }[] | null
  score: number
  source: 'mediapipe' | 'injected' | 'apple-vision'
  /** v1 addition (ARCHITECTURE §6.1): tracker state for this frame. */
  track?: {
    confidence: number
    reason: 'acquired' | 'continued' | 'reacquired' | 'lost' | 'no-candidates'
    candidates: number
  }
}

export interface BallObservation {
  frameIndex: number
  tReal: number
  x: number
  y: number
  radius: number // normalised to frame height
  score: number
  source: 'detected' | 'predicted' | 'injected'
}

export interface BallTrack {
  id: number
  kind: 'toss' | 'outgoing' | 'bounce' | 'unknown'
  observations: BallObservation[]
  /** Quadratic fit y(t) = a t^2 + b t + c (normalised units, real seconds), when applicable. */
  fit?: { a: number; b: number; c: number; rmse: number; tStart: number; tEnd: number }
}

export interface AudioOnset {
  tReal: number
  strength: number
  sharpness: number
  kind: 'contact' | 'bounce' | 'unknown'
  // ---- v1 additions (ARCHITECTURE §6.1), all optional ----
  tMedia?: number
  riseTimeMs?: number
  hfRatio?: number
}

export type ServePhase = 'setup' | 'toss' | 'loading' | 'drive' | 'contact' | 'landing' | 'recovery'

export interface EventEstimate {
  frameIndex: number
  tReal: number
  /** +/- seconds (1 sigma-ish) for this event's timing. */
  uncertaintyS: number
  confidence: number // 0..1
  method: string // e.g. 'wrist-peak', 'ball-apex-fit', 'audio-onset', 'fused'
}

export interface ServeEvents {
  tossRelease?: EventEstimate
  tossApex?: EventEstimate
  trophy?: EventEstimate
  contact?: EventEstimate
  landing?: EventEstimate
  recoveryEnd?: EventEstimate
  // ---- v1 additions (ARCHITECTURE §6.1, METRICS §1.4), all optional ----
  setupStart?: EventEstimate
  motionStart?: EventEstimate
  trophyStart?: EventEstimate
  trophyEnd?: EventEstimate
  /** Lowest mid-hip between release and contact (leg drive, loading depth). Replaces the draft `peakLoad`. */
  lowestHip?: EventEstimate
  takeoff?: EventEstimate
}

export interface PhaseSpan {
  phase: ServePhase
  startFrame: number
  endFrame: number
  keyFrame: number
  confidence: number
}

/**
 * Product-facing honesty label. Every number shown to a player carries one.
 * measured       - computed directly from this footage, prerequisites met, validated method
 * estimated      - computed from footage plus an assumption (e.g. player height scale), shown with a range
 * player-entered - the player told us (e.g. in/out, target, serve type intention)
 * experimental   - computed, but the method is not yet validated; hidden behind a label and never headline
 * unavailable    - cannot be computed from this footage; say why and what would unlock it
 */
export type MetricStatus = 'measured' | 'estimated' | 'player-entered' | 'experimental' | 'unavailable'

export interface MetricValue {
  id: string
  value: number | string | null
  unit: string
  status: MetricStatus
  uncertainty?: { kind: 'plusminus' | 'range' | 'ci95'; low: number; high: number }
  confidence: number // 0..1 data-quality confidence for this specific value
  basis: string // plain-English: what it was computed from
  unavailableReason?: string
  unlockHint?: string // what setup would make it available
  // ---- v1 additions (ARCHITECTURE §6.1, METRICS §1.4), all optional ----
  /** Machine reason. Required with every downgrade and every unavailable value. */
  reasonCode?: ReasonCode
  /** CAPTURE check id (for example 'cq.toss-headroom') when a capture or serve check caused the status. */
  checkId?: string
  validationLevel?: 'V0' | 'V1' | 'V2' | 'V3'
  conditionClass?: 'day' | 'overcast' | 'night-lights' | 'flicker'
  band?: Band | 'unclear'
  bandBasis?: 'population-provisional' | 'player-relative' | 'fixed-geometric'
  bandProbabilities?: { low: number; typical: number; high: number }
  /** deep-bend-flag and other yes/no metrics. */
  flag?: boolean
  /** Companion values, e.g. { cm: 254 } beside a ratio, { k: 8 } for a rate, { timeMs: 352 }. */
  secondary?: Record<string, number | string>
  sigmaRandom?: number
  sigmaLeak?: number
  sigmaShared?: number
  /** Apex above the frame and not fitted. */
  censored?: 'right'
  plausibility?: 'ok' | 'soft-flag' | 'hard-reject'
  provenance?: 'engine' | 'confirmed-by-you' | 'from-your-tags' | 'match-log'
  /** Speed only (D4): which quantity the range describes. */
  quantity?: 'launch-speed' | 'average-speed'
  /** Serves (or tagged serves) that contributed. Required on every rate and spread (D7). */
  n?: number
  /** Serves that were eligible, for "X of N serves measured". */
  nEligible?: number
  /** METRICS §4.1 early read: shown with "Early read", never in a headline. */
  provisional?: boolean
  /** Spread at the limit of what can be measured (DESIGN §3.3 rule 5). */
  nearMeasurementLimit?: boolean
  /**
   * Integration addition: the status this per-serve value would have with a known phone pitch. Set
   * only when PITCH_UNKNOWN lowered it. Absolute heights and positions stay experimental, but spreads
   * across serves keep their status (METRICS §1.1 item 3), so spread summaries and coaching use it.
   */
  statusIfLevel?: MetricStatus
  /** Rounded display text per METRICS.md (engine-owned rounding). */
  display?: string
  /** e.g. 'toss-apex@1.0.0'; bump when the computation changes. */
  methodVersion?: string
  /** Serves and frames that support the value (key-frame evidence), keyed by event. */
  evidence?: { serveId: string; event: KeyFrameEvent; frameIndex: number; keyFrameId?: string }[]
}

export interface QualityCheck {
  id: string
  pass: boolean
  severity: 'info' | 'warn' | 'block'
  message: string
  value?: number
  // ---- v1 additions (CAPTURE §12, ARCHITECTURE §6.1), all optional ----
  scope?: 'clip' | 'serve'
  serveIds?: string[]
  /** One plain-English fix ("Move the phone one step back"). */
  fix?: string
  affects?: string[]
  threshold?: number
  /** Which research-06 §14 check this implements (1-18), for traceability. */
  protocolRef?: number
}

export interface QualityReport {
  overall: 'good' | 'usable' | 'poor'
  checks: QualityCheck[]
}

// =====================================================================================
// v1 additions (ARCHITECTURE §6.1, METRICS §1.4). Additive only: nothing above is renamed.
// =====================================================================================

/**
 * Canonical metric ids, in docs/specs/metrics.json catalogue order. ARCHITECTURE §3 plans to
 * generate this list with scripts/sync-specs.mjs; until that script exists it is kept by hand and
 * `src/analysis/catalogue.test.ts` fails if it drifts from metrics.json. `trunk-tilt-band` is removed.
 */
export const METRIC_IDS = [
  'serve-count', 'retoss-count',
  'toss-apex-height', 'toss-forward', 'toss-lateral', 'toss-drop',
  'toss-height-spread', 'toss-forward-spread', 'toss-lateral-spread',
  'contact-height-ratio', 'contact-height-spread', 'contact-forward',
  'rhythm-release-to-contact', 'rhythm-spread', 'trophy-pause',
  'leg-drive', 'drive-time', 'loading-depth', 'deep-bend-flag',
  'shoulder-tilt-trophy', 'knee-bend-band', 'shoulder-over-shoulder-contact',
  'landing-distance', 'repeatability',
  'serve-in-rate', 'first-serve-in-rate', 'second-serve-in-rate', 'double-faults',
  'placement-zone', 'serve-type-mix',
  'speed-experimental', 'speed-average-rear', 'speed-radar-entered', 'spin',
  'capture-quality', 'fatigue-flag', 'load-flag',
] as const
export type MetricId = (typeof METRIC_IDS)[number]
/** Removed ids, rejected by the catalogue test. */
export const REMOVED_METRIC_IDS = ['trunk-tilt-band'] as const
/** Only for reading records written by a newer catalogue. Engine output uses MetricId. */
export type AnyMetricId = MetricId | (string & {})

/** Metrics the side view cannot see (D1). They are always `unavailable` in a side-view session. */
export const REAR_ONLY_METRIC_IDS = [
  'toss-lateral', 'toss-lateral-spread', 'knee-bend-band', 'shoulder-over-shoulder-contact', 'speed-average-rear',
] as const satisfies readonly MetricId[]
/** Metrics only the side view can see. They are `unavailable` in a rear-view session. */
export const SIDE_ONLY_METRIC_IDS = [
  'toss-forward', 'toss-forward-spread', 'contact-forward', 'leg-drive', 'drive-time', 'loading-depth',
  'deep-bend-flag', 'shoulder-tilt-trophy', 'landing-distance', 'speed-experimental',
] as const satisfies readonly MetricId[]

/**
 * Machine reason behind a status (D2): the keys of metrics.json `reasonCodes`, plus the codes
 * ARCHITECTURE §6.1 requests from METRICS (NEEDS_SIDE_VIEW, NEEDS_REAR_VIEW, TILT_UNKNOWN,
 * EXCLUDED_BY_QUALITY). METRICS owns meanings and unlock hints; DESIGN §3.1 owns the short forms.
 */
export const REASON_CODES = [
  'VIEW_NOT_SUPPORTED', 'VIEW_MISMATCH', 'FPS_TOO_LOW', 'TIME_BASE_UNKNOWN', 'FRAMES_DROPPED',
  'PLAYER_HEIGHT_MISSING', 'BODY_NOT_UPRIGHT', 'FEET_NOT_VISIBLE', 'POSE_LOW_QUALITY', 'OCCLUDED',
  'ROLE_AMBIGUOUS', 'BALL_NOT_TRACKED', 'APEX_EXTRAPOLATED', 'APEX_OUT_OF_FRAME', 'RELEASE_NOT_FOUND',
  'CONTACT_NOT_FOUND', 'LANDING_NOT_FOUND', 'NO_CONTACT', 'AUDIO_UNAVAILABLE', 'NOT_ENTERED',
  'TARGET_NOT_TAGGED', 'BOUNCE_NOT_LOCATED', 'NEEDS_CALIBRATION', 'CAMERA_MOVED', 'CAMERA_TILTED',
  'PITCH_UNKNOWN', 'SCALE_INCONSISTENT', 'IMPLAUSIBLE_VALUE', 'CHECK_THIS_SERVE', 'TOO_FEW_SERVES',
  'BASELINE_BUILDING', 'RANGE_TOO_WIDE', 'EXPERIMENTAL_HIDDEN', 'CONDITION_NOT_VALIDATED',
  'VALIDATION_PENDING', 'NOT_MEASURABLE', 'NOT_IMPLEMENTED', 'LOW_LIGHT', 'FLICKER', 'MOTION_BLUR',
  'UNMATCHED',
  // Requested by ARCHITECTURE §6.1, not yet in metrics.json 1.1.0:
  'NEEDS_SIDE_VIEW', 'NEEDS_REAR_VIEW', 'TILT_UNKNOWN', 'EXCLUDED_BY_QUALITY',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

/** Engine-internal notes logged in `basis`, not player-facing. */
export type DowngradeNote = 'interpolated-landmarks' | 'left-right-unresolved' | 'scale-from-height' | 'plane-assumption'

export type EvidenceTier = 'research-backed' | 'coach-recommended' | 'experimental'
export type ServeSide = 'deuce' | 'ad'
export type ServeNumber = 1 | 2
export type ServeOutcome = 'in' | 'net' | 'long' | 'wide' | 'let' | 'unknown'
export type ServeType = 'flat' | 'slice' | 'kick'
export type TargetZone = 'T' | 'body' | 'wide'
export type LevelBand = 'utr-1-3' | 'utr-4-5' | 'utr-6-7' | 'unknown'
export type Band = 'low' | 'typical' | 'high'
/** Soft matching factor: timing precision class. */
export type FpsClass = 'fps30' | 'fps60' | 'fps120plus'
/** Side view | rear view (D1); never mixed. */
export type SessionMode = 'technique' | 'outcomes'
/** Side view: hitting-arm (chest) side, or the other side. */
export type CameraSide = 'chest' | 'back'
/** Displayed orientation of the clip (after rotation metadata). */
export type CameraOrientation = 'portrait' | 'landscape'
/** D1 set-up, classified from the capture context and the framing check. CAPTURE owns the names. */
export type CaptureSetup = 'side-portrait' | 'side-landscape-fence' | 'side-other' | 'rear-outcomes' | 'unknown'
export type TiltStatus = 'measured-level' | 'measured-corrected' | 'measured-over-cap' | 'unknown'
  /** Addition: no sensor pitch, level assumed from the import's mount answer (METRICS §1.1.3a). */
  | 'assumed-level'
/** Addition: the import question "How was the phone mounted?" (METRICS §1.1.3a). */
export type PhoneMount = 'level-mount' | 'roughly-level' | 'tilted-or-unsure'
/** Addition: where on the baseline the server stood (singles or doubles serving spot). A set-up factor. */
export type ServingSpot = 'singles' | 'doubles'

/** Events that own a stored key frame (ARCHITECTURE §5.5). */
export type KeyFrameEvent = 'setup' | 'release' | 'apex' | 'trophy' | 'lowestHip' | 'contact' | 'landing' | 'recovery'

export interface Estimate {
  value: number
  /** 1-sigma. */
  sigma: number
}

/**
 * The engine's view of CAPTURE §12 `CaptureContext`. Stored on VideoRecord (per clip) and passed in
 * AnalyseRequest.
 */
export interface CaptureContext {
  source: 'in-app-web' | 'in-app-native' | 'import'
  declaredView: CameraView
  cameraSide?: CameraSide
  serveSide: ServeSide | 'both'
  serveNumber: ServeNumber | 'mixed'
  intendedType?: ServeType
  intendedTarget?: TargetZone | 'mixed'
  handedness: Handedness
  playerHeightM: number
  playerHeightSource: 'entered' | 'default'
  conditions?: { wind?: 'calm' | 'breezy' | 'windy'; light?: 'day' | 'lights' | 'indoor' }
  device?: { cameraLabel?: string; model?: string; lensModel?: string; focal35mmEquiv?: number }
  requested?: { width: number; height: number; fps: number }
  delivered?: { width: number; height: number; fps: number; mimeType?: string }
  /** Displayed orientation of the recording (portrait is the D1 default). */
  orientation?: CameraOrientation
  /** D1 set-up chosen in the guide, confirmed by the framing check. */
  setup?: CaptureSetup
  /** Long-side field of view in degrees (native videoFieldOfView, or the lens default). */
  videoFovDeg?: number
  /** Native intrinsics (3x3 row-major, pixels of the coded frame) when delivered. */
  intrinsics?: number[]
  /** Live capture only: 10 Hz (PWA) or per-frame (native) attitude. Absent => pitch unknown. */
  orientationSamples?: { tMs: number; pitchDeg: number; rollDeg: number }[]
  /** Addition (imports): how the phone was mounted. Without sensor samples, a level mount means pitch 0 ± 2°, roughly level 0 ± 4°. */
  mount?: PhoneMount
  /** Addition: singles or doubles serving spot of the block (a set-up matching factor). */
  servingSpot?: ServingSpot
  recordingStartMs?: number
  framingAtStart?: {
    frameTopM: number
    bodyPx1080: number
    roomAheadM: number
    cameraHeightM: number
    tossApexMarginM?: number
  }
  hitSoundTiming: boolean
  /** Live contact onsets when hitSoundTiming is on (timestamps only; no samples are kept, D4). */
  liveOnsets?: { tMs: number; strength: number; sharpness: number }[]
  slowMotionAnswer?: 'normal' | 'slomo-120' | 'slomo-240' | 'slomo-unknown' | 'not-sure'
  expectedServeCount?: number
  recordedAnyway?: string[]
  native?: {
    exposureS?: number
    iso?: number
    thermal?: { tMs: number; state: 'nominal' | 'fair' | 'serious' | 'critical' }[]
  }
}
