import { LM } from '../../../../app/src/analysis/types.ts'
import { armReachM, legLengthM, type Anthropometry } from '../anthropometry.ts'
import { BALL } from '../ball.ts'
import {
  add,
  addScaled,
  basisFrom,
  cross,
  dist,
  fromBasis,
  len,
  lerp,
  mid,
  norm,
  reject,
  rotateAbout,
  scale,
  sub,
  toRad,
  yawDir,
  type Basis,
  type Vec3,
} from '../math/vec.ts'
import { bisect, smoothstep } from '../math/interp.ts'
import { flexionDeg, legSpanForFlexion, twoBoneIK } from './ik.ts'

/**
 * Canonical skeleton model. Everything here is for a RIGHT-HANDED player (hitting arm = right,
 * tossing arm and front foot = left). Left-handers are produced by mirroring the output points
 * (y -> -y) and swapping left/right labels, see mirrorPose().
 */

export interface FootState {
  /** Toe tip (foot index landmark) position, world metres. */
  toe: Vec3
  /** Direction the toes point, deg CCW from +x. */
  yawDeg: number
  /** Rotation of the foot about the toe; 0 = flat, positive = heel raised. */
  pitchDeg: number
  /** Planted feet keep the toe fixed and raise the heel automatically if the leg cannot reach. */
  planted: boolean
}

export interface ArmKey {
  /** Wrist target relative to the shoulder, thorax frame (forward, left, up), in units of arm reach. */
  wrist: Vec3
  /** Elbow pole direction, thorax frame. */
  pole: Vec3
}

export interface PostureValues {
  pelvis: Vec3
  pelvisYawDeg: number
  thoraxYawDeg: number
  /** Positive = trunk leans toward the player's left (non-hitting side for right-handers). */
  thoraxLatDeg: number
  /** Positive = trunk flexes forward (toward the chest direction). */
  thoraxFlexDeg: number
  rightArm: ArmKey
  leftArm: ArmKey
  /** Racket shaft direction (butt to tip), thorax frame. */
  racketDir: Vec3
  /** Racket face normal hint, thorax frame. */
  racketFace: Vec3
  leftFoot: FootState
  rightFoot: FootState
  /** World point the head looks at. */
  gaze: Vec3
  /** 0 = tossing palm faces up (holding/tossing), 1 = palm faces down (dribbling). */
  tossPalmDown?: number
}

/** Named 3D points that fully describe a pose. Mirroring acts on these only. */
export interface PosePoints {
  lm: Vec3[]
  pelvis: Vec3
  midShoulder: Vec3
  neckBase: Vec3
  headCentre: Vec3
  /** Unit-offset helper points for the head frame. */
  headForwardPt: Vec3
  headUpPt: Vec3
  leftHip: Vec3
  rightHip: Vec3
  leftElbow: Vec3
  rightElbow: Vec3
  /** Palm-normal helper points (wrist + palm normal * 0.05 m). */
  leftPalmPt: Vec3
  rightPalmPt: Vec3
  /** Ball centre when held in the tossing hand. */
  tossBallPt: Vec3
  /** Right-hand frame for canonical (racket) hand; after mirroring it becomes the left. */
  racketButt: Vec3
  racketTip: Vec3
  racketStringCentre: Vec3
  racketFacePt: Vec3
  /** Which hand holds the racket after any mirroring. */
  racketHand: 'left' | 'right'
  kneeFlexLeftDeg: number
  kneeFlexRightDeg: number
}

export const RACKET = {
  lengthM: 0.685,
  gripFromButtM: 0.075,
  stringCentreFromButtM: 0.525,
  headStartFromButtM: 0.36,
  headWidthM: 0.255,
} as const

export function thoraxBasis(yawDeg: number, latDeg: number, flexDeg: number): Basis {
  const f0 = yawDir(yawDeg)
  const l0 = yawDir(yawDeg + 90)
  const u0: Vec3 = [0, 0, 1]
  // Forward flexion: rotate about the left axis (u tilts toward f).
  const th = toRad(flexDeg)
  const u1 = rotateAbout(u0, l0, th)
  const f1 = rotateAbout(f0, l0, th)
  // Lateral lean: rotate about the forward axis by -lat (u tilts toward +l).
  const ph = toRad(-latDeg)
  const u2 = rotateAbout(u1, f1, ph)
  const l2 = rotateAbout(l0, f1, ph)
  return { x: f1, y: l2, z: u2 }
}

/**
 * Decompose a trunk inclination from vertical (inclinationDeg) toward a relative azimuth
 * (deg from chest-forward, positive toward the left) into this model's flex/lat angles.
 */
export function inclinationToFlexLat(inclinationDeg: number, azimuthDeg: number): { flexDeg: number; latDeg: number } {
  const I = toRad(inclinationDeg)
  const a = toRad(azimuthDeg)
  const latDeg = (Math.asin(Math.sin(I) * Math.sin(a)) * 180) / Math.PI
  const flexDeg = (Math.atan2(Math.sin(I) * Math.cos(a), Math.cos(I)) * 180) / Math.PI
  return { flexDeg, latDeg }
}

export function pelvisBasis(yawDeg: number): Basis {
  return { x: yawDir(yawDeg), y: yawDir(yawDeg + 90), z: [0, 0, 1] }
}

export function hipPositions(a: Anthropometry, pelvis: Vec3, pelvisYawDeg: number): { left: Vec3; right: Vec3 } {
  const l = yawDir(pelvisYawDeg + 90)
  return { left: addScaled(pelvis, l, a.hipHalfWidthM), right: addScaled(pelvis, l, -a.hipHalfWidthM) }
}

/** Ankle position from the toe tip, yaw and heel-lift pitch (foot rotates about the toe). */
export function ankleFromToe(a: Anthropometry, toe: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const f = yawDir(yawDeg)
  const p = toRad(pitchDeg)
  const along = -a.ankleToToeM * Math.cos(p) + a.ankleHeightM * Math.sin(p)
  const up = a.ankleToToeM * Math.sin(p) + a.ankleHeightM * Math.cos(p)
  return [toe[0] + f[0] * along, toe[1] + f[1] * along, toe[2] + up]
}

export function heelFromToe(a: Anthropometry, toe: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const f = yawDir(yawDeg)
  const p = toRad(pitchDeg)
  const back = a.ankleToToeM + a.ankleToHeelM
  const hz = 0.012 * a.s
  const along = -back * Math.cos(p) + hz * Math.sin(p)
  const up = back * Math.sin(p) + hz * Math.cos(p)
  return [toe[0] + f[0] * along, toe[1] + f[1] * along, toe[2] + up]
}

/** Toe position that puts the ankle at `ankle` for a given yaw/pitch (inverse of ankleFromToe). */
export function toeFromAnkle(a: Anthropometry, ankle: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const rel = sub(ankleFromToe(a, [0, 0, 0], yawDeg, pitchDeg), [0, 0, 0])
  return sub(ankle, rel)
}

/** Pelvis height that gives the chosen leg `flexDeg` of knee flexion with its foot where it is. */
export function kneeDrivenPelvisZ(
  a: Anthropometry,
  pelvisXY: [number, number],
  pelvisYawDeg: number,
  foot: FootState,
  side: 'left' | 'right',
  flexDeg: number,
): number {
  const hips = hipPositions(a, [pelvisXY[0], pelvisXY[1], 0], pelvisYawDeg)
  const hip = side === 'left' ? hips.left : hips.right
  const ankle = ankleFromToe(a, foot.toe, foot.yawDeg, foot.pitchDeg)
  const span = legSpanForFlexion(a.thighM, a.shankM, flexDeg)
  const e = Math.hypot(hip[0] - ankle[0], hip[1] - ankle[1])
  const vert = Math.sqrt(Math.max(span * span - e * e, (0.3 * span) ** 2))
  return ankle[2] + vert
}

export interface LegResult {
  hip: Vec3
  knee: Vec3
  ankle: Vec3
  heel: Vec3
  toe: Vec3
  pitchDeg: number
  flexDeg: number
}

export function solveLeg(a: Anthropometry, hip: Vec3, foot: FootState): LegResult {
  const L = legLengthM(a) * 0.998
  let pitch = foot.pitchDeg
  let toe = foot.toe
  let ankle = ankleFromToe(a, toe, foot.yawDeg, pitch)
  if (dist(ankle, hip) > L) {
    // Raise the heel just enough for the leg to reach (up to 75 deg). Distance is not monotonic in
    // pitch, so scan for the first reachable pitch; if none, use the closest one (leg then lifts the foot).
    // Swinging feet use the same rule, so a stretched trailing foot keeps its heel-up pose at toe-off
    // instead of snapping flat.
    const reach = (p: number) => dist(ankleFromToe(a, toe, foot.yawDeg, p), hip) - L
    const step = 1
    let prev = pitch
    let best = pitch
    let bestVal = reach(pitch)
    let found = false
    for (let p = Math.min(75, pitch + step); p <= 75 + 1e-9; p = Math.min(75, p + step)) {
      const r = reach(p)
      if (r <= 0) {
        pitch = bisect(reach, prev, p, 1e-7)
        found = true
        break
      }
      if (r < bestVal) {
        bestVal = r
        best = p
      }
      prev = p
      if (p >= 75) break
    }
    if (!found) pitch = best
    ankle = ankleFromToe(a, toe, foot.yawDeg, pitch)
  }
  const fwd = yawDir(foot.yawDeg)
  const pole: Vec3 = norm([fwd[0], fwd[1], 0.25])
  const ik = twoBoneIK(hip, ankle, a.thighM, a.shankM, pole)
  if (ik.clamped) {
    // Leg fully extended short of the target: the whole foot moves with the ankle.
    const shift = sub(ik.end, ankle)
    toe = add(toe, shift)
    ankle = ik.end
  }
  const heel = heelFromToe(a, toe, foot.yawDeg, pitch)
  return { hip, knee: ik.mid, ankle, heel, toe, pitchDeg: pitch, flexDeg: flexionDeg(hip, ik.mid, ankle) }
}

function handFrame(
  wrist: Vec3,
  elbow: Vec3,
  side: 'left' | 'right',
  thumbHint: Vec3,
  palmHint: Vec3 | null,
): { hy: Vec3; hx: Vec3; palm: Vec3 } {
  const a = norm(sub(wrist, elbow))
  // Bend the hand slightly toward the thumb hint; the un-normalised rejection fades out smoothly
  // when the hint is parallel to the forearm, so the hand never flips.
  let hy = norm(addScaled(a, reject(thumbHint, a), 0.3))
  let hx: Vec3
  let palm: Vec3
  if (palmHint) {
    let n = reject(palmHint, hy)
    if (len(n) < 1e-6) n = reject([1, 0, 0], hy)
    palm = norm(n)
    hx = side === 'right' ? cross(hy, palm) : cross(palm, hy)
  } else {
    let t = reject(thumbHint, hy)
    if (len(t) < 1e-6) t = reject([0, 0, 1], hy)
    hx = norm(t)
    palm = side === 'right' ? cross(hx, hy) : cross(hy, hx)
  }
  hy = norm(hy)
  return { hy, hx: norm(hx), palm: norm(palm) }
}

function handLandmarks(a: Anthropometry, wrist: Vec3, f: { hy: Vec3; hx: Vec3; palm: Vec3 }) {
  const Lh = a.handM
  const s = a.s
  const index = add(wrist, add(add(scale(f.hy, 0.44 * Lh), scale(f.hx, 0.03 * s)), scale(f.palm, 0.012 * s)))
  const pinky = add(wrist, add(add(scale(f.hy, 0.4 * Lh), scale(f.hx, -0.035 * s)), scale(f.palm, 0.012 * s)))
  const thumb = add(wrist, add(add(scale(f.hy, 0.24 * Lh), scale(f.hx, 0.05 * s)), scale(f.palm, 0.025 * s)))
  return { index, pinky, thumb }
}

/** Build all pose points from posture values (right-handed canonical model). */
export function assemblePose(a: Anthropometry, v: PostureValues): PosePoints {
  const s = a.s
  const lm: Vec3[] = new Array(33).fill(null).map(() => [0, 0, 0] as Vec3)
  const P = v.pelvis
  const hips = hipPositions(a, P, v.pelvisYawDeg)
  const T = thoraxBasis(v.thoraxYawDeg, v.thoraxLatDeg, v.thoraxFlexDeg)
  const midShoulder = addScaled(P, T.z, a.trunkM)
  const lSh = addScaled(midShoulder, T.y, a.shoulderHalfWidthM)
  const rSh = addScaled(midShoulder, T.y, -a.shoulderHalfWidthM)

  // Head: look at the gaze point with anatomical limits relative to the thorax.
  const neckDir = norm(add(scale(T.z, 0.72), [0, 0, 0.28]))
  const neckBase = addScaled(midShoulder, neckDir, 0.025 * s)
  const headCentreGuess = addScaled(midShoulder, neckDir, a.neckToHeadCentreM)
  const thoraxYaw = Math.atan2(T.x[1], T.x[0])
  const tHorizontal = norm([T.x[0], T.x[1], 0])
  // The head cannot look behind the chest: drop the backward horizontal component of the gaze, so a
  // target passing behind the head moves the gaze continuously (up and sideways) instead of flipping.
  const g0 = sub(v.gaze, headCentreGuess)
  const back = Math.min(0, g0[0] * tHorizontal[0] + g0[1] * tHorizontal[1])
  const g: Vec3 = [g0[0] - back * tHorizontal[0], g0[1] - back * tHorizontal[1], g0[2]]
  // Heading of the gaze. When the target is almost straight overhead its horizontal direction is
  // ill-defined, so fade toward the chest heading (elevations above ~76 deg).
  const gh = Math.hypot(g[0], g[1]) / Math.max(1e-9, Math.hypot(g[0], g[1], g[2]))
  const wYaw = smoothstep((gh - 0.05) / 0.2)
  const gHorizontal = norm([g[0], g[1], 0])
  const heading = add(scale(gHorizontal, wYaw), scale(tHorizontal, 1 - wYaw))
  let gazeYaw = Math.atan2(heading[1], heading[0])
  let rel = gazeYaw - thoraxYaw
  while (rel > Math.PI) rel -= 2 * Math.PI
  while (rel < -Math.PI) rel += 2 * Math.PI
  const maxYaw = toRad(85)
  rel = Math.max(-maxYaw, Math.min(maxYaw, rel))
  gazeYaw = thoraxYaw + rel
  let gazePitch = Math.atan2(g[2], Math.hypot(g[0], g[1]))
  gazePitch = Math.max(toRad(-45), Math.min(toRad(72), gazePitch))
  const hf: Vec3 = [Math.cos(gazePitch) * Math.cos(gazeYaw), Math.cos(gazePitch) * Math.sin(gazeYaw), Math.sin(gazePitch)]
  const headUpHint = norm(add(scale(T.z, 0.4), [0, 0, 0.6]))
  const H = basisFrom('x', hf, 'z', headUpHint)
  // Looking up tilts the head back about the neck: shift the centre slightly back.
  const headCentre = addScaled(headCentreGuess, hf, 0.012 * s)
  const hp = (f: number, l: number, u: number): Vec3 => add(headCentre, fromBasis(H, [f * s, l * s, u * s]))
  lm[LM.NOSE] = hp(0.113, 0, -0.016)
  lm[LM.LEFT_EYE_INNER] = hp(0.083, 0.016, 0.012)
  lm[LM.LEFT_EYE] = hp(0.08, 0.032, 0.012)
  lm[LM.LEFT_EYE_OUTER] = hp(0.07, 0.047, 0.012)
  lm[LM.RIGHT_EYE_INNER] = hp(0.083, -0.016, 0.012)
  lm[LM.RIGHT_EYE] = hp(0.08, -0.032, 0.012)
  lm[LM.RIGHT_EYE_OUTER] = hp(0.07, -0.047, 0.012)
  lm[LM.LEFT_EAR] = hp(-0.005, 0.077, 0)
  lm[LM.RIGHT_EAR] = hp(-0.005, -0.077, 0)
  lm[LM.MOUTH_LEFT] = hp(0.1, 0.024, -0.056)
  lm[LM.MOUTH_RIGHT] = hp(0.1, -0.024, -0.056)

  // Arms.
  const reach = armReachM(a)
  const armIK = (sh: Vec3, key: ArmKey) =>
    twoBoneIK(sh, add(sh, fromBasis(T, scale(key.wrist, reach))), a.upperArmM, a.forearmM, fromBasis(T, key.pole))
  const rArm = armIK(rSh, v.rightArm)
  const lArm = armIK(lSh, v.leftArm)

  const racketDir = norm(fromBasis(T, v.racketDir))
  const racketFaceW = fromBasis(T, v.racketFace)
  const rHand = handFrame(rArm.end, rArm.mid, 'right', racketDir, racketFaceW)
  const down = v.tossPalmDown ?? 0
  const palmHint = norm(lerp(add([0, 0, 1], scale(T.x, 0.5)), add([0, 0, -1], scale(T.x, 0.3)), down))
  const lHand = handFrame(lArm.end, lArm.mid, 'left', T.z, palmHint)

  // Racket: shaft through the fist of the right hand.
  const grip = add(rArm.end, add(scale(rHand.hy, 0.38 * a.handM), scale(rHand.palm, 0.018 * s)))
  const racketButt = addScaled(grip, racketDir, -RACKET.gripFromButtM)
  const racketTip = addScaled(racketButt, racketDir, RACKET.lengthM)
  const racketStringCentre = addScaled(racketButt, racketDir, RACKET.stringCentreFromButtM)
  let face = reject(racketFaceW, racketDir)
  if (len(face) < 1e-6) face = reject(T.x, racketDir)
  const racketFacePt = addScaled(racketStringCentre, norm(face), 0.1)

  const rh = handLandmarks(a, rArm.end, rHand)
  const lh = handLandmarks(a, lArm.end, lHand)
  const tossBallPt = add(lArm.end, add(scale(lHand.hy, 0.45 * a.handM), scale(lHand.palm, 0.028 * s + BALL.radiusM)))

  lm[LM.LEFT_SHOULDER] = lSh
  lm[LM.RIGHT_SHOULDER] = rSh
  lm[LM.LEFT_ELBOW] = lArm.mid
  lm[LM.RIGHT_ELBOW] = rArm.mid
  lm[LM.LEFT_WRIST] = lArm.end
  lm[LM.RIGHT_WRIST] = rArm.end
  lm[LM.LEFT_INDEX] = lh.index
  lm[LM.RIGHT_INDEX] = rh.index
  lm[LM.LEFT_PINKY] = lh.pinky
  lm[LM.RIGHT_PINKY] = rh.pinky
  lm[LM.LEFT_THUMB] = lh.thumb
  lm[LM.RIGHT_THUMB] = rh.thumb

  // Legs.
  const lLeg = solveLeg(a, hips.left, v.leftFoot)
  const rLeg = solveLeg(a, hips.right, v.rightFoot)
  lm[LM.LEFT_HIP] = hips.left
  lm[LM.RIGHT_HIP] = hips.right
  lm[LM.LEFT_KNEE] = lLeg.knee
  lm[LM.RIGHT_KNEE] = rLeg.knee
  lm[LM.LEFT_ANKLE] = lLeg.ankle
  lm[LM.RIGHT_ANKLE] = rLeg.ankle
  lm[LM.LEFT_HEEL] = lLeg.heel
  lm[LM.RIGHT_HEEL] = rLeg.heel
  lm[LM.LEFT_FOOT_INDEX] = lLeg.toe
  lm[LM.RIGHT_FOOT_INDEX] = rLeg.toe

  return {
    lm,
    pelvis: P,
    midShoulder,
    neckBase,
    headCentre,
    headForwardPt: addScaled(headCentre, H.x, 0.1),
    headUpPt: addScaled(headCentre, H.z, 0.1),
    leftHip: hips.left,
    rightHip: hips.right,
    leftElbow: lArm.mid,
    rightElbow: rArm.mid,
    leftPalmPt: addScaled(lArm.end, lHand.palm, 0.05),
    rightPalmPt: addScaled(rArm.end, rHand.palm, 0.05),
    tossBallPt,
    racketButt,
    racketTip,
    racketStringCentre,
    racketFacePt,
    racketHand: 'right',
    kneeFlexLeftDeg: lLeg.flexDeg,
    kneeFlexRightDeg: rLeg.flexDeg,
  }
}

/** Swap left/right landmark indices (used after mirroring). */
export const LR_SWAP: number[] = (() => {
  const m = Array.from({ length: 33 }, (_, i) => i)
  const pairs: [LM, LM][] = [
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
  for (const [l, r] of pairs) {
    m[l] = r
    m[r] = l
  }
  return m
})()

const my = (p: Vec3): Vec3 => [p[0], -p[1], p[2]]

/** Mirror a canonical (right-handed) pose into a left-handed one: y -> -y and swap left/right. */
export function mirrorPose(p: PosePoints): PosePoints {
  const lm = p.lm.map((_, i) => my(p.lm[LR_SWAP[i]]))
  return {
    lm,
    pelvis: my(p.pelvis),
    midShoulder: my(p.midShoulder),
    neckBase: my(p.neckBase),
    headCentre: my(p.headCentre),
    headForwardPt: my(p.headForwardPt),
    headUpPt: my(p.headUpPt),
    leftHip: my(p.rightHip),
    rightHip: my(p.leftHip),
    leftElbow: my(p.rightElbow),
    rightElbow: my(p.leftElbow),
    leftPalmPt: my(p.rightPalmPt),
    rightPalmPt: my(p.leftPalmPt),
    tossBallPt: my(p.tossBallPt),
    racketButt: my(p.racketButt),
    racketTip: my(p.racketTip),
    racketStringCentre: my(p.racketStringCentre),
    racketFacePt: my(p.racketFacePt),
    racketHand: p.racketHand === 'right' ? 'left' : 'right',
    kneeFlexLeftDeg: p.kneeFlexRightDeg,
    kneeFlexRightDeg: p.kneeFlexLeftDeg,
  }
}

export const mirrorPoint = my

/** Blend helper used by gaze and transitions. */
export const lerpPoint = lerp
export const midpoint = mid
