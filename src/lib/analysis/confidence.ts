/**
 * How much to trust each measurement, separately.
 *
 * The report already carries one confidence figure for the whole analysis, and
 * that is not enough, because degradation is local rather than global. Cropped
 * feet make the app fall back to a torso estimate of standing height, and that
 * bends every height ratio at once while leaving every joint angle untouched.
 * Few samples through the swing blur the drop-to-contact timing and nothing
 * else. Rigid legs make the trophy hard to place, which softens the four
 * measurements read at the trophy and no others.
 *
 * Reporting those as crisp numbers with coaching attached is the fastest way to
 * lose a player who knows their own serve: being told to fix a fault the app
 * cannot actually see reads as the app being wrong about everything. So each
 * measurement carries its own confidence, low ones are visibly hedged, and
 * `pickFocus` will not build the headline advice on one.
 */
import { imageXSplitFrom, readImageX } from './axes'
import { LM, clamp, mean, type Side, sided, trunkCoilReading } from './geometry'
import type { Skeleton } from './phases'
import { assessSpatial } from './spatial'
import type { Frame, Metric } from './types'
import { cue } from './voice'

/** Below this a measurement is shown hedged and never becomes the focus. */
export const SOFT_MEASUREMENT = 0.55

/**
 * The measurements read off the tracked ball rather than off the player.
 *
 * They are the two the body-shaped guards below cannot speak for: no landmarks
 * of their own, and nothing in `DEPENDENCIES` that describes the thing that
 * actually failed. Named here so that softening them and explaining why they are
 * soft cannot drift apart.
 */
const BALL_MEASUREMENTS = new Set(['tossPeakHeight', 'contactBelowPeak'])

/**
 * What each measurement rests on beyond the landmarks it reads directly.
 *
 * `scale` — divided by standing height, so it inherits any error in that.
 * `trophy` — read on the trophy frame, so it needs the trophy to be well placed.
 * `swingTiming` — resolved in time across the fastest part of the motion.
 * `depth` — needs the camera to see the player's depth, not just their outline.
 * `handedness` — signed against the racket arm, so the wrong hand mirrors it.
 * `trunkSweep` — signed against the shoulders uncoiling, so it needs that sweep.
 * `imageXAxis` — read along image x, so the camera decides which body axis it is.
 */
type Dependency =
  | 'scale'
  | 'trophy'
  | 'swingTiming'
  | 'depth'
  | 'handedness'
  | 'trunkSweep'
  | 'imageXAxis'

const DEPENDENCIES: Record<string, Dependency[]> = {
  // Toss
  tossPeakHeight: ['scale'],
  tossArmExtension: [],
  releaseHeight: ['scale'],
  tossArmHold: [],
  // Read along image x, which is not a body axis but a mixture of two of them,
  // and the mixture is set by where the phone stood. `imageXAxis` is the cost of
  // that mixture — see `imageXAxisTrust`. Deliberately NOT `depth`, and the
  // difference is worth spelling out because `depth` is the obvious choice and
  // it is wrong here in both directions.
  //
  // `depth` fires on `depthUnreliable`, which spatial.ts sets outside 18–78° at
  // BOTH ends, because it is asking whether the pose model had to infer world z.
  // This measurement never touches world z. Filmed dead side-on at 85°, image x
  // is 0.996 front-to-back: the best reading of that axis this app can get, and
  // `depth` would price it at 0.35 and hedge the card that carries it. Filmed at
  // 44°, where `depth` is perfectly happy, image x is half one axis and half the
  // other and the card is about to name the wrong one — which is the case that
  // actually needs hedging and the flag cannot see at all.
  //
  // That argument was being undone one layer down for a while: `imageXAxisTrust`
  // multiplied by `Spatial.confidence`, which has the same `depth_unreliable`
  // quarter inside it, so the flag rejected here arrived through the back door
  // and this measurement shipped at 0.74 on the framing the app recommends. It
  // now multiplies by `Spatial.roll_confidence`, which is the levelling half
  // alone.
  tossPathWobble: ['scale', 'imageXAxis'],
  // Loading
  kneeBend: ['trophy'],
  // Coil takes its sign from the shoulders uncoiling between the trophy and
  // contact, not from the racket arm — `trunkCoil` derives the direction rather
  // than assuming it, which is what makes the reading identical for a left- and
  // a right-hander. Listing `handedness` here outlived that change by one round
  // and cost the truth twice: an unsure hand demoted a reading it could no
  // longer alter, and the hand explanation then stood in front of the camera
  // one, which was the fault the player could actually have fixed.
  hipShoulderSeparation: ['trophy', 'depth', 'trunkSweep'],
  // Tilt does still mirror with the hand: which shoulder should ride high is
  // decided by which one swings the racket, and nothing in the motion says so.
  shoulderTilt: ['trophy', 'depth', 'handedness'],
  legDrive: ['scale', 'trophy'],
  // Swing
  dropDepth: ['scale'],
  elbowAtDrop: [],
  dropToContact: ['swingTiming'],
  // Empty, and worth spelling out rather than leaving as an absence, because
  // the emptiness is the point of the measurement.
  //
  // Not `scale`: it is a count of frames over a count of frames, so cropped feet
  // and the torso fallback cannot bend it. Not `depth` or `imageXAxis`: it asks
  // only which of two landmarks sits higher in the picture, and that answer is
  // the same from every camera position — across the synthetic rig at 20°, 45°,
  // 60° and 89° of yaw it does not move by a frame. Not `trophy`: the window is
  // anchored at the toss and contact precisely so that a trophy found from the
  // arms cannot move its edges. Not `swingTiming`: that factor prices
  // quantisation across the fast end of the motion, and this share is taken over
  // the whole of it — where the sampling really is too coarse, `metrics.ts`
  // withholds the measurement instead of hedging it, because a share resolved to
  // a fifth of itself is not a soft reading of the right quantity.
  //
  // What is left is the landmark check below, which is the real exposure: the
  // racket hand is behind the body for the frames this measurement is most
  // interested in, and a tracker guessing it there is a tracker guessing the
  // answer. That is priced by visibility over the toss-to-contact window and by
  // `blur`, which applies because `LANDMARKS` names the racket elbow and wrist.
  handUnderElbow: [],
  // Contact
  contactHeight: ['scale'],
  contactBelowPeak: ['scale'],
  armExtension: [],
  bodyExtension: ['scale', 'trophy'],
  contactAhead: ['scale', 'depth'],
  // Rhythm
  totalTime: [],
  loadRatio: ['trophy'],
  syncAtRelease: ['scale'],
}

/** The landmarks each measurement is actually read from, for a visibility check. */
const LANDMARKS: Record<string, (racket: Side) => number[]> = {
  tossPeakHeight: () => [],
  tossArmExtension: (r) => armOf(other(r)),
  releaseHeight: (r) => [sided(other(r)).wrist],
  tossArmHold: (r) => [sided(other(r)).wrist, sided(other(r)).shoulder],
  tossPathWobble: (r) => [sided(other(r)).wrist],
  kneeBend: () => [LM.leftHip, LM.leftKnee, LM.leftAnkle, LM.rightHip, LM.rightKnee, LM.rightAnkle],
  hipShoulderSeparation: () => [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip],
  shoulderTilt: () => [LM.leftShoulder, LM.rightShoulder],
  legDrive: () => [LM.leftHip, LM.rightHip],
  dropDepth: (r) => [sided(r).wrist, sided(r).shoulder],
  elbowAtDrop: (r) => armOf(r),
  dropToContact: (r) => [sided(r).wrist],
  // The racket shoulder is deliberately absent: the reading compares the elbow
  // against the wrist and the wrist against the hip line, and never touches it.
  // Listing it would hedge this measurement for a landmark it does not read —
  // and, through `readsRacketArm`, the elbow and wrist listed here are also what
  // makes a smeared swing cost it confidence, which is correct.
  handUnderElbow: (r) => [sided(r).elbow, sided(r).wrist, LM.leftHip, LM.rightHip],
  contactHeight: (r) => [sided(r).wrist],
  contactBelowPeak: () => [],
  armExtension: (r) => armOf(r),
  bodyExtension: () => [LM.leftAnkle, LM.rightAnkle],
  contactAhead: (r) => [sided(r).wrist, LM.leftHip, LM.rightHip],
  totalTime: () => [],
  loadRatio: () => [],
  syncAtRelease: (r) => [sided(r).wrist, sided(r).shoulder],
}

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left')
const armOf = (s: Side) => [sided(s).shoulder, sided(s).elbow, sided(s).wrist]

/**
 * The stretch of the motion each measurement is actually read over.
 *
 * Visibility used to be averaged across the whole serve for every measurement,
 * which is the wrong question for the ones taken at a single instant. The
 * racket hand disappears behind the body for the handful of frames around the
 * racket drop — that is what a racket drop *is*, and it is the one moment the
 * pose model has to guess a wrist it cannot see. Averaged over a hundred frames
 * of a clearly-filmed serve those ten guesses move the mean by almost nothing,
 * so `dropDepth` arrived as a crisp number built on the least reliable frames
 * in the clip, and a serve whose drop the camera simply could not see was told
 * its racket never fell.
 *
 * Anything not listed is read across the whole motion, which is the honest
 * window for a duration or a path.
 */
const READ_AT: Record<string, (k: Skeleton['keys']) => [number, number]> = {
  tossArmExtension: (k) => [k.toss, k.toss],
  releaseHeight: (k) => [k.toss, k.toss],
  tossArmHold: (k) => [k.toss, k.contact],
  tossPathWobble: (k) => [k.toss, k.contact],
  syncAtRelease: (k) => [k.toss, k.toss],
  kneeBend: (k) => [k.trophy, k.trophy],
  hipShoulderSeparation: (k) => [k.trophy, k.trophy],
  shoulderTilt: (k) => [k.trophy, k.trophy],
  legDrive: (k) => [k.trophy, k.contact],
  dropDepth: (k) => [k.drop, k.drop],
  elbowAtDrop: (k) => [k.drop, k.drop],
  dropToContact: (k) => [k.drop, k.contact],
  // The same window the measurement itself counts over, so the frames whose
  // visibility is priced are the frames the answer was made of. Anchored at the
  // toss rather than the trophy for the reason `metrics.ts` gives: the trophy is
  // one of the keyframes that collapses, and a confidence window that moved with
  // it would be pricing a different stretch of clip than the one measured.
  handUnderElbow: (k) => [k.toss, k.contact],
  contactHeight: (k) => [k.contact, k.contact],
  armExtension: (k) => [k.contact, k.contact],
  bodyExtension: (k) => [k.contact, k.contact],
  contactAhead: (k) => [k.contact, k.contact],
}

/**
 * Frames either side of a keyframe that still describe the same instant.
 *
 * A keyframe is a peak in a smoothed series, so it is never resolved to the
 * exact sample; and one frame the tracker happened to nail, sitting in the
 * middle of a stretch it lost, should not speak for the reading taken there.
 */
const KEYFRAME_SLACK = 2

/**
 * Whether a measurement reads the fast end of the arm holding the racket.
 *
 * The elbow and the wrist, deliberately not the shoulder. Blur is measured on
 * the racket wrist, and what smears is whatever is travelling fast enough to
 * cross several of its own widths between frames — which through a serve is the
 * forearm and the hand. The racket shoulder barely moves, so shoulder tilt and
 * hip–shoulder separation are as readable on a smeared clip as on a clean one
 * and keep their confidence. Derived from `LANDMARKS` rather than listed
 * separately, so a measurement that starts or stops reading the swinging arm
 * cannot end up hedged for a smear it never touched, or crisp through one it did.
 */
function readsRacketArm(id: string, racket: Side): boolean {
  const fast = new Set<number>([sided(racket).elbow, sided(racket).wrist])
  return (LANDMARKS[id]?.(racket) ?? []).some((lm) => fast.has(lm))
}

/**
 * What a reading off a smeared arm is worth, 0–1.
 *
 * Flat until the track is visibly zig-zagging, because an ordinary well-lit
 * phone clip carries some jitter and hedging those would mark most of the app's
 * own footage soft for no reason. Past that it falls fast, and it crosses
 * `SOFT_MEASUREMENT` well before the refusal does — so the band of clips that
 * used to be thrown out arrives visibly hedged, kept out of the headline by
 * `pickFocus`, and down-weighted in the score, rather than either refused
 * outright or reported as though the camera had held still.
 */
const blurTrust = (blur: number) => clamp(1 - blur * 0.85, 0.2, 1)

export interface ConfidenceContext {
  frames: Frame[]
  skel: Skeleton
  /** Samples captured between the racket drop and contact. */
  swingSamples: number
  view: 'side' | 'front-back' | 'angled'
  /** Set for measurements taken from the tracked ball rather than the body. */
  ballConfidence?: number
  /**
   * The spatial pass's own verdict on whether the camera could see depth at all.
   *
   * `view` is a coarse guess from the shoulder span; this is the recovered camera
   * angle checked against the window outside which one axis of the player's depth
   * points at the lens. Both exist because they disagree usefully — `view` calls a
   * clip side-on and shrugs, `assessSpatial` calls the same clip unreadable in z
   * and means it.
   */
  depthUnreliable?: boolean
  /**
   * How smeared the racket hand's track is, 0–1, from `blurOf`.
   *
   * Until this existed the number reached exactly one place in the app — the
   * refusal — so a clip was either thrown out for blur or read as though there
   * were none. That is the one shape of degradation this file was written to
   * replace: it is local, it lands on the measurements taken off the racket arm
   * through the fastest part of the swing, and it leaves a knee angle at the
   * trophy untouched.
   */
  blur?: number
}

/**
 * What a depth measurement is worth once the camera angle has collapsed the axis
 * it is read from.
 *
 * Deliberately below `SOFT_MEASUREMENT` on its own, with nothing else wrong: the
 * point of the flag is that these numbers came out of the pose model's guess at
 * a dimension it could not see, and a number like that has to arrive hedged and
 * barred from the headline even on an otherwise flawless clip. The softer 0.85
 * below is for a merely awkward view, which is a different and survivable thing.
 *
 * Exported because the flaw path has to hedge by the identical amount. A report
 * that hedges a number to 0.35 while the triage layer states the same number as
 * the one thing to fix is the worst pairing the app can produce, and two
 * separate literals would drift into it again.
 */
export const DEPTH_COLLAPSED = 0.35

/**
 * What a coil reading is worth when the uncoiling sweep could not be resolved.
 *
 * Sitting alongside `DEPTH_COLLAPSED` rather than below it because it is the
 * same class of failure: the number was produced, and the thing that gives it a
 * direction was not seen. Low enough to hedge the card and to keep the reading
 * out of both the headline advice and the flaw path — the alternative, a bare
 * zero, reads as "hips and chest locked" and ships a fix and a drill for a
 * trophy that may have coiled perfectly.
 */
export const SWEEP_UNRESOLVED = 0.35

/**
 * Whether the shoulders' uncoiling could be recovered from this clip at all.
 *
 * Asked of the geometry rather than carried on the context, so the confidence
 * and the measurement cannot disagree about one trophy: the same call, on the
 * same frames and the same keyframes, that produced the number being hedged.
 */
const sweepResolved = (ctx: ConfidenceContext): boolean =>
  trunkCoilReading(ctx.frames, ctx.skel.keys.trophy, ctx.skel.keys.contact).resolved

/**
 * What a reading taken along image x is worth once the camera has been asked
 * which body axis that was.
 *
 * Asked of the geometry rather than carried on the context, for the reason
 * `sweepResolved` above is: the same call, on the same frames and the same ready
 * frame, that `metrics.ts` used to decide which axis the card would be written
 * in. The card cannot end up named for one axis and priced against the other.
 *
 * The arithmetic is `readImageX`'s own rather than a copy of it — hence the
 * throwaway 1 for a reading, whose scaled value is discarded. Two literals of
 * `share × spatial confidence` in two files is precisely how the report comes to
 * hedge a number that triage is stating flatly, and that pairing has already
 * cost this app once, in `separationConfidence`.
 *
 * Zero where no axis owns image x, which is the same 45° tie at which
 * `metrics.ts` drops the measurement outright — so this returning zero is a
 * measurement that is not on the card to be hedged, not a card hedged to
 * nothing.
 */
function imageXAxisTrust(ctx: ConfidenceContext): number {
  const split = imageXSplitFrom(
    assessSpatial(ctx.frames, ctx.skel.keys.ready, ctx.skel.bodyHeight),
  )
  if (!split.dominant) return 0
  return readImageX(1, split.dominant, split).confidence
}

/**
 * The least a sign-dependent measurement is worth once the hand is in doubt.
 *
 * Not zero, because the size of the reading survives a mirrored hand — a player
 * who coils hard measures a large coil either way — so it is still worth showing
 * with a caveat rather than withholding. Sitting well below `SOFT_MEASUREMENT`
 * is the point: it keeps a possibly mirrored number out of the headline, which
 * is where an inverted sign stops being a soft number and becomes an instruction
 * to undo the thing the player did right.
 */
const HANDEDNESS_UNKNOWN = 0.3

/**
 * How far the racket hand can be trusted, for the readings that take their sign
 * from it.
 *
 * Two different questions, and `Skeleton` keeps both answers apart precisely so
 * they can be asked separately. With no stated hand, `handednessConfidence` is
 * the detector's own certainty and is the whole story. With a stated hand it is
 * 1 by construction — the player said so — and the evidence that remains is the
 * independent detection kept alongside it: a detector that confidently reports
 * the other hand is the strongest signal available that these two readings are
 * mirrored, and what is left of its certainty is what the sign is worth.
 */
const handednessTrust = (skel: Skeleton): number =>
  clamp(
    skel.detectedRacket !== skel.racket ? 1 - skel.detectionConfidence : skel.handednessConfidence,
    HANDEDNESS_UNKNOWN,
    1,
  )

/**
 * Confidence for one measurement, 0–1.
 *
 * The factors multiply rather than average. Confidence here means "could this
 * number be wrong enough to change the advice", and any one broken input is
 * enough for that — a perfect view of a player whose feet are cropped still
 * gives a bad contact height. Averaging would let three healthy inputs paper
 * over the one that actually matters.
 */
export function metricConfidence(id: string, ctx: ConfidenceContext): number {
  const { skel } = ctx
  let c = 1

  for (const dep of DEPENDENCIES[id] ?? []) {
    if (dep === 'scale' && skel.derivation.scaleFromTorso) {
      // Torso length is about 30% of standing height, so the ratio that recovers
      // height from it multiplies the torso's own error by more than three.
      c *= 0.5
    }
    if (dep === 'trophy' && skel.derivation.trophyFromArms) {
      // The arm fallback puts the trophy in a sensible place, but a place found
      // from a different cue than the one the measurement assumes.
      c *= 0.7
    }
    if (dep === 'swingTiming') {
      // Four samples across a ~150 ms window leaves ±30 ms of quantisation on a
      // measurement whose whole target band is 120 ms wide.
      c *= clamp(ctx.swingSamples / 5, 0.3, 1)
    }
    if (dep === 'depth') {
      // Dead side-on or dead front-on, one axis of the player's depth is
      // collapsed towards the lens and the pose model is inferring it. The
      // shoulder-span view is a proxy for that and the spatial pass measures it
      // outright, so when the measured verdict is in it replaces the proxy
      // rather than compounding it — hip-shoulder coil is read almost entirely
      // from inferred world z, and at 0.85 it still arrived as a crisp number
      // steering the player's headline advice in exactly the camera position the
      // app's own geometry calls unreadable.
      c *= ctx.depthUnreliable ? DEPTH_COLLAPSED : ctx.view !== 'angled' ? 0.85 : 1
    }
    if (dep === 'handedness') {
      // The hand does not shade this reading, it mirrors it. Read against the
      // wrong arm a textbook trophy comes back as its own opposite, scores near
      // the floor, and is promoted to the headline fix — so the player is told
      // to correct the one thing they did well. Nothing else in the report fails
      // that way, which is why the factor is the trust in the hand itself rather
      // than a fixed cost: half-confidence in the sign is half a measurement.
      c *= handednessTrust(skel)
    }
    if (dep === 'imageXAxis') {
      // How much of this number is honestly the axis the card is about to name.
      // It is `gain²` — the share — so it falls off slowly at the ends and fast
      // in the middle: 0.99 side-on at 85°, 0.75 at 60° where a quarter of the
      // reading is the other axis, and half and half at 45°. Near 45 the
      // confidence lands around 0.5, under `SOFT_MEASUREMENT`, so a reading that
      // could be pointing either way is hedged on the card and barred from the
      // headline advice — the only place naming the wrong axis costs a player a
      // practice session.
      //
      // The levelling cost is folded in by `readImageX`, so a yaw recovered
      // through a rolled phone costs this too. What is deliberately NOT folded
      // in is `depth_unreliable`: it was, and it took a quarter off the purest
      // reading this app can get while leaving a genuine corner camera priced
      // within 0.04 of it. See `ImageXSplit.spatial_confidence`.
      c *= imageXAxisTrust(ctx)
    }
    if (dep === 'trunkSweep' && !sweepResolved(ctx)) {
      // The magnitude survives — the trophy was still measured — but the sign
      // came from a sweep that was never resolved, and an unsigned coil is not a
      // coil. Costed rather than blanked for the same reason the hand is: half a
      // sign is half a measurement, and withholding the number entirely tells
      // the player less than showing it hedged.
      c *= SWEEP_UNRESOLVED
    }
  }

  // How well the landmarks this measurement reads were actually seen, over the
  // stretch it is read across — a limb the tracker lost gives a number built
  // partly from its guesses, and it is the frames the number came from that
  // decide how much of it is guesswork.
  const landmarks = LANDMARKS[id]?.(skel.racket) ?? []
  if (landmarks.length) {
    const [readFrom, readTo] = READ_AT[id]?.(skel.keys) ?? [skel.keys.ready, skel.keys.finish]
    const last = ctx.frames.length - 1
    const from = clamp(Math.round(readFrom) - KEYFRAME_SLACK, 0, last)
    const to = clamp(Math.round(readTo) + KEYFRAME_SLACK, from, last)
    const win = ctx.frames.slice(from, to + 1)
    const seen = win.length
      ? mean(win.map((f) => Math.min(...landmarks.map((lm) => f.image[lm]?.visibility ?? 0))))
      : 0
    c *= clamp((seen - 0.25) / 0.45, 0.25, 1)

    // Visibility and blur are the two halves of "was this landmark actually
    // measured", and they fail independently. A hand smeared across a frame is
    // reported at full visibility — the model is obliged to return a wrist and
    // it does — so the check above sees nothing wrong with a track that has
    // stopped describing the motion. Applied only where the smear was measured:
    // `blurOf` reads the racket wrist, so a knee angle at the trophy keeps its
    // confidence and the readings taken off the swinging arm lose theirs.
    if (ctx.blur !== undefined && readsRacketArm(id, skel.racket)) {
      c *= blurTrust(ctx.blur)
    }
  }

  if (ctx.ballConfidence !== undefined && BALL_MEASUREMENTS.has(id)) {
    c *= clamp(ctx.ballConfidence, 0, 1)
  }

  return clamp(c, 0, 1)
}

/**
 * Why a measurement is soft, in words the player can act on.
 *
 * Only ever one reason — the worst one. A list of caveats under a number reads
 * as the app hedging everything, and the player stops reading all of them.
 */
export function softnessReason(id: string, ctx: ConfidenceContext): string | undefined {
  const deps = DEPENDENCIES[id] ?? []

  // Ranked by what each cause actually cost this measurement, rather than by the
  // order they are written in. A fixed order meant whichever guard sat at the
  // top spoke for every soft reading it could plausibly claim: a clip filmed
  // dead side-on, with a hand the detector was unsure of, was explained as the
  // hand — so the player checked a badge that was already right, and the camera
  // position that actually broke the reading was never mentioned. Equal costs
  // keep list order, and the hand leads it because it is the one cause a tap
  // fixes rather than another trip to the court.
  const causes: { cost: number; say: string }[] = []

  if (deps.includes('handedness') && handednessTrust(ctx.skel) < SOFT_MEASUREMENT) {
    causes.push({
      cost: handednessTrust(ctx.skel),
      say:
        ctx.skel.detectedRacket !== ctx.skel.racket
          ? cue('This clip looks like your other hand, so this reading may sit backwards. Check the hand badge before you trust it.')
          : cue('I could not lock which hand holds your racket, so this reading may sit backwards. Set the hand badge yourself.'),
    })
  }
  if (deps.includes('scale') && ctx.skel.derivation.scaleFromTorso) {
    causes.push({
      cost: 0.5,
      say: cue('Your feet sat outside the frame. Read this one loosely and step back next time.'),
    })
  }
  if (deps.includes('swingTiming') && ctx.swingSamples < 4) {
    causes.push({
      cost: clamp(ctx.swingSamples / 5, 0.3, 1),
      say: cue('Your camera caught few frames through the swing. Film in slow motion to sharpen this.'),
    })
  }
  if (deps.includes('trophy') && ctx.skel.derivation.trophyFromArms) {
    causes.push({
      cost: 0.7,
      say: cue('Your legs barely load, so the trophy came from your arms. Read this one loosely.'),
    })
  }
  // The two measurements read off the tracked ball rather than off the body. They
  // carry no landmarks and depend only on `scale`, so every guard above steps
  // over them and the fallback used to tell the player their *body* was unclear —
  // a false statement with a remedy attached, sending them off to refilm their
  // whole serve when what actually failed was picking a small pale ball out of
  // the background.
  if (BALL_MEASUREMENTS.has(id) && (ctx.ballConfidence ?? 1) < SOFT_MEASUREMENT) {
    causes.push({
      cost: clamp(ctx.ballConfidence ?? 1, 0, 1),
      say: cue('Your ball blurred into the background. Read this one loosely and film your whole toss against a plainer backdrop.'),
    })
  }
  // Same shape of lie in the other direction: nothing is wrong with how well the
  // body was seen, the camera simply stood where the depth it needed points at
  // the lens. Worded for both ends of that — dead side-on and dead front-on are
  // one failure, and "stands square on" described only the second, so the
  // commonest way of all to film a serve was told it had done the opposite thing.
  if (deps.includes('depth') && ctx.depthUnreliable) {
    causes.push({
      cost: DEPTH_COLLAPSED,
      say: cue('Your camera sits in line with your stance, so depth here comes from a guess. Film from a corner instead.'),
    })
  }
  // And the same shape again for a reading taken along image x. Not a statement
  // about the body or the tracker: the hand was seen perfectly, the drift is
  // real and the size of it is right. What the camera cannot say is which way
  // the hand went, and since the whole card — the sentence and the drill under
  // it — is written in that direction, the player is owed the reason and the
  // one move that fixes it. Moving round costs them nothing and turns a coin
  // toss into a reading.
  if (deps.includes('imageXAxis') && imageXAxisTrust(ctx) < SOFT_MEASUREMENT) {
    causes.push({
      cost: imageXAxisTrust(ctx),
      say: cue(
        'Your camera sits halfway between side-on and face-on, so I cannot tell which way your toss wandered. Film from further round.',
      ),
    })
  }
  if (deps.includes('trunkSweep') && !sweepResolved(ctx)) {
    causes.push({
      cost: SWEEP_UNRESOLVED,
      say: cue('I could not follow your chest turning up to the ball, so this reading may be off. Read this one loosely.'),
    })
  }

  causes.sort((a, b) => a.cost - b.cost)
  return causes.length ? causes[0].say : cue('Parts of your body blurred here. Read this one loosely.')
}

/** Confidence-weighted, so a measurement the app cannot see does not steer a score. */
export const effectiveWeight = (m: Pick<Metric, 'weight' | 'confidence'>) =>
  m.weight * clamp(m.confidence ?? 1, 0.15, 1)
