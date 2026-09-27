import { describe, expect, it } from 'vitest'
import { beeswarm, covarianceEllipse, nearestPoint, packUnits, stepSelection } from './layout.ts'
import { extent, formatTick, linear, niceTicks, padDomain, tickStep, unionDomain } from './scale.ts'

describe('scales and ticks (DESIGN §9.1)', () => {
  it('linear maps and inverts', () => {
    const s = linear([0, 10], [100, 200])
    expect(s(5)).toBe(150)
    expect(s.invert(150)).toBe(5)
    expect(linear([3, 3], [0, 10])(3)).toBe(0)
  })

  it('never more than 4 round ticks, and they print without float noise', () => {
    for (const d of [
      [0, 1],
      [3.12, 3.61],
      [11, 19.5],
      [0.8, 1.2],
      [-37, 41],
    ] as [number, number][]) {
      const t = niceTicks(d, 4)
      expect(t.length).toBeLessThanOrEqual(4)
      expect(t.length).toBeGreaterThanOrEqual(1)
      for (const v of t) expect(v).toBeGreaterThanOrEqual(d[0] - 1e-9)
      const step = tickStep(d, 4)
      for (const v of t) expect(formatTick(v, step)).not.toMatch(/0000/)
    }
    expect(niceTicks([3.12, 3.61], 3)).toEqual([3.2, 3.4, 3.6])
    expect(formatTick(-0, 1)).toBe('0')
    expect(formatTick(3.25, 0.25)).toBe('3.25')
    expect(formatTick(3.4, 0.2)).toBe('3.4')
  })

  it('pads, unions and ignores non-finite values', () => {
    expect(padDomain([10, 20])).toEqual([9, 21])
    expect(padDomain([5, 5])).toEqual([4, 6])
    expect(extent([3, Number.NaN, 1, 2])).toEqual([1, 3])
    expect(extent([])).toBeNull()
    expect(unionDomain([1, 2], null, [0, 1.5])).toEqual([0, 2])
  })
})

describe('layout (DESIGN §9.3, §9.4, §9.6)', () => {
  it('beeswarm is deterministic and separates exact overlaps', () => {
    const xs = [100, 100, 100, 150]
    const a = beeswarm(xs)
    expect(a).toEqual(beeswarm(xs))
    expect(a[0]).toBe(0)
    expect(new Set(a.slice(0, 3)).size).toBe(3)
    expect(a[3]).toBe(0)
    for (const dy of a) expect(Math.abs(dy)).toBeLessThanOrEqual(18)
  })

  it('nearest point within a 24 px radius, else none', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]
    expect(nearestPoint(pts, 20, 2)).toBe(1)
    expect(nearestPoint(pts, 100, 100)).toBe(-1)
  })

  it('keyboard selection walks marks in x order and stops at the ends', () => {
    expect(stepSelection([2, 0, 1], null, 1)).toBe(2)
    expect(stepSelection([2, 0, 1], 2, 1)).toBe(0)
    expect(stepSelection([2, 0, 1], 1, 1)).toBe(1)
    expect(stepSelection([], null, 1)).toBeNull()
  })

  it('usual-area ellipse follows the covariance and needs 3 points', () => {
    expect(covarianceEllipse([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull()
    const pts = [-2, -1, 0, 1, 2].flatMap((x) => [{ x, y: 0.1 }, { x, y: -0.1 }])
    const e = covarianceEllipse(pts)!
    expect(e.cx).toBeCloseTo(0)
    expect(e.rx).toBeGreaterThan(e.ry)
    expect(Math.abs(e.angle) % 180).toBeCloseTo(0)
  })

  it('unit packing fills rows left to right on a 12 px grid', () => {
    const p = packUnits(5, 48)
    expect(p).toHaveLength(5)
    expect(p[0]).toEqual({ x: 6, y: 6 })
    expect(p[4].y).toBe(18)
  })
})
