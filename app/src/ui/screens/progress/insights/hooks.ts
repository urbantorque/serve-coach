/**
 * Live reads for the insight screens (Today, Sessions, Session report, Progress, Compare, Metric
 * info). Built on the data layer's repository functions (never `getDb()`), via dexie-react-hooks so
 * they re-render when the analysis worker or tagging writes. Each returns `undefined` while loading.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { getExperiment, getStats, listExperiments, listMatchLogs, listPracticeByExperiment } from '../../../../data/repos/coaching.ts'
import { getKeyFrame, getKeyFrameFor, getSessionThumb } from '../../../../data/repos/keyFrames.ts'
import { listServesBySession } from '../../../../data/repos/serves.ts'
import { getSession, listSessions } from '../../../../data/repos/sessions.ts'
import { getTally, listTags } from '../../../../data/repos/tags.ts'
import type { KeyFrameEvent } from '../../../../analysis/types.ts'
import type { SessionData } from './compare.ts'
import type { SessionBundle } from './history.ts'
import { serveRows } from './serves.ts'

/** Every analysed session with its statistics, newest first. */
export function useSessionBundles(opts: { includeDemo?: boolean } = {}): SessionBundle[] | undefined {
  return useLiveQuery(async () => {
    const sessions = await listSessions({ includeDemo: opts.includeDemo })
    const stats = await Promise.all(sessions.map((s) => getStats(s.id)))
    return sessions.map((session, i) => ({ session, stats: stats[i] ?? null }))
  }, [opts.includeDemo])
}

async function loadSessionData(id: string): Promise<SessionData | null> {
  const session = await getSession(id)
  if (!session) return null
  const [stats, serves, tags] = await Promise.all([getStats(id), listServesBySession(id), listTags(id)])
  return { session, stats: stats ?? null, rows: serveRows(serves, tags) }
}

/** Sessions with statistics and per-serve rows (serves + tags), in the order given; missing ids dropped. */
export function useSessionData(ids: readonly string[] | undefined): SessionData[] | undefined {
  const key = ids?.join(',') ?? ''
  return useLiveQuery(async () => {
    if (!ids) return undefined
    const rows = await Promise.all(ids.map(loadSessionData))
    return rows.filter((r): r is SessionData => r !== null)
  }, [key])
}

/** One session's report inputs: record, statistics, serve rows and tally. `null` when not found. */
export function useReportData(sessionId: string | undefined) {
  return useLiveQuery(async () => {
    if (!sessionId) return null
    const data = await loadSessionData(sessionId)
    if (!data) return null
    const tally = (await getTally(sessionId)) ?? null
    return { ...data, tally }
  }, [sessionId])
}

export const useExperiments = () => useLiveQuery(() => listExperiments(), [])
export const useExperiment = (id: string | undefined) =>
  useLiveQuery(async () => (id ? ((await getExperiment(id)) ?? null) : null), [id])
export const usePracticeLogs = (experimentId: string | undefined) =>
  useLiveQuery(async () => (experimentId ? listPracticeByExperiment(experimentId) : []), [experimentId])
export const useMatchLogs = () => useLiveQuery(() => listMatchLogs(), [])

/** An object URL for a stored key-frame image blob, revoked on change and unmount. */
function useBlobUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return url
}

/** Key-frame image by id (e.g. a coaching decision's evidence frame). */
export function useKeyFrameUrl(id: string | undefined): { url: string | null; loaded: boolean } {
  // Evidence crops exist for apex, trophy, lowest hip and contact only (analysis/pipeline/keyFrames.ts);
  // for another event the same serve's thumbnail stands in.
  const rec = useLiveQuery(
    async () => (id ? ((await getKeyFrame(id)) ?? (id.endsWith('-evidence') ? await getKeyFrame(id.replace(/-evidence$/, '-thumb')) : undefined) ?? null) : null),
    [id],
  )
  const url = useBlobUrl(rec?.blob)
  return { url, loaded: rec !== undefined }
}

/**
 * A serve's key frame for one event: the evidence crop around the player when one was kept (apex,
 * trophy, lowest hip, contact), else the whole-frame thumbnail. At 7 to 9 m the player is small in
 * the whole frame, so the crop reads far better in a tile or row.
 */
export function useServeFrameUrl(serveId: string | undefined, event: KeyFrameEvent): { url: string | null; loaded: boolean } {
  const rec = useLiveQuery(
    async () => (serveId ? ((await getKeyFrameFor(serveId, event, 'evidence')) ?? (await getKeyFrameFor(serveId, event)) ?? null) : null),
    [serveId, event],
  )
  const url = useBlobUrl(rec?.blob)
  return { url, loaded: rec !== undefined }
}

/** The session list thumbnail written by the analysis pipeline, if any. */
export function useSessionThumbUrl(sessionId: string): string | null {
  const rec = useLiveQuery(async () => (await getSessionThumb(sessionId)) ?? null, [sessionId])
  return useBlobUrl(rec?.blob)
}
