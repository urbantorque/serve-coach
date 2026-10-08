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
import { LM, clamp, jointAngle, mean, sided, trunkCoilReading } from './geometry'
import { imageXSplitFrom, readImageX } from './axes'
import { DEPTH_COLLAPSED, SWEEP_UNRESOLVED } from './confidence'
import { assessSpatial, viewFromCourtYaw } from './spatial'
import { readStance, type Stance } from './stance'
import { readTossPlacement, type TossPlacement } from './tossPlacement'
import { readHitch, type Hitch } from './hitch'
import {
  palmNormalSeries,
  palmSkyElevation,
  peakAbsIn,
  peakTimeInside,
  planarSpeedSeries,
  pronationBetween,
  rateOf,
  refinedPeakTime,
  riseSpeedSeries,
  sampleAt,
  sampleRadius,
  smoothF32,
  spineSeries,
  timeline,
  yawSeries,
} from './kinematics'
import { evaluateFlaws, MIN_EVIDENCE, type FlawFinding, type SignalReading } from './flaws'
import { inferTier, nextTier, clampTier } from './tiers'
import { ANKLES_SEEN_FLOOR, type Skeleton } from './phases'
import type { Frame } from './types'
import type { BallFlight } from '../vision/ballTrack'
import type { ServeType } from '../storage/prefs'

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
  /**
   * The kinetic chain: when each link of the body peaked, relative to contact.
   *
   * DATA ONLY. Nothing downstream grades any of this, no flaw is named from it,
   * and none of it reaches `signals` — so it cannot vote on a tier, pair into an
   * injury flag or become an instruction. That is a decision, not an oversight,
   * and the reasons per link are in `UNCALIBRATED` in `tiers.ts`.
   *
   * A link is `null` when its peak was not in view: the landmark was not seen
   * well enough, or the peak sat on the edge of the search window and is
   * therefore the window rather than an event. Never a zero, never a default.
   *
   * Required here and absent from every report saved before it existed. `schema`
   * is deliberately still 1: nothing reads it, and bumping it would say the
   * stored shape had become unreadable when what actually happened is that it
   * gained a field no consumer touches. A future reader of a stored diagnosis
   * has to guard this, the way `db.ts normalise` guards every other field added
   * after the fact — which is the reason it is written down here rather than
   * left for that reader to discover.
   */
  chain: ChainTiming
  /**
   * How far the racket shoulder is externally rotated at the trophy.
   *
   * DATA ONLY, on exactly the same terms as `chain` above and for the same
   * reasons: nothing grades it, no flaw is named from it, it never reaches
   * `signals`, so it cannot vote on a tier, pair into an injury flag or become
   * an instruction. `UNCALIBRATED` in `tiers.ts` carries why.
   *
   * It is here because it is the joint angle a racket drop is actually made of,
   * and until now the engine only ever approximated it —
   * `shoulder_load_no_drop` pairs drop depth against contact height rather than
   * reading a rotation. The rig can now pose one (`trophyExternalRotation`), and
   * a sweep against the ensemble every `NOISE_FLOOR` came from puts the
   * deviation flat at 9.4–11.8° across a 48° span, which is gradeable territory.
   *
   * What is NOT settled is the zero. The angle is read against the trunk's up
   * vector, which is a choice, and that choice is why a neutral arm reads 19.7°
   * rather than 0° and why the reading tracks a real rotation at a gain of about
   * 0.8. A band set on the absolute today would be a band set on an arbitrary
   * reference frame. So it is measured, stored, and said to nobody.
   *
   * `null` when the trophy arm was not seen well enough, and — separately —
   * when the forearm lies too close to the upper arm's own axis for its
   * direction around that axis to mean anything. That second refusal is not
   * defensiveness: it is the one geometry this measure genuinely cannot do, and
   * without it a nearly-straight arm returns a confident angle made of noise.
   */
  externalRotation: ExternalRotation
  /**
   * How far the body finished across its own feet, half a second after contact.
   *
   * DATA ONLY, on exactly the same terms as `chain` and `externalRotation`:
   * nothing grades it, no flaw is named from it, it never reaches `signals`.
   * `UNCALIBRATED` in `tiers.ts` carries why at length.
   *
   * THE FIRST THING IN THIS ENGINE THAT READS PAST CONTACT. Every other window
   * ends at the ball, which meant the whole tail of the swing was observed and
   * measured by nobody — and a serve that lands collapsed sideways loads the
   * same lower back the lumbar flag watches, plus the front knee, entirely after
   * the ball has gone.
   *
   * `null` when the landing could not be read, never a zero: a zero here is a
   * player who finished square, and a player nobody could see did not finish
   * square. THREE refusals — the landmarks unseen, the feet out of shot, and the
   * clip having ended before the landing happened. The last two are the ones
   * that will fire in life: a clip framed to show a racket often does not show a
   * foot, and a player who stops recording as the ball leaves never filmed the
   * landing at all. That third one was missing when this field first shipped,
   * and a truncated clip reported a confident zero — the exact sentence above,
   * violated by its own author.
   */
  landing: LandingBalance
  /**
   * How far the hip centre rose between the trophy and contact, in body heights.
   *
   * DATA ONLY, on the same terms as `chain`, `externalRotation` and `landing`:
   * nothing grades it, no flaw is named from it, it never reaches `signals`.
   *
   * THE HALF `legs_peak_ms` COULD NOT MEASURE. That entry times the leg drive
   * and says nothing about its size — the same peak whether the player drives or
   * not — which is why it is uncalibrated and why no amount of footage would
   * rescue it. This is the amplitude, and it completes the pair with knee bend
   * at the trophy, which is already graded: how far the legs loaded, and how
   * much of that became upward motion.
   *
   * READ FROM IMAGE Y ALONE, which is what makes it worth having. Vertical is
   * vertical for every camera this app accepts, and the rig confirms it: swept
   * against `contactHipHeight` the reading is **identical to four decimals at
   * 45° and at 82°**. Nothing else in this engine is that indifferent to where
   * the phone stood.
   *
   * ITS ZERO IS 0.0457, NOT ZERO, and anything built on this has to know that.
   * A player who never leaves the ground still rises: they straighten out of the
   * trophy knee bend, and the hips travel with them. Same shape as
   * `LandingBalance.offset`, whose zero is 0.0035 for a different reason.
   */
  legDrive: LegDrive
  /**
   * Platform or pinpoint (`readStance`, D3.2): context like the serve type,
   * never graded. Absent from a corner, where the feet's projection moves with
   * the hips, and on reports from before it existed.
   */
  stance?: Stance
  /**
   * The racket hand over the shoulder at the knee trough (D3.5). Data only, on
   * the same terms as `legDrive`; absent when the trophy came from the arms,
   * and on reports from before it existed.
   */
  armCock?: ArmCock
  /**
   * The landing read from each foot (`readLandingFeet`, D3.3). Data only;
   * absent whenever `landing` refused.
   */
  landingFeet?: LandingFeet
  /**
   * The body held still at the trophy (`readHitch`, D3.4), against the
   * player's own peak speed and motion. Data only; absent below 60 fps.
   */
  hitch?: Hitch
  /**
   * Where the toss went from the front foot (`readTossPlacement`, D3.1): ahead
   * of it from the side, across it from behind. Data only; absent from a
   * corner and on reports from before it existed.
   */
  tossPlacement?: TossPlacement
  flaws: FlawFinding[]
  /** What the pass cost, so a slow device can be seen rather than guessed at. */
  cost: { frames: number; series: number; ms: number }
}

/**
 * The landing, from each foot (D3.3).
 *
 * `LandingBalance.offset` reads the hips against the ankle CENTRE, which R64
 * found loses up to half a fall to a back leg that swings through with it. Read
 * from the front ankle instead — the foot a serve lands on — the fall is the
 * same at every back-foot setting. And from contact rather than from the ready,
 * since a fall across the front foot does not begin until contact: that is
 * what removes the stance from the baseline, the thing R64 was blocked on.
 */
export interface LandingFeet {
  /**
   * How far the hips moved off the front ankle between contact and the finish,
   * in body heights. Unsigned, as `LandingBalance.offset` is, for its reason.
   * Read in full from behind the server and about a third of it from the side.
   */
  front: number
  /**
   * How far the back foot followed the hips, 0 planted to 1 travelling with
   * them, against the front foot's own shift. Absent when the hips did not move
   * off the front foot far enough to follow.
   */
  backFollow: number | null
}

/** The racket hand at the knee trough — see `Diagnosis.armCock`. */
export interface ArmCock {
  /** Hand over the racket shoulder, in body heights; higher is cocked earlier. */
  ratio: number
  confidence: number
}

/**
 * One link of the chain: when it peaked, and how much of it the camera saw.
 *
 * `ms` is relative to contact, negative before it, so the links read as an
 * ordering straight off the object. `confidence` is the same 0–1 the signals
 * carry and is inherited the same way: how well the landmarks underneath this
 * link were seen, and nothing else.
 *
 * Nothing else deliberately. A camera angle that biases WHEN a link peaks is a
 * systematic every clip at that angle shares, not doubt about one reading, and
 * spending it as confidence deleted whole links at one angle while leaving the
 * bias in place at every other — see the note above `linkAt`. Systematics are
 * recorded in `UNCALIBRATED`, which is also what stops these being graded.
 */
export interface ChainLink {
  ms: number | null
  confidence: number
}

/**
 * The racket shoulder's external rotation at the trophy, and how much of the arm
 * the camera actually saw.
 *
 * Same shape as `ChainLink` on purpose — a nullable measurement beside the
 * confidence it was read at — because it is the same kind of thing: a number the
 * engine takes and does not grade.
 */
export interface ExternalRotation {
  /**
   * Degrees, measured as the forearm's rotation about the shoulder→elbow axis,
   * against the trunk's up projected onto the same plane. Larger is laid further
   * back. `null` where it could not be read, never a zero — a zero here would be
   * a neutral shoulder, and a shoulder nobody measured is not neutral.
   */
  deg: number | null
  /** Mean visibility of the four landmarks it is built from, 0–1. */
  confidence: number
  /**
   * How much of the forearm was actually perpendicular to the upper arm, 0–1.
   *
   * The conditioning of the reading, kept rather than thrown away, because it is
   * what decides whether the angle means anything: an arm folded straight has
   * almost nothing perpendicular to rotate, so its direction round the axis is
   * whatever the noise says. Below `MIN_ROTATION_LEVER` the angle is refused,
   * and this number is why.
   */
  lever: number
}

/**
 * Where the body finished relative to its own feet, and whether the feet were
 * in shot to say.
 *
 * Same shape as `ChainLink` and `ExternalRotation` for the same reason: a
 * nullable measurement beside the confidence it was read at, which the engine
 * takes and does not grade.
 */
export interface LandingBalance {
  /**
   * Distance from the hip centre to the ankle centre along image x at the
   * finish, as a share of body height. Small is finishing over your feet.
   *
   * SMALL RATHER THAN ZERO, and the difference is a property of the reading
   * rather than of the player: this is a magnitude, so landmark noise about a
   * true zero folds into a positive number instead of cancelling. A serve that
   * finishes dead square reads 0.0035 on the depth-aware ensemble, not 0.0000,
   * and that floor is stable — 0.0035 to 0.0040 across every ensemble size from
   * 24 seeds to 240. Anything ever built on this has to treat 0.0035 as its
   * zero. It is not subtracted here, because the engine returns what it measured
   * and a correction that made a clean landing read zero would be hiding the
   * one number a reader needs to calibrate against.
   *
   * UNSIGNED, on the same principle `externalRotation` is. A signed form would
   * say which way the body fell, and which way image x points depends on which
   * side of the player the camera was — so the sign would be a fact about the
   * filming rather than the serve. Nothing here knows which direction is worse
   * anyway, and a number carrying a direction nobody can interpret invites being
   * read as one.
   *
   * A share of body height rather than pixels, because that is the only ruler in
   * this engine that survives a player standing further from the phone.
   */
  offset: number | null
  /** Mean visibility of the four landmarks it is built from, 0–1. */
  confidence: number
  /**
   * How long after contact the finish keyframe actually landed, in seconds.
   *
   * Kept for the reason `ExternalRotation.lever` is kept: it is a refusal this
   * reading makes on its own account, and a reader has to be able to see which
   * one fired. `keys.finish` is *meant* to be half a second past contact, but
   * `clockOf.at` clamps to the last frame, so a clip the player stopped
   * recording early puts the finish wherever the footage ran out.
   */
  secondsAfterContact: number
  /**
   * How well the two ankles were seen at the finish, 0–1.
   *
   * Kept rather than folded into `confidence`, because it is the refusal that
   * decides this reading in practice and a reader needs to see which one fired.
   * A foot outside the frame is not a foot the tracker declines to place — it is
   * one it places near the edge of the picture and flags unseen, so the offset
   * that results is perfectly finite and wrong. `ANKLES_SEEN_FLOOR` in
   * `phases.ts` is the same bar the ground line is held to, for the same reason.
   */
  anklesSeen: number
}

/**
 * The chain, proximal to distal, in the order a serve is supposed to fire.
 *
 * Five links and two provenances, which is the whole finding of this pass.
 * `legs`, `elbow` and `wrist` are read from image x and y — coordinates the
 * camera measured. `hips` and `shoulders` are yaw angles recovered from
 * MediaPipe's inferred world z. Filming one identical synthetic serve
 * twenty-four times moves the first group by 0.5 to 7.5 ms and the second by
 * 13.0 and 46.0 — and `hip_lead_ms`, the difference of that second pair and the
 * only thing graded out of it, by 49.9. The derivation is in
 * `__tests__/depth.test.ts`; the point is that no ordering claim resting on the
 * trunk pair can be resolved finely and the ones resting on the image plane have
 * no band to be resolved against.
 */
export interface ChainTiming {
  legs: ChainLink
  hips: ChainLink
  shoulders: ChainLink
  elbow: ChainLink
  wrist: ChainLink
  /**
   * Peak leg drive to peak racket-hand speed: the whole chain's span, in ms.
   *
   * The one interval whose ends are both read from the picture plane, and the
   * best-conditioned number this pass produces — deviation 7.8 ms across the
   * ensemble, and its mean moves 0.7 ms across camera angles from 20° to 88°.
   * Null when either end is.
   *
   * It is still not graded, and `UNCALIBRATED.chain_span_ms` says why at length.
   * The short version is that it scales with how long the whole motion took —
   * 156 ms on a 1.7 s serve against 102 ms on a 1.1 s one — so a band in
   * milliseconds would grade a deliberate server as faulty, and the rig cannot
   * produce a serve whose span differs from its own phase schedule once that is
   * divided out. A well-measured quantity with nothing to compare it against.
   */
  span_ms: number | null
  /**
   * The same span as a share of how long the motion took. Dimensionless.
   *
   * The repair `UNCALIBRATED.chain_span_ms` names, carried out. `span_ms` grades
   * tempo whether it means to or not: the same serve served slowly has a longer
   * chain, so a band in milliseconds marks a deliberate server as having no
   * chain at all. Divided by the motion's own duration that goes away, and what
   * is left is the shape of the sequence rather than its clock.
   *
   * Divided by `contact − ready`, in seconds, which is `metrics.ts`'s
   * `totalTime` in different units and deliberately not a second definition of
   * how long a serve took.
   *
   * This does NOT make it gradable, and `UNCALIBRATED.chain_span_ratio` says so
   * separately from its sibling — the two entries fail for different reasons and
   * collapsing them would lose the one that footage can fix. Being scale-free is
   * what a quantity needs before a band could exist; it is not a band. Nothing
   * in this repo knows what this number should be for a club player.
   */
  span_ratio: number | null
}

export interface DiagnoseOptions {
  /** The player's own rating, when they have given one. */
  tier?: number
  /** The tracked ball, when the pixels gave one up. Two signals need it. */
  ball?: BallFlight
  /**
   * The serve the player said they hit, which moves the bands the card moves
   * for it (`SERVE_TYPE_SHIFT`). Flat when unsaid, as on the card.
   */
  serveType?: ServeType
  /**
   * Frame width over height, so the ball's width-normalised x can be set
   * against landmarks, whose x is in frame heights. One when unsaid.
   */
  aspect?: number
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
 *
 * Eleven since the chain arrived: the leg-drive rise and the elbow and wrist
 * planar speeds. The three of them are read from image x and y, so none of them
 * needs the world landmarks the two trunk yaws are built from.
 */
const SERIES_COUNT = 11

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

/**
 * The smoothing window the chain is measured through, as a radius in SECONDS.
 *
 * Given in time rather than in samples, which is the defect `UNDER_RESOLVED`
 * names against `hip_lead_ms` and points at as the first thing to try: three
 * samples is 100 ms of clip at 30 fps and 25 ms at 120, so a timing taken
 * through one is partly a fact about the phone.
 *
 * The proof used to be in this pass's own output, because the two trunk links
 * still used the old fixed three while the three new ones used this: across
 * 30 / 50 / 120 fps on one identical serve the fixed-sample pair deviated
 * 42.2 / 53.3 / 98.1 ms and 20.0 / 27.6 / 38.8 — worse the more frames they
 * were given — while the leg, elbow and wrist links deviated 5.3 / 7.5 / 4.8,
 * 1.1 / 0.7 / 2.5 and 0.6 / 0.5 / 2.3. Flat, and an order of magnitude down at
 * the legs and two at the hand.
 *
 * That comparison is gone, because the trunk pair now has a time-based window
 * too — a wider one, for reasons that are its own: see `TRUNK_WINDOW_SECONDS`.
 * The three links here are unchanged to the decimal by that work, which is the
 * check that it touched only what it meant to.
 *
 * HOW TO REPRODUCE ANY NUMBER BELOW, because a provenance nobody can re-run is
 * a recorded number wearing a derivation's clothes — the defect this file was
 * caught in once already, and `repeatability.ts`'s own header names it. The
 * frame-rate axis is a parameter: `realise({}, 5, SEEDS, fps)` and read
 * `chainDeviations`. The radius axis is not, and deliberately is not — a
 * test-only override on `DiagnoseOptions` would be a production door held open
 * for a table. It is reproduced by setting this constant to the value in
 * question, re-running the same call at each of the three rates, and putting it
 * back. Every figure in the two paragraphs below was taken that way, on the
 * tree as it stands.
 *
 * Ninety rather than forty or sixty, chosen against the ensemble rather than by
 * eye. The leg-drive link's deviation across those same three frame rates runs
 * 20.3 / 20.0 / 20.7 ms at a 40 ms radius, 6.9 / 12.2 / 12.4 at 60, and
 * 5.3 / 7.5 / 4.8 at 90.
 *
 * Two costs, both stated because neither is zero. The peaks are dragged later —
 * the racket hand reads -77.2 ms at a 40 ms radius and -82.3 at 90, a quarter
 * of a frame at 50 fps, paid by every clip equally so no ordering moves. And
 * the chain span's *mean* is less flat in frame rate here than at 60:
 * 123.2 / 119.8 / 117.9 ms, a 5.3 ms spread, against 123.3 / 120.3 / 120.8 and
 * a 3.0 ms one. That spread is bought with the leg deviation cut from 12.2 to
 * 7.5 at the rate most clips arrive at, which is the right way round for a
 * number nothing grades and everything compares.
 *
 * Not widened past this. At a 120 ms radius the deviations barely improve
 * (4.7 / 5.3 / 5.0) while the span's frame-rate spread doubles to 10.3 ms — and
 * the window is a radius, so 120 ms spans 240 against the roughly 400 ms of a
 * club player's whole trophy-to-contact stretch. Past here the smoothing starts
 * averaging one link's peak into its neighbour's, which is the one failure that
 * would make the chain look *more* ordered than it is.
 */
export const CHAIN_WINDOW_SECONDS = 0.09

/**
 * The smoothing window the TRUNK PAIR is measured through, as a radius in
 * seconds — hip yaw and shoulder yaw, and so `hip_lead_ms` and `arming_the_ball`.
 *
 * Separate from `CHAIN_WINDOW_SECONDS` above rather than shared with it, because
 * the two groups fail differently and were tuned against different evidence. The
 * three image-plane links are already conditioned to within a couple of
 * milliseconds and 90 ms was chosen for them with its own costs written down;
 * these two are recovered from MediaPipe's inferred world z, which is an order
 * of magnitude noisier, and they want a wider window for it. One constant would
 * have had to be wrong for one of the pairs.
 *
 * WHAT THIS FIXED. The window was three SAMPLES, applied twice, so its span in
 * time shrank as the frame rate rose — 100 ms of clip at 30 fps, 25 ms at 120 —
 * and the signal got *worse* the more frames it was given, which is the
 * signature of a derivative locking onto noise rather than a resolution limit a
 * better phone would fix. `UNDER_RESOLVED.hip_lead_ms` named that defect and
 * named this as the change to try. It was the right diagnosis. Deviation of
 * `hip_lead_ms` over one identical serve, 60 seeds, `realise({}, 5, seeds(60),
 * fps)`:
 *
 *     window            30 fps    50 fps    120 fps
 *     three samples      57.9      67.3      110.0
 *     0.09 s             57.9      64.6       49.1
 *     0.15 s             43.3      50.1       35.6
 *
 * The 30 fps column is the check that the mechanism is understood rather than
 * merely improved: at 30 fps a 90 ms radius rounds to three samples, so that row
 * must be identical to the baseline, and it is. Frame rate is no longer the
 * dominant axis — what is left over is the depth error on world z, which no
 * window can smooth away and which is why these two are still far behind the
 * links read off the picture plane.
 *
 * CONFIRMED AT A HUNDRED AND TWENTY SEEDS, which is a check this constant asked
 * for and then nearly failed to get. It was chosen on sixty, on the reasoning
 * that twenty-four was too few — and a later round found a case where sixty was
 * also too few, `spine_lean_deg` reading 3.633 at sixty against 4.48 at both a
 * hundred and twenty and two hundred and forty. So the question was reopened
 * against this constant's own evidence:
 *
 *     radius     30 fps    50 fps    120 fps
 *     0.09 s      56.37     59.87      51.00
 *     0.15 s      51.01     49.16      41.95
 *
 * Unanimous again, and that is the point rather than the margins. This constant
 * was never chosen on one number landing near a boundary — it was chosen on
 * three frame-rate columns all pointing the same way, which is a far more robust
 * shape than a single deviation crossing a flip point, and it is why this
 * survived the recheck when the spine floor did not.
 *
 * A HUNDRED AND FIFTY, and the twenty-four-seed ensemble the rest of this engine
 * is tuned on could not have chosen it. Swept at 24 seeds the deviation reads
 * 45.4 / 47.2 / 55.5 at 0.09 against 34.5 / 52.5 / 32.5 at 0.12 and
 * 34.5 / 49.9 / 42.4 at 0.15 — non-monotonic, no column agreeing with another,
 * which is what an estimator of a standard deviation looks like when it is
 * itself made of 24 draws. At 60 seeds the three columns agree and 0.15 wins
 * every one of them. This is the one figure in this file taken at sixty rather
 * than twenty-four, and the reason is written here rather than left to be
 * rediscovered by the next person who re-runs the cheap sweep and gets a
 * different answer.
 *
 * NOT WIDENED PAST THIS, and the danger is specific. A radius of 150 ms spans
 * 300 ms against roughly 400 ms of trophy-to-contact, so the hip and shoulder
 * peaks are already being asked not to average into one another — and two peaks
 * blurred together would shrink the lead between them, which reads as a serve
 * being *better* sequenced than it is. That is the one failure mode here that
 * would be invisible in a deviation and harmful on a court. It is checked rather
 * than assumed: the detector still separates the whole arming dial, 0% named on
 * a clean serve against 92% on a grossly armed one, and the rates rise
 * monotonically through the two in between. See `UNDER_RESOLVED.hip_lead_ms` for
 * that table.
 *
 * Reproduced the same way `CHAIN_WINDOW_SECONDS` is: by setting this constant to
 * the value in question, re-running, and putting it back. No test-only override,
 * for the reason that note gives — a production door held open for a table.
 */
const TRUNK_WINDOW_SECONDS = 0.15

/**
 * How far either side of the swing the chain's peaks are looked for, in seconds.
 *
 * The lower body starts unwinding while the racket is still going back, so the
 * search opens before the trophy — 80 ms, matching the four frames at 50 fps
 * the rotation window above has always used, restated in time for the same
 * reason `CHAIN_WINDOW_SECONDS` is.
 *
 * It closes *after* contact, which the rotation window does not, because the
 * distal links legitimately peak later than the proximal ones and the racket
 * hand is still accelerating into the ball. A window that stopped at contact
 * would clip the wrist's peak against its own edge on any clip whose contact
 * frame landed early, and `peakTimeInside` would then drop the link — losing
 * the best-conditioned reading in the pass to a keyframe being one frame out.
 */
const CHAIN_LOOKS_BACK = 0.08
const CHAIN_LOOKS_ON = 0.04

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
  //
  // The window is `TRUNK_WINDOW_SECONDS`, in time rather than in samples. It
  // used to be a fixed three samples, which is the defect the whole of that
  // constant's note is about — and which is why `hip_lead_ms` spent this long
  // under a floor that could only tell gross arming from none.
  const trunkRadius = sampleRadius(t, TRUNK_WINDOW_SECONDS)
  const hipRate = smoothF32(
    rateOf(smoothF32(yawSeries(frames, LM.leftHip, LM.rightHip), trunkRadius), t),
    trunkRadius,
  )
  const shoulderRate = smoothF32(
    rateOf(smoothF32(yawSeries(frames, LM.leftShoulder, LM.rightShoulder), trunkRadius), t),
    trunkRadius,
  )

  // From a little before the trophy — the lower body starts unwinding while the
  // racket is still going back — to contact. Opening the window earlier would
  // let the wind-up's own rotation compete with the strike for the peak.
  const from = clamp(keys.trophy - 4, 0, frames.length - 1)
  const to = clamp(keys.contact, 0, frames.length - 1)
  const samples = to - from + 1

  // The indices are kept, not just the refined times, because `chain` has to be
  // able to tell a peak from a window edge and `peakAbsIn` returns an index
  // either way — see `trunkLink` below.
  const hipPeakAt = peakAbsIn(hipRate, from, to)
  const shoulderPeakAt = peakAbsIn(shoulderRate, from, to)
  const hipPeakT = refinedPeakTime(hipRate, t, hipPeakAt)
  const shoulderPeakT = refinedPeakTime(shoulderRate, t, shoulderPeakAt)
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

  /* --- where the camera stood ------------------------------------------- */
  // Recovered here rather than passed in: `analyze` reads the same camera above
  // this call, but a diagnosis taken straight off frames — a stored clip, a
  // test — must not silently lose what depends on it because its caller had
  // nothing to hand over. Two things depend on it: the coil hedge below, and
  // which body axis the toss drift is.
  const spatial = assessSpatial(frames, keys.ready, bodyHeight, skel)
  const imageX = imageXSplitFrom(spatial)

  /* --- the chain, proximal to distal ------------------------------------ */
  /*
   * Five links, two provenances, and the point of measuring them together.
   *
   * The pair above — hip yaw and shoulder yaw — is the whole of what this
   * engine used to call sequencing, and both are recovered from MediaPipe's
   * inferred world z. This adds the three the camera can actually see: the leg
   * drive as the hips rising in the frame, and the elbow and racket hand as
   * planar speeds off image x and y. Measured on the same twenty-four-seed
   * ensemble that produced every other figure in this engine, at 50 fps with
   * modelled depth error — `__tests__/depth.test.ts` prints this table and
   * fails if either group crosses into the other's range — the peak times move:
   *
   *     link        read from        deviation    band it would be graded on
   *     legs        image y             7.5 ms    none — see UNCALIBRATED
   *     hips        world z            46.0 ms    hip_lead_ms, floor 76
   *     shoulders   world z            13.0 ms    hip_lead_ms, floor 76
   *     elbow       image x, y          0.7 ms    none — see UNCALIBRATED
   *     wrist       image x, y          0.5 ms    none — see UNCALIBRATED
   *
   * Two orders of magnitude between the two provenances, on the same clip, from
   * the same tracker, in the same pass. That is the finding, and it is why the
   * three new links are built the way they are rather than as five more yaws.
   *
   * The trunk pair reads better here than it did when this table was written —
   * 53.3 and 27.6 — because it has since been moved onto a time-based smoothing
   * window of its own (`TRUNK_WINDOW_SECONDS`). The gap between the provenances
   * narrowed and did not close, and the three image-plane figures did not move
   * at all, which is what says the remaining distance belongs to world z rather
   * than to how either group was filtered.
   *
   * It buys no new flaw, and the honesty of that is the other half of the work.
   * A repeatable measurement is necessary and nowhere near sufficient: a number
   * that holds still across noise but does not move when the fault appears is a
   * constant with a units label. Swept against the rig's own arming dial — the
   * shoulders firing 20, 60 and 120 ms early — every image-plane link here reads
   * within 0.2 ms of its clean value, because the rig implements arming as hip
   * yaw timing and nothing else. That is a fact about the rig, not a finding
   * about serves, and it is stated as such in `UNCALIBRATED`. Either way there
   * is nothing here a detector could have been validated against.
   *
   * One number worth carrying forward for whoever revisits this with footage:
   * the chain span divided by the motion's own duration comes out 0.092, 0.088
   * and 0.092 on serves taking 1.1, 1.35 and 1.7 seconds. Scale-free to within
   * 5%, which is what a band would have to be written in — and what nobody has
   * a value for.
   */
  const chainRadius = sampleRadius(t, CHAIN_WINDOW_SECONDS)
  const chainFrom = clamp(keys.trophy - secondsToFrames(t, CHAIN_LOOKS_BACK), 0, frames.length - 1)
  const chainTo = clamp(keys.contact + secondsToFrames(t, CHAIN_LOOKS_ON), 0, frames.length - 1)

  // Both hips together: one leg driving is a step across, two is the drive.
  const legsSpeed = riseSpeedSeries(frames, [LM.leftHip, LM.rightHip], bodyHeight, chainRadius)
  const elbowSpeed = planarSpeedSeries(frames, R.elbow, bodyHeight, chainRadius)
  const wristSpeed = planarSpeedSeries(frames, R.wrist, bodyHeight, chainRadius)

  /*
   * What the camera angle costs a planar link, and why it is not a confidence.
   *
   * This used to multiply the elbow and wrist links by `axes.ts`'s `share` —
   * how much of an image-x reading is honestly one named body axis. That was
   * the wrong quantity applied to the wrong kind of number, and it deleted
   * readings rather than hedging them. Two reasons, both measurable:
   *
   *   - These links are `hypot(vx, vy)` magnitudes. Nothing downstream ever
   *     asks which body axis they ran along, so "which axis is this" is not a
   *     doubt they have. `share` bottoms out at 0.5 at 45° of yaw and rises to
   *     1 at both ends, which for a magnitude is if anything backwards: at 45°
   *     both horizontal axes reach the sensor at gain 0.707 and neither is
   *     invisible, while at 90° the across-body axis is gone entirely.
   *   - `imageX.dominant` is null at exactly 45°, so the factor was zero there
   *     and `MIN_EVIDENCE` swallowed the rest of the tie. Measured on the rig
   *     by sweeping the camera dial one degree at a time: at a measured yaw of
   *     45 the elbow, wrist and span all came back null at confidence 0, while
   *     44° and 46° read the same wrist at -83 ms. `estimateYaw` also returns
   *     45 when it cannot measure at all (spatial.ts:132), so an unmeasurable
   *     camera silently deleted the three best-conditioned timings in the pass.
   *
   * What the angle really costs these links is a systematic drift in WHEN they
   * peak — the elbow's mean moves 10.2 ms across yaw 20° to 88°, against a
   * 0.7 ms deviation across noise. That is an offset every clip at a given
   * angle shares, not doubt about one reading, so it cannot honestly be spent
   * as confidence. It is recorded where a systematic lives: `UNCALIBRATED`,
   * which is also why elbow-to-wrist is not graded.
   *
   * So a planar link is confident exactly as far as its landmark was seen —
   * the same rule the leg link already had, since image y is vertical for every
   * camera this app accepts.
   */

  const linkAt = (series: Float32Array, confidence: number): ChainLink => {
    const peak = peakTimeInside(series, t, chainFrom, chainTo)
    // A link nobody could see is not a link that happened at zero. The evidence
    // bar is the flaw pass's own, so a reading too soft to name a fault from is
    // also too soft to record as a moment in the serve.
    if (peak === null || confidence < MIN_EVIDENCE) return { ms: null, confidence: round2(confidence) }
    return { ms: Math.round((peak - contactT) * 1000), confidence: round2(confidence) }
  }

  const legsSeen = windowVisibility(frames, chainFrom, chainTo, [LM.leftHip, LM.rightHip])
  const elbowSeen = windowVisibility(frames, chainFrom, chainTo, [R.elbow])
  const wristSeen = windowVisibility(frames, chainFrom, chainTo, [R.wrist])

  /*
   * The trunk pair, held to the same two tests as the three above.
   *
   * They reuse the rate series the rotation block already built and the window
   * it already searched, so `chain.hips` and `sequence.hip_peak_ms` are the same
   * measurement rather than two that could disagree about one serve. What they
   * did NOT reuse was `linkAt`, and that made `ChainTiming` contradict its own
   * documented contract on a single clip: with the four trunk landmarks blinded
   * to visibility 0.02, `chain.legs` was correctly null while `chain.hips`
   * reported -249 ms at confidence 0.02 — from the same two unseen hips — and
   * `hip_lead_ms`, built from the same peaks, was correctly dropped. One object
   * saying both things about one pair of landmarks.
   *
   * Same two tests, spelled out here rather than routed through `linkAt` because
   * these two arrive as an index and a time rather than as a series:
   * `MIN_EVIDENCE`, and the peak being strictly inside the window rather than on
   * its edge. The edge test is what `peakTimeInside` exists for, and it applies
   * here for exactly the reason it applies there — `peakAbsIn` returns an index
   * whether or not there was a peak, so a rate still climbing at contact reports
   * the boundary as an event, with a deviation near zero because a boundary
   * lands in the same place on every realisation. Across the twenty-four-seed
   * ensemble neither trunk peak ever lands on an edge (0/24 for both), so this
   * costs nothing on ordinary footage and only fires where it should.
   */
  const trunkLink = (at: number, peakT: number): ChainLink => {
    const confidence = round2(sequenceConfidence)
    if (at <= from || at >= to || sequenceConfidence < MIN_EVIDENCE) return { ms: null, confidence }
    return { ms: Math.round((peakT - contactT) * 1000), confidence }
  }

  const chain: ChainTiming = {
    legs: linkAt(legsSpeed, legsSeen),
    hips: trunkLink(hipPeakAt, hipPeakT),
    shoulders: trunkLink(shoulderPeakAt, shoulderPeakT),
    elbow: linkAt(elbowSpeed, elbowSeen),
    wrist: linkAt(wristSpeed, wristSeen),
    span_ms: null,
    span_ratio: null,
  }
  /*
   * How long this serve took, ready to contact — `metrics.ts`'s `totalTime` in
   * seconds, computed once here because two readings below divide by it.
   *
   * A clip where those two land on one frame is not a serve, and a ratio against
   * a duration of zero is an infinity that would travel a long way before
   * anything noticed.
   */
  const motionSeconds = contactT - at(keys.ready).t

  // Differenced from the links themselves rather than recomputed, so a span can
  // never exist for a link that was dropped.
  if (chain.legs.ms !== null && chain.wrist.ms !== null) {
    chain.span_ms = chain.wrist.ms - chain.legs.ms
    if (motionSeconds > 0) {
      chain.span_ratio = Number((chain.span_ms / (motionSeconds * 1000)).toFixed(4))
    }
  }

  /* --- external rotation, measured and not named ------------------------ */
  const externalRotation = readExternalRotation(at(keys.trophy), R)
  // The first reading in this engine taken past contact. See LandingBalance.
  const legDrive = readLegDrive(at(keys.trophy), at(keys.contact), bodyHeight)
  /*
   * Where the racket hand is at the knee trough (D3.5): how far above the
   * shoulder, in body heights, read off image y so every camera sees it the
   * same. The published amateur signature is an arm already cocked at maximum
   * knee flexion (Gao 2026). Only when the trophy came from the legs: a trophy
   * found from the arms is not the knee trough, and reading the arm there would
   * measure the rule that placed it. Measured and not named — see
   * `UNCALIBRATED.arm_cock_ratio`.
   */
  const armCock: ArmCock | undefined = skel.derivation.trophyFromArms
    ? undefined
    : {
        ratio: round3((at(keys.trophy).image[R.shoulder].y - at(keys.trophy).image[R.wrist].y) / bodyHeight),
        confidence: round2(windowVisibility(frames, keys.trophy - 1, keys.trophy + 1, [R.wrist, R.shoulder])),
      }
  const landing = readLandingBalance(
    at(keys.finish),
    bodyHeight,
    at(keys.finish).t - contactT,
    motionSeconds,
  )
  const landingFeet = landing.offset === null ? undefined : readLandingFeet(at(keys.contact), at(keys.finish), skel, bodyHeight)

  /* --- the toss --------------------------------------------------------- */
  const liftFrom = clamp(keys.toss - Math.round(frames.length * 0.12), keys.ready, keys.toss - 1)
  // Drift along image x, then along the body axis image x turns out to be. This
  // used to stop at the first step and the signal was named `toss_drift_ratio`
  // off the back of a function called `lateralDrift`, so the flaw it feeds — and
  // the sentence and the fence drill under that flaw — asserted a direction
  // nothing had measured. On the side-on framing this app recommends, the number
  // is front-to-back drift almost entirely.
  const driftImageX = offLineDrift(frames, liftFrom, keys.toss, T.wrist, bodyHeight)
  const driftAxis = imageX.dominant
  const drift = driftAxis
    ? readImageX(driftImageX, driftAxis, imageX)
    : { value: null, confidence: 0 }

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
  // The camera this rests on is recovered once, above the toss block, because
  // the toss drift needs the same angle to answer a different question.
  const depthUnreliable = spatial.depth_unreliable
  const separationConfidence =
    trunkVisibility *
    (depthUnreliable ? DEPTH_COLLAPSED : 1) *
    (coil.resolved ? 1 : SWEEP_UNRESOLVED)

  /* --- assemble --------------------------------------------------------- */
  const readings: Record<string, SignalReading | undefined> = {
    palm_to_sky_deg: { value: palmToSky, confidence: handConfidence },
    separation_deg: { value: coil.deg, confidence: separationConfidence },
    hip_lead_ms: { value: leadMs, confidence: sequenceConfidence },
    // Absent when no body axis owns image x — the 45° tie, where the drift is
    // half front-to-back and half sideways and nothing can say which. Dropped
    // rather than passed on hedged, because everything downstream of this signal
    // commits to a direction: `toss_drift` is stated as "your toss drifts
    // sideways" and answered with a drill that constrains one axis, and a fault
    // named on the wrong axis costs the player the practice session they spend
    // on it. The report drops its own toss-wobble row on the same tie, for the
    // same reason, so the two halves of the app go quiet together.
    //
    // The confidence carries both halves of the doubt: how well the tossing
    // wrist was seen, and how much of this number is honestly the axis it is
    // about to be named for.
    toss_drift_ratio:
      drift.value === null || driftAxis === null
        ? undefined
        : {
            value: drift.value,
            confidence:
              windowVisibility(frames, liftFrom, keys.toss, [T.wrist]) * drift.confidence,
            // The axis travels with the number. Recovering it here and then
            // dropping it was the half-fix: the metric card said "forwards and
            // back" while the largest heading on the same report still said
            // "sideways" and handed the player a drill for the other axis.
            // Everything that writes a sentence about this flaw reads this.
            axis: driftAxis,
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
    // The hips rising from the deepest load to contact: the legs' share of the
    // serve, read from image y, which is vertical at every angle the app takes.
    // Graded since the research gave it a scale — see its band in `tiers.ts`.
    leg_drive_rise_ratio:
      legDrive.rise === null ? undefined : { value: legDrive.rise, confidence: legDrive.confidence },
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

  const flaws = evaluateFlaws(
    readings,
    current,
    { racketNeverFell: skel.derivation.dropOnTrophy && sawTheDrop },
    options.serveType,
  )

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
    chain,
    externalRotation,
    legDrive,
    landing,
    armCock,
    landingFeet,
    hitch: readHitch(frames, skel),
    tossPlacement: readTossPlacement(
      frames,
      skel,
      viewFromCourtYaw(spatial.court_yaw_deg),
      options.ball,
      options.aspect,
    ),
    stance: readStance(frames, skel, viewFromCourtYaw(spatial.court_yaw_deg)),
    flaws,
    cost: {
      frames: frames.length,
      series: SERIES_COUNT,
      ms: Math.round((now() - started) * 10) / 10,
    },
  }
}

/* ---------------------------------------------------------------- helpers -- */

/**
 * How many frames a span of seconds covers on this clip.
 *
 * The same argument as `sampleRadius` in `kinematics.ts`, for a window offset
 * rather than a smoothing radius: a search that opens "four frames before the
 * trophy" opens 133 ms early on a 30 fps clip and 33 ms early at 120, so which
 * peaks are even eligible depends on the phone. At least one frame, because a
 * window of zero width has no interior and `peakTimeInside` would drop every
 * link on a clip sampled slowly enough.
 */
const secondsToFrames = (t: Float32Array, seconds: number): number =>
  Math.max(1, sampleRadius(t, seconds, 30))

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
 * Travel of a landmark along IMAGE X across a window, in body heights, with the
 * straight line through it removed first.
 *
 * The subtraction is the whole measurement. A player walking their hand up and
 * forward through the toss is not drifting — that is the motion — and without
 * removing the trend, every serve filmed from anywhere but dead side-on would
 * report a wandering toss.
 *
 * Called `lateralDrift` until now, and the name was the bug. Image x is not
 * sideways; it is the player's front/back axis and their sideways axis mixed in
 * a proportion set by where the phone stood, and side-on — the framing this app
 * recommends — it is 99% front/back. Naming the axis is `axes.ts`'s job and the
 * caller's; this function's job stops at the image, and its name now says so.
 */
function offLineDrift(
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
const round3 = (v: number) => Math.round(v * 1000) / 1000

/**
 * How far past contact a finish has to be before a landing can be read from it,
 * as a share of the serve's own length rather than as a number of seconds.
 *
 * See the refusal in `readLandingBalance` for the derivation. Under this the
 * reading loses most of the fall and at the extreme reports a confident zero.
 *
 * 0.258 OF THE MOTION IS 0.30 s ON THE SERVE IT WAS DERIVED FROM. The
 * derivation was run on the rig's default serve and written down in that serve's
 * seconds, which made it a threshold about one tempo — and there are two
 * ordinary ways a clip has another. A deliberate server takes 1.7 s ready to
 * contact where a quick one takes 1.1, a spread this repo's own sweeps already
 * dial; and a time-stretched slow-motion file spreads the same serve over
 * several times as many file seconds, which is the filming the app itself
 * recommends. Both make a fixed 0.3 s a different fraction of the fall, and both
 * err the same direction: on any serve slower than the derivation's, the guard
 * admits a finish that has fallen less than the one the derivation accepted. At
 * four times stretched it admits +0.30 s, which is 5.5% of that motion, on a
 * body that has barely left the ball.
 *
 * THE DENOMINATOR IS WHAT THE CODE MEASURES, NOT WHAT THE RIG DIALS, and the
 * difference is a fifth of the answer. The rig's default motion is 1.35 s, but
 * `findReady` places ready 12% of the way up from rest rather than at the first
 * instant of movement, so `contactT - ready.t` on that same serve reads 1.16 s.
 * Dividing by the dial would have given 0.222 and quietly loosened the guard on
 * every ordinary clip while claiming to leave it alone. Measured across the
 * twenty-four-seed ensemble it is 1.167 / 1.160 / 1.150 s at 30 / 50 / 120 fps,
 * with zero spread across seeds — so 0.258 reproduces the 0.30 s floor to within
 * a millisecond, and does so without depending on the frame rate.
 */
const MIN_LANDING_SHARE = 0.258

/**
 * The motion this share is measured against when the serve's own length cannot
 * be read — a `keys.ready` that landed on or after contact.
 *
 * The figure above, so the fallback is the old fixed threshold rather than a new
 * number: 0.258 × 1.16 is 0.30 s. A clip that cannot say how long its serve took
 * gets exactly the guard it got before any of this.
 */
const FALLBACK_MOTION_SECONDS = 1.16

function roundAll(signals: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(signals)) {
    out[k] = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 1000) / 1000
  }
  return out
}

/**
 * How much of the forearm has to sit across the upper arm's axis before its
 * rotation about that axis is a measurement rather than a coin toss.
 *
 * A quarter of the forearm's length. Not a comfort threshold: below it the
 * quantity being measured genuinely stops existing, because the direction of a
 * vector that is almost entirely along the axis it is being measured around is
 * decided by whatever noise is left over. Measured on the rig, an arm folded to
 * a 0.1 lever swings tens of degrees between two noise realisations of one
 * identical serve, and an arm at 0.9 barely moves.
 *
 * The number this refusal protects is the one the whole reading is for. A serve
 * with the racket dropped behind the back has a lever near 1; a straight arm at
 * contact has one near 0, which is the correct answer to "how externally rotated
 * is a straight arm" — the question does not apply.
 */
export const MIN_ROTATION_LEVER = 0.25

/**
 * Degrees of external-rotation reading injected by one degree of spine lean.
 *
 * The reading is taken against the trunk's up vector, so leaning the trunk moves
 * the reference and the number follows even though the shoulder has not rotated.
 *
 * A BOUND, NOT A COEFFICIENT, since the rig's arm was re-posed on the Bath
 * serves. `depth.test.ts` measured 15.1° of shift across 30° of lean on the old
 * arm (hand behind the racket shoulder) and 6° on the Bath-shaped one (hand
 * behind the head, elbow out to the side): 0.5 per degree and 0.2. How much a
 * lean moves the reference depends on where the arm sits relative to the lean,
 * so no single coefficient is the arm's — and the larger of the two measured is
 * kept, because every consumer uses this to size a bound, and a bound wants the
 * worst arm it has seen.
 *
 * IT IS ADDITIVE on each arm, which is what lets it be a number at all. Swept
 * across four rotations by four leans, the shift lean causes is the same at
 * rotations of 0, 20, 40 and 60 to within a degree on both arms.
 *
 * NOTHING SUBTRACTS IT, and that is deliberate. `Diagnosis` returns what was
 * measured; a corrected number that silently differs from the geometry is exactly
 * the kind of confident adjustment this codebase does not make in the data layer.
 * The correction is also rig-derived — it assumes this rig's spine bends the way a
 * spine does — which is fine for deciding whether a comparison is worth making and
 * not fine for changing a reading nobody can check. `signals.spine_lean_deg`
 * carries the lean on the same diagnosis, so any consumer holding two serves has
 * both halves.
 *
 * What it is FOR: bounding a delta. Two serves whose lean differs by L degrees
 * carry up to `0.5 × L` degrees of false rotation change between them, which against
 * this reading's own ~15° deviation says a lean difference of ten degrees spends
 * a third of the floor before the shoulder has done anything.
 */
export const ER_LEAN_SENSITIVITY = 0.5

/* ------------------------------------------- what a landing reading is worth --
 *
 * The three numbers `LandingBalance.offset` and `UNCALIBRATED.landing_offset`
 * have both carried in prose since they were measured, converged at 240 seeds
 * and stable to the fourth decimal from 24 upwards. Exported here rather than
 * left in two comments because a consumer bounding a *delta* has to do
 * arithmetic on them, and arithmetic on a number nobody can import is arithmetic
 * on a number somebody retyped.
 *
 * No behaviour changes by naming them: nothing in this file reads them, and the
 * readings they describe are produced exactly as before.
 */

/**
 * What a square landing reads, rather than zero.
 *
 * The reading is a magnitude, so landmark noise about a true zero folds positive
 * instead of cancelling. Anything built on this calibrates against this floor.
 */
export const LANDING_SQUARE_FLOOR = 0.0035
/** Deviation of that square reading across the depth-aware ensemble. */
export const LANDING_SQUARE_DEVIATION = 0.0028
/** Deviation of a 0.12 m landing, which reads 0.0657 — the wider of the two. */
export const LANDING_WIDE_DEVIATION = 0.0045

/**
 * Deviation of the external-rotation reading, the worse end of its measured range.
 *
 * `UNCALIBRATED.external_rotation_deg` records it as "flat at 9.4–11.8° across a
 * 48° span" — flat being the useful half, since a deviation that grew with the
 * reading could not be turned into a bound at all. The pessimistic end is
 * exported because a consumer bounding a delta wants the worst case on at least
 * one side of it.
 *
 * In prose until now, like the landing figures above and for the same reason:
 * arithmetic on a number nobody can import is arithmetic on a number somebody
 * retyped. Naming it changes nothing — nothing in this file reads it.
 */
export const ER_DEVIATION_DEG = 11.8

/* ------------------------------------- what a chain-ratio reading is worth -- *
 *
 * Measured in R50·3's premise cycle, across twelve seeds at each of the three
 * tempos the register itself swept. The register's own 21% is the TOTAL spread
 * with seed noise folded in — right for asking whether the quantity is bandable,
 * wrong for bounding a difference between two readings. These are the two terms
 * that figure is made of.
 */

/** Deviation of the ratio between takes, flat across tempo — which is what makes the terms separable. */
export const CHAIN_RATIO_DEVIATION = 0.0067
/**
 * How far the mean moves per second of tempo difference: 13.5% across a 0.6 s
 * range. It was 0.0102 (5.7%) until the rig's swing was re-posed on the Bath
 * serves, and the re-posed figure is the one kept because it is the larger: a
 * bound sized on the gentler swing would let tempo through as a change.
 */
export const CHAIN_RATIO_PER_SECOND = 0.0223

/**
 * Read external rotation off one frame.
 *
 * Rotation OF THE FOREARM ABOUT THE UPPER ARM, which is what external rotation
 * physically is — not elbow flexion, which is a different angle a serve can
 * change without rotating anything, and which the arm-extension measurements
 * already carry.
 *
 * The forearm is projected onto the plane perpendicular to the shoulder→elbow
 * axis and its angle read against the trunk's own up vector projected onto the
 * same plane, so raising or lowering the whole arm does not move the reading.
 * Unsigned, on purpose: a signed form wraps at ±180° the moment the forearm lays
 * back past the reference plane, and a wrapped reading looks exactly like a
 * measurement that fell apart.
 */
/**
 * How far the body finished across its own feet, read at the finish keyframe.
 *
 * IMAGE X, NOT WORLD. The whole reason this reading is worth having is the
 * finding the chain work established: coordinates the camera measured hold still
 * where ones a network inferred in depth do not. Through the whole pass on the
 * depth-aware ensemble, converged at 240 seeds, a square landing reads
 * 0.0035 ± 0.0028 and a 0.12 m one reads 0.0657 ± 0.0045 — a separation of about
 * fourteen deviations, and stable to the fourth decimal from 24 seeds upwards.
 * Better conditioned than anything the trunk pair ever managed, and for the
 * reason the chain work established rather than by luck.
 *
 * Read at one frame rather than averaged over a window, because unlike every
 * keyframe `steadyWorld` smooths across, this one is not an extremum of its own
 * motion — the body is still travelling at the finish, so a window either side
 * would average away part of the very thing being measured.
 */
/** Below this shift there is nothing for the back foot to have followed. */
const FOLLOW_FROM = 0.01

function readLandingFeet(
  contact: Frame,
  finish: Frame,
  skel: Pick<Skeleton, 'racket' | 'toss'>,
  bodyHeight: number,
): LandingFeet {
  const front = sided(skel.toss).ankle
  const back = sided(skel.racket).ankle
  const hip = (f: Frame) => (f.image[LM.leftHip].x + f.image[LM.rightHip].x) / 2
  const offset = (f: Frame, ankle: number) => f.image[ankle].x - hip(f)
  const shift = (offset(finish, front) - offset(contact, front)) / bodyHeight
  const trailed = (offset(finish, back) - offset(contact, back)) / bodyHeight
  return {
    front: round3(Math.abs(shift)),
    backFollow: Math.abs(shift) < FOLLOW_FROM ? null : round2(Math.min(1, Math.max(0, 1 - Math.abs(trailed) / Math.abs(shift)))),
  }
}

function readLandingBalance(
  f: Frame,
  bodyHeight: number,
  secondsAfterContact: number,
  motionSeconds: number,
): LandingBalance {
  const L = f.image
  const parts = [L[LM.leftHip], L[LM.rightHip], L[LM.leftAnkle], L[LM.rightAnkle]]
  const confidence = round2(mean(parts.map((p) => p?.visibility ?? 0)))
  const anklesSeen = round2(
    Math.min(L[LM.leftAnkle]?.visibility ?? 0, L[LM.rightAnkle]?.visibility ?? 0),
  )
  const after = round2(secondsAfterContact)
  const none: LandingBalance = { offset: null, confidence, secondsAfterContact: after, anklesSeen }
  if (parts.some((p) => !p) || !(bodyHeight > 1e-6)) return none

  // The evidence bar every other reading uses, and then the one this reading
  // needs on its own account: a clip framed to show a racket often does not show
  // a foot, and an unseen foot is placed near the edge of the picture rather
  // than omitted, so nothing downstream would notice it was invented.
  if (confidence < MIN_EVIDENCE) return none
  if (anklesSeen < ANKLES_SEEN_FLOOR) return none

  /*
   * And the refusal that has nothing to do with what the camera saw: whether the
   * landing had happened yet.
   *
   * `keys.finish` is meant to be half a second past contact, but `clockOf.at`
   * clamps to the last frame — so a player who stopped recording as the ball
   * left gets a "finish" that is barely past contact, on a body still travelling
   * upward. Both refusals above pass cleanly there, because the feet really are
   * in shot; what is missing is the landing.
   *
   * Measured on a dialled 0.12 m collapse, cutting the same clip shorter and
   * shorter, this reads 0.066 at +0.44 s, 0.046 at +0.30, 0.014 at +0.15, and
   * then 0.000 at +0.06 and +0.02 — a confident zero at full confidence, which
   * is exactly the sentence `LandingBalance.offset` forbids: a zero here is a
   * player who finished square, and a clip that ended is not a player who
   * finished square.
   *
   * The floor is where the reading still carries most of the fall — about 70% of
   * its settled value — and below it it collapses fast. It is deliberately under
   * the +0.44 s an untruncated clip gives, so ordinary footage is not refused
   * for being ordinary.
   *
   * IN SHARES OF THE MOTION, NOT SECONDS. Every figure above was measured on one
   * 1.35 s serve, so "0.30 s" is that serve's 0.222 and nothing more general —
   * see `MIN_LANDING_SHARE`. A slower serve, or the same serve in a
   * time-stretched slow-motion file, put the identical fall further down the
   * clock, and a fixed-seconds floor then admitted a finish that had fallen a
   * fraction as far. The share reproduces the derivation at 1.35 s exactly and
   * holds its meaning either side of it.
   */
  const against = motionSeconds > 0 ? motionSeconds : FALLBACK_MOTION_SECONDS
  if (!(after >= MIN_LANDING_SHARE * against)) return none

  const hipX = (L[LM.leftHip].x + L[LM.rightHip].x) / 2
  const ankleX = (L[LM.leftAnkle].x + L[LM.rightAnkle].x) / 2
  return {
    offset: round3(Math.abs(hipX - ankleX) / bodyHeight),
    confidence,
    secondsAfterContact: after,
    anklesSeen,
  }
}

function readExternalRotation(f: Frame, R: ReturnType<typeof sided>): ExternalRotation {
  const L = f.world
  const parts = [L[R.shoulder], L[R.elbow], L[R.wrist], L[R.hip]]
  const confidence = round2(mean(parts.map((p) => p?.visibility ?? 0)))
  const none: ExternalRotation = { deg: null, confidence, lever: 0 }
  if (parts.some((p) => !p)) return none

  const [sh, el, wr, hip] = parts
  const ax = { x: el.x - sh.x, y: el.y - sh.y, z: el.z - sh.z }
  const axN = Math.hypot(ax.x, ax.y, ax.z)
  if (axN < 1e-6) return none
  const u = { x: ax.x / axN, y: ax.y / axN, z: ax.z / axN }

  const across = (vx: number, vy: number, vz: number) => {
    const d = u.x * vx + u.y * vy + u.z * vz
    return { x: vx - u.x * d, y: vy - u.y * d, z: vz - u.z * d }
  }

  const foreLen = Math.hypot(wr.x - el.x, wr.y - el.y, wr.z - el.z)
  const fore = across(wr.x - el.x, wr.y - el.y, wr.z - el.z)
  const foreN = Math.hypot(fore.x, fore.y, fore.z)
  const lever = foreLen > 1e-6 ? round2(foreN / foreLen) : 0

  const up = across(sh.x - hip.x, sh.y - hip.y, sh.z - hip.z)
  const upN = Math.hypot(up.x, up.y, up.z)

  // Both refusals return the lever they were refused at, so a reader can see
  // which one happened: a body nobody saw comes back at 0, an arm folded too
  // straight comes back at whatever it actually had.
  if (confidence < MIN_EVIDENCE || upN < 1e-6) return { deg: null, confidence, lever }
  if (lever < MIN_ROTATION_LEVER) return { deg: null, confidence, lever }

  const cos = clamp((fore.x * up.x + fore.y * up.y + fore.z * up.z) / (foreN * upN), -1, 1)
  return { deg: Math.round((Math.acos(cos) * 180) / Math.PI), confidence, lever }
}

/**
 * How much of the leg load became upward motion.
 *
 * Same shape as `ChainLink`, `ExternalRotation` and `LandingBalance` for the same
 * reason: a nullable measurement beside the confidence it was read at, which the
 * engine takes and does not grade.
 */
export interface LegDrive {
  /**
   * Hip-centre rise from the trophy to contact, as a share of standing height.
   *
   * `null` where either keyframe's hips could not be seen — never a zero, since
   * a zero here is a player who did not rise and a player nobody could see did
   * not stand still.
   */
  rise: number | null
  /**
   * How much of the trophy's knee bend was straightened by contact, in degrees.
   *
   * The other half of the pair R51 asks for: `rise` is how much of the load
   * became upward motion, this is how much load there was to spend. Knee bend at
   * the trophy is already graded; nothing measured what happened to it.
   *
   * **World coordinates, not image y, which is what R51·2 required.** A joint
   * angle is not available from one axis, and the projected version is
   * confounded by camera yaw in the way R60·2 refused the stance for. It is
   * therefore a depth reading, with everything that implies — see
   * `UNCALIBRATED.knee_extension_deg` for what the sweep says about resolving it.
   *
   * Both legs averaged, as the trophy metric already does. `null` where either
   * keyframe's knees could not be seen — never a zero, since a zero here is a
   * player who never straightened.
   */
  extensionDeg: number | null
  /** Mean visibility of the two hip landmarks across the two keyframes, 0–1. */
  confidence: number
}

/** What a player who never leaves the ground still reads, from straightening alone. */
export const LEG_DRIVE_FLOOR = 0.0457

/**
 * Read the rise between two keyframes.
 *
 * Image y, negated because image y grows downwards — a sign error here would
 * report the drive at the moment the player was sinking into the trophy, which
 * is the mistake `riseSpeedSeries` already documents at length.
 *
 * Two frames rather than a window, deliberately. `steadyWorld` smooths the
 * keyframes it reads because they are extrema of their own motion; these two are
 * endpoints of a span, and averaging either into its neighbours would blunt the
 * very difference being measured — the same argument `readLandingBalance` makes
 * for reading the finish at one frame.
 */
function readLegDrive(trophy: Frame, contact: Frame, bodyHeight: number): LegDrive {
  const pair = [LM.leftHip, LM.rightHip]
  const seen = [trophy, contact].flatMap((f) => pair.map((lm) => f.image[lm]?.visibility ?? 0))
  const confidence = seen.reduce((a, b) => a + b, 0) / seen.length

  const mid = (f: Frame) => (f.image[LM.leftHip]?.y + f.image[LM.rightHip]?.y) / 2
  const a = mid(trophy)
  const b = mid(contact)
  /*
   * The knee angle at one frame, both legs averaged, from world coordinates.
   *
   * `steadyWorld` is deliberately not used, for the reason the rise gives above:
   * these two frames are endpoints of a span, and smoothing either into its
   * neighbours blunts the very difference being measured.
   */
  const knees = (f: Frame): number | null => {
    const legs = [
      [LM.leftHip, LM.leftKnee, LM.leftAnkle],
      [LM.rightHip, LM.rightKnee, LM.rightAnkle],
    ] as const
    const seenLegs = legs.filter((l) => l.every((lm) => (f.world[lm]?.visibility ?? 0) > 0))
    if (!seenLegs.length) return null
    const angles = seenLegs.map(([h, k, an]) => jointAngle(f.world[h], f.world[k], f.world[an]))
    return angles.reduce((x, y) => x + y, 0) / angles.length
  }
  const kneeTrophy = knees(trophy)
  const kneeContact = knees(contact)
  const extensionDeg =
    kneeTrophy === null || kneeContact === null || !Number.isFinite(kneeTrophy - kneeContact)
      ? null
      : kneeContact - kneeTrophy

  if (!(bodyHeight > 1e-6) || !Number.isFinite(a) || !Number.isFinite(b)) {
    return { rise: null, extensionDeg, confidence }
  }
  return { rise: (a - b) / bodyHeight, extensionDeg, confidence }
}
