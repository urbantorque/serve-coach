import type { ServeType } from '../storage/prefs'
import { readoutOf, targetOf } from './anatomy'
import { FUNDAMENTALS, metricCopy, type MetricCopy } from './coaching'
import { cue } from './voice'
import {
  LM,
  chainScore,
  clamp,
  elevationFromHorizontal,
  groundPlaneSeparation,
  jointAngle,
  midpoint,
  scoreAgainst,
  sided,
  smooth,
  statusOf,
  stdev,
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

function format(value: number, copy: MetricCopy): string {
  if (copy.unit === 'ms') return `${Math.round(value)} ms`
  const n = value.toFixed(copy.decimals)
  return copy.unit === '°' || copy.unit === '%' || copy.unit === '×' ? `${n}${copy.unit}` : n
}

function build(
  id: string,
  value: number,
  ctx?: ConfidenceContext,
  serveType: ServeType = 'flat',
): Metric {
  const copy = metricCopy(id, serveType)
  if (!copy) throw new Error(`no coaching copy for metric "${id}"`)
  const confidence = ctx ? metricConfidence(id, ctx) : 1
  const v = Number.isFinite(value) ? value : copy.ideal[0]
  const score = scoreAgainst(v, copy.ideal, copy.range)
  const status = statusOf(score)
  const below = v < copy.ideal[0]
  const above = v > copy.ideal[1]

  const insight = below ? copy.insight.low : above ? copy.insight.high : copy.insight.ok
  const needsFix = status === 'fair' || status === 'work'
  const fix = needsFix ? (below ? copy.fix.low : above ? copy.fix.high : undefined) : undefined

  // Both go through the voice filter on the way out, even though the database
  // they come from is linted in the tests. Serve-type copy, anything added
  // later and anything assembled from live data lands here too, and the filter
  // is the only thing every string is guaranteed to pass through.
  const command = cue(insight)
  const order = fix ? cue(fix) : undefined

  return {
    id,
    label: copy.label,
    value: v,
    unit: copy.unit,
    display: format(v, copy),
    readout: readoutOf(id, v),
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
 * Averaging the positions first is what shrinks it: position noise is symmetric
 * and does cancel, and less positional noise means less of the one-sided angle
 * error. Every angle this is used for is read at an extremum of its own motion —
 * deepest knee bend, fullest reach — where the value is locally flat, so a
 * window of ±1 frame costs no real accuracy.
 */
function steadyAngle(
  frames: Frame[],
  idx: number,
  a: number,
  b: number,
  c: number,
  radius = 1,
): number {
  const lo = Math.max(0, idx - radius)
  const hi = Math.min(frames.length - 1, idx + radius)
  const at = (lm: number) => {
    let x = 0
    let y = 0
    let z = 0
    for (let i = lo; i <= hi; i++) {
      x += frames[i].world[lm].x
      y += frames[i].world[lm].y
      z += frames[i].world[lm].z
    }
    const n = hi - lo + 1
    return { x: x / n, y: y / n, z: z / n, visibility: 1 }
  }
  return jointAngle(at(a), at(b), at(c))
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
  // sums reduce to this closed form.
  let sumX = 0
  let sumIX = 0
  const meanI = (n - 1) / 2
  for (let i = lo; i <= hi; i++) {
    const x = frames[i].image[wrist].x
    sumX += x
    sumIX += (i - lo - meanI) * x
  }
  void sumX
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

  const at = (i: number) => frames[clamp(i, 0, frames.length - 1)]
  const fToss = at(keys.toss)
  const fTrophy = at(keys.trophy)
  const fDrop = at(keys.drop)
  const fContact = at(keys.contact)

  /** Height above the court, in body heights. */
  const above = (f: Frame, lm: number) => (groundY - f.image[lm].y) / bodyHeight

  const values: Record<string, number> = {}

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

  // Sideways wobble of the tossing hand on the way up. The straight line from
  // the start of the lift to the release is removed first, so travelling
  // forwards with the body does not read as a wobble.
  {
    const from = clamp(keys.toss - Math.round(frames.length * 0.12), keys.ready, keys.toss - 1)
    const seg = frames.slice(from, keys.toss + 1)
    if (seg.length >= 3) {
      // Smoothed first, so landmark jitter does not masquerade as a wobbly toss.
      const xs = smooth(seg.map((f) => f.image[T.wrist].x), 2)
      const x0 = xs[0]
      const x1 = xs[xs.length - 1]
      const residual = xs.map((x, i) => x - (x0 + ((x1 - x0) * i) / (xs.length - 1)))
      values.tossPathWobble = (stdev(residual) / bodyHeight) * 100
    } else {
      values.tossPathWobble = 0
    }
  }

  /* -------------------------------------------------------------- loading */
  values.kneeBend =
    180 -
    (steadyAngle(frames, keys.trophy, LM.leftHip, LM.leftKnee, LM.leftAnkle) +
      steadyAngle(frames, keys.trophy, LM.rightHip, LM.rightKnee, LM.rightAnkle)) /
      2

  values.hipShoulderSeparation = groundPlaneSeparation(
    fTrophy.world[LM.leftShoulder],
    fTrophy.world[LM.rightShoulder],
    fTrophy.world[LM.leftHip],
    fTrophy.world[LM.rightHip],
  )

  values.shoulderTilt = elevationFromHorizontal(
    fTrophy.world[LM.leftShoulder],
    fTrophy.world[LM.rightShoulder],
  )

  {
    const hipTrophy = midpoint(fTrophy.image[LM.leftHip], fTrophy.image[LM.rightHip])
    const hipContact = midpoint(fContact.image[LM.leftHip], fContact.image[LM.rightHip])
    values.legDrive = (hipTrophy.y - hipContact.y) / bodyHeight
  }

  /* ---------------------------------------------------------------- swing */
  values.dropDepth = (fDrop.image[R.wrist].y - fDrop.image[R.shoulder].y) / bodyHeight
  values.elbowAtDrop = steadyAngle(frames, keys.drop, R.shoulder, R.elbow, R.wrist)
  values.dropToContact = Math.max(0, (fContact.t - fDrop.t) * 1000)

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
  values.totalTime = (fContact.t - at(keys.ready).t) * 1000
  {
    const total = Math.max(1e-3, fContact.t - at(keys.ready).t)
    values.loadRatio = ((fContact.t - fTrophy.t) / total) * 100
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
      .map((m) => build(m, values[m], confidenceCtx, serveType))

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
 */
function headlineFor(metrics: Metric[], label: string, areaScore: number): string {
  const weakest = [...metrics].sort((a, b) => a.score - b.score)[0]
  if (!weakest) return ''
  const area = label.toLowerCase()
  const weak = weakest.label.toLowerCase()
  if (weakest.score >= 85) return cue(`Your ${area} holds up. Leave it alone.`)
  if (weakest.score >= 70) return cue(`Solid ${area}. Sharpen ${weak} next.`)
  if (areaScore >= 70) return cue(`Decent ${area}. ${weakest.label} is the brake.`)
  return weakest.insight
}

/** Smoothed racket-hand height, exposed for the swing-path graph in the UI. */
export function racketPath(frames: Frame[], skel: Skeleton): number[] {
  const R = sided(skel.racket)
  return smooth(
    frames.map((f) => (skel.groundY - f.image[R.wrist].y) / skel.bodyHeight),
    1,
  )
}
