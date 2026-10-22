#!/usr/bin/env node
/**
 * Install-sheet screenshots from the production build (M4.2):
 * `npm run build && node scripts/screenshots.mjs`.
 *
 * The real screens, drawn by the same code a player runs, at 1080 × 2340 (a
 * 360 × 780 phone at three times density) and one wide 2340 × 1080. Written to
 * `public/screenshots/`, which the manifest lists with each image's size and
 * form factor; `manifest.test.ts` holds the sizes to the files.
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, normalize } from 'node:path'

const root = process.cwd()
const dist = join(root, 'dist')
const out = join(root, 'public', 'screenshots')
mkdirSync(out, { recursive: true })
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' }
const server = createServer((req, res) => {
  let file = normalize(join(dist, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)))
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`
const pw = createRequire(join(root, 'package.json'))(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))
const browser = await pw.chromium.launch({ channel: 'chrome' }).catch(() => pw.chromium.launch())

async function shoot(name, viewport, steps) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 3, reducedMotion: 'reduce', colorScheme: 'dark' })
  await ctx.addInitScript(() => localStorage.setItem('serve-coach-prefs', JSON.stringify({ handedness: 'right', seenFilmingGuide: true, serveType: 'flat', askedToPersist: false })))
  const page = await ctx.newPage()
  await page.goto(base + '/')
  await page.waitForSelector('text=Analyse a serve')
  await steps(page)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(out, name) })
  await ctx.close()
  console.log(`wrote ${name}`)
}

const phone = { width: 360, height: 780 }
try {
  await shoot('home.png', phone, async () => {})
  await shoot('report.png', phone, async (p) => {
    await p.click('text=See an example report')
    await p.waitForSelector('text=This is an example')
  })
  await shoot('guide.png', phone, async (p) => {
    await p.click('text=How to film it')
    await p.waitForSelector('text=Fit the whole body in')
  })
  await shoot('wide.png', { width: 780, height: 360 }, async () => {})
} finally {
  await browser.close()
  server.close()
}
