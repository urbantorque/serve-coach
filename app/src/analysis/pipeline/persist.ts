/**
 * Persistence for one analysis run, through the data layer (ARCHITECTURE §5.2, §7, §8).
 *
 * - The session is marked `analysing` and the video stored (with the player's retention policy)
 *   before any decoding, so a failed or cancelled run leaves a session that can be retried.
 * - A stored video never has an audio track (D4 invariant, records.ts). A clip that carries sound
 *   is analysed from the picked file and kept only after `data/stripAudio.ts` has removed the sound
 *   (audio track dropped, audio samples zeroed). When that fails (a fragmented or unusual file), no
 *   copy is kept, with the copy from §5.1.
 * - Results are written in ONE transaction: serves, tracks, key frames, stats, the session's
 *   analysis and the job. A cancelled or failed run writes none of them (never half-saved); the
 *   session and job are marked instead.
 */
import type { AnalysisErrorCode, SessionAnalysis, SessionStats, ServeAnalysis } from '../../data/domain.ts'
import { getDb } from '../../data/db.ts'
import type { CoachingRecord, JobRecord, KeyFrameRecord, RetentionPolicy, SessionRecord, TrackRecord, VideoRecord } from '../../data/records.ts'
import { putDecision, putStats } from '../../data/repos/coaching.ts'
import { putJobForSession, updateJob } from '../../data/repos/jobs.ts'
import { putServesWithTracksAndFrames } from '../../data/repos/serves.ts'
import { createSession, getSession, markStatus, setAnalysis, updateSession } from '../../data/repos/sessions.ts'
import { getSetting } from '../../data/repos/settings.ts'
import { addVideoForSession, listVideosBySession, retainUntilFor } from '../../data/repos/videos.ts'
import { applyDeleteAfterAnalysis } from '../../data/retention.ts'
import { sweepDeletedSessionRows, wasSessionDeleted } from '../../data/deletion.ts'
import type { CameraView, CaptureContext, SessionMode, VideoMeta } from '../types.ts'
import { AnalysisError } from './errors.ts'

export const SOUND_NOT_KEPT_COPY = "We couldn't remove the sound from this video, so we didn't keep a copy. Your original is unchanged."
export const LOW_SPACE_NOT_KEPT_COPY = "Your phone is low on space, so we didn't keep a copy of this video. Your results are saved."

export function modeForView(view: CameraView): SessionMode {
  return view === 'rear' ? 'outcomes' : 'technique'
}

/** Ensures the session exists and is marked analysing; keeps any fields the Record flow set. */
export async function prepareSession(input: {
  sessionId: string
  view: CameraView
  capture: CaptureContext
  startedAt: string
}): Promise<SessionRecord> {
  const existing = await getSession(input.sessionId)
  if (existing) {
    await updateSession(input.sessionId, { status: 'analysing', error: undefined })
    return { ...existing, status: 'analysing' }
  }
  // Deleted by the player while queued: never bring it back (ARCHITECTURE §8.3).
  if (await wasSessionDeleted(input.sessionId)) throw new AnalysisError('cancelled', 'the session was deleted before analysis started')
  const c = input.capture
  return createSession({
    id: input.sessionId,
    startedAt: input.startedAt,
    status: 'analysing',
    mode: modeForView(input.view),
    view: input.view,
    cameraSide: c.cameraSide,
    setup: c.setup,
    orientation: c.orientation,
    template: c.source === 'import' ? 'import' : undefined,
    conditions: c.conditions,
    defaultSide: c.serveSide === 'both' ? undefined : c.serveSide,
    defaultServeNumber: c.serveNumber === 'mixed' ? undefined : c.serveNumber,
    defaultIntendedType: c.intendedType,
    defaultTarget: c.intendedTarget === 'mixed' ? undefined : c.intendedTarget,
  })
}

/** size + SHA-256 of the first and last 64 KB + duration (duplicate-import check, §7.1). */
export async function fingerprintOf(file: Blob, durationS: number): Promise<string> {
  const chunk = 64 * 1024
  const head = await file.slice(0, Math.min(chunk, file.size)).arrayBuffer()
  const tail = await file.slice(Math.max(0, file.size - chunk)).arrayBuffer()
  let digest = ''
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const both = new Uint8Array(head.byteLength + tail.byteLength)
    both.set(new Uint8Array(head), 0)
    both.set(new Uint8Array(tail), head.byteLength)
    const hash = new Uint8Array(await subtle.digest('SHA-256', both))
    digest = Array.from(hash.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${file.size}:${digest}:${durationS.toFixed(3)}`
}

type StripAudio = (file: Blob) => Promise<Blob>
const stripModules = import.meta.glob<{ stripAudio?: StripAudio }>('/src/data/stripAudio.ts')

async function findStripAudio(): Promise<StripAudio | null> {
  for (const load of Object.values(stripModules)) {
    try {
      const mod = await load()
      if (typeof mod.stripAudio === 'function') return mod.stripAudio
    } catch {
      // Treated as missing.
    }
  }
  return null
}

export interface StoreVideoInput {
  videoId: string
  sessionId: string
  file: Blob
  fileName: string
  meta: VideoMeta
  capture: CaptureContext
  source: VideoRecord['source']
  hasAudioTrack: boolean
  /** Result of the storage estimate (budget.checkStorage). */
  roomToStore: boolean
  now?: Date
}

/** Stores the clip (or only its metadata) per the retention setting; returns the record and any player-facing note. */
export async function storeVideo(input: StoreVideoInput): Promise<{ record: VideoRecord; note?: string }> {
  // No clip is kept for a session the player deleted while it was being analysed.
  if (!(await getSession(input.sessionId))) throw new AnalysisError('cancelled', 'the session was deleted during analysis')
  const now = input.now ?? new Date()
  const fingerprint = await fingerprintOf(input.file, input.meta.durationMediaS)
  // "Analyse again" on the same clip (the picked file, or the kept copy, which has the same size and
  // length once its sound is removed) replaces the session's video row instead of adding a second.
  const previous = (await listVideosBySession(input.sessionId)).find(
    (v) =>
      v.role === 'primary' &&
      (v.fingerprint === fingerprint || (v.sizeBytes === input.file.size && Math.abs(v.meta.durationMediaS - input.meta.durationMediaS) < 0.01)),
  )
  const importedAt = previous?.importedAt ?? now.toISOString()
  const retention = await getSetting('retention')
  const policy: RetentionPolicy = retention.policy
  let blob: Blob | undefined = input.file
  let note: string | undefined
  // No stored copy ever carries sound (D4): stripped, or not kept at all.
  const audio: VideoRecord['audio'] = input.hasAudioTrack ? 'removed' : 'never-recorded'
  if (input.hasAudioTrack) {
    const strip = await findStripAudio()
    if (strip) {
      try {
        blob = await strip(input.file)
      } catch {
        blob = undefined
      }
    } else blob = undefined
    if (!blob) note = SOUND_NOT_KEPT_COPY
  }
  if (blob && !input.roomToStore) {
    blob = undefined
    note = LOW_SPACE_NOT_KEPT_COPY
  }
  // An earlier kept copy stays rather than being replaced by "not kept".
  if (!blob && previous?.storage === 'idb') return { record: previous }
  const retainUntil = blob ? retainUntilFor(policy, importedAt, retention.days) : undefined
  const record: VideoRecord = {
    id: previous?.id ?? input.videoId,
    sessionId: input.sessionId,
    role: 'primary',
    source: input.source,
    capture: input.capture,
    fileName: input.fileName,
    mimeType: input.file.type || input.meta.mimeType,
    sizeBytes: input.file.size,
    fingerprint,
    meta: input.meta,
    importedAt,
    storage: blob ? 'idb' : 'not-kept',
    retention: { policy: blob ? policy : 'delete-after-analysis', retainUntil, pinned: 0 },
    audio,
    isDemo: 0,
  }
  // The session check and the write are one transaction: a delete that lands while the clip was
  // being fingerprinted or stripped of sound leaves no video or blob behind (ARCHITECTURE §8.3).
  const stored = await addVideoForSession(record, blob)
  if (!stored) throw new AnalysisError('cancelled', 'the session was deleted during analysis')
  return { record: stored, note }
}

export async function startJob(input: { jobId: string; sessionId: string; videoId: string; engineVersion: string; now?: Date }): Promise<JobRecord> {
  const job: JobRecord = {
    id: input.jobId,
    sessionId: input.sessionId,
    videoId: input.videoId,
    state: 'sparse',
    completedWindows: [],
    progress: 0,
    attempts: 1,
    engineVersion: input.engineVersion,
    updatedAt: (input.now ?? new Date()).toISOString(),
  }
  // Never a job row for a session the player has deleted (checked in the same transaction).
  if (!(await putJobForSession(job))) throw new AnalysisError('cancelled', 'the session was deleted during analysis')
  return job
}

export async function patchJob(jobId: string, patch: Partial<Omit<JobRecord, 'id'>>): Promise<void> {
  await updateJob(jobId, patch)
}

export interface CommitInput {
  sessionId: string
  jobId: string
  serves: ServeAnalysis[]
  tracks: TrackRecord[]
  keyFrames: KeyFrameRecord[]
  stats: SessionStats
  analysis: SessionAnalysis
  decision?: CoachingRecord
  windowsDone: number[]
  /** A copy of the clip was stored (so "delete after analysis" has something to delete). */
  videoStored: boolean
}

/**
 * One transaction for everything the run produced. Engine rows from an earlier run of the same
 * session are replaced (player tags are kept). Applies "delete after analysis" afterwards.
 */
export async function commitResults(input: CommitInput): Promise<void> {
  const db = getDb()
  let deleted = false
  await db.transaction('rw', [db.sessions, db.serves, db.tracks, db.keyFrames, db.sessionStats, db.jobs, db.coaching], async () => {
    // The player deleted the session while it was analysing: write nothing (no orphaned key frames,
    // pose tracks, stats or decisions that no screen could list, export or delete).
    if (!(await db.sessions.get(input.sessionId))) {
      deleted = true
      await db.jobs.delete(input.jobId)
      return
    }
    await db.serves.where('sessionId').equals(input.sessionId).delete()
    await db.tracks.where('sessionId').equals(input.sessionId).delete()
    await db.keyFrames.where('sessionId').equals(input.sessionId).delete()
    await putServesWithTracksAndFrames(input.serves, input.tracks, input.keyFrames)
    await putStats(input.stats)
    if (input.decision) await putDecision(input.decision)
    await setAnalysis(input.sessionId, input.analysis)
    await updateJob(input.jobId, { state: 'done', progress: 1, completedWindows: input.windowsDone })
  })
  if (deleted) throw new AnalysisError('cancelled', 'the session was deleted during analysis')
  // A clip that was never stored stays 'not-kept' (it is not "deleted after analysis").
  if (input.videoStored) await applyDeleteAfterAnalysis(input.sessionId)
}

/**
 * Cancelled: the session and job are marked; nothing from the run is written. When the session itself
 * was deleted meanwhile, anything the run wrote for it before the delete is cleared too.
 */
export async function markCancelled(sessionId: string, jobId: string | null): Promise<void> {
  await markStatus(sessionId, 'cancelled', { code: 'cancelled', message: 'Analysis stopped before it finished.' })
  if (jobId) await updateJob(jobId, { state: 'cancelled', error: { code: 'cancelled', message: 'cancelled by the player' } })
  await sweepDeletedSessionRows(sessionId)
}

export async function markFailed(sessionId: string, jobId: string | null, code: AnalysisErrorCode, message: string): Promise<void> {
  await markStatus(sessionId, 'failed', { code, message })
  if (jobId) await updateJob(jobId, { state: 'failed', error: { code, message } })
  await sweepDeletedSessionRows(sessionId)
}
