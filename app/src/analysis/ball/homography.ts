/**
 * Planar homography (image <-> court ground plane) by the normalised DLT (Hartley):
 * both point sets are translated to their centroid and scaled to mean distance sqrt(2),
 * the 2n x 9 system is solved for the null vector (smallest eigenvector of A^T A, cyclic
 * Jacobi), then denormalised. Needs >= 4 point pairs with no 3 collinear.
 *
 * Image points may be given in any consistent units (normalised [0,1] is fine: the
 * anisotropic x/y scaling is absorbed by H). Court coordinates are metres, see COURT below.
 */

export interface Point2 {
  x: number
  y: number
}

/** Row-major 3x3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

export interface HomographyFit {
  H: Mat3
  /** Reprojection error of the calibration points in destination units. */
  rmsError: number
  maxError: number
}

/**
 * Court frame (metres): x across the court (0 on the centre line, + to the server's right when
 * facing the net), y along the court from the server's baseline (0) through the net (11.885) to
 * the far baseline (23.77). ITF dimensions.
 */
export const COURT = {
  lengthM: 23.77,
  netY: 11.885,
  singlesHalfWidthM: 4.115,
  doublesHalfWidthM: 5.485,
  /** Service lines are 6.40 m from the net. */
  nearServiceLineY: 11.885 - 6.4,
  farServiceLineY: 11.885 + 6.4,
}

/** Named ground-plane keypoints a calibration UI can ask the player to tap. */
export const COURT_KEYPOINTS: Record<string, Point2> = {
  nearBaselineSinglesLeft: { x: -COURT.singlesHalfWidthM, y: 0 },
  nearBaselineSinglesRight: { x: COURT.singlesHalfWidthM, y: 0 },
  nearBaselineDoublesLeft: { x: -COURT.doublesHalfWidthM, y: 0 },
  nearBaselineDoublesRight: { x: COURT.doublesHalfWidthM, y: 0 },
  nearCentreMark: { x: 0, y: 0 },
  nearServiceT: { x: 0, y: COURT.nearServiceLineY },
  nearServiceLineLeft: { x: -COURT.singlesHalfWidthM, y: COURT.nearServiceLineY },
  nearServiceLineRight: { x: COURT.singlesHalfWidthM, y: COURT.nearServiceLineY },
  farServiceT: { x: 0, y: COURT.farServiceLineY },
  farServiceLineLeft: { x: -COURT.singlesHalfWidthM, y: COURT.farServiceLineY },
  farServiceLineRight: { x: COURT.singlesHalfWidthM, y: COURT.farServiceLineY },
  farBaselineSinglesLeft: { x: -COURT.singlesHalfWidthM, y: COURT.lengthM },
  farBaselineSinglesRight: { x: COURT.singlesHalfWidthM, y: COURT.lengthM },
  farCentreMark: { x: 0, y: COURT.lengthM },
}

export function applyHomography(H: Mat3, p: Point2): Point2 | null {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  if (Math.abs(w) < 1e-12) return null
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

export function multiply3(A: Mat3, B: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0) as Mat3
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c]
  return out
}

export function invertHomography(H: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = H
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-15) return null
  const inv: Mat3 = [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ]
  return normaliseH(inv)
}

function normaliseH(H: Mat3): Mat3 {
  const scale = Math.abs(H[8]) > 1e-12 ? H[8] : Math.hypot(...H)
  return H.map((v) => v / scale) as Mat3
}

/** Similarity transform taking points to centroid 0, mean distance sqrt(2). */
function normalisingTransform(points: Point2[]): Mat3 {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  const meanDist = points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length
  const s = meanDist > 0 ? Math.SQRT2 / meanDist : 1
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]
}

/** Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations. */
export function symmetricEigen(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = matrix.length
  const a = matrix.map((row) => [...row])
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q]
    if (off < 1e-30) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p]
          const vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  const values = a.map((row, i) => row[i])
  // Column i of v is the eigenvector for values[i].
  const vectors = values.map((_, i) => v.map((row) => row[i]))
  return { values, vectors }
}

/**
 * Homography mapping src -> dst. Returns null for fewer than 4 pairs or a degenerate
 * configuration (e.g. 3 of 4 points collinear), detected by a near-zero second-smallest
 * eigenvalue (the null space is not one-dimensional).
 */
export function computeHomography(src: Point2[], dst: Point2[]): HomographyFit | null {
  if (src.length < 4 || src.length !== dst.length) return null
  const Ts = normalisingTransform(src)
  const Td = normalisingTransform(dst)
  const ns = src.map((p) => applyHomography(Ts, p) as Point2)
  const nd = dst.map((p) => applyHomography(Td, p) as Point2)
  const ata = Array.from({ length: 9 }, () => new Array<number>(9).fill(0))
  const addRow = (row: number[]) => {
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) ata[i][j] += row[i] * row[j]
  }
  for (let k = 0; k < ns.length; k++) {
    const { x, y } = ns[k]
    const { x: u, y: w } = nd[k]
    addRow([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
    addRow([0, 0, 0, -x, -y, -1, w * x, w * y, w])
  }
  const { values, vectors } = symmetricEigen(ata)
  const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value)
  const largest = order[order.length - 1].value
  if (!(order[1].value > 1e-10 * largest)) return null
  const hn = vectors[order[0].i] as Mat3
  const TdInv = invertHomography(Td)
  if (!TdInv) return null
  const H = normaliseH(multiply3(multiply3(TdInv, hn), Ts))
  const errors = reprojectionErrors(H, src, dst)
  if (!Number.isFinite(errors.rms)) return null
  return { H, rmsError: errors.rms, maxError: errors.max }
}

/** Distances between H(src[i]) and dst[i], in destination units. */
export function reprojectionErrors(H: Mat3, src: Point2[], dst: Point2[]): { perPoint: number[]; rms: number; max: number } {
  const perPoint = src.map((p, i) => {
    const q = applyHomography(H, p)
    return q ? Math.hypot(q.x - dst[i].x, q.y - dst[i].y) : Infinity
  })
  const rms = Math.sqrt(perPoint.reduce((s, e) => s + e * e, 0) / Math.max(1, perPoint.length))
  return { perPoint, rms, max: Math.max(...perPoint) }
}

/** d(H p)/dp as a 2x2 matrix [[dX/dx, dX/dy], [dY/dx, dY/dy]], by central differences. */
export function homographyJacobian(H: Mat3, p: Point2, step = 1e-6): [[number, number], [number, number]] | null {
  const px1 = applyHomography(H, { x: p.x + step, y: p.y })
  const px0 = applyHomography(H, { x: p.x - step, y: p.y })
  const py1 = applyHomography(H, { x: p.x, y: p.y + step })
  const py0 = applyHomography(H, { x: p.x, y: p.y - step })
  if (!px1 || !px0 || !py1 || !py0) return null
  return [
    [(px1.x - px0.x) / (2 * step), (py1.x - py0.x) / (2 * step)],
    [(px1.y - px0.y) / (2 * step), (py1.y - py0.y) / (2 * step)],
  ]
}

export type ServeSide = 'deuce' | 'ad'

export interface ServeLanding {
  /** Which far service box the point lies in, or null if outside both. */
  box: ServeSide | null
  /** The serve is in (lands in the diagonally opposite box). Lines count as in. */
  isIn: boolean
  /** Metres short of the far service line (negative = long). */
  depthFromServiceLineM: number
  /** Metres from the centre service line (positive = toward the sideline). */
  distanceFromCentreLineM: number
}

/**
 * Classify a landing point (court frame) for a serve from the near baseline. The receiver's
 * deuce box is on the server's left (x < 0) in the far court, the ad box on the right.
 */
export function classifyServeLanding(p: Point2, servedFrom: ServeSide): ServeLanding {
  const inLength = p.y >= COURT.netY && p.y <= COURT.farServiceLineY
  const inWidth = Math.abs(p.x) <= COURT.singlesHalfWidthM
  const box: ServeSide | null = inLength && inWidth ? (p.x <= 0 ? 'deuce' : 'ad') : null
  return {
    box,
    isIn: box === servedFrom || (inLength && inWidth && p.x === 0),
    depthFromServiceLineM: COURT.farServiceLineY - p.y,
    distanceFromCentreLineM: Math.abs(p.x),
  }
}
