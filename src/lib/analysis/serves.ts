import { hearPeaks } from '../audio/fuse'

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

/**
 * The fewest samples a second the locating scan may take, however long the clip
 * (L2.1).
 *
 * The budget above used to be the whole rule, so a ten-minute clip was read
 * once every 1.43 s. A serve's hand stays above the clip's resting height for
 * about 0.9 s — less at a real serve's pace — so a third of the serves in a
 * long session were never sampled at all, and the eight the refinement then
 * re-read were whichever the coarse pass happened to land near. Three a second
 * puts two or three samples into every serve's rise. Past the budget the scan
 * now costs time in proportion to the clip again — about a minute and a half
 * of seeks for ten minutes of footage on a desktop — and that is the honest
 * price of finding every serve: a session gets its own path, with an estimate
 * up front, rather than a scan that is quick because it looked at less.
 */
export const SCAN_FLOOR_FPS = 3

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

  // Spread across the budget, but never thinner than `SCAN_FLOOR_FPS`.
  const step = Math.min(span / budget, 1 / SCAN_FLOOR_FPS)
  const count = Math.max(budget, Math.ceil(span / step))
  return {
    times: Array.from({ length: count }, (_, i) => i * step),
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
 * because `findServes` keeps only peaks within `REACH_TOLERANCE_SHARE` of the best, so
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
  // Every candidate (L2.1). It was the first eight, so in a long session the
  // serves past the eighth were never re-read and `findServes` dropped them as
  // under-read.
  maxCandidates = Infinity,
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
 * The most serves whose whole analyses are ever held at once.
 *
 * A cap on memory, not on the scan. A sweep holds one whole `Analysis` per serve
 * so the comparison can be built from them, so this multiplies
 * `MAX_FINE_FRAMES` into the resident cost of a basket, and `footprint.ts`
 * reads it. The sweep itself holds `MAX_CONSISTENCY_SERVES`, which a test keeps
 * at or under this.
 *
 * It used to cap the scan too — `peakCandidates` returned eight and the
 * refinement re-read eight — and so it decided, without saying so, that a
 * clip held at most eight serves (L2.1). The scan now finds every serve; how
 * many are then read in full is the caller's choice, bounded here.
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

export function peakCandidates(samples: ReachSample[], count = Infinity): number[] {
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

/**
 * How far below the best reach a peak may sit and still count as a serve, as a
 * share of the clip's own reach — from the resting hand (the median height) to
 * the highest point in it.
 *
 * It was 0.12 of the frame's height whoever was in it (`ANALYSIS-REVIEW.md`
 * F8), which is half the height of a player filmed small from the back fence
 * and an eighth of one filling the frame. So a far player's practice toss
 * counted as a serve, and a near player's slightly lower second serve risked
 * not counting. A share of their own reach is the same distance on their body
 * at any size. A quarter keeps the old figure for a player filling about 60% of
 * the frame, whose hand rises about 0.5 of the frame from rest to the hit, and
 * it is the quarter `restingFloor` already uses.
 */
export const REACH_TOLERANCE_SHARE = 0.25

/**
 * How far either side of a peak the best reach it is judged against is taken
 * from, in seconds (L2.1).
 *
 * It was the whole clip. In a basket that is the same thing; in a session it is
 * not — one overhead smash early on, or a first serve a fifth higher than the
 * tired ones forty minutes later, set a best that muted every serve after it.
 * Two minutes either side covers a basket whole, so nothing changes for one.
 */
export const ROLLING_REACH_SECONDS = 120

export interface ReachSample {
  t: number
  /** How high the higher hand got, in image units, larger being higher. */
  height: number
  /**
   * The rest of the pose the scan already detected, for telling a serve from
   * another overhead (L2.10). Heights are negated image y, like `height`; the
   * feet are the ankles' midpoint in image units. Absent where the scan could
   * not see them, and then the shape is not judged.
   */
  pose?: { left: number; right: number; head: number; feetX?: number; feetY?: number }
}

/**
 * The shape of a serve, before its reach peak (L2.10): a player who stands
 * still through the load, and a tossing arm that goes up above the head.
 *
 * A smash reaches as high as a serve, often higher, and in a match clip it
 * sits among them. Its other arm goes up too, to point at the ball, so the
 * toss alone does not tell them apart; but a smash is hit on the move, and a
 * serve from a still stance. A practice swing with no toss fails the other test.
 */
export const SHAPE_WINDOW: [number, number] = [-0.9, -0.25]

/** The part of that window the feet must hold still through: the load, before the push-off. */
export const STILL_WINDOW: [number, number] = [-0.9, -0.35]

/**
 * How fast the feet may travel there, in body heights a second. Generous on
 * purpose: a pinpoint stance brings the back foot up, about a fifth of a body
 * a second, and the tracker jitters; a smash is hit on the move, a body length
 * a second or more. A phone held by hand moves the whole picture too, which is
 * what `STILL_TRUST` is for.
 */
export const STILL_SPEED = 0.6

/**
 * When a clip's still feet are believed: at least `MIN_SHAPED` tossed peaks
 * with still feet, and this share of the tossed peaks the feet could judge.
 *
 * The feet are read in the picture, and a picture can move them for reasons of
 * its own: a camera held by hand, or panning to follow play, moves the feet in
 * the frame when the player stood still. A swaying camera passes a serve now
 * and then, on the turn of the sway, and fails the rest; a basket with a smash
 * in it passes nearly every serve. Where too few pass, the feet say more about
 * the camera than the server and are not asked. Two thirds rather than half
 * (W6.11): a match clip whose camera follows play passed seven of thirteen,
 * one real serve among the six that failed.
 *
 * The toss is always asked (W6.11). It compares a hand with the head in one
 * picture, which no camera moves, and every serve marked by eye in the bench
 * clips passed it. It used to stand or fall with the feet, so a clip of a
 * player only receiving, every peak failing the toss, was judged on reach
 * alone and three of its moments were called serves.
 */
export const STILL_TRUST = 2 / 3

/** The fewest tossed peaks with still feet before the feet are believed at all. */
export const MIN_SHAPED = 2

/** What the shape of a peak says: a serve, something else, or nothing to judge it by. */
export type Shape = 'serve' | 'other' | 'unknown'

/**
 * The shape of the peak at `t`, from the samples before it. The racket hand is
 * whichever was higher at the peak; the tossing hand is the other one.
 */
export function shapeAt(samples: readonly ReachSample[], peak: ReachSample): Shape {
  const parts = shapeParts(samples, peak)
  if (!parts) return 'unknown'
  return !parts.tossed || parts.still === false ? 'other' : 'serve'
}

/**
 * The two tests apart: whether the other hand went up above the head, and
 * whether the feet held still through the load (absent where too few feet
 * were seen). Nothing at all where the peak cannot be judged.
 */
export function shapeParts(
  samples: readonly ReachSample[],
  peak: ReachSample,
): { tossed: boolean; still?: boolean } | undefined {
  if (!peak.pose) return undefined
  const racket: 'left' | 'right' = peak.pose.left >= peak.pose.right ? 'left' : 'right'
  const toss = racket === 'left' ? 'right' : 'left'
  const before = samples.filter(
    (s) => s.pose && s.t >= peak.t + SHAPE_WINDOW[0] && s.t <= peak.t + SHAPE_WINDOW[1],
  )
  if (before.length < 3) return undefined
  const tossed = before.some((s) => s.pose![toss] > s.pose!.head)

  const footed = before.filter(
    (s) => s.t <= peak.t + STILL_WINDOW[1] && s.pose!.feetX !== undefined && s.pose!.feetY !== undefined,
  )
  let still: boolean | undefined
  const span = footed.length ? footed[footed.length - 1].t - footed[0].t : 0
  if (footed.length >= 3 && span >= 0.2) {
    // The body's height in the picture: from the nose (minus its height) to the feet.
    const size = footed.map((s) => s.pose!.feetY! + s.pose!.head).sort((a, b) => a - b)[footed.length >> 1]
    // How fast the feet travel, from a straight line through them rather than
    // the farthest two: a speed does not depend on how much of the window the
    // scan happened to sample, and a line through jitter is nearly flat.
    const slope = (pick: (s: ReachSample) => number) => {
      const mt = footed.reduce((a, s) => a + s.t, 0) / footed.length
      const mv = footed.reduce((a, s) => a + pick(s), 0) / footed.length
      const num = footed.reduce((a, s) => a + (s.t - mt) * (pick(s) - mv), 0)
      const den = footed.reduce((a, s) => a + (s.t - mt) ** 2, 0)
      return den > 0 ? num / den : 0
    }
    const speed = Math.hypot(slope((s) => s.pose!.feetX!), slope((s) => s.pose!.feetY!))
    still = size > 0 && speed <= STILL_SPEED * size
  }
  return { tossed, ...(still === undefined ? {} : { still }) }
}

/**
 * How long after a peak the other hand may reach above the head for the peak
 * to have been the toss rather than the hit (W6.11), in seconds.
 *
 * The tossing arm held straight up reaches about as high in the picture as the
 * racket hand at contact, so the highest moment of a serve can be the toss:
 * four of 13 marked by eye in the licensed clips, 0.15 to 0.75 s before the
 * hit. The hand then highest is the tossing one, the shape test took the
 * other for the toss, found it never went up, and turned the serve away as
 * not sure: one of four in one clip, two of four in another.
 * After a hit nothing goes back up so soon, so the margin costs nothing.
 */
export const TOSS_TO_HIT = 0.9

/**
 * The hit a peak belongs to: where the peak was the toss, the moment within
 * `TOSS_TO_HIT` after it that the other hand reached highest, above the head
 * and above the tossing hand; otherwise the peak itself.
 */
export function hitAfterToss(byTime: readonly ReachSample[], peak: ReachSample): ReachSample {
  if (!peak.pose) return peak
  const high: 'left' | 'right' = peak.pose.left >= peak.pose.right ? 'left' : 'right'
  const other = high === 'left' ? 'right' : 'left'
  let hit: ReachSample | undefined
  for (const s of byTime) {
    if (s.t <= peak.t || s.t > peak.t + TOSS_TO_HIT || !s.pose) continue
    if (s.pose[other] <= s.pose.head || s.pose[other] <= s.pose[high]) continue
    if (!hit || s.pose[other] > hit.pose![other]) hit = s
  }
  return hit ?? peak
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
 * `REACH_TOLERANCE_SHARE` of the best sample — without it, a clip nobody ever
 * swings in (camera left running, a whole idle basket) has no real peak at
 * all, and this function used to hand back its noisiest resting instant as a
 * "located" serve instead of reporting that nothing stood out. That silently
 * traded the extraction pipeline's honest "I could not find a serve in that
 * clip" refusal for the far less useful "that does not look like a serve" —
 * technically not wrong, but blaming the swing for what was actually the scan
 * finding nothing to aim at.
 */
export function findServes(samples: ReachSample[]): number[] {
  return classifyServes(samples).serves
}

/** The serves a scan found, and the peaks that reached like one without the shape of one. */
export interface ServeFinds {
  serves: number[]
  /** Overheads that were not served: a smash on the move, a swing with no toss (L2.10). */
  unsure: number[]
  /** Seconds from a reach peak to its impact, when the clip's sound was believed (L2.9). */
  offset?: number
}

/**
 * Every peak that reaches like a serve, sorted into serves and the rest.
 *
 * Peaks first, tallest first, one per `MIN_SERVE_GAP`. Each is then judged
 * against the best reach near it (L2.1), and that best is taken only from
 * peaks with the shape of a serve (L2.10): a smash, however high, no longer
 * sets the bar the serves around it are held to. A peak within the bar goes
 * to the serves when it has a serve's shape, or no shape to judge, and to the
 * not-sure list when its shape says otherwise. Below the bar it is a practice
 * swing or a toss, and is left out as before.
 */
export function classifyServes(samples: ReachSample[], onsets?: readonly number[]): ServeFinds {
  if (!samples.length) return { serves: [], unsure: [] }

  const floor = restingFloor(samples)
  if (floor === null) return { serves: [], unsure: [] }

  const ranked = [...samples].sort((a, b) => b.height - a.height)
  const resting = ranked[ranked.length >> 1].height
  const byTime = [...samples].sort((a, b) => a.t - b.t)

  const peaks: ReachSample[] = []
  for (const s of ranked) {
    if (s.height < floor) break
    if (peaks.some((p) => Math.abs(p.t - s.t) < MIN_SERVE_GAP)) continue
    peaks.push(s)
  }
  // Where a peak was the toss, the serve is the hit after it: its time, and
  // the shape judged from there (W6.11). Its height stays the peak's.
  const hits = new Map(peaks.map((p) => [p, hitAfterToss(byTime, p)]))
  const parts = new Map(peaks.map((p) => [p, shapeParts(byTime, hits.get(p)!)]))
  // The feet are asked only where most tossed peaks kept them still; the toss
  // is always asked (`STILL_TRUST`).
  const footed = peaks.filter((p) => parts.get(p)?.tossed && parts.get(p)!.still !== undefined)
  const stood = footed.filter((p) => parts.get(p)!.still).length
  const feetBelieved = stood >= MIN_SHAPED && stood >= STILL_TRUST * footed.length
  const read = new Map<ReachSample, Shape>(
    peaks.map((p) => {
      const q = parts.get(p)
      if (!q) return [p, 'unknown']
      return [p, !q.tossed || (feetBelieved && q.still === false) ? 'other' : 'serve']
    }),
  )
  /*
   * The fourth agreement, an impact heard (L2.9). Believed only when the
   * offset could be learned and most peaks were heard at it: a phone too far
   * away, or a windy court, hears too few, and the sound then says nothing.
   * Where it is believed, a peak with no impact is not a serve (a shadow
   * swing, a caught toss), and a heard peak the picture could not judge is.
   */
  const hearing = onsets?.length ? hearPeaks(peaks.map((p) => hits.get(p)!.t), onsets) : undefined
  const listened = hearing !== undefined && hearing.heard.filter(Boolean).length * 2 >= peaks.length
  if (listened) {
    peaks.forEach((p, i) => {
      if (!hearing.heard[i]) read.set(p, 'other')
      else if (read.get(p) === 'unknown') read.set(p, 'serve')
    })
  }
  const shapes = read
  const reference = peaks.filter((p) => shapes.get(p) !== 'other').sort((a, b) => a.t - b.t)
  const localBest = rollingBest(reference, peaks, ROLLING_REACH_SECONDS)

  const serves: number[] = []
  const unsure: number[] = []
  for (const p of peaks) {
    // Against the best serve-shaped reach near it, not the best in the clip.
    const best = Math.max(localBest.get(p) ?? -Infinity, shapes.get(p) === 'other' ? -Infinity : p.height)
    const bar = Number.isFinite(best) ? best : p.height
    if (p.height < bar - REACH_TOLERANCE_SHARE * (bar - resting)) continue
    if (shapes.get(p) === 'other') unsure.push(hits.get(p)!.t)
    else serves.push(hits.get(p)!.t)
  }

  return {
    serves: serves.sort((a, b) => a - b),
    unsure: unsure.sort((a, b) => a - b),
    ...(listened ? { offset: hearing.offset } : {}),
  }
}

/**
 * The highest of `reference` within `radius` seconds of each of `at`, by a
 * sliding window over time — linear in the peaks, which a half-hour session
 * has a few hundred of. `reference` is sorted by time.
 */
function rollingBest(reference: ReachSample[], at: ReachSample[], radius: number): Map<ReachSample, number> {
  const out = new Map<ReachSample, number>()
  // Indices into `reference`, heights decreasing from the front.
  const deque: number[] = []
  let ahead = 0
  for (const p of [...at].sort((a, b) => a.t - b.t)) {
    while (ahead < reference.length && reference[ahead].t <= p.t + radius) {
      while (deque.length && reference[deque[deque.length - 1]].height <= reference[ahead].height) deque.pop()
      deque.push(ahead)
      ahead++
    }
    while (deque.length && reference[deque[0]].t < p.t - radius) deque.shift()
    if (deque.length) out.set(p, reference[deque[0]].height)
  }
  return out
}

/**
 * How much of a long clip one player crop covers (L2.10).
 *
 * The scan points the pose model at the server (`pose/playerCrop.ts`), and it
 * used to place that crop once for the whole clip from five sightings. A
 * session changes sides, and the sightings then disagree and the crop is
 * declined, so the model reads the whole frame and can pick the player on the
 * next court. One crop per minute follows the player; a basket under two
 * minutes keeps the one crop it always had.
 */
export const CROP_SEGMENT_SECONDS = 60

/** The stretch of the clip whose crop a moment is read with. */
export function cropSegment(t: number, duration: number): { index: number; from: number; to: number } {
  const span = Math.max(0, duration)
  if (span <= 2 * CROP_SEGMENT_SECONDS) return { index: 0, from: 0, to: span }
  const last = Math.ceil(span / CROP_SEGMENT_SECONDS) - 1
  const index = Math.min(last, Math.max(0, Math.floor(t / CROP_SEGMENT_SECONDS)))
  return { index, from: index * CROP_SEGMENT_SECONDS, to: Math.min(span, (index + 1) * CROP_SEGMENT_SECONDS) }
}
