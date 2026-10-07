/**
 * One answer, or an honest refusal.
 *
 * The diagnostic pass finds everything it can and reports all of it, which is
 * the right behaviour for an engine and the wrong thing to hand a player. A club
 * serve genuinely has six things wrong with it, and a list of six is a list
 * nobody acts on — worse, most of them are downstream of the first. Telling
 * somebody with a waiter's tray about their hip–shoulder separation is telling
 * them to decorate a room whose floor is missing.
 *
 * So this collapses a diagnosis to a single instruction, chosen by a hierarchy a
 * coach would recognise: the grip decides what the racket can do, the toss
 * decides where the ball is, posture decides whether the body can get to it, and
 * only then does anything about the swing itself matter. Whatever the deepest
 * fault is, the shallowest one wins.
 *
 * The other half of this module is refusal. A scrappy clip — thirty frames a
 * second, a hand blurred to a smear, a phone held at an angle — still produces
 * a complete set of numbers, and those numbers are confabulated. There is no
 * version of "the toss drifted eight centimetres" that is worth saying when the
 * tracker could not see the hand, and the only safe output is a reason the clip
 * could not be read.
 */
import { blurOf, capturedSamples, frozenThroughSwing, stabilise } from './kalman'
import { assessSpatial, spatialVisibility, type Spatial } from './spatial'
import { clamp, keyVisibility, mean, sided } from './geometry'
import type { BodyAxis } from './axes'
import type { Diagnosis } from './diagnose'
import type { FlawFinding, FlawId } from './flaws'
import { SEVERITY_RANK, bandFor, type Severity } from './tiers'
import type { Skeleton } from './phases'
import type { Frame } from './types'

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
  { group: 'toss', flaws: ['toss_height', 'toss_drift'] },
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

/* --------------------------------------------------------------- refusal -- */

/**
 * Every reason this app throws a clip out, as a list a test can walk.
 *
 * A frozen array with the type derived from it, rather than a bare union — the
 * argument `DETECTOR_IDS` makes in `detector.ts`, arrived at here from the other
 * direction. A union cannot be enumerated at runtime, so nothing could check
 * that a refusal added elsewhere in the app does not collide with one of these.
 *
 * Round 49 found that it had: the outbound detector shipped a
 * `'too_few_frames'` meaning "too few streaks agreed" beside this one, which
 * means "the clip had too few swing samples". Two enums with one value are
 * indistinguishable the moment they meet in a log or a reason-to-sentence map,
 * and the types cannot help — they are separate unions that never touch.
 */
export const REJECTIONS = [
  'body_not_visible',
  'too_few_frames',
  'too_blurry',
  'camera_unusable',
] as const

export type RejectReason = (typeof REJECTIONS)[number]

export type InjuryFlag =
  | 'wrist_strain_forced_pronation'
  | 'lumbar_load_posture_collapse'
  | 'shoulder_load_no_drop'

export interface Triage {
  schema: 1
  status: 'ok' | 'rejected'
  reason?: RejectReason
  /**
   * How well the clip could be read. **Optional because storage may drop it.**
   *
   * Always written by `triage()`. `normalise` drops the whole block when its
   * five-field shape is wrong, rather than repairing it — there is no honest
   * default for a missing `confidence`, since inventing 0.9 manufactures a
   * measurement and 0 refuses a clip that was fine. The verdict and the primary
   * flaw survive that, which is why the block is dropped and the triage is not:
   * a rejected clip legitimately has readings nobody took, and losing the
   * rejection would put it back into a history that refused it.
   */
  quality?: {
    confidence: number
    blur: number
    roll_deg: number
    yaw_deg: number
    /**
     * Whether `yaw_deg` above was measured, or is the 45 that stands in for a
     * reading that could not be taken. See `Spatial.yaw_measured`.
     *
     * On the stored block because the thing that needs it is a comparison
     * between two saved serves, and by then the frames it would be recomputed
     * from are long gone — `Session` is `Omit<Analysis, 'frames'>`.
     */
    yaw_measured: boolean
    swing_samples: number
    depth_unreliable: boolean
  }
  tier?: { current: number; target: number }
  primary_flaw?: {
    flaw: FlawId
    group: string
    signal: string
    value: number
    unit: 'deg' | 'ms' | 'ratio'
    target: [number, number]
    target_tier: number
    severity: Severity
    /**
     * The body axis the signal was read along, where the signal has one.
     *
     * Stored on the report rather than re-derived, so a reopened session says
     * the same thing about the same clip. Absent on flaws with no axis question
     * and on reports written before this field existed.
     */
    axis?: BodyAxis
  }
  drill_id?: string
  /**
   * Mechanics that risk an injury rather than a lost point.
   *
   * Never suppressed by the hierarchy and never the "one flaw": a player being
   * quietly funnelled towards a wrist problem needs to know regardless of what
   * their primary fault is, and burying it behind a triage rule would be the one
   * place this module's simplicity did real harm.
   */
  injury_risk: { flag: InjuryFlag; severity: Severity }[]
  /** How much was found and deliberately not said. A count, never a list. */
  suppressed_count: number
}

export interface Resilience {
  spatial: Spatial
  /** 0–1, how badly the racket hand's track is degraded. */
  blur: number
  /** Samples captured between the racket drop and contact. */
  swingSamples: number
  /** Mean visibility of the landmarks the serve is measured from. */
  visibility: number
}

/**
 * Below these, the clip is not evidence.
 *
 * Set from what the measurements need rather than from what looks bad: three
 * samples across the swing is the point at which the drop and contact can no
 * longer be told apart in time, and a hand seen at less than half confidence
 * through the swing is a hand the model was inventing.
 */
export const LIMITS = {
  visibility: 0.45,
  swingSamples: 3,
  blur: 0.75,
  spatial: 0.4,
} as const

/**
 * How much the clip itself can be trusted, before anything is measured from it.
 *
 * Deliberately separate from the per-measurement confidence already on the
 * report. That one asks "how soft is this number"; this asks "should this clip
 * have produced numbers at all", and the two failure modes are different — a
 * perfectly framed clip at 24 fps has excellent visibility and no usable swing
 * timing whatsoever.
 */
export function assessResilience(frames: Frame[], skel: Skeleton): Resilience {
  const { keys, bodyHeight } = skel
  const R = sided(skel.racket)

  const spatial = assessSpatial(frames, keys.ready, bodyHeight)

  // The racket hand: the fastest-moving landmark in the clip, and the first
  // thing to degrade when the camera has little light per frame.
  //
  // Read across the whole serve rather than trophy-to-contact. The narrow
  // window is where the smear is worst, which is why it was chosen, but it is
  // five frames at 24 fps and thirty at 120 — and over five frames of the
  // fastest part of a swing the statistic is dominated by the real curvature of
  // the arc, which scales with the sampling interval. Measured, that made the
  // same clip read blur 0.58 at 24 fps and 0.17 at 120. Across the full serve
  // the median has enough samples to be a median, and the flat stretches at
  // either end are what make it comparable between clips shot at different
  // rates: 1.0-1.3x across 24 to 120 fps, against 3.4x before.
  //
  // The cost is real and worth stating: a smear confined to the eight frames
  // around contact moves this far less than it moved the narrow window. That is
  // accepted because the failure it replaces was certain rather than possible —
  // every clip filmed at a high frame rate was being scored as though it were
  // blurred, and the refusal told the player to refilm in slow motion.
  const lo = clamp(keys.ready, 0, frames.length - 1)
  const hi = clamp(keys.finish, 0, frames.length - 1)
  const window = frames.slice(lo, hi + 1)
  const track = stabilise(
    window.map((f) => f.image[R.wrist]),
    window.map((f) => f.t),
  )

  // Counted rather than subtracted: short detection gaps are bridged before the
  // measurements see them, and an interpolated frame is not a captured sample.
  const swingSamples = capturedSamples(frames, keys.drop, keys.contact)
  const serve = frames.slice(
    clamp(keys.ready, 0, frames.length - 1),
    clamp(keys.finish, 0, frames.length - 1) + 1,
  )

  // A second, different question from `wildness` above: not whether the track
  // is erratic, but whether it moved at all. MediaPipe frozen on a stale guess
  // through an occlusion is often smooth rather than noisy, which reads as
  // clean to a statistic built on curvature — see `frozenThroughSwing`. Asked
  // only over drop-to-contact, the one stretch guaranteed to be a large,
  // fast excursion whichever fundamentals were dialled, so a genuinely
  // compact swing is never mistaken for a frozen one.
  const dropLo = clamp(keys.drop, 0, frames.length - 1)
  const dropHi = clamp(keys.contact, dropLo, frames.length - 1)
  const frozen = frozenThroughSwing(
    frames.slice(dropLo, dropHi + 1).map((f) => f.image[R.wrist]),
    bodyHeight,
  )

  return {
    spatial,
    blur: frozen ? 1 : blurOf(track, bodyHeight),
    swingSamples,
    visibility: serve.length
      ? mean(serve.map(keyVisibility))
      : mean(frames.map(keyVisibility)),
  }
}

/**
 * Why this clip cannot be read, or nothing.
 *
 * Ordered by how fundamental the problem is, so a clip that is both dark and
 * short is reported as the thing the player should fix first. Every reason is
 * something they can do differently next time, which is the only test that
 * matters for a refusal.
 */
export function rejectionFor(r: Resilience): RejectReason | undefined {
  if (r.visibility < LIMITS.visibility) return 'body_not_visible'
  if (r.swingSamples < LIMITS.swingSamples) return 'too_few_frames'
  if (r.blur >= LIMITS.blur) return 'too_blurry'
  if (r.spatial.confidence < LIMITS.spatial) return 'camera_unusable'
  return undefined
}

/* ---------------------------------------------------------------- triage -- */

/**
 * Collapse a diagnosis to the single thing to work on, or to a refusal.
 *
 * The hierarchy decides which group; within a group, severity decides. A flaw
 * the diagnosis has already attributed to another detected flaw is never chosen,
 * even when it is the more severe of the two — the whole point of attributing it
 * was to say that fixing it directly is wasted work.
 */
export function triage(diagnosis: Diagnosis, resilience: Resilience): Triage {
  /*
   * The floor of everything that could have gone wrong with the clip, then
   * shaded by whatever else also went wrong.
   *
   * The floor is the important half and the reason this is not an average: one
   * broken input is enough, and averaging lets three healthy signals paper over
   * the one that matters. But a pure `Math.min` has the opposite failure, which
   * only became visible once the blur figure stopped being enormous on every
   * clip and therefore stopped always being the minimum: a clip that is worse
   * than a clean one in a dimension that is *not* currently the smallest scores
   * exactly the same as the clean one. A shaky, partly-dropped clip came back
   * at 0.75, the same figure a flawless one gets, because both were capped by
   * the camera angle.
   *
   * So the worst term still sets the ceiling, and the others can only take it
   * down from there — never up.
   */
  const terms = [
    resilience.spatial.confidence,
    1 - resilience.blur,
    clamp(resilience.visibility, 0, 1),
    clamp(resilience.swingSamples / 5, 0, 1),
  ]
  const worst = Math.min(...terms)
  const others = terms.reduce((a, b) => a * b, 1) / Math.max(worst, 1e-6)

  const quality = {
    confidence: round2(clamp(worst * (0.6 + 0.4 * clamp(others, 0, 1)), 0, 1)),
    blur: round2(resilience.blur),
    roll_deg: resilience.spatial.roll_deg,
    yaw_deg: resilience.spatial.yaw_deg,
    yaw_measured: resilience.spatial.yaw_measured,
    swing_samples: resilience.swingSamples,
    depth_unreliable: resilience.spatial.depth_unreliable,
  }

  const reason = rejectionFor(resilience)
  if (reason) {
    // A refusal carries no tier, no flaw and no drill. Half an answer off a clip
    // this bad is worse than none: it is the half the player would act on.
    return { schema: 1, status: 'rejected', reason, quality, injury_risk: [], suppressed_count: 0 }
  }

  const detected = diagnosis.flaws.filter((f) => f.detected)
  const attributed = new Set(detected.filter((f) => f.caused_by).map((f) => f.flaw))

  let primary: { finding: FlawFinding; group: string } | undefined
  for (const level of HIERARCHY) {
    const here = detected
      .filter((f) => level.flaws.includes(f.flaw))
      .filter((f) => !attributed.has(f.flaw))
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    if (here.length) {
      primary = { finding: here[0], group: level.group }
      break
    }
  }

  // Everything found was a symptom of something also found: fall back to the
  // most severe of them rather than reporting a clean serve. This is rare and
  // means the attribution graph has a cycle or a gap, and silently saying
  // "nothing wrong" would be the worst possible way to find that out.
  if (!primary && detected.length) {
    const best = [...detected].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])[0]
    const group = HIERARCHY.find((l) => l.flaws.includes(best.flaw))?.group ?? 'contact'
    primary = { finding: best, group }
  }

  const injury_risk = injuriesIn(diagnosis)

  if (!primary) {
    return {
      schema: 1,
      status: 'ok',
      quality,
      tier: { current: diagnosis.tier.current, target: diagnosis.tier.target },
      injury_risk,
      suppressed_count: 0,
    }
  }

  const f = primary.finding
  return {
    schema: 1,
    status: 'ok',
    quality,
    tier: { current: diagnosis.tier.current, target: diagnosis.tier.target },
    primary_flaw: {
      flaw: f.flaw,
      group: primary.group,
      signal: f.signal,
      value: f.value,
      unit: f.unit,
      target: f.target,
      target_tier: f.target_tier,
      severity: f.severity,
      ...(f.axis ? { axis: f.axis } : {}),
    },
    drill_id: drillIdFor(f.flaw, f.axis),
    injury_risk,
    suppressed_count: Math.max(0, detected.length - 1),
  }
}

/**
 * Mechanics that risk a joint rather than a point.
 *
 * Each of these is a *combination*. None of the individual signals is dangerous
 * on its own — plenty of people serve happily with a shallow drop — and it is
 * the pairing that loads a joint in a direction it does not travel.
 *
 * Read against absolute limits rather than against the player's tier, which is
 * the one place in the engine that does not scale. A joint has the same range at
 * every rating, and a wrist being driven past it does not become acceptable
 * because the player is a beginner.
 */
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
  wrist_strain_forced_pronation: ['palm_to_sky_deg', 'pronation_deg'],
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

/** The racket-drop band's floor — the same at every level — below which the hand never laid back. */
const NO_DROP = bandFor('drop_depth_ratio', 5)[0]

function injuriesIn(d: Diagnosis): { flag: InjuryFlag; severity: Severity }[] {
  const out: { flag: InjuryFlag; severity: Severity }[] = []
  const sig = (id: string) => d.signals[id] ?? Number.NaN
  const has = (flag: InjuryFlag) => injuryInputsRead(d.signals, flag)

  // A tray grip that is nevertheless being rotated hard through the ball. The
  // forearm starts at the end of its range instead of the beginning, so the
  // rotation has to come from the wrist joint itself — which is where club
  // players pick up the wrist and elbow pain they blame on their strings.
  if (has('wrist_strain_forced_pronation')) {
    if (sig('palm_to_sky_deg') >= 45 && sig('pronation_deg') >= 45) {
      out.push({
        flag: 'wrist_strain_forced_pronation',
        severity: sig('palm_to_sky_deg') >= 65 ? 'high' : 'medium',
      })
    }
  }

  // A spine folding sideways under load, a hundred times a session.
  if (has('lumbar_load_posture_collapse') && sig('spine_lean_deg') >= 22) {
    out.push({
      flag: 'lumbar_load_posture_collapse',
      severity: sig('spine_lean_deg') >= 30 ? 'high' : 'medium',
    })
  }

  // Reaching for a high contact with no external rotation to get there: the
  // shoulder makes up the difference at the end of its own range.
  //
  // "No drop" is the hand left above the shoulder by more than the drop band
  // allows (`drop_depth_ratio` in tiers.ts), the forearm never laid back. It
  // used to be a hand less than 0.1 *below* the shoulder, the back-scratch
  // belief the drop band was re-anchored away from: on real serve motion the
  // hand sits at the shoulder on a full drop, so that rule warned every player
  // with a high contact about a shoulder they were using correctly.
  if (has('shoulder_load_no_drop')) {
    if (sig('drop_depth_ratio') < NO_DROP && sig('contact_height_ratio') >= 1.3) {
      out.push({ flag: 'shoulder_load_no_drop', severity: 'medium' })
    }
  }

  return out
}

const round2 = (v: number) => Math.round(v * 100) / 100

export { spatialVisibility }
