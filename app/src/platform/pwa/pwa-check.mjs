// Platform checks against the production build, in headless Edge with the Playwright library
// (dev only; never shipped). Start the preview first:
//
//   npx vite build && node node_modules/vite/bin/vite.js preview --port 5402 --strictPort
//   node src/platform/pwa/pwa-check.mjs [outDir] [--skip-live] [--skip-offline-analysis]
//
// It checks, and writes summary.json plus screenshots to outDir:
// 1. the service worker installs, precaches, and controls the page;
// 2. which MediaPipe wasm and model files the loader actually requests (analysis, live framing);
// 3. an in-app recording writes its chunks to IndexedDB while recording, and after a hard crash
//    (CDP Page.crash) the next launch offers the clip;
// 4. offline: the app reloads from the service worker, screens open, and a clip is analysed;
// 5. no request from the page, its workers or the service worker leaves the app's origin, and no CSP
//    violation or console error happens.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = await import('playwright')
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const repoRoot = resolve(appDir, '..')
const base = process.env.BASE ?? 'http://localhost:5402'
const outDir = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(repoRoot, 'validation/results/ui/final-platform'))
const skipLive = process.argv.includes('--skip-live')
const onlyLive = process.argv.includes('--only-live')
const skipOfflineAnalysis = onlyLive || process.argv.includes('--skip-offline-analysis')
const clip = (id) => join(repoRoot, 'validation/synthetic/clips', id, `${id}.mp4`)
mkdirSync(outDir, { recursive: true })

const report = { base, startedAt: new Date().toISOString(), steps: [], failures: [], requests: {}, consoleErrors: [], cspViolations: [] }
const log = (m) => console.log(`[pwa-check] ${m}`)
let phase = 'load'
const requests = []

async function step(name, fn) {
  const t0 = Date.now()
  try {
    const detail = await fn()
    report.steps.push({ name, ok: true, ms: Date.now() - t0, ...(detail ? { detail } : {}) })
    log(`ok ${name}`)
  } catch (e) {
    report.steps.push({ name, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 500) })
    report.failures.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`)
    log(`FAILED ${name}: ${String(e).split('\n')[0]}`)
  }
}

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push({ label, phase, text: m.text().slice(0, 300) })
  })
  page.on('pageerror', (e) => report.consoleErrors.push({ label, phase, text: `pageerror: ${String(e).slice(0, 300)}` }))
}

function idb(page, store) {
  return page.evaluate(
    (name) =>
      new Promise((res) => {
        const open = indexedDB.open('serve-coach')
        open.onerror = () => res(null)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(name)) return res(null)
          const req = db.transaction(name).objectStore(name).getAll()
          req.onsuccess = () => res(req.result.map((r) => ({ ...r, blob: r.blob ? { size: r.blob.size, type: r.blob.type } : undefined })))
          req.onerror = () => res(null)
        }
      }),
    store,
  )
}

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: Boolean(opts.full) })
}

async function importClip(page, file) {
  await page.goto(base + '/record/import')
  await page.getByRole('heading', { level: 1, name: 'Import a video' }).waitFor({ timeout: 20_000 })
  await page.locator('input[type="file"]').setInputFiles(file)
  await page.getByRole('button', { name: 'Analyse' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(800)
  if (await page.getByRole('button', { name: 'Analyse' }).isDisabled()) {
    const more = page.getByRole('button', { name: 'More: Your height (cm)' })
    if (await more.count()) for (let i = 0; i < 6; i++) await more.click()
    const right = page.getByRole('radio', { name: 'Right' })
    if (await right.count()) await right.first().click()
  }
  await page.getByRole('button', { name: 'Analyse' }).click()
  await page.waitForURL(/\/processing\//, { timeout: 30_000 })
  const t0 = Date.now()
  await page.waitForURL(/\/sessions\/[^/]+$/, { timeout: 600_000 })
  return { seconds: Math.round((Date.now() - t0) / 1000), sessionId: /\/sessions\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1] }
}

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'allow' })
await context.grantPermissions(['camera'], { origin: base })
await context.addInitScript(() => {
  window.__csp = []
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
})
context.on('request', (r) => {
  const sw = r.serviceWorker()
  requests.push({ phase, url: r.url(), type: r.resourceType(), from: sw ? 'service-worker' : r.frame() ? 'page' : 'worker' })
})
context.on('requestfailed', (r) => requests.push({ phase, url: r.url(), failed: r.failure()?.errorText ?? 'failed', from: r.serviceWorker() ? 'service-worker' : 'page-or-worker' }))

let page = await context.newPage()
watch(page, 'main')

await step('first run: skip set-up to Today', async () => {
  await page.goto(base + '/')
  await page.waitForURL(/\/onboarding/, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Skip set-up', exact: true }).click()
  await page.getByRole('radio', { name: 'Yes' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 15_000 })
  await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 15_000 })
})

await step('service worker installs, precaches and controls the page', async () => {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 180_000 })
  const caches = await page.evaluate(async () => {
    const names = await caches.keys()
    const out = {}
    for (const n of names) out[n] = (await (await caches.open(n)).keys()).length
    return out
  })
  const precache = Object.entries(caches).find(([n]) => n.startsWith('serve-coach-precache-'))
  if (!precache || precache[1] < 100) throw new Error(`precache missing or small: ${JSON.stringify(caches)}`)
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json())
  report.caches = caches
  report.manifest = { name: manifest.name, display: manifest.display, orientation: manifest.orientation, icons: manifest.icons.map((i) => `${i.sizes} ${i.purpose}`) }
  return { caches }
})

await step('persistence and storage estimate readable', async () => {
  report.storage = await page.evaluate(async () => ({ persisted: await navigator.storage.persisted(), estimate: await navigator.storage.estimate() }))
})

phase = 'analysis-online'
if (!onlyLive) await step('import and analyse a clip online (which wasm does the pose loader fetch?)', async () => {
  report.onlineAnalysis = await importClip(page, clip('baseline-s1'))
  await shot(page, 'light-online-report')
})

if (!skipLive) {
  phase = 'live-framing'
  await step('live framing with a fake camera (which wasm and model does the live pose pass fetch?)', async () => {
    await page.goto(base + '/record/live')
    await page.getByRole('button', { name: 'All good' }).click({ timeout: 20_000 })
    const cont = page.getByRole('button', { name: 'Continue' })
    if (await cont.count()) await cont.click()
    await page.getByRole('button', { name: 'More options' }).waitFor({ timeout: 30_000 })
    await page.waitForTimeout(12_000)
    await shot(page, 'live-framing-fake-camera')
  })

  phase = 'recording'
  await step('record: chunks reach IndexedDB while recording', async () => {
    await page.getByRole('button', { name: 'More options' }).click()
    await page.getByRole('button', { name: /^Record (anyway|without toss height)$/ }).click({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Stop recording' }).waitFor({ timeout: 30_000 })
    await page.waitForTimeout(9_000)
    const rows = (await idb(page, 'videoChunks')) ?? []
    const media = rows.filter((r) => r.seq >= 0)
    report.recordingWhileLive = { rows: rows.length, mediaChunks: media.length, bytes: media.reduce((s, r) => s + (r.blob?.size ?? 0), 0), header: rows.find((r) => r.seq === -1)?.header ?? null }
    if (media.length < 5) throw new Error(`only ${media.length} chunks written after 9 s`)
    return report.recordingWhileLive
  })

  phase = 'crash'
  await step('hard crash mid-recording, then the next launch offers the clip', async () => {
    const cdp = await context.newCDPSession(page)
    // Page.crash never answers (the renderer is gone), so do not wait for it.
    void cdp.send('Page.crash').catch(() => undefined)
    await new Promise((r) => setTimeout(r, 17_000))
    await Promise.race([page.close().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))])
    page = await context.newPage()
    watch(page, 'after-crash')
    await page.goto(base + '/')
    const dialog = page.getByRole('dialog', { name: 'A recording was interrupted' })
    await dialog.waitFor({ timeout: 20_000 })
    await page.waitForTimeout(700) // let the sheet settle
    report.recovery = { text: (await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 400) }
    await shot(page, 'light-recovery-offer')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    await dialog.waitFor({ timeout: 20_000 })
    await page.waitForTimeout(700)
    await shot(page, 'dark-recovery-offer')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.getByRole('button', { name: 'Analyse recording' }).click()
    await page.waitForURL(/\/processing\//, { timeout: 30_000 })
    await page.waitForTimeout(4000)
    await shot(page, 'light-recovery-processing')
    // The fake camera shows no player, so the analysis is expected to find no serve; it must still end cleanly.
    await page.waitForFunction(() => !location.pathname.startsWith('/processing/') || /couldn't|could not|no serve/i.test(document.body.innerText), null, { timeout: 300_000 })
    report.recovery.after = { url: new URL(page.url()).pathname, text: (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300) }
    await shot(page, 'light-recovery-result')
  })
}

phase = 'offline'
if (!onlyLive) await step('offline: reload from the service worker and open screens', async () => {
  await context.setOffline(true)
  await page.goto(base + '/')
  await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 20_000 })
  await shot(page, 'light-offline-today')
  for (const [path, title, name] of [
    ['/sessions', 'Sessions', 'offline-sessions'],
    ['/profile/beta-data', 'Beta data', 'offline-beta-data'],
    ['/profile/storage', 'Storage and privacy', 'offline-storage'],
  ]) {
    await page.goto(base + path)
    await page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 20_000 })
    await page.waitForTimeout(600)
    await shot(page, `light-${name}`, { full: true })
  }
})

if (!skipOfflineAnalysis) {
  phase = 'analysis-offline'
  await step('offline: analyse a clip (pose worker, models and wasm from the service worker)', async () => {
    report.offlineAnalysis = await importClip(page, clip('baseline-s2'))
    await shot(page, 'light-offline-report')
  })
}
phase = 'offline-dark'
if (!onlyLive) await step('offline: dark screens', async () => {
  await page.emulateMedia({ colorScheme: 'dark' })
  for (const [path, title, name] of [
    ['/profile/beta-data', 'Beta data', 'offline-beta-data'],
    ['/profile/storage', 'Storage and privacy', 'offline-storage'],
  ]) {
    await page.goto(base + path)
    await page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 20_000 })
    await page.waitForTimeout(600)
    await shot(page, `dark-${name}`, { full: true })
  }
  await context.setOffline(false)
})

report.cspViolations = await page.evaluate(() => window.__csp ?? []).catch(() => ['(could not read)'])
const origin = new URL(base).origin
const offOrigin = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'))
const media = (r) => /\/mediapipe\/|\/models\//.test(r.url)
const byPhase = {}
for (const r of requests.filter(media)) {
  const key = `${r.phase} ${r.from}`
  byPhase[key] = [...new Set([...(byPhase[key] ?? []), new URL(r.url).pathname + (r.failed ? ` (failed: ${r.failed})` : '')])]
}
report.requests = {
  total: requests.length,
  offOrigin,
  fromServiceWorker: [...new Set(requests.filter((r) => r.from === 'service-worker').map((r) => new URL(r.url).origin))],
  failedOffline: requests.filter((r) => r.failed && r.phase.startsWith('offline') || (r.failed && r.phase === 'analysis-offline')).map((r) => `${r.from} ${r.url} ${r.failed}`).slice(0, 40),
  mediapipeAndModels: byPhase,
}
report.finishedAt = new Date().toISOString()
writeFileSync(join(outDir, onlyLive ? 'summary-recording.json' : 'summary.json'), JSON.stringify(report, null, 2))
log(`summary: ${report.steps.filter((s) => s.ok).length}/${report.steps.length} steps ok, ${offOrigin.length} off-origin requests, ${report.consoleErrors.length} console errors, ${report.cspViolations.length} CSP violations`)
await browser.close()
