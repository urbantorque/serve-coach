import {
  captureBitmaps,
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
  levelFlight,
  summariseToss,
  trackBall,
  type BallFlight,
} from '../vision/ballTrack'
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
} from './geometry'
import { diagnose } from './diagnose'
import { measure } from './metrics'
import { NOTABLE_ROLL, assessSpatial, levelFrames, levelPivot, type Tilt } from './spatial'
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
  /** Skip the keyframe stills. Worth six seeks when sweeping a whole basket. */
  skipThumbnails?: boolean
  /** Serve times already located, so the clip is not scanned again per serve. */
  knownServeTimes?: number[]
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
 * Measure every serve in a clip so they can be compared against each other.
 *
 * Each serve costs a full pass over its own couple of seconds, so this is
 * deliberately something the player asks for rather than something that happens
 * to them. A serve that cannot be read — a mishit, someone walking through
 * frame — is skipped rather than allowed to sink the whole sweep.
 */
export async function analyzeAllServes(
  opts: AnalyzeOptions & { count: number },
): Promise<Analysis[]> {
  const total = Math.min(opts.count, MAX_CONSISTENCY_SERVES)
  // The *last* `total` serves, not the first. On a clip with more serves than
  // the cap, sweeping from zero measures the warm-ups and leaves out the serve
  // the report on screen is about — so the comparison the player asked for from
  // that report would not contain it. The end of a basket is also the half worth
  // comparing: it is what they were hitting once they had settled.
  const first = Math.max(0, opts.count - total)
  const out: Analysis[] = []

  // Locate every serve once up front. Each analysis below would otherwise
  // repeat this scan over the entire clip, which is by far the most expensive
  // thing here — the scan covers the whole video, the extraction only covers a
  // couple of seconds of it.
  const knownServeTimes = await locateServes(opts)

  for (let n = 0; n < total; n++) {
    if (opts.signal?.aborted) break
    try {
      out.push(
        await analyzeServe({
          ...opts,
          serveIndex: first + n,
          skipThumbnails: true,
          knownServeTimes,
          onProgress: (p) =>
            opts.onProgress?.({
              ...p,
              detail: `Serve ${n + 1} of ${total} · ${p.detail ?? 'working'}`,
            }),
        }),
      )
    } catch (err) {
      if (isCancelled(err)) throw err
      // One unreadable serve should not cost the player the other five.
    }
  }

  return out
}

/** One scan of the clip, on a video element of its own. */
async function locateServes(opts: AnalyzeOptions): Promise<number[] | undefined> {
  const video = document.createElement('video')
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
    video.removeAttribute('src')
    video.load()
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
  let shots: { t: number; bitmap: ImageData }[]
  try {
    shots = await captureBitmaps(video, times)
  } catch {
    return undefined
  }
  if (signal?.aborted || shots.length < 5) return undefined

  // The ball is above the player's shoulders for essentially all of its flight,
  // so everything below that line is excluded — which removes the player's kit,
  // their moving limbs and the court surface in one go, and those are what a
  // colour-and-motion detector would otherwise trip over.
  const shoulderY = Math.min(
    ...frames
      .slice(from, to + 1)
      .map((f) => Math.min(f.image[LM.leftShoulder].y, f.image[LM.rightShoulder].y)),
  )

  const perFrame = shots.map((shot, i) => ({
    t: shot.t,
    candidates: findCandidates(shot.bitmap, i > 0 ? shots[i - 1].bitmap : undefined, {
      belowY: Math.min(1, shoulderY + 0.05),
    }),
  }))

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

const isCancelled = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as Error).name === 'Cancelled'

export function assessQuality(frames: Frame[], skel: Skeleton, sampledFps: number): Quality {
  const win = frames.slice(skel.keys.ready, skel.keys.finish + 1)
  const visibility = mean(win.map(keyVisibility))
  const swingSamples = Math.max(0, skel.keys.contact - skel.keys.drop)

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
      (switched ? 0.5 : 1),
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
  // changed the serve type on a clip filmed dead side-on.
  const depthUnreliable = assessSpatial(analysis.frames, skel.keys.ready, skel.bodyHeight)
    .depth_unreliable

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
    },
  })

  const totalWeight = fundamentals.reduce((s, f) => s + FUNDAMENTALS[f.id].weight, 0)
  const overall = Math.round(
    fundamentals.reduce((s, f) => s + f.score * FUNDAMENTALS[f.id].weight, 0) /
      Math.max(1, totalWeight),
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
 * Full pipeline: load the model, sample the video, find the serve, measure it.
 *
 * Everything here runs on the device. The video is never uploaded, and after
 * the first run the model is cached so this works with no network at all.
 */
export async function analyzeServe(opts: AnalyzeOptions): Promise<Analysis> {
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
  if (!opts.skipThumbnails) {
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

  const { fps, window, serves } = extracted
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

  const quality = assessQuality(frames, skel, fps)

  // Read before anything is measured, not after. `assessResilience` used to sit
  // down beside the triage call it feeds, which put the one module that actually
  // measures the camera angle *after* the measurements that depend on it — so
  // hip-shoulder coil, read almost entirely from inferred world z, was scored
  // and stated crisply on clips this had already decided could not show depth.
  // It reads `frames` and `skel`, both settled above; nothing between here and
  // the triage call touches either, so moving it up changes only who can see it.
  const resilience = assessResilience(frames, skel)

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
  if (!opts.skipThumbnails) {
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
  if (!opts.skipThumbnails) {
    onProgress({ step: 'measuring', ratio: 0.8, detail: 'Capturing your key frames' })
    const thumbs = await captureThumbnails(video, phases.map((p) => p.t), (ctx, i, size) => {
      // The stills outlive the clip, so they carry the tracking with them.
      // Drawn from the raw frames and the raw flight: the still is unrotated
      // pixels, and a levelled skeleton over them would sit off the body by
      // exactly the roll that was corrected.
      drawSkeleton(ctx, {
        frame: extracted.frames[phases[i].frame],
        aspect,
        rect: fitContain(size.w, size.h, aspect),
        racket: skel.racket,
        annotation: phases[i].id,
        calloutScale: 1.7,
        bodyHeight: skel.bodyHeight,
        sequence: { frames: extracted.frames, index: phases[i].frame },
        ball: ballMarkerAt(rawBall, phases[i].t),
      })
    })
    phases.forEach((p, i) => {
      p.thumbnail = thumbs[i]
    })
  }

  const totalWeight = fundamentals.reduce((s, f) => s + FUNDAMENTALS[f.id].weight, 0)
  const overall = Math.round(
    fundamentals.reduce((s, f) => s + f.score * FUNDAMENTALS[f.id].weight, 0) /
      Math.max(1, totalWeight),
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
