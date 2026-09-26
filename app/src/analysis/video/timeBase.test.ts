import { describe, expect, it } from 'vitest'
import type { VideoMeta } from '../types.ts'
import type { ContainerMetadata } from './qtMetadata.ts'
import { applyTimeScale, assessTimeBase, mediaToReal, realToMedia, timeScaleFromCaptureFps } from './timeBase.ts'
import type { RateSegment } from './timing.ts'

const emptyMeta = (movie: ContainerMetadata['movie'] = {}): ContainerMetadata => ({
  movie,
  userData: {},
  track: {},
  timedMetadataTracks: [],
})
const oneSegment = (fps: number): RateSegment[] => [{ startIndex: 0, endIndex: 100, fps }]

const baseMeta: VideoMeta = {
  fileName: 'serve.mov',
  durationMediaS: 8,
  width: 1080,
  height: 1920,
  rotationDeg: 90,
  hasAudio: true,
  nominalFps: 30,
  captureFps: 30,
  timeScale: 1,
  fpsSource: 'timestamps',
  isVariableFrameRate: false,
  frameCount: 240,
}

describe('assessTimeBase', () => {
  it('leaves an ordinary 30 fps clip at timeScale 1 but UNKNOWN', () => {
    const a = assessTimeBase({ nominalFps: 30, segments: oneSegment(30), metadata: emptyMeta(), editRate: 1 })
    expect(a).toMatchObject({ kind: 'normal', status: 'unknown', timeScale: 1, captureFps: 30, fpsSource: 'timestamps' })
  })

  it('warns that an iPhone 30 fps clip could be a rendered slow-motion export', () => {
    const a = assessTimeBase({
      nominalFps: 30,
      segments: oneSegment(30),
      metadata: emptyMeta({ 'com.apple.quicktime.make': 'Apple', 'com.apple.quicktime.model': 'iPhone 14' }),
      editRate: 1,
    })
    expect(a.status).toBe('unknown')
    expect(a.warnings.join(' ')).toMatch(/rendered at a normal frame rate/)
    expect(a.device?.model).toBe('iPhone 14')
  })

  it.each([120, 240])('proves real time for native %i fps timestamps', (fps) => {
    const a = assessTimeBase({ nominalFps: fps, segments: oneSegment(fps), metadata: emptyMeta(), editRate: 1 })
    expect(a).toMatchObject({ kind: 'native-high-fps', status: 'proven', captureFps: fps, timeScale: 1 })
  })

  it('reads the Apple slow-motion playback intent without changing the time base', () => {
    const a = assessTimeBase({
      nominalFps: 240,
      segments: oneSegment(240),
      metadata: emptyMeta({ 'com.apple.quicktime.full-frame-rate-playback-intent': 0 }),
      editRate: 1,
    })
    expect(a.playbackIntent).toBe('slow-motion')
    expect(a.timeScale).toBe(1)
  })

  it('flags slow-motion intent on a 30 fps timeline as a possible rendered export', () => {
    const a = assessTimeBase({
      nominalFps: 30,
      segments: oneSegment(30),
      metadata: emptyMeta({ 'com.apple.quicktime.full-frame-rate-playback-intent': '0' }),
      editRate: 1,
    })
    expect(a).toMatchObject({ kind: 'possible-rendered-slomo', status: 'unknown', timeScale: 1 })
  })

  it('uses com.android.capture.fps (float or string) to prove a stretched timeline', () => {
    for (const value of [240, '240.000000']) {
      const a = assessTimeBase({ nominalFps: 30, segments: oneSegment(30), metadata: emptyMeta({ 'com.android.capture.fps': value }), editRate: 1 })
      expect(a).toMatchObject({ kind: 'metadata-time-scaled', status: 'proven', captureFps: 240, fpsSource: 'container' })
      expect(a.timeScale).toBeCloseTo(0.125, 12)
    }
    const timeLapse = assessTimeBase({ nominalFps: 30, segments: oneSegment(30), metadata: emptyMeta({ 'com.android.capture.fps': 2 }), editRate: 1 })
    expect(timeLapse.timeScale).toBe(15)
    const same = assessTimeBase({ nominalFps: 30, segments: oneSegment(30), metadata: emptyMeta({ 'com.android.capture.fps': 30.0 }), editRate: 1 })
    expect(same).toMatchObject({ kind: 'normal', status: 'proven', timeScale: 1 })
  })

  it('treats rate ramps and edit-list remapping as suspicious, not proof', () => {
    const ramp: RateSegment[] = [
      { startIndex: 0, endIndex: 60, fps: 240 },
      { startIndex: 60, endIndex: 150, fps: 30 },
      { startIndex: 150, endIndex: 210, fps: 240 },
    ]
    const a = assessTimeBase({ nominalFps: 240, segments: ramp, metadata: emptyMeta(), editRate: 1 })
    expect(a).toMatchObject({ kind: 'possible-rendered-slomo', status: 'unknown' })
    const remap = assessTimeBase({ nominalFps: 30, segments: oneSegment(30), metadata: emptyMeta(), editRate: 0.25 })
    expect(remap.kind).toBe('possible-rendered-slomo')
    expect(remap.warnings.join(' ')).toMatch(/remaps playback time/)
  })
})

describe('applyTimeScale', () => {
  it('applies a user-confirmed 240 fps slow-motion time base', () => {
    const scale = timeScaleFromCaptureFps(30, 240)
    const meta = applyTimeScale(baseMeta, 240, scale, 'user')
    expect(meta).toMatchObject({ captureFps: 240, timeScale: 0.125, fpsSource: 'user' })
    expect(baseMeta.timeScale).toBe(1) // input untouched
    expect(mediaToReal(4, meta)).toBe(0.5)
    expect(realToMedia(0.5, meta)).toBe(4)
  })

  it('accepts a physics estimate within 5% of the implied capture rate', () => {
    const meta = applyTimeScale(baseMeta, 240, 0.13, 'physics')
    expect(meta.fpsSource).toBe('physics')
  })

  it('rejects inconsistent or invalid values', () => {
    expect(() => applyTimeScale(baseMeta, 240, 1, 'user')).toThrow(/Inconsistent/)
    expect(() => applyTimeScale(baseMeta, 0, 1, 'user')).toThrow(RangeError)
    expect(() => applyTimeScale(baseMeta, 30, Number.NaN, 'user')).toThrow(RangeError)
    expect(() => timeScaleFromCaptureFps(30, 0)).toThrow(RangeError)
  })
})
