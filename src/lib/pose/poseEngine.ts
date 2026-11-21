/*
 * Types only. The library itself is fetched when an engine is first wanted —
 * see `visionRuntime` below.
 */
import type { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { fetchStreamed } from '../engineDownload'
import { ENGINE_MANIFEST } from '../engineManifest'
import { inEngineCache } from '../engineCache'
import { devModelUrl } from './devModels'

/**
 * What `FilesetResolver.forVisionTasks` hands back.
 *
 * The library declares `WasmFileset` but does not export it, so it is named
 * here as the awaited return of the one call that produces it — which is what
 * `create` used to say inline, back when the resolver was a value in scope
 * rather than a type.
 */
type WasmFileset = Awaited<ReturnType<(typeof FilesetResolver)['forVisionTasks']>>

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
  // Streamed through `fetchStreamed`, which rejects a download that stops
  // arriving (L6.1): the catch in the loader then clears `pending`, so the
  // next attempt starts again instead of joining a dead one.
  const totalBytes = ENGINE_MANIFEST.find((f) => MODEL_URL.endsWith(f.path))?.bytes ?? 0
  let loadedBytes = 0
  return fetchStreamed(devModelUrl('pose') ?? MODEL_URL, {
    onChunk: (bytes) => {
      loadedBytes += bytes
      onProgress({
        stage: 'downloading',
        loadedBytes,
        totalBytes,
        ratio: totalBytes ? Math.min(1, loadedBytes / totalBytes) : undefined,
      })
    },
  })
}

/**
 * The MediaPipe library, fetched the first time an engine is actually wanted.
 *
 * Static, this was a third of the app's JavaScript sitting in the entry chunk:
 * the shell could not paint until the whole vision library had been downloaded
 * and parsed, on a phone, at a court. Nothing on the home screen needs it —
 * `isCachedOffline` asks the Cache API, `enginePaths` is two strings, and
 * `nextVideoTimestamp` only uses `PoseLandmarker` as a WeakMap key, which is a
 * type. The first thing that genuinely needs the library is an analysis or the
 * live viewfinder, and both of those are already about to fetch 19 MB of this
 * engine's own model and runtime, against which this is rounding error —
 * before an analysis's own second engine, `objectEngine.ts`, adds its own.
 *
 * The browser caches the module after the first call, so the repeated `import`
 * below costs one promise resolution per analysis rather than a second fetch.
 */
const visionRuntime = () => import('@mediapipe/tasks-vision')

async function create(
  buffer: Uint8Array,
  fileset: WasmFileset,
  delegate: 'GPU' | 'CPU',
) {
  const { PoseLandmarker } = await visionRuntime()
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
      // The library and the model in parallel, since neither waits on the
      // other — and the model is 9 MB against a few hundred kilobytes, so the
      // library is off the critical path either way.
      const [buffer, fileset] = await Promise.all([
        downloadModel(onProgress),
        visionRuntime().then((v) => v.FilesetResolver.forVisionTasks(WASM_DIR)),
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
 * Whether the engine is already built and sitting in memory.
 *
 * A cheaper, stricter question than `isCachedOffline` below, and it answers the
 * one thing a caller timing a pass actually wants to know: an engine already
 * resident cannot download anything, so no pass after the first can be cold.
 * `isCachedOffline` has to ask the Cache API three times, and every `caches.match`
 * walks every cache the origin owns — including the service worker's precache —
 * which is real work to establish something already known. A basket sweep runs
 * the pipeline once per serve, so that was up to six triple lookups per sweep for
 * a boolean that could only be false.
 *
 * Deliberately not a substitute for `isCachedOffline`, which answers the
 * different and durable question the offline badge is about: whether the assets
 * survive a reload. This one is about this session only.
 */
export const engineResident = (): boolean => landmarker !== null

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
const clocks = new WeakMap<PoseLandmarker, VideoClock>()

/**
 * The timestamp to hand the graph for one frame.
 *
 * It used to be the last one plus 33 ms, whatever the frame actually was. In
 * VIDEO mode MediaPipe carries each frame's region and its landmark filtering
 * into the next on the strength of that number, so the 12 fps scan (83 ms
 * apart), the fine pass (~31 ms apart) and the jump between one pass and the
 * next were all told they were 33 ms apart. Given the frame's media time, it
 * now says when the frame really was; given none — the live viewfinder — it
 * keeps the fixed step.
 *
 * A frame earlier than the last one (a new pass seeking back) cannot be
 * stamped with its own time, since the graph rejects that; the clock is moved
 * on so the frame lands `CLOCK_BREAK_MS` after the last, a gap the tracker
 * reads as a new stretch of video rather than as a joint that teleported.
 */
export const CLOCK_BREAK_MS = 1000

export interface VideoClock {
  /** Added to media time; grows at every backwards step. */
  offset: number
  last: number
  /** The last integer handed out. */
  stamped?: number
}

export function advanceClock(clock: VideoClock, mediaSeconds?: number): number {
  let next: number
  if (mediaSeconds === undefined || !Number.isFinite(mediaSeconds)) {
    next = clock.last + 33
  } else {
    next = clock.offset + mediaSeconds * 1000
    if (next <= clock.last) {
      clock.offset += clock.last + CLOCK_BREAK_MS - next
      next = clock.last + CLOCK_BREAK_MS
    }
  }
  // Whole milliseconds, strictly increasing: two frames under half a
  // millisecond apart would otherwise round to the same stamp.
  const stamp = Math.max(Math.round(next), (clock.stamped ?? 0) + 1)
  clock.last = next
  clock.stamped = stamp
  return stamp
}

export function nextVideoTimestamp(landmarker: PoseLandmarker, mediaSeconds?: number): number {
  let clock = clocks.get(landmarker)
  if (!clock) clocks.set(landmarker, (clock = { offset: 0, last: 0 }))
  return advanceClock(clock, mediaSeconds)
}

/**
 * True once the model and runtime are in the cache and the app works offline.
 *
 * Both runtime builds have to be asked about. `FilesetResolver` picks one at load
 * time — the SIMD build where the browser supports it, `_nosimd` where it does
 * not — and only the one it picked is ever fetched, so only that one is ever
 * cached. Checking for the SIMD build alone told every no-SIMD device that it was
 * not ready to work offline while it was sitting on a complete cache, which is
 * the answer most likely to send somebody looking for signal at a court that has
 * none.
 */
export async function isCachedOffline(): Promise<boolean> {
  // `globalThis`, not `window`, and outside no try block by accident: this line
  // used to sit above the `catch` below while naming a global that does not
  // exist off the main thread or in the test runner, so the one caller that
  // ever reached it from Node would have taken a ReferenceError rather than the
  // `false` every other failure here returns. Nothing reached it until
  // `runAnalysis` began asking whether the engine was cold; found then rather
  // than by a crash, and fixed at the source rather than guarded at the call.
  // In this build's engine cache only (L6.6): an older version's files are
  // not this version's, and an upgrade would fetch these on first use.
  const [simd, nosimd] = await Promise.all([
    inEngineCache([MODEL_URL, `${WASM_DIR}/vision_wasm_internal.wasm`]),
    inEngineCache([MODEL_URL, `${WASM_DIR}/vision_wasm_nosimd_internal.wasm`]),
  ])
  return simd || nosimd
}
