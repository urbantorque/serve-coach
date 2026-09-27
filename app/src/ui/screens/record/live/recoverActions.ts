/**
 * What the player can do with an interrupted recording (RecordingRecovery.tsx): analyse it like any
 * in-app recording, or delete it. Loaded on demand so the app shell stays small.
 */
import type { VideoMeta } from '../../../../analysis/types.ts'
import {
  discardRecording,
  getProfile,
  getSession,
  lengthBucket,
  readRecording,
  recordEvent,
  updateRecordingHeader,
  type RecordingSummary,
} from '../../../../data/index.ts'
import { shortDate } from '../../../format/dates.ts'
import { clock, fpsLabel, resolutionLabel } from '../flow/importLogic.ts'
import { startAnalysis } from '../flow/jobs.ts'
import { playerFacts, recordingCapture, saveNewSession } from '../flow/sessionFactory.ts'
import { activeRecordings } from './recorder.ts'
import { readRecoveryFacts, recoveredRecordingFacts, UNKNOWN_BLOCK } from './recovery.ts'

export class RecoveryError extends Error {}

/**
 * Starts the analysis of a recovered clip and returns its session id. A clip whose session was saved
 * before the interruption reuses that session; otherwise a new one is saved from the facts kept at start.
 */
export async function analyseRecovered(r: RecordingSummary): Promise<string> {
  const out = await readRecording(r.recordingId)
  if (!out) throw new RecoveryError('No video was kept for this recording.')
  activeRecordings.add(r.recordingId)
  try {
    const header = r.header
    let meta: VideoMeta | null = null
    try {
      const { probeVideo } = await import('../../../../analysis/video/probe.ts')
      meta = (await probeVideo(out.blob, { fileName: 'recovered', mimeType: out.blob.type })).meta
    } catch {
      // An unfinished file: keep what the recorder knew; the pipeline probes again.
    }
    const facts = readRecoveryFacts(header)
    const recording = recoveredRecordingFacts(header, meta, r.seconds)
    const block = facts?.block ?? UNKNOWN_BLOCK
    const player = playerFacts(await getProfile())
    // In-app recordings never carry sound, and hit-sound onsets were not kept.
    const capture = recordingCapture(player, block, recording, false)
    const startedAt = new Date(header?.startedAt ?? r.startedAt).toISOString()

    let sessionId = header?.sessionId && (await getSession(header.sessionId)) ? header.sessionId : undefined
    if (!sessionId) {
      sessionId = (
        await saveNewSession({
          session: { capture, view: 'side', cameraSide: 'chest', mode: 'technique', template: facts?.template ?? 'check-in', startedAt, block },
        })
      ).sessionId
    }
    await updateRecordingHeader(r.recordingId, { sessionId, claimedAt: Date.now() })
    const w = meta?.width ?? recording.delivered.width
    const h = meta?.height ?? recording.delivered.height
    void startAnalysis({
      sessionId,
      file: out.blob,
      run: { profile: { heightM: player.heightM, handedness: player.handedness }, view: 'side', capture, source: 'in-app-web', hitSoundTiming: false },
      clip: {
        title: `${shortDate(new Date(startedAt))}, ${clock(recording.durationS)}`,
        line: block.side === 'both' ? 'Side view, recovered recording' : `Side view, ${block.side}, ${block.serveNumber === 2 ? 'second' : 'first'} serves`,
        tech: w && h ? `${resolutionLabel(w, h)}, ${fpsLabel(meta?.captureFps ?? recording.delivered.fps)}` : 'Recovered recording',
        orientation: h >= w ? 'portrait' : 'landscape',
      },
    })
    void recordEvent('recording_recovered', { choice: 'analyse', length: lengthBucket(r.seconds) })
    return sessionId
  } finally {
    activeRecordings.delete(r.recordingId)
  }
}

export async function deleteRecovered(r: RecordingSummary): Promise<void> {
  await discardRecording(r.recordingId)
  void recordEvent('recording_recovered', { choice: 'delete', length: lengthBucket(r.seconds) })
}
