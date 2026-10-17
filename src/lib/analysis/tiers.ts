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

import type { ServeType } from '../storage/prefs'
import { METRICS, SERVE_TYPES } from './coaching'
import { clamp, lerp } from './geometry'

/** Which direction on this axis is better, which decides how a band is read. */
export type Direction = 'higher' | 'lower' | 'band'

export interface SignalSpec {
  id: string
  /** `pct`: percent of standing height, where the signal reads a card row that does (L5.1). */
  unit: 'deg' | 'ms' | 'ratio' | 'pct'
  direction: Direction
  /** Acceptable band at ratings 3, 5, 7 and 9. Interpolated in between. */
  anchors: { 3: [number, number]; 5: [number, number]; 7: [number, number]; 9: [number, number] }
  /**
   * How far outside the band counts as a serious fault rather than a near miss.
   * In the signal's own units, so severity means the same thing on an axis in
   * degrees and one in milliseconds.
   */
  seriousMiss: number
  /**
   * What the band stands on (L5.1): D2.1's rule, extended from the card to the
   * diagnosis, so no fault is named against a number nobody can account for.
   *
   *   · `card` — it reads a card row's own number against that row's band
   *     (`CARD_SIGNAL`), which names its footing beside it in `coaching.ts`;
   *   · `study` — published figures, with the year;
   *   · `motion` — re-derived on real serve motion: the Bath serves read inside
   *     the club band and are named at no rung, and the rig's fault is named at
   *     every rung (`bands.test.ts`, `MOTION_SIGNALS`);
   *   · `unnamed` — read, but no fault is named from it (`flaws.ts`), so no
   *     band of it reaches a player.
   *
   * Compulsory, so a new signal cannot arrive without one.
   */
  source: { card: string } | { study: string } | { motion: string } | { unnamed: string }
}

/**
 * Card rows that read the same number as a ladder signal, and so share its band.
 *
 * ONE SERVE, JUDGED ONCE (D2.3). The card scores these five against a fixed
 * band, and the diagnosis used to name their faults against a ladder of its own,
 * so one serve could be judged twice and judged differently: a toss the plan
 * let pass under a card row that called it low, or a real server's coil read
 * short on the card at a floor the diagnosis never asked for. Each now has one
 * band, written once on the card (`coaching.ts`, beside its sources), and the
 * ladder reads it at every rung. The diagnosis still names a fault only past its
 * noise floor (`NOISE_FLOOR`, `CAMERA_ALLOWANCE`), so whatever it names is out of
 * band on the card as well. The card can call a near miss the diagnosis
 * forgives, and never the other way round.
 *
 * Flat, not laddered, because none of the five has a figure per level the
 * camera can resolve. Contact's beginner-to-elite gap (Girard 2005) is half of
 * what the phone's position moves it; the toss has no club data; the hips' rise
 * and the coil have one professional figure each; and the drop was flattened on
 * real motion before this. So none of them rates a player either: a flat band's
 * `rungStep` is zero.
 *
 * Complete by test, not by care: `flaws.test.ts` reads every card row and every
 * signal off rig serves, and fails on any pair carrying the same number that is
 * missing here.
 */
export const CARD_SIGNAL: Record<string, string> = {
  tossPeakHeight: 'toss_peak_ratio',
  // Judged as one since L5.1: both read `tossPathSpread`, the card's number.
  tossPathWobble: 'toss_drift_ratio',
  // And contact in front since L5.3, through `contactAheadOf`.
  contactAhead: 'contact_ahead_pct',
  // And the tossing arm since L5.4, through `tossArmHoldOf`.
  tossArmHold: 'toss_arm_hold_pct',
  hipShoulderSeparation: 'separation_deg',
  legDrive: 'leg_drive_rise_ratio',
  dropDepth: 'drop_depth_ratio',
  contactHeight: 'contact_height_ratio',
}

/** A card row's band, as a ladder that does not move. */
function cardBand(card: string): SignalSpec['anchors'] {
  const [lo, hi] = METRICS[card].ideal
  return { 3: [lo, hi], 5: [lo, hi], 7: [lo, hi], 9: [lo, hi] }
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
    source: {
      motion:
        'Six Bath serves read 21–35° at the trophy from every side, inside the club band and named at no rung; the rig tray (palm 80, forearm laid over) reads 74 and is named at every rung',
    },
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
    source: { unnamed: 'arming_the_ball is not named: see UNDER_RESOLVED.hip_lead_ms and van Trigt 2024' },
  },
  separation_deg: {
    id: 'separation_deg',
    unit: 'deg',
    direction: 'higher',
    // Hip-to-shoulder coil at the trophy. A tour serve reaches the fifties; a
    // healthy club torso does not, and demanding it produces back pain rather
    // than racket-head speed. The card's band (`CARD_SIGNAL`), where the reasons
    // for its edges are written.
    anchors: cardBand('hipShoulderSeparation'),
    seriousMiss: 12,
    source: { card: 'hipShoulderSeparation' },
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
    source: {
      motion:
        'Six Bath serves read 8–18° from behind and in front, inside the club band and named at no rung; the rig spine bent 40° sideways reads past the band and is named at every rung',
    },
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
    // 3% of standing height wandered that far whichever way it went.
    //
    // PROVISIONAL, AND F5 MEASURED HOW PROVISIONAL. One physical wobble of
    // 0.10 m, dialled onto each axis in turn: the depth axis reads 0.0519 /
    // 0.0818 / 0.0841 / 0.0831 at 30 / 45 / 60 / 82° of yaw, and the lateral
    // axis reads 0.0755 / 0.0715 / 0.0429 / 0.0101. **The lateral axis collapses
    // about seven-fold, worst at 82° — which is the angle the filming guide
    // tells people to stand at.** Side-on, motion across the shoulders points
    // nearly at the lens; that is geometry, and it is what R60·2 refused the
    // stance over.
    //
    // So the shared-band argument is sound about the player and wrong about the
    // measurement: a toss that wanders sideways at the recommended angle is
    // graded on a seventh of the truth. Not repaired, because there is no honest
    // target to re-derive against — nothing here has ever filmed a lateral
    // wobble, and a second band would be a number invented to fill a column.
    // Pinned in `depth.test.ts` so a change that fixes it goes red.
    //
    // ONE TOSS, JUDGED ONCE (L5.1). It now reads the card's toss-path number,
    // the spread of the hand's path in percent of height (`tossPath.ts`),
    // against the card's band, where the motion it was re-derived on is
    // written. The ladder above was this signal's own, on the worst single
    // point of the same window; the id stays so nothing that names it moves.
    anchors: cardBand('tossPathWobble'),
    seriousMiss: 2,
    source: { card: 'tossPathWobble' },
  },

  /* --- the drop and contact ---------------------------------------------- */
  drop_depth_ratio: {
    id: 'drop_depth_ratio',
    unit: 'ratio',
    direction: 'higher',
    // Racket hand below the hitting shoulder at the bottom of the drop, in
    // standing heights; negative is the hand above it.
    //
    // RE-ANCHORED ON REAL MOTION (ANALYSIS-REVIEW.md §9). The old ladder asked
    // for the hand 0.08–0.23 below the shoulder — the "hand between the shoulder
    // blades" image the rig was posed to — and named `shallow_drop` as the first
    // fix on all 40 real serves in the Bath motion capture, from every phone
    // position. At a real racket drop the arm is at maximum external rotation:
    // upper arm about level with the shoulder, forearm laid back (Fleisig 2003:
    // 101° abduction, 104° elbow flexion), so the racket head falls and the hand
    // stays near shoulder height. The Bath serves read −0.01 to −0.06 here while
    // their racket heads fell 35–44 cm.
    //
    // So the floor now catches only a hand that stays well above the shoulder —
    // a forearm still mostly upright, a racket that never lays back — at about
    // 18 cm on an adult. The same floor at every rung, deliberately: how deep the
    // hand goes does not separate levels, so it should not move with them, and a
    // flat band leaves this signal out of `inferTier` by that function's own rule.
    // Lenient on purpose as well, because the rung a real clip needs to clear here
    // has to survive odd angles and rough footage; a racket that never fell at
    // all is named structurally (`racketNeverFell` in `flaws.ts`) whatever this
    // number says.
    //
    // The card's band (`CARD_SIGNAL`). Only the ceiling moved, 0.52 to 0.3, and
    // on a signal graded from below it is a plausibility cap that nothing read
    // once the band stopped moving with the rung.
    anchors: cardBand('dropDepth'),
    seriousMiss: 0.09,
    source: { card: 'dropDepth' },
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
    source: {
      motion:
        'Six Bath serves hold the elbow 0.00–0.08 above the shoulder line at the drop from every side, named at no rung; the rig back scratch reads -0.14 and is named at every rung',
    },
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
    source: { unnamed: 'pancake_contact is not named: see UNDER_RESOLVED.pronation_deg' },
  },
  /*
   * How far the hips rise from the deepest load to contact, in standing
   * heights, read from image y.
   *
   * GRADED SINCE THE RESEARCH GAVE IT A SCALE. It sat in `UNCALIBRATED` as the
   * best-conditioned reading in the engine with nothing to grade it against.
   * Professionals' centre of mass rises 15.8 ± 3.4% of height from its lowest
   * point to impact (Deghaies et al. 2026, J Hum Kinet, 22 ATP players), and a
   * serve with no leg drive cost about a tenth of racket speed while saving the
   * shoulder nothing (Reid, Elliott & Alderson 2008, MSSE 40:308). The hip
   * centre tracks the centre of mass closely through a vertical drive.
   *
   * ITS ZERO IS 0.0457 (`LEG_DRIVE_FLOOR`). A player who never leaves the ground
   * still rises, because straightening out of the knee bend lifts the hips.
   * The floor was 0.10, the professional mean less a deviation, and that asked
   * for a jump: a full bend straightened with both feet down was named on every
   * take. It is now 0.032 (L3.9), a full extension with no jump from the least
   * knee bend the card calls good — see `legDrive` in coaching.ts and the sweep
   * in `bands.test.ts`. One band, the card's (`CARD_SIGNAL`). The rig's clean
   * serve rises 0.12–0.14 and every Bath serve at least 0.13, so neither is
   * named; legs that stay straight, which cannot rise, are.
   *
   * IT TRACKS ITS DIAL. Swept against `contactHipHeight` across eight seeds: 0.95
   * (planted) reads 0.0457, 1.02 reads 0.0866, 1.10 reads 0.1333, 1.18 reads
   * 0.1786 — near one to one, deviation flat at 0.004–0.005, identical to four
   * decimals at 45° and 82°, because vertical is vertical for every camera the
   * app accepts.
   */
  leg_drive_rise_ratio: {
    id: 'leg_drive_rise_ratio',
    unit: 'ratio',
    direction: 'higher',
    anchors: cardBand('legDrive'),
    seriousMiss: 0.04,
    source: { card: 'legDrive' },
  },
  /*
   * When the chest was half turned to the net, ms against the racket's low
   * point, read from the shoulder line's width from the side (`chestTurn.ts`,
   * D3.6). The side camera's reading of the fault `separation_deg` names from
   * depth everywhere else.
   *
   * THE FLOOR IS THE LOW POINT, at every rung. The upper trunk turns fastest
   * 58 ms before impact (Fleisig 2003) and the low point comes about 130 ms
   * before it (Newton 2025), so a sound serve is half turned after the racket
   * has dropped, as the forty Bath serves are from both sides of the court. A
   * chest half turned before it is unwinding ahead of the swing. No study gives
   * the turn per level, so the band does not move with the rung, and its
   * ceiling only caps a reading that cannot be one.
   */
  chest_open_ms: {
    id: 'chest_open_ms',
    unit: 'ms',
    direction: 'higher',
    anchors: { 3: [0, 400], 5: [0, 400], 7: [0, 400], 9: [0, 400] },
    seriousMiss: 100,
    source: {
      study:
        'Fleisig 2003: the upper trunk turns fastest 58 ms before impact; Newton 2025: the low point comes about 130 ms before it, so a sound serve is half turned after the drop',
    },
  },
  contact_height_ratio: {
    id: 'contact_height_ratio',
    unit: 'ratio',
    direction: 'higher',
    // The racket wrist at contact. Re-anchored on the literature and real motion
    // (ANALYSIS-REVIEW.md §9): ball impact is 1.43 statures for beginners and
    // 1.49 for elite servers (Girard 2005), and the racket head peaks 0.26
    // statures above the wrist (the Bath capture, 0.46 m on a 1.80 m player), so
    // the wrist reaches about 1.17 to 1.23 statures. In this engine's units —
    // heights from the ankle line, over nose height ÷ 0.93, which reads stature
    // about 8% short — that is about 1.20 to 1.27. The old ladder topped out at
    // 1.33 and started at 1.16, above most of that range.
    //
    // It then climbed 1.08 to 1.25 with the rung, and that gap was under what
    // the phone's position alone moved this reading until D7.4. One band now,
    // the card's (`CARD_SIGNAL`), where its floor's reasons are written.
    anchors: cardBand('contactHeight'),
    source: { card: 'contactHeight' },
    seriousMiss: 0.12,
  },
  /*
   * Contact in front of the hips, in percent of height, towards the net (L5.3):
   * the card's row read from the side, against the card's cited band — flat
   * serves meet the ball 0.28–0.37 of height ahead of the front toe (Vacek 2023,
   * Connolly 2021, Fett 2021). Graded from below only: "far in front" is the
   * card's to say, and `contact_behind` names only a ball met over or behind
   * the head. The kick's floor is 0 through `SERVE_TYPE_SHIFT`, because a kick
   * may be met over the head.
   */
  /*
   * How long the tossing arm stays up, toss to contact, in percent of the
   * window (L5.4): the card's "Tossing arm timing" row against the card's band,
   * which was re-derived on the Bath serves (72–79% from every placement) with
   * the rig's dropped arm held under it. Graded from below: an arm held up
   * through the swing is the card's to mention, not a fault.
   */
  toss_arm_hold_pct: {
    id: 'toss_arm_hold_pct',
    unit: 'pct',
    direction: 'higher',
    anchors: cardBand('tossArmHold'),
    seriousMiss: 20,
    source: { card: 'tossArmHold' },
  },
  contact_ahead_pct: {
    id: 'contact_ahead_pct',
    unit: 'pct',
    direction: 'higher',
    anchors: cardBand('contactAhead'),
    seriousMiss: 8,
    source: { card: 'contactAhead' },
  },
  toss_peak_ratio: {
    id: 'toss_peak_ratio',
    unit: 'ratio',
    direction: 'band',
    // The ceilings used to fall with the rung, to 1.78 at the top — below every
    // published toss peak in skilled servers (1.82–2.08 from the ankle line; see
    // `tossPeakHeight` in coaching.ts). A better server is not asked to toss
    // lower than the best servers do, so the ceiling is the card's at every rung.
    //
    // And now the floor is too (`CARD_SIGNAL`). It climbed 1.24 to 1.40 with the
    // rung, on no club data, and a toss that peaks at 1.30 tops out under where
    // a beginner meets the ball (1.49 in these units), so no rung should pass it.
    anchors: cardBand('tossPeakHeight'),
    seriousMiss: 0.18,
    source: { card: 'tossPeakHeight' },
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
 * as no fault at all, for the same reason `REAL_CHANGE` refuses to call a move
 * the camera makes on its own progress.
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
 *
 * THE MOTION IS REAL NOW, THOUGH THE CAMERA IS NOT. Until D7.6 every figure
 * here came from noise on the rig's serve, and the rig was written beside the
 * bands, so the floors could only show the engine agreeing with itself
 * (`ANALYSIS-REVIEW.md` F1). The same noise now runs on six real serves from
 * the Bath motion capture as well (`realiseReal`, sixty takes each, scaled to
 * the player's size in the picture), and every floor has to cover both. Real
 * motion asked for more on five signals, all of them read from depth or at a
 * moment the body is moving fast through, and those five floors rose:
 *
 *                      rig sd   real sd   floor was   floor now
 *   pronation_deg       18.3     50.1        31          76
 *   palm_to_sky_deg      4.2     11.7        11          18
 *   separation_deg        —       8.8         9          30  (UNDER_RESOLVED)
 *   spine_lean_deg       4.0      6.6         7          10
 *   elbow_lift_ratio    0.006    0.011     0.012       0.017
 *
 * The others held. `hip_lead_ms` moves more on real motion (42 ms against 37)
 * and its 76 still covers that, and every signal read from the picture plane
 * is as steady on real motion as on the rig, or steadier. Confirmed on all
 * forty Bath serves at sixty takes each, which agree with the six to within a
 * rounding step.
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
  // smallest structure in the skeleton. The rig's deviation is 18.3°; real
  // motion's is 50.1°, because a real hand turns fast through contact and the
  // keyframe lands a sample either side of the turn, so 1.5 × that rounds up to
  // 76. Was 31 from the rig alone, and 16 before that, clipped to `seriousMiss`.
  //
  // Nothing is graded against this floor any longer — `pancake_contact` is
  // measured and never named, for the reasons in `UNDER_RESOLVED` — but the
  // figure stays, because it is the measurement, and the day a better pronation
  // estimator arrives this is the number it has to beat.
  pronation_deg: 76,
  // Same normal, read on one frame near the trophy. 18 since D7.6: real motion
  // moves it 11.7° between takes of one serve against the rig's 4.2°, so 1.5×
  // rounds up to 18. The cost, at sixty takes: the tray demonstration's dial is
  // named on 93% rather than 97%, and a milder tray (60° rather than 80°) on 70%
  // rather than 98%. What it buys is that no real serve is told it carries a
  // tray because of the camera — 0 of 2,400 takes, from 0.2%.
  //
  // The rig's deviation was 6.8° when the paragraph below was written; the rig
  // has since been re-posed on real motion (D7.2) and reads 4.2°.
  //
  // Was 10, and that one degree is worth the comment it costs. Nobody capped
  // this on purpose: 1.5 × 6.783 is 10.17, and somebody wrote down the round
  // number. It went unnoticed for as long as it did because the check that
  // would have caught it compared floors against one deviation rather than
  // against the one-and-a-half this file documents. A rounded-down floor is a
  // cap however small and however accidental, and this is a signal that names a
  // grip fault, so it now rounds the way floors have to round — up.
  palm_to_sky_deg: 18,
  // A yaw difference. Hedged already by the camera check, and wider than its
  // own serious miss on real motion: see `UNDER_RESOLVED.separation_deg` for
  // why it sits at 30 and not at the 14 its deviation asks for. Was 9, from a
  // rig whose default camera cannot read the coil at all, so nothing had ever
  // checked it.
  separation_deg: 30,
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
  //
  // REAL MOTION MOVED IT AGAIN, AND THE ABOVE STILL HOLDS FOR THE RIG. The
  // same noise on the Bath serves moves the lean 6.6° between takes, against
  // the rig's 4.0°, so 1.5× rounds up to 10 — level with the 10° serious miss,
  // not over it, so the signal is still resolved. It cost what the paragraph
  // above priced, again: at sixty takes the rig's 26° collapse is named on 20%
  // rather than 43%, a 30° one on 50% rather than 78%. What it bought is on
  // real serves. At 7, 37 of 40 Bath serves were told their posture collapses
  // on some takes and not others, 3.8% of all takes; at 10, 22 serves and 1.3%.
  // The tail is long — 16 still leaves 0.2% — so the floor stops where its own
  // rule puts it rather than chasing zero into a detector that never fires.
  spine_lean_deg: 10,
  // The rest are read from x and y, which the camera genuinely saw, and are an
  // order of magnitude steadier for it.
  //
  // In percent of height since L5.1, when the drift became the card's spread
  // (`tossPath.ts`): the rig moves it 0.143 between takes and the Bath serves
  // 0.128, and one and a half of the rig's rounds up to 0.22.
  toss_drift_ratio: 0.22,
  drop_depth_ratio: 0.012,
  // 0.017 since D7.6: the rig's elbow moves 0.006 between takes and a real one
  // 0.011. The back-scratch dial is named on every take either way, and no real
  // serve was named at either floor.
  elbow_lift_ratio: 0.017,
  contact_height_ratio: 0.012,
  toss_peak_ratio: 0.02,
  // One and a half of the Bath serves' deviation between takes, 1.5, rounded
  // up (L5.3); the rig moves it a third as far.
  contact_ahead_pct: 3,
  // One and a half of the Bath serves' deviation, 1.15, rounded up (L5.4).
  toss_arm_hold_pct: 2,
  // One and a half of its ensemble deviation, 0.006, rounded up to the next hundredth.
  leg_drive_rise_ratio: 0.01,
  // Real motion asks for more than the rig (13.5 ms against 7.5): one and a
  // half of the real deviation, from `realiseReal` (D3.6).
  chest_open_ms: 21,
}

/**
 * How far the phone's position alone moves a signal, filming the same serve.
 *
 * Not the same thing as `NOISE_FLOOR`, and kept apart because it acts in only
 * one of the two places that table is read. A noise floor is how far one camera
 * wobbles between two takes; this is how far two cameras disagree about one
 * take, which no amount of repeat filming from the same spot reveals. A player
 * cannot be told their contact is low by a number the angle could have made.
 *
 * Measured, not assumed: the 40 Bath serves filmed by a virtual phone from five
 * places players stand one (`npm run bench:mocap`). Perspective is the cause —
 * from the left side or the back fence the hitting hand meets the ball further
 * from the lens than the hips the body is measured by, so it reads small — and
 * the medians spread from 1.11 to 1.23 for the same serves. Half that spread,
 * since a reading sits somewhere inside it rather than at one end.
 *
 * MOSTLY GONE SINCE D7.4. The hand's height above the hips now comes from the
 * world skeleton, which has no perspective in it (`handHeight.ts`), and the
 * same forty serves agree from all five places to 0.023 (medians 1.211 to
 * 1.234). Half of that is 0.012, the signal's own noise floor, so the allowance
 * no longer widens anything; it stays as the measured figure, so a change that
 * brings the spread back shows up here first. It was 0.06.
 *
 * Applied where a fault is named (`evaluateFlaws`), never to the rating
 * (`inferTier`), for the reason `rungStep` gives: there a wider allowance would
 * let a signal claim a higher rung and hand the player a harder target.
 * Signals read from world joint angles show no spread here and have no entry;
 * that says the angle does not move them, not that MediaPipe's depth is exact.
 */
export const CAMERA_ALLOWANCE: Record<string, number> = {
  contact_height_ratio: 0.012,
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
 *
 * Since D7.6 a signal also lands here when real motion cannot resolve it —
 * `realiseReal`, the same noise on the Bath serves — and `separation_deg` is
 * the first to arrive that way: the rig's default camera never read it at all.
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
   * Kept, at a floor well above its deviation, because only an open chest
   * survives the noise — and an open chest is the fault.
   *
   * Never checked until D7.6. The rig's default camera is side-on, outside the
   * window `assessSpatial` reads depth in, so its ensemble drops the coil and
   * the floor of 9 was never held to anything. Real motion from the guide's
   * placement is read in depth, and there the coil moves 8.8° between takes of
   * one serve (all forty Bath serves at sixty takes: 8.6°), so 1.5× asks for 14
   * against a 12° serious miss. Under-resolved.
   *
   * At 9 the camera was naming the fault on its own. The Bath server's coil
   * reads 12° without noise (6° to 17° across the forty serves), just under the
   * tier-5 band's 13, and the noise pushes it over:
   *
   *                       real serves             rig, from a corner
   *   floor       takes named  serves flicker   no coil left  open chest
   *     9            27.8%         40 / 40          63%          100%
   *    14            12.7%         40 / 40          30%          100%
   *    20             4.4%         38 / 40           3%           97%
   *    25             1.0%         15 / 40           2%           93%
   *    30             0.0%          0 / 40           0%           85%
   *
   * Forty serves, sixty takes each, from the guide's placement at 50 fps; the
   * rig cases over sixty seeds at a 45° camera. Not one Bath serve is named
   * without the noise, so every naming in the first column is the camera's.
   *
   * 30 is the first floor that names none of them, which is the call
   * `hip_lead_ms` made above for the same reason: the engine may miss a fault
   * and may not invent one. What it gives up is the middle — shoulders and hips
   * turned level, no coil left, is no longer named — and what it keeps is an
   * open chest, shoulders already past the hips at the trophy, on 85%. That is
   * the shape `FLAW_COPY.early_shoulder_rotation` describes. As with the hip
   * lead, every finding now arrives at severity 'high'.
   *
   * `inferTier` already ignored this signal: 9° was wider than its 2.8° rung.
   */
  separation_deg:
    'kept: floor 30, far above its 14 — the first floor that names no real ' +
    'serve from the noise (0 of 2,400 takes, from 28% at 9), and an open ' +
    'chest is still named on 85%',

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
   * Real motion settled it further (D7.6). The same noise on the Bath serves
   * moves this reading 50.1° between takes of one serve, so the floor is now 76
   * — twice the band's lower edge at any rung.
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
    'genuine pancakes, and an unsigned angle cannot miss its band by 76°',
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
   *     every 15° dialled, at every step — a gain of 0.96. Two independent
   *     references seeing the same change means the change belongs to the arm
   *     and not to the frame. Since the arm was re-posed on the Bath serves the
   *     two run opposite ways round — the shoulder line sits on the far side of
   *     the forearm's arc — which is a fact about unsigned angles, not the arm.
   *     (Under the modelled camera the apparent gain falls to 0.8, which is the
   *     unsigned angle biasing towards the middle of its range under noise, not
   *     the geometry moving.)
   *   · **The absolute is not.** The same arm reads 57.1° in one frame and
   *     93.5° in the other, and the gap moves as the arm turns. There is no zero
   *     to put a band around.
   *   · **And switching frames is not the fix.** Each is confounded by a
   *     different posture: 30° of spine lean moves the trunk frame 6° on the
   *     Bath-shaped arm (15.1° on the old one), and 30° of shoulder tilt moves
   *     the shoulder frame 67°. The trunk frame is the better of the two and is
   *     still moved by half a noise floor by a posture that is not a shoulder
   *     rotation — and spine lean is not
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
    'same arm reads 57.1° against the trunk and 93.5° against the shoulder ' +
    'line. Both frames agree exactly about the size of a CHANGE (14.4° per 15° ' +
    'dialled, opposite ways round) and both are confounded by posture: 30° of ' +
    'spine lean moves the trunk frame 6–15° depending on where the arm sits. ' +
    'Delta gradeable in principle, absolute ruled out.',
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

  /*
   * How much of the trophy's knee bend was spent by contact.
   *
   * The other half of R51's pair: `leg_drive_rise_ratio` is how much of the load
   * became upward motion, this is how much load there was to spend. Knee bend at
   * the trophy is graded; nothing measured what happened to it.
   *
   * IT TRACKS ITS DIAL, which is the test `legs_peak_ms` below failed and the
   * one every uncalibrated reading has to pass before it ships. Dialling the
   * trophy knee angle from 118° to 158° — bent to nearly straight — moves the
   * extension 52.4 → 41.3 → 34.0 → 25.5 → 17.4: monotonic across all five rungs,
   * a 35.0° reading span against a 40° dial span, a slope of 0.87.
   *
   * A DEPTH READING, and that is the caveat rather than a footnote. A joint
   * angle cannot be had from one axis, so unlike the rise beside it this leans on
   * MediaPipe's inferred z. The rig used to report it identical at every camera
   * angle, because its world landmarks were fixed to the court; MediaPipe's come
   * in the camera's frame, the rig now hands them over that way, and the reading
   * moves 3.5° across 30–82° — a little over half its own deviation. What can be
   * said is that its deviation is 5.7° across the twenty-four-seed ensemble, against 9.4° for
   * `external_rotation_deg` and 20.2° for `pronation_deg` on the same clips: the
   * best-conditioned depth reading in the engine, on much the largest structure.
   *
   * NOT NAMED, for the usual reason and one of its own. A delta carries √2 × 5.7
   * = 8.1° against a 35.0° working span, which is resolvable — but nothing here
   * knows what a club player *should* straighten. A tour serve and a good club
   * serve are not ordered by this number, and a player who bends less has less
   * to spend rather than a fault.
   */
  knee_extension_deg:
    'measured and not named: tracks its dial 0.87 to one across five rungs, ' +
    'deviation 5.7° against a 35.0° span — the best-conditioned depth reading here. ' +
    'Nothing knows what a club player should straighten, and bending less is not a fault.',

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
   * The landing, and the first reading in this engine taken past contact.
   *
   * Better conditioned than most of what this engine grades, which is what makes
   * writing it down here rather than banding it a decision instead of a default.
   * Read off image x — coordinates the camera measured, not depth a network
   * inferred — a square landing reads 0.0035 ± 0.0028 body heights and a 0.12 m
   * one reads 0.0657 ± 0.0045, converged at 240 seeds and stable to the fourth
   * decimal from 24 upwards. That is a separation of about fourteen deviations.
   * Compare `hip_lead_ms`, which sits near one at its floor.
   *
   * Note the zero is 0.0035 rather than 0.0000: the reading is a magnitude, so
   * noise about a true zero folds positive instead of cancelling. Anything built
   * on this calibrates against that floor — see `LandingBalance.offset`.
   *
   * SO WHY IS IT NOT GRADED. Two reasons, and the first is the ordinary one this
   * whole record exists for: nothing in this repo knows what this number should
   * be for a club player. Zero is finishing square over your feet, and a serve
   * hit with real intent finishes travelling — a professional lands well across
   * their front foot on purpose. Without a value that separates driving through
   * the shot from falling over, a band would be four invented numbers.
   *
   * The second is specific and worse, and it is the reason this is not merely
   * awaiting a band: the reading is contaminated by the trailing leg, and the
   * size of it is now measured rather than suspected.
   *
   * `landing.offset` uses the ankle CENTRE, so that midpoint is only a fixed
   * reference while both feet stay planted. `landingBackFootDrag` in the rig
   * lets the back foot travel with the hips instead, which is what a leg
   * swinging through actually does, and the same 0.12 m collapse then reads:
   *
   *     back foot planted (drag 0)     0.0655
   *     half following   (drag 0.5)    0.0490
   *     fully following  (drag 1)      0.0326
   *
   * Half the fall, gone, depending on something that is not the fall. A number
   * that good-looking — fourteen deviations of separation — reporting half of
   * what happened is exactly the shape `pancake_contact` was retired for.
   *
   * READING THE FRONT ANKLE ALONE IS IMMUNE, and was measured rather than
   * assumed: 0.1155 at every drag setting, against a 0.0498 baseline, so the
   * same 0.0657 of separation with none of the contamination. It was NOT taken,
   * and the reason is the rule this file keeps relearning. That baseline is the
   * stance — how far the front foot sits from the hip centre — and stance width
   * is a constant in this rig (`HALF_HIP`) with no dial on it. So switching
   * would trade a confound that has been measured for one that this rig is
   * structurally incapable of measuring, which is how `hip_lead_ms` ended up
   * with a camera-angle sweep that could only ever come out flat. When footage
   * exists, measure the stance spread first and then switch; not before.
   *
   * Unsigned deliberately, and `LandingBalance.offset` carries why: which way
   * image x points depends on which side the camera stood, so a sign would be a
   * fact about the filming. Nothing here knows which direction is worse anyway.
   */
  /*
   * The racket hand over the shoulder at the knee trough (D3.5) — the amateur
   * signature in the WTA comparison: lower-ranked players were already rotated
   * back at maximum knee flexion, 95° of external rotation against the top
   * 40's 38° (Gao 2026). Read off image y, so the camera does not move it: on
   * the rig's `lateArmCock` dial it reads 0.156 cocked to 0.044 forward,
   * identically at 20°, 45° and 82°.
   *
   * STEADY ENOUGH, AND NO BAND. The deviation is 0.024 on the rig and 0.009 on
   * real motion, against a 0.11 span. What it lacks is a scale in these units:
   * the study gives a shoulder angle, and an angle a camera cannot read (2D has
   * no forearm rotation) does not convert to a hand height without a forearm
   * and an elbow angle nobody measured. The forty Bath serves read 0.10–0.17,
   * the cocked end — by the WTA finding the amateur end, on a capture of one
   * experienced player — so the one real population this engine has sits on
   * the side the research calls the fault. A band drawn from it would grade
   * the signature as normal; a band drawn from the study would be invented.
   */
  /*
   * Where the toss peaked from the front foot (D3.1): ahead of it, read from
   * the side, and across it towards the hitting side, read from behind. One
   * axis per camera; a corner mixes them and reads neither.
   *
   * WAITING FOR ITS BAND, WHICH EXISTS FOR CONTACT RATHER THAN THE TOSS. Flat
   * serves are struck 0.30–0.37 statures in front of the front foot and kick
   * serves 0.23–0.24 (Connolly 2021, elite boys), 56 against 51 cm in
   * professional men (Vacek 2023); kick contact sits 47 cm further to the left
   * for a right-hander against 16 (Vacek 2023). The ball barely moves forward
   * as it falls, so those are the right scale — but they are contact, and this
   * is the top of the toss, and turning one into the other is D2.1's citation
   * to make. On the rig's ball (`rigBall`) it reads its dial linearly — 0.3 m
   * reads 0.173 body heights from the side — and the other axis leaks only the
   * camera's angle off square.
   *
   * The toss map draws a target from it all the same (L4.7): `TOSS_TARGET`,
   * re-derived on the Bath serves with the rig's off-line toss held outside.
   * A picture of where to aim, not a fault — nothing is named from it.
   */
  toss_ahead_ratio:
    'measured and not named: the published distances are for contact (Connolly ' +
    '2021, Vacek 2023), not the top of the toss; reads its rig dial linearly from ' +
    'the side, and from the ball when there is one, the hand when not',
  toss_across_ratio:
    'measured and not named: read only from behind, and the same contact-not-toss ' +
    'gap as its partner; the kick-against-flat difference it will one day carry is ' +
    'published for contact (Vacek 2023)',

  /*
   * The landing from each foot (D3.3). R64 measured that the ankle-centre
   * reading loses up to half a fall to a back foot swinging through, and that
   * the front ankle alone is immune; read from contact, the stance no longer
   * sits in the baseline. On the rig from behind the server the front reading
   * tracks `landingLean` exactly — 0.028 and 0.057 body heights for 0.06 and
   * 0.12 m — at every `landingBackFootDrag`, and the follow reads that dial
   * exactly at every lean: the two kept apart.
   *
   * NO BAND FOR EITHER. The research names the landing — the front foot lands
   * and brakes in the foot-up pattern (Kovacs; Martin 2015) — and gives no
   * numbers for how far a body may fall across it, nor how far a back foot
   * should trail (`.scratch/research-biomech.md` §2.13: "no numeric norms").
   * The roadmap's grading was to be for a fall across the front foot; there is
   * nothing yet to grade it against.
   */
  landing_front_ratio:
    "measured and not named: tracks the rig's lean exactly from behind and is " +
    'immune to the back foot; read a third as large from the side; no published ' +
    'norm for how far a body may fall across its front foot',
  back_foot_follow_ratio:
    "measured and not named: reads the rig's back-foot dial exactly at every lean; " +
    'needs the hips to have moved to mean anything; no norm for how far a back ' +
    'foot should trail',

  /*
   * Which way the body went after contact (L5.7), signed by the swing's net
   * direction. On the rig from the side it reads `landingTravel` at the
   * picture's own scale, either sign; every Bath serve from either side reads
   * forward, 0.08–0.22 standing heights by the time its recording stops.
   *
   * NO BAND, AND FALLING BACK IS NOT NAMED. Coaches call a fall back a fault
   * (it goes with a toss behind the head), and no study gives a distance a
   * body should travel in, nor one past which a fall back costs anything. The
   * Bath serves are six skilled servers, all forward; a club player standing
   * still and a player falling back have nothing measured to be put against.
   */
  landing_travel_ratio:
    "measured and not named: signed by the swing's net direction and read from " +
    "the side only; reads the rig's travel dial either sign, every real serve " +
    'travels forward, and no study gives a distance to grade a fall back against',

  /*
   * The body held still at the trophy (D3.4) — see `hitch.ts` for how tempo,
   * which reverted R52, is kept out of it. On the rig with tracker noise, no
   * hitch reads 0.015 at the median and 0.061 at the 95th percentile across
   * three tempos at 60 fps; a 0.15 s hitch reads 0.107 at its 5th percentile.
   * The six fixture Bath serves read 0.000. Read only at 60 fps and above.
   *
   * NO BAND. R52 calls the hitch one of the most common club faults and one of
   * the most visible on video; nothing measured gives a length of pause a serve
   * may carry before it costs anything.
   */
  hitch_share_ratio:
    'measured and not named: separates a hitch from a slow serve on the rig at ' +
    '60 fps and above, every real serve reads zero, and no study gives a pause ' +
    'length to grade against',

  arm_cock_ratio:
    'measured and not named: the published signature is an angle (Gao 2026) and ' +
    'no study gives it as a hand height; tracks its dial from 0.156 to 0.044 at ' +
    'every camera angle, deviation 0.024 rig and 0.009 real, and the one real ' +
    'population sits on the end the research calls the fault',

  landing_offset_ratio:
    'measured and not named: well conditioned from behind the server — 0.0035 ' +
    'square against 0.0657 landed, on a 0.0045 deviation — and a quarter of that ' +
    'from the guide placement, where a body facing the net falls along the ' +
    'camera\'s line of sight; nothing knows what a club player should read, and ' +
    'the rig poses a symmetric shift where a real collapse is over the front ' +
    'foot, so it is validated against a model of the fault rather than the fault',

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

/**
 * Where a serve type moves a diagnosis band, added to both edges.
 *
 * Only where the card moves its band for the same quantity: the card and the
 * diagnosis read the same number, and a kick toss the card calls fine must not
 * come back as the fault the report asks the player to fix. Today that is one
 * entry. The card lets a kick toss peak at racket reach, 1.20 against the flat
 * serve's 1.38 (`SERVE_TYPES.kick` in coaching.ts), and the ladder's floor
 * moves down by the same 0.18. Contact height has no entry because the card
 * has none: published kick and flat impact heights are within a centimetre of
 * each other (Vacek 2023). Slice has no overrides on the card either.
 *
 * Read off the card's overrides for every row in `CARD_SIGNAL` rather than
 * typed a second time, so the two tables cannot drift; `flaws.test.ts` still
 * holds them to each other.
 */
export const SERVE_TYPE_SHIFT = Object.fromEntries(
  (Object.keys(SERVE_TYPES) as ServeType[]).map((type) => [
    type,
    Object.fromEntries(
      Object.entries(CARD_SIGNAL).flatMap(([card, signal]) => {
        const moved = SERVE_TYPES[type].overrides[card]
        const [lo, hi] = METRICS[card].ideal
        return moved ? [[signal, [moved[0] - lo, moved[1] - hi]]] : []
      }),
    ),
  ]),
) as Record<ServeType, Partial<Record<string, [number, number]>>>

/**
 * The band to aim at: the one belonging to the tier above this player, moved
 * for the serve they said they hit (`SERVE_TYPE_SHIFT`).
 */
export function targetFor(signal: string, currentTier: number, serveType: ServeType = 'flat'): [number, number] {
  const band = bandFor(signal, nextTier(currentTier))
  const shift = SERVE_TYPE_SHIFT[serveType]?.[signal]
  return shift ? [band[0] + shift[0], band[1] + shift[1]] : band
}

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
 * Currently that excludes every one of the four: `hip_lead_ms` (76 ms floor
 * against a 7 ms rung), `separation_deg` (30° against 2.8°), `drop_depth_ratio`,
 * whose band no longer moves with the rung at all — real motion showed hand
 * depth does not separate levels — and `contact_height_ratio`, whose band is
 * the card's at every rung (`CARD_SIGNAL`). The excluded signals are
 * still measured, still shown and still graded for flaws; what they no longer do
 * is guess a rating, and a player who is not at the default can say so.
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
    // Both kinds of spread, because a rating has to survive both: the same
    // phone filming twice, and two phones filming once. Contact height was the
    // signal the second half removed — the phone's position moved it 0.12 on a
    // ladder whose rungs were 0.03 apart — and since D2.3 its band does not move
    // with the rung at all. So on real footage no signal rates a player, and the
    // answer is the stated default until the player moves it.
    .filter((s) => Math.max(NOISE_FLOOR[s] ?? 0, CAMERA_ALLOWANCE[s] ?? 0) < rungStep(s))
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
