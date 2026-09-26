/**
 * Synthetic ground truth for toss, outgoing-ball and bounce tests (test support only).
 *
 * Physics: gravity 9.81 m/s^2 and quadratic air drag (decay length L = 2m / (rho Cd A),
 * ~49 m for a tennis ball with Cd 0.55). The tossing hand drives the ball with an excess
 * acceleration with a half-sine profile over the carry, zero at the start and at release, so
 * the ball leaves the hand smoothly (as it physically must: release happens when the hand
 * decelerates faster than g). The toss estimator does not assume this profile.
 * World frame: X, Y (up), Z; a pinhole camera with yaw / pitch projects to normalised image
 * coordinates (y down), frame-height focal length.
 */
import type { BallObservation } from '../../types.ts'
import type { FrameCandidates } from '../tracker.ts'
import { gaussian, type Rng } from '../random.ts'

export type Vec3 = { x: number; y: number; z: number }

export const G = 9.81
export const DRAG_LENGTH_M = 49

export interface Camera {
  position: Vec3
  /** Rotation about the vertical axis (rad); 0 looks along +Z. */
  yawRad: number
  /** Downward tilt (rad). */
  pitchRad: number
  /** Focal length in frame heights. */
  focalFhu: number
  /** Width / height. */
  aspect: number
}

export interface Projection {
  x: number
  y: number
  /** Camera-space depth (m). */
  depthM: number
  /** Frame heights per metre at this depth. */
  unitsPerM: number
}

export function project(camera: Camera, p: Vec3): Projection {
  const dx = p.x - camera.position.x
  const dy = p.y - camera.position.y
  const dz = p.z - camera.position.z
  // Yaw about Y, then pitch about the camera X axis.
  const cy = Math.cos(camera.yawRad)
  const sy = Math.sin(camera.yawRad)
  const x1 = cy * dx - sy * dz
  const z1 = sy * dx + cy * dz
  const cp = Math.cos(camera.pitchRad)
  const sp = Math.sin(camera.pitchRad)
  const y2 = cp * dy + sp * z1
  const z2 = -sp * dy + cp * z1
  const f = camera.focalFhu
  return {
    x: (camera.aspect / 2 + (f * x1) / z2) / camera.aspect,
    y: 0.5 - (f * y2) / z2,
    depthM: z2,
    unitsPerM: f / z2,
  }
}

/** Ball state integrated with gravity and quadratic drag (RK4). */
export function integrateFlight(p0: Vec3, v0: Vec3, durationS: number, dragLengthM = DRAG_LENGTH_M, dt = 2e-4): (t: number) => { p: Vec3; v: Vec3 } {
  const steps = Math.max(1, Math.ceil(durationS / dt))
  const h = durationS / steps
  const states: number[][] = [[p0.x, p0.y, p0.z, v0.x, v0.y, v0.z]]
  const deriv = (s: number[]) => {
    const speed = Math.hypot(s[3], s[4], s[5])
    const k = speed / dragLengthM
    return [s[3], s[4], s[5], -k * s[3], -G - k * s[4], -k * s[5]]
  }
  let s = states[0]
  for (let i = 0; i < steps; i++) {
    const k1 = deriv(s)
    const k2 = deriv(s.map((v, j) => v + (h / 2) * k1[j]))
    const k3 = deriv(s.map((v, j) => v + (h / 2) * k2[j]))
    const k4 = deriv(s.map((v, j) => v + h * k3[j]))
    s = s.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]))
    states.push(s)
  }
  return (t: number) => {
    const u = Math.max(0, Math.min(steps, t / h))
    const i = Math.min(steps - 1, Math.floor(u))
    const w = u - i
    const a = states[i]
    const b = states[i + 1]
    const m = a.map((v, j) => v + w * (b[j] - v))
    return { p: { x: m[0], y: m[1], z: m[2] }, v: { x: m[3], y: m[4], z: m[5] } }
  }
}

export interface TossParams {
  releaseTime: number
  releasePos: Vec3
  releaseVel: Vec3
  /** Duration of the hand's upward drive before release. */
  carryS: number
  /** Contact time (the toss ends here). */
  contactTime: number
  dragLengthM?: number
}

export interface TossTruth {
  params: TossParams
  /** World position at time t (in hand before release, free flight after). */
  positionAt: (t: number) => Vec3
  /** Time of maximum height (true apex, including drag). */
  apexTime: number
  apexPos: Vec3
}

export function simulateToss(params: TossParams): TossTruth {
  const { releaseTime: tr, releasePos: pr, releaseVel: vr, carryS: tc } = params
  const flight = integrateFlight(pr, vr, params.contactTime - tr + 0.5, params.dragLengthM)
  // Excess vertical acceleration E sin(pi tau / tc), tau = t_r - t, starting from rest. Its
  // double integral from release backwards is E (tau / w - sin(w tau) / w^2), w = pi / tc.
  const w = Math.PI / tc
  const excess = ((vr.y + G * tc) * Math.PI) / (2 * tc)
  const carry = (tau: number): Vec3 => ({
    x: pr.x - vr.x * tau + (vr.x / (2 * tc)) * tau * tau,
    y: pr.y - vr.y * tau - (G * tau * tau) / 2 + excess * (tau / w - Math.sin(w * tau) / (w * w)),
    z: pr.z - vr.z * tau + (vr.z / (2 * tc)) * tau * tau,
  })
  const positionAt = (t: number): Vec3 => {
    if (t >= tr) return flight(t - tr).p
    return carry(Math.min(tc, tr - t))
  }
  // Apex: vertical velocity crosses zero; bisection on the integrated flight.
  let lo = 0
  let hi = params.contactTime - tr + 0.5
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (flight(mid).v.y > 0) lo = mid
    else hi = mid
  }
  const apexTime = tr + (lo + hi) / 2
  return { params, positionAt, apexTime, apexPos: flight(apexTime - tr).p }
}

/** Frame times starting at tStart + phase * period. */
export function frameTimes(fps: number, tStart: number, tEnd: number, phase = 0): number[] {
  const out: number[] = []
  for (let k = 0; ; k++) {
    const t = tStart + (k + phase) / fps
    if (t > tEnd) break
    out.push(t)
  }
  return out
}

export interface CandidateNoise {
  /** 1-sigma localisation noise, frame-height units. */
  sigmaNorm: number
  missRate: number
  /** Mean false candidates per frame (Poisson), uniformly placed in the region below. */
  falsePerFrame: number
  falseRegion?: { x0: number; y0: number; x1: number; y1: number }
  /** Static distractors present in every frame (e.g. a spare ball on the ground). */
  staticDistractors?: { x: number; y: number }[]
}

function poisson(rng: Rng, mean: number): number {
  const limit = Math.exp(-mean)
  let k = 0
  let p = rng()
  while (p > limit) {
    k++
    p *= rng()
  }
  return k
}

/**
 * Candidate lists for frames at `times` (real seconds). `timestampOf` maps real time to the
 * timestamps the tracker will see (identity, or t / timeScale for un-corrected slow motion).
 */
export function candidatesFromTruth(
  times: number[],
  truthAt: (t: number) => { x: number; y: number; radiusNorm: number } | null,
  aspect: number,
  noise: CandidateNoise,
  rng: Rng,
  timestampOf: (t: number) => number = (t) => t,
): FrameCandidates[] {
  const region = noise.falseRegion ?? { x0: 0, y0: 0, x1: 1, y1: 1 }
  return times.map((t, index) => {
    const candidates: FrameCandidates['candidates'] = []
    const truth = truthAt(t)
    if (truth && truth.y > 0 && truth.y < 1 && truth.x > 0 && truth.x < 1 && rng() >= noise.missRate) {
      candidates.push({
        x: truth.x + (noise.sigmaNorm * gaussian(rng)) / aspect,
        y: truth.y + noise.sigmaNorm * gaussian(rng),
        radiusNorm: truth.radiusNorm,
        score: 0.5 + 0.4 * rng(),
      })
    }
    for (let k = poisson(rng, noise.falsePerFrame); k > 0; k--) {
      candidates.push({
        x: region.x0 + (region.x1 - region.x0) * rng(),
        y: region.y0 + (region.y1 - region.y0) * rng(),
        radiusNorm: (truth?.radiusNorm ?? 0.01) * (0.6 + 0.8 * rng()),
        score: 0.2 + 0.6 * rng(),
      })
    }
    for (const d of noise.staticDistractors ?? []) {
      candidates.push({ x: d.x, y: d.y, radiusNorm: truth?.radiusNorm ?? 0.01, score: 0.3 + 0.3 * rng() })
    }
    return { frameIndex: index, tReal: timestampOf(t), candidates }
  })
}

/** Exact observations (no noise) as BallObservation, for fitting tests. */
export function observationsFromTruth(
  times: number[],
  truthAt: (t: number) => { x: number; y: number; radiusNorm: number },
  sigmaNorm: number,
  aspect: number,
  rng: Rng,
): BallObservation[] {
  return times.map((t, i) => {
    const p = truthAt(t)
    return {
      frameIndex: i,
      tReal: t,
      x: p.x + (sigmaNorm * gaussian(rng)) / aspect,
      y: p.y + sigmaNorm * gaussian(rng),
      radius: p.radiusNorm,
      score: 0.8,
      source: 'detected' as const,
    }
  })
}

/** Typical side-view setup: player 6 m from a phone at 1.4 m height, stature ~40% of frame height. */
export function sideViewCamera(aspect: number, distanceM = 6, statureFraction = 0.4, statureM = 1.8): Camera {
  return {
    position: { x: 0.3, y: 1.4, z: -distanceM },
    yawRad: 0,
    pitchRad: 0,
    focalFhu: (statureFraction * distanceM) / statureM,
    aspect,
  }
}

/** Default toss: release at 1.95 m rising at 4.8 m/s (apex ~3.1 m), contact 0.3 s after apex. */
export function defaultTossParams(overrides: Partial<TossParams> = {}): TossParams {
  return {
    releaseTime: 1.0,
    releasePos: { x: 0.15, y: 1.95, z: 0 },
    releaseVel: { x: 0.35, y: 4.8, z: 0 },
    carryS: 0.4,
    contactTime: 1.0 + 0.49 + 0.3,
    ...overrides,
  }
}
