/**
 * Ball-layer entry points end to end on synthetic candidates and poses: setup from pose,
 * analyseBall (toss events, time-base suggestion, speed, metrics) and the slow-motion
 * correction round trip.
 */
import { describe, expect, it } from 'vitest'
import type { AudioOnset } from '../types.ts'
import { analyseBall, apexPerspectiveSigmaS, ballSetupFromPoses, createBallFrameDetector, soundDelayEstimateS, suggestTimeBase, tossHeightMetric } from './analyse.ts'
import { createRng } from './random.ts'
import { BALL_RADIUS_M } from './scale.ts'
import { SPEED_OF_SOUND_MPS } from './speed.ts'
import { makeTossScenario } from './testing/scenarios.ts'
import { standingPoseFrames } from './testing/synthPoses.ts'
import { ballAt, createScene, LIGHTING } from './testing/synthFrames.ts'
import { candidatesFromTruth, frameTimes, integrateFlight, project, type Vec3 } from './testing/synthTrajectories.ts'

function setupFor(s: ReturnType<typeof makeTossScenario>, timestampOf?: (t: number) => number) {
  const poseTimes = frameTimes(30, s.params.releaseTime - 1.5, s.params.releaseTime - 0.5)
  const poses = standingPoseFrames(s.camera, s.statureM, poseTimes, createRng(7), { timestampOf })
  return ballSetupFromPoses(poses, { aspect: s.aspect, handedness: 'right', playerHeightM: s.statureM })
}

describe('ballSetupFromPoses', () => {
  it('recovers the scale, expected ball radius and a toss band that contains the toss', () => {
    const s = makeTossScenario({ fps: 60, seed: 3 })
    const setup = setupFor(s)
    expect(setup.scale!.unitsPerM / s.unitsPerM - 1).toBeCloseTo(0, 1)
    expect(Math.abs(setup.expectedRadiusNorm! / (BALL_RADIUS_M * s.unitsPerM) - 1)).toBeLessThan(0.05)
    const apex = project(s.camera, s.truth.apexPos)
    const release = project(s.camera, s.truth.positionAt(s.params.releaseTime))
    const roi = setup.tossRoi!
    for (const p of [apex, release]) {
      expect(p.x).toBeGreaterThan(roi.x0)
      expect(p.x).toBeLessThan(roi.x1)
      expect(p.y).toBeLessThan(roi.y1)
    }
    expect(setup.notes).toHaveLength(0)
  })

  it('reports no scale when the feet are never visible', () => {
    const s = makeTossScenario({ fps: 60, seed: 3 })
    const poses = standingPoseFrames(s.camera, s.statureM, frameTimes(30, 0, 1), createRng(1)).map((p) => ({
      ...p,
      landmarks: p.landmarks!.map((lm, i) => (i >= 27 ? { ...lm, visibility: 0.05 } : lm)),
    }))
    const setup = ballSetupFromPoses(poses, { aspect: s.aspect })
    expect(setup.scale).toBeNull()
    expect(setup.expectedRadiusNorm).toBeUndefined()
    expect(setup.notes.join(' ')).toMatch(/stature unavailable/)
  })
})

describe('analyseBall', () => {
  it('real-time 60 fps side view: toss events, consistent time base, toss heights; speed refused below 120 fps', () => {
    const apexErr: number[] = []
    for (let seed = 1; seed <= 5; seed++) {
      const s = makeTossScenario({ fps: 60, seed: 40 + seed })
      const setup = setupFor(s)
      const a = analyseBall(s.frames, { setup, captureFps: 60, timeBaseKnown: true, cameraView: 'side', contactTReal: s.params.contactTime })
      expect(a.toss?.status).toBe('ok')
      apexErr.push(a.events.tossApex!.tReal - s.truth.apexTime)
      expect(a.events.tossRelease!.method).toMatch(/^ball-/)
      expect(a.timeBase.status).toBe('consistent')
      const height = a.metrics.find((m) => m.id === 'toss-apex-height')!
      expect(height.status).toBe('estimated')
      expect(height.uncertainty!.low).toBeLessThanOrEqual(s.truth.apexPos.y)
      expect(height.uncertainty!.high).toBeGreaterThanOrEqual(s.truth.apexPos.y)
      const aboveHead = tossHeightMetric('above-head-check', 'above the head', a.toss, setup, 'head')
      expect(aboveHead.uncertainty!.low).toBeLessThanOrEqual(s.truth.apexPos.y - s.statureM)
      expect(aboveHead.uncertainty!.high).toBeGreaterThanOrEqual(s.truth.apexPos.y - s.statureM)
      const speed = a.metrics.find((m) => m.id === 'speed-experimental')!
      expect(speed.status).toBe('unavailable')
      expect(speed.value).toBeNull()
      expect(speed.unavailableReason).toBeTruthy()
      expect(speed.unlockHint).toBeTruthy()
    }
    console.info(`[ball-accuracy] analyseBall 60 fps (5 clips, pose-derived scale): apex errors [${apexErr.map((e) => (e * 1000).toFixed(2)).join(', ')}] ms`)
    for (const e of apexErr) expect(Math.abs(e)).toBeLessThan(0.004)
  })

  it('un-corrected 8x slow motion: suggests timeScale 0.125, refuses speed, and agrees after the correction', () => {
    const slowFactor = 8
    const s = makeTossScenario({ fps: 240, seed: 77, timeScale: 1 / slowFactor })
    const media = (t: number) => t * slowFactor
    const setup = setupFor(s, media)
    const before = analyseBall(s.frames, { setup, captureFps: 30, timeBaseKnown: false, cameraView: 'side', targetTag: 'T' })
    expect(before.timeBase).toMatchObject({ status: 'apply-correction', timeScale: 0.125 })
    expect(before.speedFromTrack.status).toBe('unavailable')
    expect(before.speedFromTrack.status === 'unavailable' && before.speedFromTrack.reason).toMatch(/8x slow motion/)
    // Apply the suggested correction (as the video layer's applyTimeScale would) and re-run.
    const corrected = s.frames.map((f) => ({ ...f, tReal: f.tReal * before.timeBase.timeScale! }))
    const after = analyseBall(corrected, { setup, captureFps: 30 * before.timeBase.captureFpsFactor!, timeBaseKnown: true })
    expect(after.timeBase.status).toBe('consistent')
    const apexErr = after.events.tossApex!.tReal - s.truth.apexTime
    console.info(`[ball-accuracy] analyseBall 240 fps seen as 30 fps: suggestion ${before.timeBase.timeScale}, apex error after correction ${(apexErr * 1000).toFixed(2)} ms`)
    expect(Math.abs(apexErr)).toBeLessThan(0.002)
  })

  it('240 fps side view with sound: contact from audio, track speed range covers the truth, no flight-time speed from the side', () => {
    const fps = 240
    const aspect = 16 / 9
    const s = makeTossScenario({ fps, seed: 11, aspect, noiseRadii: 0.3, missRate: 0.05, falsePerFrame: 0.5 })
    const contact = s.truth.positionAt(s.params.contactTime)
    const v0: Vec3 = { x: 38, y: -4, z: -5 }
    const flight = integrateFlight(contact, v0, 1)
    const rng = createRng(21)
    const times = frameTimes(fps, s.params.contactTime + 1e-4, s.params.contactTime + 0.25, rng())
    const outgoing = candidatesFromTruth(
      times,
      (t) => {
        const p = project(s.camera, flight(t - s.params.contactTime).p)
        return { x: p.x, y: p.y, radiusNorm: BALL_RADIUS_M * p.unitsPerM }
      },
      aspect,
      { sigmaNorm: 0.3 * s.radiusNorm, missRate: 0.05, falsePerFrame: 0.5 },
      rng,
    ).map((f, i) => ({ ...f, frameIndex: 20000 + i }))
    const frames = [...s.frames.filter((f) => f.tReal <= s.params.contactTime), ...outgoing]
    // Landing: first time the centre reaches ball-radius height (the bounce sound is heard).
    let landT = 0
    for (let t = 0.0005; t < 1; t += 0.0005) {
      if (flight(t).p.y <= BALL_RADIUS_M) {
        landT = t
        break
      }
    }
    const land = flight(landT).p
    const cameraPos = s.camera.position
    const heard = (t: number, p: Vec3) => t + Math.hypot(p.x - cameraPos.x, p.y - cameraPos.y, p.z - cameraPos.z) / SPEED_OF_SOUND_MPS
    // Labels as the video layer's heuristic gave them on the rendered corpus: the racket pop
    // 'unknown', a quieter landing footstep 'contact'. The loudest transient must still win.
    const onsets: AudioOnset[] = [
      { tReal: heard(s.params.contactTime, contact), strength: 30, sharpness: 0.42, kind: 'unknown' },
      { tReal: heard(s.params.contactTime, contact) + 0.14, strength: 11, sharpness: 1, kind: 'contact' },
      { tReal: heard(s.params.contactTime + landT, land), strength: 18, sharpness: 0.6, kind: 'bounce' },
    ]
    const setup = setupFor(s)
    const a = analyseBall(frames, { setup, captureFps: fps, timeBaseKnown: true, cameraView: 'side', onsets, targetTag: 'T' })
    expect(a.tracker.outgoing).not.toBeNull()
    expect(a.events.contact?.method).toBe('ball-track-intersection')
    expect(Math.abs(a.events.contact!.tReal - s.params.contactTime)).toBeLessThan(0.003)
    expect(Math.abs(a.tracker.outgoing!.contactTReal - s.params.contactTime)).toBeLessThan(0.02)
    const trueSpeedKmh = Math.hypot(v0.x, v0.y, v0.z) * 3.6
    const trackSpeed = a.metrics.find((m) => m.id === 'speed-experimental')!
    expect(trackSpeed.status).toBe('experimental')
    expect(trackSpeed.uncertainty!.low).toBeLessThanOrEqual(trueSpeedKmh)
    expect(trackSpeed.uncertainty!.high).toBeGreaterThanOrEqual(trueSpeedKmh)
    expect(trackSpeed.value).toBe(`${trackSpeed.uncertainty!.low}–${trackSpeed.uncertainty!.high}`)
    // D4: the bounce sound is heard, but the side view never uses flight time.
    const audioSpeed = a.metrics.find((m) => m.id === 'speed-average-rear')!
    expect(audioSpeed.status).toBe('unavailable')
    expect(audioSpeed.unavailableReason).toMatch(/bounce not in view/)
    expect(a.averageSpeedRear.status).toBe('unavailable')
    // Without the target tag the side-view range is refused.
    const untagged = analyseBall(frames, { setup, captureFps: fps, timeBaseKnown: true, cameraView: 'side', onsets })
    expect(untagged.speedFromTrack.status).toBe('unavailable')
    console.info(
      `[ball-accuracy] analyseBall 240 fps with sound: launch ${trueSpeedKmh.toFixed(0)} km/h, track range ${trackSpeed.uncertainty!.low.toFixed(0)}-${trackSpeed.uncertainty!.high.toFixed(0)} km/h; ` +
                `contact seed from audio ${((a.tracker.outgoing!.contactTReal - s.params.contactTime) * 1000).toFixed(1)} ms vs truth, measured contact ${((a.events.contact!.tReal - s.params.contactTime) * 1000).toFixed(2)} ms`,
    )
  })

  it('uses gravity to pin a one-sided toss apex only when the time base is known', { timeout: 60_000 }, () => {
    let oneSided = 0
    for (let seed = 1; seed <= 20 && oneSided < 3; seed++) {
      const s = makeTossScenario({ fps: 60, seed: 5000 + seed, statureFraction: 0.6, contactAfterApexS: [0.25, 0.35] })
      const setup = setupFor(s)
      const known = analyseBall(s.frames, { setup, captureFps: 60, timeBaseKnown: true })
      if (known.toss?.status !== 'ok' || known.toss.apex!.bracketed) continue
      oneSided++
      expect(known.events.tossApex!.method).toBe('ball-apex-fit+gravity-prior')
      const err = known.events.tossApex!.tReal - s.truth.apexTime
      expect(Math.abs(err)).toBeLessThan(3 * known.events.tossApex!.uncertaintyS)
      const unknown = analyseBall(s.frames, { setup, captureFps: 60, timeBaseKnown: false })
      expect(unknown.events.tossApex?.method ?? 'ball-apex-fit').toBe('ball-apex-fit')
    }
    expect(oneSided).toBeGreaterThanOrEqual(1)
  })

  it('without sound or a toss every metric is unavailable with a reason', () => {
    const a = analyseBall([], { setup: { aspect: 9 / 16, scale: null, body: null }, captureFps: 30, timeBaseKnown: true })
    expect(a.toss).toBeNull()
    expect(a.timeBase.status).toBe('inconclusive')
    for (const m of a.metrics) {
      expect(m.status).toBe('unavailable')
      expect(m.value).toBeNull()
      expect(m.unavailableReason).toBeTruthy()
    }
  })
})

describe('helpers', () => {
  it('suggestTimeBase maps the gravity check to an action', () => {
    expect(suggestTimeBase({ status: 'unavailable', reason: 'x' }).status).toBe('inconclusive')
    const base = { status: 'ok' as const, timeScaleFactor: 0.5, low: 0.47, high: 0.53, plausible: false }
    expect(suggestTimeBase({ ...base, nearestStandard: { factor: 0.5, label: '2x', consistent: true } })).toMatchObject({ status: 'apply-correction', timeScale: 0.5, captureFpsFactor: 2 })
    expect(suggestTimeBase({ ...base, timeScaleFactor: 0.7, nearestStandard: { factor: 0.5, label: '2x', consistent: false } }).status).toBe('inconclusive')
  })

  it('apex perspective term applies to rear and front views only', () => {
    const scale = { unitsPerM: 0.15, relSigma: 0.03, basis: '' }
    expect(apexPerspectiveSigmaS(0.2, scale, 9 / 16, 'side')).toBe(0)
    expect(apexPerspectiveSigmaS(0.2, scale, 9 / 16, undefined)).toBe(0)
    const rear = apexPerspectiveSigmaS(0.2, scale, 9 / 16, 'rear')
    // 2 m above the camera, 4.8 m away, 0.5 m/s along the axis: about 21 ms.
    expect(rear).toBeGreaterThan(0.015)
    expect(rear).toBeLessThan(0.03)
    expect(apexPerspectiveSigmaS(0.2, null, 9 / 16, 'front45')).toBeCloseTo(0.015)
  })

  it('sound delay estimate is bounded', () => {
    expect(soundDelayEstimateS(null, 1)).toBeCloseTo(0.01)
    expect(soundDelayEstimateS({ unitsPerM: 1e-3, relSigma: 0.05, basis: '' }, 1)).toBeCloseTo(12 / SPEED_OF_SOUND_MPS)
    expect(soundDelayEstimateS({ unitsPerM: 10, relSigma: 0.05, basis: '' }, 1)).toBeCloseTo(2 / SPEED_OF_SOUND_MPS)
  })

  it('createBallFrameDetector applies the toss band only before the given time', () => {
    const W = 360
    const H = 640
    const scene = createScene({ width: W, height: H, seed: 2, upper: 'sky', lower: 'grass', horizonY: 0.45, lighting: LIGHTING.sun, noiseSigma: 3 })
    const detect = createBallFrameDetector({
      setup: { expectedRadiusNorm: 6 / H, tossRoi: { x0: 0.6, y0: 0, x1: 1, y1: 1 } },
      tossRoiUntilTReal: 0.1,
    })
    // Ball moving on the left, outside the band: hidden before 0.1 s, found after.
    const found = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => {
      const t = f / 30
      const image = scene.render(ballAt((tt) => ({ x: 100 + 300 * tt, y: 300 - 400 * tt }), t, 1 / 60, 6), [], f)
      return detect({ index: f, tMedia: t, tReal: t, image })
    })
    expect(found.slice(1, 3).every((f) => f.candidates.length === 0)).toBe(true)
    expect(found.slice(4).every((f) => f.candidates.length > 0)).toBe(true)
    expect(found[5].frameIndex).toBe(5)
  })
})
