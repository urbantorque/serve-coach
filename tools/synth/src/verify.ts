/**
 * Integrity check of the corpus on disk: every clip in the manifest has a readable truth.json
 * (parsed by the app's parseTruthPoseFrames), and each video's frame count, frame rate, size and
 * audio stream match the truth.
 *
 *   npx tsx tools/synth/src/verify.ts [--out DIR]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTruthPoseFrames } from '../../../app/src/analysis/pose/injected.ts'
import { ffmpegBinary } from './encode.ts'
import { loadManifest } from './manifest.ts'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const outIdx = process.argv.indexOf('--out')
const out = outIdx >= 0 ? resolve(process.argv[outIdx + 1]) : join(REPO, 'validation', 'synthetic')

interface Probe {
  frames: number
  fps: number
  width: number
  height: number
  audio: boolean
}

/** Stream-copy the video packets to framecrc (one line per frame) and read the stream headers. */
function probe(file: string): Probe {
  const r = spawnSync(ffmpegBinary(), ['-hide_banner', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'framecrc', '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const log = r.stderr
  const packets = r.stdout.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#')).length
  const v = /Stream #0:\d+.*Video: .*?, (\d+)x(\d+)[^\n]*?, ([\d.]+) fps/.exec(log)
  return {
    frames: r.status === 0 ? packets : -1,
    width: v ? Number(v[1]) : -1,
    height: v ? Number(v[2]) : -1,
    fps: v ? Number(v[3]) : -1,
    audio: /Stream #0:\d+.*Audio:/.test(log),
  }
}

const m = loadManifest(out)
let bad = 0
for (const c of m.clips) {
  const problems: string[] = []
  const truth = JSON.parse(readFileSync(join(out, c.files.truth), 'utf8')) as { video: { width: number; height: number; fps: number; frameCount: number } }
  try {
    const frames = parseTruthPoseFrames(truth)
    if (frames.length !== truth.video.frameCount) problems.push(`parser returned ${frames.length} frames`)
  } catch (e) {
    problems.push(`parseTruthPoseFrames: ${e instanceof Error ? e.message : String(e)}`)
  }
  for (const f of [c.files.mp4, c.files.webm].filter((x): x is string => !!x)) {
    const p = probe(join(out, f))
    if (p.frames !== truth.video.frameCount) problems.push(`${f}: ${p.frames} frames, truth ${truth.video.frameCount}`)
    if (Math.abs(p.fps - truth.video.fps) > 0.01) problems.push(`${f}: ${p.fps} fps, truth ${truth.video.fps}`)
    if (p.width !== truth.video.width || p.height !== truth.video.height) problems.push(`${f}: ${p.width}x${p.height}`)
    if (!p.audio) problems.push(`${f}: no audio stream`)
  }
  if (problems.length) {
    bad++
    console.log(`FAIL ${c.id}: ${problems.join('; ')}`)
  }
}
console.log(`${m.clips.length - bad}/${m.clips.length} clips verified (frame count, fps, size, audio, truth parse)`)
if (bad) process.exitCode = 1
