/**
 * Everything one serve needs for playback: its stored tracks, key frames, video (as an object URL),
 * clip size and timing, and the standing reference (floor row, front toe, the player's column) that
 * places overlays and the Player zoom. Used by Serve detail, Compare and Tagging.
 */
import { useMemo } from 'react'
import type { ServeAnalysis } from '../../../data/domain.ts'
import type { KeyFrameRecord, SessionRecord } from '../../../data/records.ts'
import { standingRef, type ClipTiming, type Size, type StandingRef } from '../../components/video/index.ts'
import { useFrameImages, useKeyFrames, useTrack, useVideoRecord, useVideoUrl } from './data.ts'

export interface ServePlayback {
  track: ReturnType<typeof useTrack>
  video: ReturnType<typeof useVideoRecord>
  /** undefined while loading; null when the clip is not stored. */
  videoUrl: string | null | undefined
  thumbs: KeyFrameRecord[] | undefined
  stills: Map<number, string>
  /** Frames that have a stored full key frame, ascending (key-frame stepping). */
  stillFrames: number[]
  clip: Size
  orientation: 'portrait' | 'landscape'
  timing: ClipTiming
  standing: StandingRef | null
  bodyHeightNorm: number | null
  heightM: number
  loading: boolean
}

/** Frame rate implied by the stored events when no video record is at hand. */
function fpsFromEvents(serve: ServeAnalysis): number | null {
  for (const e of Object.values(serve.events)) {
    if (e && e.tReal > 0.2 && e.frameIndex > 0) return Math.round(e.frameIndex / e.tReal)
  }
  return null
}

export function useServePlayback(serve: ServeAnalysis | null | undefined, session: SessionRecord | null | undefined): ServePlayback {
  const track = useTrack(serve?.id)
  const video = useVideoRecord(serve?.videoId)
  const videoUrl = useVideoUrl(video)
  const thumbs = useKeyFrames(serve?.id, 'thumb')
  const fulls = useKeyFrames(serve?.id, 'evidence-full')
  const stills = useFrameImages(fulls)

  const orientationHint = session?.orientation ?? serve?.rectification.orientation ?? 'portrait'
  const clip: Size = useMemo(() => {
    if (video?.meta.width && video.meta.height) return { width: video.meta.width, height: video.meta.height }
    const full = fulls?.[0]
    if (full) return { width: full.width, height: full.height }
    const m = session?.analysis?.capture.meta
    if (m?.width && m.height) return { width: m.width, height: m.height }
    return orientationHint === 'portrait' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
  }, [video, fulls, session, orientationHint])

  const timing: ClipTiming = useMemo(
    () => ({
      nominalFps: video?.meta.nominalFps ?? session?.analysis?.capture.meta.nominalFps ?? (serve ? fpsFromEvents(serve) : null) ?? 60,
      timeScale: video?.meta.timeScale ?? session?.analysis?.capture.meta.timeScale ?? 1,
    }),
    [video, session, serve],
  )

  const standing = useMemo(() => {
    if (!serve || !track?.pose) return null
    const start = serve.window.startFrame
    const end = (serve.events.motionStart ?? serve.events.tossRelease)?.frameIndex ?? start + 30
    return standingRef(track.pose, serve.handedness, start, Math.max(start + 1, end - 1))
  }, [serve, track])

  // Stepping follows the stored frames even when an image cannot be shown.
  const stillFrames = useMemo(() => [...new Set((fulls ?? []).map((k) => k.frameIndex))].sort((a, b) => a - b), [fulls])

  return {
    track,
    video,
    videoUrl,
    thumbs,
    stills,
    stillFrames,
    clip,
    orientation: clip.height > clip.width ? 'portrait' : 'landscape',
    timing,
    standing,
    bodyHeightNorm: track?.pose?.bodyHeightHU ?? null,
    heightM: video?.capture.playerHeightM ?? 1.75,
    loading: track === undefined || video === undefined || videoUrl === undefined || thumbs === undefined || fulls === undefined,
  }
}

/** The still for key-frame stepping: the stored frame at or before `frame` (else the first). */
export function stillFor(stillFrames: readonly number[], stills: Map<number, string>, frame: number): string | null {
  let pick: number | null = null
  for (const f of stillFrames) if (f <= frame) pick = f
  pick ??= stillFrames[0] ?? null
  return pick === null ? null : (stills.get(pick) ?? null)
}

/** The next or previous stored key frame from `frame` (key-frame stepping). */
export function stepStill(stillFrames: readonly number[], frame: number, delta: -1 | 1): number | null {
  if (!stillFrames.length) return null
  if (delta > 0) return stillFrames.find((f) => f > frame) ?? stillFrames[stillFrames.length - 1]
  for (let i = stillFrames.length - 1; i >= 0; i--) if (stillFrames[i] < frame) return stillFrames[i]
  return stillFrames[0]
}
