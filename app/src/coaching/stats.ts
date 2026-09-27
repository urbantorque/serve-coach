/**
 * Coaching's detection statistics (COACHING §6.2): the rule helpers that answer the coaching
 * questions ("is the fault on most serves?", "is the true spread above the threshold?"). The generic
 * maths (descriptive statistics, special functions, quantiles, Wilson) is NOT duplicated here: it is
 * re-exported from `analysis/stats`, the one statistics module the engine, the UI and coaching share
 * (ARCHITECTURE: coaching imports only analysis types and stats). Pure; no randomness.
 */
import {
  betaI,
  chiSquareCdf,
  chiSquareQuantile,
  gammaP,
  lnGamma,
  mad,
  mean,
  median,
  normalCdf,
  normalQuantile,
  sd,
  tCdf,
  tQuantile,
  wilson as wilsonInterval,
} from '../analysis/stats/index.ts'

export { gammaP, lnGamma, mad, mean, median, normalCdf, normalQuantile, sd, tCdf, tQuantile }

/** Chi-square CDF (df may be fractional). */
export const chi2Cdf = (x: number, df: number): number => (x <= 0 ? 0 : chiSquareCdf(x, df))
/** Chi-square quantile (df may be fractional). */
export const chi2Quantile = (p: number, df: number): number => chiSquareQuantile(p, df)
/** Regularised incomplete beta I_x(a, b) = the Beta(a, b) CDF at x. */
export const betaCdf = (x: number, a: number, b: number): number => betaI(x, a, b)

// ---------- coaching rules (COACHING §6.2) ----------

/**
 * P(p > 0.5 | k of n), with a uniform prior: the Beta(k + 1, n - k + 1) posterior mass above 0.5.
 * "How sure we are that the fault shows on most serves" (§6.2 a).
 */
export function probMajority(k: number, n: number): number {
  if (n <= 0) return 0
  return 1 - betaCdf(0.5, k + 1, n - k + 1)
}

/** P(true rate < r | k of n) under the Beta(k + 1, n - k + 1) posterior (§6.2 d). */
export function probRateBelow(r: number, k: number, n: number): number {
  if (n <= 0) return 0
  return betaCdf(r, k + 1, n - k + 1)
}

export interface SpreadBound {
  /** Spread estimate before noise correction: SD (n >= 15) or 1.4826 x MAD (n < 15). */
  s: number
  estimator: 'sd' | 'mad'
  df: number
  /** Noise-corrected point estimate. */
  sigmaHat: number
  /** One-sided lower bound at `level` (default 90%). */
  sigmaLower: number
  /** P(true sigma > T). */
  probAbove: number
}

/**
 * Spread rule (§6.2 b): s = SD for n >= 15 else 1.4826 MAD; df = n - 1 (SD) or 0.37 (n - 1) (MAD);
 * sigmaHat = sqrt(max(0, s^2 - e^2)); sigmaL = sqrt(max(0, s^2 df / chi2_level(df) - e^2));
 * P(sigma > T) = F_chi2(df)(df s^2 / (T^2 + e^2)).
 */
export function spreadBound(values: readonly number[], e: number, threshold: number, level = 0.9): SpreadBound {
  const n = values.length
  const estimator: 'sd' | 'mad' = n >= 15 ? 'sd' : 'mad'
  const s = estimator === 'sd' ? sd(values) : 1.4826 * mad(values)
  const df = estimator === 'sd' ? n - 1 : 0.37 * (n - 1)
  return spreadBoundFromS(s, df, e, threshold, level, estimator)
}

export function spreadBoundFromS(
  s: number,
  df: number,
  e: number,
  threshold: number,
  level = 0.9,
  estimator: 'sd' | 'mad' = 'sd',
): SpreadBound {
  const sigmaHat = Math.sqrt(Math.max(0, s * s - e * e))
  const q = chi2Quantile(level, df)
  const sigmaLower = Math.sqrt(Math.max(0, (s * s * df) / q - e * e))
  const probAbove = chi2Cdf((df * s * s) / (threshold * threshold + e * e), df)
  return { s, estimator, df, sigmaHat, sigmaLower, probAbove }
}

/**
 * P(true median > edge), from the share of values at or below the edge: the Beta posterior on
 * p = F(edge) with k of n at or below, P(p < 0.5).
 */
export function probMedianAbove(values: readonly number[], edge: number): number {
  const n = values.length
  if (n === 0) return 0
  const k = values.filter((v) => v <= edge).length
  return betaCdf(0.5, k + 1, n - k + 1)
}

/** Approximate SE of a sample median (normal data): 1.2533 SD / sqrt(n). */
export function medianSe(values: readonly number[]): number {
  const n = values.length
  if (n < 2) return Number.NaN
  return (1.2533 * sd(values)) / Math.sqrt(n)
}

/** Wilson score interval as [low, high] (display only; decisions use Beta posteriors). */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1]
  const w = wilsonInterval(k, n, z)
  return [w.low, w.high]
}

/** Welch difference of means with a two-sided interval at `level` (t with Welch-Satterthwaite df). */
export function welch(a: readonly number[], b: readonly number[], level = 0.99): { diff: number; low: number; high: number; df: number } {
  const na = a.length
  const nb = b.length
  const va = sd(a) ** 2
  const vb = sd(b) ** 2
  const se2 = va / na + vb / nb
  const df = se2 ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1))
  const diff = mean(a) - mean(b)
  const t = tQuantile(1 - (1 - level) / 2, Number.isFinite(df) && df > 0 ? df : Math.max(1, na + nb - 2))
  const half = t * Math.sqrt(se2)
  return { diff, low: diff - half, high: diff + half, df }
}
