/**
 * Session flags (METRICS §4.8): the within-block fatigue check and the across-session serving
 * volume check. Neither is a health statement; pain routing belongs to coaching.
 */
import { seededRng } from './descriptive.ts'
import { theilSen } from './aggregate.ts'
import { sd } from './descriptive.ts'

export interface FatigueInput {
  /** Included contact-height-ratio values of ONE stratum within ONE block, in serve order. */
  contactRatios: readonly number[]
  /** Optional apex heights (cm) in the same order, for the corroboration check. */
  apexCm?: readonly number[]
  seed?: string | number
  resamples?: number
}

export interface FatigueResult {
  computed: boolean
  reason?: 'TOO_FEW_SERVES'
  flag: boolean
  /** Predicted drop across the block (ratio of height), positive = lower contact late in the block. */
  drop?: number
  slope?: number
  /** One-sided 95% upper bootstrap bound of the slope. */
  slopeUpper95?: number
  corroborated?: boolean
  confidence: number
  copy?: string
}

export const FATIGUE_MIN_N = 16
export const FATIGUE_DROP = 0.025
export const FATIGUE_COPY =
  'Your contact point dropped in the last part of this block, which can be a sign of tiring. A shorter block next time?'

/**
 * Theil–Sen slope of the contact ratio on serve order; flag when the predicted drop is ≥ 0.025 of
 * height and the one-sided 95% bootstrap bound of the slope is below 0. Computed per block, never
 * across a drill or template boundary (the caller passes one block).
 */
export function fatigueFlag(input: FatigueInput): FatigueResult {
  const y = input.contactRatios
  const n = y.length
  if (n < FATIGUE_MIN_N) return { computed: false, reason: 'TOO_FEW_SERVES', flag: false, confidence: 0 }
  const x = y.map((_, i) => i)
  const slope = theilSen(x, y)
  const drop = -slope * (n - 1)
  const rng = seededRng(input.seed ?? 'fatigue')
  const B = input.resamples ?? 1000
  const slopes: number[] = []
  for (let b = 0; b < B; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rng() * n)).sort((a, c) => a - c)
    const s = theilSen(
      idx.map((i) => x[i]),
      idx.map((i) => y[i]),
    )
    if (Number.isFinite(s)) slopes.push(s)
  }
  slopes.sort((a, c) => a - c)
  const upper = slopes[Math.min(slopes.length - 1, Math.floor(0.95 * (slopes.length - 1)))]
  const flag = drop >= FATIGUE_DROP && upper < 0
  let corroborated: boolean | undefined
  if (input.apexCm && input.apexCm.length >= 9) {
    const third = Math.floor(input.apexCm.length / 3)
    const first = sd(input.apexCm.slice(0, third))
    const last = sd(input.apexCm.slice(input.apexCm.length - third))
    corroborated = Number.isFinite(first) && Number.isFinite(last) && last >= 1.5 * first
  }
  return {
    computed: true,
    flag,
    drop,
    slope,
    slopeUpper95: upper,
    corroborated,
    confidence: flag ? (corroborated ? 0.8 : 0.6) : 0.6,
    copy: flag ? FATIGUE_COPY : undefined,
  }
}

export interface LoadSession {
  /** Days before "today" (0 = today). */
  daysAgo: number
  serves: number
}

export interface LoadResult {
  computed: boolean
  reason?: 'TOO_FEW_SERVES' | 'history-too-short'
  flag: boolean
  acute?: number
  chronicWeeklyMean?: number
  ratio?: number
  copy?: string
}

/**
 * Uncoupled acute:chronic serving volume (§4.8): acute = serves in the last 7 days; chronic = the
 * weekly mean over days 8–35. Needs ≥ 28 days of history and ≥ 3 sessions. Flag when the ratio is
 * above 1.5 and the last 7 days hold at least 100 serves. Counts include logged match serves.
 */
export function loadFlag(sessions: readonly LoadSession[], historyDays: number): LoadResult {
  if (historyDays < 28) return { computed: false, reason: 'history-too-short', flag: false }
  if (sessions.length < 3) return { computed: false, reason: 'TOO_FEW_SERVES', flag: false }
  const acute = sessions.filter((s) => s.daysAgo < 7).reduce((a, s) => a + s.serves, 0)
  const chronicTotal = sessions.filter((s) => s.daysAgo >= 7 && s.daysAgo < 35).reduce((a, s) => a + s.serves, 0)
  const chronicWeeklyMean = chronicTotal / 4
  const ratio = chronicWeeklyMean > 0 ? acute / chronicWeeklyMean : acute > 0 ? Infinity : 0
  const flag = ratio > 1.5 && acute >= 100
  return {
    computed: true,
    flag,
    acute,
    chronicWeeklyMean,
    ratio,
    copy: flag
      ? 'You served a lot more this week than your recent average (based on the serves you filmed and logged). Building up gradually is kinder to your shoulder.'
      : undefined,
  }
}
