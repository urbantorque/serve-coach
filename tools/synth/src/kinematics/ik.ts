import { addScaled, dist, len, norm, reject, sub, type Vec3 } from '../math/vec.ts'

export interface TwoBoneResult {
  mid: Vec3
  end: Vec3
  /** True when the target was out of reach and the chain was straightened toward it. */
  clamped: boolean
}

/**
 * Analytic two-bone IK. The middle joint (knee/elbow) bends toward `poleDir`.
 * If the target is out of reach the chain points straight at it with its full length.
 */
export function twoBoneIK(root: Vec3, target: Vec3, l1: number, l2: number, poleDir: Vec3): TwoBoneResult {
  const toT = sub(target, root)
  const dRaw = len(toT)
  const e = dRaw > 1e-9 ? norm(toT) : ([0, 0, -1] as Vec3)
  const maxD = (l1 + l2) * 0.99999
  const minD = Math.abs(l1 - l2) + 1e-6
  const d = Math.min(maxD, Math.max(minD, dRaw))
  const clamped = dRaw > maxD
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  let q = reject(poleDir, e)
  if (len(q) < 1e-6) q = reject([0, 0, 1], e)
  if (len(q) < 1e-6) q = reject([1, 0, 0], e)
  q = norm(q)
  const mid = addScaled(addScaled(root, e, x), q, h)
  const end = addScaled(root, e, d)
  return { mid, end, clamped }
}

/** Interior-angle complement: 0 deg for a straight limb, larger when bent. */
export function flexionDeg(a: Vec3, joint: Vec3, b: Vec3): number {
  const u = sub(a, joint)
  const v = sub(b, joint)
  const c = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.max(1e-12, len(u) * len(v))
  return 180 - (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI
}

/** Hip-to-ankle distance that produces knee flexion `flexDeg` (law of cosines). */
export function legSpanForFlexion(thighM: number, shankM: number, flexDeg: number): number {
  const k = (flexDeg * Math.PI) / 180
  return Math.sqrt(thighM * thighM + shankM * shankM + 2 * thighM * shankM * Math.cos(k))
}

export const distance = dist
