import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LM } from '../../../analysis/types.ts'
import type { PoseTrackCompact } from '../../../data/domain.ts'
import { fixtureServe, type PlaybackFixture } from '../../screens/playback/dev/harnessFixture.ts'
import { fitTransform, playerRegion, regionTransform, toBox, type Size, type ViewTransform } from './geometry.ts'
import { labelObstacles, overlapArea, placeLabels, type BoxRect } from './labelPlacement.ts'
import { buildScene, type Prim } from './overlayScene.ts'
import { bodyBoxAt, cropImageStyle, THUMB_CROP_HEIGHTS, thumbCrop } from './thumbCrop.ts'
import { standingRef } from './tracks.ts'

const inside = (r: BoxRect, box: Size) => r.x >= 0 && r.y >= 0 && r.x + r.w <= box.width + 1e-6 && r.y + r.h <= box.height + 1e-6

describe('label placement', () => {
  // A height ruler at x 130 with ticks at 1×, 1.5× and 2× and the "1×" / "2×" graduations to its right,
  // as the toss overlay paints it.
  const box = { width: 390, height: 380 }
  const id = (x: number, y: number) => ({ x, y })
  const ticks: Prim[] = [
    { kind: 'tick', at: { x: 130, y: 269 }, lengthPx: 12, orient: 'h', ink: 'line', width: 2 },
    { kind: 'text', at: { x: 130, y: 269 }, text: '1×', align: 'right', dx: 10 },
    { kind: 'tick', at: { x: 130, y: 216 }, lengthPx: 7, orient: 'h', ink: 'line', width: 2 },
    { kind: 'tick', at: { x: 130, y: 164 }, lengthPx: 12, orient: 'h', ink: 'line', width: 2 },
    { kind: 'text', at: { x: 130, y: 164 }, text: '2×', align: 'right', dx: 10 },
    { kind: 'dot', at: { x: 225, y: 174 }, r: 5, ink: 'ball', ring: true },
  ]
  const obstacles = labelObstacles(ticks, (p) => id(p.x, p.y))

  it('turns ticks, graduations and marker rings into obstacles (lines are not)', () => {
    expect(obstacles).toHaveLength(6)
    const two = obstacles[4]
    // "2×" sits to the right of the tick: it starts past the anchor.
    expect(two.x).toBeGreaterThan(130)
    expect(labelObstacles([{ kind: 'segment', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, ink: 'line', width: 1 }], (p) => p)).toEqual([])
  })

  it('a "Peak ≈ 1.73 × your height" pill never covers the 2× mark or any tick', () => {
    // Peak anchors from just under 2× down to 1.5×, preferring the side of the ruler.
    for (let y = 150; y <= 230; y += 4) {
      const placed = placeLabels([{ id: 'peak', anchor: { x: 225, y }, w: 190, h: 26, side: 'left' }], { box, insetTop: 48, obstacles })
      const r = { ...placed.peak, w: 190, h: 26 }
      for (const o of obstacles) expect(overlapArea(r, o), `anchor y ${y}`).toBe(0)
      expect(inside(r, box)).toBe(true)
      expect(r.y).toBeGreaterThanOrEqual(48)
    }
  })

  it('keeps the preferred side when it is clear, and labels never cover each other or an anchor', () => {
    const placed = placeLabels(
      [
        { id: 'a', anchor: { x: 300, y: 300 }, w: 60, h: 24, side: 'left' },
        { id: 'b', anchor: { x: 300, y: 310 }, w: 60, h: 24, side: 'left' },
      ],
      { box, obstacles: [] },
    )
    expect(placed.a).toEqual({ x: 300 - 10 - 60, y: 300 - 12 })
    const a = { ...placed.a, w: 60, h: 24 }
    const b = { ...placed.b, w: 60, h: 24 }
    expect(overlapArea(a, b)).toBe(0)
    for (const anchor of [{ x: 300, y: 300 }, { x: 300, y: 310 }]) {
      expect(overlapArea(b, { x: anchor.x - 6, y: anchor.y - 6, w: 12, h: 12 })).toBe(0)
    }
  })

  describe('on the real toss overlay (engine output on the synthetic clip baseline-s1)', () => {
    const f = JSON.parse(readFileSync(join(process.cwd(), 'src/ui/screens/playback/dev/fixtures/baseline-s1.json'), 'utf8')) as PlaybackFixture
    const { serve, track } = fixtureServe(f, { sessionId: 'p', index: 1, videoId: 'v', analysedAt: '2026-09-27T00:00:00Z' })
    const clip = { width: f.meta.width, height: f.meta.height }
    const start = serve.window.startFrame
    const standing = standingRef(track.pose, serve.handedness, start, Math.max(start + 1, (serve.events.tossRelease?.frameIndex ?? start + 30) - 1))
    const apex = serve.events.tossApex!.frameIndex
    const scene = buildScene({
      overlay: 'toss',
      frame: apex,
      pose: track.pose,
      ball: track.ball,
      events: serve.events,
      handedness: serve.handedness,
      standing,
      bodyHeightNorm: track.pose!.bodyHeightHU,
      aspect: clip.width / clip.height,
      metrics: serve.metrics,
    })
    const peak = scene.labels.find((l) => l.metric?.id === 'toss-apex-height')
    const check = (t: ViewTransform, b: Size) => {
      const map = (p: { x: number; y: number }) => toBox(t, clip, p.x, p.y)
      const obs = labelObstacles(scene.prims, map)
      // The pill's measured size in the app: "Peak" + "≈ 1.94 × your height" + the compact glyph.
      const placed = placeLabels([{ id: peak!.id, anchor: map(peak!.at), w: 190, h: 26, side: peak!.side }], { box: b, insetTop: 48, obstacles: obs })
      const r = { ...placed[peak!.id], w: 190, h: 26 }
      for (const o of obs) expect(overlapArea(r, o)).toBe(0)
      expect(inside(r, b)).toBe(true)
      return obs
    }

    it('has a ruler with graduations and a Peak label at the apex', () => {
      expect(peak).toBeTruthy()
      expect(scene.prims.some((p) => p.kind === 'text' && p.text === '2×')).toBe(true)
    })

    it('whole frame (390 × 380 box): the Peak pill clears every tick and graduation', () => {
      const b = { width: 390, height: 380 }
      expect(check(fitTransform(clip, b), b).length).toBeGreaterThan(3)
    })

    it('zoomed to the player: the Peak pill still clears them', () => {
      const b = { width: 390, height: 380 }
      const region = playerRegion({ groundY: standing!.groundY, bodyHeightNorm: track.pose!.bodyHeightHU, heightM: 1.8, columnX: standing!.columnX, peakY: 0.2 })
      check(regionTransform(clip, b, region), b)
    })
  })
})

describe('player-cropped key-frame thumbnails', () => {
  /** A standing player 0.27 of the frame tall, feet at y 0.74, centred on x. */
  function pose(frames: number[], x = 0.4, vis = 0.95): PoseTrackCompact {
    const xyv = new Float32Array(frames.length * 33 * 3).fill(Number.NaN)
    frames.forEach((_, i) => {
      const set = (k: number, px: number, py: number) => {
        const o = (i * 33 + k) * 3
        xyv[o] = px
        xyv[o + 1] = py
        xyv[o + 2] = vis
      }
      set(LM.LEFT_EYE, x, 0.49)
      set(LM.RIGHT_EYE, x + 0.005, 0.49)
      set(LM.LEFT_SHOULDER, x - 0.02, 0.53)
      set(LM.RIGHT_SHOULDER, x + 0.02, 0.53)
      set(LM.LEFT_ELBOW, x - 0.03, 0.58)
      set(LM.RIGHT_ELBOW, x + 0.03, 0.58)
      set(LM.LEFT_HIP, x - 0.015, 0.62)
      set(LM.RIGHT_HIP, x + 0.015, 0.62)
      set(LM.LEFT_KNEE, x - 0.015, 0.68)
      set(LM.RIGHT_KNEE, x + 0.015, 0.68)
      set(LM.LEFT_ANKLE, x - 0.015, 0.73)
      set(LM.RIGHT_ANKLE, x + 0.015, 0.73)
      set(LM.LEFT_FOOT_INDEX, x + 0.01, 0.74)
    })
    return { frameIndices: Int32Array.from(frames), xyv, bodyHeightHU: 0.27 } as unknown as PoseTrackCompact
  }
  const portrait = { width: 1080, height: 1920 }
  const thumb = { width: 50, height: 88 }

  it('crops around the tracked body at one scale, with the thumbnail aspect', () => {
    const p = pose([10])
    const box = bodyBoxAt(p, 10)!
    expect(box.h).toBeCloseTo(0.25, 2)
    const c = thumbCrop({ pose: p, frame: 10, bodyHeightNorm: 0.27, clip: portrait, thumb })!
    expect(c.h).toBeCloseTo(THUMB_CROP_HEIGHTS * 0.27, 3)
    expect((c.w * portrait.width) / (c.h * portrait.height)).toBeCloseTo(thumb.width / thumb.height, 3)
    // The body is inside the crop, and the player fills far more of it than of the frame.
    expect(c.x).toBeLessThanOrEqual(box.x)
    expect(c.x + c.w).toBeGreaterThanOrEqual(box.x + box.w)
    expect(c.y).toBeLessThanOrEqual(box.y)
    expect(c.y + c.h).toBeGreaterThanOrEqual(box.y + box.h)
    expect(0.27 / c.h).toBeGreaterThan(0.6)
  })

  it('stays inside the frame near an edge', () => {
    const c = thumbCrop({ pose: pose([10], 0.02), frame: 10, bodyHeightNorm: 0.27, clip: portrait, thumb })!
    expect(c.x).toBe(0)
    expect(c.x + c.w).toBeLessThanOrEqual(1)
  })

  it('falls back to the whole frame when the body is not tracked or barely seen', () => {
    expect(thumbCrop({ pose: pose([10]), frame: 99, bodyHeightNorm: 0.27, clip: portrait, thumb })).toBeNull()
    expect(thumbCrop({ pose: pose([10], 0.4, 0.2), frame: 10, bodyHeightNorm: 0.27, clip: portrait, thumb })).toBeNull()
    expect(thumbCrop({ pose: undefined, frame: 10, bodyHeightNorm: 0.27, clip: portrait, thumb })).toBeNull()
    // A player filling the frame: cropping would gain nothing.
    expect(thumbCrop({ pose: pose([10]), frame: 10, bodyHeightNorm: 0.7, clip: portrait, thumb })).toBeNull()
  })

  it('positions the image so the crop fills the thumbnail, also from a stored crop', () => {
    const crop = { x: 0.25, y: 0.4, w: 0.2, h: 0.4 }
    const s = cropImageStyle(crop, undefined, thumb)
    expect(s.width).toBeCloseTo(250)
    expect(s.height).toBeCloseTo(220)
    expect(s.left).toBeCloseTo(-62.5)
    expect(s.top).toBeCloseTo(-88)
    // The stored image is itself the left half of the frame.
    const half = cropImageStyle(crop, { x: 0, y: 0, w: 0.5, h: 1 }, thumb)
    expect(half.width).toBeCloseTo(125)
    expect(half.left).toBeCloseTo(-62.5)
  })
})
