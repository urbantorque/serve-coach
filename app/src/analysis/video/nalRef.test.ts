import { describe, expect, it } from 'vitest'
import { isDisposable, nalFormatFor } from './nalRef.ts'

/** Length-prefixed NAL units (4-byte lengths unless given). */
function sample(units: number[][], lengthSize = 4): Uint8Array {
  const out: number[] = []
  for (const u of units) {
    for (let k = lengthSize - 1; k >= 0; k--) out.push((u.length >> (8 * k)) & 0xff)
    out.push(...u)
  }
  return new Uint8Array(out)
}

/** H.264 NAL header: forbidden 0, nal_ref_idc, type. */
const h264 = (refIdc: number, type: number, payload = [0x88, 0x84]) => [(refIdc << 5) | type, ...payload]
/** HEVC NAL header: type, layer 0, TemporalId + 1. */
const h265 = (type: number, temporalId = 0, payload = [0xaf, 0x01]) => [type << 1, temporalId + 1, ...payload]

const avcC = (lengthSizeMinusOne = 3) => new Uint8Array([1, 0x64, 0, 0x2a, 0xfc | lengthSizeMinusOne, 0xe1])
function hvcC(temporalLayers: number, lengthSizeMinusOne = 3): Uint8Array {
  const d = new Uint8Array(23)
  d[0] = 1
  d[21] = (temporalLayers << 3) | lengthSizeMinusOne
  return d
}

describe('disposable pictures', () => {
  it('reads the NAL framing of H.264 and HEVC streams', () => {
    expect(nalFormatFor('avc1.64002a', avcC())).toEqual({ codec: 'h264', lengthSize: 4, maxTemporalId: 0 })
    expect(nalFormatFor('avc1.64002a', avcC(1))!.lengthSize).toBe(2)
    expect(nalFormatFor('hvc1.1.6.L120.B0', hvcC(1))).toEqual({ codec: 'h265', lengthSize: 4, maxTemporalId: 0 })
    expect(nalFormatFor('hev1.1.6.L120.B0', hvcC(3))!.maxTemporalId).toBe(2)
    expect(nalFormatFor('hvc1.1.6.L120.B0', hvcC(0))!.maxTemporalId).toBeNull()
    expect(nalFormatFor('avc1.64002a', undefined)).toBeNull()
    expect(nalFormatFor('vp09.00.10.08', new Uint8Array(8))).toBeNull()
  })

  it('H.264: only pictures whose every slice has nal_ref_idc 0', () => {
    const f = nalFormatFor('avc1.64002a', avcC())!
    expect(isDisposable(sample([h264(0, 1)]), f)).toBe(true)
    // SEI and AUD around a non-reference slice do not change that.
    expect(isDisposable(sample([h264(0, 9), h264(0, 6), h264(0, 1), h264(0, 1)]), f)).toBe(true)
    expect(isDisposable(sample([h264(2, 1)]), f)).toBe(false)
    expect(isDisposable(sample([h264(0, 1), h264(1, 1)]), f)).toBe(false)
    expect(isDisposable(sample([h264(3, 5)]), f)).toBe(false) // IDR
    expect(isDisposable(sample([h264(0, 6)]), f)).toBe(false) // no slice: unknown
    expect(isDisposable(sample([h264(0, 1)], 2), nalFormatFor('avc1.64002a', avcC(1))!)).toBe(true)
  })

  it('HEVC: sub-layer non-reference pictures of the highest temporal layer only', () => {
    const one = nalFormatFor('hvc1.1.6.L120.B0', hvcC(1))!
    expect(isDisposable(sample([h265(0)]), one)).toBe(true) // TRAIL_N
    expect(isDisposable(sample([h265(35), h265(0)]), one)).toBe(true) // AUD, then TRAIL_N
    expect(isDisposable(sample([h265(1)]), one)).toBe(false) // TRAIL_R
    expect(isDisposable(sample([h265(19)]), one)).toBe(false) // IDR_W_RADL
    const two = nalFormatFor('hvc1.1.6.L120.B0', hvcC(2))!
    expect(isDisposable(sample([h265(0, 0)]), two)).toBe(false) // a higher layer may reference it
    expect(isDisposable(sample([h265(0, 1)]), two)).toBe(true)
    expect(isDisposable(sample([h265(0)]), nalFormatFor('hvc1.1.6.L120.B0', hvcC(0))!)).toBe(false)
  })

  it('never calls a malformed sample disposable', () => {
    const f = nalFormatFor('avc1.64002a', avcC())!
    expect(isDisposable(new Uint8Array([0, 0, 0, 9, 0x01, 0x88]), f)).toBe(false) // length past the end
    expect(isDisposable(new Uint8Array([0, 0, 0, 0, 0x01]), f)).toBe(false)
    expect(isDisposable(new Uint8Array(0), f)).toBe(false)
  })
})
