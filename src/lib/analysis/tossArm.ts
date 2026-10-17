/**
 * How long the tossing arm stays up: the share of the toss→contact window the
 * tossing hand spends above its own shoulder, in percent (L5.4).
 *
 * One reading for the card's "Tossing arm timing" row and the diagnosis's
 * `toss_arm_hold_pct`, so the fault and the row judge one number against the
 * card's band. Its own module so the diagnosis does not pull the card's scorer
 * into the first screen's bundle.
 */
import { clamp } from './geometry'
import type { Frame } from './types'

export function tossArmHoldOf(
  frames: readonly Frame[],
  keys: { toss: number; contact: number },
  wrist: number,
  shoulder: number,
): number {
  const span = Math.max(1, keys.contact - keys.toss)
  let held = 0
  for (let i = keys.toss; i <= keys.contact; i++) {
    const f = frames[clamp(i, 0, frames.length - 1)]
    if (f.image[wrist].y < f.image[shoulder].y) held++
  }
  return (held / (span + 1)) * 100
}
