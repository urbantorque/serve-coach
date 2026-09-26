import { describe, expect, it } from 'vitest'
import { bytesSource, sniffContainer, toByteSource } from './byteSource.ts'
import { codecFamily, hevcCodecString } from './codecs.ts'
import { analysisSize } from './render.ts'

describe('sniffContainer', () => {
  const bytes = (...parts: (number[] | string)[]) =>
    new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)))

  it('recognises MP4, MOV, WebM and junk', () => {
    expect(sniffContainer(bytes([0, 0, 0, 32], 'ftypisom', [0, 0, 2, 0]))).toBe('mp4')
    expect(sniffContainer(bytes([0, 0, 0, 20], 'ftypqt  ', [0, 0, 0, 0]))).toBe('mov')
    expect(sniffContainer(bytes([0, 0, 0, 8], 'wide', [0, 0, 0, 0]))).toBe('mov')
    expect(sniffContainer(bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('webm')
    expect(sniffContainer(bytes('GIF89a......'))).toBe('unknown')
  })
})

describe('byte sources', () => {
  it('reads ranges and clamps at end of file', async () => {
    const source = toByteSource(new Uint8Array([1, 2, 3, 4, 5]))
    expect(Array.from(await source.read(1, 2))).toEqual([2, 3])
    expect(Array.from(await source.read(3, 10))).toEqual([4, 5])
    expect((await source.read(9, 2)).length).toBe(0)
    expect(bytesSource(new ArrayBuffer(3)).size).toBe(3)
  })

  it('reads Blob slices', async () => {
    const source = toByteSource(new Blob([new Uint8Array([9, 8, 7, 6])]))
    expect(Array.from(await source.read(2, 5))).toEqual([7, 6])
  })
})

describe('codecs', () => {
  it('classifies codec strings', () => {
    expect(codecFamily('avc1.640028')).toBe('h264')
    expect(codecFamily('hvc1.2.4.L153.B0')).toBe('hevc')
    expect(codecFamily('dvh1.08.07')).toBe('dolby-vision')
    expect(codecFamily('vp09.00.10.08')).toBe('vp9')
    expect(codecFamily('apch')).toBe('prores')
  })

  it('builds the RFC 6381 HEVC string used for the Dolby Vision base layer', () => {
    // Main 10, level 5.1 high-ish, compat flags 0x20000000 -> reversed 0x4, constraint 0x90.
    const main10 = hevcCodecString('hvc1', {
      general_profile_space: 0,
      general_tier_flag: 0,
      general_profile_idc: 2,
      general_profile_compatibility: 0x20000000,
      general_constraint_indicator: [0x90, 0, 0, 0, 0, 0],
      general_level_idc: 153,
    })
    expect(main10).toBe('hvc1.2.4.L153.90')
    const main = hevcCodecString('hev1', {
      general_profile_space: 0,
      general_tier_flag: 1,
      general_profile_idc: 1,
      general_profile_compatibility: 0x60000000,
      general_constraint_indicator: [0xb0, 0, 0, 0, 0, 0],
      general_level_idc: 93,
    })
    expect(main).toBe('hev1.1.6.H93.B0')
  })
})

describe('analysisSize', () => {
  const portrait = { width: 1080, height: 1920 }

  it('keeps full resolution by default and never upscales', () => {
    expect(analysisSize(portrait)).toEqual(portrait)
    expect(analysisSize(portrait, { maxLongSidePx: 4000 })).toEqual(portrait)
  })

  it('limits the long side and keeps aspect', () => {
    expect(analysisSize(portrait, { maxLongSidePx: 640 })).toEqual({ width: 360, height: 640 })
    expect(analysisSize({ width: 1920, height: 1080 }, { width: 256 })).toEqual({ width: 256, height: 144 })
    expect(analysisSize(portrait, { height: 320 })).toEqual({ width: 180, height: 320 })
    expect(analysisSize(portrait, { width: 100, height: 100 })).toEqual({ width: 100, height: 100 })
  })
})
