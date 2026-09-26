import { LM } from '../../../app/src/analysis/types.ts'
import type { Anthropometry } from './anthropometry.ts'
import { RACKET, type PosePoints } from './kinematics/skeleton.ts'
import { add, basisFrom, basisToQuat, mid, norm, sub, type Basis, type Vec3 } from './math/vec.ts'

/**
 * Visual body model: rigid "bones" (origin + orthonormal basis) with simple parametric parts attached.
 * Bone local axes: y runs along the bone (or up for pelvis/thorax/neck/head), x is forward.
 * The same part list drives the WebGL renderer and the CPU occlusion test.
 */

export const BONES = [
  'pelvis',
  'thorax',
  'neck',
  'head',
  'upperArmL',
  'upperArmR',
  'forearmL',
  'forearmR',
  'handL',
  'handR',
  'thighL',
  'thighR',
  'shankL',
  'shankR',
  'footL',
  'footR',
  'racket',
] as const
export type BoneName = (typeof BONES)[number]

export interface BoneTransform {
  origin: Vec3
  basis: Basis
}

export type PartShape =
  | { kind: 'lathe'; profile: [number, number][]; depthScale?: number }
  | { kind: 'ellipsoid'; radii: Vec3 }
  | { kind: 'box'; size: Vec3; radius?: number }
  | { kind: 'cylinder'; rTop: number; rBottom: number; height: number }
  | { kind: 'sphereCap'; radii: Vec3; thetaLength: number }
  | { kind: 'ring'; radii: [number, number]; tube: number }
  | { kind: 'disc'; radii: [number, number] }

export interface PartMaterial {
  color: string
  roughness?: number
  metalness?: number
  opacity?: number
  texture?: 'strings' | 'fabric' | 'skin'
}

export interface PartSpec {
  name: string
  bone: BoneName
  shape: PartShape
  /** Local offset (bone frame) of the part's origin. */
  position?: Vec3
  /** Local rotation as a quaternion [x,y,z,w] (bone frame). */
  quaternion?: [number, number, number, number]
  material: PartMaterial
  castShadow?: boolean
  /** Include in the CPU occlusion test (default true). */
  occluder?: boolean
}

export interface Outfit {
  skin: string
  shirt: string
  shorts: string
  hair: string
  shoes: string
  socks: string
  racketFrame: string
}

export const OUTFITS: Record<string, Outfit> = {
  red: { skin: '#c8906a', shirt: '#c0392b', shorts: '#1f2533', hair: '#3b2616', shoes: '#f2f2f2', socks: '#fafafa', racketFrame: '#1c1c1c' },
  white: { skin: '#b97f5c', shirt: '#f4f4f4', shorts: '#222a3a', hair: '#1f140c', shoes: '#e8e8e8', socks: '#ffffff', racketFrame: '#b0261e' },
  navy: { skin: '#e0b495', shirt: '#24406e', shorts: '#e8e8e8', hair: '#7a5230', shoes: '#fafafa', socks: '#ffffff', racketFrame: '#f0c419' },
}

const QY_TO_Z: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2] // rotate +Y onto +Z (about +X by 90 deg)

/** Build the visual part list for a player (dimensions scale with height). */
export function buildBodyParts(a: Anthropometry, outfit: Outfit): PartSpec[] {
  const s = a.s
  const skin: PartMaterial = { color: outfit.skin, roughness: 0.6, texture: 'skin' }
  const shirt: PartMaterial = { color: outfit.shirt, roughness: 0.85, texture: 'fabric' }
  const shorts: PartMaterial = { color: outfit.shorts, roughness: 0.85, texture: 'fabric' }
  const parts: PartSpec[] = []
  const P = (p: PartSpec) => parts.push({ castShadow: true, ...p })

  // Torso (thorax bone: y up from pelvis centre to mid-shoulder, x forward).
  const T = a.trunkM
  P({
    name: 'torso',
    bone: 'thorax',
    shape: {
      kind: 'lathe',
      depthScale: 0.66,
      profile: [
        [0.0, -0.06 * s],
        [0.15 * s, -0.04 * s],
        [0.158 * s, 0.05 * s],
        [0.148 * s, 0.16 * s],
        [0.16 * s, 0.28 * s],
        [0.178 * s, T - 0.12 * s],
        [0.185 * s, T - 0.04 * s],
        [0.15 * s, T + 0.02 * s],
        [0.07 * s, T + 0.05 * s],
        [0.0, T + 0.055 * s],
      ],
    },
    material: shirt,
  })
  // Pelvis / shorts.
  P({ name: 'shorts', bone: 'pelvis', shape: { kind: 'ellipsoid', radii: [0.115 * s, 0.13 * s, 0.185 * s] }, position: [-0.005, 0.0, 0], material: shorts })
  // Neck and head.
  P({ name: 'neck', bone: 'neck', shape: { kind: 'cylinder', rTop: 0.05 * s, rBottom: 0.058 * s, height: 0.13 * s }, position: [0, 0.055 * s, 0], material: skin })
  P({ name: 'skull', bone: 'head', shape: { kind: 'ellipsoid', radii: [0.1 * s, 0.118 * s, 0.079 * s] }, position: [-0.005 * s, 0.02 * s, 0], material: skin })
  P({ name: 'jaw', bone: 'head', shape: { kind: 'ellipsoid', radii: [0.068 * s, 0.062 * s, 0.062 * s] }, position: [0.035 * s, -0.052 * s, 0], material: skin })
  P({
    name: 'hair',
    bone: 'head',
    shape: { kind: 'sphereCap', radii: [0.106 * s, 0.124 * s, 0.085 * s], thetaLength: 1.25 },
    position: [-0.014 * s, 0.03 * s, 0],
    // Tilt the cap backwards so it covers the crown and the back of the head, leaving the face clear.
    quaternion: [0, 0, 0.3827, 0.9239],
    material: { color: outfit.hair, roughness: 0.95 },
  })
  for (const side of [1, -1] as const) {
    const z = side * 0.032 * s
    P({ name: `eyeWhite${side}`, bone: 'head', shape: { kind: 'ellipsoid', radii: [0.009 * s, 0.0085 * s, 0.013 * s] }, position: [0.081 * s, 0.012 * s, z], material: { color: '#f3f0ea', roughness: 0.3 }, castShadow: false, occluder: false })
    P({ name: `iris${side}`, bone: 'head', shape: { kind: 'ellipsoid', radii: [0.004 * s, 0.0065 * s, 0.0065 * s] }, position: [0.089 * s, 0.012 * s, z], material: { color: '#2a1a10', roughness: 0.2 }, castShadow: false, occluder: false })
    P({ name: `brow${side}`, bone: 'head', shape: { kind: 'box', size: [0.008 * s, 0.006 * s, 0.03 * s] }, position: [0.088 * s, 0.03 * s, z], material: { color: outfit.hair, roughness: 0.9 }, castShadow: false, occluder: false })
    P({ name: `ear${side}`, bone: 'head', shape: { kind: 'ellipsoid', radii: [0.021 * s, 0.031 * s, 0.011 * s] }, position: [-0.006 * s, 0.002 * s, side * 0.078 * s], material: skin, occluder: false })
  }
  P({ name: 'nose', bone: 'head', shape: { kind: 'ellipsoid', radii: [0.022 * s, 0.03 * s, 0.015 * s] }, position: [0.094 * s, -0.012 * s, 0], material: skin, occluder: false })
  P({ name: 'mouth', bone: 'head', shape: { kind: 'ellipsoid', radii: [0.009 * s, 0.0065 * s, 0.024 * s] }, position: [0.099 * s, -0.056 * s, 0], material: { color: '#8a3b36', roughness: 0.5 }, castShadow: false, occluder: false })

  for (const side of ['L', 'R'] as const) {
    // Arms.
    const ua = a.upperArmM
    const fa = a.forearmM
    P({ name: `deltoid${side}`, bone: `upperArm${side}`, shape: { kind: 'ellipsoid', radii: [0.062 * s, 0.07 * s, 0.062 * s] }, position: [0, 0.03 * s, 0], material: shirt })
    P({
      name: `upperArm${side}`,
      bone: `upperArm${side}`,
      shape: { kind: 'lathe', profile: [[0.0, 0], [0.05 * s, 0.01 * s], [0.05 * s, 0.35 * ua], [0.044 * s, 0.7 * ua], [0.038 * s, ua], [0.0, ua + 0.035 * s]] },
      material: skin,
    })
    P({
      name: `sleeve${side}`,
      bone: `upperArm${side}`,
      shape: { kind: 'lathe', profile: [[0.0, -0.02 * s], [0.064 * s, 0.0], [0.062 * s, 0.4 * ua], [0.0555 * s, 0.46 * ua], [0.0, 0.46 * ua]] },
      material: shirt,
    })
    P({
      name: `forearm${side}`,
      bone: `forearm${side}`,
      shape: { kind: 'lathe', profile: [[0.0, -0.01 * s], [0.04 * s, 0.01 * s], [0.043 * s, 0.25 * fa], [0.034 * s, 0.75 * fa], [0.028 * s, fa], [0.0, fa + 0.02 * s]] },
      material: skin,
    })
    // Hand: palm plus curled fingers (a fist around the racket handle or the ball).
    P({ name: `palm${side}`, bone: `hand${side}`, shape: { kind: 'box', size: [0.075 * s, 0.085 * s, 0.03 * s], radius: 0.014 * s }, position: [0, 0.045 * s, 0.004 * s], material: skin })
    P({ name: `fingers${side}`, bone: `hand${side}`, shape: { kind: 'box', size: [0.072 * s, 0.045 * s, 0.045 * s], radius: 0.018 * s }, position: [-0.004 * s, 0.1 * s, 0.018 * s], material: skin })
    // Hand bone: y = wrist to knuckles, z = palm normal, x = y cross z. The thumb is on +x for a
    // right hand and on -x for a left hand (mirror images).
    const thumbX = side === 'R' ? 0.04 * s : -0.04 * s
    P({ name: `thumb${side}`, bone: `hand${side}`, shape: { kind: 'ellipsoid', radii: [0.014 * s, 0.03 * s, 0.013 * s] }, position: [thumbX, 0.05 * s, 0.02 * s], material: skin })
    // Legs.
    const th = a.thighM
    const sh = a.shankM
    P({
      name: `thigh${side}`,
      bone: `thigh${side}`,
      shape: { kind: 'lathe', profile: [[0.0, -0.03 * s], [0.08 * s, -0.01 * s], [0.082 * s, 0.25 * th], [0.066 * s, 0.75 * th], [0.052 * s, th], [0.0, th + 0.04 * s]] },
      material: skin,
    })
    P({
      name: `shortsLeg${side}`,
      bone: `thigh${side}`,
      shape: { kind: 'lathe', profile: [[0.0, -0.05 * s], [0.094 * s, -0.03 * s], [0.092 * s, 0.3 * th], [0.087 * s, 0.5 * th], [0.0, 0.5 * th]] },
      material: shorts,
    })
    P({
      name: `shank${side}`,
      bone: `shank${side}`,
      shape: { kind: 'lathe', profile: [[0.0, -0.02 * s], [0.052 * s, 0.0], [0.056 * s, 0.3 * sh], [0.042 * s, 0.7 * sh], [0.032 * s, sh], [0.0, sh + 0.02 * s]] },
      material: skin,
    })
    P({
      name: `sock${side}`,
      bone: `shank${side}`,
      shape: { kind: 'lathe', profile: [[0.0, 0.78 * sh], [0.036 * s, 0.78 * sh], [0.035 * s, sh + 0.02 * s], [0.0, sh + 0.04 * s]] },
      material: { color: outfit.socks, roughness: 0.9, texture: 'fabric' },
    })
    // Shoe (foot bone: x forward along the foot, z up, origin at the ankle).
    const fl = a.footLengthM
    const shoeCentreX = (a.ankleToToeM - a.ankleToHeelM) / 2
    P({
      name: `shoe${side}`,
      bone: `foot${side}`,
      shape: { kind: 'box', size: [fl + 0.03 * s, 0.1 * s, 0.085 * s], radius: 0.035 * s },
      position: [shoeCentreX, 0, -a.ankleHeightM + 0.045 * s],
      material: { color: outfit.shoes, roughness: 0.55 },
    })
    P({
      name: `sole${side}`,
      bone: `foot${side}`,
      shape: { kind: 'box', size: [fl + 0.03 * s, 0.098 * s, 0.022 * s], radius: 0.008 * s },
      position: [shoeCentreX, 0, -a.ankleHeightM + 0.011 * s],
      material: { color: '#8a8a8a', roughness: 0.8 },
    })
  }

  // Racket (bone origin at the butt, y along the shaft, z = face normal).
  const headCentreY = RACKET.stringCentreFromButtM + 0.01
  const headRx = RACKET.headWidthM / 2
  const headRy = (RACKET.lengthM - RACKET.headStartFromButtM) / 2
  const rf: PartMaterial = { color: outfit.racketFrame, roughness: 0.35, metalness: 0.1 }
  P({ name: 'handle', bone: 'racket', shape: { kind: 'cylinder', rTop: 0.0135, rBottom: 0.0155, height: 0.2 }, position: [0, 0.1, 0], material: { color: '#1a1a1a', roughness: 0.9 } })
  P({ name: 'shaft', bone: 'racket', shape: { kind: 'cylinder', rTop: 0.011, rBottom: 0.012, height: 0.1 }, position: [0, 0.25, 0], material: rf })
  P({ name: 'throatL', bone: 'racket', shape: { kind: 'cylinder', rTop: 0.008, rBottom: 0.009, height: 0.075 }, position: [0.022, 0.335, 0], quaternion: [0, 0, -0.26, 0.966], material: rf })
  P({ name: 'throatR', bone: 'racket', shape: { kind: 'cylinder', rTop: 0.008, rBottom: 0.009, height: 0.075 }, position: [-0.022, 0.335, 0], quaternion: [0, 0, 0.26, 0.966], material: rf })
  P({ name: 'frame', bone: 'racket', shape: { kind: 'ring', radii: [headRx, headRy], tube: 0.0095 }, position: [0, headCentreY, 0], material: rf })
  P({
    name: 'strings',
    bone: 'racket',
    shape: { kind: 'disc', radii: [headRx - 0.008, headRy - 0.008] },
    position: [0, headCentreY, 0],
    material: { color: '#f5f5f0', roughness: 0.6, opacity: 0.55, texture: 'strings' },
    castShadow: false,
    occluder: false,
  })
  return parts
}

/** Rigid bone transforms from pose points (works for mirrored poses: built from labelled points only). */
export function boneTransforms(p: PosePoints): Record<BoneName, BoneTransform> {
  const lm = p.lm
  const up: Vec3 = [0, 0, 1]
  const leftDir = sub(p.leftHip, p.rightHip)
  const pelvisFwd = norm([leftDir[1] * -1, leftDir[0], 0]) // rotate "left" by -90 deg about z
  const pelvis = { origin: p.pelvis, basis: basisFrom('y', up, 'x', pelvisFwd) }
  const midSh = p.midShoulder
  const shLeft = sub(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER])
  const thoraxUp = sub(midSh, p.pelvis)
  // Chest forward is perpendicular to the spine and the shoulder line (right-handed: fwd = left x up).
  const thoraxFwd: Vec3 = [
    shLeft[1] * thoraxUp[2] - shLeft[2] * thoraxUp[1],
    shLeft[2] * thoraxUp[0] - shLeft[0] * thoraxUp[2],
    shLeft[0] * thoraxUp[1] - shLeft[1] * thoraxUp[0],
  ]
  const thorax = { origin: p.pelvis, basis: basisFrom('y', thoraxUp, 'x', thoraxFwd) }
  const headFwd = sub(p.headForwardPt, p.headCentre)
  const headUp = sub(p.headUpPt, p.headCentre)
  const neck = { origin: midSh, basis: basisFrom('y', sub(p.headCentre, p.neckBase), 'x', headFwd) }
  const head = { origin: p.headCentre, basis: basisFrom('y', headUp, 'x', headFwd) }
  const limb = (a: Vec3, b: Vec3, hint: Vec3): BoneTransform => ({ origin: a, basis: basisFrom('y', sub(b, a), 'x', hint) })
  const hand = (wrist: Vec3, index: Vec3, pinky: Vec3, palmPt: Vec3): BoneTransform => {
    const along = sub(mid(index, pinky), wrist)
    const palm = sub(palmPt, wrist)
    return { origin: wrist, basis: basisFrom('y', along, 'z', palm) }
  }
  const foot = (ankle: Vec3, heel: Vec3, toe: Vec3, knee: Vec3): BoneTransform => {
    const fwd = sub(toe, heel)
    const upHint = sub(knee, ankle)
    return { origin: ankle, basis: basisFrom('x', fwd, 'z', upHint) }
  }
  const racketY = sub(p.racketTip, p.racketButt)
  const racketZ = sub(p.racketFacePt, p.racketStringCentre)
  const kneeHintL = sub(lm[LM.LEFT_FOOT_INDEX], lm[LM.LEFT_HEEL])
  const kneeHintR = sub(lm[LM.RIGHT_FOOT_INDEX], lm[LM.RIGHT_HEEL])
  return {
    pelvis,
    thorax,
    neck,
    head,
    upperArmL: limb(lm[LM.LEFT_SHOULDER], p.leftElbow, thoraxFwd),
    upperArmR: limb(lm[LM.RIGHT_SHOULDER], p.rightElbow, thoraxFwd),
    forearmL: limb(p.leftElbow, lm[LM.LEFT_WRIST], sub(lm[LM.LEFT_THUMB], lm[LM.LEFT_WRIST])),
    forearmR: limb(p.rightElbow, lm[LM.RIGHT_WRIST], sub(lm[LM.RIGHT_THUMB], lm[LM.RIGHT_WRIST])),
    handL: hand(lm[LM.LEFT_WRIST], lm[LM.LEFT_INDEX], lm[LM.LEFT_PINKY], p.leftPalmPt),
    handR: hand(lm[LM.RIGHT_WRIST], lm[LM.RIGHT_INDEX], lm[LM.RIGHT_PINKY], p.rightPalmPt),
    thighL: limb(lm[LM.LEFT_HIP], lm[LM.LEFT_KNEE], kneeHintL),
    thighR: limb(lm[LM.RIGHT_HIP], lm[LM.RIGHT_KNEE], kneeHintR),
    shankL: limb(lm[LM.LEFT_KNEE], lm[LM.LEFT_ANKLE], kneeHintL),
    shankR: limb(lm[LM.RIGHT_KNEE], lm[LM.RIGHT_ANKLE], kneeHintR),
    footL: foot(lm[LM.LEFT_ANKLE], lm[LM.LEFT_HEEL], lm[LM.LEFT_FOOT_INDEX], lm[LM.LEFT_KNEE]),
    footR: foot(lm[LM.RIGHT_ANKLE], lm[LM.RIGHT_HEEL], lm[LM.RIGHT_FOOT_INDEX], lm[LM.RIGHT_KNEE]),
    racket: { origin: p.racketButt, basis: basisFrom('y', racketY, 'z', racketZ) },
  }
}

/** Flatten bone transforms to [x,y,z, qx,qy,qz,qw] per bone in BONES order. */
export function packBones(b: Record<BoneName, BoneTransform>): number[] {
  const out: number[] = []
  for (const name of BONES) {
    const t = b[name]
    const q = basisToQuat(t.basis)
    out.push(t.origin[0], t.origin[1], t.origin[2], q[0], q[1], q[2], q[3])
  }
  return out
}

export const offsetPoint = (t: BoneTransform, local: Vec3): Vec3 =>
  add(t.origin, [
    t.basis.x[0] * local[0] + t.basis.y[0] * local[1] + t.basis.z[0] * local[2],
    t.basis.x[1] * local[0] + t.basis.y[1] * local[1] + t.basis.z[1] * local[2],
    t.basis.x[2] * local[0] + t.basis.y[2] * local[1] + t.basis.z[2] * local[2],
  ])

export { QY_TO_Z }
