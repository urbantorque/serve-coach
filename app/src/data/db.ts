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

export const CURRENT_DB_VERSION = 2

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
