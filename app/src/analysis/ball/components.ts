/**
 * 8-connected component labelling on a binary grid with per-blob moment accumulation.
 * Coordinates are grid cells; a cell (i, j) covers [i, i+1) x [j, j+1), so its centre is
 * at (i + 0.5, j + 0.5).
 */

export interface CellRect {
  x0: number
  y0: number
  /** Exclusive bounds. */
  x1: number
  y1: number
}

export interface BlobStats {
  area: number
  /** Likelihood-weighted sums (for a sub-cell centroid). */
  sumW: number
  sumWX: number
  sumWY: number
  /** Unweighted sums of cell centres (for shape). */
  sumX: number
  sumY: number
  sumXX: number
  sumYY: number
  sumXY: number
  sumColour: number
  sumMotion: number
  peak: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface BlobShape {
  /** Weighted centroid in cell units. */
  cx: number
  cy: number
  /** Radius estimate (cells) from the minor-axis second moment: disc variance = r^2 / 4. */
  radius: number
  /** Streak length (cells): centre travel of a blurred disc, from major-minor variance difference (segment variance L^2 / 12). */
  streakLength: number
  /** Major-axis orientation in radians, image axes (x right, y down), in (-pi/2, pi/2]. */
  angleRad: number
  /** Area / area of the capsule implied by radius and streak (1 = compact disc or capsule). */
  fill: number
}

function emptyStats(): BlobStats {
  return {
    area: 0,
    sumW: 0,
    sumWX: 0,
    sumWY: 0,
    sumX: 0,
    sumY: 0,
    sumXX: 0,
    sumYY: 0,
    sumXY: 0,
    sumColour: 0,
    sumMotion: 0,
    peak: 0,
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
  }
}

/**
 * Label cells where likelihood >= threshold inside rect. Blobs larger than maxArea are
 * still consumed (so their cells are not revisited) but are dropped from the output.
 */
export function extractBlobs(
  likelihood: Float32Array,
  colour: Float32Array,
  motion: Float32Array | null,
  width: number,
  rect: CellRect,
  threshold: number,
  maxArea: number,
): BlobStats[] {
  const height = likelihood.length / width
  const visited = new Uint8Array(likelihood.length)
  const stack = new Int32Array(likelihood.length)
  const blobs: BlobStats[] = []
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const seed = y * width + x
      if (visited[seed] || likelihood[seed] < threshold) continue
      const stats = emptyStats()
      let top = 0
      stack[top++] = seed
      visited[seed] = 1
      while (top > 0) {
        const index = stack[--top]
        const cx = index % width
        const cy = (index - cx) / width
        accumulate(stats, cx + 0.5, cy + 0.5, likelihood[index], colour[index], motion ? motion[index] : 0)
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy
          if (ny < rect.y0 || ny >= rect.y1 || ny >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx
            if ((dx === 0 && dy === 0) || nx < rect.x0 || nx >= rect.x1) continue
            const neighbour = ny * width + nx
            if (visited[neighbour] || likelihood[neighbour] < threshold) continue
            visited[neighbour] = 1
            stack[top++] = neighbour
          }
        }
      }
      if (stats.area <= maxArea) blobs.push(stats)
    }
  }
  return blobs
}

function accumulate(stats: BlobStats, x: number, y: number, w: number, colour: number, motion: number): void {
  stats.area++
  stats.sumW += w
  stats.sumWX += w * x
  stats.sumWY += w * y
  stats.sumX += x
  stats.sumY += y
  stats.sumXX += x * x
  stats.sumYY += y * y
  stats.sumXY += x * y
  stats.sumColour += colour
  stats.sumMotion += motion
  if (w > stats.peak) stats.peak = w
  const ix = x - 0.5
  const iy = y - 0.5
  if (ix < stats.minX) stats.minX = ix
  if (ix > stats.maxX) stats.maxX = ix
  if (iy < stats.minY) stats.minY = iy
  if (iy > stats.maxY) stats.maxY = iy
}

export function blobShape(stats: BlobStats): BlobShape {
  const n = stats.area
  const mx = stats.sumX / n
  const my = stats.sumY / n
  // + 1/12: variance of a uniform unit cell, so a single cell is not a zero-size point.
  const cxx = stats.sumXX / n - mx * mx + 1 / 12
  const cyy = stats.sumYY / n - my * my + 1 / 12
  const cxy = stats.sumXY / n - mx * my
  const trace = cxx + cyy
  const disc = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy))
  const major = trace / 2 + disc
  const minor = Math.max(1e-9, trace / 2 - disc)
  const radius = 2 * Math.sqrt(minor)
  const streakLength = Math.sqrt(Math.max(0, 12 * (major - minor)))
  const capsuleArea = Math.PI * radius * radius + 2 * radius * streakLength
  return {
    cx: stats.sumW > 0 ? stats.sumWX / stats.sumW : mx,
    cy: stats.sumW > 0 ? stats.sumWY / stats.sumW : my,
    radius,
    streakLength,
    angleRad: 0.5 * Math.atan2(2 * cxy, cxx - cyy),
    fill: n / capsuleArea,
  }
}
