import { describe, expect, it } from 'vitest'
import { aliasOf, flickerFrom, FLICKER_WARN, LUMA_GRID, lightEvidence, lumaGridFromRgba, type LumaFrame } from './light.ts'

/** The sparse pass's frame choice: every round(fps/4)-th frame, plus every round(fps/15)-th in [a, b] s. */
function sparseFrames(fps: number, durationS: number, a: number, b: number): number[] {
  const coarse = Math.max(1, Math.round(fps / 4))
  const fine = Math.max(1, Math.round(fps / 15))
  const out: number[] = []
  for (let i = 0; i < Math.round(durationS * fps); i++) {
    const t = i / fps
    if (i % coarse === 0 || (t >= a && t <= b && i % fine === 0)) out.push(i)
  }
  return out
}

/** A flat-lit scene whose brightness pulses at 100 Hz by ±amp, seen at `fps` (global shutter, sampled at the frame time). */
function series(fps: number, frames: number[], amp: number, noise = 0.3, seed = 1) {
  let r = seed
  const rand = () => {
    r = (r * 16807) % 2147483647
    return r / 2147483647 - 0.5
  }
  return frames.map((i) => {
    const t = i / fps
    return { frameIndex: i, value: 120 * (1 + amp * Math.sin(2 * Math.PI * 100.2 * t + 0.4)) + noise * rand() + 3 * Math.sin(2 * Math.PI * 0.2 * t) }
  })
}

describe('mains flicker at its alias (CAPTURE cq.flicker; METRICS §3.25)', () => {
  it('aliases 100 Hz as CAPTURE says: 20 Hz at 60 and 120 fps, 10 Hz at 30, 100 Hz at 240, none at 25 or 50; 5 Hz on the 15 Hz fill', () => {
    expect(aliasOf(100, 60)).toBeCloseTo(20)
    expect(aliasOf(100, 120)).toBeCloseTo(20)
    expect(aliasOf(100, 30)).toBeCloseTo(10)
    expect(aliasOf(100, 240)).toBeCloseTo(100)
    expect(aliasOf(100, 25)).toBeCloseTo(0)
    expect(aliasOf(100, 50)).toBeCloseTo(0)
    expect(aliasOf(100, 15)).toBeCloseTo(5)
    expect(aliasOf(100, 4)).toBeCloseTo(0)
  })

  for (const fps of [30, 60, 120, 240]) {
    it(`finds ±10% flicker on the sparse pass at ${fps} fps, and nothing in steady light`, () => {
      const frames = sparseFrames(fps, 8, 2, 6.5)
      const lit = flickerFrom(series(fps, frames, 0.1), fps)!
      expect(lit.amplitude).toBeGreaterThan(0.07)
      expect(lit.amplitude).toBeGreaterThanOrEqual(FLICKER_WARN)
      const steady = flickerFrom(series(fps, frames, 0), fps)!
      expect(steady.amplitude).toBeLessThan(0.01)
    })
  }

  it('cannot see flicker at 25 or 50 fps (every frame at the same phase), and says so (null)', () => {
    expect(flickerFrom(series(50, sparseFrames(50, 8, 2, 6.5), 0.1), 50)).toBeNull()
  })

  it('needs a 2 s run: a clip with only the 4 Hz scan gives no estimate', () => {
    expect(flickerFrom(series(60, sparseFrames(60, 8, 99, 99), 0.1), 60)).toBeNull()
  })
})

function frame(i: number, fill: (r: number, c: number) => number): LumaFrame {
  const grid = new Uint8Array(LUMA_GRID * LUMA_GRID)
  for (let r = 0; r < LUMA_GRID; r++) for (let c = 0; c < LUMA_GRID; c++) grid[r * LUMA_GRID + c] = fill(r, c)
  return { frameIndex: i, tReal: i / 60, grid }
}

describe('court lights by the picture: a dark sky over a lit court', () => {
  const frames = (fill: (r: number, c: number) => number) => sparseFrames(60, 8, 2, 6.5).map((i) => frame(i, fill))
  it('night: sky 6, court 170 → dark', () => {
    const ev = lightEvidence(frames((r) => (r < 6 ? 6 : 170)), { captureFps: 60 })!
    expect(ev.dark).toBe(true)
    expect(ev.flickering).toBe(false)
  })
  it('daylight: bright sky over a darker court → not dark; dusk (bright sky, dim court) → not dark', () => {
    expect(lightEvidence(frames((r) => (r < 6 ? 160 : 100)), { captureFps: 60 })!.dark).toBe(false)
    expect(lightEvidence(frames((r) => (r < 6 ? 110 : 7)), { captureFps: 60 })!.dark).toBe(false)
  })
  it('a dark windbreak above a sunlit court (dim, not black) is not night; floodlights in a black sky do not hide the night', () => {
    // Windbreak luma 45 over a court at 150: below 0.35 of the court, but not near-black.
    expect(lightEvidence(frames((r) => (r < 4 ? 45 : 150)), { captureFps: 60 })!.dark).toBe(false)
    // The darkest daylight top band on the synthetic corpus: a fence filling the top of the low 4.5 m set-up (29 over 94).
    expect(lightEvidence(frames((r) => (r < 4 ? 29 : 94)), { captureFps: 60 })!.dark).toBe(false)
    // Night sky 8 with three floodlight cells at 255 in the top band: the band's median stays black.
    const lamps = lightEvidence(frames((r, c) => (r < 4 ? (r === 1 && c >= 2 && c <= 4 ? 255 : 8) : 170)), { captureFps: 60 })!
    expect(lamps.skyLuma).toBe(8)
    expect(lamps.dark).toBe(true)
    // A dim, evenly lit picture (sky 30, court 60) is not night: under court lights the court is far brighter than the sky.
    expect(lightEvidence(frames((r) => (r < 4 ? 30 : 60)), { captureFps: 60 })!.dark).toBe(false)
  })
  it("leaves the player's box out of the background", () => {
    // A bright player standing in a dark-sky picture: the box is left out, the sky stays dark.
    const ev = lightEvidence(frames((r, c) => (c >= 6 && c <= 9 ? 250 : r < 6 ? 6 : 170)), { captureFps: 60, playerBox: () => ({ x0: 6 / 16, x1: 10 / 16, y0: 0, y1: 1 }) })!
    expect(ev.dark).toBe(true)
    expect(ev.subjectLuma).toBe(250)
  })
  it('needs a few frames', () => {
    expect(lightEvidence([frame(0, () => 100)], { captureFps: 60 })).toBeNull()
  })
})

describe('lumaGridFromRgba', () => {
  it('averages BT.601 luma per cell', () => {
    const w = 32
    const h = 32
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const y = Math.floor(i / w)
      data.set(y < 16 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4)
    }
    const g = lumaGridFromRgba(data, w, h)
    expect(g[0]).toBe(255)
    expect(g[LUMA_GRID * LUMA_GRID - 1]).toBe(0)
  })
})
