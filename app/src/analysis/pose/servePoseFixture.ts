/**
 * Minimal kinematic serve pose (33 MediaPipe landmarks) with exactly known geometry, for
 * unit tests of the pose layer. It is NOT the product's synthetic ground-truth
 * generator (that lives with validation); it only needs known heights, angles, an
 * exact wrist apex and a clear hitting arm.
 *
 * Model: planar stick figure built in frame-height units (HU) from Drillis & Contini
 * proportions. Arm and knee angles follow Catmull-Rom splines through keyframes, so the
 * hitting arm passes straight up at `contactT` while still moving fast (no zero-velocity
 * keyframe at contact, unlike a smoothstep).
 */
import { LM, type Handedness, type Landmark, type PoseFrame } from '../types.ts'
import { LANDMARK_COUNT } from './landmarks.ts'

export interface ServeFixtureOptions {
  fps?: number
  durationS?: number
  /** Standing height as a fraction of frame height. */
  heightHU?: number
  /** Frame width / height (0.5625 = portrait 9:16). */
  frameAspect?: number
  handedness?: Handedness
  view?: 'side' | 'rear'
  /** Normalised x of the body centre line and y of the floor. */
  centreX?: number
  floorY?: number
  contactT?: number
}

interface Keyframe {
  t: number
  v: number
}

/** Catmull-Rom through keyframes (clamped at the ends). */
function spline(keys: readonly Keyframe[], t: number): number {
  if (t <= keys[0].t) return keys[0].v
  const last = keys[keys.length - 1]
  if (t >= last.t) return last.v
  let i = 0
  while (keys[i + 1].t < t) i++
  const k0 = keys[Math.max(0, i - 1)]
  const k1 = keys[i]
  const k2 = keys[i + 1]
  const k3 = keys[Math.min(keys.length - 1, i + 2)]
  const h = k2.t - k1.t
  const m1 = k2.t === k0.t ? 0 : ((k2.v - k0.v) / (k2.t - k0.t)) * h
  const m2 = k3.t === k1.t ? 0 : ((k3.v - k1.v) / (k3.t - k1.t)) * h
  const u = (t - k1.t) / h
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * k1.v + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2.v + (u3 - u2) * m2
}

const PI = Math.PI
const DEG = PI / 180

/** Angles measured from straight down; PI = straight up; PI/2 = forward (+ facing). */
function hittingArmKeys(tc: number): { upper: Keyframe[]; fore: Keyframe[] } {
  const k = (dt: number, v: number): Keyframe => ({ t: tc + dt, v })
  return {
    upper: [k(-2, 0.15), k(-1.2, 0.15), k(-1, 0.15), k(-0.25, 1.5 * PI), k(-0.1, 1.5 * PI), k(0, PI), k(0.15, 0.5 * PI), k(0.6, 0.1), k(3, 0.1)],
    fore: [k(-2, 0.15), k(-1.2, 0.15), k(-1, 0.15), k(-0.25, PI), k(-0.1, 1.9 * PI), k(0, PI), k(0.15, 0.4 * PI), k(0.6, 0.1), k(3, 0.1)],
  }
}

function tossArmKeys(tc: number): Keyframe[] {
  const k = (dt: number, v: number): Keyframe => ({ t: tc + dt, v })
  // Rises to release ~0.6 s before contact, held up through trophy, pulled in before contact.
  return [k(-2, 0.15), k(-1.2, 0.15), k(-1, 0.15), k(-0.6, PI - 0.15), k(-0.35, PI - 0.25), k(-0.1, 0.45 * PI), k(0, 0.3 * PI), k(0.3, 0.2 * PI), k(0.6, 0.15), k(3, 0.15)]
}

function kneeKeys(tc: number): Keyframe[] {
  const k = (dt: number, v: number): Keyframe => ({ t: tc + dt, v: v * DEG })
  return [k(-2, 4), k(-1.2, 4), k(-1, 4), k(-0.25, 45), k(-0.05, 10), k(0, 2), k(0.3, 20), k(0.6, 8), k(3, 8)]
}

/** Knee flexion (radians) at time t, exposed so tests can compare against truth. */
export function fixtureKneeFlexionRad(t: number, contactT = 2): number {
  return spline(kneeKeys(contactT), t)
}

export interface ServeFixture {
  frames: PoseFrame[]
  frameAspect: number
  heightHU: number
  contactT: number
  handedness: Handedness
}

/** Builds the fixture. Deterministic; no noise. */
export function buildServeFixture(options: ServeFixtureOptions = {}): ServeFixture {
  const {
    fps = 60,
    durationS = 3.5,
    heightHU = 0.6,
    frameAspect = 0.5625,
    handedness = 'right',
    view = 'side',
    centreX = 0.5,
    floorY = 0.85,
    contactT = 2,
  } = options
  const frames: PoseFrame[] = []
  const count = Math.round(durationS * fps)
  for (let i = 0; i < count; i++) {
    const t = i / fps
    const landmarks = poseAt(t, { heightHU, frameAspect, handedness, view, centreX, floorY, contactT })
    frames.push({ frameIndex: i, tReal: t, landmarks, score: 0.95, source: 'injected' })
  }
  return { frames, frameAspect, heightHU, contactT, handedness }
}

interface PoseParams {
  heightHU: number
  frameAspect: number
  handedness: Handedness
  view: 'side' | 'rear'
  centreX: number
  floorY: number
  contactT: number
}

/** 3D-ish body point: f = forward (toward the net), l = lateral (+ = player's right), y = image y (HU, down). */
interface BodyPoint {
  f: number
  l: number
  y: number
}

function poseAt(t: number, p: PoseParams): Landmark[] {
  const H = p.heightHU
  const floor = p.floorY
  const knee = spline(kneeKeys(p.contactT), t)
  const legLen = 0.245 * H + 0.246 * H
  // Symmetric knee bend lowers the hips by the chord shortening.
  const hipDrop = legLen - legLen * Math.cos(knee / 2)
  const hipY = floor - 0.53 * H + hipDrop
  const shoulderY = hipY - 0.288 * H

  const pts: BodyPoint[] = Array.from({ length: LANDMARK_COUNT }, () => ({ f: 0, l: 0, y: 0 }))
  const set = (i: LM, f: number, l: number, y: number) => {
    pts[i] = { f, l, y }
  }

  // Head (faces forward). Eye, ear and nose heights match body.ts ANTHROPOMETRY.
  const headBase = shoulderY + 0.818 * H // floor-relative reference so the head drops with the hips
  const hy = (fraction: number) => headBase - fraction * H
  set(LM.NOSE, 0.05 * H, 0, hy(0.904))
  set(LM.LEFT_EYE_INNER, 0.04 * H, -0.015 * H, hy(0.934))
  set(LM.LEFT_EYE, 0.035 * H, -0.03 * H, hy(0.934))
  set(LM.LEFT_EYE_OUTER, 0.03 * H, -0.045 * H, hy(0.934))
  set(LM.RIGHT_EYE_INNER, 0.04 * H, 0.015 * H, hy(0.934))
  set(LM.RIGHT_EYE, 0.035 * H, 0.03 * H, hy(0.934))
  set(LM.RIGHT_EYE_OUTER, 0.03 * H, 0.045 * H, hy(0.934))
  set(LM.LEFT_EAR, -0.01 * H, -0.07 * H, hy(0.925))
  set(LM.RIGHT_EAR, -0.01 * H, 0.07 * H, hy(0.925))
  set(LM.MOUTH_LEFT, 0.04 * H, -0.02 * H, hy(0.88))
  set(LM.MOUTH_RIGHT, 0.04 * H, 0.02 * H, hy(0.88))

  // Torso.
  set(LM.LEFT_SHOULDER, 0, -0.11 * H, shoulderY)
  set(LM.RIGHT_SHOULDER, 0, 0.11 * H, shoulderY)
  set(LM.LEFT_HIP, 0, -0.07 * H, hipY)
  set(LM.RIGHT_HIP, 0, 0.07 * H, hipY)

  // Arms: planar in the forward/vertical plane at each shoulder.
  const arm = (shoulder: LM, elbow: LM, wrist: LM, pinky: LM, index: LM, thumb: LM, upperA: number, foreA: number) => {
    const s = pts[shoulder]
    const e = { f: s.f + 0.186 * H * Math.sin(upperA), l: s.l, y: s.y + 0.186 * H * Math.cos(upperA) }
    const w = { f: e.f + 0.146 * H * Math.sin(foreA), l: e.l, y: e.y + 0.146 * H * Math.cos(foreA) }
    const along = (d: number, lat: number) => ({ f: w.f + d * Math.sin(foreA), l: w.l + lat, y: w.y + d * Math.cos(foreA) })
    pts[elbow] = e
    pts[wrist] = w
    pts[index] = along(0.06 * H, 0)
    pts[pinky] = along(0.05 * H, 0.01 * H * Math.sign(s.l))
    pts[thumb] = along(0.035 * H, -0.01 * H * Math.sign(s.l))
  }
  const hit = hittingArmKeys(p.contactT)
  const hitUpper = spline(hit.upper, t)
  const hitFore = spline(hit.fore, t)
  const toss = spline(tossArmKeys(p.contactT), t)
  const rightArm = p.handedness === 'right' ? [hitUpper, hitFore] : [toss, toss]
  const leftArm = p.handedness === 'right' ? [toss, toss] : [hitUpper, hitFore]
  arm(LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST, LM.RIGHT_PINKY, LM.RIGHT_INDEX, LM.RIGHT_THUMB, rightArm[0], rightArm[1])
  arm(LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST, LM.LEFT_PINKY, LM.LEFT_INDEX, LM.LEFT_THUMB, leftArm[0], leftArm[1])

  // Legs, built down from the hip: the thigh tilts forward by knee/2 and the shank back by
  // knee/2, so 2D flexion in the side view equals `knee` exactly and the ankle stays
  // under the hip at floor - 0.039 H. The front foot (non-hitting side) is 0.05 H ahead.
  const leg = (hip: LM, kneeI: LM, ankle: LM, heel: LM, toe: LM, hipF: number) => {
    const h = { ...pts[hip], f: hipF }
    const k = { f: h.f + 0.245 * H * Math.sin(knee / 2), l: h.l, y: h.y + 0.245 * H * Math.cos(knee / 2) }
    const a = { f: k.f - 0.246 * H * Math.sin(knee / 2), l: h.l, y: k.y + 0.246 * H * Math.cos(knee / 2) }
    pts[hip] = h
    pts[kneeI] = k
    pts[ankle] = a
    pts[heel] = { f: a.f - 0.03 * H, l: h.l, y: floor - 0.015 * H }
    pts[toe] = { f: a.f + 0.11 * H, l: h.l, y: floor }
  }
  const frontIsLeft = p.handedness === 'right'
  leg(LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX, frontIsLeft ? 0.05 * H : -0.05 * H)
  leg(LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX, frontIsLeft ? -0.05 * H : 0.05 * H)

  // Project. Side view: the camera sees the hitting-arm side, forward = image +x.
  // Rear view: camera behind the player, the player's right = image +x, forward = depth.
  return pts.map((q, i) => {
    let xHU: number
    let z: number
    if (p.view === 'side') {
      const nearSign = p.handedness === 'right' ? 1 : -1
      xHU = q.f + 0.1 * q.l // slight lateral parallax so left/right are not identical
      z = -nearSign * q.l // hitting side nearer the camera (smaller z)
    } else {
      xHU = q.l
      z = q.f
    }
    let visibility: number
    if (p.view === 'side') {
      const nearSide = p.handedness === 'right' ? q.l >= 0 : q.l <= 0
      visibility = nearSide || i === LM.NOSE ? 0.95 : 0.7
    } else {
      visibility = i <= LM.MOUTH_RIGHT ? 0.2 : 0.95 // face hidden from behind
    }
    const lm: Landmark = { x: p.centreX + xHU / p.frameAspect, y: q.y, z, visibility }
    return lm
  })
}
