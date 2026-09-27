import { describe, expect, it } from 'vitest'
import type { BallTrack } from '../types.ts'
import { createRng, gaussian } from './random.ts'
import { scaleFromBodyHeight } from './scale.ts'
import {
  estimateServeSpeedFromTrack,
  roundSpeedRange,
  speedFromFlightTime,
  TARGET_TAG_OUT_OF_PLANE_DEG,
  type TargetTag,
  type TrackSpeedEstimate,
} from './speed.ts'
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

describe('estimateServeSpeedFromTrack (EXPERIMENTAL, side view, target tag)', () => {
  it('brackets the true launch speed on simulated side-view serves', { timeout: 60_000 }, () => {
    const lines: string[] = []
    let total = 0
    let covered = 0
    // Each true out-of-plane angle is tagged with a target whose band contains it.
    const cases: [number, TargetTag][] = [
      [0, 'T'],
      [10, 'T'],
      [10, 'body'],
      [20, 'wide'],
    ]
    for (const fps of [120, 240]) {
      for (const speedMps of [25, 40, 55]) {
        for (const [outOfPlaneDeg, targetTag] of cases) {
          const widths: number[] = []
          let bracket = 0
          let refused = 0
          const trials = 8
          for (let seed = 1; seed <= trials; seed++) {
            const s = makeOutgoingScenario({ fps, seed: seed + 17 * speedMps + outOfPlaneDeg, speedMps, outOfPlaneDeg })
            const track = outgoingTrack(s)
            const est = track
              ? estimateServeSpeedFromTrack(track, { contactTReal: s.contactTime, captureFps: fps, aspect: s.aspect, scale: scaleOf(s), cameraView: 'side', targetTag })
              : null
            if (!est || est.status !== 'experimental') {
              refused++
              continue
            }
            total++
            const trueKmh = speedMps * 3.6
            if (est.lowKmh <= trueKmh && est.highKmh >= trueKmh) {
              bracket++
              covered++
            }
            widths.push(est.highKmh / est.lowKmh)
          }
          const meanWidth = widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length)
          lines.push(
            `${fps} fps, ${speedMps} m/s, ${outOfPlaneDeg} deg out of plane, tag ${targetTag}: truth in range ${bracket}/${trials - refused}` +
              (refused ? ` (${refused} refused)` : '') +
              `, range high/low ${meanWidth.toFixed(2)}`,
          )
        }
      }
    }
    for (const line of lines) console.info(`[ball-accuracy] speed ${line}`)
    expect(covered / total).toBeGreaterThanOrEqual(0.95)
  })

  it('refuses unless side view, >= 120 fps, scale, target tag and >= 3 clean detections all hold', () => {
    const s = makeOutgoingScenario({ fps: 240, seed: 1, speedMps: 40, outOfPlaneDeg: 5 })
    const track = outgoingTrack(s)!
    const base = { contactTReal: s.contactTime, captureFps: 240, aspect: s.aspect, scale: scaleOf(s), cameraView: 'side' as const, targetTag: 'T' as const }
    expect(estimateServeSpeedFromTrack(track, base).status).toBe('experimental')
    const at60 = estimateServeSpeedFromTrack(track, { ...base, captureFps: 60 })
    expect(at60.status === 'unavailable' && at60.reason).toMatch(/120 fps/)
    expect(estimateServeSpeedFromTrack(track, { ...base, scale: null }).status).toBe('unavailable')
    for (const cameraView of ['rear', 'front45', 'unknown', undefined] as const) {
      expect(estimateServeSpeedFromTrack(track, { ...base, cameraView }).status).toBe('unavailable')
    }
    const untagged = estimateServeSpeedFromTrack(track, { ...base, targetTag: null })
    expect(untagged.status === 'unavailable' && untagged.reason).toMatch(/target tag/)
    expect(untagged.status === 'unavailable' && untagged.unlockHint).toMatch(/T, body or wide/)
    const sparse: BallTrack = { ...track, observations: track.observations.filter((o) => o.tReal > s.contactTime + 0.042) }
    const few = estimateServeSpeedFromTrack(sparse, base)
    expect(few.status === 'unavailable' && few.reason).toMatch(/clean ball detections/)
  })

  it('returns a rounded range only, and a wider tag band gives a wider range', () => {
    const s = makeOutgoingScenario({ fps: 240, seed: 3, speedMps: 45, outOfPlaneDeg: 8 })
    const track = outgoingTrack(s)!
    const run = (targetTag: TargetTag) =>
      estimateServeSpeedFromTrack(track, { contactTReal: s.contactTime, captureFps: 240, aspect: s.aspect, scale: scaleOf(s), cameraView: 'side', targetTag }) as TrackSpeedEstimate
    const t = run('T')
    const wide = run('wide')
    expect(t.status).toBe('experimental')
    expect(t.quantity).toBe('launch')
    expect(t.lowKmh % 5).toBe(0)
    expect(t.highKmh % 5).toBe(0)
    expect(t.highKmh).toBeGreaterThan(t.lowKmh)
    expect(Object.keys(t).some((k) => /value|centre|mps/i.test(k))).toBe(false)
    expect(t.outOfPlaneDeg).toEqual(TARGET_TAG_OUT_OF_PLANE_DEG.T)
    expect(wide.highKmh - wide.lowKmh).toBeGreaterThanOrEqual(t.highKmh - t.lowKmh)
  })

  it('roundSpeedRange rounds outward to 5 km/h', () => {
    expect(roundSpeedRange(40 / 3.6, 51 / 3.6)).toEqual({ lowKmh: 40, highKmh: 55 })
    expect(roundSpeedRange(44.9 / 3.6, 50 / 3.6)).toEqual({ lowKmh: 40, highKmh: 50 })
  })
})

describe('speedFromFlightTime (EXPERIMENTAL, rear view, bounce located in video)', () => {
  /** Serve from 2.7 m high, 0.4 m inside the baseline, flown with drag to a landing 16.5 m down the court. */
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

  it('brackets the average speed when the bounce is located in the rear view', () => {
    const rng = createRng(5)
    const lines: string[] = []
    for (const speedMps of [25, 40, 55]) {
      for (let trial = 0; trial < 10; trial++) {
        const sim = simulate(speedMps, -2.5)
        const contactT = 1 + 0.002 * gaussian(rng)
        // Court frame: x + to the server's right (the synthetic x), y along the court (the synthetic z).
        const est = speedFromFlightTime({
          cameraView: 'rear',
          contactTReal: contactT,
          contactSigmaS: 0.003,
          servedFrom: 'deuce',
          bounce: {
            tReal: 1 + sim.t + 0.003 * gaussian(rng),
            uncertaintyS: 0.004,
            court: { x: sim.land.x + 0.1 * gaussian(rng), y: sim.land.z + 0.2 * gaussian(rng) },
            sigmaXM: 0.15,
            sigmaYM: 0.3,
          },
        })
        expect(est.status).toBe('experimental')
        if (est.status !== 'experimental') continue
        const avgKmh = (sim.path / sim.t) * 3.6
        expect(est.quantity).toBe('average')
        expect(est.lowKmh).toBeLessThanOrEqual(avgKmh)
        expect(est.highKmh).toBeGreaterThanOrEqual(avgKmh)
        expect(est.highKmh / est.lowKmh).toBeLessThan(1.35)
        if (trial === 0) lines.push(`${speedMps} m/s launch: average ${avgKmh.toFixed(0)} km/h, range ${est.lowKmh}-${est.highKmh} km/h`)
      }
    }
    for (const line of lines) console.info(`[ball-accuracy] rear average speed ${line}`)
  })

  it('never uses flight time from the side view, and needs a located bounce', () => {
    const bounce = { tReal: 1.5, uncertaintyS: 0.004, court: { x: -2, y: 16 }, sigmaXM: 0.2, sigmaYM: 0.3 }
    const side = speedFromFlightTime({ cameraView: 'side', contactTReal: 1, bounce })
    expect(side.status === 'unavailable' && side.reason).toMatch(/bounce not in view/)
    for (const cameraView of ['front45', 'unknown', undefined] as const) {
      expect(speedFromFlightTime({ cameraView, contactTReal: 1, bounce }).status).toBe('unavailable')
    }
    const noBounce = speedFromFlightTime({ cameraView: 'rear', contactTReal: 1, bounce: null })
    expect(noBounce.status === 'unavailable' && noBounce.reason).toMatch(/not located/)
    expect(speedFromFlightTime({ cameraView: 'rear', contactTReal: 1, bounce: { ...bounce, tReal: 0.9 } }).status).toBe('unavailable')
    expect(speedFromFlightTime({ cameraView: 'rear', contactTReal: 1, bounce: { ...bounce, tReal: 4 } }).status).toBe('unavailable')
    expect(speedFromFlightTime({ cameraView: 'rear', contactTReal: Number.NaN, bounce }).status).toBe('unavailable')
    expect(speedFromFlightTime({ cameraView: 'rear', contactTReal: 1, bounce: { ...bounce, court: { x: 0, y: 6 } } }).status).toBe('unavailable')
    const ok = speedFromFlightTime({ cameraView: 'rear', contactTReal: 1, bounce })
    expect(ok.status).toBe('experimental')
  })
})
