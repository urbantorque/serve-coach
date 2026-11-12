/**
 * How far the tossing hand wanders off its own line on the way up, along
 * image x, in percent of standing height: the spread of the smoothed path
 * about the straight line from the start of the lift to the release.
 *
 * ONE NUMBER FOR TWO READERS (L5.1). The card's toss-path row and the
 * diagnosis's toss drift used to read this window two ways — the spread here,
 * and the single worst point off the line — against two bands, so one toss
 * could pass the card and be named in the plan. Both call this now, both read
 * the card's band (`CARD_SIGNAL`), and the toss is judged once. The spread
 * rather than the worst point, because one frame of landmark jitter moves a
 * maximum and barely moves a spread.
 *
 * Image x only; `readImageX` turns it into a body axis, for both readers.
 *
 * IN SECONDS (H36). The window was 12% of however many samples the read held and
 * the smoothing was two samples, so one toss from behind read 1.40 at 64 samples,
 * 2.38 at 86 and 4.60 at 120, on a band of 0 to 3: how long the clip ran decided
 * whether a clean toss passed. And two samples is 40 ms at 50 fps and 67 ms on the
 * app's read, which took a wandering hand from named on 54 takes of 60 to none.
 *
 * NOT A READING WHERE THE LIFT WAS NOT SEEN. A hole the tracker left and nobody
 * bridged closes up in the array, so a window counted in seconds could hold two
 * samples, and two samples are a straight line: a perfect toss, at full
 * confidence. A window with an open hole, or under half its length, is no reading.
 */
import { clamp, smooth, stdev } from './geometry'
import { MAX_BRIDGED_SPAN } from './kalman'
import type { Frame } from './types'

/**
 * How far back from the release the lift is read.
 *
 * Eight steps of a 30 Hz read, seven at 24 or 25. Longer and the bend of a real
 * arm's path counts as wander: the Bath serves from behind read 1.3 at seven steps
 * and 2.1 to 3.5 at ten. Shorter and the hand has no room to wander in: the rig's
 * wandering hand reads 4.0 at nine steps and 3.3 at seven, against a band that
 * ends at 3. 0.298 and not 0.29, which gave a 24 Hz read six steps and named that
 * wandering hand on 41 takes of 60 rather than all 60. Its edges sit at 23.5, 26.8
 * and 30.2 a second, so floating point cannot pick the window at any common rate.
 */
export const TOSS_LIFT_SECONDS = 0.298

/** How wide the smoothing reaches, either side. One step of a 30 Hz read, two at 50 and 60. */
const TOSS_SMOOTH_SECONDS = 0.04

/** Where the part of the lift that is read begins, for a release at sample `toss`. */
export function tossLiftStart(frames: readonly Frame[], toss: number, ready: number): number {
  const from = frames[toss].t - TOSS_LIFT_SECONDS
  let at = toss
  while (at > ready && frames[at - 1].t >= from) at--
  return clamp(at, ready, toss - 1)
}

export function tossPathSpread(
  frames: readonly Frame[],
  from: number,
  to: number,
  landmark: number,
  bodyHeight: number,
): number | null {
  const seg = frames.slice(from, to + 1)
  if (seg.length < 3 || !(bodyHeight > 0)) return null
  const span = seg[seg.length - 1].t - seg[0].t
  if (span > 0) {
    if (span < TOSS_LIFT_SECONDS / 2) return null
    for (let i = 1; i < seg.length; i++) if (seg[i].t - seg[i - 1].t > MAX_BRIDGED_SPAN + 1e-9) return null
  }
  const radius = span > 0 ? Math.max(1, Math.round((TOSS_SMOOTH_SECONDS * (seg.length - 1)) / span)) : 2
  // Smoothed first, so landmark jitter does not masquerade as a wobbly toss.
  const xs = smooth(
    seg.map((f) => f.image[landmark].x),
    radius,
  )
  const x0 = xs[0]
  const x1 = xs[xs.length - 1]
  // The line between the ends drawn in time, so a bridged hole is not a bend.
  const along = (i: number) => (span > 0 ? (seg[i].t - seg[0].t) / span : i / (xs.length - 1))
  const residual = xs.map((x, i) => x - (x0 + (x1 - x0) * along(i)))
  return (stdev(residual) / bodyHeight) * 100
}
