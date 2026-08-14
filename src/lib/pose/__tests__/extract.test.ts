/**
 * The parts of `extract.ts` that can be reached without a real decoder.
 *
 * Most of this module cannot: it exists to drive a `<video>`, a decoder and a
 * pose graph, and `readWindow` is the long-standing exception tested elsewhere
 * for being pure arithmetic. `looksLikeNonVideo` is the second — a string
 * check, pulled out of `App.tsx`'s ingestion path specifically so R31's
 * finding, a non-video file misdiagnosed as "most likely HEVC" on a browser
 * with no HEVC support, could be pinned rather than re-walked by hand.
 *
 * `captureThumbnails` is the third, and it is here because what needed
 * checking is *how many times it seeks*, not what it draws. A recording stub
 * standing in for the video and the canvas answers that exactly — the same
 * trade `drawing.test.ts` already makes for the overlay — and counting seeks
 * is the whole of R39's claim.
 */
import {
  captureThumbnails,
  describeDecodeFailure,
  loadVideo,
  looksLikeNonVideo,
} from '../extract'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

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

/* ------------------------------------------------ stills, and when to stop */

/**
 * Enough of a `<video>`, a canvas and a `document` for `captureThumbnails`.
 *
 * The seek is the expensive thing being counted, so it is the thing this
 * records. Assigning `currentTime` dispatches `seeked` on a microtask, which is
 * what `waitFor` is waiting on; `requestVideoFrameCallback` is deliberately
 * absent, since a browser without it is a case the real code already skips.
 */
function stubCanvasHost() {
  const seeks: number[] = []
  const encodes: number[] = []
  const listeners = new Map<string, (() => void)[]>()
  let currentTime = 0

  const video = {
    duration: 10,
    videoWidth: 640,
    videoHeight: 480,
    get currentTime() {
      return currentTime
    },
    set currentTime(t: number) {
      currentTime = t
      seeks.push(t)
      queueMicrotask(() => {
        for (const fn of listeners.get('seeked') ?? []) fn()
      })
    },
    addEventListener(name: string, fn: () => void) {
      listeners.set(name, [...(listeners.get(name) ?? []), fn])
    },
    removeEventListener(name: string, fn: () => void) {
      listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn))
    },
  }

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage() {} }),
    toDataURL: () => {
      encodes.push(1)
      return 'data:image/jpeg;base64,stub'
    },
  }

  const previous = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = { createElement: () => canvas }
  const restore = () => {
    ;(globalThis as { document?: unknown }).document = previous
  }

  return { video: video as unknown as HTMLVideoElement, seeks, encodes, restore }
}

/**
 * The captures are run here and asserted below, rather than inside `check`.
 *
 * `check` is synchronous — it records a pass the moment its callback returns —
 * so a promise handed back to it would report green before a single assertion
 * had run. Awaited at the top level and checked against afterwards, which is
 * the shape `engine.test.ts` already uses for the sweep.
 */
async function captureRun(times: number[], abortAt?: number) {
  const host = stubCanvasHost()
  const controller = new AbortController()
  try {
    const stills = await captureThumbnails(
      host.video,
      times,
      // Aborting from inside `decorate` puts the stop exactly where a thumb on
      // the button would: part way through a frame the pass had already begun.
      (_ctx, i) => {
        if (i === abortAt) controller.abort()
      },
      // Positional `undefined` so `maxWidth` keeps its default.
      undefined,
      abortAt === undefined ? undefined : controller.signal,
    )
    return { stills, seeks: host.seeks.length, encodes: host.encodes.length }
  } finally {
    host.restore()
  }
}

const SIX = [1, 2, 3, 4, 5, 6]
const uninterrupted = await captureRun(SIX)
const stoppedAtSecond = await captureRun(SIX, 1)
const stoppedAtThird = await captureRun(SIX, 2)

heading('When the stills stop being worth capturing')

check('with nobody cancelling, every keyframe is captured', () => {
  assert(uninterrupted.stills.length === 6, `captured ${uninterrupted.stills.length} of 6 stills`)
  assert(uninterrupted.seeks === 6, `seeked ${uninterrupted.seeks} times for 6 stills`)
})

check('a cancelled analysis stops seeking instead of finishing the filmstrip', () => {
  // The defect. This was the one pass in the pipeline taking no signal, so
  // pressing stop left the remaining seeks and JPEG encodes still to run
  // against a report nobody would see — and in a sweep, where every serve
  // captures its stills, stopping is an ordinary thing to do.
  note(`${stoppedAtSecond.seeks} seeks and ${stoppedAtSecond.encodes} encodes before it stopped`)
  assert(stoppedAtSecond.seeks === 2, `kept seeking after the stop: ${stoppedAtSecond.seeks} seeks`)
  assert(
    stoppedAtSecond.encodes === 2,
    `kept encoding after the stop: ${stoppedAtSecond.encodes} encodes`,
  )
})

check('stopping keeps the stills already taken rather than throwing them away', () => {
  // Returning short rather than throwing `Cancelled` is the point, and the two
  // are not interchangeable: the serve is fully measured by the time this runs,
  // and `sweepServes` drops a cancelled serve without counting it. Throwing
  // from here would discard a whole measurement to save a handful of seeks.
  assert(
    stoppedAtThird.stills.length === 3,
    `kept ${stoppedAtThird.stills.length} of the 3 stills taken before the stop`,
  )
  assert(
    stoppedAtThird.stills.every((s) => s.startsWith('data:image/')),
    'a still taken before the stop came back empty',
  )
})

check('where the stop lands is what decides how much was kept', () => {
  // Stated as the relationship rather than as two numbers, so a change that
  // happens to shift both by one is still caught.
  assert(
    stoppedAtThird.seeks === stoppedAtSecond.seeks + 1,
    `stopping one frame later kept ${stoppedAtThird.seeks} against ${stoppedAtSecond.seeks}`,
  )
  assert(
    uninterrupted.seeks > stoppedAtThird.seeks,
    'stopping saved no seeks at all against running to the end',
  )
})

/* ------------------------------------------- what a refused clip is told */

/**
 * The four `MediaError` codes, by the names the spec gives them.
 *
 * Declared here because Node has no `MediaError`, and the module under test
 * reads it as a global. Values are the spec's, not invented: a stub numbering
 * them differently would let the branches pass while agreeing with nothing a
 * browser actually reports.
 */
const MEDIA_ERR = { ABORTED: 1, NETWORK: 2, DECODE: 3, SRC_NOT_SUPPORTED: 4 } as const

/**
 * A browser that does or does not have an HEVC decoder.
 *
 * `supportsHEVC` asks a throwaway `<video>` element, so this is the whole of
 * what has to be faked to drive both sides of the branch that matters most —
 * and it is the branch that matters most because the clip in question looks
 * perfect in the player's camera roll.
 */
function withDecoder<T>(hevc: boolean, fn: () => T): T {
  const previousDoc = (globalThis as { document?: unknown }).document
  const previousErr = (globalThis as { MediaError?: unknown }).MediaError
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => ({
      canPlayType: (type: string) => (hevc && /hvc1|hev1/.test(type) ? 'probably' : ''),
    }),
  }
  ;(globalThis as { MediaError?: unknown }).MediaError = {
    MEDIA_ERR_ABORTED: MEDIA_ERR.ABORTED,
    MEDIA_ERR_NETWORK: MEDIA_ERR.NETWORK,
    MEDIA_ERR_DECODE: MEDIA_ERR.DECODE,
    MEDIA_ERR_SRC_NOT_SUPPORTED: MEDIA_ERR.SRC_NOT_SUPPORTED,
  }
  try {
    return fn()
  } finally {
    ;(globalThis as { document?: unknown }).document = previousDoc
    ;(globalThis as { MediaError?: unknown }).MediaError = previousErr
  }
}

const failed = (code: number | undefined, hevc: boolean) =>
  withDecoder(hevc, () =>
    describeDecodeFailure({ error: code === undefined ? null : { code } } as unknown as HTMLVideoElement),
  )

heading('What a clip the browser cannot open is told to do about it')

check('every refusal carries something the player can actually do', () => {
  // The point of this whole function. "This video could not be decoded" is a
  // sentence with no action in it, and the clip plays fine in their camera roll,
  // so it reads as the app being broken.
  for (const hevc of [true, false]) {
    for (const code of [undefined, MEDIA_ERR.ABORTED, MEDIA_ERR.NETWORK, MEDIA_ERR.DECODE, MEDIA_ERR.SRC_NOT_SUPPORTED]) {
      const err = failed(code, hevc)
      assert(err.message.trim().length > 0, `code ${code} produced no message`)
      assert(err.hints.length > 0, `code ${code} (hevc ${hevc}) produced no hints`)
      assert(
        err.hints.every((h) => h.trim().length > 0),
        `code ${code} (hevc ${hevc}) produced a blank hint`,
      )
    }
  }
})

check('a browser with no HEVC decoder is told about High Efficiency and the setting that changes it', () => {
  // The case this exists for: an iPhone on its default setting writes HEVC,
  // Safari plays it, Chrome on Windows often will not. Naming the codec and the
  // Settings path turns a dead end into a thirty-second fix.
  for (const code of [MEDIA_ERR.DECODE, MEDIA_ERR.SRC_NOT_SUPPORTED]) {
    const err = failed(code, false)
    const all = err.hints.join(' ')
    assert(/High Efficiency/.test(all), `code ${code} did not name the format`)
    assert(/Settings › Camera › Formats/.test(all), `code ${code} did not give the fix`)
    // The escape hatch for a clip already filmed, which the setting cannot help.
    assert(/WhatsApp|email/.test(all), `code ${code} left an existing clip with nowhere to go`)
  }
})

check('a browser that can play HEVC is never told its clip is probably HEVC', () => {
  // The guess is deliberate and it is only defensible where the browser has
  // just admitted it has no decoder. Made on a browser that does, it is
  // confidently wrong about a file whose real problem is something else.
  for (const code of [MEDIA_ERR.DECODE, MEDIA_ERR.SRC_NOT_SUPPORTED, MEDIA_ERR.NETWORK, undefined]) {
    const all = failed(code, true).hints.join(' ')
    assert(!/High Efficiency/.test(all), `code ${code} guessed HEVC at a browser that decodes it`)
  }
})

check('the two decodable-browser failures are told apart, not merged', () => {
  // A file that is not a video and a file that died part way through decoding
  // need different actions — re-export it, versus wait for iCloud to finish
  // downloading it — and only one of them is about the file being incomplete.
  const unsupported = failed(MEDIA_ERR.SRC_NOT_SUPPORTED, true)
  const decode = failed(MEDIA_ERR.DECODE, true)
  assert(unsupported.message !== decode.message, 'both failures produced the same sentence')
  assert(
    /incomplete|iCloud|Google Photos/.test(decode.hints.join(' ')),
    'a part-way decode failure did not mention an unfinished download',
  )
})

check('a failure with no code at all still says something useful', () => {
  // `video.error` can be null when the wait timed out rather than errored —
  // `waitFor` resolves on its timeout, so this path is reachable.
  const err = failed(undefined, true)
  assert(err.hints.length >= 2, 'the fallback refusal has fewer than two hints')
  assert(/trimming|MP4|MOV/i.test(err.hints.join(' ')), 'the fallback offers nothing concrete')
})

/* ------------------------------------------------ refusals before any frame */

/** A `<video>` that has already finished loading, one way or another. */
function loadedVideo(over: Partial<Record<string, unknown>>): HTMLVideoElement {
  return {
    src: '',
    muted: false,
    playsInline: false,
    preload: '',
    // Past both waits in `loadVideo`, so the checks are what is being exercised
    // rather than the event plumbing.
    readyState: 2,
    error: null,
    duration: 5,
    videoWidth: 640,
    videoHeight: 480,
    ...over,
  } as unknown as HTMLVideoElement
}

async function refusalFrom(video: HTMLVideoElement, hevc: boolean): Promise<Error | undefined> {
  const previousDoc = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => ({
      canPlayType: (type: string) => (hevc && /hvc1|hev1/.test(type) ? 'probably' : ''),
    }),
  }
  try {
    await loadVideo(video, 'blob:whatever')
    return undefined
  } catch (err) {
    return err as Error
  } finally {
    ;(globalThis as { document?: unknown }).document = previousDoc
  }
}

const noLength = await refusalFrom(loadedVideo({ duration: NaN }), true)
const noLengthNoHevc = await refusalFrom(loadedVideo({ duration: NaN }), false)
const zeroLength = await refusalFrom(loadedVideo({ duration: 0 }), true)
const noPicture = await refusalFrom(loadedVideo({ videoWidth: 0 }), true)
const fine = await refusalFrom(loadedVideo({}), true)

heading('Refusals the decoder reaches before a single frame is read')

check('a readable clip is not refused', () => {
  assert(fine === undefined, `a perfectly ordinary clip was refused: ${fine?.message}`)
})

check('a clip with no readable length is refused rather than measured', () => {
  // Both shapes of it. `NaN` is the common one — a container the browser parsed
  // but could not size — and zero is what a still-downloading file reports.
  assert(noLength !== undefined, 'a clip with NaN duration was accepted')
  assert(zeroLength !== undefined, 'a clip with zero duration was accepted')
  assert(/no readable length/.test(noLength!.message), `unexpected: "${noLength!.message}"`)
})

check('the no-length advice changes with whether the browser has HEVC', () => {
  // The same failure means different things on the two browsers, and only one
  // of them should be sent to the iPhone camera setting.
  const withHevc = (noLength as unknown as { hints: string[] }).hints.join(' ')
  const without = (noLengthNoHevc as unknown as { hints: string[] }).hints.join(' ')
  assert(!/HEVC/.test(withHevc), 'a browser that decodes HEVC was told its clip was HEVC')
  assert(/HEVC/.test(without), 'a browser with no HEVC decoder was not told the likely cause')
  note('no-length refusal names HEVC only where the browser cannot decode it')
})

check('an audio-only file gets the specific answer, not a guess about the codec', () => {
  // This is the answer `looksLikeNonVideo` deliberately steps aside for: it
  // returns false for `audio/*` precisely so the decoder can say this instead.
  assert(noPicture !== undefined, 'a file with no video track was accepted')
  assert(/no picture in that file/.test(noPicture!.message), `unexpected: "${noPicture!.message}"`)
  assert(
    /audio recording/.test((noPicture as unknown as { hints: string[] }).hints.join(' ')),
    'the no-picture refusal does not mention the likeliest cause',
  )
})

report()
