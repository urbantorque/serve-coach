#!/usr/bin/env node
/**
 * Performance bench of the production pipeline (dev only). Runs pipeline-e2e.html once per clip and
 * variant in headless Edge, in a fresh browser context each time (cold model start, as a player
 * would see it), and writes the report, stage timings, pose-source stats and the engine dump
 * (?dump=1: input poses, output serves) to one JSON file per run. perf-accuracy.mts scores the
 * dumps against the clip's truth.
 *
 *   node src/analysis/pipeline/e2e/perf-bench.mjs --port 5304 --clips baseline-s1,session \
 *        --variants "perf=legacy|" [--repeat 1] [--out DIR] [--tag before]
 *
 * Variants are '|'-separated extra query strings ('' = the defaults). Runs are interleaved
 * (clip 1 all variants, clip 2 all variants, ...) so machine-load drift hits every variant alike.
 * Needs a dev server: npx vite --port 5304 --strictPort.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../../../..')
const repoRoot = resolve(appRoot, '..')
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const port = Number(arg('port', '5304'))
const clipIds = arg('clips', 'baseline-s1').split(',').filter(Boolean)
const variants = arg('variants', '').split('|')
const repeat = Number(arg('repeat', '1'))
const tag = arg('tag', '')
const outDir = resolve(arg('out', join(repoRoot, 'validation/results/ui/harden-performance/bench')))
const timeoutMs = Number(arg('timeout-min', '30')) * 60_000

const manifest = JSON.parse(await readFile(join(repoRoot, 'validation/synthetic/manifest.json'), 'utf8'))
const clips = clipIds.map((id) => {
  const c = manifest.clips.find((x) => x.id === id)
  if (!c?.files?.mp4) throw new Error(`clip ${id} not in the manifest`)
  return c
})

const slug = (v) => (v ? v.replace(/[^a-z0-9=,.-]+/gi, '_').replace(/=/g, '-') : 'default')

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const summary = []
try {
  for (let rep = 0; rep < repeat; rep++) {
    for (const clip of clips) {
      for (const variant of variants) {
        const q = new URLSearchParams({
          clip: `/__synthetic/${clip.files.mp4}`,
          view: clip.camera?.view ?? 'side',
          heightM: String(clip.player?.heightM ?? 1.8),
          hand: clip.player?.handedness ?? 'right',
          dump: '1',
        })
        const url = `http://localhost:${port}/src/analysis/pipeline/e2e/pipeline-e2e.html?${q}${variant ? `&${variant}` : ''}`
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
        const page = await context.newPage()
        const consoleLines = []
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleLines.push(`error: ${msg.text()}`)
        })
        page.on('pageerror', (err) => consoleLines.push(`pageerror: ${err.message}`))
        const started = Date.now()
        await page.goto(url)
        await page.waitForFunction(() => window.__pipelineE2E && window.__pipelineE2E.state !== 'running', null, { timeout: timeoutMs, polling: 1000 })
        const wallS = (Date.now() - started) / 1000
        const report = await page.evaluate(() => window.__pipelineE2E)
        const dump = await page.evaluate(() => window.__pipelineDump ?? null)
        await context.close()
        const t = report.result?.timings
        const name = `${clip.id}__${slug(variant)}${tag ? `__${tag}` : ''}${repeat > 1 ? `__r${rep + 1}` : ''}`
        await writeFile(join(outDir, `${name}.json`), JSON.stringify({ clip: clip.id, variant, tag, rep: rep + 1, wallS, console: consoleLines, report, dump }))
        const line = t
          ? `${name}: ${report.state} wall ${wallS.toFixed(1)} s; total ${(t.totalMs / 1000).toFixed(1)} s = init ${(t.poseInitMs / 1000).toFixed(1)} + A ${(t.sparseMs / 1000).toFixed(1)} (${t.sparseCoarseFrames}+${t.sparseFillFrames}) + B ${(t.denseMs / 1000).toFixed(1)} (pose ${(t.densePoseMs / 1000).toFixed(1)}, ball ${(t.denseBallMs / 1000).toFixed(1)}; ${t.poseFrames} pose / ${t.ballFrames} ball fr) + keyframes ${(t.keyFramesMs / 1000).toFixed(1)}; serves ${report.result.servesFound}; errors ${consoleLines.length}`
          : `${name}: ${report.state} ${JSON.stringify(report.error)}`
        console.log(line)
        summary.push(line)
      }
    }
  }
} finally {
  await browser.close()
}
