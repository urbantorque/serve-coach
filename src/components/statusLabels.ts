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
  fair: 'Refine',
  work: 'Work on this',
}

/**
 * How well the app could see this clip, as a word rather than a percentage.
 *
 * "68% confidence" invites arithmetic nobody performs: a player cannot act on
 * the difference between 68 and 74, and the figure reads as precision the
 * estimate does not have. Four words carry the only decision it feeds — whether
 * to trust the report or refilm.
 */
export function readQuality(confidence: number): string {
  if (confidence >= 0.8) return 'Sharp read'
  if (confidence >= 0.6) return 'Clear read'
  if (confidence >= 0.4) return 'Fair read'
  return 'Rough read'
}

/** Below this the read is hedged on screen rather than stated flat. */
export const SOFT_READ = 0.6
