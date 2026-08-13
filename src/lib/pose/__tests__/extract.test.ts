/**
 * `looksLikeNonVideo`, the one decision in this file that does not need a
 * video element to make.
 *
 * Everything else here needs a real `<video>`, a real decoder and real
 * frames — this file's own `readWindow` is the exception already tested
 * elsewhere for being pure arithmetic, and `looksLikeNonVideo` is the
 * second: a string check, pulled out of `App.tsx`'s ingestion path
 * specifically so R31's finding — a non-video file misdiagnosed as "most
 * likely HEVC" on a browser with no HEVC support — could be pinned by a
 * test rather than left to a live walk each time.
 */
import { looksLikeNonVideo } from '../extract'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

heading('Whether a declared type already rules out a video')

check('a document or a photo is caught', () => {
  assert(looksLikeNonVideo('text/plain'), 'a text file was not caught')
  assert(looksLikeNonVideo('image/jpeg'), 'a photo was not caught')
  assert(looksLikeNonVideo('application/pdf'), 'a PDF was not caught')
})

check('a real video container is never caught, whatever the codec inside it', () => {
  // The type is the container, not the codec — a real HEVC .mov still says
  // video/quicktime, and this must not be the reason it stops reaching the
  // decoder's own, more specific HEVC guess.
  assert(!looksLikeNonVideo('video/mp4'), 'an MP4 container was caught')
  assert(!looksLikeNonVideo('video/quicktime'), 'a QuickTime container was caught')
  assert(!looksLikeNonVideo('video/webm'), 'a WebM container was caught')
})

check('an empty type is not evidence of anything, so it is not caught', () => {
  // Absence of evidence must not remove a working path — the same rule
  // `recordingType` already applies to a missing capability check, applied
  // here to a missing MIME type instead of a missing API.
  assert(!looksLikeNonVideo(''), 'a browser declining to name the type was read as a refusal')
})

check('an audio-only file is left to the decoder\'s own, more specific answer', () => {
  // loadVideo already says "There is no picture in that file" once it has
  // actually looked — catching audio/* here would replace a precise answer
  // with a vaguer one.
  assert(!looksLikeNonVideo('audio/mpeg'), 'an audio file was caught before the decoder could be specific')
})

report()
