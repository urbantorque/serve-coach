/**
 * Fallback decoder for browsers without WebCodecs, codecs WebCodecs rejects, and
 * containers we do not parse (WebM/VP9). Seeks an HTMLVideoElement frame by frame and
 * uses requestVideoFrameCallback's mediaTime to confirm which frame is on screen.
 * Slower than WebCodecs (one seek per frame) and only as exact as the browser's seek;
 * every mismatch is reported in DecodeStats.missingIndices rather than hidden.
 */
import type { VideoMeta } from '../types.ts'
import { estimateTimeline, nearestFrameIndex } from './decodePlan.ts'
import type { DecodeOptions, DecodeStats, FrameProducer, FrameTime, ProducedFrame } from './frameTypes.ts'
import type { ProbeResult } from './probe.ts'
import type { RotationDeg } from './rotation.ts'

export interface MediaElementOpenOptions {
  probe?: ProbeResult
  fileName?: string
  mimeType?: string
  /** Frame rate to assume when neither a probe nor requestVideoFrameCallback can tell. */
  fpsHint?: number
  timeoutMs?: number
}

export interface MediaElementTimeline {
  frames: FrameTime[]
  meta: VideoMeta
  /** True when frame times were estimated from playback rather than read from the container. */
  estimated: boolean
  notes: string[]
}

/** Seek this far into a frame's interval so rounding cannot land on the previous frame. */
const SEEK_BIAS = 0.25
const DEFAULT_TIMEOUT_MS = 3000
const FRAME_CALLBACK_TIMEOUT_MS = 250

function abortError(): Error {
  return new DOMException('Decoding aborted.', 'AbortError')
}

function waitForEvent(target: HTMLVideoElement, type: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(type, onEvent)
      target.removeEventListener('error', onError)
    }
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(`Video element error while waiting for '${type}': ${target.error?.message ?? 'unknown'}`))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for '${type}'.`))
    }, timeoutMs)
    target.addEventListener(type, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
  })
}

function hasFrameCallback(video: HTMLVideoElement): boolean {
  return typeof video.requestVideoFrameCallback === 'function'
}

/** Resolves with the next presented frame's metadata, or null on timeout. */
function nextPresentedFrame(video: HTMLVideoElement, timeoutMs: number): Promise<VideoFrameCallbackMetadata | null> {
  return new Promise((resolve) => {
    let handle = 0
    const timer = setTimeout(() => {
      video.cancelVideoFrameCallback(handle)
      resolve(null)
    }, timeoutMs)
    handle = video.requestVideoFrameCallback((_now, metadata) => {
      clearTimeout(timer)
      resolve(metadata)
    })
  })
}

async function observePlaybackTimes(video: HTMLVideoElement, maxFrames: number, maxMs: number): Promise<number[]> {
  const times: number[] = []
  if (!hasFrameCallback(video)) return times
  const started = performance.now()
  await video.play()
  try {
    while (times.length < maxFrames && performance.now() - started < maxMs && !video.ended) {
      const metadata = await nextPresentedFrame(video, 500)
      if (metadata) times.push(metadata.mediaTime)
    }
  } finally {
    video.pause()
  }
  return times
}

/** Presentation time of the first frame: seek to 0 and read the frame callback's mediaTime. */
async function measureFirstFrame(video: HTMLVideoElement, timeoutMs: number): Promise<number | null> {
  if (!hasFrameCallback(video)) return null
  const presented = nextPresentedFrame(video, FRAME_CALLBACK_TIMEOUT_MS)
  const seeked = waitForEvent(video, 'seeked', timeoutMs)
  video.currentTime = 0
  await seeked
  const metadata = await presented
  return metadata ? metadata.mediaTime : null
}

function metaWithoutProbe(video: HTMLVideoElement, fps: number, frameCount: number, options: MediaElementOpenOptions): VideoMeta {
  return {
    fileName: options.fileName ?? 'video',
    mimeType: options.mimeType,
    durationMediaS: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    rotationDeg: 0, // the element applies any container rotation itself
    hasAudio: false, // unknown without a container parse; audio.ts decodes separately
    nominalFps: fps,
    captureFps: fps,
    timeScale: 1,
    fpsSource: 'timestamps',
    isVariableFrameRate: false, // unknown: estimated timelines assume constant rate
    frameCount,
  }
}

export class MediaElementFrameProducer implements FrameProducer {
  readonly path = 'media-element' as const
  readonly timeline: MediaElementTimeline
  private readonly video: HTMLVideoElement
  private readonly url: string
  private readonly timeoutMs: number
  private readonly codedRotation: RotationDeg
  private presentedIndex = -1

  private constructor(video: HTMLVideoElement, url: string, timeline: MediaElementTimeline, timeoutMs: number, codedRotation: RotationDeg) {
    this.video = video
    this.url = url
    this.timeline = timeline
    this.timeoutMs = timeoutMs
    this.codedRotation = codedRotation
  }

  static async open(blob: Blob, options: MediaElementOpenOptions = {}): Promise<MediaElementFrameProducer> {
    if (typeof document === 'undefined') throw new Error('The media-element decoder needs a DOM (main thread only).')
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.disablePictureInPicture = true
    // Kept in the DOM (but invisible) so the browser composites frames and fires frame callbacks.
    video.setAttribute('aria-hidden', 'true')
    video.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0;pointer-events:none;'
    document.body.append(video)
    try {
      const loaded = waitForEvent(video, 'loadeddata', timeoutMs)
      video.src = url
      await loaded
      const timeline = await MediaElementFrameProducer.buildTimeline(video, options)
      const rotation = options.probe?.meta.rotationDeg ?? 0
      return new MediaElementFrameProducer(video, url, timeline, timeoutMs, rotation)
    } catch (error) {
      video.remove()
      URL.revokeObjectURL(url)
      throw error
    }
  }

  private static async buildTimeline(video: HTMLVideoElement, options: MediaElementOpenOptions): Promise<MediaElementTimeline> {
    const notes: string[] = []
    if (options.probe) {
      const frames = options.probe.frames.map((f) => ({ index: f.index, tMedia: f.tMedia, isKeyframe: f.isKeyframe }))
      return { frames, meta: options.probe.meta, estimated: false, notes }
    }

    const observed = await observePlaybackTimes(video, 45, 2000)
    const measuredFirstS = await measureFirstFrame(video, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    let estimate = estimateTimeline(observed, video.duration, measuredFirstS ?? undefined)
    if (!estimate) {
      const fps = options.fpsHint ?? 30
      notes.push(`Frame rate unknown (no frame callbacks); assumed ${fps} fps.`)
      estimate = { fps, firstFrameS: 0, frameCount: Math.max(1, Math.round(video.duration * fps)) }
    } else {
      notes.push(`Frame times estimated from playback at ${estimate.fps.toFixed(3)} fps (constant rate assumed).`)
    }
    const { fps, firstFrameS, frameCount } = estimate
    const frames = Array.from({ length: frameCount }, (_, index) => ({ index, tMedia: firstFrameS + index / fps }))
    return { frames, meta: metaWithoutProbe(video, fps, frameCount, options), estimated: true, notes }
  }

  private frameDurationS(index: number): number {
    const frames = this.timeline.frames
    if (index + 1 < frames.length) return frames[index + 1].tMedia - frames[index].tMedia
    if (index > 0) return frames[index].tMedia - frames[index - 1].tMedia
    return 1 / (this.timeline.meta.nominalFps || 30)
  }

  /** Seeks and returns the index actually presented, or null when the browser gave no confirmation. */
  private async seekTo(tMedia: number): Promise<number | null> {
    const video = this.video
    const presented = hasFrameCallback(video) ? nextPresentedFrame(video, FRAME_CALLBACK_TIMEOUT_MS) : Promise.resolve(null)
    const seeked = waitForEvent(video, 'seeked', this.timeoutMs)
    video.currentTime = tMedia
    await seeked
    const metadata = await presented
    if (!metadata) return null
    return nearestFrameIndex(this.timeline.frames, metadata.mediaTime)
  }

  async *produce(indices: readonly number[], options: DecodeOptions = {}): AsyncGenerator<ProducedFrame> {
    const startedMs = performance.now()
    const stats: DecodeStats = {
      path: 'media-element',
      requested: indices.length,
      yielded: 0,
      missingIndices: [],
      samplesFed: 0,
      samplesSkipped: 0,
      elapsedMs: 0,
      notes: [...this.timeline.notes],
    }
    let unconfirmed = 0
    try {
      for (const index of indices) {
        if (options.signal?.aborted) throw abortError()
        const start = this.timeline.frames[index].tMedia
        const duration = this.frameDurationS(index)
        if (this.presentedIndex !== index) {
          let shown = await this.seekTo(start + duration * SEEK_BIAS)
          if (shown !== null && shown !== index) shown = await this.seekTo(start + duration * 0.5)
          if (shown === null) unconfirmed++
          else if (shown !== index) {
            this.presentedIndex = shown
            stats.missingIndices.push(index)
            continue
          }
          this.presentedIndex = index
        }
        const bitmap = await createImageBitmap(this.video)
        const displayed = this.timeline.meta
        // Browsers normally rotate <video> output themselves; detect it from the bitmap shape.
        const rotated = bitmap.width === displayed.width && bitmap.height === displayed.height
        stats.yielded++
        yield {
          index,
          image: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          pendingRotationDeg: rotated ? 0 : this.codedRotation,
          close: () => bitmap.close(),
        }
      }
    } finally {
      if (unconfirmed > 0) stats.notes.push(`${unconfirmed} frame(s) could not be confirmed with requestVideoFrameCallback.`)
      if (stats.missingIndices.length > 0) stats.notes.push(`${stats.missingIndices.length} frame(s) could not be reached by seeking.`)
      stats.elapsedMs = performance.now() - startedMs
      options.onStats?.(stats)
    }
  }

  close(): void {
    this.video.removeAttribute('src')
    this.video.load()
    this.video.remove()
    URL.revokeObjectURL(this.url)
  }
}
