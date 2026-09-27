/**
 * Read hooks for the playback screens (live over the data-layer repositories; UI never touches the
 * database directly). Each returns `undefined` while the first read is in flight.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import {
  getActiveExperiment,
  getStats,
  getTrack,
  getVideo,
  getVideoBlob,
  latestDecision,
  listKeyFramesForServe,
  listServesBySession,
  listSessions,
  listTags,
} from '../../../data/index.ts'
import type { KeyFrameRecord, TrackRecord, VideoRecord } from '../../../data/records.ts'
import { useObjectUrl, useObjectUrls } from '../../components/video/objectUrls.ts'

/**
 * A live query whose result is tagged with its key: while the key changes (another serve), the previous
 * key's result reads as undefined (loading) rather than as stale data.
 */
function useKeyedLiveQuery<T>(key: string, query: () => Promise<T>): T | undefined {
  const r = useLiveQuery(async () => ({ key, value: await query() }), [key])
  return r && r.key === key ? r.value : undefined
}

export const useTrack = (serveId: string | undefined) =>
  useKeyedLiveQuery(serveId ?? '', async () => (serveId ? ((await getTrack(serveId)) ?? null) : null))

/** Tracks for several serves (Tagging crop, apex scatter), keyed by serve id. */
export const useTracks = (serveIds: readonly string[] | undefined) => {
  const key = serveIds?.join('|') ?? ''
  return useKeyedLiveQuery(key, async () => {
    const out: Record<string, TrackRecord> = {}
    for (const id of serveIds ?? []) {
      const t = await getTrack(id)
      if (t) out[id] = t
    }
    return out
  })
}

export const useKeyFrames = (serveId: string | undefined, role: KeyFrameRecord['role'] = 'thumb') =>
  useKeyedLiveQuery(`${serveId ?? ''}|${role}`, async () => (serveId ? listKeyFramesForServe(serveId, role) : []))

export const useVideoRecord = (videoId: string | undefined) =>
  useKeyedLiveQuery(videoId ?? '', async () => (videoId ? ((await getVideo(videoId)) ?? null) : null))

export const useSessionTags = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? listTags(sessionId) : []), [sessionId])

export const useStats = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? ((await getStats(sessionId)) ?? null) : null), [sessionId])

export const useDecision = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? ((await latestDecision(sessionId)) ?? null) : null), [sessionId])

export const useExperiment = () => useLiveQuery(async () => (await getActiveExperiment()) ?? null, [])

/** Every session with its serves and stats (compare targets). Small data: sessions are few. */
export const useCompareUniverse = (enabled: boolean) =>
  useLiveQuery(async () => {
    if (!enabled) return null
    const sessions = await listSessions()
    return Promise.all(
      sessions.map(async (session) => {
        const serves = await listServesBySession(session.id)
        const usable: string[] = []
        for (const s of serves) if (await getTrack(s.id)) usable.push(s.id)
        return { session, serves, stats: (await getStats(session.id)) ?? null, tags: await listTags(session.id), usable }
      }),
    )
  }, [enabled])

/**
 * An object URL for a stored video blob (reference-counted, revoked after the last user unmounts).
 * Null when the video is not stored (deleted, not kept, native path unavailable).
 */
export function useVideoUrl(video: VideoRecord | null | undefined): string | null | undefined {
  const blob = useKeyedLiveQuery(`${video?.id ?? ''}|${video?.storage ?? ''}`, async () => {
    if (!video) return null
    if (video.storage !== 'idb') return null
    return (await getVideoBlob(video.id)) ?? null
  })
  const url = useObjectUrl(blob)
  return video === null ? null : url
}

/** Object URLs for key-frame images by frame index (key-frame stepping). */
export function useFrameImages(frames: KeyFrameRecord[] | undefined): Map<number, string> {
  const blobs = useMemo(() => (frames ?? []).map((k) => k.blob), [frames])
  const urls = useObjectUrls(blobs)
  return useMemo(() => {
    const m = new Map<number, string>()
    ;(frames ?? []).forEach((k, i) => {
      const u = urls[i]
      if (u) m.set(k.frameIndex, u)
    })
    return m
  }, [frames, urls])
}
