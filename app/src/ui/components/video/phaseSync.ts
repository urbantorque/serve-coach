/**
 * Phase-synced comparison (DESIGN §8.12, research 09 §6.1): each clip's time is warped piecewise-linearly
 * so toss release, top of swing, contact and landing coincide. Also frame and time conversion for clips
 * (normal and rendered slow motion). Pure functions, unit-tested.
 */
import type { PhaseSpan, ServeEvents, ServePhase } from '../../../analysis/types.ts'

export interface ClipTiming {
  /** Container frame rate (media time). */
  nominalFps: number
  /** Real seconds per media second (1 normally; 0.125 for 240 fps rendered as 30 fps). */
  timeScale: number
}

/** Real time of a frame (frame index = decoded media frame). */
export function frameToReal(frame: number, clip: ClipTiming): number {
  return (frame / clip.nominalFps) * clip.timeScale
}

export function realToFrame(t: number, clip: ClipTiming): number {
  return Math.round((t / clip.timeScale) * clip.nominalFps)
}

/** Events that anchor the time warp, in serve order. */
export const SYNC_EVENTS = ['tossRelease', 'trophy', 'contact', 'landing'] as const
type SyncEvent = (typeof SYNC_EVENTS)[number]

/** Matching (current, other) real-time pairs for events both serves have, kept strictly increasing. */
export function anchorPairs(current: ServeEvents, other: ServeEvents): [number, number][] {
  const pairs: [number, number][] = []
  for (const key of SYNC_EVENTS as readonly SyncEvent[]) {
    const a = current[key]
    const b = other[key]
    if (!a || !b) continue
    const last = pairs[pairs.length - 1]
    if (last && (a.tReal <= last[0] || b.tReal <= last[1])) continue
    pairs.push([a.tReal, b.tReal])
  }
  return pairs
}

/**
 * Maps a time on the current clip to the other clip. Between anchors: linear. Outside them: slope 1
 * from the nearest anchor (real time runs at the same speed before release and after landing).
 */
export function warpTime(t: number, pairs: readonly [number, number][]): number {
  if (pairs.length === 0) return t
  if (pairs.length === 1 || t <= pairs[0][0]) return pairs[0][1] + (t - pairs[0][0])
  const last = pairs[pairs.length - 1]
  if (t >= last[0]) return last[1] + (t - last[0])
  for (let i = 1; i < pairs.length; i++) {
    const [a0, b0] = pairs[i - 1]
    const [a1, b1] = pairs[i]
    if (t <= a1) return b0 + ((t - a0) / (a1 - a0)) * (b1 - b0)
  }
  return last[1] + (t - last[0])
}

/** The other clip's frame that matches `frame` on the current clip, clamped to its window. */
export function syncedFrame(
  frame: number,
  current: { timing: ClipTiming; events: ServeEvents },
  other: { timing: ClipTiming; events: ServeEvents; window: { startFrame: number; endFrame: number } },
): number {
  const t = frameToReal(frame, current.timing)
  const tOther = warpTime(t, anchorPairs(current.events, other.events))
  const f = realToFrame(tOther, other.timing)
  return Math.min(other.window.endFrame, Math.max(other.window.startFrame, f))
}

/** The phase containing `frame` (the last span that starts at or before it). */
export function phaseAt(phases: readonly PhaseSpan[], frame: number): PhaseSpan | null {
  let found: PhaseSpan | null = null
  for (const p of phases) if (p.startFrame <= frame) found = p
  return found ?? phases[0] ?? null
}

/** Seconds after toss release for a frame (the compare readout), or null without a release. */
export function secondsAfterRelease(frame: number, timing: ClipTiming, events: ServeEvents): number | null {
  if (!events.tossRelease) return null
  return frameToReal(frame, timing) - events.tossRelease.tReal
}

export type { ServePhase }
