/**
 * What to ask of this player, at their level, this month.
 *
 * Every threshold elsewhere in the engine is a fixed band describing a
 * well-struck serve. That is the right thing to score against and the wrong
 * thing to *aim* at: a 4.0 club player told to produce a tour racket drop is
 * being handed a target they will not reach this season, and a target nobody
 * reaches is indistinguishable from no target at all. Worse, several of these
 * are flexibility-bound — shoulder separation, external rotation — and chasing a
 * professional number on a forty-year-old shoulder is how people get hurt.
 *
 * So each signal carries a ladder of bands anchored at four rating points, and
 * the target handed back is always the band one tier above where the player
 * currently sits. A 4 is asked for a 5's separation. A 7 is asked for an 8's.
 * The ladder is anchored rather than continuous because four honest reference
 * points interpolate cleanly, and twenty invented ones would only look precise.
 *
 * Ratings here are UTR-shaped: roughly 1–3 beginner, 4–6 club, 7–9 strong
 * sectional, 10+ professional. Nothing in the engine requires the number to be a
 * real UTR — it is a position on this ladder, and `inferTier` will estimate one
 * from the serve itself when the player has not said.
 */

/** Which direction on this axis is better, which decides how a band is read. */
export type Direction = 'higher' | 'lower' | 'band'

export interface SignalSpec {
  id: string
  unit: 'deg' | 'ms' | 'ratio'
  direction: Direction
  /** Acceptable band at ratings 3, 5, 7 and 9. Interpolated in between. */
  anchors: { 3: [number, number]; 5: [number, number]; 7: [number, number]; 9: [number, number] }
  /**
   * How far outside the band counts as a serious fault rather than a near miss.
   * In the signal's own units, so severity means the same thing on an axis in
   * degrees and one in milliseconds.
   */
  seriousMiss: number
}

/**
 * The ladder.
 *
 * Deliberately gentle at the bottom and never tour-level at the top: the 9-rung
 * of every flexibility-bound signal sits at what a fit strong amateur can hold
 * without forcing a joint, not at what a professional produces. The engine's job
 * is to move somebody one rung, not to describe the best serve ever filmed.
 */
export const SIGNALS: Record<string, SignalSpec> = {
  /* --- grip and the racket face ------------------------------------------ */
  palm_to_sky_deg: {
    id: 'palm_to_sky_deg',
    unit: 'deg',
    direction: 'lower',
    // How far the palm has rotated towards facing the sky at the trophy. A
    // continental grip keeps the hand roughly edge-on; a waiter's tray turns it
    // flat under the racket. Nobody is asked for a perfect zero.
    anchors: { 3: [0, 58], 5: [0, 45], 7: [0, 32], 9: [0, 24] },
    seriousMiss: 22,
  },

  /* --- sequencing --------------------------------------------------------- */
  hip_lead_ms: {
    id: 'hip_lead_ms',
    unit: 'ms',
    direction: 'higher',
    // How long the hips fire before the shoulders. Negative means the shoulders
    // went first, which is arming the ball. The upper bound is open in practice;
    // it is capped so a mis-detection cannot read as a virtue.
    anchors: { 3: [8, 220], 5: [22, 220], 7: [36, 220], 9: [50, 220] },
    seriousMiss: 45,
  },
  separation_deg: {
    id: 'separation_deg',
    unit: 'deg',
    direction: 'higher',
    // Hip-to-shoulder coil at the trophy. A tour serve reaches the fifties; a
    // healthy club torso does not, and demanding it produces back pain rather
    // than racket-head speed.
    anchors: { 3: [8, 46], 5: [13, 48], 7: [19, 52], 9: [25, 55] },
    seriousMiss: 12,
  },

  /* --- posture ------------------------------------------------------------ */
  spine_lean_deg: {
    id: 'spine_lean_deg',
    unit: 'deg',
    direction: 'lower',
    // Sideways collapse of the spine between the trophy and contact. Some lean
    // is the shot; a lot of it is chasing a toss that went somewhere else.
    anchors: { 3: [0, 24], 5: [0, 19], 7: [0, 15], 9: [0, 12] },
    seriousMiss: 10,
  },
  toss_drift_ratio: {
    id: 'toss_drift_ratio',
    unit: 'ratio',
    direction: 'lower',
    // Sideways travel of the tossing hand on the way up, in standing heights.
    anchors: { 3: [0, 0.09], 5: [0, 0.07], 7: [0, 0.05], 9: [0, 0.038] },
    seriousMiss: 0.05,
  },

  /* --- the drop and contact ---------------------------------------------- */
  drop_depth_ratio: {
    id: 'drop_depth_ratio',
    unit: 'ratio',
    direction: 'higher',
    // Racket hand below the hitting shoulder at the bottom of the drop, in
    // standing heights.
    anchors: { 3: [0.08, 0.52], 5: [0.13, 0.52], 7: [0.18, 0.52], 9: [0.23, 0.52] },
    seriousMiss: 0.09,
  },
  elbow_lift_ratio: {
    id: 'elbow_lift_ratio',
    unit: 'ratio',
    direction: 'higher',
    // Hitting elbow relative to the shoulder line at the drop. This is what
    // separates a real external rotation from a hand dropped down the back with
    // the elbow collapsed — the shallow "back scratch" that looks like a drop.
    //
    // Every rung is below the shoulder line, which surprises people who have
    // been told to "keep the elbow up". With the hand behind the back the
    // upper arm has to abduct sideways, and geometry puts the joint a hand's
    // width under the shoulder even on a textbook drop; only the last rung asks
    // for it to be close to level.
    anchors: { 3: [-0.13, 0.3], 5: [-0.11, 0.3], 7: [-0.08, 0.3], 9: [-0.05, 0.3] },
    seriousMiss: 0.05,
  },
  pronation_deg: {
    id: 'pronation_deg',
    unit: 'deg',
    direction: 'higher',
    // How far the palm rotates through contact. A snap turns the hand over; a
    // pancake pushes the strings at the ball with no rotation at all.
    //
    // These are smaller than the anatomical range of pronation on purpose. What
    // is measured is the component about the forearm across a window of about a
    // sixth of a second around contact, from hand landmarks that are moving
    // faster here than anywhere else in the serve — so the figure is a fraction
    // of the full turn, and the bands are calibrated to what this measurement
    // actually reads rather than to what a forearm can do.
    anchors: { 3: [12, 200], 5: [20, 200], 7: [28, 200], 9: [36, 200] },
    seriousMiss: 16,
  },
  contact_height_ratio: {
    id: 'contact_height_ratio',
    unit: 'ratio',
    direction: 'higher',
    anchors: { 3: [1.16, 1.62], 5: [1.23, 1.62], 7: [1.29, 1.62], 9: [1.33, 1.62] },
    seriousMiss: 0.12,
  },
  toss_peak_ratio: {
    id: 'toss_peak_ratio',
    unit: 'ratio',
    direction: 'band',
    anchors: { 3: [1.24, 1.92], 5: [1.3, 1.86], 7: [1.36, 1.8], 9: [1.4, 1.78] },
    seriousMiss: 0.18,
  },
}

/**
 * How far each signal moves on its own, filming the same serve twice.
 *
 * The band a signal is graded against is meaningless below its own
 * repeatability, and four of these were being graded far below it. Measured on
 * an ensemble of noise realisations of one identical synthetic serve — see
 * `__tests__/depth.test.ts`, which prints the deviations these come from and
 * fails if they drift. A miss smaller than the figure here is reported as no
 * fault at all, for the same reason `MEANINGFUL_DELTA` refuses to call a
 * two-point move on the trend chart progress.
 *
 * Each is `min(1.5 × deviation, seriousMiss)`. The deviation half of that is the
 * measurement; the cap is a deliberate refusal. A floor at or above the signal's
 * own `seriousMiss` would make its flaw structurally undetectable — no value
 * could ever miss the band by enough — and quietly deleting a detector on the
 * strength of a modelled camera is not a trade worth making silently. Where the
 * cap binds, the measurement is telling us something uncomfortable and the test
 * says so out loud rather than the constant hiding it.
 *
 * The cap binds on exactly two signals today, `hip_lead_ms` and `pronation_deg`.
 * Both are recovered from rotation about the vertical axis, both moved further
 * across noise realisations of one serve than the engine's own definition of a
 * serious miss, and both therefore name their flaw at a resolution the
 * measurement does not clearly support. That is the single most important thing
 * real footage would settle.
 *
 * Two more caveats, both load-bearing:
 *
 * These are floors on *detection*, never on the injury flags. A joint being
 * loaded wrongly is read from a pair of signals against absolute limits, and
 * hedging that would be hedging the one output that is not a matter of degree.
 *
 * And they are derived from a model of camera noise rather than from footage.
 * The rig's depth error is set from published characterisations of MediaPipe's
 * world landmarks, not from clips filmed through this app, because there are no
 * such clips — `fixtures/index.ts` is empty. So these are provisional: the right
 * order of magnitude, honestly derived, and not yet confirmed against a real
 * camera. Re-derive them the moment there is footage.
 */
export const NOISE_FLOOR: Record<string, number> = {
  // Two peak-finds on a smoothed derivative, differenced. Easily the least
  // repeatable number in the engine: the peak can land a frame either side on a
  // noisy realisation, and at 50 fps that alone is 20 ms per side.
  // Capped: the deviation is 57 ms, over three frames at a phone's frame rate.
  hip_lead_ms: 45,
  // Forearm rotation between two sampled instants, from the palm normal — a
  // 3D orientation recovered from landmarks the network placed in depth, on the
  // smallest structure in the skeleton. Capped: the deviation is 20°.
  pronation_deg: 16,
  // Same normal, read on one frame near the trophy.
  palm_to_sky_deg: 10,
  // A yaw difference. Hedged already by the camera check, and still this wide.
  separation_deg: 9,
  // Lateral spine angle, differenced against the ready position — so it carries
  // the error of two frames rather than one.
  spine_lean_deg: 6,
  // The rest are read from x and y, which the camera genuinely saw, and are an
  // order of magnitude steadier for it.
  toss_drift_ratio: 0.006,
  drop_depth_ratio: 0.012,
  elbow_lift_ratio: 0.012,
  contact_height_ratio: 0.012,
  toss_peak_ratio: 0.02,
}

/**
 * The ladder in words, because nobody knows their own number.
 *
 * The ratings here are UTR-shaped, and a player who books a court twice a month
 * does not have a UTR and cannot answer a question phrased as one. These are the
 * names the level control offers and the names the report says back — one
 * vocabulary, defined once. Two of them, drifting apart, is a report that says
 * "levelled for 4.5" directly above a control whose selected option reads "club
 * level", which is one fact told twice in two languages.
 *
 * Deliberately coarse. Four names across ten rungs is as fine a distinction as
 * somebody can honestly make about their own serve, and offering ten would
 * invite a precision the ladder itself does not have — the bands are
 * interpolated between four anchors.
 */
export const RUNGS: { tier: number; name: string; blurb: string }[] = [
  { tier: 2, name: 'still learning', blurb: 'Getting it in play' },
  { tier: 4, name: 'club level', blurb: 'Reliable first serve' },
  { tier: 6, name: 'solid club', blurb: 'You can hit spin on demand' },
  { tier: 8, name: 'league or open', blurb: 'The serve wins you points' },
]

/** The name of the rung a rating sits closest to. */
export const rungName = (tier: number): string =>
  RUNGS.reduce((best, r) => (Math.abs(r.tier - tier) < Math.abs(best.tier - tier) ? r : best), RUNGS[0])
    .name

/** The rungs the ladder is actually anchored at. */
const ANCHORS = [3, 5, 7, 9] as const

/** Ratings outside this are clamped: below is beginner, above is professional. */
export const MIN_TIER = 1
export const MAX_TIER = 10

export const clampTier = (t: number) => Math.min(MAX_TIER, Math.max(MIN_TIER, t))

/**
 * The tier this player is being coached towards: exactly one above their own.
 *
 * Capped at the top of the ladder, and never more than one rung — the whole
 * point of the module. A player already at the top is held there rather than
 * handed an invented eleventh rung.
 */
export const nextTier = (current: number) => clampTier(Math.floor(clampTier(current)) + 1)

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * The acceptable band for one signal at one tier.
 *
 * Linear between the anchors and flat outside them. Flat rather than
 * extrapolated on purpose: extrapolating a flexibility band past its top anchor
 * invents a requirement no evidence supports, and past the bottom one invents a
 * standard so low it would pass a serve that is not happening.
 */
export function bandFor(signal: string, tier: number): [number, number] {
  const spec = SIGNALS[signal]
  if (!spec) return [0, 0]
  const t = clampTier(tier)
  if (t <= ANCHORS[0]) return [...spec.anchors[3]]
  if (t >= ANCHORS[ANCHORS.length - 1]) return [...spec.anchors[9]]

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const lo = ANCHORS[i]
    const hi = ANCHORS[i + 1]
    if (t >= lo && t <= hi) {
      const u = (t - lo) / (hi - lo)
      const a = spec.anchors[lo]
      const b = spec.anchors[hi]
      return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]
    }
  }
  return [...spec.anchors[9]]
}

/** The band to aim at: the one belonging to the tier above this player. */
export const targetFor = (signal: string, currentTier: number): [number, number] =>
  bandFor(signal, nextTier(currentTier))

/** Whether a measured value sits inside a band, respecting the axis direction. */
export function insideBand(signal: string, value: number, band: [number, number]): boolean {
  const spec = SIGNALS[signal]
  if (!spec) return true
  if (spec.direction === 'higher') return value >= band[0]
  if (spec.direction === 'lower') return value <= band[1]
  return value >= band[0] && value <= band[1]
}

/** How far outside the band, in the signal's own units. Zero when inside. */
export function missBy(signal: string, value: number, band: [number, number]): number {
  const spec = SIGNALS[signal]
  if (!spec) return 0
  if (spec.direction === 'higher') return Math.max(0, band[0] - value)
  if (spec.direction === 'lower') return Math.max(0, value - band[1])
  return Math.max(0, band[0] - value, value - band[1])
}

export type Severity = 'none' | 'low' | 'medium' | 'high'

/**
 * Severity as a sort key, worst first.
 *
 * Beside the type it orders, because it is part of what the type means rather
 * than a preference any one module holds. Four copies of this literal had
 * accumulated — two inside `verdict.ts` alone, plus `triage.ts` and `flaws.ts`,
 * and a fifth encoding of the same order reversed — and one of them carried a
 * comment claiming a test asserted they agreed. No such test existed. The
 * failure they were risking is the quiet one: the stored primary flaw and the
 * plan the player reads ordered by different rules, in the one direction this
 * app is built to get right, worst cause first.
 */
export const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, none: 3 }

/** Worse of two severities, by the same ranking. */
export const worseSeverity = (a: Severity, b: Severity): Severity =>
  SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b

/**
 * Severity, graded against how big a miss is serious for this signal.
 *
 * Scaled per signal rather than as a percentage of the value: eight degrees of
 * lost coil and eight thousandths of a body height are both large misses on
 * their own axes, and a single shared rule would call one of them nothing.
 */
export function severityOf(signal: string, value: number, band: [number, number]): Severity {
  const spec = SIGNALS[signal]
  const miss = missBy(signal, value, band)
  if (!spec || miss <= 0) return 'none'
  const ratio = miss / Math.max(1e-9, spec.seriousMiss)
  if (ratio >= 1) return 'high'
  if (ratio >= 0.5) return 'medium'
  return 'low'
}

/**
 * Estimate a rating from the serve itself, for a player who has not given one.
 *
 * Reads the four signals that separate levels most cleanly and least
 * ambiguously — how high the ball is struck, how deep the racket falls, how much
 * the trunk coils, and whether the sequence is in order. Deliberately
 * pessimistic: a wrong guess low hands the player a target they will clear, and
 * a wrong guess high hands them one they cannot, which is the failure this
 * module exists to prevent.
 *
 * Pessimistic, but not hostage to one number. This used to take the highest rung
 * *all four* signals sat inside, which makes the worst-measured signal the whole
 * rating. A real clip showed what that costs: a high-intermediate player filmed
 * from behind the baseline came back at the bottom rung of the ladder, because
 * `contact_height_ratio` missed the tier-1 band by 0.003 and `drop_depth_ratio`
 * missed it by 0.001 — both inside their own documented noise floors — while the
 * two depth-derived signals read near zero from a camera angle that cannot see
 * rotation. Four failures, two of them a rounding error, and the player is told
 * they are still learning.
 *
 * So each signal is asked separately how high it reaches, near misses are
 * forgiven to the same `NOISE_FLOOR` the flaw pass already uses, and the rating
 * is the median of the answers. The median keeps the pessimism where it belongs
 * — two bad signals out of four still pull it down — without letting a single
 * unmeasurable one define a player.
 */
export function inferTier(signals: Record<string, number>): number {
  const used = ['contact_height_ratio', 'drop_depth_ratio', 'separation_deg', 'hip_lead_ms'].filter(
    (s) => Number.isFinite(signals[s]),
  )
  if (!used.length) return 4

  // Capped one below the top of the ladder. An inferred rating is a guess, and a
  // guess that lands on the last rung leaves the player with a target identical
  // to where they already are — which is the one output this module must never
  // produce. A player genuinely at the ceiling can say so themselves.
  const reach = used.map((s) => {
    let best = MIN_TIER
    for (let tier = MIN_TIER; tier <= MAX_TIER - 1; tier++) {
      const band = bandFor(s, tier)
      // Forgiven to the noise floor, because a band edge is not a cliff and this
      // signal's own repeatability is written down two hundred lines above.
      const slack = NOISE_FLOOR[s] ?? 0
      const inside =
        insideBand(s, signals[s], band) ||
        (signals[s] >= band[0] - slack && signals[s] <= band[1] + slack)
      if (!inside) continue
      // For 'higher' signals the top of the band is a plausibility cap, and
      // this is where it earns its keep: a hip lead of half a second is a
      // peak-detection artifact, not sequencing mastery, and crediting a rung
      // for it is exactly the mis-detection-as-virtue the cap was written to
      // stop. Not treated as a flaw either — an implausible reading is
      // evidence of nothing.
      if (SIGNALS[s]?.direction === 'higher' && signals[s] > band[1]) continue
      best = tier
    }
    return best
  })

  // The lower median, so an even split of two good signals and two bad ones
  // settles on the cautious side rather than averaging into a rung nothing
  // actually reached.
  const sorted = [...reach].sort((a, b) => a - b)
  return clampTier(sorted[Math.max(0, Math.ceil(sorted.length / 2) - 1)])
}
