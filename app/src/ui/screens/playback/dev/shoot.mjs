// Dev only: screenshots of the playback screens at 390 × 844 (DPR 2) in light and dark, with the
// console captured. Uses the app's Playwright (headless Edge). Run against a dev server:
//   npx vite --port 5204 --strictPort
//   node src/ui/screens/playback/dev/shoot.mjs [baseUrl] [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5204'
const out = resolve(process.argv[3] ?? '../validation/results/ui/ui-playback')
mkdirSync(out, { recursive: true })

const DETAIL = '/sessions/dev-upright/serves/dev-upright-serve-01'
const SHOTS = [
  { name: 'serve-detail-portrait', path: DETAIL, ready: '[data-serve-detail]' },
  { name: 'serve-detail-landscape', path: '/sessions/dev-fence/serves/dev-fence-serve-01', ready: '[data-serve-detail]' },
  { name: 'serve-detail-deleted-video', path: '/sessions/dev-deleted/serves/dev-deleted-serve-01', ready: '[data-serve-detail]' },
  { name: 'serve-detail-sample', path: '/sessions/demo-s1/serves/demo-s1-serve-07', ready: '[data-serve-detail]', demo: true },
  { name: 'tagging-portrait', path: '/sessions/dev-upright/tag', ready: '[data-tagging]' },
  { name: 'tagging-landscape', path: '/sessions/dev-fence/tag', ready: '[data-tagging]' },
  // Interactions.
  { name: 'serve-detail-body-contact', path: `${DETAIL}?at=contact`, ready: '[data-serve-detail]', act: async (p) => p.getByRole('radio', { name: 'Body' }).click() },
  { name: 'serve-detail-legs', path: `${DETAIL}?at=landing`, ready: '[data-serve-detail]', act: async (p) => p.getByRole('radio', { name: 'Legs' }).click() },
  { name: 'serve-detail-contact-zoom', path: `${DETAIL}?at=contact`, ready: '[data-serve-detail]', act: async (p) => { await p.getByRole('radio', { name: 'Contact' }).click(); await p.getByRole('button', { name: 'Zoom to you' }).click() } },
  { name: 'serve-detail-drawer', path: DETAIL, ready: '[data-serve-detail]', act: async (p) => p.getByRole('button', { name: 'All values' }).click() },
  { name: 'serve-detail-tag-sheet', path: DETAIL, ready: '[data-serve-detail]', act: async (p) => p.getByRole('button', { name: 'Tag this serve' }).click() },
  { name: 'serve-detail-compare-picker', path: DETAIL, ready: '[data-serve-detail]', act: async (p) => { await p.getByRole('button', { name: 'More actions' }).click(); await p.getByRole('menuitem', { name: 'Compare with your best' }).click() } },
  { name: 'compare-side', path: DETAIL, ready: '[data-serve-detail]', act: async (p) => { await p.getByRole('button', { name: 'More actions' }).click(); await p.getByRole('menuitem', { name: 'Compare with your best' }).click(); await p.getByRole('button', { name: /Your best serve/ }).click(); await p.waitForSelector('[data-compare]') } },
  { name: 'compare-ghost', path: DETAIL, ready: '[data-serve-detail]', act: async (p) => { await p.getByRole('button', { name: 'More actions' }).click(); await p.getByRole('menuitem', { name: 'Compare with your best' }).click(); await p.getByRole('button', { name: /Last session/ }).click(); await p.waitForSelector('[data-compare]'); await p.getByRole('radio', { name: 'Ghost' }).click(); await p.getByRole('button', { name: 'Show video ghost' }).click() } },
  { name: 'tagging-tally', path: '/sessions/dev-upright/tag', ready: '[data-tagging]', act: async (p) => p.getByRole('button', { name: 'Use a tally instead' }).click() },
  { name: 'tagging-summary', path: '/sessions/dev-fence/tag', ready: '[data-tagging]', act: async (p) => p.getByRole('button', { name: 'In', exact: true }).click() },
]

const only = process.env.ONLY ? process.env.ONLY.split(',') : null
const extra = process.env.EXTRA ?? ''
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const report = []
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: process.env.REDUCE ? 'reduce' : 'no-preference' })
  const page = await context.newPage()
  const logs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
  // Seed demo data once (Profile or Today normally does this).
  await page.goto(`${base}/`)
  await page.evaluate(async () => {
    const m = await import('/src/data/index.ts')
    if (!(await m.hasDemoData())) await m.loadDemoData()
  })
  for (const shot of SHOTS) {
    if (only && !only.includes(shot.name)) continue
    const before = logs.length
    await page.goto(`${base}${shot.path}${extra}`)
    await page.waitForSelector(shot.ready, { timeout: 120_000 })
    // Let the video decode its first frame and the overlay paint.
    await page.waitForTimeout(1500)
    if (shot.act) {
      try {
        await shot.act(page)
      } catch (error) {
        logs.push(`action failed: ${error.message.split('\n')[0]}`)
      }
      await page.waitForTimeout(1500)
    } else await page.waitForTimeout(1000)
    const file = join(out, `${scheme}-${shot.name}.png`)
    await page.screenshot({ path: file })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('button, a, [role="slider"], [role="radio"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          if (!r.width || !r.height) return false
          const cs = getComputedStyle(el, '::after')
          const pad = cs.content !== 'none' ? 8 : 0
          return r.width + pad < 44 - 0.5 && r.height + pad < 44 - 0.5
        })
        .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`),
    )
    report.push({ scheme, shot: shot.name, file, overflow, smallTargets: small, console: logs.slice(before) })
  }
  await context.close()
}
await browser.close()
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
for (const r of report) {
  console.log(`${r.scheme} ${r.shot}: overflow=${r.overflow} small=${r.smallTargets.length} console=${r.console.length}`)
  for (const c of r.console) console.log(`   ${c.slice(0, 300)}`)
  for (const s of r.smallTargets) console.log(`   small: ${s}`)
}
