/**
 * RTMPose's arithmetic, and how its answer is folded into a MediaPipe frame.
 *
 * RTMPose-s (Apache-2.0, OpenMMLab) re-reads the swing window after MediaPipe
 * has found the player and the keyframes. On the pose benchmark — 500
 * hand-labelled smartphone serve frames, ANALYSIS-REVIEW.md §7 — it put the
 * arm joints the serve is measured from much nearer the labels than MediaPipe
 * did on the same crop: elbows 2.35% → 1.59% of body height, wrists 2.02% →
 * 1.72%, knees 2.20% → 1.83%.
 *
 * DOM-free: `refineEngine.ts` runs the model, `extract.ts` draws the pixels.
 */
import { LM } from '../analysis/geometry'
import type { Frame, Landmark } from '../analysis/types'

/** RTMPose's input, width × height. */
export const RTM_INPUT = { w: 192, h: 256 }
/** SimCC bins per input pixel. */
export const RTM_SPLIT = 2
/** RTMPose's normalisation, RGB order. */
export const RTM_MEAN = [123.675, 116.28, 103.53]
export const RTM_STD = [58.395, 57.12, 57.375]

export interface Pt {
  x: number
  y: number
}

export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * The crop RTMPose reads, from a person box: padded 1.25×, then widened or
 * heightened to the model's 3:4 — `TopDownGetBboxCenterScale` in its own
 * deploy pipeline, without the rotation it never uses at inference.
 */
export function rtmCrop(box: [number, number, number, number]): CropRect {
  const [bx, by, bw, bh] = box
  const cx = bx + bw / 2
  const cy = by + bh / 2
  let w = bw * 1.25
  let h = bh * 1.25
  const aspect = RTM_INPUT.w / RTM_INPUT.h
  if (w > h * aspect) h = w / aspect
  else w = h * aspect
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/**
 * Decode SimCC: each joint's x and y are the argmax of its own 1-D
 * distribution, in input pixels × `RTM_SPLIT`, mapped back through the crop.
 * A joint's score is the weaker of its two maxima.
 */
export function decodeSimcc(
  simccX: ArrayLike<number>,
  simccY: ArrayLike<number>,
  joints: number,
  crop: CropRect,
): { points: Pt[]; scores: number[] } {
  const binsX = simccX.length / joints
  const binsY = simccY.length / joints
  const points: Pt[] = []
  const scores: number[] = []
  for (let j = 0; j < joints; j++) {
    let bx = 0
    let vx = -Infinity
    for (let i = 0; i < binsX; i++) {
      const v = simccX[j * binsX + i]
      if (v > vx) {
        vx = v
        bx = i
      }
    }
    let by = 0
    let vy = -Infinity
    for (let i = 0; i < binsY; i++) {
      const v = simccY[j * binsY + i]
      if (v > vy) {
        vy = v
        by = i
      }
    }
    points.push({
      x: crop.x + (bx / RTM_SPLIT / RTM_INPUT.w) * crop.w,
      y: crop.y + (by / RTM_SPLIT / RTM_INPUT.h) * crop.h,
    })
    scores.push(Math.min(vx, vy))
  }
  return { points, scores }
}

/**
 * The joints RTMPose replaces, as [COCO index, MediaPipe index], and the
 * MediaPipe landmarks that ride along with each.
 *
 * Shoulders, elbows, wrists, knees, ankles. NOT the hips: COCO labels a hip
 * lower and wider than MediaPipe places it, so swapping them would move every
 * hip-based reading by a convention rather than by accuracy — and swapping
 * some frames but not others would put a jump in the hip line that looks
 * exactly like the player moving.
 *
 * The hand and foot points MediaPipe tracks beside a wrist or ankle move with
 * it, by the same offset, so the racket estimate's wrist-to-knuckle direction
 * is kept rather than torn between two models.
 */
export const REFINED_JOINTS: { coco: number; mp: number; carries: number[] }[] = [
  { coco: 5, mp: LM.leftShoulder, carries: [] },
  { coco: 6, mp: LM.rightShoulder, carries: [] },
  { coco: 7, mp: LM.leftElbow, carries: [] },
  { coco: 8, mp: LM.rightElbow, carries: [] },
  { coco: 9, mp: LM.leftWrist, carries: [17, 19, 21] },
  { coco: 10, mp: LM.rightWrist, carries: [18, 20, 22] },
  { coco: 13, mp: LM.leftKnee, carries: [] },
  { coco: 14, mp: LM.rightKnee, carries: [] },
  { coco: 15, mp: LM.leftAnkle, carries: [29, 31] },
  { coco: 16, mp: LM.rightAnkle, carries: [30, 32] },
]

/**
 * Below this SimCC score a joint keeps MediaPipe's placement.
 *
 * Measured, not borrowed. On 60 labelled serve frames with the right box
 * (1,019 joints; median score 0.75), median error against the labels was
 * 1.6% of body height above 0.7, 2.5% from 0.5 to 0.7, 4.4% from 0.4 to 0.5
 * and 6.2% from 0.3 to 0.4 — and MediaPipe's own median on these frames is
 * 2.4–3.7%. Below 0.5 an RTMPose joint is no longer the better guess.
 */
export const RTM_MIN_SCORE = 0.5

/** The person box RTMPose is pointed at, from MediaPipe's own body landmarks, in pixels. */
export function boxFromFrame(frame: Frame, frameHeight: number): [number, number, number, number] {
  const body = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) => frame.image[i])
  // Image landmarks carry x scaled by aspect and y by height, so both are in
  // units of frame height: one factor turns either into pixels.
  const xs = body.map((l) => l.x * frameHeight)
  const ys = body.map((l) => l.y * frameHeight)
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  return [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0]
}

/**
 * The frame, with RTMPose's placement of each refined joint wherever it
 * scored well enough — and the frame untouched wherever it did not.
 *
 * `points` are pixels of the source frame; they go back into the frame's own
 * units (both axes over frame height, see `boxFromFrame`). World landmarks,
 * visibility and every joint not listed are MediaPipe's, unchanged: the
 * confidence model is calibrated on MediaPipe's visibility, and world
 * coordinates are a separate estimate RTMPose does not make.
 */
export function refineFrame(frame: Frame, points: Pt[], scores: number[], frameHeight: number): Frame {
  const image: Landmark[] = frame.image.map((l) => ({ ...l }))
  for (const { coco, mp, carries } of REFINED_JOINTS) {
    if (!(scores[coco] >= RTM_MIN_SCORE)) continue
    const x = points[coco].x / frameHeight
    const y = points[coco].y / frameHeight
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const dx = x - image[mp].x
    const dy = y - image[mp].y
    image[mp] = { ...image[mp], x, y }
    for (const c of carries) image[c] = { ...image[c], x: image[c].x + dx, y: image[c].y + dy }
  }
  return { ...frame, image }
}
