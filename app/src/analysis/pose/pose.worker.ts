/**
 * Dedicated module worker running MediaPipe PoseLandmarker off the main thread.
 * Receives transferred ImageBitmaps (closed here after inference) and returns plain
 * landmark arrays. Requests are handled strictly in arrival order. Requests with
 * target 'locate' (ROI localisation) go to an IMAGE-mode landmarker (see LocatorSlot).
 */
import { LandmarkerHandle, LocatorSlot } from './mediapipeCore.ts'
import { installSameOriginFetchGuard, type FetchGuardScope } from './workerNetworkGuard.ts'
import type { FromPoseWorker, ToPoseWorker } from './workerProtocol.ts'

/** The subset of DedicatedWorkerGlobalScope used here (the app's tsconfig uses the DOM lib). */
interface WorkerScope {
  postMessage(message: FromPoseWorker): void
  onmessage: ((event: MessageEvent<ToPoseWorker>) => void) | null
}

const scope = globalThis as unknown as WorkerScope

// tasks-vision's usage logging (odml.pa.googleapis.com) must never leave the device (D8). The
// page CSP reaches this worker through its blob: bootstrap; this guard covers browsers that do not
// pass the policy on. Everything the landmarker needs is same-origin.
installSameOriginFetchGuard(globalThis as unknown as FetchGuardScope, {
  onBlocked: (url) => console.warn(`[privacy] pose worker: blocked a cross-origin request to ${url}`),
})
let handle: LandmarkerHandle | null = null
let locator: LocatorSlot | null = null
let queue: Promise<void> = Promise.resolve()

function reply(message: FromPoseWorker): void {
  scope.postMessage(message)
}

async function closeAll(): Promise<void> {
  await locator?.close()
  handle?.close()
  handle = null
  locator = null
}

async function handleMessage(message: ToPoseWorker): Promise<void> {
  try {
    switch (message.type) {
      case 'init': {
        await closeAll()
        handle = await LandmarkerHandle.create(message.config)
        locator = new LocatorSlot(message.config)
        reply({ type: 'ready', id: message.id, info: handle.info })
        return
      }
      case 'detect': {
        try {
          if (!handle || !locator) throw new Error('detect before init')
          if (message.target === 'locate') {
            const { handle: locate, setupMs } = await locator.get(handle)
            const output = locate.detect(message.image, message.timestampMs)
            reply({ type: 'result', id: message.id, output: setupMs === undefined ? output : { ...output, locatorSetupMs: setupMs } })
          } else {
            reply({ type: 'result', id: message.id, output: handle.detect(message.image, message.timestampMs) })
          }
        } finally {
          if ('close' in message.image) message.image.close()
        }
        return
      }
      case 'reset': {
        await handle?.reset()
        reply({ type: 'done', id: message.id, lastTimestampMs: handle?.lastTimestamp })
        return
      }
      case 'dispose': {
        await closeAll()
        reply({ type: 'done', id: message.id })
        return
      }
    }
  } catch (error) {
    reply({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) })
  }
}

scope.onmessage = (event) => {
  queue = queue.then(() => handleMessage(event.data))
}
