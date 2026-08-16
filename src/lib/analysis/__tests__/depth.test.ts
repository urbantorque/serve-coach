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
 *
 * The ensemble itself now lives in `./repeatability.ts`, because it had stopped
 * being this file's private business: `NOISE_FLOOR` is derived from it, and a
 * derivation that only one suite can run is one nobody can check.
 *
 * What that move exposed is the last thing worth saying here. This file used to
 * report two flaws flickering across realisations of one identical serve and
 * pass, on the grounds that both were known and documented. Known and documented
 * prints the same green tick as fixed, and it printed it for four rounds. Both
 * are now dealt with on their merits — `arming_the_ball` kept at a floor the
 * measurement actually supports, `pancake_contact` no longer named at all — so
 * the allowance is gone and one identical serve produces one verdict. The
 * checks that let the two through have been replaced by checks that would have
 * caught them, which is the only useful form of that lesson.
 */
import { LM } from '../geometry'
import { diagnose } from '../diagnose'
import { measure } from '../metrics'
import { detectServe } from '../phases'
import { assessSpatial } from '../spatial'
import { peakTimeInside } from '../kinematics'
import { SOFT_MEASUREMENT } from '../confidence'
import { NOISE_FLOOR, SIGNALS, UNCALIBRATED, UNDER_RESOLVED, inferTier } from '../tiers'
import { buildServe, type ServeDials } from '../syntheticServe'
import { assert, check, heading, note, report } from './harness'
import {
  DEPTH_AWARE,
  DEPTH_BIAS,
  DEPTH_MULTIPLIER,
  FPS,
  IN_PLANE,
  SEEDS,
  chainDeviations,
  deviations,
  flattenUngraded,
  floorVerdicts,
  namedOn,
  realise,
  type Realisation,
} from './repeatability'
import { evaluateFlaws } from '../flaws'
import type { FlawId } from '../flaws'

/**
 * One realisation, read at both levels this file cares about.
 *
 * Extends the shared `Realisation` rather than restating it, so the ensemble
 * this suite measures deviations from is provably the same one `NOISE_FLOOR`
 * was derived against. The two metric readings on top are this file's own
 * business: `hipShoulderSeparation` and `shoulderTilt` are the pair made
 * entirely of depth, and their confidence is the hedge under test below.
 */
interface Read extends Realisation {
  separation: number
  separationConfidence: number
  tilt: number
  tiltConfidence: number
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
    named: new Set(diagnosis.flaws.filter((f) => f.detected).map((f) => f.flaw)),
    signals: diagnosis.signals,
    // Flattened by the shared helper rather than here, so this suite and
    // `realise` cannot end up disagreeing about which links a realisation
    // produced — the same argument that moved the ensemble into that file.
    chain: flattenUngraded(diagnosis),
    bySignal: Object.fromEntries(
      diagnosis.flaws.map((f) => [
        f.signal,
        { detected: f.detected, miss: f.miss, confidence: f.confidence },
      ]),
    ),
  }
}

/** How many distinct sets of named flaws one identical serve produced. */
const verdicts = (reads: Read[]) =>
  new Set(reads.map((r) => [...r.named].sort().join(','))).size

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
for (const s of deviations(deep.reads).slice(0, 6)) {
  note(
    `  ${s.id}: sd ${s.sd.toFixed(3)}, range ${s.range.toFixed(3)}, ` +
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
  // a fault from a difference smaller than its own resolution.
  //
  // This used to carry an exception for capped floors, which is what let two
  // signals be graded finer than they measure for as long as they were. There is
  // no exception now: every floor covers its signal, and a floor that cannot is
  // a decision somebody has to write down rather than a case this waves through.
  const uncovered: string[] = []
  for (const s of deviations(deep.reads)) {
    const floor = NOISE_FLOOR[s.id]
    if (floor === undefined) uncovered.push(`${s.id} has no floor at all`)
    else if (floor < s.sd) {
      uncovered.push(`${s.id}: floor ${floor} under its deviation ${s.sd.toFixed(3)}`)
    }
  }
  assert(uncovered.length === 0, uncovered.join('; '))
})

check('no floor is quietly set below what its own repeatability asks for', () => {
  /*
   * The check this file was missing, and the reason two flaws survived four
   * rounds of honesty work being named at a resolution nothing supported.
   *
   * `NOISE_FLOOR` documents its rule as one and a half deviations. When that
   * came out above a signal's `seriousMiss` the number was silently clipped down
   * to `seriousMiss` instead, so the detector stayed reachable — and the clip
   * left no trace. In the table it read as a plausible constant. Here it read as
   * an `if` branch called `capped`. Nowhere did anything say "this flaw is named
   * from a measurement that cannot support it".
   *
   * So: a floor below what the measurement asks for now fails outright, and a
   * signal whose measurement cannot reach its own serious miss has to appear in
   * `UNDER_RESOLVED` with a stated decision. Both directions are checked, so an
   * entry that stops being true is as loud as one that goes missing.
   *
   * And the floor being too *high* fails too, which for a while it did not. A
   * blanket `floor > seriousMiss` invariant used to live here; it was deleted
   * along with the cap, because `hip_lead_ms` and `pronation_deg` genuinely need
   * to break it. Deleting it rather than carrying the exception on the
   * `UNDER_RESOLVED` allowlist — which the too-low direction already uses — left
   * the other direction unwatched, and `flaws.ts` reads `miss >= NOISE_FLOOR[…]`
   * to decide whether a fault is resolvable at all. Set `spine_lean_deg` to 500
   * and nothing here objected: not capped, not under-resolved, its floor still
   * covers its deviation, and a detector that never fires never flickers. The
   * flaw is not hedged by that, it is deleted by it, silently, from a constant
   * table. That is the same invisible kill the cap was, pointing the other way.
   */
  const capped: string[] = []
  const measured = new Set<string>()

  for (const v of floorVerdicts(deep.reads)) {
    if (v.floor !== undefined && v.capped) {
      capped.push(
        `${v.id}: floor ${v.floor} below the ${v.wanted} its deviation of ${v.sd.toFixed(1)} asks for`,
      )
    }
    if (v.floor !== undefined && v.floor > v.seriousMiss && !v.declared) {
      capped.push(
        `${v.id}: floor ${v.floor} above its own ${v.seriousMiss} serious miss, so only ` +
          'faults the engine already calls serious can ever be named — and no decision is ' +
          'recorded in UNDER_RESOLVED',
      )
    }
    if (v.underResolved) {
      measured.add(v.id)
      if (!v.declared) {
        capped.push(
          `${v.id} cannot resolve its own ${v.seriousMiss} serious miss ` +
            `(needs a ${v.wanted} floor) and is not declared in UNDER_RESOLVED`,
        )
      }
    }
  }

  for (const id of Object.keys(UNDER_RESOLVED)) {
    if (!measured.has(id)) {
      capped.push(`${id} is declared under-resolved but this ensemble resolves it — re-check it`)
    }
  }

  assert(capped.length === 0, capped.join('; '))
  note(`  under-resolved and declared: ${[...measured].join(', ') || 'none'}`)

  /*
   * What this ensemble did not look at, said out loud rather than left implicit.
   *
   * Everything above is derived from the signals this one serve produced, so a
   * floor whose signal never appeared is a floor nothing here has checked. That
   * is not a failure — `separation_deg` is absent because the default camera
   * collapses depth and the flaw pass correctly drops it, and `toss_peak_ratio`
   * needs a tracked ball this rig is not throwing — but an unchecked floor
   * reading as a passing one is the shape of problem this whole file exists to
   * stop, so it prints.
   */
  const unchecked = Object.keys(NOISE_FLOOR).filter((id) => !deep.reads.some((r) => id in r.signals))
  if (unchecked.length) note(`  floors this ensemble never exercised: ${unchecked.join(', ')}`)
})

check('the sequencing detector that was kept still tells a gross fault from none', () => {
  /*
   * What earns `arming_the_ball` its place, stated as the measurement rather
   * than as an opinion. `hip_lead_ms` is under-resolved and the decision taken
   * was to keep it at an honest 85 ms floor, on the grounds that it still
   * separates a grossly armed serve from a clean one. If that stops being true
   * the flaw has to go, and this is what would say so.
   *
   * Rates rather than single clips, because a single clip is exactly how this
   * escaped notice: filmed once, noiseless, the detector looks perfect.
   *
   * The margins are wide on purpose. Twenty-four draws read 0% and 83% here,
   * and sixty draws of the same ensemble read 2% and 78% — which is the spread
   * you get on a rate from two dozen samples, not a change in the engine. The
   * bounds are set at 15% and 50% so that an unlucky ensemble passes and a
   * detector that has actually come apart does not, because a test that fails
   * on luck is a test people learn to re-run rather than read.
   */
  const clean = namedOn(realise(), 'arming_the_ball')
  const gross = namedOn(realise({ hipLead: -0.12 }), 'arming_the_ball')
  note(`  arming named on ${(clean * 100).toFixed(0)}% clean, ${(gross * 100).toFixed(0)}% grossly armed`)

  assert(
    clean <= 0.15,
    `a clean, well-sequenced serve was told it arms the ball on ${(clean * 100).toFixed(0)}% of realisations`,
  )
  assert(
    gross >= 0.5,
    `a serve whose shoulders fire 120 ms early was caught only ${(gross * 100).toFixed(0)}% of the time`,
  )
})

check('the contact detector that was dropped stays measured and stays silent', () => {
  /*
   * The other half of the same decision. `pancake_contact` is marked `notNamed`
   * in `flaws.ts`, which has to mean two things at once or it means nothing: the
   * player never hears it, and the number is still there.
   *
   * A serve with no forearm rotation at all is the strongest case that could be
   * made for naming it, so it is the one worth asserting against — if the flaw
   * is going to leak back into the report, it leaks here first.
   */
  const dead = realise({ pronation: 0 })
  assert(dead.length > 0, 'the pancake ensemble produced no readable clips')
  assert(
    namedOn(dead, 'pancake_contact') === 0,
    'a suppressed flaw was named to a player after all',
  )

  const withValue = dead.filter((r) => Number.isFinite(r.signals.pronation_deg))
  assert(
    withValue.length === dead.length,
    `pronation_deg went missing on ${dead.length - withValue.length} clips — it is meant to survive as data`,
  )
  const missed = dead.filter((r) => (r.bySignal.pronation_deg?.miss ?? 0) > 0).length
  note(`  pronation still measured on ${withValue.length}/${dead.length}, outside its band on ${missed}`)
})

/* ================================================ where a link is read from */

heading('The kinetic chain, and what its provenance costs')

/**
 * The links read from coordinates the camera measured, and the ones inferred.
 *
 * Split by provenance rather than by anatomy, because that is the axis the
 * measurement below actually varies along. `legs` is the hips rising in image y,
 * `elbow` and `wrist` are planar speeds off image x and y; `hips` and
 * `shoulders` are yaw angles recovered from MediaPipe's world z.
 */
const SEEN = ['legs_peak_ms', 'elbow_peak_ms', 'wrist_peak_ms', 'chain_span_ms']
const INFERRED = ['hips_peak_ms', 'shoulders_peak_ms']

/**
 * Chain links that are an end of a signal the engine does grade.
 *
 * The trunk pair are the same two peak-finds `hip_lead_ms` is the difference of.
 * They appear in the chain so that the two provenances can be compared on one
 * clip, and they are not uncalibrated — their band is in `SIGNALS` and the
 * decision about their resolution is in `UNDER_RESOLVED`. Everything else in the
 * chain has no band anywhere and has to say so in `UNCALIBRATED`.
 */
const GRADED_END: Record<string, string> = {
  hips_peak_ms: 'hip_lead_ms',
  shoulders_peak_ms: 'hip_lead_ms',
}

/**
 * The worst deviation either group is allowed before this suite stops believing
 * the finding it was built to establish.
 *
 * Measured, not chosen: at 50 fps on the depth-aware ensemble the image-plane
 * links come in at 0.5 to 7.8 ms and the two trunk yaws at 27.6 and 53.3 — the
 * figures the table this check prints reports on the same run, which is where
 * they have to come from. (They read 0.4 to 6.7, 27.0 and 53.0 until someone
 * checked them against that table: the same numbers the suite was printing in
 * the line below, transcribed once and left to age.) The bounds sit at roughly
 * double and roughly half, so ordinary drift does not trip them and a change
 * that collapsed the gap — someone rebuilding a planar speed out of world
 * coordinates, say — fails here rather than quietly halving the only argument
 * this work rests on.
 */
const SEEN_CEILING = 15
const INFERRED_FLOOR = 15

check('the chain read from the picture plane holds still where the one read from depth does not', () => {
  /*
   * The finding this workstream exists to establish, as a measurement.
   *
   * A serve's sequence can be assembled two ways. The engine's original pair —
   * hip yaw against shoulder yaw — is built from `world.z`, which the pose model
   * infers from apparent size and foreshortening rather than reads off pixels.
   * The three links added beside them are built from image x and y, which the
   * camera genuinely saw. Same clip, same tracker, same pass, same ensemble.
   *
   * If the two provenances came out comparable, the chain would be a nice-to-have
   * and `hip_lead_ms` would be as good as sequencing gets here. They do not come
   * out comparable, and the gap is two orders of magnitude at the distal end.
   */
  const byId = new Map(chainDeviations(deep.reads).map((d) => [d.id, d]))
  const missing = [...SEEN, ...INFERRED].filter((id) => !byId.has(id))
  assert(missing.length === 0, `the ensemble produced no reading for ${missing.join(', ')}`)

  for (const id of SEEN) {
    const d = byId.get(id)!
    assert(
      d.sd <= SEEN_CEILING,
      `${id} is read from the picture plane and still moved ${d.sd.toFixed(1)} ms`,
    )
  }
  for (const id of INFERRED) {
    const d = byId.get(id)!
    assert(
      d.sd >= INFERRED_FLOOR,
      `${id} now moves only ${d.sd.toFixed(1)} ms — if depth got this good, ` +
        'UNDER_RESOLVED.hip_lead_ms and the whole chain argument want re-deriving',
    )
  }

  for (const d of chainDeviations(deep.reads)) {
    // The ratio is dimensionless and every other row here is milliseconds. It
    // printed as "0.0 ms, range 0" under this format, which reads as a quantity
    // that does not move rather than as one measured in the wrong unit.
    if (d.id === 'chain_span_ratio') {
      note(
        `  ${d.id.padEnd(17)} image x,y   deviation ${d.sd.toFixed(4)}      ` +
          `range ${d.range.toFixed(4)}   n=${d.n}   (dimensionless)`,
      )
      continue
    }
    // Degrees, for the same reason the ratio above is not milliseconds: this bag
    // is every ungraded measurement rather than only the chain, and the chain is
    // the only part of it measured in time. Nothing here asserts against it —
    // SEEN and INFERRED are explicit lists — but a line reading "9.4 ms" about
    // an angle is a wrong number in a file whose whole job is deriving right
    // ones, and it would be quoted somewhere eventually.
    if (d.id === 'external_rotation_deg') {
      note(
        `  ${d.id.padEnd(17)} world x,y,z deviation ${d.sd.toFixed(1).padStart(5)}°   ` +
          `range ${d.range.toFixed(0).padStart(4)}°  n=${d.n}   (not graded — see UNCALIBRATED)`,
      )
      continue
    }
    note(
      `  ${d.id.padEnd(17)} ${SEEN.includes(d.id) ? 'image x,y ' : 'world z   '} ` +
        `deviation ${d.sd.toFixed(1).padStart(5)} ms   range ${d.range.toFixed(0).padStart(4)}   n=${d.n}`,
    )
  }
})

check('every chain link is measured and none of them grades anybody', () => {
  /*
   * The pancake precedent, applied to five links at once.
   *
   * Repeatability is necessary and nowhere near sufficient. Every link above
   * clears any floor this repo would ask of it — and not one of them names a
   * flaw, because there is no band to name it against and the rig cannot produce
   * a serve where the quantity differs. `UNCALIBRATED` records that decision per
   * link; this is what stops the record and the code drifting apart.
   *
   * Three directions, because each has its own way of going quietly wrong:
   *
   *   - a link the ensemble produces with no entry: something is measured and
   *     undeclared, which is how an ungraded number starts looking graded,
   *   - an entry the ensemble never produces: a stale declaration about a
   *     measurement that no longer exists, and
   *   - an entry that has grown a `SIGNALS` spec: somebody wrote anchors, the
   *     thing is calibrated now, and the entry saying it cannot be is a lie
   *     that would outlive them.
   */
  const produced = new Set(chainDeviations(deep.reads).map((d) => d.id))
  const problems: string[] = []

  for (const id of produced) {
    // Two of the links are the two ends of a signal that IS graded: the trunk
    // pair are the same peak-finds `hip_lead_ms` is the difference of, exposed
    // beside the others so the two provenances can be compared on one clip.
    // They are accounted for by that band and by `UNDER_RESOLVED`, not here —
    // and the lookup is against `SIGNALS` rather than a second hard-coded list,
    // so deleting the band leaves this link undeclared and fails.
    if (id in GRADED_END) {
      if (!SIGNALS[GRADED_END[id]]) {
        problems.push(`${id} claims to feed ${GRADED_END[id]}, which has no band`)
      }
      continue
    }
    if (!(id in UNCALIBRATED)) problems.push(`${id} is measured with no entry in UNCALIBRATED`)
  }
  for (const id of Object.keys(UNCALIBRATED)) {
    if (!produced.has(id)) problems.push(`${id} is declared uncalibrated but nothing produced it`)
    if (SIGNALS[id]) problems.push(`${id} has a band now — it is calibrated, so drop the entry`)
    if (NOISE_FLOOR[id]) problems.push(`${id} has a noise floor, which only a graded signal needs`)
  }
  assert(problems.length === 0, problems.join('; '))

  /*
   * And the load-bearing half: none of it reaches `signals`.
   *
   * `signals` is what votes on a tier and what pairs into an injury flag. A
   * chain link arriving there would be an uncalibrated number quietly acquiring
   * both powers, which is precisely the failure `UNCALIBRATED` is written to
   * prevent — and it would happen by someone adding one line to `diagnose`.
   */
  const leaked = deep.reads.flatMap((r) => Object.keys(r.chain).filter((id) => id in r.signals))
  assert(
    leaked.length === 0,
    `chain links reached the graded signals: ${[...new Set(leaked)].join(', ')}`,
  )
})

check('a peak that is only the edge of its own window is not a peak', () => {
  /*
   * The fabrication `peakTimeInside` exists to refuse, tested where it happens.
   *
   * `peakAbsIn` always returns an index. At the edge of its window that index is
   * not a peak, it is the largest sample it was allowed to see — and a boundary
   * is in the same place on every noise realisation, so the fabricated reading
   * comes back with a deviation near zero. A made-up number that looks steadier
   * than a real one is the one shape of error the ensemble above cannot catch,
   * because the ensemble measures steadiness.
   *
   * This is a unit test on the helper and not a clip, and that is the point of
   * it. The blinding check below was written believing it covered this branch
   * and does not: setting a landmark's `visibility` to 0.05 leaves `image.x` and
   * `image.y` untouched, `planarSpeedSeries` reads only those two, so the speed
   * series is bit-identical and its peak lands in exactly the same interior
   * place. That link is dropped by the evidence gate, which is a different
   * mechanism. Nothing in the suite reached `if (at <= lo || at >= hi)` at all —
   * deleting the line left the suite green — so the one branch protecting
   * against a number that is really a window boundary had no test on it.
   *
   * Three series, one shape each: still climbing at the close, still falling
   * from before the open, and a genuine interior maximum.
   */
  const t = Float32Array.from({ length: 12 }, (_, i) => i * 0.02)
  const climbing = Float32Array.from({ length: 12 }, (_, i) => i)
  const falling = Float32Array.from({ length: 12 }, (_, i) => 20 - i)
  const peaked = Float32Array.from({ length: 12 }, (_, i) => 10 - Math.abs(i - 6))

  assert(
    peakTimeInside(climbing, t, 0, 11) === null,
    'a series still rising at the end of the window reported the boundary as an event',
  )
  assert(
    peakTimeInside(falling, t, 0, 11) === null,
    'a series already falling at the start of the window reported the boundary as an event',
  )
  const found = peakTimeInside(peaked, t, 0, 11)
  assert(found !== null, 'a genuine interior peak was refused')
  assert(
    Math.abs((found as number) - t[6]) < 0.01,
    `the interior peak landed at ${found} rather than near ${t[6]}`,
  )
  // And the same window with no interior at all: two samples have no inside.
  assert(peakTimeInside(peaked, t, 5, 6) === null, 'a window with no interior produced a peak')
  note('  rising, falling and no-interior windows all refuse; an interior peak is found')
})

check('a link whose landmark was never seen is dropped rather than defaulted', () => {
  /*
   * The other way a link goes missing: the evidence gate rather than the window.
   *
   * A clip the tracker never saw the racket hand in. The hand is still
   * reported by the pose model, because it always is, and the planar speed built
   * from it still has a maximum somewhere — an interior one, so the check above
   * is not what fires here. What must come back is nothing.
   *
   * Only the wrist is blinded, and that is the point of the assertion below:
   * the links that did not depend on it must survive. A pass that dropped the
   * whole chain whenever one landmark went missing would pass a test that only
   * checked for the absence of a lie.
   */
  const frames = buildServe({ ...DEPTH_AWARE, seed: SEEDS[0] }, FPS)
  const skel = detectServe(frames, FPS)
  const blind = frames.map((f) => ({
    ...f,
    image: f.image.map((p, i) =>
      i === (skel.racket === 'left' ? LM.leftWrist : LM.rightWrist)
        ? { ...p, visibility: 0.05 }
        : p,
    ),
  }))

  const seen = diagnose(frames, skel, { tier: 5 }).chain
  const unseen = diagnose(blind, skel, { tier: 5 }).chain

  assert(seen.wrist.ms !== null, 'the racket hand was not read even on a clean clip')
  assert(
    unseen.wrist.ms === null,
    `a racket hand nobody saw still produced a peak at ${unseen.wrist.ms} ms`,
  )
  assert(
    unseen.span_ms === null,
    `the chain span survived an end that did not: ${unseen.span_ms}`,
  )
  // The other end of the same argument: this is a drop, not a collapse.
  assert(
    unseen.legs.ms !== null && unseen.elbow.ms !== null,
    'blinding one landmark dropped links that did not depend on it',
  )
  assert(
    unseen.wrist.confidence < 0.45,
    `the dropped link claimed ${unseen.wrist.confidence} confidence on the way out`,
  )
  note(
    `  racket hand seen: peak ${seen.wrist.ms} ms, span ${seen.span_ms} ms · ` +
      `unseen: peak ${unseen.wrist.ms}, span ${unseen.span_ms}, elbow still ${unseen.elbow.ms} ms`,
  )
})

check('the trunk pair are dropped on the same evidence that drops the legs', () => {
  /*
   * `ChainTiming` contradicting itself about one pair of landmarks.
   *
   * `chain.legs` and `chain.hips` read the SAME two hip landmarks — one as a
   * rise in image y, the other as a yaw off world z. The trunk pair used to be
   * written straight out of `peakAbsIn` with no evidence gate and no window-edge
   * test, so on a clip with the four trunk landmarks blinded the object said
   * both things at once: `legs` null and unseen, `hips` reporting -249 ms at
   * confidence 0.02 from those same unseen hips — while `hip_lead_ms`, built out
   * of the very same two peak-finds, was correctly dropped from `signals`.
   *
   * The contract in `ChainTiming`'s own doc-comment is "never a zero, never a
   * default", and two of its five links were exempt from it.
   */
  const frames = buildServe({ ...DEPTH_AWARE, seed: SEEDS[0] }, FPS)
  const skel = detectServe(frames, FPS)
  const trunk: number[] = [LM.leftHip, LM.rightHip, LM.leftShoulder, LM.rightShoulder]
  const blind = frames.map((f) => ({
    ...f,
    image: f.image.map((p, i) => (trunk.includes(i) ? { ...p, visibility: 0.02 } : p)),
  }))

  const seen = diagnose(frames, skel, { tier: 5 }).chain
  const d = diagnose(blind, skel, { tier: 5 })

  assert(
    seen.hips.ms !== null && seen.shoulders.ms !== null,
    'the trunk pair were not read even on a clean clip',
  )
  assert(
    d.chain.hips.ms === null && d.chain.shoulders.ms === null,
    `trunk landmarks nobody saw still produced peaks at ${d.chain.hips.ms} and ${d.chain.shoulders.ms} ms`,
  )
  // The signal built from the same two peaks agrees. That agreement is the point.
  assert(
    d.signals.hip_lead_ms === undefined,
    'hip_lead_ms survived the blinding its own two peaks did not',
  )
  assert(
    d.chain.legs.ms === null,
    'the hips read as a rise survived a blinding the hips read as a yaw did not',
  )
  note(
    `  blinded trunk: hips ${d.chain.hips.ms} at ${d.chain.hips.confidence}, ` +
      `legs ${d.chain.legs.ms}, hip_lead_ms ${d.signals.hip_lead_ms ?? 'dropped'}`,
  )
})

check('the corner camera does not delete the links it cannot name an axis for', () => {
  /*
   * A one-degree hole in the middle of the yaw range, from pricing a magnitude
   * with an axis-attribution doubt.
   *
   * The elbow and wrist links used to be multiplied by `axes.ts`'s `share` — how
   * much of an image-x reading is honestly one named body axis. `dominant` is
   * null at exactly 45°, where the two gains cross, so the factor was zero and
   * `MIN_EVIDENCE` took the rest: swept a degree at a time, dial 43 (a measured
   * yaw of 45) returned elbow, wrist and span all null at confidence 0, while
   * 42° and 44° read the same wrist at -83 ms. `estimateYaw` also returns 45
   * when it cannot measure at all, so an unreadable camera deleted the three
   * best-conditioned timings in the pass and called it evidence.
   *
   * These links are `hypot(vx, vy)` magnitudes and are never named for a body
   * axis, so that was never their doubt. What the angle does cost them is a
   * systematic in WHEN they peak, which lives in `UNCALIBRATED`.
   */
  const readings = [41, 42, 43, 44, 45, 46, 47].map((cameraYaw) => {
    const frames = buildServe({ ...DEPTH_AWARE, seed: SEEDS[0], cameraYaw }, FPS)
    const skel = detectServe(frames, FPS)
    return { cameraYaw, chain: diagnose(frames, skel, { tier: 5 }).chain }
  })

  const lost = readings.filter(
    (r) => r.chain.elbow.ms === null || r.chain.wrist.ms === null || r.chain.span_ms === null,
  )
  assert(
    lost.length === 0,
    `the picture-plane links went missing at yaw ${lost.map((r) => r.cameraYaw).join(', ')}`,
  )

  // And the readings either side of the tie agree, which is what says the hole
  // was an artefact of the pricing rather than of the measurement.
  const wrists = readings.map((r) => r.chain.wrist.ms as number)
  const spread = Math.max(...wrists) - Math.min(...wrists)
  assert(spread <= 5, `the racket hand moved ${spread} ms across a six-degree sweep`)
  note(
    `  yaw ${readings.map((r) => r.cameraYaw).join('/')}: wrist ${wrists.join('/')} ms, ` +
      `span ${readings.map((r) => r.chain.span_ms).join('/')} ms`,
  )
})

check('dividing the span by the motion takes the tempo out of it', () => {
  /*
   * The repair `UNCALIBRATED.chain_span_ms` names, measured rather than asserted.
   *
   * The span is the interval from peak leg drive to peak racket-hand speed, and
   * it scales with how long the whole motion took: the same serve served slowly
   * has a longer chain, so a band in milliseconds would mark a deliberate server
   * as having no sequence. Dividing by the motion's own duration is supposed to
   * remove that, and this is the check that it does — same dials throughout, one
   * tempo dial swept, so anything that moves moved because of tempo.
   *
   * It says nothing about whether the ratio can be graded. That is a separate
   * failure with a separate entry, and footage is the only thing that settles
   * it: scale-free is what a quantity needs before a band could exist, not a
   * band.
   */
  const readings = [1.1, 1.35, 1.7].map((motionSeconds) => {
    const frames = buildServe({ ...DEPTH_AWARE, seed: SEEDS[0], motionSeconds }, FPS)
    const skel = detectServe(frames, FPS)
    const { chain } = diagnose(frames, skel, { tier: 5 })
    return { motionSeconds, span: chain.span_ms, ratio: chain.span_ratio }
  })

  const missing = readings.filter((r) => r.span === null || r.ratio === null)
  assert(missing.length === 0, `no span at ${missing.map((r) => r.motionSeconds).join(', ')} s`)

  const spans = readings.map((r) => r.span as number)
  const ratios = readings.map((r) => r.ratio as number)
  const relative = (xs: number[]) =>
    (Math.max(...xs) - Math.min(...xs)) / (xs.reduce((a, b) => a + b, 0) / xs.length)

  note(
    `  tempo ${readings.map((r) => r.motionSeconds).join('/')} s: ` +
      `span ${spans.join('/')} ms (${(relative(spans) * 100).toFixed(0)}% spread), ` +
      `ratio ${ratios.map((r) => r.toFixed(4)).join('/')} (${(relative(ratios) * 100).toFixed(0)}%)`,
  )

  // The claim is comparative and is stated that way. An absolute bound on the
  // ratio's spread would be a number nobody derived — the point is that the
  // division removes most of a dependence that is plainly there in the raw span,
  // and the raw span's own spread is the only honest scale to measure it on.
  assert(
    relative(ratios) < relative(spans) / 2,
    `dividing by the motion barely helped: span spread ${(relative(spans) * 100).toFixed(0)}%, ` +
      `ratio spread ${(relative(ratios) * 100).toFixed(0)}%`,
  )
})

/* ============================================ does the verdict hold still == */

check('one identical serve produces one verdict', () => {
  /*
   * A reading being soft is survivable: it is marked soft, and `pickFocus` sets
   * soft measurements aside. A *flaw* flickering is not — the player is told to
   * fix a different thing depending on which frames the tracker struggled with,
   * and nothing on the report says so.
   *
   * Before the noise floors, one identical serve produced six different sets of
   * named flaws across twenty-four realisations. The floors got that down to
   * two, both from signals whose floors had been clipped, and this check
   * allowed them by name — which is a fair way to document a known limit and a
   * poor place to leave it, because "documented" and "fixed" print the same
   * green tick.
   *
   * They are dealt with now: one had its floor raised to what the measurement
   * asks for and one is no longer named at all. So the allowance is gone and
   * this asserts the thing it always wanted to. Nothing flickers.
   */
  const varies = new Set<FlawId>()
  const always = new Set<FlawId>()
  for (const flaw of new Set(deep.reads.flatMap((r) => [...r.named]))) {
    const hits = deep.reads.filter((r) => r.named.has(flaw)).length
    ;(hits === deep.reads.length ? always : varies).add(flaw)
  }

  assert(
    varies.size === 0,
    `flaws named on some realisations of one identical serve and not others: ${[...varies].join(', ')}`,
  )
  note(`  stable: ${[...always].join(', ') || 'none'} · flickering: ${[...varies].join(', ') || 'none'}`)
})

check('a signal too coarse to tell one rung from the next does not rate a player', () => {
  /*
   * The other end of `NOISE_FLOOR`, and the one nothing was watching. `inferTier`
   * reads the same table as band slack, where a wider floor lets a signal reach a
   * HIGHER rung — and the rating picks the target band every other signal is then
   * graded against, so a generous floor hands the player a harder target and buys
   * back as fresh accusations what it saved on the one flaw. The floor raise this
   * round measured out as: a serve whose shoulders fire 30 ms early rated 9, the
   * same rung as a clean 70 ms lead, because 85 ms of slack is twice the whole
   * 42 ms ladder that signal is graded on.
   *
   * So `hip_lead_ms` no longer votes on a rating. The two assertions are the two
   * halves of that: it cannot promote, and it cannot pretend to rate on its own.
   */
  const armed = { contact_height_ratio: 1.28, drop_depth_ratio: 0.2, separation_deg: 22, hip_lead_ms: -30 }
  const clean = { ...armed, hip_lead_ms: 70 }
  assert(
    inferTier(armed) === inferTier(clean),
    `a 100 ms swing in the least repeatable signal moved the rating: ` +
      `${inferTier(armed)} against ${inferTier(clean)}`,
  )

  // 4 is `inferTier`'s stated answer when it has nothing it can read, not a rung
  // it inferred. Anything else here would be a rating derived from one number
  // whose own noise is wider than the ladder.
  assert(
    inferTier({ hip_lead_ms: -30 }) === 4 && inferTier({ hip_lead_ms: 70 }) === 4,
    `an unresolvable signal rated a player on its own: ${inferTier({ hip_lead_ms: -30 })}`,
  )

  // And the signals that *can* resolve a rung still do, or the fix is a deletion.
  assert(
    inferTier({ contact_height_ratio: 1.34, drop_depth_ratio: 0.25 }) >
      inferTier({ contact_height_ratio: 1.17, drop_depth_ratio: 0.09 }),
    'the two signals read from x and y stopped separating a strong serve from a weak one',
  )
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

const underResolved = floorVerdicts(deep.reads).filter((v) => v.underResolved)

if (underResolved.length) {
  console.log(
    `\n  \x1b[33m⚠ Signals this engine cannot resolve to its own serious miss:\x1b[0m` +
      underResolved
        .map(
          (v) =>
            `\n  \x1b[2m· ${v.id}: deviation ${v.sd.toFixed(1)} across noise realisations of one` +
            `\n    identical serve, against a serious miss of ${v.seriousMiss}. ${v.declared ?? 'UNDECLARED'}\x1b[0m`,
        )
        .join('') +
      `\n  \x1b[2mDeclared in tiers.ts, with the derivation. This is a standing statement about` +
      `\n  what the camera can see, not a to-do: no floor makes it false. It goes away when` +
      `\n  a better estimator does, or when real footage says the model was pessimistic.\x1b[0m`,
  )
}

{
  /*
   * The chain's own standing statement, printed for the same reason the one
   * above it is: a measurement nobody grades is a measurement that disappears
   * unless something says it exists on every run.
   *
   * These are not under-resolved — they are the steadiest timings in the engine
   * — so they cannot go in the block above without making its message false.
   * What they lack is anything to compare against, which is a different sentence
   * and gets its own.
   */
  const links = chainDeviations(deep.reads).filter((d) => d.id in UNCALIBRATED)
  if (links.length) {
    console.log(
      `\n  \x1b[33m⚠ Measured well, graded not at all:\x1b[0m` +
        links
          .map((d) => {
            // Not all of these are timings any more, and the unit has to follow
            // the quantity. The span ratio is dimensionless — printed to one
            // decimal with "ms" after it, it reported a deviation of 0.0 ms, a
            // quantity that never moves, said about the one entry here whose
            // whole reason for existing is that it is dimensionless. External
            // rotation is degrees, and "9.4 ms" about an angle is the same class
            // of wrong number in the same sentence.
            const unit = d.id.endsWith('_deg') ? '°' : ' ms'
            const dimensionless = d.id.endsWith('_ratio')
            const dev = dimensionless ? d.sd.toFixed(4) : `${d.sd.toFixed(1)}${unit}`
            return `\n  \x1b[2m· ${d.id}: deviation ${dev}. ${UNCALIBRATED[d.id]}\x1b[0m`
          })
          .join('') +
        `\n  \x1b[2mThese are the best-conditioned timings in the engine and none of them names` +
        `\n  a fault. Repeatability was never the missing piece: what is missing is any` +
        `\n  value a club player should have, which this rig cannot supply because every` +
        `\n  track in it hangs off one normalised phase schedule. Real footage with a` +
        `\n  coach's judgement attached is the only thing that changes this.\x1b[0m`,
    )
  }
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
