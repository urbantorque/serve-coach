/**
 * How hard the serve was actually hit.
 *
 * Everything else in this report is a shape: where the hand was, how far the
 * knee bent, which way the chest faced. All of it is judged against bands
 * borrowed from what good serves look like, and none of it checks the one thing
 * a player came for. `types.ts` says it plainly about the ball — "the outcome
 * variable, and the reason it is worth the seeks: a club player is told to
 * change their technique on the strength of angles measured off their body, and
 * nothing in the report has so far checked what any of it produced."
 *
 * Two numbers live here, and they are not the same measurement twice:
 *
 *   - THE BALL OFF THE STRINGS, which the app has measured since `findOutbound`
 *     was written and has never once shown anybody. That is recorded as a
 *     deliberate deferral at the head of `findOutbound`: "a card needs the
 *     `MIN_EVIDENCE` gate the handoff asks for and copy that passes `voice.ts`;
 *     neither exists yet, and inventing them here would be the wrong order."
 *     This file is that gate. The reading itself is untouched — it still comes
 *     out of `readOutboundFlight`, still in standing heights per second, still
 *     carrying `speedConfidence` — and all that is added is the threshold below
 *     which it is not shown and the words it is shown in.
 *   - THE HAND THROUGH THE STRIKE, which is new, and which exists because the
 *     ball almost never resolves. `findOutbound`'s own measurement: the ball is
 *     in shot for 25–50 ms, and a 120 km/h serve gives 0 usable frames at 30 Hz,
 *     0 at 60, 0 at 120 and 8 at 240. So on ordinary phone footage the outcome
 *     variable is simply absent, and the closest thing to it that survives a
 *     30 fps camera is the hand that swung the racket — which the pose model
 *     tracks on every frame of every clip.
 *
 * NOT THE RACKET HEAD, and that is not an oversight. `racket.ts` states its own
 * boundary: the head is inferred by extending the wrist-to-knuckle direction by
 * a racket length, the hand landmarks are the least reliable part of the pose
 * output, and "it deliberately does not feed any measurement". A racket length
 * multiplies the angular error on that direction by about three. So this
 * measures the wrist, calls it the hand everywhere it is shown, and leaves the
 * racket to the drawing it was built for.
 *
 * NOT A SCORE, ANYWHERE. There is no band, no status, no drill and no place in
 * any area's average. A band would be this app asserting how fast a rec player's
 * hand ought to move, and there is nothing in this repo that could stand behind
 * such a number — no recorded footage, no cohort, nothing. What the report can
 * honestly do with a speed is print it and let the player watch it move across
 * their own sessions, which is a comparison against the only reference the app
 * genuinely has: them, last week.
 */
import { imageXSplit, readImageX, type ImageXSplit } from './axes'
import { LM, clamp, sided } from './geometry'
import type { Skeleton } from './phases'
import type { BallFlight } from '../vision/ballTrack'
import type { Frame } from './types'

/**
 * The longest span a single speed is fitted over.
 *
 * 90 ms, which is the window `PosePlayer` already treats as "on the keyframe"
 * for its callouts, and which is about the shortest span holding three samples
 * at 30 fps — the slowest camera anything in this app reads.
 *
 * A span rather than an instant, and that is the decision this constant carries.
 * The obvious measurement is the hand's speed AT contact, and it cannot be had:
 * an instantaneous velocity off a 30 fps camera is one difference of two
 * positions 33 ms apart, and whatever jitter each of them carries is divided by
 * that. Fitted across 90 ms the jitter averages down and what comes out is a
 * mean over a span the hand is near its fastest throughout.
 */
const STRIKE_WINDOW_S = 0.09

/**
 * How far back from contact the fastest span is looked for.
 *
 * The forward swing, near enough: `dropToContact`'s own band runs 110–320 ms and
 * its ladder calls anything under 110 ms a swing that snaps through. 220 ms
 * covers the fast half of that and stops well short of the trophy.
 *
 * NOT taken from `keys.drop`, and that is deliberate. The drop is a detected
 * event that does not always exist — `Skeleton.derivation.dropOnTrophy` is the
 * case where the racket never fell behind the back and the keyframe landed on
 * the trophy instead — so a window measured from it would silently become half a
 * second long on exactly the serves where the swing is least distinct. A fixed
 * lookback is a worse fit to a slow serve and it is the same window every time,
 * which is what a number compared across sessions needs.
 */
const SWING_LOOKBACK_S = 0.22

/**
 * Fewest samples a hand speed may rest on.
 *
 * Three, because two points give a slope with no residual to judge it by — the
 * line through them fits perfectly whatever the tracker did, and the confidence
 * would come back high on exactly the footage that deserves it least. Three is
 * also what 30 fps delivers across a 90 ms window, so this refuses the cameras
 * below the app's own floor rather than the ordinary ones.
 */
const MIN_STRIKE_SAMPLES = 3

/**
 * Samples at which the count term saturates. Six is a 60 fps phone, which is
 * what most footage this decade actually is.
 */
const TARGET_STRIKE_SAMPLES = 6

/**
 * Landmark jitter the fit is allowed before its residual starts costing it, as
 * a fraction of standing height.
 *
 * `syntheticServe.ts` puts real pose jitter at "roughly 0.5–1.5% of frame height
 * between consecutive frames even when the arm is not moving", and a body fills
 * something over half the frame at the framing this app asks for. 0.02 of
 * standing height is the top of that band. A straight line through a hand
 * genuinely travelling straight leaves residuals of about that size and no more;
 * a line through a hand that was lost and re-found leaves far more.
 */
const STRIKE_JITTER = 0.02

/**
 * What an unchecked clock is worth.
 *
 * A speed is per second, so it is the one kind of number in this report that
 * depends on the clip's seconds being seconds — and nothing in a video file
 * guarantees that. The app has exactly one witness: the tossed ball, whose
 * fitted curvature had to match gravity at the player's own image scale before
 * the fit was accepted at all. `timebaseTrust` below turns that into a number.
 *
 * On a clip with no toss fit there is no witness, and this is what that costs.
 * A modest dock rather than a refusal, because an unverified clock is not a
 * broken one — most video is stamped correctly — and because the alternative is
 * perverse: a fixed dock only for clips WITH a ball would mean that finding the
 * evidence made the reading worse. A good toss fit comes back above this, so
 * checking still pays.
 */
const UNWITNESSED_CLOCK = 0.9

/**
 * Below this a speed is not shown at all.
 *
 * The gate `findOutbound`'s docstring asks for, set at `flaws.ts`'s
 * `MIN_EVIDENCE` rather than at a number of its own — that is the line this app
 * already draws between a signal worth naming and one worth dropping, and a
 * second threshold beside it with a different value would be two houses'
 * opinions about the same question.
 *
 * Deliberately below `SOFT_MEASUREMENT`. A hedged shape still gets a card,
 * because a shape sits inside a band and being near the edge of one is
 * meaningful. A hedged speed is a bare number with nothing to sit against, so
 * the useful range for showing it at all is narrower and the honest presentation
 * of a soft one is to say how it was read — which the panel does.
 */
export const MIN_SPEED_EVIDENCE = 0.45

/** How fast the hand was going through the strike, and how much to trust it. */
export interface HandSpeed {
  /**
   * Standing heights per second, in the house unit.
   *
   * NOT km/h, for exactly the reason `OutboundFlightReading.speed` gives: the
   * conversion is one multiplication by a standing height, and that height is an
   * assumption about the player rather than a measurement of them. A 1.45 m
   * twelve-year-old scored against 1.78 m reads 23% fast. The player can state
   * their height and get a real-world number; nothing invents one for them.
   *
   * THE FASTEST 90 ms OF THE FORWARD SWING, which is not the same as the speed
   * at contact and is not the largest frame-to-frame jump either. Both of those
   * were tried and both are wrong in a way worth writing down:
   *
   *   - An instantaneous speed at contact is one difference of two positions
   *     33 ms apart on a 30 fps clip, and the tracker's jitter goes straight
   *     through it undiluted.
   *   - A maximum over a handful of frame-to-frame differences is biased upward
   *     by construction. The maximum of a noisy series estimates the signal plus
   *     the largest noise sample, not the maximum of the signal, and on four
   *     differences that bias is a large share of what would be reported.
   *
   * So each candidate span is a least-squares fit — a mean, unbiased — and the
   * largest of a handful of heavily overlapping spans is taken. The selection
   * bias that remains is small precisely because they overlap: neighbouring
   * spans share most of their frames, so they cannot disagree by much, and the
   * one that wins is the one sitting on a genuine peak in the swing rather than
   * on a lucky sample.
   *
   * A LOWER BOUND, in one respect that cannot be removed. The horizontal is
   * divided by the depth gain at the measured camera angle — the same
   * conversion `readOutboundFlight` applies to the ball, through the same module
   * — and a swing carries real travel across the body that no single image-x
   * reading can separate out. `confidence` is mostly about that.
   */
  speed: number
  /** 0–1, on the same scale as every other confidence on the report. */
  confidence: number
  /** Frames the winning span rested on. Three is a different claim from ten. */
  samples: number
}

/**
 * How far the clip's seconds are from seconds, from the tossed ball's own arc.
 *
 * Lifted out of `analyze.ts`, where it was written inline for the outbound
 * speed, because there are now two speeds on the report and a clock check
 * written twice is a clock check tested once. The arithmetic and the reasoning
 * are unchanged; the long note at the call site about which faults arrive at
 * this ratio and at what size stays there, where the ball speed is assembled.
 *
 * `fittedGravity` is a property of the pixels; `expectedGravity` is what gravity
 * should look like at the image scale this player's height implies. A clip whose
 * seconds run slow fits gravity off by the same factor, and the square root is
 * because one is an acceleration and the reported quantity is a speed.
 */
export function timebaseTrust(ball: BallFlight, bodyHeight: number): number {
  const expectedGravity = (9.81 * bodyHeight) / 1.78
  const fittedGravity = 2 * ball.coefficients[2]
  const clockRatio = fittedGravity > 0 ? Math.sqrt(expectedGravity / fittedGravity) : 0
  return Math.max(0, 1 - Math.min(1, Math.abs(clockRatio - 1)))
}

/**
 * The hand's speed through the strike, or nothing.
 *
 * Nothing whenever the window could not be read: too few samples, a wrist the
 * tracker could not see, a camera angle the depth axis has collapsed at. Every
 * one of those is a case where a number could be produced and none of them is a
 * case where it would mean anything, and this app would rather print one row
 * fewer — the rule `metrics.ts` sets out at length against flooring a
 * measurement that failed.
 */
export function readHandSpeed(
  frames: Frame[],
  skel: Skeleton,
  split: ImageXSplit,
  /** The tossed flight, when there was one — the only witness to the clip's clock. */
  ball?: BallFlight,
): HandSpeed | undefined {
  const { bodyHeight, keys } = skel
  if (!(bodyHeight > 0) || !frames.length) return undefined

  const contact = frames[clamp(keys.contact, 0, frames.length - 1)]
  if (!contact || !Number.isFinite(contact.t)) return undefined

  const wrist = sided(skel.racket).wrist
  const pool = frames.filter(
    (f) => f.t >= contact.t - SWING_LOOKBACK_S && f.t <= contact.t + 1e-9,
  )
  if (pool.length < MIN_STRIKE_SAMPLES) return undefined

  // Visibility first. A wrist the model has lost is a wrist whose position it is
  // inventing, and a line fitted through invented points is smooth, confident
  // and about nothing — the failure mode `occlusionSeconds` exists to model.
  let seen = 1
  for (const f of pool) seen = Math.min(seen, f.image[wrist]?.visibility ?? 0)
  if (!(seen > 0)) return undefined

  /*
   * Image x into the player's depth axis, through the module that owns that
   * conversion — never a cosine written out here.
   *
   * A serve swings up and out towards the net, so the hand's horizontal travel
   * is taken as running along the depth axis, exactly as the ball's is. The
   * approximation is the same one and it breaks the same way: a swing across the
   * body carries lateral travel too, and one image-x reading cannot be split
   * into both. `readImageX` hands back the share that is honestly depth, and
   * that share is carried as doubt rather than hidden.
   *
   * Asked once, on a unit displacement, because the conversion is a division by
   * a fixed gain and calling it per candidate span would be the same answer
   * several dozen times. It refuses outright below 18° of yaw, where the depth
   * axis has collapsed towards the lens and dividing by its gain would multiply
   * tracker jitter by more than three and call the answer a serve speed.
   */
  const horizontal = readImageX(1, 'depth', split)
  if (horizontal.value === null || horizontal.confidence <= 0) return undefined
  const depthGain = horizontal.value

  /*
   * One span per starting frame, and always the LONGEST that fits inside 90 ms.
   *
   * Not every span, which is what this did first, and the difference is the
   * whole of whether the reading is a measurement or a lottery. Considering
   * spans of every length hands the maximum a free choice of baseline, and a
   * three-frame fit has a shorter baseline than a nine-frame one and therefore a
   * noisier slope — so on a jittery clip the winner was always the shortest span
   * available, chosen precisely because its noise happened to point the right
   * way. Measured on the rig: the reported speed moved with the noise while the
   * confidence beside it did not move at all, which is the exact shape of a
   * number that has stopped being about the player.
   *
   * Fixing the length removes that choice. Every candidate now has the same
   * baseline and the same statistical footing, the maximum picks the fastest
   * PART OF THE SWING rather than the luckiest fit, and the residual left over
   * is something worth pricing.
   */
  let best: { speed: number; residual: number; samples: number } | undefined
  let end = 0
  for (let i = 0; i < pool.length; i++) {
    if (end < i) end = i
    while (end + 1 < pool.length && pool[end + 1].t - pool[i].t <= STRIKE_WINDOW_S) end++
    const n = end - i + 1
    if (n < MIN_STRIKE_SAMPLES) continue
    const span = pool.slice(i, end + 1)
    const xs = fit(span.map((f) => ({ t: f.t, v: f.image[wrist].x })))
    const ys = fit(span.map((f) => ({ t: f.t, v: f.image[wrist].y })))
    if (!xs || !ys) continue
    const speed = Math.hypot(xs.slope * depthGain, ys.slope) / bodyHeight
    if (!Number.isFinite(speed)) continue
    if (!best || speed > best.speed) {
      // Corrected for how little room a short fit leaves to be wrong in. A line
      // through three points has one degree of freedom, so its residual
      // understates the noise by a known factor — and without this a 30 fps clip
      // would look tidier than a 120 fps one purely for having fewer frames to
      // disagree with itself.
      const dof = Math.sqrt(n / Math.max(1, n - 2))
      best = { speed, residual: ((xs.residual + ys.residual) / 2 / bodyHeight) * dof, samples: n }
    }
  }
  if (!best || !(best.speed > 0)) return undefined

  /*
   * How straight the hand travelled through the winning span, against the jitter
   * an ordinary clip carries.
   *
   * This term was very nearly worthless in its first form and the reason is
   * worth keeping: measured over a fixed window straddling contact, most of the
   * residual about a straight line is the hand's own ACCELERATION rather than
   * the tracker's noise, so it saturated at zero on clean synthetic footage and
   * never moved again. Two things fix it. The span is short — 90 ms — and it is
   * the span where the speed is highest, which is where the speed is also
   * changing least, so the curvature left inside it is small. What remains is
   * mostly jitter, which is what this is meant to be measuring.
   */
  const straight = clamp(1 - best.residual / STRIKE_JITTER, 0, 1)
  const enough = Math.min(1, best.samples / TARGET_STRIKE_SAMPLES)
  const clock = ball ? timebaseTrust(ball, bodyHeight) : UNWITNESSED_CLOCK

  return {
    speed: best.speed,
    confidence: clamp(
      horizontal.confidence *
        clock *
        Math.min(1, seen) *
        (0.5 + 0.2 * enough + 0.3 * straight),
      0,
      1,
    ),
    samples: best.samples,
  }
}

/** Least squares through a short series, with the mean absolute residual. */
function fit(points: { t: number; v: number }[]): { slope: number; residual: number } | undefined {
  const n = points.length
  if (n < 2) return undefined
  let st = 0
  let sv = 0
  for (const p of points) {
    st += p.t
    sv += p.v
  }
  const mt = st / n
  const mv = sv / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.t - mt) * (p.v - mv)
    den += (p.t - mt) ** 2
  }
  if (!(den > 1e-12)) return undefined
  const slope = num / den
  const intercept = mv - slope * mt
  let residual = 0
  for (const p of points) residual += Math.abs(p.v - (slope * p.t + intercept))
  return { slope, residual: residual / n }
}

/**
 * A house-unit speed as km/h, against a stated standing height.
 *
 * The conversion `OutboundFlightReading.speed` refuses to make on its own, made
 * here only where the player has supplied the one thing that was missing.
 * `speed` is standing heights per second; multiplying by a height in metres
 * gives metres per second, and 3.6 of those is a kilometre an hour. The
 * assumption the docstring objects to — that everybody is 1.78 m — is gone the
 * moment the height is a fact about this player rather than about adults in
 * general, which is why this takes one and has no default.
 */
export function speedInKmh(bodyHeightsPerSecond: number, standingHeightCm: number): number {
  return bodyHeightsPerSecond * (standingHeightCm / 100) * 3.6
}

/** A plausible standing height, so a slipped digit cannot become a serve speed. */
export const HEIGHT_CM_RANGE: [number, number] = [110, 230]

export const isPlausibleHeight = (cm: number | undefined): cm is number =>
  typeof cm === 'number' &&
  Number.isFinite(cm) &&
  cm >= HEIGHT_CM_RANGE[0] &&
  cm <= HEIGHT_CM_RANGE[1]

/**
 * A split for a clip whose camera angle was never measured.
 *
 * Only for callers that have a yaw and no `Spatial` — the consistency sweep and
 * the tests. Everything inside `runAnalysis` has the real one and must use it;
 * this exists so that a caller without one has to say so rather than quietly
 * assuming side-on, which is the assumption that made `readOutboundFlight`
 * agree with its own test at exactly one camera angle.
 */
export const splitAtYaw = (yawDeg: number): ImageXSplit => imageXSplit(yawDeg)

/** The landmark every hand speed is read from, named once. */
export const HAND_LANDMARKS = { left: LM.leftWrist, right: LM.rightWrist } as const
