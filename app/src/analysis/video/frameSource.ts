/**
 * Factory: opens a video file with the best available decode path and exposes one
 * FrameSource API (raw frames, RGBA analysis frames, ImageBitmaps) over either path.
 *   1. MP4/MOV + WebCodecs + codec supported  -> 'webcodecs' (frame-exact, fast)
 *   2. anything else the browser can play     -> 'media-element' (seek per frame)
 */
import type { DecodedFrame, VideoMeta } from '../types.ts'
import { blobSource, sniffContainer } from './byteSource.ts'
import { selectFrameIndices } from './decodePlan.ts'
import { checkWebCodecsSupport, WebCodecsFrameProducer } from './decoder.ts'
import type {
  BitmapFrame,
  DecodeOptions,
  DecodePath,
  FrameProducer,
  FrameSelection,
  FrameSource,
  FrameTime,
  RawFrame,
  RenderOptions,
} from './frameTypes.ts'
import { probeVideo, ProbeError, type ProbeResult } from './probe.ts'
import { analysisSize, FrameRenderer } from './render.ts'
import { MediaElementFrameProducer } from './seekDecoder.ts'

/**
 * Default canvas backing for RGBA frames. Measured in headless Edge 153 (README): a GPU
 * canvas + getImageData beat a CPU (willReadFrequently) canvas at 640 px, 156 vs 104 fps
 * from 720p and 184 vs 72 fps from 1080p.
 */
const RGBA_CPU_CANVAS_DEFAULT = false

export interface OpenFrameSourceOptions {
  fileName?: string
  /** Force a path (mainly for tests); 'auto' picks the best one. */
  prefer?: 'auto' | DecodePath
  hardwareAcceleration?: HardwareAcceleration
  /** Reuse an existing probe of the same file. */
  probe?: ProbeResult
  /** WebCodecs: leave out samples no wanted frame depends on (default true; WebCodecsDecoderOptions). */
  skipDisposable?: boolean
}

class DecodingFrameSource implements FrameSource {
  readonly path: DecodePath
  readonly pathReason: string
  readonly probe?: ProbeResult
  readonly frameTimes: readonly FrameTime[]
  private currentMeta: VideoMeta
  private readonly producer: FrameProducer

  constructor(producer: FrameProducer, meta: VideoMeta, frameTimes: readonly FrameTime[], pathReason: string, probe?: ProbeResult) {
    this.producer = producer
    this.path = producer.path
    this.currentMeta = meta
    this.frameTimes = frameTimes
    this.pathReason = pathReason
    this.probe = probe
  }

  get meta(): VideoMeta {
    return this.currentMeta
  }

  setMeta(meta: VideoMeta): void {
    this.currentMeta = meta
  }

  async *rawFrames(selection: FrameSelection = {}, options: DecodeOptions = {}): AsyncGenerator<RawFrame> {
    const indices = selectFrameIndices(this.frameTimes, this.currentMeta.timeScale, selection)
    for await (const produced of this.producer.produce(indices, options)) {
      const tMedia = this.frameTimes[produced.index].tMedia
      yield { ...produced, tMedia, tReal: tMedia * this.currentMeta.timeScale }
    }
  }

  async *frames(selection: FrameSelection = {}, options: RenderOptions & DecodeOptions = {}): AsyncGenerator<DecodedFrame> {
    const size = analysisSize(this.currentMeta, options)
    const renderer = new FrameRenderer(size, {
      smoothing: options.smoothing,
      willReadFrequently: options.willReadFrequently ?? RGBA_CPU_CANVAS_DEFAULT,
    })
    for await (const raw of this.rawFrames(selection, options)) {
      let image
      try {
        renderer.draw(raw.image, raw.pendingRotationDeg)
        image = renderer.readRgba()
      } finally {
        raw.close() // release the decoder buffer before the consumer starts work
      }
      yield { index: raw.index, tMedia: raw.tMedia, tReal: raw.tReal, image }
    }
  }

  async *bitmaps(
    selection: FrameSelection = {},
    options: RenderOptions & DecodeOptions & { applyRotation?: boolean } = {},
  ): AsyncGenerator<BitmapFrame> {
    const applyRotation = options.applyRotation ?? true
    // Bitmaps never need readback, so the canvas stays on the GPU.
    const renderer = applyRotation
      ? new FrameRenderer(analysisSize(this.currentMeta, options), { smoothing: options.smoothing, willReadFrequently: false })
      : null
    for await (const raw of this.rawFrames(selection, options)) {
      let bitmap: ImageBitmap
      try {
        if (renderer) {
          renderer.draw(raw.image, raw.pendingRotationDeg)
          bitmap = await renderer.toBitmap()
        } else {
          const coded = analysisSize({ width: raw.width, height: raw.height }, options.maxLongSidePx ? { maxLongSidePx: options.maxLongSidePx } : {})
          bitmap = await createImageBitmap(raw.image, {
            resizeWidth: coded.width,
            resizeHeight: coded.height,
            resizeQuality: options.smoothing ?? 'medium',
          })
        }
      } finally {
        raw.close()
      }
      yield {
        index: raw.index,
        tMedia: raw.tMedia,
        tReal: raw.tReal,
        bitmap,
        pendingRotationDeg: renderer ? 0 : raw.pendingRotationDeg,
      }
    }
  }

  canDecodeWith(hardwareAcceleration: HardwareAcceleration): Promise<boolean> {
    return this.producer.canDecodeWith?.(hardwareAcceleration) ?? Promise.resolve(false)
  }

  close(): void {
    this.producer.close()
  }
}

async function openMediaElement(file: Blob, options: OpenFrameSourceOptions, reason: string, probe?: ProbeResult): Promise<FrameSource> {
  const producer = await MediaElementFrameProducer.open(file, { probe, fileName: options.fileName, mimeType: file.type || undefined })
  const { timeline } = producer
  return new DecodingFrameSource(producer, timeline.meta, timeline.frames, reason, probe)
}

/** Opens a video file and reports which decode path was chosen (FrameSource.path / pathReason). */
export async function openFrameSource(file: Blob, options: OpenFrameSourceOptions = {}): Promise<FrameSource> {
  const prefer = options.prefer ?? 'auto'
  const fileName = options.fileName ?? (file instanceof File ? file.name : undefined)
  const opts = { ...options, fileName }
  const source = blobSource(file)

  let probe = options.probe
  let probeFailure = ''
  if (!probe) {
    const container = sniffContainer(await source.read(0, 16))
    if (container === 'mp4' || container === 'mov') {
      try {
        probe = await probeVideo(source, { fileName, mimeType: file.type || undefined })
      } catch (error) {
        probeFailure = error instanceof ProbeError ? `${error.code}: ${error.message}` : String(error)
      }
    } else {
      probeFailure = `container '${container}' is not parsed by the probe`
    }
  }

  if (prefer === 'media-element') return openMediaElement(file, opts, 'Media-element path requested.', probe)

  if (!probe) {
    if (prefer === 'webcodecs') throw new Error(`WebCodecs path unavailable: ${probeFailure}`)
    return openMediaElement(file, opts, `Using the media element because ${probeFailure}.`)
  }

  const support = await checkWebCodecsSupport(probe, options.hardwareAcceleration)
  if (!support.supported) {
    if (prefer === 'webcodecs') throw new Error(support.reason)
    return openMediaElement(file, opts, `${support.reason} Falling back to the media element.`, probe)
  }
  const producer = new WebCodecsFrameProducer(probe, source, { config: support.config, skipDisposable: options.skipDisposable })
  return new DecodingFrameSource(producer, probe.meta, probe.frames, support.reason, probe)
}
