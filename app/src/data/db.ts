/**
 * Dexie schema (ARCHITECTURE §7.2, §7.3). UI code never touches `db` directly: it goes through the
 * repository functions in `data/repos/*` and the hooks in `data/hooks.ts`.
 *
 * Migration rules (§7.3): schema changes are additive; upgrades are idempotent and never drop
 * player-entered data; engine output is never rewritten; every version ships with a test that opens
 * a database at version n - 1, upgrades it and checks invariants (`migrations.test.ts`).
 */
import { Dexie, type Table, type Transaction } from 'dexie'
import type { FpsClass } from '../analysis/types.ts'
import type {
  AnnotationRecord,
  CoachingRecord,
  DeletionLogRecord,
  EventRecord,
  ExperimentRecord,
  JobRecord,
  KeyFrameRecord,
  MatchLogRecord,
  PracticeLogRecord,
  ProfileRecord,
  ServeRecord,
  ServeTagRecord,
  SessionRecord,
  SessionStatsRecord,
  SessionTallyRecord,
  SettingRecord,
  TrackRecord,
  VideoBlobRecord,
  VideoChunkRecord,
  VideoRecord,
} from './records.ts'

export const DB_NAME = 'serve-coach'

/** Version 1: ARCHITECTURE §7.2 as specified. */
export const SCHEMA_V1: Record<string, string> = {
  profile: 'id',
  settings: 'key',
  sessions: 'id, startedAt, visitId, status, mode, isDemo, [mode+startedAt], linkedSessionId, experimentId',
  videos: 'id, sessionId, storage, retainUntil, isDemo',
  videoBlobs: 'id',
  videoChunks: '[recordingId+seq], recordingId',
  jobs: 'id, sessionId, state, updatedAt',
  serves: 'id, sessionId, [sessionId+index], videoId, includedFlag',
  tracks: 'serveId, sessionId',
  keyFrames: 'id, serveId, sessionId, [serveId+event], role',
  tags: 'serveId, sessionId, outcome, serveNumber, side',
  tallies: 'sessionId',
  sessionStats: 'sessionId',
  coaching: 'id, sessionId, createdAt, experimentId',
  experiments: 'id, status, createdAt, *baselineSessionIds, *retestSessionIds',
  practiceLogs: 'id, date, experimentId, drillId',
  matchLogs: 'id, date, experimentId',
  events: '++seq, at, name',
  annotations: 'id, sessionId, serveId, annotator, createdAt',
  deletionLog: '++seq, at, scope',
}

/**
 * Version 2 (ARCHITECTURE §7.3 example): a compound index for matched Progress queries by frame-rate
 * class, with `fpsClass` backfilled from the stored analysis. Every v1 index is kept.
 */
export const SCHEMA_V2: Record<string, string> = {
  sessions:
    'id, startedAt, visitId, status, mode, isDemo, [mode+startedAt], [mode+fpsClass+startedAt], linkedSessionId, experimentId',
}

/**
 * Version 3 (closure round, 28 Sep 2026): real recording blocks. `SessionRecord.blockIndex` is the
 * 1-based order of a recording among the visit's recordings of the same template (CAPTURE §5.5:
 * Experiment Block A = 1, Block B = 2). Earlier versions saved every session as block 0; the upgrade
 * numbers them from their start times. A compound index lists a visit's blocks in order. Every v2
 * index is kept.
 */
export const SCHEMA_V3: Record<string, string> = {
  sessions:
    'id, startedAt, visitId, status, mode, isDemo, [mode+startedAt], [mode+fpsClass+startedAt], linkedSessionId, experimentId, [visitId+blockIndex]',
}

export const CURRENT_DB_VERSION = 3

/** A session that never produced results does not take a block number (it is recorded again). */
const takesBlock = (s: Pick<SessionRecord, 'status'>) => s.status !== 'failed' && s.status !== 'cancelled'

/** The group a block number counts within: same visit, same template, same kind of data. */
export const blockGroup = (s: Pick<SessionRecord, 'visitId' | 'template' | 'isDemo'>) => `${s.isDemo === 1 ? 'demo' : 'own'}|${s.visitId}|${s.template ?? ''}`

/**
 * Block numbers for sessions in one group, oldest first: each is 1 + the sessions before it that took
 * a block (a failed or cancelled recording is numbered but does not move the count on, as when the
 * Record flow numbers a new recording). Sessions that already have a number keep it.
 */
export function numberBlocks<T extends Pick<SessionRecord, 'startedAt' | 'createdAt' | 'id' | 'status' | 'blockIndex'>>(group: readonly T[]): Map<string, number> {
  const out = new Map<string, number>()
  const ordered = [...group].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id))
  let taken = 0
  for (const s of ordered) {
    const n = s.blockIndex && s.blockIndex > 0 ? s.blockIndex : taken + 1
    out.set(s.id, n)
    if (takesBlock(s)) taken = Math.max(taken + 1, n)
  }
  return out
}

/** Block numbers for a missing (or 0) blockIndex among these rows, grouped by blockGroup. */
export function missingBlockNumbers(rows: readonly SessionRecord[]): Map<string, number> {
  const groups = new Map<string, SessionRecord[]>()
  for (const s of rows) {
    const g = groups.get(blockGroup(s)) ?? []
    g.push(s)
    groups.set(blockGroup(s), g)
  }
  const out = new Map<string, number>()
  for (const group of groups.values()) {
    if (group.every((s) => s.blockIndex && s.blockIndex > 0)) continue
    for (const [id, n] of numberBlocks(group)) {
      const s = group.find((x) => x.id === id)
      if (!(s?.blockIndex && s.blockIndex > 0)) out.set(id, n)
    }
  }
  return out
}

/**
 * Rows written outside createSession (the sample data, whose seed predates real blocks and says 0):
 * each gets its block number as a recording would.
 */
export function withBlockNumbers<T extends SessionRecord>(rows: readonly T[]): T[] {
  const numbers = missingBlockNumbers(rows)
  return rows.map((s) => (numbers.has(s.id) ? { ...s, blockIndex: numbers.get(s.id) } : s))
}

/** v2 -> v3 upgrade. Idempotent: it only fills a missing (or 0) blockIndex. */
export async function upgradeToV3(tx: Transaction): Promise<void> {
  const table = tx.table('sessions')
  const numbers = missingBlockNumbers((await table.toArray()) as SessionRecord[])
  for (const [id, blockIndex] of numbers) await table.update(id, { blockIndex })
}

export function fpsClassFor(captureFps: number): FpsClass {
  return captureFps >= 100 ? 'fps120plus' : captureFps >= 50 ? 'fps60' : 'fps30'
}

/** v1 -> v2 upgrade. Idempotent: it only fills a missing fpsClass. */
export async function upgradeToV2(tx: Transaction): Promise<void> {
  await tx
    .table('sessions')
    .toCollection()
    .modify((s: SessionRecord) => {
      const fps = s.analysis?.capture.meta.captureFps
      if (fps && !s.fpsClass) s.fpsClass = fpsClassFor(fps)
    })
}

export class ServeCoachDB extends Dexie {
  declare profile: Table<ProfileRecord, 'me'>
  declare settings: Table<SettingRecord, string>
  declare sessions: Table<SessionRecord, string>
  declare videos: Table<VideoRecord, string>
  declare videoBlobs: Table<VideoBlobRecord, string>
  declare videoChunks: Table<VideoChunkRecord, [string, number]>
  declare jobs: Table<JobRecord, string>
  declare serves: Table<ServeRecord, string>
  declare tracks: Table<TrackRecord, string>
  declare keyFrames: Table<KeyFrameRecord, string>
  declare tags: Table<ServeTagRecord, string>
  declare tallies: Table<SessionTallyRecord, string>
  declare sessionStats: Table<SessionStatsRecord, string>
  declare coaching: Table<CoachingRecord, string>
  declare experiments: Table<ExperimentRecord, string>
  declare practiceLogs: Table<PracticeLogRecord, string>
  declare matchLogs: Table<MatchLogRecord, string>
  declare events: Table<EventRecord, number>
  declare annotations: Table<AnnotationRecord, string>
  declare deletionLog: Table<DeletionLogRecord, number>

  constructor(name: string = DB_NAME) {
    super(name)
    this.version(1).stores(SCHEMA_V1)
    this.version(2).stores(SCHEMA_V2).upgrade(upgradeToV2)
    this.version(3).stores(SCHEMA_V3).upgrade(upgradeToV3)
  }
}

let instance: ServeCoachDB | null = null

/** The app's database. Created lazily so tests and the dev gallery can swap it. */
export function getDb(): ServeCoachDB {
  if (!instance) {
    instance = new ServeCoachDB()
    // ARCHITECTURE §7.3 rule 6: another tab upgraded the schema; close and let the UI ask to reload.
    instance.on('versionchange', () => {
      instance?.close()
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('serve-coach:db-versionchange'))
      return false
    })
  }
  return instance
}

/** Tests only: point the data layer at a fresh, uniquely named database. */
export async function resetDbForTests(name = `serve-coach-test-${Math.random().toString(36).slice(2)}`): Promise<ServeCoachDB> {
  if (instance) {
    instance.close()
  }
  instance = new ServeCoachDB(name)
  await instance.open()
  return instance
}
