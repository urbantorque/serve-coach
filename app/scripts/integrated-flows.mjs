#!/usr/bin/env node
/**
 * End-to-end flows in headless Edge (390 x 844, DPR 2, light and dark), with a screenshot of every
 * screen, console errors, horizontal overflow and unlabelled metric checks.
 *
 *   npm run build && node scripts/integrated-flows.mjs [--port 4321] [--out ../validation/results/ui/integrated] [--only a|b|c]
 *
 * Serves the production build (vite preview) itself. Flows:
 *   A. First run → onboarding → "See a sample session" (engine-built seed) → report → serve detail
 *      with overlays → tagging → focus → drill → practice log → Today → progress → compare →
 *      sessions → Metric info (serve count, toss height, spin) → How we measure.
 *   B. Real import of a synthetic clip (validation/synthetic, set via the file picker), answering
 *      "How was the phone mounted?" with Level mount and the Singles spot → processing → report →
 *      tagging → "Check this serve" (peak and contact marked at the clip's truth, saved, App vs you)
 *      → Today with the stored decision.
 *   C. The player's own loop (light; --dark-c adds dark): import a 16-serve check-in (synthetic
 *      sample-checkin) → Today and focus → drill → two practice logs (starts the experiment) → Record
 *      pins the re-test → import sample-retest as the re-test → report → "Did it work?" → Progress.
 *
 * report.json also records, per import, the serves found and counted and why any were left out
 * (`analyses`), requests to any host but the preview server (`offHostRequests`, should be empty),
 * and pose/GPU diagnostics (`diagnostics`: MediaPipe's INFO lines, which it writes to stderr, and
 * WebGL or delegate warnings; they are not counted as console errors).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const repoRoot = resolve(appRoot, '..')
const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const port = Number(arg('port', '4321'))
const outDir = resolve(appRoot, arg('out', '../validation/results/ui/integrated'))
const only = arg('only', '')
const base = `http://localhost:${port}`
const clip = (id) => join(repoRoot, 'validation/synthetic/clips', id, `${id}.mp4`)
mkdirSync(outDir, { recursive: true })

const report = { base, startedAt: new Date().toISOString(), shots: [], steps: [], consoleErrors: [], failures: [] }
// --only re-runs one flow and keeps the other flows' results in report.json.
if (only && existsSync(join(outDir, 'report.json'))) {
  const prev = JSON.parse(readFileSync(join(outDir, 'report.json'), 'utf8'))
  report.shots = (prev.shots ?? []).filter((x) => x.flow !== only)
  report.steps = (prev.steps ?? []).filter((x) => x.flow !== only)
  report.consoleErrors = (prev.consoleErrors ?? []).filter((x) => x.flow !== only)
  report.failures = (prev.failures ?? []).filter((f) => !new RegExp(`^(light|dark)[ -]${only}([0-9]| |-)`).test(f))
  for (const k of ['todayDecision', 'ownExperiment', 'ownAfterLogs']) if (prev[k] !== undefined) report[k] = prev[k]
  // Flow B and C records (imports, analyses, the level-mount import, the check) and per-flow diagnostics.
  const importFlow = (prefix) => (prefix === 'baseline-' ? 'b' : 'c')
  for (const k of ['imports', 'analyses']) if (prev[k]) report[k] = prev[k].filter((x) => importFlow(x.prefix) !== only)
  if (only !== 'b') for (const k of ['levelMountImport', 'checkServe']) if (prev[k] !== undefined) report[k] = prev[k]
  for (const k of ['diagnostics', 'offHostRequests']) if (prev[k]) report[k] = prev[k].filter((x) => x.flow !== only)
}
const log = (...a) => console.log('[flows]', ...a)

async function audit(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const metrics = [...document.querySelectorAll('[data-metric]')]
    return {
      path: location.pathname + location.search,
      title: document.title,
      overflowX: doc.scrollWidth > doc.clientWidth ? doc.scrollWidth - doc.clientWidth : 0,
      metricCount: metrics.length,
      unlabelled: metrics.filter((m) => !m.getAttribute('data-status')).map((m) => m.getAttribute('data-metric')),
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim()).filter(Boolean),
    }
  })
}

/** Scrolls the report's "Your serve today" section (the toss hero) to the top of the screen. */
async function toHero(page) {
  const label = page.getByText('Your serve today').first()
  if (await label.count()) await label.evaluate((el) => el.scrollIntoView({ block: 'start' }))
}

function flowRunner(page, scheme, flow) {
  let n = 0
  const shot = async (name, opts = {}) => {
    await page.waitForTimeout(opts.wait ?? 500)
    n++
    const file = `${scheme}-${flow}${String(n).padStart(2, '0')}-${name}.png`
    await page.screenshot({ path: join(outDir, file), fullPage: false })
    let fullFile = null
    if (opts.full) {
      fullFile = file.replace('.png', '-full.png')
      await page.screenshot({ path: join(outDir, fullFile), fullPage: true })
    }
    const a = await audit(page)
    report.shots.push({ scheme, flow, name, file, fullFile, ...a })
    if (a.overflowX) report.failures.push(`${file}: horizontal overflow ${a.overflowX}px`)
    if (a.unlabelled.length) report.failures.push(`${file}: metrics without a status: ${a.unlabelled.join(', ')}`)
    log(`${file} ${a.path} metrics=${a.metricCount}`)
  }
  const step = async (name, fn) => {
    const t0 = Date.now()
    try {
      await fn()
      report.steps.push({ scheme, flow, name, ok: true, ms: Date.now() - t0 })
    } catch (e) {
      report.steps.push({ scheme, flow, name, ok: false, ms: Date.now() - t0, error: String(e).slice(0, 400) })
      report.failures.push(`${scheme} ${flow} ${name}: ${String(e).split('\n')[0].slice(0, 200)}`)
      log(`FAILED ${scheme} ${flow} ${name}: ${String(e).split('\n')[0]}`)
      await page.screenshot({ path: join(outDir, `${scheme}-${flow}-FAILED-${name.replace(/\W+/g, '-')}.png`) }).catch(() => undefined)
    }
  }
  return { shot, step }
}


/** Reads one object store straight from IndexedDB (works against the production build). */
function idbAll(page, store) {
  return page
    .evaluate(
      (name) =>
        new Promise((resolve) => {
          const open = indexedDB.open('serve-coach')
          open.onerror = () => resolve(null)
          open.onsuccess = () => {
            const db = open.result
            if (!db.objectStoreNames.contains(name)) return resolve(null)
            const req = db.transaction(name).objectStore(name).getAll()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(null)
          }
        }),
      store,
    )
    .catch(() => null)
}

const button = (page, name) => page.getByRole('button', { name, exact: true })

async function clickFirst(page, locators) {
  for (const l of locators) {
    if (await l.count().catch(() => 0)) {
      await l.first().click()
      return true
    }
  }
  return false
}

async function continueStep(page) {
  await page.getByRole('button', { name: /^(Continue|Next)$/ }).first().click()
}

// ---------------------------------------------------------------------------------------------
// Flow A: first run → sample → the loop screens
// ---------------------------------------------------------------------------------------------

async function flowA(page, scheme) {
  const { shot, step } = flowRunner(page, scheme, 'a')
  await step('first run redirects to onboarding', async () => {
    await page.goto(base + '/')
    await page.waitForURL(/\/onboarding/, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Get started' }).waitFor()
    await shot('onboarding-welcome')
  })
  await step('onboarding answers', async () => {
    await button(page, 'Get started').click()
    await page.getByRole('radio', { name: 'Yes' }).click()
    await page.getByRole('checkbox', { name: 'Night comp or association' }).click()
    await shot('onboarding-play')
    const tue = page.getByRole('checkbox', { name: /^Tue/ })
    if (await tue.count()) await tue.first().click()
    await continueStep(page)
    await page.getByRole('radio', { name: 'Not enough first serves in' }).click()
    await continueStep(page)
    const height = page.getByLabel(/height/i).first()
    await height.fill('180')
    await height.blur()
    await page.getByRole('radio', { name: 'Right' }).click()
    await shot('onboarding-you')
    await continueStep(page)
    await clickFirst(page, [button(page, 'Skip'), page.getByRole('button', { name: /^(Continue|Next)$/ })])
    await page.waitForTimeout(300)
    await clickFirst(page, [button(page, 'Skip'), page.getByRole('button', { name: /^(Continue|Next)$/ })])
    await page.waitForTimeout(300)
    await shot('onboarding-privacy')
    await continueStep(page)
    await page.getByRole('button', { name: 'See a sample session' }).waitFor()
    await shot('onboarding-ready')
  })
  await step('sample session report', async () => {
    await page.getByRole('button', { name: 'See a sample session' }).click()
    await page.waitForURL(/\/sessions\/sample-s\d/, { timeout: 60_000 })
    await page.getByText(/Sample data/i).first().waitFor()
    await shot('sample-report', { full: true, wait: 1500 })
    await toHero(page)
    await shot('sample-report-toss-hero')
  })
  await step('serve detail with overlays', async () => {
    const serveLink = page.locator('a[href*="/serves/"]').first()
    await serveLink.scrollIntoViewIfNeeded()
    await serveLink.click()
    await page.waitForURL(/\/serves\//)
    await page.waitForTimeout(2500)
    await shot('serve-detail-open', { wait: 800 })
    for (const chip of ['Toss', 'Contact', 'Legs']) {
      const c = page.getByRole('radio', { name: new RegExp(`^${chip}`) })
      if (await c.count()) {
        await c.first().click()
        await shot(`serve-detail-${chip.toLowerCase()}`, { wait: 900 })
      }
    }
    const zoom = page.getByRole('button', { name: /Zoom to you/ })
    if (await zoom.count()) {
      await zoom.first().click()
      await shot('serve-detail-zoomed', { wait: 900 })
    }
  })
  await step('check-in report: the focus that started the experiment', async () => {
    await page.goto(base + '/sessions/sample-s2')
    await page.getByText(/Sample data/i).first().waitFor({ timeout: 15_000 })
    await shot('sample-checkin-report', { full: true, wait: 1500 })
    await toHero(page)
    await shot('sample-checkin-toss-hero')
  })
  await step('metric info', async () => {
    await page.goto(base + '/sessions/sample-s3')
    const tile = page.locator('a[href*="/metric/"]').first()
    await tile.waitFor({ timeout: 15_000 })
    await tile.scrollIntoViewIfNeeded()
    await tile.click()
    await page.waitForURL(/\/metric\//, { timeout: 10_000 })
    await shot('metric-info', { full: true, wait: 1200 })
  })
  await step('tagging', async () => {
    const sid = /\/sessions\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? 'sample-s3'
    await page.goto(`${base}/sessions/${sid}/tag`)
    await page.getByRole('heading', { level: 1, name: /Tag serves|Session tally/ }).waitFor({ timeout: 15_000 })
    await shot('tagging', { wait: 1500 })
    await button(page, 'In').first().click()
    await shot('tagging-after-in', { wait: 600 })
  })
  await step('today (sample)', async () => {
    await page.goto(base + '/')
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 15_000 })
    await shot('today-sample', { full: true, wait: 1200 })
  })
  await step('focus', async () => {
    await page.goto(base + '/focus')
    await page.waitForTimeout(1500)
    await shot('focus', { full: true })
  })
  await step('drill', async () => {
    const start = page.getByRole('button', { name: 'Start drill' })
    if (await start.count()) {
      await start.first().click()
      await page.waitForURL(/\/focus\/drill/, { timeout: 10_000 })
    } else await page.goto(base + '/focus/drill')
    await shot('drill', { wait: 1200 })
  })
  await step('practice log', async () => {
    await page.goto(base + '/focus/log')
    await page.waitForTimeout(1200)
    await shot('practice-log', { full: true })
  })
  await step('progress', async () => {
    await page.goto(base + '/progress')
    await page.waitForTimeout(1200)
    await shot('progress', { full: true })
  })
  await step('compare (sample)', async () => {
    await page.goto(base + '/progress/compare/sample-exp-1')
    await page.getByRole('heading', { level: 1, name: 'Did it work?' }).waitFor({ timeout: 15_000 })
    await shot('compare-sample', { full: true, wait: 1200 })
  })
  await step('sessions list', async () => {
    await page.goto(base + '/sessions')
    await page.waitForTimeout(1200)
    await shot('sessions', { full: true })
  })
  await step('metric info: serve count, toss height, spin (sample)', async () => {
    for (const id of ['serve-count', 'toss-apex-height', 'spin']) {
      await page.goto(`${base}/metric/${id}?session=sample-s3`)
      await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 })
      await shot(`metric-info-${id}`, { full: true, wait: 1000 })
    }
  })
  await step('how we measure', async () => {
    await page.goto(base + '/profile/how-we-measure')
    await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 })
    await shot('how-we-measure', { full: true, wait: 1000 })
  })
}

// ---------------------------------------------------------------------------------------------
// Flow B: a real import through processing
// ---------------------------------------------------------------------------------------------

async function importClip(page, file, { shot, prefix, scheme = '', viaRecord = false, mount = null, spot = null }) {
  if (viaRecord) {
    // Client-side from Record, so the re-test plan Record pinned (kept in memory) applies.
    await page.getByRole('link', { name: /Import a video/ }).first().click()
  } else await page.goto(base + '/record/import')
  await page.getByRole('heading', { level: 1, name: 'Import a video' }).waitFor({ timeout: 15_000 })
  await page.locator('input[type="file"]').setInputFiles(file)
  await page.getByRole('button', { name: 'Analyse' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(800)
  // No profile yet (set-up skipped): the synthetic player is 1.80 m and right-handed.
  if (await page.getByRole('button', { name: 'Analyse' }).isDisabled()) {
    const more = page.getByRole('button', { name: 'More: Your height (cm)' })
    if (await more.count()) for (let i = 0; i < 6; i++) await more.click()
    const right = page.getByRole('radio', { name: 'Right' })
    if (await right.count()) await right.first().click()
  }
  for (const [group, name] of [['Side', 'Deuce'], ['Serves', 'First'], ['Mostly', 'Flat']]) {
    const g = page.getByRole('radiogroup', { name: group })
    const r = (await g.count()) ? g.getByRole('radio', { name }) : page.getByRole('radio', { name })
    if (await r.count()) await r.first().click()
  }
  // Side views ask how the phone was mounted (METRICS §1.1.3a); the default answer is "Tilted, or not sure".
  const mountGroup = page.getByRole('radiogroup', { name: 'How was the phone mounted?' })
  if (mount) {
    await mountGroup.getByRole('radio', { name: new RegExp(`^${mount}`) }).first().click()
  }
  if (spot) {
    const g = page.getByRole('radiogroup', { name: 'Spot' })
    await ((await g.count()) ? g.getByRole('radio', { name: spot }) : page.getByRole('radio', { name: spot })).first().click()
  }
  report.imports = [...(report.imports ?? []), { scheme, prefix, mountAsked: (await mountGroup.count()) > 0, mount: mount ?? 'default', spot: spot ?? null }]
  await shot(`${prefix}import-ready`, { full: true })
  if (mount) {
    await page.locator('#q-mount').scrollIntoViewIfNeeded()
    await shot(`${prefix}import-mount`)
  }
  const clicked = Date.now()
  await page.getByRole('button', { name: 'Analyse' }).click()
  await page.waitForURL(/\/processing\//, { timeout: 30_000 })
  await page.waitForTimeout(6000)
  await shot(`${prefix}processing`)
  await page.waitForURL(/\/sessions\/[^/]+$/, { timeout: 900_000 })
  const processingS = (Date.now() - clicked) / 1000
  await page.waitForTimeout(1500)
  const sessionId = /\/sessions\/([^/]+)$/.exec(new URL(page.url()).pathname)?.[1]
  // What the analysis stored: serves found and counted, and why any were left out.
  const serves = ((await idbAll(page, 'serves')) ?? []).filter((x) => x.sessionId === sessionId)
  const exclusions = {}
  for (const x of serves) for (const r of x.exclusions ?? []) exclusions[r] = (exclusions[r] ?? 0) + 1
  const entry = { scheme, prefix, clip: basename(file), sessionId, processingS, servesFound: serves.length, servesIncluded: serves.filter((x) => x.includedFlag === 1).length, exclusions }
  report.analyses = [...(report.analyses ?? []), entry]
  log(`analysis ${JSON.stringify(entry)}`)
  return sessionId
}

/**
 * "Check this serve" on an imported synthetic clip: open it from More actions, mark the toss peak and
 * contact at the clip's ground truth (validation/synthetic truth.json), save, and read "App vs you".
 */
async function checkThisServe(page, sessionId, shot, scheme, clipId = 'baseline-s1') {
  const truth = JSON.parse(readFileSync(join(repoRoot, 'validation/synthetic/clips', clipId, 'truth.json'), 'utf8'))
  const ev = truth.serves[0].events
  const ballAt = (f) => {
    const fr = truth.frames[f]
    const b = fr.balls.find((x) => x.inFrame && !x.held) ?? fr.balls[0]
    return b ? { x: b.x, y: b.y } : null
  }
  await page.goto(`${base}/sessions/${sessionId}`)
  const serveLink = page.locator('a[href*="/serves/"]').first()
  await serveLink.waitFor({ timeout: 15_000 })
  await serveLink.scrollIntoViewIfNeeded()
  await serveLink.click()
  await page.waitForSelector('[data-serve-detail]', { timeout: 60_000 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Check this serve' }).click()
  await page.waitForSelector('[data-check-serve]', { timeout: 60_000 })
  await shot('check-start', { wait: 1500 })
  const slider = page.getByRole('slider', { name: 'Frame' })
  const seekTo = async (frame) => {
    await slider.focus()
    await slider.press('Home')
    let d = frame - Number(await slider.getAttribute('aria-valuenow'))
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
  const tap = async (p) => {
    const r = await page.locator('[data-check-serve] video').first().boundingBox()
    if (!r || !p) throw new Error('no video box or no truth point')
    await page.mouse.click(r.x + p.x * r.width, r.y + p.y * r.height)
    await page.waitForTimeout(200)
  }
  await page.getByRole('button', { name: /^Peak/ }).click()
  await seekTo(ev.tossApex.frameIndex)
  await tap(ballAt(ev.tossApex.frameIndex))
  await page.getByRole('button', { name: /^Contact/ }).click()
  await seekTo(ev.contact.frameIndex)
  await tap(ballAt(ev.contact.frameIndex))
  await shot('check-marked')
  await page.getByRole('button', { name: 'Save check' }).click()
  await page.waitForSelector('[data-check-serve][data-mode="result"]', { timeout: 30_000 })
  await shot('check-result', { wait: 1500 })
  const rows = await page.locator('[aria-label="Timing"] li, [aria-label="Heights"] li, [aria-label="Positions"] li').allInnerTexts()
  const saved = ((await idbAll(page, 'annotations')) ?? []).filter((a) => a.sessionId === sessionId)
  report.checkServe = { ...(report.checkServe ?? {}), [scheme]: { sessionId, rows: rows.map((r) => r.replace(/\s+/g, ' ').trim()), savedChecks: saved.length } }
}

async function flowB(page, scheme) {
  const { shot, step } = flowRunner(page, scheme, 'b')
  let sessionId
  await step('skip set-up', async () => {
    await page.goto(base + '/onboarding')
    await button(page, 'Skip set-up').click()
    await page.getByRole('radio', { name: 'Yes' }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 10_000 })
  })
  await step('import baseline clip and analyse', async () => {
    sessionId = await importClip(page, clip('baseline-s1'), { shot, prefix: 'baseline-', scheme, mount: 'Level mount', spot: 'Singles' })
    await shot('baseline-report', { full: true })
    // A level-mount import keeps absolute heights at their V1 label while the widened range allows it.
    const sessions = (await idbAll(page, 'sessions')) ?? []
    const statsRows = (await idbAll(page, 'sessionStats')) ?? []
    const own = sessions.find((s) => s.id === sessionId)
    const st = statsRows.find((s) => s.sessionId === sessionId)
    const pick = (id) => {
      const v = st?.metrics?.[id]
      return v ? { status: v.status, value: v.value ?? null, reasonCode: v.reasonCode ?? null } : null
    }
    report.levelMountImport = report.levelMountImport ?? {}
    report.levelMountImport[scheme] = {
      sessionId,
      phoneMount: own?.phoneMount ?? null,
      servingSpot: own?.servingSpot ?? null,
      setupKey: st?.setupKey ?? null,
      tossApexHeight: pick('toss-apex-height'),
      contactHeight: pick('contact-height-ratio'),
      tossHeightSpread: pick('toss-height-spread'),
    }
  })
  await step('tag the imported serve', async () => {
    if (!sessionId) throw new Error('no session')
    await page.goto(`${base}/sessions/${sessionId}/tag`)
    await page.getByRole('heading', { level: 1, name: /Tag serves|Session tally/ }).waitFor({ timeout: 15_000 })
    await button(page, 'In').first().click()
    await page.waitForTimeout(1500)
    await shot('baseline-tagged')
  })
  await step('check this serve (annotation mode) on the imported serve', async () => {
    if (!sessionId) throw new Error('no session')
    await checkThisServe(page, sessionId, shot, scheme)
  })
  await step('today reflects the stored decision', async () => {
    await page.goto(base + '/')
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 15_000 })
    await shot('today-own', { full: true, wait: 1500 })
    report.todayDecision = ((await idbAll(page, 'coaching')) ?? []).map((d) => ({ sessionId: d.sessionId, createdAt: d.createdAt, gate: d.gate, focus: d.focus?.title ?? null }))
  })
}

// ---------------------------------------------------------------------------------------------
// Flow C: the player's own experiment loop
// ---------------------------------------------------------------------------------------------

async function flowC(page, scheme) {
  const { shot, step } = flowRunner(page, scheme, 'c')
  await step('skip set-up and import a 16-serve check-in', async () => {
    await page.goto(base + '/onboarding')
    await button(page, 'Skip set-up').click()
    await page.getByRole('radio', { name: 'Yes' }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 10_000 })
    await importClip(page, clip('sample-checkin'), { shot, prefix: 'checkin-', scheme })
    await shot('checkin-report', { full: true })
    await toHero(page)
    await shot('checkin-toss-hero')
  })
  await step('today shows the new focus', async () => {
    await page.goto(base + '/')
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor({ timeout: 15_000 })
    await shot('today-focus', { full: true, wait: 1500 })
  })
  await step('focus → drill → two practice logs (starts the experiment)', async () => {
    await page.goto(base + '/focus')
    await page.getByRole('button', { name: 'Start drill' }).first().waitFor({ timeout: 15_000 })
    await shot('focus-own', { full: true, wait: 800 })
    await page.getByRole('button', { name: 'Start drill' }).first().click()
    await page.waitForURL(/\/focus\/drill/, { timeout: 10_000 })
    await shot('drill-own', { wait: 1000 })
    for (let i = 0; i < 2; i++) {
      await page.goto(base + '/focus/log')
      await page.getByRole('button', { name: 'Save log' }).waitFor({ timeout: 15_000 })
      if (i === 0) await shot('log-own', { full: true })
      await page.getByRole('button', { name: 'Save log' }).click()
      await page.getByText('Practice logged').waitFor({ timeout: 10_000 })
      if (i === 1) await shot('log-saved', { wait: 800 })
      await page.getByRole('button', { name: 'Done' }).click()
      await page.waitForURL(/\/focus$/, { timeout: 10_000 })
    }
    report.ownAfterLogs = ((await idbAll(page, 'experiments')) ?? []).map((e) => ({ id: e.id, status: e.status, primary: e.primaryMetricId, baseline: e.baselineSessionIds }))
  })
  await step('today and record show the re-test', async () => {
    await page.goto(base + '/')
    await page.waitForTimeout(1500)
    await shot('today-experiment', { full: true })
    await page.goto(base + '/record')
    await page.getByRole('heading', { level: 1, name: 'Record' }).waitFor({ timeout: 15_000 })
    await shot('record-retest', { full: true, wait: 1000 })
  })
  await step('import the re-test and see the verdict', async () => {
    const id = await importClip(page, clip('sample-retest'), { shot, prefix: 'retest-', scheme, viaRecord: true })
    await shot('retest-report', { full: true, wait: 2500 })
    await toHero(page)
    await shot('retest-toss-hero')
    const exp = ((await idbAll(page, 'experiments')) ?? []).map((e) => ({
      id: e.id,
      status: e.status,
      isDemo: e.isDemo ?? 0,
      baseline: e.baselineSessionIds,
      retests: e.retestSessionIds,
      verdict: e.result?.verdict ?? null,
      before: e.result?.baseline?.value ?? null,
      after: e.result?.current?.value ?? null,
      caveats: e.result?.caveats ?? [],
    }))
    report.ownExperiment = { retestSessionId: id, experiments: exp }
    const own = exp.find((e) => e.retests.includes(id))
    await page.goto(base + (own ? `/progress/compare/${own.id}` : '/progress/compare'))
    await page.waitForTimeout(2000)
    await shot('compare-own', { full: true })
    await page.goto(base + '/progress')
    await page.waitForTimeout(1500)
    await shot('progress-own', { full: true })
    await page.goto(base + '/')
    await page.waitForTimeout(1500)
    await shot('today-after-retest', { full: true })
  })
}

async function main() {
  const server = await preview({ root: appRoot, preview: { port, strictPort: true }, logLevel: 'warn' })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    for (const scheme of ['light', 'dark']) {
      for (const [name, fn] of [['a', flowA], ['b', flowB], ['c', flowC]]) {
        if (only && only !== name) continue
        if (name === 'c' && scheme === 'dark' && !args.includes('--dark-c')) continue
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme })
        const page = await context.newPage()
        page.setDefaultTimeout(20_000)
        page.on('console', (m) => {
          const text = m.text()
          // MediaPipe's WebAssembly writes its INFO lines to stderr (console.error); they are not errors.
          const wasmInfo = /^INFO: /.test(text)
          if (m.type() === 'error' && !wasmInfo) report.consoleErrors.push({ scheme, flow: name, text: text.slice(0, 300), url: page.url() })
          // Pose and GPU diagnostics (delegate fallback, lost or too many WebGL contexts), kept for triage.
          if (wasmInfo || (m.type() === 'warning' && /webgl|context|gpu|delegate|xnnpack/i.test(text) && !/OpenGL error checking is disabled/.test(text))) {
            report.diagnostics = [...(report.diagnostics ?? []), { scheme, flow: name, at: new Date().toISOString(), type: m.type(), text: text.slice(0, 300), url: page.url() }]
          }
        })
        page.on('pageerror', (e) => report.consoleErrors.push({ scheme, flow: name, text: `pageerror: ${e.message}`.slice(0, 300), url: page.url() }))
        // Nothing should leave the device (D8): every request not addressed to the preview server is listed.
        page.on('request', (r) => {
          const u = r.url()
          if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) report.offHostRequests = [...(report.offHostRequests ?? []), { scheme, flow: name, url: u.slice(0, 200) }]
        })
        log(`--- flow ${name} (${scheme})`)
        await fn(page, scheme)
        await context.close()
      }
    }
  } finally {
    await browser.close()
    await new Promise((r) => server.httpServer.close(r))
    report.finishedAt = new Date().toISOString()
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
    log(`${report.shots.length} screenshots, ${report.consoleErrors.length} console errors, ${report.failures.length} failures → ${join(outDir, 'report.json')}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
