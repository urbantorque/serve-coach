/**
 * The camera's noise on each card reading, on its own (L3.8): `bests.ts`
 * reads it from the home screen, and `consistency.ts`, where it was measured
 * and is tested, brings the whole diagnosis with it.
 */

/**
 * How far each card reading moves between takes of one serve, from the camera
 * alone, on the read the app actually makes (H38).
 *
 * The standard deviation over 240 takes, the worst of 26 cells: the rig's clean
 * serve and the six Bath serves from the guide's placement and the back fence,
 * each on a 30 fps file and a 60 fps file, with the suite's camera noise. Every
 * take lands on the frames its own way (`readPhase`), goes through the app's read
 * of a file (`appRead`, `readingPlan`) and the app's own path, swap guard and
 * levelling included (`runEngine`). Measured 2026-11-07. `consistency.test.ts`
 * re-measures it on the same seeds and fails if the camera now moves a reading
 * further than this says (L1.8). That is a regression check on these seeds, not a
 * bound on the camera: against disjoint takes a figure moves up to about a fifth,
 * 7 to 8% rms by row, and on heavy tails it runs low (load ratio 2.57 over 2,880
 * takes).
 *
 * It was measured on films at 50 fps, on one sampling phase, and the app reads at
 * 30. The method changed on the owner's say, because the old figures were not the
 * app's: arm extension moves 10.0° between takes here, not 6.45°, and contact in
 * front 3.46 points, not 1.97.
 *
 * WHAT IT COVERS. A window around contact, walked on the frames of a file whose
 * rate the app knows, real-time, 30 fps or a multiple: the located window of a
 * longer clip, and a clip of up to four seconds read whole. On a 120 or 240 fps
 * file no row is more than about 9% over (1.094). On a 24 or 25 fps file rows run up to 1.31
 * of the table (load ratio), contact height and toss path 1.2, arm extension 11.0
 * at 24. Slow motion reads more samples through the swing and is not in it.
 *
 * Drop depth's figure is set by the rig's clean serve, whose drop lands on the
 * toss on about one take in 25 on this read. That is in here, so a basket takes
 * it out; the fault floors set those takes apart (`depth.test.ts`), because there
 * the collapse is named by a path no floor gates.
 *
 * What it does not, by its worst row, measured on 240 takes a cell:
 *   - rate unknown, located window: toss path 0.62 (2.05 times the table),
 *     contact ahead 4.66 (1.35), drop to contact 20.7 (1.26), toss arm 1.23, load
 *     ratio 1.13 (at 60 fps: toss path 1.71, contact ahead 1.21);
 *   - rate unknown, a clip of 2.5 to 4.5 s read whole, the serve anywhere in it:
 *     toss path 2.1 (at 2.5 s), contact height and contact ahead 1.6 and hand under
 *     elbow 1.5 (at 4.5 s), drop to contact 1.5; on a 60 fps file toss path 1.6,
 *     contact ahead and contact height 1.4. Clean serves are told a fault there:
 *     the ball met behind on 4 or 5 takes of 1,440 from the guide, a toss wandering
 *     on 14 to 16 of 1,440 from behind (H45);
 *   - the blind five-second window, where the scan found nothing, on a 60 fps
 *     file walked at 20 a second (on 120 takes a cell): contact height 1.45, toss
 *     arm 1.4, leg drive 1.3, hand under elbow 1.27, load ratio 1.2;
 * And on 120 takes a cell, the serve anywhere in the clip, where the budget
 * cannot walk the frames and the grid's count is read on frames of its own:
 *   - a 30 fps clip of 4.1 to 4.4 s read whole: contact ahead 1.65, hand under
 *     elbow 1.6, drop to contact 1.4, contact height 1.35, toss arm 1.3; a 60 fps
 *     one of 4.1 s: toss path 1.26, contact ahead 1.14;
 *   - the blind window at 30 fps: contact ahead 2.74, drop to contact 1.68,
 *     contact height 1.44, hand under elbow and arm extension 1.3; at 25 fps,
 *     contact ahead, contact height, toss arm and load ratio about 1.4.
 *
 * Nor a still serve whose legs bend to 150 to 165°: the load is timed from the
 * hips on some takes and the arms on others, and a basket that mixes them is told
 * its time from trophy to contact moves on 16 to 24% of still baskets of six with
 * no drop, up to 14% with one (H46, held in `consistency.test.ts`).
 *
 * WHAT IT DOES NOT. This is a floor, not the tracker's whole error. The noise is
 * the suite's: independent from frame to frame, about a quarter the size of the
 * error fitted to MediaPipe's wrist. Under that fitted error six rows would fail
 * the band rule and arm extension would read about 24°, on any table. The
 * table is what the camera does at the least. And seeds are six serves, so it
 * proves consistency, not accuracy.
 *
 * A reading missing here has no measured noise, and none is subtracted from it:
 * the ball readings, which the mocap bench has no ball for.
 */
export const CARD_NOISE_SD: Record<string, number> = {
  releaseHeight: 0.00766,
  tossArmHold: 2.33,
  tossPathWobble: 0.3,
  kneeBend: 4.27,
  shoulderTilt: 3.04,
  legDrive: 0.00723,
  dropDepth: 0.00985,
  elbowAtDrop: 5.81,
  handUnderElbow: 2.65,
  dropToContact: 16.4,
  contactHeight: 0.00874,
  armExtension: 10.0,
  contactAhead: 3.46,
  loadRatio: 2.38,
}

/**
 * The same for the timings the card does not carry, in ms: the worst real serve
 * from the guide's placement, on 30, 60 and 120 fps files. 240 takes of each of
 * the six Bath serves under the tracker noise fitted to MediaPipe, on a sampling
 * phase of their own (`trackedTake`): at 30 fps where the frames fall moves a peak
 * as far as the tracker does.
 *
 * The gap is steadier than either end's reading of it would suggest, because
 * both ends are timed against the same contact and its error cancels: under
 * RTMPose the links move 10–11 ms between takes and the gap 5–6.
 *
 * Measured 2026-11-07, when the read moved to the file's own frames (H41): the
 * larger of 60 and 240 takes, rounded up. On the even grid, where the rate is
 * unknown, a 30 fps file moves them 23, 17 and 22. `legLead.test.ts` re-measures
 * the three rates on 60 takes, and fails if the camera now moves one further than
 * this says.
 */
export const CHAIN_NOISE_SD: Record<string, number> = {
  leg_lead_ms: 17,
  legs_peak_ms: 14,
  elbow_peak_ms: 18,
}

/**
 * The score past which a basket's least steady row is not called a wander: the
 * line `consistencyHeadline` says "almost nothing moved" at. Here rather than
 * there so Progress and the share card hold the same line without bringing the
 * diagnosis with them.
 */
export const STEADY_ENOUGH = 85

/**
 * What one read moves on real footage, where it is more than the rig says (N2.1).
 *
 * `retest.html` took two openly licensed amateur clips (320 x 240, the worst a
 * phone gives), re-encoded the serve's own stretch through a canvas, and read it
 * again darker, from a step further back, at 60% of the pixels and 1/40 s later.
 * Each row here is the root mean square of its move from the plain re-encode,
 * divided by 1.41 for the two reads in every difference, over twelve changed
 * copies in two runs (2026-11-17, `docs/next/bench/retest.json`), rounded up.
 * Rows that stayed inside `CARD_NOISE_SD` there are not listed.
 *
 * The heights move most: the stature they are divided by is read off the same
 * frames, so a darker or smaller picture moves the ruler as well as the hand.
 *
 * MEASURED, NOT ADOPTED. Used as the floor under the player's usual, a basket's
 * wander and a new best, it cost eight checks that prove a real change is still
 * found on the rig (a wandering basket, a racket drop's first best, a lower
 * contact against the usual). Two 320 x 240 clips overstate what a 1080p phone
 * does, so the table waits for sharper open footage through the same bench
 * before it moves any claim. Nothing reads it yet; the ledger has the numbers.
 */
export const RETEST_SD: Record<string, number> = {
  dropDepth: 0.081,
  contactHeight: 0.046,
  legDrive: 0.019,
  releaseHeight: 0.018,
  loadRatio: 3.9,
  kneeBend: 5.8,
  handUnderElbow: 3.5,
  tossArmHold: 2.4,
}

