/**
 * The whole diagnostic pass, from tracked landmarks to one JSON object.
 *
 * Everything here is data. No sentence is composed, no label is looked up, no
 * copy is touched — the output is raw enough to be logged, diffed across
 * sessions, or fed to something else entirely, and every consumer decides for
 * itself how to say it. That separation is deliberate: the moment a diagnosis
 * carries its own prose, the prose becomes the interface and the numbers stop
 * being checkable.
 *
 * Cost matters as much as correctness. This runs on a phone that has just spent
 * thirty seconds on pose detection, with the video still decoded in memory, so
 * every series is a `Float32Array` sized once, nothing is retained past the
 * call, and the returned object holds numbers only — never a frame, never a
 * landmark, nothing that would pin the clip in memory behind a saved report.
 */
import { LM, clamp, mean, sided, trunkCoilReading } from './geometry'
import { DEPTH_COLLAPSED, SWEEP_UNRESOLVED } from './confidence'
import { assessSpatial } from './spatial'
import {
  palmNormalSeries,
  palmSkyElevation,
  peakAbsIn,
  pronationBetween,
  rateOf,
  refinedPeakTime,
  sampleAt,
  smoothF32,
  spineSeries,
  timeline,
  yawSeries,
} from './kinematics'
import { evaluateFlaws, MIN_EVIDENCE, type FlawFinding, type SignalReading } from './flaws'
import { inferTier, nextTier, clampTier } from './tiers'
import type { Skeleton } from './phases'
import type { Frame } from './types'
import type { BallFlight } from '../vision/ballTrack'

export interface Diagnosis {
  /** Bumped when the shape changes, so stored diagnoses can be read or dropped. */
  schema: 1
  tier: {
    current: number
    /** Always exactly one rung above `current`. Never a static standard. */
    target: number
    source: 'stated' | 'inferred'
  }
  /** Every raw measurement, in the units named by its signal spec. */
  signals: Record<string, number>
  grip: {
    continental_grip_detected: boolean
    palm_to_sky_deg: number
    confidence: number
  }
  /** Rotation timing, in milliseconds relative to contact. Negative is before. */
  sequence: {
    hip_peak_ms: number
    shoulder_peak_ms: number
    lead_ms: number
    confidence: number
  }
  flaws: FlawFinding[]
  /** What the pass cost, so a slow device can be seen rather than guessed at. */
  cost: { frames: number; series: number; ms: number }
}

export interface DiagnoseOptions {
  /** The player's own rating, when they have given one. */
  tier?: number
  /** The tracked ball, when the pixels gave one up. Two signals need it. */
  ball?: BallFlight
}

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/**
 * How many series this pass allocates.
 *
 * Stated rather than counted so the number in the output cannot quietly drift
 * upwards as detectors are added — if this and the code disagree, the test that
 * checks the allocation budget fails, which is the point.
 */
const SERIES_COUNT = 8

/**
 * Below this many samples through the trophy-to-contact window, the sequence
 * cannot be resolved.
 *
 * The lead being measured is a few tens of milliseconds. At 30 fps a frame is 33
 * of them, and the parabola fit buys back perhaps a third of a frame — so under
 * about six samples across the window, "hips first" and "shoulders first" are
 * separated by less than the sampling grid and the answer is a coin flip
 * dressed as a measurement.
 */
const MIN_SEQUENCE_SAMPLES = 6

/**
 * How well the racket wrist has to be seen between the trophy and contact
 * before "there was no drop" counts as a fact about the player.
 *
 * The same floor `metricConfidence` uses to decide a reading is soft: below a
 * mean visibility of 0.5 across the window, what the tracker returns there is
 * mostly its own guess, and a series with no dip in it is evidence about the
 * camera rather than about the swing.
 */
const DROP_VISIBLE = 0.5

/**
 * How much further the racket hand must travel in depth than in height before
 * the height trace stops being allowed to speak for the whole swing.
 *
 * On the clip this came from the hand covered about 1.5 m toward and away from
 * the camera against 0.8 m of rise — a ratio near two — while a serve filmed
 * from the side puts nearly all of the drop in the picture plane and lands well
 * under one. The threshold sits between those, nearer the side-on case, because
 * the cost of the two mistakes is not symmetric: withholding a fault the player
 * may have costs them one line of advice, and asserting one they do not have
 * sends them to the court to fix a thing that is not broken.
 */
const DEPTH_DOMINATES = 1.3

export function diagnose(
  frames: Frame[],
  skel: Skeleton,
  options: DiagnoseOptions = {},
): Diagnosis {
  const started = now()
  const { keys, bodyHeight, groundY } = skel
  const R = sided(skel.racket)
  const T = sided(skel.toss)

  const at = (i: number) => frames[clamp(i, 0, frames.length - 1)]
  const t = timeline(frames)
  const contactT = at(keys.contact).t

  /* --- rotation, and the order it happened in --------------------------- */
  // Smoothed on both sides of the derivative, which is not belt and braces.
  // Differentiating a jittery angle amplifies the jitter by the frame rate —
  // half a degree of landmark noise at 50 fps is 25°/s of invented angular
  // velocity, and the peak-finder will happily lock onto it. Smoothing the angle
  // first removes most of that at source; smoothing the rate afterwards settles
  // what survives, so the peak lands on the swing rather than on a wobble.
  //
  // Without this the sequencing verdict flipped between noise realisations of
  // the same clean serve — a player told they were arming the ball because of
  // which frame the tracker happened to be having trouble with.
  const hipRate = smoothF32(
    rateOf(smoothF32(yawSeries(frames, LM.leftHip, LM.rightHip), 3), t),
    3,
  )
  const shoulderRate = smoothF32(
    rateOf(smoothF32(yawSeries(frames, LM.leftShoulder, LM.rightShoulder), 3), t),
    3,
  )

  // From a little before the trophy — the lower body starts unwinding while the
  // racket is still going back — to contact. Opening the window earlier would
  // let the wind-up's own rotation compete with the strike for the peak.
  const from = clamp(keys.trophy - 4, 0, frames.length - 1)
  const to = clamp(keys.contact, 0, frames.length - 1)
  const samples = to - from + 1

  const hipPeakT = refinedPeakTime(hipRate, t, peakAbsIn(hipRate, from, to))
  const shoulderPeakT = refinedPeakTime(shoulderRate, t, peakAbsIn(shoulderRate, from, to))
  const leadMs = (shoulderPeakT - hipPeakT) * 1000

  const trunkVisibility = windowVisibility(frames, from, to, [
    LM.leftHip,
    LM.rightHip,
    LM.leftShoulder,
    LM.rightShoulder,
  ])
  const sequenceConfidence =
    trunkVisibility * clamp((samples - 2) / (MIN_SEQUENCE_SAMPLES + 2), 0, 1)

  /* --- the hand --------------------------------------------------------- */
  const palmToSky = palmSkyElevation(frames, skel.racket, keys.trophy)
  const { seen } = palmNormalSeries(
    frames.slice(Math.max(0, keys.trophy - 2), Math.min(frames.length, keys.trophy + 3)),
    skel.racket,
  )
  const handConfidence = mean(Array.from(seen))

  const pronation = pronationBetween(
    frames,
    skel.racket,
    sampleAt(t, contactT - 0.07),
    sampleAt(t, contactT + 0.09),
  )
  const contactHandConfidence = windowVisibility(
    frames,
    sampleAt(t, contactT - 0.07),
    sampleAt(t, contactT + 0.09),
    [R.wrist, skel.racket === 'left' ? LM.leftIndex : LM.rightIndex],
  )

  /* --- posture ---------------------------------------------------------- */
  const spine = spineSeries(frames)
  // Measured as *change* from the ready position, not as absolute tilt. Players
  // stand differently, and a stance that starts a few degrees off is not a
  // collapse — the collapse is what the motion adds to it.
  const spineLean = Math.abs(spine.lateral[to]) - Math.abs(spine.lateral[clamp(keys.ready, 0, frames.length - 1)])

  /* --- the toss --------------------------------------------------------- */
  const liftFrom = clamp(keys.toss - Math.round(frames.length * 0.12), keys.ready, keys.toss - 1)
  const tossDrift = lateralDrift(frames, liftFrom, keys.toss, T.wrist, bodyHeight)

  /* --- depth, lift and height ------------------------------------------- */
  const fDrop = at(keys.drop)
  const fContact = at(keys.contact)
  const dropDepth = (fDrop.image[R.wrist].y - fDrop.image[R.shoulder].y) / bodyHeight
  // Image y grows downwards, so an elbow above the shoulder line is a positive
  // lift. This is what separates a real external rotation from a hand hanging
  // down the back with the elbow gone — the shape that looks like a drop on a
  // still and produces none of the racket speed.
  const elbowLift = (fDrop.image[R.shoulder].y - fDrop.image[R.elbow].y) / bodyHeight
  const contactHeight = (groundY - fContact.image[R.wrist].y) / bodyHeight

  const tossPeak = options.ball ? (groundY - options.ball.apex.y) / bodyHeight : undefined

  // The identical call the report makes, down to the keyframes, because this is
  // the identical posture. Averaging across the trophy in one place and reading a
  // single frame in the other had the two halves of the app disagreeing about one
  // trophy by several degrees; deciding the sign by two different rules would be
  // worse still — the card would praise a coil while the flaw pass named an open
  // chest. Sharing `trunkCoil` makes that class of disagreement unrepresentable.
  const coil = trunkCoilReading(frames, keys.trophy, keys.contact)

  // And the identical hedging, for the identical reason. Coil is read almost
  // entirely from inferred world z, so the camera angle decides whether there is
  // a sign in it at all — and that verdict reached the report's confidence and
  // stopped there. The card hedged the number to 0.35 while this pass handed the
  // same number to triage at 1.00, which promoted "your chest opens ahead of
  // your hips" to the one thing to work on: the app hedging and instructing off
  // one reading, and the instruction is the half a player acts on. Below
  // `MIN_EVIDENCE` the flaw pass drops the signal rather than naming a fault
  // from it, which is the whole point of routing it here.
  //
  // Recovered here rather than passed in: `analyze` reads the same camera above
  // this call, but a diagnosis taken straight off frames — a stored clip, a
  // test — must not silently lose the hedge because its caller had nothing to
  // hand over.
  const depthUnreliable = assessSpatial(frames, keys.ready, bodyHeight).depth_unreliable
  const separationConfidence =
    trunkVisibility *
    (depthUnreliable ? DEPTH_COLLAPSED : 1) *
    (coil.resolved ? 1 : SWEEP_UNRESOLVED)

  /* --- assemble --------------------------------------------------------- */
  const readings: Record<string, SignalReading | undefined> = {
    palm_to_sky_deg: { value: palmToSky, confidence: handConfidence },
    separation_deg: { value: coil.deg, confidence: separationConfidence },
    hip_lead_ms: { value: leadMs, confidence: sequenceConfidence },
    toss_drift_ratio: {
      value: tossDrift,
      confidence: windowVisibility(frames, liftFrom, keys.toss, [T.wrist]),
    },
    spine_lean_deg: { value: spineLean, confidence: trunkVisibility },
    drop_depth_ratio: {
      value: dropDepth,
      confidence: windowVisibility(frames, keys.drop - 1, keys.drop + 1, [R.wrist, R.shoulder]),
    },
    elbow_lift_ratio: {
      value: elbowLift,
      confidence: windowVisibility(frames, keys.drop - 1, keys.drop + 1, [R.elbow, R.shoulder]),
    },
    pronation_deg: { value: pronation, confidence: contactHandConfidence },
    contact_height_ratio: {
      value: contactHeight,
      confidence: windowVisibility(frames, keys.contact - 1, keys.contact + 1, [R.wrist]),
    },
    toss_peak_ratio:
      tossPeak === undefined
        ? undefined
        : { value: tossPeak, confidence: clamp(options.ball?.confidence ?? 0, 0, 1) },
  }

  const signals: Record<string, number> = {}
  for (const [id, reading] of Object.entries(readings)) {
    // The same evidence bar the flaw pass applies. `signals` feeds the tier
    // inference and the injury flags, and a reading resting on landmarks the
    // tracker lost is not evidence for those either — without this gate an
    // unseen hand could clear a rung or pair up into a fabricated wrist-risk
    // flag from numbers the flaw pass had already rejected.
    if (reading && Number.isFinite(reading.value) && reading.confidence >= MIN_EVIDENCE) {
      signals[id] = reading.value
    }
  }

  const stated = options.tier !== undefined && Number.isFinite(options.tier)
  const current = stated ? clampTier(options.tier as number) : inferTier(signals)
  /*
   * The detector found no drop to put a keyframe on, which settles whether the
   * racket ever fell more directly than the depth reading can — see the note in
   * `evaluateFlaws`. But only when the camera could have seen one.
   *
   * A racket drop puts the hitting hand behind the player's back, which on a
   * clip filmed from behind or square-on is the one moment in the serve the
   * hand is not there to be tracked. The pose model still returns a wrist,
   * because it always does, and it puts it against the body outline rather than
   * behind it — so the posture series has no dip in it, the detector finds no
   * drop, and `dropOnTrophy` goes true on a serve with a perfectly good drop in
   * it. Downstream that is not a soft number, it is a hard structural claim
   * that bypasses `resolvable` entirely and floors the severity at medium: the
   * player is told their racket never falls behind their back, and the whole
   * Swing area is marked down for it.
   *
   * Absence of evidence only counts where evidence could have appeared. If the
   * racket wrist was not seen through the stretch a drop would live in, the
   * flat posture series says nothing about the player and the reading is left
   * to the depth proxy and its own confidence.
   *
   * Visibility is necessary and not sufficient, and a real clip is what showed
   * why. Filmed from behind the baseline at about seventy degrees of yaw, a
   * high-intermediate player's racket hand travelled from a metre behind the
   * hips to in front of them between the trophy and contact — a textbook drop —
   * while `racketPosture`, which is hand height against the shoulder line, rose
   * monotonically with no dip anywhere in it. Wrist visibility across the whole
   * swing was 0.96 to 0.98. Nothing about that clip was unclear; the drop simply
   * happened along the one axis a camera behind the player cannot see, and the
   * projection of it into the picture is almost flat.
   *
   * So the second test asks whether the vertical trace is the whole motion. The
   * depth series is MediaPipe's inference and is never trusted as a measurement
   * here — it produces no number and never will. It is used only to answer
   * "could the swing have been mostly in the direction the camera is pointing",
   * and when the answer is yes, the flat vertical trace is evidence about the
   * camera rather than about the player.
   */
  const dropWindow = frames.slice(
    clamp(keys.trophy, 0, frames.length - 1),
    clamp(keys.contact, 0, frames.length - 1) + 1,
  )
  const range = (pick: (f: Frame) => number) => {
    const vs = dropWindow.map(pick).filter((v) => Number.isFinite(v))
    return vs.length ? Math.max(...vs) - Math.min(...vs) : 0
  }
  // Both in metres, from the same world landmarks, so the ratio is meaningful.
  const acrossDepth = range((f) => f.world[R.wrist]?.z ?? Number.NaN)
  const acrossHeight = range((f) => f.world[R.wrist]?.y ?? Number.NaN)
  const swungIntoTheLens = acrossDepth > acrossHeight * DEPTH_DOMINATES

  const sawTheDrop =
    dropWindow.length > 0 &&
    mean(dropWindow.map((f) => f.image[R.wrist]?.visibility ?? 0)) >= DROP_VISIBLE &&
    !swungIntoTheLens

  const flaws = evaluateFlaws(readings, current, {
    racketNeverFell: skel.derivation.dropOnTrophy && sawTheDrop,
  })

  const gripFinding = flaws.find((f) => f.flaw === 'waiters_tray')

  return {
    schema: 1,
    tier: { current, target: nextTier(current), source: stated ? 'stated' : 'inferred' },
    signals: roundAll(signals),
    grip: {
      // Absent evidence is not a pass: a hand nobody could see does not get to
      // certify a grip. The flaw is only produced when the hand was seen well
      // enough to name it either way.
      continental_grip_detected: Boolean(gripFinding && !gripFinding.detected),
      palm_to_sky_deg: Math.round(palmToSky),
      confidence: round2(handConfidence),
    },
    sequence: {
      hip_peak_ms: Math.round((hipPeakT - contactT) * 1000),
      shoulder_peak_ms: Math.round((shoulderPeakT - contactT) * 1000),
      lead_ms: Math.round(leadMs),
      confidence: round2(sequenceConfidence),
    },
    flaws,
    cost: {
      frames: frames.length,
      series: SERIES_COUNT,
      ms: Math.round((now() - started) * 10) / 10,
    },
  }
}

/* ---------------------------------------------------------------- helpers -- */

/** Mean of the worst-seen landmark per frame across a window. */
function windowVisibility(frames: Frame[], from: number, to: number, landmarks: number[]): number {
  const lo = clamp(Math.min(from, to), 0, frames.length - 1)
  const hi = clamp(Math.max(from, to), 0, frames.length - 1)
  let sum = 0
  let n = 0
  for (let i = lo; i <= hi; i++) {
    let worst = 1
    for (const lm of landmarks) worst = Math.min(worst, frames[i].image[lm]?.visibility ?? 0)
    sum += worst
    n++
  }
  return n ? sum / n : 0
}

/**
 * Sideways travel of a landmark across a window, in body heights, with the
 * straight line through it removed first.
 *
 * The subtraction is the whole measurement. A player walking their hand up and
 * forward through the toss is not drifting — that is the motion — and without
 * removing the trend, every serve filmed from anywhere but dead side-on would
 * report a wandering toss.
 */
function lateralDrift(
  frames: Frame[],
  from: number,
  to: number,
  landmark: number,
  bodyHeight: number,
): number {
  const lo = clamp(Math.min(from, to), 0, frames.length - 1)
  const hi = clamp(Math.max(from, to), 0, frames.length - 1)
  const n = hi - lo + 1
  if (n < 3 || !(bodyHeight > 0)) return 0

  const xs = new Float32Array(n)
  for (let i = 0; i < n; i++) xs[i] = frames[lo + i].image[landmark].x
  const smoothed = smoothF32(xs, 2)

  const x0 = smoothed[0]
  const x1 = smoothed[n - 1]
  let worst = 0
  for (let i = 0; i < n; i++) {
    const expected = x0 + ((x1 - x0) * i) / (n - 1)
    worst = Math.max(worst, Math.abs(smoothed[i] - expected))
  }
  return worst / bodyHeight
}

const round2 = (v: number) => Math.round(v * 100) / 100

function roundAll(signals: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(signals)) {
    out[k] = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 1000) / 1000
  }
  return out
}
