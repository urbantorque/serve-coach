import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDbForTests } from './db.ts'
import { DELETED_SERVE_NOTE, deleteAllVideos, deleteEverything, deleteServe, deleteSession, deleteVideo, restoreServe, wasSessionDeleted } from './deletion.ts'
import { appendChunk, LIVE_GRACE_MS, startRecordingRows, sweepRecordings, updateRecordingHeader } from './repos/recordings.ts'
import { hasDemoData, loadDemoData, removeDemoData } from './demo.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import { addVideo } from './repos/videos.ts'
import { createSession } from './repos/sessions.ts'
import { putKeyFrames } from './repos/keyFrames.ts'

beforeEach(async () => {
  await resetDbForTests()
  await loadDemoData()
})

async function orphanCount(): Promise<number> {
  const db = getDb()
  const sessionIds = new Set(await db.sessions.toCollection().primaryKeys())
  const serveIds = new Set(await db.serves.toCollection().primaryKeys())
  let orphans = 0
  for (const t of [db.serves, db.tags, db.keyFrames, db.videos] as const) {
    for (const row of (await t.toArray()) as { sessionId: string }[]) if (!sessionIds.has(row.sessionId)) orphans++
  }
  for (const k of await db.keyFrames.toArray()) if (!serveIds.has(k.serveId)) orphans++
  for (const t of await db.tags.toArray()) if (!serveIds.has(t.serveId)) orphans++
  if (!sessionIds.size) return orphans
  return orphans
}

describe('deleteServe', () => {
  it('removes the serve, its key frames and tag, keeps the video and the labelled stats, and logs counts only', async () => {
    const serve = DEMO_FIXTURES.sessions[0].serves[0]
    await putKeyFrames([
      { id: 'kf1', serveId: serve.id, sessionId: serve.sessionId, event: 'apex', role: 'thumb', frameIndex: 1, tReal: 0, width: 1, height: 1, blob: new Blob(['j']), createdAt: 'x' },
    ])
    const res = await deleteServe(serve.id, new Date('2026-09-27T00:00:00Z'))
    expect(res.removed).toBe(true)
    const db = getDb()
    expect(await db.serves.get(serve.id)).toBeUndefined()
    expect(await db.tags.get(serve.id)).toBeUndefined()
    expect(await db.keyFrames.count()).toBe(0)
    expect(await db.videos.get(DEMO_FIXTURES.sessions[0].video.id)).toBeDefined()
    // The statistics stay (nothing else rebuilds them), labelled as including a deleted serve.
    const stats = await db.sessionStats.get(serve.sessionId)
    expect(stats).toBeDefined()
    expect(stats?.deletedServeIds).toEqual([serve.id])
    expect(stats?.derivedPerServe[serve.id]).toBeUndefined()
    const marked = Object.values(stats!.metrics).filter((m) => m?.basis.includes(DELETED_SERVE_NOTE))
    expect(marked.length).toBeGreaterThan(0)
    expect(marked.every((m) => m?.provisional === true)).toBe(true)
    const [log] = await db.deletionLog.toArray()
    expect(log).toMatchObject({ scope: 'serve', sessionId: serve.sessionId, counts: { serves: 1, keyFrames: 1, tags: 1 } })
    expect(JSON.stringify(log)).not.toContain(serve.id)
    expect(await orphanCount()).toBe(0)
  })
})

describe('deleteServe undo', () => {
  it('Undo puts back the serve, its frames (the session thumbnail too), tag, annotations and the earlier stats', async () => {
    const db = getDb()
    const fx = DEMO_FIXTURES.sessions[0]
    const serve = fx.serves[0]
    const before = await db.sessionStats.get(serve.sessionId)
    await putKeyFrames([
      { id: 'kf-thumb', serveId: serve.id, sessionId: serve.sessionId, event: 'contact', role: 'session-thumb', frameIndex: 1, tReal: 0, width: 1, height: 1, blob: new Blob(['j']), createdAt: 'x' },
    ])
    const res = await deleteServe(serve.id)
    expect(res.snapshot?.keyFrames.map((k) => k.id)).toContain('kf-thumb')
    expect(await db.keyFrames.get('kf-thumb')).toBeUndefined()
    expect((await restoreServe(res.snapshot!)).restored).toBe(true)
    expect(await db.serves.get(serve.id)).toBeDefined()
    expect(await db.tags.get(serve.id)).toBeDefined()
    expect(await db.keyFrames.get('kf-thumb')).toBeDefined()
    expect(await db.sessionStats.get(serve.sessionId)).toEqual(before)
  })

  it('never restores into a session deleted in the meantime', async () => {
    const serve = DEMO_FIXTURES.sessions[0].serves[0]
    const res = await deleteServe(serve.id)
    await deleteSession(serve.sessionId)
    expect((await restoreServe(res.snapshot!)).restored).toBe(false)
    expect(await getDb().serves.get(serve.id)).toBeUndefined()
    expect(await orphanCount()).toBe(0)
  })
})

describe('deleteSession', () => {
  it('cascades without orphans, keeps practice and match logs, and marks the experiment baseline deleted', async () => {
    const db = getDb()
    const practiceBefore = await db.practiceLogs.count()
    const matchBefore = await db.matchLogs.count()
    await deleteSession('demo-s1')
    expect(await db.sessions.get('demo-s1')).toBeUndefined()
    expect(await db.serves.where('sessionId').equals('demo-s1').count()).toBe(0)
    expect(await db.tags.where('sessionId').equals('demo-s1').count()).toBe(0)
    expect(await db.videos.where('sessionId').equals('demo-s1').count()).toBe(0)
    expect(await db.sessionStats.get('demo-s1')).toBeUndefined()
    expect(await db.coaching.where('sessionId').equals('demo-s1').count()).toBe(0)
    expect(await db.practiceLogs.count()).toBe(practiceBefore)
    expect(await db.matchLogs.count()).toBe(matchBefore)
    const exp = await db.experiments.get(DEMO_FIXTURES.experiment.id)
    expect(exp?.baselineDeleted).toBe(true)
    expect(exp?.baselineSessionIds).toEqual([])
    expect(exp?.result).toBeUndefined()
    expect(await orphanCount()).toBe(0)
  })

  it('removes the raw recorder chunks of the clip this session took, and remembers the id (never content)', async () => {
    const db = getDb()
    const old = Date.now() - 60_000
    await startRecordingRows('rec-own', { mimeType: 'video/webm', startedAt: old }, old)
    await appendChunk('rec-own', 0, new Blob(['x']), old)
    await updateRecordingHeader('rec-own', { sessionId: 'demo-s1' }, old)
    await startRecordingRows('rec-other', { mimeType: 'video/webm', startedAt: old }, old)
    await appendChunk('rec-other', 0, new Blob(['x']), old)
    expect(await wasSessionDeleted('demo-s1')).toBe(false)
    await deleteSession('demo-s1')
    expect(await db.videoChunks.where('recordingId').equals('rec-own').count()).toBe(0)
    expect(await db.videoChunks.where('recordingId').equals('rec-other').count()).toBe(2)
    expect(await wasSessionDeleted('demo-s1')).toBe(true)
    expect(await wasSessionDeleted('demo-s2')).toBe(false)
  })

  it('removing a re-test session only drops its id from the experiment', async () => {
    await deleteSession('demo-s3')
    const exp = await getDb().experiments.get(DEMO_FIXTURES.experiment.id)
    expect(exp?.retestSessionIds).toEqual([])
    expect(exp?.baselineDeleted).toBeFalsy()
  })
})

describe('video deletion', () => {
  it('delete video only keeps stats and marks the record deleted', async () => {
    const v = DEMO_FIXTURES.sessions[0].video
    await addVideo({ ...v, storage: 'idb' }, new Blob(['video']))
    await deleteVideo(v.id)
    const db = getDb()
    expect(await db.videoBlobs.get(v.id)).toBeUndefined()
    const row = await db.videos.get(v.id)
    expect(row?.storage).toBe('deleted')
    expect(row?.deletedReason).toBe('player')
    expect(row?.retainUntil).toBeUndefined()
    expect(await db.sessionStats.get(v.sessionId)).toBeDefined()
  })

  it('delete all videos clears every blob', async () => {
    const v = DEMO_FIXTURES.sessions[1].video
    await addVideo({ ...v, storage: 'idb' }, new Blob(['video']))
    const n = await deleteAllVideos()
    expect(n).toBe(3)
    expect(await getDb().videoBlobs.count()).toBe(0)
  })

  it('delete all videos also removes interrupted recordings, so none is offered again, but never a running one', async () => {
    const db = getDb()
    const now = Date.now()
    const old = now - 60 * 60_000
    // An interrupted clip (no session took it) and a recording running in this page.
    await startRecordingRows('rec-crashed', { mimeType: 'video/webm', startedAt: old }, old)
    for (let i = 0; i < 8; i++) await appendChunk('rec-crashed', i, new Blob(['x'.repeat(10)]), old + i * 1000)
    await startRecordingRows('rec-live', { mimeType: 'video/webm', startedAt: old }, old)
    await appendChunk('rec-live', 0, new Blob(['x']), old)
    expect((await sweepRecordings({ now, activeIds: new Set(['rec-live']) })).recoverable.map((r) => r.recordingId)).toEqual(['rec-crashed'])
    await deleteAllVideos(new Date(now), { activeIds: new Set(['rec-live']) })
    expect(await db.videoChunks.where('recordingId').equals('rec-crashed').count()).toBe(0)
    expect(await db.videoChunks.where('recordingId').equals('rec-live').count()).toBe(2)
    expect((await sweepRecordings({ now, activeIds: new Set(['rec-live']) })).recoverable).toEqual([])
    const log = (await db.deletionLog.toArray()).find((l) => l.scope === 'all-videos')
    expect(log?.counts).toMatchObject({ recordings: 1 })
  })

  it('delete all videos leaves a recording written in the last few seconds (another tab may be recording)', async () => {
    const now = Date.now()
    await startRecordingRows('rec-fresh', { mimeType: 'video/webm', startedAt: now - 1000 }, now - 1000)
    await appendChunk('rec-fresh', 0, new Blob(['x']), now - LIVE_GRACE_MS / 2)
    await deleteAllVideos(new Date(now))
    expect(await getDb().videoChunks.where('recordingId').equals('rec-fresh').count()).toBe(2)
  })
})

describe('everything and sample data', () => {
  it('delete everything leaves an empty, open database', async () => {
    await deleteEverything()
    const db = getDb()
    for (const t of db.tables) expect(await t.count()).toBe(0)
    expect(db.isOpen()).toBe(true)
  })

  it('remove sample data deletes every demo row and keeps the player own session', async () => {
    const own = await createSession({ startedAt: '2026-09-27T09:00:00+10:00', status: 'ready', mode: 'technique', view: 'side' })
    expect(await hasDemoData()).toBe(true)
    await removeDemoData()
    const db = getDb()
    expect(await hasDemoData()).toBe(false)
    expect((await db.sessions.toArray()).map((s) => s.id)).toEqual([own.id])
    expect(await db.experiments.count()).toBe(0)
    expect(await db.practiceLogs.count()).toBe(0)
    expect(await db.matchLogs.count()).toBe(0)
    expect(await db.coaching.count()).toBe(0)
  })
})
