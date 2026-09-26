import { describe, expect, it } from 'vitest'
import { LM, type PoseFrame } from '../types.ts'
import { applyPoseNoise } from './injected.ts'
import { gaussian, mulberry32 } from './rng.ts'
import { buildServeFixture } from './servePoseFixture.ts'
import { OneEuroFilter, SPORTS_ONE_EURO, cleanPoseFrames, findExcursions, smoothingAlpha } from './smoothing.ts'

function apexTime(frames: readonly PoseFrame[], landmark: number): number {
  let bestY = Infinity
  let t = Number.NaN
  for (const f of frames) {
    const lm = f.landmarks?.[landmark]
    if (lm && lm.y < bestY) {
      bestY = lm.y
      t = f.tReal
    }
  }
  return t
}

/** RMS landmark error vs truth in body heights, over frames selected by time. */
function rmsErrorBH(frames: readonly PoseFrame[], truth: readonly PoseFrame[], aspect: number, heightHU: number, select = (_t: number) => true): number {
  let sum = 0
  let n = 0
  frames.forEach((f, i) => {
    const tl = truth[i].landmarks
    if (!f.landmarks || !tl || !select(f.tReal)) return
    f.landmarks.forEach((lm, k) => {
      sum += ((lm.x - tl[k].x) * aspect) ** 2 + (lm.y - tl[k].y) ** 2
      n++
    })
  })
  return Math.sqrt(sum / n) / heightHU
}

const jitterOnly = { frameDropoutProb: 0, swapProb: 0, landmarkDropoutProb: 0 }

describe('OneEuroFilter', () => {
  it('passes a constant through unchanged and reduces stationary noise', () => {
    const constant = new OneEuroFilter(SPORTS_ONE_EURO)
    for (let i = 0; i < 50; i++) expect(constant.filter(0.4, i / 60)).toBeCloseTo(0.4, 12)

    const rng = mulberry32(5)
    const filter = new OneEuroFilter(SPORTS_ONE_EURO, 1 / 0.6)
    let rawSq = 0
    let outSq = 0
    for (let i = 0; i < 600; i++) {
      const noise = 0.003 * gaussian(rng)
      const out = filter.filter(0.5 + noise, i / 60)
      if (i > 60) {
        rawSq += noise ** 2
        outSq += (out - 0.5) ** 2
      }
    }
    expect(Math.sqrt(outSq / rawSq)).toBeLessThan(0.5)
  })

  it('adapts: a fast ramp is followed with little lag', () => {
    const filter = new OneEuroFilter(SPORTS_ONE_EURO, 1 / 0.6)
    let out = 0
    // 5 body heights per second (0.6 HU tall body): racket-arm speed.
    for (let i = 0; i <= 30; i++) out = filter.filter(3 * (i / 60), i / 60)
    const lagS = (3 * 0.5 - out) / 3
    expect(lagS).toBeLessThan(0.01)
  })

  it('computes the standard smoothing factor', () => {
    const tau = 1 / (2 * Math.PI * 1)
    expect(smoothingAlpha(1, 0.01)).toBeCloseTo(1 / (1 + tau / 0.01), 12)
  })
})

describe('findExcursions', () => {
  const t = Array.from({ length: 20 }, (_, i) => i / 60)
  const good = t.map(() => true)

  it('rejects a single-frame spike and a two-frame glitch but not smooth fast motion', () => {
    const x = t.map((ti) => 2 * ti) // 2 HU/s ramp
    const y = t.map(() => 0.5)
    y[6] += 0.12 // 0.2 body heights for a 0.6 HU body
    y[12] += 0.1
    y[13] += 0.1
    expect(findExcursions(t, x, y, good, 0.6)).toEqual([6, 12, 13])
  })

  it('accepts a tight but physically plausible arc (no false positive)', () => {
    // Wrist on a 0.2 HU circle at 15 rad/s, sampled at 30 fps.
    const t30 = Array.from({ length: 20 }, (_, i) => i / 30)
    const x = t30.map((ti) => 0.2 * Math.cos(15 * ti))
    const y = t30.map((ti) => 0.2 * Math.sin(15 * ti))
    expect(findExcursions(t30, x, y, t30.map(() => true), 0.6)).toEqual([])
  })
})

describe('cleanPoseFrames on the kinematic serve', () => {
  for (const fps of [30, 60, 240]) {
    it(`leaves noise-free data unchanged in timing and flags nothing (${fps} fps)`, () => {
      const fx = buildServeFixture({ fps })
      const { frames, report } = cleanPoseFrames(fx.frames, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
      expect(report.outliersRejected).toEqual([])
      expect(report.swapsCorrected).toEqual([])
      expect(apexTime(frames, LM.RIGHT_WRIST)).toBeCloseTo(fx.contactT, 9)
      // The filter's own distortion of clean motion stays under 0.3% of body height (~5 mm).
      expect(rmsErrorBH(frames, fx.frames, fx.frameAspect, fx.heightHU)).toBeLessThan(0.003)
    })
  }

  it('estimates body height when not given', () => {
    const fx = buildServeFixture()
    const { report } = cleanPoseFrames(fx.frames, { frameAspect: fx.frameAspect })
    expect(report.bodyHeightSource).toBe('setup-estimate')
    expect(Math.abs(report.bodyHeightHU - fx.heightHU) / fx.heightHU).toBeLessThan(0.015)
  })

  it('reduces jitter at rest by more than half and does not blur the swing', () => {
    const fx = buildServeFixture({ fps: 60 })
    let rawStill = 0
    let cleanStill = 0
    let rawAll = 0
    let cleanAll = 0
    for (let seed = 1; seed <= 5; seed++) {
      const noisy = applyPoseNoise(fx.frames, { ...jitterOnly, seed }, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
      const clean = cleanPoseFrames(noisy.frames, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU }).frames
      const still = (t: number) => t < 0.9
      rawStill += rmsErrorBH(noisy.frames, fx.frames, fx.frameAspect, fx.heightHU, still)
      cleanStill += rmsErrorBH(clean, fx.frames, fx.frameAspect, fx.heightHU, still)
      rawAll += rmsErrorBH(noisy.frames, fx.frames, fx.frameAspect, fx.heightHU)
      cleanAll += rmsErrorBH(clean, fx.frames, fx.frameAspect, fx.heightHU)
    }
    expect(cleanStill / rawStill).toBeLessThan(0.5)
    expect(cleanAll / rawAll).toBeLessThan(0.7)
  })

  for (const fps of [30, 60, 120, 240]) {
    it(`keeps the mean wrist-apex bias under max(half a frame, 4 ms) in preserve-peaks mode (${fps} fps)`, () => {
      const fx = buildServeFixture({ fps })
      const frameS = 1 / fps
      let zeroPhaseBias = 0
      let causalBias = 0
      const seeds = 20
      for (let seed = 1; seed <= seeds; seed++) {
        const noisy = applyPoseNoise(fx.frames, { ...jitterOnly, seed }, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
        const opts = { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU }
        const zp = cleanPoseFrames(noisy.frames, { ...opts, smoothing: { preservePeaks: true } }).frames
        const causal = cleanPoseFrames(noisy.frames, { ...opts, smoothing: { preservePeaks: false } }).frames
        zeroPhaseBias += (apexTime(zp, LM.RIGHT_WRIST) - fx.contactT) / seeds
        causalBias += (apexTime(causal, LM.RIGHT_WRIST) - fx.contactT) / seeds
      }
      // At 240 fps half a frame (2 ms) is below what 20 noisy clips can resolve (per-clip spread ~10 ms).
      expect(Math.abs(zeroPhaseBias)).toBeLessThan(Math.max(0.5 * frameS, 0.004))
      // The causal filter always lags: its apex comes later than the zero-phase one.
      expect(causalBias).toBeGreaterThan(zeroPhaseBias)
    })
  }

  it('fills short gaps with interpolated landmarks (visibility 0) and leaves long gaps empty', () => {
    const fx = buildServeFixture({ fps: 60 })
    const input = fx.frames.map((f) => ({ ...f }))
    for (const i of [30, 31]) input[i] = { ...input[i], landmarks: null } // 33 ms gap at rest
    for (const i of [117, 118]) input[i] = { ...input[i], landmarks: null } // 33 ms gap mid-swing
    for (let i = 150; i < 165; i++) input[i] = { ...input[i], landmarks: null } // 250 ms gap
    const { frames, report } = cleanPoseFrames(input, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU, smoothing: { enabled: false } })

    for (const i of [30, 31, 117, 118]) {
      const lms = frames[i].landmarks!
      expect(lms).not.toBeNull()
      expect(lms.every((lm) => lm.interpolated === true && lm.visibility === 0)).toBe(true)
    }
    for (let i = 150; i < 165; i++) expect(frames[i].landmarks).toBeNull()
    expect(report.interpolatedSamples).toBe(4 * 33)
    expect(report.framesWithoutPose).toBe(15)
    // Mid-swing (50 ms before contact) is the worst place for a gap; cubic beats linear there.
    const linear = cleanPoseFrames(input, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU, gaps: { method: 'linear' }, smoothing: { enabled: false } }).frames
    const errCubic = rmsErrorBH([frames[117], frames[118]], [fx.frames[117], fx.frames[118]], fx.frameAspect, fx.heightHU)
    const errLinear = rmsErrorBH([linear[117], linear[118]], [fx.frames[117], fx.frames[118]], fx.frameAspect, fx.heightHU)
    expect(errCubic).toBeLessThan(0.03)
    expect(errCubic).toBeLessThan(errLinear)
    const errRest = rmsErrorBH([frames[30], frames[31]], [fx.frames[30], fx.frames[31]], fx.frameAspect, fx.heightHU)
    expect(errRest).toBeLessThan(0.001)
    expect(frames[29].landmarks![0].interpolated).toBeUndefined()
  })

  it('respects maxGapFrames and the linear method', () => {
    const fx = buildServeFixture({ fps: 240 })
    const input = fx.frames.map((f, i) => (i >= 100 && i < 104 ? { ...f, landmarks: null } : f))
    const capped = cleanPoseFrames(input, { frameAspect: fx.frameAspect, gaps: { maxGapFrames: 3 }, smoothing: { enabled: false } })
    expect(capped.frames[101].landmarks).toBeNull()
    const linear = cleanPoseFrames(input, { frameAspect: fx.frameAspect, gaps: { method: 'linear' }, smoothing: { enabled: false } })
    expect(linear.frames[101].landmarks![LM.NOSE].interpolated).toBe(true)
  })

  it('rejects an injected wrist glitch and replaces it by interpolation', () => {
    const fx = buildServeFixture({ fps: 60 })
    const input = fx.frames.map((f) => ({ ...f, landmarks: f.landmarks!.map((lm) => ({ ...lm })) }))
    input[70].landmarks![LM.RIGHT_WRIST].y += 0.25 * fx.heightHU // wrist jumps to the hip for one frame
    const { frames, report } = cleanPoseFrames(input, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
    expect(report.outliersRejected).toEqual([{ frameIndex: 70, landmark: LM.RIGHT_WRIST }])
    const fixed = frames[70].landmarks![LM.RIGHT_WRIST]
    expect(fixed.interpolated).toBe(true)
    expect(Math.abs(fixed.y - fx.frames[70].landmarks![LM.RIGHT_WRIST].y) / fx.heightHU).toBeLessThan(0.01)
  })

  it('corrects injected left/right arm swaps without inventing any', () => {
    for (const view of ['side', 'rear'] as const) {
      const fx = buildServeFixture({ fps: 60, view })
      const input = fx.frames.map((f) => ({ ...f, landmarks: f.landmarks!.map((lm) => ({ ...lm })) }))
      const armPairs = [[LM.LEFT_WRIST, LM.RIGHT_WRIST], [LM.LEFT_ELBOW, LM.RIGHT_ELBOW], [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_INDEX, LM.RIGHT_INDEX], [LM.LEFT_PINKY, LM.RIGHT_PINKY], [LM.LEFT_THUMB, LM.RIGHT_THUMB]]
      for (const i of [100, 101, 102]) {
        const lms = input[i].landmarks!
        for (const [l, r] of armPairs) [lms[l], lms[r]] = [lms[r], lms[l]]
      }
      const { frames, report } = cleanPoseFrames(input, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU, smoothing: { enabled: false } })
      expect(report.swapsCorrected).toEqual([100, 101, 102].map((frameIndex) => ({ frameIndex, group: 'arms' })))
      for (const i of [100, 101, 102]) {
        expect(frames[i].landmarks![LM.RIGHT_WRIST].x).toBeCloseTo(fx.frames[i].landmarks![LM.RIGHT_WRIST].x, 9)
      }
    }
  })

  it('does not relabel either side of a single flip between two long runs, but reports it', () => {
    const fx = buildServeFixture({ fps: 60, view: 'rear' })
    const armPairs = [[LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_ELBOW, LM.RIGHT_ELBOW], [LM.LEFT_WRIST, LM.RIGHT_WRIST], [LM.LEFT_PINKY, LM.RIGHT_PINKY], [LM.LEFT_INDEX, LM.RIGHT_INDEX], [LM.LEFT_THUMB, LM.RIGHT_THUMB]]
    // From frame 80 (1.33 s) on, the arms are labelled the other way round for good.
    const input = fx.frames.map((f, i) => {
      if (i < 80) return f
      const lms = f.landmarks!.map((lm) => ({ ...lm }))
      for (const [l, r] of armPairs) [lms[l], lms[r]] = [lms[r], lms[l]]
      return { ...f, landmarks: lms }
    })
    const { report } = cleanPoseFrames(input, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
    expect(report.swapsCorrected).toEqual([])
    // The inconsistency is surfaced so metrics on that limb can be downgraded.
    expect(report.swapsUnresolved).toEqual([{ group: 'arms', startFrame: 0, endFrame: fx.frames.length - 1, reason: 'long-minority' }])
  })

  it('recovers accuracy under the full default noise model (dropouts, swaps, occlusion)', () => {
    const fx = buildServeFixture({ fps: 60, view: 'rear' })
    let raw = 0
    let clean = 0
    for (let seed = 1; seed <= 5; seed++) {
      const noisy = applyPoseNoise(fx.frames, { seed, swapProb: 0.02 }, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
      const out = cleanPoseFrames(noisy.frames, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
      raw += rmsErrorBH(noisy.frames, fx.frames, fx.frameAspect, fx.heightHU)
      clean += rmsErrorBH(out.frames, fx.frames, fx.frameAspect, fx.heightHU)
    }
    expect(clean / raw).toBeLessThan(0.3)
  })

  it('does not mutate its input', () => {
    const fx = buildServeFixture({ fps: 30 })
    const snapshot = JSON.stringify(fx.frames)
    cleanPoseFrames(fx.frames, { frameAspect: fx.frameAspect })
    expect(JSON.stringify(fx.frames)).toBe(snapshot)
  })
})
