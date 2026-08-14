/**
 * The two speeds the report is finally allowed to show, and what each is worth.
 *
 * A speed is the number a player came for and the easiest number in this app to
 * fabricate. Everything else on the report is a shape judged against a band, so
 * being wrong shows up as advice that does not fit; a speed is a bare figure
 * with nothing beside it to disagree with, and a wrong one is simply believed.
 * So this measures the rig's hand against a truth built out of the rig's OWN
 * world coordinates rather than out of the same image arithmetic the code under
 * test uses — otherwise the suite would only be checking that a formula equals
 * itself.
 *
 * What is pinned:
 *
 *   - the reading recovers the rig's true hand speed side-on, to a few percent,
 *   - it is a LOWER bound and never an over-claim, which is what the docstring
 *     promises and what a player comparing this against a radar gun needs,
 *   - it tracks a serve made faster or slower, so it is a measurement of the
 *     swing rather than a constant dressed up as one,
 *   - every refusal actually refuses: too few frames, a lost wrist, a camera
 *     pointed down the court,
 *   - noise and dropout cost confidence rather than silently moving the number,
 *   - the clock check dockets a stretched clip, and
 *   - the km/h conversion is the player's height and nothing else.
 */
import { LM } from '../geometry'
import { detectServe } from '../phases'
import {
  MIN_SPEED_EVIDENCE,
  isPlausibleHeight,
  readHandSpeed,
  speedInKmh,
  splitAtYaw,
  timebaseTrust,
} from '../power'
import { buildServe, type ServeDials } from '../syntheticServe'
import type { BallFlight } from '../../vision/ballTrack'
import { assert, check, heading, near, note, report, within } from './harness'

const FPS = 120

/** The rig's own standing height, in metres. Its body model is fixed at this. */
const RIG_HEIGHT_M = 1.8

/**
 * The span and lookback `readHandSpeed` searches, restated so the truth below
 * uses the same estimator on different data.
 *
 * Restated rather than imported, on purpose. The point of this file is that the
 * truth is arrived at independently; sharing the constants keeps the two
 * estimators comparable, and sharing the code would make the comparison
 * circular. If either moves in `power.ts` these have to move too, and the first
 * check here fails loudly until they do.
 */
const WINDOW_S = 0.09
const LOOKBACK_S = 0.22

function serve(dials: Partial<ServeDials> = {}, fps = FPS) {
  const frames = buildServe({ noise: 0, cameraYaw: 90, ...dials }, fps)
  const skel = detectServe(frames, fps)
  return { frames, skel }
}

/**
 * What the rig's hand actually did, from the rig's world coordinates.
 *
 * Deliberately NOT read out of `Frame.image`. The code under test fits image x
 * and image y and divides the horizontal by a camera gain; a truth built the
 * same way would agree with it at any camera angle and for any bug in the gain,
 * which is the failure `readOutboundFlight`'s docstring records — a formula
 * written twice, tested once, agreeing at exactly one camera angle.
 *
 * The rig holds the hip centre at world x = z = 0 on every frame and moves the
 * body vertically by raising the hips, so the wrist's horizontal position is
 * `world.x` and `world.z` outright, in metres. Height above the court is the one
 * component the world array cannot give on its own — `world.y` is measured down
 * from a hip that is itself rising — so it comes off image y through the
 * detector's own scale, which is a fact about the picture rather than about the
 * axis being tested.
 */
function trueHand(frames: ReturnType<typeof serve>['frames'], skel: ReturnType<typeof serve>['skel']) {
  const wrist = skel.racket === 'left' ? LM.leftWrist : LM.rightWrist
  const contactT = frames[skel.keys.contact].t
  const pool = frames.filter((f) => f.t >= contactT - LOOKBACK_S && f.t <= contactT + 1e-9)

  const slope = (span: typeof pool, of: (f: (typeof pool)[number]) => number) => {
    const mt = span.reduce((a, f) => a + f.t, 0) / span.length
    const mv = span.reduce((a, f) => a + of(f), 0) / span.length
    let num = 0
    let den = 0
    for (const f of span) {
      num += (f.t - mt) * (of(f) - mv)
      den += (f.t - mt) ** 2
    }
    return num / den
  }

  // The three true axes. World x and z are metres in the rig's own frame, where
  // the hip centre never leaves the origin, so they are the hand's absolute
  // horizontal travel. Height comes off image y through the detector's scale,
  // which is the one component the world array cannot give on its own.
  const depthOf = (f: (typeof pool)[number]) => f.world[wrist].x / RIG_HEIGHT_M
  const lateralOf = (f: (typeof pool)[number]) => f.world[wrist].z / RIG_HEIGHT_M
  const upOf = (f: (typeof pool)[number]) => (skel.groundY - f.image[wrist].y) / skel.bodyHeight

  // The same sliding search `readHandSpeed` runs — one span per start, always
  // the longest that fits inside the window — over different numbers. Matching
  // the span rule matters as much as matching the window: the estimator is a
  // mean over 90 ms, so it attenuates a peak by an amount that depends on how
  // long the span is, and a truth computed over shorter spans would report that
  // attenuation as an error in the code.
  let best = { full: 0, inPlane: 0, depth: 0, lateral: 0, vertical: 0, samples: 0 }
  let end = 0
  for (let i = 0; i < pool.length; i++) {
    if (end < i) end = i
    while (end + 1 < pool.length && pool[end + 1].t - pool[i].t <= WINDOW_S) end++
    if (end - i + 1 < 3) continue
    const span = pool.slice(i, end + 1)
    const depth = slope(span, depthOf)
    const lateral = slope(span, lateralOf)
    const vertical = slope(span, upOf)
    const inPlane = Math.hypot(depth, vertical)
    if (inPlane > best.inPlane) {
      best = {
        full: Math.hypot(depth, lateral, vertical),
        inPlane,
        depth,
        lateral,
        vertical,
        samples: span.length,
      }
    }
  }
  return best
}

const SIDE_ON = splitAtYaw(90)

heading('The hand speed is the hand’s speed')

check('side-on and noise-free, the reading recovers what the rig actually did', () => {
  /*
   * The whole measurement, against a truth from the other side of the rig.
   *
   * `inPlane` rather than `full` is what this is compared to, and the difference
   * is the honest one: the hand carries real travel across the body at contact,
   * one image-x reading cannot be split into depth and lateral, and `readImageX`
   * hands back the share that is honestly depth. So the code is asked to recover
   * the two axes it can see, and the next check asserts that what it misses it
   * misses downwards.
   */
  const { frames, skel } = serve()
  const truth = trueHand(frames, skel)
  const read = readHandSpeed(frames, skel, SIDE_ON)
  assert(read !== undefined, 'a clean side-on serve at 120 fps produced no hand speed at all')

  const error = Math.abs(read!.speed - truth.inPlane) / truth.inPlane
  assert(
    error < 0.06,
    `recovered ${read!.speed.toFixed(3)} against a true in-plane ${truth.inPlane.toFixed(3)} ` +
      `body heights per second (${(error * 100).toFixed(1)}% out)`,
  )
  note(
    `  true depth ${truth.depth.toFixed(2)}, vertical ${truth.vertical.toFixed(2)}, ` +
      `lateral ${truth.lateral.toFixed(2)} · read ${read!.speed.toFixed(2)} from ${read!.samples} frames`,
  )
  note(`  in metres per second that is about ${(read!.speed * RIG_HEIGHT_M).toFixed(1)}`)
})

check('it never claims more than the hand did', () => {
  /*
   * The promise on `HandSpeed.speed`, and the direction that matters.
   *
   * A number that reads low is a player under-selling their own serve, which is
   * a disappointment. A number that reads high is the app telling somebody they
   * hit harder than they do, which is the failure this whole repo is arranged
   * against — and it is the one they would take to a coach. Checked across the
   * camera angles the app accepts, because the depth gain is the term that could
   * turn an under-read into an over-read.
   */
  for (const cameraYaw of [90, 75, 60, 45, 30]) {
    const { frames, skel } = serve({ cameraYaw })
    const truth = trueHand(frames, skel)
    const read = readHandSpeed(frames, skel, splitAtYaw(cameraYaw))
    if (!read) {
      note(`  ${cameraYaw}°: refused`)
      continue
    }
    assert(
      read.speed <= truth.full * 1.02,
      `at ${cameraYaw}° of yaw the reading ${read.speed.toFixed(3)} exceeds everything the hand ` +
        `did (${truth.full.toFixed(3)})`,
    )
    note(
      `  ${cameraYaw}°: read ${read.speed.toFixed(2)} against a true ${truth.full.toFixed(2)} ` +
        `· confidence ${read.confidence.toFixed(2)}`,
    )
  }
})

check('a faster swing reads faster, and by about the right factor', () => {
  /*
   * What separates a measurement from a constant.
   *
   * The rig's `motionSeconds` scales the whole motion in time, so a serve run in
   * three quarters of the time moves every landmark at four thirds the speed.
   * A reading that did not move with it would be describing the rig's geometry
   * rather than its motion — which is exactly what a bug in the time axis looks
   * like, and it would pass every other check in this file.
   */
  const readings = [1.8, 1.35, 1.0].map((motionSeconds) => {
    const { frames, skel } = serve({ motionSeconds })
    return { motionSeconds, read: readHandSpeed(frames, skel, SIDE_ON)! }
  })
  for (const r of readings) assert(!!r.read, `no reading at ${r.motionSeconds}s of motion`)

  for (let i = 1; i < readings.length; i++) {
    const slower = readings[i - 1]
    const faster = readings[i]
    const expected = slower.motionSeconds / faster.motionSeconds
    const actual = faster.read.speed / slower.read.speed
    near(actual, expected, expected * 0.12, `speed ratio from ${slower.motionSeconds}s to ${faster.motionSeconds}s`)
    note(
      `  ${slower.motionSeconds}s → ${faster.motionSeconds}s: ` +
        `${slower.read.speed.toFixed(2)} → ${faster.read.speed.toFixed(2)} (×${actual.toFixed(2)}, expected ×${expected.toFixed(2)})`,
    )
  }
})

heading('What it refuses, and what it merely doubts')

check('a camera pointed down the court is refused outright', () => {
  /*
   * The floor `readImageX` owns, reached through it rather than restated.
   *
   * Below 18° of yaw the depth axis has collapsed towards the lens: its gain is
   * sin(18°) = 0.309 and falling, so dividing by it multiplies tracker jitter by
   * more than three and calls the answer a serve speed. This asserts the refusal
   * lands on that boundary and not on one this file invented.
   */
  const { frames, skel } = serve({ cameraYaw: 90 })
  assert(
    readHandSpeed(frames, skel, splitAtYaw(17)) === undefined,
    'a 17° camera produced a speed the depth axis cannot support',
  )
  assert(
    readHandSpeed(frames, skel, splitAtYaw(18)) !== undefined,
    'the refusal has moved off the boundary `readImageX` sets',
  )
})

check('too few frames through the strike is refused, not extrapolated', () => {
  /*
   * A 90 ms window at 24 fps holds two samples, and a line through two points
   * fits them perfectly whatever the tracker did — so the residual term of the
   * confidence would come back at its best on exactly the footage that deserves
   * it least. Refused rather than reported at a hedge.
   */
  for (const fps of [10, 20]) {
    const { frames, skel } = serve({}, fps)
    assert(
      readHandSpeed(frames, skel, SIDE_ON) === undefined,
      `${fps} fps produced a speed off fewer than three frames inside a 90 ms span`,
    )
  }
  const { frames, skel } = serve({}, 30)
  const read = readHandSpeed(frames, skel, SIDE_ON)
  assert(read !== undefined, '30 fps — the slowest camera this app reads — produced nothing')
  within(read!.samples, 3, 4, 'frames a 30 fps clip gives inside a 90 ms span')
  note(`  30 fps: ${read!.samples} frames, confidence ${read!.confidence.toFixed(2)}`)
})

check('the same serve reads the same at 30 fps as at 240', () => {
  /*
   * The property this number needs and no other measurement on the report does.
   *
   * Everything else here is a shape read at one instant, so a faster camera
   * finds the instant more precisely and that is the end of it. A speed is a
   * difference over time, and an estimator that reported a lower figure off a
   * slower phone would turn "I bought a better phone" into "I got stronger" on
   * the trend — a fabricated gain of exactly the kind `SCORING_VERSION` exists
   * to keep off the chart, arriving by a route the version stamp cannot see.
   *
   * It holds because the span is fixed in SECONDS rather than in frames: 90 ms
   * of swing is 90 ms of swing whether it arrives as three samples or as
   * twenty-two, and a least-squares slope across it is the same slope. An
   * estimator counting frames instead — the obvious way to write this — would
   * measure eight times as much of the swing at 240 Hz as at 30 and attenuate
   * the peak by eight times as much.
   */
  const readings = [30, 48, 60, 120, 240].map((fps) => {
    const { frames, skel } = serve({}, fps)
    return { fps, read: readHandSpeed(frames, skel, SIDE_ON) }
  })
  for (const r of readings) assert(!!r.read, `${r.fps} fps produced no reading at all`)

  const speeds = readings.map((r) => r.read!.speed)
  const spread = (Math.max(...speeds) - Math.min(...speeds)) / Math.min(...speeds)
  for (const r of readings) {
    note(
      `  ${r.fps} fps: ${r.read!.speed.toFixed(2)} from ${r.read!.samples} frames ` +
        `· confidence ${r.read!.confidence.toFixed(2)}`,
    )
  }
  assert(
    spread < 0.08,
    `the same serve read ${(spread * 100).toFixed(1)}% differently across frame rates, so the ` +
      'trend would show a phone upgrade as a faster arm',
  )

  // And the doubt does move with the frame rate, which is the honest half: a
  // three-frame fit is a weaker reading than a twenty-frame one even when both
  // land on the same number.
  assert(
    readings[0].read!.confidence < readings[readings.length - 1].read!.confidence,
    'a 30 fps clip was trusted as much as a 240 fps one',
  )
})

check('a wrist the tracker never saw is refused', () => {
  /*
   * The `occlusionSeconds` failure, in its most complete form. A landmark
   * reported at zero visibility is one the model is inventing, and a straight
   * line through invented points is smooth, confident and about nothing.
   */
  const { frames, skel } = serve()
  const wrist = skel.racket === 'left' ? LM.leftWrist : LM.rightWrist
  const blinded = frames.map((f) => ({
    ...f,
    image: f.image.map((p, i) => (i === wrist ? { ...p, visibility: 0 } : p)),
  }))
  assert(
    readHandSpeed(blinded, skel, SIDE_ON) === undefined,
    'a wrist at zero visibility still produced a speed',
  )
})

check('noise costs confidence, and a noisy clip still clears the gate or is dropped', () => {
  /*
   * The half of hedging that has to be true: doubt has to fall as the clip gets
   * worse, monotonically, or the number beside it means nothing. Swept rather
   * than spot-checked because a confidence that moves the wrong way at one noise
   * level and the right way at another is worse than one that does not move.
   */
  const clean = readHandSpeed(serve({ noise: 0, seed: 7 }).frames, serve({ noise: 0, seed: 7 }).skel, SIDE_ON)!
  let previous = Infinity
  for (const noise of [0, 0.004, 0.01, 0.02, 0.04]) {
    const { frames, skel } = serve({ noise, seed: 7 })
    const read = readHandSpeed(frames, skel, SIDE_ON)
    if (!read) {
      note(`  noise ${noise}: refused`)
      continue
    }
    assert(
      read.confidence <= previous + 1e-9,
      `noise ${noise} came back more confident (${read.confidence.toFixed(2)}) than the cleaner ` +
        `clip before it (${previous.toFixed(2)})`,
    )
    previous = read.confidence

    /*
     * And the other half, which is the one that actually failed.
     *
     * Doubt falling as a clip gets worse is worth nothing if the NUMBER moves
     * too — a speed that drifts with the tracker's jitter is a speed about the
     * camera. The first version of this searched spans of every length and let
     * the maximum pick whichever short, noisy baseline pointed the right way; it
     * reported 0.89 on one clip and 1.96 on the same serve with jitter added,
     * and the confidence beside it never moved at all.
     *
     * Held over the range real footage occupies. `syntheticServe.ts` puts pose
     * jitter at 0.5–1.5% of the frame between consecutive samples, so 0.02 is
     * already past the worst of that and 0.04 is not a clip anybody filmed.
     */
    if (noise <= 0.02) {
      const drift = Math.abs(read.speed - clean.speed) / clean.speed
      assert(
        drift < 0.06,
        `noise ${noise} moved the speed ${(drift * 100).toFixed(1)}% (${clean.speed.toFixed(2)} → ` +
          `${read.speed.toFixed(2)}) — the jitter is being reported as swing speed`,
      )
    }
    note(
      `  noise ${noise}: speed ${read.speed.toFixed(2)}, confidence ${read.confidence.toFixed(2)}` +
        `${read.confidence < MIN_SPEED_EVIDENCE ? ' — below the gate, so nothing is shown' : ''}`,
    )
  }
  assert(previous < 1, 'the sweep never docked a single clip, so the residual term is doing nothing')
})

heading('The clock, and the unit')

check('a stretched clip is docked by the ball’s own arc', () => {
  /*
   * The one witness this app has that the clip's seconds are seconds.
   *
   * `expectedGravity` is what gravity should look like at the image scale the
   * player's height implies; `fittedGravity` is what the tossed ball actually
   * did in the pixels. A clip whose seconds run slow fits gravity off by the
   * same factor, and the square root is because one is an acceleration and the
   * quantity being priced is a speed.
   *
   * Exercised through the same function `analyze.ts` now calls for the ball
   * speed, which is the reason it moved into `power.ts` at all: one clock check
   * with two callers, rather than two copies with one test between them.
   */
  const bodyHeight = 0.54
  const honest = (9.81 * bodyHeight) / 1.78 / 2
  const flightAt = (factor: number) =>
    ({ coefficients: [0, 0, honest * factor] } as unknown as BallFlight)

  near(timebaseTrust(flightAt(1), bodyHeight), 1, 1e-6, 'a clip whose clock is right')
  for (const factor of [0.7, 0.85, 1.2, 1.6]) {
    const trust = timebaseTrust(flightAt(factor), bodyHeight)
    assert(trust < 1, `a clip fitting gravity ${factor}× off was not docked at all`)
    note(`  gravity fitted ${factor}×: trust ${trust.toFixed(3)}`)
  }
  assert(
    timebaseTrust(flightAt(0.7), bodyHeight) < timebaseTrust(flightAt(0.85), bodyHeight),
    'a worse clock was trusted more than a better one',
  )
  assert(timebaseTrust(flightAt(0), bodyHeight) === 0, 'a ball with no curvature was trusted')
})

check('a clip with a toss fit is priced by it rather than by the blanket dock', () => {
  const { frames, skel } = serve()
  const bare = readHandSpeed(frames, skel, SIDE_ON)!
  const honest = (9.81 * skel.bodyHeight) / 1.78 / 2
  const withBall = readHandSpeed(frames, skel, SIDE_ON, {
    coefficients: [0, 0, honest],
  } as unknown as BallFlight)!

  // The speed is a fact about the pixels and the clock check is a fact about
  // the doubt, so supplying evidence must move one and not the other.
  near(withBall.speed, bare.speed, 1e-12, 'the speed itself, with and without a ball')
  assert(
    withBall.confidence > bare.confidence,
    `a verified clock (${withBall.confidence.toFixed(3)}) was worth no more than an unverified ` +
      `one (${bare.confidence.toFixed(3)}) — so checking does not pay and nobody will`,
  )
  note(`  unwitnessed ${bare.confidence.toFixed(3)} · verified ${withBall.confidence.toFixed(3)}`)
})

check('km/h is the player’s own height and nothing else', () => {
  /*
   * The conversion `OutboundFlightReading.speed` refuses to make on its own,
   * made only against a stated height. The arithmetic is checked at the two
   * heights the docstring argues about — an adult at the assumed 1.78 m and the
   * 1.45 m junior it says would be read 23% fast.
   */
  near(speedInKmh(10, 178), 10 * 1.78 * 3.6, 1e-9, 'ten body heights a second for a 1.78 m player')
  near(speedInKmh(10, 145), 10 * 1.45 * 3.6, 1e-9, 'the same serve by a 1.45 m junior')
  const overstatement = speedInKmh(10, 178) / speedInKmh(10, 145) - 1
  near(overstatement, 0.2276, 1e-3, 'how far assuming an adult height over-reads a junior')
  note(`  assuming 178 cm for a 145 cm player reads ${(overstatement * 100).toFixed(1)}% fast`)

  for (const bad of [0, 12, 109, 231, 400, NaN, undefined]) {
    assert(!isPlausibleHeight(bad as number), `${bad} was accepted as a standing height`)
  }
  for (const ok of [110, 145, 178, 230]) {
    assert(isPlausibleHeight(ok), `${ok} cm was refused as a standing height`)
  }
})

report()
