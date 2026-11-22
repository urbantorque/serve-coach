#!/usr/bin/env node
/**
 * The landing's real serve (Apex F, "a landing that demonstrates"): one openly
 * licensed clip, read once by the app's own engine, and the read saved beside
 * a trimmed copy of the clip, so the landing plays the directed replay with no
 * engine and no model download.
 *
 *   node scripts/landing-serve.mjs        with the dev server on BASE (default http://localhost:5180)
 *
 * Writes:
 * - `public/landing/serve.mp4`: the serve's window of the clip, re-encoded by
 *   Chrome's own recorder as H.264 (no audio), which every browser plays, so a
 *   first visit fetches a fraction of the whole file. A trimmed copy is an adaptation, so it carries the clip's
 *   licence, CC BY-SA 3.0, and the landing credits it.
 * - `public/landing/serve.json`: what the replay draws with: the body's
 *   picture points over the window, its 3D points at the held moment, the
 *   phases, and the part of the body the first fix is about.
 * - `src/lib/__tests__/landingServe.read.json`: the read itself (the card, the
 *   score, the focus), which `landingServe.test.ts` holds the landing's words
 *   to, so a rubric change cannot leave the landing saying an old read.
 *
 * Dev tooling: nothing here ships but its output. The clip is
 * `bench-data/clips/Saque_con_pelota.webm` (attribution in that folder).
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const base = process.env.BASE ?? 'http://localhost:5180'
const require = createRequire(join(root, 'package.json'))
const pw = require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))

const CLIP = 'Saque_con_pelota.webm'
/** Seconds of run-up kept before the ready position, and of follow-through after the finish. */
const LEAD = 0.35
const TAIL = 0.25

const browser = await pw.chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log(`pageerror: ${String(e).slice(0, 200)}`))
await page.goto(`${base}/pipeline.html?serves=none`, { waitUntil: 'load' })

const out = await page.evaluate(
  async ({ url, name, lead, tail }) => {
    const { analyzeServe } = await import('/src/lib/analysis/analyze.ts')
    const { rowParts } = await import('/src/lib/figure/swing.ts')
    const a = await analyzeServe({ videoUrl: url, fileName: name, skipThumbnails: true, waitForRefine: true })
    const ph = (id) => a.phases.find((p) => p.id === id)
    const from = Math.max(a.frames[0].t, ph('ready').t - lead)
    const to = Math.min(a.frames[a.frames.length - 1].t, ph('finish').t + tail)

    // The card row that leads the fix, and its moment, as the report finds them (W5.3).
    const row = a.fundamentals.flatMap((f) => f.metrics).find((m) => m.label === a.focus.title)

    // Trim: play the window once and record it as it plays.
    const v = document.createElement('video')
    v.src = url
    v.muted = true
    v.playsInline = true
    document.body.append(v)
    await new Promise((r) => (v.oncanplaythrough = r))
    v.currentTime = from
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
    const stream = new MediaStream(v.captureStream().getVideoTracks())
    const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.42E01E', videoBitsPerSecond: 650_000 })
    const parts = []
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
    let startedAt = NaN
    const stopped = new Promise((r) => (rec.onstop = r))
    rec.onstart = () => (startedAt = v.currentTime)
    rec.start()
    await v.play()
    await new Promise((r) => {
      const tick = () => (v.currentTime >= to || v.ended ? r() : requestAnimationFrame(tick))
      tick()
    })
    v.pause()
    rec.stop()
    await stopped
    const blob = new Blob(parts, { type: 'video/mp4' })
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))

    // Where the copy really starts. The recorder begins a few frames from where
    // it was asked to, so the copy is matched against the clip picture by
    // picture, and the body's points move with it: a forearm painted at the
    // drop has to sit on the drop's own frame.
    const copy = document.createElement('video')
    copy.src = URL.createObjectURL(blob)
    copy.muted = true
    await new Promise((r) => (copy.oncanplaythrough = r))
    const seek = (el, t) => new Promise((r) => { el.addEventListener('seeked', r, { once: true }); el.currentTime = t })
    const c = document.createElement('canvas')
    c.width = 160
    c.height = 120
    const x = c.getContext('2d', { willReadFrequently: true })
    const grab = (el) => (x.drawImage(el, 0, 0, 160, 120), x.getImageData(0, 0, 160, 120).data)
    const differ = (p, q) => { let s = 0; for (let i = 0; i < p.length; i += 4) s += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]); return s }
    const asked = Number.isFinite(startedAt) ? startedAt : from
    const span = to - asked
    const probes = [0.15, 0.3, 0.45, 0.55, 0.65, 0.8].map((k) => k * span)
    const shots = []
    for (const t of probes) { await seek(copy, t); shots.push(grab(copy)) }
    let best = { lag: 0, d: Infinity }
    for (let lag = -0.25; lag <= 0.1; lag += 1 / 120) {
      let d = 0
      for (let i = 0; i < probes.length; i++) { await seek(v, asked + probes[i] + lag); d += differ(shots[i], grab(v)) }
      if (d < best.d) best = { lag, d }
    }
    const start = asked + best.lag
    window.__lag = best.lag
    const r4 = (n) => Math.round(n * 1e4) / 1e4
    const kept = a.frames.filter((f) => f.t >= start - 1e-3 && f.t <= to + 1e-3)
    const first = a.frames.indexOf(kept[0])
    const moment = row?.phase ?? 'contact'
    const held = ph(moment)
    return {
      bytes,
      lag: best.lag,
      replay: {
        source: { title: 'Saque con pelota', author: 'Dardo 86 7', licence: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Saque_con_pelota.ogv' },
        video: { width: a.video.width, height: a.video.height },
        handedness: a.handedness,
        tilt: a.tilt ?? 0,
        moment,
        work: row ? rowParts(row.id, a.handedness) : [],
        phases: a.phases
          .filter((p) => p.frame >= first && p.frame < first + kept.length)
          .map((p) => ({ id: p.id, t: r4(p.t - start), frame: p.frame - first })),
        end: r4(to - start),
        frames: kept.map((f) => ({ t: r4(f.t - start), image: f.image.flatMap((p) => [r4(p.x), r4(p.y)]) })),
        world: a.frames[held.frame].world.map((p) => [r4(p.x), r4(p.y), r4(p.z)]),
      },
      read: {
        clip: name,
        scoringVersion: a.scoringVersion,
        serveType: a.serveType,
        overall: a.overall,
        handedness: a.handedness,
        focus: a.focus,
        row: row?.id,
        fundamentals: a.fundamentals,
      },
    }
  },
  { url: `/bench-data/clips/${CLIP}`, name: CLIP, lead: LEAD, tail: TAIL },
)
await browser.close()

mkdirSync(join(root, 'public', 'landing'), { recursive: true })
writeFileSync(join(root, 'public', 'landing', 'serve.mp4'), Buffer.from(out.bytes))
writeFileSync(join(root, 'public', 'landing', 'serve.json'), JSON.stringify(out.replay))
writeFileSync(join(root, 'src', 'lib', '__tests__', 'landingServe.read.json'), JSON.stringify(out.read, null, 1) + '\n')
console.log(
  `serve.mp4 ${(out.bytes.length / 1024).toFixed(0)} KB, starts ${(out.lag * 1000).toFixed(0)} ms from where it was asked, ${out.replay.frames.length} frames over ${out.replay.end} s; ` +
    `read ${out.read.overall}, "${out.read.focus.title}" at ${out.replay.moment}, work ${out.replay.work.join(' ')}`,
)
