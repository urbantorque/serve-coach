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
import { blurOf, capturedSamples, stabilise } from './kalman'
import { assessSpatial, spatialVisibility, type Spatial } from './spatial'
import { clamp, keyVisibility, mean, sided } from './geometry'
import type { Diagnosis } from './diagnose'
import type { FlawFinding, FlawId } from './flaws'
import { SEVERITY_RANK, type Severity } from './tiers'
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
  // Then whether the body can stay under it.
  { group: 'posture', flaws: ['posture_collapse'] },
  // Then the swing: the drop that makes racket speed possible.
  { group: 'drop', flaws: ['shallow_drop', 'collapsed_elbow'] },
  // Then the order the body fires in.
  { group: 'sequence', flaws: ['early_shoulder_rotation', 'arming_the_ball'] },
  // And last, what happens at the ball itself — the most visible faults, and
  // the ones most often caused by something above them.
  { group: 'contact', flaws: ['pancake_contact', 'low_contact'] },
]

/** The one drill for each flaw. Identifiers only; the copy lives in coaching. */
export const FLAW_DRILL: Record<FlawId, string> = {
  waiters_tray: 'edge_first_serve',
  toss_height: 'rail_height_toss',
  toss_drift: 'fence_line_toss',
  posture_collapse: 'head_up_hold',
  shallow_drop: 'back_scratch_drop',
  collapsed_elbow: 'elbow_up_l',
  early_shoulder_rotation: 'hip_lead_turn',
  arming_the_ball: 'slow_sink_hold',
  pancake_contact: 'pronation_snap',
  low_contact: 'heels_up_basket',
}

/* --------------------------------------------------------------- refusal -- */

export type RejectReason =
  | 'body_not_visible'
  | 'too_few_frames'
  | 'too_blurry'
  | 'camera_unusable'

export type InjuryFlag =
  | 'wrist_strain_forced_pronation'
  | 'lumbar_load_posture_collapse'
  | 'shoulder_load_no_drop'

export interface Triage {
  schema: 1
  status: 'ok' | 'rejected'
  reason?: RejectReason
  quality: {
    confidence: number
    blur: number
    roll_deg: number
    yaw_deg: number
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

  // The racket hand through the swing: the fastest-moving landmark in the clip,
  // on the frames where the camera has the least light per frame to find it.
  // Nothing else degrades first.
  const lo = clamp(keys.trophy, 0, frames.length - 1)
  const hi = clamp(keys.contact + 2, 0, frames.length - 1)
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

  return {
    spatial,
    blur: blurOf(track, bodyHeight),
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
  const quality = {
    // The floor of everything that could have gone wrong with the clip, not an
    // average of it: one broken input is enough, and averaging lets three
    // healthy signals paper over the one that matters.
    confidence: round2(
      Math.min(
        resilience.spatial.confidence,
        1 - resilience.blur,
        clamp(resilience.visibility, 0, 1),
        clamp(resilience.swingSamples / 5, 0, 1),
      ),
    ),
    blur: round2(resilience.blur),
    roll_deg: resilience.spatial.roll_deg,
    yaw_deg: resilience.spatial.yaw_deg,
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
    },
    drill_id: FLAW_DRILL[f.flaw],
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
function injuriesIn(d: Diagnosis): { flag: InjuryFlag; severity: Severity }[] {
  const out: { flag: InjuryFlag; severity: Severity }[] = []
  const sig = (id: string) => d.signals[id] ?? Number.NaN
  const has = (id: string) => Number.isFinite(d.signals[id])

  // A tray grip that is nevertheless being rotated hard through the ball. The
  // forearm starts at the end of its range instead of the beginning, so the
  // rotation has to come from the wrist joint itself — which is where club
  // players pick up the wrist and elbow pain they blame on their strings.
  if (has('palm_to_sky_deg') && has('pronation_deg')) {
    if (sig('palm_to_sky_deg') >= 45 && sig('pronation_deg') >= 45) {
      out.push({
        flag: 'wrist_strain_forced_pronation',
        severity: sig('palm_to_sky_deg') >= 65 ? 'high' : 'medium',
      })
    }
  }

  // A spine folding sideways under load, a hundred times a session.
  if (has('spine_lean_deg') && sig('spine_lean_deg') >= 22) {
    out.push({
      flag: 'lumbar_load_posture_collapse',
      severity: sig('spine_lean_deg') >= 30 ? 'high' : 'medium',
    })
  }

  // Reaching for a high contact with no external rotation to get there: the
  // shoulder makes up the difference at the end of its own range.
  if (has('drop_depth_ratio') && has('contact_height_ratio')) {
    if (sig('drop_depth_ratio') <= 0.1 && sig('contact_height_ratio') >= 1.3) {
      out.push({ flag: 'shoulder_load_no_drop', severity: 'medium' })
    }
  }

  return out
}

const round2 = (v: number) => Math.round(v * 100) / 100

export { spatialVisibility }
