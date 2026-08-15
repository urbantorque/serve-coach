/** Two peaks closer together than this are one serve, not two. */
export const MIN_SERVE_GAP = 1.6

/** The sample rate the peak heights are reliable at. */
export const SCAN_FPS = 12

/**
 * How many frames the locating scan may read, however long the clip is.
 *
 * Every sample costs a seek and a pose detection — about 55 ms, and that is the
 * floor set by video decoding rather than anything this code does. At a fixed 12
 * fps the scan therefore costs 55 ms per 83 ms of footage, so a three-minute
 * basket spends over two minutes locating serves before it starts measuring one.
 * The app invites exactly that ("film a whole basket if that is easier"), so the
 * cost has to be bounded rather than left proportional to how long somebody held
 * the record button.
 */
export const SCAN_BUDGET = 420

/** Seconds either side of a candidate that the refinement pass re-reads. */
const REFINE_RADIUS = 0.9

export interface ScanPlan {
  /** Times to sample, in seconds. */
  times: number[]
  /** Gap between samples. */
  step: number
  /**
   * True when the budget forced a rate below `SCAN_FPS`, so peak heights from
   * this pass are under-read and candidates need a second look.
   */
  coarse: boolean
}

/**
 * Where to sample when locating the serves in a clip.
 *
 * Short clips are sampled at the full rate, exactly as before — most clips are a
 * few seconds and nothing should change for them. Long ones are spread across
 * the same fixed budget, which makes the scan slower per second of footage but
 * bounded in total.
 */
export function planScan(duration: number, budget = SCAN_BUDGET): ScanPlan {
  const ideal = 1 / SCAN_FPS
  const span = Math.max(0, duration)
  const wanted = Math.max(2, Math.floor(span / ideal))

  if (wanted <= budget) {
    return {
      times: Array.from({ length: wanted }, (_, i) => i * ideal),
      step: ideal,
      coarse: false,
    }
  }

  const step = span / budget
  return {
    times: Array.from({ length: budget }, (_, i) => i * step),
    step,
    coarse: true,
  }
}

/**
 * A second, full-rate look around each candidate peak.
 *
 * Sampling coarsely does not move a serve, but it does under-read how high the
 * hand got — the reach is only near its maximum for a few tenths of a second, so
 * a sample landing half a second off the peak reports a lower one. That matters
 * because `findServes` keeps only peaks within `REACH_TOLERANCE` of the best, so
 * an under-read serve is not merely imprecise, it is discarded, and the player is
 * told one of their serves could not be read.
 *
 * Re-reading a second either side of each candidate at the full rate costs a few
 * dozen samples and makes the peak heights better than a uniform 12 fps scan
 * would have managed, because the samples are spent where the answer lives.
 */
export function planRefinement(
  candidates: number[],
  duration: number,
  maxCandidates = 8,
): number[] {
  const span = Math.max(0, duration)
  // Snapped to one grid across the whole clip rather than laid out from each
  // candidate. Two windows starting at different offsets never land on the same
  // instants, so de-duplicating them afterwards removes nothing — a grid is what
  // makes overlapping windows genuinely share their frames.
  const grid = new Set<number>()
  for (const centre of candidates.slice(0, maxCandidates)) {
    const from = Math.max(0, centre - REFINE_RADIUS)
    const to = Math.min(span, centre + REFINE_RADIUS)
    for (let k = Math.ceil(from * SCAN_FPS); k <= Math.floor(to * SCAN_FPS); k++) {
      grid.add(k)
    }
  }
  return [...grid].sort((a, b) => a - b).map((k) => k / SCAN_FPS)
}

/**
 * The strongest few samples, as starting points for refinement.
 *
 * Local maxima rather than the globally highest samples: taking the top N by
 * height alone returns N samples from whichever single serve happened to be
 * read closest to its peak, and never looks at the others at all.
 */
/**
 * The most serves one clip is ever broken into.
 *
 * A cap on the scan, and therefore a cap on memory: a sweep holds one whole
 * `Analysis` per serve so the comparison can be built from them, so this
 * multiplies `MAX_FINE_FRAMES` into the resident cost of a basket. It was a
 * default argument with no name, which meant the number that bounds the biggest
 * allocation in the app was written down in one place and understood in none.
 * `footprint.ts` reads it.
 */
export const MAX_SERVES = 8

/**
 * How high a peak must rise above the clip's own resting height to be worth
 * calling out, rather than a raised hand at rest — a quarter of the way from
 * resting to the highest reach in the clip. A serve clears that comfortably; a
 * hand at the hip does not come near it. `null` when the clip has no real
 * spread at all (nobody ever reached for anything), which callers take as "no
 * peak in this clip is real."
 *
 * Shared by `peakCandidates` and `findServes` because it is the same question
 * asked twice — "is there really a peak here" — and this session's own
 * extreme-duration audit found the two functions had drifted to different
 * answers: `peakCandidates` already required it, `findServes` did not, so a
 * long clip where nobody ever swings could still have `findServes` return a
 * clip's noisiest resting moment as if it were a located serve.
 */
function restingFloor(samples: ReachSample[]): number | null {
  const heights = samples.map((s) => s.height).sort((a, b) => a - b)
  const middle = heights[heights.length >> 1]
  const highest = heights[heights.length - 1]
  if (highest - middle < 1e-6) return null
  return middle + (highest - middle) * 0.25
}

export function peakCandidates(samples: ReachSample[], count = MAX_SERVES): number[] {
  if (!samples.length) return []

  // Only samples that stand out from the resting height are worth a second look.
  // Ranking by height alone fills the quota with whatever the flat stretches
  // happened to sort first once the real peaks run out — on a clip with four
  // serves and eight slots, half the refinement budget went on footage of
  // somebody standing still.
  const floor = restingFloor(samples)
  if (floor === null) return []

  const picked: number[] = []
  for (const s of [...samples].sort((a, b) => b.height - a.height)) {
    if (picked.length >= count) break
    if (s.height < floor) break
    // Half the minimum gap: close enough to be the same serve's shoulder.
    if (picked.some((t) => Math.abs(t - s.t) < MIN_SERVE_GAP / 2)) continue
    picked.push(s.t)
  }
  return picked.sort((a, b) => a - b)
}

/** How far below the best reach a peak may sit and still count as a serve. */
export const REACH_TOLERANCE = 0.12

export interface ReachSample {
  t: number
  /** How high the higher hand got, in image units, larger being higher. */
  height: number
}

/**
 * Pick out every serve in a clip from a coarse trace of hand height.
 *
 * Filming a whole basket is the natural thing to do, so a clip often holds
 * several serves. Each shows up as a peak in how high the hands reach. Peaks
 * are taken greedily, tallest first, skipping any that falls too close in time
 * to one already taken — those are the same motion sampled twice, not a second
 * serve. Anything reaching markedly lower than the best peak is a practice
 * swing, a ball toss or a wave, and is left out.
 *
 * Kept free of any video or MediaPipe dependency so it can be tested directly.
 *
 * Requires a peak to clear `restingFloor` as well as sit within
 * `REACH_TOLERANCE` of the best sample — without it, a clip nobody ever
 * swings in (camera left running, a whole idle basket) has no real peak at
 * all, and this function used to hand back its noisiest resting instant as a
 * "located" serve instead of reporting that nothing stood out. That silently
 * traded the extraction pipeline's honest "I could not find a serve in that
 * clip" refusal for the far less useful "that does not look like a serve" —
 * technically not wrong, but blaming the swing for what was actually the scan
 * finding nothing to aim at.
 */
export function findServes(samples: ReachSample[]): number[] {
  if (!samples.length) return []

  const floor = restingFloor(samples)
  if (floor === null) return []

  const ranked = [...samples].sort((a, b) => b.height - a.height)
  const bestHeight = ranked[0].height
  const picked: number[] = []

  for (const s of ranked) {
    if (s.height < bestHeight - REACH_TOLERANCE) break
    if (s.height < floor) break
    if (picked.some((t) => Math.abs(t - s.t) < MIN_SERVE_GAP)) continue
    picked.push(s.t)
  }

  return picked.sort((a, b) => a - b)
}
