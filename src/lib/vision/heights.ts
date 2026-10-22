/**
 * Heights in metres, ruled by gravity (N2.9).
 *
 * The engine's metres come from the player's body, scaled to a typical 1.78 m
 * standing height, so a tall player and a short one hitting from the same
 * height read differently. The toss carries a better ruler: its fall in the
 * picture is gravity at the ball's own distance (`tossPath`), which needs no
 * slow motion and no assumed height. Where that ruler is sure enough — its
 * own stated error under `MAX_RULER_ERROR` — the contact height and how high
 * the toss rose above the hand are given in metres. Otherwise nothing is, and
 * the body's ruler stands.
 *
 * Readings, never grades: nothing here enters a score.
 */
import type { TossPath } from './serveSpeed'

/** The ruler's own standard error past which no height is said, as a share. */
export const MAX_RULER_ERROR = 0.08

export interface GravityHeights {
  /** The ball at contact above the ground, metres. */
  contactM: number
  /** The top of the toss above the hand that let it go, metres. */
  tossAboveHandM: number
  /** The ruler's stated error, as a share. */
  rulerError: number
}

/**
 * All in frame heights from the top of the picture: where the feet stand, where
 * the ball was struck, where it left the hand and where it peaked.
 */
export function gravityHeights(
  toss: TossPath | undefined,
  at: { groundY: number; contactY: number; releaseY: number; apexY: number },
): GravityHeights | undefined {
  if (!toss || !(toss.scaleError <= MAX_RULER_ERROR) || !(toss.unitsPerMetre > 0)) return undefined
  const u = toss.unitsPerMetre
  const contactM = (at.groundY - at.contactY) / u
  const tossAboveHandM = (at.releaseY - at.apexY) / u
  if (!(contactM > 0.5 && contactM < 4) || !(tossAboveHandM > 0 && tossAboveHandM < 4)) return undefined
  return { contactM, tossAboveHandM, rulerError: toss.scaleError }
}
