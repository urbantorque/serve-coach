/**
 * The motion as continuous signals rather than six snapshots.
 *
 * Every measurement in `metrics.ts` is read at a keyframe: the knee angle at the
 * trophy, the wrist height at contact. That is the right shape for describing a
 * position and the wrong shape for describing a sequence — whether the hips
 * fired before the shoulders is not visible in any single frame, because it is a
 * fact about the order two things happened in.
 *
 * So this builds the series: trunk rotation, spine lean, palm orientation, one
 * value per sampled frame, plus the derivatives that turn them into "when did
 * this peak". Everything is `Float32Array` — a serve is a few hundred frames and
 * a dozen series, and on a mid-range phone that is the difference between an
 * allocation the collector never notices and a couple of megabytes of boxed
 * doubles churning while the report is being assembled.
 *
 * Angles are unwrapped before anything differentiates them. A trunk rotating
 * through the ±180° seam produces a 360° step in the raw series, which
 * differentiates into an angular velocity spike an order of magnitude larger
 * than anything a human produces — and that spike would then win every "when did
 * rotation peak" comparison in the engine.
 */
import { LM, clamp, type Side, sided } from './geometry'
import type { Frame, Landmark } from './types'

/** A sampled signal and the times its samples were taken at. */
export interface Series {
  values: Float32Array
  /** Seconds, shared across every series built from the same frames. */
  t: Float32Array
}

const DEG = 180 / Math.PI

export const timeline = (frames: Frame[]): Float32Array => {
  const t = new Float32Array(frames.length)
  for (let i = 0; i < frames.length; i++) t[i] = frames[i].t
  return t
}

/* ------------------------------------------------------------------ vectors */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const sub = (a: Landmark | Vec3, b: Landmark | Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
})

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

export const norm = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

export function unit(v: Vec3): Vec3 {
  const n = norm(v)
  return n < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: v.x / n, y: v.y / n, z: v.z / n }
}

/** Angle between two directions, degrees, 0–180. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const na = norm(a)
  const nb = norm(b)
  if (na < 1e-9 || nb < 1e-9) return 0
  return Math.acos(clamp(dot(a, b) / (na * nb), -1, 1)) * DEG
}

/**
 * World up.
 *
 * MediaPipe world landmarks put the origin at the hip centre with +y pointing
 * DOWN, the same convention as the image. Up is therefore negative y, and every
 * "is this pointing at the sky" test in the engine goes through this constant
 * rather than through a minus sign somebody will eventually read as a typo.
 */
export const UP: Vec3 = { x: 0, y: -1, z: 0 }

/* ------------------------------------------------------------------- series */

/**
 * Centred moving average over a Float32Array, written back into a new one.
 *
 * The same idea as `smooth` in geometry, kept separate rather than shared
 * because that one takes and returns boxed arrays and this runs over every
 * series in the engine. Converting in and out to reuse eight lines would cost
 * more than the eight lines.
 */
export function smoothF32(xs: Float32Array, radius = 2): Float32Array {
  if (radius < 1 || xs.length < 3) return xs.slice()
  const out = new Float32Array(xs.length)
  for (let i = 0; i < xs.length; i++) {
    let sum = 0
    let n = 0
    const lo = Math.max(0, i - radius)
    const hi = Math.min(xs.length - 1, i + radius)
    for (let j = lo; j <= hi; j++) {
      sum += xs[j]
      n++
    }
    out[i] = sum / n
  }
  return out
}

/**
 * Remove the ±180° seam from an angle series, in place-compatible form.
 *
 * Without this a trunk passing through the seam differentiates into a spike no
 * body produces, and every peak-finder in the engine locks onto it.
 */
export function unwrapDegrees(xs: Float32Array): Float32Array {
  const out = new Float32Array(xs.length)
  if (!xs.length) return out
  out[0] = xs[0]
  let offset = 0
  for (let i = 1; i < xs.length; i++) {
    const step = xs[i] - xs[i - 1]
    if (step > 180) offset -= 360
    else if (step < -180) offset += 360
    out[i] = xs[i] + offset
  }
  return out
}

/** Central-difference derivative in units per second. */
export function rateOf(values: Float32Array, t: Float32Array): Float32Array {
  const out = new Float32Array(values.length)
  for (let i = 1; i < values.length - 1; i++) {
    const dt = t[i + 1] - t[i - 1]
    out[i] = dt > 1e-6 ? (values[i + 1] - values[i - 1]) / dt : 0
  }
  if (values.length > 1) {
    out[0] = out[1]
    out[values.length - 1] = out[values.length - 2]
  }
  return out
}

/**
 * The sample nearest a moment, so a window can be given in seconds.
 *
 * Everything timed in this engine is stated in milliseconds — a pronation window
 * either side of contact, a lead between two peaks — and a window counted in
 * frames means something different on a 240 fps slow-motion clip than on a 30
 * fps one. The measurement has to be a fact about the serve, not about the phone.
 */
export function sampleAt(t: Float32Array, seconds: number): number {
  let best = 0
  for (let i = 1; i < t.length; i++) {
    if (Math.abs(t[i] - seconds) < Math.abs(t[best] - seconds)) best = i
  }
  return best
}

/** Index of the largest absolute value in a window, inclusive. */
export function peakAbsIn(xs: Float32Array, from: number, to: number): number {
  const lo = clamp(Math.min(from, to), 0, xs.length - 1)
  const hi = clamp(Math.max(from, to), 0, xs.length - 1)
  let best = lo
  for (let i = lo; i <= hi; i++) if (Math.abs(xs[i]) > Math.abs(xs[best])) best = i
  return best
}

/**
 * Peak position refined to sub-frame precision by fitting a parabola.
 *
 * The whole sequencing question is a comparison of two peak *times*, and at 30
 * fps one frame is 33 ms — the same order as the lead being measured, so a
 * whole-frame answer could not tell "hips first" from "shoulders first" at all
 * on a phone-shot clip. Three samples around a smooth maximum determine a
 * parabola, and its vertex lands well inside a frame.
 */
export function refinedPeakTime(xs: Float32Array, t: Float32Array, at: number): number {
  if (at <= 0 || at >= xs.length - 1) return t[clamp(at, 0, t.length - 1)] ?? 0
  const a = Math.abs(xs[at - 1])
  const b = Math.abs(xs[at])
  const c = Math.abs(xs[at + 1])
  const denom = a - 2 * b + c
  // A flat or non-peaked triple has no vertex to find; fall back to the sample.
  if (Math.abs(denom) < 1e-9) return t[at]
  const shift = clamp((0.5 * (a - c)) / denom, -1, 1)
  const dt = shift > 0 ? t[at + 1] - t[at] : t[at] - t[at - 1]
  return t[at] + shift * Math.abs(dt)
}

/* -------------------------------------------------------------- body series */

/**
 * Yaw of a body line about the vertical axis, in degrees, unwrapped.
 *
 * Taken from the world landmarks and the ground plane only, so it survives the
 * camera being anywhere: a shoulder line pointing at the lens is foreshortened
 * to nothing in the image and completely unambiguous in world space.
 */
export function yawSeries(frames: Frame[], left: number, right: number): Float32Array {
  const raw = new Float32Array(frames.length)
  for (let i = 0; i < frames.length; i++) {
    const a = frames[i].world[left]
    const b = frames[i].world[right]
    raw[i] = Math.atan2(b.z - a.z, b.x - a.x) * DEG
  }
  return unwrapDegrees(raw)
}

/**
 * How far the spine leans out of vertical, in degrees, split into the two
 * components that mean different things.
 *
 * `lean` is the total tilt of hips-to-shoulders away from up. `lateral` is the
 * part of it across the body — sideways collapse, the thing that happens when a
 * player chases a toss that drifted. Forward and backward lean is deliberately
 * not separated out: some of it is the shot itself, and a serve arching back
 * into the ball is not the fault this is looking for.
 */
export function spineSeries(frames: Frame[]): { lean: Float32Array; lateral: Float32Array } {
  const lean = new Float32Array(frames.length)
  const lateral = new Float32Array(frames.length)

  for (let i = 0; i < frames.length; i++) {
    const w = frames[i].world
    const hip = mid(w[LM.leftHip], w[LM.rightHip])
    const sh = mid(w[LM.leftShoulder], w[LM.rightShoulder])
    const axis = sub(sh, hip)
    lean[i] = angleBetween(axis, UP)

    // Across-body direction, taken from the hip line so it rotates with the
    // player rather than with the court.
    const across = unit(sub(w[LM.rightHip], w[LM.leftHip]))
    const len = norm(axis)
    lateral[i] = len < 1e-9 ? 0 : Math.asin(clamp(dot(axis, across) / len, -1, 1)) * DEG
  }

  return { lean, lateral }
}

const mid = (a: Landmark, b: Landmark): Vec3 => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: (a.z + b.z) / 2,
})

/**
 * The direction the palm faces, per frame, from the hand landmarks.
 *
 * The pose model gives the wrist, both knuckles and the thumb, which is three
 * points on a plane — enough for a normal, and the only access this app has to
 * what the racket face is doing, since nothing tracks the racket itself. It is
 * an estimate built on the least reliable landmarks in the model, and callers
 * are expected to carry its confidence rather than treat it as measurement.
 *
 * The cross product is taken in an order that puts the normal out of the palm
 * for a right hand, then mirrored for a left one — the two hands are reflections
 * of each other, and without the flip a left-hander's continental grip reads as
 * a textbook waiter's tray.
 */
export function palmNormalSeries(frames: Frame[], side: Side): { normal: Vec3[]; seen: Float32Array } {
  const s = sided(side)
  const index = side === 'left' ? LM.leftIndex : LM.rightIndex
  const pinky = side === 'left' ? LM.leftPinky : LM.rightPinky
  const chirality = side === 'left' ? -1 : 1

  const normal: Vec3[] = new Array(frames.length)
  const seen = new Float32Array(frames.length)

  for (let i = 0; i < frames.length; i++) {
    const w = frames[i].world
    const wrist = w[s.wrist]
    const knuckleAxis = sub(w[index], w[pinky])
    const handAxis = sub(mid(w[index], w[pinky]), wrist)
    const n = unit(cross(handAxis, knuckleAxis))
    normal[i] = { x: n.x * chirality, y: n.y * chirality, z: n.z * chirality }

    // A hand whose knuckles have collapsed onto each other has no plane, and a
    // normal taken from it is the direction of the tracker's noise.
    const spread = norm(knuckleAxis)
    const reach = norm(handAxis)
    const geometry = spread > 0.01 && reach > 0.02 ? 1 : 0
    seen[i] =
      geometry *
      Math.min(
        frames[i].image[s.wrist]?.visibility ?? 0,
        frames[i].image[index]?.visibility ?? 0,
        frames[i].image[pinky]?.visibility ?? 0,
      )
  }

  return { normal, seen }
}

/**
 * The palm direction at one frame, averaged over its neighbours.
 *
 * Hand landmarks are the noisiest part of the pose output, and a normal built
 * from a cross product of two short vectors amplifies that noise rather than
 * averaging it away — a single frame can swing the answer by ten degrees, which
 * is most of the gap between a grip that is fine and one that is not. Averaging
 * unit normals across a couple of frames either side settles it without
 * smearing a rotation that takes a tenth of a second.
 */
export function palmNormalAt(frames: Frame[], side: Side, index: number, radius = 2): Vec3 {
  const lo = Math.max(0, index - radius)
  const hi = Math.min(frames.length - 1, index + radius)
  const { normal, seen } = palmNormalSeries(frames.slice(lo, hi + 1), side)

  let sum: Vec3 = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < normal.length; i++) {
    if (seen[i] <= 0) continue
    // Weighted by how well the hand was seen, so a frame the tracker lost does
    // not get an equal vote with one it read cleanly.
    sum = {
      x: sum.x + normal[i].x * seen[i],
      y: sum.y + normal[i].y * seen[i],
      z: sum.z + normal[i].z * seen[i],
    }
  }
  return unit(sum)
}

/**
 * How far the palm has turned towards facing the sky, in degrees, 0–90.
 *
 * Zero is edge-on, which is what a continental grip produces at the trophy.
 * Ninety is the palm flat under the racket — the waiter's tray. A palm rolled
 * past edge-on the other way is not this fault and reads as zero rather than as
 * a negative number nothing downstream would know what to do with.
 */
export function palmSkyElevation(frames: Frame[], side: Side, index: number): number {
  return clamp(90 - angleBetween(palmNormalAt(frames, side, index), UP), 0, 90)
}

/**
 * Rotation of the palm about the forearm between two frames, in degrees.
 *
 * Measured about the forearm axis on purpose: the hand also swings through a
 * huge arc between those two moments, and the raw angle between two palm
 * normals is dominated by that swing. Only the component around the forearm is
 * pronation, which is the thing that turns a push into a snap.
 */
export function pronationBetween(frames: Frame[], side: Side, from: number, to: number): number {
  const s = sided(side)
  const lo = clamp(from, 0, frames.length - 1)
  const hi = clamp(to, 0, frames.length - 1)
  const normal = [palmNormalAt(frames, side, lo, 1), palmNormalAt(frames, side, hi, 1)]

  const axisAt = (i: number) => unit(sub(frames[i].world[s.wrist], frames[i].world[s.elbow]))
  // One shared axis — the mean of the two — so the measurement is a rotation
  // about a single line rather than a comparison between two different ones.
  const axis = unit({
    x: axisAt(lo).x + axisAt(hi).x,
    y: axisAt(lo).y + axisAt(hi).y,
    z: axisAt(lo).z + axisAt(hi).z,
  })
  if (norm(axis) < 1e-9) return 0

  const flatten = (v: Vec3): Vec3 => {
    const along = dot(v, axis)
    return { x: v.x - axis.x * along, y: v.y - axis.y * along, z: v.z - axis.z * along }
  }

  const a = flatten(normal[0])
  const b = flatten(normal[1])
  if (norm(a) < 1e-6 || norm(b) < 1e-6) return 0
  return angleBetween(a, b)
}
