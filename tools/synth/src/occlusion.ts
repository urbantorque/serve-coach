import { LM } from '../../../app/src/analysis/types.ts'
import type { Anthropometry } from './anthropometry.ts'
import type { PosePoints } from './kinematics/skeleton.ts'
import { add, addScaled, basisFrom, dot, mid, norm, sub, toBasis, type Basis, type Vec3 } from './math/vec.ts'

/**
 * Approximate self-occlusion test for truth visibility. The body is modelled by capsules (limbs,
 * neck, hands, feet), an elliptic capsule (torso) and ellipsoids (head, pelvis) sized like the
 * rendered parts. A landmark is occluded when the line of sight from the camera centre, stopped
 * `margin` metres short of the landmark, passes through a body volume other than the landmark's
 * own segments (a knee is not hidden by its own thigh). Face points are also hidden when they face
 * away from the camera. Hips keep the pelvis volume (they sit ~0.1 m inside it), so the far hip is
 * hidden when the camera looks along the hip line. The racket is ignored (thin frame, see-through strings).
 */

type Volume =
  | { kind: 'capsule'; name: string; a: Vec3; b: Vec3; r: number }
  | { kind: 'ellipsoid'; name: string; centre: Vec3; basis: Basis; radii: Vec3 }
  /** Capsule in a frame whose x axis is squashed: cross-section is an ellipse (rx forward, r lateral). */
  | { kind: 'ellipticCapsule'; name: string; origin: Vec3; basis: Basis; z0: number; z1: number; rForward: number; rLateral: number }

/** How far (m, 1.80 m body) short of each landmark the line of sight stops, and its own volumes. */
const RULES: Record<number, { margin: number; own: string[] }> = (() => {
  const out: Record<number, { margin: number; own: string[] }> = {}
  const face = [LM.NOSE, LM.LEFT_EYE_INNER, LM.LEFT_EYE, LM.LEFT_EYE_OUTER, LM.RIGHT_EYE_INNER, LM.RIGHT_EYE, LM.RIGHT_EYE_OUTER, LM.LEFT_EAR, LM.RIGHT_EAR, LM.MOUTH_LEFT, LM.MOUTH_RIGHT]
  for (const i of face) out[i] = { margin: 0.01, own: ['head'] }
  for (const side of ['LEFT', 'RIGHT'] as const) {
    const n = side.toLowerCase()
    const k = (name: string) => LM[`${side}_${name}` as keyof typeof LM]
    out[k('SHOULDER')] = { margin: 0.03, own: [`${n}UpperArm`] }
    out[k('ELBOW')] = { margin: 0.01, own: [`${n}UpperArm`, `${n}Forearm`] }
    out[k('WRIST')] = { margin: 0.01, own: [`${n}Forearm`, `${n}Hand`] }
    for (const f of ['PINKY', 'INDEX', 'THUMB']) out[k(f)] = { margin: 0.01, own: [`${n}Forearm`, `${n}Hand`] }
    out[k('HIP')] = { margin: 0.12, own: [`${n}Thigh`] }
    out[k('KNEE')] = { margin: 0.01, own: [`${n}Thigh`, `${n}Shank`] }
    out[k('ANKLE')] = { margin: 0.01, own: [`${n}Shank`, `${n}Foot`] }
    out[k('HEEL')] = { margin: 0.01, own: [`${n}Shank`, `${n}Foot`] }
    out[k('FOOT_INDEX')] = { margin: 0.01, own: [`${n}Shank`, `${n}Foot`] }
  }
  return out
})()

const FACE = new Set<number>([LM.NOSE, LM.LEFT_EYE_INNER, LM.LEFT_EYE, LM.LEFT_EYE_OUTER, LM.RIGHT_EYE_INNER, LM.RIGHT_EYE, LM.RIGHT_EYE_OUTER, LM.LEFT_EAR, LM.RIGHT_EAR, LM.MOUTH_LEFT, LM.MOUTH_RIGHT])

/** Body volumes for one pose (court coordinates). */
export function bodyVolumes(a: Anthropometry, p: PosePoints): Volume[] {
  const s = a.s
  const lm = p.lm
  const vols: Volume[] = []
  const cap = (name: string, from: Vec3, to: Vec3, r: number) => vols.push({ kind: 'capsule', name, a: from, b: to, r: r * s })

  const headFwd = sub(p.headForwardPt, p.headCentre)
  const headUp = sub(p.headUpPt, p.headCentre)
  const hb = basisFrom('x', headFwd, 'z', headUp)
  vols.push({ kind: 'ellipsoid', name: 'head', centre: addScaled(p.headCentre, hb.z, 0.01 * s), basis: hb, radii: [0.105 * s, 0.08 * s, 0.12 * s] })
  cap('neck', p.midShoulder, addScaled(p.headCentre, hb.z, -0.06 * s), 0.05)

  // Torso: thorax frame x = chest forward, y = left, z = spine (pelvis -> mid-shoulder).
  const spine = sub(p.midShoulder, p.pelvis)
  const trunkLen = Math.hypot(spine[0], spine[1], spine[2])
  const shLeft = sub(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER])
  const tb = basisFrom('z', spine, 'y', shLeft)
  vols.push({ kind: 'ellipticCapsule', name: 'torso', origin: p.pelvis, basis: tb, z0: 0.1 * s, z1: trunkLen - 0.08 * s, rForward: 0.11 * s, rLateral: 0.165 * s })

  const hipLeft = sub(p.leftHip, p.rightHip)
  const pb = basisFrom('z', [0, 0, 1], 'y', hipLeft)
  vols.push({ kind: 'ellipsoid', name: 'pelvis', centre: p.pelvis, basis: pb, radii: [0.115 * s, 0.185 * s, 0.13 * s] })

  for (const side of ['LEFT', 'RIGHT'] as const) {
    const L = side === 'LEFT'
    const sh = lm[L ? LM.LEFT_SHOULDER : LM.RIGHT_SHOULDER]
    const el = lm[L ? LM.LEFT_ELBOW : LM.RIGHT_ELBOW]
    const wr = lm[L ? LM.LEFT_WRIST : LM.RIGHT_WRIST]
    const knuckles = mid(lm[L ? LM.LEFT_INDEX : LM.RIGHT_INDEX], lm[L ? LM.LEFT_PINKY : LM.RIGHT_PINKY])
    const hip = L ? p.leftHip : p.rightHip
    const kn = lm[L ? LM.LEFT_KNEE : LM.RIGHT_KNEE]
    const an = lm[L ? LM.LEFT_ANKLE : LM.RIGHT_ANKLE]
    const heel = lm[L ? LM.LEFT_HEEL : LM.RIGHT_HEEL]
    const toe = lm[L ? LM.LEFT_FOOT_INDEX : LM.RIGHT_FOOT_INDEX]
    const n = side.toLowerCase()
    cap(`${n}UpperArm`, sh, el, 0.052)
    cap(`${n}Forearm`, el, wr, 0.037)
    cap(`${n}Hand`, wr, knuckles, 0.035)
    cap(`${n}Thigh`, hip, kn, 0.075)
    cap(`${n}Shank`, kn, an, 0.048)
    const lift: Vec3 = [0, 0, 0.03 * s]
    cap(`${n}Foot`, add(heel, lift), add(toe, lift), 0.045)
  }
  return vols
}

/** Closest distance between segments p0-p1 and q0-q1. */
export function segmentSegmentDistance(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number {
  const d1 = sub(p1, p0)
  const d2 = sub(q1, q0)
  const r = sub(p0, q0)
  const a = dot(d1, d1)
  const e = dot(d2, d2)
  const f = dot(d2, r)
  let sParam: number
  let tParam: number
  if (a < 1e-12 && e < 1e-12) return Math.hypot(r[0], r[1], r[2])
  if (a < 1e-12) {
    sParam = 0
    tParam = clamp01(f / e)
  } else {
    const c = dot(d1, r)
    if (e < 1e-12) {
      tParam = 0
      sParam = clamp01(-c / a)
    } else {
      const b = dot(d1, d2)
      const denom = a * e - b * b
      sParam = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0
      tParam = (b * sParam + f) / e
      if (tParam < 0) {
        tParam = 0
        sParam = clamp01(-c / a)
      } else if (tParam > 1) {
        tParam = 1
        sParam = clamp01((b - c) / a)
      }
    }
  }
  const cp = addScaled(p0, d1, sParam)
  const cq = addScaled(q0, d2, tParam)
  return Math.hypot(cp[0] - cq[0], cp[1] - cq[1], cp[2] - cq[2])
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/** Distance from the origin to segment a-b. */
function originSegmentDistance(a: Vec3, b: Vec3): number {
  const d = sub(b, a)
  const dd = dot(d, d)
  const t = dd > 1e-12 ? clamp01(-dot(a, d) / dd) : 0
  const c = addScaled(a, d, t)
  return Math.hypot(c[0], c[1], c[2])
}

export function segmentHitsVolume(p0: Vec3, p1: Vec3, v: Volume): boolean {
  switch (v.kind) {
    case 'capsule':
      return segmentSegmentDistance(p0, p1, v.a, v.b) < v.r
    case 'ellipsoid': {
      const toUnit = (p: Vec3): Vec3 => {
        const l = toBasis(v.basis, sub(p, v.centre))
        return [l[0] / v.radii[0], l[1] / v.radii[1], l[2] / v.radii[2]]
      }
      return originSegmentDistance(toUnit(p0), toUnit(p1)) < 1
    }
    case 'ellipticCapsule': {
      const k = v.rLateral / v.rForward
      const local = (p: Vec3): Vec3 => {
        const l = toBasis(v.basis, sub(p, v.origin))
        return [l[0] * k, l[1], l[2]]
      }
      return segmentSegmentDistance(local(p0), local(p1), [0, 0, v.z0], [0, 0, v.z1]) < v.rLateral
    }
  }
}

/** Line of sight from `eye` to `target`, stopped `marginM` short of the target, blocked by any volume? */
export function isOccluded(eye: Vec3, target: Vec3, marginM: number, volumes: Volume[], exclude?: (v: Volume) => boolean): boolean {
  const d = sub(target, eye)
  const L = Math.hypot(d[0], d[1], d[2])
  if (L <= marginM) return false
  const end = addScaled(eye, norm(d), L - marginM)
  for (const v of volumes) {
    if (exclude?.(v)) continue
    if (segmentHitsVolume(eye, end, v)) return true
  }
  return false
}

/** Per-landmark self-occlusion flags for the 33 landmarks. */
export function landmarkOcclusion(a: Anthropometry, p: PosePoints, eye: Vec3, volumes = bodyVolumes(a, p)): boolean[] {
  return p.lm.map((q, i) => {
    const rule = RULES[i]
    if (FACE.has(i)) {
      // A face point is visible only on the camera-facing half of the head.
      const radial = norm(sub(q, p.headCentre))
      if (dot(radial, norm(sub(eye, q))) < 0.05) return true
    }
    return isOccluded(eye, q, rule.margin * a.s, volumes, (v) => rule.own.includes(v.name))
  })
}

/** Occlusion of a ball centre by the body. A held ball ignores the holding hand (it sits on the palm). */
export function ballOccluded(eye: Vec3, ball: Vec3, radiusM: number, volumes: Volume[], heldBy: 'left' | 'right' | null): boolean {
  const skip = heldBy ? `${heldBy}Hand` : null
  return isOccluded(eye, ball, radiusM, volumes, (v) => v.name === skip)
}

