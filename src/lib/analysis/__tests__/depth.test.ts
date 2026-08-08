/**
 * The two readings that are made entirely of depth, under depth error.
 *
 * `hipShoulderSeparation` and `shoulderTilt` are yaw and roll about the vertical
 * axis, which means both are computed from the z coordinate of the world
 * landmarks and from nothing else. Every other reading in the engine rests
 * mostly or entirely on x and y, which come off pixels the camera genuinely saw.
 * z does not: a monocular network infers it from apparent size and
 * foreshortening, and it is the softest number MediaPipe produces by a wide
 * margin.
 *
 * The rig modelled that away. `noise` applied one jitter figure to all three
 * axes, so every expectation in this suite about coil and tilt was recorded
 * against a synthetic player whose depth was known as precisely as their
 * outline. The suite's own footer has said so in yellow text for several rounds:
 * those two are unvalidated.
 *
 * This file does not fix that. Only recorded footage fixes that, and there is
 * none — see fixtures/README.md. What it does is stop the rig from flattering
 * the engine, by modelling depth error the way the literature describes it and
 * measuring what the engine does with it:
 *
 *   - depth error several times the in-plane error, per landmark, and
 *   - a shared per-frame depth bias, because the network gets the whole player
 *     slightly too near or too far at once.
 *
 * The second is the one that matters and the one independent jitter cannot
 * stand in for. Separation is a *difference* of two yaw angles, so independent
 * noise on the four landmarks largely cancels; a bias that rotates the whole
 * body does not cancel at all.
 *
 * The numbers asserted below are measurements, not targets. They were read off
 * this rig at these dials and are recorded so that a change to the smoothing,
 * the confidence model or the tier bands cannot quietly move them.
 */
import { diagnose } from '../diagnose'
import { measure } from '../metrics'
import { detectServe } from '../phases'
import { assessSpatial } from '../spatial'
import { SOFT_MEASUREMENT } from '../confidence'
import { NOISE_FLOOR, SIGNALS } from '../tiers'
import { buildServe, type ServeDials } from './syntheticServe'
import { assert, check, heading, note, report } from './harness'
import { evaluateFlaws } from '../flaws'
import type { FlawId } from '../flaws'

const FPS = 50

/** In-plane landmark jitter, matching what the rest of the suite calls realistic. */
const IN_PLANE = 0.006

/**
 * How much worse depth is, and how much of it moves as one.
 *
 * Four times the in-plane error sits in the middle of the published range for
 * MediaPipe world landmarks; the bias term is about a percent of frame height,
 * which on this rig's scale is roughly three centimetres of whole-body depth
 * error on a given frame. Both are model figures rather than anything measured
 * off this app's own footage, which is the entire caveat of this file.
 */
const DEPTH_MULTIPLIER = 4
const DEPTH_BIAS = 0.006

const SEEDS = Array.from({ length: 24 }, (_, i) => 7000 + i * 4523)

interface Read {
  separation: number
  separationConfidence: number
  tilt: number
  tiltConfidence: number
  flaws: Set<FlawId>
  signals: Record<string, number>
  /** The evidence score the flaw pass gave each signal, for the gate below. */
  evidence: Record<string, number>
}

function readOnce(dials: Partial<ServeDials>): Read | undefined {
  const frames = buildServe({ ...dials }, FPS)
  let skel
  try {
    skel = detectServe(frames, FPS)
  } catch {
    return undefined
  }

  const spatial = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  const fundamentals = measure(frames, skel, true, {
    serveType: 'flat',
    confidence: {
      frames,
      skel,
      swingSamples: Math.max(0, skel.keys.contact - skel.keys.drop),
      view: 'side',
      depthUnreliable: spatial.depth_unreliable,
    },
  })

  const all = fundamentals.flatMap((f) => f.metrics)
  const sep = all.find((m) => m.id === 'hipShoulderSeparation')
  const tilt = all.find((m) => m.id === 'shoulderTilt')
  if (!sep || !tilt) return undefined

  const diagnosis = diagnose(frames, skel, { tier: 5 })
  return {
    separation: sep.value,
    separationConfidence: sep.confidence ?? 1,
    tilt: tilt.value,
    tiltConfidence: tilt.confidence ?? 1,
    flaws: new Set(diagnosis.flaws.filter((f) => f.detected).map((f) => f.flaw)),
    signals: diagnosis.signals,
    evidence: Object.fromEntries(diagnosis.flaws.map((f) => [f.signal, f.confidence])),
  }
}

/**
 * How much each signal moves across the ensemble, worst first.
 *
 * Reported as a standard deviation as well as a full range. The range is what a
 * reader wants to see and a poor thing to set a threshold from — over
 * twenty-four draws it is dominated by the two most unlucky ones — so anything
 * downstream that has to pick a number uses the deviation.
 */
function signalSpreads(
  reads: Read[],
): { id: string; spread: number; sd: number; confidence: number }[] {
  const ids = new Set(reads.flatMap((r) => Object.keys(r.signals)))
  return [...ids]
    .map((id) => {
      const xs = reads.map((r) => r.signals[id]).filter((v) => Number.isFinite(v))
      const mu = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
      const variance = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, xs.length)
      return {
        id,
        spread: xs.length ? Math.max(...xs) - Math.min(...xs) : 0,
        sd: Math.sqrt(variance),
        confidence: Math.min(...reads.map((r) => r.evidence[id] ?? 1)),
      }
    })
    .sort((a, b) => b.sd / Math.max(1e-9, Math.abs(NOISE_FLOOR[b.id] ?? 1)) - a.sd / Math.max(1e-9, Math.abs(NOISE_FLOOR[a.id] ?? 1)))
}

/** How many distinct sets of named flaws one identical serve produced. */
const verdicts = (reads: Read[]) =>
  new Set(reads.map((r) => [...r.flaws].sort().join(','))).size

function sweep(dials: Partial<ServeDials>) {
  const reads = SEEDS.map((seed) => readOnce({ ...dials, seed })).filter(
    (r): r is Read => r !== undefined,
  )
  const spreadOf = (pick: (r: Read) => number) => {
    const xs = reads.map(pick)
    return Math.max(...xs) - Math.min(...xs)
  }
  return {
    reads,
    separationSpread: spreadOf((r) => r.separation),
    tiltSpread: spreadOf((r) => r.tilt),
    worstSeparationConfidence: Math.min(...reads.map((r) => r.separationConfidence)),
    worstTiltConfidence: Math.min(...reads.map((r) => r.tiltConfidence)),
  }
}

/* ================================================== the rig was flattering == */

heading('Depth error, modelled rather than assumed away')

const flat = sweep({ noise: IN_PLANE })
const deep = sweep({
  noise: IN_PLANE,
  depthNoise: DEPTH_MULTIPLIER,
  depthBias: DEPTH_BIAS,
})

note(
  `coil across ${flat.reads.length} seeds — isotropic ${flat.separationSpread.toFixed(1)}°, ` +
    `depth-aware ${deep.separationSpread.toFixed(1)}°`,
)
note(
  `tilt across ${deep.reads.length} seeds — isotropic ${flat.tiltSpread.toFixed(1)}°, ` +
    `depth-aware ${deep.tiltSpread.toFixed(1)}°`,
)
note(`distinct diagnoses — isotropic ${verdicts(flat.reads)}, depth-aware ${verdicts(deep.reads)}`)
for (const s of signalSpreads(deep.reads).slice(0, 6)) {
  note(
    `  ${s.id}: sd ${s.sd.toFixed(3)}, range ${s.spread.toFixed(3)}, ` +
      `floor ${NOISE_FLOOR[s.id] ?? '—'}, evidence ${s.confidence.toFixed(2)}`,
  )
}

check('depth error moves the coil reading further than in-plane error does', () => {
  // The point of the whole file. If these came out equal, the rig would still be
  // asserting that a monocular estimate resolves depth as well as it resolves
  // pixels, and every coil expectation in the suite would still be worthless.
  assert(
    deep.separationSpread > flat.separationSpread,
    `depth noise moved coil no further than in-plane noise: ${deep.separationSpread.toFixed(2)}° vs ${flat.separationSpread.toFixed(2)}°`,
  )
})

check('every signal has a noise floor, and it covers what the signal does', () => {
  // The assertion the floors exist for. A floor below the signal's own deviation
  // is a floor that lets the flicker through — the engine would still be naming
  // a fault from a difference smaller than its own resolution. Checked as a
  // ratio against the measured deviation so that a change to the smoothing, the
  // keyframe search or the rig cannot move one without moving the other.
  const uncovered: string[] = []
  for (const s of signalSpreads(deep.reads)) {
    const floor = NOISE_FLOOR[s.id]
    if (floor === undefined) {
      uncovered.push(`${s.id} has no floor at all`)
      continue
    }
    // Capped floors are the known exception, and they are named in `tiers.ts`
    // rather than waved through here: a signal whose noise exceeds its own
    // serious-miss cannot be covered without deleting its detector.
    const capped = floor >= (SIGNALS[s.id]?.seriousMiss ?? Infinity)
    if (!capped && floor < s.sd) {
      uncovered.push(`${s.id}: floor ${floor} under its deviation ${s.sd.toFixed(3)}`)
    }
  }
  assert(uncovered.length === 0, uncovered.join('; '))
})

check('no floor silently deletes the flaw it guards', () => {
  // A floor at or above `seriousMiss` makes its flaw unreachable: no reading can
  // miss the band by more than the engine's own definition of a serious miss.
  // Two do sit exactly at the cap, which is documented; going past it would mean
  // a detector that exists in the code and can never fire.
  const dead = Object.entries(NOISE_FLOOR).filter(
    ([id, floor]) => floor > (SIGNALS[id]?.seriousMiss ?? Infinity),
  )
  assert(
    dead.length === 0,
    `unreachable detectors: ${dead.map(([id, f]) => `${id} (floor ${f})`).join(', ')}`,
  )
})

/* ============================================ does the verdict hold still == */

check('nothing flickers except the two signals known to be under-resolved', () => {
  /*
   * A reading being soft is survivable: it is marked soft, and `pickFocus` sets
   * soft measurements aside. A *flaw* flickering is not — the player is told to
   * fix a different thing depending on which frames the tracker struggled with,
   * and nothing on the report says so.
   *
   * Before the noise floors, one identical serve produced six different sets of
   * named flaws across twenty-four realisations. What is left is confined to the
   * two signals whose floors had to be capped, and asserting *which* rather than
   * *how many* is the difference between a test that documents a known limit and
   * one that quietly absorbs a new one.
   */
  const varies = new Set<FlawId>()
  const always = new Set<FlawId>()
  for (const flaw of new Set(deep.reads.flatMap((r) => [...r.flaws]))) {
    const hits = deep.reads.filter((r) => r.flaws.has(flaw)).length
    ;(hits === deep.reads.length ? always : varies).add(flaw)
  }

  // Exactly the flaws whose signal sits at its cap. Anything else appearing
  // here is a new instability, not a documented one.
  const allowed = new Set<FlawId>(['arming_the_ball', 'pancake_contact'])
  const unexpected = [...varies].filter((f) => !allowed.has(f))
  assert(
    unexpected.length === 0,
    `flaws flickering across identical serves that are not the known two: ${unexpected.join(', ')}`,
  )
  note(`  stable: ${[...always].join(', ') || 'none'} · flickering: ${[...varies].join(', ') || 'none'}`)
})

check('the two depth readings are marked soft when the camera cannot see depth', () => {
  // The hedge that has to be doing the work, since the readings themselves
  // cannot be made better. Filmed from a yaw where one axis of the player's
  // depth points at the lens, both must fall below the threshold that keeps a
  // measurement out of the focus ranking.
  const headOn = readOnce({
    noise: IN_PLANE,
    depthNoise: DEPTH_MULTIPLIER,
    depthBias: DEPTH_BIAS,
    cameraYaw: 4,
    seed: 4242,
  })
  assert(headOn !== undefined, 'a face-on clip could not be read at all')
  assert(
    headOn!.separationConfidence < SOFT_MEASUREMENT,
    `coil kept ${headOn!.separationConfidence.toFixed(2)} confidence on a face-on clip`,
  )
  assert(
    headOn!.tiltConfidence < SOFT_MEASUREMENT,
    `tilt kept ${headOn!.tiltConfidence.toFixed(2)} confidence on a face-on clip`,
  )
})

/* ================================================== what is still missing == */

const capped = signalSpreads(deep.reads)
  .filter((s) => (NOISE_FLOOR[s.id] ?? 0) >= (SIGNALS[s.id]?.seriousMiss ?? Infinity))
  .map((s) => s.id)

if (capped.length) {
  console.log(
    `\n  \x1b[33m⚠ Named at a resolution the measurement does not support: ${capped.join(', ')}.\x1b[0m` +
      `\n  \x1b[2mEach moved further across noise realisations of one identical serve than` +
      `\n  the engine's own definition of a serious miss on that axis. Their floors are` +
      `\n  capped so the detectors stay reachable, which means a fault they name near` +
      `\n  the band edge is not firmly distinguishable from the camera.\x1b[0m`,
  )
}

console.log(
  `\n  \x1b[33m⚠ This is a model of depth error, not a measurement of it.\x1b[0m` +
    `\n  \x1b[2mThe multiplier and the bias above come from published characterisations` +
    `\n  of MediaPipe's world landmarks, not from footage filmed through this app.` +
    `\n  Until fixtures/index.ts has real clips in it, everything here says only` +
    `\n  that the engine is stable under the error it is told to expect.\x1b[0m`,
)

/* ============================================ the floor and the causal graph */

heading('A floor that hides a fault must not hide what it caused')

check('a symptom is still attributed to a cause too small to name', () => {
  /*
   * The regression the noise floors nearly introduced.
   *
   * Attribution used to key off `detected`, which was the same thing as "outside
   * its band" until the floors arrived. After them the two diverge exactly where
   * it hurts: a toss a hair under its band cannot be named as a fault, and it is
   * still the reason the contact underneath it is low. Keying attribution off
   * detection dropped that link, and the report went back to sending the player
   * away to reach higher for a ball that was never up there — the single
   * failure the whole causal pass exists to prevent.
   *
   * Built directly rather than through the rig so the two misses can be placed
   * precisely on either side of the floor.
   */
  const findings = evaluateFlaws(
    {
      // Tier-4 target for a 5: [1.3, 1.86]. Just under, by less than the floor.
      toss_peak_ratio: { value: 1.285, confidence: 0.9 },
      // Target [1.23, 1.62]. Clearly under, by more than the floor.
      contact_height_ratio: { value: 1.19, confidence: 0.9 },
    },
    4,
  )

  const toss = findings.find((f) => f.flaw === 'toss_height')!
  const contact = findings.find((f) => f.flaw === 'low_contact')!

  assert(toss.miss > 0, 'the toss was inside its band, so this proves nothing')
  assert(!toss.detected, `a ${toss.miss} miss was named as a fault despite the floor`)
  assert(contact.detected, 'the contact miss was not large enough to be named')
  assert(
    contact.caused_by === 'toss_height',
    'a low contact was reported without the low toss that caused it',
  )
})

check('a fault below its floor is reported as no fault at all, severity included', () => {
  // A finding that says `detected: false` and `severity: 'high'` is two answers
  // to one question, and `triage` sorts on the second.
  const [only] = evaluateFlaws({ spine_lean_deg: { value: 20, confidence: 0.9 } }, 4)
  assert(only.miss > 0 && only.miss < 6, `this fixture no longer straddles the floor: ${only.miss}`)
  assert(!only.detected, 'a sub-floor miss was named')
  assert(only.severity === 'none', `a hidden fault kept severity "${only.severity}"`)
})

report()
