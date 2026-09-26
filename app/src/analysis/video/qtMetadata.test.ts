import { describe, expect, it } from 'vitest'
import { metadataNumber, parseMoovMetadata, QT_KEYS } from './qtMetadata.ts'

// Tiny atom builder for synthetic QuickTime structures.
const enc = new TextEncoder()
const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
const u16 = (v: number) => [(v >>> 8) & 255, v & 255]
const ascii = (s: string) => Array.from(enc.encode(s))
const atom = (type: string | number[], ...payload: number[][]) => {
  const body = payload.flat()
  const typeBytes = typeof type === 'string' ? Array.from(type, (c) => c.charCodeAt(0) & 255) : type
  return [...u32(8 + body.length), ...typeBytes, ...body]
}
const f32 = (v: number) => {
  const b = new DataView(new ArrayBuffer(4))
  b.setFloat32(0, v)
  return Array.from(new Uint8Array(b.buffer))
}
/** data atom: [type indicator][locale][value] */
const data = (wellKnownType: number, value: number[]) => atom('data', u32(wellKnownType), u32(0), value)
const keysAtom = (names: string[]) =>
  atom('keys', u32(0), u32(names.length), ...names.map((n) => [...u32(8 + n.length), ...ascii('mdta'), ...ascii(n)]))
const hdlr = (handler: string) => atom('hdlr', u32(0), u32(0), ascii(handler), u32(0), u32(0), u32(0), [0])
const ilstItem = (index: number, ...payload: number[][]) => atom(u32(index), ...payload)
const tkhd = (trackId: number) => atom('tkhd', u32(0), u32(0), u32(0), u32(trackId), new Array(68).fill(0))

function moovWith(...children: number[][]): Uint8Array {
  return new Uint8Array([...atom('ftyp', ascii('qt  '), u32(0)), ...atom('moov', ...children)])
}

describe('parseMoovMetadata', () => {
  it('decodes Apple-style moov/meta mdta items with typed values', () => {
    const meta = atom(
      'meta',
      hdlr('mdta'),
      keysAtom([QT_KEYS.make, QT_KEYS.model, QT_KEYS.fullFrameRatePlaybackIntent, QT_KEYS.androidCaptureFps, 'com.example.int16']),
      atom(
        'ilst',
        ilstItem(1, data(1, ascii('Apple'))),
        ilstItem(2, data(1, ascii('iPhone 15 Pro'))),
        ilstItem(3, data(21, [0])), // signed int, 1 byte
        ilstItem(4, data(23, f32(239.5))),
        ilstItem(5, data(21, u16(0xfffe))), // -2 as 2-byte signed int
      ),
    )
    const result = parseMoovMetadata(moovWith(meta))
    expect(result.movie[QT_KEYS.make]).toBe('Apple')
    expect(result.movie[QT_KEYS.model]).toBe('iPhone 15 Pro')
    expect(result.movie[QT_KEYS.fullFrameRatePlaybackIntent]).toBe(0)
    expect(result.movie[QT_KEYS.androidCaptureFps]).toBeCloseTo(239.5, 5)
    expect(result.movie['com.example.int16']).toBe(-2)
  })

  it('reads mdta items that ffmpeg stores under udta/meta and classic udta text atoms', () => {
    const udta = atom(
      'udta',
      atom([0xa9, ...ascii('mak')], u16(5), u16(0), ascii('Apple')),
      atom('meta', u32(0), hdlr('mdir'), atom('ilst', atom([0xa9, ...ascii('too')], data(1, ascii('Lavf60'))))),
      atom('meta', hdlr('mdta'), keysAtom([QT_KEYS.androidCaptureFps]), atom('ilst', ilstItem(1, data(1, ascii('120.000000'))))),
    )
    const result = parseMoovMetadata(moovWith(udta))
    expect(result.userData['©mak']).toBe('Apple')
    expect(result.userData['©too']).toBe('Lavf60')
    expect(metadataNumber(result.movie[QT_KEYS.androidCaptureFps])).toBe(120)
  })

  it('lists keys declared by timed-metadata (mebx) tracks', () => {
    const keyd = (name: string) => atom('keyd', ascii('mdta'), ascii(name))
    const mebx = atom(
      'mebx',
      new Array(6).fill(0),
      u16(1),
      atom('keys', atom(u32(1), keyd('com.apple.quicktime.video-orientation')), atom(u32(2), keyd('com.apple.quicktime.scene-illuminance'))),
    )
    const stsd = atom('stsd', u32(0), u32(1), mebx)
    const trak = atom('trak', tkhd(3), atom('mdia', atom('minf', atom('stbl', stsd))))
    const result = parseMoovMetadata(moovWith(trak))
    expect(result.timedMetadataTracks).toEqual([
      { trackId: 3, keys: ['com.apple.quicktime.video-orientation', 'com.apple.quicktime.scene-illuminance'] },
    ])
  })

  it('survives truncated and malformed input', () => {
    const good = moovWith(atom('meta', hdlr('mdta'), keysAtom(['a']), atom('ilst', ilstItem(1, data(1, ascii('x'))))))
    expect(parseMoovMetadata(good.subarray(0, good.length - 3)).movie).toEqual({})
    expect(parseMoovMetadata(new Uint8Array([0, 0, 0, 4, 1, 2]))).toEqual({ movie: {}, userData: {}, track: {}, timedMetadataTracks: [] })
    const badItem = moovWith(atom('meta', hdlr('mdta'), keysAtom(['a', 'b']), atom('ilst', ilstItem(1, data(67, [1])), ilstItem(2, data(1, ascii('ok'))))))
    expect(parseMoovMetadata(badItem).movie).toEqual({ a: new Uint8Array([1]), b: 'ok' }) // wrong-size int kept as raw bytes
  })
})

describe('metadataNumber', () => {
  it('coerces numeric strings and rejects text', () => {
    expect(metadataNumber('240.000000')).toBe(240)
    expect(metadataNumber(' 0 ')).toBe(0)
    expect(metadataNumber('Apple')).toBeUndefined()
    expect(metadataNumber(undefined)).toBeUndefined()
    expect(metadataNumber(true)).toBe(1)
  })
})
