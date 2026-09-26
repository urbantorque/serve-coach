/**
 * Segment lengths from standard height ratios (Drillis & Contini 1966 as tabulated by Winter,
 * "Biomechanics and Motor Control of Human Movement"). All values scale linearly with height.
 */
export const RATIOS = {
  eyeHeight: 0.936,
  chinHeight: 0.87,
  shoulderHeight: 0.818,
  hipHeight: 0.53,
  kneeHeight: 0.285,
  ankleHeight: 0.039,
  shoulderWidth: 0.259, // biacromial, between shoulder joint centres
  hipJointWidth: 0.105, // between hip joint centres (narrower than bitrochanteric 0.191)
  upperArm: 0.186,
  forearm: 0.146,
  hand: 0.108,
  footLength: 0.152,
  footWidth: 0.055,
} as const

export interface Anthropometry {
  heightM: number
  thighM: number
  shankM: number
  upperArmM: number
  forearmM: number
  handM: number
  /** Mid-hip to mid-shoulder distance. */
  trunkM: number
  shoulderHalfWidthM: number
  hipHalfWidthM: number
  /** Mid-shoulder to head centre (ear level). */
  neckToHeadCentreM: number
  hipHeightM: number
  ankleHeightM: number
  footLengthM: number
  /** Horizontal ankle-to-toe-tip distance (foot index landmark). */
  ankleToToeM: number
  /** Horizontal ankle-to-heel distance (heel landmark). */
  ankleToHeelM: number
  footWidthM: number
  /** Head dimensions: front-back length, width, crown-to-chin height. */
  headLengthM: number
  headWidthM: number
  headHeightM: number
  /** Scale relative to a 1.80 m reference body, used for small feature offsets. */
  s: number
}

export function anthropometry(heightM: number): Anthropometry {
  const H = heightM
  const R = RATIOS
  const s = H / 1.8
  const footLengthM = R.footLength * H
  return {
    heightM: H,
    thighM: (R.hipHeight - R.kneeHeight) * H,
    shankM: (R.kneeHeight - R.ankleHeight) * H,
    upperArmM: R.upperArm * H,
    forearmM: R.forearm * H,
    handM: R.hand * H,
    trunkM: (R.shoulderHeight - R.hipHeight) * H,
    shoulderHalfWidthM: (R.shoulderWidth * H) / 2,
    hipHalfWidthM: (R.hipJointWidth * H) / 2,
    neckToHeadCentreM: 0.1 * H,
    hipHeightM: R.hipHeight * H,
    ankleHeightM: R.ankleHeight * H,
    footLengthM,
    ankleToToeM: 0.74 * footLengthM,
    ankleToHeelM: 0.2 * footLengthM,
    footWidthM: R.footWidth * H,
    headLengthM: 0.2 * s,
    headWidthM: 0.155 * s,
    headHeightM: 0.235 * s,
    s,
  }
}

/** Shoulder-to-wrist reach with a straight elbow. */
export const armReachM = (a: Anthropometry): number => a.upperArmM + a.forearmM
/** Hip-to-ankle length with a straight knee. */
export const legLengthM = (a: Anthropometry): number => a.thighM + a.shankM
