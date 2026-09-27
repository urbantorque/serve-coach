/**
 * Integrity check of the corpus on disk, straight from manifest.json (no filtering):
 * - every file the manifest lists exists and has the recorded byte size; truth-extra.json exists;
 * - truth.json parses with the app's parseTruthPoseFrames, names the right clip, and agrees with
 *   the manifest (size, fps, frame count);
 * - each MP4 / WebM, read two independent ways, has the truth's frame count, frame rate, size and
 *   an audio stream: (1) ffmpeg stream copy to framecrc (one line per packet: an ffprobe
 *   -count_packets equivalent), (2) for MP4, the app's own container probe (probeVideo, mp4box);
 * - scenario coverage: every clip defined in src/scenarios.ts is present, per group; clip folders
 *   and manifest entries that no scenario defines are listed.
 *
 *   npx tsx tools/synth/src/verify.ts [--out DIR] [--no-app-probe] [--json FILE]
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTruthPoseFrames } from '../../../app/src/analysis/pose/injected.ts'
import { ffmpegBinary } from './encode.ts'
import type { ClipRecord } from './generate.ts'
import { allJobs, GROUPS } from './scenarios.ts'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const argv = process.argv.slice(2)
const argOf = (k: string) => {
  const i = argv.indexOf(k)
  return i >= 0 ? argv[i + 1] : undefined
}
const out = argOf('--out') ? resolve(argOf('--out')!) : join(REPO, 'validation', 'synthetic')
const useAppProbe = !argv.includes('--no-app-probe')
const jsonOut = argOf('--json')

interface Probe {
  frames: number
  fps: number
  width: number
  height: number
  audio: boolean
}

/** Stream-copy the video packets to framecrc (one line per frame) and read the stream headers. */
function ffmpegProbe(file: string): Probe {
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

type AppProbe = (bytes: Uint8Array<ArrayBuffer>, name: string) => Promise<Probe>
async function loadAppProbe(): Promise<AppProbe | null> {
  try {
    const { probeVideo } = await import('../../../app/src/analysis/video/probe.ts')
    return async (bytes, name) => {
      const p = await probeVideo(bytes, { fileName: name })
      return { frames: p.frames.length, fps: p.meta.nominalFps, width: p.meta.width, height: p.meta.height, audio: p.meta.hasAudio }
    }
  } catch (e) {
    console.log(`app probe unavailable (${e instanceof Error ? e.message : String(e)}); using ffmpeg only`)
    return null
  }
}

interface ClipResult {
  id: string
  problems: string[]
  frames: number
  ffmpegFrames: number | null
  appProbeFrames: number | null
}

async function main(): Promise<void> {
  const manifestPath = join(out, 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { clips: ClipRecord[] }
  const appProbe = useAppProbe ? await loadAppProbe() : null
  const results: ClipResult[] = []

  for (const c of manifest.clips) {
    const problems: string[] = []
    const res: ClipResult = { id: c.id, problems, frames: c.video.frameCount, ffmpegFrames: null, appProbeFrames: null }
    results.push(res)
    // Files and sizes.
    const listed: [string, string | undefined, number | undefined][] = [
      ['mp4', c.files.mp4, c.bytes.mp4],
      ['webm', c.files.webm, c.bytes.webm],
      ['truth', c.files.truth, c.bytes.truth],
    ]
    for (const [kind, rel, bytes] of listed) {
      if (!rel) continue
      const p = join(out, rel)
      if (!existsSync(p)) {
        problems.push(`${kind} missing: ${rel}`)
        continue
      }
      const size = statSync(p).size
      if (bytes !== undefined && size !== bytes) problems.push(`${kind} is ${size} bytes, manifest says ${bytes}`)
    }
    if (!existsSync(join(out, dirname(c.files.truth), 'truth-extra.json'))) problems.push('truth-extra.json missing (run src/augmentTruth.ts)')
    const truthPath = join(out, c.files.truth)
    if (!existsSync(truthPath)) continue
    // Truth.
    const truth = JSON.parse(readFileSync(truthPath, 'utf8')) as { clipId: string; video: { width: number; height: number; fps: number; frameCount: number }; frames: unknown[] }
    if (truth.clipId !== c.id) problems.push(`truth.clipId is ${truth.clipId}`)
    for (const k of ['width', 'height', 'fps', 'frameCount'] as const) if (truth.video[k] !== c.video[k]) problems.push(`truth.video.${k} ${truth.video[k]} != manifest ${c.video[k]}`)
    if (truth.frames.length !== truth.video.frameCount) problems.push(`truth has ${truth.frames.length} frames, video.frameCount ${truth.video.frameCount}`)
    try {
      const frames = parseTruthPoseFrames(truth)
      if (frames.length !== truth.video.frameCount) problems.push(`parseTruthPoseFrames returned ${frames.length} frames`)
    } catch (e) {
      problems.push(`parseTruthPoseFrames: ${e instanceof Error ? e.message : String(e)}`)
    }
    // Videos.
    for (const rel of [c.files.mp4, c.files.webm].filter((x): x is string => !!x)) {
      const p = join(out, rel)
      if (!existsSync(p)) continue
      const checks: [string, Probe][] = [['ffmpeg', ffmpegProbe(p)]]
      if (appProbe && rel.endsWith('.mp4')) {
        try {
          const buf = readFileSync(p)
          checks.push(['app probe', await appProbe(new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), rel)])
        } catch (e) {
          problems.push(`${rel}: app probe failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      for (const [how, q] of checks) {
        if (rel.endsWith('.mp4')) {
          if (how === 'ffmpeg') res.ffmpegFrames = q.frames
          else res.appProbeFrames = q.frames
        }
        if (q.frames !== truth.video.frameCount) problems.push(`${rel} (${how}): ${q.frames} frames, truth ${truth.video.frameCount}`)
        if (Math.abs(q.fps - truth.video.fps) > 0.01) problems.push(`${rel} (${how}): ${q.fps} fps, truth ${truth.video.fps}`)
        if (q.width !== truth.video.width || q.height !== truth.video.height) problems.push(`${rel} (${how}): ${q.width}x${q.height}`)
        if (!q.audio) problems.push(`${rel} (${how}): no audio stream`)
      }
    }
  }

  // Scenario coverage.
  const defined = allJobs().flatMap((j) => j.outputs.map((o) => ({ id: o.id, tags: o.tags })))
  const inManifest = new Set(manifest.clips.map((c) => c.id))
  const definedIds = new Set(defined.map((d) => d.id))
  const coverage = GROUPS.map((g) => {
    const clips = defined.filter((d) => d.tags.includes(g.id)).map((d) => d.id)
    return { group: g.id, defined: clips.length, present: clips.filter((id) => inManifest.has(id)).length, missing: clips.filter((id) => !inManifest.has(id)) }
  })
  const undefinedInManifest = manifest.clips.map((c) => c.id).filter((id) => !definedIds.has(id))
  const clipDirs = existsSync(join(out, 'clips')) ? readdirSync(join(out, 'clips')) : []
  const orphanDirs = clipDirs.filter((d) => !inManifest.has(d))

  const bad = results.filter((x) => x.problems.length)
  for (const x of bad) console.log(`FAIL ${x.id}: ${x.problems.join('; ')}`)
  console.log('\nScenario coverage (src/scenarios.ts vs manifest.json):')
  for (const g of coverage) console.log(`  ${g.group.padEnd(18)} ${g.present}/${g.defined}${g.missing.length ? `  missing: ${g.missing.join(' ')}` : ''}`)
  const missingAll = defined.filter((d) => !inManifest.has(d.id)).map((d) => d.id)
  console.log(`  total: ${defined.length - missingAll.length}/${defined.length} defined clips present${missingAll.length ? `; missing ${missingAll.join(' ')}` : ''}`)
  if (undefinedInManifest.length) console.log(`  in the manifest but not defined by any scenario: ${undefinedInManifest.join(' ')}`)
  if (orphanDirs.length) console.log(`  clip folders not in the manifest: ${orphanDirs.join(' ')}`)
  const totalFrames = results.reduce((s, x) => s + x.frames, 0)
  console.log(`\n${results.length - bad.length}/${results.length} clips verified (files and sizes, truth parse, frame count / fps / size / audio by ffmpeg framecrc${appProbe ? ' and the app probe' : ''}); ${totalFrames} frames in total`)
  if (jsonOut) writeFileSync(resolve(jsonOut), JSON.stringify({ verifiedAt: new Date().toISOString(), out, appProbe: !!appProbe, results, coverage, undefinedInManifest, orphanDirs }, null, 1))
  if (bad.length || missingAll.length || orphanDirs.length) process.exitCode = 1
}

await main()
