/**
 * Frame -> analysis-resolution pixels. Uses OffscreenCanvas when available (works in a
 * worker) and falls back to a DOM canvas. Rotation is applied with a canvas transform,
 * so the one draw both rotates and downscales.
 */
import type { ImageDataLike } from '../types.ts'
import type { AnalysisSizeOptions } from './frameTypes.ts'
import { canvasRotationTransform, type RotationDeg } from './rotation.ts'

export interface Size {
  width: number
  height: number
}

/** Output size in display orientation. Never upscales via maxLongSidePx; explicit sizes win. */
export function analysisSize(display: Size, options: AnalysisSizeOptions = {}): Size {
  const aspect = display.width / display.height
  if (options.width && options.height) return { width: Math.round(options.width), height: Math.round(options.height) }
  if (options.width) return { width: Math.round(options.width), height: Math.max(1, Math.round(options.width / aspect)) }
  if (options.height) return { width: Math.max(1, Math.round(options.height * aspect)), height: Math.round(options.height) }
  const longSide = Math.max(display.width, display.height)
  const scale = options.maxLongSidePx && options.maxLongSidePx < longSide ? options.maxLongSidePx / longSide : 1
  return {
    width: Math.max(1, Math.round(display.width * scale)),
    height: Math.max(1, Math.round(display.height * scale)),
  }
}

type Context2d = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function createContext(
  width: number,
  height: number,
  willReadFrequently: boolean,
): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Context2d } {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently, alpha: false })
    if (ctx) return { canvas, ctx }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently, alpha: false })
    if (ctx) return { canvas, ctx }
  }
  throw new Error('No 2D canvas available in this environment.')
}

export interface RendererOptions {
  smoothing?: ImageSmoothingQuality
  /**
   * true: CPU-backed canvas (cheap getImageData, but the frame is copied off the GPU
   * before scaling). false: GPU canvas (fast draw and ImageBitmap output, one readback per
   * getImageData). Measured choice per path lives in frameSource.ts.
   */
  willReadFrequently?: boolean
}

export class FrameRenderer {
  readonly width: number
  readonly height: number
  private readonly canvas: OffscreenCanvas | HTMLCanvasElement
  private readonly ctx: Context2d

  constructor(size: Size, options: RendererOptions = {}) {
    const smoothing = options.smoothing ?? 'medium'
    this.width = size.width
    this.height = size.height
    const { canvas, ctx } = createContext(size.width, size.height, options.willReadFrequently ?? false)
    this.canvas = canvas
    this.ctx = ctx
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = smoothing
  }

  /** Draws `image` (coded orientation) rotated by `rotationDeg` and scaled to fill the canvas. */
  draw(image: CanvasImageSource, rotationDeg: RotationDeg): void {
    const t = canvasRotationTransform(rotationDeg, this.width, this.height)
    const [a, b, c, d, e, f] = t.matrix
    this.ctx.setTransform(a, b, c, d, e, f)
    this.ctx.drawImage(image, 0, 0, t.drawW, t.drawH)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  readRgba(): ImageDataLike {
    return this.ctx.getImageData(0, 0, this.width, this.height)
  }

  /** Current canvas content as an ImageBitmap (GPU side; no CPU readback). */
  async toBitmap(): Promise<ImageBitmap> {
    if (typeof OffscreenCanvas === 'function' && this.canvas instanceof OffscreenCanvas) {
      return this.canvas.transferToImageBitmap()
    }
    return createImageBitmap(this.canvas)
  }
}
