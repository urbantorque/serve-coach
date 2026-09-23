import type { ServeType } from '../storage/prefs'
import { readoutOf, targetOf } from './anatomy'
import { FUNDAMENTALS, metricCopy, type MetricCopy } from './coaching'
import { imageXSplitFrom, readImageX, type BodyAxis } from './axes'
import { assessSpatial } from './spatial'
import { cue } from './voice'
import {
  LM,
  TROPHY_POSTURE_RADIUS,
  chainScore,
  clamp,
  jointAngle,
  midpoint,
  scoreAgainst,
  sided,
  signedElevationFromHorizontal,
  smooth,
  statusOf,
  stdev,
  steadyWorld,
  trunkCoil,
} from './geometry'
import {
  SOFT_MEASUREMENT,
  effectiveWeight,
  metricConfidence,
  softnessReason,
  type ConfidenceContext,
} from './confidence'
import type { Skeleton } from './phases'
import { flightHeightAt, type BallFlight } from '../vision/ballTrack'
import type { Frame, Fundamental, FundamentalId, Metric } from './types'

/** Measurements that only exist when the ball was found in the pixels. */
const BALL_METRICS = new Set(['tossPeakHeight', 'contactBelowPeak'])

/**
 * Samples the toss-to-contact window needs before a share of it means anything.
 *
 * `handUnderElbow` counts frames, so one frame is worth 100/N of the answer. Its
 * ladder turns over at 8 — below that the hand never gets under the elbow at all
 * — so at nine samples or fewer a single frame is worth more than that entire
 * bottom rung, and which side of it a player lands on is decided by which
 * instant the camera happened to catch rather than by what their arm did.
 *
 * Ten rather than something larger because this has to fire almost never. At 30
 * fps, the slowest camera the app reads (see `MIN_DROP_SEPARATION` in
 * phases.ts), a toss-to-contact stretch of 0.7–1.2 s is 22–37 samples, and the
 * synthetic rig's collapsed-drop serve gives 21 at that rate. Below ten samples
 * either the clip is far under spec or contact landed on the toss, and in both
 * cases there is no window to take a share of.
 */
const HAND_HANG_MIN_SAMPLES = 10

function format(value: number, copy: MetricCopy): string {
  if (copy.unit === 'ms') return `${Math.round(value)} ms`
  const n = value.toFixed(copy.decimals)
  return copy.unit === '°' || copy.unit === '%' || copy.unit === '×' ? `${n}${copy.unit}` : n
}

/**
 * Assemble one measurement, or nothing at all when there was no measurement.
 *
 * A value that did not come out finite used to be replaced by `copy.ideal[0]`,
 * the floor of the target band — and that is the one thing this app must never
 * do. It is not a cautious default; it is a number nobody measured, printed with
 * a readout, a badge and a place in the area score. Worse, where the floor lands
 * depends on the band's shape, so the invention flattered as often as it
 * scolded: a toss wobble that failed to compute came back as 0 against an ideal
 * of 0–3 and scored 100, telling a player their toss path was flawless on a
 * clip the app could not read it from at all.
 *
 * Nothing downstream could catch it either. The value sat inside its band, so
 * there was no fix and no drill to look wrong; `confidence` describes how well
 * the clip was *seen*, not whether the arithmetic produced a number, so a
 * perfectly framed serve hedged nothing. The fabrication was indistinguishable
 * from a reading.
 *
 * Scoring it at the floor of the *scale* instead would be the same invention
 * pointing the other way — "your arm never straightens" is as much a claim about
 * the player as "your toss is perfect". So it is dropped, on exactly the grounds
 * the filters in `measure` already use for contact depth and the ball: a
 * measurement that could not be taken is not a bad measurement, and the honest
 * report of one is to say nothing. The card carries one row fewer, the area
 * score is averaged over what was actually measured, and no advice is built on
 * top of it.
 */
function build(
  id: string,
  value: number,
  ctx?: ConfidenceContext,
  serveType: ServeType = 'flat',
  axis?: BodyAxis,
): Metric | undefined {
  const copy = metricCopy(id, serveType, axis)
  if (!copy) throw new Error(`no coaching copy for metric "${id}"`)
  if (!Number.isFinite(value)) return undefined
  const confidence = ctx ? metricConfidence(id, ctx) : 1
  const score = scoreAgainst(value, copy.ideal, copy.range, copy.missSpan)
  const below = value < copy.ideal[0]
  const above = value > copy.ideal[1]

  // No cap here, and none needed. `scoreAgainst` crosses the "Solid" threshold
  // at the band edge, so band membership and badge already say the same thing:
  // out of band cannot score 70 and in band cannot score less. Capping the badge
  // instead — the previous attempt at this — cost the app the "Solid" badge
  // entirely, because in-band was then always "Strong" and out-of-band always at
  // best "Refine", with a two-level jump across every edge.
  const status = statusOf(score)
  const insight = below ? copy.insight.low : above ? copy.insight.high : copy.insight.ok
  // Band membership, not the score, is still what decides the fix — as
  // `coaching.ts` documents. The fix names the correction the readout has
  // already described, so it has to be present whenever there is something
  // outside the band to correct, and reading it off the score would let the two
  // drift apart again the moment anyone touches the curve.
  const fix = below ? copy.fix.low : above ? copy.fix.high : undefined

  // Both go through the voice filter on the way out, even though the database
  // they come from is linted in the tests. Serve-type copy, anything added
  // later and anything assembled from live data lands here too, and the filter
  // is the only thing every string is guaranteed to pass through.
  const command = cue(insight)
  const order = fix ? cue(fix) : undefined

  return {
    id,
    label: copy.label,
    value,
    unit: copy.unit,
    display: format(value, copy),
    readout: readoutOf(id, value),
    target: targetOf(id, copy.ideal),
    decimals: copy.decimals,
    ideal: copy.ideal,
    range: copy.range,
    score,
    status,
    weight: copy.weight,
    insight: command,
    fix: order || undefined,
    // One drill, and only where there is something to correct. A drill under a
    // measurement already inside its band is a player practising what they
    // already do.
    drill: order ? copy.drill : undefined,
    phase: copy.phase,
    confidence,
    softness:
      ctx && confidence < SOFT_MEASUREMENT ? softnessReason(id, ctx) : undefined,
  }
}

/**
 * Joint angle at a keyframe, measured from landmark positions averaged over a
 * frame either side.
 *
 * Angles near full extension are systematically under-read on noisy tracking.
 * 180° is a ceiling — jitter on a nearly-straight three-point chain can bend it
 * but cannot straighten it past flat — so the error does not cancel and a truly
 * straight arm measures bent. That matters here because arm extension is one of
 * the measurements that tells a player to change something.
 *
 * Averaging the positions first is what shrinks it, for the reasons `steadyWorld`
 * sets out: less positional noise means less of the one-sided angle error.
 */
function steadyAngle(
  frames: Frame[],
  idx: number,
  a: number,
  b: number,
  c: number,
  radius = 1,
): number {
  return jointAngle(
    steadyWorld(frames, idx, a, radius),
    steadyWorld(frames, idx, b, radius),
    steadyWorld(frames, idx, c, radius),
  )
}

/**
 * Which way the net is, in image x, and whether we can tell at all.
 *
 * Only `contactAhead` needs this, and it needs it as a *sign* — so getting it
 * wrong does not shade the answer, it mirrors it, turning a contact 20 cm in
 * front into one 20 cm behind and the best measurement in the serve into the
 * worst. That makes this the one place in the pipeline where noise can produce a
 * confidently reversed reading rather than a slightly soft one.
 *
 * Taking the difference of two single frames is what made it fragile: it is one
 * subtraction of two independently jittering landmarks, and side-on the whole
 * horizontal travel it is trying to resolve can be a few percent of body height.
 * A least-squares slope over the entire trophy-to-contact window uses every
 * sample in between instead, which both averages the jitter down and measures
 * across the largest horizontal sweep in the motion.
 *
 * When the fitted travel is still too small to call — a dead-on front or back
 * view, where the hand comes almost straight towards the lens — the honest
 * answer is that this camera cannot see depth, and the measurement is dropped
 * rather than decided by a coin flip.
 */
function forwardDirection(
  frames: Frame[],
  from: number,
  to: number,
  wrist: number,
  bodyHeight: number,
): { sign: number; certain: boolean } {
  const lo = clamp(Math.min(from, to), 0, frames.length - 1)
  const hi = clamp(Math.max(from, to), 0, frames.length - 1)
  const n = hi - lo + 1
  if (n < 3) return { sign: 1, certain: false }

  // Slope of x against sample index. Indices are evenly spaced, so the usual
  // sums reduce to this closed form — and the mean of x drops out of it, because
  // the index deviations already sum to zero.
  let sumIX = 0
  const meanI = (n - 1) / 2
  for (let i = lo; i <= hi; i++) {
    sumIX += (i - lo - meanI) * frames[i].image[wrist].x
  }
  const denom = (n * (n * n - 1)) / 12
  const slope = denom > 0 ? sumIX / denom : 0
  const travel = slope * (n - 1)

  // Six percent of standing height — about 11 cm on an adult. Below that the
  // sweep is comparable to the jitter on the landmarks it was fitted from.
  const certain = Math.abs(travel) >= 0.06 * bodyHeight
  return { sign: Math.sign(travel) || 1, certain }
}

/* ========================================================================== */

/**
 * Measure every fundamental against the detected keyframes.
 *
 * All spatial ratios are divided by the player's own standing height, so the
 * numbers mean the same thing for a junior filmed close up and an adult filmed
 * from the back fence. Joint angles come from the world (metric) landmarks,
 * which is what makes them survive a change of camera angle.
 */
export interface MeasureOptions {
  /** The tracked ball, when there was one. Two measurements depend on it. */
  ball?: BallFlight
  /**
   * Omitted only by tests that do not care about confidence; the pipeline always
   * supplies it, and without it every measurement reads as fully trusted.
   */
  confidence?: ConfidenceContext
  /** Which serve this is, which shifts a handful of target bands. */
  serveType?: ServeType
}

export function measure(
  frames: Frame[],
  skel: Skeleton,
  sideView: boolean,
  options: MeasureOptions = {},
): Fundamental[] {
  const { ball, confidence: confidenceCtx, serveType = 'flat' } = options
  // Every horizontal ratio is normalised by body height rather than shoulder
  // width. Shoulder width is the more natural yardstick but it foreshortens to
  // almost nothing side-on, which would inflate those ratios exactly when the
  // camera angle is the one we recommend.
  const { keys, bodyHeight, groundY } = skel
  const R = sided(skel.racket)
  const T = sided(skel.toss)

  /*
   * NOTHING HERE READS PAST CONTACT, and that is a gap rather than a decision.
   *
   * Every window below ends at `keys.contact`. `keys.finish` exists, the
   * detector places it, the filmstrip draws it — and no measurement in this file
   * or in `strain.ts` ever looks at it. So the whole tail of the swing is
   * observed and unmeasured, which matters because a serve that lands off
   * balance loads the same lower back the lumbar flag already watches and the
   * front knee besides, and all of it happens after the ball has gone.
   *
   * Audited rather than assumed, and the reason it stays a gap is the rig. In
   * `syntheticServe.ts` both legs are placed as one symmetric function of a
   * single knee-bend dial — each ankle hangs directly under its own hip at every
   * instant — so the rig has no landing in it, collapsed or otherwise. A signal
   * built against it would read a constant and hold beautifully still under
   * noise, which is precisely the shape this engine has already learned to
   * distrust: a number that does not move when the fault appears is a constant
   * with a units label.
   *
   * The second half is that the rig also cannot say whether a phone would SEE a
   * landing. It has no framing or crop dial and always frames the whole body, so
   * a sweep of "is the foot in shot" is structurally incapable of coming out any
   * way but yes. The app already carries the concept for real footage —
   * `anklesSeen` in `analyze.ts`, `ANKLES_SEEN_FLOOR` in `phases.ts`, and the
   * note there that a foot outside the frame is placed near the picture edge and
   * flagged unseen rather than omitted — so a landing reading would have a
   * refusal ready and nothing to validate it against.
   *
   * Anyone picking this up starts by giving the rig a landing, not by writing a
   * measurement.
   */
  const at = (i: number) => frames[clamp(i, 0, frames.length - 1)]
  const fToss = at(keys.toss)
  const fTrophy = at(keys.trophy)
  const fDrop = at(keys.drop)
  const fContact = at(keys.contact)

  /** Height above the court, in body heights. */
  const above = (f: Frame, lm: number) => (groundY - f.image[lm].y) / bodyHeight

  const values: Record<string, number> = {}

  /**
   * Which body axis each image-x reading was actually taken along.
   *
   * Only `tossPathWobble` is in here today, and it is a record rather than a
   * single variable because the axis has to travel with the measurement all the
   * way to `build`: the card's words and its drill are chosen by it, and a
   * fence-line drill printed under a front-to-back reading is the exact failure
   * this whole path exists to stop.
   */
  const measuredAxis: Record<string, BodyAxis> = {}

  // What image x means for this camera, recovered once and shared. Taken here
  // rather than accepted from `analyze` for the same reason `diagnose` recovers
  // it itself: a report measured straight off frames — a stored clip, a test —
  // must not quietly lose the attribution because its caller had no angle to
  // hand over. `confidence.ts` asks the identical question of the identical
  // frames, so the axis a card is named for and the axis its confidence is
  // priced against cannot disagree.
  const imageX = imageXSplitFrom(assessSpatial(frames, keys.ready, bodyHeight))

  /* ----------------------------------------------------------------- toss */
  values.tossArmExtension = steadyAngle(frames, keys.toss, T.shoulder, T.elbow, T.wrist)
  values.releaseHeight = above(fToss, T.wrist)

  // How much of the toss→contact window the tossing hand spends above its own
  // shoulder. Dropping it early is the most common fault in club serves.
  {
    const span = Math.max(1, keys.contact - keys.toss)
    let held = 0
    for (let i = keys.toss; i <= keys.contact; i++) {
      const f = at(i)
      if (f.image[T.wrist].y < f.image[T.shoulder].y) held++
    }
    values.tossArmHold = (held / (span + 1)) * 100
  }

  // Wobble of the tossing hand on the way up, along whichever body axis this
  // camera laid across image x. The straight line from the start of the lift to
  // the release is removed first, so travelling forwards with the body does not
  // read as a wobble.
  //
  // This block used to end at the image-x figure and call it sideways. It is
  // not sideways; it is `depth·sin(yaw) + lateral·cos(yaw)` and which of those
  // it mostly is depends on where the phone stood — dead side-on, the framing
  // this app recommends, the number is 99% front-to-back drift. The player was
  // then told their hand "drifts sideways" and sent to a fence-line drill that
  // constrains the one axis the reading barely contained.
  {
    const from = clamp(keys.toss - Math.round(frames.length * 0.12), keys.ready, keys.toss - 1)
    const seg = frames.slice(from, keys.toss + 1)
    let wobbleImageX = 0
    if (seg.length >= 3) {
      // Smoothed first, so landmark jitter does not masquerade as a wobbly toss.
      const xs = smooth(seg.map((f) => f.image[T.wrist].x), 2)
      const x0 = xs[0]
      const x1 = xs[xs.length - 1]
      const residual = xs.map((x, i) => x - (x0 + ((x1 - x0) * i) / (xs.length - 1)))
      wobbleImageX = (stdev(residual) / bodyHeight) * 100
    }

    // `dominant` is null only where the two axes are laid across image x in
    // equal measure, at which point naming either one is a coin toss wearing a
    // measurement's clothes. `readImageX` can refuse a second time, where the
    // named axis has folded into the lens — it cannot fire from here, because
    // the dominant axis is by construction the readable one, and it is written
    // through rather than around so that a future caller asking for a *named*
    // axis rather than the dominant one inherits the guard instead of a number
    // made of jitter multiplied by eleven. Either refusal leaves the value
    // unset, which is this file's established answer to a measurement that could
    // not be taken: see the filters at the bottom of `measure`.
    const axis = imageX.dominant
    const reading = axis ? readImageX(wobbleImageX, axis, imageX) : { value: null, confidence: 0 }
    if (reading.value !== null) {
      values.tossPathWobble = reading.value
      measuredAxis.tossPathWobble = axis as BodyAxis
    }
  }

  /* -------------------------------------------------------------- loading */
  values.kneeBend =
    180 -
    (steadyAngle(frames, keys.trophy, LM.leftHip, LM.leftKnee, LM.leftAnkle) +
      steadyAngle(frames, keys.trophy, LM.rightHip, LM.rightKnee, LM.rightAnkle)) /
      2

  // Both trunk-rotation readings come from positions averaged across the trophy,
  // the same treatment every joint angle above already gets. These two lean
  // almost entirely on world z and were the last measurements at the trophy
  // still taken from a single frame — the noisiest numbers in the app, read in
  // the one way that keeps all of the noise.
  const trophyPose = (lm: number) => steadyWorld(frames, keys.trophy, lm, TROPHY_POSTURE_RADIUS)

  // Which rotational direction counts as coil is read off this player's own
  // uncoiling, not assumed from the racket side — see `trunkCoil`. The whole
  // trophy-to-contact window is handed over rather than a posture, so this and
  // the diagnosis cannot drift into measuring the sign two different ways.
  values.hipShoulderSeparation = trunkCoil(frames, keys.trophy, keys.contact)

  // Ordered tossing shoulder first, hitting shoulder second, so a positive tilt
  // is the hitting shoulder sitting below the tossing one — the cartwheel the
  // report asks for in words. Passed unordered this cannot tell that apart from
  // its mirror image, and a reverse cartwheel scores like a textbook trophy.
  values.shoulderTilt = signedElevationFromHorizontal(
    trophyPose(T.shoulder),
    trophyPose(R.shoulder),
  )

  {
    const hipTrophy = midpoint(fTrophy.image[LM.leftHip], fTrophy.image[LM.rightHip])
    const hipContact = midpoint(fContact.image[LM.leftHip], fContact.image[LM.rightHip])
    values.legDrive = (hipTrophy.y - hipContact.y) / bodyHeight
  }

  /* ---------------------------------------------------------------- swing */
  values.dropDepth = (fDrop.image[R.wrist].y - fDrop.image[R.shoulder].y) / bodyHeight
  values.elbowAtDrop = steadyAngle(frames, keys.drop, R.shoulder, R.elbow, R.wrist)
  // Between samples, not between frames — see `refineExtremum`.
  values.dropToContact = Math.max(0, (skel.times.contact - skel.times.drop) * 1000)

  // How much of the swing the racket hand spends hanging under its own elbow.
  //
  // This is the one measurement on the Swing card that survives a serve with no
  // racket drop, and that is why it is here. The three above it are all read at
  // or between keyframes, and on a rigid-legged serve whose racket never falls —
  // the commonest shape this app will ever be shown — the trophy, the drop and
  // sometimes the toss collapse onto one instant, at which point the filters at
  // the bottom of `measure` correctly take two of them off the card and leave a
  // beginner with one row. A share of a window is not read at an instant, so it
  // is still the same quantity on exactly that clip: on the synthetic rig it is
  // 2.9% for a serve with no drop and 28.6% for the clean one, and it climbs
  // monotonically between them (14.3 at a 0.10 m drop, 20.0 at 0.20, 25.7 at
  // 0.30).
  //
  // Three deliberate choices, each of them a fault this file has already paid
  // for somewhere else:
  //
  // The window is toss→contact and not trophy→contact, even though the trophy is
  // where a swing arguably begins. `trophyOnToss` is exactly the collapse this
  // measurement exists to survive, and a share taken over a window that silently
  // grows when a keyframe moves is `loadRatio`'s defect rebuilt: on the rig, the
  // trophy→contact share of an otherwise clean serve reads 43.5% with the legs
  // loaded and 45.5% with them rigid — same arm, different window, and the
  // difference lands on the player. Anchored at the toss it reads 28.6% for
  // both.
  //
  // It counts nothing but the vertical order of three landmarks in the frame, so
  // there is no `imageXAxis` question to get wrong and no depth to infer: which
  // of two points sits higher in the picture is the same fact from every camera
  // angle. Measured across the rig at 20°, 45°, 60° and 89° of yaw it does not
  // move at all.
  //
  // And the hand has to be up off the hip line as well as under the elbow. A
  // racket left hanging by the thigh also puts the elbow above the hand — that
  // is what a hanging arm is — so without the hip gate a player who never takes
  // the racket back at all scores full marks for a loaded arm they never made.
  // The rig's idling serve, racket by the hip from first frame to last, reads
  // 100% without the gate and 0% with it.
  {
    const from = clamp(keys.toss, 0, frames.length - 1)
    const to = clamp(keys.contact, from, frames.length - 1)
    const samples = to - from + 1
    // Left unset below the floor rather than reported coarsely, which is this
    // file's established answer to a measurement that could not be taken — see
    // the filters at the bottom of `measure`, and `HAND_HANG_MIN_SAMPLES` for
    // why ten.
    if (samples >= HAND_HANG_MIN_SAMPLES) {
      let hung = 0
      for (let i = from; i <= to; i++) {
        const f = frames[i]
        const hip = midpoint(f.image[LM.leftHip], f.image[LM.rightHip])
        // Image y grows downwards, so "above" is the smaller number: the elbow
        // sits above the hand, and the hand sits above the hips.
        if (f.image[R.elbow].y < f.image[R.wrist].y && f.image[R.wrist].y < hip.y) hung++
      }
      values.handUnderElbow = (hung / samples) * 100
    }
  }

  /* -------------------------------------------------------------- contact */
  values.contactHeight = above(fContact, R.wrist)
  values.armExtension = steadyAngle(frames, keys.contact, R.shoulder, R.elbow, R.wrist)

  {
    const ankleTrophy = midpoint(fTrophy.image[LM.leftAnkle], fTrophy.image[LM.rightAnkle])
    const ankleContact = midpoint(fContact.image[LM.leftAnkle], fContact.image[LM.rightAnkle])
    values.bodyExtension = Math.max(0, (ankleTrophy.y - ankleContact.y) / bodyHeight)
  }

  // "In front" needs a direction, and the racket hand travelling netwards
  // between the trophy and contact is what defines it — no assumption about
  // which way the player happens to face the camera.
  const netwards = forwardDirection(frames, keys.trophy, keys.contact, R.wrist, bodyHeight)
  {
    const hip = midpoint(fContact.image[LM.leftHip], fContact.image[LM.rightHip])
    values.contactAhead =
      (((fContact.image[R.wrist].x - hip.x) * netwards.sign) / bodyHeight) * 100
  }

  /* ------------------------------------------------------------- the ball */
  // Absent unless the ball was actually seen. Everything else here is measured
  // from the body, which is always tracked; the ball is not, so these two are
  // the only measurements in the app that can simply fail to exist on an
  // otherwise perfect clip — and reporting a guessed toss height would be worse
  // than reporting none.
  if (ball) {
    values.tossPeakHeight = (groundY - ball.apex.y) / bodyHeight
    // How far it had fallen by the moment of contact. Image y grows downwards,
    // so a ball below its apex sits at a larger y.
    values.contactBelowPeak = Math.max(
      0,
      (flightHeightAt(ball, fContact.t) - ball.apex.y) / bodyHeight,
    )
  }

  /* --------------------------------------------------------------- rhythm */
  values.totalTime = (skel.times.contact - at(keys.ready).t) * 1000
  {
    const total = Math.max(1e-3, skel.times.contact - at(keys.ready).t)
    values.loadRatio = ((skel.times.contact - fTrophy.t) / total) * 100
  }
  values.syncAtRelease = (fToss.image[R.shoulder].y - fToss.image[R.wrist].y) / bodyHeight

  /* ---------------------------------------------------------- assemble ---- */
  const order: FundamentalId[] = ['toss', 'loading', 'swing', 'contact', 'rhythm']
  return order.map((id) => {
    const def = FUNDAMENTALS[id]
    const metrics = def.metrics
      // Contact depth only means anything when we can see the player's depth,
      // which a head-on or behind-the-baseline camera cannot give us — and when
      // the swing gave us enough horizontal travel to say which way the net is.
      // Reporting it without both is not an imprecise number, it is one that can
      // come out mirrored.
      .filter((m) => (m === 'contactAhead' ? sideView && netwards.certain : true))
      // The ball measurements exist only when the ball was tracked.
      .filter((m) => (BALL_METRICS.has(m) ? m in values : true))
      // And the drop-to-contact interval exists only when the drop did. On a
      // serve whose racket never falls, the drop keyframe lands on the trophy
      // (`dropOnTrophy`), so this stops timing the acceleration window and
      // starts timing the whole trophy-to-contact stretch: about 680 ms against
      // a 110–230 ms band. It then scores at the floor, outvotes `dropDepth` for
      // the swing card's headline, and hands the player a tempo drill — "stop
      // steering, serve looser" — for a fault that is not tempo, while the
      // measurement beside it has already named the real one.
      //
      // Dropped rather than hedged, on the same grounds as `contactAhead` above
      // and the ball measurements below. Hedging is for a number that is right
      // about the wrong quantity, and the softest possible caveat still leaves
      // "your swing is slow" printed on the card next to a serve that has no
      // swing to be slow. There is no interval here to state loosely.
      .filter((m) => (m === 'dropToContact' ? !skel.derivation.dropOnTrophy : true))
      // The elbow angle *at the drop* goes with it, for the same reason and one
      // of its own. With no drop the angle is read at the toss, where the arm is
      // still on its way up — and a near-straight arm there reads as the elbow
      // being jammed tight against the back, which is the opposite fault. The
      // card then carried both orders at once: "let the racket fall" from
      // `dropDepth` directly above "give the racket room" from here.
      .filter((m) => (m === 'elbowAtDrop' ? !skel.derivation.dropOnTrophy : true))
      // And the share of the motion spent after the trophy needs a trophy that
      // happened somewhere. When it lands on the toss (`trophyOnToss`) this stops
      // being "how much of the serve is the explosive half" and becomes "how much
      // of the serve happens after the ball leaves the hand", which is most of it
      // by construction: about 60% against a 22–42% band. It scores near the
      // floor and can take the headline back off the racket drop — the exact
      // outcome the filter above exists to prevent, arriving one metric later.
      .filter((m) => (m === 'loadRatio' ? !skel.derivation.trophyOnToss : true))
      // And the toss wobble needs a camera that says which way the hand
      // wandered. Image x is one number carrying two body axes mixed by the
      // camera angle, and one number cannot be split into two: at 45° it is half
      // front-to-back and half sideways, and there is no third reading anywhere
      // in a monocular clip to separate them with.
      //
      // Dropped rather than hedged, because what fails here is not the size of
      // the drift but its name — and the name is what the card is written in.
      // Every string this measurement can print, and the drill under it, commits
      // to one axis or the other; there is no wording for "your toss wandered,
      // and I cannot tell you which way" that a player could take onto a court.
      // So the row leaves the card the way contact depth does, and the toss
      // score is averaged over the four measurements that survived.
      .filter((m) => (m === 'tossPathWobble' ? m in values : true))
      // And the share of the swing spent with the hand under the elbow needs
      // enough samples for a share to mean anything. Unlike the four filters
      // above, this one is not about a keyframe that moved: the quantity is
      // right, there is simply too little of the window recorded to place the
      // answer on the right side of a rung. See `HAND_HANG_MIN_SAMPLES`.
      .filter((m) => (m === 'handUnderElbow' ? m in values : true))
      .map((m) => build(m, values[m], confidenceCtx, serveType, measuredAxis[m]))
      // And whatever `build` declined to invent. Everything above this line
      // names a condition we can see coming and drops the measurement for a
      // stated reason; this catches the ones we cannot — an arithmetic that came
      // out non-finite is a measurement that did not happen, however it got
      // there, and it leaves the report the same way the named ones do.
      .filter((m): m is Metric => m !== undefined)

    // Weighted by confidence, so a measurement the app admits it cannot see
    // properly does not get a full vote in the area's score — and cannot be the
    // weakest link that defines it either.
    const score = chainScore(
      metrics.map((m) => ({ score: m.score, weight: effectiveWeight(m) })),
      metrics.filter((m) => m.confidence >= SOFT_MEASUREMENT),
    )
    return {
      id,
      label: def.label,
      blurb: def.blurb,
      phase: def.phase,
      score,
      status: statusOf(score),
      headline: headlineFor(metrics, def.label, score),
      metrics,
      drill: def.drill,
    }
  })
}

/**
 * One line at the top of each card: the weakest link, or genuine praise.
 *
 * The blunt version of the weakest metric's insight only leads when the area as
 * a whole is weak. An area scoring in the seventies is badged "Solid", and
 * opening it with "your legs stay straight" reads as the card arguing with its
 * own badge — so a decent area names the weak link instead of scolding.
 *
 * Both templates read as plain English around a metric label. They used to be
 * "Sharpen explosive phase next" and "Contact height is the brake": a verb
 * with no article in front of a noun phrase, and a coaching image the voice
 * lint cannot see.
 */
function headlineFor(metrics: Metric[], label: string, areaScore: number): string {
  const weakest = [...metrics].sort((a, b) => a.score - b.score)[0]
  if (!weakest) return ''
  const area = label.toLowerCase()
  const weak = weakest.label.toLowerCase()
  if (weakest.score >= 85) return cue(`Your ${area} holds up. Leave it alone.`)
  if (weakest.score >= 70) return cue(`Solid ${area}. Next to work on: ${weak}.`)
  if (areaScore >= 70) return cue(`Decent ${area}. ${weakest.label} is holding it back.`)
  return weakest.insight
}
