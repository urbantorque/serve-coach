/**
 * Skeleton topology and pose-confidence rules for the video overlay (DESIGN §2.7, METRICS visibility
 * threshold 0.5). Face landmarks (0 to 10) are never drawn.
 */
import { LM } from '../../../analysis/types.ts'

/** Bones drawn on the body overlay (MediaPipe 33-landmark topology, face excluded). */
export const BONES: ReadonlyArray<readonly [LM, LM]> = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_HEEL],
  [LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  [LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
  [LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
  [LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX],
]

/** Joints drawn as dots: shoulders, elbows, wrists, hips, knees, ankles, heels, toes. */
export const BODY_JOINTS: readonly LM[] = [
  LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST,
  LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX,
]

/** Visibility at or above which a joint is drawn at full opacity (DESIGN §2.7). */
export const VIS_FULL = 0.7
/** Below this a joint is hidden, with every bone that touches it (METRICS visibility threshold). */
export const VIS_MIN = 0.5

export type JointTier = 'full' | 'faded' | 'hidden'

/** ≥ 0.7 full; 0.5 to 0.7 faded (45% opacity, dashed bones); below 0.5 or missing: hidden. */
export function jointTier(visibility: number | undefined): JointTier {
  if (visibility === undefined || !Number.isFinite(visibility) || visibility < VIS_MIN) return 'hidden'
  return visibility >= VIS_FULL ? 'full' : 'faded'
}

/** A bone takes the weaker tier of its two joints. */
export function boneTier(a: number | undefined, b: number | undefined): JointTier {
  const ta = jointTier(a)
  const tb = jointTier(b)
  if (ta === 'hidden' || tb === 'hidden') return 'hidden'
  return ta === 'faded' || tb === 'faded' ? 'faded' : 'full'
}

/** Opacity for a tier (faded joints at 45%). */
export const TIER_OPACITY: Record<Exclude<JointTier, 'hidden'>, number> = { full: 1, faded: 0.45 }
