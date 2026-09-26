import { describe, expect, it } from 'vitest'
import { createRng } from './random.ts'
import { BALL_RADIUS_M } from './scale.ts'
import { makeTossScenario } from './testing/scenarios.ts'
import { candidatesFromTruth, frameTimes, integrateFlight, project } from './testing/synthTrajectories.ts'
import { trackBall, type FrameCandidates } from './tracker.ts'

describe('trackBall: toss', () => {
  for (const fps of [30, 60, 120, 240]) {
    it(`links the toss at ${fps} fps despite noise, misses and false candidates`, { timeout: 60_000 }, () => {
      const trials = 20
      let found = 0
      let trackPoints = 0
      let truePoints = 0
      let freeFlightFrames = 0
      let coveredFrames = 0
      for (let seed = 1; seed <= trials; seed++) {
        const s = makeTossScenario({ fps, seed, noiseRadii: 0.3, missRate: 0.1, falsePerFrame: 1 })
        const result = trackBall(s.frames, { aspect: s.aspect, expectedRadiusNorm: s.radiusNorm })
        if (!result.toss || result.toss.track.kind !== 'toss') continue
        found++
        const detected = result.toss.track.observations.filter((o) => o.source === 'detected')
        for (const o of detected) {
          const p = project(s.camera, s.truth.positionAt(o.tReal))
          trackPoints++
          if (Math.hypot((o.x - p.x) * s.aspect, o.y - p.y) < 1.5 * s.radiusNorm) truePoints++
        }
        // Free-flight frames where a true candidate existed (the tracker cannot do better).
        for (const frame of s.frames) {
          if (frame.tReal < s.params.releaseTime || frame.tReal > s.params.contactTime) continue
          const p = project(s.camera, s.truth.positionAt(frame.tReal))
          const hasTrue = frame.candidates.some((c) => Math.hypot((c.x - p.x) * s.aspect, c.y - p.y) < 1.5 * s.radiusNorm)
          if (!hasTrue) continue
          freeFlightFrames++
          if (detected.some((o) => o.frameIndex === frame.frameIndex)) coveredFrames++
        }
      }
      const precision = truePoints / trackPoints
      const coverage = coveredFrames / freeFlightFrames
      console.info(
        `[ball-accuracy] tracker toss ${fps} fps (noise 0.3 r, 10% misses, ~1 false/frame + static distractor, ${trials} clips): ` +
          `found ${found}/${trials}, track precision ${precision.toFixed(3)}, free-flight coverage ${coverage.toFixed(3)}`,
      )
      expect(found).toBeGreaterThanOrEqual(trials - 1)
      expect(precision).toBeGreaterThan(0.97)
      expect(coverage).toBeGreaterThan(0.9)
    })
  }

  it('fills short gaps with predicted observations', () => {
    const s = makeTossScenario({ fps: 60, seed: 7, noiseRadii: 0.2, missRate: 0, falsePerFrame: 0 })
    // Blank three consecutive frames just after the apex.
    const apexIndex = s.frames.findIndex((f) => f.tReal >= s.truth.apexTime)
    const blanked = new Set([apexIndex, apexIndex + 1, apexIndex + 2].map((i) => s.frames[i].frameIndex))
    const frames: FrameCandidates[] = s.frames.map((f) => (blanked.has(f.frameIndex) ? { ...f, candidates: [] } : f))
    const toss = trackBall(frames, { aspect: s.aspect, expectedRadiusNorm: s.radiusNorm }).toss!
    const predicted = toss.track.observations.filter((o) => o.source === 'predicted')
    expect(predicted.map((o) => o.frameIndex).sort()).toEqual([...blanked].sort())
    for (const o of predicted) {
      const p = project(s.camera, s.truth.positionAt(o.tReal))
      expect(Math.hypot((o.x - p.x) * s.aspect, o.y - p.y)).toBeLessThan(0.5 * s.radiusNorm)
      expect(o.score).toBe(0)
    }
  })

  it('returns no toss for static clutter only', () => {
    const rng = createRng(5)
    const frames: FrameCandidates[] = Array.from({ length: 90 }, (_, i) => ({
      frameIndex: i,
      tReal: i / 30,
      candidates: [
        { x: 0.8, y: 0.9, radiusNorm: 0.008, score: 0.5 },
        { x: 0.2 + 0.001 * rng(), y: 0.5, radiusNorm: 0.008, score: 0.4 },
      ],
    }))
    const result = trackBall(frames, { aspect: 9 / 16, expectedRadiusNorm: 0.008 })
    expect(result.toss).toBeNull()
    expect(result.tracks).toHaveLength(0)
  })

  it('respects a contact time: toss candidates after it are ignored', () => {
    const s = makeTossScenario({ fps: 60, seed: 3, noiseRadii: 0.2, missRate: 0, falsePerFrame: 0 })
    const contact = s.truth.apexTime + 0.1
    const toss = trackBall(s.frames, { aspect: s.aspect, expectedRadiusNorm: s.radiusNorm, contactTReal: contact }).toss!
    expect(Math.max(...toss.track.observations.map((o) => o.tReal))).toBeLessThanOrEqual(contact)
  })
})

describe('trackBall: outgoing ball', () => {
  it('follows the ball after contact and reports its initial image velocity', () => {
    const fps = 240
    const aspect = 16 / 9
    const s = makeTossScenario({ fps, seed: 11, aspect, noiseRadii: 0.3, missRate: 0.05, falsePerFrame: 0.5 })
    const contactPos = s.truth.positionAt(s.params.contactTime)
    const v0 = { x: 38, y: -4, z: -5 }
    const flight = integrateFlight(contactPos, v0, 0.5)
    const rng = createRng(99)
    const times = frameTimes(fps, s.params.contactTime + 0.0001, s.params.contactTime + 0.25, rng())
    const outgoingFrames = candidatesFromTruth(
      times,
      (t) => {
        const p = project(s.camera, flight(t - s.params.contactTime).p)
        return { x: p.x, y: p.y, radiusNorm: BALL_RADIUS_M * p.unitsPerM }
      },
      aspect,
      { sigmaNorm: 0.3 * s.radiusNorm, missRate: 0.05, falsePerFrame: 0.5 },
      rng,
    ).map((f, i) => ({ ...f, frameIndex: 10000 + i }))
    // Replace the scenario's post-contact frames with the outgoing-ball frames.
    const frames = [...s.frames.filter((f) => f.tReal <= s.params.contactTime), ...outgoingFrames]
    const result = trackBall(frames, { aspect, expectedRadiusNorm: s.radiusNorm })
    expect(result.toss?.track.kind).toBe('toss')
    const outgoing = result.outgoing!
    expect(outgoing).not.toBeNull()
    expect(outgoing.track.kind).toBe('outgoing')
    const detected = outgoing.track.observations.filter((o) => o.source === 'detected')
    expect(detected.length).toBeGreaterThanOrEqual(10)
    for (const o of detected) {
      const p = project(s.camera, flight(o.tReal - s.params.contactTime).p)
      expect(Math.hypot((o.x - p.x) * aspect, o.y - p.y)).toBeLessThan(1.5 * s.radiusNorm)
    }
    // Initial image velocity vs truth (frame heights per second, x includes aspect).
    const dt = 0.01
    const a = project(s.camera, flight(0.005).p)
    const b = project(s.camera, flight(0.005 + dt).p)
    const vTrue = { vx: ((b.x - a.x) * aspect) / dt, vy: (b.y - a.y) / dt }
    const speedErr = Math.hypot(outgoing.initialVelocity.vx, outgoing.initialVelocity.vy) / Math.hypot(vTrue.vx, vTrue.vy) - 1
    console.info(`[ball-accuracy] tracker outgoing 240 fps: ${detected.length} detections linked, initial image speed error ${(100 * speedErr).toFixed(1)}%`)
    expect(Math.abs(speedErr)).toBeLessThan(0.1)
    expect(Math.abs(outgoing.contactTReal - s.params.contactTime)).toBeLessThan(2 / fps)
    // Contact measured where the outgoing path meets the toss parabola.
    const measured = outgoing.contactFromTracks!
    const contactErr = measured.tReal - s.params.contactTime
    console.info(`[ball-accuracy] tracker contact from ball paths 240 fps: error ${(contactErr * 1000).toFixed(2)} ms (sigma ${(measured.uncertaintyS * 1000).toFixed(2)} ms)`)
    expect(Math.abs(contactErr)).toBeLessThan(0.003)
    expect(Math.abs(contactErr)).toBeLessThan(3 * measured.uncertaintyS)
    // A contact time supplied 15 ms early (e.g. over-corrected sound delay) still finds the ball.
    const early = trackBall(frames, { aspect, expectedRadiusNorm: s.radiusNorm, contactTReal: s.params.contactTime - 0.015 })
    expect(early.outgoing?.track.observations.filter((o) => o.source === 'detected').length).toBeGreaterThanOrEqual(10)
    expect(Math.abs(early.outgoing!.contactFromTracks!.tReal - s.params.contactTime)).toBeLessThan(0.003)
  })
})
