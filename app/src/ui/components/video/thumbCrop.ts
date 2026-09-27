/**
 * Player-cropped key-frame thumbnails (DESIGN §8.9). Stored thumbnails are the whole frame, where the
 * player is small (about a fifth of the frame height in the D1 portrait set-up). The strip shows a crop
 * around the tracked body at that frame instead, at one scale for the whole serve (1.45 standing
 * heights tall, larger only when the body box needs it), so the player reads at the same size in every
 * thumbnail. Pure functions, unit-tested.
 */
import type { PoseTrackCompact } from '../../../data/domain.ts'
import type { Size } from './geometry.ts'
import { landmarksAt } from './tracks.ts'

/** A rectangle normalised to the displayed frame (x / width, y / height). */
export interface NRect {
  x: number
  y: number
  w: number
  h: number
}

/** Bounding box of the landmarks tracked with visibility ≥ minV at `frame` (normalised), or null. */
export function bodyBoxAt(pose: PoseTrackCompact | undefined, frame: number, minV = 0.5): NRect | null {
  const lm = landmarksAt(pose, frame)
  if (!lm) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  let n = 0
  for (const p of lm) {
    if (!p || p.v < minV) continue
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
    n++
  }
  // A handful of points is not a body (a stray detection).
  if (n < 8 || x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Crop height in standing heights: head room above a raised hand and a little floor below the feet. */
export const THUMB_CROP_HEIGHTS = 1.45

/**
 * The crop for one thumbnail, with the thumbnail's aspect ratio in pixels, or null when the body is not
 * tracked at that frame or the crop would be nearly the whole frame (then the whole frame is shown).
 */
export function thumbCrop(opts: {
  pose: PoseTrackCompact | undefined
  frame: number
  /** Standing height as a fraction of the frame height. */
  bodyHeightNorm: number | null | undefined
  clip: Size
  /** Thumbnail box in CSS pixels (50 × 88 or 88 × 50). */
  thumb: Size
}): NRect | null {
  const { clip, thumb } = opts
  if (!clip.width || !clip.height || !thumb.width || !thumb.height) return null
  const box = bodyBoxAt(opts.pose, opts.frame)
  if (!box) return null
  const bh = opts.bodyHeightNorm && opts.bodyHeightNorm > 0 ? opts.bodyHeightNorm : box.h
  const toX = clip.height / clip.width // a length in frame heights, as a fraction of the frame width
  // Landmarks stop at the eyes and the foot points: pad for the top of the head, the shoe and the sides.
  const padded = {
    x0: box.x - 0.08 * bh * toX,
    x1: box.x + box.w + 0.08 * bh * toX,
    y0: box.y - 0.12 * bh,
    y1: box.y + box.h + 0.04 * bh,
  }
  const aspect = thumb.width / thumb.height
  let hPx = Math.max(padded.y1 - padded.y0, THUMB_CROP_HEIGHTS * bh) * clip.height
  let wPx = hPx * aspect
  const needW = (padded.x1 - padded.x0) * clip.width
  if (wPx < needW) {
    wPx = needW
    hPx = wPx / aspect
  }
  // Never larger than the frame; keep the thumbnail's aspect.
  const fit = Math.min(1, clip.width / wPx, clip.height / hPx)
  wPx *= fit
  hPx *= fit
  const w = wPx / clip.width
  const h = hPx / clip.height
  if (w > 0.9 && h > 0.9) return null
  const cx = (padded.x0 + padded.x1) / 2
  const cy = (padded.y0 + padded.y1) / 2
  return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w, h }
}

/**
 * CSS box for the <img> so that `crop` (normalised to the frame) fills a `box`-sized thumbnail. The
 * stored image may itself be a crop of the frame (`imageCrop`, KeyFrameRecord.crop).
 */
export function cropImageStyle(crop: NRect, imageCrop: NRect | undefined, box: Size): { width: number; height: number; left: number; top: number } {
  const c = imageCrop ?? { x: 0, y: 0, w: 1, h: 1 }
  const rw = Math.min(1, crop.w / c.w)
  const rh = Math.min(1, crop.h / c.h)
  const rx = clamp((crop.x - c.x) / c.w, 0, 1 - rw)
  const ry = clamp((crop.y - c.y) / c.h, 0, 1 - rh)
  const width = box.width / rw
  const height = box.height / rh
  return { width, height, left: -rx * width, top: -ry * height }
}
