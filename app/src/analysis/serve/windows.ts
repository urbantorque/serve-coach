/**
 * Coarse serve finding (METRICS §2.3.1–§2.3.2). Works on sparse poses (about 15–30 Hz) without
 * left/right labels: anchors are maxima of the HIGHER wrist, heights are in body heights above a
 * rolling floor row.
 */
import { LM, type Handedness, type PoseFrame, type VideoMeta } from '../types.ts'
import { estimateHeadTopY } from '../pose/body.ts'

export interface ServeWindowSpan {
  startReal: number
  endReal: number
  confidence: number
  /** Anchor time (the higher wrist's maximum; close to contact). */
  anchorReal: number
}

interface Sample {
  t: number
  /** Heights above the floor in body heights. */
  hL: number | null
  hR: number | null
  hNose: number | null
}

const MIN_VIS = 0.3
export const WINDOW_BEFORE_S = 2.2
export const WINDOW_AFTER_S = 2.0
export const ANCHOR_MERGE_S = 1.2

function usable(f: PoseFrame, k: number): { x: number; y: number } | null {
  const lm = f.landmarks?.[k]
  return lm && Number.isFinite(lm.x) && Number.isFinite(lm.y) && lm.visibility >= MIN_VIS ? lm : null
}

function floorOf(f: PoseFrame): number | null {
  let best = -Infinity
  for (const k of [LM.LEFT_HEEL, LM.RIGHT_HEEL, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX, LM.LEFT_ANKLE, LM.RIGHT_ANKLE]) {
    const p = usable(f, k)
    if (p && p.y > best) best = p.y
  }
  return Number.isFinite(best) ? best : null
}

/**
 * Serve windows from a coarse pose pass. Anchor = local maximum of the higher wrist with
 * h ≥ 0.95 BH, ≥ nose + 0.08, prominence ≥ 0.30 BH over the preceding 1.5 s, and a toss (the
 * other wrist ≥ 0.90 BH in [t − 1.6, t − 0.15]). Anchors < 1.2 s apart merge; windows are
 * [t − 2.2, t + 2.0] s, split at the midpoint where neighbours overlap, clamped to the clip.
 */
export function findServeWindows(poses: readonly PoseFrame[], meta: Pick<VideoMeta, 'width' | 'height' | 'durationMediaS' | 'timeScale'>, _handedness: Handedness): ServeWindowSpan[] {
  const frames = [...poses].filter((f) => f.landmarks).sort((a, b) => a.tReal - b.tReal)
  if (frames.length < 5) return []
  const aspect = meta.width / meta.height
  // Rolling floor (±1 s median of the lowest foot point) and a clip-level standing height.
  const floors = frames.map(floorOf)
  const heights: number[] = []
  for (let i = 0; i < frames.length; i++) {
    const head = estimateHeadTopY(frames[i].landmarks!, aspect, MIN_VIS)
    const fl = floors[i]
    if (head && fl !== null && fl - head.y > 0) heights.push(fl - head.y)
  }
  if (heights.length < 3) return []
  heights.sort((a, b) => a - b)
  // Standing frames are the tall ones: the 75th percentile avoids crouched and airborne frames.
  const bh = heights[Math.floor(0.75 * (heights.length - 1))]
  const floorAt = (i: number): number | null => {
    const t = frames[i].tReal
    const ys: number[] = []
    for (let j = i; j >= 0 && t - frames[j].tReal <= 1; j--) if (floors[j] !== null) ys.push(floors[j]!)
    for (let j = i + 1; j < frames.length && frames[j].tReal - t <= 1; j++) if (floors[j] !== null) ys.push(floors[j]!)
    // The floor is where the feet stand most of the time; a jump lifts them (smaller y), so take
    // an upper quantile of the lowest-foot rows rather than the median.
    if (!ys.length) return null
    ys.sort((a, b) => a - b)
    return ys[Math.floor(0.75 * (ys.length - 1))]
  }
  const samples: Sample[] = frames.map((f, i) => {
    const fl = floorAt(i)
    const h = (k: number) => {
      const p = usable(f, k)
      return p && fl !== null ? (fl - p.y) / bh : null
    }
    return { t: f.tReal, hL: h(LM.LEFT_WRIST), hR: h(LM.RIGHT_WRIST), hNose: h(LM.NOSE) }
  })
  const higher = (s: Sample) => (s.hL === null ? s.hR : s.hR === null ? s.hL : Math.max(s.hL, s.hR))

  type Anchor = { t: number; h: number; confidence: number }
  const anchors: Anchor[] = []
  for (let i = 1; i < samples.length - 1; i++) {
    const h = higher(samples[i])
    if (h === null || h < 0.95) continue
    // Local maximum over ±0.15 s.
    let isMax = true
    for (let j = i - 1; j >= 0 && samples[i].t - samples[j].t <= 0.15; j--) if ((higher(samples[j]) ?? -Infinity) > h) isMax = false
    for (let j = i + 1; j < samples.length && samples[j].t - samples[i].t <= 0.15; j++) if ((higher(samples[j]) ?? -Infinity) > h) isMax = false
    if (!isMax) continue
    const nose = samples[i].hNose
    if (nose !== null && h < nose + 0.08) continue
    let minBefore = Infinity
    for (let j = i - 1; j >= 0 && samples[i].t - samples[j].t <= 1.5; j--) {
      const hj = higher(samples[j])
      if (hj !== null) minBefore = Math.min(minBefore, hj)
    }
    const prominence = h - minBefore
    if (!(prominence >= 0.3)) continue
    // The anchor wrist (by label) and the toss by the other wrist.
    const anchorLeft = samples[i].hL !== null && (samples[i].hR === null || samples[i].hL! >= samples[i].hR!)
    let toss = false
    let tossLabelFree = false
    for (let j = i - 1; j >= 0 && samples[i].t - samples[j].t <= 1.6; j--) {
      if (samples[i].t - samples[j].t < 0.15) continue
      const other = anchorLeft ? samples[j].hR : samples[j].hL
      if (other !== null && other >= 0.9) toss = true
      const a = samples[j].hL
      const b = samples[j].hR
      if (samples[i].t - samples[j].t >= 0.35 && a !== null && b !== null && Math.max(a, b) >= 0.9 && Math.abs(a - b) >= 0.1) tossLabelFree = true
    }
    if (!toss && !tossLabelFree) continue
    const margin = Math.min(1, (h - 0.95) / 0.15) * 0.5 + Math.min(1, (prominence - 0.3) / 0.3) * 0.5
    anchors.push({ t: samples[i].t, h, confidence: (toss ? 0.6 : 0.5) + 0.35 * margin })
  }
  // Merge anchors closer than 1.2 s, keeping the higher wrist.
  const merged: Anchor[] = []
  for (const a of anchors) {
    const last = merged[merged.length - 1]
    if (last && a.t - last.t < ANCHOR_MERGE_S) {
      if (a.h > last.h) merged[merged.length - 1] = a
    } else merged.push(a)
  }
  const tEnd = Math.max(frames[frames.length - 1].tReal, meta.durationMediaS * (meta.timeScale || 1))
  const tStart = Math.min(0, frames[0].tReal)
  return merged.map((a, k) => {
    let start = Math.max(tStart, a.t - WINDOW_BEFORE_S)
    let end = Math.min(tEnd, a.t + WINDOW_AFTER_S)
    const prev = merged[k - 1]
    const next = merged[k + 1]
    if (prev && prev.t + WINDOW_AFTER_S > start) start = Math.max(start, (prev.t + a.t) / 2)
    if (next && next.t - WINDOW_BEFORE_S < end) end = Math.min(end, (a.t + next.t) / 2)
    return { startReal: start, endReal: end, confidence: Math.min(0.95, a.confidence), anchorReal: a.t }
  })
}
