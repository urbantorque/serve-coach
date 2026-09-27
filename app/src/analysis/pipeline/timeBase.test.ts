import { describe, expect, it } from 'vitest'
import type { VideoMeta } from '../types.ts'
import { applyGravityCheck, resolveTimeBase } from './timeBase.ts'

function meta(nominalFps: number, extra: Partial<VideoMeta> = {}): VideoMeta {
  return {
    fileName: 'clip.mp4',
    durationMediaS: 10,
    width: 1080,
    height: 1920,
    rotationDeg: 0,
    hasAudio: true,
    nominalFps,
    captureFps: nominalFps,
    timeScale: 1,
    fpsSource: 'timestamps',
    isVariableFrameRate: false,
    frameCount: nominalFps * 10,
    timeBaseStatus: 'unknown',
    ...extra,
  }
}

describe('resolveTimeBase', () => {
  it('applies a player-confirmed slow-motion rate, but never as a proven time base (CAPTURE §11.3)', () => {
    const d = resolveTimeBase(meta(30), { fpsOverride: 240 })
    expect(d.status).toBe('user')
    expect(d.meta.captureFps).toBe(240)
    expect(d.meta.timeScale).toBeCloseTo(0.125)
    expect(d.meta.fpsSource).toBe('user')
    // Only container evidence proves a time base; the engine checks the answer against the toss.
    expect(d.meta.timeBaseStatus).toBe('unknown')
  })

  it('treats a declared rate equal to the timeline as real time', () => {
    const d = resolveTimeBase(meta(240), { fpsOverride: 240 })
    expect(d.meta.timeScale).toBe(1)
    expect(d.status).toBe('user')
    expect(d.meta.timeBaseStatus).toBe('unknown')
  })

  it('keeps a container-proven time base when the declared rate agrees with it', () => {
    const d = resolveTimeBase(meta(240, { timeBaseStatus: 'proven' }), { fpsOverride: 240 })
    expect(d.status).toBe('proven')
    expect(d.meta).toMatchObject({ timeBaseStatus: 'proven', fpsSource: 'timestamps', timeScale: 1 })
  })

  it('ignores a declared rate below the timeline rate (fast motion is not a serve recording)', () => {
    const d = resolveTimeBase(meta(60), { fpsOverride: 30 })
    expect(d.status).toBe('unknown')
    expect(d.notes.join(' ')).toMatch(/ignored/)
  })

  it('uses the import slow-motion answer only when the container did not prove the rate', () => {
    expect(resolveTimeBase(meta(30), { slowMotionAnswer: 'slomo-120' }).meta.timeScale).toBeCloseTo(0.25)
    const proven = meta(240, { timeBaseStatus: 'proven' })
    expect(resolveTimeBase(proven, { slowMotionAnswer: 'slomo-120' }).status).toBe('proven')
  })
})

describe('applyGravityCheck', () => {
  it('corrects an unknown base from the toss, and confirms real time when consistent, without proving either', () => {
    const unknown = resolveTimeBase(meta(30))
    const corrected = applyGravityCheck(unknown, { status: 'apply-correction', timeScale: 0.125, captureFpsFactor: 8, basis: 'too slow' })
    expect(corrected.changed).toBe(true)
    expect(corrected.decision.status).toBe('physics')
    // Toss-corrected: 'physics', never 'proven' (speed is never computed on it, METRICS §2.9).
    expect(corrected.decision.meta).toMatchObject({ captureFps: 240, timeScale: 0.125, fpsSource: 'physics', timeBaseStatus: 'unknown' })
    const consistent = applyGravityCheck(unknown, { status: 'consistent', timeScale: 1, basis: 'g' })
    expect(consistent.changed).toBe(false)
    expect(consistent.decision.status).toBe('physics')
    // Gravity-consistent: the engine's own toss check classes it 'normal' (not proven timestamps).
    expect(consistent.decision.meta.timeBaseStatus).toBe('unknown')
    expect(consistent.decision.meta.fpsSource).toBe('timestamps')
    const inconclusive = applyGravityCheck(unknown, { status: 'inconclusive', basis: '?' })
    expect(inconclusive.decision.status).toBe('unknown')
  })

  it('never overrides the player, but warns when the toss disagrees', () => {
    const user = resolveTimeBase(meta(30), { fpsOverride: 240 })
    const r = applyGravityCheck(user, { status: 'apply-correction', timeScale: 0.5, basis: 'x' })
    expect(r.changed).toBe(false)
    expect(r.decision).toBe(user)
    expect(r.warning).toMatch(/frame rate/)
  })
})
