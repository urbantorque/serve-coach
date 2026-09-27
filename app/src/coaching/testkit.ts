/**
 * Test kit for the coaching engine: builds sessions whose per-serve values have exact statistics
 * (sample SD, MAD, medians), so the COACHING §15.1 cases can be written with the spec's numbers.
 * Used by the unit tests and the UI smoke tests; never by production code.
 */
import type { MetricId, MetricStatus, MetricValue, ServeOutcome } from '../analysis/types.ts'
import { mean, normalQuantile, sd } from './stats.ts'
import type { CoachingProfile, CoachingServe, CoachingSession } from './types.ts'

/** n values with an exact sample SD `s` around `centre` (normal-quantile pattern, standardised). */
export function exactSpread(n: number, centre: number, s: number): number[] {
  const z = Array.from({ length: n }, (_, i) => normalQuantile((i + 0.5) / n))
  const m = mean(z)
  const sz = sd(z)
  return z.map((v) => centre + ((v - m) / sz) * s)
}

/** 13 values with median `centre` and 1.4826 x MAD = `s` (MAD-based spread for n < 15). */
export function exactMad13(centre: number, s: number): number[] {
  const madv = s / 1.4826
  const devs = [0.3 * madv, 0.6 * madv, madv, 1.6 * madv, 2.1 * madv, 2.6 * madv]
  return [centre, ...devs.flatMap((d) => [centre - d, centre + d])]
}

export interface MvOpts {
  status?: MetricStatus
  half?: number
  confidence?: number
  unit?: string
  secondary?: Record<string, number>
  band?: MetricValue['band']
  bandProbabilities?: MetricValue['bandProbabilities']
  reasonCode?: MetricValue['reasonCode']
}

export function mv(id: MetricId, value: number | string | null, o: MvOpts = {}): MetricValue {
  const num = typeof value === 'number' ? value : null
  return {
    id,
    value,
    unit: o.unit ?? 'cm',
    status: o.status ?? 'estimated',
    ...(num !== null && o.half !== undefined ? { uncertainty: { kind: 'ci95' as const, low: num - o.half, high: num + o.half } } : {}),
    confidence: o.confidence ?? 0.9,
    basis: 'test',
    ...(o.secondary ? { secondary: o.secondary } : {}),
    ...(o.band ? { band: o.band } : {}),
    ...(o.bandProbabilities ? { bandProbabilities: o.bandProbabilities } : {}),
    ...(o.reasonCode ? { reasonCode: o.reasonCode } : {}),
  }
}

export const unavailable = (id: MetricId, reasonCode: MetricValue['reasonCode']): MetricValue => ({
  id,
  value: null,
  unit: 'n/a',
  status: 'unavailable',
  confidence: 0,
  basis: 'test',
  reasonCode,
})

/** Toss peak as METRICS reports it: ratio of height with the cm value in `secondary.cm`. */
export const apex = (cm: number, heightM: number, o: MvOpts = {}) =>
  mv('toss-apex-height', Math.round((cm / (heightM * 100)) * 1000) / 1000, { unit: 'ratio-of-height', secondary: { cm }, ...o })

export type SeriesSpec = Partial<Record<MetricId, (i: number) => MetricValue | undefined>>

export interface SessionSpec {
  id: string
  startedAt: string
  n: number
  heightM?: number
  view?: CoachingSession['view']
  fpsClass?: CoachingSession['fpsClass']
  captureQuality?: CoachingSession['captureQuality']
  /** Serve indices (0-based) excluded from statistics. */
  excluded?: number[]
  outcomes?: (ServeOutcome | undefined)[]
  courtSide?: 'deuce' | 'ad'
  serveNumber?: 1 | 2
  intendedType?: 'flat' | 'slice' | 'kick'
  metrics?: SeriesSpec
  template?: CoachingSession['template']
  blocks?: number[]
  tally?: CoachingSession['tally']
  qualityChecks?: CoachingSession['qualityChecks']
}

export function session(spec: SessionSpec): CoachingSession {
  const serves: CoachingServe[] = Array.from({ length: spec.n }, (_, i) => {
    const metrics: CoachingServe['metrics'] = {}
    for (const [id, f] of Object.entries(spec.metrics ?? {})) {
      const v = f?.(i)
      if (v) metrics[id as MetricId] = v
    }
    return {
      id: `${spec.id}-s${i + 1}`,
      index: i + 1,
      included: !(spec.excluded ?? []).includes(i),
      metrics,
      ...(spec.outcomes?.[i] ? { outcome: spec.outcomes[i] } : {}),
      ...(spec.blocks ? { block: spec.blocks[i] } : {}),
    }
  })
  return {
    id: spec.id,
    startedAt: spec.startedAt,
    view: spec.view ?? 'side',
    cameraSide: 'chest',
    handedness: 'right',
    fpsClass: spec.fpsClass ?? 'fps60',
    captureQuality: spec.captureQuality ?? 'good',
    qualityChecks: spec.qualityChecks ?? [],
    serves,
    defaults: {
      courtSide: spec.courtSide ?? 'deuce',
      serveNumber: spec.serveNumber ?? 1,
      ...(spec.intendedType ? { intendedType: spec.intendedType } : {}),
    },
    ...(spec.template ? { template: spec.template } : {}),
    ...(spec.tally ? { tally: spec.tally } : {}),
  }
}

export function profile(p: Partial<CoachingProfile> = {}): CoachingProfile {
  return {
    level: 'utr-4-5',
    goal: 'first-serves-in',
    comfortRegions: [],
    heightM: 1.75,
    ageBand: '18-plus',
    showExperimental: false,
    ...p,
  }
}

/** Places values so that outcome groups carry no association: alternating by rank. */
export function interleave<T>(xs: readonly T[], outcomes: readonly ServeOutcome[]): (ServeOutcome | undefined)[] {
  const order = xs.map((_, i) => i).sort((a, b) => Number(xs[a]) - Number(xs[b]))
  const out: (ServeOutcome | undefined)[] = new Array(xs.length)
  order.forEach((idx, rank) => {
    out[idx] = outcomes[rank % outcomes.length]
  })
  return out
}
