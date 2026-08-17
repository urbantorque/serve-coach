import {
  readBitmaps,
  captureThumbnails,
  extractFrames,
  loadVideo,
  preflight,
  scanForServes,
  type ExtractProgress,
} from '../pose/extract'
import { framingIssues } from './framingIssues'
import type { ServeType } from '../storage/prefs'
import {
  findCandidates,
  flightHeightAt,
  flightXAt,
  levelFlight,
  summariseToss,
  trackBall,
  type BallFlight,
} from '../vision/ballTrack'
import { engineResident, isCachedOffline, loadEngine, type EngineProgress } from '../pose/poseEngine'
import { drawSkeleton, fitContain } from '../pose/skeleton'
import { FUNDAMENTALS } from './coaching'
import { SOFT_MEASUREMENT } from './confidence'
import {
  IMPLAUSIBLE_JUMP,
  LM,
  clamp,
  keyVisibility,
  maxTrackingJump,
  mean,
  median,
  statusOf,
  weightedScore,
} from './geometry'
import {
  buildConsistency,
  pairStills,
  servesInGap,
  type Consistency,
  type ServePairFrames,
} from './consistency'
import { diagnose } from './diagnose'
import { capturedSamples } from './kalman'
import { measure } from './metrics'
import {
  NOTABLE_ROLL,
  assessSpatial,
  levelFrames,
  levelPivot,
  unlevelFrames,
  type Tilt,
} from './spatial'
import { assessResilience, triage } from './triage'
import { swingTrack } from '../storage/poseTrack'
import { causalFocus } from './verdict'
import { cue } from './voice'
import { buildPhases, detectServe, type Skeleton } from './phases'
import {
  NotAServeError,
  SCORING_VERSION,
  type Analysis,
  type Frame,
  type Fundamental,
  type Quality,
} from './types'

/**
 * Wall clock, where there is one.
 *
 * `performance.now` in a browser; `Date.now` in the test runner, which has the
 * same shape and worse resolution than this needs. The same fallback
 * `diagnose.ts` already makes for the same reason.
 */
const clock = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

export type Step = 'engine' | 'reading' | 'scanning' | 'tracking' | 'measuring' | 'done'

export interface AnalyzeProgress {
  step: Step
  ratio: number
  detail?: string
}

export interface AnalyzeOptions {
  videoUrl: string
  fileName: string
  onProgress?: (p: AnalyzeProgress) => void
  signal?: AbortSignal
  /** Overrides the automatic guess when the player says we got it wrong. */
  handedness?: 'right' | 'left'
  /** Which serve in the clip to analyse. Defaults to the last one found. */
  serveIndex?: number
  /**
   * Three things a basket sweep leaves out, as three options.
   *
   * They were one flag called `skipThumbnails`, and it was true of a third of
   * what it did. Set on the sweep, it also turned off the framing preflight and
   * the ball pass — so the only way to get keyframe stills out of a swept serve
   * was to also pay for a second pass over the video to find the ball, which is
   * the most expensive optional thing in here. That is why the serves in a
   * basket have no stills, and it is not a decision anybody took about stills.
   *
   * The costs are nothing like each other and neither is the case for skipping
   * them, so they are named separately:
   *
   *   · `skipFramingCheck` — a handful of sampled frames. Skipped in a sweep
   *     because the clip already came through the check once, on the serve the
   *     sweep was launched from, and refusing serve four of a clip already
   *     being reported on would be the app arguing with itself.
   *   · `skipBall` — a whole second pass over the video, per serve. This is the
   *     expensive one, and the comparison only uses measurements every serve
   *     shares, which the toss reading is not.
   *   · `skipThumbnails` — six seeks. Genuinely six seeks.
   */
  skipFramingCheck?: boolean
  skipBall?: boolean
  skipThumbnails?: boolean
  /** Serve times already located, so the clip is not scanned again per serve. */
  knownServeTimes?: number[]
  /**
   * Where the serves in this clip turned out to be, reported as soon as they are
   * known so the caller can hand them back as `knownServeTimes` next time.
   *
   * Serve positions are a property of the clip, not of the serve being read, and
   * on a long clip locating them is most of the wait — the scan covers the whole
   * video where the measurement covers two seconds of it. A caller that drops
   * them pays the entire scan again the moment the player taps a serve chip.
   */
  onServesLocated?: (times: number[]) => void
  /** Which serve this is meant to be, which shifts a handful of target bands. */
  serveType?: ServeType
  /**
   * The player's rating, which decides what the diagnostic pass asks of them.
   *
   * Absent is a supported answer, not a missing one: the pass estimates a rung
   * from the serve itself. Passing a stated rating only makes the estimate
   * unnecessary.
   */
  tier?: number
  /**
   * Carry the pose output out on a refusal, so a rejected clip can be filed as
   * a ground-truth fixture. Dev builds only — see `NotAServeError.capture`.
   */
  captureOnFailure?: boolean
}

/**
 * A byte count as megabytes, in whatever the reader's own locale writes a
 * decimal point as.
 *
 * This is the one number the app shows a player with a fraction in it — it goes
 * straight into the analysing screen's own status line, "Downloading the coach ·
 * 4.5 MB of 19.0 MB" — and it was written with `toFixed`, which always returns a
 * period. That is a fact about JavaScript rather than about the reader: every
 * date in this app already defers to the browser (`toLocaleDateString(undefined,
 * …)`), and the hand-speed reading was moved onto `Intl.NumberFormat` for
 * exactly this reason before the speed panel was withdrawn. This one was missed
 * because it does not look like a measurement — but a player in France reading
 * "4.5 MB" where their phone writes "4,5" is the same small wrongness, on the
 * first screen a first run ever shows.
 *
 * Exported so the suite can read it without a browser; nothing else calls it.
 */
export const megabytes = (n: number): string =>
  `${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n / 1e6)} MB`

/** Sweeping more than this many serves costs more time than the answer is worth. */
export const MAX_CONSISTENCY_SERVES = 6

/** Past this, most of the wait is spent locating serves rather than measuring one. */
export const LONG_CLIP_SECONDS = 45

/**
 * The blur at which the player is told their swing numbers are rough.
 *
 * Below the point where `blurTrust` has taken a swing measurement under
 * `SOFT_MEASUREMENT`, so the sentence arrives with, or just before, the hedged
 * numbers it explains rather than after them.
 */
const BLUR_WORTH_SAYING = 0.4

/**
 * Which serves in a clip a sweep covers.
 *
 * The *last* `total` serves, not the first. On a clip with more serves than the
 * cap, sweeping from zero measures the warm-ups and leaves out the serve the
 * report on screen is about — so the comparison the player asked for from that
 * report would not contain it. The end of a basket is also the half worth
 * comparing: it is what they were hitting once they had settled.
 *
 * Exported because the UI has to label the serves it is about to measure, and
 * it has to label them with the numbers the player would count in their own
 * clip. Deriving that window a second time in the screen is how the labels and
 * the measurements end up disagreeing about which serve is which.
 */
export function sweepWindow(count: number): { first: number; total: number } {
  const total = Math.min(count, MAX_CONSISTENCY_SERVES)
  return { first: Math.max(0, count - total), total }
}

/** One serve's outcome, handed over the moment it is known. */
export interface SweepServe {
  /**
   * Which serve in the clip this was, one-based — the way the player counts
   * them watching it back, not its place in the results list. The two disagree
   * whenever the sweep skips an unreadable serve or covers only the last few of
   * a long basket, which is most baskets. `Consistency.serveNumbers` carries the
   * same number for the same reason.
   */
  number: number
  /** The measurement, or nothing when this serve could not be read. */
  analysis?: Analysis
}

/**
 * What the sweep loop itself produces: serves, and how it ended.
 *
 * Separate from `Sweep` because `sweepServes` is only the loop — it has no
 * video, no decoder and no opinion about the comparison, which is exactly why
 * it was split out and is the one part of this file a test can drive. Claiming
 * to return a `Sweep` would have it promising a `consistency` it is in no
 * position to compute.
 */
export interface SweepRun {
  /** Every serve that was measured, in the order they were hit. */
  serves: Analysis[]
  /**
   * How many serves were read to a conclusion — measured, or looked at and
   * found unreadable. This is what `buildConsistency` wants as its `attempted`,
   * and it deliberately excludes a serve the player interrupted: `attempted`
   * minus measured is reported to them as "too unclear to measure", and a serve
   * that was cancelled halfway through was not unclear. Nothing finished
   * looking at it.
   */
  attempted: number
  /** Whether the player stopped it early. */
  cancelled: boolean
}

/** The loop's result, plus what only a function holding the video can add. */
export interface Sweep extends SweepRun {
  /**
   * The comparison those serves came to, computed by the sweep rather than by
   * the caller.
   *
   * It used to be the caller's job, and it moved when the sweep stopped
   * capturing keyframe stills for every serve: deciding which two serves are
   * worth going back to the video for *is* this calculation, and it has to
   * happen while the video element is still open, which is inside
   * `analyzeAllServes` and nowhere else. Two places computing it from the same
   * serves would be `sweepWindow`'s problem again — a number derived twice,
   * drifting once.
   *
   * `undefined` when fewer than two serves were read, which is not an error;
   * see `buildConsistency`.
   */
  consistency: Consistency | undefined
  /**
   * The best serve's keyframes beside the worst serve's, when there are two to
   * compare and the stills could be captured.
   *
   * Only those two serves have stills at all — see `captureServeStills`. The
   * other four in a full basket are measured, compared, and never pictured,
   * which is what they already were: the sweep captured thirty-six stills and
   * `pairStills` showed twelve of them.
   */
  pair: ServePairFrames | undefined
}

export interface SweepOptions {
  /** Serves in the clip. The sweep covers at most `MAX_CONSISTENCY_SERVES` of them. */
  count: number
  signal?: AbortSignal
  /**
   * Called as each serve settles, before the sweep has finished.
   *
   * The sweep is the most expensive thing this app computes — up to six passes
   * over the video — and every one of those results existed inside this loop
   * seconds before the player saw any of them. Streaming them out is what lets
   * the screen fill in as it goes, and what lets a stopped sweep be worth the
   * time already spent on it.
   */
  onServe?: (serve: SweepServe) => void
}

/**
 * The sweep loop itself, with the video work handed in.
 *
 * Split from `analyzeAllServes` because everything interesting here — what
 * streams out and when, what an unreadable serve costs, what survives
 * cancellation — is decided by this loop and none of it needs a decoder, a DOM
 * or a real clip to exercise. Left inline it was reachable only from a browser
 * with a video in it, which is to say it was never tested at all.
 *
 * `measure` is handed the serve's index in the clip plus its position in this
 * sweep, so the caller's progress text counts "serve 2 of 4" from the same
 * window this loop is walking rather than working it out again.
 */
export async function sweepServes(
  opts: SweepOptions,
  measure: (serveIndex: number, position: number, total: number) => Promise<Analysis>,
): Promise<SweepRun> {
  const { first, total } = sweepWindow(opts.count)
  const serves: Analysis[] = []
  let attempted = 0
  let cancelled = false

  for (let n = 0; n < total; n++) {
    if (opts.signal?.aborted) {
      cancelled = true
      break
    }
    try {
      const analysis = await measure(first + n, n, total)
      attempted++
      serves.push(analysis)
      opts.onServe?.({ number: (analysis.serves?.index ?? first + n) + 1, analysis })
    } catch (err) {
      // Stopping is not a verdict on the serve that was in flight. It is
      // dropped without being counted, so the panel never reports a serve
      // nobody finished reading as one that was too unclear to read.
      if (isCancelled(err)) {
        cancelled = true
        break
      }
      // One unreadable serve should not cost the player the other five. It is
      // counted as attempted, because something did look at it and fail.
      attempted++
      opts.onServe?.({ number: first + n + 1 })
    }
  }

  return { serves, attempted, cancelled }
}

/**
 * Measure every serve in a clip so they can be compared against each other.
 *
 * Each serve costs a full pass over its own couple of seconds, so this is
 * deliberately something the player asks for rather than something that happens
 * to them. A serve that cannot be read — a mishit, someone walking through
 * frame — is skipped rather than allowed to sink the whole sweep.
 *
 * Returns what it managed rather than throwing when the player stops it. A
 * sweep four serves into six used to hand back nothing at all on cancellation,
 * which meant the one control the player had over the most expensive screen in
 * the app was also the control that threw every completed measurement away.
 * Four serves out of six still answers the question they asked.
 *
 * How long that is in seconds, this tree no longer has to guess. Every pass
 * now records what it cost on `Analysis.cost` — see that field, and R46 in
 * `NEXT.md` for why "half a minute" was never a measurement. A sweep is one
 * pass per serve, so a basket's cost is the sum of its serves' own recorded
 * numbers rather than a figure invented for a comment.
 *
 * What is still unmeasured is what those numbers are *on a phone*, which no
 * amount of arithmetic here supplies: the only sweeps ever run in this repo
 * were against a fake `measure` that returns immediately. `COURT-CHECK.md`
 * step 8 is where that is answered, and it can now be answered by reading a
 * field rather than by holding a stopwatch.
 */
export async function analyzeAllServes(
  opts: AnalyzeOptions & SweepOptions,
): Promise<Sweep> {
  /*
   * One element for the whole sweep — the locating scan and every serve after it.
   *
   * Each pass used to create its own, which meant seven decoder set-ups over one
   * blob on a phone that is also running pose estimation: the file is demuxed
   * again, a hardware decoder session is acquired again, and the first seek of
   * each pass waits on all of it. None of that work differs between passes,
   * because it is the same clip every time.
   */
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'

  try {
    // Locate every serve once up front. Each analysis below would otherwise
    // repeat this scan over the entire clip, which is by far the most expensive
    // thing here — the scan covers the whole video, the extraction only covers a
    // couple of seconds of it. Once for the whole app, in fact: the report this
    // sweep was launched from has already scanned this clip, so the caller
    // hands the answer back and nobody scans at all.
    const knownServeTimes = opts.knownServeTimes ?? (await locateServes(opts, video))
    if (knownServeTimes?.length) opts.onServesLocated?.(knownServeTimes)

    const swept = await sweepServes(opts, (serveIndex, position, total) =>
      analyzeServe(
        {
          ...opts,
          serveIndex,
          /*
           * All three skipped, and the third one is new.
           *
           * The preflight is a check this clip already passed on the serve the
           * sweep was launched from. The ball is a whole second pass over the
           * video per serve, for two measurements the comparison does not use.
           *
           * The stills used to be kept, on the reasoning that they are what
           * lets the best serve be shown beside the worst as pictures rather
           * than as two sentences. True, and it bought them for every serve to
           * show them for two: six seeks and six JPEG encodes each, thirty-six
           * across a full basket, of which `pairStills` reads twelve. The other
           * twenty-four were decoded, drawn, encoded and dropped.
           *
           * So they are skipped here and captured below, once the comparison
           * has said which two serves it names. Same twelve pictures on screen,
           * a third of the seeks.
           */
          skipFramingCheck: true,
          skipBall: true,
          skipThumbnails: true,
          knownServeTimes,
          onProgress: (p) =>
            opts.onProgress?.({
              ...p,
              detail: `Serve ${position + 1} of ${total} · ${p.detail ?? 'working'}`,
            }),
        },
        video,
      ),
    )

    /*
     * The comparison, and then pictures for the two serves it named.
     *
     * Computed here rather than by the caller because this is the last moment
     * the video is open — the `finally` below detaches it — and going back for
     * a still needs a decoder. It is also the only place that can be sure the
     * serves and the comparison agree about which is which.
     *
     * A cancelled sweep gets no stills. The player has stopped this and is
     * looking at a report already; spending twelve more seeks to decorate a
     * comparison they interrupted is the cost this whole change exists to stop
     * paying. `buildConsistency` still runs, so a stopped sweep is still
     * compared and still filed — see `sweepServes`, which is careful that four
     * measured serves out of six remain worth having.
     */
    const consistency = buildConsistency(swept.serves, swept.attempted)
    let pair: ServePairFrames | undefined
    if (consistency?.gap && !opts.signal?.aborted) {
      opts.onProgress?.({ step: 'measuring', ratio: 0.9, detail: 'Capturing your key frames' })
      const named = servesInGap(swept.serves, consistency.gap)
      if (named) {
        const aspect = video.videoWidth / Math.max(1, video.videoHeight)
        for (const serve of named) {
          await captureServeStills(video, serve, aspect, opts.signal)
        }
        pair = pairStills(swept.serves, consistency.gap)
      }
    }

    return { ...swept, consistency, pair }
  } catch (err) {
    // Cancelled while locating the serves, before any of them was measured.
    // There is nothing to hand back, but there is also nothing wrong — the
    // player asked for it to stop and it stopped.
    if (!isCancelled(err)) throw err
    return { serves: [], attempted: 0, cancelled: true, consistency: undefined, pair: undefined }
  } finally {
    // Runs on every exit, cancellation included. Leaving the source attached
    // holds a hardware decoder session open for a clip nobody is reading.
    video.removeAttribute('src')
    video.load()
  }
}

/** One scan of the clip. Borrows the caller's element when given one. */
async function locateServes(
  opts: AnalyzeOptions,
  shared?: HTMLVideoElement,
): Promise<number[] | undefined> {
  const video = shared ?? document.createElement('video')
  video.crossOrigin = 'anonymous'
  try {
    const landmarker = await loadEngine()
    await loadVideo(video, opts.videoUrl)
    opts.onProgress?.({ step: 'scanning', ratio: 0, detail: 'Finding every serve' })
    return await scanForServes(video, landmarker, {
      signal: opts.signal,
      onProgress: (ratio) =>
        opts.onProgress?.({ step: 'scanning', ratio, detail: 'Finding every serve' }),
    })
  } catch (err) {
    if (isCancelled(err)) throw err
    // Fall back to letting each analysis scan for itself.
    return undefined
  } finally {
    // A borrowed element belongs to the caller, which is about to read the same
    // clip several more times through it. Detaching here would make the saving
    // the loan exists for impossible.
    if (!shared) {
      video.removeAttribute('src')
      video.load()
    }
  }
}

/**
 * Which framing problems are worth stopping for, and which are worth a caveat.
 *
 * A clip can fail in one of three ways, and the app has separate machinery for
 * each. Deciding which one a problem belongs in is the whole job here:
 *
 *   1. REFUSE — there is nothing to measure at all. A thrown error, a terminal
 *      screen, no numbers, because there are none. This tier is small on
 *      purpose: it should hold only "no player", "no pixels", "no swing".
 *   2. DISTRUST — measurable, but the numbers may be wrong enough to mislead.
 *      `triage` marks the analysis `rejected`, the report leads with the reason
 *      and offers to show the numbers anyway, and nothing is filed to history.
 *      The player is never left with a dead end.
 *   3. HEDGE — readable with caveats. The analysis runs, `metricConfidence`
 *      discounts whatever the problem touches, and anything below
 *      `SOFT_MEASUREMENT` is marked on screen and barred from the headline.
 *
 * This gate is the earliest of the three and runs before a single frame has
 * been tracked, so anything it stops for can never reach the other two. That is
 * why it now stops for almost nothing.
 *
 * It previously refused three ways, and two of them were shadowing softer
 * checks further down that were never given the chance to fire. `body-unclear`
 * is the same statistic `triage` rejects at `LIMITS.visibility`, which offers
 * the override; and a player small in frame breaks no measurement here, because
 * every one of them is a ratio of that player's own body height rather than of
 * anything in the room. Both now fall through to be hedged or distrusted on the
 * evidence rather than guessed at from six preview frames.
 *
 * Head *and* feet both outside the shot is the one that still stops: standing
 * height falls back to the torso, but the ground line is derived from the head,
 * so with neither end visible the ruler every height is measured against has no
 * fixed point. Numbers would still come out. They would be wrong in a way
 * nothing downstream could detect, which is the one failure this app refuses to
 * ship. Either end alone is survivable and always was.
 */
export function blockingFramingIssue(issues: string[]): NotAServeError | undefined {
  if (issues.includes('nobody-visible')) {
    return new NotAServeError('I found no player in that clip.', [
      'Put one person fully in frame, well lit.',
      'Stand the phone side-on, four metres back, level with the baseline.',
      'Fit head to feet in the shot, with room above the racket.',
    ])
  }
  if (issues.includes('feet-cropped') && issues.includes('head-cropped')) {
    return new NotAServeError('Your body does not fit the shot.', [
      'Turn the phone upright and step back until head and feet both fit.',
      'Every height uses your own body as the ruler, so show both ends.',
    ])
  }
  // No wrist ever found, so there is no swing here to measure whatever else is
  // in shot. Almost always distance, and said that way when the framing agrees,
  // because "move closer" is something the player can act on and "I could not
  // see your hand" on its own sounds like a fault in the app.
  //
  // Worth saying plainly why this is a refusal when standing small in frame is
  // not: a clip filmed from the far baseline still produces a full set of
  // numbers, assembled from a hand the model placed by inference. They are not
  // rough, they are invented, and nothing downstream can tell the difference —
  // which is the one failure this app will not ship.
  if (issues.includes('hands-unseen')) {
    return new NotAServeError(
      issues.includes('too-far-away')
        ? 'You stand too far from the camera to measure.'
        : 'I could not see your racket hand.',
      [
        'Move the phone to about four metres, so your body fills the frame height.',
        'Every swing measurement comes off your racket hand, so it has to be visible.',
      ],
    )
  }
  return undefined
}

/**
 * Find the tossed ball, or return nothing and let the report do without it.
 *
 * A second pass over the video rather than pixel capture during the main one:
 * where the ball is worth looking for is the toss-to-contact window, and that is
 * not known until the keyframes have been found. Reading pixels for every frame
 * up front to avoid this costs tens of megabytes on a phone to keep frames that
 * are then thrown away, for a couple of dozen seeks saved.
 *
 * Everything here is best-effort. The ball is small, sometimes against a
 * cluttered background, and sometimes simply out of frame above the player —
 * so failing to find it is an ordinary outcome, not an error, and it costs the
 * player two measurements rather than their report.
 */
async function findBall(
  video: HTMLVideoElement,
  frames: Frame[],
  skel: Skeleton,
  signal?: AbortSignal,
): Promise<BallFlight | undefined> {
  const { keys, bodyHeight } = skel
  // From a little before release — the ball is in the hand and already moving —
  // to just past contact, so the apex is bracketed on both sides even for a
  // player who hits very late.
  const from = Math.max(0, keys.toss - 2)
  const to = Math.min(frames.length - 1, keys.contact + 2)
  if (to - from < 4 || !(bodyHeight > 0)) return undefined

  const times = frames.slice(from, to + 1).map((f) => f.t)

  // The ball is above the player's shoulders for essentially all of its flight,
  // so everything below that line is excluded — which removes the player's kit,
  // their moving limbs and the court surface in one go, and those are what a
  // colour-and-motion detector would otherwise trip over.
  //
  // Read off the pose, so it is known before a single pixel is fetched.
  const shoulderY = Math.min(
    ...frames
      .slice(from, to + 1)
      .map((f) => Math.min(f.image[LM.leftShoulder].y, f.image[LM.rightShoulder].y)),
  )
  const belowY = Math.min(1, shoulderY + 0.05)

  // Detected as the pixels arrive rather than after all of them have. The
  // candidates for a frame are a few numbers; the frame itself is half a
  // megabyte, and the window is dozens of frames long.
  let perFrame: { t: number; candidates: ReturnType<typeof findCandidates> }[]
  try {
    perFrame = await readBitmaps(
      video,
      times,
      (frame, previous, t) => ({ t, candidates: findCandidates(frame, previous, { belowY }) }),
      { signal },
    )
  } catch {
    return undefined
  }
  if (signal?.aborted || perFrame.length < 5) return undefined

  // Gravity in frame-normalised units. The player's own measured height is the
  // only real-world scale the pipeline has: `bodyHeight` image units span about
  // 1.78 m, so a metre is bodyHeight / 1.78 of the frame.
  const expectedGravity = (9.81 * bodyHeight) / 1.78

  const flight = trackBall(perFrame, { expectedGravity })
  // A confident fit still has to describe a ball that went up and came down
  // somewhere near the player rather than a passing bird.
  if (!flight || flight.confidence < 0.45) return undefined
  return flight
}

/**
 * How often progress is allowed to reach the screen, in milliseconds.
 *
 * Ten times a second, which is faster than anybody reads a percentage and far
 * slower than the pipeline reports one. A long clip's locating scan calls
 * `onProgress` up to `SCAN_BUDGET` times and the tracking pass once per sampled
 * frame — around 540 in total — and in this app every one of those is a React
 * render of the whole tree, on the same thread that is running the pose model
 * between them. The renders are cheap individually; competing with the model for
 * a phone's main thread is not, and it is the same argument `MAX_POSE_DUTY`
 * makes in `FramingCheck` about the live preview.
 */
const PROGRESS_INTERVAL_MS = 100

/**
 * Rate-limit progress without ever losing the part that matters.
 *
 * A plain throttle would be wrong here in two ways, and both are the difference
 * between a smooth bar and a stuck one. The final call — `{ step: 'done' }` — is
 * the one that must always land, or the screen keeps the last percentage it
 * happened to be shown. And a change of *step* is not a finer-grained update of
 * the same thing, it is a new sentence on screen ("Finding the serve" →
 * "Tracking your body"), so it goes through immediately whatever the clock says.
 *
 * Everything else is dropped rather than queued: a progress report is only about
 * now, and a backlog of them delivered late is worse than none.
 */
export function throttleProgress(
  to: (p: AnalyzeProgress) => void,
  intervalMs = PROGRESS_INTERVAL_MS,
  now: () => number = clock,
): (p: AnalyzeProgress) => void {
  let last = -Infinity
  let lastStep: Step | undefined
  return (p) => {
    const t = now()
    if (p.step === lastStep && p.step !== 'done' && t - last < intervalMs) return
    lastStep = p.step
    last = t
    to(p)
  }
}

const isCancelled = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as Error).name === 'Cancelled'

export function assessQuality(
  frames: Frame[],
  skel: Skeleton,
  sampledFps: number,
  /** How smeared the racket hand's track is, 0–1, from `blurOf`. */
  blur = 0,
): Quality {
  const win = frames.slice(skel.keys.ready, skel.keys.finish + 1)
  const visibility = mean(win.map(keyVisibility))
  // Counted rather than subtracted, for the reason given in `capturedSamples`:
  // a frame bridged over a lost detection sits in the array but was never filmed.
  const swingSamples = capturedSamples(frames, skel.keys.drop, skel.keys.contact)

  const spanRatio = skel.shoulderWidth / skel.bodyHeight
  const view: Quality['view'] = spanRatio > 0.17 ? 'front-back' : spanRatio < 0.1 ? 'side' : 'angled'

  const anklesSeen = median(
    win.map((fr) => Math.min(fr.image[LM.leftAnkle].visibility, fr.image[LM.rightAnkle].visibility)),
  )

  // Did the tracking stay on one person? A hand-off to somebody else in shot
  // produces a report assembled from two bodies, and every other signal here
  // looks entirely healthy while it happens.
  const jump = maxTrackingJump(frames, skel.keys.ready, skel.keys.finish, skel.bodyHeight)
  const switched = jump > IMPLAUSIBLE_JUMP

  const warnings: string[] = []
  if (switched) {
    warnings.push(
      cue('Tracking jumped to another body mid-serve. Film with only the player in frame; this report may mix two people.'),
    )
  }
  if (visibility < 0.65) {
    warnings.push(cue('Parts of your body blurred out. Add light or find a plainer background.'))
  }
  // Said separately from the visibility line above, because they are different
  // failures and only one of them is fixed by more light. A smeared racket hand
  // comes back at full visibility — the model returns a wrist for every frame
  // whether or not it can see one — so this is the case where the tracking looks
  // healthy and the coordinates are guesses. Named for the arm it was measured
  // on, since that is what the softened numbers on the report will be.
  if (blur >= BLUR_WORTH_SAYING) {
    warnings.push(
      cue('Your racket arm moved faster than the camera could follow, so the swing numbers are rough.'),
    )
  }
  // Four samples across a ~150 ms drop-to-contact leaves ±30 ms of quantisation
  // on a measurement whose whole target band is only 120 ms wide, so below that
  // the swing timing is genuinely soft and the player should be told.
  if (swingSamples < 4) {
    warnings.push(cue('Your camera caught few frames through the swing. Film in slow motion to sharpen the swing numbers.'))
  }
  if (anklesSeen < 0.5) {
    warnings.push(cue('Your feet sat outside the frame, so heights are estimated. Step back until your whole body fits.'))
  }
  if (skel.handednessConfidence < 0.35) {
    warnings.push(cue('I could not lock which hand holds your racket. Check the badge below and switch it if wrong.'))
  }
  // The player told us which hand, and the clip disagrees — confidently. Almost
  // always the wrong clip, somebody else serving, or a front-facing camera that
  // mirrored the picture. Saying so is far more use than silently measuring the
  // wrong arm and reporting a serve with no racket drop in it.
  if (
    skel.racket !== skel.detectedRacket &&
    skel.detectionConfidence > 0.6
  ) {
    warnings.push(
      cue(`You set ${skel.racket}-handed, but this clip looks ${skel.detectedRacket}-handed. Check the badge, or refilm without the mirrored front camera.`),
    )
  }

  const confidence = clamp(
    (0.42 * clamp((visibility - 0.35) / 0.5, 0, 1) +
      0.24 * clamp(swingSamples / 5, 0, 1) +
      0.18 * clamp(anklesSeen / 0.7, 0, 1) +
      0.16 * clamp(skel.handednessConfidence, 0, 1)) *
      // A subject switch is not a degree of softness, it is a different failure:
      // some of these measurements are of somebody else. Halving the whole figure
      // rather than adding another weighted term, because no amount of good
      // lighting and frame rate makes a report built from two bodies trustworthy.
      (switched ? 0.5 : 1) *
      // Blur multiplies rather than joining the weighted sum, for the same
      // reason: the four terms above all ask how well the body was *seen*, and a
      // smeared hand scores full marks on every one of them. It is the question
      // of whether the coordinates were measured or inferred, and it applies to
      // whatever the other four concluded.
      clamp(1 - 0.5 * blur, 0.4, 1),
    0.05,
    1,
  )

  return { confidence, warnings, view, sampledFps, swingSamples }
}

/**
 * The single thing most worth fixing, and the drill for it.
 *
 * Ranked over every measurement rather than by finding the weakest *area*
 * first. An area score is an average, so the weakest area is not reliably where
 * the worst fault lives — a player with rigid legs could be told to work on
 * their tempo because Rhythm averaged slightly lower than Loading, while the
 * knee bend that actually cost them the serve went unmentioned. The drill comes
 * from whichever fundamental owns the losing measurement.
 */
export function pickFocus(fundamentals: Fundamental[]): Analysis['focus'] {
  const all = fundamentals.flatMap((f) => f.metrics.map((metric) => ({ metric, area: f })))

  // Advice is only as good as the measurement under it. Sending a player away to
  // rebuild their knee bend on the strength of a number the app has already
  // flagged as approximate is worse than saying nothing about it — so soft
  // measurements are set aside here, and only considered if nothing else is
  // left to talk about.
  const trusted = all.filter(({ metric }) => (metric.confidence ?? 1) >= SOFT_MEASUREMENT)
  const ranked = (trusted.length ? trusted : all).sort((a, b) => a.metric.score - b.metric.score)

  const worst = ranked[0]
  if (!worst) {
    return {
      title: 'Keep grooving this serve',
      why: cue('Nothing here holds you back.'),
      drill: fundamentals[0].drill,
    }
  }

  if (worst.metric.score >= 85) {
    return {
      title: 'Keep grooving this serve',
      why: cue('Nothing here holds you back. Film again in a few sessions and check it held.'),
      drill: worst.area.drill,
    }
  }

  // The drill comes from the losing measurement when it carries its own — one
  // fault, one exercise — and falls back to the area's broader session only for
  // the handful of measurements that share a correction.
  return {
    title: worst.metric.label,
    why: worst.metric.fix ?? worst.metric.insight,
    drill: worst.metric.drill ?? worst.area.drill,
  }
}

/**
 * Re-score an analysis against a different serve type, without touching the video.
 *
 * Changing the serve type moves a handful of target bands and nothing else — the
 * landmarks, the keyframes and every measured value are identical. Running the
 * whole pipeline again to discover that would cost the player twenty or thirty
 * seconds and several hundred video seeks to arrive at the same numbers with
 * different targets under them. This is arithmetic on data already in memory,
 * and takes about a millisecond.
 *
 * Returns undefined if the frames are gone — a report reopened from storage has
 * its numbers but not the landmarks they came from, so it has to be re-filmed
 * or re-read rather than re-scored.
 */
export function rescore(analysis: Analysis, serveType: ServeType): Analysis | undefined {
  if (!analysis.frames?.length) return undefined

  let skel: Skeleton
  try {
    skel = detectServe(analysis.frames, analysis.quality.sampledFps, analysis.handedness)
  } catch {
    return undefined
  }

  // Recovered here rather than carried on the report: the camera did not move
  // between a flat scoring and a kick one, and reports saved before this mattered
  // have no such field to read. It costs a handful of frames' arithmetic, and
  // omitting it would quietly un-hedge the depth measurements the moment a player
  // changed the serve type on a clip filmed dead side-on. The same argument, and
  // the same trap, applies to blur: the swing was as smeared under one serve type
  // as under the other.
  const resilience = assessResilience(analysis.frames, skel)
  const depthUnreliable = resilience.spatial.depth_unreliable

  const fundamentals = measure(analysis.frames, skel, analysis.quality.view === 'side', {
    ball: analysis.ball,
    serveType,
    confidence: {
      frames: analysis.frames,
      skel,
      swingSamples: analysis.quality.swingSamples,
      view: analysis.quality.view,
      ballConfidence: analysis.ball?.confidence,
      depthUnreliable,
      blur: resilience.blur,
    },
  })

  const overall = weightedScore(
    fundamentals.map((f) => ({ score: f.score, weight: FUNDAMENTALS[f.id].weight })),
  )

  // The keyframes and the tracked ball are unchanged by a serve-type rescore —
  // only the target bands moved — so this recomputes to the same values every
  // time. Redone here anyway rather than carried over from `analysis`, so a
  // report reopened from before this field existed still gets one.
  const tossFlight = analysis.ball
    ? summariseToss(analysis.ball, analysis.frames[skel.keys.toss].t, analysis.frames[skel.keys.contact].t, {
        bodyHeight: skel.bodyHeight,
        groundY: skel.groundY,
        aspect: analysis.video.width / Math.max(1, analysis.video.height),
      })
    : undefined

  return {
    ...analysis,
    fundamentals,
    overall,
    overallStatus: statusOf(overall),
    // The diagnosis is untouched by a serve-type rescore — it is judged against
    // the tier ladder, not the serve-type bands — so the named fault and its
    // drill carry straight over through the spread above, and the focus keeps
    // coming from the fault rather than reverting to the ranking on a rescore.
    focus: causalFocus(analysis.triage) ?? pickFocus(fundamentals),
    tossFlight,
    serveType,
    // Restamped, not inherited through the spread: every score above has just
    // been recomputed by this build, whatever rubric the report arrived under.
    scoringVersion: SCORING_VERSION,
  }
}

/**
 * Judge the same serve against a different rung of the tier ladder.
 *
 * The sibling of `rescore`, and worth having for the same reason: nothing
 * measured changes. The tier moves which band each signal is judged against, so
 * it moves which flaws are detected, which one triage picks and therefore what
 * the player is told to work on — and it moves none of the landmarks, none of
 * the keyframes and none of the area scores. Re-running the pipeline to discover
 * that would cost half a minute of seeking and pose detection to arrive at
 * identical numbers with a different verdict over them.
 *
 * The injury flags deliberately do not move. They are read against absolute
 * limits rather than against the ladder — a wrist has the same range at every
 * rating — so a player who says they are stronger than the engine guessed does
 * not thereby talk themselves out of a warning.
 *
 * Returns undefined when the frames are gone, which is every report reopened
 * from storage. A saved report keeps its verdict; it cannot be re-judged.
 */
export function rediagnose(analysis: Analysis, tier: number | undefined): Analysis | undefined {
  if (!analysis.frames?.length) return undefined

  let skel: Skeleton
  try {
    skel = detectServe(analysis.frames, analysis.quality.sampledFps, analysis.handedness)
  } catch {
    return undefined
  }

  const diagnosis = diagnose(analysis.frames, skel, { tier, ball: analysis.ball })
  const verdict = triage(diagnosis, assessResilience(analysis.frames, skel))

  return {
    ...analysis,
    diagnosis,
    triage: verdict,
    focus: causalFocus(verdict) ?? pickFocus(analysis.fundamentals),
  }
}

/**
 * Which measurements have earned a target dial on their keyframe still.
 *
 * The band is the one the report prints, taken straight off the metric, so the
 * picture and the caption cannot disagree — the rule `drawGhost` states at
 * length and the reason the trophy ghost was withdrawn.
 *
 * Hedged measurements are left out. Anything under `SOFT_MEASUREMENT` is marked
 * approximate on the card and barred from the headline, and a diagram is more
 * convincing than either of those: a player who has seen a dial does not un-see
 * it because a sentence nearby said "about". Absent values are excluded by
 * construction, since a metric that could not be computed is not in
 * `fundamentals`.
 *
 * Lifted out of `runAnalysis` when the sweep gained a second place that needs
 * it: a serve whose stills are captured after the fact has only its finished
 * `fundamentals` to work from, and re-deriving this rule there would be two
 * copies of a judgement about what the app is confident enough to draw.
 */
export function bandsFor(fundamentals: Fundamental[]): Record<string, [number, number]> {
  const bands: Record<string, [number, number]> = {}
  for (const area of fundamentals) {
    for (const m of area.metrics) {
      if ((m.confidence ?? 1) >= SOFT_MEASUREMENT && m.ideal) bands[m.id] = m.ideal
    }
  }
  return bands
}

/**
 * The overlay every keyframe still carries, as one definition.
 *
 * The stills outlive the clip, so they carry the tracking with them — a bare
 * frame is far less use weeks later than one showing the tracked body and the
 * angle it was judged on. There are now two moments this is drawn at: during an
 * ordinary analysis, from the values still in hand, and after a basket sweep,
 * for the two serves the comparison turned out to name. Those two have entirely
 * different things in scope and would have been two copies of one drawing call
 * — a formula written twice and tested once, which is the shape this file has
 * had to be rescued from before.
 *
 * BOTH `frames` AND `ball` MUST BE IN RAW PIXEL SPACE. A still is unrotated
 * video pixels, and a levelled skeleton drawn over them sits off the body by
 * exactly the roll that was corrected. Inside `runAnalysis` that is free —
 * `extracted.frames` is never levelled and `rawBall` is named for it. From a
 * finished `Analysis` it is not: everything stored there lives in the levelled
 * space, and `rawSpaceOf` is the inverse.
 */
export function keyframeOverlay(opts: {
  /** Sampled frames in RAW pixel space — not the levelled ones. */
  frames: Frame[]
  /** The tossed flight in RAW pixel space, when there was one. */
  ball: BallFlight | undefined
  phases: Analysis['phases']
  aspect: number
  racket: 'right' | 'left'
  bodyHeight: number
  bands: Record<string, [number, number]>
}): (ctx: CanvasRenderingContext2D, index: number, size: { w: number; h: number }) => void {
  const { frames, ball, phases, aspect, racket, bodyHeight, bands } = opts
  return (ctx, i, size) => {
    drawSkeleton(ctx, {
      frame: frames[phases[i].frame],
      aspect,
      rect: fitContain(size.w, size.h, aspect),
      racket,
      annotation: phases[i].id,
      bands,
      calloutScale: 1.7,
      bodyHeight,
      sequence: { frames, index: phases[i].frame },
      ball: ballMarkerAt(ball, phases[i].t),
    })
  }
}

/**
 * A finished report's frames and ball, rotated back into raw video pixels.
 *
 * Everything an `Analysis` stores lives in the levelled space, because that is
 * the space it was all measured in. Anything drawing over the actual video has
 * to undo that, and `PosePlayer` has done exactly this since it was written —
 * this is that pair of transforms given a name, so the still capture and the
 * player cannot drift into disagreeing about which space a picture is in.
 *
 * A clip that needed no correction has no `tilt`, and then both are already raw
 * and are handed straight back.
 */
export function rawSpaceOf(
  analysis: Pick<Analysis, 'frames' | 'ball' | 'tilt'>,
  aspect: number,
): { frames: Frame[]; ball: BallFlight | undefined } {
  const { tilt } = analysis
  if (!tilt) return { frames: analysis.frames, ball: analysis.ball }
  return {
    frames: unlevelFrames(analysis.frames, tilt),
    ball: analysis.ball
      ? levelFlight(analysis.ball, -tilt.roll_deg, { cx: tilt.cx, cy: tilt.cy }, aspect)
      : undefined,
  }
}

/**
 * Fill in one already-measured serve's keyframe stills, from its report alone.
 *
 * The sweep's half of `keyframeOverlay`. It takes a finished `Analysis` rather
 * than the pile of locals `runAnalysis` has, because by the time the comparison
 * knows which two serves are worth pictures, every one of those locals is gone
 * — the analyses are all that is left.
 *
 * Mutates `analysis.phases[].thumbnail` in place, which is what `pairStills`
 * then reads. Deliberately: the alternative is a second parallel array of
 * stills that has to be matched back up by keyframe id, which is the pairing
 * bug `pairStills` already guards against, reintroduced one layer down.
 */
export async function captureServeStills(
  video: HTMLVideoElement,
  analysis: Analysis,
  aspect: number,
  signal?: AbortSignal,
): Promise<void> {
  const { frames, ball } = rawSpaceOf(analysis, aspect)
  const thumbs = await captureThumbnails(
    video,
    analysis.phases.map((p) => p.t),
    keyframeOverlay({
      frames,
      ball,
      phases: analysis.phases,
      aspect,
      racket: analysis.handedness,
      bodyHeight: analysis.scale?.bodyHeight ?? 0,
      bands: bandsFor(analysis.fundamentals),
    }),
    undefined,
    signal,
  )
  analysis.phases.forEach((p, i) => {
    p.thumbnail = thumbs[i]
  })
}

/**
 * Full pipeline: load the model, sample the video, find the serve, measure it.
 *
 * Everything here runs on the device. The video is never uploaded, and after
 * the first run the model is cached so this works with no network at all.
 */
export async function analyzeServe(
  opts: AnalyzeOptions,
  /**
   * An element to read the clip through, when the caller has one already loaded
   * with it. The sweep across a basket passes its own; the decoder is then set
   * up once for the clip rather than once per serve, and tearing it down is the
   * lender's job rather than this function's.
   */
  shared?: HTMLVideoElement,
): Promise<Analysis> {
  if (shared) return runAnalysis(shared, opts)

  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'

  // Detaching the source releases the decoder, and it has to happen however we
  // leave — rejecting a clip that is not a serve is a completely ordinary
  // outcome, and leaking a decoder on every one of those adds up over a session.
  try {
    return await runAnalysis(video, opts)
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}


async function runAnalysis(video: HTMLVideoElement, opts: AnalyzeOptions): Promise<Analysis> {
  const { videoUrl, fileName, onProgress = () => {}, signal } = opts

  const startedAt = clock()
  // Asked before `loadEngine`, because afterwards the answer is always yes. A
  // first analysis on a cold cache pays a 19 MB download inside the measured
  // span, and a number that folded that in would be reporting the network.
  //
  // The resident check short-circuits it, and is not a second opinion about the
  // same thing: an engine already built in memory cannot download anything, so
  // the answer is settled without asking. It matters because this runs once per
  // serve and a basket sweep is up to six of them — see `engineResident`, which
  // is a field read against three `caches.match` calls over every cache the
  // origin owns.
  const coldEngine = !engineResident() && !(await isCachedOffline())

  const landmarker = await loadEngine((p: EngineProgress) => {
    onProgress({
      step: 'engine',
      ratio: p.ratio ?? (p.stage === 'starting' ? 0.97 : 0),
      detail:
        p.stage === 'downloading' && p.totalBytes
          ? `Downloading the coach · ${megabytes(p.loadedBytes ?? 0)} of ${megabytes(p.totalBytes)}`
          : p.stage === 'starting'
            ? 'Warming up the pose engine'
            : 'Loading the pose engine',
    })
  })

  onProgress({ step: 'reading', ratio: 0, detail: 'Reading your video' })
  await loadVideo(video, videoUrl)

  // Check the framing before spending half a minute measuring it. Skipped when
  // sweeping a basket, where the clip has already been through this once.
  if (!opts.skipFramingCheck) {
    onProgress({ step: 'reading', ratio: 0.5, detail: 'Checking the framing' })
    const sample = await preflight(video, landmarker, { signal })
    const issue = blockingFramingIssue(framingIssues(sample))
    if (issue) throw issue
  }

  const extracted = await extractFrames(video, landmarker, {
    signal,
    serveIndex: opts.serveIndex,
    knownServeTimes: opts.knownServeTimes,
    onProgress: (p: ExtractProgress) =>
      onProgress({
        step: p.phase === 'scanning' ? 'scanning' : 'tracking',
        ratio: p.ratio,
        detail: p.phase === 'scanning' ? 'Finding the serve' : 'Tracking your body',
      }),
  })

  const { fps, window, serves, located } = extracted
  if (extracted.times.length) opts.onServesLocated?.(extracted.times)
  let frames = extracted.frames
  const aspect = video.videoWidth / Math.max(1, video.videoHeight)

  if (frames.length < 8) {
    throw new NotAServeError('I found no player in that video.', [
      'Put the player fully in frame, well lit.',
      'Keep everyone else out of the shot.',
    ])
  }

  for (const f of frames) f.visibility = keyVisibility(f)

  onProgress({ step: 'measuring', ratio: 0.2, detail: 'Finding the key positions' })

  // Both calls below go through this so a refusal from either one carries its
  // frames. `frames` is reassigned by the levelling pass, and reading it here at
  // throw time rather than closing over the original is deliberate: the second
  // detection runs on the levelled frames, and a fixture built from the
  // unlevelled ones would not reproduce the refusal being recorded.
  // A refusal that names the hand that actually swung is answered by reading
  // the clip again against that hand, rather than passed on. Tried once: the
  // second read is against the arm the detector itself picked out as having
  // served, so a second refusal is about the serve and worth showing.
  const detect = (): Skeleton => {
    let hand = opts.handedness
    for (let attempt = 0; ; attempt++) {
      try {
        return detectServe(frames, fps, hand)
      } catch (err) {
        if (err instanceof NotAServeError && err.suggestedHand && attempt === 0) {
          hand = err.suggestedHand
          continue
        }
        // The window was chosen blind, so a serve failing to turn up in it says
        // far more about the scan than about the player. Told "that does not
        // look like a serve" about a clip that is nothing but serves, the one
        // thing they will not think to do is the thing that works — trim it.
        if (err instanceof NotAServeError && !located) {
          const missed = new NotAServeError('I could not find a serve in that clip.', [
            'Trim the video to a single serve and try again.',
            'This app scans long clips for the serve first, and nothing in this one stood out.',
            'Filming from the side or behind, four metres back, makes the swing easier to pick out.',
          ])
          if (opts.captureOnFailure) missed.capture = { frames, fps }
          throw missed
        }
        if (opts.captureOnFailure && err instanceof NotAServeError) err.capture = { frames, fps }
        throw err
      }
    }
  }

  let skel = detect()

  // A phone held at an angle tilts every height and depth in the clip while
  // leaving the pose tracking looking perfectly healthy. The player's own
  // standing axis is a plumb line, so the frame can be rotated back onto gravity
  // — and then the keyframes are found again, because they were found in the
  // tilted frame. A level clip is detected as level and skips both, so the
  // common case costs one comparison.
  const tilt = assessSpatial(frames, skel.keys.ready, skel.bodyHeight)
  let applied: Tilt | undefined
  if (Math.abs(tilt.roll_deg) >= NOTABLE_ROLL) {
    const pivot = levelPivot(frames)
    frames = levelFrames(frames, tilt.roll_deg, pivot)
    for (const f of frames) f.visibility = keyVisibility(f)
    skel = detect()
    // Remembered on the report: measurement lives in this levelled space, the
    // video pixels do not, and drawing needs the transform to bridge the two.
    applied = { roll_deg: tilt.roll_deg, ...pivot }
  }

  // Read before anything is measured, not after. `assessResilience` used to sit
  // down beside the triage call it feeds, which put the one module that actually
  // measures the camera angle *after* the measurements that depend on it — so
  // hip-shoulder coil, read almost entirely from inferred world z, was scored
  // and stated crisply on clips this had already decided could not show depth.
  // It reads `frames` and `skel`, both settled above; nothing between here and
  // the triage call touches either, so moving it up changes only who can see it.
  //
  // Now above `assessQuality` as well, for the same reason one step further on:
  // the blur figure it measures had exactly one consumer, the refusal, so a clip
  // was either thrown out for a smeared swing or reported as though there were
  // none. Nothing in between, which is where most amateur footage lives.
  const resilience = assessResilience(frames, skel)

  const quality = assessQuality(frames, skel, fps, resilience.blur)

  // Locating serves in a long clip is bounded now, but bounded is not free — it
  // still costs a few hundred video seeks, and the player has no way to know that
  // the length of their clip is why they waited. Said once, on the report, rather
  // than as a blocking complaint about a clip that worked perfectly well.
  if (video.duration > LONG_CLIP_SECONDS) {
    quality.warnings.push(
      cue('Long clip, so most of the wait went on finding the serves. Trim to the serves before you upload.'),
    )
  }

  // Skipped when sweeping a basket: it is a second pass over the video per
  // serve, and the comparison only uses measurements every serve shares.
  // Tracked against the *raw* frames — the ball is found in unrotated pixels,
  // so the shoulder exclusion line has to be drawn in the same space.
  let ball: BallFlight | undefined
  if (!opts.skipBall) {
    onProgress({ step: 'measuring', ratio: 0.4, detail: 'Looking for the ball' })
    ball = await findBall(video, extracted.frames, skel, signal)
  }

  // What the pixels saw, kept for drawing over them; `ball` itself moves into
  // the levelled space every measurement lives in.
  const rawBall = ball
  if (ball && applied) {
    ball = levelFlight(ball, applied.roll_deg, { cx: applied.cx, cy: applied.cy }, aspect)
  }

  onProgress({ step: 'measuring', ratio: 0.55, detail: 'Measuring the fundamentals' })
  const serveType = opts.serveType ?? 'flat'
  const fundamentals = measure(frames, skel, quality.view === 'side', {
    ball,
    serveType,
    confidence: {
      frames,
      skel,
      swingSamples: quality.swingSamples,
      view: quality.view,
      ballConfidence: ball?.confidence,
      depthUnreliable: resilience.spatial.depth_unreliable,
      blur: resilience.blur,
    },
  })

  // Named breakdowns, on the same landmarks and keyframes the measurements
  // used. A second pass over data already in memory rather than a second pass
  // over the video — it costs about a millisecond, which is why it is not
  // behind a flag.
  const diagnosis = diagnose(frames, skel, { tier: opts.tier, ball })

  // What the clip itself was worth, and the single thing to work on — or the
  // reason there is nothing worth saying. Carried as data rather than acted on
  // here: whether a rejected clip is shown as a report or as a refusal is a
  // decision for whatever is rendering, and the engine's job is to be right
  // about which one it is.
  const verdict = triage(diagnosis, resilience)

  const phases = buildPhases(frames, skel.keys)

  const bands = bandsFor(fundamentals)

  if (!opts.skipThumbnails) {
    onProgress({ step: 'measuring', ratio: 0.8, detail: 'Capturing your key frames' })
    const thumbs = await captureThumbnails(
      video,
      phases.map((p) => p.t),
      keyframeOverlay({
        // Raw pixel space on both counts — see `keyframeOverlay`. In here that
        // is simply what these two variables already are: `extracted.frames` is
        // never levelled (`frames` is the reassigned one) and `rawBall` says so
        // in its name.
        frames: extracted.frames,
        ball: rawBall,
        phases,
        aspect,
        racket: skel.racket,
        bodyHeight: skel.bodyHeight,
        bands,
      }),
      // Positional `undefined` so `maxWidth` keeps its default — restating 420
      // here would be two places to change the day it moves.
      undefined,
      signal,
    )
    phases.forEach((p, i) => {
      // Short when the player stopped part way through — see `captureThumbnails`.
      // The measurement is already complete either way; these are the pictures.
      p.thumbnail = thumbs[i]
    })
  }

  const overall = weightedScore(
    fundamentals.map((f) => ({ score: f.score, weight: FUNDAMENTALS[f.id].weight })),
  )

  const tossFlight = ball
    ? summariseToss(ball, frames[skel.keys.toss].t, frames[skel.keys.contact].t, {
        bodyHeight: skel.bodyHeight,
        groundY: skel.groundY,
        aspect,
      })
    : undefined

  onProgress({ step: 'done', ratio: 1 })

  // Read the metadata before the finally block detaches the source: `load()`
  // resets duration to NaN and the dimensions to zero, and a zero-sized video
  // takes the player's aspect ratio and letterbox maths down with it.
  return {
    id: `serve-${Date.now().toString(36)}`,
    createdAt: Date.now(),
    // What this pass actually took, rather than what a comment guessed — see
    // `Analysis.cost`. Rounded to the millisecond: nothing reads it at finer
    // resolution and a long float in every stored report is noise.
    cost: { ms: Math.round(clock() - startedAt), coldEngine },
    video: {
      name: fileName,
      durationMs: video.duration * 1000,
      width: video.videoWidth,
      height: video.videoHeight,
    },
    handedness: skel.racket,
    quality,
    phases,
    fundamentals,
    overall,
    overallStatus: statusOf(overall),
    // The named fault first, the lowest-scoring measurement only if there is no
    // named fault to give. Ranking measurements answers "which number is worst",
    // which on a serve with a short toss is the contact height — the symptom —
    // and sends the player away to reach for a ball that was never up there.
    focus: causalFocus(verdict) ?? pickFocus(fundamentals),
    // The swing as a body, so a report whose stills get pruned still has
    // something to show — see `poseTrack.ts`. Built here rather than at save
    // time because this is where the frames are. The six keyframes are not
    // stored beside it: they are rows of it, and `keyframesFromTrack` lifts
    // them out unchanged.
    track: swingTrack(
      frames,
      skel.keys.ready,
      skel.keys.finish,
      video.videoWidth / video.videoHeight,
    ),
    frames,
    window,
    serves,
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    tilt: applied,
    ball,
    tossFlight,
    serveType,
    // Stamped here, where the scores are produced, rather than on the way into
    // storage. A report spends its whole first life on screen unsaved — the
    // report page, the comparison sheet — and stamping at persistence left every
    // one of those reading as old-rubric, which pointed the guard exactly the
    // wrong way round: it refused comparisons between two current serves and
    // allowed them straight across a recalibration.
    scoringVersion: SCORING_VERSION,
    diagnosis,
    triage: verdict,
  }
}

/**
 * Where the ball was at a given moment, for drawing.
 *
 * Read off the fitted curve rather than the nearest detection, so the marker
 * lands somewhere sensible on frames where the ball was not itself detected —
 * behind the player's arm, lost against a bright sky. The path is only drawn
 * over the stretch that was actually tracked, so the dashes never imply
 * knowledge the fit does not have.
 */
export function ballMarkerAt(
  ball: BallFlight | undefined,
  t: number,
): { x: number; y: number; path?: { x: number; y: number }[] } | undefined {
  if (!ball || !ball.samples.length) return undefined
  const first = ball.samples[0].t
  const last = ball.samples[ball.samples.length - 1].t
  if (t < first - 0.1 || t > last + 0.1) return undefined

  const at = (u: number) => ({
    x: flightXAt(ball, u),
    y: flightHeightAt(ball, u),
  })

  // Fine enough that drawing straight segments between consecutive points
  // reads as one continuous curve rather than a jointed polyline — the curve
  // is already smooth (it's the fitted quadratic, not raw detections), the
  // old coarse sampling was just hiding that.
  const steps = 32
  const path = Array.from({ length: steps + 1 }, (_, i) => at(first + ((last - first) * i) / steps))
  return { ...at(t), path }
}
