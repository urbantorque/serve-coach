import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDbForTests } from './db.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import { getSetting } from './repos/settings.ts'
import { addVideo } from './repos/videos.ts'
import { applyDeleteAfterAnalysis, sweepRetention } from './retention.ts'
import type { VideoRecord } from './records.ts'

const NOW = new Date('2026-10-20T00:00:00.000Z')
const DAY = 86_400_000
const base = DEMO_FIXTURES.sessions[0].video

function video(id: string, retention: VideoRecord['retention']): VideoRecord {
  return { ...base, id, storage: 'idb', isDemo: 0, retention }
}

beforeEach(async () => {
  await resetDbForTests()
})

describe('retention sweep', () => {
  it('deletes only expired, unpinned videos and logs counts', async () => {
    await addVideo(video('expired', { policy: 'auto-delete-days', pinned: 0, retainUntil: NOW.getTime() - 1 }), new Blob(['a']))
    await addVideo(video('boundary', { policy: 'auto-delete-days', pinned: 0, retainUntil: NOW.getTime() }), new Blob(['b']))
    await addVideo(video('future', { policy: 'auto-delete-days', pinned: 0, retainUntil: NOW.getTime() + DAY }), new Blob(['c']))
    await addVideo(video('kept', { policy: 'keep', pinned: 0 }), new Blob(['d']))
    await addVideo(video('pinned', { policy: 'auto-delete-days', pinned: 1 }), new Blob(['e']))

    const res = await sweepRetention(NOW)
    expect(res.videosDeleted).toBe(1)
    const db = getDb()
    expect((await db.videos.get('expired'))?.storage).toBe('deleted')
    expect((await db.videos.get('expired'))?.deletedReason).toBe('retention')
    expect(await db.videoBlobs.get('expired')).toBeUndefined()
    // A video is kept through the whole of its last day (retainUntil is exclusive).
    for (const id of ['boundary', 'future', 'kept', 'pinned']) {
      expect((await db.videos.get(id))?.storage).toBe('idb')
      expect(await db.videoBlobs.get(id)).toBeDefined()
    }
    const logs = await db.deletionLog.toArray()
    expect(logs).toEqual([expect.objectContaining({ scope: 'retention-sweep', counts: { videos: 1 } })])
    expect(await getSetting('lastRetentionSweepAt')).toBe(NOW.toISOString())
  })

  it('removes local usage events older than 180 days', async () => {
    const db = getDb()
    await db.events.bulkAdd([
      { name: 'old', at: new Date(NOW.getTime() - 181 * DAY).toISOString(), props: {} },
      { name: 'recent', at: new Date(NOW.getTime() - 179 * DAY).toISOString(), props: {} },
    ])
    const res = await sweepRetention(NOW)
    expect(res.eventsDeleted).toBe(1)
    expect((await db.events.toArray()).map((e) => e.name)).toEqual(['recent'])
  })

  it('delete-after-analysis removes the blob when the job is done, keeping pinned videos', async () => {
    await addVideo({ ...video('v1', { policy: 'delete-after-analysis', pinned: 0 }), sessionId: 's1' }, new Blob(['a']))
    await addVideo({ ...video('v2', { policy: 'delete-after-analysis', pinned: 1 }), sessionId: 's1' }, new Blob(['b']))
    expect(await applyDeleteAfterAnalysis('s1', NOW)).toBe(1)
    const db = getDb()
    expect((await db.videos.get('v1'))?.deletedReason).toBe('after-analysis')
    expect(await db.videoBlobs.get('v2')).toBeDefined()
  })
})
