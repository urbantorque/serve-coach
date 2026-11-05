/**
 * Readings taken between two samples, rather than on whichever sample the
 * seek happened to land nearest (L2.6).
 *
 * The contact moment has been placed between samples since `refineExtremum`,
 * but the readings taken there were not: contact ahead and contact height were
 * read off the nearest sampled frame. At contact the hand is the fastest thing
 * in the picture, so where the sampling grid fell moved both readings. Read at
 * 32 fps against the suite's 50, on the rig and the six Bath serves from two
 * placements, contact ahead sat 2.6 of its own noise deviations away and
 * contact height 1.6; at 20 fps, 7.0 and 2.8. A reading that depends on the
 * phone's frame rate is a reading two phones disagree about.
 */
import type { Frame, Landmark } from './types'

/** Each landmark on the straight line between the two samples either side of `t`. */
export function poseAt(frames: Frame[], t: number): Frame {
  const after = frames.findIndex((f) => f.t > t)
  if (after <= 0) return frames[after === 0 ? 0 : frames.length - 1]
  const a = frames[after - 1]
  const b = frames[after]
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0
  const mix = (p: Landmark | undefined, q: Landmark | undefined): Landmark | undefined =>
    p && q
      ? {
          x: p.x + (q.x - p.x) * k,
          y: p.y + (q.y - p.y) * k,
          z: p.z + (q.z - p.z) * k,
          visibility: Math.min(p.visibility, q.visibility),
        }
      : undefined
  return {
    index: a.index,
    t,
    image: a.image.map((p, j) => mix(p, b.image[j])) as Landmark[],
    world: a.world.map((p, j) => mix(p, b.world[j])) as Landmark[],
    visibility: Math.min(a.visibility, b.visibility),
  }
}

/** Three samples fix a parabola exactly and smooth nothing; a fourth is the least that averages. */
const PATH_MIN_SAMPLES = 4

/**
 * Where some world landmarks were at any moment of a stretch of clip, read off
 * a smooth curve through the samples rather than off any one of them.
 *
 * `poseAt` takes a moment from its two neighbours, so it keeps their noise.
 * This takes every sample within `reach` seconds of `centre` and fits one
 * parabola in time to each axis of each landmark, by least squares, the
 * samples weighted down towards the edge (tricube, which reaches zero there,
 * so a sample does not jump in or out as `centre` moves). What comes back is
 * still a pose, so whatever is worked out from it is worked out after the
 * noise has gone: an angle averaged after the fact has already kept the error
 * its own arithmetic added.
 *
 * A parabola is a fair picture of a path only where nothing sudden happens, so
 * the stretch is the caller's to choose and to justify. Undefined when too few
 * samples hold every landmark, or when they sit at too few moments to fix a
 * curve.
 */
export function pathsThrough(
  frames: Frame[],
  landmarks: readonly number[],
  centre: number,
  reach: number,
): ((t: number) => Landmark[]) | undefined {
  const near = frames.filter(
    (f) =>
      Math.abs(f.t - centre) < reach &&
      landmarks.every((lm) => {
        const p = f.world[lm]
        return p !== undefined && Number.isFinite(p.x + p.y + p.z)
      }),
  )
  if (near.length < PATH_MIN_SAMPLES) return undefined
  const us = near.map((f) => (f.t - centre) / reach)
  const weights = us.map((u) => (1 - Math.abs(u) ** 3) ** 3)
  // The normal equations for 1, u and u²: their matrix holds these sums, and
  // the six letters are its inverse's cofactors.
  const s = [0, 1, 2, 3, 4].map((k) => us.reduce((sum, u, i) => sum + weights[i] * u ** k, 0))
  const a = s[2] * s[4] - s[3] * s[3]
  const b = s[2] * s[3] - s[1] * s[4]
  const c = s[1] * s[3] - s[2] * s[2]
  const d = s[0] * s[4] - s[2] * s[2]
  const e = s[1] * s[2] - s[0] * s[3]
  const f = s[0] * s[2] - s[1] * s[1]
  const det = s[0] * a + s[1] * b + s[2] * c
  if (!(Math.abs(det) > 1e-9)) return undefined

  return (t) => {
    const u = (t - centre) / reach
    const [r0, r1, r2] = [a + b * u + c * u * u, b + d * u + e * u * u, c + e * u + f * u * u]
    // What each sample adds to the curve at `t`. They sum to one.
    const shares = us.map((v, i) => (weights[i] * (r0 + r1 * v + r2 * v * v)) / det)
    return landmarks.map((lm) => {
      const point = { x: 0, y: 0, z: 0, visibility: 1 }
      near.forEach((sample, i) => {
        const p = sample.world[lm]
        point.x += shares[i] * p.x
        point.y += shares[i] * p.y
        point.z += shares[i] * p.z
        point.visibility = Math.min(point.visibility, p.visibility)
      })
      return point
    })
  }
}

/**
 * The top of a peak, between samples: the vertex of the parabola through the
 * highest of the three samples around `i` and its two neighbours.
 *
 * A parabola rather than `refineExtremum`'s tent, because this is a height and
 * not a moment. The tent is exact for a peak with straight sides and overshoots
 * a rounded one by a whole flank's slope; the parabola is exact for a rounded
 * peak and reads a sharp one a little low, so it never invents height. The
 * sample's own value comes back wherever the three do not make a peak.
 */
export function peakBetween(values: readonly number[], times: readonly number[], i: number): number {
  if (i < 1 || i > values.length - 2) return values[i]
  // The highest of the sample and its neighbours, kept off the ends.
  let j = i
  for (const d of [-1, 1]) if (values[i + d] > values[j]) j = i + d
  if (j < 1 || j > values.length - 2) return values[j]
  const [t0, t1, t2] = [times[j - 1], times[j], times[j + 1]]
  const [y0, y1, y2] = [values[j - 1], values[j], values[j + 1]]
  if (![y0, y1, y2].every(Number.isFinite) || !(t0 < t1 && t1 < t2)) return values[j]
  if (!(y1 >= y0 && y1 >= y2)) return y1
  // Divided differences, on the real sample times.
  const d01 = (y1 - y0) / (t1 - t0)
  const d12 = (y2 - y1) / (t2 - t1)
  const a = (d12 - d01) / (t2 - t0)
  if (!(a < 0)) return y1
  const b = d01 - a * (t0 + t1)
  const tv = Math.min(t2, Math.max(t0, -b / (2 * a)))
  return y1 + d01 * (tv - t1) + a * (tv - t1) * (tv - t0)
}
