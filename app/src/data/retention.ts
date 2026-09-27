/**
 * Retention sweep (ARCHITECTURE §8.2, D8). Runs on app start, on visibilitychange to visible and after
 * each analysis job. A PWA cannot run in the background, so the copy says videos are deleted "the next
 * time you open Serve Coach".
 */
import { getDb } from './db.ts'
import { EVENT_NAMES } from './repos/events.ts'
import { setSetting } from './repos/settings.ts'

export const EVENTS_KEEP_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

export interface SweepResult {
  videosDeleted: number
  eventsDeleted: number
}

export async function sweepRetention(now: Date = new Date()): Promise<SweepResult> {
  const db = getDb()
  const nowMs = now.getTime()
  const result = await db.transaction('rw', [db.videos, db.videoBlobs, db.events, db.deletionLog], async () => {
    // Kept and pinned videos carry no retainUntil, so they are outside this index range.
    const expired = await db.videos
      .where('retainUntil')
      .below(nowMs)
      .filter((v) => v.storage !== 'deleted' && v.retention.pinned !== 1)
      .toArray()
    for (const v of expired) {
      await db.videoBlobs.delete(v.id)
      const next = { ...v, storage: 'deleted' as const, deletedAt: now.toISOString(), deletedReason: 'retention' as const }
      delete next.retainUntil
      await db.videos.put(next)
    }
    const cutoff = new Date(nowMs - EVENTS_KEEP_DAYS * DAY_MS).toISOString()
    // Old rows, and rows an earlier build wrote for an event that left the catalogue (a pain referral
    // count: health information stays out of analytics, PRODUCT §9.4).
    const known = new Set<string>(EVENT_NAMES)
    const eventsDeleted =
      (await db.events.where('at').below(cutoff).delete()) + (await db.events.filter((e) => !known.has(e.name)).delete())
    if (expired.length) {
      await db.deletionLog.add({ at: now.toISOString(), scope: 'retention-sweep', counts: { videos: expired.length } })
    }
    if (eventsDeleted) {
      await db.deletionLog.add({ at: now.toISOString(), scope: 'events-sweep', counts: { events: eventsDeleted } })
    }
    return { videosDeleted: expired.length, eventsDeleted }
  })
  await setSetting('lastRetentionSweepAt', now.toISOString(), now)
  return result
}

/** "Delete after analysis": called when a session's job reaches done. Stats, tracks and key frames stay. */
export async function applyDeleteAfterAnalysis(sessionId: string, now: Date = new Date()): Promise<number> {
  const db = getDb()
  return db.transaction('rw', db.videos, db.videoBlobs, async () => {
    const vids = await db.videos
      .where('sessionId')
      .equals(sessionId)
      .filter((v) => v.retention.policy === 'delete-after-analysis' && v.retention.pinned !== 1 && v.storage !== 'deleted')
      .toArray()
    for (const v of vids) {
      await db.videoBlobs.delete(v.id)
      await db.videos.put({ ...v, storage: 'deleted', deletedAt: now.toISOString(), deletedReason: 'after-analysis' })
    }
    return vids.length
  })
}
