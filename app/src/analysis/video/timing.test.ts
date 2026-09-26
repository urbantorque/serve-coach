import { describe, expect, it } from 'vitest'
import { analyzeFrameTiming, buildFrameTable, editMapping, nearestStandardFps, rateSegments, type SampleInfo } from './timing.ts'

/** Synthetic sample table: frame k presented at ptsTicks[k]; decode order = given order. */
function samplesFrom(ctsTicks: number[], durationTicks: number, syncEvery = 30): SampleInfo[] {
  return ctsTicks.map((cts, index) => ({
    index,
    dtsTicks: index * durationTicks,
    ctsTicks: cts,
    durationTicks,
    isSync: index % syncEvery === 0,
    offset: index * 1000,
    size: 1000,
  }))
}

const times = (n: number, fps: number, t0 = 0) => Array.from({ length: n }, (_, i) => t0 + i / fps)

describe('analyzeFrameTiming', () => {
  it.each([24, 25, 30, 60, 120, 240])('reports %i fps constant-rate timelines exactly', (fps) => {
    const stats = analyzeFrameTiming(times(200, fps), 1 / 90000)
    expect(stats.nominalFps).toBeCloseTo(fps, 6)
    expect(stats.isVariableFrameRate).toBe(false)
    expect(stats.droppedFrameEstimate).toBe(0)
    expect(stats.segments).toHaveLength(1)
  })

  it('recovers 29.97 fps from timescale-600 ticks that alternate 20/21', () => {
    // 1001/30000 s per frame quantised to 1/600 s ticks.
    const t = Array.from({ length: 300 }, (_, i) => Math.round((i * 1001 * 600) / 30000) / 600)
    const stats = analyzeFrameTiming(t, 1 / 600)
    expect(stats.nominalFps).toBeCloseTo(30000 / 1001, 1)
    expect(stats.isVariableFrameRate).toBe(false) // one-tick jitter is not VFR
  })

  it('counts dropped frames without calling the clip VFR segments', () => {
    const t = times(120, 60).filter((_, i) => i !== 40 && i !== 41 && i !== 90)
    const stats = analyzeFrameTiming(t, 1 / 15360)
    expect(stats.nominalFps).toBeCloseTo(60, 6)
    expect(stats.droppedFrameEstimate).toBe(3)
    expect(stats.segments).toHaveLength(1)
    expect(stats.meanFps).toBeLessThan(60)
  })

  it('flags jittery phone timestamps as VFR', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
    const t: number[] = [0]
    for (let i = 1; i < 300; i++) t.push(t[i - 1] + (1 / 30) * (0.8 + 0.4 * rand()))
    const stats = analyzeFrameTiming(t, 1 / 600)
    expect(stats.isVariableFrameRate).toBe(true)
    expect(stats.nominalFps).toBeGreaterThan(27)
    expect(stats.nominalFps).toBeLessThan(33)
  })

  it('splits a 240 -> 30 -> 240 ramp into three rate segments', () => {
    const t: number[] = []
    let now = 0
    for (let i = 0; i < 60; i++) t.push((now += 1 / 240))
    for (let i = 0; i < 90; i++) t.push((now += 1 / 30))
    for (let i = 0; i < 60; i++) t.push((now += 1 / 240))
    const stats = analyzeFrameTiming(t, 1 / 600000)
    expect(stats.segments.map((s) => Math.round(s.fps))).toEqual([240, 30, 240])
    expect(stats.isVariableFrameRate).toBe(true)
  })

  it('handles degenerate inputs', () => {
    expect(analyzeFrameTiming([]).frameCount).toBe(0)
    expect(Number.isNaN(analyzeFrameTiming([0]).nominalFps)).toBe(true)
    expect(rateSegments([])).toEqual([])
  })
})

describe('edit lists and the presentation frame table', () => {
  it('removes the B-frame composition offset (ffmpeg style media_time)', () => {
    // Decode order I P B B P B B with cts offsets, timescale 15360, 60 fps (256 ticks per frame).
    // Presentation grid is 512 + k * 256; decode order I P B B P B B.
    const cts = [512, 1280, 768, 1024, 2048, 1536, 1792]
    const samples = samplesFrom(cts, 256)
    const mapping = editMapping([{ segmentDurationS: 7 / 60, mediaTimeTicks: 512, mediaRate: 1 }], 15360, 512)
    const frames = buildFrameTable(samples, 15360, mapping)
    expect(frames.map((f) => f.tMedia)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => (i * 256) / 15360))
    expect(frames.map((f) => f.sampleIndex)).toEqual([0, 2, 3, 1, 5, 6, 4])
  })

  it('drops samples before the edit start and after its end', () => {
    const samples = samplesFrom(times(20, 30).map((t) => Math.round(t * 600)), 20)
    const mapping = editMapping([{ segmentDurationS: 0.25, mediaTimeTicks: 100, mediaRate: 1 }], 600, 0)
    const frames = buildFrameTable(samples, 600, mapping)
    expect(frames[0].sampleIndex).toBe(5)
    expect(frames[0].tMedia).toBe(0)
    expect(frames).toHaveLength(8) // 0.25 s at 30 fps
  })

  it('shifts by a leading empty edit', () => {
    const mapping = editMapping(
      [
        { segmentDurationS: 0.5, mediaTimeTicks: -1, mediaRate: 1 },
        { segmentDurationS: 1, mediaTimeTicks: 0, mediaRate: 1 },
      ],
      600,
      0,
    )
    expect(mapping.presentationOffsetS).toBe(0.5)
    const frames = buildFrameTable(samplesFrom([0, 20, 40], 20), 600, mapping)
    expect(frames[0].tMedia).toBe(0.5)
  })

  it('warns on multi-edit and rate-remapped lists instead of trusting them', () => {
    const multi = editMapping(
      [
        { segmentDurationS: 1, mediaTimeTicks: 0, mediaRate: 1 },
        { segmentDurationS: 1, mediaTimeTicks: 1200, mediaRate: 1 },
      ],
      600,
      0,
    )
    expect(multi.mediaEditCount).toBe(2)
    expect(multi.warnings.length).toBe(1)
    const slow = editMapping([{ segmentDurationS: 8, mediaTimeTicks: 0, mediaRate: 0.125 }], 600, 0)
    expect(slow.rate).toBe(0.125)
    expect(slow.mediaEndTicks).toBe(600) // 8 s of movie time covers 1 s of media
    expect(slow.warnings[0]).toMatch(/rate 0.125/)
  })

  it('uses the first sample when there is no edit list', () => {
    const mapping = editMapping([], 600, 40)
    expect(mapping.mediaStartTicks).toBe(40)
    expect(mapping.mediaEndTicks).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('nearestStandardFps', () => {
  it('labels common rates and refuses odd ones', () => {
    expect(nearestStandardFps(59.94)).toBe(59.94)
    expect(nearestStandardFps(239.5)).toBe(240)
    expect(nearestStandardFps(41)).toBeNull()
  })
})
