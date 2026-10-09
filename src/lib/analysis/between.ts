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
