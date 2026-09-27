/**
 * Duration, size, storage and memory guards (ARCHITECTURE §5.1 pre-flight, §5.10 budgets).
 * Pure except `checkStorage`, which reads navigator.storage.estimate() when it exists.
 */
import type { VideoMeta } from '../types.ts'
import { AnalysisError } from './errors.ts'

export const MAX_FILE_BYTES = 2 * 1024 ** 3
/** Real seconds of clip per capture-rate class. */
export const MAX_REAL_S_NORMAL = 10 * 60
export const MAX_REAL_S_HIGH_FPS = 60
/** Free quota needed to store a copy of the clip and keep working room (§5.1). */
export const STORAGE_HEADROOM_FACTOR = 2.2

/** Memory bounds for Pass B (§5.10). */
export const MEMORY_BUDGET = {
  /**
   * Frame crops queued to the ball worker before decode waits. Crops are downscaled to a ~10 px
   * ball (about 0.3-1.5 MB each), so 12 bound the queue to roughly 20 MB while letting pose and
   * ball run at their own pace.
   */
  ballQueue: 12,
  /** Frames in flight to the pose worker (MediaPipePoseSource maxInFlight). */
  poseInFlight: 2,
  /** Longest side of the crop sent to the ball worker (pixels); larger crops are downscaled. */
  ballCropMaxLongSidePx: 1280,
  /**
   * Longest side of bitmaps fed to pose in Pass A. 640 lost serves served from the far (ad) side at
   * 6 m: on the 8-serve synthetic session (CRF 30 copy) Pass A found 6 of 8 at 640 and 8 of 8 at
   * 1080 (every contact within 0.06 s of truth), for about 7% more Pass A time (integration run,
   * 2026-09-27).
   */
  sparseMaxLongSidePx: 1080,
} as const

export interface ClipBudget {
  realDurationS: number
  limitS: number
}

/** Throws AnalysisError('too-long') with specific copy when the clip is over a PWA limit. */
export function checkClipBudget(meta: Pick<VideoMeta, 'durationMediaS' | 'timeScale' | 'captureFps'>, sizeBytes: number): ClipBudget {
  if (sizeBytes > MAX_FILE_BYTES) {
    throw new AnalysisError(
      'too-long',
      `file is ${(sizeBytes / 1024 ** 3).toFixed(2)} GB`,
      'This video file is over 2 GB, which is more than the phone can analyse. Trim it to the serves you want and try again.',
    )
  }
  const realDurationS = meta.durationMediaS * (meta.timeScale > 0 ? meta.timeScale : 1)
  const highFps = meta.captureFps >= 100
  const limitS = highFps ? MAX_REAL_S_HIGH_FPS : MAX_REAL_S_NORMAL
  if (realDurationS > limitS + 0.5) {
    throw new AnalysisError(
      'too-long',
      `${realDurationS.toFixed(1)} s real at ${meta.captureFps} fps (limit ${limitS} s)`,
      highFps
        ? 'Slow-motion videos can be up to 1 minute long. Trim it to the serves you want and try again.'
        : 'Videos can be up to 10 minutes long. Trim it to the serves you want and try again.',
    )
  }
  return { realDurationS, limitS }
}

interface StorageLike {
  estimate?: () => Promise<{ quota?: number; usage?: number }>
}

/**
 * Free quota against the need to keep a copy (2.2x the file). Returns true when storing is safe or
 * cannot be checked; false when the estimate says there is not enough room.
 */
export async function checkStorage(sizeBytes: number, storage: StorageLike | undefined = globalThis.navigator?.storage): Promise<boolean> {
  if (!storage?.estimate) return true
  try {
    const { quota, usage } = await storage.estimate()
    if (quota === undefined || usage === undefined) return true
    return quota - usage >= STORAGE_HEADROOM_FACTOR * sizeBytes
  } catch {
    return true
  }
}
