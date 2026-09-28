/**
 * Deletion cascades (ARCHITECTURE §8.3, D8). Every delete writes a `deletionLog` row with counts only,
 * never content. UI owns confirmation and the 8 s Undo window for serves (it defers the call).
 */
import type { MetricId, MetricValue } from '../analysis/types.ts'
import { clearRuntimeCaches } from '../platform/pwa/cacheNames.ts'
import { getDb } from './db.ts'
import type { SessionStats } from './domain.ts'
import type { AnnotationRecord, DeletionLogRecord, KeyFrameRecord, ServeRecord, ServeTagRecord, TrackRecord } from './records.ts'
import { HEADER_SEQ, LIVE_GRACE_MS } from './repos/recordings.ts'

async function log(entry: Omit<DeletionLogRecord, 'seq' | 'at'>, now: Date): Promise<void> {
  await getDb().deletionLog.add({ ...entry, at: now.toISOString() })
}

/** Everything `deleteServe` removed or changed, so the 8 s Undo can put it back exactly. */
export interface DeletedServeSnapshot {
  serve: ServeRecord
  track?: TrackRecord
  /** Every key frame of the serve, the session's list thumbnail included when this serve held it. */
  keyFrames: KeyFrameRecord[]
  tag?: ServeTagRecord
  annotations: AnnotationRecord[]
  /** The session statistics as they were before the delete. */
  stats?: SessionStats
}

/**
 * Appended to the basis of every value the deleted serve fed. Analysing the session again is not
 * offered as the fix: the engine would find every serve in the video again, the deleted one included.
 */
export const DELETED_SERVE_NOTE = 'Worked out before you deleted a serve, so it still includes that serve.'

/**
 * The report's line for a session with deleted serves (`SessionStats.deletedServeIds`): its values and
 * their n were worked out with those serves, which the report says in words, not only with the
 * "Early read" chip.
 */
export function deletedServesLine(count: number): string {
  return count === 1
    ? 'These numbers were worked out before you deleted a serve, so they still include it.'
    : `These numbers were worked out before you deleted ${count} serves, so they still include them.`
}

/**
 * The session statistics after one serve is deleted. The stored rows cannot rebuild the engine's
 * summaries (they need the pose track and raw per-serve results), so the numbers and their n stay as
 * the engine worked them out, labelled honestly: every serve-based value the deleted serve fed becomes
 * an early read with a note, the report says so in words (`deletedServesLine`), and the serve is
 * dropped from the per-serve values, the best serve and the representative serve.
 */
export function statsAfterServeDelete(stats: SessionStats, serve: ServeRecord): SessionStats {
  const counted = serve.includedFlag === undefined ? serve.included : serve.includedFlag === 1
  const mark = (m: Partial<Record<MetricId, MetricValue>>) => {
    if (!counted) return m
    const out: Partial<Record<MetricId, MetricValue>> = {}
    for (const [id, v] of Object.entries(m) as [MetricId, MetricValue][]) {
      const fromServes = !!v && (v.status === 'measured' || v.status === 'estimated') && typeof v.n === 'number' && v.n > 0
      out[id] = fromServes && !v.basis.includes(DELETED_SERVE_NOTE) ? { ...v, provisional: true, basis: `${v.basis} ${DELETED_SERVE_NOTE}` } : v
    }
    return out
  }
  const { [serve.id]: _gone, ...derivedPerServe } = stats.derivedPerServe ?? {}
  const next: SessionStats = {
    ...stats,
    metrics: mark(stats.metrics),
    strata: stats.strata.map((s) => ({ ...s, metrics: mark(s.metrics) })),
    derivedPerServe,
    deletedServeIds: [...new Set([...(stats.deletedServeIds ?? []), serve.id])],
  }
  if (next.bestServeId === serve.id) delete next.bestServeId
  if (next.representativeServeId === serve.id) delete next.representativeServeId
  return next
}

/**
 * Removes one serve with its tracks, key frames, tag and annotations. Keeps the session video (other
 * serves share it) and the session statistics, which are labelled as including a deleted serve
 * (`statsAfterServeDelete`) rather than dropped: nothing else rebuilds them. Returns a snapshot for Undo.
 */
export async function deleteServe(serveId: string, now: Date = new Date()): Promise<{ removed: boolean; snapshot?: DeletedServeSnapshot }> {
  const db = getDb()
  return db.transaction(
    'rw',
    [db.serves, db.tracks, db.keyFrames, db.tags, db.annotations, db.sessionStats, db.deletionLog],
    async () => {
      const serve = await db.serves.get(serveId)
      if (!serve) return { removed: false }
      const keyFrames = await db.keyFrames.where('serveId').equals(serveId).toArray()
      const annotations = await db.annotations.where('serveId').equals(serveId).toArray()
      const track = await db.tracks.get(serveId)
      const tag = await db.tags.get(serveId)
      const stats = await db.sessionStats.get(serve.sessionId)
      await db.serves.delete(serveId)
      await db.tracks.delete(serveId)
      await db.keyFrames.bulkDelete(keyFrames.map((k) => k.id))
      await db.tags.delete(serveId)
      await db.annotations.bulkDelete(annotations.map((a) => a.id))
      if (stats) await db.sessionStats.put(statsAfterServeDelete(stats, serve))
      await log(
        {
          scope: 'serve',
          sessionId: serve.sessionId,
          counts: { serves: 1, tracks: track ? 1 : 0, keyFrames: keyFrames.length, tags: tag ? 1 : 0, annotations: annotations.length },
        },
        now,
      )
      return {
        removed: true,
        snapshot: { serve, ...(track ? { track } : {}), keyFrames, ...(tag ? { tag } : {}), annotations, ...(stats ? { stats } : {}) },
      }
    },
  )
}

/** Undo for `deleteServe`: puts every removed row and the earlier statistics back (when the session still exists). */
export async function restoreServe(snapshot: DeletedServeSnapshot): Promise<{ restored: boolean }> {
  const db = getDb()
  return db.transaction('rw', [db.sessions, db.serves, db.tracks, db.keyFrames, db.tags, db.annotations, db.sessionStats], async () => {
    if (!(await db.sessions.get(snapshot.serve.sessionId))) return { restored: false }
    await db.serves.put(snapshot.serve)
    if (snapshot.track) await db.tracks.put(snapshot.track)
    if (snapshot.keyFrames.length) await db.keyFrames.bulkPut(snapshot.keyFrames)
    if (snapshot.tag) await db.tags.put(snapshot.tag)
    if (snapshot.annotations.length) await db.annotations.bulkPut(snapshot.annotations)
    if (snapshot.stats) await db.sessionStats.put(snapshot.stats)
    return { restored: true }
  })
}

/**
 * True when the player deleted this session (the deletion log keeps its id, never its content). The
 * analysis pipeline checks it so a run still going when the session was deleted neither recreates the
 * session nor writes its results (ARCHITECTURE §8.3).
 */
export async function wasSessionDeleted(sessionId: string): Promise<boolean> {
  try {
    const n = await getDb()
      .deletionLog.where('scope')
      .equals('session')
      .filter((r) => r.sessionId === sessionId)
      .count()
    return n > 0
  } catch {
    return false
  }
}

/**
 * Clears anything an analysis run wrote for a session the player deleted meanwhile (videos and their
 * blobs, the job, serves, tracks, key frames, stats and decisions). A no-op while the session exists.
 * The pipeline calls it when a run stops as cancelled or failed; the writes themselves already check
 * the session in their own transactions, so this is the safety net. Returns the rows removed.
 */
export async function sweepDeletedSessionRows(sessionId: string): Promise<number> {
  const db = getDb()
  return db.transaction(
    'rw',
    [db.sessions, db.videos, db.videoBlobs, db.jobs, db.serves, db.tracks, db.keyFrames, db.sessionStats, db.coaching],
    async () => {
      if (await db.sessions.get(sessionId)) return 0
      const videoIds = await db.videos.where('sessionId').equals(sessionId).primaryKeys()
      await db.videoBlobs.bulkDelete(videoIds)
      await db.videos.bulkDelete(videoIds)
      let removed = videoIds.length
      removed += await db.jobs.where('sessionId').equals(sessionId).delete()
      removed += await db.serves.where('sessionId').equals(sessionId).delete()
      removed += await db.tracks.where('sessionId').equals(sessionId).delete()
      removed += await db.keyFrames.where('sessionId').equals(sessionId).delete()
      removed += await db.coaching.where('sessionId').equals(sessionId).delete()
      if (await db.sessionStats.get(sessionId)) {
        await db.sessionStats.delete(sessionId)
        removed++
      }
      return removed
    },
  )
}

/** Recording ids whose header says this session took the clip. */
async function recordingsClaimedBy(sessionId: string): Promise<string[]> {
  // `seq` alone is not indexed; the header rows are few (at most a handful of recordings are kept).
  const headers = await getDb()
    .videoChunks.filter((r) => r.seq === HEADER_SEQ && r.header?.sessionId === sessionId)
    .toArray()
  return [...new Set(headers.map((r) => r.recordingId))]
}

/**
 * Removes a session and everything derived from it. Practice logs and match logs stay (they are not
 * session data). Experiments that used it lose it: a baseline sets `baselineDeleted`, a re-test id is
 * removed, and the stored verdict is cleared so it is recomputed. The raw recorder chunks of the clip
 * this session took are removed too. A run still analysing it is stopped by the caller (the UI's
 * `cancelAnalysis`); the pipeline also refuses to write for a deleted session (`wasSessionDeleted`).
 */
export async function deleteSession(sessionId: string, now: Date = new Date()): Promise<{ removed: boolean }> {
  const db = getDb()
  const claimed = await recordingsClaimedBy(sessionId)
  return db.transaction(
    'rw',
    [
      db.sessions, db.videos, db.videoBlobs, db.serves, db.tracks, db.keyFrames, db.tags, db.tallies,
      db.sessionStats, db.coaching, db.jobs, db.annotations, db.experiments, db.videoChunks, db.deletionLog,
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
        recordings: claimed.length,
      }
      if (claimed.length) await db.videoChunks.where('recordingId').anyOf(claimed).delete()
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

/**
 * "Delete all videos": every kept clip, and every raw recording still in the recorder's chunk store
 * (an interrupted clip would otherwise be offered again at the next launch). A recording running now
 * (`activeIds`, or written in the last few seconds, possibly in another tab) is left alone.
 */
export async function deleteAllVideos(now: Date = new Date(), opts: { activeIds?: ReadonlySet<string> } = {}): Promise<number> {
  const db = getDb()
  return db.transaction('rw', [db.videos, db.videoBlobs, db.videoChunks, db.deletionLog], async () => {
    const live = await db.videos.filter((v) => v.storage !== 'deleted').toArray()
    await db.videoBlobs.clear()
    for (const v of live) {
      const next = { ...v, storage: 'deleted' as const, deletedAt: now.toISOString(), deletedReason: 'player' as const }
      delete next.retainUntil
      await db.videos.put(next)
    }
    const chunks = await db.videoChunks.toArray()
    const lastWrite = new Map<string, number>()
    for (const c of chunks) lastWrite.set(c.recordingId, Math.max(lastWrite.get(c.recordingId) ?? 0, c.writtenAt ?? 0))
    const doomed = [...lastWrite.entries()]
      .filter(([id, at]) => !opts.activeIds?.has(id) && now.getTime() - at >= LIVE_GRACE_MS)
      .map(([id]) => id)
    if (doomed.length) await db.videoChunks.where('recordingId').anyOf(doomed).delete()
    await log({ scope: 'all-videos', counts: { videos: live.length, recordings: doomed.length } }, now)
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
 * open again. The service worker's runtime caches are cleared too (the app shell stays, so the app still
 * opens offline); the native video folder is cleared by the platform layer when it exists. In-memory
 * screen state (today's body check, a referral, planned re-tests) is reset by the caller
 * (ui/screens/focus/focusStore.ts `resetFocusStore`), since the data layer never imports the UI.
 */
export async function deleteEverything(): Promise<void> {
  const db = getDb()
  // Includes the local usage events (Beta data) and any unfinished recording chunks.
  await db.delete()
  await db.open()
  // Platform addition: the service worker's runtime caches (sample files and the like); the app shell stays.
  await clearRuntimeCaches()
  for (const store of ['localStorage', 'sessionStorage'] as const) {
    try {
      globalThis[store]?.clear()
    } catch {
      // Storage can be unavailable (private mode, blocked site data); nothing to clear then.
    }
  }
}
