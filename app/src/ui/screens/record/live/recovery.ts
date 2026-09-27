/**
 * Recovering an interrupted in-app recording (ARCHITECTURE §5.12 "Recording interrupted", §7.2).
 * Pure helpers: what the recorder keeps with its chunks at start (`recoveryFacts`), and how a recovered
 * clip's recording facts, block and wording are rebuilt from it. The actions (analyse, delete) are in
 * recoverActions.ts, loaded only when the player chooses one.
 *
 * Honesty: a recovered clip has the tilt log only when the recorder stopped cleanly; after a crash it
 * has none, so heights follow the engine's "tilt unknown" rules (METRICS §1.1.3a) like an import.
 */
import type { SessionTemplate } from '../../../../data/index.ts'
import type { RecordingHeader } from '../../../../data/records.ts'
import type { VideoMeta } from '../../../../analysis/types.ts'
import { shortDate } from '../../../format/dates.ts'
import type { BlockFacts, RecordingFacts } from '../flow/sessionFactory.ts'

export interface RecoveryFacts {
  v: 1
  recording: Omit<RecordingFacts, 'mimeType' | 'durationS'>
  block: BlockFacts
  template: SessionTemplate
}

/** What the recorder stores at start (the header's opaque `facts`). */
export function recoveryFacts(input: Omit<RecoveryFacts, 'v'>): Record<string, unknown> {
  return { v: 1, ...input }
}

export function readRecoveryFacts(header: RecordingHeader | undefined): RecoveryFacts | null {
  const f = header?.facts as Partial<RecoveryFacts> | undefined
  if (!f || f.v !== 1 || !f.recording || !f.block || !f.template) return null
  return f as RecoveryFacts
}

/** When the block card was lost: nothing is assumed about side or serve, so no wrong stratum is matched. */
export const UNKNOWN_BLOCK: BlockFacts = { side: 'both', serveNumber: 'mixed' }

/**
 * The recording facts for a recovered clip. The probe's size and frame rate win over what the camera
 * reported at start (they describe the file that exists), and the length comes from the file when the
 * recorder never stopped.
 */
export function recoveredRecordingFacts(
  header: RecordingHeader | undefined,
  meta: Pick<VideoMeta, 'width' | 'height' | 'captureFps' | 'durationMediaS'> | null,
  secondsFromChunks: number,
): RecordingFacts {
  const facts = readRecoveryFacts(header)
  const base = facts?.recording
  const orientation = meta ? (meta.height >= meta.width ? 'portrait' : 'landscape') : (base?.orientation ?? 'portrait')
  return {
    requested: base?.requested ?? { width: 1920, height: 1080, fps: 60 },
    delivered: meta ? { width: meta.width, height: meta.height, fps: meta.captureFps } : (base?.delivered ?? { width: 0, height: 0, fps: 0 }),
    orientation,
    setup: base?.setup ?? (orientation === 'landscape' ? 'fence' : 'portrait'),
    ...(base?.cameraLabel ? { cameraLabel: base.cameraLabel } : {}),
    ...(base?.orientationSamples?.length ? { orientationSamples: base.orientationSamples } : {}),
    ...(base?.recordingStartMs ? { recordingStartMs: base.recordingStartMs } : {}),
    ...(base?.framingAtStart ? { framingAtStart: base.framingAtStart } : {}),
    ...(base?.recordedAnyway?.length ? { recordedAnyway: base.recordedAnyway } : {}),
    ...(base?.expectedServeCount ? { expectedServeCount: base.expectedServeCount } : {}),
    mimeType: header?.mimeType || 'video/webm',
    durationS: header?.durationS ?? (meta?.durationMediaS && meta.durationMediaS > 0 ? meta.durationMediaS : secondsFromChunks),
  }
}

/** "3:40" */
export function clipLength(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "Sat 26 Sep at 6:40 pm" in the phone's time zone (built by hand, like ui/format/dates.ts). */
export function recordedWhen(epochMs: number): string {
  const d = new Date(epochMs)
  const h = d.getHours()
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
  return `${shortDate(d)} at ${time}`
}
