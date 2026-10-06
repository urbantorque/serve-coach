/**
 * How much slower than life a clip plays, and which evidence says so.
 *
 * THE PROBLEM. Phone slow motion is usually stretched: captured at 120 or 240
 * frames a second, written to play at 30, so the file's clock runs four or
 * eight times slower than the serve did. Every timing the engine reads off that
 * clock is stretched with it, and the ball — the one object in the clip whose
 * motion is fixed by physics — appears to fall at a sixteenth or a sixty-fourth
 * of gravity. The tracker rejects a curve that far from gravity as "not a
 * ball", so on exactly the footage the filming guide asks for, the toss was
 * never found at all. Before this the app could only notice the motion looked
 * slow (`looksSlowedDown`) and decline to score the timings.
 *
 * TWO WAYS TO KNOW, IN ORDER OF TRUST.
 *
 *   · The file says so. Android writes the capture rate beside the playback
 *     rate (`pose/container.ts`), and the ratio is the stretch exactly.
 *   · The ball says so. Gravity is the same on every court, so the ball's fall
 *     is a clock that cannot be stretched without showing it: a toss tracked
 *     at a quarter of gravity in file seconds is a two-times stretch, at a
 *     sixteenth a four-times one (`stretchFromBall`). The research brief this
 *     came from names it the most robust test when the file is silent
 *     (`.scratch/research-methods.md` §3).
 *
 * The ball is only believed when the motion agrees. A real-time clip whose
 * tracker found a slow-falling object — a ball rolling off a roof, a fit dragged
 * by a bad centroid — must not be stretched on that alone, so the swing and the
 * whole motion have to come out at human speed once divided by the factor too
 * (`motionAgrees`). Neither source, or a disagreement, leaves the clip at one
 * and the existing hedge in place: an unknown stretch is never guessed.
 */
import { trackBall, type BallFlight, type BallCandidate } from '../vision/ballTrack'

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
 * Whether the serve comes out at human speed once divided by a stretch.
 *
 * `swing` is drop to contact and `motion` is ready to contact, both in file
 * seconds. The windows are wide on purpose — a hurried club swing and a slow
 * deliberate one both have to pass — and they still separate the candidates:
 * a real-time serve divided by four has a forward swing of a thirtieth of a
 * second, which no arm produces, and a four-times clip left at one has a
 * motion of five seconds.
 *
 * Bounds from the research brief (`.scratch/research-biomech.md` §2.8):
 * racket low point to impact 0.13 ± 0.02 s in high-performance men, and
 * release to impact 0.97 ± 0.10 s; club swings run slower, so the upper bounds
 * leave room for them.
 */
export function motionAgrees(swing: number, motion: number, factor: number): boolean {
  const realSwing = swing / factor
  const realMotion = motion / factor
  return realSwing >= 0.06 && realSwing <= 0.4 && realMotion >= 0.5 && realMotion <= 3.2
}

export type StretchSource = 'file' | 'ball' | 'none'

export interface Stretch {
  /** Seconds of file per second of serve. One for a real-time clip. */
  factor: number
  source: StretchSource
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
