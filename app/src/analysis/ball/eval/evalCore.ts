/**
 * Ball-layer evaluation on rendered synthetic clips with exact ground truth
 * (validation/synthetic, serve-synth-truth/1). Pure TypeScript: the Node runner
 * (run-ball-eval.mjs) decodes frames and audio with ffmpeg and passes them in.
 *
 * The pipeline is the one the app runs: pose -> ballSetupFromPoses -> audio contact onset
 * -> createBallFrameDetector (toss band until the contact onset) -> analyseBall. Two inputs
 * come from truth instead of the app's own layers, and the report says so:
 *   - poses are the truth landmarks (MediaPipe-style, as the pose layer would output them);
 *   - the player's height and target tag are "player-entered" from truth.
 * For the rear clip the four-corner court tap is simulated by projecting the court corners
 * through the true camera, with 1.5 px tap noise.
 */
import type { AudioOnset, CameraView, ImageDataLike, Landmark, PoseFrame } from '../../types.ts'
import { assessAudioTiming, detectOnsets, toAudioOnsets } from '../../video/audio.ts'
import { analyseBall, ballSetupFromPoses, createBallFrameDetector, soundDelayEstimateS, strongestTransient, type BallAnalysis, type BallSetup } from '../analyse.ts'
import { median, percentile } from '../fit.ts'
import { computeHomography, COURT, type Mat3, type Point2 } from '../homography.ts'
import { createRng, gaussian } from '../random.ts'
import type { TargetTag } from '../speed.ts'
import type { FrameCandidates } from '../tracker.ts'

// ---------- truth (subset of serve-synth-truth/1) ----------

export interface TruthBall {
  state: string
  x: number
  y: number
  /** Frame-height units. */
  radius: number
  inFrame: boolean
  occluded: boolean
  held: boolean
  /** Blur path during the exposure, normalised [x0, y0, x1, y1]. */
  streak?: [number, number, number, number]
}

export interface TruthFrame {
  frameIndex: number
  tMedia: number
  tReal: number
  landmarks: Landmark[]
  balls: TruthBall[]
}

interface TruthEvent {
  tReal: number
  inClip: boolean
}

export interface TruthClip {
  clipId: string
  video: { width: number; height: number; fps: number; captureFps: number; timeScale: number; frameCount: number }
  settings: {
    view: CameraView
    distanceM: number
    orientation: string
    intrinsics: { fxPx: number; fyPx: number; cxPx: number; cyPx: number; width: number; height: number }
    extrinsics: { R: number[]; t: number[] }
    lighting: { preset: string }
    crf: number
  }
  player: { heightM: number; handedness: 'right' | 'left' }
  serves: {
    courtSide: 'deuce' | 'ad'
    direction: string
    events: Record<string, TruthEvent | unknown>
    metrics: Record<string, number | boolean | string>
    visibility: Record<string, boolean>
  }[]
  frames: TruthFrame[]
}

// ---------- detection scoring ----------

/** States in which the ball is in free flight (the detector must find it). */
const FREE_FLIGHT = new Set(['toss', 'flight', 'after-bounce'])

interface FrameScore {
  /** Free-flight ball visible (centre >= 1 radius inside the frame, not occluded). */
  target: 'toss' | 'flight' | null
  matched: boolean
  top1: boolean
  /** Pixel error of the nearest matching candidate. */
  errorPx: number | null
  candidates: number
  /** Candidates within the gate of any truth ball (held balls included). */
  truePositives: number
  /** The top candidate is on a truth ball (null when there are no candidates). */
  top1OnBall: boolean | null
  /** Full-resolution support ratios of candidates on / off a truth ball (diagnostic). */
  supportTrue: number[]
  supportFalse: number[]
  /** [support, plainSupport, streak / diameter] per candidate (diagnostic). */
  featuresTrue: number[][]
  featuresFalse: number[][]
}

function gatePx(ball: TruthBall, width: number, height: number): number {
  const rPx = ball.radius * height
  const streakPx = ball.streak ? Math.hypot((ball.streak[2] - ball.streak[0]) * width, (ball.streak[3] - ball.streak[1]) * height) : 0
  return Math.max(2 * rPx, 4) + 0.5 * streakPx
}

function distancePx(c: { x: number; y: number }, b: { x: number; y: number }, width: number, height: number): number {
  return Math.hypot((c.x - b.x) * width, (c.y - b.y) * height)
}

export function scoreFrame(candidates: { x: number; y: number; supportRatio?: number; plainSupportRatio?: number; streakLengthNorm?: number; radiusNorm?: number }[], truth: TruthFrame, width: number, height: number): FrameScore {
  const visible = truth.balls.filter((b) => b.inFrame && !b.occluded)
  const target = visible.find((b) => {
    if (!FREE_FLIGHT.has(b.state)) return false
    const r = b.radius
    return b.x * width > r * height && b.x * width < width - r * height && b.y > r && b.y < 1 - r
  })
  let truePositives = 0
  let top1OnBall: boolean | null = null
  const supportTrue: number[] = []
  const supportFalse: number[] = []
  const featuresTrue: number[][] = []
  const featuresFalse: number[][] = []
  for (const c of candidates) {
    const onBall = truth.balls.some((b) => b.inFrame && distancePx(c, b, width, height) <= gatePx(b, width, height))
    if (onBall) truePositives++
    if (top1OnBall === null) top1OnBall = onBall
    if (c.supportRatio !== undefined && Number.isFinite(c.supportRatio)) (onBall ? supportTrue : supportFalse).push(c.supportRatio)
    if (c.supportRatio !== undefined && c.plainSupportRatio !== undefined && c.streakLengthNorm !== undefined && c.radiusNorm) {
      ;(onBall ? featuresTrue : featuresFalse).push([c.supportRatio, c.plainSupportRatio, c.streakLengthNorm / (2 * c.radiusNorm)])
    }
  }
  if (!target) return { target: null, matched: false, top1: false, errorPx: null, candidates: candidates.length, truePositives, top1OnBall, supportTrue, supportFalse, featuresTrue, featuresFalse }
  const gate = gatePx(target, width, height)
  const errors = candidates.map((c) => distancePx(c, target, width, height))
  const best = errors.length ? Math.min(...errors) : Infinity
  return {
    target: target.state === 'toss' ? 'toss' : 'flight',
    matched: best <= gate,
    top1: errors.length > 0 && errors[0] <= gate,
    errorPx: best <= gate ? best : null,
    candidates: candidates.length,
    truePositives,
    top1OnBall,
    supportTrue,
    supportFalse,
    featuresTrue,
    featuresFalse,
  }
}

export interface DetectionSummary {
  frames: number
  tossFrames: number
  flightFrames: number
  /** Share of visible free-flight frames with a candidate on the ball. */
  recallToss: number
  recallFlight: number
  top1RecallToss: number
  /** Candidates on a truth ball / all candidates. */
  precision: number
  /** Frames whose top candidate is on a truth ball / frames with any candidate. */
  top1Precision: number
  falsePerFrame: number
  errorMedianPx: number
  errorP95Px: number
  flightErrorMedianPx: number
  /** Support ratio percentiles: true candidates p5 / p50, false candidates p50 / p95. */
  support: { trueP5: number; trueP50: number; falseP50: number; falseP95: number; nTrue: number; nFalse: number }
  /** Raw candidate features for threshold studies: [support, plainSupport, streak / diameter]. */
  features?: { onBall: number[][]; offBall: number[][] }
}

export function summariseDetection(scores: FrameScore[]): DetectionSummary {
  const toss = scores.filter((s) => s.target === 'toss')
  const flight = scores.filter((s) => s.target === 'flight')
  const share = (list: FrameScore[], key: 'matched' | 'top1') => (list.length ? list.filter((s) => s[key]).length / list.length : Number.NaN)
  const candidates = scores.reduce((n, s) => n + s.candidates, 0)
  const truePositives = scores.reduce((n, s) => n + s.truePositives, 0)
  const tossErrors = toss.map((s) => s.errorPx).filter((e): e is number => e !== null)
  const flightErrors = flight.map((s) => s.errorPx).filter((e): e is number => e !== null)
  return {
    frames: scores.length,
    tossFrames: toss.length,
    flightFrames: flight.length,
    recallToss: share(toss, 'matched'),
    recallFlight: share(flight, 'matched'),
    top1RecallToss: share(toss, 'top1'),
    precision: candidates ? truePositives / candidates : Number.NaN,
    top1Precision: (() => {
      const withCandidates = scores.filter((s) => s.top1OnBall !== null)
      return withCandidates.length ? withCandidates.filter((s) => s.top1OnBall).length / withCandidates.length : Number.NaN
    })(),
    falsePerFrame: (candidates - truePositives) / Math.max(1, scores.length),
    errorMedianPx: median(tossErrors),
    errorP95Px: percentile(tossErrors, 95),
    flightErrorMedianPx: median(flightErrors),
    support: (() => {
      const t = scores.flatMap((s) => s.supportTrue)
      const f = scores.flatMap((s) => s.supportFalse)
      return { trueP5: percentile(t, 5), trueP50: median(t), falseP50: median(f), falseP95: percentile(f, 95), nTrue: t.length, nFalse: f.length }
    })(),
    features: { onBall: scores.flatMap((s) => s.featuresTrue), offBall: scores.flatMap((s) => s.featuresFalse) },
  }
}

// ---------- setup inputs from truth ----------

/** Truth landmarks as the pose layer would deliver them (injected). */
export function posesFromTruth(truth: TruthClip, timeOf: (frame: TruthFrame) => number): PoseFrame[] {
  return truth.frames.map((f) => ({ frameIndex: f.frameIndex, tReal: timeOf(f), landmarks: f.landmarks, score: 1, source: 'injected' as const }))
}

/** Truth court frame (x toward the net, y to the server's left) from the ball layer's court frame (x to the server's right, y along). */
function projectCourtPoint(truth: TruthClip, p: Point2): Point2 | null {
  const world = [p.y, -p.x, 0]
  const { R, t } = truth.settings.extrinsics
  const X = [0, 1, 2].map((r) => R[3 * r] * world[0] + R[3 * r + 1] * world[1] + R[3 * r + 2] * world[2] + t[r])
  if (!(X[2] > 0)) return null
  const K = truth.settings.intrinsics
  return { x: (K.fxPx * X[0]) / X[2] / K.width + K.cxPx / K.width, y: (K.fyPx * X[1]) / X[2] / K.height + K.cyPx / K.height }
}

/**
 * Simulated four-corner tap on the far service boxes (singles sidelines at the net and at the
 * far service line), with 1.5 px tap noise. Null when a corner is out of frame.
 */
export function simulatedCourtTap(truth: TruthClip, seed = 7): { imageToCourt: Mat3; rmsM: number } | null {
  const court: Point2[] = [
    { x: -COURT.singlesHalfWidthM, y: COURT.netY },
    { x: COURT.singlesHalfWidthM, y: COURT.netY },
    { x: -COURT.singlesHalfWidthM, y: COURT.farServiceLineY },
    { x: COURT.singlesHalfWidthM, y: COURT.farServiceLineY },
  ]
  const rng = createRng(seed)
  const { width, height } = truth.video
  const image: Point2[] = []
  for (const c of court) {
    const p = projectCourtPoint(truth, c)
    if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null
    image.push({ x: p.x + (1.5 * gaussian(rng)) / width, y: p.y + (1.5 * gaussian(rng)) / height })
  }
  const fit = computeHomography(image, court)
  // Four points fit exactly: carry the tap noise as a calibration term instead (1.5 px at the far line).
  return fit ? { imageToCourt: fit.H, rmsM: 0.1 } : null
}

// ---------- clip evaluation ----------

export interface ClipInput {
  truth: TruthClip
  scenario: string
  /** Decoded RGBA frames in display order. */
  frames: AsyncIterable<ImageDataLike>
  audio: { samples: Float32Array; sampleRate: number } | null
  /** The video layer proved the capture rate (false for re-timed slow motion without metadata). */
  timeBaseKnown: boolean
  /** Media frame rate of the container. */
  mediaFps: number
}

export interface ClipResult {
  clipId: string
  scenario: string
  view: CameraView
  fps: { media: number; capture: number }
  timeBaseKnown: boolean
  detection: DetectionSummary
  msPerFrame: number
  contactOnsetFromAudio: boolean
  toss: {
    found: boolean
    kind: string | null
    trackPrecision: number
    coverage: number
    status: string
    reason?: string
    apexErrorMs: number | null
    apexZ: number | null
    apexBracketed: boolean | null
    apexMethod: string | null
    releaseErrorMs: number | null
    contactErrorMs: number | null
    apexHeight: { valueM: number | null; truthM: number; errorM: number | null; covered: boolean | null; status: string }
  }
  gravity: {
    expectedFactor: number
    factor: number | null
    low: number | null
    high: number | null
    suggestion: string
    suggestedTimeScale: number | null
    reason?: string
  }
  /** Outgoing track: detected observations on the truth ball (precision) and how many. */
  outgoing: { found: boolean; detections: number; precision: number }
  speed: { status: string; lowKmh?: number; highKmh?: number; truthKmh: number; covered: boolean | null; reason?: string; detections?: number }
  averageSpeedRear: { status: string; lowKmh?: number; highKmh?: number; truthKmh: number; covered: boolean | null; reason?: string }
  bounce: { status: string; errorMs: number | null; placementErrorM: number | null; reason?: string }
  notes: string[]
}

function eventTime(truth: TruthClip, name: string): number | null {
  const e = truth.serves[0]?.events[name] as TruthEvent | undefined
  return e && typeof e.tReal === 'number' && e.inClip ? e.tReal : null
}

export async function evaluateClip(input: ClipInput): Promise<ClipResult> {
  const { truth, mediaFps } = input
  const notes: string[] = []
  const { width, height } = truth.video
  const aspect = width / height
  const timeScaleTruth = truth.video.timeScale
  // What the app would put in DecodedFrame.tReal before any correction.
  const clockScale = input.timeBaseKnown ? timeScaleTruth : 1
  const timeOf = (frameIndex: number) => (frameIndex / mediaFps) * clockScale
  const captureFps = input.timeBaseKnown ? mediaFps / timeScaleTruth : mediaFps
  const view = truth.settings.view
  const serve = truth.serves[0]
  const targetTag = (['T', 'body', 'wide'] as const).find((t) => t === serve.direction) as TargetTag | undefined

  const poses = posesFromTruth(truth, (f) => timeOf(f.frameIndex))
  const setup: BallSetup = ballSetupFromPoses(poses, { aspect, handedness: truth.player.handedness, playerHeightM: truth.player.heightM })
  notes.push(...setup.notes)

  // Audio onsets (contact timing only) in the frames' time base, when the video layer would
  // call the audio usable (it cannot tell un-flagged slow motion from real time).
  let onsets: AudioOnset[] | undefined
  const audioTiming = assessAudioTiming({ hasAudio: !!input.audio, timeScale: clockScale })
  if (input.audio && audioTiming.usable) {
    onsets = toAudioOnsets(detectOnsets(input.audio.samples, input.audio.sampleRate, { timeScale: clockScale }))
  } else if (input.audio) {
    notes.push(`audio not used: ${audioTiming.reason}`)
  }
  // Single-serve clips: the racket pop is the strongest transient; the toss band ends at the
  // contact time it implies (sound delay removed).
  const contactOnset = strongestTransient(onsets)
  const roiUntil = contactOnset ? contactOnset.tReal - soundDelayEstimateS(setup.scale, aspect) : undefined
  const detect = createBallFrameDetector({ setup, tossRoiUntilTReal: roiUntil, cameraView: truth.settings.view })
  const candidates: FrameCandidates[] = []
  const scores: FrameScore[] = []
  let index = 0
  let detectMs = 0
  for await (const image of input.frames) {
    const t = timeOf(index)
    const started = performance.now()
    const frame = detect({ index, tMedia: index / mediaFps, tReal: t, image })
    detectMs += performance.now() - started
    candidates.push(frame)
    const truthFrame = truth.frames[index]
    if (truthFrame) scores.push(scoreFrame(frame.candidates, truthFrame, width, height))
    index++
  }
  if (index !== truth.frames.length) notes.push(`decoded ${index} frames, truth has ${truth.frames.length}`)

  const pass1 = analyseBall(candidates, {
    setup,
    captureFps,
    timeBaseKnown: input.timeBaseKnown,
    cameraView: view,
    onsets,
    targetTag,
    servedFrom: serve.courtSide,
    courtCalibration: view === 'rear' ? (simulatedCourtTap(truth) ?? undefined) : undefined,
  })
  const gravityCheck = pass1.toss?.gravity
  let analysis: BallAnalysis = pass1
  // Apply the suggested slow-motion correction and re-run (as the video layer would).
  let appliedScale = 1
  if (!input.timeBaseKnown && pass1.timeBase.status === 'apply-correction' && pass1.timeBase.timeScale) {
    appliedScale = pass1.timeBase.timeScale
    const retimed = candidates.map((f) => ({ ...f, tReal: f.tReal * appliedScale }))
    analysis = analyseBall(retimed, { setup, captureFps: captureFps / appliedScale, timeBaseKnown: true, cameraView: view, targetTag, servedFrom: serve.courtSide })
    notes.push(`re-run after the suggested ${Math.round(1 / appliedScale)}x correction (candidates re-timed, not re-detected)`)
  }
  // Truth times are real seconds; analysis times are real once corrected (or known).
  const toReal = input.timeBaseKnown ? 1 : appliedScale !== 1 ? 1 : timeScaleTruth
  const err = (t: number | undefined, name: string) => {
    const truthT = eventTime(truth, name)
    return t === undefined || truthT === null ? null : (t * toReal - truthT) * 1000
  }

  // Toss track precision and coverage against truth positions.
  const tossTrack = analysis.tracker.toss
  const truthByFrame = new Map(truth.frames.map((f) => [f.frameIndex, f]))
  let trackHits = 0
  let trackDetected = 0
  const tracked = new Set<number>()
  for (const o of tossTrack?.track.observations ?? []) {
    if (o.source !== 'detected') continue
    trackDetected++
    const f = truthByFrame.get(o.frameIndex)
    const ball = f?.balls.find((b) => b.inFrame)
    if (ball && distancePx(o, ball, width, height) <= gatePx(ball, width, height)) {
      trackHits++
      tracked.add(o.frameIndex)
    }
  }
  const contactT = eventTime(truth, 'contact') ?? Infinity
  const tossVisible = truth.frames.filter(
    (f) => f.tReal < contactT && f.balls.some((b) => b.state === 'toss' && b.inFrame && !b.occluded),
  )
  const coverage = tossVisible.length ? tossVisible.filter((f) => tracked.has(f.frameIndex)).length / tossVisible.length : Number.NaN

  const outgoingDetected = (analysis.tracker.outgoing?.track.observations ?? []).filter((o) => o.source === 'detected')
  const outgoingHits = outgoingDetected.filter((o) => {
    const ball = truthByFrame.get(o.frameIndex)?.balls.find((b) => b.inFrame)
    return !!ball && distancePx(o, ball, width, height) <= gatePx(ball, width, height)
  }).length

  const toss = analysis.toss
  const heightMetric = analysis.metrics.find((m) => m.id === 'toss-apex-height')
  const truthApexHeight = Number(serve.metrics.tossApexHeightM)
  const heightValue = typeof heightMetric?.value === 'number' ? heightMetric.value : null
  const speedTruth = Number(serve.metrics.ballSpeedAtContactKmh)
  const avgTruth = Number(serve.metrics.avgSpeedContactToBouncePathKmh)
  const speed = analysis.speedFromTrack
  const avg = analysis.averageSpeedRear
  const bounceTruthT = eventTime(truth, 'bounce')
  const bounce = analysis.bounce
  const placement = analysis.placement
  const bounceTruth = { xM: Number(serve.metrics.bounceXM), yM: Number(serve.metrics.bounceYM) }
  return {
    clipId: truth.clipId,
    scenario: input.scenario,
    view,
    fps: { media: mediaFps, capture: mediaFps / timeScaleTruth },
    timeBaseKnown: input.timeBaseKnown,
    detection: summariseDetection(scores),
    msPerFrame: detectMs / Math.max(1, index),
    contactOnsetFromAudio: !!contactOnset,
    toss: {
      found: !!tossTrack,
      kind: tossTrack?.track.kind ?? null,
      trackPrecision: trackDetected ? trackHits / trackDetected : Number.NaN,
      coverage,
      status: toss?.status ?? 'no track',
      reason: toss?.reason,
      apexErrorMs: err(analysis.events.tossApex?.tReal, 'tossApex'),
      apexZ:
        analysis.events.tossApex && eventTime(truth, 'tossApex') !== null
          ? (analysis.events.tossApex.tReal * toReal - eventTime(truth, 'tossApex')!) / (analysis.events.tossApex.uncertaintyS * toReal)
          : null,
      apexBracketed: toss?.apex?.bracketed ?? null,
      apexMethod: analysis.events.tossApex?.method ?? null,
      releaseErrorMs: err(analysis.events.tossRelease?.tReal, 'tossRelease'),
      contactErrorMs: err(analysis.events.contact?.tReal, 'contact'),
      apexHeight: {
        valueM: heightValue,
        truthM: truthApexHeight,
        errorM: heightValue === null ? null : heightValue - truthApexHeight,
        covered: heightMetric?.uncertainty ? heightMetric.uncertainty.low <= truthApexHeight && heightMetric.uncertainty.high >= truthApexHeight : null,
        status: heightMetric?.status ?? 'missing',
      },
    },
    gravity: {
      expectedFactor: input.timeBaseKnown ? 1 : timeScaleTruth,
      factor: gravityCheck?.timeScaleFactor ?? null,
      low: gravityCheck?.low ?? null,
      high: gravityCheck?.high ?? null,
      suggestion: pass1.timeBase.status,
      suggestedTimeScale: pass1.timeBase.timeScale ?? null,
      reason: gravityCheck?.status === 'ok' ? undefined : gravityCheck?.reason,
    },
    outgoing: {
      found: !!analysis.tracker.outgoing,
      detections: outgoingDetected.length,
      precision: outgoingDetected.length ? outgoingHits / outgoingDetected.length : Number.NaN,
    },
    speed:
      speed.status === 'experimental'
        ? { status: speed.status, lowKmh: speed.lowKmh, highKmh: speed.highKmh, truthKmh: speedTruth, covered: speed.lowKmh <= speedTruth && speed.highKmh >= speedTruth, detections: speed.detectionsUsed }
        : { status: speed.status, truthKmh: speedTruth, covered: null, reason: speed.reason },
    averageSpeedRear:
      avg.status === 'experimental'
        ? { status: avg.status, lowKmh: avg.lowKmh, highKmh: avg.highKmh, truthKmh: avgTruth, covered: avg.lowKmh <= avgTruth && avg.highKmh >= avgTruth }
        : { status: avg.status, truthKmh: avgTruth, covered: null, reason: avg.reason },
    bounce: {
      status: bounce.status,
      errorMs: bounce.status === 'experimental' && bounceTruthT !== null ? (bounce.tReal - bounceTruthT) * 1000 : null,
      // Ball-layer court frame: x = -truth y, y = truth x.
      placementErrorM:
        placement.status === 'experimental' ? Math.hypot(placement.court.x + bounceTruth.yM, placement.court.y - bounceTruth.xM) : null,
      reason: bounce.status === 'experimental' ? (placement.status === 'experimental' ? undefined : placement.reason) : bounce.reason,
    },
    notes,
  }
}
