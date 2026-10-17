/**
 * Which way the body went after contact, signed (L5.7).
 *
 * `LandingBalance.offset` is unsigned because image x points whichever way the
 * camera happened to face, so its sign was a fact about the filming. The swing
 * already says which way the net is: the racket hand travels netwards from the
 * trophy to contact (`forwardDirection`, the sign `contactAhead` reads with).
 * Signed by that, the hips' travel after contact says whether the player went
 * into the court or fell back away from it.
 *
 * THE HIPS IN THE PICTURE, NOT AGAINST THE FEET. A serve leaves the ground, and
 * a front foot in the air is no reference: on the Bath serves the hips' place
 * against the ankles at the finish reads either sign from one serve, by the
 * side it was filmed from. Their travel across the picture reads the same sign
 * from every side. The cost is that a phone panning with the player reads as
 * travel; `cameraMotion` does not see a pan, and the reading is not named.
 *
 * Read from the side only. From in front or behind, the net is along the lens
 * and the hand's travel across the picture is the swing going sideways.
 */
import { LM } from './geometry'
import { forwardDirection } from './contactAhead'
import type { Skeleton } from './phases'
import type { Frame } from './types'

export interface LandingTravel {
  /**
   * How far the hip centre travelled netwards from contact to the finish, in
   * standing heights. Positive is into the court, negative is falling back.
   */
  forward: number
  /** Mean visibility of the hips at contact and the finish, 0–1. */
  confidence: number
}

/**
 * How long after contact the finish has to be before the travel is read.
 *
 * A body's direction is set as it leaves the ball: on the Bath serves, whose
 * recordings stop 0.17–0.23 s after contact, every one is already 0.08–0.22
 * standing heights netwards by then. Under a tenth of a second the hips have
 * barely moved, and a near-zero would read as a player who stopped dead.
 */
export const LANDING_TRAVEL_MIN_SECONDS = 0.1

export function landingTravelOf(
  frames: Frame[],
  skel: Pick<Skeleton, 'keys'>,
  wrist: number,
  bodyHeight: number,
): LandingTravel | undefined {
  const { trophy, contact, finish } = skel.keys
  const at = (i: number) => frames[Math.max(0, Math.min(frames.length - 1, i))]
  const from = at(contact)
  const to = at(finish)
  if (!(bodyHeight > 1e-6) || to.t - from.t < LANDING_TRAVEL_MIN_SECONDS) return undefined
  const netwards = forwardDirection(frames, trophy, contact, wrist, bodyHeight)
  if (!netwards.certain) return undefined
  const hips = [LM.leftHip, LM.rightHip]
  const hipX = (f: Frame) => (f.image[LM.leftHip].x + f.image[LM.rightHip].x) / 2
  const seen = [from, to].flatMap((f) => hips.map((h) => f.image[h]?.visibility ?? 0))
  return {
    forward: Math.round((((hipX(to) - hipX(from)) * netwards.sign) / bodyHeight) * 1000) / 1000,
    confidence: Math.round((seen.reduce((a, b) => a + b, 0) / seen.length) * 100) / 100,
  }
}
