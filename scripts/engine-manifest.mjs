/**
 * The engine files and their sizes, read off `public/` (L6.1).
 *
 * The list itself lives in `src/lib/engineManifest.ts`, where the app reads it,
 * and is read out of that file here so there is one list. The build
 * (`vite.config.ts`) and the test runner (`run-tests.mjs`) both hand the
 * result to the app as `__ENGINE_MANIFEST__`.
 */
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export function engineFiles(root) {
  const src = readFileSync(path.join(root, 'src', 'lib', 'engineManifest.ts'), 'utf8')
  const block = /export const ENGINE_FILES[^=]*=\s*\[([\s\S]*?)\]/.exec(src)
  if (!block) throw new Error('ENGINE_FILES not found in src/lib/engineManifest.ts')
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/** Each file with its size. A file missing from `public/` is a broken build, and says so. */
export function engineManifest(root) {
  return engineFiles(root).map((p) => {
    const file = path.join(root, 'public', p)
    try {
      return { path: p, bytes: statSync(file).size }
    } catch {
      throw new Error(`engine file missing: public/${p} (run npm run setup:assets)`)
    }
  })
}

/**
 * The service worker's engine cache name, from the two libraries it holds
 * runtimes for (L6.6). The worker's route, the app's readiness check and the
 * test runner all read it from here, so they cannot name different caches.
 */
export function engineCacheName(root) {
  const version = (pkg) => JSON.parse(readFileSync(path.join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version
  return `serve-coach-pose-engine-${version('@mediapipe/tasks-vision')}-ort-${version('onnxruntime-web')}`
}
