/**
 * What the video file itself says about time: its frame rate, and the rate the
 * camera really captured at when that is different.
 *
 * WHY. The filming guide asks for slow motion, and a phone's slow motion is
 * usually *stretched*: shot at 120 or 240 frames a second and written as a file
 * that plays at 30, so every second of serve becomes four or eight seconds of
 * file. The engine reads time off the file, so on that clip a racket that
 * travels from drop to ball in a seventh of a second appears to take half a
 * second, and the ball appears to fall at a sixteenth of gravity. Until now the
 * app could only notice the motion looked slow and hedge (`looksSlowedDown`).
 *
 * Android says so in the file. Its recorder writes the capture rate under the
 * key `com.android.capture.fps`, beside the ordinary track timing, and the
 * ratio of the two is the stretch exactly. iPhone exports bake the slow motion
 * into the timestamps and leave no such key, which is why `slowMotion.ts` also
 * reads the stretch off the ball's own fall.
 *
 * WHAT IS READ, AND HOW LITTLE. Only box headers are walked at the top level,
 * eight or sixteen bytes at a time, so a 400 MB clip costs a handful of small
 * reads to find the `moov` box wherever the phone put it — usually the end.
 * `moov` itself is read whole, which is kilobytes for a short clip and is
 * capped regardless. Nothing is decoded and nothing leaves the device: this is
 * the player's own file, read in the player's own browser.
 *
 * DELIBERATELY SMALL. Not a demuxer: no edit lists, no fragmented files, no
 * sample tables beyond the frame count. Anything it does not understand comes
 * back as nothing, and nothing is the same answer the app had before it existed.
 */

export interface ContainerTiming {
  /** Frames per second the file plays at, from the video track's sample table. */
  fileFps?: number
  /** Frames per second the camera captured at, when the file records it. */
  captureFps?: number
}

/** `moov` larger than this is not read. A minute of video carries well under a megabyte. */
const MAX_MOOV_BYTES = 32 * 1024 * 1024

/** The capture-rate key Android's recorder writes into the `mdta` metadata. */
export const CAPTURE_FPS_KEY = 'com.android.capture.fps'

interface Box {
  type: string
  /** Offset of the payload, after the header. */
  start: number
  /** Offset one past the end of the box. */
  end: number
}

const fourcc = (view: DataView, at: number) =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3))

/** The boxes directly inside `[from, to)`, stopping at the first malformed one. */
function children(view: DataView, from: number, to: number): Box[] {
  const out: Box[] = []
  let at = from
  while (at + 8 <= to) {
    let size = view.getUint32(at)
    const type = fourcc(view, at + 4)
    let header = 8
    if (size === 1) {
      if (at + 16 > to) break
      size = Number(view.getBigUint64(at + 8))
      header = 16
    } else if (size === 0) {
      size = to - at
    }
    if (size < header || at + size > to) break
    out.push({ type, start: at + header, end: at + size })
    at += size
  }
  return out
}

const child = (view: DataView, box: Box, type: string) =>
  children(view, box.start, box.end).find((b) => b.type === type)

/** The video track's frame rate, from `mdhd`'s timescale and `stts`'s sample deltas. */
function videoFps(view: DataView, moov: Box): number | undefined {
  for (const trak of children(view, moov.start, moov.end).filter((b) => b.type === 'trak')) {
    const mdia = child(view, trak, 'mdia')
    if (!mdia) continue
    const hdlr = child(view, mdia, 'hdlr')
    if (!hdlr || hdlr.end - hdlr.start < 12 || fourcc(view, hdlr.start + 8) !== 'vide') continue
    const mdhd = child(view, mdia, 'mdhd')
    if (!mdhd) continue
    const version = view.getUint8(mdhd.start)
    const timescale = view.getUint32(mdhd.start + (version === 1 ? 20 : 12))
    const stts = child(view, child(view, child(view, mdia, 'minf') ?? mdia, 'stbl') ?? mdia, 'stts')
    if (!stts || !timescale) continue
    const entries = view.getUint32(stts.start + 4)
    let samples = 0
    let ticks = 0
    for (let i = 0; i < entries; i++) {
      const at = stts.start + 8 + i * 8
      if (at + 8 > stts.end) break
      const count = view.getUint32(at)
      samples += count
      ticks += count * view.getUint32(at + 4)
    }
    if (samples > 1 && ticks > 0) return samples / (ticks / timescale)
  }
  return undefined
}

/** A number from an `ilst` item's `data` box, by its well-known type. */
function dataNumber(view: DataView, item: Box): number | undefined {
  const data = child(view, item, 'data')
  if (!data || data.end - data.start < 9) return undefined
  const kind = view.getUint32(data.start) & 0xffffff
  const at = data.start + 8
  const len = data.end - at
  if (kind === 23 && len >= 4) return view.getFloat32(at)
  if (kind === 24 && len >= 8) return view.getFloat64(at)
  if ((kind === 21 || kind === 22) && len >= 1 && len <= 4) {
    let v = 0
    for (let i = 0; i < len; i++) v = v * 256 + view.getUint8(at + i)
    return kind === 21 && v >= 2 ** (8 * len - 1) ? v - 2 ** (8 * len) : v
  }
  if (kind === 1) {
    const text = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + at, len))
    const n = Number.parseFloat(text)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * One value from QuickTime `mdta` metadata (`meta` → `keys` + `ilst`), by key.
 *
 * QuickTime's `meta` has no version and flags, ISO's does. Told apart by
 * whether the payload starts with a box the walker recognises.
 */
function mdtaValue(view: DataView, meta: Box, key: string): number | undefined {
  const looksLikeBox = (at: number) => at + 8 <= meta.end && /^[a-z]{4}$/.test(fourcc(view, at + 4))
  const from = looksLikeBox(meta.start) ? meta.start : meta.start + 4
  const inner = children(view, from, meta.end)
  const keys = inner.find((b) => b.type === 'keys')
  const ilst = inner.find((b) => b.type === 'ilst')
  if (!keys || !ilst) return undefined

  const count = view.getUint32(keys.start + 4)
  let at = keys.start + 8
  let index = 0
  for (let i = 1; i <= count && at + 8 <= keys.end; i++) {
    const size = view.getUint32(at)
    if (size < 8 || at + size > keys.end) break
    const name = new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + at + 8, size - 8))
    if (name === key) index = i
    at += size
  }
  if (!index) return undefined

  for (const item of children(view, ilst.start, ilst.end)) {
    // An item's box "type" is the key's 1-based index, as a big-endian integer.
    if (view.getUint32(item.start - 4) === index) return dataNumber(view, item)
  }
  return undefined
}

/** Timing from an already-read `moov` box (header included). */
export function parseMoov(bytes: ArrayBuffer): ContainerTiming {
  const view = new DataView(bytes)
  const moov = children(view, 0, view.byteLength).find((b) => b.type === 'moov')
  if (!moov) return {}
  const out: ContainerTiming = {}
  const fps = videoFps(view, moov)
  if (fps && Number.isFinite(fps)) out.fileFps = fps
  for (const box of children(view, moov.start, moov.end)) {
    const meta = box.type === 'meta' ? box : box.type === 'udta' ? child(view, box, 'meta') : undefined
    if (!meta) continue
    const capture = mdtaValue(view, meta, CAPTURE_FPS_KEY)
    if (capture && Number.isFinite(capture) && capture > 0) {
      out.captureFps = capture
      break
    }
  }
  return out
}

/**
 * Find and read the file's `moov`, wherever it is, and parse its timing.
 *
 * `undefined` for anything that is not an MP4/MOV the walker understands —
 * WebM from the in-app recorder among them, which has no stretch to find.
 */
export async function readContainerTiming(file: Blob): Promise<ContainerTiming | undefined> {
  try {
    let at = 0
    while (at + 8 <= file.size) {
      const head = new DataView(await file.slice(at, at + 16).arrayBuffer())
      if (head.byteLength < 8) return undefined
      let size = head.getUint32(0)
      const type = fourcc(head, 4)
      if (size === 1) {
        if (head.byteLength < 16) return undefined
        size = Number(head.getBigUint64(8))
      } else if (size === 0) {
        size = file.size - at
      }
      if (size < 8) return undefined
      // The first box of any MP4 or MOV is one of these. Anything else is a
      // file this reader has no business walking.
      if (at === 0 && !['ftyp', 'moov', 'wide', 'free', 'mdat', 'skip'].includes(type)) return undefined
      if (type === 'moov') {
        if (size > MAX_MOOV_BYTES) return undefined
        return parseMoov(await file.slice(at, at + size).arrayBuffer())
      }
      at += size
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * How many times slower than life the file plays, from its own metadata.
 *
 * Only a ratio well clear of one counts: a 30 fps clip tagged with a capture
 * rate of 30, or 29.97 against 30, is a real-time clip.
 */
export function stretchFromContainer(timing: ContainerTiming | undefined): number | undefined {
  if (!timing?.fileFps || !timing.captureFps) return undefined
  const ratio = timing.captureFps / timing.fileFps
  return ratio >= 1.5 ? ratio : undefined
}
