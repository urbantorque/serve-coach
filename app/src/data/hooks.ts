/**
 * Live React hooks over the repositories (dexie-react-hooks). Each returns `undefined` while the
 * first read is in flight, so screens can show a skeleton after 150 ms (DESIGN §8.17), and re-render
 * when the underlying tables change (including writes from the analysis worker).
 */
import { useLiveQuery } from 'dexie-react-hooks'
import type { SessionMode } from '../analysis/types.ts'
import { getDb } from './db.ts'
import { hasDemoData } from './demo.ts'
import { getActiveExperiment, getStats, latestDecision } from './repos/coaching.ts'
import { getProfile } from './repos/profile.ts'
import { listServesBySession } from './repos/serves.ts'
import { getSession, listByMode, listSessions } from './repos/sessions.ts'
import { getSetting } from './repos/settings.ts'
import { getTally, listTags } from './repos/tags.ts'
import type { SettingKey } from './records.ts'

export const useProfile = () => useLiveQuery(() => getProfile().then((p) => p ?? null), [])
export const useSessions = (opts: { includeDemo?: boolean } = {}) =>
  useLiveQuery(() => listSessions(opts), [opts.includeDemo])
export const useSessionsByMode = (mode: SessionMode) => useLiveQuery(() => listByMode(mode), [mode])
export const useSession = (id: string | undefined) =>
  useLiveQuery(async () => (id ? ((await getSession(id)) ?? null) : null), [id])
export const useServes = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? listServesBySession(sessionId) : []), [sessionId])
export const useServe = (serveId: string | undefined) =>
  useLiveQuery(async () => (serveId ? ((await getDb().serves.get(serveId)) ?? null) : null), [serveId])
export const useSessionStats = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? ((await getStats(sessionId)) ?? null) : null), [sessionId])
export const useTags = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? listTags(sessionId) : []), [sessionId])
export const useTally = (sessionId: string | undefined) =>
  useLiveQuery(async () => (sessionId ? ((await getTally(sessionId)) ?? null) : null), [sessionId])
export const useLatestDecision = (sessionId?: string) =>
  useLiveQuery(async () => (await latestDecision(sessionId)) ?? null, [sessionId])
export const useActiveExperiment = () => useLiveQuery(async () => (await getActiveExperiment()) ?? null, [])
export const useHasDemoData = () => useLiveQuery(() => hasDemoData(), [])
export const useSetting = <K extends SettingKey>(key: K) => useLiveQuery(() => getSetting(key), [key])
