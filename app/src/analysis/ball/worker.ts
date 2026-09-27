/**
 * Ball-detection worker (engine-pipeline). Module worker entry: receives transferred ImageBitmap
 * crops and reads them back to RGBA in its own OffscreenCanvas, or takes YUV crops copied from
 * CPU-memory frames, which the detector box-downscales straight from the YUV (video/planar.ts), so
 * neither readback nor detection runs on the UI thread. Runs BallWindowProcessor per window and
 * analyseBall at the end of each window. Messages are handled strictly in arrival order.
 */
import { isPlanarCrop } from '../video/planar.ts'
import type { DetectorImage } from './detector.ts'
import { analyseWindow, BallWindowProcessor } from './workerCore.ts'
import type { BallFrameImage, FromBallWorker, ToBallWorker } from './workerProtocol.ts'

interface WorkerScope {
  postMessage(message: FromBallWorker): void
  onmessage: ((event: MessageEvent<ToBallWorker>) => void) | null
}

const scope = globalThis as unknown as WorkerScope
const windows = new Map<number, { processor: BallWindowProcessor; readbackMs: number }>()
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null

/** Pixels for the detector: bitmaps are read back; RGBA and YUV crops go as they are. */
function readback(image: BallFrameImage): DetectorImage {
  if (isPlanarCrop(image) || !('close' in image)) return image
  const { width, height } = image
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height)
    ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })
  }
  if (!ctx) throw new Error('OffscreenCanvas 2D is unavailable in the ball worker')
  ctx.drawImage(image, 0, 0)
  return ctx.getImageData(0, 0, width, height)
}

function handle(message: ToBallWorker): void {
  try {
    switch (message.type) {
      case 'begin':
        windows.set(message.windowId, { processor: new BallWindowProcessor(message.config), readbackMs: 0 })
        scope.postMessage({ type: 'ready', id: message.id })
        return
      case 'frame': {
        const entry = windows.get(message.windowId)
        let readbackMs = 0
        try {
          if (!entry) throw new Error(`frame for unknown window ${message.windowId}`)
          const t0 = performance.now()
          const image = readback(message.image)
          readbackMs = performance.now() - t0
          entry.readbackMs += readbackMs
          const before = entry.processor.detectMs
          entry.processor.process({ frameIndex: message.frameIndex, tReal: message.tReal, image })
          scope.postMessage({
            type: 'ack',
            id: message.id,
            windowId: message.windowId,
            frameIndex: message.frameIndex,
            detectMs: entry.processor.detectMs - before,
            readbackMs,
          })
        } finally {
          if (!isPlanarCrop(message.image) && 'close' in message.image) message.image.close()
        }
        return
      }
      case 'end': {
        const entry = windows.get(message.windowId)
        if (!entry) throw new Error(`end for unknown window ${message.windowId}`)
        windows.delete(message.windowId)
        const result = analyseWindow(message.windowId, entry.processor.results(), message.options, {
          detectMs: entry.processor.detectMs,
          readbackMs: entry.readbackMs,
        })
        scope.postMessage({ type: 'result', id: message.id, windowId: message.windowId, result })
        return
      }
      case 'reanalyse': {
        const result = analyseWindow(-1, message.frames, message.options)
        scope.postMessage({ type: 'result', id: message.id, windowId: -1, result })
        return
      }
      case 'dispose':
        windows.clear()
        canvas = null
        ctx = null
        scope.postMessage({ type: 'ready', id: message.id })
        return
    }
  } catch (error) {
    scope.postMessage({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) })
  }
}

scope.onmessage = (event) => handle(event.data)
