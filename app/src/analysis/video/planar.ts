/**
 * CPU pixel path for decoded frames that live in CPU memory (software decode, DecodeOptions
 * hardwareAcceleration 'prefer-software'): VideoFrame.copyTo of one crop rectangle in the frame's
 * own YUV layout, which is a memory copy with no GPU readback, and a pure YUV -> RGBA conversion
 * that applies the display rotation and an optional integer box downscale in the same pass.
 *
 * Why (measured 2026-09-27, headless Edge 154, Intel Arc 130V, 864 x 1344 crop of a 1080 x 1920
 * frame): the GPU path (createImageBitmap crop -> worker canvas -> getImageData) cost 8 ms a frame
 * alone and about 50 ms while the pose worker kept the GPU busy; copyTo of a software-decoded
 * I420 frame cost 1.2 ms and never touches the GPU. The conversion runs in the ball worker.
 *
 * Only 8-bit I420 / NV12 in a BT.601 / BT.709 matrix with an SDR transfer take this path (anything
 * else, e.g. 10-bit HDR, returns null from copyCrop and the caller keeps the GPU path), so the RGB
 * matches what the browser's own conversion gives to within rounding.
 */
import type { ImageDataLike } from '../types.ts'
import type { RotationDeg } from './rotation.ts'

export type PlanarFormat = 'I420' | 'NV12'

/** A crop of one frame in coded orientation, as copied by VideoFrame.copyTo (transferable). */
export interface PlanarCrop {
  kind: 'planar'
  format: PlanarFormat
  /** Crop size in coded pixels (even). */
  codedWidth: number
  codedHeight: number
  data: Uint8Array
  /** Per plane: byte offset and row stride in `data` (Y, then U and V, or interleaved UV). */
  layout: { offset: number; stride: number }[]
  /** Luma weights of the YUV matrix. */
  kr: number
  kb: number
  fullRange: boolean
  /** Clockwise rotation from coded to display orientation. */
  rotationDeg: RotationDeg
  /** Integer box downscale applied during conversion (1 = none). */
  downscale: number
}

export function isPlanarCrop(value: unknown): value is PlanarCrop {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'planar'
}

/** Luma weights for a VideoColorSpace matrix; null for matrices this path does not handle. */
export function matrixWeights(matrix: string | null | undefined): { kr: number; kb: number } | null {
  switch (matrix ?? 'bt709') {
    case 'bt709':
      return { kr: 0.2126, kb: 0.0722 }
    case 'bt470bg':
    case 'smpte170m':
      return { kr: 0.299, kb: 0.114 }
    default:
      return null
  }
}

/** Transfer functions of SDR video (the browser's own conversion leaves these values as coded). */
const SDR_TRANSFERS = new Set(['bt709', 'smpte170m', 'iec61966-2-1', 'bt470bg', 'bt601'])

/** Display size of a coded crop after rotation and downscale. */
export function planarOutputSize(crop: Pick<PlanarCrop, 'codedWidth' | 'codedHeight' | 'rotationDeg' | 'downscale'>): { width: number; height: number } {
  const turned = crop.rotationDeg === 90 || crop.rotationDeg === 270
  const k = Math.max(1, Math.floor(crop.downscale))
  const w = turned ? crop.codedHeight : crop.codedWidth
  const h = turned ? crop.codedWidth : crop.codedHeight
  return { width: Math.max(1, Math.floor(w / k)), height: Math.max(1, Math.floor(h / k)) }
}

/** Plane access and the YUV -> RGB coefficients of a crop. */
function planes(crop: PlanarCrop) {
  const { layout } = crop
  const nv12 = crop.format === 'NV12'
  // Y' = (Y - y0) * ys; C' = (C - 128) * cs; R = Y' + rv V', G = Y' - gu U' - gv V', B = Y' + bu U'.
  const { kr, kb } = crop
  const kg = 1 - kr - kb
  const cs = crop.fullRange ? 1 : 255 / 224
  return {
    yOff: layout[0].offset,
    yStride: layout[0].stride,
    uOff: layout[1].offset,
    uStride: layout[1].stride,
    vOff: nv12 ? layout[1].offset + 1 : layout[2].offset,
    vStride: nv12 ? layout[1].stride : layout[2].stride,
    cStep: nv12 ? 2 : 1,
    y0: crop.fullRange ? 0 : 16,
    ys: crop.fullRange ? 1 : 255 / 219,
    rv: 2 * (1 - kr) * cs,
    bu: 2 * (1 - kb) * cs,
    gu: ((2 * kb * (1 - kb)) / kg) * cs,
    gv: ((2 * kr * (1 - kr)) / kg) * cs,
  }
}

/** Display pixel (dx, dy) of a crop (before its downscale) -> coded pixel. */
function codedX(rot: RotationDeg, cw: number, dx: number, dy: number): number {
  return rot === 90 ? dy : rot === 180 ? cw - 1 - dx : rot === 270 ? cw - 1 - dy : dx
}
function codedY(rot: RotationDeg, ch: number, dx: number, dy: number): number {
  return rot === 90 ? ch - 1 - dx : rot === 180 ? ch - 1 - dy : rot === 270 ? dx : dy
}

/**
 * YUV -> RGBA (alpha 255) in display orientation. With downscale k each output pixel is the mean
 * of a k x k block of display pixels (the YUV is averaged, then converted: the conversion is
 * affine, so this equals averaging RGB except where a channel clips).
 */
export function planarToRgba(crop: PlanarCrop): ImageDataLike {
  const { width, height } = planarOutputSize(crop)
  return { width, height, data: planarRegionToRgba(crop, 0, 0, width, height).data }
}

/**
 * RGBA of the output-pixel rectangle [x0, x1) x [y0, y1) (clipped to the output), row-major with
 * the rectangle's width as stride. The ball detector converts only the few boxes it refines.
 */
export function planarRegionToRgba(
  crop: PlanarCrop,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { data: Uint8ClampedArray; x0: number; y0: number; width: number; height: number } {
  const size = planarOutputSize(crop)
  const ax = Math.max(0, Math.min(size.width, Math.floor(x0)))
  const ay = Math.max(0, Math.min(size.height, Math.floor(y0)))
  const bx = Math.max(ax, Math.min(size.width, Math.ceil(x1)))
  const by = Math.max(ay, Math.min(size.height, Math.ceil(y1)))
  const width = bx - ax
  const height = by - ay
  const out = new Uint8ClampedArray(width * height * 4)
  const { data, codedWidth: cw, codedHeight: ch, rotationDeg: rot } = crop
  const k = Math.max(1, Math.floor(crop.downscale))
  const { yOff, yStride, uOff, uStride, vOff, vStride, cStep, y0: yBlack, ys, rv, bu, gu, gv } = planes(crop)
  let o = 0
  if (rot === 0 && k === 1) {
    // Fast path: rows map to rows.
    for (let y = ay; y < by; y++) {
      const yRow = yOff + y * yStride
      const uRow = uOff + (y >> 1) * uStride
      const vRow = vOff + (y >> 1) * vStride
      for (let x = ax; x < bx; x++, o += 4) {
        const Y = (data[yRow + x] - yBlack) * ys
        const c = (x >> 1) * cStep
        const U = data[uRow + c] - 128
        const V = data[vRow + c] - 128
        out[o] = Y + rv * V
        out[o + 1] = Y - gu * U - gv * V
        out[o + 2] = Y + bu * U
        out[o + 3] = 255
      }
    }
    return { data: out, x0: ax, y0: ay, width, height }
  }
  const inv = 1 / (k * k)
  for (let oy = ay; oy < by; oy++) {
    for (let ox = ax; ox < bx; ox++, o += 4) {
      let sy = 0
      let su = 0
      let sv = 0
      for (let dyk = 0; dyk < k; dyk++) {
        const dy = oy * k + dyk
        for (let dxk = 0; dxk < k; dxk++) {
          const dx = ox * k + dxk
          const px = codedX(rot, cw, dx, dy)
          const py = codedY(rot, ch, dx, dy)
          sy += data[yOff + py * yStride + px]
          const c = (px >> 1) * cStep
          su += data[uOff + (py >> 1) * uStride + c]
          sv += data[vOff + (py >> 1) * vStride + c]
        }
      }
      const Y = (sy * inv - yBlack) * ys
      const U = su * inv - 128
      const V = sv * inv - 128
      out[o] = Y + rv * V
      out[o + 1] = Y - gu * U - gv * V
      out[o + 2] = Y + bu * U
      out[o + 3] = 255
    }
  }
  return { data: out, x0: ax, y0: ay, width, height }
}

/** Float RGB planes on a coarse grid (the ball detector's GridFrame without its factor). */
export interface PlanarGrid {
  width: number
  height: number
  r: Float32Array
  g: Float32Array
  b: Float32Array
}

/**
 * Box average of the output image into factor x factor cells (partial edge cells dropped), straight
 * from the YUV: the grid a box downscale of planarToRgba's RGBA gives, without converting or writing
 * a single full-resolution pixel. Each cell's Y, U and V are averaged over its pixels, then converted
 * and clipped to 0..255, so a cell differs from the RGBA route only by that route's per-pixel
 * rounding (under half a level) and where single pixels clipped.
 *
 * Every display cell is an axis-aligned block of the coded frame whatever the rotation, so the sums
 * run over coded rows (cache friendly) and land in the display cell the rotation maps them to.
 */
export function downscalePlanar(crop: PlanarCrop, factor: number): PlanarGrid {
  const size = planarOutputSize(crop)
  const f = Math.max(1, Math.floor(factor))
  const gw = Math.floor(size.width / f)
  const gh = Math.floor(size.height / f)
  const n = gw * gh
  const grid: PlanarGrid = { width: gw, height: gh, r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n) }
  const { data, codedWidth: cw, codedHeight: ch, rotationDeg: rot } = crop
  const F = f * Math.max(1, Math.floor(crop.downscale)) // cell side in coded pixels
  const turned = rot === 90 || rot === 270
  // Coded grid: ncx x ncy cells of F x F pixels from (ox, oy).
  const ncx = turned ? gh : gw
  const ncy = turned ? gw : gh
  const ox = rot === 180 ? cw - gw * F : rot === 270 ? cw - gh * F : 0
  const oy = rot === 90 ? ch - gw * F : rot === 180 ? ch - gh * F : 0
  const { yOff, yStride, uOff, uStride, vOff, vStride, cStep, y0: yBlack, ys, rv, bu, gu, gv } = planes(crop)
  const sy = new Uint32Array(ncx)
  const su = new Uint32Array(ncx)
  const sv = new Uint32Array(ncx)
  const inv = 1 / (F * F)
  // Even cells from an even origin cover whole 2 x 2 chroma blocks: each chroma sample is read once
  // (and counted for its four pixels) instead of once per pixel. Same integer sums, so the same grid.
  const alignedChroma = F % 2 === 0 && ox % 2 === 0 && oy % 2 === 0
  const H = F >> 1
  for (let j = 0; j < ncy; j++) {
    sy.fill(0)
    su.fill(0)
    sv.fill(0)
    if (alignedChroma && F === 2) {
      // The common case (a 5-7 px ball at 1080p): one 2 x 2 luma block and one chroma sample a cell.
      const r0 = yOff + (oy + 2 * j) * yStride + ox
      const r1 = r0 + yStride
      const cy = (oy >> 1) + j
      const uRow = uOff + cy * uStride + (ox >> 1) * cStep
      const vRow = vOff + cy * vStride + (ox >> 1) * cStep
      for (let i = 0, x = 0, c = 0; i < ncx; i++, x += 2, c += cStep) {
        sy[i] = data[r0 + x] + data[r0 + x + 1] + data[r1 + x] + data[r1 + x + 1]
        su[i] = 4 * data[uRow + c]
        sv[i] = 4 * data[vRow + c]
      }
    } else if (alignedChroma) {
      // Luma per pixel, chroma per sample (counted for its four pixels).
      for (let d = 0; d < F; d++) {
        const yRow = yOff + (oy + j * F + d) * yStride + ox
        let x = 0
        for (let i = 0; i < ncx; i++) {
          let a = 0
          for (let e = 0; e < F; e++, x++) a += data[yRow + x]
          sy[i] += a
        }
      }
      for (let d = 0; d < H; d++) {
        const cy = ((oy + j * F) >> 1) + d
        const uRow = uOff + cy * uStride + (ox >> 1) * cStep
        const vRow = vOff + cy * vStride + (ox >> 1) * cStep
        let c = 0
        for (let i = 0; i < ncx; i++) {
          let u = 0
          let v = 0
          for (let e = 0; e < H; e++, c += cStep) {
            u += data[uRow + c]
            v += data[vRow + c]
          }
          su[i] += 4 * u
          sv[i] += 4 * v
        }
      }
    } else {
      // Any factor or origin: chroma read per pixel.
      for (let d = 0; d < F; d++) {
        const y = oy + j * F + d
        const yRow = yOff + y * yStride
        const uRow = uOff + (y >> 1) * uStride
        const vRow = vOff + (y >> 1) * vStride
        let x = ox
        for (let i = 0; i < ncx; i++) {
          let a = 0
          let u = 0
          let v = 0
          for (let e = 0; e < F; e++, x++) {
            a += data[yRow + x]
            const c = (x >> 1) * cStep
            u += data[uRow + c]
            v += data[vRow + c]
          }
          sy[i] += a
          su[i] += u
          sv[i] += v
        }
      }
    }
    // Coded cell (i, j) -> display cell index base + i * step.
    const base = rot === 90 ? gw - 1 - j : rot === 180 ? (gh - 1 - j) * gw + gw - 1 : rot === 270 ? (gh - 1) * gw + j : j * gw
    const step = rot === 90 ? gw : rot === 180 ? -1 : rot === 270 ? -gw : 1
    for (let i = 0, idx = base; i < ncx; i++, idx += step) {
      const Y = (sy[i] * inv - yBlack) * ys
      const U = su[i] * inv - 128
      const V = sv[i] * inv - 128
      const R = Y + rv * V
      const G = Y - gu * U - gv * V
      const B = Y + bu * U
      grid.r[idx] = R < 0 ? 0 : R > 255 ? 255 : R
      grid.g[idx] = G < 0 ? 0 : G > 255 ? 255 : G
      grid.b[idx] = B < 0 ? 0 : B > 255 ? 255 : B
    }
  }
  return grid
}

/** Display-pixel rectangle -> coded-pixel rectangle (display = coded rotated clockwise by rot). */
export function displayRectToCoded(
  rect: { x: number; y: number; width: number; height: number },
  codedWidth: number,
  codedHeight: number,
  rot: RotationDeg,
): { x: number; y: number; width: number; height: number } {
  const { x, y, width: w, height: h } = rect
  switch (rot) {
    case 90:
      return { x: y, y: codedHeight - x - w, width: h, height: w }
    case 180:
      return { x: codedWidth - x - w, y: codedHeight - y - h, width: w, height: h }
    case 270:
      return { x: codedWidth - y - h, y: x, width: h, height: w }
    default:
      return { x, y, width: w, height: h }
  }
}

/** Widens a rectangle to even coordinates and size (4:2:0 chroma), inside width x height. */
export function evenRect(rect: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const x0 = Math.max(0, Math.floor(rect.x / 2) * 2)
  const y0 = Math.max(0, Math.floor(rect.y / 2) * 2)
  const x1 = Math.min(width - (width % 2), Math.ceil((rect.x + rect.width) / 2) * 2)
  const y1 = Math.min(height - (height % 2), Math.ceil((rect.y + rect.height) / 2) * 2)
  return { x: x0, y: y0, width: Math.max(2, x1 - x0), height: Math.max(2, y1 - y0) }
}

/**
 * Copies a display-orientation crop of a decoded frame into CPU memory in the frame's own YUV
 * layout. Null when the frame is not 8-bit I420/NV12 in an SDR BT.601/709 colour space (the caller
 * then uses the GPU path), or when copyTo fails.
 */
export async function copyCrop(
  frame: VideoFrame,
  displayRect: { x: number; y: number; width: number; height: number },
  rotationDeg: RotationDeg,
  downscale = 1,
): Promise<PlanarCrop | null> {
  const format = frame.format
  if (format !== 'I420' && format !== 'NV12') return null
  const space = frame.colorSpace
  const weights = matrixWeights(space?.matrix)
  if (!weights) return null
  const transfer = (space?.transfer ?? null) as string | null
  if (transfer !== null && !SDR_TRANSFERS.has(transfer)) return null // PQ / HLG (HDR) and anything unknown
  const visible = frame.visibleRect
  const vw = visible?.width ?? frame.codedWidth
  const vh = visible?.height ?? frame.codedHeight
  const coded = evenRect(displayRectToCoded(displayRect, vw, vh, rotationDeg), vw, vh)
  const rect = { x: coded.x + (visible?.x ?? 0), y: coded.y + (visible?.y ?? 0), width: coded.width, height: coded.height }
  try {
    const data = new Uint8Array(frame.allocationSize({ rect }))
    const layout = await frame.copyTo(data, { rect })
    return {
      kind: 'planar',
      format,
      codedWidth: coded.width,
      codedHeight: coded.height,
      data,
      layout: layout.map((p) => ({ offset: p.offset, stride: p.stride })),
      kr: weights.kr,
      kb: weights.kb,
      fullRange: space?.fullRange === true,
      rotationDeg,
      downscale: Math.max(1, Math.floor(downscale)),
    }
  } catch {
    return null
  }
}
