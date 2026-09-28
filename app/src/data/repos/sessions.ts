import { Dexie } from 'dexie'
import type { SessionMode } from '../../analysis/types.ts'
import { localDate, ulid } from '../../platform/ids.ts'
import { blockGroup, fpsClassFor, getDb } from '../db.ts'
import type { SessionAnalysis } from '../domain.ts'
import type { SessionRecord, SessionStatus } from '../records.ts'

export type NewSession = Omit<SessionRecord, 'id' | 'createdAt' | 'visitId' | 'isRetest' | 'isDemo'> &
  Partial<Pick<SessionRecord, 'id' | 'createdAt' | 'visitId' | 'isRetest' | 'isDemo'>>

/**
 * Adds a session. Each recording is its own block (CAPTURE §5.5): unless the caller set one,
 * `blockIndex` is 1 + the highest block of the visit's earlier recordings with the same template that
 * produced (or may still produce) results, worked out in the same transaction as the write, so an
 * Experiment visit's Block A is 1 and its Block B is 2.
 */
export async function createSession(input: NewSession, now: Date = new Date()): Promise<SessionRecord> {
  const db = getDb()
  const record: SessionRecord = {
    ...input,
    id: input.id ?? ulid(now.getTime()),
    createdAt: input.createdAt ?? now.toISOString(),
    visitId: input.visitId ?? localDate(new Date(input.startedAt)),
    isRetest: input.isRetest ?? 0,
    isDemo: input.isDemo ?? 0,
  }
  return db.transaction('rw', db.sessions, async () => {
    if (!(record.blockIndex && record.blockIndex > 0)) {
      const group = blockGroup(record)
      const earlier = await db.sessions
        .where('visitId')
        .equals(record.visitId)
        .filter((s) => blockGroup(s) === group && s.status !== 'failed' && s.status !== 'cancelled')
        .toArray()
      record.blockIndex = 1 + earlier.reduce((m, s) => Math.max(m, s.blockIndex && s.blockIndex > 0 ? s.blockIndex : 1), 0)
    }
    await db.sessions.add(record)
    return record
  })
}

/** The visit's blocks in recording order (`[visitId+blockIndex]`). */
export async function listBlocksOfVisit(visitId: string): Promise<SessionRecord[]> {
  return getDb()
    .sessions.where('[visitId+blockIndex]')
    .between([visitId, Dexie.minKey], [visitId, Dexie.maxKey])
    .toArray()
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return getDb().sessions.get(id)
}

/** Every session, newest first. Demo sessions are included unless `includeDemo` is false. */
export async function listSessions(opts: { includeDemo?: boolean } = {}): Promise<SessionRecord[]> {
  const rows = await getDb().sessions.orderBy('startedAt').reverse().toArray()
  return opts.includeDemo === false ? rows.filter((s) => s.isDemo === 0) : rows
}

/**
 * Sessions of one view (D1: never mixed), oldest first, for Progress. Demo sessions never enter
 * Progress (ARCHITECTURE §11), so they are excluded unless asked for.
 */
export async function listByMode(
  mode: SessionMode,
  range: { from?: string; to?: string } = {},
  opts: { includeDemo?: boolean } = {},
): Promise<SessionRecord[]> {
  const rows = await getDb()
    .sessions.where('[mode+startedAt]')
    .between([mode, range.from ?? Dexie.minKey], [mode, range.to ?? Dexie.maxKey], true, true)
    .toArray()
  return opts.includeDemo ? rows : rows.filter((s) => s.isDemo === 0)
}

export async function listByVisit(visitId: string): Promise<SessionRecord[]> {
  return getDb().sessions.where('visitId').equals(visitId).sortBy('startedAt')
}

export async function updateSession(id: string, patch: Partial<Omit<SessionRecord, 'id'>>): Promise<void> {
  await getDb().sessions.update(id, patch)
}

export async function markStatus(id: string, status: SessionStatus, error?: SessionRecord['error']): Promise<void> {
  await getDb().sessions.update(id, error ? { status, error } : { status })
}

/** Stores the immutable engine output and denormalises the matching fields onto the session. */
export async function setAnalysis(id: string, analysis: SessionAnalysis): Promise<void> {
  await getDb().sessions.update(id, {
    analysis,
    status: 'ready',
    fpsClass: fpsClassFor(analysis.capture.meta.captureFps),
    setup: analysis.capture.setup,
    tiltStatus: analysis.capture.rectification.status,
    orientation: analysis.capture.rectification.orientation,
  })
}

/**
 * Free-tier meter (PRODUCT §5.2): distinct practice days (visitIds) in a calendar month with at least
 * one analysed, non-demo session. Multi-block visits count once.
 */
export async function analysedDaysInMonth(yyyymm: string): Promise<number> {
  const rows = await getDb()
    .sessions.where('visitId')
    .startsWith(yyyymm)
    .filter((s) => s.status === 'ready' && s.isDemo === 0)
    .toArray()
  return new Set(rows.map((s) => s.visitId)).size
}
