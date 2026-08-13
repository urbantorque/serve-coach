/**
 * Recording the serve inside the page, off the stream the viewfinder is already
 * showing.
 *
 * Split from the component for the same reason `access.ts` is: the component
 * cannot be tested here — no browser, no camera, no `MediaRecorder` — and the
 * decisions can. Which container to ask for, whether this browser can be trusted
 * to record one at all, and how long a recording may run are ordinary logic, and
 * every one of them decides whether the player ends up with a file the analyser
 * can read or a file nothing can open.
 *
 * THE POINT OF RECORDING HERE is that the loop is otherwise minutes long: film
 * in the camera app, stop, leave the camera app, find the clip in the picker,
 * wait for the analysis. The moment feedback is worth most is between serves,
 * and every step in that list is spent not serving.
 *
 * THE FILE PICKER REMAINS FIRST CLASS. This is a third way in beside the picker
 * and the operating system's camera, and it is the one most likely to be absent:
 * `MediaRecorder` is not on every browser, and the containers it will record are
 * not always containers the same browser will decode. Where any of that is in
 * doubt the button is not shown at all, because a record button that produces a
 * file the app then refuses is worse than no record button.
 *
 * NOT VERIFIED ON A DEVICE, and the same caveat that heads `FramingCheck.tsx`
 * applies with more force here. Nothing in this repo has recorded a frame: the
 * pane this was developed against reports `document.hidden`, so no camera, no
 * encoder and no decode of the result has been exercised. What is tested below
 * is the choosing, which is all that can be.
 */

/**
 * Containers to try, best first.
 *
 * Ordered by what the analysis path can actually decode rather than by quality.
 * The clip is read back through a `<video>` element from an object URL, so a
 * recording this browser cannot then decode is a dead end that only shows up
 * after the player has served — and `analyze.ts` already has a whole error path
 * for HEVC files Chrome will not open, which is the same failure arriving from
 * the other direction.
 *
 * MP4/H.264 first because it is the one container every decoder in this app's
 * range opens, including Safari's, and because a file the player might later
 * share or keep should be one their phone understands. WebM after it, since
 * Chrome and Firefox record it reliably and decode it just as reliably. The bare
 * types last: some browsers report the parameterised strings as unsupported and
 * then happily record the plain one.
 *
 * `MediaRecorder` picks its own default when asked for nothing, and that default
 * is not always decodable by the same browser — which is precisely the case this
 * list exists to avoid, so there is deliberately no "just let it choose" entry.
 */
export const RECORDING_TYPES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/**
 * The longest a recording may run, in seconds.
 *
 * `MediaRecorder` accumulates its chunks in memory until it is stopped, so a
 * recording nobody ends is a phone filling up behind a viewfinder — and the
 * likeliest way for that to happen is the player putting the phone down and
 * walking to the baseline having forgotten which button they pressed.
 *
 * Ninety seconds is well past the four or five a serve needs and well past the
 * length of a basket of six, so the cap is a backstop rather than a limit
 * anybody serves into. The app already accepts clips of several minutes from the
 * picker; this bound is about memory in a live encoder, not about what can be
 * analysed.
 */
export const MAX_RECORDING_SECONDS = 90

/**
 * Whether this browser can be asked to record, and in what.
 *
 * Returns the first container it will both accept and decode, or nothing at all.
 * Nothing means the button does not appear.
 *
 * IT ASKS ABOUT DECODING NOW, WHICH IT DID NOT. The ordering above is a
 * statement about which containers are *likely* to be readable, and for a long
 * time it was the whole of the reasoning: whatever the encoder accepted first
 * was handed back, and the comment claimed "as far as anything here can tell"
 * about a question nothing here had asked. On any browser where the likelihood
 * is wrong, the player serves, the file lands, and nothing opens it — which is
 * the exact failure the ordering exists to avoid, surviving inside it. The
 * device check in `selfCheck.ts` was built to catch that and caught it before a
 * phone did.
 *
 * A SILENT DECODER IS NOT A REFUSAL. Where there is no `canPlayType` to ask —
 * the test runner, an old browser, anything that hands back something other than
 * a video element — the answer falls back to encoder support alone, which is
 * what this did before. Absence of evidence must not remove a working button;
 * that would be refusing a clip for want of a threshold reading, which this
 * codebase treats as a defect rather than as caution.
 *
 * `'maybe'` counts as playable. Safari says it about files it plays perfectly,
 * and reading it as a refusal would delete the record button from the browser
 * where recording in the page matters most.
 *
 * Written against injected probes so the choosing can be tested. The defaults
 * read the globals, both absent in the test runner.
 */
export function recordingType(
  recorder: { isTypeSupported?: (t: string) => boolean } | undefined = typeof MediaRecorder ===
  'undefined'
    ? undefined
    : MediaRecorder,
  decoder: { canPlayType?: (t: string) => string } | undefined = typeof document === 'undefined'
    ? undefined
    : document.createElement('video'),
): string | undefined {
  if (typeof recorder?.isTypeSupported !== 'function') return undefined
  const canAsk = typeof decoder?.canPlayType === 'function'
  for (const type of RECORDING_TYPES) {
    try {
      if (!recorder.isTypeSupported(type)) continue
    } catch {
      // A browser that throws from a capability check is a browser being asked
      // about a string it has never heard of. Try the next one rather than
      // treating the whole API as missing.
      continue
    }
    if (!canAsk || playsBack(decoder, type)) return type
  }
  // Something recordable, nothing readable. No button — see the note at the head
  // of this file: a control that produces a file the app then refuses is worse
  // than no control, and the file picker is still there.
  return undefined
}

/**
 * The `canPlayType` question for a `MediaRecorder` mime type.
 *
 * The two APIs disagree about syntax for the same container. `MediaRecorder`
 * takes `video/mp4;codecs=avc1`; `canPlayType` wants the codec quoted, and on
 * H.264 it will not answer better than `'maybe'` for a bare `avc1` — that is a
 * codec family rather than a codec, and browsers say so. `avc1.42E01E` is
 * baseline profile at level 3.0, which is what a phone encoder produces.
 *
 * Lives here rather than in `selfCheck.ts` so that the recording path does not
 * depend on the diagnostic that reports on it. The diagnostic imports this.
 */
export function playbackQuery(type: string): string {
  const [container, codecs] = type.split(';codecs=')
  if (!codecs) return container
  return `${container}; codecs="${codecs === 'avc1' ? 'avc1.42E01E' : codecs}"`
}

/**
 * Whether a `<video>` on this browser will play back what `MediaRecorder` would
 * write.
 */
function playsBack(
  decoder: { canPlayType?: (t: string) => string } | undefined,
  type: string,
): boolean {
  if (typeof decoder?.canPlayType !== 'function') return false
  try {
    // Anything but the empty string. `'maybe'` is Safari's answer about files it
    // plays perfectly, so treating it as a no would be the overclaim in reverse.
    return decoder.canPlayType(playbackQuery(type)) !== ''
  } catch {
    return false
  }
}

/**
 * The file name a recording is handed to the rest of the app under.
 *
 * The extension has to match the container, because everything downstream reads
 * the name: `sessionKeyFor` keys stored reports on it, the report prints it, and
 * a `.mp4` holding WebM is the kind of thing that is only wrong much later.
 *
 * Stamped with the local date and time so a player who records six baskets in an
 * afternoon has six distinguishable files rather than six called `serve` — and
 * local rather than ISO for the same reason `downloadBackup` is: an evening west
 * of Greenwich would otherwise be stamped tomorrow.
 */
export function recordingFileName(type: string, at: Date): string {
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm'
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}` +
    `-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`
  return `serve-${stamp}.${ext}`
}
