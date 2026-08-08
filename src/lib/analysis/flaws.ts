/**
 * The named breakdowns, and which measured signal proves each one.
 *
 * The measurements in `metrics.ts` describe positions: how bent, how high, how
 * fast. A player does not have "a contact height of 1.21" — they have a serve
 * they are hitting off a dropping ball because the toss is low, and the height
 * is the shadow that casts. This module names the breakdown itself, and every
 * flaw here is one a coach would call out by name from the side of the court.
 *
 * Two rules run through it. First, nothing is judged against a fixed standard:
 * the band a flaw is measured against comes from `tiers.ts` and belongs to the
 * rung above the player, so the same serve produces different targets for a
 * beginner and a strong club player. Second, a flaw that is downstream of
 * another one says so. A low contact caused by a low toss is not a contact
 * fault, and sending somebody away to reach higher off a ball that never got
 * there is the single most common way an automated analysis wastes a season.
 */
import {
  NOISE_FLOOR,
  SIGNALS,
  insideBand,
  missBy,
  nextTier,
  severityOf,
  targetFor,
  type Severity,
} from './tiers'

export type FlawId =
  | 'waiters_tray'
  | 'arming_the_ball'
  | 'early_shoulder_rotation'
  | 'posture_collapse'
  | 'toss_drift'
  | 'shallow_drop'
  | 'collapsed_elbow'
  | 'pancake_contact'
  | 'low_contact'
  | 'toss_height'

/** One breakdown, measured. Pure data — no sentence is ever built from this. */
export interface FlawFinding {
  flaw: FlawId
  detected: boolean
  signal: string
  value: number
  unit: SIGNAL_UNIT
  /** How far outside the target band, in the signal's own units. */
  miss: number
  target: [number, number]
  target_tier: number
  severity: Severity
  /** 0–1, inherited from how well the landmarks this rests on were seen. */
  confidence: number
  /** Set when this flaw is a symptom of another detected one. */
  caused_by?: FlawId
}

type SIGNAL_UNIT = 'deg' | 'ms' | 'ratio'

interface FlawSpec {
  flaw: FlawId
  signal: string
  /**
   * Which other flaw explains this one away when both fire.
   *
   * Not a general dependency graph — a chain of causes long enough to need one
   * is a chain nobody can act on. One hop, and the head of it is what the player
   * is asked to work on.
   */
  causedBy?: FlawId
}

/**
 * Every flaw the engine can name, and the signal that proves it.
 *
 * Order matters only for reading: findings are sorted by severity before they
 * leave `evaluateFlaws`.
 */
export const FLAWS: FlawSpec[] = [
  { flaw: 'waiters_tray', signal: 'palm_to_sky_deg' },
  { flaw: 'early_shoulder_rotation', signal: 'separation_deg' },
  // Arming is the timing fault. When the coil is already gone at the trophy,
  // the shoulders firing first is that same collapse showing up a moment later
  // rather than a second thing to fix.
  { flaw: 'arming_the_ball', signal: 'hip_lead_ms', causedBy: 'early_shoulder_rotation' },
  { flaw: 'toss_drift', signal: 'toss_drift_ratio' },
  // A spine that folds sideways is usually a body chasing a ball that went
  // sideways. Told on its own it reads as "stand up straighter", which is
  // advice nobody can follow while the toss keeps moving.
  { flaw: 'posture_collapse', signal: 'spine_lean_deg', causedBy: 'toss_drift' },
  { flaw: 'collapsed_elbow', signal: 'elbow_lift_ratio' },
  // The hand can be well down the back with the elbow dropped beside it, which
  // is a shallow arm, not a racket drop. When the elbow has fallen, the depth
  // is a symptom of that.
  { flaw: 'shallow_drop', signal: 'drop_depth_ratio', causedBy: 'collapsed_elbow' },
  // A palm turned under the racket physically cannot rotate through the ball:
  // the forearm is already at the end of its travel before the swing starts.
  { flaw: 'pancake_contact', signal: 'pronation_deg', causedBy: 'waiters_tray' },
  { flaw: 'toss_height', signal: 'toss_peak_ratio' },
  { flaw: 'low_contact', signal: 'contact_height_ratio', causedBy: 'toss_height' },
]

export interface SignalReading {
  value: number
  /** 0–1. Signals resting on landmarks the tracker lost are not evidence. */
  confidence: number
}

/**
 * Below this a signal is not trusted to name a flaw at all.
 *
 * A hand the tracker could barely see produces a palm normal made of noise, and
 * a noise-shaped normal points at the sky about as often as it points anywhere
 * else. Reporting a grip fault from it would be inventing one.
 */
export const MIN_EVIDENCE = 0.45

/**
 * Judge every signal against the band one tier above the player.
 *
 * Signals that are absent — no ball tracked, a hand never clearly seen — are
 * skipped rather than defaulted. A flaw the engine could not look for must not
 * come back as a flaw the engine did not find.
 */
/**
 * Facts the detector established structurally, which no signal band can see.
 */
export interface StructuralEvidence {
  /**
   * The racket never fell below where it already sat at the trophy — the drop
   * keyframe landed on the trophy rather than on an event of its own.
   */
  racketNeverFell?: boolean
}

/**
 * A serve with no fall in it is at least this bad.
 *
 * Not measured, and it says so: the depth band cannot grade something it cannot
 * see, and how much worse than "moderate" a missing drop is needs a set of real
 * serves with hand-measured drops to say. Floored rather than fixed, so a clip
 * whose depth *is* readable and worse keeps the worse answer.
 */
const NO_FALL_SEVERITY: Severity = 'medium'
const SEVERITY_ORDER: Severity[] = ['none', 'low', 'medium', 'high']
const worseOf = (a: Severity, b: Severity) =>
  SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b

export function evaluateFlaws(
  readings: Record<string, SignalReading | undefined>,
  currentTier: number,
  structural: StructuralEvidence = {},
): FlawFinding[] {
  const target_tier = nextTier(currentTier)
  const found: FlawFinding[] = []

  for (const spec of FLAWS) {
    const reading = readings[spec.signal]
    if (!reading || !Number.isFinite(reading.value)) continue
    if (reading.confidence < MIN_EVIDENCE) continue

    const target = targetFor(spec.signal, currentTier)
    const miss = missBy(spec.signal, reading.value, target)

    /*
     * Outside the band, and outside it by more than the signal can resolve.
     *
     * The second half is new and it matters more than the first. `MIN_EVIDENCE`
     * above asks whether the tracker could *see* the landmarks, which is a
     * different question from whether the number built out of them holds still —
     * and four of these signals are recovered from inferred depth, where it does
     * not. Filming one identical serve twenty-four times moved the hip lead
     * across a range wider than the entire band it is graded against, at full
     * visibility and therefore at full confidence, so "your shoulders fire
     * first" was decided by which frames the tracker had trouble with.
     *
     * A miss inside the floor is reported as no fault, not as a small one. The
     * severity goes with it: a finding that says `detected: false` and
     * `severity: 'high'` is two answers to one question, and `triage` sorts on
     * the second.
     */
    const resolvable = miss >= (NOISE_FLOOR[spec.signal] ?? 0)

    /*
     * A racket that never fell is a shallow drop, whatever the depth says.
     *
     * `drop_depth_ratio` asks how far below the shoulder the hand got at its
     * lowest, and on a serve with no drop in it that is answered by the trophy:
     * the arm is cocked, the hand already sits a little under the shoulder, and
     * the reading clears the band's floor without the racket having moved at
     * all. Two real clips came back at 0.157 and 0.104 against a floor of 0.08,
     * both scored as a sound drop, on serves whose racket provably never fell —
     * the posture series rises from the trophy to contact without a dip in it.
     *
     * The number is not wrong. It is answering a question next to the one being
     * asked: how *low* the hand was, rather than whether it ever fell. The
     * detector settles the second one structurally when it finds no drop to
     * put a keyframe on, and that fact is worth more here than the proxy.
     */
    const neverFell = spec.flaw === 'shallow_drop' && structural.racketNeverFell === true
    const detected = neverFell || (!insideBand(spec.signal, reading.value, target) && resolvable)

    found.push({
      flaw: spec.flaw,
      detected,
      signal: spec.signal,
      value: round(reading.value, spec.signal),
      unit: SIGNALS[spec.signal].unit,
      // Reported as measured either way. The floor decides whether the miss is
      // worth acting on, not whether it happened — and a consumer that wants to
      // show a near miss should be able to see one.
      miss: round(miss, spec.signal),
      target: [round(target[0], spec.signal), round(target[1], spec.signal)],
      target_tier,
      severity: neverFell
        ? worseOf(
            resolvable ? severityOf(spec.signal, reading.value, target) : 'none',
            NO_FALL_SEVERITY,
          )
        : resolvable
          ? severityOf(spec.signal, reading.value, target)
          : 'none',
      confidence: Math.round(reading.confidence * 100) / 100,
    })
  }

  /*
   * Second pass, once every flaw is known: attribute the symptoms. Done after
   * rather than during, so a cause declared later in the table still explains an
   * earlier symptom and the order of `FLAWS` stays a reading order.
   *
   * Attribution asks whether the cause is outside its band, not whether it was
   * detected — and the two stopped being the same question when the noise floors
   * arrived. A toss sitting a hair under its band misses by less than the toss
   * can be measured to, so it is correctly not *named* as a fault; it is still
   * the reason the contact underneath it is low, and dropping the link would
   * have thrown away the one piece of causal information the pass exists to
   * produce. The floor decides what the player is told to fix. It has no opinion
   * about what causes what.
   */
  const outOfBand = new Set(
    found.filter((f) => f.miss > 0).map((f) => f.flaw),
  )
  for (const f of found) {
    const cause = FLAWS.find((s) => s.flaw === f.flaw)?.causedBy
    if (f.detected && cause && outOfBand.has(cause)) f.caused_by = cause
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2, none: 3 }
  return found.sort((a, b) => {
    // Root causes ahead of their own symptoms at equal severity: fixing the
    // cause is what moves both.
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity]
    return Number(Boolean(a.caused_by)) - Number(Boolean(b.caused_by))
  })
}

/**
 * Round to the precision the signal is actually resolved to.
 *
 * Degrees and milliseconds to whole units, ratios to three places. A pose
 * estimate does not support fourteen decimal places, and printing them into the
 * output implies a precision that would survive being quoted back.
 */
function round(v: number, signal: string): number {
  const unit = SIGNALS[signal]?.unit
  if (unit === 'ratio') return Math.round(v * 1000) / 1000
  return Math.round(v)
}
