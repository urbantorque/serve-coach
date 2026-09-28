/** The "This serve" drawer's collapsed height rule (finding 70). */

/** Below this height (phones in landscape) the collapsed drawer is its title row only. */
export const PEEK_TITLE_ONLY_BELOW = 480
/** Below this height, or with large text, it shows the first (focus) value only (finding 70: 360x740). */
export const PEEK_ONE_ROW_BELOW = 760

/**
 * How many values the collapsed drawer shows: all of the peek on tall screens; only the first (focus)
 * value on short screens or with large text (iOS Larger Text, Android font scale); none, just its title
 * and "All values", on a phone in landscape. So the video's controls stay clear of it on load.
 */
export function peekRowsFor(innerHeight: number, rootPx: number): 'all' | 1 | 0 {
  if (innerHeight < PEEK_TITLE_ONLY_BELOW) return 0
  // Very large text on a short phone: one value alone is about 200 px tall (320 x 640 at 200%).
  if (rootPx > 24 && innerHeight < 700) return 0
  if (innerHeight < PEEK_ONE_ROW_BELOW || rootPx > 20) return 1
  return 'all'
}
