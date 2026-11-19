/**
 * Which faults have a demonstration, and the rig dial that poses each one.
 *
 * Apart from `faultDemo.ts` because the report has to know whether to offer a
 * demonstration before it loads the rig to build one: this file imports types
 * only, so asking costs the report nothing, and the rig arrives with the tap.
 */
import type { ServeDials } from './analysis/syntheticServe'
import type { FlawId } from './analysis/flaws'
import type { PhaseId } from './analysis/types'

/**
 * The dial that poses each fault, at a size the engine names at a club tier,
 * and the moment it is easiest to see.
 *
 * Taken from the dials the flaw and triage suites already detect, so the
 * picture and the detector are looking at the same serve:
 *
 *   · the tray lays the forearm over as well as turning the palm, because that
 *     is the shape the fault makes (`trophyForearmDrop`'s own comment);
 *   · a collapsed elbow is the back scratch: the hand let down behind the
 *     shoulder with the elbow fallen under it. The elbow dial alone is not
 *     enough since the drop was re-posed on real motion — with the hand left at
 *     the shoulder, as real serves leave it, an arm of fixed length cannot put
 *     the elbow further than 0.09 of standing height under the shoulder line,
 *     and the fault starts past 0.11. Nothing real comes near that either: the
 *     forty Bath serves hold the elbow between 0.00 and 0.04 *above* the line.
 *
 * ONLY FAULTS A STICK FIGURE CAN SHOW. Every entry must differ from its fix by
 * `DEMO_MIN_DIFFERENCE` (`faultDemo.test.ts`), measured on the part it names.
 * Two people side by side looking the same under "this fault" and "the fix"
 * teach nothing, so two faults stay out:
 *
 *   · `arming_the_ball` is the order the hips and shoulders fire in. Dialled at
 *     a 90 ms lead, the two bodies are never more than 0.016 body heights apart
 *     anywhere in the swing — a timing fault has no shape.
 *   · `early_shoulder_rotation` is the trunk turning towards the net, which on
 *     the side-on camera is a turn towards the lens: 0.04 at its widest.
 *   · `posture_collapse` is the spine bending sideways across the hips, and by
 *     contact the hips face the net — so the bend runs along the baseline, which
 *     is the line the guide's camera looks down. Re-posed on the Bath serves'
 *     trunk turn, a 26° collapse moves the picture 0.035 body heights. The
 *     engine still names it, because it reads the lean from the depth the pose
 *     model infers, and the picture draws only what the lens sees.
 *
 * Four came back once the figure carried a racket and a ball (L4.4, L4.5):
 *
 *   · `shallow_drop` is the racket failing to fall behind the player: the hand
 *     left high and the racket held up, head to the sky (a negative
 *     `racketLayBack`, drawing only). Measured where a clean racket has
 *     fallen; `faultDemo.test.ts` prints how far apart the two heads are.
 *   · `toss_height` is a choice of apex for the drawn ball, here a toss that
 *     goes too high: 2.45 statures against the model's 1.8.
 *   · `toss_drift` is the tossing hand wandering on its way up, dialled to
 *     0.2 m so the hand itself moves a tenth of a body height.
 *   · the legs: straight at the trophy and no rise to contact. No instant of
 *     it is a tenth apart once both bodies stand on the same hips, because the
 *     fault IS the hips' travel — so its measure is that travel, from the
 *     trophy to contact, on the same ground.
 *
 * `pancake_contact` is never named (`flaws.ts`).
 *
 * The moment is a keyframe of the CLEAN serve: where the picture parks, and
 * where the fault body shows it. A racket that never falls has its own drop
 * found at its trophy, and parking there showed two identical bodies.
 */

/**
 * What a demonstration asks the player to watch (L4.5), named under the
 * picture and painted in `--work` on the faulty body, with the fix's own
 * dashed beside it.
 */
export type DemoPart = 'racket' | 'elbow' | 'tossingHand' | 'ball' | 'hips'

export const PART_NAME: Record<DemoPart, string> = {
  racket: 'the racket head',
  elbow: 'the hitting elbow',
  tossingHand: 'the tossing hand',
  ball: 'the ball',
  hips: 'the hips',
}

export interface DemoSpec {
  dials: Partial<ServeDials>
  moment: PhaseId
  part: DemoPart
  /** Where the drawn toss peaks, in statures; the model's own when absent. */
  apex?: number
}

export const DEMOS: Partial<Record<FlawId, DemoSpec>> = {
  // The arm laid over too since L5.2: a palm alone on a high arm is not named.
  waiters_tray: { dials: { palmToSky: 80, trophyForearmDrop: 0.22, trophyArmLayOver: 1 }, moment: 'trophy', part: 'racket' },
  collapsed_elbow: { dials: { dropBelowShoulder: 0.1, dropElbowLift: -1.5 }, moment: 'drop', part: 'elbow' },
  low_contact: { dials: { contactReach: 1.0 }, moment: 'contact', part: 'racket' },
  shallow_drop: { dials: { dropBelowShoulder: -0.25, racketLayBack: -60 }, moment: 'drop', part: 'racket' },
  toss_height: { dials: {}, apex: 2.45, moment: 'trophy', part: 'ball' },
  toss_drift: { dials: { tossWobble: 0.2 }, moment: 'toss', part: 'tossingHand' },
  no_leg_drive: { dials: { trophyKneeAngle: 175, contactHipHeight: 0.95 }, moment: 'contact', part: 'hips' },
  // N4.2: the tossing arm down a third of the way to contact, not held up to it.
  // Contact behind was tried and left out: the engine names it only from a
  // side view where the net's direction is certain, and the demo serve is not
  // one, so a demo of it would show a fault the read would not call.
  toss_arm_drops: { dials: { tossArmHold: 0.3 }, moment: 'drop', part: 'tossingHand' },
}

/**
 * How far apart the two bodies must be at the demonstration's moment, in body
 * heights, measured on the landmark that moved most once both are lined up at
 * the hips. A tenth is about 18 cm on an adult — a difference somebody can see
 * on a phone without being told where to look.
 */
export const DEMO_MIN_DIFFERENCE = 0.1

/** Whether a fault has a demonstration at all — for deciding to offer one. */
export const hasDemo = (flaw: FlawId | undefined): flaw is FlawId =>
  flaw !== undefined && flaw in DEMOS
