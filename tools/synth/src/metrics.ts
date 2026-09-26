import { LM } from '../../../app/src/analysis/types.ts'
import { G, kmh } from './ball.ts'
import { project, type Camera } from './camera.ts'
import { isInServiceBox } from './court.ts'
import { flexionDeg } from './kinematics/ik.ts'
import type { ClipMotion, ServePlan } from './kinematics/motion.ts'
import type { PosePoints } from './kinematics/skeleton.ts'
import { angleDeg, mid, sub, toDeg, type Vec3 } from './math/vec.ts'

/**
 * Ground-truth serve metrics, computed from the realised motion (never copied from the generating
 * parameters). Definitions are in tools/synth/README.md ("Metric definitions"). Times here are
 * absolute motion times; truth.ts shifts them to clip time.
 */

export type LegSide = 'left' | 'right'

export interface Angle2DSample {
  deg: number
  tS: number
}

export interface ServeMetrics {
  tossReleaseHeightM: number
  tossApexHeightM: number
  tossApexForwardOfFrontToeM: number
  tossApexLateralOfFrontToeM: number
  tossHeightAboveContactM: number
  contactHeightM: number
  contactHeightRatio: number
  contactForwardOfFrontToeM: number
  contactForwardOfBaselineM: number
  releaseToContactS: number
  frontLeg: LegSide
  maxFrontKneeFlexion3DDeg: number
  maxFrontKneeFlexion3DTimeS: number
  maxBackKneeFlexion3DDeg: number
  maxFrontKneeFlexion2DDeg: number
  maxFrontKneeFlexion2DTimeS: number
  frontKneeFlexion2DAtMax3DDeg: number
  trunkInclinationContact3DDeg: number
  trunkInclinationContact2DDeg: number
  trunkInclinationContact2DSignedDeg: number
  landingDistanceInsideBaselineM: number
  landingFootLateralM: number
  ballPeakSpeedKmh: number
  ballSpeedAtContactKmh: number
  avgSpeedContactToBounceKmh: number
  avgSpeedContactToBouncePathKmh: number
  avgSpeedContactToBounceHorizontalKmh: number
  flightTimeS: number
  bounceXM: number
  bounceYM: number
  bounceInServiceBox: boolean
  netClearanceM: number | null
  launchElevationDeg: number
  launchAzimuthDeg: number
  airborneS: number
  trophyPauseS: number
}

/** Landmark indices of a player's front (tossing-side) and back legs after any mirroring. */
export function legLandmarks(handedness: 'right' | 'left'): Record<'front' | 'back', { side: LegSide; hip: LM; knee: LM; ankle: LM; toe: LM }> {
  const left = { side: 'left' as const, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE, toe: LM.LEFT_FOOT_INDEX }
  const right = { side: 'right' as const, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE, toe: LM.RIGHT_FOOT_INDEX }
  return handedness === 'right' ? { front: left, back: right } : { front: right, back: left }
}

/** Unit lateral sign toward the hitting-arm side in court y (right-hander: -y). */
export const hittingSideY = (handedness: 'right' | 'left'): number => (handedness === 'right' ? -1 : 1)

/** 2D flexion (180 - interior angle) of three projected points, in pixel space (isotropic). */
export function flexion2DDeg(cam: Camera, a: Vec3, b: Vec3, c: Vec3): number {
  const pa = project(cam, a)
  const pb = project(cam, b)
  const pc = project(cam, c)
  const ux = pa.u - pb.u
  const uy = pa.v - pb.v
  const vx = pc.u - pb.u
  const vy = pc.v - pb.v
  const cos = (ux * vx + uy * vy) / Math.max(1e-12, Math.hypot(ux, uy) * Math.hypot(vx, vy))
  return 180 - toDeg(Math.acos(Math.min(1, Math.max(-1, cos))))
}

/**
 * 2D trunk inclination: angle of projected mid-hip -> mid-shoulder from the image vertical, as the
 * app's body.ts computes it (signed positive when the shoulders are to image-right of the hips).
 */
export function trunkInclination2D(cam: Camera, pose: PosePoints): { deg: number; signedDeg: number } {
  const hip = project(cam, mid(pose.lm[LM.LEFT_HIP], pose.lm[LM.RIGHT_HIP]))
  const sh = project(cam, mid(pose.lm[LM.LEFT_SHOULDER], pose.lm[LM.RIGHT_SHOULDER]))
  const dx = sh.u - hip.u
  const up = hip.v - sh.v
  const signedDeg = toDeg(Math.atan2(dx, up))
  return { deg: Math.abs(signedDeg), signedDeg }
}

export function trunkInclination3DDeg(pose: PosePoints): number {
  const trunk = sub(mid(pose.lm[LM.LEFT_SHOULDER], pose.lm[LM.RIGHT_SHOULDER]), mid(pose.lm[LM.LEFT_HIP], pose.lm[LM.RIGHT_HIP]))
  return angleDeg(trunk, [0, 0, 1])
}

export function kneeFlexion3DDeg(pose: PosePoints, leg: { hip: LM; knee: LM; ankle: LM }): number {
  return flexionDeg(pose.lm[leg.hip], pose.lm[leg.knee], pose.lm[leg.ankle])
}

/** Window in which knee flexion maxima are taken: motion start to contact. */
export function kneeWindow(plan: ServePlan): [number, number] {
  return [plan.times.motionStartS, plan.times.contactS]
}

export interface KneeSeries {
  max3D: Angle2DSample
  max2D: Angle2DSample
  at3DMax2DDeg: number
  maxBack3D: Angle2DSample
}

/** Knee flexion maxima sampled every `stepS` (default 1 ms) over the loading window. */
export function kneeMaxima(clip: ClipMotion, plan: ServePlan, camAt: (t: number) => Camera, stepS = 0.001): KneeSeries {
  const legs = legLandmarks(clip.handedness)
  const [t0, t1] = kneeWindow(plan)
  let max3D = { deg: -Infinity, tS: t0 }
  let max2D = { deg: -Infinity, tS: t0 }
  let maxBack3D = { deg: -Infinity, tS: t0 }
  const n = Math.ceil((t1 - t0) / stepS)
  for (let i = 0; i <= n; i++) {
    const t = Math.min(t1, t0 + i * stepS)
    const pose = clip.pose(t)
    const k3 = kneeFlexion3DDeg(pose, legs.front)
    if (k3 > max3D.deg) max3D = { deg: k3, tS: t }
    const kb = kneeFlexion3DDeg(pose, legs.back)
    if (kb > maxBack3D.deg) maxBack3D = { deg: kb, tS: t }
    const f = legs.front
    const k2 = flexion2DDeg(camAt(t), pose.lm[f.hip], pose.lm[f.knee], pose.lm[f.ankle])
    if (k2 > max2D.deg) max2D = { deg: k2, tS: t }
  }
  const p = clip.pose(max3D.tS)
  const f = legs.front
  const at3DMax2DDeg = flexion2DDeg(camAt(max3D.tS), p.lm[f.hip], p.lm[f.knee], p.lm[f.ankle])
  return { max3D, max2D, at3DMax2DDeg, maxBack3D }
}

/** Frame-sampled maxima: what an ideal pose estimator could see at this clip's frame times. */
export function kneeMaximaAtFrames(clip: ClipMotion, plan: ServePlan, camAt: (t: number) => Camera, frameTimes: number[]): { max3D: Angle2DSample; max2D: Angle2DSample } | null {
  const legs = legLandmarks(clip.handedness)
  const [t0, t1] = kneeWindow(plan)
  let max3D: Angle2DSample | null = null
  let max2D: Angle2DSample | null = null
  for (const t of frameTimes) {
    if (t < t0 || t > t1) continue
    const pose = clip.pose(t)
    const f = legs.front
    const k3 = kneeFlexion3DDeg(pose, f)
    const k2 = flexion2DDeg(camAt(t), pose.lm[f.hip], pose.lm[f.knee], pose.lm[f.ankle])
    if (!max3D || k3 > max3D.deg) max3D = { deg: k3, tS: t }
    if (!max2D || k2 > max2D.deg) max2D = { deg: k2, tS: t }
  }
  return max3D && max2D ? { max3D, max2D } : null
}

/** All per-serve truth metrics (court coordinates, absolute motion times). */
export function serveMetrics(clip: ClipMotion, plan: ServePlan, camAt: (t: number) => Camera, knees: KneeSeries): ServeMetrics {
  const T = plan.times
  const legs = legLandmarks(clip.handedness)
  const H = clip.anthro.heightM
  const lat = hittingSideY(clip.handedness)
  const w = (p: Vec3) => clip.toWorld(p)

  const release = w(plan.release)
  // Realised apex of the gravity-only toss from the release state.
  const v0 = w(plan.tossV0)
  const tUp = v0[2] / G
  const apex: Vec3 = [release[0] + v0[0] * tUp, release[1] + v0[1] * tUp, release[2] + (v0[2] * v0[2]) / (2 * G)]
  const contact = w(plan.contact)
  const poseRel = clip.pose(T.tossReleaseS)
  const toeRel = poseRel.lm[legs.front.toe]

  const poseC = clip.pose(T.contactS)
  const trunk2D = trunkInclination2D(camAt(T.contactS), poseC)

  const poseLand = clip.pose(T.landingS)
  const toeLand = poseLand.lm[legs.front.toe]

  const f = plan.flight
  const bounce = w(f.bounce)
  const launchAz = clip.handedness === 'left' ? -plan.launchAzimuthDeg : plan.launchAzimuthDeg
  return {
    tossReleaseHeightM: release[2],
    tossApexHeightM: apex[2],
    tossApexForwardOfFrontToeM: apex[0] - toeRel[0],
    tossApexLateralOfFrontToeM: (apex[1] - toeRel[1]) * lat,
    tossHeightAboveContactM: apex[2] - contact[2],
    contactHeightM: contact[2],
    contactHeightRatio: contact[2] / H,
    contactForwardOfFrontToeM: contact[0] - toeRel[0],
    contactForwardOfBaselineM: contact[0],
    releaseToContactS: T.contactS - T.tossReleaseS,
    frontLeg: legs.front.side,
    maxFrontKneeFlexion3DDeg: knees.max3D.deg,
    maxFrontKneeFlexion3DTimeS: knees.max3D.tS,
    maxBackKneeFlexion3DDeg: knees.maxBack3D.deg,
    maxFrontKneeFlexion2DDeg: knees.max2D.deg,
    maxFrontKneeFlexion2DTimeS: knees.max2D.tS,
    frontKneeFlexion2DAtMax3DDeg: knees.at3DMax2DDeg,
    trunkInclinationContact3DDeg: trunkInclination3DDeg(poseC),
    trunkInclinationContact2DDeg: trunk2D.deg,
    trunkInclinationContact2DSignedDeg: trunk2D.signedDeg,
    landingDistanceInsideBaselineM: toeLand[0],
    landingFootLateralM: (toeLand[1] - toeRel[1]) * lat,
    ballPeakSpeedKmh: kmh(f.peakSpeedMs),
    ballSpeedAtContactKmh: kmh(Math.hypot(...f.v0)),
    avgSpeedContactToBounceKmh: kmh(f.avgSpeedChordMs),
    avgSpeedContactToBouncePathKmh: kmh(f.avgSpeedPathMs),
    avgSpeedContactToBounceHorizontalKmh: kmh(f.avgSpeedHorizontalMs),
    flightTimeS: f.flightTimeS,
    bounceXM: bounce[0],
    bounceYM: bounce[1],
    bounceInServiceBox: isInServiceBox(plan.params.courtSide, bounce[0], bounce[1]),
    netClearanceM: f.netCrossing ? f.netCrossing.clearanceM : null,
    launchElevationDeg: plan.launchElevationDeg,
    launchAzimuthDeg: launchAz,
    airborneS: T.landingS - T.takeoffS,
    trophyPauseS: T.trophyEndS - T.trophyStartS,
  }
}
