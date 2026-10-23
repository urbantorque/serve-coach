/**
 * Short tones and taps for the hands-free loop (C2), made on this device.
 *
 * A player at the baseline cannot see the phone on the fence, and the voice is
 * busy with the countdown and the verdict. A tone says "the camera started" or
 * "that serve counted" in a tenth of a second without talking over either.
 * They are made here with an oscillator, so nothing is fetched and nothing is
 * stored, and they are never the only signal: each sits beside a spoken line
 * or a change on screen.
 *
 * Rising starts something, falling ends it, a single note counts.
 */

/** Each tone: [frequency in hertz, start in seconds after the first]. */
export const TONES = {
  /** The countdown is starting. */
  armed: [
    [660, 0],
    [880, 0.09],
  ],
  /** The camera is recording. */
  recording: [[1320, 0]],
  /** One more serve counted. */
  served: [[520, 0]],
  /** The recording is over. */
  stopped: [
    [880, 0],
    [660, 0.09],
  ],
} as const satisfies Record<string, readonly (readonly [number, number])[]>

export type Earcon = keyof typeof TONES

/** Loud enough to hear across a court, well under the voice. */
const PEAK_GAIN = 0.16

let context: AudioContext | undefined

/**
 * Open the way for tones, from inside a tap.
 *
 * iOS starts audio only from a gesture, as it does speech, and the tones play
 * long after the record tap — at the end of a countdown, as a serve ends. The
 * record tap calls this beside `primeSpeech`.
 */
export function unlockEarcons(): void {
  if (typeof AudioContext === 'undefined') return
  try {
    context ??= new AudioContext()
    void context.resume()
  } catch {
    // A browser that refuses an audio context has no tones; nothing else changes.
    context = undefined
  }
}

/** Play a tone, if the way was opened. Silent otherwise, never an error. */
export function earcon(name: Earcon): void {
  if (!context || context.state !== 'running') return
  const t0 = context.currentTime + 0.01
  for (const [hz, at] of TONES[name]) {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0, t0 + at)
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, t0 + at + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.12)
    osc.connect(gain).connect(context.destination)
    osc.start(t0 + at)
    osc.stop(t0 + at + 0.14)
  }
}

/** A tap, felt in the hand. */
export const TICK = 10

/**
 * Felt where the phone can do it: Chrome on Android. iOS Safari has no
 * Vibration API, and nothing here depends on one — on court the phone is on
 * the fence for the serve, so this is only for taps made in the hand.
 */
export function haptic(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}
