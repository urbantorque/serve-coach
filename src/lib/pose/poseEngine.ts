import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

/**
 * Where the model and the wasm runtime live, relative to wherever the app is served.
 *
 * These were absolute paths from the domain root, which silently assumed the app
 * owns the whole origin. Hosted under a subpath — a GitHub Pages project site,
 * a staging folder, an app mounted inside a club's existing website — `/models/`
 * resolves to somewhere that does not exist, the model fetch 404s, and the app
 * fails at the one step it cannot do without. Vite substitutes `BASE_URL` at
 * build time and always leaves it with a trailing slash.
 *
 * Read defensively, because Vite only substitutes it for a browser build: the
 * engine tests are bundled for Node, where `import.meta.env` does not exist, and
 * this module is reachable from them through `analyze.ts`. Without the fallback
 * the entire suite dies on an unrelated import before a single check runs.
 */
const BASE = import.meta.env?.BASE_URL || '/'
const WASM_DIR = `${BASE}wasm`
const MODEL_URL = `${BASE}models/pose_landmarker_full.task`

export type EngineStage = 'idle' | 'downloading' | 'starting' | 'ready' | 'failed'

export interface EngineProgress {
  stage: EngineStage
  /** 0–1 while downloading, otherwise undefined. */
  ratio?: number
  loadedBytes?: number
  totalBytes?: number
}

let landmarker: PoseLandmarker | null = null
let pending: Promise<PoseLandmarker> | null = null
let usingDelegate: 'GPU' | 'CPU' = 'GPU'

/** Fetch the model ourselves so the first-run download has a real progress bar. */
async function downloadModel(onProgress: (p: EngineProgress) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Could not load the pose model (HTTP ${res.status}).`)

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

async function create(
  buffer: Uint8Array,
  fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  delegate: 'GPU' | 'CPU',
) {
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      // A copy per attempt: the task runner takes ownership of the buffer it is
      // handed, so reusing it after a failed GPU attempt would read freed memory.
      modelAssetBuffer: new Uint8Array(buffer),
      delegate,
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  })
}

/**
 * Load the pose model. Safe to call repeatedly — the work happens once and
 * every later caller gets the same instance.
 */
export function loadEngine(onProgress: (p: EngineProgress) => void = () => {}): Promise<PoseLandmarker> {
  if (landmarker) {
    onProgress({ stage: 'ready' })
    return Promise.resolve(landmarker)
  }
  if (pending) return pending

  pending = (async () => {
    try {
      const [buffer, fileset] = await Promise.all([
        downloadModel(onProgress),
        FilesetResolver.forVisionTasks(WASM_DIR),
      ])
      onProgress({ stage: 'starting' })

      try {
        landmarker = await create(buffer, fileset, 'GPU')
        usingDelegate = 'GPU'
      } catch {
        // Plenty of mobile browsers advertise WebGL but fail to bind the
        // delegate. CPU is slower but always works.
        landmarker = await create(buffer, fileset, 'CPU')
        usingDelegate = 'CPU'
      }

      onProgress({ stage: 'ready' })
      return landmarker
    } catch (err) {
      pending = null
      onProgress({ stage: 'failed' })
      throw err
    }
  })()

  return pending
}

export const engineDelegate = () => usingDelegate

/**
 * The resolved asset paths, so a test can check them without a bundler.
 *
 * Exposed deliberately: these are the two URLs the app cannot start without, and
 * they are assembled from a build-time substitution that does not happen in Node.
 * That combination has already broken the suite once.
 */
export const enginePaths = () => ({ model: MODEL_URL, wasm: WASM_DIR })

/**
 * Monotonically increasing timestamps for `detectForVideo`, keyed to the
 * landmarker they belong to.
 *
 * The wasm graph rejects a timestamp lower than one it has already seen, and it
 * remembers across calls — so this counter has to live as long as the
 * landmarker does, and reset exactly when the landmarker is replaced. Hanging
 * it off a module-level variable instead is subtly wrong: the landmarker is a
 * singleton shared by every analysis, and any second copy of the counter (a
 * duplicated module, a second caller) restarts it from zero and the graph
 * throws. A WeakMap ties the invariant to the object that enforces it.
 */
const clocks = new WeakMap<PoseLandmarker, number>()

export function nextVideoTimestamp(landmarker: PoseLandmarker): number {
  const next = (clocks.get(landmarker) ?? 0) + 33
  clocks.set(landmarker, next)
  return next
}

/** True once the model and runtime are in the cache and the app works offline. */
export async function isCachedOffline(): Promise<boolean> {
  if (!('caches' in window)) return false
  try {
    const model = await caches.match(MODEL_URL)
    const wasm = await caches.match(`${WASM_DIR}/vision_wasm_internal.wasm`)
    return Boolean(model && wasm)
  } catch {
    return false
  }
}

export function disposeEngine(): void {
  landmarker?.close()
  landmarker = null
  pending = null
}
