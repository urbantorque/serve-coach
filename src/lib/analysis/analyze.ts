import {
  readBitmaps,
  captureThumbnails,
  extractFrames,
  loadVideo,
  preflight,
  scanForServes,
  type ExtractProgress,
} from '../pose/extract'
import { framingIssues } from './groundTruth'
import type { ServeType } from '../storage/prefs'
import {
  findCandidates,
  flightHeightAt,
  flightXAt,
  frameChange,
  levelFlight,
  levelOutbound,
  summariseToss,
  trackBall,
  trackOutbound,
  type BallFlight,
  type OutboundTrack,
} from '../vision/ballTrack'
import { imageXSplitFrom, readImageX, type ImageXSplit } from './axes'
import { loadEngine, type EngineProgress } from '../pose/poseEngine'
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
  type Spatial,
  type Tilt,
} from './spatial'
import { assessResilience, triage } from './triage'
import { causalFocus } from './verdict'
import { cue } from './voice'
import { buildPhases, detectServe, type Skeleton } from './phases'
import {
  NotAServeError,
  SCORING_VERSION,
  type Analysis,
  type Frame,
  type Fundamental,
  type OutboundBall,
  type Quality,
} from './types'

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
   *     shares, which the two ball readings are not.
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

const bytes = (n: number) => `${(n / 1e6).toFixed(1)} MB`

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
 * How long that is in seconds, nobody here knows: nothing in this tree times a
 * sweep, the only sweeps ever run were against a fake `measure` that returns
 * immediately, and a figure invented for a comment would be a number nobody
 * measured. It is one full analysis pass per serve, and that is the honest unit.
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
        'Every swing measurement is read off your racket hand, so it has to be visible.',
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
 * How many instants a second the post-contact window is sampled at.
 *
 * Set by how long the ball is in shot, which is the binding constraint and not
 * a tuning choice: measured in `ball.test.ts` at the framing this app
 * recommends, a 120 km/h serve is out of frame 33 ms after contact, 160 km/h in
 * 25 ms. Five detections inside 25 ms needs 200 samples a second, so 240 is the
 * first ordinary phone rate that clears it — and it clears it by very little.
 *
 * Nothing forces the clip to contain 240 frames a second, and most do not.
 * `readBitmaps` will happily seek to a time between two frames and hand back the
 * one before it, so on 30 fps footage seven of every eight of these instants are
 * the same picture stamped with a different clock. Those are dropped by
 * `frameChange` rather than fitted — see `FRAME_ADVANCED`.
 *
 * Worth naming the clip this cannot serve, because it is the one a player told
 * to "use slow motion" is most likely to hand over. A phone's slow-motion export
 * is often *conformed*: 240 fps of capture written out as 30 fps of playback
 * over eight times the duration. Its file frame rate is 30, so this grid finds
 * repeats, and the eight times more film it contains is not reachable at this
 * spacing. Such a clip never gets here at all — its toss falls at a sixty-fourth
 * of the gravity the player's image scale implies, which `trackBall` rejects out
 * of hand, so `ball` is undefined and this is never called. That is an existing
 * limit of the toss tracker rather than one introduced here, but the two
 * interact, and the interaction is what makes the seconds below trustworthy.
 */
const OUTBOUND_GRID_HZ = 240

/**
 * How many of those instants are asked for on a clip that can answer.
 *
 * Twelve, which at the rate above is 50 ms of clip — a little longer than the
 * 33 ms window the measurement says exists at club pace, so the tail is covered
 * for a slower serve without paying for time the ball is certainly gone.
 *
 * Stated as seeks rather than milliseconds, because seeks are what it costs and
 * they are the expensive half of this pipeline. A fixed budget, not a function
 * of the clip: a longer clip does not buy more post-contact frames, because the
 * ball is not in shot for longer.
 */
const OUTBOUND_SEEK_BUDGET = 12

/**
 * How many are asked for before deciding whether the rest are worth it.
 *
 * Almost every clip this runs on cannot answer, so paying the full budget on all
 * of them is paying twelve seeks to learn what three can tell you. Three, and
 * not two: the first read has no frame before it to compare against, so it says
 * nothing about the film's rate — it takes two comparisons to tell a 120 fps
 * clip (every other instant advances) from a 60 fps one (every fourth does).
 *
 * The cost of the whole feature, honestly stated, is therefore three video seeks
 * on ordinary footage and twelve on footage shot fast enough to measure — on top
 * of the 40–55 the toss window already spends, and inside a pass that is skipped
 * entirely when sweeping a basket.
 */
const OUTBOUND_PROBE_SEEKS = 3

/**
 * Mean absolute channel difference, 0–255, below which two frames are the same
 * picture and the second is discarded.
 *
 * A re-decode of one frame is bit-identical and scores exactly 0; any real frame
 * interval moves sensor noise across the whole picture as well as a fast-moving
 * player and ball. Half a level sits far above the first and far below the
 * second, and the asymmetry is deliberate — dropping a real frame costs a sample
 * and usually a refusal, while keeping a repeat puts the ball in two places at
 * once and fits a slope to the difference.
 */
const FRAME_ADVANCED = 0.5

/**
 * Track the ball after it is hit, or return nothing.
 *
 * A separate window from `findBall` and a separate pass, which is worth
 * justifying because `detector.ts` argues at length for one shared pass over the
 * video and this is not that. The two windows do not overlap — one ends at
 * contact, the other starts there — so nothing is decoded twice, and they want
 * grids an order of magnitude apart: the toss is sampled on the pose grid at up
 * to 32 Hz, and 32 Hz over the post-contact window is one frame. Unioning them
 * would mean sampling the whole toss at 240 Hz, which is 200 wasted seeks. The
 * shared pass is the right answer for two detectors looking at the *same*
 * frames; these two look at adjacent ones.
 *
 * Almost always comes back with the coverage counts and no flight. That is the
 * shape of the problem and not a bug — see `OutboundBall` and the header of
 * `trackOutbound`. `undefined` is reserved for the case where the window could
 * not be looked at at all, which is a different thing from having looked and
 * found nothing, and only one of the two is worth telling a player about.
 *
 * WHAT NOBODY READS, stated here because it is the honest cost of this pass and
 * because a reader deserves to find it before they go looking for the card.
 *
 * Nothing consumes `Analysis.outbound`. There is no metric row, no insight, no
 * copy, no overlay and no drill; the field is measured, stored and never shown.
 * That costs 3 video seeks on ordinary footage and 12 on footage fast enough to
 * measure, per analysed clip, on top of the 40–55 the toss already spends. It
 * is the same shape of decision as `Diagnosis.chain` and as `pancake_contact` —
 * measured, kept, not named — with one difference worth being plain about: the
 * chain is free once the frames are in hand and this is not. It is kept because
 * the coverage counts are the first evidence this app has of how often the
 * outbound ball is filmable at all, and that question has to be answered before
 * anyone writes a card. A card needs the `MIN_EVIDENCE` gate the handoff asks
 * for and copy that passes `voice.ts`; neither exists yet, and inventing them
 * here would be the wrong order.
 *
 * TWO THINGS DELIBERATELY NOT ATTEMPTED, recorded at the site rather than in
 * `tiers.ts UNDER_RESOLVED`, which the handoff asked for and which cannot hold
 * them: that table is keyed by graded signals the repeatability ensemble
 * produces, and `depth.test.ts` fails any key it does not measure. A decision
 * about something never measured has no home there.
 *
 *   - SERVE PLACEMENT. In or out, and T versus body versus wide, need court
 *     lines. Finding them means a Hough transform over frames of worn, wet,
 *     shadowed or half-cropped courts, and `spatial.ts` already argues at length
 *     why this app does not do that. Not attempted, and not a gap to fill later
 *     without footage.
 *   - THE BALL BELOW ~200 Hz OF EFFECTIVE SAMPLING. Not a tuning limit: the ball
 *     is in shot for 25–50 ms at club speeds, and `ball.test.ts` resolves 0 of 1
 *     frames at 30 Hz, 0 of 2 at 60, 0 of 4 at 120 and 8 of 8 at 240. Five
 *     samples inside 25 ms is 200 a second. Most clips will therefore never
 *     produce a flight, and that is the measurement rather than a failure of it.
 */
async function findOutbound(
  video: HTMLVideoElement,
  frames: Frame[],
  skel: Skeleton,
  /** The tossed flight, in raw pixels — this runs on raw pixels too. */
  ball: BallFlight,
  spatial: Spatial,
  aspect: number,
  /**
   * The phone's roll, in degrees, as measured in the RAW pixel space this pass
   * reads — not the correction that was applied to the pose frames.
   *
   * The two differ below `NOTABLE_ROLL`, which is the whole reason this argument
   * changed shape. See the note at the `levelOutbound` call.
   */
  roll_deg: number,
  signal?: AbortSignal,
): Promise<OutboundBall | undefined> {
  const { keys, bodyHeight } = skel
  if (!(bodyHeight > 0) || !(aspect > 0)) return undefined

  const contactT = frames[keys.contact]?.t
  if (!Number.isFinite(contactT)) return undefined

  // Where the toss fit says the ball was when it was struck. The outbound line
  // has to start here, which is the only thing distinguishing the ball from the
  // racket, the hand and the follow-through — all of which are moving fast in
  // the same corner of the frame at the same moment.
  const anchor = {
    t: contactT,
    x: flightXAt(ball, contactT),
    y: flightHeightAt(ball, contactT),
  }

  const duration = video.duration
  const times: number[] = []
  for (let i = 1; i <= OUTBOUND_SEEK_BUDGET; i++) {
    const t = contactT + i / OUTBOUND_GRID_HZ
    // A clip that stops a tenth of a second after the strike is ordinary. Asking
    // for time that was never filmed is a seek that cannot succeed.
    if (Number.isFinite(duration) && t >= duration) break
    times.push(t)
  }
  // Nothing to look at. The clip stopped within a couple of frames of the
  // strike, so there is no window rather than an empty one.
  if (times.length < OUTBOUND_PROBE_SEEKS) return undefined

  // The shoulder line at contact, which is the highest it gets — the player is
  // fully extended. Everything below it is excluded, which is most of the
  // racket's follow-through as well as the player and the court.
  const at = frames[keys.contact]
  const belowY = Math.min(1, Math.min(at.image[LM.leftShoulder].y, at.image[LM.rightShoulder].y) + 0.05)

  type Read = { t: number; candidates: ReturnType<typeof findCandidates>; change: number }
  const readAt = async (want: number[]): Promise<Read[] | undefined> => {
    try {
      return await readBitmaps(
        video,
        want,
        (frame, previous, t) => ({
          t,
          candidates: findCandidates(frame, previous, { belowY }),
          change: frameChange(frame, previous),
        }),
        { signal },
      )
    } catch {
      return undefined
    }
  }

  // Instants the video actually advanced for. The first read of a call has no
  // frame before it, and `frameChange` reports that as fully changed rather than
  // as a repeat, so it is always kept.
  const advancedOnly = (reads: Read[]) => reads.filter((r) => r.change >= FRAME_ADVANCED)
  const withBall = (reads: Read[]) => reads.filter((r) => r.candidates.length > 0).length

  /*
   * What was asked for, counted before anything is asked.
   *
   * `coverage.asked` used to be `probe.length` — the number of entries
   * `readBitmaps` handed BACK. It pushes an entry only when `seekTo` succeeds,
   * so a failed seek was invisible in `asked` and in `read` alike, and a clip
   * where half the seeks failed reported `asked === read`: perfect coverage of
   * a window it had barely looked at. That erased the exact distinction
   * `DetectorCoverage` was written in the same breath to guarantee — "a detector
   * dividing hits by `asked` blames itself for frames the decoder never handed
   * over".
   *
   * So the two slices are counted here, off `times`, and the reads are compared
   * against them. `asked` minus `read` now covers both ways an instant can fail
   * to be film — the seek was refused, or it returned the frame before it for
   * the seventh time — which is one bucket rather than two because the advice is
   * the same either way: the clip does not have frames at this rate.
   */
  const probeTimes = times.slice(0, OUTBOUND_PROBE_SEEKS)
  const restTimes = times.slice(OUTBOUND_PROBE_SEEKS)

  const probe = await readAt(probeTimes)
  if (!probe || signal?.aborted) return undefined
  const probeAdvanced = advancedOnly(probe)

  // Two of the three, meaning at least one of the two comparisons saw new film.
  // That is the line between a clip shot at half this grid's rate, which can
  // still supply enough frames to fit, and one shot at a quarter of it or less,
  // which cannot supply any. Stopping here is what keeps the usual cost of this
  // feature at three seeks instead of twelve — see `OUTBOUND_PROBE_SEEKS`.
  if (probeAdvanced.length < 2) {
    // Counted rather than written off as nought. A frame the ball was found in
    // is a frame the ball was found in, and reporting otherwise would say the
    // detector failed on a clip where only the frame rate did.
    return {
      coverage: {
        asked: probeTimes.length,
        read: probeAdvanced.length,
        found: withBall(probeAdvanced),
      },
    }
  }

  const rest = restTimes.length > 0 ? await readAt(restTimes) : []
  if (!rest || signal?.aborted) return undefined

  // The first frame of the second call has no `previous`, so it is kept
  // unconditionally and its candidates were found on colour alone. Both are
  // acceptable: an optic-yellow ball clears the detector's threshold on colour
  // without the motion term, and a wrongly kept repeat here costs one sample of
  // a line that is checked against the toss anyway.
  const advanced = [...probeAdvanced, ...advancedOnly(rest)]

  const coverage = {
    asked: probeTimes.length + restTimes.length,
    read: advanced.length,
    found: withBall(advanced),
  }

  const raw = trackOutbound(advanced, { anchor, aspect, bodyHeight })
  if (!raw) return { coverage }

  /*
   * Levelled by the roll that was MEASURED, not by the roll that was applied
   * elsewhere, and always rather than only past a threshold.
   *
   * The launch angle is measured against image horizontal, and on a clip filmed
   * with the phone cocked in somebody's hand image horizontal is not the court.
   * The mapping is exactly one to one — a rotation is linear, and `ball.test.ts`
   * pins 8° of roll onto 8.00° of angle — so every degree of roll left in is a
   * degree of error out.
   *
   * This used to take the correction the pose frames got, which `analyze` only
   * applies past `NOTABLE_ROLL` = 4° because re-detecting the keyframes is not
   * worth it below that. Below 4° it handed over nothing and the track was left
   * unrotated, so a clip rolled 3.9° carried 3.9° of pure systematic into a
   * quantity whose true value is about -5°: the same flat serve read -1.1° on a
   * clip rolled one way and -8.9° rolled the other. That was 18× the 0.221° of
   * pitch error the same pass measured and then argued was too small to correct,
   * and nothing priced it — `launchAngleConfidence` carries how well the roll
   * was *measured*, which says nothing about a correction that was never made.
   *
   * A threshold that is right for "is it worth re-running the detector" is not
   * right for "is it worth rotating one velocity vector", and the second costs
   * two multiplications. So the measured angle is always removed.
   *
   * What is left afterwards is the estimator's own error rather than the phone's
   * roll, and that is the honest residual: `spatial.ts` reads roll off the
   * player's standing axis and puts it at a degree or two, and warns that a
   * player leaning two degrees looks exactly like a phone held two degrees off.
   * Removing a measured 2° is better than leaving 4° in, and it is worse than a
   * spirit level. `horizontal.confidence` carries `roll_confidence`, which is
   * now what it always claimed to be: the doubt in a correction that happened.
   */
  const track = levelOutbound(raw, roll_deg, aspect)

  const read = readOutboundFlight(track, imageXSplitFrom(spatial), aspect, bodyHeight)
  if (!read) return { coverage }
  const { speed, launchAngle_deg } = read

  /*
   * A speed is per second and an angle is not, so only the speed depends on the
   * clip's clock being the world's clock. The toss is the one witness to that:
   * its fitted curvature is gravity at the image scale the player's own height
   * implies, so the ratio of the two says how far the clip's seconds are from
   * seconds. A toss that fitted at the expected curvature costs nothing here.
   *
   * What it charges, stated as arithmetic rather than as a slogan, because the
   * slogan was wrong. Two different faults arrive at this ratio and they do not
   * arrive the same size:
   *
   *   - A STRETCHED CLOCK. Both the fitted curvature and the reported speed are
   *     per second squared and per second, so a clip whose seconds run 30% slow
   *     fits gravity 30% off and reads the speed 30% off. Here the dock and the
   *     error do match: fitted 30% low docks 19.5%, 30% high docks 12.3%. The
   *     asymmetry is the square root, not a policy.
   *   - A MIS-MEASURED STANDING HEIGHT. This does NOT scale by the same factor,
   *     and the comment here used to claim it did. `fittedGravity` is a property
   *     of the pixels and does not move; only `expectedGravity` is proportional
   *     to `bodyHeight`. So a height over-measured by a factor k moves the ratio
   *     by sqrt(k) while it moves the reported speed, which is divided by that
   *     same height, by 1/k. A height 20% high reads the speed 17% low and docks
   *     9.5%; 44% high reads it 31% low and docks 20%. The dock is real and it
   *     is roughly half the error, in logs. It is a hedge against this fault,
   *     not a measure of it.
   */
  const expectedGravity = (9.81 * bodyHeight) / 1.78
  const fittedGravity = 2 * ball.coefficients[2]
  const clockRatio = fittedGravity > 0 ? Math.sqrt(expectedGravity / fittedGravity) : 0
  const timebaseTrust = Math.max(0, 1 - Math.min(1, Math.abs(clockRatio - 1)))

  const launchAngleConfidence = track.fitConfidence * read.axisConfidence
  return {
    flight: {
      speed,
      speedConfidence: launchAngleConfidence * timebaseTrust,
      launchAngle_deg,
      launchAngleConfidence,
    },
    coverage,
  }
}

/**
 * A fitted outbound track, read as a speed and a launch angle.
 *
 * Exported for one reason, and it is not reuse: there is exactly one caller in
 * the app. It is that `ball.test.ts` was validating a reimplementation of this
 * arithmetic rather than this arithmetic. Its three headline figures — the
 * -5.30° launch angle, the 0.221° pitch bound and the 8.00° roll result — were
 * all computed as `atan2(-vy, |vx * aspect|)`, with no depth gain in the
 * denominator. That agrees with what ships at exactly one camera angle, 90°,
 * which happens to be the only geometry the rig renders. At the 45° corner
 * camera the shipped angle is flatter by a factor of 1.41 and at the 18° floor
 * by 3.2, so the accuracy of the shipped function was never the thing measured.
 * Two copies of one formula, one of them tested. Now there is one.
 *
 * `undefined` when the camera angle cannot support the question at all — see
 * the refusal below, which is the only refusal in here.
 */
export function readOutboundFlight(
  track: OutboundTrack,
  split: ImageXSplit,
  aspect: number,
  bodyHeight: number,
): { speed: number; launchAngle_deg: number; axisConfidence: number } | undefined {
  // What image x means at this camera angle, from the one module that owns that
  // conversion. The ball's travel is taken as running along the player's depth
  // axis — a serve goes towards the net, and at contact the player is facing it
  // — which is an approximation a wide serve breaks: that has real travel across
  // the body too, and a single image-x reading cannot be split into both. The
  // confidence `readImageX` hands back is exactly the share of the reading that
  // is honestly the depth axis, so the doubt is carried rather than hidden.
  //
  // Refuses outright below 18 degrees of yaw, which is the bottom of
  // `DEPTH_YAW_RANGE`: the depth axis has collapsed towards the lens, its gain
  // is sin(18°) = 0.309 and still falling, and dividing by it multiplies
  // centroid jitter by 3.2 and calls the answer a serve speed. (The 11.5x figure
  // in `axes.ts` is the other end of the same trade — it is the LATERAL gain at
  // 85 degrees, cos(85°) = 0.087 — and does not describe this refusal.)
  const horizontal = readImageX(track.velocity.x * aspect, 'depth', split)
  if (horizontal.value === null || horizontal.confidence <= 0 || !(bodyHeight > 0)) return undefined

  return {
    speed: Math.hypot(horizontal.value, track.velocity.y) / bodyHeight,
    // Positive upwards, so a flat serve reads slightly negative and a kick serve
    // positive. Image y grows downwards, hence the negation; the horizontal is
    // taken unsigned because yaw comes from an `acos` and carries no sign — see
    // the header of `axes.ts`.
    launchAngle_deg: (Math.atan2(-track.velocity.y, Math.abs(horizontal.value)) * 180) / Math.PI,
    axisConfidence: horizontal.confidence,
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
 * different things in scope and would have been two copies of one drawing call,
 * which is the shape `readOutboundFlight` already had to be rescued from — a
 * formula written twice, tested once, agreeing at exactly one camera angle.
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

  const landmarker = await loadEngine((p: EngineProgress) => {
    onProgress({
      step: 'engine',
      ratio: p.ratio ?? (p.stage === 'starting' ? 0.97 : 0),
      detail:
        p.stage === 'downloading' && p.totalBytes
          ? `Downloading the coach · ${bytes(p.loadedBytes ?? 0)} of ${bytes(p.totalBytes)}`
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
            'Long clips are scanned for the serve first, and nothing in this one stood out.',
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
  let outbound: OutboundBall | undefined
  if (!opts.skipBall) {
    onProgress({ step: 'measuring', ratio: 0.4, detail: 'Looking for the ball' })
    ball = await findBall(video, extracted.frames, skel, signal)
    // Only worth the seeks once the toss has been found, and not merely because
    // the toss supplies the anchor. The toss fit is also the only evidence this
    // app has that the clip's seconds are seconds — its curvature had to match
    // gravity at the player's own image scale to be accepted at all — and a
    // speed measured against an unverified clock is a number nobody measured.
    if (ball) {
      outbound = await findOutbound(
        video,
        extracted.frames,
        skel,
        ball,
        resilience.spatial,
        aspect,
        // `tilt`, not `applied`: this pass reads raw pixels, and `tilt` is the
        // roll measured in that same raw space, whether or not it was large
        // enough for the pose frames to be rotated by it.
        tilt.roll_deg,
        signal,
      )
    }
  }

  // What the pixels saw, kept for drawing over them; `ball` itself moves into
  // the levelled space every measurement lives in. `outbound` was levelled
  // inside `findOutbound`, where the raw track was still in scope.
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
    frames,
    window,
    serves,
    scale: { bodyHeight: skel.bodyHeight, groundY: skel.groundY },
    tilt: applied,
    ball,
    tossFlight,
    outbound,
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
