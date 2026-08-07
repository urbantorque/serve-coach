import {
  LM,
  argMaxIn,
  argMinIn,
  clamp,
  jointAngle,
  keyVisibility,
  mean,
  median,
  sided,
  smooth,
  other,
  type Side,
} from './geometry'
import { NotAServeError, type Frame, type Phase, type PhaseId } from './types'

export interface Keyframes {
  ready: number
  toss: number
  trophy: number
  drop: number
  contact: number
  finish: number
}

export interface Skeleton {
  racket: Side
  toss: Side
  keys: Keyframes
  /** Standing height in aspect-corrected image units — the scale for every ratio. */
  bodyHeight: number
  /** Image y of the court surface under the player. */
  groundY: number
  /** Shoulder-to-shoulder span in image units, for horizontal ratios. */
  shoulderWidth: number
  handednessConfidence: number
  /**
   * What the detector concluded on its own, kept even when the player has told
   * us which hand they serve with.
   *
   * Overwriting it with the override throws away the one cross-check available:
   * a confident detection that disagrees with a stated preference usually means
   * the clip is of somebody else, or was mirrored by a front camera — both worth
   * saying out loud, and neither visible if the guess is discarded.
   */
  detectedRacket: Side
  detectionConfidence: number
  /**
   * How the two things everything else is built on were actually arrived at.
   *
   * Both have fallbacks, and both fallbacks are correct — but a measurement
   * resting on one is softer than the same measurement resting on a clean
   * reading, and the report has no way to say so unless the detector admits
   * which path it took. See `metricConfidence`.
   */
  derivation: {
    /** Feet were out of frame, so standing height came from the torso. */
    scaleFromTorso: boolean
    /** The knees never loaded, so the trophy was found from the arms. */
    trophyFromArms: boolean
  }
}

/** Image y goes down, so "higher in the air" means a *smaller* y. */
const heightSeries = (frames: Frame[], lm: number, radius = 2) =>
  smooth(frames.map((f) => -f.image[lm].y), radius)

/**
 * Hand height measured against its own shoulder rather than the ground.
 *
 * The toss peak and the racket drop are postures, not places: "arm at full
 * stretch", "racket behind the back". Tracking them in absolute height lets the
 * leg drive corrupt them — a player who holds the tossing arm up while
 * launching has a hand that keeps rising even as the arm folds, which puts the
 * toss keyframe near contact and drags every other keyframe along with it.
 */
const posture = (frames: Frame[], wrist: number, shoulder: number, radius = 2) =>
  smooth(
    frames.map((f) => f.image[shoulder].y - f.image[wrist].y),
    radius,
  )

/**
 * Which hand holds the racket.
 *
 * The tossing arm reaches its peak early — it lifts the ball and then comes
 * down — while the racket arm peaks at contact, right at the end. So the hand
 * whose highest point happens *later* is the racket hand. Height alone would
 * not separate them: both arms extend nearly full stretch.
 */
function detectHandedness(frames: Frame[]): { racket: Side; confidence: number } {
  const left = posture(frames, LM.leftWrist, LM.leftShoulder)
  const right = posture(frames, LM.rightWrist, LM.rightShoulder)
  const lPeak = argMaxIn(left, 0, frames.length - 1)
  const rPeak = argMaxIn(right, 0, frames.length - 1)

  const racket: Side = lPeak > rPeak ? 'left' : 'right'
  const separation = Math.abs(lPeak - rPeak) / Math.max(1, frames.length)

  // A clear serve separates the two peaks by a decent slice of the clip. When
  // they nearly coincide we are guessing, and the UI offers a manual override.
  const confidence = clamp(separation / 0.12, 0, 1)
  return { racket, confidence }
}

/**
 * Walk backwards from the toss to where the motion actually began: the last
 * moment the tossing hand was still low and quiet.
 */
function findReady(tossIdx: number, tossHeight: number[], fps: number): number {
  const limit = Math.max(0, tossIdx - Math.round(2.0 * fps))
  const rest = median(tossHeight.slice(limit, tossIdx + 1))
  const peak = tossHeight[tossIdx]
  // 12% of the way up from the resting level counts as "started"
  const threshold = rest + (peak - rest) * 0.12

  for (let i = tossIdx; i > limit; i--) {
    if (tossHeight[i] <= threshold) return i
  }
  return limit
}

/**
 * Pull an index found on a heavily smoothed series back onto the real peak.
 *
 * Smoothing is what stops landmark jitter from choosing our keyframes, but it
 * also drags an asymmetric peak — and contact is very asymmetric, rising fast
 * and falling slowly — a frame or two late. Searching a light-smoothed series
 * in a small neighbourhood recovers the true position without reopening the
 * door to noise. Pass a series whose maximum is the event.
 */
function sharpen(series: number[], idx: number, radius = 2): number {
  const lo = Math.max(0, idx - radius)
  const hi = Math.min(series.length - 1, idx + radius)
  let best = lo
  for (let i = lo; i <= hi; i++) if (series[i] > series[best]) best = i
  return best
}

/**
 * A knee-angle trough shallower than this is not a load, it is tracker noise.
 *
 * A player who genuinely loads bends 35–60°, and even a token dip is a good 15°.
 * Below ~8° the series is flat to within its own jitter and its minimum lands
 * wherever the noise happened to be lowest.
 */
const MIN_KNEE_TROUGH = 8

/**
 * The trophy: deepest leg load — unless the legs never loaded.
 *
 * Taking the knee-angle minimum is right for a player who bends, and useless for
 * one who does not. On rigid legs the series is flat to within its jitter, so
 * `argMin` returns wherever the noise dipped, and measurements taken at the
 * trophy — hip–shoulder separation, shoulder tilt, how long the tossing arm
 * stays up, the share of the motion spent after the trophy — are then read at an
 * essentially random moment. That is the worst possible population to be
 * unreliable for: a club player with stiff legs is exactly who this app is for,
 * and "you barely bend your knees" is the most common thing it has to say.
 *
 * So when the legs give no signal, the arms are asked instead. The racket hand
 * rises to a local peak above its shoulder as the racket is cocked, then falls
 * away into the drop — that peak is the trophy position, and it is there whether
 * or not the knees did anything.
 */
function findTrophy(
  kneeAngles: number[],
  racketPosture: number[],
  toss: number,
  from: number,
  beforeContact: number,
): { index: number; fromArms: boolean } {
  const window = kneeAngles.slice(from, beforeContact + 1)
  const trough = window.length ? Math.max(...window) - Math.min(...window) : 0
  if (trough >= MIN_KNEE_TROUGH) {
    return { index: argMinIn(kneeAngles, from, beforeContact), fromArms: false }
  }

  // Bounded above by where the racket bottoms out, so the search cannot run past
  // the drop and up the far side into contact, which is the highest the hand
  // gets in the whole motion. Searching from the toss rather than from a trophy
  // we do not yet have is safe here: before the toss the racket hangs by the
  // hip, which is lower than the drop, and that is the one thing that would
  // capture this minimum.
  const provisionalDrop = argMinIn(racketPosture, toss, beforeContact)
  if (provisionalDrop <= toss) return { index: toss, fromArms: true }
  return { index: argMaxIn(racketPosture, toss, provisionalDrop), fromArms: true }
}

/** Enforce a strictly readable order without letting one bad pick eat the rest. */
function orderKeys(raw: Keyframes, n: number): Keyframes {
  const order: PhaseId[] = ['ready', 'toss', 'trophy', 'drop', 'contact', 'finish']
  const out = { ...raw }
  let prev = -1
  for (const k of order) {
    const v = clamp(Math.round(out[k as keyof Keyframes]), 0, n - 1)
    out[k as keyof Keyframes] = Math.max(v, prev)
    prev = out[k as keyof Keyframes]
  }
  return out
}

/**
 * Locate the six keyframes of the serve.
 *
 * Contact is the anchor — it is the single most reliable event in the clip
 * (the racket hand's highest point of the whole motion). Everything else is
 * found by searching backwards from it inside windows sized in real seconds,
 * so the detector behaves the same at 30 fps and at 120 fps.
 */
export function detectServe(frames: Frame[], fps: number, forceRacket?: Side): Skeleton {
  if (frames.length < 8) {
    throw new NotAServeError('That clip is too short to read.', [
      'Record from a couple of steps before the toss through to the landing.',
      'About 3 seconds is plenty.',
    ])
  }

  const guess = detectHandedness(frames)
  // Which hand holds the racket decides every keyframe after it, so an override
  // has to happen here rather than being patched onto the result.
  const racket = forceRacket ?? guess.racket
  const confidence = forceRacket ? 1 : guess.confidence
  const tossSide = other(racket)
  const R = sided(racket)
  const T = sided(tossSide)

  // Contact is a place — the highest the racket hand gets — so it is the one
  // event measured in absolute height. Everything else is a posture.
  const racketHeight = heightSeries(frames, R.wrist)
  const racketPosture = posture(frames, R.wrist, R.shoulder)
  const tossPosture = posture(frames, T.wrist, T.shoulder)

  // Light-smoothed counterparts, used only to sharpen and time the two events
  // whose exact moment matters.
  const racketHeightSharp = heightSeries(frames, R.wrist, 1)
  const racketPostureSharp = posture(frames, R.wrist, R.shoulder, 1).map((v) => -v)

  const contact = sharpen(racketHeightSharp, argMaxIn(racketHeight, 0, frames.length - 1))

  const sec = (s: number) => Math.max(1, Math.round(s * fps))
  const beforeContact = Math.max(0, contact - 1)

  // Toss: tossing arm at full stretch above its shoulder, searched back from contact.
  const toss = argMaxIn(tossPosture, Math.max(0, contact - sec(2.0)), beforeContact)

  // Trophy: deepest leg load. Both knees averaged so a side-on view — where the
  // far leg is often occluded — still reads sensibly. Found from the knees
  // alone, which keeps it independent of anything the arms are doing.
  // Smoothed harder than the hand signals are. Knee angle is derived from three
  // separately jittering points, so it is the noisiest series here, and its
  // minimum is broad — the player sits in the load for a moment rather than
  // touching it instantly. A sharp signal like contact would be dulled by this
  // much smoothing; a slow one loses nothing and stops noise from dragging the
  // trophy onto the edge of its search window.
  const kneeAngles = smooth(
    frames.map((f) =>
      mean([
        jointAngle(f.world[LM.leftHip], f.world[LM.leftKnee], f.world[LM.leftAnkle]),
        jointAngle(f.world[LM.rightHip], f.world[LM.rightKnee], f.world[LM.rightAnkle]),
      ]),
    ),
    Math.max(2, Math.round(fps / 12)),
  )
  const trophyFrom = Math.max(0, toss - sec(0.2))
  const found = findTrophy(kneeAngles, racketPosture, toss, trophyFrom, beforeContact)
  const trophy = found.index

  // Racket drop: hand at its lowest relative to the shoulder — behind the back.
  //
  // Bounded below by the trophy, not by a fixed lookback. Early in the motion
  // the racket simply hangs by the hip, which is *further* below the shoulder
  // than the drop ever gets; searching a fixed window before contact therefore
  // finds whatever happens to sit at the window's edge, and which one wins
  // changes with the sampling rate. The drop is a local minimum between the
  // racket being cocked at the trophy and it arriving at the ball.
  const drop = sharpen(racketPostureSharp, argMinIn(racketPosture, trophy, beforeContact))

  const ready = findReady(toss, tossPosture, fps)
  const finish = clamp(contact + sec(0.5), 0, frames.length - 1)

  const keys = orderKeys({ ready, toss, trophy, drop, contact, finish }, frames.length)

  // --- scale references, measured while the player is still on the ground ----
  const readyFrame = frames[keys.ready]
  const stance = frames.slice(keys.ready, Math.max(keys.ready + 1, keys.trophy))

  // Medians, not extremes.
  //
  // Every height in this report is a ratio against this one number, so a bias
  // here bends all of them at once. The largest and smallest samples of a
  // jittery series are, by construction, the ones noise pushed furthest, so
  // min/max stretches the body a little more the worse the tracking gets and
  // quietly shrinks every measurement with it.
  //
  // The feet stay put for the whole stance, so their median is the ground. The
  // head does not — the player sinks into the load — so its median across the
  // same window would measure them mid-crouch. Standing height has to be read
  // while they are still standing, which is the opening of the motion.
  let groundY = median(
    stance.flatMap((f) => [f.image[LM.leftAnkle].y, f.image[LM.rightAnkle].y]),
  )
  const upright = stance.slice(0, Math.max(3, Math.round(stance.length * 0.3)))
  const headY = median(upright.map((f) => f.image[LM.nose].y))
  // nose sits at roughly 93% of standing height
  let bodyHeight = (groundY - headY) / 0.93

  const shoulderWidth = median(
    stance.map((f) => Math.abs(f.image[LM.leftShoulder].x - f.image[LM.rightShoulder].x)),
  )

  // Are the feet actually in shot?
  //
  // Asking the question this way round matters. A foot outside the frame is not
  // a foot the tracker declines to place — it places it anyway, somewhere near
  // the edge of the picture, and flags it as unseen. So a clip with the feet cut
  // off yields a perfectly finite standing height built on a ground line that is
  // wherever the crop happens to fall, and every height in the report is then
  // divided by it. Checking only for a degenerate number never catches that,
  // because the number is not degenerate — it is just wrong.
  const anklesSeen = median(
    stance.flatMap((f) => [
      f.image[LM.leftAnkle].visibility ?? 0,
      f.image[LM.rightAnkle].visibility ?? 0,
    ]),
  )

  let scaleFromTorso = false
  if (anklesSeen < 0.5 || !Number.isFinite(bodyHeight) || bodyHeight <= 0.02) {
    // Torso length is about 30% of standing height. Less precise than head to
    // heel, but it rests only on landmarks that are in frame — and the ground
    // then follows from the head rather than from a guess at where the feet are.
    const torso = Math.abs(readyFrame.image[LM.leftShoulder].y - readyFrame.image[LM.leftHip].y)
    const fromTorso = torso / 0.3
    if (Number.isFinite(fromTorso) && fromTorso > 0.02) {
      bodyHeight = fromTorso
      groundY = headY + bodyHeight * 0.93
      scaleFromTorso = true
    }
  }

  assertPlausible(frames, keys, racketHeight, bodyHeight, {
    // The other arm's swing, so a clip rejected for having no swing in it can
    // tell the difference between "this is not a serve" and "you have the wrong
    // hand selected" — which look identical from the racket arm alone.
    otherArm: heightSeries(frames, T.wrist),
    racket,
    stated: forceRacket !== undefined,
  })

  return {
    racket,
    toss: tossSide,
    keys,
    bodyHeight,
    groundY,
    shoulderWidth: Math.max(shoulderWidth, bodyHeight * 0.04),
    handednessConfidence: confidence,
    detectedRacket: guess.racket,
    detectionConfidence: guess.confidence,
    derivation: { scaleFromTorso, trophyFromArms: found.fromArms },
  }
}

/**
 * Reject clips that are not a serve rather than reporting confident nonsense
 * about them. Every check here corresponds to something a real serve must do.
 */
function assertPlausible(
  frames: Frame[],
  keys: Keyframes,
  racketHeight: number[],
  bodyHeight: number,
  context: { otherArm: number[]; racket: Side; stated: boolean },
): void {
  const filming = [
    'Film from the side or from behind, 4–5 metres back.',
    'Keep the whole body in frame from feet to racket.',
    'Hold the phone steady — prop it on the fence if you can.',
  ]

  if (keys.contact <= keys.ready + 1) {
    throw new NotAServeError('I could not find a serve in that clip.', filming)
  }

  const visible = mean(frames.slice(keys.ready, keys.finish + 1).map(keyVisibility))
  if (visible < 0.4) {
    throw new NotAServeError('I lost track of the player.', [
      'Make sure only one person is in frame.',
      ...filming,
    ])
  }

  // A serve lifts the racket hand from somewhere around the hip to well above
  // the head. Measured from the start of the motion rather than from the racket
  // drop, so that a player with a shallow drop still gets a report about their
  // shallow drop instead of being told this was not a serve.
  const swing = (racketHeight[keys.contact] - racketHeight[keys.ready]) / bodyHeight
  if (swing < 0.5) {
    // Before calling this "not a serve", check the other arm. If *that* one
    // swept from hip to overhead, this is a serve — we were simply watching the
    // wrong arm, which is what a mirrored front-camera clip or a wrong answer to
    // "which hand" looks like from here. Telling a player their serve is not a
    // serve when it plainly is, is the most disheartening thing this app can do,
    // and the fix is one tap away once they know what to tap.
    const otherSwing =
      (Math.max(...context.otherArm) - context.otherArm[keys.ready]) / bodyHeight
    if (otherSwing >= 0.5) {
      const other = context.racket === 'right' ? 'left' : 'right'
      throw new NotAServeError(
        `This looks like a ${other}-handed serve.`,
        context.stated
          ? [
              `You have the app set to ${context.racket}-handed, but the racket arm in this clip is the ${other}. Switch it and try again.`,
              'If your phone filmed with the front camera it may have mirrored the picture, which flips which hand you appear to serve with.',
            ]
          : [
              `Tap the hand badge on the report to switch to ${other}-handed, and I will re-read it.`,
              'Front cameras often mirror the picture, which flips which hand you appear to serve with.',
            ],
      )
    }

    throw new NotAServeError('That does not look like a serve.', [
      'The clip needs a full service motion — toss, load, swing and contact.',
      ...filming,
    ])
  }
}

const PHASE_COPY: Record<PhaseId, { label: string; caption: string }> = {
  ready: { label: 'Ready', caption: 'Stance set, weight balanced, hands together' },
  toss: { label: 'Toss', caption: 'Tossing arm at full stretch, ball released' },
  trophy: { label: 'Trophy', caption: 'Deepest leg load, racket cocked, chest to the sky' },
  drop: { label: 'Racket drop', caption: 'Racket head falls behind the back' },
  contact: { label: 'Contact', caption: 'Full extension, highest point of the swing' },
  finish: { label: 'Finish', caption: 'Swing across the body, landing inside the court' },
}

export function buildPhases(frames: Frame[], keys: Keyframes): Phase[] {
  return (Object.keys(PHASE_COPY) as PhaseId[]).map((id) => {
    const frame = keys[id as keyof Keyframes]
    return {
      id,
      label: PHASE_COPY[id].label,
      caption: PHASE_COPY[id].caption,
      frame,
      t: frames[frame].t,
    }
  })
}
