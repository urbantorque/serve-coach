/** Messages between MediaPipePoseSource and pose.worker.ts. */
import type { DetectOutput, DetectTarget, LandmarkerConfig, LandmarkerInitInfo, LandmarkerResetOptions } from './mediapipeCore.ts'

export type ToPoseWorker =
  | { type: 'init'; id: number; config: LandmarkerConfig }
  | { type: 'detect'; id: number; timestampMs: number; image: ImageBitmap | ImageData; target?: DetectTarget }
  | { type: 'reset'; id: number; options?: LandmarkerResetOptions }
  | { type: 'dispose'; id: number }

export type FromPoseWorker =
  | { type: 'ready'; id: number; info: LandmarkerInitInfo }
  | { type: 'result'; id: number; output: DetectOutput }
  | { type: 'done'; id: number; lastTimestampMs?: number }
  | { type: 'error'; id: number; message: string }
