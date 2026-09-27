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
/** Anchor height of the higher wrist at a dense sample (METRICS §2.3.1). */
export const ANCHOR_MIN_BH = 0.95
/**
 * Curvature of the hitting wrist's height peak near contact, BH/s². Measured on the synthetic corpus
 * (smoke --full dumps, dense MediaPipe poses): the narrowest peaks (6 m, ad court, blurred wrist at
 * contact) stay above 0.95 BH for only 67 ms and drop about 0.056 BH within 33 ms of the top.
 */
export const WRIST_PEAK_CURVATURE_BH_S2 = 50
/** Largest drop allowed for a peak that fell between sparse samples (or beside a blurred one). */
export const MAX_SAMPLING_ALLOWANCE_BH = 0.12
/**
 * The tossing arm before the anchor. 0.90 BH left the ad-court serves of the 6 m session clip on the
 * edge (their toss arm peaks at 0.90 to 0.93 BH in dense poses, 0.895 in the sparse pass), so one of
 * them came and went with the sampling phase. 0.85 BH is still above the shoulders (about 0.82 BH).
 */
export const TOSS_MIN_BH = 0.85
/** Two wrist samples closer than this (about the cleaned wrist noise, 0.02 to 0.04 BH) are a tie. */
export const LOCAL_MAX_TOLERANCE_BH = 0.03

/**
 * How far the true peak can sit above the highest sample when the samples are `gapS` apart: the top
 * of a parabola with curvature K lies at most gap/2 from a sample, so it is at most K·(gap/2)² higher.
 * At 60 fps this is 0.003 BH (no change); at the pipeline's 15 Hz Pass A it is 0.056 BH, and beside a
 * frame where the blurred hitting wrist was not found (a 133 ms gap) it reaches the 0.12 BH cap.
 */
export function samplingAllowance(gapS: number): number {
  if (!(gapS > 0)) return 0
  return Math.min(MAX_SAMPLING_ALLOWANCE_BH, WRIST_PEAK_CURVATURE_BH_S2 * (gapS / 2) ** 2)
}

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
 * other wrist ≥ 0.85 BH in [t − 1.6, t − 0.15]). Anchors < 1.2 s apart merge; windows are
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
    if (h === null || h < ANCHOR_MIN_BH - MAX_SAMPLING_ALLOWANCE_BH) continue
    // Sparse sampling (Pass A runs at about 15 Hz) or a frame where the blurred hitting wrist was not
    // found can put the short contact peak between two samples: lower the bar by the most the peak
    // could have dropped over the gap to the nearest wrist sample on either side (never at 60 fps).
    let prevT = Number.NaN
    for (let j = i - 1; j >= 0; j--) if (higher(samples[j]) !== null) { prevT = samples[j].t; break }
    let nextT = Number.NaN
    for (let j = i + 1; j < samples.length; j++) if (higher(samples[j]) !== null) { nextT = samples[j].t; break }
    const gap = Math.max(Number.isFinite(prevT) ? samples[i].t - prevT : 0, Number.isFinite(nextT) ? nextT - samples[i].t : 0)
    const allowance = samplingAllowance(gap)
    const minH = ANCHOR_MIN_BH - allowance
    if (h < minH) continue
    // Local maximum over ±0.15 s, within the pose noise: the falling toss arm can sit a hair above the
    // hitting wrist's first sparse sample, and two samples either side of a peak can be near-equal.
    // Near-equal candidates merge below (the higher is kept).
    let isMax = true
    for (let j = i - 1; j >= 0 && samples[i].t - samples[j].t <= 0.15; j--) if ((higher(samples[j]) ?? -Infinity) > h + LOCAL_MAX_TOLERANCE_BH) isMax = false
    for (let j = i + 1; j < samples.length && samples[j].t - samples[i].t <= 0.15; j++) if ((higher(samples[j]) ?? -Infinity) > h + LOCAL_MAX_TOLERANCE_BH) isMax = false
    if (!isMax) continue
    const nose = samples[i].hNose
    if (nose !== null && h < nose + Math.max(0, 0.08 - allowance)) continue
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
      if (other !== null && other >= TOSS_MIN_BH) toss = true
      const a = samples[j].hL
      const b = samples[j].hR
      if (samples[i].t - samples[j].t >= 0.35 && a !== null && b !== null && Math.max(a, b) >= TOSS_MIN_BH && Math.abs(a - b) >= 0.1) tossLabelFree = true
    }
    if (!toss && !tossLabelFree) continue
    const margin = Math.max(0, Math.min(1, (h - minH) / 0.15)) * 0.5 + Math.min(1, (prominence - 0.3) / 0.3) * 0.5
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
