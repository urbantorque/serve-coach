/**
 * Detection (COACHING §6): runs one library item over every stratum of the session and returns its
 * strongest qualifying reading. Rules: per-serve prevalence (§6.2 a), spread lower bound (b), band
 * (c), outcome (d), relative to the player's own best (e) and the composite ball-drop rule (f).
 *
 * Every sentence here is plain words; numbers reach the screen only through `metric` (a MetricValue
 * the UI renders with its data-state chip) or as serve counts.
 */
import type { MetricId, MetricStatus, MetricValue, ServeOutcome } from '../analysis/types.ts'
import { historyStats, probSpreadRatioAbove, probWorseBy, type HistoryStats } from './history.ts'
import type { LibraryItem } from './library.ts'
import type { NormalisedProfile } from './profile.ts'
import {
  candidateStrata,
  fpsOf,
  meanConfidence,
  outcomeCounts,
  stratumSeries,
  summariseCentre,
  values,
  weakestStatus,
  type OutcomeCounts,
  type Sample,
  type Series,
  type SeriesOptions,
} from './series.ts'
import { chi2Quantile, mean, median, probMajority, probMedianAbove, probRateBelow, spreadBound, wilson } from './stats.ts'
import { stratumId } from './strata.ts'
import type { CoachingSession, CoachingStratum, ConsideredReason, EvidenceTier, Severity } from './types.ts'

export type DetectStatus = 'eligible' | 'in-range' | ConsideredReason | 'not-applicable'
export type DetectPath = 'absolute' | 'relative' | 'population' | 'band' | 'outcome' | 'composite'

/** Per-serve quantity behind a fault, for the outcome gap (§7.3) and key frames (§8.1). */
export interface FaultSignal {
  metricId: MetricId
  /** Signed direction of the fault on `value`: 'above' = larger is the fault. */
  faultDirection: 'above' | 'below'
  /** Present / absent split at the item's resolved threshold. */
  splitAt: number
  swc: number
  samples: { serveId: string; value: number; raw: number; confidence: number; outcome?: ServeOutcome }[]
  /** Spread items: the per-serve value is |deviation from the stratum median| (§4 request 3). */
  spread: boolean
}

export interface Detection {
  itemId: string
  status: DetectStatus
  stratum?: CoachingStratum
  path?: DetectPath
  confidence: number
  severity: Severity
  wording: 'likely' | 'possible'
  meanConf: number
  /** Usable serves (or tagged serves, or misses) in the stratum. */
  n: number
  recorded: number
  /** Clear serves (per-serve and band rules). */
  k?: number
  text: string
  metric?: { metricId: MetricId; value: MetricValue }
  /** The text carries player-entered counts ("7 of 10 misses"): render with a "You logged" chip. */
  playerEntered?: boolean
  signal?: FaultSignal
  /** The item's resolved condition holds on this session (experiments, §12.5). */
  resolved?: boolean
  /** Primary quantity for experiments (baseline and verdict). */
  primary?: { metricId: MetricId; value: number; kind: 'centre' | 'spread' | 'rate'; n: number; k?: number }
  /** Tier of the firing path (tierByPath) or experimental when the primary metric is (§13). */
  pathTier?: EvidenceTier
  /** "Slipped" rule fired (§6.4): minor, never the focus, lifts a cooldown. */
  slipped?: boolean
  /** Relative co-signal met (legs drive time), for "Why?". */
  coSignals?: string[]
  outcomes?: OutcomeCounts
}

export interface DetectEnv {
  profile: NormalisedProfile
  session: CoachingSession
  history: readonly CoachingSession[]
}

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** Smallest worthwhile change per metric (METRICS §4.5 table), in threshold units. */
export const SWC: Partial<Record<MetricId, number>> = {
  'toss-apex-height': 5,
  'toss-forward': 5,
  'contact-forward': 5,
  'toss-drop': 6,
  'contact-height-ratio': 0.015,
  'rhythm-release-to-contact': 30,
  'leg-drive': 2,
  'drive-time': 60,
  'trophy-pause': 80,
}

/** Shared per-session scale error sigma_s for between-session comparisons [Our inference]. */
const SIGMA_SHARED: Partial<Record<MetricId, number>> = { 'leg-drive': 0.5, 'contact-height-ratio': 0.005 }

/** METRICS §4.2 centre choice: mean for symmetric metrics, median for skew-prone ones. */
const MEAN_CENTRE = new Set<MetricId>(['toss-forward', 'contact-height-ratio', 'contact-forward', 'landing-distance'])

const REQUIRED_PRIOR_SESSIONS = 3

// ---------------------------------------------------------------------------------------------
// Words (COACHING §7.6; DESIGN §11). No metric numbers in these strings.
// ---------------------------------------------------------------------------------------------

interface Words {
  subject: string
  found: string
  fine: string
  possible?: string
  relative?: string
  population?: string
  likely?: string
  bandOnly?: string
  fewMisses?: string
}

export const ITEM_WORDS: Record<string, Words> = {
  'toss-height-steady': {
    subject: 'Toss height',
    found: 'Your toss peaked at clearly different heights. Even allowing for measurement error, it was more scattered than typical.',
    possible: 'Your toss height was possibly more scattered than usual; a longer block would tell.',
    relative: 'Your toss height was more scattered than in your best session.',
    fine: 'Your toss peaked at a similar height from serve to serve.',
  },
  'toss-spot-steady': {
    subject: 'Toss front to back',
    found: 'Your toss peaked at clearly different distances in front of you, more scattered than typical.',
    possible: 'Your toss spot was possibly more scattered front to back than usual; a longer block would tell.',
    relative: 'Your toss spot was more scattered front to back than in your best session.',
    fine: 'Your toss peaked in a similar spot front to back.',
  },
  'toss-in-front': {
    subject: 'Toss position',
    found: 'On most serves your toss peaked behind your front foot.',
    fine: 'Your toss peaked in front of you.',
  },
  'toss-within-reach': {
    subject: 'Toss reach',
    found: 'On most serves your toss was well out into the court, and your contact or misses suggest you were chasing it.',
    fine: 'Your toss stayed within reach.',
  },
  'toss-to-reach-height': {
    subject: 'Ball drop',
    found: 'The ball may be dropping a long way before contact, and your timing suggests some waiting for it.',
    likely: 'The ball dropped a long way before contact, and two separate signs suggest you were waiting for it.',
    bandOnly: 'Your ball drop was on the high side for you, but nothing else suggests waiting for it, so it is not treated as a fault.',
    fine: 'Your ball drop was in your usual range.',
  },
  'legs-spring': {
    subject: 'Leg drive',
    found: 'Your hips rose less from the lowest point to contact than in your best sessions.',
    population: 'Your hips rose only a little from the lowest point to contact on most serves.',
    fine: 'Your leg drive was in line with your usual.',
  },
  'shoulder-tilt': {
    subject: 'Shoulder tilt at the top',
    found: 'Your shoulder tilt at the top of the swing was lower than your usual on most serves.',
    fine: 'Your shoulder tilt at the top was typical for you.',
  },
  'steady-rhythm': {
    subject: 'Rhythm',
    found: 'Your toss-to-hit time varied more than typical from serve to serve.',
    possible: 'Your rhythm was possibly more variable than usual; a longer block would tell.',
    relative: 'Your rhythm varied more than in your best session.',
    fine: 'Your toss-to-hit time was steady.',
  },
  'flowing-motion': {
    subject: 'Pause at the top',
    found: 'On most serves you paused for a long moment at the top of the swing.',
    fine: 'You flowed through the top of the swing.',
  },
  'reach-up': {
    subject: 'Contact height',
    found: 'On most serves you made contact lower than typical for your height.',
    relative: 'You made contact lower than in your best sessions.',
    fine: 'Your contact height was in range.',
  },
  'contact-in-front': {
    subject: 'Contact position',
    found: 'On most serves you made contact behind your front foot.',
    fine: 'You made contact in front of you.',
  },
  'second-serve-margin': {
    subject: 'Second serves',
    found: 'Fewer second serves went in than a reliable second serve needs.',
    fine: 'Your second serves went in reliably.',
  },
  'clear-the-net': {
    subject: 'Net misses',
    found: 'Most of your misses went into the net, often enough to cost you serves.',
    fewMisses: 'Most of your few misses went into the net, but you missed rarely, so it is not a pattern to change.',
    fine: 'Net misses were not a pattern.',
  },
  'bring-it-down': {
    subject: 'Long misses',
    found: 'Most of your misses went long, often enough to cost you serves.',
    fewMisses: 'Most of your few misses went long, but you missed rarely, so it is not a pattern to change.',
    fine: 'Long misses were not a pattern.',
  },
}

export const subjectOf = (itemId: string, fallback: string) => ITEM_WORDS[itemId]?.subject ?? fallback

// ---------------------------------------------------------------------------------------------
// Display values (MetricValues the UI renders)
// ---------------------------------------------------------------------------------------------

/** METRICS's own display value for a stratum (preferred, so the focus agrees with the tiles). */
export function metricsValue(session: CoachingSession, key: CoachingStratum | undefined, id: MetricId): MetricValue | undefined {
  if (key && session.strata) {
    const s = session.strata.find((x) => stratumId(x.key) === stratumId(key))
    const v = s?.metrics[id]
    if (v && v.status !== 'unavailable') return v
  }
  const v = session.metrics?.[id]
  if (v && v.status !== 'unavailable' && (!session.strata || session.strata.length <= 1)) return v
  return undefined
}

const round = (x: number, step: number) => Math.round(x / step) * step

function spreadMetricValue(id: MetricId, s: Series, sigmaHat: number, e: number, status: MetricStatus): MetricValue {
  const n = s.usable.length
  const obs = Math.sqrt(sigmaHat ** 2 + e ** 2)
  const lo = obs * Math.sqrt((n - 1) / chi2Quantile(0.975, n - 1))
  const hi = obs * Math.sqrt((n - 1) / chi2Quantile(0.025, n - 1))
  const corr = (x: number) => Math.sqrt(Math.max(0, x * x - e * e))
  const step = id === 'rhythm-spread' ? 5 : 0.5
  return {
    id,
    value: round(sigmaHat, step),
    unit: id === 'rhythm-spread' ? 'ms' : 'cm',
    status,
    uncertainty: { kind: 'ci95', low: round(corr(lo), step), high: round(corr(hi), step) },
    confidence: meanConfidence(s),
    basis: 'Noise-corrected spread of the serves in this set-up (coaching read).',
    n,
    nEligible: s.recorded,
    provisional: n < 20,
  }
}

function centreMetricValue(id: MetricId, s: Series, heightM: number): MetricValue {
  const xs = values(s)
  const n = xs.length
  const useMean = MEAN_CENTRE.has(id)
  const c = useMean ? mean(xs) : median(xs)
  const sdv = n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (n - 1)) : 0
  const se = (useMean ? 1 : 1.2533) * (sdv / Math.sqrt(Math.max(1, n)))
  const toUnit = (x: number) => (id === 'toss-apex-height' ? x / (heightM * 100) : x)
  const step = id === 'contact-height-ratio' || id === 'toss-apex-height' ? 0.01 : id.includes('rhythm') || id === 'trophy-pause' || id === 'drive-time' ? 10 : 1
  const unit: Record<string, string> = {
    'toss-apex-height': 'ratio-of-height',
    'contact-height-ratio': 'ratio-of-height',
    'leg-drive': '% of height',
    'rhythm-release-to-contact': 'ms',
    'trophy-pause': 'ms',
    'drive-time': 'ms',
  }
  return {
    id,
    value: round(toUnit(c), step),
    unit: unit[id] ?? 'cm',
    status: weakestStatus(s),
    uncertainty: { kind: 'ci95', low: round(toUnit(c - 1.96 * se), step), high: round(toUnit(c + 1.96 * se), step) },
    confidence: meanConfidence(s),
    basis: `Session ${useMean ? 'mean' : 'median'} of the serves in this set-up (coaching read).`,
    n,
    nEligible: s.recorded,
    provisional: n < 12,
    ...(id === 'toss-apex-height' ? { secondary: { cm: Math.round(c) } } : {}),
  }
}

export function rateMetricValue(k: number, n: number, source: OutcomeCounts['source']): MetricValue {
  const w = wilson(k, n)
  return {
    id: 'serve-in-rate',
    value: n ? k / n : null,
    unit: 'k-of-n',
    status: 'player-entered',
    uncertainty: { kind: 'ci95', low: w[0], high: w[1] },
    confidence: 1,
    basis: source === 'tally' ? 'From your session tally.' : 'From your tags.',
    n,
    secondary: { k },
    provenance: 'from-your-tags',
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const base = (item: LibraryItem, status: DetectStatus, text: string, extra: Partial<Detection> = {}): Detection => ({
  itemId: item.id,
  status,
  confidence: 0,
  severity: 'none',
  wording: 'likely',
  meanConf: 0,
  n: 0,
  recorded: 0,
  text,
  ...extra,
})

/** Strongest reading across strata (§6.1 "the strongest qualifying stratum"). */
const STATUS_RANK: DetectStatus[] = [
  'eligible',
  'slipped',
  'possible-only',
  'not-clear-yet',
  'in-range',
  'age-rule',
  'comfort-setting',
  'not-in-frame',
  'needs-more-sessions',
  'needs-more-serves',
  'needs-higher-fps',
  'experimental-off',
  'other-view',
  'not-applicable',
]
const SEVERITY_RANK: Severity[] = ['major', 'moderate', 'minor', 'none']

export function strongest(ds: Detection[]): Detection | undefined {
  return [...ds].sort((a, b) => {
    const s = STATUS_RANK.indexOf(a.status) - STATUS_RANK.indexOf(b.status)
    if (s) return s
    const v = SEVERITY_RANK.indexOf(a.severity) - SEVERITY_RANK.indexOf(b.severity)
    if (v) return v
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    return b.n - a.n
  })[0]
}

function seriesOpts(env: DetectEnv, showExperimental = env.profile.showExperimental): SeriesOptions {
  return { heightM: env.profile.heightM, showExperimental }
}

function history(env: DetectEnv, key: CoachingStratum, metricId: MetricId, kind: 'centre' | 'spread', better: 'higher' | 'lower', minServes: number, e?: number): HistoryStats {
  return historyStats(env.history, key, env.session.startedAt, { metricId, kind, better, minServes, e, opts: { ...seriesOpts(env), forSpread: kind === 'spread' } })
}

function frameOrCount(item: LibraryItem, s: Series, min: number, share = 0): Detection | null {
  const n = s.usable.length
  const detectedShare = s.recorded ? n / s.recorded : 0
  if (n >= min && detectedShare >= share) return null
  if (s.outOfFrame > 0) {
    return base(item, 'not-in-frame', `The toss went above the frame on ${s.outOfFrame} of ${s.recorded} serves.`, { n, recorded: s.recorded })
  }
  if (n === 0 && s.hiddenExperimental > 0) {
    return base(item, 'experimental-off', `${subjectOf(item.id, item.title)} is an experimental check, which you haven't switched on.`, { recorded: s.recorded })
  }
  const text =
    n < min
      ? `${subjectOf(item.id, item.title)} needs ${min} measured serves from one set-up; this one had ${n}.`
      : `${subjectOf(item.id, item.title)} needs most serves measured; ${n} of ${s.recorded} were.`
  return base(item, 'needs-more-serves', text, { n, recorded: s.recorded })
}

function signalFrom(s: Series, metricId: MetricId, faultDirection: 'above' | 'below', splitAt: number, spread: boolean): FaultSignal {
  const xs = values(s)
  const m = median(xs)
  return {
    metricId,
    faultDirection,
    splitAt,
    swc: SWC[metricId] ?? 0,
    spread,
    samples: s.usable.map((x) => ({
      serveId: x.serveId,
      raw: x.value,
      value: spread ? Math.abs(x.value - m) : x.value,
      confidence: x.confidence,
      outcome: x.outcome,
    })),
  }
}

// ---------------------------------------------------------------------------------------------
// (b) Spread rule, with the relative path
// ---------------------------------------------------------------------------------------------

interface SpreadSpec {
  seriesId: MetricId
  displayId: MetricId
  e: number
}

function spreadSpec(item: LibraryItem, env: DetectEnv): SpreadSpec {
  const t = item.detection.thresholds
  if (item.id === 'steady-rhythm') {
    const frameMs = 1000 / fpsOf(env.session)
    return { seriesId: 'rhythm-release-to-contact', displayId: 'rhythm-spread', e: (t.measurementErrorDefaultFrames ?? 1.2) * frameMs }
  }
  if (item.id === 'toss-spot-steady') return { seriesId: 'toss-forward', displayId: 'toss-forward-spread', e: t.measurementErrorDefault ?? 7 }
  return { seriesId: 'toss-apex-height', displayId: 'toss-height-spread', e: t.measurementErrorDefault ?? 4 }
}

function detectSpread(item: LibraryItem, env: DetectEnv, key: CoachingStratum): Detection {
  const t = item.detection.thresholds
  const lv = t.byLevel?.[env.profile.level]
  const T = lv?.fireLowerBound ?? 15
  const resolvedAt = lv?.resolved ?? T
  const spec = spreadSpec(item, env)
  const s = stratumSeries(env.session, key, spec.seriesId, { ...seriesOpts(env), forSpread: true })
  const minN = item.detection.minUsableServes
  const gate = frameOrCount(item, s, minN, t.minDetectedShare ?? 0.8)
  if (gate) return { ...gate, stratum: key }
  const xs = values(s)
  const n = xs.length
  const mc = meanConfidence(s)
  const b = spreadBound(xs, spec.e, T, t.boundLevel ?? 0.9)
  const status = weakestStatus(s)
  const metric = { metricId: spec.displayId, value: metricsValue(env.session, key, spec.displayId) ?? spreadMetricValue(spec.displayId, s, b.sigmaHat, spec.e, status) }
  const common: Partial<Detection> = {
    stratum: key,
    n,
    recorded: s.recorded,
    meanConf: mc,
    metric,
    signal: signalFrom(s, spec.seriesId, 'above', resolvedAt, true),
    resolved: b.sigmaHat <= resolvedAt,
    primary: { metricId: spec.displayId, value: b.sigmaHat, kind: 'spread', n },
    pathTier: s.anyExperimental ? 'experimental' : undefined,
  }
  const w = ITEM_WORDS[item.id]
  const absFire = b.sigmaLower >= T
  const absConf = b.probAbove * mc
  if (absFire && absConf >= 0.7) {
    return base(item, 'eligible', w.found, { ...common, path: 'absolute', confidence: absConf, severity: b.sigmaHat >= 1.5 * T ? 'major' : 'moderate' })
  }
  // Relative path (§6.2 e): sigmaHat >= 1.5 x the player's best, n >= 20 in both sessions.
  const rel = t.relative
  if (rel?.ratioToBest && n >= (rel.minServesBothSessions ?? 20)) {
    const h = history(env, key, spec.seriesId, 'spread', 'lower', rel.minServesBothSessions ?? 20, spec.e)
    if (h.sessions.length >= REQUIRED_PRIOR_SESSIONS && h.best) {
      const p = probSpreadRatioAbove(b.sigmaHat, n, h.best, rel.ratioToBest)
      if (b.sigmaHat >= rel.ratioToBest * h.best.value && p >= 0.9 && p * mc >= 0.7) {
        const ratio = h.best.value > 0 ? b.sigmaHat / h.best.value : Infinity
        return base(item, 'eligible', w.relative ?? w.found, {
          ...common,
          path: 'relative',
          confidence: p * mc,
          severity: ratio >= 2 * rel.ratioToBest - 1 ? 'major' : 'moderate',
        })
      }
    }
  }
  const slipped = slippedRule(env, key, s, spec.seriesId, 'spread', b.sigmaHat, resolvedAt, spec.e)
  if (slipped) return base(item, 'slipped', 'Slipped a little from your usual.', { ...common, slipped: true, severity: 'minor', confidence: absConf })
  // "Possible": the point estimate is past the fire threshold but the bound is not met (§6.2 b, §15.1).
  if (b.sigmaHat > Math.min(T, lv?.possibleAbove ?? T)) {
    return base(item, 'possible-only', w.possible ?? w.found, { ...common, confidence: absConf, severity: 'minor', wording: 'possible' })
  }
  if (absConf >= 0.5) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...common, confidence: absConf })
  return base(item, 'in-range', w.fine, { ...common, confidence: absConf })
}

/** "Slipped" (§6.4): worse than the baseline with P >= 0.9 and beyond the resolved value. Minor only. */
function slippedRule(
  env: DetectEnv,
  key: CoachingStratum,
  s: Series,
  metricId: MetricId,
  kind: 'centre' | 'spread',
  value: number,
  resolvedAt: number,
  e = 0,
  better: 'higher' | 'lower' = 'lower',
): boolean {
  const h = history(env, key, metricId, kind, better, kind === 'spread' ? 12 : 6, e)
  if (h.sessions.length < REQUIRED_PRIOR_SESSIONS || h.baseline === undefined) return false
  const n = s.usable.length
  const thisSe = kind === 'spread' ? Math.max(value, e) / Math.sqrt(2 * Math.max(1, n - 1)) : (summariseCentre('', '', values(s))?.se ?? 0)
  const te = h.typicalError ?? thisSe
  const beyond = better === 'lower' ? value > resolvedAt : value < resolvedAt
  return beyond && probWorseBy(value, thisSe, h.baseline, te, 0, better) >= 0.9
}

// ---------------------------------------------------------------------------------------------
// (a) Per-serve rule, with the relative path for contact height and legs
// ---------------------------------------------------------------------------------------------

interface PerServeSpec {
  metricId: MetricId
  direction: 'above' | 'below'
  fire: number
  resolved: number
  minN: number
  /** Resolved compares the session centre (mean or median) with `resolved`. */
  centre: 'mean' | 'median'
}

function isKick(key: CoachingStratum) {
  return key.intendedType === 'kick'
}

function perServeSpec(item: LibraryItem, env: DetectEnv, key: CoachingStratum): PerServeSpec | null {
  const t = item.detection.thresholds
  const minN = item.detection.minUsableServes
  switch (item.id) {
    case 'toss-in-front': {
      const r = isKick(key) ? t.byServeType?.kick : t.byServeType?.default
      return { metricId: 'toss-forward', direction: 'below', fire: r?.fire ?? -10, resolved: r?.resolved ?? 20, minN, centre: 'mean' }
    }
    case 'toss-within-reach': {
      const r = t.byServeType?.default
      return {
        metricId: 'toss-forward',
        direction: 'above',
        fire: (r?.fireFractionOfStandingHeight ?? 0.4) * env.profile.heightM * 100,
        resolved: r?.resolved ?? 60,
        minN,
        centre: 'mean',
      }
    }
    case 'flowing-motion': {
      const r = t.byServeType?.default
      return { metricId: 'trophy-pause', direction: 'above', fire: r?.fire ?? 500, resolved: r?.resolved ?? 350, minN, centre: 'median' }
    }
    case 'reach-up': {
      const r = isKick(key) || key.serveNumber === 2 ? t.byServeType?.kickOrSecondServe : t.byServeType?.default
      return { metricId: 'contact-height-ratio', direction: 'below', fire: r?.fire ?? 1.38, resolved: r?.resolved ?? 1.4, minN, centre: 'mean' }
    }
    case 'contact-in-front': {
      const r = isKick(key) ? t.byServeType?.kick : t.byServeType?.default
      return { metricId: 'contact-forward', direction: 'below', fire: r?.fire ?? 0, resolved: r?.resolved ?? 10, minN, centre: 'mean' }
    }
    case 'legs-spring': {
      const p = t.population
      return { metricId: 'leg-drive', direction: 'below', fire: p?.fireUpperBoundPct ?? 7, resolved: p?.resolvedMedianPct ?? 9, minN, centre: 'median' }
    }
    default:
      return null
  }
}

const clearly = (x: Sample, spec: PerServeSpec) => (spec.direction === 'below' ? x.high < spec.fire : x.low > spec.fire)

function perServeCore(env: DetectEnv, key: CoachingStratum, spec: PerServeSpec, s: Series) {
  const xs = values(s)
  const n = xs.length
  const k = s.usable.filter((x) => clearly(x, spec)).length
  const mc = meanConfidence(s)
  const conf = probMajority(k, n) * mc
  const centre = spec.centre === 'mean' ? mean(xs) : median(xs)
  const med = median(xs)
  const swc = SWC[spec.metricId] ?? 0
  const beyond = spec.direction === 'below' ? spec.fire - med : med - spec.fire
  const severity: Severity = k / n >= 0.8 && beyond >= 2 * swc ? 'major' : 'moderate'
  const resolved = spec.direction === 'below' ? centre >= spec.resolved : centre <= spec.resolved
  const metric = { metricId: spec.metricId, value: metricsValue(env.session, key, spec.metricId) ?? centreMetricValue(spec.metricId, s, env.profile.heightM) }
  return { n, k, mc, conf, centre, severity, resolved, metric }
}

function detectPerServe(item: LibraryItem, env: DetectEnv, key: CoachingStratum): Detection {
  const spec = perServeSpec(item, env, key)
  if (!spec) return base(item, 'not-applicable', '')
  const w = ITEM_WORDS[item.id]
  const t = item.detection.thresholds
  if (item.detection.minFps > fpsOf(env.session)) {
    return base(item, 'needs-higher-fps', `${w.subject} needs ${item.detection.minFps} fps or more.`, { stratum: key })
  }
  // Effective tier: an experimental primary metric makes the item experimental (§13).
  const sAll = stratumSeries(env.session, key, spec.metricId, seriesOpts(env, true))
  const primaryExperimental = sAll.usable.some((x) => x.status === 'experimental')
  if (primaryExperimental && !env.profile.showExperimental) {
    return base(item, 'experimental-off', `${w.subject} is an experimental check, which you haven't switched on.`, { stratum: key })
  }
  const s = primaryExperimental ? sAll : stratumSeries(env.session, key, spec.metricId, seriesOpts(env))
  if (item.id === 'legs-spring') return detectLegs(item, env, key, spec, s)
  if (item.id === 'reach-up') return detectReachUp(item, env, key, spec, s)
  const gate = frameOrCount(item, s, spec.minN)
  if (gate) return { ...gate, stratum: key }
  const c = perServeCore(env, key, spec, s)
  const common: Partial<Detection> = {
    stratum: key,
    n: c.n,
    k: c.k,
    recorded: s.recorded,
    meanConf: c.mc,
    metric: c.metric,
    signal: signalFrom(s, spec.metricId, spec.direction, spec.resolved, false),
    resolved: c.resolved,
    primary: { metricId: spec.metricId, value: c.centre, kind: 'centre', n: c.n },
    pathTier: primaryExperimental ? 'experimental' : undefined,
  }
  if (c.conf >= 0.7) {
    if (item.id === 'toss-within-reach' && !withinReachCorroborated(env, key, t.corroboration)) {
      return base(item, 'in-range', 'Your toss was often well out in front, but your contact height and misses look fine, so it is not treated as a fault.', { ...common, confidence: c.conf })
    }
    return base(item, 'eligible', w.found, { ...common, path: 'absolute', confidence: c.conf, severity: c.severity })
  }
  if (c.conf >= 0.5) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...common, confidence: c.conf })
  return base(item, 'in-range', w.fine, { ...common, confidence: c.conf })
}

/** toss-within-reach corroboration: low contact (mean < 1.40), or net or long share of misses >= 0.6 with >= 6 misses. */
function withinReachCorroborated(env: DetectEnv, key: CoachingStratum, _rule?: string): boolean {
  const c = stratumSeries(env.session, key, 'contact-height-ratio', seriesOpts(env))
  if (c.usable.length >= 6 && mean(values(c)) < 1.4) return true
  const o = outcomeCounts(env.session, key)
  const misses = o.net + o.long + o.wide
  return misses >= 6 && (o.net + o.long) / misses >= 0.6
}

function detectReachUp(item: LibraryItem, env: DetectEnv, key: CoachingStratum, spec: PerServeSpec, s: Series): Detection {
  const w = ITEM_WORDS[item.id]
  const t = item.detection.thresholds
  const off = t.absoluteRuleOffIf
  const comfortOff = (off?.comfort ?? []).some((r) => env.profile.comfort.has(r))
  const ageOff = (off?.ageBands ?? []).includes(env.profile.ageBand)
  const gate = frameOrCount(item, s, spec.minN)
  if (gate) return { ...gate, stratum: key }
  const c = perServeCore(env, key, spec, s)
  const common: Partial<Detection> = {
    stratum: key,
    n: c.n,
    k: c.k,
    recorded: s.recorded,
    meanConf: c.mc,
    metric: c.metric,
    signal: signalFrom(s, spec.metricId, 'below', spec.resolved, false),
    resolved: c.resolved,
    primary: { metricId: spec.metricId, value: c.centre, kind: 'centre', n: c.n },
  }
  // Relative rule first where history allows (>= 3 earlier matched sessions).
  const rel = t.relative
  const h = history(env, key, spec.metricId, 'centre', 'higher', 8)
  if (rel && h.sessions.length >= (rel.minPriorMatchedSessions ?? REQUIRED_PRIOR_SESSIONS) && h.best) {
    const thisSum = summariseCentre(env.session.id, env.session.startedAt, values(s))
    if (thisSum) {
      const margin = rel.fallBelowBest ?? 0.04
      const p = probWorseBy(thisSum.value, thisSum.se, h.best.value, h.best.se, margin, 'higher', SIGMA_SHARED['contact-height-ratio'])
      const resolvedRel = thisSum.value >= h.best.value - (rel.resolvedWithinBest ?? 0.02)
      if (p >= (rel.probability ?? 0.9) && p * c.mc >= 0.7) {
        const gap = h.best.value - thisSum.value
        return base(item, 'eligible', w.relative ?? w.found, {
          ...common,
          path: 'relative',
          confidence: p * c.mc,
          severity: gap >= 2 * margin ? 'major' : 'moderate',
          resolved: resolvedRel,
        })
      }
      if (comfortOff || ageOff) {
        return base(item, 'in-range', w.fine, { ...common, confidence: p * c.mc, resolved: resolvedRel })
      }
    }
  }
  if (comfortOff || ageOff) {
    const status: DetectStatus = comfortOff ? 'comfort-setting' : 'age-rule'
    const why = comfortOff ? 'With your shoulder comfort setting' : 'For players aged 60 or over'
    const text =
      h.sessions.length >= REQUIRED_PRIOR_SESSIONS
        ? `${why}, contact height is compared only with your own best.`
        : `${why}, contact height is compared only with your own best, which starts after 3 matched sessions.`
    return base(item, status, text, { ...common, confidence: 0 })
  }
  if (c.conf >= 0.7) return base(item, 'eligible', w.found, { ...common, path: 'absolute', confidence: c.conf, severity: c.severity })
  if (c.conf >= 0.5) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...common, confidence: c.conf })
  return base(item, 'in-range', w.fine, { ...common, confidence: c.conf })
}

function detectLegs(item: LibraryItem, env: DetectEnv, key: CoachingStratum, spec: PerServeSpec, s: Series): Detection {
  const w = ITEM_WORDS[item.id]
  const t = item.detection.thresholds
  const rel = t.relative
  const gate = frameOrCount(item, s, spec.minN)
  if (gate) return { ...gate, stratum: key }
  const xs = values(s)
  const mc = meanConfidence(s)
  const metric = { metricId: 'leg-drive' as MetricId, value: metricsValue(env.session, key, 'leg-drive') ?? centreMetricValue('leg-drive', s, env.profile.heightM) }
  const common: Partial<Detection> = {
    stratum: key,
    n: xs.length,
    recorded: s.recorded,
    meanConf: mc,
    metric,
    primary: { metricId: 'leg-drive', value: median(xs), kind: 'centre', n: xs.length },
  }
  const h = history(env, key, 'leg-drive', 'centre', 'higher', 8)
  const prior = rel?.minPriorMatchedSessions ?? REQUIRED_PRIOR_SESSIONS
  // Relative path (tier coach-recommended).
  if (h.sessions.length >= prior && h.best) {
    const thisSum = summariseCentre(env.session.id, env.session.startedAt, xs)
    if (thisSum) {
      const margin = rel?.dropBelowBestPct ?? 3
      const p = probWorseBy(thisSum.value, thisSum.se, h.best.value, h.best.se, margin, 'higher', SIGMA_SHARED['leg-drive'])
      const resolved = thisSum.value >= h.best.value - (rel?.resolvedWithinBestPct ?? 1.5)
      const signal = signalFrom(s, 'leg-drive', 'below', h.best.value - (rel?.resolvedWithinBestPct ?? 1.5), false)
      if (p >= (rel?.probability ?? 0.9) && p * mc >= 0.7) {
        // Co-signal: drive time >= 80 ms longer than the player's best median raises severity to major.
        const co = t.coSignal
        const dt = stratumSeries(env.session, key, 'drive-time', seriesOpts(env))
        const dtHist = history(env, key, 'drive-time', 'centre', 'lower', 8)
        const bestDt = dtHist.best?.value
        const coMet = co && bestDt !== undefined && dt.usable.length >= 6 && median(values(dt)) - bestDt >= co.longerThanBestMs
        const gap = h.best.value - thisSum.value
        return base(item, 'eligible', w.found, {
          ...common,
          path: 'relative',
          pathTier: item.tierByPath?.relative ?? item.evidenceTier,
          confidence: p * mc,
          severity: coMet || gap >= 2 * margin ? 'major' : 'moderate',
          resolved,
          signal,
          coSignals: coMet ? ['drive-time'] : [],
        })
      }
      if (!env.profile.showExperimental) return base(item, 'in-range', w.fine, { ...common, confidence: p * mc, resolved, signal })
    }
  }
  // Population path (experimental; toggle on only).
  if (!env.profile.showExperimental) {
    if (h.sessions.length < prior) {
      return base(item, 'needs-more-sessions', 'Leg drive is compared with your own best, which starts after 3 matched sessions.', { ...common })
    }
    return base(item, 'in-range', w.fine, common)
  }
  const c = perServeCore(env, key, spec, s)
  const popCommon: Partial<Detection> = {
    ...common,
    k: c.k,
    path: 'population',
    pathTier: item.tierByPath?.population ?? 'experimental',
    signal: signalFrom(s, 'leg-drive', 'below', spec.resolved, false),
    resolved: median(xs) >= spec.resolved,
  }
  if (c.conf >= 0.7) return base(item, 'eligible', w.population ?? w.found, { ...popCommon, confidence: c.conf, severity: c.severity })
  if (c.conf >= 0.5) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...popCommon, confidence: c.conf })
  return base(item, 'in-range', w.fine, { ...popCommon, confidence: c.conf })
}

// ---------------------------------------------------------------------------------------------
// (f) Composite rule: ball drop plus co-signals (toss-to-reach-height)
// ---------------------------------------------------------------------------------------------

function detectComposite(item: LibraryItem, env: DetectEnv, key: CoachingStratum): Detection {
  const w = ITEM_WORDS[item.id]
  const t = item.detection.thresholds
  const band = t.bySex?.[env.profile.sex] ?? t.bySex?.['not-given'] ?? { highEdge: 125, likelyAbove: 145 }
  const drop = stratumSeries(env.session, key, 'toss-drop', seriesOpts(env))
  const gate = frameOrCount(item, drop, item.detection.minUsableServes)
  if (gate) return { ...gate, stratum: key }
  const xs = values(drop)
  const mc = meanConfidence(drop)
  const med = median(xs)
  const pHigh = probMedianAbove(xs, band.highEdge)
  const highBand = pHigh >= (t.boundLevel ?? 0.9)
  const cs = t.coSignals
  const co: string[] = []
  const rhythm = stratumSeries(env.session, key, 'rhythm-release-to-contact', seriesOpts(env))
  if (cs && rhythm.usable.length >= 6 && median(values(rhythm)) > cs.releaseToContactAboveMs) co.push('rhythm-release-to-contact')
  if (cs && env.profile.showExperimental) {
    const pause = stratumSeries(env.session, key, 'trophy-pause', seriesOpts(env, true))
    if (pause.usable.length >= 6 && median(values(pause)) > cs.trophyPauseAboveMs) co.push('trophy-pause')
  }
  if (cs) {
    const contact = stratumSeries(env.session, key, 'contact-height-ratio', seriesOpts(env))
    const h = history(env, key, 'contact-height-ratio', 'centre', 'higher', 8)
    if (contact.usable.length >= 6 && h.sessions.length >= REQUIRED_PRIOR_SESSIONS && h.best) {
      if (h.best.value - median(values(contact)) >= cs.contactRatioBelowOwnBest) co.push('contact-height-ratio')
    }
  }
  const conf = pHigh * mc
  const metric = { metricId: 'toss-drop' as MetricId, value: metricsValue(env.session, key, 'toss-drop') ?? centreMetricValue('toss-drop', drop, env.profile.heightM) }
  const common: Partial<Detection> = {
    stratum: key,
    n: xs.length,
    recorded: drop.recorded,
    meanConf: mc,
    metric,
    coSignals: co,
    signal: signalFrom(drop, 'toss-drop', 'above', band.highEdge, false),
    resolved: co.length === 0 || med <= band.highEdge,
    primary: { metricId: 'toss-drop', value: med, kind: 'centre', n: xs.length },
  }
  const likely = med > band.likelyAbove && co.length >= (t.likelyNeedsCoSignals ?? 2)
  const possible = highBand && co.length >= (t.possibleNeedsCoSignals ?? 1)
  if ((likely || possible) && conf >= 0.7) {
    return base(item, 'eligible', likely ? (w.likely ?? w.found) : w.found, {
      ...common,
      path: 'composite',
      confidence: conf,
      severity: likely ? 'major' : 'moderate',
      wording: likely ? 'likely' : 'possible',
    })
  }
  if (highBand && co.length === 0) return base(item, 'in-range', w.bandOnly ?? w.fine, { ...common, confidence: conf })
  if ((likely || possible) && conf >= 0.5) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...common, confidence: conf })
  return base(item, 'in-range', w.fine, { ...common, confidence: conf })
}

// ---------------------------------------------------------------------------------------------
// (c) Band rule (shoulder tilt at the top)
// ---------------------------------------------------------------------------------------------

function detectBand(item: LibraryItem, env: DetectEnv, key: CoachingStratum): Detection {
  const w = ITEM_WORDS[item.id]
  const t = item.detection.thresholds
  const s = stratumSeries(env.session, key, 'shoulder-tilt-trophy', seriesOpts(env, true))
  const bands = s.usable.filter((x) => x.band && x.band !== 'unclear')
  if ((s.unavailableReasons.BASELINE_BUILDING ?? 0) > 0 && bands.length === 0) {
    return base(item, 'needs-more-sessions', 'Shoulder tilt is compared with your usual, which builds over 2 matched sessions.', { stratum: key })
  }
  const minN = item.detection.minUsableServes
  if (bands.length < minN) {
    return base(item, 'needs-more-serves', `Shoulder tilt needs ${minN} clear serves from one set-up; this one had ${bands.length}.`, { stratum: key, n: bands.length })
  }
  const n = s.usable.length
  const k = s.usable.filter((x) => x.band === 'low' && (x.bandLowProbability ?? 0) >= (t.clearBandConfidence ?? 0.7)).length
  const mc = meanConfidence(s)
  const conf = probMajority(k, n) * mc
  const lowShare = s.usable.filter((x) => x.band === 'low').length / n
  const metric = metricsValue(env.session, key, 'shoulder-tilt-trophy')
  const common: Partial<Detection> = {
    stratum: key,
    n,
    k,
    recorded: s.recorded,
    meanConf: mc,
    ...(metric ? { metric: { metricId: 'shoulder-tilt-trophy' as MetricId, value: metric } } : {}),
    resolved: lowShare <= (t.resolvedMaxShare ?? 0.3),
    primary: { metricId: 'shoulder-tilt-trophy', value: lowShare, kind: 'rate', n, k },
    pathTier: 'experimental',
  }
  if (conf >= 0.7) return base(item, 'eligible', w.found, { ...common, path: 'band', confidence: conf, severity: k / n >= 0.85 ? 'major' : 'moderate' })
  if (conf >= 0.5) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...common, confidence: conf })
  return base(item, 'in-range', w.fine, { ...common, confidence: conf })
}

// ---------------------------------------------------------------------------------------------
// (d) Outcome rules (player-entered)
// ---------------------------------------------------------------------------------------------

function detectOutcome(item: LibraryItem, env: DetectEnv, key: CoachingStratum): Detection {
  const w = ITEM_WORDS[item.id]
  const t = item.detection.thresholds
  const o = outcomeCounts(env.session, key)
  const rate = rateMetricValue(o.in, o.tagged, o.source)
  const common: Partial<Detection> = { stratum: key, recorded: o.serves, meanConf: o.coverage, outcomes: o, playerEntered: true }
  if (o.source === 'none') {
    return base(item, 'needs-more-serves', `${w.subject}: tag in, net, long or wide to check this.`, common)
  }
  if (item.id === 'second-serve-margin') {
    if (key.serveNumber !== 2) return base(item, 'not-applicable', '', common)
    const minN = item.detection.minUsableServes
    if (o.tagged < minN) {
      return base(item, 'needs-more-serves', `Second serves need ${minN} tagged serves; this set-up had ${o.tagged}.`, { ...common, n: o.tagged })
    }
    const p = probRateBelow(t.fireBelowRate ?? 0.7, o.in, o.tagged)
    const conf = p * o.coverage
    const resolved = o.tagged >= (t.resolvedMinServes ?? 20) && o.in / o.tagged >= (t.resolvedRate ?? 0.8)
    const c: Partial<Detection> = {
      ...common,
      n: o.tagged,
      k: o.in,
      metric: { metricId: 'serve-in-rate', value: rate },
      resolved,
      primary: { metricId: 'serve-in-rate', value: o.in / o.tagged, kind: 'rate', n: o.tagged, k: o.in },
    }
    if (p >= (t.posteriorProb ?? 0.8) && conf >= 0.7) {
      return base(item, 'eligible', w.found, { ...c, path: 'outcome', confidence: conf, severity: p >= 0.95 ? 'major' : 'moderate' })
    }
    if (conf >= 0.5) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...c, confidence: conf })
    return base(item, 'in-range', w.fine, { ...c, confidence: conf })
  }
  // Miss-pattern items (net / long).
  const type = t.missType ?? 'net'
  const misses = o.net + o.long + o.wide
  const j = type === 'net' ? o.net : o.long
  const minMisses = t.minMisses ?? 6
  const c: Partial<Detection> = {
    ...common,
    n: misses,
    k: j,
    metric: { metricId: 'serve-in-rate', value: rate },
    resolved: misses >= (t.resolvedMinMisses ?? 10) && j / misses <= (t.resolvedShare ?? 0.4),
    primary: { metricId: 'serve-in-rate', value: misses ? j / misses : 0, kind: 'rate', n: misses, k: j },
  }
  if (misses < minMisses) {
    return base(item, 'needs-more-serves', `${w.subject}: a pattern needs ${minMisses} tagged misses; this set-up had ${misses}.`, c)
  }
  const p = probMajority(j, misses)
  const rp = t.realProblem
  const shareOfServes = o.tagged ? j / o.tagged : 0
  const firstServeProblem = key.serveNumber === 1 && probRateBelow(rp?.orFirstServeInRateBelow ?? 0.5, o.in, o.tagged) >= (rp?.inRateProbability ?? 0.8)
  const realProblem = shareOfServes >= (rp?.missTypeShareOfServesAtLeast ?? 0.25) || firstServeProblem
  const conf = p * o.coverage
  if (p >= (t.posteriorProb ?? 0.8) && realProblem && conf >= 0.7) {
    return base(item, 'eligible', w.found, { ...c, path: 'outcome', confidence: conf, severity: p >= 0.95 ? 'major' : 'moderate' })
  }
  if (p >= (t.posteriorProb ?? 0.8) && !realProblem) return base(item, 'in-range', w.fewMisses ?? w.fine, { ...c, confidence: conf })
  if (conf >= 0.5 && realProblem) return base(item, 'not-clear-yet', `${w.subject}: not clear yet.`, { ...c, confidence: conf })
  return base(item, 'in-range', w.fine, { ...c, confidence: conf })
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------

function detectInStratum(item: LibraryItem, env: DetectEnv, key: CoachingStratum): Detection {
  switch (item.detection.kind) {
    case 'spread':
      if (item.detection.minFps > fpsOf(env.session)) {
        return base(item, 'needs-higher-fps', `${subjectOf(item.id, item.title)} needs ${item.detection.minFps} fps or more.`, { stratum: key })
      }
      return detectSpread(item, env, key)
    case 'per-serve':
    case 'relative':
      return detectPerServe(item, env, key)
    case 'composite':
      return detectComposite(item, env, key)
    case 'band':
      return detectBand(item, env, key)
    case 'outcome':
      return detectOutcome(item, env, key)
    default:
      return base(item, 'not-applicable', '')
  }
}

/**
 * Runs an item over every stratum of the session and returns the strongest reading. View and the
 * item-level experimental tier are checked here; comfort, cooldown and age are applied by decide.ts.
 */
export function detectItem(item: LibraryItem, env: DetectEnv): Detection {
  const w = ITEM_WORDS[item.id]
  const subject = w?.subject ?? item.title
  if (item.view !== 'any' && item.view !== env.session.view) {
    return base(item, 'other-view', `${subject} needs the ${item.view === 'side' ? 'side view' : 'view from behind'}.`)
  }
  if (item.evidenceTier === 'experimental' && !env.profile.showExperimental) {
    return base(item, 'experimental-off', `${subject} is an experimental check, which you haven't switched on.`)
  }
  const strata = candidateStrata(env.session)
  if (strata.length === 0) return base(item, 'needs-more-serves', `${subject} needs serves from one set-up.`)
  const found = strongest(strata.map((k) => detectInStratum(item, env, k)).filter((d) => d.status !== 'not-applicable'))
  const d = found ?? base(item, 'not-applicable', '')
  // Effective tier (§13): the item's tier, the firing path's tier and the primary metric's status.
  const tiers = [item.evidenceTier, d.pathTier].filter(Boolean) as EvidenceTier[]
  return { ...d, pathTier: weakestTier(tiers) }
}

const TIER_ORDER: EvidenceTier[] = ['experimental', 'coach-recommended', 'research-backed']
export function weakestTier(tiers: readonly EvidenceTier[]): EvidenceTier {
  let w: EvidenceTier = 'research-backed'
  for (const t of tiers) if (TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(w)) w = t
  return w
}
