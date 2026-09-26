/**
 * Monotone cubic Hermite interpolation (Fritsch-Carlson). It never overshoots the key values,
 * so a key that is a local maximum (e.g. peak knee flexion) is exactly the curve's maximum.
 * Outside the key range the curve holds the end values.
 */
export class MonotoneCubic {
  private readonly ts: number[]
  private readonly vs: number[]
  private readonly ms: number[]

  constructor(keys: ReadonlyArray<readonly [number, number]>) {
    const sorted = [...keys].sort((a, b) => a[0] - b[0])
    // Merge keys closer than 1 us (keep the later one) so slopes stay finite.
    const ts: number[] = []
    const vs: number[] = []
    for (const [t, v] of sorted) {
      if (ts.length && t - ts[ts.length - 1] < 1e-6) {
        vs[vs.length - 1] = v
      } else {
        ts.push(t)
        vs.push(v)
      }
    }
    if (ts.length === 0) throw new Error('MonotoneCubic needs at least one key')
    this.ts = ts
    this.vs = vs
    this.ms = monotoneSlopes(ts, vs)
  }

  at(t: number): number {
    const { ts, vs, ms } = this
    const n = ts.length
    if (n === 1 || t <= ts[0]) return vs[0]
    if (t >= ts[n - 1]) return vs[n - 1]
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (ts[m] <= t) lo = m
      else hi = m
    }
    const h = ts[hi] - ts[lo]
    const s = (t - ts[lo]) / h
    return hermite(vs[lo], vs[hi], ms[lo] * h, ms[hi] * h, s)
  }

  get firstTime(): number {
    return this.ts[0]
  }

  get lastTime(): number {
    return this.ts[this.ts.length - 1]
  }
}

function monotoneSlopes(ts: number[], vs: number[]): number[] {
  const n = ts.length
  const ms = new Array<number>(n).fill(0)
  if (n < 2) return ms
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ts[i + 1] - ts[i]))
  ms[0] = 0
  ms[n - 1] = 0
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      ms[i] = 0
    } else {
      // Weighted harmonic mean (Fritsch-Butland) keeps monotonicity with unequal spacing.
      const h0 = ts[i] - ts[i - 1]
      const h1 = ts[i + 1] - ts[i]
      const w1 = 2 * h1 + h0
      const w2 = h1 + 2 * h0
      ms[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    }
  }
  return ms
}

/** Cubic Hermite basis on s in [0,1] with end values p0,p1 and end tangents m0,m1 (already scaled by h). */
export function hermite(p0: number, p1: number, m0: number, m1: number, s: number): number {
  const s2 = s * s
  const s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * m1
}

/** Vector-valued monotone track: one MonotoneCubic per component. */
export class VecTrack {
  private readonly comps: MonotoneCubic[]

  constructor(keys: ReadonlyArray<readonly [number, readonly number[]]>) {
    const dim = keys[0][1].length
    this.comps = []
    for (let c = 0; c < dim; c++) this.comps.push(new MonotoneCubic(keys.map(([t, v]) => [t, v[c]] as const)))
  }

  at(t: number): number[] {
    return this.comps.map((c) => c.at(t))
  }
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))

/** C1 smoothstep on [0,1]. */
export function smoothstep(x: number): number {
  const s = clamp(x, 0, 1)
  return s * s * (3 - 2 * s)
}

/** C2 smootherstep on [0,1]. */
export function smootherstep(x: number): number {
  const s = clamp(x, 0, 1)
  return s * s * s * (s * (s * 6 - 15) + 10)
}

/** Find x in [lo,hi] with f(x)=0 by bisection; f(lo) and f(hi) must bracket the root. */
export function bisect(f: (x: number) => number, lo: number, hi: number, tol = 1e-9, maxIter = 200): number {
  let flo = f(lo)
  if (flo === 0) return lo
  for (let i = 0; i < maxIter && hi - lo > tol; i++) {
    const m = 0.5 * (lo + hi)
    const fm = f(m)
    if (fm === 0) return m
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m
      flo = fm
    } else {
      hi = m
    }
  }
  return 0.5 * (lo + hi)
}
