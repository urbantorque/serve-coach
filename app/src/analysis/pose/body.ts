/**
 * 2D body geometry from pose landmarks: standing height, metric scale, handedness,
 * camera-facing side, joint angles, foot positions and a per-frame tracking quality.
 *
 * Every function works in frame-height units (HU, see landmarks.ts) so angles are
 * not distorted by the frame's aspect ratio.
 *
 * 2D PROJECTION CAVEATS (apply to everything in this file):
 * - A 2D angle equals the true 3D joint angle only when the limb's plane is parallel to
 *   the image plane. Knee flexion seen from the side is close to true; seen from behind
 *   it is strongly underestimated (a bent knee pointing at the camera looks straight).
 * - Lengths are foreshortened when a segment points toward or away from the camera.
 * - A pixels-to-metres scale from body height is valid only at the player's depth.
 *   The ball after contact, the far baseline and the net are at other depths.
 * - Phone wide lenses add barrel distortion near the frame edges; the player should
 *   be near the centre of the frame for scale-dependent metrics.
 */
import { LM, type Handedness, type Landmark, type PoseFrame } from '../types.ts'
import {
  CORE_LANDMARKS,
  type Point2,
  clamp,
  distanceHU,
  isUsable,
  landmarkMidpoint,
  median,
  medianAbsDeviation,
} from './landmarks.ts'

/**
 * Approximate adult proportions as fractions of stature H (Drillis & Contini 1966 and
 * common anthropometric tables). They only need to be right to a few percent: they
 * turn eye level into top-of-head, not the whole height.
 */
export const ANTHROPOMETRY = {
  /** Shoulder landmark separation (near the acromia), fraction of stature. */
  shoulderWidthPerStature: 0.22,
  /** Shoulder-midpoint to hip-midpoint (MediaPipe landmarks), fraction of stature. */
  torsoPerStature: 0.29,
  /** Top of head (vertex) above the eyes, fraction of stature (~11-12 cm for adults). */
  vertexAboveEyesPerStature: 0.066,
  /** Top of head above the ear landmarks. */
  vertexAboveEarsPerStature: 0.075,
  /** Top of head above the nose tip. */
  vertexAboveNosePerStature: 0.096,
  /** Ankle landmark above the floor. */
  ankleHeightPerStature: 0.039,
} as const

export type Side = 'left' | 'right'

const SIDE_LANDMARKS = {
  left: {
    shoulder: LM.LEFT_SHOULDER, elbow: LM.LEFT_ELBOW, wrist: LM.LEFT_WRIST,
    hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE,
    heel: LM.LEFT_HEEL, toe: LM.LEFT_FOOT_INDEX,
  },
  right: {
    shoulder: LM.RIGHT_SHOULDER, elbow: LM.RIGHT_ELBOW, wrist: LM.RIGHT_WRIST,
    hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE,
    heel: LM.RIGHT_HEEL, toe: LM.RIGHT_FOOT_INDEX,
  },
} as const

export const DEFAULT_MIN_VISIBILITY = 0.3

// ---------------------------------------------------------------------------
// Angles
// ---------------------------------------------------------------------------

/** Interior angle ABC at vertex b in degrees [0, 180], or null for a zero-length segment. */
export function interiorAngleDeg(a: Point2, b: Point2, c: Point2, frameAspect: number): number | null {
  const bax = (a.x - b.x) * frameAspect
  const bay = a.y - b.y
  const bcx = (c.x - b.x) * frameAspect
  const bcy = c.y - b.y
  const lenA = Math.hypot(bax, bay)
  const lenC = Math.hypot(bcx, bcy)
  if (lenA < 1e-9 || lenC < 1e-9) return null
  const cos = clamp((bax * bcx + bay * bcy) / (lenA * lenC), -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

function flexionDeg(
  landmarks: readonly Landmark[],
  proximal: LM,
  joint: LM,
  distal: LM,
  frameAspect: number,
  minVisibility: number,
): number | null {
  const a = landmarks[proximal]
  const b = landmarks[joint]
  const c = landmarks[distal]
  if (!isUsable(a, minVisibility) || !isUsable(b, minVisibility) || !isUsable(c, minVisibility)) return null
  const interior = interiorAngleDeg(a, b, c, frameAspect)
  return interior === null ? null : 180 - interior
}

/** 2D knee flexion: 0 = straight leg, 90 = right angle. See the projection caveats above. */
export function kneeFlexionDeg(
  landmarks: readonly Landmark[],
  side: Side,
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): number | null {
  const s = SIDE_LANDMARKS[side]
  return flexionDeg(landmarks, s.hip, s.knee, s.ankle, frameAspect, minVisibility)
}

/** 2D elbow flexion: 0 = fully extended arm. */
export function elbowFlexionDeg(
  landmarks: readonly Landmark[],
  side: Side,
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): number | null {
  const s = SIDE_LANDMARKS[side]
  return flexionDeg(landmarks, s.shoulder, s.elbow, s.wrist, frameAspect, minVisibility)
}

export interface TrunkInclination {
  /** Angle of hip-mid -> shoulder-mid from image vertical, 0..180. */
  deg: number
  /** Signed: positive when the shoulders are to image-right (+x) of the hips. */
  signedDeg: number
}

/**
 * Trunk inclination from vertical using hip-mid to shoulder-mid. In a side view this is
 * forward/back lean; in a rear view it is lateral lean (shoulder-over-shoulder tilt of
 * the trunk). Assumes the phone is held level (no camera roll).
 */
export function trunkInclinationDeg(
  landmarks: readonly Landmark[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): TrunkInclination | null {
  const shoulderMid = landmarkMidpoint(landmarks, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, minVisibility)
  const hipMid = landmarkMidpoint(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP, minVisibility)
  if (!shoulderMid || !hipMid) return null
  const dx = (shoulderMid.x - hipMid.x) * frameAspect
  const up = hipMid.y - shoulderMid.y // image y grows downward
  if (Math.hypot(dx, up) < 1e-9) return null
  const signedDeg = (Math.atan2(dx, up) * 180) / Math.PI
  return { deg: Math.abs(signedDeg), signedDeg }
}

/**
 * Angle of segment a->b above image horizontal in degrees (-180..180, positive when b is
 * higher than a). Useful for the shoulder line tilt at trophy and contact.
 */
export function segmentElevationDeg(a: Point2, b: Point2, frameAspect: number): number | null {
  const dx = (b.x - a.x) * frameAspect
  const up = a.y - b.y
  if (Math.hypot(dx, up) < 1e-9) return null
  return (Math.atan2(up, dx) * 180) / Math.PI
}

// ---------------------------------------------------------------------------
// Body height and scale
// ---------------------------------------------------------------------------

/**
 * True shoulder width is not observable in a side view (the shoulders overlap), so the
 * reference width is the larger of the 2D shoulder width and a torso-length estimate.
 * Returns HU, or null if neither is measurable.
 */
export function shoulderScaleHU(
  landmarks: readonly Landmark[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): number | null {
  const ls = landmarks[LM.LEFT_SHOULDER]
  const rs = landmarks[LM.RIGHT_SHOULDER]
  const width = isUsable(ls, minVisibility) && isUsable(rs, minVisibility) ? distanceHU(ls, rs, frameAspect) : 0
  const torso = torsoLengthHU(landmarks, frameAspect, minVisibility)
  const fromTorso = torso === null ? 0 : (torso * ANTHROPOMETRY.shoulderWidthPerStature) / ANTHROPOMETRY.torsoPerStature
  const scale = Math.max(width, fromTorso)
  return scale > 0 ? scale : null
}

/** Shoulder-mid to hip-mid distance in HU. */
export function torsoLengthHU(
  landmarks: readonly Landmark[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): number | null {
  const shoulderMid = landmarkMidpoint(landmarks, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, minVisibility)
  const hipMid = landmarkMidpoint(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP, minVisibility)
  if (!shoulderMid || !hipMid) return null
  return distanceHU(shoulderMid, hipMid, frameAspect)
}

export interface HeadTopEstimate {
  y: number
  /** Which face landmarks contributed ('eyes', 'ears', 'nose'). */
  basis: string[]
}

/**
 * Top of head (vertex) y, normalised. The model has no landmark above the eyes, so the
 * vertex is placed above the eyes / ears / nose by an anthropometric offset scaled by
 * the shoulder scale (itself ~0.22 H). Median of the available estimates.
 */
export function estimateHeadTopY(
  landmarks: readonly Landmark[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): HeadTopEstimate | null {
  const scale = shoulderScaleHU(landmarks, frameAspect, minVisibility)
  if (scale === null) return null
  const staturePerScale = 1 / ANTHROPOMETRY.shoulderWidthPerStature
  const candidates: number[] = []
  const basis: string[] = []
  const eyes = landmarkMidpoint(landmarks, LM.LEFT_EYE, LM.RIGHT_EYE, minVisibility)
  if (eyes) {
    candidates.push(eyes.y - ANTHROPOMETRY.vertexAboveEyesPerStature * staturePerScale * scale)
    basis.push('eyes')
  }
  const ears = earLevel(landmarks, minVisibility)
  if (ears !== null) {
    candidates.push(ears - ANTHROPOMETRY.vertexAboveEarsPerStature * staturePerScale * scale)
    basis.push('ears')
  }
  const nose = landmarks[LM.NOSE]
  if (isUsable(nose, minVisibility)) {
    candidates.push(nose.y - ANTHROPOMETRY.vertexAboveNosePerStature * staturePerScale * scale)
    basis.push('nose')
  }
  if (candidates.length === 0) return null
  return { y: median(candidates), basis }
}

/** In a side view only one ear is visible; use whichever ears are usable. */
function earLevel(landmarks: readonly Landmark[], minVisibility: number): number | null {
  const ys = [landmarks[LM.LEFT_EAR], landmarks[LM.RIGHT_EAR]]
    .filter((lm): lm is Landmark => isUsable(lm, minVisibility))
    .map((lm) => lm.y)
  return ys.length === 0 ? null : ys.reduce((sum, y) => sum + y, 0) / ys.length
}

/** Lowest foot point (largest y): heel or toe; ankle plus an offset as a fallback. */
export function estimateFloorY(
  landmarks: readonly Landmark[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): number | null {
  const footYs = [LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]
    .map((i) => landmarks[i])
    .filter((lm): lm is Landmark => isUsable(lm, minVisibility))
    .map((lm) => lm.y)
  if (footYs.length > 0) return Math.max(...footYs)
  const ankleYs = [landmarks[LM.LEFT_ANKLE], landmarks[LM.RIGHT_ANKLE]]
    .filter((lm): lm is Landmark => isUsable(lm, minVisibility))
    .map((lm) => lm.y)
  const scale = shoulderScaleHU(landmarks, frameAspect, minVisibility)
  if (ankleYs.length === 0 || scale === null) return null
  const ankleOffset = (ANTHROPOMETRY.ankleHeightPerStature / ANTHROPOMETRY.shoulderWidthPerStature) * scale
  return Math.max(...ankleYs) + ankleOffset
}

/**
 * Vertical head-top-to-floor extent for one frame, in HU (fraction of frame height).
 * Only meaningful when the player stands upright; see estimateStandingBodyHeight.
 */
export function bodyHeightInFrameHU(
  landmarks: readonly Landmark[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): number | null {
  const head = estimateHeadTopY(landmarks, frameAspect, minVisibility)
  const floor = estimateFloorY(landmarks, frameAspect, minVisibility)
  if (!head || floor === null) return null
  const height = floor - head.y
  return height > 0 ? height : null
}

export interface BodyHeightOptions {
  frameAspect: number
  /** Frame height in pixels, to also report pixels. */
  frameHeightPx?: number
  /** Inclusive frameIndex range of the setup phase. Defaults to the first `setupWindowS` seconds. */
  setupFrames?: { startFrame: number; endFrame: number }
  setupWindowS?: number
  /** Upright filter: frames with more knee flexion or trunk lean than this are skipped. */
  maxUprightKneeFlexionDeg?: number
  maxUprightTrunkLeanDeg?: number
  minVisibility?: number
}

export interface BodyHeightEstimate {
  /** Standing height as a fraction of frame height (HU). */
  heightHU: number
  heightPx?: number
  framesUsed: number
  /** Median absolute deviation of the per-frame estimates, HU. */
  madHU: number
  confidence: number
  method: 'setup-upright-median' | 'fallback-p90'
}

/**
 * Standing body height in the frame from setup frames: median over upright frames of
 * (floor - head top). Falls back to the 90th percentile over the whole clip when no
 * upright setup frames exist (low confidence). Knee bend or trunk lean in the chosen
 * frames makes this an underestimate, which inflates any derived metres-per-unit scale.
 */
export function estimateStandingBodyHeight(
  frames: readonly PoseFrame[],
  options: BodyHeightOptions,
): BodyHeightEstimate | null {
  const {
    frameAspect,
    frameHeightPx,
    setupWindowS = 1.0,
    maxUprightKneeFlexionDeg = 25,
    maxUprightTrunkLeanDeg = 25,
    minVisibility = 0.5,
  } = options
  const withPose = frames.filter((f) => f.landmarks !== null)
  if (withPose.length === 0) return null

  const inSetup = options.setupFrames
    ? withPose.filter((f) => f.frameIndex >= options.setupFrames!.startFrame && f.frameIndex <= options.setupFrames!.endFrame)
    : withPose.filter((f) => f.tReal - withPose[0].tReal <= setupWindowS)

  const uprightHeights: number[] = []
  for (const frame of inSetup) {
    const lms = frame.landmarks!
    if (!isUpright(lms, frameAspect, maxUprightKneeFlexionDeg, maxUprightTrunkLeanDeg, minVisibility)) continue
    const h = bodyHeightInFrameHU(lms, frameAspect, minVisibility)
    if (h !== null) uprightHeights.push(h)
  }

  const finish = (heightHU: number, used: number, mad: number, confidence: number, method: BodyHeightEstimate['method']): BodyHeightEstimate => ({
    heightHU,
    heightPx: frameHeightPx === undefined ? undefined : heightHU * frameHeightPx,
    framesUsed: used,
    madHU: mad,
    confidence,
    method,
  })

  if (uprightHeights.length > 0) {
    const h = median(uprightHeights)
    const mad = medianAbsDeviation(uprightHeights)
    // More frames and lower spread -> more confidence. 10+ frames with <2% spread ~ 1.
    const countFactor = Math.min(1, uprightHeights.length / 10)
    const spreadFactor = clamp(1 - mad / h / 0.05, 0, 1)
    return finish(h, uprightHeights.length, mad, 0.4 + 0.6 * countFactor * spreadFactor, 'setup-upright-median')
  }

  const all = withPose
    .map((f) => bodyHeightInFrameHU(f.landmarks!, frameAspect, minVisibility))
    .filter((h): h is number => h !== null)
    .sort((a, b) => a - b)
  if (all.length === 0) return null
  const p90 = all[Math.min(all.length - 1, Math.floor(all.length * 0.9))]
  return finish(p90, all.length, medianAbsDeviation(all), 0.25, 'fallback-p90')
}

function isUpright(
  landmarks: readonly Landmark[],
  frameAspect: number,
  maxKneeDeg: number,
  maxTrunkDeg: number,
  minVisibility: number,
): boolean {
  for (const side of ['left', 'right'] as const) {
    const knee = kneeFlexionDeg(landmarks, side, frameAspect, minVisibility)
    if (knee !== null && knee > maxKneeDeg) return false
  }
  const trunk = trunkInclinationDeg(landmarks, frameAspect, minVisibility)
  return trunk === null || trunk.deg <= maxTrunkDeg
}

/**
 * Metres per frame-height unit at the player's depth, from their entered height.
 * Multiply an HU distance by this to get metres. Scale is 'estimated', never 'measured':
 * it inherits the head-top approximation (~±2%) and the depth caveat above.
 */
export function metresPerHeightUnit(bodyHeightHU: number, playerHeightM: number): number {
  if (!(bodyHeightHU > 0) || !(playerHeightM > 0)) throw new RangeError('body height and player height must be positive')
  return playerHeightM / bodyHeightHU
}

export function metresPerPixel(bodyHeightPx: number, playerHeightM: number): number {
  if (!(bodyHeightPx > 0) || !(playerHeightM > 0)) throw new RangeError('body height and player height must be positive')
  return playerHeightM / bodyHeightPx
}

// ---------------------------------------------------------------------------
// Handedness
// ---------------------------------------------------------------------------

export interface HandednessOptions {
  frameAspect: number
  /** Contact candidate from segmentation, if known. Otherwise the highest wrist in the clip. */
  contactFrameIndex?: number
  /** Half-width of the window around the contact candidate. */
  windowS?: number
  /** Body height (HU) to express the margin in body heights; estimated if omitted. */
  bodyHeightHU?: number
  minVisibility?: number
}

export interface HandednessEstimate {
  handedness: Handedness
  /** 0..1, from how much higher the hitting wrist peaks than the other wrist. */
  confidence: number
  /** Frame where the hitting wrist was highest. */
  peakFrameIndex: number
  /** Height difference between the two wrists' peaks, in body heights. */
  marginBodyHeights: number
}

/**
 * The hitting wrist is the one that goes highest near contact. The tossing arm also
 * rises (toss release) but earlier and lower, and it has dropped by contact, so a
 * window around the contact candidate gives a wide margin.
 * MediaPipe's LEFT/RIGHT are the person's anatomical sides, so RIGHT_WRIST highest
 * means right-handed. Run left/right swap correction (smoothing.ts) first.
 */
export function inferHandedness(frames: readonly PoseFrame[], options: HandednessOptions): HandednessEstimate | null {
  const { frameAspect, windowS = 0.15, minVisibility = DEFAULT_MIN_VISIBILITY } = options
  const withPose = frames.filter((f) => f.landmarks !== null)
  if (withPose.length === 0) return null

  let centre = withPose.find((f) => f.frameIndex === options.contactFrameIndex)
  if (!centre) centre = frameWithHighestWrist(withPose, minVisibility)
  if (!centre) return null

  const windowFrames = withPose.filter((f) => Math.abs(f.tReal - centre.tReal) <= windowS)
  const left = highestSample(windowFrames, LM.LEFT_WRIST, minVisibility)
  const right = highestSample(windowFrames, LM.RIGHT_WRIST, minVisibility)
  if (!left && !right) return null

  const bodyHeight =
    options.bodyHeightHU ?? estimateStandingBodyHeight(frames, { frameAspect })?.heightHU ?? 0.5
  if (!left || !right) {
    const only = (left ?? right)!
    return {
      handedness: left ? 'left' : 'right',
      confidence: 0.3,
      peakFrameIndex: only.frameIndex,
      marginBodyHeights: Number.NaN,
    }
  }
  const rightIsHigher = right.y <= left.y
  const margin = Math.abs(left.y - right.y) / bodyHeight
  // A 0.15 body-height gap (~26 cm) is treated as unambiguous.
  return {
    handedness: rightIsHigher ? 'right' : 'left',
    confidence: clamp(margin / 0.15, 0, 1),
    peakFrameIndex: rightIsHigher ? right.frameIndex : left.frameIndex,
    marginBodyHeights: margin,
  }
}

function frameWithHighestWrist(frames: readonly PoseFrame[], minVisibility: number): PoseFrame | undefined {
  let best: PoseFrame | undefined
  let bestY = Infinity
  for (const frame of frames) {
    for (const index of [LM.LEFT_WRIST, LM.RIGHT_WRIST]) {
      const lm = frame.landmarks![index]
      if (isUsable(lm, minVisibility) && lm.y < bestY) {
        bestY = lm.y
        best = frame
      }
    }
  }
  return best
}

function highestSample(
  frames: readonly PoseFrame[],
  index: LM,
  minVisibility: number,
): { y: number; frameIndex: number } | null {
  let best: { y: number; frameIndex: number } | null = null
  for (const frame of frames) {
    const lm = frame.landmarks![index]
    if (isUsable(lm, minVisibility) && (!best || lm.y < best.y)) best = { y: lm.y, frameIndex: frame.frameIndex }
  }
  return best
}

// ---------------------------------------------------------------------------
// Camera-facing side
// ---------------------------------------------------------------------------

/**
 * Which part of the body faces the camera:
 * 'front' - chest toward camera, 'back' - back toward camera,
 * 'left' / 'right' - that side of the body is nearest the camera (profile view).
 */
export type FacingSide = 'front' | 'back' | 'left' | 'right' | 'unknown'

export interface FacingEstimate {
  side: FacingSide
  /** Fraction of voting frames that agreed, 0..1. */
  confidence: number
  /** Median horizontal shoulder separation / torso length (0 = profile, ~0.75 = square on). */
  shoulderRatio: number
  framesUsed: number
}

/** Above this shoulder-separation-to-torso ratio the view is treated as front or back. */
const SQUARE_ON_RATIO = 0.45

/** Per-frame facing vote. Exported for tests and for per-phase use. */
export function facingSideInFrame(
  landmarks: readonly Landmark[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): { side: FacingSide; shoulderRatio: number } {
  const ls = landmarks[LM.LEFT_SHOULDER]
  const rs = landmarks[LM.RIGHT_SHOULDER]
  const torso = torsoLengthHU(landmarks, frameAspect, minVisibility)
  if (!isUsable(ls, 0) || !isUsable(rs, 0) || torso === null || torso <= 0) {
    return { side: 'unknown', shoulderRatio: Number.NaN }
  }
  const dxHU = (ls.x - rs.x) * frameAspect
  const ratio = Math.abs(dxHU) / torso
  if (ratio >= SQUARE_ON_RATIO) {
    // Facing the camera, the person's left shoulder appears on image right (+x).
    // Pose models sometimes label left/right as if the person faced the camera when they
    // face away, so a strongly contradicting nose visibility overrides the ordering.
    const noseVisibility = landmarks[LM.NOSE]?.visibility ?? 0.5
    const byOrder: FacingSide = dxHU > 0 ? 'front' : 'back'
    if (byOrder === 'back' && noseVisibility > 0.9) return { side: 'front', shoulderRatio: ratio }
    if (byOrder === 'front' && noseVisibility < 0.1) return { side: 'back', shoulderRatio: ratio }
    return { side: byOrder, shoulderRatio: ratio }
  }
  // Profile: the near side has smaller z (MediaPipe z is depth, smaller = closer), or
  // failing that, higher visibility (the far side is occluded by the torso).
  const nearByZ = profileNearSideByZ(landmarks)
  if (nearByZ) return { side: nearByZ, shoulderRatio: ratio }
  const leftVis = meanVisibility(landmarks, [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE])
  const rightVis = meanVisibility(landmarks, [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE])
  if (Math.abs(leftVis - rightVis) < 0.05) return { side: 'unknown', shoulderRatio: ratio }
  return { side: leftVis > rightVis ? 'left' : 'right', shoulderRatio: ratio }
}

function profileNearSideByZ(landmarks: readonly Landmark[]): Side | null {
  const pairs: Array<[LM, LM]> = [
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    [LM.LEFT_HIP, LM.RIGHT_HIP],
  ]
  let diff = 0
  let count = 0
  for (const [l, r] of pairs) {
    const zl = landmarks[l]?.z
    const zr = landmarks[r]?.z
    if (zl === undefined || zr === undefined || !Number.isFinite(zl) || !Number.isFinite(zr)) continue
    diff += zl - zr
    count++
  }
  if (count === 0 || Math.abs(diff / count) < 0.02) return null
  return diff < 0 ? 'left' : 'right'
}

function meanVisibility(landmarks: readonly Landmark[], indices: readonly LM[]): number {
  let sum = 0
  for (const i of indices) sum += landmarks[i]?.visibility ?? 0
  return sum / indices.length
}

/** Majority vote over frames (use setup frames for the camera view). */
export function estimateFacingSide(
  frames: readonly PoseFrame[],
  frameAspect: number,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): FacingEstimate {
  const votes = new Map<FacingSide, number>()
  const ratios: number[] = []
  let used = 0
  for (const frame of frames) {
    if (!frame.landmarks) continue
    const vote = facingSideInFrame(frame.landmarks, frameAspect, minVisibility)
    if (vote.side === 'unknown') continue
    votes.set(vote.side, (votes.get(vote.side) ?? 0) + 1)
    ratios.push(vote.shoulderRatio)
    used++
  }
  if (used === 0) return { side: 'unknown', confidence: 0, shoulderRatio: Number.NaN, framesUsed: 0 }
  let best: FacingSide = 'unknown'
  let bestCount = 0
  for (const [side, count] of votes) {
    if (count > bestCount) {
      best = side
      bestCount = count
    }
  }
  return { side: best, confidence: bestCount / used, shoulderRatio: median(ratios), framesUsed: used }
}

// ---------------------------------------------------------------------------
// Feet
// ---------------------------------------------------------------------------

export interface FootPoints {
  heel: Landmark | null
  toe: Landmark | null
  ankle: Landmark | null
}

export function footPoints(landmarks: readonly Landmark[], side: Side, minVisibility = DEFAULT_MIN_VISIBILITY): FootPoints {
  const s = SIDE_LANDMARKS[side]
  const pick = (i: LM) => (isUsable(landmarks[i], minVisibility) ? landmarks[i] : null)
  return { heel: pick(s.heel), toe: pick(s.toe), ankle: pick(s.ankle) }
}

/**
 * The front foot in a serve stance is on the non-hitting side (left foot for a
 * right-hander). This is a stance convention, not a measurement: a player who steps
 * through (pinpoint/foot-up) still has that foot forward at the start.
 */
export function frontFootSide(handedness: Handedness): Side {
  return handedness === 'right' ? 'left' : 'right'
}

/** Front-foot toe (FOOT_INDEX landmark), or null when not usable. */
export function frontFootToe(
  landmarks: readonly Landmark[],
  handedness: Handedness,
  minVisibility = DEFAULT_MIN_VISIBILITY,
): Landmark | null {
  return footPoints(landmarks, frontFootSide(handedness), minVisibility).toe
}

// ---------------------------------------------------------------------------
// Tracking quality
// ---------------------------------------------------------------------------

export interface TrackingQuality {
  /** 0..1 heuristic (experimental, not validated). 0 when no pose. */
  score: number
  coreVisibility: number
  coreCoverage: number
  inFrameFraction: number
  scaleConsistency: number
  interpolatedFraction: number
}

export interface TrackingQualityOptions {
  frameAspect: number
  /** Reference standing height (HU) to check the torso size against. */
  bodyHeightHU?: number
}

/**
 * Per-frame tracking quality: product of core joint visibility, the fraction of core
 * joints confidently seen, the fraction of landmarks inside the frame, torso-size
 * consistency with the standing height, and a penalty for interpolated landmarks.
 */
export function trackingQuality(frame: PoseFrame, options: TrackingQualityOptions): TrackingQuality {
  const empty: TrackingQuality = {
    score: 0, coreVisibility: 0, coreCoverage: 0, inFrameFraction: 0, scaleConsistency: 0, interpolatedFraction: 1,
  }
  const lms = frame.landmarks
  if (!lms || lms.length === 0) return empty

  let visSum = 0
  let covered = 0
  for (const i of CORE_LANDMARKS) {
    const v = lms[i]?.interpolated ? 0 : lms[i]?.visibility ?? 0
    visSum += v
    if (v >= 0.5) covered++
  }
  const coreVisibility = visSum / CORE_LANDMARKS.length
  const coreCoverage = covered / CORE_LANDMARKS.length

  const margin = 0.02
  let inFrame = 0
  let interpolated = 0
  for (const lm of lms) {
    if (lm.x >= -margin && lm.x <= 1 + margin && lm.y >= -margin && lm.y <= 1 + margin) inFrame++
    if (lm.interpolated) interpolated++
  }
  const inFrameFraction = inFrame / lms.length
  const interpolatedFraction = interpolated / lms.length

  let scaleConsistency = 1
  if (options.bodyHeightHU !== undefined) {
    const torso = torsoLengthHU(lms, options.frameAspect, 0)
    if (torso !== null) {
      // Lean toward the camera shortens the 2D torso, so the accepted band is wide.
      const ratio = torso / (ANTHROPOMETRY.torsoPerStature * options.bodyHeightHU)
      scaleConsistency = ratio < 0.5 ? clamp(ratio / 0.5, 0, 1) : ratio > 1.4 ? clamp(1.4 / ratio, 0, 1) : 1
    }
  }

  const score =
    Math.sqrt(coreVisibility) * coreCoverage * inFrameFraction * scaleConsistency * (1 - 0.5 * interpolatedFraction)
  return { score, coreVisibility, coreCoverage, inFrameFraction, scaleConsistency, interpolatedFraction }
}
