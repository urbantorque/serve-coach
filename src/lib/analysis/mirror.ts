/**
 * A serve, reflected — the same motion done by the other hand.
 *
 * WHAT THIS IS FOR. The engine reads a left-handed serve through a completely
 * different set of landmarks from a right-handed one: `sided()` picks the arm,
 * `detectHandedness` decides which arm that is, `trunkCoilReading` recovers the
 * sign of the coil from the direction the shoulders sweep, and every keyframe
 * after contact is found on the racket arm. None of that is shared code with a
 * right-hander's path — it is the same code reading the other half of the body —
 * and the repo has no left-handed footage to check it against. `RECORDED` in
 * `__tests__/fixtures/index.ts` is empty and the README is explicit that a
 * left-hander cannot be produced by mirroring a *video*, because a mirrored
 * video is a real artifact the app already diagnoses.
 *
 * WHAT IT IS NOT, and the distinction matters. That README rule is about a pose
 * *model*: MediaPipe behaves differently on a genuine left arm than on a flipped
 * right one, and no reflection can manufacture that. Reflecting landmarks proves
 * nothing about the model and this module does not claim it does. What it proves
 * is a property of the engine downstream of the model — that reading a serve is
 * chirally symmetric — and that property is worth a great deal on its own: a
 * hard-coded `LM.rightWrist`, a coil sign taken from the racket side rather than
 * from the observed sweep, a metric that assumes the tossing arm is on the left,
 * all fail this and none of them fails anything else the suite has.
 *
 * WHAT A REFLECTION IS, precisely. A mirror through the plane x = 0: every world
 * x is negated, and every left/right landmark pair swaps places. Both halves are
 * needed and doing one without the other is the classic error — negating alone
 * gives a body whose left shoulder is on its right side, which is not a
 * left-hander, it is a broken skeleton. Image x is reflected about the frame
 * rather than about zero, because image coordinates run from 0 to `aspect` (see
 * `Frame`), and z is untouched: depth is unchanged by a left-right mirror.
 */
import { type Frame, type Landmark } from './types'

/**
 * The landmark pairs that swap under a reflection, MediaPipe's own numbering.
 *
 * The face pairs are included even though nothing in the engine reads them
 * except the nose, which sits on the midline and does not move. Reflecting half
 * a body and leaving the eyes where they were would be a skeleton no camera
 * could produce, and this is used to feed the real pipeline.
 */
export const MIRROR_PAIRS: readonly [number, number][] = [
  [1, 4], // eye inner
  [2, 5], // eye
  [3, 6], // eye outer
  [7, 8], // ear
  [9, 10], // mouth
  [11, 12], // shoulder
  [13, 14], // elbow
  [15, 16], // wrist
  [17, 18], // pinky
  [19, 20], // index
  [21, 22], // thumb
  [23, 24], // hip
  [25, 26], // knee
  [27, 28], // ankle
  [29, 30], // heel
  [31, 32], // toe
]

/** Where each landmark index ends up. Built once from the pairs above. */
const SWAP: number[] = (() => {
  const out = Array.from({ length: 33 }, (_, i) => i)
  for (const [a, b] of MIRROR_PAIRS) {
    out[a] = b
    out[b] = a
  }
  return out
})()

const reflect = (l: Landmark, about: number): Landmark => ({
  x: about - l.x,
  y: l.y,
  z: l.z,
  visibility: l.visibility,
})

/**
 * One frame, reflected.
 *
 * `aspect` is the frame's own width in image units — the same number
 * `toImageLandmark` multiplied x by — because image x spans 0 to `aspect` and a
 * mirror of the picture reflects about its middle. World x reflects about zero,
 * since world coordinates are centred on the hips.
 */
export function mirrorFrame(f: Frame, aspect: number): Frame {
  const image = new Array<Landmark>(f.image.length)
  const world = new Array<Landmark>(f.world.length)
  for (let i = 0; i < f.image.length; i++) {
    const to = SWAP[i] ?? i
    image[to] = reflect(f.image[i], aspect)
    world[to] = reflect(f.world[i], 0)
  }
  // The rig's racket goes with the hand that holds it (L4.4).
  const racket = f.racket && {
    grip: { x: aspect - f.racket.grip.x, y: f.racket.grip.y },
    head: { x: aspect - f.racket.head.x, y: f.racket.head.y },
  }
  return racket ? { ...f, image, world, racket } : { ...f, image, world }
}

/** A whole tracked serve, reflected. Timestamps and indices are untouched. */
export function mirrorFrames(frames: readonly Frame[], aspect: number): Frame[] {
  return frames.map((f) => mirrorFrame(f, aspect))
}
