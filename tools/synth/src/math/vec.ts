/** Small 3-vector and 3x3 basis helpers. Vectors are plain tuples so they serialise to JSON cleanly. */

export type Vec3 = [number, number, number]

/** Orthonormal frame: x, y, z are the frame's axes expressed in world coordinates (the columns of R). */
export interface Basis {
  x: Vec3
  y: Vec3
  z: Vec3
}

export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z]
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
export const mid = (a: Vec3, b: Vec3): Vec3 => lerp(a, b, 0.5)

export function norm(a: Vec3): Vec3 {
  const l = len(a)
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1]
}

/** Component of `a` perpendicular to unit vector `n`. */
export const reject = (a: Vec3, n: Vec3): Vec3 => addScaled(a, n, -dot(a, n))

export const DEG = Math.PI / 180
export const toRad = (deg: number): number => deg * DEG
export const toDeg = (rad: number): number => rad / DEG

/** Angle between two vectors in degrees (0..180). */
export function angleDeg(a: Vec3, b: Vec3): number {
  const c = dot(a, b) / Math.max(1e-12, len(a) * len(b))
  return toDeg(Math.acos(Math.min(1, Math.max(-1, c))))
}

/** Rodrigues rotation of v about unit axis k by angle (rad). */
export function rotateAbout(v: Vec3, k: Vec3, angleRad: number): Vec3 {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  const kv = cross(k, v)
  const kd = dot(k, v) * (1 - c)
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd]
}

/** Express local coordinates (in basis b) in world coordinates. */
export const fromBasis = (b: Basis, local: Vec3): Vec3 => [
  b.x[0] * local[0] + b.y[0] * local[1] + b.z[0] * local[2],
  b.x[1] * local[0] + b.y[1] * local[1] + b.z[1] * local[2],
  b.x[2] * local[0] + b.y[2] * local[1] + b.z[2] * local[2],
]

/** Express a world vector in the basis' local coordinates. */
export const toBasis = (b: Basis, world: Vec3): Vec3 => [dot(b.x, world), dot(b.y, world), dot(b.z, world)]

/**
 * Build a right-handed orthonormal basis whose `primary` axis is exactly `primaryDir`
 * and whose `secondary` axis is as close as possible to `secondaryHint`.
 */
export function basisFrom(primary: 'x' | 'y' | 'z', primaryDir: Vec3, secondary: 'x' | 'y' | 'z', secondaryHint: Vec3): Basis {
  const p = norm(primaryDir)
  let s = reject(secondaryHint, p)
  if (len(s) < 1e-6) s = reject(Math.abs(p[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], p)
  s = norm(s)
  const axes: Record<'x' | 'y' | 'z', Vec3 | null> = { x: null, y: null, z: null }
  axes[primary] = p
  axes[secondary] = s
  // Third axis from the cyclic order x -> y -> z -> x keeps the basis right-handed.
  if (!axes.x) axes.x = cross(axes.y!, axes.z!)
  else if (!axes.y) axes.y = cross(axes.z!, axes.x)
  else axes.z = cross(axes.x, axes.y!)
  return { x: axes.x, y: axes.y!, z: axes.z! }
}

/** Quaternion [x, y, z, w] of the rotation whose columns are the basis axes. */
export function basisToQuat(b: Basis): [number, number, number, number] {
  const m00 = b.x[0], m01 = b.y[0], m02 = b.z[0]
  const m10 = b.x[1], m11 = b.y[1], m12 = b.z[1]
  const m20 = b.x[2], m21 = b.y[2], m22 = b.z[2]
  const trace = m00 + m11 + m22
  let x: number, y: number, z: number, w: number
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    w = 0.25 / s
    x = (m21 - m12) * s
    y = (m02 - m20) * s
    z = (m10 - m01) * s
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    w = (m21 - m12) / s
    x = 0.25 * s
    y = (m01 + m10) / s
    z = (m02 + m20) / s
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    w = (m02 - m20) / s
    x = (m01 + m10) / s
    y = 0.25 * s
    z = (m12 + m21) / s
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
    w = (m10 - m01) / s
    x = (m02 + m20) / s
    y = (m12 + m21) / s
    z = 0.25 * s
  }
  return [x, y, z, w]
}

/** Horizontal unit vector at yaw angle (deg, CCW from +x seen from above). */
export const yawDir = (yawDeg: number): Vec3 => [Math.cos(toRad(yawDeg)), Math.sin(toRad(yawDeg)), 0]
