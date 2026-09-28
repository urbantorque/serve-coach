/**
 * Dev-only end-to-end page for the production pipeline (npm run dev):
 *
 *   /src/analysis/pipeline/e2e/pipeline-e2e.html?clip=<url>[&view=side][&heightM=1.8][&hand=right]
 *       [&target=T|body|wide][&hitSound=1][&experimental=1][&cancelAt=0.5][&baseline=<label>]
 *
 * Runs runAnalysis on the clip exactly as the app would (real workers, real Dexie), then reads the
 * stored rows back through the data layer and exposes everything as window.__pipelineE2E for
 * run-e2e.mjs. `cancelAt` aborts once overall progress passes that fraction (cancellation test).
 */
// Archivo, self-hosted, as in main.tsx (DESIGN §4.1).
import '@fontsource-variable/archivo/wdth.css'
import './e2e.css'
import { getDb } from '../../../data/db.ts'
import { getJob } from '../../../data/repos/jobs.ts'
import { getSessionThumb, listKeyFramesForServe } from '../../../data/repos/keyFrames.ts'
import { getStats } from '../../../data/repos/coaching.ts'
import { getTrack, listServesBySession } from '../../../data/repos/serves.ts'
import { getSession } from '../../../data/repos/sessions.ts'
import { listVideosBySession } from '../../../data/repos/videos.ts'
import { ulid } from '../../../platform/ids.ts'
import type { CameraView, CaptureContext, Handedness, MetricValue, TargetZone } from '../../types.ts'
import type { EngineInput, EngineOutput } from '../../engine.ts'
import { AnalysisError } from '../errors.ts'
import { defaultDeps, runAnalysis, type PipelineDeps } from '../orchestrator.ts'
import type { BallFrameImage } from '../../ball/workerProtocol.ts'
import type { BallWindowResult, WindowBallConfig } from '../../ball/workerCore.ts'
import type { PoseEstimator } from '../passes.ts'
import type { PipelineEvent, PipelineProgress, RunAnalysisResult } from '../types.ts'
import { analyseSessionDouble, findServeWindowsDouble } from './testDoubleEngine.ts'
import { renderView, type ServeSummary, type ViewState } from './view.ts'

/** Smoke-run stage times (validation/results/smoke/SUMMARY.md, same machine class), for comparison. */
const SMOKE_BASELINES: Record<string, { label: string; poseS: number; ballS: number; totalS: number; frames: number }> = {
  'baseline-s1': { label: 'baseline-s1, 290 frames: pose 13.1 s, ball 18.7 s', poseS: 13.1, ballS: 18.7, totalS: 34.0, frames: 290 },
}

export interface E2EReport {
  state: 'running' | 'done' | 'failed' | 'cancelled'
  clip: string
  sessionId: string
  engine: 'engine.ts' | 'test-double'
  result?: Omit<RunAnalysisResult, 'stats'> & { statsMetricIds: string[] }
  error?: { code: string; message: string; detail?: string }
  events: { t: number; stage: string; step: string; overall: number; label: string; etaS?: number }[]
  warnings: string[]
  verify?: {
    sessionStatus?: string
    hasAnalysis: boolean
    serves: number
    servesWithMetrics: number
    metricStatuses: Record<string, number>
    metricsWithoutStatus: number
    tracks: number
    tracksWithBall: number
    thumbs: number
    evidence: number
    sessionThumb: boolean
    keyFrameBytes: number
    statsStored: boolean
    jobState?: string
    video?: { storage: string; audio: string; retention: string }
    servesInDbAfterCancel?: number
  }
  consoleErrors: string[]
}

/** Engine input/output kept for accuracy checks against the clip's truth (perf-accuracy.mts). */
export interface PipelineDump {
  meta: EngineInput['meta']
  /** [frameIndex, tReal, landmarks as [x, y, z, visibility] rows or null]. */
  poses: [number, number, number[][] | null][]
  windows: { startReal: number; endReal: number }[]
  serves: EngineOutput['serves']
  stats: EngineOutput['stats']
  quality: string
  ballTracks: number
  poseStats?: unknown[]
  /** Pose-source stats when Pass B starts (Pass A alone; the source's stats are cumulative). */
  poseStatsPassA?: unknown[]
  /**
   * The rest of the engine input, exactly as the pipeline passed it (ball observations, tracks and
   * per-window toss entries, onsets, capture context, profile, target tags), so the engine can be
   * replayed offline on the production pipeline's input (tools/validate/e2e-replay.ts).
   */
  input?: Omit<EngineInput, 'poses' | 'meta'>
  /** Per ball window: the search configuration and the ball layer's result (with every candidate). */
  ballWindows?: { windowId: number; config: WindowBallConfig; result: BallWindowResult }[]
  /** Pass A's cleaned sparse poses, as findServeWindows received them (same packing as `poses`). */
  sparsePoses?: [number, number, number[][] | null][]
}

declare global {
  interface Window {
    __pipelineE2E?: E2EReport
    __pipelineDump?: PipelineDump
  }
}

const r5 = (v: number | undefined) => (v === undefined ? 0 : Math.round(v * 1e5) / 1e5)

const packPoses = (poses: readonly EngineInput['poses'][number][]): PipelineDump['poses'] =>
  poses.map((p) => [p.frameIndex, p.tReal, p.landmarks ? p.landmarks.map((l) => [r5(l.x), r5(l.y), r5(l.z), r5(l.visibility)]) : null])

function packDump(input: EngineInput, out: EngineOutput): PipelineDump {
  return {
    meta: input.meta,
    poses: packPoses(input.poses),
    windows: (input.ball.toss ?? []).map((t) => t as { startReal: number; endReal: number }).map((t) => ({ startReal: t.startReal, endReal: t.endReal })),
    serves: out.serves.map((s) => ({ ...s, keyFrames: {} })),
    stats: out.stats,
    quality: out.quality.overall,
    ballTracks: input.ball.tracks.length,
    input: {
      view: input.view,
      capture: input.capture,
      profile: input.profile,
      ball: input.ball,
      onsets: input.onsets,
      targetTags: input.targetTags,
      ids: input.ids,
      heightEntered: input.heightEntered,
      // The light measured on the serve scan (quality/light.ts), so a replay sees the same class.
      ...(input.light ? { light: input.light } : {}),
    },
  }
}

const params = new URLSearchParams(location.search)
const root = document.getElementById('app') ?? document.body

// Night/Day from the system setting, as the app's ThemeProvider does for 'system'.
const dark = matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => (document.documentElement.dataset.theme = dark.matches ? 'dark' : 'light')
applyTheme()
dark.addEventListener('change', applyTheme)

const consoleErrors: string[] = []
window.addEventListener('error', (e) => consoleErrors.push(String(e.message)))
window.addEventListener('unhandledrejection', (e) => consoleErrors.push(String((e as PromiseRejectionEvent).reason)))

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

async function verify(sessionId: string, serveIds: string[]): Promise<NonNullable<E2EReport['verify']>> {
  const session = await getSession(sessionId)
  const serves = await listServesBySession(sessionId)
  const statuses: Record<string, number> = {}
  let withoutStatus = 0
  let servesWithMetrics = 0
  let tracks = 0
  let tracksWithBall = 0
  let thumbs = 0
  let evidence = 0
  let bytes = 0
  for (const s of serves) {
    const values = Object.values(s.metrics ?? {}) as MetricValue[]
    if (values.length) servesWithMetrics++
    for (const m of values) {
      if (!m.status) withoutStatus++
      else statuses[m.status] = (statuses[m.status] ?? 0) + 1
    }
    const track = await getTrack(s.id)
    if (track) tracks++
    if (track?.ball) tracksWithBall++
    const t = await listKeyFramesForServe(s.id, 'thumb')
    const e = await listKeyFramesForServe(s.id, 'evidence')
    thumbs += t.length
    evidence += e.length
    for (const k of [...t, ...e]) bytes += k.blob.size
  }
  const thumb = await getSessionThumb(sessionId)
  const stats = await getStats(sessionId)
  const videos = await listVideosBySession(sessionId)
  const serveJob = (await getDb().jobs.where('sessionId').equals(sessionId).toArray())[0]
  const job = serveJob ? await getJob(serveJob.id) : undefined
  void serveIds
  return {
    sessionStatus: session?.status,
    hasAnalysis: !!session?.analysis,
    serves: serves.length,
    servesWithMetrics,
    metricStatuses: statuses,
    metricsWithoutStatus: withoutStatus,
    tracks,
    tracksWithBall,
    thumbs,
    evidence,
    sessionThumb: !!thumb,
    keyFrameBytes: bytes,
    statsStored: !!stats,
    jobState: job?.state,
    video: videos[0] ? { storage: videos[0].storage, audio: videos[0].audio, retention: videos[0].retention.policy } : undefined,
  }
}

async function summaryFor(sessionId: string): Promise<ServeSummary[]> {
  const serves = await listServesBySession(sessionId)
  const out: ServeSummary[] = []
  for (const s of serves) {
    const frames = await listKeyFramesForServe(s.id, 'thumb')
    out.push({
      index: s.index,
      included: s.included,
      metrics: Object.values(s.metrics ?? {}) as MetricValue[],
      thumbs: frames.map((k) => ({ event: k.event, url: URL.createObjectURL(k.blob) })),
    })
  }
  return out
}

async function main(): Promise<void> {
  const clip = params.get('clip')
  const state: ViewState = {
    clipLabel: clip ?? 'Add ?clip=<url> to run.',
    status: 'idle',
    view: pick<CameraView>(params.get('view'), ['side', 'rear', 'front45', 'unknown'], 'side'),
    showExperimental: params.get('experimental') === '1',
  }
  let controller: AbortController | null = null
  let painted = 0
  let pending = false
  const paint = () => {
    pending = false
    painted = performance.now()
    renderView(root, state, { onCancel: () => controller?.abort() })
  }
  const schedule = () => {
    if (pending) return
    pending = true
    const wait = Math.max(0, 200 - (performance.now() - painted))
    setTimeout(() => requestAnimationFrame(paint), wait)
  }
  paint()
  if (!clip) return

  const sessionId = ulid()
  const useDouble = params.get('engine') === 'double'
  let deps: PipelineDeps = useDouble ? { ...defaultDeps, engine: { findServeWindows: findServeWindowsDouble, analyseSession: analyseSessionDouble } } : defaultDeps
  if (params.get('noBall') === '1') {
    // Profiling knob: a ball client that drops frames, to time pose alone.
    const { analyseWindow } = await import('../../ball/workerCore.ts')
    deps = {
      ...deps,
      createBallClient: async () => ({
        backend: 'main-thread',
        begin: async () => undefined,
        pushFrame: async (_w: number, _f: number, _t: number, image: BallFrameImage) => {
          if ('close' in image) image.close()
        },
        end: async (windowId: number, options) => analyseWindow(windowId, [], options),
        dispose: () => undefined,
      }),
    }
  }
  // Accuracy dumps (perf-bench.mjs): the engine's input poses and output serves, plus pose-source
  // stats, captured by wrapping the injected deps (the pipeline itself is unchanged).
  const poseSources: PoseEstimator[] = []
  let passAStats: unknown[] | null = null
  const ballWindows: NonNullable<PipelineDump['ballWindows']> = []
  let sparsePoses: PipelineDump['sparsePoses']
  if (params.get('dump') === '1') {
    const real = deps.engine
    const createPose = deps.createPoseSource
    const createBall = deps.createBallClient
    deps = {
      ...deps,
      // Ball windows: the search configuration each ran with and the ball layer's full result.
      createBallClient: async (onAck, options) => {
        const client = await createBall(onAck, options)
        const configs = new Map<number, WindowBallConfig>()
        return {
          backend: client.backend,
          begin: (windowId, config) => {
            configs.set(windowId, config)
            return client.begin(windowId, config)
          },
          pushFrame: (windowId, frameIndex, tReal, image) => client.pushFrame(windowId, frameIndex, tReal, image),
          end: async (windowId, analyseOptions) => {
            const result = await client.end(windowId, analyseOptions)
            const config = configs.get(windowId)
            if (config) ballWindows.push({ windowId, config, result })
            return result
          },
          dispose: () => client.dispose(),
        }
      },
      createPoseSource: async (pass, model) => {
        const source = await createPose(pass, model)
        poseSources.push(source)
        // Pass B switches the landmarker to numPoses 1: snapshot the Pass A stats then.
        const configure = source.configure?.bind(source)
        if (configure) {
          source.configure = (settings) => {
            if (settings.numPoses === 1 && !passAStats) passAStats = poseSources.map((s) => s.stats?.() ?? null)
            configure(settings)
          }
        }
        return source
      },
      engine: {
        findServeWindows: (poses, meta, handedness) => {
          sparsePoses = packPoses(poses)
          return real.findServeWindows(poses, meta, handedness)
        },
        analyseSession: (input) => {
          const out = real.analyseSession(input)
          window.__pipelineDump = packDump(input, out)
          return out
        },
      },
    }
  }
  if (useDouble) state.clipLabel = `${clip} (test-double engine: engine.ts is still a stub)`
  const report: E2EReport = { state: 'running', clip, sessionId, engine: useDouble ? 'test-double' : 'engine.ts', events: [], warnings: [], consoleErrors }
  window.__pipelineE2E = report
  const view = pick<CameraView>(params.get('view'), ['side', 'rear', 'front45', 'unknown'], 'side')
  const handedness = pick<Handedness>(params.get('hand'), ['right', 'left'], 'right')
  const heightM = Number(params.get('heightM')) > 0 ? Number(params.get('heightM')) : 1.8
  const target = params.get('target') as TargetZone | null
  const hitSound = params.get('hitSound') === '1'
  // The light answer the import flow would record (?light=day|lights|indoor). The synthetic renders'
  // lighting is known: night renders say so in their name; everything else is daylight. Without an
  // answer the engine treats the light as unknown (nothing validated), as it does for a real import.
  const light = pick<'day' | 'lights' | 'indoor'>(params.get('light'), ['day', 'lights', 'indoor'], /night/i.test(clip) ? 'lights' : 'day')
  const cancelAt = Number(params.get('cancelAt'))
  const started = performance.now()
  controller = new AbortController()
  state.status = 'running'
  paint()
  try {
    const response = await fetch(clip)
    if (!response.ok) throw new Error(`${clip}: HTTP ${response.status}`)
    const blob = await response.blob()
    const file = new File([blob], clip.split('/').pop() ?? 'clip.mp4', { type: blob.type || 'video/mp4' })
    const capture: CaptureContext = {
      source: 'import',
      declaredView: view,
      serveSide: 'both',
      serveNumber: 'mixed',
      intendedTarget: target && ['T', 'body', 'wide'].includes(target) ? target : undefined,
      handedness,
      playerHeightM: heightM,
      playerHeightSource: 'entered',
      hitSoundTiming: hitSound,
      conditions: { light },
    }
    const result = await runAnalysis(file, {
      sessionId,
      profile: { heightM, handedness },
      view,
      capture,
      hitSoundTiming: hitSound,
      signal: controller.signal,
      source: 'file-import',
      // Pass A knobs: ?passA=uniform (15 Hz everywhere), ?coarseNP=1|2 and ?fillNP=1|2 (landmarker
      // poses per stream), ?seedFill=0 (localise the fill stream instead of seeding it).
      passA: {
        ...(params.get('passA') === 'uniform' ? { coarseHz: 15, fineHz: 15 } : {}),
        coarseNumPoses: params.get('coarseNP') === '1' ? 1 : params.get('coarseNP') === '2' ? 2 : undefined,
        fillNumPoses: params.get('fillNP') === '1' ? 1 : params.get('fillNP') === '2' ? 2 : undefined,
        seedFill: params.get('seedFill') === '0' ? false : undefined,
      },
      // Pass B tuning knobs for perf-bench.mjs A/B runs (?numPoses=2, ?lanes=1, ?reuse=0,
      // ?ballPixels=gpu, ?seed=0) and the pose crop size (?roiSide=0 keeps the source resolution).
      passB: {
        numPoses: params.get('numPoses') === '2' ? 2 : params.get('numPoses') === '1' ? 1 : undefined,
        lanes: Number(params.get('lanes')) > 0 ? Number(params.get('lanes')) : undefined,
        reuseSparse: params.get('reuse') === '1' ? true : params.get('reuse') === '0' ? false : undefined,
        ballPixels: params.get('ballPixels') === 'gpu' ? 'gpu' : params.get('ballPixels') === 'cpu' ? 'cpu' : undefined,
        seedPose: params.get('seed') === '1' ? true : params.get('seed') === '0' ? false : undefined,
        tightBallCrop: params.get('tightCrop') === '0' ? false : undefined,
        slowCoreHz: params.has('slowCore') ? Number(params.get('slowCore')) : undefined,
        poseLanes: params.has('poseLanes') ? Number(params.get('poseLanes')) : undefined,
      },
      pose: params.has('roiSide') ? { roiMaxSidePx: Number(params.get('roiSide')) } : undefined,
      onProgress: (event: PipelineEvent) => {
        if (event.type === 'warning') report.warnings.push(event.message)
        if (event.type !== 'progress') return
        const p: PipelineProgress = event.progress
        report.events.push({ t: Math.round(performance.now() - started), stage: p.stage, step: p.step, overall: Number(p.overall.toFixed(4)), label: p.label, etaS: p.etaS })
        state.progress = p
        if (cancelAt > 0 && p.overall >= cancelAt) controller?.abort()
        schedule()
      },
    }, deps)
    const { stats, ...rest } = result
    report.result = { ...rest, statsMetricIds: Object.keys(stats.metrics) }
    if (window.__pipelineDump) {
      window.__pipelineDump.poseStats = poseSources.map((s) => s.stats?.() ?? null)
      if (passAStats) window.__pipelineDump.poseStatsPassA = passAStats
      window.__pipelineDump.ballWindows = ballWindows
      window.__pipelineDump.sparsePoses = sparsePoses
    }
    report.verify = await verify(sessionId, result.serveIds)
    report.state = 'done'
    state.status = 'done'
    state.summary = {
      servesFound: result.servesFound,
      servesIncluded: result.servesIncluded,
      keyFrames: result.keyFrames,
      coaching: result.coaching.status === 'decided' ? `Decided (${result.coaching.kind ?? 'decision'})` : `Skipped: ${result.coaching.reason ?? 'not available'}`,
      warnings: result.warnings.filter((w) => !w.startsWith('engine:')),
      serves: await summaryFor(sessionId),
      timings: result.timings,
      baseline: SMOKE_BASELINES[params.get('baseline') ?? ''],
    }
  } catch (error) {
    const err = error instanceof AnalysisError ? error : null
    report.error = { code: err?.code ?? 'internal', message: err?.playerMessage ?? String(error), detail: err?.detail }
    report.state = err?.code === 'cancelled' ? 'cancelled' : 'failed'
    state.status = report.state
    state.error = { code: report.error.code, message: report.error.message }
    const session = await getSession(sessionId)
    report.verify = {
      sessionStatus: session?.status,
      hasAnalysis: !!session?.analysis,
      serves: 0,
      servesWithMetrics: 0,
      metricStatuses: {},
      metricsWithoutStatus: 0,
      tracks: 0,
      tracksWithBall: 0,
      thumbs: 0,
      evidence: 0,
      sessionThumb: false,
      keyFrameBytes: 0,
      statsStored: !!(await getStats(sessionId)),
      jobState: (await getDb().jobs.where('sessionId').equals(sessionId).toArray())[0]?.state,
      servesInDbAfterCancel: (await listServesBySession(sessionId)).length,
    }
  }
  paint()
}

void main()
