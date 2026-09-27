/**
 * Intervals of METRICS §4.3 (all 95% unless stated): Wilson for rates, Newcombe's hybrid score
 * interval for a difference of rates, t intervals for means, order-statistic intervals for
 * medians below n = 20 and the percentile bootstrap from n = 20, chi-square intervals for SDs.
 */
import { chiSquareQuantile, normalQuantile, tQuantile } from './distributions.ts'
import { mean, median, quantile, sd, seededRng, type Rng } from './descriptive.ts'

export const Z95 = 1.959964
export const Z80 = 1.281552

export interface RateInterval {
  k: number
  n: number
  /** Observed proportion k / n (NaN when n = 0). */
  p: number
  low: number
  high: number
  /** Wilson centre (not shown; the point estimate shown is p). */
  centre: number
}

/** Wilson score interval (METRICS §4.3). */
export function wilson(k: number, n: number, z = Z95): RateInterval {
  if (!(n > 0)) return { k, n, p: Number.NaN, low: Number.NaN, high: Number.NaN, centre: Number.NaN }
  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const centre = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return { k, n, p, low: Math.max(0, centre - half), high: Math.min(1, centre + half), centre }
}

export interface DifferenceInterval {
  /** p1 - p2. */
  delta: number
  low: number
  high: number
}

/** Newcombe's hybrid score interval (method 10) for p1 - p2. */
export function newcombe(k1: number, n1: number, k2: number, n2: number, z = Z95): DifferenceInterval {
  const a = wilson(k1, n1, z)
  const b = wilson(k2, n2, z)
  const delta = a.p - b.p
  return {
    delta,
    low: delta - Math.sqrt((a.p - a.low) ** 2 + (b.high - b.p) ** 2),
    high: delta + Math.sqrt((a.high - a.p) ** 2 + (b.p - b.low) ** 2),
  }
}

export interface CentreInterval {
  value: number
  low: number
  high: number
  /** Standard error of the centre (random part only). */
  se: number
  method: 't' | 'order-statistic' | 'bootstrap' | 'none'
  /** Nominal coverage of the random part (e.g. 0.938 for the n = 5 order-statistic pair). */
  coverage?: number
}

/**
 * Mean with a t interval: mean ± t(0.975, n-1) · SD/√n, widened in quadrature by
 * 1.96 · sharedSigma (σ_s and σ_p, §1.2) for absolute display.
 */
export function meanInterval(values: readonly number[], sharedSigma = 0, level = 0.95): CentreInterval {
  const n = values.length
  const m = mean(values)
  if (n < 2) return { value: m, low: Number.NaN, high: Number.NaN, se: Number.NaN, method: 'none' }
  const se = sd(values) / Math.sqrt(n)
  const t = tQuantile(0.5 + level / 2, n - 1)
  const z = normalQuantile(0.5 + level / 2)
  const half = Math.hypot(t * se, z * sharedSigma)
  return { value: m, low: m - half, high: m + half, se, method: 't', coverage: level }
}

/** Order-statistic pairs [x_(j), x_(n+1-j)] with coverage >= 95% (METRICS §4.3 table), 1-based j. */
export function orderStatisticRank(n: number): { j: number; coverage: number } | null {
  if (n < 5) return null
  if (n === 5) return { j: 1, coverage: 0.938 }
  if (n <= 8) return { j: 1, coverage: 1 - 2 * 0.5 ** n }
  // General rule: the largest j with coverage >= 0.95 (the table's rows follow from it).
  let best = 1
  for (let j = 1; j <= n / 2; j++) {
    if (binomialCoverage(n, j) >= 0.95) best = j
    else break
  }
  return { j: best, coverage: binomialCoverage(n, best) }
}

function binomialCoverage(n: number, j: number): number {
  // P(x_(j) <= median <= x_(n+1-j)) = 1 - 2 P(Bin(n, 1/2) <= j - 1)
  let tail = 0
  let c = 1
  for (let i = 0; i <= j - 1; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i
    tail += c
  }
  return 1 - 2 * tail * 0.5 ** n
}

export interface BootstrapOptions {
  resamples?: number
  /** Seed: METRICS §4.3 uses a hash of the session id so reruns are identical. */
  seed?: string | number
  rng?: Rng
}

/** Percentile bootstrap of a statistic over resampled values. */
export function bootstrapPercentile(
  values: readonly number[],
  statistic: (sample: number[]) => number,
  level = 0.95,
  options: BootstrapOptions = {},
): { low: number; high: number; replicates: number[] } {
  const n = values.length
  const B = options.resamples ?? 2000
  const rng = options.rng ?? seededRng(options.seed ?? 1)
  const reps: number[] = []
  const sample = new Array<number>(n)
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) sample[i] = values[Math.floor(rng() * n)]
    const s = statistic(sample)
    if (Number.isFinite(s)) reps.push(s)
  }
  const alpha = (1 - level) / 2
  return { low: quantile(reps, alpha), high: quantile(reps, 1 - alpha), replicates: reps }
}

/**
 * Median with an order-statistic interval (5 <= n < 20) or a percentile bootstrap (n >= 20),
 * each half-width combined in quadrature with 1.96 · sharedSigma. n < 5: no interval.
 */
export function medianInterval(values: readonly number[], sharedSigma = 0, options: BootstrapOptions = {}): CentreInterval {
  const n = values.length
  const m = median(values)
  if (n < 5) return { value: m, low: Number.NaN, high: Number.NaN, se: Number.NaN, method: 'none' }
  const s = [...values].sort((a, b) => a - b)
  let low: number
  let high: number
  let method: CentreInterval['method']
  let coverage: number
  if (n < 20) {
    const rank = orderStatisticRank(n)!
    low = s[rank.j - 1]
    high = s[n - rank.j]
    method = 'order-statistic'
    coverage = rank.coverage
  } else {
    const boot = bootstrapPercentile(values, median, 0.95, options)
    low = boot.low
    high = boot.high
    method = 'bootstrap'
    coverage = 0.95
  }
  const shared = Z95 * sharedSigma
  const lowHalf = Math.hypot(m - low, shared)
  const highHalf = Math.hypot(high - m, shared)
  // SE of the median from the interval width (for verdict maths).
  const se = (high - low) / (2 * Z95)
  return { value: m, low: m - lowHalf, high: m + highHalf, se, method, coverage }
}

/** Chi-square interval on an observed SD with df degrees of freedom (n - 1, or Σ(n_i - 1) pooled). */
export function sdChiSquareInterval(s: number, df: number, level = 0.95): { low: number; high: number } {
  if (!(df >= 1) || !Number.isFinite(s)) return { low: Number.NaN, high: Number.NaN }
  const alpha = (1 - level) / 2
  return {
    low: s * Math.sqrt(df / chiSquareQuantile(1 - alpha, df)),
    high: s * Math.sqrt(df / chiSquareQuantile(alpha, df)),
  }
}

/**
 * Transforms observed-SD bounds to the noise-corrected SD (METRICS §3.6):
 * [√max(L² − (1.2σ̄_r)², 0), √max(U² − (0.8σ̄_r)², 0)].
 */
export function correctSdBounds(low: number, high: number, meanSigmaR: number): { low: number; high: number } {
  return {
    low: Math.sqrt(Math.max(low * low - (1.2 * meanSigmaR) ** 2, 0)),
    high: Math.sqrt(Math.max(high * high - (0.8 * meanSigmaR) ** 2, 0)),
  }
}

/**
 * An 80% interval from a 95% one around its centre, assuming a normal shape (each side scaled by
 * z₀.₉₀ / z₀.₉₇₅). For drawing nested interval bars (DESIGN §9.7) when only the 95% interval is stored.
 */
export function ci80FromCi95(low: number, high: number, centre = (low + high) / 2): [number, number] {
  const f = Z80 / Z95
  return [centre - (centre - low) * f, centre + (high - centre) * f]
}
