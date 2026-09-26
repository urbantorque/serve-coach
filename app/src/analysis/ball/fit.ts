/**
 * Small dense least-squares helpers (a handful of unknowns). Polynomials are fitted in
 * centred time (t - t0) so that absolute clip times of tens of seconds do not hurt
 * conditioning; use toAbsoluteQuadratic() to get y = a t^2 + b t + c in clip time.
 */

export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length
  const m = matrix.map((row, i) => [...row, rhs[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    const pivotValue = m[pivot][col]
    if (!Number.isFinite(pivotValue) || Math.abs(pivotValue) < 1e-300) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = m[r][col] / m[col][col]
      if (factor === 0) continue
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c]
    }
  }
  const solution = m.map((row, i) => row[n] / row[i])
  return solution.every(Number.isFinite) ? solution : null
}

export function invertMatrix(matrix: number[][]): number[][] | null {
  const n = matrix.length
  const columns: number[][] = []
  for (let c = 0; c < n; c++) {
    const unit = Array.from({ length: n }, (_, i) => (i === c ? 1 : 0))
    const column = solveLinearSystem(matrix, unit)
    if (!column) return null
    columns.push(column)
  }
  return Array.from({ length: n }, (_, r) => columns.map((column) => column[r]))
}

export interface LeastSquaresResult {
  beta: number[]
  /** Parameter covariance scaled by the residual variance estimate. */
  cov: number[][]
  /** Weighted residual sum of squares. */
  rss: number
  /** Residual variance estimate rss / (n - p); 0 for an exact fit. */
  sigma2: number
  n: number
  p: number
}

/** Weighted linear least squares via normal equations. Rows are design-matrix rows. */
export function weightedLeastSquares(rows: number[][], y: number[], weights?: number[]): LeastSquaresResult | null {
  const n = rows.length
  if (n === 0) return null
  const p = rows[0].length
  const xtwx = Array.from({ length: p }, () => new Array<number>(p).fill(0))
  const xtwy = new Array<number>(p).fill(0)
  let effectiveN = 0
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1
    if (w <= 0) continue
    effectiveN++
    const row = rows[i]
    for (let j = 0; j < p; j++) {
      xtwy[j] += w * row[j] * y[i]
      for (let k = j; k < p; k++) xtwx[j][k] += w * row[j] * row[k]
    }
  }
  if (effectiveN < p) return null
  for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) xtwx[j][k] = xtwx[k][j]
  const inverse = invertMatrix(xtwx)
  if (!inverse) return null
  const beta = inverse.map((row) => row.reduce((sum, v, k) => sum + v * xtwy[k], 0))
  let rss = 0
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1
    if (w <= 0) continue
    const r = y[i] - rows[i].reduce((sum, v, k) => sum + v * beta[k], 0)
    rss += w * r * r
  }
  const sigma2 = effectiveN > p ? rss / (effectiveN - p) : 0
  const cov = inverse.map((row) => row.map((v) => v * sigma2))
  return { beta, cov, rss, sigma2, n: effectiveN, p }
}

export interface PolyFit {
  degree: number
  /** Time origin: y(t) = sum_k coeffs[k] * (t - t0)^k */
  t0: number
  coeffs: number[]
  cov: number[][]
  /** Root mean square of (weighted-in) residuals, same units as y. */
  rmse: number
  n: number
}

export function evalPoly(fit: Pick<PolyFit, 't0' | 'coeffs'>, t: number): number {
  const dt = t - fit.t0
  let value = 0
  for (let k = fit.coeffs.length - 1; k >= 0; k--) value = value * dt + fit.coeffs[k]
  return value
}

export function evalPolyDerivative(fit: Pick<PolyFit, 't0' | 'coeffs'>, t: number): number {
  const dt = t - fit.t0
  let value = 0
  for (let k = fit.coeffs.length - 1; k >= 1; k--) value = value * dt + k * fit.coeffs[k]
  return value
}

export function mean(values: number[]): number {
  return values.length === 0 ? NaN : values.reduce((s, v) => s + v, 0) / values.length
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid])
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, (p / 100) * (sorted.length - 1)))
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo)
}

export function fitPolynomial(
  ts: number[],
  ys: number[],
  degree: number,
  weights?: number[],
  t0: number = mean(ts),
): PolyFit | null {
  const rows = ts.map((t) => {
    const dt = t - t0
    const row = [1]
    for (let k = 1; k <= degree; k++) row.push(row[k - 1] * dt)
    return row
  })
  const result = weightedLeastSquares(rows, ys, weights)
  if (!result) return null
  let sumSq = 0
  let count = 0
  for (let i = 0; i < ts.length; i++) {
    if (weights && weights[i] <= 0) continue
    const r = ys[i] - evalPoly({ t0, coeffs: result.beta }, ts[i])
    sumSq += r * r
    count++
  }
  return { degree, t0, coeffs: result.beta, cov: result.cov, rmse: Math.sqrt(sumSq / Math.max(1, count)), n: result.n }
}

export interface RobustPolyFit {
  fit: PolyFit
  /** Final Tukey weights (0 = rejected as outlier). */
  weights: number[]
  inlier: boolean[]
  /** Robust residual scale used for the final iteration. */
  scale: number
}

export interface RobustFitOptions {
  /** Floor for the residual scale (e.g. expected localisation noise), so perfect data are not over-trimmed. */
  minScale: number
  iterations?: number
  /** Tukey biweight tuning constant in units of scale (4.685 gives 95% efficiency for Gaussian noise). */
  tuning?: number
  priorWeights?: number[]
}

/** Iteratively reweighted least squares with Tukey's biweight. */
export function robustFitPolynomial(
  ts: number[],
  ys: number[],
  degree: number,
  options: RobustFitOptions,
): RobustPolyFit | null {
  const tuning = options.tuning ?? 4.685
  const prior = options.priorWeights ?? ts.map(() => 1)
  let fit = fitPolynomial(ts, ys, degree, prior)
  if (!fit) return null
  let weights = [...prior]
  let scale = options.minScale
  for (let iter = 0; iter < (options.iterations ?? 12); iter++) {
    const residuals = ts.map((t, i) => ys[i] - evalPoly(fit as PolyFit, t))
    scale = Math.max(options.minScale, 1.4826 * median(residuals.map(Math.abs)))
    const next = residuals.map((r, i) => {
      const u = r / (tuning * scale)
      return Math.abs(u) < 1 ? prior[i] * (1 - u * u) ** 2 : 0
    })
    const refit = fitPolynomial(ts, ys, degree, next, fit.t0)
    if (!refit) break
    const change = Math.max(...refit.coeffs.map((c, k) => Math.abs(c - (fit as PolyFit).coeffs[k])))
    fit = refit
    weights = next
    if (change < 1e-12) break
  }
  return { fit, weights, inlier: weights.map((w) => w > 0), scale }
}

/** Convert a centred quadratic fit to y = a t^2 + b t + c in absolute time. */
export function toAbsoluteQuadratic(fit: Pick<PolyFit, 't0' | 'coeffs'>): { a: number; b: number; c: number } {
  const [c0, c1 = 0, c2 = 0] = fit.coeffs
  const t0 = fit.t0
  return { a: c2, b: c1 - 2 * c2 * t0, c: c0 - c1 * t0 + c2 * t0 * t0 }
}

/** Straight-line fit y = intercept + slope * (t - t0) with standard errors. */
export function fitLine(
  ts: number[],
  ys: number[],
  weights?: number[],
): { t0: number; intercept: number; slope: number; slopeSigma: number; interceptSigma: number; rmse: number } | null {
  const fit = fitPolynomial(ts, ys, 1, weights)
  if (!fit) return null
  return {
    t0: fit.t0,
    intercept: fit.coeffs[0],
    slope: fit.coeffs[1],
    interceptSigma: Math.sqrt(Math.max(0, fit.cov[0][0])),
    slopeSigma: Math.sqrt(Math.max(0, fit.cov[1][1])),
    rmse: fit.rmse,
  }
}
