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
import {
  ARM_FIRST_AT,
  FLAW_DRILL,
  FLAW_DRILL_BY_AXIS,
  HIERARCHY,
  INJURY_INPUTS,
  drillIdFor,
  hierarchyFor,
  injuryInputsRead,
  isFirm,
} from './faultOrder'
import { SEVERITY_RANK, bandFor, type Severity } from './tiers'
import type { Skeleton } from './phases'
import type { Frame } from './types'

// The fault order and drill tables live in `faultOrder.ts` (Q12); named here too,
// so every reader of `triage` finds them where it always did.
export { ARM_FIRST_AT, FLAW_DRILL, FLAW_DRILL_BY_AXIS, HIERARCHY, INJURY_INPUTS, drillIdFor, hierarchyFor, injuryInputsRead, isFirm }

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
    unit: 'deg' | 'ms' | 'ratio' | 'pct'
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

  const spatial = assessSpatial(frames, keys.ready, bodyHeight, skel)

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

  /*
   * The first fix stands on a reading the card would call firm (L1.2).
   *
   * `pickFocus` has always set soft measurements aside and only reached for
   * them when nothing else was left, because sending a player away to rebuild
   * something on a number the card itself marks approximate is worse than
   * saying nothing about it. The plan did not, so it could lead on exactly the
   * number the card had hedged. The same rule now, in the same order: the
   * hierarchy over the firm findings, and over the soft ones only when there
   * is no firm finding at all.
   */
  const firm = detected.filter(isFirm)
  const pool = firm.length ? firm : detected
  let primary: { finding: FlawFinding; group: string } | undefined
  for (const level of hierarchyFor(diagnosis.tier.current)) {
    const here = pool
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

/** The racket-drop band's floor — the same at every level — below which the hand never laid back. */
const NO_DROP = bandFor('drop_depth_ratio', 5)[0]

/*
 * Each flag stands on its own fault, named (L1.3).
 *
 * The flags used to read raw signals against thresholds of their own, below
 * the faults they warn about and with no noise floor, because floors are never
 * applied to flags. So "Watch your wrist" could sit above a report that never
 * named the grip, and a lean the camera could not resolve could raise the
 * lower-back card. Now a flag needs the fault it is about to be named: past its
 * noise floor and the camera allowance (`evaluateFlaws`), on a reading firm
 * enough to lead the plan (`isFirm`). Then it adds what makes it a joint
 * question rather than a technique one. The flag is still never suppressed by
 * the hierarchy, which is the point of it; it just cannot be raised on less
 * evidence than the fault itself.
 */
export function injuriesIn(d: Diagnosis): { flag: InjuryFlag; severity: Severity }[] {
  const out: { flag: InjuryFlag; severity: Severity }[] = []
  const sig = (id: string) => d.signals[id] ?? Number.NaN
  const has = (flag: InjuryFlag) => injuryInputsRead(d.signals, flag)
  const named = (flaw: FlawId) => d.flaws.some((f) => f.flaw === flaw && f.detected && isFirm(f))

  // A tray grip. At the moment the racket lies flat behind the back, a
  // waiter's serve carries higher shoulder and elbow loads and wrist forces
  // for the same ball speed, with an elbow-injury trend (Touzard 2019). The
  // forearm's turn through the ball used to be the second half of this rule;
  // it cannot be measured (`INJURY_INPUTS` above), so the card no longer
  // claims it.
  if (has('wrist_strain_forced_pronation') && named('waiters_tray')) {
    out.push({
      flag: 'wrist_strain_forced_pronation',
      severity: sig('palm_to_sky_deg') >= 65 ? 'high' : 'medium',
    })
  }

  // A trunk that tips sideways as the ball is struck. Players with low-back
  // pain carry larger lateral-flexion forces through the serve (Campbell
  // 2013), and lower-ranked servers bend sideways far more through the swing
  // than the best (about 43° against 18°, Gao 2026). From behind the baseline
  // or a corner only: from the side the lean runs along the lens (L1.2).
  if (has('lumbar_load_posture_collapse') && named('posture_collapse')) {
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
  //
  // And since L1.3, only once `shallow_drop` itself is named, past its floor.
  if (has('shoulder_load_no_drop') && named('shallow_drop')) {
    if (sig('drop_depth_ratio') < NO_DROP && sig('contact_height_ratio') >= 1.3) {
      out.push({ flag: 'shoulder_load_no_drop', severity: 'medium' })
    }
  }

  return out
}

const round2 = (v: number) => Math.round(v * 100) / 100

export { spatialVisibility }
