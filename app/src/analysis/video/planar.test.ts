import { describe, expect, it } from 'vitest'
import { displayRectToCoded, downscalePlanar, evenRect, isPlanarCrop, matrixWeights, planarOutputSize, planarRegionToRgba, planarToRgba, type PlanarCrop } from './planar.ts'
import { codedToDisplay, type RotationDeg } from './rotation.ts'

/** RGB -> limited-range BT.709 YUV (the encoder side), for building test frames. */
function toYuv(r: number, g: number, b: number, kr = 0.2126, kb = 0.0722) {
  const kg = 1 - kr - kb
  const y = kr * r + kg * g + kb * b
  const u = (b - y) / (2 * (1 - kb))
  const v = (r - y) / (2 * (1 - kr))
  return { Y: Math.round(16 + (219 / 255) * y), U: Math.round(128 + (224 / 255) * u), V: Math.round(128 + (224 / 255) * v) }
}

/** A coded w x h I420 or NV12 frame whose 2 x 2 blocks each hold one colour from `colour(bx, by)`. */
function frame(w: number, h: number, format: 'I420' | 'NV12', colour: (bx: number, by: number) => [number, number, number], rot: RotationDeg = 0, downscale = 1): PlanarCrop {
  const cw = w / 2
  const chh = h / 2
  const ySize = w * h
  const cSize = cw * chh
  const data = new Uint8Array(ySize + 2 * cSize)
  for (let by = 0; by < chh; by++) {
    for (let bx = 0; bx < cw; bx++) {
      const { Y, U, V } = toYuv(...colour(bx, by))
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) data[(2 * by + dy) * w + 2 * bx + dx] = Y
      if (format === 'I420') {
        data[ySize + by * cw + bx] = U
        data[ySize + cSize + by * cw + bx] = V
      } else {
        data[ySize + by * w + 2 * bx] = U
        data[ySize + by * w + 2 * bx + 1] = V
      }
    }
  }
  const layout = format === 'I420' ? [{ offset: 0, stride: w }, { offset: ySize, stride: cw }, { offset: ySize + cSize, stride: cw }] : [{ offset: 0, stride: w }, { offset: ySize, stride: w }]
  return { kind: 'planar', format, codedWidth: w, codedHeight: h, data, layout, kr: 0.2126, kb: 0.0722, fullRange: false, rotationDeg: rot, downscale }
}

const palette: [number, number, number][] = [
  [220, 230, 60], // ball yellow
  [30, 90, 40], // court green
  [240, 240, 240],
  [10, 10, 10],
  [200, 60, 40],
  [60, 90, 200],
]
const colourAt = (bx: number, by: number) => palette[(bx * 7 + by * 3) % palette.length]

describe('planar crop conversion', () => {
  it('recovers RGB from limited-range BT.709 I420 and NV12 within rounding', () => {
    for (const format of ['I420', 'NV12'] as const) {
      const img = planarToRgba(frame(12, 8, format, colourAt))
      expect(img.width).toBe(12)
      expect(img.height).toBe(8)
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 12; x++) {
          const want = colourAt(x >> 1, y >> 1)
          const p = (y * 12 + x) * 4
          for (let c = 0; c < 3; c++) expect(Math.abs(img.data[p + c] - want[c])).toBeLessThanOrEqual(3)
          expect(img.data[p + 3]).toBe(255)
        }
      }
    }
  })

  it('applies the display rotation (each display pixel shows the coded pixel codedToDisplay puts there)', () => {
    const w = 8
    const h = 6
    const base = planarToRgba(frame(w, h, 'I420', colourAt, 0))
    for (const rot of [90, 180, 270] as const) {
      const img = planarToRgba(frame(w, h, 'I420', colourAt, rot))
      const turned = rot !== 180
      expect(img.width).toBe(turned ? h : w)
      expect(img.height).toBe(turned ? w : h)
      for (let cy = 0; cy < h; cy++) {
        for (let cx = 0; cx < w; cx++) {
          const d = codedToDisplay((cx + 0.5) / w, (cy + 0.5) / h, rot)
          const dx = Math.floor(d.x * img.width)
          const dy = Math.floor(d.y * img.height)
          for (let c = 0; c < 3; c++) expect(img.data[(dy * img.width + dx) * 4 + c]).toBe(base.data[(cy * w + cx) * 4 + c])
        }
      }
    }
  })

  it('box-downscales by an integer factor (block means)', () => {
    const img = planarToRgba(frame(8, 8, 'I420', colourAt, 0, 2))
    expect(img).toMatchObject({ width: 4, height: 4 })
    // Each 2 x 2 block is one colour, so the mean is that colour.
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) for (let c = 0; c < 3; c++) expect(Math.abs(img.data[(y * 4 + x) * 4 + c] - colourAt(x, y)[c])).toBeLessThanOrEqual(3)
    expect(planarOutputSize({ codedWidth: 9, codedHeight: 20, rotationDeg: 90, downscale: 2 })).toEqual({ width: 10, height: 4 })
  })

  it('maps display rectangles to coded ones and aligns them for 4:2:0', () => {
    // Coded 1920 x 1080 shown rotated 90 (a portrait phone clip): display is 1080 x 1920.
    const rect = { x: 100, y: 300, width: 400, height: 800 }
    for (const rot of [0, 90, 180, 270] as const) {
      const cw = rot % 180 ? 1920 : 1080
      const ch = rot % 180 ? 1080 : 1920
      const coded = displayRectToCoded(rect, cw, ch, rot)
      // Its corners land on the display rect's corners.
      const a = codedToDisplay(coded.x / cw, coded.y / ch, rot)
      const b = codedToDisplay((coded.x + coded.width) / cw, (coded.y + coded.height) / ch, rot)
      const dw = rot % 180 ? ch : cw
      const dh = rot % 180 ? cw : ch
      expect(Math.min(a.x, b.x) * dw).toBeCloseTo(rect.x, 6)
      expect(Math.max(a.x, b.x) * dw).toBeCloseTo(rect.x + rect.width, 6)
      expect(Math.min(a.y, b.y) * dh).toBeCloseTo(rect.y, 6)
      expect(Math.max(a.y, b.y) * dh).toBeCloseTo(rect.y + rect.height, 6)
    }
    expect(evenRect({ x: 3, y: 5, width: 10, height: 7 }, 100, 100)).toEqual({ x: 2, y: 4, width: 12, height: 8 })
    expect(evenRect({ x: 95, y: 0, width: 10, height: 3 }, 99, 100)).toEqual({ x: 94, y: 0, width: 4, height: 4 })
  })

  it('knows which colour spaces it can convert', () => {
    expect(matrixWeights('bt709')).toEqual({ kr: 0.2126, kb: 0.0722 })
    expect(matrixWeights(null)).toEqual({ kr: 0.2126, kb: 0.0722 })
    expect(matrixWeights('smpte170m')).toEqual({ kr: 0.299, kb: 0.114 })
    expect(matrixWeights('bt2020-ncl')).toBeNull()
    expect(matrixWeights('rgb')).toBeNull()
    expect(isPlanarCrop(frame(4, 4, 'I420', colourAt))).toBe(true)
    expect(isPlanarCrop({ width: 1, height: 1, data: new Uint8ClampedArray(4) })).toBe(false)
  })
})

/** A coded w x h frame with independent pseudo-random luma per pixel and chroma per 2 x 2 block. */
function noisyFrame(w: number, h: number, format: 'I420' | 'NV12', rot: RotationDeg = 0, seed = 1): PlanarCrop {
  let s = seed
  const next = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 8) & 0xff
  const ySize = w * h
  const cSize = (w / 2) * (h / 2)
  const data = new Uint8Array(ySize + 2 * cSize)
  for (let i = 0; i < data.length; i++) data[i] = 16 + (next() % 220)
  const layout = format === 'I420' ? [{ offset: 0, stride: w }, { offset: ySize, stride: w / 2 }, { offset: ySize + cSize, stride: w / 2 }] : [{ offset: 0, stride: w }, { offset: ySize, stride: w }]
  return { kind: 'planar', format, codedWidth: w, codedHeight: h, data, layout, kr: 0.2126, kb: 0.0722, fullRange: false, rotationDeg: rot, downscale: 1 }
}

/** Reference grid: per display cell, the mean Y, U and V of its pixels (read pixel by pixel), converted and clipped. */
function referenceGrid(crop: PlanarCrop, f: number) {
  const size = planarOutputSize(crop)
  const gw = Math.floor(size.width / f)
  const gh = Math.floor(size.height / f)
  const nv12 = crop.format === 'NV12'
  const [yl, ul, vl] = [crop.layout[0], crop.layout[1], nv12 ? { offset: crop.layout[1].offset + 1, stride: crop.layout[1].stride } : crop.layout[2]]
  const step = nv12 ? 2 : 1
  const out = { r: [] as number[], g: [] as number[], b: [] as number[] }
  const kg = 1 - crop.kr - crop.kb
  const cs = 255 / 224
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sy = 0
      let su = 0
      let sv = 0
      for (let dy = gy * f; dy < (gy + 1) * f; dy++) {
        for (let dx = gx * f; dx < (gx + 1) * f; dx++) {
          // Display pixel centre -> coded pixel.
          const c = codedToDisplayInverse(dx, dy, size.width, size.height, crop.codedWidth, crop.codedHeight, crop.rotationDeg)
          sy += crop.data[yl.offset + c.y * yl.stride + c.x]
          su += crop.data[ul.offset + (c.y >> 1) * ul.stride + (c.x >> 1) * step]
          sv += crop.data[vl.offset + (c.y >> 1) * vl.stride + (c.x >> 1) * step]
        }
      }
      const n = f * f
      const Y = (sy / n - 16) * (255 / 219)
      const U = su / n - 128
      const V = sv / n - 128
      const clip = (v: number) => Math.min(255, Math.max(0, v))
      out.r.push(clip(Y + 2 * (1 - crop.kr) * cs * V))
      out.g.push(clip(Y - ((2 * crop.kb * (1 - crop.kb)) / kg) * cs * U - ((2 * crop.kr * (1 - crop.kr)) / kg) * cs * V))
      out.b.push(clip(Y + 2 * (1 - crop.kb) * cs * U))
    }
  }
  return { width: gw, height: gh, ...out }
}

/** Display pixel (dx, dy) of a W x H display image -> coded pixel of a cw x ch frame shown rotated by rot. */
function codedToDisplayInverse(dx: number, dy: number, W: number, H: number, cw: number, ch: number, rot: RotationDeg) {
  for (let cy = 0; cy < ch; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const d = codedToDisplay((cx + 0.5) / cw, (cy + 0.5) / ch, rot)
      if (Math.floor(d.x * W) === dx && Math.floor(d.y * H) === dy) return { x: cx, y: cy }
    }
  }
  throw new Error('no coded pixel')
}

describe('downscalePlanar', () => {
  it('equals the per-cell mean of Y, U and V for every factor, layout and rotation (chroma-aligned fast path included)', () => {
    for (const format of ['I420', 'NV12'] as const) {
      for (const rot of [0, 90, 180, 270] as const) {
        const crop = noisyFrame(14, 10, format, rot, 7 + rot)
        for (const f of [1, 2, 3, 4]) {
          const grid = downscalePlanar(crop, f)
          const want = referenceGrid(crop, f)
          expect([grid.width, grid.height]).toEqual([want.width, want.height])
          for (let i = 0; i < want.r.length; i++) {
            expect(grid.r[i]).toBeCloseTo(want.r[i], 3)
            expect(grid.g[i]).toBeCloseTo(want.g[i], 3)
            expect(grid.b[i]).toBeCloseTo(want.b[i], 3)
          }
        }
      }
    }
  })

  it('converts a sub-rectangle exactly as the whole-image conversion does', () => {
    const crop = noisyFrame(16, 12, 'NV12', 90, 3)
    const whole = planarToRgba(crop)
    const part = planarRegionToRgba(crop, 3, 5, 9, 11)
    expect(part).toMatchObject({ x0: 3, y0: 5, width: 6, height: 6 })
    for (let y = 0; y < part.height; y++) {
      for (let x = 0; x < part.width; x++) {
        for (let c = 0; c < 4; c++) expect(part.data[(y * part.width + x) * 4 + c]).toBe(whole.data[((y + 5) * whole.width + x + 3) * 4 + c])
      }
    }
  })
})
