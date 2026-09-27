/**
 * Removes the sound from an MP4 / MOV before the app keeps a copy (D4 invariant: a stored video never
 * has an audio track; ARCHITECTURE §5.1). The analysis pipeline (analysis/pipeline/persist.ts) picks
 * this module up by name.
 *
 * No re-encode and no decode: the file is rewritten in place, box by box.
 *   1. Every audio track box ('trak' whose handler is 'soun') is turned into a 'free' box of the same
 *      size with its contents zeroed, so no other offset in the file moves.
 *   2. Every byte of every audio sample in 'mdat' (from the track's chunk offsets and sample sizes) is
 *      overwritten with zeros, so the recording's sound is not in the kept copy at all.
 * The video samples, their offsets and the file size are unchanged. The output is built from slices of
 * the picked file (Blob parts), so a long clip is never read into memory as a whole; only 'moov' is.
 *
 * Unsupported layouts throw (the caller then keeps no copy and says so): fragmented MP4 ('moof' /
 * 'mvex'), compressed movie headers ('cmov'), compact sample sizes ('stz2'), or sample ranges that do
 * not sit inside 'mdat'.
 */

export class StripAudioError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StripAudioError'
  }
}

export interface BoxHeader {
  type: string
  /** Absolute offset of the box start. */
  start: number
  /** Header length (8, or 16 with a 64-bit size). */
  header: number
  /** Absolute end offset (exclusive). */
  end: number
}

const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])

/** Reads one box header from `bytes` at `at`; the box must end by `limit`. */
function headerIn(bytes: Uint8Array, at: number, limit: number): BoxHeader {
  if (at + 8 > limit) throw new StripAudioError('truncated box header')
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let size = v.getUint32(at)
  const type = fourcc(bytes, at + 4)
  let header = 8
  if (size === 1) {
    if (at + 16 > limit) throw new StripAudioError('truncated 64-bit box header')
    size = Number(v.getBigUint64(at + 8))
    header = 16
  } else if (size === 0) size = limit - at
  if (size < header || at + size > limit) throw new StripAudioError(`bad size for box ${type}`)
  return { type, start: at, header, end: at + size }
}

/** Direct children of a box whose payload spans bytes[from, to). */
function children(bytes: Uint8Array, from: number, to: number): BoxHeader[] {
  const out: BoxHeader[] = []
  let at = from
  while (at + 8 <= to) {
    const h = headerIn(bytes, at, to)
    out.push(h)
    at = h.end
  }
  return out
}

const child = (bytes: Uint8Array, box: BoxHeader, type: string) => children(bytes, box.start + box.header, box.end).find((c) => c.type === type)

/** Handler type of a 'trak' ('vide', 'soun', 'meta', …), or '' when it has none. */
function handlerOf(moov: Uint8Array, trak: BoxHeader): string {
  const mdia = child(moov, trak, 'mdia')
  const hdlr = mdia && child(moov, mdia, 'hdlr')
  if (!hdlr) return ''
  // FullBox: version+flags (4), pre_defined (4), handler_type (4).
  return fourcc(moov, hdlr.start + hdlr.header + 8)
}

export interface ByteRange {
  start: number
  end: number
}

/** Absolute byte ranges of every sample of one track (chunk offsets + sample sizes + sample-to-chunk). */
export function sampleRanges(moov: Uint8Array, trak: BoxHeader): ByteRange[] {
  const mdia = child(moov, trak, 'mdia')
  const minf = mdia && child(moov, mdia, 'minf')
  const stbl = minf && child(moov, minf, 'stbl')
  if (!stbl) throw new StripAudioError('track without a sample table')
  const boxes = children(moov, stbl.start + stbl.header, stbl.end)
  if (boxes.some((b) => b.type === 'stz2')) throw new StripAudioError('compact sample sizes are not supported')
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength)
  const stsz = boxes.find((b) => b.type === 'stsz')
  const stsc = boxes.find((b) => b.type === 'stsc')
  const stco = boxes.find((b) => b.type === 'stco')
  const co64 = boxes.find((b) => b.type === 'co64')
  if (!stsz || !stsc || (!stco && !co64)) throw new StripAudioError('incomplete sample table')

  // Sample sizes.
  const pz = stsz.start + stsz.header + 4
  const constant = v.getUint32(pz)
  const sampleCount = v.getUint32(pz + 4)
  const sizeOf = (i: number) => (constant !== 0 ? constant : v.getUint32(pz + 8 + 4 * i))
  if (constant === 0 && pz + 8 + 4 * sampleCount > stsz.end) throw new StripAudioError('truncated sample sizes')

  // Chunk offsets.
  const offsets: number[] = []
  if (co64) {
    const p = co64.start + co64.header + 4
    const n = v.getUint32(p)
    if (p + 4 + 8 * n > co64.end) throw new StripAudioError('truncated chunk offsets')
    for (let i = 0; i < n; i++) offsets.push(Number(v.getBigUint64(p + 4 + 8 * i)))
  } else if (stco) {
    const p = stco.start + stco.header + 4
    const n = v.getUint32(p)
    if (p + 4 + 4 * n > stco.end) throw new StripAudioError('truncated chunk offsets')
    for (let i = 0; i < n; i++) offsets.push(v.getUint32(p + 4 + 4 * i))
  }

  // Sample-to-chunk runs: (first_chunk (1-based), samples_per_chunk).
  const ps = stsc.start + stsc.header + 4
  const runs = v.getUint32(ps)
  if (ps + 4 + 12 * runs > stsc.end) throw new StripAudioError('truncated sample-to-chunk table')
  const runAt = (i: number) => ({ first: v.getUint32(ps + 4 + 12 * i), perChunk: v.getUint32(ps + 8 + 12 * i) })

  const out: ByteRange[] = []
  let sample = 0
  for (let r = 0; r < runs; r++) {
    const { first, perChunk } = runAt(r)
    const last = r + 1 < runs ? runAt(r + 1).first - 1 : offsets.length
    for (let c = first; c <= last && c <= offsets.length; c++) {
      let bytes = 0
      for (let k = 0; k < perChunk && sample < sampleCount; k++, sample++) bytes += sizeOf(sample)
      if (bytes > 0) out.push({ start: offsets[c - 1], end: offsets[c - 1] + bytes })
    }
  }
  return out
}

/** Sorted, merged copy of `ranges`. */
export function mergeRanges(ranges: readonly ByteRange[]): ByteRange[] {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start)
  const out: ByteRange[] = []
  for (const r of sorted) {
    const last = out.at(-1)
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

export interface StripPlan {
  /** The rewritten 'moov' (same length as the original). */
  moov: Uint8Array
  moovRange: ByteRange
  /** Audio sample bytes to overwrite with zeros (sorted, merged, all inside 'mdat'). */
  zero: ByteRange[]
  audioTracks: number
}

/**
 * Plans the rewrite from the top-level box list and the 'moov' bytes. Pure (no I/O), so it is tested
 * on hand-built files.
 */
export function planStrip(top: readonly BoxHeader[], moovBytes: Uint8Array): StripPlan {
  const moovBox = top.find((b) => b.type === 'moov')
  if (!moovBox) throw new StripAudioError('no movie header')
  if (top.some((b) => b.type === 'moof')) throw new StripAudioError('fragmented files are not supported')
  const moov = moovBytes.slice()
  // Offsets inside `moov` are relative to the moov box start.
  const rel: BoxHeader = { ...moovBox, start: 0, end: moovBox.end - moovBox.start }
  const kids = children(moov, rel.header, rel.end)
  if (kids.some((k) => k.type === 'cmov')) throw new StripAudioError('compressed movie headers are not supported')
  if (kids.some((k) => k.type === 'mvex')) throw new StripAudioError('fragmented files are not supported')
  const mdats = top.filter((b) => b.type === 'mdat').map((b) => ({ start: b.start + b.header, end: b.end }))
  const zero: ByteRange[] = []
  let audioTracks = 0
  for (const trak of kids.filter((k) => k.type === 'trak')) {
    if (handlerOf(moov, trak) !== 'soun') continue
    audioTracks++
    zero.push(...sampleRanges(moov, trak))
    // 'trak' → 'free' of the same size, contents zeroed.
    moov.fill(0, trak.start + trak.header, trak.end)
    moov.set([0x66, 0x72, 0x65, 0x65], trak.start + 4)
  }
  const merged = mergeRanges(zero)
  for (const r of merged) {
    if (!mdats.some((m) => r.start >= m.start && r.end <= m.end)) throw new StripAudioError('audio samples outside the media data')
  }
  return { moov, moovRange: { start: moovBox.start, end: moovBox.end }, zero: merged, audioTracks }
}

async function readBytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

/** Top-level boxes of the file (headers only). */
export async function topLevelBoxes(file: Blob): Promise<BoxHeader[]> {
  const out: BoxHeader[] = []
  let at = 0
  while (at < file.size) {
    if (file.size - at < 8) throw new StripAudioError('trailing bytes after the last box')
    const head = await readBytes(file, at, Math.min(file.size, at + 16))
    const v = new DataView(head.buffer, head.byteOffset, head.byteLength)
    let size = v.getUint32(0)
    const type = fourcc(head, 4)
    let header = 8
    if (size === 1) {
      if (head.byteLength < 16) throw new StripAudioError('truncated 64-bit box header')
      size = Number(v.getBigUint64(8))
      header = 16
    } else if (size === 0) size = file.size - at
    if (size < header || at + size > file.size) throw new StripAudioError(`bad size for box ${type}`)
    out.push({ type, start: at, header, end: at + size })
    at += size
  }
  return out
}

const ZERO_CHUNK = 1 << 16

/**
 * The clip without any sound: same size, same video bytes, audio tracks removed and audio samples
 * zeroed. Returns the file unchanged when it has no audio track. Throws StripAudioError when the
 * layout is not supported.
 */
export async function stripAudio(file: Blob): Promise<Blob> {
  const top = await topLevelBoxes(file)
  const moovBox = top.find((b) => b.type === 'moov')
  if (!moovBox) throw new StripAudioError('no movie header')
  const plan = planStrip(top, await readBytes(file, moovBox.start, moovBox.end))
  if (plan.audioTracks === 0) return file
  const zeros = new Uint8Array(ZERO_CHUNK)
  const cuts = [...plan.zero.map((r) => ({ ...r, moov: false })), { ...plan.moovRange, moov: true }].sort((a, b) => a.start - b.start)
  const parts: BlobPart[] = []
  let cursor = 0
  for (const c of cuts) {
    if (c.start < cursor) throw new StripAudioError('overlapping ranges')
    if (c.start > cursor) parts.push(file.slice(cursor, c.start))
    if (c.moov) parts.push(plan.moov as Uint8Array<ArrayBuffer>)
    else {
      let left = c.end - c.start
      while (left > 0) {
        const n = Math.min(left, ZERO_CHUNK)
        parts.push(n === ZERO_CHUNK ? zeros : zeros.subarray(0, n))
        left -= n
      }
    }
    cursor = c.end
  }
  if (cursor < file.size) parts.push(file.slice(cursor))
  const out = new Blob(parts, { type: file.type || 'video/mp4' })
  if (out.size !== file.size) throw new StripAudioError('size changed while removing sound')
  return out
}
