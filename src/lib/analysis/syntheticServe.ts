/**
 * A parametric right-handed serve, built as landmark trajectories.
 *
 * This exists so the detector and the measurements can be exercised without a
 * camera. The rig is driven by the same quantities a coach would name — knee
 * bend, shoulder tilt, hip and shoulder rotation, where the hands are — so a
 * test can dial in a known fault and assert that the app reports that fault.
 *
 * Body model: 1.8 m player, hips at 0.95 m. World landmarks are metres with the
 * origin at the hip centre and +y pointing DOWN, matching MediaPipe. Image
 * landmarks are an orthographic projection along +z, already aspect-corrected.
 */
import { LM, clamp } from './geometry'
import type { Frame, Landmark } from './types'

const HEIGHT_M = 1.8
const HIP_M = 0.95
const SHOULDER_DROP = -0.52
const HALF_SHOULDER = 0.19
const HALF_HIP = 0.09
const UPPER_ARM = 0.3
const FOREARM = 0.27
const THIGH = 0.44
const SHIN = 0.44
const NOSE_DROP = -0.72

/**
 * Where the trunk's yaw dials are measured from, and where it ends up.
 *
 * Yaw here is the direction of the left-to-right girdle line in the x–z plane:
 * 0 is side-on (left shoulder to the net), 90 is square to it. The dials name
 * coil at the trophy as they always have; `TRUNK_ZERO − dial` is the yaw, so the
 * default shoulders (82) sit at −21, coiled past side-on as the Bath serves'
 * shoulders are at the trophy. The contact yaws are those serves' medians.
 */
const TRUNK_ZERO = 61
const SHOULDERS_AT_CONTACT = 80
const HIPS_AT_CONTACT = 65

const GROUND_Y = 0.95
/**
 * 1.8 m maps to 0.54 image units, which leaves headroom for the racket hand at
 * full stretch — up to ~1.65× standing height — to stay inside the frame. A rig
 * that pushes contact off the top of the picture is not a clip anyone could
 * actually film, and would hide bugs in anything that maps landmarks to pixels.
 */
const SCALE = 0.54 / HEIGHT_M

export interface ServeDials {
  /** Knee angle in degrees at the trophy. 180 is straight. */
  trophyKneeAngle: number
  /** Shoulder-line tilt at the trophy, degrees. */
  shoulderTilt: number
  /** Yaw of the shoulder and hip lines at the trophy, degrees. */
  shoulderYaw: number
  hipYaw: number
  /**
   * Which rotational sense the trunk unwinds in: +1 as dialled, -1 the mirror.
   *
   * This dial exists because the rig cannot prove its own convention. It wears
   * right-handed landmark labels and turns the trunk one particular way, and
   * there is no recorded MediaPipe footage in the repo to check that against —
   * `__tests__/fixtures/index.ts` has an empty RECORDED list. So if the rig
   * turned the trunk opposite to a real right-hander and the measurement was
   * oriented to agree with the rig, the two would be inverted together and every
   * test would pass for that reason alone.
   *
   * Negating both trunk yaws produces the same serve rotating the other way
   * round while the labels stay put, which is precisely the case an inverted
   * convention cannot survive: a measurement that assumes a direction reports
   * coil as an open chest under one setting or the other. Anything asserted for
   * both values of this dial is asserted independently of the convention.
   */
  trunkRotationSign: 1 | -1
  /** Hip height at contact, metres. Above 0.95 means the player left the ground. */
  contactHipHeight: number
  /** Wrist height at contact as a multiple of standing height. */
  contactReach: number
  /**
   * How far the racket wrist falls below the shoulder at the drop, metres;
   * negative is above it.
   *
   * The default is the real one: at the racket's low point the arm is at
   * maximum external rotation, upper arm about level with the shoulder and
   * forearm laid back, so the hand sits near shoulder height while the racket
   * head falls. The Bath serves put it 5 cm above. It used to be 0.45 below —
   * the hand down the back, which no measured serve does.
   */
  dropBelowShoulder: number
  /**
   * Where the racket elbow rides at the drop, from −1 (down by the ribs) to 1
   * (high above the shoulder). It picks which way the elbow bends out of the
   * shoulder–hand line, and so how high it sits.
   *
   * Its own dial because the collapsed elbow is its own fault. It used to come
   * free with a shallow drop: the old solver hung the elbow under the shoulder
   * whenever the hand stopped near it, so `dropBelowShoulder: 0.05` meant both.
   * With the hand where a real drop puts it, the elbow is up and out — 12 cm
   * above the shoulder on the Bath serves — unless this says otherwise.
   */
  dropElbowLift: number
  /** Elbow angle of the tossing arm at release, degrees. */
  tossElbow: number
  /** Fraction of toss→contact that the tossing arm stays above its shoulder. */
  tossArmHold: number
  /**
   * Front-to-back wobble amplitude of the tossing hand, metres.
   *
   * This dial is applied to world +x, which the racket-wrist block below
   * documents as "away from the net" — the player's DEPTH axis. It was described
   * here as "sideways wobble" for as long as it has existed, and that one word
   * is the whole of the bug this rig hid.
   *
   * Being pointed at depth is exactly what made `tossPathWobble` look correct.
   * The projection below lays image x across the two body axes as
   * `depth·sin(yaw) + lateral·cos(yaw)`, so at the rig's own default of 82° a
   * metre of depth arrives as 0.990 of image x and a metre of lateral as 0.139.
   * The rig drove the axis the camera could see best, the measurement read image
   * x, and the two agreed to four decimal places about a quantity neither of
   * them was naming correctly. Nothing in the suite could tell, because until
   * `tossWobbleLateral` below there was no way to move the other axis at all.
   *
   * Deliberately NOT renamed to `tossWobbleDepth`, which is what it should be
   * called. The dial is set by name in four test files this workstream does not
   * own (engine, triage, flaws, plan), and a rename that silently reverts to the
   * clean-serve default in someone else's file would turn their dialled-in fault
   * into a clean toss and their assertion into a coincidence.
   */
  tossWobble: number
  /**
   * Sideways wobble amplitude of the tossing hand, metres — the real one.
   *
   * Applied to world z, which is across the player: at the ready pose the
   * shoulder line runs along it (`shDir` is built from `shoulderYaw`, 86° at
   * ready, so the line is 0.998 of z and 0.070 of x). This is the axis a
   * fence-line toss drill constrains, and the axis every player-facing string
   * about toss drift used to claim it was describing.
   *
   * Same waveform and same units as `tossWobble`, so the pair differ in nothing
   * but the axis they move. That is the point: a test can now dial an identical
   * wobble onto each axis in turn and assert that the app names them apart,
   * which is the one thing the rig could not previously be asked.
   */
  tossWobbleLateral: number
  /** Seconds from the start of the motion to contact. */
  motionSeconds: number
  /** Camera yaw: 90 is fully side-on, 0 is face-on. */
  cameraYaw: number
  /**
   * How far the hitting palm has turned towards facing the sky at the trophy,
   * in degrees. Zero is edge-on — the hand a continental grip produces. Large
   * values are the waiter's tray, the palm flat under the racket.
   *
   * Realised by rotating the knuckle line about the forearm, which is what a
   * grip change actually does to the hand. The achievable elevation is bounded
   * by the forearm's own tilt — a dead vertical forearm cannot present its palm
   * to the sky at all — so `trophyForearmDrop` moves with it.
   *
   * KNOWN LIMIT: this dial saturates, and it matters more than it looks. Dialled
   * at 80, 90 and 100 the engine reads back 49–51° every time, so the most
   * extreme waiter's tray this rig can build is about 50° of palm. Against
   * `palm_to_sky_deg`'s own deviation of 6.8° that leaves `waiters_tray` — the
   * top of the triage hierarchy — clearing a tier-5 band by roughly half a
   * degree, and `flaws.test.ts`'s jitter check had to move to tier 7 to stay
   * meaningful because of it. The bound is `placeHand`'s `sin(palmToSky)` against
   * the forearm tilt, so a bigger number cannot fix it; the rig needs a hand
   * orientation with more than one angle in it. Until then, no test here can
   * claim a margin on this signal that it has not separately checked.
   */
  palmToSky: number
  /**
   * How far the racket lays back off the forearm at the drop, in degrees (L4.4).
   *
   * For the picture only. The rig places a racket on every frame
   * (`Frame.racket`) so a model serve can be drawn holding one, and nothing
   * the engine measures reads it: the landmarks are the same at any value.
   * The lay-back turns the racket off the forearm towards down-and-back, the
   * way lag pulls the head, and rides a track through the serve — a little at
   * the ready, more at the trophy, this much at the drop, almost none at
   * contact. Negative turns it towards up-and-back instead: a racket held up
   * at the drop, the shallow drop's shape (L4.5).
   */
  racketLayBack: number
  /**
   * How far the trophy arm flattens out of its cocked position, in metres.
   *
   * The tray is not only a wrist rotation. A cocked arm holds the forearm near
   * vertical, and no grip can present a vertical forearm's palm to the sky —
   * that is a fact about arms, and it is why the fault always comes with the arm
   * laid over towards horizontal. This drops the hand towards shoulder height
   * and pushes it out to the side, which is the shape a player carrying a tray
   * actually makes.
   *
   * KNOWN LIMIT: it moves the hand, and the elbow can only follow while the
   * hand is within reach. The elbow is solved onto the shoulder–hand segment
   * with both arm lengths held, so the arm keeps its shape until the hand is
   * placed past full stretch, and from there the elbow-to-wrist distance grows
   * instead. Measured on the clean rig at the trophy frame, with the hand
   * travelling back 0.6 of the dial (it was 1.25 while the arm was first being
   * re-posed, which put the tray's own 0.22 past reach):
   *
   * ```
   * dial   forearm(m)  upper arm(m)  ratio
   * 0.00       0.270        0.300      0.90   ← a real forearm is about 0.8
   * 0.40       0.270        0.300      0.90
   * 0.50       0.344        0.300      1.15
   * 0.80       0.622        0.300      2.07
   * ```
   *
   * So a dial above ~0.4 poses a body nobody has, and any measurement read off
   * the racket arm there is a measurement of that. It does not invalidate what
   * the dial is used for — `palm_to_sky_deg` is read from the palm normal and
   * the flags built on it are still earned — but it does mean the dial cannot be
   * turned up to make a fault "more extreme", and `invariants.test.ts` pins the
   * bound so a future dial past it fails rather than quietly stretching an arm.
   *
   * IT IS NOT A ROTATION, and confusing it for one produced a wrong answer once
   * already. Sweeping this dial to ask whether a phone can read shoulder
   * external rotation measured a forearm getting longer, and the deviation that
   * came back — exploding past 0.4 — was the arm straightening out, not a camera
   * failing. `trophyExternalRotation` is the dial for that question and answers
   * it differently; see its own comment.
   */
  trophyForearmDrop: number
  /**
   * How far the racket arm is laid over through the cocking, 0–1 (L5.2): the
   * elbow let down towards the ribs from the trophy to the drop, so the upper
   * arm rises well short of the shoulder line. The second half of a waiter's
   * tray beside the palm (`palmToSky`): Touzard 2019 finds the tray's arm
   * abducted under about 70° while cocking, where a sound serve's sits near or
   * past 90. Zero leaves every default serve byte-identical.
   */
  trophyArmLayOver: number
  /**
   * How late the racket arm cocks, 0–1: where the hand is at the deepest knee
   * bend (D3.5).
   *
   * Zero is the Bath server, and this rig's default: by the knee trough the
   * forearm is already up, the hand about 0.15 body heights over the shoulder —
   * which is the amateur signature in the WTA comparison (Gao 2026), where the
   * lower-ranked players were already rotated back at maximum knee flexion (95°
   * of external rotation against the top 40's 38°). One keeps the forearm
   * pointing forward at the knee trough, the hand at about shoulder height in
   * front of the elbow, as the top 40 do; the arm then cocks on the way to the
   * drop, which is untouched.
   *
   * Applied as an offset to the trophy key and zero at zero, so a rig built
   * without it is bit-identical.
   */
  lateArmCock: number
  /**
   * How late the legs drive, 0–1 (D3.8): the hips and knees hold their trophy
   * load for this share of the trophy-to-contact span before rising, so the
   * rise is later and shorter. Zero is the rig as it always was; at one the legs
   * peak after the elbow, the arm-first order Fleisig 2003 describes as
   * the chain broken. Applied by adding a hold key, skipped at zero, so a rig
   * built without it is bit-identical.
   */
  lateLegDrive: number
  /**
   * External rotation of the racket shoulder at the trophy, in degrees.
   *
   * The one thing this rig could not pose, and the reason a whole investigation
   * into whether a phone can read external rotation had no question to ask: the
   * dial above moves the *hand*, and moving a hand outward past the arm's reach
   * lengthens the forearm rather than rotating anything. That is why it is
   * bounded, and why the bound is pinned in `invariants.test.ts`.
   *
   * This one is a rotation and cannot stretch anything, by construction. The
   * wrist is rotated about the shoulder→elbow axis — the humerus' own long axis,
   * which is what external rotation physically is — and the elbow lies *on* that
   * axis, so the elbow-to-wrist distance is preserved exactly rather than
   * approximately. Positive lays the racket back behind the arm, which is the
   * direction a real serve loads in. Zero is an exact no-op: nothing is applied,
   * so every reading the suite has ever taken is untouched.
   *
   * Weighted to the trophy and back to nothing by the drop, because that is
   * where the load lives — a rotation held through contact would be modelling a
   * different fault, and the swing already has `pronation` for what the forearm
   * does on the way through.
   *
   * WHAT IT ANSWERED. Swept the day it was added, against the same ensemble
   * every `NOISE_FLOOR` figure was derived from — `DEPTH_AWARE`, 24 seeds, at
   * the trophy, reading the forearm's rotation about this same humeral axis
   * against the trunk's up:
   *
   * ```
   * dial   measured°   sd°      dial   measured°   sd°   (depth error removed)
   *    0        19.7   9.5         0        14.9   2.9
   *   15        31.9   9.4        15        29.3   2.6
   *   30        43.9   9.8        30        43.8   2.7
   *   45        55.9  10.6        45        58.3   2.9
   *   60        67.9  11.8        60        72.9   3.4
   * ```
   *
   * Deviation is flat at ~10° across the whole range rather than exploding, the
   * reading tracks the dial at a gain of about 0.8, and the span is 48°. A floor
   * set the way every other one was — 1.5 × the deviation — would be 15°, which
   * leaves **3.15 usable steps**. For scale, `palm_to_sky_deg`'s floor is 11 and
   * the engine grades it; `hip_lead_ms`'s is 85 and it is `UNDER_RESOLVED`. So
   * external rotation sits on the gradeable side, and the earlier conclusion
   * that it did not was an artefact of sweeping `trophyForearmDrop` — a stretched
   * arm, not a rotated one.
   *
   * NOT GRADED YET, AND DELIBERATELY SO. No signal computes it, no band judges it
   * and no flag pairs it. A floor is the *first* number a graded signal needs,
   * not the last: bands per tier, a place in the hierarchy and copy all have to
   * come from somewhere, and inventing them off a synthetic rig is the thing this
   * codebase treats as a defect. The offset at zero (19.7°, the arm's own resting
   * rotation in this reference frame) and the 0.8 gain are also properties of the
   * frame rather than of a shoulder, and both need real footage before anything
   * is said to a player about degrees.
   */
  trophyExternalRotation: number
  /** Degrees the palm rotates about the forearm through contact — the snap. */
  pronation: number
  /**
   * Seconds the hips lead the shoulders into the swing.
   *
   * Positive is the sequence working: the lower body starts and the upper body
   * follows. Negative is arming the ball — the shoulders fire first and the legs
   * contribute nothing.
   */
  hipLead: number
  /** Sideways collapse of the spine by contact, in degrees. */
  spineLean: number
  /**
   * How far the hips travel sideways over the planted feet AFTER contact, in
   * metres. The landing, which nothing in this rig could pose before it.
   *
   * A serve finishes on the front foot, and a serve that finishes badly falls
   * across it — which loads the same lower back `spineLean` is about and the
   * front knee besides. All of it happens after the ball has gone, in the span
   * between contact and finish that `metrics.ts` measures nothing in.
   *
   * SEPARATE FROM `spineLean`, and the distinction is the point rather than a
   * detail. That one slides the shoulder girdle across a hip line whose feet
   * stay under it, and it is finished by contact. This one leaves the girdle
   * alone and moves the whole body across feet that have already planted, and it
   * does not begin until contact. One is a spine bending during the swing; this
   * is a body falling after it. A rig that could only pose the first would score
   * a collapsed landing as a clean serve.
   *
   * Weighted entirely after contact — `track` clamps below its first key, so
   * every frame at or before contact is untouched however this is dialled, and
   * every measurement in the engine reads a window ending at contact. That is
   * what lets this land without moving a single existing expectation.
   *
   * Metres of hip travel rather than an angle, because the leg it is limited by
   * is a length: the ankle starts directly below its hip and can be carried
   * sideways only until the leg is straight. Clamped there, and the clamp is
   * about 0.17 m on the landing's own knee bend — past that a bigger number
   * would silently stop meaning anything.
   */
  landingLean: number
  /**
   * How much the BACK foot follows the hips instead of staying planted, 0–1.
   *
   * The asymmetry `landingLean` on its own cannot express, and the reason it
   * matters is that `Diagnosis.landing` reads the ankle CENTRE. With both feet
   * planted that midpoint is a fixed reference and the reading is purely how far
   * the body travelled. Let the back foot travel too and the midpoint travels
   * with it, so the same collapse reads smaller — the measurement would be
   * quietly reporting the trailing leg as well as the fall.
   *
   * A right-handed serve lands on the LEFT foot, so the back foot here is the
   * right one; this rig builds right-handed serves throughout, which is stated
   * at the top of the file.
   *
   * Zero is both feet planted, which is what `landingLean` did alone and what
   * every expectation written against it assumes. One is a back foot that
   * travels exactly as far as the hips do — a leg swinging fully through rather
   * than resisting. Real landings sit somewhere between, and nobody here knows
   * where, which is the whole point of being able to sweep it.
   */
  landingBackFootDrag: number
  /**
   * How far the BACK foot slides up to the front one before contact, 0–1.
   *
   * PLATFORM AGAINST PINPOINT, WHICH THIS RIG COULD NOT PRODUCE. Every serve it
   * has ever built stands with each ankle directly below its own hip and leaves
   * them there until the landing — one stance, `HALF_HIP` wide, with no way to
   * vary it. Two rounds are stuck on that: R60 wants to read stance from ankle
   * separation over time and had nothing to sweep, and R64 wants to switch the
   * landing reading to the front ankle and could not say how much the front
   * ankle's own baseline varies between players, because the baseline *is* the
   * stance.
   *
   * Zero is a platform stance: both feet where they have always been, and
   * bit-identical to a rig with no dial at all — see the skip below, which is
   * the same rule `landingShift` and `trophyExternalRotation` already follow.
   * One brings the back ankle all the way to the front one, which is further
   * than any real pinpoint goes; a club pinpoint closes most of the gap and not
   * all of it, and nobody here knows the distribution, which is the whole point
   * of a dial rather than a second constant.
   *
   * THE TIMING IS THE MEASURABLE PART and it is why this ramps rather than
   * switching. The slide happens during the wind-up and is finished before the
   * legs drive, so ankle separation falls from its standing value to its
   * narrowest somewhere between `ready` and the trophy. A detector reading
   * separation over time is reading that ramp; a detector reading one frame is
   * reading a stance width it has no baseline for.
   *
   * A right-handed serve lands on the LEFT foot, so the back foot is the RIGHT
   * one — the same handedness this rig builds throughout and the same foot
   * `landingBackFootDrag` names.
   */
  pinpointSlide: number
  /**
   * A pause at the trophy, in seconds — the hitch.
   *
   * The player who reaches the trophy, stops, and swings from a standstill. R52
   * calls it one of the most common club faults and one of the most visible on
   * video, and the rhythm group cannot see it. **R52 could not be decided
   * because this dial did not exist**: the trough it proposed reading is
   * confounded by tempo 2.3-fold, and with no way to pose a hitch the rig could
   * measure the confound and not the separation. R60·1's precedent — the stance
   * refusal was blocked on a missing dial too, and building it was its own round.
   *
   * IT LENGTHENS THE MOTION RATHER THAN COMPRESSING THE SWING, which is the
   * whole design decision. Holding the trophy and squeezing what follows into
   * the same span would make a hitch imply a faster swing, and then any reading
   * that separated hitch from tempo might be reading the swing rather than the
   * pause. A player who stops takes longer; the serve after the pause is the
   * serve they were going to hit.
   *
   * Zero is bit-identical to no dial at all — the warp is skipped, not applied
   * with a zero, the same discipline `pinpointSlide` shipped under.
   */
  trophyHitchSeconds: number
  /** Someone standing around with the racket down — used to test rejection. */
  noSwing: boolean
  /**
   * Landmark jitter, as a fraction of the frame. Real pose output is never
   * still: a tracked wrist wobbles roughly 0.5–1.5% of frame height between
   * consecutive frames even when the arm is not moving.
   */
  noise: number
  /**
   * How much worse the depth axis is than the two the camera can actually see.
   *
   * `noise` on its own applies the same jitter to x, y and z, which quietly
   * asserts that a monocular pose estimate resolves depth as well as it resolves
   * position in the frame. It does not, and it is not close: x and y are read
   * off pixels, while z is inferred by the network from apparent size and
   * foreshortening. Published characterisations of MediaPipe's world landmarks
   * put depth error at roughly three to five times the in-plane error.
   *
   * That matters more here than the raw ratio suggests, because two of the
   * engine's readings are computed *entirely* from z — hip-shoulder separation
   * and shoulder tilt are both yaw angles about the vertical axis — and a rig
   * that models depth as exact has never once exercised them under the error
   * they actually carry.
   *
   * A multiplier rather than an absolute, so it composes with `noise`, and
   * defaulting to 1 so every existing expectation in the suite is untouched.
   */
  depthNoise: number
  /**
   * Whole-body depth wobble, in the same frame units as `noise`.
   *
   * The part that independent per-landmark jitter cannot stand in for. A network
   * inferring depth from apparent size gets the *whole player* slightly too near
   * or too far on a given frame, and every landmark moves together. Independent
   * noise largely cancels in a difference of two angles; a shared bias does not
   * cancel at all — it rotates both shoulder and hip lines the same way, which
   * is precisely the failure mode a separation measurement is blind to and a
   * tilt measurement is not.
   */
  depthBias: number
  /**
   * Total lateral camera drift across the whole clip, in the same frame
   * units as `noise` — the handheld counterpart to `depthBias`.
   *
   * `depthBias` gives every landmark a shared offset re-rolled *per frame*,
   * because a network guessing depth infers it for the whole body at once,
   * on every frame independently. This gives every landmark a shared offset
   * that grows smoothly across the *whole clip* instead, because a hand
   * holding a phone does not re-aim randomly frame to frame — it drifts, in
   * one direction, the way a grip settles or an arm tires over three seconds
   * of filming. `noise` cannot stand in for this any more than it can for
   * `depthBias`, and for the same reason: independent per-landmark jitter
   * mostly cancels in a difference of two angles read at one instant, while a
   * shared drift does not cancel at all — it carries the whole skeleton the
   * same way, frame after frame, which a hip-shoulder separation or a
   * toss-height reading has no way to tell apart from the player actually
   * having moved.
   *
   * A straight line rather than a wobble with a frequency to tune: the
   * dominant real case named in this app's own brief is somebody's arm
   * settling in one direction over a few seconds, not a shake, and a linear
   * drift is enough to ask the question this dial exists for — can a
   * measurement taken as a *difference of two frames* survive the reference
   * frame itself moving between them. Zero by default, so the clean rig and
   * every existing expectation in the suite are untouched.
   */
  cameraPan: number
  /**
   * Total fractional change in apparent size across the whole clip — the
   * handheld counterpart to `cameraPan` for a camera that moves along its
   * own optical axis (a dolly, or someone stepping back) instead of across
   * it. 0.1 means the player reads 10% taller in the last frame than the
   * first.
   *
   * Every height this app reports is a fraction of `bodyHeight`, and
   * `bodyHeight` is measured once, from the stance window before the toss —
   * see `detectServe`'s own comment on why a median taken there, not
   * re-measured through the swing. A zoom drifting the apparent size AFTER
   * that window is exactly the case that assumption cannot see happen: the
   * calibration was correct when it was taken, and everything downstream of
   * it is being asked about a body that has since changed size in the
   * frame without changing size in the world.
   *
   * Applied from 1.0 at the first frame — true to the stance calibration,
   * which this dial does not disturb — ramping linearly to `1 + cameraZoom`
   * by the last one, around the player's own ground anchor rather than the
   * frame centre, so a pure zoom is not conflated with `cameraPan`'s
   * lateral drift. Zero by default, so the clean rig and every existing
   * expectation in the suite are untouched.
   */
  cameraZoom: number
  /** Chance per frame that a limb is partly lost, as happens behind the body. */
  dropout: number
  /**
   * Seconds the racket wrist is frozen at its position, starting at the racket
   * drop — a different failure from `dropout`, and the one R8 in `NEXT.md`
   * exists to drive: real occlusion is not always MediaPipe admitting it cannot
   * see a limb. Behind the body for long enough, the model has learned priors
   * about where a wrist plausibly sits and holds roughly still there rather
   * than declining — which reads as full visibility on a track that has
   * stopped moving, not lowered visibility on a track that kept jittering.
   * `dropout` models the first kind, correctly flagged; this models the
   * second, which nothing downstream is told about. Visibility is left at 1.
   * Starts at the drop because that is the window `kalman.ts`'s own docstring
   * names as the costliest: two invented frames there are enough to report a
   * racket drop that never happened.
   */
  occlusionSeconds: number
  /**
   * How well lit the clip is, 1 (full daylight) down towards 0 (too dark to
   * see anything). Scales every landmark's visibility uniformly, for the
   * whole clip — R10 in `NEXT.md`: contrast is the one clip problem that
   * degrades the *whole body at once* rather than one limb, which is what
   * separates it from `dropout` (one limb, one frame) and `occlusionSeconds`
   * (one limb, held still, position corrupted). Position is untouched here —
   * a dusk clip is not one MediaPipe has started guessing coordinates on, it
   * is one where the model is less sure of coordinates it still reads
   * correctly, and visibility is exactly the channel it uses to say so.
   */
  lightLevel: number
  /**
   * Which noise realisation to draw.
   *
   * Vary this to measure across an ensemble. Holding it fixed while changing
   * `noise` applies *the same* pattern scaled up, so every landmark moves along
   * its own straight line and any one measurement appears to drift smoothly —
   * which looks exactly like systematic bias and is not.
   */
  seed: number
}

/**
 * Deterministic pseudo-random numbers.
 *
 * A test that fails one run in twenty teaches nobody anything, so the noise has
 * to be repeatable — same dials, same jitter, every time.
 */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export const CLEAN_SERVE: ServeDials = {
  trophyKneeAngle: 133,
  shoulderTilt: 24,
  shoulderYaw: 82,
  hipYaw: 56,
  trunkRotationSign: 1,
  contactHipHeight: 1.09,
  contactReach: 1.38,
  dropBelowShoulder: -0.05,
  dropElbowLift: 0.4,
  tossElbow: 172,
  tossArmHold: 0.72,
  tossWobble: 0.01,
  // Zero rather than matching `tossWobble`, so every expectation already in the
  // suite keeps the serve it was written against. A clean toss wandering a
  // centimetre front-to-back and not at all sideways is not a claim about real
  // players; it is the rig's previous behaviour, held still while the axis it
  // was driving is finally named.
  tossWobbleLateral: 0,
  motionSeconds: 1.35,
  cameraYaw: 82,
  palmToSky: 6,
  racketLayBack: 80,
  trophyForearmDrop: 0,
  trophyArmLayOver: 0,
  lateArmCock: 0,
  lateLegDrive: 0,
  trophyExternalRotation: 0,
  pronation: 95,
  hipLead: 0.07,
  spineLean: 4,
  // Zero rather than a token amount, for the reason `tossWobbleLateral` gives
  // above: the clean rig has to keep the serve every existing expectation was
  // written against. A serve landing dead square is not a claim about players.
  landingLean: 0,
  // No hitch. A serve that flows through the trophy is what the whole rig was
  // written against.
  trophyHitchSeconds: 0,
  // Both feet planted, which is what the landing did before this dial existed.
  landingBackFootDrag: 0,
  pinpointSlide: 0,
  noSwing: false,
  noise: 0,
  // Both default to the rig's previous behaviour — depth exactly as good as the
  // frame, no shared bias — so nothing already in the suite moves. The depth
  // calibration turns them up deliberately.
  depthNoise: 1,
  depthBias: 0,
  cameraPan: 0,
  cameraZoom: 0,
  dropout: 0,
  occlusionSeconds: 0,
  lightLevel: 1,
  seed: 20240803,
}

/* -------------------------------------------------------------- interpolation */

type Key = [u: number, v: number]

/** Piecewise interpolation with a smoothstep on each span, so nothing kinks. */
function track(keys: Key[], u: number): number {
  if (u <= keys[0][0]) return keys[0][1]
  const last = keys[keys.length - 1]
  if (u >= last[0]) return last[1]
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i]
    const [u1, v1] = keys[i + 1]
    if (u >= u0 && u <= u1) {
      const t = (u - u0) / Math.max(1e-6, u1 - u0)
      const s = t * t * (3 - 2 * t)
      return v0 + (v1 - v0) * s
    }
  }
  return last[1]
}

const rad = (d: number) => (d * Math.PI) / 180

/**
 * Phase positions in normalised motion time, taken from real serve kinematics.
 * For a 1350 ms motion that puts the toss release ~700 ms before contact, the
 * trophy ~400 ms before, and the bottom of the racket drop ~150 ms before.
 */
export const U = { ready: 0, toss: 0.48, trophy: 0.7, drop: 0.89, contact: 1 } as const

/* -------------------------------------------------------------------- the rig */

const lm = (x: number, y: number, z: number): Landmark => ({ x, y, z, visibility: 1 })

export function buildServe(dials: Partial<ServeDials> = {}, fps = 50): Frame[] {
  const d = { ...CLEAN_SERVE, ...dials }
  const rand = seeded(d.seed)

  // A little lead-in and follow-through around the measured motion.
  const preroll = 0.35
  const postroll = 0.45
  /*
   * The hitch, as a share of the motion, and the warp that applies it.
   *
   * `hold` is where the clock stops: at `U.trophy`, for `h` of a motion. The
   * motion itself is longer by exactly that, so everything before the trophy is
   * untouched and everything after happens later rather than faster.
   *
   * Skipped entirely at zero rather than applied as an identity, so a rig built
   * with no hitch is bit-identical to one built before this dial existed.
   */
  const hitch = Math.max(0, d.trophyHitchSeconds)
  const motion = d.motionSeconds + hitch
  const h = hitch / Math.max(1e-6, motion)
  const warp = (u: number): number => {
    if (h <= 0) return u
    if (u <= U.trophy) return u
    if (u <= U.trophy + h) return U.trophy
    return u - h
  }
  const total = preroll + motion + postroll
  const count = Math.round(total * fps)
  const frames: Frame[] = []
  // Captured the first frame `u` enters the occlusion window, then held for
  // its whole span — see `occlusionSeconds`.
  let frozenWrist: { x: number; y: number; z: number } | undefined
  const occlusionEnd = U.drop + d.occlusionSeconds / Math.max(1e-6, d.motionSeconds)


  const kneeBendDeg = 180 - d.trophyKneeAngle

  /*
   * How much of a full load the knees made, which is how much the hips can sink
   * and then rise (L1.9).
   *
   * The hips used to dip 8 cm at the trophy and rise to `contactHipHeight`
   * whatever the knees did, so a serve dialled to straight legs still drove up
   * hard. The example report then printed "Legs straight" and "Strong drive up"
   * on one card, which a coach would read as the app contradicting itself, on
   * the first report a new player sees. Hips cannot sink without the knees
   * bending, and they cannot rise above standing without having sunk first.
   * Proportional to the clean serve's own bend, so the default and anything
   * deeper move nothing.
   */
  const loadShare = clamp(kneeBendDeg / (180 - CLEAN_SERVE.trophyKneeAngle), 0, 1)
  const trophyHip = HIP_M - 0.08 * loadShare
  const contactHip = HIP_M + (d.contactHipHeight - HIP_M) * loadShare

  for (let i = 0; i < count; i++) {
    const t = i / fps
    const u = warp((t - preroll) / motion)

    /* --- trunk ---------------------------------------------------------- */
    // The legs' hold, when `lateLegDrive` asks for one: the trophy load kept
    // until this point, then the rise. Absent at zero, so nothing moves.
    const legHold = d.lateLegDrive > 0 ? U.trophy + (U.contact - U.trophy) * Math.min(0.9, d.lateLegDrive * 0.8) : 0
    const hipHeight = track(
      [
        [U.ready, HIP_M],
        [U.trophy, trophyHip],
        ...(legHold ? ([[legHold, trophyHip]] as Key[]) : []),
        [U.contact, contactHip],
        [1.35, HIP_M - 0.02],
      ],
      u,
    )
    const kneeBend = track(
      [
        [U.ready, 6],
        [U.trophy, kneeBendDeg],
        ...(legHold ? ([[legHold, kneeBendDeg]] as Key[]) : []),
        [U.contact, 4],
        [1.35, 22],
      ],
      u,
    )
    // Both trunk yaws are negated together, so the dial reverses the direction
    // the trunk rotates in without touching how far it rotates, how the hips
    // lead the shoulders, or which landmark is labelled which.
    const spin = d.trunkRotationSign
    /*
     * The trunk, turned on the court the way a real server turns it.
     *
     * Each yaw is the direction of the left-to-right line across the girdle, in
     * the x–z plane: 0 points straight back from the net, which is side-on —
     * left shoulder to the net — and 90 points to the player's right, which is
     * square to it. The rig used to stand square at the start and turn *away*
     * from the net into contact, 90° off and the wrong way round, and the camera
     * model learned that pose: a phone on the baseline, where the filming guide
     * puts it, saw a profile. Real servers stand side-on and unwind to square.
     * Measured on the 40 Bath serves (ANALYSIS-REVIEW.md §9), the shoulders sit
     * at −15 at the start, −21 at the trophy (coiled past side-on) and +80 at
     * contact; the hips at +65 at contact.
     *
     * The two dials keep their meaning. `shoulderYaw − hipYaw` is still the coil
     * at the trophy, to the degree, and the default still holds 26 of it; only
     * the zero moved, to `TRUNK_ZERO`, which puts the default shoulders at the
     * measured −21.
     */
    const shouldersAtTrophy = TRUNK_ZERO - d.shoulderYaw
    const shoulderYaw =
      spin *
      track(
        [
          [U.ready, shouldersAtTrophy + 6],
          [U.trophy, shouldersAtTrophy],
          // Most of the turn comes after the racket drop: the Bath shoulders have
          // unwound 36° of their 101° by then. A share rather than a number of
          // degrees, so a trunk dialled not to turn does not turn here either.
          [U.drop, shouldersAtTrophy + 0.36 * (SHOULDERS_AT_CONTACT - shouldersAtTrophy)],
          [U.contact, SHOULDERS_AT_CONTACT],
        ],
        u,
      )
    // The hips run on their own clock, ahead of the shoulders by `hipLead`. A
    // serve where both lines unwind on the same schedule has no sequence in it
    // at all, and the sequencing detector would have nothing to find in either
    // direction — so the lead is part of the rig rather than a fault dialled on
    // top of it.
    const uHips = u + d.hipLead / Math.max(1e-6, d.motionSeconds)
    const hipYaw =
      spin *
      track(
        [
          [U.ready, shouldersAtTrophy + 4],
          [U.trophy, TRUNK_ZERO - d.hipYaw],
          // The hips' share by the drop, on the same serves: 31° of 74°.
          [U.drop, TRUNK_ZERO - d.hipYaw + 0.42 * (HIPS_AT_CONTACT - (TRUNK_ZERO - d.hipYaw))],
          [U.contact, HIPS_AT_CONTACT],
        ],
        uHips,
      )
    const tilt = track(
      [
        [U.ready, 2],
        [U.trophy, d.shoulderTilt],
        [U.contact, 6],
      ],
      u,
    )

    /* --- world frame ---------------------------------------------------- */
    // Origin is the hip centre, so the hips sit at y = 0 by construction.
    const world = new Array<Landmark>(33).fill(lm(0, 0, 0))

    const hipDir = { x: Math.cos(rad(hipYaw)), z: Math.sin(rad(hipYaw)) }
    world[LM.leftHip] = lm(-HALF_HIP * hipDir.x, 0, -HALF_HIP * hipDir.z)
    world[LM.rightHip] = lm(HALF_HIP * hipDir.x, 0, HALF_HIP * hipDir.z)

    const shDir = { x: Math.cos(rad(shoulderYaw)), z: Math.sin(rad(shoulderYaw)) }
    const shCos = Math.cos(rad(tilt))
    const shSin = Math.sin(rad(tilt))

    // Sideways collapse: the shoulder girdle slides across the hip line as the
    // motion runs, so the spine stops being a straight vertical column. Applied
    // as an offset to the whole girdle rather than as a rotation of each
    // shoulder, because that is what a player chasing a toss actually does —
    // the shoulders travel, they do not pivot in place.
    const leanDeg = track([[U.ready, 0], [U.trophy, d.spineLean * 0.35], [U.contact, d.spineLean]], u)
    const leanShift = Math.tan(rad(leanDeg)) * Math.abs(SHOULDER_DROP)
    const acrossHips = { x: hipDir.x, z: hipDir.z }
    const lx = acrossHips.x * leanShift
    const lz = acrossHips.z * leanShift

    // Right shoulder (the hitting side) drops as the tilt grows.
    world[LM.leftShoulder] = lm(
      lx - HALF_SHOULDER * shDir.x * shCos,
      SHOULDER_DROP - HALF_SHOULDER * shSin,
      lz - HALF_SHOULDER * shDir.z * shCos,
    )
    world[LM.rightShoulder] = lm(
      lx + HALF_SHOULDER * shDir.x * shCos,
      SHOULDER_DROP + HALF_SHOULDER * shSin,
      lz + HALF_SHOULDER * shDir.z * shCos,
    )
    // The face looks where the chest does: perpendicular to the shoulder line,
    // towards +z when side-on and towards the net (−x) when square.
    const facing = { x: -shDir.z, z: shDir.x }
    world[LM.nose] = lm(lx + facing.x * 0.06, NOSE_DROP, lz + facing.z * 0.06)

    // Legs: bend splits evenly between hip and ankle, which is enough for the
    // knee angle to come out as dialled.
    const half = rad(kneeBend / 2)
    /*
     * The landing, and it is nothing at all until the ball has gone.
     *
     * `track` clamps below its first key, so this is exactly zero for every
     * frame at or before contact whatever the dial says — which is what lets a
     * landing be posed without moving one existing expectation, since every
     * measurement in the engine reads a window ending at contact.
     *
     * The hips are this frame's origin, so hips travelling over planted feet is
     * the feet travelling the other way. Done from that end deliberately: moving
     * the origin would drag the whole upper body with it and turn a landing into
     * a translation of the entire player.
     */
    const landingShift = track(
      [
        [U.contact, 0],
        [1.35, d.landingLean],
      ],
      u,
    )
    /*
     * How much of the slide has happened by now, 0 at `ready` and 1 by the
     * trophy — and flat at 1 from there on.
     *
     * Finished before the trophy rather than before contact, because that is
     * when it happens: a pinpoint server brings the back foot up while the toss
     * is going up, and is standing on a narrow base by the time the legs load.
     * A slide still running through the drop would be a different motion, and
     * one no detector reading separation over time should be asked to name.
     */
    const slideRamp = track(
      [
        [U.ready, 0],
        [U.trophy, 1],
        [1.35, 1],
      ],
      u,
    )
    for (const side of ['left', 'right'] as const) {
      const hipI = side === 'left' ? LM.leftHip : LM.rightHip
      const kneeI = side === 'left' ? LM.leftKnee : LM.rightKnee
      const ankleI = side === 'left' ? LM.leftAnkle : LM.rightAnkle
      const heelI = side === 'left' ? LM.leftHeel : LM.rightHeel
      const toeI = side === 'left' ? LM.leftToe : LM.rightToe
      const h = world[hipI]
      let knee = lm(h.x, h.y + THIGH * Math.cos(half), h.z + THIGH * Math.sin(half))
      let ankle = lm(knee.x, knee.y + SHIN * Math.cos(half), knee.z - SHIN * Math.sin(half))

      /*
       * The back foot sliding up to the front one, before anything else touches
       * the leg.
       *
       * Applied to the ankle's own x, across the hip line, so it narrows the
       * stance rather than moving the player: the front foot does not move at
       * all, and the back one closes the gap. Done before the landing shift
       * because the two are sequential in life — you finish arriving before you
       * start leaving — and because the landing's own reach clamp has to be
       * computed against wherever this left the foot, not against where it
       * would have been.
       *
       * `solveKnee` afterwards for the reason the landing calls it: a foot moved
       * without re-solving the knee leaves a thigh and a shin that no longer add
       * up, which is the rig telling a lie rather than refusing.
       *
       * Skipped rather than applied at zero. Floating point does not promise a
       * zero-sized transform returns its input, and every band in `tiers.ts` was
       * set against the numbers the untouched path produces — so a platform
       * stance has to be bit-identical to a rig with no dial, not merely close.
       */
      if (d.pinpointSlide !== 0 && side === 'right') {
        const front = side === 'right' ? world[LM.leftHip] : world[LM.rightHip]
        // The gap to close, along the hip line: from this ankle to where the
        // front ankle stands, which is directly below the front hip.
        const gapX = front.x - ankle.x
        const gapZ = front.z - ankle.z
        const closed = clamp(d.pinpointSlide, 0, 1) * slideRamp
        ankle = lm(ankle.x + gapX * closed, ankle.y, ankle.z + gapZ * closed)
        knee = solveKnee(h, ankle)
      }

      /*
       * Skipped rather than applied at zero, which is the rule this rig already
       * follows for `trophyExternalRotation` and for the same reason: floating
       * point does not promise that a zero-sized transform returns its input,
       * and every band in `tiers.ts` was set against the numbers the untouched
       * path produces. A landing dialled to nothing has to be bit-identical to
       * no landing at all, not merely close.
       */
      if (landingShift !== 0) {
        // Clamped to what the leg can reach. The ankle starts directly below its
        // hip, so it can be carried sideways only until the leg is straight —
        // about 0.17 m on the landing's own knee bend. Past that the leg would
        // be over-extended and the solver would quietly shorten the segment
        // instead, which is a rig telling a lie rather than refusing.
        const drop = Math.abs(ankle.y - h.y)
        const room = Math.sqrt(Math.max(0, (THIGH + SHIN - 1e-3) ** 2 - drop * drop))
        /*
         * The back foot travels with the hips by , the
         * front foot stays planted. A right-handed serve lands on the left,
         * so the right leg is the trailing one -- see the dial.
         *
         * Subtracting the drag from this side own shift is what makes it
         * follow: the shift is how far the ankle moves AGAINST the hips, so a
         * foot that keeps pace with them moves not at all relative to them.
         */
        const follows = side === 'right' ? d.landingBackFootDrag : 0
        const shift = clamp(landingShift * (1 - follows), -room, room)
        ankle = lm(ankle.x - acrossHips.x * shift, ankle.y, ankle.z - acrossHips.z * shift)
        knee = solveKnee(h, ankle)
      }

      world[kneeI] = knee
      world[ankleI] = ankle
      world[heelI] = lm(ankle.x, ankle.y + 0.03, ankle.z - 0.04)
      world[toeI] = lm(ankle.x, ankle.y + 0.03, ankle.z + 0.12)
    }

    /* --- arms ----------------------------------------------------------- */
    // Wrists are placed directly; elbows are then solved onto the segment so
    // the limb lengths stay honest and the joint angles come out as dialled.
    const rSh = world[LM.rightShoulder]
    const lSh = world[LM.leftShoulder]

    const reachAboveHip = d.contactReach * HEIGHT_M - hipHeight
    const racketWrist = {
      // +x is away from the net: a right-hander stands side-on with the racket
      // shoulder back, so the hand starts on the back side and sweeps across to
      // finish *in front of* the hip line. Contact has to land net-ward of the
      // hips (negative x) or the rig is modelling a serve hit from behind the
      // head — which is a fault, and not one a serve labelled clean should have.
      // The sweep is also what tells the engine which way the net is, and a
      // clean serve should give it plenty to work with.
      //
      // Placed where the Bath serves put the hand, relative to the hips: well
      // back on the backswing as the ball goes up, behind the head at the
      // trophy and the drop, and 0.29 in front of the hips at contact.
      x: track(
        [
          [U.ready, 0.24],
          [U.toss, 0.72],
          [U.trophy, 0.45 + d.trophyForearmDrop * 0.6 - d.lateArmCock * 0.35],
          [U.drop, 0.31],
          [U.contact, -0.29],
        ],
        u,
      ),
      y: track(
        [
          [U.ready, 0.38],
          [U.toss, SHOULDER_DROP + 0.05],
          // A flattening arm drops the hand towards shoulder height, which is
          // the shape that lets a palm face the sky at all.
          // A laid-over arm (L5.2) carries the hand down to the shoulder line too.
          [U.trophy, SHOULDER_DROP - 0.2 + d.trophyForearmDrop + d.lateArmCock * 0.2 + 0.22 * d.trophyArmLayOver],
          [U.drop, SHOULDER_DROP + d.dropBelowShoulder],
          [U.contact, -reachAboveHip],
          // The hand leaves contact immediately. Without this key the smoothstep
          // either side of contact makes a flat plateau, and a plateau has no
          // well-defined peak for anything to find.
          //
          // At least 0.44 m under contact, which is where the default serve puts
          // it. A fixed height let a low reach sit *under* its own follow-through
          // — below about 1.19 the hand peaked after contact — so no dial could
          // pose a contact lower than about 1.14 body heights. That was invisible
          // while the contact band started at 1.28. Clamped with `min` so the
          // default serve's key is the same number it always was.
          [1.1, -Math.min(0.95, reachAboveHip - 0.44)],
          [1.35, 0.1],
        ],
        u,
      ),
      // +z is the player's right. Side-on, that is in front of the chest, so the
      // hand starts there and goes round behind the head — the player's left —
      // for the trophy and the drop, then comes over to strike in line with the
      // body. The rig used to swing this the other way round, the hand behind
      // the right shoulder at the trophy, which only fits a player square to the
      // net (Bath: +0.24, −0.17, −0.26, −0.19, +0.02).
      z: track(
        [
          [U.ready, 0.24],
          [U.toss, -0.17],
          [U.trophy, -0.26],
          [U.drop, -0.19],
          [U.contact, 0.02],
        ],
        u,
      ),
    }

    // Occlusion: held at the position last seen, not at the true one — see
    // `occlusionSeconds`. Position only; visibility stays at 1 below, because a
    // model that guessed and did not admit it is exactly the failure this
    // dial exists to drive.
    if (d.occlusionSeconds > 0 && u >= U.drop && u < occlusionEnd) {
      frozenWrist ??= { ...racketWrist }
      racketWrist.x = frozenWrist.x
      racketWrist.y = frozenWrist.y
      racketWrist.z = frozenWrist.z
    }

    // Tossing arm: up to full stretch at release, held, then folded away. The
    // hold fraction controls when it drops back below the shoulder.
    const dropStart = U.toss + (U.contact - U.toss) * d.tossArmHold
    const tossWrist = {
      // The two wobble dials, on the two axes they are named for. Splitting them
      // costs one term and buys the only thing that can catch an axis being
      // mislabelled: a serve that wanders on one axis and is dead still on the
      // other. With a single dial on x, a measurement reading raw image x scored
      // identically whether it was told the answer was depth or lateral.
      x:
        track([[U.ready, -0.16], [U.toss, -0.1], [U.contact, -0.22]], u) +
        Math.sin(u * 37) * d.tossWobble,
      y: track(
        [
          [U.ready, 0.36],
          [U.toss, SHOULDER_DROP - 0.55],
          [dropStart, SHOULDER_DROP - 0.5],
          [Math.min(0.999, dropStart + 0.12), SHOULDER_DROP + 0.16],
          [U.contact, 0.1],
        ],
        u,
      ),
      // In front of the chest at the start, holding the ball beside the racket,
      // then straight up over the front foot (Bath: +0.26, +0.04, −0.03).
      z:
        track([[U.ready, 0.26], [U.toss, 0.04], [U.contact, -0.03]], u) +
        Math.sin(u * 37) * d.tossWobbleLateral,
    }

    if (d.noSwing) {
      // Idling: both hands stay down by the hips with a little sway.
      racketWrist.x = 0.2
      racketWrist.y = 0.34 + Math.sin(t * 2.1) * 0.03
      racketWrist.z = 0.08
      tossWrist.x = -0.18
      tossWrist.y = 0.34 + Math.cos(t * 1.7) * 0.03
      tossWrist.z = 0.06
    }

    world[LM.rightWrist] = lm(racketWrist.x, racketWrist.y, racketWrist.z)
    world[LM.leftWrist] = lm(tossWrist.x, tossWrist.y, tossWrist.z)
    /*
     * The racket elbow, bent the way a real one bends at each moment.
     *
     * Any point on the circle round the shoulder–hand line is a valid elbow,
     * and which one is the difference between two different arms. The hints
     * are directions taken from the Bath serves' elbows relative to the
     * shoulder: down and a little back holding the racket at the start, back
     * on the backswing, straight back at the trophy, back, out and up at the
     * drop (where `dropElbowLift` takes over), forward and up at contact.
     */
    const elbowHint = {
      x: track([[U.ready, 0.2], [U.toss, 1], [U.trophy, 1], [U.drop, 0.6], [U.contact, -0.4]], u),
      y: track([[U.ready, 1], [U.toss, 0.5], [U.trophy, 0], [U.drop, -d.dropElbowLift], [U.contact, -0.8]], u),
      z: track([[U.ready, 0.3], [U.toss, 0], [U.trophy, 0], [U.drop, 0.65], [U.contact, 0.45]], u),
    }
    // The arm laid over (L5.2): the elbow pulled down towards the ribs through
    // the cocking, by a hint that outweighs the others at full dial. Skipped at
    // zero so the default serve is untouched.
    if (d.trophyArmLayOver !== 0) {
      const over = d.trophyArmLayOver * track([[U.toss, 0], [U.trophy, 1], [U.drop, 1], [U.contact, 0]], u)
      elbowHint.y += 3 * over
      elbowHint.z -= 1.5 * over
    }
    world[LM.rightElbow] = solveElbowToward(rSh, world[LM.rightWrist], elbowHint)
    world[LM.leftElbow] = solveElbow(lSh, world[LM.leftWrist], -1, rad(180 - d.tossElbow))

    /*
     * External rotation, applied after the elbow is solved and before the hand
     * is placed.
     *
     * Order is the whole trick. Rotating the wrist first would move the target
     * `solveElbow` places the elbow against, which is how a rotation turns into
     * a different arm; rotating it after means the shoulder and the elbow are
     * both already fixed, the axis between them is the humerus, and the elbow
     * sits on that axis — so the rotation cannot change a single segment length.
     * `placeHand` reads elbow→wrist afterwards, so the hand follows the forearm
     * round without needing to know this happened.
     *
     * Skipped entirely at zero rather than applied as a zero-degree rotation, so
     * the default path is byte-identical to what it was before this dial
     * existed — floating point does not promise that a rotation by 0 returns the
     * same numbers, and every band in `tiers.ts` was set against those numbers.
     */
    if (d.trophyExternalRotation !== 0) {
      const weight = track(
        [
          [U.toss, 0],
          [U.trophy, 1],
          [U.drop, 0],
        ],
        u,
      )
      if (weight !== 0) {
        world[LM.rightWrist] = rotateAboutAxis(
          world[LM.rightWrist],
          rSh,
          world[LM.rightElbow],
          rad(d.trophyExternalRotation) * weight,
        )
      }
    }
    // Fill the face landmarks the app never reads, so indices are safe.
    for (let k = 0; k < 33; k++) if (!world[k]) world[k] = lm(0, NOSE_DROP, 0)
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) world[k] = lm(0, NOSE_DROP, 0.04)
    for (const k of [21, 22]) world[k] = k === 21 ? world[LM.leftWrist] : world[LM.rightWrist]

    // Hands. The knuckles used to sit on the forearm line, one a few
    // millimetres past the other — enough to point a racket along, and useless
    // for anything that needs the hand's *plane*, because two points strung out
    // along an axis do not have one. They are now a real knuckle line: across
    // the hand, perpendicular to the forearm, rotated about it by the grip.
    //
    // The tossing hand keeps a fixed neutral rotation; nothing measures it, and
    // giving it a dial would only be a second thing to get wrong.
    const palmAt = track(
      [
        [U.ready, d.palmToSky],
        [U.trophy, d.palmToSky],
        // Pronation happens through contact, not before it: the palm holds its
        // grip orientation into the drop and turns over as the arm extends.
        [U.drop, d.palmToSky],
        [U.contact, d.palmToSky + d.pronation * 0.55],
        [1.12, d.palmToSky + d.pronation],
      ],
      u,
    )
    placeHand(world, 'right', palmAt)
    placeHand(world, 'left', 10)

    // The racket, for the picture (L4.4): off the forearm, laid back in the
    // swing plane — a turn about the court's sideways axis — and as long as the
    // estimate `racket.ts` draws for a tracked serve, so the two read alike.
    // Built in the court's frame, before the camera turn below, and projected
    // with the landmarks.
    const layBack = rad(
      track(
        [
          [U.ready, 10],
          [U.toss, 25],
          [U.trophy, 35],
          [U.drop, d.racketLayBack],
          [U.contact, 5],
          [1.12, 15],
        ],
        u,
      ),
    )
    const rElbow = world[LM.rightElbow]
    const rWrist = world[LM.rightWrist]
    const fore = unitOf(rWrist.x - rElbow.x, rWrist.y - rElbow.y, rWrist.z - rElbow.z)
    // Turned off the forearm towards down-and-back, the way lag pulls the
    // head: wherever the forearm points — up at the trophy, out to the side
    // at the drop — the lay-back drops the racket behind it, never past that
    // direction itself.
    // A negative lay-back turns the head towards the sky instead: the racket
    // held up rather than let fall, which is what a shallow drop looks like.
    const lag = layBack >= 0 ? unitOf(LAG_BACK, 1, 0) : unitOf(LAG_BACK, -1, 0)
    const apart = Math.acos(clamp(fore.x * lag.x + fore.y * lag.y + fore.z * lag.z, -1, 1))
    const turn = Math.min(Math.abs(layBack), apart)
    const wFore = apart > 1e-6 ? Math.sin(apart - turn) / Math.sin(apart) : 1
    const wLag = apart > 1e-6 ? Math.sin(turn) / Math.sin(apart) : 0
    const racketDir = unitOf(
      fore.x * wFore + lag.x * wLag,
      fore.y * wFore + lag.y * wLag,
      fore.z * wFore + lag.z * wLag,
    )
    const racketWorld = {
      grip: { x: rWrist.x, y: rWrist.y, z: rWrist.z },
      head: {
        x: rWrist.x + racketDir.x * RACKET_REACH_M,
        y: rWrist.y + racketDir.y * RACKET_REACH_M,
        z: rWrist.z + racketDir.z * RACKET_REACH_M,
      },
    }

    /* --- project -------------------------------------------------------- */
    const cam = rad(90 - d.cameraYaw)
    // Gaussian-ish jitter from the sum of two uniforms, cheap and good enough.
    const jitter = () => (d.noise ? ((rand() + rand()) / 2 - 0.5) * 2 * d.noise : 0)
    // The depth axis, which the camera never measured. Scaled up because the
    // network infers it, and given a shared per-frame offset on top because it
    // infers it for the whole body at once.
    const frameDepthBias = d.depthBias ? ((rand() + rand()) / 2 - 0.5) * 2 * d.depthBias : 0
    const zJitter = () => jitter() * d.depthNoise + frameDepthBias
    // A straight line across the whole clip, centred on zero so `cameraPan`
    // reads as the total drift end to end rather than the drift from some
    // arbitrary start. `Math.max(1, count - 1)` only guards a one-frame clip,
    // which no real dial combination produces — `count` follows `preroll` +
    // `postroll` + `motionSeconds`, all positive, at whatever `fps` is passed.
    const pan = d.cameraPan * (i / Math.max(1, count - 1) - 0.5)
    // 1.0 at the first frame, true to the stance calibration `cameraZoom`'s
    // own doc comment describes — ramping linearly across the clip rather
    // than centred like `pan`, because the thing under test is a
    // calibration taken early drifting out of date, not a symmetric wobble.
    const zoom = 1 + d.cameraZoom * (i / Math.max(1, count - 1))

    /*
     * World landmarks in the CAMERA's frame, as MediaPipe reports them: x
     * across the picture, y down, z away from the lens, origin at the hips
     * (`kinematics.ts` has the convention note). The pose above is built in the
     * court's frame, and it used to be handed over in it — so the 3D pose came
     * out the same from every camera, and the depth noise below landed on the
     * court's sideways axis wherever the phone stood. At the guide's placement
     * the two frames all but coincide, which is why nothing noticed; anywhere
     * else the rig was modelling a tracker that knows where the net is. The
     * rotation is the one the picture uses, so the two agree by construction.
     * Aliased slots (the hand landmarks that share the wrist) stay aliased.
     */
    const cosCam = Math.cos(cam)
    const sinCam = Math.sin(cam)
    const turned = new Map<Landmark, Landmark>()
    for (let k = 0; k < world.length; k++) {
      const p = world[k]
      let q = turned.get(p)
      if (!q) {
        q = lm(p.x * cosCam - p.z * sinCam, p.y, p.x * sinCam + p.z * cosCam)
        turned.set(p, q)
      }
      world[k] = q
    }

    const image = world.map((p) => {
      // Already turned to the camera above, so the picture is the world with
      // depth dropped.
      const heightAboveGround = hipHeight - p.y
      const rawX = 0.5 + p.x * SCALE
      const rawY = GROUND_Y - heightAboveGround * SCALE
      // Scaled about the player's own ground anchor, not the frame centre —
      // a pan-like image-position shift would otherwise ride along with
      // the zoom and confound the two dials' own separate questions.
      return lm(
        0.5 + (rawX - 0.5) * zoom + jitter() + pan,
        GROUND_Y + (rawY - GROUND_Y) * zoom + jitter(),
        p.z + zJitter(),
      )
    })

    if (d.noise || frameDepthBias) {
      // World landmarks come from the same tracker and are just as jittery — but
      // they are in metres, so the image-space figure has to be converted rather
      // than reused. One frame unit spans HEIGHT_M / 0.54 metres here, so 0.6% of
      // the frame is about 2 cm in the world, which is the right order for
      // MediaPipe.
      const toMetres = 1 / SCALE
      for (const p of world) {
        p.x += jitter() * toMetres
        p.y += jitter() * toMetres
        p.z += zJitter() * toMetres
      }
    }

    // Poor light: every landmark a little less certain, all at once — the
    // whole-body counterpart to `dropout`'s one limb. Applied before it so a
    // dropped limb on a dark clip still reads as more degraded than the rest
    // of the body, the way a tracker losing a limb entirely would.
    if (d.lightLevel < 1) {
      for (const p of image) p.visibility = clamp(d.lightLevel, 0, 1)
    }

    // Occlusion: a limb the tracker briefly loses, reported as low visibility
    // rather than removed — which is exactly how MediaPipe behaves.
    if (d.dropout && rand() < d.dropout) {
      const limb = rand() < 0.5 ? [LM.leftKnee, LM.leftAnkle] : [LM.rightKnee, LM.rightAnkle]
      for (const k of limb) image[k] = { ...image[k], visibility: 0.15 }
    }

    // The racket through the same camera, picture scale, pan and zoom as the
    // landmarks, without their jitter: it is drawn, never measured.
    const racketAt = (p: { x: number; y: number; z: number }) => {
      const x = p.x * cosCam - p.z * sinCam
      const rawX = 0.5 + x * SCALE
      const rawY = GROUND_Y - (hipHeight - p.y) * SCALE
      return { x: 0.5 + (rawX - 0.5) * zoom + pan, y: GROUND_Y + (rawY - GROUND_Y) * zoom }
    }
    const racket = { grip: racketAt(racketWorld.grip), head: racketAt(racketWorld.head) }

    frames.push({ index: i, t, image, world, visibility: 1, racket })
  }

  return frames
}

/**
 * Rotate a point about the axis running through two others — Rodrigues.
 *
 * Written out rather than pulled from `geometry.ts`, which has no rotation in
 * it: that module measures angles off landmarks the tracker produced, and this
 * one poses landmarks a tracker would have seen. A rotation living there would
 * be the engine owning a way to move a body.
 *
 * Distance from `a` and from `b` is preserved exactly, because both lie on the
 * axis — which is the property `trophyExternalRotation` is built on, and the one
 * `trophyForearmDrop` does not have.
 */
function rotateAboutAxis(p: Landmark, a: Landmark, b: Landmark, theta: number): Landmark {
  const ax = b.x - a.x
  const ay = b.y - a.y
  const az = b.z - a.z
  const n = Math.hypot(ax, ay, az)
  if (n < 1e-9) return p

  const kx = ax / n
  const ky = ay / n
  const kz = az / n

  // Relative to a point on the axis, so the rotation is about the line rather
  // than about a parallel line through the origin.
  const vx = p.x - a.x
  const vy = p.y - a.y
  const vz = p.z - a.z

  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const dot = kx * vx + ky * vy + kz * vz
  const cx = ky * vz - kz * vy
  const cy = kz * vx - kx * vz
  const cz = kx * vy - ky * vx

  return {
    x: a.x + vx * c + cx * s + kx * dot * (1 - c),
    y: a.y + vy * c + cy * s + ky * dot * (1 - c),
    z: a.z + vz * c + cz * s + kz * dot * (1 - c),
    visibility: p.visibility,
  }
}

/**
 * Place a knee on a hip→ankle segment, keeping both leg segments honest.
 *
 * The same law of cosines `solveElbow` uses, written separately rather than
 * generalising that one, because it hard-codes `UPPER_ARM` and `FOREARM` and a
 * shared solver taking four arguments would be read at every call site to work
 * out which limb it was about. Cycle 91 made the same call for its rotation
 * helper: local beats general when the general version is one parameter away
 * from being unreadable.
 *
 * EXACT AT REST, and this is what makes it safe to introduce. With `THIGH` equal
 * to `SHIN` the rig's own leg puts the ankle directly below the hip, so this
 * solver returns the same knee the straightforward placement does — the bulge
 * comes out as `THIGH · sin(half)` either way. It is still not called at rest:
 * the two are equal in arithmetic and not in floating point, and every band in
 * `tiers.ts` was set against the numbers the existing path produces. See the
 * guard at the call site.
 *
 * The knee bulges towards +z, which is the direction the rig's own leg bends and
 * so the direction a knee in front of a player points.
 */
function solveKnee(hip: Landmark, ankle: Landmark): Landmark {
  const dx = ankle.x - hip.x
  const dy = ankle.y - hip.y
  const dz = ankle.z - hip.z
  const span = Math.hypot(dx, dy, dz)
  const reach = Math.min(span, THIGH + SHIN - 1e-3)
  const a = (THIGH ** 2 - SHIN ** 2 + reach ** 2) / (2 * Math.max(reach, 1e-4))
  const h = Math.sqrt(Math.max(0, THIGH ** 2 - a * a))

  const ux = dx / Math.max(span, 1e-6)
  const uy = dy / Math.max(span, 1e-6)
  const uz = dz / Math.max(span, 1e-6)

  // +z with its component along the leg removed, which is the perpendicular a
  // forward-pointing knee sits on. A leg lying exactly along z would leave this
  // with no length, and cannot happen here — the rig's legs are within a few
  // degrees of vertical — but it falls back rather than dividing by nothing.
  let px = -ux * uz
  let py = -uy * uz
  let pz = 1 - uz * uz
  const plen = Math.hypot(px, py, pz)
  if (plen < 1e-6) {
    px = 0
    py = 0
    pz = 1
  } else {
    px /= plen
    py /= plen
    pz /= plen
  }

  return lm(hip.x + ux * a + px * h, hip.y + uy * a + py * h, hip.z + uz * a + pz * h)
}

/**
 * Place an elbow on a shoulder→wrist segment, on the side a hint points to.
 *
 * Exact lengths: the elbow is the point of the circle the two segments allow
 * that lies nearest the hint, so the upper arm and forearm come out at their
 * own lengths whenever the hand is in reach. (Past reach — the stretched
 * contact `contactReach` still asks for — the elbow sits on the line and the
 * forearm takes up the rest, as it always has.)
 */
function solveElbowToward(sh: Landmark, wr: Landmark, hint: { x: number; y: number; z: number }): Landmark {
  const dx = wr.x - sh.x
  const dy = wr.y - sh.y
  const dz = wr.z - sh.z
  const span = Math.hypot(dx, dy, dz)
  const reach = Math.min(span, UPPER_ARM + FOREARM - 1e-3)
  const a = (UPPER_ARM ** 2 - FOREARM ** 2 + reach ** 2) / (2 * Math.max(reach, 1e-4))
  const h = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - a * a))
  const ux = dx / Math.max(span, 1e-6)
  const uy = dy / Math.max(span, 1e-6)
  const uz = dz / Math.max(span, 1e-6)
  // The hint with its component along the arm removed: the direction on the
  // circle it points at.
  const along = hint.x * ux + hint.y * uy + hint.z * uz
  let px = hint.x - along * ux
  let py = hint.y - along * uy
  let pz = hint.z - along * uz
  const pn = Math.hypot(px, py, pz)
  if (pn < 1e-6) {
    // A hint straight along the arm says nothing about the bend; fall back to up.
    px = -ux * -uy
    py = -1 - uy * -uy
    pz = -uz * -uy
  }
  const n = Math.hypot(px, py, pz) || 1
  return lm(sh.x + ux * a + (px / n) * h, sh.y + uy * a + (py / n) * h, sh.z + uz * a + (pz / n) * h)
}

/**
 * Place an elbow on a shoulder→wrist segment given the limb lengths, bulging to
 * one side. `straighten` forces a near-straight arm (used for the tossing arm).
 */
function solveElbow(sh: Landmark, wr: Landmark, side: 1 | -1, straighten?: number): Landmark {
  const dx = wr.x - sh.x
  const dy = wr.y - sh.y
  const dz = wr.z - sh.z
  const span = Math.hypot(dx, dy, dz)

  if (straighten !== undefined) {
    // Sit the elbow just off the straight line by the requested bend.
    const bulge = (Math.sin(straighten / 2) * (UPPER_ARM + FOREARM)) / 2
    const t = UPPER_ARM / (UPPER_ARM + FOREARM)
    return {
      x: sh.x + dx * t + bulge * side,
      y: sh.y + dy * t,
      z: sh.z + dz * t + bulge * 0.3,
      visibility: 1,
    }
  }

  const reach = Math.min(span, UPPER_ARM + FOREARM - 1e-3)
  // Distance along the segment to the elbow's foot, from the law of cosines.
  const a = (UPPER_ARM ** 2 - FOREARM ** 2 + reach ** 2) / (2 * Math.max(reach, 1e-4))
  const h = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - a * a))
  const ux = dx / Math.max(span, 1e-6)
  const uy = dy / Math.max(span, 1e-6)
  const uz = dz / Math.max(span, 1e-6)

  // Any unit vector perpendicular to the arm places a valid elbow, and which
  // one is chosen is the difference between two completely different arms. A
  // purely sideways bulge hangs the elbow below the shoulder — a windmill — and
  // the rig produced that on every frame, so a serve dialled clean came back
  // with a collapsed elbow at the bottom of its racket drop.
  //
  // A racket drop is the opposite shape: elbow up and out, racket head hanging
  // down the back. So the bulge tilts towards vertical in proportion to how far
  // the hand has fallen below the shoulder, which is exactly when a real arm
  // does it, and leaves the near-straight arm at contact untouched.
  const belowShoulder = Math.max(0, uy)
  const upX = -ux * -uy
  const upY = -1 - uy * -uy
  const upZ = -uz * -uy
  const upN = Math.hypot(upX, upY, upZ) || 1
  let px = (-uy) * (1 - belowShoulder) + (upX / upN) * belowShoulder
  let py = ux * (1 - belowShoulder) + (upY / upN) * belowShoulder
  let pz = (upZ / upN) * belowShoulder
  const pn = Math.hypot(px, py, pz) || 1
  px /= pn
  py /= pn
  pz /= pn
  return {
    x: sh.x + ux * a + px * h * side,
    y: sh.y + uy * a + py * h * side,
    z: sh.z + uz * a + pz * h * side + h * 0.35,
    visibility: 1,
  }
}

/** Grip to the middle of the strings, as `racket.ts`'s `RACKET_REACH` of a stature. */
const RACKET_REACH_M = 0.31 * HEIGHT_M

/** How far back from straight down the lagging racket head is pulled: away from the net. */
const LAG_BACK = 0.4

const HAND_LENGTH = 0.09
const KNUCKLE_HALF_SPAN = 0.042

/**
 * Put a hand on the end of a forearm, rotated about it by the grip.
 *
 * `palmToSky` is how far the palm is turned towards facing upwards, in degrees,
 * and it is realised by rotating the knuckle line about the forearm axis — which
 * is exactly what changing grip does to a hand holding a racket. The elevation
 * the palm can actually reach is bounded by the forearm's own tilt: with the
 * forearm dead vertical every direction across the hand is horizontal, so no
 * grip can present the palm to the sky. That is a fact about arms, not a
 * limitation of the rig, and it is why a waiter's tray comes with a flattened
 * arm in the first place.
 *
 * The chirality flip mirrors the hand for the left side, so a left-hander's
 * neutral grip does not come back reading as somebody else's fault.
 */
function placeHand(world: Landmark[], side: 'left' | 'right', palmToSky: number) {
  const elbow = world[side === 'left' ? LM.leftElbow : LM.rightElbow]
  const wrist = world[side === 'left' ? LM.leftWrist : LM.rightWrist]
  const chirality = side === 'left' ? -1 : 1

  const f = unitOf(wrist.x - elbow.x, wrist.y - elbow.y, wrist.z - elbow.z)

  // The most upward direction available perpendicular to the forearm, and its
  // partner. Any palm direction perpendicular to the arm is a rotation in this
  // plane, and `e1` is the one that points as close to the sky as the arm
  // allows — so asking for elevation reduces to a single angle from it.
  const fUp = -f.y
  const e1 = unitOf(-f.x * fUp, -1 - f.y * fUp, -f.z * fUp)
  const e2 = crossOf(f, e1)
  const reach = Math.hypot(e1.x, e1.y, e1.z) < 1e-6 ? 0 : Math.hypot(-f.x * fUp, -1 - f.y * fUp, -f.z * fUp)

  // Solve the rotation that lands the palm normal at the requested elevation,
  // and settle for the closest achievable when the arm cannot reach it.
  const wanted = Math.sin(rad(Math.max(0, palmToSky)))
  const phi = Math.acos(Math.max(-1, Math.min(1, reach > 1e-6 ? wanted / reach : 1)))

  const n = {
    x: e1.x * Math.cos(phi) + e2.x * Math.sin(phi),
    y: e1.y * Math.cos(phi) + e2.y * Math.sin(phi),
    z: e1.z * Math.cos(phi) + e2.z * Math.sin(phi),
  }
  // Knuckle line: perpendicular to both the forearm and the palm normal, which
  // makes the normal come back out of the plane the detector reconstructs.
  const k = crossOf(n, f)

  const base = {
    x: wrist.x + f.x * HAND_LENGTH,
    y: wrist.y + f.y * HAND_LENGTH,
    z: wrist.z + f.z * HAND_LENGTH,
  }
  const span = KNUCKLE_HALF_SPAN * chirality
  world[side === 'left' ? LM.leftIndex : LM.rightIndex] = lm(
    base.x + k.x * span,
    base.y + k.y * span,
    base.z + k.z * span,
  )
  world[side === 'left' ? LM.leftPinky : LM.rightPinky] = lm(
    base.x - k.x * span,
    base.y - k.y * span,
    base.z - k.z * span,
  )
  world[side === 'left' ? LM.leftThumb : LM.rightThumb] = lm(
    base.x + k.x * span * 0.5 + n.x * 0.02,
    base.y + k.y * span * 0.5 + n.y * 0.02,
    base.z + k.z * span * 0.5 + n.z * 0.02,
  )
}

function unitOf(x: number, y: number, z: number) {
  const n = Math.hypot(x, y, z) || 1
  return { x: x / n, y: y / n, z: z / n }
}

function crossOf(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return unitOf(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}


/* --------------------------------------------------------------- the ball */

/** Where the rig's tossed ball goes, relative to the front foot at the ready. */
export interface RigToss {
  /** Metres towards the net from the front ankle, at the top of the toss. */
  forward: number
  /** Metres towards the hitting side from the front ankle, at the top. */
  sideways: number
  /** Height of the top above the ground, in statures. 1.75 by default. */
  apex?: number
}

/**
 * A ball for the rig, which throws none: released from the tossing hand at
 * the top of its lift, rising to `toss`'s apex, and falling for a third of a
 * second after it (D3.1).
 *
 * Built in the court's frame from the frames the rig already made — the front
 * ankle and the release point are read back out of them — and filmed through
 * the same camera turn and the same picture scale, so a forward toss moves
 * along image x from the side and barely at all from behind, as a real one
 * does. The rig films without perspective, at an aspect of one, so the
 * ball's x and a landmark's x share a unit. Every sample is on the arc.
 */
export function rigBall(frames: Frame[], toss: RigToss, dials: Partial<ServeDials> = {}): import('../vision/ballTrack').BallFlight {
  const d = { ...CLEAN_SERVE, ...dials }
  const cam = rad(90 - d.cameraYaw)
  const cos = Math.cos(cam)
  const sin = Math.sin(cam)
  // Back from the camera's turn to the court's, hip-relative: x away from the
  // net, z towards the player's right.
  const court = (p: Landmark) => ({ x: p.x * cos + p.z * sin, z: -p.x * sin + p.z * cos })
  const height = (p: Landmark) => (GROUND_Y - p.y) / SCALE

  // The tossing hand is the left one on this right-handed rig; it lets go at
  // the top of its lift, in the first two thirds of the clip.
  const searchTo = Math.floor(frames.length * 0.66)
  let release = 0
  for (let i = 1; i < searchTo; i++) {
    if (frames[i].image[LM.leftWrist].y < frames[release].image[LM.leftWrist].y) release = i
  }
  const from = court(frames[release].world[LM.leftWrist])
  const fromH = height(frames[release].image[LM.leftWrist])
  const foot = court(frames[0].world[LM.leftAnkle])
  // The hitting side across the court, from which way the racket shoulder sits
  // of the tossing one at the ready — not a fixed axis, since the stance turns.
  const hitting = Math.sign(court(frames[0].world[LM.rightShoulder]).z - court(frames[0].world[LM.leftShoulder]).z) || 1
  const to = { x: foot.x - toss.forward, z: foot.z + toss.sideways * hitting }
  const apexH = (toss.apex ?? 1.75) * HEIGHT_M
  const g = 9.81
  const rise = Math.sqrt((2 * Math.max(0.05, apexH - fromH)) / g)
  const t0 = frames[release].t
  const ta = t0 + rise

  const at = (t: number) => {
    const u = (t - t0) / rise
    const x = from.x + (to.x - from.x) * u
    const z = from.z + (to.z - from.z) * u
    return {
      x: 0.5 + (x * cos - z * sin) * SCALE,
      y: GROUND_Y - (apexH - (g / 2) * (t - ta) ** 2) * SCALE,
    }
  }
  const samples = frames.filter((f) => f.t >= t0 && f.t <= ta + 0.33).map((f) => ({ t: f.t, ...at(f.t) }))
  const k = (g / 2) * SCALE
  const c0 = GROUND_Y - apexH * SCALE
  return {
    // y = c0 + k (t − ta)², expanded in powers of t.
    coefficients: [c0 + k * ta * ta, -2 * k * ta, k],
    apex: { t: ta, ...at(ta) },
    samples,
    confidence: 0.9,
  }
}

/**
 * Where a model serve's toss peaks by default, in statures above the ground:
 * inside the toss band (`tossPeakHeight`, 1.38–2.1) and a little over the
 * strings at contact, so the ball falls a short way into the racket.
 */
export const MODEL_TOSS_APEX = 1.8

/**
 * The ball a model serve hits (L4.4, L4.5): carried in the tossing hand, let
 * go where the hand meets its arc, peaking at `apex` statures and falling
 * into the middle of the strings at contact, under gravity at the rig's own
 * picture scale.
 *
 * Unlike `rigBall`, which is a toss placed for the engine to read, this one
 * is placed for the eye: whatever the dials did to the arm and the legs, the
 * drawn ball arrives where the drawn racket is, and a toss fault is a choice
 * of apex. The samples start at the release; before it the ball is in the
 * hand, which a player draws from the wrist. Right-handed, as the rig builds;
 * mirror the result for a left-hander. Undefined for frames with no racket.
 */
export function rigStrikeFlight(
  frames: Frame[],
  contact: number,
  apex: number = MODEL_TOSS_APEX,
): import('../vision/ballTrack').BallFlight | undefined {
  const hit = frames[contact]?.racket
  if (!hit) return undefined
  const t1 = frames[contact].t
  const k = (9.81 / 2) * SCALE
  // The top, never below the strings: a ball has to come down to be hit.
  const yA = Math.min(GROUND_Y - apex * HEIGHT_M * SCALE, hit.head.y - 1e-3)
  const ta = t1 - Math.sqrt((hit.head.y - yA) / k)
  const arcY = (t: number) => yA + k * (t - ta) ** 2
  // Let go where the tossing hand comes closest to the arc on its way up.
  let release = -1
  let gap = Infinity
  for (let i = 0; i < contact && frames[i].t < ta; i++) {
    const d = Math.abs(frames[i].image[LM.leftWrist].y - arcY(frames[i].t))
    if (d < gap) {
      gap = d
      release = i
    }
  }
  if (release < 0) return undefined
  const t0 = frames[release].t
  const from = frames[release].image[LM.leftWrist]
  const x = (t: number) => from.x + ((hit.head.x - from.x) * (t - t0)) / (t1 - t0)
  const samples = frames.filter((f) => f.t >= t0 && f.t <= t1).map((f) => ({ t: f.t, x: x(f.t), y: arcY(f.t) }))
  return {
    // yA + k(t − ta)², expanded in powers of t.
    coefficients: [yA + k * ta * ta, -2 * k * ta, k],
    apex: { t: ta, x: x(ta), y: yA },
    samples,
    confidence: 1,
  }
}
