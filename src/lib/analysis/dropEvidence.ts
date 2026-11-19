/**
 * Could the camera have seen a racket drop? (N2.5)
 *
 * "There was no drop" is a claim about the player only where a drop could
 * have appeared in the picture. Three ways it could not:
 *
 * - The racket wrist was not seen well through the swing: what the tracker
 *   returns there is mostly its own guess (mean visibility under 0.5, the floor
 *   `metricConfidence` uses for a soft reading).
 * - The swing went mostly into the lens, so the height trace is not the whole
 *   motion (from behind at about seventy degrees, a textbook drop rose
 *   monotonically in the picture).
 * - A sample was lost in the stretch where a drop lives, the last 0.31 s before
 *   contact. At 30 fps a real dip can be one or two frames, and on the
 *   test-retest bench one copy of a serve lost exactly the frame that held it
 *   (wrist visibility 0.00), put the drop on the trophy and was told its racket
 *   never falls. One lost frame barely moves a mean, so this is asked frame by
 *   frame.
 *
 * Used by the diagnosis (`racketNeverFell`) and by the card's drop depth, which
 * until N2.5 said "Racket never falls" on a drop on the trophy without asking.
 * A drop smeared away with no frame lost is still read as absent: that case is
 * pinned as KNOWN in `dropUnseen.test.ts`.
 */
import { clamp, mean, sided } from './geometry'
import type { Skeleton } from './phases'
import type { Frame } from './types'

/** Mean wrist visibility through the swing below which a flat trace says nothing. */
export const DROP_VISIBLE = 0.5

/**
 * How much further the racket hand must travel in depth than in height before
 * the height trace stops being allowed to speak for the whole swing.
 *
 * On the clip this came from the hand covered about 1.5 m toward and away from
 * the camera against 0.8 m of rise, a ratio near two, while a serve filmed from
 * the side puts nearly all of the drop in the picture plane and lands well under
 * one. The threshold sits between those, nearer the side-on case, because the
 * cost of the two mistakes is not symmetric: withholding a fault the player may
 * have costs them one line of advice, and asserting one they do not have sends
 * them to the court to fix a thing that is not broken.
 */
export const DEPTH_DOMINATES = 1.3

/** The stretch before contact a drop lives in, seconds (`DROP_LOOKBACK` in `phases.ts`). */
const DROP_STRETCH = 0.31

/** A sample this faint is a lost frame, not a seen one. */
const LOST = 0.3

export function couldSeeTheDrop(frames: Frame[], skel: Pick<Skeleton, 'keys' | 'racket'>): boolean {
  const { keys } = skel
  const R = sided(skel.racket)
  if (!frames.length) return false
  const trophy = clamp(keys.trophy, 0, frames.length - 1)
  const contact = clamp(keys.contact, 0, frames.length - 1)
  const window = frames.slice(trophy, contact + 1)
  if (!window.length) return false

  const seen = mean(window.map((f) => f.image[R.wrist]?.visibility ?? 0)) >= DROP_VISIBLE

  const range = (pick: (f: Frame) => number) => {
    const vs = window.map(pick).filter((v) => Number.isFinite(v))
    return vs.length ? Math.max(...vs) - Math.min(...vs) : 0
  }
  // Both in metres, from the same world landmarks, so the ratio is meaningful.
  const acrossDepth = range((f) => f.world[R.wrist]?.z ?? Number.NaN)
  const acrossHeight = range((f) => f.world[R.wrist]?.y ?? Number.NaN)
  const swungIntoTheLens = acrossDepth > acrossHeight * DEPTH_DOMINATES

  const from = frames[contact].t - DROP_STRETCH
  const lostInTheStretch = window.some((f) => f.t >= from && f.t < frames[contact].t && (f.image[R.wrist]?.visibility ?? 0) < LOST)

  return seen && !swungIntoTheLens && !lostInTheStretch
}
