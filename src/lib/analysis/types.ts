import type { ServeType } from '../storage/prefs'
import type { BallFlight, TossFlight } from '../vision/ballTrack'
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
   * Which serve this was judged as. Stored because the target bands differ, so a
   * score is only meaningful alongside the serve it was scored against — and the
   * trend chart would otherwise compare a kick serve to a flat one and call the
   * difference progress.
   */
  serveType: ServeType
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
}

/** Thrown when the clip does not contain a recognisable serve. */
export class NotAServeError extends Error {
  readonly hints: string[]
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
