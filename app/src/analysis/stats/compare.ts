/**
 * Matched comparisons (METRICS §4.4) and the across-session trend (§4.6).
 */
import { POCOCK_Z80, POCOCK_Z95, classifyVerdict, type VerdictId } from './verdict.ts'

export type SetupClass = 'portrait-near' | 'landscape-fence' | 'landscape-near' | 'rear'

/** Everything that must be equal for a like-for-like comparison. */
export interface MatchContext {
  view: 'side' | 'rear' | 'front45' | 'unknown'
  setupClass: SetupClass | 'unknown'
  cameraSide: 'chest' | 'back' | 'unknown'
  courtSide: 'deuce' | 'ad' | 'unknown'
  serveNumber: 1 | 2 | 'unknown'
  intendedType: 'flat' | 'slice' | 'kick' | 'unknown'
  handedness: 'right' | 'left'
  /** Rates only. */
  entryMode?: 'per-serve-tags' | 'tally' | 'match-log'
  /** Soft factors. */
  fpsClass?: 'fps30' | 'fps60' | 'fps120plus'
  bodyPx?: number
  conditionClass?: 'day' | 'overcast' | 'night-lights' | 'flicker'
  captureQuality?: 'good' | 'usable' | 'poor'
}

/** Timing metrics may be compared across side set-up classes (with the note "different set-up"). */
export const CROSS_SETUP_COMPARABLE_IDS = ['rhythm-release-to-contact', 'rhythm-spread', 'toss-drop', 'trophy-pause', 'drive-time'] as const

export interface MatchResult {
  matched: boolean
  /** UNMATCHED reason in plain words, when not matched. */
  reason?: string
  notes: string[]
}

/** StratumKey string `${view}|${setupClass}|${cameraSide}|${courtSide}|${serveNumber}|${intendedType}` (§1.4). */
export function stratumKeyString(c: Pick<MatchContext, 'view' | 'setupClass' | 'cameraSide' | 'courtSide' | 'serveNumber' | 'intendedType'>): string {
  return `${c.view}|${c.setupClass}|${c.cameraSide}|${c.courtSide}|${c.serveNumber}|${c.intendedType}`
}

export function matchComparison(metricId: string, a: MatchContext, b: MatchContext): MatchResult {
  const notes: string[] = []
  const fail = (reason: string): MatchResult => ({ matched: false, reason, notes })
  if (a.view !== b.view) return fail('different camera views are never compared')
  if (a.cameraSide !== b.cameraSide) return fail('the phone was on a different side of you')
  if (a.setupClass !== b.setupClass) {
    const timing = (CROSS_SETUP_COMPARABLE_IDS as readonly string[]).includes(metricId)
    if (!(timing && a.view === 'side' && b.view === 'side')) return fail('different phone set-up')
    notes.push('different set-up')
  }
  if (a.courtSide !== b.courtSide) return fail('served from a different side of the court')
  if (a.serveNumber !== b.serveNumber) return fail('first and second serves are compared separately')
  if (a.intendedType !== b.intendedType) return fail('a different serve type')
  if (a.handedness !== b.handedness) return fail('a different hitting hand')
  if (a.entryMode !== undefined || b.entryMode !== undefined) {
    if (a.entryMode === 'match-log' || b.entryMode === 'match-log') return fail('match logs are never compared with practice')
    if (a.entryMode !== b.entryMode) return fail('one side was tallied and the other tagged serve by serve')
  }
  if (a.captureQuality === 'poor' || b.captureQuality === 'poor') return fail('capture quality was Limited')
  if (a.fpsClass && b.fpsClass && a.fpsClass !== b.fpsClass) notes.push('different frame rate')
  if (a.bodyPx && b.bodyPx && Math.max(a.bodyPx, b.bodyPx) / Math.min(a.bodyPx, b.bodyPx) > 1.5) notes.push('you were a different size in the picture')
  if (a.conditionClass && b.conditionClass && a.conditionClass !== b.conditionClass) notes.push('different light')
  return { matched: true, notes }
}

// ---------- trend (§4.6) ----------

export interface TrendPoint {
  /** Session order (0, 1, 2, …) or days since the first session. */
  x: number
  value: number
  /** SE of the session estimate (random part). */
  se: number
  /** Session at the measurement limit: shown as "≤", left out of the fit. */
  atLimit?: boolean
}

export interface TrendResult {
  status: 'building' | 'comparison-only' | 'trend'
  slope?: number
  /** Fitted change across the window (slope × span), in goodness units. */
  change?: number
  changeSe?: number
  verdict?: VerdictId | 'not-a-clear-trend'
  /** Direction-neutral words for landing-distance and drive-time. */
  neutralWords?: string
  n: number
}

/**
 * Weighted least squares of session estimates on session order, weights 1/(SE² + τ²). The change
 * across the window is classified by the §4.5 rules; "too early" becomes "Not a clear trend yet".
 * `sign` = +1 when higher is better, −1 when lower is better; `neutral` gives direction-neutral words.
 */
export function sessionTrend(
  points: readonly TrendPoint[],
  options: { tau: number; swc: number; sign?: 1 | -1; neutral?: { up: string; same: string; down: string } },
): TrendResult {
  const pts = points.filter((p) => !p.atLimit && Number.isFinite(p.value))
  if (pts.length < 2) return { status: 'building', n: pts.length }
  if (pts.length < 3) return { status: 'comparison-only', n: pts.length }
  const w = pts.map((p) => 1 / (p.se * p.se + options.tau * options.tau))
  const sw = w.reduce((a, b) => a + b, 0)
  const mx = pts.reduce((a, p, i) => a + w[i] * p.x, 0) / sw
  const my = pts.reduce((a, p, i) => a + w[i] * p.value, 0) / sw
  let sxx = 0
  let sxy = 0
  pts.forEach((p, i) => {
    sxx += w[i] * (p.x - mx) ** 2
    sxy += w[i] * (p.x - mx) * (p.value - my)
  })
  if (!(sxx > 0)) return { status: 'comparison-only', n: pts.length }
  const slope = sxy / sxx
  const slopeSe = Math.sqrt(1 / sxx)
  const span = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
  const sign = options.sign ?? 1
  const change = slope * span * sign
  const changeSe = slopeSe * span
  const ci95: [number, number] = [change - POCOCK_Z95 * changeSe, change + POCOCK_Z95 * changeSe]
  const ci80: [number, number] = [change - POCOCK_Z80 * changeSe, change + POCOCK_Z80 * changeSe]
  const v = classifyVerdict(change, ci95, ci80, options.swc)
  const verdict = v === 'too-early' ? 'not-a-clear-trend' : v
  let neutralWords: string | undefined
  if (options.neutral) {
    neutralWords =
      verdict === 'clearly-better' || verdict === 'likely-better'
        ? options.neutral.up
        : verdict === 'clearly-worse' || verdict === 'likely-worse'
          ? options.neutral.down
          : verdict === 'no-clear-change'
            ? options.neutral.same
            : 'Not a clear trend yet'
  }
  return { status: 'trend', slope, change, changeSe, verdict, neutralWords, n: pts.length }
}
