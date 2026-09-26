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
}

export interface QualityCheck {
  id: string
  pass: boolean
  severity: 'info' | 'warn' | 'block'
  message: string
  value?: number
}

export interface QualityReport {
  overall: 'good' | 'usable' | 'poor'
  checks: QualityCheck[]
}
