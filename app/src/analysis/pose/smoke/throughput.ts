/**
 * Pose inference throughput probe (dev only; driven by run-throughput.mjs). Decodes a stretch of a
 * clip once, crops every frame to a fixed square around the player (from the truth landmarks, so
 * ROI tracking is out of the measurement), then times MediaPipePoseSource over the same crops in
 * several configurations: model, numPoses, running mode, frames in flight and the number of
 * landmarkers (workers) sharing the frames. Wall time per frame is what the pipeline would see.
 */
import { openFrameSource } from '../../video/frameSource.ts'
import { MediaPipePoseSource } from '../mediapipeSource.ts'
import type { PoseInputFrame } from '../poseSource.ts'

export interface ThroughputConfig {
  label: string
  model: 'full' | 'lite'
  numPoses: number
  runningMode?: 'VIDEO' | 'IMAGE'
  delegate?: 'auto' | 'GPU' | 'CPU'
  maxInFlight: number
  /** Landmarkers working in parallel; frames are split into contiguous chunks. */
  workers: number
  /** Downscale crops to this side before inference (0 = as cropped). */
  side?: number
}

interface Crop {
  frameIndex: number
  tReal: number
  bitmap: ImageBitmap
}

declare global {
  interface Window {
    throughput?: (clip: string, truth: string, from: number, to: number, configs: ThroughputConfig[]) => Promise<unknown>
  }
}

async function crops(clip: string, truthUrl: string, from: number, to: number): Promise<Crop[]> {
  const truth = (await (await fetch(truthUrl)).json()) as { video: { width: number; height: number }; frames: { frameIndex: number; landmarks: { x: number; y: number }[] | null }[] }
  let x0 = 1
  let y0 = 1
  let x1 = 0
  let y1 = 0
  for (const f of truth.frames) {
    if (f.frameIndex < from || f.frameIndex > to || !f.landmarks) continue
    for (const l of f.landmarks) {
      x0 = Math.min(x0, l.x)
      x1 = Math.max(x1, l.x)
      y0 = Math.min(y0, l.y)
      y1 = Math.max(y1, l.y)
    }
  }
  const W = truth.video.width
  const H = truth.video.height
  const side = Math.round(Math.max((x1 - x0) * W, (y1 - y0) * H) * 1.25)
  const cx = ((x0 + x1) / 2) * W
  const cy = ((y0 + y1) / 2) * H
  const sx = Math.max(0, Math.min(W - side, Math.round(cx - side / 2)))
  const sy = Math.max(0, Math.min(H - side, Math.round(cy - side / 2)))
  const blob = await (await fetch(clip)).blob()
  const source = await openFrameSource(blob)
  const out: Crop[] = []
  for await (const raw of source.rawFrames({ startIndex: from, endIndex: to })) {
    try {
      out.push({ frameIndex: raw.index, tReal: raw.tReal, bitmap: await createImageBitmap(raw.image, sx, sy, Math.min(side, W), Math.min(side, H)) })
    } finally {
      raw.close()
    }
  }
  source.close()
  return out
}

async function scaled(list: Crop[], side: number): Promise<Crop[]> {
  return Promise.all(list.map(async (c) => ({ ...c, bitmap: await createImageBitmap(c.bitmap, { resizeWidth: side, resizeHeight: side, resizeQuality: 'medium' }) })))
}

window.throughput = async (clip, truth, from, to, configs) => {
  const base = await crops(clip, truth, from, to)
  const results: unknown[] = []
  for (const cfg of configs) {
    const frames = cfg.side ? await scaled(base, cfg.side) : base
    const sources = Array.from({ length: cfg.workers }, () => new MediaPipePoseSource({ model: cfg.model, numPoses: cfg.numPoses, runningMode: cfg.runningMode ?? 'VIDEO', delegate: cfg.delegate ?? 'auto', roi: 'off', maxInFlight: cfg.maxInFlight, useWorker: true }))
    await Promise.all(sources.map((s) => s.init()))
    // Warm run on a few frames (shader compile per landmarker).
    await Promise.all(sources.map(async (s) => {
      for await (const unused of s.estimate(frames.slice(0, 3).map((c): PoseInputFrame => ({ frameIndex: c.frameIndex, tReal: c.tReal, image: c.bitmap })))) void unused
    }))
    const chunk = Math.ceil(frames.length / cfg.workers)
    let found = 0
    const started = performance.now()
    await Promise.all(sources.map(async (s, k) => {
      const part = frames.slice(k * chunk, (k + 1) * chunk)
      for await (const p of s.estimate(part.map((c): PoseInputFrame => ({ frameIndex: c.frameIndex, tReal: c.tReal + 10, image: c.bitmap })))) if (p.landmarks) found++
    }))
    const wall = performance.now() - started
    const stats = sources.map((s) => s.stats())
    results.push({ ...cfg, frames: frames.length, found, wallMs: Math.round(wall), msPerFrame: +(wall / frames.length).toFixed(1), inferenceMedianMs: stats.map((s) => +s.inference.medianMs.toFixed(1)), prepareMedianMs: stats.map((s) => +s.prepare.medianMs.toFixed(1)), delegate: stats.map((s) => s.init?.delegate) })
    await Promise.all(sources.map((s) => s.dispose()))
    if (frames !== base) for (const c of frames) c.bitmap.close()
  }
  for (const c of base) c.bitmap.close()
  return results
}
