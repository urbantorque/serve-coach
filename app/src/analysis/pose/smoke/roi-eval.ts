/**
 * Dev-only page for the ROI evaluation, driven by run-roi-eval.mjs (not in the production
 * build). It decodes a rendered synthetic clip with the app's video layer (WebCodecs,
 * full-resolution ImageBitmaps), runs MediaPipePoseSource with one configuration and
 * scores the output against the clip's truth.json. The runner serves clips under
 * /__roi-eval/<clip>/{clip.mp4,truth.json}. Two truth formats are read: the one written by
 * render-roi-clips.mjs, and tools/synth's corpus format ("serve-synth-truth/1", in
 * validation/synthetic), which is adapted by fromSynthCorpus().
 */
import { LM, type PoseFrame } from '../../types.ts'
import { openFrameSource } from '../../video/index.ts'
import { MediaPipePoseSource, type MediaPipePoseSourceOptions, type MediaPipePoseStats } from '../mediapipeSource.ts'
import { type AccuracySummary, type TruthLandmarks, scorePoseAccuracy } from '../poseAccuracy.ts'
import type { PoseInputFrame } from '../poseSource.ts'

export interface EvalConfig {
  clip: string
  label: string
  source: MediaPipePoseSourceOptions
  maxFrames?: number
  /** Return the output landmarks of these frames (for overlays). */
  dumpFrames?: number[]
}

interface ClipTruth {
  video: { width: number; height: number; fps: number }
  staturePx: number
  handedness: 'right' | 'left'
  times: { motionStartS: number; contactS: number; landingS: number; recoveryEndS: number }
  frames: TruthLandmarks[]
}

type PhaseName = 'setup' | 'swing' | 'contact' | 'finish'
type PhaseSummary = Pick<AccuracySummary, 'frames' | 'detectionRate' | 'onTargetRate' | 'meanErrorBH' | 'pck'>

export interface EvalResult {
  config: EvalConfig
  ok: boolean
  error?: string
  frames: number
  staturePx: number
  initMs: number
  wallMs: number
  wallMsPerFrame: number
  accuracy?: AccuracySummary
  phases?: Record<PhaseName, PhaseSummary>
  stats?: MediaPipePoseStats
  /** Crop side / frame short side: min, median, max over cropped frames. */
  cropSideFraction?: { min: number; median: number; max: number }
  /** Frames on which the crop rectangle changed from the previous frame. */
  cropChanges?: number
  firstPoseFrame?: number | null
  /** Sum of all output coordinates: equal digests mean identical landmark output. */
  digest?: number
  dumped?: Array<{ frameIndex: number; landmarks: PoseFrame['landmarks']; crop: unknown }>
  /**
   * Hitting wrist within contact +/- 0.25 s: error along the true direction of motion
   * (negative = behind the truth, i.e. lag) and across it, in statures.
   */
  wristAlongTrack?: Array<{ dtFromContactS: number; speedBHPerS: number; alongBH: number | null; acrossBH: number | null }>
}

/** The parts of tools/synth's corpus truth.json used here. */
interface SynthCorpusTruth {
  format: string
  video: { width: number; height: number; fps: number }
  settings: {
    intrinsics: { fxPx: number; fyPx: number; cxPx: number; cyPx: number }
    extrinsics: { R: number[]; t: number[] }
  }
  player: { heightM: number; handedness: 'right' | 'left' }
  serves: Array<{ events: Record<string, { tReal: number }>; phases: Array<{ phase: string; endTReal: number }> }>
  frames: Array<TruthLandmarks & { world?: number[][] }>
}

/** Projects a court point (metres) with the clip's pinhole camera (distortion is zero in the corpus). */
function projectPx(truth: SynthCorpusTruth, p: readonly number[]): { u: number; v: number } {
  const { R, t } = truth.settings.extrinsics
  const { fxPx, fyPx, cxPx, cyPx } = truth.settings.intrinsics
  const c = [0, 1, 2].map((row) => R[3 * row] * p[0] + R[3 * row + 1] * p[1] + R[3 * row + 2] * p[2] + t[row])
  return { u: (fxPx * c[0]) / c[2] + cxPx, v: (fyPx * c[1]) / c[2] + cyPx }
}

function fromSynthCorpus(truth: SynthCorpusTruth): ClipTruth {
  // Standing stature in pixels: the player's height projected at the hip midpoint of frame 0.
  const world = truth.frames[0].world!
  const hip = [0, 1].map((k) => (world[LM.LEFT_HIP][k] + world[LM.RIGHT_HIP][k]) / 2)
  const foot = projectPx(truth, [hip[0], hip[1], 0])
  const head = projectPx(truth, [hip[0], hip[1], truth.player.heightM])
  const events = truth.serves[0].events
  const recovery = truth.serves[0].phases.find((p) => p.phase === 'recovery')
  return {
    video: truth.video,
    staturePx: Math.hypot(foot.u - head.u, foot.v - head.v),
    handedness: truth.player.handedness,
    times: {
      motionStartS: events.motionStart.tReal,
      contactS: events.contact.tReal,
      landingS: events.landing.tReal,
      recoveryEndS: recovery?.endTReal ?? events.landing.tReal + 1,
    },
    frames: truth.frames.map((f) => ({ frameIndex: f.frameIndex, tReal: f.tReal, landmarks: f.landmarks })),
  }
}

const clips = new Map<string, Promise<{ blob: Blob; truth: ClipTruth }>>()
const sources = new Map<string, { source: MediaPipePoseSource; initMs: number }>()

function loadClip(clip: string) {
  let entry = clips.get(clip)
  if (!entry) {
    entry = Promise.all([
      fetch(`/__roi-eval/${clip}/clip.mp4`).then((r) => {
        if (!r.ok) throw new Error(`clip ${clip}: HTTP ${r.status}`)
        return r.blob()
      }),
      fetch(`/__roi-eval/${clip}/truth.json`).then((r) => {
        if (!r.ok) throw new Error(`truth ${clip}: HTTP ${r.status}`)
        return r.json() as Promise<ClipTruth | SynthCorpusTruth>
      }),
    ]).then(([blob, truth]) => ({
      blob,
      truth: 'format' in truth && truth.format.startsWith('serve-synth-truth') ? fromSynthCorpus(truth) : (truth as ClipTruth),
    }))
    clips.set(clip, entry)
  }
  return entry
}

async function getSource(options: MediaPipePoseSourceOptions) {
  const key = JSON.stringify(options)
  let entry = sources.get(key)
  if (!entry) {
    const source = new MediaPipePoseSource(options)
    const started = performance.now()
    await source.init()
    entry = { source, initMs: performance.now() - started }
    sources.set(key, entry)
  }
  return entry
}

async function* clipFrames(blob: Blob, maxFrames: number): AsyncGenerator<PoseInputFrame> {
  const frameSource = await openFrameSource(blob, { fileName: 'clip.mp4' })
  let previous: ImageBitmap | null = null
  try {
    for await (const frame of frameSource.bitmaps({ startIndex: 0, endIndex: maxFrames - 1 })) {
      // The pose source has copied (or cropped) the previous bitmap before asking for this one.
      previous?.close()
      previous = frame.bitmap
      yield { frameIndex: frame.index, tReal: frame.tReal, image: frame.bitmap }
    }
  } finally {
    previous?.close()
    frameSource.close()
  }
}

/** Decode-only pass: the per-frame cost the pose layer is added to. */
async function decodeOnly(clip: string, maxFrames = Infinity): Promise<{ frames: number; msPerFrame: number }> {
  const { blob } = await loadClip(clip)
  const started = performance.now()
  let frames = 0
  for await (const frame of clipFrames(blob, Number.isFinite(maxFrames) ? maxFrames : 1e9)) {
    void frame
    frames++
  }
  return { frames, msPerFrame: (performance.now() - started) / Math.max(1, frames) }
}

function phaseOf(t: number, times: ClipTruth['times']): PhaseName {
  if (t < times.motionStartS) return 'setup'
  if (t < times.contactS - 0.1) return 'swing'
  if (t <= times.contactS + 0.1) return 'contact'
  return 'finish'
}

async function run(config: EvalConfig): Promise<EvalResult> {
  const base = { config, ok: false, frames: 0, staturePx: 0, initMs: 0, wallMs: 0, wallMsPerFrame: 0 }
  try {
    const { blob, truth } = await loadClip(config.clip)
    const { source, initMs } = await getSource(config.source)
    source.resetStats()
    const maxFrames = Math.min(config.maxFrames ?? Infinity, truth.frames.length)
    const outputs: PoseFrame[] = []
    const started = performance.now()
    for await (const frame of source.estimate(clipFrames(blob, maxFrames))) outputs.push(frame)
    const wallMs = performance.now() - started

    const truthFrames = truth.frames.slice(0, maxFrames)
    const detected = outputs.filter((f) => f.landmarks !== null) as Array<PoseFrame & { landmarks: NonNullable<PoseFrame['landmarks']> }>
    const scoring = {
      frameWidth: truth.video.width,
      frameHeight: truth.video.height,
      staturePx: truth.staturePx,
      wristWindow: {
        wrist: truth.handedness === 'right' ? LM.RIGHT_WRIST : LM.LEFT_WRIST,
        startS: truth.times.contactS - 0.1,
        endS: truth.times.contactS + 0.1,
      },
    }
    const accuracy = scorePoseAccuracy(detected, truthFrames, scoring)
    const phases = {} as Record<PhaseName, PhaseSummary>
    for (const phase of ['setup', 'swing', 'contact', 'finish'] as const) {
      const s = scorePoseAccuracy(detected, truthFrames.filter((f) => phaseOf(f.tReal, truth.times) === phase), scoring)
      phases[phase] = { frames: s.frames, detectionRate: s.detectionRate, onTargetRate: s.onTargetRate, meanErrorBH: s.meanErrorBH, pck: s.pck }
    }
    const trace = source.roiTrace()
    const fractions = trace
      .filter((e) => e.crop)
      .map((e) => Math.max(e.crop!.width, e.crop!.height) / Math.min(truth.video.width, truth.video.height))
      .sort((a, b) => a - b)
    let cropChanges = 0
    for (let i = 1; i < trace.length; i++) if (JSON.stringify(trace[i].crop) !== JSON.stringify(trace[i - 1].crop)) cropChanges++
    const stats = source.stats()
    return {
      ...base,
      ok: stats.detectErrors.length === 0 && outputs.length === maxFrames,
      error: stats.detectErrors[0],
      frames: outputs.length,
      staturePx: truth.staturePx,
      initMs,
      wallMs,
      wallMsPerFrame: wallMs / Math.max(1, outputs.length),
      accuracy,
      phases,
      stats,
      cropSideFraction: fractions.length ? { min: fractions[0], median: fractions[fractions.length >> 1], max: fractions[fractions.length - 1] } : undefined,
      cropChanges,
      firstPoseFrame: outputs.find((f) => f.landmarks)?.frameIndex ?? null,
      wristAlongTrack: wristAlongTrack(outputs, truth, truthFrames),
      digest: outputs.reduce((sum, f) => sum + (f.landmarks ?? []).reduce((s2, lm) => s2 + lm.x + lm.y, 0), 0),
      dumped: (config.dumpFrames ?? []).map((i) => ({ frameIndex: i, landmarks: outputs[i]?.landmarks ?? null, crop: trace[i]?.crop ?? null })),
    }
  } catch (error) {
    return { ...base, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}

function wristAlongTrack(outputs: readonly PoseFrame[], truth: ClipTruth, truthFrames: readonly TruthLandmarks[]): EvalResult['wristAlongTrack'] {
  const wrist = truth.handedness === 'right' ? LM.RIGHT_WRIST : LM.LEFT_WRIST
  const { width: W, height: H } = truth.video
  const px = (lm: { x: number; y: number }) => ({ x: lm.x * W, y: lm.y * H })
  const rows: NonNullable<EvalResult['wristAlongTrack']> = []
  for (let i = 1; i + 1 < truthFrames.length; i++) {
    const t = truthFrames[i]
    const dt = t.tReal - truth.times.contactS
    if (Math.abs(dt) > 0.25 || !t.landmarks) continue
    const a = px(truthFrames[i - 1].landmarks![wrist])
    const b = px(truthFrames[i + 1].landmarks![wrist])
    const v = { x: b.x - a.x, y: b.y - a.y }
    const norm = Math.hypot(v.x, v.y) || 1
    const speedBHPerS = norm / (truthFrames[i + 1].tReal - truthFrames[i - 1].tReal) / truth.staturePx
    const pred = outputs[i]?.landmarks?.[wrist]
    if (!pred) {
      rows.push({ dtFromContactS: dt, speedBHPerS, alongBH: null, acrossBH: null })
      continue
    }
    const e = { x: px(pred).x - px(t.landmarks[wrist]).x, y: px(pred).y - px(t.landmarks[wrist]).y }
    rows.push({ dtFromContactS: dt, speedBHPerS, alongBH: (e.x * v.x + e.y * v.y) / norm / truth.staturePx, acrossBH: (e.y * v.x - e.x * v.y) / norm / truth.staturePx })
  }
  return rows
}

async function disposeAll(): Promise<void> {
  for (const { source } of sources.values()) await source.dispose()
  sources.clear()
}

declare global {
  interface Window {
    roiEval: { run: typeof run; decodeOnly: typeof decodeOnly; disposeAll: typeof disposeAll; ready: boolean }
  }
}

window.roiEval = { run, decodeOnly, disposeAll, ready: true }
const status = document.getElementById('status')
if (status) status.textContent = 'Ready. Call window.roiEval.run(config).'
