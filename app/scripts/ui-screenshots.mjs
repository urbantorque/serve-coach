// UI screenshot and smoke check (DESIGN §12 Testing, §13.7 item 5, user pre-flight): opens the built
// app (vite preview) in headless Edge at 390 x 844, in Day and Night, screenshots the component
// gallery and key screens, and reports console errors, horizontal overflow, small tap targets and the
// Archivo tabular-figures check.
//
// Usage: npm run build && npx vite preview --port 4173 --strictPort &
//        node scripts/ui-screenshots.mjs [baseUrl] [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://127.0.0.1:4173'
const outDir = resolve(process.argv[3] ?? '../validation/results/ui-foundation')
mkdirSync(outDir, { recursive: true })
// Optional: REVIEW_DIR=<dir> also writes 390 x 844 slices of the full-page shots for close review.
const reviewDir = process.env.REVIEW_DIR ? resolve(process.env.REVIEW_DIR) : null
if (reviewDir) mkdirSync(reviewDir, { recursive: true })

const SCREENS = [
  { name: 'components', path: '/dev/components', fullPage: true },
  { name: 'today-empty', path: '/' },
  { name: 'record', path: '/record' },
  { name: 'session-report', path: '/sessions/demo-s3', seed: true, fullPage: true },
  { name: 'sessions', path: '/sessions', seed: true },
  { name: 'setup-choice-courtside', path: '/record/setup', schemes: ['light'] },
]

async function audit(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const overflow = doc.scrollWidth > doc.clientWidth ? { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth } : null
    const small = []
    for (const el of document.querySelectorAll('a[href], button, [role="radio"], [role="tab"], input, select, textarea')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (el.closest('.sr-only')) continue
      // Chips and radio segments expand their hit area with an ::after box (DESIGN §3.1, §8.4).
      const after = getComputedStyle(el, '::after')
      let w = r.width
      let h = r.height
      if (after.content !== 'none' && after.position === 'absolute') {
        const px = (v) => (v === 'auto' ? 0 : -parseFloat(v))
        w += px(after.left) + px(after.right)
        h += px(after.top) + px(after.bottom)
      }
      if (w < 43.5 || h < 43.5) small.push({ text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), w: Math.round(w), h: Math.round(h) })
    }
    const metrics = [...document.querySelectorAll('[data-metric]')]
    const unlabelled = metrics.filter((m) => !m.getAttribute('data-status')).map((m) => m.getAttribute('data-metric'))
    const font = document.querySelector('[data-font-check]')?.textContent ?? null
    return {
      title: document.title,
      theme: doc.dataset.theme,
      contrast: doc.dataset.contrast ?? null,
      bodyFont: getComputedStyle(document.body).fontFamily,
      overflow,
      smallTargets: small,
      metricCount: metrics.length,
      unlabelled,
      font,
    }
  })
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const summary = []
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'en-AU' })
    const page = await context.newPage()
    const logs = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logs.push({ type: m.type(), text: m.text() })
    })
    page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: String(e) }))
    page.on('requestfailed', (r) => logs.push({ type: 'requestfailed', text: `${r.url()} ${r.failure()?.errorText}` }))
    let seeded = false
    for (const s of SCREENS) {
      if (s.schemes && !s.schemes.includes(scheme)) continue
      if (s.seed && !seeded) {
        await page.goto(`${base}/`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: 'See a sample session' }).click()
        await page.waitForURL('**/sessions/demo-s3')
        seeded = true
      }
      const before = logs.length
      await page.goto(`${base}${s.path}`, { waitUntil: 'networkidle' })
      await page.locator('h1').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(400)
      const file = resolve(outDir, `${scheme}-${s.name}.png`)
      const audited = await audit(page)
      if (s.fullPage) {
        // Grow the viewport to the page so fixed chrome (tab bar) renders at the true bottom.
        const h = await page.evaluate(() => document.documentElement.scrollHeight)
        await page.setViewportSize({ width: 390, height: h })
        await page.waitForTimeout(200)
        await page.screenshot({ path: file })
        if (reviewDir) {
          for (let y = 0, i = 0; y < h; y += 800, i++) {
            const clip = { x: 0, y, width: 390, height: Math.min(844, h - y) }
            await page.screenshot({ path: resolve(reviewDir, `${scheme}-${s.name}-${i}.png`), clip })
          }
        }
        await page.setViewportSize({ width: 390, height: 844 })
      } else {
        await page.screenshot({ path: file })
      }
      summary.push({ scheme, screen: s.name, file, ...audited, console: logs.slice(before) })
    }
    await context.close()
  }
} finally {
  await browser.close()
}
writeFileSync(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
for (const r of summary) {
  console.log(
    `${r.scheme.padEnd(5)} ${r.screen.padEnd(24)} theme=${r.theme}${r.contrast ? '+court' : ''} console=${r.console.length} overflow=${r.overflow ? 'YES' : 'no'} small=${r.smallTargets.length} metrics=${r.metricCount} unlabelled=${r.unlabelled.length}${r.font ? ` font="${r.font}"` : ''}`,
  )
}
