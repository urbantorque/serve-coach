/**
 * Image scale from the player's body, and a toss region of interest from pose.
 * "fhu" = frame-height units: normalised y, and normalised x multiplied by aspect
 * (width / height), so distances are isotropic.
 */
import { LM, type Handedness, type Landmark } from '../types.ts'

/** ITF ball diameter is 6.54-6.86 cm; the midpoint is used. */
export const BALL_DIAMETER_M = 0.067
export const BALL_RADIUS_M = BALL_DIAMETER_M / 2
export const GRAVITY_MPS2 = 9.81
/** Adult population default when the player has not entered a height (AU adult mean is ~1.71-1.78 m). */
export const DEFAULT_PLAYER_HEIGHT_M = 1.75
/** 1-sigma relative spread of adult stature around the default (~9 cm). */
export const DEFAULT_HEIGHT_REL_SIGMA = 0.05
/** 1-sigma relative error of a self-reported height (~2 cm). */
export const ENTERED_HEIGHT_REL_SIGMA = 0.012

/** Image scale: frame-height units per metre at the player's depth, with a 1-sigma relative error. */
export interface PixelScale {
  unitsPerM: number
  relSigma: number
  basis: string
}

export interface RegionOfInterest {
  /** Normalised [0,1] bounds, x0 < x1, y0 < y1. */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface BodyHeightEstimate {
  /** Standing stature in frame-height units. */
  heightNorm: number
  /** 1-sigma relative error of the pose-derived stature (landmark noise, posture). */
  relSigma: number
  /** Normalised y of the floor under the feet. */
  groundY: number
  /** Normalised y of the top of the head. */
  headTopY: number
}

// Nose tip sits ~7.5% of stature below the vertex; the heel landmark ~1% above the floor,
// the ankle ~4%. Hence stature = (heel - nose) / 0.915 or (ankle - nose) / 0.885.
const NOSE_FRACTION = 0.925
const HEEL_FRACTION = 0.01
const ANKLE_FRACTION = 0.04
/**
 * Landmark visibility floor, as in the pose layer. A profile face (side view) often reports
 * a low nose visibility although its position is still usable; the setup median absorbs noise.
 */
const POSE_MIN_VISIBILITY = 0.3

function visible(lm: Landmark | undefined, minVisibility: number): lm is Landmark {
  return !!lm && lm.visibility >= minVisibility && Number.isFinite(lm.x) && Number.isFinite(lm.y)
}

/**
 * Standing stature in the frame from one pose. Use a frame where the player stands upright
 * (setup phase) and take the median over several frames. Returns null when the nose or
 * both feet are not visible.
 */
export function bodyHeightFromPose(landmarks: Landmark[], aspect: number, minVisibility = POSE_MIN_VISIBILITY): BodyHeightEstimate | null {
  const nose = landmarks[LM.NOSE]
  if (!visible(nose, minVisibility)) return null
  const feet: { lm: Landmark; floorFraction: number }[] = []
  for (const index of [LM.LEFT_HEEL, LM.RIGHT_HEEL]) {
    if (visible(landmarks[index], minVisibility)) feet.push({ lm: landmarks[index], floorFraction: HEEL_FRACTION })
  }
  if (feet.length === 0) {
    for (const index of [LM.LEFT_ANKLE, LM.RIGHT_ANKLE]) {
      if (visible(landmarks[index], minVisibility)) feet.push({ lm: landmarks[index], floorFraction: ANKLE_FRACTION })
    }
  }
  if (feet.length === 0) return null
  const footX = feet.reduce((s, f) => s + f.lm.x, 0) / feet.length
  const footY = feet.reduce((s, f) => s + f.lm.y, 0) / feet.length
  const floorFraction = feet[0].floorFraction
  const noseToFoot = Math.hypot((footX - nose.x) * aspect, footY - nose.y)
  if (!(noseToFoot > 0)) return null
  const heightNorm = noseToFoot / (NOSE_FRACTION - floorFraction)
  return {
    heightNorm,
    relSigma: floorFraction === HEEL_FRACTION ? 0.03 : 0.04,
    groundY: footY + floorFraction * heightNorm,
    headTopY: nose.y - (1 - NOSE_FRACTION) * heightNorm,
  }
}

/**
 * Scale from stature in frame and the player's real height. Valid at the player's depth
 * only: a ball well in front of or behind the player has a different scale.
 */
export function scaleFromBodyHeight(
  bodyHeightNorm: number,
  bodyHeightRelSigma: number,
  playerHeightM: number | null,
): PixelScale {
  const entered = playerHeightM !== null && playerHeightM > 0
  const heightM = entered ? playerHeightM : DEFAULT_PLAYER_HEIGHT_M
  const heightRelSigma = entered ? ENTERED_HEIGHT_REL_SIGMA : DEFAULT_HEIGHT_REL_SIGMA
  return {
    unitsPerM: bodyHeightNorm / heightM,
    relSigma: Math.hypot(bodyHeightRelSigma, heightRelSigma),
    basis: entered
      ? `player height ${heightM.toFixed(2)} m (entered) vs stature in frame`
      : `assumed adult height ${heightM.toFixed(2)} m vs stature in frame`,
  }
}

/** Expected ball radius in frame-height units at the player's depth. */
export function expectedBallRadiusNorm(scale: Pick<PixelScale, 'unitsPerM'>): number {
  return BALL_RADIUS_M * scale.unitsPerM
}

/**
 * Vertical band above the tossing hand where the toss should appear. The tossing hand is
 * the non-dominant one. The band spans both shoulders and the tossing wrist horizontally,
 * widened by a margin, and runs from the top of the frame to just below the tossing wrist.
 */
export function tossRegionFromPose(
  landmarks: Landmark[],
  handedness: Handedness,
  aspect: number,
  bodyHeightNorm: number,
  minVisibility = POSE_MIN_VISIBILITY,
): RegionOfInterest | null {
  const tossWrist = landmarks[handedness === 'right' ? LM.LEFT_WRIST : LM.RIGHT_WRIST]
  const shoulders = [landmarks[LM.LEFT_SHOULDER], landmarks[LM.RIGHT_SHOULDER]].filter((lm) =>
    visible(lm, minVisibility),
  )
  if (!visible(tossWrist, minVisibility) || shoulders.length === 0) return null
  const xs = [tossWrist.x, ...shoulders.map((s) => s.x)]
  const marginX = (0.45 * bodyHeightNorm) / aspect
  const bottom = Math.max(tossWrist.y, ...shoulders.map((s) => s.y)) + 0.12 * bodyHeightNorm
  return {
    x0: Math.max(0, Math.min(...xs) - marginX),
    x1: Math.min(1, Math.max(...xs) + marginX),
    y0: 0,
    y1: Math.min(1, bottom),
  }
}
