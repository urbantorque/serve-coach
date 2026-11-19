/**
 * Write a duration into a WebM a browser recorded a chunk at a time (N4.4).
 *
 * A recorder asked for a chunk a second streams its file: the segment and every
 * cluster are of unknown size, there is no seek index, and the segment's Info
 * has no Duration, so a video element reports a duration of Infinity. Seeking
 * still works, but everything that plans a read from the duration (the session
 * router, the reading plan, the crop segments) cannot. One element fixes it:
 * Duration, a float, added to Info.
 *
 * Inserting bytes is safe in exactly that kind of file, because nothing in it
 * points at a byte position. A file with a seek index (\`SeekHead\`) is left
 * alone, and so is one that already has a Duration or does not parse.
 *
 * Pure, on the file's first few kilobytes, so `webmDuration.test.ts` holds it on
 * a header built by hand.
 */

const EBML = 0x1a45dfa3
const SEGMENT = 0x18538067
const SEEK_HEAD = 0x114d9b74
const INFO = 0x1549a966
const TIMECODE_SCALE = 0x2ad7b1
const DURATION = 0x4489

/** How much of the file the header patch reads. Info sits in the first hundred bytes. */
export const HEADER_BYTES = 4096

function readSize(b: Uint8Array, at: number): { value: number; length: number; unknown: boolean } | undefined {
  const first = b[at]
  if (first === undefined || first === 0) return undefined
  let length = 1
  while (!(first & (0x80 >> (length - 1)))) length++
  let value = first & (0xff >> length)
  let unknown = value === 0xff >> length
  for (let i = 1; i < length; i++) {
    if (b[at + i] === undefined) return undefined
    value = value * 256 + b[at + i]
    if (b[at + i] !== 0xff) unknown = false
  }
  return { value, length, unknown }
}

function readId(b: Uint8Array, at: number): { id: number; length: number } | undefined {
  const first = b[at]
  if (first === undefined || first === 0) return undefined
  let length = 1
  while (length <= 4 && !(first & (0x80 >> (length - 1)))) length++
  if (length > 4) return undefined
  let id = 0
  for (let i = 0; i < length; i++) id = id * 256 + b[at + i]
  return { id, length }
}

function writeSize(value: number, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let v = value
  for (let i = length - 1; i >= 0; i--) {
    out[i] = v & 0xff
    v = Math.floor(v / 256)
  }
  out[0] |= 0x80 >> (length - 1)
  return out
}

/**
 * The header with Duration added, in milliseconds of media time, or undefined
 * when it should be left as it is: already timed, indexed, or not a WebM.
 */
export function patchDuration(header: Uint8Array, durationMs: number): Uint8Array | undefined {
  if (!(durationMs > 0)) return undefined
  const head = readId(header, 0)
  if (head?.id !== EBML) return undefined
  const headSize = readSize(header, head.length)
  if (!headSize || headSize.unknown) return undefined
  const segAt = head.length + headSize.length + headSize.value
  const seg = readId(header, segAt)
  if (seg?.id !== SEGMENT) return undefined
  const segSize = readSize(header, segAt + seg.length)
  if (!segSize) return undefined
  let at = segAt + seg.length + segSize.length
  while (at < header.length) {
    const id = readId(header, at)
    const size = id && readSize(header, at + id.length)
    if (!id || !size) return undefined
    if (id.id === SEEK_HEAD) return undefined
    const dataAt = at + id.length + size.length
    if (id.id === INFO) {
      if (size.unknown || dataAt + size.value > header.length) return undefined
      let scale = 1_000_000
      for (let p = dataAt; p < dataAt + size.value; ) {
        const cid = readId(header, p)
        const csize = cid && readSize(header, p + cid.length)
        if (!cid || !csize) return undefined
        const cdata = p + cid.length + csize.length
        if (cid.id === DURATION) return undefined
        if (cid.id === TIMECODE_SCALE) {
          scale = 0
          for (let k = 0; k < csize.value; k++) scale = scale * 256 + header[cdata + k]
        }
        p = cdata + csize.value
      }
      const duration = new Uint8Array(11)
      duration.set([0x44, 0x89, 0x88], 0)
      new DataView(duration.buffer).setFloat64(3, durationMs * (1_000_000 / scale))
      const newSize = writeSize(size.value + duration.length, 8)
      const out = new Uint8Array(header.length + duration.length + (8 - size.length))
      let w = 0
      out.set(header.subarray(0, at + id.length), w)
      w += at + id.length
      out.set(newSize, w)
      w += 8
      out.set(header.subarray(dataAt, dataAt + size.value), w)
      w += size.value
      out.set(duration, w)
      w += duration.length
      out.set(header.subarray(dataAt + size.value), w)
      return out
    }
    if (size.unknown) return undefined
    at = dataAt + size.value
  }
  return undefined
}

/** The whole recording with Duration written in, read in a stream: only the header is held in memory. */
export async function withDuration(file: Blob, durationMs: number): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer())
  const patched = patchDuration(head, durationMs)
  return patched ? new Blob([patched as Uint8Array<ArrayBuffer>, file.slice(HEADER_BYTES)], { type: file.type }) : file
}
