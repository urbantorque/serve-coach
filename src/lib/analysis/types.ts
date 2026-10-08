import type { ServeType } from '../storage/prefs'
import type { BallFlight, TossFlight } from '../vision/ballTrack'
import type { Consistency } from './consistency'
import type { Diagnosis } from './diagnose'
import type { FlawId } from './flaws'
import type { BodyAxis } from './axes'
import type { Stretch } from './slowMotion'
import type { DrillCheck } from './progressions'
import type { RacketEstimate } from './racket'
import type { Triage as TriageResult } from './triage'
import type { KeyframePoses, SwingTrack } from '../storage/poseTrack'

/** A single pose landmark. */
export interface Landmark {
  x: number
  y: number
  z: number
  visibility: number
}

/**
 * One sampled frame of the serve.
 *
 * `image` coords are normalised to the frame AND aspect-corrected, so x and y
 * share a unit and Euclidean distance between two image landmarks is
 * meaningful. `world` coords are metres with the origin at the hip centre —
 * use those for joint angles, which should not depend on camera framing.
 */
export interface Frame {
  index: number
  t: number
  image: Landmark[]
  world: Landmark[]
  visibility: number
}

/**
 * Which rubric a report's scores were produced by.
 *
 * Scores are recalibrated from time to time — the floor moved from 6 to 30 and
 * the decay outside a band was softened — and a saved report deliberately keeps
 * no frames, so nothing can ever re-score one. Two rubrics therefore live side
 * by side in a history for as long as that history lasts, and a trend drawn
 * straight across them reports the recalibration as the player improving:
 * refilm the identical serve after an update and it "gains" far more than
 * `MEANINGFUL_DELTA`. Stamping the rubric is what lets `progress.ts` refuse.
 *
 * Bump this whenever a change would move the number a saved report already
 * carries — `scoreAgainst`, a target band, or how an area score is combined.
 * Bumping it when nothing moved costs a player one break in their chart; not
 * bumping it when something did costs them a gain they never made.
 */
// 3: the knee-bend band reopened to the 27-study meta-analysis, and the two ball
// bands — toss peak and fall before contact — re-anchored to published toss
// heights. Each moves a score a saved report already carries.
// 4: re-anchored on real serve motion (ANALYSIS-REVIEW.md §9) — a hand near the
// shoulder is a full racket drop, contact height starts at what published
// impact heights put a club wrist at, and arm extension is the straightest the
// arm gets near contact rather than one frame-rate-dependent sample.
// 5: the camera read against the court and the rig re-posed on real motion
// (ANALYSIS-REVIEW.md §9) — a clip from the guide's placement is now filed
// side-on and reports how far in front it was hit, the hand-under-elbow floor
// moved from 20% to 4%, and the racket drop is found on a narrower smooth at
// 30 fps, which moves the drop keyframe and every reading taken at it. Then,
// before any of it shipped, the court angle moved to the swing's direction, so
// a clip from a corner is filed as one — which readings it carries, and which
// axis a toss drift is named for, moved with it; the toss moved onto the
// tossing hand's peak, which moves every reading taken at or from it; and five
// noise floors rose when re-derived on real motion, which changes which faults
// a saved report would name (early shoulder rotation now needs an open chest).
export const SCORING_VERSION = 5

/**
 * What a report saved before the stamp existed is worth.
 *
 * Old-rubric by definition — there was only one rubric to be scored against
 * before this one — so it is a known version rather than an unknown one, and
 * naming it stops a caller from quietly treating it as current.
 */
export const LEGACY_SCORING_VERSION = 1

export type PhaseId = 'ready' | 'toss' | 'trophy' | 'drop' | 'contact' | 'finish'

export interface Phase {
  id: PhaseId
  label: string
  caption: string
  frame: number
  t: number
  thumbnail?: string
}

export type Status = 'great' | 'good' | 'fair' | 'work'

export interface Metric {
  id: string
  label: string
  /** Raw measured value, in `unit`. */
  value: number
  unit: string
  /**
   * Pre-formatted raw value, e.g. "168°" or "1.31×".
   *
   * Internal now rather than on screen: the report speaks in body positions, and
   * a coordinate multiplier next to the words was the thing a player skipped
   * over. Kept because the fixtures, the consistency sweep and the dev tools all
   * need the number in a comparable form, and regenerating it from `value` in
   * three places would be three chances to round it differently.
   */
  display: string
  /** What the body actually did, in body language — the on-screen readout. */
  readout: string
  /** What it should look like instead, said in the same vocabulary. */
  target: string
  /** Decimal places this metric is meaningful to; axis labels must match, or a
   *  value below its band can appear to sit inside it. */
  decimals: number
  /** The band we want the player inside. */
  ideal: [number, number]
  /** Axis bounds for the visual bar. */
  range: [number, number]
  score: number
  status: Status
  weight: number
  /** What this number means, in plain language. */
  insight: string
  /** What to do about it — only when it needs work. */
  fix?: string
  /** The one corrective drill for this fault. Present exactly when `fix` is. */
  drill?: Drill
  /** Which keyframe this was measured on. */
  phase: PhaseId
  /**
   * 0–1: how much this particular number can be trusted, which is not the same
   * across a report. Cropped feet soften every height ratio and no angles; too
   * few frames through the swing soften only the swing timing. Below
   * `SOFT_MEASUREMENT` the app hedges it and refuses to build advice on it.
   */
  confidence: number
  /** Why it is soft, when it is. Shown instead of a bare number. */
  softness?: string
}

export type FundamentalId = 'toss' | 'loading' | 'swing' | 'contact' | 'rhythm'

export interface Drill {
  name: string
  how: string
  reps: string
}

export interface Fundamental {
  id: FundamentalId
  label: string
  blurb: string
  phase: PhaseId
  score: number
  status: Status
  headline: string
  metrics: Metric[]
  drill: Drill
}

export interface Quality {
  /** 0–1. How much we trust this analysis. */
  confidence: number
  warnings: string[]
  view: 'side' | 'front-back' | 'angled'
  sampledFps: number
  /** Samples captured between racket drop and contact — the fastest moment. */
  swingSamples: number
}

export interface VideoMeta {
  name: string
  durationMs: number
  width: number
  height: number
}

export interface Analysis {
  id: string
  createdAt: number
  video: VideoMeta
  handedness: 'right' | 'left'
  quality: Quality
  phases: Phase[]
  fundamentals: Fundamental[]
  overall: number
  overallStatus: Status
  /**
   * How much slower than life the clip plays, when it was slow motion and the
   * app could tell — from the file's own boxes or the ball's fall
   * (`slowMotion.ts`). `frames`, `phases` and `ball` stay on the file's
   * clock for drawing and seeking; the measurements were read on the serve's.
   */
  stretch?: Stretch
  /**
   * How the basket swept from this report did against the top fix's ladder —
   * see `progressions.ts`. Absent until a basket has been swept.
   */
  drillCheck?: DrillCheck
  /**
   * The single thing to work on next.
   *
   * `flaw` and `axis` name the fault it came from, when it came from one —
   * absent for the measurement-ranking fallback and for every report saved
   * before they were carried. Only the fault demonstration reads them.
   */
  focus: { title: string; why: string; drill: Drill; flaw?: FlawId; axis?: BodyAxis }
  /**
   * The six keyframes as a tracked body — see `storage/poseTrack.ts`.
   *
   * Carried on `Analysis` rather than added when a report is saved, because
   * `Session` is `Omit<Analysis, 'frames'>` exactly and that discipline is worth
   * more than the redundancy: a live analysis has its frames and does not need
   * this, but making the save path build it would put the one field that has to
   * survive pruning behind a code path that runs once.
   *
   * Optional because every report written before it existed has none, and
   * because a clip whose keyframes could not be read produces no rows rather
   * than empty ones.
   */
  poses?: KeyframePoses
  /**
   * The whole swing as a tracked body — see `storage/poseTrack.ts`.
   *
   * Written instead of `poses`, never beside it: a track's rows are encoded
   * exactly as a keyframe's are, so `keyframesFromTrack` produces the six for
   * free and storing both would pay twice for the same rows. `poses` stays on
   * this type because reports written before tracks existed carry it, and
   * because the prune ladder's downgrade turns a track back into one.
   */
  track?: SwingTrack
  frames: Frame[]
  window: { start: number; end: number }
  /** Serves found in the clip, and which one this report is about. */
  serves: { count: number; index: number }
  /**
   * The scale everything was measured against: standing height and the court
   * surface, both in image units. Carried on the report rather than left inside
   * the detector because anything drawing over a saved serve — the racket
   * estimate, a model pose to compare against — needs the same reference the
   * measurements used, and a second guess at it would not line up.
   */
  scale: { bodyHeight: number; groundY: number }
  /**
   * The roll correction that was applied, when one was. Everything measured —
   * frames, ball, groundY — lives in the levelled space; the raw video pixels
   * do not, so anything drawing over them needs this to rotate the landmarks
   * back. `cx`/`cy` are the pivot `levelFrames` rotated about, in landmark
   * units. Absent on the clips that needed no correction, which is most.
   */
  tilt?: { roll_deg: number; cx: number; cy: number }
  /**
   * The tossed ball's flight, when it could be found in the pixels. Optional on
   * purpose: the body is always tracked, the ball is not, and a report is
   * perfectly valid without it. Plain data so it survives being stored. Lives
   * in the same levelled space as the frames when `tilt` is present.
   */
  ball?: BallFlight
  /**
   * The racket, where an EfficientDet-Lite pass over the trophy-to-contact
   * window actually found one in the pixels — a plain array rather than a
   * `Map` because this is stored the same way `ball` is, and a `Map` does not
   * survive a round trip through `JSON.stringify`. Empty on a clip the
   * detector never caught a racket in, or one with `skipRacketBoxes` set; the
   * wrist-and-knuckles guess in `racket.ts` still draws either way. Lives in
   * the same levelled space as `ball` when `tilt` is present, for the same
   * reason: `frame` indexes are into `frames` below, which is levelled.
   */
  racketBoxes?: { frame: number; estimate: RacketEstimate }[]
  /**
   * The toss, boiled down to three points — release, apex, and where the ball
   * had fallen to by contact — and the two ratios that come from them, in the
   * same body-height units as every other measurement here. A component can
   * draw and narrate the toss straight off this without knowing anything about
   * quadratic fits or gravity. Present exactly when `ball` is; a report is
   * still complete without it, the toss area just has one less thing to draw.
   */
  tossFlight?: TossFlight
  /**
   * Which serve this was judged as. Stored because the target bands differ, so a
   * score is only meaningful alongside the serve it was scored against — and the
   * trend chart would otherwise compare a kick serve to a flat one and call the
   * difference progress.
   */
  serveType: ServeType
  /**
   * The rubric `overall`, the area scores and every metric score here were
   * computed under. Stamped where those numbers are produced — `analyzeServe`
   * and `rescore` both set it — so a report carries its rubric from its first
   * render, hours before anything saves it.
   *
   * Stamping on the way into storage instead was a real bug and worth naming: a
   * freshly analysed report is on screen long before it is saved, so every
   * consumer reading it back saw no stamp and had to guess. `scoringVersionOf`
   * guesses old, which is right for a stored row and exactly wrong for a live
   * one — the comparison sheet then refused two serves scored identically and
   * accepted one across a recalibration.
   *
   * Optional only for reports that predate stamping, which arrive from storage
   * and leave `normalise` filled in as `LEGACY_SCORING_VERSION`, and for the
   * dev fixtures that assemble an `Analysis` by hand. Read it through
   * `scoringVersionOf` rather than `??`-ing a default at the call site.
   */
  scoringVersion?: number
  /**
   * Named mechanical breakdowns, with targets scaled to the rung above the
   * player. Raw data: numbers, enums and booleans, no prose.
   *
   * Optional because it is a separate pass over the same landmarks and a report
   * is complete without it — and because everything filed before the pass
   * existed has none. Carried on the report rather than recomputed on open, so a
   * saved serve keeps the diagnosis it was actually given.
   */
  diagnosis?: Diagnosis
  /**
   * What this analysis actually cost, in wall-clock milliseconds.
   *
   * MEASURED, WHICH IS THE POINT. "Half a minute" has been this codebase's
   * figure for a pipeline pass since the MVP baseline commit, and it appears in
   * roughly a dozen files justifying real decisions — why the framing preflight
   * is worth two seconds, why a rescore is arithmetic rather than a re-read,
   * why the live viewfinder must not heat the phone before an analysis. Nothing
   * ever timed it. `Diagnosis.cost.ms` times the diagnostic pass, which is the
   * cheap pure-computation part; the expensive half is the seeking and the pose
   * detection, and that was the half nobody measured.
   *
   * Two `performance.now()` calls, so this is free in the sense
   * `analyze.ts` uses when it declines to keep something expensive nobody
   * reads: the objection there is to a measurement that costs seeks, and this
   * costs none.
   *
   * It rides on the report and therefore reaches an exported fixture and a
   * backup file, which is how a phone on a court can hand back a real number
   * without anybody holding a stopwatch — see `COURT-CHECK.md` step 8.
   *
   * Optional because every report filed before this existed has none, and
   * because the dev fixtures assemble an `Analysis` by hand.
   */
  cost?: {
    /** Wall clock from the first frame read to the finished report. */
    ms: number
    /**
     * Whether either engine — pose or object detection — had to be fetched
     * during this pass.
     *
     * A first analysis on a cold cache pays a 57 MB download inside the same
     * span, and reporting that as the pipeline's cost would overstate it by an
     * amount that depends entirely on the network. Kept beside the number so a
     * reader can tell the two apart rather than averaging them together. One
     * boolean rather than one per engine: `timings.ts` only ever asks "was
     * this pass warm," never which download made it cold.
     */
    coldEngine: boolean
    /**
     * Whether the pose model read a crop round the server rather than the
     * whole frame — see `pose/playerCrop.ts`. Absent on reports filed before
     * the crop existed. Kept with the cost because it is the same kind of
     * fact: how this pass read the clip, for whoever is reading the export.
     */
    cropped?: boolean
    /**
     * How many frames of the swing RTMPose re-read (`pose/refineEngine.ts`),
     * or 0 when it did not run or gave up inside its time budget.
     */
    refined?: number
  }
  /**
   * The single thing to work on, or the reason this clip could not be read.
   *
   * The collapsed form of `diagnosis`: one flaw, one drill identifier, and how
   * much the clip itself was worth. Optional for the same reason the diagnosis
   * is — a report filed before it existed has none, and a consumer that does not
   * care about triage can ignore it entirely.
   */
  triage?: TriageResult
  /**
   * How far the measurements wandered across the serves in this clip.
   *
   * Attached to the report the sweep was run from, and therefore stored with it.
   * It used to live in React state beside the report instead, which had two
   * consequences worth naming. The player lost it the moment they navigated
   * away — the most expensive thing the app computes, gone on a back button —
   * and nothing could trend it, so the one number that actually describes a club
   * player's serve, the gap between their best and their worst, existed for
   * about ninety seconds and was never compared to anything.
   *
   * Present only on the report the sweep was run from, and only for a clip with
   * more than one readable serve. Its absence is the normal case.
   */
  consistency?: Consistency
}

/** The pose output behind a refusal, carried out so it can be filed as a test. */
export interface FailedCapture {
  frames: Frame[]
  fps: number
}

/** Thrown when the clip does not contain a recognisable serve. */
export class NotAServeError extends Error {
  readonly hints: string[]
  /**
   * The frames this refusal was decided from, attached only when the caller
   * asked for them via `AnalyzeOptions.captureOnFailure`.
   *
   * Refusals are the fixtures the suite most needs and the only ones that could
   * not be collected: the capture button lives on the report, and a clip
   * rejected here never reaches one, so the failure modes worth testing were
   * exactly the ones with no way to record them. The frames are handed over by
   * reference rather than copied, so this costs nothing beyond keeping them
   * reachable while the error is on screen — which is why it is opt-in and why
   * only dev builds opt in.
   */
  capture?: FailedCapture
  /**
   * The hand that actually swung, when the only thing wrong was which arm was
   * being watched. A refusal carrying this is not a verdict on the clip — the
   * swing was found, on the other side — so callers are expected to read it
   * again against this hand rather than show it to anybody.
   */
  suggestedHand?: 'right' | 'left'
  constructor(message: string, hints: string[]) {
    super(message)
    this.name = 'NotAServeError'
    this.hints = hints
  }
}

/**
 * Thrown when the browser cannot decode the file at all.
 *
 * Separate from `NotAServeError` because the two need completely different
 * advice: one is about how the serve was filmed, the other about what the file
 * is, and telling somebody whose phone saved an HEVC clip to "keep your whole
 * body in frame" sends them off to refilm something that will fail identically.
 */
export class UnreadableVideoError extends Error {
  readonly hints: string[]
  constructor(message: string, hints: string[]) {
    super(message)
    this.name = 'UnreadableVideoError'
    this.hints = hints
  }
}

/**
 * The actionable advice attached to an error, if it has any.
 *
 * Structural rather than `instanceof` for the reason given below: a duplicated
 * module turns `instanceof` silently false and every friendly explanation
 * degrades into a generic crash screen.
 */
export function hintsOf(err: unknown): string[] | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const hints = (err as { hints?: unknown }).hints
  return Array.isArray(hints) && hints.every((h) => typeof h === 'string') ? hints : undefined
}

/**
 * Prefer this over a bare `instanceof`. If this module ever ends up duplicated
 * across chunks, `instanceof` silently starts returning false and every
 * friendly "that wasn't a serve" message degrades into a generic crash screen.
 */
export const isNotAServeError = (err: unknown): err is NotAServeError =>
  err instanceof NotAServeError ||
  (typeof err === 'object' && err !== null && (err as Error).name === 'NotAServeError')
