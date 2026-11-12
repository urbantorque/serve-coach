/**
 * Things that must be true of a serve however it was filmed.
 *
 * THE PROBLEM WITH FOOTAGE. Every open item in `NEXT.md` is blocked on real
 * clips, and the obvious reading of that is "get clips". It is the wrong
 * reading. `__tests__/fixtures/README.md` is the honest one: a clip is worth
 * nothing to this suite until somebody has scrubbed it frame by frame and put a
 * protractor on a paused image, because the engine's answer is the thing being
 * tested and cannot also be the label. Footage is cheap. Ground truth is not,
 * and no amount of footage off the internet produces any, because nobody
 * measured those players.
 *
 * WHAT UNLABELLED FOOTAGE IS WORTH. This much: a serve filmed once is one serve,
 * and the same serve *transformed* is a second reading of the same truth. Nobody
 * has to know what the knee angle really was to know that it must not change
 * when the clip is mirrored, or scaled, or filmed at half the frame rate. Those
 * are properties of the engine rather than of the player, they hold on every
 * clip ever filmed, and they need no label at all — which makes a folder of
 * unlabelled clips off a phone or off the internet immediately useful instead of
 * useful-once-somebody-spends-an-hour-on-each.
 *
 * They are also where this engine will actually break. Look at what each one
 * touches: mirroring runs the whole read through the other arm; decimating cuts
 * the swing to the two or three samples a 30 fps phone really gives it;
 * rescaling asks whether "a ratio of the player's own height" is true or merely
 * intended; rotating asks whether the levelling pass recovers a tilted phone or
 * only claims to. Every one of those is a documented assumption in this
 * codebase with nothing behind it but the synthetic rig, which is built to
 * satisfy them.
 *
 * WHAT THIS CANNOT DO, said here so it is never quietly forgotten. It cannot
 * tell you the engine is *right*. An engine that reports every knee angle as 90°
 * passes every check in this file. Invariance is necessary and nowhere near
 * sufficient, and it does not reduce the fixture shoot in
 * `__tests__/fixtures/README.md` by one clip. What it does is make the other
 * ninety-nine clips in a folder worth something.
 *
 * ONE MORE CAVEAT, on the transforms themselves. These operate on landmarks, not
 * on pixels — the pose model has already run. So `decimate` is a real test of
 * the *engine* at a lower sample rate and not of the *model* on a blurrier
 * frame, and `rescale` moves the tracked body without moving the tracking error
 * that a genuinely smaller player would carry. Transforming pixels and
 * re-running the model would answer the harder question and needs a browser;
 * see `CORPUS.md` for where that line is drawn and why.
 */
import { mirrorFrames } from './mirror'
import { rolledFrames } from './spatial'
import type { Frame, Landmark } from './types'

/**
 * Sample every `keep`th frame, as a slower camera would have.
 *
 * The single most valuable transform here, because it is the one the app's own
 * advice is about: "film in slow motion if your phone has it" rests on the claim
 * that a 30 fps clip reads the same serve as a 120 fps one, only less sharply.
 * Fixture row 2 in the README exists to check exactly that and needs the same
 * player filmed twice; this gets most of the answer off one clip.
 *
 * Timestamps are carried through untouched rather than re-spaced, because that
 * is what a real slower camera produces.
 */
export function decimate(frames: readonly Frame[], keep = 2): Frame[] {
  const out: Frame[] = []
  for (let i = 0; i < frames.length; i += keep) out.push({ ...frames[i], index: out.length })
  return out
}

/**
 * The same body, filmed from further away or by a shorter player.
 *
 * Every spatial measurement in this app is divided by the player's own standing
 * height, and the README says so as a promise to juniors and to anyone filming
 * from the back fence: "they mean the same thing for a junior filmed close up
 * and an adult filmed from the back fence". Nothing has ever checked it. This
 * scales the whole body about a point in the frame, which is precisely what
 * moving the camera back does to the landmarks.
 */
export function rescale(frames: readonly Frame[], factor: number, about = { x: 0.5, y: 0.5 }): Frame[] {
  const move = (l: Landmark): Landmark => ({
    x: about.x + (l.x - about.x) * factor,
    y: about.y + (l.y - about.y) * factor,
    z: l.z,
    visibility: l.visibility,
  })
  // World coordinates are metres about the hip centre and describe the body
  // rather than the picture, so a camera moving back does not touch them. That
  // asymmetry is the point of the check: every angle is read from world space
  // and must not move, every height is read from image space and must survive
  // being divided by a standing height that just changed.
  return frames.map((f) => ({ ...f, image: f.image.map(move) }))
}

/**
 * A phone held at an angle, which the levelling pass claims to undo.
 *
 * BOTH SPACES, and the first attempt at this rotated only one. A camera rolled
 * six degrees also rolls the world-space landmarks the model returns, because
 * those are reported in a frame aligned to the image. Rotating one and not the
 * other produces a body whose picture is tilted and whose 3D pose is not, which
 * no camera can produce — and it showed up immediately as `contactAhead` moving
 * half its band under a transform that should not have touched it.
 *
 * That is worth recording as the general rule for this file: a transform that
 * is not a faithful model of a way of filming does not test the engine, it
 * tests the transform. Every one of these has to be checkable against "what
 * would the camera actually have handed us".
 */
export function tilt(frames: readonly Frame[], degrees: number): Frame[] {
  /*
   * ONE CALL, BOTH SPACES. `rolledFrames` rotates the world landmarks alongside
   * the image ones, so rolling by the angle rolls both, once, which is what a
   * tilted phone hands over.
   *
   * This used to rotate the world here as well and then roll the frames, which
   * rolled the image six degrees and the world twelve. The engine's own
   * levelling then took six back off each and left the world rolled by six
   * that no camera put there — and that residue was what the three roll gaps
   * below were measuring. A transform that is not a faithful model of a way of
   * filming tests the transform; this one did, for two months.
   */
  return rolledFrames([...frames], degrees, { cx: 0.5, cy: 0.5 })
}

/**
 * A measurement this engine is known not to hold steady, and why.
 *
 * NAMED RATHER THAN TOLERATED. `tiers.ts` keeps `UNCALIBRATED` and
 * `UNDER_RESOLVED` for the same purpose and it is the right shape for this: a
 * threshold quietly widened until a suite goes green is a finding deleted, and
 * this repo's fixtures README says so in as many words. So the invariance
 * harness asserts the failures are *exactly* these — a new one is a regression,
 * and a fixed one fails too, telling whoever fixed it to delete the entry.
 */
export interface KnownGap {
  id: string
  why: string
}

/*
 * What a rolled phone does to the measurements read out of world space:
 * nothing, once the pipeline has levelled it — and the harness spent two months
 * saying otherwise.
 *
 * This file used to carry three roll gaps — `contactAhead`,
 * `hipShoulderSeparation` and `dropToContact` — on the finding that
 * `levelFrames` rotates the image back onto gravity and leaves MediaPipe's
 * camera-aligned world landmarks rolled. It does not leave them: it has rotated
 * the world alongside the image since before this harness was written. The
 * drift was the harness's own. `tilt` rolled the world twice, and the reader in
 * `invariants.test.ts` skipped the levelling pass `runAnalysis` runs, so the
 * three were measuring six degrees of roll no phone had put there. With one
 * roll in, and the pipeline's own correction out, nothing drifts. Recorded
 * rather than silently deleted because `CORPUS.md` asked a shoot to settle it,
 * and the question no longer needs one.
 */

/** Every transform, named — so a report can say which one moved a number. */
export const TRANSFORMS: {
  name: string
  /** What it is meant to prove, in one line, for the report the harness prints. */
  proves: string
  apply: (frames: readonly Frame[], aspect: number) => Frame[]
  /** Measurements legitimately reversed by it, compared as magnitudes. */
  signFlips?: readonly string[]
  /** Whether the racket hand changes sides. */
  flipsHandedness?: boolean
  /** What is known not to survive it, and why. See `KnownGap`. */
  knownGaps?: readonly KnownGap[]
}[] = [
  {
    name: 'mirrored',
    proves: 'the other hand is read the same way — one player in ten is left-handed',
    apply: (f, aspect) => mirrorFrames(f, aspect),
    signFlips: ['hipShoulderSeparation', 'shoulderTilt', 'tossDrift', 'contactAhead'],
    flipsHandedness: true,
  },
  {
    name: 'half the frame rate',
    proves: 'a 30 fps phone reads the same serve as a slow-motion one',
    // `elbowAtDrop` was a known gap here — read on a single keyframe that
    // quantises with the sample rate — and stopped drifting when the drop
    // search stopped smoothing over five samples at 30 fps (`phases.ts`).
    apply: (f) => decimate(f, 2),
  },
  {
    name: 'filmed from further back',
    proves: 'every height really is a ratio of the player, not of the frame',
    apply: (f) => rescale(f, 0.7),
  },
  {
    name: 'filmed closer',
    proves: 'the same, in the direction a junior filmed near the net is at',
    apply: (f) => rescale(f, 1.25),
  },
  {
    // Eight degrees, where the correction is whole: it grows from nothing at 5° and
    // is whole from 7° (H37), so at six the clip is only half levelled by design.
    name: 'phone held 8 degrees off level',
    proves: 'the levelling pass recovers a tilt rather than only claiming to',
    apply: (f) => tilt(f, 8),
    // No sign flips. A roll rotates the body in the picture; it does not reverse
    // the sense of anything, unlike a mirror. Listing them here was a copy of
    // the mirror's entry, and it hid `shoulderTilt` behind a magnitude
    // comparison — which is exactly how a real drift disappears into a
    // tolerance nobody argued for.
  },
]

/** One measurement, before and after a transform. */
export interface Drift {
  id: string
  before: number
  after: number
  /** The difference, as a share of the measurement's own target band. */
  share: number
}

/**
 * How far each measurement moved, as a share of its own target band.
 *
 * Normalised by the band because that is the only way a knee angle in degrees
 * and a contact height in body-heights can be ranked against each other — the
 * same normalisation `MetricSpread.volatility` and `ServeDifference.size`
 * already use, for the same reason. A drift of 1.0 means the transform moved the
 * measurement across the whole width of the band it is judged against, which is
 * the difference between a fault and no fault.
 */
export function driftBetween(
  before: readonly { id: string; value: number; ideal: [number, number] }[],
  after: readonly { id: string; value: number }[],
  signFlips: readonly string[] = [],
): Drift[] {
  const then = new Map(after.map((m) => [m.id, m.value]))
  const flip = new Set(signFlips)
  const out: Drift[] = []
  for (const m of before) {
    const now = then.get(m.id)
    if (now === undefined) continue
    const band = Math.max(1e-9, Math.abs(m.ideal[1] - m.ideal[0]))
    const moved = flip.has(m.id) ? Math.abs(Math.abs(now) - Math.abs(m.value)) : Math.abs(now - m.value)
    out.push({ id: m.id, before: m.value, after: now, share: moved / band })
  }
  return out.sort((a, b) => b.share - a.share)
}

/**
 * How far a measurement may move under a transform before it is a finding.
 *
 * A THRESHOLD THIS REPO CANNOT YET JUSTIFY, and it is named rather than buried
 * for that reason. A tenth of the target band is loose enough that ordinary
 * re-derivation noise does not fire it, and tight enough that a measurement
 * crossing into a different verdict cannot hide under it. It is a convention
 * with an argument, not a measurement, and the first real corpus is what turns
 * it into one: see `CORPUS.md`, which asks for the observed distribution before
 * anybody tightens this.
 */
export const DRIFT_BUDGET = 0.1

/**
 * Measurements read in milliseconds, which halving the frame rate genuinely
 * moves — and by how much.
 *
 * NOT A WIDENED THRESHOLD, which the fixtures README rightly forbids. It is a
 * different threshold because it is a different quantity. A timing read off
 * sampled frames cannot be more precise than the gap between two of them: at 30
 * fps that is 33 ms, and `dropToContact` has a target band only 120 ms wide, so
 * one sample of quantisation is a quarter of the band before the engine has done
 * anything at all. Holding it to a tenth of its band under a transform that
 * halves the sample rate would be demanding a precision the camera did not
 * record, and the honest budget is the sample period itself.
 *
 * This is not a concession — it is the same fact the app already tells players
 * out loud ("Your camera caught few frames through the swing. Film in slow
 * motion to sharpen the swing numbers") and the same one `MIN_DROP_SEPARATION`
 * is sized against, arriving here as arithmetic instead of as prose. Two sample
 * periods rather than one, because a span is bounded by two keyframes and each
 * can move independently.
 */
export const TIMING_METRICS: readonly string[] = [
  'dropToContact',
  'tossArmHold',
  'motionLength',
  'loadRatio',
  'armsTogether',
]

/** The budget for one measurement under one transform, in the metric's own unit. */
export function budgetFor(
  metric: { id: string; ideal: [number, number] },
  /** The gap between samples after the transform, in seconds. Absent when unchanged. */
  samplePeriod?: number,
): number {
  const band = Math.max(1e-9, Math.abs(metric.ideal[1] - metric.ideal[0]))
  if (samplePeriod && TIMING_METRICS.includes(metric.id)) {
    // `loadRatio` is a percentage of the motion rather than a duration, so its
    // quantisation is two samples over the whole motion — about a second and a
    // half — rather than two samples over its own band.
    const ms = metric.id === 'loadRatio' ? (2 * samplePeriod * 100) / 1.5 : 2 * samplePeriod * 1000
    return Math.max(DRIFT_BUDGET, ms / band)
  }
  return DRIFT_BUDGET
}
