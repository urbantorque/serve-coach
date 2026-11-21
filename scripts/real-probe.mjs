#!/usr/bin/env node
/**
 * The two questions N2.8 left for real footage (A1.1), asked of every clip in
 * `bench-data/clips/` and `bench-data/own/` without labels:
 *
 * 1. Does MediaPipe's 3D knee bend when the picture's knee bends? From the
 *    side the two are the same angle. The trophy, knee bend, shoulder tilt and
 *    the elbow readings stand on the 3D one.
 * 2. Does the racket wrist leave the hand at contact? On the drawn body
 *    (N2.8) the arm straight up was read hanging down for three to five frames.
 *
 *   node scripts/real-probe.mjs                         every clip
 *   node scripts/real-probe.mjs Saque_con_pelota.webm   one clip
 *   POSE=heavy node scripts/real-probe.mjs              MediaPipe heavy, from bench-data
 *
 * Reads each clip with the app's own `analyzeServe` in the dev server (BASE,
 * default http://localhost:5180), collecting every pose sample, whether the
 * read ends in a report or a refusal. Writes docs/apex/bench/real-probe.json.
 * Dev tooling: nothing here ships. Uses the Playwright copy `playwright-cli`
 * runs on.
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const base = process.env.BASE ?? 'http://localhost:5180'
const pose = process.env.POSE ?? 'full'
const only = process.argv[2]
const require = createRequire(join(root, 'package.json'))
const pw = require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))

const dirs = ['clips', 'own'].map((d) => join(root, 'bench-data', d)).filter(existsSync)
const clips = dirs.flatMap((d) =>
  readdirSync(d)
    .filter((f) => /\.(webm|mp4|mov|m4v)$/i.test(f))
    .map((f) => ({ name: f, url: `/bench-data/${d.endsWith('own') ? 'own' : 'clips'}/${encodeURIComponent(f)}` })),
).filter((c) => !only || only.split(',').includes(c.name))

/** The two questions asked again inside the serve the engine found, ready to contact. */
function withinServe(row) {
  const at = (id) => row.keys?.find((k) => k.id === id)?.t
  const ready = at('ready')
  const trophy = at('trophy')
  const contact = at('contact')
  if (ready === undefined || contact === undefined) return row
  const inLoad = row.knees.filter((k) => k.t >= ready && k.t <= contact)
  const deepest = (side) => {
    const k = inLoad.filter((x) => x.side === side)
    if (!k.length) return undefined
    const d = k.reduce((m, x) => (x.picture < m.picture ? x : m))
    return { t: d.t, picture: d.picture, world: d.world, gap: +(d.world - d.picture).toFixed(1) }
  }
  const nearTrophy = trophy === undefined ? [] : row.knees.filter((k) => Math.abs(k.t - trophy) <= 0.05)
  const jumps = []
  for (let i = 1; i < row.wrists.length; i++) {
    const a = row.wrists[i - 1]
    const b = row.wrists[i]
    if (b.t < (trophy ?? ready) || b.t > contact + 0.15) continue
    const body = Math.max(0.05, (a.body + b.body) / 2)
    const l = Math.abs(b.left - a.left) / body
    const r = Math.abs(b.right - a.right) / body
    if (Math.max(l, r) > 0.3) jumps.push({ t: b.t, left: +l.toFixed(2), right: +r.toFixed(2) })
  }
  return { ...row, serve: { ready, trophy, contact, deepestLeft: deepest(23), deepestRight: deepest(24), atTrophy: nearTrophy, wristJumps: jumps } }
}

const browser = await pw.chromium.launch({ channel: 'chrome' })
const rows = []
try {
  for (const clip of clips) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('pageerror', (e) => console.log(`pageerror: ${String(e).slice(0, 200)}`))
    await page.goto(`${base}/pipeline.html?serves=none`, { waitUntil: 'load' })
    const row = await page.evaluate(
      async ({ url, name, pose }) => {
        if (pose === 'heavy') window.__serveCoachDevModels = { pose: '/bench-data/models/pose_landmarker_heavy.task' }
        const { analyzeServe } = await import('/src/lib/analysis/analyze.ts')
        const v = document.createElement('video')
        v.src = url
        await new Promise((r, j) => {
          v.onloadedmetadata = r
          v.onerror = () => j(new Error('the clip did not load'))
        })
        const W = v.videoWidth
        const H = v.videoHeight
        const samples = []
        let outcome = 'measured'
        let detail
        let analysis
        const started = performance.now()
        try {
          analysis = await analyzeServe({ videoUrl: url, fileName: name, skipThumbnails: true, waitForRefine: true, onPose: (s) => samples.push(s) })
        } catch (e) {
          outcome = e && e.name === 'NotAServeError' ? 'refused' : 'failed'
          detail = String(e && e.message).slice(0, 160)
        }
        const seconds = (performance.now() - started) / 1000
        // Angle at b, degrees, from three points already in one space.
        const angle = (a, b, c) => {
          const u = [a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)]
          const w = [c[0] - b[0], c[1] - b[1], (c[2] ?? 0) - (b[2] ?? 0)]
          const dot = u[0] * w[0] + u[1] * w[1] + u[2] * w[2]
          const n = Math.hypot(...u) * Math.hypot(...w)
          return n ? (Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180) / Math.PI : NaN
        }
        // Picture points in pixels, so a wide frame does not squash the angle.
        const px = (l) => [l.x * W, l.y * H]
        const wd = (l) => [l.x, l.y, l.z]
        const knees = []
        const wrists = []
        for (const s of samples) {
          if (!s.pose) continue
          const im = s.pose.image
          const wo = s.pose.world
          const seen = (i) => (im[i].visibility ?? 1) > 0.5
          for (const [hip, knee, ankle] of [[23, 25, 27], [24, 26, 28]]) {
            if (!seen(hip) || !seen(knee) || !seen(ankle)) continue
            knees.push({ t: s.t, side: hip, picture: angle(px(im[hip]), px(im[knee]), px(im[ankle])), world: angle(wd(wo[hip]), wd(wo[knee]), wd(wo[ankle])) })
          }
          // Body height in the picture: nose to the lower ankle.
          const body = Math.max(im[27].y, im[28].y) - im[0].y
          wrists.push({ t: s.t, left: im[15].y, right: im[16].y, nose: im[0].y, body, lv: im[15].visibility ?? 1, rv: im[16].visibility ?? 1 })
        }
        // Question 1: at the deepest picture bend, how far straighter is the 3D knee?
        const deepest = (side) => {
          const k = knees.filter((x) => x.side === side && x.picture > 0)
          if (!k.length) return undefined
          const d = k.reduce((m, x) => (x.picture < m.picture ? x : m))
          return { t: +d.t.toFixed(3), picture: +d.picture.toFixed(1), world: +d.world.toFixed(1), gap: +(d.world - d.picture).toFixed(1) }
        }
        const gaps = knees.map((k) => k.world - k.picture).sort((a, b) => a - b)
        // Question 2: the frame-to-frame jump of each wrist, as a share of body height.
        const jumps = []
        for (let i = 1; i < wrists.length; i++) {
          const a = wrists[i - 1]
          const b = wrists[i]
          const body = Math.max(0.05, (a.body + b.body) / 2)
          jumps.push({ t: +b.t.toFixed(3), left: Math.abs(b.left - a.left) / body, right: Math.abs(b.right - a.right) / body })
        }
        const big = jumps.filter((j) => Math.max(j.left, j.right) > 0.3).map((j) => ({ t: j.t, left: +j.left.toFixed(2), right: +j.right.toFixed(2) }))
        const top = wrists.length ? wrists.reduce((m, w) => (Math.min(w.left, w.right) < Math.min(m.left, m.right) ? w : m)) : undefined
        const keys = analysis?.keyframes ?? analysis?.phases
        return {
          clip: name,
          size: `${W}x${H}`,
          seconds: +seconds.toFixed(1),
          outcome,
          detail,
          score: analysis?.score,
          samples: samples.length,
          withBody: samples.filter((s) => s.pose).length,
          kneeFrames: knees.length,
          deepestLeft: deepest(23),
          deepestRight: deepest(24),
          medianGap: gaps.length ? +gaps[Math.floor(gaps.length / 2)].toFixed(1) : undefined,
          wristJumps: big,
          highestWrist: top && { t: +top.t.toFixed(3), aboveNose: +((top.nose - Math.min(top.left, top.right)) / Math.max(0.05, top.body)).toFixed(2) },
          keys: keys ? JSON.parse(JSON.stringify(keys)) : undefined,
          knees: knees.map((k) => ({ t: +k.t.toFixed(3), side: k.side, picture: +k.picture.toFixed(1), world: +k.world.toFixed(1) })),
          wrists: wrists.map((w) => ({ t: +w.t.toFixed(3), left: +w.left.toFixed(3), right: +w.right.toFixed(3), nose: +w.nose.toFixed(3), body: +w.body.toFixed(3) })),
        }
      },
      { url: clip.url, name: clip.name, pose },
    )
    rows.push(withinServe(row))
    const last = rows[rows.length - 1]
    console.log(JSON.stringify({ clip: last.clip, size: last.size, s: last.seconds, outcome: last.outcome, detail: last.detail, serve: last.serve && { ...last.serve, atTrophy: last.serve.atTrophy.length } }))
    await page.close()
  }
} finally {
  await browser.close()
}

const out = join(root, 'docs', 'apex', 'bench')
mkdirSync(out, { recursive: true })
const file = join(out, `real-probe${pose === 'full' ? '' : `-${pose}`}${only ? '-' + only.replace(/\W+/g, '_') : ''}.json`)
writeFileSync(file, JSON.stringify({ ranAt: new Date().toISOString(), about: 'docs/apex/LEDGER.md, A1.1', pose, rows }, null, 1) + '\n')
console.log(`wrote ${rows.length} rows to ${file}`)
