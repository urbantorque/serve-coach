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
import { GHOST_YAW_TOLERANCE_DEG } from '../../trackPair'
import { diagnose } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { assessResilience, triage } from '../triage'
import { causalFocus } from '../verdict'
import { imageXSplit, imageXSplitFrom, readImageX } from '../axes'
import { LM } from '../geometry'
import { MIN_FRAME_HEIGHT_SHARE } from '../framingIssues'
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

heading('A camera angle that could not be read, told apart from one that reads 45')

check('the fallback yaw is labelled rather than left to look like a measurement', () => {
  /*
   * `estimateYaw` returns 45 from two failure exits, and 45 is also what a
   * camera standing at the corner genuinely measures. Two consumers already
   * conflate them and are right to: `axes.ts` gives image x to no axis either
   * way, and `diagnose.ts` records that the same tie deletes three timings.
   *
   * A comparison between two serves cannot. Two clips at a true 45 agree the
   * camera did not move; two clips whose yaw was never read agree on nothing,
   * and their difference is zero for the one reason a gate must never accept.
   * This asserts the two are now distinguishable, and that separating them
   * moved no number.
   */
  const frames = buildServe({ cameraYaw: 45, seed: 4500 }, FPS)
  const skel = detectServe(frames, FPS)

  const real = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  assert(real.yaw_measured, 'a serve the rig filmed from 45° came back as unmeasurable')

  // Exit one: nothing to divide the shoulder span by.
  const noHeight = assessSpatial(frames, skel.keys.ready, 0)
  assert(!noHeight.yaw_measured, 'a yaw taken with no body height claimed to be measured')
  assert(noHeight.yaw_deg === 45, `the fallback stopped being 45: ${noHeight.yaw_deg}`)

  // Exit two: no frame in the window offered two shoulders. Landmarks are
  // removed rather than dimmed, which is the condition `estimateYaw`'s own
  // `if (!l || !r) continue` guard is written against.
  const noShoulders = frames.map((f) => ({
    ...f,
    image: f.image.map((l, i) =>
      i === LM.leftShoulder || i === LM.rightShoulder ? undefined : l,
    ) as unknown as typeof f.image,
  }))
  const unseen = assessSpatial(noShoulders, skel.keys.ready, skel.bodyHeight)
  assert(!unseen.yaw_measured, 'a yaw taken with no shoulders in frame claimed to be measured')
  assert(unseen.yaw_deg === 45, `the fallback stopped being 45: ${unseen.yaw_deg}`)

  // The whole point of labelling rather than re-deriving: the reading itself is
  // untouched, so every band set against it stays where it was.
  const measured45 = real.yaw_deg
  assert(
    Math.abs(measured45 - noHeight.yaw_deg) <= 2,
    `a real 45 and the fallback are no longer the same number: ${measured45} vs ${noHeight.yaw_deg}`,
  )
  note(
    `real 45° reads ${measured45}° measured=${real.yaw_measured}; ` +
      `both fallbacks read 45° measured=false`,
  )
})

/* ------------------------------- what the ghost's camera gate spends on noise -- */

heading('Two clips filmed from the same spot, and how far apart they read')

/**
 * R49b, bounded from `estimateYaw` — the half of the question that can be
 * answered without footage.
 *
 * THE QUESTION THE GATE RAISES. `pairTracks` refuses to draw two saved serves
 * together when their camera angles differ by more than
 * `GHOST_YAW_TOLERANCE_DEG`, which is 5 because past five the camera contributes
 * more than the tracker already does. The obvious worry is that the gate is dead
 * on arrival: if the *reading* wanders more than five degrees between two takes
 * of the identical camera, the gate refuses everything and the ghost never
 * appears for anybody, whatever people actually do with their phones.
 *
 * How often two clips **from one trip** agree is a fact about how people film
 * and there are no fixtures, so it stays open. What the rig can settle is the
 * floor underneath it: two clips filmed from the *same dialled angle*, differing
 * only by tracker noise. Anything the gate spends there is unavailable for the
 * camera genuinely moving.
 *
 * THE ANSWER, AND IT IS THE GOOD ONE. Twelve seeds at each angle:
 *
 *     dial   mean read   deviation   worst spread   pairs within 5°
 *       30      29.0        2.77         11.00           83%
 *       45      46.4        1.80          7.00           94%
 *       60      62.3        1.43          5.00          100%
 *       75      78.0        1.29          5.00          100%
 *       82      84.3        1.03          3.00          100%
 *       88      85.1        1.11          4.00          100%
 *
 * From 60° up, every pair of takes agrees inside the gate. The app asks for
 * side-on footage, so the whole five-degree budget is available for the camera.
 *
 * WHY IT IMPROVES WITH ANGLE, WHICH IS STRUCTURE RATHER THAN LUCK. The reading
 * is `acos(span / SHOULDER_SPAN_RATIO)`, and `d(acos p)/dp` is `-1/√(1-p²)`:
 * unbounded as the projected span approaches its full width — face-on — and at
 * its smallest when the span approaches zero, which is side-on. The estimator is
 * best conditioned exactly where this app is used.
 *
 * AND ONE LIMIT WORTH WRITING DOWN. The mean saturates: 75° reads 78.0, 82°
 * reads 84.3, and 88° reads only 85.1. Past roughly 82 the reading stops
 * tracking the dial. That is fine for a gate on a *difference* between two
 * readings and would not be fine for anything grading the absolute — which is
 * the same shape of finding `UNCALIBRATED.external_rotation_deg` already
 * carries, arrived at from a different direction.
 */
const YAW_SEEDS = [11, 202, 3131, 7000, 44444, 909, 1234, 5678, 8642, 31337, 606, 777]

/** Every yaw the rig reads at one dialled angle, one per seed. */
function yawEnsemble(cameraYaw: number): number[] {
  const read: number[] = []
  for (const seed of YAW_SEEDS) {
    const frames = buildServe({ cameraYaw, seed, noise: 0.006 }, FPS)
    const skel = detectServe(frames, FPS)
    const s = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
    if (s.yaw_measured) read.push(s.yaw_deg)
  }
  return read
}

/** How many pairs of takes land inside the gate, as a share of all pairs. */
function agreementWithin(read: number[], tolerance: number): number {
  let within = 0
  let pairs = 0
  for (let i = 0; i < read.length; i++) {
    for (let j = i + 1; j < read.length; j++) {
      pairs++
      if (Math.abs(read[i] - read[j]) <= tolerance) within++
    }
  }
  return pairs ? within / pairs : 0
}

check('on the side-on footage this app asks for, the gate spends nothing on noise', () => {
  /*
   * Stated in `GHOST_YAW_TOLERANCE_DEG` rather than in 5, so this goes red if
   * either the gate or the estimator moves — which is exactly when the question
   * is worth re-opening. Three angles rather than one, because a single dial is
   * one seed's worth of evidence about a claim that spans a range.
   */
  for (const dial of [60, 75, 82]) {
    const read = yawEnsemble(dial)
    assert(read.length === YAW_SEEDS.length, `${dial}°: only ${read.length} of ${YAW_SEEDS.length} takes read at all`)
    const agree = agreementWithin(read, GHOST_YAW_TOLERANCE_DEG)
    const spread = Math.max(...read) - Math.min(...read)
    note(`  ${dial}° dialled: reads ${(read.reduce((a, b) => a + b, 0) / read.length).toFixed(1)}, spread ${spread.toFixed(1)}, ${(agree * 100).toFixed(0)}% of pairs inside the gate`)
    assert(
      agree === 1,
      `${dial}°: only ${(agree * 100).toFixed(0)}% of takes from one camera agree inside a ` +
        `${GHOST_YAW_TOLERANCE_DEG}° gate — the gate is spending its budget on the tracker`,
    )
  }
})

check('face-on, it does not, and that is the acos and not the app', () => {
  /*
   * The other half, and it has to be asserted or the check above reads as a
   * claim about the estimator everywhere rather than about the range this app
   * films in. A face-on clip is already refused for depth (`DEPTH_YAW_RANGE`),
   * so this costs the ghost nothing today — it is here so that a future round
   * widening what counts as readable finds out what it is buying.
   */
  const read = yawEnsemble(30)
  const agree = agreementWithin(read, GHOST_YAW_TOLERANCE_DEG)
  note(`  30° dialled: ${(agree * 100).toFixed(0)}% of pairs inside the gate`)
  assert(
    agree < 1,
    'the estimator is now as steady face-on as side-on — the acos argument above no longer holds',
  )
})


/* ------------------------------------------- the stance, and where it goes -- */

heading('Why the stance cannot be read from the footage this app asks for')

/**
 * R60's premise, measured — and it is exactly backwards.
 *
 * The round proposed reading platform against pinpoint from ankle separation
 * over time, because "the back foot sliding up to the front is a large, slow,
 * unambiguous motion along the axis the camera sees best". It is large, slow and
 * unambiguous. It is along the axis a side-on camera sees **worst**: a serve
 * stance is apart along the player's own depth axis, and this very file has
 * established that at 82° image x is 99% depth and 14% lateral.
 *
 * So the stance projects onto almost nothing, and the noise floor does not move
 * with it — landmark jitter does not care where the camera is. The signal walks
 * down into a floor that stays put.
 *
 * This is the check that would go red if that ever stopped being true, which is
 * the only circumstance under which the round is worth reopening.
 */
const STANCE_SEEDS = [11, 202, 3131, 7000, 44444, 909, 1234, 5678]

const ankleGapImage = (f: { image: { x: number; y: number }[] }) =>
  Math.hypot(
    f.image[LM.leftAnkle].x - f.image[LM.rightAnkle].x,
    f.image[LM.leftAnkle].y - f.image[LM.rightAnkle].y,
  )

function stanceAt(cameraYaw: number): { mean: number; sd: number } {
  const gaps: number[] = []
  for (const seed of STANCE_SEEDS) {
    const frames = buildServe({ cameraYaw, seed, noise: 0.006 }, FPS)
    const skel = detectServe(frames, FPS)
    gaps.push(ankleGapImage(frames[skel.keys.ready]))
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  return { mean, sd: Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length) }
}

check('the stance walks into the noise as the camera goes side-on', () => {
  const shallow = stanceAt(30)
  const sideOn = stanceAt(82)
  note(
    `  30°: ${shallow.mean.toFixed(4)} ± ${shallow.sd.toFixed(4)} ` +
      `(${((100 * shallow.sd) / shallow.mean).toFixed(0)}%)  ·  ` +
      `82°: ${sideOn.mean.toFixed(4)} ± ${sideOn.sd.toFixed(4)} ` +
      `(${((100 * sideOn.sd) / sideOn.mean).toFixed(0)}%)`,
  )
  // The collapse itself. Two of the three checks here could be satisfied by a
  // rig that simply produced a small stance everywhere; this one cannot.
  assert(
    sideOn.mean < shallow.mean / 4,
    `the stance reads ${sideOn.mean.toFixed(4)} side-on against ${shallow.mean.toFixed(4)} at 30° — ` +
      'it no longer collapses, so R60 is worth reopening',
  )
})

check('the noise floor does not collapse with it, which is the whole problem', () => {
  /*
   * If the floor fell with the signal the ratio would survive and a detector
   * would still work. It does not: jitter is a fraction of the frame and has
   * nothing to do with where the camera stands.
   */
  const shallow = stanceAt(30)
  const sideOn = stanceAt(82)
  assert(
    Math.abs(sideOn.sd - shallow.sd) < shallow.sd * 0.5,
    `the floor moved from ${shallow.sd.toFixed(4)} to ${sideOn.sd.toFixed(4)} — ` +
      'if it now tracks the signal, the ratio may be usable after all',
  )
})

check('side-on, the stance is smaller than twice its own noise', () => {
  // The sentence `UNDER_RESOLVED.stance_narrowing_ratio` rests on, as arithmetic.
  const sideOn = stanceAt(82)
  assert(
    sideOn.mean < 2 * sideOn.sd,
    `side-on the stance reads ${sideOn.mean.toFixed(4)} against a floor of ${sideOn.sd.toFixed(4)} — ` +
      'that is now a signal, and the withdrawal should be revisited',
  )
})

check('and it is genuinely readable face-on, which is why this is withdrawn rather than impossible', () => {
  /*
   * The half that makes this an honest withdrawal instead of a dead end. The
   * measurement exists; the app just cannot ask for the footage it needs.
   * `DEPTH_YAW_RANGE` accepts 18–78° because face-on loses the depth readings
   * the rest of the report is made of, and that trade has nothing to do with
   * feet — so a reading available only there is one the app cannot offer.
   */
  const shallow = stanceAt(30)
  assert(
    shallow.mean > 8 * shallow.sd,
    `even at 30° the stance is only ${(shallow.mean / shallow.sd).toFixed(1)}× its noise, ` +
      'so the withdrawal is about the measurement rather than about the camera',
  )
})


/* ----------------------------------------------- court lines, and their cost -- */

heading('How much court a phone filming a serve can actually see')

/**
 * R62, which `PHASE-8.md` lists **to be refused rather than built**. The
 * finished round is the cost written down, and this is the arithmetic behind it
 * so nobody has to rediscover it.
 *
 * COURT LINES ARE THE ENABLER FOR THE THREE THINGS EVERY PLAYER ASKS FOR — foot
 * faults, placement, and where the ball landed. That is exactly why it needs a
 * refusal with a number rather than a shrug.
 *
 * **THE FRAME DOES NOT CONTAIN THE COURT.** The app asks for a player filling a
 * useful share of the frame — `framingIssues` refuses below
 * `MIN_FRAME_HEIGHT_SHARE`, and the rig builds its 1.8 m player at 0.54 of frame
 * height, which is what good framing looks like. Invert that and the frame spans
 * 1.8 / 0.54 ≈ 3.3 m vertically at the player's distance, so a 16:9 landscape
 * frame is about **5.9 m wide** there.
 *
 * A singles court is 8.23 m between the sidelines and a doubles court 10.97 m.
 * So at the framing this app is built around, **the sidelines are not in shot**
 * — not one of them and the far one by a wide margin. Only at
 * `MIN_FRAME_HEIGHT_SHARE` itself, the point one step above "too far away", does
 * the visible width reach the court at all, and that is the framing where the
 * pose readings the whole report is made of are already degraded.
 *
 * THE COST, FOR SCALE. `vision/ballTrack.ts` and `vision/detector.ts` are 1,237
 * lines between them and took a programme of their own; a line detector is that
 * again, with no calibration, no fixtures, and a homography to estimate from
 * lines that are mostly outside the picture. It would then fail on exactly the
 * amateur footage this app is built to forgive.
 *
 * WHAT WOULD CHANGE IT: a camera further back, which costs the pose readings, or
 * a second device. Not smoothing, not a better model — the lines are not faint,
 * they are absent.
 */
const COURT_SINGLES_WIDTH_M = 8.23
const COURT_DOUBLES_WIDTH_M = 10.97
/** A 1.8 m player at the rig's own scale — what well-framed footage looks like. */
const PLAYER_M = 1.8
const PLAYER_SHARE_OF_FRAME = 0.54

check('at the framing this app asks for, the singles sidelines are out of shot', () => {
  const frameHeightM = PLAYER_M / PLAYER_SHARE_OF_FRAME
  const frameWidthM = frameHeightM * (16 / 9)
  note(`  a 16:9 frame spans ${frameWidthM.toFixed(1)} m at the player, against ${COURT_SINGLES_WIDTH_M} m of singles court`)
  assert(
    frameWidthM < COURT_SINGLES_WIDTH_M,
    `the frame spans ${frameWidthM.toFixed(1)} m and the singles court is ${COURT_SINGLES_WIDTH_M} — ` +
      'the lines are in shot after all, and R62 deserves re-reading',
  )
})

check('even the loosest framing the app accepts barely reaches the doubles court', () => {
  /*
   * The other end, and it is the one that makes the refusal honest rather than
   * convenient. At `MIN_FRAME_HEIGHT_SHARE` the frame is much wider — but that
   * is one step above `too-far-away`, where the tracker is working from a player
   * a few hundred pixels tall, and every reading the report is built from is
   * already soft. Buying court lines by filming from there means paying for them
   * with the serve.
   */
  const frameWidthM = (PLAYER_M / MIN_FRAME_HEIGHT_SHARE) * (16 / 9)
  note(`  at the ${MIN_FRAME_HEIGHT_SHARE} floor the frame spans ${frameWidthM.toFixed(1)} m`)
  assert(
    frameWidthM < COURT_DOUBLES_WIDTH_M * 1.1,
    `even the loosest accepted framing spans ${frameWidthM.toFixed(1)} m, comfortably past the court — ` +
      'the geometry argument in R62 no longer holds',
  )
  assert(
    frameWidthM > COURT_SINGLES_WIDTH_M,
    'the loosest framing does not even reach the singles court, which makes the refusal stronger than stated',
  )
})

report()
