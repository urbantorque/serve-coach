/**
 * Read helpers over the stored compact tracks (ARCHITECTURE §6.3 PoseTrackCompact / BallTrackCompact).
 * Pure functions; coordinates stay normalised to the displayed frame (x / width, y / height).
 */
import { LM, type Handedness } from '../../../analysis/types.ts'
import type { BallTrackCompact, PoseTrackCompact } from '../../../data/domain.ts'

export interface Pt {
  x: number
  y: number
  /** Visibility 0..1 (0 where the cleaner interpolated across a gap). */
  v: number
}

export interface BallPoint {
  x: number
  y: number
  frame: number
  /** Gap-filled prediction rather than a detection. */
  predicted: boolean
}

const LANDMARKS = 33

/** Index into `frameIndices` of the sample nearest `frame`, or -1 when none is within `tolerance` frames. */
export function sampleIndexAt(frameIndices: ArrayLike<number>, frame: number, tolerance = 2): number {
  const n = frameIndices.length
  if (n === 0) return -1
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frameIndices[mid] < frame) lo = mid + 1
    else hi = mid
  }
  let best = lo
  if (lo > 0 && Math.abs(frameIndices[lo - 1] - frame) <= Math.abs(frameIndices[lo] - frame)) best = lo - 1
  return Math.abs(frameIndices[best] - frame) <= tolerance ? best : -1
}

/** All 33 landmarks at `frame` (null entries where absent), or null when the frame has no pose. */
export function landmarksAt(pose: PoseTrackCompact | undefined, frame: number): (Pt | null)[] | null {
  if (!pose) return null
  const i = sampleIndexAt(pose.frameIndices, frame)
  if (i < 0) return null
  const out: (Pt | null)[] = []
  let any = false
  for (let k = 0; k < LANDMARKS; k++) {
    const o = (i * LANDMARKS + k) * 3
    const x = pose.xyv[o]
    const y = pose.xyv[o + 1]
    const v = pose.xyv[o + 2]
    if (Number.isFinite(x) && Number.isFinite(y)) {
      out.push({ x, y, v: Number.isFinite(v) ? v : 0 })
      any = true
    } else out.push(null)
  }
  return any ? out : null
}

const mid = (a: Pt | null | undefined, b: Pt | null | undefined, minV: number): Pt | null =>
  a && b && a.v >= minV && b.v >= minV ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) } : null

/** Mid-hip at `frame` (both hips at visibility ≥ minV). */
export function midHipAt(pose: PoseTrackCompact | undefined, frame: number, minV = 0.5): Pt | null {
  const lm = landmarksAt(pose, frame)
  return lm ? mid(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP], minV) : null
}

/** Mid-shoulder at `frame`. */
export function midShoulderAt(pose: PoseTrackCompact | undefined, frame: number, minV = 0.5): Pt | null {
  const lm = landmarksAt(pose, frame)
  return lm ? mid(lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER], minV) : null
}

/** Mid-hip samples between two frames (inclusive), for the hip trace. */
export function hipTrace(pose: PoseTrackCompact | undefined, from: number, to: number, minV = 0.5): (Pt & { frame: number })[] {
  if (!pose) return []
  const out: (Pt & { frame: number })[] = []
  for (let i = 0; i < pose.frameIndices.length; i++) {
    const f = pose.frameIndices[i]
    if (f < from || f > to) continue
    const p = midHipAt(pose, f, minV)
    if (p) out.push({ ...p, frame: f })
  }
  return out
}

/** Front foot for a server by label (a right-hander's left foot leads; frontFootSide in analysis/pose/body.ts). */
export function frontToeIndex(handedness: Handedness): LM {
  return handedness === 'right' ? LM.LEFT_FOOT_INDEX : LM.RIGHT_FOOT_INDEX
}

/**
 * The front toe identified geometrically, not by label (METRICS §2.4.6: side-view pose often swaps
 * left and right): of the two foot-index landmarks, the one furthest into the court. Into the court
 * is image right for a right-hander filmed from the hitting-arm side (D1).
 */
export function frontToeOf(lm: (Pt | null)[] | null, handedness: Handedness, minV = 0.5): Pt | null {
  if (!lm) return null
  const fwd = handedness === 'right' ? 1 : -1
  let best: Pt | null = null
  for (const k of [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]) {
    const p = lm[k]
    if (!p || p.v < minV) continue
    if (!best || fwd * p.x > fwd * best.x) best = p
  }
  return best
}

/** The higher of the two wrists (the hitting hand near contact), by geometry rather than label. */
export function higherWristOf(lm: (Pt | null)[] | null, minV = 0.5): Pt | null {
  if (!lm) return null
  const ws = [lm[LM.LEFT_WRIST], lm[LM.RIGHT_WRIST]].filter((p): p is Pt => p !== null && p.v >= minV)
  return ws.length ? ws.reduce((a, b) => (b.y < a.y ? b : a)) : null
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Standing reference from the first frames of the serve window (before the toss): the floor (lowest
 * visible foot point), the front toe and the player's column. Robust to a few bad frames (median).
 */
export interface StandingRef {
  groundY: number
  toe: { x: number; y: number } | null
  columnX: number
}

export function standingRef(
  pose: PoseTrackCompact | undefined,
  handedness: Handedness,
  fromFrame: number,
  toFrame: number,
): StandingRef | null {
  if (!pose) return null
  const ground: number[] = []
  const toeX: number[] = []
  const toeY: number[] = []
  const col: number[] = []
  for (let i = 0; i < pose.frameIndices.length; i++) {
    const f = pose.frameIndices[i]
    if (f < fromFrame || f > toFrame) continue
    const lm = landmarksAt(pose, f)
    if (!lm) continue
    const feet = [LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]
      .map((k) => lm[k])
      .filter((p): p is Pt => p !== null && p.v >= 0.5)
    if (feet.length) ground.push(Math.max(...feet.map((p) => p.y)))
    const toe = frontToeOf(lm, handedness)
    if (toe) {
      toeX.push(toe.x)
      toeY.push(toe.y)
    }
    const hip = mid(lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP], 0.5)
    if (hip) col.push(hip.x)
  }
  const g = median(ground)
  const cx = median(col)
  if (g === null || cx === null) return null
  const tx = median(toeX)
  const ty = median(toeY)
  return { groundY: g, toe: tx !== null && ty !== null ? { x: tx, y: ty } : null, columnX: cx }
}

const BALL_KIND = { toss: 0, outgoing: 1, bounce: 2, unknown: 3 } as const
export type BallKind = keyof typeof BALL_KIND

/** Ball samples of one kind between two frames, in time order. */
export function ballPoints(
  ball: BallTrackCompact | undefined,
  opts: { kind?: BallKind | 'any'; from?: number; to?: number } = {},
): BallPoint[] {
  if (!ball) return []
  const kind = opts.kind ?? 'toss'
  const from = opts.from ?? -Infinity
  const to = opts.to ?? Infinity
  const out: BallPoint[] = []
  for (let i = 0; i < ball.frameIndices.length; i++) {
    const f = ball.frameIndices[i]
    if (f < from || f > to) continue
    if (kind !== 'any' && ball.kind[i] !== BALL_KIND[kind]) continue
    if (!Number.isFinite(ball.x[i]) || !Number.isFinite(ball.y[i])) continue
    out.push({ x: ball.x[i], y: ball.y[i], frame: f, predicted: ball.predicted[i] === 1 })
  }
  return out.sort((a, b) => a.frame - b.frame)
}

/** The ball sample nearest `frame` (any kind, detections preferred), within `tolerance` frames. */
export function ballNear(ball: BallTrackCompact | undefined, frame: number, tolerance = 3): BallPoint | null {
  let best: BallPoint | null = null
  let bestD = Infinity
  for (const p of ballPoints(ball, { kind: 'any', from: frame - tolerance, to: frame + tolerance })) {
    const d = Math.abs(p.frame - frame) + (p.predicted ? 0.5 : 0)
    if (d < bestD) {
      best = p
      bestD = d
    }
  }
  return best
}

/** The highest toss sample (smallest y): the drawn peak when the stored events carry no position. */
export function tossPeak(ball: BallTrackCompact | undefined): BallPoint | null {
  const pts = ballPoints(ball, { kind: 'toss' })
  return pts.reduce<BallPoint | null>((best, p) => (best === null || p.y < best.y ? p : best), null)
}
