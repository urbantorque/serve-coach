/**
 * Messages between BallWorkerClient (pipeline, main thread) and ball/worker.ts (engine-pipeline).
 *
 * Per serve window the client sends `begin`, then one `frame` per decoded frame (an ImageBitmap
 * crop of the window's search region, transferred), then `end`. The worker reads the pixels back
 * in its own OffscreenCanvas, runs the stateful BallDetector, and on `end` runs analyseBall and
 * returns everything in full-frame normalised coordinates. `ack` per frame drives backpressure.
 */
import type { ImageDataLike } from '../types.ts'
import type { FrameCandidates } from './tracker.ts'
import type { BallWindowResult, WindowAnalyseOptions, WindowBallConfig } from './workerCore.ts'

export type ToBallWorker =
  | { type: 'begin'; id: number; windowId: number; config: WindowBallConfig }
  | { type: 'frame'; id: number; windowId: number; frameIndex: number; tReal: number; image: ImageBitmap | ImageDataLike }
  | { type: 'end'; id: number; windowId: number; options: WindowAnalyseOptions }
  /** Re-runs analyseBall on candidates already detected (e.g. with onsets, a contact time or a corrected time base). */
  | { type: 'reanalyse'; id: number; frames: FrameCandidates[]; options: WindowAnalyseOptions }
  | { type: 'dispose'; id: number }

export type FromBallWorker =
  | { type: 'ready'; id: number }
  | { type: 'ack'; id: number; windowId: number; frameIndex: number; detectMs: number; readbackMs: number }
  | { type: 'result'; id: number; windowId: number; result: BallWindowResult }
  | { type: 'error'; id: number; message: string }
