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
import { captureThumbnails, looksLikeNonVideo } from '../extract'
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

report()
