/**
 * A compact, rectified pose track with the time-series helpers every event and metric uses:
 * landmark access with a visibility floor, mid-hip, lowest foot point, head top, and values and
 * velocities from a local quadratic fit (never frame-to-frame differences, §2.4).
 */
import { LM, type Landmark, type PoseFrame } from '../types.ts'
import { estimateHeadTopY } from '../pose/body.ts'
import { rectifyPoint, type CameraModel } from './geometry.ts'

export const LANDMARKS = 33

export interface PoseTrack {
  aspect: number
  /** Sorted by time. */
  t: Float64Array
  frameIndex: Int32Array
  /** [frame * 33 + landmark] rectified normalised coordinates; NaN when absent. */
  x: Float64Array
  y: Float64Array
  vis: Float64Array
  interpolated: Uint8Array
  /** Frame has a pose at all. */
  has: Uint8Array
  /** Median frame period (s). */
  dt: number
}

/** Builds a rectified track from cleaned PoseFrames. */
export function buildTrack(frames: readonly PoseFrame[], cam: CameraModel): PoseTrack {
  const sorted = [...frames].sort((a, b) => a.tReal - b.tReal)
  const n = sorted.length
  const t = new Float64Array(n)
  const frameIndex = new Int32Array(n)
  const x = new Float64Array(n * LANDMARKS).fill(Number.NaN)
  const y = new Float64Array(n * LANDMARKS).fill(Number.NaN)
  const vis = new Float64Array(n * LANDMARKS)
  const interpolated = new Uint8Array(n * LANDMARKS)
  const has = new Uint8Array(n)
  sorted.forEach((f, i) => {
    t[i] = f.tReal
    frameIndex[i] = f.frameIndex
    if (!f.landmarks) return
    has[i] = 1
    for (let k = 0; k < LANDMARKS; k++) {
      const lm = f.landmarks[k]
      if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) continue
      const r = rectifyPoint(cam, lm.x, lm.y)
      x[i * LANDMARKS + k] = r.x
      y[i * LANDMARKS + k] = r.y
      vis[i * LANDMARKS + k] = lm.interpolated ? Math.min(lm.visibility, 0.49) : lm.visibility
      interpolated[i * LANDMARKS + k] = lm.interpolated ? 1 : 0
    }
  })
  const steps: number[] = []
  for (let i = 1; i < n; i++) if (t[i] > t[i - 1]) steps.push(t[i] - t[i - 1])
  steps.sort((a, b) => a - b)
  const dt = steps.length ? steps[steps.length >> 1] : 1 / 30
  return { aspect: cam.aspect, t, frameIndex, x, y, vis, interpolated, has, dt }
}

/** Landmarks of frame i as PoseFrame landmarks (rectified), for helpers from pose/body. */
export function landmarksAt(track: PoseTrack, i: number): Landmark[] | null {
  if (!track.has[i]) return null
  const out: Landmark[] = []
  for (let k = 0; k < LANDMARKS; k++) {
    const j = i * LANDMARKS + k
    out.push({ x: track.x[j], y: track.y[j], visibility: Number.isFinite(track.x[j]) ? track.vis[j] : 0, interpolated: track.interpolated[j] === 1 })
  }
  return out
}

export function pt(track: PoseTrack, i: number, k: number, minVis = 0.3): { x: number; y: number; v: number } | null {
  const j = i * LANDMARKS + k
  const x = track.x[j]
  if (!Number.isFinite(x) || track.vis[j] < minVis) return null
  return { x, y: track.y[j], v: track.vis[j] }
}

export function midHip(track: PoseTrack, i: number, minVis = 0.3): { x: number; y: number; v: number } | null {
  const a = pt(track, i, LM.LEFT_HIP, minVis)
  const b = pt(track, i, LM.RIGHT_HIP, minVis)
  if (!a || !b) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) }
}

export function midShoulder(track: PoseTrack, i: number, minVis = 0.3): { x: number; y: number; v: number } | null {
  const a = pt(track, i, LM.LEFT_SHOULDER, minVis)
  const b = pt(track, i, LM.RIGHT_SHOULDER, minVis)
  if (!a || !b) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) }
}

const FOOT_POINTS = [LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]

/** Lowest foot point (largest y) among heels and foot indexes (both feet; labels do not matter). */
export function lowestFootY(track: PoseTrack, i: number, minVis = 0.5, bodyHeightHU?: number): number | null {
  let best = -Infinity
  for (const k of FOOT_POINTS) {
    const p = pt(track, i, k, minVis)
    if (p && p.y > best) best = p.y
  }
  if (Number.isFinite(best)) return best
  if (bodyHeightHU) {
    let ank = -Infinity
    for (const k of [LM.LEFT_ANKLE, LM.RIGHT_ANKLE]) {
      const p = pt(track, i, k, minVis)
      if (p && p.y > ank) ank = p.y
    }
    if (Number.isFinite(ank)) return ank + 0.039 * bodyHeightHU
  }
  return null
}

export function headTopY(track: PoseTrack, i: number, minVis = 0.5): number | null {
  const lms = landmarksAt(track, i)
  if (!lms) return null
  return estimateHeadTopY(lms, track.aspect, minVis)?.y ?? null
}

/** Index of the frame nearest time t (binary search). */
export function indexAt(track: PoseTrack, t: number): number {
  const n = track.t.length
  if (n === 0) return -1
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (track.t[m] < t) lo = m
    else hi = m
  }
  return Math.abs(track.t[lo] - t) <= Math.abs(track.t[hi] - t) ? lo : hi
}

/** Frame indices with t in [a, b]. */
export function rangeIdx(track: PoseTrack, a: number, b: number): number[] {
  const out: number[] = []
  for (let i = 0; i < track.t.length; i++) if (track.t[i] >= a - 1e-9 && track.t[i] <= b + 1e-9) out.push(i)
  return out
}

export type Scalar = (i: number) => number | null

/**
 * Local quadratic fit around time t0 over samples within ±halfWindowS (at least `minSide`
 * samples each side when available). Returns the value, first and second derivative at t0.
 */
export function localQuadratic(
  track: PoseTrack,
  f: Scalar,
  t0: number,
  halfWindowS: number,
  minPoints = 5,
): { value: number; slope: number; curvature: number; n: number } | null {
  const ts: number[] = []
  const vs: number[] = []
  for (let i = 0; i < track.t.length; i++) {
    const d = track.t[i] - t0
    if (Math.abs(d) > halfWindowS + 1e-9) continue
    const v = f(i)
    if (v === null || !Number.isFinite(v)) continue
    ts.push(d)
    vs.push(v)
  }
  if (ts.length < Math.max(3, minPoints)) {
    if (ts.length >= 2) {
      // Linear fallback.
      const mt = ts.reduce((a, b) => a + b, 0) / ts.length
      const mv = vs.reduce((a, b) => a + b, 0) / vs.length
      let sxx = 0
      let sxy = 0
      for (let k = 0; k < ts.length; k++) {
        sxx += (ts[k] - mt) ** 2
        sxy += (ts[k] - mt) * (vs[k] - mv)
      }
      const slope = sxx > 0 ? sxy / sxx : 0
      return { value: mv - slope * mt, slope, curvature: 0, n: ts.length }
    }
    return null
  }
  // Normal equations for v = a + b d + c d².
  let s0 = 0
  let s1 = 0
  let s2 = 0
  let s3 = 0
  let s4 = 0
  let y0 = 0
  let y1 = 0
  let y2 = 0
  for (let k = 0; k < ts.length; k++) {
    const d = ts[k]
    const d2 = d * d
    s0 += 1
    s1 += d
    s2 += d2
    s3 += d2 * d
    s4 += d2 * d2
    y0 += vs[k]
    y1 += vs[k] * d
    y2 += vs[k] * d2
  }
  const A = [
    [s0, s1, s2],
    [s1, s2, s3],
    [s2, s3, s4],
  ]
  const sol = solve3(A, [y0, y1, y2])
  if (!sol) return null
  return { value: sol[0], slope: sol[1], curvature: 2 * sol[2], n: ts.length }
}

function solve3(A: number[][], b: number[]): number[] | null {
  const m = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < 3; c++) {
    let p = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-15) return null
    ;[m[c], m[p]] = [m[p], m[c]]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
}

/** Speed (BH/s) of a 2D point series at time t from local quadratic fits of x (HU) and y. */
export function pointSpeed(track: PoseTrack, getter: (i: number) => { x: number; y: number } | null, t0: number, halfWindowS: number, bodyHeightHU: number): number | null {
  const fx = localQuadratic(track, (i) => {
    const p = getter(i)
    return p ? p.x * track.aspect : null
  }, t0, halfWindowS)
  const fy = localQuadratic(track, (i) => getter(i)?.y ?? null, t0, halfWindowS)
  if (!fx || !fy) return null
  return Math.hypot(fx.slope, fy.slope) / bodyHeightHU
}

/** Default velocity half-window: about 9 frames at 60 fps, never fewer than 3 samples a side. */
export function velocityHalfWindow(track: PoseTrack): number {
  return Math.max(0.067, 3.2 * track.dt)
}
