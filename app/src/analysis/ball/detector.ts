/**
 * Per-frame tennis-ball candidate detection over ImageDataLike (RGBA).
 *
 * Pipeline per frame:
 *  1. box-downscale to a grid where the expected ball radius is ~3 cells;
 *  2. colour likelihood (colour.ts) and motion likelihood (difference against an
 *     exponential running background with a real-time constant, so a ball hanging at
 *     the toss apex in 240 fps footage is not absorbed into the background);
 *  3. combined likelihood = colour * (motion floor + motion), thresholded;
 *  4. 8-connected blobs, gated on size (vs expected radius), compactness and streak
 *     length (motion-blurred balls are capsules: radius from the minor axis, streak
 *     length from the major axis);
 *  5. sub-pixel centroid refined at full resolution for the top candidates.
 */
import type { ImageDataLike } from '../types.ts'
import { ballColourLikelihood, clamp, DEFAULT_COLOUR_MODEL, smoothstep, type ColourModel } from './colour.ts'
import { blobShape, extractBlobs, type BlobStats, type CellRect } from './components.ts'
import type { RegionOfInterest } from './scale.ts'

export interface BallCandidate {
  /** Normalised centre (x of width, y of height), origin top-left. */
  x: number
  y: number
  /** Radius in frame-height units (motion-blur streaks: the half-width). */
  radiusNorm: number
  /** 0..1 overall detection score. */
  score: number
  colourScore: number
  /** Mean motion likelihood; null on the first frame (no background yet). */
  motionScore: number | null
  /** Centre travel during the exposure, frame-height units (0 for a sharp ball). */
  streakLengthNorm: number
  /** Streak orientation (radians, image axes, x right / y down); undefined direction sign. */
  streakAngleRad: number
  areaPx: number
}

export interface DetectorOptions {
  /** Expected ball radius in frame-height units (from scale.ts). Enables size gating. */
  expectedRadiusNorm?: number
  roi?: RegionOfInterest
  colourModel?: ColourModel
  /** Grid downscale factor, or 'auto' (expected radius ~cellsPerRadius cells). */
  downscale?: number | 'auto'
  /** Target grid cells per expected ball radius for 'auto' downscaling (default 3). */
  cellsPerRadius?: number
  /** Running-background time constant in real seconds. */
  backgroundTimeConstantS?: number
  /** Mean channel difference (8-bit) ramp for motion likelihood. */
  motionLowLevels?: number
  motionHighLevels?: number
  /** Motion floor: static yellow pixels keep this fraction of their colour likelihood. */
  motionFloor?: number
  /** Combined-likelihood threshold for the blob mask. */
  maskThreshold?: number
  /** Size prior around expectedRadiusNorm (default DEFAULT_SIZE_PRIOR). */
  sizePrior?: SizePrior
  /** Longest accepted streak as a multiple of ball diameter. */
  maxStreakRatio?: number
  minScore?: number
  maxCandidates?: number
}

export interface DetectorFrame {
  image: ImageDataLike
  tReal: number
}

const DEFAULTS = {
  backgroundTimeConstantS: 0.4,
  motionLowLevels: 6,
  motionHighLevels: 22,
  motionFloor: 0.2,
  maskThreshold: 0.3,
  maxStreakRatio: 8,
  minScore: 0.12,
  maxCandidates: 8,
}

/** Frame reduced to float RGB planes on a coarse grid. */
export interface GridFrame {
  width: number
  height: number
  factor: number
  r: Float32Array
  g: Float32Array
  b: Float32Array
}

export function chooseDownscaleFactor(frameHeightPx: number, expectedRadiusNorm?: number, cellsPerRadius = 3): number {
  if (expectedRadiusNorm && expectedRadiusNorm > 0) {
    return clamp(Math.floor((expectedRadiusNorm * frameHeightPx) / cellsPerRadius), 1, 8)
  }
  return Math.max(1, Math.round(frameHeightPx / 720))
}

/** Box-average RGBA image into factor x factor cells (partial edge cells are dropped). */
export function downscaleRgb(image: ImageDataLike, factor: number): GridFrame {
  const width = Math.floor(image.width / factor)
  const height = Math.floor(image.height / factor)
  const r = new Float32Array(width * height)
  const g = new Float32Array(width * height)
  const b = new Float32Array(width * height)
  const data = image.data
  const inv = 1 / (factor * factor)
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      let sr = 0
      let sg = 0
      let sb = 0
      for (let dy = 0; dy < factor; dy++) {
        let p = ((cy * factor + dy) * image.width + cx * factor) * 4
        for (let dx = 0; dx < factor; dx++, p += 4) {
          sr += data[p]
          sg += data[p + 1]
          sb += data[p + 2]
        }
      }
      const i = cy * width + cx
      r[i] = sr * inv
      g[i] = sg * inv
      b[i] = sb * inv
    }
  }
  return { width, height, factor, r, g, b }
}

export function roiToCells(roi: RegionOfInterest | undefined, grid: Pick<GridFrame, 'width' | 'height'>): CellRect {
  if (!roi) return { x0: 0, y0: 0, x1: grid.width, y1: grid.height }
  return {
    x0: clamp(Math.floor(roi.x0 * grid.width), 0, grid.width),
    y0: clamp(Math.floor(roi.y0 * grid.height), 0, grid.height),
    x1: clamp(Math.ceil(roi.x1 * grid.width), 0, grid.width),
    y1: clamp(Math.ceil(roi.y1 * grid.height), 0, grid.height),
  }
}

export function colourLikelihoodMap(grid: GridFrame, rect: CellRect, model: ColourModel): Float32Array {
  const out = new Float32Array(grid.width * grid.height)
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * grid.width + x
      out[i] = ballColourLikelihood(grid.r[i], grid.g[i], grid.b[i], model)
    }
  }
  return out
}

/** Ball coverage fractions tried when un-mixing a moving pixel from its background. */
const UNMIX_ALPHAS = [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.13]

/**
 * Colour likelihood of the object that moved into a pixel. A motion-blurred ball covers each
 * pixel for only part of the exposure, so the pixel is a mix frame = bg + alpha (ball - bg).
 * The ball colour lies on the ray bg + (frame - bg) / alpha; this returns the best ball
 * likelihood along it for alpha in UNMIX_ALPHAS, stopping once the ray leaves the RGB gamut.
 */
export function unmixedColourLikelihood(
  r: number,
  g: number,
  b: number,
  bgR: number,
  bgG: number,
  bgB: number,
  model: ColourModel,
): number {
  const dr = r - bgR
  const dg = g - bgG
  const db = b - bgB
  let best = 0
  for (const alpha of UNMIX_ALPHAS) {
    const ur = bgR + dr / alpha
    const ug = bgG + dg / alpha
    const ub = bgB + db / alpha
    if (ur < -12 || ur > 267 || ug < -12 || ug > 267 || ub < -12 || ub > 267) break
    const l = ballColourLikelihood(clamp(ur, 0, 255), clamp(ug, 0, 255), clamp(ub, 0, 255), model)
    if (l > best) best = l
  }
  return best
}

export interface MotionMaps {
  /** Motion likelihood (0..1) with ghost suppression. */
  motion: Float32Array
  /** max(colour of the pixel, colour of what moved into it). */
  colour: Float32Array
}

/**
 * Motion likelihood from the mean absolute channel difference to the running background,
 * plus the un-mixed colour of moving pixels (see unmixedColourLikelihood).
 * Ghost suppression: where the ball has just left, the background still holds ball colour
 * and the difference is large; those cells are discounted when the current pixel is
 * clearly less ball-coloured than the background. (A ball hovering at the apex keeps
 * current >= background, so it survives.)
 */
export function motionMaps(
  grid: GridFrame,
  background: GridFrame,
  colour: Float32Array,
  rect: CellRect,
  model: ColourModel,
  lowLevels: number,
  highLevels: number,
): MotionMaps {
  const motion = new Float32Array(grid.width * grid.height)
  const effective = colour.slice()
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * grid.width + x
      const diff =
        (Math.abs(grid.r[i] - background.r[i]) + Math.abs(grid.g[i] - background.g[i]) + Math.abs(grid.b[i] - background.b[i])) /
        3
      const m = smoothstep(lowLevels, highLevels, diff)
      if (m <= 0) continue
      if (colour[i] < 0.9 && diff >= highLevels / 2) {
        const unmixed = unmixedColourLikelihood(grid.r[i], grid.g[i], grid.b[i], background.r[i], background.g[i], background.b[i], model)
        if (unmixed > effective[i]) effective[i] = unmixed
      }
      if (effective[i] <= 0) continue
      const backgroundColour = ballColourLikelihood(background.r[i], background.g[i], background.b[i], model)
      motion[i] = m * smoothstep(-0.35, -0.1, effective[i] - backgroundColour)
    }
  }
  return { motion, colour: effective }
}

/** 3x3 maximum filter inside rect; closes noise holes in the motion map of a slow ball. */
export function dilateMax3x3(map: Float32Array, width: number, rect: CellRect): Float32Array {
  const out = new Float32Array(map.length)
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      let best = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < rect.y0 || ny >= rect.y1) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < rect.x0 || nx >= rect.x1) continue
          const v = map[ny * width + nx]
          if (v > best) best = v
        }
      }
      out[y * width + x] = best
    }
  }
  return out
}

/** In-place exponential update: bg += alpha (frame - bg). */
export function updateBackground(background: GridFrame, grid: GridFrame, alpha: number): void {
  for (let i = 0; i < background.r.length; i++) {
    background.r[i] += alpha * (grid.r[i] - background.r[i])
    background.g[i] += alpha * (grid.g[i] - background.g[i])
    background.b[i] += alpha * (grid.b[i] - background.b[i])
  }
}

function cloneGrid(grid: GridFrame): GridFrame {
  return { ...grid, r: grid.r.slice(), g: grid.g.slice(), b: grid.b.slice() }
}

interface ScoringContext {
  image: ImageDataLike
  grid: GridFrame
  motion: Float32Array | null
  expectedRadiusPx: number | null
  model: ColourModel
  motionFloor: number
  maxStreakRatio: number
  sizePrior: SizePrior
}

/**
 * Size prior around the expected radius (log-normal, hard limits as ratios). The default is
 * for the toss (ball near the player's depth); BROAD_SIZE_PRIOR suits the outgoing ball,
 * which can recede to a third of that size within a few frames in a rear view.
 */
export interface SizePrior {
  minRatio: number
  maxRatio: number
  logSigma: number
}

export const DEFAULT_SIZE_PRIOR: SizePrior = { minRatio: 0.4, maxRatio: 2.3, logSigma: 0.45 }
export const BROAD_SIZE_PRIOR: SizePrior = { minRatio: 0.15, maxRatio: 2.3, logSigma: 0.9 }

/** Size score: log-normal around the expected radius, broad because depth and blur vary. */
function sizeScore(radiusPx: number, expectedRadiusPx: number | null, frameHeightPx: number, prior: SizePrior): number {
  if (expectedRadiusPx === null) {
    return radiusPx >= 0.8 && radiusPx <= 0.06 * frameHeightPx ? 0.8 : 0
  }
  const ratio = radiusPx / expectedRadiusPx
  if (ratio < prior.minRatio || ratio > prior.maxRatio || radiusPx < 0.6) return 0
  return Math.exp(-0.5 * (Math.log(ratio) / prior.logSigma) ** 2)
}

interface ScoredBlob {
  stats: BlobStats
  candidate: BallCandidate
  cellCx: number
  cellCy: number
}

/** Gate and score one blob; the centre is the coarse weighted centroid until refined. */
function scoreBlob(stats: BlobStats, ctx: ScoringContext): ScoredBlob | null {
  const f = ctx.grid.factor
  const shape = blobShape(stats)
  const radiusPx = shape.radius * f
  const streakPx = shape.streakLength * f
  const size = sizeScore(radiusPx, ctx.expectedRadiusPx, ctx.image.height, ctx.sizePrior)
  if (size === 0) return null
  if (streakPx > ctx.maxStreakRatio * 2 * Math.max(radiusPx, ctx.expectedRadiusPx ?? 0)) return null
  // Tiny blobs have noisy moments, so the fill test only applies from ~6 cells up.
  const shapeScore = stats.area < 6 ? 0.85 : smoothstep(0.3, 0.65, shape.fill)
  if (shapeScore === 0) return null
  const colourScore = stats.sumColour / stats.area
  const motionScore = ctx.motion ? stats.sumMotion / stats.area : null
  const motionTerm = motionScore === null ? 0.7 : ctx.motionFloor + (1 - ctx.motionFloor) * motionScore
  const score = clamp(Math.pow(colourScore, 0.6) * motionTerm * size * shapeScore, 0, 1)
  return {
    stats,
    cellCx: shape.cx,
    cellCy: shape.cy,
    candidate: {
      x: (shape.cx * f) / ctx.image.width,
      y: (shape.cy * f) / ctx.image.height,
      radiusNorm: radiusPx / ctx.image.height,
      score,
      colourScore,
      motionScore,
      streakLengthNorm: streakPx / ctx.image.height,
      streakAngleRad: shape.angleRad,
      areaPx: stats.area * f * f,
    },
  }
}

/**
 * Full-resolution likelihood-weighted centroid inside the blob's bounding box (plus one
 * cell). Weights are (likelihood - 0.15)+ so blurred edges contribute symmetrically.
 */
function refineCentroid(stats: BlobStats, cellCx: number, cellCy: number, ctx: ScoringContext): { x: number; y: number } {
  const { image, grid } = ctx
  const f = grid.factor
  const x0 = Math.max(0, (stats.minX - 1) * f)
  const y0 = Math.max(0, (stats.minY - 1) * f)
  const x1 = Math.min(image.width, (stats.maxX + 2) * f)
  const y1 = Math.min(image.height, (stats.maxY + 2) * f)
  let sw = 0
  let sx = 0
  let sy = 0
  for (let y = y0; y < y1; y++) {
    const cellY = Math.min(grid.height - 1, Math.floor(y / f))
    for (let x = x0; x < x1; x++) {
      const p = (y * image.width + x) * 4
      let l = ballColourLikelihood(image.data[p], image.data[p + 1], image.data[p + 2], ctx.model)
      if (l <= 0.15) continue
      if (ctx.motion) {
        const cellX = Math.min(grid.width - 1, Math.floor(x / f))
        l *= ctx.motionFloor + (1 - ctx.motionFloor) * ctx.motion[cellY * grid.width + cellX]
      }
      const w = l - 0.15
      if (w <= 0) continue
      sw += w
      sx += w * (x + 0.5)
      sy += w * (y + 0.5)
    }
  }
  if (sw < 0.5) return { x: cellCx * f, y: cellCy * f }
  return { x: sx / sw, y: sy / sw }
}

/**
 * Stateful wrapper: owns the running background. Feed frames in time order. One detector
 * per clip; call reset() before reusing on another clip.
 */
export class BallDetector {
  private readonly options: DetectorOptions
  private background: GridFrame | null = null
  private lastTReal = Number.NEGATIVE_INFINITY
  private factor = 0
  private dims = ''

  constructor(options: DetectorOptions = {}) {
    this.options = options
  }

  reset(): void {
    this.background = null
    this.lastTReal = Number.NEGATIVE_INFINITY
    this.factor = 0
    this.dims = ''
  }

  /** Candidates sorted by descending score. Per-frame ROI / expected radius may be overridden. */
  detect(frame: DetectorFrame, overrides: Pick<DetectorOptions, 'roi' | 'expectedRadiusNorm' | 'sizePrior'> = {}): BallCandidate[] {
    const opts = { ...DEFAULTS, ...this.options, ...overrides }
    const model = opts.colourModel ?? DEFAULT_COLOUR_MODEL
    const image = frame.image
    const dims = `${image.width}x${image.height}`
    if (this.factor === 0 || dims !== this.dims) {
      this.factor =
        typeof opts.downscale === 'number'
          ? Math.max(1, Math.floor(opts.downscale))
          : chooseDownscaleFactor(image.height, opts.expectedRadiusNorm, opts.cellsPerRadius)
      this.dims = dims
      this.background = null
    }
    const grid = downscaleRgb(image, this.factor)
    const rect = roiToCells(opts.roi, grid)
    const inOrder = frame.tReal > this.lastTReal
    const pixelColour = colourLikelihoodMap(grid, rect, model)
    const maps =
      this.background && inOrder
        ? motionMaps(grid, this.background, pixelColour, rect, model, opts.motionLowLevels, opts.motionHighLevels)
        : null
    const colour = maps ? maps.colour : pixelColour
    const motion = maps ? dilateMax3x3(maps.motion, grid.width, rect) : null

    const combined = new Float32Array(colour.length)
    for (let i = 0; i < colour.length; i++) {
      combined[i] = motion ? colour[i] * (opts.motionFloor + (1 - opts.motionFloor) * motion[i]) : colour[i]
    }
    const expectedRadiusPx = opts.expectedRadiusNorm ? opts.expectedRadiusNorm * image.height : null
    const maxRadiusCells = (expectedRadiusPx ? 2.3 * expectedRadiusPx : 0.06 * image.height) / this.factor
    const maxArea = Math.ceil(Math.PI * maxRadiusCells ** 2 + 2 * maxRadiusCells * (opts.maxStreakRatio * maxRadiusCells))
    const blobs = extractBlobs(combined, colour, motion, grid.width, rect, opts.maskThreshold, maxArea)
    const ctx: ScoringContext = {
      image,
      grid,
      motion,
      expectedRadiusPx,
      model,
      motionFloor: opts.motionFloor,
      maxStreakRatio: opts.maxStreakRatio,
      sizePrior: opts.sizePrior ?? DEFAULT_SIZE_PRIOR,
    }
    // Score every blob on coarse moments, then refine only the kept ones at full resolution.
    const scored: ScoredBlob[] = []
    for (const stats of blobs) {
      const blob = scoreBlob(stats, ctx)
      if (blob && blob.candidate.score >= opts.minScore) scored.push(blob)
    }
    scored.sort((a, b) => b.candidate.score - a.candidate.score)
    const candidates = scored.slice(0, opts.maxCandidates).map((blob): BallCandidate => {
      const refined = refineCentroid(blob.stats, blob.cellCx, blob.cellCy, ctx)
      return { ...blob.candidate, x: refined.x / image.width, y: refined.y / image.height }
    })

    if (!this.background || !inOrder) {
      this.background = cloneGrid(grid)
    } else {
      const dt = Math.min(1, frame.tReal - this.lastTReal)
      updateBackground(this.background, grid, 1 - Math.exp(-dt / opts.backgroundTimeConstantS))
    }
    this.lastTReal = frame.tReal
    return candidates
  }
}
