/**
 * Live stability and light from a tiny luma grid of the preview (CAPTURE §9.6, simplified for the
 * web prototype). Pure; unit-tested. A phone that moves shifts the whole picture, so the median
 * per-cell change is large; a person walking changes only a few cells.
 */

export const GRID = { width: 48, height: 48 } as const

/** Rec. 709 luma of an RGBA buffer into a Uint8Array (one byte per pixel). */
export function lumaOf(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    out[j] = Math.round(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2])
  }
  return out
}

/** Median absolute per-cell difference between two luma grids of the same size. */
export function medianAbsDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return Number.POSITIVE_INFINITY
  const hist = new Uint32Array(256)
  for (let i = 0; i < a.length; i++) hist[Math.abs(a[i] - b[i])]++
  const half = a.length / 2
  let acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= half) return v
  }
  return 255
}

/** Steady once the picture has not moved for `holdS` seconds (CAPTURE §9.6: 2 s). */
export class SteadyTracker {
  private prev: Uint8Array | null = null
  private stillSince: number | null = null
  private started: number | null = null
  constructor(
    private readonly holdS = 2,
    private readonly threshold = 3,
  ) {}

  /** Feeds one grid; returns null until there is enough history, then true or false. */
  push(grid: Uint8Array, tS: number): boolean | null {
    this.started ??= tS
    const prev = this.prev
    this.prev = grid
    if (!prev) return null
    const moving = medianAbsDiff(prev, grid) > this.threshold
    if (moving) this.stillSince = null
    else this.stillSince ??= tS
    if (this.stillSince !== null && tS - this.stillSince >= this.holdS) return true
    if (moving) return false
    return tS - this.started < this.holdS ? null : false
  }
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Mean luma inside a normalised box (whole grid when box is null). */
export function meanLuma(grid: Uint8Array, width: number, height: number, box: Box | null): number | null {
  const x0 = box ? Math.max(0, Math.floor(box.x * width)) : 0
  const y0 = box ? Math.max(0, Math.floor(box.y * height)) : 0
  const x1 = box ? Math.min(width, Math.ceil((box.x + box.w) * width)) : width
  const y1 = box ? Math.min(height, Math.ceil((box.y + box.h) * height)) : height
  let sum = 0
  let n = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    sum += grid[y * width + x]
    n++
  }
  return n ? sum / n : null
}

/** CAPTURE §8.2 cq.exposure / cq.backlight, reduced to one word for the live tray. */
export function classifyLight(subjectMean: number | null, frameMean: number | null, backgroundMean: number | null): 'good' | 'dark' | 'backlit' | null {
  if (frameMean === null) return null
  const subject = subjectMean ?? frameMean
  if (subject < 40) return 'dark'
  if (subjectMean !== null && backgroundMean !== null && backgroundMean > 0 && subjectMean / backgroundMean < 0.5) return 'backlit'
  return 'good'
}
