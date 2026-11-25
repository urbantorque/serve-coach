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
import { mirrorFrames } from '../mirror'
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
    near(depth.share + lateral.share, 1, 1e-12, `shares at ${yaw}° don’t sum to 1`)
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
  assert(steep.confidence > shallow.confidence, 'a better angle didn’t buy more confidence')
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

check('a yaw that couldn’t be measured refuses everything', () => {
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
  note(`dialled 45°, read ${corner.spatial.court_yaw_deg}° to the court → ${corner.split.framing}`)
  assert(
    corner.split.framing === 'both_axes',
    `a three-quarter camera framed as ${corner.split.framing}`,
  )

  // The rig's default. Read off the shoulders at the ready, which a real
  // server has square to this camera, so the reading is pinned at the end of
  // its range rather than measured there — which is why this asserts the
  // verdict and not the angle.
  const sideOn = splitFromRig(82)
  note(`dialled 82°, read ${sideOn.spatial.court_yaw_deg}° to the court → ${sideOn.split.framing}`)
  assert(
    sideOn.split.framing === 'depth_only',
    `a dead side-on camera framed as ${sideOn.split.framing}`,
  )
  assert(
    sideOn.split.dominant === 'depth',
    `side-on footage called image x ${sideOn.split.dominant}`,
  )

  const faceOn = splitFromRig(0)
  note(`dialled 0°, read ${faceOn.spatial.court_yaw_deg}° to the court → ${faceOn.split.framing}`)
  assert(
    faceOn.split.framing === 'lateral_only',
    `a face-on camera framed as ${faceOn.split.framing}`,
  )
})

check('a shaky vertical costs the axis; a collapsed depth axis doesn’t', () => {
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
    focus!.drill.name === 'Baseline toss',
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

check('the two don’t swap', () => {
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

heading('The camera against the court, from the swing')

/**
 * `courtYawFromSwing`: the hitting hand's path from the drop to contact, read
 * as a direction against the lens and turned back by `SWING_OFF_NET_DEG`.
 *
 * The rig's swing is posed on the Bath serves, so it veers off the net by the
 * same 19° the constant carries, and these checks are about the arithmetic
 * and its noise rather than about that constant — which `mocap.test.ts`
 * checks on real motion from five placements.
 */
const courtFromRig = (dials: Partial<ServeDials>) => {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  return assessSpatial(frames, skel.keys.ready, skel.bodyHeight, skel)
}

/** The true angle between the net direction and the picture, for a dial. */
const courtOfDial = (dial: number) => {
  const a = ((dial % 180) + 180) % 180
  return a > 90 ? 180 - a : a
}

check('it reads the dial all the way round, with no side mistaken for the other', () => {
  /*
   * Including the dials either side of each square-on and end-on, which is
   * where the stance reading saturated (every dial from 60 to 90 read 90) and
   * folded (45 and 105 read the same). Noise-free, so a miss is arithmetic.
   */
  const misses: string[] = []
  for (let dial = 0; dial < 180; dial += 15) {
    const s = courtFromRig({ cameraYaw: dial })
    if (s.court_yaw_from !== 'swing' || Math.abs(s.court_yaw_deg - courtOfDial(dial)) > 2) {
      misses.push(`${dial}→${s.court_yaw_deg} (${s.court_yaw_from})`)
    }
  }
  assert(misses.length === 0, `read off the dial: ${misses.join(', ')}`)
})

check('depth noise moves it by degrees, not by sides', () => {
  /*
   * The depth half of the swing's direction is inferred, so it is jittered
   * here at the suite's depth-aware figures — four times the picture's noise,
   * and a shared per-frame offset on top.
   */
  let worst = 0
  for (const dial of [0, 30, 45, 60, 82]) {
    for (const seed of [11, 202, 3131, 7000, 44444, 909]) {
      const s = courtFromRig({ cameraYaw: dial, seed, noise: 0.006, depthNoise: 4, depthBias: 0.006 })
      worst = Math.max(worst, Math.abs(s.court_yaw_deg - courtOfDial(dial)))
    }
  }
  note(`  worst miss over five dials and six takes each: ${worst}°`)
  assert(worst <= 12, `a noisy take read ${worst}° off the dial`)
})

check('a left-hander reads the same court', () => {
  // Mirrored, the swing veers the other way, and the constant has to flip
  // with the hand or every left-hander is read 38° off.
  for (const dial of [20, 45, 82]) {
    const frames = mirrorFrames(buildServe({ cameraYaw: dial }, FPS), 1)
    const skel = detectServe(frames, FPS)
    const s = assessSpatial(frames, skel.keys.ready, skel.bodyHeight, skel)
    assert(skel.racket === 'left', 'the mirrored serve wasn’t read left-handed')
    within(s.court_yaw_deg, courtOfDial(dial) - 2, courtOfDial(dial) + 2, `left-handed at ${dial}°`)
  }
})

check('a swing too short to point anywhere falls back to the stance', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const stuck = { ...skel, keys: { ...skel.keys, drop: skel.keys.contact - 1 } }
  const s = assessSpatial(frames, skel.keys.ready, skel.bodyHeight, stuck)
  assert(s.court_yaw_from === 'stance', `a one-sample swing was read as a direction (${s.court_yaw_deg}°)`)
  const none = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  assert(none.court_yaw_from === 'stance', 'with no swing handed over, the stance is all there is')
})

heading('A camera angle that couldn’t be read, told apart from one that reads 45')

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
  // Dialled at 27° because that is where this rig READS 45. The reading is the
  // camera against the shoulders at the ready, and since the rig was re-posed
  // on the Bath serves those sit 15° past the net axis — so the dial and the
  // reading are no longer the same number, and the claim here is about the
  // reading.
  const frames = buildServe({ cameraYaw: 27, seed: 4500 }, FPS)
  const skel = detectServe(frames, FPS)

  const real = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  assert(real.yaw_measured, 'a serve the rig filmed to read 45° came back as unmeasurable')

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
 * THE ANSWER CHANGED WHEN THE RIG STOOD LIKE A REAL SERVER, and the new one is
 * worse. Twelve seeds at each angle, re-measured after the rig was re-posed on
 * the Bath serves (it used to stand with its shoulders pointing at the guide's
 * camera; a real server stands with their back to it):
 *
 *     dial   mean read   deviation   worst spread   pairs within 5°
 *        0      73.0        1.29          5             100%
 *       15      57.1        1.50          5             100%
 *       27      44.0        1.83          6              95%
 *       45      22.2        3.08         10              76%
 *       60       1.2        3.31         12              83%
 *       75       0.0        0.00          0             100%
 *       82       0.0        0.00          0             100%
 *       88       0.9        3.04         11              83%
 *
 * At the guide's own dial every pair agrees — and that is saturation, not a
 * steady estimator. The shoulders are square to that camera at the ready, their
 * projected span comes out wider than `SHOULDER_SPAN_RATIO`, and the clamp pins
 * the reading at zero on every take. Either side of the pinned range, at 60°
 * and at 88°, noise lifts some takes off zero and a sixth of same-spot pairs
 * land outside the gate; at a true corner it is a quarter.
 *
 * WHY, AND IT IS THE SAME STRUCTURE AS BEFORE, REFLECTED. The reading is
 * `acos(span / SHOULDER_SPAN_RATIO)`, and `d(acos p)/dp` is `-1/√(1-p²)`:
 * unbounded as the projected span approaches its full width — shoulders square
 * to the lens — and smallest when it approaches zero. It used to be best
 * conditioned at the guide's placement because the rig turned its shoulders
 * end-on to it. A real server turns them square to it, which is the worst
 * conditioned the estimator gets, and only the clamp hides that at the dial
 * itself. A phone a few degrees off the guide's line is outside the clamp.
 *
 * Pinned below rather than fixed: the fix is a camera reading that does not
 * rest on one shoulder span at the ready and holds still from serve to serve
 * (ROADMAP D7.2) — the swing's direction, which now gives the court angle, does
 * not — and a wider gate would admit pairs whose difference really is the phone.
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

const describe = (dial: number, read: number[], agree: number) =>
  `  ${dial}° dialled: reads ${(read.reduce((a, b) => a + b, 0) / read.length).toFixed(1)}, ` +
  `spread ${(Math.max(...read) - Math.min(...read)).toFixed(1)}, ${(agree * 100).toFixed(0)}% of pairs inside the gate`

check('at the guide\'s own placement every take agrees, because the reading is pinned', () => {
  /*
   * Stated in `GHOST_YAW_TOLERANCE_DEG` rather than in 5, so this goes red if
   * either the gate or the estimator moves. And the pinning is asserted beside
   * the agreement, so nobody reads 100% here as a steady estimator: it is the
   * clamp, and the KNOWN check below is what it costs a step either side.
   */
  for (const dial of [75, 82]) {
    const read = yawEnsemble(dial)
    assert(read.length === YAW_SEEDS.length, `${dial}°: only ${read.length} of ${YAW_SEEDS.length} takes read at all`)
    const agree = agreementWithin(read, GHOST_YAW_TOLERANCE_DEG)
    note(describe(dial, read, agree))
    assert(agree === 1, `${dial}°: only ${(agree * 100).toFixed(0)}% of takes from one camera agree inside the gate`)
    assert(
      read.every((v) => v === 0),
      `${dial}°: the reading is no longer pinned at zero — the shoulder span moved against SHOULDER_SPAN_RATIO`,
    )
  }
})

check('KNOWN: a step either side of the guide\'s placement, the gate spends its budget on noise', () => {
  /*
   * The defect, pinned. A phone a few degrees off the guide's line, or thirty
   * degrees round towards the corner, is outside the clamp, and a sixth of
   * same-spot takes then read as a moved camera and the ghost is refused for
   * it. When this goes red the gate's reading has stopped resting on one
   * shoulder span (ROADMAP D7.2) — flip it. The court angle now has a second
   * reading, from the swing, and it is not the answer here: a swing varies
   * 9–17° from serve to serve at a fixed camera, wider than the gate itself.
   */
  for (const dial of [60, 88]) {
    const read = yawEnsemble(dial)
    const agree = agreementWithin(read, GHOST_YAW_TOLERANCE_DEG)
    note(describe(dial, read, agree))
    assert(
      agree < 1,
      `KNOWN gap closed: at ${dial}° every same-spot pair now agrees inside the gate without being pinned — flip this`,
    )
  }
})

check('end-on to the shoulders it is steady, and that is the acos and not the app', () => {
  /*
   * The other half, and it has to be asserted or the KNOWN check above reads as
   * a claim about the estimator everywhere. Filmed from behind the server the
   * shoulders point at the lens at the ready, the span is near zero, and the
   * acos is at its best: every pair agrees, unpinned.
   */
  const read = yawEnsemble(0)
  const agree = agreementWithin(read, GHOST_YAW_TOLERANCE_DEG)
  note(describe(0, read, agree))
  assert(
    agree === 1 && read.every((v) => v > 0),
    'end-on, same-spot takes no longer agree — the acos argument above no longer holds',
  )
})


/* ------------------------------------------- the stance, and where it goes -- */

heading('The stance, from the footage this app asks for')

/**
 * R60's premise, measured twice — and the second time it is right.
 *
 * The round proposed reading platform against pinpoint from ankle separation
 * over time, because "the back foot sliding up to the front is a large, slow,
 * unambiguous motion along the axis the camera sees best". R60·2 refused it on
 * this file's evidence: the rig's feet sat apart along the guide camera's line
 * of sight, the stance projected onto almost nothing side-on, and the signal
 * walked down into a noise floor that stays put.
 *
 * The rig stood the wrong way round. A real server's front foot is ahead of the
 * back one towards the net — the Bath servers' ankles sit 0.17 m apart along the
 * net axis at the ready, and 0.28 m along the baseline — and the guide's camera
 * looks along the baseline, so the net-axis half of the stance runs straight
 * across its picture. Re-posed on that motion the rig reads the stance at
 * eighteen times its own noise from the guide's placement, larger than from a
 * corner. R60·2's refusal rested on the old stance and is reopened (ROADMAP
 * D7.2); nothing reads the stance yet.
 *
 * One limit the corner row carries: the rig's feet are apart along the net axis
 * only, where a real stance is also apart along the baseline. So from a corner a
 * real stance reads larger than this rig's, and the side-on figure is the one
 * that matches.
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

check('side-on, the stance stands well clear of its own noise', () => {
  const shallow = stanceAt(30)
  const sideOn = stanceAt(82)
  note(
    `  30°: ${shallow.mean.toFixed(4)} ± ${shallow.sd.toFixed(4)} ` +
      `(${((100 * shallow.sd) / shallow.mean).toFixed(0)}%)  ·  ` +
      `82°: ${sideOn.mean.toFixed(4)} ± ${sideOn.sd.toFixed(4)} ` +
      `(${((100 * sideOn.sd) / sideOn.mean).toFixed(0)}%)`,
  )
  // The reopening itself, as arithmetic: what R60·2 asserted was under twice
  // its noise is now many times it.
  assert(
    sideOn.mean > 8 * sideOn.sd,
    `side-on the stance reads only ${(sideOn.mean / sideOn.sd).toFixed(1)}× its noise — ` +
      'R60·2\'s refusal is back in force',
  )
  // And it is the guide's camera that sees it best, which is the half a rig
  // producing a big stance everywhere could not satisfy.
  assert(
    sideOn.mean > shallow.mean,
    `the stance reads ${sideOn.mean.toFixed(4)} side-on against ${shallow.mean.toFixed(4)} at 30° — ` +
      'the guide\'s camera is no longer the one that sees it best',
  )
})

check('the noise floor doesn’t move with the camera', () => {
  /*
   * Jitter is a fraction of the frame and has nothing to do with where the
   * camera stands — which used to be the whole problem and is now why the ratio
   * above can be trusted at either angle.
   */
  const shallow = stanceAt(30)
  const sideOn = stanceAt(82)
  assert(
    Math.abs(sideOn.sd - shallow.sd) < shallow.sd * 0.5,
    `the floor moved from ${shallow.sd.toFixed(4)} to ${sideOn.sd.toFixed(4)} — ` +
      'if it now tracks the signal, the ratio above wants re-reading',
  )
})

check('and from a corner too', () => {
  const shallow = stanceAt(30)
  assert(
    shallow.mean > 8 * shallow.sd,
    `at 30° the stance is only ${(shallow.mean / shallow.sd).toFixed(1)}× its noise`,
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
    'the loosest framing doesn’t even reach the singles court, which makes the refusal stronger than stated',
  )
})

report()
