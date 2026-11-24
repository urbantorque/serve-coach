#!/usr/bin/env node
/**
 * A release that checks itself (M4.1): `npm run release`.
 *
 *   1. typecheck, lint, the build, and the suite with its size budgets;
 *   2. `dist/` served the way a static host should serve it — hashed assets
 *      immutable, the service worker and `index.html` never cached;
 *   3. a browser: the manifest parses and names its icons, the service worker
 *      takes control, and with the network cut a reload still opens home, and
 *      the example report still opens from it.
 *
 * Any gate failing stops the release and says which. `RELEASE_BREAK=<gate>`
 * breaks one on purpose, to prove the gate can fail: typecheck, manifest,
 * worker, offline.
 *
 * The browser is the Playwright that `playwright-cli` installs; this project
 * carries no browser of its own.
 */
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const broken = process.env.RELEASE_BREAK
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function gate(name, ok, detail = '') {
  if (broken === name) ok = false
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) {
    console.error(`release stopped at: ${name}`)
    process.exit(1)
  }
}

function run(name, args) {
  const r = spawnSync(npm, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  gate(name, r.status === 0)
}

/* 1. the checks ----------------------------------------------------------- */
run('typecheck', ['run', 'typecheck'])
run('lint', ['run', 'lint'])
run('build', ['run', 'build'])
run('suite and budgets', ['test'])

/* 2. dist, served with production caching --------------------------------- */
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream', '.onnx': 'application/octet-stream', '.woff2': 'font/woff2',
}
/** The caching rule a host needs: hashed files forever, the shell never. */
export function cacheControl(path) {
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  if (path === '/' || path.endsWith('.html') || /\/(sw|registerSW)\.js$/.test(path) || path.startsWith('/workbox-')) return 'no-cache'
  return 'public, max-age=3600'
}
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let path = decodeURIComponent(url.pathname)
  let file = normalize(join(dist, path))
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return }
  if (!existsSync(file) || statSync(file).isDirectory()) { file = join(dist, 'index.html'); path = '/index.html' }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': cacheControl(path) })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
console.log(`serving dist at ${base}`)

/* 3. the browser ---------------------------------------------------------- */
let pw
for (const p of [join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'), 'playwright']) {
  try { pw = createRequire(join(root, 'package.json'))(p); break } catch {}
}
if (!pw) { server.close(); gate('a browser to check with', false, 'install playwright-cli') }

const browser = await pw.chromium.launch({ channel: 'chrome' }).catch(() => pw.chromium.launch())
try {
  const ctx = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 375, height: 812 } })
  const page = await ctx.newPage()
  await page.goto(base + '/')

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href')
    if (!href) return null
    try { return await (await fetch(href)).json() } catch { return null }
  })
  const iconsOk = !!manifest?.icons?.length && manifest.icons.every((i) => i.src && i.sizes)
  gate('manifest', !!manifest && !!manifest.name && !!manifest.start_url && iconsOk, manifest ? `${manifest.name}, ${manifest.icons.length} icons` : 'not found')

  const controlled = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return true
    return await new Promise((r) => { navigator.serviceWorker.addEventListener('controllerchange', () => r(true)); setTimeout(() => r(false), 10000) })
  })
  if (!controlled) await page.reload()
  const worker = controlled || (await page.evaluate(() => !!navigator.serviceWorker.controller))
  gate('worker', worker, worker ? 'controls the page' : 'never took control')

  await ctx.setOffline(true)
  await page.reload()
  const home = await page.waitForSelector('text=Film my serve', { timeout: 15000 }).then(() => true, () => false)
  let example = false
  if (home) {
    await page.click('text=See a sample report').catch(() => undefined)
    example = await page.waitForSelector('text=This is an example', { timeout: 20000 }).then(() => true, () => false)
  }
  gate('offline', home && example, `home ${home ? 'opened' : 'did not open'}, example ${example ? 'opened' : 'did not open'} with the network off`)
} finally {
  await browser.close()
  server.close()
}
console.log('release ready: every gate passed')
