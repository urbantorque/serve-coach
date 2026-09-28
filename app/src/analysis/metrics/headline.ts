/**
 * The session headline sentence (METRICS §4.1 headline rule; DESIGN §10.6). One pure function used by
 * the engine (stored `SessionStats.headline`) and by the UI (which rebuilds it from the stored
 * values, so older sessions read the same as new ones). The spread's number comes from the one
 * display-precision rule (precision.ts), so the headline agrees with the toss tile, Today, the focus
 * card, Compare and Progress.
 */
import type { MetricValue } from '../types.ts'
import { formatNumber } from './precision.ts'

export interface HeadlineStratum {
  key: { courtSide: 'deuce' | 'ad' | 'unknown' }
  metrics: Partial<Record<string, MetricValue>>
}

export interface HeadlineInput {
  /** Headline-stratum values (the stratum with the most included serves). */
  metrics: Partial<Record<string, MetricValue>>
  strata: readonly HeadlineStratum[]
  /** Serves kept for statistics ("X of N serves measured"), the same counts as the capture line. */
  measured: number
  /** Serves found (caught tosses and shadow swings excluded). */
  detected: number
}

/** Minimum n for a provisional spread in a headline (METRICS §4.1). */
export const HEADLINE_SPREAD_MIN_N = 12

/**
 * "toss height varied by about 9.5 cm", or for an early read "toss height varied by about 30 cm
 * (early read, likely 20 to 45 cm)", or '' when the spread may not headline: measured or estimated
 * only (never experimental), not at the measurement limit, and a provisional spread only from 12
 * serves and only with its two-sided interval (METRICS §4.1: "labelled 'early read' and shown with
 * its interval"). The bounds use the value's own display step, so the headline reads like the tile.
 */
export function spreadPhrase(spread: MetricValue | undefined): string {
  if (!spread || typeof spread.value !== 'number' || !Number.isFinite(spread.value)) return ''
  if (spread.status !== 'measured' && spread.status !== 'estimated') return ''
  if (spread.nearMeasurementLimit) return ''
  const lowerBound = spread.secondary?.atLeast === 'yes'
  const value = `${lowerBound ? 'at least ' : 'about '}${formatNumber('toss-height-spread', spread.value, spread)} cm`
  if (!spread.provisional) return `toss height varied by ${value}`
  if ((spread.n ?? 0) < HEADLINE_SPREAD_MIN_N) return ''
  // An early read headlines only with its interval. A lower-bound spread (tosses above the picture)
  // has a one-sided interval, so it stays on its tile.
  const u = spread.uncertainty
  if (lowerBound || !u || u.kind === 'plusminus' || !Number.isFinite(u.low) || !Number.isFinite(u.high)) return ''
  const bound = (x: number) => formatNumber('toss-height-spread', x, spread)
  return `toss height varied by ${value} (early read, likely ${bound(u.low)} to ${bound(u.high)} cm)`
}

export function sessionHeadline(input: HeadlineInput): string {
  const { measured, detected, strata } = input
  if (detected === 0 || strata.length === 0) return 'No serves were found in this video.'
  const serves = detected === 1 ? 'serve' : 'serves'
  const spread = input.metrics['toss-height-spread']
  const phrase = spreadPhrase(spread)
  if (strata.length > 1) {
    // A session over more than one stratum counts every serve; the spread belongs to the headline
    // stratum, so it names it and its own n (METRICS §1.6: strata never pool; D7: n on every spread).
    const sides = new Set(strata.map((s) => s.key.courtSide))
    const whereAll = sides.size > 1 && sides.size === strata.length ? ' from both sides' : ' in more than one set-up'
    const head = strata[0]
    const n = spread?.n ? ` (${spread.n} ${spread.n === 1 ? 'serve' : 'serves'})` : ''
    const headWhere = `${head.key.courtSide !== 'unknown' && sides.size > 1 ? `On the ${head.key.courtSide} side` : 'In the biggest group'}${n}`
    return `${measured} of ${detected} ${serves} measured${whereAll}${phrase ? `. ${headWhere}, ${phrase}` : ''}.`
  }
  return `${measured} of ${detected} ${serves} measured${phrase ? `. ${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}` : ''}.`
}
