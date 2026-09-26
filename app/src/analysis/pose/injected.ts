/**
 * InjectedPoseSource: replays ground-truth landmarks (e.g. from the synthetic
 * generator's truth.json) as PoseFrames, optionally corrupted by a configurable,
 * seeded noise model, so downstream metrics can be stress-tested without images.
 *
 * Noise model (all sizes in body heights, BH, so it is independent of framing):
 *  - Gaussian jitter on every coordinate.
 *  - Extra jitter on fast arm landmarks proportional to their 2D speed (motion blur).
 *  - Whole-frame dropouts (the detector loses the person), in bursts.
 *  - Per-landmark visibility drops with extra position error (occlusion).
 *  - Occasional left/right swaps of a limb group lasting a few frames.
 * Every injected event is logged so tests can check what the cleaning stage caught.
 */
import type { Landmark, PoseFrame } from '../types.ts'
import { estimateStandingBodyHeight } from './body.ts'
import { FAST_ARM_LANDMARKS, LANDMARK_COUNT, SWAP_GROUPS, type SwapGroupName, CORE_LANDMARKS, MIRROR_INDEX } from './landmarks.ts'
import type { FrameStream, PoseInputFrame, PoseSource } from './poseSource.ts'
import { type Rng, gaussian, geometricLength, mulberry32 } from './rng.ts'

/** One ground-truth frame. Landmarks are normalised like PoseFrame (33, MediaPipe order). */
export interface TruthPoseFrame {
  frameIndex: number
  tReal: number
  landmarks: Array<{ x: number; y: number; z?: number; visibility?: number }> | null
}

export interface PoseNoiseConfig {
  seed?: number
  /** Gaussian sigma per coordinate, BH. MediaPipe-like jitter is ~0.003-0.01 BH. */
  jitterSigmaBodyHeights?: number
  /** Extra sigma = speedJitterS x 2D speed (BH/s) for `fastLandmarks`. Seconds (an effective blur time). */
  speedJitterS?: number
  fastLandmarks?: readonly number[]
  /** Probability per frame that a whole-frame dropout burst starts. */
  frameDropoutProb?: number
  frameDropoutMeanFrames?: number
  /** Probability per landmark per frame of a visibility drop. */
  landmarkDropoutProb?: number
  /** Visibility after a drop is uniform in [0, landmarkDropoutMaxVisibility]. */
  landmarkDropoutMaxVisibility?: number
  /** Extra sigma for a dropped (occluded) landmark, BH. */
  occludedSigmaBodyHeights?: number
  /** Probability per frame that a left/right swap starts (per event, one group or all). */
  swapProb?: number
  swapMeanFrames?: number
  swapGroups?: ReadonlyArray<SwapGroupName | 'all'>
  /** Visibility for clean landmarks when the truth has none. */
  baseVisibility?: number
  visibilitySigma?: number
}

export const DEFAULT_POSE_NOISE: Required<PoseNoiseConfig> = {
  seed: 1,
  jitterSigmaBodyHeights: 0.005,
  speedJitterS: 0.004,
  fastLandmarks: FAST_ARM_LANDMARKS,
  frameDropoutProb: 0.01,
  frameDropoutMeanFrames: 1.5,
  landmarkDropoutProb: 0.01,
  landmarkDropoutMaxVisibility: 0.2,
  occludedSigmaBodyHeights: 0.03,
  swapProb: 0.005,
  swapMeanFrames: 3,
  swapGroups: ['arms', 'legs', 'all'],
  baseVisibility: 0.95,
  visibilitySigma: 0.03,
}

export type NoiseEvent =
  | { kind: 'frame-dropout'; frameIndex: number }
  | { kind: 'landmark-dropout'; frameIndex: number; landmark: number }
  | { kind: 'swap'; frameIndex: number; group: SwapGroupName }

export interface NoisyPoseResult {
  frames: PoseFrame[]
  events: NoiseEvent[]
  bodyHeightHU: number
}

export interface ApplyNoiseOptions {
  frameAspect: number
  /** Standing height in HU; estimated from the truth when omitted. */
  bodyHeightHU?: number
}

/** Converts truth frames to clean PoseFrames (visibility defaulted, source 'injected'). */
export function truthToPoseFrames(truth: readonly TruthPoseFrame[], baseVisibility = 1): PoseFrame[] {
  return truth.map((f) => ({
    frameIndex: f.frameIndex,
    tReal: f.tReal,
    landmarks: f.landmarks
      ? f.landmarks.map((lm) => {
          const out: Landmark = { x: lm.x, y: lm.y, visibility: lm.visibility ?? baseVisibility }
          if (lm.z !== undefined) out.z = lm.z
          return out
        })
      : null,
    score: f.landmarks ? 1 : 0,
    source: 'injected',
  }))
}

/** 2D speed (BH/s) of each landmark per frame, central differences on the truth. */
function landmarkSpeeds(frames: readonly PoseFrame[], frameAspect: number, bodyHeightHU: number): Float64Array[] {
  return frames.map((frame, i) => {
    const speeds = new Float64Array(LANDMARK_COUNT)
    const prev = frames[i - 1]
    const next = frames[i + 1]
    const a = prev?.landmarks ? prev : frame
    const b = next?.landmarks ? next : frame
    const dt = b.tReal - a.tReal
    if (!frame.landmarks || !a.landmarks || !b.landmarks || dt <= 0) return speeds
    for (let k = 0; k < LANDMARK_COUNT; k++) {
      const pa = a.landmarks[k]
      const pb = b.landmarks[k]
      speeds[k] = Math.hypot((pb.x - pa.x) * frameAspect, pb.y - pa.y) / dt / bodyHeightHU
    }
    return speeds
  })
}

function pickSwapGroups(rng: Rng, choices: ReadonlyArray<SwapGroupName | 'all'>): SwapGroupName[] {
  const choice = choices[Math.floor(rng() * choices.length)] ?? 'arms'
  return choice === 'all' ? (['face', 'arms', 'legs'] as SwapGroupName[]) : [choice]
}

/**
 * Applies the noise model to clean frames. Deterministic for a given seed.
 * Truth frames with null landmarks stay null.
 */
export function applyPoseNoise(
  clean: readonly PoseFrame[],
  config: PoseNoiseConfig,
  options: ApplyNoiseOptions,
): NoisyPoseResult {
  const c = { ...DEFAULT_POSE_NOISE, ...config }
  const rng = mulberry32(c.seed)
  const { frameAspect } = options
  const bodyHeightHU =
    options.bodyHeightHU ?? estimateStandingBodyHeight(clean, { frameAspect })?.heightHU ?? 0.5
  const speeds = landmarkSpeeds(clean, frameAspect, bodyHeightHU)
  const fast = new Set(c.fastLandmarks)
  const events: NoiseEvent[] = []
  const sigmaHU = (bh: number) => bh * bodyHeightHU

  let dropoutLeft = 0
  const swapLeft: Record<SwapGroupName, number> = { face: 0, arms: 0, legs: 0 }

  const frames = clean.map((frame, i): PoseFrame => {
    // Draw event starts every frame, so the random stream does not depend on outcomes.
    const startDropout = rng() < c.frameDropoutProb
    const dropoutLength = geometricLength(rng, c.frameDropoutMeanFrames)
    const startSwap = rng() < c.swapProb
    const swapGroupsDrawn = pickSwapGroups(rng, c.swapGroups)
    const swapLength = geometricLength(rng, c.swapMeanFrames)

    if (dropoutLeft === 0 && startDropout) dropoutLeft = dropoutLength
    if (startSwap) for (const g of swapGroupsDrawn) if (swapLeft[g] === 0) swapLeft[g] = swapLength

    if (!frame.landmarks) return { ...frame, landmarks: null, score: 0, source: 'injected' }
    if (dropoutLeft > 0) {
      dropoutLeft--
      events.push({ kind: 'frame-dropout', frameIndex: frame.frameIndex })
      for (const g of Object.keys(swapLeft) as SwapGroupName[]) if (swapLeft[g] > 0) swapLeft[g]--
      return { ...frame, landmarks: null, worldLandmarks: null, score: 0, source: 'injected' }
    }

    // Source index per output landmark after any active swaps.
    const sourceIndex = Array.from({ length: LANDMARK_COUNT }, (_, k) => k)
    for (const g of Object.keys(swapLeft) as SwapGroupName[]) {
      if (swapLeft[g] === 0) continue
      swapLeft[g]--
      events.push({ kind: 'swap', frameIndex: frame.frameIndex, group: g })
      for (const [l, r] of SWAP_GROUPS[g]) {
        sourceIndex[l] = MIRROR_INDEX[l]
        sourceIndex[r] = MIRROR_INDEX[r]
      }
    }

    const truthLms = frame.landmarks
    const landmarks: Landmark[] = sourceIndex.map((src, k) => {
      const truth = truthLms[src]
      const speedSigma = fast.has(src) ? c.speedJitterS * speeds[i][src] : 0
      let sigma = Math.hypot(sigmaHU(c.jitterSigmaBodyHeights), sigmaHU(speedSigma))
      let visibility = Math.min(1, Math.max(0, (truth.visibility ?? c.baseVisibility) + c.visibilitySigma * gaussian(rng)))
      if (rng() < c.landmarkDropoutProb) {
        visibility = rng() * c.landmarkDropoutMaxVisibility
        sigma = Math.hypot(sigma, sigmaHU(c.occludedSigmaBodyHeights))
        events.push({ kind: 'landmark-dropout', frameIndex: frame.frameIndex, landmark: k })
      }
      const out: Landmark = {
        x: truth.x + (sigma * gaussian(rng)) / frameAspect,
        y: truth.y + sigma * gaussian(rng),
        visibility,
      }
      if (truth.z !== undefined) out.z = truth.z + sigma * gaussian(rng)
      return out
    })
    const coreVisibility = CORE_LANDMARKS.reduce((sum, k) => sum + landmarks[k].visibility, 0) / CORE_LANDMARKS.length
    return { ...frame, landmarks, score: coreVisibility, source: 'injected' }
  })
  return { frames, events, bodyHeightHU }
}

export interface InjectedPoseSourceOptions {
  frameAspect: number
  /** null / undefined = exact replay. */
  noise?: PoseNoiseConfig | null
  bodyHeightHU?: number
}

/**
 * PoseSource over ground truth. estimate() ignores the images and looks frames up by
 * frameIndex (falling back to the nearest tReal within half a frame); replay() streams
 * every truth frame without needing input frames.
 */
export class InjectedPoseSource implements PoseSource {
  readonly kind = 'injected' as const
  readonly frames: readonly PoseFrame[]
  readonly noiseEvents: readonly NoiseEvent[]
  private readonly byIndex = new Map<number, PoseFrame>()
  private disposed = false

  constructor(truth: readonly TruthPoseFrame[] | readonly PoseFrame[], options: InjectedPoseSourceOptions) {
    const clean = isPoseFrameArray(truth) ? truth.map((f) => ({ ...f, source: 'injected' as const })) : truthToPoseFrames(truth)
    if (options.noise) {
      const noisy = applyPoseNoise(clean, options.noise, { frameAspect: options.frameAspect, bodyHeightHU: options.bodyHeightHU })
      this.frames = noisy.frames
      this.noiseEvents = noisy.events
    } else {
      this.frames = clean
      this.noiseEvents = []
    }
    for (const f of this.frames) this.byIndex.set(f.frameIndex, f)
  }

  async *estimate(frames: FrameStream<Pick<PoseInputFrame, 'frameIndex' | 'tReal'>>): AsyncGenerator<PoseFrame> {
    for await (const input of frames) {
      if (this.disposed) return
      yield this.lookup(input.frameIndex, input.tReal)
    }
  }

  async *replay(): AsyncGenerator<PoseFrame> {
    for (const frame of this.frames) {
      if (this.disposed) return
      yield frame
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
  }

  private lookup(frameIndex: number, tReal: number): PoseFrame {
    const exact = this.byIndex.get(frameIndex)
    if (exact) return { ...exact, tReal }
    let best: PoseFrame | undefined
    for (const f of this.frames) if (!best || Math.abs(f.tReal - tReal) < Math.abs(best.tReal - tReal)) best = f
    const halfFrame = this.frames.length > 1 ? (this.frames[1].tReal - this.frames[0].tReal) / 2 : 0
    if (best && Math.abs(best.tReal - tReal) <= halfFrame + 1e-9) return { ...best, frameIndex, tReal }
    return { frameIndex, tReal, landmarks: null, score: 0, source: 'injected' }
  }
}

function isPoseFrameArray(frames: readonly TruthPoseFrame[] | readonly PoseFrame[]): frames is readonly PoseFrame[] {
  return frames.length > 0 && 'source' in frames[0]
}

// ---------------------------------------------------------------------------
// truth.json adapter
// ---------------------------------------------------------------------------

const LANDMARK_KEYS = ['landmarks', 'landmarks2d', 'pose2d', 'keypoints2d', 'pose'] as const
const INDEX_KEYS = ['frameIndex', 'index', 'frame'] as const
const TIME_KEYS = ['tReal', 't', 'time', 'timeS'] as const

function firstKey<T extends string>(obj: Record<string, unknown>, keys: readonly T[]): unknown {
  for (const key of keys) if (key in obj) return obj[key]
  return undefined
}

/**
 * Tolerant reader for a synthetic truth file: accepts an array of frames or an object
 * with `frames`. Per frame: frameIndex|index|frame, tReal|t|time|timeS, and landmarks
 * under landmarks|landmarks2d|pose2d|keypoints2d|pose as 33 {x,y[,z,visibility]}
 * objects or [x,y(,z)] tuples. Pixel coordinates are normalised when the file gives
 * width/height (top level or under `video`). Throws with a precise message otherwise.
 */
export function parseTruthPoseFrames(json: unknown): TruthPoseFrame[] {
  const root = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  const list = Array.isArray(json) ? json : root.frames
  if (!Array.isArray(list)) throw new Error('truth: expected an array of frames or an object with a "frames" array')
  const video = (root.video ?? root.meta ?? {}) as Record<string, unknown>
  const width = Number(root.width ?? video.width)
  const height = Number(root.height ?? video.height)

  return list.map((raw, n): TruthPoseFrame => {
    if (typeof raw !== 'object' || raw === null) throw new Error(`truth: frame ${n} is not an object`)
    const f = raw as Record<string, unknown>
    const frameIndex = Number(firstKey(f, INDEX_KEYS) ?? n)
    const tReal = Number(firstKey(f, TIME_KEYS))
    if (!Number.isFinite(tReal)) throw new Error(`truth: frame ${n} has no time (tReal | t | time | timeS)`)
    const lmsRaw = firstKey(f, LANDMARK_KEYS)
    if (lmsRaw === null || lmsRaw === undefined) return { frameIndex, tReal, landmarks: null }
    if (!Array.isArray(lmsRaw) || lmsRaw.length !== LANDMARK_COUNT) {
      throw new Error(`truth: frame ${n} landmarks must be an array of ${LANDMARK_COUNT}`)
    }
    const landmarks = lmsRaw.map((p: unknown, k) => {
      const lm = Array.isArray(p)
        ? { x: Number(p[0]), y: Number(p[1]), z: p[2] === undefined ? undefined : Number(p[2]), visibility: undefined as number | undefined }
        : (p as { x: number; y: number; z?: number; visibility?: number })
      if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) throw new Error(`truth: frame ${n} landmark ${k} has non-numeric x/y`)
      return { x: lm.x, y: lm.y, z: lm.z, visibility: lm.visibility }
    })
    const looksLikePixels = landmarks.some((lm) => Math.abs(lm.x) > 2 || Math.abs(lm.y) > 2)
    if (looksLikePixels) {
      if (!(width > 0) || !(height > 0)) throw new Error('truth: pixel coordinates need width/height in the file')
      for (const lm of landmarks) {
        lm.x /= width
        lm.y /= height
      }
    }
    return { frameIndex, tReal, landmarks }
  })
}
