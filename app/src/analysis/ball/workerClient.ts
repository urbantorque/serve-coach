/**
 * Client for the ball-detection worker (engine-pipeline).
 *
 * - `pushFrame` posts a crop (ImageBitmap or YUV crop buffer, transferred) and resolves once fewer than `maxQueue`
 *   frames are waiting in the worker, so the decoder runs ahead of detection without piling up
 *   frames (ARCHITECTURE §5.10: bounded ImageBitmaps).
 * - `end` waits for the window's last frame, then returns analyseBall's result.
 * - Without Worker/OffscreenCanvas (or if the worker fails to start) the same core runs on the
 *   calling thread; `backend` says which ran.
 * - `dispose` terminates the worker: in-flight frames are dropped with it and waiters reject, so
 *   cancelling a job cleans up within one message turn.
 */
import type { ImageDataLike } from '../types.ts'
import { isPlanarCrop } from '../video/planar.ts'
import type { DetectorImage } from './detector.ts'
import type { FrameCandidates } from './tracker.ts'
import { analyseWindow, BallWindowProcessor, type BallWindowResult, type WindowAnalyseOptions, type WindowBallConfig } from './workerCore.ts'
import type { BallFrameImage, FromBallWorker, ToBallWorker } from './workerProtocol.ts'

export interface BallFrameAck {
  windowId: number
  frameIndex: number
  detectMs: number
  readbackMs: number
}

export interface BallWorkerClientOptions {
  /** 'auto' (default) uses a worker when the platform has one. */
  useWorker?: 'auto' | boolean
  /** Frames waiting in the worker before pushFrame waits. Default 6. */
  maxQueue?: number
  onAck?: (ack: BallFrameAck) => void
  /** Test hook: supply the worker. */
  createWorker?: () => Worker
}

interface Pending {
  resolve: (message: FromBallWorker) => void
  reject: (error: Error) => void
}

type Image = BallFrameImage

const isBitmap = (image: Image): image is ImageBitmap => typeof (image as ImageBitmap).close === 'function'

/** Buffers handed over with a frame: the bitmap itself, or a YUV crop's pixel buffer. */
function transferables(image: Image): Transferable[] {
  if (isBitmap(image)) return [image]
  if (isPlanarCrop(image)) return [image.data.buffer as ArrayBuffer]
  return []
}

function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function'
}

async function createBallWorker(): Promise<{ worker: Worker; bootstrapUrl: string }> {
  // Same CSP-friendly pattern as the pose worker: a same-origin module behind a blob: bootstrap.
  const { default: scriptPath } = await import('./worker.ts?worker&url')
  const base = typeof document !== 'undefined' ? document.baseURI : globalThis.location?.href
  const scriptUrl = base ? new URL(scriptPath, base).href : scriptPath
  const bootstrapUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(scriptUrl)};\n`], { type: 'text/javascript' }))
  return { worker: new Worker(bootstrapUrl, { type: 'module', name: 'ball-detector' }), bootstrapUrl }
}

export class BallWorkerClient {
  backend: 'worker' | 'main-thread' = 'main-thread'
  private worker: Worker | null = null
  private bootstrapUrl: string | null = null
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly maxQueue: number
  private queued = 0
  private waiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = []
  private failure: Error | null = null
  private disposed = false
  private readonly local = new Map<number, { processor: BallWindowProcessor; readbackMs: number }>()
  private readbackCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
  /** Summed over the client's life. */
  readonly totals = { frames: 0, detectMs: 0, readbackMs: 0 }

  private constructor(private readonly options: BallWorkerClientOptions) {
    this.maxQueue = Math.max(1, options.maxQueue ?? 6)
  }

  static async create(options: BallWorkerClientOptions = {}): Promise<BallWorkerClient> {
    const client = new BallWorkerClient(options)
    const want = options.useWorker === true || ((options.useWorker ?? 'auto') === 'auto' && (!!options.createWorker || workerSupported()))
    if (want) {
      try {
        if (options.createWorker) client.worker = options.createWorker()
        else {
          const made = await createBallWorker()
          client.worker = made.worker
          client.bootstrapUrl = made.bootstrapUrl
        }
        client.attach(client.worker)
        client.backend = 'worker'
      } catch (error) {
        if (options.useWorker === true) throw error
        client.worker = null
        client.backend = 'main-thread'
      }
    }
    return client
  }

  private attach(worker: Worker): void {
    worker.onmessage = (event: MessageEvent<FromBallWorker>) => this.receive(event.data)
    worker.onerror = (event: ErrorEvent) => this.fail(new Error(`ball worker error: ${event.message || 'failed to load'}`))
    worker.onmessageerror = () => this.fail(new Error('ball worker message could not be deserialised'))
  }

  private receive(message: FromBallWorker): void {
    if (message.type === 'ack') {
      this.onFrameDone({ windowId: message.windowId, frameIndex: message.frameIndex, detectMs: message.detectMs, readbackMs: message.readbackMs })
      return
    }
    const entry = this.pending.get(message.id)
    if (!entry) {
      // A frame that failed: release its slot and remember the error for end().
      if (message.type === 'error') {
        this.failure ??= new Error(message.message)
        this.releaseSlot()
      }
      return
    }
    this.pending.delete(message.id)
    if (message.type === 'error') entry.reject(new Error(message.message))
    else entry.resolve(message)
  }

  private fail(error: Error): void {
    this.failure ??= error
    for (const entry of this.pending.values()) entry.reject(error)
    this.pending.clear()
    for (const w of this.waiters) w.reject(error)
    this.waiters = []
  }

  private onFrameDone(ack: BallFrameAck): void {
    this.totals.frames++
    this.totals.detectMs += ack.detectMs
    this.totals.readbackMs += ack.readbackMs
    this.releaseSlot()
    this.options.onAck?.(ack)
  }

  private releaseSlot(): void {
    this.queued = Math.max(0, this.queued - 1)
    while (this.waiters.length && this.queued < this.maxQueue) this.waiters.shift()!.resolve()
    if (this.queued === 0) {
      const drained = this.waiters
      this.waiters = []
      for (const w of drained) w.resolve()
    }
  }

  private request(message: ToBallWorker, transfer: Transferable[] = []): Promise<FromBallWorker> {
    if (this.disposed) return Promise.reject(new Error('ball worker is disposed'))
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject })
      this.worker!.postMessage(message, transfer)
    })
  }

  private waitForRoom(limit: number): Promise<void> {
    if (this.queued < limit) return Promise.resolve()
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  async begin(windowId: number, config: WindowBallConfig): Promise<void> {
    if (this.backend === 'main-thread') {
      this.local.set(windowId, { processor: new BallWindowProcessor(config), readbackMs: 0 })
      return
    }
    await this.request({ type: 'begin', id: this.nextId++, windowId, config })
  }

  /** Posts one frame (the bitmap is transferred and closed by the consumer). Resolves when there is room for another. */
  async pushFrame(windowId: number, frameIndex: number, tReal: number, image: Image): Promise<void> {
    if (this.disposed) {
      if (isBitmap(image)) image.close()
      throw new Error('ball worker is disposed')
    }
    if (this.failure) {
      if (isBitmap(image)) image.close()
      throw this.failure
    }
    if (this.backend === 'main-thread') {
      const entry = this.local.get(windowId)
      if (!entry) throw new Error(`frame for unknown window ${windowId}`)
      const t0 = now()
      let pixels: DetectorImage
      try {
        // YUV crops go to the detector as they are (it converts only what it refines).
        pixels = isBitmap(image) ? this.readbackLocal(image) : image
      } finally {
        if (isBitmap(image)) image.close()
      }
      const readbackMs = now() - t0
      entry.readbackMs += readbackMs
      const before = entry.processor.detectMs
      entry.processor.process({ frameIndex, tReal, image: pixels })
      this.onFrameDone({ windowId, frameIndex, detectMs: entry.processor.detectMs - before, readbackMs })
      // Let the event loop breathe between synchronous detections.
      await new Promise((r) => setTimeout(r, 0))
      return
    }
    this.queued++
    const message: ToBallWorker = { type: 'frame', id: this.nextId++, windowId, frameIndex, tReal, image }
    this.worker!.postMessage(message, transferables(image))
    await this.waitForRoom(this.maxQueue)
  }

  /** Waits for the window's frames, then returns the ball analysis for it. */
  async end(windowId: number, options: WindowAnalyseOptions): Promise<BallWindowResult> {
    if (this.backend === 'main-thread') {
      const entry = this.local.get(windowId)
      if (!entry) throw new Error(`end for unknown window ${windowId}`)
      this.local.delete(windowId)
      return analyseWindow(windowId, entry.processor.results(), options, { detectMs: entry.processor.detectMs, readbackMs: entry.readbackMs })
    }
    await this.waitForRoom(1)
    if (this.failure) throw this.failure
    const reply = await this.request({ type: 'end', id: this.nextId++, windowId, options })
    if (reply.type !== 'result') throw new Error(`unexpected ball worker reply ${reply.type}`)
    return reply.result
  }

  /**
   * Drops a window that will never be ended (a job a re-plan superseded). Call it after the window's
   * last pushFrame has returned: messages are handled in order, so its frames are processed (and
   * acknowledged) first, and nothing arrives for the window afterwards.
   */
  async discard(windowId: number): Promise<void> {
    if (this.disposed) return
    if (this.backend === 'main-thread') {
      this.local.delete(windowId)
      return
    }
    await this.request({ type: 'discard', id: this.nextId++, windowId })
  }

  /** Re-runs analyseBall on candidates already detected (no pixels needed). */
  async reanalyse(frames: FrameCandidates[], options: WindowAnalyseOptions): Promise<BallWindowResult> {
    if (this.backend === 'main-thread') return analyseWindow(-1, frames, options)
    const reply = await this.request({ type: 'reanalyse', id: this.nextId++, frames, options })
    if (reply.type !== 'result') throw new Error(`unexpected ball worker reply ${reply.type}`)
    return reply.result
  }

  /** Terminates the worker; pending calls reject. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.fail(new Error('ball worker is disposed'))
    this.worker?.terminate()
    this.worker = null
    if (this.bootstrapUrl) URL.revokeObjectURL(this.bootstrapUrl)
    this.bootstrapUrl = null
    this.local.clear()
    this.readbackCanvas = null
  }

  private readbackLocal(image: ImageBitmap): ImageDataLike {
    const { width, height } = image
    let canvas = this.readbackCanvas
    if (!canvas || canvas.width !== width || canvas.height !== height) {
      canvas =
        typeof OffscreenCanvas === 'function'
          ? new OffscreenCanvas(width, height)
          : Object.assign(document.createElement('canvas'), { width, height })
      this.readbackCanvas = canvas
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false }) as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null
    if (!ctx) throw new Error('2D canvas unavailable for ball readback')
    ctx.drawImage(image, 0, 0)
    return ctx.getImageData(0, 0, width, height)
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
