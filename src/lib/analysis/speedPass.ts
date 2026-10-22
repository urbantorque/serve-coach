/**
 * The serve speed pass (N2.1): the struck ball read at the clip's own frame
 * rate, near its own resolution, and handed to `measureServeSpeed`.
 *
 * The pose pass reads at most 32 frames a second of file and at 256–384 px, and
 * the ball finder looks only in the toss column; none of that can see a struck
 * ball. This pass reads every native frame from just before contact to a fifth
 * of a second after, in a window on the net side of the player, at up to 1,280
 * px across, at the timestamps the decoder really reached — and finds the ball
 * in it with `struckCandidates`.
 *
 * Gated before it seeks anything: a clip whose real-time rate is under
 * `MIN_FPS` is answered `frame_rate` at no cost, so real-time clips pay
 * nothing. Bounded in time: past `SPEED_BUDGET_MS` the pass gives up and says
 * nothing, as the refine pass does.
 *
 * Measured, not shown: the reading goes on the report, and nothing draws it
 * until showing a speed is the owner's call (N2.7).
 */
import { MIN_FPS, measureServeSpeed, tossPath, type ServeSpeed, type SpeedMiss, type StruckFrame } from '../vision/serveSpeed'
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

/** The file times to read: every native frame from 40 ms before contact to 200 ms after. */
export function speedTimes(i: Pick<SpeedPassInput, 'realFps' | 'factor' | 'contactT'>): number[] {
  const fileFps = i.realFps / i.factor
  const from = (i.contactT - 0.04) * i.factor
  const to = (i.contactT + 0.2) * i.factor
  const out: number[] = []
  for (let t = Math.max(0, from); t <= to; t += 1 / fileFps) out.push(t)
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
  if (!(input.realFps >= MIN_FPS)) return { miss: 'frame_rate' }
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
  let frames: StruckFrame[]
  try {
    frames = await readBitmaps(
      speedTimes(input),
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
  return measureServeSpeed(frames, { contactT: input.contactT, bodyHeight: input.bodyHeight, netSide: input.netSide, aspect, toss, noise })
}
