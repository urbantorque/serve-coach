/**
 * Pure frame-timing logic: edit-list mapping, presentation-order frame table and
 * frame-rate statistics (nominal fps, VFR, drops, rate segments). No DOM, no mp4box.
 */

/** One coded sample in DECODE order, as read from the container sample tables. */
export interface SampleInfo {
  /** Decode-order index within the track (0-based). */
  index: number
  dtsTicks: number
  ctsTicks: number
  durationTicks: number
  isSync: boolean
  /** Byte offset and size of the sample in the file. */
  offset: number
  size: number
}

/** Edit list entry. mediaTimeTicks === -1 is an empty edit (a presentation gap). */
export interface EditEntry {
  segmentDurationS: number
  mediaTimeTicks: number
  mediaRate: number
}

/** One PRESENTED frame, in presentation order. */
export interface FrameTiming {
  /** Presentation-order index among presented frames; 0 is the first frame a player shows. */
  index: number
  /** Decode-order sample index (into the SampleInfo array). */
  sampleIndex: number
  ctsTicks: number
  /** Presentation time on the movie timeline (seconds), matching HTMLVideoElement.currentTime. */
  tMedia: number
  durationS: number
  isKeyframe: boolean
}

export interface EditMapping {
  /** Movie time at which the first media edit starts (sum of leading empty edits). */
  presentationOffsetS: number
  /** First media tick presented. */
  mediaStartTicks: number
  /** Media tick where presentation ends (exclusive); Infinity when the edit runs to the end. */
  mediaEndTicks: number
  /** Playback rate of the edit (1 = normal). */
  rate: number
  /** Number of non-empty edits in the list (only the first is used). */
  mediaEditCount: number
  warnings: string[]
}

/**
 * Reduces an edit list to the common phone/ffmpeg case: optional leading empty edits
 * followed by one media edit. More complex lists are reported, not silently trusted.
 */
export function editMapping(edits: readonly EditEntry[], timescale: number, firstCtsTicks: number): EditMapping {
  const warnings: string[] = []
  let presentationOffsetS = 0
  const mediaEdits = edits.filter((edit) => edit.mediaTimeTicks >= 0)

  for (const edit of edits) {
    if (edit.mediaTimeTicks >= 0) break
    presentationOffsetS += edit.segmentDurationS
  }

  if (mediaEdits.length === 0) {
    return {
      presentationOffsetS,
      mediaStartTicks: firstCtsTicks,
      mediaEndTicks: Number.POSITIVE_INFINITY,
      rate: 1,
      mediaEditCount: 0,
      warnings,
    }
  }

  const first = mediaEdits[0]
  if (mediaEdits.length > 1) {
    warnings.push(
      `Edit list has ${mediaEdits.length} media edits; only the first is used, so frame times may differ from a player's timeline.`,
    )
  }
  if (Math.abs(first.mediaRate - 1) > 1e-6) {
    warnings.push(
      `Edit list plays media at rate ${first.mediaRate}; frame times here are sample times, not the remapped playback timeline.`,
    )
  }
  // segment_duration is movie time; the media span it covers is duration * rate.
  const rate = first.mediaRate > 0 ? first.mediaRate : 1
  const spanTicks = first.segmentDurationS > 0 ? first.segmentDurationS * rate * timescale : Number.POSITIVE_INFINITY
  return {
    presentationOffsetS,
    mediaStartTicks: first.mediaTimeTicks,
    mediaEndTicks: first.mediaTimeTicks + spanTicks,
    rate,
    mediaEditCount: mediaEdits.length,
    warnings,
  }
}

/**
 * Builds the presentation-order frame table. Samples outside the edit (e.g. pre-roll
 * after a stream-copy trim) are left out, matching what browsers display.
 */
export function buildFrameTable(
  samples: readonly SampleInfo[],
  timescale: number,
  mapping: EditMapping,
): FrameTiming[] {
  const halfTick = 0.5
  const presented = samples
    .filter(
      (s) => s.ctsTicks >= mapping.mediaStartTicks - halfTick && s.ctsTicks < mapping.mediaEndTicks - halfTick,
    )
    .sort((a, b) => a.ctsTicks - b.ctsTicks)

  return presented.map((s, index) => ({
    index,
    sampleIndex: s.index,
    ctsTicks: s.ctsTicks,
    tMedia: mapping.presentationOffsetS + (s.ctsTicks - mapping.mediaStartTicks) / timescale,
    durationS: s.durationTicks / timescale,
    isKeyframe: s.isSync,
  }))
}

export interface RateSegment {
  /** First and last frame index (inclusive) of a run with a steady frame interval; neighbours share their boundary frame. */
  startIndex: number
  endIndex: number
  fps: number
}

export interface FrameTimingStats {
  frameCount: number
  medianDeltaS: number
  /** 1 / mean of the deltas that agree with the median (robust to drops and jitter). */
  nominalFps: number
  /** (frames - 1) / span: includes the effect of drops and VFR. */
  meanFps: number
  minDeltaS: number
  maxDeltaS: number
  /** Fraction of frame intervals that deviate from the median by more than the tolerance. */
  irregularDeltaFraction: number
  isVariableFrameRate: boolean
  /** Frames implied missing by gaps of about k * median interval (k >= 2). */
  droppedFrameEstimate: number
  segments: RateSegment[]
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Tolerance for "same interval": 5% of the interval, but never below ~1 container tick. */
function deltaTolerance(medianDeltaS: number, tickS: number): number {
  return Math.max(0.05 * medianDeltaS, 1.01 * tickS)
}

const SEGMENT_RATIO = 1.25
const MIN_SEGMENT_RUN = 3

function sameRate(a: number, b: number): boolean {
  const ratio = a > b ? a / b : b / a
  return ratio <= SEGMENT_RATIO
}

/**
 * Splits frame intervals into runs of steady rate. A new run starts only when at least
 * MIN_SEGMENT_RUN consecutive intervals agree with each other and not with the current
 * run, so isolated drops or jitter do not fragment the timeline.
 */
export function rateSegments(deltasS: readonly number[]): RateSegment[] {
  if (deltasS.length === 0) return []
  const bounds: { start: number; end: number }[] = [] // delta index ranges, end exclusive
  let segStart = 0
  let ref = deltasS[0]
  let i = 1
  while (i < deltasS.length) {
    if (sameRate(deltasS[i], ref)) {
      i++
      continue
    }
    let run = 1
    while (i + run < deltasS.length && !sameRate(deltasS[i + run], ref) && sameRate(deltasS[i + run], deltasS[i])) run++
    if (run >= MIN_SEGMENT_RUN) {
      bounds.push({ start: segStart, end: i })
      segStart = i
      ref = median(deltasS.slice(i, i + run))
    }
    i += run
  }
  bounds.push({ start: segStart, end: deltasS.length })
  return bounds.map(({ start, end }) => ({
    startIndex: start,
    endIndex: end,
    fps: 1 / median(deltasS.slice(start, end)),
  }))
}

/**
 * Frame-rate statistics from presentation times (seconds, ascending).
 * @param tickS container tick duration (1 / timescale) used as the jitter floor.
 */
export function analyzeFrameTiming(timesS: readonly number[], tickS = 0): FrameTimingStats {
  const frameCount = timesS.length
  const deltas: number[] = []
  for (let i = 1; i < frameCount; i++) deltas.push(timesS[i] - timesS[i - 1])

  if (deltas.length === 0) {
    return {
      frameCount,
      medianDeltaS: Number.NaN,
      nominalFps: Number.NaN,
      meanFps: Number.NaN,
      minDeltaS: Number.NaN,
      maxDeltaS: Number.NaN,
      irregularDeltaFraction: 0,
      isVariableFrameRate: false,
      droppedFrameEstimate: 0,
      segments: [],
    }
  }

  const medianDeltaS = median(deltas)
  const tolerance = deltaTolerance(medianDeltaS, tickS)
  const inliers = deltas.filter((d) => Math.abs(d - medianDeltaS) <= tolerance)
  const meanInlier = inliers.reduce((sum, d) => sum + d, 0) / inliers.length
  const irregular = deltas.length - inliers.length
  const segments = rateSegments(deltas)

  let droppedFrameEstimate = 0
  for (const d of deltas) {
    const k = Math.round(d / medianDeltaS)
    if (k >= 2 && Math.abs(d - k * medianDeltaS) <= tolerance * k) droppedFrameEstimate += k - 1
  }

  const irregularDeltaFraction = irregular / deltas.length
  return {
    frameCount,
    medianDeltaS,
    nominalFps: 1 / meanInlier,
    meanFps: (frameCount - 1) / (timesS[frameCount - 1] - timesS[0]),
    minDeltaS: deltas.reduce((m, d) => Math.min(m, d), Number.POSITIVE_INFINITY),
    maxDeltaS: deltas.reduce((m, d) => Math.max(m, d), Number.NEGATIVE_INFINITY),
    irregularDeltaFraction,
    isVariableFrameRate: irregularDeltaFraction > 0.01 || segments.length > 1,
    droppedFrameEstimate,
    segments,
  }
}

const STANDARD_RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 240, 480, 960]

/** Nearest standard camera rate within 1%, or null. Useful for labels, never for maths. */
export function nearestStandardFps(fps: number): number | null {
  let best: number | null = null
  let bestErr = Number.POSITIVE_INFINITY
  for (const rate of STANDARD_RATES) {
    const err = Math.abs(fps / rate - 1)
    if (err < bestErr) {
      bestErr = err
      best = rate
    }
  }
  return bestErr <= 0.01 ? best : null
}
