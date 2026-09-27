/**
 * runAnalysis: the production analysis pipeline (ARCHITECTURE §5.2).
 *
 *   probe (+ time base: player override, slow-motion answer, container proof)
 *   -> session, video (retention per the player's setting) and job rows
 *   -> contact onsets (hit-sound timing only; timestamps only)
 *   -> Pass A: sparse pose (lite, ~15 Hz real) -> cleanPoseFrames -> findServeWindows -> planned windows
 *   -> Pass B per window: dense pose (ROI, pose worker) + ball detection (ball worker, crop + corridor)
 *      -> analyseBall; the first toss's gravity check proves or corrects an unknown time base
 *   -> analyseSession (engine-core) -> key frames (JPEG) -> tracks -> coaching (if available)
 *   -> one commit through the data layer.
 *
 * Cancellation: the AbortSignal reaches the decoder; on abort the ball worker is terminated and
 * the pose sources disposed at once, so work stops within one frame. A cancelled or failed run
 * marks the session and job and writes no results (never half-saved).
 */
import type { AnalysisErrorCode, EngineStamp, RectificationInfo, ServeAnalysis, ServeWindow, SessionAnalysis, SessionStats } from '../../data/domain.ts'
import { fpsClassFor } from '../../data/db.ts'
import type { KeyFrameRecord, TrackRecord } from '../../data/records.ts'
import { getProfile } from '../../data/repos/profile.ts'
import { getSetting } from '../../data/repos/settings.ts'
import { ulid } from '../../platform/ids.ts'
import { ballSetupFromPoses, soundDelayEstimateS, type BallSetup } from '../ball/analyse.ts'
import type { TargetTag } from '../ball/speed.ts'
import type { BallWindowResult, WindowAnalyseOptions, WindowBallConfig } from '../ball/workerCore.ts'
import { analyseSession as engineAnalyseSession, findServeWindows as engineFindServeWindows, type EngineInput, type EngineOutput } from '../engine.ts'
import { cleanPoseFrames } from '../pose/smoothing.ts'
import type { AudioOnset, BallObservation, BallTrack, CaptureContext, PoseFrame, VideoMeta } from '../types.ts'
import type { FrameSource } from '../video/frameTypes.ts'
import type { ProbeResult } from '../video/probe.ts'
import { contactOnsets } from './audio.ts'
import { checkClipBudget, checkStorage, MEMORY_BUDGET } from './budget.ts'
import { runCoachingStep, type CoachingStepResult } from './coaching.ts'
import { AnalysisError, isAbort, throwIfAborted, toAnalysisError } from './errors.ts'
import { encodeJpeg, extractKeyFrames, planKeyFrames, type JpegEncoder } from './keyFrames.ts'
import { runDenseWindow, runSparsePass, type BallClient, type PoseEstimator } from './passes.ts'
import { commitResults, markCancelled, markFailed, patchJob, prepareSession, startJob, storeVideo } from './persist.ts'
import { ProgressReporter } from './progress.ts'
import { applyGravityCheck, resolveTimeBase, type TimeBaseDecision } from './timeBase.ts'
import { compactBallTrack, compactPoseTrack, mergePoses, retimePoses } from './tracks.ts'
import type { PipelineEvent, PipelineTimings, RunAnalysisOptions, RunAnalysisResult } from './types.ts'
import { activitySpans, ballIndices, planWindows, poseIndices, sparseStep, type PlannedWindow } from './windows.ts'

export const PIPELINE_VERSION = '1.0.0'
/**
 * The ball crop is downscaled on the GPU until the expected ball radius is about this many pixels.
 * The detector works on a grid of about 3 cells per radius anyway (detector.ts), so a larger ball
 * only costs readback and box-filter time; 10 px keeps 3+ cells per radius and a sub-pixel centroid.
 */
export const BALL_RADIUS_TARGET_PX = 10

/** Crop scale for the ball worker (1 = full resolution; never upscales). */
export function ballDownscaleFor(expectedRadiusNorm: number | undefined, frameHeightPx: number): number {
  if (!expectedRadiusNorm || !(frameHeightPx > 0)) return 1
  const radiusPx = expectedRadiusNorm * frameHeightPx
  return radiusPx > BALL_RADIUS_TARGET_PX ? BALL_RADIUS_TARGET_PX / radiusPx : 1
}
/** Pass A fine rate around arm-above-head activity (engine contract: findServeWindows works at ~15-30 Hz). */
export const SPARSE_HZ = 15
/** Pass A coarse rate over the whole clip (ARCHITECTURE §5.3: 4 fps). */
export const SPARSE_COARSE_HZ = 4
const DEFAULT_HEIGHT_M = 1.75
/** 26 mm-equivalent main lens, long-side field of view (ARCHITECTURE §5.4 step 4). */
const LENS_DEFAULT_FOV_DEG = 67.3

type Engine = {
  findServeWindows: typeof engineFindServeWindows
  analyseSession: (input: EngineInput) => EngineOutput
}

/** Everything the pipeline touches outside itself. Tests replace any of these. */
export interface PipelineDeps {
  probe: (file: Blob, fileName: string) => Promise<ProbeResult | undefined>
  openFrameSource: (file: Blob, options: { fileName: string; probe?: ProbeResult }) => Promise<FrameSource>
  createPoseSource: (pass: 'sparse' | 'dense', model: 'full' | 'lite') => Promise<PoseEstimator>
  createBallClient: (onAck: (ack: { windowId: number; frameIndex: number }) => void) => Promise<BallClient>
  engine: Engine
  encoder: JpegEncoder
  coaching: (input: Parameters<typeof runCoachingStep>[0]) => Promise<CoachingStepResult>
  onsets: typeof contactOnsets
  now: () => number
}

export const defaultDeps: PipelineDeps = {
  probe: async (file, fileName) => {
    const { probeVideo, sniffContainer, blobSource } = await import('../video/index.ts')
    const kind = sniffContainer(await blobSource(file).read(0, 16))
    if (kind !== 'mp4' && kind !== 'mov') return undefined // WebM etc. go to the media-element path unprobed
    return probeVideo(file, { fileName, mimeType: file.type || undefined })
  },
  openFrameSource: async (file, options) => {
    const { openFrameSource } = await import('../video/frameSource.ts')
    return openFrameSource(file, options)
  },
  createPoseSource: async (_pass, model) => {
    const { MediaPipePoseSource } = await import('../pose/mediapipeSource.ts')
    return new MediaPipePoseSource({ model, numPoses: 2, roi: 'auto', maxInFlight: MEMORY_BUDGET.poseInFlight, useWorker: 'auto' })
  },
  createBallClient: async (onAck) => {
    const { BallWorkerClient } = await import('../ball/workerClient.ts')
    return BallWorkerClient.create({ maxQueue: MEMORY_BUDGET.ballQueue, onAck })
  },
  engine: { findServeWindows: engineFindServeWindows, analyseSession: engineAnalyseSession },
  encoder: encodeJpeg,
  coaching: (input) => runCoachingStep(input),
  onsets: contactOnsets,
  now: () => performance.now(),
}

/**
 * Settles with AnalysisError('cancelled') as soon as the signal fires, whatever `work` does. Pose
 * and decode internals are asked to stop too (onAbort), but a request left pending inside a
 * disposed worker must never keep a cancelled job alive (seen in the browser: about 48 s).
 */
export function raceAbort<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work
  work.catch(() => undefined) // a late failure after cancellation is expected and ignored
  if (signal.aborted) return Promise.reject(new AnalysisError('cancelled', 'signal aborted'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AnalysisError('cancelled', 'signal aborted'))
    signal.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/** Waits for a clean-up at most `ms`; clean-up never holds a finished or cancelled job. */
async function settleWithin(work: Promise<unknown> | undefined, ms: number): Promise<void> {
  if (!work) return
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([work.catch(() => undefined), new Promise((resolve) => (timer = setTimeout(resolve, ms)))])
  clearTimeout(timer)
}

/** Clean-up budget per resource (ARCHITECTURE §5.9: stopped within 500 ms). */
const DISPOSE_BUDGET_MS = 500

function emptyTimings(): PipelineTimings {
  return {
    probeMs: 0,
    audioMs: 0,
    poseInitMs: 0,
    sparseMs: 0,
    denseMs: 0,
    densePoseMs: 0,
    denseBallMs: 0,
    ballReadbackMs: 0,
    ballCropScale: 1,
    ballAnalyseMs: 0,
    measureMs: 0,
    keyFramesMs: 0,
    coachingMs: 0,
    saveMs: 0,
    totalMs: 0,
    framesDecoded: 0,
    poseFrames: 0,
    ballFrames: 0,
    windows: 0,
    sparseCoarseFrames: 0,
    sparseFillFrames: 0,
    ballBackend: 'main-thread',
    poseBackend: 'uninitialised',
  }
}

function defaultCapture(options: RunAnalysisOptions, meta: VideoMeta): CaptureContext {
  const heightM = options.profile.heightM
  return {
    source: 'import',
    declaredView: options.view,
    serveSide: 'both',
    serveNumber: 'mixed',
    handedness: options.profile.handedness,
    playerHeightM: heightM ?? DEFAULT_HEIGHT_M,
    playerHeightSource: heightM ? 'entered' : 'default',
    orientation: meta.width < meta.height ? 'portrait' : 'landscape',
    hitSoundTiming: options.hitSoundTiming ?? false,
  }
}

function rectificationFor(capture: CaptureContext, meta: VideoMeta): RectificationInfo {
  const samples = capture.orientationSamples ?? []
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]
  const pitch = samples.length ? median(samples.map((s) => s.pitchDeg)) : undefined
  const status: RectificationInfo['status'] =
    pitch === undefined ? 'unknown' : Math.abs(pitch) > 5 ? 'measured-over-cap' : Math.abs(pitch) < 0.5 ? 'measured-level' : 'measured-corrected'
  const info: RectificationInfo = {
    status,
    source: samples.length ? (capture.source === 'in-app-native' ? 'native-attitude' : 'motion-sensor') : 'none',
    orientation: capture.orientation ?? (meta.width < meta.height ? 'portrait' : 'landscape'),
    fovDeg: capture.videoFovDeg ?? LENS_DEFAULT_FOV_DEG,
    fovSource: capture.intrinsics ? 'intrinsics' : capture.videoFovDeg ? 'videoFieldOfView' : 'lens-default',
  }
  if (pitch !== undefined) info.pitchDeg = { value: pitch, sigma: 0.5 }
  return info
}

function toServeWindow(w: PlannedWindow, frameTimes: ArrayLike<number>): ServeWindow {
  return {
    index: w.index,
    startFrame: w.startFrame,
    endFrame: w.endFrame,
    coreStartFrame: w.coreStartFrame,
    coreEndFrame: w.coreEndFrame,
    roi: w.crop,
    candidate: {
      tAnchor: frameTimes[w.contact.frameIndex] ?? w.contact.tReal,
      anchor: w.contact.source === 'audio' ? 'audio-contact' : 'pose-arm-run',
      score: w.confidence,
      cues: w.contact.source === 'audio' ? ['audio-contact', 'toss-arm'] : ['toss-arm'],
      kind: 'serve',
      playerBox: w.crop,
    },
  }
}

/** Engine serve ids are made unique per session and every stats reference follows them. */
function adoptServes(out: EngineOutput, sessionId: string, videoId: string): { serves: ServeAnalysis[]; stats: SessionStats } {
  const rename = new Map<string, string>()
  const serves = out.serves.map((s, i) => {
    const index = Number.isInteger(s.index) && s.index > 0 ? s.index : i + 1
    const id = s.id && s.id.startsWith(sessionId) ? s.id : `${sessionId}-s${String(index).padStart(2, '0')}`
    if (s.id) rename.set(s.id, id)
    return { ...s, id, index, sessionId, videoId }
  })
  const map = (id: string | undefined) => (id === undefined ? undefined : (rename.get(id) ?? id))
  const derived: SessionStats['derivedPerServe'] = {}
  for (const [k, v] of Object.entries(out.stats.derivedPerServe ?? {})) derived[map(k)!] = v
  const stats: SessionStats = {
    ...out.stats,
    sessionId,
    derivedPerServe: derived,
    bestServeId: map(out.stats.bestServeId),
    representativeServeId: map(out.stats.representativeServeId),
  }
  if (stats.bestServeId === undefined) delete stats.bestServeId
  if (stats.representativeServeId === undefined) delete stats.representativeServeId
  return { serves, stats }
}

function uniqueObservations(tracks: readonly BallTrack[]): BallObservation[] {
  const seen = new Set<string>()
  const out: BallObservation[] = []
  for (const t of tracks) {
    for (const o of t.observations) {
      const key = `${o.frameIndex}:${o.x.toFixed(5)}:${o.y.toFixed(5)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(o)
    }
  }
  return out.sort((a, b) => a.frameIndex - b.frameIndex)
}

/** Track ids are made unique across windows (the ball layer numbers from 1 per window). */
function renumberTracks(results: readonly BallWindowResult[]): { tracks: BallTrack[]; perWindow: { tossTrackId: number | null; outgoingTrackId: number | null }[] } {
  let next = 1
  const tracks: BallTrack[] = []
  const perWindow = results.map((r) => {
    const ids = new Map<number, number>()
    for (const t of r.tracks) {
      ids.set(t.id, next)
      tracks.push({ ...t, id: next++ })
    }
    return {
      tossTrackId: r.tossTrackId === null ? null : (ids.get(r.tossTrackId) ?? null),
      outgoingTrackId: r.outgoingTrackId === null ? null : (ids.get(r.outgoingTrackId) ?? null),
    }
  })
  return { tracks, perWindow }
}

export async function runAnalysis(file: Blob, options: RunAnalysisOptions, deps: PipelineDeps = defaultDeps): Promise<RunAnalysisResult> {
  const jobId = options.jobId ?? ulid()
  const persist = options.persist !== false
  const signal = options.signal
  const emit = (event: PipelineEvent) => {
    try {
      options.onProgress?.(event)
    } catch {
      // A throwing listener must not break the analysis.
    }
  }
  const warnings: string[] = []
  const warn = (message: string) => {
    warnings.push(message)
    emit({ type: 'warning', jobId, message })
  }
  const timings = emptyTimings()
  const now = deps.now
  const runStarted = now()
  const hitSound = options.hitSoundTiming ?? options.capture?.hitSoundTiming ?? false
  const progress = new ProgressReporter({ jobId, emit, withAudio: hitSound, now })

  let frameSource: FrameSource | null = null
  let sparsePose: PoseEstimator | null = null
  let densePose: PoseEstimator | null = null
  let ball: BallClient | null = null
  let jobStarted = false
  let videoStored = false
  let failStage: AnalysisErrorCode = 'internal'

  // Abort: stop the workers at once (the decoder sees the signal itself).
  const onAbort = () => {
    ball?.dispose()
    void sparsePose?.dispose()
    void densePose?.dispose()
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  const raceAbortWork = <T,>(work: Promise<T>): Promise<T> => raceAbort(work, signal)

  try {
    throwIfAborted(signal)
    const fileName = file instanceof File && file.name ? file.name : 'clip.mp4'

    // ---------- 1. probe, time base, budgets ----------
    progress.update('probe', 0)
    let t = now()
    failStage = 'probe-failed'
    let probe: ProbeResult | undefined
    try {
      probe = await deps.probe(file, fileName)
    } catch (error) {
      // An MP4/MOV the probe cannot parse may still play in the media element.
      warnings.push(`probe: ${error instanceof Error ? error.message : String(error)}`)
    }
    failStage = 'unsupported-codec'
    frameSource = await deps.openFrameSource(file, { fileName, probe })
    throwIfAborted(signal)
    const probed: VideoMeta = {
      ...frameSource.meta,
      timeBaseStatus: probe?.timeBase.status ?? 'unknown',
      timeBaseKind: probe?.timeBase.kind,
      decodePath: frameSource.path,
    }
    let timeBase: TimeBaseDecision = resolveTimeBase(probed, { fpsOverride: options.fpsOverride, slowMotionAnswer: options.capture?.slowMotionAnswer })
    frameSource.setMeta(timeBase.meta)
    failStage = 'too-long'
    checkClipBudget(timeBase.meta, file.size)
    failStage = 'internal'
    timings.probeMs = now() - t
    const meta = () => frameSource!.meta
    const aspect = meta().width / meta().height
    const capture: CaptureContext = options.capture ?? defaultCapture(options, meta())
    const handedness = options.profile.handedness
    const heightM = options.profile.heightM ?? capture.playerHeightM ?? DEFAULT_HEIGHT_M
    if (!options.profile.heightM) warn('Your height is not set, so heights use an average adult height and are less certain.')
    const frameTimes = () => frameSource!.frameTimes.map((f) => f.tMedia * meta().timeScale)

    // Session, video and job rows before any decoding (a failed run can be retried).
    let videoId = ulid()
    if (persist) {
      await prepareSession({
        sessionId: options.sessionId,
        view: options.view,
        capture,
        startedAt: probed.createdAt ?? new Date().toISOString(),
      })
      const stored = await storeVideo({
        videoId,
        sessionId: options.sessionId,
        file,
        fileName,
        meta: meta(),
        capture,
        source: options.source ?? (capture.source === 'import' ? 'file-import' : capture.source),
        hasAudioTrack: meta().hasAudio || !!probe?.audio,
        roomToStore: await checkStorage(file.size),
      })
      if (stored.note) warn(stored.note)
      // A re-run of the same clip reuses the session's video row.
      videoId = stored.record.id
      videoStored = stored.record.storage === 'idb'
      await startJob({ jobId, sessionId: options.sessionId, videoId, engineVersion: PIPELINE_VERSION })
      jobStarted = true
    }
    progress.update('probe', 1)
    throwIfAborted(signal)

    // ---------- 2. contact onsets (hit-sound timing only) ----------
    let onsets: AudioOnset[] = []
    if (hitSound) {
      progress.update('audio', 0)
      t = now()
      const result = await raceAbort(deps.onsets({ file, probe, meta: meta(), capture, hitSoundTiming: hitSound, signal }), signal)
      onsets = result.onsets
      timings.audioMs = now() - t
      if (result.status === 'unusable' || result.status === 'failed') warnings.push(`hit-sound timing not used: ${result.reason}`)
      progress.update('audio', 1)
      throwIfAborted(signal)
    }

    // ---------- 3. Pass A: sparse pose, serve windows ----------
    // One landmarker serves both passes (ARCHITECTURE §5.10: single landmarker, rebuilt per job).
    // Measured: the lite model was no faster per frame here (decode and ROI dominate) and a second
    // model cost about 3 s of start-up and its own memory.
    progress.update('finding-serves', 0)
    failStage = 'pose-init-failed'
    t = now()
    sparsePose = await deps.createPoseSource('sparse', options.poseModel ?? 'full')
    await raceAbort(Promise.resolve(sparsePose.init?.()), signal)
    timings.poseInitMs += now() - t
    failStage = 'internal'
    throwIfAborted(signal)
    const sparse = await raceAbortWork(runSparsePass(frameSource, sparsePose, {
      coarseStep: sparseStep(meta().captureFps, options.passA?.coarseHz ?? SPARSE_COARSE_HZ),
      fineStep: sparseStep(meta().captureFps, options.passA?.fineHz ?? SPARSE_HZ),
      fillSpans: (coarse) => activitySpans(coarse),
      signal,
      onFrame: (fraction) => progress.update('finding-serves', 0.95 * fraction),
    }))
    timings.sparseMs = sparse.ms
    timings.sparseCoarseFrames = sparse.coarseFrames
    timings.sparseFillFrames = sparse.fillFrames
    timings.framesDecoded += frameSource.frameTimes.length
    timings.poseFrames += sparse.poses.length
    const sparseErrors = sparsePose.stats?.().detectErrors ?? []
    throwIfAborted(signal)
    let sparseClean = cleanPoseFrames(sparse.poses, { frameAspect: aspect }).frames
    let engineWindows = deps.engine.findServeWindows(sparseClean, meta(), handedness)
    // Sound travel time from the player to the phone, from the stature scale (onsets only).
    const soundDelayS = onsets.length
      ? soundDelayEstimateS(ballSetupFromPoses(sparseClean, { aspect, handedness, playerHeightM: heightM }).scale, aspect)
      : 0
    const planned = planWindows(engineWindows, {
      frameTimes: frameTimes(),
      sparsePoses: sparseClean,
      handedness,
      view: options.view,
      aspect,
      onsets,
      soundDelayS,
    })
    if (planned.length === 0) {
      throw new AnalysisError(
        'no-serves',
        `findServeWindows returned ${engineWindows.length} window(s); ${sparse.poses.filter((p) => p.landmarks).length} of ${sparse.poses.length} sparse frames had a pose${sparseErrors.length ? `; pose errors: ${sparseErrors.slice(0, 3).join(' | ')}` : ''}`,
      )
    }
    timings.windows = planned.length
    progress.update('finding-serves', 1, { servesFound: planned.length })
    if (persist) await patchJob(jobId, { state: 'dense', windows: planned.map((w) => toServeWindow(w, frameTimes())), progress: progress.current })

    // ---------- 4. Pass B: dense pose + ball per window ----------
    failStage = 'pose-init-failed'
    t = now()
    densePose = sparsePose
    sparsePose = null
    let onBallAck: ((windowId: number) => void) | null = null
    ball = await deps.createBallClient((ack) => onBallAck?.(ack.windowId))
    timings.poseInitMs += now() - t
    timings.ballBackend = ball.backend
    failStage = 'internal'
    throwIfAborted(signal)
    const denseStarted = now()
    const cropScales: number[] = []
    const densePosesByWindow: PoseFrame[][] = []
    const ballResults: BallWindowResult[] = []
    const denseFrameSet = new Set<number>()
    const targetTag: TargetTag | null = capture.intendedTarget && capture.intendedTarget !== 'mixed' ? capture.intendedTarget : null
    const servedFrom = capture.serveSide === 'both' ? undefined : capture.serveSide
    const setupFor = (poses: PoseFrame[]): BallSetup =>
      ballSetupFromPoses(poses, { aspect, handedness, playerHeightM: heightM })

    const windowConfig = (w: PlannedWindow, setup: BallSetup): WindowBallConfig => ({
      crop: w.crop,
      frameAspect: aspect,
      expectedRadiusNorm: setup.expectedRadiusNorm,
      tossRoi: setup.tossRoi,
      corridor: w.corridor,
      provisionalContactT: w.contact.tReal,
      contactUncertaintyS: w.contact.uncertaintyS,
      cameraView: options.view,
    })
    const analyseOptionsFor =
      (sparseSetup: BallSetup) =>
      (dense: PoseFrame[]): WindowAnalyseOptions => {
        const cleaned = dense.length >= 5 ? cleanPoseFrames(dense, { frameAspect: aspect }).frames : dense
        const setup = cleaned.some((p) => p.landmarks) ? setupFor(cleaned) : sparseSetup
        return {
          setup: { aspect, scale: setup.scale ?? sparseSetup.scale, expectedRadiusNorm: setup.expectedRadiusNorm ?? sparseSetup.expectedRadiusNorm, body: setup.body ?? sparseSetup.body },
          captureFps: meta().captureFps,
          timeBaseKnown: timeBase.status !== 'unknown',
          cameraView: options.view,
          onsets: onsets.length ? onsets : undefined,
          targetTag,
          servedFrom,
          seed: 1,
        }
      }

    const perWindowShare = 1 / planned.length
    for (let i = 0; i < planned.length; i++) {
      throwIfAborted(signal)
      let w = planned[i]
      const windowSparse = sparseClean.filter((p) => p.frameIndex >= w.startFrame && p.frameIndex <= w.endFrame)
      const sparseSetup = setupFor(windowSparse)
      const poseFrames = poseIndices(w, meta().captureFps)
      const ballFrames = ballIndices(w)
      let poseDone = 0
      let ballDone = 0
      const report = () => {
        const f = (poseDone / Math.max(1, poseFrames.length) + ballDone / Math.max(1, ballFrames.length)) / 2
        const step = poseDone < poseFrames.length ? 'tracking-body' : 'tracking-ball'
        progress.update(step, (i + f) * perWindowShare, { serveIndex: i + 1, servesDone: i })
      }
      const windowIndex = w.index
      onBallAck = (windowId) => {
        if (windowId === windowIndex) {
          ballDone++
          report()
        }
      }
      try {
        const dense = await raceAbortWork(runDenseWindow(frameSource, densePose, ball, {
          window: w,
          poseFrames,
          ballFrames,
          ballDownscale: ballDownscaleFor(sparseSetup.expectedRadiusNorm, meta().height),
          ballConfig: windowConfig(w, sparseSetup),
          analyseOptions: analyseOptionsFor(sparseSetup),
          display: { width: meta().width, height: meta().height },
          signal,
          onPoseFrame: (done) => {
            poseDone = done
            report()
          },
        }))
        let ballResult = dense.ball
        let poses = dense.poses
        timings.densePoseMs += dense.poseMs
        timings.denseBallMs += ballResult.timings.detectMs + ballResult.timings.readbackMs
        timings.ballReadbackMs += ballResult.timings.readbackMs
        cropScales.push(ballDownscaleFor(sparseSetup.expectedRadiusNorm, meta().height))
        timings.ballAnalyseMs += ballResult.timings.analyseMs
        timings.poseFrames += poses.length
        timings.ballFrames += ballResult.framesProcessed
        timings.framesDecoded += dense.framesDecoded

        // The first toss decides an unknown time base (gravity); a correction re-times everything
        // and re-runs this window's ball detection on the corrected timestamps.
        if (timeBase.status === 'unknown' && ballResult.toss?.status === 'ok') {
          const before = meta().timeScale
          const checked = applyGravityCheck(timeBase, ballResult.timeBase)
          timeBase = checked.decision
          if (checked.warning) warn(checked.warning)
          frameSource.setMeta(timeBase.meta)
          if (checked.changed) {
            const factor = meta().timeScale / before
            warn(`This looks like slow motion (${Math.round(meta().captureFps)} fps), so we corrected the timing.`)
            sparseClean = retimePoses(sparseClean, factor)
            for (let k = 0; k < densePosesByWindow.length; k++) densePosesByWindow[k] = retimePoses(densePosesByWindow[k], factor)
            poses = retimePoses(poses, factor)
            onsets = [] // time-scaled audio is never used for timing
            engineWindows = engineWindows.map((ew) => ({ ...ew, startReal: ew.startReal * factor, endReal: ew.endReal * factor }))
            const replanned = planWindows(engineWindows, { frameTimes: frameTimes(), sparsePoses: sparseClean, handedness, view: options.view, aspect })
            for (let k = 0; k < planned.length && k < replanned.length; k++) planned[k] = { ...replanned[k], index: planned[k].index }
            w = planned[i]
            const redo = await raceAbortWork(runDenseWindow(frameSource, null, ball, {
              window: w,
              poseFrames: [],
              ballFrames: ballIndices(w),
              ballDownscale: ballDownscaleFor(sparseSetup.expectedRadiusNorm, meta().height),
              ballConfig: windowConfig(w, setupFor(windowSparse.map((p) => ({ ...p, tReal: p.tReal * factor })))),
              analyseOptions: () => analyseOptionsFor(sparseSetup)(poses),
              display: { width: meta().width, height: meta().height },
              signal,
              ballOnly: true,
            }))
            ballResult = redo.ball
            timings.denseBallMs += redo.ball.timings.detectMs + redo.ball.timings.readbackMs
            timings.ballReadbackMs += redo.ball.timings.readbackMs
            timings.ballFrames += redo.ball.framesProcessed
            timings.framesDecoded += redo.framesDecoded
          }
        }
        for (const p of poses) denseFrameSet.add(p.frameIndex)
        densePosesByWindow.push(poses)
        ballResults.push(ballResult)
      } finally {
        onBallAck = null
      }
      progress.update('tracking-ball', (i + 1) * perWindowShare, { serveIndex: Math.min(planned.length, i + 2), servesDone: i + 1 })
      if (persist) await patchJob(jobId, { completedWindows: planned.slice(0, i + 1).map((p) => p.index), progress: progress.current })
    }
    timings.denseMs = now() - denseStarted
    timings.ballCropScale = cropScales.length ? cropScales.reduce((a, b) => a + b, 0) / cropScales.length : 1
    const poseStats = densePose.stats?.()
    timings.poseBackend = poseStats?.backend ?? 'unknown'
    if (poseStats?.detectErrors.length) warn('Part of this video could not be tracked, so some serves may be missing values.')
    await settleWithin(densePose.dispose(), DISPOSE_BUDGET_MS)
    densePose = null
    ball.dispose()
    ball = null
    throwIfAborted(signal)

    // ---------- 5. measuring: engine, key frames, tracks ----------
    progress.update('measuring', 0)
    t = now()
    const denseClean = densePosesByWindow.map((poses) => (poses.length >= 5 ? cleanPoseFrames(poses, { frameAspect: aspect }).frames : poses))
    const cleanReports = densePosesByWindow.map((poses) => (poses.length >= 5 ? cleanPoseFrames(poses, { frameAspect: aspect }).report : null))
    const allPoses = mergePoses(sparseClean, denseClean.flat())
    const { tracks: allTracks, perWindow: trackIds } = renumberTracks(ballResults)
    const targetTags: EngineInput['targetTags'] = {}
    if (targetTag) planned.forEach((_, k) => (targetTags[k + 1] = targetTag))
    const engineInput: EngineInput = {
      meta: meta(),
      view: options.view,
      capture,
      profile: { heightM, handedness, sex: options.profile.sex },
      poses: allPoses,
      ball: {
        observations: uniqueObservations(allTracks),
        tracks: allTracks,
        toss: ballResults.map((r, k) => ({
          windowIndex: k,
          startFrame: planned[k].startFrame,
          endFrame: planned[k].endFrame,
          startReal: frameTimes()[planned[k].startFrame],
          endReal: frameTimes()[planned[k].endFrame],
          provisionalContact: planned[k].contact,
          tossTrackId: trackIds[k].tossTrackId,
          outgoingTrackId: trackIds[k].outgoingTrackId,
          toss: r.toss,
          events: r.events,
          contactFromTracks: r.contactFromTracks,
          timeBase: r.timeBase,
          speedFromTrack: r.speedFromTrack,
          averageSpeedRear: r.averageSpeedRear,
          bounce: r.bounce,
          placement: r.placement,
          metrics: r.metrics,
        })),
      },
      onsets,
      targetTags: targetTag ? targetTags : undefined,
    }
    const out = deps.engine.analyseSession(engineInput)
    for (const message of out.warnings) warnings.push(`engine: ${message}`)
    timings.measureMs = now() - t
    const { serves: adopted, stats } = adoptServes(out, options.sessionId, videoId)
    progress.update('measuring', 0.3)
    throwIfAborted(signal)

    // Poses per serve (its window) for key-frame crops and stored tracks.
    const posesByServe = new Map<string, PoseFrame[]>()
    const windowOf = (s: ServeAnalysis) => {
      const k = planned.findIndex((p) => s.window.startFrame <= p.endFrame && s.window.endFrame >= p.startFrame)
      return k >= 0 ? k : Math.min(planned.length - 1, Math.max(0, s.index - 1))
    }
    for (const s of adopted) {
      const from = s.window?.startFrame ?? planned[windowOf(s)].startFrame
      const to = s.window?.endFrame ?? planned[windowOf(s)].endFrame
      posesByServe.set(s.id, allPoses.filter((p) => p.frameIndex >= from && p.frameIndex <= to))
    }
    t = now()
    failStage = 'internal'
    const plan = planKeyFrames({
      sessionId: options.sessionId,
      serves: adopted,
      posesByServe,
      frameCount: frameSource.frameTimes.length,
      aspect,
      representativeServeId: stats.representativeServeId ?? stats.bestServeId,
    })
    let keyFrames: KeyFrameRecord[] = []
    try {
      keyFrames = await raceAbortWork(extractKeyFrames(frameSource, plan.requests, {
        signal,
        encoder: deps.encoder,
        onFrame: (done, total) => progress.update('measuring', 0.3 + (0.7 * done) / total),
      }))
    } catch (error) {
      if (isAbort(error)) throw error
      warn('Some key frames could not be saved. Your numbers are unaffected.')
      warnings.push(`key frames: ${error instanceof Error ? error.message : String(error)}`)
    }
    const written = new Set(keyFrames.map((k) => k.id))
    const serves: ServeAnalysis[] = adopted.map((s) => {
      const ids = plan.byServe.get(s.id) ?? {}
      const kept: ServeAnalysis['keyFrames'] = {}
      for (const [event, entry] of Object.entries(ids)) {
        if (!entry || !written.has(entry.thumbId)) continue
        kept[event as keyof ServeAnalysis['keyFrames']] = entry.evidenceId && written.has(entry.evidenceId) ? entry : { thumbId: entry.thumbId }
      }
      return { ...s, keyFrames: kept }
    })
    timings.keyFramesMs = now() - t

    const tracks: TrackRecord[] = serves.map((s) => {
      const k = windowOf(s)
      const from = s.window?.startFrame ?? planned[k].startFrame
      const to = s.window?.endFrame ?? planned[k].endFrame
      const record: TrackRecord = {
        serveId: s.id,
        sessionId: options.sessionId,
        pose: compactPoseTrack(posesByServe.get(s.id) ?? [], {
          frameAspect: aspect,
          bodyHeightHU: cleanReports[k]?.bodyHeightHU ?? 0,
          denseFrames: denseFrameSet,
          orientationSamples: capture.orientationSamples,
        }),
      }
      const ballTrack = compactBallTrack(allTracks, from, to, trackIds[k]?.tossTrackId)
      if (ballTrack) record.ball = ballTrack
      return record
    })
    progress.update('measuring', 1)
    throwIfAborted(signal)

    // ---------- 6. coaching (when the coaching engine is present) ----------
    progress.update('coaching', 0)
    t = now()
    const fpsClass = fpsClassFor(meta().captureFps)
    const profileRecord = persist ? await getProfile() : undefined
    const showExperimental = persist ? await getSetting('experimentalMetrics') : false
    const coaching = await raceAbortWork(deps.coaching({
      sessionId: options.sessionId,
      startedAt: probed.createdAt ?? new Date().toISOString(),
      view: options.view,
      capture,
      fpsClass,
      quality: out.quality,
      serves,
      stats,
      profile: profileRecord,
      heightM,
      showExperimental,
    }))
    if (coaching.status === 'failed') warnings.push(`coaching: ${coaching.reason}`)
    timings.coachingMs = now() - t
    progress.update('coaching', 1)
    throwIfAborted(signal)

    // ---------- 7. saving (one transaction) ----------
    progress.update('saving', 0)
    t = now()
    timings.totalMs = now() - runStarted
    const engineStamp: EngineStamp = serves[0]?.engine ?? {
      engineVersion: PIPELINE_VERSION,
      contract: 1,
      catalogueVersion: 'unknown',
      poseModel: `mediapipe-pose-${options.poseModel ?? 'full'}`,
      poseBackend: 'gpu',
      decodePath: meta().decodePath ?? 'webcodecs',
      analysedAt: new Date().toISOString(),
      durationMs: Math.round(timings.totalMs),
      paramsHash: `pipeline@${PIPELINE_VERSION}`,
      bandsVersion: 'unknown',
    }
    const included = serves.filter((s) => s.included)
    const exclusionsByReason: SessionAnalysis['counts']['exclusionsByReason'] = {}
    for (const s of serves) for (const r of s.exclusions ?? []) exclusionsByReason[r] = (exclusionsByReason[r] ?? 0) + 1
    const statureNorms = planned.map((p) => p.statureNorm).filter((v) => v > 0).sort((a, b) => a - b)
    const bodyHeightHU = statureNorms.length ? statureNorms[statureNorms.length >> 1] : 0
    const analysis: SessionAnalysis = {
      schemaVersion: 1,
      sessionId: options.sessionId,
      videoIds: [videoId],
      mode: options.view === 'rear' ? 'outcomes' : 'technique',
      view: options.view,
      capture: {
        meta: meta(),
        quality: out.quality,
        fpsClass,
        setup: capture.setup ?? 'unknown',
        rectification: serves[0]?.rectification ?? rectificationFor(capture, meta()),
        bodyPx: bodyHeightHU ? Math.round(bodyHeightHU * meta().height) : undefined,
        scale: { bodyHeightHU, source: 'median-serves', heightM },
        handedness: { profile: handedness, agrees: true },
      },
      counts: {
        candidates: planned.length,
        tossOnly: serves.filter((s) => s.detection?.kind === 'toss-only').length,
        analysed: serves.length,
        included: included.length,
        excluded: serves.length - included.length,
        exclusionsByReason,
      },
      serveIds: serves.map((s) => s.id),
      engine: engineStamp,
      timings: {
        probeMs: Math.round(timings.probeMs),
        audioMs: Math.round(timings.audioMs),
        sparseMs: Math.round(timings.sparseMs),
        denseMs: Math.round(timings.denseMs),
        keyFramesMs: Math.round(timings.keyFramesMs),
        sessionMs: Math.round(timings.measureMs + timings.coachingMs),
        totalMs: Math.round(timings.totalMs),
        framesDecoded: timings.framesDecoded,
        poseFrames: timings.poseFrames,
        ballFrames: timings.ballFrames,
      },
    }
    if (analysis.capture.bodyPx === undefined) delete analysis.capture.bodyPx
    if (persist) {
      failStage = 'storage-full'
      await commitResults({
        sessionId: options.sessionId,
        jobId,
        serves,
        tracks,
        keyFrames,
        stats,
        analysis,
        decision: coaching.record,
        windowsDone: planned.map((p) => p.index),
        videoStored,
      })
      failStage = 'internal'
    }
    timings.saveMs = now() - t
    timings.totalMs = now() - runStarted
    for (const s of serves) emit({ type: 'serve-ready', jobId, serveId: s.id, index: s.index })
    progress.finish()
    return {
      sessionId: options.sessionId,
      jobId,
      serveIds: serves.map((s) => s.id),
      servesFound: planned.length,
      servesIncluded: included.length,
      keyFrames: keyFrames.length,
      stats,
      timings,
      warnings,
      coaching: {
        status: coaching.status,
        reason: coaching.reason,
        kind: typeof (coaching.decision as { kind?: unknown } | undefined)?.kind === 'string' ? (coaching.decision as { kind: string }).kind : undefined,
      },
      timeBase: { captureFps: meta().captureFps, timeScale: meta().timeScale, fpsSource: meta().fpsSource, status: timeBase.status },
      serveFinding: {
        engineWindows: engineWindows.length,
        windows: planned.map((p) => ({
          startReal: frameTimes()[p.startFrame],
          endReal: frameTimes()[p.endFrame],
          contactT: p.contact.tReal,
          contactSource: p.contact.source,
          confidence: p.confidence,
        })),
      },
    }
  } catch (error) {
    const err = signal?.aborted ? new AnalysisError('cancelled', 'signal aborted') : toAnalysisError(error, failStage === 'storage-full' ? 'internal' : failStage)
    // The Record flow may have created the session before calling us, so it is marked whatever
    // stage stopped (updating a session that does not exist is a no-op).
    if (persist) {
      try {
        if (err.code === 'cancelled') await markCancelled(options.sessionId, jobStarted ? jobId : null)
        else await markFailed(options.sessionId, jobStarted ? jobId : null, err.code, err.playerMessage)
      } catch {
        // Marking is best effort; the original error is what the player needs.
      }
    }
    progress.flush()
    throw err
  } finally {
    signal?.removeEventListener('abort', onAbort)
    ball?.dispose()
    await Promise.all([settleWithin(sparsePose?.dispose(), DISPOSE_BUDGET_MS), settleWithin(densePose?.dispose(), DISPOSE_BUDGET_MS)])
    frameSource?.close()
  }
}
