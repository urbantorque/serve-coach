import { describe, expect, it } from 'vitest'
import {
  evalPoly,
  evalPolyDerivative,
  fitLine,
  fitPolynomial,
  invertMatrix,
  median,
  percentile,
  robustFitPolynomial,
  solveLinearSystem,
  toAbsoluteQuadratic,
  weightedLeastSquares,
} from './fit.ts'
import { createRng, gaussian } from './random.ts'

describe('linear algebra helpers', () => {
  it('solves a small system with pivoting and inverts a matrix', () => {
    const A = [
      [0, 2, 1],
      [1, 1, 1],
      [2, 1, 0],
    ]
    const x = solveLinearSystem(A, [7, 6, 4]) as number[]
    expect(x[0]).toBeCloseTo(1)
    expect(x[1]).toBeCloseTo(2)
    expect(x[2]).toBeCloseTo(3)
    const inv = invertMatrix(A) as number[][]
    const product = A.map((row) => inv[0].map((_, c) => row.reduce((s, v, k) => s + v * inv[k][c], 0)))
    product.forEach((row, r) => row.forEach((v, c) => expect(v).toBeCloseTo(r === c ? 1 : 0)))
    expect(solveLinearSystem([[1, 2], [2, 4]], [1, 2])).toBeNull()
  })

  it('weighted least squares ignores zero-weight rows', () => {
    const rows = [[1, 0], [1, 1], [1, 2], [1, 3]]
    const result = weightedLeastSquares(rows, [1, 3, 5, 100], [1, 1, 1, 0])
    expect(result?.beta[0]).toBeCloseTo(1)
    expect(result?.beta[1]).toBeCloseTo(2)
  })
})

describe('polynomial fits', () => {
  it('recovers an exact quadratic in absolute time far from zero', () => {
    const ts = Array.from({ length: 20 }, (_, i) => 100 + i / 30)
    const ys = ts.map((t) => 2.5 * t * t - 500 * t + 25000.3)
    const fit = fitPolynomial(ts, ys, 2)
    expect(fit).not.toBeNull()
    const abs = toAbsoluteQuadratic(fit!)
    expect(abs.a).toBeCloseTo(2.5, 6)
    for (const t of ts) expect(evalPoly(fit!, t)).toBeCloseTo(2.5 * t * t - 500 * t + 25000.3, 6)
    expect(evalPolyDerivative(fit!, 100.2)).toBeCloseTo(5 * 100.2 - 500, 5)
  })

  it('Tukey IRLS rejects gross outliers', () => {
    const rng = createRng(3)
    const ts = Array.from({ length: 40 }, (_, i) => i / 60)
    const ys = ts.map((t) => 0.8 - 1.2 * t + 1.1 * t * t + 0.001 * gaussian(rng))
    ys[5] += 0.2
    ys[17] -= 0.3
    ys[30] += 0.1
    const robust = robustFitPolynomial(ts, ys, 2, { minScale: 0.001 })!
    expect(robust.inlier[5]).toBe(false)
    expect(robust.inlier[17]).toBe(false)
    expect(robust.inlier[30]).toBe(false)
    expect(toAbsoluteQuadratic(robust.fit).a).toBeCloseTo(1.1, 1)
    const plain = fitPolynomial(ts, ys, 2)!
    expect(Math.abs(toAbsoluteQuadratic(plain).a - 1.1)).toBeGreaterThan(Math.abs(toAbsoluteQuadratic(robust.fit).a - 1.1))
  })

  it('line fit reports slope standard error consistent with noise', () => {
    const rng = createRng(9)
    const sigma = 0.01
    const slopes: number[] = []
    let reported = 0
    for (let trial = 0; trial < 300; trial++) {
      const ts = Array.from({ length: 8 }, (_, i) => i * 0.01)
      const ys = ts.map((t) => 0.5 + 3 * t + sigma * gaussian(rng))
      const line = fitLine(ts, ys)!
      slopes.push(line.slope)
      reported += line.slopeSigma / 300
    }
    const mean = slopes.reduce((s, v) => s + v, 0) / slopes.length
    const sd = Math.sqrt(slopes.reduce((s, v) => s + (v - mean) ** 2, 0) / (slopes.length - 1))
    expect(mean).toBeCloseTo(3, 1)
    expect(reported / sd).toBeGreaterThan(0.8)
    expect(reported / sd).toBeLessThan(1.2)
  })

  it('median and percentile', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(percentile([0, 10], 50)).toBe(5)
    expect(Number.isNaN(median([]))).toBe(true)
  })
})
