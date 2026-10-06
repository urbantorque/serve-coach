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
 *   · the spine lean is dialled without the toss wobble the flaw suite pairs it
 *     with, so the picture is the collapse and not its cause;
 *   · a collapsed elbow and a shallow drop share one dial, because the elbow
 *     falling is what makes the drop shallow (`flaws.ts`).
 *
 * The moment is the keyframe the fault's own signal is read at in
 * `diagnose.ts` — where the picture parks for a player who has asked for less
 * motion, so the still they see is the instant the app judged.
 *
 * ONLY FAULTS A STICK FIGURE CAN SHOW. Every entry must differ from its fix by
 * `DEMO_MIN_DIFFERENCE` at that moment (`faultDemo.test.ts`). Three named faults
 * were built and measured and did not, and two people standing side by side
 * looking the same under "this fault" and "the fix" teaches nothing:
 *
 *   · `arming_the_ball` is the order the hips and shoulders fire in. Dialled at
 *     a 90 ms lead, the two bodies are never more than 0.016 body heights apart
 *     anywhere in the swing — a timing fault has no shape.
 *   · `early_shoulder_rotation` is the trunk turning towards the net, which on
 *     the side-on camera is a turn towards the lens: 0.04 at its widest.
 *   · `toss_drift` is where the ball goes, and the picture draws no ball; the
 *     hand's own wander is 0.08, and the trail follows the racket hand rather
 *     than the tossing one.
 *
 * `toss_height` is the ball too, and the pancake is never named (`flaws.ts`).
 */
export const DEMOS: Partial<Record<FlawId, { dials: Partial<ServeDials>; moment: PhaseId }>> = {
  waiters_tray: { dials: { palmToSky: 80, trophyForearmDrop: 0.22 }, moment: 'trophy' },
  posture_collapse: { dials: { spineLean: 26 }, moment: 'contact' },
  collapsed_elbow: { dials: { dropBelowShoulder: 0.05 }, moment: 'drop' },
  shallow_drop: { dials: { dropBelowShoulder: 0.05 }, moment: 'drop' },
  low_contact: { dials: { contactReach: 1.15 }, moment: 'contact' },
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
