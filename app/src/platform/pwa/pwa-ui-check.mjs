// UI checks for the platform surfaces on the production build, light and dark, 390 x 844, headless Edge
// (dev only; never shipped). Needs the preview on port 5402 (see pwa-check.mjs). It:
// 1. installs the service worker, then publishes a changed sw.js into dist/ and checks that the update
//    waits for the player: the prompt appears, Reload activates the new worker and reloads once;
// 2. screenshots Profile, Beta data, Storage and privacy, and "Did it work?" with the usefulness
//    question (an own copy of the sample experiment), in light and dark;
// 3. reads the console, overflow and tap-target sizes on each screen.
//
//   node src/platform/pwa/pwa-ui-check.mjs [outDir]
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const repoRoot = resolve(appDir, '..')
const base = process.env.BASE ?? 'http://localhost:5402'
const outDir = resolve(process.argv[2] ?? join(repoRoot, 'validation/results/ui/final-platform'))
const swFile = resolve(appDir, 'dist/sw.js')
mkdirSync(outDir, { recursive: true })

const report = { steps: [], failures: [], consoleErrors: [], audits: {} }
const log = (m) => console.log(`[pwa-ui-check] ${m}`)
async function step(name, fn) {
  try {
    const d = await fn()
    report.steps.push({ name, ok: true, ...(d ? { detail: d } : {}) })
    log(`ok ${name}`)
  } catch (e) {
    report.steps.push({ name, ok: false, error: String(e).slice(0, 400) })
    report.failures.push(`${name}: ${String(e).split('\n')[0].slice(0, 200)}`)
    log(`FAILED ${name}: ${String(e).split('\n')[0]}`)
  }
}

/** Overflow and tap targets under 44 x 44 (DESIGN §5.5, §13.7 item 5). */
async function audit(page, key) {
  const a = await page.evaluate(() => {
    const small = []
    for (const el of document.querySelectorAll('a[href],button,[role="button"],[role="radio"],summary,input,select')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || el.closest('[aria-hidden="true"]') || el.classList.contains('sr-only')) continue
      if (r.width < 44 || r.height < 44) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return { overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, small }
  })
  report.audits[key] = a
  return a
}

const browser = await chromium.launch({ channel: 'msedge' })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'allow' })
const page = await context.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') report.consoleErrors.push(m.text().slice(0, 300))
})
page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`))
// The published sw.js is changed for the update step and put back at the end (so later screens are not interrupted by a second update).
const originalSw = readFileSync(swFile, 'utf8')
const shot = (name, full = false) => page.screenshot({ path: join(outDir, `${name}.png`), fullPage: full })

await step('first run and service worker in control', async () => {
  await page.goto(base + '/')
  await page.waitForURL(/\/onboarding/, { timeout: 20_000 })
  await page.getByRole('button', { name: 'Skip set-up', exact: true }).click()
  await page.getByRole('radio', { name: 'Yes' }).click()
  await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 15_000 })
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 180_000 })
})

await step('an update waits for Reload, then takes over once', async () => {
  appendFileSync(swFile, `\n// pwa-ui-check ${Date.now()}\n`)
  {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
    const prompt = page.locator('[data-update-prompt]')
    await prompt.waitFor({ timeout: 120_000 })
    await shot('light-update-prompt')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(300)
    await shot('dark-update-prompt')
    await page.emulateMedia({ colorScheme: 'light' })
    const before = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)
    const reloads = []
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) reloads.push(f.url())
    })
    await page.getByRole('button', { name: 'Reload' }).click()
    await page.waitForEvent('load', { timeout: 30_000 })
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 20_000 })
    const waiting = await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))
    if (waiting) throw new Error('a worker is still waiting after Reload')
    if ((await page.locator('[data-update-prompt]').count()) > 0) throw new Error('prompt still shown after Reload')
    return { controller: before, reloads: reloads.length }
  }
})

await step('seed: sample session plus an own copy of its experiment', async () => {
  await page.goto(base + '/profile')
  await page.getByRole('button', { name: /See a sample session/ }).click()
  await page.waitForURL(/\/sessions\//, { timeout: 60_000 })
  await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const open = indexedDB.open('serve-coach')
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(['experiments', 'events'], 'readwrite')
          const store = tx.objectStore('experiments')
          const get = store.get('sample-exp-1')
          get.onsuccess = () => {
            if (!get.result) return rej(new Error('no sample experiment'))
            store.put({ ...get.result, id: 'own-exp-check', isDemo: 0 })
            const hour = (d) => new Date(Math.floor(d / 3.6e6) * 3.6e6).toISOString()
            const now = Date.now()
            const ev = tx.objectStore('events')
            ev.add({ name: 'analysis_completed', at: hour(now - 3 * 864e5), props: { serves: '15-24', capture: 'good', valid: true, view: 'side', source: 'recorded', retest: false, sinceBaseline: 'none' } })
            ev.add({ name: 'focus_opened', at: hour(now - 3 * 864e5 + 3.6e6), props: {} })
            ev.add({ name: 'drill_started', at: hour(now - 2 * 864e5), props: {} })
            ev.add({ name: 'practice_logged', at: hour(now - 2 * 864e5), props: { minutes: '10-14', success: 'yes', feel: 'ok', cueHelpful: 'yes' } })
          }
          tx.oncomplete = () => res(true)
          tx.onerror = () => rej(tx.error)
        }
        open.onerror = () => rej(open.error)
      }),
  )
})

for (const scheme of ['light', 'dark']) {
  await step(`${scheme}: screens`, async () => {
    await page.emulateMedia({ colorScheme: scheme })
    for (const [path, title, name, full] of [
      ['/profile', 'You', 'profile', false],
      ['/profile/beta-data', 'Beta data', 'beta-data', true],
      ['/profile/storage', 'Storage and privacy', 'storage', false],
      ['/progress/compare/own-exp-check', 'Did it work?', 'compare-usefulness', true],
    ]) {
      await page.goto(base + path)
      await page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 20_000 })
      await page.waitForTimeout(900)
      if (name === 'beta-data') {
        await page.getByText(/^Show (all|the latest)/).click()
        await page.waitForTimeout(200)
      }
      if (name === 'compare-usefulness') await page.locator('[data-usefulness]').waitFor({ timeout: 10_000 })
      await shot(`${scheme}-${name}`, full)
      await audit(page, `${scheme}-${name}`)
    }
  })
}

await step('usefulness: rate once, then never asked again', async () => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(base + '/progress/compare/own-exp-check')
  await page.getByRole('button', { name: '4 of 5' }).click({ timeout: 15_000 })
  await page.getByText(/Your answer stays on this phone/).waitFor()
  await page.locator('[data-usefulness]').waitFor({ state: 'detached' })
  await page.reload()
  await page.getByRole('heading', { level: 1, name: 'Did it work?' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  if ((await page.locator('[data-usefulness]').count()) > 0) throw new Error('asked again')
  await page.goto(base + '/profile/beta-data')
  await page.getByRole('heading', { level: 1, name: 'Beta data' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(600)
  return { usefulness: await page.locator('[data-gate="usefulness"]').innerText() }
})

await step('export the beta report (a download here; the share sheet on phones)', async () => {
  await page.goto(base + '/profile/beta-data')
  await page.getByRole('heading', { level: 1, name: 'Beta data' }).waitFor({ timeout: 20_000 })
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20_000 }), page.getByRole('button', { name: 'Export report' }).click()])
  const file = join(outDir, 'beta-report-example.json')
  await download.saveAs(file)
  const text = readFileSync(file, 'utf8')
  const json = JSON.parse(text)
  if (json.format !== 'serve-coach-beta-report') throw new Error('wrong format')
  if (/onceKey|own-exp-check|sample-exp/.test(text)) throw new Error('an id or once-key leaked into the report')
  await page.waitForTimeout(400)
  await shot('light-beta-data-after-export')
  return { events: json.events.length, gates: json.gates.activation.status, usefulness: json.gates.usefulness }
})

await step('offline: the sample session loads again from the runtime cache', async () => {
  const cached = await page.evaluate(async () => (await (await caches.open('serve-coach-runtime-demo')).keys()).length)
  await context.setOffline(true)
  await page.goto(base + '/profile')
  await page.getByRole('heading', { level: 1, name: 'You' }).waitFor({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Remove' }).first().click()
  await page.getByRole('button', { name: /See a sample session/ }).click({ timeout: 15_000 })
  await page.waitForURL(/\/sessions\//, { timeout: 60_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(outDir, 'light-offline-sample-report.png') })
  await context.setOffline(false)
  return { demoFilesCached: cached }
})

writeFileSync(swFile, originalSw)
writeFileSync(join(outDir, 'ui-summary.json'), JSON.stringify(report, null, 2))
log(`${report.steps.filter((s) => s.ok).length}/${report.steps.length} ok, ${report.consoleErrors.length} console errors`)
await browser.close()
