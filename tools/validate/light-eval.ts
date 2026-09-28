/**
 * Light-from-pixels check (finding 21; METRICS §1.3, §3.25 `flicker`, CAPTURE `cq.flicker`): runs the
 * app's own light evidence (app/src/analysis/quality/light.ts) on the rendered synthetic corpus and
 * reports the flicker amplitude and the sky/court luma that set the `flicker` and `night-lights` classes.
 *
 * Frames are decoded with the app's ffmpeg-static (dev dependency) to a LUMA_GRID × LUMA_GRID grey grid
 * (area average, limited-range luma converted to full range, as the app's canvas readback gives), then
 * sampled like the app's sparse pass: every round(fps / 4)-th frame over the clip plus every
 * round(fps / 15)-th frame around the serve (release − 1.5 s to contact + 1 s). The player's box comes
 * from the truth landmarks (the app uses the sparse poses). "full rate" uses every frame, for reference.
 *
 *   app/node_modules/.bin/tsx tools/validate/light-eval.ts [--clips a,b] [--sets night240,dusk]
 *
 * Output: validation/results/light/SUMMARY.md and rows.json. Synthetic renders only; the thresholds it
 * reports are initial values, not calibrated on real courts.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DARK_SKY_LUMA, DARK_SKY_RATIO, FLICKER_INFO, FLICKER_WARN, LUMA_GRID, lightEvidence, type LightEvidence, type LumaFrame } from '../../app/src/analysis/quality/light.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const corpus = join(repoRoot, 'validation/synthetic/clips')
const outDir = join(repoRoot, 'validation/results/light')
const require = createRequire(join(repoRoot, 'app/package.json'))
const ffmpeg = require('ffmpeg-static') as string

const args = process.argv.slice(2)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

interface Truth {
  settings: { fps: number; orientation: string; lighting?: { preset?: string; flickerHz?: number; flickerAmplitude?: number } }
  serves: { events: Record<string, { tReal: number }> }[]
  frames: { frameIndex: number; tReal: number; landmarks: { x: number; y: number }[] | null }[]
  video: { fps: number; captureFps: number; width: number; height: number; frameCount?: number }
}

function decodeGrid(file: string): Uint8Array[] {
  const n = LUMA_GRID
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', `scale=${n}:${n}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 })
  const frames: Uint8Array[] = []
  for (let o = 0; o + n * n <= raw.length; o += n * n) {
    const g = new Uint8Array(n * n)
    // Limited-range luma (16–235) to full range, like a canvas readback of the decoded frame.
    for (let k = 0; k < n * n; k++) g[k] = Math.max(0, Math.min(255, Math.round(((raw[o + k] - 16) * 255) / 219)))
    frames.push(g)
  }
  return frames
}

interface Row {
  clip: string
  set: string
  preset: string
  flickerHz: number
  fps: number
  frames: number
  sampled: number
  sky: number
  ground: number
  background: number
  subject: number | null
  dark: boolean
  flickerSparse: number | null
  flickerFull: number | null
  flickeringSparse: boolean
}

const setOf = (clip: string) => clip.replace(/-s\d+$/, '')
const wantClips = option('--clips')?.split(',')
const wantSets = option('--sets')?.split(',')
const clips = readdirSync(corpus).filter((c) => (!wantClips || wantClips.includes(c)) && (!wantSets || wantSets.includes(setOf(c))))
const rows: Row[] = []
const t0 = Date.now()
for (const clip of clips) {
  const dir = join(corpus, clip)
  const video = join(dir, `${clip}.mp4`)
  if (!existsSync(video) || !existsSync(join(dir, 'truth.json'))) continue
  const truth = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8')) as Truth
  const fps = truth.video.captureFps || truth.settings.fps
  let grids: Uint8Array[]
  try {
    grids = decodeGrid(video)
  } catch (error) {
    console.error(`${clip}: decode failed: ${(error as Error).message}`)
    continue
  }
  const boxes = new Map<number, { x0: number; y0: number; x1: number; y1: number }>()
  for (const f of truth.frames) {
    if (!f.landmarks?.length) continue
    const xs = f.landmarks.map((l) => l.x)
    const ys = f.landmarks.map((l) => l.y)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const px = 0.15 * (x1 - x0)
    const py = 0.1 * (y1 - y0)
    boxes.set(f.frameIndex, { x0: x0 - px, x1: x1 + px, y0: y0 - py, y1: y1 + py })
  }
  const all: LumaFrame[] = grids.map((grid, i) => ({ frameIndex: i, tReal: i / fps, grid }))
  // The app's sparse pass: a 4 Hz scan of the clip, a 15 Hz fill around the serve.
  const coarse = Math.max(1, Math.round(fps / 4))
  const fine = Math.max(1, Math.round(fps / 15))
  const evs = truth.serves.flatMap((s) => Object.values(s.events).map((e) => e.tReal)).filter((t) => Number.isFinite(t))
  const a = Math.max(0, Math.min(...evs) - 1.5)
  const b = Math.max(...evs) + 1
  const sparse = all.filter((f) => f.frameIndex % coarse === 0 || (f.tReal >= a && f.tReal <= b && f.frameIndex % fine === 0))
  const playerBox = (i: number) => boxes.get(i) ?? null
  const ev = lightEvidence(sparse, { captureFps: fps, playerBox }) as LightEvidence
  const full = lightEvidence(all, { captureFps: fps, playerBox })
  const l = truth.settings.lighting ?? {}
  rows.push({
    clip,
    set: setOf(clip),
    preset: l.preset ?? '?',
    flickerHz: l.flickerHz ?? 0,
    fps,
    frames: all.length,
    sampled: sparse.length,
    sky: ev.skyLuma,
    ground: ev.groundLuma,
    background: ev.backgroundLuma,
    subject: ev.subjectLuma ?? null,
    dark: ev.dark,
    flickerSparse: ev.flicker?.amplitude ?? null,
    flickerFull: full?.flicker?.amplitude ?? null,
    flickeringSparse: ev.flickering,
  })
  console.log(`${clip}: sky ${ev.skyLuma.toFixed(0)} ground ${ev.groundLuma.toFixed(0)} dark ${ev.dark} flicker ${ev.flicker ? (100 * ev.flicker.amplitude).toFixed(2) + '%' : '–'} (full ${full?.flicker ? (100 * full.flicker.amplitude).toFixed(2) + '%' : '–'})`)
}

// ---------- summary ----------
mkdirSync(outDir, { recursive: true })
const pct = (v: number | null) => (v === null ? '–' : `${(100 * v).toFixed(2)}%`)
const groups = new Map<string, Row[]>()
for (const r of rows) {
  const k = `${r.preset}${r.flickerHz ? ` + ${r.flickerHz} Hz flicker` : ''}, ${r.fps} fps`
  groups.set(k, [...(groups.get(k) ?? []), r])
}
const lines: string[] = []
lines.push('# Light from the pixels: synthetic corpus')
lines.push('')
lines.push(`Generated ${new Date().toISOString()} by \`tools/validate/light-eval.ts\` in ${((Date.now() - t0) / 1000).toFixed(0)} s over ${rows.length} clips. **Rendered synthetic clips only; no real courts.**`)
lines.push('')
lines.push(`The app's light evidence (\`app/src/analysis/quality/light.ts\`) on a ${LUMA_GRID} × ${LUMA_GRID} luma grid, sampled like the sparse pass (4 Hz scan plus a 15 Hz fill around the serve), the player's box left out. Flicker: relative amplitude of 100 Hz mains flicker at its alias (warning ≥ ${FLICKER_WARN * 100}%, info ≥ ${FLICKER_INFO * 100}%). Dark (court lights): the top band (median of its cells) below ${DARK_SKY_LUMA} luma and below ${DARK_SKY_RATIO} of the bottom band.`)
lines.push('')
lines.push('| Lighting | Clips | Sky luma (median, range) | Court luma (median) | Called dark | Flicker, sparse pass (median, max) | Flicker, every frame (median) | Called flickering |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
const med = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q)
  return s.length ? s[s.length >> 1] : Number.NaN
}
for (const [k, rs] of groups) {
  const sky = rs.map((r) => r.sky)
  const fl = rs.map((r) => r.flickerSparse).filter((v): v is number => v !== null)
  const ff = rs.map((r) => r.flickerFull).filter((v): v is number => v !== null)
  lines.push(
    `| ${k} | ${rs.length} | ${med(sky).toFixed(0)} (${Math.min(...sky).toFixed(0)}–${Math.max(...sky).toFixed(0)}) | ${med(rs.map((r) => r.ground)).toFixed(0)} | ${rs.filter((r) => r.dark).length} of ${rs.length} | ${fl.length ? `${pct(med(fl))}, ${pct(Math.max(...fl))}` : '–'} | ${ff.length ? pct(med(ff)) : '–'} | ${rs.filter((r) => r.flickeringSparse).length} of ${rs.length} |`,
  )
}
lines.push('')
const falseDark = rows.filter((r) => r.preset !== 'night' && r.dark)
const missedDark = rows.filter((r) => r.preset === 'night' && !r.dark)
const falseFlicker = rows.filter((r) => !r.flickerHz && r.flickeringSparse)
const missedFlicker = rows.filter((r) => r.flickerHz && !r.flickeringSparse)
lines.push(`Night renders called dark: ${rows.filter((r) => r.preset === 'night').length - missedDark.length} of ${rows.filter((r) => r.preset === 'night').length}; daylight, overcast and dusk renders called dark: ${falseDark.length} of ${rows.filter((r) => r.preset !== 'night').length}${falseDark.length ? ` (${falseDark.map((r) => r.clip).join(', ')})` : ''}.`)
lines.push(`Flickering renders detected on the sparse pass: ${rows.filter((r) => r.flickerHz).length - missedFlicker.length} of ${rows.filter((r) => r.flickerHz).length}; false alarms on renders without flicker: ${falseFlicker.length} of ${rows.filter((r) => !r.flickerHz).length}${falseFlicker.length ? ` (${falseFlicker.map((r) => r.clip).join(', ')})` : ''}.`)
lines.push('')
lines.push('Limits: one synthetic night preset (floodlights, 240 fps, ±30% flicker at 100 Hz) and no flicker-free night render, no LED lights, no indoor hall; the renders have no auto-exposure hunting or rolling-shutter banding. The thresholds are initial values. Pixel evidence only lowers the class the player gave (day → night-lights or flicker), never raises it.')
lines.push('')
lines.push('## Per clip')
lines.push('')
lines.push('| Clip | Lighting | fps | Sky | Court | Dark | Flicker (sparse) | Flicker (every frame) |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of rows) lines.push(`| ${r.clip} | ${r.preset}${r.flickerHz ? ` + ${r.flickerHz} Hz` : ''} | ${r.fps} | ${r.sky.toFixed(0)} | ${r.ground.toFixed(0)} | ${r.dark ? 'yes' : 'no'} | ${pct(r.flickerSparse)} | ${pct(r.flickerFull)} |`)
writeFileSync(join(outDir, 'SUMMARY.md'), lines.join('\n') + '\n')
writeFileSync(join(outDir, 'rows.json'), JSON.stringify(rows, null, 1))
console.log(`light-eval: ${rows.length} clips → ${join(outDir, 'SUMMARY.md')}`)
