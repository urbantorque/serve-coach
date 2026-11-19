/**
 * The fault order and the drill tables, with nothing that reads a clip (Q12).
 *
 * Split out of `triage.ts`, which also runs the tracker's own checks on a clip
 * (blur, spatial reach, the Kalman bridge). Home, the week plan, progress and the
 * session dashboard need only these tables, and importing them from `triage`
 * pulled the whole clip-reading engine into the entry chunk. `triage.ts`
 * re-exports every name here, so the engine and its tests read them as before.
 */
import { SOFT_MEASUREMENT } from './softness'
import type { BodyAxis } from './axes'
import type { FlawFinding, FlawId } from './flaws'
import type { InjuryFlag } from './triage'

/* ------------------------------------------------------------- hierarchy -- */

/**
 * What has to be right before anything below it can be judged.
 *
 * Read top to bottom: the first group with a detected fault in it is the only
 * group the player hears about. The order is not a ranking of how much each
 * costs in racket-head speed — it is a ranking of what causes what.
 */
export const HIERARCHY: { group: string; flaws: FlawId[] }[] = [
  // The grip decides what the racket face can do at all. No amount of
  // sequencing work makes a tray grip produce a serve.
  { group: 'grip', flaws: ['waiters_tray'] },
  // Then where the ball is. Every fault below this can be caused by a toss in
  // the wrong place, and several of them usually are.
  // A ball met over the head is the toss seen at contact (L5.3), so it sits
  // here rather than with the contact faults below.
  { group: 'toss', flaws: ['toss_height', 'toss_drift', 'toss_arm_drops', 'contact_behind'] },
  // Then the legs. Kovacs's order puts the load straight after the release:
  // his team finds most serve faults in those two stages, and a serve whose
  // legs never lift the body has nothing under the swing for the drop to use.
  { group: 'legs', flaws: ['no_leg_drive'] },
  // Then whether the body can stay under it.
  { group: 'posture', flaws: ['posture_collapse'] },
  // Then the swing: the drop that makes racket speed possible.
  { group: 'drop', flaws: ['shallow_drop', 'collapsed_elbow'] },
  // Then the order the body fires in.
  { group: 'sequence', flaws: ['early_shoulder_rotation', 'arming_the_ball'] },
  // And last, what happens at the ball itself — the most visible faults, and
  // the ones most often caused by something above them.
  //
  // `pancake_contact` is still listed and can no longer reach this list: it is
  // marked `notNamed` in `flaws.ts`, so it never comes back detected and this
  // group is `low_contact` in practice. Left in place rather than deleted
  // because the hierarchy is a statement about what causes what, which is still
  // true, and because deleting it here would only strand the drill below. If
  // somebody rebuilds the pronation measurement, this is where it plugs back in.
  { group: 'contact', flaws: ['pancake_contact', 'low_contact'] },
]

/**
 * The rung at and below which the arm comes before the legs (L3.9).
 */
export const ARM_FIRST_AT = 4

/**
 * The hierarchy at a player's level (L3.9).
 *
 * Kovacs's order puts the legs straight after the toss, and for a serve that
 * already has an arm action that is right. At club level and below it is not: the arm
 * action matures first and leg drive last (Whiteside 2013), and a serve with
 * no leg drive costs racket speed while adding no load to the shoulder (Reid
 * 2008). So at rung 4 and below the racket drop and the elbow come before the
 * legs; above it the order is Kovacs's.
 */
export function hierarchyFor(tier?: number): typeof HIERARCHY {
  if (tier === undefined || tier > ARM_FIRST_AT) return HIERARCHY
  const arm = HIERARCHY.find((g) => g.group === 'drop')!
  const rest = HIERARCHY.filter((g) => g.group !== 'drop')
  const legs = rest.findIndex((g) => g.group === 'legs')
  return [...rest.slice(0, legs), arm, ...rest.slice(legs)]
}

/**
 * The one drill for each flaw. Identifiers only; the copy lives in coaching.
 *
 * `pronation_snap` is unreachable for as long as `pancake_contact` is not named.
 * Kept so this stays a total map over `FlawId` — a partial one would push the
 * missing-key check out to every reader — and kept deliberately rather than by
 * neglect: the drill is sound, it is the measurement underneath it that is not.
 */
export const FLAW_DRILL: Record<FlawId, string> = {
  waiters_tray: 'edge_first_serve',
  toss_height: 'rail_height_toss',
  // The axis-blind answer, and the fallback for a stored report from before
  // findings carried an axis. `FLAW_DRILL_BY_AXIS` below overrides it whenever
  // the diagnosis knows which way the toss actually wandered — which, on the
  // framing this app recommends, is almost always front-to-back rather than the
  // sideways this drill constrains.
  toss_drift: 'one_line_toss',
  posture_collapse: 'head_up_hold',
  shallow_drop: 'back_scratch_drop',
  collapsed_elbow: 'overhead_throw',
  early_shoulder_rotation: 'hip_lead_turn',
  arming_the_ball: 'back_leg_serve',
  no_leg_drive: 'back_leg_serve',
  pancake_contact: 'pronation_snap',
  low_contact: 'up_and_out',
  contact_behind: 'step_in_toss',
  toss_arm_drops: 'point_and_hold',
}

/**
 * The drill to hand out when the finding knows which axis it measured.
 *
 * A drill cannot hedge, which is the whole reason this table exists. "Toss so
 * the ball brushes a fence you are standing side-on to" pins the hand's sideways
 * position and says nothing at all about how far in front of the body it went —
 * so a player whose toss wanders front-to-back can do it perfectly, twenty times
 * a day, and change nothing. The instruction is the half of the report a player
 * acts on, and an instruction aimed at the wrong axis costs them the session and
 * the trust.
 *
 * It matters because the wrong axis was the usual case, not the edge case. On
 * the side-on framing this app recommends, `axes.ts` puts 99% of an image-x toss
 * reading on the front/back axis, and `toss_drift` handed out the fence drill on
 * every one of those clips.
 *
 * Partial on purpose: a flaw with no entry has no axis question, and its answer
 * stays the single one in `FLAW_DRILL`.
 */
export const FLAW_DRILL_BY_AXIS: Partial<Record<FlawId, Record<BodyAxis, string>>> = {
  toss_drift: { depth: 'baseline_drop_toss', lateral: 'fence_line_toss' },
}

/**
 * The drill for one finding: by axis where there is one, by flaw otherwise.
 *
 * The fallback is not a formality. A report stored before findings carried an
 * axis has none, and a clip filmed at the 45° tie has none either because
 * `diagnose` refuses to guess there — both must come back with the axis-neutral
 * drill rather than with whichever axis happened to be listed first.
 */
export function drillIdFor(flaw: FlawId, axis?: BodyAxis): string {
  return (axis && FLAW_DRILL_BY_AXIS[flaw]?.[axis]) || FLAW_DRILL[flaw]
}


/**
 * Whether a finding stands on a reading firm enough to lead the plan.
 *
 * `SOFT_MEASUREMENT`, the card's own line, rather than `MIN_EVIDENCE`, which
 * asks only whether a fault may be named at all. A finding between the two is
 * real enough to list and too rough to start with.
 */
export const isFirm = (f: Pick<FlawFinding, 'confidence'>): boolean => f.confidence >= SOFT_MEASUREMENT

/**
 * The raw signals each flag is read from.
 *
 * Exported because "this clip did not raise the flag" and "this clip could not
 * see the joint" are different facts, and anything counting flags across a
 * history has to tell them apart — a silhouetted shoulder is not a healthy one.
 * `injuriesIn` reads this table for its own guards rather than repeating the
 * list inline, so the two answers can never drift apart: whatever a flag is
 * measured from is, by construction, what a reader is told it needs.
 */
export const INJURY_INPUTS: Record<InjuryFlag, readonly string[]> = {
  // The palm alone since L1.3. The forearm's turn through contact is
  // `UNDER_RESOLVED` (an 85° floor, and real serves turn about 93°), so as the
  // flag's second witness it was true on every real serve and proved nothing.
  wrist_strain_forced_pronation: ['palm_to_sky_deg'],
  lumbar_load_posture_collapse: ['spine_lean_deg'],
  shoulder_load_no_drop: ['drop_depth_ratio', 'contact_height_ratio'],
}

/**
 * Whether a clip could have raised this flag at all.
 *
 * Takes the signal bag rather than a `Diagnosis` so a caller holding a report
 * read back out of storage can ask without reassembling one.
 */
export function injuryInputsRead(
  signals: Record<string, number> | undefined,
  flag: InjuryFlag,
): boolean {
  if (!signals) return false
  return INJURY_INPUTS[flag].every((id) => Number.isFinite(signals[id]))
}
