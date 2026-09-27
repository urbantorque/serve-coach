import { getDb } from '../db.ts'
import type { ServeTagRecord, SessionTallyRecord } from '../records.ts'

export type TagPatch = Partial<Omit<ServeTagRecord, 'serveId' | 'sessionId' | 'taggedAt'>>

/** Sets or merges one serve's player-entered tag (outcome, serve number, side, target, radar). */
export async function setTag(serveId: string, sessionId: string, patch: TagPatch, now: Date = new Date()): Promise<ServeTagRecord> {
  const db = getDb()
  return db.transaction('rw', db.tags, async () => {
    const existing = await db.tags.get(serveId)
    const next: ServeTagRecord = {
      via: 'review',
      ...existing,
      ...patch,
      serveId,
      sessionId,
      taggedAt: now.toISOString(),
    }
    await db.tags.put(next)
    return next
  })
}

/** Applies the same attributes to every serve of a session (block defaults, "Applies to the rest"). */
export async function bulkSetTags(sessionId: string, serveIds: string[], patch: TagPatch, now: Date = new Date()): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.tags, async () => {
    for (const serveId of serveIds) {
      const existing = await db.tags.get(serveId)
      await db.tags.put({ via: 'bulk', ...existing, ...patch, serveId, sessionId, taggedAt: now.toISOString() })
    }
  })
}

export async function listTags(sessionId: string): Promise<ServeTagRecord[]> {
  return getDb().tags.where('sessionId').equals(sessionId).toArray()
}

export async function deleteTag(serveId: string): Promise<void> {
  await getDb().tags.delete(serveId)
}

export async function setTally(tally: SessionTallyRecord): Promise<void> {
  await getDb().tallies.put(tally)
}

export async function getTally(sessionId: string): Promise<SessionTallyRecord | undefined> {
  return getDb().tallies.get(sessionId)
}
