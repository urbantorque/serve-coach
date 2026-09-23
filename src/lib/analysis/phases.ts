import {
  LM,
  argMaxIn,
  argMinIn,
  clamp,
  jointAngle,
  mean,
  median,
  sided,
  smooth,
  other,
  type Side,
} from './geometry'
import { NotAServeError, type Frame, type Phase, type PhaseId } from './types'

/*
 * The three numbers that define the ruler every height in this report is a
 * ratio of.
 *
 * Exported rather than kept as locals because `detectServe` is no longer the
 * only place a standing height is built: `standingHeight` in framing/judge.ts
 * builds one over a live preview, and while these were literals in here it had
 * to copy all three and carry a comment explaining where they came from. Two
 * copies of a ruler is one ruler that can drift — and a viewfinder measuring a
 * player against a slightly different body than the analyser uses would pass
 * framing the analysis then hedges.
 *
 * Exporting them does NOT make the two rulers identical, and nothing here
 * should be read as claiming it does. `detectServe` takes its head reading
 * across the opening ~30% of the stance only (see the comment above `upright`)
 * because the player sinks into the load; the preview has no motion to slice
 * and takes the median across its whole window. Same constants, same recipe,
 * different window — which is exactly right for a player standing still and
 * diverges the moment one is walking into shot.
 */

/**
 * Where the nose sits as a fraction of standing height.
 *
 * Nose rather than crown because MediaPipe has no crown landmark. Anything
 * derived from a raw nose-to-ankle span instead is about 7.5% short of standing
 * height, which `estimateYaw` then divides a shoulder span by: at a true 18
 * degrees of yaw that pushes its arccos argument past 1 and the angle comes
 * back as 0.
 */
export const NOSE_SHARE_OF_HEIGHT = 0.93

/**
 * How much of the picture an ankle has to be visible in before the ground line
 * under it is believed.
 *
 * The reason is the comment above `anklesSeen` below: a foot outside the frame
 * is not a foot the tracker declines to place, it is one it places near the
 * edge of the picture and flags unseen. The height that results is perfectly
 * finite and wrong, so a finiteness check alone never catches it.
 */
export const ANKLES_SEEN_FLOOR = 0.5

/** Torso length as a share of standing height — the fallback ruler when the feet are out of shot. */
export const TORSO_SHARE_OF_HEIGHT = 0.3

/** Below this a standing height is a degenerate number, not a small player. */
export const MIN_STANDING_HEIGHT = 0.02

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
   * When the three peak-defined events happened, between samples — see
   * `refineExtremum`. Every timing measurement reads these; everything
   * positional still reads the sampled frame at `keys`, which is a real
   * observation where an interpolated pose would not be.
   */
  times: { toss: number; drop: number; contact: number }
  /**
   * How the things everything else is built on were actually arrived at, and —
   * for the drop — whether the event was ever there to arrive at.
   *
   * Each fallback below is correct, and none of them is a failure. But a
   * measurement resting on one is softer than the same measurement resting on a
   * clean reading, and one of them means a measurement has nothing under it at
   * all; the report has no way to say either unless the detector admits which
   * path it took. See `metricConfidence` and the `dropToContact` filter in
   * `measure`.
   */
  derivation: {
    /** Feet were out of frame, so standing height came from the torso. */
    scaleFromTorso: boolean
    /** The knees never loaded, so the trophy was found from the arms. */
    trophyFromArms: boolean
    /**
     * The racket never fell behind the back, so the drop landed on the trophy
     * frame rather than on an event of its own. See `MIN_DROP_SEPARATION`.
     */
    dropOnTrophy: boolean
    /**
     * The trophy landed on the toss frame rather than on a load of its own.
     *
     * The companion to `dropOnTrophy` at the other end of the same collapse, and
     * it has to be recorded separately because the two do not always travel
     * together: a player can load their legs properly and still never drop the
     * racket. Postures read at the trophy survive this — the trunk was in *some*
     * shape at that instant and reporting it is honest — but anything measuring
     * the trophy's *position in time* is then describing the toss instead.
     */
    trophyOnToss: boolean
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
 *
 * `limit` is how far back is worth looking, handed in as an index rather than
 * derived here from a frame rate — see `clockOf` for why that distinction is not
 * cosmetic on a clip the tracker lost frames from.
 */
function findReady(tossIdx: number, tossHeight: number[], limit: number): number {
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
/**
 * The moment of a peak, between samples.
 *
 * `pose/rate.ts` has long said sub-frame timing "is recovered analytically —
 * see refineExtremum", and nothing of that name existed: every keyframe was an
 * integer sample on a series smoothed over ±1 sample. On the rig that put
 * drop-to-contact **+31 ms long at 30 fps, +45 ms at 24** (16 seeds, landmark
 * noise 0.008), on a band 120 ms wide — the smoothing drags each peak toward
 * its slow side, and contact is about as lopsided as a peak gets: the wrist
 * arrives fast and falls away slowly.
 *
 * A parabola through the top three samples was tried first and made it worse
 * (+37 ms): it assumes a symmetric peak, so it slides the same way. This is a
 * tent instead — the rising line through the two samples before the peak, the
 * falling line through the two after, and the moment they cross — which is
 * exact for a peak whose two sides have different slopes. Same rig, same
 * noise: **+10 ms at 30 fps, +15 at 24, +5 at 60**, RMS 35 → 14 ms at 30 fps.
 *
 * Fitted on real timestamps (the samples are filed at the time each seek
 * actually reached), held between the two neighbouring samples, and the
 * sample's own time returned wherever a side is not rising or falling as a
 * peak's must — an edge, a plateau, noise on a flank.
 */
export function refineExtremum(series: number[], times: number[], i: number): number {
  const at = times[i]
  if (i < 2 || i > series.length - 3) return at
  const [ta, tb, tc, td] = [times[i - 2], times[i - 1], times[i + 1], times[i + 2]]
  const [ya, yb, yc, yd] = [series[i - 2], series[i - 1], series[i + 1], series[i + 2]]
  if (![ya, yb, yc, yd].every(Number.isFinite) || !(ta < tb && tb < at && at < tc && tc < td)) return at
  const rise = (yb - ya) / (tb - ta)
  const fall = (yd - yc) / (td - tc)
  if (!(rise > 0) || !(fall < 0)) return at
  const t = (yc - yb + rise * tb - fall * tc) / (rise - fall)
  return Math.min(tc, Math.max(tb, t))
}

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

/**
 * Closer to the trophy than this and the drop is the same instant under a second
 * name, not a fast racket.
 *
 * A serve that has a drop in it bottoms out around 150 ms before contact off a
 * trophy around 400 ms before, so the two events are a quarter of a second apart
 * even on a hurried club motion. Eighty milliseconds is well under that and
 * still wide enough to swallow the couple of frames `sharpen` may nudge the drop
 * by at 30 fps, the slowest camera the app will read — so the test answers "were
 * these two events found separately" rather than "did the smoothing move one of
 * them".
 */
const MIN_DROP_SEPARATION = 0.08

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
 * The clip's own clock, for every span below that is meant to mean seconds.
 *
 * The frames do not arrive on the grid the nominal frame rate describes. A
 * sample the pose model found nobody in is dropped and the survivors are
 * re-indexed compactly — `extractFrames` does exactly that — so the array is
 * continuous while the timestamps on it are not. Sizing a search window as
 * `seconds × fps` therefore counts *surviving samples*, not time: on a clip that
 * lost a third of its detections a window meant to hold two seconds holds nearly
 * three, and every keyframe below is hunted for in the wrong stretch of the
 * serve. It fails worst on the footage this app exists for, and it fails
 * silently, because a window in the wrong place still returns an answer.
 *
 * So `at` walks the timestamps themselves, and `rate` is how densely the samples
 * actually landed rather than how densely the camera claimed to shoot. `fps`
 * remains the answer for a clip carrying no usable clock at all — a hand-built
 * fixture, or a run of frames all stamped the same instant — which is the one
 * case where the nominal rate is the better guess.
 */
function clockOf(frames: Frame[], fps: number) {
  const last = frames.length - 1
  const span = last > 0 ? frames[last].t - frames[0].t : 0
  const timed = Number.isFinite(span) && span > 0
  return {
    /** The index `seconds` of real time from `from`; negative walks backwards. */
    at(from: number, seconds: number): number {
      const origin = clamp(Math.round(from), 0, Math.max(0, last))
      const step = seconds < 0 ? -1 : 1
      // A window has to reach at least one sample past the frame it starts from,
      // or there is nothing inside it to search. This is what the old
      // `Math.max(1, …)` was protecting, and it still matters at low frame rates.
      const atLeastOne = clamp(origin + step, 0, Math.max(0, last))
      if (!timed) {
        const bySamples = Math.max(1, Math.round(Math.abs(seconds) * fps))
        return clamp(origin + step * bySamples, 0, Math.max(0, last))
      }
      const target = frames[origin].t + seconds
      let out = origin
      for (let i = origin + step; i >= 0 && i <= last; i += step) {
        if (step > 0 ? frames[i].t > target : frames[i].t < target) break
        out = i
      }
      return out === origin ? atLeastOne : out
    },
    /** Samples per second as they actually arrived, for spans measured in samples. */
    rate: timed ? last / span : fps,
  }
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
  const tossPostureSharp = posture(frames, T.wrist, T.shoulder, 1)

  const contact = sharpen(racketHeightSharp, argMaxIn(racketHeight, 0, frames.length - 1))

  const clock = clockOf(frames, fps)
  const beforeContact = Math.max(0, contact - 1)

  /*
   * Toss: tossing arm at full stretch above its shoulder, searched back from
   * contact — and then sharpened, for the reason contact and the drop are.
   *
   * It was the one keyframe of the six found on a hard-smoothed series with
   * nothing pulling it back onto the real peak, and it was measurably the one
   * that moved with the frame rate: its mean landed at 1.0333 / 1.0175 /
   * 1.0056 s across 30 / 50 / 120 fps, a 27.8 ms spread, monotonically earlier
   * the more frames there were. Every other keyframe sat inside 12.5 ms and
   * contact inside 0.7.
   *
   * The mechanism is the one `sharpen` already exists to undo, and reading it
   * off the frame rate is what made it visible: a radius counted in SAMPLES
   * spans 167 ms of clip at 30 fps and 42 ms at 120, and a smooth that wide
   * drags an asymmetric peak — the tossing arm rises fast and settles slowly —
   * further at the coarser rate. So the drag is a function of the phone rather
   * than of the serve.
   *
   * Worth stating because it refines the rule the suite carries from the trunk
   * pair: a sample-counted window over a POSITION is safe from the noise
   * amplification a derivative suffers, and is not safe from a frame-rate
   * dependent BIAS where the feature it is smoothing is asymmetric. Noise and
   * bias fail differently, and only one of them shows up in a deviation.
   */
  const toss = sharpen(tossPostureSharp, argMaxIn(tossPosture, clock.at(contact, -2.0), beforeContact))

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
    // Sized off how densely the samples actually arrived, not off the nominal
    // rate: a radius counted in samples covers more of the serve the more of
    // them are missing, and this is the one series smoothed hard enough for
    // that to move the trophy.
    Math.max(2, Math.round(clock.rate / 12)),
  )
  const trophyFrom = clock.at(toss, -0.2)
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

  const ready = findReady(toss, tossPosture, clock.at(toss, -2.0))
  /*
   * The finish, as a share of this player's own swing rather than half a second.
   *
   * R71's audit called out four windows in this file as sized in file seconds
   * and R33 refuted three of them: `ready`, `toss` and `trophy` are *search*
   * windows, which only have to be generous, and narrowing them by tempo would
   * make a fast serve harder to find for no gain.
   *
   * THIS ONE IS A PLACEMENT, NOT A WINDOW, and it decides where the landing gets
   * read. Fixed, it lands at very nearly the same clock time on every clip while
   * the swing it follows does not: measured on the rig, contact→finish holds at
   * 0.42–0.44 s while trophy→contact runs 0.320 s on a quick motion and 0.600 s
   * on a slow one. **The same instant is 1.31 swings after contact for one
   * player and 0.73 for another** — so two people's landings are read at
   * different points of their own follow-throughs, and the reading is compared
   * across them as though it were the same moment.
   *
   * One swing after contact, which is a coincidence worth stating rather than
   * hiding: at the rig's default motion the old fixed offset and this share land
   * on the same frame, so nothing about a default clip moves. That is not why
   * the number was chosen — it is what makes the change auditable, the same
   * discipline `pinpointSlide` shipped under.
   *
   * MEASURED IN SECONDS AND PLACED THROUGH THE CLOCK, and the first version of
   * this was not. `contact - trophy` is a count of *frames*, and the whole
   * reason `clockOf` exists is that a frame index is not a time on a clip whose
   * samples did not arrive evenly — a third of the frames dropped, and the same
   * count spans half again as much serve. The existing "keyframes land at the
   * same real times when a third of the frames are lost" check caught it at
   * 60 ms of drift on the bursty fixture, which is what that check is for.
   */
  const swingSeconds = frames[contact].t - frames[trophy].t
  const finish = clock.at(contact, swingSeconds)

  const keys = orderKeys({ ready, toss, trophy, drop, contact, finish }, frames.length)

  // Did the drop happen at all?
  //
  // On straight legs with no drop — the commonest shape this app will ever be
  // shown — every step above collapses onto one frame. The knees give no trough,
  // so the trophy is looked for in the arms; the racket hand never falls below
  // where it hung at the toss, so `findTrophy` hands back the toss itself; and
  // the drop search, bounded below by that trophy, finds its minimum sitting on
  // its own lower bound. Two keyframes, one instant.
  //
  // None of that is the wrong thing to do. A trophy at the toss is the best
  // guess available, and `dropDepth` read there correctly reports a racket that
  // never fell. What has no meaning is the *interval* between the two, which is
  // now the toss-to-contact stretch wearing the drop's name. Recorded here
  // because it is a fact about how these keyframes were found; re-deriving it
  // from the keyframes downstream would be guessing at this function's reasoning
  // from its output.
  const dropOnTrophy = frames[keys.drop].t - frames[keys.trophy].t < MIN_DROP_SEPARATION
  const trophyOnToss = frames[keys.trophy].t - frames[keys.toss].t < MIN_DROP_SEPARATION

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
  let bodyHeight = (groundY - headY) / NOSE_SHARE_OF_HEIGHT

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
  if (
    anklesSeen < ANKLES_SEEN_FLOOR ||
    !Number.isFinite(bodyHeight) ||
    bodyHeight <= MIN_STANDING_HEIGHT
  ) {
    // Torso length is about 30% of standing height. Less precise than head to
    // heel, but it rests only on landmarks that are in frame — and the ground
    // then follows from the head rather than from a guess at where the feet are.
    const torso = Math.abs(readyFrame.image[LM.leftShoulder].y - readyFrame.image[LM.leftHip].y)
    const fromTorso = torso / TORSO_SHARE_OF_HEIGHT
    if (Number.isFinite(fromTorso) && fromTorso > MIN_STANDING_HEIGHT) {
      bodyHeight = fromTorso
      groundY = headY + bodyHeight * NOSE_SHARE_OF_HEIGHT
      scaleFromTorso = true
    }
  }

  assertPlausible(keys, racketHeight, bodyHeight, {
    // The other arm's swing, so a clip rejected for having no swing in it can
    // tell the difference between "this is not a serve" and "you have the wrong
    // hand selected" — which look identical from the racket arm alone.
    otherArm: heightSeries(frames, T.wrist),
    racket,
    stated: forceRacket !== undefined,
  })

  const ts = frames.map((f) => f.t)
  const times = {
    toss: refineExtremum(tossPostureSharp, ts, keys.toss),
    drop: refineExtremum(racketPostureSharp, ts, keys.drop),
    contact: refineExtremum(racketHeightSharp, ts, keys.contact),
  }

  return {
    racket,
    toss: tossSide,
    keys,
    times,
    bodyHeight,
    groundY,
    shoulderWidth: Math.max(shoulderWidth, bodyHeight * 0.04),
    handednessConfidence: confidence,
    detectedRacket: guess.racket,
    detectionConfidence: guess.confidence,
    derivation: { scaleFromTorso, trophyFromArms: found.fromArms, dropOnTrophy, trophyOnToss },
  }
}

/** The lowest a hand-height series gets up to and including `end`. */
function lowestBefore(heights: number[], end: number): number {
  let low = heights[0] ?? 0
  for (let i = 1; i <= Math.min(end, heights.length - 1); i++) {
    if (heights[i] < low) low = heights[i]
  }
  return low
}

/**
 * Reject clips that are not a serve rather than reporting confident nonsense
 * about them. Every check here corresponds to something a real serve must do.
 */
function assertPlausible(
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

  // Nothing between the start of the motion and contact leaves every window the
  // measurements are taken over empty, so there is genuinely nothing to read.
  // A single frame between them is thin rather than impossible: `triage` scores
  // that as `too_few_frames` and offers the numbers anyway, which is a better
  // answer than a dead end for a player whose phone simply sampled slowly.
  if (keys.contact <= keys.ready) {
    throw new NotAServeError('I could not find a serve in that clip.', filming)
  }

  // Tracking that comes and goes across the swing used to be refused outright
  // here, below 0.4. `triage` already computes this same mean over this same
  // window and rejects it at 0.45 — softly, with the reason on screen and the
  // numbers available behind it. Two thresholds on one statistic meant the
  // worse clips got the worse treatment: 0.40–0.45 was handed the override,
  // and anything below it a screen it could not get past. The soft one is the
  // one worth keeping, so this now leaves the judgement to it.

  // A serve lifts the racket hand from somewhere around the hip to well above
  // the head.
  //
  // Measured from the lowest the hand sits *before the toss*, not from its
  // height at `ready`. `ready` is found by walking back to where the tossing
  // hand was last quiet, and on a clip that opens with the player already in
  // their rhythm it lands after the racket hand has begun to lift — which
  // shortens the swing by exactly the quantity being tested for. A recorded
  // serve measured 0.47 that way against a true rise of 0.59, and was told it
  // was not a serve.
  //
  // Bounded at the toss rather than run over the whole clip so the racket drop,
  // which is lower still and comes after it, can never become the reference:
  // measuring from there would fail a player with a shallow drop for having
  // one, and telling them their serve is not a serve is the worst thing this
  // app can do with a shallow drop.
  const restHeight = lowestBefore(racketHeight, keys.toss)
  const swing = (racketHeight[keys.contact] - restHeight) / bodyHeight
  if (swing < 0.5) {
    // Before calling this "not a serve", check the other arm. If *that* one
    // swept from hip to overhead, this is a serve — we were simply watching the
    // wrong arm, which is what a mirrored front-camera clip or a wrong answer to
    // "which hand" looks like from here. Telling a player their serve is not a
    // serve when it plainly is, is the most disheartening thing this app can do,
    // and the fix is one tap away once they know what to tap.
    // Read the same way as the swing above, and for the same reason: anchored
    // at `ready` this shares the fault it is meant to rescue, so the one clip
    // that most needs the other arm checked is the one where the check cannot
    // fire.
    const otherSwing =
      (Math.max(...context.otherArm) - lowestBefore(context.otherArm, keys.toss)) / bodyHeight
    if (otherSwing >= 0.5) {
      // A serve was found — on the other side. That is a fact about which arm
      // was watched, not about the clip, so it is handed back tagged rather
      // than shown: `runAnalysis` reads the clip again against this hand and
      // the player never learns any of it happened. If the app was told the
      // wrong hand, `assessQuality` still says so and the badge on the report
      // still flips it; being told your serve is not a serve, when the app has
      // just proved to itself that it is, helps nobody.
      const swung = other(context.racket)
      const err = new NotAServeError(`This looks like a ${swung}-handed serve.`, [
        `Tap the hand badge on the report to switch to ${swung}-handed, and I will re-read it.`,
        'Front cameras often mirror the picture, which flips which hand you appear to serve with.',
      ])
      err.suggestedHand = swung
      throw err
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

export function buildPhases(
  frames: Frame[],
  keys: Keyframes,
  times?: Partial<Record<PhaseId, number>>,
): Phase[] {
  return (Object.keys(PHASE_COPY) as PhaseId[]).map((id) => {
    const frame = keys[id as keyof Keyframes]
    return {
      id,
      label: PHASE_COPY[id].label,
      caption: PHASE_COPY[id].caption,
      frame,
      t: times?.[id] ?? frames[frame].t,
    }
  })
}
