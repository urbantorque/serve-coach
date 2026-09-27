/**
 * MediaPipePoseSource: PoseSource backed by MediaPipe PoseLandmarker.
 *
 * - Runs in a dedicated module Web Worker when Worker, OffscreenCanvas and
 *   createImageBitmap exist; frames are copied to ImageBitmaps and transferred.
 *   Otherwise (or if the worker fails to start) it runs on the main thread. The API is
 *   identical either way; stats().backend says which one ran.
 * - Delegate 'auto' tries GPU and falls back to CPU if creation or a warm-up
 *   inference fails.
 * - numPoses defaults to 2 so a bystander is detected as a separate person and
 *   ServerTracker (tracking.ts) keeps following the server.
 * - roi 'auto' (default): the server is localised on the full frame and overlapping tiles
 *   (localise.ts), then every frame is cropped to a smoothed square around the tracked
 *   body (roi.ts) with createImageBitmap(source, sx, sy, sw, sh), so the full frame is
 *   never copied. Landmarks are mapped back to full-frame coordinates before tracking.
 * - Up to `maxInFlight` frames are pipelined to the worker. The caller may release an
 *   input image as soon as the next input frame is requested.
 */
import type { Landmark, PoseFrame } from '../types.ts'
import { meanCoreVisibility } from './landmarks.ts'
import { type LocaliseOptions, localisePeople } from './localise.ts'
import type { Delegate, DetectOutput, DetectTarget, LandmarkerConfig, LandmarkerHandle, LandmarkerInitInfo, LandmarkerResetOptions, LocatorSlot, PoseModel, RunningMode } from './mediapipeCore.ts'
import { type FrameStream, type PoseImage, type PoseInputFrame, type PoseSource, imageSize } from './poseSource.ts'
import { type FrameSize, type PixelRect, type RoiOptions, RoiController, cropCandidateToFrame, isFullFrame } from './roi.ts'
import { ServerTracker, type PoseCandidate, type TrackDecision, type TrackerOptions } from './tracking.ts'
import type { FromPoseWorker, ToPoseWorker } from './workerProtocol.ts'
// URL of the worker bundle (Vite builds it as its own ES-module chunk); see createPoseWorker().
import poseWorkerUrl from './pose.worker.ts?worker&url'

export type RoiMode = 'auto' | 'off'

export interface MediaPipePoseSourceOptions {
  model?: PoseModel
  delegate?: 'auto' | Delegate
  runningMode?: RunningMode
  numPoses?: number
  useWorker?: 'auto' | boolean
  /** Folder with pose_landmarker_{lite,full}.task (served from public/). */
  modelBaseUrl?: string
  /** Folder with the MediaPipe wasm runtime (served from public/). */
  wasmBaseUrl?: string
  minPoseDetectionConfidence?: number
  minPosePresenceConfidence?: number
  minTrackingConfidence?: number
  tracker?: Omit<TrackerOptions, 'frameAspect'>
  /** 'auto' crops every frame to the tracked server (default); 'off' feeds full frames. */
  roi?: RoiMode
  /** Crop geometry and smoothing (roi.ts DEFAULT_ROI_OPTIONS). */
  roiOptions?: Partial<RoiOptions>
  /** Localisation levels and verification (localise.ts DEFAULT_LOCALISE_OPTIONS). */
  localise?: Partial<Omit<LocaliseOptions, 'roi'>>
  /** Frames in flight to the worker. 1 disables pipelining. */
  maxInFlight?: number
  /**
   * Transfer (detach) caller ImageBitmaps instead of copying them. With ROI cropping the
   * crop is always a new bitmap; the caller's bitmap is then closed after its last use.
   */
  transferInputBitmaps?: boolean
  /** Worker start-up budget before falling back to the main thread. */
  workerInitTimeoutMs?: number
  /**
   * Longest side of the ROI crop handed to the landmarker (ARCHITECTURE §5.4: 256-512 px). The
   * detector sees 224 px and the landmark model 256 px of the crop anyway, so a larger crop only
   * costs copy, transfer and texture upload. Unset: the crop keeps its source resolution.
   */
  roiMaxSidePx?: number
}

/** Per-stream settings (configure()), applied when the next estimate() starts. */
export interface StreamSettings {
  /**
   * 2 detects every frame (a bystander stays a separate pose; VIDEO equals IMAGE mode). 1 lets
   * MediaPipe track from the previous landmarks and run the detector only when the track is lost
   * (ARCHITECTURE §5.4: Pass B, once Pass A has locked on the server).
   */
  numPoses?: number
  /**
   * The server's pose (full-frame normalised) shortly before the stream's first frame, e.g. from
   * Pass A. With ROI 'auto' the stream starts tracking from it instead of localising the server
   * again (a full-frame, tile and verification search: about 0.35 s per stream, measured on a
   * 16-serve clip). Applies to the next stream only; the tracker keeps its own rules, so a seed
   * that no longer matches anyone is dropped like a lost track.
   */
  seed?: { landmarks: Landmark[]; tReal: number }
  /** Replaces MediaPipePoseSourceOptions.roiMaxSidePx from the next stream on (0: no downscale). */
  roiMaxSidePx?: number
}

export interface TimingSummary {
  count: number
  meanMs: number
  medianMs: number
  p95Ms: number
  maxMs: number
}

export interface RoiStats {
  mode: RoiMode
  /** Frames run on a crop smaller than the full frame. */
  framesCropped: number
  /** Frames emitted without inference because no ROI was available (searching). */
  framesSkipped: number
  localisations: number
  localisationsFound: number
  /** Detector runs spent on localisation (full frame, tiles, verification crops). */
  localiserRuns: number
  /** Streams that started from a seed pose (StreamSettings.seed) instead of a localisation. */
  seededStreams: number
  /** Wall time per localisation attempt (calling thread). */
  localiseMs: TimingSummary
  /** One-off creation of the IMAGE-mode locator landmarker (VIDEO mode only), ms. */
  locatorSetupMs?: number
  /** Mean crop long side / frame short side over cropped frames. */
  meanCropSideFraction: number
}

export interface MediaPipePoseStats {
  backend: 'worker' | 'main-thread' | 'uninitialised'
  init?: LandmarkerInitInfo
  workerError?: string
  frames: number
  framesWithPerson: number
  framesWithMultiplePeople: number
  framesLost: number
  reacquisitions: number
  detectErrors: string[]
  /** Time inside PoseLandmarker per frame (excludes the warm-up frame and localisation). */
  inference: TimingSummary
  /** Submit-to-result on the calling thread (includes image copy, transfer, queueing). */
  roundTrip: TimingSummary
  /** Crop (ROI) or full-frame copy on the calling thread before submission, per frame. */
  prepare: TimingSummary
  roi: RoiStats
}

/** Per-frame ROI record, for debugging overlays and validation. */
export interface RoiTraceEntry {
  frameIndex: number
  /** Crop the frame was run on; null when run on the full frame or skipped. */
  crop: PixelRect | null
  skipped: boolean
  /** A localisation attempt ran on this frame. */
  localised: boolean
}

interface SubmitRequest {
  /** Pixel rectangle to run on; null or the full frame means the whole image. */
  crop?: PixelRect | null
  target?: DetectTarget
  /** This is the last use of the caller's image (it may be closed when owned). */
  lastUse?: boolean
  /** Downscale the crop to this longest side (see MediaPipePoseSourceOptions.roiMaxSidePx). */
  maxSidePx?: number
}

interface Backend {
  readonly where: 'worker' | 'main-thread'
  init(config: LandmarkerConfig): Promise<LandmarkerInitInfo>
  /** Resolves once the image has been consumed (copied or processed); `result` settles later. */
  submit(image: PoseImage, timestampMs: number, request?: SubmitRequest): Promise<{ result: Promise<DetectOutput>; prepareMs: number }>
  reset(options?: LandmarkerResetOptions): Promise<void>
  close(): Promise<void>
}

const BITMAP_OPTIONS: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }

/** Plain {width, height, data} objects (DecodedFrame.image) become real ImageData. */
function toTexSource(image: PoseImage): TexImageSource {
  if (typeof ImageData !== 'undefined' && image instanceof ImageData) return image
  if ('data' in image && image.data instanceof Uint8ClampedArray) {
    return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
  }
  return image as TexImageSource
}

function isImageBitmap(image: PoseImage): image is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap
}

/** Copies (or, with ownership, passes through) any PoseImage into a transferable ImageBitmap. */
async function toTransferableBitmap(image: PoseImage, transferOwnership: boolean): Promise<ImageBitmap> {
  if (isImageBitmap(image) && transferOwnership) return image
  return createImageBitmap(toTexSource(image) as ImageBitmapSource, BITMAP_OPTIONS)
}

/**
 * Copies only the crop rectangle: the GPU-side copy is proportional to the crop, not the frame.
 * With maxSidePx the copy is also downscaled (one GPU pass); landmarks stay crop-normalised, so the
 * crop -> frame mapping is unchanged.
 */
function cropToBitmap(image: PoseImage, rect: PixelRect, maxSidePx?: number): Promise<ImageBitmap> {
  const long = Math.max(rect.width, rect.height)
  if (maxSidePx && maxSidePx > 0 && long > maxSidePx) {
    const scale = maxSidePx / long
    return createImageBitmap(toTexSource(image) as ImageBitmapSource, rect.x, rect.y, rect.width, rect.height, {
      ...BITMAP_OPTIONS,
      resizeWidth: Math.max(1, Math.round(rect.width * scale)),
      resizeHeight: Math.max(1, Math.round(rect.height * scale)),
      resizeQuality: 'medium',
    })
  }
  return createImageBitmap(toTexSource(image) as ImageBitmapSource, rect.x, rect.y, rect.width, rect.height, BITMAP_OPTIONS)
}

function needsCrop(image: PoseImage, crop: PixelRect | null | undefined): crop is PixelRect {
  return !!crop && !isFullFrame(crop, imageSize(image))
}

class MainThreadBackend implements Backend {
  readonly where = 'main-thread' as const
  private handle: LandmarkerHandle | null = null
  private locator: LocatorSlot | null = null

  constructor(private readonly transferOwnership: boolean) {}

  async init(config: LandmarkerConfig): Promise<LandmarkerInitInfo> {
    const core = await import('./mediapipeCore.ts')
    this.handle = await core.LandmarkerHandle.create({ ...config, useModuleLoader: false })
    this.locator = new core.LocatorSlot({ ...config, useModuleLoader: false })
    return this.handle.info
  }

  async submit(image: PoseImage, timestampMs: number, request: SubmitRequest = {}): Promise<{ result: Promise<DetectOutput>; prepareMs: number }> {
    if (!this.handle || !this.locator) throw new Error('MediaPipe landmarker not initialised')
    const started = performance.now()
    let bitmap: ImageBitmap | null = null
    try {
      const target = request.target === 'locate' ? await this.locator.get(this.handle) : { handle: this.handle }
      bitmap = needsCrop(image, request.crop) ? await cropToBitmap(image, request.crop, request.maxSidePx) : null
      const prepareMs = performance.now() - started
      const output = target.handle.detect(bitmap ?? toTexSource(image), timestampMs)
      return { result: Promise.resolve(target.setupMs === undefined ? output : { ...output, locatorSetupMs: target.setupMs }), prepareMs }
    } catch (error) {
      return { result: Promise.reject(error), prepareMs: performance.now() - started }
    } finally {
      bitmap?.close()
      if (bitmap && request.lastUse && this.transferOwnership && isImageBitmap(image)) image.close()
    }
  }

  async reset(options?: LandmarkerResetOptions): Promise<void> {
    await this.handle?.reset(options)
  }

  async close(): Promise<void> {
    await this.locator?.close()
    this.handle?.close()
    this.handle = null
    this.locator = null
  }
}

/** Omit that distributes over a union of message types. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

class WorkerBackend implements Backend {
  readonly where = 'worker' as const
  private readonly worker: Worker
  private readonly bootstrapUrl: string
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (m: FromPoseWorker) => void; reject: (e: Error) => void }>()

  constructor(
    private readonly transferOwnership: boolean,
    private readonly initTimeoutMs: number,
  ) {
    const { worker, bootstrapUrl } = createPoseWorker()
    this.worker = worker
    this.bootstrapUrl = bootstrapUrl
    this.worker.onmessage = (event: MessageEvent<FromPoseWorker>) => {
      const entry = this.pending.get(event.data.id)
      if (!entry) return
      this.pending.delete(event.data.id)
      if (event.data.type === 'error') entry.reject(new Error(event.data.message))
      else entry.resolve(event.data)
    }
    this.worker.onerror = (event: ErrorEvent) => this.failAll(new Error(`pose worker error: ${event.message || 'failed to load'}`))
    this.worker.onmessageerror = () => this.failAll(new Error('pose worker message could not be deserialised'))
  }

  private failAll(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error)
    this.pending.clear()
  }

  private request(message: WithoutId<ToPoseWorker>, transfer: Transferable[] = []): Promise<FromPoseWorker> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...message, id } as ToPoseWorker, transfer)
    })
  }

  async init(config: LandmarkerConfig): Promise<LandmarkerInitInfo> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`pose worker did not start within ${this.initTimeoutMs} ms`)), this.initTimeoutMs)
    })
    try {
      const reply = await Promise.race([this.request({ type: 'init', config: { ...config, useModuleLoader: true } }), timeout])
      if (reply.type !== 'ready') throw new Error(`unexpected worker reply ${reply.type}`)
      return reply.info
    } finally {
      clearTimeout(timer)
    }
  }

  async submit(image: PoseImage, timestampMs: number, request: SubmitRequest = {}): Promise<{ result: Promise<DetectOutput>; prepareMs: number }> {
    const started = performance.now()
    let bitmap: ImageBitmap
    if (needsCrop(image, request.crop)) {
      bitmap = await cropToBitmap(image, request.crop, request.maxSidePx)
      if (request.lastUse && this.transferOwnership && isImageBitmap(image)) image.close()
    } else {
      bitmap = await toTransferableBitmap(image, this.transferOwnership && request.lastUse !== false)
    }
    const prepareMs = performance.now() - started
    const result = this.request({ type: 'detect', timestampMs, image: bitmap, target: request.target ?? 'main' }, [bitmap]).then((reply) => {
      if (reply.type !== 'result') throw new Error(`unexpected worker reply ${reply.type}`)
      return reply.output
    })
    return { result, prepareMs }
  }

  async reset(options?: LandmarkerResetOptions): Promise<void> {
    await this.request({ type: 'reset', options })
  }

  async close(): Promise<void> {
    try {
      await Promise.race([this.request({ type: 'dispose' }), new Promise((resolve) => setTimeout(resolve, 1000))])
    } catch {
      // The worker is terminated below either way.
    }
    this.worker.terminate()
    URL.revokeObjectURL(this.bootstrapUrl)
    this.failAll(new Error('pose worker closed'))
  }
}

/**
 * Starts pose.worker.ts through a one-line blob: module that imports it. A worker created from
 * a same-origin URL takes its Content-Security-Policy from its own HTTP response, which has none
 * on a static host or the Vite dev server, so the page's meta CSP would not apply and
 * tasks-vision's usage logging (POST https://odml.pa.googleapis.com/v1/log, sent from the
 * worker when a landmarker closes and every 60 s) went out. Measured in headless Edge 154 on
 * 2026-09-27 (tools/validate/smoke.mjs). A blob: worker inherits the creating page's policy
 * (policy-container inheritance for local-scheme URLs), so connect-src 'self' covers it; the
 * page CSP must allow `worker-src blob:`. pose.worker.ts also installs a same-origin fetch guard
 * (workerNetworkGuard.ts) for browsers that do not inherit the policy.
 */
function createPoseWorker(): { worker: Worker; bootstrapUrl: string } {
  const scriptUrl = absoluteUrl(poseWorkerUrl)
  const bootstrapUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(scriptUrl)};\n`], { type: 'text/javascript' }))
  return { worker: new Worker(bootstrapUrl, { type: 'module', name: 'pose-landmarker' }), bootstrapUrl }
}

function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function'
}

function absoluteUrl(path: string): string {
  const base = typeof document !== 'undefined' ? document.baseURI : globalThis.location?.href
  return base ? new URL(path, base).href : path
}

function summarise(values: readonly number[]): TimingSummary {
  if (values.length === 0) return { count: 0, meanMs: Number.NaN, medianMs: Number.NaN, p95Ms: Number.NaN, maxMs: Number.NaN }
  const sorted = [...values].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    count: values.length,
    meanMs: values.reduce((s, v) => s + v, 0) / values.length,
    medianMs: at(0.5),
    p95Ms: at(0.95),
    maxMs: sorted[sorted.length - 1],
  }
}

/** Mean visibility of the core joints: tasks-vision exposes no per-pose score. */
export function poseScore(candidate: PoseCandidate): number {
  return meanCoreVisibility(candidate.landmarks)
}

interface InFlight {
  frameIndex: number
  tReal: number
  submittedAt: number
  /** Crop the frame ran on (null: full frame). */
  crop: PixelRect | null
  frameSize: FrameSize
  /** No inference ran (searching without an ROI). */
  skipped: boolean
  result: Promise<DetectOutput>
}

type ResolvedOptions = Required<Omit<MediaPipePoseSourceOptions, 'tracker' | 'roiOptions' | 'localise'>> &
  Pick<MediaPipePoseSourceOptions, 'tracker' | 'roiOptions' | 'localise'>

export class MediaPipePoseSource implements PoseSource {
  readonly kind = 'mediapipe' as const
  private readonly options: ResolvedOptions
  private backend: Backend | null = null
  private ready: Promise<Backend> | null = null
  private initInfo: LandmarkerInitInfo | undefined
  private workerError: string | undefined
  private lastTimestampMs = 0
  private streams = 0
  private disposed = false
  private readonly inferenceMs: number[] = []
  private readonly roundTripMs: number[] = []
  private readonly prepareMs: number[] = []
  private readonly localiseMs: number[] = []
  private readonly cropSideFractions: number[] = []
  private readonly detectErrors: string[] = []
  private counts = { frames: 0, withPerson: 0, multiple: 0, lost: 0, reacquired: 0 }
  private roiCounts = { cropped: 0, skipped: 0, localisations: 0, found: 0, localiserRuns: 0, seeded: 0, locatorSetupMs: undefined as number | undefined }
  private decisions: Array<TrackDecision & { frameIndex: number }> = []
  private pendingSettings: StreamSettings | null = null
  /** Crop cap in force (options.roiMaxSidePx until a stream's settings replace it). */
  private roiMaxSidePx: number
  private trace: RoiTraceEntry[] = []

  constructor(options: MediaPipePoseSourceOptions = {}) {
    this.options = {
      model: 'full',
      delegate: 'auto',
      runningMode: 'VIDEO',
      numPoses: 2,
      useWorker: 'auto',
      modelBaseUrl: '/models',
      wasmBaseUrl: '/mediapipe/wasm',
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      roi: 'auto',
      maxInFlight: 2,
      transferInputBitmaps: false,
      workerInitTimeoutMs: 60_000,
      roiMaxSidePx: 0,
      // An explicit `undefined` (e.g. runningMode: config.runningMode) keeps the default.
      ...(Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as MediaPipePoseSourceOptions),
    }
    this.roiMaxSidePx = this.options.roiMaxSidePx
  }

  /**
   * Settings for the next estimate() stream onwards (e.g. numPoses 1 for Pass B). They are sent
   * with the landmarker reset that starts the stream, so no model is reloaded.
   */
  configure(settings: StreamSettings): void {
    this.pendingSettings = { ...this.pendingSettings, ...settings }
  }

  /** Loads wasm and model (and starts the worker). Optional: estimate() calls it. */
  init(): Promise<void> {
    return this.ensureReady().then(() => undefined)
  }

  stats(): MediaPipePoseStats {
    const fractions = this.cropSideFractions
    return {
      backend: this.backend?.where ?? 'uninitialised',
      init: this.initInfo,
      workerError: this.workerError,
      frames: this.counts.frames,
      framesWithPerson: this.counts.withPerson,
      framesWithMultiplePeople: this.counts.multiple,
      framesLost: this.counts.lost,
      reacquisitions: this.counts.reacquired,
      detectErrors: [...this.detectErrors],
      inference: summarise(this.inferenceMs),
      roundTrip: summarise(this.roundTripMs),
      prepare: summarise(this.prepareMs),
      roi: {
        mode: this.options.roi,
        framesCropped: this.roiCounts.cropped,
        framesSkipped: this.roiCounts.skipped,
        localisations: this.roiCounts.localisations,
        localisationsFound: this.roiCounts.found,
        localiserRuns: this.roiCounts.localiserRuns,
        seededStreams: this.roiCounts.seeded,
        localiseMs: summarise(this.localiseMs),
        locatorSetupMs: this.roiCounts.locatorSetupMs,
        meanCropSideFraction: fractions.length ? fractions.reduce((s, v) => s + v, 0) / fractions.length : Number.NaN,
      },
    }
  }

  /** Clears frame counters and timings (not init info or the one-off locator set-up time). */
  resetStats(): void {
    for (const values of [this.inferenceMs, this.roundTripMs, this.prepareMs, this.localiseMs, this.cropSideFractions, this.detectErrors]) values.length = 0
    this.counts = { frames: 0, withPerson: 0, multiple: 0, lost: 0, reacquired: 0 }
    this.roiCounts = { ...this.roiCounts, cropped: 0, skipped: 0, localisations: 0, found: 0, localiserRuns: 0, seeded: 0 }
  }

  /** Tracker decisions for the most recent estimate() call, one per frame. */
  trackDecisions(): ReadonlyArray<TrackDecision & { frameIndex: number }> {
    return this.decisions
  }

  /** ROI used for each frame of the most recent estimate() call. */
  roiTrace(): ReadonlyArray<RoiTraceEntry> {
    return this.trace
  }

  private config(): LandmarkerConfig {
    const o = this.options
    return {
      model: o.model,
      modelBaseUrl: absoluteUrl(o.modelBaseUrl),
      wasmBaseUrl: absoluteUrl(o.wasmBaseUrl),
      delegate: o.delegate,
      runningMode: o.runningMode,
      numPoses: o.numPoses,
      minPoseDetectionConfidence: o.minPoseDetectionConfidence,
      minPosePresenceConfidence: o.minPosePresenceConfidence,
      minTrackingConfidence: o.minTrackingConfidence,
      useModuleLoader: false,
    }
  }

  private ensureReady(): Promise<Backend> {
    if (this.disposed) return Promise.reject(new Error('MediaPipePoseSource is disposed'))
    this.ready ??= this.startBackend()
    return this.ready
  }

  private async startBackend(): Promise<Backend> {
    const config = this.config()
    const wantWorker = this.options.useWorker === true || (this.options.useWorker === 'auto' && workerSupported())
    if (wantWorker) {
      let worker: WorkerBackend | null = null
      try {
        worker = new WorkerBackend(this.options.transferInputBitmaps, this.options.workerInitTimeoutMs)
        this.initInfo = await worker.init(config)
        this.backend = worker
        return worker
      } catch (error) {
        this.workerError = error instanceof Error ? error.message : String(error)
        await worker?.close()
        if (this.options.useWorker === true) throw error
      }
    }
    const main = new MainThreadBackend(this.options.transferInputBitmaps)
    this.initInfo = await main.init(config)
    this.backend = main
    return main
  }

  private recordError(frameIndex: number, error: unknown): void {
    this.detectErrors.push(`frame ${frameIndex}: ${error instanceof Error ? error.message : String(error)}`)
  }

  /**
   * Localises the server in this frame (full frame, tiles, verification crops on the
   * IMAGE-mode locator), picks it with the tracker's own rules (tracker.peek) and starts the ROI.
   * Returns false when the locator itself failed (not when nobody was found).
   */
  private async localise(backend: Backend, frame: PoseInputFrame, size: FrameSize, tracker: ServerTracker, roi: RoiController): Promise<boolean> {
    const started = performance.now()
    this.roiCounts.localisations++
    try {
      const result = await localisePeople(
        size,
        async (rect) => {
          const { result } = await backend.submit(frame.image, 0, { crop: rect, target: 'locate', lastUse: false })
          const output = await result
          if (output.locatorSetupMs !== undefined) this.roiCounts.locatorSetupMs = output.locatorSetupMs
          return output.candidates
        },
        { ...this.options.localise, roi: roi.options },
      )
      this.roiCounts.localiserRuns += result.detectorRuns
      const decision = tracker.peek(result.people, frame.tReal)
      const chosen = decision.index === null ? null : result.people[decision.index]
      if (chosen && roi.start(chosen.landmarks, frame.tReal)) this.roiCounts.found++
      return true
    } catch (error) {
      this.recordError(frame.frameIndex, new Error(`localisation failed, continuing on full frames: ${error instanceof Error ? error.message : String(error)}`))
      return false
    } finally {
      roi.markSearched(frame.tReal)
      this.localiseMs.push(performance.now() - started)
    }
  }

  async *estimate(frames: FrameStream<PoseInputFrame>): AsyncGenerator<PoseFrame> {
    const backend = await this.ensureReady()
    const settings = this.pendingSettings
    this.pendingSettings = null
    const seed = settings?.seed
    if (settings?.roiMaxSidePx !== undefined) this.roiMaxSidePx = Math.max(0, settings.roiMaxSidePx)
    const landmarker = settings?.numPoses !== undefined ? { numPoses: settings.numPoses } : undefined
    if (this.streams > 0 || landmarker) await backend.reset(landmarker)
    this.streams++
    this.decisions = []
    this.trace = []

    let tracker: ServerTracker | null = null
    let roi: RoiController | null = null
    let frameSize: FrameSize | null = null
    let offsetMs: number | null = null
    const inFlight: InFlight[] = []

    const finish = async (item: InFlight): Promise<PoseFrame> => {
      const empty: PoseFrame = { frameIndex: item.frameIndex, tReal: item.tReal, landmarks: null, worldLandmarks: null, score: 0, source: 'mediapipe' }
      let output: DetectOutput
      try {
        output = await item.result
      } catch (error) {
        this.recordError(item.frameIndex, error)
        this.counts.frames++
        roi?.observe(null, item.tReal)
        return empty
      }
      if (!item.skipped) {
        this.roundTripMs.push(performance.now() - item.submittedAt)
        this.inferenceMs.push(output.inferenceMs)
        this.lastTimestampMs = Math.max(this.lastTimestampMs, output.timestampMs)
      }
      const crop = item.crop
      const candidates = crop ? output.candidates.map((c) => cropCandidateToFrame(c, crop, item.frameSize)) : output.candidates
      const decision = tracker!.update(candidates, item.tReal)
      this.decisions.push({ ...decision, frameIndex: item.frameIndex })
      this.counts.frames++
      if (candidates.length > 1) this.counts.multiple++
      if (decision.reason === 'lost') this.counts.lost++
      if (decision.reason === 'reacquired') this.counts.reacquired++
      const chosen = decision.index === null ? null : candidates[decision.index]
      if (chosen) this.counts.withPerson++
      if (!item.skipped) roi?.observe(chosen?.landmarks ?? null, item.tReal)
      return {
        ...empty,
        landmarks: chosen?.landmarks ?? null,
        worldLandmarks: chosen?.worldLandmarks ?? null,
        score: chosen ? poseScore(chosen) : 0,
      }
    }

    try {
      for await (const frame of frames) {
        if (this.disposed) return
        const size = imageSize(frame.image)
        if (!tracker || !frameSize || size.width !== frameSize.width || size.height !== frameSize.height) {
          // First frame (or a size change, which invalidates boxes and crops).
          frameSize = size
          tracker = new ServerTracker({ ...this.options.tracker, frameAspect: size.width / size.height })
          roi = this.options.roi === 'auto' ? new RoiController(size, this.options.roiOptions) : null
          // A seed (configure) starts the ROI and the track on the known server: no localisation.
          if (seed && roi && tracker.update([{ landmarks: seed.landmarks }], seed.tReal).index !== null && roi.start(seed.landmarks, seed.tReal)) this.roiCounts.seeded++
        }
        // A new clip starts 1 s after the previous one so VIDEO-mode timestamps stay increasing.
        offsetMs ??= this.streams === 1 && this.lastTimestampMs <= 0 ? 0 : this.lastTimestampMs + 1000 - frame.tReal * 1000

        let crop: PixelRect | null = null
        let localised = false
        if (roi?.shouldSearch(frame.tReal)) {
          // The localiser consults the tracker, which must have seen every earlier frame.
          while (inFlight.length > 0) yield await finish(inFlight.shift()!)
          localised = true
          if (!(await this.localise(backend, frame, size, tracker, roi))) roi = null
        }
        if (roi) {
          crop = roi.cropFor(frame.tReal)
          if (!crop) {
            // Nobody localised: emit "no person" without running the model.
            this.roiCounts.skipped++
            this.trace.push({ frameIndex: frame.frameIndex, crop: null, skipped: true, localised })
            const result = Promise.resolve<DetectOutput>({ candidates: [], inferenceMs: 0, timestampMs: -1 })
            inFlight.push({ frameIndex: frame.frameIndex, tReal: frame.tReal, submittedAt: performance.now(), crop: null, frameSize: size, skipped: true, result })
            if (inFlight.length >= Math.max(1, this.options.maxInFlight)) yield await finish(inFlight.shift()!)
            continue
          }
          if (isFullFrame(crop, size)) crop = null
          else {
            this.roiCounts.cropped++
            this.cropSideFractions.push(Math.max(crop.width, crop.height) / Math.min(size.width, size.height))
          }
        }
        this.trace.push({ frameIndex: frame.frameIndex, crop, skipped: false, localised })

        const submittedAt = performance.now()
        const { result, prepareMs } = await backend.submit(frame.image, offsetMs + frame.tReal * 1000, {
          crop,
          target: 'main',
          lastUse: true,
          maxSidePx: this.roiMaxSidePx || undefined,
        })
        this.prepareMs.push(prepareMs)
        result.catch(() => undefined) // observed in finish(); avoids an unhandled-rejection report meanwhile
        inFlight.push({ frameIndex: frame.frameIndex, tReal: frame.tReal, submittedAt, crop, frameSize: size, skipped: false, result })
        if (inFlight.length >= Math.max(1, this.options.maxInFlight)) yield await finish(inFlight.shift()!)
      }
      while (inFlight.length > 0) yield await finish(inFlight.shift()!)
    } finally {
      await Promise.allSettled(inFlight.map((item) => item.result))
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const backend = this.backend ?? (await this.ready?.catch(() => null)) ?? null
    await backend?.close()
    this.backend = null
  }
}
