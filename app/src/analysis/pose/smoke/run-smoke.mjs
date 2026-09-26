// Browser smoke test for MediaPipePoseSource (dev only).
// Starts the Vite dev server (or, with --prod, builds and serves a production bundle),
// opens pose-smoke.html in headless Edge (Playwright, channel 'msedge', which has H.264
// and a real GPU path) and runs every model / delegate / backend combination on
// synthetic 1280x720 frames: blank scenes (must return no person) and a flat cartoon
// figure (exercises the landmark model; a wiring check, not an accuracy measurement).
//
//   node src/analysis/pose/smoke/run-smoke.mjs [--frames 30] [--channel msedge|chrome]
//        [--prod] [--gpu-args] [--block-telemetry] [--out result.json] [--figure-png-dir dir]
//
// --prod builds into node_modules/.tmp/pose-smoke-dist and serves it with vite preview.
// --gpu-args adds Chromium flags that force the real GPU (ANGLE/D3D11) in headless mode.
// Exit code 1 if any configuration fails.
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { build, createServer, preview } from 'vite'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const frames = Number(option('--frames', '30'))
const channel = option('--channel', 'msedge')
const outPath = option('--out', '')

const configs = []
for (const model of ['lite', 'full']) {
  for (const useWorker of [true, false]) {
    for (const delegate of ['GPU', 'CPU']) {
      configs.push({ model, delegate, useWorker, frames, width: 1280, height: 720, fps: 30, imageKind: 'bitmap' })
    }
  }
}
// Other input kinds and the automatic delegate choice.
configs.push({ model: 'lite', delegate: 'auto', useWorker: true, frames, width: 1280, height: 720, fps: 30, imageKind: 'imagedata' })
configs.push({ model: 'lite', delegate: 'auto', useWorker: false, frames, width: 1280, height: 720, fps: 30, imageKind: 'canvas' })
// A flat cartoon figure: shows whether the landmark model (not only the detector) runs.
for (const model of ['lite', 'full']) {
  for (const delegate of ['GPU', 'CPU']) {
    configs.push({ model, delegate, useWorker: true, frames, width: 1280, height: 720, fps: 30, imageKind: 'figure' })
  }
  // numPoses 1 skips the per-frame person detector once tracking locks on: the cost of bystander protection.
  configs.push({ model, delegate: 'GPU', useWorker: true, frames, width: 1280, height: 720, fps: 30, imageKind: 'figure', numPoses: 1 })
}
// Every config above uses the source defaults: roi 'auto', IMAGE mode. The rows below cover the rest:
// full frames (roi 'off'), and VIDEO mode with ROI, which needs the second (IMAGE-mode) locator
// landmarker in the worker and on the main thread.
configs.push({ model: 'full', delegate: 'GPU', useWorker: true, frames, width: 1280, height: 720, fps: 30, imageKind: 'figure', roi: 'off' })
configs.push({ model: 'full', delegate: 'GPU', useWorker: true, frames, width: 1280, height: 720, fps: 30, imageKind: 'figure', runningMode: 'VIDEO' })
configs.push({ model: 'full', delegate: 'GPU', useWorker: false, frames, width: 1280, height: 720, fps: 30, imageKind: 'figure', runningMode: 'VIDEO' })
configs.push({ model: 'lite', delegate: 'CPU', useWorker: true, frames, width: 1280, height: 720, fps: 30, imageKind: 'figure', runningMode: 'VIDEO', numPoses: 1 })

const configFile = resolve(appRoot, 'vite.config.ts')
const smokeHtml = resolve(appRoot, 'src/analysis/pose/smoke/pose-smoke.html')
let server
if (flag('--prod')) {
  const outDir = resolve(appRoot, 'node_modules/.tmp/pose-smoke-dist')
  await build({
    root: appRoot,
    configFile,
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true, rolldownOptions: { input: { smoke: smokeHtml } } },
  })
  server = await preview({ root: appRoot, configFile, logLevel: 'warn', build: { outDir }, preview: { host: '127.0.0.1', port: 0 } })
} else {
  server = await createServer({
    root: appRoot,
    configFile,
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    optimizeDeps: { include: ['@mediapipe/tasks-vision'] },
  })
  await server.listen()
}
const baseUrl = server.resolvedUrls.local[0]

const launchArgs = flag('--gpu-args') ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] : []
const browser = await chromium.launch({ channel, headless: true, args: launchArgs })
const context = await browser.newContext()
const consoleMessages = []
const externalRequests = []
context.on('request', (request) => {
  const host = new URL(request.url()).hostname
  if (host !== '127.0.0.1' && host !== 'localhost') externalRequests.push(`${request.method()} ${request.url()}`)
})
if (flag('--block-telemetry')) await context.route('https://odml.pa.googleapis.com/**', (route) => route.abort())

const failedResponses = []
context.on('response', (response) => {
  if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`)
})

const page = await context.newPage()
page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`))
page.on('worker', (worker) => worker.on('console', (m) => consoleMessages.push(`worker ${m.type()}: ${m.text()}`)))

const results = []
let exitCode = 0
try {
  await page.goto(`${baseUrl}src/analysis/pose/smoke/pose-smoke.html`)
  await page.waitForFunction(() => window.poseSmoke?.ready === true, null, { timeout: 60_000 })
  const browserVersion = browser.version()
  const snapshotDir = option('--figure-png-dir', '')
  if (snapshotDir) {
    for (const t of [0.5, 1.75, 2.0]) {
      const dataUrl = await page.evaluate((tt) => window.poseSmoke.figurePng(1280, 720, tt), t)
      writeFileSync(resolve(snapshotDir, `figure-${t}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'))
    }
  }
  for (const config of configs) {
    const result = await page.evaluate((c) => window.poseSmoke.run(c), config)
    results.push(result)
    // Frames without a person must give no pose; the cartoon figure may or may not be detected.
    if (!result.ok || (config.imageKind !== 'figure' && result.framesWithLandmarks !== 0)) exitCode = 1
  }

  const rows = results.map((r) => {
    const s = r.stats
    const f = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-')
    return [
      r.config.model,
      r.config.useWorker ? 'worker' : 'main',
      r.config.delegate,
      r.config.imageKind + (r.config.numPoses ? ` n=${r.config.numPoses}` : '') + (r.config.runningMode ? ` ${r.config.runningMode}` : '') + (r.config.roi === 'off' ? ' roi-off' : ''),
      s.backend,
      s.init?.delegate ?? '-',
      r.ok ? 'ok' : `FAIL ${r.error ?? s.detectErrors[0] ?? ''}`,
      `${r.framesWithLandmarks}/${r.framesOut}`,
      f(s.init?.initMs),
      f(s.init?.warmupMs),
      f(r.wallInitMs),
      f(s.inference.medianMs),
      f(s.inference.p95Ms),
      f(s.roundTrip.medianMs),
      f(r.wallRunMs / Math.max(1, r.framesOut)),
      s.roi ? `${s.roi.mode} crop ${s.roi.framesCropped} skip ${s.roi.framesSkipped} loc ${s.roi.localisationsFound}/${s.roi.localisations}` : '-',
    ].join(' | ')
  })
  console.log(`Browser: ${channel} ${browserVersion} headless, launch args: ${launchArgs.join(' ') || '(none)'}`)
  console.log(`WebGL renderer: ${results[0]?.webgl}`)
  console.log('model | thread | asked | input | backend | used | result | poses | initMs | warmupMs | wallInitMs | inferMedMs | inferP95Ms | roundTripMedMs | wallMsPerFrame | roi')
  for (const row of rows) console.log(row)
  for (const r of results.filter((x) => x.figureCheck)) {
    const c = r.figureCheck
    console.log(
      `figure check ${r.config.model}/${r.config.delegate}/${r.config.useWorker ? 'worker' : 'main'}/numPoses=${r.config.numPoses ?? 2}/${r.config.runningMode ?? 'default'}/roi=${r.config.roi ?? 'auto'}: ` +
        `${c.framesCompared} frames, joint error median ` +
        `${c.medianErrorBH.toFixed(3)} BH, p90 ${c.p90ErrorBH.toFixed(3)} BH, left/right agreement ${(100 * c.leftRightAgreement).toFixed(0)}%`,
    )
  }
  const workerFallbacks = results.filter((r) => r.stats.workerError).map((r) => r.stats.workerError)
  if (workerFallbacks.length > 0) console.log('Worker fallbacks:', [...new Set(workerFallbacks)].join(' / '))
  const gpuErrors = results.filter((r) => r.stats.init?.gpuError).map((r) => r.stats.init.gpuError)
  if (gpuErrors.length > 0) console.log('GPU errors:', [...new Set(gpuErrors)].join(' / '))
  console.log(`Console messages (${consoleMessages.length}):`)
  for (const m of [...new Set(consoleMessages)].slice(0, 40)) console.log(`  ${m}`)
  console.log(`External requests (${externalRequests.length}):`)
  for (const r of [...new Set(externalRequests)]) console.log(`  ${r}`)
  console.log(`HTTP errors (${failedResponses.length}):`)
  for (const r of [...new Set(failedResponses)]) console.log(`  ${r}`)
  if (outPath) {
    const report = { channel, browserVersion, launchArgs, results, consoleMessages, externalRequests, failedResponses }
    writeFileSync(outPath, JSON.stringify(report, null, 2))
  }
} catch (error) {
  console.error('Smoke test crashed:', error)
  exitCode = 1
} finally {
  await browser.close()
  await server.close()
}
process.exit(exitCode)
