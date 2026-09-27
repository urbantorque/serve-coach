import { describe, expect, it } from 'vitest'
import type { BallObservation, BallTrack } from '../types.ts'
import { detectBounce, mapBounceToCourt } from './bounce.ts'
import { median, percentile } from './fit.ts'
import { computeHomography, COURT_KEYPOINTS } from './homography.ts'
import { createRng, gaussian, type Rng } from './random.ts'
import { BALL_RADIUS_M } from './scale.ts'
import { speedFromFlightTime } from './speed.ts'
import { candidatesFromTruth, frameTimes, integrateFlight, project, type Camera, type Vec3 } from './testing/synthTrajectories.ts'
import { trackBall } from './tracker.ts'

// Phone on a tripod 4 m behind the server's baseline, 1.4 m high, level, landscape 16:9.
// World: x across the court, y up, z along the court from the server's baseline.
const camera: Camera = { position: { x: 0.4, y: 1.4, z: -4 }, yawRad: 0.02, pitchRad: (3 * Math.PI) / 180, focalFhu: 1.3, aspect: 16 / 9 }
const FRAME_HEIGHT_PX = 1080

interface BounceTruth {
  times: number[]
  positionAt: (t: number) => Vec3
  bounceTime: number
  bouncePoint: Vec3
}

/** Serve struck at 2.7 m toward a far-box target; bounces with vertical COR 0.75 and 35% horizontal loss. */
function simulateServe(rng: Rng, fps: number): BounceTruth {
  const contact: Vec3 = { x: 0.5, y: 2.7, z: 0.3 }
  const speed = 30 + 20 * rng()
  const target = { x: -0.5 - 3 * rng(), z: 14 + 4 * rng() }
  const horizontal = Math.hypot(target.x - contact.x, target.z - contact.z)
  const dir = { x: (target.x - contact.x) / horizontal, z: (target.z - contact.z) / horizontal }
  const launch = (dip: number) => ({ x: speed * Math.cos(dip) * dir.x, y: -speed * Math.sin(dip), z: speed * Math.cos(dip) * dir.z })
  const landing = (dip: number) => {
    const flight = integrateFlight(contact, launch(dip), 1.5, undefined, 5e-4)
    for (let t = 0; t < 1.5; t += 0.0005) if (flight(t).p.y <= BALL_RADIUS_M) return { t, flight }
    return { t: 1.5, flight }
  }
  let lo = (-10 * Math.PI) / 180
  let hi = (20 * Math.PI) / 180
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2
    const { t, flight } = landing(mid)
    if (flight(t).p.z > target.z) lo = mid
    else hi = mid
  }
  const { t: tb, flight } = landing((lo + hi) / 2)
  // Refine the touchdown instant by bisection on the centre height.
  let a = Math.max(0, tb - 0.001)
  let b = tb
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2
    if (flight(m).p.y > BALL_RADIUS_M) a = m
    else b = m
  }
  const bounceAt = (a + b) / 2
  const atBounce = flight(bounceAt)
  const after = integrateFlight(atBounce.p, { x: 0.65 * atBounce.v.x, y: -0.75 * atBounce.v.y, z: 0.65 * atBounce.v.z }, 0.5, undefined, 5e-4)
  const positionAt = (t: number) => (t <= bounceAt ? flight(t).p : after(t - bounceAt).p)
  return {
    times: frameTimes(fps, 0, bounceAt + 0.25, rng()),
    positionAt,
    bounceTime: bounceAt,
    bouncePoint: { x: atBounce.p.x, y: 0, z: atBounce.p.z },
  }
}

function observe(truth: BounceTruth, rng: Rng): BallTrack {
  const observations: BallObservation[] = []
  truth.times.forEach((t, i) => {
    const p = project(camera, truth.positionAt(t))
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return
    const radius = BALL_RADIUS_M * p.unitsPerM
    // 0.3 ball radii, but never better than 0.5 px at 1080p.
    const sigma = Math.max(0.3 * radius, 0.5 / FRAME_HEIGHT_PX)
    observations.push({
      frameIndex: i,
      tReal: t,
      x: p.x + (sigma * gaussian(rng)) / camera.aspect,
      y: p.y + sigma * gaussian(rng),
      radius,
      score: 0.7,
      source: 'detected',
    })
  })
  return { id: 2, kind: 'outgoing', observations }
}

function calibrate(rng: Rng) {
  const names = ['nearServiceLineLeft', 'nearServiceLineRight', 'nearServiceT', 'farServiceLineLeft', 'farServiceLineRight', 'farServiceT']
  const court = names.map((n) => COURT_KEYPOINTS[n])
  const sigma = 1 / FRAME_HEIGHT_PX // 1 px tapping error
  const image = court.map((c) => {
    const p = project(camera, { x: c.x, y: 0, z: c.y })
    return { x: p.x + (sigma * gaussian(rng)) / camera.aspect, y: p.y + sigma * gaussian(rng) }
  })
  return computeHomography(image, court)!
}

describe('detectBounce + court placement (EXPERIMENTAL, rear view)', () => {
  for (const fps of [60, 120, 240]) {
    it(`finds the bounce time and landing spot at ${fps} fps`, { timeout: 60_000 }, () => {
      const rng = createRng(fps)
      const timeErr: number[] = []
      const placeErr: number[] = []
      const placeZ: number[] = []
      let refused = 0
      const trials = 25
      for (let trial = 0; trial < trials; trial++) {
        const truth = simulateServe(rng, fps)
        const bounce = detectBounce(observe(truth, rng))
        if (bounce.status !== 'experimental') {
          refused++
          continue
        }
        timeErr.push(bounce.tReal - truth.bounceTime)
        const calibration = calibrate(rng)
        const placed = mapBounceToCourt(bounce, calibration.H, camera.aspect, calibration.rmsError)
        if (placed.status !== 'experimental') {
          refused++
          continue
        }
        const err = Math.hypot(placed.court.x - truth.bouncePoint.x, placed.court.y - truth.bouncePoint.z)
        placeErr.push(err)
        placeZ.push(Math.abs(placed.court.y - truth.bouncePoint.z) / placed.sigmaYM)
      }
      console.info(
        `[ball-accuracy] bounce rear view ${fps} fps (${trials - refused}/${trials} found): time error median ${(median(timeErr.map(Math.abs)) * 1000).toFixed(1)} ms ` +
          `p90 ${(percentile(timeErr.map(Math.abs), 90) * 1000).toFixed(1)} ms; landing error median ${(median(placeErr) * 100).toFixed(0)} cm p90 ${(percentile(placeErr, 90) * 100).toFixed(0)} cm; ` +
          `along-court |z| median ${median(placeZ).toFixed(2)}`,
      )
      expect(refused).toBeLessThanOrEqual(2)
      expect(median(timeErr.map(Math.abs))).toBeLessThan(Math.max(0.006, 0.4 / fps))
      expect(median(placeErr)).toBeLessThan(fps >= 120 ? 0.35 : 0.6)
    })
  }

  it('average speed from contact to the located bounce covers the truth (speed-average-rear)', { timeout: 60_000 }, () => {
    const rng = createRng(4242)
    let covered = 0
    let found = 0
    const widths: number[] = []
    const trials = 20
    for (let trial = 0; trial < trials; trial++) {
      const truth = simulateServe(rng, 60)
      const bounce = detectBounce(observe(truth, rng))
      if (bounce.status !== 'experimental') continue
      const calibration = calibrate(rng)
      const placed = mapBounceToCourt(bounce, calibration.H, camera.aspect, calibration.rmsError)
      if (placed.status !== 'experimental') continue
      // Contact time from the ball tracks carries ~2 ms of error.
      const contactT = 0.002 * gaussian(rng)
      const est = speedFromFlightTime({
        cameraView: 'rear',
        contactTReal: contactT,
        contactSigmaS: 0.003,
        servedFrom: 'deuce',
        bounce: { tReal: bounce.tReal, uncertaintyS: bounce.uncertaintyS, court: placed.court, sigmaXM: placed.sigmaXM, sigmaYM: placed.sigmaYM },
      })
      if (est.status !== 'experimental') continue
      found++
      let path = 0
      for (let t = 0.0005, prev = truth.positionAt(0); t <= truth.bounceTime; t += 0.0005) {
        const p = truth.positionAt(t)
        path += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z)
        prev = p
      }
      const avgKmh = (path / truth.bounceTime) * 3.6
      if (est.lowKmh <= avgKmh && est.highKmh >= avgKmh) covered++
      widths.push(est.highKmh / est.lowKmh)
    }
    console.info(`[ball-accuracy] rear average speed from located bounce, 60 fps: ${covered}/${found} ranges cover the truth (${trials} serves), high/low median ${median(widths).toFixed(2)}`)
    expect(found).toBeGreaterThanOrEqual(trials - 3)
    expect(covered).toBeGreaterThanOrEqual(Math.floor(0.95 * found))
  })

  it('refuses a located bounce that maps off the court', () => {
    const calibration = calibrate(createRng(3))
    const farPoint = project(camera, { x: 0.5, y: 0, z: 110 })
    const bounce = {
      status: 'experimental' as const,
      tReal: 1,
      frameIndex: 1,
      x: farPoint.x,
      y: farPoint.y,
      groundContact: { x: farPoint.x, y: farPoint.y },
      uncertaintyS: 0.002,
      positionSigmaNorm: 0.001,
      confidence: 0.5,
      method: 'image-vy-sign-change' as const,
    }
    const placed = mapBounceToCourt(bounce, calibration.H, camera.aspect, calibration.rmsError)
    expect(placed.status === 'unavailable' && placed.reason).toMatch(/off the court/)
  })

  it('refuses when the track shows no bounce', () => {
    const rng = createRng(9)
    const truth = simulateServe(rng, 120)
    const track = observe(truth, rng)
    const beforeOnly: BallTrack = { ...track, observations: track.observations.filter((o) => o.tReal < truth.bounceTime - 0.01) }
    expect(detectBounce(beforeOnly).status).toBe('unavailable')
    expect(detectBounce({ ...track, observations: track.observations.slice(0, 4) }).status).toBe('unavailable')
  })
})

describe('outgoing track through the bounce (EXPERIMENTAL, rear view, from raw candidates)', () => {
  for (const fps of [30, 60, 120]) {
    it(`trackBall follows the ball through the bounce and detectBounce finds it at ${fps} fps`, { timeout: 60_000 }, () => {
      const rng = createRng(500 + fps)
      const timeErr: number[] = []
      const afterBounce: number[] = []
      let refused = 0
      const trials = 15
      for (let trial = 0; trial < trials; trial++) {
        const truth = simulateServe(rng, fps)
        const contact = project(camera, truth.positionAt(0))
        const radiusAtContact = BALL_RADIUS_M * contact.unitsPerM
        // Detector-like candidates: 0.3 radius noise (at least 0.5 px), 5% misses, clutter.
        const frames = candidatesFromTruth(
          truth.times,
          (t) => {
            const p = project(camera, truth.positionAt(t))
            return { x: p.x, y: p.y, radiusNorm: BALL_RADIUS_M * p.unitsPerM }
          },
          camera.aspect,
          { sigmaNorm: Math.max(0.3 * radiusAtContact * 0.4, 0.5 / FRAME_HEIGHT_PX), missRate: 0.05, falsePerFrame: 0.5 },
          rng,
        )
        const tracked = trackBall(frames, { aspect: camera.aspect, expectedRadiusNorm: radiusAtContact, contactTReal: 0, contactPoint: { x: contact.x, y: contact.y } })
        const outgoing = tracked.outgoing?.track
        const bounce = outgoing ? detectBounce(outgoing) : null
        if (!outgoing || !bounce || bounce.status !== 'experimental') {
          refused++
          continue
        }
        afterBounce.push(outgoing.observations.filter((o) => o.source === 'detected' && o.tReal > truth.bounceTime).length)
        timeErr.push(bounce.tReal - truth.bounceTime)
      }
      console.info(
        `[ball-accuracy] bounce from raw candidates, rear view ${fps} fps (${trials - refused}/${trials} found): time error median ${(median(timeErr.map(Math.abs)) * 1000).toFixed(1)} ms ` +
          `p90 ${(percentile(timeErr.map(Math.abs), 90) * 1000).toFixed(1)} ms; detections after the bounce median ${median(afterBounce)}`,
      )
      expect(refused).toBeLessThanOrEqual(2)
      expect(median(afterBounce)).toBeGreaterThanOrEqual(3)
      expect(median(timeErr.map(Math.abs))).toBeLessThan(Math.max(0.008, 0.5 / fps))
    })
  }
})
