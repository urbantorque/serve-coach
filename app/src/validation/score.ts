/**
 * Scores one harness run (result.ts) against the clip's synthetic truth (truth.ts).
 * Pure TypeScript: the harness page calls it, and it is unit-tested in Node.
 *
 * Conventions:
 * - Pose error is in statures (BH, truthStaturePx), strict MediaPipe labels, 12 core joints
 *   (scorePoseAccuracy). A frame counts as detected when the pose layer returned landmarks.
 * - Ball detection uses the ball layer's own evaluation scorer (ball/eval/evalCore.ts):
 *   recall over visible free-flight frames, precision over all candidates, localisation error
 *   of the nearest matching candidate on toss frames.
 * - Times: a pass's tReal is converted to real seconds with truth.video.timeScale / the pass's
 *   metaTimeScale (so an uncorrected slow-motion pass is still scored in real time).
 */
import { scoreFrame, summariseDetection, type DetectionSummary, type TruthFrame } from '../analysis/ball/eval/evalCore.ts'
import { scorePoseAccuracy, type AccuracySummary } from '../analysis/pose/poseAccuracy.ts'
import { LM, type Landmark } from '../analysis/types.ts'
import type { HarnessBallPass, HarnessResult } from './result.ts'
import { truthEvent, truthStaturePx, type SynthTruth } from './truth.ts'

export type PoseScore = Pick<
  AccuracySummary,
  | 'frames'
  | 'detected'
  | 'detectionRate'
  | 'onTargetRate'
  | 'meanErrorBH'
  | 'medianErrorBH'
  | 'p90ErrorBH'
  | 'pck'
  | 'mirroredRate'
  | 'meanErrorBHMirrorTolerant'
  | 'wristWindowErrorBH'
  | 'wristWindowDetected'
  | 'wristWindowFrames'
>

export interface BallPassScore {
  label: HarnessBallPass['label']
  detection: Omit<DetectionSummary, 'features'>
  toss: {
    found: boolean
    /** Kind the tracker gave the toss track ('toss', or 'unknown' when it doubted it). */
    kind: string | null
    status: string
    reason?: string
    /** Detected toss-track observations on the truth ball / all detected ones. */
    trackPrecision: number
    /** Frames with the toss visible before contact that the toss track covers. */
    coverage: number
    apexErrorMs: number | null
    /** apexErrorMs over the reported 1-sigma. */
    apexZ: number | null
    releaseErrorMs: number | null
    /** Contact from the toss/outgoing path intersection (ball-track-intersection). */
    contactErrorMs: number | null
    apexHeight: { valueM: number | null; truthM: number; errorM: number | null; covered: boolean | null; status: string }
  }
  gravity: {
    status: string
    reason?: string
    factor: number | null
    low: number | null
    high: number | null
    /** truth timeScale / the pass's metaTimeScale. */
    expected: number
    covered: boolean | null
    suggestion: string
    suggestedTimeScale: number | null
  }
  outgoing: { found: boolean; detections: number; precision: number }
  speed: { status: string; lowKmh?: number; highKmh?: number; truthKmh: number; covered: boolean | null; reason?: string }
  /** Contact from the audio onset the ball layer used (onset minus the sound delay estimate). */
  contactFromAudioErrorMs: number | null
}

export interface AudioEventScore {
  kind: string
  arrivalTMedia: number
  /** Nearest detected onset within 30 ms (media time). */
  onset: { errorMediaMs: number; errorRealMs: number; kind: string; strength: number } | null
}

export interface AudioScore {
  status: string
  usable: boolean | null
  onsets: number
  events: AudioEventScore[]
  contact: {
    truthArrivalTMedia: number | null
    /** Nearest onset to the racket-pop arrival, any label. */
    nearestErrorMediaMs: number | null
    nearestErrorRealMs: number | null
    nearestKind: string | null
    /** The strongest non-bounce transient is the racket pop (what the ball layer relies on). */
    strongestIsContact: boolean | null
    /** At least one onset within 30 ms of the pop is labelled 'contact'. */
    labelledContact: boolean | null
  }
}

export interface HarnessScores {
  clipId: string
  frames: { truth: number; probe: number; decodedPose: number; missingPose: number; decodedBall: number; match: boolean }
  timeBase: {
    truth: { fps: number; captureFps: number; timeScale: number }
    probe: { nominalFps: number; captureFps: number; timeScale: number; status: string; kind: string }
    /** Probe timeline fps against the truth media fps, percent. */
    fpsErrorPct: number
    probeTimeScaleMatches: boolean
    final: { captureFps: number; timeScale: number; source: string; matchesTruth: boolean }
  }
  pose: { staturePx: number; raw: PoseScore; clean: PoseScore } | null
  ball: { passes: BallPassScore[]; finalPass: number } | null
  audio: AudioScore | null
}

const ms = (seconds: number) => seconds * 1000
const close = (a: number, b: number, rel = 0.01) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-9)

function rowsToLandmarks(rows: number[][] | null): Landmark[] | null {
  return rows ? rows.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null
}

function scorePose(frames: Array<{ frameIndex: number; landmarks: number[][] | null }>, truth: SynthTruth, staturePx: number): PoseScore {
  const contact = truthEvent(truth, 'contact')
  const wrist = truth.player.handedness === 'right' ? LM.RIGHT_WRIST : LM.LEFT_WRIST
  const detected = frames
    .map((f) => ({ frameIndex: f.frameIndex, landmarks: rowsToLandmarks(f.landmarks) }))
    .filter((f): f is { frameIndex: number; landmarks: Landmark[] } => f.landmarks !== null)
  const s = scorePoseAccuracy(
    detected,
    truth.frames.map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, landmarks: f.landmarks })),
    {
      frameWidth: truth.video.width,
      frameHeight: truth.video.height,
      staturePx,
      wristWindow: contact ? { wrist, startS: contact.tReal - 0.1, endS: contact.tReal + 0.1 } : undefined,
    },
  )
  return {
    frames: s.frames,
    detected: s.detected,
    detectionRate: s.detectionRate,
    onTargetRate: s.onTargetRate,
    meanErrorBH: s.meanErrorBH,
    medianErrorBH: s.medianErrorBH,
    p90ErrorBH: s.p90ErrorBH,
    pck: s.pck,
    mirroredRate: s.mirroredRate,
    meanErrorBHMirrorTolerant: s.meanErrorBHMirrorTolerant,
    wristWindowErrorBH: s.wristWindowErrorBH,
    wristWindowDetected: s.wristWindowDetected,
    wristWindowFrames: s.wristWindowFrames,
  }
}

function gatePx(ball: SynthTruth['frames'][number]['balls'][number], width: number, height: number): number {
  const rPx = ball.radius * height
  const streakPx = ball.streak ? Math.hypot((ball.streak[2] - ball.streak[0]) * width, (ball.streak[3] - ball.streak[1]) * height) : 0
  return Math.max(2 * rPx, 4) + 0.5 * streakPx
}

function onTruthBall(o: { frameIndex: number; x: number; y: number }, byFrame: Map<number, SynthTruth['frames'][number]>, width: number, height: number): boolean {
  const ball = byFrame.get(o.frameIndex)?.balls.find((b) => b.inFrame)
  return !!ball && Math.hypot((o.x - ball.x) * width, (o.y - ball.y) * height) <= gatePx(ball, width, height)
}

export function scoreBallPass(pass: HarnessBallPass, truth: SynthTruth): BallPassScore {
  const { width, height } = truth.video
  const toReal = truth.video.timeScale / pass.metaTimeScale
  const err = (t: number | null | undefined, name: string) => {
    const e = truthEvent(truth, name)
    return t === undefined || t === null || !Number.isFinite(t) || !e ? null : ms(t * toReal - e.tReal)
  }
  const byFrame = new Map(truth.frames.map((f) => [f.frameIndex, f]))
  const frameScores = pass.frames.map((f) => {
    const truthFrame = byFrame.get(f.frameIndex)
    if (!truthFrame) return null
    const candidates = f.candidates.map(([x, y, radiusNorm, , supportRatio, plainSupportRatio, streakLengthNorm]) => ({
      x,
      y,
      radiusNorm,
      supportRatio,
      plainSupportRatio,
      streakLengthNorm,
    }))
    return scoreFrame(candidates, truthFrame as TruthFrame, width, height)
  })
  const detection = summariseDetection(frameScores.filter((s): s is NonNullable<typeof s> => s !== null))
  delete detection.features

  const tossTrack = pass.tossTrack
  const tossDetected = (tossTrack?.observations ?? []).filter((o) => o.source === 'detected')
  const tossHits = tossDetected.filter((o) => onTruthBall(o, byFrame, width, height))
  const contactT = truthEvent(truth, 'contact')?.tReal ?? Infinity
  const tossVisible = truth.frames.filter((f) => f.tReal < contactT && f.balls.some((b) => b.state === 'toss' && b.inFrame && !b.occluded))
  const covered = new Set(tossHits.map((o) => o.frameIndex))

  const outgoing = pass.outgoingTrack
  const outgoingDetected = (outgoing?.observations ?? []).filter((o) => o.source === 'detected')

  const apex = pass.events.tossApex
  const apexTruth = truthEvent(truth, 'tossApex')
  const serve = truth.serves[0]
  const heightMetric = pass.metrics.find((m) => m.id === 'toss-apex-height')
  const truthApexHeight = Number(serve?.metrics.tossApexHeightM)
  const heightValue = typeof heightMetric?.value === 'number' ? heightMetric.value : null
  const gravity = pass.toss?.gravity
  const expected = truth.video.timeScale / pass.metaTimeScale
  const speedTruth = Number(serve?.metrics.ballSpeedAtContactKmh)
  const speed = pass.speedFromTrack
  return {
    label: pass.label,
    detection,
    toss: {
      found: !!tossTrack,
      kind: tossTrack?.kind ?? null,
      status: pass.toss?.status ?? 'no track',
      reason: pass.toss?.reason,
      trackPrecision: tossDetected.length ? tossHits.length / tossDetected.length : Number.NaN,
      coverage: tossVisible.length ? tossVisible.filter((f) => covered.has(f.frameIndex)).length / tossVisible.length : Number.NaN,
      apexErrorMs: err(apex?.tReal, 'tossApex'),
      apexZ: apex && apexTruth && apex.uncertaintyS > 0 ? (apex.tReal * toReal - apexTruth.tReal) / (apex.uncertaintyS * toReal) : null,
      releaseErrorMs: err(pass.events.tossRelease?.tReal, 'tossRelease'),
      contactErrorMs: err(pass.events.contact?.tReal, 'contact'),
      apexHeight: {
        valueM: heightValue,
        truthM: truthApexHeight,
        errorM: heightValue === null ? null : heightValue - truthApexHeight,
        covered: heightMetric?.uncertainty ? heightMetric.uncertainty.low <= truthApexHeight && heightMetric.uncertainty.high >= truthApexHeight : null,
        status: heightMetric?.status ?? 'missing',
      },
    },
    gravity: {
      status: gravity?.status ?? 'no toss',
      reason: gravity?.status === 'ok' ? undefined : (gravity?.reason ?? pass.timeBase.basis),
      factor: gravity?.timeScaleFactor ?? null,
      low: gravity?.low ?? null,
      high: gravity?.high ?? null,
      expected,
      covered: gravity?.low !== undefined && gravity.high !== undefined ? gravity.low <= expected && gravity.high >= expected : null,
      suggestion: pass.timeBase.status,
      suggestedTimeScale: pass.timeBase.timeScale ?? null,
    },
    outgoing: {
      found: !!outgoing,
      detections: outgoingDetected.length,
      precision: outgoingDetected.length ? outgoingDetected.filter((o) => onTruthBall(o, byFrame, width, height)).length / outgoingDetected.length : Number.NaN,
    },
    speed:
      speed.status === 'experimental'
        ? { status: speed.status, lowKmh: speed.lowKmh, highKmh: speed.highKmh, truthKmh: speedTruth, covered: speed.lowKmh <= speedTruth && speed.highKmh >= speedTruth }
        : { status: speed.status, truthKmh: speedTruth, covered: null, reason: speed.reason },
    contactFromAudioErrorMs: err(pass.contactFromAudioTReal, 'contact'),
  }
}

const ONSET_MATCH_S = 0.03

export function scoreAudio(result: Pick<HarnessResult, 'audio'>, truth: SynthTruth): AudioScore | null {
  const audio = result.audio
  if (!audio) return null
  const onsets = audio.onsets
  const scale = truth.video.timeScale
  const nearest = (tMedia: number, within = ONSET_MATCH_S) => {
    let best: (typeof onsets)[number] | null = null
    for (const o of onsets) if (Math.abs(o.tMedia - tMedia) <= within && (!best || Math.abs(o.tMedia - tMedia) < Math.abs(best.tMedia - tMedia))) best = o
    return best
  }
  const inClip = (truth.audio?.events ?? []).filter((e) => e.arrivalTMedia >= 0 && e.arrivalTMedia <= (truth.video.durationMediaS ?? truth.video.frameCount / truth.video.fps))
  const events: AudioEventScore[] = inClip.map((e) => {
    const o = nearest(e.arrivalTMedia)
    return {
      kind: e.kind,
      arrivalTMedia: e.arrivalTMedia,
      onset: o ? { errorMediaMs: ms(o.tMedia - e.arrivalTMedia), errorRealMs: ms((o.tMedia - e.arrivalTMedia) * scale), kind: o.kind, strength: o.strength } : null,
    }
  })
  const pop = inClip.find((e) => e.kind === 'contact') ?? null
  const popOnset = pop ? nearest(pop.arrivalTMedia) : null
  const strongest = [...onsets].filter((o) => o.kind !== 'bounce').sort((a, b) => b.strength - a.strength)[0]
  return {
    status: audio.status,
    usable: audio.timing?.usable ?? null,
    onsets: onsets.length,
    events,
    contact: {
      truthArrivalTMedia: pop?.arrivalTMedia ?? null,
      nearestErrorMediaMs: pop && popOnset ? ms(popOnset.tMedia - pop.arrivalTMedia) : null,
      nearestErrorRealMs: pop && popOnset ? ms((popOnset.tMedia - pop.arrivalTMedia) * scale) : null,
      nearestKind: popOnset?.kind ?? null,
      strongestIsContact: pop && strongest ? Math.abs(strongest.tMedia - pop.arrivalTMedia) <= ONSET_MATCH_S : pop ? false : null,
      labelledContact: pop ? onsets.some((o) => o.kind === 'contact' && Math.abs(o.tMedia - pop.arrivalTMedia) <= ONSET_MATCH_S) : null,
    },
  }
}

export function scoreHarnessRun(result: HarnessResult, truth: SynthTruth): HarnessScores {
  const staturePx = truthStaturePx(truth)
  const probe = result.meta?.probe
  const final = result.meta?.final
  const decodedPose = result.pose?.frames.length ?? 0
  const decodedBall = result.ball?.passes[0]?.frames.length ?? 0
  return {
    clipId: truth.clipId,
    frames: {
      truth: truth.video.frameCount,
      probe: probe?.frameCount ?? 0,
      decodedPose,
      missingPose: result.meta?.decode.pose?.missingIndices.length ?? 0,
      decodedBall,
      match: probe?.frameCount === truth.video.frameCount && decodedPose === truth.video.frameCount && decodedBall === truth.video.frameCount,
    },
    timeBase: {
      truth: { fps: truth.video.fps, captureFps: truth.video.captureFps, timeScale: truth.video.timeScale },
      probe: {
        nominalFps: probe?.nominalFps ?? Number.NaN,
        captureFps: probe?.captureFps ?? Number.NaN,
        timeScale: probe?.timeScale ?? Number.NaN,
        status: result.meta?.timeBase.status ?? 'missing',
        kind: result.meta?.timeBase.kind ?? 'missing',
      },
      fpsErrorPct: probe ? (100 * (probe.nominalFps - truth.video.fps)) / truth.video.fps : Number.NaN,
      probeTimeScaleMatches: !!probe && close(probe.timeScale, truth.video.timeScale),
      final: {
        captureFps: final?.captureFps ?? Number.NaN,
        timeScale: final?.timeScale ?? Number.NaN,
        source: final?.fpsSource ?? 'missing',
        matchesTruth: !!final && close(final.timeScale, truth.video.timeScale) && close(final.captureFps, truth.video.captureFps),
      },
    },
    pose: result.pose
      ? { staturePx, raw: scorePose(result.pose.frames, truth, staturePx), clean: scorePose(result.pose.clean.frames, truth, staturePx) }
      : null,
    ball: result.ball ? { passes: result.ball.passes.map((p) => scoreBallPass(p, truth)), finalPass: result.ball.finalPass } : null,
    audio: scoreAudio(result, truth),
  }
}
