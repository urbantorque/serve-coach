import { beforeAll, describe, expect, it } from 'vitest'
import { ensureFixtures, readFixture } from './__fixtures__/fixtures.mjs'
import { estimateTimeline, nearestFrameIndex, planDecode, selectFrameIndices } from './decodePlan.ts'
import { probeVideo, type ProbeResult } from './probe.ts'
import type { FrameTiming, SampleInfo } from './timing.ts'

const frameTimes = (n: number, fps: number) => Array.from({ length: n }, (_, index) => ({ index, tMedia: index / fps }))

describe('selectFrameIndices', () => {
  const frames = frameTimes(100, 50)

  it('defaults to every frame', () => {
    expect(selectFrameIndices(frames, 1)).toHaveLength(100)
  })

  it('clamps index ranges and applies a step', () => {
    expect(selectFrameIndices(frames, 1, { startIndex: -5, endIndex: 4 })).toEqual([0, 1, 2, 3, 4])
    expect(selectFrameIndices(frames, 1, { startIndex: 90, endIndex: 500, step: 4 })).toEqual([90, 94, 98])
  })

  it('selects by real time using the time scale', () => {
    expect(selectFrameIndices(frames, 1, { startReal: 0.1, endReal: 0.16 })).toEqual([5, 6, 7, 8])
    // timeScale 0.125: frame i is at real time i / 50 / 8.
    expect(selectFrameIndices(frames, 0.125, { startReal: 0.01, endReal: 0.02 })).toEqual([4, 5, 6, 7, 8])
    expect(selectFrameIndices(frames, 1, { startReal: 5, endReal: 6 })).toEqual([])
  })

  it('dedupes and sorts explicit index lists', () => {
    expect(selectFrameIndices(frames, 1, { indices: [7, 3, 3, 200, -1, 2.5] })).toEqual([3, 7])
  })
})

describe('nearestFrameIndex / estimateTimeline', () => {
  it('finds the nearest frame by time', () => {
    const frames = frameTimes(10, 10)
    expect(nearestFrameIndex(frames, 0.349)).toBe(3)
    expect(nearestFrameIndex(frames, 0.351)).toBe(4)
    expect(nearestFrameIndex(frames, -1)).toBe(0)
    expect(nearestFrameIndex(frames, 9)).toBe(9)
    expect(nearestFrameIndex([], 1)).toBe(-1)
  })

  it('estimates a constant-rate timeline from frame callbacks with gaps', () => {
    // 60 fps frames observed with two missed callbacks.
    const observed = [0, 1, 2, 4, 5, 6, 8, 9, 10, 11].map((i) => i / 60)
    const est = estimateTimeline(observed, 1)
    expect(est?.fps).toBeCloseTo(60, 6)
    expect(est?.frameCount).toBe(60)
    expect(est?.firstFrameS).toBe(0)
    expect(estimateTimeline([0, 0.1], 1)).toBeNull()
  })

  it('is not fooled by WebM millisecond timestamps (observed in Edge on vp9.webm)', () => {
    // requestVideoFrameCallback mediaTime values seen during playback of a 60 fps WebM.
    const observed = [0.033, 0.067, 0.083, 0.1, 0.117, 0.15, 0.167, 0.183, 0.2, 0.233, 0.25, 0.267]
    const est = estimateTimeline(observed, 1)
    expect(est).toEqual({ fps: 60, firstFrameS: 0, frameCount: 60 })
  })

  it('survives a long observation with ms rounding and missed callbacks', () => {
    // 45 callbacks over 0.9 s of a 60 fps WebM, every third callback missed, ms-rounded.
    const observed = Array.from({ length: 70 }, (_, k) => k)
      .filter((k) => k % 3 !== 2)
      .map((k) => Math.round(((k + 2) * 1000) / 60) / 1000)
    expect(estimateTimeline(observed, 1)).toEqual({ fps: 60, firstFrameS: 0, frameCount: 60 })
  })

  it('keeps a genuine non-zero start and non-standard rates', () => {
    const phase = 0.4 / 37
    const observed = Array.from({ length: 20 }, (_, i) => phase + (i + 10) / 37)
    const est = estimateTimeline(observed, 2)
    expect(est!.fps).toBeCloseTo(37, 6)
    expect(est!.firstFrameS).toBeCloseTo(phase, 6)
    expect(estimateTimeline(observed, 2, 0.011)!.firstFrameS).toBe(0.011) // measured start wins
    const ntsc = estimateTimeline(Array.from({ length: 30 }, (_, i) => Math.round((i * 1001) / 30) / 1000), 10)
    expect(ntsc!.fps).toBeCloseTo(29.97, 9)
  })
})

describe('planDecode', () => {
  let probe: ProbeResult
  let trimmed: ProbeResult
  beforeAll(async () => {
    ensureFixtures()
    probe = await probeVideo(readFixture('cfr60.mp4'))
    trimmed = await probeVideo(readFixture('trimmed.mp4'))
  }, 120_000)

  it('starts at the keyframe before the first wanted frame (GOP = 30)', () => {
    const plan = planDecode(probe.video.samples, probe.frames, [37, 38, 39, 40])
    expect(plan).not.toBeNull()
    expect(probe.video.samples[plan!.firstSample].isSync).toBe(true)
    expect(probe.frames[30].sampleIndex).toBe(plan!.firstSample)
    const needed = [37, 38, 39, 40].map((i) => probe.frames[i].sampleIndex)
    expect(plan!.lastSample).toBe(Math.max(...needed))
  })

  it('decodes pre-roll samples that sit outside the edit list', () => {
    // trimmed.mp4 frame 0 is source frame 18: decoding must start at source keyframe 0.
    const plan = planDecode(trimmed.video.samples, trimmed.frames, [0])
    expect(plan!.firstSample).toBe(0)
  })

  it('steps back a GOP when a leading picture would precede its keyframe (open GOP)', () => {
    // Decode order: I0(cts 0) P(cts 3) B(1) B(2) | I4(cts 6) B(cts 4) B(cts 5) - B frames after I4 display before it.
    const cts = [0, 3, 1, 2, 6, 4, 5]
    const samples: SampleInfo[] = cts.map((c, index) => ({
      index,
      dtsTicks: index,
      ctsTicks: c,
      durationTicks: 1,
      isSync: index === 0 || index === 4,
      offset: index,
      size: 1,
    }))
    const order = [...samples].sort((a, b) => a.ctsTicks - b.ctsTicks)
    const frames: FrameTiming[] = order.map((s, index) => ({
      index,
      sampleIndex: s.index,
      ctsTicks: s.ctsTicks,
      tMedia: s.ctsTicks,
      durationS: 1,
      isKeyframe: s.isSync,
    }))
    // Frame at cts 4 is sample 5, which follows keyframe 4 (cts 6) in decode order.
    const plan = planDecode(samples, frames, [4])
    expect(plan!.firstSample).toBe(0)
    // Frame at cts 6 alone can start at its own keyframe.
    expect(planDecode(samples, frames, [6])!.firstSample).toBe(4)
  })

  it('returns null for an empty request', () => {
    expect(planDecode(probe.video.samples, probe.frames, [])).toBeNull()
  })
})
