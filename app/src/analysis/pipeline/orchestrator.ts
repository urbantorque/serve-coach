/**
 * runAnalysis: the production analysis pipeline (ARCHITECTURE §5.2).
 *
 *   probe (+ time base: player override, slow-motion answer, container proof)
 *   -> session, video (retention per the player's setting) and job rows
 *   -> contact onsets (hit-sound timing only; timestamps only)
 *   -> Pass A: sparse pose (4 Hz scan, 15 Hz fill; the landmarker starts loading at the probe)
 *      -> cleanPoseFrames -> findServeWindows -> planned windows
 *   -> Pass B per window: dense pose (ROI; windows shared over the pose lanes) + ball detection
 *      (ball workers, YUV crops of the toss band and corridor) -> analyseBall; the first toss's
 *      gravity check proves or corrects an unknown time base
 *   -> analyseSession (engine-core) -> key frames (JPEG) -> tracks -> coaching (if available)
 *   -> one commit through the data layer.
 *
 * Cancellation: the AbortSignal reaches the decoder; on abort the ball workers are terminated and
 * the pose sources (and any still loading) disposed at once, so work stops within one frame. A cancelled or failed run
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
import { ballQueuePerWorker, ballWorkerCount, checkClipBudget, checkStorage, densePoseLaneCount, MEMORY_BUDGET } from './budget.ts'
import { runCoachingStep, type CoachingStepResult } from './coaching.ts'
import { AnalysisError, isAbort, throwIfAborted, toAnalysisError } from './errors.ts'
import { encodeJpeg, extractKeyFrames, planKeyFrames, type JpegEncoder } from './keyFrames.ts'
import { runBallDetect, runPoseWindow, runSparsePass, type BallClient, type PoseEstimator } from './passes.ts'
import { commitResults, markCancelled, markFailed, patchJob, prepareSession, startJob, storeVideo } from './persist.ts'
import { ProgressReporter } from './progress.ts'
import { applyGravityCheck, resolveTimeBase, type TimeBaseDecision } from './timeBase.ts'
import { compactBallTrack, compactPoseTrack, mergePoses, retimePoses } from './tracks.ts'
import type { PipelineEvent, PipelineTimings, RunAnalysisOptions, RunAnalysisResult } from './types.ts'
import { LaneQueue } from './laneQueue.ts'
import { activitySpans, ballIndices, ballSearchCrop, planWindows, poseIndices, sparseStep, type PlannedWindow } from './windows.ts'

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
/**
 * Margin (frame heights) around the toss band and the post-contact corridor when the ball crop is
 * cut down to them (windows.ts ballSearchCrop): several ball radii, so the detector's refinement box
 * and running background never reach the crop edge where it searches.
 */
export const BALL_CROP_MARGIN_H = 0.02
/** Pass A fine rate around arm-above-head activity (engine contract: findServeWindows works at ~15-30 Hz). */
export const SPARSE_HZ = 15
/** Pass A coarse rate over the whole clip (ARCHITECTURE §5.3: 4 fps). */
export const SPARSE_COARSE_HZ = 4
/**
 * Pass B landmarker poses. 2 runs MediaPipe's detector on every frame; 1 tracks from the previous
 * landmarks, which is about 25% cheaper (24-26 against 33-34 ms a frame on this laptop) but smooths
 * causally: on the synthetic session and check-in clips (2026-09-28, perf-accuracy.mts) the
 * lowest-hip timing error grew by 30-65 ms and loading-depth error from 0.33-0.43 to 0.52-0.75 %H.
 * Accuracy wins: 2, as before this round. Pass A keeps 2 as well (a bystander stays a separate pose).
 */
export const DENSE_NUM_POSES = 2
/**
 * Pass B pose rate (Hz) in the slow parts of the core (windows.ts poseIndices: outside the full-rate
 * span around the provisional contact). Undefined keeps the whole core at the full rate.
 */
export const DENSE_SLOW_CORE_HZ: number | undefined = undefined
/**
 * Longest side of the Pass B ROI crop handed to the landmarker (MediaPipePoseSource roiMaxSidePx);
 * 0 keeps the source resolution. A 512 px cap (the landmark model sees 256 px anyway) saved about
 * 1 ms a frame with numPoses 2, within run-to-run noise, and moved the wrist and landing errors
 * both ways, so the default stays as before this round. Kept as a tuning knob (options.pose).
 */
export const POSE_ROI_MAX_SIDE_PX = 0
/** A Pass A pose seeds a window's pose stream only if it is this close to the window's first frame (s). */
export const SEED_MAX_GAP_S = 0.5

/** A Pass B pose job: the frames to estimate and the pose its stream starts from. */
export interface PoseJob {
  key: string
  frames: readonly number[]
  seed?: { landmarks: NonNullable<PoseFrame['landmarks']>; tReal: number }
}

/**
 * Identity of a pose job: everything its result depends on (the time base, the frames, the seed's
 * exact values). Two windows with the same key get the same poses on any lane.
 */
export function poseJobKey(frames: readonly number[], seed: PoseJob['seed'], timeScale: number): string {
  const s = seed ? `${seed.tReal}:${seed.landmarks.map((l) => `${l.x},${l.y},${l.z},${l.visibility}`).join(';')}` : '-'
  return `${timeScale}|${frames.join(',')}|${s}`
}

/**
 * The server's pose nearest `t0` within `maxGapS`, preferring the latest at or before it, else the
 * earliest after it: a seed for a pose stream that starts at `t0` (no localisation).
 */
export function nearestPose(poses: readonly PoseFrame[], t0: number, maxGapS: number): { landmarks: NonNullable<PoseFrame['landmarks']>; tReal: number } | undefined {
  let best: PoseFrame | undefined
  for (const p of poses) {
    if (!p.landmarks || Math.abs(p.tReal - t0) > maxGapS) continue
    const better = !best || (p.tReal <= t0 ? best.tReal > t0 || p.tReal > best.tReal : best.tReal > t0 && p.tReal < best.tReal)
    if (better) best = p
  }
  return best?.landmarks ? { landmarks: best.landmarks, tReal: best.tReal } : undefined
}
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
  createBallClient: (onAck: (ack: { windowId: number; frameIndex: number }) => void, options?: { maxQueue?: number }) => Promise<BallClient>
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
  createBallClient: async (onAck, options) => {
    const { BallWorkerClient } = await import('../ball/workerClient.ts')
    return BallWorkerClient.create({ maxQueue: options?.maxQueue ?? MEMORY_BUDGET.ballQueue, onAck })
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
    ballWorkers: 0,
    ballPixels: 'gpu',
    ballPlanarFrames: 0,
    seededWindows: 0,
    poseLanes: 0,
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
  /** Pass B's extra pose lanes (landmarkers beside Pass A's, loaded during Pass A). */
  let extraPose: PoseEstimator[] = []
  let extraPoseStart: Promise<PoseEstimator[]> | null = null
  let balls: BallClient[] = []
  let jobStarted = false
  let videoStored = false
  let failStage: AnalysisErrorCode = 'internal'

  // Abort: stop the workers at once (the decoder sees the signal itself).
  const onAbort = () => {
    for (const b of balls) b.dispose()
    void sparsePose?.dispose()
    void densePose?.dispose()
    for (const p of extraPose) void p.dispose()
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  const raceAbortWork = <T,>(work: Promise<T>): Promise<T> => raceAbort(work, signal)

  // The landmarker loads (runtime, model, GPU warm-up: 1-5 s) while the clip is probed and stored,
  // instead of after. The source is owned by the run from creation, so abort and clean-up reach it;
  // one that finishes loading after the run has ended is disposed at once.
  let ended = false
  let poseStart: Promise<PoseEstimator> | null = null
  const startPose = (): Promise<PoseEstimator> => {
    poseStart ??= (async () => {
      const source = await deps.createPoseSource('sparse', options.poseModel ?? 'full')
      if (ended || signal?.aborted) {
        void source.dispose()
        throw new AnalysisError('cancelled', 'pose source created after the run ended')
      }
      sparsePose = source
      await source.init?.()
      return source
    })()
    poseStart.catch(() => undefined) // observed where Pass A awaits it
    return poseStart
  }

  /** Extra Pass B landmarkers, each in its own worker, loaded in parallel. */
  const startExtraPose = (count: number): Promise<PoseEstimator[]> => {
    const work = (async () => {
      const created: PoseEstimator[] = []
      for (let k = 0; k < count; k++) {
        const source = await deps.createPoseSource('dense', options.poseModel ?? 'full')
        if (ended || signal?.aborted) {
          void source.dispose()
          throw new AnalysisError('cancelled', 'pose source created after the run ended')
        }
        extraPose.push(source)
        created.push(source)
      }
      await Promise.all(created.map((source) => source.init?.()))
      return created
    })()
    work.catch(() => undefined) // observed where Pass B awaits it
    return work
  }

  try {
    throwIfAborted(signal)
    startPose()
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
    // Measured: the lite model was no faster per frame here (the GPU time per inference is mostly
    // fixed overhead, 2026-09-27) and a second model cost about 3 s of start-up and its own memory.
    progress.update('finding-serves', 0)
    failStage = 'pose-init-failed'
    t = now()
    const sparseSource = await raceAbort(startPose(), signal)
    sparsePose = sparseSource
    // Only the part of the start-up the probe and storage did not already cover.
    timings.poseInitMs += now() - t
    failStage = 'internal'
    throwIfAborted(signal)
    const passA = options.passA ?? {}
    const passB = options.passB ?? {}
    // Pass B's extra landmarkers load while Pass A runs (their GPU warm-up is short once Pass A's
    // shaders are compiled).
    const poseLaneCount = Math.max(1, Math.round(passB.poseLanes ?? densePoseLaneCount()))
    if (poseLaneCount > 1) extraPoseStart = startExtraPose(poseLaneCount - 1)

    // Pass B pose jobs. A window's dense poses depend only on its frame list and its seed, so a job is
    // keyed by exactly those; every lane gets the same settings, so a window's poses never depend on
    // which lane ran it.
    const slowCoreHz = passB.slowCoreHz === undefined ? DENSE_SLOW_CORE_HZ : passB.slowCoreHz || undefined
    const coveredOf = (raw: readonly PoseFrame[]) => (passB.reuseSparse === true ? new Set(raw.filter((p) => p.landmarks).map((p) => p.frameIndex)) : undefined)
    const poseJobFor = (w: PlannedWindow, seedPoses: readonly PoseFrame[], covered: ReadonlySet<number> | undefined, times: ArrayLike<number>): PoseJob => {
      const frames = poseIndices(w, meta().captureFps, covered, { slowCoreHz })
      const seed = passB.seedPose !== true || frames.length === 0 ? undefined : nearestPose(seedPoses, times[frames[0]], SEED_MAX_GAP_S)
      return { key: poseJobKey(frames, seed, meta().timeScale), frames, seed }
    }
    const poseProgress = new Map<string, (done: number, total: number) => void>()
    const runPoseJob = async (job: PoseJob, lane: PoseEstimator): Promise<PoseFrame[]> => {
      throwIfAborted(signal)
      if (job.seed) {
        lane.configure?.({ seed: job.seed })
        timings.seededWindows++
      }
      const result = await runPoseWindow(frameSource!, lane, { poseFrames: job.frames, signal, onPoseFrame: (done, total) => poseProgress.get(job.key)?.(done, total) })
      timings.densePoseMs += result.poseMs
      timings.poseFrames += result.poses.length
      timings.framesDecoded += result.framesDecoded
      return result.poses
    }

    const sparse = await raceAbortWork(runSparsePass(frameSource, sparseSource, {
      coarseStep: sparseStep(meta().captureFps, passA.coarseHz ?? SPARSE_COARSE_HZ),
      fineStep: sparseStep(meta().captureFps, passA.fineHz ?? SPARSE_HZ),
      fillSpans: (coarse) => activitySpans(coarse),
      signal,
      onFrame: (fraction) => progress.update('finding-serves', 0.95 * fraction),
      // Tuning only: by default Pass A runs exactly as before (numPoses 2, each stream localising the
      // server itself). Serve finding is sensitive to the smallest change in these poses: on the
      // 8-serve session clip, tracking the fill with numPoses 1, feeding decoder frames with a scale,
      // software decoding and a CPU-delegate fill each lost one or two far-side (ad court) serves.
      beforeStream: (stream, context) => {
        const settings: Parameters<NonNullable<PoseEstimator['configure']>>[0] = {}
        const numPoses = stream === 'coarse' ? passA.coarseNumPoses : passA.fillNumPoses
        if (numPoses !== undefined) settings.numPoses = numPoses
        if (stream === 'fill' && passA.seedFill === true && context.indices.length > 0) {
          const seed = nearestPose(context.coarse, frameTimes()[context.indices[0]], SEED_MAX_GAP_S)
          if (seed) settings.seed = seed
        }
        if (Object.keys(settings).length > 0) sparseSource.configure?.(settings)
      },
    }))
    timings.sparseMs = sparse.ms
    timings.sparseCoarseFrames = sparse.coarseFrames
    timings.sparseFillFrames = sparse.fillFrames
    timings.framesDecoded += frameSource.frameTimes.length
    timings.poseFrames += sparse.poses.length
    const sparseErrors = sparseSource.stats?.().detectErrors ?? []
    throwIfAborted(signal)
    let sparseClean = cleanPoseFrames(sparse.poses, { frameAspect: aspect }).frames
    let sparseRaw: PoseFrame[] = sparse.poses
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

    // ---------- 4. Pass B: dense pose (GPU lanes) and ball detection (CPU pool) per window ----------
    // Pose: the windows are shared out over the pose lanes (Pass A's landmarker plus
    // densePoseLaneCount - 1 more), each window one stream, so its poses are the same whichever lane
    // runs it. Ball detection is CPU work: each window runs on one of a pool of ball workers, on its
    // own software decode, while pose works through the windows. Results are taken in window order,
    // so the first toss's gravity check still decides the time base before any later window is ended.
    failStage = 'pose-init-failed'
    t = now()
    // Pose lanes: Pass A's landmarker and any extra ones (see densePoseLaneCount).
    let poseLanes: PoseEstimator[] = [sparseSource]
    if (extraPoseStart) {
      try {
        poseLanes = [sparseSource, ...(await raceAbort(extraPoseStart, signal))]
      } catch (error) {
        if (isAbort(error) || signal?.aborted) throw error
        warnings.push(`extra pose lanes unavailable: ${error instanceof Error ? error.message : String(error)}`)
        for (const lane of extraPose) void lane.dispose()
        extraPose = []
      }
    }
    densePose = sparseSource
    sparsePose = null
    timings.poseLanes = poseLanes.length
    for (const lane of poseLanes) {
      lane.configure?.({ numPoses: passB.numPoses ?? DENSE_NUM_POSES, roiMaxSidePx: options.pose?.roiMaxSidePx ?? POSE_ROI_MAX_SIDE_PX })
    }
    const queue = new LaneQueue(poseLanes, runPoseJob)
    const ballWorkers = Math.max(1, Math.round(passB.lanes ?? ballWorkerCount()))
    const ballAcks = new Map<number, () => void>()
    const onBallAck = (ack: { windowId: number }) => ballAcks.get(ack.windowId)?.()
    for (let k = 0; k < ballWorkers; k++) balls.push(await deps.createBallClient(onBallAck, { maxQueue: ballQueuePerWorker(ballWorkers) }))
    timings.poseInitMs += now() - t
    timings.ballBackend = balls[0].backend
    timings.ballWorkers = balls.length
    // Ball pixels: from software-decoded frames when this codec decodes in software here (a CPU
    // copy, no GPU readback beside the pose worker; video/planar.ts), else bitmaps read back.
    const ballCpu = passB.ballPixels !== 'gpu' && (await frameSource.canDecodeWith?.('prefer-software')) === true
    timings.ballPixels = ballCpu ? 'cpu' : 'gpu'
    failStage = 'internal'
    throwIfAborted(signal)
    const denseStarted = now()
    const cropScales: number[] = []
    /** Ball crop each window's detection ran on (for serveFinding). */
    const ballCrops: WindowBallConfig['crop'][] = []
    const densePosesByWindow: PoseFrame[][] = []
    const ballResults: BallWindowResult[] = []
    const denseFrameSet = new Set<number>()
    const targetTag: TargetTag | null = capture.intendedTarget && capture.intendedTarget !== 'mixed' ? capture.intendedTarget : null
    const servedFrom = capture.serveSide === 'both' ? undefined : capture.serveSide
    const setupFor = (poses: PoseFrame[]): BallSetup =>
      ballSetupFromPoses(poses, { aspect, handedness, playerHeightM: heightM })
    const display = () => ({ width: meta().width, height: meta().height })

    const windowConfig = (w: PlannedWindow, setup: BallSetup): WindowBallConfig => ({
      crop: passB.tightBallCrop === false ? w.crop : ballSearchCrop(w.crop, setup.tossRoi, w.corridor, options.view, aspect, BALL_CROP_MARGIN_H),
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
    const sparseIn = (w: PlannedWindow) => sparseClean.filter((p) => p.frameIndex >= w.startFrame && p.frameIndex <= w.endFrame)
    // Context frames Pass A already estimated are reused (the core is always estimated here).
    const covered = coveredOf(sparse.poses)
    const seedPoses = passB.seedPose === true ? sparseClean : []
    // The ball analysis takes the player's stature from the window's first second of poses. With the
    // context reused, the window's own stream starts at the core, so Pass A's poses fill the context in.
    const setupPoses = (w: PlannedWindow, dense: PoseFrame[]) =>
      covered ? mergePoses(sparseRaw.filter((p) => p.frameIndex >= w.startFrame && p.frameIndex <= w.endFrame), dense) : dense

    // Progress: every window counts pose and ball halves; overall is monotonic in the reporter.
    const n = planned.length
    const poseFraction = new Array<number>(n).fill(0)
    const ballFraction = new Array<number>(n).fill(0)
    let servesDone = 0
    const report = () => {
      let sum = 0
      let posed = 0 // windows whose pose is done
      for (let k = 0; k < n; k++) {
        sum += (poseFraction[k] + ballFraction[k]) / 2
        if (poseFraction[k] >= 1) posed++
      }
      const step = posed < n ? 'tracking-body' : 'tracking-ball'
      progress.update(step, sum / n, { serveIndex: Math.min(n, (posed < n ? posed : servesDone) + 1), servesDone })
    }

    // Ball jobs: begin + every ball frame on the job's worker (jobs on one worker run in turn).
    // A job id is the window index, bumped per re-plan so a stale job can never feed a new one.
    interface BallJob {
      id: number
      client: BallClient
      sparseSetup: BallSetup
      detected: Promise<{ framesDecoded: number; planarFrames: number }>
    }
    let epoch = 0
    const clientTail: Promise<unknown>[] = balls.map(() => Promise.resolve())
    const clientLoad = balls.map(() => 0)
    const startBallJob = (i: number): BallJob => {
      const w = planned[i]
      const sparseSetup = setupFor(sparseIn(w))
      const ballFrames = ballIndices(w, meta().captureFps)
      let k = 0
      for (let c = 1; c < balls.length; c++) if (clientLoad[c] < clientLoad[k]) k = c
      clientLoad[k] += ballFrames.length
      const client = balls[k]
      const id = w.index + epoch * 100_000
      let acks = 0
      ballAcks.set(id, () => {
        ballFraction[i] = ++acks / Math.max(1, ballFrames.length)
        report()
      })
      const downscale = ballDownscaleFor(sparseSetup.expectedRadiusNorm, meta().height)
      const config = windowConfig(w, sparseSetup)
      ballCrops[i] = config.crop
      cropScales.push(downscale)
      const detected = clientTail[k].then(() =>
        runBallDetect(frameSource!, client, { windowId: id, ballFrames, ballConfig: config, ballDownscale: downscale, display: display(), signal, cpuPixels: ballCpu }),
      )
      clientTail[k] = detected.catch(() => undefined)
      detected.catch(() => undefined) // observed when the window is ended
      return { id, client, sparseSetup, detected }
    }
    // Every window's ball detection starts now (speculatively for an unknown time base: the plan only
    // changes on a slow-motion correction, and then the later jobs are started again).
    let ballJobs: BallJob[] = planned.map((_, i) => startBallJob(i))

    // Pose: every window's job, in window order, shared out over the lanes.
    const poseKeys: string[] = []
    const requestPose = (i: number): Promise<PoseFrame[]> => {
      const job = poseJobFor(planned[i], seedPoses, covered, frameTimes())
      poseKeys[i] = job.key
      poseProgress.set(job.key, (done, total) => {
        if (poseKeys[i] !== job.key) return
        poseFraction[i] = done / Math.max(1, total)
        report()
      })
      const promise = queue.request(job.key, job, true).then((poses) => {
        if (poseKeys[i] === job.key) poseFraction[i] = 1
        report()
        return poses
      })
      promise.catch(() => undefined) // observed in window order below
      return promise
    }
    const poseJobs = planned.map((_, i) => requestPose(i))

    for (let i = 0; i < n; i++) {
      throwIfAborted(signal)
      let w = planned[i]
      const job = ballJobs[i]
      const detected = await raceAbortWork(job.detected)
      let poses = await raceAbortWork(poseJobs[i])
      let ballResult = await raceAbortWork(job.client.end(job.id, analyseOptionsFor(job.sparseSetup)(setupPoses(w, poses))))
      ballAcks.delete(job.id)
      ballFraction[i] = 1
      timings.denseBallMs += ballResult.timings.detectMs + ballResult.timings.readbackMs
      timings.ballReadbackMs += ballResult.timings.readbackMs
      timings.ballAnalyseMs += ballResult.timings.analyseMs
      timings.ballFrames += ballResult.framesProcessed
      timings.framesDecoded += detected.framesDecoded
      timings.ballPlanarFrames += detected.planarFrames

      // The first toss decides an unknown time base (gravity); a correction re-times everything,
      // re-runs this window's ball detection on the corrected timestamps and re-plans the rest.
      if (timeBase.status === 'unknown' && ballResult.toss?.status === 'ok') {
        const before = meta().timeScale
        const checked = applyGravityCheck(timeBase, ballResult.timeBase)
        timeBase = checked.decision
        if (checked.warning) warn(checked.warning)
        frameSource.setMeta(timeBase.meta)
        if (checked.changed) {
          const factor = meta().timeScale / before
          warn(`This looks like slow motion (${Math.round(meta().captureFps)} fps), so we corrected the timing.`)
          const windowSparse = sparseIn(w)
          sparseClean = retimePoses(sparseClean, factor)
          sparseRaw = retimePoses(sparseRaw, factor)
          for (let k = 0; k < densePosesByWindow.length; k++) densePosesByWindow[k] = retimePoses(densePosesByWindow[k], factor)
          poses = retimePoses(poses, factor)
          onsets = [] // time-scaled audio is never used for timing
          engineWindows = engineWindows.map((ew) => ({ ...ew, startReal: ew.startReal * factor, endReal: ew.endReal * factor }))
          const replanned = planWindows(engineWindows, { frameTimes: frameTimes(), sparsePoses: sparseClean, handedness, view: options.view, aspect })
          for (let k = 0; k < planned.length && k < replanned.length; k++) planned[k] = { ...replanned[k], index: planned[k].index }
          w = planned[i]
          epoch++
          // Later windows: their detection and pose ran on the old plan and time base; start them
          // again (their old pose jobs are dropped unless already running).
          ballJobs = ballJobs.map((old, k) => (k > i ? startBallJob(k) : old))
          for (let k = i + 1; k < n; k++) {
            queue.drop(poseKeys[k])
            poseFraction[k] = 0
            poseJobs[k] = requestPose(k)
          }
          const redoSetup = setupFor(windowSparse.map((p) => ({ ...p, tReal: p.tReal * factor })))
          const redoId = w.index + epoch * 100_000 + 50_000
          const redo = await raceAbortWork(
            runBallDetect(frameSource, job.client, { windowId: redoId, ballFrames: ballIndices(w, meta().captureFps), ballConfig: windowConfig(w, redoSetup), ballDownscale: ballDownscaleFor(job.sparseSetup.expectedRadiusNorm, meta().height), display: display(), signal, cpuPixels: ballCpu }),
          )
          ballResult = await raceAbortWork(job.client.end(redoId, analyseOptionsFor(job.sparseSetup)(setupPoses(w, poses))))
          timings.denseBallMs += ballResult.timings.detectMs + ballResult.timings.readbackMs
          timings.ballReadbackMs += ballResult.timings.readbackMs
          timings.ballFrames += ballResult.framesProcessed
          timings.framesDecoded += redo.framesDecoded
          timings.ballPlanarFrames += redo.planarFrames
        }
      }
      for (const p of poses) denseFrameSet.add(p.frameIndex)
      densePosesByWindow.push(poses)
      ballResults.push(ballResult)
      servesDone = i + 1
      report()
      if (persist) await patchJob(jobId, { completedWindows: planned.slice(0, i + 1).map((p) => p.index), progress: progress.current })
    }
    await settleWithin(queue.close(), DISPOSE_BUDGET_MS)
    progress.update('tracking-ball', 1, { serveIndex: n, servesDone: n })
    timings.denseMs = now() - denseStarted
    timings.ballCropScale = cropScales.length ? cropScales.reduce((a, b) => a + b, 0) / cropScales.length : 1
    const laneStats = poseLanes.map((lane) => lane.stats?.())
    timings.poseBackend = laneStats[0]?.backend ?? 'unknown'
    if (laneStats.some((st) => st?.detectErrors.length)) warn('Part of this video could not be tracked, so some serves may be missing values.')
    await Promise.all(poseLanes.map((lane) => settleWithin(lane.dispose(), DISPOSE_BUDGET_MS)))
    densePose = null
    extraPose = []
    for (const b of balls) b.dispose()
    balls = []
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
        windows: planned.map((p, k) => ({
          startReal: frameTimes()[p.startFrame],
          endReal: frameTimes()[p.endFrame],
          contactT: p.contact.tReal,
          contactSource: p.contact.source,
          confidence: p.confidence,
          ballCrop: ballCrops[k] ?? p.crop,
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
    ended = true
    signal?.removeEventListener('abort', onAbort)
    for (const b of balls) b.dispose()
    await Promise.all([settleWithin(sparsePose?.dispose(), DISPOSE_BUDGET_MS), settleWithin(densePose?.dispose(), DISPOSE_BUDGET_MS), ...extraPose.map((lane) => settleWithin(lane.dispose(), DISPOSE_BUDGET_MS))])
    frameSource?.close()
  }
}
