/**
 * The two decisions inside reading a clip that are worth a test of their own
 * (L6.11), as pure functions. `useAnalysisRun` asks them; nothing here knows
 * about React, refs or the video.
 */
import type { View } from '../App'

/**
 * Whether a waiting new version may take over now. Only on the home screen,
 * with no clip held and no basket being swept: everywhere else a reload throws
 * away work in flight or work that exists only in memory.
 */
export function updateMayLand(o: { view: View['kind']; holdsVideo: boolean; sweeping: boolean }): boolean {
  return o.view === 'home' && !o.holdsVideo && !o.sweeping
}

/**
 * After one serve of a picked clip is read, whether the rest of the basket is
 * swept or the serve shown.
 *
 * Swept only when there is a basket (more than one serve), the serve just read
 * was believed (not refused, L1.7), the clip is still open to read again, and
 * the player is not on a court: a clip recorded in the app lands on the glance
 * and is swept later, from the report, if they ask.
 */
export function sweepAfterRead(o: { glance: boolean; serves: number; refused: boolean; clipOpen: boolean }): boolean {
  return !o.glance && o.serves > 1 && !o.refused && o.clipOpen
}
