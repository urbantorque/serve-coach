/**
 * Dev-only validation harness (validation.html, `npm run dev`).
 *
 *   /validation.html?clip=<url>[&truth=<url>][&view=side|rear|front45][&heightM=1.8][&hand=right|left]
 *                   [&tag=T|body|wide][&side=deuce|ad][&model=full|lite][&delegate=auto|GPU|CPU]
 *                   [&roi=auto|off][&numPoses=2][&maxFrames=N]
 *
 * Runs the app's own engine on one clip, in the order the app would:
 *   probe -> audio onsets -> decode + MediaPipe pose (full model, ROI auto) -> pose cleaning
 *   -> ball detection -> tracking / toss / gravity time-scale check -> (slow motion: apply
 *   the suggested time scale and re-run ball detection) -> optional scoring against truth.
 * The result is exposed as window.__harnessResult (see result.ts) for tools/validate/smoke.mjs.
 *
 * Inputs a player would enter in the app (camera view, height, hand, target tag, court side)
 * come from URL parameters, else from the truth file (stand-ins, recorded in result.inputs),
 * else defaults. The synthetic corpus is served by the dev-only middleware in
 * vite/syntheticCorpus.ts under /__synthetic/.
 */
import {
  analyseBall,
  ballSetupFromPoses,
  createBallFrameDetector,
  soundDelayEstimateS,
  strongestTransient,
  type BallAnalysis,
  type BallCandidate,
  type TargetTag,
} from '../analysis/ball/index.ts'
import type { FrameCandidates } from '../analysis/ball/tracker.ts'
import { cleanPoseFrames, MediaPipePoseSource, type MediaPipePoseSourceOptions } from '../analysis/pose/index.ts'
import type { PoseInputFrame } from '../analysis/pose/poseSource.ts'
import type { AudioOnset, BallTrack, CameraView, Handedness, Landmark, PoseFrame, VideoMeta } from '../analysis/types.ts'
import {
  applyTimeScale,
  assessAudioTiming,
  blobSource,
  decodeAudioFileData,
  decodeAudioTrack,
  detectOnsets,
  hasAudioDecoder,
  openFrameSource,
  probeVideo,
  toAudioOnsets,
  type DecodedAudio,
  type DecodeStats,
  type FrameSource,
  type OnsetDetail,
  type ProbeResult,
} from '../analysis/video/index.ts'
import './harness.css'
import {
  HARNESS_RESULT_VERSION,
  type CandidateRow,
  type DecodeSummary,
  type HarnessAudio,
  type HarnessBallPass,
  type HarnessPoseFrame,
  type HarnessResult,
  type HarnessTrack,
  type StageTimings,
} from './result.ts'
import { scoreHarnessRun, type HarnessScores } from './score.ts'
import { isSynthTruth, playerInputsFromTruth, type PlayerInputs, type SynthTruth } from './truth.ts'

declare global {
  interface Window {
    __harnessResult?: HarnessResult
    __harnessStatus?: { stage: string; frame?: number; total?: number }
  }
}

const round = (v: number, digits = 5) => (Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : v)
const now = () => performance.now()

// ---------- page ----------

const root = document.getElementById('harness') ?? document.body
const statusLine = document.createElement('p')
statusLine.className = 'status'
statusLine.setAttribute('role', 'status')
statusLine.setAttribute('aria-live', 'polite')

let lastStatusPaint = 0
function setStatus(stage: string, frame?: number, total?: number): void {
  window.__harnessStatus = { stage, frame, total }
  const t = now()
  if (frame !== undefined && t - lastStatusPaint < 250) return
  lastStatusPaint = t
  // Stage names stay stable for tools/validate/smoke.mjs (it waits for 'Pose'); the page shows them as in-progress.
  statusLine.textContent = frame !== undefined && total ? `${stage}: frame ${frame + 1} of ${total}…` : `${stage}…`
}

// ---------- inputs ----------

const VIEWS: readonly CameraView[] = ['side', 'rear', 'front45', 'unknown']
const TAGS: readonly TargetTag[] = ['T', 'body', 'wide']

function resolveInputs(params: URLSearchParams, truth: SynthTruth | null): HarnessResult['inputs'] {
  const fromTruth = truth ? playerInputsFromTruth(truth) : null
  const source = {} as HarnessResult['inputs']['source']
  function pick<K extends keyof PlayerInputs>(key: K, param: PlayerInputs[K] | undefined, fallback: PlayerInputs[K]): PlayerInputs[K] {
    if (param !== undefined) {
      source[key] = 'param'
      return param
    }
    if (fromTruth && fromTruth[key] !== null) {
      source[key] = 'truth'
      return fromTruth[key]
    }
    source[key] = 'default'
    return fallback
  }
  const view = params.get('view')
  const height = Number(params.get('heightM'))
  const hand = params.get('hand')
  const tag = params.get('tag')
  const side = params.get('side')
  return {
    view: pick('view', VIEWS.includes(view as CameraView) ? (view as CameraView) : undefined, 'unknown'),
    playerHeightM: pick('playerHeightM', height > 0 ? height : undefined, null),
    handedness: pick('handedness', hand === 'right' || hand === 'left' ? (hand as Handedness) : undefined, null),
    targetTag: pick('targetTag', TAGS.includes(tag as TargetTag) ? (tag as TargetTag) : undefined, null),
    servedFrom: pick('servedFrom', side === 'deuce' || side === 'ad' ? side : undefined, null),
    source,
  }
}

function poseOptions(params: URLSearchParams): MediaPipePoseSourceOptions {
  const model = params.get('model')
  const delegate = params.get('delegate')
  const roi = params.get('roi')
  const numPoses = Number(params.get('numPoses'))
  const worker = params.get('worker')
  return {
    model: model === 'lite' ? 'lite' : 'full',
    delegate: delegate === 'GPU' || delegate === 'CPU' ? delegate : 'auto',
    roi: roi === 'off' ? 'off' : 'auto',
    numPoses: numPoses > 0 ? numPoses : undefined,
    useWorker: worker === 'on' ? true : worker === 'off' ? false : 'auto',
  }
}

// ---------- stages ----------

function decodeSummary(stats: DecodeStats | null): DecodeSummary | null {
  return stats
    ? {
        path: stats.path,
        requested: stats.requested,
        yielded: stats.yielded,
        missingIndices: [...stats.missingIndices],
        samplesFed: stats.samplesFed,
        elapsedMs: round(stats.elapsedMs, 1),
        notes: [...stats.notes],
      }
    : null
}

async function decodeAudio(blob: Blob, probe: ProbeResult | undefined): Promise<DecodedAudio> {
  if (probe?.audio && hasAudioDecoder()) {
    try {
      return await decodeAudioTrack(probe.audio, blobSource(blob))
    } catch {
      // Fall through to the Web Audio path (e.g. a codec AudioDecoder rejects).
    }
  }
  return decodeAudioFileData(await blob.arrayBuffer())
}

function toHarnessOnsets(details: readonly OnsetDetail[]): HarnessAudio['onsets'] {
  return details.map((o) => ({
    tMedia: round(o.tMedia, 6),
    tReal: round(o.tReal, 6),
    strength: round(o.strength, 2),
    sharpness: round(o.sharpness, 3),
    kind: o.kind,
    riseTimeMs: round(o.riseTimeMs, 3),
    hfRatio: round(o.hfRatio, 3),
    peakDbfs: round(o.peakDbfs, 2),
  }))
}

const landmarkRows = (landmarks: readonly Landmark[] | null) =>
  landmarks ? landmarks.map((l) => [round(l.x), round(l.y), round(l.z ?? 0), round(l.visibility, 3)]) : null

interface PosePassOutput {
  raw: PoseFrame[]
  frames: HarnessPoseFrame[]
  stats: unknown
  decode: DecodeStats | null
  decodeMs: number
  wallMs: number
  initMs: number
}

async function runPose(frameSource: FrameSource, options: MediaPipePoseSourceOptions, maxFrames: number): Promise<PosePassOutput> {
  const source = new MediaPipePoseSource(options)
  const total = Math.min(frameSource.meta.frameCount, maxFrames)
  try {
    setStatus('Loading MediaPipe pose model')
    const initStarted = now()
    await source.init()
    const initMs = now() - initStarted
    let decode: DecodeStats | null = null
    let decodeMs = 0
    const selection = Number.isFinite(maxFrames) ? { startIndex: 0, endIndex: maxFrames - 1 } : {}
    async function* inputs(): AsyncGenerator<PoseInputFrame> {
      const iterator = frameSource.bitmaps(selection, { onStats: (s) => (decode = s) })[Symbol.asyncIterator]()
      let previous: ImageBitmap | null = null
      try {
        for (;;) {
          const started = now()
          const next = await iterator.next()
          decodeMs += now() - started
          if (next.done) break
          // The pose source has copied (or cropped) the previous bitmap before asking for this one.
          previous?.close()
          previous = next.value.bitmap
          yield { frameIndex: next.value.index, tReal: next.value.tReal, image: next.value.bitmap }
        }
      } finally {
        previous?.close()
        await iterator.return?.(undefined)
      }
    }
    const raw: PoseFrame[] = []
    const started = now()
    for await (const frame of source.estimate(inputs())) {
      raw.push(frame)
      setStatus('Pose', raw.length - 1, total)
    }
    const wallMs = now() - started
    const decisions = new Map(source.trackDecisions().map((d) => [d.frameIndex, d]))
    const trace = new Map(source.roiTrace().map((e) => [e.frameIndex, e]))
    const frames: HarnessPoseFrame[] = raw.map((f) => {
      const d = decisions.get(f.frameIndex)
      const r = trace.get(f.frameIndex)
      return {
        frameIndex: f.frameIndex,
        tReal: round(f.tReal, 6),
        score: round(f.score, 3),
        landmarks: landmarkRows(f.landmarks),
        track: d ? { index: d.index, reason: d.reason, confidence: round(d.confidence, 3), candidates: d.candidates } : null,
        crop: r?.crop ? { x: r.crop.x, y: r.crop.y, width: r.crop.width, height: r.crop.height } : null,
        localised: r?.localised ?? false,
        skipped: r?.skipped ?? false,
      }
    })
    return { raw, frames, stats: JSON.parse(JSON.stringify(source.stats())), decode, decodeMs, wallMs, initMs }
  } finally {
    // Disposing closes the landmarkers, which is when tasks-vision flushes its usage log:
    // the CSP must block that request (see validation/results/smoke/SUMMARY.md, privacy).
    await source.dispose()
  }
}

function toHarnessTrack(t: BallTrack): HarnessTrack {
  return {
    id: t.id,
    kind: t.kind,
    observations: t.observations.map((o) => ({
      frameIndex: o.frameIndex,
      tReal: round(o.tReal, 6),
      x: round(o.x, 6),
      y: round(o.y, 6),
      radius: round(o.radius, 6),
      score: round(o.score, 4),
      source: o.source,
    })),
  }
}

interface BallPassInput {
  label: HarnessBallPass['label']
  frameSource: FrameSource
  poses: PoseFrame[]
  onsets: AudioOnset[] | undefined
  timeBaseKnown: boolean
  inputs: PlayerInputs
  maxFrames: number
}

interface BallPassOutput {
  pass: HarnessBallPass
  decode: DecodeStats | null
  wallMs: number
  decodeMs: number
  detectMs: number
  analyseMs: number
}

async function runBallPass(input: BallPassInput): Promise<BallPassOutput> {
  const { frameSource, inputs } = input
  const meta = frameSource.meta
  const aspect = meta.width / meta.height
  const setup = ballSetupFromPoses(input.poses, {
    aspect,
    handedness: inputs.handedness ?? undefined,
    playerHeightM: inputs.playerHeightM,
  })
  // Single-serve clips: the racket pop is the strongest transient; the toss band ends at the
  // contact time it implies (sound delay removed), as in the ball layer's evaluation.
  const firstOnset = strongestTransient(input.onsets)
  const tossRoiUntilTReal = firstOnset ? firstOnset.tReal - soundDelayEstimateS(setup.scale, aspect) : undefined
  const detect = createBallFrameDetector({ setup, tossRoiUntilTReal, cameraView: inputs.view })
  const selection = Number.isFinite(input.maxFrames) ? { startIndex: 0, endIndex: input.maxFrames - 1 } : {}
  const total = Math.min(meta.frameCount, input.maxFrames)
  let decode: DecodeStats | null = null
  let decodeMs = 0
  let detectMs = 0
  const candidates: FrameCandidates[] = []
  const started = now()
  const iterator = frameSource.frames(selection, { onStats: (s) => (decode = s) })[Symbol.asyncIterator]()
  try {
    for (;;) {
      const t0 = now()
      const next = await iterator.next()
      decodeMs += now() - t0
      if (next.done) break
      const t1 = now()
      candidates.push(detect(next.value))
      detectMs += now() - t1
      setStatus(input.label === 'initial' ? 'Ball detection' : 'Ball detection (time-scale corrected)', candidates.length - 1, total)
    }
  } finally {
    await iterator.return?.(undefined)
  }
  const wallMs = now() - started

  setStatus('Ball tracking and toss analysis')
  const analyseStarted = now()
  const analysis: BallAnalysis = analyseBall(candidates, {
    setup,
    captureFps: meta.captureFps,
    timeBaseKnown: input.timeBaseKnown,
    cameraView: inputs.view,
    onsets: input.onsets,
    targetTag: inputs.targetTag,
    servedFrom: inputs.servedFrom ?? undefined,
  })
  const analyseMs = now() - analyseStarted
  // The onset analyseBall times contact with (it searches 0.05-1.0 s after the apex).
  const apexT = analysis.toss?.status === 'ok' ? analysis.toss.apex?.tReal : undefined
  const contactOnset = apexT !== undefined ? strongestTransient(input.onsets, apexT + 0.05, apexT + 1.0) : undefined
  const pass: HarnessBallPass = {
    label: input.label,
    metaTimeScale: meta.timeScale,
    captureFps: meta.captureFps,
    timeBaseKnown: input.timeBaseKnown,
    tossRoiUntilTReal: tossRoiUntilTReal ?? null,
    audioUsed: !!input.onsets,
    contactOnset: contactOnset ? { tReal: round(contactOnset.tReal, 6), kind: contactOnset.kind, strength: round(contactOnset.strength, 2) } : null,
    contactFromAudioTReal: contactOnset ? contactOnset.tReal - soundDelayEstimateS(setup.scale, aspect) : null,
    frames: candidates.map((f) => ({
      frameIndex: f.frameIndex,
      tReal: round(f.tReal, 6),
      candidates: f.candidates.map((c) => {
        // The detector's candidates carry the full BallCandidate fields (the tracker's type is narrower).
        const full = c as Partial<BallCandidate> & { x: number; y: number }
        const row: CandidateRow = [
          round(full.x, 6),
          round(full.y, 6),
          round(full.radiusNorm ?? Number.NaN, 6),
          round(full.score ?? Number.NaN, 4),
          round(full.supportRatio ?? Number.NaN, 3),
          round(full.plainSupportRatio ?? Number.NaN, 3),
          round(full.streakLengthNorm ?? Number.NaN, 6),
        ]
        return row
      }),
    })),
    setup: {
      expectedRadiusNorm: setup.expectedRadiusNorm ?? null,
      tossRoi: setup.tossRoi,
      scale: setup.scale,
      body: setup.body,
      notes: setup.notes,
    },
    tracks: analysis.tracks.map(toHarnessTrack),
    tossTrack: analysis.tracker.toss ? toHarnessTrack(analysis.tracker.toss.track) : null,
    outgoingTrack: analysis.tracker.outgoing ? toHarnessTrack(analysis.tracker.outgoing.track) : null,
    toss: analysis.toss,
    events: analysis.events,
    timeBase: analysis.timeBase,
    speedFromTrack: analysis.speedFromTrack,
    averageSpeedRear: analysis.averageSpeedRear,
    bounce: analysis.bounce,
    placement: analysis.placement,
    metrics: analysis.metrics,
  }
  return { pass: JSON.parse(JSON.stringify(pass)) as HarnessBallPass, decode, wallMs, decodeMs, detectMs, analyseMs }
}

// ---------- run ----------

function emptyTimings(): StageTimings {
  return {
    fetchMs: 0,
    probeMs: 0,
    audioDecodeMs: 0,
    onsetsMs: 0,
    poseInitMs: 0,
    posePassMs: 0,
    poseDecodeMs: 0,
    poseCleanMs: 0,
    ballPassMs: 0,
    ballDecodeMs: 0,
    ballDetectMs: 0,
    ballAnalyseMs: 0,
    scoreMs: 0,
    totalMs: 0,
  }
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response
}

export async function runHarness(params: URLSearchParams): Promise<HarnessResult> {
  const clipUrl = params.get('clip') ?? ''
  const truthUrl = params.get('truth')
  const maxFrames = Number(params.get('maxFrames')) > 0 ? Number(params.get('maxFrames')) : Infinity
  const timings = emptyTimings()
  const cspViolations: HarnessResult['cspViolations'] = []
  const onViolation = (e: SecurityPolicyViolationEvent) =>
    cspViolations.push({ blockedURI: e.blockedURI, violatedDirective: e.violatedDirective, sourceFile: e.sourceFile })
  document.addEventListener('securitypolicyviolation', onViolation)
  const result: HarnessResult = {
    version: HARNESS_RESULT_VERSION,
    ok: false,
    clipUrl,
    truthUrl,
    startedAt: new Date().toISOString(),
    environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, devicePixelRatio },
    inputs: resolveInputs(params, null),
    meta: null,
    pose: null,
    audio: null,
    ball: null,
    timings,
    scores: null,
    cspViolations,
    notes: [],
  }
  const runStarted = now()
  let stage = 'fetch'
  let frameSource: FrameSource | null = null
  try {
    if (!clipUrl) throw new Error('no ?clip= given')
    setStatus('Fetching clip')
    let started = now()
    const [blob, truthJson] = await Promise.all([
      fetchOk(clipUrl).then((r) => r.blob()),
      truthUrl ? fetchOk(truthUrl).then((r) => r.json() as Promise<unknown>) : Promise.resolve(null),
    ])
    timings.fetchMs = now() - started
    let truth: SynthTruth | null = null
    if (truthJson !== null) {
      if (!isSynthTruth(truthJson)) throw new Error('truth file is not serve-synth-truth/1')
      truth = truthJson
    }
    result.inputs = resolveInputs(params, truth)
    const inputs = result.inputs
    const fileName = clipUrl.split('/').pop() ?? 'clip'

    stage = 'probe'
    setStatus('Probing container')
    started = now()
    let probe: ProbeResult | undefined
    try {
      probe = await probeVideo(blob)
    } catch (error) {
      // WebM and other non-MP4 containers go to the media-element path without a probe.
      result.notes.push(`probe: ${error instanceof Error ? error.message : String(error)}`)
    }
    timings.probeMs = now() - started
    stage = 'open-decoder'
    frameSource = await openFrameSource(blob, { fileName, probe })
    const probeMeta = frameSource.meta
    const timeBase = probe?.timeBase
    result.meta = {
      probe: probeMeta,
      final: probeMeta,
      timeBase: timeBase
        ? {
            kind: timeBase.kind,
            status: timeBase.status,
            captureFps: timeBase.captureFps,
            timeScale: timeBase.timeScale,
            fpsSource: timeBase.fpsSource,
            evidence: timeBase.evidence,
            warnings: timeBase.warnings,
          }
        : { kind: 'unknown', status: 'unknown', captureFps: probeMeta.captureFps, timeScale: probeMeta.timeScale, fpsSource: probeMeta.fpsSource, evidence: [], warnings: ['no container probe'] },
      decodePath: frameSource.path,
      decodePathReason: frameSource.pathReason,
      container: probe?.container ?? 'unknown',
      codec: probeMeta.codec,
      probeWarnings: probe?.warnings ?? [],
      decode: { pose: null, ball: [] },
    }

    stage = 'audio'
    const timing = assessAudioTiming(probeMeta)
    const audio: HarnessAudio = { status: 'no-audio', timing, onsets: [] }
    let onsets: AudioOnset[] | undefined
    if (probeMeta.hasAudio || probe?.audio) {
      setStatus('Decoding audio')
      try {
        started = now()
        const decoded = await decodeAudio(blob, probe)
        timings.audioDecodeMs = now() - started
        started = now()
        const details = detectOnsets(decoded.samples, decoded.sampleRate, {
          offsetS: decoded.startTimeS,
          timeScale: probeMeta.timeScale,
          labelKinds: timing.usable,
        })
        timings.onsetsMs = now() - started
        Object.assign(audio, {
          status: 'ok',
          decodeMethod: decoded.method,
          sampleRate: decoded.sampleRate,
          durationS: round(decoded.samples.length / decoded.sampleRate, 4),
          startTimeS: decoded.startTimeS,
          onsets: toHarnessOnsets(details),
        })
        // The app uses audio for contact timing only when the time base allows it.
        if (timing.usable) onsets = toAudioOnsets(details)
      } catch (error) {
        audio.status = 'failed'
        audio.reason = error instanceof Error ? error.message : String(error)
      }
    } else {
      audio.reason = timing.reason
    }
    result.audio = audio

    stage = 'pose'
    const pose = await runPose(frameSource, poseOptions(params), maxFrames)
    timings.poseInitMs = pose.initMs
    timings.posePassMs = pose.wallMs
    timings.poseDecodeMs = pose.decodeMs
    result.meta.decode.pose = decodeSummary(pose.decode)
    stage = 'pose-clean'
    started = now()
    const frameAspect = probeMeta.width / probeMeta.height
    let clean = cleanPoseFrames(pose.raw, { frameAspect })
    timings.poseCleanMs = now() - started
    result.pose = {
      options: { ...poseOptions(params) },
      stats: pose.stats,
      frames: pose.frames,
      clean: {
        report: JSON.parse(JSON.stringify(clean.report)),
        frames: clean.frames.map((f) => ({ frameIndex: f.frameIndex, tReal: round(f.tReal, 6), landmarks: landmarkRows(f.landmarks) })),
      },
    }

    stage = 'ball'
    const timeBaseKnown = timeBase?.status === 'proven'
    const passes: BallPassOutput[] = []
    passes.push(await runBallPass({ label: 'initial', frameSource, poses: clean.frames, onsets, timeBaseKnown, inputs, maxFrames }))
    const suggestion = passes[0].pass.timeBase
    if (!timeBaseKnown && suggestion.status === 'apply-correction' && suggestion.timeScale) {
      // The physics check says the timestamps are slow motion: correct the time base the way
      // the video layer documents (applyTimeScale with source 'physics') and re-run.
      stage = 'ball-corrected'
      const scale = suggestion.timeScale
      const corrected: VideoMeta = applyTimeScale(probeMeta, probeMeta.nominalFps / scale, scale, 'physics')
      frameSource.setMeta(corrected)
      result.meta.final = corrected
      clean = cleanPoseFrames(pose.raw.map((f) => ({ ...f, tReal: f.tReal * scale })), { frameAspect })
      // Time-scaled audio is not used for timing (assessAudioTiming).
      const correctedTiming = assessAudioTiming(corrected)
      if (!correctedTiming.usable) result.notes.push(`after the time-scale correction audio is not used: ${correctedTiming.reason}`)
      passes.push(
        await runBallPass({
          label: 'after-time-scale-correction',
          frameSource,
          poses: clean.frames,
          onsets: correctedTiming.usable ? onsets : undefined,
          timeBaseKnown: true,
          inputs,
          maxFrames,
        }),
      )
      result.notes.push(`time base corrected by the gravity check: x${scale} (capture ${corrected.captureFps.toFixed(1)} fps); ball detection re-run on corrected timestamps; poses re-timed and re-cleaned, not re-inferred`)
    }
    for (const p of passes) {
      timings.ballPassMs += p.wallMs
      timings.ballDecodeMs += p.decodeMs
      timings.ballDetectMs += p.detectMs
      timings.ballAnalyseMs += p.analyseMs
      result.meta.decode.ball.push(decodeSummary(p.decode)!)
    }
    result.ball = { passes: passes.map((p) => p.pass), finalPass: passes.length - 1 }

    if (truth) {
      stage = 'score'
      setStatus('Scoring against truth')
      started = now()
      result.scores = scoreHarnessRun(result, truth)
      timings.scoreMs = now() - started
    }
    result.ok = true
  } catch (error) {
    result.ok = false
    result.failedStage = stage
    result.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  } finally {
    frameSource?.close()
    timings.totalMs = now() - runStarted
    // Give the pose worker's (blocked) telemetry flush a moment to surface as a violation.
    await new Promise((resolve) => setTimeout(resolve, 250))
    document.removeEventListener('securitypolicyviolation', onViolation)
  }
  return result
}

// ---------- rendering ----------

const fmt = (v: number | null | undefined, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '–')
const pct = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(100 * v)}%` : '–')

function summaryRows(result: HarnessResult): Array<[string, string]> {
  const s = result.scores as HarnessScores | null
  const m = result.meta
  const t = result.timings
  const finalPass = result.ball?.passes[result.ball.finalPass]
  const rows: Array<[string, string]> = [
    ['Decode path', m ? `${m.decodePath} (${m.decodePathReason})` : '–'],
    ['Frames', m ? `${result.pose?.frames.length ?? 0} decoded, ${m.probe.frameCount} in container${s ? `, ${s.frames.truth} in truth` : ''}` : '–'],
    ['Frame rate', m ? `${fmt(m.probe.nominalFps, 2)} fps timeline, time base ${m.timeBase.status}; final ${fmt(m.final.captureFps, 1)} fps capture, time scale ${m.final.timeScale}` : '–'],
    ['Gravity check', finalPass?.toss?.gravity ? `${fmt(result.ball?.passes[0].toss?.gravity.timeScaleFactor, 3)} (${result.ball?.passes[0].timeBase.status})` : '–'],
    ['Audio', result.audio ? `${result.audio.status}, ${result.audio.onsets.length} onsets${result.audio.timing.usable ? '' : ' (not used for timing)'}` : '–'],
  ]
  if (s?.pose) rows.push(['Pose', `detected ${pct(s.pose.raw.detectionRate)}, median error ${fmt(s.pose.raw.medianErrorBH, 3)} statures`])
  const b = s?.ball?.passes[s.ball.finalPass]
  if (b) {
    rows.push(['Ball', `toss recall ${pct(b.detection.recallToss)}, precision ${pct(b.detection.precision)}, median error ${fmt(b.detection.errorMedianPx, 2)} px`])
    rows.push(['Toss apex', `error ${fmt(b.toss.apexErrorMs, 2)} ms`])
  }
  if (s?.audio) rows.push(['Audio contact onset', `error ${fmt(s.audio.contact.nearestErrorMediaMs, 2)} ms (label ${s.audio.contact.nearestKind ?? '–'})`])
  rows.push(['Time', `total ${fmt(t.totalMs / 1000, 1)} s; pose ${fmt(t.posePassMs / 1000, 1)} s; ball ${fmt(t.ballPassMs / 1000, 1)} s`])
  rows.push(['CSP violations', String(result.cspViolations.length)])
  return rows
}

function renderResult(result: HarnessResult): void {
  statusLine.textContent = result.ok ? 'Done. The full result is in window.__harnessResult.' : `Failed at ${result.failedStage}: ${result.error}`
  statusLine.dataset.state = result.ok ? 'done' : 'failed'
  const table = document.createElement('dl')
  table.className = 'summary'
  for (const [label, value] of summaryRows(result)) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    table.append(dt, dd)
  }
  root.append(table)
}

async function renderIndex(): Promise<void> {
  statusLine.textContent = 'Add ?clip=<url>&truth=<url> to run, or pick a corpus clip below.'
  try {
    const manifest = (await fetchOk('/__synthetic/manifest.json').then((r) => r.json())) as {
      clips: Array<{ id: string; description: string; files: { mp4?: string; truth?: string } }>
    }
    const list = document.createElement('ul')
    list.className = 'clips'
    for (const clip of manifest.clips) {
      if (!clip.files.mp4) continue
      const item = document.createElement('li')
      const link = document.createElement('a')
      const query = new URLSearchParams({ clip: `/__synthetic/${clip.files.mp4}` })
      if (clip.files.truth) query.set('truth', `/__synthetic/${clip.files.truth}`)
      link.href = `?${query}`
      link.textContent = clip.id
      link.translate = false
      const note = document.createElement('span')
      note.textContent = ` ${clip.description}`
      item.append(link, note)
      list.append(item)
    }
    root.append(list)
  } catch (error) {
    const p = document.createElement('p')
    p.textContent = `No synthetic corpus on this server (${error instanceof Error ? error.message : String(error)}).`
    root.append(p)
  }
}

const heading = document.createElement('h1')
heading.textContent = 'Validation harness'
root.append(heading, statusLine)

const params = new URLSearchParams(location.search)
if (params.get('clip')) {
  void runHarness(params).then((result) => {
    window.__harnessResult = result
    renderResult(result)
  })
} else {
  void renderIndex()
}
