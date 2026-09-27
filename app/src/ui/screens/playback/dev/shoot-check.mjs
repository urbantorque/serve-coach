// Dev only: drives "Check this serve" end to end on the dev playback session (real engine output on the
// synthetic clip baseline-s1) at 390 × 844 (DPR 2), light and dark, headless Edge, console captured.
// The marks are the clip's own ground truth (validation/synthetic/clips/baseline-s1/truth.json), placed
// through the real UI: seek with the frame slider, tap the video, Mark frame, radar entry, Save. Then
// "App vs you", the Who and Export sheets, the export file itself (the sample flag is lifted inside
// this throwaway browser context only, since sample data never enters exports), the no-video state,
// a landscape clip, and the playback fixes (labels clear of ruler ticks, player-cropped key frames).
//   npx vite --port 5302 --strictPort
//   node src/ui/screens/playback/dev/shoot-check.mjs [baseUrl] [outDir]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../../../../..')
const base = process.argv[2] ?? 'http://localhost:5302'
const out = resolve(process.argv[3] ?? join(repo, 'validation/results/ui/harden-annotation'))
mkdirSync(out, { recursive: true })

const DETAIL = '/sessions/dev-upright/serves/dev-upright-serve-01'
const truth = JSON.parse(readFileSync(join(repo, 'validation/synthetic/clips/baseline-s1/truth.json'), 'utf8'))
const T = truth.serves[0].events

/** Ground truth a careful person would mark on frame f (right-hander: the left foot is in front). */
function truthAt(f) {
  const fr = truth.frames[f]
  const lm = fr.landmarks
  const heel = lm[29].y > lm[30].y ? lm[29] : lm[30]
  const floorY = Math.max(lm[29].y, lm[30].y, lm[31].y, lm[32].y)
  const nose = lm[0]
  // Top of the head: about 7% of stature above the nose.
  const headTop = { x: nose.x - 0.004, y: nose.y - 0.075 * (floorY - nose.y) }
  const ball = fr.balls.find((b) => b.inFrame && !b.held) ?? fr.balls[0]
  return { heel: { x: heel.x, y: floorY }, headTop, toe: { x: lm[31].x, y: lm[31].y }, ball: ball ? { x: ball.x, y: ball.y } : null }
}

const report = []
const note = (scheme, shot, extra = {}) => report.push({ scheme, shot, ...extra })

async function audit(page) {
  return page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth > window.innerWidth
    const small = [...document.querySelectorAll('button, a, [role="slider"], [role="radio"], input')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height || el.closest('[aria-hidden="true"]')) return false
        const cs = getComputedStyle(el, '::after')
        const pad = cs.content !== 'none' && cs.position === 'absolute' ? 8 : 0
        return r.width + pad < 43.5 && r.height + pad < 43.5
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`)
    return { overflow, small }
  })
}

async function shot(page, scheme, name, opts = {}) {
  const file = join(out, `${scheme}-${name}.png`)
  if (opts.locator) await opts.locator.screenshot({ path: file })
  else await page.screenshot({ path: file, fullPage: Boolean(opts.fullPage) })
  const a = await audit(page)
  note(scheme, name, { file, overflow: a.overflow, smallTargets: a.small })
}

async function seekTo(page, frame) {
  const slider = page.getByRole('slider', { name: 'Frame' })
  await slider.focus()
  await slider.press('Home')
  const start = Number(await slider.getAttribute('aria-valuenow'))
  let d = frame - start
  while (d >= 10) {
    await slider.press('Shift+ArrowRight')
    d -= 10
  }
  while (d > 0) {
    await slider.press('ArrowRight')
    d -= 1
  }
  await page.waitForFunction((f) => document.querySelector('[role="slider"][aria-label="Frame"]')?.getAttribute('aria-valuenow') === String(f), frame)
  await page.waitForTimeout(350)
}

/** Screen position of a normalised clip point (the <video> element is drawn at the clip's rect). */
async function toScreen(page, p) {
  const r = await page.locator('[data-check-serve] video').first().boundingBox()
  return { x: r.x + p.x * r.width, y: r.y + p.y * r.height }
}

async function tapClip(page, p) {
  const s = await toScreen(page, p)
  await page.mouse.click(s.x, s.y)
  await page.waitForTimeout(150)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'en-AU', acceptDownloads: true })
    const page = await context.newPage()
    const logs = []
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`)
    })
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
    // Nothing leaves the machine: anything not addressed to the dev server is recorded and aborted.
    const offHost = []
    await context.route('**/*', (route) => {
      const url = route.request().url()
      if (url.startsWith(base) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
      offHost.push(url)
      return route.abort()
    })

    // ---- playback fixes: labels clear of ruler ticks, player-cropped key frames ----
    await page.goto(`${base}${DETAIL}?at=apex`)
    await page.waitForSelector('[data-serve-detail]', { timeout: 120_000 })
    await page.waitForTimeout(2500)
    await shot(page, scheme, 'serve-detail-apex')
    await shot(page, scheme, 'serve-detail-apex-video', { locator: page.locator('[data-serve-detail] [role="group"]').first() })
    await page.getByRole('button', { name: 'Zoom to you' }).click()
    await page.waitForTimeout(1200)
    await shot(page, scheme, 'serve-detail-apex-zoom')
    await page.getByRole('button', { name: 'Zoom to you' }).or(page.getByRole('button', { name: 'Whole frame' })).first().click()
    // Portrait: the key-frame strip is in the expanded "This serve" drawer.
    await page.getByRole('button', { name: 'All values' }).click()
    await page.waitForTimeout(900)
    await shot(page, scheme, 'serve-detail-drawer')
    await shot(page, scheme, 'keyframe-strip', { locator: page.getByRole('list', { name: 'Key frames' }) })
    const cropped = await page.locator('[aria-label="Key frames"] img[data-cropped]').count()
    note(scheme, 'keyframe-strip-cropped', { cropped })
    await page.goto(`${base}${DETAIL}?at=apex`)
    await page.waitForSelector('[data-serve-detail]', { timeout: 120_000 })
    await page.waitForTimeout(1200)

    // ---- open the check from More actions ----
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.waitForTimeout(300)
    await shot(page, scheme, 'overflow-menu')
    await page.getByRole('menuitem', { name: 'Check this serve' }).click()
    await page.waitForSelector('[data-check-serve]', { timeout: 60_000 })
    await page.waitForTimeout(1500)
    await shot(page, scheme, 'check-start')

    // Height: a standing frame before the toss (zoomed to the player, as a person would).
    const zoom = page.getByRole('button', { name: 'Zoom to you' })
    if (await zoom.count()) {
      await zoom.click()
      await page.waitForTimeout(800)
    }
    const setupFrame = 30
    await seekTo(page, setupFrame)
    const s0 = truthAt(setupFrame)
    await tapClip(page, s0.headTop)
    await tapClip(page, s0.heel)
    await tapClip(page, s0.toe)
    await shot(page, scheme, 'check-height-marked')

    // Release: a frame only.
    await page.getByRole('button', { name: /^Release/ }).click()
    await seekTo(page, T.tossRelease.frameIndex + 1)
    await page.getByRole('button', { name: /^Mark frame/ }).click()
    await page.waitForTimeout(200)
    await shot(page, scheme, 'check-release-marked')

    // Peak: the frame and the ball's centre, pressed and dragged a little (the loupe shows while pressed).
    await page.getByRole('button', { name: /^Peak/ }).click()
    await seekTo(page, T.tossApex.frameIndex)
    const apex = truthAt(T.tossApex.frameIndex).ball
    const a0 = await toScreen(page, { x: apex.x + 0.01, y: apex.y + 0.01 })
    const a1 = await toScreen(page, apex)
    await page.mouse.move(a0.x, a0.y)
    await page.mouse.down()
    await page.mouse.move(a1.x, a1.y, { steps: 4 })
    await page.waitForTimeout(250)
    await shot(page, scheme, 'check-peak-loupe')
    await page.mouse.up()
    await page.waitForTimeout(200)

    // Contact and landing.
    await page.getByRole('button', { name: /^Contact/ }).click()
    await seekTo(page, T.contact.frameIndex)
    await tapClip(page, truthAt(T.contact.frameIndex).ball)
    await page.getByRole('button', { name: /^Landing/ }).click()
    await seekTo(page, T.landing.frameIndex)
    await tapClip(page, truthAt(T.landing.frameIndex).toe)
    await shot(page, scheme, 'check-landing-marked')

    // Radar (optional): a Pocket Radar peak in km/h.
    await page.getByRole('button', { name: /^Radar/ }).click()
    await page.getByLabel('Peak speed').fill('152')
    await page.getByText('Measured with').scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await shot(page, scheme, 'check-radar')

    // Who is marking.
    await page.getByRole('button', { name: 'Change who is marking' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('radio', { name: 'Our team' }).click()
    await page.getByLabel('Initials (optional)').fill('rd')
    await page.getByLabel("Player's study code (optional)").fill('p07')
    await shot(page, scheme, 'check-who-sheet')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(400)

    // Save and compare.
    await page.getByRole('button', { name: 'Save check' }).click()
    await page.waitForSelector('[data-check-serve][data-mode="result"]')
    await page.waitForTimeout(1500)
    await shot(page, scheme, 'check-result')
    // The video block is pinned, so full-page captures misplace it: scroll and capture the viewport.
    for (let i = 1; i <= 6; i++) {
      const moved = await page.evaluate(() => {
        const y = window.scrollY
        window.scrollBy(0, 300)
        return window.scrollY !== y
      })
      if (!moved) break
      await page.waitForTimeout(250)
      await shot(page, scheme, `check-result-scroll-${i}`)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    const rows = await page.locator('#app-vs-you ~ p, [aria-label="Timing"] li, [aria-label="Heights"] li, [aria-label="Positions"] li').allInnerTexts()
    note(scheme, 'check-result-text', { rows: rows.map((r) => r.replace(/\s+/g, ' ').trim()) })
    // Tap a result row: shows the marked frame with the app's point.
    const peakRow = page.locator('[aria-label="Heights"] li button').first()
    if (await peakRow.count()) {
      await peakRow.click()
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(900)
      await shot(page, scheme, 'check-result-row-frame')
    }

    // Export: the sheet on sample data (left out), then the file with the sample flag lifted.
    await page.getByRole('button', { name: 'Export checks' }).click()
    await page.waitForTimeout(700)
    await shot(page, scheme, 'check-export-sheet-sample')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await page.evaluate(async () => {
      const { getDb } = await import('/src/data/db.ts')
      const db = getDb()
      const s = await db.sessions.get('dev-upright')
      await db.sessions.put({ ...s, isDemo: 0 })
      for (const v of await db.videos.where('sessionId').equals('dev-upright').toArray()) await db.videos.put({ ...v, isDemo: 0 })
    })
    await page.getByRole('button', { name: 'Export checks' }).click()
    await page.waitForTimeout(700)
    await shot(page, scheme, 'check-export-sheet')
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.getByRole('button', { name: 'Save file' }).click()])
    const exportPath = join(out, `${scheme}-export-synthetic-${download.suggestedFilename()}`)
    await download.saveAs(exportPath)
    await page.waitForTimeout(600)
    await shot(page, scheme, 'check-export-toast')
    note(scheme, 'export', { file: exportPath, suggested: download.suggestedFilename() })

    // Reopening shows the saved check straight away (results first).
    await page.goto(`${base}${DETAIL}?mode=check`)
    await page.waitForSelector('[data-check-serve][data-mode="result"]', { timeout: 60_000 })
    await page.getByRole('button', { name: 'Edit marks' }).click()
    await page.waitForTimeout(800)
    await shot(page, scheme, 'check-edit-after-reveal')

    // No video: the deleted-video session.
    await page.goto(`${base}/sessions/dev-deleted/serves/dev-deleted-serve-01?mode=check`)
    await page.waitForSelector('text=Checking needs the video', { timeout: 120_000 })
    await shot(page, scheme, 'check-no-video')

    // Landscape clip.
    await page.goto(`${base}/sessions/dev-fence/serves/dev-fence-serve-01?mode=check`)
    await page.waitForSelector('[data-check-serve]', { timeout: 120_000 })
    await page.waitForTimeout(1500)
    await shot(page, scheme, 'check-landscape')
    await page.goto(`${base}/sessions/dev-fence/serves/dev-fence-serve-01?at=apex`)
    await page.waitForSelector('[data-serve-detail]', { timeout: 120_000 })
    await page.waitForTimeout(2000)
    await shot(page, scheme, 'serve-detail-landscape-apex')

    note(scheme, 'console', { console: logs, offHost })
    await context.close()
  }
} finally {
  await browser.close()
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1))
for (const r of report) {
  const bits = []
  if (r.overflow) bits.push('OVERFLOW')
  if (r.smallTargets?.length) bits.push(`small: ${r.smallTargets.join('; ')}`)
  if (r.console?.length) bits.push(`console: ${r.console.join(' | ').slice(0, 800)}`)
  if (r.offHost?.length) bits.push(`off-host: ${r.offHost.join(', ')}`)
  if (r.rows) bits.push(`rows:\n    ${r.rows.join('\n    ')}`)
  if (r.cropped !== undefined) bits.push(`cropped thumbnails: ${r.cropped}`)
  console.log(`${r.scheme} ${r.shot}${bits.length ? ': ' + bits.join(' ') : ''}`)
}
