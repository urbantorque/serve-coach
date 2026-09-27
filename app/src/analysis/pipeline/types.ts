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
   * Pass A tuning (validation only; the defaults are the measured choice and match the pipeline
   * before the 2026-09-28 performance round exactly). Defaults: a 4 Hz scan with a 15 Hz fill around
   * arm-above-head activity; `coarseHz === fineHz` samples the whole clip at one rate. Serve finding
   * is sensitive to the smallest change in these poses (see orchestrator.ts), so every knob is off.
   */
  passA?: {
    coarseHz?: number
    fineHz?: number
    /**
     * Landmarker poses for the coarse scan and the fill: 2 (the default) runs the person detector on
     * every frame so a bystander stays a separate pose; 1 tracks from the previous landmarks.
     */
    coarseNumPoses?: 1 | 2
    fillNumPoses?: 1 | 2
    /** Start the fill stream from the nearest coarse pose of the server instead of localising again. */
    seedFill?: boolean
  }
  /**
   * Pass B tuning (validation and profiling only; the defaults are the measured choice).
   *  - numPoses: 2 (default) detects every frame; 1 tracks from frame to frame (cheaper, but lags;
   *    see DENSE_NUM_POSES).
   *  - lanes: ball-detection workers (default from the device, budget.ts ballWorkerCount).
   *  - poseLanes: landmarkers that take windows in parallel (default budget.ts densePoseLaneCount).
   *  - ballPixels: 'cpu' (default where the codec decodes in software) copies YUV crops out of
   *    software-decoded frames, no GPU readback; 'gpu' reads bitmaps back.
   *  - tightBallCrop: cut the ball crop down to the toss band and the post-contact corridor (side
   *    view), the only places the detector searches (default on).
   *  - reuseSparse (off): skip context frames Pass A already estimated. About a fifth fewer Pass B
   *    poses, but the toss and contact height errors on the 16-serve check-in clip rose from 0.010
   *    to 0.018.
   *  - seedPose (off): start each window's stream from its Pass A pose instead of localising the
   *    server (about 0.35 s a window); it moved lowest-hip timing and loading depth.
   *  - slowCoreHz (off): pose rate in the slow parts of the core; 30 Hz cut Pass B pose frames by
   *    17% but moved the landing and toss-height errors.
   */
  passB?: {
    numPoses?: 1 | 2
    lanes?: number
    poseLanes?: number
    ballPixels?: 'cpu' | 'gpu'
    tightBallCrop?: boolean
    reuseSparse?: boolean
    seedPose?: boolean
    slowCoreHz?: number
  }
  /**
   * Pose input (validation and profiling only): longest side of the ROI crop handed to the
   * landmarker (MediaPipePoseSourceOptions.roiMaxSidePx; 0 keeps the source resolution).
   */
  pose?: { roiMaxSidePx?: number }
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
  /** How ball crops reached the workers: 'cpu' (YUV copy of software-decoded frames), 'gpu' (bitmap readback). */
  ballPixels: 'cpu' | 'gpu'
  /** Ball frames that took the CPU path (the rest fell back to bitmaps). */
  ballPlanarFrames: number
  /** Pass B pose streams started from a Pass A seed instead of a localisation. */
  seededWindows: number
  /** Pass B pose lanes (windows run in parallel, one per lane). */
  poseLanes: number
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
    windows: {
      startReal: number
      endReal: number
      contactT: number
      contactSource: string
      confidence: number
      /** Ball search crop (full-frame normalised), for profiling. */
      ballCrop?: { x: number; y: number; w: number; h: number }
    }[]
  }
}

/** Error surfaced to the UI: a code, one calm player-facing sentence and whether a retry can help. */
export interface PlayerFacingError {
  code: AnalysisErrorCode
  message: string
  recoverable: boolean
}
