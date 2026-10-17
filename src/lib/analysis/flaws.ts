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
import type { ServeType } from '../storage/prefs'
import type { BodyAxis } from './axes'
import {
  CAMERA_ALLOWANCE,
  NOISE_FLOOR,
  SEVERITY_RANK,
  SIGNALS,
  insideBand,
  missBy,
  nextTier,
  severityOf,
  targetFor,
  worseSeverity,
  type Severity,
} from './tiers'

export type FlawId =
  | 'waiters_tray'
  | 'arming_the_ball'
  | 'no_leg_drive'
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
  /** The tray's second witness (L5.2): the arm's abduction while cocking, against its limit. */
  witness?: { abductionDeg: number; limit: number }
  /** Set when this flaw is a symptom of another detected one. */
  caused_by?: FlawId
  /**
   * Which body axis the signal underneath was read along, where that is a
   * question at all.
   *
   * Only `toss_drift_ratio` sets it today. It exists because the fault this
   * engine can measure — a tossing hand that does not repeat its line — is one
   * fault with two different sentences and two different drills under it, and
   * which one is true depends on where the phone stood rather than on the
   * player. Carried as data, so the layers that write prose can pick the true
   * sentence instead of the one that used to be hard-coded: before this, a
   * side-on clip whose drift is 99% front-to-back was headed "Your toss drifts
   * sideways" and answered with a drill that constrains the other axis.
   *
   * Absent means the question does not arise for this flaw, or the reading
   * predates the axis work. Readers fall back to axis-neutral copy.
   */
  axis?: BodyAxis
}

type SIGNAL_UNIT = 'deg' | 'ms' | 'ratio' | 'pct'

interface FlawSpec {
  flaw: FlawId
  signal: string
  /**
   * The signal the side camera reads this flaw from, without the depth
   * `signal` needs. Present only on a side-on clip, and judged on in
   * preference there: on the coil it resolves a chest a third as open as the
   * coil's own floor can (D3.6). The finding says which one it was judged on,
   * so a comparison between two serves never sets one against the other.
   */
  sideOn?: string
  /**
   * Which other flaw explains this one away when both fire.
   *
   * Not a general dependency graph — a chain of causes long enough to need one
   * is a chain nobody can act on. One hop, and the head of it is what the player
   * is asked to work on.
   */
  causedBy?: FlawId
  /**
   * Why this flaw is measured but never named, when it is not.
   *
   * The engine still reads the signal, still records how far outside its band it
   * landed, and still hands both to anything that wants the data. What it stops
   * doing is telling a player they have this fault. That is the honest shape for
   * a signal whose repeatability cannot support the distinction its band is
   * drawing — the noise floor's own logic, taken to the point where no floor
   * works — and it is a shape the codebase can carry: everything player-facing
   * filters on `detected`, so this removes the flaw from the report without
   * removing it from the type and stranding `FLAW_COPY` and `FLAW_DRILL`.
   *
   * Prefer this to deleting the entry. A deleted detector leaves nothing behind
   * that says a detector was ever tried, and the next person re-derives the same
   * bad one. The reason belongs in `UNDER_RESOLVED`; this field points at it.
   */
  notNamed?: string
}

/**
 * Every flaw the engine can name, and the signal that proves it.
 *
 * Order matters only for reading: findings are sorted by severity before they
 * leave `evaluateFlaws`.
 */
export const FLAWS: FlawSpec[] = [
  { flaw: 'waiters_tray', signal: 'palm_to_sky_deg' },
  // From a corner, the coil at the trophy; from the side, when the chest turned
  // against the racket's low point (D3.6).
  { flaw: 'early_shoulder_rotation', signal: 'separation_deg', sideOn: 'chest_open_ms' },
  // Arming is the timing fault. When the coil is already gone at the trophy,
  // the shoulders firing first is that same collapse showing up a moment later
  // rather than a second thing to fix.
  /*
   * Measured and no longer named. It graded whether the hips turned before the
   * shoulders, and the research says that order is not the fault it looks like:
   * in Fleisig 2003 the upper torso peaks before the pelvis in Olympic servers,
   * and in a 2024 IMU study of professionals (van Trigt, Front Sports Act Living
   * 6:1463299) pelvis and trunk peaks were often reversed and their timing was
   * not associated with ball speed. Its own noise floor (76 ms) was already
   * above the 45 ms it called serious — see `UNDER_RESOLVED.hip_lead_ms`. What
   * the evidence does tie to an arm-only serve is legs that do not drive, which
   * is `no_leg_drive` below. Kept, so old reports keep their findings.
   */
  {
    flaw: 'arming_the_ball',
    signal: 'hip_lead_ms',
    causedBy: 'early_shoulder_rotation',
    notNamed: 'see UNDER_RESOLVED.hip_lead_ms; segment order does not predict serve speed (van Trigt 2024)',
  },
  // The arm doing the work because the legs did not lift the body into the
  // ball. Serving with no leg drive cost about a tenth of racket speed and saved
  // the shoulder nothing (Reid, Elliott & Alderson 2008); professionals' centre
  // of mass rises 15.8 ± 3.4% of height from the lowest point to impact
  // (Deghaies 2026). Read as the hips rising from the trophy to contact.
  { flaw: 'no_leg_drive', signal: 'leg_drive_rise_ratio' },
  { flaw: 'toss_drift', signal: 'toss_drift_ratio' },
  // A spine that folds sideways is usually a body chasing a ball that did not
  // go where the last one did. Told on its own it reads as "stand up
  // straighter", which is advice nobody can follow while the toss keeps moving.
  //
  // The link used to be justified as "a body chasing a ball that went
  // sideways", and that sentence stopped being true when `toss_drift_ratio`
  // started naming its own axis: on the side-on framing this app recommends the
  // drift it measures is 99% front-to-back, so the old wording had a sideways
  // collapse caused by a wobble nothing had measured. The mechanism is the one
  // that survives either way — a toss that does not repeat its position makes
  // the trunk reach for it, and `spine_lean_deg` is a *lateral* lean because
  // that is the component the camera can see, not because the toss error was
  // lateral. What is not established is the strength of the link per axis. It
  // wants real footage; the honest state today is a plausible mechanism, named
  // as such, on a link that only ever suppresses a second instruction rather
  // than inventing one.
  { flaw: 'posture_collapse', signal: 'spine_lean_deg', causedBy: 'toss_drift' },
  { flaw: 'collapsed_elbow', signal: 'elbow_lift_ratio' },
  // The hand can be well down the back with the elbow dropped beside it, which
  // is a shallow arm, not a racket drop. When the elbow has fallen, the depth
  // is a symptom of that.
  { flaw: 'shallow_drop', signal: 'drop_depth_ratio', causedBy: 'collapsed_elbow' },
  // A palm turned under the racket physically cannot rotate through the ball:
  // the forearm is already at the end of its travel before the swing starts.
  //
  // True, and not something this engine can see. `pronation_deg` moves 20°
  // across noise realisations of one identical serve against a 16° serious
  // miss, which had this naming a pancake on a tenth of the serves that had a
  // full forearm turn in them and missing two thirds of the ones that had none.
  // Measured, kept as data, never said out loud — the full derivation and the
  // two roads that both ended here are in `UNDER_RESOLVED.pronation_deg`.
  {
    flaw: 'pancake_contact',
    signal: 'pronation_deg',
    causedBy: 'waiters_tray',
    notNamed: 'see UNDER_RESOLVED.pronation_deg',
  },
  { flaw: 'toss_height', signal: 'toss_peak_ratio' },
  { flaw: 'low_contact', signal: 'contact_height_ratio', causedBy: 'toss_height' },
]

export interface SignalReading {
  value: number
  /** 0–1. Signals resting on landmarks the tracker lost are not evidence. */
  confidence: number
  /**
   * The body axis this number is a movement along, when it is one.
   *
   * Set by `diagnose` for readings taken through `axes.ts`, and passed straight
   * through to the finding. Left off by every signal that is an angle, a
   * duration or a height, none of which have an axis to be wrong about.
   */
  axis?: BodyAxis
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
  /**
   * The racket arm's highest abduction while cocking, trophy to drop, in
   * degrees (L5.2). The waiter's tray's second witness; absent when the
   * shoulder, elbow and hip were not seen, which leaves the tray unnamed.
   */
  cockingAbductionDeg?: number
}

/**
 * A palm turned to the sky is only a waiter's tray on an arm laid over (L5.2):
 * abducted under about 70° while cocking (Touzard 2019). The six Bath serves
 * cock at 91–104°; a sound arm is nowhere near the line.
 */
export const TRAY_ABDUCTION_MAX = 70

/**
 * A serve with no fall in it is at least this bad.
 *
 * Not measured, and it says so: the depth band cannot grade something it cannot
 * see, and how much worse than "moderate" a missing drop is needs a set of real
 * serves with hand-measured drops to say. Floored rather than fixed, so a clip
 * whose depth *is* readable and worse keeps the worse answer.
 */
const NO_FALL_SEVERITY: Severity = 'medium'

/** Whether a reading can name a flaw: present, finite and seen well enough. */
const usable = (r: SignalReading | undefined) =>
  r !== undefined && Number.isFinite(r.value) && r.confidence >= MIN_EVIDENCE

/** The signal a flaw is judged on for this clip: the side camera's where it read one, its own otherwise. */
function signalFor(spec: FlawSpec, readings: Record<string, SignalReading | undefined>): string {
  return spec.sideOn && usable(readings[spec.sideOn]) ? spec.sideOn : spec.signal
}

export function evaluateFlaws(
  readings: Record<string, SignalReading | undefined>,
  currentTier: number,
  structural: StructuralEvidence = {},
  serveType: ServeType = 'flat',
): FlawFinding[] {
  const target_tier = nextTier(currentTier)
  const found: FlawFinding[] = []

  for (const spec of FLAWS) {
    const signal = signalFor(spec, readings)
    const reading = readings[signal]
    if (!reading || !Number.isFinite(reading.value)) continue
    if (reading.confidence < MIN_EVIDENCE) continue

    const target = targetFor(signal, currentTier, serveType)
    const miss = missBy(signal, reading.value, target)

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
     *
     * And outside it by more than the phone's position alone can move it
     * (`CAMERA_ALLOWANCE`). Real clips come from wherever the player could prop
     * a phone, and the same serve reads a different contact height from the
     * side than from the back fence; a fault named inside that spread would be
     * a fault in the camera.
     */
    const resolvable =
      miss >= Math.max(NOISE_FLOOR[signal] ?? 0, CAMERA_ALLOWANCE[signal] ?? 0)

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

    /*
     * The last gate, and the widest one: is this flaw named to players at all?
     *
     * `resolvable` above asks whether *this* miss is bigger than the signal's
     * noise. `notNamed` is the answer when that question has no good answer for
     * any miss — when the band the flaw is drawn against is finer than the
     * measurement across its whole range, so there is no floor that both keeps
     * the detector alive and keeps it honest. See `UNDER_RESOLVED` in tiers.ts.
     *
     * Applied to `detected` and to `severity` together, deliberately. Splitting
     * them would produce a finding reading `detected: false, severity: 'high'`,
     * which is two answers to one question and which `triage` sorts on the
     * second of.
     */
    const named = spec.notNamed === undefined

    /*
     * A second witness, where the fault needs one (L5.2). The tray's palm is
     * read from a few hand landmarks; the arm it comes with is read from the
     * shoulder, the elbow and the hip, which the tracker sees far better. Both
     * have to say tray, and an arm nobody saw says nothing.
     */
    const witnessed =
      spec.flaw !== 'waiters_tray' ||
      (structural.cockingAbductionDeg !== undefined && structural.cockingAbductionDeg < TRAY_ABDUCTION_MAX)

    const detected =
      named && witnessed && (neverFell || (!insideBand(signal, reading.value, target) && resolvable))

    const graded: Severity = !witnessed
      ? 'none'
      : neverFell
      ? worseSeverity(
          resolvable ? severityOf(signal, reading.value, target) : 'none',
          NO_FALL_SEVERITY,
        )
      : resolvable
        ? severityOf(signal, reading.value, target)
        : 'none'

    found.push({
      flaw: spec.flaw,
      detected,
      signal,
      value: round(reading.value, signal),
      unit: SIGNALS[signal].unit,
      // Reported as measured either way. The floor decides whether the miss is
      // worth acting on, not whether it happened — and a consumer that wants to
      // show a near miss should be able to see one.
      miss: round(miss, signal),
      target: [round(target[0], signal), round(target[1], signal)],
      target_tier,
      severity: named ? graded : 'none',
      confidence: Math.round(reading.confidence * 100) / 100,
      // Carried through untouched. This layer has no opinion about which axis a
      // reading was taken along; it only has to stop the fact getting lost
      // between the pass that measured it and the pass that writes the sentence.
      ...(reading.axis ? { axis: reading.axis } : {}),
      // The second witness, as read, so a finding says why it was or was not named.
      ...(spec.flaw === 'waiters_tray' && structural.cockingAbductionDeg !== undefined
        ? { witness: { abductionDeg: Math.round(structural.cockingAbductionDeg), limit: TRAY_ABDUCTION_MAX } }
        : {}),
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

  return found.sort((a, b) => {
    // Root causes ahead of their own symptoms at equal severity: fixing the
    // cause is what moves both.
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
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
  if (unit === 'ratio' || unit === 'pct') return Math.round(v * 1000) / 1000
  return Math.round(v)
}
