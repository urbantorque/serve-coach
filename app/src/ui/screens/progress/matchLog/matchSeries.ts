/**
 * Comp nights as their own series (D11; METRICS §3.18, §3.19; PRODUCT §6.9 tile 5, §6.11). Pure.
 * Match logs are the player's own record: every value here is player-entered (provenance "match
 * log"), none is ever pooled with practice sessions, and none feeds a verdict. The only pooling is
 * across match logs themselves (the last few comp nights), and it is labelled as such.
 */
import { wilson } from '../../../../analysis/stats/index.ts'
import type { MetricValue } from '../../../../analysis/types.ts'
import type { MatchLogRecord } from '../../../../data/records.ts'

export interface MatchPoint {
  id: string
  date: string
  competition: MatchLogRecord['competition']
  serviceGames: number | null
  doubleFaults: number | null
  /** Double faults per service game, when both were logged. */
  dfPerGame: number | null
  /** First serves in of attempted, when counted. */
  first: { k: number; n: number } | null
  /** Older entries logged a rough first-serve share instead of counts. */
  rough: MatchLogRecord['firstServeRough'] | null
  cueUsed: MatchLogRecord['cueUsed'] | null
  hasNote: boolean
}

export const ROUGH_WORDS: Record<NonNullable<MatchLogRecord['firstServeRough']>, string> = {
  'under-half': 'fewer than half',
  'about-half': 'about half',
  most: 'most',
  'nearly-all': 'nearly all',
}

/** The player's own match logs, oldest first. Sample data never appears in Progress. */
export function matchPoints(logs: readonly MatchLogRecord[]): MatchPoint[] {
  return logs
    .filter((l) => l.isDemo !== 1)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))
    .map((l) => {
      const games = typeof l.serviceGames === 'number' && l.serviceGames > 0 ? l.serviceGames : null
      const df = typeof l.doubleFaults === 'number' ? l.doubleFaults : null
      const n = typeof l.firstServesAttempted === 'number' && l.firstServesAttempted > 0 ? l.firstServesAttempted : null
      return {
        id: l.id,
        date: l.date,
        competition: l.competition,
        serviceGames: games,
        doubleFaults: df,
        dfPerGame: games !== null && df !== null ? df / games : null,
        first: n !== null ? { k: Math.min(n, Math.max(0, l.firstServesIn ?? 0)), n } : null,
        rough: l.firstServeRough ?? null,
        cueUsed: l.cueUsed ?? null,
        hasNote: Boolean(l.notes),
      }
    })
}

/** How many recent comp nights the summary lines pool (match logs only). */
export const RECENT_MATCHES = 5

export interface RecentFirstServes {
  k: number
  n: number
  matches: number
  /** The pooled rate as a player-entered MetricValue (Wilson 95% interval), for MetricValue to render. */
  value: MetricValue
}

/** First serves in over the last few comp nights that counted them (never practice). */
export function recentFirstServes(points: readonly MatchPoint[], last = RECENT_MATCHES): RecentFirstServes | null {
  const counted = points.filter((p) => p.first).slice(-last)
  if (!counted.length) return null
  const k = counted.reduce((a, p) => a + p.first!.k, 0)
  const n = counted.reduce((a, p) => a + p.first!.n, 0)
  const w = wilson(k, n)
  return {
    k,
    n,
    matches: counted.length,
    value: {
      id: 'first-serve-in-rate',
      value: k / n,
      unit: 'k-of-n',
      status: 'player-entered',
      confidence: 1,
      basis: `first serves you counted on your last ${counted.length === 1 ? 'comp night' : `${counted.length} comp nights`}`,
      provenance: 'match-log',
      n,
      secondary: { k },
      ...(n >= 10 ? { uncertainty: { kind: 'ci95' as const, low: w.low, high: w.high } } : {}),
    },
  }
}

export interface RecentDoubleFaults {
  doubleFaults: number
  serviceGames: number
  matches: number
  perGame: number
  value: MetricValue
}

/** Double faults over the last few comp nights with games logged (never practice). */
export function recentDoubleFaults(points: readonly MatchPoint[], last = RECENT_MATCHES): RecentDoubleFaults | null {
  const logged = points.filter((p) => p.dfPerGame !== null).slice(-last)
  if (!logged.length) return null
  const df = logged.reduce((a, p) => a + (p.doubleFaults ?? 0), 0)
  const games = logged.reduce((a, p) => a + (p.serviceGames ?? 0), 0)
  return {
    doubleFaults: df,
    serviceGames: games,
    matches: logged.length,
    perGame: df / games,
    value: {
      id: 'double-faults',
      value: df,
      unit: 'count',
      status: 'player-entered',
      confidence: 1,
      basis: `double faults you logged on your last ${logged.length === 1 ? 'comp night' : `${logged.length} comp nights`}`,
      provenance: 'match-log',
    },
  }
}

/** "2 in 5 service games" style words for one comp night's double faults. */
export function dfWords(p: Pick<MatchPoint, 'doubleFaults' | 'serviceGames'>): string {
  if (p.doubleFaults === null) return 'Double faults not logged'
  const df = `${p.doubleFaults} double ${p.doubleFaults === 1 ? 'fault' : 'faults'}`
  return p.serviceGames ? `${df} in ${p.serviceGames} service ${p.serviceGames === 1 ? 'game' : 'games'}` : df
}

/** "18 of 30 first serves in" (counts only below 10, METRICS §4.1), or the older rough words. */
export function firstWords(p: Pick<MatchPoint, 'first' | 'rough'>): string {
  if (p.first) {
    const { k, n } = p.first
    return n >= 10 ? `${k} of ${n} first serves in (${Math.round((k / n) * 100)}%)` : `${k} of ${n} first serves in`
  }
  if (p.rough) return `First serves in: ${ROUGH_WORDS[p.rough]} (rough)`
  return 'First serves not counted'
}

// ---------- season weeks (the Plus season view, DESIGN §9.9) ----------

const DAY_MS = 86_400_000
const noon = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

/**
 * Week number of a date within the player's season (1-based), or, with no season set, weeks counted
 * back from `end` (the latest week is the last). Null when outside the season.
 */
export function seasonWeek(date: string, opts: { season?: { startDate: string; weeks: number }; firstDate: string }): number | null {
  const start = opts.season?.startDate ?? opts.firstDate
  const w = Math.floor((noon(date) - noon(start)) / (7 * DAY_MS)) + 1
  if (w < 1) return null
  if (opts.season && w > opts.season.weeks) return null
  return w
}

export interface SeasonRowPoint {
  week: number
  value: number
  label: string
}

export interface SeasonRows {
  weeks: number
  practice: SeasonRowPoint[]
  matches: SeasonRowPoint[]
  /** Week 1 is the season start, or else the first logged date. */
  firstDate: string
  seasonal: boolean
}

/**
 * The two aligned rows of the season view: practice (the focus process metric per session) and comp
 * nights (double faults per service game), by season week. Separate rows and separate y-axes, never
 * one combined series and never a verdict (DESIGN §9.9).
 */
export function seasonRows(opts: {
  practice: readonly { date: string; value: number; label: string }[]
  matches: readonly MatchPoint[]
  season?: { startDate: string; weeks: number }
}): SeasonRows | null {
  const dates = [...opts.practice.map((p) => p.date), ...opts.matches.map((m) => m.date)].sort()
  if (!dates.length) return null
  const firstDate = dates[0]
  const place = (date: string) => seasonWeek(date, { season: opts.season, firstDate })
  const practice = opts.practice.flatMap((p) => {
    const week = place(p.date)
    return week === null ? [] : [{ week, value: p.value, label: p.label }]
  })
  const matches = opts.matches.flatMap((m) => {
    const week = m.dfPerGame === null ? null : place(m.date)
    return week === null ? [] : [{ week, value: m.dfPerGame!, label: dfWords(m) }]
  })
  const lastWeek = Math.max(1, ...practice.map((p) => p.week), ...matches.map((m) => m.week))
  return {
    weeks: opts.season ? opts.season.weeks : lastWeek,
    practice,
    matches,
    firstDate: opts.season?.startDate ?? firstDate,
    seasonal: Boolean(opts.season),
  }
}
