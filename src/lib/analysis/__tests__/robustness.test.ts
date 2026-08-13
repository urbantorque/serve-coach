/**
 * Does tracker noise change the advice?
 *
 * The engine tests dial in a fault and assert the app reports that fault, all on
 * clean landmarks. Real pose output is not clean: a tracked wrist wobbles about
 * 0.5–1.5% of frame height between consecutive frames even when the arm is
 * still, and limbs behind the body drop out entirely for a frame or two. A
 * measurement can be perfectly correct on paper and still be useless if that
 * jitter moves it across a target band.
 *
 * So these run an ensemble: the same serve under many independent noise
 * realisations, compared against the noise-free answer for the same dials. What
 * is asserted is not "the number is right" — the engine tests cover that — but
 * "the number does not move enough to change what the player is told".
 *
 * Tolerances here are deliberately near what the engine currently achieves.
 * They are a ratchet: if a change makes the pipeline noticeably noisier, this
 * goes red even though every accuracy test still passes.
 */
import { assessQuality, blockingFramingIssue, pickFocus, rescore } from '../analyze'
import { readWindow, samplingRateFor } from '../../pose/extract'
import { assessSpatial } from '../spatial'
import {
  SOFT_MEASUREMENT,
  metricConfidence,
  softnessReason,
  type ConfidenceContext,
} from '../confidence'
import { diagnose } from '../diagnose'
import { assessResilience } from '../triage'
import { cueIssues } from '../voice'
import { cacheSize, forgetAll, recall, remember } from '../../analysisCache'
import { normalise, normalisePracticeLog, type Session } from '../../storage/db'
import { MEANINGFUL_DELTA, buildProgress, deltasAgainst } from '../../progress'
import { findPracticeFocus, practiceHeadline } from '../../practice'
import { statusOf } from '../geometry'
import { DEFAULT_TOLERANCE, framingIssues, packFrames, unpackFrames, validateFixture, type Fixture } from '../groundTruth'
import { IMPLAUSIBLE_JUMP, LM, MIN_OPENING_SWEEP_DEG, maxTrackingJump, median, trunkCoil } from '../geometry'
import { measure } from '../metrics'
import {
  MIN_SERVE_GAP,
  SCAN_BUDGET,
  SCAN_FPS,
  findServes,
  peakCandidates,
  planRefinement,
  planScan,
  type ReachSample,
} from '../serves'
import { engineDelegate, enginePaths } from '../../pose/poseEngine'
import { detectServe } from '../phases'
import { smoothedRacket } from '../racket'
import {
  NotAServeError,
  UnreadableVideoError,
  hintsOf,
  isNotAServeError,
  type Frame,
  type Fundamental,
} from '../types'
import { CLEAN_SERVE, buildServe, type ServeDials } from '../syntheticServe'
import { RECORDED } from './fixtures'
import { assert, check, heading, near, note, report, within } from './harness'

const FPS = 50

/**
 * Noise levels as a fraction of frame height, per the rig's own calibration.
 * `TYPICAL` is a well-lit clip from a modern phone; `POOR` is dusk, a cluttered
 * background, or a player filmed small in frame.
 */
const TYPICAL_NOISE = 0.008
const POOR_NOISE = 0.015
const TYPICAL_DROPOUT = 0.04

/** Enough realisations for a median and a 90th percentile to mean something. */
const SEEDS = 24

interface Sample {
  keys: Record<string, number>
  metrics: Record<string, number>
  overall: number
  focus: string
  fundamentals: Fundamental[]
}

function analyse(dials: Partial<ServeDials>): Sample {
  const frames = buildServe({ ...CLEAN_SERVE, ...dials }, FPS)
  const skel = detectServe(frames, FPS)
  const sideView = skel.shoulderWidth / skel.bodyHeight < 0.1
  const fundamentals = measure(frames, skel, sideView)

  const keys: Record<string, number> = {}
  for (const [k, idx] of Object.entries(skel.keys)) keys[k] = frames[idx].t

  const metrics: Record<string, number> = {}
  for (const m of fundamentals.flatMap((f) => f.metrics)) metrics[m.id] = m.value

  const totalWeight = fundamentals.reduce((s, f) => s + f.score, 0)
  return {
    keys,
    metrics,
    overall: Math.round(totalWeight / fundamentals.length),
    focus: pickFocus(fundamentals).title,
    fundamentals,
  }
}

/** One noise-free reference, then `SEEDS` noisy realisations of the same serve. */
function ensemble(dials: Partial<ServeDials>, noise: number, dropout = 0) {
  const baseline = analyse({ ...dials, noise: 0, dropout: 0 })
  const runs: Sample[] = []
  for (let i = 0; i < SEEDS; i++) {
    // A different realisation per seed. Holding the seed and scaling `noise`
    // would move every landmark along its own straight line, which looks like
    // systematic bias and is not.
    runs.push(analyse({ ...dials, noise, dropout, seed: 1000 + i * 7919 }))
  }
  return { baseline, runs }
}

const p90 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]
}

/** |noisy − clean| for one metric across the ensemble. */
function drift(runs: Sample[], baseline: Sample, id: string): number[] {
  return runs
    .filter((r) => id in r.metrics)
    .map((r) => Math.abs(r.metrics[id] - baseline.metrics[id]))
}

function keyDrift(runs: Sample[], baseline: Sample, phase: string): number[] {
  return runs.map((r) => Math.abs(r.keys[phase] - baseline.keys[phase]))
}

/* ------------------------------------------------------- keyframes under noise */

heading('Keyframes under tracker noise')

check('every noisy realisation still produces a readable serve', () => {
  const { runs } = ensemble({}, TYPICAL_NOISE, TYPICAL_DROPOUT)
  assert(runs.length === SEEDS, `only ${runs.length} of ${SEEDS} realisations survived`)
  for (const r of runs) {
    assert(
      r.keys.ready <= r.keys.toss &&
        r.keys.toss <= r.keys.trophy &&
        r.keys.trophy <= r.keys.drop &&
        r.keys.drop <= r.keys.contact,
      `keyframes out of order: ${JSON.stringify(r.keys)}`,
    )
  }
})

check('contact holds to within a frame of the clean answer', () => {
  const { baseline, runs } = ensemble({}, TYPICAL_NOISE, TYPICAL_DROPOUT)
  const d = keyDrift(runs, baseline, 'contact')
  note(`contact drift: median ${median(d).toFixed(3)}s, p90 ${p90(d).toFixed(3)}s`)
  // One 50 fps frame is 20 ms. Contact is the anchor every other keyframe is
  // found from, so it gets the tightest bound in the suite.
  within(median(d), 0, 0.02, 'median contact drift')
  within(p90(d), 0, 0.04, 'p90 contact drift')
})

/**
 * Regression: the trophy used to be the knee-angle minimum and nothing else. On
 * a player who barely bends, that series is flat to within its own jitter, so
 * the minimum landed wherever the noise dipped — the trophy wandered over 0.4 s
 * of a 1.35 s motion. Every measurement taken at the trophy was then read at an
 * essentially random moment, which is worst for precisely the player this app
 * exists to help: the one whose legs do nothing.
 */
check('the trophy holds still even when the legs never load', () => {
  const rigid = { trophyKneeAngle: 172 }
  const { runs } = ensemble(rigid, TYPICAL_NOISE, TYPICAL_DROPOUT)
  const times = runs.map((r) => r.keys.trophy)
  const spread = Math.max(...times) - Math.min(...times)
  note(`trophy on rigid legs: spread ${spread.toFixed(3)}s across ${SEEDS} realisations`)
  within(spread, 0, 0.1, 'trophy spread on rigid legs')
})

check('the trophy and the drop stay inside their labelling tolerance', () => {
  const { baseline, runs } = ensemble({}, TYPICAL_NOISE, TYPICAL_DROPOUT)
  for (const phase of ['trophy', 'drop']) {
    const d = keyDrift(runs, baseline, phase)
    note(`${phase} drift: median ${median(d).toFixed(3)}s, p90 ${p90(d).toFixed(3)}s`)
    // Held to what a human labeller can resolve: past this the detected frame
    // is a different position in the motion than the one a coach would pick.
    within(median(d), 0, DEFAULT_TOLERANCE.keyframeSeconds, `median ${phase} drift`)
  }
})

/* --------------------------------------------------------- angles under noise */

heading('Measurements under tracker noise')

check('joint angles hold to a few degrees', () => {
  const { baseline, runs } = ensemble({}, TYPICAL_NOISE, TYPICAL_DROPOUT)
  for (const id of ['kneeBend', 'tossArmExtension', 'armExtension', 'elbowAtDrop']) {
    const d = drift(runs, baseline, id)
    note(`${id}: median ${median(d).toFixed(1)}°, p90 ${p90(d).toFixed(1)}°`)
    within(median(d), 0, DEFAULT_TOLERANCE.degrees, `median ${id} drift`)
  }
})

check('heights normalised by body height hold their band', () => {
  const { baseline, runs } = ensemble({}, TYPICAL_NOISE, TYPICAL_DROPOUT)
  for (const id of ['contactHeight', 'releaseHeight', 'dropDepth']) {
    const d = drift(runs, baseline, id)
    note(`${id}: median ${median(d).toFixed(3)}×, p90 ${p90(d).toFixed(3)}×`)
    within(median(d), 0, DEFAULT_TOLERANCE.ratio, `median ${id} drift`)
  }
})

/**
 * The two measurements built almost entirely from world-space z, which is the
 * least reliable thing MediaPipe outputs. Called out separately because they are
 * the ones most likely to be quietly wrong on real footage, and because a
 * regression here would otherwise hide inside an average over all the metrics.
 */
check('the z-dependent measurements are the noisiest, and are bounded', () => {
  const { baseline, runs } = ensemble({}, TYPICAL_NOISE, TYPICAL_DROPOUT)
  for (const id of ['hipShoulderSeparation', 'shoulderTilt']) {
    const d = drift(runs, baseline, id)
    note(`${id}: median ${median(d).toFixed(1)}°, p90 ${p90(d).toFixed(1)}°`)
    within(median(d), 0, 12, `median ${id} drift`)
  }
})

/**
 * Regression: this measurement is a signed quantity whose sign used to come from
 * subtracting two single, independently jittering landmarks. Side-on that
 * difference is a few percent of body height, so noise could flip it — turning a
 * contact 20 cm in front into one 20 cm behind, and the best measurement in the
 * serve into the worst. Everything else here degrades gracefully; this one
 * degraded into a confident mirror image.
 */
check('contact depth never comes out mirrored', () => {
  const { baseline, runs } = ensemble({}, POOR_NOISE, TYPICAL_DROPOUT * 2)
  const clean = baseline.metrics.contactAhead
  assert(clean !== undefined, 'the clean side-on serve did not produce a contact depth at all')
  assert(clean > 0, `the rig's model serve has contact behind the hips (${clean.toFixed(1)}%)`)

  const measured = runs.filter((r) => 'contactAhead' in r.metrics)
  const mirrored = measured.filter((r) => Math.sign(r.metrics.contactAhead) !== Math.sign(clean))
  note(`contact depth reported in ${measured.length}/${SEEDS} runs, ${mirrored.length} mirrored`)
  assert(mirrored.length === 0, `sign flipped in ${mirrored.length} of ${measured.length} runs`)
})

check('contact depth is dropped, not guessed, when the swing has no sideways travel', () => {
  // A camera looking straight down the line of the swing sees the hand coming
  // towards it, not across. There is no horizontal sweep to take a direction
  // from, so the honest answer is to say nothing rather than pick a side.
  const frames = buildServe({}, FPS).map((f) => ({
    ...f,
    // Collapse horizontal travel while leaving everything else intact.
    image: f.image.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.02 })),
  }))
  const skel = detectServe(frames, FPS)
  const produced = measure(frames, skel, true).flatMap((f) => f.metrics)
  assert(
    !produced.some((m) => m.id === 'contactAhead'),
    'reported a contact depth from a swing with no sideways travel to read',
  )
})

check('the body-height reference does not inflate with noise', () => {
  // Every height in the report is a ratio against this one number, so a bias
  // here bends all of them at once and in the same direction — the failure the
  // median-not-extremes choice in phases.ts exists to prevent. A drift test on
  // the ratios cannot see it, because they all move together.
  const heights: number[] = []
  for (const noise of [0, TYPICAL_NOISE, POOR_NOISE]) {
    const runs = Array.from({ length: SEEDS }, (_, i) =>
      detectServe(buildServe({ noise, seed: 2000 + i * 7919 }, FPS), FPS).bodyHeight,
    )
    heights.push(median(runs))
  }
  const [clean, typical, poor] = heights
  note(`body height: clean ${clean.toFixed(4)}, typical ${typical.toFixed(4)}, poor ${poor.toFixed(4)}`)
  within(Math.abs(typical - clean) / clean, 0, 0.03, 'body height bias at typical noise')
  within(Math.abs(poor - clean) / clean, 0, 0.05, 'body height bias at poor noise')
})

/* --------------------------------------------------------- advice under noise */

heading('Does the advice survive the noise?')

check('the headline score barely moves', () => {
  const { baseline, runs } = ensemble({}, TYPICAL_NOISE, TYPICAL_DROPOUT)
  const d = runs.map((r) => Math.abs(r.overall - baseline.overall))
  note(`overall score drift: median ${median(d).toFixed(1)}, p90 ${p90(d).toFixed(1)} points`)
  // Anything under 3 points the app already calls "no real change", so a score
  // that wanders further than that under pure noise would make the trend chart
  // report progress the player did not make.
  within(median(d), 0, 3, 'median score drift')
})

check('a dialled-in fault is still named as the thing to work on', () => {
  // A serve with one obvious fault: almost no knee bend. Noise must not promote
  // some other measurement above it, or the player is sent off to fix the wrong
  // thing — the single worst failure this app has.
  const { runs } = ensemble({ trophyKneeAngle: 172 }, TYPICAL_NOISE, TYPICAL_DROPOUT)
  const named = runs.filter((r) => /knee/i.test(r.focus)).length
  note(`knee bend named in ${named}/${SEEDS} noisy realisations`)
  assert(named >= SEEDS - 2, `focus flipped away from the knee bend in ${SEEDS - named} runs`)
})

check('a clean serve is not told to fix something at poor tracking quality', () => {
  // The inverse failure: inventing a fault out of noise. A serve dialled to sit
  // inside every band should keep scoring well even when the tracking is bad.
  const { runs } = ensemble({}, POOR_NOISE, TYPICAL_DROPOUT * 2)
  const scores = runs.map((r) => r.overall)
  note(`clean serve at poor tracking: median score ${median(scores).toFixed(0)}`)
  within(median(scores), 70, 100, 'median score of a clean serve under poor tracking')
})

/* --------------------------------------------------- staying on one person */

heading('Noticing when the tracking changes person')

/** Shift every landmark from `at` onwards, as though a different body took over. */
function switchSubject(frames: Frame[], at: number, byBodyHeights: number, bodyHeight: number) {
  const dx = byBodyHeights * bodyHeight
  return frames.map((f, i) =>
    i < at ? f : { ...f, image: f.image.map((l) => ({ ...l, x: l.x + dx })) },
  )
}

check('a real serve never moves the hips implausibly fast', () => {
  // The threshold has to sit above everything a serving body actually does —
  // including the leg drive, which is the fastest the hips ever travel — or the
  // check fires on every clip and gets ignored.
  for (const fps of [24, 30, 50, 120]) {
    const frames = buildServe({ noise: TYPICAL_NOISE }, fps)
    const skel = detectServe(frames, fps)
    const jump = maxTrackingJump(frames, skel.keys.ready, skel.keys.finish, skel.bodyHeight)
    note(`${fps} fps: worst hip jump ${jump.toFixed(4)} body heights`)
    within(jump, 0, IMPLAUSIBLE_JUMP, `hip jump at ${fps} fps`)
  }
})

check('a hand-off to somebody standing nearby is caught', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  // Half a body height sideways, mid-motion — a coach a metre or so away.
  const switched = switchSubject(frames, skel.keys.trophy, 0.5, skel.bodyHeight)
  const jump = maxTrackingJump(switched, skel.keys.ready, skel.keys.finish, skel.bodyHeight)
  note(`after a hand-off: ${jump.toFixed(3)} body heights`)
  assert(jump > IMPLAUSIBLE_JUMP, `a subject switch measured only ${jump.toFixed(3)}`)
})

check('the report says so, and stops claiming confidence it has not got', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const clean = assessQuality(frames, skel, FPS)
  const switched = assessQuality(
    switchSubject(frames, skel.keys.trophy, 0.5, skel.bodyHeight),
    skel,
    FPS,
  )
  note(`confidence ${clean.confidence.toFixed(2)} clean, ${switched.confidence.toFixed(2)} switched`)
  assert(
    switched.warnings.some((w) => /another body|different body|somebody else/i.test(w)),
    `no warning raised. Warnings: ${switched.warnings.join(' / ') || '(none)'}`,
  )
  assert(
    switched.confidence < clean.confidence * 0.6,
    `confidence barely moved: ${clean.confidence.toFixed(2)} → ${switched.confidence.toFixed(2)}`,
  )
  assert(
    clean.warnings.every((w) => !/another body|different body/i.test(w)),
    'warned about a clip that stayed on one person',
  )
})

check('a clip with no scale reference reports no jump rather than infinity', () => {
  // Dividing by a body height of zero is how a defensive check becomes the crash
  // it was added to prevent.
  const frames = buildServe({}, FPS)
  assert(maxTrackingJump(frames, 0, frames.length - 1, 0) === 0, 'divided by a zero body height')
  assert(maxTrackingJump([], 0, 0, 0.5) === 0, 'looked for jumps in an empty clip')
})

/* ------------------------------------------------------ locating serves cheaply */

heading('Finding the serves in a long clip')

/** A basket: `count` serves, `gap` seconds apart, with a realistic reach peak. */
function basketSamples(count: number, gap: number, step: number, duration: number) {
  const peaks = Array.from({ length: count }, (_, i) => 2 + i * gap)
  const samples: ReachSample[] = []
  for (let t = 0; t <= duration; t += step) {
    // Reach rises to a sharp peak at contact and sits near the hip otherwise.
    // The width is what makes coarse sampling under-read it.
    let height = -0.75
    for (const p of peaks) {
      const d = Math.abs(t - p)
      if (d < 0.45) height = Math.max(height, -0.75 + 0.62 * (1 - (d / 0.45) ** 2))
    }
    samples.push({ t, height })
  }
  return { samples, peaks }
}

check('a short clip is sampled exactly as it always was', () => {
  // Most clips are a few seconds. Nothing about them should change.
  const plan = planScan(4)
  assert(!plan.coarse, 'a four-second clip was treated as needing a budget')
  near(plan.step, 1 / SCAN_FPS, 1e-9, 'step on a short clip')
  assert(plan.times.length === 48, `sampled ${plan.times.length} times, expected 48`)
})

check('the scan cost is bounded however long the clip is', () => {
  // The failure this replaces: cost proportional to duration. A ten-minute clip
  // is inside the 400 MB the app accepts, and used to cost 7200 seeks — roughly
  // seven minutes of waiting before the first measurement.
  for (const minutes of [1, 3, 10, 30]) {
    const plan = planScan(minutes * 60)
    const refine = plan.coarse ? planRefinement(peakCandidates(basketSamples(6, 8, plan.step, minutes * 60).samples), minutes * 60) : []
    const total = plan.times.length + refine.length
    note(`${minutes} min: ${plan.times.length} coarse + ${refine.length} refine = ${total} samples`)
    assert(total <= SCAN_BUDGET + 200, `${minutes} min clip would read ${total} frames`)
  }
})

check('coarse sampling still finds every serve in a basket', () => {
  // The reason the refinement pass exists. Coarse samples under-read the peaks,
  // and `findServes` discards any peak more than REACH_TOLERANCE below the best —
  // so without refinement an under-read serve is dropped, not just imprecise.
  const duration = 180
  const plan = planScan(duration)
  assert(plan.coarse, 'a three-minute clip did not hit the budget')

  const coarse = basketSamples(6, 25, plan.step, duration)
  const refineTimes = planRefinement(peakCandidates(coarse.samples), duration)
  // Sample the same underlying motion at the refined times.
  const fine = refineTimes.map((t) => {
    let height = -0.75
    for (const p of coarse.peaks) {
      const d = Math.abs(t - p)
      if (d < 0.45) height = Math.max(height, -0.75 + 0.62 * (1 - (d / 0.45) ** 2))
    }
    return { t, height }
  })

  const withRefinement = findServes([...coarse.samples, ...fine].sort((a, b) => a.t - b.t))
  const withoutRefinement = findServes(coarse.samples)
  note(`${withoutRefinement.length}/6 found coarse, ${withRefinement.length}/6 with refinement`)

  assert(
    withRefinement.length === 6,
    `refinement found ${withRefinement.length} of 6 serves`,
  )
  // Each found serve must land close enough that the dense window (1.9s before,
  // 0.8s after) still contains the whole motion.
  for (const peak of coarse.peaks) {
    const nearest = withRefinement.reduce((best, t) =>
      Math.abs(t - peak) < Math.abs(best - peak) ? t : best,
    )
    assert(
      Math.abs(nearest - peak) < 0.5,
      `serve at ${peak}s was located at ${nearest.toFixed(2)}s`,
    )
  }
})

check('refinement looks at every serve, not just the best-read one', () => {
  // Taking the highest samples by value alone returns several readings of
  // whichever serve happened to be caught nearest its peak, and never examines
  // the rest.
  const duration = 180
  const step = planScan(duration).step
  const { samples, peaks } = basketSamples(5, 30, step, duration)
  const candidates = peakCandidates(samples)
  note(`candidates at ${candidates.map((c) => c.toFixed(1)).join(', ')}s for peaks at ${peaks.join(', ')}s`)
  for (const peak of peaks) {
    assert(
      candidates.some((c) => Math.abs(c - peak) < MIN_SERVE_GAP),
      `no candidate near the serve at ${peak}s`,
    )
  }
  // And nothing else. Every slot spent on a flat stretch is refinement budget
  // spent reading footage of somebody standing still.
  assert(
    candidates.length === peaks.length,
    `picked ${candidates.length} candidates for ${peaks.length} serves: ${candidates.map((c) => c.toFixed(1)).join(', ')}`,
  )
})

check('a clip with nobody serving produces no candidates to refine', () => {
  const flat: ReachSample[] = Array.from({ length: 200 }, (_, i) => ({ t: i * 0.4, height: -0.75 }))
  assert(peakCandidates(flat).length === 0, 'found serves in a clip of somebody standing still')
  assert(planRefinement([], 80).length === 0, 'scheduled refinement with no candidates')
})

check('refinement windows around adjacent serves are not paid for twice', () => {
  // Two serves 1.7s apart — just outside MIN_SERVE_GAP — have overlapping
  // windows. Sampling the shared frames once is the difference between the
  // budget holding and drifting.
  const times = planRefinement([10, 11.7], 60)
  const unique = new Set(times.map((t) => Math.round(t * 1000)))
  assert(unique.size === times.length, 'the same frame was scheduled twice')
  // The two windows span 9.1s–12.6s. Covered on one grid that is 43 samples;
  // laid out separately from each centre it would be 44 with none shared.
  const spanned = Math.floor(12.6 * SCAN_FPS) - Math.ceil(9.1 * SCAN_FPS) + 1
  note(`${times.length} samples across two overlapping windows, ${spanned} grid slots in the span`)
  assert(times.length === spanned, `expected ${spanned} grid samples, got ${times.length}`)
  // And every sample sits on the shared grid, which is what makes that possible.
  for (const t of times) {
    near(t * SCAN_FPS, Math.round(t * SCAN_FPS), 1e-9, `sample at ${t}s is off-grid`)
  }
})

check('refinement stays inside the clip', () => {
  // A serve right at the start or end of the clip. Seeking past either edge is
  // the kind of thing that hangs waiting for a `seeked` that never fires.
  for (const times of [planRefinement([0.1], 30), planRefinement([29.9], 30)]) {
    for (const t of times) {
      assert(t >= 0 && t <= 30, `refinement asked for ${t}s of a 30s clip`)
    }
  }
})

/* ----------------------------------------------- mixing serve types in trends */

heading('Not comparing a kick serve to a flat one')

/** A saved report, thin but shaped like the real thing. */
function savedServe(
  createdAt: number,
  overall: number,
  serveType: 'flat' | 'kick' | 'slice',
  dropScore = overall,
): Session {
  return {
    id: `s-${createdAt}`,
    createdAt,
    overall,
    overallStatus: statusOf(overall),
    serveType,
    fundamentals: [
      {
        id: 'swing',
        label: 'Swing',
        score: dropScore,
        metrics: [
          { id: 'dropDepth', label: 'Racket drop', score: dropScore, fix: 'let it fall' },
          { id: 'contactHeight', label: 'Contact height', score: 90 },
        ],
      },
    ],
  } as unknown as Session
}

/**
 * Regression: the trend chart and the practice advice averaged across every
 * saved report regardless of which serve it was. The target bands differ by
 * serve type, so switching from working on a flat serve to working on a kick
 * shifted the scores for reasons that had nothing to do with the player — and the
 * app reported the switch itself as progress or a slump.
 */
check('the trend follows one serve type, not all of them', () => {
  const sessions = [
    savedServe(5 * 86_400_000, 74, 'kick'),
    savedServe(4 * 86_400_000, 71, 'kick'),
    savedServe(3 * 86_400_000, 40, 'flat'),
    savedServe(2 * 86_400_000, 42, 'flat'),
  ]
  const progress = buildProgress(sessions)
  assert(progress !== undefined, 'no progress built at all')
  note(`${progress!.points.length} points, type ${progress!.serveType}, ${progress!.setAside} set aside`)
  // Newest is a kick, so that is what they are working on.
  assert(progress!.serveType === 'kick', `followed the wrong serve type: ${progress!.serveType}`)
  assert(progress!.points.length === 2, `plotted ${progress!.points.length} points, expected 2`)
  assert(progress!.setAside === 2, `reported ${progress!.setAside} set aside, expected 2`)
  // And crucially the delta is kick-vs-kick, not kick-vs-flat.
  assert(progress!.overallDelta === 3, `delta was ${progress!.overallDelta}, expected 3`)
})

check('trying one new serve does not wipe the history behind it', () => {
  // A player with two months of flat serves films a single kick. Following the
  // newest type blindly would replace their whole chart with one point, which
  // reads as the app having lost it.
  const sessions = [
    savedServe(9 * 86_400_000, 70, 'kick'),
    savedServe(4 * 86_400_000, 62, 'flat'),
    savedServe(3 * 86_400_000, 58, 'flat'),
    savedServe(2 * 86_400_000, 55, 'flat'),
  ]
  const progress = buildProgress(sessions)!
  note(`fell back to ${progress.serveType} with ${progress.points.length} points`)
  assert(progress.serveType === 'flat', `followed the one-off kick serve instead of the history`)
  assert(progress.points.length === 3, `plotted ${progress.points.length} points, expected 3`)
  assert(progress.setAside === 1, `reported ${progress.setAside} set aside, expected 1`)
})

check('once the new serve has history of its own, it takes over', () => {
  const sessions = [
    savedServe(9 * 86_400_000, 70, 'kick'),
    savedServe(8 * 86_400_000, 66, 'kick'),
    savedServe(4 * 86_400_000, 62, 'flat'),
    savedServe(3 * 86_400_000, 58, 'flat'),
    savedServe(2 * 86_400_000, 55, 'flat'),
  ]
  const progress = buildProgress(sessions)!
  assert(progress.serveType === 'kick', `stayed on flat once there were two kicks`)
  assert(progress.points.length === 2, `plotted ${progress.points.length} kick points`)
})

check('a specific serve type can be asked for', () => {
  const sessions = [
    savedServe(4 * 86_400_000, 74, 'kick'),
    savedServe(3 * 86_400_000, 40, 'flat'),
    savedServe(2 * 86_400_000, 46, 'flat'),
  ]
  const flat = buildProgress(sessions, 'flat')!
  assert(flat.serveType === 'flat', 'ignored the requested serve type')
  assert(flat.points.length === 2, `plotted ${flat.points.length} flat points, expected 2`)
  assert(flat.best === 46, `best flat score was ${flat.best}, expected 46`)
})

check('reports saved before serve types existed count as flat', () => {
  // `normalise` fills the field in, but a report reaching these functions from
  // anywhere else must not silently vanish from the chart.
  const legacy = [{ ...savedServe(1, 60, 'flat'), serveType: undefined }, savedServe(2, 66, 'flat')]
  const progress = buildProgress(legacy as unknown as Session[])!
  assert(progress.points.length === 2, `lost a legacy report: ${progress.points.length} points`)
  assert(progress.setAside === 0, 'treated a legacy report as a different serve')
})

check('practice advice does not average across serve types', () => {
  // Racket drop is terrible on the flat serves and fine on the kicks. Advice for
  // somebody now working on kicks must not be driven by the flat ones.
  const sessions = [
    savedServe(6 * 86_400_000, 80, 'kick', 88),
    savedServe(5 * 86_400_000, 80, 'kick', 86),
    savedServe(4 * 86_400_000, 45, 'flat', 20),
    savedServe(3 * 86_400_000, 45, 'flat', 22),
  ]
  const focus = findPracticeFocus(sessions)
  assert(focus !== undefined, 'no practice focus found')
  note(`focus ${focus!.metricId}, average ${focus!.average}, across ${focus!.sessionsConsidered}`)
  assert(
    focus!.sessionsConsidered === 2,
    `looked across ${focus!.sessionsConsidered} sessions, expected only the 2 kicks`,
  )
  assert(
    focus!.average >= 80,
    `averaged the flat serves in: racket drop came out at ${focus!.average}`,
  )
})

check('advice about a serve you are not currently filming says which serve it is', () => {
  // One kick serve, two flat ones. There is nothing to say about the kick yet, so
  // the advice is about the flat serves — which is useful, but only if the
  // sentence admits it. "Across your last 2 serves" would be quietly wrong the
  // moment after they filmed a kick.
  const sessions = [savedServe(3, 70, 'kick'), savedServe(2, 50, 'flat'), savedServe(1, 52, 'flat')]
  const focus = findPracticeFocus(sessions)
  assert(focus !== undefined, 'said nothing despite having two flat serves to talk about')
  assert(focus!.serveType === 'flat', `claimed to be about ${focus!.serveType}`)
  const headline = practiceHeadline(focus!)
  note(headline)
  assert(/flat serves/.test(headline), `the headline does not name the serve: "${headline}"`)
})

check('a single serve of any kind still says nothing', () => {
  assert(
    findPracticeFocus([savedServe(1, 70, 'kick')]) === undefined,
    'gave advice from a single serve',
  )
  assert(findPracticeFocus([]) === undefined, 'gave advice from no serves at all')
})

check('every serve type reads naturally in the headline', () => {
  for (const type of ['flat', 'kick', 'slice'] as const) {
    const focus = findPracticeFocus([
      savedServe(2, 50, type, 30),
      savedServe(1, 52, type, 32),
    ])
    assert(focus !== undefined, `no advice for a pair of ${type} serves`)
    const headline = practiceHeadline(focus!)
    assert(
      new RegExp(`${type} serves`).test(headline),
      `${type} does not read naturally: "${headline}"`,
    )
  }
})

/* ------------------------------------------- two rubrics on one trend line */

heading('Not comparing a score to one from a different rubric')

/** A saved report, stamped with the rubric its scores were computed under. */
const scoredUnder = (createdAt: number, overall: number, scoringVersion?: number): Session =>
  ({ ...savedServe(createdAt, overall, 'flat'), scoringVersion }) as Session

/**
 * Regression: `scoreAgainst` was recalibrated — the floor moved from 6 to 30 and
 * the decay outside a band softened — and a saved report keeps no frames, so the
 * old scores can never be recomputed. Both rubrics therefore sit on one trend
 * line forever. Refilming the identical serve after the update lifted the total
 * far past MEANINGFUL_DELTA, and the app congratulated the player on progress
 * that did not exist. The trend is the whole reason they came back to it.
 */
check('a change of rubric breaks the series rather than inventing a gain', () => {
  const sessions = [
    scoredUnder(4 * 86_400_000, 74, 2),
    scoredUnder(3 * 86_400_000, 72, 2),
    scoredUnder(2 * 86_400_000, 44, 1),
    scoredUnder(1 * 86_400_000, 42, 1),
  ]
  const progress = buildProgress(sessions)!
  note(`delta ${progress.overallDelta} across ${progress.points.length} points, break at ${progress.rubricBreakAt}`)
  // The honest comparison is the two serves scored the same way.
  assert(progress.overallDelta === 2, `delta was ${progress.overallDelta}, expected 2`)
  assert(
    (progress.overallDelta ?? 0) < MEANINGFUL_DELTA,
    'the recalibration was still reported as a real change',
  )
  // The old serves stay on the chart — they happened — with the break marked so
  // it can be drawn rather than smoothed over.
  assert(progress.points.length === 4, `dropped history: ${progress.points.length} points`)
  assert(
    progress.rubricBreakAt === 3 * 86_400_000,
    `break marked at ${progress.rubricBreakAt}, expected the first report of the new rubric`,
  )
  // And nothing derived reaches back across it.
  assert(progress.best === 74, `best of ${progress.best} was taken from the old rubric`)
  assert(progress.recentAverage === 73, `rolling average ${progress.recentAverage} mixed rubrics`)
})

check('the first report under a new rubric has nothing to compare against', () => {
  // Worse than a wrong delta would be a confident one: the single new-rubric
  // report has no peer, so the honest answer is silence, not a comparison with
  // the last serve of the old era.
  const progress = buildProgress([
    scoredUnder(3 * 86_400_000, 71, 2),
    scoredUnder(2 * 86_400_000, 40, 1),
    scoredUnder(1 * 86_400_000, 38, 1),
  ])!
  assert(progress.overallDelta === undefined, `invented a delta of ${progress.overallDelta}`)
  assert(progress.areaDeltas.length === 0, 'invented per-area deltas across a change of rubric')
  assert(progress.formDelta === undefined, 'reported a change in form across a change of rubric')
  assert(progress.points.length === 3, 'lost the history behind the change')
})

check('reports saved before the stamp existed are the old rubric, not the new one', () => {
  // They were scored under the original rubric by definition — there was only
  // one — so an unstamped report must never compare equal to a fresh one.
  const stored = normalise({
    id: 'a', createdAt: 1, overall: 70, overallStatus: 'good',
    fundamentals: [{ id: 'toss', metrics: [] }],
  })!
  assert(stored.scoringVersion === 1, `an unstamped report read as rubric ${stored.scoringVersion}`)
  assert(normalise({ ...stored, scoringVersion: 2 })!.scoringVersion === 2, 'lost an existing stamp')

  const progress = buildProgress([scoredUnder(2 * 86_400_000, 80, 2), scoredUnder(1 * 86_400_000, 50)])!
  assert(progress.overallDelta === undefined, 'compared a fresh report against an unstamped one')
})

/* ------------------------------------------------ what the player did ---- */

check('a drill record with nothing identifying it is dropped, not repaired', () => {
  // Everything else in storage is repaired towards something renderable, because
  // a missing label can be filled in and a broken report takes the app down.
  // Nothing here has a sensible default: a log with no measurement on it cannot
  // be counted towards any measurement, and an undated one cannot be placed in
  // any window. Guessing either would put a drill somebody never did into the
  // evidence for whether their drilling is working.
  const good = { id: 'x', metricId: 'dropDepth', drill: 'Let the racket fall', assignedAt: 1, doneAt: 2 }
  assert(normalisePracticeLog(good)?.metricId === 'dropDepth', 'rejected a complete record')

  for (const [what, bad] of [
    ['no id', { ...good, id: undefined }],
    ['no measurement', { ...good, metricId: undefined }],
    ['an empty measurement', { ...good, metricId: '' }],
    ['no date', { ...good, doneAt: undefined }],
    ['an unreadable date', { ...good, doneAt: Number.NaN }],
    ['not an object', 'a drill'],
  ] as const) {
    assert(normalisePracticeLog(bad) === undefined, `kept a record with ${what}`)
  }
})

check('a record from before it was stamped is dated by when it was done', () => {
  // `assignedAt` arrived with the field; a hand-edited backup or an older writer
  // may not have it. The moment it was done is the one every reader uses, so
  // falling back to it keeps the record countable rather than dropping it.
  const l = normalisePracticeLog({ id: 'x', metricId: 'kneeBend', doneAt: 5 })!
  assert(l.assignedAt === 5, `dated it ${l.assignedAt}`)
  assert(l.drill === '', 'invented a drill name')
})

check('an unbroken history still compares exactly as it always did', () => {
  // The guard must cost nothing to the player who has never lived through a
  // recalibration, which is nearly all of them.
  const progress = buildProgress([scoredUnder(2 * 86_400_000, 66, 2), scoredUnder(1 * 86_400_000, 60, 2)])!
  assert(progress.overallDelta === 6, `delta was ${progress.overallDelta}, expected 6`)
  assert(progress.rubricBreakAt === undefined, 'marked a break in a history that has none')
})

check('the report page can refuse a cross-rubric comparison too', () => {
  const fundamentals = [{ id: 'swing' as const, score: 80 }]
  const oldReport = scoredUnder(1, 50, 1)
  assert(deltasAgainst(fundamentals, oldReport, 1).swing === 30, 'refused a like-for-like comparison')
  assert(
    Object.keys(deltasAgainst(fundamentals, oldReport, 2)).length === 0,
    'compared a fresh report against one scored under the old rubric',
  )
})

/* ------------------------------------------------------------- engine paths */

heading('Where the pose engine looks for its assets')

/**
 * Regression: these were absolute paths from the domain root, so the app could
 * only ever be hosted at an origin it owned entirely. They now derive from
 * Vite's `BASE_URL` — which does not exist in Node, so reading it carelessly
 * killed this whole suite on an unrelated import before a single check ran.
 * Importing the module at all is most of what this asserts.
 */
check('the engine resolves its paths without a bundler having been involved', () => {
  assert(typeof engineDelegate === 'function', 'the pose engine module failed to load')
  // Under Node there is no base, so everything must fall back to the root rather
  // than producing `undefinedmodels/...` or throwing.
  const paths = enginePaths()
  note(`model ${paths.model}`)
  assert(paths.model.startsWith('/'), `model path is not absolute: ${paths.model}`)
  assert(!paths.model.includes('undefined'), `model path swallowed a missing base: ${paths.model}`)
  assert(paths.wasm.startsWith('/'), `wasm path is not absolute: ${paths.wasm}`)
  assert(!paths.wasm.includes('undefined'), `wasm path swallowed a missing base: ${paths.wasm}`)
  assert(
    paths.model.endsWith('/models/pose_landmarker_full.task'),
    `model filename changed: ${paths.model}`,
  )
  assert(paths.wasm.endsWith('/wasm'), `wasm directory changed: ${paths.wasm}`)
})

/* ------------------------------------------------------------ unreadable files */

heading('Explaining a file the browser cannot open')

check('every error the app raises carries advice, and it is reachable', () => {
  // The UI reads hints structurally rather than by class, so that a duplicated
  // module cannot silently turn every friendly explanation into a crash screen.
  const notServe = new NotAServeError('nope', ['do this'])
  const unreadable = new UnreadableVideoError('cannot decode', ['do that', 'or this'])
  assert(hintsOf(notServe)?.length === 1, 'a not-a-serve error lost its advice')
  assert(hintsOf(unreadable)?.length === 2, 'an unreadable-video error lost its advice')
  assert(hintsOf(new Error('bare')) === undefined, 'invented advice for a plain error')
  assert(hintsOf(undefined) === undefined, 'invented advice for nothing at all')
  assert(hintsOf({ hints: [1, 2] }) === undefined, 'accepted advice that is not text')
})

check('the two failure kinds stay distinguishable', () => {
  // They need completely different advice: one is about how the serve was
  // filmed, the other about what the file is. Telling somebody whose phone saved
  // an HEVC clip to keep their feet in frame sends them off to refilm something
  // that will fail in exactly the same way.
  const unreadable = new UnreadableVideoError('cannot decode', ['x'])
  assert(!isNotAServeError(unreadable), 'a codec failure was read as a filming problem')
  assert(isNotAServeError(new NotAServeError('nope', ['x'])), 'a filming problem stopped matching')
})

/* ---------------------------------------------------------------- backups */

heading('Exporting and importing a history')

/**
 * The import path without a database behind it.
 *
 * `importBackup` is mostly a merge policy wrapped around IndexedDB, and the
 * policy is the part that can lose somebody's training history — so it is
 * exercised directly here rather than left to a browser the tests cannot run in.
 */
function mergeBackup(
  incoming: { id: string; createdAt: number; overall: number }[],
  existing: { id: string; createdAt: number; overall: number }[],
) {
  const here = new Map(existing.map((s) => [s.id, s]))
  const result = { added: 0, updated: 0, skipped: 0 }
  const final = new Map(here)
  for (const s of incoming) {
    const mine = here.get(s.id)
    if (mine && mine.createdAt >= s.createdAt) {
      result.skipped++
      continue
    }
    final.set(s.id, s)
    if (mine) result.updated++
    else result.added++
  }
  return { result, final: [...final.values()] }
}

check('a backup file is recognised, and anything else is refused', () => {
  const good = JSON.stringify({ format: 'serve-coach-backup', version: 1, sessions: [] })
  const parsed = JSON.parse(good)
  assert(parsed.format === 'serve-coach-backup', 'the format marker changed without the reader')
  for (const bad of ['{}', '[]', 'not json at all', JSON.stringify({ format: 'something-else' })]) {
    let ok = true
    try {
      const p = JSON.parse(bad) as { format?: string; sessions?: unknown }
      ok = p?.format === 'serve-coach-backup' && Array.isArray(p.sessions)
    } catch {
      ok = false
    }
    assert(!ok, `accepted a file that is not a backup: ${bad}`)
  }
})

check('importing an old backup does not roll back newer training', () => {
  // The failure that would actually hurt: a player restores a three-month-old
  // file onto a phone they have kept using, and loses the months in between.
  const onDevice = [{ id: 'a', createdAt: 500, overall: 78 }]
  const fromFile = [{ id: 'a', createdAt: 100, overall: 40 }]
  const { result, final } = mergeBackup(fromFile, onDevice)
  assert(result.skipped === 1 && result.updated === 0, 'an older report overwrote a newer one')
  assert(final[0].overall === 78, 'the newer score was lost')
})

check('importing brings back what is missing and leaves the rest alone', () => {
  const onDevice = [{ id: 'a', createdAt: 500, overall: 78 }]
  const fromFile = [
    { id: 'a', createdAt: 500, overall: 78 },
    { id: 'b', createdAt: 200, overall: 61 },
  ]
  const { result, final } = mergeBackup(fromFile, onDevice)
  note(`${result.added} added, ${result.updated} updated, ${result.skipped} already current`)
  assert(result.added === 1 && result.skipped === 1, `unexpected merge: ${JSON.stringify(result)}`)
  assert(final.length === 2, 'the restored report did not land')
})

check('a corrupt report inside a backup is dropped, not the whole file', () => {
  // One unreadable entry must not cost the player the other nineteen.
  const raw = [
    { id: 'ok', createdAt: 1, overall: 70, overallStatus: 'good', fundamentals: [{ id: 'toss', metrics: [] }] },
    null,
    { id: 'no-scores', createdAt: 2 },
    'nonsense',
  ]
  const survived = raw.map(normalise).filter(Boolean)
  note(`${survived.length} of ${raw.length} entries survived`)
  assert(survived.length === 1, `expected one usable report, got ${survived.length}`)
  assert(survived[0]!.id === 'ok', 'kept the wrong entry')
})

/* ------------------------------------------------------------- re-scoring */

heading('Changing the serve type without re-reading the video')

/**
 * A full analysis-shaped object built from the rig, for the re-score path.
 *
 * The confidence context has to be assembled exactly as `rescore` assembles it,
 * `depthUnreliable` included. That field is recovered rather than carried on the
 * report, so a helper that omits it is not a simpler version of the real thing —
 * it is a *different* one, and the test built on it then compares two pipelines
 * that were never given the same inputs. It fails on whichever measurement the
 * depth verdict happens to hedge, which is a true statement about the fixture
 * and says nothing at all about the re-scoring this check exists to prove.
 */
function analysisFrom(serveType: 'flat' | 'kick' | 'slice') {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const quality = assessQuality(frames, skel, FPS)
  const depthUnreliable = assessSpatial(frames, skel.keys.ready, skel.bodyHeight).depth_unreliable
  const fundamentals = measure(frames, skel, quality.view === 'side', {
    serveType,
    confidence: {
      frames,
      skel,
      swingSamples: quality.swingSamples,
      view: quality.view,
      depthUnreliable,
    },
  })
  return {
    id: 'x', createdAt: 0, video: { name: 'x', durationMs: 0, width: 1, height: 1 },
    handedness: skel.racket, quality, phases: [], fundamentals,
    overall: 0, overallStatus: 'good' as const,
    focus: pickFocus(fundamentals),
    frames, window: { start: 0, end: 1 }, serves: { count: 1, index: 0 },
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    serveType,
  }
}

check('re-scoring gives exactly what a full re-run would have', () => {
  // The whole justification for skipping the pipeline is that it produces the
  // same answer. If it does not, the app quietly reports two different things
  // depending on which way the player arrived at the same screen.
  const fromScratch = analysisFrom('kick')
  const rescored = rescore(analysisFrom('flat'), 'kick')
  assert(rescored !== undefined, 're-scoring refused an analysis that still had its frames')

  for (const expected of fromScratch.fundamentals.flatMap((f) => f.metrics)) {
    const actual = rescored!.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === expected.id)
    assert(actual !== undefined, `${expected.id} vanished when re-scored`)
    near(actual!.score, expected.score, 0, `${expected.id} score after re-scoring`)
    assert(
      actual!.ideal[0] === expected.ideal[0] && actual!.ideal[1] === expected.ideal[1],
      `${expected.id} band differs after re-scoring`,
    )
  }
  assert(rescored!.serveType === 'kick', 'the re-scored report still claims to be a flat serve')
  assert(
    rescored!.focus.title === fromScratch.focus.title,
    `focus differs: "${rescored!.focus.title}" vs "${fromScratch.focus.title}"`,
  )
})

check('re-scoring leaves the measurements themselves untouched', () => {
  // Only the targets move. A value that changed would mean this path is
  // measuring something, which it must not be.
  const before = analysisFrom('flat')
  const after = rescore(before, 'slice')!
  for (const b of before.fundamentals.flatMap((f) => f.metrics)) {
    const a = after.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === b.id)!
    near(a.value, b.value, 1e-9, `${b.id} value changed during a re-score`)
  }
  assert(after.frames === before.frames, 'the frames were rebuilt rather than reused')
})

check('the in-session cache keeps what is being used and drops what is not', () => {
  forgetAll()
  const make = (id: string) => ({ ...analysisFrom('flat'), id })
  for (const id of ['a', 'b', 'c', 'd']) {
    remember({ sessionKey: id, handedness: 'right' }, make(id))
  }
  assert(recall({ sessionKey: 'a', handedness: 'right' })?.id === 'a', 'lost an entry inside the cap')

  // 'a' has just been used, so adding a fifth must evict 'b' — the least
  // recently touched — rather than the oldest by insertion. Flicking between two
  // serves in a basket otherwise evicts the very one being flicked back to.
  remember({ sessionKey: 'e', handedness: 'right' }, make('e'))
  note(`cache holds ${cacheSize()} entries after five inserts`)
  assert(cacheSize() === 4, `cache grew to ${cacheSize()}`)
  assert(recall({ sessionKey: 'a', handedness: 'right' }) !== undefined, 'evicted the entry in use')
  assert(recall({ sessionKey: 'b', handedness: 'right' }) === undefined, 'kept a stale entry')

  // Hands are separate analyses of the same clip and must not collide.
  remember({ sessionKey: 'a', handedness: 'left' }, make('a-left'))
  assert(
    recall({ sessionKey: 'a', handedness: 'right' })?.id === 'a',
    'the two hands share a cache slot',
  )
  forgetAll()
  assert(cacheSize() === 0, 'a new clip did not clear the cache')
})

check('a report with no frames cannot be re-scored, and says so', () => {
  // A saved report kept its numbers but not the landmarks behind them, so there
  // is nothing to re-measure. Returning undefined is what makes the caller fall
  // back to a real re-run instead of showing stale scores under new targets.
  const stored = { ...analysisFrom('flat'), frames: [] }
  assert(rescore(stored, 'kick') === undefined, 're-scored a report with no landmarks')
})

/* ------------------------------------------------------------- serve types */

heading('Judging a serve as the serve it is')

/** A serve contacted more over the head than in front — a kick serve's shape. */
const KICK_DIALS: Partial<ServeDials> = { shoulderTilt: 30, contactReach: 1.3 }

function measureAs(dials: Partial<ServeDials>, serveType: 'flat' | 'kick' | 'slice') {
  const frames = buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const fundamentals = measure(frames, skel, skel.shoulderWidth / skel.bodyHeight < 0.1, {
    serveType,
  })
  return {
    fundamentals,
    metric: (id: string) => fundamentals.flatMap((f) => f.metrics).find((m) => m.id === id)!,
  }
}

check('a kick serve is judged against kick bands, not flat ones', () => {
  const flat = measureAs(KICK_DIALS, 'flat').metric('contactAhead')
  const kick = measureAs(KICK_DIALS, 'kick').metric('contactAhead')
  assert(
    flat.ideal[0] !== kick.ideal[0] || flat.ideal[1] !== kick.ideal[1],
    'the contact-depth band did not move for a kick serve',
  )
  note(`contact depth band: flat ${flat.ideal.join('–')}, kick ${kick.ideal.join('–')}`)
  // Same measured value, different target: a kick serve wants contact closer to
  // over the head, so the band has to sit lower.
  assert(kick.ideal[0] < flat.ideal[0], 'the kick band is not shifted back towards the head')
})

check('the shoulder tilt a kick serve needs is not marked down', () => {
  // 30° of cartwheel is a good kick serve and a slightly steep flat one.
  const flat = measureAs({ shoulderTilt: 36 }, 'flat').metric('shoulderTilt')
  const kick = measureAs({ shoulderTilt: 36 }, 'kick').metric('shoulderTilt')
  note(`36° of tilt scores ${flat.score} as a flat serve, ${kick.score} as a kick`)
  assert(kick.score > flat.score, 'a kick serve got no credit for the tilt it requires')
})

check('a slice wants contact further in front than a kick does', () => {
  const kick = measureAs({}, 'kick').metric('contactAhead')
  const slice = measureAs({}, 'slice').metric('contactAhead')
  assert(slice.ideal[0] > kick.ideal[0], 'slice and kick share a contact-depth target')
})

check('the flat bands are exactly what they always were', () => {
  // Serve types must not quietly re-score the serve everybody films by default.
  const withType = measureAs({}, 'flat')
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const plain = measure(frames, skel, skel.shoulderWidth / skel.bodyHeight < 0.1)
  for (const before of plain.flatMap((f) => f.metrics)) {
    const after = withType.metric(before.id)
    assert(
      after.ideal[0] === before.ideal[0] && after.ideal[1] === before.ideal[1],
      `${before.id} band moved on a flat serve`,
    )
    assert(after.score === before.score, `${before.id} score moved on a flat serve`)
  }
})

check('every serve type still produces copy for every measurement it changes', () => {
  for (const type of ['flat', 'kick', 'slice'] as const) {
    const { fundamentals } = measureAs({}, type)
    for (const m of fundamentals.flatMap((f) => f.metrics)) {
      assert(Boolean(m.insight), `${type}: ${m.id} has no insight`)
      assert(m.ideal[0] < m.ideal[1], `${type}: ${m.id} has an empty band`)
      assert(
        m.ideal[0] >= m.range[0] && m.ideal[1] <= m.range[1],
        `${type}: ${m.id} band ${m.ideal.join('–')} falls outside its axis ${m.range.join('–')}`,
      )
    }
  }
})

/* -------------------------------------------------------------- handedness */

heading('Which hand holds the racket')

check('a stated hand is used, and the detector still reports what it saw', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS, 'right')
  assert(skel.racket === 'right', 'the stated hand was not used')
  assert(skel.detectedRacket === 'right', 'the detector no longer reports what it saw')
  within(skel.detectionConfidence, 0.5, 1, 'detection confidence on a clear right-handed serve')
})

/**
 * Regression: telling the app the wrong hand used to produce "That does not look
 * like a serve." It plainly was a serve — the app was watching the tossing arm,
 * which never sweeps from hip to overhead. A player whose front camera mirrored
 * the clip, or who tapped the wrong hand once, was told their serve was not a
 * serve and given filming advice that could not fix it.
 */
check('the wrong hand is diagnosed as the wrong hand, not as a bad clip', () => {
  // This used to assert a refusal naming the hand. It now asserts the reading
  // is produced instead, which serves the same intent better.
  //
  // The refusal was reached through the swing test, and that test cannot
  // actually tell the arms apart: on this rig the tossing arm travels 0.86 body
  // heights from its rest to its peak against the racket arm's 1.09, so both
  // clear the bar for "went from the hip to overhead". What separates them is
  // *when* each peaks — the tossing arm early, the racket arm at contact —
  // which is what `detectHandedness` reads and what the detector preserves in
  // `detectedRacket` even when it has been told otherwise.
  //
  // So a serve watched from the wrong side is not a bad clip and is no longer
  // treated as one. The disagreement is carried out of the detector, the report
  // warns in words, and the hand badge re-reads it in one tap.
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS, 'left')
  assert(skel.racket === 'left', 'the stated hand was not honoured')
  assert(
    skel.detectedRacket === 'right',
    `the detector lost the hand it actually saw: ${skel.detectedRacket}`,
  )
  assert(
    skel.detectionConfidence > 0.6,
    `too unsure of the real hand to contradict the player: ${skel.detectionConfidence.toFixed(2)}`,
  )
  const q = assessQuality(frames, skel, FPS)
  assert(
    q.warnings.some((w) => /right-handed/i.test(w)),
    `the contradiction was never said out loud. Warnings: ${q.warnings.join(' / ') || '(none)'}`,
  )
  note(q.warnings.find((w) => /right-handed/i.test(w)) ?? '')
})

check('a confident disagreement with the stated hand is called out on the report', () => {
  // The case where the forced hand still yields a readable motion: the warning
  // is the only thing standing between the player and a confidently wrong report.
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS, 'right')
  const mismatched = { ...skel, detectedRacket: 'left' as const, detectionConfidence: 0.9 }
  const q = assessQuality(frames, mismatched, FPS)
  const flagged = q.warnings.find((w) => w.includes('looks left-handed'))
  assert(flagged !== undefined, `no mismatch warning. Warnings: ${q.warnings.join(' / ') || '(none)'}`)
})

check('agreeing with the stated hand says nothing', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS, 'right')
  const q = assessQuality(frames, skel, FPS)
  assert(
    !q.warnings.some((w) => w.includes('looks')),
    `warned about a hand it agreed with: ${q.warnings.join(' / ')}`,
  )
})

/**
 * Regression: shoulder tilt takes its sign from the racket arm, and handedness
 * was in no measurement's dependency list. So a textbook trophy read as the
 * wrong hand came back as its own mirror image — the tilt inverted, the reverse
 * cartwheel stated as fact, the fault promoted to the headline fix — all at
 * confidence 1.00 with no hedge anywhere. The player is then told to correct the
 * opposite of what they actually did, which is worse than saying nothing at all.
 *
 * Hip–shoulder separation was in this list too, and is deliberately no longer:
 * `trunkCoil` derives its direction from the shoulders uncoiling rather than
 * from the racket side, so the hand cannot mirror it — the check below pins
 * that, because a dependency nothing can act on still demoted a correct reading
 * and, worse, put a hand explanation in front of the camera one.
 */
check('a hand the app is unsure of stops the sign it can mirror arriving crisp', () => {
  const base = confidenceCtx()
  // Below the soft line, above the 0.35 at which the report warns outright: the
  // band where the old code said nothing and scored the mirror image anyway.
  const unsure = {
    ...base,
    skel: { ...base.skel, handednessConfidence: 0.4, detectionConfidence: 0.4 },
  }
  note(`shoulderTilt: ${metricConfidence('shoulderTilt', base).toFixed(2)} → ${metricConfidence('shoulderTilt', unsure).toFixed(2)}`)
  within(metricConfidence('shoulderTilt', base), SOFT_MEASUREMENT, 1, 'shoulder tilt when the hand is clear')
  within(metricConfidence('shoulderTilt', unsure), 0, SOFT_MEASUREMENT, 'shoulder tilt when the hand is not')

  // And only that one. Every other measurement is either unsigned or signed
  // against something the hand has no say in, so an uncertain hand must leave
  // them exactly where they were.
  for (const id of [
    'hipShoulderSeparation',
    'kneeBend',
    'contactHeight',
    'contactAhead',
    'dropDepth',
    'armExtension',
  ]) {
    near(metricConfidence(id, unsure), metricConfidence(id, base), 1e-9, `${id} under an unsure hand`)
  }
})

/**
 * The evidence for that, rather than the assertion of it: force the hand the
 * other way through the whole pipeline and watch which readings move. Tilt
 * negates; coil does not shift by a bit. A dependency has to be able to change
 * the number it is charged against, or all it does is hide a good reading behind
 * the wrong explanation.
 */
check('forcing the wrong hand mirrors the tilt and leaves the coil untouched', () => {
  const frames = buildServe({ cameraYaw: 45 }, FPS)
  const skel = detectServe(frames, FPS)
  // Swapped on the skeleton rather than through `detectServe`, which refuses a
  // stated hand this far from what it sees — and refusing is the right
  // behaviour, so the mirror has to be built by hand to get past it.
  const asRight = measure(frames, skel, false)
  const asLeft = measure(frames, { ...skel, racket: skel.toss, toss: skel.racket }, false)
  const of = (f: typeof asRight, id: string) =>
    f.flatMap((x) => x.metrics).find((m) => m.id === id)!.value

  note(`tilt ${of(asRight, 'shoulderTilt').toFixed(1)}° → ${of(asLeft, 'shoulderTilt').toFixed(1)}°, coil ${of(asRight, 'hipShoulderSeparation').toFixed(1)}° → ${of(asLeft, 'hipShoulderSeparation').toFixed(1)}°`)
  near(
    of(asLeft, 'shoulderTilt'),
    -of(asRight, 'shoulderTilt'),
    1e-6,
    'shoulder tilt read against the other arm',
  )
  assert(
    of(asLeft, 'hipShoulderSeparation') === of(asRight, 'hipShoulderSeparation'),
    `the hand moved a coil it cannot mirror: ${of(asRight, 'hipShoulderSeparation')} → ${of(asLeft, 'hipShoulderSeparation')}`,
  )
})

check('a confident detection disagreeing with a stated hand is treated as evidence', () => {
  // The player stated a hand, so `handednessConfidence` is 1 by construction and
  // says nothing. The independent detection kept alongside it is the only
  // cross-check there is, and a confident disagreement is the strongest signal
  // available that these two readings are mirrored.
  const base = confidenceCtx()
  const contradicted = {
    ...base,
    skel: { ...base.skel, racket: 'right' as const, detectedRacket: 'left' as const, detectionConfidence: 0.9 },
  }
  assert(
    contradicted.skel.handednessConfidence === 1,
    'the rig no longer stands in for a player who told the app which hand they use',
  )
  note(`shoulderTilt against a contradicted hand: ${metricConfidence('shoulderTilt', contradicted).toFixed(2)}`)
  within(metricConfidence('shoulderTilt', contradicted), 0, SOFT_MEASUREMENT, 'shoulder tilt on a contradicted hand')
})

check('a hedged sign is explained as the hand, in words that pass the voice lint', () => {
  const base = confidenceCtx()
  const unsure = { ...base, skel: { ...base.skel, handednessConfidence: 0.3, detectionConfidence: 0.3 } }
  const contradicted = {
    ...base,
    skel: { ...base.skel, detectedRacket: 'left' as const, detectionConfidence: 0.9 },
  }
  for (const ctx of [unsure, contradicted]) {
    const why = softnessReason('shoulderTilt', ctx)!
    note(why)
    assert(/hand/i.test(why), `never names the hand: "${why}"`)
    // The remedy is a tap on the badge, not another trip to the court — so the
    // fallback about a blurred body is exactly the wrong thing to say here.
    assert(!/blurred here|film/i.test(why), `sent the player off to refilm: "${why}"`)
    assert(cueIssues(why).length === 0, `off-voice: ${cueIssues(why).join('; ')} — "${why}"`)
  }
  // The two cases are not the same statement: one is the app admitting it cannot
  // tell, the other is the app contradicting something the player typed in.
  assert(
    softnessReason('shoulderTilt', unsure) !== softnessReason('shoulderTilt', contradicted),
    'the same sentence is used whether or not the player stated a hand',
  )
})

check('a hand the app is sure of leaves the two readings alone', () => {
  // The inverse failure: hedging every trunk rotation in the app on the strength
  // of a dependency that is not actually in doubt.
  const ctx = confidenceCtx()
  for (const id of ['hipShoulderSeparation', 'shoulderTilt']) {
    assert(
      softnessReason(id, ctx) !== undefined && !/hand/i.test(softnessReason(id, ctx)!),
      `blamed a hand the app read cleanly: "${softnessReason(id, ctx)}"`,
    )
  }
})

/* ------------------------------------------------------ per-metric confidence */

heading('Knowing which measurements to trust')

/** The pipeline's own confidence context, for a set of dials. */
function measured(dials: Partial<ServeDials>, mutate?: (f: Frame[]) => Frame[]) {
  const frames = mutate ? mutate(buildServe(dials, FPS)) : buildServe(dials, FPS)
  const skel = detectServe(frames, FPS)
  const quality = assessQuality(frames, skel, FPS)
  const fundamentals = measure(frames, skel, quality.view === 'side', {
    confidence: { frames, skel, swingSamples: quality.swingSamples, view: quality.view },
  })
  return {
    skel,
    quality,
    fundamentals,
    metric: (id: string) => fundamentals.flatMap((f) => f.metrics).find((m) => m.id === id),
  }
}

/** Hide the feet, so standing height falls back to the torso estimate. */
const cropFeet = (frames: Frame[]) =>
  frames.map((f) => ({
    ...f,
    image: f.image.map((l, i) =>
      i === LM.leftAnkle || i === LM.rightAnkle || i === LM.leftHeel || i === LM.rightHeel
        ? // Pushed below the frame as well as marked unseen: a cropped foot is
          // not a foot the tracker can still place.
          { ...l, y: 1.4, visibility: 0.05 }
        : l,
    ),
  }))

check('a clean, fully visible serve trusts everything it measured', () => {
  const { fundamentals } = measured({})
  const soft = fundamentals.flatMap((f) => f.metrics).filter((m) => m.confidence < SOFT_MEASUREMENT)
  assert(soft.length === 0, `hedged on a clean serve: ${soft.map((m) => m.id).join(', ')}`)
})

check('cropped feet soften the heights and leave the angles alone', () => {
  const { skel, metric } = measured({}, cropFeet)
  assert(skel.derivation.scaleFromTorso, 'the torso fallback did not fire on cropped feet')

  const height = metric('contactHeight')!
  const angle = metric('armExtension')!
  note(`contact height ${height.confidence.toFixed(2)}, arm extension ${angle.confidence.toFixed(2)}`)
  // Every height is a ratio against a number now estimated from a torso; joint
  // angles are read from world landmarks and do not touch it at all.
  within(height.confidence, 0, SOFT_MEASUREMENT, 'contact height confidence with cropped feet')
  within(angle.confidence, 0.8, 1, 'arm extension confidence with cropped feet')
  assert(Boolean(height.softness), 'no explanation offered for the soft height')
  assert(
    height.softness!.toLowerCase().includes('feet'),
    `the explanation does not mention the feet: "${height.softness}"`,
  )
})

check('rigid legs soften only what is read at the trophy', () => {
  const { skel, metric } = measured({ trophyKneeAngle: 174 })
  assert(skel.derivation.trophyFromArms, 'the arm fallback did not fire on rigid legs')
  const atTrophy = metric('loadRatio')!
  const elsewhere = metric('totalTime')!
  note(`load ratio ${atTrophy.confidence.toFixed(2)}, motion length ${elsewhere.confidence.toFixed(2)}`)
  assert(
    atTrophy.confidence < elsewhere.confidence,
    'a trophy measurement is no less certain than one that ignores the trophy',
  )
})

check('few frames through the swing soften only the swing timing', () => {
  // 12 fps: barely two samples between the racket drop and contact.
  const frames = buildServe({}, 12)
  const skel = detectServe(frames, 12)
  const quality = assessQuality(frames, skel, 12)
  const fundamentals = measure(frames, skel, quality.view === 'side', {
    confidence: { frames, skel, swingSamples: quality.swingSamples, view: quality.view },
  })
  const all = fundamentals.flatMap((f) => f.metrics)
  const timing = all.find((m) => m.id === 'dropToContact')!
  const depth = all.find((m) => m.id === 'dropDepth')!
  note(`${quality.swingSamples} swing samples · drop-to-contact ${timing.confidence.toFixed(2)}, drop depth ${depth.confidence.toFixed(2)}`)
  assert(timing.confidence < depth.confidence, 'sparse sampling did not soften the timing')
})

check('the headline advice is never built on a measurement it distrusts', () => {
  // Cropped feet make contact height both soft *and* the worst-scoring number,
  // because the torso fallback shrinks every height ratio. Telling the player to
  // reach higher on the strength of that is the app being confidently wrong
  // about the one thing it cannot currently see.
  const { fundamentals } = measured({ contactReach: 1.1 }, cropFeet)
  const chosen = fundamentals
    .flatMap((f) => f.metrics)
    .find((m) => m.label === pickFocus(fundamentals).title)
  if (chosen) {
    note(`focus: ${chosen.label} (confidence ${chosen.confidence.toFixed(2)})`)
    within(chosen.confidence, SOFT_MEASUREMENT, 1, 'confidence of the measurement chosen as the focus')
  }
})

check('an area is not condemned by a measurement the app cannot see', () => {
  // Same serve, once framed properly and once with the feet cut off. The heights
  // read low in the cropped version purely because the scale is wrong — that
  // must not turn into a worse verdict on the player's contact.
  const clean = measured({}).fundamentals.find((f) => f.id === 'contact')!
  const cropped = measured({}, cropFeet).fundamentals.find((f) => f.id === 'contact')!
  note(`contact area: ${clean.score} well framed, ${cropped.score} with feet cropped`)
  within(clean.score - cropped.score, -100, 18, 'how far a framing problem may move an area score')
})

/* ------------------------------------------- saying which thing went wrong */

heading('Naming the right culprit for a soft measurement')

/** The context the pipeline hands to `confidence.ts`, with one thing dialled. */
function confidenceCtx(over: Partial<ConfidenceContext> = {}): ConfidenceContext {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const quality = assessQuality(frames, skel, FPS)
  return { frames, skel, swingSamples: quality.swingSamples, view: quality.view, ...over }
}

/**
 * Regression: the two ball measurements carry no landmarks of their own and list
 * only `scale` as a dependency, so every body-shaped guard in `softnessReason`
 * stepped straight over them and the fallback told the player the app could not
 * see their *body*. That is a false statement with a wrong remedy welded on — the
 * player goes off and refilms their whole serve, and the small pale ball is still
 * invisible against the same wall.
 */
check('a ball the app could not follow is reported as a ball problem', () => {
  const ctx = confidenceCtx({ ballConfidence: 0.3 })
  for (const id of ['tossPeakHeight', 'contactBelowPeak']) {
    within(metricConfidence(id, ctx), 0, SOFT_MEASUREMENT, `${id} on a badly tracked ball`)
    const why = softnessReason(id, ctx)!
    note(`${id}: "${why}"`)
    assert(/ball/i.test(why), `never mentions the ball: "${why}"`)
    assert(!/your body|blurred here/i.test(why), `blamed the player's body: "${why}"`)
    assert(cueIssues(why).length === 0, `off-voice: ${cueIssues(why).join('; ')} — "${why}"`)
  }
})

check('a ball the app followed cleanly is never blamed', () => {
  // The guard has to be the ball's own confidence, not merely which measurement
  // this is, or a toss height softened by cropped feet would be explained as a
  // ball the app tracked perfectly well.
  const ctx = confidenceCtx({ ballConfidence: 0.95 })
  within(metricConfidence('tossPeakHeight', ctx), SOFT_MEASUREMENT, 1, 'toss height on a clean track')
  assert(!/ball/i.test(softnessReason('tossPeakHeight', ctx)!), 'blamed a well-tracked ball')
  assert(!/ball/i.test(softnessReason('kneeBend', confidenceCtx())!), 'blamed the ball for a body angle')
})

/**
 * Regression: `assessSpatial` decides from the recovered camera angle whether the
 * depth axis is readable at all, and that verdict never reached the per-metric
 * confidence — which had only the coarse `view` guess and a cost of 0.85, too
 * small to cross the softness line on its own. So hip-shoulder coil, read almost
 * entirely from inferred world z, was scored and stated crisply in exactly the
 * camera position the app's own geometry calls unreadable.
 */
check('a camera that cannot see depth softens what is read from depth', () => {
  const seen = confidenceCtx({ view: 'side' })
  const collapsed = confidenceCtx({ view: 'side', depthUnreliable: true })
  for (const id of ['hipShoulderSeparation', 'shoulderTilt']) {
    note(`${id}: ${metricConfidence(id, seen).toFixed(2)} → ${metricConfidence(id, collapsed).toFixed(2)}`)
    within(metricConfidence(id, seen), SOFT_MEASUREMENT, 1, `${id} before the depth verdict lands`)
    within(metricConfidence(id, collapsed), 0, SOFT_MEASUREMENT, `${id} once depth is called unreadable`)
  }
  // And only those: a knee angle is read in the image plane and owes the camera
  // angle nothing.
  near(
    metricConfidence('kneeBend', collapsed),
    metricConfidence('kneeBend', seen),
    1e-9,
    'knee bend confidence under an unreadable camera angle',
  )
})

check('a depth problem names the camera, not the body', () => {
  const why = softnessReason('hipShoulderSeparation', confidenceCtx({ depthUnreliable: true }))!
  note(why)
  assert(/camera/i.test(why), `never names the camera: "${why}"`)
  assert(!/blurred here|your body/i.test(why), `blamed the player's body: "${why}"`)
  // Dead side-on and dead front-on are one failure and this sentence has to
  // cover both. "Stands square on" described only the second, so the commonest
  // way of all to film a serve was told it had done the opposite thing.
  assert(!/square on/i.test(why), `told a side-on clip it stood square on: "${why}"`)
  assert(cueIssues(why).length === 0, `off-voice: ${cueIssues(why).join('; ')} — "${why}"`)
})

check('a readable camera angle still leaves the depth measurements alone', () => {
  const angled = confidenceCtx({ view: 'angled', depthUnreliable: false })
  within(metricConfidence('hipShoulderSeparation', angled), SOFT_MEASUREMENT, 1, 'coil from a corner')
  assert(
    !/camera/i.test(softnessReason('hipShoulderSeparation', angled)!),
    'blamed a camera angle the spatial read was happy with',
  )
})

/**
 * Regression: the hand guard sat ahead of every other reason in `softnessReason`,
 * so it spoke for any soft reading it could plausibly claim. A clip filmed where
 * the camera cannot see depth, by a player whose hand the detector was unsure of,
 * was explained as the hand — the player checked a badge that was already right,
 * and the camera position that actually broke the reading was never named.
 */
check('a depth problem outranks a hand that could not have changed the reading', () => {
  const base = confidenceCtx({ depthUnreliable: true })
  const unsure = {
    ...base,
    skel: { ...base.skel, handednessConfidence: 0.3, detectionConfidence: 0.3 },
  }
  const why = softnessReason('hipShoulderSeparation', unsure)!
  note(why)
  assert(/camera/i.test(why), `named something other than the camera: "${why}"`)
  assert(!/hand/i.test(why), `blamed a hand that cannot move this reading: "${why}"`)
})

/**
 * Regression: the degenerate-sweep guard returned a hard zero with no flag and no
 * cost, and it fires on "the sweep could not be resolved" as readily as on "this
 * player did not rotate". A trophy keyframe landing a third of a second late
 * turned 27.5° of correct coil into 0.0, and the card then read "hips and chest
 * locked" — with a fix, and a drill — for a trophy that coiled perfectly well.
 */
check('a trophy in the wrong place hedges the coil instead of inventing a fault', () => {
  // Filmed from a corner, so the only thing wrong with this clip is where the
  // trophy landed — from the rig's default camera the depth hedge would carry
  // the check on its own and prove nothing about the sweep.
  const frames = buildServe({ cameraYaw: 45 }, FPS)
  const skel = detectServe(frames, FPS)
  const base = {
    frames,
    skel,
    swingSamples: assessQuality(frames, skel, FPS).swingSamples,
    view: 'angled' as const,
  }
  const truth = trunkCoil(base.frames, base.skel.keys.trophy, base.skel.keys.contact)
  assert(truth > MIN_OPENING_SWEEP_DEG, `the rig coiled ${truth.toFixed(1)}°, too little to lose`)

  // Late enough to leave almost no swing between the trophy and the ball, which
  // is what a mis-placed keyframe does — and what the sweep is then measured
  // across.
  const late = {
    ...base,
    skel: { ...base.skel, keys: { ...base.skel.keys, trophy: base.skel.keys.trophy + 16 } },
  }
  const lost = trunkCoil(late.frames, late.skel.keys.trophy, late.skel.keys.contact)
  note(`coil ${truth.toFixed(1)}° → ${lost.toFixed(1)}°, confidence ${metricConfidence('hipShoulderSeparation', base).toFixed(2)} → ${metricConfidence('hipShoulderSeparation', late).toFixed(2)}`)
  within(metricConfidence('hipShoulderSeparation', base), SOFT_MEASUREMENT, 1, 'coil off a trophy in the right place')
  within(metricConfidence('hipShoulderSeparation', late), 0, SOFT_MEASUREMENT, 'coil off a trophy that landed late')
  const why = softnessReason('hipShoulderSeparation', late)!
  note(why)
  assert(!/blurred here/i.test(why), `fell through to the fallback: "${why}"`)
  assert(cueIssues(why).length === 0, `off-voice: ${cueIssues(why).join('; ')} — "${why}"`)

  // And the flaw path with it, or the card hedges while triage states the same
  // zero as the one thing to work on.
  assert(
    diagnose(base.frames, base.skel).signals.separation_deg !== undefined,
    'a well-placed trophy stopped reaching the flaw pass',
  )
  assert(
    diagnose(late.frames, late.skel).signals.separation_deg === undefined,
    'a coil nobody could resolve was handed to the flaw pass as evidence',
  )
})

check('a trunk that genuinely never turned is still measured, not hedged', () => {
  // The other half of the distinction: this player really did arm the ball, the
  // window was long enough to have shown a sweep, and zero is the measurement.
  // Hedging it here would bury the fault the card exists to name.
  const frames = buildServe({ shoulderYaw: 20, hipYaw: 14 }, FPS)
  const skel = detectServe(frames, FPS)
  const ctx = {
    frames,
    skel,
    swingSamples: assessQuality(frames, skel, FPS).swingSamples,
    view: 'side' as const,
  }
  assert(trunkCoil(frames, skel.keys.trophy, skel.keys.contact) === 0, 'the rig no longer arms the ball')
  within(metricConfidence('hipShoulderSeparation', ctx), SOFT_MEASUREMENT, 1, 'coil on a trunk that never turned')
})

/**
 * Regression: `separation_deg` reached the flaw pass carrying only trunk
 * visibility, so the depth verdict that hedged the metric card to 0.35 never
 * reached triage — which promoted "your chest opens ahead of your hips" to the
 * one thing to work on, at confidence 1.00, off the same number the report had
 * already said it could not see. Hedging and instructing off one reading is the
 * worst pairing available: the instruction is the half a player acts on.
 */
check('a camera that cannot see depth cannot name the coil fault either', () => {
  // An already-open chest, filmed dead side-on — the rig's default camera, and
  // outside the window `assessSpatial` calls readable in depth.
  const frames = buildServe({ shoulderYaw: 82, hipYaw: 108 }, FPS)
  const skel = detectServe(frames, FPS)
  const resilience = assessResilience(frames, skel)
  assert(
    resilience.spatial.depth_unreliable,
    `the rig's own camera reads at ${resilience.spatial.yaw_deg}°, which the spatial pass is happy with`,
  )

  const quality = assessQuality(frames, skel, FPS)
  const card = measure(frames, skel, quality.view === 'side', {
    confidence: {
      frames,
      skel,
      swingSamples: quality.swingSamples,
      view: quality.view,
      depthUnreliable: resilience.spatial.depth_unreliable,
    },
  })
  const coil = card.flatMap((f) => f.metrics).find((m) => m.id === 'hipShoulderSeparation')!
  within(coil.confidence, 0, SOFT_MEASUREMENT, 'the card the player reads')

  const d = diagnose(frames, skel)
  note(`card ${coil.confidence.toFixed(2)}, diagnosis ${d.flaws.filter((f) => f.flaw === 'early_shoulder_rotation').length} finding(s)`)
  assert(
    !d.flaws.some((f) => f.flaw === 'early_shoulder_rotation'),
    'named the sequence fault off depth the report had already hedged',
  )
  assert(
    d.signals.separation_deg === undefined,
    `stated a coil of ${d.signals.separation_deg} as evidence for the tier and the injury flags`,
  )

  // And the same serve, filmed from a corner, is named outright — the hedge is
  // about the camera, not about refusing to call an open chest an open chest.
  const corner = buildServe({ shoulderYaw: 82, hipYaw: 108, cameraYaw: 45 }, FPS)
  const cornerSkel = detectServe(corner, FPS)
  const found = diagnose(corner, cornerSkel).flaws.find((f) => f.flaw === 'early_shoulder_rotation')
  assert(Boolean(found?.detected), 'an open chest went unnamed from a camera angle that could see it')
})

/**
 * The camera read now runs *above* `measure` in the pipeline rather than beside
 * the triage call it feeds, which is the only way its depth verdict can reach the
 * confidence context. That reordering is safe only while everything it was hoisted
 * over leaves the frames and the skeleton exactly as it found them.
 */
check('measuring the serve does not disturb the camera read taken before it', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const before = assessResilience(frames, skel)
  measure(frames, skel, skel.shoulderWidth / skel.bodyHeight < 0.1)
  diagnose(frames, skel)
  const after = assessResilience(frames, skel)
  note(`yaw ${before.spatial.yaw_deg}° before measuring, ${after.spatial.yaw_deg}° after`)
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    'measuring the serve changed what the camera read reports',
  )
})

/* --------------------------------------------------------------- the racket */

heading('Estimating where the racket is')

check('the racket is placed a racket length beyond the hand', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const est = smoothedRacket(frames, skel.keys.contact, skel.racket, skel.bodyHeight)
  assert(est !== undefined, 'no racket estimate on a clean, fully visible serve')
  within(est!.confidence, 0.5, 1, 'racket confidence at contact')

  const reach = Math.hypot(est!.head.x - est!.grip.x, est!.head.y - est!.grip.y) / skel.bodyHeight
  note(`racket reach: ${reach.toFixed(3)} of standing height`)
  // A 27-inch racket held at the butt puts the head centre about 0.31 of an
  // adult's height beyond the hand.
  near(reach, 0.31, 0.02, 'racket reach in body heights')
})

check('the racket points away from the elbow, not back along the arm', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const f = frames[skel.keys.contact]
  const arm = skel.racket === 'right' ? LM.rightElbow : LM.leftElbow
  const est = smoothedRacket(frames, skel.keys.contact, skel.racket, skel.bodyHeight)!
  // Dot product of elbow→wrist with wrist→head must be positive, or the racket
  // is drawn folded back over the player's own forearm.
  const armX = est.grip.x - f.image[arm].x
  const armY = est.grip.y - f.image[arm].y
  const racketX = est.head.x - est.grip.x
  const racketY = est.head.y - est.grip.y
  assert(armX * racketX + armY * racketY > 0, 'the racket points back down the arm')
})

check('nothing is drawn when the hand cannot be seen', () => {
  // Behind the back at the drop is exactly where the knuckles go missing, and a
  // metre-long object drawn from a guessed direction is worse than no racket.
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const hidden = frames.map((f) => ({
    ...f,
    image: f.image.map((l, i) =>
      i === LM.leftIndex || i === LM.rightIndex || i === LM.leftPinky || i === LM.rightPinky
        ? { ...l, visibility: 0.05 }
        : l,
    ),
  }))
  const est = smoothedRacket(hidden, skel.keys.drop, skel.racket, skel.bodyHeight)
  assert(
    !est || est.confidence < 0.5,
    `drew a racket from invisible knuckles (confidence ${est?.confidence.toFixed(2)})`,
  )
})

/* ------------------------------------------------------------ fixture harness */

heading('Ground-truth fixture harness')

check('packing frames and reading them back is lossless to tracker precision', () => {
  const frames = buildServe({ noise: TYPICAL_NOISE }, FPS)
  const round = unpackFrames(packFrames(frames))
  assert(round.length === frames.length, `frame count changed: ${round.length} vs ${frames.length}`)
  let worstImage = 0
  let worstWorld = 0
  for (let i = 0; i < frames.length; i++) {
    for (let k = 0; k < 33; k++) {
      worstImage = Math.max(worstImage, Math.abs(frames[i].image[k].x - round[i].image[k].x))
      worstWorld = Math.max(worstWorld, Math.abs(frames[i].world[k].y - round[i].world[k].y))
    }
  }
  note(`worst packing error: image ${worstImage.toExponential(1)}, world ${worstWorld.toExponential(1)} m`)
  within(worstImage, 0, 1e-5, 'image packing error')
  within(worstWorld, 0, 1e-4, 'world packing error')
})

check('a fixture the engine agrees with passes', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const fixture: Fixture = {
    id: 'self-test',
    label: 'Synthetic clean serve — proves the harness runs, validates nothing about reality',
    source: 'synthetic',
    fps: FPS,
    frames: packFrames(frames),
    expect: {
      handedness: 'right',
      keyframes: { contact: frames[skel.keys.contact].t, trophy: frames[skel.keys.trophy].t },
    },
  }
  const result = validateFixture(fixture)
  assert(result.passed, `self-test fixture failed: ${JSON.stringify(result.issues)}`)
})

check('a fixture with a mislabelled keyframe is caught', () => {
  // The harness has to be able to fail, or a green suite means nothing.
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const fixture: Fixture = {
    id: 'deliberately-wrong',
    label: 'contact labelled a third of a second late',
    source: 'synthetic',
    fps: FPS,
    frames: packFrames(frames),
    expect: { keyframes: { contact: frames[skel.keys.contact].t + 0.33 } },
  }
  const result = validateFixture(fixture)
  assert(!result.passed, 'validator accepted a keyframe a third of a second out')
  assert(result.issues.some((i) => i.what.includes('contact')), 'wrong issue reported')
})

check('a clip that is not a serve is validated as rejected', () => {
  const fixture: Fixture = {
    id: 'not-a-serve',
    label: 'Someone standing around holding a racket',
    source: 'synthetic',
    fps: FPS,
    frames: packFrames(buildServe({ noSwing: true }, FPS)),
    expect: { rejected: true },
  }
  assert(validateFixture(fixture).passed, 'an idle clip was not rejected')
})

/* ---------------------------------------------------------- framing pre-flight */

heading('Framing pre-flight')

check('a well-framed clip raises nothing', () => {
  assert(framingIssues(buildServe({}, FPS)).length === 0, 'a clean clip was flagged')
})

check('cropped feet are spotted', () => {
  const frames = buildServe({}, FPS).map((f) => ({
    ...f,
    image: f.image.map((l, i) =>
      i === LM.leftAnkle || i === LM.rightAnkle || i === LM.leftHeel || i === LM.rightHeel
        ? { ...l, visibility: 0.1 }
        : l,
    ),
  }))
  assert(framingIssues(frames).includes('feet-cropped'), 'cropped feet went unnoticed')
})

check('a player filmed too small is spotted', () => {
  // Shrink everything towards the frame centre: the player is in shot, but tiny.
  const frames = buildServe({}, FPS).map((f) => ({
    ...f,
    image: f.image.map((l) => ({ ...l, x: 0.5 + (l.x - 0.5) * 0.3, y: 0.5 + (l.y - 0.5) * 0.3 })),
  }))
  assert(framingIssues(frames).includes('too-far-away'), 'a distant player went unnoticed')
})

check('an empty clip reports nobody visible', () => {
  assert(framingIssues([]).includes('nobody-visible'), 'an empty clip was accepted')
})

check('a clip nothing can be read from is stopped before the full analysis', () => {
  // Only the two that leave nothing to measure. No player at all, and no ruler:
  // standing height survives losing the feet, but the ground line is taken from
  // the head, so with neither end in shot every height is measured against a
  // reference that does not exist.
  for (const issues of [['nobody-visible'], ['feet-cropped', 'head-cropped']]) {
    const blocked = blockingFramingIssue(issues)
    assert(blocked !== undefined, `did not stop for ${issues.join(' + ')}`)
    assert(blocked!.hints.length > 0, `stopped for ${issues.join(' + ')} without saying what to do`)
  }
})

/* ------------------------------------------------- which slice of a clip we read */

check('a clip the scan found nothing in is still read at a usable rate', () => {
  // The frame budget is fixed, so the span chosen sets the sampling rate. Read
  // whole, a long clip samples too slowly for the swing to exist in the data at
  // all — and the failure then arrives half a minute later looking like a
  // verdict on the player's technique.
  //
  // A real 18.7s clip is the case this is sized against: read whole it came out
  // near 6 fps, where the ~150ms from racket drop to contact gets less than one
  // sample. `triage` wants three.
  const whole = samplingRateFor(18.7)
  assert(whole < 8, `a whole long clip used to sample at ${whole.toFixed(1)} fps`)
  assert(whole * 0.15 < 1, 'the premise is wrong: the swing was resolvable after all')

  const w = readWindow(18.7, [], -1)
  assert(!w.located, 'a guessed window claimed to be a located one')
  const rate = samplingRateFor(w.end - w.start)
  assert(rate >= 20, `fallback window samples at only ${rate.toFixed(1)} fps`)
  assert(
    rate * 0.15 >= 3,
    `only ${(rate * 0.15).toFixed(1)} samples through the swing, and triage wants 3`,
  )
  // Guessing the end of the clip, because the serve someone wants read is the
  // one they just hit.
  assert(w.end === 18.7, `did not read to the end of the clip: ${w.end}`)
  note(`whole clip ${whole.toFixed(1)} fps -> fallback window ${rate.toFixed(1)} fps`)
})

check('a located serve is still read exactly where it was found', () => {
  const w = readWindow(30, [10, 20], -1)
  assert(w.located, 'a found serve was reported as a guess')
  assert(w.serves.count === 2 && w.serves.index === 1, 'did not default to the last serve')
  assert(w.start > 17 && w.end < 21, `window drifted off the serve: ${w.start}-${w.end}`)
  assert(samplingRateFor(w.end - w.start) >= 30, 'a located serve lost sampling rate')

  const first = readWindow(30, [10, 20], 0)
  assert(first.serves.index === 0 && first.start > 7 && first.end < 11, 'asked-for serve ignored')
})

check('a short clip is read whole, not guessed at', () => {
  const w = readWindow(3.5, [], -1)
  assert(w.located, 'a clip read whole was reported as a guess')
  assert(w.start === 0 && w.end === 3.5, `did not read the whole short clip: ${w.start}-${w.end}`)
})

check('hands the tracker never finds are spotted', () => {
  const frames = buildServe({}, FPS).map((f) => ({
    ...f,
    image: f.image.map((l, i) =>
      i === LM.leftWrist || i === LM.rightWrist ? { ...l, visibility: 0.05 } : l,
    ),
  }))
  assert(framingIssues(frames).includes('hands-unseen'), 'a clip with no hand in it went unnoticed')
  // One arm behind the torso is ordinary and must not trip it.
  const oneArm = buildServe({}, FPS).map((f) => ({
    ...f,
    image: f.image.map((l, i) => (i === LM.leftWrist ? { ...l, visibility: 0.05 } : l)),
  }))
  assert(
    !framingIssues(oneArm).includes('hands-unseen'),
    'a single hidden arm was mistaken for no hands at all',
  )
})

check('a clip with no hand in it is refused, and told why', () => {
  // A player small in frame is survivable; a hand the tracker never finds is
  // not. Every swing measurement is read off a wrist, and from the far baseline
  // the model returns an inferred one indistinguishable from a tracked one — so
  // the numbers come out complete and invented rather than merely rough.
  const far = blockingFramingIssue(['too-far-away', 'hands-unseen'])
  assert(far !== undefined, 'a clip with nothing measurable in it was let through')
  assert(
    /too far/i.test(far!.message),
    `the player was not told the thing they can act on: "${far!.message}"`,
  )
  const close = blockingFramingIssue(['hands-unseen'])
  assert(close !== undefined, 'a clip with no visible hand was let through')
  assert(/racket hand/i.test(close!.message), `unhelpful refusal: "${close!.message}"`)
})

check('a clip that is merely hard to read is not stopped here', () => {
  // This gate runs before a single frame has been tracked, so whatever it stops
  // for can never reach the machinery built to cope with it. Both of these used
  // to be stopped, and both were shadowing something softer further down.
  //
  // A player small in frame breaks no measurement, because every measurement is
  // a ratio of that player's own standing height rather than of anything in the
  // room; it costs sharpness, which is what confidence is for. And a body the
  // tracker keeps losing is the very statistic `triage` weighs at
  // `LIMITS.visibility`, where the reason is named on screen and the numbers are
  // still offered behind it.
  assert(blockingFramingIssue(['too-far-away']) === undefined, 'refused a small but readable player')
  assert(blockingFramingIssue(['body-unclear']) === undefined, 'refused before triage could weigh it')
})

check('cropped feet alone are a caveat, not a rejection', () => {
  // The analysis still works: standing height falls back to the torso, the
  // heights that depend on it are marked approximate, and every angle is
  // untouched. Turning the player away would cost them a usable report.
  assert(blockingFramingIssue(['feet-cropped']) === undefined, 'refused a survivable clip')
  assert(blockingFramingIssue([]) === undefined, 'refused a well-framed clip')
})

/* --------------------------------------------------------- recorded footage */

heading('Recorded footage')

// The unlabelled-dump check and the coverage warning that used to live here now
// belong to `fixtures.test.ts`, which owns the whole question of whether the
// fixture set means anything: `validateFixtureSchema` catches `_UNVERIFIED`
// wherever it runs, and `fixtureGate` prints the coverage line once. Both were
// printing twice per suite run from here.
//
// What stays is this loop, which is a different claim: the engine, on the
// footage there is.
for (const fixture of RECORDED) {
  check(`${fixture.id} — ${fixture.label}`, () => {
    const result = validateFixture(fixture)
    // `result.error` carries two different failures and this heading says
    // "Recorded footage", i.e. the engine. A fatal schema fault means the file
    // never reached the engine, so re-throwing it here would send the reader
    // hunting a detector bug that is really a malformed fixture; the schema
    // faults are already mirrored into `issues` and reported below.
    if (result.error && !result.schema.some((s) => s.fatal)) throw new Error(result.error)
    const detail = result.issues
      .map((i) => `${i.what}: expected ${i.expected}, got ${i.actual}`)
      .join('; ')
    assert(result.passed, detail)
  })
}

report()
