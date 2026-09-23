/** How RTMPose's second read is folded into a MediaPipe frame. */
import { LM } from '../../analysis/geometry'
import type { Frame, Landmark } from '../../analysis/types'
import { RTM_MIN_SCORE, boxFromFrame, refineFrame, type Pt } from '../rtmpose'
import { assert, check, heading, near, report } from '../../analysis/__tests__/harness'

const H = 720
/** A frame whose 33 landmarks sit on a diagonal, in frame-height units. */
function frame(): Frame {
  const image: Landmark[] = Array.from({ length: 33 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.2 + i * 0.015, z: 0, visibility: 0.9 }))
  const world: Landmark[] = image.map((l) => ({ ...l }))
  return { index: 0, t: 1, image, world, visibility: 0.9 }
}
/** RTMPose's 17 COCO points, each a fixed pixel offset from MediaPipe's. */
function reading(f: Frame, dx: number, dy: number, score = 0.8): { points: Pt[]; scores: number[] } {
  const coco = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
  return {
    points: coco.map((i) => ({ x: f.image[i].x * H + dx, y: f.image[i].y * H + dy })),
    scores: coco.map(() => score),
  }
}

heading('RTMPose folded into a MediaPipe frame')

check('a confident read moves the arm and leg joints to where RTMPose put them', () => {
  const f = frame()
  const r = reading(f, 7.2, -3.6)
  const g = refineFrame(f, r.points, r.scores, H)
  near(g.image[LM.rightWrist].x, f.image[LM.rightWrist].x + 0.01, 1e-9, 'wrist x')
  near(g.image[LM.rightElbow].y, f.image[LM.rightElbow].y - 0.005, 1e-9, 'elbow y')
  near(g.image[LM.leftAnkle].x, f.image[LM.leftAnkle].x + 0.01, 1e-9, 'ankle x')
})

check('the hips stay MediaPipe’s, whatever RTMPose says', () => {
  const f = frame()
  const r = reading(f, 30, 30)
  const g = refineFrame(f, r.points, r.scores, H)
  assert(g.image[LM.leftHip].x === f.image[LM.leftHip].x && g.image[LM.rightHip].y === f.image[LM.rightHip].y, 'a hip moved')
})

check('the hand travels with its wrist, so the racket direction is kept', () => {
  const f = frame()
  const r = reading(f, 14.4, 7.2)
  const g = refineFrame(f, r.points, r.scores, H)
  for (const k of [18, 20, 22]) {
    near(g.image[k].x - f.image[k].x, 0.02, 1e-9, `hand point ${k} x`)
    near(g.image[k].y - f.image[k].y, 0.01, 1e-9, `hand point ${k} y`)
  }
})

check('a joint RTMPose is unsure of keeps MediaPipe’s placement', () => {
  const f = frame()
  const r = reading(f, 20, 20, RTM_MIN_SCORE - 0.01)
  const g = refineFrame(f, r.points, r.scores, H)
  assert(g.image[LM.rightWrist].x === f.image[LM.rightWrist].x, 'an unsure wrist was moved')
})

check('world landmarks and visibility are never touched', () => {
  const f = frame()
  const r = reading(f, 10, 10)
  const g = refineFrame(f, r.points, r.scores, H)
  assert(g.world === f.world, 'world landmarks were replaced')
  assert(g.image[LM.rightWrist].visibility === f.image[LM.rightWrist].visibility, 'visibility changed')
  assert(f.image[LM.rightWrist].x === 0.5 + 16 * 0.01, 'the input frame was mutated')
})

check('the box RTMPose reads is the body, in pixels', () => {
  const f = frame()
  const [x, y, w, h] = boxFromFrame(f, H)
  near(x, f.image[0].x * H, 1e-6, 'left edge at the nose')
  near(y + h, f.image[28].y * H, 1e-6, 'bottom edge at the lower ankle')
  assert(w > 0 && h > 0, 'empty box')
})

report()
