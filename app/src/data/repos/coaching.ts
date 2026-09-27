import { ulid } from '../../platform/ids.ts'
import { getDb } from '../db.ts'
import type { CoachingDecision, SessionStats } from '../domain.ts'
import type { CoachingRecord, ExperimentRecord, MatchLogRecord, PracticeLogRecord } from '../records.ts'

// ---------- session statistics (derived, cached) ----------

export async function getStats(sessionId: string): Promise<SessionStats | undefined> {
  return getDb().sessionStats.get(sessionId)
}

export async function putStats(stats: SessionStats): Promise<void> {
  await getDb().sessionStats.put(stats)
}

// ---------- coaching decisions ----------

export async function putDecision(decision: CoachingRecord): Promise<void> {
  await getDb().coaching.put(decision)
}

/** The newest decision for a session (or overall, for Today's focus card when no id is given). */
export async function latestDecision(sessionId?: string): Promise<CoachingDecision | undefined> {
  const db = getDb()
  const rows = sessionId
    ? await db.coaching.where('sessionId').equals(sessionId).sortBy('createdAt')
    : await db.coaching.orderBy('createdAt').toArray()
  return rows.at(-1)
}

// ---------- experiments ----------

export async function createExperiment(
  exp: Omit<ExperimentRecord, 'id' | 'createdAt'> & Partial<Pick<ExperimentRecord, 'id' | 'createdAt'>>,
): Promise<ExperimentRecord> {
  const now = new Date()
  const row: ExperimentRecord = { ...exp, id: exp.id ?? ulid(now.getTime()), createdAt: exp.createdAt ?? now.toISOString() }
  await getDb().experiments.put(row)
  return row
}

export async function getExperiment(id: string): Promise<ExperimentRecord | undefined> {
  return getDb().experiments.get(id)
}

/**
 * The newest active experiment. `demo` narrows it to sample (true) or the player's own (false) data:
 * sample experiments never drive the player's Record plan or coaching (PRODUCT §4.4 rule 11).
 */
export async function getActiveExperiment(opts: { demo?: boolean } = {}): Promise<ExperimentRecord | undefined> {
  const rows = await getDb().experiments.where('status').equals('active').sortBy('createdAt')
  const pick = opts.demo === undefined ? rows : rows.filter((e) => (e.isDemo === 1) === opts.demo)
  return pick.at(-1)
}

export async function listExperiments(): Promise<ExperimentRecord[]> {
  return getDb().experiments.orderBy('createdAt').reverse().toArray()
}

/** Adds a re-test session to an experiment (matched stratum locked by the Record template). */
export async function attachRetest(experimentId: string, sessionId: string): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.experiments, async () => {
    const exp = await db.experiments.get(experimentId)
    if (!exp || exp.retestSessionIds.includes(sessionId)) return
    await db.experiments.put({ ...exp, retestSessionIds: [...exp.retestSessionIds, sessionId] })
  })
}

export async function completeExperiment(experimentId: string, result?: ExperimentRecord['result']): Promise<void> {
  await getDb().experiments.update(experimentId, result ? { status: 'completed', result } : { status: 'completed' })
}

// ---------- practice logs ----------

export async function logPractice(
  log: Omit<PracticeLogRecord, 'id' | 'createdAt'> & Partial<Pick<PracticeLogRecord, 'id' | 'createdAt'>>,
): Promise<PracticeLogRecord> {
  const now = new Date()
  const note = log.note ? log.note.slice(0, 140) : undefined
  const row: PracticeLogRecord = {
    ...log,
    note,
    discomfort: log.body === 'pain' ? 1 : (log.discomfort ?? 0),
    id: log.id ?? ulid(now.getTime()),
    createdAt: log.createdAt ?? now.toISOString(),
  }
  await getDb().practiceLogs.put(row)
  return row
}

export async function listPracticeByExperiment(experimentId: string): Promise<PracticeLogRecord[]> {
  return getDb().practiceLogs.where('experimentId').equals(experimentId).sortBy('date')
}

/** Every practice log dated on or after a local YYYY-MM-DD (the load count, COACHING §11.2), oldest first. */
export async function listPracticeSince(ymd: string): Promise<PracticeLogRecord[]> {
  return getDb().practiceLogs.where('date').aboveOrEqual(ymd).sortBy('date')
}

/** The last n logs of one drill, newest first (progression / regression rules, COACHING §12.2). */
export async function lastLogsForDrill(drillId: string, n: number): Promise<PracticeLogRecord[]> {
  const rows = await getDb().practiceLogs.where('drillId').equals(drillId).sortBy('createdAt')
  return rows.reverse().slice(0, n)
}

// ---------- match logs (D11; never pooled with practice statistics) ----------

export async function saveMatchLog(
  log: Omit<MatchLogRecord, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<MatchLogRecord, 'id' | 'createdAt'>>,
): Promise<MatchLogRecord> {
  const now = new Date().toISOString()
  const row: MatchLogRecord = { ...log, id: log.id ?? ulid(), createdAt: log.createdAt ?? now, updatedAt: now }
  await getDb().matchLogs.put(row)
  return row
}

export async function listMatchLogs(): Promise<MatchLogRecord[]> {
  return getDb().matchLogs.orderBy('date').toArray()
}
