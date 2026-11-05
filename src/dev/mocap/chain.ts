/**
 * The chain against the capture: when each part of the body peaked at 180 Hz,
 * what a phone reads of it, and what can honestly be claimed at each frame rate.
 *
 * Pure, like `report.ts`. `npm run bench:mocap -- --chain` prints it. It is the
 * provenance of the tables in ANALYSIS-REVIEW.md (2026-11-05) and of the choices
 * in `legLead.ts`, and it keeps the methods that lost, because their losing is
 * the finding: every one of them beats the chain's smoothing on clean landmarks
 * and loses to it under a tracker.
 *
 * A take's error is split three ways:
 * - bias, the mean over every take, which a reading can carry and still be
 *   compared with itself;
 * - spread, within a serve, between takes on a sampling phase of their own, plus
 *   how far each serve's mean sits from truth;
 * - lost, the share of takes where the link was refused.
 */
import { CHAIN_WINDOW_SECONDS, diagnose } from '../../lib/analysis/diagnose'
import { LM, sided } from '../../lib/analysis/geometry'
import {
  peakAbsIn,
  peakTimeInside,
  planarSpeedSeries,
  riseSpeedSeries,
  sampleRadius,
  timeline,
} from '../../lib/analysis/kinematics'
import { LEG_LEAD_MIN_RISE, LEG_LEAD_SLACK } from '../../lib/analysis/legLead'
import {
  lateLegs,
  mocapTruth,
  pointAt,
  swingCompleted,
  trackedTake,
  type MocapPoint,
  type MocapServe,
  type VirtualPhone,
  type Vec3,
} from '../../lib/analysis/mocapServe'
import { detectServe, type Skeleton } from '../../lib/analysis/phases'
import { unswapFrames } from '../../lib/analysis/swapGuard'
import { buildServe } from '../../lib/analysis/syntheticServe'
import { MEDIAPIPE_FIT, RTMPOSE_FIT, withTrackerNoise, type TrackerFit } from '../../lib/analysis/trackerNoise'
import type { Frame } from '../../lib/analysis/types'

export const LINKS = ['legs', 'hips', 'trunk', 'shoulder', 'elbow', 'hand'] as const
export type Link = (typeof LINKS)[number]

/* ------------------------------------------------------------------ truth */

/** Slope of a line over ±`h` samples: a derivative that leaves a peak where it is. */
function slopeOf(xs: number[], rate: number, h: number): number[] {
  let den = 0
  for (let k = 1; k <= h; k++) den += 2 * k * k
  return xs.map((_, i) => {
    let sum = 0
    for (let k = 1; k <= h; k++) sum += k * (xs[Math.min(xs.length - 1, i + k)] - xs[Math.max(0, i - k)])
    return (sum / den) * rate
  })
}

function unwrapped(xs: number[]): number[] {
  const out = xs.slice()
  for (let i = 1; i < out.length; i++) {
    while (out[i] - out[i - 1] > 180) out[i] -= 360
    while (out[i] - out[i - 1] < -180) out[i] += 360
  }
  return out
}

function topOf(xs: number[], lo: number, hi: number, signed: boolean): number {
  const v = (x: number) => (signed ? x : Math.abs(x))
  let best = lo
  for (let i = lo; i <= hi; i++) if (v(xs[i]) > v(xs[best])) best = i
  if (best <= 0 || best >= xs.length - 1) return best
  const [a, b, c] = [v(xs[best - 1]), v(xs[best]), v(xs[best + 1])]
  const den = a - 2 * b + c
  return best + (den === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)))
}

const midpoint = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 })

export type ChainTruth = Record<Link, number> & { contact: number }

/**
 * Every link's peak in 3D, seconds on the capture's clock. Slopes over ±5
 * samples, 28 ms either side; from ±2 to ±8 the only peak that moves more than
 * a few milliseconds is the elbow's, by 8. The hips have no peak to speak of at
 * any width: on these serves the pelvis turns at a plateau, and truth itself
 * spreads ±41 ms.
 *
 * Contact is the engine's own definition, the racket wrist at its highest, so a
 * reading against it carries no definition cost. The search closes 60 ms past
 * it because the arm has a second, slower peak as it swings down after the ball.
 */
export function chainTruth(serve: MocapServe, h = 5): ChainTruth {
  const n = serve.count
  const arm = serve.hand
  const series = (fn: (f: number) => number) => Array.from({ length: n }, (_, f) => fn(f))
  const at = (p: MocapPoint, f: number) => pointAt(serve, p, f)
  const speed3 = (p: MocapPoint) => {
    const v = (['x', 'y', 'z'] as const).map((axis) => slopeOf(series((f) => at(p, f)[axis]), serve.rate, h))
    return v[0].map((_, i) => Math.hypot(v[0][i], v[1][i], v[2][i]))
  }
  const yawRate = (a: MocapPoint, b: MocapPoint) =>
    slopeOf(unwrapped(series((f) => (Math.atan2(at(b, f).y - at(a, f).y, at(b, f).x - at(a, f).x) * 180) / Math.PI)), serve.rate, h)
  const truth = mocapTruth(serve)
  const lo = Math.max(0, Math.round((truth.kneeBottom - 0.08) * serve.rate))
  const hi = Math.min(n - 1, Math.round((truth.wristTop + 0.06) * serve.rate))
  const peak = (xs: number[], signed = false) => topOf(xs, lo, hi, signed) / serve.rate
  return {
    legs: peak(slopeOf(series((f) => midpoint(at('leftHip', f), at('rightHip', f)).z), serve.rate, h), true),
    hips: peak(yawRate('leftHip', 'rightHip')),
    trunk: peak(yawRate('leftShoulder', 'rightShoulder')),
    shoulder: peak(speed3(`${arm}Shoulder`)),
    elbow: peak(speed3(`${arm}Elbow`)),
    hand: peak(speed3(`${arm}Wrist`)),
    contact: truth.wristTop,
  }
}

/* --------------------------------------------------------------- the reads */

/** Least squares polynomial about `t0` over ±`W`, tapered towards the ends: c0, c1, ... */
function localFit(t: ArrayLike<number>, x: ArrayLike<number>, t0: number, W: number, degree: number): number[] | null {
  const m = degree + 1
  const A = Array.from({ length: m }, () => new Array<number>(m + 1).fill(0))
  let used = 0
  for (let i = 0; i < t.length; i++) {
    const u = (t[i] - t0) / W
    if (Math.abs(u) > 1 || !Number.isFinite(x[i])) continue
    used++
    const weight = 1 - u * u * 0.9999
    const pow = [1]
    for (let k = 1; k <= 2 * degree; k++) pow[k] = pow[k - 1] * u
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) A[r][c] += weight * pow[r + c]
      A[r][m] += weight * pow[r] * x[i]
    }
  }
  if (used < m + 1) return null
  for (let i = 0; i < m; i++) {
    let p = i
    for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    if (Math.abs(A[p][i]) < 1e-12) return null
    ;[A[i], A[p]] = [A[p], A[i]]
    for (let r = 0; r < m; r++) {
      if (r === i) continue
      const f = A[r][i] / A[i][i]
      for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c]
    }
  }
  return A.map((row, i) => (row[m] / row[i]) / W ** i)
}

/** The fastest moment of a path, from a local cubic slid along it. Null on an edge. */
function localCubicPeak(t: Float32Array, path: Float32Array[], from: number, to: number, W: number, signed: boolean): number | null {
  const step = 0.004
  let a = 0
  while (a < t.length - 1 && t[a] < from - W) a++
  let b = t.length - 1
  while (b > 0 && t[b] > to + W) b--
  const ts = t.subarray(a, b + 1)
  const parts = path.map((x) => x.subarray(a, b + 1))
  let best = -Infinity
  let bestAt: number | null = null
  for (let u = from; u <= to; u += step) {
    const rates = parts.map((x) => localFit(ts, x, u, W, 3)?.[1])
    if (rates.some((r) => r === undefined)) continue
    const v = signed ? rates[0]! : Math.hypot(...(rates as number[]))
    if (v > best) {
      best = v
      bestAt = u
    }
  }
  return bestAt === null || bestAt <= from + step || bestAt >= to - step ? null : bestAt
}

/** The fastest moment of a natural cubic spline through every sample: interpolation and no smoothing. */
function splinePeak(t: Float32Array, path: Float32Array[], from: number, to: number, signed: boolean): number | null {
  const n = t.length
  const rate = path.map((y) => {
    const lower = new Float64Array(n)
    const main = new Float64Array(n).fill(1)
    const upper = new Float64Array(n)
    const right = new Float64Array(n)
    for (let i = 1; i < n - 1; i++) {
      const h0 = t[i] - t[i - 1]
      const h1 = t[i + 1] - t[i]
      lower[i] = h0 / 6
      main[i] = (h0 + h1) / 3
      upper[i] = h1 / 6
      right[i] = (y[i + 1] - y[i]) / h1 - (y[i] - y[i - 1]) / h0
    }
    for (let i = 1; i < n; i++) {
      const m = lower[i] / main[i - 1]
      main[i] -= m * upper[i - 1]
      right[i] -= m * right[i - 1]
    }
    const z = new Float64Array(n)
    z[n - 1] = right[n - 1] / main[n - 1]
    for (let i = n - 2; i >= 0; i--) z[i] = (right[i] - upper[i] * z[i + 1]) / main[i]
    return (u: number) => {
      let lo = 0
      let hi = n - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (t[mid] > u) hi = mid
        else lo = mid
      }
      const h = t[hi] - t[lo]
      const A = (t[hi] - u) / h
      const B = (u - t[lo]) / h
      return (y[hi] - y[lo]) / h - ((3 * A * A - 1) / 6) * h * z[lo] + ((3 * B * B - 1) / 6) * h * z[hi]
    }
  })
  let best = -Infinity
  let bestAt: number | null = null
  for (let u = from; u <= to; u += 0.002) {
    const v = signed ? rate[0](u) : Math.hypot(...rate.map((r) => r(u)))
    if (v > best) {
      best = v
      bestAt = u
    }
  }
  return bestAt
}

export type Method = 'current' | 'spline' | 'parabola' | 'cubic100' | 'cubic130'
export const METHODS: Method[] = ['current', 'spline', 'parabola', 'cubic100', 'cubic130']

export const METHOD_NAMES: Record<Method, string> = {
  current: 'the chain as it stands: 90 ms box either side of the slope, three-point parabola',
  spline: 'sub-frame interpolation: a cubic spline through every sample, no smoothing',
  parabola: 'a curve fitted over a window: parabola over ±100 ms of the same smoothed speed',
  cubic100: 'a local cubic over ±100 ms of the path, slid along it',
  cubic130: 'a local cubic over ±130 ms',
}

type Reading = Partial<Record<Link, number | null>>

/** Every method's reading of the picture-plane links, seconds on the clip's clock. */
export function readPeaks(frames: Frame[], skel: Skeleton): Record<Method, Reading> {
  const t = timeline(frames)
  const R = sided(skel.racket)
  const { keys, bodyHeight } = skel
  const dt = (t[t.length - 1] - t[0]) / (t.length - 1)
  const clampIndex = (i: number) => Math.max(0, Math.min(frames.length - 1, i))
  const fromI = clampIndex(keys.trophy - Math.round(0.08 / dt))
  const toI = clampIndex(keys.contact + Math.round(0.04 / dt))
  const from = t[fromI]
  const to = t[toI]
  const closes = Math.min(to, skel.times.contact + 0.02)

  const up = (lms: number[]) => {
    const out = new Float32Array(frames.length)
    frames.forEach((f, i) => {
      out[i] = -lms.reduce((sum, lm) => sum + f.image[lm].y, 0) / lms.length / bodyHeight
    })
    return out
  }
  const across = (lm: number) => {
    const out = new Float32Array(frames.length)
    frames.forEach((f, i) => {
      out[i] = f.image[lm].x / bodyHeight
    })
    return out
  }
  const hips = [up([LM.leftHip, LM.rightHip])]
  const paths: Record<'shoulder' | 'elbow' | 'hand', Float32Array[]> = {
    shoulder: [across(R.shoulder), up([R.shoulder])],
    elbow: [across(R.elbow), up([R.elbow])],
    hand: [across(R.wrist), up([R.wrist])],
  }
  const radius = sampleRadius(t, CHAIN_WINDOW_SECONDS)
  const smoothed: Record<'legs' | 'shoulder' | 'elbow' | 'hand', Float32Array> = {
    legs: riseSpeedSeries(frames, [LM.leftHip, LM.rightHip], bodyHeight, radius),
    shoulder: planarSpeedSeries(frames, R.shoulder, bodyHeight, radius),
    elbow: planarSpeedSeries(frames, R.elbow, bodyHeight, radius),
    hand: planarSpeedSeries(frames, R.wrist, bodyHeight, radius),
  }
  const seen = ['legs', 'shoulder', 'elbow', 'hand'] as const
  const each = (read: (l: (typeof seen)[number]) => number | null): Reading => Object.fromEntries(seen.map((l) => [l, read(l)]))

  const parabola = (l: (typeof seen)[number]) => {
    const series = smoothed[l]
    const at = peakAbsIn(series, fromI, toI)
    if (at <= fromI || at >= toI) return null
    const near: number[] = []
    for (let i = 0; i < series.length; i++) if (Math.abs(t[i] - t[at]) <= 0.1) near.push(i)
    const c = localFit(near.map((i) => t[i]), near.map((i) => series[i]), t[at], 0.1001, 2)
    return c && c[2] < 0 && Math.abs(c[1] / (2 * c[2])) <= 0.1 ? t[at] - c[1] / (2 * c[2]) : null
  }
  const cubic = (W: number) => (l: (typeof seen)[number]) =>
    l === 'legs' ? localCubicPeak(t, hips, from, to, W, true) : localCubicPeak(t, paths[l], from, closes, W, false)

  return {
    current: each((l) => peakTimeInside(smoothed[l], t, fromI, toI)),
    spline: each((l) => (l === 'legs' ? splinePeak(t, hips, from, to, true) : splinePeak(t, paths[l], from, closes, false))),
    parabola: each(parabola),
    cubic100: each(cubic(0.1)),
    cubic130: each(cubic(0.13)),
  }
}

/* --------------------------------------------------------------- the bench */

export interface Clip {
  name: string
  fps: number
  /** The rate the app reads the file at, when that is not the file's own. */
  grid?: number
}

/** What a phone records, and the two reads the app makes of a real-time file. */
export const CLIPS: Clip[] = [
  { name: '30 fps', fps: 30 },
  { name: '30 read at 32', fps: 30, grid: 32 },
  { name: '60 read at 32', fps: 60, grid: 32 },
  { name: '60 fps', fps: 60 },
  { name: '120 fps', fps: 120 },
]

export const NOISES: { name: string; fit?: TrackerFit }[] = [
  { name: 'phase only' },
  { name: 'MediaPipe', fit: MEDIAPIPE_FIT },
  { name: 'RTMPose', fit: RTMPOSE_FIT },
]

/** Each gap is from the first event to the second; contact is the wrist's top. */
export const GAPS: [Link | 'contact', Link | 'contact'][] = [
  ['legs', 'contact'],
  ['hips', 'contact'],
  ['trunk', 'contact'],
  ['shoulder', 'contact'],
  ['elbow', 'contact'],
  ['hand', 'contact'],
  ['legs', 'elbow'],
  ['elbow', 'hand'],
  ['legs', 'hand'],
  ['shoulder', 'elbow'],
]

export interface GapRow {
  placement: string
  clip: string
  noise: string
  method: Method
  gap: string
  /** Mean reading minus truth, ms. */
  bias: number
  /** Spread of reading minus truth, between takes and between serves, ms. */
  spread: number
  rms: number
  /** Share of takes with a link refused. */
  lost: number
  /** Share of takes read the wrong way round, for a gap whose truth is positive. */
  flipped: number
}

export interface Placement {
  name: string
  phone: Partial<VirtualPhone>
}

export function benchChain(serves: MocapServe[], placement: Placement, takes = 8, log: (s: string) => void = () => {}): GapRow[] {
  const complete = serves.filter(swingCompleted)
  const seeds = Array.from({ length: takes }, (_, i) => 7000 + i * 4523)
  const cells = new Map<string, { errors: number[][]; lost: number; total: number; flipped: number }>()
  complete.forEach((serve, si) => {
    const truth = chainTruth(serve)
    for (const clip of CLIPS) {
      for (const noise of NOISES) {
        for (const seed of seeds) {
          const frames = trackedTake(serve, { fps: clip.fps, grid: clip.grid, fit: noise.fit, seed, phone: placement.phone })
          const rate = clip.grid ?? clip.fps
          let skel: Skeleton
          try {
            skel = detectServe(frames, rate)
          } catch {
            continue
          }
          const contact = skel.times.contact
          const reads = readPeaks(frames, skel)
          const d = diagnose(frames, skel)
          // The trunk pair are yaw rates off the world landmarks, and only the chain reads them.
          const toClip = (ms: number | null) => (ms === null ? null : contact + ms / 1000)
          reads.current.hips = toClip(d.chain.hips.ms)
          reads.current.trunk = toClip(d.chain.shoulders.ms)
          for (const method of METHODS) {
            for (const [a, b] of GAPS) {
              const ra = a === 'contact' ? contact : reads[method][a]
              const rb = b === 'contact' ? contact : reads[method][b]
              if (ra === undefined || rb === undefined) continue
              const key = `${clip.name}|${noise.name}|${method}|${a}>${b}`
              let cell = cells.get(key)
              if (!cell) {
                cell = { errors: complete.map(() => []), lost: 0, total: 0, flipped: 0 }
                cells.set(key, cell)
              }
              cell.total++
              if (ra === null || rb === null) {
                cell.lost++
                continue
              }
              const read = (rb - ra) * 1000
              cell.errors[si].push(read - (truth[b] - truth[a]) * 1000)
              if (read < 0) cell.flipped++
            }
          }
        }
      }
    }
    log(`${placement.name}: serve ${si + 1} of ${complete.length}`)
  })
  return [...cells.entries()].map(([key, c]) => {
    const [clip, noise, method, gap] = key.split('|')
    const all = c.errors.flat()
    const mean = all.reduce((s, x) => s + x, 0) / Math.max(1, all.length)
    const rms = Math.sqrt(all.reduce((s, x) => s + x * x, 0) / Math.max(1, all.length))
    return {
      placement: placement.name,
      clip,
      noise,
      method: method as Method,
      gap,
      bias: mean,
      spread: Math.sqrt(Math.max(0, rms * rms - mean * mean)),
      rms,
      lost: c.lost / Math.max(1, c.total),
      flipped: c.flipped / Math.max(1, c.total),
    }
  })
}

/** The truth table: each link against contact, and the gaps, over the serves. */
export function truthTable(serves: MocapServe[]): { gap: string; mean: number; sd: number; lo: number; hi: number }[] {
  const truths = serves.filter(swingCompleted).map((s) => chainTruth(s))
  return GAPS.map(([a, b]) => {
    const xs = truths.map((t) => (t[b] - t[a]) * 1000)
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    return {
      gap: `${a}>${b}`,
      mean,
      sd: Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1)),
      lo: Math.min(...xs),
      hi: Math.max(...xs),
    }
  })
}

export interface CallRow {
  label: string
  clip: string
  legsFirst: number
  level: number
  armFirst: number
  unread: number
  /** Legs to elbow in 3D, mean over the serves, ms. */
  truth: number
  takes: number
}

/** The three-way call on real serves, and with the legs planted late. */
export function benchCalls(serves: MocapServe[], placement: Placement, delays: number[], takes = 6): CallRow[] {
  const complete = serves.filter(swingCompleted)
  const seeds = Array.from({ length: takes }, (_, i) => 7000 + i * 4523)
  const rows: CallRow[] = []
  for (const delay of delays) {
    for (const clip of CLIPS) {
      const tally = { legs_first: 0, level: 0, arm_first: 0, unread: 0 }
      let truth = 0
      for (const serve of complete) {
        const planted = delay ? lateLegs(serve, delay) : serve
        const t = chainTruth(planted)
        truth += (t.elbow - t.legs) * 1000
        for (const seed of seeds) {
          const frames = trackedTake(planted, { fps: clip.fps, grid: clip.grid, fit: MEDIAPIPE_FIT, seed, phone: placement.phone })
          const rate = clip.grid ?? clip.fps
          try {
            const order = diagnose(frames, detectServe(frames, rate)).legLead?.order
            tally[order ?? 'unread']++
          } catch {
            tally.unread++
          }
        }
      }
      const total = complete.length * seeds.length
      rows.push({
        label: `${placement.name}, legs ${Math.round(delay * 1000)} ms late`,
        clip: clip.name,
        legsFirst: tally.legs_first / total,
        level: tally.level / total,
        armFirst: tally.arm_first / total,
        unread: tally.unread / total,
        truth: truth / complete.length,
        takes: total,
      })
    }
  }
  return rows
}

export interface RiseRow {
  rise: number
  gap: number
  spread: number
  lowest: number
  read: number
  takes: number
}

/**
 * The gap against how far the hips rose: the rig's legs stiffened by steps, at
 * 30 fps under MediaPipe's noise, on `chain` directly so nothing is gated. Where
 * `LEG_LEAD_MIN_RISE` comes from. The rig's true gap stays near 100 ms, so the
 * spread and the lowest reading are the whole story.
 */
export function riseSweep(takes = 32): RiseRow[] {
  const seeds = Array.from({ length: takes }, (_, i) => 7000 + i * 4523)
  const stature = (f: Frame, space: 'image' | 'world') =>
    (Math.max(f[space][LM.leftAnkle].y, f[space][LM.rightAnkle].y) - f[space][LM.nose].y) / 0.93
  return (
    [
      [175, 0.93],
      [165, 0.95],
      [155, 0.97],
      [150, 0.98],
      [150, 1.0],
      [145, 1.02],
      [140, 1.04],
      [130, 1.08],
    ] as const
  ).map(([trophyKneeAngle, contactHipHeight]) => {
    const gaps: number[] = []
    const rises: number[] = []
    for (const seed of seeds) {
      const clean = buildServe({ trophyKneeAngle, contactHipHeight, seed }, 30)
      const frames = unswapFrames(
        withTrackerNoise(clean, {
          fit: MEDIAPIPE_FIT,
          fps: 30,
          stature: stature(clean[0], 'image'),
          statureM: stature(clean[0], 'world'),
          seed,
          depthMultiplier: 4,
          depthBias: 0.006,
        }),
      ).frames
      try {
        const d = diagnose(frames, detectServe(frames, 30))
        if (d.legDrive.rise !== null) rises.push(d.legDrive.rise)
        if (d.chain.legs.ms !== null && d.chain.elbow.ms !== null) gaps.push(d.chain.elbow.ms - d.chain.legs.ms)
      } catch {
        // A refused take is one the reading never saw.
      }
    }
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    const gap = mean(gaps)
    return {
      rise: mean(rises),
      gap,
      spread: Math.sqrt(gaps.reduce((s, x) => s + (x - gap) ** 2, 0) / (gaps.length - 1)),
      lowest: Math.min(...gaps),
      read: gaps.length,
      takes,
    }
  })
}

export function formatRise(rows: RiseRow[]): string {
  return rows
    .map(
      (r) =>
        `rise ${r.rise.toFixed(3)}: gap ${r.gap.toFixed(0).padStart(4)} ± ${r.spread.toFixed(0).padStart(3)} ms, lowest ${r.lowest.toFixed(0).padStart(4)}, ` +
        `read on ${r.read} of ${r.takes} takes (floor ${LEG_LEAD_MIN_RISE})`,
    )
    .join('\n')
}

const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`
const n0 = (x: number, w = 4) => x.toFixed(0).padStart(w)

export function formatChain(rows: GapRow[]): string {
  const out: string[] = []
  const gaps = [...new Set(rows.map((r) => r.gap))]
  const groups = new Set(rows.map((r) => `${r.placement}|${r.noise}|${r.clip}`))
  for (const group of groups) {
    const [placement, noise, clip] = group.split('|')
    out.push(`\n${placement} · ${clip} · ${noise}: bias, spread, rms in ms, then lost and flipped`)
    out.push(`  ${'method'.padEnd(10)}` + gaps.map((g) => g.padEnd(24)).join(''))
    for (const method of METHODS) {
      const cols = gaps.map((g) => {
        const r = rows.find((x) => x.placement === placement && x.noise === noise && x.clip === clip && x.method === method && x.gap === g)
        if (!r) return ''.padEnd(24)
        const extra = `${r.lost > 0.005 ? ` -${pct(r.lost)}` : ''}${r.flipped > 0.005 ? ` f${pct(r.flipped)}` : ''}`
        return `${n0(r.bias)}${n0(r.spread)}${n0(r.rms)}${extra}`.padEnd(24)
      })
      out.push(`  ${method.padEnd(10)}` + cols.join(''))
    }
  }
  return out.join('\n')
}

export function formatCalls(rows: CallRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.label.padEnd(34)} ${r.clip.padEnd(14)} 3D gap ${n0(r.truth)} ms  legs first ${pct(r.legsFirst).padStart(5)}  level ${pct(r.level).padStart(5)}` +
        `  arm first ${pct(r.armFirst).padStart(5)}  unread ${pct(r.unread).padStart(5)}  (${r.takes} takes, slack ${LEG_LEAD_SLACK} ms)`,
    )
    .join('\n')
}
