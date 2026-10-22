/**
 * MediaPipe's pose landmarker, off the main thread (M1.2).
 *
 * Built from the model bytes the page hands over, so this worker downloads
 * nothing of its own; reads frames sent as transferred ImageBitmaps and sends
 * back the landmarks. `poseDetect.ts` decides whether it is used at all.
 */
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

/*
 * MediaPipe loads its wasm glue with importScripts, which a module worker does
 * not have. A same-origin synchronous request and a global eval stand in for
 * it: the glue is a classic script whose top-level declarations must land
 * globally. Proved identical to the main thread on 30 bench frames
 * (`workerspike.html`, the M1.2 spike).
 */
const scope = self as unknown as { importScripts?: (...urls: string[]) => void }
scope.importScripts = (...urls: string[]) => {
  for (const url of urls) {
    const req = new XMLHttpRequest()
    req.open('GET', url, false)
    req.send()
    ;(0, eval)(req.responseText)
  }
}

let landmarker: PoseLandmarker | undefined

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data
  try {
    if (msg.kind === 'init') {
      const fileset = await FilesetResolver.forVisionTasks(msg.wasm)
      landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(msg.model), delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
      })
      self.postMessage({ kind: 'ready' })
      return
    }
    if (msg.kind === 'frame') {
      if (!landmarker) throw new Error('not ready')
      const res = landmarker.detectForVideo(msg.bitmap as ImageBitmap, msg.ts)
      ;(msg.bitmap as ImageBitmap).close()
      self.postMessage({ kind: 'pose', id: msg.id, landmarks: res.landmarks, worldLandmarks: res.worldLandmarks })
    }
  } catch (err) {
    self.postMessage({ kind: 'error', id: msg?.id, message: String((err as Error)?.message ?? err) })
  }
}
