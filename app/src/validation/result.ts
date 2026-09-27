/**
 * Shape of window.__harnessResult (validation.html). Everything is plain JSON so the
 * Playwright runner (tools/validate/smoke.mjs) can read it with page.evaluate.
 * Times: `tReal` is what the app believed at that stage (see `metaTimeScale` on each ball
 * pass); truth comparisons convert to real seconds explicitly.
 */
import type { BallAnalysis, TimeBaseSuggestion, TossAnalysis } from '../analysis/ball/index.ts'
import type { MetricValue, ServeEvents, VideoMeta } from '../analysis/types.ts'
import type { PlayerInputs } from './truth.ts'

export const HARNESS_RESULT_VERSION = 1

export interface StageTimings {
  /** Fetching the clip (and truth) over HTTP from the dev server. */
  fetchMs: number
  probeMs: number
  audioDecodeMs: number
  onsetsMs: number
  poseInitMs: number
  /** Whole pose pass: decode + ROI crop + inference + tracking. */
  posePassMs: number
  /** Time spent waiting on the decoder inside the pose pass. */
  poseDecodeMs: number
  poseCleanMs: number
  /** Whole ball detection pass (decode + detector), summed over passes. */
  ballPassMs: number
  ballDecodeMs: number
  ballDetectMs: number
  ballAnalyseMs: number
  scoreMs: number
  totalMs: number
}

export interface DecodeSummary {
  path: string
  requested: number
  yielded: number
  missingIndices: number[]
  samplesFed: number
  elapsedMs: number
  notes: string[]
}

export interface HarnessMeta {
  /** Probe output as read from the container. */
  probe: VideoMeta
  /** Meta used at the end (after any time-scale correction). */
  final: VideoMeta
  timeBase: { kind: string; status: string; captureFps: number; timeScale: number; fpsSource: string; evidence: string[]; warnings: string[] }
  decodePath: string
  decodePathReason: string
  container: string
  codec: string | undefined
  probeWarnings: string[]
  decode: { pose: DecodeSummary | null; ball: DecodeSummary[] }
}

/** One pose frame: landmarks as [x, y, z, visibility] rows (33), plus tracking info. */
export interface HarnessPoseFrame {
  frameIndex: number
  tReal: number
  score: number
  landmarks: number[][] | null
  track: { index: number | null; reason: string; confidence: number; candidates: number } | null
  crop: { x: number; y: number; width: number; height: number } | null
  localised: boolean
  skipped: boolean
}

export interface HarnessPose {
  options: Record<string, unknown>
  stats: unknown
  frames: HarnessPoseFrame[]
  /** cleanPoseFrames output (swap fix, outliers, gaps, One Euro), same layout. */
  clean: { report: unknown; frames: Array<{ frameIndex: number; tReal: number; landmarks: number[][] | null }> }
}

export interface HarnessOnset {
  tMedia: number
  tReal: number
  strength: number
  sharpness: number
  kind: 'contact' | 'bounce' | 'unknown'
  riseTimeMs: number
  hfRatio: number
  peakDbfs: number
}

export interface HarnessAudio {
  status: 'ok' | 'no-audio' | 'failed'
  reason?: string
  decodeMethod?: string
  sampleRate?: number
  durationS?: number
  startTimeS?: number
  /** assessAudioTiming on the probe meta: whether the app would use the audio at all. */
  timing: { usable: boolean; reason: string }
  onsets: HarnessOnset[]
}

export interface HarnessTrack {
  id: number
  kind: string
  observations: Array<{ frameIndex: number; tReal: number; x: number; y: number; radius: number; score: number; source: string }>
}

/** One candidate: [x, y, radiusNorm, score, supportRatio, plainSupportRatio, streakLengthNorm]. */
export type CandidateRow = [number, number, number, number, number, number, number]

export interface HarnessBallPass {
  label: 'initial' | 'after-time-scale-correction'
  /** Real seconds per media second the app used in this pass (1 before a correction). */
  metaTimeScale: number
  captureFps: number
  timeBaseKnown: boolean
  /** tReal of the end of the toss search band (contact onset minus sound delay), if audio gave one. */
  tossRoiUntilTReal: number | null
  audioUsed: boolean
  /**
   * The racket-pop onset the ball layer times contact with (strongest non-bounce transient
   * 0.05-1.0 s after the toss apex, as in analyseBall), and that time minus the sound delay.
   */
  contactOnset: { tReal: number; kind: string; strength: number } | null
  contactFromAudioTReal: number | null
  frames: Array<{ frameIndex: number; tReal: number; candidates: CandidateRow[] }>
  setup: { expectedRadiusNorm: number | null; tossRoi: unknown; scale: unknown; body: unknown; notes: string[] }
  tracks: HarnessTrack[]
  /** The tracker's toss and outgoing tracks (also in `tracks`, whatever kind they were given). */
  tossTrack: HarnessTrack | null
  outgoingTrack: HarnessTrack | null
  toss: TossAnalysis | null
  events: Pick<ServeEvents, 'tossRelease' | 'tossApex' | 'contact'>
  timeBase: TimeBaseSuggestion
  speedFromTrack: BallAnalysis['speedFromTrack']
  averageSpeedRear: BallAnalysis['averageSpeedRear']
  bounce: BallAnalysis['bounce']
  placement: BallAnalysis['placement']
  metrics: MetricValue[]
}

export interface HarnessBall {
  passes: HarnessBallPass[]
  /** The pass the app would report (the corrected one when a correction was applied). */
  finalPass: number
}

export interface HarnessResult {
  version: number
  ok: boolean
  error?: string
  /** Stage that failed, when ok is false. */
  failedStage?: string
  clipUrl: string
  truthUrl: string | null
  startedAt: string
  environment: { userAgent: string; hardwareConcurrency: number; devicePixelRatio: number }
  inputs: PlayerInputs & { source: Record<keyof PlayerInputs, 'param' | 'truth' | 'default'> }
  meta: HarnessMeta | null
  pose: HarnessPose | null
  audio: HarnessAudio | null
  ball: HarnessBall | null
  timings: StageTimings
  /** Comparison with truth (only when ?truth= was given). */
  scores: unknown
  /** securitypolicyviolation events seen by the page while it ran. */
  cspViolations: Array<{ blockedURI: string; violatedDirective: string; sourceFile: string }>
  notes: string[]
}
