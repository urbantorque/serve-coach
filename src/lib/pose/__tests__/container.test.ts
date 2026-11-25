/**
 * Reading a clip's timing out of its own MP4/MOV boxes.
 *
 * Every file here is assembled byte by byte, the way a phone's recorder writes
 * it, so the reader is checked against the layout rather than against itself.
 */
import { CAPTURE_FPS_KEY, parseMoov, readContainerTiming, stretchFromContainer } from '../container'
import { assert, check, heading, near, note, report } from '../../analysis/__tests__/harness'

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
const f32 = (n: number) => {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setFloat32(0, n)
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
const box = (type: string | number, ...payload: Uint8Array[]) => {
  const body = cat(...payload)
  const tag = typeof type === 'number' ? u32(type) : ascii(type)
  return cat(u32(8 + body.length), tag, body)
}
const FLAGS = u32(0)

/** A video track: `frames` samples, each `delta` ticks long at `timescale`. */
function videoTrak(timescale: number, stts: [number, number][], version = 0) {
  const mdhd =
    version === 1
      ? box('mdhd', u32(0x01000000), u64(0), u64(0), u32(timescale), u64(0), u32(0))
      : box('mdhd', FLAGS, u32(0), u32(0), u32(timescale), u32(0), u32(0))
  const hdlr = box('hdlr', FLAGS, u32(0), ascii('vide'), u32(0), u32(0), u32(0), ascii('\0'))
  const sttsBox = box('stts', FLAGS, u32(stts.length), ...stts.flatMap(([c, d]) => [u32(c), u32(d)]))
  return box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', sttsBox))))
}

/** An audio track, which must be skipped. */
const audioTrak = () =>
  box(
    'trak',
    box(
      'mdia',
      box('mdhd', FLAGS, u32(0), u32(0), u32(48000), u32(0), u32(0)),
      box('hdlr', FLAGS, u32(0), ascii('soun'), u32(0), u32(0), u32(0), ascii('\0')),
      box('minf', box('stbl', box('stts', FLAGS, u32(1), u32(100), u32(1024)))),
    ),
  )

/** QuickTime `mdta` metadata, as Android writes it: keys, then values by index. */
function mdtaMeta(entries: [string, Uint8Array, number][], iso = false) {
  const keys = box(
    'keys',
    FLAGS,
    u32(entries.length),
    ...entries.map(([k]) => cat(u32(8 + k.length), ascii('mdta'), ascii(k))),
  )
  const ilst = box(
    'ilst',
    ...entries.map(([, value, kind], i) => box(i + 1, box('data', u32(kind), u32(0), value))),
  )
  const hdlr = box('hdlr', FLAGS, u32(0), ascii('mdta'), u32(0), u32(0), u32(0), ascii('\0'))
  return iso ? box('meta', FLAGS, hdlr, keys, ilst) : box('meta', hdlr, keys, ilst)
}

const moov = (...children: Uint8Array[]) => box('moov', box('mvhd', FLAGS, u32(0)), ...children)
const buffer = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

heading('The file’s own frame rate')

check('a 30 fps video track reads 30, and an audio track beside it is ignored', () => {
  const t = parseMoov(buffer(moov(audioTrak(), videoTrak(600, [[90, 20]]))))
  near(t.fileFps!, 30, 1e-9, 'file rate')
  assert(t.captureFps === undefined, 'a capture rate appeared from nowhere')
})

check('an uneven sample table averages to its true rate', () => {
  // 29.97: 1001 ticks at 30000, the NTSC rate phones still write.
  const t = parseMoov(buffer(moov(videoTrak(30000, [[299, 1001], [1, 1001]]))))
  near(t.fileFps!, 30000 / 1001, 1e-9, 'file rate')
})

check('a version-1 media header is read at its own offsets', () => {
  const t = parseMoov(buffer(moov(videoTrak(90000, [[120, 1500]], 1))))
  near(t.fileFps!, 60, 1e-9, 'file rate')
})

heading('The capture rate Android writes')

check('a 120 fps capture played at 30 is a four-times stretch', () => {
  const meta = mdtaMeta([
    ['com.android.version', ascii('14'), 1],
    [CAPTURE_FPS_KEY, f32(120), 23],
  ])
  const t = parseMoov(buffer(moov(videoTrak(600, [[300, 20]]), meta)))
  near(t.captureFps!, 120, 1e-6, 'capture rate')
  near(stretchFromContainer(t)!, 4, 1e-6, 'stretch')
})

check('the key is found in ISO-style metadata and inside udta too', () => {
  const iso = parseMoov(buffer(moov(videoTrak(600, [[300, 20]]), mdtaMeta([[CAPTURE_FPS_KEY, f32(240), 23]], true))))
  near(iso.captureFps!, 240, 1e-6, 'ISO meta')
  const udta = parseMoov(buffer(moov(videoTrak(600, [[300, 20]]), box('udta', mdtaMeta([[CAPTURE_FPS_KEY, f32(60), 23]])))))
  near(udta.captureFps!, 60, 1e-6, 'udta meta')
})

check('a real-time clip tagged with its own rate isn’t a stretch', () => {
  const t = parseMoov(buffer(moov(videoTrak(600, [[300, 20]]), mdtaMeta([[CAPTURE_FPS_KEY, f32(30), 23]]))))
  assert(stretchFromContainer(t) === undefined, 'a 30-on-30 clip was called slow motion')
  assert(stretchFromContainer({ fileFps: 30 }) === undefined, 'no capture rate, yet a stretch')
  assert(stretchFromContainer(undefined) === undefined, 'no timing, yet a stretch')
})

heading('Finding the moov wherever the phone put it')

await check('a moov after a large media box is found by walking headers', async () => {
  const head = box('ftyp', ascii('isom'), u32(0), ascii('isom'))
  const mdat = box('mdat', new Uint8Array(2 * 1024 * 1024))
  const tail = moov(videoTrak(600, [[300, 20]]), mdtaMeta([[CAPTURE_FPS_KEY, f32(240), 23]]))
  const t = await readContainerTiming(new Blob([head, mdat, tail]))
  near(t!.fileFps!, 30, 1e-9, 'file rate')
  near(stretchFromContainer(t)!, 8, 1e-6, 'stretch')
})

await check('a thirty-minute 60 fps session is timed from its moov, reading under 32 MB of a 2 GB file', async () => {
  /*
   * The session path (L2.4) takes files no basket would: a practice filmed at
   * 60 fps runs to gigabytes. The reader must walk past the media by its
   * headers and read the `moov` alone, whose sample tables grow with the
   * frame count: 108,000 frames is 432 kB of sizes and 864 kB of offsets.
   *
   * The file is Blob-shaped rather than a Blob: two gigabytes of media are
   * never made, and every byte the reader asks for is counted.
   */
  const frames = 30 * 60 * 60
  const stts = box('stts', FLAGS, u32(1), u32(frames), u32(10))
  const stsz = box('stsz', FLAGS, u32(0), u32(frames), new Uint8Array(frames * 4))
  const co64 = box('co64', FLAGS, u32(frames), new Uint8Array(frames * 8))
  const mdhd = box('mdhd', FLAGS, u32(0), u32(0), u32(600), u32(0), u32(0))
  const hdlr = box('hdlr', FLAGS, u32(0), ascii('vide'), u32(0), u32(0), u32(0), ascii('\0'))
  const tail = moov(box('trak', box('mdia', mdhd, hdlr, box('minf', box('stbl', stts, stsz, co64)))))
  const head = box('ftyp', ascii('isom'), u32(0), ascii('isom'))
  const media = 2 * 1024 ** 3
  // A 64-bit box size, as a phone writes for media past four gigabytes and
  // some write regardless.
  const mdat = cat(u32(1), ascii('mdat'), u64(media))
  const parts = [
    { at: 0, bytes: head },
    { at: head.length, bytes: mdat },
    { at: head.length + media, bytes: tail },
  ]
  const size = head.length + media + tail.length
  let read = 0
  const slice = (from: number, to = size) => {
    const end = Math.min(to, size)
    const out = new Uint8Array(Math.max(0, end - from))
    for (const p of parts) {
      const a = Math.max(from, p.at)
      const b = Math.min(end, p.at + p.bytes.length)
      if (b > a) out.set(p.bytes.subarray(a - p.at, b - p.at), a - from)
    }
    read += out.length
    return { arrayBuffer: async () => buffer(out) }
  }
  const file = { size, slice } as unknown as Blob
  const t = await readContainerTiming(file)
  near(t!.fileFps!, 60, 1e-9, 'file rate')
  note(`moov ${(tail.length / 1e6).toFixed(2)} MB; read ${(read / 1e6).toFixed(2)} MB of ${(size / 1e9).toFixed(2)} GB`)
  assert(read < 32 * 1024 * 1024, `read ${read} bytes`)
})

await check('a file that isn’t MP4 or MOV comes back as nothing', async () => {
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert((await readContainerTiming(new Blob([webm]))) === undefined, 'WebM was walked as MP4')
  assert((await readContainerTiming(new Blob([]))) === undefined, 'an empty file returned timing')
})

check('a box that claims to run past the end of its parent stops the walk', () => {
  const broken = cat(u32(8 + 4), ascii('moov'), u32(0xffffff00))
  const t = parseMoov(buffer(broken))
  assert(t.fileFps === undefined && t.captureFps === undefined, 'a malformed moov produced timing')
})

report()
