import { describe, expect, it } from 'vitest'
import { parseMoovMetadata, QT_KEYS, type ContainerMetadata } from './qtMetadata.ts'
import { containerRecordingTime, parseRecorderDate, recordingTimeFor } from './recordedAt.ts'

const enc = new TextEncoder()
const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
const u16 = (v: number) => [(v >>> 8) & 255, v & 255]
const ascii = (s: string) => Array.from(enc.encode(s))
const atom = (type: string | number[], ...payload: number[][]) => {
  const body = payload.flat()
  const typeBytes = typeof type === 'string' ? Array.from(type, (c) => c.charCodeAt(0) & 255) : type
  return [...u32(8 + body.length), ...typeBytes, ...body]
}
const data = (wellKnownType: number, value: number[]) => atom('data', u32(wellKnownType), u32(0), value)
const keysAtom = (names: string[]) => atom('keys', u32(0), u32(names.length), ...names.map((n) => [...u32(8 + n.length), ...ascii('mdta'), ...ascii(n)]))
const hdlr = (handler: string) => atom('hdlr', u32(0), u32(0), ascii(handler), u32(0), u32(0), u32(0), [0])
const moovWith = (...children: number[][]) => new Uint8Array([...atom('ftyp', ascii('qt  '), u32(0)), ...atom('moov', ...children)])
/** mvhd version 0: creation and modification times in seconds since 1904. */
const mvhd = (creation: number) => atom('mvhd', [0, 0, 0, 0], u32(creation), u32(creation), u32(600), u32(6000), new Array(80).fill(0))
const EPOCH_1904 = 2082844800
const NOW = Date.UTC(2026, 8, 28, 2, 0, 0)

describe('recording time from the container (E2)', () => {
  it('parses recorder date strings, with each kind of offset', () => {
    expect(new Date(parseRecorderDate('2026-09-27T19:41:08+1000')!).toISOString()).toBe('2026-09-27T09:41:08.000Z')
    expect(new Date(parseRecorderDate('2026-09-27T19:41:08+10:00')!).toISOString()).toBe('2026-09-27T09:41:08.000Z')
    expect(new Date(parseRecorderDate('2026-09-27T09:41:08.000000Z')!).toISOString()).toBe('2026-09-27T09:41:08.000Z')
    expect(new Date(parseRecorderDate('2026-09-27 09:41:08')!).toISOString()).toBe('2026-09-27T09:41:08.000Z')
    expect(new Date(parseRecorderDate('2026-09-26T21:00:00-0700')!).toISOString()).toBe('2026-09-27T04:00:00.000Z')
    expect(parseRecorderDate('2026')).toBeNull()
    expect(parseRecorderDate('yesterday')).toBeNull()
  })

  it('reads the mvhd creation time and the Apple creation date; Apple wins', () => {
    const t = Date.UTC(2026, 8, 27, 9, 41, 8) / 1000 + EPOCH_1904
    const withMvhd = parseMoovMetadata(moovWith(mvhd(t)))
    expect(withMvhd.mvhdCreationTime).toBe(t)
    expect(containerRecordingTime(withMvhd, NOW)).toEqual({ iso: '2026-09-27T09:41:08.000Z', source: 'mvhd' })
    const apple = parseMoovMetadata(
      moovWith(mvhd(t + 3600), atom('meta', hdlr('mdta'), keysAtom([QT_KEYS.creationDate]), atom('ilst', atom(u32(1), data(1, ascii('2026-09-27T19:41:08+1000')))))),
    )
    expect(containerRecordingTime(apple, NOW)).toEqual({ iso: '2026-09-27T09:41:08.000Z', source: 'quicktime-creationdate' })
  })

  it('reads the classic udta ©day atom and an ffmpeg creation_time key', () => {
    const day = parseMoovMetadata(moovWith(atom('udta', atom([0xa9, ...ascii('day')], u16(24), u16(0), ascii('2026-09-20T18:30:00+1000')))))
    expect(containerRecordingTime(day, NOW)).toEqual({ iso: '2026-09-20T08:30:00.000Z', source: 'udta-day' })
    const ff: ContainerMetadata = { movie: { creation_time: '2026-09-21T07:00:00.000000Z' }, userData: {}, track: {}, timedMetadataTracks: [] }
    expect(containerRecordingTime(ff, NOW)?.source).toBe('mdta-creation-time')
  })

  it('ignores placeholder times: mvhd 0 (1904), before 2005, or in the future', () => {
    expect(containerRecordingTime(parseMoovMetadata(moovWith(mvhd(0))), NOW)).toBeUndefined()
    expect(containerRecordingTime(parseMoovMetadata(moovWith(mvhd(Date.UTC(2001, 0, 1) / 1000 + EPOCH_1904))), NOW)).toBeUndefined()
    expect(containerRecordingTime(parseMoovMetadata(moovWith(mvhd(NOW / 1000 + 5 * 86400 + EPOCH_1904))), NOW)).toBeUndefined()
  })

  it('the import date: the recording time, else the file’s last change, else now', () => {
    expect(recordingTimeFor({ createdAt: '2026-09-27T09:41:08.000Z', fileLastModified: Date.UTC(2026, 8, 28), nowMs: NOW })).toEqual({ iso: '2026-09-27T09:41:08.000Z', source: 'container' })
    expect(recordingTimeFor({ fileLastModified: Date.UTC(2026, 8, 26, 8), nowMs: NOW })).toEqual({ iso: '2026-09-26T08:00:00.000Z', source: 'file-modified' })
    expect(recordingTimeFor({ fileLastModified: 0, nowMs: NOW })).toEqual({ iso: new Date(NOW).toISOString(), source: 'import-time' })
    expect(recordingTimeFor({ nowMs: NOW }).source).toBe('import-time')
  })
})
