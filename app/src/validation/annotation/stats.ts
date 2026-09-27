/**
 * Agreement statistics for real-footage validation (METRICS §5.6 "Statistics"; research 05 §11.3):
 * Bland–Altman bias and 95% limits of agreement (with the Bland & Altman 2007 variant for repeated
 * measurements per player), proportional bias, MAE with a cluster bootstrap interval, ICC(2,1)
 * (two-way random effects, absolute agreement, single measure; McGraw & Wong 1996 case 2A) with its
 * 95% interval, interval coverage with a Wilson interval, and timing-error distributions.
 * Pure and dependency-free; the distribution functions are checked against published tables in
 * stats.test.ts.
 */

// ---------- basic summaries ----------

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
export const mean = (xs: readonly number[]): number => (xs.length ? sum(xs) / xs.length : Number.NaN)

/** Sample standard deviation (n − 1). */
export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return Number.NaN
  const m = mean(xs)
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1))
}

/** Quantile by linear interpolation between order statistics (Hyndman and Fan type 7). */
export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * q
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return s[lo] + (h - lo) * (s[hi] - s[lo])
}

export const mae = (errors: readonly number[]): number => mean(errors.map(Math.abs))
export const rmse = (errors: readonly number[]): number => Math.sqrt(mean(errors.map((e) => e * e)))

/** Wilson score interval for k of n (95% by default). */
export function wilson(k: number, n: number, z = 1.959964): { p: number; low: number; high: number } {
  if (n <= 0) return { p: Number.NaN, low: Number.NaN, high: Number.NaN }
  const p = k / n
  const z2 = z * z
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n)
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n)
  return { p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) }
}

// ---------- distributions (for t and F quantiles) ----------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
]

/** ln Γ(x) (Lanczos, g = 7). */
export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x)
  const z = x - 1
  let a = LANCZOS[0]
  const t = z + 7.5
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i)
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const TINY = 1e-300
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-15) break
  }
  return h
}

/** Regularised incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(x, a, b)) / a : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b
}

/** Student t cumulative distribution. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t)
  const tail = 0.5 * incompleteBeta(x, df / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}

/** F cumulative distribution. */
export function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0
  return incompleteBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2)
}

function invert(cdf: (x: number) => number, p: number, lo: number, hi: number): number {
  let a = lo
  let b = hi
  while (cdf(b) < p && b < 1e8) b *= 2
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2
    if (cdf(m) < p) a = m
    else b = m
    if (b - a < 1e-10 * Math.max(1, Math.abs(m))) break
  }
  return (a + b) / 2
}

export const tQuantile = (p: number, df: number): number => (p === 0.5 ? 0 : p > 0.5 ? invert((t) => tCdf(t, df), p, 0, 16) : -tQuantile(1 - p, df))
export const fQuantile = (p: number, d1: number, d2: number): number => invert((x) => fCdf(x, d1, d2), p, 0, 16)

// ---------- Bland–Altman ----------

export interface Pair {
  /** The app's value. */
  app: number
  /** The reference (annotation) value. */
  ref: number
  /** The player (cluster) the serve belongs to. */
  subject?: string
}

export interface BlandAltman {
  n: number
  subjects: number
  /** Mean of app − reference. */
  bias: number
  biasCi: [number, number]
  /** SD of the differences (total, including between-player variation when repeated). */
  sdDiff: number
  loa: [number, number]
  /** Approximate 95% intervals of the two limits (Bland & Altman 1999, n = players when repeated). */
  loaCi: { low: [number, number]; high: [number, number] }
  method: 'single' | 'repeated'
  /** Regression of the difference on the mean (proportional bias). */
  proportional: { slope: number; intercept: number; slopeCi: [number, number]; present: boolean } | null
}

function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of xs) {
    const k = key(x)
    const g = m.get(k)
    if (g) g.push(x)
    else m.set(k, [x])
  }
  return m
}

/**
 * Bland–Altman agreement. With several serves per player, uses the Bland & Altman (2007) method for
 * repeated measurements where the true value varies: the variance of a difference is the between-player
 * component plus the within-player component from a one-way analysis of variance, and the bias
 * interval uses the players' mean differences.
 */
export function blandAltman(pairs: readonly Pair[]): BlandAltman | null {
  const n = pairs.length
  if (n < 3) return null
  const d = pairs.map((p) => p.app - p.ref)
  const bias = mean(d)
  const groups = groupBy(pairs, (p) => p.subject ?? `#${pairs.indexOf(p)}`)
  const k = groups.size
  const repeated = k >= 3 && k < n
  let sdDiff: number
  let biasCi: [number, number]
  let nEff: number
  if (repeated) {
    const gs = [...groups.values()].map((g) => g.map((p) => p.app - p.ref))
    const means = gs.map(mean)
    const ssw = sum(gs.map((g, i) => sum(g.map((x) => (x - means[i]) ** 2))))
    const msw = ssw / (n - k)
    const ssb = sum(gs.map((g, i) => g.length * (means[i] - bias) ** 2))
    const msb = ssb / (k - 1)
    const divisor = (n * n - sum(gs.map((g) => g.length * g.length))) / ((k - 1) * n)
    const between = Math.max(0, (msb - msw) / divisor)
    sdDiff = Math.sqrt(between + msw)
    const se = sd(means) / Math.sqrt(k)
    const t = tQuantile(0.975, k - 1)
    biasCi = [bias - t * se, bias + t * se]
    nEff = k
  } else {
    sdDiff = sd(d)
    const t = tQuantile(0.975, n - 1)
    biasCi = [bias - (t * sdDiff) / Math.sqrt(n), bias + (t * sdDiff) / Math.sqrt(n)]
    nEff = n
  }
  const z = 1.959964
  const loa: [number, number] = [bias - z * sdDiff, bias + z * sdDiff]
  const seLoa = sdDiff * Math.sqrt(1 / nEff + (z * z) / (2 * (nEff - 1)))
  const tl = tQuantile(0.975, nEff - 1)
  const loaCi = { low: [loa[0] - tl * seLoa, loa[0] + tl * seLoa] as [number, number], high: [loa[1] - tl * seLoa, loa[1] + tl * seLoa] as [number, number] }

  // Proportional bias: difference against the mean of the two methods.
  let proportional: BlandAltman['proportional'] = null
  if (n >= 4) {
    const m = pairs.map((p) => (p.app + p.ref) / 2)
    const mBar = mean(m)
    const sxx = sum(m.map((x) => (x - mBar) ** 2))
    if (sxx > 0) {
      const slope = sum(m.map((x, i) => (x - mBar) * (d[i] - bias))) / sxx
      const intercept = bias - slope * mBar
      const resid = sum(m.map((x, i) => (d[i] - intercept - slope * x) ** 2))
      const se = Math.sqrt(resid / (n - 2) / sxx)
      const t = tQuantile(0.975, n - 2)
      const slopeCi: [number, number] = [slope - t * se, slope + t * se]
      proportional = { slope, intercept, slopeCi, present: slopeCi[0] > 0 || slopeCi[1] < 0 }
    }
  }
  return { n, subjects: repeated ? k : n, bias, biasCi, sdDiff, loa, loaCi, method: repeated ? 'repeated' : 'single', proportional }
}

// ---------- ICC(2,1) ----------

export interface Icc {
  icc: number
  ci: [number, number]
  n: number
  k: number
  msr: number
  msc: number
  mse: number
}

/**
 * ICC(2,1): two-way random effects, absolute agreement, single measure (Shrout & Fleiss ICC(2,1);
 * McGraw & Wong ICC(A,1)), with the McGraw & Wong (1996) 95% interval. `rows` are targets (serves),
 * columns are raters (the app and the annotation).
 */
export function icc21(rows: readonly (readonly number[])[]): Icc | null {
  const n = rows.length
  const k = rows[0]?.length ?? 0
  if (n < 3 || k < 2 || rows.some((r) => r.length !== k)) return null
  const all = rows.flat()
  const grand = mean(all)
  const rowMeans = rows.map((r) => mean(r))
  const colMeans = Array.from({ length: k }, (_, j) => mean(rows.map((r) => r[j])))
  const ssr = k * sum(rowMeans.map((m) => (m - grand) ** 2))
  const ssc = n * sum(colMeans.map((m) => (m - grand) ** 2))
  const sst = sum(all.map((x) => (x - grand) ** 2))
  const sse = Math.max(0, sst - ssr - ssc)
  const msr = ssr / (n - 1)
  const msc = ssc / (k - 1)
  const mse = sse / ((n - 1) * (k - 1))
  const denom = msr + (k - 1) * mse + (k * (msc - mse)) / n
  if (!(denom > 0)) return null
  const icc = (msr - mse) / denom
  // McGraw & Wong (1996), case 2A.
  let ci: [number, number] = [Number.NaN, Number.NaN]
  if (icc < 1 && icc > -1 && mse > 0) {
    const a = (k * icc) / (n * (1 - icc))
    const b = 1 + (k * icc * (n - 1)) / (n * (1 - icc))
    const v = (a * msc + b * mse) ** 2 / ((a * msc) ** 2 / (k - 1) + (b * mse) ** 2 / ((n - 1) * (k - 1)))
    const fl = fQuantile(0.975, n - 1, v)
    const fu = fQuantile(0.975, v, n - 1)
    const lower = (n * (msr - fl * mse)) / (fl * (k * msc + (k * n - k - n) * mse) + n * msr)
    const upper = (n * (fu * msr - mse)) / (k * msc + (k * n - k - n) * mse + n * fu * msr)
    ci = [lower, upper]
  } else if (icc >= 1) ci = [1, 1]
  return { icc, ci, n, k, msr, msc, mse }
}

// ---------- MAE with a cluster bootstrap ----------

/** mulberry32: small deterministic PRNG so reports are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * MAE of `errors` with a 95% percentile bootstrap interval that resamples players (clusters), since
 * serves of one player are not independent.
 */
export function maeWithCi(errors: readonly { e: number; subject?: string }[], opts: { reps?: number; seed?: number } = {}): { mae: number; ci: [number, number] } {
  const value = mae(errors.map((x) => x.e))
  if (errors.length < 3) return { mae: value, ci: [Number.NaN, Number.NaN] }
  const groups = [...groupBy(errors, (x) => x.subject ?? `#${errors.indexOf(x)}`).values()].map((g) => g.map((x) => Math.abs(x.e)))
  const next = rng(opts.seed ?? 20260927)
  const reps = opts.reps ?? 1000
  const stats: number[] = []
  for (let r = 0; r < reps; r++) {
    let s = 0
    let c = 0
    for (let i = 0; i < groups.length; i++) {
      const g = groups[Math.floor(next() * groups.length)]
      s += sum(g)
      c += g.length
    }
    stats.push(s / c)
  }
  return { mae: value, ci: [quantile(stats, 0.025), quantile(stats, 0.975)] }
}

// ---------- coverage and timing distributions ----------

/** Share of reference values inside the app's stated interval, with a Wilson interval. */
export function coverage(items: readonly { ref: number; low: number; high: number }[]): { k: number; n: number; p: number; low: number; high: number } {
  const k = items.filter((x) => x.ref >= x.low && x.ref <= x.high).length
  return { k, n: items.length, ...wilson(k, items.length) }
}

export interface TimingDistribution {
  n: number
  /** Mean signed error, frames (app − reference). */
  biasFrames: number
  maeFrames: number
  maeMs: number
  medianAbsFrames: number
  p90AbsFrames: number
  /** Shares within 0, 1 and 2 frames. */
  within: { 0: number; 1: number; 2: number }
  /** Counts of signed errors: ≤ −3, −2, −1, 0, +1, +2, ≥ +3 (rounded to whole frames). */
  histogram: number[]
}

export const HISTOGRAM_BINS = ['≤ −3', '−2', '−1', '0', '+1', '+2', '≥ +3'] as const

/** Event timing errors in frames (and each serve's ms per frame), as the protocol reports them. */
export function timingDistribution(errors: readonly { frames: number; msPerFrame: number }[]): TimingDistribution | null {
  if (!errors.length) return null
  const abs = errors.map((e) => Math.abs(e.frames))
  const hist = [0, 0, 0, 0, 0, 0, 0]
  for (const e of errors) hist[Math.min(6, Math.max(0, Math.round(e.frames) + 3))]++
  const share = (limit: number) => abs.filter((a) => a <= limit + 1e-9).length / abs.length
  return {
    n: errors.length,
    biasFrames: mean(errors.map((e) => e.frames)),
    maeFrames: mean(abs),
    maeMs: mean(errors.map((e) => Math.abs(e.frames * e.msPerFrame))),
    medianAbsFrames: quantile(abs, 0.5),
    p90AbsFrames: quantile(abs, 0.9),
    within: { 0: share(0), 1: share(1), 2: share(2) },
    histogram: hist,
  }
}
