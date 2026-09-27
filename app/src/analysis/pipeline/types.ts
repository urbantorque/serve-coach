/**
 * Public types of the production analysis pipeline (ARCHITECTURE §5, §6.2).
 *
 * runAnalysis(file, options) runs probe -> audio onsets (hit-sound timing only) -> Pass A (sparse
 * pose, serve windows) -> Pass B (dense pose with ROI in the pose worker, ball detection in the
 * ball worker, per window) -> analyseSession -> key frames -> coaching (when available) -> one
 * commit through the data layer. Everything here is plain data so progress events can cross a
 * worker boundary later without change.
 */
import type { AnalysisErrorCode, AnalysisProgress, SessionStats } from '../../data/domain.ts'
import type { CameraView, CaptureContext, Handedness } from '../types.ts'

/**
 * Player-facing step of the run. `stage` (AnalysisStage) stays the coarse engine stage the UI maps
 * to its four rows; `step` is the finer one this pipeline reports.
 */
export type PipelineStep =
  | 'probe'
  | 'finding-serves'
  | 'tracking-body'
  | 'tracking-ball'
  | 'measuring'
  | 'coaching'
  | 'saving'
  | 'done'

export interface PipelineProgress extends AnalysisProgress {
  step: PipelineStep
  /** 0..1 within the current step (determinate). */
  stepFraction: number
  /** Wall-clock milliseconds since the run started. */
  elapsedMs: number
}

export type PipelineEvent =
  | { type: 'progress'; progress: PipelineProgress }
  | { type: 'serve-ready'; jobId: string; serveId: string; index: number }
  | { type: 'warning'; jobId: string; message: string }

export interface RunAnalysisProfile {
  /** Metres. Required for estimated heights; 1.30-2.20 m accepted (ARCHITECTURE §5.1). */
  heightM?: number
  handedness: Handedness
  sex?: 'female' | 'male' | 'unspecified'
}

export interface RunAnalysisOptions {
  sessionId: string
  profile: RunAnalysisProfile
  view: CameraView
  /** CAPTURE §12 context. Built from the probe and defaults when absent (treated as an import). */
  capture?: CaptureContext
  /** Player-confirmed capture frame rate (slow-motion imports, CAPTURE §11.3). */
  fpsOverride?: number
  signal?: AbortSignal
  onProgress?: (event: PipelineEvent) => void
  /** Job id (defaults to a new ULID). */
  jobId?: string
  /** Where the clip came from, for the VideoRecord. Defaults from capture.source. */
  source?: 'in-app-web' | 'in-app-native' | 'camera-input' | 'file-import' | 'demo'
  /** Pose model for Pass B (settings.poseModel). Default 'full'. */
  poseModel?: 'full' | 'lite'
  /** Hit-sound timing (settings.hitSoundTiming or capture.hitSoundTiming). Off by default (D4). */
  hitSoundTiming?: boolean
  /** Skip persistence (tests, validation). Results are still returned. */
  persist?: boolean
  /**
   * Pass A sampling (validation and tuning only). Defaults: a 4 Hz scan with a 15 Hz fill around
   * arm-above-head activity. `coarseHz === fineHz` samples the whole clip at one rate.
   */
  passA?: { coarseHz?: number; fineHz?: number }
  /**
   * Pass B tuning (validation and profiling only; the defaults are the measured choice).
   * numPoses: 1 tracks the server from frame to frame (ARCHITECTURE §5.4), 2 detects every frame.
   * lanes: serve windows analysed at once, each with its own decoder, pose worker and ball worker
   * (default from the device, budget.ts `analysisLanes`). reuseSparse: skip context frames Pass A
   * already estimated.
   */
  passB?: { numPoses?: 1 | 2; lanes?: number; reuseSparse?: boolean }
}

export interface StageTiming {
  step: PipelineStep | 'audio' | 'init'
  ms: number
}

export interface PipelineTimings {
  probeMs: number
  audioMs: number
  poseInitMs: number
  sparseMs: number
  /** Pass B wall time (pose and ball run in parallel). */
  denseMs: number
  /** Of Pass B: pose and ball busy time, summed over windows (ball = readback + detection in the worker). */
  densePoseMs: number
  denseBallMs: number
  /** Of denseBallMs: pixel readback in the worker. */
  ballReadbackMs: number
  /** Mean scale of the ball crops (1 = full resolution). */
  ballCropScale: number
  /** Ball-layer analyseBall time (in the worker), summed over windows. */
  ballAnalyseMs: number
  measureMs: number
  keyFramesMs: number
  coachingMs: number
  saveMs: number
  totalMs: number
  framesDecoded: number
  poseFrames: number
  ballFrames: number
  windows: number
  /** Pass A pose frames: coarse scan and fine fill around activity. */
  sparseCoarseFrames: number
  sparseFillFrames: number
  ballBackend: 'worker' | 'main-thread'
  /** Ball-detection workers used in Pass B (each runs one window at a time on its own decode). */
  ballWorkers: number
  poseBackend: string
}

export interface RunAnalysisResult {
  sessionId: string
  jobId: string
  serveIds: string[]
  servesFound: number
  servesIncluded: number
  keyFrames: number
  stats: SessionStats
  timings: PipelineTimings
  warnings: string[]
  /** Coaching step outcome; `kind` is the coaching engine's decision kind (e.g. 'focus', 'capture-fix'). */
  coaching: { status: 'decided' | 'skipped' | 'failed'; reason?: string; kind?: string }
  timeBase: { captureFps: number; timeScale: number; fpsSource: string; status: 'proven' | 'user' | 'physics' | 'unknown' }
  /** Serve finding, for validation: windows from findServeWindows and the planned ones (real s). */
  serveFinding: {
    engineWindows: number
    windows: { startReal: number; endReal: number; contactT: number; contactSource: string; confidence: number }[]
  }
}

/** Error surfaced to the UI: a code, one calm player-facing sentence and whether a retry can help. */
export interface PlayerFacingError {
  code: AnalysisErrorCode
  message: string
  recoverable: boolean
}
