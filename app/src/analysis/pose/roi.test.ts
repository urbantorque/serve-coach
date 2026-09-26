import { describe, expect, it } from 'vitest'
import { LM, type Landmark } from '../types.ts'
import { kneeFlexionDeg, trunkInclinationDeg } from './body.ts'
import { applyPoseNoise } from './injected.ts'
import { mulberry32 } from './rng.ts'
import {
  DEFAULT_ROI_OPTIONS,
  RoiController,
  bodyExtentPx,
  coveredFraction,
  cropLandmarkToFrame,
  frameLandmarkToCrop,
  localisationTiles,
  minCropSide,
  squareCropInFrame,
  tileOffsets,
  type FrameSize,
  type PixelRect,
} from './roi.ts'
import { buildServeFixture } from './servePoseFixture.ts'

const PORTRAIT: FrameSize = { width: 1080, height: 1920 }
const LANDSCAPE: FrameSize = { width: 1920, height: 1080 }

describe('crop -> frame landmark mapping', () => {
  it('maps a known point exactly, including z (scaled by crop width / frame width)', () => {
    const crop: PixelRect = { x: 300, y: 700, width: 480, height: 480 }
    const out = cropLandmarkToFrame({ x: 0.5, y: 0.25, z: 0.1, visibility: 0.8 }, crop, PORTRAIT)
    expect(out.x).toBeCloseTo((300 + 240) / 1080, 15)
    expect(out.y).toBeCloseTo((700 + 120) / 1920, 15)
    expect(out.z).toBeCloseTo((0.1 * 480) / 1080, 15)
    expect(out.visibility).toBe(0.8)
  })

  it('round-trips random landmarks through random crops (square and clamped rectangles, both orientations)', () => {
    const rng = mulberry32(42)
    for (const frame of [PORTRAIT, LANDSCAPE, { width: 720, height: 720 }]) {
      for (let k = 0; k < 200; k++) {
        const width = 1 + Math.floor(rng() * frame.width)
        const height = k % 2 === 0 ? Math.min(frame.height, width) : 1 + Math.floor(rng() * frame.height)
        const crop = { x: Math.floor(rng() * (frame.width - width + 1)), y: Math.floor(rng() * (frame.height - height + 1)), width, height }
        const truth: Landmark = { x: rng() * 1.4 - 0.2, y: rng() * 1.4 - 0.2, z: rng() - 0.5, visibility: rng() }
        // What a detector that saw only the crop would report, mapped back to the frame.
        const back = cropLandmarkToFrame(frameLandmarkToCrop(truth, crop, frame), crop, frame)
        expect(Math.abs(back.x - truth.x)).toBeLessThan(1e-12)
        expect(Math.abs(back.y - truth.y)).toBeLessThan(1e-12)
        expect(Math.abs(back.z! - truth.z!)).toBeLessThan(1e-12)
      }
    }
  })

  it('preserves pixel distances in both axes (no aspect distortion) for square and rectangular crops', () => {
    for (const crop of [
      { x: 100, y: 900, width: 400, height: 400 },
      { x: 0, y: 200, width: 1080, height: 1500 }, // a square clamped to the portrait width
    ]) {
      const a = cropLandmarkToFrame({ x: 0.2, y: 0.3, visibility: 1 }, crop, PORTRAIT)
      const b = cropLandmarkToFrame({ x: 0.7, y: 0.3, visibility: 1 }, crop, PORTRAIT)
      const c = cropLandmarkToFrame({ x: 0.2, y: 0.8, visibility: 1 }, crop, PORTRAIT)
      expect((b.x - a.x) * PORTRAIT.width).toBeCloseTo(0.5 * crop.width, 9)
      expect((c.y - a.y) * PORTRAIT.height).toBeCloseTo(0.5 * crop.height, 9)
    }
  })

  it('gives the same joint angles as the full-frame pose after mapping back', () => {
    const fixture = buildServeFixture({ fps: 30, view: 'side', frameAspect: 9 / 16, heightHU: 0.15, floorY: 0.7 })
    const crop = { x: 250, y: 950, width: 500, height: 500 }
    for (const frame of fixture.frames.filter((_, i) => i % 5 === 0)) {
      const truth = frame.landmarks!
      // The detector's view of the crop is anisotropic in normalised units (square crop, 9:16 frame)...
      const inCrop = truth.map((lm) => frameLandmarkToCrop(lm, crop, PORTRAIT))
      const mapped = inCrop.map((lm) => cropLandmarkToFrame(lm, crop, PORTRAIT))
      // ...but after mapping, angles computed with the frame aspect match the truth exactly.
      expect(kneeFlexionDeg(mapped, 'right', 9 / 16)).toBeCloseTo(kneeFlexionDeg(truth, 'right', 9 / 16)!, 9)
      expect(trunkInclinationDeg(mapped, 9 / 16)!.deg).toBeCloseTo(trunkInclinationDeg(truth, 9 / 16)!.deg, 9)
      // A square crop is isotropic, so the crop-space angle (aspect 1) also matches.
      expect(kneeFlexionDeg(inCrop, 'right', 1)).toBeCloseTo(kneeFlexionDeg(truth, 'right', 9 / 16)!, 9)
    }
  })
})

describe('square crops', () => {
  it('centres an integer square inside the frame', () => {
    expect(squareCropInFrame(540, 960, 400, PORTRAIT)).toEqual({ x: 340, y: 760, width: 400, height: 400 })
  })

  it('moves (does not shrink) a square that would cross the frame edge', () => {
    expect(squareCropInFrame(50, 1900, 400, PORTRAIT)).toEqual({ x: 0, y: 1520, width: 400, height: 400 })
  })

  it('clamps a side larger than a frame dimension to that dimension', () => {
    const r = squareCropInFrame(540, 960, 1500, PORTRAIT)
    expect(r).toEqual({ x: 0, y: 210, width: 1080, height: 1500 })
    expect(squareCropInFrame(540, 960, 5000, PORTRAIT)).toEqual({ x: 0, y: 0, width: 1080, height: 1920 })
  })

  it('computes covered fractions', () => {
    expect(coveredFraction({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 })).toBeCloseTo(0.5, 12)
  })
})

describe('localisation tiles', () => {
  it('spreads offsets evenly with at least the requested overlap', () => {
    expect(tileOffsets(1920, 1080, 1 / 3)).toEqual([0, 420, 840])
    expect(tileOffsets(1080, 1080, 1 / 3)).toEqual([0])
    const offsets = tileOffsets(1920, 540, 1 / 3)
    for (let i = 1; i < offsets.length; i++) expect(offsets[i] - offsets[i - 1]).toBeLessThanOrEqual(540 * (2 / 3) + 1)
    expect(offsets.at(-1)).toBe(1920 - 540)
  })

  it('plans full frame, then short-side squares, then half squares (portrait and landscape)', () => {
    expect(localisationTiles(PORTRAIT, 0)).toEqual([{ x: 0, y: 0, width: 1080, height: 1920 }])
    expect(localisationTiles(PORTRAIT, 1)).toEqual([0, 420, 840].map((y) => ({ x: 0, y, width: 1080, height: 1080 })))
    expect(localisationTiles(LANDSCAPE, 1).map((t) => t.x)).toEqual([0, 420, 840])
    expect(localisationTiles({ width: 720, height: 720 }, 1)).toEqual([])
    const level2 = localisationTiles(PORTRAIT, 2)
    expect(level2.every((t) => t.width === 540 && t.height === 540)).toBe(true)
    expect(level2).toHaveLength(15)
  })

  it('contains every span no longer than the tile overlap inside one tile (660 px at level 1 of 9:16)', () => {
    const inOneTile = (tiles: PixelRect[], top: number, span: number) => tiles.some((t) => t.y <= top && t.y + t.height >= top + span)
    const level1 = localisationTiles(PORTRAIT, 1)
    for (let top = 0; top + 660 <= 1920; top += 7) expect(inOneTile(level1, top, 660)).toBe(true)
    expect(inOneTile(level1, 364, 720)).toBe(false) // the guarantee really is the overlap
    const level2 = localisationTiles(PORTRAIT, 2)
    for (let top = 0; top + 180 <= 1920; top += 7) expect(inOneTile(level2, top, 180)).toBe(true) // >= 1/3 of 540
  })
})

/** Serve fixture poses translated/scaled into a portrait frame (normalised landmarks). */
function serve(options: { heightHU: number; floorY: number; view?: 'side' | 'rear'; fps?: number; centreX?: number }) {
  return buildServeFixture({ fps: options.fps ?? 30, view: options.view ?? 'side', frameAspect: 9 / 16, heightHU: options.heightHU, floorY: options.floorY, centreX: options.centreX })
}

function containsAll(crop: PixelRect, landmarks: readonly Landmark[], frame: FrameSize, marginPx: number): boolean {
  return landmarks.every((lm) => {
    const x = lm.x * frame.width
    const y = lm.y * frame.height
    const insideFrameX = x >= 0 && x <= frame.width
    const insideFrameY = y >= 0 && y <= frame.height
    // Points outside the frame cannot be in any crop; only require what the frame allows.
    const okX = !insideFrameX || (x >= crop.x + Math.min(marginPx, x) && x <= crop.x + crop.width - Math.min(marginPx, frame.width - x))
    const okY = !insideFrameY || (y >= crop.y + Math.min(marginPx, y) && y <= crop.y + crop.height - Math.min(marginPx, frame.height - y))
    return okX && okY
  })
}

/** Runs the controller as the pipelined source does: the crop for frame n sees observations up to n - lag. */
function runController(frames: ReadonlyArray<{ tReal: number; landmarks: Landmark[] | null }>, frame: FrameSize, lag = 2) {
  const roi = new RoiController(frame)
  roi.start(frames[0].landmarks!, frames[0].tReal)
  const crops: PixelRect[] = []
  for (let n = 0; n < frames.length; n++) {
    if (n - lag >= 1) roi.observe(frames[n - lag].landmarks, frames[n - lag].tReal)
    crops.push(roi.cropFor(frames[n].tReal)!)
  }
  return { crops, roi }
}

describe('bodyExtentPx', () => {
  it('estimates the stature within 10% and bounds the head and feet', () => {
    const fixture = serve({ heightHU: 0.15, floorY: 0.7 })
    const lms = fixture.frames[0].landmarks!
    const extent = bodyExtentPx(lms, PORTRAIT)!
    expect(extent.staturePx / (0.15 * 1920)).toBeGreaterThan(0.9)
    expect(extent.staturePx / (0.15 * 1920)).toBeLessThan(1.1)
    expect(extent.top).toBeLessThan(lms[LM.NOSE].y * 1920)
    expect(extent.bottom).toBeGreaterThanOrEqual(lms[LM.LEFT_ANKLE].y * 1920)
  })

  it('returns null without both shoulders and hips', () => {
    const lms = serve({ heightHU: 0.3, floorY: 0.8 }).frames[0].landmarks!.map((lm, i) => (i === LM.LEFT_HIP ? { ...lm, visibility: 0 } : lm))
    expect(bodyExtentPx(lms, PORTRAIT)).toBeNull()
  })
})

describe('RoiController', () => {
  for (const view of ['side', 'rear'] as const) {
    for (const heightHU of [0.15, 0.22, 0.4]) {
      it(`keeps every landmark (raised hand at contact included) inside the crop, ${view} view, player ${heightHU} of frame height, 2-frame lag`, () => {
        const fixture = serve({ heightHU, floorY: 0.72, view })
        const { crops } = runController(fixture.frames, PORTRAIT)
        const margin = 0.05 * heightHU * 1920
        fixture.frames.forEach((f, n) => expect(containsAll(crops[n], f.landmarks!, PORTRAIT, margin), `frame ${n}`).toBe(true))
      })
    }
  }

  it('makes the player fill a large part of the crop (the point of cropping)', () => {
    const fixture = serve({ heightHU: 0.147, floorY: 0.72 }) // ~282 px of 1920: a 12 m player in the feasibility renders
    const { crops } = runController(fixture.frames, PORTRAIT)
    for (const crop of crops) {
      const fill = (0.147 * 1920) / Math.max(crop.width, crop.height)
      expect(fill).toBeGreaterThan(0.5)
      expect(fill).toBeLessThan(0.7)
    }
  })

  it('does not jitter: noisy landmarks of a standing player leave the crop unchanged', () => {
    const fixture = serve({ heightHU: 0.2, floorY: 0.72 })
    const standing = fixture.frames.slice(0, 30) // the first second is the setup (no motion)
    const noisy = applyPoseNoise(standing, { seed: 3, jitterSigmaBodyHeights: 0.01, frameDropoutProb: 0, landmarkDropoutProb: 0, swapProb: 0 }, { frameAspect: 9 / 16 }).frames
    const { crops } = runController(noisy, PORTRAIT)
    const changes = crops.slice(1).filter((c, i) => JSON.stringify(c) !== JSON.stringify(crops[i])).length
    expect(changes).toBe(0)
  })

  it('moves rarely and smoothly during the serve (deadband + glide), not every frame', () => {
    const fixture = serve({ heightHU: 0.2, floorY: 0.72 })
    const { crops } = runController(fixture.frames, PORTRAIT)
    const steps = crops.slice(1).map((c, i) => Math.hypot(c.x - crops[i].x, c.y - crops[i].y))
    const moving = steps.filter((s) => s > 0).length
    expect(moving / steps.length).toBeLessThan(0.35)
    const side = crops[0].width
    expect(Math.max(...steps)).toBeLessThan(0.1 * side)
  })

  it('follows a player walking across the frame at ~1.6 m/s', () => {
    const base = serve({ heightHU: 0.2, floorY: 0.72, centreX: 0.2 })
    const statureNorm = (0.2 * 1920) / 1080 // one stature in normalised x
    const frames = base.frames.map((f) => ({
      tReal: f.tReal,
      landmarks: f.landmarks!.map((lm) => ({ ...lm, x: lm.x + 0.9 * statureNorm * f.tReal })), // 0.9 statures/s
    }))
    const { crops } = runController(frames.slice(0, 75), PORTRAIT)
    frames.slice(0, 75).forEach((f, n) => expect(containsAll(crops[n], f.landmarks, PORTRAIT, 0), `frame ${n}`).toBe(true))
  })

  it('grows while the player is missing, then asks for localisation', () => {
    const fixture = serve({ heightHU: 0.2, floorY: 0.72 })
    const roi = new RoiController(PORTRAIT)
    roi.start(fixture.frames[0].landmarks!, 0)
    const before = roi.cropFor(0.1)!
    roi.observe(null, 0.1)
    const during = roi.cropFor(0.3)!
    expect(during.width).toBeGreaterThan(before.width)
    expect(roi.state).toBe('tracking')
    roi.observe(null, 0.1 + DEFAULT_ROI_OPTIONS.relocaliseAfterS)
    expect(roi.state).toBe('searching')
    expect(roi.cropFor(0.6)).toBeNull()
    expect(roi.shouldSearch(0.6)).toBe(true)
    roi.markSearched(0.6)
    expect(roi.shouldSearch(0.7)).toBe(false)
    expect(roi.shouldSearch(0.6 + DEFAULT_ROI_OPTIONS.searchIntervalS)).toBe(true)
  })

  it('backs off while nobody is found (0.25, 0.5, 1, 1 s) and returns to the base interval after a success', () => {
    const fixture = serve({ heightHU: 0.2, floorY: 0.72 })
    const roi = new RoiController(PORTRAIT)
    const intervals: number[] = []
    let t = 0
    for (let k = 0; k < 4; k++) {
      roi.markSearched(t) // nobody found
      intervals.push(roi.searchIntervalS())
      t += roi.searchIntervalS()
      expect(roi.shouldSearch(t - 0.01)).toBe(false)
      expect(roi.shouldSearch(t)).toBe(true)
    }
    expect(intervals).toEqual([0.25, 0.5, 1, 1])
    roi.start(fixture.frames[0].landmarks!, t)
    roi.markSearched(t) // found
    roi.observe(null, t + 0.1)
    roi.observe(null, t + 0.1 + DEFAULT_ROI_OPTIONS.relocaliseAfterS) // lost again: searching restarts at the base interval
    expect(roi.state).toBe('searching')
    expect(roi.searchIntervalS()).toBe(0.25)
  })

  it('respects the minimum crop size and stays inside the frame near its edges', () => {
    const tiny = serve({ heightHU: 0.03, floorY: 0.99, centreX: 0.02 })
    const { crops } = runController(tiny.frames, PORTRAIT)
    for (const c of crops) {
      expect(c.width).toBeGreaterThanOrEqual(Math.floor(minCropSide(PORTRAIT, DEFAULT_ROI_OPTIONS)))
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(1080)
      expect(c.y + c.height).toBeLessThanOrEqual(1920)
    }
  })

  it('keeps crops square whenever they fit in the frame', () => {
    const fixture = serve({ heightHU: 0.3, floorY: 0.8 })
    const { crops } = runController(fixture.frames, PORTRAIT)
    for (const c of crops) expect(c.width).toBe(c.height)
  })
})
