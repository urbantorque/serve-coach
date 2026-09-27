/**
 * Storage for "Check this serve" (the §7.2 `annotations` table, schema v1, so no migration). Screens
 * call these functions and never the database directly. Deleting a serve or a session already removes
 * its annotations (data/deletion.ts), and the player's own JSON export already includes them.
 */
import type { ServeAnalysis } from '../../data/domain.ts'
import { getDb } from '../../data/db.ts'
import type { SessionRecord, TrackRecord, VideoRecord } from '../../data/records.ts'
import type { CheckAnnotation } from './types.ts'

const isCheck = (a: { tool?: string; serveId?: string; annotatorRole?: unknown }): boolean => a.tool === 'in-app@1' && Boolean(a.serveId) && typeof a.annotatorRole === 'string'

export async function saveCheck(a: CheckAnnotation): Promise<CheckAnnotation> {
  await getDb().annotations.put(a)
  return a
}

export async function getCheck(id: string): Promise<CheckAnnotation | undefined> {
  const a = await getDb().annotations.get(id)
  return a && isCheck(a) ? (a as CheckAnnotation) : undefined
}

/** Checks of one serve, oldest first. */
export async function listChecksForServe(serveId: string): Promise<CheckAnnotation[]> {
  const rows = await getDb().annotations.where('serveId').equals(serveId).toArray()
  return (rows.filter(isCheck) as CheckAnnotation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** Every check on this phone, oldest first. */
export async function listChecks(): Promise<CheckAnnotation[]> {
  const rows = await getDb().annotations.orderBy('createdAt').toArray()
  return rows.filter(isCheck) as CheckAnnotation[]
}

/** Records the first time the comparison was shown for these marks (blinding, METRICS §5.6). */
export async function markRevealed(id: string, at: string): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.annotations, async () => {
    const a = await db.annotations.get(id)
    if (!a || !isCheck(a) || (a as CheckAnnotation).revealedAt) return
    const next: CheckAnnotation = { ...(a as CheckAnnotation), revealedAt: at }
    await db.annotations.put(next)
  })
}

export async function deleteCheck(id: string): Promise<void> {
  await getDb().annotations.delete(id)
}

export interface CheckRecords {
  annotation: CheckAnnotation
  serve: ServeAnalysis
  track: TrackRecord | null
  video: VideoRecord | null
  session: SessionRecord | null
}

/** Every check with the records the validation export needs. Checks whose serve is gone are skipped. */
export async function gatherChecks(): Promise<CheckRecords[]> {
  const db = getDb()
  const out: CheckRecords[] = []
  for (const annotation of await listChecks()) {
    const serve = await db.serves.get(annotation.serveId)
    if (!serve) continue
    out.push({
      annotation,
      serve,
      track: (await db.tracks.get(serve.id)) ?? null,
      video: (await db.videos.get(serve.videoId)) ?? null,
      session: (await db.sessions.get(serve.sessionId)) ?? null,
    })
  }
  return out
}
