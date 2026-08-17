/**
 * The contract every pixel detector in this app is built against.
 *
 * Two of them are coming: a racket-head detector over the trophy-to-contact
 * window, and an extension of ball tracking past contact for launch angle and
 * speed. They are separate pieces of work and they will be written weeks apart,
 * which is exactly the condition under which two detectors quietly disagree
 * about what a "window" is, what a confidence means, and whose job it is to
 * seek the video. This file is the agreement made once, in types, before either
 * one exists — so the disagreement is a compile error rather than a number in a
 * report that nobody can trace.
 *
 * Types and stubs only. No detector lives here, and nothing here changes what
 * the app currently measures or says.
 *
 * DOM-free by construction, like `ballTrack.ts` beside it: a detector takes raw
 * pixels, so the contract is stated in `Bitmap` rather than `ImageData` and is
 * testable in Node. `ImageData` is assignable to `Bitmap`, which is what keeps
 * `PixelRead` usable as `readBitmaps`' `read` argument without either file
 * knowing about the other.
 */

// From `rate.ts`, not `extract.ts`: this file promises DOM-free above, and
// `extract.ts` reaches for `document`. Same three numbers either way — the
// split exists so the shared pass and the pose pass cannot pick different ones.
import { samplingRateFor } from '../pose/rate'

import type { Bitmap } from './ballTrack'
import type { PhaseId } from '../analysis/types'

/**
 * Clip time, in seconds from the start of the video.
 *
 * An alias with no runtime weight, and the point of it is the name. Everything
 * upstream of the pixels counts in frames — `Frame.index`, `Skeleton.keys`,
 * the `from`/`to` pairs the diagnostic pass slices with — and everything that
 * touches the video counts in seconds, because the sampling rate is not a
 * constant: `readWindow` hands `samplingRateFor` a span and gets back anywhere
 * from 32 fps down to about 6 fps on a long clip (see `extract.ts`). A frame
 * index therefore means a different instant in every clip, and an offset of
 * "eight frames before contact" that was tuned on a 32 fps window lands nearly
 * a second and a half early on an 18-second one.
 *
 * So a detector never asks for frames. It asks for seconds, and the pass
 * converts once, in the one place that knows the rate.
 */
export type Seconds = number

/**
 * A slice of clip a detector wants pixels from, in seconds.
 *
 * Half-open in spirit but not policed here: the pass owns which instants inside
 * it are actually sampled, and a detector that also picked its own instants
 * would be the second thing in the app deciding a sampling rate.
 *
 * Prevents the failure where a detector helpfully computes its own frame range,
 * and then two detectors in the same pass have measured their objects on two
 * different time grids. Racket-head speed at contact and ball speed off the
 * strings are only comparable if they were read from the same instants; a grid
 * mismatch produces two honest measurements of a moment that never coexisted.
 */
export interface TimeWindow {
  start: Seconds
  end: Seconds
}

/**
 * What a detector is allowed to know when it chooses its window.
 *
 * Phase times in seconds, plus the clip length to clamp against. Deliberately
 * not the `Frame[]` or the `Skeleton`: a detector handed the whole pose track
 * can reach past its window, and then its result silently depends on frames the
 * pass never budgeted for and the coverage numbers below stop describing it.
 *
 * `duration` is here because both windows run off the end of something. The
 * racket-head window ends at contact, which is fine; the post-contact ball
 * window starts there and asks for time that may simply not have been filmed —
 * a clip that stops a tenth of a second after the strike. Clamping is the
 * detector's job, and it cannot clamp against a number it was not given.
 */
export interface WindowAnchors {
  /** Clip time of each phase, in seconds. Never a frame index — see `Seconds`. */
  phase: Record<PhaseId, Seconds>
  /** Length of the clip in seconds. Nothing before 0 or after this exists. */
  duration: Seconds
}

/**
 * Every detector that may ever join a shared pass, named once.
 *
 * A frozen list rather than a bare union so a test can walk it. The failure is
 * mundane and total: the shared pass keys each detector's per-frame product by
 * id, and two workstreams that both reach for the obvious name — `'ball'` —
 * produce a pass where one detector's frames overwrite the other's. Nothing
 * throws. The ball flight is simply fitted to racket-head centroids, and it
 * fits, because a racket head also travels on something like a parabola.
 *
 * W6 owns `racket_head`. W7 owns `ball_flight`. A third detector adds a name
 * here first, and finds out immediately whether it collides.
 */
export const DETECTOR_IDS = ['racket_head', 'ball_flight'] as const

/** One of `DETECTOR_IDS`. Derived from the list so the two cannot drift apart. */
export type DetectorId = (typeof DETECTOR_IDS)[number]

/**
 * The per-frame callback, shaped to fit `readBitmaps` exactly.
 *
 * `readBitmaps` hands over the current frame, the one before it, and the time
 * it was taken from, and keeps only what comes back. That shape is not a
 * convenience — it is the memory budget. At the default 256-wide capture a
 * portrait frame is 256×455, about 466 KB, and a toss-to-contact window of
 * 40–55 frames held as pixels put 19–26 MB resident on a phone already carrying
 * a 9 MB pose model. Two `Bitmap`s are alive at a time and no more.
 *
 * So a detector is written as a fold, not as a function over an array of
 * frames. Anything it returns per frame it is choosing to keep, and it should
 * be a few numbers.
 *
 * `previous` is `undefined` on the first frame of the pass, and also whenever
 * the frame before this one would not seek — `readBitmaps` skips those rather
 * than stamping a frame with a time it is not from. A detector that treats a
 * gap as an error will refuse ordinary footage; losing the ball against sky for
 * a few frames is the normal case, not the broken one.
 */
export type PixelRead<T> = (frame: Bitmap, previous: Bitmap | undefined, t: Seconds) => T

/**
 * A detector's answer, carrying how much of the window it actually got to see.
 *
 * `value` is `undefined` when the detector did not measure — not a zero, not a
 * default. This is the whole house rule in one field: a racket head that was
 * never found is not a racket head at the origin, and a post-contact ball that
 * was lost against a bright sky is not a ball travelling at 0 m/s.
 *
 * `confidence` is 0–1 and is meant to be comparable with the confidences the
 * diagnostic pass already carries — `SignalReading.confidence`, gated at
 * `MIN_EVIDENCE = 0.45` in `flaws.ts`, and the 0.45 floor `analyze.ts` already
 * applies to a fitted `BallFlight`. A detector reading published into `readings`
 * on a different scale would be silently over- or under-trusted by a gate that
 * was tuned against landmark visibility.
 *
 * `coverage` is three counts because two are not enough to tell the truth.
 * `readBitmaps` returns one entry per frame it managed to seek, which on a
 * variable-frame-rate phone clip is fewer than it was asked for. A detector
 * dividing hits by `asked` blames itself for frames the decoder never handed
 * over; dividing by `read` claims full coverage of a window it barely opened.
 * Both are numbers nobody measured. Keeping all three lets a later refusal say
 * which of the two things went wrong — the footage or the detection.
 */
export interface DetectorReading<T> {
  /** Absent when the detector did not measure. Never a stand-in value. */
  value: T | undefined
  /** 0–1, on the same scale as `SignalReading.confidence`. */
  confidence: number
  coverage: DetectorCoverage
}

/**
 * The three counts above, named so a result that is not itself a
 * `DetectorReading` can still carry them in the one agreed shape.
 *
 * The post-contact ball is the case that needed this. It publishes two numbers
 * — a speed and a launch angle — from one fit over one set of frames, so it is
 * one coverage and two confidences rather than two readings. Spelling the
 * counts out a second time on that type is exactly how the shared pass and the
 * report drift into disagreeing about what `found` counts.
 */
export type DetectorCoverage = {
  /** Instants the pass asked the video for, inside this detector's window. */
  asked: number
  /**
   * Instants that yielded a distinct frame. `asked` minus the skips.
   *
   * A skip is either kind, because the advice to the player is the same for
   * both: the seek was refused, or it returned the picture before it again
   * because the file has no frame at that instant. Both mean the film does not
   * exist at the rate the window was sampled at. What must never happen is a
   * skip disappearing from `asked` as well, which reports a window that was
   * barely looked at as one that was fully covered.
   */
  read: number
  /** Frames the detector found its object in. Never greater than `read`. */
  found: number
}

/**
 * One detector, as the shared pass sees it.
 *
 * Four parts, and the split between them is the point. `window` runs before any
 * pixel is fetched, so the pass can union the windows and seek once. `read` is
 * the fold, and sees one frame at a time. `finish` sees only what the fold
 * kept. A detector that wanted to look again at frame 12 from inside `finish`
 * cannot, and that restriction is what makes a single pass possible at all.
 *
 * `minHz` is stated rather than assumed. The frame budget is fixed at
 * `MAX_FINE_FRAMES / FINE_FPS`, so a wider window is a slower one, and
 * `extract.ts` already records where that ends: an 18-second clip lands near
 * 6 fps, "where the swing from racket drop to contact gets less than a single
 * sample". A racket-head detector run on that grid will still return a number.
 * It will be a number about two frames, and it will look exactly like a number
 * about a swing. Declaring the rate lets the pass decline instead — a detector
 * that says it needs more samples than the window can give is a refusal the
 * player can act on ("film it closer in"), where a fabricated speed is not.
 *
 * `TFrame` is what the fold keeps per frame; `TResult` is what the detector
 * finally measured. They are separate because they almost always differ: the
 * ball tracker keeps a handful of candidate blobs per frame and finishes with
 * one fitted flight.
 */
export interface FrameDetector<TFrame, TResult> {
  readonly id: DetectorId
  /** Seconds of clip this detector needs, chosen before any frame is decoded. */
  window(anchors: WindowAnchors): TimeWindow
  /**
   * Samples per second below which this detector should not be run at all.
   * Compare against `samplingRateFor(span)` from `extract.ts`.
   */
  readonly minHz: number
  read: PixelRead<TFrame>
  /**
   * A method, not a property, so a concrete detector stays assignable to
   * `FrameDetector<unknown, unknown>` and can sit in a heterogeneous pass.
   *
   * `frames` holds only the frames that were read — the gaps are already gone —
   * which is why `coverage` has to be handed in rather than counted from the
   * array length.
   */
  finish(frames: TFrame[], coverage: DetectorReading<TResult>['coverage']): DetectorReading<TResult>
}

/**
 * The plan for one pass over the video, serving every detector in it.
 *
 * This exists because the alternative is what the app would otherwise do by
 * default: each detector calls `readBitmaps` with its own times, and the video
 * is seeked, decoded and downscaled twice. Seeking is the expensive half of
 * this pipeline — `captureThumbnails` and `readBitmaps` are both written around
 * avoiding it — and the racket-head window (trophy to contact) and the ball
 * window (toss through past contact) overlap heavily, so the second pass would
 * re-decode most of the same frames to answer a different question about them.
 *
 * The worse half is not cost. Two passes seek independently, and a frame that
 * would not seek for one pass may seek for the other, so the two detectors end
 * up describing overlapping but unequal sets of instants. Any quantity derived
 * from both — racket speed against ball speed, the ratio the whole point of
 * measuring either is to get at — is then computed across a mismatch that
 * leaves no trace in either result.
 *
 * `times` is the single grid. `read` is the fanned-out fold: it is handed to
 * `readBitmaps` once, offers each frame to every detector whose window contains
 * `t`, and keeps the per-frame products side by side under their ids.
 * `harvest` turns that back into one reading per detector.
 */
export interface SharedPassPlan {
  /** Union of every member's window, clamped to the clip. */
  window: TimeWindow
  /** The exact instants, ascending, that `readBitmaps` will be asked for. */
  times: Seconds[]
  /**
   * Hand this straight to `readBitmaps`. A detector whose window does not
   * contain `t` gets no entry for that frame — absent, rather than an empty
   * result, so `coverage.read` cannot be inflated by frames outside the window.
   */
  read: PixelRead<{ t: Seconds; by: Partial<Record<DetectorId, unknown>> }>
  /**
   * Split the interleaved reads back out and call each detector's `finish`.
   *
   * The only place the `unknown` above is narrowed, so the one cast in this
   * design lives at a single audited line instead of once per detector.
   */
  harvest(
    reads: { t: Seconds; by: Partial<Record<DetectorId, unknown>> }[],
  ): Partial<Record<DetectorId, DetectorReading<unknown>>>
}

/**
 * Why a detector was left out of a plan, when it was.
 *
 * Named rather than dropped silently, because the caller has to be able to tell
 * "this pass did not look" from "this pass looked and found nothing" — those
 * are different sentences to a player, and the second one is a fault report.
 */
export type DetectorDeclined = {
  id: DetectorId
  reason: 'window_empty' | 'too_slow'
  /** The grid this detector would have been run on. */
  hz: number
  /** What it said it needed. */
  minHz: number
}

/** A plan, plus everything that did not make it in. */
export interface SharedPass extends SharedPassPlan {
  members: DetectorId[]
  declined: DetectorDeclined[]
}

/**
 * Build the plan.
 *
 * Still throws when it cannot make one, and the reasons in the previous version
 * of this comment stand: a plan returning `{ times: [] }` type-checks, runs,
 * reads nothing, and hands every detector full confidence over zero frames.
 *
 * THE PART THAT IS NOT OBVIOUS: dropping a detector for being too slow can make
 * the pass fast enough to have kept it. The grid rate comes from
 * `samplingRateFor(span)`, the span is the union of the surviving windows, and
 * the union shrinks when a member leaves — so a ball detector reaching a second
 * past contact can be the reason the racket detector was refused, and removing
 * the ball detector raises the rate past what the racket one asked for.
 *
 * This drops and does not reconsider. Re-admitting is the same step run
 * backwards: the re-admitted window widens the span, lowers the rate, and can
 * refuse the detector that was already in — so the membership of the pass would
 * depend on which order the drops happened in. A plan whose contents depend on
 * iteration order is not a plan anyone can reason about, and the cost of the
 * conservative rule is that a detector is occasionally refused on a grid that
 * the final pass beats. That refusal is honest: it is refused against the pass
 * it was actually offered.
 *
 * Only ever dropping is also what makes this terminate. Each round removes at
 * least one member or stops, so it runs at most as many times as there are
 * detectors.
 */
export function planSharedPass(
  detectors: readonly FrameDetector<unknown, unknown>[],
  anchors: WindowAnchors,
): SharedPass {
  if (detectors.length === 0) {
    throw new Error('planSharedPass was asked for a pass over no detectors')
  }
  const seen = new Set<DetectorId>()
  for (const d of detectors) {
    if (seen.has(d.id)) {
      // The collision `DETECTOR_IDS` was written to make loud. Two members
      // under one id do not error anywhere downstream — the second simply
      // overwrites the first's per-frame product, and a ball flight fitted to
      // racket-head centroids still fits, because a racket head also travels
      // on something like a parabola.
      throw new Error(`planSharedPass was handed two detectors called ${d.id}`)
    }
    seen.add(d.id)
  }

  const clamp = (t: Seconds) => Math.min(Math.max(t, 0), anchors.duration)
  const windows = new Map<DetectorId, TimeWindow>()
  const declined: DetectorDeclined[] = []
  let members = detectors.filter((d) => {
    const w = d.window(anchors)
    const start = clamp(w.start)
    const end = clamp(w.end)
    if (!(end > start)) {
      // A window clamped out of existence — the post-contact ball on a clip
      // that stops at the strike. Not an error: it is the ordinary result of
      // filming a serve and lowering the phone.
      declined.push({ id: d.id, reason: 'window_empty', hz: 0, minHz: d.minHz })
      return false
    }
    windows.set(d.id, { start, end })
    return true
  })

  let hz = 0
  let window: TimeWindow | undefined
  while (!window) {
    if (members.length === 0) {
      throw new Error(
        `planSharedPass has no detector left to plan for: ${declined
          .map((d) => `${d.id} (${d.reason})`)
          .join(', ')}`,
      )
    }
    const start = Math.min(...members.map((d) => windows.get(d.id)!.start))
    const end = Math.max(...members.map((d) => windows.get(d.id)!.end))
    hz = samplingRateFor(end - start)
    const tooSlow = members.filter((d) => d.minHz > hz)
    if (tooSlow.length === 0) {
      window = { start, end }
      continue
    }
    // Every member that cannot be served, in one round rather than the worst
    // one first — same reason as above. Dropping one at a time makes the
    // survivors depend on the comparison used to pick the worst.
    for (const d of tooSlow) declined.push({ id: d.id, reason: 'too_slow', hz, minHz: d.minHz })
    const gone = new Set(tooSlow.map((d) => d.id))
    members = members.filter((d) => !gone.has(d.id))
  }

  /*
   * The grid. Built from the rate rather than handed in, so there is exactly
   * one place in the app that turns a span into instants — `readWindow` does
   * the same arithmetic for the pose pass, and two of them drifting apart is
   * the mismatch `Seconds` exists to prevent.
   *
   * Inclusive of the last instant when it lands on the end, because the
   * racket-head window ends at contact and contact is the frame that matters
   * most in it.
   */
  const step = 1 / hz
  const times: Seconds[] = []
  for (let t = window.start; t < window.end - 1e-9; t += step) times.push(t)
  /*
   * And the end, always, even when the last stride fell short of it. The span
   * is not a whole number of steps in general, so the final interval is
   * shorter than the rest — which is the right way round: the racket-head
   * window ends at contact, and losing contact to a rounding remainder would
   * drop the one frame the window exists for.
   */
  if (times[times.length - 1] !== window.end) times.push(window.end)

  const contains = (id: DetectorId, t: Seconds) => {
    const w = windows.get(id)!
    return t >= w.start - 1e-9 && t <= w.end + 1e-9
  }

  const read: SharedPassPlan['read'] = (frame, previous, t) => {
    const by: Partial<Record<DetectorId, unknown>> = {}
    for (const d of members) {
      if (!contains(d.id, t)) continue
      by[d.id] = d.read(frame, previous, t)
    }
    return { t, by }
  }

  const harvest: SharedPassPlan['harvest'] = (reads) => {
    const out: Partial<Record<DetectorId, DetectorReading<unknown>>> = {}
    for (const d of members) {
      /*
       * `asked` counts the grid, not the reads: the instants inside this
       * detector's own window that the pass put to the video. `read` counts
       * what came back. The gap between them is the footage, and it is the
       * distinction `DetectorCoverage` was written three counts wide for.
       */
      const asked = times.filter((t) => contains(d.id, t)).length
      const mine = reads.filter((r) => d.id in r.by)
      /*
       * A miss is `undefined` from the fold, and that is the one convention
       * this function adds to the contract. The pass cannot otherwise know
       * `found` — every fold returns something per frame — and passing a zero
       * would be the stand-in value this file refuses everywhere else. A
       * detector that means something different by `found` overrides it in
       * `finish`, which is handed the frames and can count them however it
       * likes.
       */
      const kept = mine.map((r) => r.by[d.id])
      const found = kept.filter((v) => v !== undefined).length
      out[d.id] = d.finish(kept, { asked, read: mine.length, found })
    }
    return out
  }

  return { window, times, read, harvest, members: members.map((d) => d.id), declined }
}
