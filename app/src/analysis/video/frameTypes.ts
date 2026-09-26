/** Types shared by the WebCodecs decoder, the media-element fallback and the factory. */
import type { DecodedFrame, VideoMeta } from '../types.ts'
import type { ProbeResult } from './probe.ts'
import type { RotationDeg } from './rotation.ts'

export type DecodePath = 'webcodecs' | 'media-element'

/**
 * Which frames to decode. Index ranges are presentation-order and inclusive; real-time
 * ranges select frames whose tReal lies in [startReal, endReal]. `step` keeps every
 * n-th selected frame (decoding still has to run through the skipped ones).
 */
export type FrameSelection =
  | { startIndex?: number; endIndex?: number; step?: number }
  | { startReal: number; endReal: number; step?: number }
  | { indices: readonly number[] }

export interface AnalysisSizeOptions {
  /** Exact output size (display orientation). If only one is given the other keeps aspect. */
  width?: number
  height?: number
  /** Downscale so the long side is at most this many pixels (never upscales). */
  maxLongSidePx?: number
}

export interface RenderOptions extends AnalysisSizeOptions {
  smoothing?: ImageSmoothingQuality
  /** Canvas backing for RGBA readback (see FrameRenderer). frames() defaults to the measured faster one. */
  willReadFrequently?: boolean
}

/** A frame straight from the decoder: no pixel copy has been made. */
export interface RawFrame {
  index: number
  tMedia: number
  tReal: number
  /** VideoFrame on the WebCodecs path, ImageBitmap on the media-element path. */
  image: VideoFrame | ImageBitmap
  /** Pixel size of `image` (coded orientation unless pendingRotationDeg is 0). */
  width: number
  height: number
  /**
   * Clockwise rotation still needed to reach display orientation. Pose on the raw image
   * gives coded-orientation coordinates; map them with codedToDisplay(x, y, pendingRotationDeg).
   */
  pendingRotationDeg: RotationDeg
  /** Frees the decoder buffer. Call promptly: hardware decoders stall when frames pile up. */
  close(): void
}

export interface BitmapFrame {
  index: number
  tMedia: number
  tReal: number
  bitmap: ImageBitmap
  pendingRotationDeg: RotationDeg
}

export interface DecodeStats {
  path: DecodePath
  requested: number
  yielded: number
  /** Requested frames that never came out of the decoder (or could not be seeked to). */
  missingIndices: number[]
  /** Coded samples fed to the decoder, including keyframe pre-roll (WebCodecs only). */
  samplesFed: number
  elapsedMs: number
  notes: string[]
}

export interface DecodeOptions {
  signal?: AbortSignal
  onStats?: (stats: DecodeStats) => void
}

/** Output of a path-specific producer before the factory attaches times. */
export interface ProducedFrame {
  index: number
  image: VideoFrame | ImageBitmap
  width: number
  height: number
  pendingRotationDeg: RotationDeg
  close(): void
}

export interface FrameProducer {
  readonly path: DecodePath
  /** Yields the requested presentation indices (ascending) at most once each, in order. */
  produce(indices: readonly number[], options: DecodeOptions): AsyncGenerator<ProducedFrame>
  close(): void
}

export interface FrameTime {
  index: number
  tMedia: number
  isKeyframe?: boolean
}

export interface FrameSource {
  readonly path: DecodePath
  /** Why this path was chosen (e.g. 'WebCodecs supports avc1.640028'). */
  readonly pathReason: string
  readonly meta: VideoMeta
  readonly probe?: ProbeResult
  readonly frameTimes: readonly FrameTime[]
  /** Replace meta, e.g. with applyTimeScale(...) output; tReal of later frames follows it. */
  setMeta(meta: VideoMeta): void
  rawFrames(selection?: FrameSelection, options?: DecodeOptions): AsyncGenerator<RawFrame>
  /** RGBA at analysis resolution, rotation applied. */
  frames(selection?: FrameSelection, options?: RenderOptions & DecodeOptions): AsyncGenerator<DecodedFrame>
  /** GPU-side ImageBitmaps for MediaPipe; rotation applied unless applyRotation is false. */
  bitmaps(
    selection?: FrameSelection,
    options?: RenderOptions & DecodeOptions & { applyRotation?: boolean },
  ): AsyncGenerator<BitmapFrame>
  close(): void
}
