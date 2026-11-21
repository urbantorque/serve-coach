/**
 * RTMPose-s on ONNX Runtime's WASM backend: the second read of the swing.
 *
 * Mirrors `poseEngine.ts` and `objectEngine.ts` — one instance, loaded on
 * first use, the model streamed from this app's own origin and the runtime
 * beside it in `public/ort/`, both vendored by `scripts/fetch-assets.mjs` and
 * cached by the service worker with the other engines. Nothing here reaches a
 * third-party host.
 *
 * The CPU (WASM) backend only. The WebGPU build is twice the download, and the
 * refinement reads thirty-odd frames, not the whole clip. Threads only where
 * the page is cross-origin isolated, which is what SharedArrayBuffer needs;
 * elsewhere it runs on one, and `refineSwing` keeps to its time budget either
 * way.
 *
 * The ONNX Runtime library is imported dynamically, so none of it is in the
 * entry chunk: a player who never analyses a clip never parses it.
 */
import type { InferenceSession } from 'onnxruntime-web'
import { RTM_INPUT, RTM_MEAN, RTM_STD, decodeSimcc, rtmCrop, type Pt } from './rtmpose'
import { fetchStreamed } from '../engineDownload'
import { inEngineCache } from '../engineCache'
import { devModelUrl } from './devModels'

const BASE = import.meta.env?.BASE_URL || '/'
const MODEL_URL = `${BASE}models/rtmpose-s.onnx`
const ORT_DIR = `${BASE}ort/`

let session: InferenceSession | null = null
let pending: Promise<InferenceSession> | null = null

export const refineEnginePaths = () => ({ model: MODEL_URL, runtime: ORT_DIR })

export const refineEngineResident = (): boolean => session !== null

/** True once the refinement model and its runtime are cached, beside the pose engine's own check. */
export async function isRefineModelCached(): Promise<boolean> {
  // This build's engine cache only (L6.6).
  return inEngineCache([MODEL_URL, `${ORT_DIR}ort-wasm-simd-threaded.wasm`])
}

/** Load the refinement model. Safe to call repeatedly; the work happens once. */
export function loadRefineEngine(): Promise<InferenceSession> {
  if (session) return Promise.resolve(session)
  if (pending) return pending
  pending = (async () => {
    try {
      const ort = await import('onnxruntime-web/wasm')
      ort.env.wasm.wasmPaths = ORT_DIR
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated
        ? Math.min(4, navigator.hardwareConcurrency || 1)
        : 1
      // Streamed, so a download that stops arriving is rejected rather than
      // awaited forever, and `pending` cleared below (L6.1).
      const model = await fetchStreamed(devModelUrl('refine') ?? MODEL_URL)
      session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
      return session
    } catch (err) {
      pending = null
      throw err
    }
  })()
  return pending
}

/**
 * One RTMPose read of the player in `source`, inside `box` (source pixels).
 *
 * Returns the 17 COCO joints in source pixels with their scores. The crop is
 * drawn at the model's own 192 × 256 from the full-resolution frame, so a
 * distant player is read at every pixel the video has rather than at whatever
 * a whole-frame letterbox leaves of them.
 */
export async function readPose(
  sess: InferenceSession,
  source: CanvasImageSource,
  box: [number, number, number, number],
  canvas: HTMLCanvasElement,
): Promise<{ points: Pt[]; scores: number[] }> {
  const ort = await import('onnxruntime-web/wasm')
  const crop = rtmCrop(box)
  const { w, h } = RTM_INPUT
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const input = new Float32Array(3 * w * h)
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) input[c * w * h + i] = (px[i * 4 + c] - RTM_MEAN[c]) / RTM_STD[c]
  }
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, h, w]) })
  const [xName, yName] = sess.outputNames
  return decodeSimcc(out[xName].data as Float32Array, out[yName].data as Float32Array, 17, crop)
}
