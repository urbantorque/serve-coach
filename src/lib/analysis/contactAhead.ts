/**
 * Contact in front of the hips, read once for the card and the diagnosis (L5.3).
 *
 * Its own module so the diagnosis can share the card's number without pulling
 * the card's whole scorer into the first screen's bundle.
 */
import { LM, clamp, midpoint } from './geometry'
import { poseAt } from './between'
import type { Skeleton } from './phases'
import type { Frame } from './types'

/**
 * How far in front of the hips the racket hand met the ball, in percent of
 * standing height, netwards by the hand's own travel from the trophy (L5.3).
 * One reading for the card's row and the diagnosis's `contact_ahead_pct`, so
 * the two judge one number. `certain` says whether the travel settled which
 * way the net is; neither reader uses the number when it did not.
 */
export function contactAheadOf(
  frames: Frame[],
  skel: Pick<Skeleton, 'keys' | 'times'>,
  wrist: number,
  bodyHeight: number,
): { value: number; certain: boolean } {
  const netwards = forwardDirection(frames, skel.keys.trophy, skel.keys.contact, wrist, bodyHeight)
  const at = poseAt(frames, skel.times.contact)
  const hip = midpoint(at.image[LM.leftHip], at.image[LM.rightHip])
  return { value: (((at.image[wrist].x - hip.x) * netwards.sign) / bodyHeight) * 100, certain: netwards.certain }
}

/**
 * Which way the net is, in image x, and whether we can tell at all.
 *
 * Only `contactAhead` needs this, and it needs it as a *sign* — so getting it
 * wrong does not shade the answer, it mirrors it, turning a contact 20 cm in
 * front into one 20 cm behind and the best measurement in the serve into the
 * worst. That makes this the one place in the pipeline where noise can produce a
 * confidently reversed reading rather than a slightly soft one.
 *
 * Taking the difference of two single frames is what made it fragile: it is one
 * subtraction of two independently jittering landmarks, and side-on the whole
 * horizontal travel it is trying to resolve can be a few percent of body height.
 * A least-squares slope over the entire trophy-to-contact window uses every
 * sample in between instead, which both averages the jitter down and measures
 * across the largest horizontal sweep in the motion.
 *
 * When the fitted travel is still too small to call — a dead-on front or back
 * view, where the hand comes almost straight towards the lens — the honest
 * answer is that this camera cannot see depth, and the measurement is dropped
 * rather than decided by a coin flip.
 */
export function forwardDirection(
  frames: Frame[],
  from: number,
  to: number,
  wrist: number,
  bodyHeight: number,
): { sign: number; certain: boolean } {
  const lo = clamp(Math.min(from, to), 0, frames.length - 1)
  const hi = clamp(Math.max(from, to), 0, frames.length - 1)
  const n = hi - lo + 1
  if (n < 3) return { sign: 1, certain: false }

  // Slope of x against sample index. Indices are evenly spaced, so the usual
  // sums reduce to this closed form — and the mean of x drops out of it, because
  // the index deviations already sum to zero.
  let sumIX = 0
  const meanI = (n - 1) / 2
  for (let i = lo; i <= hi; i++) {
    sumIX += (i - lo - meanI) * frames[i].image[wrist].x
  }
  const denom = (n * (n * n - 1)) / 12
  const slope = denom > 0 ? sumIX / denom : 0
  const travel = slope * (n - 1)

  // Six percent of standing height — about 11 cm on an adult. Below that the
  // sweep is comparable to the jitter on the landmarks it was fitted from.
  const certain = Math.abs(travel) >= 0.06 * bodyHeight
  return { sign: Math.sign(travel) || 1, certain }
}
