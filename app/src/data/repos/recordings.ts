/**
 * In-app recording chunks (ARCHITECTURE §7.2 "Recording chunks", §7.4 RecordingRepo, §5.12 "Recording
 * interrupted"). The recorder writes each one-second MediaRecorder chunk to `videoChunks` as it arrives,
 * so a crash, a killed tab or a flat battery loses about a second, and the clip is offered again on the
 * next launch. Row seq -1 is the recording's header (facts known at start, the tilt log at stop, and the
 * session that took the clip); media chunks start at 0.
 *
 * Clean-up rules (`sweepRecordings`, run on launch):
 * - a clip a session took is deleted once that session has its video record, or when the session is gone;
 * - a clip under 5 seconds, or with no media, is deleted (nothing to analyse);
 * - a clip older than 7 days is deleted;
 * - at most 2 unfinished clips are kept, newest first.
 * Every sweep writes a `deletionLog` row with counts only.
 */
import { getDb } from '../db.ts'
import type { RecordingHeader, VideoChunkRecord } from '../records.ts'

export const HEADER_SEQ = -1
export const RECORDING_KEEP_DAYS = 7
export const MAX_UNFINISHED_RECORDINGS = 2
/** Shorter than this, a recovered clip cannot hold a serve worth analysing. */
export const MIN_RECOVERABLE_S = 5
/** A chunk written this recently may belong to a recording still running in another tab. */
export const LIVE_GRACE_MS = 15_000

const DAY_MS = 24 * 60 * 60 * 1000
const EMPTY = () => new Blob([])

export async function startRecordingRows(recordingId: string, header: RecordingHeader, now: number = Date.now()): Promise<void> {
  await getDb().videoChunks.put({ recordingId, seq: HEADER_SEQ, blob: EMPTY(), header, writtenAt: now })
}

export async function appendChunk(recordingId: string, seq: number, blob: Blob, now: number = Date.now()): Promise<void> {
  if (seq < 0) throw new RangeError('media chunks start at seq 0')
  await getDb().videoChunks.put({ recordingId, seq, blob, writtenAt: now })
}

/** Merges into the header (stop facts, tilt log, the claiming session). Creates it if missing. */
export async function updateRecordingHeader(recordingId: string, patch: Partial<RecordingHeader>, now: number = Date.now()): Promise<void> {
  const db = getDb()
  await db.transaction('rw', db.videoChunks, async () => {
    const row = await db.videoChunks.get([recordingId, HEADER_SEQ])
    const header: RecordingHeader = { mimeType: '', startedAt: now, ...row?.header, ...patch }
    await db.videoChunks.put({ recordingId, seq: HEADER_SEQ, blob: EMPTY(), header, writtenAt: row?.writtenAt ?? now })
  })
}

export async function getRecordingHeader(recordingId: string): Promise<RecordingHeader | undefined> {
  return (await getDb().videoChunks.get([recordingId, HEADER_SEQ]))?.header
}

/** The media chunks in order, as one Blob (disk-backed where the browser keeps IndexedDB blobs on disk). */
export async function readRecording(recordingId: string): Promise<{ blob: Blob; header?: RecordingHeader; chunks: number } | null> {
  const rows = await getDb().videoChunks.where('recordingId').equals(recordingId).sortBy('seq')
  const media = rows.filter((r) => r.seq >= 0 && r.blob.size > 0)
  if (!media.length) return null
  const header = rows.find((r) => r.seq === HEADER_SEQ)?.header
  const type = (header?.mimeType || media[0].blob.type || 'video/webm').split(';')[0]
  return { blob: new Blob(media.map((r) => r.blob), { type }), header, chunks: media.length }
}

export async function discardRecording(recordingId: string): Promise<number> {
  return getDb().videoChunks.where('recordingId').equals(recordingId).delete()
}

export interface RecordingSummary {
  recordingId: string
  header?: RecordingHeader
  chunks: number
  bytes: number
  /** Seconds recorded: the stop duration when known, otherwise about one second per chunk. */
  seconds: number
  startedAt: number
  lastWrittenAt: number
}

/** Every recording that still has rows, newest first. */
export async function listRecordings(): Promise<RecordingSummary[]> {
  const rows = await getDb().videoChunks.toArray()
  const by = new Map<string, VideoChunkRecord[]>()
  for (const r of rows) by.set(r.recordingId, [...(by.get(r.recordingId) ?? []), r])
  const out: RecordingSummary[] = []
  for (const [recordingId, list] of by) {
    const header = list.find((r) => r.seq === HEADER_SEQ)?.header
    const media = list.filter((r) => r.seq >= 0)
    const lastWrittenAt = Math.max(0, ...list.map((r) => r.writtenAt ?? 0))
    out.push({
      recordingId,
      header,
      chunks: media.length,
      bytes: media.reduce((s, r) => s + r.blob.size, 0),
      seconds: header?.durationS ?? media.length,
      startedAt: header?.startedAt ?? lastWrittenAt,
      lastWrittenAt,
    })
  }
  return out.sort((a, b) => b.startedAt - a.startedAt)
}

export type RecordingFate = 'recover' | 'settled' | 'too-short' | 'too-old' | 'over-cap' | 'live'

/**
 * What the launch sweep does with one recording. `sessionHasVideo`: the claiming session exists and has
 * a video record; `sessionExists`: it exists at all. Pure, so the rules are unit-tested.
 */
export function recordingFate(
  r: RecordingSummary,
  context: { now: number; rank: number; sessionExists?: boolean; sessionHasVideo?: boolean; active?: boolean },
): RecordingFate {
  if (context.active || context.now - r.lastWrittenAt < LIVE_GRACE_MS) return 'live'
  if (r.header?.sessionId && (context.sessionHasVideo || !context.sessionExists)) return 'settled'
  if (r.bytes === 0 || r.seconds < MIN_RECOVERABLE_S) return 'too-short'
  if (context.now - r.startedAt > RECORDING_KEEP_DAYS * DAY_MS) return 'too-old'
  if (context.rank >= MAX_UNFINISHED_RECORDINGS) return 'over-cap'
  return 'recover'
}

export interface SweepRecordingsResult {
  /** Recordings to offer to the player, newest first. */
  recoverable: RecordingSummary[]
  removed: number
}

/** The launch sweep. `activeIds`: recordings running in this page, never touched. */
export async function sweepRecordings(options: { now?: number; activeIds?: ReadonlySet<string> } = {}): Promise<SweepRecordingsResult> {
  const now = options.now ?? Date.now()
  const db = getDb()
  const all = await listRecordings()
  const recoverable: RecordingSummary[] = []
  const counts: Record<string, number> = {}
  let rank = 0
  for (const r of all) {
    const sessionId = r.header?.sessionId
    const session = sessionId ? await db.sessions.get(sessionId) : undefined
    const videos = sessionId ? await db.videos.where('sessionId').equals(sessionId).count() : 0
    const fate = recordingFate(r, { now, rank, sessionExists: Boolean(session), sessionHasVideo: videos > 0, active: options.activeIds?.has(r.recordingId) })
    if (fate === 'live') continue
    if (fate === 'recover') {
      recoverable.push(r)
      rank++
      continue
    }
    await discardRecording(r.recordingId)
    counts[fate] = (counts[fate] ?? 0) + 1
  }
  const removed = Object.values(counts).reduce((a, b) => a + b, 0)
  // Settled clips are not deletions the player needs to see (the session keeps its own video).
  const logged = removed - (counts.settled ?? 0)
  if (logged > 0) {
    const { settled: _settled, ...rest } = counts
    await db.deletionLog.add({ at: new Date(now).toISOString(), scope: 'recording-sweep', counts: { recordings: logged, ...rest } })
  }
  return { recoverable, removed }
}
