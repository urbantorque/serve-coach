/**
 * Determinate, staged progress (ARCHITECTURE §5.8, DESIGN §8.18).
 *
 * Overall progress is monotonic and follows the stage weights the Processing screen maps onto its
 * four rows (ui/screens/record/flow/stages.ts): probe + audio + Pass A = 0-0.32 ("Finding
 * serves"), Pass B = 0.32-0.92 ("Tracking the toss"), measuring = 0.92-0.96 ("Timing each
 * phase"), coaching + saving = 0.96-1 ("Choosing your focus"). Labels start with those row names
 * so the screen can match them. Events are posted at most every 250 ms, except on a step change.
 * The ETA comes from measured throughput and is omitted until 5 s of it exist.
 */
import type { AnalysisStage } from '../../data/domain.ts'
import type { PipelineEvent, PipelineProgress, PipelineStep } from './types.ts'

export const PROGRESS_THROTTLE_MS = 250
/** No ETA before this much measured throughput (DESIGN §8.18). */
export const ETA_MIN_OBSERVATION_MS = 5000
/** Throughput is measured over this trailing window. */
const ETA_WINDOW_MS = 30_000

type Span = [number, number]

/** Overall spans per step. Audio runs only with hit-sound timing; otherwise Pass A starts at 0.02. */
export function stepSpans(withAudio: boolean): Record<PipelineStep | 'audio', Span> {
  return {
    probe: [0, 0.02],
    audio: [0.02, 0.06],
    'finding-serves': [withAudio ? 0.06 : 0.02, 0.32],
    'tracking-body': [0.32, 0.92],
    'tracking-ball': [0.32, 0.92],
    measuring: [0.92, 0.96],
    coaching: [0.96, 0.98],
    saving: [0.98, 1],
    done: [1, 1],
  }
}

const STAGE_OF: Record<PipelineStep | 'audio', AnalysisStage> = {
  probe: 'probe',
  audio: 'audio',
  'finding-serves': 'sparse',
  'tracking-body': 'dense',
  'tracking-ball': 'dense',
  measuring: 'keyframes',
  coaching: 'session',
  saving: 'session',
  done: 'done',
}

export interface ProgressUpdate {
  servesFound?: number
  /** Serve currently being tracked (1-based) during Pass B. */
  serveIndex?: number
  servesDone?: number
}

/** Plain-English, specific labels (ARCHITECTURE §5.8). The first words match the UI rows. */
export function labelFor(step: PipelineStep | 'audio', u: ProgressUpdate): string {
  switch (step) {
    case 'probe':
      return 'Reading your video'
    case 'audio':
      return 'Finding serves (listening for the hit)'
    case 'finding-serves':
      return u.servesFound !== undefined ? `Finding serves (${u.servesFound} found)` : 'Finding serves'
    case 'tracking-body':
    case 'tracking-ball': {
      const of = u.servesFound ? ` (serve ${Math.min(u.servesFound, u.serveIndex ?? 1)} of ${u.servesFound})` : ''
      return `Tracking the toss${of}`
    }
    case 'measuring':
      return 'Timing each phase'
    case 'coaching':
      return 'Choosing your focus'
    case 'saving':
      return 'Choosing your focus (saving your results)'
    case 'done':
      return 'Done'
  }
}

export interface ProgressReporterOptions {
  jobId: string
  emit: (event: PipelineEvent) => void
  withAudio?: boolean
  now?: () => number
  throttleMs?: number
}

export class ProgressReporter {
  private readonly spans: Record<PipelineStep | 'audio', Span>
  private readonly now: () => number
  private readonly throttleMs: number
  private readonly startedAt: number
  private overall = 0
  private lastEmitAt = Number.NEGATIVE_INFINITY
  private lastStep: PipelineStep | 'audio' | null = null
  private lastServesFound: number | undefined
  private readonly samples: { t: number; overall: number }[] = []
  private etaSmoothed: number | undefined
  private state: ProgressUpdate = {}
  private pending: PipelineProgress | null = null

  constructor(private readonly options: ProgressReporterOptions) {
    this.spans = stepSpans(options.withAudio ?? false)
    this.now = options.now ?? (() => performance.now())
    this.throttleMs = options.throttleMs ?? PROGRESS_THROTTLE_MS
    this.startedAt = this.now()
  }

  get current(): number {
    return this.overall
  }

  /** Reports `fraction` (0..1) of `step`. Overall never goes backwards. */
  update(step: PipelineStep | 'audio', fraction: number, update: ProgressUpdate = {}): void {
    this.state = { ...this.state, ...update }
    const [a, b] = this.spans[step]
    const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
    const t = this.now()
    this.overall = Math.max(this.overall, a + (b - a) * f)
    this.samples.push({ t, overall: this.overall })
    while (this.samples.length > 2 && this.samples[1].t < t - ETA_WINDOW_MS) this.samples.shift()

    const progress: PipelineProgress = {
      jobId: this.options.jobId,
      stage: STAGE_OF[step],
      step: step === 'audio' ? 'finding-serves' : step,
      stepFraction: f,
      label: labelFor(step, this.state),
      overall: this.overall,
      elapsedMs: Math.round(t - this.startedAt),
    }
    if (this.state.servesFound !== undefined) progress.servesFound = this.state.servesFound
    if (this.state.servesDone !== undefined) progress.servesDone = this.state.servesDone
    const eta = this.eta(t)
    if (eta !== undefined) progress.etaS = eta

    const changed = step !== this.lastStep || this.state.servesFound !== this.lastServesFound
    if (changed || t - this.lastEmitAt >= this.throttleMs || f >= 1) {
      this.send(progress, t)
      this.lastStep = step
      this.lastServesFound = this.state.servesFound
    } else {
      this.pending = progress
    }
  }

  /** Emits the last throttled update, if any (call before long waits and at the end). */
  flush(): void {
    if (this.pending) this.send(this.pending, this.now())
  }

  finish(): void {
    this.update('done', 1)
  }

  private send(progress: PipelineProgress, t: number): void {
    this.pending = null
    this.lastEmitAt = t
    this.options.emit({ type: 'progress', progress })
  }

  /** Seconds left from the trailing throughput; undefined before 5 s of data or without progress. */
  private eta(t: number): number | undefined {
    if (t - this.startedAt < ETA_MIN_OBSERVATION_MS || this.overall >= 1) return undefined
    const first = this.samples[0]
    const dt = (t - first.t) / 1000
    const dOverall = this.overall - first.overall
    if (dt < ETA_MIN_OBSERVATION_MS / 1000 / 2 || dOverall <= 0) return this.etaSmoothed
    const raw = ((1 - this.overall) / dOverall) * dt
    this.etaSmoothed = this.etaSmoothed === undefined ? raw : 0.7 * this.etaSmoothed + 0.3 * raw
    return Math.max(1, Math.round(this.etaSmoothed))
  }
}
