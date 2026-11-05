/**
 * The two decisions inside reading a clip that are worth a test of their own
 * (L6.11), as pure functions. `useAnalysisRun` asks them; nothing here knows
 * about React, refs or the video.
 */
import type { View } from '../App'
import { looksLikeNonVideo } from '../lib/pose/errors'

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

/** The largest clip read at all: past this a phone runs out of memory decoding it. */
export const MAX_BYTES = 400 * 1024 * 1024

/**
 * A clip refused before the decoder is asked anything (M5.1): too large to read
 * here, or not a video at all. Its own function so the refusal is tested as
 * behaviour, where it used to be checked by reading the hook's source.
 */
export function earlyRefusal(file: { size: number; type: string }): { title: string; hints: string[] } | undefined {
  if (file.size > MAX_BYTES) {
    return {
      // Said for a session as well as a single serve (L2.2). "Three to five
      // seconds is all it needs" told somebody who filmed a whole practice
      // that it was the wrong thing to have done.
      title: 'That video is too large to read here',
      hints: [
        'For one serve, trim the clip to a few seconds around it.',
        'For a whole session, trim it into clips of a few minutes, or film at 1080p rather than 4K.',
        'Most phones let you trim in the photo library before sharing.',
      ],
    }
  }
  // Caught before the decoder is asked to explain a failure it did not have —
  // see `looksLikeNonVideo` for why this cannot be left to the decoder, on a
  // browser with no HEVC support.
  if (looksLikeNonVideo(file.type)) {
    return {
      title: 'That does not look like a video',
      hints: ['Pick a video clip from your camera roll rather than a photo or a document.', 'MP4 and MOV clips from a phone camera work best.'],
    }
  }
  return undefined
}

/**
 * Going home (M5.1): the clip is let go first, then home shows. The order is
 * the point: the update gate (`updateMayLand`) opens only once no clip is
 * held, so home holding the report's clip kept a waiting update shut until the
 * next analysis (L6.10).
 */
export function leaveForHome(steps: { releaseVideo: () => void; showHome: () => void; refresh: () => void }): void {
  steps.releaseVideo()
  steps.showHome()
  steps.refresh()
}

/**
 * What a failed read says when it came with no advice of its own.
 *
 * A dropped connection used to reach the player as tips about MP4 files. With no
 * signal the likely cause is the coach, or a part of the app, not being on the
 * phone yet, so that is what gets said.
 */
export function readFailure(online: boolean): { title: string; hints: string[] } {
  return online
    ? {
        title: 'Something went wrong reading that video',
        hints: ['Try a clip straight from your camera roll, not a shared link.', 'MP4 or MOV clips from a phone camera work best.'],
      }
    : {
        title: 'The coach is not on this phone yet',
        hints: ['Connect to the internet once, on Wi-Fi if you can, and the coach downloads.', 'After that it works with no signal at all.'],
      }
}
