// Test clip generator (Node only). Uses ffmpeg-static to synthesise tiny clips with
// known ground truth: every frame carries its frame number as a 16-bit barcode, and the
// audio has transients at known times. Plain .mjs so the app TypeScript program does
// not need @types/node; types for importers are in fixtures.d.mts.
//
// Usage: node src/analysis/video/__fixtures__/fixtures.mjs [--perf] [--force]

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
export const CLIP_DIR = join(here, 'clips')

/** Barcode layout shared with the browser test: 18 blocks across the top of the coded frame. */
export const BARCODE = { blocks: 18, heightFraction: 0.125, bits: 16 }

/** Audio ground truth for clips with audio (seconds, container media time). */
export const AUDIO_TRUTH = {
  sampleRate: 48000,
  contacts: [0.5, 1.0],
  bounces: [1.5],
}

function ffmpegPath() {
  const require = createRequire(import.meta.url)
  return require('ffmpeg-static')
}

function run(args) {
  const res = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (res.status !== 0) throw new Error(`ffmpeg failed (${res.status}): ${res.stderr}\nargs: ${args.join(' ')}`)
  return res.stderr
}

/** Frame number as LSB-first bits in blocks 2..17; block 0 is white, block 1 black (threshold refs). */
function barcodeSource(fps, durationS, width, height) {
  const barH = Math.max(8, Math.round(height * BARCODE.heightFraction / 2) * 2)
  const lum = "if(eq(X\\,0)\\,255\\,if(eq(X\\,1)\\,0\\,255*mod(floor(N/pow(2\\,X-2))\\,2)))"
  return {
    barH,
    graph:
      `nullsrc=s=${BARCODE.blocks}x1:r=${fps}:d=${durationS},format=gray,geq=lum=${lum},` +
      `scale=${width}:${barH}:flags=neighbor,format=yuv420p`,
  }
}

/** Broadband decaying noise bursts (racket-like) plus low sine thumps (bounce-like). */
function audioExpr() {
  const burst = (t0) => `gte(t,${t0})*exp(-max(t-${t0},0)*1000)*(2*random(0)-1)*0.9`
  const thump = (t0) => `gte(t,${t0})*exp(-max(t-${t0},0)*40)*sin(2*PI*180*(t-${t0}))*0.6`
  const parts = [
    ...AUDIO_TRUTH.contacts.map(burst),
    ...AUDIO_TRUTH.bounces.map(thump),
    '0.004*(2*random(1)-1)',
  ]
  return parts.join('+')
}

function videoGraph(fps, durationS, width, height) {
  const bar = barcodeSource(fps, durationS, width, height)
  return (
    `testsrc2=s=${width}x${height}:r=${fps}:d=${durationS}[bg];` +
    `${bar.graph}[bar];[bg][bar]overlay=0:0:shortest=1,format=yuv420p[v]`
  )
}

function h264Args({ gop, bframes = 3, preset = 'veryfast', crf = 20 }) {
  return [
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
    '-bf', String(bframes),
  ]
}

function makeBarcodeClip(out, { fps, durationS, width, height, gop, audio = false, extra = [] }) {
  const args = ['-f', 'lavfi', '-i', videoGraph(fps, durationS, width, height).replace(/\[v\]$/, '')]
  if (audio) {
    args.push('-f', 'lavfi', '-i', `aevalsrc=exprs='${audioExpr()}':s=${AUDIO_TRUTH.sampleRate}:d=${durationS}`)
  }
  args.push(...h264Args({ gop }))
  if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '1')
  args.push(...extra, out)
  run(args)
}

/** Definitions of all clips. Each builder writes to `out`. Order matters for derived clips. */
const CLIPS = {
  'cfr60.mp4': (out) =>
    makeBarcodeClip(out, { fps: 60, durationS: 2, width: 320, height: 180, gop: 30, audio: true }),
  'rot90.mp4': (out) =>
    // -display_rotation is counter-clockwise; -90 means "rotate 90 deg clockwise to display" (iPhone portrait).
    run(['-display_rotation', '-90', '-i', join(CLIP_DIR, 'cfr60.mp4'), '-c', 'copy', '-an', out]),
  'trimmed.mp4': (out) =>
    // Stream copy from a non-keyframe start: ffmpeg writes an edit list whose media_time skips pre-roll.
    run(['-ss', '0.3', '-i', join(CLIP_DIR, 'cfr60.mp4'), '-c', 'copy', '-an', out]),
  'fragmented.mp4': (out) =>
    run(['-i', join(CLIP_DIR, 'cfr60.mp4'), '-c', 'copy', '-an', '-movflags', 'frag_keyframe+empty_moov', out]),
  'vfr.mp4': (out) => {
    // 30 frames at 60 fps, then 30 frames at 30 fps (a frame-rate step, like a VFR phone clip).
    const bar = barcodeSource(60, 1, 320, 180)
    const graph =
      `testsrc2=s=320x180:r=60:d=1[bg];${bar.graph}[bar];[bg][bar]overlay=0:0:shortest=1,` +
      "setpts='if(lt(N,30),N/60,0.5+(N-30)/30)/TB',format=yuv420p"
    run(['-f', 'lavfi', '-i', graph, ...h264Args({ gop: 30, bframes: 0 }), '-fps_mode', 'passthrough',
      '-video_track_timescale', '600', out])
  },
  'hfr240.mov': (out) =>
    makeBarcodeClip(out, {
      fps: 240, durationS: 0.5, width: 320, height: 180, gop: 60,
      extra: ['-movflags', 'use_metadata_tags',
        '-metadata', 'com.apple.quicktime.full-frame-rate-playback-intent=0',
        '-metadata', 'com.apple.quicktime.make=Apple', '-metadata', 'com.apple.quicktime.model=iPhone 15'],
    }),
  'android240.mp4': (out) =>
    makeBarcodeClip(out, {
      fps: 30, durationS: 1, width: 320, height: 180, gop: 30,
      extra: ['-movflags', 'use_metadata_tags', '-metadata', 'com.android.capture.fps=240.000000'],
    }),
  'vp9.webm': (out) => {
    const graph = videoGraph(60, 1, 320, 180).replace(/\[v\]$/, '')
    run(['-f', 'lavfi', '-i', graph, '-c:v', 'libvpx-vp9', '-b:v', '600k', '-g', '30',
      '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p', out])
  },
  'hevc.mp4': (out) => {
    const graph = videoGraph(60, 1, 320, 180).replace(/\[v\]$/, '')
    run(['-f', 'lavfi', '-i', graph, '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error:keyint=30',
      '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p', out])
  },
}

/** Larger clips for decode throughput. Not needed by unit tests. */
const PERF_CLIPS = {
  'perf720.mp4': (out) =>
    makeBarcodeClip(out, { fps: 60, durationS: 5, width: 1280, height: 720, gop: 60 }),
  'perf1080.mp4': (out) =>
    makeBarcodeClip(out, { fps: 60, durationS: 5, width: 1920, height: 1080, gop: 60 }),
}

function build(defs, force) {
  mkdirSync(CLIP_DIR, { recursive: true })
  const built = []
  for (const [name, make] of Object.entries(defs)) {
    const out = join(CLIP_DIR, name)
    if (!force && existsSync(out) && statSync(out).size > 0) continue
    // Write under a per-process name, then rename: parallel test workers may build the same
    // clip, and a reader must never see a half-written file. The extension stays last so
    // ffmpeg picks the right muxer.
    const ext = extname(name)
    const tmp = join(CLIP_DIR, `${basename(name, ext)}.${process.pid}.tmp${ext}`)
    try {
      make(tmp)
      renameSync(tmp, out)
    } catch (error) {
      rmSync(tmp, { force: true })
      if (!(existsSync(out) && statSync(out).size > 0)) throw error // another worker won the race otherwise
    }
    built.push(name)
  }
  return built
}

/** Generates any missing small clips; returns the names it had to build. */
export function ensureFixtures({ force = false, perf = false } = {}) {
  const built = build(CLIPS, force)
  if (perf) built.push(...build(PERF_CLIPS, force))
  return built
}

export function fixturePath(name) {
  return join(CLIP_DIR, name)
}

export function readFixture(name) {
  const buf = readFileSync(fixturePath(name))
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  const force = process.argv.includes('--force')
  const perf = process.argv.includes('--perf')
  const built = ensureFixtures({ force, perf })
  console.log(built.length ? `built: ${built.join(', ')}` : 'all fixtures present')
}
