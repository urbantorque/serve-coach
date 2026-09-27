/**
 * Reader for the synthetic corpus truth (tools/synth, format "serve-synth-truth/1").
 * Only the fields the validation harness scores against are typed here; see
 * tools/synth/README.md for the full format. Pure TypeScript (runs in Node tests).
 */
import { LM, type CameraView, type Handedness, type Landmark } from '../analysis/types.ts'

export interface SynthTruthEvent {
  tReal: number
  tMedia: number
  frameIndex: number
  inClip: boolean
}

export interface SynthTruthBall {
  state: string
  x: number
  y: number
  /** Frame-height units. */
  radius: number
  inFrame: boolean
  occluded: boolean
  held: boolean
  streak?: [number, number, number, number]
}

export interface SynthTruthFrame {
  frameIndex: number
  tMedia: number
  tReal: number
  landmarks: Landmark[]
  /** Court-frame 3D joints (metres), same order as landmarks. */
  world?: number[][]
  balls: SynthTruthBall[]
}

export interface SynthAudioEvent {
  kind: string
  serveIndex: number
  emitTReal: number
  arrivalTReal: number
  arrivalTMedia: number
  distanceM: number
  peakDbfs: number
}

export interface SynthTruth {
  format: string
  clipId: string
  groups?: string[]
  video: { width: number; height: number; fps: number; captureFps: number; timeScale: number; frameCount: number; durationMediaS?: number }
  settings: {
    view: CameraView
    distanceM: number
    orientation: string
    intrinsics: { fxPx: number; fyPx: number; cxPx: number; cyPx: number; width: number; height: number }
    extrinsics: { R: number[]; t: number[] }
    lighting?: { preset: string; flickerHz?: number | null }
    crf?: number
  }
  player: { heightM: number; handedness: Handedness }
  serves: Array<{
    courtSide: 'deuce' | 'ad'
    direction: string
    style?: string
    events: Record<string, SynthTruthEvent | unknown>
    metrics: Record<string, number | boolean | string>
  }>
  audio?: { sampleRate: number; events: SynthAudioEvent[] }
  frames: SynthTruthFrame[]
}

export function isSynthTruth(value: unknown): value is SynthTruth {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<SynthTruth>
  return typeof v.format === 'string' && v.format.startsWith('serve-synth-truth') && Array.isArray(v.frames) && !!v.video && !!v.settings
}

/** An event of serve `serveIndex`, when it lies inside the clip. */
export function truthEvent(truth: SynthTruth, name: string, serveIndex = 0): SynthTruthEvent | null {
  const e = truth.serves[serveIndex]?.events[name] as SynthTruthEvent | undefined
  return e && typeof e.tReal === 'number' && e.inClip !== false ? e : null
}

/** Projects a court point (metres) with the clip's pinhole camera (the corpus has no lens distortion). */
export function projectCourtPointPx(truth: SynthTruth, p: readonly number[]): { u: number; v: number } | null {
  const { R, t } = truth.settings.extrinsics
  const { fxPx, fyPx, cxPx, cyPx } = truth.settings.intrinsics
  const c = [0, 1, 2].map((row) => R[3 * row] * p[0] + R[3 * row + 1] * p[1] + R[3 * row + 2] * p[2] + t[row])
  if (!(c[2] > 0)) return null
  return { u: (fxPx * c[0]) / c[2] + cxPx, v: (fyPx * c[1]) / c[2] + cyPx }
}

/**
 * Standing stature in pixels: the player's height projected at the hip midpoint of the first
 * frame (the body-height unit, BH, for pose errors). Falls back to the 2D head-to-heel span of
 * frame 0 when the truth has no world joints.
 */
export function truthStaturePx(truth: SynthTruth): number {
  const first = truth.frames[0]
  const world = first?.world
  if (world && world[LM.LEFT_HIP] && world[LM.RIGHT_HIP]) {
    const hip = [0, 1].map((k) => (world[LM.LEFT_HIP][k] + world[LM.RIGHT_HIP][k]) / 2)
    const foot = projectCourtPointPx(truth, [hip[0], hip[1], 0])
    const head = projectCourtPointPx(truth, [hip[0], hip[1], truth.player.heightM])
    if (foot && head) return Math.hypot(foot.u - head.u, foot.v - head.v)
  }
  const lm = first?.landmarks
  if (!lm) return Number.NaN
  const heel = Math.max(lm[LM.LEFT_HEEL].y, lm[LM.RIGHT_HEEL].y)
  // Nose to crown is about 0.12 statures.
  return ((heel - lm[LM.NOSE].y) / 0.88) * truth.video.height
}

/** Player-entered stand-ins the app would get from its setup flow: view, height, hand, target tag, side. */
export interface PlayerInputs {
  view: CameraView
  playerHeightM: number | null
  handedness: Handedness | null
  targetTag: 'T' | 'body' | 'wide' | null
  servedFrom: 'deuce' | 'ad' | null
}

export function playerInputsFromTruth(truth: SynthTruth): PlayerInputs {
  const serve = truth.serves[0]
  const tag = (['T', 'body', 'wide'] as const).find((t) => t === serve?.direction) ?? null
  return {
    view: truth.settings.view,
    playerHeightM: truth.player.heightM,
    handedness: truth.player.handedness,
    targetTag: tag,
    servedFrom: serve?.courtSide ?? null,
  }
}
