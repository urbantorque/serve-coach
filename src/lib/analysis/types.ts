import type { ServeType } from '../storage/prefs'
import type { BallFlight, TossFlight } from '../vision/ballTrack'
import type { DetectorCoverage } from '../vision/detector'
import type { Consistency } from './consistency'
import type { Diagnosis } from './diagnose'
import type { Triage as TriageResult } from './triage'

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
export const SCORING_VERSION = 2

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

/**
 * What the ball did after it was hit.
 *
 * The outcome variable, and the reason it is worth the seeks: a club player is
 * told to change their technique on the strength of angles measured off their
 * body, and nothing in the report has so far checked what any of it produced.
 *
 * Present rarely, and the rarity is the honest part. The ball is in shot for
 * 25–55 ms after contact at the framing this app recommends, so ordinary 30 fps
 * video contains one or two frames of it and this is absent. See `coverage`
 * below and the header of `trackOutbound`.
 *
 * Speed and angle come from one straight-line fit through one set of frames, so
 * there is one `coverage` and two confidences. They are not interchangeable
 * numbers: the angle is a ratio of two image displacements and needs no scale at
 * all, while the speed is divided by the player's measured standing height and
 * inherits everything that is uncertain about the camera's distance and angle.
 * The angle is therefore always the better-founded of the two, and a consumer
 * that shows only one should show that one.
 *
 * WHERE THE SERVE LANDED IS NOT HERE, AND IS NOT COMING FROM THIS. In or out,
 * and T or body or wide, are the two things a player would ask for first, and
 * both are answers about the court rather than about the ball: they need the
 * service box located in the image, which means detecting court lines. This app
 * deliberately does not — see the header of `spatial.ts` for the argument, which
 * is that lines on real footage are worn, wet, shadowed, cropped or out of shot,
 * and precision that cannot be validated is not precision. Nothing here is a
 * step towards placement and nothing downstream should present it as one: the
 * ball is out of frame 33 ms after contact, roughly a tenth of the way to the
 * net, so even a perfect launch vector would be extrapolating the other nine
 * tenths through spin and drag this app cannot see. "This needs court lines" is
 * the whole answer, and it is a different piece of work.
 *
 * On the camera, two effects and only one of them is corrected. Roll is, and has
 * to be — measured at eight degrees of roll for eight degrees of launch angle,
 * in a quantity whose interesting range is about ten. Pitch is not measured
 * anywhere in this app and does not need to be: it rotates the camera about an
 * axis running along the ball's travel, so it cannot turn the ball's direction
 * in the image, and 15 degrees of it moved the angle 0.22 degrees.
 */
export interface OutboundBall {
  /**
   * The two numbers, or nothing at all.
   *
   * Optional as a group rather than one by one, because they come from one
   * straight-line fit: there is no clip on which the speed was measured and the
   * angle was not. Absent is the ordinary case and carries no stand-in value of
   * any kind — `coverage` below is what says why.
   */
  flight?: OutboundFlightReading
  /**
   * How much of the post-contact window was actually filmed and detected.
   *
   * Present even when `flight` is not, which is the whole reason this wrapper
   * exists. `asked` minus `read` is film that does not exist — the clip was shot
   * at a lower frame rate than the window was sampled at and the repeats were
   * dropped, or the decoder refused the seek outright. `asked` is counted off
   * the list of instants before any of them is requested, so a refused seek
   * cannot vanish from both counts and leave the coverage looking perfect.
   * `read` minus `found` is film that exists with no ball
   * resolved in it, which is motion blur or a busy background. The two want
   * opposite advice from a coach, and without both counts a report can only say
   * "no reading" and leave the player to guess.
   */
  coverage: DetectorCoverage
}

export interface OutboundFlightReading {
  /**
   * How fast the ball left, in the player's own body heights per second.
   *
   * NOT km/h, and the omission is the point. Turning this into a real-world
   * speed means one multiplication — by 1.78 m, the standing height every
   * measurement in this app is scaled against — and that number is an
   * assumption about the player, not a measurement of them. For an adult it is
   * within a few percent. For a twelve-year-old at 1.45 m it is 23% high, and a
   * 23% error is the difference between a serve that is honestly quick for a
   * junior and a claim that they hit harder than they do. Every other height in
   * this report is stated in body heights for the same reason, so this is the
   * house unit rather than a dodge.
   *
   * A lower bound in one direction and a mixed reading in another. The ball's
   * travel is taken as running along the player's depth axis and read back
   * through `axes.ts` at the measured camera yaw; a serve hit wide carries real
   * lateral travel that no single image-x reading can separate out, and that is
   * what `speedConfidence` is mostly about.
   */
  speed: number
  /**
   * 0–1. The straight-line fit's own quality times what the camera angle is
   * worth, on the same scale as every other confidence on this report.
   */
  speedConfidence: number
  /**
   * Degrees from horizontal, positive upwards. A flat first serve leaves a
   * couple of degrees below horizontal; a kick serve leaves above it.
   *
   * Measured with the phone's measured roll rotated out, so a phone held
   * crooked does not become a launch angle. Every degree of roll is a degree of
   * angle, one for one, so this is removed at any size rather than past the
   * threshold the pose frames are re-detected at — what is left is the roll
   * estimator's own error of a degree or two, which `launchAngleConfidence`
   * prices through `roll_confidence`.
   *
   * Free of the player's height and the camera's distance, which cancel between
   * the two image displacements. NOT free of the camera's angle: the horizontal
   * is divided by the depth gain at the measured yaw before the arctangent, so
   * a corner camera reads a flatter angle than a side-on one would for the same
   * ball. That is the other half of what `launchAngleConfidence` carries.
   */
  launchAngle_deg: number
  /** 0–1, and always at least `speedConfidence` — see the note above. */
  launchAngleConfidence: number
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
  /** The single thing to work on next. */
  focus: { title: string; why: string; drill: Drill }
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
   * The toss, boiled down to three points — release, apex, and where the ball
   * had fallen to by contact — and the two ratios that come from them, in the
   * same body-height units as every other measurement here. A component can
   * draw and narrate the toss straight off this without knowing anything about
   * quadratic fits or gravity. Present exactly when `ball` is; a report is
   * still complete without it, the toss area just has one less thing to draw.
   */
  tossFlight?: TossFlight
  /**
   * What the ball did after contact, on the rare clips that filmed it.
   *
   * Absent on almost every clip, and absent is the correct reading rather than a
   * failure — see `OutboundBall`. Nothing scores off it yet: it is a measurement
   * looking for a card, and wiring it into one is `metrics.ts`/`coaching.ts`
   * work. Landed here first so the measurement and its coverage exist to be
   * argued with before any prose is written around them.
   */
  outbound?: OutboundBall
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
