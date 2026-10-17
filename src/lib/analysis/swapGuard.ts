/**
 * Left and right put back where they were (L5.9).
 *
 * MediaPipe now and then reports a limb's left landmark as its right and the
 * right as its left. On the pose bench (`trackerNoise.ts`) it does so on about
 * one frame in seventy for each pair, and one in thirty for the ankles. One
 * such frame at contact and the racket wrist is read off the tossing hand.
 * Filmed under the fitted tracker noise, the six Bath serves, all skilled, had
 * a toss drift named on one take in twenty, every one of them from a swap.
 *
 * A swap is a jump no body makes: both of a pair's landmarks leaving where
 * their motion was taking them, each landing where the other was headed. So
 * each frame's pair is held against where the frames before it predict it, at
 * the speed it was already travelling. When the crossed reading is far
 * cheaper than the straight one, the pair is traded back, image and world
 * together, along with every landmark that limb carries.
 *
 * Only a trade the limb is seen coming back from, within three frames: the
 * bench's swaps are mostly single frames, a tracker following a clip holds
 * one for a few, and one wrong trade must not be carried into the next. It does nothing where it cannot tell: a pair closer
 * together than a fifth of the torso (side-on, the shoulders, hips and knees
 * nearly overlap, and a swap there barely moves anything), the clip's last
 * frame, or a frame beside one it could not read. A clean clip comes back unchanged, frame for frame
 * (`swapGuard.test.ts`, on the rig and the Bath serves from every side).
 */
import { LM } from './geometry'
import type { Frame } from './types'

/** Each pair by its leading landmark, then what that limb carries with it. */
const LIMBS: [number[], number[]][] = [
  [[LM.leftShoulder], [LM.rightShoulder]],
  [[LM.leftElbow], [LM.rightElbow]],
  [
    [LM.leftWrist, LM.leftPinky, LM.leftIndex, LM.leftThumb],
    [LM.rightWrist, LM.rightPinky, LM.rightIndex, LM.rightThumb],
  ],
  [[LM.leftHip], [LM.rightHip]],
  [[LM.leftKnee], [LM.rightKnee]],
  [
    [LM.leftAnkle, LM.leftHeel, LM.leftToe],
    [LM.rightAnkle, LM.rightHeel, LM.rightToe],
  ],
]

/** The crossed reading has to cost under this share of the straight one. */
export const SWAP_RATIO = 0.4

/** The longest run of traded frames put back; the limb has to come back inside it. */
export const MAX_RUN = 3

/** A pair closer than this many torso lengths is left alone. */
const MIN_APART = 0.2

const SEEN = 0.3

interface Pt {
  x: number
  y: number
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** A frame's picture with one pair's places traded, for reading only. */
function traded(f: Frame, l: number, r: number): Pt[] {
  const image: Pt[] = f.image.slice()
  ;[image[l], image[r]] = [image[r], image[l]]
  return image
}

/** The torso's length in the picture, the guard's ruler: the median over the clip. */
function torsoOf(frames: readonly Frame[]): number {
  const lengths = frames
    .map((f) => {
      const L = f.image
      const sh = { x: (L[LM.leftShoulder].x + L[LM.rightShoulder].x) / 2, y: (L[LM.leftShoulder].y + L[LM.rightShoulder].y) / 2 }
      const hp = { x: (L[LM.leftHip].x + L[LM.rightHip].x) / 2, y: (L[LM.leftHip].y + L[LM.rightHip].y) / 2 }
      return dist(sh, hp)
    })
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)
  return lengths.length ? lengths[lengths.length >> 1] : 0
}

export interface Unswapped {
  frames: Frame[]
  /** How many limb-frames were traded back. */
  corrected: number
}

export function unswapFrames(frames: readonly Frame[]): Unswapped {
  const torso = torsoOf(frames)
  const out = frames.map((f) => f)
  let corrected = 0
  if (!(torso > 0) || frames.length < 3) return { frames: out, corrected }
  const seen = (f: Frame, k: number) => (f.image[k]?.visibility ?? 1) >= SEEN

  for (let t = 1; t < out.length; t++) {
    for (const [left, right] of LIMBS) {
      const l = left[0]
      const r = right[0]
      const prev = out[t - 1]
      const before = t >= 2 ? out[t - 2] : undefined
      const cur = out[t]
      if (![prev, cur].every((f) => seen(f, l) && seen(f, r))) continue
      // Where each was headed, at the speed it was already travelling.
      const ahead = (k: number): Pt =>
        before && seen(before, k)
          ? { x: 2 * prev.image[k].x - before.image[k].x, y: 2 * prev.image[k].y - before.image[k].y }
          : prev.image[k]
      const pl = ahead(l)
      const pr = ahead(r)
      if (dist(pl, pr) < MIN_APART * torso || dist(prev.image[l], prev.image[r]) < MIN_APART * torso) continue
      const straight = dist(cur.image[l], pl) + dist(cur.image[r], pr)
      const crossed = dist(cur.image[l], pr) + dist(cur.image[r], pl)
      if (!(crossed < SWAP_RATIO * straight)) continue
      // And the limb has to be seen coming back, within `MAX_RUN` frames:
      // each frame after, read as the tracker gave it, held against where the
      // traded-back run was headed. A pair that never comes back is a crossing
      // or a relabel this cannot tell from one, and is left alone. Without
      // this a single wrong trade is carried forward, since every frame is
      // held against the one before as corrected.
      // Plain distances here, not a speed: a speed taken off two noisy frames
      // doubles their noise, and side-on that is the width of the hips.
      let run = 0
      let at = traded(cur, l, r)
      for (let j = 1; j <= MAX_RUN; j++) {
        const next = frames[t + j]
        if (!next || !seen(next, l) || !seen(next, r)) break
        const onward = dist(next.image[l], at[l]) + dist(next.image[r], at[r])
        const still = dist(next.image[l], at[r]) + dist(next.image[r], at[l])
        if (onward < SWAP_RATIO * still) {
          run = j
          break
        }
        if (!(still < SWAP_RATIO * onward)) break
        at = traded(next, l, r)
      }
      if (!run) continue
      for (let j = 0; j < run; j++) {
        const f = out[t + j]
        const image = f.image.slice()
        const world = f.world.slice()
        for (let i = 0; i < left.length; i++) {
          ;[image[left[i]], image[right[i]]] = [image[right[i]], image[left[i]]]
          ;[world[left[i]], world[right[i]]] = [world[right[i]], world[left[i]]]
        }
        out[t + j] = { ...f, image, world }
        corrected++
      }
    }
  }
  return { frames: out, corrected }
}
