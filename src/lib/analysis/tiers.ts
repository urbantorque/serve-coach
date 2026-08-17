/**
 * What to ask of this player, at their level, this month.
 *
 * Every threshold elsewhere in the engine is a fixed band describing a
 * well-struck serve. That is the right thing to score against and the wrong
 * thing to *aim* at: a 4.0 club player told to produce a tour racket drop is
 * being handed a target they will not reach this season, and a target nobody
 * reaches is indistinguishable from no target at all. Worse, several of these
 * are flexibility-bound — shoulder separation, external rotation — and chasing a
 * professional number on a forty-year-old shoulder is how people get hurt.
 *
 * So each signal carries a ladder of bands anchored at four rating points, and
 * the target handed back is always the band one tier above where the player
 * currently sits. A 4 is asked for a 5's separation. A 7 is asked for an 8's.
 * The ladder is anchored rather than continuous because four honest reference
 * points interpolate cleanly, and twenty invented ones would only look precise.
 *
 * Ratings here are UTR-shaped: roughly 1–3 beginner, 4–6 club, 7–9 strong
 * sectional, 10+ professional. Nothing in the engine requires the number to be a
 * real UTR — it is a position on this ladder, and `inferTier` will estimate one
 * from the serve itself when the player has not said.
 */

import { clamp, lerp } from './geometry'

/** Which direction on this axis is better, which decides how a band is read. */
export type Direction = 'higher' | 'lower' | 'band'

export interface SignalSpec {
  id: string
  unit: 'deg' | 'ms' | 'ratio'
  direction: Direction
  /** Acceptable band at ratings 3, 5, 7 and 9. Interpolated in between. */
  anchors: { 3: [number, number]; 5: [number, number]; 7: [number, number]; 9: [number, number] }
  /**
   * How far outside the band counts as a serious fault rather than a near miss.
   * In the signal's own units, so severity means the same thing on an axis in
   * degrees and one in milliseconds.
   */
  seriousMiss: number
}

/**
 * The ladder.
 *
 * Deliberately gentle at the bottom and never tour-level at the top: the 9-rung
 * of every flexibility-bound signal sits at what a fit strong amateur can hold
 * without forcing a joint, not at what a professional produces. The engine's job
 * is to move somebody one rung, not to describe the best serve ever filmed.
 */
export const SIGNALS: Record<string, SignalSpec> = {
  /* --- grip and the racket face ------------------------------------------ */
  palm_to_sky_deg: {
    id: 'palm_to_sky_deg',
    unit: 'deg',
    direction: 'lower',
    // How far the palm has rotated towards facing the sky at the trophy. A
    // continental grip keeps the hand roughly edge-on; a waiter's tray turns it
    // flat under the racket. Nobody is asked for a perfect zero.
    anchors: { 3: [0, 58], 5: [0, 45], 7: [0, 32], 9: [0, 24] },
    seriousMiss: 22,
  },

  /* --- sequencing --------------------------------------------------------- */
  hip_lead_ms: {
    id: 'hip_lead_ms',
    unit: 'ms',
    direction: 'higher',
    // How long the hips fire before the shoulders. Negative means the shoulders
    // went first, which is arming the ball. The upper bound is open in practice;
    // it is capped so a mis-detection cannot read as a virtue.
    anchors: { 3: [8, 220], 5: [22, 220], 7: [36, 220], 9: [50, 220] },
    seriousMiss: 45,
  },
  separation_deg: {
    id: 'separation_deg',
    unit: 'deg',
    direction: 'higher',
    // Hip-to-shoulder coil at the trophy. A tour serve reaches the fifties; a
    // healthy club torso does not, and demanding it produces back pain rather
    // than racket-head speed.
    anchors: { 3: [8, 46], 5: [13, 48], 7: [19, 52], 9: [25, 55] },
    seriousMiss: 12,
  },

  /* --- posture ------------------------------------------------------------ */
  spine_lean_deg: {
    id: 'spine_lean_deg',
    unit: 'deg',
    direction: 'lower',
    // Sideways collapse of the spine between the trophy and contact. Some lean
    // is the shot; a lot of it is chasing a toss that went somewhere else.
    anchors: { 3: [0, 24], 5: [0, 19], 7: [0, 15], 9: [0, 12] },
    seriousMiss: 10,
  },
  toss_drift_ratio: {
    id: 'toss_drift_ratio',
    unit: 'ratio',
    direction: 'lower',
    // Travel of the tossing hand off its own line on the way up, in standing
    // heights, along whichever body axis the camera laid across image x —
    // `axes.ts` decides which, and the finding carries the answer.
    //
    // The id still says "drift" and no longer says which way, which is correct
    // and is worth stating because these bands were calibrated when it did. They
    // were derived against raw image x on side-on footage, i.e. against a DEPTH
    // reading nobody knew was one. Recovering the axis now divides by a gain of
    // 0.99 at that angle, so the depth case moves by under one percent and the
    // numbers below keep their provenance intact. At a corner camera the divisor
    // reaches about 1.4, and the lateral case has never been calibrated against
    // anything — no footage in this repo drove that axis until the rig grew a
    // dial for it. Same band either way, on the argument that a hand wandering
    // 3% of standing height wandered that far whichever way it went. PROVISIONAL
    // for the lateral axis; re-derive it the first time there is face-on footage.
    anchors: { 3: [0, 0.09], 5: [0, 0.07], 7: [0, 0.05], 9: [0, 0.038] },
    seriousMiss: 0.05,
  },

  /* --- the drop and contact ---------------------------------------------- */
  drop_depth_ratio: {
    id: 'drop_depth_ratio',
    unit: 'ratio',
    direction: 'higher',
    // Racket hand below the hitting shoulder at the bottom of the drop, in
    // standing heights.
    anchors: { 3: [0.08, 0.52], 5: [0.13, 0.52], 7: [0.18, 0.52], 9: [0.23, 0.52] },
    seriousMiss: 0.09,
  },
  elbow_lift_ratio: {
    id: 'elbow_lift_ratio',
    unit: 'ratio',
    direction: 'higher',
    // Hitting elbow relative to the shoulder line at the drop. This is what
    // separates a real external rotation from a hand dropped down the back with
    // the elbow collapsed — the shallow "back scratch" that looks like a drop.
    //
    // Every rung is below the shoulder line, which surprises people who have
    // been told to "keep the elbow up". With the hand behind the back the
    // upper arm has to abduct sideways, and geometry puts the joint a hand's
    // width under the shoulder even on a textbook drop; only the last rung asks
    // for it to be close to level.
    anchors: { 3: [-0.13, 0.3], 5: [-0.11, 0.3], 7: [-0.08, 0.3], 9: [-0.05, 0.3] },
    seriousMiss: 0.05,
  },
  pronation_deg: {
    id: 'pronation_deg',
    unit: 'deg',
    direction: 'higher',
    // How far the palm rotates through contact. A snap turns the hand over; a
    // pancake pushes the strings at the ball with no rotation at all.
    //
    // These are smaller than the anatomical range of pronation on purpose. What
    // is measured is the component about the forearm across a window of about a
    // sixth of a second around contact, from hand landmarks that are moving
    // faster here than anywhere else in the serve — so the figure is a fraction
    // of the full turn, and the bands are calibrated to what this measurement
    // actually reads rather than to what a forearm can do.
    anchors: { 3: [12, 200], 5: [20, 200], 7: [28, 200], 9: [36, 200] },
    seriousMiss: 16,
  },
  contact_height_ratio: {
    id: 'contact_height_ratio',
    unit: 'ratio',
    direction: 'higher',
    anchors: { 3: [1.16, 1.62], 5: [1.23, 1.62], 7: [1.29, 1.62], 9: [1.33, 1.62] },
    seriousMiss: 0.12,
  },
  toss_peak_ratio: {
    id: 'toss_peak_ratio',
    unit: 'ratio',
    direction: 'band',
    anchors: { 3: [1.24, 1.92], 5: [1.3, 1.86], 7: [1.36, 1.8], 9: [1.4, 1.78] },
    seriousMiss: 0.18,
  },
}

/**
 * How far each signal moves on its own, filming the same serve twice.
 *
 * The band a signal is graded against is meaningless below its own
 * repeatability, and three of these were being graded below it: `hip_lead_ms`
 * (45 against a measured 85), `pronation_deg` (16 against 31) and
 * `palm_to_sky_deg` (10 against 11, by rounding). Measured on an ensemble of
 * noise realisations of one identical synthetic serve — the ensemble lives in
 * `__tests__/repeatability.ts`, which is where every figure in this comment and
 * in `UNDER_RESOLVED` can be re-derived, and `__tests__/depth.test.ts` prints
 * them and fails if they drift. A miss smaller than the figure here is reported
 * as no fault at all, for the same reason `MEANINGFUL_DELTA` refuses to call a
 * two-point move on the trend chart progress.
 *
 * Read in two places, and the direction of harm is opposite in each: see
 * `rungStep` under `inferTier` before widening one of these.
 *
 * Each is one and a half deviations, rounded up to the signal's own precision.
 * Nothing caps that any more, and the cap coming off is what this round was
 * about.
 *
 * The rule used to be `min(1.5 × deviation, seriousMiss)`. For two signals the
 * second half bound: the measurement was less repeatable than the engine's own
 * definition of a fault worth acting on, so the floor was clipped down to
 * `seriousMiss` to keep their detectors reachable. The clipping was invisible.
 * It looked like a number that happened to equal another number, and what it
 * actually meant was that two flaws were being named at a resolution the
 * measurement did not support. Naming a fault the camera cannot resolve is the
 * same failure as stating a number that was never measured, arriving one layer
 * further down — so the clip is gone and the two signals were decided on their
 * merits instead. `UNDER_RESOLVED` below records what was decided and why.
 *
 * Two more caveats, both load-bearing:
 *
 * These are floors on *detection*, never on the injury flags. A joint being
 * loaded wrongly is read from a pair of signals against absolute limits, and
 * hedging that would be hedging the one output that is not a matter of degree.
 *
 * And they are derived from a model of camera noise rather than from footage.
 * The rig's depth error is set from published characterisations of MediaPipe's
 * world landmarks, not from clips filmed through this app, because there are no
 * such clips — `fixtures/index.ts` is empty. So these are provisional: the right
 * order of magnitude, honestly derived, and not yet confirmed against a real
 * camera. Re-derive them the moment there is footage.
 */
export const NOISE_FLOOR: Record<string, number> = {
  // Two peak-finds on a smoothed derivative, differenced. Still the least
  // repeatable number in the engine: the peak can land a frame either side on a
  // noisy realisation, and at 50 fps that alone is 20 ms per side. The deviation
  // is 49.1 ms on a converged ensemble, so 1.5× is 73.6, which rounds up to 74.
  //
  // AND IT IS 76 ANYWAY, deliberately, which is two milliseconds of margin over
  // what the measurement asks for. The 76 came from a sixty-seed reading of
  // 50.1; adding draws settled it lower — 49.163 at 120 seeds and 49.076 at 240,
  // agreeing to within 0.09 — so the honest thing was to ask whether the floor
  // should follow it down. Measured at 120 seeds, it should not:
  //
  //                serve          floor 76    floor 74
  //   clean (hips lead 70 ms)        0.0%        0.8%
  //   mild arming (-20 ms)          28.3%       28.3%
  //   real arming (-60 ms)          58.3%       60.8%
  //   gross arming (-120 ms)        95.0%       95.0%
  //
  // Two and a half points on real arming, bought with a false positive on a
  // clean serve. This engine is allowed to miss a fault and is not allowed to
  // invent one, which is the same call that stopped it at 76 rather than 70 when
  // the floor first moved. A floor above what repeatability asks for is the
  // direction the guard permits for a signal declared in `UNDER_RESOLVED`, and
  // this one is — so the margin is recorded here rather than smuggled.
  //
  // Was 85, from a deviation of 67.3, before the trunk pair was moved onto a
  // smoothing window measured in seconds rather than samples — see
  // `TRUNK_WINDOW_SECONDS` in `diagnose.ts` for why that was the defect and what
  // it was worth. Was 45 before that, clipped to `seriousMiss`. Both moves are
  // in `UNDER_RESOLVED.hip_lead_ms`, which is also where the detector's rates at
  // each floor are, because a floor is only worth what it does to those.
  hip_lead_ms: 76,
  // Forearm rotation between two sampled instants, from the palm normal — a
  // 3D orientation recovered from landmarks the network placed in depth, on the
  // smallest structure in the skeleton. The deviation is 20.2°, so 1.5 × that is
  // 30.4, which rounds up to 31. Was 16, clipped to `seriousMiss`.
  //
  // Nothing is graded against this floor any longer — `pancake_contact` is
  // measured and never named, for the reasons in `UNDER_RESOLVED` — but the
  // figure stays, because it is the measurement, and the day a better pronation
  // estimator arrives this is the number it has to beat.
  pronation_deg: 31,
  // Same normal, read on one frame near the trophy. Deviation 6.8°, so 1.5×
  // rounds up to 11.
  //
  // Was 10, and that one degree is worth the comment it costs. Nobody capped
  // this on purpose: 1.5 × 6.783 is 10.17, and somebody wrote down the round
  // number. It went unnoticed for as long as it did because the check that
  // would have caught it compared floors against one deviation rather than
  // against the one-and-a-half this file documents. A rounded-down floor is a
  // cap however small and however accidental, and this is a signal that names a
  // grip fault, so it now rounds the way floors have to round — up.
  palm_to_sky_deg: 11,
  // A yaw difference. Hedged already by the camera check, and still this wide.
  separation_deg: 9,
  /*
   * Lateral spine angle, differenced against the ready position — so it carries
   * the error of two frames rather than one.
   *
   * Was 6, and 6 was under-set: this signal is graded on a band finer than the
   * measurement supports at 6, and 7 is where its own repeatability puts it.
   *
   * SETTLED ON A CONVERGING ENSEMBLE, after four estimates disagreed. The
   * deviation sits near the 4.0 where `ceil(1.5 × sd)` flips between 6 and 7, so
   * the answer was decided by adding draws until it stopped moving. Nested seed
   * sets, each row containing the one above it:
   *
   *      n      sd     asks for
   *     24    4.082        7
   *     60    3.633        6
   *    120    4.488        7
   *    240    4.477        7
   *
   * 120 and 240 agree to within 0.011, which is the convergence; the 60 was the
   * outlier, not the 24. So 7 is not a conservative overshoot — it is exactly
   * `ceil(1.5 × 4.477)`, and the floor rounds up in any case, because a floor
   * rounded down is a cap and this file exists partly to say so.
   *
   * THE COST IS REAL AND IS NOT A FALSE-POSITIVE SAVING. At 240 seeds
   * `posture_collapse` is named on 42.1% of grossly leaning serves and 1.3% of
   * genuinely leaning ones, against 0.0% of clean ones — and at floor 6 the
   * gross rate was 57% on the 60-seed ensemble. Roughly nine to fifteen points
   * of lumbar detection, bought with no accuracy on clean serves at all. It is
   * paid purely to keep the floor above what the measurement can support, which
   * is this file's rule rather than a trade it chose.
   *
   * NOT WORTH REVISITING ON THE RIG. The number that would have earned those
   * points back is the one measured above and it came back the other way. What
   * could still move this is real footage — the deviation here is a property of
   * the modelled depth error, and `fixtures/README.md` is where that story
   * continues. Nobody should move it on a 24-seed reading in either direction,
   * and 60 is now known not to be enough either.
   */
  spine_lean_deg: 7,
  // The rest are read from x and y, which the camera genuinely saw, and are an
  // order of magnitude steadier for it.
  toss_drift_ratio: 0.006,
  drop_depth_ratio: 0.012,
  elbow_lift_ratio: 0.012,
  contact_height_ratio: 0.012,
  toss_peak_ratio: 0.02,
}

/**
 * Signals the engine cannot resolve to its own definition of a serious miss.
 *
 * A signal is in here when one and a half of its measured deviations exceeds its
 * `seriousMiss` — when filming the same serve twice moves the number further
 * than the gap between "fine" and "seriously wrong". That is a fact about the
 * measurement and no choice of floor makes it false, so the entry is not a
 * threshold. It is the decision that was taken about it, in words, and
 * `__tests__/depth.test.ts` fails if a signal joins this set without one.
 *
 * The list is short and it is meant to stay short. Something arriving here is
 * the engine saying it has been grading a number it cannot read.
 *
 * Not to be confused with `UNCALIBRATED` below, which is the opposite failure: a
 * measurement steady enough to grade, with no band to grade it against. A
 * reader looking for "why is this measured and never said out loud" has to check
 * both, and the two can never hold the same key — one is about a band being too
 * fine for the measurement, the other about there being no band at all.
 *
 * Figures below come from `__tests__/repeatability.ts`, at 50 fps with modelled
 * MediaPipe depth error on one identical synthetic serve. Deviations are over its
 * twenty-four-seed ensemble — `realise()` — and the naming *rates* are over sixty
 * seeds of the same ensemble — `realise(dials, tier, seeds(60))` — because a rate
 * in the low percent needs more draws to hold still than a deviation does. Both
 * are runnable from that file as written; the suite runs the twenty-four, since
 * sixty is slow enough that it would stop being run at all. They are model
 * figures — see the caveat above `NOISE_FLOOR`.
 */
export const UNDER_RESOLVED: Record<string, string> = {
  /*
   * Kept, at an honest floor, because it still tells a gross fault from none.
   *
   * Deviation 50.1 ms against a 45 ms serious miss — 56.6 when this entry was
   * first written, and the difference is the filter rather than the tracker; see
   * the re-derivation below. On the ensemble serve — a clean one, hips genuinely
   * leading by 70 ms — the reading ran from -49 ms to +180 ms, and the old
   * clipped floor of 45 named `arming_the_ball` at *high* severity on 12% of
   * realisations. Twelve percent of players with a well-sequenced serve being
   * told their shoulders fire first, as the one thing the report asks them to
   * fix.
   *
   * Neither of the other two options looked open, and the evidence for each is
   * a different strength, so they are stated separately.
   *
   * No camera-angle gate was found, and this rig cannot find one. Swept from 25°
   * to 88° of yaw the deviation is 49.9 ms, flat — and flat to the decimal at
   * every one of 25, 45, 70 and 88, which is the tell rather than a comfort. That flatness is a property of
   * the rig, not a finding about cameras: `syntheticServe.ts` adds its depth
   * error to the *world* landmarks in the player's own frame, and `cameraYaw`
   * only ever builds the image projection, while `hip_lead_ms` is derived from
   * `world.x` and `world.z` and never reads the image at all. So the sweep is
   * structurally incapable of coming out any other way, and the honest reading is
   * "there is no evidence here for a gate", not "a gate cannot help". A camera
   * check would have to be justified against real footage, where MediaPipe's
   * depth error genuinely does depend on how much of the player it can see.
   *
   * More frames used to make it worse rather than better — 110.6 ms at 120 fps
   * against 45.4 at 30 — which was a measurement of the engine and stood on its
   * own. The peak-finder's smoothing in `diagnose.ts` was a fixed three
   * *samples*, so its span in time shrank as the frame rate rose: 3 samples is
   * 100 ms of clip at 30 fps and 25 ms at 120, and it is applied twice, which
   * widens the effective window beyond either. That is the signature of a
   * derivative locking onto noise, not of a resolution limit a better phone
   * would fix — and this entry named a time-based window, as `palmNormalAt` in
   * `kinematics.ts` already uses, as where anyone trying to recover this signal
   * should start.
   *
   * THAT HAS SINCE BEEN DONE, and it was the right diagnosis. `TRUNK_WINDOW_SECONDS`
   * in `diagnose.ts` carries the derivation and the sweep; the short version is
   * that the deviation at sixty seeds went 57.9 / 67.3 / 110.0 ms across
   * 30 / 50 / 120 fps to 43.3 / 50.1 / 35.6, so frame rate is no longer the axis
   * this signal lives or dies on. The floor followed the measurement down, 85 to
   * 76, and the detector was measured at every floor it has ever had:
   *
   *                              three samples        0.15 s window
   *              serve         floor 45  floor 85   floor 85  floor 76
   *   clean (hips lead 70 ms)     12%       2%         0%        0%
   *   mild arming (-20 ms)        43%      22%        20%       30%
   *   real arming (-60 ms)        68%      50%        50%       57%
   *   gross arming (-120 ms)      93%      78%        92%       92%
   *
   * Zero against ninety-two is a better detector than two against seventy-eight
   * on both ends at once, which is rare enough here to say plainly. Every rate
   * improved and none was traded for another.
   *
   * The last column above is a sixty-seed reading and the final state of it is
   * slightly better than that: re-measured at a hundred and twenty seeds it is
   * 0.0 / 28.3 / 58.3 / 95.0. The shape of the finding does not change and the
   * decision rested on it rather than on the third decimal, but these are the
   * figures to quote.
   *
   * The floor stopped at 76 rather than going lower, and the reason is the
   * column that is not in the table: at floor 70 the mild and gross rates barely
   * move (30% and 93%) while a clean serve is named on 2% again. Buying three
   * points on real arming with a false positive is the wrong way round — this
   * engine is allowed to miss a fault and is not allowed to invent one.
   *
   * What is still true: this remains the least repeatable number in the engine,
   * it is still UNDER_RESOLVED rather than solved, and 43% of players who
   * genuinely arm the ball still hear nothing. What changed is that the part of
   * that owed to the filter has been paid off, and what is left is the depth
   * error on world z, which no window can smooth away. Anyone trying to take
   * this further should be looking at the provenance, not the smoothing.
   *
   * One honest consequence, since the floor now sits above `seriousMiss`: every
   * `arming_the_ball` finding comes back at severity 'high', because any miss
   * large enough to clear the floor is by definition larger than a serious one.
   * The severity is not a gradient any more. For this signal that is the truth
   * rather than a defect — the only misses it can resolve are gross ones.
   */
  hip_lead_ms:
    'kept: smoothing moved to a time-based window, floor followed the ' +
    'measurement 85 -> 76 ms — 0% of clean serves against 92% of grossly ' +
    'armed ones, and 57% of genuinely armed ones against 50% before',

  /*
   * Not named. `pancake_contact` is measured and never reported to a player.
   *
   * Deviation 20.2° against a 16° serious miss, and unlike the hip lead there is
   * no floor that rescues it, in either direction:
   *
   * Leave the floor clipped at 16 and the detector is a coin. Measured across
   * the ensemble at a tier-5 target, `pancake_contact` was named on 10% of
   * serves with 95° of real forearm turn in them and on 35% of serves with none
   * at all. A player with a textbook snap had a one-in-ten chance of being sent
   * away to fix their pronation; a player with a genuine pancake had a
   * two-in-three chance of hearing nothing. Thirty-five against ten is not a
   * detector, it is a weighted coin, and the report spends its single
   * instruction on it.
   *
   * Raise the floor to the measured 31° and the detector cannot fire at all.
   * `pronationBetween` returns an unsigned angle, so the value is never below
   * zero and the miss can never exceed the band's own lower edge — which runs
   * from 12° to 36° across the whole ladder. A 31° floor is above that edge for
   * every club player. The detector would not be hedged, it would be dead while
   * still appearing in the code, which is the one outcome worse than removing
   * it.
   *
   * Both roads end in the same place, so this takes the one that says so. The
   * signal stays: `signals.pronation_deg` still carries the measured value, and
   * the `wrist_strain_forced_pronation` injury flag still reads it against an
   * absolute limit, deliberately unfloored, for the reason two comments above.
   * What stops is naming a stroke fault from it.
   *
   * A separate observation for whoever revisits this, weaker but pointed in the
   * same direction: swept against the rig's own pronation dial the reading is
   * not monotonic. Dialled turns of 10°, 40°, 95° and 150° read back as a mean
   * 13°, 40°, 33° and 16° — so past roughly 40° more real rotation reads as
   * less. That could be the estimator folding or the rig's single-angle hand
   * orientation folding; this ensemble cannot tell them apart, and it is worth
   * settling before anyone rebuilds this detector. Note that `palmNormalAt` in
   * `kinematics.ts` already carries a comment about a *different* mechanism
   * producing a false pancake, from window smearing at low frame rates. Two
   * independent ways to read a snap as a push is itself the finding.
   */
  pronation_deg:
    'not named: `pancake_contact` fires on 10% of clean serves against 35% of ' +
    'genuine pancakes, and an unsigned angle cannot miss its band by 31°',
}

/**
 * Measurements the engine reports and has nothing to grade against.
 *
 * The sibling of `UNDER_RESOLVED`, and the distinction between them is the
 * point. A signal lands in that one when it moves further across noise than the
 * gap between "fine" and "seriously wrong" — the measurement is too coarse for
 * the band. Something lands *here* when the measurement is fine and there is no
 * band: nothing in this repo has ever established what value a club player
 * should have, and no anchor could be written down without inventing four
 * numbers. Both are refusals to grade. They fail at opposite ends.
 *
 * A stricter test applies here than anywhere else in this file, because this is
 * where a plausible number with no calibration behind it would otherwise
 * accumulate. Every key must be a quantity the engine actually produces, and no
 * key may have a `SIGNALS` entry — the moment somebody writes anchors for one
 * of these it is calibrated, this entry is stale, and `depth.test.ts` fails
 * until it is removed. There is deliberately no way to have both.
 *
 * These are not to-do items. Two of the three below cannot be settled by any
 * amount of work on this rig, and say so; what they are waiting for is footage
 * of real serves with a coach's judgement attached, which is the same thing
 * `NOISE_FLOOR` is waiting for.
 */
export const UNCALIBRATED: Record<string, string> = {
  /*
   * Shoulder external rotation at the trophy — the joint angle a racket drop is
   * actually made of, and the first entry here whose problem is not resolution.
   *
   * It is repeatable enough to grade. Swept against the ensemble every floor in
   * this file came from, with a rig dial that genuinely rotates the humerus
   * (`trophyExternalRotation`), the deviation is flat at 9.4–11.8° across a 48°
   * span — it does not blow up at any part of the range. A floor set the way
   * every other one here was, 1.5 × the deviation, would be 15°, leaving 3.15
   * usable steps. `palm_to_sky_deg` is graded at a floor of 11; `hip_lead_ms` is
   * `UNDER_RESOLVED` at 85. On repeatability alone this belongs in the bands.
   *
   * WHAT STOPS IT IS THE ZERO, AND THEN THE POSTURE. The angle is read against
   * the trunk's up vector projected onto the plane across the humerus, and that
   * reference is a choice rather than an anatomy.
   *
   * That choice was checked against a second one — the shoulder line — rather
   * than argued about, and the result is in `depth.test.ts` under "what a band
   * could and could not rest on". Three findings, and they point in different
   * directions:
   *
   *   · **The change is real.** On a clean rig both frames report 14.4° for
   *     every 15° dialled, identically, at every step — a gain of 0.96. Two
   *     independent references seeing the same change means the change belongs
   *     to the arm and not to the frame. (Under the modelled camera the apparent
   *     gain falls to 0.8, which is the unsigned angle biasing towards the
   *     middle of its range under noise, not the geometry moving.)
   *   · **The absolute is not.** The same arm reads 44.5° in one frame and
   *     149.1° in the other. There is no zero to put a band around.
   *   · **And switching frames is not the fix.** Each is confounded by a
   *     different posture: 30° of spine lean moves the trunk frame 15.1°, and
   *     30° of shoulder tilt moves the shoulder frame 35.3°. The trunk frame is
   *     the better of the two and is still moved by a whole noise floor by a
   *     posture that is not a shoulder rotation — and spine lean is not
   *     hypothetical, it is the signal the lumbar injury flag is read from.
   *
   * So: measured, returned in `Diagnosis.externalRotation`, kept out of
   * `signals`, and graded by nothing. A band on the absolute is ruled out rather
   * than pending. A band on a *delta* is defensible in principle and still needs
   * two things — posture held roughly still between the two serves being
   * compared, and real footage to say whether the lever refusal leaves enough
   * readings to compare at all.
   */
  external_rotation_deg:
    'measured and not named: 9.4–11.8° deviation over a 48° span, which is ' +
    'gradeable, but read against a chosen reference frame with no zero — the ' +
    'same arm reads 44.5° against the trunk and 149.1° against the shoulder ' +
    'line. Both frames agree exactly about a CHANGE (14.4° per 15° dialled) and ' +
    'both are confounded by posture: 30° of spine lean moves the trunk frame ' +
    '15.1°. Delta gradeable in principle, absolute ruled out.',
  /*
   * Peak leg drive: the fastest the hips rose in the frame.
   *
   * The most proximal link the camera can see, and the only one that needs no
   * hedge for where the phone stood — it is read from image y alone, which is
   * vertical for every camera this app accepts, and its mean does not move at
   * all across yaw from 20° to 88°. Deviation 7.5 ms across the ensemble.
   *
   * It times the drive and says nothing about its size, which is the first
   * reason there is nothing to grade. Dialled from a player who barely leaves
   * the ground to one driving hard, the peak stays at -196 to -204 ms — the
   * same moment, because the moment is set by when the legs extend and not by
   * how far. What does move is the deviation, 16.1 ms with almost no drive
   * against 6.8 ms with a normal one, which is the honest signature of a peak
   * being found in a smaller and smaller event. A detector for "no leg drive"
   * wants the amplitude, not this.
   *
   * And the second reason is the one the whole chain shares: nothing here knows
   * what a club player's number should be, and the rig cannot be asked, because
   * every one of its tracks hangs off a single normalised phase schedule.
   */
  legs_peak_ms:
    'measured and not named: 7.5 ms deviation, camera-invariant, and it times ' +
    'the leg drive without measuring it — the same peak whether the player drives or not',

  /*
   * The whole chain's span: peak leg drive to peak racket-hand speed.
   *
   * Easily the best-conditioned timing this engine produces. Both ends are read
   * from the picture plane — the hips rising in image y, the hand's planar speed
   * off image x and y — so neither touches MediaPipe's inferred depth. Across the
   * twenty-four-seed ensemble its deviation is 7.8 ms, against 49.9 for
   * `hip_lead_ms` measured on the same clips; across camera angles from 20° to
   * 88° its mean moves 0.7 ms; across 30, 50 and 120 fps it reads 123.2, 119.8
   * and 117.9 ms. By every test this repo applies to repeatability it is the strongest
   * timing in the engine.
   *
   * And there is nothing to compare it against, for two independent reasons,
   * either of which is enough on its own.
   *
   * It is not scale-free. The span scales with how long the motion took: 156 ms
   * on a 1.7 s serve and 102 ms on a 1.1 s one, same dials otherwise. A band in
   * milliseconds would therefore grade tempo, and mark a deliberate server as
   * having no chain. The obvious repair is to divide by the motion's duration,
   * and it is the right one — the ratio comes out 0.092, 0.088 and 0.092 across
   * those three tempos, scale-free to within 5%. It only moves the problem,
   * because what that ratio should be for a club player is exactly the number
   * nobody here has.
   *
   * And the rig cannot say. `syntheticServe.ts` keys every track to one
   * normalised phase schedule, so the span is a constant of that schedule once
   * tempo is divided out: swept against the arming dial at -20, -60 and -120 ms
   * the span reads 118.6 ms every time, to a tenth of a millisecond. That is not
   * evidence the chain span is unrelated to arming. It is the rig being
   * structurally incapable of producing a serve where they differ — the same
   * shape of non-finding as the camera-angle sweep recorded under
   * `UNDER_RESOLVED.hip_lead_ms`, and it is recorded rather than reported as a
   * negative result for the same reason.
   *
   * So: measured, reported in `Diagnosis.chain`, kept out of `signals`, and not
   * named. A detector built on it today would be a band somebody made up,
   * validated against a rig that holds the quantity fixed.
   */
  chain_span_ms:
    'measured and not named: 7.8 ms deviation and no band — the span scales ' +
    'with tempo, and the rig holds it fixed once tempo is divided out',

  /*
   * The same span divided by how long the motion took. Dimensionless.
   *
   * The repair named in the entry above, carried out — and it is here rather
   * than in `SIGNALS` because being scale-free is what a quantity needs before a
   * band could exist, not a band. Nothing in this repo knows what this number
   * should be for a club player, and the rig cannot be asked: `syntheticServe.ts`
   * keys every track to one normalised phase schedule, so a serve whose sequence
   * differs from that schedule is not a serve it can build.
   *
   * TWO THINGS MEASURED HERE DISAGREE WITH WHAT THE ENTRY ABOVE CLAIMS, and the
   * disagreement is recorded rather than reconciled.
   *
   * Dividing helps, and it does not remove the dependence. Swept over the
   * `motionSeconds` dial at 1.1, 1.35 and 1.7 s, with `DEPTH_AWARE` dials at
   * 50 fps and one seed: the raw span reads 99, 114 and 174 ms — a 58% spread
   * about its own mean — and the ratio reads 0.1010, 0.1000 and 0.1225, which is
   * 21%. Most of the tempo dependence is gone. A fifth of it is not, because the
   * span is not actually proportional to the motion: 1.0/1.15/1.76 against
   * tempos of 1.0/1.23/1.55.
   *
   * The entry above records that ratio as "0.092, 0.088 and 0.092 across those
   * three tempos, scale-free to within 5%". That does not reproduce. It states
   * neither its frame rate nor its dials, so it cannot be re-run as written, and
   * `__tests__/depth.test.ts` now prints the sweep it was derived from on every
   * run so this one cannot go the same way. The check there asserts the
   * comparative claim — that the division at least halves the spread — and
   * deliberately not an absolute bound, which would be a number nobody derived.
   *
   * What would move this into `SIGNALS`, stated so nobody has to guess:
   *
   *   1. The residual has to be understood. A quantity 21% dependent on tempo
   *      grades a deliberate server, which is the exact fault that sent the raw
   *      span here. Either the residual is sampling — 20 ms of frame at 50 fps
   *      against a 99 ms span is a fifth of it, which would be settled by the
   *      same sweep at 120 fps — or the sequence genuinely changes shape with
   *      tempo, which is a finding about serving and not a calibration problem.
   *   2. Real footage, because the rig cannot produce the variation a band would
   *      have to separate. See `fixtures/index.ts`: RECORDED is empty.
   *   3. A coach's judgement attached to that footage. A ratio spread over
   *      twenty clips is a distribution, not a standard; somebody has to say
   *      which of those serves had a chain and which did not, and
   *      `scripts/replay-fixture.mjs` prints the spread for exactly that
   *      conversation.
   *
   * Until all three, this is a well-conditioned number with nothing to compare
   * it against, which is what this register is for.
   */
  chain_span_ratio:
    'measured and not named: the division removes most of the tempo dependence ' +
    'and not all of it — 58% spread becomes 21% — and no band exists either way',

  /*
   * Peak racket-hand speed, and peak elbow speed, as moments in the serve.
   *
   * Two links rather than two entries, because the decision is one decision.
   *
   * The wrist is the steadiest single reading in the engine: 0.5 ms of deviation
   * across the ensemble, and its mean moves 0.7 ms across camera angles from 20°
   * to 88°. The elbow is nearly as steady against noise, 0.7 ms, and is NOT
   * camera-invariant — its mean moves 10.2 ms across the same angles, from
   * -123.3 at side-on to -113.1 at 20°, swept every two degrees and read before
   * the chain rounds to whole milliseconds, because a planar speed mixes image x
   * with image y and how much of a limb's travel lands in image x depends on
   * where the phone stood. Routing image x through
   * `axes.ts` was tried and measured and does not fix it: recovering the
   * dominant axis moved the spread from 10.8 ms to 11.6, for the reason stated
   * at the top of that file, which is that one image-x scalar cannot be de-mixed
   * into two components. So the elbow-to-wrist interval carries a 10.2 ms
   * camera artifact against a 0.9 ms deviation, and grading it would be grading
   * the framing.
   *
   * Both are timed relative to the contact keyframe, which is derived from the
   * same racket-hand track, so their absolute values are partly a statement
   * about where the detector puts contact rather than only about the player.
   * That is survivable for an interval between two links and not for either
   * one alone.
   *
   * The honest summary of what these two are for: they are the evidence that a
   * chain assembled from image-plane speeds is two orders of magnitude more
   * repeatable than one assembled from world-z yaw, which was the question this
   * work existed to answer. They are not evidence about any player's serve.
   */
  wrist_peak_ms:
    'measured and not named: 0.5 ms deviation, no band, and timed against a ' +
    'contact keyframe derived from the same track',
  elbow_peak_ms:
    'measured and not named: 0.7 ms deviation but a 10.2 ms camera-angle ' +
    'artifact, which axes.ts cannot remove because image x cannot be de-mixed',
}

/**
 * The ladder in words, because nobody knows their own number.
 *
 * The ratings here are UTR-shaped, and a player who books a court twice a month
 * does not have a UTR and cannot answer a question phrased as one. These are the
 * names the level control offers and the names the report says back — one
 * vocabulary, defined once. Two of them, drifting apart, is a report that says
 * "levelled for 4.5" directly above a control whose selected option reads "club
 * level", which is one fact told twice in two languages.
 *
 * Deliberately coarse. Four names across ten rungs is as fine a distinction as
 * somebody can honestly make about their own serve, and offering ten would
 * invite a precision the ladder itself does not have — the bands are
 * interpolated between four anchors.
 */
export const RUNGS: { tier: number; name: string; blurb: string }[] = [
  { tier: 2, name: 'still learning', blurb: 'Getting it in play' },
  { tier: 4, name: 'club level', blurb: 'Reliable first serve' },
  { tier: 6, name: 'solid club', blurb: 'You can hit spin on demand' },
  { tier: 8, name: 'league or open', blurb: 'The serve wins you points' },
]

/** The name of the rung a rating sits closest to. */
export const rungName = (tier: number): string =>
  RUNGS.reduce((best, r) => (Math.abs(r.tier - tier) < Math.abs(best.tier - tier) ? r : best), RUNGS[0])
    .name

/** The rungs the ladder is actually anchored at. */
const ANCHORS = [3, 5, 7, 9] as const

/** Ratings outside this are clamped: below is beginner, above is professional. */
export const MIN_TIER = 1
export const MAX_TIER = 10

export const clampTier = (t: number) => clamp(t, MIN_TIER, MAX_TIER)

/**
 * The tier this player is being coached towards: exactly one above their own.
 *
 * Capped at the top of the ladder, and never more than one rung — the whole
 * point of the module. A player already at the top is held there rather than
 * handed an invented eleventh rung.
 */
export const nextTier = (current: number) => clampTier(Math.floor(clampTier(current)) + 1)

/**
 * The acceptable band for one signal at one tier.
 *
 * Linear between the anchors and flat outside them. Flat rather than
 * extrapolated on purpose: extrapolating a flexibility band past its top anchor
 * invents a requirement no evidence supports, and past the bottom one invents a
 * standard so low it would pass a serve that is not happening.
 */
export function bandFor(signal: string, tier: number): [number, number] {
  const spec = SIGNALS[signal]
  if (!spec) return [0, 0]
  const t = clampTier(tier)
  if (t <= ANCHORS[0]) return [...spec.anchors[3]]
  if (t >= ANCHORS[ANCHORS.length - 1]) return [...spec.anchors[9]]

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const lo = ANCHORS[i]
    const hi = ANCHORS[i + 1]
    if (t >= lo && t <= hi) {
      const u = (t - lo) / (hi - lo)
      const a = spec.anchors[lo]
      const b = spec.anchors[hi]
      return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]
    }
  }
  return [...spec.anchors[9]]
}

/** The band to aim at: the one belonging to the tier above this player. */
export const targetFor = (signal: string, currentTier: number): [number, number] =>
  bandFor(signal, nextTier(currentTier))

/** Whether a measured value sits inside a band, respecting the axis direction. */
export function insideBand(signal: string, value: number, band: [number, number]): boolean {
  const spec = SIGNALS[signal]
  if (!spec) return true
  if (spec.direction === 'higher') return value >= band[0]
  if (spec.direction === 'lower') return value <= band[1]
  return value >= band[0] && value <= band[1]
}

/** How far outside the band, in the signal's own units. Zero when inside. */
export function missBy(signal: string, value: number, band: [number, number]): number {
  const spec = SIGNALS[signal]
  if (!spec) return 0
  if (spec.direction === 'higher') return Math.max(0, band[0] - value)
  if (spec.direction === 'lower') return Math.max(0, value - band[1])
  return Math.max(0, band[0] - value, value - band[1])
}

export type Severity = 'none' | 'low' | 'medium' | 'high'

/**
 * Severity as a sort key, worst first.
 *
 * Beside the type it orders, because it is part of what the type means rather
 * than a preference any one module holds. Four copies of this literal had
 * accumulated — two inside `verdict.ts` alone, plus `triage.ts` and `flaws.ts`,
 * and a fifth encoding of the same order reversed — and one of them carried a
 * comment claiming a test asserted they agreed. No such test existed. The
 * failure they were risking is the quiet one: the stored primary flaw and the
 * plan the player reads ordered by different rules, in the one direction this
 * app is built to get right, worst cause first.
 */
export const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, none: 3 }

/** Worse of two severities, by the same ranking. */
export const worseSeverity = (a: Severity, b: Severity): Severity =>
  SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b

/**
 * Severity, graded against how big a miss is serious for this signal.
 *
 * Scaled per signal rather than as a percentage of the value: eight degrees of
 * lost coil and eight thousandths of a body height are both large misses on
 * their own axes, and a single shared rule would call one of them nothing.
 */
export function severityOf(signal: string, value: number, band: [number, number]): Severity {
  const spec = SIGNALS[signal]
  const miss = missBy(signal, value, band)
  if (!spec || miss <= 0) return 'none'
  const ratio = miss / Math.max(1e-9, spec.seriousMiss)
  if (ratio >= 1) return 'high'
  if (ratio >= 0.5) return 'medium'
  return 'low'
}

/**
 * Estimate a rating from the serve itself, for a player who has not given one.
 *
 * Reads the four signals that separate levels most cleanly and least
 * ambiguously — how high the ball is struck, how deep the racket falls, how much
 * the trunk coils, and whether the sequence is in order. Deliberately
 * pessimistic: a wrong guess low hands the player a target they will clear, and
 * a wrong guess high hands them one they cannot, which is the failure this
 * module exists to prevent.
 *
 * Pessimistic, but not hostage to one number. This used to take the highest rung
 * *all four* signals sat inside, which makes the worst-measured signal the whole
 * rating. A real clip showed what that costs: a high-intermediate player filmed
 * from behind the baseline came back at the bottom rung of the ladder, because
 * `contact_height_ratio` missed the tier-1 band by 0.003 and `drop_depth_ratio`
 * missed it by 0.001 — both inside their own documented noise floors — while the
 * two depth-derived signals read near zero from a camera angle that cannot see
 * rotation. Four failures, two of them a rounding error, and the player is told
 * they are still learning.
 *
 * So each signal is asked separately how high it reaches, near misses are
 * forgiven to the same `NOISE_FLOOR` the flaw pass already uses, and the rating
 * is the median of the answers. The median keeps the pessimism where it belongs
 * — two bad signals still pull it down — without letting a single unmeasurable
 * one define a player.
 *
 * The forgiveness is why `rungStep` exists. `NOISE_FLOOR`'s direction of harm
 * *inverts* between the two places it is read. In the flaw pass a wider floor is
 * more forgiving: fewer faults named, fewer false accusations. Here a wider floor
 * lets a signal reach a *higher* rung, and the rating picks the target band every
 * other signal is then graded against — so a generous floor hands the player a
 * harder target and buys back as new accusations elsewhere what it saved on the
 * one flaw. Measured, when `hip_lead_ms`'s floor moved from 45 to 85: a serve
 * whose shoulders fire 30 ms *early* went from rating 4 to rating 9, the same
 * rung as a clean 70 ms lead, because 85 ms of slack is wider than the whole
 * 42 ms ladder that signal is graded on. The floor has since come down to 76,
 * which does not change the conclusion — 76 is still wider than that ladder —
 * and is why the exclusion below is stated against the rung rather than against
 * a particular floor. That is not forgiveness, it is a signal
 * with nothing left to say voting anyway.
 */
/**
 * How far one signal's band moves per rung of the ladder.
 *
 * The unit a rating is made of. A signal whose own repeatability is wider than
 * this cannot tell rung 5 from rung 6 — whichever rung it reports is the noise
 * talking — so `inferTier` drops it rather than averaging it in, the same way
 * `metrics.ts` drops a value it could not compute instead of defaulting one.
 * Currently that excludes `hip_lead_ms` (76 ms floor against a 7 ms rung) and
 * `separation_deg` (9° against 2.8°), leaving the two signals read from x and y,
 * which the camera genuinely saw. Both excluded signals are still measured, still
 * shown and still graded for flaws; what they no longer do is guess a rating.
 *
 * A rule rather than a list, so that re-deriving `NOISE_FLOOR` from real footage
 * puts a signal back to work by itself. If a floor comes down below its rung the
 * signal starts voting again with no edit here — which is the point, because a
 * hand-maintained exclusion list is the thing that goes stale silently.
 *
 * Taken across rungs 3 to 9, the four anchors the ladder is actually defined at,
 * on whichever band edge moves; interpolated rungs sit between them by
 * construction.
 */
function rungStep(signal: string): number {
  const low = bandFor(signal, ANCHORS[0])
  const high = bandFor(signal, ANCHORS[ANCHORS.length - 1])
  const rungs = ANCHORS[ANCHORS.length - 1] - ANCHORS[0]
  return Math.max(Math.abs(high[0] - low[0]), Math.abs(high[1] - low[1])) / rungs
}

export function inferTier(signals: Record<string, number>): number {
  const used = ['contact_height_ratio', 'drop_depth_ratio', 'separation_deg', 'hip_lead_ms']
    .filter((s) => Number.isFinite(signals[s]))
    .filter((s) => (NOISE_FLOOR[s] ?? 0) < rungStep(s))
  if (!used.length) return 4

  // Capped one below the top of the ladder. An inferred rating is a guess, and a
  // guess that lands on the last rung leaves the player with a target identical
  // to where they already are — which is the one output this module must never
  // produce. A player genuinely at the ceiling can say so themselves.
  const reach = used.map((s) => {
    let best = MIN_TIER
    for (let tier = MIN_TIER; tier <= MAX_TIER - 1; tier++) {
      const band = bandFor(s, tier)
      // Forgiven to the noise floor, because a band edge is not a cliff and this
      // signal's own repeatability is written down two hundred lines above.
      const slack = NOISE_FLOOR[s] ?? 0
      const inside =
        insideBand(s, signals[s], band) ||
        (signals[s] >= band[0] - slack && signals[s] <= band[1] + slack)
      if (!inside) continue
      // For 'higher' signals the top of the band is a plausibility cap, and
      // this is where it earns its keep: a hip lead of half a second is a
      // peak-detection artifact, not sequencing mastery, and crediting a rung
      // for it is exactly the mis-detection-as-virtue the cap was written to
      // stop. Not treated as a flaw either — an implausible reading is
      // evidence of nothing.
      if (SIGNALS[s]?.direction === 'higher' && signals[s] > band[1]) continue
      best = tier
    }
    return best
  })

  // The lower median, so an even split of two good signals and two bad ones
  // settles on the cautious side rather than averaging into a rung nothing
  // actually reached.
  const sorted = [...reach].sort((a, b) => a - b)
  return clampTier(sorted[Math.max(0, Math.ceil(sorted.length / 2) - 1)])
}
