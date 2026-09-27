// Copies the MediaPipe Tasks Vision wasm runtime into public/ so the app loads it from its own origin
// (offline-capable, no CDN). Runs on postinstall.
//
// Only the variants the pose loader can request are copied (measured in Edge 2026-09-28 with
// src/platform/pwa/pwa-check.mjs; see src/platform/README.md "MediaPipe wasm variants"):
// - vision_wasm_module_internal.{js,wasm}: the pose worker (useModule loader). This is what analysis
//   and live framing load in Chromium, Safari 17+ and WKWebView when module workers run. Precached.
// - vision_wasm_internal.{js,wasm}: the main-thread fallback when the pose worker cannot start
//   (MediaPipePoseSource falls back; FilesetResolver picks it when WebAssembly SIMD works, which it does
//   in Safari 16.4+ and every current engine). Not precached; cached on first use.
// Dropped: vision_wasm_nosimd_internal.{js,wasm} (about 11 MB), only for engines without WebAssembly
// SIMD (Safari before 16.4, Chrome before 91), which cannot run the analysis worker path anyway.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(appDir, 'node_modules/@mediapipe/tasks-vision/wasm')
const targetDir = resolve(appDir, 'public/mediapipe/wasm')

const KEEP = [
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
]

if (!existsSync(sourceDir)) {
  console.error(`copy-mediapipe: ${sourceDir} not found. Is @mediapipe/tasks-vision installed?`)
  process.exit(1)
}

const available = readdirSync(sourceDir)
const missing = KEEP.filter((f) => !available.includes(f))
if (missing.length) {
  // A tasks-vision upgrade renamed its files: stop rather than ship an app whose pose loader 404s.
  console.error(`copy-mediapipe: expected files missing from tasks-vision: ${missing.join(', ')}. Check the loader's variant names.`)
  process.exit(1)
}

rmSync(targetDir, { recursive: true, force: true })
mkdirSync(targetDir, { recursive: true })
let bytes = 0
for (const f of KEEP) {
  copyFileSync(resolve(sourceDir, f), resolve(targetDir, f))
  bytes += statSync(resolve(targetDir, f)).size
}
const skipped = available.filter((f) => !KEEP.includes(f))
console.log(`copy-mediapipe: copied ${KEEP.length} files (${(bytes / 1e6).toFixed(1)} MB) to ${targetDir}; left out ${skipped.join(', ') || 'nothing'}`)
