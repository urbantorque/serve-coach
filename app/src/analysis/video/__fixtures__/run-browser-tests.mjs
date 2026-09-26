// Browser test for the decode layer: starts a Vite dev server on a free port, opens
// browser-test.html in headless Edge (or Chrome) with Playwright, runs the checks and
// prints the results. Exit code 1 when any check fails.
//
// Usage (from app/): node src/analysis/video/__fixtures__/run-browser-tests.mjs [--channel=chrome] [--headed] [--only=substring] [--json]

import { createServer as createNetServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { AUDIO_TRUTH, BARCODE, ensureFixtures } from './fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../../../..')
const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const channel = flag('channel') ?? 'msedge'
const only = flag('only')?.split(',')

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolvePort(port))
    })
  })
}

const built = ensureFixtures({ perf: !only || only.includes('throughput') })
if (built.length) console.log(`fixtures built: ${built.join(', ')}`)

const port = await freePort()
const vite = await createServer({
  root: appRoot,
  configFile: resolve(appRoot, 'vite.config.ts'),
  // Own optimizer cache: other dev servers sharing node_modules/.vite can trigger a
  // dependency re-optimisation (and a page reload) in the middle of a run.
  cacheDir: resolve(appRoot, 'node_modules/.vite-video-browser-test'),
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true },
})

/** Loads the page and waits for the harness, retrying once if Vite reloads the page. */
async function openHarness(page, url) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load' })
      await page.waitForFunction(() => typeof window.runVideoDecodeTests === 'function', null, { timeout: 60_000 })
      return
    } catch (error) {
      if (attempt >= 3) throw error
      console.log(`harness not ready (attempt ${attempt}): ${error.message.split('\n')[0]}; retrying`)
    }
  }
}
await vite.listen()

let browser
let exitCode = 0
try {
  browser = await chromium.launch({ channel, headless: !args.includes('--headed') })
  const page = await browser.newPage()
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push(`${msg.type()}: ${msg.text()}`)
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  await openHarness(page, `http://127.0.0.1:${port}/src/analysis/video/__fixtures__/browser-test.html`)
  const env = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    videoDecoder: typeof VideoDecoder === 'function',
    audioDecoder: typeof AudioDecoder === 'function',
    offscreenCanvas: typeof OffscreenCanvas === 'function',
    rvfc: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
    hardwareConcurrency: navigator.hardwareConcurrency,
  }))
  console.log('browser:', JSON.stringify(env))

  const results = await page.evaluate(
    ([truth, onlyNames]) => window.runVideoDecodeTests(truth, onlyNames ?? undefined),
    [{ AUDIO_TRUTH, BARCODE }, only ?? null],
  )
  for (const r of results) {
    console.log(`\n${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`)
    console.log(JSON.stringify(r.details, null, args.includes('--json') ? 2 : 0))
  }
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`)
  if (consoleErrors.length) console.log(`console errors/warnings:\n  ${consoleErrors.join('\n  ')}`)
  else console.log('console: no errors or warnings')
  if (failed.length) exitCode = 1
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  await browser?.close()
  await vite.close()
}
process.exit(exitCode)
