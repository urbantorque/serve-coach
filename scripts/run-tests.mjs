/**
 * Bundles each engine test file with esbuild (already present via Vite) and runs
 * them in Node. The analysis engine is pure TypeScript with no DOM
 * dependencies, so it needs no browser to test.
 *
 * Files run in separate processes so one suite calling `process.exit` cannot
 * stop the others, and so a crash is attributed to the file that caused it.
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Every `__tests__` directory under `src`, not one hard-coded path.
 *
 * It used to be `src/lib/analysis/__tests__` and nothing else, which quietly
 * decided which parts of the app could be tested at all: the pose overlay and
 * the components had nowhere to put a test, so the ghost target shipped with no
 * coverage and its author recorded that they could not add any. A discovery
 * rule is not the place to make that call.
 *
 * Walked rather than globbed to keep this dependency-free, and `node_modules`
 * is not under `src` so there is nothing to exclude.
 */
const testDirs = (function find(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const full = path.join(dir, entry.name)
    if (entry.name === '__tests__') out.push(full)
    else out.push(...find(full))
  }
  return out
})(path.join(root, 'src')).sort()

/**
 * Where the bundled test files are written before Node runs them.
 *
 * Overridable because the path is shared state, and it is written and then
 * executed a moment later. Two suites running at once against one checkout —
 * two terminals, a watch task beside a manual run, several agents working the
 * same tree — have esbuild writing `serve-coach-engine.test.mjs` while Node is
 * reading it for the other run. The failure that produces is the worst kind:
 * intermittent, attributed to whichever test file happened to be mid-write, and
 * completely absent on a re-run.
 *
 * Defaults to the old location, so nothing that does not set it changes.
 */
const cache = process.env.SERVE_COACH_TEST_CACHE
  ? path.resolve(process.env.SERVE_COACH_TEST_CACHE)
  : path.join(root, 'node_modules', '.cache')

fs.mkdirSync(cache, { recursive: true })

// Full paths, because two directories may hold a `ball.test.ts` each. The
// bundle name below is derived from the path for the same reason.
const files = testDirs
  .flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => path.join(dir, f)),
  )
  .sort()

if (files.length === 0) {
  console.error('No test files found under', path.join(root, 'src'))
  process.exit(1)
}

let failed = 0

for (const file of files) {
  const name = path.relative(root, file).replace(/[\\/]/g, '-').replace(/\.ts$/, '')
  const outfile = path.join(cache, `serve-coach-${name}.mjs`)

  await build({
    entryPoints: [file],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    logLevel: 'warning',
    // Fixtures are JSON; without this esbuild treats them as JS and fails.
    loader: { '.json': 'json' },
  })

  const res = spawnSync(process.execPath, [outfile], { stdio: 'inherit' })
  if ((res.status ?? 1) !== 0) failed++
}

process.exit(failed === 0 ? 0 : 1)
