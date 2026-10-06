/** The pose benchmark's scoring arithmetic, checked before any model is trusted to it. */
import {
  COCO_JOINTS,
  decodeSimcc,
  jointErrors,
  leftRightSwapped,
  MEDIAPIPE_TO_COCO,
  RTM_INPUT,
  rtmCrop,
  summarise,
  truthFrom,
  viewOf,
  wrongPerson,
  type Pt,
  type Truth,
} from '../score'
import { assert, check, heading, near, report } from '../../../lib/analysis/__tests__/harness'

/** A standing figure 200 px tall inside a 100×200 box at (100, 100). */
function figure(): Truth {
  const kp: number[] = []
  for (let j = 0; j < COCO_JOINTS.length; j++) {
    const side = j % 2 === 1 ? -1 : 1
    kp.push(150 + side * (j > 4 ? 20 : 5), 100 + j * 11, 2)
  }
  return truthFrom('f.jpg', kp, [100, 100, 100, 200])
}
const pointsOf = (t: Truth): Pt[] => t.joints.map((p) => ({ ...p! }))

heading('Pose benchmark scoring')

check('a perfect prediction scores zero error and is neither wrong-person nor swapped', () => {
  const t = figure()
  const e = jointErrors(pointsOf(t), t)
  assert(e.every((x) => x === 0), `errors ${e.join(',')}`)
  assert(!wrongPerson(e), 'a perfect match read as the wrong person')
  assert(!leftRightSwapped(pointsOf(t), t), 'a perfect match read as swapped')
})

check('errors are a fraction of the labelled player height', () => {
  const t = figure()
  const p = pointsOf(t).map((q) => ({ x: q.x + 10, y: q.y }))
  near(jointErrors(p, t)[0]!, 10 / 200, 1e-9, 'a 10 px miss on a 200 px player')
})

check('a skeleton on somebody else counts as the wrong person, not as imprecision', () => {
  const t = figure()
  const elsewhere = pointsOf(t).map((q) => ({ x: q.x + 400, y: q.y - 50 }))
  assert(wrongPerson(jointErrors(elsewhere, t)), 'a pose 400 px away was scored as the right player')
  const s = summarise([{ pred: elsewhere, truth: t, ms: 5 }])
  assert(s.wrongPerson === 1 && Number.isNaN(s.medianError.all), 'wrong-person joints leaked into the error')
})

check('left and right exchanged is caught', () => {
  const t = figure()
  const p = pointsOf(t)
  for (const [l, r] of [[5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16]]) [p[l], p[r]] = [p[r], p[l]]
  assert(leftRightSwapped(p, t), 'a mirrored skeleton was not flagged')
})

check('the camera view is read from the labelled shoulders against the torso', () => {
  // Shoulders 40 px apart over a 100 px torso is square on; 10 px is edge-on.
  const withShoulders = (span: number, hips = true): Truth => {
    const joints: (Pt | undefined)[] = COCO_JOINTS.map(() => undefined)
    joints[5] = { x: 100 - span / 2, y: 100 }
    joints[6] = { x: 100 + span / 2, y: 100 }
    if (hips) {
      joints[11] = { x: 95, y: 200 }
      joints[12] = { x: 105, y: 200 }
    }
    return { file: 'v.jpg', joints, bbox: [0, 0, 100, 300] }
  }
  assert(viewOf(withShoulders(90)) === 'square', 'chest to the lens')
  assert(viewOf(withShoulders(60)) === 'oblique', 'turned')
  assert(viewOf(withShoulders(20)) === 'edge-on', 'one shoulder behind the other')
  assert(viewOf(withShoulders(90, false)) === undefined, 'no hips, no view')
})

check('MediaPipe indices land on the matching COCO joints', () => {
  assert(MEDIAPIPE_TO_COCO.length === COCO_JOINTS.length, 'one index per joint')
  assert(MEDIAPIPE_TO_COCO[9] === 15 && MEDIAPIPE_TO_COCO[10] === 16, 'wrists are MediaPipe 15 and 16')
  assert(MEDIAPIPE_TO_COCO[5] === 11 && MEDIAPIPE_TO_COCO[16] === 28, 'shoulders from 11, ankles to 28')
})

check('the RTMPose crop is padded 1.25× and held at the model’s 3:4', () => {
  const c = rtmCrop([100, 100, 100, 200])
  near(c.h, 250, 1e-9, 'height padded')
  near(c.w / c.h, RTM_INPUT.w / RTM_INPUT.h, 1e-9, 'aspect')
  near(c.x + c.w / 2, 150, 1e-9, 'centred on x')
})

check('SimCC decodes to the argmax bin, mapped back through the crop', () => {
  const joints = 2
  const x = new Float32Array(joints * 384)
  const y = new Float32Array(joints * 512)
  x[0 * 384 + 192] = 1 // joint 0 at the horizontal middle
  y[0 * 512 + 128] = 1 // a quarter of the way down
  x[1 * 384 + 0] = 0.9
  y[1 * 512 + 511] = 0.8
  const crop = { x: 10, y: 20, w: 96, h: 128 }
  const { points, scores } = decodeSimcc(x, y, joints, crop)
  near(points[0].x, 10 + 48, 1e-6, 'joint 0 x')
  near(points[0].y, 20 + 32, 1e-6, 'joint 0 y')
  near(points[1].x, 10, 1e-6, 'joint 1 at the left edge')
  near(scores[1], 0.8, 1e-6, 'score is the weaker axis')
})

report()
