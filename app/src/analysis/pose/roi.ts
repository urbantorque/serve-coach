/**
 * Region-of-interest (ROI) cropping for players who are small in the frame.
 *
 * MediaPipe's person detector sees the whole input squeezed to 224x224. In a portrait
 * 1080x1920 frame a player 7-12 m away is 280-430 px tall, i.e. 30-50 px at detector
 * resolution, and is often missed or mislocated. Feeding a square crop around the player
 * makes the player fill most of the detector input again.
 *
 * This module is pure (no DOM): crop geometry, the exact crop -> frame landmark mapping,
 * the localisation tile plan, and RoiController, which turns the tracked server pose of
 * earlier frames into a smoothed crop for the next frame.
 *
 * Units: crops are integer pixel rectangles in the source image (createImageBitmap takes
 * integer source rectangles, so the mapping uses exactly the pixels that were cropped).
 * Landmarks are normalised to the image they were detected in.
 */
import { LM, type Landmark } from '../types.ts'
import { ANTHROPOMETRY, estimateFloorY, estimateHeadTopY } from './body.ts'
import { clamp, isUsable, landmarkMidpoint } from './landmarks.ts'
import type { PoseCandidate } from './tracking.ts'

export interface FrameSize {
  width: number
  height: number
}

/** Integer pixel rectangle in the source image, origin top-left. */
export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Crop <-> frame mapping
// ---------------------------------------------------------------------------

/**
 * Maps one landmark detected in `crop` to full-frame normalised coordinates.
 * x and y are normalised by the crop's own width and height. MediaPipe's z uses "roughly
 * the same scale as x", i.e. input width, so it is rescaled from crop width to frame width.
 */
export function cropLandmarkToFrame(lm: Landmark, crop: PixelRect, frame: FrameSize): Landmark {
  const out: Landmark = {
    ...lm,
    x: (crop.x + lm.x * crop.width) / frame.width,
    y: (crop.y + lm.y * crop.height) / frame.height,
  }
  if (lm.z !== undefined) out.z = (lm.z * crop.width) / frame.width
  return out
}

/** Inverse of cropLandmarkToFrame for x and y (tests and debugging overlays). */
export function frameLandmarkToCrop(lm: Landmark, crop: PixelRect, frame: FrameSize): Landmark {
  const out: Landmark = {
    ...lm,
    x: (lm.x * frame.width - crop.x) / crop.width,
    y: (lm.y * frame.height - crop.y) / crop.height,
  }
  if (lm.z !== undefined) out.z = (lm.z * frame.width) / crop.width
  return out
}

/** Maps a whole candidate. World landmarks are metric and hip-centred, so they are unchanged. */
export function cropCandidateToFrame(candidate: PoseCandidate, crop: PixelRect, frame: FrameSize): PoseCandidate {
  return { ...candidate, landmarks: candidate.landmarks.map((lm) => cropLandmarkToFrame(lm, crop, frame)) }
}

export function isFullFrame(rect: PixelRect, frame: FrameSize): boolean {
  return rect.x === 0 && rect.y === 0 && rect.width === frame.width && rect.height === frame.height
}

// ---------------------------------------------------------------------------
// Square crop geometry
// ---------------------------------------------------------------------------

/**
 * Integer rectangle for a square of `sidePx` centred at (cx, cy), moved (not shrunk) to lie
 * inside the frame. A side larger than a frame dimension is clamped to that dimension, so
 * the crop becomes a rectangle (MediaPipe letterboxes non-square inputs itself).
 */
export function squareCropInFrame(cxPx: number, cyPx: number, sidePx: number, frame: FrameSize): PixelRect {
  const width = Math.max(1, Math.min(frame.width, Math.round(sidePx)))
  const height = Math.max(1, Math.min(frame.height, Math.round(sidePx)))
  const x = Math.round(clamp(cxPx - width / 2, 0, frame.width - width))
  const y = Math.round(clamp(cyPx - height / 2, 0, frame.height - height))
  return { x, y, width, height }
}

/** Fraction of rect `inner` (clipped to the frame) that lies inside `outer`. */
export function coveredFraction(inner: PixelRect, outer: PixelRect): number {
  const ix = Math.max(0, Math.min(inner.x + inner.width, outer.x + outer.width) - Math.max(inner.x, outer.x))
  const iy = Math.max(0, Math.min(inner.y + inner.height, outer.y + outer.height) - Math.max(inner.y, outer.y))
  const area = inner.width * inner.height
  return area > 0 ? (ix * iy) / area : 0
}

// ---------------------------------------------------------------------------
// Localisation tiles
// ---------------------------------------------------------------------------

/**
 * Evenly spaced start offsets for tiles of `tile` px along a `length` px axis, so that
 * consecutive tiles overlap by at least `minOverlap` of a tile.
 */
export function tileOffsets(length: number, tile: number, minOverlap: number): number[] {
  if (tile >= length) return [0]
  const maxStride = tile * (1 - minOverlap)
  const count = Math.ceil((length - tile) / maxStride) + 1
  return Array.from({ length: count }, (_, i) => Math.round((i * (length - tile)) / (count - 1)))
}

/**
 * Localisation tiles for one level, coarse to fine:
 *  - level 0: the full frame;
 *  - level 1: squares of the short side along the long axis (3 for 9:16), >= 1/3 overlap;
 *  - level n >= 2: squares of short side / n over the whole frame, >= 1/3 overlap.
 * Anything no longer than the overlap between neighbouring tiles (at least minOverlap of a
 * side; 660 px for level 1 of 1080x1920) lies whole inside one tile. Larger people are
 * found at the coarser level, and the detector keys on the head and upper body anyway.
 */
export function localisationTiles(frame: FrameSize, level: number, minOverlap = 1 / 3): PixelRect[] {
  const full: PixelRect = { x: 0, y: 0, width: frame.width, height: frame.height }
  if (level <= 0) return [full]
  const shortSide = Math.min(frame.width, frame.height)
  const side = Math.max(1, Math.round(shortSide / level))
  if (level === 1 && frame.width === frame.height) return []
  const tiles: PixelRect[] = []
  for (const y of tileOffsets(frame.height, side, minOverlap)) {
    for (const x of tileOffsets(frame.width, side, minOverlap)) tiles.push({ x, y, width: side, height: side })
  }
  return tiles
}

// ---------------------------------------------------------------------------
// Body extent in pixels
// ---------------------------------------------------------------------------

/** Landmarks that bound the body without the arms (arms move far more than the body). */
const TRUNK_AND_LEGS: readonly LM[] = [
  LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
  LM.LEFT_HIP, LM.RIGHT_HIP, LM.LEFT_KNEE, LM.RIGHT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
  LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX,
]

export interface BodyExtentPx {
  /** Arm-free horizontal extent. */
  left: number
  right: number
  /** Estimated top of the head and floor (sole) level. */
  top: number
  bottom: number
  /** Stature estimate: max(top-to-floor, torso length / 0.29). Robust to crouching and missing feet. */
  staturePx: number
}

/**
 * Arm-free body extent in pixels from full-frame normalised landmarks, or null when too few
 * joints are usable (needs both shoulders and both hips).
 */
export function bodyExtentPx(landmarks: readonly Landmark[], frame: FrameSize, minVisibility = 0.3): BodyExtentPx | null {
  const shoulders = landmarkMidpoint(landmarks, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, minVisibility)
  const hips = landmarkMidpoint(landmarks, LM.LEFT_HIP, LM.RIGHT_HIP, minVisibility)
  if (!shoulders || !hips) return null
  const aspect = frame.width / frame.height
  const torsoPx = Math.hypot((shoulders.x - hips.x) * frame.width, (shoulders.y - hips.y) * frame.height)
  const statureFromTorso = torsoPx / ANTHROPOMETRY.torsoPerStature

  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const i of TRUNK_AND_LEGS) {
    const lm = landmarks[i]
    if (!isUsable(lm, minVisibility)) continue
    left = Math.min(left, lm.x * frame.width)
    right = Math.max(right, lm.x * frame.width)
    top = Math.min(top, lm.y * frame.height)
    bottom = Math.max(bottom, lm.y * frame.height)
  }
  const headTop = estimateHeadTopY(landmarks, aspect, minVisibility)
  if (headTop) top = Math.min(top, headTop.y * frame.height)
  else top = Math.min(top, (shoulders.y * frame.height) - 0.2 * statureFromTorso) // shoulder-to-vertex ~0.18 H
  const floor = estimateFloorY(landmarks, aspect, minVisibility)
  if (floor !== null) bottom = Math.max(bottom, floor * frame.height)
  else bottom = Math.max(bottom, hips.y * frame.height + 0.53 * statureFromTorso) // hip joint ~0.53 H above floor
  const staturePx = Math.max(bottom - top, statureFromTorso)
  return { left, right, top, bottom, staturePx }
}

// ---------------------------------------------------------------------------
// Target crop and the per-frame controller
// ---------------------------------------------------------------------------

export interface RoiOptions {
  /** Space above the head top, in statures: the raised hitting arm at contact, the jump and part of the racket. */
  headroom: number
  /** Space below the soles, in statures. */
  footroom: number
  /** Minimum space either side of the arm-free body, in statures (tossing arm, racket drop). */
  sideroom: number
  /** Smallest crop side: max(minSidePx, minSideFraction x frame short side). */
  minSidePx: number
  minSideFraction: number
  /** Re-centre only when the target centre is more than this fraction of the side away (anti-jitter). */
  centreDeadband: number
  /** Shrink only when the target side is this fraction smaller than the current side. */
  sizeDeadband: number
  /** Grow only when the target side is this fraction larger (the containment check still applies). */
  growDeadband: number
  /** Time constant (s) of the glide toward the target centre once outside the deadband. */
  followTimeS: number
  /** Time constant (s) for shrinking. Growing is immediate so a crouch or a stride never cuts the crop. */
  shrinkTimeS: number
  /** Per-frame statures are median-filtered over this window (s) to reject single-frame outliers. */
  statureMedianS: number
  /** Time constant (s) with which the remembered stature relaxes down to a smaller measurement. */
  statureMemoryS: number
  /** While the server is missing, the crop side grows by this factor per second. */
  lostGrowthPerS: number
  /** Missing this long (s): drop the ROI and localise again. */
  relocaliseAfterS: number
  /** Between localisation attempts while searching (s); doubles after each failed attempt... */
  searchIntervalS: number
  /** ...up to this (s), so an empty scene does not cost a full localisation 4 times a second. */
  maxSearchIntervalS: number
  /** Landmark visibility needed to use a joint for the body extent. */
  minVisibility: number
}

export const DEFAULT_ROI_OPTIONS: RoiOptions = {
  headroom: 0.6,
  footroom: 0.1,
  sideroom: 0.35,
  minSidePx: 160,
  minSideFraction: 0.2,
  centreDeadband: 0.06,
  sizeDeadband: 0.15,
  growDeadband: 0.04,
  followTimeS: 0.08,
  shrinkTimeS: 0.8,
  statureMedianS: 0.3,
  statureMemoryS: 1.5,
  lostGrowthPerS: 1.5,
  relocaliseAfterS: 0.4,
  searchIntervalS: 0.25,
  maxSearchIntervalS: 1,
  minVisibility: 0.3,
}

/** Square region (float pixels) before clamping. */
export interface SquareRegion {
  cx: number
  cy: number
  side: number
}

export function minCropSide(frame: FrameSize, options: Pick<RoiOptions, 'minSidePx' | 'minSideFraction'>): number {
  return Math.max(options.minSidePx, options.minSideFraction * Math.min(frame.width, frame.height))
}

/**
 * The square the controller aims for, from a body extent and a (remembered) stature: it
 * spans `footroom` statures below the soles to `headroom` above a standing head (so a
 * crouch does not shrink it), is at least as wide as the arm-free body plus `sideroom`
 * each side, and is centred on the body horizontally.
 */
export function targetSquare(extent: BodyExtentPx, staturePx: number, frame: FrameSize, options: RoiOptions): SquareRegion {
  const bottom = extent.bottom + options.footroom * staturePx
  const vertical = (1 + options.headroom + options.footroom) * staturePx
  const horizontal = extent.right - extent.left + 2 * options.sideroom * staturePx
  const side = Math.max(vertical, horizontal, minCropSide(frame, options))
  return { cx: (extent.left + extent.right) / 2, cy: bottom - vertical / 2, side }
}

/** Median of the samples within `windowS` of the newest one (a robust, short-lag level). */
function rollingMedian(samples: Array<{ tReal: number; value: number }>, windowS: number): number {
  const newest = samples[samples.length - 1].tReal
  while (samples.length > 1 && newest - samples[0].tReal > windowS + 1e-9) samples.shift()
  const sorted = samples.map((s) => s.value).sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export type RoiState = 'searching' | 'tracking'

/**
 * Per-frame ROI from the tracked server pose.
 *
 * Call cropFor(t) before submitting a frame and observe(landmarks | null, t) once that
 * frame's server pose is known. With pipelining the crop for frame n is based on frames
 * up to n - maxInFlight; the margins absorb that lag (2 frames at 30 fps is ~0.05 statures
 * of body travel in a serve jump).
 *
 * Anti-jitter: the side grows at once past a small deadband but shrinks slowly and only
 * past a larger one; the centre moves only when the body leaves a deadband around it, then
 * glides. A containment check overrides both, so the arm-free body plus half the margins
 * always stays inside.
 */
export class RoiController {
  readonly options: RoiOptions
  private region: SquareRegion | null = null
  private staturePx = 0
  private readonly statureSamples: Array<{ tReal: number; value: number }> = []
  private lastObservedT: number | null = null
  private lastUpdateT: number | null = null
  private lostSinceT: number | null = null
  private lastSearchT: number | null = null
  private failedSearches = 0

  constructor(
    readonly frame: FrameSize,
    options: Partial<RoiOptions> = {},
  ) {
    this.options = { ...DEFAULT_ROI_OPTIONS, ...options }
  }

  get state(): RoiState {
    return this.region ? 'tracking' : 'searching'
  }

  /** Seconds between localisation attempts now: the base interval, doubled per consecutive failure, capped. */
  searchIntervalS(): number {
    const { searchIntervalS, maxSearchIntervalS } = this.options
    return Math.min(maxSearchIntervalS, searchIntervalS * 2 ** Math.max(0, this.failedSearches - 1))
  }

  /** True when a localisation attempt is due (searching, and none within the current interval). */
  shouldSearch(tReal: number): boolean {
    return this.region === null && (this.lastSearchT === null || tReal - this.lastSearchT >= this.searchIntervalS() - 1e-9)
  }

  /** Records a localisation attempt; call after start() when it found the server. */
  markSearched(tReal: number): void {
    this.lastSearchT = tReal
    this.failedSearches = this.region === null ? this.failedSearches + 1 : 0
  }

  /** Starts tracking from a localised pose (full-frame normalised landmarks). */
  start(landmarks: readonly Landmark[], tReal: number): boolean {
    const extent = bodyExtentPx(landmarks, this.frame, this.options.minVisibility)
    if (!extent) return false
    this.staturePx = extent.staturePx
    this.statureSamples.length = 0
    this.statureSamples.push({ tReal, value: extent.staturePx })
    this.region = targetSquare(extent, this.staturePx, this.frame, this.options)
    this.lastObservedT = tReal
    this.lastUpdateT = tReal
    this.lostSinceT = null
    return true
  }

  /** The crop to use for a frame at tReal, or null while searching. */
  cropFor(tReal: number): PixelRect | null {
    if (!this.region) return null
    let side = this.region.side
    if (this.lostSinceT !== null) side *= this.options.lostGrowthPerS ** Math.max(0, tReal - this.lostSinceT)
    return squareCropInFrame(this.region.cx, this.region.cy, side, this.frame)
  }

  /** The unclamped square currently tracked (null while searching). */
  currentRegion(): SquareRegion | null {
    return this.region ? { ...this.region } : null
  }

  /**
   * Feeds the server pose found in a processed frame (full-frame normalised), or null when
   * the server was not found. Frames must be observed in time order.
   */
  observe(landmarks: readonly Landmark[] | null, tReal: number): void {
    if (!this.region) return
    const extent = landmarks ? bodyExtentPx(landmarks, this.frame, this.options.minVisibility) : null
    if (!extent) {
      this.lostSinceT ??= tReal
      if (this.lastObservedT !== null && tReal - this.lastObservedT >= this.options.relocaliseAfterS - 1e-9) this.drop()
      return
    }
    if (this.lostSinceT !== null) {
      // Keep the grown side that found the server again; it shrinks back gradually.
      this.region.side *= this.options.lostGrowthPerS ** Math.max(0, tReal - this.lostSinceT)
      this.lostSinceT = null
    }
    const dt = this.lastUpdateT === null ? 0 : Math.max(0, tReal - this.lastUpdateT)
    this.lastUpdateT = tReal
    this.lastObservedT = tReal

    const o = this.options
    const relax = (timeS: number) => (timeS > 0 ? 1 - Math.exp(-dt / timeS) : 1)
    this.statureSamples.push({ tReal, value: extent.staturePx })
    const measured = rollingMedian(this.statureSamples, o.statureMedianS)
    this.staturePx = measured >= this.staturePx ? measured : this.staturePx + (measured - this.staturePx) * relax(o.statureMemoryS)
    const target = targetSquare(extent, this.staturePx, this.frame, o)
    const region = this.region

    if (target.side > region.side * (1 + o.growDeadband)) region.side = target.side
    else if (target.side < region.side * (1 - o.sizeDeadband)) region.side += (target.side - region.side) * relax(o.shrinkTimeS)

    const offset = Math.hypot(target.cx - region.cx, target.cy - region.cy)
    if (offset > o.centreDeadband * region.side) {
      const k = relax(o.followTimeS)
      region.cx += (target.cx - region.cx) * k
      region.cy += (target.cy - region.cy) * k
    }
    this.contain(extent)
  }

  /** Forget the ROI (e.g. after a scene cut); the next frame starts a new search. */
  reset(): void {
    this.drop()
    this.lastSearchT = null
  }

  private drop(): void {
    this.region = null
    this.failedSearches = 0
    this.lostSinceT = null
    this.lastObservedT = null
    this.lastUpdateT = null
  }

  /** Moves the square so the arm-free body plus half the margins is inside it (when it fits). */
  private contain(extent: BodyExtentPx): void {
    const region = this.region!
    const o = this.options
    const need = {
      left: extent.left - 0.5 * o.sideroom * this.staturePx,
      right: extent.right + 0.5 * o.sideroom * this.staturePx,
      top: extent.top - 0.5 * o.headroom * this.staturePx,
      bottom: extent.bottom + 0.5 * o.footroom * this.staturePx,
    }
    const half = region.side / 2
    const shift = (lo: number, hi: number, centre: number) => {
      if (hi - lo > 2 * half) return (lo + hi) / 2
      if (lo < centre - half) return lo + half
      if (hi > centre + half) return hi - half
      return centre
    }
    region.cx = shift(need.left, need.right, region.cx)
    region.cy = shift(need.top, need.bottom, region.cy)
  }
}
