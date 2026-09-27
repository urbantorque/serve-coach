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
  /**
   * Share of the blob's footprint (disc plus streak capsule) that is ball-coloured at full
   * resolution (colour-seam rejection; about 0.6-1 for a ball, see refineAtFullResolution).
   */
  supportRatio: number
  /** As supportRatio, counting plain ball-coloured pixels only (no un-mixing). */
  plainSupportRatio: number
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
  /** Scale the background by the frame's illumination gain before differencing (flicker). Default true. */
  compensateIllumination?: boolean
  /**
   * Plain-colour support gate: the score is multiplied by
   * smoothstep(plainSupportLow, plainSupportHigh, plainSupportRatio). Off by default; use it
   * while the ball is slow and sharp (the toss), never for the outgoing ball, whose blurred
   * pixels are rarely plain ball colour. createBallFrameDetector applies TOSS_PLAIN_SUPPORT_GATE
   * inside the toss band.
   */
  plainSupportLow?: number
  plainSupportHigh?: number
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
  plainSupportLow: -1,
  plainSupportHigh: 0,
  compensateIllumination: true,
}

/** Blobs checked at full resolution per frame, as a multiple of maxCandidates. */
const SUPPORT_CHECK_FACTOR = 3

/**
 * Plain-colour support gate for the toss phase. On the rendered corpus (20 clips) true toss
 * candidates had plain support >= 0.36 (5th percentile per clip) and colour-seam candidates a
 * median of 0.00, so this ramp removes seams without touching the ball.
 */
export const TOSS_PLAIN_SUPPORT_GATE = { plainSupportLow: 0.05, plainSupportHigh: 0.2 }

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

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1

/**
 * Box-average RGBA image into factor x factor cells (partial edge cells are dropped).
 * Streams the image row by row into per-row integer sums (cache friendly; the sums are exact
 * integers, so the result is identical to summing cell by cell).
 */
export function downscaleRgb(image: ImageDataLike, factor: number): GridFrame {
  const width = Math.floor(image.width / factor)
  const height = Math.floor(image.height / factor)
  const r = new Float32Array(width * height)
  const g = new Float32Array(width * height)
  const b = new Float32Array(width * height)
  const data = image.data
  const rowStride = image.width * 4
  if (factor === 1) {
    for (let y = 0; y < height; y++) {
      let p = y * rowStride
      const base = y * width
      for (let x = 0; x < width; x++, p += 4) {
        r[base + x] = data[p]
        g[base + x] = data[p + 1]
        b[base + x] = data[p + 2]
      }
    }
    return { width, height, factor, r, g, b }
  }
  const inv = 1 / (factor * factor)
  const sr = new Uint32Array(width)
  const sg = new Uint32Array(width)
  const sb = new Uint32Array(width)
  // One 32-bit load per pixel when the buffer allows it (RGBA bytes; little-endian on every
  // platform the app runs on, checked below), else three byte loads.
  const words = data.byteOffset % 4 === 0 && LITTLE_ENDIAN ? new Uint32Array(data.buffer, data.byteOffset, data.length >> 2) : null
  const wordStride = image.width
  for (let cy = 0; cy < height; cy++) {
    sr.fill(0)
    sg.fill(0)
    sb.fill(0)
    for (let dy = 0; dy < factor; dy++) {
      if (words) {
        let q = (cy * factor + dy) * wordStride
        for (let cx = 0; cx < width; cx++) {
          let ar = 0
          let ag = 0
          let ab = 0
          for (let dx = 0; dx < factor; dx++, q++) {
            const v = words[q]
            ar += v & 0xff
            ag += (v >>> 8) & 0xff
            ab += (v >>> 16) & 0xff
          }
          sr[cx] += ar
          sg[cx] += ag
          sb[cx] += ab
        }
        continue
      }
      let p = (cy * factor + dy) * rowStride
      for (let cx = 0; cx < width; cx++) {
        let ar = 0
        let ag = 0
        let ab = 0
        for (let dx = 0; dx < factor; dx++, p += 4) {
          ar += data[p]
          ag += data[p + 1]
          ab += data[p + 2]
        }
        sr[cx] += ar
        sg[cx] += ag
        sb[cx] += ab
      }
    }
    const base = cy * width
    for (let cx = 0; cx < width; cx++) {
      r[base + cx] = sr[cx] * inv
      g[base + cx] = sg[cx] * inv
      b[base + cx] = sb[cx] * inv
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
 * Robust global illumination gain of the frame over the running background: the median of
 * (r + g + b) ratios over a sparse sample of reasonably bright cells, clamped to 0.5-2.
 * Floodlights on 50 Hz mains flicker at 100 Hz, so at 120-240 fps successive frames differ
 * in brightness by up to tens of percent everywhere they light; without this, every lit
 * yellow-green surface (trees, fences) reads as moving. Moving objects cover too little of
 * the frame to move the median. Returns 1 when too few cells are bright enough.
 */
export function illuminationGain(grid: GridFrame, background: GridFrame, step = 4, minLevelSum = 60): number {
  const ratios = new Float64Array(Math.ceil(grid.height / step) * Math.ceil(grid.width / step) + 1)
  let n = 0
  for (let y = 0; y < grid.height; y += step) {
    for (let x = (y / step) % 2 ? step >> 1 : 0; x < grid.width; x += step) {
      const i = y * grid.width + x
      const b = background.r[i] + background.g[i] + background.b[i]
      if (b < minLevelSum) continue
      ratios[n++] = (grid.r[i] + grid.g[i] + grid.b[i]) / b
    }
  }
  if (n < 50) return 1
  // The element a full sort would put at n >> 1 (quickselect: linear time, same value).
  return clamp(selectKth(ratios, n, n >> 1), 0.5, 2)
}

/** k-th smallest of values[0..n) (0-based), partially reordering the array (Hoare quickselect). */
export function selectKth(values: Float64Array, n: number, k: number): number {
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const pivot = values[(lo + hi) >> 1]
    let i = lo
    let j = hi
    while (i <= j) {
      while (values[i] < pivot) i++
      while (values[j] > pivot) j--
      if (i <= j) {
        const t = values[i]
        values[i] = values[j]
        values[j] = t
        i++
        j--
      }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else return values[k]
  }
  return values[k]
}

/**
 * Motion likelihood from the mean absolute channel difference to the running background
 * (scaled by the illumination gain, see illuminationGain), plus the un-mixed colour of
 * moving pixels (see unmixedColourLikelihood).
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
  gain = 1,
): MotionMaps {
  const motion = new Float32Array(grid.width * grid.height)
  const effective = colour.slice()
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = y * grid.width + x
      const bgR = gain * background.r[i]
      const bgG = gain * background.g[i]
      const bgB = gain * background.b[i]
      const diff = (Math.abs(grid.r[i] - bgR) + Math.abs(grid.g[i] - bgG) + Math.abs(grid.b[i] - bgB)) / 3
      const m = smoothstep(lowLevels, highLevels, diff)
      if (m <= 0) continue
      if (colour[i] < 0.9 && diff >= highLevels / 2) {
        const unmixed = unmixedColourLikelihood(grid.r[i], grid.g[i], grid.b[i], bgR, bgG, bgB, model)
        if (unmixed > effective[i]) effective[i] = unmixed
      }
      if (effective[i] <= 0) continue
      const backgroundColour = ballColourLikelihood(Math.min(255, bgR), Math.min(255, bgG), Math.min(255, bgB), model)
      motion[i] = m * smoothstep(-0.35, -0.1, effective[i] - backgroundColour)
    }
  }
  return { motion, colour: effective }
}

/**
 * 3x3 maximum filter inside rect; closes noise holes in the motion map of a slow ball.
 * Separable (row maxima, then column maxima of those), which gives the same maxima with
 * fewer reads. Values are >= 0 (motion likelihoods), so the result is floored at 0 as before.
 */
export function dilateMax3x3(map: Float32Array, width: number, rect: CellRect): Float32Array {
  const out = new Float32Array(map.length)
  const w = rect.x1 - rect.x0
  const h = rect.y1 - rect.y0
  if (w <= 0 || h <= 0) return out
  // Horizontal pass into a rect-sized buffer.
  const row = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const src = (rect.y0 + y) * width + rect.x0
    const dst = y * w
    for (let x = 0; x < w; x++) {
      let best = map[src + x]
      if (x > 0 && map[src + x - 1] > best) best = map[src + x - 1]
      if (x < w - 1 && map[src + x + 1] > best) best = map[src + x + 1]
      row[dst + x] = best > 0 ? best : 0
    }
  }
  // Vertical pass.
  for (let y = 0; y < h; y++) {
    const dst = (rect.y0 + y) * width + rect.x0
    const mid = y * w
    const up = mid - w
    const down = mid + w
    for (let x = 0; x < w; x++) {
      let best = row[mid + x]
      if (y > 0 && row[up + x] > best) best = row[up + x]
      if (y < h - 1 && row[down + x] > best) best = row[down + x]
      out[dst + x] = best
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
  /** Running background (grid resolution), for un-mixing moving full-resolution pixels. */
  background: GridFrame | null
  /** Illumination gain of this frame over the background (see illuminationGain). */
  backgroundGain: number
  /** Mean channel difference from the background above which a pixel is un-mixed. */
  unmixMinLevels: number
  expectedRadiusPx: number | null
  model: ColourModel
  motionFloor: number
  maxStreakRatio: number
  sizePrior: SizePrior
  /** Plain support ramp (see DetectorOptions.plainSupportLow / plainSupportHigh). */
  plainSupportLow: number
  plainSupportHigh: number
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
      supportRatio: Number.NaN,
      plainSupportRatio: Number.NaN,
    },
  }
}

/**
 * Full-resolution pass over the blob's bounding box (plus one cell):
 *  - centroid: likelihood-weighted, weights (likelihood - 0.15)+ so blurred edges contribute
 *    symmetrically;
 *  - support: pixels that are ball-coloured at full resolution (plain colour, or un-mixed
 *    against the background for moving pixels, >= 0.5) over the footprint the blob implies
 *    (disc plus streak capsule). A real ball fills most of its footprint. Box-averaging at the
 *    grid scale can make yellow-green out of two other colours (tan skin over green foliage or
 *    a green windscreen); at full resolution that is only a 1-2 px seam, so its support is low.
 */
function refineAtFullResolution(
  stats: BlobStats,
  cellCx: number,
  cellCy: number,
  ctx: ScoringContext,
): { x: number; y: number; support: number; plainSupport: number } {
  const { image, grid, background } = ctx
  const f = grid.factor
  const x0 = Math.max(0, (stats.minX - 1) * f)
  const y0 = Math.max(0, (stats.minY - 1) * f)
  const x1 = Math.min(image.width, (stats.maxX + 2) * f)
  const y1 = Math.min(image.height, (stats.maxY + 2) * f)
  let sw = 0
  let sx = 0
  let sy = 0
  let ballPixels = 0
  let plainPixels = 0
  for (let y = y0; y < y1; y++) {
    const cellY = Math.min(grid.height - 1, Math.floor(y / f))
    for (let x = x0; x < x1; x++) {
      const p = (y * image.width + x) * 4
      const r = image.data[p]
      const g = image.data[p + 1]
      const b = image.data[p + 2]
      const cellX = Math.min(grid.width - 1, Math.floor(x / f))
      const cell = cellY * grid.width + cellX
      let l = ballColourLikelihood(r, g, b, ctx.model)
      let effective = l
      if (effective < 0.5 && background) {
        const k = ctx.backgroundGain
        const bgR = k * background.r[cell]
        const bgG = k * background.g[cell]
        const bgB = k * background.b[cell]
        const diff = (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)) / 3
        if (diff >= ctx.unmixMinLevels) effective = Math.max(effective, unmixedColourLikelihood(r, g, b, bgR, bgG, bgB, ctx.model))
      }
      if (effective >= 0.5) ballPixels++
      if (l >= 0.5) plainPixels++
      if (l <= 0.15) continue
      if (ctx.motion) l *= ctx.motionFloor + (1 - ctx.motionFloor) * ctx.motion[cell]
      const w = l - 0.15
      if (w <= 0) continue
      sw += w
      sx += w * (x + 0.5)
      sy += w * (y + 0.5)
    }
  }
  const shape = blobShape(stats)
  const radiusPx = Math.max(shape.radius * f, 1)
  const footprint = Math.PI * radiusPx * radiusPx + 2 * radiusPx * shape.streakLength * f
  const support = ballPixels / footprint
  const plainSupport = plainPixels / footprint
  if (sw < 0.5) return { x: cellCx * f, y: cellCy * f, support, plainSupport }
  return { x: sx / sw, y: sy / sw, support, plainSupport }
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
  detect(
    frame: DetectorFrame,
    overrides: Pick<DetectorOptions, 'roi' | 'expectedRadiusNorm' | 'sizePrior' | 'plainSupportLow' | 'plainSupportHigh'> = {},
  ): BallCandidate[] {
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
    const gain = this.background && inOrder && opts.compensateIllumination ? illuminationGain(grid, this.background) : 1
    const maps =
      this.background && inOrder
        ? motionMaps(grid, this.background, pixelColour, rect, model, opts.motionLowLevels, opts.motionHighLevels, gain)
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
      background: maps ? this.background : null,
      backgroundGain: gain,
      unmixMinLevels: opts.motionHighLevels / 2,
      expectedRadiusPx,
      model,
      motionFloor: opts.motionFloor,
      maxStreakRatio: opts.maxStreakRatio,
      sizePrior: opts.sizePrior ?? DEFAULT_SIZE_PRIOR,
      plainSupportLow: opts.plainSupportLow,
      plainSupportHigh: opts.plainSupportHigh,
    }
    // Score every blob on coarse moments; the best few are checked and refined at full
    // resolution, where the support term joins the score.
    const scored: ScoredBlob[] = []
    for (const stats of blobs) {
      const blob = scoreBlob(stats, ctx)
      if (blob && blob.candidate.score >= opts.minScore) scored.push(blob)
    }
    scored.sort((a, b) => b.candidate.score - a.candidate.score)
    const candidates: BallCandidate[] = []
    for (const blob of scored.slice(0, SUPPORT_CHECK_FACTOR * opts.maxCandidates)) {
      const refined = refineAtFullResolution(blob.stats, blob.cellCx, blob.cellCy, ctx)
      const score = blob.candidate.score * smoothstep(ctx.plainSupportLow, ctx.plainSupportHigh, refined.plainSupport)
      if (score < opts.minScore) continue
      candidates.push({ ...blob.candidate, x: refined.x / image.width, y: refined.y / image.height, score, supportRatio: refined.support, plainSupportRatio: refined.plainSupport })
    }
    candidates.sort((a, b) => b.score - a.score)
    candidates.splice(opts.maxCandidates)

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
