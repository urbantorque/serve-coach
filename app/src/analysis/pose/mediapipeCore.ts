/**
 * Thin wrapper around @mediapipe/tasks-vision PoseLandmarker shared by the worker and
 * the main-thread fallback: creation with GPU -> CPU fallback, a warm-up inference, a
 * strictly increasing timestamp guard, and conversion to the engine's Landmark type.
 * The library is imported lazily so Node tests never load it.
 *
 * Notes on the library (tasks-vision 1.0.1):
 *  - Every image goes through a WebGL texture upload, even with the CPU delegate, so a
 *    WebGL-capable canvas (OffscreenCanvas in workers) is always required.
 *  - VIDEO mode requires strictly increasing timestamps (ms). Measured on rendered clips
 *    (README, "ROI evaluation"): with numPoses >= 2 its output equals IMAGE mode wherever
 *    the detector finds the person, and it carries the pose on from the previous frame
 *    where the detector misses. With numPoses 1 MediaPipe tracks without re-detecting and
 *    smooths causally. IMAGE mode detects every frame independently.
 *  - The library posts usage telemetry to odml.pa.googleapis.com; there is no option to
 *    turn it off (see README).
 */
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Landmark } from '../types.ts'
import type { PoseCandidate } from './tracking.ts'

export type PoseModel = 'lite' | 'full'
export type Delegate = 'GPU' | 'CPU'
export type RunningMode = 'VIDEO' | 'IMAGE'

export interface LandmarkerConfig {
  model: PoseModel
  /** Absolute URL of the folder holding pose_landmarker_{lite,full}.task. */
  modelBaseUrl: string
  /** Absolute URL of the folder holding the vision_wasm_* files. */
  wasmBaseUrl: string
  delegate: 'auto' | Delegate
  runningMode: RunningMode
  numPoses: number
  minPoseDetectionConfidence: number
  minPosePresenceConfidence: number
  minTrackingConfidence: number
  /** true inside module workers (the classic loader needs importScripts). */
  useModuleLoader: boolean
}

export interface LandmarkerInitInfo {
  delegate: Delegate
  model: PoseModel
  runningMode: RunningMode
  /** Wasm + model load + graph creation, ms. */
  initMs: number
  /** First inference on a blank frame (shader compilation etc.), ms. */
  warmupMs: number
  /** Why GPU was not used, when the delegate was 'auto' and GPU failed. */
  gpuError?: string
}

export interface DetectOutput {
  candidates: PoseCandidate[]
  inferenceMs: number
  timestampMs: number
  /** Set when this call first had to create the IMAGE-mode locator landmarker (ms). */
  locatorSetupMs?: number
}

/** Options applied when a new clip (stream) starts. */
export interface LandmarkerResetOptions {
  numPoses?: number
}

/** Which landmarker runs a request: the clip's main one, or the IMAGE-mode one used for localisation. */
export type DetectTarget = 'main' | 'locate'

/** Localisation must see a bystander next to the server, whatever the main numPoses. */
export const LOCATOR_MIN_POSES = 2

/**
 * Localisation runs on full frames and tiles, whose geometry differs from the per-frame
 * crops. In VIDEO mode that would corrupt MediaPipe's tracking state (and use up
 * timestamps), so localisation gets its own IMAGE-mode landmarker (numPoses >= 2), created
 * on first use. An IMAGE-mode main landmarker with numPoses >= 2 has no cross-frame state
 * and is reused.
 */
export class LocatorSlot {
  private pending: Promise<LandmarkerHandle> | null = null

  constructor(private readonly config: LandmarkerConfig) {}

  async get(main: LandmarkerHandle): Promise<{ handle: LandmarkerHandle; setupMs?: number }> {
    if (this.config.runningMode === 'IMAGE' && this.config.numPoses >= LOCATOR_MIN_POSES) return { handle: main }
    if (this.pending) return { handle: await this.pending }
    const started = performance.now()
    const pending = LandmarkerHandle.create({
      ...this.config,
      runningMode: 'IMAGE',
      numPoses: Math.max(LOCATOR_MIN_POSES, this.config.numPoses),
      delegate: main.info.delegate,
    })
    this.pending = pending
    // A failed creation is not kept: the next localisation (the next stream) tries again.
    pending.catch(() => {
      if (this.pending === pending) this.pending = null
    })
    const handle = await pending
    return { handle, setupMs: performance.now() - started }
  }

  async close(): Promise<void> {
    const handle = await this.pending?.catch(() => null)
    handle?.close()
    this.pending = null
  }
}

type TasksVision = typeof import('@mediapipe/tasks-vision')

let tasksVision: Promise<TasksVision> | null = null
function loadTasksVision(): Promise<TasksVision> {
  tasksVision ??= import('@mediapipe/tasks-vision')
  return tasksVision
}

let moduleLoaderLoads = 0

/**
 * Fileset for one landmarker creation. In a module worker tasks-vision loads its wasm
 * loader with import(url); a second import() of the same URL comes from the ES module
 * cache without re-running, so the loader never sets ModuleFactory again and creation
 * fails ("ModuleFactory not set"). That broke both a second landmarker (the ROI locator)
 * and the GPU -> CPU retry inside the worker. A unique query per load re-runs the loader;
 * the .wasm binary URL is unchanged (HTTP-cached).
 */
function filesetForLoad<T extends { wasmLoaderPath: string }>(fileset: T, useModuleLoader: boolean): T {
  if (!useModuleLoader || moduleLoaderLoads++ === 0) return fileset
  const separator = fileset.wasmLoaderPath.includes('?') ? '&' : '?'
  return { ...fileset, wasmLoaderPath: `${fileset.wasmLoaderPath}${separator}load=${moduleLoaderLoads}` }
}

export function modelUrl(config: Pick<LandmarkerConfig, 'model' | 'modelBaseUrl'>): string {
  return `${config.modelBaseUrl.replace(/\/$/, '')}/pose_landmarker_${config.model}.task`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A network failure while loading the wasm loader, the wasm binary or the model: transient, so the
 * same delegate is tried again instead of falling back to the CPU (or, for the ROI locator, giving
 * up on localisation for the whole clip). Seen in production builds (2026-09-28, integrated flows):
 * when Pass B's extra pose lane and Pass A's locator fetch the 9 MB model at the same moment,
 * Chromium fails one request with net::ERR_CACHE_WRITE_FAILURE ("Failed to fetch"). A failed
 * locator left Pass A on full frames and it found 3 of 16 serves.
 */
export function isTransientLoadError(error: unknown): boolean {
  return /failed to fetch|networkerror|network error|load failed|err_cache|net::/i.test(errorMessage(error))
}

/** Retries of one delegate after a transient load failure, and the wait before each (ms). */
export const LOAD_RETRY_DELAYS_MS: readonly number[] = [250, 1000]

function blankImage(): ImageData {
  return new ImageData(64, 64)
}

/** A live landmarker plus the bookkeeping that must travel with it. */
export class LandmarkerHandle {
  private lastTimestampMs = -Infinity

  private constructor(
    private landmarker: PoseLandmarker,
    readonly info: LandmarkerInitInfo,
    private readonly config: LandmarkerConfig,
  ) {}

  static async create(config: LandmarkerConfig): Promise<LandmarkerHandle> {
    const vision = await loadTasksVision()
    const fileset = await vision.FilesetResolver.forVisionTasks(config.wasmBaseUrl.replace(/\/$/, ''), config.useModuleLoader)
    const order: Delegate[] = config.delegate === 'auto' ? ['GPU', 'CPU'] : [config.delegate]
    let gpuError: string | undefined
    let lastError: unknown
    for (let d = 0, attempt = 0; d < order.length; ) {
      const delegate = order[d]
      const started = performance.now()
      let landmarker: PoseLandmarker | null = null
      try {
        landmarker = await vision.PoseLandmarker.createFromOptions(filesetForLoad(fileset, config.useModuleLoader), {
          baseOptions: { modelAssetPath: modelUrl(config), delegate },
          runningMode: config.runningMode,
          numPoses: config.numPoses,
          minPoseDetectionConfidence: config.minPoseDetectionConfidence,
          minPosePresenceConfidence: config.minPosePresenceConfidence,
          minTrackingConfidence: config.minTrackingConfidence,
          outputSegmentationMasks: false,
        })
        const initMs = performance.now() - started
        const info: LandmarkerInitInfo = { delegate, model: config.model, runningMode: config.runningMode, initMs, warmupMs: 0, gpuError }
        const handle = new LandmarkerHandle(landmarker, info, { ...config })
        // Warm-up: a GPU context can be created and still fail on first use, so the
        // fallback decision is made after one real inference.
        const warmStart = performance.now()
        handle.detect(blankImage(), 0)
        info.warmupMs = performance.now() - warmStart
        return handle
      } catch (error) {
        lastError = error
        try {
          landmarker?.close()
        } catch {
          // Closing a half-initialised landmarker can throw; nothing else to release.
        }
        // A load that failed on the network is tried again with the same delegate
        // (filesetForLoad gives the retry its own loader URL).
        if (isTransientLoadError(error) && attempt < LOAD_RETRY_DELAYS_MS.length) {
          await new Promise((resolve) => setTimeout(resolve, LOAD_RETRY_DELAYS_MS[attempt]))
          attempt++
          continue
        }
        if (delegate === 'GPU') gpuError = errorMessage(error)
        d++
        attempt = 0
      }
    }
    throw new Error(`PoseLandmarker could not be created (${order.join(' then ')}): ${errorMessage(lastError)}`)
  }

  /**
   * Runs one inference. `requestedMs` is mapped to a strictly increasing timestamp
   * (at least 1 ms after the previous one), as VIDEO mode requires.
   */
  detect(image: TexImageSource, requestedMs: number): DetectOutput {
    const timestampMs = Math.max(requestedMs, this.lastTimestampMs + 1)
    const started = performance.now()
    const result: PoseLandmarkerResult =
      this.config.runningMode === 'VIDEO' ? this.landmarker.detectForVideo(image, timestampMs) : this.landmarker.detect(image)
    const candidates = toCandidates(result)
    const inferenceMs = performance.now() - started
    result.close()
    this.lastTimestampMs = timestampMs
    return { candidates, inferenceMs, timestampMs }
  }

  /** The last timestamp used, so a new clip can start well after it. */
  get lastTimestamp(): number {
    return this.lastTimestampMs
  }

  /**
   * Clears MediaPipe's cross-frame state (tracked ROI, internal smoothing) before a new
   * clip. setOptions rebuilds the graph but keeps the loaded wasm and model. `numPoses`
   * switches between detecting every frame (2: a bystander stays a separate pose) and
   * VIDEO-mode tracking (1: the detector runs only when the track is lost).
   */
  async reset(options: LandmarkerResetOptions = {}): Promise<void> {
    if (options.numPoses !== undefined && options.numPoses >= 1) this.config.numPoses = Math.round(options.numPoses)
    await this.landmarker.setOptions({ runningMode: this.config.runningMode, numPoses: this.config.numPoses })
  }

  get numPoses(): number {
    return this.config.numPoses
  }

  close(): void {
    this.landmarker.close()
  }
}

export function toCandidates(result: PoseLandmarkerResult): PoseCandidate[] {
  return result.landmarks.map((pose, i) => ({
    landmarks: pose.map((p): Landmark => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })),
    worldLandmarks: result.worldLandmarks[i]?.map((p) => ({ x: p.x, y: p.y, z: p.z })) ?? null,
  }))
}
