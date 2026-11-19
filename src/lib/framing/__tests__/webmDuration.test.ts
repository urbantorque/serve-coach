/** A duration written into a WebM recorded a chunk at a time (N4.4). */
import { patchDuration } from '../webmDuration'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

/**
 * The start of a streamed recording, shaped like the one Chrome writes with a
 * timeslice (read off a real one on 2026-11-19): the EBML header, a segment of
 * unknown size, Info with a timecode scale and two names, Tracks, then a cluster
 * of unknown size.
 */
function streamedHeader(extraInfo: number[] = [], seekHead = false): Uint8Array {
  const ebml = [0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x42, 0x86, 0x81, 0x01]
  const segment = [0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
  const scale = [0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]
  const app = [0x4d, 0x80, 0x82, 0x41, 0x42]
  const info = [...scale, ...app, ...extraInfo]
  const infoEl = [0x15, 0x49, 0xa9, 0x66, 0x80 | info.length, ...info]
  const tracks = [0x16, 0x54, 0xae, 0x6b, 0x82, 0xae, 0x80]
  const seek = seekHead ? [0x11, 0x4d, 0x9b, 0x74, 0x80] : []
  const cluster = [0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xe7, 0x81, 0x00]
  return new Uint8Array([...ebml, ...segment, ...seek, ...infoEl, ...tracks, ...cluster])
}

/** The Duration a patched header carries, in milliseconds at the default scale, or undefined. */
function durationIn(b: Uint8Array): number | undefined {
  for (let i = 0; i + 11 <= b.length; i++) {
    if (b[i] === 0x44 && b[i + 1] === 0x89 && b[i + 2] === 0x88) return new DataView(b.buffer, b.byteOffset + i + 3, 8).getFloat64(0)
  }
  return undefined
}

heading('A streamed recording gets its length')

check('Duration goes into Info, Info grows to hold it, and nothing after it moves but by that much', () => {
  const head = streamedHeader()
  const out = patchDuration(head, 6000)
  assert(out !== undefined, 'a streamed header was not patched')
  assert(durationIn(out!) === 6000, `the duration read back as ${durationIn(out!)}`)
  // Info's size written in eight bytes now, and holding the eleven of Duration.
  const infoAt = 21
  assert(out![infoAt] === 0x15 && out![infoAt + 4] === 0x01, 'Info lost its place or its size width')
  const grew = out!.length - head.length
  const tail = head.slice(head.length - 22)
  assert(out!.slice(out!.length - 22).join() === tail.join(), 'the bytes after Info changed')
  assert(grew === 11 + 7, `grew by ${grew}`)
})

heading('A file it should not touch is left alone')

check('already timed, indexed, not a WebM, or no length to give', () => {
  assert(patchDuration(streamedHeader([0x44, 0x89, 0x84, 0x45, 0x00, 0x00, 0x00]), 6000) === undefined, 'a second Duration was added')
  assert(patchDuration(streamedHeader([], true), 6000) === undefined, 'a file with a seek index was shifted')
  assert(patchDuration(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), 6000) === undefined, 'an MP4 was patched')
  assert(patchDuration(streamedHeader(), 0) === undefined, 'a zero length was written in')
})

report()
