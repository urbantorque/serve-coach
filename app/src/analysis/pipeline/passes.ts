/**
 * Pass A (sparse pose over the whole clip) and Pass B (dense, per serve window) of ARCHITECTURE
 * §5.3-§5.4, on the main thread as orchestration only: decoding is WebCodecs (hardware), pose
 * runs in the pose worker (MediaPipePoseSource, ROI crops) and ball detection in ball workers.
 *
 * Pass B runs pose and ball on separate decodes of a window (runPoseWindow, runBallDetect), so the
 * GPU-bound pose worker and the CPU-bound ball workers never wait on each other: hardware decoding
 * a window twice costs far less than either consumer. Every VideoFrame/ImageBitmap is closed as
 * soon as its consumer is done with it.
 */
import type { BallWindowResult, WindowAnalyseOptions, WindowBallConfig } from '../ball/workerCore.ts'
import type { BallFrameImage } from '../ball/workerProtocol.ts'
import type { PoseInputFrame } from '../pose/poseSource.ts'
import type { PoseFrame } from '../types.ts'
import type { FrameSelection, FrameSource, RawFrame } from '../video/frameTypes.ts'
import { copyCrop } from '../video/planar.ts'
import { FrameRenderer } from '../video/render.ts'
import { MEMORY_BUDGET } from './budget.ts'
import { throwIfAborted } from './errors.ts'
import { prefetch } from './prefetch.ts'
import { framesInSpans } from './windows.ts'

/** What the passes need from a pose source (MediaPipePoseSource satisfies it). */
export interface PoseEstimator {
  estimate(frames: AsyncIterable<PoseInputFrame>): AsyncIterable<PoseFrame>
  init?(): Promise<void>
  dispose(): Promise<void>
  stats?(): { backend: string; detectErrors: string[] }
  /**
   * Settings for later streams (MediaPipePoseSource.configure): numPoses 1 for Pass B, and a seed
   * (the server's pose just before the next stream) that replaces the stream's first localisation.
   */
  configure?(settings: { numPoses?: number; roiMaxSidePx?: number; seed?: { landmarks: NonNullable<PoseFrame['landmarks']>; tReal: number } }): void
}

/** What the passes need from the ball worker client. */
export interface BallClient {
  readonly backend: 'worker' | 'main-thread'
  begin(windowId: number, config: WindowBallConfig): Promise<void>
  pushFrame(windowId: number, frameIndex: number, tReal: number, image: BallFrameImage): Promise<void>
  end(windowId: number, options: WindowAnalyseOptions): Promise<BallWindowResult>
  /** Drops a window that will never be ended (a job a re-plan superseded), freeing its state. */
  discard?(windowId: number): Promise<void> | void
  dispose(): void
}

export interface SparsePassResult {
  poses: PoseFrame[]
  /** Pose frames at the coarse rate / added by the fine fill. */
  coarseFrames: number
  fillFrames: number
  framesDecoded: number
  ms: number
}

/**
 * Pass A in two levels: a coarse scan of the whole clip (ARCHITECTURE §5.3: 4 fps), then a fill
 * to the fine rate (engine contract: findServeWindows works at ~15-30 Hz) only around arm-above-
 * head activity. A 20-minute session with a serve every 30 s needs about a third of the pose
 * frames a uniform fine scan would.
 */
export async function runSparsePass(
  source: Pick<FrameSource, 'bitmaps' | 'frameTimes' | 'meta'>,
  pose: PoseEstimator,
  options: {
    coarseStep: number
    fineStep: number
    /** Spans (real s) to fill at the fine rate, from the coarse poses. */
    fillSpans: (coarse: PoseFrame[]) => [number, number][]
    signal?: AbortSignal
    onFrame?: (fraction: number) => void
    /**
     * Called before each pose stream starts (the coarse scan, then the fill with the frames it will
     * estimate), e.g. to configure the pose source for that stream.
     */
    beforeStream?: (stream: 'coarse' | 'fill', context: { coarse: PoseFrame[]; indices: readonly number[] }) => void
  },
): Promise<SparsePassResult> {
  const started = now()
  const n = source.frameTimes.length
  const coarseTotal = Math.ceil(n / options.coarseStep)
  options.beforeStream?.('coarse', { coarse: [], indices: [] })
  const coarse = await posesFor(source, pose, { step: options.coarseStep }, options.signal, (done) => options.onFrame?.((0.6 * done) / coarseTotal))
  let fill: PoseFrame[] = []
  if (options.fineStep < options.coarseStep) {
    const times = source.frameTimes.map((f) => f.tMedia * source.meta.timeScale)
    const have = new Set(coarse.poses.map((p) => p.frameIndex))
    const indices = framesInSpans(times, options.fillSpans(coarse.poses), options.fineStep, have)
    if (indices.length > 0) {
      options.beforeStream?.('fill', { coarse: coarse.poses, indices })
      const result = await posesFor(source, pose, { indices }, options.signal, (done) => options.onFrame?.(0.6 + (0.4 * done) / indices.length))
      fill = result.poses
    }
  }
  const poses = [...coarse.poses, ...fill].sort((a, b) => a.frameIndex - b.frameIndex)
  options.onFrame?.(1)
  return { poses, coarseFrames: coarse.poses.length, fillFrames: fill.length, framesDecoded: coarse.decoded + fill.length, ms: now() - started }
}

async function posesFor(
  source: Pick<FrameSource, 'bitmaps'>,
  pose: PoseEstimator,
  selection: FrameSelection,
  signal: AbortSignal | undefined,
  onFrame: (done: number) => void,
): Promise<{ poses: PoseFrame[]; decoded: number }> {
  let decoded = 0
  async function* inputs(): AsyncGenerator<PoseInputFrame> {
    // Decode-ahead: the next frames decode (and render) while the pose worker infers this one.
    const iterator = prefetch(source.bitmaps(selection, { maxLongSidePx: MEMORY_BUDGET.sparseMaxLongSidePx, signal }), MEMORY_BUDGET.decodeAhead, (f) => f.bitmap.close())[Symbol.asyncIterator]()
    let previous: ImageBitmap | null = null
    try {
      for (;;) {
        const next = await iterator.next()
        if (next.done) break
        // The pose source has copied or cropped the previous bitmap before asking for this one.
        previous?.close()
        previous = next.value.bitmap
        decoded++
        yield { frameIndex: next.value.index, tReal: next.value.tReal, image: next.value.bitmap }
      }
    } finally {
      previous?.close()
      await iterator.return?.(undefined)
    }
  }
  const poses: PoseFrame[] = []
  for await (const frame of pose.estimate(inputs())) {
    throwIfAborted(signal)
    poses.push(frame)
    onFrame(poses.length)
  }
  return { poses, decoded }
}

/**
 * Pixel crop of the displayed frame for a normalised rect, and the transfer size: scaled by
 * `downscale` (<= 1) and with the long side capped. Normalised coordinates are unaffected.
 */
export function cropPixels(crop: WindowBallConfig['crop'], width: number, height: number, maxLongSidePx: number, downscale = 1) {
  const sx = Math.max(0, Math.floor(crop.x * width))
  const sy = Math.max(0, Math.floor(crop.y * height))
  const sw = Math.max(1, Math.min(width - sx, Math.round(crop.w * width)))
  const sh = Math.max(1, Math.min(height - sy, Math.round(crop.h * height)))
  const scale = Math.min(1, Math.max(0.05, downscale), maxLongSidePx / Math.max(sw, sh))
  return { sx, sy, sw, sh, outWidth: Math.max(1, Math.round(sw * scale)), outHeight: Math.max(1, Math.round(sh * scale)) }
}

/** A decoded frame in display orientation, as a VideoFrame/ImageBitmap the pose source and crops can read. */
interface DisplayFrame {
  index: number
  tReal: number
  image: VideoFrame | ImageBitmap
  close(): void
}

async function* displayFrames(source: Pick<FrameSource, 'rawFrames' | 'meta'>, indices: readonly number[], signal?: AbortSignal): AsyncGenerator<DisplayFrame> {
  let renderer: FrameRenderer | null = null
  for await (const raw of source.rawFrames({ indices }, { signal })) {
    if (raw.pendingRotationDeg === 0) {
      yield { index: raw.index, tReal: raw.tReal, image: raw.image, close: () => raw.close() }
      continue
    }
    // Rotated clips: one GPU draw to display orientation (the decoder buffer is released at once).
    renderer ??= new FrameRenderer({ width: source.meta.width, height: source.meta.height }, { willReadFrequently: false })
    let bitmap: ImageBitmap
    try {
      renderer.draw((raw as RawFrame).image, raw.pendingRotationDeg)
      bitmap = await renderer.toBitmap()
    } finally {
      raw.close()
    }
    yield { index: raw.index, tReal: raw.tReal, image: bitmap, close: () => bitmap.close() }
  }
}

/**
 * Pass B pose for one window, on its own decode: only the pose frames are decoded and each frame is
 * released as soon as the pose source has taken its ROI crop. Runs on the GPU-bound pose worker;
 * ball detection for the same window runs meanwhile on its own decode (runBallDetect).
 */
export async function runPoseWindow(
  source: Pick<FrameSource, 'rawFrames' | 'meta'>,
  pose: PoseEstimator,
  input: { poseFrames: readonly number[]; signal?: AbortSignal; onPoseFrame?: (done: number, total: number) => void },
): Promise<{ poses: PoseFrame[]; framesDecoded: number; poseMs: number }> {
  const started = now()
  let decoded = 0
  async function* feed(): AsyncGenerator<PoseInputFrame> {
    let held: DisplayFrame | null = null
    const iterator = prefetch(displayFrames(source, input.poseFrames, input.signal), MEMORY_BUDGET.decodeAhead, (f) => f.close())[Symbol.asyncIterator]()
    try {
      for (;;) {
        const next = await iterator.next()
        // The pose source is done with the previous frame once it asks for the next one.
        held?.close()
        held = null
        if (next.done) break
        decoded++
        held = next.value
        yield { frameIndex: held.index, tReal: held.tReal, image: held.image }
        throwIfAborted(input.signal)
      }
    } finally {
      held?.close()
      await iterator.return?.(undefined)
    }
  }
  const poses: PoseFrame[] = []
  if (input.poseFrames.length > 0) {
    for await (const frame of pose.estimate(feed())) {
      poses.push(frame)
      input.onPoseFrame?.(poses.length, input.poseFrames.length)
    }
  }
  throwIfAborted(input.signal)
  return { poses, framesDecoded: decoded, poseMs: now() - started }
}

/**
 * Ball detection for one window on its own decode: every ball frame is cropped on the GPU to the
 * window's search region and transferred to the ball worker (begin + pushFrame). The caller ends
 * the window (ball.end) once the dense poses are known. Each frame is closed right after its crop,
 * so a ball job never holds decoder frames while the worker is busy.
 */
export async function runBallDetect(
  source: Pick<FrameSource, 'rawFrames' | 'meta'>,
  ball: BallClient,
  input: {
    windowId: number
    ballFrames: readonly number[]
    ballConfig: WindowBallConfig
    ballDownscale?: number
    display: { width: number; height: number }
    signal?: AbortSignal
    /**
     * CPU pixel path (ballPixelPath 'cpu'): decode with 'prefer-software' and copy each crop out of
     * the CPU-memory frame in YUV (video/planar.ts), converted in the ball worker. No GPU readback,
     * so ball detection no longer stalls on (or stalls) the pose worker's GPU work. A frame that
     * cannot be copied that way (format, colour space) takes the GPU path.
     */
    cpuPixels?: boolean
  },
): Promise<{ framesDecoded: number; planarFrames: number }> {
  // A job aborted while it waited its turn on the worker never begins.
  throwIfAborted(input.signal)
  const crop = cropPixels(input.ballConfig.crop, input.display.width, input.display.height, MEMORY_BUDGET.ballCropMaxLongSidePx, input.ballDownscale)
  await ball.begin(input.windowId, input.ballConfig)
  let decoded = 0
  let planarFrames = 0
  if (input.cpuPixels) {
    // Integer box downscale in the worker's conversion: the ball stays 10-20 px in radius, as the
    // GPU path's resize keeps it about 10 px; the detector picks its grid from the radius either way.
    const rect = { x: crop.sx, y: crop.sy, width: crop.sw, height: crop.sh }
    const k = Math.max(1, Math.floor(1 / Math.max(0.05, input.ballDownscale ?? 1)), Math.ceil(Math.max(crop.sw, crop.sh) / MEMORY_BUDGET.ballPlanarMaxLongSidePx))
    let renderer: FrameRenderer | null = null
    for await (const raw of source.rawFrames({ indices: input.ballFrames }, { signal: input.signal, hardwareAcceleration: 'prefer-software' })) {
      decoded++
      let image: BallFrameImage | null = null
      try {
        if (isVideoFrame(raw.image)) image = await copyCrop(raw.image, rect, raw.pendingRotationDeg, k)
        if (image) planarFrames++
        else {
          // GPU path for this frame: display orientation first, then the resized crop.
          let display: VideoFrame | ImageBitmap = raw.image
          let rendered: ImageBitmap | null = null
          if (raw.pendingRotationDeg !== 0) {
            renderer ??= new FrameRenderer({ width: source.meta.width, height: source.meta.height }, { willReadFrequently: false })
            renderer.draw(raw.image, raw.pendingRotationDeg)
            rendered = await renderer.toBitmap()
            display = rendered
          }
          try {
            image = await createImageBitmap(display, crop.sx, crop.sy, crop.sw, crop.sh, { resizeWidth: crop.outWidth, resizeHeight: crop.outHeight, resizeQuality: 'high' })
          } finally {
            rendered?.close()
          }
        }
      } finally {
        raw.close()
      }
      await ball.pushFrame(input.windowId, raw.index, raw.tReal, image)
      throwIfAborted(input.signal)
    }
    return { framesDecoded: decoded, planarFrames }
  }
  for await (const frame of displayFrames(source, input.ballFrames, input.signal)) {
    decoded++
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(frame.image, crop.sx, crop.sy, crop.sw, crop.sh, {
        resizeWidth: crop.outWidth,
        resizeHeight: crop.outHeight,
        resizeQuality: 'high',
      })
    } finally {
      frame.close()
    }
    await ball.pushFrame(input.windowId, frame.index, frame.tReal, bitmap)
    throwIfAborted(input.signal)
  }
  return { framesDecoded: decoded, planarFrames }
}

function isVideoFrame(image: VideoFrame | ImageBitmap): image is VideoFrame {
  return typeof VideoFrame !== 'undefined' && image instanceof VideoFrame
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
