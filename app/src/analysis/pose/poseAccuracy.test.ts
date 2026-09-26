import { describe, expect, it } from 'vitest'
import { LM, type Landmark } from '../types.ts'
import { MIRROR_INDEX } from './landmarks.ts'
import { scorePoseAccuracy } from './poseAccuracy.ts'
import { buildServeFixture } from './servePoseFixture.ts'

const W = 1080
const H = 1920
const fixture = buildServeFixture({ fps: 30, view: 'rear', frameAspect: W / H, heightHU: 0.2, floorY: 0.72 })
const staturePx = 0.2 * H
const truth = fixture.frames.map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, landmarks: f.landmarks }))
const options = { frameWidth: W, frameHeight: H, staturePx }

describe('scorePoseAccuracy', () => {
  it('scores a perfect prediction as zero error, full PCK and detection', () => {
    const s = scorePoseAccuracy(fixture.frames, truth, options)
    expect(s.detectionRate).toBe(1)
    expect(s.onTargetRate).toBe(1)
    expect(s.meanErrorBH).toBe(0)
    expect(s.pck).toBe(1)
    expect(s.mirroredRate).toBe(0)
  })

  it('measures errors in statures from pixels, in both axes', () => {
    const shiftX = (0.05 * staturePx) / W // 0.05 statures to the right
    const shiftY = (0.05 * staturePx) / H // 0.05 statures down
    for (const [dx, dy] of [[shiftX, 0], [0, shiftY]]) {
      const pred = fixture.frames.map((f) => ({ ...f, landmarks: f.landmarks!.map((lm) => ({ ...lm, x: lm.x + dx, y: lm.y + dy })) }))
      const s = scorePoseAccuracy(pred, truth, options)
      expect(s.meanErrorBH).toBeCloseTo(0.05, 12)
      expect(s.pck).toBe(1)
      expect(scorePoseAccuracy(pred, truth, { ...options, pckThresholdBH: 0.04 }).pck).toBe(0)
    }
  })

  it('counts missing frames against detection and end-to-end PCK only', () => {
    const pred = fixture.frames.map((f, i) => ({ ...f, landmarks: i % 4 === 0 ? null : f.landmarks }))
    const s = scorePoseAccuracy(pred.filter((p) => p.landmarks !== null) as { frameIndex: number; landmarks: Landmark[] }[], truth, options)
    const expected = 1 - Math.ceil(fixture.frames.length / 4) / fixture.frames.length
    expect(s.detectionRate).toBeCloseTo(expected, 12)
    expect(s.pck).toBe(1)
    expect(s.pckAllFrames).toBeCloseTo(expected, 12)
  })

  it('flags a whole-body left/right mirror and forgives it only in the tolerant error', () => {
    const pred = fixture.frames.map((f) => ({ ...f, landmarks: f.landmarks!.map((_, i, all) => all[MIRROR_INDEX[i]]) }))
    const s = scorePoseAccuracy(pred, truth, options)
    expect(s.mirroredRate).toBeGreaterThan(0.9) // rear view: left and right are apart
    expect(s.meanErrorBHMirrorTolerant).toBeCloseTo(0, 12)
    expect(s.meanErrorBH).toBeGreaterThan(0.05)
  })

  it('scores the hitting wrist inside a window', () => {
    const contactT = fixture.contactT
    const pred = fixture.frames.map((f) => ({
      ...f,
      landmarks: f.landmarks!.map((lm, i) => (i === LM.RIGHT_WRIST ? { ...lm, y: lm.y + (0.1 * staturePx) / H } : lm)),
    }))
    const s = scorePoseAccuracy(pred, truth, { ...options, wristWindow: { wrist: LM.RIGHT_WRIST, startS: contactT - 0.1, endS: contactT + 0.1 } })
    expect(s.wristWindowFrames).toBe(7)
    expect(s.wristWindowDetected).toBe(7)
    expect(s.wristWindowErrorBH).toBeCloseTo(0.1, 12)
  })
})
