import { describe, expect, it } from 'vitest'
import { LM, type PoseFrame } from '../types.ts'
import { InjectedPoseSource, applyPoseNoise, parseTruthPoseFrames, truthToPoseFrames, type TruthPoseFrame } from './injected.ts'
import { collectPoseFrames } from './poseSource.ts'
import { buildServeFixture } from './servePoseFixture.ts'

const fx = buildServeFixture({ fps: 60 })
const opts = { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU }
const none = { jitterSigmaBodyHeights: 0, speedJitterS: 0, frameDropoutProb: 0, landmarkDropoutProb: 0, swapProb: 0, visibilitySigma: 0 }

/** Per-coordinate errors (HU) for the given landmarks over frames selected by time. */
function errors(noisy: readonly PoseFrame[], landmarks: readonly number[], select: (t: number) => boolean): number[] {
  const out: number[] = []
  noisy.forEach((f, i) => {
    if (!f.landmarks || !select(f.tReal)) return
    for (const k of landmarks) {
      out.push((f.landmarks[k].x - fx.frames[i].landmarks![k].x) * fx.frameAspect)
      out.push(f.landmarks[k].y - fx.frames[i].landmarks![k].y)
    }
  })
  return out
}

const std = (v: readonly number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length)

describe('applyPoseNoise', () => {
  it('is an exact replay when every noise term is zero', () => {
    const out = applyPoseNoise(fx.frames, none, opts)
    expect(out.events).toEqual([])
    out.frames.forEach((f, i) => {
      f.landmarks!.forEach((lm, k) => {
        expect(lm.x).toBe(fx.frames[i].landmarks![k].x)
        expect(lm.y).toBe(fx.frames[i].landmarks![k].y)
      })
    })
  })

  it('is deterministic per seed and differs across seeds', () => {
    const a = applyPoseNoise(fx.frames, { seed: 42 }, opts)
    const b = applyPoseNoise(fx.frames, { seed: 42 }, opts)
    const c = applyPoseNoise(fx.frames, { seed: 43 }, opts)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(a.frames)).not.toBe(JSON.stringify(c.frames))
  })

  it('produces Gaussian jitter with the configured sigma (in body heights)', () => {
    const sigmaBH = 0.01
    const out = applyPoseNoise(fx.frames, { ...none, seed: 1, jitterSigmaBodyHeights: sigmaBH }, opts)
    const e = errors(out.frames, [LM.NOSE, LM.LEFT_HIP, LM.RIGHT_KNEE, LM.LEFT_ANKLE], () => true)
    expect(std(e) / fx.heightHU).toBeGreaterThan(sigmaBH * 0.93)
    expect(std(e) / fx.heightHU).toBeLessThan(sigmaBH * 1.07)
    const mean = e.reduce((s, v) => s + v, 0) / e.length
    expect(Math.abs(mean) / fx.heightHU).toBeLessThan(sigmaBH * 0.1)
  })

  it('adds speed-proportional jitter to fast arm landmarks only', () => {
    const out = applyPoseNoise(fx.frames, { ...none, seed: 2, speedJitterS: 0.01 }, opts)
    const swing = (t: number) => t > 1.9 && t < 2.1
    const rest = (t: number) => t < 0.75 // the fixture is exactly still before 0.8 s
    expect(std(errors(out.frames, [LM.RIGHT_WRIST], rest))).toBeLessThan(1e-9)
    expect(std(errors(out.frames, [LM.RIGHT_WRIST], swing)) / fx.heightHU).toBeGreaterThan(0.02)
    expect(std(errors(out.frames, [LM.LEFT_HIP, LM.NOSE], swing))).toBeLessThan(1e-9)
  })

  it('drops whole frames in bursts at roughly the configured rate', () => {
    const long = buildServeFixture({ fps: 240, durationS: 20 })
    const out = applyPoseNoise(long.frames, { ...none, seed: 9, frameDropoutProb: 0.02, frameDropoutMeanFrames: 2 }, { frameAspect: long.frameAspect })
    const dropped = out.frames.filter((f) => f.landmarks === null).length
    const logged = out.events.filter((e) => e.kind === 'frame-dropout').length
    expect(logged).toBe(dropped)
    // Expected fraction ~ p * L / (1 + p * L) = 0.038.
    const fraction = dropped / out.frames.length
    expect(fraction).toBeGreaterThan(0.025)
    expect(fraction).toBeLessThan(0.055)
  })

  it('drops landmark visibility and logs each drop', () => {
    const out = applyPoseNoise(fx.frames, { ...none, seed: 4, landmarkDropoutProb: 0.05, landmarkDropoutMaxVisibility: 0.2 }, opts)
    const drops = out.events.filter((e) => e.kind === 'landmark-dropout')
    expect(drops.length).toBeGreaterThan(0)
    for (const d of drops) {
      if (d.kind !== 'landmark-dropout') continue
      const frame = out.frames.find((f) => f.frameIndex === d.frameIndex)!
      expect(frame.landmarks![d.landmark].visibility).toBeLessThanOrEqual(0.2)
    }
  })

  it('swaps left and right for logged swap events', () => {
    const out = applyPoseNoise(fx.frames, { ...none, seed: 11, swapProb: 0.05, swapGroups: ['arms'] }, opts)
    const swaps = out.events.filter((e) => e.kind === 'swap')
    expect(swaps.length).toBeGreaterThan(0)
    for (const s of swaps) {
      const i = s.frameIndex
      expect(out.frames[i].landmarks![LM.LEFT_WRIST].x).toBe(fx.frames[i].landmarks![LM.RIGHT_WRIST].x)
      expect(out.frames[i].landmarks![LM.LEFT_HIP].x).toBe(fx.frames[i].landmarks![LM.LEFT_HIP].x)
    }
  })

  it('keeps null truth frames null', () => {
    const truth = fx.frames.map((f, i) => (i === 5 ? { ...f, landmarks: null } : f))
    expect(applyPoseNoise(truth, { seed: 1 }, opts).frames[5].landmarks).toBeNull()
  })
})

describe('InjectedPoseSource', () => {
  const truth: TruthPoseFrame[] = fx.frames.map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, landmarks: f.landmarks }))

  it('replays truth exactly without noise, by frame index', async () => {
    const source = new InjectedPoseSource(truth, { frameAspect: fx.frameAspect })
    expect(source.kind).toBe('injected')
    const inputs = [{ frameIndex: 3, tReal: 3 / 60 }, { frameIndex: 120, tReal: 2 }]
    const out = await collectPoseFrames(source.estimate(inputs))
    expect(out.map((f) => f.frameIndex)).toEqual([3, 120])
    expect(out[1].landmarks![LM.RIGHT_WRIST]).toEqual(fx.frames[120].landmarks![LM.RIGHT_WRIST])
    expect(out[1].source).toBe('injected')
  })

  it('falls back to the nearest time, and to an empty frame when nothing is close', async () => {
    const source = new InjectedPoseSource(truth, { frameAspect: fx.frameAspect })
    const [near, far] = await collectPoseFrames(source.estimate([
      { frameIndex: 9999, tReal: 1.0 + 0.004 },
      { frameIndex: 10000, tReal: 50 },
    ]))
    expect(near.landmarks).toEqual(fx.frames[60].landmarks)
    expect(far.landmarks).toBeNull()
  })

  it('replays every frame with noise and exposes the event log', async () => {
    const source = new InjectedPoseSource(fx.frames, { frameAspect: fx.frameAspect, noise: { seed: 5, frameDropoutProb: 0.05 } })
    const out = await collectPoseFrames(source.replay())
    expect(out).toHaveLength(fx.frames.length)
    expect(source.noiseEvents.some((e) => e.kind === 'frame-dropout')).toBe(true)
    await source.dispose()
    expect(await collectPoseFrames(source.replay())).toEqual([])
  })

  it('converts truth to clean pose frames', () => {
    const frames = truthToPoseFrames([{ frameIndex: 0, tReal: 0, landmarks: [{ x: 0.1, y: 0.2 }] }])
    expect(frames[0].landmarks![0]).toEqual({ x: 0.1, y: 0.2, visibility: 1 })
    expect(frames[0].score).toBe(1)
  })
})

describe('parseTruthPoseFrames', () => {
  const lms = Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: i / 40 }))

  it('reads an object with frames and alternative key names', () => {
    const parsed = parseTruthPoseFrames({ frames: [{ index: 7, t: 0.25, landmarks2d: lms }, { index: 8, t: 0.3, landmarks2d: null }] })
    expect(parsed[0]).toMatchObject({ frameIndex: 7, tReal: 0.25 })
    expect(parsed[0].landmarks![10].y).toBeCloseTo(0.25, 12)
    expect(parsed[1].landmarks).toBeNull()
  })

  it('reads tuples and normalises pixel coordinates using the file size', () => {
    const tuples = Array.from({ length: 33 }, () => [540, 960, 0.1])
    const parsed = parseTruthPoseFrames({ video: { width: 1080, height: 1920 }, frames: [{ frameIndex: 0, tReal: 0, pose2d: tuples }] })
    expect(parsed[0].landmarks![0]).toMatchObject({ x: 0.5, y: 0.5, z: 0.1 })
  })

  it('explains what is wrong with a malformed file', () => {
    expect(() => parseTruthPoseFrames(42)).toThrow(/frames/)
    expect(() => parseTruthPoseFrames([{ frameIndex: 0, landmarks: lms }])).toThrow(/time/)
    expect(() => parseTruthPoseFrames([{ frameIndex: 0, tReal: 0, landmarks: lms.slice(0, 17) }])).toThrow(/33/)
    expect(() => parseTruthPoseFrames([{ frameIndex: 0, tReal: 0, landmarks: lms.map(() => [900, 900]) }])).toThrow(/width\/height/)
  })
})
