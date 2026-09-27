/**
 * Contact onsets (D4, ARCHITECTURE §5.3 S1). Audio is used only to time contact, only when the
 * player turned hit-sound timing on, and only when the time base is real time. Samples are
 * reduced to onset timestamps here and the buffer is zeroed and dropped: raw audio is never kept
 * or persisted. Live recordings bring their onsets in CaptureContext.liveOnsets (already
 * timestamps); imports decode the original file's track.
 */
import type { AudioOnset, CaptureContext, VideoMeta } from '../types.ts'
import {
  assessAudioTiming,
  blobSource,
  decodeAudioFileData,
  decodeAudioTrack,
  detectOnsets,
  hasAudioDecoder,
  toAudioOnsets,
  type DecodedAudio,
  type ProbeResult,
} from '../video/index.ts'

export interface OnsetResult {
  onsets: AudioOnset[]
  status: 'off' | 'live' | 'decoded' | 'unusable' | 'no-audio' | 'failed'
  reason: string
}

export interface OnsetInput {
  file: Blob
  probe?: ProbeResult
  meta: Pick<VideoMeta, 'hasAudio' | 'timeScale'>
  capture: CaptureContext
  hitSoundTiming: boolean
  signal?: AbortSignal
}

async function decode(file: Blob, probe: ProbeResult | undefined): Promise<DecodedAudio> {
  if (probe?.audio && hasAudioDecoder()) {
    try {
      return await decodeAudioTrack(probe.audio, blobSource(file))
    } catch {
      // Fall through to the Web Audio path (e.g. an AudioDecoder that rejects the codec).
    }
  }
  return decodeAudioFileData(await file.arrayBuffer())
}

export async function contactOnsets(input: OnsetInput, decoder: typeof decode = decode): Promise<OnsetResult> {
  if (!input.hitSoundTiming) return { onsets: [], status: 'off', reason: 'hit-sound timing is off' }
  const timing = assessAudioTiming({ hasAudio: input.meta.hasAudio || (input.capture.liveOnsets?.length ?? 0) > 0, timeScale: input.meta.timeScale })
  if (!timing.usable) return { onsets: [], status: input.meta.hasAudio ? 'unusable' : 'no-audio', reason: timing.reason }
  const live = input.capture.liveOnsets
  if (live && live.length > 0) {
    return {
      onsets: live.map((o) => ({ tReal: o.tMs / 1000, strength: o.strength, sharpness: o.sharpness, kind: 'contact' as const })),
      status: 'live',
      reason: 'live onsets from the recording',
    }
  }
  if (!input.meta.hasAudio && !input.probe?.audio) return { onsets: [], status: 'no-audio', reason: 'no audio track' }
  let decoded: DecodedAudio | null = null
  try {
    decoded = await decoder(input.file, input.probe)
    if (input.signal?.aborted) return { onsets: [], status: 'failed', reason: 'cancelled' }
    const details = detectOnsets(decoded.samples, decoded.sampleRate, {
      offsetS: decoded.startTimeS,
      timeScale: input.meta.timeScale,
      labelKinds: true,
    })
    return { onsets: toAudioOnsets(details), status: 'decoded', reason: `${details.length} onsets` }
  } catch (error) {
    return { onsets: [], status: 'failed', reason: error instanceof Error ? error.message : String(error) }
  } finally {
    // Timestamps only (D4): the samples are zeroed and released here.
    decoded?.samples.fill(0)
    decoded = null
  }
}
