/**
 * Local statistics helpers for the insight screens (Today, Session report, Progress, Compare, Metric
 * info). PURE functions, no React.
 *
 * WHY THIS FILE EXISTS. ARCHITECTURE §3 puts Wilson, Newcombe, SD intervals, matched verdicts and
 * "N more serves" in `analysis/metrics/stats.ts` (engine-core). That module did not exist when these
 * screens were built, so the same maths is implemented here from METRICS §4.1 to §4.7. When the
 * engine module lands, screens should import from it and this file should shrink to re-exports.
 * Charts never call these (DESIGN §9, §13.8): screens compute, charts draw.
 */
import type { VerdictWord } from '../../../../data/domain.ts'

// ---------------------------------------------------------------------------------------------
// Constants (METRICS §4.3, §4.5)
// ---------------------------------------------------------------------------------------------

export const Z95 = 1.959964
export const Z80 = 1.281552
/** Pocock boundaries for 3 equally spaced looks: two-sided α 0.05 and α 0.20 (METRICS §4.5). */
export const POCOCK_95 = 2.29
export const POCOCK_80 = 1.65
/** 80% power (METRICS §4.5 "About N more serves", step 2). */
export const Z_POWER = 0.84
/** Beyond this, "too small to confirm by counting" (METRICS §4.5 step 4). */
export const MAX_SERVES_TO_CONFIRM = 150

// ---------------------------------------------------------------------------------------------
// Descriptive statistics
// ---------------------------------------------------------------------------------------------

export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
export const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : Number.NaN)

/** Sample SD (n − 1). NaN below 2 values. */
export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return Number.NaN
  const m = mean(xs)
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1))
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Robust SD, 1.4826 × MAD (METRICS §4.2). */
export function robustSd(xs: readonly number[]): number {
  const m = median(xs)
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)))
}

// ---------------------------------------------------------------------------------------------
// Special functions (log-gamma, regularised incomplete gamma and beta) for t and chi-square
// ---------------------------------------------------------------------------------------------

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905,
  -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
]

export function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  const x = z - 1
  let a = 0.9999999999998099
  const t = x + 7.5
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

/** Regularised lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0
  if (x < a + 1) {
    let term = 1 / a
    let total = term
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n)
      total += term
      if (Math.abs(term) < Math.abs(total) * 1e-14) break
    }
    return total * Math.exp(-x + a * Math.log(x) - logGamma(a))
  }
  // Continued fraction for Q(a, x) (modified Lentz).
  let b = x + 1 - a
  let c = 1e300
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
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-300) d = 1e-300
  d = 1 / d
  let h = d
  for (let m = 1; m < 500; m++) {
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

/** Regularised incomplete beta I_x(a, b). */
export function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(a, b, x)) / a : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b
}

/** Student t CDF. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const tail = 0.5 * betaI(df / 2, 0.5, x)
  return t >= 0 ? 1 - tail : tail
}

/** Chi-square CDF. */
export const chiSquareCdf = (x: number, df: number) => gammaP(df / 2, x / 2)

function invert(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  let a = lo
  let b = hi
  while (cdf(b) < p) b *= 2
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2
    if (cdf(m) < p) a = m
    else b = m
    if (b - a < 1e-10 * Math.max(1, Math.abs(m))) break
  }
  return (a + b) / 2
}

export const tQuantile = (p: number, df: number) => (p === 0.5 ? 0 : invert((x) => tCdf(x, df), p, -1e3, 1e3))
export const chiSquareQuantile = (p: number, df: number) => invert((x) => chiSquareCdf(x, df), p, 0, Math.max(10, df * 4))

// ---------------------------------------------------------------------------------------------
// Intervals (METRICS §4.3)
// ---------------------------------------------------------------------------------------------

export type Interval = [number, number]

/** Wilson score interval for k of n (METRICS §4.3). */
export function wilson(k: number, n: number, z = Z95): Interval {
  if (n <= 0) return [0, 1]
  const p = k / n
  const denom = 1 + (z * z) / n
  const centre = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

/**
 * Newcombe's hybrid score interval (method 10) for the change p2 − p1 (follow-up minus baseline),
 * built from the two Wilson intervals (METRICS §4.3).
 */
export function newcombe(k1: number, n1: number, k2: number, n2: number, z = Z95): Interval {
  const p1 = k1 / n1
  const p2 = k2 / n2
  const [l1, u1] = wilson(k1, n1, z)
  const [l2, u2] = wilson(k2, n2, z)
  const d = p2 - p1
  return [d - Math.sqrt((p2 - l2) ** 2 + (u1 - p1) ** 2), d + Math.sqrt((u2 - p2) ** 2 + (p1 - l1) ** 2)]
}

/** Mean ± t·SD/√n (METRICS §4.3). */
export function meanInterval(xs: readonly number[], level = 0.95): Interval {
  const n = xs.length
  if (n < 2) return [Number.NaN, Number.NaN]
  const half = tQuantile(1 - (1 - level) / 2, n - 1) * (sd(xs) / Math.sqrt(n))
  const m = mean(xs)
  return [m - half, m + half]
}

/** Chi-square interval on an observed SD (METRICS §4.3; research 06 [S31]). */
export function sdInterval(s: number, n: number, level = 0.95): Interval {
  if (n < 2 || !Number.isFinite(s)) return [Number.NaN, Number.NaN]
  const a = (1 - level) / 2
  const df = n - 1
  return [s * Math.sqrt(df / chiSquareQuantile(1 - a, df)), s * Math.sqrt(df / chiSquareQuantile(a, df))]
}

/** Order-statistic interval for a median, n 5 to 19 (METRICS §4.3 table). 1-based ranks. */
export function medianRankInterval(n: number): [number, number] | null {
  if (n < 5 || n >= 20) return null
  const j = n <= 8 ? 1 : n <= 11 ? 2 : n <= 14 ? 3 : n <= 16 ? 4 : 5
  return [j, n + 1 - j]
}

/** Narrows a 95% interval to an 80% one around its centre, assuming a symmetric normal shape. */
export function ci80From95([lo, hi]: Interval, centre = (lo + hi) / 2): Interval {
  const f = Z80 / Z95
  return [centre - (centre - lo) * f, centre + (hi - centre) * f]
}

/** Standard error implied by a symmetric 95% interval. */
export const seFrom95 = ([lo, hi]: Interval) => (hi - lo) / (2 * Z95)

// ---------------------------------------------------------------------------------------------
// Welch's t-test and Holm (METRICS §4.7)
// ---------------------------------------------------------------------------------------------

export interface WelchResult {
  diff: number
  t: number
  df: number
  /** Two-sided p. */
  p: number
}

/** Welch's t-test for mean(b) − mean(a). */
export function welch(a: readonly number[], b: readonly number[]): WelchResult {
  const va = sd(a) ** 2 / a.length
  const vb = sd(b) ** 2 / b.length
  const diff = mean(b) - mean(a)
  const se = Math.sqrt(va + vb)
  if (!(se > 0)) return { diff, t: 0, df: a.length + b.length - 2, p: 1 }
  const t = diff / se
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1))
  return { diff, t, df, p: 2 * (1 - tCdf(Math.abs(t), df)) }
}

/** Holm's step-down procedure: which hypotheses are rejected at family-wise α. */
export function holm(pValues: readonly number[], alpha = 0.05): boolean[] {
  const order = pValues.map((p, i) => ({ p, i })).sort((x, y) => x.p - y.p)
  const out = pValues.map(() => false)
  for (let r = 0; r < order.length; r++) {
    if (order[r].p <= alpha / (order.length - r)) out[order[r].i] = true
    else break
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Verdicts (METRICS §4.5, §4.6)
// ---------------------------------------------------------------------------------------------

export interface VerdictInput {
  /** Change in goodness units (positive = better). */
  delta: number
  se: number
  /** Smallest worthwhile change, same units as delta. */
  swc: number
  /** Same-session comparison (CAPTURE §5.5): never "clearly" (METRICS §4.5). */
  withinSession?: boolean
}

/** METRICS §4.5 rules in order. `not-comparable` and the measurement limit are decided by the caller. */
export function classifyVerdict({ delta, se, swc, withinSession = false }: VerdictInput): VerdictWord {
  const lo95 = delta - POCOCK_95 * se
  const hi95 = delta + POCOCK_95 * se
  const lo80 = delta - POCOCK_80 * se
  const hi80 = delta + POCOCK_80 * se
  if (!withinSession && lo95 > 0 && delta >= swc) return 'clearly-better'
  if (!withinSession && hi95 < 0 && delta <= -swc) return 'clearly-worse'
  if (lo95 > -swc && hi95 < swc) return 'no-clear-change'
  if (lo80 > 0 || lo95 > 0) return 'likely-better'
  if (hi80 < 0) return 'likely-worse'
  return 'too-early'
}

/** Rounds up to a multiple of 5 (METRICS §4.5 step 4). */
export const roundUp5 = (n: number) => Math.max(5, Math.ceil(n / 5) * 5)

/**
 * "About N more serves" for a rate (METRICS §4.5 "About N more serves", steps 1 to 4, rates path):
 * the design effect is the SWC, V = p(1 − p), follow-up over k₂ = 3 sessions with the τ_rate prior.
 * Returns the number of extra serves, or `Infinity` when counting cannot settle it (the > 150 message).
 */
export function servesToConfirmRate(opts: { p: number; nBaseline: number; nFollow: number; swc?: number; tau?: number; k1?: number; k2?: number }): number {
  const { p, nBaseline, nFollow, swc = 0.1, tau = 0.05, k1 = 1, k2 = 3 } = opts
  const v = Math.max(p * (1 - p), 0.01)
  const seStar = swc / (POCOCK_95 + Z_POWER)
  const denom = seStar ** 2 - v / Math.max(nBaseline, 1) - tau ** 2 * (1 / k1 + 1 / k2)
  if (denom > 0) {
    const n = v / denom
    return n - nFollow <= 0 ? 0 : roundUp5(n - nFollow)
  }
  const denomEq = seStar ** 2 - tau ** 2 * (2 / 3)
  if (denomEq <= 0) return Number.POSITIVE_INFINITY
  const nEq = (2 * v) / denomEq
  return nEq - Math.min(nBaseline, nFollow) <= 0 ? 0 : roundUp5(nEq - Math.min(nBaseline, nFollow))
}

export interface TrendPoint {
  /** Session estimate on the fit scale (for spreads: ln of the corrected SD). */
  value: number
  /** Within-session standard error on the same scale. */
  se: number
}

export interface TrendResult {
  /** Fitted change across the window in goodness units (positive = better). */
  change: number
  se: number
  verdict: VerdictWord
}

/**
 * Trend across matched sessions (METRICS §4.6): weighted least squares of session estimates on
 * session order with weights 1/(SE² + τ²); the fitted change across the window is classified by the
 * §4.5 rules. Needs ≥ 3 sessions; the caller shows "Building your baseline" or a comparison below that.
 */
export function trendVerdict(points: readonly TrendPoint[], opts: { tau: number; swc: number; lowerIsBetter: boolean }): TrendResult | null {
  if (points.length < 3) return null
  const w = points.map((p) => 1 / (p.se ** 2 + opts.tau ** 2))
  const xs = points.map((_, i) => i)
  const sw = sum(w)
  const xBar = sum(xs.map((x, i) => w[i] * x)) / sw
  const yBar = sum(points.map((p, i) => w[i] * p.value)) / sw
  const sxx = sum(xs.map((x, i) => w[i] * (x - xBar) ** 2))
  const slope = sum(xs.map((x, i) => w[i] * (x - xBar) * (points[i].value - yBar))) / sxx
  const slopeSe = Math.sqrt(1 / sxx)
  const span = points.length - 1
  const raw = slope * span
  const change = opts.lowerIsBetter ? -raw : raw
  const se = slopeSe * span
  return { change, se, verdict: classifyVerdict({ delta: change, se, swc: opts.swc }) }
}

/** Spread SWC is 15% relative (METRICS §4.5) and trends fit ln(SD): the SWC on the log scale. */
export const relativeSwcToLog = (rel: number) => -Math.log(1 - rel)

/** Approximate SE of ln(SD) for a sample of n (METRICS §4.3, planning form). */
export const logSdSe = (n: number) => 1 / Math.sqrt(2 * Math.max(n - 1, 1))
