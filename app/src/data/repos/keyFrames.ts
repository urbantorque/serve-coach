import type { KeyFrameEvent } from '../../analysis/types.ts'
import { getDb } from '../db.ts'
import type { KeyFrameRecord } from '../records.ts'

export async function putKeyFrames(frames: KeyFrameRecord[]): Promise<void> {
  await getDb().keyFrames.bulkPut(frames)
}

export async function getKeyFrame(id: string): Promise<KeyFrameRecord | undefined> {
  return getDb().keyFrames.get(id)
}

/** Key frames for one serve in event order (the key-frame strip; works after the video is deleted). */
export async function listKeyFramesForServe(serveId: string, role: KeyFrameRecord['role'] = 'thumb'): Promise<KeyFrameRecord[]> {
  const order: KeyFrameEvent[] = ['setup', 'release', 'apex', 'trophy', 'lowestHip', 'contact', 'landing', 'recovery']
  const rows = await getDb().keyFrames.where('serveId').equals(serveId).filter((k) => k.role === role).toArray()
  return rows.sort((a, b) => order.indexOf(a.event) - order.indexOf(b.event))
}

export async function getKeyFrameFor(
  serveId: string,
  event: KeyFrameEvent,
  role: KeyFrameRecord['role'] = 'thumb',
): Promise<KeyFrameRecord | undefined> {
  const rows = await getDb().keyFrames.where('[serveId+event]').equals([serveId, event]).toArray()
  return rows.find((k) => k.role === role)
}

/** The session's list thumbnail (a small square crop written by the analysis pipeline), if any. */
export async function getSessionThumb(sessionId: string): Promise<KeyFrameRecord | undefined> {
  return getDb().keyFrames.where('sessionId').equals(sessionId).filter((k) => k.role === 'session-thumb').first()
}
