import { beforeAll, describe, expect, it } from 'vitest'
import { ensureFixtures, readFixture } from './__fixtures__/fixtures.mjs'
import { probeVideo, ProbeError } from './probe.ts'
import { QT_KEYS } from './qtMetadata.ts'

beforeAll(() => {
  ensureFixtures()
}, 120_000)

describe('probeVideo on ffmpeg fixtures', () => {
  it('reads a 60 fps H.264 + AAC clip with B-frames', async () => {
    const probe = await probeVideo(readFixture('cfr60.mp4'), { fileName: 'cfr60.mp4', chunkBytes: 16 * 1024 })
    const { meta } = probe

    expect(probe.container).toBe('mp4')
    expect(meta.codec).toMatch(/^avc1\.64/)
    expect(meta.width).toBe(320)
    expect(meta.height).toBe(180)
    expect(meta.rotationDeg).toBe(0)
    expect(meta.frameCount).toBe(120)
    expect(meta.nominalFps).toBeCloseTo(60, 6)
    expect(meta.isVariableFrameRate).toBe(false)
    expect(meta.durationMediaS).toBeCloseTo(2, 6)
    expect(meta.hasAudio).toBe(true)
    expect(meta.timeScale).toBe(1)
    expect(probe.timeBase.status).toBe('unknown') // a 60 fps file cannot prove it is not rendered slow motion

    // Presentation order with the B-frame composition offset removed by the edit list.
    probe.frames.forEach((frame, i) => {
      expect(frame.index).toBe(i)
      expect(frame.tMedia).toBeCloseTo(i / 60, 9)
    })
    // Decode order differs from presentation order when B-frames are present.
    expect(probe.frames.some((f) => f.sampleIndex !== f.index)).toBe(true)
    expect(probe.frames.filter((f) => f.isKeyframe).map((f) => f.index)).toEqual([0, 30, 60, 90])

    expect(probe.video.description?.[0]).toBe(1) // avcC configurationVersion
    expect(probe.audio?.codec).toBe('mp4a.40.2')
    expect(probe.audio?.sampleRate).toBe(48000)
    expect(probe.audio?.primingS).toBeCloseTo(1024 / 48000, 9)
    expect(probe.audio?.description?.length).toBeGreaterThanOrEqual(2)
  })

  it('reads the display rotation from the track matrix', async () => {
    const probe = await probeVideo(readFixture('rot90.mp4'))
    expect(probe.meta.rotationDeg).toBe(90)
    expect(probe.meta.width).toBe(180)
    expect(probe.meta.height).toBe(320)
    expect(probe.video.codedWidth).toBe(320)
    expect(probe.video.codedHeight).toBe(180)
  })

  it('drops pre-roll frames outside the edit list after a stream-copy trim', async () => {
    const probe = await probeVideo(readFixture('trimmed.mp4'))
    // ffmpeg -ss 0.3 -c copy keeps the GOP from frame 0 but the edit starts at source frame 18.
    expect(probe.video.samples.length).toBe(120)
    expect(probe.meta.frameCount).toBe(102)
    expect(probe.frames[0].tMedia).toBeCloseTo(0, 9)
    expect(probe.frames[0].isKeyframe).toBe(false)
    expect(probe.meta.durationMediaS).toBeCloseTo(1.7, 6)
  })

  it('detects a variable frame rate step', async () => {
    const probe = await probeVideo(readFixture('vfr.mp4'))
    expect(probe.meta.frameCount).toBe(60)
    expect(probe.meta.isVariableFrameRate).toBe(true)
    expect(probe.timing.segments.map((s) => Math.round(s.fps))).toEqual([60, 30])
    expect(probe.timing.segments[0].endIndex).toBe(30)
    expect(probe.frames[45].tMedia).toBeCloseTo(0.5 + 15 / 30, 9)
  })

  it('treats a 240 fps timeline as native high-frame-rate capture and reads Apple keys', async () => {
    const probe = await probeVideo(readFixture('hfr240.mov'))
    expect(probe.container).toBe('mov')
    expect(probe.meta.nominalFps).toBeCloseTo(240, 6)
    expect(probe.meta.captureFps).toBeCloseTo(240, 6)
    expect(probe.meta.timeScale).toBe(1)
    expect(probe.meta.fpsSource).toBe('timestamps')
    expect(probe.timeBase.kind).toBe('native-high-fps')
    expect(probe.timeBase.status).toBe('proven')
    expect(probe.timeBase.playbackIntent).toBe('slow-motion')
    expect(probe.metadata.movie[QT_KEYS.make]).toBe('Apple')
    expect(probe.timeBase.device?.model).toBe('iPhone 15')
  })

  it('uses com.android.capture.fps to prove a time-scaled timeline', async () => {
    const probe = await probeVideo(readFixture('android240.mp4'))
    expect(probe.meta.nominalFps).toBeCloseTo(30, 6)
    expect(probe.meta.captureFps).toBe(240)
    expect(probe.meta.timeScale).toBeCloseTo(0.125, 9)
    expect(probe.meta.fpsSource).toBe('container')
    expect(probe.timeBase.kind).toBe('metadata-time-scaled')
    expect(probe.timeBase.status).toBe('proven')
  })

  it('reads the full sample table of a fragmented MP4', async () => {
    const probe = await probeVideo(readFixture('fragmented.mp4'), { chunkBytes: 8 * 1024 })
    expect(probe.isFragmented).toBe(true)
    expect(probe.meta.frameCount).toBe(120)
    expect(probe.frames[119].tMedia).toBeCloseTo(119 / 60, 9)
  })

  it('reports HEVC codec strings', async () => {
    const probe = await probeVideo(readFixture('hevc.mp4'))
    expect(probe.meta.codec).toMatch(/^hvc1\./)
    expect(probe.video.decoderCodec).toBe(probe.meta.codec)
    expect(probe.video.description?.[0]).toBe(1) // hvcC configurationVersion
  })

  it('rejects WebM with an unsupported-container error so callers can fall back', async () => {
    await expect(probeVideo(readFixture('vp9.webm'))).rejects.toMatchObject({
      name: 'ProbeError',
      code: 'unsupported-container',
      container: 'webm',
    })
  })

  it('rejects truncated files', async () => {
    const bytes = readFixture('cfr60.mp4')
    const truncated = bytes.slice(0, Math.floor(bytes.length / 2))
    await expect(probeVideo(truncated)).rejects.toBeInstanceOf(ProbeError)
  })
})
