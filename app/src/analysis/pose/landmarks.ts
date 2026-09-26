/**
 * Landmark topology helpers and small 2D geometry primitives shared by the pose layer.
 *
 * Coordinate convention: PoseFrame landmarks are normalised to the displayed frame
 * (x / width, y / height). Those units are anisotropic (a portrait 9:16 frame has
 * x units 1.78x shorter than y units in pixels), so every distance or angle here is
 * computed in "frame-height units" (HU): xHU = x * frameAspect, yHU = y, where
 * frameAspect = width / height. One HU is the frame height; the ball layer uses
 * the same convention for radius.
 */
import { LM, type Landmark } from '../types.ts'

export const LANDMARK_COUNT = 33

export interface Point2 {
  x: number
  y: number
}

/** Anatomical left/right pairs as MediaPipe labels them (the person's left, not image left). */
export const LEFT_RIGHT_PAIRS: ReadonlyArray<readonly [LM, LM]> = [
  [LM.LEFT_EYE_INNER, LM.RIGHT_EYE_INNER],
  [LM.LEFT_EYE, LM.RIGHT_EYE],
  [LM.LEFT_EYE_OUTER, LM.RIGHT_EYE_OUTER],
  [LM.LEFT_EAR, LM.RIGHT_EAR],
  [LM.MOUTH_LEFT, LM.MOUTH_RIGHT],
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_ELBOW, LM.RIGHT_ELBOW],
  [LM.LEFT_WRIST, LM.RIGHT_WRIST],
  [LM.LEFT_PINKY, LM.RIGHT_PINKY],
  [LM.LEFT_INDEX, LM.RIGHT_INDEX],
  [LM.LEFT_THUMB, LM.RIGHT_THUMB],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_KNEE, LM.RIGHT_KNEE],
  [LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
  [LM.LEFT_HEEL, LM.RIGHT_HEEL],
  [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX],
]

export type SwapGroupName = 'face' | 'arms' | 'legs'

/** Pair groups that pose models tend to mislabel together (a whole limb flips, not one joint). */
export const SWAP_GROUPS: Readonly<Record<SwapGroupName, ReadonlyArray<readonly [LM, LM]>>> = {
  face: LEFT_RIGHT_PAIRS.slice(0, 5),
  arms: LEFT_RIGHT_PAIRS.slice(5, 11),
  legs: LEFT_RIGHT_PAIRS.slice(11),
}

/** MIRROR_INDEX[i] is the landmark on the opposite side (NOSE maps to itself). */
export const MIRROR_INDEX: readonly number[] = (() => {
  const mirror = Array.from({ length: LANDMARK_COUNT }, (_, i) => i)
  for (const [left, right] of LEFT_RIGHT_PAIRS) {
    mirror[left] = right
    mirror[right] = left
  }
  return mirror
})()

/** Shoulders, elbows, wrists, hips, knees, ankles: the joints serve metrics depend on. */
export const CORE_LANDMARKS: readonly LM[] = [
  LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_ELBOW, LM.RIGHT_ELBOW,
  LM.LEFT_WRIST, LM.RIGHT_WRIST, LM.LEFT_HIP, LM.RIGHT_HIP,
  LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
]

/** Hand-side landmarks that move fastest during the swing (motion blur, largest errors). */
export const FAST_ARM_LANDMARKS: readonly LM[] = [
  LM.LEFT_ELBOW, LM.RIGHT_ELBOW, LM.LEFT_WRIST, LM.RIGHT_WRIST,
  LM.LEFT_PINKY, LM.RIGHT_PINKY, LM.LEFT_INDEX, LM.RIGHT_INDEX,
  LM.LEFT_THUMB, LM.RIGHT_THUMB,
]

/** Mean visibility of the 12 core joints: the pose score (tasks-vision exposes no per-pose score). */
export function meanCoreVisibility(landmarks: readonly Landmark[]): number {
  return CORE_LANDMARKS.reduce((sum, i) => sum + (landmarks[i]?.visibility ?? 0), 0) / CORE_LANDMARKS.length
}

export function isFiniteLandmark(lm: Landmark | undefined): lm is Landmark {
  return lm !== undefined && Number.isFinite(lm.x) && Number.isFinite(lm.y)
}

/** True when the landmark has finite coordinates and at least `minVisibility`. */
export function isUsable(lm: Landmark | undefined, minVisibility: number): lm is Landmark {
  return isFiniteLandmark(lm) && (lm.visibility ?? 0) >= minVisibility
}

export function toHeightUnits(p: Point2, frameAspect: number): Point2 {
  return { x: p.x * frameAspect, y: p.y }
}

export function fromHeightUnits(p: Point2, frameAspect: number): Point2 {
  return { x: p.x / frameAspect, y: p.y }
}

/** Euclidean distance between two normalised points, in frame-height units. */
export function distanceHU(a: Point2, b: Point2, frameAspect: number): number {
  return Math.hypot((a.x - b.x) * frameAspect, a.y - b.y)
}

export function midpoint(a: Point2, b: Point2): Point2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Midpoint of two landmarks when both are usable, otherwise null. */
export function landmarkMidpoint(
  landmarks: readonly Landmark[],
  a: LM,
  b: LM,
  minVisibility: number,
): Point2 | null {
  const la = landmarks[a]
  const lb = landmarks[b]
  if (!isUsable(la, minVisibility) || !isUsable(lb, minVisibility)) return null
  return midpoint(la, lb)
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Median absolute deviation (unscaled). */
export function medianAbsDeviation(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const m = median(values)
  return median(values.map((v) => Math.abs(v - m)))
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function cloneLandmarks(landmarks: readonly Landmark[]): Landmark[] {
  return landmarks.map((lm) => ({ ...lm }))
}
