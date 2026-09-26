import { describe, expect, it } from 'vitest'
import { parseTruthPoseFrames } from '../../../app/src/analysis/pose/injected.ts'
import { collectSoundEvents, encodeWav, renderAudio, SPEED_OF_SOUND_MS } from '../src/audio.ts'
import { LM } from '../../../app/src/analysis/types.ts'
import { ballOccluded, bodyVolumes, landmarkOcclusion, segmentSegmentDistance } from '../src/occlusion.ts'
import { quickSet } from '../src/scenarios.ts'
import { buildScenario, type Scenario } from '../src/setup.ts'
import { buildTruth, FrameTruthSource, planOutput, TRUNCATION_SD_FACTOR } from '../src/truth.ts'
import { dist, type Vec3 } from '../src/math/vec.ts'

type AnyTruth = {
  video: { width: number; height: number; fps: number; captureFps: number; timeScale: number; frameCount: number }
  frames: { frameIndex: number; tReal: number; tMedia: number; landmarks: { x: number; y: number; visibility: number }[] | null; balls: { state: string }[] }[]
  serves: { events: Record<string, { tReal: number; tMedia: number; frameIndex: number; inClip: boolean }>; metrics: Record<string, number>; params: Record<string, number>; design: { releaseReachable: boolean } }[]
  audio: { events: { kind: string; emitTReal: number; arrivalTReal: number; arrivalTMedia: number; distanceM: number }[] }
}

function truthFor(sc: Scenario, outputIndex = 0): AnyTruth {
  const b = buildScenario(sc)
  const source = new FrameTruthSource(b)
  const o = planOutput(b, sc.outputs[outputIndex])
  const sounds = collectSoundEvents(b.clip, source.camAt, { seed: sc.seed, startS: b.t0S, endS: b.t0S + b.frameCount / sc.video.fps })
  return buildTruth({ b, output: o, source, files: [], sounds, audio: { sampleRate: 48000, backgroundDbfs: -50, hum: false }, groups: [], generator: {} }) as unknown as AnyTruth
}

const [side60, rear30, slomo] = quickSet()

describe('truth.json format', () => {
  const t = truthFor(side60)

  it('is readable by the app parser (parseTruthPoseFrames)', () => {
    const frames = parseTruthPoseFrames(JSON.parse(JSON.stringify(t)))
    expect(frames).toHaveLength(t.video.frameCount)
    expect(frames[10].frameIndex).toBe(10)
    expect(frames[10].tReal).toBeCloseTo(10 / 60, 6)
    expect(frames[10].landmarks).toHaveLength(33)
    for (const lm of frames[100].landmarks!) {
      expect(lm.x).toBeGreaterThan(-0.5)
      expect(lm.x).toBeLessThan(1.5)
      expect([0, 0.4, 1]).toContain(lm.visibility)
    }
  })

  it('has events whose frame index is the nearest frame', () => {
    for (const s of t.serves) {
      for (const name of ['tossRelease', 'tossApex', 'trophy', 'contact', 'landing']) {
        const e = s.events[name]
        expect(e.frameIndex).toBe(Math.round(e.tReal * 60))
        expect(e.inClip).toBe(true)
      }
      expect(s.events.tossRelease.tReal).toBeLessThan(s.events.tossApex.tReal)
      expect(s.events.tossApex.tReal).toBeLessThan(s.events.contact.tReal)
      expect(s.events.contact.tReal).toBeLessThan(s.events.landing.tReal)
    }
  })

  it('realised metrics match the generating parameters where the model solves for them', () => {
    for (const s of t.serves) {
      const m = s.metrics
      const p = s.params
      expect(s.design.releaseReachable).toBe(true)
      expect(m.tossReleaseHeightM).toBeCloseTo(p.tossReleaseHeightM, 3)
      expect(m.tossApexHeightM).toBeCloseTo(p.tossApexHeightM, 3)
      expect(m.contactHeightRatio).toBeCloseTo(p.contactHeightRatio, 3)
      expect(m.maxFrontKneeFlexion3DDeg).toBeCloseTo(p.maxKneeFlexionDeg, 1)
      expect(m.trunkInclinationContact3DDeg).toBeCloseTo(p.trunkInclinationContactDeg, 2)
      expect(m.landingDistanceInsideBaselineM).toBeCloseTo(p.landingDistanceM, 3)
      expect(m.ballSpeedAtContactKmh).toBeCloseTo(p.serveSpeedKmh, 1)
      expect(m.avgSpeedContactToBounceKmh).toBeLessThan(m.ballPeakSpeedKmh)
      expect(m.releaseToContactS).toBeCloseTo(s.events.contact.tReal - s.events.tossRelease.tReal, 4)
      expect(m.bounceInServiceBox).toBe(true)
    }
  })

  it('places each sound at emission + distance / 343 m/s', () => {
    for (const e of t.audio.events) expect(e.arrivalTReal - e.emitTReal).toBeCloseTo(e.distanceM / SPEED_OF_SOUND_MS, 5)
    expect(t.audio.events.some((e) => e.kind === 'contact')).toBe(true)
  })
})

describe('slow-motion and trimmed clips', () => {
  const t = truthFor(slomo)
  it('re-times 240 fps capture to 30 fps media with timeScale 0.125', () => {
    expect(t.video.fps).toBe(30)
    expect(t.video.captureFps).toBe(240)
    expect(t.video.timeScale).toBe(0.125)
    const f = t.frames[40]
    expect(f.tReal).toBeCloseTo(40 / 240, 6)
    expect(f.tMedia).toBeCloseTo(40 / 30, 6)
    const c = t.serves[0].events.contact
    expect(c.tMedia).toBeCloseTo(c.tReal / 0.125, 5)
    for (const e of t.audio.events) expect(e.arrivalTMedia).toBeCloseTo(e.arrivalTReal / 0.125, 4)
  })
  it('starts shortly before toss release', () => {
    const rel = t.serves[0].events.tossRelease
    expect(rel.tReal).toBeCloseTo(0.35, 6)
  })
})

describe('left-handed rear clip', () => {
  const t = truthFor(rear30)
  it('uses 30 fps frames and the right leg as the front leg', () => {
    expect(t.video.fps).toBe(30)
    expect((t.serves[0].metrics as unknown as { frontLeg: string }).frontLeg).toBe('right')
  })
})

describe('audio track', () => {
  it('is silent before an event arrives and starts on the next sample after it', () => {
    const e = { kind: 'contact' as const, serveIndex: 0, emitS: 1, position: [0, 0, 2.7] as Vec3, distanceM: 5, arrivalS: 1 + 5 / 343, peak: 0.2 }
    const quiet = renderAudio([e], { durationMediaS: 2, timeScale: 1, t0S: 0, backgroundDbfs: -200, hum: false, seed: 1 })
    const first = Math.ceil(e.arrivalS * 48000)
    for (let i = first - 50; i < first; i++) expect(Math.abs(quiet[i])).toBeLessThan(1e-9)
    let peak = 0
    for (let i = first; i < first + 2400; i++) peak = Math.max(peak, Math.abs(quiet[i]))
    expect(peak).toBeGreaterThan(0.1)
    expect(peak).toBeLessThanOrEqual(0.2 * 1.05)
  })
  it('writes a valid 16-bit mono WAV header', () => {
    const wav = encodeWav(new Float32Array(480))
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(48000)
    expect(wav.readUInt32LE(40)).toBe(960)
  })
})

describe('occlusion', () => {
  it('segment distance', () => {
    expect(segmentSegmentDistance([0, 0, 0], [1, 0, 0], [0.5, 1, -1], [0.5, 1, 1])).toBeCloseTo(1, 12)
    expect(segmentSegmentDistance([0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0])).toBeCloseTo(1, 12)
  })

  it('hides the far hip when looking along the hip line and shows the near one', () => {
    const b = buildScenario(side60)
    const pose = b.clip.pose(0.3)
    const vols = bodyVolumes(b.clip.anthro, pose)
    const hipL = pose.lm[LM.LEFT_HIP]
    const hipR = pose.lm[LM.RIGHT_HIP]
    const dir = [hipR[0] - hipL[0], hipR[1] - hipL[1], hipR[2] - hipL[2]]
    const eye: Vec3 = [hipR[0] + dir[0] * 20, hipR[1] + dir[1] * 20, hipR[2] + dir[2] * 20]
    const occ = landmarkOcclusion(b.clip.anthro, pose, eye, vols)
    expect(occ[LM.RIGHT_HIP]).toBe(false)
    expect(occ[LM.LEFT_HIP]).toBe(true)
    // From the chest side both hips are visible.
    const front = landmarkOcclusion(b.clip.anthro, pose, b.setup.baseExtrinsics.position, vols)
    expect(front[LM.LEFT_HIP]).toBe(false)
    expect(front[LM.RIGHT_HIP]).toBe(false)
    expect(ballOccluded(eye, pose.tossBallPt, 0.0335, vols, 'left')).toBeTypeOf('boolean')
    expect(dist(hipL, hipR)).toBeGreaterThan(0.15)
  })
})

describe('variability', () => {
  it('truncating a normal at +/-2.5 SD keeps 95.46% of its SD', () => {
    expect(TRUNCATION_SD_FACTOR).toBeCloseTo(0.9546, 4)
  })
})
