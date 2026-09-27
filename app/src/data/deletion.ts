/**
 * Deletion cascades (ARCHITECTURE §8.3, D8). Every delete writes a `deletionLog` row with counts only,
 * never content. UI owns confirmation and the 8 s Undo window for serves (it defers the call).
 */
import { getDb } from './db.ts'
import type { DeletionLogRecord } from './records.ts'

async function log(entry: Omit<DeletionLogRecord, 'seq' | 'at'>, now: Date): Promise<void> {
  await getDb().deletionLog.add({ ...entry, at: now.toISOString() })
}

/**
 * Removes one serve with its tracks, key frames, tag and annotations. Keeps the session video (other
 * serves share it). The cached session statistics are dropped so they are recomputed on next read.
 */
export async function deleteServe(serveId: string, now: Date = new Date()): Promise<{ removed: boolean }> {
  const db = getDb()
  return db.transaction(
    'rw',
    [db.serves, db.tracks, db.keyFrames, db.tags, db.annotations, db.sessionStats, db.deletionLog],
    async () => {
      const serve = await db.serves.get(serveId)
      if (!serve) return { removed: false }
      const keyFrames = await db.keyFrames.where('serveId').equals(serveId).primaryKeys()
      const annotations = await db.annotations.where('serveId').equals(serveId).primaryKeys()
      const hadTrack = (await db.tracks.get(serveId)) ? 1 : 0
      const hadTag = (await db.tags.get(serveId)) ? 1 : 0
      await db.serves.delete(serveId)
      await db.tracks.delete(serveId)
      await db.keyFrames.bulkDelete(keyFrames)
      await db.tags.delete(serveId)
      await db.annotations.bulkDelete(annotations)
      await db.sessionStats.delete(serve.sessionId)
      await log(
        {
          scope: 'serve',
          sessionId: serve.sessionId,
          counts: { serves: 1, tracks: hadTrack, keyFrames: keyFrames.length, tags: hadTag, annotations: annotations.length },
        },
        now,
      )
      return { removed: true }
    },
  )
}

/**
 * Removes a session and everything derived from it. Practice logs and match logs stay (they are not
 * session data). Experiments that used it lose it: a baseline sets `baselineDeleted`, a re-test id is
 * removed, and the stored verdict is cleared so it is recomputed.
 */
export async function deleteSession(sessionId: string, now: Date = new Date()): Promise<{ removed: boolean }> {
  const db = getDb()
  return db.transaction(
    'rw',
    [
      db.sessions, db.videos, db.videoBlobs, db.serves, db.tracks, db.keyFrames, db.tags, db.tallies,
      db.sessionStats, db.coaching, db.jobs, db.annotations, db.experiments, db.deletionLog,
    ],
    async () => {
      const session = await db.sessions.get(sessionId)
      if (!session) return { removed: false }
      const videoIds = await db.videos.where('sessionId').equals(sessionId).primaryKeys()
      const counts: Record<string, number> = {
        sessions: 1,
        videos: videoIds.length,
        serves: await db.serves.where('sessionId').equals(sessionId).delete(),
        tracks: await db.tracks.where('sessionId').equals(sessionId).delete(),
        keyFrames: await db.keyFrames.where('sessionId').equals(sessionId).delete(),
        tags: await db.tags.where('sessionId').equals(sessionId).delete(),
        coaching: await db.coaching.where('sessionId').equals(sessionId).delete(),
        jobs: await db.jobs.where('sessionId').equals(sessionId).delete(),
        annotations: await db.annotations.where('sessionId').equals(sessionId).delete(),
      }
      await db.videoBlobs.bulkDelete(videoIds)
      await db.videos.bulkDelete(videoIds)
      await db.tallies.delete(sessionId)
      await db.sessionStats.delete(sessionId)
      await db.sessions.delete(sessionId)

      const asBaseline = await db.experiments.where('baselineSessionIds').equals(sessionId).toArray()
      const asRetest = await db.experiments.where('retestSessionIds').equals(sessionId).toArray()
      const touched = new Map([...asBaseline, ...asRetest].map((e) => [e.id, e]))
      for (const exp of touched.values()) {
        const next = {
          ...exp,
          baselineSessionIds: exp.baselineSessionIds.filter((id) => id !== sessionId),
          retestSessionIds: exp.retestSessionIds.filter((id) => id !== sessionId),
          baselineDeleted: exp.baselineDeleted || exp.baselineSessionIds.includes(sessionId) || undefined,
        }
        delete next.result
        await db.experiments.put(next)
      }
      counts.experimentsUpdated = touched.size
      await log({ scope: 'session', sessionId, counts }, now)
      return { removed: true }
    },
  )
}

/** "Delete video only": the blob goes; stats, tracks and key frames stay (playback becomes key-frame stepping). */
export async function deleteVideo(
  videoId: string,
  reason: 'player' | 'retention' | 'after-analysis' | 'storage-full' = 'player',
  now: Date = new Date(),
): Promise<{ removed: boolean }> {
  const db = getDb()
  return db.transaction('rw', db.videos, db.videoBlobs, db.deletionLog, async () => {
    const v = await db.videos.get(videoId)
    if (!v || v.storage === 'deleted') return { removed: false }
    await db.videoBlobs.delete(videoId)
    const next = { ...v, storage: 'deleted' as const, deletedAt: now.toISOString(), deletedReason: reason }
    delete next.retainUntil
    await db.videos.put(next)
    if (reason === 'player') await log({ scope: 'video', sessionId: v.sessionId, counts: { videos: 1 } }, now)
    return { removed: true }
  })
}

export async function deleteAllVideos(now: Date = new Date()): Promise<number> {
  const db = getDb()
  return db.transaction('rw', db.videos, db.videoBlobs, db.deletionLog, async () => {
    const live = await db.videos.filter((v) => v.storage !== 'deleted').toArray()
    await db.videoBlobs.clear()
    for (const v of live) {
      const next = { ...v, storage: 'deleted' as const, deletedAt: now.toISOString(), deletedReason: 'player' as const }
      delete next.retainUntil
      await db.videos.put(next)
    }
    await log({ scope: 'all-videos', counts: { videos: live.length } }, now)
    return live.length
  })
}

export async function deleteMatchLog(id: string, now: Date = new Date()): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.matchLogs, db.deletionLog, async () => {
    await db.matchLogs.delete(id)
    await log({ scope: 'match-log', counts: { matchLogs: 1 } }, now)
  })
}

/**
 * "Delete everything" (typed confirm in the UI): drops the whole database, including match logs, the
 * local events table and the deletion log, then clears web storage. Returns when an empty database is
 * open again. The native video folder and Cache Storage are cleared by the platform layer when it exists.
 */
export async function deleteEverything(): Promise<void> {
  const db = getDb()
  await db.delete()
  await db.open()
  for (const store of ['localStorage', 'sessionStorage'] as const) {
    try {
      globalThis[store]?.clear()
    } catch {
      // Storage can be unavailable (private mode, blocked site data); nothing to clear then.
    }
  }
}
