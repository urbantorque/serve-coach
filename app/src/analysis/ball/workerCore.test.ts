import { describe, expect, it } from 'vitest'
import type { ImageDataLike } from '../types.ts'
import { ballAt, createScene, LIGHTING } from './testing/synthFrames.ts'
import { analyseWindow, BallWindowProcessor, candidateToFrame, roiToCrop, unionRoi, type NormRect, type WindowBallConfig } from './workerCore.ts'

const W = 360
const H = 640
const G_PX = 9.81 * 160

function cropImage(image: ImageDataLike, crop: NormRect): ImageDataLike {
  const sx = Math.floor(crop.x * image.width)
  const sy = Math.floor(crop.y * image.height)
  const sw = Math.round(crop.w * image.width)
  const sh = Math.round(crop.h * image.height)
  const data = new Uint8ClampedArray(sw * sh * 4)
  for (let y = 0; y < sh; y++) {
    const from = ((sy + y) * image.width + sx) * 4
    data.set(image.data.subarray(from, from + sw * 4), y * sw * 4)
  }
  return { width: sw, height: sh, data }
}

describe('coordinate mapping', () => {
  it('maps regions into a crop and candidates back to the full frame', () => {
    const crop = { x: 0.25, y: 0, w: 0.5, h: 0.8 }
    expect(roiToCrop({ x0: 0.25, y0: 0, x1: 0.5, y1: 0.4 }, crop)).toEqual({ x0: 0, y0: 0, x1: 0.5, y1: 0.5 })
    expect(roiToCrop({ x0: 0.8, y0: 0, x1: 0.9, y1: 1 }, crop)).toBeUndefined()
    const c = candidateToFrame({ x: 0.5, y: 0.5, radiusNorm: 0.01, streakLengthNorm: 0.02, score: 1 }, crop)
    expect(c).toMatchObject({ x: 0.5, y: 0.4, score: 1 })
    expect(c.radiusNorm).toBeCloseTo(0.008)
    expect(c.streakLengthNorm).toBeCloseTo(0.016)
    expect(unionRoi(undefined, { x0: 0, y0: 0, x1: 1, y1: 1 })).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 })
  })
})

describe('BallWindowProcessor', () => {
  it('search phases follow the provisional contact', () => {
    const config: WindowBallConfig = { crop: { x: 0, y: 0, w: 1, h: 1 }, frameAspect: 9 / 16, tossRoi: null, corridor: null, provisionalContactT: 2, contactUncertaintyS: 0.1, cameraView: 'side' }
    const p = new BallWindowProcessor(config)
    expect(p.phaseAt(1.5)).toBe('toss')
    expect(p.phaseAt(1.95)).toBe('transition')
    expect(p.phaseAt(2.2)).toBe('outgoing')
    expect(new BallWindowProcessor({ ...config, provisionalContactT: undefined }).phaseAt(2.2)).toBe('open')
  })

  it('detects a rising ball in a crop and reports full-frame coordinates', () => {
    const scene = createScene({ width: W, height: H, seed: 7, upper: 'sky', lower: 'hardcourt', horizonY: 0.5, lighting: LIGHTING.sun, noiseSigma: 3 })
    const crop = { x: 0.25, y: 0, w: 0.5, h: 0.8 }
    const radiusPx = 6
    const path = (t: number) => ({ x: 170, y: 420 - 700 * t + 0.5 * G_PX * t * t })
    const processor = new BallWindowProcessor({
      crop,
      frameAspect: W / H,
      expectedRadiusNorm: radiusPx / H,
      tossRoi: { x0: 0.3, y0: 0, x1: 0.7, y1: 0.75 },
      corridor: null,
      provisionalContactT: 2,
      contactUncertaintyS: 0.1,
      cameraView: 'side',
    })
    const errors: number[] = []
    for (let f = 0; f < 40; f++) {
      const t = f / 60
      const ball = ballAt(path, t, 1 / 240, radiusPx)
      const full = scene.render(ball, [], 100 + f)
      const found = processor.process({ frameIndex: f, tReal: t, image: cropImage(full, crop) })
      if (f > 0 && found.candidates[0]) errors.push(Math.hypot(found.candidates[0].x * W - ball.x, found.candidates[0].y * H - ball.y))
    }
    expect(errors.length).toBeGreaterThan(30)
    errors.sort((a, b) => a - b)
    expect(errors[Math.floor(errors.length / 2)]).toBeLessThan(1.5)
    expect(processor.results()).toHaveLength(40)
    expect(processor.detectMs).toBeGreaterThan(0)
  })
})

describe('analyseWindow', () => {
  it('returns a structured-clone-safe result even with no detections', () => {
    const result = analyseWindow(3, [], {
      setup: { aspect: 9 / 16, scale: null, expectedRadiusNorm: undefined, body: null },
      captureFps: 60,
      timeBaseKnown: false,
      cameraView: 'side',
    })
    expect(result.windowId).toBe(3)
    expect(result.tracks).toEqual([])
    expect(result.metrics.find((m) => m.id === 'spin')?.status).toBe('unavailable')
    expect(() => structuredClone(result)).not.toThrow()
  })
})
