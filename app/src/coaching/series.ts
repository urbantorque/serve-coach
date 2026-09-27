/**
 * Per-serve series for detection (COACHING §6.1, §6.2). Reads the engine's per-serve MetricValues
 * inside one stratum and turns them into numbers in the units the library thresholds use (cm, ms,
 * ratio of height, % of height). Nothing here decides anything; detect.ts does.
 */
import type { MetricId, MetricStatus, MetricValue, ServeOutcome } from '../analysis/types.ts'
import { median, sd } from './stats.ts'
import { groupStrata, serveStratum, servesInStratum, sessionSetupKey, stratumId } from './strata.ts'
import type { CoachingServe, CoachingSession, CoachingStratum, FpsClassNumber } from './types.ts'

export interface Sample {
  serveId: string
  /** Value in threshold units (toss-apex-height is converted to cm). */
  value: number
  /** 95% interval in the same units. */
  low: number
  high: number
  confidence: number
  /** The engine's stored confidence (METRICS §1.5 inclusion needs ≥ 0.5; no coaching discount). */
  inclusionConfidence?: number
  /** The engine's per-serve random error σ_r in the same units (spread noise correction, METRICS §4.2). */
  sigmaRandom?: number
  status: MetricStatus
  outcome?: ServeOutcome
  band?: MetricValue['band']
  bandLowProbability?: number
  reasonCode?: MetricValue['reasonCode']
}

export interface Series {
  metricId: MetricId
  /** Every recorded serve in the stratum (included or not). */
  recorded: number
  /** Included serves with a usable (not unavailable, not hidden experimental) value. */
  usable: Sample[]
  /** Serves whose value was unavailable because the toss peak left the frame. */
  outOfFrame: number
  /** At least one usable value is experimental (so the path is effectively experimental). */
  anyExperimental: boolean
  /** Values existed but were experimental and hidden (toggle off). */
  hiddenExperimental: number
  /** Reason codes of unavailable values, with counts. */
  unavailableReasons: Partial<Record<string, number>>
}

/**
 * Default 95% half-widths when METRICS gives a value without an interval [Our inference, from the
 * research 05 §6.3 error budget]. The interval is what decides whether a serve "clearly" shows a fault.
 */
const DEFAULT_HALF_WIDTH: Partial<Record<MetricId, number>> = {
  'toss-apex-height': 7,
  'toss-forward': 7,
  'toss-drop': 9,
  'contact-height-ratio': 0.03,
  'contact-forward': 8,
  'rhythm-release-to-contact': 20,
  'trophy-pause': 60,
  'leg-drive': 2,
  'drive-time': 40,
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Toss peak height in cm: METRICS reports a ratio of standing height with the cm value in `secondary.cm`. */
function toThresholdUnits(metricId: MetricId, mv: MetricValue, heightM: number): { value: number; low: number; high: number; sigmaRandom?: number } | null {
  const v = num(mv.value)
  if (v === null) return null
  const scale = metricId === 'toss-apex-height' && mv.unit !== 'cm' ? heightM * 100 : 1
  const sigmaRandom = num(mv.sigmaRandom) !== null ? (mv.sigmaRandom as number) * scale : undefined
  const secondaryCm = metricId === 'toss-apex-height' ? num(mv.secondary?.cm) : null
  const value = secondaryCm ?? v * scale
  const u = mv.uncertainty
  let low: number
  let high: number
  if (u && Number.isFinite(u.low) && Number.isFinite(u.high)) {
    if (u.kind === 'plusminus' && u.low <= 0 && u.high >= 0) {
      low = v + u.low
      high = v + u.high
    } else if (u.kind === 'plusminus') {
      low = v - Math.abs(u.low)
      high = v + Math.abs(u.high)
    } else {
      low = u.low
      high = u.high
    }
    low *= scale
    high *= scale
    if (secondaryCm !== null) {
      // Keep the interval centred on the reported cm value.
      const shift = secondaryCm - v * scale
      low += shift
      high += shift
    }
  } else {
    const half = DEFAULT_HALF_WIDTH[metricId] ?? 0
    low = value - half
    high = value + half
  }
  return { value, low: Math.min(low, high), high: Math.max(low, high), ...(sigmaRandom !== undefined ? { sigmaRandom } : {}) }
}

export interface SeriesOptions {
  heightM: number
  showExperimental: boolean
  /** Use every serve, not only included ones (outcome tags only). */
  includeExcluded?: boolean
  /** Restrict to one CAPTURE block (re-tests use the block recorded before the drill). */
  block?: number
  /**
   * The series feeds a spread (a consistency check): a value that is experimental only because the
   * phone pitch is unknown counts with its level status (METRICS §1.1 item 3, MetricValue.statusIfLevel).
   */
  forSpread?: boolean
}

export function seriesFor(_session: CoachingSession, serves: readonly CoachingServe[], metricId: MetricId, opts: SeriesOptions): Series {
  const usable: Sample[] = []
  let outOfFrame = 0
  let anyExperimental = false
  let hiddenExperimental = 0
  const unavailableReasons: Partial<Record<string, number>> = {}
  const scoped = opts.block === undefined ? serves : serves.filter((s) => (s.block ?? 0) === opts.block)
  for (const s of scoped) {
    const stored = s.metrics[metricId]
    if (!stored) continue
    const mv: MetricValue = opts.forSpread && stored.status === 'experimental' && stored.statusIfLevel ? { ...stored, status: stored.statusIfLevel } : stored
    if (mv.status === 'unavailable') {
      const r = mv.reasonCode ?? 'UNKNOWN'
      unavailableReasons[r] = (unavailableReasons[r] ?? 0) + 1
      if (r === 'APEX_OUT_OF_FRAME' || mv.censored === 'right') outOfFrame++
      continue
    }
    if (!s.included && !opts.includeExcluded) continue
    if (mv.plausibility === 'hard-reject') continue
    if (mv.status === 'experimental' && !opts.showExperimental) {
      hiddenExperimental++
      continue
    }
    const isBand = typeof mv.value === 'string' || mv.band !== undefined
    if (isBand) {
      const band = mv.band ?? (mv.value as MetricValue['band'])
      usable.push({
        serveId: s.id,
        value: band === 'low' ? -1 : band === 'high' ? 1 : 0,
        low: 0,
        high: 0,
        confidence: mv.confidence,
        status: mv.status,
        outcome: s.outcome,
        band,
        bandLowProbability: mv.bandProbabilities?.low ?? (band === 'low' ? mv.confidence : 0),
        reasonCode: mv.reasonCode,
      })
      if (mv.status === 'experimental') anyExperimental = true
      continue
    }
    const t = toThresholdUnits(metricId, mv, opts.heightM)
    if (!t) continue
    // A soft-flagged value keeps its mark with its confidence multiplied by 0.7 (METRICS §4.2).
    const confidence = mv.plausibility === 'soft-flag' ? mv.confidence * 0.7 : mv.confidence
    usable.push({ serveId: s.id, ...t, confidence, inclusionConfidence: mv.confidence, status: mv.status, outcome: s.outcome, reasonCode: mv.reasonCode })
    if (mv.status === 'experimental') anyExperimental = true
  }
  return { metricId, recorded: scoped.length, usable, outOfFrame, anyExperimental, hiddenExperimental, unavailableReasons }
}

export function stratumSeries(session: CoachingSession, key: CoachingStratum, metricId: MetricId, opts: SeriesOptions): Series {
  return seriesFor(session, servesInStratum(session, key), metricId, opts)
}

export const values = (s: Series): number[] => s.usable.map((x) => x.value)
export const meanConfidence = (s: Series | readonly Sample[]): number => {
  const xs = Array.isArray(s) ? (s as readonly Sample[]) : (s as Series).usable
  return xs.length ? xs.reduce((a, x) => a + x.confidence, 0) / xs.length : 0
}

/** Weakest status in a series (experimental < estimated < measured), for evidence labels. */
export function weakestStatus(s: Series): MetricStatus {
  const order: MetricStatus[] = ['experimental', 'player-entered', 'estimated', 'measured']
  let worst: MetricStatus = 'measured'
  for (const x of s.usable) if (order.indexOf(x.status) < order.indexOf(worst)) worst = x.status
  return s.usable.length ? worst : 'unavailable'
}

/** Frames per second implied by the session's fps class. */
export function fpsOf(session: CoachingSession): FpsClassNumber {
  return session.fpsClass === 'fps120plus' ? 120 : session.fpsClass === 'fps60' ? 60 : 30
}

// ---------------------------------------------------------------------------------------------
// Outcomes (player-entered, D3)
// ---------------------------------------------------------------------------------------------

export interface OutcomeCounts {
  /** Serves in the stratum (recorded, or the tally total). */
  serves: number
  /** Serves with an outcome tag, or the tally total. */
  tagged: number
  in: number
  net: number
  long: number
  wide: number
  /** Share of the stratum's serves with an outcome (a tally counts as 1.0). */
  coverage: number
  source: 'tags' | 'tally' | 'none'
}

const MISS = new Set<ServeOutcome>(['net', 'long', 'wide'])

export function outcomeCounts(session: CoachingSession, key: CoachingStratum): OutcomeCounts {
  const serves = servesInStratum(session, key)
  const tagged = serves.filter((s) => s.outcome === 'in' || (s.outcome && MISS.has(s.outcome)))
  if (tagged.length > 0) {
    const c = (o: ServeOutcome) => tagged.filter((s) => s.outcome === o).length
    return {
      serves: serves.length,
      tagged: tagged.length,
      in: c('in'),
      net: c('net'),
      long: c('long'),
      wide: c('wide'),
      coverage: serves.length ? tagged.length / serves.length : 0,
      source: 'tags',
    }
  }
  // A session tally applies to the block's default stratum (D3).
  const t = key.serveNumber === 2 ? session.tally?.secondServes : key.serveNumber === 1 ? session.tally?.firstServes : undefined
  const tallyKey = tallyStratum(session, key.serveNumber === 2 ? 2 : 1)
  if (t && t.total > 0 && stratumId(tallyKey) === stratumId(key)) {
    return {
      serves: t.total,
      tagged: t.total,
      in: t.in,
      net: t.net ?? 0,
      long: t.long ?? 0,
      wide: t.wide ?? 0,
      coverage: 1,
      source: 'tally',
    }
  }
  return { serves: serves.length, tagged: 0, in: 0, net: 0, long: 0, wide: 0, coverage: 0, source: 'none' }
}

/** The stratum a session tally belongs to (block card defaults). */
export function tallyStratum(session: CoachingSession, serveNumber: 1 | 2): CoachingStratum {
  const setup = sessionSetupKey(session)
  return {
    view: session.view,
    cameraSide: session.cameraSide ?? 'unknown',
    courtSide: session.defaults?.courtSide ?? 'unknown',
    serveNumber,
    intendedType: session.defaults?.intendedType ?? 'unknown',
    handedness: session.handedness ?? 'right',
    ...(setup ? { setup } : {}),
  }
}

/** Strata to evaluate: every serve stratum, plus tally-only strata that have no serves. */
export function candidateStrata(session: CoachingSession): CoachingStratum[] {
  const keys = groupStrata(session).map((g) => g.key)
  const ids = new Set(keys.map(stratumId))
  for (const n of [1, 2] as const) {
    const t = n === 1 ? session.tally?.firstServes : session.tally?.secondServes
    if (!t || t.total === 0) continue
    const k = tallyStratum(session, n)
    if (!ids.has(stratumId(k))) {
      keys.push(k)
      ids.add(stratumId(k))
    }
  }
  return keys
}

export { serveStratum }

// ---------------------------------------------------------------------------------------------
// Session summaries for history (personal best and baseline, COACHING §6.4)
// ---------------------------------------------------------------------------------------------

export interface SessionSummary {
  sessionId: string
  startedAt: string
  n: number
  /** Median (centres) or noise-corrected SD (spreads). */
  value: number
  /** Standard error of `value`. */
  se: number
}

export function summariseCentre(sessionId: string, startedAt: string, xs: readonly number[]): SessionSummary | null {
  if (xs.length < 2) return null
  const s = sd(xs)
  return { sessionId, startedAt, n: xs.length, value: median(xs), se: (1.2533 * s) / Math.sqrt(xs.length) }
}
