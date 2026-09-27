/**
 * Import decisions that do not need a screen (CAPTURE §11, ARCHITECTURE §5.1): the probe summary
 * line, the PWA size and length guards, when to ask the slow-motion question and what the answers
 * mean for the capture context. Pure; unit-tested.
 */
import type { CameraSide, CameraView, CaptureContext, VideoMeta } from '../../../../analysis/types.ts'

/** The slice of the probe's TimeBaseAssessment these rules read. */
export interface TimeBaseFacts {
  kind: 'normal' | 'native-high-fps' | 'metadata-time-scaled' | 'possible-rendered-slomo'
  status: 'proven' | 'unknown'
  captureFps: number
  device?: { make?: string; model?: string }
}

/** "0:42", "4:12", "12:03" (minutes:seconds). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "1080p" from a frame size (short side); "4K" from 2160 up. */
export function resolutionLabel(width: number, height: number): string {
  const short = Math.min(width, height)
  if (short >= 2100) return '4K'
  return `${short}p`
}

/** "60 fps", "239.8 fps" rounds to "240 fps". */
export function fpsLabel(fps: number): string {
  return `${Math.round(fps)} fps`
}

export interface ClipSummary {
  duration: string
  resolution: string
  fps: string
  orientation: 'upright' | 'sideways'
  device?: string
  /** "0:42 · 1080p · 60 fps · upright" (CAPTURE §11.2 summary card). */
  line: string
}

export function summariseClip(meta: Pick<VideoMeta, 'durationMediaS' | 'width' | 'height' | 'captureFps'>, device?: { make?: string; model?: string }): ClipSummary {
  const duration = clock(meta.durationMediaS)
  const resolution = resolutionLabel(meta.width, meta.height)
  const fps = fpsLabel(meta.captureFps)
  const orientation = meta.height >= meta.width ? 'upright' : 'sideways'
  const deviceName = device?.model ?? (device?.make && /apple/i.test(device.make) ? 'iPhone' : device?.make)
  const parts = [duration, resolution, fps, deviceName, orientation].filter(Boolean)
  return { duration, resolution, fps, orientation, device: deviceName, line: parts.join(' · ') }
}

export const IMPORT_LIMITS = {
  maxBytes: 2 * 1024 ** 3,
  maxSecondsNormal: 10 * 60,
  maxSecondsHighFps: 60,
} as const

/**
 * The ARCHITECTURE §5.1 PWA guards. Returns the plain message to show, or null when the clip is
 * inside them. High frame rate means a capture rate above 60 fps.
 */
export function importGuard(meta: Pick<VideoMeta, 'durationMediaS' | 'captureFps' | 'timeScale'>, sizeBytes: number): string | null {
  if (sizeBytes > IMPORT_LIMITS.maxBytes) return 'This video is over 2 GB, which is more than this phone can analyse. Trim it in Photos, then import the shorter copy.'
  const realSeconds = meta.durationMediaS * (meta.timeScale > 0 ? meta.timeScale : 1)
  if (meta.captureFps > 60 && realSeconds > IMPORT_LIMITS.maxSecondsHighFps) {
    return 'Slow-motion videos can be up to 1 minute long here. Trim it in Photos to the serves you want, then import it again.'
  }
  if (meta.durationMediaS > IMPORT_LIMITS.maxSecondsNormal) {
    return 'This video is longer than 10 minutes. Trim it to one block of serves, then import it again.'
  }
  return null
}

const isApple = (tb: TimeBaseFacts) => /apple/i.test(tb.device?.make ?? '') || /iphone|ipad/i.test(tb.device?.model ?? '')

/**
 * CAPTURE §11.3: ask "Was this filmed in slow motion?" when the time base is unknown for an
 * Apple-device clip, or when the probe flags a possible rendered slow-motion export.
 */
export function needsSlowMotionQuestion(tb: TimeBaseFacts | null | undefined): boolean {
  if (!tb) return false
  if (tb.kind === 'possible-rendered-slomo') return true
  return tb.status === 'unknown' && tb.kind !== 'native-high-fps' && isApple(tb)
}

export type SlowMotionAnswer = 'normal' | 'slow' | 'not-sure'
export type SlowMotionSpeed = 120 | 240 | 'not-sure'

/** Maps the two questions onto CaptureContext.slowMotionAnswer. */
export function slowMotionContext(answer: SlowMotionAnswer | null, speed: SlowMotionSpeed | null): CaptureContext['slowMotionAnswer'] | undefined {
  if (answer === null) return undefined
  if (answer === 'normal') return 'normal'
  if (answer === 'not-sure') return 'not-sure'
  if (speed === 120) return 'slomo-120'
  if (speed === 240) return 'slomo-240'
  return 'slomo-unknown'
}

/**
 * The capture rate the player confirmed, passed to the pipeline as `fpsOverride` (CAPTURE §11.3:
 * applied as a user time scale and checked against gravity). Undefined leaves the probe's rate.
 */
export function fpsOverrideFor(answer: SlowMotionAnswer | null, speed: SlowMotionSpeed | null): number | undefined {
  if (answer !== 'slow') return undefined
  return speed === 120 || speed === 240 ? speed : undefined
}

export type CameraAnswer = 'side-chest' | 'side-back' | 'rear' | 'other'

/** "Where was the camera?" (CAPTURE §11.2) as the engine's view and camera side. */
export function viewFor(answer: CameraAnswer): { view: CameraView; cameraSide?: CameraSide; mode: 'technique' | 'outcomes' } {
  switch (answer) {
    case 'side-chest':
      return { view: 'side', cameraSide: 'chest', mode: 'technique' }
    case 'side-back':
      return { view: 'side', cameraSide: 'back', mode: 'technique' }
    case 'rear':
      return { view: 'rear', mode: 'outcomes' }
    case 'other':
      return { view: 'unknown', mode: 'technique' }
  }
}

/**
 * D4: a side-view speed range needs 120 fps or more and one target. Returns the footnote to show
 * under "Aiming at", or null when speed is not in play (experimental metrics off, or too slow).
 */
export function speedTargetNote(opts: { experimental: boolean; captureFps: number; view: CameraView; target: string | null }): string | null {
  if (!opts.experimental || opts.view !== 'side') return null
  if (opts.captureFps < 120) return 'Speed needs 120 fps or more, so this video will show no speed range.'
  if (opts.target === null || opts.target === 'mixed') return 'For a speed range, pick one target: T, Body or Wide.'
  return null
}

export type MountAnswer = 'level-mount' | 'roughly-level' | 'tilted-or-unsure'

/**
 * "How was the phone mounted?" (METRICS §1.1.3a). Imports carry no tilt reading, so the answer is
 * the only evidence of level: a level mount stands for pitch 0 ± 2°, roughly level 0 ± 4°, and the
 * engine widens every height range by that much (and checks the standing player for roll). "Tilted
 * or not sure" keeps heights experimental. Asked for side views only: the rear set-up is raised and
 * pointed down on purpose, so it is never level.
 */
export const MOUNT_OPTIONS: { value: MountAnswer; title: string; body: string }[] = [
  { value: 'level-mount', title: 'Level mount', body: 'A fence clip or tripod you checked with a level, or a level app.' },
  { value: 'roughly-level', title: 'Roughly level', body: 'Propped up and pointing straight, not tipped up or down.' },
  { value: 'tilted-or-unsure', title: 'Tilted, or not sure', body: "Leaning on a bag, tipped up or down, or you can't say." },
]

/** The capture context's `mount` for an answer (only side views are asked). */
export function mountContext(view: CameraView, answer: MountAnswer): CaptureContext['mount'] | undefined {
  return view === 'side' ? answer : undefined
}

/** The footnote on what the answer means for heights (never promises more than METRICS allows). */
export function heightsNote(view: CameraView, answer: MountAnswer): string {
  if (view !== 'side') return "There's no tilt reading for imports, so heights from this view are experimental."
  if (answer === 'tilted-or-unsure') return "There's no tilt reading for imports, so heights are experimental. Spreads and timing are not affected."
  if (answer === 'level-mount') {
    return 'We take the phone as level, allowing for a small tilt, so heights can stay estimates, with a wider range. If you look tilted in the picture while standing, heights become experimental.'
  }
  return 'We take the phone as roughly level, allowing for a larger tilt, so heights get a wider range. The highest ones, like the toss peak, may stay experimental.'
}
