#!/usr/bin/env node
/**
 * Saves what the serve-finding scan reads in each bench clip (W6.11), so the
 * judging that turns those readings into serves can be tested in Node against
 * serve times marked by eye (`docs/apex/bench/serve-times.json`).
 *
 *   node scripts/scan-samples.mjs                         every clip
 *   node scripts/scan-samples.mjs Saque_con_pelota.webm   one clip, merged in
 *
 * Runs the app's own `locateServes` in the dev server (BASE, default
 * http://localhost:5180), the scan a picked clip or a whole practice gets,
 * player crop included, and keeps every reading before it is judged, with the
 * impacts heard in the clip's sound where there is one. Writes
 * src/lib/analysis/__tests__/scanSamples.json. Dev tooling: nothing here ships,
 * and the clips stay on this machine. Uses the Playwright copy `playwright-cli`
 * runs on.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const base = process.env.BASE ?? 'http://localhost:5180'
const only = process.argv[2]
const out = join(root, 'src/lib/analysis/__tests__/scanSamples.json')
const require = createRequire(join(root, 'package.json'))
const pw = require(join(process.env.APPDATA ?? '', 'npm/node_modules/@playwright/cli/node_modules/playwright'))

const dir = join(root, 'bench-data', 'clips')
const clips = readdirSync(dir)
  .filter((f) => /\.(webm|mp4|mov|m4v)$/i.test(f))
  .filter((f) => !only || only.split(',').includes(f))

const r = (x) => (x === undefined ? undefined : Math.round(x * 10000) / 10000)
const ABOUT =
  'What the serve-finding scan read in each bench clip, before judging: scripts/scan-samples.mjs, run against the dev server. Heights are negated image y. The source must not change while it runs: the dev server reloads the page.'
const saved = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { clips: {} }

const browser = await pw.chromium.launch({ channel: 'chrome' })
try {
  for (const clip of clips) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('pageerror', (e) => console.log(`pageerror: ${String(e).slice(0, 200)}`))
    await page.goto(`${base}/pipeline.html?serves=none`, { waitUntil: 'load' })
    const t0 = Date.now()
    const got = await page.evaluate(async (url) => {
      const { locateServes } = await import('/src/lib/analysis/analyze.ts')
      const { hearImpacts } = await import('/src/lib/audio/decode.ts')
      const heard = await hearImpacts(await (await fetch(url)).blob()).catch(() => undefined)
      let samples = []
      let unsure = []
      const v = document.createElement('video')
      v.muted = true
      const found = await locateServes(
        { videoUrl: url, fileName: 'bench', onScanSamples: (s) => (samples = [...s]), onUnsureServes: (t) => (unsure = t) },
        v,
      )
      return { found, unsure, samples, duration: v.duration, onsets: heard?.onsets }
    }, `/bench-data/clips/${encodeURIComponent(clip)}`)
    await page.close()
    saved.clips[clip] = {
      duration: r(got.duration),
      found: got.found?.map(r),
      unsure: got.unsure.map(r),
      ...(got.onsets ? { onsets: got.onsets.map(r) } : {}),
      samples: got.samples.map((s) => ({
        t: r(s.t),
        height: r(s.height),
        ...(s.pose
          ? {
              pose: Object.fromEntries(Object.entries(s.pose).map(([k, v]) => [k, r(v)])),
            }
          : {}),
      })),
    }
    // Saved after every clip: a run that stops part way keeps what it read.
    writeFileSync(out, JSON.stringify({ ...saved, about: ABOUT }) + '\n')
    console.log(
      `${clip}: ${got.samples.length} readings, found ${JSON.stringify(got.found?.map(r))}, unsure ${JSON.stringify(got.unsure.map(r))}, ${got.onsets ? `${got.onsets.length} impacts heard` : 'no sound read'}, ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    )
  }
} finally {
  await browser.close()
}
console.log(`wrote ${out}`)
