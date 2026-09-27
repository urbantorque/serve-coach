/**
 * Test-only: a tiny hand-built MP4 (ftyp · mdat · moov with a video and an audio track), for the
 * audio-removal tests. Layout: ftyp (16) · mdat header (8) · V1 [24,34) A1 [34,40) V2 [40,50)
 * A2 [50,54) · moov. Not imported by app code.
 */
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u64 = (n: number) => [...u32(Math.floor(n / 2 ** 32)), ...u32(n >>> 0)]

export const box = (type: string, ...payload: number[][]) => {
  const body = payload.flat()
  return [...u32(8 + body.length), ...ascii(type), ...body]
}
const full = (type: string, ...payload: number[][]) => box(type, [0, 0, 0, 0], ...payload)

export function trak(handler: string, sizes: { constant: number; list: number[]; count: number }, runs: [number, number][], offsets: number[], wide = false) {
  const stsz = full('stsz', u32(sizes.constant), u32(sizes.count), ...sizes.list.map(u32))
  const stsc = full('stsc', u32(runs.length), ...runs.map(([first, per]) => [...u32(first), ...u32(per), ...u32(1)]))
  const stco = wide ? full('co64', u32(offsets.length), ...offsets.map(u64)) : full('stco', u32(offsets.length), ...offsets.map(u32))
  const hdlr = full('hdlr', u32(0), ascii(handler), u32(0), u32(0), u32(0), [0])
  return box('trak', box('tkhd', new Array(84).fill(0)), box('mdia', hdlr, box('minf', box('stbl', stsz, stsc, stco))))
}

export const VIDEO_BYTE = 0xaa
export const AUDIO_BYTE = 0xbb

export function mp4WithAudio(opts: { wide?: boolean; fragmented?: boolean } = {}): Uint8Array<ArrayBuffer> {
  const ftyp = box('ftyp', ascii('isom'), u32(0))
  const mdat = box('mdat', new Array(10).fill(VIDEO_BYTE), new Array(6).fill(AUDIO_BYTE), new Array(10).fill(VIDEO_BYTE), new Array(4).fill(AUDIO_BYTE))
  const video = trak('vide', { constant: 0, count: 3, list: [10, 4, 6] }, [[1, 1], [2, 2]], [24, 40], opts.wide)
  const audio = trak('soun', { constant: 2, count: 5, list: [] }, [[1, 3], [2, 2]], [34, 50], opts.wide)
  const moov = box('moov', full('mvhd', new Array(96).fill(0)), video, audio)
  return new Uint8Array([...ftyp, ...mdat, ...moov, ...(opts.fragmented ? box('moof', [0, 0, 0, 0]) : [])])
}

export function mp4VideoOnly(): Uint8Array<ArrayBuffer> {
  const ftyp = box('ftyp', ascii('isom'), u32(0))
  const mdat = box('mdat', new Array(10).fill(1))
  const moov = box('moov', trak('vide', { constant: 10, count: 1, list: [] }, [[1, 1]], [24]))
  return new Uint8Array([...ftyp, ...mdat, ...moov])
}

export const fourccBytes = ascii
