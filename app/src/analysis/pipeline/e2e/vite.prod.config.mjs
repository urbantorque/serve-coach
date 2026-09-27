/**
 * Production-build configuration for the pipeline end-to-end runs (dev only; never shipped).
 *
 * The app's own vite.config.ts builds index.html only. This config builds the SAME app (same
 * plugins, code splitting, workers, target) plus the e2e page, into node_modules/.serve-e2e/dist
 * (git-ignored, never the app's dist/), so the accuracy runs exercise minified production bundles,
 * production workers and the production MediaPipe asset paths rather than the dev server's
 * on-the-fly modules. `vite preview` then serves the build, and the synthetic corpus under
 * /__synthetic/ (the dev-only corpus plugin has no preview hook, so this config adds one; nothing
 * of the corpus is copied into the build).
 *
 *   node node_modules/vite/bin/vite.js build   --config src/analysis/pipeline/e2e/vite.prod.config.mjs
 *   node node_modules/vite/bin/vite.js preview --config src/analysis/pipeline/e2e/vite.prod.config.mjs --port 5401 --strictPort
 *
 * e2e/server.mjs does both for perf-bench.mjs, run-e2e.mjs and tools/validate/e2e-accuracy.mjs.
 */
import { createReadStream, statSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import base from '../../../../vite.config.ts'
import { parseByteRange, resolveCorpusPath, SYNTHETIC_CORPUS_PREFIX } from '../../../../vite/syntheticCorpus.ts'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../../../..')
export const E2E_PROD_OUT_DIR = resolve(appRoot, 'node_modules/.serve-e2e/dist')
const corpusRoot = resolve(appRoot, '../validation/synthetic')

const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
}

/** The corpus middleware of vite/syntheticCorpus.ts, for `vite preview` (same path rules, ranges). */
function previewCorpusPlugin() {
  return {
    name: 'serve-coach:synthetic-corpus-preview',
    apply: 'serve',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url ?? '').split('?')[0]
        if (!urlPath.startsWith(SYNTHETIC_CORPUS_PREFIX)) return next()
        const fail = (status, message) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(message)
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'GET or HEAD only')
        const file = resolveCorpusPath(corpusRoot, urlPath)
        if (!file) return fail(404, 'not in the synthetic corpus')
        let size
        try {
          const stat = statSync(file)
          if (!stat.isFile()) return fail(404, 'not a file')
          size = stat.size
        } catch {
          return fail(404, 'not found (render the corpus with tools/synth first)')
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(file).toLowerCase()])
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Cache-Control', 'no-store')
        const range = parseByteRange(req.headers.range, size)
        if (range === 'unsatisfiable') {
          res.setHeader('Content-Range', `bytes */${size}`)
          return fail(416, 'range not satisfiable')
        }
        const { start, end } = range ?? { start: 0, end: size - 1 }
        res.statusCode = range ? 206 : 200
        if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
        res.setHeader('Content-Length', String(size === 0 ? 0 : end - start + 1))
        if (req.method === 'HEAD' || size === 0) return void res.end()
        createReadStream(file, { start, end }).pipe(res)
      })
    },
  }
}

const baseInput = base.build?.rolldownOptions?.input ?? { main: resolve(appRoot, 'index.html') }

export default {
  ...base,
  root: appRoot,
  // Vitest settings are irrelevant to a build.
  test: undefined,
  plugins: [...(base.plugins ?? []), previewCorpusPlugin()],
  build: {
    ...base.build,
    outDir: E2E_PROD_OUT_DIR,
    emptyOutDir: true,
    rolldownOptions: {
      ...base.build?.rolldownOptions,
      input: { ...baseInput, pipelineE2E: resolve(here, 'pipeline-e2e.html') },
    },
  },
}
