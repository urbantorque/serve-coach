import { describe, expect, it } from 'vitest'
import {
  chiSquareQuantile,
  ci80From95,
  classifyVerdict,
  holm,
  median,
  medianRankInterval,
  newcombe,
  relativeSwcToLog,
  sd,
  sdInterval,
  servesToConfirmRate,
  tQuantile,
  trendVerdict,
  welch,
  wilson,
} from './stats.ts'

describe('intervals (METRICS §4.3) against published examples', () => {
  it('Wilson 81 of 263 matches Newcombe (1998) 0.2553 to 0.3662', () => {
    const [lo, hi] = wilson(81, 263)
    expect(lo).toBeCloseTo(0.2553, 3)
    expect(hi).toBeCloseTo(0.3662, 3)
  })

  it('Wilson stays inside 0..1 at the edges', () => {
    expect(wilson(0, 10)[0]).toBe(0)
    expect(wilson(10, 10)[1]).toBeCloseTo(1, 12)
    expect(wilson(0, 0)).toEqual([0, 1])
  })

  it('Newcombe hybrid score interval: 56/70 v 48/80 gives 0.0524 to 0.3339', () => {
    const [lo, hi] = newcombe(48, 80, 56, 70)
    expect(lo).toBeCloseTo(0.0524, 3)
    expect(hi).toBeCloseTo(0.3339, 3)
  })

  it('t and chi-square quantiles', () => {
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228, 3)
    expect(tQuantile(0.5, 7)).toBe(0)
    expect(chiSquareQuantile(0.975, 9)).toBeCloseTo(19.023, 2)
    expect(chiSquareQuantile(0.025, 9)).toBeCloseTo(2.7, 2)
  })

  it('SD interval at n = 8 spans about 0.66x to 2.04x (METRICS §3.6)', () => {
    const [lo, hi] = sdInterval(10, 8)
    expect(lo / 10).toBeCloseTo(0.66, 2)
    expect(hi / 10).toBeCloseTo(2.04, 1)
  })

  it('order-statistic ranks follow the METRICS table', () => {
    expect(medianRankInterval(4)).toBeNull()
    expect(medianRankInterval(5)).toEqual([1, 5])
    expect(medianRankInterval(12)).toEqual([3, 10])
    expect(medianRankInterval(19)).toEqual([5, 15])
    expect(medianRankInterval(20)).toBeNull()
  })

  it('80% interval is narrower than the 95% one and keeps the centre', () => {
    const [lo, hi] = ci80From95([8, 12])
    expect(lo).toBeGreaterThan(8)
    expect(hi).toBeLessThan(12)
    expect((lo + hi) / 2).toBeCloseTo(10)
  })

  it('median and sd', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
  })
})

describe('Welch and Holm (METRICS §4.7)', () => {
  it('Welch finds a clear difference and ignores noise', () => {
    const a = [10, 11, 9, 10, 12, 11, 10, 9, 10, 11]
    const b = a.map((x) => x + 5)
    expect(welch(a, b).diff).toBeCloseTo(5)
    expect(welch(a, b).p).toBeLessThan(0.001)
    expect(welch(a, a).p).toBeCloseTo(1)
  })

  it('Holm step-down stops at the first failure', () => {
    expect(holm([0.01, 0.04, 0.03, 0.005], 0.05)).toEqual([true, false, false, true])
  })
})

describe('verdict rules (METRICS §4.5)', () => {
  it('classifies in the documented order', () => {
    expect(classifyVerdict({ delta: 10, se: 2, swc: 5 })).toBe('clearly-better')
    expect(classifyVerdict({ delta: -10, se: 2, swc: 5 })).toBe('clearly-worse')
    expect(classifyVerdict({ delta: 3, se: 1, swc: 5 })).toBe('likely-better')
    expect(classifyVerdict({ delta: 0, se: 1, swc: 5 })).toBe('no-clear-change')
    expect(classifyVerdict({ delta: 2, se: 3, swc: 5 })).toBe('too-early')
    expect(classifyVerdict({ delta: -3, se: 1.5, swc: 5 })).toBe('likely-worse')
  })

  it('never says "clearly" within one session', () => {
    expect(classifyVerdict({ delta: 10, se: 2, swc: 5, withinSession: true })).toBe('likely-better')
  })

  it('rates almost always need more than 150 serves (METRICS §4.5 worked example)', () => {
    expect(servesToConfirmRate({ p: 0.6, nBaseline: 60, nFollow: 60 })).toBe(Number.POSITIVE_INFINITY)
  })

  it('trend needs three sessions and reads a steady fall in spread as better', () => {
    const swc = relativeSwcToLog(0.15)
    expect(trendVerdict([{ value: 1, se: 0.1 }, { value: 1, se: 0.1 }], { tau: 0.15, swc, lowerIsBetter: true })).toBeNull()
    const falling = [20, 17, 14, 11, 9].map((cm) => ({ value: Math.log(cm), se: 0.1 }))
    const t = trendVerdict(falling, { tau: 0.05, swc, lowerIsBetter: true })
    expect(t?.change).toBeGreaterThan(0)
    expect(['clearly-better', 'likely-better']).toContain(t?.verdict)
    const flat = [12, 12.2, 11.9, 12.1].map((cm) => ({ value: Math.log(cm), se: 0.1 }))
    expect(['no-clear-change', 'too-early']).toContain(trendVerdict(flat, { tau: 0.15, swc, lowerIsBetter: true })?.verdict)
  })
})
