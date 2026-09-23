/**
 * `racketFromBox` — the one piece of the racket-detection path that is pure
 * geometry and can be checked without a browser or a WASM graph. What runs
 * the actual object model (`objectEngine.ts`, `findRacketBoxes` in
 * `analyze.ts`) is not testable here for the reason `objectEngine.ts` states:
 * MediaPipe's binding wants a real `ImageData`, which this suite's plain Node
 * process does not have. These checks are about what the app does with a box
 * once one exists, not about whether the model finds one.
 */
import { RACKET_DRAW_FLOOR, racketFromBox, racketToDraw, type DetectedBox, type RacketEstimate } from '../racket'
import { assert, check, heading, near, report, within } from './harness'

const box = (over: Partial<DetectedBox> = {}): DetectedBox => ({
  x: 0.4,
  y: 0.2,
  width: 0.15,
  height: 0.3,
  score: 0.8,
  ...over,
})

heading('racketFromBox — turning a detected box into a drawable estimate')

check('the grip is the wrist, exactly — not a box corner', () => {
  const wrist = { x: 0.5, y: 0.55 }
  const est = racketFromBox(box(), wrist)!
  assert(est.grip.x === wrist.x && est.grip.y === wrist.y, 'grip drifted from the wrist landmark')
})

check('the head lands beyond the box centre, away from the wrist', () => {
  // Wrist below and left of the box centre, within the reach `racketFromBox`
  // still attributes — the head should walk up and to the right of the box's
  // own centre, continuing that same direction outward.
  const cx = box().x + box().width / 2
  const cy = box().y + box().height / 2
  const wrist = { x: cx - 0.2, y: cy + 0.2 }
  const est = racketFromBox(box(), wrist)!
  assert(est.head.x > cx, `head.x ${est.head.x} did not move past the box centre ${cx}`)
  assert(est.head.y < cy, `head.y ${est.head.y} did not move past the box centre ${cy}`)
})

check('confidence is the detector score, clamped', () => {
  const wrist = { x: 0.5, y: 0.35 }
  near(racketFromBox(box({ score: 0.63 }), wrist)!.confidence, 0.63, 1e-9, 'confidence')
  near(racketFromBox(box({ score: 1.4 }), wrist)!.confidence, 1, 1e-9, 'confidence should clamp above 1')
  near(racketFromBox(box({ score: -0.2 }), wrist)!.confidence, 0, 1e-9, 'confidence should clamp below 0')
})

check('a wrist nowhere near the box is refused — a different racket in frame', () => {
  // Box diagonal here is hypot(0.15, 0.3) ≈ 0.335; the refusal boundary
  // `racketFromBox` documents is 1.5 diagonals (≈0.503) from the box centre.
  // This wrist sits two full diagonals out, comfortably past it.
  const cx = box().x + box().width / 2
  const farWrist = { x: cx + 0.335 * 2, y: box().y + box().height / 2 }
  assert(racketFromBox(box(), farWrist) === undefined, 'a distant box should not be attributed to this wrist')
})

check('a wrist just inside the boundary is still attributed', () => {
  const cx = box().x + box().width / 2
  const cy = box().y + box().height / 2
  const nearWrist = { x: cx + 0.335 * 1.0, y: cy }
  assert(racketFromBox(box(), nearWrist) !== undefined, 'a box within reach of the wrist should not be refused')
})

check('a degenerate box (no area) is refused rather than divided by zero', () => {
  const wrist = { x: 0.4, y: 0.2 }
  assert(racketFromBox(box({ width: 0, height: 0 }), wrist) === undefined, 'a zero-size box should refuse')
})

check('wrist exactly on the box centre still returns a head, not NaN', () => {
  const cx = box().x + box().width / 2
  const cy = box().y + box().height / 2
  const est = racketFromBox(box(), { x: cx, y: cy })
  assert(est !== undefined, 'a wrist at the box centre should still produce an estimate')
  assert(Number.isFinite(est!.head.x) && Number.isFinite(est!.head.y), 'head coordinates should be finite')
})

check('the head reach scales with the box, not a fixed body-height fraction', () => {
  // Unlike `estimateRacket`'s fixed `RACKET_REACH`, a bigger detected box —
  // the racket closer to the lens, or simply a longer one — should place the
  // head further from centre, in proportion to its own diagonal. Close enough
  // to both boxes' centres to stay inside the wrist-attribution reach of each.
  const wrist = { x: 0.35, y: 0.15 }
  const smallBox = box({ width: 0.1, height: 0.2 })
  const bigBox = box({ width: 0.2, height: 0.4 })
  const small = racketFromBox(smallBox, wrist)!
  const big = racketFromBox(bigBox, wrist)!
  // Each box's own centroid — the two boxes differ in size, so they do not
  // share one, even though both keep the same top-left corner.
  const smallReach = Math.hypot(
    small.head.x - (smallBox.x + smallBox.width / 2),
    small.head.y - (smallBox.y + smallBox.height / 2),
  )
  const bigReach = Math.hypot(
    big.head.x - (bigBox.x + bigBox.width / 2),
    big.head.y - (bigBox.y + bigBox.height / 2),
  )
  assert(bigReach > smallReach, `a bigger box (${bigReach}) should reach further than a smaller one (${smallReach})`)
  within(bigReach / smallReach, 1.9, 2.1, 'reach should double when the box doubles')
})

heading('racketToDraw — a weak box must not hide the wrist estimate')

const est = (confidence: number): RacketEstimate => ({
  grip: { x: 0.5, y: 0.5 },
  head: { x: 0.5, y: 0.2 },
  confidence,
})

check('a box above the draw floor wins, and the wrist pass never runs', () => {
  let ran = false
  const strong = est(0.8)
  const got = racketToDraw(strong, () => {
    ran = true
    return est(0.9)
  })
  assert(got === strong, 'a strong box should be drawn')
  assert(!ran, 'the smoothing pass should be skipped when the box covers the frame')
})

check('a box under the floor falls back to the wrist estimate rather than drawing nothing', () => {
  const guess = est(0.7)
  const got = racketToDraw(est(RACKET_DRAW_FLOOR - 0.01), () => guess)
  assert(got === guess, 'a box between 0.2 and the floor hid the wrist estimate')
})

check('with neither strong enough, nothing is drawn', () => {
  assert(racketToDraw(est(0.3), () => est(0.4)) === undefined, 'a weak guess should not be drawn')
  assert(racketToDraw(undefined, () => undefined) === undefined, 'no evidence should draw nothing')
})

report()
