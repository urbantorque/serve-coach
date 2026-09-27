// Runs in Node (the engine project): fake-indexeddb stores Node Blobs, which jsdom's Blob is not.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDbForTests } from '../data/db.ts'
import { getRecordingHeader, listRecordings, readRecording } from '../data/index.ts'
import { activeRecordings, ClipRecorder, idbChunkStore, type ChunkStore, type RecorderLike } from '../ui/screens/record/live/recorder.ts'
import { clipLength, readRecoveryFacts, recoveredRecordingFacts, recoveryFacts, recordedWhen, UNKNOWN_BLOCK } from '../ui/screens/record/live/recovery.ts'

/** A MediaRecorder stand-in: the test pushes chunks and stops it. */
class FakeRecorder implements RecorderLike {
  mimeType = 'video/webm;codecs=vp9'
  state: RecorderLike['state'] = 'inactive'
  ondataavailable: RecorderLike['ondataavailable'] = null
  onerror: RecorderLike['onerror'] = null
  onstop: RecorderLike['onstop'] = null
  start() {
    this.state = 'recording'
  }
  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    setTimeout(() => this.onstop?.({}), 0)
  }
  push(text: string) {
    this.ondataavailable?.({ data: new Blob([text], { type: 'video/webm' }) })
  }
}

const track = { addEventListener: () => undefined }
const stream = { getVideoTracks: () => [track] } as unknown as MediaStream
const flush = () => new Promise((r) => setTimeout(r, 0))

function recorderWith(store: ChunkStore | null, facts?: Record<string, unknown>) {
  let fake!: FakeRecorder
  const rec = new ClipRecorder(stream, {
    store,
    facts,
    isTypeSupported: (t) => t.startsWith('video/webm'),
    createRecorder: () => (fake = new FakeRecorder()),
  })
  rec.start()
  return { rec, fake: () => fake }
}

beforeEach(async () => {
  await resetDbForTests()
  vi.stubGlobal('MediaStream', class {
    constructor(readonly tracks: unknown[]) {}
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  activeRecordings.clear()
})

describe('ClipRecorder chunk persistence', () => {
  it('writes each chunk to IndexedDB as it arrives and reads the clip back at the end', async () => {
    const { rec, fake } = recorderWith(idbChunkStore, { v: 1, note: 'start facts' })
    fake().push('a;')
    fake().push('b;')
    // Mid-recording: already on disk, so a crash now keeps both chunks.
    await vi.waitFor(async () => expect((await readRecording(rec.recordingId))?.chunks).toBe(2))
    expect(activeRecordings.has(rec.recordingId)).toBe(true)
    fake().push('c;')
    rec.stop()
    const clip = await rec.done
    expect(await clip.blob.text()).toBe('a;b;c;')
    expect(clip.blob.type).toBe('video/webm')
    expect(clip.interrupted).toBe(false)
    expect(await getRecordingHeader(rec.recordingId)).toMatchObject({ facts: { note: 'start facts' }, interrupted: false })
    expect((await getRecordingHeader(rec.recordingId))?.stoppedAt).toBeGreaterThan(0)
  })

  it('keeps the chunks until the session has the clip, and deletes them on discard', async () => {
    const saved = recorderWith(idbChunkStore)
    saved.fake().push('x')
    saved.rec.stop()
    await saved.rec.done
    saved.rec.claim('session-1')
    expect(activeRecordings.has(saved.rec.recordingId)).toBe(false)
    await vi.waitFor(async () => expect(await getRecordingHeader(saved.rec.recordingId)).toMatchObject({ sessionId: 'session-1' }))
    saved.rec.discard() // no-op once claimed
    await flush()
    expect(await readRecording(saved.rec.recordingId)).not.toBeNull()

    const dropped = recorderWith(idbChunkStore)
    dropped.fake().push('y')
    dropped.rec.stop()
    await dropped.rec.done
    dropped.rec.discard()
    await vi.waitFor(async () => expect((await listRecordings()).map((r) => r.recordingId)).toEqual([saved.rec.recordingId]))
  })

  it('falls back to memory when storage is unavailable, keeping what was already written', async () => {
    let failAfter = 1
    const flaky: ChunkStore = {
      ...idbChunkStore,
      append: async (id, seq, blob) => {
        if (failAfter-- <= 0) throw new Error('storage unavailable')
        return idbChunkStore.append(id, seq, blob)
      },
    }
    const { rec, fake } = recorderWith(flaky)
    fake().push('1;')
    fake().push('2;')
    fake().push('3;')
    rec.stop()
    const clip = await rec.done
    expect(await clip.blob.text()).toBe('1;2;3;')
    expect(clip.interrupted).toBe(false)

    const memoryOnly = recorderWith(null)
    memoryOnly.fake().push('m;')
    memoryOnly.rec.stop()
    expect(await (await memoryOnly.rec.done).blob.text()).toBe('m;')
  })

  it('stops and marks the clip interrupted when the phone runs out of space', async () => {
    const full: ChunkStore = {
      ...idbChunkStore,
      append: async (id, seq, blob) => {
        if (seq >= 1) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' })
        return idbChunkStore.append(id, seq, blob)
      },
    }
    const { rec, fake } = recorderWith(full)
    fake().push('ok;')
    fake().push('full;')
    const clip = await rec.done
    expect(clip.interrupted).toBe(true)
    expect(clip.reason).toBe('storage-full')
    expect(await clip.blob.text()).toBe('ok;full;')
  })
})

describe('recovered recording facts', () => {
  const header = {
    mimeType: 'video/mp4;codecs=avc1',
    startedAt: Date.parse('2026-09-26T08:40:00Z'),
    facts: recoveryFacts({
      recording: {
        requested: { width: 1920, height: 1080, fps: 60 },
        delivered: { width: 1080, height: 1920, fps: 60 },
        orientation: 'portrait',
        setup: 'portrait',
        orientationSamples: [{ tMs: 0, pitchDeg: 1, rollDeg: 0 }],
        expectedServeCount: 15,
      },
      block: { side: 'deuce', serveNumber: 1 },
      template: 'check-in',
    }),
  }

  it('reads what the recorder kept at start, and prefers the probe for the file itself', () => {
    expect(readRecoveryFacts(header)?.block).toEqual({ side: 'deuce', serveNumber: 1 })
    const f = recoveredRecordingFacts(header, { width: 720, height: 1280, captureFps: 30, durationMediaS: 95 }, 90)
    expect(f).toMatchObject({ delivered: { width: 720, height: 1280, fps: 30 }, orientation: 'portrait', durationS: 95, expectedServeCount: 15, mimeType: 'video/mp4;codecs=avc1' })
    expect(f.orientationSamples).toHaveLength(1)
  })

  it('assumes nothing about the block when the facts are missing', () => {
    expect(readRecoveryFacts({ mimeType: 'video/webm', startedAt: 0 })).toBeNull()
    const f = recoveredRecordingFacts({ mimeType: 'video/webm', startedAt: 0 }, null, 42)
    expect(f).toMatchObject({ durationS: 42, orientation: 'portrait', delivered: { width: 0, height: 0, fps: 0 } })
    expect(f.orientationSamples).toBeUndefined()
    expect(UNKNOWN_BLOCK).toEqual({ side: 'both', serveNumber: 'mixed' })
  })

  it('words the length and time', () => {
    expect(clipLength(220.4)).toBe('3:40')
    expect(clipLength(7)).toBe('0:07')
    expect(recordedWhen(new Date(2026, 8, 26, 18, 40).getTime())).toBe('Sat 26 Sep at 6:40 pm')
    expect(recordedWhen(new Date(2026, 8, 27, 0, 5).getTime())).toBe('Sun 27 Sep at 12:05 am')
  })
})
