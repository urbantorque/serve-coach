/**
 * Where the racket is, inferred from the hand — or, over the trophy-to-contact
 * window only, read from an actual box around the racket.
 *
 * The pose model tracks the wrist, the knuckles and the thumb but knows nothing
 * about the racket — so every "racket" measurement in the app used to be a wrist
 * measurement, and the two differ by most of a metre at exactly the moments that
 * matter. A player is not told to get their *wrist* down their back.
 *
 * `estimateRacket` is the original wrist-only guess and is still what draws the
 * racket everywhere outside that window: the knuckles give a direction the
 * wrist alone cannot, and wrist → knuckles extended by a racket length lands
 * near the head. That is an estimate and it is treated as one.
 *
 * `racketFromBox` is the newer path — see its own comment below — and is only
 * ever available where `objectEngine.ts` actually found a racket in the pixels,
 * which today is the trophy-to-contact window (`findRacketBoxes` in
 * `analyze.ts`). Outside that window, or on a frame the detector missed inside
 * it, the wrist estimate is still what draws.
 *
 * Both deliberately do not feed any scored measurement. The hand landmarks are
 * the least reliable part of the pose output and are at their worst behind the
 * back at the racket drop; the box detector is a single EfficientDet-Lite pass
 * over a 256-px-wide frame with no calibration data behind it yet (see
 * `UNCALIBRATED` in `tiers.ts` for what that bar requires). Either could feed a
 * measurement once there is footage to validate it against — neither has that
 * yet, so both stay confined to drawing.
 */
import { LM, clamp, type Side } from './geometry'
import type { Frame } from './types'

/**
 * Grip to head centre, as a fraction of standing height.
 *
 * A 27-inch racket is 0.685 m. The hand sits at the butt, so the head centre is
 * roughly 0.55 m beyond it — about 0.31 of a 1.78 m player.
 */
const RACKET_REACH = 0.31

/**
 * What the wrist-to-knuckle span measures when the hand is side-on to the lens.
 *
 * The direction this module extends by a racket length is a 2D vector across a
 * hand, and a hand pointed at or away from the camera foreshortens toward
 * nothing. What survives in the picture is then mostly tracker noise — and
 * `RACKET_REACH` multiplies it by about three, which is how a racket held out
 * towards the net gets drawn hanging down by the player's leg.
 *
 * The angle itself cannot be recovered: that is the axis the camera cannot see.
 * So the span is read as evidence about whether there is a direction here worth
 * trusting, and the estimate is withdrawn rather than guessed. Roughly a tenth
 * of standing height is a hand seen square on; half of that is a hand turned
 * about sixty degrees out of the picture, and it takes the confidence under the
 * 0.5 the drawing gates on.
 */
const BROADSIDE_HAND_SPAN = 0.08

export interface RacketEstimate {
  /** Head centre in the same aspect-corrected image coordinates as landmarks. */
  head: { x: number; y: number }
  /** Grip point — the wrist, near enough. */
  grip: { x: number; y: number }
  /** 0–1. Below ~0.5 the hand landmarks are guesswork and this should be hidden. */
  confidence: number
}

/** An axis-aligned box, in the same 0–1 image coordinates as landmarks. */
export interface DetectedBox {
  x: number
  y: number
  width: number
  height: number
  /** The detector's own score, 0–1. */
  score: number
}

/**
 * How far past the box centre, as a fraction of its diagonal, the head is
 * placed along the wrist-to-centroid ray.
 *
 * A racket held at an angle inside an axis-aligned box has its head somewhere
 * near the far corner, not at the edge nearest the centre — 0.5 (half the
 * diagonal) is the box's own corner, which is the honest reach for "somewhere
 * near here" without pretending the box says more about shaft angle than an
 * axis-aligned rectangle can.
 */
const BOX_HEAD_REACH = 0.5

/**
 * Turn a detected racket box into the same shape `estimateRacket` returns, so
 * every drawing call downstream treats the two identically.
 *
 * An EfficientDet-Lite box is axis-aligned — it bounds the racket, it does not
 * point at it. There is no shaft angle to read off four numbers that were
 * never rotated to match the racket in the first place. What the box does
 * give, that the wrist-and-knuckles guess never had, is where the racket
 * actually is in the frame: the grip stays the wrist (a real landmark, not a
 * box corner — more precise than anything four rounded pixels could offer),
 * and the head is placed by walking outward from the box's own centre, away
 * from the wrist, by half its diagonal. That lands near the box's far edge
 * along the one direction this geometry can support — towards the racket, not
 * at a fixed reach chosen without ever having seen it.
 *
 * `undefined` when the wrist sits outside the box by more than its own size —
 * the ordinary sign that the detector found a *different* racket in frame
 * (a doubles partner, a ball-kid's) rather than this player's.
 */
export function racketFromBox(
  box: DetectedBox,
  wrist: { x: number; y: number },
): RacketEstimate | undefined {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const diagonal = Math.hypot(box.width, box.height)
  if (diagonal < 1e-6) return undefined

  // A wrist a whole box away from the box is almost certainly a different
  // racket in frame, not this player's swing having drifted.
  const wristDist = Math.hypot(wrist.x - cx, wrist.y - cy)
  if (wristDist > diagonal * 1.5) return undefined

  let dx = cx - wrist.x
  let dy = cy - wrist.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) {
    // Wrist and box centre coincide — no direction to walk outward in, so
    // fall back to straight up, which is at least never behind the player.
    dx = 0
    dy = -1
  } else {
    dx /= len
    dy /= len
  }

  return {
    grip: { x: wrist.x, y: wrist.y },
    head: { x: cx + dx * diagonal * BOX_HEAD_REACH, y: cy + dy * diagonal * BOX_HEAD_REACH },
    confidence: clamp(box.score, 0, 1),
  }
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
  // Two separate questions, and only one of them was being asked. Visibility
  // says whether the model could see the hand; the span says whether what it saw
  // points anywhere. A hand aimed at the lens is reported at full visibility —
  // it is right there in the middle of the frame — while the direction taken
  // from it has collapsed to a couple of pixels of jitter. Both have to hold.
  const aim = clamp(handSpan / BROADSIDE_HAND_SPAN, 0, 1)
  const confidence = plausible ? Math.min(1, visibility) * aim : 0
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

/**
 * The confidence under which a racket is not drawn at all.
 *
 * `drawSkeleton` has always held this line for the wrist estimate: a racket
 * swinging off at a guessed angle is worse than no racket. It lives here now
 * because the detector's boxes are kept from a far lower score (0.2, see
 * `objectEngine.ts`) and the two need one floor between them.
 */
export const RACKET_DRAW_FLOOR = 0.5

/**
 * Which racket to draw on this frame: the detected box when it is strong
 * enough to draw, otherwise the wrist estimate.
 *
 * The first cut preferred any box at all, and a box between 0.2 and the draw
 * floor then hid the wrist estimate and drew nothing — a frame with weak
 * evidence ended up with less racket than a frame with none. `guess` is lazy so
 * the smoothing pass only runs on frames the box does not already cover.
 */
export function racketToDraw(
  box: RacketEstimate | undefined,
  guess: () => RacketEstimate | undefined,
): RacketEstimate | undefined {
  if (box && box.confidence >= RACKET_DRAW_FLOOR) return box
  const fallback = guess()
  return fallback && fallback.confidence >= RACKET_DRAW_FLOOR ? fallback : undefined
}
