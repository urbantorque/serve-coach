/**
 * Special functions and quantiles for the statistics rules in METRICS §4 (normal, Student t,
 * chi-square). Pure and deterministic; accurate to ~1e-8, which is far below display precision.
 */

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
  if (!(x > 0)) return 0
  if (x < a + 1) {
    let term = 1 / a
    let sum = term
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a))
  }
  // Continued fraction for Q (Lentz).
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
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-15) break
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h
}

/** Regularised incomplete beta I_x(a, b). */
export function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lbeta = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  const front = Math.exp(lbeta)
  const cf = (xx: number, aa: number, bb: number) => {
    let c = 1
    let d = 1 - ((aa + bb) * xx) / (aa + 1)
    if (Math.abs(d) < 1e-300) d = 1e-300
    d = 1 / d
    let h = d
    for (let m = 1; m < 500; m++) {
      const m2 = 2 * m
      let num = (m * (bb - m) * xx) / ((aa + m2 - 1) * (aa + m2))
      d = 1 + num * d
      if (Math.abs(d) < 1e-300) d = 1e-300
      c = 1 + num / c
      if (Math.abs(c) < 1e-300) c = 1e-300
      d = 1 / d
      h *= d * c
      num = (-(aa + m) * (aa + bb + m) * xx) / ((aa + m2) * (aa + m2 + 1))
      d = 1 + num * d
      if (Math.abs(d) < 1e-300) d = 1e-300
      c = 1 + num / c
      if (Math.abs(c) < 1e-300) c = 1e-300
      d = 1 / d
      const delta = d * c
      h *= delta
      if (Math.abs(delta - 1) < 1e-15) break
    }
    return h
  }
  if (x < (a + 1) / (a + b + 2)) return (front * cf(x, a, b)) / a
  return 1 - (front * cf(1 - x, b, a)) / b
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  // erfc via complementary error function approximation (W. J. Cody style, |err| < 1.2e-7) is
  // enough here, but the incomplete gamma gives full precision: Φ(z) = 0.5 (1 + sign P(1/2, z²/2)).
  const p = gammaP(0.5, (z * z) / 2)
  return z >= 0 ? 0.5 * (1 + p) : 0.5 * (1 - p)
}

/** Inverse standard normal CDF (Acklam, refined by one Halley step). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pl = 0.02425
  let x: number
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - pl) {
    const q = p - 0.5
    const r = q * q
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  const e = normalCdf(x) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}

/** Student t CDF with df degrees of freedom. */
export function tCdf(t: number, df: number): number {
  if (!(df > 0)) return Number.NaN
  const x = df / (df + t * t)
  const tail = 0.5 * betaI(x, df / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}

function bisect(f: (x: number) => number, lo: number, hi: number, target: number): number {
  let a = lo
  let b = hi
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (a + b)
    if (f(m) < target) a = m
    else b = m
    if (b - a < 1e-12 * Math.max(1, Math.abs(m))) break
  }
  return 0.5 * (a + b)
}

/** Student t quantile. */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity
  if (!(df > 0)) return Number.NaN
  if (df > 1e6) return normalQuantile(p)
  if (p === 0.5) return 0
  let hi = 10
  while (tCdf(hi, df) < Math.max(p, 1 - p)) hi *= 2
  const q = bisect((t) => tCdf(t, df), 0, hi, Math.max(p, 1 - p))
  return p >= 0.5 ? q : -q
}

/** Chi-square CDF. */
export function chiSquareCdf(x: number, df: number): number {
  return gammaP(df / 2, x / 2)
}

/** Chi-square quantile. */
export function chiSquareQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? 0 : Infinity
  let hi = Math.max(1, df)
  while (chiSquareCdf(hi, df) < p) hi *= 2
  return bisect((x) => chiSquareCdf(x, df), 0, hi, p)
}

/** Binomial CDF P(X <= k) for X ~ Bin(n, p). */
export function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0
  if (k >= n) return 1
  return 1 - betaI(p, k + 1, n - k)
}
