#!/usr/bin/env node
/**
 * The whole app, walked as a player would, at 390 x 844.
 *
 *   node scripts/lift-shots.mjs before        every state, into docs/lift/before/
 *   node scripts/lift-shots.mjs after         the same states, into docs/lift/after/
 *   node scripts/lift-shots.mjs after home    only the states whose name holds "home"
 *
 * Needs the dev server on 5180 (`?demo` routes are dev-only). One list of
 * states, so the two sets line up name for name and the gallery can pair them.
 * Each state writes a first-screen shot and, where the page is longer than a
 * screen, a `-full` shot, and logs its height in phone screens, its controls,
 * its words and anything the console said.
 *
 * Dev tooling: nothing here ships. It drives Chrome with Playwright, the same
 * copy `playwright-cli` runs on.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const set = process.argv[2] ?? 'before'
const only = process.argv[3]
const base = process.env.BASE ?? 'http://localhost:5180'
const out = join(root, 'docs', 'lift', set)
mkdirSync(out, { recursive: true })

const require = createRequire(join(root, 'package.json'))
const pw = require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))

const VIEW = { width: 390, height: 844 }
const CLIP = join(root, 'bench-data', 'clips', 'Saque_con_pelota.webm')
const BACK = { handedness: 'right', seenFilmingGuide: true, serveType: 'flat', askedToPersist: true }

const browser = await pw.chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})

const log = []

/** The page's own measure of itself, for the audit table. */
const measure = (page) =>
  page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    }
    const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    const controls = [...document.querySelectorAll('button, a[href], input:not([hidden]), summary, select')].filter(visible).length
    const main = document.querySelector('main') ?? document.body
    const words = (main.innerText.match(/\S+/g) ?? []).length
    const first = [...document.querySelectorAll('button, a[href], summary')].filter(visible).filter((el) => el.getBoundingClientRect().top < innerHeight).length
    return { height, screens: +(height / innerHeight).toFixed(1), controls, firstScreenControls: first, words }
  })

async function shoot(name, { prefs = BACK, url = '/', steps, wait = 700, touch = true, full = true, offline = false, reduced = false } = {}) {
  if (only && !name.includes(only)) return
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    hasTouch: touch,
    isMobile: touch,
    colorScheme: 'dark',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    permissions: ['camera', 'microphone'],
  })
  if (prefs) await context.addInitScript((p) => localStorage.setItem('serve-coach-prefs', JSON.stringify(p)), prefs)
  const page = await context.newPage()
  const said = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') said.push(`${m.type()}: ${m.text().slice(0, 160)}`)
  })
  page.on('pageerror', (e) => said.push(`pageerror: ${String(e).slice(0, 160)}`))
  try {
    await page.goto(base + url, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(wait)
    if (steps) await steps(page, context)
    if (offline) await context.setOffline(true)
    await page.waitForTimeout(350)
    await page.screenshot({ path: join(out, `${name}.png`) })
    const m = await measure(page)
    if (full && m.height > VIEW.height + 40) await page.screenshot({ path: join(out, `${name}-full.png`), fullPage: true })
    log.push({ name, ...m, said })
    console.log(`${name}: ${m.screens} screens, ${m.controls} controls, ${m.words} words${said.length ? `, ${said.length} console` : ''}`)
  } catch (e) {
    log.push({ name, failed: String(e).slice(0, 240), said })
    console.log(`${name}: FAILED ${String(e).slice(0, 200)}`)
  } finally {
    await context.close().catch(() => {})
  }
}

const tap = (page, text) => page.getByText(text, { exact: false }).first().click()

try {
  // ------------------------------------------------------------- first run
  await shoot('01-first-run-home', { prefs: null })
  await shoot('02-first-run-guide', { prefs: null, steps: async (p) => { await tap(p, 'Film my serve'); await p.waitForTimeout(2600) } })
  await shoot('03-film-guide', { url: '/?open=guide', wait: 900 })
  await shoot('04-example-report', { prefs: null, wait: 900, steps: async (p) => { await tap(p, 'See a sample report'); await p.waitForTimeout(1800) } })
  await shoot('05-empty-progress', { prefs: null, url: '/?open=progress', wait: 900 })
  await shoot('06-empty-history', { url: '/?open=progress', prefs: null, wait: 900 })

  // --------------------------------------------------------------- filming
  await shoot('07-viewfinder', { steps: async (p) => { await p.getByRole('button', { name: /Film/ }).first().click(); await p.waitForTimeout(2800) } })

  // --------------------------------------------------------------- waiting
  await shoot('08-waiting', {
    full: false,
    steps: async (p) => {
      if (!existsSync(CLIP)) throw new Error('no bench clip')
      await p.locator('input[type=file]').first().setInputFiles(CLIP)
      await p.waitForTimeout(9000)
    },
  })

  // ---------------------------------------------------------------- report
  await shoot('09-report-real-clip', {
    wait: 300,
    steps: async (p) => {
      await p.locator('input[type=file]').first().setInputFiles(CLIP)
      await p.waitForSelector('.report, .empty, [data-screen=report]', { timeout: 150_000 })
      await p.waitForTimeout(2200)
    },
  })
  await shoot('10-report-live', { url: '/?demo=live', wait: 4500 })
  await shoot('11-report-basket', { url: '/?demo=basket', wait: 5000 })
  await shoot('12-report-reopened', { url: '/?demo=report', wait: 2200 })
  await shoot('12b-report-own-serve', { url: '/?demo=history', wait: 2200, steps: async (p) => { await p.locator('.serve-card').first().click(); await p.waitForTimeout(2600) } })
  await shoot('13-report-injury', { url: '/?demo=injury', wait: 2200 })
  await shoot('14-report-soft', { url: '/?demo=collapsed', wait: 2200 })
  await shoot('15-report-refused', { url: '/?demo=refused', wait: 2200 })
  await shoot('16-error-turned', { url: '/?demo=turned', wait: 1600 })
  await shoot('17-crash', { url: '/?demo=crash', wait: 1800 })

  // ---------------------------------------------------------- with history
  await shoot('18-home-history', { url: '/?demo=history', wait: 2200 })
  await shoot('19-history-sheet', { url: '/?demo=history', wait: 2200, steps: async (p) => { await p.getByText('All your serves').click(); await p.waitForTimeout(1200) } })
  await shoot('20-settings', { url: '/?demo=history', wait: 2200, steps: async (p) => { await p.getByLabel('Settings and backups').click(); await p.waitForTimeout(500) } })
  await shoot('21-progress', { url: '/?demo=history', wait: 2200, steps: async (p) => { await p.getByRole('button', { name: 'Progress' }).click(); await p.waitForTimeout(1600) } })

  // -------------------------------------------------------------- practice
  await shoot('22-session-done', { url: '/?demo=session', wait: 5000 })
  await shoot('23-session-plan', { url: '/?demo=session&plan', wait: 5000 })

  // -------------------------------------------------------------- on court
  await shoot('24-glance', { url: '/?demo=glance', wait: 2200 })
  await shoot('25-glance-moved', { url: '/?demo=glance-move', wait: 2200 })
  await shoot('26-glance-refused', { url: '/?demo=glance-refused', wait: 2200 })

  // ---------------------------------------------------------------- errors
  await shoot('27-offline-first-open', {
    prefs: null,
    steps: async (p, c) => {
      await c.setOffline(true)
      await p.waitForTimeout(400)
    },
  })
  await shoot('28-offline-no-engine', {
    steps: async (p, c) => {
      await c.setOffline(true)
      await p.locator('input[type=file]').first().setInputFiles(CLIP)
      await p.waitForTimeout(9000)
    },
  })
  await shoot('29-reduced-motion-report', { url: '/?demo=live', wait: 4500, reduced: true })
} finally {
  await browser.close()
  writeFileSync(join(out, 'log.json'), JSON.stringify(log, null, 2))
}
