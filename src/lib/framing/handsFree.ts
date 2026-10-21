/**
 * Recording with the phone on the fence and the player at the baseline (N1.1,
 * N1.2).
 *
 * The viewfinder's record button cost two walks per serve: tap, walk out,
 * serve, walk back, tap stop. Hands-free starts on a spoken countdown and stops
 * itself once the serve is over, read off the pose loop the viewfinder already
 * runs. The verdict, which nobody can read from the baseline, is spoken.
 *
 * Pure: samples in, decisions out. `FramingCheck.tsx` owns the camera, the
 * recorder and the voice.
 */

/** Seconds of countdown before a hands-free recording starts. */
export const COUNTDOWN_S = 5

/**
 * How long both hands must be back down, or the player out of shot, before a
 * serve counts as over, seconds.
 *
 * A serve's hands are above the head for under a second, from the toss to just
 * after contact, and a follow-through brings the racket below the shoulders
 * within half a second more. A second and a half of hands down is a serve that
 * has finished and a player walking away or picking up the next ball; a
 * recording stopped then holds the landing and nothing much after it.
 */
export const SETTLE_S = 1.5

/**
 * How long nobody may be in shot, after at least one serve, before a basket
 * stops short of its count, seconds. A player who has walked off to fetch
 * balls is not going to serve the rest of the basket into this recording.
 */
export const WALKED_OFF_S = 8

/** How often the pose is read while a hands-free recording runs, milliseconds. */
export const RECORDING_INTERVAL_MS = 350

/**
 * The share of wall clock the pose model may take while recording: half the
 * viewfinder's own cap, because a hardware encoder is running on the same
 * stream and the analysis that needs the device is moments away.
 */
export const RECORDING_DUTY = 0.25

/** The serve counts a hands-free recording can be set to stop after. */
export const SERVE_COUNTS = [1, 6] as const
export type ServeCount = (typeof SERVE_COUNTS)[number]

/** One read of the pose while recording. */
export interface HandSample {
  /** Seconds since the recording started. */
  t: number
  /** Somebody was found. */
  present: boolean
  /** A hand was above the head: a toss or a swing under way. */
  handUp: boolean
  /** Both hands were below the shoulders: nothing under way. */
  handsDown: boolean
}

type Point = { x: number; y: number }

// MediaPipe's pose landmarks: the nose, the shoulders and the wrists.
const NOSE = 0
const SHOULDERS = [11, 12]
const WRISTS = [15, 16]

/** A pose read as a hand sample. Image y grows downwards, so "above" is smaller. */
export function handSample(t: number, image: readonly Point[] | undefined): HandSample {
  if (!image || image.length <= WRISTS[1]) return { t, present: false, handUp: false, handsDown: false }
  const nose = image[NOSE].y
  const shoulders = Math.max(image[SHOULDERS[0]].y, image[SHOULDERS[1]].y)
  const wrists = WRISTS.map((i) => image[i].y)
  return {
    t,
    present: true,
    handUp: wrists.some((y) => y < nose),
    handsDown: wrists.every((y) => y > shoulders),
  }
}

/**
 * How many serves the samples hold, and whether the recording should stop.
 *
 * A serve starts the first time a hand goes above the head and ends once both
 * hands have been down, or the player out of shot, for `SETTLE_S`. A hand going
 * up again before then is the same serve still going: a toss caught and tossed
 * again is not two serves. Stops once `target` serves have ended, or once a
 * player who has served at least once has been gone for `WALKED_OFF_S`.
 *
 * A bounce of the ball before the serve keeps both hands low, so it never
 * starts one.
 */
export function shouldStop(samples: readonly HandSample[], target: number): { stop: boolean; serves: number } {
  let serves = 0
  let inServe = false
  let settledSince: number | undefined
  let goneSince: number | undefined
  for (const s of samples) {
    goneSince = s.present ? undefined : (goneSince ?? s.t)
    if (s.present && s.handUp) {
      inServe = true
      settledSince = undefined
      continue
    }
    if (!inServe) continue
    if (!s.present || s.handsDown) {
      settledSince ??= s.t
      if (s.t - settledSince >= SETTLE_S) {
        serves++
        inServe = false
        settledSince = undefined
        if (serves >= target) return { stop: true, serves }
      }
    } else {
      settledSince = undefined
    }
  }
  const last = samples[samples.length - 1]
  const walkedOff = serves > 0 && goneSince !== undefined && last !== undefined && last.t - goneSince >= WALKED_OFF_S
  return { stop: walkedOff, serves }
}

/** What the countdown says at each second left: the last three, then go. */
export function countdownWord(left: number): string | undefined {
  if (left === COUNTDOWN_S) return `Recording in ${COUNTDOWN_S} seconds`
  if (left === 0) return 'Go'
  return left <= 3 ? String(left) : undefined
}

/** How long between two spoken verdicts, at least, milliseconds. */
export const SPEAK_GAP_MS = 3000

/** A cue's text as speech: the bold markers dropped. */
export const spoken = (cue: string): string => cue.replace(/\*\*/g, '').trim()

/**
 * Whether a new verdict is spoken (N1.2): only when what it says changed, and
 * never sooner than `SPEAK_GAP_MS` after the last one. A verdict flickering
 * between two calls as the player walks into place would otherwise talk over
 * itself, and a player who heard "film from here" does not need it again
 * every time the window refreshes.
 */
export function speakVerdict(
  next: { call: string },
  last: { call: string; at: number } | undefined,
  now: number,
): boolean {
  if (last && last.call === next.call) return false
  return !last || now - last.at >= SPEAK_GAP_MS
}
