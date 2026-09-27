/**
 * Deterministic layout helpers for the charts (DESIGN §9.3 beeswarm, §9.1 nearest-point selection,
 * §9.4 "usual area" ellipse, §9.6 unit packing). Pure functions; stable for the same input so marks
 * never jump between renders (§13.8).
 */

export interface Pt {
  x: number
  y: number
}

/**
 * Beeswarm (DESIGN §9.3): marks are placed in input order; a mark that would overlap an earlier one
 * by more than `maxOverlap` px moves up, then down, in `step` px steps (at most ± `maxSteps`). Beyond
 * that it keeps the offset with the least overlap and the tap layer still separates the marks.
 * Returns a y offset (px) per input x (px).
 */
export function beeswarm(xs: readonly number[], opts: { diameter?: number; maxOverlap?: number; step?: number; maxSteps?: number } = {}): number[] {
  const { diameter = 8, maxOverlap = 3, step = 9, maxSteps = 2 } = opts
  const minDist = diameter - maxOverlap
  const candidates = [0]
  for (let s = 1; s <= maxSteps; s++) candidates.push(-s * step, s * step)
  const placed: Pt[] = []
  const out: number[] = []
  for (const x of xs) {
    let best = 0
    let bestOverlap = Number.POSITIVE_INFINITY
    for (const dy of candidates) {
      let worst = 0
      for (const p of placed) {
        const d = Math.hypot(p.x - x, p.y - dy)
        if (d < minDist) worst = Math.max(worst, minDist - d)
      }
      if (worst === 0) {
        best = dy
        bestOverlap = 0
        break
      }
      if (worst < bestOverlap) {
        best = dy
        bestOverlap = worst
      }
    }
    placed.push({ x, y: best })
    out.push(best)
  }
  return out
}

/** Index of the nearest point within `maxDist` px (DESIGN §9.1: 24 px hit radius), or -1. */
export function nearestPoint(points: readonly Pt[], x: number, y: number, maxDist = 24): number {
  let best = -1
  let bestD = maxDist
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].y - y)
    if (d <= bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

/** Next index for arrow-key navigation, ordered by x (DESIGN §9.1 keyboard). */
export function stepSelection(order: readonly number[], current: number | null, delta: 1 | -1): number | null {
  if (!order.length) return null
  if (current === null) return delta > 0 ? order[0] : order[order.length - 1]
  const pos = order.indexOf(current)
  if (pos < 0) return order[0]
  return order[Math.min(order.length - 1, Math.max(0, pos + delta))]
}

export interface Ellipse {
  cx: number
  cy: number
  rx: number
  ry: number
  /** Rotation in degrees (SVG convention, clockwise in screen space when y points down). */
  angle: number
}

/**
 * "Your usual area" (DESIGN §9.4): the bivariate-normal ellipse at `k` SD (1.5 by default, about
 * two-thirds of the points), from the covariance of data-space points. Needs at least 3 points.
 */
export function covarianceEllipse(points: readonly Pt[], k = 1.5): Ellipse | null {
  const n = points.length
  if (n < 3) return null
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  sxx /= n - 1
  syy /= n - 1
  sxy /= n - 1
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = Math.max(0, tr / 2 - disc)
  const angle = sxy === 0 ? (sxx >= syy ? 0 : 90) : (Math.atan2(l1 - sxx, sxy) * 180) / Math.PI
  return { cx: mx, cy: my, rx: k * Math.sqrt(l1), ry: k * Math.sqrt(l2), angle }
}

/**
 * Packs `count` unit marks into a cell on a `pitch` grid (DESIGN §9.6: 8 px marks on a 12 px grid),
 * row by row from the top-left, centred horizontally. Returns centres relative to the cell origin.
 */
export function packUnits(count: number, width: number, pitch = 12, top = 0): Pt[] {
  const perRow = Math.max(1, Math.floor(width / pitch))
  const out: Pt[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow)
    const inRow = Math.min(perRow, count - row * perRow)
    const col = i % perRow
    const rowWidth = inRow * pitch
    out.push({ x: (width - rowWidth) / 2 + pitch / 2 + col * pitch, y: top + pitch / 2 + row * pitch })
  }
  return out
}
