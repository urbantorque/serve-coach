/**
 * Analyses already computed for the clip in hand.
 *
 * Switching between the serves in a basket, or correcting the hand, re-runs the
 * whole pipeline — twenty or thirty seconds of seeking and pose detection — to
 * produce a result the app very often had a minute ago. Flicking between serve
 * three and serve four and back again should not cost a minute, and on the
 * comparison flow that pattern is the whole point of the screen.
 *
 * Deliberately small and deliberately in memory only. An analysis carries every
 * tracked frame, which is a megabyte or two apiece — worth holding a few of
 * while the player is working through one clip, and not worth writing to disk
 * when the video it describes will be gone next time the app opens. The saved
 * *report* is the durable artefact; this is a scratchpad.
 */
import type { Analysis } from './analysis/types'

/**
 * Four is about two serves' worth of switching back and forth. Past that the
 * memory is real — on a phone, holding ten of these is a hundred megabytes and
 * a background tab that gets killed.
 */
const MAX_ENTRIES = 4

export interface CacheKey {
  /** Identifies the clip and which serve within it. */
  sessionKey: string
  handedness: 'right' | 'left'
}

const keyOf = (k: CacheKey) => `${k.sessionKey}|${k.handedness}`

/**
 * Serve type is not part of the key.
 *
 * It changes the target bands and nothing measured, so a cached analysis can be
 * re-scored into any serve type in about a millisecond — see `rescore`. Keying
 * on it would triple the memory to store three copies of identical landmarks.
 */
const entries = new Map<string, Analysis>()

export function remember(key: CacheKey, analysis: Analysis): void {
  const k = keyOf(key)
  // Delete first so a re-set moves the entry to the end: Map iterates in
  // insertion order, which is what makes the eviction below least-recently-used
  // rather than arbitrary.
  entries.delete(k)
  entries.set(k, analysis)
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
}

export function recall(key: CacheKey): Analysis | undefined {
  const k = keyOf(key)
  const hit = entries.get(k)
  if (!hit) return undefined
  // Touch it, so the one being used is the last to be evicted.
  entries.delete(k)
  entries.set(k, hit)
  return hit
}

/**
 * Drop everything. Called when a new clip is picked — the old analyses describe
 * a video whose object URL has just been revoked, so nothing can play them back
 * and holding their frames is pure cost.
 */
export function forgetAll(): void {
  entries.clear()
}

/** For tests and diagnostics. */
export const cacheSize = () => entries.size
