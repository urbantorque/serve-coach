/**
 * Pose track cleaning, in this order:
 *   1. left/right swap correction (continuity against the previous frame),
 *   2. outlier rejection (excursions implying implausible acceleration for body size),
 *   3. short-gap interpolation (interpolated = true, visibility = 0),
 *   4. One Euro smoothing with a 2D-speed adaptive cutoff.
 *
 * All geometry runs in frame-height units (HU) and thresholds are expressed in body
 * heights (BH) so the same parameters work for a player filling the frame or a player
 * 15 m away, and at 30 or 240 fps (every step uses real timestamps, never frame counts).
 */
import type { Landmark, PoseFrame } from '../types.ts'
import { estimateStandingBodyHeight, torsoLengthHU, ANTHROPOMETRY } from './body.ts'
import { LANDMARK_COUNT, SWAP_GROUPS, type SwapGroupName, isFiniteLandmark, median } from './landmarks.ts'

// ---------------------------------------------------------------------------
// One Euro filter
// ---------------------------------------------------------------------------

export interface OneEuroParams {
  /** Cutoff when the landmark is still (Hz). Lower = smoother but more lag at low speed. */
  minCutoffHz: number
  /** Cutoff increase per body-height-per-second of speed. Higher = less lag when fast. */
  beta: number
  /** Cutoff of the speed estimate that drives the adaptation (Hz). */
  dCutoffHz: number
}

/**
 * Chosen by a sweep on the noisy synthetic serve (README "Smoothing parameters"): at
 * rest the cutoff is ~0.8 Hz and removes most detector jitter; at racket-arm speeds
 * (2-8 BH/s) it rises to 17-65 Hz, i.e. almost no smoothing at 30-60 fps. dCutoff is
 * 3 Hz rather than the usual 1 Hz so the speed estimate reacts within a frame or two
 * when the swing starts (1 Hz lagged the wrist apex by 14-33 ms at 30-60 fps).
 * Tuned against injected noise, not real MediaPipe output: re-tune on the validation set.
 */
export const SPORTS_ONE_EURO: OneEuroParams = { minCutoffHz: 0.8, beta: 8, dCutoffHz: 3 }

export function smoothingAlpha(cutoffHz: number, dtS: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dtS)
}

/**
 * Scalar One Euro filter (Casiez, Roussel & Vogel, CHI 2012). `speedScale` converts
 * the value's units into the units `beta` is expressed in (for HU values and beta per
 * BH/s, pass 1 / bodyHeightHU).
 */
export class OneEuroFilter {
  private xPrev: number | null = null
  private dxPrev = 0
  private tPrev: number | null = null

  constructor(
    readonly params: OneEuroParams,
    readonly speedScale = 1,
  ) {}

  reset(): void {
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }

  filter(value: number, tS: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = value
      this.tPrev = tS
      return value
    }
    const dt = Math.abs(tS - this.tPrev)
    if (dt <= 0) return this.xPrev
    const dx = (value - this.xPrev) / dt
    const dxHat = this.dxPrev + smoothingAlpha(this.params.dCutoffHz, dt) * (dx - this.dxPrev)
    const cutoff = this.params.minCutoffHz + this.params.beta * Math.abs(dxHat) * this.speedScale
    const xHat = this.xPrev + smoothingAlpha(cutoff, dt) * (value - this.xPrev)
    this.xPrev = xHat
    this.dxPrev = dxHat
    this.tPrev = tS
    return xHat
  }
}

/**
 * One Euro over one landmark track where the adaptive cutoff uses the 2D speed
 * |(dx, dy)| rather than each axis's own speed. At the wrist apex the vertical speed is
 * ~0 but the hand is still moving fast forward; a per-axis filter would drop y's
 * cutoff to minCutoff exactly at the apex and flatten/delay the peak.
 * `order` lists the sample indices to visit (reversed for the backward pass).
 */
function oneEuroTrack2D(
  t: Float64Array,
  x: Float64Array,
  y: Float64Array,
  z: Float64Array,
  order: readonly number[],
  params: OneEuroParams,
  bodyHeightHU: number,
  out: { x: Float64Array; y: Float64Array; z: Float64Array },
): void {
  let prev = -1
  let dxHat = 0
  let dyHat = 0
  for (const i of order) {
    if (prev < 0) {
      out.x[i] = x[i]
      out.y[i] = y[i]
      out.z[i] = z[i]
      prev = i
      dxHat = 0
      dyHat = 0
      continue
    }
    const dt = Math.abs(t[i] - t[prev])
    if (dt <= 0) {
      out.x[i] = out.x[prev]
      out.y[i] = out.y[prev]
      out.z[i] = out.z[prev]
      prev = i
      continue
    }
    const aD = smoothingAlpha(params.dCutoffHz, dt)
    dxHat += aD * ((x[i] - out.x[prev]) / dt - dxHat)
    dyHat += aD * ((y[i] - out.y[prev]) / dt - dyHat)
    const speedBHps = Math.hypot(dxHat, dyHat) / bodyHeightHU
    const a = smoothingAlpha(params.minCutoffHz + params.beta * speedBHps, dt)
    out.x[i] = out.x[prev] + a * (x[i] - out.x[prev])
    out.y[i] = out.y[prev] + a * (y[i] - out.y[prev])
    out.z[i] = Number.isFinite(z[i]) && Number.isFinite(out.z[prev]) ? out.z[prev] + a * (z[i] - out.z[prev]) : z[i]
    prev = i
  }
}

// ---------------------------------------------------------------------------
// Series representation
// ---------------------------------------------------------------------------

const MISSING = 0
const OBSERVED = 1
const INTERPOLATED = 2
const REJECTED = 3

interface LandmarkSeries {
  x: Float64Array // HU
  y: Float64Array
  z: Float64Array // NaN when absent
  vis: Float64Array
  state: Uint8Array
}

interface Track {
  t: Float64Array
  series: LandmarkSeries[]
}

function toTrack(frames: readonly PoseFrame[], frameAspect: number, minVisibility: number): Track {
  const n = frames.length
  const t = Float64Array.from(frames, (f) => f.tReal)
  const series: LandmarkSeries[] = []
  for (let k = 0; k < LANDMARK_COUNT; k++) {
    const s: LandmarkSeries = {
      x: new Float64Array(n).fill(Number.NaN),
      y: new Float64Array(n).fill(Number.NaN),
      z: new Float64Array(n).fill(Number.NaN),
      vis: new Float64Array(n),
      state: new Uint8Array(n),
    }
    for (let i = 0; i < n; i++) {
      const lm = frames[i].landmarks?.[k]
      if (!isFiniteLandmark(lm)) continue
      s.x[i] = lm.x * frameAspect
      s.y[i] = lm.y
      s.z[i] = lm.z ?? Number.NaN
      s.vis[i] = lm.visibility ?? 0
      s.state[i] = s.vis[i] >= minVisibility && !lm.interpolated ? OBSERVED : MISSING
    }
    series.push(s)
  }
  return { t, series }
}

function isGood(state: number): boolean {
  return state === OBSERVED || state === INTERPOLATED
}

// ---------------------------------------------------------------------------
// 1. Left/right swap correction
// ---------------------------------------------------------------------------

export interface SwapOptions {
  /** A relation is decided only when one assignment costs less than this fraction of the other. */
  costRatio?: number
  /** ...and the two differ by at least this many body heights per landmark. */
  minGainBodyHeights?: number
  /** Frames further apart than this are not compared (the chain breaks). */
  maxReferenceAgeS?: number
  /** Only segments up to this long are ever relabelled; longer ones are reported instead. */
  maxSwapSegmentS?: number
}

export interface SwapCorrection {
  frameIndex: number
  group: SwapGroupName
}

/** A stretch whose labels flip against the rest of its track but is too long (or too balanced) to relabel safely. */
export interface UnresolvedSwap {
  group: SwapGroupName
  startFrame: number
  endFrame: number
  reason: 'long-minority' | 'tie'
}

const KEEP = 1
const FLIP = -1
const UNKNOWN = 0

function swapSample(a: LandmarkSeries, b: LandmarkSeries, i: number): void {
  for (const key of ['x', 'y', 'z', 'vis'] as const) {
    const tmp = a[key][i]
    a[key][i] = b[key][i]
    b[key][i] = tmp
  }
  const st = a.state[i]
  a.state[i] = b.state[i]
  b.state[i] = st
}

/**
 * Relation of each frame's labels to its reference frame (the previous frame where the
 * group was seen): KEEP, FLIP, or UNKNOWN when the costs are too close or there is no
 * reference. Uses raw data only, so one wrong call cannot propagate. The prediction is
 * constant-velocity from the two previous frames when their relation is known.
 */
function swapRelations(
  track: Track,
  pairs: ReadonlyArray<readonly [number, number]>,
  bodyHeightHU: number,
  options: Required<SwapOptions>,
): { relation: Int8Array; reference: Int32Array; seen: Uint8Array } {
  const { t, series } = track
  const n = t.length
  const relation = new Int8Array(n)
  const reference = new Int32Array(n).fill(-1)
  const seen = new Uint8Array(n)
  const pairGood = (i: number, l: number, r: number) => isGood(series[l].state[i]) && isGood(series[r].state[i])
  let prev = -1
  for (let i = 0; i < n; i++) {
    if (!pairs.some(([l, r]) => pairGood(i, l, r))) continue
    seen[i] = 1
    const j = prev
    prev = i
    if (j < 0 || t[i] - t[j] > options.maxReferenceAgeS) continue
    reference[i] = j
    const k = reference[j]
    const velocityOk = k >= 0 && relation[j] !== UNKNOWN && t[j] - t[k] > 0
    let keep = 0
    let swap = 0
    let used = 0
    for (const [l, r] of pairs) {
      if (!pairGood(i, l, r) || !pairGood(j, l, r)) continue
      const predictAt = (idx: number) => {
        const s = series[idx]
        if (!velocityOk || !pairGood(k, l, r)) return { x: s.x[j], y: s.y[j] }
        const src = series[relation[j] === FLIP ? (idx === l ? r : l) : idx]
        const f = (t[i] - t[j]) / (t[j] - t[k])
        return { x: s.x[j] + (s.x[j] - src.x[k]) * f, y: s.y[j] + (s.y[j] - src.y[k]) * f }
      }
      const pl = predictAt(l)
      const pr = predictAt(r)
      const sl = series[l]
      const sr = series[r]
      keep += Math.hypot(sl.x[i] - pl.x, sl.y[i] - pl.y) + Math.hypot(sr.x[i] - pr.x, sr.y[i] - pr.y)
      swap += Math.hypot(sr.x[i] - pl.x, sr.y[i] - pl.y) + Math.hypot(sl.x[i] - pr.x, sl.y[i] - pr.y)
      used++
    }
    if (used === 0) continue
    const gapBH = Math.abs(keep - swap) / (2 * used) / bodyHeightHU
    if (gapBH < options.minGainBodyHeights) continue
    if (swap < options.costRatio * keep) relation[i] = FLIP
    else if (keep < options.costRatio * swap) relation[i] = KEEP
  }
  return { relation, reference, seen }
}

/**
 * Segment-based swap correction. Frames linked by KEEP/FLIP relations form a component
 * whose frames have a parity (label flips relative to the component's first frame).
 * The detector is assumed right most of the time, so the minority parity is relabelled,
 * but only if every run of it is short (a detector swap lasts a fraction of a second).
 * A single spurious FLIP between two long runs therefore changes nothing.
 */
function correctSwaps(
  track: Track,
  bodyHeightHU: number,
  options: SwapOptions,
): { corrections: SwapCorrection[]; unresolved: UnresolvedSwap[] } {
  const opts: Required<SwapOptions> = {
    costRatio: 0.5,
    minGainBodyHeights: 0.05,
    maxReferenceAgeS: 0.2,
    maxSwapSegmentS: 0.5,
    ...options,
  }
  const corrections: SwapCorrection[] = []
  const unresolved: UnresolvedSwap[] = []
  const n = track.t.length
  for (const [group, pairs] of Object.entries(SWAP_GROUPS) as Array<[SwapGroupName, ReadonlyArray<readonly [number, number]>]>) {
    const { relation, reference, seen } = swapRelations(track, pairs, bodyHeightHU, opts)
    const component = new Int32Array(n).fill(-1)
    const parity = new Uint8Array(n)
    const componentMembers: number[][] = []
    for (let i = 0; i < n; i++) {
      if (!seen[i]) continue
      const j = reference[i]
      if (j >= 0 && relation[i] !== UNKNOWN) {
        component[i] = component[j]
        parity[i] = parity[j] ^ (relation[i] === FLIP ? 1 : 0)
      } else {
        component[i] = componentMembers.length
        componentMembers.push([])
      }
      componentMembers[component[i]].push(i)
    }
    for (const members of componentMembers) {
      const odd = members.filter((i) => parity[i] === 1).length
      if (odd === 0) continue
      const span = { group, startFrame: members[0], endFrame: members[members.length - 1] }
      if (odd * 2 === members.length) {
        unresolved.push({ ...span, reason: 'tie' })
        continue
      }
      const minority = odd * 2 < members.length ? 1 : 0
      // Runs of consecutive minority members (in component order) must all be short.
      let runStart = -1
      let allShort = true
      members.forEach((i, m) => {
        const inRun = parity[i] === minority
        if (inRun && runStart < 0) runStart = i
        const next = members[m + 1]
        if (inRun && (next === undefined || parity[next] !== minority)) {
          if (track.t[i] - track.t[runStart] > opts.maxSwapSegmentS) allShort = false
          runStart = -1
        }
      })
      if (!allShort) {
        unresolved.push({ ...span, reason: 'long-minority' })
        continue
      }
      for (const i of members) {
        if (parity[i] !== minority) continue
        for (const [l, r] of pairs) swapSample(track.series[l], track.series[r], i)
        corrections.push({ frameIndex: i, group })
      }
    }
  }
  corrections.sort((a, b) => a.frameIndex - b.frameIndex)
  return { corrections, unresolved }
}

// ---------------------------------------------------------------------------
// 2. Outlier rejection
// ---------------------------------------------------------------------------

export interface OutlierOptions {
  /**
   * Largest plausible landmark acceleration, body heights / s^2. For a constant
   * acceleration a, a sample deviates from the chord between its neighbours by at most
   * a/2 * (t - tPrev) * (tNext - t); larger deviations are implausible. 300 BH/s^2
   * (~540 m/s^2 for a 1.8 m player) is ~2x the wrist's peak acceleration in a serve.
   */
  maxAccelBodyHeightsPerS2?: number
  /** Deviations below this are never rejected (detector jitter scale), body heights. */
  minExcursionBodyHeights?: number
  /**
   * Extra tolerance proportional to the local speed (BH/s) across the excursion, in
   * seconds. Detector error grows with motion blur, and blur-scale error on the hitting
   * hand at contact is noise to smooth, not an outlier; rejecting it and interpolating
   * biased the wrist-apex time late by ~5 ms in tests. 0.02 s adds 0.14 BH at 7 BH/s.
   */
  speedToleranceS?: number
  /** Longest run of consecutive bad samples treated as one excursion. */
  maxRunFrames?: number
  /** Do not judge across neighbours further apart than this (s). */
  maxBridgeS?: number
}

/** Returns the sample indices of one landmark series judged to be excursions. */
export function findExcursions(
  t: ArrayLike<number>,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  good: ArrayLike<boolean>,
  bodyHeightHU: number,
  options: OutlierOptions = {},
): number[] {
  const {
    maxAccelBodyHeightsPerS2 = 300,
    minExcursionBodyHeights = 0.06,
    speedToleranceS = 0.02,
    maxRunFrames = 5,
    maxBridgeS = 0.3,
  } = options
  let valid: number[] = []
  for (let i = 0; i < t.length; i++) if (good[i]) valid.push(i)
  const rejected: number[] = []

  for (let pass = 0; pass < 8; pass++) {
    const candidates: Array<{ p: number; len: number; score: number }> = []
    for (let p = 1; p < valid.length - 1; p++) {
      for (let len = 1; len <= maxRunFrames && p + len < valid.length; len++) {
        const prev = valid[p - 1]
        const next = valid[p + len]
        const span = t[next] - t[prev]
        if (span <= 0 || span > maxBridgeS) break
        const chordSpeedBHps = Math.hypot(x[next] - x[prev], y[next] - y[prev]) / span / bodyHeightHU
        const speedAllowanceBH = speedToleranceS * chordSpeedBHps
        let score = Infinity
        for (let q = p; q < p + len; q++) {
          const s = valid[q]
          const f = (t[s] - t[prev]) / span
          const cx = x[prev] + (x[next] - x[prev]) * f
          const cy = y[prev] + (y[next] - y[prev]) * f
          const residualBH = Math.hypot(x[s] - cx, y[s] - cy) / bodyHeightHU
          const allowedBH =
            Math.max(minExcursionBodyHeights, 0.5 * maxAccelBodyHeightsPerS2 * (t[s] - t[prev]) * (t[next] - t[s])) +
            speedAllowanceBH
          score = Math.min(score, residualBH / allowedBH)
          if (score <= 1) break
        }
        if (score > 1) candidates.push({ p, len, score })
      }
    }
    if (candidates.length === 0) break

    // Accept the strongest excursions first; within one pass, accepted runs (with their
    // bracketing neighbours) may not overlap, because a spike also distorts the chord of
    // the samples next to it.
    candidates.sort((a, b) => b.score - a.score)
    const locked = new Uint8Array(valid.length)
    const drop = new Set<number>()
    for (const c of candidates) {
      let free = true
      for (let q = c.p - 1; q <= c.p + c.len; q++) if (locked[q]) free = false
      if (!free) continue
      for (let q = c.p - 1; q <= c.p + c.len; q++) locked[q] = 1
      for (let q = c.p; q < c.p + c.len; q++) drop.add(valid[q])
    }
    rejected.push(...drop)
    valid = valid.filter((i) => !drop.has(i))
  }
  return rejected.sort((a, b) => a - b)
}

function rejectOutliers(track: Track, bodyHeightHU: number, options: OutlierOptions): Array<{ frameIndex: number; landmark: number }> {
  const out: Array<{ frameIndex: number; landmark: number }> = []
  track.series.forEach((s, landmark) => {
    const good = Array.from(s.state, (st) => st === OBSERVED)
    for (const i of findExcursions(track.t, s.x, s.y, good, bodyHeightHU, options)) {
      s.state[i] = REJECTED
      out.push({ frameIndex: i, landmark })
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// 3. Gap interpolation
// ---------------------------------------------------------------------------

export interface GapOptions {
  /** Largest span (s) between the two observed samples bracketing a gap that is filled. */
  maxGapS?: number
  /** Optional cap on the number of missing frames filled per gap. */
  maxGapFrames?: number
  /** 'cubic' = Hermite with finite-difference tangents; 'linear' = straight line. */
  method?: 'cubic' | 'linear'
}

/** Fills short gaps in one series in place; returns the number of samples filled. */
function interpolateSeries(t: Float64Array, s: LandmarkSeries, options: GapOptions): number {
  const { maxGapS = 0.1, maxGapFrames = Number.POSITIVE_INFINITY, method = 'cubic' } = options
  const good: number[] = []
  for (let i = 0; i < t.length; i++) if (s.state[i] === OBSERVED) good.push(i)
  let filled = 0
  for (let g = 0; g + 1 < good.length; g++) {
    const a = good[g]
    const b = good[g + 1]
    const missing = b - a - 1
    if (missing === 0) continue
    const h = t[b] - t[a]
    if (missing > maxGapFrames || h > maxGapS + 1e-9 || h <= 0) continue

    const tangent = (from: number, to: number, key: 'x' | 'y' | 'z') => (s[key][to] - s[key][from]) / (t[to] - t[from])
    const before = g > 0 && t[a] - t[good[g - 1]] <= maxGapS ? good[g - 1] : a
    const after = g + 2 < good.length && t[good[g + 2]] - t[b] <= maxGapS ? good[g + 2] : b
    for (let i = a + 1; i < b; i++) {
      const u = (t[i] - t[a]) / h
      for (const key of ['x', 'y', 'z'] as const) {
        const pa = s[key][a]
        const pb = s[key][b]
        if (method === 'linear' || !Number.isFinite(pa) || !Number.isFinite(pb)) {
          s[key][i] = pa + (pb - pa) * u
          continue
        }
        const ma = tangent(before, b, key)
        const mb = tangent(a, after, key)
        const u2 = u * u
        const u3 = u2 * u
        s[key][i] =
          (2 * u3 - 3 * u2 + 1) * pa + (u3 - 2 * u2 + u) * h * ma + (-2 * u3 + 3 * u2) * pb + (u3 - u2) * h * mb
      }
      s.vis[i] = 0
      s.state[i] = INTERPOLATED
      filled++
    }
  }
  return filled
}

// ---------------------------------------------------------------------------
// 4. Smoothing and the full pipeline
// ---------------------------------------------------------------------------

export interface SmoothingOptions {
  enabled?: boolean
  params?: OneEuroParams
  /** Per-landmark overrides (index -> params). */
  perLandmark?: Partial<Record<number, OneEuroParams>>
  /**
   * Zero-phase mode: run the filter forwards and backwards and average. A causal filter
   * always lags, which shifts the wrist apex (the contact cue) late by a frame or more;
   * the two passes lag in opposite directions and cancel. Offline analysis only.
   */
  preservePeaks?: boolean
}

export interface PoseCleanOptions {
  /** Frame width / height of the displayed frame. Required: angles and speeds need isotropic units. */
  frameAspect: number
  /** Standing body height (HU). Estimated from the frames when omitted. */
  bodyHeightHU?: number
  /** Samples below this visibility are treated as missing. */
  minVisibility?: number
  swaps?: SwapOptions & { enabled?: boolean }
  outliers?: OutlierOptions & { enabled?: boolean }
  gaps?: GapOptions & { enabled?: boolean }
  smoothing?: SmoothingOptions
}

export interface PoseCleanReport {
  bodyHeightHU: number
  bodyHeightSource: 'given' | 'setup-estimate' | 'torso-estimate' | 'default'
  swapsCorrected: SwapCorrection[]
  /** Label flips left alone because relabelling them was not safe; metrics using that limb should be downgraded. */
  swapsUnresolved: UnresolvedSwap[]
  outliersRejected: Array<{ frameIndex: number; landmark: number }>
  interpolatedSamples: number
  /** Frames that had no pose and could not be filled. */
  framesWithoutPose: number
}

export interface PoseCleanResult {
  frames: PoseFrame[]
  report: PoseCleanReport
}

function resolveBodyHeight(
  frames: readonly PoseFrame[],
  options: PoseCleanOptions,
): { heightHU: number; source: PoseCleanReport['bodyHeightSource'] } {
  if (options.bodyHeightHU !== undefined && options.bodyHeightHU > 0) return { heightHU: options.bodyHeightHU, source: 'given' }
  const estimate = estimateStandingBodyHeight(frames, { frameAspect: options.frameAspect })
  if (estimate) return { heightHU: estimate.heightHU, source: 'setup-estimate' }
  const torsos = frames
    .map((f) => (f.landmarks ? torsoLengthHU(f.landmarks, options.frameAspect, 0.3) : null))
    .filter((v): v is number => v !== null)
  if (torsos.length > 0) return { heightHU: median(torsos) / ANTHROPOMETRY.torsoPerStature, source: 'torso-estimate' }
  return { heightHU: 0.5, source: 'default' }
}

/**
 * Runs swap correction, outlier rejection, gap filling and smoothing over one pose
 * track (a single person, frames in time order). Returns new frames; input is untouched.
 * Rejected samples that cannot be filled keep their raw coordinates with visibility 0.
 */
export function cleanPoseFrames(frames: readonly PoseFrame[], options: PoseCleanOptions): PoseCleanResult {
  const { frameAspect, minVisibility = 0.05 } = options
  const { heightHU, source } = resolveBodyHeight(frames, options)
  const track = toTrack(frames, frameAspect, minVisibility)
  const report: PoseCleanReport = {
    bodyHeightHU: heightHU,
    bodyHeightSource: source,
    swapsCorrected: [],
    swapsUnresolved: [],
    outliersRejected: [],
    interpolatedSamples: 0,
    framesWithoutPose: 0,
  }

  const swapResult = options.swaps?.enabled === false ? { corrections: [], unresolved: [] } : correctSwaps(track, heightHU, options.swaps ?? {})
  const swaps = swapResult.corrections
  report.swapsCorrected = swaps.map((c) => ({ ...c, frameIndex: frames[c.frameIndex].frameIndex }))
  report.swapsUnresolved = swapResult.unresolved.map((u) => ({
    ...u,
    startFrame: frames[u.startFrame].frameIndex,
    endFrame: frames[u.endFrame].frameIndex,
  }))
  if (options.outliers?.enabled !== false) {
    report.outliersRejected = rejectOutliers(track, heightHU, options.outliers ?? {}).map((o) => ({
      ...o,
      frameIndex: frames[o.frameIndex].frameIndex,
    }))
  }
  if (options.gaps?.enabled !== false) {
    for (const s of track.series) report.interpolatedSamples += interpolateSeries(track.t, s, options.gaps ?? {})
  }

  const smoothed = options.smoothing?.enabled === false ? null : smoothTrack(track, heightHU, options.smoothing ?? {})
  const out = assembleFrames(frames, track, smoothed, frameAspect, swaps)
  report.framesWithoutPose = out.filter((f) => f.landmarks === null).length
  return { frames: out, report }
}

function smoothTrack(track: Track, bodyHeightHU: number, options: SmoothingOptions): LandmarkSeries[] {
  const { params = SPORTS_ONE_EURO, perLandmark = {}, preservePeaks = true } = options
  const n = track.t.length
  return track.series.map((s, k) => {
    const p = perLandmark[k] ?? params
    const result: LandmarkSeries = { ...s, x: s.x.slice(), y: s.y.slice(), z: s.z.slice() }
    // Smooth each contiguous run of good samples independently.
    let i = 0
    while (i < n) {
      if (!isGood(s.state[i])) {
        i++
        continue
      }
      const run: number[] = []
      while (i < n && isGood(s.state[i])) run.push(i++)
      const forward = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) }
      oneEuroTrack2D(track.t, s.x, s.y, s.z, run, p, bodyHeightHU, forward)
      if (!preservePeaks) {
        for (const j of run) {
          result.x[j] = forward.x[j]
          result.y[j] = forward.y[j]
          result.z[j] = forward.z[j]
        }
        continue
      }
      const backward = { x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n) }
      oneEuroTrack2D(track.t, s.x, s.y, s.z, [...run].reverse(), p, bodyHeightHU, backward)
      for (const j of run) {
        result.x[j] = (forward.x[j] + backward.x[j]) / 2
        result.y[j] = (forward.y[j] + backward.y[j]) / 2
        result.z[j] = (forward.z[j] + backward.z[j]) / 2
      }
    }
    return result
  })
}

/** Applies the image-landmark swaps to world landmarks too, so both stay consistent. */
function swapWorldLandmarks(frame: PoseFrame, groups: readonly SwapGroupName[]): PoseFrame['worldLandmarks'] {
  const world = frame.worldLandmarks
  if (!world || groups.length === 0) return world
  const swapped = world.map((p) => ({ ...p }))
  for (const group of groups) {
    for (const [l, r] of SWAP_GROUPS[group]) {
      if (world[l] && world[r]) {
        swapped[l] = { ...world[r] }
        swapped[r] = { ...world[l] }
      }
    }
  }
  return swapped
}

function assembleFrames(
  frames: readonly PoseFrame[],
  track: Track,
  smoothed: LandmarkSeries[] | null,
  frameAspect: number,
  swaps: readonly SwapCorrection[],
): PoseFrame[] {
  const values = smoothed ?? track.series
  const swapsByFrame = new Map<number, SwapGroupName[]>()
  for (const c of swaps) swapsByFrame.set(c.frameIndex, [...(swapsByFrame.get(c.frameIndex) ?? []), c.group])
  return frames.map((frame, i) => {
    // A frame the detector missed is emitted only if every landmark could be filled.
    if (frame.landmarks === null && !track.series.every((s) => isGood(s.state[i]))) return { ...frame, landmarks: null }
    const landmarks: Landmark[] = track.series.map((s, k) => {
      const v = values[k]
      const state = s.state[i]
      const z = v.z[i]
      const lm: Landmark = {
        x: v.x[i] / frameAspect,
        y: v.y[i],
        visibility: state === INTERPOLATED || state === REJECTED ? 0 : s.vis[i],
      }
      if (Number.isFinite(z)) lm.z = z
      if (state === INTERPOLATED) lm.interpolated = true
      return lm
    })
    return { ...frame, landmarks, worldLandmarks: swapWorldLandmarks(frame, swapsByFrame.get(i) ?? []) }
  })
}
