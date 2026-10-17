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
 */
import { smooth, stdev } from './geometry'
import type { Frame } from './types'

export function tossPathSpread(
  frames: readonly Frame[],
  from: number,
  to: number,
  landmark: number,
  bodyHeight: number,
): number {
  const seg = frames.slice(from, to + 1)
  if (seg.length < 3 || !(bodyHeight > 0)) return 0
  // Smoothed first, so landmark jitter does not masquerade as a wobbly toss.
  const xs = smooth(
    seg.map((f) => f.image[landmark].x),
    2,
  )
  const x0 = xs[0]
  const x1 = xs[xs.length - 1]
  const residual = xs.map((x, i) => x - (x0 + ((x1 - x0) * i) / (xs.length - 1)))
  return (stdev(residual) / bodyHeight) * 100
}
