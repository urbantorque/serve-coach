/**
 * Where the racket is, inferred from the hand.
 *
 * The pose model tracks the wrist, the knuckles and the thumb but knows nothing
 * about the racket — so every "racket" measurement in the app is really a wrist
 * measurement, and the two differ by most of a metre at exactly the moments that
 * matter. A player is not told to get their *wrist* down their back.
 *
 * The knuckles give a direction the wrist alone cannot: a racket is held roughly
 * in line with the hand, so wrist → knuckles extended by a racket length lands
 * near the head. That is an estimate and it is treated as one — it is used to
 * draw the racket, where being a few centimetres out is invisible and having no
 * racket at all is the thing people notice. It deliberately does not feed any
 * measurement: the hand landmarks are the least reliable part of the pose
 * output and they are at their worst behind the back at the racket drop, which
 * is precisely where a racket-based number would have to be trustworthy.
 */
import { LM, type Side } from './geometry'
import type { Frame } from './types'

/**
 * Grip to head centre, as a fraction of standing height.
 *
 * A 27-inch racket is 0.685 m. The hand sits at the butt, so the head centre is
 * roughly 0.55 m beyond it — about 0.31 of a 1.78 m player.
 */
const RACKET_REACH = 0.31

export interface RacketEstimate {
  /** Head centre in the same aspect-corrected image coordinates as landmarks. */
  head: { x: number; y: number }
  /** Grip point — the wrist, near enough. */
  grip: { x: number; y: number }
  /** 0–1. Below ~0.5 the hand landmarks are guesswork and this should be hidden. */
  confidence: number
}

/**
 * Estimate the racket for one frame, or nothing if the hand cannot be seen well
 * enough to point it anywhere.
 */
export function estimateRacket(
  frame: Frame,
  side: Side,
  bodyHeight: number,
): RacketEstimate | undefined {
  const wrist = frame.image[side === 'left' ? LM.leftWrist : LM.rightWrist]
  const index = frame.image[side === 'left' ? LM.leftIndex : LM.rightIndex]
  const pinky = frame.image[side === 'left' ? LM.leftPinky : LM.rightPinky]
  if (!wrist || !index || !pinky) return undefined

  // The knuckle line's midpoint is steadier than either knuckle: the two jitter
  // independently, so averaging them halves the angular noise on a direction
  // taken from a hand only a few percent of the frame across.
  const knuckles = { x: (index.x + pinky.x) / 2, y: (index.y + pinky.y) / 2 }
  const dx = knuckles.x - wrist.x
  const dy = knuckles.y - wrist.y
  const span = Math.hypot(dx, dy)

  // A hand spans roughly 10% of standing height wrist to knuckle. Far outside
  // that and the landmarks are not on a hand — the direction would be noise
  // amplified by a racket length.
  const handSpan = span / Math.max(1e-6, bodyHeight)
  const plausible = handSpan > 0.03 && handSpan < 0.2
  const visibility = Math.min(wrist.visibility, index.visibility, pinky.visibility)
  const confidence = plausible ? Math.min(1, visibility) : 0
  if (confidence <= 0 || span < 1e-6) return undefined

  const reach = RACKET_REACH * bodyHeight
  return {
    grip: { x: wrist.x, y: wrist.y },
    head: { x: wrist.x + (dx / span) * reach, y: wrist.y + (dy / span) * reach },
    confidence,
  }
}

/**
 * Smooth the racket direction across neighbouring frames.
 *
 * A racket length multiplies whatever angular error the knuckles carry, so an
 * estimate good enough to measure a hand is not good enough to draw a metre-long
 * object without it jittering distractingly. Averaging the *direction* over a
 * frame either side settles it; the grip is taken from the frame itself so the
 * racket still stays attached to the hand.
 */
export function smoothedRacket(
  frames: Frame[],
  index: number,
  side: Side,
  bodyHeight: number,
  radius = 1,
): RacketEstimate | undefined {
  const here = estimateRacket(frames[index], side, bodyHeight)
  if (!here) return undefined

  let dx = 0
  let dy = 0
  let n = 0
  let confidence = 0
  for (let i = Math.max(0, index - radius); i <= Math.min(frames.length - 1, index + radius); i++) {
    const e = estimateRacket(frames[i], side, bodyHeight)
    if (!e) continue
    const vx = e.head.x - e.grip.x
    const vy = e.head.y - e.grip.y
    const len = Math.hypot(vx, vy) || 1
    dx += vx / len
    dy += vy / len
    confidence += e.confidence
    n++
  }
  if (!n) return here

  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return here
  const reach = RACKET_REACH * bodyHeight
  return {
    grip: here.grip,
    head: { x: here.grip.x + (dx / len) * reach, y: here.grip.y + (dy / len) * reach },
    confidence: confidence / n,
  }
}
