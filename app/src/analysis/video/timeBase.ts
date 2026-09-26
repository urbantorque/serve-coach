/**
 * Capture-rate / time-scale assessment. Decides, from container evidence only, whether
 * media seconds equal real seconds. It never guesses a slow-motion factor: when the file
 * cannot prove its time base the status is 'unknown' and timeScale stays 1 until the user
 * or the ball-toss gravity fit (implemented elsewhere) supplies one via applyTimeScale().
 */
import type { VideoMeta } from '../types.ts'
import { metadataNumber, metadataString, QT_KEYS, type ContainerMetadata } from './qtMetadata.ts'
import type { RateSegment } from './timing.ts'

export type FpsSource = VideoMeta['fpsSource']

export type TimeBaseKind =
  /** Ordinary real-time clip as far as the container can tell. */
  | 'normal'
  /** Timestamps themselves are high rate (e.g. 120/240 fps originals): real time, just many frames. */
  | 'native-high-fps'
  /** Metadata states a capture rate different from the timeline rate (e.g. com.android.capture.fps). */
  | 'metadata-time-scaled'
  /** Signals of a rendered slow-motion export, but nothing proves the factor. */
  | 'possible-rendered-slomo'

export interface TimeBaseAssessment {
  kind: TimeBaseKind
  /** 'proven' only when metadata or native timestamps establish the capture rate. */
  status: 'proven' | 'unknown'
  captureFps: number
  /** Real seconds per media second. */
  timeScale: number
  fpsSource: FpsSource
  /** From com.apple.quicktime.full-frame-rate-playback-intent when present. */
  playbackIntent?: 'full-frame-rate' | 'slow-motion'
  device?: { make?: string; model?: string; software?: string }
  evidence: string[]
  warnings: string[]
}

export interface TimeBaseInput {
  nominalFps: number
  segments: readonly RateSegment[]
  metadata: ContainerMetadata
  /** Playback rate of the (first) media edit; != 1 means the file remaps time. */
  editRate: number
}

/** Timeline rates at or above this are treated as native high-frame-rate capture. */
export const HIGH_FPS_THRESHOLD = 100
/** Capture-rate metadata within this relative distance of the timeline rate means "not scaled". */
const SAME_RATE_TOLERANCE = 0.05

function deviceInfo(metadata: ContainerMetadata): TimeBaseAssessment['device'] {
  const make =
    metadataString(metadata.movie[QT_KEYS.make]) ??
    metadataString(metadata.movie[QT_KEYS.androidManufacturer]) ??
    metadataString(metadata.userData['©mak'])
  const model =
    metadataString(metadata.movie[QT_KEYS.model]) ??
    metadataString(metadata.movie[QT_KEYS.androidModel]) ??
    metadataString(metadata.userData['©mod'])
  const software = metadataString(metadata.movie[QT_KEYS.software]) ?? metadataString(metadata.userData['©swr'])
  if (!make && !model && !software) return undefined
  return { make, model, software }
}

function playbackIntentOf(metadata: ContainerMetadata): TimeBaseAssessment['playbackIntent'] {
  const value = metadataNumber(metadata.movie[QT_KEYS.fullFrameRatePlaybackIntent])
  if (value === undefined) return undefined
  return value === 0 ? 'slow-motion' : 'full-frame-rate'
}

/** Two or more steady-rate runs whose rates differ by 2x or more (e.g. 240 -> 30 -> 240). */
function rampEvidence(segments: readonly RateSegment[]): string | undefined {
  if (segments.length < 2) return undefined
  const rates = segments.map((s) => s.fps)
  const hi = Math.max(...rates)
  const lo = Math.min(...rates)
  if (hi / lo < 2) return undefined
  const desc = segments.map((s) => `${s.fps.toFixed(1)} fps (frames ${s.startIndex}-${s.endIndex})`).join(', ')
  return `Frame interval changes by ${(hi / lo).toFixed(1)}x within the clip: ${desc}.`
}

export function assessTimeBase(input: TimeBaseInput): TimeBaseAssessment {
  const { nominalFps, metadata } = input
  const evidence: string[] = []
  const warnings: string[] = []
  const device = deviceInfo(metadata)
  const playbackIntent = playbackIntentOf(metadata)
  const captureMeta = metadataNumber(metadata.movie[QT_KEYS.androidCaptureFps])
  const ramp = rampEvidence(input.segments)
  const isApple = /apple/i.test(device?.make ?? '') || /iphone|ipad/i.test(device?.model ?? '')

  if (playbackIntent) {
    evidence.push(`${QT_KEYS.fullFrameRatePlaybackIntent} = ${playbackIntent === 'slow-motion' ? 0 : 1}.`)
  }
  if (Math.abs(input.editRate - 1) > 1e-6) {
    evidence.push(`Edit list plays the media at rate ${input.editRate}.`)
    warnings.push('The container remaps playback time; frame times use sample timestamps, which a <video> element will not match.')
  }
  if (ramp) evidence.push(ramp)

  const base = { device, playbackIntent, evidence, warnings }

  // 1. Explicit capture-rate metadata (Android MediaRecorder writes this for slow motion / time lapse).
  if (captureMeta !== undefined && captureMeta > 0 && Number.isFinite(nominalFps)) {
    evidence.push(`${QT_KEYS.androidCaptureFps} = ${captureMeta}.`)
    if (Math.abs(captureMeta / nominalFps - 1) > SAME_RATE_TOLERANCE) {
      return {
        ...base,
        kind: 'metadata-time-scaled',
        status: 'proven',
        captureFps: captureMeta,
        timeScale: nominalFps / captureMeta,
        fpsSource: 'container',
      }
    }
    return { ...base, kind: 'normal', status: 'proven', captureFps: captureMeta, timeScale: 1, fpsSource: 'container' }
  }

  // 2. Native high-frame-rate timestamps: every frame carries its real capture time.
  if (nominalFps >= HIGH_FPS_THRESHOLD && !ramp) {
    evidence.push(`Container timestamps advance at ${nominalFps.toFixed(2)} fps.`)
    if (playbackIntent === 'slow-motion') {
      evidence.push('The file asks players to show it in slow motion; its timestamps are still real time.')
    }
    return {
      ...base,
      kind: 'native-high-fps',
      status: 'proven',
      captureFps: nominalFps,
      timeScale: 1,
      fpsSource: 'timestamps',
    }
  }

  // 3. Suspicious but unproven: ramps, slow-motion intent on a normal-rate timeline, time remapping.
  const suspicious =
    ramp !== undefined ||
    (playbackIntent === 'slow-motion' && nominalFps < HIGH_FPS_THRESHOLD) ||
    Math.abs(input.editRate - 1) > 1e-6
  if (suspicious) {
    warnings.push(
      'This may be a rendered slow-motion export. Real time is unknown: confirm with the ball-toss gravity fit or ask the player for the capture rate.',
    )
    return {
      ...base,
      kind: 'possible-rendered-slomo',
      status: 'unknown',
      captureFps: nominalFps,
      timeScale: 1,
      fpsSource: 'timestamps',
    }
  }

  // 4. Ordinary rate with no proof either way. A slow-motion clip shared from iOS Photos is
  // rendered to a normal-rate timeline, and nothing verified in the container marks it.
  if (isApple) {
    warnings.push(
      'iPhone slow-motion clips shared from Photos are rendered at a normal frame rate and cannot be told apart from normal clips by the container alone.',
    )
  }
  return { ...base, kind: 'normal', status: 'unknown', captureFps: nominalFps, timeScale: 1, fpsSource: 'timestamps' }
}

/** Real seconds per media second for a clip whose timeline runs at nominalFps but was captured at captureFps. */
export function timeScaleFromCaptureFps(nominalFps: number, captureFps: number): number {
  if (!(nominalFps > 0) || !(captureFps > 0)) throw new RangeError('fps values must be positive')
  return nominalFps / captureFps
}

/** Relative mismatch allowed between captureFps and nominalFps / timeScale. */
const CONSISTENCY_TOLERANCE = 0.05

/**
 * Returns a copy of meta with a corrected time base (from the user, from physics, or
 * from metadata). captureFps and timeScale must agree with the timeline rate:
 * captureFps ~= nominalFps / timeScale (within 5%).
 */
export function applyTimeScale(meta: VideoMeta, captureFps: number, timeScale: number, source: FpsSource): VideoMeta {
  if (!Number.isFinite(captureFps) || captureFps <= 0) throw new RangeError(`captureFps must be positive, got ${captureFps}`)
  if (!Number.isFinite(timeScale) || timeScale <= 0) throw new RangeError(`timeScale must be positive, got ${timeScale}`)
  if (Number.isFinite(meta.nominalFps) && meta.nominalFps > 0) {
    const implied = meta.nominalFps / timeScale
    if (Math.abs(implied / captureFps - 1) > CONSISTENCY_TOLERANCE) {
      throw new RangeError(
        `Inconsistent time base: ${meta.nominalFps.toFixed(2)} fps timeline with timeScale ${timeScale} implies ${implied.toFixed(1)} fps capture, not ${captureFps}.`,
      )
    }
  }
  return { ...meta, captureFps, timeScale, fpsSource: source }
}

export function mediaToReal(tMedia: number, meta: Pick<VideoMeta, 'timeScale'>): number {
  return tMedia * meta.timeScale
}

export function realToMedia(tReal: number, meta: Pick<VideoMeta, 'timeScale'>): number {
  return tReal / meta.timeScale
}
