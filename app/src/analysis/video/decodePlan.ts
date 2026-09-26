/** Pure planning: which frames a selection means, and which coded samples must be decoded. */
import type { FrameSelection, FrameTime } from './frameTypes.ts'
import { nearestStandardFps, type FrameTiming, type SampleInfo } from './timing.ts'

const TIME_EPSILON_S = 1e-9

/** Presentation indices (ascending, unique) selected by `selection`. */
export function selectFrameIndices(
  frames: readonly FrameTime[],
  timeScale: number,
  selection: FrameSelection = {},
): number[] {
  const count = frames.length
  if (count === 0) return []
  if ('indices' in selection) {
    return [...new Set(selection.indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < count).sort((a, b) => a - b)
  }

  let start: number
  let end: number
  if ('startReal' in selection) {
    start = count
    end = -1
    for (const frame of frames) {
      const tReal = frame.tMedia * timeScale
      if (tReal >= selection.startReal - TIME_EPSILON_S && tReal <= selection.endReal + TIME_EPSILON_S) {
        start = Math.min(start, frame.index)
        end = Math.max(end, frame.index)
      }
    }
  } else {
    start = Math.max(0, Math.floor(selection.startIndex ?? 0))
    end = Math.min(count - 1, Math.floor(selection.endIndex ?? count - 1))
  }

  const step = Math.max(1, Math.floor(selection.step ?? 1))
  const out: number[] = []
  for (let i = start; i <= end; i += step) out.push(i)
  return out
}

/** Index of the frame whose tMedia is nearest to t (frames ascending by tMedia). */
export function nearestFrameIndex(frames: readonly FrameTime[], t: number): number {
  let lo = 0
  let hi = frames.length - 1
  if (hi < 0) return -1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].tMedia < t) lo = mid + 1
    else hi = mid
  }
  if (lo > 0 && Math.abs(frames[lo - 1].tMedia - t) <= Math.abs(frames[lo].tMedia - t)) return lo - 1
  return lo
}

export interface EstimatedTimeline {
  fps: number
  firstFrameS: number
  frameCount: number
}

/**
 * Frame timeline for containers we cannot parse (WebM), from presentation times
 * observed during playback (requestVideoFrameCallback mediaTime) and the duration.
 * Assumes a constant frame rate; skipped callbacks are tolerated via the median.
 */
export function estimateTimeline(
  observedMediaTimesS: readonly number[],
  durationS: number,
  /** Presentation time of the first frame when measured (seek to 0 + frame callback). */
  measuredFirstFrameS?: number,
): EstimatedTimeline | null {
  const times = [...new Set(observedMediaTimesS)].sort((a, b) => a - b)
  if (times.length < 3 || !(durationS > 0)) return null
  const deltas: number[] = []
  for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1])
  deltas.sort((a, b) => a - b)
  // Rough period: the typical small interval (larger ones are missed callbacks).
  const lowerHalf = deltas.slice(0, Math.max(1, Math.ceil(deltas.length / 2)))
  const roughS = lowerHalf[lowerHalf.length >> 1]
  if (!(roughS > 0)) return null

  // Least-squares fit t = a + p * n over integer frame numbers n. WebM stores
  // millisecond timestamps (16/17 ms at 60 fps), so single deltas are biased; the fit is not.
  // Frame numbers are unwrapped delta by delta (a rough period is good enough locally),
  // then refined once with the fitted period.
  const fit = (period: number) => {
    const n = [0]
    for (let i = 1; i < times.length; i++) n.push(n[i - 1] + Math.max(1, Math.round((times[i] - times[i - 1]) / period)))
    const meanN = n.reduce((s, v) => s + v, 0) / n.length
    const meanT = times.reduce((s, v) => s + v, 0) / times.length
    let sxy = 0
    let sxx = 0
    for (let i = 0; i < n.length; i++) {
      sxy += (n[i] - meanN) * (times[i] - meanT)
      sxx += (n[i] - meanN) ** 2
    }
    const p = sxx > 0 ? sxy / sxx : period
    return { p, intercept: meanT - p * meanN, meanN, meanT }
  }
  const first = fit(roughS)
  let { p: periodS } = fit(first.p)
  const snapped = nearestStandardRate(1 / periodS)
  if (snapped) periodS = 1 / snapped
  const final = fit(periodS)
  const intercept = final.meanT - periodS * final.meanN

  // Without a measured first frame, use the grid phase in [0, p); phases within a quarter
  // frame of the grid are timestamp rounding (containers almost always start at 0).
  let firstFrameS: number
  if (measuredFirstFrameS !== undefined && Number.isFinite(measuredFirstFrameS)) {
    firstFrameS = Math.max(0, measuredFirstFrameS)
  } else {
    const phase = ((intercept % periodS) + periodS) % periodS
    firstFrameS = phase > 0.25 * periodS && phase < 0.75 * periodS ? phase : 0
  }
  const frameCount = Math.max(1, Math.round((durationS - firstFrameS) / periodS))
  return { fps: 1 / periodS, firstFrameS, frameCount }
}

/** Nearest standard rate if within 0.5%, else null. */
function nearestStandardRate(fps: number): number | null {
  const rate = nearestStandardFps(fps)
  return rate !== null && Math.abs(fps / rate - 1) <= 0.005 ? rate : null
}

export interface DecodePlan {
  /** Decode-order sample range to feed (inclusive), starting at a keyframe. */
  firstSample: number
  lastSample: number
  /** Presentation indices to emit. */
  wanted: ReadonlySet<number>
}

/**
 * Chooses the decode-order sample span that produces every wanted frame: from the last
 * keyframe at or before the earliest needed sample to the latest needed sample. The
 * keyframe must also present no later than the earliest wanted frame, which steps back a
 * GOP for open-GOP streams (HEVC CRA leading pictures reference the previous GOP).
 */
export function planDecode(
  samples: readonly SampleInfo[],
  frames: readonly FrameTiming[],
  indices: readonly number[],
): DecodePlan | null {
  if (indices.length === 0) return null
  let minSample = Number.POSITIVE_INFINITY
  let maxSample = Number.NEGATIVE_INFINITY
  let minCts = Number.POSITIVE_INFINITY
  for (const index of indices) {
    const frame = frames[index]
    minSample = Math.min(minSample, frame.sampleIndex)
    maxSample = Math.max(maxSample, frame.sampleIndex)
    minCts = Math.min(minCts, frame.ctsTicks)
  }

  let first = minSample
  while (first > 0 && !(samples[first].isSync && samples[first].ctsTicks <= minCts)) first--
  if (!samples[first].isSync) {
    // No keyframe before: start at sample 0 anyway; frames before the first keyframe may not decode.
    first = 0
  }
  return { firstSample: first, lastSample: maxSample, wanted: new Set(indices) }
}
