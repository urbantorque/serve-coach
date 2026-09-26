// In-browser checks for the decode layer, driven by run-browser-tests.mjs.
// Each clip carries its frame number as a barcode, so every decoded frame can be
// checked against ground truth, not just counted.
import type { ImageDataLike } from '../../types.ts'
import { decodeAudioFileData, decodeAudioTrack, detectOnsets, hasAudioDecoder } from '../audio.ts'
import { blobSource } from '../byteSource.ts'
import { openFrameSource } from '../frameSource.ts'
import type { DecodeStats, FrameSelection, FrameSource } from '../frameTypes.ts'
import { probeVideo } from '../probe.ts'
import { codedToDisplay, type RotationDeg } from '../rotation.ts'

export interface Truth {
  AUDIO_TRUTH: { sampleRate: number; contacts: number[]; bounces: number[] }
  BARCODE: { blocks: number; heightFraction: number; bits: number }
}

export interface TestResult {
  name: string
  pass: boolean
  details: Record<string, unknown>
}

declare global {
  interface Window {
    runVideoDecodeTests?: (truth: Truth, only?: string[]) => Promise<TestResult[]>
  }
}

async function clip(name: string): Promise<File> {
  // Relative to the page (browser-test.html sits next to clips/). Vite rewrites
  // `new URL(..., import.meta.url)`, so that form is avoided here.
  const response = await fetch(new URL(`clips/${name}`, document.baseURI))
  if (!response.ok) throw new Error(`fetch ${name}: ${response.status}`)
  return new File([await response.blob()], name, { type: name.endsWith('.webm') ? 'video/webm' : 'video/mp4' })
}

/** Reads the 16-bit frame number from the coded-frame top strip (18 blocks). */
function readBarcode(image: ImageDataLike, rotationDeg: RotationDeg, blocks: number, bits: number): number | null {
  const lum = (xNorm: number, yNorm: number) => {
    const p = codedToDisplay(xNorm, yNorm, rotationDeg)
    const cx = Math.min(image.width - 1, Math.max(0, Math.floor(p.x * image.width)))
    const cy = Math.min(image.height - 1, Math.max(0, Math.floor(p.y * image.height)))
    let sum = 0
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.min(image.width - 1, Math.max(0, cx + dx))
        const y = Math.min(image.height - 1, Math.max(0, cy + dy))
        const i = (y * image.width + x) * 4
        sum += 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]
        n++
      }
    }
    return sum / n
  }
  const y = 0.04 // inside the bar (bar height is ~12% of the coded height)
  const center = (k: number) => (k + 0.5) / blocks
  const white = lum(center(0), y)
  const black = lum(center(1), y)
  if (white - black < 80) return null
  const threshold = (white + black) / 2
  let value = 0
  for (let b = 0; b < bits; b++) if (lum(center(b + 2), y) > threshold) value |= 1 << b
  return value
}

interface FrameCheck {
  count: number
  indices: number[]
  outOfOrder: number
  duplicates: number
  barcodeMismatches: { index: number; barcode: number | null }[]
  maxTimeErrorS: number
  statsList: DecodeStats[]
}

async function checkFrames(
  source: FrameSource,
  truth: Truth,
  selection: FrameSelection,
  expectBarcode: (index: number) => number,
  opts: { maxLongSidePx?: number } = {},
): Promise<FrameCheck> {
  const statsList: DecodeStats[] = []
  const seen = new Set<number>()
  const check: FrameCheck = { count: 0, indices: [], outOfOrder: 0, duplicates: 0, barcodeMismatches: [], maxTimeErrorS: 0, statsList }
  let last = -1
  for await (const frame of source.frames(selection, { ...opts, onStats: (s) => statsList.push(s) })) {
    check.count++
    check.indices.push(frame.index)
    if (frame.index <= last) check.outOfOrder++
    if (seen.has(frame.index)) check.duplicates++
    seen.add(frame.index)
    last = frame.index
    const expectedT = source.frameTimes[frame.index].tMedia
    check.maxTimeErrorS = Math.max(check.maxTimeErrorS, Math.abs(frame.tMedia - expectedT))
    const barcode = readBarcode(frame.image, source.meta.rotationDeg, truth.BARCODE.blocks, truth.BARCODE.bits)
    if (barcode !== expectBarcode(frame.index)) check.barcodeMismatches.push({ index: frame.index, barcode })
  }
  return check
}

function summary(check: FrameCheck) {
  return {
    count: check.count,
    firstIndex: check.indices[0],
    lastIndex: check.indices[check.indices.length - 1],
    outOfOrder: check.outOfOrder,
    duplicates: check.duplicates,
    barcodeMismatches: check.barcodeMismatches.length,
    firstMismatches: check.barcodeMismatches.slice(0, 5),
    maxTimeErrorS: check.maxTimeErrorS,
    missing: check.statsList.flatMap((s) => s.missingIndices).length,
    notes: check.statsList.flatMap((s) => s.notes),
    elapsedMs: Math.round(check.statsList.reduce((sum, s) => sum + s.elapsedMs, 0)),
  }
}

const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step)
const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])
const clean = (c: FrameCheck) => c.outOfOrder === 0 && c.duplicates === 0 && c.barcodeMismatches.length === 0

type TestFn = (truth: Truth) => Promise<{ pass: boolean; details: Record<string, unknown> }>

const tests: Record<string, TestFn> = {
  async 'webcodecs: every frame of a 60 fps H.264 clip with B-frames, once, in order'(truth) {
    const source = await openFrameSource(await clip('cfr60.mp4'))
    const check = await checkFrames(source, truth, {}, (i) => i)
    source.close()
    const pass = source.path === 'webcodecs' && check.count === 120 && sameList(check.indices, range(0, 119)) && clean(check) && check.maxTimeErrorS < 1e-9
    return { pass, details: { path: source.path, reason: source.pathReason, ...summary(check) } }
  },

  async 'webcodecs: index range, real-time range and step'(truth) {
    const source = await openFrameSource(await clip('cfr60.mp4'))
    const a = await checkFrames(source, truth, { startIndex: 37, endIndex: 52 }, (i) => i)
    const b = await checkFrames(source, truth, { startReal: 1.0, endReal: 1.1 }, (i) => i)
    const c = await checkFrames(source, truth, { startIndex: 3, endIndex: 110, step: 7 }, (i) => i)
    const d = await checkFrames(source, truth, { indices: [119, 0, 59, 60] }, (i) => i)
    source.close()
    const pass =
      sameList(a.indices, range(37, 52)) && sameList(b.indices, range(60, 66)) && sameList(c.indices, range(3, 110, 7)) &&
      sameList(d.indices, [0, 59, 60, 119]) && [a, b, c, d].every(clean)
    return {
      pass,
      details: {
        indexRange: summary(a),
        realRange: summary(b),
        step: summary(c),
        explicit: summary(d),
        samplesFedForRange: a.statsList[0]?.samplesFed,
      },
    }
  },

  async 'webcodecs: rotation 90 applied to RGBA and bitmaps, pending on raw frames'(truth) {
    const source = await openFrameSource(await clip('rot90.mp4'))
    const check = await checkFrames(source, truth, {}, (i) => i)
    let rawPending: number | undefined
    let rawSize = ''
    for await (const raw of source.rawFrames({ indices: [5] })) {
      rawPending = raw.pendingRotationDeg
      rawSize = `${raw.width}x${raw.height}`
      raw.close()
    }
    let bitmapSize = ''
    for await (const b of source.bitmaps({ indices: [5] }, { maxLongSidePx: 160 })) {
      bitmapSize = `${b.bitmap.width}x${b.bitmap.height}`
      b.bitmap.close()
    }
    const meta = source.meta
    source.close()
    const pass =
      meta.width === 180 && meta.height === 320 && meta.rotationDeg === 90 && check.count === 120 && clean(check) &&
      rawPending === 90 && rawSize === '320x180' && bitmapSize === '90x160'
    return { pass, details: { display: `${meta.width}x${meta.height}`, rawPending, rawSize, bitmapSize, ...summary(check) } }
  },

  async 'webcodecs: stream-copy trim (edit list pre-roll hidden)'(truth) {
    const source = await openFrameSource(await clip('trimmed.mp4'))
    const check = await checkFrames(source, truth, {}, (i) => i + 18)
    source.close()
    const pass = check.count === 102 && clean(check)
    return { pass, details: summary(check) }
  },

  async 'webcodecs: VFR, 240 fps and fragmented clips'(truth) {
    const out: Record<string, unknown> = {}
    let pass = true
    for (const [name, frames] of [['vfr.mp4', 60], ['hfr240.mov', 120], ['fragmented.mp4', 120]] as const) {
      const source = await openFrameSource(await clip(name))
      const check = await checkFrames(source, truth, {}, (i) => i)
      out[name] = { path: source.path, nominalFps: source.meta.nominalFps, captureFps: source.meta.captureFps, vfr: source.meta.isVariableFrameRate, ...summary(check) }
      pass &&= source.path === 'webcodecs' && check.count === frames && clean(check)
      source.close()
    }
    return { pass, details: out }
  },

  async 'abort and early break release the decoder'(truth) {
    const source = await openFrameSource(await clip('cfr60.mp4'))
    const controller = new AbortController()
    let got = 0
    let abortName = ''
    try {
      for await (const frame of source.rawFrames({}, { signal: controller.signal })) {
        frame.close()
        if (++got === 5) controller.abort()
      }
    } catch (error) {
      abortName = (error as Error).name
    }
    let early = 0
    for await (const frame of source.rawFrames()) {
      frame.close()
      if (++early === 3) break
    }
    const after = await checkFrames(source, truth, { startIndex: 100, endIndex: 105 }, (i) => i)
    source.close()
    const pass = abortName === 'AbortError' && got >= 5 && got < 120 && early === 3 && after.count === 6 && clean(after)
    return { pass, details: { framesBeforeAbort: got, abortName, early, after: summary(after) } }
  },

  async 'hevc (hvc1): path chosen and decode result'(truth) {
    try {
      const source = await openFrameSource(await clip('hevc.mp4'))
      const check = await checkFrames(source, truth, {}, (i) => i)
      source.close()
      return { pass: true, details: { informational: true, path: source.path, reason: source.pathReason, ...summary(check) } }
    } catch (error) {
      return { pass: true, details: { informational: true, error: String(error) } }
    }
  },

  async 'media-element fallback on MP4 (probe timeline)'(truth) {
    const source = await openFrameSource(await clip('cfr60.mp4'), { prefer: 'media-element' })
    const check = await checkFrames(source, truth, {}, (i) => i)
    const rotated = await openFrameSource(await clip('rot90.mp4'), { prefer: 'media-element' })
    const rotCheck = await checkFrames(rotated, truth, { startIndex: 0, endIndex: 9 }, (i) => i)
    source.close()
    rotated.close()
    const pass =
      source.path === 'media-element' && check.count === 120 && clean(check) && rotCheck.count === 10 && clean(rotCheck)
    return {
      pass,
      details: {
        path: source.path,
        ...summary(check),
        fps: check.count / (check.statsList[0]?.elapsedMs / 1000),
        rotated: { display: `${rotated.meta.width}x${rotated.meta.height}`, ...summary(rotCheck) },
      },
    }
  },

  async 'media-element fallback on VP9 WebM (estimated timeline)'(truth) {
    const source = await openFrameSource(await clip('vp9.webm'))
    const check = await checkFrames(source, truth, {}, (i) => i)
    source.close()
    const pass = source.path === 'media-element' && check.count === 60 && clean(check)
    return {
      pass,
      details: {
        path: source.path,
        reason: source.pathReason,
        estimatedFps: source.meta.nominalFps,
        estimatedFrameCount: source.meta.frameCount,
        ...summary(check),
      },
    }
  },

  async 'audio: onset timing against ground truth (both decode paths)'(truth) {
    const file = await clip('cfr60.mp4')
    const probe = await probeVideo(blobSource(file))
    const results: Record<string, unknown> = {}
    const expected = [
      ...truth.AUDIO_TRUTH.contacts.map((t) => ({ t, kind: 'contact' })),
      ...truth.AUDIO_TRUTH.bounces.map((t) => ({ t, kind: 'bounce' })),
    ].sort((a, b) => a.t - b.t)
    let pass = true
    const evaluate = (label: string, samples: Float32Array, sampleRate: number, startTimeS: number, notes: string[]) => {
      const onsets = detectOnsets(samples, sampleRate, { offsetS: startTimeS })
      const matched = expected.map((e) => {
        const nearest = onsets.reduce((best, o) => (Math.abs(o.tMedia - e.t) < Math.abs(best.tMedia - e.t) ? o : best), onsets[0])
        return {
          truthS: e.t,
          errorMs: nearest ? +((nearest.tMedia - e.t) * 1000).toFixed(3) : null,
          expectedKind: e.kind,
          kind: nearest?.kind,
          sharpness: nearest ? +nearest.sharpness.toFixed(3) : null,
          hfRatio: nearest ? +nearest.hfRatio.toFixed(3) : null,
        }
      })
      results[label] = { onsetCount: onsets.length, matched, notes }
      return matched
    }
    if (hasAudioDecoder() && probe.audio) {
      const decoded = await decodeAudioTrack(probe.audio, blobSource(file))
      const m = evaluate('webcodecs', decoded.samples, decoded.sampleRate, decoded.startTimeS, decoded.notes)
      pass &&= m.every((x) => x.errorMs !== null && Math.abs(x.errorMs) < 2 && x.kind === x.expectedKind)
    } else {
      results.webcodecs = 'AudioDecoder unavailable'
    }
    const viaWebAudio = await decodeAudioFileData(await file.arrayBuffer())
    evaluate('decodeAudioData', viaWebAudio.samples, viaWebAudio.sampleRate, viaWebAudio.startTimeS, viaWebAudio.notes)
    results.primingMs = (probe.audio?.primingS ?? 0) * 1000
    return { pass, details: results }
  },
}

async function throughput(name: string, truth: Truth): Promise<TestResult> {
  const file = await clip(name)
  const source = await openFrameSource(file)
  const n = source.meta.frameCount
  const timed = async (fn: () => Promise<number>) => {
    const t0 = performance.now()
    const frames = await fn()
    const ms = performance.now() - t0
    return { frames, ms: Math.round(ms), fps: +((frames * 1000) / ms).toFixed(1) }
  }
  const raw = await timed(async () => {
    let c = 0
    for await (const f of source.rawFrames()) {
      f.close()
      c++
    }
    return c
  })
  let mismatches = 0
  const rgba640 = await timed(async () => {
    let c = 0
    for await (const f of source.frames({}, { maxLongSidePx: 640 })) {
      if (readBarcode(f.image, 0, truth.BARCODE.blocks, truth.BARCODE.bits) !== f.index) mismatches++
      c++
    }
    return c
  })
  const rgba640CpuCanvas = await timed(async () => {
    let c = 0
    for await (const f of source.frames({}, { maxLongSidePx: 640, willReadFrequently: true })) {
      void f
      c++
    }
    return c
  })
  const rgba640GpuCanvas = await timed(async () => {
    let c = 0
    for await (const f of source.frames({}, { maxLongSidePx: 640, willReadFrequently: false })) {
      void f
      c++
    }
    return c
  })
  const rgbaFull = await timed(async () => {
    let c = 0
    for await (const f of source.frames({ startIndex: 0, endIndex: 119 })) {
      void f
      c++
    }
    return c
  })
  const bitmap256 = await timed(async () => {
    let c = 0
    for await (const b of source.bitmaps({}, { maxLongSidePx: 256 })) {
      b.bitmap.close()
      c++
    }
    return c
  })
  const path = source.path
  const meta = source.meta
  source.close()
  const fallback = await openFrameSource(file, { prefer: 'media-element' })
  const seek = await timed(async () => {
    let c = 0
    for await (const f of fallback.rawFrames({ startIndex: 0, endIndex: 59 })) {
      f.close()
      c++
    }
    return c
  })
  fallback.close()
  const pass = raw.frames === n && rgba640.frames === n && mismatches === 0
  return {
    name: `throughput ${name} (${meta.width}x${meta.height} @ ${meta.nominalFps.toFixed(0)} fps, ${n} frames)`,
    pass,
    details: {
      path,
      rawVideoFrame: raw,
      rgbaAt640: { ...rgba640, barcodeMismatches: mismatches },
      rgbaAt640CpuCanvas: rgba640CpuCanvas,
      rgbaAt640GpuCanvas: rgba640GpuCanvas,
      rgbaFullRes120Frames: rgbaFull,
      bitmapAt256: bitmap256,
      mediaElementSeek60Frames: seek,
    },
  }
}

window.runVideoDecodeTests = async (truth: Truth, only?: string[]) => {
  const results: TestResult[] = []
  const log = document.getElementById('log')
  for (const [name, fn] of Object.entries(tests)) {
    if (only && !only.some((o) => name.includes(o))) continue
    try {
      const { pass, details } = await fn(truth)
      results.push({ name, pass, details })
    } catch (error) {
      results.push({ name, pass: false, details: { error: String(error), stack: (error as Error).stack } })
    }
    if (log) log.textContent += `${results[results.length - 1].pass ? 'PASS' : 'FAIL'} ${name}\n`
  }
  if (!only || only.includes('throughput')) {
    for (const name of ['perf720.mp4', 'perf1080.mp4']) {
      try {
        results.push(await throughput(name, truth))
      } catch (error) {
        results.push({ name: `throughput ${name}`, pass: false, details: { error: String(error) } })
      }
    }
  }
  return results
}
