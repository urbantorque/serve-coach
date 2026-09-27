import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDbForTests } from './db.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import {
  appendChunk,
  discardRecording,
  getRecordingHeader,
  HEADER_SEQ,
  listRecordings,
  readRecording,
  recordingFate,
  startRecordingRows,
  sweepRecordings,
  updateRecordingHeader,
  type RecordingSummary,
} from './repos/recordings.ts'
import { createSession } from './repos/sessions.ts'
import { addVideo } from './repos/videos.ts'

const NOW = Date.parse('2026-09-28T10:00:00.000Z')
const S = 1000
const DAY = 86_400_000

async function record(id: string, seconds: number, startedAt = NOW - 60 * S, extra: object = {}) {
  await startRecordingRows(id, { mimeType: 'video/webm;codecs=vp9', startedAt, ...extra }, startedAt)
  for (let i = 0; i < seconds; i++) await appendChunk(id, i, new Blob([`chunk-${i};`], { type: 'video/webm' }), startedAt + (i + 1) * S)
}

beforeEach(async () => {
  await resetDbForTests()
})

describe('recording chunks', () => {
  it('joins the media chunks in order, without the header row', async () => {
    await record('r1', 3)
    const out = await readRecording('r1')
    expect(out?.chunks).toBe(3)
    expect(out?.blob.type).toBe('video/webm')
    expect(await out!.blob.text()).toBe('chunk-0;chunk-1;chunk-2;')
    expect((await getDb().videoChunks.get(['r1', HEADER_SEQ]))?.blob.size).toBe(0)
  })

  it('merges header updates and keeps the start facts', async () => {
    await record('r2', 1, NOW, { facts: { setup: 'portrait' } })
    await updateRecordingHeader('r2', { stoppedAt: NOW + 5 * S, durationS: 5, interrupted: false })
    await updateRecordingHeader('r2', { sessionId: 's1', claimedAt: NOW + 6 * S })
    expect(await getRecordingHeader('r2')).toMatchObject({ mimeType: 'video/webm;codecs=vp9', facts: { setup: 'portrait' }, durationS: 5, sessionId: 's1' })
  })

  it('refuses a media chunk at the header position and deletes a recording completely', async () => {
    await expect(appendChunk('r3', -1, new Blob(['x']))).rejects.toThrow()
    await record('r3', 2)
    expect(await discardRecording('r3')).toBe(3)
    expect(await readRecording('r3')).toBeNull()
  })

  it('summarises recordings newest first, estimating seconds from chunks after a crash', async () => {
    await record('old', 4, NOW - 3 * DAY)
    await record('new', 7, NOW - DAY)
    const list = await listRecordings()
    expect(list.map((r) => r.recordingId)).toEqual(['new', 'old'])
    expect(list[0]).toMatchObject({ chunks: 7, seconds: 7 })
    expect(list[0].bytes).toBeGreaterThan(0)
  })
})

describe('recovery rules', () => {
  const summary = (patch: Partial<RecordingSummary> = {}): RecordingSummary => ({
    recordingId: 'r',
    chunks: 30,
    bytes: 30_000,
    seconds: 30,
    startedAt: NOW - DAY,
    lastWrittenAt: NOW - DAY + 30 * S,
    ...patch,
  })

  it('offers an unfinished clip once and leaves live ones alone', () => {
    expect(recordingFate(summary(), { now: NOW, rank: 0 })).toBe('recover')
    expect(recordingFate(summary({ lastWrittenAt: NOW - 2 * S }), { now: NOW, rank: 0 })).toBe('live')
    expect(recordingFate(summary(), { now: NOW, rank: 0, active: true })).toBe('live')
  })

  it('applies the clean-up rules: settled, too short, too old, over the cap', () => {
    const claimed = summary({ header: { mimeType: 'video/webm', startedAt: NOW - DAY, sessionId: 's1' } })
    expect(recordingFate(claimed, { now: NOW, rank: 0, sessionExists: true, sessionHasVideo: true })).toBe('settled')
    expect(recordingFate(claimed, { now: NOW, rank: 0, sessionExists: false })).toBe('settled')
    // The session was saved but its video never stored (a crash before analysis started): offer it.
    expect(recordingFate(claimed, { now: NOW, rank: 0, sessionExists: true, sessionHasVideo: false })).toBe('recover')
    expect(recordingFate(summary({ seconds: 4 }), { now: NOW, rank: 0 })).toBe('too-short')
    expect(recordingFate(summary({ bytes: 0 }), { now: NOW, rank: 0 })).toBe('too-short')
    expect(recordingFate(summary({ startedAt: NOW - 8 * DAY, lastWrittenAt: NOW - 8 * DAY }), { now: NOW, rank: 0 })).toBe('too-old')
    expect(recordingFate(summary(), { now: NOW, rank: 2 })).toBe('over-cap')
  })

  it('sweeps on launch: keeps the newest two, deletes the rest and logs counts only', async () => {
    await record('a', 20, NOW - 1 * DAY)
    await record('b', 20, NOW - 2 * DAY)
    await record('c', 20, NOW - 3 * DAY) // over the cap
    await record('d', 3, NOW - 4 * DAY) // too short
    await record('e', 20, NOW - 9 * DAY) // too old
    await record('f', 20, NOW - 10 * S) // still being written (another tab)
    const res = await sweepRecordings({ now: NOW })
    expect(res.recoverable.map((r) => r.recordingId)).toEqual(['a', 'b'])
    expect(res.removed).toBe(3)
    expect((await listRecordings()).map((r) => r.recordingId).sort()).toEqual(['a', 'b', 'f'])
    const [log] = await getDb().deletionLog.toArray()
    expect(log).toMatchObject({ scope: 'recording-sweep', counts: { recordings: 3, 'over-cap': 1, 'too-short': 1, 'too-old': 1 } })
  })

  it('deletes a claimed clip once its session has a video, and keeps one whose session has none', async () => {
    const base = DEMO_FIXTURES.sessions[0].session
    const done = await createSession({ ...base, id: 'sess-done', isDemo: 0 })
    const pending = await createSession({ ...base, id: 'sess-pending', isDemo: 0 })
    await addVideo({ ...DEMO_FIXTURES.sessions[0].video, id: 'v-done', sessionId: done.id, isDemo: 0 }, new Blob(['v']))
    await record('claimed-done', 20, NOW - DAY, { sessionId: done.id })
    await record('claimed-pending', 20, NOW - DAY + S, { sessionId: pending.id })
    const res = await sweepRecordings({ now: NOW })
    expect(res.recoverable.map((r) => r.recordingId)).toEqual(['claimed-pending'])
    expect(await readRecording('claimed-done')).toBeNull()
    // A settled clip is not a deletion the player needs to see.
    expect(await getDb().deletionLog.count()).toBe(0)
  })
})
