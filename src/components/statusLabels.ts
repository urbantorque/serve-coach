import type { Status } from '../lib/analysis/types'

/**
 * What each score band is called on screen.
 *
 * In its own module rather than alongside the components that use it. A file that
 * exports both components and plain values is not a clean fast-refresh boundary:
 * editing anything in it forces a full page reload instead of a component swap,
 * and in this app a full reload throws away the analysis — thirty seconds of pose
 * detection on a video the page no longer has a handle to.
 */
export const STATUS_LABEL: Record<Status, string> = {
  great: 'Strong',
  good: 'Solid',
  // Not "Refine". Beside "Strong" and "Solid" — two plain judgements — a lone
  // abstract verb asks the player to work out what it is even rating.
  fair: 'Nearly there',
  // Not "Work on this": the report's one priority is headed "Work on this next",
  // and a fair report can tag five cards with it. The tag names the band; the
  // heading names the single thing to do about it.
  work: 'Needs work',
}

/**
 * How well the app could see this clip, said as what it did rather than a score.
 *
 * "68% confidence" invites arithmetic nobody performs: a player cannot act on
 * the difference between 68 and 74, and the figure reads as precision the
 * estimate does not have. Four phrases carry the only decision it feeds —
 * whether to trust the report or refilm.
 *
 * Phrased as the app reporting on itself, because the earlier set graded the
 * clip — "Sharp read" over "Clear read" — and those are the same word to
 * anybody not holding the ladder that separates them. Two of four bands may as
 * well not have existed.
 */
export function readQuality(confidence: number): string {
  if (confidence >= 0.8) return 'Saw it clearly'
  if (confidence >= 0.6) return 'Saw it well'
  if (confidence >= 0.4) return 'Saw it partly'
  return 'Struggled to see it'
}

/** Below this the read is hedged on screen rather than stated flat. */
export const SOFT_READ = 0.6
