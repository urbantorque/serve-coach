/**
 * Playhead store for serve playback: the current frame, play state and speed. A small vanilla
 * zustand store per player, so the canvas and the scrubber can follow the video at display rate
 * without re-rendering the whole screen on every frame.
 */
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

export type PlaybackRate = 1 | 0.5 | 0.25
export const RATES: readonly PlaybackRate[] = [1, 0.5, 0.25]

/** "1×", "½×", "¼×" (a playback speed, not a metric). */
export function rateLabel(rate: PlaybackRate): string {
  return rate === 1 ? '1×' : rate === 0.5 ? '½×' : '¼×'
}
export function rateSpoken(rate: PlaybackRate): string {
  return rate === 1 ? 'normal speed' : rate === 0.5 ? 'half speed' : 'quarter speed'
}
export function nextRate(rate: PlaybackRate): PlaybackRate {
  return RATES[(RATES.indexOf(rate) + 1) % RATES.length]
}

export interface PlayheadState {
  frame: number
  playing: boolean
  rate: PlaybackRate
  /** True while the player drags the scrubber. */
  scrubbing: boolean
}

export type Playhead = StoreApi<PlayheadState>

export function createPlayhead(init: Partial<PlayheadState> = {}): Playhead {
  return createStore<PlayheadState>(() => ({ frame: 0, playing: false, rate: 1, scrubbing: false, ...init }))
}

export function usePlayhead<T>(store: Playhead, selector: (s: PlayheadState) => T): T {
  return useStore(store, selector)
}

/** Clamps a frame to a serve window. */
export function clampFrame(frame: number, window: { startFrame: number; endFrame: number }): number {
  return Math.min(window.endFrame, Math.max(window.startFrame, Math.round(frame)))
}

/** Media time to seek to for a frame: the middle of the frame, so rounding never lands on the one before. */
export function frameToMediaTime(frame: number, nominalFps: number): number {
  return (frame + 0.5) / nominalFps
}

/** Frame shown at a media time (presentation timestamps sit on frame boundaries). */
export function mediaTimeToFrame(t: number, nominalFps: number): number {
  return Math.floor(t * nominalFps + 1e-3)
}
