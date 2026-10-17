/**
 * Every file the engines download, with its size, fixed at build time (L6.1).
 *
 * The paths are listed here; the sizes are read off `public/` by
 * `vite.config.ts` when the app is built, and by the test runner, and handed
 * in as `__ENGINE_MANIFEST__`. So the "57 MB" on the home screen is the files
 * themselves rather than a number somebody typed, and the download bar is one
 * bar over all of them.
 *
 * MediaPipe's runtime comes in a SIMD build and a fallback without; every
 * phone this app supports runs the SIMD one, so that is the one fetched and
 * counted.
 */
export interface EngineFile {
  /** Relative to the app's base. */
  path: string
  bytes: number
}

export const ENGINE_FILES: readonly string[] = [
  'models/pose_landmarker_full.task',
  'wasm/vision_wasm_internal.js',
  'wasm/vision_wasm_internal.wasm',
  'models/efficientdet_lite0.tflite',
  'models/rtmpose-s.onnx',
  'ort/ort-wasm-simd-threaded.mjs',
  'ort/ort-wasm-simd-threaded.wasm',
]

declare const __ENGINE_MANIFEST__: readonly EngineFile[] | undefined

/** The files with their sizes, or none where the build did not supply them. */
export const ENGINE_MANIFEST: readonly EngineFile[] =
  typeof __ENGINE_MANIFEST__ !== 'undefined' ? __ENGINE_MANIFEST__ : []

/** What the whole download weighs, in bytes. */
export const engineBytes = (files: readonly EngineFile[] = ENGINE_MANIFEST): number =>
  files.reduce((n, f) => n + f.bytes, 0)

/**
 * Megabytes for a sentence, rounded. When no manifest was built in, the
 * figure last measured, so a sentence never says "0 MB".
 */
export const engineMegabytes = (files: readonly EngineFile[] = ENGINE_MANIFEST): number =>
  files.length ? Math.round(engineBytes(files) / 1e6) : 57
