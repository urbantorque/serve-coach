import { describe, expect, it } from 'vitest'
import type { BallTrack } from '../types.ts'
import { scaleFromBodyHeight } from './scale.ts'
import { estimateServeSpeedFromTrack, speedFromFlightTime, SPEED_OF_SOUND_MPS, type TrackSpeedEstimate } from './speed.ts'
import { makeOutgoingScenario, type OutgoingScenario } from './testing/scenarios.ts'
import { integrateFlight, project, type Vec3 } from './testing/synthTrajectories.ts'
import { trackBall } from './tracker.ts'

function outgoingTrack(s: OutgoingScenario): BallTrack | null {
  const contact = project(s.camera, s.contactPoint)
  const result = trackBall(s.frames, {
    aspect: s.aspect,
    expectedRadiusNorm: s.radiusNorm,
    contactTReal: s.contactTime,
    contactPoint: { x: contact.x, y: contact.y },
  })
  return result.outgoing?.track ?? null
}

const scaleOf = (s: OutgoingScenario) => scaleFromBodyHeight(1.8 * s.unitsPerM, 0.03, 1.8)

describe('estimateServeSpeedFromTrack (EXPERIMENTAL)', () => {
  it('brackets the true launch speed on simulated side-view serves', { timeout: 60_000 }, () => {
    const lines: string[] = []
    let total = 0
    let covered = 0
    for (const fps of [120, 240]) {
      for (const speedMps of [25, 40, 55]) {
        for (const outOfPlaneDeg of [0, 10, 20]) {
          const relErr: number[] = []
          const widths: number[] = []
          let bracket = 0
          let refused = 0
          const trials = 8
          for (let seed = 1; seed <= trials; seed++) {
            const s = makeOutgoingScenario({ fps, seed: seed + 17 * speedMps + outOfPlaneDeg, speedMps, outOfPlaneDeg })
            const track = outgoingTrack(s)
            const est = track
              ? estimateServeSpeedFromTrack(track, { contactTReal: s.contactTime, captureFps: fps, aspect: s.aspect, scale: scaleOf(s), cameraView: 'side' })
              : null
            if (!est || est.status !== 'experimental') {
              refused++
              continue
            }
            total++
            if (est.lowMps <= speedMps && est.highMps >= speedMps) {
              bracket++
              covered++
            }
            relErr.push(est.valueMps / speedMps - 1)
            widths.push(est.highMps / est.lowMps)
          }
          const meanErr = relErr.reduce((a, b) => a + b, 0) / Math.max(1, relErr.length)
          const meanWidth = widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length)
          lines.push(
            `${fps} fps, ${speedMps} m/s, ${outOfPlaneDeg} deg out of plane: truth in range ${bracket}/${trials - refused}` +
              (refused ? ` (${refused} refused)` : '') +
              `, centre error mean ${(100 * meanErr).toFixed(1)}%, range high/low ${meanWidth.toFixed(2)}`,
          )
        }
      }
    }
    for (const line of lines) console.info(`[ball-accuracy] speed ${line}`)
    expect(covered / total).toBeGreaterThanOrEqual(0.95)
  })

  it('refuses below 120 fps, without scale, for rear views and with too few detections', () => {
    const s = makeOutgoingScenario({ fps: 240, seed: 1, speedMps: 40, outOfPlaneDeg: 5 })
    const track = outgoingTrack(s)!
    const base = { contactTReal: s.contactTime, captureFps: 240, aspect: s.aspect, scale: scaleOf(s), cameraView: 'side' as const }
    expect(estimateServeSpeedFromTrack(track, base).status).toBe('experimental')
    const at60 = estimateServeSpeedFromTrack(track, { ...base, captureFps: 60 })
    expect(at60).toMatchObject({ status: 'unavailable' })
    expect(at60.status === 'unavailable' && at60.reason).toMatch(/120 fps/)
    expect(estimateServeSpeedFromTrack(track, { ...base, scale: null }).status).toBe('unavailable')
    expect(estimateServeSpeedFromTrack(track, { ...base, cameraView: 'rear' }).status).toBe('unavailable')
    const sparse: BallTrack = { ...track, observations: track.observations.filter((o) => o.tReal > s.contactTime + 0.042) }
    const few = estimateServeSpeedFromTrack(sparse, base)
    expect(few.status).toBe('unavailable')
    expect(few.status === 'unavailable' && few.reason).toMatch(/clean ball detections/)
  })

  it('always returns a range, and an unknown view gets a wider one', () => {
    const s = makeOutgoingScenario({ fps: 240, seed: 3, speedMps: 45, outOfPlaneDeg: 10 })
    const track = outgoingTrack(s)!
    const side = estimateServeSpeedFromTrack(track, { contactTReal: s.contactTime, captureFps: 240, aspect: s.aspect, scale: scaleOf(s), cameraView: 'side' }) as TrackSpeedEstimate
    const unknown = estimateServeSpeedFromTrack(track, { contactTReal: s.contactTime, captureFps: 240, aspect: s.aspect, scale: scaleOf(s), cameraView: 'unknown' }) as TrackSpeedEstimate
    expect(side.lowMps).toBeLessThan(side.valueMps)
    expect(side.highMps).toBeGreaterThan(side.valueMps)
    expect(side.valueKmh).toBeCloseTo(side.valueMps * 3.6)
    expect(unknown.highMps / unknown.lowMps).toBeGreaterThan(side.highMps / side.lowMps)
    expect(side.status).toBe('experimental')
  })
})

describe('speedFromFlightTime (EXPERIMENTAL)', () => {
  /** Serve from 2.7 m, flown with drag until it lands ~16.5 m down the court; the phone is behind the server. */
  function simulate(speedMps: number, lateralM: number) {
    const contact: Vec3 = { x: 0.3, y: 2.7, z: 0.4 }
    const target = { x: lateralM, z: 16.5 }
    const horizontal = Math.hypot(target.x - contact.x, target.z - contact.z)
    const dir = { x: (target.x - contact.x) / horizontal, z: (target.z - contact.z) / horizontal }
    const land = (dipRad: number) => {
      const v0 = { x: speedMps * Math.cos(dipRad) * dir.x, y: -speedMps * Math.sin(dipRad), z: speedMps * Math.cos(dipRad) * dir.z }
      const flight = integrateFlight(contact, v0, 2, undefined, 5e-4)
      let prev = flight(0).p
      let path = 0
      for (let t = 0.0005; t < 2; t += 0.0005) {
        const p = flight(t).p
        path += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z)
        prev = p
        if (p.y <= 0) return { t, land: p, path }
      }
      return { t: 2, land: prev, path }
    }
    // Landing distance falls as the dip angle grows: bisect for the target.
    let lo = (-10 * Math.PI) / 180
    let hi = (20 * Math.PI) / 180
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (land(mid).land.z > target.z) lo = mid
      else hi = mid
    }
    return { contact, ...land((lo + hi) / 2) }
  }

  it('brackets average and launch speed from contact-to-bounce sound timing', () => {
    const camera: Vec3 = { x: 0.5, y: 1.2, z: -4 }
    const lines: string[] = []
    for (const speedMps of [25, 40, 55]) {
      const sim = simulate(speedMps, -2.5)
      const heardContact = 1 + Math.hypot(sim.contact.x - camera.x, sim.contact.y - camera.y, sim.contact.z - camera.z) / SPEED_OF_SOUND_MPS
      const heardBounce = 1 + sim.t + Math.hypot(sim.land.x - camera.x, sim.land.y - camera.y, sim.land.z - camera.z) / SPEED_OF_SOUND_MPS
      const est = speedFromFlightTime({ contactOnsetTReal: heardContact, bounceOnsetTReal: heardBounce })
      expect(est.status).toBe('experimental')
      if (est.status !== 'experimental') continue
      const avg = sim.path / sim.t
      expect(est.flightTimeS.low).toBeLessThanOrEqual(sim.t)
      expect(est.flightTimeS.high).toBeGreaterThanOrEqual(sim.t)
      expect(est.average.lowMps).toBeLessThanOrEqual(avg)
      expect(est.average.highMps).toBeGreaterThanOrEqual(avg)
      expect(est.launch.lowMps).toBeLessThanOrEqual(speedMps)
      expect(est.launch.highMps).toBeGreaterThanOrEqual(speedMps)
      lines.push(
        `${speedMps} m/s launch (flight ${sim.t.toFixed(3)} s, path ${sim.path.toFixed(1)} m): average ${est.average.lowMps.toFixed(1)}-${est.average.highMps.toFixed(1)} m/s (true ${avg.toFixed(1)}), ` +
          `launch ${est.launch.lowMps.toFixed(1)}-${est.launch.highMps.toFixed(1)} m/s (value ${est.launch.valueMps.toFixed(1)})`,
      )
    }
    for (const line of lines) console.info(`[ball-accuracy] flight-time speed ${line}`)
  })

  it('refuses implausible or missing timings', () => {
    expect(speedFromFlightTime({ contactOnsetTReal: 1, bounceOnsetTReal: 0.9 }).status).toBe('unavailable')
    expect(speedFromFlightTime({ contactOnsetTReal: 1, bounceOnsetTReal: 4 }).status).toBe('unavailable')
    expect(speedFromFlightTime({ contactOnsetTReal: Number.NaN, bounceOnsetTReal: 1.5 }).status).toBe('unavailable')
  })
})
