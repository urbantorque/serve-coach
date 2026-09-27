// Removing sound from a kept video (D4): audio tracks gone, audio bytes zeroed, video untouched.
import { existsSync, openAsBlob } from 'node:fs'
import { join } from 'node:path'
import { createFile, MP4BoxBuffer, type Movie } from 'mp4box'
import { describe, expect, it } from 'vitest'
import { fourccBytes, mp4VideoOnly, mp4WithAudio, VIDEO_BYTE } from './mp4Fixture.ts'
import { mergeRanges, planStrip, stripAudio, StripAudioError, topLevelBoxes } from './stripAudio.ts'

describe('stripAudio', () => {
  it('zeroes every audio sample, turns the audio track into free space and keeps the video bytes', async () => {
    const bytes = mp4WithAudio()
    const out = new Uint8Array(await (await stripAudio(new Blob([bytes], { type: 'video/mp4' }))).arrayBuffer())
    expect(out.byteLength).toBe(bytes.byteLength)
    expect([...out.slice(34, 40)].every((b) => b === 0)).toBe(true)
    expect([...out.slice(50, 54)].every((b) => b === 0)).toBe(true)
    expect([...out.slice(24, 34), ...out.slice(40, 50)].every((b) => b === VIDEO_BYTE)).toBe(true)
    // No 'soun' handler and no audio 'trak' left in the movie header.
    const text = String.fromCharCode(...out)
    expect(text.includes('soun')).toBe(false)
    expect(text.split('trak').length - 1).toBe(1)
    expect(text.includes('free')).toBe(true)
    // Idempotent: a second pass finds nothing to remove.
    const top = await topLevelBoxes(new Blob([out]))
    const moov = top.find((b) => b.type === 'moov')!
    expect(planStrip(top, out.slice(moov.start, moov.end)).audioTracks).toBe(0)
  })

  it('reads 64-bit chunk offsets', async () => {
    const out = new Uint8Array(await (await stripAudio(new Blob([mp4WithAudio({ wide: true })]))).arrayBuffer())
    expect([...out.slice(34, 40), ...out.slice(50, 54)].every((b) => b === 0)).toBe(true)
  })

  it('returns a file without sound unchanged', async () => {
    const blob = new Blob([mp4VideoOnly()])
    expect(await stripAudio(blob)).toBe(blob)
  })

  it('refuses layouts it cannot rewrite safely', async () => {
    await expect(stripAudio(new Blob([mp4WithAudio({ fragmented: true })]))).rejects.toBeInstanceOf(StripAudioError)
    await expect(stripAudio(new Blob([new Uint8Array([0, 0, 0, 9, ...fourccBytes('ftyp')])]))).rejects.toBeInstanceOf(StripAudioError)
    await expect(stripAudio(new Blob([new Uint8Array(4096)]))).rejects.toBeInstanceOf(StripAudioError)
  })

  it('merges overlapping ranges', () => {
    expect(mergeRanges([{ start: 5, end: 9 }, { start: 0, end: 3 }, { start: 8, end: 12 }, { start: 3, end: 3 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 12 },
    ])
  })

  const clip = join(process.cwd(), '../validation/synthetic/clips/baseline-s1/baseline-s1.mp4')
  it.skipIf(!existsSync(clip))('removes the sound track from a real clip (synthetic corpus)', async () => {
    const blob = await openAsBlob(clip, { type: 'video/mp4' })
    const tracks = async (b: Blob) => {
      const file = createFile(false)
      let movie: Movie | undefined
      file.onReady = (m) => {
        movie = m
      }
      file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(await b.arrayBuffer(), 0))
      file.flush()
      return movie?.tracks.map((t) => (t.video ? 'video' : t.audio ? 'audio' : 'other')) ?? []
    }
    expect(await tracks(blob)).toContain('audio')
    const out = await stripAudio(blob)
    expect(out.size).toBe(blob.size)
    expect(await tracks(out)).toEqual(['video'])
  })
})
