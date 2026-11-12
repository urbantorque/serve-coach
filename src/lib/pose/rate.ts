/**
 * How fast a window of video gets read, and the two numbers that decide it.
 *
 * Split out of `extract.ts` rather than left there, and the reason is one line
 * in `detector.test.ts`: a value import of `extract.ts` "would pull
 * `document.createElement` into a Node bundle". `detector.ts` promises in its
 * own header to be DOM-free by construction, and it needs this rate — the whole
 * point of the shared pass is that there is one grid, and a second copy of this
 * arithmetic sitting in the vision layer is exactly the drift `Seconds` exists
 * to prevent.
 *
 * So the rate moved to a file with no imports at all. `extract.ts` re-exports
 * them, so nothing that already reads them from there had to change.
 */

/**
 * The fastest a window is ever sampled.
 *
 * Phone video is almost universally 30 fps, so sampling faster than this
 * re-reads the same decoded frames at roughly 55 ms a piece and learns nothing.
 * Slow-motion footage still gets more samples through the swing, because it
 * spreads the same motion over more seconds of file. Sub-frame timing is
 * recovered analytically instead — see refineExtremum in phases.ts.
 *
 * A ceiling, not the rate a clip is read at: where the file's own frames are
 * known, `readingPlan` steps along them at the fastest rate under this.
 *
 * Exported for the same reason `MAX_FINE_FRAMES` is: the two together decide
 * which of them binds, and `MAX_FINE_FRAMES / FINE_FPS` is the span either side
 * of which a different one does. A test that wants to say where the budget
 * starts binding has to say it in those terms rather than in the number 32,
 * which would go stale the moment either constant moved.
 */
export const FINE_FPS = 32

/**
 * The most frames one serve is ever extracted at.
 *
 * Exported because it is half of the resident cost of an analysis — `frames` is
 * the largest thing an `Analysis` holds in memory — and `footprint.ts` bounds
 * that cost against this rather than against a number copied out of it. Raising
 * it raises the memory budget, and the budget test is where that has to be
 * argued for.
 */
export const MAX_FINE_FRAMES = 120

/** Samples per second a window of this length will be read at. */
export const samplingRateFor = (span: number) =>
  Math.min(FINE_FPS, MAX_FINE_FRAMES / Math.max(0.2, span))

/** What one window's read comes to. */
export interface ReadingPlan {
  /** The moments to seek to, in seconds of file, in order. */
  times: number[]
  /** Samples a second. */
  rate: number
  /** Whether each moment is the middle of a frame of the file, so each sample is its own frame. */
  onFrames: boolean
}

/** How far under the budget's rate a step along the frames may fall before it is not worth taking. */
const LOWEST_STEP_SHARE = 0.75

/**
 * The slowest the serve is walked at, in samples a second of serve.
 *
 * The engine's hand-height smooths are counted in samples and assume about 30 a
 * second. Below this the racket hand's peak goes under the tossing arm: a clip
 * at 15 is read as a left-hander, then refused with "the clip ends before the
 * racket reaches the ball", on 69 takes of 240. The even grid reads each frame
 * twice there, which is no better a measurement and does not trip that.
 */
const LOWEST_WALK = 19

/** What else a read may know about the file. */
export interface ReadingOptions {
  /** Where the file's frames fall against whole multiples of its rate: see `phaseOf`. */
  phase?: number
  /** Seconds of file per second of serve. */
  stretch?: number
  /** The last moment a seek can really reach: a frame starting after it is not walked. */
  seekableTo?: number
  /** The film's first frame's own time, where the browser said it: nothing is read before it. */
  firstFrame?: number
}

/**
 * How far a frame's stamp sits off the nearest whole multiple of the rate, in
 * seconds. A file's first frame need not be at zero, and a walk that assumes it
 * is sits on the frame edges if the offset is near half a frame.
 */
export function phaseOf(frameTime: number, fileFps: number): number {
  const off = frameTime - Math.round(frameTime * fileFps) / fileFps
  return Number.isFinite(off) ? off : 0
}

/**
 * The moments a window of video is read at (H35).
 *
 * THE EVEN GRID BEAT AGAINST THE FILM. A window used to be cut into 31.5 equal
 * steps a second whatever the file held. A 30 fps file has fewer frames than
 * that, so about one sample in 21 was a frame read twice, and the stamps slid up
 * to a frame out of step between repeats, because `currentTime` reports the seek
 * and not the frame. A 60 fps file got about ten 33 ms steps to one 17 ms step
 * that no stamp showed. On a 30 fps file half the variance of contact ahead was
 * this, and 2% was reading 30 a second rather than 32.
 *
 * SO THE READ WALKS THE FILE'S OWN FRAMES: the middle of every n-th one, n being
 * the smallest step under the rate this span may be read at. Every sample is a
 * different frame, the gaps are even, and a 25 fps file stops reading one sample
 * in five twice. The middle, because it is the furthest point from both edges of
 * the frame, and because the moment asked for is then safe to seek again: a seek
 * to a frame's own start lands on the frame before about a third of the time,
 * and the passes that re-read a sample seek these same stamps. The half frame is
 * constant, so it cancels out of every interval.
 *
 * THE MIDDLE ONLY IF THE FRAMES ARE WHERE THEY ARE ASSUMED TO BE. A first frame
 * half a frame off zero puts every moment on an edge, and then a quarter of the
 * samples are repeats and a quarter skip one: contact ahead 8.2, worse than the
 * even grid's 4.7. So `extractFrames` learns the phase first (`phaseOf`) and
 * walks from it. Where it cannot, it walks from zero, which is right on every
 * file tried, and no file made by a phone has been tried.
 *
 * AND NOT BEFORE THE FILM BEGINS. A first frame some way off zero (an empty edit,
 * a composition offset) left moments before it, each read as the first frame
 * again and filed early. For a window that starts at or before the first frame
 * the browser is asked for that frame's own time, and the walk starts there (H45,
 * H46); the phase is read off a later frame, since a first frame need not last as
 * long as the rest. One that lasts a frame and a half or more may still be read
 * twice. Where nothing is told `extractFrames` has no phase either, and the walk
 * starts at zero. A caller that has a phase and no first frame (none in the app)
 * gets no frame starting before zero, a phase a couple of microseconds under zero
 * taken as the browser rounding a frame's time, not a frame that began before the
 * film.
 *
 * It costs nothing a sample and one sample in sixteen: 81 reads for 2.7 s, not 86.
 *
 * WHERE THE STEP CANNOT BE TAKEN. Where the budget would make it fall too far (a
 * 30 fps clip of more than four seconds could only be walked at 15 a second, half
 * what the budget can pay for, and a third of such takes were refused) or under
 * `LOWEST_WALK`, the read takes the grid's count instead, spread evenly over the
 * frames the window holds, each sample in the middle of a frame of its own. Gaps
 * of one frame and now and then two, every stamp true. The plain grid there slid against the film. Over the six Bath serves from
 * two placements and the rig, the serve anywhere in the clip, clean serves were
 * told a fault on 52 takes of 7,200 across a 30 fps clip of 4.1 and 4.4 s, a 60
 * fps one of 4.1 s and the blind window at 25 and 30 fps, most of them a toss
 * called wandering from behind; on their own frames, 14: eleven a collapse called
 * from behind, three a contact called behind from the guide, on the blind window
 * at 30 fps. That is the cost: there contact ahead reads 2.7 times the table, not
 * 2.1, and on a clip the budget cannot walk one frame more of clip can move the
 * chain's timings by about their noise.
 *
 * WHERE THE EVEN GRID STAYS. Where nobody knows the file's rate (a WebM, or a
 * recording whose camera did not say) there are no frames to walk. And where the
 * file has fewer frames than the grid has moments, under `LOWEST_WALK`: the grid
 * reads each frame twice there, which is no better a measurement, and the
 * engine's smooths, counted in samples, need the count.
 *
 * `fileFps` is a mean. On a variable-rate file the moments drift against the
 * frames a little, which measured no worse than the even grid: 5 repeats in 143
 * on a clip with dropped frames, against 12.
 */
export function readingPlan(start: number, end: number, fileFps?: number, o: ReadingOptions = {}): ReadingPlan {
  const span = Math.max(0.2, end - start)
  const rate = samplingRateFor(span)
  const even = (): ReadingPlan => {
    const count = Math.max(8, Math.round(span * rate))
    // Not before a first frame the browser told, here either (H46).
    const from = Math.max(start, o.firstFrame ?? start)
    const width = Math.max(0, start + span - from)
    return { times: Array.from({ length: count }, (_, i) => from + (width * i) / (count - 1)), rate, onFrames: false }
  }
  if (!fileFps || !Number.isFinite(fileFps) || fileFps <= 0) return even()
  const phase = o.phase ?? 0
  // A frame is kept while the clamped seek still lands on it: its start, not its middle.
  const stop = Math.min(end, o.seekableTo === undefined ? end : o.seekableTo + 0.5 / fileFps - 1e-3)
  // Nothing before the film's first frame. Told, the walk starts on it; untold, no
  // frame starts before zero, a phase within two microseconds under it being
  // rounding (H45). The app tells it or walks from zero with no phase at all.
  const lowest = o.firstFrame !== undefined ? Math.round((o.firstFrame - phase) * fileFps) : phase < -2e-6 ? 1 : 0
  const first = Math.max(lowest, Math.ceil((start - phase) * fileFps - 0.5))
  const stride = Math.max(1, Math.ceil(fileFps / rate - 1e-6))
  const stepped = fileFps / stride
  const stepTaken = !(stride > 1 && stepped < LOWEST_STEP_SHARE * rate) && stepped * (o.stretch ?? 1) >= LOWEST_WALK
  if (stepTaken) {
    const count = Math.floor(((stop - phase - (first + 0.5) / fileFps) * fileFps) / stride + 1e-9) + 1
    if (count < 8 || count > MAX_FINE_FRAMES) return even()
    return {
      times: Array.from({ length: count }, (_, i) => (first + i * stride + 0.5) / fileFps + phase),
      rate: stepped,
      onFrames: true,
    }
  }
  // The grid's count, spread over the frames the window holds, each sample a
  // frame of its own. Only where there are at least as many frames as moments.
  const grid = even()
  const frames = Math.floor((stop - phase) * fileFps - 0.5 + 1e-9) - first + 1
  const n = grid.times.length
  if (frames < n) return grid
  return {
    times: Array.from({ length: n }, (_, i) => (first + Math.round((i * (frames - 1)) / (n - 1)) + 0.5) / fileFps + phase),
    rate,
    onFrames: true,
  }
}
