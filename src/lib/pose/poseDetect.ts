/**
 * One way to read a pose, on the main thread or in a worker (M1.2).
 *
 * Every frame of a clip used to be read on the main thread, so a long read was
 * a long frozen screen. A module worker runs the same MediaPipe landmarker
 * with identical results (the M1.2 spike: 30 of 30 bench frames, largest
 * difference 0, 38 ms a frame against 37). This is the switch between them.
 *
 * OFF BY DEFAULT, on `?worker=1` only, until a quiet machine has timed whole
 * analyses both ways — the same caution M1.1's threads got. Off, the main
 * thread reads exactly as before. On, anything missing — Worker,
 * OffscreenCanvas, createImageBitmap — or a worker that fails to start falls
 * back to the main thread, for the rest of the session.
 */
import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import { fetchStreamed } from '../engineDownload'
import { enginePaths } from './poseEngine'

type Point = { x: number; y: number; z: number; visibility?: number }
export interface PoseResult {
  landmarks?: Point[][]
  worldLandmarks?: Point[][]
}
export type PoseSource = HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap
export type DetectPose = (source: PoseSource, timestampMs: number) => Promise<PoseResult>

/** Whether the player has asked for the worker: `?worker=1`. */
export function workerWanted(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('worker') === '1'
}

/** Whether this browser has what the worker path needs. */
export function workerSupported(g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): boolean {
  return typeof g.Worker === 'function' && typeof g.OffscreenCanvas === 'function' && typeof g.createImageBitmap === 'function'
}

/** The main thread's reader: the landmarker as it always ran. */
export const mainThread =
  (landmarker: Pick<PoseLandmarker, 'detectForVideo'>): DetectPose =>
  (source, ts) =>
    Promise.resolve(landmarker.detectForVideo(source as HTMLVideoElement, ts) as PoseResult)

let workerReader: Promise<DetectPose | undefined> | undefined

async function startWorker(): Promise<DetectPose | undefined> {
  try {
    const model = await fetchStreamed(enginePaths().model)
    const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
    const pending = new Map<number, { resolve: (r: PoseResult) => void; reject: (e: Error) => void }>()
    let ready: (ok: boolean) => void = () => {}
    const started = new Promise<boolean>((r) => (ready = r))
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data
      if (m.kind === 'ready') ready(true)
      else if (m.kind === 'pose') pending.get(m.id)?.resolve(m)
      else if (m.kind === 'error') {
        if (m.id === undefined) ready(false)
        else pending.get(m.id)?.reject(new Error(m.message))
      }
      if (m.id !== undefined) pending.delete(m.id)
    }
    worker.onerror = () => ready(false)
    worker.postMessage({ kind: 'init', model: model.buffer, wasm: enginePaths().wasm }, [model.buffer])
    if (!(await started)) {
      worker.terminate()
      return undefined
    }
    let next = 0
    return async (source, ts) => {
      const bitmap = await createImageBitmap(source as ImageBitmapSource)
      const id = next++
      return new Promise<PoseResult>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage({ kind: 'frame', id, ts, bitmap }, [bitmap])
      })
    }
  } catch {
    return undefined
  }
}

/**
 * The reader to use for this landmarker: the worker when asked for and able to
 * start, the main thread otherwise. Started once a session; a worker that
 * would not start is not asked again.
 */
export async function poseDetector(
  landmarker: Pick<PoseLandmarker, 'detectForVideo'>,
  env: { wanted?: boolean; supported?: boolean } = {},
): Promise<DetectPose> {
  const wanted = env.wanted ?? workerWanted()
  const supported = env.supported ?? workerSupported()
  if (!wanted || !supported) return mainThread(landmarker)
  workerReader ??= startWorker()
  return (await workerReader) ?? mainThread(landmarker)
}
