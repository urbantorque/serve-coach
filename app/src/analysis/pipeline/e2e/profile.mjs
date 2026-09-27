#!/usr/bin/env node
/**
 * Profiling and tuning runs of the pipeline e2e page (dev only). Runs one clip under several query
 * variants and prints stage times and the serve windows found against the clip's truth.
 *
 *   node src/analysis/pipeline/e2e/profile.mjs --clip clips/session/session.mp4 --variants "|passA=uniform" [--port 5202] [--warm]
 *
 * Variants are '|'-separated extra query strings ('' = defaults). Examples: noBall=1 (pose alone),
 * passA=uniform (Pass A at 15 Hz everywhere), engine=double (test-double engine).
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../../..')
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const port = Number(arg('port', '5202'))
const clip = arg('clip', 'clips/baseline-s1/baseline-s1.mp4')
const variants = arg('variants', '|noBall=1').split('|')

const truthPath = join(repoRoot, 'validation/synthetic', dirname(clip), 'truth.json')
const truth = JSON.parse(await readFile(truthPath, 'utf8'))
const contacts = truth.serves.map((s) => s.events.contact?.tReal).filter((t) => typeof t === 'number')

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await context.newPage()
async function run(query) {
  await page.goto(`http://localhost:${port}/src/analysis/pipeline/e2e/pipeline-e2e.html?clip=/__synthetic/${clip}&${query}`)
  await page.waitForFunction(() => window.__pipelineE2E && window.__pipelineE2E.state !== 'running', null, { timeout: 1_500_000, polling: 1000 })
  return page.evaluate(() => window.__pipelineE2E)
}
if (args.includes('--warm')) await run('')
const s = (ms) => (ms / 1000).toFixed(1)
for (const variant of variants) {
  const r = await run(variant)
  const t = r.result?.timings
  if (!t) {
    console.log(variant || 'defaults', r.state, r.error)
    continue
  }
  const windows = r.result.serveFinding.windows
  const matched = contacts.map((c) => windows.findIndex((w) => c >= w.startReal && c <= w.endReal))
  console.log(
    `${variant || 'defaults'}: ${r.state}, total ${s(t.totalMs)} s; passA ${s(t.sparseMs)} s (${t.sparseCoarseFrames} + ${t.sparseFillFrames} frames); passB ${s(t.denseMs)} s (pose ${s(t.densePoseMs)}, ball ${s(t.denseBallMs)}, readback ${s(t.ballReadbackMs)}); key frames ${s(t.keyFramesMs)} s`,
  )
  console.log(`  engine windows ${r.result.serveFinding.engineWindows}, planned ${windows.length}; truth contacts in a window: ${matched.filter((m) => m >= 0).length} of ${contacts.length}`)
  contacts.forEach((c, i) => {
    const w = windows[matched[i]]
    console.log(`    contact ${c.toFixed(2)} s -> ${w ? `window ${w.startReal.toFixed(2)}-${w.endReal.toFixed(2)}, provisional contact ${w.contactT.toFixed(2)} (${w.contactSource})` : 'MISSED'}`)
  })
}
await browser.close()
