/**
 * The same serve, filmed differently, read the same way.
 *
 * This is the harness the corpus in `CORPUS.md` runs through, exercised here on
 * the synthetic rig so that it is known to work before a single real clip
 * arrives — and so that the rig itself is held to the invariants, which it never
 * has been.
 *
 * Read `invariants.ts` for what this can and cannot prove. The short version:
 * passing says the engine is *consistent*, not that it is *right*, and it does
 * not shorten the fixture shoot by one clip. What it does is make an unlabelled
 * clip worth something on the day it arrives instead of on the day somebody
 * finds an hour and a protractor.
 */
import { detectServe } from '../phases'
import { measure } from '../metrics'
import { diagnose } from '../diagnose'
import { LM, jointAngle, sided } from '../geometry'
import { DRIFT_BUDGET, TRANSFORMS, budgetFor, decimate, driftBetween, rescale, tilt } from '../invariants'
import { NOTABLE_ROLL, assessSpatial, levelFrames, levelPivot, levelled } from '../spatial'
import { buildServe, CLEAN_SERVE, type ServeDials } from '../syntheticServe'
import { assert, check, heading, note, report } from './harness'

const FPS = 60
const ASPECT = 1

/**
 * Every measurement of one serve, read by the real pipeline.
 *
 * Including the levelling pass, which this skipped until the rig was re-posed
 * and a tilted phone started moving the shoulder tilt by a third of its band:
 * `runAnalysis` reads the roll, levels the clip by what `levelled` takes out and
 * detects again, so a reader that does not is testing a pipeline nobody runs.
 * The order and arguments are `runAnalysis`'s, as `src/dev/mocap/engine.ts` has
 * them.
 */
function readServe(input: ReturnType<typeof buildServe>, fps = FPS) {
  let frames = input
  let skel = detectServe(frames, fps)
  const { roll_deg } = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  if (levelled(roll_deg) !== 0) {
    frames = levelFrames(frames, roll_deg, levelPivot(frames))
    skel = detectServe(frames, fps)
  }
  const metrics = measure(frames, skel, true).flatMap((f) => f.metrics)
  return { skel, metrics }
}

/**
 * Two serves worth running everything against.
 *
 * A clean one and a club-level one, because an invariant that holds only on a
 * textbook motion holds where it is least needed: the faulty serve is the one
 * whose keyframes sit near a threshold, and a transform that nudges one across
 * is exactly the failure worth catching.
 */
const SERVES: { what: string; dials: Partial<ServeDials> }[] = [
  { what: 'a clean serve', dials: CLEAN_SERVE },
  {
    what: 'a club serve',
    dials: { trophyKneeAngle: 166, dropBelowShoulder: 0.05, contactReach: 1.15, tossElbow: 140 },
  },
]

/** Every (transform, measurement) pair that actually drifted, across every serve. */
const seen = new Set<string>()

heading('Every transform leaves the reading where it was')

for (const serve of SERVES) {
  const original = buildServe(serve.dials, FPS)
  const base = readServe(original)
  const banded = base.metrics.map((m) => ({ id: m.id, value: m.value, ideal: m.ideal }))

  for (const t of TRANSFORMS) {
    check(`${serve.what}, ${t.name} — ${t.proves}`, () => {
      const moved = t.apply(original, ASPECT)
      // The frame rate really did halve, so the engine has to be told — that is
      // the transform, not a detail of it.
      const read = readServe(moved, t.name.includes('frame rate') ? FPS / 2 : FPS)

      if (t.flipsHandedness) {
        assert(
          read.skel.racket !== base.skel.racket,
          `${t.name} did not change which hand was read: still ${read.skel.racket}`,
        )
      } else {
        assert(
          read.skel.racket === base.skel.racket,
          `${t.name} changed which hand was read: ${base.skel.racket} → ${read.skel.racket}`,
        )
      }

      const drift = driftBetween(banded, read.metrics, t.signFlips)
      assert(drift.length > 8, `only ${drift.length} measurements survived ${t.name} to compare`)

      // Only the frame-rate transform changes what the camera could have
      // recorded; every other one leaves the sampling alone, so every other one
      // is held to the flat budget.
      const period = t.name.includes('frame rate') ? 2 / FPS : undefined
      const bands = new Map(banded.map((m) => [m.id, m.ideal]))
      const over = drift.filter(
        (d) => d.share > budgetFor({ id: d.id, ideal: bands.get(d.id)! }, period),
      )

      /*
       * Nothing drifts that is not already written down.
       *
       * A known gap says a measurement *may* fail to survive this transform on
       * some clips — which is what a gap is, since whether a keyframe shifts by
       * a sample depends on the serve. So each clip asserts only that nothing
       * new drifted; whether every listed gap is still real is a question about
       * the whole set and is asked once, after the loop.
       */
      const known = new Set((t.knownGaps ?? []).map((g) => g.id))
      for (const d of over) seen.add(`${t.name}|${d.id}`)
      const unexpected = over.filter((d) => !known.has(d.id))

      assert(
        unexpected.length === 0,
        `${unexpected.length} measurements moved past their budget:\n      ` +
          unexpected
            .slice(0, 6)
            .map(
              (d) =>
                `${d.id}: ${d.before.toFixed(3)} → ${d.after.toFixed(3)} ` +
                `(${(d.share * 100).toFixed(0)}% of its band, budget ` +
                `${(budgetFor({ id: d.id, ideal: bands.get(d.id)! }, period) * 100).toFixed(0)}%)`,
            )
            .join('\n      '),
      )
    })
  }
}

heading('And no known gap has quietly been fixed')

/*
 * A stale exemption is a false statement about the engine.
 *
 * The fixtures README forbids widening a tolerance to make a suite green; this
 * is the other half of the same rule. A measurement listed as not surviving a
 * transform, which now survives it on every serve here, means somebody fixed it
 * — and left a line in `invariants.ts` telling the next reader it is broken.
 */
for (const t of TRANSFORMS) {
  for (const gap of t.knownGaps ?? []) {
    check(`${t.name}: ${gap.id} is still a real gap — ${gap.why}`, () => {
      assert(
        seen.has(`${t.name}|${gap.id}`),
        `no longer drifts on any serve here. If that is a fix, delete this entry ` +
          `from TRANSFORMS in invariants.ts; if it is a thinner set of test serves, ` +
          `say so there.`,
      )
    })
  }
}

heading('And the transforms themselves are doing something')

/*
 * A harness that silently no-ops passes every check above.
 *
 * The failure mode of any invariance suite: a transform that returns its input
 * proves the engine is consistent with itself. Each of these asserts the frames
 * really changed, so the green above is about the engine rather than about the
 * transform having quietly done nothing.
 */
check('decimating really drops frames', () => {
  const frames = buildServe(CLEAN_SERVE, FPS)
  const half = decimate(frames, 2)
  assert(
    half.length <= Math.ceil(frames.length / 2) && half.length > 4,
    `decimate produced ${half.length} of ${frames.length}`,
  )
})

check('rescaling really moves the body in the frame', () => {
  const frames = buildServe(CLEAN_SERVE, FPS)
  const small = rescale(frames, 0.7)
  const spanOf = (f: (typeof frames)[number]) => Math.abs(f.image[27].y - f.image[0].y)
  const shrunk = spanOf(small[0]) / spanOf(frames[0])
  assert(Math.abs(shrunk - 0.7) < 0.02, `the body scaled by ${shrunk.toFixed(3)}, expected 0.7`)
})

check('every transform returns different frames from the ones it was given', () => {
  const frames = buildServe(CLEAN_SERVE, FPS)
  const at = (fs: readonly (typeof frames)[number][]) => `${fs.length}:${JSON.stringify(fs.map((f) => f.image))}`
  for (const t of TRANSFORMS) {
    assert(at(t.apply(frames, ASPECT)) !== at(frames), `${t.name} returned its input unchanged`)
  }
})

check('tilting rolls the picture and the 3D pose by the same amount, once', () => {
  /*
   * The defect this harness carried for two months: the world was rolled twice
   * and the image once, and three "known gaps" were the difference. A phone
   * rolls both by one angle, because MediaPipe reports the world in the
   * camera's frame — so the hip-to-ankle line has to turn by the same six
   * degrees in each, and the roll the pipeline reads off the picture has to be
   * the one that went in.
   */
  const frames = buildServe(CLEAN_SERVE, FPS)
  const rolled = tilt(frames, 6)
  const turn = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x)
  const deg = (r: number) => (r * 180) / Math.PI
  const i = Math.floor(frames.length / 3)
  const image = deg(turn(rolled[i].image[LM.leftHip], rolled[i].image[LM.leftAnkle]) - turn(frames[i].image[LM.leftHip], frames[i].image[LM.leftAnkle]))
  const world = deg(turn(rolled[i].world[LM.leftHip], rolled[i].world[LM.leftAnkle]) - turn(frames[i].world[LM.leftHip], frames[i].world[LM.leftAnkle]))
  assert(Math.abs(image - 6) < 0.01 && Math.abs(world - 6) < 0.01, `the picture turned ${image.toFixed(2)}° and the pose ${world.toFixed(2)}°`)
  const skel = detectServe(rolled, FPS)
  const read = assessSpatial(rolled, skel.keys.ready, skel.bodyHeight).roll_deg
  assert(Math.abs(read - 6) <= 1, `the pipeline read ${read}° of roll off a 6° tilt`)
})

check('levelling has no edge for a stance to sit on', () => {
  // A stance reading 3.99° was levelled on 566 takes of 960 and contact height
  // jumped 0.044 between the two (H37). So the correction grows from nothing, from
  // 5°, past the 3.2° to 5.1° real stances read on a level phone.
  assert(levelled(NOTABLE_ROLL) === 0 && levelled(5) === 0 && levelled(2) === 0, 'a roll under the ramp was corrected')
  assert(levelled(7) === 7 && levelled(-7) === -7 && levelled(12) === 12, 'a phone seven degrees off was not corrected whole')
  assert(levelled(6) === -levelled(-6), 'the two sides are corrected differently')
  // A thousandth of a degree of reading never moves the correction by more than
  // the ramp's own slope allows, 4.5 at the top: there is no edge in it.
  for (let r = 0; r < 12; r += 0.001) {
    const step = Math.abs(levelled(r + 0.001) - levelled(r))
    assert(step <= 0.005, `the correction jumps ${step.toFixed(4)}° at ${r.toFixed(3)}° of roll`)
  }
  const frames = buildServe(CLEAN_SERVE, FPS)
  assert(levelFrames(frames, NOTABLE_ROLL) === frames, 'a clip at the line was copied for nothing')
})

note(`drift budget: ${DRIFT_BUDGET * 100}% of a measurement's own target band`)
note('a convention with an argument, not a measurement — see CORPUS.md')

heading('The rig has to pose a body somebody has')

/**
 * `trophyForearmDrop` moves the hand, and the elbow solved onto it holds both
 * arm lengths only while the hand is within reach — so past about 0.4 it stops
 * laying the arm over and starts stretching it: 1.15× the upper arm at 0.5,
 * 2.07× at 0.8, where a real forearm is about 0.8×. Every
 * measurement read off the racket arm at that dial is then a measurement of an
 * arm nobody has.
 *
 * Pinned rather than fixed. Fixing it means re-deriving the shape the dial makes
 * so the segments hold their length, which changes every `palm_to_sky_deg`
 * reading the suite has ever taken and every band set against them. What is
 * cheap and worth having now is the bound itself, stated once, so a future dial
 * turned up to make a fault "more extreme" fails here instead of quietly
 * lengthening a forearm and being believed.
 */
const forearmRatioAt = (drop: number): number => {
  const frames = buildServe({ noise: 0, depthNoise: 0, depthBias: 0, trophyForearmDrop: drop, seed: 7000 }, 50)
  const skel = detectServe(frames, 50)
  const f = frames[skel.keys.trophy]
  const S = sided(skel.racket)
  const span = (a: number, b: number) =>
    Math.hypot(
      f.world[a].x - f.world[b].x,
      f.world[a].y - f.world[b].y,
      f.world[a].z - f.world[b].z,
    )
  return span(S.elbow, S.wrist) / span(S.shoulder, S.elbow)
}

check('the trophy drop every caller uses keeps the forearm shorter than the upper arm', () => {
  // A real forearm is about 0.8 of the upper arm. One that is longer is the
  // dial stretching rather than rotating, and 1.0 is a generous bound on that.
  for (const drop of [0, 0.15, 0.25, 0.3, 0.4]) {
    const ratio = forearmRatioAt(drop)
    assert(ratio < 1, `at ${drop} the forearm is ${ratio.toFixed(2)}× the upper arm`)
  }
})

/** Elbow→wrist and shoulder→elbow at the trophy, on a clean rig. */
function armAt(dials: Partial<ServeDials>): { forearm: number; upper: number; wrist: [number, number, number] } {
  const frames = buildServe({ noise: 0, depthNoise: 0, depthBias: 0, seed: 7000, ...dials }, 50)
  const skel = detectServe(frames, 50)
  const f = frames[skel.keys.trophy]
  const S = sided(skel.racket)
  const span = (a: number, b: number) =>
    Math.hypot(f.world[a].x - f.world[b].x, f.world[a].y - f.world[b].y, f.world[a].z - f.world[b].z)
  const w = f.world[S.wrist]
  return { forearm: span(S.elbow, S.wrist), upper: span(S.shoulder, S.elbow), wrist: [w.x, w.y, w.z] }
}

check('external rotation is an exact no-op at zero', () => {
  /*
   * The whole safety argument for adding the dial. Every band in `tiers.ts` was
   * set against the numbers this rig produced before it existed, so the default
   * path has to be the same arithmetic and not merely a similar arm — a rotation
   * applied at zero degrees is not promised to return its input in floating
   * point, which is why the dial is skipped rather than applied.
   */
  const before = armAt({})
  const zero = armAt({ trophyExternalRotation: 0 })
  assert(
    before.wrist.every((v, i) => Object.is(v, zero.wrist[i])),
    `the wrist moved at zero: ${JSON.stringify(before.wrist)} → ${JSON.stringify(zero.wrist)}`,
  )
})

check('external rotation moves the arm without lengthening it', () => {
  // The property `trophyForearmDrop` does not have, and the reason this dial
  // exists: the elbow lies on the axis being rotated about, so both segments
  // are preserved exactly rather than approximately.
  const base = armAt({})
  for (const deg of [15, 30, 45, 60]) {
    const turned = armAt({ trophyExternalRotation: deg })
    assert(
      Math.abs(turned.forearm - base.forearm) < 1e-9,
      `at ${deg}° the forearm went ${base.forearm.toFixed(6)} → ${turned.forearm.toFixed(6)}`,
    )
    assert(
      Math.abs(turned.upper - base.upper) < 1e-9,
      `at ${deg}° the upper arm went ${base.upper.toFixed(6)} → ${turned.upper.toFixed(6)}`,
    )
    const moved = Math.hypot(
      turned.wrist[0] - base.wrist[0],
      turned.wrist[1] - base.wrist[1],
      turned.wrist[2] - base.wrist[2],
    )
    assert(moved > 0.01, `at ${deg}° the wrist barely moved (${moved.toFixed(4)} m) — the dial did nothing`)
  }
})

check('the rotation is gone again by the racket drop', () => {
  // Weighted to the trophy on purpose. A rotation still held at the drop or
  // through contact would be modelling a different fault, and `dropDepth` and
  // `pronation` already own those parts of the swing — a dial that quietly moved
  // them would make every sweep of this angle a sweep of three things.
  const clean = buildServe({ noise: 0, depthNoise: 0, depthBias: 0, seed: 7000 }, 50)
  const turned = buildServe(
    { noise: 0, depthNoise: 0, depthBias: 0, seed: 7000, trophyExternalRotation: 45 },
    50,
  )
  const skel = detectServe(clean, 50)
  const at = (fs: typeof clean, i: number) => fs[i].world[sided(skel.racket).wrist]
  const apart = (i: number) =>
    Math.hypot(at(clean, i).x - at(turned, i).x, at(clean, i).y - at(turned, i).y, at(clean, i).z - at(turned, i).z)

  assert(apart(skel.keys.trophy) > 0.01, 'the trophy frame did not move at all')
  assert(apart(skel.keys.contact) < 1e-9, `contact moved by ${apart(skel.keys.contact).toFixed(6)} m`)
  note(`trophy moved ${apart(skel.keys.trophy).toFixed(3)} m, contact ${apart(skel.keys.contact).toFixed(6)} m`)
})

check('and past that the dial is measurably stretching, not rotating', () => {
  // The other half, so the bound above reads as a measured boundary rather than
  // as a number somebody liked. If this ever stops being true the dial has been
  // rebuilt, and the limit documented on it needs rewriting rather than trusting.
  const stretched = forearmRatioAt(0.8)
  assert(stretched > 1.5, `at 0.8 the forearm was ${stretched.toFixed(2)}× the upper arm, expected the documented 2.07×`)
  note(`0.5 → ${forearmRatioAt(0.5).toFixed(2)}×, 0.8 → ${stretched.toFixed(2)}×`)
})

heading('The landing')

/** A leg's two segments, and where its ankle is, at a named frame. */
function legAt(dials: Partial<ServeDials>, at: 'contact' | 'finish') {
  const frames = buildServe({ noise: 0, depthNoise: 0, depthBias: 0, seed: 7000, ...dials }, 50)
  const skel = detectServe(frames, 50)
  const f = frames[at === 'contact' ? skel.keys.contact : skel.keys.finish]
  const span = (a: number, b: number) =>
    Math.hypot(f.world[a].x - f.world[b].x, f.world[a].y - f.world[b].y, f.world[a].z - f.world[b].z)
  const a = f.world[LM.leftAnkle]
  return {
    thigh: span(LM.leftHip, LM.leftKnee),
    shin: span(LM.leftKnee, LM.leftAnkle),
    ankle: [a.x, a.y, a.z] as [number, number, number],
    kneeAngle: jointAngle(f.world[LM.leftHip], f.world[LM.leftKnee], f.world[LM.leftAnkle]),
  }
}

check('the landing is an exact no-op at zero', () => {
  /*
   * The safety argument for adding the dial, and the same one
   * `trophyExternalRotation` had to make. Every band in `tiers.ts` was set
   * against the numbers this rig produced before the landing existed, so a
   * landing dialled to nothing has to be the same arithmetic rather than a
   * similar leg — which is why the call site skips it instead of applying a
   * zero-sized shift and trusting floating point to return its input.
   */
  const before = legAt({}, 'finish')
  const zero = legAt({ landingLean: 0 }, 'finish')
  assert(
    before.ankle.every((v, i) => Object.is(v, zero.ankle[i])),
    `the ankle moved at zero: ${JSON.stringify(before.ankle)} → ${JSON.stringify(zero.ankle)}`,
  )
  assert(Object.is(before.kneeAngle, zero.kneeAngle), 'the knee angle moved at zero')
})

check('the landing moves the body without lengthening a leg', () => {
  // The property the solver exists for: the knee is re-placed from the hip and
  // the ankle by the law of cosines, so both segments survive a shift that moves
  // the ankle a long way. A rig that stretched a shin to reach would report a
  // fault nobody has.
  const base = legAt({}, 'finish')
  for (const metres of [0.04, 0.08, 0.12, 0.16]) {
    const landed = legAt({ landingLean: metres }, 'finish')
    assert(
      Math.abs(landed.thigh - base.thigh) < 1e-9,
      `at ${metres} m the thigh went ${base.thigh.toFixed(9)} → ${landed.thigh.toFixed(9)}`,
    )
    assert(
      Math.abs(landed.shin - base.shin) < 1e-9,
      `at ${metres} m the shin went ${base.shin.toFixed(9)} → ${landed.shin.toFixed(9)}`,
    )
    const moved = Math.hypot(
      landed.ankle[0] - base.ankle[0],
      landed.ankle[1] - base.ankle[1],
      landed.ankle[2] - base.ankle[2],
    )
    assert(moved > 0.01, `at ${metres} m the ankle barely moved (${moved.toFixed(4)} m) — the dial did nothing`)
  }
  note(`thigh and shin hold to 1e-9 across 0.04–0.16 m of landing`)
})

check('nothing at or before contact knows the landing happened', () => {
  /*
   * The claim that lets this dial land without moving one existing expectation.
   * Every measurement in the engine reads a window ending at contact, and the
   * landing track clamps to zero below its first key — so a serve dialled to
   * collapse has to be bit-identical to a clean one everywhere the engine looks.
   *
   * Asserted on the whole body rather than on the leg, because the failure this
   * is guarding against is the landing leaking upwards through the hip origin.
   */
  const clean = buildServe({ noise: 0, depthNoise: 0, depthBias: 0, seed: 7000 }, 50)
  const landed = buildServe(
    { noise: 0, depthNoise: 0, depthBias: 0, seed: 7000, landingLean: 0.12 },
    50,
  )
  const skel = detectServe(clean, 50)
  let worst = 0
  for (let i = 0; i <= skel.keys.contact; i++) {
    for (let k = 0; k < clean[i].world.length; k++) {
      const a = clean[i].world[k]
      const b = landed[i].world[k]
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z))
    }
  }
  assert(worst === 0, `a landmark moved ${worst.toFixed(9)} m at or before contact`)

  // And it does move afterwards, so the check above is a boundary rather than a
  // dial that does nothing at all.
  const after = detectServe(landed, 50)
  const ca = clean[after.keys.finish].world[LM.leftAnkle]
  const la = landed[after.keys.finish].world[LM.leftAnkle]
  const moved = Math.hypot(ca.x - la.x, ca.y - la.y, ca.z - la.z)
  assert(moved > 0.01, `the ankle moved only ${moved.toFixed(4)} m by the finish`)
  note(`contact identical to 0 m, ankle ${moved.toFixed(3)} m across by the finish`)
})

check('the back foot can trail without the front foot noticing', () => {
  /*
   * The asymmetry `landingLean` alone cannot pose, and the reason it was needed:
   * `Diagnosis.landing` reads the ankle CENTRE, which is only a fixed reference
   * while both feet stay planted. A back foot that travels with the hips moves
   * that midpoint, so the same collapse reads smaller — and nothing in the rig
   * could produce that clip to find out by how much.
   *
   * Both halves are asserted, because a dial that moved both feet would look
   * identical in the reading it was built to stress.
   */
  const planted = buildServe({ noise: 0, depthNoise: 0, depthBias: 0, seed: 7000, landingLean: 0.12 }, 50)
  const trailing = buildServe(
    { noise: 0, depthNoise: 0, depthBias: 0, seed: 7000, landingLean: 0.12, landingBackFootDrag: 1 },
    50,
  )
  const skel = detectServe(planted, 50)
  const at = (fs: typeof planted, lm: number) => fs[skel.keys.finish].world[lm]
  const gap = (lm: number) =>
    Math.hypot(
      at(planted, lm).x - at(trailing, lm).x,
      at(planted, lm).y - at(trailing, lm).y,
      at(planted, lm).z - at(trailing, lm).z,
    )

  // A right-handed serve lands on the left, so the right leg is the trailing one.
  assert(gap(LM.leftAnkle) < 1e-9, `the front foot moved ${gap(LM.leftAnkle).toFixed(6)} m when only the back leg was dialled`)
  assert(gap(LM.rightAnkle) > 0.05, `the back foot moved only ${gap(LM.rightAnkle).toFixed(4)} m at full drag`)
  note(`  front foot fixed, back foot ${gap(LM.rightAnkle).toFixed(3)} m across at full drag`)

  // And the segments survive it, since the knee is re-solved on this side too.
  const span = (fs: typeof planted, a: number, b: number) =>
    Math.hypot(at(fs, a).x - at(fs, b).x, at(fs, a).y - at(fs, b).y, at(fs, a).z - at(fs, b).z)
  assert(
    Math.abs(span(trailing, LM.rightHip, LM.rightKnee) - span(planted, LM.rightHip, LM.rightKnee)) < 1e-9 &&
      Math.abs(span(trailing, LM.rightKnee, LM.rightAnkle) - span(planted, LM.rightKnee, LM.rightAnkle)) < 1e-9,
    'the trailing leg stretched',
  )
})

check('a trailing back foot is an exact no-op at zero drag', () => {
  // Same rule as every other dial here: the default path has to be the same
  // arithmetic, not a similar leg, because the landing's own numbers were
  // measured against it.
  const a = legAt({ landingLean: 0.12 }, 'finish')
  const b = legAt({ landingLean: 0.12, landingBackFootDrag: 0 }, 'finish')
  assert(
    a.ankle.every((v, i) => Object.is(v, b.ankle[i])) && Object.is(a.kneeAngle, b.kneeAngle),
    'dialling the drag to zero changed the leg',
  )
})

check('the landing dials are invisible to everything that existed before them', () => {
  /*
   * The claim the whole design rests on, asked downstream instead of at the
   * landmarks.
   *
   * The check above asserts every landmark is bit-identical at and before
   * contact, which is necessary and is not the thing anyone actually cares
   * about. What matters is that no KEYFRAME moves, no SIGNAL moves, no
   * MEASUREMENT moves and no FLAW appears or disappears — because every band in
   * `tiers.ts` and every expectation in this suite was set against a rig that
   * could not pose a landing, and a dial that shifted any of them would have
   * quietly re-baselined the engine.
   *
   * Compared as whole serialised objects rather than field by field: the point
   * is that NOTHING moved, and a check that listed which fields to compare would
   * be blind to exactly the field somebody adds later.
   */
  const base = { noise: 0, depthNoise: 0, depthBias: 0, seed: 7000 }
  const read = (dials: Partial<ServeDials>) => {
    const frames = buildServe({ ...base, ...dials }, 50)
    const skel = detectServe(frames, 50)
    const d = diagnose(frames, skel, { tier: 5 })
    return {
      keys: JSON.stringify(skel.keys),
      signals: JSON.stringify(d.signals),
      metrics: JSON.stringify(measure(frames, skel, true).flatMap((f) => f.metrics.map((m) => [m.id, m.value]))),
      flaws: JSON.stringify(d.flaws.filter((f) => f.detected).map((f) => f.flaw)),
      landing: d.landing.offset,
    }
  }

  const clean = read({})
  const cases: [string, Partial<ServeDials>][] = [
    ['a landing', { landingLean: 0.12 }],
    ['a landing past what the leg can reach', { landingLean: 0.6 }],
    ['a trailing back foot alone', { landingBackFootDrag: 1 }],
    ['both together', { landingLean: 0.12, landingBackFootDrag: 1 }],
  ]
  for (const [what, dials] of cases) {
    const got = read(dials)
    for (const field of ['keys', 'signals', 'metrics', 'flaws'] as const) {
      assert(
        got[field] === clean[field],
        `${what} moved the ${field} — the landing is leaking into what the engine reads before contact`,
      )
    }
  }

  // And the dial is not simply doing nothing, which is how the assertions above
  // would pass on a rig that had quietly stopped posing a landing at all. Read
  // from behind the server: the fall runs along the hip line, which by the
  // finish faces the net, so the guide's camera sees a quarter of it
  // (`depth.test.ts` holds that as a known gap).
  const square = read({ cameraYaw: 0 }).landing
  const landed = read({ landingLean: 0.12, cameraYaw: 0 }).landing
  assert(
    typeof landed === 'number' && typeof square === 'number' && landed > square + 0.03,
    `the only reading that should move went ${square} → ${landed}`,
  )
  note(`  every keyframe, signal, metric and flaw held; landing alone moved ${square} → ${landed}`)
})

check('the landing is clamped where the leg runs out rather than stretching', () => {
  // Asked for far more travel than a leg has, and the documented behaviour is a
  // clamp. The alternative is the solver quietly shortening a segment to reach,
  // which is a rig telling a lie rather than refusing — the one failure mode
  // this whole dial was written to avoid.
  const far = legAt({ landingLean: 0.6 }, 'finish')
  const base = legAt({}, 'finish')
  assert(
    Math.abs(far.thigh - base.thigh) < 1e-9 && Math.abs(far.shin - base.shin) < 1e-9,
    `an over-asked landing stretched the leg: thigh ${far.thigh.toFixed(6)}, shin ${far.shin.toFixed(6)}`,
  )
  // Straight, or as near as the clamp's own margin allows.
  assert(far.kneeAngle > 170, `the clamped leg is not straight (knee ${far.kneeAngle.toFixed(1)}°)`)
  note(`0.6 m asked, leg clamped straight at ${far.kneeAngle.toFixed(1)}° with segments intact`)
})

report()
