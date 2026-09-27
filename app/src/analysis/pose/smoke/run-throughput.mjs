#!/usr/bin/env node
/**
 * Pose throughput probe runner (dev only):
 *   node src/analysis/pose/smoke/run-throughput.mjs [--port 5304] [--clip baseline-s1] [--from 100] [--to 219]
 * Needs a dev server (npx vite --port 5304 --strictPort). Prints one row per configuration.
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const port = Number(arg('port', '5304'))
const clip = arg('clip', 'baseline-s1')
const from = Number(arg('from', '100'))
const to = Number(arg('to', '219'))
const only = arg('only', '')

const all = [
  { label: 'full n2 1w', model: 'full', numPoses: 2, maxInFlight: 2, workers: 1 },
  { label: 'full n2 2w', model: 'full', numPoses: 2, maxInFlight: 2, workers: 2 },
  { label: 'full n2 3w', model: 'full', numPoses: 2, maxInFlight: 2, workers: 3 },
  { label: 'full n2 1w if4', model: 'full', numPoses: 2, maxInFlight: 4, workers: 1 },
  { label: 'full n2 1w side512', model: 'full', numPoses: 2, maxInFlight: 2, workers: 1, side: 512 },
  { label: 'full n1 1w', model: 'full', numPoses: 1, maxInFlight: 2, workers: 1 },
  { label: 'full n1 2w', model: 'full', numPoses: 1, maxInFlight: 2, workers: 2 },
  { label: 'full n1 1w side512', model: 'full', numPoses: 1, maxInFlight: 2, workers: 1, side: 512 },
  { label: 'full n1 2w side512', model: 'full', numPoses: 1, maxInFlight: 2, workers: 2, side: 512 },
  { label: 'lite n2 1w', model: 'lite', numPoses: 2, maxInFlight: 2, workers: 1 },
  { label: 'lite n1 1w', model: 'lite', numPoses: 1, maxInFlight: 2, workers: 1 },
  { label: 'full n2 CPU 1w', model: 'full', numPoses: 2, delegate: 'CPU', maxInFlight: 2, workers: 1 },
]
const configs = only ? all.filter((c) => only.split(',').some((o) => c.label.includes(o))) : all

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('console error:', m.text())
  })
  await page.goto(`http://localhost:${port}/src/analysis/pose/smoke/throughput.html`)
  await page.waitForFunction(() => typeof window.throughput === 'function')
  const results = await page.evaluate(
    ([c, f, t, cfgs]) => window.throughput(`/__synthetic/clips/${c}/${c}.mp4`, `/__synthetic/clips/${c}/truth.json`, f, t, cfgs),
    [clip, from, to, configs],
  )
  for (const r of results) console.log(JSON.stringify(r))
} finally {
  await browser.close()
}
