/**
 * What each fault's keyframe still shows of it, or why a still cannot (D4.6).
 *
 * The stills are the only picture of a serve that outlives the clip, so they
 * carry the measurement where a single frame can: the target zone and the gap
 * to it for a height (`ghostFor`), the arc at the joint the reading was taken
 * at, and the ball's flight. Where one frame cannot hold the fault — a rise is
 * two moments, a wander is a path, a turn towards the lens moves nothing in the
 * picture — it says so here rather than drawing something that looks like
 * evidence and is not. `stillEvidence.test.ts` renders every entry.
 *
 * Beside these, two readings with no fault of their own are drawn too: the
 * knee's arc on the trophy still, and on the toss still where the toss peaked
 * against the front foot (`tossMarkFor`).
 */
import type { FlawId } from './flaws'
import type { PhaseId } from './types'

export type StillEvidence =
  | {
      phase: PhaseId
      /**
       * `target`: the height's target zone and the gap to it. `angle`: the arc at
       * the joint, with its readout. `flight`: the ball's arc to its top.
       */
      shows: 'target' | 'angle' | 'flight'
    }
  | { none: string }

export const STILL_EVIDENCE: Record<FlawId, StillEvidence> = {
  low_contact: { phase: 'contact', shows: 'target' },
  toss_arm_drops: { none: 'How long the arm stays up runs from the toss to the hit, and a still holds one moment of it.' },
  contact_behind: {
    none: 'Which way the net is comes from the whole swing, so one frame cannot say in front from behind.',
  },
  toss_height: { phase: 'contact', shows: 'flight' },
  collapsed_elbow: { phase: 'drop', shows: 'angle' },
  shallow_drop: {
    none: 'A full drop and a shallow one leave the hand at nearly the same height on the drop still; the racket, which tells them apart, is not drawn from the clip.',
  },
  no_leg_drive: { none: 'A rise runs from the knee bend to the hit, and a still holds one of the two moments.' },
  toss_drift: { none: "The tossing hand's wander is a path, and a still holds one point of it." },
  early_shoulder_rotation: {
    none: 'From the side the chest turns towards the lens, which narrows the shoulders by a few pixels and moves nothing a player can see.',
  },
  posture_collapse: { none: 'From the side the trunk bends along the line the camera looks down.' },
  waiters_tray: { none: "The palm's direction is read from a few hand landmarks, too small on a still to draw honestly." },
  arming_the_ball: { none: 'Not named (see flaws.ts).' },
  pancake_contact: { none: 'Not named (see flaws.ts).' },
}
