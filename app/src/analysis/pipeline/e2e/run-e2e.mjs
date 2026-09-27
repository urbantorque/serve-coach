#!/usr/bin/env node
/**
 * End-to-end browser test of the production pipeline (engine-pipeline).
 *
 *   node src/analysis/pipeline/e2e/run-e2e.mjs [--port 5202] [--engine auto|real|double] [--only baseline|session|cancel]
 *
 * Expects a dev server (npx vite --port 5202 --strictPort) serving the synthetic corpus at
 * /__synthetic/. Runs runAnalysis in headless Edge (Playwright, 390 x 844, DPR 2) on
 *   1. /__synthetic/clips/baseline-s1/baseline-s1.mp4 (one serve, hit-sound timing on), and
 *   2. the multi-serve session clip from validation/synthetic/manifest.json (8 serves, hit-sound off),
 *   3. a cancellation run (aborts at 45%: the session must be marked, with no serves written),
 * asserts serves found, metrics with statuses, tracks and key frames stored, and writes
 * validation/results/ui/engine-pipeline/e2e-report.json plus light and dark screenshots.
 * --engine auto (default) uses engine.ts, and falls back to the page's test-double engine only when
 * engine.ts is still the engine-core stub (the report says which ran).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../../../..')
const repoRoot = resolve(appRoot, '..')
const outDir = join(repoRoot, 'validation/results/ui/engine-pipeline')

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const port = Number(arg('port', '5202'))
const engineMode = arg('engine', 'auto')
const only = arg('only', '')
const base = `http://localhost:${port}`

async function sessionClip() {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'validation/synthetic/manifest.json'), 'utf8'))
  const clip = manifest.clips.find((c) => (c.tags ?? []).includes('multi-serve') && c.files?.mp4)
  if (!clip) throw new Error('no multi-serve clip in the manifest')
  return { id: clip.id, url: `/__synthetic/${clip.files.mp4}`, serves: clip.serves, player: clip.player }
}

async function engineIsStub() {
  const src = await readFile(join(appRoot, 'src/analysis/engine.ts'), 'utf8')
  return /STUB/.test(src) && /return \[\]/.test(src)
}

function pageUrl(clip, extra) {
  const q = new URLSearchParams({ clip, view: 'side', heightM: '1.8', hand: 'right', ...extra })
  return `${base}/src/analysis/pipeline/e2e/pipeline-e2e.html?${q}`
}

async function run(browser, name, url, { timeoutMs, scheme = 'light', screenshot = true }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme })
  const page = await context.newPage()
  const consoleLines = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleLines.push(`${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => consoleLines.push(`pageerror: ${err.message}`))
  const started = Date.now()
  await page.goto(url)
  await page.waitForFunction(() => window.__pipelineE2E && window.__pipelineE2E.state !== 'running', null, { timeout: timeoutMs, polling: 1000 })
  const report = await page.evaluate(() => window.__pipelineE2E)
  report.wallS = (Date.now() - started) / 1000
  report.console = consoleLines
  if (screenshot) {
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(outDir, `${name}-${scheme}.png`), fullPage: false })
    await page.screenshot({ path: join(outDir, `${name}-${scheme}-full.png`), fullPage: true })
  }
  await context.close()
  return report
}

/** Screenshot a mid-run progress state (no assertions). */
async function progressShot(browser, url, scheme) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForFunction(() => (window.__pipelineE2E?.events ?? []).some((e) => e.stage === 'dense'), null, { timeout: 180_000, polling: 250 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(outDir, `progress-${scheme}.png`) })
  await context.close()
}

function check(results, label, ok, detail) {
  results.push({ label, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const stub = await engineIsStub()
  const useDouble = engineMode === 'double' || (engineMode === 'auto' && stub)
  const engineParam = useDouble ? { engine: 'double' } : {}
  const session = await sessionClip()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const results = []
  const reports = {}
  try {
    if (!only || only === 'baseline') {
      const url = pageUrl('/__synthetic/clips/baseline-s1/baseline-s1.mp4', { hitSound: '1', baseline: 'baseline-s1', ...engineParam })
      const r = await run(browser, 'baseline-s1', url, { timeoutMs: 600_000, scheme: 'light' })
      reports.baseline = r
      check(results, 'baseline: run finished', r.state === 'done', r.error ? `${r.error.code}: ${r.error.detail ?? r.error.message}` : `${r.wallS.toFixed(1)} s`)
      check(results, 'baseline: 1 serve found', r.result?.servesFound === 1, `found ${r.result?.servesFound}`)
      check(results, 'baseline: serves stored with metrics', (r.verify?.servesWithMetrics ?? 0) >= 1, JSON.stringify(r.verify?.metricStatuses))
      check(results, 'baseline: every metric has a status', r.verify && r.verify.metricsWithoutStatus === 0)
      check(results, 'baseline: tracks stored (with ball)', r.verify?.tracks >= 1 && r.verify?.tracksWithBall >= 1, `${r.verify?.tracks} tracks, ${r.verify?.tracksWithBall} with ball`)
      check(results, 'baseline: key frames stored', r.verify?.thumbs >= 3 && r.verify?.sessionThumb, `${r.verify?.thumbs} thumbs, ${r.verify?.evidence} evidence, ${Math.round((r.verify?.keyFrameBytes ?? 0) / 1024)} KB`)
      check(results, 'baseline: session ready with analysis, job done', r.verify?.sessionStatus === 'ready' && r.verify?.hasAnalysis && r.verify?.jobState === 'done')
      check(results, 'baseline: no copy with sound kept (clip has an audio track)', r.verify?.video?.storage === 'not-kept' && r.verify?.video?.audio === 'removed', JSON.stringify(r.verify?.video))
      check(results, 'baseline: progress monotonic', r.events.every((e, i) => i === 0 || e.overall >= r.events[i - 1].overall))
      check(results, 'baseline: no console errors', r.console.filter((l) => l.startsWith('error') || l.startsWith('pageerror')).length === 0, r.console.slice(0, 5).join(' | '))
      const dark = await run(browser, 'baseline-s1', url, { timeoutMs: 600_000, scheme: 'dark' })
      check(results, 'baseline (dark run): finished', dark.state === 'done')
      reports.baselineDark = { state: dark.state, wallS: dark.wallS, timings: dark.result?.timings }
    }
    if (!only || only === 'session') {
      const url = pageUrl(session.url, { ...engineParam })
      const r = await run(browser, 'session', url, { timeoutMs: 1_500_000, scheme: 'light' })
      reports.session = r
      check(results, 'session: run finished', r.state === 'done', r.error ? `${r.error.code}: ${r.error.detail ?? r.error.message}` : `${r.wallS.toFixed(1)} s`)
      check(
        results,
        `session: ${session.serves} serves found`,
        r.result?.servesFound === session.serves,
        `found ${r.result?.servesFound}; findServeWindows returned ${r.result?.serveFinding?.engineWindows} window(s)`,
      )
      const wins = r.result?.serveFinding?.windows ?? []
      const late = wins.filter((w) => w.contactSource === 'pose').length
      check(results, 'session: every planned window has a provisional contact', wins.length > 0 && wins.every((w) => Number.isFinite(w.contactT)), `${late} from pose`)
      check(results, 'session: metrics with statuses', (r.verify?.servesWithMetrics ?? 0) >= 1 && r.verify?.metricsWithoutStatus === 0, JSON.stringify(r.verify?.metricStatuses))
      check(results, 'session: key frames stored', (r.verify?.thumbs ?? 0) >= 3 * (r.result?.servesFound ?? 1) && r.verify?.sessionThumb, `${r.verify?.thumbs} thumbs, ${r.verify?.evidence} evidence`)
      check(results, 'session: progress monotonic', r.events.every((e, i) => i === 0 || e.overall >= r.events[i - 1].overall))
      const eta = r.events.find((e) => e.etaS !== undefined)
      check(results, 'session: ETA only after 5 s', !eta || eta.t >= 5000, eta ? `first ETA at ${eta.t} ms` : 'no ETA')
      check(results, 'session: no console errors', r.console.filter((l) => l.startsWith('error') || l.startsWith('pageerror')).length === 0, r.console.slice(0, 5).join(' | '))
      await run(browser, 'session', url, { timeoutMs: 1_500_000, scheme: 'dark' }).then((d) => (reports.sessionDark = { state: d.state, wallS: d.wallS }))
    }
    if (!only || only === 'cancel') {
      const url = pageUrl(session.url, { cancelAt: '0.45', ...engineParam })
      const r = await run(browser, 'cancelled', url, { timeoutMs: 600_000, scheme: 'light' })
      reports.cancel = r
      check(results, 'cancel: run stopped as cancelled', r.state === 'cancelled', r.error?.code)
      check(results, 'cancel: session marked cancelled, job cancelled', r.verify?.sessionStatus === 'cancelled' && r.verify?.jobState === 'cancelled', `${r.verify?.sessionStatus}/${r.verify?.jobState}`)
      check(results, 'cancel: nothing half-saved', r.verify?.servesInDbAfterCancel === 0 && !r.verify?.statsStored)
      const t = r.events.at(-1)?.t ?? 0
      check(results, 'cancel: stopped promptly', r.wallS * 1000 - t < 5000, `${(r.wallS - t / 1000).toFixed(2)} s after the last progress event`)
      await progressShot(browser, pageUrl(session.url, { ...engineParam }), 'light')
      await progressShot(browser, pageUrl(session.url, { ...engineParam }), 'dark')
    }
  } finally {
    await browser.close()
  }
  // --only re-runs one group: merge it into the existing report instead of replacing the others.
  if (only) {
    try {
      const previous = JSON.parse(await readFile(join(outDir, 'e2e-report.json'), 'utf8'))
      const kept = previous.results.filter((r) => !r.label.startsWith(`${only}`) && !(only === 'baseline' && r.label.startsWith('baseline (dark')))
      results.unshift(...kept)
      for (const [k, v] of Object.entries(previous.reports ?? {})) if (!(k in reports)) reports[k] = v
    } catch {
      // No previous report: this run's results only.
    }
  }
  const failed = results.filter((r) => !r.ok)
  const out = { generatedAt: new Date().toISOString(), engine: useDouble ? 'test-double (engine.ts is a stub)' : 'engine.ts', engineTsIsStub: stub, results, reports }
  await writeFile(join(outDir, 'e2e-report.json'), JSON.stringify(out, null, 1))
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed; report in ${join(outDir, 'e2e-report.json')}`)
  process.exitCode = failed.length ? 1 : 0
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 2
})
