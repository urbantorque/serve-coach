/**
 * Session aggregation (METRICS §1.5, §1.6, §4.1–§4.3, §4.8): per stratum, centres and spreads of
 * the included per-serve values with "X of N serves measured", provisional labels, censoring,
 * noise correction, repeatability and the fatigue flag. The headline stratum is the one with the
 * most included serves. Player-entered outcomes are not in the engine's input, so their rates are
 * NOT_ENTERED here; the UI recomputes them from tags with the same stats functions.
 */
import type { MetricId, MetricStatus, MetricValue, ReasonCode } from '../types.ts'
import type { ServeAnalysis, SessionStats, StratumKey, StratumStats } from '../../data/domain.ts'
import {
  censoredMedian,
  dropStatisticalOutliers,
  summariseBands,
  summariseCentre,
  summariseSpread,
  type BandLabel,
  type ServeValue,
} from '../stats/aggregate.ts'
import { fatigueFlag } from '../stats/flags.ts'
import { applyProvisionalBand, f3Trigger, f12Trigger, f4Trigger, provisionalBandFor, type Sex } from '../stats/bands.ts'
import { hashString } from '../stats/descriptive.ts'
import { finalizeMetric, unavailable, wrongViewReason, type Downgrade, type MetricDraft } from './status.ts'
import { METRIC_VIEWS, PLAUSIBILITY, type ConditionClass } from './catalogue.ts'
import { METRIC_IDS } from '../types.ts'
import type { PerServeResult } from './perServe.ts'
import { repeatability, type RepeatabilityResult } from './repeatability.ts'
import { sessionHeadline } from './headline.ts'
import type { ServeCore } from '../serve/analyse.ts'
import type { PoseTrack } from '../serve/track.ts'
import { serveTrajectory } from './repeatability.ts'

export interface SessionServe {
  analysis: ServeAnalysis
  core: ServeCore
  result: PerServeResult
  stratum: StratumKey
}

export interface SessionContext {
  sessionId: string
  view: 'side' | 'rear' | 'front45' | 'unknown'
  condition: ConditionClass
  captureFps: number
  playerHeightM: number
  heightEntered: boolean
  sex?: Sex
  quality: { overall: 'good' | 'usable' | 'poor' }
  intendedType?: 'flat' | 'slice' | 'kick'
  targetTags?: Record<number, 'T' | 'body' | 'wide'>
  track: PoseTrack
}

const INCLUDED: MetricStatus[] = ['measured', 'estimated']

export function stratumKeyString(k: StratumKey): string {
  return `${k.view}|${k.cameraSide}|${k.courtSide}|${k.serveNumber}|${k.intendedType}|${k.handedness}`
}

interface Collected {
  values: ServeValue[]
  experimental: ServeValue[]
  experimentalReason?: ReasonCode
  nTotal: number
  nCensored: number
  censoredValues: number[]
}

/**
 * Collects included values of a per-serve metric (§1.5); experimental ones separately. For a spread
 * (forSpread), a value that is experimental only because the phone pitch is unknown counts with its
 * level status: absolute heights shift with an unknown tilt, but their spread across serves does not
 * to first order (METRICS §1.1 item 3).
 */
function collect(serves: readonly SessionServe[], id: MetricId, scale = 1, contactMetric = false, forSpread = false): Collected {
  const out: Collected = { values: [], experimental: [], nTotal: 0, nCensored: 0, censoredValues: [] }
  for (const s of serves) {
    if (s.core.classification !== 'serve') continue
    if (contactMetric && s.core.noContact) continue
    out.nTotal++
    const m = s.analysis.metrics[id]
    if (!m) continue
    if (m.censored === 'right') {
      out.nCensored++
      continue
    }
    if (typeof m.value !== 'number' || m.plausibility === 'hard-reject') continue
    const raw = s.result.raw
    // Use the unrounded value where the per-serve record rounds for display.
    const exact =
      id === 'toss-apex-height' ? raw.apexRatio : id === 'contact-height-ratio' ? raw.contactRatio : id === 'toss-forward' ? raw.forwardCm : id === 'toss-lateral' ? raw.lateralCm :
      id === 'contact-forward' ? raw.contactForwardCm : id === 'rhythm-release-to-contact' ? raw.rhythmMs : id === 'toss-drop' ? raw.dropCm : id === 'leg-drive' ? raw.legDrivePct :
      id === 'loading-depth' ? raw.loadingPct : id === 'drive-time' ? raw.driveMs : id === 'trophy-pause' ? raw.pauseMs : id === 'landing-distance' ? raw.landingCm : undefined
    const v: ServeValue = {
      serveId: s.analysis.id,
      value: (exact ?? m.value) * scale,
      sigmaRandom: (m.sigmaRandom ?? 0) * scale,
      sigmaLeak: (m.sigmaLeak ?? 0) * scale,
      sigmaShared: (m.sigmaShared ?? 0) * scale,
      confidence: m.confidence,
    }
    const status = forSpread && m.status === 'experimental' && m.statusIfLevel ? m.statusIfLevel : m.status
    if (INCLUDED.includes(status) && m.confidence >= 0.5 && s.analysis.included) out.values.push(v)
    else if (status === 'experimental' && s.analysis.included) {
      out.experimental.push(v)
      out.experimentalReason ??= m.reasonCode
    }
  }
  return out
}

function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step
}

export interface StratumAggregate {
  key: StratumKey
  serves: SessionServe[]
  metrics: Partial<Record<MetricId, MetricValue>>
  n: number
  nTotal: number
  repeatability: RepeatabilityResult | null
  triggers: Record<string, unknown>
}

function centreMetric(id: MetricId, serves: readonly SessionServe[], ctx: SessionContext, kind: 'mean' | 'median', step: number, extra: (c: number) => Record<string, number | string> = () => ({}), contactMetric = false): MetricValue {
  const col = collect(serves, id, 1, contactMetric)
  const useExperimental = col.values.length === 0 && col.experimental.length > 0
  const pool = useExperimental ? col.experimental : col.values
  const { kept } = dropStatisticalOutliers(pool)
  const summary = summariseCentre(kept, kind, { nTotal: col.nTotal, seed: hashString(`${ctx.sessionId}:${id}`) })
  if (summary.hidden) {
    return unavailable(id, 'TOO_FEW_SERVES', `${summary.n} of ${col.nTotal} serves measured`, {
      n: summary.n,
      nEligible: col.nTotal,
      unlockHint: 'Record at least 5 serves from one side.',
    })
  }
  let value = summary.value!
  // Censored apexes: the median treats them as larger than every uncensored value (§3.6).
  if (id === 'toss-apex-height' && col.nCensored > 0) {
    const cm = censoredMedian(kept.map((v) => v.value), col.nCensored)
    if (!Number.isFinite(cm)) return unavailable(id, 'APEX_OUT_OF_FRAME', 'more than half of the tosses left the picture', { n: summary.n, nEligible: col.nTotal })
    value = cm
  }
  const downs: Downgrade[] = []
  if (useExperimental) downs.push({ cap: 'experimental', reason: col.experimentalReason ?? 'VALIDATION_PENDING' })
  if (ctx.quality.overall === 'poor') downs.push({ cap: 'experimental', reason: 'EXCLUDED_BY_QUALITY' })
  const draft: MetricDraft = {
    value: roundTo(value, step),
    confidence: kept.reduce((a, v) => a + (v.confidence ?? 1), 0) / Math.max(1, kept.length),
    basis: `${kind} of ${summary.n} of ${col.nTotal} serves measured`,
    uncertainty: summary.ci95 ? { kind: 'ci95', low: summary.ci95[0], high: summary.ci95[1] } : undefined,
    secondary: { ...extra(value), ...(summary.coverage && summary.method === 'order-statistic' ? { ciCoverage: Math.round(summary.coverage * 1000) / 1000 } : {}), ...(col.nCensored ? { censored: col.nCensored } : {}) },
    n: summary.n,
    nEligible: col.nTotal,
    provisional: summary.provisional || (id === 'toss-apex-height' && col.nCensored / Math.max(1, summary.n + col.nCensored) > 0.1),
    sigmaRandom: summary.se ?? undefined,
    downgrades: downs,
  }
  return finalizeMetric(id, draft, ctx.condition)
}

function spreadMetric(
  id: MetricId,
  source: MetricId,
  serves: readonly SessionServe[],
  ctx: SessionContext,
  scale: number,
  step: number,
  options: { nearLimitAlways?: boolean; hardAbove?: number; softAbove?: number; contactMetric?: boolean; note?: string } = {},
): { metric: MetricValue; summary: ReturnType<typeof summariseSpread> | null; detected: number } {
  const col = collect(serves, source, scale, options.contactMetric, true)
  const useExperimental = col.values.length < 8 && col.experimental.length >= 8
  const pool = useExperimental ? col.experimental : col.values
  const summary = summariseSpread(pool, { nTotal: col.nTotal, nCensored: col.nCensored, seed: hashString(`${ctx.sessionId}:${id}`) })
  if (summary.hidden) {
    return {
      metric: unavailable(id, 'TOO_FEW_SERVES', `${summary.n} of ${col.nTotal} serves measured; a spread needs 8`, { n: summary.n, nEligible: col.nTotal, unlockHint: 'Record at least 8 serves from one side.' }),
      summary: null,
      detected: col.values.length,
    }
  }
  const downs: Downgrade[] = []
  if (useExperimental) downs.push({ cap: 'experimental', reason: col.experimentalReason ?? 'VALIDATION_PENDING' })
  const sd = summary.value!
  let plaus: MetricValue['plausibility'] = 'ok'
  if (options.hardAbove !== undefined && sd > options.hardAbove) {
    plaus = 'hard-reject'
    downs.push({ cap: 'unavailable', reason: 'IMPLAUSIBLE_VALUE' })
  } else if (options.softAbove !== undefined && sd > options.softAbove) plaus = 'soft-flag'
  const near = summary.nearMeasurementLimit || !!options.nearLimitAlways
  const draft: MetricDraft = {
    value: near ? roundTo(summary.sdObserved!, step) : roundTo(sd, step),
    confidence: 0.8,
    basis: `${near ? 'at most (at the limit of what we can measure) ' : ''}${summary.isLowerBound ? 'at least ' : ''}SD of ${summary.n} of ${col.nTotal} serves, noise-corrected${options.note ? `; ${options.note}` : ''}`,
    uncertainty: summary.ci95 ? { kind: 'ci95', low: summary.ci95[0], high: summary.ci95[1] } : undefined,
    secondary: {
      observedSd: roundTo(summary.sdObserved!, step),
      meanSigmaRandom: Math.round(summary.meanSigmaRandom * 10) / 10,
      ...(summary.isLowerBound ? { atLeast: 'yes', censored: col.nCensored } : col.nCensored ? { censored: col.nCensored } : {}),
    },
    n: summary.n,
    nEligible: col.nTotal,
    provisional: summary.provisional,
    nearMeasurementLimit: near,
    plausibility: plaus,
    sigmaRandom: summary.meanSigmaRandom,
    downgrades: downs,
    infoReason: plaus === 'soft-flag' ? 'CHECK_THIS_SERVE' : undefined,
  }
  return { metric: finalizeMetric(id, draft, ctx.condition), summary, detected: col.values.length }
}

/** Aggregates one stratum. */
export function aggregateStratum(key: StratumKey, serves: SessionServe[], ctx: SessionContext): StratumAggregate {
  const M: Partial<Record<MetricId, MetricValue>> = {}
  const H = ctx.playerHeightM
  const side = ctx.view === 'side'
  const rear = ctx.view === 'rear'
  const counted = serves.filter((s) => s.core.classification === 'serve')
  const retosses = serves.filter((s) => s.core.classification === 'retoss')
  const nTotal = counted.length
  const nIncluded = counted.filter((s) => s.analysis.included).length
  const triggers: Record<string, unknown> = {}

  M['serve-count'] = finalizeMetric('serve-count', { value: nTotal, confidence: 0.9, basis: 'serves found by the engine (confirm the strip to make this "measured")', provenance: 'engine', n: nTotal, nEligible: nTotal }, ctx.condition)
  M['retoss-count'] = finalizeMetric('retoss-count', { value: retosses.length, confidence: 0.8, basis: 'tosses caught (no hit after the toss)', provenance: 'engine', n: retosses.length }, ctx.condition)

  if (ctx.view === 'side' || ctx.view === 'rear') {
    M['toss-apex-height'] = centreMetric('toss-apex-height', serves, ctx, 'median', 0.01, (c): Record<string, number> => (ctx.heightEntered ? { cm: Math.round(c * H * 100) } : {}))
    const hs = spreadMetric('toss-height-spread', 'toss-apex-height', serves, ctx, H * 100, 0.5, {
      hardAbove: PLAUSIBILITY.withinPlayerApexSdM.hardAbove * 100,
      softAbove: PLAUSIBILITY.withinPlayerApexSdM.softAbove * 100,
      note: side ? 'includes a small side-to-side component unless you add the rear view' : undefined,
    })
    M['toss-height-spread'] = hs.metric
    if (hs.summary && hs.summary.value !== null) {
      const band = provisionalBandFor('toss-height-spread')!
      if (M['toss-height-spread']!.status !== 'unavailable') {
        M['toss-height-spread'] = { ...M['toss-height-spread']!, band: applyProvisionalBand(band, hs.summary.value), bandBasis: 'population-provisional' }
      }
      triggers.f3Height = f3Trigger({ sdObserved: hs.summary.sdObserved!, n: hs.summary.n, meanSigmaRandom: hs.summary.meanSigmaRandom, correctedSd: hs.summary.value, detectedShare: nTotal ? hs.detected / nTotal : 0, axis: 'height' })
    }
    M['toss-drop'] = centreMetric('toss-drop', serves, ctx, 'median', 1, () => ({}), true)
    const drop = M['toss-drop']
    if (drop.status !== 'unavailable' && typeof drop.value === 'number') {
      M['toss-drop'] = { ...drop, band: applyProvisionalBand(provisionalBandFor('toss-drop', { sex: ctx.sex })!, drop.value), bandBasis: 'population-provisional' }
    }
    M['contact-height-ratio'] = centreMetric('contact-height-ratio', serves, ctx, 'mean', 0.01, (c): Record<string, number> => (ctx.heightEntered ? { cm: Math.round(c * H * 100) } : {}), true)
    const cr = M['contact-height-ratio']
    if (cr.status !== 'unavailable' && typeof cr.value === 'number') {
      const b = provisionalBandFor('contact-height-ratio', { intendedType: ctx.intendedType, serveNumber: key.serveNumber })
      if (b) M['contact-height-ratio'] = { ...cr, band: applyProvisionalBand(b, cr.value), bandBasis: 'population-provisional' }
      triggers.f12 = f12Trigger({ median: cr.value, n: cr.n ?? 0, se: cr.sigmaRandom ?? 0, sigmaShared: 0.04, intendedType: ctx.intendedType, serveNumber: key.serveNumber })
    }
    M['contact-height-spread'] = spreadMetric('contact-height-spread', 'contact-height-ratio', serves, ctx, H * 100, 0.5, { contactMetric: true }).metric
    M['rhythm-release-to-contact'] = centreMetric('rhythm-release-to-contact', serves, ctx, 'median', 10, () => ({}), true)
    const rhythm = M['rhythm-release-to-contact']
    if (rhythm.status !== 'unavailable' && typeof rhythm.value === 'number') {
      M['rhythm-release-to-contact'] = { ...rhythm, band: applyProvisionalBand(provisionalBandFor('rhythm-release-to-contact')!, rhythm.value), bandBasis: 'population-provisional' }
    }
    const rs = spreadMetric('rhythm-spread', 'rhythm-release-to-contact', serves, ctx, 1, 5, {
      nearLimitAlways: ctx.captureFps < 60,
      hardAbove: PLAUSIBILITY.withinPlayerRhythmSdS.hardAbove * 1000,
      softAbove: PLAUSIBILITY.withinPlayerRhythmSdS.softAbove * 1000,
      contactMetric: true,
    })
    M['rhythm-spread'] = rs.metric
    if (rs.summary?.value !== null && rs.summary && M['rhythm-spread'].status !== 'unavailable') {
      M['rhythm-spread'] = { ...M['rhythm-spread'], band: applyProvisionalBand(provisionalBandFor('rhythm-spread')!, rs.summary.value!), bandBasis: 'population-provisional' }
    }
    M['trophy-pause'] = centreMetric('trophy-pause', serves, ctx, 'median', 10)
    if (typeof drop.value === 'number') {
      triggers.f4 = f4Trigger({
        medianDropCm: drop.value,
        sex: ctx.sex,
        releaseToContactMs: typeof rhythm.value === 'number' ? rhythm.value : undefined,
        trophyPauseMs: typeof M['trophy-pause']?.value === 'number' ? (M['trophy-pause']!.value as number) : undefined,
      })
    }
  }

  if (side) {
    M['toss-forward'] = centreMetric('toss-forward', serves, ctx, 'mean', 1)
    const fs = spreadMetric('toss-forward-spread', 'toss-forward', serves, ctx, 1, 0.5)
    M['toss-forward-spread'] = fs.metric
    if (fs.summary?.value !== null && fs.summary && fs.metric.status !== 'unavailable') {
      M['toss-forward-spread'] = { ...fs.metric, band: applyProvisionalBand(provisionalBandFor('toss-forward-spread')!, fs.summary.value!), bandBasis: 'population-provisional' }
      triggers.f3Forward = f3Trigger({ sdObserved: fs.summary.sdObserved!, n: fs.summary.n, meanSigmaRandom: fs.summary.meanSigmaRandom, correctedSd: fs.summary.value!, detectedShare: nTotal ? fs.detected / nTotal : 0, axis: 'forward' })
    }
    M['contact-forward'] = centreMetric('contact-forward', serves, ctx, 'mean', 1, () => ({}), true)
    M['leg-drive'] = centreMetric('leg-drive', serves, ctx, 'median', 1, (c): Record<string, number> => (ctx.heightEntered ? { cm: Math.round((c / 100) * H * 100) } : {}), true)
    if (M['leg-drive'].status !== 'unavailable' && (M['leg-drive'].n ?? 0) < 8) {
      M['leg-drive'] = unavailable('leg-drive', 'TOO_FEW_SERVES', `${M['leg-drive'].n} serves measured; the session value needs 8`, { n: M['leg-drive'].n, nEligible: M['leg-drive'].nEligible, unlockHint: 'Record at least 8 serves from one side.' })
    } else if (M['leg-drive'].status !== 'unavailable') M['leg-drive'] = { ...M['leg-drive'], reasonCode: 'BASELINE_BUILDING', unlockHint: 'Building your range: 1 of 2 sessions from this set-up.', bandBasis: 'player-relative' }
    M['drive-time'] = centreMetric('drive-time', serves, ctx, 'median', 10, () => ({}), true)
    const ld = centreMetric('loading-depth', serves, ctx, 'median', 1, (c): Record<string, number> => (ctx.heightEntered ? { cm: Math.round((c / 100) * H * 100) } : {}), true)
    if (ld.status !== 'unavailable' && typeof ld.value === 'number') {
      // Two descriptive levels on the session median, only with probability ≥ 0.7 (§3.29).
      const se = ld.sigmaRandom ?? 1
      const pClear = 1 - 0.5 * (1 + erf((3 - ld.value) / (Math.SQRT2 * Math.max(se, 0.3))))
      const level = pClear >= 0.7 ? 'clear dip' : 1 - pClear >= 0.7 ? 'small dip' : ''
      M['loading-depth'] = { ...ld, secondary: { ...(ld.secondary ?? {}), ...(level ? { level } : {}) } }
    } else M['loading-depth'] = ld
    // deep-bend-flag: share of yes (experimental, never "no bend").
    const flags = counted.map((s) => s.analysis.metrics['deep-bend-flag']).filter((m): m is MetricValue => !!m && m.status !== 'unavailable')
    M['deep-bend-flag'] = flags.length >= 5
      ? finalizeMetric('deep-bend-flag', { value: flags.some((f) => f.flag) ? 'yes' : 'no', flag: flags.some((f) => f.flag), confidence: 0.5, basis: `${flags.filter((f) => f.flag).length} of ${flags.length} serves looked like a deep bend (experimental)`, secondary: { k: flags.filter((f) => f.flag).length }, n: flags.length, nEligible: nTotal }, ctx.condition)
      : unavailable('deep-bend-flag', 'TOO_FEW_SERVES', `${flags.length} serves measured`, { n: flags.length, nEligible: nTotal })
    const tilts = counted.filter((s) => s.analysis.metrics['shoulder-tilt-trophy']?.status !== 'unavailable' && s.result.raw.shoulderTiltDeg !== undefined)
    M['shoulder-tilt-trophy'] = tilts.length >= 5
      ? finalizeMetric('shoulder-tilt-trophy', { value: null, confidence: 0.7, basis: `${tilts.length} of ${nTotal} serves measured; the band needs your own range from 2 sessions`, bandBasis: 'player-relative', n: tilts.length, nEligible: nTotal, infoReason: 'BASELINE_BUILDING', secondary: { sessionsInRange: 1 } }, ctx.condition)
      : unavailable('shoulder-tilt-trophy', 'TOO_FEW_SERVES', `${tilts.length} serves measured`, { n: tilts.length, nEligible: nTotal })
    M['landing-distance'] = centreMetric('landing-distance', serves, ctx, 'mean', 1)
  }
  if (rear) {
    M['toss-lateral'] = centreMetric('toss-lateral', serves, ctx, 'mean', 1)
    M['toss-lateral-spread'] = spreadMetric('toss-lateral-spread', 'toss-lateral', serves, ctx, 1, 0.5).metric
    const bands = counted.map((s) => s.analysis.metrics['knee-bend-band']?.band).filter((b): b is BandLabel => !!b)
    const bs = summariseBands(bands)
    M['knee-bend-band'] = bs.hidden
      ? unavailable('knee-bend-band', 'TOO_FEW_SERVES', `${bands.length} serves with a knee band`, { n: bands.length, nEligible: nTotal })
      : finalizeMetric('knee-bend-band', { value: bs.mode, band: bs.mode ?? undefined, bandBasis: 'fixed-geometric', confidence: 0.6, basis: `${bs.counts[bs.mode ?? 'unclear']} of ${bs.n} serves: ${bs.mode}`, secondary: { low: bs.counts.low, typical: bs.counts.typical, high: bs.counts.high, unclear: bs.counts.unclear }, n: bs.n, nEligible: nTotal, provisional: bs.provisional }, ctx.condition)
    M['shoulder-over-shoulder-contact'] = finalizeMetric('shoulder-over-shoulder-contact', { value: null, confidence: 0.5, basis: 'the band needs your own range from 2 rear-view sessions', bandBasis: 'player-relative', infoReason: 'BASELINE_BUILDING' }, ctx.condition)
  }

  // Repeatability (experimental; n ≥ 5 with release, trophy and contact).
  const trajs = counted
    .filter((s) => s.analysis.included && !s.core.noContact)
    .map((s) => ({ serveIndex: s.core.index, traj: serveTrajectory(s.core, ctx.track) }))
    .filter((t): t is { serveIndex: number; traj: NonNullable<ReturnType<typeof serveTrajectory>> } => t.traj !== null)
  const rep = ctx.view === 'side' || ctx.view === 'rear' ? repeatability(trajs, `${ctx.sessionId}:repeatability`) : null
  M.repeatability = rep
    ? finalizeMetric('repeatability', { value: Math.round(rep.index), confidence: 0.5, basis: `similarity of ${rep.n} serves' body and ball paths to your median serve (experimental)`, uncertainty: rep.ci95 ? { kind: 'range', low: Math.round(rep.ci95[0]), high: Math.round(rep.ci95[1]) } : undefined, n: rep.n, nEligible: nTotal }, ctx.condition)
    : unavailable('repeatability', 'TOO_FEW_SERVES', 'needs 5 serves with release, trophy and contact', { n: trajs.length, nEligible: nTotal, unlockHint: 'Record at least 5 serves from one side.' })

  // Fatigue flag (§4.8): one block = the stratum's serves in order.
  const ratios = counted
    .filter((s) => s.analysis.included && s.analysis.metrics['contact-height-ratio'] && INCLUDED.includes(s.analysis.metrics['contact-height-ratio']!.status))
    .map((s) => s.result.raw.contactRatio!)
  const apexCm = counted.filter((s) => s.result.raw.apexM !== undefined).map((s) => s.result.raw.apexM! * 100)
  const ff = fatigueFlag({ contactRatios: ratios, apexCm, seed: `${ctx.sessionId}:fatigue` })
  M['fatigue-flag'] = ff.computed
    ? finalizeMetric('fatigue-flag', { value: ff.flag ? 'yes' : 'no', flag: ff.flag, confidence: ff.confidence, basis: ff.flag ? ff.copy! : 'contact height held steady through the block', secondary: { dropRatio: Math.round((ff.drop ?? 0) * 1000) / 1000 }, n: ratios.length }, ctx.condition)
    : unavailable('fatigue-flag', 'TOO_FEW_SERVES', `needs 16 measured contact heights in one block (${ratios.length} here)`, { n: ratios.length, unlockHint: 'Record at least 16 serves from one side.' })

  // Every view-specific id the view cannot see is present as unavailable with the wrong-view reason.
  for (const id of METRIC_IDS) {
    if (M[id]) continue
    const views = METRIC_VIEWS[id] as readonly string[]
    if (views.length && !views.includes(ctx.view)) M[id] = unavailable(id, ctx.view === 'side' || ctx.view === 'rear' ? wrongViewReason(views) : 'NEEDS_SIDE_VIEW', 'not visible from this camera view')
  }
  return { key, serves, metrics: M, n: nIncluded, nTotal, repeatability: rep, triggers }
}

function erf(x: number): number {
  // Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7), adequate for a 0.7 probability gate.
  const s = Math.sign(x)
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a)
  return s * y
}

/** Session statistics: strata, the headline stratum's metrics, and session-wide values. */
export function buildSessionStats(serves: SessionServe[], ctx: SessionContext, extra: { captureQuality: MetricValue; speed: MetricValue[]; inputsHash: string }): { stats: SessionStats; strata: StratumAggregate[] } {
  const groups = new Map<string, { key: StratumKey; serves: SessionServe[] }>()
  for (const s of serves) {
    const k = stratumKeyString(s.stratum)
    const g = groups.get(k)
    if (g) g.serves.push(s)
    else groups.set(k, { key: s.stratum, serves: [s] })
  }
  const strata = [...groups.values()].map((g) => aggregateStratum(g.key, g.serves, ctx))
  strata.sort((a, b) => b.n - a.n || b.nTotal - a.nTotal)
  const head = strata[0]
  const metrics: Partial<Record<MetricId, MetricValue>> = head ? { ...head.metrics } : {}
  // Pool-able across strata (§1.6): serve count, re-tosses, capture quality, outcome tallies.
  const totalServes = serves.filter((s) => s.core.classification === 'serve').length
  const totalRetoss = serves.filter((s) => s.core.classification === 'retoss').length
  metrics['serve-count'] = finalizeMetric('serve-count', { value: totalServes, confidence: 0.9, basis: 'serves found by the engine (confirm the strip to make this "measured")', provenance: 'engine', n: totalServes, nEligible: totalServes }, ctx.condition)
  metrics['retoss-count'] = finalizeMetric('retoss-count', { value: totalRetoss, confidence: 0.8, basis: 'tosses caught (no hit after the toss)', provenance: 'engine', n: totalRetoss }, ctx.condition)
  metrics['capture-quality'] = extra.captureQuality
  for (const id of ['serve-in-rate', 'first-serve-in-rate', 'second-serve-in-rate', 'double-faults', 'speed-radar-entered'] as MetricId[]) {
    metrics[id] = unavailable(id, 'NOT_ENTERED', 'from your tags in review')
  }
  const tags = ctx.targetTags ?? {}
  const tagList = Object.values(tags)
  metrics['placement-zone'] = tagList.length
    ? { id: 'placement-zone', value: `T ${tagList.filter((t) => t === 'T').length} · body ${tagList.filter((t) => t === 'body').length} · wide ${tagList.filter((t) => t === 'wide').length}`, unit: 'counts T/body/wide', status: 'player-entered', confidence: 1, basis: 'where you aimed (your tags)', provenance: 'from-your-tags', n: tagList.length, secondary: { T: tagList.filter((t) => t === 'T').length, body: tagList.filter((t) => t === 'body').length, wide: tagList.filter((t) => t === 'wide').length } }
    : unavailable('placement-zone', 'NOT_ENTERED', 'from your tags in review')
  metrics['serve-type-mix'] = ctx.intendedType
    ? { id: 'serve-type-mix', value: `${ctx.intendedType} ${totalServes}`, unit: 'counts flat/slice/kick/unknown', status: 'player-entered', confidence: 1, basis: 'the serve type you chose for this block', provenance: 'from-your-tags', n: totalServes, secondary: { [ctx.intendedType]: totalServes } }
    : unavailable('serve-type-mix', 'NOT_ENTERED', 'the serve type you chose')
  metrics.spin = unavailable('spin', 'NOT_MEASURABLE', 'ball spin')
  metrics['load-flag'] = unavailable('load-flag', 'BASELINE_BUILDING', 'needs 28 days and 3 sessions of history', { unlockHint: 'Keep filming your sessions; the volume check starts after four weeks.' })
  for (const m of extra.speed) metrics[m.id as MetricId] = m

  const derivedPerServe: SessionStats['derivedPerServe'] = {}
  const repIndex = head?.repeatability?.representativeServeIndex
  const representative = repIndex !== undefined ? serves.find((s) => s.core.index === repIndex)?.analysis.id : undefined
  // "X of N measured" counts like the capture line (the pipeline's analysis counts): every serve the
  // engine found except caught tosses and shadow swings, and the ones kept for statistics. The
  // sentence (and its spread number) is the shared headline.ts one the UI also renders.
  const found = serves.filter((s) => s.core.classification !== 'retoss' && s.core.classification !== 'shadow')
  const headline =
    !head || totalServes === 0
      ? 'No serves were found in this video.'
      : sessionHeadline({
          metrics,
          strata: strata.map((s) => ({ key: s.key, metrics: s.metrics })),
          measured: Math.max(strata.length > 1 ? 0 : head.n, found.filter((s) => s.analysis.included).length),
          detected: Math.max(strata.length > 1 ? 0 : head.nTotal, found.length),
        })
  const stats: SessionStats = {
    sessionId: ctx.sessionId,
    inputsHash: extra.inputsHash,
    computedAt: new Date().toISOString(),
    metrics,
    strata: strata.map((s): StratumStats => ({ key: s.key, n: s.n, nTotal: s.nTotal, metrics: s.metrics })),
    outcomeLink: null,
    outcomeLinkChecks: [],
    derivedPerServe,
    representativeServeId: representative,
    headline,
  }
  return { stats, strata }
}
