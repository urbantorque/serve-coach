/**
 * Level indicator maths (CAPTURE §9.3, §2.4; DESIGN §8.20). Pure functions, unit-tested.
 *
 * Primary source: DeviceMotionEvent.accelerationIncludingGravity (one code path for both
 * orientations; Euler angles are ill-conditioned near landscape). Fallback: DeviceOrientationEvent
 * beta/gamma, portrait only. Device axes: x right, y up the long edge in portrait, z out of the
 * screen; the back camera looks along -z.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Tilt {
  /** Positive = lens tilted up (towards the sky). */
  pitchDeg: number
  /** Positive = phone rotated clockwise as seen by the person holding it. */
  rollDeg: number
}

const DEG = 180 / Math.PI

/**
 * Sign that turns accelerationIncludingGravity into the "up" vector. The W3C spec reports the
 * reaction to gravity (up); iOS Safari has historically reported the opposite sign. UNVERIFIED on
 * current devices (CAPTURE §9.3 step 7 is the device test that fixes it).
 */
export function gravitySignFor(userAgent: string, maxTouchPoints = 0): 1 | -1 {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  return ios ? -1 : 1
}

/** Exponential low-pass (CAPTURE §9.3 step 1: tau 0.3 s). */
export function lowPass(prev: Vec3 | null, next: Vec3, dtS: number, tauS = 0.3): Vec3 {
  if (!prev || !(dtS > 0)) return next
  const a = 1 - Math.exp(-dtS / tauS)
  return { x: prev.x + a * (next.x - prev.x), y: prev.y + a * (next.y - prev.y), z: prev.z + a * (next.z - prev.z) }
}

function wrap180(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180
  if (d === -180) d = 180
  return d
}

/**
 * Pitch and roll from the gravity reading (CAPTURE §9.3 steps 2 and 3). `screenAngleDeg` is
 * screen.orientation.angle (0 portrait, 90 or 270 landscape). Returns null for a zero vector.
 */
export function tiltFromGravity(accel: Vec3, screenAngleDeg: number, sign: 1 | -1 = 1): Tilt | null {
  const n = Math.hypot(accel.x, accel.y, accel.z)
  if (!(n > 0.5)) return null
  const u = { x: (sign * accel.x) / n, y: (sign * accel.y) / n, z: (sign * accel.z) / n }
  const pitchDeg = Math.asin(Math.max(-1, Math.min(1, -u.z))) * DEG
  const theta0 = 90 - screenAngleDeg
  const rollDeg = wrap180(Math.atan2(u.y, u.x) * DEG - theta0)
  return { pitchDeg, rollDeg }
}

/**
 * Fallback from DeviceOrientationEvent for an upright (portrait) phone: beta is 90 when upright
 * and 0 when lying face up (lens at the floor, pitch -90). Roll is gamma. Not used in landscape.
 */
export function tiltFromOrientation(betaDeg: number, gammaDeg: number): Tilt {
  return { pitchDeg: betaDeg - 90, rollDeg: gammaDeg }
}

export type LevelState =
  /** Within 2 degrees both ways. */
  | 'level'
  /** Within the Ready gate (3 degrees, or up to 5 degrees up when asked for at the fence); removed in software. */
  | 'corrected'
  /** Outside the Ready gate but inside D1's 5 degree pitch cap: Ready withheld, Record anyway allowed. */
  | 'tilted'
  /** Measured pitch beyond 5 degrees: blocks recording (D1), Record anyway not offered. */
  | 'over-cap'
  /** No reading (permission denied, no sensor, desktop). */
  | 'unknown'

export interface LevelOptions {
  /** Landscape at the fence may accept a measured upward tilt of up to 5 degrees (CAPTURE §9.3 step 5). */
  allowUpTiltDeg?: number
}

export const LEVEL_LIMITS = { solid: 2, ready: 3, cap: 5 } as const

export function classifyLevel(tilt: Tilt | null, options: LevelOptions = {}): LevelState {
  if (!tilt) return 'unknown'
  const p = tilt.pitchDeg
  const r = Math.abs(tilt.rollDeg)
  if (Math.abs(p) > LEVEL_LIMITS.cap) return 'over-cap'
  if (Math.abs(p) <= LEVEL_LIMITS.solid && r <= LEVEL_LIMITS.solid) return 'level'
  const upAllowed = options.allowUpTiltDeg ?? 0
  const pitchOk = Math.abs(p) <= LEVEL_LIMITS.ready || (p > 0 && p <= Math.min(upAllowed, LEVEL_LIMITS.cap))
  if (pitchOk && r <= LEVEL_LIMITS.ready) return 'corrected'
  return 'tilted'
}

/** The one plain instruction for a phone that is not level (CAPTURE §9.3 step 4). */
export function levelInstruction(tilt: Tilt): string {
  const p = tilt.pitchDeg
  const r = tilt.rollDeg
  if (Math.abs(p) >= Math.abs(r)) return p > 0 ? 'Tilt the top away from you' : 'Tilt the top towards you'
  return r > 0 ? 'Rotate slightly anticlockwise' : 'Rotate slightly clockwise'
}

/** Short value for the checklist: "Level", "Tilted 3°, corrected", "Tilted 7°". */
export function levelValue(tilt: Tilt | null, state: LevelState): string {
  if (!tilt || state === 'unknown') return 'Level unknown'
  if (state === 'level') return 'Level'
  const worst = Math.max(Math.abs(tilt.pitchDeg), Math.abs(tilt.rollDeg))
  const deg = Math.round(worst)
  return state === 'corrected' ? `Tilted ${deg}°, corrected` : `Tilted ${deg}°`
}
