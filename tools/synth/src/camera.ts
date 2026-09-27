import { add, cross, dot, norm, rotateAbout, sub, toRad, type Vec3 } from './math/vec.ts'
import { childSeed, mulberry32 } from './math/random.ts'

/**
 * Pinhole camera with optional radial (Brown/OpenCV k1,k2) distortion.
 * Camera axes follow OpenCV: x right, y down, z forward (optical axis).
 * Image coordinates: pixel u in [0,W], v in [0,H] with origin at the top-left corner of the
 * displayed frame; normalised coordinates are (u/W, v/H).
 */
export interface Intrinsics {
  widthPx: number
  heightPx: number
  fxPx: number
  fyPx: number
  cxPx: number
  cyPx: number
  k1: number
  k2: number
  /** 35 mm-equivalent focal length this was built from (see focalFromEquiv). */
  focal35mmEquivMm: number
}

export interface Extrinsics {
  /** Camera centre in court coordinates (m). */
  position: Vec3
  /** Rows of R: camera x (right), y (down), z (forward) axes in world coordinates. X_cam = R (X_world - position). */
  right: Vec3
  down: Vec3
  forward: Vec3
}

export interface Camera {
  intrinsics: Intrinsics
  extrinsics: Extrinsics
}

export const FULL_FRAME_DIAGONAL_MM = Math.hypot(36, 24)

/**
 * Focal length in pixels from a 35 mm-equivalent focal length.
 * Phone makers quote the equivalent focal length for the 4:3 sensor; 16:9 video uses the full sensor
 * width (long side) and crops the short side. So the 4:3 diagonal is longSidePx * 5/4 and
 * f_px = f35 * (longSidePx * 1.25) / 43.27 mm.
 */
export function focalFromEquiv(focal35mmEquivMm: number, widthPx: number, heightPx: number): number {
  const longSide = Math.max(widthPx, heightPx)
  return (focal35mmEquivMm * longSide * 1.25) / FULL_FRAME_DIAGONAL_MM
}

export function makeIntrinsics(widthPx: number, heightPx: number, focal35mmEquivMm: number, k1 = 0, k2 = 0): Intrinsics {
  const f = focalFromEquiv(focal35mmEquivMm, widthPx, heightPx)
  return { widthPx, heightPx, fxPx: f, fyPx: f, cxPx: widthPx / 2, cyPx: heightPx / 2, k1, k2, focal35mmEquivMm }
}

/** Look-at extrinsics with world +z up. Positive roll rotates the camera clockwise as seen from behind it. */
export function lookAt(position: Vec3, target: Vec3, rollDeg = 0): Extrinsics {
  const forward = norm(sub(target, position))
  let right = cross(forward, [0, 0, 1])
  if (Math.hypot(...right) < 1e-6) right = [1, 0, 0]
  right = norm(right)
  let down = cross(forward, right)
  if (rollDeg !== 0) {
    right = rotateAbout(right, forward, toRad(rollDeg))
    down = rotateAbout(down, forward, toRad(rollDeg))
  }
  return { position, right, down, forward }
}

export function worldToCamera(e: Extrinsics, p: Vec3): Vec3 {
  const d = sub(p, e.position)
  return [dot(e.right, d), dot(e.down, d), dot(e.forward, d)]
}

export interface Projection {
  /** Pixel coordinates (top-left origin). */
  u: number
  v: number
  /** Normalised image coordinates (u/W, v/H). */
  x: number
  y: number
  /** Depth along the optical axis (m). Negative means behind the camera. */
  depthM: number
  inFrame: boolean
}

export function distort(k1: number, k2: number, xn: number, yn: number): [number, number] {
  const r2 = xn * xn + yn * yn
  const d = 1 + k1 * r2 + k2 * r2 * r2
  return [xn * d, yn * d]
}

export function project(cam: Camera, p: Vec3): Projection {
  const c = worldToCamera(cam.extrinsics, p)
  const I = cam.intrinsics
  const z = c[2]
  const zSafe = Math.abs(z) < 1e-9 ? 1e-9 : z
  const [xd, yd] = distort(I.k1, I.k2, c[0] / zSafe, c[1] / zSafe)
  const u = I.fxPx * xd + I.cxPx
  const v = I.fyPx * yd + I.cyPx
  return { u, v, x: u / I.widthPx, y: v / I.heightPx, depthM: z, inFrame: z > 0 && u >= 0 && u <= I.widthPx && v >= 0 && v <= I.heightPx }
}

/** Projected radius (px) of a sphere of radius r at point p (small-angle; ignores distortion stretch). */
export function projectedRadiusPx(cam: Camera, p: Vec3, radiusM: number): number {
  const c = worldToCamera(cam.extrinsics, p)
  return c[2] > 0 ? (cam.intrinsics.fyPx * radiusM) / c[2] : 0
}

export type ViewName = 'side' | 'rear' | 'front45'

export interface ViewSpec {
  view: ViewName
  /** Horizontal distance from the player's stance point to the camera (m). */
  distanceM: number
  /** Camera height above the court (m). */
  heightM: number
  /** Look-at height (m). */
  lookAtHeightM?: number
  /** Additional forward (x) offset of the look-at point from the stance (m). */
  lookAtForwardM?: number
  rollDeg?: number
  /** 'chest': camera on the side the server's chest faces (sees the face); 'back': opposite side. */
  cameraSide?: 'chest' | 'back'
  /**
   * What `distanceM` is measured from. 'stance' (default): the first serve's front toe at toss
   * release, with the camera aimed at that toe. 'centre-mark' (side view only; the DECISIONS D1
   * set-up): the camera stands on the baseline extension (x = 0) `distanceM` from the centre mark,
   * aimed along the baseline at the point above the centre mark (plus `lookAtForwardM`), so it does
   * not follow the server's position. With lookAtHeightM = heightM the phone is level.
   */
  anchor?: 'stance' | 'centre-mark'
}

/**
 * Place a camera relative to the server's stance point.
 * chestSign: +1 if the server's chest faces +y (left-handers), -1 if it faces -y (right-handers).
 * side:    on the baseline extension (x = stance x), looking along the baseline at the server.
 * rear:    behind the server (-x), looking toward the net.
 * front45: in the court, 45 degrees between the net direction and the chest-facing side.
 */
export function placeCamera(spec: ViewSpec, stance: Vec3, chestSign: 1 | -1): Extrinsics {
  const side = (spec.cameraSide ?? 'chest') === 'chest' ? chestSign : -chestSign
  const lookZ = spec.lookAtHeightM ?? 1.45
  const fwd = spec.lookAtForwardM ?? 0
  const d = spec.distanceM
  if ((spec.anchor ?? 'stance') === 'centre-mark') {
    if (spec.view !== 'side') throw new Error(`camera anchor 'centre-mark' is only defined for the side view (got ${spec.view})`)
    return lookAt([0, side * d, spec.heightM], [fwd, 0, lookZ], spec.rollDeg ?? 0)
  }
  let pos: Vec3
  switch (spec.view) {
    case 'side':
      pos = [stance[0], stance[1] + side * d, spec.heightM]
      break
    case 'rear':
      pos = [stance[0] - d, stance[1], spec.heightM]
      break
    case 'front45':
      pos = [stance[0] + d * Math.SQRT1_2, stance[1] + side * d * Math.SQRT1_2, spec.heightM]
      break
  }
  const target: Vec3 = [stance[0] + fwd, stance[1], lookZ]
  return lookAt(pos, target, spec.rollDeg ?? 0)
}

export interface ShakeSpec {
  /** Peak-ish rotation amplitude (deg) for yaw/pitch; roll uses 60% of it. */
  rotationDeg: number
  /** Translation amplitude (m). */
  translationM: number
  seed: number
}

/**
 * Handheld shake: each axis is a sum of 4 sinusoids (0.3-6 Hz) with random phases, normalised
 * so the RMS equals amplitude / sqrt(2). Deterministic in (seed, t).
 */
export function makeShake(spec: ShakeSpec): (tRealS: number, base: Extrinsics) => Extrinsics {
  const rng = mulberry32(childSeed(spec.seed, 'shake'))
  const mk = () =>
    [0.35, 1.1, 2.7, 5.5].map((f, i) => ({ f: f * (0.8 + 0.4 * rng()), phase: 2 * Math.PI * rng(), w: 1 / (i + 1) }))
  const axes = Array.from({ length: 6 }, mk)
  const signal = (k: number, t: number) => {
    const comps = axes[k]
    const norm2 = Math.sqrt(comps.reduce((s, c) => s + c.w * c.w, 0))
    return comps.reduce((s, c) => s + c.w * Math.sin(2 * Math.PI * c.f * t + c.phase), 0) / norm2
  }
  return (t, base) => {
    const yaw = toRad(spec.rotationDeg * signal(0, t))
    const pitch = toRad(spec.rotationDeg * signal(1, t))
    const roll = toRad(0.6 * spec.rotationDeg * signal(2, t))
    let { right, down, forward } = base
    // Yaw about camera down axis, pitch about right axis, roll about forward axis.
    forward = rotateAbout(forward, down, yaw)
    right = rotateAbout(right, down, yaw)
    forward = rotateAbout(forward, right, pitch)
    down = rotateAbout(down, right, pitch)
    right = rotateAbout(right, forward, roll)
    down = rotateAbout(down, forward, roll)
    const dp: Vec3 = [spec.translationM * signal(3, t), spec.translationM * signal(4, t), spec.translationM * signal(5, t)]
    return { position: add(base.position, dp), right, down, forward }
  }
}

/** 3x3 world-to-camera rotation (row-major) and translation t = -R C, as written to truth.json. */
export function extrinsicsMatrix(e: Extrinsics): { R: number[]; t: Vec3 } {
  const R = [...e.right, ...e.down, ...e.forward]
  const t: Vec3 = [-dot(e.right, e.position), -dot(e.down, e.position), -dot(e.forward, e.position)]
  return { R, t }
}
