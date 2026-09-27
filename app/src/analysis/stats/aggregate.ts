/**
 * Session aggregation rules of METRICS §4.1–§4.3 and §3.6: centres (mean or median) with their
 * intervals, noise-corrected spreads with censoring, Wilson rates, modal bands, minimum n and
 * the provisional ("early read") label. Pure and deterministic (seeded bootstrap).
 */
import { finite, mean, median, robustSd, sd, skewness, type Rng } from './descriptive.ts'
import { normalCdf } from './distributions.ts'
import {
  bootstrapPercentile,
  correctSdBounds,
  meanInterval,
  medianInterval,
  sdChiSquareInterval,
  wilson,
  type CentreInterval,
} from './intervals.ts'

/** METRICS §4.1 (metrics.json `minN`). */
export const MIN_N = {
  centre: { hide: 5, provisionalBelow: 12 },
  spread: { hide: 8, provisionalBelow: 20, headlineFrom: 12 },
  rate: { percentFrom: 10, provisionalBelow: 30 },
  band: { sessionBandFrom: 5, provisionalBelow: 12 },
  playerRelativeReference: { sessions: 2, servesPerSession: 8 },
  trend: { sessions: 3, servesPerSession: 8, servesPerSessionSpreads: 12 },
  didItWork: { centrePerSide: 8, spreadPerSide: 12, ratePerSide: 10 },
  outcomeContrast: { perGroup: 10 },
} as const

/** One included per-serve value, in the metric's canonical unit. */
export interface ServeValue {
  serveId?: string
  value: number
  /** σ_r: random measurement noise (the only term subtracted from spreads). */
  sigmaRandom?: number
  /** σ_leak: reported, never subtracted. */
  sigmaLeak?: number
  /** √(σ_s² + σ_p²): session-shared and player-persistent. */
  sigmaShared?: number
  confidence?: number
}

// ---------- outlier rule (§4.2) ----------

/**
 * After the plausibility bounds, a value is dropped as a statistical outlier only when it is more
 * than 3.5 robust SD (1.4826·MAD) from the median AND its confidence is below 0.6. Real wild tosses
 * are kept: inconsistency is the signal.
 */
export function dropStatisticalOutliers<T extends ServeValue>(values: readonly T[]): { kept: T[]; dropped: T[]; robustSd: number } {
  const xs = values.map((v) => v.value)
  const rsd = robustSd(xs)
  const m = median(xs)
  if (!(rsd > 0) || values.length < 5) return { kept: [...values], dropped: [], robustSd: rsd }
  const kept: T[] = []
  const dropped: T[] = []
  for (const v of values) {
    if (Math.abs(v.value - m) > 3.5 * rsd && (v.confidence ?? 1) < 0.6) dropped.push(v)
    else kept.push(v)
  }
  return { kept, dropped, robustSd: rsd }
}

// ---------- centres ----------

export interface CentreSummary {
  kind: 'mean' | 'median'
  n: number
  nTotal: number
  /** Null below the §4.1 minimum (n < 5): show the dots only. */
  value: number | null
  /** Interval of the centre including σ_s and σ_p (absolute display, §1.2). */
  ci95: [number, number] | null
  /** Interval of the random part only (verdicts use this with their own shared terms). */
  ciRandom95: [number, number] | null
  /** Standard error of the centre (random part). */
  se: number | null
  method: CentreInterval['method']
  coverage?: number
  provisional: boolean
  hidden: boolean
  robustSd: number
}

export interface CentreOptions {
  /** Total serves detected in the stratum ("X of N serves measured"). */
  nTotal?: number
  /** Seed for the bootstrap (a hash of the session id, §4.3). */
  seed?: string | number
}

/**
 * Centre of a continuous metric: mean with a t interval, or median with an order-statistic interval
 * (n < 20) or a percentile bootstrap (n ≥ 20). Shared error (median σ_shared of the values) widens
 * the absolute interval in quadrature. n < 5 → hidden; 5–11 → provisional.
 */
export function summariseCentre(values: readonly ServeValue[], kind: 'mean' | 'median', options: CentreOptions = {}): CentreSummary {
  const xs = finite(values.map((v) => v.value))
  const n = xs.length
  const nTotal = options.nTotal ?? values.length
  const shared = median(finite(values.map((v) => v.sigmaShared ?? 0))) || 0
  const hidden = n < MIN_N.centre.hide
  const base: CentreSummary = {
    kind,
    n,
    nTotal,
    value: hidden ? null : kind === 'mean' ? mean(xs) : median(xs),
    ci95: null,
    ciRandom95: null,
    se: null,
    method: 'none',
    provisional: n < MIN_N.centre.provisionalBelow,
    hidden,
    robustSd: robustSd(xs),
  }
  if (hidden) return base
  const random = kind === 'mean' ? meanInterval(xs, 0) : medianInterval(xs, 0, { seed: options.seed })
  const absolute = kind === 'mean' ? meanInterval(xs, shared) : medianInterval(xs, shared, { seed: options.seed })
  return {
    ...base,
    ci95: Number.isFinite(absolute.low) ? [absolute.low, absolute.high] : null,
    ciRandom95: Number.isFinite(random.low) ? [random.low, random.high] : null,
    se: Number.isFinite(random.se) ? random.se : null,
    method: absolute.method,
    coverage: absolute.coverage,
  }
}

/**
 * Median that treats right-censored values (apexes above the frame, not fitted) as larger than
 * every uncensored value (§3.6). Returns NaN when more than half are censored.
 */
export function censoredMedian(uncensored: readonly number[], nCensored: number): number {
  const n = uncensored.length + nCensored
  if (n === 0) return Number.NaN
  if (nCensored / n > 0.5) return Number.NaN
  const s = [...uncensored].sort((a, b) => a - b)
  const at = (i: number) => (i < s.length ? s[i] : Number.POSITIVE_INFINITY)
  if (n % 2) return at((n - 1) / 2)
  const hi = at(n / 2)
  return Number.isFinite(hi) ? (at(n / 2 - 1) + hi) / 2 : at(n / 2 - 1)
}

// ---------- spreads ----------

export interface SpreadSummary {
  n: number
  nTotal: number
  nCensored: number
  /** Observed sample SD. */
  sdObserved: number | null
  /** Noise-corrected SD √max(SD_obs² − mean(σ_r²), 0). Null when hidden. */
  value: number | null
  /** Corrected chi-square (or bootstrap when |skew| > 1) interval. */
  ci95: [number, number] | null
  ciMethod: 'chi-square' | 'bootstrap' | 'none'
  meanSigmaRandom: number
  /** mean(σ_r) ≥ 0.7·SD_obs: display "≤ SD_obs". */
  nearMeasurementLimit: boolean
  /** > 10% censored: "at least X". */
  isLowerBound: boolean
  provisional: boolean
  hidden: boolean
  /** A provisional spread with n ≥ 12 may headline (§4.1). */
  mayHeadline: boolean
}

export interface SpreadOptions {
  nTotal?: number
  /** Right-censored values (apexes above the frame, not fitted) in the stratum. */
  nCensored?: number
  seed?: string | number
  /** Minimum n to show (default 8). */
  minN?: number
}

/**
 * Noise-corrected spread (METRICS §3.6, §4.2): SD of the included values minus the mean random
 * variance; chi-square interval on the observed SD transformed with ±20% on σ_r; bootstrap instead
 * when |skewness| > 1. Hidden below n = 8; provisional below 20; "at least" above 10% censored.
 */
export function summariseSpread(values: readonly ServeValue[], options: SpreadOptions = {}): SpreadSummary {
  const rows = values.filter((v) => Number.isFinite(v.value))
  const xs = rows.map((v) => v.value)
  const n = xs.length
  const nCensored = options.nCensored ?? 0
  const nTotal = options.nTotal ?? values.length
  const minN = options.minN ?? MIN_N.spread.hide
  const sigmaR2 = rows.map((v) => (v.sigmaRandom ?? 0) ** 2)
  const meanSigmaR2 = sigmaR2.length ? mean(sigmaR2) : 0
  const meanSigmaR = Math.sqrt(meanSigmaR2)
  const hidden = n < minN
  const sObs = n >= 2 ? sd(xs) : Number.NaN
  const censoredShare = n + nCensored > 0 ? nCensored / (n + nCensored) : 0
  const summary: SpreadSummary = {
    n,
    nTotal,
    nCensored,
    sdObserved: Number.isFinite(sObs) ? sObs : null,
    value: null,
    ci95: null,
    ciMethod: 'none',
    meanSigmaRandom: meanSigmaR,
    nearMeasurementLimit: Number.isFinite(sObs) ? rows.reduce((a, v) => a + (v.sigmaRandom ?? 0), 0) / Math.max(1, n) >= 0.7 * sObs : false,
    isLowerBound: censoredShare > 0.1,
    provisional: n < MIN_N.spread.provisionalBelow,
    hidden,
    mayHeadline: !hidden && n >= MIN_N.spread.headlineFrom,
  }
  if (hidden || !Number.isFinite(sObs)) return summary
  const corrected = Math.sqrt(Math.max(sObs * sObs - meanSigmaR2, 0))
  let low: number
  let high: number
  let ciMethod: SpreadSummary['ciMethod']
  if (Math.abs(skewness(xs)) > 1) {
    const boot = bootstrapPercentile(xs, (s) => sd(s), 0.95, { seed: options.seed })
    low = boot.low
    high = boot.high
    ciMethod = 'bootstrap'
  } else {
    const chi = sdChiSquareInterval(sObs, n - 1)
    low = chi.low
    high = chi.high
    ciMethod = 'chi-square'
  }
  const c = correctSdBounds(low, high, meanSigmaR)
  return { ...summary, value: corrected, ci95: [c.low, c.high], ciMethod }
}

/**
 * Pooled within-session SD for multi-session baselines (§4.2): s² = Σ(n_i − 1)s_i² / Σ(n_i − 1),
 * never the SD of all serves pooled (that would add between-session mean shifts).
 */
export function pooledWithinSessionSd(sessions: readonly (readonly number[])[]): { sd: number; df: number } {
  let ss = 0
  let df = 0
  for (const xs of sessions) {
    if (xs.length < 2) continue
    const s = sd(xs)
    ss += (xs.length - 1) * s * s
    df += xs.length - 1
  }
  return { sd: df > 0 ? Math.sqrt(ss / df) : Number.NaN, df }
}

// ---------- rates ----------

export interface RateSummary {
  k: number
  n: number
  p: number | null
  ci95: [number, number] | null
  /** n ≥ 10: show % and the Wilson band; below: "7 of 9", no %. */
  showPercent: boolean
  provisional: boolean
}

export function summariseRate(k: number, n: number): RateSummary {
  if (!(n > 0)) return { k, n, p: null, ci95: null, showPercent: false, provisional: true }
  const w = wilson(k, n)
  const showPercent = n >= MIN_N.rate.percentFrom
  return {
    k,
    n,
    p: w.p,
    ci95: showPercent ? [w.low, w.high] : null,
    showPercent,
    provisional: n < MIN_N.rate.provisionalBelow,
  }
}

// ---------- bands ----------

export type BandLabel = 'low' | 'typical' | 'high' | 'unclear'

export interface BandSummary {
  n: number
  mode: BandLabel | null
  shares: Record<BandLabel, number>
  counts: Record<BandLabel, number>
  provisional: boolean
  hidden: boolean
}

/** Modal band with shares (§3.14). "unclear" wins when more than half of the serves are unclear. */
export function summariseBands(bands: readonly BandLabel[]): BandSummary {
  const counts: Record<BandLabel, number> = { low: 0, typical: 0, high: 0, unclear: 0 }
  for (const b of bands) counts[b]++
  const n = bands.length
  const shares = Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, n ? c / n : 0])) as Record<BandLabel, number>
  const hidden = n < MIN_N.band.sessionBandFrom
  let mode: BandLabel | null = null
  if (!hidden) {
    if (counts.unclear / n > 0.5) mode = 'unclear'
    else {
      const clear: BandLabel[] = ['low', 'typical', 'high']
      mode = clear.reduce((best, b) => (counts[b] > counts[best] ? b : best), 'typical' as BandLabel)
    }
  }
  return { n, mode, shares, counts, provisional: n < MIN_N.band.provisionalBelow, hidden }
}

// ---------- probability helpers for bands ----------

/** Standard normal CDF (full precision, via the regularised incomplete gamma). */
export function phi(z: number): number {
  if (z < -12) return 0
  if (z > 12) return 1
  return normalCdf(z)
}

/**
 * Band probabilities of a normally distributed value against two cut points (low | typical | high).
 * The argmax band is reported only when its probability is at least `minProb` (0.7), else 'unclear'.
 */
export function bandProbabilities(
  value: number,
  sigma: number,
  cuts: readonly [number, number],
  minProb = 0.7,
): { band: BandLabel; probabilities: { low: number; typical: number; high: number } } {
  const s = Math.max(sigma, 1e-9)
  const pLow = phi((cuts[0] - value) / s)
  const pHigh = 1 - phi((cuts[1] - value) / s)
  const pTyp = Math.max(0, 1 - pLow - pHigh)
  const probabilities = { low: pLow, typical: pTyp, high: pHigh }
  const [best, p] = (Object.entries(probabilities) as [BandLabel, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))
  return { band: p >= minProb ? best : 'unclear', probabilities }
}

// ---------- misc ----------

/** Theil–Sen slope (median of pairwise slopes) of y on x. */
export function theilSen(x: readonly number[], y: readonly number[]): number {
  const slopes: number[] = []
  for (let i = 0; i < x.length; i++) {
    for (let j = i + 1; j < x.length; j++) {
      const dx = x[j] - x[i]
      if (dx !== 0) slopes.push((y[j] - y[i]) / dx)
    }
  }
  return median(slopes)
}

/** Resample indices with replacement. */
export function resampleIndices(n: number, rng: Rng): number[] {
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = Math.floor(rng() * n)
  return out
}

