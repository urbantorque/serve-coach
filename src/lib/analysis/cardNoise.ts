/**
 * The camera's noise on each card reading, on its own (L3.8): `bests.ts`
 * reads it from the home screen, and `consistency.ts`, where it was measured
 * and is tested, brings the whole diagnosis with it.
 */

/**
 * How far each card reading moves between takes of one serve, from the camera
 * alone: the standard deviation over twenty-four noisy takes, the larger of the
 * worst real serve (the six Bath serves, filmed from the guide's placement and
 * the back fence, `realiseReal`'s noise) and the rig's clean serve. Measured
 * 2026-10-09; `consistency.test.ts` re-measures it and fails if the camera
 * now moves a reading further than this says (L1.8).
 *
 * A reading missing here has no measured noise, and none is subtracted from it:
 * the ball readings, which the mocap bench has no ball for.
 */
export const CARD_NOISE_SD: Record<string, number> = {
  releaseHeight: 0.0069,
  tossArmHold: 1.53,
  tossPathWobble: 0.224,
  kneeBend: 3.77,
  shoulderTilt: 2.59,
  legDrive: 0.0081,
  dropDepth: 0.0074,
  elbowAtDrop: 5.29,
  handUnderElbow: 2.43,
  dropToContact: 18.5,
  contactHeight: 0.0099,
  armExtension: 9.63,
  contactAhead: 1.97,
  loadRatio: 4.59,
}

/**
 * The same for the timings the card does not carry, in ms: the worst real serve
 * from the guide's placement, across 30, 60 and 120 fps and the app's 32 Hz read
 * of 30 and 60 fps files. Twenty-four takes of each of the six Bath serves under
 * the tracker noise fitted to MediaPipe, on a sampling phase of their own
 * (`trackedTake`), which is harder than the table above: at 30 fps where the
 * frames fall moves a peak as far as the tracker does.
 *
 * The gap is steadier than either end's reading of it would suggest, because
 * both ends are timed against the same contact and its error cancels: under
 * RTMPose the links move 10–11 ms between takes and the gap 5–6.
 *
 * Measured 2026-11-05; `legLead.test.ts` re-measures the three rates a clip
 * most often arrives at, and fails if the camera now moves one further than
 * this says.
 */
export const CHAIN_NOISE_SD: Record<string, number> = {
  leg_lead_ms: 17,
  legs_peak_ms: 15,
  elbow_peak_ms: 19,
}
