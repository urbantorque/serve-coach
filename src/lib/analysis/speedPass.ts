/**
 * The serve speed pass (N2.1): the struck ball read at the clip's own frame
 * rate, near its own resolution, and handed to `measureServeSpeed`.
 *
 * The pose pass reads about 30 frames a second of file (every n-th frame;
 * `pose/rate.ts`) and at 256–384 px, and the ball finder looks only in the toss
 * column; none of that can see a struck ball. This pass reads every native frame
 * from just before contact to a fifth of a second after, in a window on the net
 * side of the player, at up to 1,280 px across, each in the middle of its frame —
 * and finds the ball in it with `struckCandidates`.
 *
 * Gated before it seeks anything: a clip whose real-time rate is under
 * `LOWEST_FPS` is answered `frame_rate` at no cost, so a clip too slow to read pays
 * nothing. Bounded in time: past `SPEED_BUDGET_MS` the pass gives up and says
 * nothing, as the refine pass does.
 *
 * The reading goes on the report, under the hero, with its range (N2.7).
 */
import {
  LOWEST_FPS,
  MIN_FPS,
  MIN_SAMPLES,
  SHORT_SAMPLES,
  measureServeSpeed,
  tossPath,
  type ServeSpeed,
  type SpeedMiss,
  type StruckFrame,
} from '../vision/serveSpeed'
import { struckCandidates } from '../vision/struckBall'
import type { BallFlight } from '../vision/ballTrack'

/** Wall clock the pass may spend, milliseconds. */
export const SPEED_BUDGET_MS = 5000

export type SpeedReading = { speed: ServeSpeed } | { miss: SpeedMiss }

export interface SpeedPassInput {
  /** The clip's real-time frame rate: the file's rate times any slow-motion stretch. */
  realFps: number
  /** The slow-motion stretch: file seconds per real second. */
  factor: number
  /** The engine's contact, real seconds. */
  contactT: number
  /** Where the file's frames fall against whole multiples of its rate, file seconds: see `phaseOf`. */
  filePhase?: number
  /** The last moment a seek reaches, file seconds. No moment is planned past it. */
  seekableTo?: number
  /** Where contact was, frame heights (x times the aspect). */
  contactAt: { x: number; y: number }
  /** Standing height, frame heights. */
  bodyHeight: number
  /** Which way across the picture the serve went. */
  netSide: 1 | -1
  /** The tossed ball, real-time clock, x and y as fractions of the frame's width and height. */
  toss: BallFlight | undefined
  signal?: AbortSignal
}

/** The window to read, in source pixels: the net side of contact, a body's height tall. */
export function speedWindow(
  i: Pick<SpeedPassInput, 'contactAt' | 'bodyHeight' | 'netSide'>,
  video: { width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  const H = video.height
  const cx = i.contactAt.x * H
  const cy = i.contactAt.y * H
  const back = 0.3 * i.bodyHeight * H
  const x0 = i.netSide > 0 ? Math.max(0, cx - back) : 0
  const x1 = i.netSide > 0 ? video.width : Math.min(video.width, cx + back)
  const y0 = Math.max(0, cy - 0.5 * i.bodyHeight * H)
  const y1 = Math.min(H, cy + 0.6 * i.bodyHeight * H)
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)) }
}

/**
 * The file times to read: every native frame from 40 ms before contact to 200 ms
 * after, each at its middle. A stamp on the read is a frame's middle, so 40 ms
 * back from one sat 1.7 ms after a frame's start on every 60 fps clip, and each
 * repeat a jittered frame made cost a sighting of the ball.
 */
/** How long after contact the ball is read, real seconds. */
const AFTER_CONTACT = 0.2

export function speedTimes(i: Pick<SpeedPassInput, 'realFps' | 'factor' | 'contactT' | 'filePhase' | 'seekableTo'>): number[] {
  const fileFps = i.realFps / i.factor
  const phase = i.filePhase ?? 0
  const from = (i.contactT - 0.04) * i.factor
  // Not past where a seek reaches: a clamped seek shows one frame again and again,
  // and the timing check then said the video carried no frame times (H45).
  const to = Math.min((i.contactT + AFTER_CONTACT) * i.factor, i.seekableTo ?? Infinity)
  const out: number[] = []
  const first = Math.max(0, Math.round((from - phase) * fileFps - 0.5))
  for (let k = first; (k + 0.5) / fileFps + phase <= to; k++) out.push((k + 0.5) / fileFps + phase)
  return out
}

type ReadBitmaps = <T>(
  times: number[],
  read: (frame: ImageData, previous: ImageData | undefined, t: number) => T,
  opts: { signal?: AbortSignal; maxWidth?: number; region?: { x: number; y: number; w: number; h: number } },
) => Promise<T[]>

/**
 * Read the serve's speed, or why there is none. `readBitmaps` is the extractor
 * bound to the clip's video element; `video` its size in pixels.
 */
export async function readServeSpeed(
  input: SpeedPassInput,
  video: { width: number; height: number },
  readBitmaps: ReadBitmaps,
): Promise<SpeedReading | undefined> {
  if (!(input.realFps >= LOWEST_FPS)) return { miss: 'frame_rate' }
  const aspect = video.width / Math.max(1, video.height)
  const tossSamples = (input.toss?.samples ?? []).map((p) => ({ t: p.t, x: p.x * aspect, y: p.y }))
  const region = speedWindow(input, video)
  const maxWidth = Math.min(1280, region.w)
  const scale = maxWidth / region.w
  // A pixel of what is read, in frame heights.
  const noise = 1 / (video.height * scale)
  const toss = tossPath(tossSamples, { noise, aspect, t0: input.contactT })
  if (!toss) return { miss: 'no_toss' }

  const budget = new AbortController()
  const timer = setTimeout(() => budget.abort(), SPEED_BUDGET_MS)
  const abortWith = () => budget.abort()
  input.signal?.addEventListener('abort', abortWith)
  const times = speedTimes(input)
  let frames: StruckFrame[]
  try {
    frames = await readBitmaps(
      times,
      (frame, previous, at) => ({
        t: at / input.factor,
        candidates: struckCandidates(frame, previous).map((c) => ({
          // Back from the window's scaled pixels to the whole frame, in frame heights.
          x: (region.x + (c.x * frame.height) / scale) / video.height,
          y: (region.y + (c.y * frame.height) / scale) / video.height,
        })),
      }),
      { signal: budget.signal, maxWidth, region },
    )
  } finally {
    clearTimeout(timer)
    input.signal?.removeEventListener('abort', abortWith)
  }
  // Out of time, or cancelled: nothing to stand behind, and nothing is said.
  if (budget.signal.aborted) return undefined
  const reading = measureServeSpeed(frames, { contactT: input.contactT, bodyHeight: input.bodyHeight, netSide: input.netSide, aspect, toss, noise })
  const lost = 'miss' in reading && (reading.miss === 'not_found' || reading.miss === 'unsure')
  return lost && cutAtTheHit(input, times) ? { miss: 'clip_end' } : reading
}

/**
 * Whether the clip stops so soon after the hit that the ball had no flight to
 * time: the clip's end took frames off the window, and left no more after contact
 * than the fewest a track is read from at this rate. A ball not found, or found too
 * loosely, on such a clip is said as that. Any other miss keeps its own reason, and
 * so does a clip cut later: a struck ball still read 41.7 m/s of a true 42 with six
 * frames after contact at 120 a second, and one into the lens is still the view.
 * Every miss on a window cut at all was said as this once, a tenth of a millisecond
 * included, and took the place of the advice that would have got a speed (H46).
 */
function cutAtTheHit(input: SpeedPassInput, times: number[]): boolean {
  if (input.seekableTo === undefined || speedTimes({ ...input, seekableTo: undefined }).length <= times.length) return false
  const flight = times.filter((t) => t / input.factor > input.contactT).length
  return flight <= (input.realFps >= MIN_FPS ? MIN_SAMPLES : SHORT_SAMPLES)
}
