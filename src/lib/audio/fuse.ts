/**
 * Which reach peaks were heard (L2.9): the swing and the sound, put together.
 *
 * Neither is assumed to line up with the other. The hand's highest point is
 * not quite the moment of contact, a phone's audio and video are not quite in
 * step, and sound takes thirty milliseconds to cross ten metres of court. So
 * the offset is learned on the clip itself: each reach peak paired with the
 * nearest impact within `PAIR_WINDOW`, and the median of those gaps taken. With
 * the offset known, a peak was heard when an impact sits within `HEARD_WINDOW`
 * of where it should.
 *
 * The sound only ever confirms. A rally, a partner and a ball bounced before the
 * toss all make impacts, and an impact with no swing under it is none of the
 * player's serves.
 */

/** How far apart a peak and an impact may be and still be paired, before the offset is known. */
export const PAIR_WINDOW = 0.35

/** How close to its learned moment an impact must be, once it is. */
export const HEARD_WINDOW = 0.08

/** Pairs needed before the offset is believed. */
export const MIN_PAIRS = 3

export interface Hearing {
  /** Seconds from a reach peak to its impact, learned on this clip. */
  offset: number
  pairs: number
  /** Whether each peak, in the order given, was heard. */
  heard: boolean[]
}

const nearest = (sorted: readonly number[], t: number): number | undefined => {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < t) lo = mid + 1
    else hi = mid
  }
  const candidates = [sorted[lo - 1], sorted[lo]].filter((v): v is number => v !== undefined)
  return candidates.sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0]
}

/** The peaks heard, with the offset learned from them; nothing when too few pair up to learn one. */
export function hearPeaks(peaks: readonly number[], onsets: readonly number[]): Hearing | undefined {
  if (!peaks.length || !onsets.length) return undefined
  const sorted = [...onsets].sort((a, b) => a - b)
  const gaps: number[] = []
  for (const p of peaks) {
    const o = nearest(sorted, p)
    if (o !== undefined && Math.abs(o - p) <= PAIR_WINDOW) gaps.push(o - p)
  }
  if (gaps.length < MIN_PAIRS) return undefined
  gaps.sort((a, b) => a - b)
  const offset = gaps[gaps.length >> 1]
  const heard = peaks.map((p) => {
    const o = nearest(sorted, p + offset)
    return o !== undefined && Math.abs(o - (p + offset)) <= HEARD_WINDOW
  })
  return { offset, pairs: gaps.length, heard }
}
