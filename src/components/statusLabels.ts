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
