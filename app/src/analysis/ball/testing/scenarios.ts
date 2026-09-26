/**
 * Ready-made synthetic serve scenarios for tracker / toss / speed / bounce tests
 * (test support only). All randomness is seeded.
 */
import type { FrameCandidates } from '../tracker.ts'
import { createRng, type Rng } from '../random.ts'
import { BALL_RADIUS_M } from '../scale.ts'
import {
  candidatesFromTruth,
  defaultTossParams,
  frameTimes,
  integrateFlight,
  project,
  sideViewCamera,
  simulateToss,
  type Camera,
  type TossParams,
  type TossTruth,
  type Vec3,
} from './synthTrajectories.ts'

export interface TossScenarioOptions {
  fps: number
  seed: number
  /** Localisation noise in ball radii (1 sigma). */
  noiseRadii?: number
  missRate?: number
  falsePerFrame?: number
  /** Timestamps = real time / timeScale (0.125 = 240 fps capture labelled as 30 fps). */
  timeScale?: number
  aspect?: number
  /** Player stature in metres (the scale assumes 1.75 m unless told otherwise). */
  statureM?: number
  /** Include ball-in-hand detections from this long before release (s). */
  leadInVisibleS?: number
  /** Stature as a fraction of frame height (default 0.4). Larger values crop the toss apex out of the top of the frame. */
  statureFraction?: number
  /** Contact delay after the apex, uniform in [lo, hi] seconds (default [0.2, 0.35]). */
  contactAfterApexS?: [number, number]
}

export interface TossScenario {
  frames: FrameCandidates[]
  truth: TossTruth
  params: TossParams
  camera: Camera
  aspect: number
  radiusNorm: number
  /** True frame heights per metre at the player's depth. */
  unitsPerM: number
  statureM: number
  timeScale: number
  rng: Rng
}

/** Side-view toss with randomised release speed / drift and contact 0.2-0.35 s after the apex. */
export function makeTossScenario(options: TossScenarioOptions): TossScenario {
  const rng = createRng(options.seed)
  const aspect = options.aspect ?? 9 / 16
  const statureM = options.statureM ?? 1.8
  const camera = sideViewCamera(aspect, 6, options.statureFraction ?? 0.4, statureM)
  const unitsPerM = camera.focalFhu / 6
  const radiusNorm = BALL_RADIUS_M * unitsPerM
  const base = defaultTossParams({ releaseVel: { x: 0.15 + 0.4 * rng(), y: 4.2 + 1.2 * rng(), z: 0 } })
  const apexTime = simulateToss(base).apexTime
  const [delayLo, delayHi] = options.contactAfterApexS ?? [0.2, 0.35]
  const params: TossParams = { ...base, contactTime: apexTime + delayLo + (delayHi - delayLo) * rng() }
  const truth = simulateToss(params)
  const leadIn = options.leadInVisibleS ?? 0.3
  const times = frameTimes(options.fps, params.releaseTime - 0.6, params.contactTime + 0.3, rng())
  const truthAt = (t: number) => {
    if (t < params.releaseTime - leadIn || t > params.contactTime) return null
    const p = project(camera, truth.positionAt(t))
    return { x: p.x, y: p.y, radiusNorm: BALL_RADIUS_M * p.unitsPerM }
  }
  const timeScale = options.timeScale ?? 1
  const frames = candidatesFromTruth(
    times,
    truthAt,
    aspect,
    {
      sigmaNorm: (options.noiseRadii ?? 0.3) * radiusNorm,
      missRate: options.missRate ?? 0.1,
      falsePerFrame: options.falsePerFrame ?? 1,
      staticDistractors: [{ x: 0.8, y: 0.9 }],
    },
    rng,
    (t) => t / timeScale,
  )
  return { frames, truth, params, camera, aspect, radiusNorm, unitsPerM, statureM, timeScale, rng }
}

export interface OutgoingScenarioOptions {
  fps: number
  seed: number
  speedMps: number
  /** Angle between the ball's direction and the image plane (deg). */
  outOfPlaneDeg: number
  /** Downward launch angle below horizontal (deg). */
  downwardDeg?: number
  noiseRadii?: number
  aspect?: number
  cameraDistanceM?: number
}

export interface OutgoingScenario {
  frames: FrameCandidates[]
  contactTime: number
  contactPoint: Vec3
  camera: Camera
  aspect: number
  unitsPerM: number
  radiusNorm: number
  speedMps: number
}

/**
 * Side view, landscape by default: ball struck at 2.7 m height toward +x (net) with a
 * component toward the camera (out of plane); gravity and drag included.
 */
export function makeOutgoingScenario(options: OutgoingScenarioOptions): OutgoingScenario {
  const rng = createRng(options.seed)
  const aspect = options.aspect ?? 16 / 9
  const distance = options.cameraDistanceM ?? 6
  const camera: Camera = { position: { x: 1.5, y: 1.4, z: -distance }, yawRad: 0, pitchRad: 0, focalFhu: (0.4 * distance) / 1.8, aspect }
  const unitsPerM = camera.focalFhu / distance
  const radiusNorm = BALL_RADIUS_M * unitsPerM
  const contactTime = 1.0
  const contactPoint: Vec3 = { x: 0.4, y: 2.7, z: 0 }
  const down = ((options.downwardDeg ?? 6) * Math.PI) / 180
  const out = (options.outOfPlaneDeg * Math.PI) / 180
  const v = options.speedMps
  const v0: Vec3 = { x: v * Math.cos(down) * Math.cos(out), y: -v * Math.sin(down), z: -v * Math.cos(down) * Math.sin(out) }
  const flight = integrateFlight(contactPoint, v0, 0.6)
  const times = frameTimes(options.fps, contactTime - 0.1, contactTime + 0.3, rng())
  const truthAt = (t: number) => {
    if (t <= contactTime) return null
    const p = project(camera, flight(t - contactTime).p)
    return { x: p.x, y: p.y, radiusNorm: BALL_RADIUS_M * p.unitsPerM }
  }
  const frames = candidatesFromTruth(times, truthAt, aspect, { sigmaNorm: (options.noiseRadii ?? 0.3) * radiusNorm, missRate: 0, falsePerFrame: 0 }, rng)
  return { frames, contactTime, contactPoint, camera, aspect, unitsPerM, radiusNorm, speedMps: v }
}
