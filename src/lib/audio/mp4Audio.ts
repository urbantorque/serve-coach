/**
 * A phone video's sound, found in the file without decoding the picture (L2.9).
 *
 * The audio of an MP4 or MOV is AAC: a few hundred bytes a frame, each frame
 * 1024 samples, scattered through the media box between the video's frames.
 * The `moov` box says where every one is: the sample sizes (`stsz`), which
 * chunk holds which samples (`stsc`), where each chunk starts (`stco`/`co64`)
 * and how long each sample lasts (`stts`). So the sound of a two-gigabyte file
 * is read with `file.slice` a stretch at a time, a megabyte or two a minute,
 * and the picture is never touched.
 *
 * Pure: a `moov` in, a table out. `adtsHeader` wraps one frame for a decoder
 * that wants a stream (`decodeAudioData`); WebCodecs takes the frames as they
 * are, with `config` as their description.
 */
import { child, children, fourcc, type Box } from '../pose/container'

export interface AacFrame {
  /** Byte offset in the file. */
  offset: number
  size: number
  /** Seconds from the start of the track. */
  t: number
}

export interface AacTrack {
  /** The codec string WebCodecs asks for, e.g. `mp4a.40.2`. */
  codec: string
  objectType: number
  sampleRate: number
  /** ADTS's index into its table of rates. */
  rateIndex: number
  channels: number
  /** The AudioSpecificConfig: WebCodecs' `description`. */
  config: Uint8Array
  frames: AacFrame[]
}

const RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

/** A descriptor's length: up to four bytes, seven bits each, high bit for "more". */
function descriptorLength(view: DataView, at: number): { length: number; next: number } {
  let length = 0
  let next = at
  for (let i = 0; i < 4; i++) {
    const b = view.getUint8(next++)
    length = (length << 7) | (b & 0x7f)
    if (!(b & 0x80)) break
  }
  return { length, next }
}

/** The AudioSpecificConfig inside an `esds`: ES descriptor, decoder config, decoder-specific info. */
function configFrom(view: DataView, esds: Box): Uint8Array | undefined {
  let at = esds.start + 4 // version and flags
  const end = esds.end
  const expect = (tag: number) => {
    if (at >= end || view.getUint8(at) !== tag) return undefined
    const { length, next } = descriptorLength(view, at + 1)
    at = next
    return length
  }
  if (expect(0x03) === undefined) return undefined
  at += 2 // ES_ID
  const flags = view.getUint8(at++)
  if (flags & 0x80) at += 2 // depends on another stream
  if (flags & 0x40) at += 1 + view.getUint8(at) // a URL
  if (flags & 0x20) at += 2 // OCR stream
  if (expect(0x04) === undefined) return undefined
  at += 13 // object type, stream type, buffer size, max and average bitrate
  const length = expect(0x05)
  if (length === undefined || length < 2 || at + length > end) return undefined
  return new Uint8Array(view.buffer.slice(view.byteOffset + at, view.byteOffset + at + length))
}

/** The `esds` of an `mp4a` sample entry, directly inside it or in QuickTime's `wave`. */
function esdsOf(view: DataView, entry: Box): Box | undefined {
  // An audio sample entry: 8 bytes of SampleEntry, then 20 of AudioSampleEntry,
  // and QuickTime's versions 1 and 2 add 16 and 36 more.
  const version = view.getUint16(entry.start + 8)
  const from = entry.start + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0)
  if (from > entry.end) return undefined
  for (const box of children(view, from, entry.end)) {
    if (box.type === 'esds') return box
    if (box.type === 'wave') {
      const inner = children(view, box.start, box.end).find((b) => b.type === 'esds')
      if (inner) return inner
    }
  }
  return undefined
}

/** The first AAC track in a `moov` (header included), or nothing. */
export function aacTrackOf(bytes: ArrayBuffer): AacTrack | undefined {
  const view = new DataView(bytes)
  const moov = children(view, 0, view.byteLength).find((b) => b.type === 'moov')
  if (!moov) return undefined
  for (const trak of children(view, moov.start, moov.end).filter((b) => b.type === 'trak')) {
    const mdia = child(view, trak, 'mdia')
    const hdlr = mdia && child(view, mdia, 'hdlr')
    if (!mdia || !hdlr || hdlr.end - hdlr.start < 12 || fourcc(view, hdlr.start + 8) !== 'soun') continue
    const mdhd = child(view, mdia, 'mdhd')
    const stbl = child(view, child(view, mdia, 'minf') ?? mdia, 'stbl')
    if (!mdhd || !stbl) continue
    const timescale = view.getUint32(mdhd.start + (view.getUint8(mdhd.start) === 1 ? 20 : 12))

    const stsd = child(view, stbl, 'stsd')
    const entry = stsd && children(view, stsd.start + 8, stsd.end)[0]
    if (!entry || entry.type !== 'mp4a') continue
    const esds = esdsOf(view, entry)
    const config = esds && configFrom(view, esds)
    if (!config) continue
    const objectType = config[0] >> 3
    const rateIndex = ((config[0] & 0x07) << 1) | (config[1] >> 7)
    const channels = (config[1] >> 3) & 0x0f
    const sampleRate = RATES[rateIndex]
    // Escaped object types and explicit rates are left to a decoder that reads
    // the config itself; ADTS cannot carry them, so they are not this reader's.
    if (objectType === 31 || rateIndex === 15 || !sampleRate || !timescale) continue

    const frames = frameTable(view, stbl, timescale)
    if (!frames) continue
    return { codec: `mp4a.40.${objectType}`, objectType, sampleRate, rateIndex, channels, config, frames }
  }
  return undefined
}

/** Every sample's offset, size and time, from `stsz`, `stsc`, `stco`/`co64` and `stts`. */
function frameTable(view: DataView, stbl: Box, timescale: number): AacFrame[] | undefined {
  const stsz = child(view, stbl, 'stsz')
  const stsc = child(view, stbl, 'stsc')
  const stco = child(view, stbl, 'stco') ?? child(view, stbl, 'co64')
  const stts = child(view, stbl, 'stts')
  if (!stsz || !stsc || !stco || !stts) return undefined

  const fixed = view.getUint32(stsz.start + 4)
  const count = view.getUint32(stsz.start + 8)
  if (!fixed && stsz.start + 12 + count * 4 > stsz.end) return undefined
  const sizeOf = (i: number) => fixed || view.getUint32(stsz.start + 12 + i * 4)

  const wide = stco.type === 'co64'
  const chunks = view.getUint32(stco.start + 4)
  if (stco.start + 8 + chunks * (wide ? 8 : 4) > stco.end) return undefined
  const chunkAt = (c: number) =>
    wide ? Number(view.getBigUint64(stco.start + 8 + c * 8)) : view.getUint32(stco.start + 8 + c * 4)

  const runs = view.getUint32(stsc.start + 4)
  if (stsc.start + 8 + runs * 12 > stsc.end) return undefined
  const run = (i: number) => ({
    first: view.getUint32(stsc.start + 8 + i * 12) - 1,
    perChunk: view.getUint32(stsc.start + 12 + i * 12),
  })

  const frames: AacFrame[] = []
  let sample = 0
  for (let r = 0; r < runs && sample < count; r++) {
    const { first, perChunk } = run(r)
    const last = r + 1 < runs ? run(r + 1).first : chunks
    for (let c = first; c < last && sample < count; c++) {
      let offset = chunkAt(c)
      for (let k = 0; k < perChunk && sample < count; k++, sample++) {
        const size = sizeOf(sample)
        frames.push({ offset, size, t: 0 })
        offset += size
      }
    }
  }

  // Times, from the run-length table of sample durations.
  const entries = view.getUint32(stts.start + 4)
  let i = 0
  let ticks = 0
  for (let e = 0; e < entries && i < frames.length; e++) {
    const at = stts.start + 8 + e * 8
    if (at + 8 > stts.end) break
    const n = view.getUint32(at)
    const delta = view.getUint32(at + 4)
    for (let k = 0; k < n && i < frames.length; k++, i++) {
      frames[i].t = ticks / timescale
      ticks += delta
    }
  }
  return frames.length ? frames : undefined
}

/** The seven-byte ADTS header for one raw AAC frame of `size` bytes, without CRC. */
export function adtsHeader(track: Pick<AacTrack, 'objectType' | 'rateIndex' | 'channels'>, size: number): Uint8Array {
  const length = size + 7
  const profile = track.objectType - 1
  return new Uint8Array([
    0xff,
    0xf1,
    ((profile & 0x03) << 6) | ((track.rateIndex & 0x0f) << 2) | ((track.channels >> 2) & 0x01),
    ((track.channels & 0x03) << 6) | ((length >> 11) & 0x03),
    (length >> 3) & 0xff,
    ((length & 0x07) << 5) | 0x1f,
    0xfc,
  ])
}
