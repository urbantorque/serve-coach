#!/usr/bin/env node
/**
 * Runs the test-retest bench (`retest.html`, N2.1) in Chrome and writes what it
 * found to docs/next/bench/retest.json, for the ledger and the accuracy page.
 *
 *   node scripts/retest.mjs                      every clip
 *   node scripts/retest.mjs Saque_reves.webm     one clip
 *
 * Needs the dev server on 5180 and `npm run setup:bench` for the clips. Dev
 * tooling: nothing here ships. Uses the Playwright copy `playwright-cli` runs on.
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const base = process.env.BASE ?? 'http://localhost:5180'
const clips = process.argv[2]
const require = createRequire(join(root, 'package.json'))
const pw = require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))

const browser = await pw.chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('console', (m) => {
    if (m.type() === 'log' || m.type() === 'error') console.log(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => console.log(`pageerror: ${String(e).slice(0, 200)}`))
  await page.goto(`${base}/retest.html${clips ? `?clips=${encodeURIComponent(clips)}` : ''}`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__retest, undefined, { timeout: 60 * 60_000, polling: 2000 })
  const rows = await page.evaluate(() => window.__retest)
  const out = join(root, 'docs', 'next', 'bench')
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'retest.json'), JSON.stringify({ ranAt: new Date().toISOString(), rows }, null, 2))
  console.log(`wrote ${rows.length} rows to docs/next/bench/retest.json`)
} finally {
  await browser.close()
}
