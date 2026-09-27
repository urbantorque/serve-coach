/**
 * Player-relative bands (METRICS §3.15, §3.27), provisional recreational bands (§4.10) with
 * hysteresis, and the trigger statistics exposed to coaching (F3, F4, F12). Every band here is
 * descriptive, versioned (`bands_v1_provisional`) and never worded as good or bad.
 */
import { median } from './descriptive.ts'
import { chiSquareQuantile, normalQuantile } from './distributions.ts'
import { bandProbabilities, pooledWithinSessionSd, type BandLabel } from './aggregate.ts'

export const BANDS_VERSION = 'bands_v1_provisional'

// ---------- player-relative bands ----------

export interface PlayerReference {
  status: 'ready' | 'building'
  /** Matched sessions that qualify (≥ 8 included serves each), newest first, at most 6 used. */
  sessions: number
  mu?: number
  /** Pooled within-session SD. */
  sPooled?: number
}

/**
 * Reference over ≥ 2 matched sessions with ≥ 8 included serves each: μ = median of session medians,
 * s = pooled within-session SD; rolling last 6 sessions. Otherwise "building" (BASELINE_BUILDING).
 */
export function playerReference(sessions: readonly (readonly number[])[], minSessions = 2, minServes = 8): PlayerReference {
  const ok = sessions.filter((s) => s.length >= minServes).slice(0, 6)
  if (ok.length < minSessions) return { status: 'building', sessions: ok.length }
  return { status: 'ready', sessions: ok.length, mu: median(ok.map((s) => median(s))), sPooled: pooledWithinSessionSd(ok).sd }
}

export interface RelativeBandOptions {
  /** Minimum "your usual" half-width for the session (5° shoulder tilt; 2% of height leg drive). */
  sessionHalfWidthMin: number
  /** Minimum per-serve half-width (8° for shoulder tilt). */
  serveHalfWidthMin?: number
  /** Hysteresis margin in the metric's unit (2° for shoulder tilt). */
  hysteresis: number
  /** Per-serve σ (6° for shoulder tilt). */
  sigmaServe?: number
}

/** Session label against the player's reference, with hysteresis on the previous label. */
export function sessionRelativeBand(
  sessionMedian: number,
  n: number,
  ref: PlayerReference,
  options: RelativeBandOptions,
  previous?: BandLabel,
): BandLabel | null {
  if (ref.status !== 'ready' || ref.mu === undefined || ref.sPooled === undefined || n < 1) return null
  const se = (1.25 * ref.sPooled) / Math.sqrt(n)
  const half = Math.max(options.sessionHalfWidthMin, 2 * se)
  const d = sessionMedian - ref.mu
  if (previous === 'low' || previous === 'high') {
    // Return to "usual" only once back inside by the hysteresis margin.
    if (Math.abs(d) <= half - options.hysteresis) return 'typical'
    return d < 0 ? 'low' : 'high'
  }
  if (Math.abs(d) <= half + (previous === 'typical' ? options.hysteresis : 0)) return 'typical'
  return d < 0 ? 'low' : 'high'
}

/** Per-serve label against the reference; 'unclear' if no band reaches probability 0.7 under σ. */
export function serveRelativeBand(value: number, ref: PlayerReference, options: RelativeBandOptions): { band: BandLabel; probabilities?: { low: number; typical: number; high: number } } | null {
  if (ref.status !== 'ready' || ref.mu === undefined || ref.sPooled === undefined) return null
  const half = Math.max(options.serveHalfWidthMin ?? options.sessionHalfWidthMin, 1.5 * ref.sPooled)
  const r = bandProbabilities(value, options.sigmaServe ?? 0, [ref.mu - half, ref.mu + half])
  return { band: r.band, probabilities: r.probabilities }
}

// ---------- provisional recreational bands (§4.10) ----------

export type Sex = 'female' | 'male' | 'unspecified'

export interface ProvisionalBand {
  metricId: string
  cuts: [number, number]
  /** ± uncertainty on each edge; relative when `relative` (±50% for spreads). */
  margin: number
  relative?: boolean
  labels: { low: string; typical: string; high: string }
}

/** Band definitions in engine units (cm, ratio, ms). Landing distance is rejected for display. */
export function provisionalBandFor(
  metricId: string,
  context: { sex?: Sex; intendedType?: 'flat' | 'slice' | 'kick' | 'unknown'; serveNumber?: 1 | 2 | 'unknown'; ageBand?: '18-39' | '40-59' | '60+'; overheadDiscomfort?: boolean } = {},
): ProvisionalBand | null {
  switch (metricId) {
    case 'toss-height-spread':
      return { metricId, cuts: [8, 20], margin: 0.5, relative: true, labels: { low: 'tight', typical: 'typical', high: 'scattered' } }
    case 'toss-forward-spread':
      return { metricId, cuts: [10, 25], margin: 0.5, relative: true, labels: { low: 'tight', typical: 'typical', high: 'scattered' } }
    case 'toss-drop': {
      const cuts: [number, number] = context.sex === 'male' ? [30, 100] : context.sex === 'female' ? [40, 125] : [30, 125]
      return { metricId, cuts, margin: 15, labels: { low: 'small drop', typical: 'typical drop', high: 'large drop' } }
    }
    case 'contact-height-ratio': {
      if (context.ageBand === '60+' || context.overheadDiscomfort) return null
      const low = context.intendedType === 'kick' || context.serveNumber === 2 ? 1.35 : 1.38
      return { metricId, cuts: [low, 1.54], margin: 0.03, labels: { low: 'lower', typical: 'typical', high: 'higher' } }
    }
    case 'rhythm-release-to-contact':
      return { metricId, cuts: [800, 1200], margin: 50, labels: { low: 'quick', typical: 'typical', high: 'unhurried' } }
    case 'rhythm-spread':
      return { metricId, cuts: [40, 90], margin: 15, labels: { low: 'tight', typical: 'typical', high: 'variable' } }
    case 'contact-forward': {
      const shift = context.intendedType === 'kick' ? -15 : 0
      return { metricId, cuts: [15 + shift, 70 + shift], margin: 0, labels: { low: 'short', typical: 'typical', high: 'long' } }
    }
    default:
      return null
  }
}

/** Band label with hysteresis: the label changes only when the estimate crosses an edge by more than the margin. */
export function applyProvisionalBand(band: ProvisionalBand, value: number, previous?: BandLabel): BandLabel {
  const m = (edge: number) => (band.relative ? edge * band.margin : band.margin)
  const plain: BandLabel = value < band.cuts[0] ? 'low' : value > band.cuts[1] ? 'high' : 'typical'
  if (!previous || previous === 'unclear' || previous === plain) return plain
  // Keep the previous label unless the value is past the edge by the margin.
  if (previous === 'typical') {
    if (plain === 'low' && value < band.cuts[0] - m(band.cuts[0])) return 'low'
    if (plain === 'high' && value > band.cuts[1] + m(band.cuts[1])) return 'high'
    return 'typical'
  }
  if (previous === 'low') return value > band.cuts[0] + m(band.cuts[0]) ? plain : 'low'
  return value < band.cuts[1] - m(band.cuts[1]) ? plain : 'high'
}

// ---------- trigger statistics (§3.5, §3.6, §3.8, §4.10) ----------

export interface SpreadTriggerInput {
  /** Observed SD (cm) and n in one stratum. */
  sdObserved: number
  n: number
  meanSigmaRandom: number
  correctedSd: number
  /** Share of the stratum's serves with a detected value (≥ 0.8 required for "likely"). */
  detectedShare: number
  /** Best (lowest) matched session corrected SD at n ≥ 20, for the player-relative rule. */
  bestMatchedSd?: number
  bestMatchedN?: number
  axis: 'height' | 'forward'
}

export interface SpreadTrigger {
  likely: boolean
  possible: boolean
  playerRelative: boolean
  /** One-sided 90% lower bound of the corrected SD. */
  lower90: number
}

/** F3: one-sided 90% lower bound of the corrected SD ≥ 15 cm (18 forward), n ≥ 12, ≥ 80% detected. */
export function f3Trigger(input: SpreadTriggerInput): SpreadTrigger {
  const df = input.n - 1
  const lowerObs = df >= 1 ? input.sdObserved * Math.sqrt(df / chiSquareQuantile(0.9, df)) : 0
  const lower90 = Math.sqrt(Math.max(lowerObs * lowerObs - (1.2 * input.meanSigmaRandom) ** 2, 0))
  const bound = input.axis === 'height' ? 15 : 18
  const scattered = input.axis === 'height' ? 20 : 25
  const likely = input.n >= 12 && input.detectedShare >= 0.8 && lower90 >= bound
  const possible = !likely && input.correctedSd > scattered
  const playerRelative =
    input.bestMatchedSd !== undefined && (input.bestMatchedN ?? 0) >= 20 && input.n >= 20 && input.correctedSd >= 1.5 * input.bestMatchedSd
  return { likely, possible, playerRelative, lower90 }
}

export interface DropTriggerInput {
  /** Session median drop (cm). */
  medianDropCm: number
  sex?: Sex
  releaseToContactMs?: number
  trophyPauseMs?: number
  /** Session median contact ratio and the player's best matched median. */
  contactRatioMedian?: number
  bestMatchedContactRatio?: number
}

/** F4: large drop plus co-signals; never on the drop alone. */
export function f4Trigger(input: DropTriggerInput): { possible: boolean; likely: boolean; coSignals: string[] } {
  const band = provisionalBandFor('toss-drop', { sex: input.sex })!
  const coSignals: string[] = []
  if ((input.releaseToContactMs ?? 0) > 1150) coSignals.push('long release to contact')
  if ((input.trophyPauseMs ?? 0) > 500) coSignals.push('long pause at the top')
  if (
    input.contactRatioMedian !== undefined &&
    input.bestMatchedContactRatio !== undefined &&
    input.contactRatioMedian < input.bestMatchedContactRatio - 0.04
  )
    coSignals.push('contact lower than your best')
  const high = input.medianDropCm > band.cuts[1]
  const likelyEdge = input.sex === 'male' ? 120 : 145
  const likely = input.medianDropCm > likelyEdge && coSignals.length >= 2
  return { possible: high && coSignals.length >= 1, likely, coSignals }
}

export interface ContactTriggerInput {
  median: number
  n: number
  /** SE of the centre (random) and √(σ_s² + σ_p²). */
  se: number
  sigmaShared: number
  intendedType?: 'flat' | 'slice' | 'kick' | 'unknown'
  serveNumber?: 1 | 2 | 'unknown'
  ageBand?: '18-39' | '40-59' | '60+'
  overheadDiscomfort?: boolean
  bestMatchedMedian?: number
}

/** F12: low contact. Absolute rule off for players 60+ or with overhead discomfort. */
export function f12Trigger(input: ContactTriggerInput): { likely: boolean; possible: boolean; playerRelative: boolean; upper90: number } {
  const z90 = normalQuantile(0.9)
  const upper90 = input.median + z90 * Math.hypot(input.se, input.sigmaShared)
  const playerRelative = input.bestMatchedMedian !== undefined && input.median <= input.bestMatchedMedian - 0.04
  const band = provisionalBandFor('contact-height-ratio', input)
  if (!band) return { likely: false, possible: false, playerRelative, upper90 }
  const below = input.median < band.cuts[0]
  const likely = below && upper90 < 1.42 && input.n >= 8
  return { likely, possible: below && !likely, playerRelative, upper90 }
}
