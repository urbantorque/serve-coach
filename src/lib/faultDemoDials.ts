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
 * The moment is the keyframe the fault's own signal is read at in
 * `diagnose.ts` — where the picture parks for a player who has asked for less
 * motion, so the still they see is the instant the app judged.
 *
 * ONLY FAULTS A STICK FIGURE CAN SHOW. Every entry must differ from its fix by
 * `DEMO_MIN_DIFFERENCE` at that moment (`faultDemo.test.ts`). Four named faults
 * were built and measured and did not, and two people standing side by side
 * looking the same under "this fault" and "the fix" teaches nothing:
 *
 *   · `arming_the_ball` is the order the hips and shoulders fire in. Dialled at
 *     a 90 ms lead, the two bodies are never more than 0.016 body heights apart
 *     anywhere in the swing — a timing fault has no shape.
 *   · `early_shoulder_rotation` is the trunk turning towards the net, which on
 *     the side-on camera is a turn towards the lens: 0.04 at its widest.
 *   · `posture_collapse` is the spine bending sideways across the hips, and by
 *     contact the hips face the net — so the bend runs along the baseline, which
 *     is the line the guide's camera looks down. It was shown while the rig
 *     reached contact still side-on; re-posed on the Bath serves' trunk turn,
 *     a 26° collapse moves the picture 0.035 body heights. The engine still
 *     names it, because it reads the lean from the depth the pose model infers,
 *     and the picture draws only what the lens sees.
 *   · `toss_drift` is where the ball goes, and the picture draws no ball; the
 *     hand's own wander is 0.08, and the trail follows the racket hand rather
 *     than the tossing one.
 *
 *   · `shallow_drop` is the racket failing to lay back behind the player, and
 *     the picture draws no racket. Since the drop band was re-anchored on real
 *     motion (ANALYSIS-REVIEW.md §9) the fault is a hand left high above the
 *     shoulder against a hand near it, and at the moment the fault is read —
 *     the trophy, for a racket that never fell — the two bodies were measured
 *     0.000 apart. Withdrawn rather than shown as two identical figures.
 *
 * `toss_height` is the ball too, and the pancake is never named (`flaws.ts`).
 */
/**
 * The racket arm's segment a dial moves, painted in `--work` on the faulty
 * body with the fixed one dashed beside it (L4.4). The upper arm, the
 * forearm, or both.
 */
export type DemoLimb = 'upperArm' | 'forearm' | 'arm'

export const DEMOS: Partial<Record<FlawId, { dials: Partial<ServeDials>; moment: PhaseId; limb: DemoLimb }>> = {
  waiters_tray: { dials: { palmToSky: 80, trophyForearmDrop: 0.22 }, moment: 'trophy', limb: 'forearm' },
  collapsed_elbow: { dials: { dropBelowShoulder: 0.1, dropElbowLift: -1.5 }, moment: 'drop', limb: 'upperArm' },
  low_contact: { dials: { contactReach: 1.0 }, moment: 'contact', limb: 'arm' },
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
