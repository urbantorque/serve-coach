import type { Frame, Landmark, Status } from './types'

/** MediaPipe BlazePose landmark indices, named so the maths below reads. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
} as const

export type Side = 'left' | 'right'

export const sided = (side: Side) => ({
  shoulder: side === 'left' ? LM.leftShoulder : LM.rightShoulder,
  elbow: side === 'left' ? LM.leftElbow : LM.rightElbow,
  wrist: side === 'left' ? LM.leftWrist : LM.rightWrist,
  hip: side === 'left' ? LM.leftHip : LM.rightHip,
  knee: side === 'left' ? LM.leftKnee : LM.rightKnee,
  ankle: side === 'left' ? LM.leftAnkle : LM.rightAnkle,
})

export const other = (side: Side): Side => (side === 'left' ? 'right' : 'left')

/* --------------------------------------------------------------- scalar math */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function mean(xs: number[]): number {
  if (!xs.length) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/* ------------------------------------------------------------------- vectors */

export const midpoint = (a: Landmark, b: Landmark): Landmark => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
  visibility: Math.min(a.visibility, b.visibility),
})

export const dist2d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

export const dist3d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/**
 * Interior angle at `b` in degrees. Feed this world landmarks — a 3D angle is
 * the same whether the camera is side-on or behind, which an image-plane angle
 * emphatically is not.
 */
export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z }
  const n1 = Math.hypot(v1.x, v1.y, v1.z)
  const n2 = Math.hypot(v2.x, v2.y, v2.z)
  if (n1 < 1e-6 || n2 < 1e-6) return 180
  const cos = clamp((v1.x * v2.x + v1.y * v2.y + v1.z * v2.z) / (n1 * n2), -1, 1)
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * Angle between two segments projected onto the ground plane (x/z), in degrees,
 * unsigned and folded into 0–90. Used for hip–shoulder separation: how far the
 * upper body has coiled away from the lower body.
 */
export function groundPlaneSeparation(
  shoulderL: Landmark,
  shoulderR: Landmark,
  hipL: Landmark,
  hipR: Landmark,
): number {
  const sa = Math.atan2(shoulderR.z - shoulderL.z, shoulderR.x - shoulderL.x)
  const ha = Math.atan2(hipR.z - hipL.z, hipR.x - hipL.x)
  let d = ((sa - ha) * 180) / Math.PI
  d = ((d % 180) + 180) % 180
  return d > 90 ? 180 - d : d
}

/**
 * How far a segment tilts out of the horizontal plane, in degrees, 0–90.
 *
 * Must be given world landmarks. Measuring this in the image plane looks
 * tempting but breaks badly side-on: the shoulder line then points nearly at
 * the camera, its horizontal component collapses to almost nothing, and a
 * modest 20° tilt projects as 60°+.
 */
export function elevationFromHorizontal(a: Landmark, b: Landmark): number {
  const dy = Math.abs(b.y - a.y)
  const len = dist3d(a, b)
  if (len < 1e-6) return 0
  return (Math.asin(clamp(dy / len, 0, 1)) * 180) / Math.PI
}

/* -------------------------------------------------------------------- series */

/**
 * Centred moving average. Pose output is jittery frame to frame; every series
 * we take an extremum of gets smoothed first or the keyframes land on noise.
 */
export function smooth(xs: number[], radius = 2): number[] {
  if (radius < 1 || xs.length < 3) return [...xs]
  const out = new Array<number>(xs.length)
  for (let i = 0; i < xs.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(xs.length - 1, i + radius); j++) {
      sum += xs[j]
      n++
    }
    out[i] = sum / n
  }
  return out
}

/** Central-difference derivative, in units per second. */
export function derivative(xs: number[], ts: number[]): number[] {
  const out = new Array<number>(xs.length).fill(0)
  for (let i = 1; i < xs.length - 1; i++) {
    const dt = ts[i + 1] - ts[i - 1]
    out[i] = dt > 1e-6 ? (xs[i + 1] - xs[i - 1]) / dt : 0
  }
  if (xs.length > 1) {
    out[0] = out[1] ?? 0
    out[xs.length - 1] = out[xs.length - 2] ?? 0
  }
  return out
}

export function argMinIn(xs: number[], from: number, to: number): number {
  const lo = clamp(Math.min(from, to), 0, xs.length - 1)
  const hi = clamp(Math.max(from, to), 0, xs.length - 1)
  let best = lo
  for (let i = lo; i <= hi; i++) if (xs[i] < xs[best]) best = i
  return best
}

export function argMaxIn(xs: number[], from: number, to: number): number {
  const lo = clamp(Math.min(from, to), 0, xs.length - 1)
  const hi = clamp(Math.max(from, to), 0, xs.length - 1)
  let best = lo
  for (let i = lo; i <= hi; i++) if (xs[i] > xs[best]) best = i
  return best
}

/* ------------------------------------------------------------------- scoring */

/**
 * Map a measurement onto 0–100.
 *
 * Anywhere inside the ideal band scores 90–100; outside it the score decays
 * over a tolerance proportional to the axis, which keeps a metric in degrees
 * and one in body-heights falling off at comparable rates.
 *
 * Where the best value sits inside the band depends on the band's shape. A
 * band bounded on both sides (knee bend, contact height) is best in the
 * middle — too much is as wrong as too little. A band running to the edge of
 * the axis is one-directional: for toss wobble, zero is perfect, and for arm
 * extension, straighter is always better. Scoring those by centredness would
 * mark a flawless toss down to 89 for not wobbling enough.
 */
export function scoreAgainst(value: number, ideal: [number, number], range: [number, number]): number {
  const [lo, hi] = ideal
  const span = Math.abs(range[1] - range[0]) || 1

  if (value >= lo && value <= hi) {
    const width = hi - lo
    if (width <= 1e-6) return 100
    const openLow = lo <= range[0] + 1e-9
    const openHigh = hi >= range[1] - 1e-9
    let quality: number
    if (openLow && !openHigh) quality = 1 - (value - lo) / width
    else if (openHigh && !openLow) quality = (value - lo) / width
    else quality = 1 - Math.abs(value - (lo + hi) / 2) / (width / 2)
    return Math.round(90 + 10 * clamp(quality, 0, 1))
  }

  const d = value < lo ? lo - value : value - hi
  const tolerance = span * 0.34
  return Math.round(clamp(88 * Math.max(0, 1 - d / tolerance) ** 1.3, 6, 88))
}

export function statusOf(score: number): Status {
  if (score >= 85) return 'great'
  if (score >= 70) return 'good'
  if (score >= 55) return 'fair'
  return 'work'
}

export function weightedScore(items: { score: number; weight: number }[]): number {
  const total = items.reduce((s, i) => s + i.weight, 0)
  if (!total) return 0
  return Math.round(items.reduce((s, i) => s + i.score * i.weight, 0) / total)
}

/**
 * How much of an area's score the weakest measurement in it is allowed to own.
 *
 * A serve is a chain. Contact height at 38 next to three excellent contact
 * measurements is not a "solid" contact — it is a serve being hit below full
 * reach, and averaging it against its neighbours produced a card badged Solid
 * whose own headline named the thing wrong with it. Consistency scoring already
 * had to solve this (see `buildConsistency`, which leans 60% on its worst two);
 * areas need it for the same reason and get a gentler version, because an area
 * is three or four related measurements rather than seventeen unrelated ones.
 */
const WEAKEST_LINK_SHARE = 0.3

/**
 * Score an area from its measurements, letting the weakest one pull the result
 * down rather than being averaged away.
 *
 * `eligible` is which measurements are allowed to *be* the weakest link. A
 * number the app has already admitted it cannot see clearly must not be handed
 * this much of the score — that would turn a framing problem into a verdict on
 * the player's technique. It still counts towards the mean, at reduced weight.
 */
export function chainScore(
  items: { score: number; weight: number }[],
  eligible: { score: number }[] = items,
): number {
  if (!items.length) return 0
  const mean = weightedScore(items)
  const pool = eligible.length ? eligible : items
  const worst = Math.min(...pool.map((i) => i.score))
  return Math.round(mean * (1 - WEAKEST_LINK_SHARE) + worst * WEAKEST_LINK_SHARE)
}

/* --------------------------------------------------------------- frame utils */

export const lmAt = (f: Frame, i: number): Landmark => f.image[i]
export const wAt = (f: Frame, i: number): Landmark => f.world[i]

/**
 * The largest jump the tracked body makes between consecutive samples, in body heights.
 *
 * The pose model is asked for one person, and it decides which one every frame
 * with no obligation to pick the same one twice. A coach standing to one side, a
 * player on the next court, somebody walking behind the baseline — any of them can
 * take over the tracking mid-clip, and when that happens the app measures a serve
 * assembled from two different bodies. Nothing else in the pipeline can see it:
 * every landmark is present, visibility stays high, and the numbers come out
 * looking perfectly ordinary.
 *
 * What gives it away is physics. Hips are the steadiest thing on a serving body
 * and they move smoothly — even a full leg drive shifts them a few percent of
 * standing height between samples. A hand-off to somebody standing two metres
 * away moves them most of a body height in a single frame, which no player does.
 *
 * Measured on the hips rather than a limb precisely because limbs genuinely do
 * move fast: the racket hand covers half a body height between the drop and
 * contact, so a wrist-based version of this would fire on every serve.
 */
export function maxTrackingJump(
  frames: Frame[],
  from: number,
  to: number,
  bodyHeight: number,
): number {
  if (!(bodyHeight > 0)) return 0
  const lo = clamp(Math.min(from, to), 0, frames.length - 1)
  const hi = clamp(Math.max(from, to), 0, frames.length - 1)
  let worst = 0
  for (let i = lo + 1; i <= hi; i++) {
    const a = midpoint(frames[i - 1].image[LM.leftHip], frames[i - 1].image[LM.rightHip])
    const b = midpoint(frames[i].image[LM.leftHip], frames[i].image[LM.rightHip])
    worst = Math.max(worst, dist2d(a, b) / bodyHeight)
  }
  return worst
}

/**
 * Beyond this, the tracked hips moved further in one sample than a serving body can.
 *
 * A leg drive shifts the hips by roughly 0.03 of standing height per sample at 30
 * fps. Slow motion makes that smaller, never larger. Sitting the threshold at
 * five times the fastest real motion leaves room for ordinary jitter and a
 * dropped frame or two while still being far below the distance to the next
 * person on the court.
 */
export const IMPLAUSIBLE_JUMP = 0.15

/** Mean visibility across the landmarks a serve actually depends on. */
export function keyVisibility(f: Frame): number {
  const keys = [
    LM.leftShoulder,
    LM.rightShoulder,
    LM.leftElbow,
    LM.rightElbow,
    LM.leftWrist,
    LM.rightWrist,
    LM.leftHip,
    LM.rightHip,
    LM.leftKnee,
    LM.rightKnee,
  ]
  return mean(keys.map((k) => f.image[k]?.visibility ?? 0))
}
