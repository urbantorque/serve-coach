/**
 * How far the legs led the arm: from the legs' fastest rise to the elbow's
 * fastest moment, at the frame rate an ordinary clip has.
 *
 * WHAT THE FIRING ORDER COULD NOT DO. `Diagnosis.firingOrder` is gated at 60
 * fps, and the pose grid reads a real-time clip at about 30 samples a second
 * however the file was shot (`pose/rate.ts`), so outside slow motion no player ever saw
 * it. The gate's reason was that a 33 ms sample is wider than the 15 ms slack.
 * That was reasoned, not measured.
 *
 * MEASURED AGAINST 180 Hz TRUTH (ANALYSIS-REVIEW.md, 2026-11-05; run again on
 * the frames walk for H41). The forty Bath serves through the virtual phone,
 * each take on a sampling phase of its own, under the tracker noise fitted to
 * MediaPipe. Truth is 86 ± 11 ms from the legs to the elbow and 167 ± 9 from the
 * legs to contact. From the guide's side, on a 30 fps file read the way the app
 * walks it, the two read within 15 and 14 ms rms, and on a 60 fps file within 13
 * and 12. On the even grid a file of unknown rate falls back to, 16 and 15 at 30
 * fps, 17 and 16 at 60. Every frame of a 120 fps clip reads 13 and 15: past 30
 * fps the tracker sets the limit, not the clock.
 *
 * The sharper peak-finders lost. Clean, a spline through every sample and a
 * local cubic beat the chain's smoothing, by as much as 7 ms against 35 at 60
 * fps. Under the tracker they read this gap at 24 to 45 ms rms at 30 and 60 fps,
 * because a tracker's error is mostly fresh each frame and a peak is where a
 * curve is flattest. So this differences the chain's own links and adds no
 * series.
 *
 * WHAT IT CAN SAY. The call needs the gap past `LEG_LEAD_SLACK`, a little over
 * twice the camera's noise on it. On those forty serves from both baseline
 * placements, 240 takes on each of six reads (30 and 60 fps files read both of
 * the app's ways, and every frame of 60 and 120 fps slow motion), 2,878 of 2,880
 * reads came back `legs_first` and the other two were unread. With the hips and
 * legs run late on the same serves, on the app's reads of a 30 or 60 fps file: a
 * true gap of −14 ms reads `level` on 94–100% of takes and `legs_first` on 0.8%
 * at most; −44 reads `arm_first` on 36–81% and `legs_first` on none; −74 reads
 * `arm_first` on 85–99%. Raising the slack from 35 to 39 (H41) cost the −44 row
 * 7 to 20 points a cell: at 35 these reads give 46–88%. (36–73% and 46–83% before
 * H45's model of the read stopped where the app's seek does; the 71–87% before H41
 * was the old 32 Hz read.) From about 200 ms late the legs' peak leaves the search
 * window and the link is dropped rather than guessed.
 *
 * ONLY FROM THE SIDE. Seen from behind the swing towards the net is depth, and
 * the elbow's speed in the picture peaks 90 ms early, with the legs. The legs
 * alone are read from image y and hold from every side, in `chain.legs`.
 *
 * ONLY WHEN THE HIPS ROSE. `chain.legs` times the rise and does not measure it,
 * and a rise too small to time is a peak made of tracker noise. Swept on the
 * rig under the same noise at 30 fps, the gap's spread is about 2.2 / rise ms:
 * ±19 at a rise of 0.115, ±33 at 0.056, ±83 at 0.024, ±148 at 0.010. At the
 * floor here a serve whose true gap is 100 ms read 15 ms at worst, and under it
 * they start to read arm-first. It is `LegDrive`'s own zero: a player who never
 * leaves the ground rises 0.0457 straightening out of the knee bend.
 *
 * MEASURED AND NOT GRADED. A gap scales with tempo (92 ms on the rig's 1.35 s
 * serve, 161 on a 2.2 s one), and the nearest published figures are neither
 * this quantity nor a club player's: peak lead-knee extension 180 ± 65 ms before
 * contact in Olympic servers (Fleisig 2003, via Kovacs 2011), peak hip speed
 * 108–117 ms before it in the WTA (Gao 2026). The order is the claim, and order
 * is Fleisig's too. See `UNCALIBRATED.leg_lead_ms`.
 */
import type { ChainTiming } from './diagnose'
import type { Frame } from './types'

export interface LegLead {
  /** Fastest rise of the hips to the elbow's fastest moment, ms. Negative when the elbow came first. */
  ms: number
  /** Which led, as far as the camera can tell. `level` is too close to call, not a verdict. */
  order: 'legs_first' | 'level' | 'arm_first'
  /** The less well seen of the two links, 0–1. */
  confidence: number
}

/**
 * How far the gap has to clear zero to be called, ms: a little over twice its
 * noise (`CHAIN_NOISE_SD.leg_lead_ms`, 17), so a near-tie is never called a
 * swap. It was 35 until 240 takes, rather than 36, showed a tie read legs first
 * too often (H41).
 */
export const LEG_LEAD_SLACK = 39

/** How far the hips must rise, in body heights, for the peak of that rise to be a moment. */
export const LEG_LEAD_MIN_RISE = 0.05

/** Below this many samples a second it was not measured: 20 fps is the lowest that held. */
export const LEG_LEAD_MIN_RATE = 20

export function readLegLead(
  frames: Frame[],
  chain: Pick<ChainTiming, 'legs' | 'elbow'>,
  rise: number | null,
  view: 'side' | 'front-back' | 'angled',
): LegLead | undefined {
  if (view !== 'side') return undefined
  const span = frames[frames.length - 1].t - frames[0].t
  // A shade under the line, so a read at 20 on the dot passes whatever its last digit.
  if (!(span > 0) || (frames.length - 1) / span < LEG_LEAD_MIN_RATE - 0.05) return undefined
  const legs = chain.legs.ms
  const elbow = chain.elbow.ms
  if (legs === null || elbow === null) return undefined
  if (rise === null || !(rise >= LEG_LEAD_MIN_RISE)) return undefined
  const ms = elbow - legs
  return {
    ms,
    order: ms >= LEG_LEAD_SLACK ? 'legs_first' : ms <= -LEG_LEAD_SLACK ? 'arm_first' : 'level',
    confidence: Math.min(chain.legs.confidence, chain.elbow.confidence),
  }
}
