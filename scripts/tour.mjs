#!/usr/bin/env node
/**
 * The screen tour: every main screen, at a phone's size and a laptop's, with
 * what the console said, into `docs/elevate/gallery/<set>/`.
 *
 *   node scripts/tour.mjs w0                 every screen, both sizes, set "w0"
 *   node scripts/tour.mjs w1 report          only the screens whose name holds "report"
 *   SIZE=phone node scripts/tour.mjs w1      one size only (phone or laptop)
 *   node scripts/tour.mjs --index            rebuild index.html from the sets on disk
 *   node scripts/tour.mjs --sheet w0 w1 phone
 *                                            a side-by-side picture of two sets,
 *                                            docs/elevate/gallery/w0-w1-phone.jpg
 *
 * Needs the dev server on 5180 (`npm run dev -- --port 5180`): the `?demo`
 * routes are dev-only. A set re-shot under the same name replaces what it
 * shoots and keeps what it does not, so one screen can be re-taken alone.
 *
 * Each shot logs the page's own measure of itself: how many screens tall,
 * its controls, its words, how many lime actions sit on the first screen
 * (DESIGN.md: one), any text under the 14 px floor, any sideways scroll, how
 * much of a laptop's width the content spans, and every console error,
 * warning and page error. Over an open sheet, the first screen's words,
 * controls, lime actions and width are the sheet's own (Mirror M0.2).
 * `index.html` pairs any two sets, screen by screen.
 *
 * Dev tooling: nothing here ships. It drives Chrome through the Playwright copy
 * that `playwright-cli` installs, as `lift-shots.mjs` did before it.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const gallery = join(root, 'docs', 'elevate', 'gallery')
const base = process.env.BASE ?? 'http://localhost:5180'
mkdirSync(gallery, { recursive: true })

const require = createRequire(join(root, 'package.json'))
const loadPlaywright = () => require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))

/** The two sizes DESIGN.md judges a screen at. */
const SIZES = {
  phone: { viewport: { width: 390, height: 844 }, touch: true, scale: 2 },
  laptop: { viewport: { width: 1440, height: 900 }, touch: false, scale: 1 },
}

/** A returning player: one hand chosen, the guide seen, nothing to ask. */
const BACK = { handedness: 'right', seenFilmingGuide: true, serveType: 'flat', askedToPersist: true }
const CLIP = join(root, 'bench-data', 'clips', 'Saque_con_pelota.webm')

const tap = (page, text) => page.getByText(text, { exact: false }).first().click()
const openProgress = async (p) => {
  await p.getByRole('button', { name: 'Progress', exact: true }).first().click()
  await p.waitForTimeout(1600)
}

/**
 * Every main screen, in the order a player meets them. `group` is the
 * heading the index files it under; `name` is stable across sets so two sets
 * pair up shot for shot.
 */
const SCREENS = [
  // First run
  { group: 'First run', name: '01-landing', title: 'The landing', prefs: null },
  {
    group: 'First run',
    name: '02-sample-report',
    title: 'The sample report',
    prefs: null,
    wait: 900,
    steps: async (p) => {
      await tap(p, 'See a sample report')
      await p.waitForTimeout(2200)
    },
  },
  {
    group: 'First run',
    name: '03-camera-first-time',
    title: "The camera's first-time card",
    prefs: { ...BACK, seenFilmingGuide: false },
    steps: async (p) => {
      await p.getByRole('button', { name: /Film/ }).first().click()
      await p.waitForTimeout(2800)
    },
  },
  { group: 'First run', name: '04-filming-guide', title: 'The filming guide', url: '/?open=guide', wait: 1200 },

  // Checking a clip
  {
    group: 'Checking a serve',
    name: '05-checking',
    title: 'Checking a real clip',
    needs: CLIP,
    full: false,
    steps: async (p) => {
      await p.locator('input[type=file]').first().setInputFiles(CLIP)
      await p.waitForTimeout(9000)
    },
  },

  // The report
  { group: 'The report', name: '06-report-fresh', title: 'A fresh report', url: '/?demo=live', wait: 9000 },
  { group: 'The report', name: '07-report-reopened', title: 'A report reopened', url: '/?demo=report', wait: 2400 },
  // Real footage (Mirror M0.1): the landing's licensed serve, its report reopened with its kept clip.
  { group: 'The report', name: '07b-report-real', title: 'A report on real footage', url: '/?demo=real', wait: 4000 },
  {
    group: 'The report',
    name: '08-lesson-sheet',
    title: 'The lesson sheet',
    url: '/?demo=report',
    wait: 2400,
    steps: async (p) => {
      await p.locator('button.now').first().click()
      await p.waitForTimeout(1200)
    },
  },
  { group: 'The report', name: '09-report-after-drill', title: 'The report after a drill', url: '/?demo=loop', wait: 2600 },

  // Today and Progress
  { group: 'Today and Progress', name: '10-today', title: 'Today, with a season behind it', url: '/?demo=history', wait: 2400 },
  {
    group: 'Today and Progress',
    name: '11-session-sheet',
    title: "Today's session sheet",
    url: '/?demo=history',
    wait: 2400,
    steps: async (p) => {
      // Either apostrophe: the copy went curly in E3.1.
      await p.getByText(/Start today.s session/).first().click()
      await p.waitForTimeout(1200)
    },
  },
  { group: 'Today and Progress', name: '12-progress', title: 'Progress', url: '/?demo=history', wait: 2400, steps: openProgress },
  {
    group: 'Today and Progress',
    name: '13-settings',
    title: 'Settings',
    url: '/?demo=history',
    wait: 2400,
    steps: async (p) => {
      await p.getByLabel('Settings and backups').first().click()
      await p.waitForTimeout(900)
    },
  },
  {
    group: 'Today and Progress',
    name: '13b-settings-new',
    title: 'Settings, for a player who never chose',
    prefs: { seenFilmingGuide: true, askedToPersist: true },
    url: '/?demo=history',
    wait: 2400,
    steps: async (p) => {
      await p.getByLabel('Settings and backups').first().click()
      await p.waitForTimeout(900)
    },
  },

  // On court
  { group: 'On court', name: '14-glance', title: 'The court screen', url: '/?demo=glance', wait: 2400 },
  { group: 'On court', name: '14b-glance-real', title: 'The court screen on real footage', url: '/?demo=real&glance', wait: 3000 },
  { group: 'On court', name: '15-glance-refused', title: 'The court screen, a refused serve', url: '/?demo=glance-refused', wait: 2400 },
  { group: 'On court', name: '16-glance-strain', title: 'The court screen, a strain warning', url: '/?demo=glance-strain', wait: 2400 },
  { group: 'On court', name: '17-glance-move', title: 'The court screen, a fault moving', url: '/?demo=glance-move', wait: 2400 },
  { group: 'On court', name: '18-guided', title: 'A guided set, four serves in', url: '/?demo=guided', wait: 2400 },
  { group: 'On court', name: '19-guided-done', title: 'A guided set, passed', url: '/?demo=guided-done', wait: 2400 },

  // Practice
  { group: 'Practice', name: '20-practice', title: 'A practice video, checked', url: '/?demo=session', wait: 5000 },
  { group: 'Practice', name: '21-practice-plan', title: 'A practice video, before checking', url: '/?demo=session&plan', wait: 5000 },
  { group: 'Practice', name: '22-basket', title: 'A basket of serves', url: '/?demo=basket', wait: 9000 },
]

/** The page's own measure of itself. Runs in the page. */
function measure() {
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  const onFirst = (el) => {
    const r = el.getBoundingClientRect()
    return r.top < innerHeight && r.bottom > 0
  }
  const doc = document.documentElement
  const height = Math.max(doc.scrollHeight, document.body.scrollHeight)
  // Over an open sheet, the first screen is the sheet (Mirror M0.2): the
  // screen behind it is dimmed and can't be pressed, so its words, controls
  // and lime action aren't counted as the sheet's.
  const modals = [...document.querySelectorAll('[role=dialog][aria-modal=true], dialog[open]')].filter(visible)
  const top = modals[modals.length - 1]
  const layer = top ?? document.body
  const controls = [...layer.querySelectorAll('button, a[href], input:not([type=hidden]), summary, select, [role=button]')].filter(visible)
  const main = document.querySelector('main') ?? document.body
  const words = (main.innerText.match(/\S+/g) ?? []).length
  // Words a player sees on the first screen, from the text nodes that sit on it.
  let firstWords = 0
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue
    range.selectNodeContents(n)
    const r = range.getBoundingClientRect()
    if (r.height > 0 && r.top < innerHeight && r.bottom > 0) firstWords += (n.textContent.match(/\S+/g) ?? []).length
  }
  // Lime as a fill on something pressable: DESIGN.md's "one main action".
  // Counting the screen behind a sheet made every sheet read 2 or 3.
  const LIME = 'rgb(205, 249, 74)'
  const limeActions = controls.filter((el) => {
    if (!onFirst(el)) return false
    const s = getComputedStyle(el)
    return s.backgroundColor === LIME || /205, 249, 74|220, 255, 102|224, 255, 110/.test(s.backgroundImage)
  }).length
  // Text under the 14 px floor that a player reads (not hidden, not empty).
  const small = new Set()
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
    if (!own) continue
    const px = parseFloat(getComputedStyle(el).fontSize)
    if (px < 14) small.add(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} ${px}px`)
  }
  // How much of the width past the rail has something on it, on the first
  // screen: the columns that words or pictures actually cover, in 8 px bins,
  // so a phone column alone in the middle reads about 0.4 and two full panes
  // nearer 0.9. Words count by their own line boxes, not their block's width.
  const rail = [...document.querySelectorAll('nav, aside, .rail')].find((el) => visible(el) && el.getBoundingClientRect().height > innerHeight * 0.6 && el.getBoundingClientRect().left < 4)
  const railRight = rail ? rail.getBoundingClientRect().right : 0
  const BIN = 8
  const bins = new Uint8Array(Math.ceil((innerWidth - railRight) / BIN))
  const cover = (r) => {
    if (r.width <= 0 || r.height <= 0 || r.top >= innerHeight || r.bottom <= 0) return
    const from = Math.max(0, Math.floor((r.left - railRight) / BIN))
    const to = Math.min(bins.length - 1, Math.floor((r.right - railRight - 1) / BIN))
    for (let i = from; i <= to; i++) bins[i] = 1
  }
  // A sheet's own width: the dimmed screen behind it is not the sheet using the width.
  const lines = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT)
  for (let n = lines.nextNode(); n; n = lines.nextNode()) {
    if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement) || (rail && rail.contains(n))) continue
    range.selectNodeContents(n)
    for (const r of range.getClientRects()) cover(r)
  }
  for (const el of layer.querySelectorAll('img, canvas, video, svg, figure')) {
    if (visible(el) && !(rail && rail.contains(el)) && el.getBoundingClientRect().width > 24) cover(el.getBoundingClientRect())
  }
  const span = bins.length ? bins.reduce((a, b) => a + b, 0) / bins.length : 0
  // Text cut off by a box that hides its overflow: words the player can't read.
  const clipped = [...document.querySelectorAll('body *')].filter((el) => {
    if (!visible(el) || !el.textContent.trim()) return false
    const s = getComputedStyle(el)
    // Not screen-reader-only text, which is clipped to a pixel on purpose.
    return /hidden|clip/.test(s.overflowX) && el.clientWidth > 2 && el.scrollWidth > el.clientWidth + 1
  }).length
  return {
    screens: +(height / innerHeight).toFixed(1),
    clipped,
    controls: controls.length,
    firstScreenControls: controls.filter(onFirst).length,
    words,
    firstScreenWords: firstWords,
    limeActions,
    underFloor: [...small].slice(0, 12),
    sideways: doc.scrollWidth > innerWidth + 1,
    widthUse: +span.toFixed(2),
  }
}

async function shoot(browser, set, sizeName, screen) {
  const size = SIZES[sizeName]
  const dir = join(gallery, set, sizeName)
  mkdirSync(dir, { recursive: true })
  const context = await browser.newContext({
    viewport: size.viewport,
    deviceScaleFactor: size.scale,
    hasTouch: size.touch,
    isMobile: size.touch,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
    permissions: ['camera', 'microphone'],
  })
  const prefs = screen.prefs === undefined ? BACK : screen.prefs
  if (prefs) await context.addInitScript((p) => localStorage.setItem('serve-coach-prefs', JSON.stringify(p)), prefs)
  const page = await context.newPage()
  const console_ = []
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const text = m.text().slice(0, 240)
    // MediaPipe's own logging, which it writes to the console's error and
    // warning channels: kept, but not counted as the app's errors.
    const engine = /^[WIE]\d{4} |TensorFlow Lite|XNNPACK|gl_context|landmark_projection/.test(text)
    console_.push({ type: engine ? 'engine-log' : m.type(), text })
  })
  page.on('pageerror', (e) => console_.push({ type: 'pageerror', text: String(e).slice(0, 240) }))
  const entry = { name: screen.name, title: screen.title, group: screen.group, size: sizeName }
  try {
    await page.goto(base + (screen.url ?? '/'), { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(screen.wait ?? 900)
    if (screen.steps) await screen.steps(page, context)
    await page.waitForTimeout(400)
    const shot = `${screen.name}.jpg`
    await page.screenshot({ path: join(dir, shot), type: 'jpeg', quality: 72 })
    Object.assign(entry, await page.evaluate(measure))
    entry.shot = `${set}/${sizeName}/${shot}`
    if (screen.full !== false && entry.screens > 1.05) {
      const full = `${screen.name}-full.jpg`
      await page.screenshot({ path: join(dir, full), type: 'jpeg', quality: 62, fullPage: true })
      entry.full = `${set}/${sizeName}/${full}`
    }
    console.log(
      `${sizeName} ${screen.name}: ${entry.screens} screens, ${entry.firstScreenWords} words first, ` +
        `${entry.limeActions} lime, ${entry.underFloor.length} under 14px${entry.sideways ? ', SIDEWAYS' : ''}${entry.clipped ? `, ${entry.clipped} CLIPPED` : ''}` +
        `, width ${entry.widthUse}${console_.some((c) => c.type === 'error' || c.type === 'pageerror') ? ', CONSOLE ERRORS' : ''}`,
    )
  } catch (e) {
    entry.failed = String(e).slice(0, 300)
    console.log(`${sizeName} ${screen.name}: FAILED ${entry.failed}`)
  } finally {
    entry.console = console_
    await context.close().catch(() => {})
  }
  return entry
}

function readSets() {
  return readdirSync(gallery, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(gallery, d.name, 'log.json')))
    .map((d) => ({ set: d.name, ...JSON.parse(readFileSync(join(gallery, d.name, 'log.json'), 'utf8')) }))
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt))
}

/** One page, opened from disk, that pairs any two sets screen by screen. */
function writeIndex() {
  const sets = readSets()
  const data = JSON.stringify(sets.map(({ set, takenAt, commit, shots }) => ({ set, takenAt, commit, shots })))
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Serve Coach screen tour</title>
<style>
  :root { color-scheme: dark; --ink:#0b0f14; --panel:#141b24; --fg:#e8eef5; --muted:#9aa7b8; --lime:#cdf94a; --work:#ff7a59 }
  body { margin:0; background:var(--ink); color:var(--fg); font:16px/1.45 system-ui, sans-serif }
  header { position:sticky; top:0; z-index:2; background:rgba(11,15,20,.94); backdrop-filter:blur(8px); padding:14px 24px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; border-bottom:1px solid #1f2a36 }
  h1 { font-size:20px; margin:0 12px 0 0 }
  label { color:var(--muted); font-size:15px }
  select { font:inherit; background:var(--panel); color:var(--fg); border:1px solid #2a3746; border-radius:10px; padding:6px 10px }
  main { padding:8px 24px 64px }
  h2 { font-size:18px; margin:32px 0 8px; color:var(--lime) }
  .row { display:grid; grid-template-columns:220px 1fr 1fr; gap:16px; padding:16px 0; border-bottom:1px solid #1a2430; align-items:start }
  .row.laptop { grid-template-columns:220px 1fr 1fr }
  .meta h3 { font-size:16px; margin:0 0 6px }
  .meta p { margin:0; color:var(--muted); font-size:14px }
  figure { margin:0 }
  figure img { width:100%; max-width:420px; border-radius:12px; display:block; background:#000 }
  .laptop figure img { max-width:100% }
  figcaption { font-size:14px; color:var(--muted); margin-top:6px }
  figcaption a { color:var(--muted) }
  .bad { color:var(--work) }
  .none { color:var(--muted); font-style:italic; padding:24px 0 }
  ul.console { margin:6px 0 0; padding-left:18px; font-size:14px; color:var(--work); max-width:420px; overflow-wrap:anywhere }
</style>
</head>
<body>
<header>
  <h1>Screen tour</h1>
  <label>Before <select id="a"></select></label>
  <label>After <select id="b"></select></label>
  <label>Size <select id="size"><option>phone</option><option>laptop</option></select></label>
</header>
<main id="out"></main>
<script>
const SETS = ${data};
const q = new URLSearchParams(location.search);
const a = document.getElementById('a'), b = document.getElementById('b'), size = document.getElementById('size');
for (const s of SETS) { a.add(new Option(s.set + ' (' + s.takenAt.slice(0, 10) + ')', s.set)); b.add(new Option(s.set + ' (' + s.takenAt.slice(0, 10) + ')', s.set)); }
a.value = q.get('a') || (SETS[0] && SETS[0].set); b.value = q.get('b') || (SETS.at(-1) && SETS.at(-1).set); size.value = q.get('size') || 'phone';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function cell(shot) {
  if (!shot) return '<div class="none">Not taken in this set</div>';
  if (shot.failed) return '<div class="none bad">Failed: ' + esc(shot.failed) + '</div>';
  const notes = [shot.screens + ' screens', shot.firstScreenWords + ' words on the first screen', shot.limeActions + ' lime'];
  if (shot.underFloor.length) notes.push('<span class="bad">' + shot.underFloor.length + ' under 14 px</span>');
  if (shot.sideways) notes.push('<span class="bad">scrolls sideways</span>');
  if (shot.size === 'laptop') notes.push('spans ' + Math.round(shot.widthUse * 100) + '% of the width');
  const errors = shot.console.filter((c) => c.type === 'error' || c.type === 'pageerror');
  return '<figure><a href="' + (shot.full || shot.shot) + '"><img loading="lazy" src="' + shot.shot + '" alt="' + esc(shot.title) + '"></a>' +
    '<figcaption>' + notes.join(', ') + (shot.full ? ', <a href="' + shot.full + '">whole page</a>' : '') + '</figcaption>' +
    (errors.length ? '<ul class="console">' + errors.map((c) => '<li>' + esc(c.type + ': ' + c.text) + '</li>').join('') + '</ul>' : '') + '</figure>';
}
function render() {
  const A = SETS.find((s) => s.set === a.value), B = SETS.find((s) => s.set === b.value);
  const pick = (S, n) => S && S.shots.find((s) => s.name === n && s.size === size.value);
  const names = [];
  for (const S of [A, B]) for (const s of (S ? S.shots : [])) if (s.size === size.value && !names.some((n) => n.name === s.name)) names.push(s);
  names.sort((x, y) => x.name.localeCompare(y.name, 'en', { numeric: true }));
  let group = '', html = '';
  for (const n of names) {
    if (n.group !== group) { group = n.group; html += '<h2>' + esc(group) + '</h2>'; }
    html += '<div class="row ' + size.value + '"><div class="meta"><h3>' + esc(n.title) + '</h3><p>' + esc(n.name) + '</p></div>' + cell(pick(A, n.name)) + cell(pick(B, n.name)) + '</div>';
  }
  document.getElementById('out').innerHTML = html || '<p class="none">No shots yet.</p>';
  history.replaceState(null, '', '?a=' + a.value + '&b=' + b.value + '&size=' + size.value);
}
for (const el of [a, b, size]) el.onchange = render;
render();
</script>
</body>
</html>
`
  writeFileSync(join(gallery, 'index.html'), html)
  console.log(`index: ${sets.length} sets, ${join('docs', 'elevate', 'gallery', 'index.html')}`)
}

/** Two sets side by side as one picture, for a report in a chat. */
async function writeSheet(a, b, sizeName = 'phone', only) {
  const pw = loadPlaywright()
  const browser = await pw.chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage({ viewport: { width: sizeName === 'phone' ? 1100 : 1600, height: 900 } })
  const url = `file:///${join(gallery, 'index.html').replace(/\\/g, '/')}?a=${a}&b=${b}&size=${sizeName}`
  await page.goto(url)
  await page.waitForTimeout(600)
  if (only) {
    await page.evaluate((o) => {
      for (const row of document.querySelectorAll('.row')) if (!o.split(',').some((n) => row.textContent.includes(n))) row.remove()
      for (const h of document.querySelectorAll('h2')) if (!h.nextElementSibling || h.nextElementSibling.tagName === 'H2') h.remove()
    }, only)
  }
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.loading = 'eager', i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r))))))
  const file = join(gallery, `${a}-${b}-${sizeName}${only ? '-' + only.replace(/[^a-z0-9]+/gi, '_') : ''}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 70, fullPage: true })
  await browser.close()
  console.log(file)
}

const args = process.argv.slice(2)
if (args[0] === '--index') {
  writeIndex()
} else if (args[0] === '--sheet') {
  await writeSheet(args[1], args[2], args[3], args[4])
} else {
  const set = args[0]
  const only = args[1]
  if (!set || set.startsWith('-')) throw new Error('name the set: node scripts/tour.mjs w0')
  const sizes = process.env.SIZE ? [process.env.SIZE] : Object.keys(SIZES)
  for (const s of sizes) if (!SIZES[s]) throw new Error(`SIZE must be one of ${Object.keys(SIZES).join(', ')}`)
  const logFile = join(gallery, set, 'log.json')
  const previous = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : { shots: [] }
  const { execSync } = await import('node:child_process')
  const commit = execSync('git rev-parse --short HEAD').toString().trim()
  const dirty = execSync('git status --porcelain -- src').toString().trim() !== ''
  const pw = loadPlaywright()
  const browser = await pw.chromium.launch({
    channel: 'chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  })
  const shots = []
  try {
    for (const size of sizes) {
      for (const screen of SCREENS) {
        if (only && !screen.name.includes(only)) continue
        if (screen.needs && !existsSync(screen.needs)) {
          console.log(`${size} ${screen.name}: skipped, no ${screen.needs}`)
          continue
        }
        shots.push(await shoot(browser, set, size, screen))
      }
    }
  } finally {
    await browser.close()
  }
  const kept = previous.shots.filter((s) => !shots.some((n) => n.name === s.name && n.size === s.size))
  const all = [...kept, ...shots].sort((x, y) => x.size.localeCompare(y.size) || x.name.localeCompare(y.name, 'en', { numeric: true }))
  mkdirSync(join(gallery, set), { recursive: true })
  writeFileSync(logFile, JSON.stringify({ takenAt: previous.takenAt ?? new Date().toISOString(), commit: commit + (dirty ? '+' : ''), shots: all }, null, 2))
  const errors = shots.reduce((n, s) => n + s.console.filter((c) => c.type === 'error' || c.type === 'pageerror').length, 0)
  const failed = shots.filter((s) => s.failed).length
  console.log(`${set}: ${shots.length} shots, ${failed} failed, ${errors} console errors`)
  writeIndex()
}
