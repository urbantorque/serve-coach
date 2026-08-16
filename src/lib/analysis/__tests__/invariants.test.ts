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
import { sided } from '../geometry'
import { DRIFT_BUDGET, TRANSFORMS, budgetFor, decimate, driftBetween, rescale } from '../invariants'
import { buildServe, CLEAN_SERVE, type ServeDials } from '../syntheticServe'
import { assert, check, heading, note, report } from './harness'

const FPS = 60
const ASPECT = 1

/** Every measurement of one serve, read by the real pipeline. */
function readServe(frames: ReturnType<typeof buildServe>, fps = FPS) {
  const skel = detectServe(frames, fps)
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

note(`drift budget: ${DRIFT_BUDGET * 100}% of a measurement's own target band`)
note('a convention with an argument, not a measurement — see CORPUS.md')

heading('The rig has to pose a body somebody has')

/**
 * `trophyForearmDrop` moves the hand and nothing puts the forearm back, so past
 * about 0.3 it stops laying the arm over and starts stretching it — 1.40× the
 * upper arm at 0.4, 3.35× at 0.8, where a real forearm is about 0.8×. Every
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
  for (const drop of [0, 0.15, 0.25, 0.3]) {
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
  assert(stretched > 2, `at 0.8 the forearm was ${stretched.toFixed(2)}× the upper arm, expected the documented 3.35×`)
  note(`0.4 → ${forearmRatioAt(0.4).toFixed(2)}×, 0.8 → ${stretched.toFixed(2)}×`)
})

report()
