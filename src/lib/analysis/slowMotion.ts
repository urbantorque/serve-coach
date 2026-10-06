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
import type { Frame } from './types'

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

/**
 * A clip's frames on the serve's own clock rather than the file's.
 *
 * The engine reads every duration, window and speed off `Frame.t`, so handing
 * it this copy is the whole conversion: the keyframes, the timings and the
 * slow-motion hedge all come out as they would for a real-time clip of the same
 * serve. Indices are untouched, which is what lets the caller keep seeking the
 * video with the original frames — a keyframe found here is the same row there.
 */
export function retimeFrames(frames: Frame[], factor: number): Frame[] {
  if (!(factor > 1)) return frames
  return frames.map((f) => ({ ...f, t: f.t / factor }))
}

/**
 * The ball's flight on the serve's clock: the same curve, with time divided.
 *
 * In file seconds the height is `c0 + c1·t + c2·t²`; substituting `t = s·u`
 * gives `c0 + (c1·s)·u + (c2·s²)·u²` in real seconds. The samples and the
 * apex move with the clock and nothing about the shape changes.
 */
export function retimeFlight(flight: BallFlight | undefined, factor: number): BallFlight | undefined {
  if (!flight || !(factor > 1)) return flight
  const [c0, c1, c2] = flight.coefficients
  return {
    ...flight,
    coefficients: [c0, c1 * factor, c2 * factor * factor],
    apex: { ...flight.apex, t: flight.apex.t / factor },
    samples: flight.samples.map((p) => ({ ...p, t: p.t / factor })),
  }
}

/**
 * Whether a clip whose file said nothing is worth a pixel pass to ask the ball.
 *
 * Only when the serve, read at face value, is slower than a real-time one
 * usually is. A clip that passes at one is read at one without asking: the
 * probe costs a whole second pass over the video, and a real-time serve has
 * nothing to gain from it. A slow real-time serve that trips this costs the
 * pass and changes nothing, because the ball then reads one.
 */
export function probeWorthRunning(swing: number, motion: number): boolean {
  return !motionAgrees(swing, motion, 1) || swing > 0.25 || motion > 2.2
}

/** Keyframe times found on the serve's clock, moved back onto the file's for seeking. */
export function fileTimes<T extends Record<string, number>>(times: T, factor: number): T {
  if (!(factor > 1)) return times
  const out = { ...times }
  for (const k of Object.keys(out) as (keyof T)[]) out[k] = ((out[k] as number) * factor) as T[keyof T]
  return out
}

/** The stretch as a player would say it. */
const timesWord = (factor: number): string => {
  const n = Math.round(factor)
  return n === 2 ? 'twice' : n === 4 ? 'four times' : n === 8 ? 'eight times' : `${n} times`
}

/**
 * The line the report carries when a stretch was found and undone.
 *
 * Says where the knowledge came from, because the two sources are not equally
 * certain and a player who filmed at a known rate can check the file's answer.
 */
export function stretchNote(stretch: Stretch): string {
  return stretch.source === 'file'
    ? `Your phone filmed this in slow motion at ${timesWord(stretch.factor)}, so every timing here is real time.`
    : `The ball's fall shows slow motion at ${timesWord(stretch.factor)}, so every timing here is real time.`
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
