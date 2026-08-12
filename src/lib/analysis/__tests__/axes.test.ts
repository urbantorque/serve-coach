/**
 * The one place image x is turned into a body axis, checked against the only
 * ground truth in the repo that knows where the camera was.
 *
 * The interesting checks here are not the trigonometry — that is one sine and
 * one cosine and it is either right or it is obviously wrong. They are the
 * three ways this helper could be quietly wrong instead: by disagreeing with
 * the rig's own projection about which world axis image x carries, by drawing
 * its own line between readable and unreadable instead of spatial.ts's, and by
 * handing back a plausible number at an angle where the axis it names is not in
 * the picture at all.
 */
import { assessSpatial, DEPTH_YAW_RANGE } from '../spatial'
import { diagnose } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { assessResilience, triage } from '../triage'
import { causalFocus } from '../verdict'
import { imageXSplit, imageXSplitFrom, readImageX } from '../axes'
import { assert, check, heading, near, note, report, within } from './harness'

const FPS = 50

/**
 * The rig's own projection, lifted from syntheticServe.ts:479-491.
 *
 * Copied rather than imported because it lives inside `buildServe`'s frame
 * loop. It is three lines and it is the definition of the thing under test:
 * world x is net-ward — the depth axis — and world z is across the player.
 */
function rigImageX(depth: number, lateral: number, cameraYaw: number): number {
  const cam = ((90 - cameraYaw) * Math.PI) / 180
  return depth * Math.cos(cam) - lateral * Math.sin(cam)
}

/** Every half degree the camera could legally be at. */
const SWEEP: number[] = []
for (let yaw = 0; yaw <= 90; yaw += 0.5) SWEEP.push(yaw)

heading('What the image x axis means')

check('side-on, image x is depth; face-on, image x is across the body', () => {
  const sideOn = imageXSplit(90)
  near(sideOn.depth.gain, 1, 1e-9, 'depth gain at 90°')
  near(sideOn.lateral.gain, 0, 1e-9, 'lateral gain at 90°')
  assert(sideOn.dominant === 'depth', `90° called image x ${sideOn.dominant}`)

  const faceOn = imageXSplit(0)
  near(faceOn.depth.gain, 0, 1e-9, 'depth gain at 0°')
  near(faceOn.lateral.gain, 1, 1e-9, 'lateral gain at 0°')
  assert(faceOn.dominant === 'lateral', `0° called image x ${faceOn.dominant}`)
})

check('the rig default is the case that made this necessary', () => {
  // 82° is `CLEAN_SERVE.cameraYaw` and what engine.test.ts films at. A reading
  // taken there and called sideways is 98% front-to-back.
  const split = imageXSplit(82)
  near(split.depth.gain, 0.99, 0.005, 'depth gain at the rig default')
  near(split.lateral.gain, 0.139, 0.005, 'lateral gain at the rig default')
  note(
    `at 82°: 2 cm of depth error reads as ${(2 * split.depth.gain * 10).toFixed(1)} mm of image x, ` +
      `2 cm of lateral error as ${(2 * split.lateral.gain * 10).toFixed(1)} mm`,
  )
  assert(split.depth.share > 0.97, `depth share at the rig default was ${split.depth.share}`)
})

check('the split agrees with the rig about which world axis image x carries', () => {
  let worst = 0
  for (const yaw of SWEEP) {
    const split = imageXSplit(yaw)
    // A unit of movement along one axis and nothing along the other, pushed
    // through the rig's own projection. What lands in image x is the gain.
    const depthOnly = Math.abs(rigImageX(1, 0, yaw))
    const lateralOnly = Math.abs(rigImageX(0, 1, yaw))
    worst = Math.max(
      worst,
      Math.abs(depthOnly - split.depth.gain),
      Math.abs(lateralOnly - split.lateral.gain),
    )
  }
  note(`worst disagreement with the rig's projection across 0–90°: ${worst.toExponential(1)}`)
  assert(worst < 1e-12, `the helper and the rig disagree by ${worst}`)
})

check('the two gains are the legs of one unit vector at every angle', () => {
  for (const yaw of SWEEP) {
    const { depth, lateral } = imageXSplit(yaw)
    within(depth.gain, 0, 1, `depth gain at ${yaw}°`)
    within(lateral.gain, 0, 1, `lateral gain at ${yaw}°`)
    // Shares are a split of one reading, so they account for all of it and no
    // more. A pair that summed past 1 would be claiming two measurements.
    near(depth.share + lateral.share, 1, 1e-12, `shares at ${yaw}° do not sum to 1`)
  }
})

check('45° is reported as a coin toss rather than resolved', () => {
  const split = imageXSplit(45)
  near(split.depth.share, 0.5, 1e-12, 'depth share at 45°')
  near(split.lateral.share, 0.5, 1e-12, 'lateral share at 45°')
  assert(split.dominant === null, `45° named ${split.dominant} the dominant axis`)
  // 45 is also `estimateYaw`'s fallback when it cannot measure. Both readings
  // of a 45 deserve the same answer, and this is it.
  assert(split.framing === 'both_axes', `45° framed as ${split.framing}`)
})

heading('Where an axis stops being in the picture')

check('the readable window is the one spatial.ts already justified', () => {
  const [lo, hi] = DEPTH_YAW_RANGE
  // Inclusive at both ends, exactly as `depth_unreliable` is: spatial.ts:76
  // refuses below lo and above hi, so lo and hi themselves are still accepted.
  assert(imageXSplit(lo).depth.readable, `depth was unreadable at ${lo}°, the window's own end`)
  assert(!imageXSplit(lo - 0.5).depth.readable, `depth stayed readable below ${lo}°`)
  assert(imageXSplit(hi).lateral.readable, `lateral was unreadable at ${hi}°, the window's own end`)
  assert(!imageXSplit(hi + 0.5).lateral.readable, `lateral stayed readable above ${hi}°`)
})

check('an axis is called unreadable exactly when spatial calls depth unreliable', () => {
  for (const yaw of SWEEP) {
    const split = imageXSplit(yaw)
    const bothHere = split.depth.readable && split.lateral.readable
    // spatial.ts:76, restated. This helper refines that one flag into which of
    // the two axes died; the union of the two must not have drifted from it.
    const spatialSaysUnreliable = yaw < DEPTH_YAW_RANGE[0] || yaw > DEPTH_YAW_RANGE[1]
    assert(
      bothHere === !spatialSaysUnreliable,
      `at ${yaw}° the split says both=${bothHere} while spatial says unreliable=${spatialSaysUnreliable}`,
    )
  }
})

check('only one axis can ever be missing at once', () => {
  for (const yaw of SWEEP) {
    const { depth, lateral, framing } = imageXSplit(yaw)
    assert(depth.readable || lateral.readable, `${yaw}° lost both axes at once`)
    const expected =
      depth.readable && lateral.readable ? 'both_axes' : depth.readable ? 'depth_only' : 'lateral_only'
    assert(framing === expected, `${yaw}° framed as ${framing}, expected ${expected}`)
  }
})

heading('Reading a number through the split')

check('a drift along one axis comes back at the size it went in', () => {
  // 5% of a body height of pure forward drift, filmed at 60°, arrives as 4.33%
  // of image x. The whole job of this helper is that the 5 comes back.
  const trueDepth = 0.05
  for (const yaw of [30, 45, 60, 78, 90]) {
    const dx = rigImageX(trueDepth, 0, yaw)
    const reading = readImageX(dx, 'depth', imageXSplit(yaw))
    assert(reading.value !== null, `depth refused at ${yaw}°, inside its own window`)
    near(reading.value as number, trueDepth, 1e-12, `depth recovered at ${yaw}°`)
  }
})

check('the doubt lands in the confidence, not in the value', () => {
  // At 30° image x is a quarter depth and three quarters lateral. The depth
  // number is still recoverable — if the drift really was depth — and the
  // confidence is what says how big an if that is.
  const shallow = readImageX(rigImageX(0.05, 0, 30), 'depth', imageXSplit(30))
  near(shallow.value as number, 0.05, 1e-12, 'depth value at 30°')
  near(shallow.confidence, 0.25, 0.005, 'depth confidence at 30°')

  const steep = readImageX(rigImageX(0.05, 0, 78), 'depth', imageXSplit(78))
  near(steep.confidence, 0.96, 0.005, 'depth confidence at 78°')
  assert(steep.confidence > shallow.confidence, 'a better angle did not buy more confidence')
})

check('an axis pointing at the lens is refused, not scaled up', () => {
  // 85° is well past the window: dividing by a lateral gain of 0.087 would
  // multiply the reading, and the jitter in it, by 11.5.
  const refused = readImageX(0.01, 'lateral', imageXSplit(85))
  assert(refused.value === null, `lateral at 85° returned ${refused.value}`)
  assert(refused.confidence === 0, `a refused reading carried confidence ${refused.confidence}`)

  // The other axis at the same angle is fine, which is the point of splitting
  // spatial's single flag in two.
  const kept = readImageX(0.01, 'depth', imageXSplit(85))
  assert(kept.value !== null, 'depth was refused at 85°, where it is all image x carries')
})

check('a yaw that could not be measured refuses everything', () => {
  for (const bad of [Number.NaN, -1, 91, Number.POSITIVE_INFINITY]) {
    const split = imageXSplit(bad)
    assert(split.framing === 'unknown', `${bad} framed as ${split.framing}`)
    assert(split.yaw_deg === null, `${bad} was reported as a yaw of ${split.yaw_deg}`)
    assert(split.dominant === null, `${bad} named a dominant axis`)
    assert(readImageX(0.02, 'depth', split).value === null, `${bad} still answered for depth`)
    assert(readImageX(0.02, 'lateral', split).value === null, `${bad} still answered for lateral`)
  }
})

check('the doubt the spatial pass already has is carried, not dropped', () => {
  const clean = readImageX(0.02, 'depth', imageXSplit(60, 1))
  const rolled = readImageX(0.02, 'depth', imageXSplit(60, 0.5))
  near(clean.confidence, 0.75, 0.005, 'depth confidence from a clean clip at 60°')
  // Half of the clean figure, to within the second decimal place both numbers
  // are rounded to — the literal is 0.37 rather than 0.38 because sin²60 lands
  // a bit under 0.75 in floating point, which is exactly the kind of false
  // precision the rounding exists to stop being reported.
  near(rolled.confidence, clean.confidence / 2, 0.01, 'a half-trusted clip at 60°')
  // The value is geometry and does not move; only the trust in it does.
  near(rolled.value as number, clean.value as number, 1e-12, 'a shakier clip changed the value')
})

heading('Against footage the rig filmed from a known angle')

function splitFromRig(cameraYaw: number) {
  const frames = buildServe({ cameraYaw }, FPS)
  const skel = detectServe(frames, FPS)
  const spatial = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  return { spatial, split: imageXSplitFrom(spatial) }
}

check('a corner camera keeps both axes, a side-on one keeps only depth', () => {
  const corner = splitFromRig(45)
  note(`dialled 45°, measured ${corner.spatial.yaw_deg}° → ${corner.split.framing}`)
  assert(
    corner.split.framing === 'both_axes',
    `a three-quarter camera framed as ${corner.split.framing}`,
  )

  // The rig's default. Measured a few degrees high — `estimateYaw` divides by a
  // fixed shoulder-span ratio and the rig's shoulders are not exactly that —
  // which is why this asserts the verdict and not the angle.
  const sideOn = splitFromRig(82)
  note(`dialled 82°, measured ${sideOn.spatial.yaw_deg}° → ${sideOn.split.framing}`)
  assert(
    sideOn.split.framing === 'depth_only',
    `a dead side-on camera framed as ${sideOn.split.framing}`,
  )
  assert(
    sideOn.split.dominant === 'depth',
    `side-on footage called image x ${sideOn.split.dominant}`,
  )

  const faceOn = splitFromRig(0)
  note(`dialled 0°, measured ${faceOn.spatial.yaw_deg}° → ${faceOn.split.framing}`)
  assert(
    faceOn.split.framing === 'lateral_only',
    `a face-on camera framed as ${faceOn.split.framing}`,
  )
})

check('a shaky vertical costs the axis; a collapsed depth axis does not', () => {
  /*
   * This used to assert that a reading inherits `Spatial.confidence` whole, and
   * pinned the wrong behaviour in place. That number is `rollCost × yawCost`,
   * and `yawCost` is the `depth_unreliable` quarter — a question about whether
   * the pose model had to infer world z, which a split of image x never touches.
   *
   * What it cost: side-on at 82° is where 0.99 of image x is honestly one axis
   * and the yaw estimate is best conditioned, and the reading was docked to 0.74
   * for it. The penalty was also a cliff — 0.96 at 78° and 0.72 at 79° — in the
   * direction where the split gets *purer*, and it left a genuine corner camera
   * at 57°, where 30% of the reading really is the other axis, priced within
   * 0.04 of the side-on one. The doubt about which axis this is already lives in
   * `share`; what `spatial_confidence` is for is doubt about the angle itself.
   */
  const sideOn = splitFromRig(82)
  const reading = readImageX(0.02, 'depth', sideOn.split)
  assert(reading.value !== null, 'depth was refused on side-on footage')
  assert(
    sideOn.spatial.depth_unreliable,
    'the rig stopped producing the case under test — 82° should collapse the depth axis',
  )
  assert(
    reading.confidence > sideOn.spatial.confidence,
    `the depth-axis flag is still being charged to an image-x reading: ` +
      `${reading.confidence} against a spatial confidence of ${sideOn.spatial.confidence}`,
  )
  assert(
    reading.confidence >= 0.9,
    `the purest reading this app can take came back at ${reading.confidence}`,
  )
  note(
    `spatial ${sideOn.spatial.confidence} (roll ${sideOn.spatial.roll_confidence}), ` +
      `depth reading ${reading.confidence}`,
  )

  // And the half that must still be charged: a rolled phone makes the yaw
  // itself a guess, and everything read through the split inherits that.
  const rolled = readImageX(0.02, 'depth', imageXSplit(sideOn.split.yaw_deg ?? 82, 0.5))
  assert(
    rolled.confidence < reading.confidence / 1.5,
    `a clip levelled off a noisy vertical cost nothing: ${rolled.confidence}`,
  )
})

/* ================================== what the player is actually told ====== */

heading('The report the axis decides')

/**
 * One clip, taken all the way to the sentence and the exercise.
 *
 * Everything above this line tests the trigonometry. This tests the thing the
 * trigonometry was for, and it is the assertion that was missing while the bug
 * was live: the split was recovered correctly, the metric card was rewritten
 * correctly, and the largest heading on the report plus the one drill under it
 * still named the opposite axis, because the axis never left `diagnose`.
 */
function reportFor(dials: Partial<ServeDials>) {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const diagnosis = diagnose(frames, skel, { tier: 5 })
  const verdict = triage(diagnosis, assessResilience(frames, skel))
  return { diagnosis, verdict, focus: causalFocus(verdict) }
}

check('a toss that wanders front-to-back is named front-to-back, and drilled that way', () => {
  // Side-on, the framing this app recommends, with a pure depth-axis wobble:
  // 0.99 of the reading is honestly the front/back axis.
  const { verdict, focus } = reportFor({ tossWobble: 0.25, tossWobbleLateral: 0, cameraYaw: 82 })

  assert(verdict.primary_flaw?.flaw === 'toss_drift', `triage chose ${verdict.primary_flaw?.flaw}`)
  assert(verdict.primary_flaw?.axis === 'depth', `the axis reached triage as ${verdict.primary_flaw?.axis}`)
  assert(focus !== undefined, 'no focus was built for a detected toss drift')
  assert(
    /forwards and back/i.test(focus!.title),
    `the headline still names the wrong axis: "${focus!.title}"`,
  )
  assert(
    !/sideways|across your body/i.test(`${focus!.title} ${focus!.why}`),
    `a depth-axis drift was described sideways: "${focus!.title}" / "${focus!.why}"`,
  )
  assert(
    focus!.drill.name === 'Baseline drop toss',
    `a depth-axis drift was answered with "${focus!.drill.name}", which constrains the other axis`,
  )
  note(`side-on: "${focus!.title}" → ${focus!.drill.name}`)
})

check('a toss that wanders sideways is named sideways, and drilled that way', () => {
  // Face-on, where image x really does carry the shoulder-line axis. The
  // original copy and the fence drill are right here and only here.
  const { verdict, focus } = reportFor({ tossWobble: 0, tossWobbleLateral: 0.25, cameraYaw: 0 })

  assert(verdict.primary_flaw?.axis === 'lateral', `the axis reached triage as ${verdict.primary_flaw?.axis}`)
  assert(focus !== undefined, 'no focus was built for a detected toss drift')
  assert(/sideways/i.test(focus!.title), `the headline lost the lateral case: "${focus!.title}"`)
  assert(
    focus!.drill.name === 'Fence line toss',
    `a sideways drift was answered with "${focus!.drill.name}"`,
  )
  note(`face-on: "${focus!.title}" → ${focus!.drill.name}`)
})

check('the two do not swap', () => {
  /*
   * The check that would have caught the original bug on its own, and the reason
   * it is worth having beside the two above: both of those could pass on an
   * engine that ignored the camera entirely and happened to guess right twice.
   * The same wobble, filmed the two ways round, has to produce two different
   * reports — and neither may be the axis-neutral fallback, which would be the
   * engine going quiet rather than answering.
   */
  const depthAxis = reportFor({ tossWobble: 0.25, tossWobbleLateral: 0, cameraYaw: 82 })
  const lateralAxis = reportFor({ tossWobble: 0, tossWobbleLateral: 0.25, cameraYaw: 0 })

  assert(
    depthAxis.focus!.title !== lateralAxis.focus!.title,
    `both cameras produced the same headline: "${depthAxis.focus!.title}"`,
  )
  assert(
    depthAxis.focus!.drill.name !== lateralAxis.focus!.drill.name,
    `both cameras produced the same drill: "${depthAxis.focus!.drill.name}"`,
  )
  assert(
    depthAxis.verdict.primary_flaw?.axis === 'depth' &&
      lateralAxis.verdict.primary_flaw?.axis === 'lateral',
    'the axes came back swapped',
  )
})

report()
