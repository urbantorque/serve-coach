/**
 * Small, dependency-free statistics used by coaching detection (COACHING §6.2). Pure functions; no
 * randomness, so decisions are deterministic. METRICS owns display statistics and verdicts
 * (`analysis/stats`); these helpers only answer the coaching questions ("is the fault on most
 * serves?", "is the true spread above the threshold?").
 */

// ---------- descriptive ----------

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Sample standard deviation (n - 1). */
export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return Number.NaN
  const m = mean(xs)
  let ss = 0
  for (const x of xs) ss += (x - m) ** 2
  return Math.sqrt(ss / (xs.length - 1))
}

/** Median absolute deviation (unscaled). */
export function mad(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN
  const m = median(xs)
  return median(xs.map((x) => Math.abs(x - m)))
}

// ---------- special functions ----------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
  const z = x - 1
  let a = LANCZOS[0]
  const t = z + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Regularised lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0
  if (x < a + 1) {
    let sum = 1 / a
    let term = sum
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break
    }
    return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - lnGamma(a)))
  }
  // Continued fraction for Q(a, x) (modified Lentz).
  let b = x + 1 - a
  let c = 1 / 1e-300
  let d = 1 / b
  let h = d
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h)
}

/** Chi-square CDF with (possibly fractional) degrees of freedom. */
export function chi2Cdf(x: number, df: number): number {
  if (x <= 0) return 0
  return gammaP(df / 2, x / 2)
}

/** Chi-square quantile: the x with chi2Cdf(x, df) = p (bisection; df may be fractional). */
export function chi2Quantile(p: number, df: number): number {
  if (p <= 0) return 0
  let hi = Math.max(1, df)
  while (chi2Cdf(hi, df) < p) hi *= 2
  let lo = 0
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (chi2Cdf(mid, df) < p) lo = mid
    else hi = mid
    if (hi - lo < 1e-10 * Math.max(1, hi)) break
  }
  return (lo + hi) / 2
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-300) d = 1e-300
  d = 1 / d
  let h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c
    if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-14) break
  }
  return h
}

/** Regularised incomplete beta I_x(a, b) = the Beta(a, b) CDF at x. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lnFront = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  const front = Math.exp(lnFront)
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b
}

/** Complementary error function (Numerical Recipes erfcc, fractional error < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x)
  const t = 1 / (1 + 0.5 * z)
  const poly =
    -1.26551223 +
    t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
  const r = t * Math.exp(-z * z + poly)
  return x >= 0 ? r : 2 - r
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2)
}

/** Standard normal quantile (Acklam, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const q = p - 0.5
  const r = q * q
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
}

/** Student t CDF. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const tail = 0.5 * betaCdf(x, df / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}

/** Student t quantile (bisection). */
export function tQuantile(p: number, df: number): number {
  let lo = -1e3
  let hi = 1e3
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

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

/** Wilson score interval (display only; decisions use Beta posteriors). */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1]
  const p = k / n
  const denom = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
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
