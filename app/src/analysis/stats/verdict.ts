/**
 * "Did it work?" (METRICS §4.5): matched comparison of a baseline and a follow-up on one metric,
 * with the between-session term τ, pre-planned looks (Pocock boundaries for 3 looks), the
 * spread bootstrap of corrected variances, Newcombe intervals for player-entered rates, the
 * measurement-limit verdict and "about N more serves" planning. Pure; the bootstrap is seeded.
 */
import { mean, median, seededRng, variance, type Rng } from './descriptive.ts'
import { normalCdf } from './distributions.ts'
import { medianInterval, wilson } from './intervals.ts'
import { MIN_N } from './aggregate.ts'

export type VerdictId =
  | 'not-comparable'
  | 'at-measurement-limit'
  | 'clearly-better'
  | 'clearly-worse'
  | 'no-clear-change'
  | 'likely-better'
  | 'likely-worse'
  | 'too-early'

/** Pocock constants for 3 equally spaced looks (two-sided α 0.05 and 0.20), metrics.json `looks`. */
export const POCOCK_Z95 = 2.29
export const POCOCK_Z80 = 1.65
export const POWER_Z80 = 0.84
export const MAX_LOOKS = 3
export const PLANNED_FOLLOW_UP_SESSIONS = 3
export const MORE_SERVES_CAP = 150

/** Player-facing words (metrics.json `verdicts`). {N} and {reason} are filled in. */
export const VERDICT_WORDS: Record<VerdictId, string> = {
  'not-comparable': 'Not comparable yet: {reason}',
  'at-measurement-limit': 'At the limit of what we can measure',
  'clearly-better': 'Clearly better',
  'likely-better': 'Likely better. About {N} more serves to confirm',
  'no-clear-change': 'About the same',
  'too-early': 'Too early to tell. About {N} more serves would settle it',
  'likely-worse': 'Likely worse. About {N} more serves to confirm',
  'clearly-worse': 'Clearly worse',
}

export const TOO_SMALL_TO_CONFIRM =
  'More than 150 serves; this difference is too small to confirm by counting. Watch toss spread and contact height instead.'

export const WITHIN_SESSION_CAVEAT = 'Same-session comparison: warm-up and tiredness can explain part of the difference.'

/** Direction of goodness: higher-is-better, lower-is-better or a target band [low, high]. */
export type Direction = 'higher' | 'lower' | { band: readonly [number, number] }

/** Goodness transform g(x) (§4.5): x, −x or −dist(x, band). */
export function goodness(x: number, direction: Direction): number {
  if (direction === 'higher') return x
  if (direction === 'lower') return -x
  const [lo, hi] = direction.band
  return x < lo ? -(lo - x) : x > hi ? -(x - hi) : 0
}

export interface CentreSession {
  sessionId: string
  /** Included per-serve values, in serve order. */
  values: readonly number[]
  /** σ_s of this session (session-shared error; σ_p cancels and is not passed). */
  sigmaShared?: number
  quality?: 'good' | 'usable' | 'poor'
}

export interface SpreadSession {
  sessionId: string
  values: readonly number[]
  /** Per-serve σ_r, same length as values (or one value for all). */
  sigmaRandom: readonly number[] | number
  nearMeasurementLimit?: boolean
  quality?: 'good' | 'usable' | 'poor'
}

export interface RateSide {
  sessionIds: readonly string[]
  k: number
  n: number
  entryMode?: 'per-serve-tags' | 'tally'
  quality?: 'good' | 'usable' | 'poor'
}

interface CommonOptions {
  metricId: string
  /** Smallest worthwhile change in goodness units (spreads: relative, e.g. 0.15). */
  swc: number
  /** Between-session SD prior τ (spreads: log scale; rates: proportion). */
  tau: number
  /** Block A vs block B in one session: no σ_s, no τ, one look, never "clearly". */
  withinSession?: boolean
  /** Which planned look this is (1–3); the "How we measure" sheet shows "check k of 3". */
  look?: number
  /** False when the comparison is not like-for-like (§4.4). */
  matched?: boolean
  unmatchedReason?: string
  /** False when the metric is not eligible for verdicts (experimental, band, speed…). */
  eligible?: boolean
  seed?: string | number
}

export interface CentreVerdictInput extends CommonOptions {
  kind: 'centre'
  centre: 'mean' | 'median'
  direction: Direction
  /** Most recent first; the baseline is capped at 3 sessions and 60 serves. */
  baseline: readonly CentreSession[]
  followUp: readonly CentreSession[]
}

export interface SpreadVerdictInput extends CommonOptions {
  kind: 'spread'
  baseline: readonly SpreadSession[]
  followUp: readonly SpreadSession[]
  resamples?: number
}

export interface RateVerdictInput extends CommonOptions {
  kind: 'rate'
  /** 'higher' for in-rates; 'lower' for double faults per second serve. */
  direction: 'higher' | 'lower'
  baseline: RateSide
  followUp: RateSide
}

export type VerdictInput = CentreVerdictInput | SpreadVerdictInput | RateVerdictInput

export interface VerdictOutput {
  verdict: VerdictId
  /** Player-facing words with {N} filled; rates add "(from your tags)". */
  words: string
  /** Effect in goodness units (positive = better); spreads: relative tightening 1 − SD_f/SD_b. */
  delta?: number
  se?: number
  /** Δ ± 2.29·SE (Pocock 95%) and Δ ± 1.65·SE; percentile equivalents for spreads. */
  ci95?: [number, number]
  ci80?: [number, number]
  baseline?: { n: number; sessions: number; value: number }
  followUp?: { n: number; sessions: number; value: number }
  moreServes?: number
  /** "More than 150 serves" message applies. */
  tooSmallToConfirm?: boolean
  reason?: string
  caveats: string[]
  look?: number
  method: string
}

function words(verdict: VerdictId, n: number | undefined, tooSmall: boolean, reason = '', fromTags = false): string {
  let w = VERDICT_WORDS[verdict].replace('{reason}', reason)
  if (w.includes('{N}')) {
    if (tooSmall) {
      w = w.replace(/\. About \{N\} more serves.*$/, '')
      w = `${w}. ${TOO_SMALL_TO_CONFIRM}`
    } else w = w.replace('{N}', String(n ?? 0))
  }
  return fromTags ? `${w} (from your tags)` : w
}

/** §4.5 rule table on an interval pair; `withinSession` caps at "likely". */
export function classifyVerdict(delta: number, ci95: [number, number], ci80: [number, number], swc: number, withinSession = false): VerdictId {
  if (!withinSession && ci95[0] > 0 && delta >= swc) return 'clearly-better'
  if (!withinSession && ci95[1] < 0 && delta <= -swc) return 'clearly-worse'
  if (ci95[0] > -swc && ci95[1] < swc) return 'no-clear-change'
  if (ci80[0] > 0 || ci95[0] > 0) return 'likely-better'
  if (ci80[1] < 0 || ci95[1] < 0) return 'likely-worse'
  return 'too-early'
}

/**
 * "About N more serves" (§4.5 steps 1–4). V1, V2 are per-serve variances in goodness units; se is
 * the current SE; sharedVar = σ_s,1² + σ_s,2² (0 within a session); tauVar = τ².
 */
export function servesToConfirm(args: {
  delta: number
  se: number
  swc: number
  v1: number
  n1: number
  v2: number
  n2: number
  k1: number
  sharedVar: number
  tau: number
  withinSession?: boolean
}): { n: number | null; tooSmall: boolean } {
  const { delta, se, swc, v1, n1, v2, n2, k1, sharedVar, tau } = args
  const shrunk = (delta * 4 * swc * swc) / (4 * swc * swc + se * se)
  const design = Math.max(swc, Math.abs(shrunk))
  const target = Math.abs(shrunk) < swc / 2 ? (swc - Math.abs(shrunk)) / POCOCK_Z95 : design / (POCOCK_Z95 + POWER_Z80)
  const k2 = args.withinSession ? 1 : PLANNED_FOLLOW_UP_SESSIONS
  const tauTerm = args.withinSession ? 0 : tau * tau * (1 / Math.max(1, k1) + 1 / k2)
  const shared = args.withinSession ? 0 : sharedVar
  const denom = target * target - v1 / Math.max(1, n1) - shared - tauTerm
  let more: number
  if (denom > 0) {
    more = v2 / denom - n2
  } else {
    const tauEq = args.withinSession ? 0 : tau * tau * (2 / 3)
    const d2 = target * target - shared - tauEq
    if (!(d2 > 0)) return { n: null, tooSmall: true }
    const nEq = (v1 + v2) / d2
    more = nEq - Math.min(n1, n2)
  }
  const rounded = Math.max(5, Math.ceil(Math.max(0, more) / 5) * 5)
  if (rounded > MORE_SERVES_CAP) return { n: null, tooSmall: true }
  return { n: rounded, tooSmall: false }
}

function notComparable(reason: string, caveats: string[] = [], look?: number): VerdictOutput {
  return { verdict: 'not-comparable', words: words('not-comparable', undefined, false, reason), reason, caveats, look, method: 'none' }
}

function poorSide(q: readonly { quality?: string }[]): boolean {
  return q.some((s) => s.quality === 'poor')
}

// ---------- centres ----------

function capBaseline(sessions: readonly CentreSession[]): CentreSession[] {
  const out: CentreSession[] = []
  let total = 0
  for (const s of sessions.slice(0, 3)) {
    if (total >= 60) break
    const take = s.values.slice(Math.max(0, s.values.length - (60 - total)))
    out.push({ ...s, values: take })
    total += take.length
  }
  return out
}

function centreOf(xs: readonly number[], kind: 'mean' | 'median'): number {
  return kind === 'mean' ? mean(xs) : median(xs)
}

/** Variance of the centre (V/n for means; bootstrap or order-statistic variance for medians). */
function centreVariance(xs: readonly number[], kind: 'mean' | 'median', seed: string | number): number {
  if (kind === 'mean') return variance(xs) / xs.length
  const mi = medianInterval(xs, 0, { seed })
  return Number.isFinite(mi.se) ? mi.se * mi.se : variance(xs) / xs.length
}

function centreVerdict(input: CentreVerdictInput): VerdictOutput {
  const caveats = input.withinSession ? [WITHIN_SESSION_CAVEAT] : []
  const base = capBaseline(input.baseline)
  const follow = input.followUp.slice(0, 3)
  const g = (s: readonly CentreSession[]) => s.flatMap((x) => x.values.map((v) => goodness(v, input.direction)))
  const g1 = g(base)
  const g2 = g(follow)
  if (g1.length < MIN_N.didItWork.centrePerSide || g2.length < MIN_N.didItWork.centrePerSide) {
    return notComparable(`fewer than ${MIN_N.didItWork.centrePerSide} measured serves on one side`, caveats, input.look)
  }
  const seed = input.seed ?? 1
  const c1 = centreOf(g1, input.centre)
  const c2 = centreOf(g2, input.centre)
  const delta = c2 - c1
  const var1 = centreVariance(g1, input.centre, `${seed}:b`)
  const var2 = centreVariance(g2, input.centre, `${seed}:f`)
  const k1 = input.withinSession ? 1 : base.length
  const k2 = input.withinSession ? 1 : follow.length
  const sigmaS1 = mean(base.map((s) => s.sigmaShared ?? 0)) || 0
  const sigmaS2 = mean(follow.map((s) => s.sigmaShared ?? 0)) || 0
  const sharedVar = input.withinSession ? 0 : sigmaS1 * sigmaS1 + sigmaS2 * sigmaS2
  const tauVar = input.withinSession ? 0 : input.tau * input.tau * (1 / k1 + 1 / k2)
  const se = Math.sqrt(var1 + var2 + sharedVar + tauVar)
  const z95 = input.withinSession ? 1.959964 : POCOCK_Z95
  const z80 = input.withinSession ? 1.281552 : POCOCK_Z80
  const ci95: [number, number] = [delta - z95 * se, delta + z95 * se]
  const ci80: [number, number] = [delta - z80 * se, delta + z80 * se]
  const verdict = classifyVerdict(delta, ci95, ci80, input.swc, input.withinSession)
  const v1 = var1 * g1.length
  const v2 = var2 * g2.length
  const plan = servesToConfirm({
    delta,
    se,
    swc: input.swc,
    v1,
    n1: g1.length,
    v2,
    n2: g2.length,
    k1,
    sharedVar,
    tau: input.tau,
    withinSession: input.withinSession,
  })
  const needsN = verdict === 'likely-better' || verdict === 'likely-worse' || verdict === 'too-early'
  return {
    verdict,
    words: words(verdict, plan.n ?? undefined, needsN && plan.tooSmall),
    delta,
    se,
    ci95,
    ci80,
    baseline: { n: g1.length, sessions: base.length, value: centreOf(base.flatMap((s) => [...s.values]), input.centre) },
    followUp: { n: g2.length, sessions: follow.length, value: centreOf(follow.flatMap((s) => [...s.values]), input.centre) },
    moreServes: needsN ? plan.n ?? undefined : undefined,
    tooSmallToConfirm: needsN ? plan.tooSmall : undefined,
    caveats,
    look: input.look,
    method: `centre-${input.centre}${input.withinSession ? '-within-session' : ''}`,
  }
}

// ---------- rates ----------

function rateVerdict(input: RateVerdictInput): VerdictOutput {
  const caveats = input.withinSession ? [WITHIN_SESSION_CAVEAT] : []
  const { baseline: b, followUp: f } = input
  if (b.n < MIN_N.didItWork.ratePerSide || f.n < MIN_N.didItWork.ratePerSide) {
    return notComparable(`fewer than ${MIN_N.didItWork.ratePerSide} tagged serves on one side`, caveats, input.look)
  }
  if (b.entryMode && f.entryMode && b.entryMode !== f.entryMode) return notComparable('one side was tallied and the other tagged serve by serve', caveats, input.look)
  const sign = input.direction === 'higher' ? 1 : -1
  const k1 = input.withinSession ? 1 : Math.max(1, b.sessionIds.length)
  const k2 = input.withinSession ? 1 : Math.max(1, f.sessionIds.length)
  const interval = (z: number) => {
    const a = wilson(f.k, f.n, z)
    const c = wilson(b.k, b.n, z)
    const d = a.p - c.p
    let lo = d - Math.sqrt((a.p - a.low) ** 2 + (c.high - c.p) ** 2)
    let hi = d + Math.sqrt((a.high - a.p) ** 2 + (c.p - c.low) ** 2)
    if (!input.withinSession) {
      const widen = z * input.tau * Math.sqrt(1 / k1 + 1 / k2)
      lo = d - Math.hypot(d - lo, widen)
      hi = d + Math.hypot(hi - d, widen)
    }
    // Goodness orientation.
    return sign > 0 ? { d, lo, hi } : { d: -d, lo: -hi, hi: -lo }
  }
  const z95 = input.withinSession ? 1.959964 : POCOCK_Z95
  const z80 = input.withinSession ? 1.281552 : POCOCK_Z80
  const i95 = interval(z95)
  const i80 = interval(z80)
  const ci95: [number, number] = [i95.lo, i95.hi]
  const ci80: [number, number] = [i80.lo, i80.hi]
  const verdict = classifyVerdict(i95.d, ci95, ci80, input.swc, input.withinSession)
  const se = (ci95[1] - ci95[0]) / (2 * z95)
  const pooled = (b.k + f.k) / (b.n + f.n)
  const v = pooled * (1 - pooled)
  const plan = servesToConfirm({
    delta: i95.d,
    se,
    swc: input.swc,
    v1: v,
    n1: b.n,
    v2: v,
    n2: f.n,
    k1,
    sharedVar: 0,
    tau: input.tau,
    withinSession: input.withinSession,
  })
  const needsN = verdict === 'likely-better' || verdict === 'likely-worse' || verdict === 'too-early'
  return {
    verdict,
    words: words(verdict, plan.n ?? undefined, needsN && plan.tooSmall, '', true),
    delta: i95.d,
    se,
    ci95,
    ci80,
    baseline: { n: b.n, sessions: b.sessionIds.length, value: b.k / b.n },
    followUp: { n: f.n, sessions: f.sessionIds.length, value: f.k / f.n },
    moreServes: needsN ? plan.n ?? undefined : undefined,
    tooSmallToConfirm: needsN ? plan.tooSmall : undefined,
    caveats,
    look: input.look,
    method: `rate-newcombe${input.withinSession ? '-within-session' : ''}`,
  }
}

// ---------- spreads ----------

function sigmaAt(s: SpreadSession, i: number): number {
  return typeof s.sigmaRandom === 'number' ? s.sigmaRandom : s.sigmaRandom[i] ?? 0
}

/** Corrected pooled within-session variance max(s_pool² − mean(σ_r²)·f², 0). */
function correctedPooledVariance(sessions: readonly { xs: number[]; sig: number[] }[], factor: number): number {
  let ss = 0
  let df = 0
  let s2 = 0
  let m = 0
  for (const s of sessions) {
    if (s.xs.length >= 2) {
      const v = variance(s.xs)
      ss += (s.xs.length - 1) * v
      df += s.xs.length - 1
    }
    for (const x of s.sig) {
      s2 += (x * factor) ** 2
      m++
    }
  }
  if (df === 0) return Number.NaN
  return Math.max(ss / df - (m ? s2 / m : 0), 0)
}

/** Relative tightening 1 − √(V_follow / V_base), clamped to [−3, 1] (positive = tighter). */
function tightening(vBase: number, vFollow: number): number {
  if (!(vBase > 0)) return vFollow > 0 ? -3 : 0
  return Math.max(-3, Math.min(1, 1 - Math.sqrt(vFollow / vBase)))
}

function resample(s: SpreadSession, rng: Rng): { xs: number[]; sig: number[] } {
  const n = s.values.length
  const xs: number[] = []
  const sig: number[] = []
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rng() * n)
    xs.push(s.values[j])
    sig.push(sigmaAt(s, j))
  }
  return { xs, sig }
}

function quantileSorted(s: readonly number[], p: number): number {
  const h = (s.length - 1) * p
  const lo = Math.floor(h)
  const hi = Math.ceil(h)
  return s[lo] + (h - lo) * (s[hi] - s[lo])
}

function spreadVerdict(input: SpreadVerdictInput): VerdictOutput {
  const caveats = input.withinSession ? [WITHIN_SESSION_CAVEAT] : []
  const base = input.baseline.slice(0, 3)
  const follow = input.followUp.slice(0, 3)
  const n1 = base.reduce((a, s) => a + s.values.length, 0)
  const n2 = follow.reduce((a, s) => a + s.values.length, 0)
  if (n1 < MIN_N.didItWork.spreadPerSide || n2 < MIN_N.didItWork.spreadPerSide) {
    return notComparable(`fewer than ${MIN_N.didItWork.spreadPerSide} measured serves on one side`, caveats, input.look)
  }
  if ([...base, ...follow].some((s) => s.nearMeasurementLimit)) {
    return { verdict: 'at-measurement-limit', words: VERDICT_WORDS['at-measurement-limit'], caveats, look: input.look, method: 'spread-bootstrap' }
  }
  const asRows = (ss: readonly SpreadSession[]) => ss.map((s) => ({ xs: [...s.values], sig: s.values.map((_, i) => sigmaAt(s, i)) }))
  const vb = correctedPooledVariance(asRows(base), 1)
  const vf = correctedPooledVariance(asRows(follow), 1)
  const delta = tightening(vb, vf)
  const rng = seededRng(input.seed ?? 1)
  const B = input.resamples ?? 2000
  const reps: number[] = []
  for (let b = 0; b < B; b++) {
    const f = 0.8 + 0.4 * rng()
    const rb = correctedPooledVariance(base.map((s) => resample(s, rng)), f)
    const rf = correctedPooledVariance(follow.map((s) => resample(s, rng)), f)
    const t = tightening(rb, rf)
    if (Number.isFinite(t)) reps.push(t)
  }
  reps.sort((a, b) => a - b)
  const k1 = input.withinSession ? 1 : base.length
  const k2 = input.withinSession ? 1 : follow.length
  const z95 = input.withinSession ? 1.959964 : POCOCK_Z95
  const z80 = input.withinSession ? 1.281552 : POCOCK_Z80
  const pct = (z: number): [number, number] => {
    const alpha = 2 * (1 - normalCdf(z))
    return [quantileSorted(reps, alpha / 2), quantileSorted(reps, 1 - alpha / 2)]
  }
  const widen = (ci: [number, number], z: number): [number, number] => {
    if (input.withinSession) return ci
    const w = z * input.tau * Math.sqrt(1 / k1 + 1 / k2)
    const toLog = (d: number) => Math.log(Math.max(0.01, 1 - d))
    const c = toLog(delta)
    // Higher Δ ↔ lower log ratio.
    const lowLog = toLog(ci[1])
    const highLog = toLog(ci[0])
    const lo = c - Math.hypot(c - lowLog, w)
    const hi = c + Math.hypot(highLog - c, w)
    return [1 - Math.exp(hi), 1 - Math.exp(lo)]
  }
  const ci95 = widen(pct(z95), z95)
  const ci80 = widen(pct(z80), z80)
  const verdict = classifyVerdict(delta, ci95, ci80, input.swc, input.withinSession)
  // Planning on the log scale: SE²_log ≈ 1/(2(n1−1)) + 1/(2(n2−1)) + τ²(1/k1 + 1/k2).
  const tauVar = input.withinSession ? 0 : input.tau * input.tau * (1 / k1 + 1 / k2)
  const seLog = Math.sqrt(1 / (2 * (n1 - 1)) + 1 / (2 * (n2 - 1)) + tauVar)
  const swcLog = -Math.log(1 - input.swc)
  const deltaLog = -Math.log(Math.max(0.01, 1 - delta))
  const shrunk = (deltaLog * 4 * swcLog * swcLog) / (4 * swcLog * swcLog + seLog * seLog)
  const design = Math.max(swcLog, Math.abs(shrunk))
  const target = Math.abs(shrunk) < swcLog / 2 ? (swcLog - Math.abs(shrunk)) / POCOCK_Z95 : design / (POCOCK_Z95 + POWER_Z80)
  const tauPlan = input.withinSession ? 0 : input.tau * input.tau * (1 / k1 + 1 / PLANNED_FOLLOW_UP_SESSIONS)
  const rem = target * target - 1 / (2 * (n1 - 1)) - tauPlan
  let moreServes: number | undefined
  let tooSmall = false
  if (rem > 0) {
    const need = 1 + 1 / (2 * rem)
    const more = Math.max(5, Math.ceil(Math.max(0, need - n2) / 5) * 5)
    if (more > MORE_SERVES_CAP) tooSmall = true
    else moreServes = more
  } else tooSmall = true
  const needsN = verdict === 'likely-better' || verdict === 'likely-worse' || verdict === 'too-early'
  const sdOf = (ss: readonly SpreadSession[]) => Math.sqrt(correctedPooledVariance(asRows(ss), 1))
  return {
    verdict,
    words: words(verdict, moreServes, needsN && tooSmall),
    delta,
    se: seLog,
    ci95,
    ci80,
    baseline: { n: n1, sessions: base.length, value: sdOf(base) },
    followUp: { n: n2, sessions: follow.length, value: sdOf(follow) },
    moreServes: needsN ? moreServes : undefined,
    tooSmallToConfirm: needsN ? tooSmall : undefined,
    caveats,
    look: input.look,
    method: `spread-bootstrap${input.withinSession ? '-within-session' : ''}`,
  }
}

// ---------- entry point ----------

/**
 * Evaluates the §4.5 verdict. Order: not-comparable (minimum n, unmatched, poor capture, not
 * eligible, too many looks) → at-measurement-limit → the rule table.
 */
export function didItWork(input: VerdictInput): VerdictOutput {
  const caveats = input.withinSession ? [WITHIN_SESSION_CAVEAT] : []
  if (input.eligible === false) return notComparable('this reading is not eligible for a verdict', caveats, input.look)
  if (input.matched === false) return notComparable(input.unmatchedReason ?? 'the sessions are not like-for-like', caveats, input.look)
  if (input.look !== undefined && input.look > MAX_LOOKS) return notComparable('the three planned checks are used up; start a new experiment', caveats, input.look)
  const sides =
    input.kind === 'rate'
      ? [input.baseline, input.followUp]
      : ([...input.baseline, ...input.followUp] as readonly { quality?: string }[])
  if (poorSide(sides)) return notComparable('capture quality was Limited on one side', caveats, input.look)
  if (input.kind === 'centre') return centreVerdict(input)
  if (input.kind === 'spread') return spreadVerdict(input)
  return rateVerdict(input)
}

// ---------- coaching adapter ----------

/** Structural twin of coaching's VerdictRequest (analysis never imports coaching). */
export interface CoachingVerdictRequest {
  metricId: string
  direction: 'decrease' | 'increase' | 'target-band'
  baseline: { sessionIds: string[]; values: number[]; kind: 'centre' | 'spread' | 'rate'; k?: number; n?: number }
  followUp: { sessionIds: string[]; values: number[]; kind: 'centre' | 'spread' | 'rate'; k?: number; n?: number }
  sameSession: boolean
}

export interface CoachingVerdictResult {
  verdict: Exclude<VerdictId, 'at-measurement-limit'> | 'not-comparable'
  delta?: number
  low?: number
  high?: number
  moreServes?: number
  tooSmallToConfirm?: boolean
  method: string
  reason?: string
}

/** SWC, τ, centre kind and target band per metric id in engine units (METRICS §4.5 table). */
export const VERDICT_PARAMS: Record<string, { swc: number; tau: number; centre?: 'mean' | 'median'; band?: [number, number] }> = {
  'toss-apex-height': { swc: 0.03, tau: 0.023, centre: 'median' },
  'toss-forward': { swc: 5, tau: 5, centre: 'mean', band: [20, 60] },
  'contact-forward': { swc: 5, tau: 5, centre: 'mean' },
  'toss-drop': { swc: 6, tau: 5, centre: 'median' },
  'contact-height-ratio': { swc: 0.015, tau: 0.01, centre: 'mean' },
  'rhythm-release-to-contact': { swc: 30, tau: 30, centre: 'median' },
  'leg-drive': { swc: 2, tau: 1.5, centre: 'median' },
  'toss-height-spread': { swc: 0.15, tau: 0.15 },
  'toss-forward-spread': { swc: 0.15, tau: 0.15 },
  'toss-lateral-spread': { swc: 0.15, tau: 0.15 },
  'contact-height-spread': { swc: 0.15, tau: 0.15 },
  'rhythm-spread': { swc: 0.15, tau: 0.15 },
  'serve-in-rate': { swc: 0.1, tau: 0.05 },
  'first-serve-in-rate': { swc: 0.1, tau: 0.05 },
  'second-serve-in-rate': { swc: 0.1, tau: 0.05 },
  'double-faults': { swc: 0.1, tau: 0.05 },
}

/**
 * Adapter for coaching's injected VerdictFn. Per-serve values are pooled per side (one session per
 * listed id is assumed for τ); spreads treat each side's values as one session with σ_r = 0 unless
 * the caller corrected them already.
 */
export function coachingVerdict(req: CoachingVerdictRequest): CoachingVerdictResult {
  const p = VERDICT_PARAMS[req.metricId]
  if (!p) return { verdict: 'not-comparable', method: 'none', reason: 'no verdict rule for this metric' }
  const common = { metricId: req.metricId, swc: p.swc, tau: p.tau, withinSession: req.sameSession, seed: req.metricId }
  let out: VerdictOutput
  if (req.baseline.kind === 'rate') {
    out = didItWork({
      ...common,
      kind: 'rate',
      direction: req.direction === 'decrease' ? 'lower' : 'higher',
      baseline: { sessionIds: req.baseline.sessionIds, k: req.baseline.k ?? 0, n: req.baseline.n ?? 0 },
      followUp: { sessionIds: req.followUp.sessionIds, k: req.followUp.k ?? 0, n: req.followUp.n ?? 0 },
    })
  } else if (req.baseline.kind === 'spread') {
    out = didItWork({
      ...common,
      kind: 'spread',
      baseline: [{ sessionId: req.baseline.sessionIds[0] ?? 'baseline', values: req.baseline.values, sigmaRandom: 0 }],
      followUp: [{ sessionId: req.followUp.sessionIds[0] ?? 'follow-up', values: req.followUp.values, sigmaRandom: 0 }],
    })
  } else {
    const direction: Direction =
      req.direction === 'increase' ? 'higher' : req.direction === 'decrease' ? 'lower' : p.band ? { band: p.band } : 'higher'
    const split = (side: CoachingVerdictRequest['baseline']): CentreSession[] => {
      const k = Math.max(1, side.sessionIds.length)
      const per = Math.ceil(side.values.length / k)
      return Array.from({ length: k }, (_, i) => ({ sessionId: side.sessionIds[i] ?? `s${i}`, values: side.values.slice(i * per, (i + 1) * per) })).filter(
        (s) => s.values.length > 0,
      )
    }
    out = didItWork({ ...common, kind: 'centre', centre: p.centre ?? 'median', direction, baseline: split(req.baseline), followUp: split(req.followUp) })
  }
  const verdict = out.verdict === 'at-measurement-limit' ? 'not-comparable' : out.verdict
  return {
    verdict,
    delta: out.delta,
    low: out.ci95?.[0],
    high: out.ci95?.[1],
    moreServes: out.moreServes,
    tooSmallToConfirm: out.tooSmallToConfirm,
    method: out.method,
    reason: out.verdict === 'at-measurement-limit' ? 'at the limit of what we can measure' : out.reason,
  }
}

