import { getDb } from '../db.ts'
import type { ServeAnalysis } from '../domain.ts'
import type { KeyFrameRecord, ServeRecord, TrackRecord } from '../records.ts'

export function toServeRecord(serve: ServeAnalysis): ServeRecord {
  return { ...serve, includedFlag: serve.included ? 1 : 0 }
}

/** One transaction per serve batch: serves, their tracks and key frames (ARCHITECTURE §7.4). */
export async function putServesWithTracksAndFrames(
  serves: ServeAnalysis[],
  tracks: TrackRecord[] = [],
  keyFrames: KeyFrameRecord[] = [],
): Promise<void> {
  const db = getDb()
  await db.transaction('rw', [db.serves, db.tracks, db.keyFrames], async () => {
    await db.serves.bulkPut(serves.map(toServeRecord))
    if (tracks.length) await db.tracks.bulkPut(tracks)
    if (keyFrames.length) await db.keyFrames.bulkPut(keyFrames)
  })
}

export async function getServe(id: string): Promise<ServeRecord | undefined> {
  return getDb().serves.get(id)
}

/** Serves of a session in index order (the serve strip order). */
export async function listServesBySession(sessionId: string): Promise<ServeRecord[]> {
  return getDb().serves.where('[sessionId+index]').between([sessionId, 0], [sessionId, Infinity]).toArray()
}

/** The player's "Exclude this serve" / "Include again" (DESIGN §10.7). */
export async function setServeIncluded(id: string, included: boolean): Promise<void> {
  await getDb().serves.update(id, { included, includedFlag: included ? 1 : 0 })
}

export async function getTrack(serveId: string): Promise<TrackRecord | undefined> {
  return getDb().tracks.get(serveId)
}
