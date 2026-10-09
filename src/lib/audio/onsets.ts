/**
 * Where the ball was hit, from the sound (L2.9).
 *
 * A racket meeting a ball is the sharpest sound on a tennis court: a broadband
 * crack that rises from the court's own noise in a millisecond or two and is
 * gone in ten or twenty. Footsteps and the ball bouncing are duller and slower;
 * a voice is a held, pitched sound. So an impact is found as a jump in the
 * energy of the signal's fast changes (its first difference, which favours the
 * high frequencies a crack has and a thud and a voice do not), far above the
 * level around it, and rising almost at once.
 *
 * Pure: mono samples in, times out. The decoding is `decode.ts`; deciding which
 * impacts were serves is the swing's job (`fuse.ts`), since a rally, a partner
 * and a ball bounced before the toss all make a sound.
 */

/** Hop between energy readings, seconds. */
const HOP = 0.0025

/** Window each reading spans, seconds. */
const WINDOW = 0.005

/** How far either side the court's own level is read from, seconds. */
const BACKGROUND = 1

/** An impact stands this far above the level around it, in decibels. */
export const IMPACT_DB = 18

/** And rises this far within `RISE_TIME` of the readings before it. */
export const RISE_DB = 10
const RISE_TIME = 0.0075

/** Two impacts closer than this are one, seconds. */
export const REFRACTORY = 0.08

export interface Onset {
  /** Seconds from the start of the samples. */
  t: number
  /** Decibels above the level around it. */
  strength: number
}

export function findOnsets(samples: Float32Array, sampleRate: number, from = 0): Onset[] {
  const hop = Math.max(1, Math.round(HOP * sampleRate))
  const win = Math.max(hop, Math.round(WINDOW * sampleRate))
  const frames = Math.max(0, Math.floor((samples.length - win) / hop) + 1)
  if (frames < 3) return []

  // Energy of the first difference, frame by frame, in decibels.
  const level = new Float32Array(frames)
  for (let k = 0; k < frames; k++) {
    const start = k * hop
    let e = 0
    for (let i = Math.max(1, start); i < start + win; i++) {
      const d = samples[i] - samples[i - 1]
      e += d * d
    }
    level[k] = 10 * Math.log10(e / win + 1e-12)
  }

  // The level around each frame: a running median, sampled every 50 ms and
  // held between, which is plenty for a background that moves over seconds.
  const reach = Math.round(BACKGROUND / HOP)
  const step = Math.max(1, Math.round(0.05 / HOP))
  const background = new Float32Array(frames)
  for (let k = 0; k < frames; k += step) {
    const lo = Math.max(0, k - reach)
    const hi = Math.min(frames, k + reach)
    const window = Array.from(level.subarray(lo, hi)).sort((a, b) => a - b)
    const m = window[window.length >> 1]
    background.fill(m, k, Math.min(frames, k + step))
  }

  const rise = Math.max(1, Math.round(RISE_TIME / HOP))
  const refractory = Math.round(REFRACTORY / HOP)
  const out: Onset[] = []
  let last = -Infinity
  for (let k = rise; k < frames - 1; k++) {
    const above = level[k] - background[k]
    if (above < IMPACT_DB) continue
    // A peak among its neighbours, so the onset is placed at the crack itself.
    if (level[k] < level[k - 1] || level[k] < level[k + 1]) continue
    // Risen from where it was a few milliseconds ago: a crack, not a swell.
    if (level[k] - level[k - rise] < RISE_DB) continue
    if (k - last < refractory) {
      // The louder of two within the same impact.
      if (out.length && above > out[out.length - 1].strength) {
        out[out.length - 1] = { t: from + (k * hop + win / 2) / sampleRate, strength: above }
        last = k
      }
      continue
    }
    out.push({ t: from + (k * hop + win / 2) / sampleRate, strength: above })
    last = k
  }
  return out
}
