/**
 * What analysing a serve has actually cost, on this phone.
 *
 * WHY THIS EXISTS. "About half a minute" has been this codebase's figure for a
 * pipeline pass since the baseline commit. It appears in a dozen files
 * justifying real decisions — why the framing preflight is worth two seconds,
 * why a rescore is arithmetic rather than a re-read, why the live viewfinder
 * must not heat the phone before an analysis, why a basket sweep is opt-in.
 * Nobody had ever timed it. `Analysis.cost` was added to fix that, and then had
 * no reader: every report since has carried a real millisecond count and
 * nothing has ever looked at one.
 *
 * WHAT IT UNBLOCKS. `COURT-CHECK.md` step 8 asks for a stopwatch and two
 * numbers — one full pass, one whole basket — and is one of two items in
 * `NEXT.md` blocked on "needs a phone". It is the weaker of the two blocks:
 * what step 8 actually needs is not somebody holding a stopwatch, it is the
 * number, and the phone has been recording it all along. Reading it back out of
 * the history turns that step from an errand into a screen — and the same
 * numbers travel in an exported backup, so they can come off a phone nobody in
 * this repo has ever touched.
 *
 * WHAT IT REFUSES TO SAY. No average across a cold and a warm engine. A first
 * analysis on an empty cache pays a 57 MB download inside the measured span,
 * which is a reading about the network rather than about the phone, and
 * `cost.coldEngine` is stored precisely so the two can be told apart. They are
 * reported as two figures or not at all — an average over both is the kind of
 * number that arrives wearing the authority of having been computed.
 *
 * And no figure at all below `MIN_TIMINGS` readings. One pass is an anecdote,
 * and a median next to `n=1` is the easiest way there is to talk yourself into
 * a performance claim. The same floor `replay-fixture.mjs` prints under any row
 * resting on fewer than three.
 */
import type { Session } from '../storage/db'

/** Below this many readings there is no distribution, only a number. */
export const MIN_TIMINGS = 3

export interface Timings {
  /** Passes counted, all of them warm. */
  n: number
  medianMs: number
  fastestMs: number
  slowestMs: number
  /**
   * Cold passes, counted and kept apart.
   *
   * Never folded into the figures above: a cold pass includes a 57 MB download,
   * so its duration is a reading about somebody's signal at a court.
   */
  cold: number
  /** The median of those, when there are enough of them to have one. */
  coldMedianMs?: number
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

/**
 * What the stored history says a pass costs on this device.
 *
 * `undefined` when there are fewer than `MIN_TIMINGS` warm passes on file,
 * which is every history from before the field existed and every player who has
 * analysed once or twice.
 */
export function timingsOf(sessions: readonly Session[]): Timings | undefined {
  const warm: number[] = []
  const cold: number[] = []
  for (const s of sessions) {
    const ms = s.cost?.ms
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) continue
    ;(s.cost?.coldEngine ? cold : warm).push(ms)
  }
  if (warm.length < MIN_TIMINGS) return undefined
  return {
    n: warm.length,
    medianMs: median(warm),
    fastestMs: Math.min(...warm),
    slowestMs: Math.max(...warm),
    cold: cold.length,
    coldMedianMs: cold.length >= MIN_TIMINGS ? median(cold) : undefined,
  }
}

/** Milliseconds, said the way somebody reading a diagnostic would say them. */
export const seconds = (ms: number): string =>
  `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    ms / 1000,
  )} s`

/**
 * The one line the device check prints, or nothing.
 *
 * A range rather than a single figure, because the spread is the interesting
 * half: a phone that reads a serve in 12 seconds and sometimes in 40 is a phone
 * thermally throttling, and a median alone hides exactly that.
 */
export function timingLine(t: Timings | undefined): string | undefined {
  if (!t) return undefined
  return `${seconds(t.medianMs)} typical, ${seconds(t.fastestMs)}–${seconds(t.slowestMs)} across ${t.n} serves`
}

/** And the cold-start line, kept separate for the reason `Timings.cold` gives. */
export function coldTimingLine(t: Timings | undefined): string | undefined {
  if (!t?.coldMedianMs) return undefined
  return `${seconds(t.coldMedianMs)} on a cold start, which includes the 57 MB download`
}

/**
 * Seconds a player can hold in their head: to the second under twenty, to
 * the nearest five above it, since the spread between passes is wider than
 * that anyway.
 */
export function roughSeconds(ms: number): number {
  const s = ms / 1000
  return s < 20 ? Math.max(1, Math.round(s)) : Math.round(s / 5) * 5
}

/**
 * How long this analysis will take, from this phone's own past ones (L6.9),
 * or nothing.
 *
 * Nothing below `MIN_TIMINGS` warm passes, for the reason `timingsOf` gives.
 * A cold engine is a download as well as a read: its own median when there is
 * one, said as including the download, and otherwise the warm figure with the
 * download named as extra, since nothing here can price somebody's signal. A
 * basket is that figure per serve.
 */
export function estimateLine(t: Timings | undefined, o: { cold?: boolean; serves?: number } = {}): string | undefined {
  if (!t) return undefined
  const serves = Math.max(1, o.serves ?? 1)
  const each = o.cold && t.coldMedianMs ? t.coldMedianMs : t.medianMs
  const total = serves === 1 ? each : t.medianMs * serves + (o.cold ? each - t.medianMs : 0)
  const s = roughSeconds(total)
  const said = s >= 90 ? `${Math.round(s / 60)} minutes` : `${s} seconds`
  const what = serves > 1 ? `About ${said} for ${serves} serves on this phone` : `About ${said} on this phone`
  if (!o.cold) return `${what}.`
  return t.coldMedianMs ? `${what}, with the first download.` : `${what}, plus the first download.`
}

/**
 * The first few checks, before this device has a pace of its own (E1.5).
 *
 * A wait that says nothing about its length is the one a player gives up on,
 * and `estimateLine` says nothing until `MIN_TIMINGS` passes. So the first
 * ones are given a range, said as a range. Where it comes from: W6.9 timed a
 * first check of an 18 s clip at 45 to 54 s on a laptop; one serve is a
 * shorter clip, and no phone has been timed, so the top of the range is left
 * wide. Once there is a pace of this device's own, that figure replaces this.
 */
export function firstEstimateLine(o: { cold?: boolean; device: string }): string {
  return `${o.cold ? 'About a minute or two, plus the first download' : 'About a minute or two'}. After a few serves I’ll know this ${o.device}’s own pace.`
}
