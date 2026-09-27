import { beforeAll, describe, expect, it } from 'vitest'
import { ensureFixtures, readFixture } from './__fixtures__/fixtures.mjs'
import { estimateTimeline, nearestFrameIndex, planDecode, planDecodeSegments, selectFrameIndices } from './decodePlan.ts'
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
    expect(planDecodeSegments(probe.video.samples, probe.frames, [])).toBeNull()
  })
})

describe('planDecodeSegments', () => {
  let probe: ProbeResult
  beforeAll(async () => {
    ensureFixtures()
    probe = await probeVideo(readFixture('cfr60.mp4'))
  }, 120_000)

  /** Closed-GOP stream without reordering: `gop` samples per keyframe, decode order = presentation order. */
  function stream(n: number, gop: number): { samples: SampleInfo[]; frames: FrameTiming[] } {
    const samples: SampleInfo[] = Array.from({ length: n }, (_, index) => ({ index, dtsTicks: index, ctsTicks: index, durationTicks: 1, isSync: index % gop === 0, offset: index, size: 1 }))
    const frames: FrameTiming[] = samples.map((s) => ({ index: s.index, sampleIndex: s.index, ctsTicks: s.ctsTicks, tMedia: s.ctsTicks, durationS: 1, isKeyframe: s.isSync }))
    return { samples, frames }
  }

  it('decodes only the GOPs holding wanted frames', () => {
    const { samples, frames } = stream(600, 60)
    // Key frames of two serves far apart: 130, 150 (one run from 120) and 431 (a run from 420).
    const plan = planDecodeSegments(samples, frames, [150, 130, 431])!
    expect(plan.segments).toEqual([
      { firstSample: 120, lastSample: 150 },
      { firstSample: 420, lastSample: 431 },
    ])
    expect([...plan.wanted]).toEqual([130, 150, 431])
  })

  it('keeps one run when the next keyframe is within the skip threshold', () => {
    const { samples, frames } = stream(600, 60)
    // 175 -> keyframe 180 is only 5 samples past 175: not worth a flush.
    expect(planDecodeSegments(samples, frames, [130, 175, 185])!.segments).toEqual([{ firstSample: 120, lastSample: 185 }])
    // A coarse step skips only the tail of every GOP (46-59, 106-119, ...): a flush per GOP costs
    // more than decoding 14 samples, so the scan stays one run by default...
    const every15 = Array.from({ length: 40 }, (_, k) => k * 15)
    expect(planDecodeSegments(samples, frames, every15)!.segments).toEqual([{ firstSample: 0, lastSample: 585 }])
    // ...and splits per GOP only under a small threshold.
    const runs = planDecodeSegments(samples, frames, every15, 8)!.segments
    expect(runs).toHaveLength(10)
    expect(runs[0]).toEqual({ firstSample: 0, lastSample: 45 })
    // Every 10th frame leaves 9 samples at the end of each GOP: still one run under a threshold of 10.
    const every10 = Array.from({ length: 60 }, (_, k) => k * 10)
    expect(planDecodeSegments(samples, frames, every10, 10)!.segments).toEqual([{ firstSample: 0, lastSample: 590 }])
  })

  it('matches planDecode for a contiguous span (a serve window)', () => {
    const plan = planDecodeSegments(probe.video.samples, probe.frames, [37, 38, 39, 40])!
    const single = planDecode(probe.video.samples, probe.frames, [37, 38, 39, 40])!
    expect(plan.segments).toEqual([{ firstSample: single.firstSample, lastSample: single.lastSample }])
  })

  it('starts each run at a keyframe and covers every wanted sample (B-frames, GOP 30)', () => {
    const wanted = [5, 70, 71, 100, 110]
    const plan = planDecodeSegments(probe.video.samples, probe.frames, wanted)!
    for (const s of plan.segments) expect(probe.video.samples[s.firstSample].isSync).toBe(true)
    for (const i of wanted) {
      const sample = probe.frames[i].sampleIndex
      expect(plan.segments.some((s) => sample >= s.firstSample && sample <= s.lastSample)).toBe(true)
    }
    // Runs are disjoint and ascending.
    for (let k = 1; k < plan.segments.length; k++) expect(plan.segments[k].firstSample).toBeGreaterThan(plan.segments[k - 1].lastSample)
    expect(plan.segments.length).toBeGreaterThan(1)
  })

  it('pulls a run back for an open-GOP leading picture', () => {
    const cts = [0, 3, 1, 2, 6, 4, 5]
    const samples: SampleInfo[] = cts.map((c, index) => ({ index, dtsTicks: index, ctsTicks: c, durationTicks: 1, isSync: index === 0 || index === 4, offset: index, size: 1 }))
    const order = [...samples].sort((a, b) => a.ctsTicks - b.ctsTicks)
    const frames: FrameTiming[] = order.map((s, index) => ({ index, sampleIndex: s.index, ctsTicks: s.ctsTicks, tMedia: s.ctsTicks, durationS: 1, isKeyframe: s.isSync }))
    expect(planDecodeSegments(samples, frames, [4], 0)!.segments).toEqual([{ firstSample: 0, lastSample: 5 }])
  })
})
