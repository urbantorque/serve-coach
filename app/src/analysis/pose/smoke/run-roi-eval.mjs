// ROI evaluation for MediaPipePoseSource (dev only).
// Starts the Vite dev server, opens roi-eval.html in headless Edge (Playwright, channel
// 'msedge': H.264 and a real GPU path) and runs every clip x configuration: roi 'off' vs
// 'auto', VIDEO vs IMAGE mode (model full, GPU, worker, numPoses 2 unless overridden).
// Clips are rendered synthetic serves with truth.json: render-roi-clips.mjs output (default
// --clips-dir) or the tools/synth corpus (--clips-dir ../validation/synthetic/clips). The
// runner serves them to the page under /__roi-eval/. MediaPipe's usage telemetry is blocked.
//
//   node src/analysis/pose/smoke/run-roi-eval.mjs [--clips-dir DIR] [--clips a,b] [--configs a,b]
//        [--model full|lite] [--delegate GPU|CPU|auto] [--max-frames N] [--repeat N] [--out result.json]
//        [--dump-frames 10,77] (store those frames' landmarks in the JSON, for overlays)
//
// Exit code 1 if any run fails (errors, not accuracy).
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const clipsDir = resolve(option('--clips-dir', resolve(appRoot, '../tools/synth/.cache/roi-eval/clips')))
if (!existsSync(clipsDir)) throw new Error(`no clips at ${clipsDir}; render them first (README, "ROI evaluation")`)
// A clip folder holds truth.json and clip.mp4 (render-roi-clips.mjs) or <folder>.mp4 (tools/synth corpus).
const clipVideo = (dir) => [join(clipsDir, dir, 'clip.mp4'), join(clipsDir, dir, `${dir}.mp4`)].find((p) => existsSync(p))
const clipNames = option('--clips', '')
  ? option('--clips', '').split(',')
  : readdirSync(clipsDir).filter((d) => existsSync(join(clipsDir, d, 'truth.json')) && clipVideo(d))
const model = option('--model', 'full')
const delegate = option('--delegate', 'GPU')
const maxFrames = Number(option('--max-frames', '0')) || undefined
const repeat = Number(option('--repeat', '1'))
const outPath = option('--out', '')
const dumpFrames = option('--dump-frames', '') ? option('--dump-frames', '').split(',').map(Number) : undefined

const CONFIGS = {
  'off-VIDEO': { roi: 'off', runningMode: 'VIDEO' },
  'auto-VIDEO': { roi: 'auto', runningMode: 'VIDEO' },
  'off-IMAGE': { roi: 'off', runningMode: 'IMAGE' },
  'auto-IMAGE': { roi: 'auto', runningMode: 'IMAGE' },
  // numPoses 1: MediaPipe tracks from the previous landmarks and smooths in VIDEO mode.
  'off-VIDEO-n1': { roi: 'off', runningMode: 'VIDEO', numPoses: 1 },
  'auto-VIDEO-n1': { roi: 'auto', runningMode: 'VIDEO', numPoses: 1 },
  'off-IMAGE-n1': { roi: 'off', runningMode: 'IMAGE', numPoses: 1 },
  'auto-IMAGE-n1': { roi: 'auto', runningMode: 'IMAGE', numPoses: 1 },
}
const DEFAULT_CONFIGS = ['off-VIDEO', 'auto-VIDEO', 'off-IMAGE', 'auto-IMAGE']
const configNames = option('--configs', DEFAULT_CONFIGS.join(',')).split(',')
const sourceOptions = (name) => {
  if (!CONFIGS[name]) throw new Error(`unknown config ${name}; known: ${Object.keys(CONFIGS).join(', ')}`)
  return { model, delegate, useWorker: true, numPoses: 2, ...CONFIGS[name] }
}

const vite = await createServer({
  root: appRoot,
  configFile: resolve(appRoot, 'vite.config.ts'),
  // Own optimizer cache so another agent's dev server cannot trigger a re-optimisation reload mid-run.
  cacheDir: resolve(appRoot, 'node_modules/.vite-pose-roi-eval'),
  logLevel: 'warn',
  // No HMR or file watching: an edit anywhere in src (ours or another agent's) would reload the page mid-run.
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null },
  optimizeDeps: { include: ['@mediapipe/tasks-vision', 'mp4box'] },
})
await vite.listen()
const baseUrl = vite.resolvedUrls.local[0]

const browser = await chromium.launch({ channel: option('--channel', 'msedge'), headless: true })
const context = await browser.newContext()
await context.route('https://odml.pa.googleapis.com/**', (route) => route.abort())
await context.route('**/__roi-eval/**', (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^\/__roi-eval\//, ''))
  const [dir, file] = rel.split('/')
  const path = file === 'clip.mp4' ? clipVideo(dir) ?? '' : resolve(clipsDir, rel)
  if (!path.startsWith(clipsDir) || !existsSync(path)) return route.fulfill({ status: 404 })
  return route.fulfill({ path, contentType: path.endsWith('.mp4') ? 'video/mp4' : 'application/json' })
})
const page = await context.newPage()
const consoleMessages = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleMessages.push(`${m.type()}: ${m.text()}`)
})
page.on('pageerror', (e) => consoleMessages.push(`pageerror: ${e.message}`))

const f = (v, d = 3) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '-')
const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${Math.round(100 * v)}%` : '-')
const results = []
const decode = {}
let exitCode = 0
try {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${baseUrl}src/analysis/pose/smoke/roi-eval.html`)
      await page.waitForFunction(() => window.roiEval?.ready === true, null, { timeout: 90_000 })
      break
    } catch (error) {
      if (attempt >= 3) throw error
    }
  }
  console.log(`Browser: ${browser.version()} headless; clips from ${clipsDir}`)
  // Warm-up (GPU shader compilation, JIT) on the first clip, not reported.
  for (const name of configNames) await page.evaluate((c) => window.roiEval.run(c), { clip: clipNames[0], label: 'warm-up', source: sourceOptions(name), maxFrames: 20 })

  for (const clip of clipNames) {
    decode[clip] = await page.evaluate((c) => window.roiEval.decodeOnly(c), clip)
    for (let r = 0; r < repeat; r++) {
      for (const name of configNames) {
        const result = await page.evaluate((c) => window.roiEval.run(c), { clip, label: name, source: sourceOptions(name), maxFrames, dumpFrames })
        results.push(result)
        if (!result.ok) exitCode = 1
        const a = result.accuracy ?? {}
        const s = result.stats
        console.log(
          [
            clip.padEnd(20),
            name.padEnd(10),
            result.ok ? 'ok' : `FAIL ${result.error ?? ''}`,
            `det ${pct(a.detectionRate)}`,
            `onTarget ${pct(a.onTargetRate)}`,
            `err ${f(a.meanErrorBH)} BH (med ${f(a.medianErrorBH)}, mirror-tol ${f(a.meanErrorBHMirrorTolerant)})`,
            `PCK@0.1 ${f(a.pck, 2)} (all ${f(a.pckAllFrames, 2)})`,
            `mirror ${pct(a.mirroredRate)}`,
            `wrist@contact ${f(a.wristWindowErrorBH)} (${a.wristWindowDetected}/${a.wristWindowFrames})`,
            `${f(result.wallMsPerFrame, 1)} ms/frame`,
            `infer ${f(s?.inference.medianMs, 1)}`,
            `prep ${f(s?.prepare.medianMs, 2)}`,
            s?.roi.localisations ? `loc ${s.roi.localisationsFound}/${s.roi.localisations} x${f(s.roi.localiseMs.medianMs, 0)} ms (${s.roi.localiserRuns} runs)` : '',
            result.cropSideFraction ? `crop ${f(result.cropSideFraction.median, 2)} short side, ${result.cropChanges} changes` : '',
            `digest ${f(result.digest, 4)}`,
          ].join(' | '),
        )
      }
    }
  }
  await page.evaluate(() => window.roiEval.disposeAll())
  console.log('Decode only (ms/frame):', Object.entries(decode).map(([k, v]) => `${k} ${f(v.msPerFrame, 1)}`).join(', '))
  console.log(`Console warnings/errors (${consoleMessages.length}):`)
  for (const m of [...new Set(consoleMessages)].slice(0, 30)) console.log(`  ${m}`)
  if (outPath) writeFileSync(outPath, JSON.stringify({ browser: browser.version(), model, delegate, clipsDir, decode, results, consoleMessages }, null, 1))
} catch (error) {
  console.error('ROI evaluation crashed:', error)
  exitCode = 1
} finally {
  await browser.close()
  await vite.close()
}
process.exit(exitCode)
