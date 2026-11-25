/**
 * Reading a phone video's AAC frames out of its own boxes (L2.9).
 *
 * Every file here is assembled byte by byte, the way a recorder writes it: a
 * video track and an audio track, the audio's frames spread over chunks of
 * different lengths, an ISO sample entry and a QuickTime one with its `wave`.
 */
import { aacTrackOf, adtsHeader } from '../mp4Audio'
import { assert, check, heading, near, report } from '../../analysis/__tests__/harness'

const u8 = (n: number) => new Uint8Array([n & 0xff])
const u16 = (n: number) => new Uint8Array([(n >> 8) & 0xff, n & 0xff])
const u32 = (n: number) => {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n)
  return b
}
const u64 = (n: number) => {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setBigUint64(0, BigInt(n))
  return b
}
const ascii = (s: string) => new TextEncoder().encode(s)
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const box = (type: string, ...payload: Uint8Array[]) => {
  const body = cat(...payload)
  return cat(u32(8 + body.length), ascii(type), body)
}
const FLAGS = u32(0)
const buffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** An `esds` carrying `config`, through the three descriptors. */
function esds(config: Uint8Array) {
  const dsi = cat(u8(0x05), u8(config.length), config)
  const dcd = cat(u8(0x04), u8(13 + dsi.length), u8(0x40), u8(0x15), u8(0), u16(0), u32(128000), u32(128000), dsi)
  const es = cat(u8(0x03), u8(3 + dcd.length), u16(1), u8(0), dcd)
  return box('esds', FLAGS, es)
}

/** An `mp4a` entry: ISO (version 0, `esds` directly) or QuickTime version 1 (`esds` in `wave`). */
function mp4a(config: Uint8Array, quicktime = false) {
  const head = cat(new Uint8Array(6), u16(1)) // reserved, data reference index
  const audio = cat(u16(quicktime ? 1 : 0), u16(0), u32(0), u16(2), u16(16), u16(0), u16(0), u32(44100 << 16))
  const extra = quicktime ? new Uint8Array(16) : new Uint8Array(0)
  return box('mp4a', head, audio, extra, quicktime ? box('wave', esds(config)) : esds(config))
}

const AAC_LC_44K_STEREO = new Uint8Array([0x12, 0x10])

function audioTrak(opts: {
  sizes: number[]
  runs: [number, number][]
  offsets: number[]
  quicktime?: boolean
  wide?: boolean
}) {
  const hdlr = box('hdlr', FLAGS, u32(0), ascii('soun'), u32(0), u32(0), u32(0), ascii('\0'))
  const mdhd = box('mdhd', FLAGS, u32(0), u32(0), u32(44100), u32(0), u32(0))
  const stsd = box('stsd', FLAGS, u32(1), mp4a(AAC_LC_44K_STEREO, opts.quicktime))
  const stts = box('stts', FLAGS, u32(1), u32(opts.sizes.length), u32(1024))
  const stsc = box('stsc', FLAGS, u32(opts.runs.length), ...opts.runs.flatMap(([first, per]) => [u32(first), u32(per), u32(1)]))
  const stsz = box('stsz', FLAGS, u32(0), u32(opts.sizes.length), ...opts.sizes.map(u32))
  const stco = opts.wide
    ? box('co64', FLAGS, u32(opts.offsets.length), ...opts.offsets.map(u64))
    : box('stco', FLAGS, u32(opts.offsets.length), ...opts.offsets.map(u32))
  return box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', stsd, stts, stsc, stsz, stco))))
}

const videoTrak = () =>
  box(
    'trak',
    box(
      'mdia',
      box('mdhd', FLAGS, u32(0), u32(0), u32(600), u32(0), u32(0)),
      box('hdlr', FLAGS, u32(0), ascii('vide'), u32(0), u32(0), u32(0), ascii('\0')),
      box('minf', box('stbl', box('stts', FLAGS, u32(1), u32(90), u32(20)))),
    ),
  )

const moov = (...traks: Uint8Array[]) => box('moov', box('mvhd', FLAGS, u32(0)), ...traks)

heading('Where every frame is')

check('the audio track is found past the video one, and its config read', () => {
  const t = aacTrackOf(buffer(moov(videoTrak(), audioTrak({ sizes: [300], runs: [[1, 1]], offsets: [1000] }))))!
  assert(t !== undefined, 'no audio track found')
  assert(t.codec === 'mp4a.40.2' && t.sampleRate === 44100 && t.channels === 2, `${t.codec} ${t.sampleRate} ${t.channels}`)
  assert(t.config.length === 2 && t.config[0] === 0x12, 'the config wasn’t carried')
})

check('frames are laid out chunk by chunk, each after the last, at its own time', () => {
  // Seven frames: two chunks of three, then one of one, as `stsc` says.
  const sizes = [300, 310, 320, 330, 340, 350, 360]
  const offsets = [1000, 5000, 9000]
  const t = aacTrackOf(buffer(moov(audioTrak({ sizes, runs: [[1, 3], [3, 1]], offsets }))))!
  const want = [1000, 1300, 1610, 5000, 5330, 5670, 9000]
  assert(JSON.stringify(t.frames.map((f) => f.offset)) === JSON.stringify(want), `offsets ${t.frames.map((f) => f.offset)}`)
  assert(JSON.stringify(t.frames.map((f) => f.size)) === JSON.stringify(sizes), 'sizes lost')
  near(t.frames[6].t, (6 * 1024) / 44100, 1e-12, 'the seventh frame starts')
})

check('a QuickTime entry with its wave box, and 64-bit chunk offsets, read the same', () => {
  const big = 5_000_000_000
  const t = aacTrackOf(
    buffer(moov(audioTrak({ sizes: [300, 300], runs: [[1, 2]], offsets: [big], quicktime: true, wide: true }))),
  )!
  assert(t !== undefined, 'a QuickTime audio entry wasn’t read')
  assert(t.frames[1].offset === big + 300, `offset ${t.frames[1].offset}`)
})

check('a file with no audio, or audio that isn’t AAC, has no track', () => {
  assert(aacTrackOf(buffer(moov(videoTrak()))) === undefined, 'a silent file had a track')
  const notAac = audioTrak({ sizes: [300], runs: [[1, 1]], offsets: [1000] })
  const swapped = new Uint8Array(notAac)
  const i = new TextDecoder().decode(swapped).indexOf('mp4a')
  swapped.set(ascii('alac'), i)
  assert(aacTrackOf(buffer(moov(swapped))) === undefined, 'a non-AAC entry was read as AAC')
})

heading('One frame, as a stream')

check('the ADTS header says the profile, the rate, the channels and the length', () => {
  const h = adtsHeader({ objectType: 2, rateIndex: 4, channels: 2 }, 300)
  const bits = Array.from(h, (b) => b.toString(2).padStart(8, '0')).join('')
  const read = (from: number, n: number) => parseInt(bits.slice(from, from + n), 2)
  assert(read(0, 12) === 0xfff, 'no sync word')
  assert(read(15, 1) === 1, 'claims a CRC it doesn’t have')
  assert(read(16, 2) === 1, `profile ${read(16, 2)}, AAC LC is 1`)
  assert(read(18, 4) === 4, `rate index ${read(18, 4)}`)
  assert(read(23, 3) === 2, `channels ${read(23, 3)}`)
  assert(read(30, 13) === 307, `frame length ${read(30, 13)}, the frame and its header are 307`)
})

report()
