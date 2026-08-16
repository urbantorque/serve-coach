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

report()
