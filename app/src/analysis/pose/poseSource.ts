/**
 * PoseSource: the one interface the rest of the engine uses to get PoseFrame[].
 * Implementations: MediaPipePoseSource (images -> model) and InjectedPoseSource
 * (ground truth + optional noise, no images needed). A future Apple Vision source
 * on iOS implements the same interface.
 */
import type { ImageDataLike, PoseFrame } from '../types.ts'

/** Any decoded frame representation the pose layer accepts. */
export type PoseImage =
  | ImageBitmap
  | VideoFrame
  | HTMLCanvasElement
  | OffscreenCanvas
  | ImageData
  | ImageDataLike

export interface PoseInputFrame {
  frameIndex: number
  /** Real (capture) seconds; must increase monotonically within one estimate() call. */
  tReal: number
  image: PoseImage
}

export type FrameStream<T> = AsyncIterable<T> | Iterable<T>

export interface PoseSource {
  readonly kind: PoseFrame['source']
  /**
   * Streams one PoseFrame per input frame, in input order. The caller keeps ownership
   * of the input images unless a source's options say otherwise.
   */
  estimate(frames: FrameStream<PoseInputFrame>): AsyncIterable<PoseFrame>
  /** Releases models, workers and GPU contexts. The source is unusable afterwards. */
  dispose(): Promise<void>
}

export async function collectPoseFrames(stream: AsyncIterable<PoseFrame>): Promise<PoseFrame[]> {
  const frames: PoseFrame[] = []
  for await (const frame of stream) frames.push(frame)
  return frames
}

export async function* toAsyncIterable<T>(items: FrameStream<T>): AsyncGenerator<T> {
  for await (const item of items) yield item
}

/** Width and height of any PoseImage (VideoFrame reports display size). */
export function imageSize(image: PoseImage): { width: number; height: number } {
  if ('displayWidth' in image) return { width: image.displayWidth, height: image.displayHeight }
  return { width: image.width, height: image.height }
}
