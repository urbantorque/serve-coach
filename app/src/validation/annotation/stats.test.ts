import { describe, expect, it } from 'vitest'
import { blandAltman, coverage, fQuantile, icc21, incompleteBeta, lnGamma, mae, maeWithCi, quantile, sd, tQuantile, timingDistribution, wilson } from './stats.ts'

describe('distributions', () => {
  it('lnGamma matches factorials', () => {
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 10)
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10)
  })

  it('incomplete beta: symmetric case and a known value', () => {
    expect(incompleteBeta(0.5, 3, 3)).toBeCloseTo(0.5, 10)
    // I_0.3(2, 3) = 0.3483
    expect(incompleteBeta(0.3, 2, 3)).toBeCloseTo(0.3483, 4)
  })

  it('t and F quantiles match published tables', () => {
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228, 3)
    expect(tQuantile(0.975, 1000)).toBeCloseTo(1.962, 3)
    expect(tQuantile(0.025, 5)).toBeCloseTo(-2.571, 3)
    expect(fQuantile(0.975, 5, 10)).toBeCloseTo(4.236, 3)
    expect(fQuantile(0.975, 10, 5)).toBeCloseTo(6.619, 3)
  })
})

describe('summaries', () => {
  it('quantile (type 7), sd, MAE, Wilson', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([10, 0, 5], 0.9)).toBeCloseTo(9, 10)
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
    expect(mae([-1, 2, -3])).toBe(2)
    const w = wilson(8, 10)
    expect(w.low).toBeCloseTo(0.49, 2)
    expect(w.high).toBeCloseTo(0.943, 2)
  })
})

describe('ICC(2,1)', () => {
  it('reproduces Shrout & Fleiss (1979): ICC(2,1) 0.29 with the 95% interval 0.02 to 0.76', () => {
    const data = [
      [9, 2, 5, 8],
      [6, 1, 3, 2],
      [8, 4, 6, 8],
      [7, 1, 2, 6],
      [10, 5, 6, 9],
      [6, 2, 4, 7],
    ]
    const r = icc21(data)!
    expect(r.icc).toBeCloseTo(0.29, 2)
    expect(r.ci[0]).toBeCloseTo(0.019, 2)
    expect(r.ci[1]).toBeCloseTo(0.76, 2)
  })

  it('is 1 for identical raters and low for unrelated ones', () => {
    expect(icc21([[1, 1], [2, 2], [3, 3], [4, 4]])!.icc).toBeCloseTo(1, 10)
    expect(icc21([[1, 4], [2, 1], [3, 3], [4, 2]])!.icc).toBeLessThan(0.2)
  })
})

describe('Bland–Altman', () => {
  it('single measurements: bias, limits and intervals', () => {
    const pairs = [0.5, 1.5, 1, 2, 0].map((d, i) => ({ app: 10 + i + d, ref: 10 + i }))
    const ba = blandAltman(pairs)!
    expect(ba.method).toBe('single')
    expect(ba.bias).toBeCloseTo(1, 10)
    const s = sd([0.5, 1.5, 1, 2, 0])
    expect(ba.loa[0]).toBeCloseTo(1 - 1.959964 * s, 6)
    expect(ba.loa[1]).toBeCloseTo(1 + 1.959964 * s, 6)
    expect(ba.biasCi[0]).toBeLessThan(1)
    expect(ba.biasCi[1]).toBeGreaterThan(1)
  })

  it('repeated measures: a between-player bias widens the limits beyond the within-player SD', () => {
    const pairs = []
    for (let p = 0; p < 6; p++) for (let s = 0; s < 5; s++) pairs.push({ app: 50 + (p - 2.5) * 2 + (s % 2 ? 0.2 : -0.2), ref: 50, subject: `p${p}` })
    const ba = blandAltman(pairs)!
    expect(ba.method).toBe('repeated')
    expect(ba.subjects).toBe(6)
    // Within-player differences are ±0.2; player offsets span −5 to +5.
    expect(ba.sdDiff).toBeGreaterThan(3)
    expect(ba.loa[1] - ba.loa[0]).toBeGreaterThan(12)
  })

  it('flags proportional bias', () => {
    const pairs = Array.from({ length: 20 }, (_, i) => ({ app: (10 + i) * 1.1, ref: 10 + i }))
    expect(blandAltman(pairs)!.proportional!.present).toBe(true)
    const flat = Array.from({ length: 20 }, (_, i) => ({ app: 10 + i + (i % 2 ? 0.3 : -0.3), ref: 10 + i }))
    expect(blandAltman(flat)!.proportional!.present).toBe(false)
  })
})

describe('MAE, coverage and timing', () => {
  it('MAE bootstrap interval brackets the MAE and is reproducible', () => {
    const errors = Array.from({ length: 60 }, (_, i) => ({ e: ((i * 7) % 11) - 5, subject: `p${i % 6}` }))
    const a = maeWithCi(errors)
    const b = maeWithCi(errors)
    expect(a).toEqual(b)
    expect(a.ci[0]).toBeLessThanOrEqual(a.mae)
    expect(a.ci[1]).toBeGreaterThanOrEqual(a.mae)
  })

  it('coverage counts references inside the interval', () => {
    const c = coverage([
      { ref: 1, low: 0, high: 2 },
      { ref: 3, low: 0, high: 2 },
      { ref: 2, low: 2, high: 4 },
    ])
    expect(c.k).toBe(2)
    expect(c.n).toBe(3)
  })

  it('timing distribution: shares, MAE in ms and the histogram', () => {
    const d = timingDistribution([-4, -1, 0, 0, 1, 2, 5].map((frames) => ({ frames, msPerFrame: 1000 / 60 })))!
    expect(d.n).toBe(7)
    expect(d.within[0]).toBeCloseTo(2 / 7)
    expect(d.within[1]).toBeCloseTo(4 / 7)
    expect(d.histogram).toEqual([1, 0, 1, 2, 1, 1, 1])
    expect(d.maeMs).toBeCloseTo((13 / 7) * (1000 / 60), 6)
  })
})
