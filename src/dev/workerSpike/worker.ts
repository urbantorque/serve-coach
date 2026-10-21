/**
 * The worker half of the M1.2 spike: MediaPipe's pose landmarker, built from
 * the model bytes the page hands over, reading frames sent as ImageBitmaps.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

let landmarker: PoseLandmarker | undefined

/*
 * MediaPipe loads its wasm glue with importScripts, which a module worker does
 * not have. A same-origin synchronous request and a global eval stand in for it:
 * the glue is a classic script whose top-level declarations must land globally.
 */
const scope = self as unknown as { importScripts?: (...urls: string[]) => void }
if (typeof scope.importScripts !== 'function' || !('document' in self)) {
  scope.importScripts = (...urls: string[]) => {
    for (const url of urls) {
      const req = new XMLHttpRequest()
      req.open('GET', url, false)
      req.send()
      ;(0, eval)(req.responseText)
    }
  }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data
  try {
    if (msg.kind === 'init') {
      const fileset = await FilesetResolver.forVisionTasks(msg.wasm)
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(msg.model), delegate: msg.delegate },
        // The GPU delegate needs a canvas; a worker has only an OffscreenCanvas.
        ...(msg.delegate === 'GPU' ? { canvas: new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement } : {}),
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      self.postMessage({ kind: 'ready' })
      return
    }
    if (msg.kind === 'frame' && landmarker) {
      const t0 = performance.now()
      const res = landmarker.detectForVideo(msg.bitmap as ImageBitmap, msg.ts)
      ;(msg.bitmap as ImageBitmap).close()
      self.postMessage({ kind: 'pose', i: msg.i, ms: performance.now() - t0, image: res.landmarks?.[0] })
    }
  } catch (err) {
    self.postMessage({ kind: 'error', message: String((err as Error)?.stack ?? err) })
  }
}
