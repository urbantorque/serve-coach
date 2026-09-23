/*
 * Types only. The library itself is fetched when an engine is first wanted —
 * see `poseEngine.ts`'s `visionRuntime` for why, and the same reasoning
 * applies here unchanged: nothing on the home screen needs an object
 * detector, and it is the same MediaPipe package already being fetched for
 * pose, so the second `import()` costs one promise resolution, not a second
 * download of the library itself.
 */
import type { FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'

type WasmFileset = Awaited<ReturnType<(typeof FilesetResolver)['forVisionTasks']>>

/**
 * Where the model lives, relative to wherever the app is served — see
 * `poseEngine.ts`'s `BASE` comment for why this is read defensively rather
 * than as a bare `/models/...` path. The WASM runtime is shared with the pose
 * engine; `FilesetResolver.forVisionTasks` is called with the same directory
 * either way and MediaPipe resolves each task's own binary inside it.
 */
const BASE = import.meta.env?.BASE_URL || '/'
const WASM_DIR = `${BASE}wasm`
const MODEL_URL = `${BASE}models/efficientdet_lite0.tflite`

/**
 * COCO classes this app ever asks about. EfficientDet-Lite0 was trained on all
 * eighty; filtering at the call site rather than by an allowlist argument to
 * `ObjectDetector.createFromOptions` because `categoryAllowlist` compares
 * against the label file's exact strings, and getting that string wrong would
 * silently return nothing rather than fail loudly — filtering typed results
 * with `===` fails loudly on a rename instead, at the point of use.
 */
export const RACKET_CATEGORY = 'tennis racket'

export type EngineStage = 'idle' | 'downloading' | 'starting' | 'ready' | 'failed'

export interface EngineProgress {
  stage: EngineStage
  ratio?: number
  loadedBytes?: number
  totalBytes?: number
}

let detector: ObjectDetector | null = null
let pending: Promise<ObjectDetector> | null = null

/** Same streamed download as `poseEngine.ts`'s, for the same reason: a real progress bar on first run. */
async function downloadModel(onProgress: (p: EngineProgress) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Could not load the object model (HTTP ${res.status}).`)

  const totalBytes = Number(res.headers.get('content-length')) || 0
  if (!res.body) return new Uint8Array(await res.arrayBuffer())

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loadedBytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loadedBytes += value.length
    onProgress({
      stage: 'downloading',
      loadedBytes,
      totalBytes,
      ratio: totalBytes ? loadedBytes / totalBytes : undefined,
    })
  }

  const out = new Uint8Array(loadedBytes)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

const visionRuntime = () => import('@mediapipe/tasks-vision')

async function create(buffer: Uint8Array, fileset: WasmFileset, delegate: 'GPU' | 'CPU') {
  const { ObjectDetector } = await visionRuntime()
  return ObjectDetector.createFromOptions(fileset, {
    baseOptions: {
      modelAssetBuffer: new Uint8Array(buffer),
      delegate,
    },
    runningMode: 'VIDEO',
    // One racket per player, and a low floor: `racketFromBox` already refuses
    // a box the wrist is nowhere near, so a generous floor costs nothing here
    // and a tight one risks losing the racket exactly when it matters most —
    // side-on, mid-swing, partly behind the body.
    maxResults: 3,
    scoreThreshold: 0.2,
  })
}

/**
 * Load the object-detection model. Safe to call repeatedly, same as
 * `poseEngine.ts`'s `loadEngine` — the work happens once and every later
 * caller gets the same instance.
 */
export function loadObjectEngine(
  onProgress: (p: EngineProgress) => void = () => {},
): Promise<ObjectDetector> {
  if (detector) {
    onProgress({ stage: 'ready' })
    return Promise.resolve(detector)
  }
  if (pending) return pending

  pending = (async () => {
    try {
      const [buffer, fileset] = await Promise.all([
        downloadModel(onProgress),
        visionRuntime().then((v) => v.FilesetResolver.forVisionTasks(WASM_DIR)),
      ])
      onProgress({ stage: 'starting' })

      try {
        detector = await create(buffer, fileset, 'GPU')
      } catch {
        detector = await create(buffer, fileset, 'CPU')
      }

      onProgress({ stage: 'ready' })
      return detector
    } catch (err) {
      pending = null
      onProgress({ stage: 'failed' })
      throw err
    }
  })()

  return pending
}

export const objectEngineResident = (): boolean => detector !== null

export const objectEnginePaths = () => ({ model: MODEL_URL })

/**
 * True once the object model is in the cache — the WASM runtime is not
 * checked here because it is the same file, at the same URL, that
 * `poseEngine.ts`'s `isCachedOffline` already checks: this engine and the
 * pose engine both call `FilesetResolver.forVisionTasks` against the same
 * `WASM_DIR`, so whichever engine warmed first is what put it in the cache.
 * A combined "ready offline" answer needs both checks; see `App.tsx`.
 */
export async function isObjectModelCached(): Promise<boolean> {
  if (!('caches' in globalThis)) return false
  try {
    return Boolean(await caches.match(MODEL_URL))
  } catch {
    return false
  }
}

/**
 * Monotonically increasing timestamps, same reasoning and same shape as
 * `poseEngine.ts`'s `nextVideoTimestamp` — a second WeakMap rather than a
 * shared one because this engine's clock and the pose engine's clock are
 * unrelated counters against two different WASM graphs, and merging them
 * would make one detector's timestamp depend on how many frames the other
 * one happened to process first.
 */
const clocks = new WeakMap<ObjectDetector, number>()

export function nextObjectTimestamp(det: ObjectDetector): number {
  const next = (clocks.get(det) ?? 0) + 33
  clocks.set(det, next)
  return next
}

/** One detection, in 0–1 image coordinates — MediaPipe hands back pixels. */
export interface Detection {
  category: string
  score: number
  box: { x: number; y: number; width: number; height: number }
}

/**
 * Run the loaded detector on one frame and keep only the racket.
 *
 * Takes an `ImageData` rather than this app's own `Bitmap` type even though
 * the two are structurally identical (`{data, width, height}`): MediaPipe's
 * WASM binding checks `instanceof ImageData` rather than duck-typing, which
 * is also why this file — unlike `ballTrack.ts` and `outbound.ts` beside it —
 * cannot be DOM-free. It only ever runs from `analyze.ts`'s browser pixel
 * pass, never from the Node test runner; `racketFromBox` in `racket.ts` is
 * where the DOM-free, testable geometry lives.
 */
export function detectRacket(
  det: ObjectDetector,
  image: ImageData,
  timestampMs: number,
): Detection[] {
  const result = det.detectForVideo(image, timestampMs)
  const w = image.width
  const h = image.height
  const out: Detection[] = []
  for (const d of result.detections) {
    const category = d.categories[0]?.categoryName
    if (category !== RACKET_CATEGORY) continue
    const bb = d.boundingBox
    if (!bb) continue
    out.push({
      category,
      score: d.categories[0].score,
      box: { x: bb.originX / w, y: bb.originY / h, width: bb.width / w, height: bb.height / h },
    })
  }
  return out
}
