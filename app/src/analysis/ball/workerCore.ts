/**
 * Pure core of the ball worker (engine-pipeline). Runs in the worker, on the main thread as a
 * fallback, and in Node tests: no DOM.
 *
 * One BallWindowProcessor per serve window. The pipeline sends a crop of the frame (the window's
 * search region: toss column, player and the outgoing corridor), so the pixel readback and the
 * detector's downscale cover a fraction of the frame. Candidates are mapped back to full-frame
 * normalised coordinates here, so the tracker, toss analysis and everything downstream see the
 * same coordinates as a full-frame run (radius and streak stay in frame-height units).
 *
 * Search regions over time, around the provisional contact time pc (from the sparse pose pass,
 * or the hit sound when hit-sound timing is on) with its uncertainty u:
 *   t <  pc - u - 20 ms   toss band only, toss-phase plain-colour gate (as createBallFrameDetector);
 *   pc - u <= t <= pc + u toss band plus the post-contact corridor, no gate (contact is uncertain);
 *   t >  pc + u           the post-contact corridor only (side view: forward of the contact point,
 *                         where a serve leaves within about 15 deg of horizontal); whole crop otherwise.
 * Without pc the whole crop is searched with no gate.
 */
import type { BallTrack, CameraView, MetricValue, ServeEvents } from '../types.ts'
import { analyseBall, TOSS_ROI_END_MARGIN_S, type BallAnalysisOptions, type BallSetup, type TimeBaseSuggestion } from './analyse.ts'
import type { BounceEstimate, BounceUnavailable, CourtPlacement } from './bounce.ts'
import { BallDetector, BROAD_SIZE_PRIOR, TOSS_PLAIN_SUPPORT_GATE, type DetectorImage, type DetectorOptions } from './detector.ts'
import type { RegionOfInterest } from './scale.ts'
import type { FlightTimeSpeedEstimate, SpeedUnavailable, TargetTag, TrackSpeedEstimate } from './speed.ts'
import type { TossAnalysis } from './toss.ts'
import type { FrameCandidates, TrackContact } from './tracker.ts'

/** Normalised rectangle of the full displayed frame. */
export interface NormRect {
  x: number
  y: number
  w: number
  h: number
}

export interface WindowBallConfig {
  /** Region of the full frame that each `frame` image shows. */
  crop: NormRect
  /** Full frame width / height. */
  frameAspect: number
  /** Expected ball radius in full-frame height units (from the pose scale). */
  expectedRadiusNorm?: number
  /** Toss band (full-frame normalised), from ballSetupFromPoses. */
  tossRoi: RegionOfInterest | null
  /** Post-contact search corridor (full-frame normalised). Side view only. */
  corridor: RegionOfInterest | null
  /** Provisional contact time (real s) and its half-width of doubt (s). */
  provisionalContactT?: number
  contactUncertaintyS?: number
  cameraView: CameraView
  detector?: DetectorOptions
}

export interface WindowAnalyseOptions {
  setup: Pick<BallSetup, 'aspect' | 'scale' | 'expectedRadiusNorm' | 'body'>
  captureFps: number
  timeBaseKnown: boolean
  cameraView: CameraView
  onsets?: BallAnalysisOptions['onsets']
  contactTReal?: number
  targetTag?: TargetTag | null
  servedFrom?: BallAnalysisOptions['servedFrom']
  seed?: number
}

/** Everything the pipeline and the engine need from one window, structured-clone safe. */
export interface BallWindowResult {
  windowId: number
  framesProcessed: number
  framesWithCandidates: number
  /** Per-frame candidates in full-frame coordinates (kept for re-analysis without re-detection). */
  candidates: FrameCandidates[]
  tracks: BallTrack[]
  toss: TossAnalysis | null
  tossTrackId: number | null
  outgoingTrackId: number | null
  contactFromTracks: TrackContact | null
  events: Pick<ServeEvents, 'tossRelease' | 'tossApex' | 'contact'>
  timeBase: TimeBaseSuggestion
  speedFromTrack: TrackSpeedEstimate | SpeedUnavailable
  averageSpeedRear: FlightTimeSpeedEstimate | SpeedUnavailable
  bounce: BounceEstimate | BounceUnavailable
  placement: CourtPlacement | BounceUnavailable
  metrics: MetricValue[]
  timings: { detectMs: number; readbackMs: number; analyseMs: number }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Full-frame region -> crop-normalised region; undefined when it misses the crop. */
export function roiToCrop(roi: RegionOfInterest | null | undefined, crop: NormRect): RegionOfInterest | undefined {
  if (!roi) return undefined
  const x0 = clamp01((roi.x0 - crop.x) / crop.w)
  const x1 = clamp01((roi.x1 - crop.x) / crop.w)
  const y0 = clamp01((roi.y0 - crop.y) / crop.h)
  const y1 = clamp01((roi.y1 - crop.y) / crop.h)
  if (x1 - x0 <= 1e-6 || y1 - y0 <= 1e-6) return undefined
  return { x0, y0, x1, y1 }
}

export function unionRoi(a: RegionOfInterest | undefined, b: RegionOfInterest | undefined): RegionOfInterest | undefined {
  if (!a) return b
  if (!b) return a
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

type Candidate = FrameCandidates['candidates'][number] & Record<string, unknown>

/** Crop-normalised candidate -> full-frame normalised (radius and streak in frame-height units). */
export function candidateToFrame<T extends { x: number; y: number; radiusNorm: number; streakLengthNorm?: number }>(c: T, crop: NormRect): T {
  const out = { ...c, x: crop.x + c.x * crop.w, y: crop.y + c.y * crop.h, radiusNorm: c.radiusNorm * crop.h }
  if (typeof c.streakLengthNorm === 'number') out.streakLengthNorm = c.streakLengthNorm * crop.h
  return out
}

export type SearchPhase = 'toss' | 'transition' | 'outgoing' | 'open'

export class BallWindowProcessor {
  private readonly detector: BallDetector
  private readonly frames: FrameCandidates[] = []
  private readonly tossRoiCrop: RegionOfInterest | undefined
  private readonly corridorCrop: RegionOfInterest | undefined
  private readonly tossUntil: number | undefined
  private readonly corridorFrom: number | undefined
  detectMs = 0

  constructor(readonly config: WindowBallConfig) {
    const expected = config.expectedRadiusNorm !== undefined && config.crop.h > 0 ? config.expectedRadiusNorm / config.crop.h : undefined
    this.detector = new BallDetector({ ...config.detector, expectedRadiusNorm: expected })
    this.tossRoiCrop = roiToCrop(config.tossRoi, config.crop)
    this.corridorCrop = config.cameraView === 'side' ? roiToCrop(config.corridor, config.crop) : undefined
    const pc = config.provisionalContactT
    if (pc !== undefined && Number.isFinite(pc)) {
      const u = Math.max(0, config.contactUncertaintyS ?? 0.15)
      this.tossUntil = pc - u - TOSS_ROI_END_MARGIN_S
      this.corridorFrom = pc + u
    }
  }

  phaseAt(tReal: number): SearchPhase {
    if (this.tossUntil === undefined || this.corridorFrom === undefined) return 'open'
    if (tReal < this.tossUntil) return 'toss'
    if (tReal > this.corridorFrom) return 'outgoing'
    return 'transition'
  }

  /** Detects in one crop image (crop-normalised) and records full-frame candidates. Frames in time order. */
  process(frame: { frameIndex: number; tReal: number; image: DetectorImage }): FrameCandidates {
    const started = now()
    const phase = this.phaseAt(frame.tReal)
    const overrides: Parameters<BallDetector['detect']>[1] = {}
    if (phase === 'toss') {
      Object.assign(overrides, TOSS_PLAIN_SUPPORT_GATE)
      if (this.tossRoiCrop) overrides.roi = this.tossRoiCrop
    } else if (phase === 'transition') {
      const roi = this.corridorCrop ? unionRoi(this.tossRoiCrop, this.corridorCrop) : undefined
      if (roi) overrides.roi = roi
    } else if (phase === 'outgoing' && this.corridorCrop) {
      overrides.roi = this.corridorCrop
    }
    // After the toss, a rear or front view sees the ball shrink as it leaves (createBallFrameDetector's rule).
    if (this.config.cameraView !== 'side' && (phase === 'outgoing' || phase === 'transition')) overrides.sizePrior = BROAD_SIZE_PRIOR
    const raw = this.detector.detect({ image: frame.image, tReal: frame.tReal }, overrides)
    const candidates = raw.map((c) => candidateToFrame(c as unknown as Candidate, this.config.crop))
    const out: FrameCandidates = { frameIndex: frame.frameIndex, tReal: frame.tReal, candidates }
    this.frames.push(out)
    this.detectMs += now() - started
    return out
  }

  results(): FrameCandidates[] {
    return this.frames
  }
}

/** Runs the ball layer's clip analysis on a window's candidates and packs a clone-safe result. */
export function analyseWindow(
  windowId: number,
  frames: FrameCandidates[],
  options: WindowAnalyseOptions,
  timings: { detectMs: number; readbackMs: number } = { detectMs: 0, readbackMs: 0 },
): BallWindowResult {
  const started = now()
  const sorted = [...frames].sort((a, b) => a.tReal - b.tReal)
  const analysis = analyseBall(sorted, {
    setup: options.setup,
    captureFps: options.captureFps,
    timeBaseKnown: options.timeBaseKnown,
    cameraView: options.cameraView,
    onsets: options.onsets,
    contactTReal: options.contactTReal,
    targetTag: options.targetTag ?? null,
    servedFrom: options.servedFrom,
    seed: options.seed,
  })
  const analyseMs = now() - started
  return {
    windowId,
    framesProcessed: sorted.length,
    framesWithCandidates: sorted.filter((f) => f.candidates.length > 0).length,
    candidates: sorted.map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, candidates: f.candidates.map(plainCandidate) })),
    tracks: analysis.tracks,
    toss: analysis.toss,
    tossTrackId: analysis.tracker.toss?.track.id ?? null,
    outgoingTrackId: analysis.tracker.outgoing?.track.id ?? null,
    contactFromTracks: analysis.tracker.outgoing?.contactFromTracks ?? null,
    events: analysis.events,
    timeBase: analysis.timeBase,
    speedFromTrack: analysis.speedFromTrack,
    averageSpeedRear: analysis.averageSpeedRear,
    bounce: analysis.bounce,
    placement: analysis.placement,
    metrics: analysis.metrics,
    timings: { ...timings, analyseMs },
  }
}

/** Keeps the tracker's fields (and the detector's scores) as plain numbers. */
function plainCandidate(c: FrameCandidates['candidates'][number]): FrameCandidates['candidates'][number] {
  const out: FrameCandidates['candidates'][number] = { x: c.x, y: c.y, radiusNorm: c.radiusNorm, score: c.score }
  if (typeof c.streakLengthNorm === 'number') out.streakLengthNorm = c.streakLengthNorm
  return out
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
