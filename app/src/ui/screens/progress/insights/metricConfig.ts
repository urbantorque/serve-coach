/**
 * Per-metric statistics settings used by the insight screens: kind, direction, smallest worthwhile
 * change (SWC) and the between-session SD prior τ. Values are copied from METRICS §4.5 and
 * docs/specs/metrics.json (`swc`, `tau`, `higherIsBetter`); `metricConfig.test.ts` fails if they drift.
 */
import type { MetricId } from '../../../../analysis/types.ts'

export type MetricKind = 'spread' | 'centre' | 'rate'
/** 'lower' = lower is better (spreads), 'higher' = higher is better, 'neutral' = trend words only. */
export type Direction = 'lower' | 'higher' | 'neutral'

export interface MetricConfig {
  kind: MetricKind
  direction: Direction
  /** Spreads: relative (0.15 = 15%); centres: display units of the stored value; rates: proportion. */
  swc: number
  /** Spreads: log scale; centres: stored units; rates: proportion. */
  tau: number
  /** Minimum included serves per session for a trend point (METRICS §4.6). */
  minPerSession: number
  /** Neutral trend words (METRICS §4.6) for direction-neutral metrics: [lower, same, higher]. */
  neutralWords?: [string, string, string]
}

const SPREAD = (): MetricConfig => ({ kind: 'spread', direction: 'lower', swc: 0.15, tau: 0.15, minPerSession: 12 })

export const METRIC_CONFIG: Partial<Record<MetricId, MetricConfig>> = {
  'toss-height-spread': SPREAD(),
  'toss-forward-spread': SPREAD(),
  'toss-lateral-spread': SPREAD(),
  'contact-height-spread': SPREAD(),
  'rhythm-spread': SPREAD(),
  'contact-height-ratio': { kind: 'centre', direction: 'higher', swc: 0.015, tau: 0.01, minPerSession: 8 },
  'leg-drive': { kind: 'centre', direction: 'higher', swc: 2, tau: 1.5, minPerSession: 8 },
  'toss-apex-height': { kind: 'centre', direction: 'neutral', swc: 5, tau: 4, minPerSession: 8, neutralWords: ['lower', 'about the same', 'higher'] },
  'toss-forward': { kind: 'centre', direction: 'neutral', swc: 5, tau: 5, minPerSession: 8, neutralWords: ['further back', 'about the same', 'further in front'] },
  'contact-forward': { kind: 'centre', direction: 'neutral', swc: 5, tau: 5, minPerSession: 8, neutralWords: ['further back', 'about the same', 'further in front'] },
  'rhythm-release-to-contact': { kind: 'centre', direction: 'neutral', swc: 30, tau: 30, minPerSession: 8, neutralWords: ['quicker', 'about the same', 'slower'] },
  'drive-time': { kind: 'centre', direction: 'neutral', swc: 60, tau: 30, minPerSession: 8, neutralWords: ['quicker', 'about the same', 'slower'] },
  'landing-distance': { kind: 'centre', direction: 'neutral', swc: 8, tau: 8, minPerSession: 8, neutralWords: ['further back', 'about the same', 'further in'] },
  'serve-in-rate': { kind: 'rate', direction: 'higher', swc: 0.1, tau: 0.05, minPerSession: 1 },
  'first-serve-in-rate': { kind: 'rate', direction: 'higher', swc: 0.1, tau: 0.05, minPerSession: 1 },
  'second-serve-in-rate': { kind: 'rate', direction: 'higher', swc: 0.1, tau: 0.05, minPerSession: 1 },
}

export const configFor = (id: string): MetricConfig | undefined => (METRIC_CONFIG as Record<string, MetricConfig>)[id]
