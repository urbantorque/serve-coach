/**
 * Compact per-serve tracks for storage (ARCHITECTURE §6.3 PoseTrackCompact / BallTrackCompact).
 * Typed arrays store natively in IndexedDB and keep a serve's tracks to tens of kilobytes. Raw
 * (unrectified) points are stored with the per-frame pitch and roll, so overlays draw on the video
 * and rectified points can be recomputed exactly. Pure.
 */
import type { BallTrackCompact, PoseTrackCompact } from '../../data/domain.ts'
import type { BallTrack, CaptureContext, PoseFrame } from '../types.ts'

export const LANDMARKS = 33
/** PoseTrackCompact.flags bits. */
export const POSE_FLAG = { interpolated: 1, dense: 2, noPose: 4 } as const
const BALL_KIND: Record<BallTrack['kind'], number> = { toss: 0, outgoing: 1, bounce: 2, unknown: 3 }

/** Linear interpolation of orientation samples at t (ms); NaN when there are none (pitch unknown). */
export function orientationAt(samples: CaptureContext['orientationSamples'], tMs: number): { pitchDeg: number; rollDeg: number } {
  if (!samples || samples.length === 0) return { pitchDeg: Number.NaN, rollDeg: Number.NaN }
  if (tMs <= samples[0].tMs) return { pitchDeg: samples[0].pitchDeg, rollDeg: samples[0].rollDeg }
  const last = samples[samples.length - 1]
  if (tMs >= last.tMs) return { pitchDeg: last.pitchDeg, rollDeg: last.rollDeg }
  let i = 1
  while (i < samples.length && samples[i].tMs < tMs) i++
  const a = samples[i - 1]
  const b = samples[i]
  const f = b.tMs > a.tMs ? (tMs - a.tMs) / (b.tMs - a.tMs) : 0
  return { pitchDeg: a.pitchDeg + f * (b.pitchDeg - a.pitchDeg), rollDeg: a.rollDeg + f * (b.rollDeg - a.rollDeg) }
}

export function compactPoseTrack(
  frames: readonly PoseFrame[],
  options: { frameAspect: number; bodyHeightHU: number; denseFrames?: ReadonlySet<number>; orientationSamples?: CaptureContext['orientationSamples'] },
): PoseTrackCompact {
  const n = frames.length
  const frameIndices = new Int32Array(n)
  const tReal = new Float64Array(n)
  const xyv = new Float32Array(n * LANDMARKS * 3).fill(Number.NaN)
  const flags = new Uint8Array(n)
  const pitchDeg = new Float32Array(n)
  const rollDeg = new Float32Array(n)
  frames.forEach((f, i) => {
    frameIndices[i] = f.frameIndex
    tReal[i] = f.tReal
    let flag = options.denseFrames?.has(f.frameIndex) ? POSE_FLAG.dense : 0
    if (!f.landmarks) flag |= POSE_FLAG.noPose
    else {
      for (let k = 0; k < LANDMARKS; k++) {
        const l = f.landmarks[k]
        if (!l) continue
        const o = (i * LANDMARKS + k) * 3
        xyv[o] = l.x
        xyv[o + 1] = l.y
        xyv[o + 2] = l.visibility
        if (l.interpolated) flag |= POSE_FLAG.interpolated
      }
    }
    flags[i] = flag
    const o = orientationAt(options.orientationSamples, f.tReal * 1000)
    pitchDeg[i] = o.pitchDeg
    rollDeg[i] = o.rollDeg
  })
  return {
    frameIndices,
    tReal,
    xyv,
    flags,
    source: frames[0]?.source ?? 'mediapipe',
    frameAspect: options.frameAspect,
    bodyHeightHU: options.bodyHeightHU,
    pitchDeg,
    rollDeg,
  }
}

/** Ball observations of the given tracks inside [fromFrame, toFrame], in frame order. */
export function compactBallTrack(tracks: readonly BallTrack[], fromFrame: number, toFrame: number, tossTrackId?: number | null): BallTrackCompact | undefined {
  const rows: { f: number; t: number; x: number; y: number; r: number; s: number; k: number; p: number }[] = []
  let tossFit: BallTrackCompact['tossFit']
  for (const track of tracks) {
    for (const o of track.observations) {
      if (o.frameIndex < fromFrame || o.frameIndex > toFrame) continue
      rows.push({ f: o.frameIndex, t: o.tReal, x: o.x, y: o.y, r: o.radius, s: o.score, k: BALL_KIND[track.kind], p: o.source === 'predicted' ? 1 : 0 })
    }
    if (track.fit && (track.id === tossTrackId || (tossTrackId == null && track.kind === 'toss'))) tossFit ??= { ...track.fit }
  }
  if (rows.length === 0) return undefined
  rows.sort((a, b) => a.f - b.f || a.k - b.k)
  const out: BallTrackCompact = {
    frameIndices: Int32Array.from(rows, (r) => r.f),
    tReal: Float64Array.from(rows, (r) => r.t),
    x: Float32Array.from(rows, (r) => r.x),
    y: Float32Array.from(rows, (r) => r.y),
    r: Float32Array.from(rows, (r) => r.r),
    score: Float32Array.from(rows, (r) => r.s),
    kind: Uint8Array.from(rows, (r) => r.k),
    predicted: Uint8Array.from(rows, (r) => r.p),
  }
  if (tossFit) out.tossFit = tossFit
  return out
}

/** Dense poses win over sparse ones for the same frame; result in frame order. */
export function mergePoses(sparse: readonly PoseFrame[], dense: readonly PoseFrame[]): PoseFrame[] {
  const byFrame = new Map<number, PoseFrame>()
  for (const p of sparse) byFrame.set(p.frameIndex, p)
  for (const p of dense) byFrame.set(p.frameIndex, p)
  return [...byFrame.values()].sort((a, b) => a.frameIndex - b.frameIndex)
}

/** Re-times poses after a time-base correction (tReal = tMedia * timeScale, so it scales linearly). */
export function retimePoses(poses: readonly PoseFrame[], factor: number): PoseFrame[] {
  return poses.map((p) => ({ ...p, tReal: p.tReal * factor }))
}
