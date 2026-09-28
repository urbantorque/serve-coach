/**
 * The engine-built sample (ARCHITECTURE §11): three sessions of a computer-generated player, analysed
 * by the real pipeline in headless Edge (app/scripts/build-demo.mjs), with the coaching decision, one
 * experiment and its "Did it work?" verdict worked out by the real coaching engine and statistics.
 * The bundle lives in public/demo/ (seed JSON, key-frame JPEGs, one no-audio video per session) and is
 * inserted with isDemo = 1 when the player taps "See a sample session".
 */
import { getDb, withBlockNumbers } from './db.ts'
import type {
  CoachingRecord,
  ExperimentRecord,
  KeyFrameRecord,
  MatchLogRecord,
  PracticeLogRecord,
  ProfileRecord,
  ServeRecord,
  ServeTagRecord,
  SessionRecord,
  SessionStatsRecord,
  SessionTallyRecord,
  TrackRecord,
  VideoRecord,
} from './records.ts'

export const SAMPLE_SEED_FORMAT = 'serve-coach-sample/1'
export const SAMPLE_BASE_URL = '/demo/'
export const SAMPLE_SEED_FILE = 'seed@1.json'

/**
 * Session ids in the engine-built sample, oldest first: the corpus's multi-serve session clip, a
 * check-in whose focus starts the experiment, and the re-test with its "Did it work?" verdict.
 */
export const SAMPLE_SESSION_IDS = ['sample-s1', 'sample-s2', 'sample-s3'] as const
/** The session "See a sample session" opens: the newest (focus, evidence and the verdict). */
export const SAMPLE_FEATURED_SESSION_ID = 'sample-s3'

/**
 * The synthetic player behind the sample: 1.80 m, right-handed, intermediate club player (about UTR
 * 4), night comp on Tuesdays (D11 launch segment). Coaching uses it on sample data; it is never
 * written over the player's own profile.
 */
export const SAMPLE_PROFILE: ProfileRecord = {
  id: 'me',
  heightM: 1.8,
  handedness: 'right',
  level: 'utr-4-5',
  utr: 4,
  goal: 'first-serves-in',
  ageBand: '18-plus',
  playStyle: ['night-comp'],
  matchNights: ['tue'],
  inSegment: 1,
  comfortRegions: [],
  comfort: { painFlag: 0 },
  createdAt: '2026-09-05T07:50:00+10:00',
  updatedAt: '2026-09-05T07:50:00+10:00',
}

type WithFile<T> = Omit<T, 'blob'> & { file: string }

export interface SampleSeedSession {
  session: SessionRecord
  /** `file` is the no-audio clip under public/demo/ (absent when the sample keeps no video). */
  videos: (VideoRecord & { file?: string })[]
  serves: ServeRecord[]
  tracks: TrackRecord[]
  keyFrames: WithFile<KeyFrameRecord>[]
  stats: SessionStatsRecord
  tags: ServeTagRecord[]
  tally?: SessionTallyRecord
}

export interface SampleSeed {
  format: typeof SAMPLE_SEED_FORMAT
  /** Player-facing provenance line. */
  note: string
  builtAt: string
  versions: { pipeline: string; engine: string; coachingLibrary: string; coachingEngine: string }
  /** Where each session's video came from (synthetic corpus ids) and how it was captured. */
  provenance: { sessionId: string; clip: string; serves: number; note: string }[]
  profile: ProfileRecord
  featuredSessionId: string
  sessions: SampleSeedSession[]
  decisions: CoachingRecord[]
  experiments: ExperimentRecord[]
  practiceLogs: PracticeLogRecord[]
  matchLogs: MatchLogRecord[]
}

// ---------- typed arrays in JSON ----------
// Tracks hold typed arrays (PoseTrackCompact, BallTrackCompact); JSON would turn them into objects
// with a key per element and NaN into null. The seed stores them as base64 of their bytes.

const TYPED = { Int32Array, Float64Array, Float32Array, Uint8Array } as const
type TypedName = keyof typeof TYPED
interface PackedTyped {
  $typed: TypedName
  b64: string
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** Deep copy with every typed array replaced by { $typed, b64 } (JSON-safe, NaN kept). */
export function packTyped<T>(v: T): T {
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const name = (Object.keys(TYPED) as TypedName[]).find((n) => v instanceof TYPED[n])
    if (name) return { $typed: name, b64: toBase64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) } as unknown as T
  }
  if (Array.isArray(v)) return v.map((x) => packTyped(x)) as unknown as T
  if (v && typeof v === 'object' && !(v instanceof Blob)) {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = packTyped(x)
    return out as T
  }
  return v
}

/** Inverse of packTyped. */
export function unpackTyped<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => unpackTyped(x)) as unknown as T
  if (v && typeof v === 'object' && !(v instanceof Blob)) {
    const p = v as unknown as Partial<PackedTyped>
    if (typeof p.$typed === 'string' && typeof p.b64 === 'string' && p.$typed in TYPED) {
      const bytes = fromBase64(p.b64)
      const Ctor = TYPED[p.$typed]
      return new Ctor(bytes.buffer, bytes.byteOffset, bytes.byteLength / Ctor.BYTES_PER_ELEMENT) as unknown as T
    }
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = unpackTyped(x)
    return out as T
  }
  return v
}

export function isSampleSeed(v: unknown): v is SampleSeed {
  const s = v as Partial<SampleSeed> | null
  return !!s && s.format === SAMPLE_SEED_FORMAT && Array.isArray(s.sessions) && s.sessions.length > 0
}

export type BlobFetcher = (file: string) => Promise<Blob>

const httpFetcher =
  (base: string): BlobFetcher =>
  async (file) => {
    const res = await fetch(`${base}${file}`)
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    return res.blob()
  }

/** The published seed, or null when it cannot be fetched (offline first run, tests). */
export async function fetchSampleSeed(base = SAMPLE_BASE_URL): Promise<SampleSeed | null> {
  try {
    const res = await fetch(`${base}${SAMPLE_SEED_FILE}`)
    if (!res.ok) return null
    const json: unknown = await res.json()
    return isSampleSeed(json) ? json : null
  } catch {
    return null
  }
}

const demo = <T extends object>(r: T): T & { isDemo: 1 } => ({ ...r, isDemo: 1 as const })

/**
 * Inserts the seed (every row flagged isDemo) with its key frames and videos. Blobs are fetched first
 * so the database write is one transaction: the sample is either fully there or not at all.
 */
export async function insertSampleSeed(packed: SampleSeed, fetchBlob: BlobFetcher = httpFetcher(SAMPLE_BASE_URL)): Promise<void> {
  const seed = unpackTyped(packed)
  const frames: KeyFrameRecord[] = []
  const videoBlobs: { id: string; blob: Blob }[] = []
  for (const s of seed.sessions) {
    const blobs = await Promise.all(s.keyFrames.map((k) => fetchBlob(k.file)))
    s.keyFrames.forEach((k, i) => {
      const { file: _file, ...rest } = k
      frames.push({ ...rest, blob: blobs[i] })
    })
    for (const v of s.videos) {
      if (!v.file || v.storage !== 'idb') continue
      try {
        videoBlobs.push({ id: v.id, blob: await fetchBlob(v.file) })
      } catch {
        // Without the clip the sample still works from key frames (the "video deleted" path).
      }
    }
  }
  const kept = new Set(videoBlobs.map((v) => v.id))
  const db = getDb()
  await db.transaction(
    'rw',
    [db.sessions, db.videos, db.videoBlobs, db.serves, db.tracks, db.keyFrames, db.tags, db.tallies, db.sessionStats, db.coaching, db.experiments, db.practiceLogs, db.matchLogs],
    async () => {
      const numbered = new Map(withBlockNumbers(seed.sessions.map((s) => demo(s.session))).map((r) => [r.id, r]))
      for (const s of seed.sessions) {
        await db.sessions.put(numbered.get(s.session.id) ?? demo(s.session))
        for (const v of s.videos) {
          const { file: _file, ...row } = v
          const storage = row.storage === 'idb' && !kept.has(row.id) ? 'deleted' : row.storage
          // The sample's clips are kept (no retention date): Remove sample data deletes them.
          const next: VideoRecord = { ...demo(row), storage, retention: { ...row.retention, pinned: 1 } }
          delete next.retainUntil
          await db.videos.put(next)
        }
        await db.serves.bulkPut(s.serves)
        await db.tracks.bulkPut(s.tracks)
        if (s.tags.length) await db.tags.bulkPut(s.tags)
        if (s.tally) await db.tallies.put(s.tally)
        await db.sessionStats.put(s.stats)
      }
      await db.keyFrames.bulkPut(frames)
      await db.videoBlobs.bulkPut(videoBlobs)
      await db.coaching.bulkPut(seed.decisions.map(demo))
      await db.experiments.bulkPut(seed.experiments.map(demo))
      await db.practiceLogs.bulkPut(seed.practiceLogs.map(demo))
      await db.matchLogs.bulkPut(seed.matchLogs.map(demo))
    },
  )
}
