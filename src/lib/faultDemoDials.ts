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
 * teach nothing, so the faults in `NO_DEMO` stay out, each with the dials
 * that show it has no shape from any camera the rig has (the test measures
 * them again, so the list cannot become a way round the rule).
 *
 * FROM WHERE IT SHOWS (C1.2). A demonstration is drawn from the camera the
 * engine reads its fault from: side-on for most, and from behind the baseline
 * for `posture_collapse`, the spine bending sideways across the hips. By
 * contact the hips face the net, so from the side that bend runs along the
 * lens (0.035 body heights) and the engine does not name it there either; from
 * behind, the head and shoulders are 0.15 apart at contact, and that is where
 * `angleReach.ts` sends the player to film it. Both bodies stand under the
 * same camera, and the picture says which.
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
 * `contact_behind` came back in C1.2: the ball met 0.35 m further back is named
 * on the demo serve since contact ahead's floor rose (H40), and the racket
 * head and the ball are 0.32 body heights from the fix's at contact. N4.2 had left it out
 * when the side-on demo serve could not settle which way the net was.
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
export type DemoPart = 'racket' | 'elbow' | 'tossingHand' | 'ball' | 'hips' | 'trunk'

export const PART_NAME: Record<DemoPart, string> = {
  racket: 'the racket head',
  elbow: 'the hitting elbow',
  tossingHand: 'the tossing hand',
  ball: 'the ball',
  hips: 'the hips',
  trunk: 'the head and shoulders',
}

/** Where the camera stands for a demonstration: the guide's side-on placement, or behind the baseline. */
export type DemoView = 'side' | 'behind'

/**
 * The rig's camera yaw for each view: the guide's own placement (`CLEAN_SERVE`),
 * and the one the flaw suite names a sideways lean from.
 */
export const VIEW_YAW: Record<DemoView, number> = { side: 82, behind: 8 }

/** Said under a picture not drawn from the side, so nobody compares it with their own side-on clip. */
export const VIEW_LINE: Partial<Record<DemoView, string>> = {
  behind: 'Seen from behind the baseline, where this fault shows.',
}

export interface DemoSpec {
  dials: Partial<ServeDials>
  moment: PhaseId
  part: DemoPart
  /** Where the drawn toss peaks, in statures; the model's own when absent. */
  apex?: number
  /** Where the camera stands; side-on when absent. */
  view?: DemoView
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
  toss_arm_drops: { dials: { tossArmHold: 0.3 }, moment: 'drop', part: 'tossingHand' },
  // Where the ball is met: the racket head is as far out, but the ball is what the cue moves.
  contact_behind: { dials: { contactBehind: 0.35 }, moment: 'contact', part: 'ball' },
  posture_collapse: { dials: { spineLean: 34 }, moment: 'contact', part: 'trunk', view: 'behind' },
}

/**
 * The faults with no demonstration, the dials that pose each, and why. The
 * test builds each from every view and holds it under `DEMO_MIN_DIFFERENCE`:
 * a fault that grows a shape has to move to `DEMOS`.
 */
export const NO_DEMO: Partial<Record<FlawId, { dials: Partial<ServeDials>; why: string }>> = {
  arming_the_ball: {
    dials: { hipLead: -0.09 },
    why: 'the order the hips and shoulders fire in: a timing fault has no shape',
  },
  early_shoulder_rotation: {
    dials: { shoulderYaw: 82, hipYaw: 116 },
    why: 'a turn of the trunk about its own axis: under 0.05 body heights from the side, a corner or behind',
  },
}

/**
 * How far apart the two bodies must be at the demonstration's moment, in body
 * heights, measured on the landmark that moved most once both are lined up at
 * the hips. A tenth is about 18 cm on an adult — a difference somebody can see
 * on a phone without being told where to look.
 */
export const DEMO_MIN_DIFFERENCE = 0.1

/** The camera yaw a demonstration is drawn from. */
export const yawOf = (spec: DemoSpec): number => VIEW_YAW[spec.view ?? 'side']

/** Whether a fault has a demonstration at all — for deciding to offer one. */
export const hasDemo = (flaw: FlawId | undefined): flaw is FlawId =>
  flaw !== undefined && flaw in DEMOS
