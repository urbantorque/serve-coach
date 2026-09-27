/**
 * Thin adapter over the engine-pipeline entry point (owned by engine-pipeline, not this folder):
 *
 *   runAnalysis(file, { sessionId, profile, view, capture, fpsOverride, signal, onProgress })
 *     => Promise<{ sessionId }>
 *
 * The module is found with import.meta.glob, so this screen builds and runs before the pipeline
 * lands (the glob is simply empty) and picks it up as soon as it exists. Progress events are
 * normalised here: AnalysisProgress objects, `{ type: 'progress', progress }` and
 * `{ type: 'serve-ready', serveId, index }` and `{ type: 'warning', message }` events are accepted.
 */
import type { CameraView, CaptureContext, Handedness } from '../../../../analysis/types.ts'
import type { AnalysisProgress } from '../../../../data/domain.ts'

export interface RunAnalysisOptions {
  sessionId: string
  profile: { heightM?: number; handedness: Handedness }
  view: CameraView
  capture: CaptureContext
  /** Player-confirmed capture rate for slow-motion imports (CAPTURE §11.3). */
  fpsOverride?: number
  /** Where the clip came from, for the pipeline's VideoRecord. */
  source?: 'in-app-web' | 'in-app-native' | 'camera-input' | 'file-import' | 'demo'
  /** Hit-sound timing (D4: contact timing only, off by default). */
  hitSoundTiming?: boolean
  signal: AbortSignal
  onProgress: (event: unknown) => void
}

export type RunAnalysis = (file: Blob, options: RunAnalysisOptions) => Promise<{ sessionId: string } | void>

export type PipelineEvent =
  | { kind: 'progress'; progress: AnalysisProgress }
  | { kind: 'serve-ready'; serveId: string; index: number }
  | { kind: 'warning'; message: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function asProgress(v: unknown): AnalysisProgress | null {
  if (!isRecord(v)) return null
  if (typeof v.overall !== 'number' || typeof v.stage !== 'string') return null
  return {
    jobId: typeof v.jobId === 'string' ? v.jobId : '',
    stage: v.stage as AnalysisProgress['stage'],
    label: typeof v.label === 'string' ? v.label : '',
    overall: Math.min(1, Math.max(0, v.overall)),
    servesFound: typeof v.servesFound === 'number' ? v.servesFound : undefined,
    servesDone: typeof v.servesDone === 'number' ? v.servesDone : undefined,
    etaS: typeof v.etaS === 'number' ? v.etaS : undefined,
  }
}

/** Normalises whatever the pipeline reports into a PipelineEvent, or null when it is not one we use. */
export function normaliseEvent(event: unknown): PipelineEvent | null {
  if (!isRecord(event)) return null
  if (event.type === 'warning' && typeof event.message === 'string') return { kind: 'warning', message: event.message }
  if (event.type === 'serve-ready' && typeof event.serveId === 'string') {
    return { kind: 'serve-ready', serveId: event.serveId, index: typeof event.index === 'number' ? event.index : 0 }
  }
  const progress = asProgress(event.type === 'progress' ? event.progress : event)
  return progress ? { kind: 'progress', progress } : null
}

type PipelineModule = { runAnalysis?: RunAnalysis; default?: { runAnalysis?: RunAnalysis } }

const modules = import.meta.glob<PipelineModule>([
  '/src/analysis/pipeline/index.ts',
  '/src/analysis/pipeline/runAnalysis.ts',
  '/src/analysis/pipeline.ts',
])

let override: RunAnalysis | null | undefined

/** Tests and the dev simulator inject a runner here. `undefined` restores the real lookup. */
export function setRunAnalysisForTests(runner: RunAnalysis | null | undefined): void {
  override = runner
}

/** The pipeline's runAnalysis, or null when this build does not include it yet. */
export async function loadRunAnalysis(): Promise<RunAnalysis | null> {
  if (override !== undefined) return override
  for (const load of Object.values(modules)) {
    try {
      const mod = await load()
      const fn = mod.runAnalysis ?? mod.default?.runAnalysis
      if (typeof fn === 'function') return fn
    } catch {
      // A module that fails to load is treated as missing; the screen says so plainly.
    }
  }
  return null
}

/**
 * Dev-only stand-in that reports staged progress without analysing anything, so the Processing
 * screen can be exercised before the pipeline lands (`?simulate=1`). It writes nothing and is
 * never reachable in a production build.
 */
export function simulatedRunner(durationMs = 12_000): RunAnalysis {
  return (_file, { signal, onProgress }) =>
    new Promise((resolve, reject) => {
      const start = performance.now()
      const found = 12
      const tick = () => {
        if (signal.aborted) {
          reject(new DOMException('Cancelled', 'AbortError'))
          return
        }
        const f = Math.min(1, (performance.now() - start) / durationMs)
        const stage = f < 0.3 ? 'sparse' : f < 0.92 ? 'dense' : f < 0.96 ? 'keyframes' : 'session'
        const done = Math.floor(Math.max(0, (f - 0.32) / 0.6) * found)
        const label =
          stage === 'sparse'
            ? `Finding serves (${Math.floor((f / 0.3) * found)} found)`
            : stage === 'dense'
              ? `Tracking the toss (serve ${Math.min(found, done + 1)} of ${found})`
              : stage === 'keyframes'
                ? 'Timing each phase'
                : 'Choosing your focus'
        onProgress({ jobId: 'simulated', stage, label, overall: f, servesFound: stage === 'sparse' ? Math.floor((f / 0.3) * found) : found, servesDone: done })
        if (f >= 1) resolve(undefined)
        else setTimeout(tick, 250)
      }
      tick()
    })
}
