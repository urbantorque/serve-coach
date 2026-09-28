import { getDb } from '../db.ts'
import type { RetentionPolicy, VideoRecord } from '../records.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * D8 retention: `retainUntil` for a policy. Absent means "keep" (the video stays out of the
 * retention index). Delete-after-analysis is handled when the job finishes, not by date.
 */
export function retainUntilFor(policy: RetentionPolicy, importedAt: string, days: number, pinned = false): number | undefined {
  if (pinned || policy !== 'auto-delete-days') return undefined
  return new Date(importedAt).getTime() + days * DAY_MS
}

/** Adds the metadata row and, when given, the blob, in one transaction. Blobs live apart from metadata. */
export async function addVideo(record: VideoRecord, blob?: Blob): Promise<VideoRecord> {
  const db = getDb()
  const row: VideoRecord = { ...record, retainUntil: record.retention.retainUntil }
  await db.transaction('rw', db.videos, db.videoBlobs, async () => {
    await db.videos.put(row)
    if (blob) await db.videoBlobs.put({ id: row.id, blob })
  })
  return row
}

/**
 * `addVideo` for an analysis run: the session check and the write are one transaction, so a session
 * the player deletes while its clip is being prepared never gets a video or blob afterwards
 * (ARCHITECTURE §8.3). Returns null, having written nothing, when the session no longer exists.
 */
export async function addVideoForSession(record: VideoRecord, blob?: Blob): Promise<VideoRecord | null> {
  const db = getDb()
  const row: VideoRecord = { ...record, retainUntil: record.retention.retainUntil }
  return db.transaction('rw', db.sessions, db.videos, db.videoBlobs, async () => {
    if (!(await db.sessions.get(record.sessionId))) return null
    await db.videos.put(row)
    if (blob) await db.videoBlobs.put({ id: row.id, blob })
    return row
  })
}

export async function getVideo(id: string): Promise<VideoRecord | undefined> {
  return getDb().videos.get(id)
}

export async function getVideoBlob(id: string): Promise<Blob | undefined> {
  return (await getDb().videoBlobs.get(id))?.blob
}

export async function listVideosBySession(sessionId: string): Promise<VideoRecord[]> {
  return getDb().videos.where('sessionId').equals(sessionId).toArray()
}

/** Changes one video's policy, or pins it ("Keep this video"), keeping the index field in step. */
export async function setVideoRetention(
  id: string,
  change: { policy?: RetentionPolicy; days?: number; pinned?: boolean },
): Promise<VideoRecord | undefined> {
  const db = getDb()
  return db.transaction('rw', db.videos, async () => {
    const v = await db.videos.get(id)
    if (!v) return undefined
    const policy = change.policy ?? v.retention.policy
    const pinned = change.pinned ?? v.retention.pinned === 1
    const days = change.days ?? 30
    const retainUntil = retainUntilFor(policy, v.importedAt, days, pinned)
    const next: VideoRecord = { ...v, retention: { policy, pinned: pinned ? 1 : 0, retainUntil }, retainUntil }
    if (retainUntil === undefined) delete next.retainUntil
    await db.videos.put(next)
    return next
  })
}
