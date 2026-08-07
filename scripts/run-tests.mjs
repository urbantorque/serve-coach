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
const testDir = path.join(root, 'src', 'lib', 'analysis', '__tests__')
const cache = path.join(root, 'node_modules', '.cache')

fs.mkdirSync(cache, { recursive: true })

const files = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()

if (files.length === 0) {
  console.error('No test files found in', testDir)
  process.exit(1)
}

let failed = 0

for (const file of files) {
  const outfile = path.join(cache, `serve-coach-${file.replace(/\.ts$/, '')}.mjs`)

  await build({
    entryPoints: [path.join(testDir, file)],
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
