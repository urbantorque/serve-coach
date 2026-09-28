/**
 * Analysis jobs (ARCHITECTURE §5.9, §7.1 `JobRecord`). Added by engine-pipeline: one row per
 * analysis run, holding the Pass A windows and completed-window indices so a cancelled or
 * interrupted job can be resumed or discarded without re-running serve finding.
 */
import { getDb } from '../db.ts'
import type { JobRecord } from '../records.ts'

export async function putJob(job: JobRecord): Promise<void> {
  await getDb().jobs.put(job)
}

/**
 * Writes a job only while its session exists (the check and the write are one transaction), so a run
 * whose session was deleted mid-run never leaves a job row behind. False when the session is gone.
 */
export async function putJobForSession(job: JobRecord): Promise<boolean> {
  const db = getDb()
  return db.transaction('rw', db.sessions, db.jobs, async () => {
    if (!(await db.sessions.get(job.sessionId))) return false
    await db.jobs.put(job)
    return true
  })
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  return getDb().jobs.get(id)
}

/** Merges a patch and stamps `updatedAt`. Returns false when the job does not exist. */
export async function updateJob(id: string, patch: Partial<Omit<JobRecord, 'id'>>, now: Date = new Date()): Promise<boolean> {
  const changed = await getDb().jobs.update(id, { ...patch, updatedAt: now.toISOString() })
  return changed > 0
}

/** Jobs of one session, newest first. */
export async function listJobsForSession(sessionId: string): Promise<JobRecord[]> {
  const rows = await getDb().jobs.where('sessionId').equals(sessionId).toArray()
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
