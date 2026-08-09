import type { PoseLandmarker } from '@mediapipe/tasks-vision'
import {
  findServes,
  peakCandidates,
  planRefinement,
  planScan,
  type ReachSample,
} from '../analysis/serves'
import { bridgeDetectionGaps, type PoseSample } from '../analysis/kalman'
import { UnreadableVideoError, type Frame, type Landmark } from '../analysis/types'
import { nextVideoTimestamp } from './poseEngine'

/** Clips this short are sampled in one pass; longer ones get a locating scan. */
const SINGLE_PASS_SECONDS = 4.5
/**
 * Phone video is almost universally 30 fps, so sampling faster than this
 * re-reads the same decoded frames at roughly 55 ms a piece and learns nothing.
 * Slow-motion footage still gets more samples through the swing, because it
 * spreads the same motion over more seconds of file. Sub-frame timing is
 * recovered analytically instead — see refineExtremum in phases.ts.
 */
const FINE_FPS = 32
const MAX_FINE_FRAMES = 120
/** How much of the clip around contact is worth sampling densely. */
const LEAD_IN = 1.9
const LEAD_OUT = 0.8
/**
 * How much of a long clip to read when the locating scan found nothing in it.
 *
 * The frame budget is fixed, so the span it is spread over sets the sampling
 * rate: `MAX_FINE_FRAMES / FINE_FPS` is 3.75 s at full rate, and anything wider
 * trades frames per second for seconds covered. Reading a whole long clip is
 * therefore the one option that cannot work — an 18-second clip lands near
 * 6 fps, where the swing from racket drop to contact gets less than a single
 * sample and no amount of good filming can rescue it.
 *
 * Five seconds holds a whole service motion with room either side and still
 * samples at 24 fps, which resolves the swing. Wider would cover more of the
 * clip and read none of it.
 */
const FALLBACK_SPAN = 5

export interface ReadWindow {
  start: number
  end: number
  serves: { count: number; index: number }
  /**
   * Whether the window was found or guessed. False only when a long clip was
   * scanned and no serve stood out, which changes what a later refusal means.
   */
  located: boolean
}

/**
 * Which slice of the clip to read densely, and whether we know it holds a serve.
 *
 * Pure, and separate from the seeking around it, because the sampling rate falls
 * straight out of the span it returns — `MAX_FINE_FRAMES / span`, capped at
 * `FINE_FPS` — and that arithmetic decides whether a serve is resolvable at all
 * before a single frame is decoded. It is worth being able to check without a
 * browser.
 */
export function readWindow(duration: number, times: number[], serveIndex: number): ReadWindow {
  if (duration <= SINGLE_PASS_SECONDS) {
    return { start: 0, end: duration, serves: { count: 1, index: 0 }, located: true }
  }
  if (times.length) {
    // Default to the last serve: when someone films a basket, the one they want
    // feedback on is almost always the one they just hit.
    const index = serveIndex < 0 ? times.length - 1 : Math.min(serveIndex, times.length - 1)
    return {
      start: Math.max(0, times[index] - LEAD_IN),
      end: Math.min(duration, times[index] + LEAD_OUT),
      serves: { count: times.length, index },
      located: true,
    }
  }
  // Nothing to aim at. Reading the whole clip anyway is the one choice that
  // cannot succeed — see `FALLBACK_SPAN` — and it fails slowly and then blames
  // the serve, because by the time the numbers come back a clip sampled too
  // sparsely to hold a swing looks exactly like a player who never swung.
  //
  // So read the end of the clip, at a rate a serve survives. The end is the best
  // guess available, for the same reason the last serve is the default above: it
  // is the one they just hit. `located` carries the fact that this window was
  // chosen blind, so a refusal downstream can say the scan missed rather than
  // say the motion was not a serve.
  return {
    start: Math.max(0, duration - FALLBACK_SPAN),
    end: duration,
    serves: { count: 1, index: 0 },
    located: false,
  }
}

/** Samples per second a window of this length will be read at. */
export const samplingRateFor = (span: number) => Math.min(FINE_FPS, MAX_FINE_FRAMES / Math.max(0.2, span))

export interface ExtractProgress {
  phase: 'scanning' | 'tracking'
  ratio: number
}


export class Cancelled extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'Cancelled'
  }
}


/* ------------------------------------------------------------------- seeking */

function waitFor(video: HTMLVideoElement, event: string, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      clearTimeout(timer)
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
      reject(describeDecodeFailure(video))
    }
    const timer = setTimeout(done, timeoutMs)
    video.addEventListener(event, done, { once: true })
    video.addEventListener('error', fail, { once: true })
  })
}

/** Does this browser have an HEVC decoder? */
export function supportsHEVC(): boolean {
  try {
    const probe = document.createElement('video')
    // Both fourccs are in the wild: Apple writes `hvc1`, most encoders `hev1`.
    return Boolean(
      probe.canPlayType('video/mp4; codecs="hvc1"') ||
        probe.canPlayType('video/mp4; codecs="hev1"'),
    )
  } catch {
    return false
  }
}

/**
 * Turn a media error into something the player can act on.
 *
 * This matters more here than in most apps because of what the input is. A
 * tennis serve is filmed in slow motion on a phone, and an iPhone set to "High
 * Efficiency" writes HEVC — which Safari plays, Chrome on Windows often will
 * not, and older Android cannot. The clip looks perfect in the player's camera
 * roll, so "this video could not be decoded" reads as the app being broken, and
 * there is nothing in that sentence to act on. Naming the codec and pointing at
 * the iPhone setting that changes it turns a dead end into a thirty-second fix.
 */
export function describeDecodeFailure(video: HTMLVideoElement): UnreadableVideoError {
  const code = video.error?.code
  const unsupported =
    code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_DECODE

  if (unsupported && !supportsHEVC()) {
    return new UnreadableVideoError('This browser cannot play that video.', [
      'It is most likely HEVC (High Efficiency), which iPhones record by default and this browser cannot decode.',
      'On iPhone: Settings › Camera › Formats › Most Compatible. Clips filmed after that will work.',
      'For a clip you have already filmed, share it to yourself via WhatsApp or email — that converts it to H.264 on the way.',
      'Safari on iPhone or Mac can play HEVC directly, if you have one to hand.',
    ])
  }

  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return new UnreadableVideoError('That file is not a video this browser can open.', [
      'MP4 and MOV clips straight from a phone camera work best.',
      'If it came from a screen recording or an editing app, try exporting it again as MP4.',
    ])
  }

  if (code === MediaError.MEDIA_ERR_DECODE) {
    return new UnreadableVideoError('That video stopped part way through decoding.', [
      'The file may be incomplete — a clip still uploading from iCloud or Google Photos often is.',
      'Wait for it to finish downloading to the device, then try again.',
    ])
  }

  return new UnreadableVideoError('That video could not be read.', [
    'Try trimming it in your photo library and picking it again.',
    'MP4 or MOV clips from a phone camera work best.',
  ])
}

/**
 * How far the playhead may sit from where it was sent and still be believed.
 *
 * Deliberately loose. Browsers report `currentTime` quantised to the decoded
 * frame, and a seek to a moment between two frames lands on one of them — a
 * third of a second is far wider than any of that, so this only ever fires on a
 * seek that genuinely did not happen. Which is the case worth catching: `waitFor`
 * resolves rather than rejects on its timeout, so a seek the browser never
 * completed returns here looking exactly like one that did, and the frame is
 * then filed with the timestamp that was *asked for* and the landmarks of
 * whatever was still on screen. Nothing downstream can tell — a swing assembled
 * from frames out of order is a swing, just not the one that was filmed.
 */
const SEEK_TOLERANCE = 0.25

/** Move the playhead, and say whether it actually arrived. */
async function seekTo(video: HTMLVideoElement, t: number): Promise<boolean> {
  // Nudge off the exact end: seeking to `duration` never fires `seeked` in Safari.
  const target = Math.min(Math.max(t, 0), Math.max(0, video.duration - 0.02))
  if (Math.abs(video.currentTime - target) < 1e-4) return true
  const seeked = waitFor(video, 'seeked')
  video.currentTime = target
  await seeked
  // `seeked` fires when the seek completes, not necessarily once the new frame
  // is presented. rVFC closes that gap — but it only fires while the page is
  // compositing, so a backgrounded tab would otherwise pay this timeout on
  // every single frame. Kept short for that reason: when the page is visible
  // the callback lands within a frame anyway.
  const rvfc = (video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number
  }).requestVideoFrameCallback
  if (rvfc) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 25)
      rvfc.call(video, () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  return Math.abs(video.currentTime - target) <= SEEK_TOLERANCE
}

export async function loadVideo(video: HTMLVideoElement, src: string): Promise<void> {
  // Assigning `src` tears down and rebuilds the decoder even when it is the same
  // source, so a caller making several passes over one clip on one element — the
  // basket sweep — would pay that per pass. The readyState guards below then
  // skip the waits too, and a reused element is ready immediately.
  if (video.src !== src) video.src = src
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  if (video.readyState < 1) await waitFor(video, 'loadedmetadata', 15000)

  // A timed-out wait resolves rather than rejecting, so a file the browser never
  // got anywhere with arrives here looking like a successful load with nothing
  // in it. Check for that before trusting the duration.
  if (video.error) throw describeDecodeFailure(video)

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new UnreadableVideoError('That video has no readable length.', [
      supportsHEVC()
        ? 'It may be an unusual format, or still downloading from iCloud or Google Photos.'
        : 'If it came from an iPhone it is probably HEVC, which this browser cannot decode. Set Settings › Camera › Formats › Most Compatible and film it again.',
      'Trimming the clip in your photo library and picking it again usually fixes it.',
    ])
  }

  if (video.readyState < 2) await waitFor(video, 'loadeddata', 15000)
  if (video.error) throw describeDecodeFailure(video)

  // Zero dimensions means the container parsed but the video track did not — an
  // audio-only file, or a codec the browser advertised and then could not set up.
  if (!video.videoWidth || !video.videoHeight) {
    throw new UnreadableVideoError('There is no picture in that file.', [
      'It may be an audio recording, or a video whose format this browser cannot decode.',
      'Pick a clip from your camera roll rather than a file from another app.',
    ])
  }
}

/* ---------------------------------------------------------------- conversion */

interface RawLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

const toLandmark = (l: RawLandmark): Landmark => ({
  x: l.x,
  y: l.y,
  z: l.z,
  visibility: l.visibility ?? 1,
})

/**
 * An image landmark, put onto a single scale.
 *
 * x is normalised by width and y by height, so on anything but a square video
 * they are different units. Scaling x by the aspect ratio puts them back on a
 * common footing and makes 2D distances meaningful.
 *
 * One function rather than the conversion written out at each call site: this
 * runs on every landmark of every sampled frame, and both copies of it built the
 * neutral landmark twice per point to read one field off the throwaway.
 */
const toImageLandmark = (l: RawLandmark, aspect: number): Landmark => ({
  x: l.x * aspect,
  y: l.y,
  z: l.z,
  visibility: l.visibility ?? 1,
})

/**
 * Coarse pass over the whole clip to find where each serve happens.
 *
 * Cheap by design — a low sample rate is plenty to spot the peaks in hand
 * height. Split out so a caller measuring several serves from one clip can run
 * it once and hand the result to every extraction.
 */
export async function scanForServes(
  video: HTMLVideoElement,
  landmarker: PoseLandmarker,
  opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<number[]> {
  const { onProgress = () => {}, signal } = opts
  const samples: ReachSample[] = []

  /** Read the highest either hand gets at one moment. */
  const sampleAt = async (t: number) => {
    if (signal?.aborted) throw new Cancelled()
    // A seek that never landed would put this reach reading at a moment the
    // player was somewhere else, and a scan is nothing but a ranking of those.
    if (!(await seekTo(video, t))) return
    const res = landmarker.detectForVideo(video, nextVideoTimestamp(landmarker))
    const image = res.landmarks?.[0]
    if (image) {
      // Image y grows downwards, so negate it. Only y is compared here, so no
      // aspect correction is needed.
      samples.push({ t, height: -Math.min(image[15].y, image[16].y) })
    }
  }

  const plan = planScan(video.duration)

  // A refinement pass only happens when the budget forced the first pass below
  // the full rate. Reported as one progress bar across both, so a long clip does
  // not appear to finish scanning and then start again.
  const refinementShare = plan.coarse ? 0.25 : 0
  for (let i = 0; i < plan.times.length; i++) {
    await sampleAt(plan.times[i])
    onProgress(((i + 1) / plan.times.length) * (1 - refinementShare))
  }

  if (plan.coarse) {
    const refine = planRefinement(peakCandidates(samples), video.duration)
    for (let i = 0; i < refine.length; i++) {
      await sampleAt(refine[i])
      onProgress(1 - refinementShare + ((i + 1) / refine.length) * refinementShare)
    }
    // Both passes go in together. `findServes` ranks by height and thins by
    // time, so the refined samples simply out-rank the coarse ones they sit
    // between — there is nothing to merge by hand.
    samples.sort((a, b) => a.t - b.t)
  }

  return findServes(samples)
}

/**
 * Sample the video and run pose detection on each sampled frame.
 *
 * Long clips get a cheap low-rate scan first to find where the racket hand
 * peaks, then only the couple of seconds around that moment are sampled
 * densely. That is both faster than sampling everything and higher resolution
 * where the serve actually happens.
 */
export async function extractFrames(
  video: HTMLVideoElement,
  landmarker: PoseLandmarker,
  opts: {
    onProgress?: (p: ExtractProgress) => void
    signal?: AbortSignal
    /** Which serve in the clip to sample, when the scan finds several. */
    serveIndex?: number
    /** Serve times already found by `scanForServes`, to skip scanning again. */
    knownServeTimes?: number[]
  } = {},
): Promise<{
  frames: Frame[]
  fps: number
  window: { start: number; end: number }
  serves: { count: number; index: number }
  /**
   * Whether the window was found or guessed. False only when a long clip was
   * scanned and no serve stood out, which changes what a later refusal means.
   */
  located: boolean
}> {
  const { onProgress = () => {}, signal, serveIndex = -1, knownServeTimes: known } = opts
  const duration = video.duration
  const aspect = video.videoWidth / Math.max(1, video.videoHeight)

  const check = () => {
    if (signal?.aborted) throw new Cancelled()
  }

  const detect = (): { image: Landmark[]; world: Landmark[] } | null => {
    const res = landmarker.detectForVideo(video, nextVideoTimestamp(landmarker))
    const image = res.landmarks?.[0]
    const world = res.worldLandmarks?.[0]
    if (!image || !world) return null
    return {
      image: image.map((l) => toImageLandmark(l, aspect)),
      world: world.map(toLandmark),
    }
  }

  const times =
    duration <= SINGLE_PASS_SECONDS
      ? []
      : // A caller sweeping every serve in a clip already knows where they are;
        // re-deriving that once per serve is the single most wasteful thing this
        // module can do, since the scan covers the whole clip each time.
        (known ??
        (await scanForServes(video, landmarker, {
          signal,
          onProgress: (ratio) => onProgress({ phase: 'scanning', ratio }),
        })))

  const { start, end, serves, located } = readWindow(duration, times, serveIndex)

  const span = Math.max(0.2, end - start)
  const fps = samplingRateFor(span)
  const count = Math.max(8, Math.round(span * fps))
  const samples: PoseSample[] = []

  for (let i = 0; i < count; i++) {
    check()
    const t = start + (span * i) / (count - 1)
    // A frame filed at a time the playhead never reached is the one failure
    // nothing downstream can see: the landmarks are real, they just belong to
    // another moment, and the swing is then measured out of order. A missing
    // sample is already an ordinary outcome here — `detect` returns null on any
    // frame the model found nobody in — so dropping it costs nothing new.
    const landed = await seekTo(video, t)
    samples.push({ t, pose: landed ? detect() : null })
    onProgress({ phase: 'tracking', ratio: (i + 1) / count })
  }

  // The misses are handed on rather than quietly skipped, because a hole is
  // information and closing over it destroys it twice. Short ones are filled
  // from the motion either side — a limb behind the body for a frame or two is
  // the commonest thing that happens on amateur footage, and there is no reason
  // to measure the serve around it. Long ones stay open, and the compacted array
  // that results is why nothing downstream may size a window in array positions:
  // see `clockOf` in phases.ts.
  const frames = bridgeDetectionGaps(samples)

  return { frames, fps, window: { start, end }, serves, located }
}

/**
 * A handful of frames spread across the clip, to check the framing before
 * committing to the full analysis.
 *
 * The whole pipeline is half a minute of work, and a clip filmed from across
 * the court or with the player's feet cut off will spend all of it to arrive at
 * a report hedged into uselessness. Six detections costs under two seconds and
 * catches that while the player is still standing on the court holding the
 * phone — which is the only moment the advice "step back and film it again" is
 * worth anything.
 */
export async function preflight(
  video: HTMLVideoElement,
  landmarker: PoseLandmarker,
  opts: { samples?: number; signal?: AbortSignal } = {},
): Promise<Frame[]> {
  const n = opts.samples ?? 6
  const aspect = video.videoWidth / Math.max(1, video.videoHeight)
  const out: Frame[] = []

  for (let i = 0; i < n; i++) {
    if (opts.signal?.aborted) throw new Cancelled()
    // Spread across the middle of the clip: the very start and end are often a
    // hand reaching for the phone.
    const t = video.duration * (0.12 + (0.76 * i) / Math.max(1, n - 1))
    if (!(await seekTo(video, t))) continue
    const res = landmarker.detectForVideo(video, nextVideoTimestamp(landmarker))
    const image = res.landmarks?.[0]
    const world = res.worldLandmarks?.[0]
    if (!image || !world) continue
    out.push({
      index: out.length,
      t,
      image: image.map((l) => toImageLandmark(l, aspect)),
      world: world.map(toLandmark),
      visibility: 0,
    })
  }

  return out
}

/**
 * Read raw pixels at each of `times`, downscaled.
 *
 * Only the ball tracker needs pixels, and it needs very few of them: a tennis
 * ball is a handful of pixels across even at full resolution, and the detector
 * works on colour, motion and roundness rather than detail.
 *
 * Every frame in the window is held at once, so the size is worth being exact
 * about rather than reassuring about. At the default 256 wide each `ImageData`
 * is about 147 KB, and a toss-to-contact window runs 40–55 frames, so the live
 * cost is 6–8 MB — held only until `findBall` returns. That is two orders of
 * magnitude under the same window at full resolution, which is the saving that
 * matters on a phone; it was previously described here as "under a megabyte",
 * which was wrong by roughly eightfold and would have hidden a real regression
 * in the window size from anybody who trusted it.
 */
export async function captureBitmaps(
  video: HTMLVideoElement,
  times: number[],
  maxWidth = 256,
): Promise<{ t: number; bitmap: ImageData }[]> {
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
  // `willReadFrequently` keeps the canvas on the CPU; without it every
  // getImageData stalls on a GPU readback, which is most of the cost here.
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []

  const out: { t: number; bitmap: ImageData }[] = []
  for (const t of times) {
    // Pixels stamped with a time they are not from would put the ball on a
    // parabola through moments it never occupied. The tracker copes with gaps —
    // the ball is lost against sky on plenty of frames — so a miss is dropped.
    if (!(await seekTo(video, t))) continue
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    out.push({ t, bitmap: ctx.getImageData(0, 0, canvas.width, canvas.height) })
  }
  return out
}

/**
 * Grab a still at each keyframe for the filmstrip.
 *
 * `decorate` runs after the video frame is painted and before the image is
 * encoded, so the caller can draw over it — the stills are the only part of a
 * serve that outlives the session, and a bare frame is far less use weeks later
 * than one showing the tracked body and the angle it was judged on.
 */
export async function captureThumbnails(
  video: HTMLVideoElement,
  times: number[],
  decorate?: (ctx: CanvasRenderingContext2D, index: number, size: { w: number; h: number }) => void,
  maxWidth = 420,
): Promise<string[]> {
  const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return times.map(() => '')

  const out: string[] = []
  for (let i = 0; i < times.length; i++) {
    // No still rather than the wrong one. A frame captioned "contact" showing
    // the trophy position, with the contact skeleton drawn over it, is a picture
    // that disagrees with itself — and these are the part of a serve that
    // outlives the clip. The report already draws a placeholder for a missing
    // still, because older saved reports have their stills stripped.
    if (!(await seekTo(video, times[i]))) {
      out.push('')
      continue
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    decorate?.(ctx, i, { w: canvas.width, h: canvas.height })
    out.push(canvas.toDataURL('image/jpeg', 0.72))
  }
  return out
}
