#!/usr/bin/env node
/**
 * Runs the pipeline bench (`pipeline.html`, N2.8) in Chrome: the Bath serves
 * drawn as the app's figure, read by the app's whole path, and every card
 * reading set against the same reading off the true markers. Writes
 * docs/next/bench/pipeline.json after every batch, so a crash keeps what ran.
 *
 *   node scripts/pipeline.mjs                       every Bath serve, in batches of six
 *   node scripts/pipeline.mjs 1,6,39                these serves
 *   node scripts/pipeline.mjs --look stage          the app's dark stage instead of a court
 *   node scripts/pipeline.mjs --batch 4 --out pilot.json
 *   node scripts/pipeline.mjs --summarise            total the saved rows again, reading nothing
 *   node scripts/pipeline.mjs 39 --debug            every sample's wrists and knee beside the truth
 *   node scripts/pipeline.mjs 39 --no-crop          the pose model on whole frames, no person crop
 *
 * Needs the dev server (BASE, default http://localhost:5180) and
 * `npm run setup:bench` for the Bath serves. Each batch gets a fresh browser:
 * headless Chrome has died after long runs on a busy machine. Dev tooling:
 * nothing here ships. Uses the Playwright copy `playwright-cli` runs on.
 */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const base = process.env.BASE ?? 'http://localhost:5180'
const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const at = args.indexOf(name)
  return at < 0 ? fallback : args[at + 1]
}
const look = flag('--look', 'court')
const batchSize = Number(flag('--batch', 6))
const outName = flag('--out', 'pipeline.json')
const named = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'))

const data = join(root, 'bench-data', 'bath-serve')
if (!named && !existsSync(data)) {
  console.error('No Bath serve data. Run `npm run setup:bench` first.')
  process.exit(2)
}
const serves = named
  ? named.split(',')
  : readdirSync(data)
      .map((f) => /^4D_(\d+)\.mat$/.exec(f)?.[1])
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b))

// The arithmetic, bundled out of the TypeScript the page uses, so both total alike.
const bundle = join(tmpdir(), `serve-coach-pipeline-score-${process.pid}.mjs`)
await build({ entryPoints: [join(root, 'src', 'dev', 'bench', 'pipelineScore.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'warning' })
const { summarise, formatSummary } = await import(pathToFileURL(bundle).href)
rmSync(bundle, { force: true })

const outDir = join(root, 'docs', 'next', 'bench')
mkdirSync(outDir, { recursive: true })
// A bare name lands beside the other benches; a path (a pilot's scratch file) lands there.
const outFile = /[\\/]/.test(outName) ? outName : join(outDir, outName)

// `--summarise`: total the rows already in the file again with today's
// arithmetic, and read no serve.
if (args.includes('--summarise')) {
  const saved = JSON.parse(readFileSync(outFile, 'utf8'))
  saved.summary = summarise(saved.rows)
  writeFileSync(outFile, JSON.stringify(saved, null, 1) + '\n')
  console.log(formatSummary(saved.summary))
  process.exit(0)
}

const require = createRequire(join(root, 'package.json'))
const pw = require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))
const rows = []
let still
const startedAt = new Date().toISOString()

function save(complete) {
  const summary = summarise(rows)
  writeFileSync(
    outFile,
    JSON.stringify({ ranAt: startedAt, about: 'docs/next/LEDGER.md, N2.8', look, fps: 30, placement: 'the filming guide: 4.5 m to the left, lens at 1 m, upright 9:16', complete, summary, rows }, null, 1) + '\n',
  )
  return summary
}

for (let i = 0; i < serves.length; i += batchSize) {
  const batch = serves.slice(i, i + batchSize)
  console.log(`\nbatch ${batch.join(',')}`)
  const browser = await pw.chromium.launch({ channel: 'chrome' })
  let got = []
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('console', (m) => {
      if (m.type() === 'log' || m.type() === 'error') console.log(m.text().slice(0, 400))
    })
    page.on('pageerror', (e) => console.log(`pageerror: ${String(e).slice(0, 200)}`))
    await page.goto(`${base}/pipeline.html?serves=${batch.join(',')}&look=${look}${args.includes('--debug') ? '&debug=1' : ''}${args.includes('--no-crop') ? '&crop=off' : ''}`, { waitUntil: 'load' })
    const deadline = Date.now() + batch.length * 8 * 60_000
    for (;;) {
      got = (await page.evaluate(() => window.__pipeline ?? [])) ?? got
      if (await page.evaluate(() => window.__pipelineDone === true)) break
      if (Date.now() > deadline) {
        console.log('batch timed out')
        break
      }
      await page.waitForTimeout(3000)
    }
    still ??= await page.evaluate(() => window.__pipelineStill)
  } catch (e) {
    console.log(`batch broke: ${String(e).slice(0, 200)}`)
  } finally {
    await browser.close().catch(() => undefined)
  }
  for (const n of batch) {
    const row = got.find((r) => r.serve === `bath-${n}`)
    rows.push(row ?? { serve: `bath-${n}`, look, gate: 'on', outcome: 'failed', detail: 'the page stopped before this serve', frames: 0, found: 0, onFigure: 0, wristSeen: 0, refined: 0 })
  }
  save(false)
}

if (still) writeFileSync(outFile.replace(/\.json$/, '-figure.jpg'), Buffer.from(still.split(',')[1], 'base64'))
const summary = save(true)
console.log('\n' + formatSummary(summary))
console.log(`\nwrote ${rows.length} rows to ${outFile}`)
