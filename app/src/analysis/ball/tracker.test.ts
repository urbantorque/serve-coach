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

describe('trackBall: physical plausibility of the toss', () => {
  /**
   * Side view, 60 fps. The ball is held still, then lowered in the hand (accelerating down at
   * 0.45 g for 0.6 s: 36 detections that fit the falling half of a parabola), raised again and
   * tossed so high that only 20 rising and 4 falling frames are in view (as in apexout).
   */
  function handLowerThenTossFrames(seed: number) {
    const radius = 0.01
    const g = 9.81 * (radius / BALL_RADIUS_M)
    const lowered = 0.55 + 0.5 * 0.45 * g * 0.36
    const release = 1.8
    const v = Math.sqrt(2 * g * 0.8)
    const path = (t: number) => {
      if (t < 0.9) return { x: 0.5, y: 0.55 }
      if (t < 1.5) return { x: 0.5, y: 0.55 + 0.5 * 0.45 * g * (t - 0.9) ** 2 }
      if (t < release) {
        // Hand drive: quadratic from the low point to the release point, reaching the ball's
        // launch velocity at release (the ball leaves the hand smoothly).
        const T = release - 1.5
        const c = (-v * T - (0.5 - lowered)) / (T * T)
        const b = -v - 2 * c * T
        const tau = t - 1.5
        return { x: 0.5, y: lowered + b * tau + c * tau * tau }
      }
      const tau = t - release
      return { x: 0.5 + 0.02 * tau, y: 0.5 - v * tau + 0.5 * g * tau * tau }
    }
    const rng = createRng(seed)
    const frames = candidatesFromTruth(
      frameTimes(60, 0, release + 1.2),
      (t) => ({ ...path(t), radiusNorm: radius }),
      9 / 16,
      { sigmaNorm: 0.3 * radius, missRate: 0.05, falsePerFrame: 0.3 },
      rng,
    )
    return { frames, radius, g, release }
  }

  it('rejects the ball lowered in the hand and finds the toss (rise check, gravity band)', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { frames, radius, g, release } = handLowerThenTossFrames(seed)
      for (const bands of [undefined, [[0.6 * g, 1.5 * g]] as [number, number][]]) {
        const result = trackBall(frames, { aspect: 9 / 16, expectedRadiusNorm: radius, accelerationBandsNorm: bands })
        expect(result.toss?.track.kind).toBe('toss')
        const first = result.toss!.track.observations.find((o) => o.source === 'detected')!
        expect(first.tReal).toBeGreaterThan(release - 0.35)
        // Nothing from the held or lowering phase (before the drive starts at 1.5 s).
        expect(result.toss!.track.observations.every((o) => o.tReal >= 1.45)).toBe(true)
      }
    }
  })
})

describe('trackBall: side-view outgoing limits', () => {
  it('rejects a steep, slow limb seam through the contact point; keeps the fast, level ball', () => {
    const fps = 60
    const aspect = 9 / 16
    const s = makeTossScenario({ fps, seed: 31, aspect, noiseRadii: 0.3 })
    const before = s.frames.filter((f) => f.tReal <= s.params.contactTime)
    const contact = project(s.camera, s.truth.positionAt(s.params.contactTime))
    const g = 9.81 * s.unitsPerM
    const times = frameTimes(fps, s.params.contactTime + 0.004, s.params.contactTime + 0.12, 0)
    const at = (t: number, vx: number, vy: number) => ({ x: contact.x + (vx * (t - s.params.contactTime)) / aspect, y: contact.y + vy * (t - s.params.contactTime) })
    // Seam: 2.2 frame heights/s (about 15 m/s here) at 67 deg below horizontal. Ball: 38 m/s, 4 deg down.
    const seamV = { vx: 0.86, vy: 2.03 }
    const ballV = { vx: 38 * s.unitsPerM, vy: 38 * s.unitsPerM * Math.tan((4 * Math.PI) / 180) }
    const frame = (i: number, t: number, withBall: boolean) => ({
      frameIndex: 50000 + i,
      tReal: t,
      candidates: [
        { ...at(t, seamV.vx, seamV.vy), radiusNorm: s.radiusNorm, score: 0.7 },
        ...(withBall && i < 2 ? [{ ...at(t, ballV.vx, ballV.vy), radiusNorm: s.radiusNorm, score: 0.7 }] : []),
      ],
    })
    const limits = { outgoingMaxElevationDeg: 30, minOutgoingSpeedNormPerS: 17 * s.unitsPerM }
    const base = { aspect, expectedRadiusNorm: s.radiusNorm, contactTReal: s.params.contactTime, accelerationBandsNorm: [[0.6 * g, 1.5 * g]] as [number, number][] }
    const seamOnly = [...before, ...times.map((t, i) => frame(i, t, false))]
    expect(trackBall(seamOnly, base).outgoing).not.toBeNull()
    expect(trackBall(seamOnly, { ...base, ...limits }).outgoing).toBeNull()
    const withBall = [...before, ...times.map((t, i) => frame(i, t, true))]
    const kept = trackBall(withBall, { ...base, ...limits }).outgoing
    expect(kept).not.toBeNull()
    expect(Math.abs(kept!.initialVelocity.vy / kept!.initialVelocity.vx)).toBeLessThan(0.2)
  })
})
