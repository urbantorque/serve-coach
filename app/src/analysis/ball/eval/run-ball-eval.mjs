// Ball-layer evaluation on the rendered synthetic corpus (validation/synthetic, tools/synth).
// Decodes each clip with ffmpeg-static (RGBA frames and mono 48 kHz audio), runs the ball
// pipeline (evalCore.ts) and prints per-clip and per-scenario tables against the truth.
//
// Run from app/ (tsx loads the TypeScript core):
//   npx tsx src/analysis/ball/eval/run-ball-eval.mjs [--clips baseline-s1,dusk-s2] [--out results.json] [--features]
//
// Default set: 20 clips over baseline, fps sweep (30/120/240), slow motion, dusk, night 240 fps,
// CRF 36, 12 m, apex out of frame and one rear-view clip. Nothing is downloaded.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateClip } from './evalCore.ts'

const require = createRequire(import.meta.url)
const ffmpeg = require('ffmpeg-static')

const args = process.argv.slice(2)
const option = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const corpus = resolve(option('--corpus', resolve(appRoot, '../validation/synthetic')))
const manifestPath = join(corpus, 'manifest.json')
if (!existsSync(manifestPath)) throw new Error(`no synthetic corpus at ${corpus} (render it with tools/synth first)`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const DEFAULT_CLIPS = [
  'baseline-s1', 'baseline-s2',
  'fps30-s1', 'fps30-s2', 'fps120-s1', 'fps120-s2', 'fps240-s1',
  'slomo-s1', 'slomo-s2',
  'dusk-s1', 'dusk-s2',
  'night240-s1', 'night240-s2',
  'crf36-s1', 'crf36-s2',
  'dist12-s1', 'dist12-s2',
  'apexout-s1', 'apexout-s2',
  'rear-s1',
]
const clipIds = option('--clips', DEFAULT_CLIPS.join(',')).split(',').filter(Boolean)
const outPath = option('--out', '')

/** RGBA frames from ffmpeg, one reused buffer (the consumer finishes each frame before the next). */
async function* decodeFrames(file, width, height) {
  const proc = spawn(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const exited = new Promise((resolveExit, reject) => {
    proc.on('error', reject)
    proc.on('close', (code) => (code === 0 ? resolveExit() : reject(new Error(`ffmpeg exited with ${code} for ${file}`))))
  })
  const frameBytes = width * height * 4
  const buffer = Buffer.allocUnsafe(frameBytes)
  let filled = 0
  for await (const chunk of proc.stdout) {
    let offset = 0
    while (offset < chunk.length) {
      const n = Math.min(frameBytes - filled, chunk.length - offset)
      chunk.copy(buffer, filled, offset, offset + n)
      filled += n
      offset += n
      if (filled === frameBytes) {
        yield { width, height, data: new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, frameBytes) }
        filled = 0
      }
    }
  }
  await exited
}

function decodeAudio(file) {
  const out = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:a:0?', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'], {
    maxBuffer: 1 << 28,
  })
  if (out.status !== 0 || !out.stdout || out.stdout.length < 4) return null
  const bytes = new Uint8Array(out.stdout)
  return { samples: new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4)).slice(), sampleRate: 48000 }
}

const outgoingCell = (r) => (r.outgoing.found ? `${r.outgoing.detections} det, ${pct(r.outgoing.precision)} on ball` : 'none')
const fmt = (v, digits = 1) => (v === null || v === undefined || Number.isNaN(v) ? '–' : Number(v).toFixed(digits))
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : `${(100 * v).toFixed(0)}%`)

const results = []
for (const id of clipIds) {
  const clip = manifest.clips.find((c) => c.id === id)
  if (!clip) throw new Error(`clip ${id} not in the manifest`)
  const truth = JSON.parse(readFileSync(join(corpus, clip.files.truth), 'utf8'))
  const file = join(corpus, clip.files.mp4)
  const started = Date.now()
  const result = await evaluateClip({
    truth,
    scenario: id.replace(/-s\d+$/, ''),
    frames: decodeFrames(file, clip.video.width, clip.video.height),
    audio: decodeAudio(file),
    // Un-flagged slow motion: the video layer only sees a 30 fps container.
    timeBaseKnown: clip.video.timeScale === 1,
    mediaFps: clip.video.fps,
  })
  results.push(result)
  const d = result.detection
  const t = result.toss
  console.log(
    `${id}: ${((Date.now() - started) / 1000).toFixed(0)} s, ${fmt(result.msPerFrame)} ms/frame | recall toss ${pct(d.recallToss)} flight ${pct(d.recallFlight)} ` +
      `precision ${pct(d.precision)} (${fmt(d.falsePerFrame, 2)} false/frame) err ${fmt(d.errorMedianPx, 2)} px | support true p5 ${fmt(d.support.trueP5, 2)} p50 ${fmt(d.support.trueP50, 2)}, false p50 ${fmt(d.support.falseP50, 2)} p95 ${fmt(d.support.falseP95, 2)} | toss ${t.status} apex ${fmt(t.apexErrorMs, 2)} ms release ${fmt(t.releaseErrorMs)} ms ` +
      `contact ${fmt(t.contactErrorMs, 2)} ms | outgoing ${outgoingCell(result)} | gravity ${fmt(result.gravity.factor, 3)} (${result.gravity.suggestion}) | speed ${result.speed.status}` +
      (result.speed.lowKmh !== undefined ? ` ${result.speed.lowKmh}-${result.speed.highKmh} vs ${fmt(result.speed.truthKmh, 0)}` : '') +
      (result.notes.length ? ` | notes: ${result.notes.join('; ')}` : ''),
  )
}

// ---------- tables ----------
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.NaN)
const finite = (xs) => xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x))
const maxAbs = (xs) => (xs.length ? Math.max(...xs.map(Math.abs)) : Number.NaN)

// Pooled over the clips of a scenario (frames, not per-clip averages).
const pooled = (rs, frames, rate) => {
  const n = rs.reduce((s, r) => s + r.detection[frames], 0)
  return n ? rs.reduce((s, r) => s + (Number.isFinite(r.detection[rate]) ? r.detection[rate] * r.detection[frames] : 0), 0) / n : Number.NaN
}
const speedCell = (r) =>
  r.speed.status === 'experimental'
    ? `${r.speed.lowKmh}–${r.speed.highKmh} (truth ${fmt(r.speed.truthKmh, 0)}${r.speed.covered ? '' : ', OUT'})`
    : r.view === 'rear'
      ? `rear average: ${r.averageSpeedRear.status === 'experimental' ? `${r.averageSpeedRear.lowKmh}–${r.averageSpeedRear.highKmh}` : 'unavailable'}`
      : 'unavailable'

const perClip = [
  '| clip | fps | toss recall (top-1) | flight recall (frames) | precision: candidates / top-1 | false / frame | loc. error median / p95 (px) | toss track precision / coverage | outgoing track (detections, on ball) | apex error ms (z) | release error (ms) | contact error (ms) | gravity factor (expected) | apex height error (cm) | speed (km/h) |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...results.map((r) => {
    const d = r.detection
    const t = r.toss
    return (
      `| ${r.clipId} | ${fmt(r.fps.capture, 0)}${r.timeBaseKnown ? '' : ' as 30'} | ${pct(d.recallToss)} (${pct(d.top1RecallToss)}) | ${pct(d.recallFlight)} (${d.flightFrames}) | ` +
      `${pct(d.precision)} / ${pct(d.top1Precision)} | ${fmt(d.falsePerFrame, 2)} | ${fmt(d.errorMedianPx, 2)} / ${fmt(d.errorP95Px, 2)} | ${pct(t.trackPrecision)} / ${pct(t.coverage)} | ${outgoingCell(r)} | ` +
      `${fmt(t.apexErrorMs, 2)} (${fmt(t.apexZ, 1)})${t.apexBracketed === false ? ' extrap.' : ''} | ${fmt(t.releaseErrorMs, 1)} | ${fmt(t.contactErrorMs, 2)} | ` +
      `${fmt(r.gravity.factor, 3)} (${fmt(r.gravity.expectedFactor, 3)}) | ${t.apexHeight.errorM === null ? '–' : fmt(100 * t.apexHeight.errorM, 1)}${t.apexHeight.covered === false ? ' OUT' : ''} | ${speedCell(r)} |`
    )
  }),
]

const scenarios = [...new Set(results.map((r) => r.scenario))]
const perScenario = [
  '| scenario | clips | toss recall | flight recall (frames) | precision: candidates / top-1 | loc. error median (px) | apex abs. error mean / max (ms) | release error mean (ms) | contact abs. error (ms) | gravity factor (expected) | apex height error mean (cm) | speed ranges covering truth |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...scenarios.map((s) => {
    const rs = results.filter((r) => r.scenario === s)
    const apex = finite(rs.map((r) => r.toss.apexErrorMs))
    const release = finite(rs.map((r) => r.toss.releaseErrorMs))
    const contact = finite(rs.map((r) => r.toss.contactErrorMs))
    const factors = finite(rs.map((r) => r.gravity.factor))
    const heights = finite(rs.map((r) => r.toss.apexHeight.errorM))
    const speeds = rs.filter((r) => r.speed.status === 'experimental')
    const flightFrames = rs.reduce((n, r) => n + r.detection.flightFrames, 0)
    return (
      `| ${s} | ${rs.length} | ${pct(pooled(rs, 'tossFrames', 'recallToss'))} | ${pct(pooled(rs, 'flightFrames', 'recallFlight'))} (${flightFrames}) | ` +
      `${pct(mean(finite(rs.map((r) => r.detection.precision))))} / ${pct(mean(finite(rs.map((r) => r.detection.top1Precision))))} | ${fmt(mean(finite(rs.map((r) => r.detection.errorMedianPx))), 2)} | ` +
      `${fmt(mean(apex.map(Math.abs)), 2)} / ${fmt(maxAbs(apex), 2)} | ${fmt(mean(release), 1)} | ${contact.length ? contact.map((c) => Math.abs(c).toFixed(2)).join(', ') : '–'} | ` +
      `${factors.map((f) => f.toFixed(3)).join(', ') || '–'} (${fmt(rs[0].gravity.expectedFactor, 3)}) | ${fmt(100 * mean(heights), 1)} | ` +
      `${speeds.length ? `${speeds.filter((r) => r.speed.covered).length}/${speeds.length}` : 'refused'} |`
    )
  }),
]

console.log('\nPer clip\n')
console.log(perClip.join('\n'))
console.log('\nPer scenario\n')
console.log(perScenario.join('\n'))
const refusals = results.filter((r) => r.speed.status !== 'experimental' && r.fps.capture >= 120).map((r) => `${r.clipId}: ${r.speed.reason}`)
if (refusals.length) console.log(`\nSpeed refusals at >= 120 fps:\n${refusals.join('\n')}`)
const rear = results.filter((r) => r.view === 'rear')
for (const r of rear) console.log(`\n${r.clipId} (rear): bounce ${r.bounce.status}${r.bounce.reason ? ` (${r.bounce.reason})` : ''}; average speed ${r.averageSpeedRear.status}${r.averageSpeedRear.reason ? ` (${r.averageSpeedRear.reason})` : ''}`)
if (outPath) {
  const keepFeatures = args.includes('--features')
  const slim = results.map((r) => (keepFeatures ? r : { ...r, detection: { ...r.detection, features: undefined } }))
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), corpus, results: slim }, null, 1))
  console.log(`\nwrote ${outPath}`)
}
