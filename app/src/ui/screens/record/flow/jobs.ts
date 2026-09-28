/**
 * Running analyses, kept outside any screen so the player can leave Processing while the job runs
 * (DESIGN §10.4: the tab bar stays; the Record tab shows a status row). One AbortController per job
 * (ARCHITECTURE §5.9). Progress also goes to `useUiStore.activeJob` for the Record tab and Today.
 */
import { create } from 'zustand'
import type { AnalysisErrorCode, AnalysisProgress } from '../../../../data/index.ts'
import { markStatus, useUiStore } from '../../../../data/index.ts'
import { loadRunAnalysis, normaliseEvent, type RunAnalysis, type RunAnalysisOptions } from './analysisAdapter.ts'

export type JobPhase = 'running' | 'done' | 'failed' | 'cancelled' | 'unavailable'
export type JobErrorCode = AnalysisErrorCode | 'no-pipeline'

/** What the clip card on Processing shows (DESIGN §10.4). */
export interface ClipInfo {
  /** "Sat 26 Sep, 0:42" */
  title: string
  /** "Side view, deuce, first serves" */
  line: string
  /** "1080p, 60 fps" */
  tech: string
  orientation: 'portrait' | 'landscape'
}

export interface JobState {
  sessionId: string
  phase: JobPhase
  progress: AnalysisProgress | null
  startedAtMs: number
  /** Set while the page was hidden (iOS may pause the work; ARCHITECTURE §5.9). */
  paused: boolean
  /** The page came back after being hidden; cleared on the next progress event. */
  resumed: boolean
  firstServe: { serveId: string; index: number } | null
  servesReady: number
  /** Player-facing notes from the pipeline (for example why no copy of the video was kept). */
  notes: string[]
  error?: { code: JobErrorCode; message: string; recoverable: boolean }
  clip: ClipInfo
  /** Open tagging instead of the report when done (Tally "Tag now"). */
  thenTag: boolean
}

interface JobsStore {
  jobs: Record<string, JobState>
  patch: (sessionId: string, patch: Partial<JobState> | ((j: JobState) => Partial<JobState>)) => void
  put: (job: JobState) => void
}

/**
 * Jobs outlive this module: a running analysis must not vanish if the module is evaluated again (a
 * dev hot reload of the data layer, or a second import path), so the store and the controllers are
 * kept on globalThis under one key.
 */
const REGISTRY = globalThis as typeof globalThis & {
  __serveCoachJobs?: { store: ReturnType<typeof makeStore>; handles: Map<string, Handle>; listening: boolean }
}

const makeStore = () =>
  create<JobsStore>()((set) => ({
    jobs: {},
    put: (job) => set((s) => ({ jobs: { ...s.jobs, [job.sessionId]: job } })),
    patch: (sessionId, patch) =>
      set((s) => {
        const job = s.jobs[sessionId]
        if (!job) return s
        const next = typeof patch === 'function' ? patch(job) : patch
        return { jobs: { ...s.jobs, [sessionId]: { ...job, ...next } } }
      }),
  }))

const registry = (REGISTRY.__serveCoachJobs ??= { store: makeStore(), handles: new Map(), listening: false })

export const useJobs = registry.store

export const useJob = (sessionId: string | undefined) => useJobs((s) => (sessionId ? s.jobs[sessionId] : undefined))

/** Plain copy per failure (ARCHITECTURE §5.12, PRODUCT §6.4). What happened, then what to do. */
export const JOB_ERROR_COPY: Record<JobErrorCode, string> = {
  'unsupported-codec': "This video format can't be read on this phone. Try Settings › Camera › Formats › Most Compatible, then film again.",
  'probe-failed': "We couldn't read this video. Choose another video, or export this one again from Photos.",
  'too-long': 'This video is long for this phone. Trim it to under 3 minutes for a quicker result.',
  'storage-full': 'Your phone is out of space. We kept the finished serves.',
  'no-webgl': "This phone's browser can't run the analysis. You can still explore the sample session.",
  'pose-init-failed': "We couldn't start body tracking on this phone. Close other apps and try again.",
  'decoder-reclaimed': 'The phone paused video decoding while Serve Coach was in the background. Try again to carry on.',
  'no-serves': "We couldn't find a serve in this video. Try a clip where you're side-on and fully in the picture.",
  cancelled: 'Analysis cancelled.',
  internal: 'The analysis stopped before it finished. Try again.',
  'no-pipeline': "The analysis engine isn't part of this build yet. Your video is saved with its details, ready for when it is.",
}

const KNOWN_CODES = new Set<string>(Object.keys(JOB_ERROR_COPY))

export function errorCodeOf(error: unknown): JobErrorCode {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && KNOWN_CODES.has(code) ? (code as JobErrorCode) : 'internal'
}

const isAbort = (error: unknown) => (error as { name?: string } | null)?.name === 'AbortError'

interface Handle {
  abort: AbortController
  file: Blob
  options: StartOptions
}

const handles = registry.handles

export interface StartOptions {
  sessionId: string
  file: Blob
  run: Omit<RunAnalysisOptions, 'sessionId' | 'signal' | 'onProgress'>
  clip: ClipInfo
  thenTag?: boolean
  /** Tests and the dev simulator pass a runner; otherwise the pipeline module is looked up. */
  runner?: RunAnalysis
}

/** The file of a job still held in memory (for the clip thumbnail and Try again). */
export function jobFile(sessionId: string): Blob | undefined {
  return handles.get(sessionId)?.file
}

export function hasHandle(sessionId: string): boolean {
  return handles.has(sessionId)
}

function onVisibility() {
  const hidden = document.visibilityState === 'hidden'
  const { jobs, patch } = useJobs.getState()
  for (const job of Object.values(jobs)) {
    if (job.phase !== 'running') continue
    if (hidden) patch(job.sessionId, { paused: true })
    else if (job.paused) patch(job.sessionId, { paused: false, resumed: true })
  }
}

function listen() {
  if (registry.listening || typeof document === 'undefined') return
  registry.listening = true
  document.addEventListener('visibilitychange', onVisibility)
}

/** Starts (or restarts) the analysis of one session. Resolves when the job settles; never throws. */
export async function startAnalysis(options: StartOptions): Promise<JobPhase> {
  const { sessionId } = options
  handles.get(sessionId)?.abort.abort()
  const abort = new AbortController()
  handles.set(sessionId, { abort, file: options.file, options })
  listen()

  const { put, patch } = useJobs.getState()
  const setActive = useUiStore.getState().setActiveJob
  put({
    sessionId,
    phase: 'running',
    progress: null,
    startedAtMs: performance.now(),
    paused: false,
    resumed: false,
    firstServe: null,
    servesReady: 0,
    notes: [],
    clip: options.clip,
    thenTag: options.thenTag ?? false,
  })

  const run = options.runner ?? (await loadRunAnalysis())
  if (!run) {
    patch(sessionId, { phase: 'unavailable', error: { code: 'no-pipeline', message: JOB_ERROR_COPY['no-pipeline'], recoverable: true } })
    return 'unavailable'
  }

  await markStatus(sessionId, 'analysing').catch(() => undefined)
  let lastOverall = 0
  try {
    await run(options.file, {
      ...options.run,
      sessionId,
      signal: abort.signal,
      onProgress: (raw) => {
        if (abort.signal.aborted) return
        const event = normaliseEvent(raw)
        if (!event) return
        if (event.kind === 'warning') {
          patch(sessionId, (j) => (j.notes.includes(event.message) ? {} : { notes: [...j.notes, event.message] }))
          return
        }
        if (event.kind === 'serve-ready') {
          patch(sessionId, (j) => ({
            firstServe: j.firstServe ?? { serveId: event.serveId, index: event.index },
            servesReady: j.servesReady + 1,
          }))
          return
        }
        // Monotonic, whatever the engine sends (DESIGN §8.18).
        const progress = { ...event.progress, overall: Math.max(lastOverall, event.progress.overall) }
        lastOverall = progress.overall
        patch(sessionId, { progress, resumed: false })
        setActive({ ...progress, sessionId })
      },
    })
    // D6 loop: decide the focus with the full history, tags and experiment (a re-test joins its
    // experiment here and gets its "Did it work?" verdict). Not awaited: the report and Today read the
    // stored decision live, so they update the moment it lands.
    void import('../../../../integration/coachingSync.ts').then((m) => m.syncCoaching({ sessionId })).catch(() => undefined)
    patch(sessionId, (j) => ({
      phase: 'done',
      paused: false,
      progress: j.progress ? { ...j.progress, overall: 1, stage: 'done' } : j.progress,
    }))
    return 'done'
  } catch (error) {
    if (abort.signal.aborted || isAbort(error)) {
      patch(sessionId, { phase: 'cancelled', paused: false })
      await markStatus(sessionId, 'cancelled').catch(() => undefined)
      return 'cancelled'
    }
    const code = errorCodeOf(error)
    const message = JOB_ERROR_COPY[code]
    // The pipeline says whether trying again can help (AnalysisError.recoverable); assume it can.
    const recoverable = (error as { recoverable?: unknown } | null)?.recoverable !== false
    patch(sessionId, { phase: 'failed', paused: false, error: { code, message, recoverable } })
    await markStatus(sessionId, 'failed', { code: code === 'no-pipeline' ? 'internal' : code, message }).catch(() => undefined)
    return 'failed'
  } finally {
    if (useUiStore.getState().activeJob?.sessionId === sessionId) setActive(null)
  }
}

/** Cancels a running job (completed serves are kept by the pipeline, ARCHITECTURE §5.9). */
export function cancelAnalysis(sessionId: string): void {
  handles.get(sessionId)?.abort.abort()
}

/** Runs the same file and options again (Try again, Resume). False when the file is no longer in memory. */
export function retryAnalysis(sessionId: string, runner?: RunAnalysis): boolean {
  const handle = handles.get(sessionId)
  if (!handle) return false
  void startAnalysis({ ...handle.options, runner: runner ?? handle.options.runner })
  return true
}

/**
 * Forgets every job ("Delete everything", finding 18): each run is stopped, its in-memory file and
 * options are dropped (so Resume or Try again can never write a deleted session back), the job list is
 * emptied and the Record tab's status row cleared. A run that settles afterwards finds no job to update.
 */
export function forgetAllJobs(): void {
  for (const h of handles.values()) h.abort.abort()
  handles.clear()
  useJobs.setState({ jobs: {} })
  useUiStore.getState().setActiveJob(null)
}

/** Test helper: forget every job. */
export function resetJobsForTests(): void {
  forgetAllJobs()
}
