/**
 * Messages between BallWorkerClient (pipeline, main thread) and ball/worker.ts (engine-pipeline).
 *
 * Per serve window the client sends `begin`, then one `frame` per decoded frame (an ImageBitmap
 * crop of the window's search region, transferred), then `end`. The worker reads the pixels back
 * in its own OffscreenCanvas, runs the stateful BallDetector, and on `end` runs analyseBall and
 * returns everything in full-frame normalised coordinates. `ack` per frame drives backpressure.
 */
import type { ImageDataLike } from '../types.ts'
import type { PlanarCrop } from '../video/planar.ts'
import type { FrameCandidates } from './tracker.ts'
import type { BallWindowResult, WindowAnalyseOptions, WindowBallConfig } from './workerCore.ts'

/**
 * A frame crop: an ImageBitmap (GPU path, read back in the worker), RGBA pixels, or a YUV crop copied
 * from a CPU-memory VideoFrame (video/planar.ts; converted to RGBA in the worker, no GPU readback).
 */
export type BallFrameImage = ImageBitmap | ImageDataLike | PlanarCrop

export type ToBallWorker =
  | { type: 'begin'; id: number; windowId: number; config: WindowBallConfig }
  | { type: 'frame'; id: number; windowId: number; frameIndex: number; tReal: number; image: BallFrameImage }
  | { type: 'end'; id: number; windowId: number; options: WindowAnalyseOptions }
  /** Re-runs analyseBall on candidates already detected (e.g. with onsets, a contact time or a corrected time base). */
  | { type: 'reanalyse'; id: number; frames: FrameCandidates[]; options: WindowAnalyseOptions }
  /** Drops a window that will never be ended (a superseded job); replies `ready`. */
  | { type: 'discard'; id: number; windowId: number }
  | { type: 'dispose'; id: number }

export type FromBallWorker =
  | { type: 'ready'; id: number }
  | { type: 'ack'; id: number; windowId: number; frameIndex: number; detectMs: number; readbackMs: number }
  | { type: 'result'; id: number; windowId: number; result: BallWindowResult }
  | { type: 'error'; id: number; message: string }
