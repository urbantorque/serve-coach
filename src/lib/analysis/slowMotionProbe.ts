/**
 * The ball's side of reading a slow-motion stretch — see `slowMotion.ts` for
 * the whole account. Apart from it so the analysis loads this only when a clip
 * looks slow: it is a tracker run four times over, and most clips never need it.
 */
import { trackBall, type BallCandidate, type BallFlight } from '../vision/ballTrack'
import { motionAgrees, type Stretch } from './slowMotion'

/**
 * The stretches a phone actually produces: 60, 120 and 240 frames a second
 * played back at 30. Testing these four rather than solving for a continuous
 * factor is what makes the ball test sharp — neighbouring candidates differ by
 * four times in gravity, far wider than the tracker's own tolerance.
 */
export const STRETCHES = [1, 2, 4, 8] as const

export interface BallStretch {
  /** The stretch whose gravity the ball's fall matched. */
  factor: number
  /** That fall, in the file's own seconds. */
  flight: BallFlight
  /** The stretch the fitted curvature implies on its own, before rounding to a candidate. */
  implied: number
}

/** Above this many frames the ball test thins the window: a slowed clip is oversampled for a curve. */
const MAX_FRAMES_FOR_FIT = 48

/** The candidate nearest a factor, judged on a doubling scale. */
const nearestStretch = (s: number) =>
  STRETCHES.reduce((a, b) => (Math.abs(Math.log2(b) - Math.log2(s)) < Math.abs(Math.log2(a) - Math.log2(s)) ? b : a))

/**
 * Which stretch the ball's fall is consistent with, if any.
 *
 * Each candidate is a full `trackBall` run at that candidate's gravity, so a
 * flight still has to pass every gate the tracker already applies — a clean
 * arc, a vertex inside the tracked window, enough inliers. A fit is kept only
 * when the curvature it settled on rounds back to the stretch it was searched
 * at, since the tracker's own tolerance can admit a short track whose
 * curvature was never really measured; of what survives, the most confident
 * wins.
 *
 * `expectedGravity` is real gravity in frame units, exactly as `findBall`
 * computes it from the player's height.
 */
export function stretchFromBall(
  perFrame: { t: number; candidates: BallCandidate[] }[],
  expectedGravity: number,
): BallStretch | undefined {
  // The fit is quadratic in time and its cost cubic in candidates, so a slowed
  // clip's window — several seconds of file at the full sampling rate — is
  // thinned to an even subset. The curve needs points, not every point.
  const step = Math.max(1, Math.ceil(perFrame.length / MAX_FRAMES_FOR_FIT))
  const frames = step > 1 ? perFrame.filter((_, i) => i % step === 0) : perFrame

  let best: BallStretch | undefined
  for (const factor of STRETCHES) {
    const flight = trackBall(frames, { expectedGravity: expectedGravity / (factor * factor) })
    if (!flight) continue
    const fitted = 2 * flight.coefficients[2]
    if (!(fitted > 0)) continue
    const implied = Math.sqrt(expectedGravity / fitted)
    if (nearestStretch(implied) !== factor) continue
    if (!best || flight.confidence > best.flight.confidence) best = { factor, flight, implied }
  }
  return best
}

/**
 * The stretch to read the clip at, from whatever evidence there is.
 *
 * The file wins when it speaks: it is the camera's own statement, and it does
 * not depend on the ball being in shot. The ball is used only above one, only
 * when the motion agrees at the same factor, and only at the confidence the
 * report already requires of a ball (`analyze.ts` drops one below 0.45).
 */
export function chooseStretch(evidence: {
  container?: number
  ball?: BallStretch
  swing?: number
  motion?: number
}): Stretch {
  if (evidence.container && evidence.container >= 1.5) return { factor: evidence.container, source: 'file' }
  const { ball, swing, motion } = evidence
  if (
    ball &&
    ball.factor > 1 &&
    ball.flight.confidence >= 0.45 &&
    swing !== undefined &&
    motion !== undefined &&
    motionAgrees(swing, motion, ball.factor)
  ) {
    return { factor: ball.factor, source: 'ball' }
  }
  return { factor: 1, source: 'none' }
}
