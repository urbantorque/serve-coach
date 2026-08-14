/**
 * The decisions behind recording a serve in the page.
 *
 * The recording itself cannot be tested here — no browser, no camera, no
 * `MediaRecorder` — and that is exactly why the choosing was pulled out of the
 * component. What a browser will record, what it will then decode, and what the
 * resulting file is called are the three things that decide whether the player
 * ends up with a clip the analyser reads or one nothing can open, and all three
 * are ordinary logic.
 */
import {
  MAX_RECORDING_SECONDS,
  RECORDING_TYPES,
  playbackQuery,
  recordingFileName,
  recordingOutcome,
  recordingType,
} from '../record'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

/** A browser that supports exactly the types listed. */
const supporting = (...types: string[]) => ({
  isTypeSupported: (t: string) => types.includes(t),
})

heading('What this browser will record')

check('a browser with no MediaRecorder is not offered the button', () => {
  // The control disappears entirely rather than appearing and failing. Both
  // shapes of absence are the same answer: no API, and an API with no
  // capability check on it.
  assert(recordingType(undefined) === undefined, 'offered recording with no MediaRecorder')
  assert(recordingType({}) === undefined, 'offered recording with no isTypeSupported')
})

check('a browser that supports nothing is not offered the button', () => {
  assert(recordingType(supporting()) === undefined, 'offered a container nothing supports')
})

check('the H.264 question carries a profile, because a bare family answers maybe', () => {
  // `avc1` alone is a codec family. Browsers will not commit to a family, so the
  // honest-looking `maybe` that comes back is an artifact of the question rather
  // than a fact about the device.
  assert(
    playbackQuery('video/mp4;codecs=avc1') === 'video/mp4; codecs="avc1.42E01E"',
    playbackQuery('video/mp4;codecs=avc1'),
  )
  assert(playbackQuery('video/mp4') === 'video/mp4', playbackQuery('video/mp4'))
  assert(
    playbackQuery('video/webm;codecs=vp9') === 'video/webm; codecs="vp9"',
    playbackQuery('video/webm;codecs=vp9'),
  )
})

check('a container this browser will not play back is not chosen', () => {
  // The ordering above is a statement about which containers are *likely*
  // readable. For a long time it was the whole of the reasoning: whatever the
  // encoder took first was handed back, and nothing asked the decoder. On the
  // browser where the likelihood is wrong, the player serves and the file cannot
  // be opened — the failure this list exists to avoid, surviving inside it.
  const encodesWebmOnly = supporting('video/webm;codecs=vp9')
  const opensMp4Only = { canPlayType: (q: string) => (q.startsWith('video/mp4') ? 'probably' : '') }
  assert(
    recordingType(encodesWebmOnly, opensMp4Only) === undefined,
    'handed back a container this browser cannot open',
  )
})

check('a readable container beats a higher-ranked unreadable one', () => {
  const both = supporting('video/mp4', 'video/webm')
  const opensWebmOnly = { canPlayType: (q: string) => (q === 'video/webm' ? 'probably' : '') }
  assert(recordingType(both, opensWebmOnly) === 'video/webm', 'kept the unreadable ranking')
})

check('a browser with no canPlayType keeps the button it had', () => {
  // Absence of evidence must not remove a working control. Refusing a clip for
  // want of a threshold reading is the defect this codebase names most often,
  // and this is the same move in the recording path.
  const encodesWebmOnly = supporting('video/webm;codecs=vp9')
  assert(recordingType(encodesWebmOnly, undefined) === 'video/webm;codecs=vp9', 'lost the button')
  assert(recordingType(encodesWebmOnly, {}) === 'video/webm;codecs=vp9', 'lost the button')
})

check('maybe is playable, because Safari says it about files it plays', () => {
  const mp4 = supporting('video/mp4;codecs=avc1')
  const hedging = { canPlayType: () => 'maybe' }
  assert(recordingType(mp4, hedging) === 'video/mp4;codecs=avc1', 'read a hedge as a refusal')
})

check('MP4 is preferred over WebM where both are offered', () => {
  // Not a quality judgement. MP4/H.264 is the container every decoder in this
  // app's range opens — including Safari's, which is where a WebM recording
  // becomes a file the same phone cannot play back.
  const both = supporting('video/mp4;codecs=avc1', 'video/webm;codecs=vp9')
  assert(recordingType(both) === 'video/mp4;codecs=avc1', `chose ${recordingType(both)}`)
})

check('a browser that only records WebM still gets a button', () => {
  const webmOnly = supporting('video/webm;codecs=vp8')
  assert(recordingType(webmOnly) === 'video/webm;codecs=vp8', `chose ${recordingType(webmOnly)}`)
})

check('a bare type is tried after the parameterised one', () => {
  // Some browsers report the codec-qualified strings as unsupported and then
  // record the plain one perfectly well.
  const bare = supporting('video/webm')
  assert(recordingType(bare) === 'video/webm', `chose ${recordingType(bare)}`)
})

check('a capability check that throws is skipped, not fatal', () => {
  // A browser throwing from `isTypeSupported` is a browser being asked about a
  // string it has never heard of. Treating that as "no recording at all" would
  // remove the button from a device that can record perfectly well.
  const grumpy = {
    isTypeSupported: (t: string) => {
      if (t.includes('mp4')) throw new TypeError('unknown type')
      return t === 'video/webm;codecs=vp9'
    },
  }
  assert(recordingType(grumpy) === 'video/webm;codecs=vp9', `chose ${recordingType(grumpy)}`)
})

check('every type offered is one the list actually ranks', () => {
  // A guard against the list and the preference order drifting apart: whatever
  // comes back has to be a member, whichever browser is asked.
  for (const t of RECORDING_TYPES) {
    assert(recordingType(supporting(t)) === t, `${t} was supported and not chosen`)
  }
})

heading('What the recording is called')

check('the extension matches what was actually recorded', () => {
  // Everything downstream reads the name — `sessionKeyFor` keys stored reports
  // on it and the report prints it — so an .mp4 holding WebM is the kind of
  // wrong that only surfaces much later.
  const at = new Date(2026, 7, 13, 9, 5, 3)
  assert(recordingFileName('video/mp4;codecs=avc1', at).endsWith('.mp4'), 'mp4 was not named .mp4')
  assert(recordingFileName('video/mp4', at).endsWith('.mp4'), 'bare mp4 was not named .mp4')
  assert(recordingFileName('video/webm;codecs=vp9', at).endsWith('.webm'), 'webm was not named .webm')
})

check('two recordings in one afternoon get two different names', () => {
  // Six baskets called `serve` is six reports the player cannot tell apart, and
  // `sessionKeyFor` keys on the name.
  const a = recordingFileName('video/mp4', new Date(2026, 7, 13, 9, 5, 3))
  const b = recordingFileName('video/mp4', new Date(2026, 7, 13, 9, 5, 4))
  assert(a !== b, `both recordings were called ${a}`)
})

check('the stamp is local time, not UTC', () => {
  // Same defect `downloadBackup` already avoids: an evening west of Greenwich
  // stamped with tomorrow's date.
  const at = new Date(2026, 0, 2, 23, 30, 0)
  assert(
    recordingFileName('video/mp4', at).includes('2026-01-02'),
    `stamped ${recordingFileName('video/mp4', at)} for a local 2 January`,
  )
})

heading('Whether a stopped recording is the player handing it over')

check('the button stopping it hands the clip to the analyser', () => {
  // The ordinary path, and the only one that should reach `onRecorded`: the
  // preview is still running because the sheet is still open, and the player
  // pressed "Stop and analyse".
  assert(
    recordingOutcome({ previewLive: true, chunks: 3 }) === 'analyse',
    'a recording the player stopped was thrown away',
  )
})

check('the sheet closing underneath it discards, however much was recorded', () => {
  // The defect this exists to close. `FramingCheck`'s cleanup has to stop a
  // running recorder, and `onstop` then fires with a full set of chunks that
  // looks identical to a deliberate stop — so closing the viewfinder mid-serve
  // used to start half a minute of analysis on a clip the player had abandoned.
  // Every way out of that sheet reached it, the backdrop tap included.
  assert(
    recordingOutcome({ previewLive: false, chunks: 40 }) === 'discard',
    'an abandoned recording was handed over for analysis anyway',
  )
})

check('an encoder that produced nothing is discarded either way', () => {
  // Older than the case above and kept with it: `new Blob([])` reaches
  // `analyzeServe` as a zero-byte video and comes back, several seconds later,
  // as a message about camera formats.
  assert(recordingOutcome({ previewLive: true, chunks: 0 }) === 'discard', 'handed over no film')
  assert(recordingOutcome({ previewLive: false, chunks: 0 }) === 'discard', 'handed over no film')
})

check('liveness is what separates the two, not the amount of film', () => {
  // Stated as the property rather than as two examples, because the tempting
  // wrong fix is a length threshold — "a real serve is at least N chunks" —
  // which would discard a short deliberate recording and keep a long abandoned
  // one. The question is who stopped it.
  for (const chunks of [1, 5, 200]) {
    assert(
      recordingOutcome({ previewLive: true, chunks }) === 'analyse' &&
        recordingOutcome({ previewLive: false, chunks }) === 'discard',
      `${chunks} chunks was judged on its length rather than on who stopped it`,
    )
  }
})

heading('The backstop')

check('the cap is long enough for a basket and short enough to be a backstop', () => {
  // Not a limit anybody serves into: a serve needs four or five seconds and a
  // basket of six well under a minute. It exists because MediaRecorder holds
  // its chunks in memory until something stops it.
  assert(MAX_RECORDING_SECONDS >= 60, `a cap of ${MAX_RECORDING_SECONDS}s would cut a basket short`)
  assert(MAX_RECORDING_SECONDS <= 180, `a cap of ${MAX_RECORDING_SECONDS}s is not a backstop`)
})

report()
