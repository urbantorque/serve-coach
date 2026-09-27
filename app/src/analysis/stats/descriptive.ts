/** Descriptive statistics and a seeded RNG (reruns must be identical, METRICS §4.3). */

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

export function mean(xs: readonly number[]): number {
  return xs.length ? sum(xs) / xs.length : Number.NaN
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Sample variance (n - 1). NaN below 2 values. */
export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return Number.NaN
  const m = mean(xs)
  let ss = 0
  for (const x of xs) ss += (x - m) ** 2
  return ss / (xs.length - 1)
}

/** Sample SD (n - 1). NaN below 2 values. */
export function sd(xs: readonly number[]): number {
  return Math.sqrt(variance(xs))
}

/** Median absolute deviation (unscaled). */
export function mad(xs: readonly number[]): number {
  if (xs.length === 0) return Number.NaN
  const m = median(xs)
  return median(xs.map((x) => Math.abs(x - m)))
}

/** 1.4826 x MAD (robust SD, METRICS §4.2). */
export function robustSd(xs: readonly number[]): number {
  return 1.4826 * mad(xs)
}

/** Linear-interpolated quantile (type 7), p in [0, 1]. */
export function quantile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return Number.NaN
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * Math.min(1, Math.max(0, p))
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return s[lo] + (h - lo) * (s[hi] - s[lo])
}

/** Sample skewness (adjusted Fisher-Pearson). NaN below 3 values. */
export function skewness(xs: readonly number[]): number {
  const n = xs.length
  if (n < 3) return Number.NaN
  const m = mean(xs)
  const s = sd(xs)
  if (!(s > 0)) return 0
  let m3 = 0
  for (const x of xs) m3 += ((x - m) / s) ** 3
  return (n / ((n - 1) * (n - 2))) * m3
}

export function finite(xs: readonly (number | null | undefined)[]): number[] {
  return xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
}

// ---------- seeded randomness ----------

export type Rng = () => number

/** mulberry32: small, fast, deterministic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a 32-bit hash of a string: the bootstrap seed is a hash of the session id (METRICS §4.3). */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function seededRng(seed: string | number): Rng {
  return mulberry32(typeof seed === 'number' ? seed : hashString(seed))
}
