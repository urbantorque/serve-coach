/**
 * The match log form (PRODUCT §6.11; METRICS §3.18, §3.19; D11): after a comp night the player logs
 * service games, double faults, optionally first serves in out of attempted, whether they used their
 * cue, and a short note. Everything is player-entered. Pure and framework-free: the screen renders
 * it, the data layer stores it. Match logs are never pooled with practice and never used for a
 * verdict (ARCHITECTURE §6.5 "Match logs are never inputs").
 */
import type { MatchLogRecord, Weekday } from '../../../../data/records.ts'

export type Competition = MatchLogRecord['competition']
export type CueAnswer = NonNullable<MatchLogRecord['cueUsed']>

export const COMPETITIONS: { value: Competition; label: string }[] = [
  { value: 'night-comp', label: 'Night comp' },
  { value: 'pennant', label: 'Pennant' },
  { value: 'league', label: 'League' },
  { value: 'social', label: 'Social match' },
]

export const COMPETITION_LABEL: Record<Competition, string> = Object.fromEntries(COMPETITIONS.map((c) => [c.value, c.label])) as Record<Competition, string>

export const CUE_ANSWERS: { value: CueAnswer; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'forgot', label: 'Forgot' },
]

/** Same as the practice-log note (DESIGN §8.15). */
export const NOTE_MAX = 140

/** Limits that catch typing slips, not real matches. */
export const LIMITS = { serviceGames: { min: 1, max: 30 }, doubleFaults: { max: 60 }, firstServes: { max: 250 } } as const

export interface MatchDraft {
  /** Local date "YYYY-MM-DD". */
  date: string
  competition: Competition
  serviceGames: number
  doubleFaults: number
  /** First serves in and attempted; both null when not counted (the default: counting is optional). */
  firstServesIn: number | null
  firstServesAttempted: number | null
  cueUsed: CueAnswer | null
  notes: string
}

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * The date to offer first: the most recent of the player's match nights up to today (PRODUCT §6.11:
 * "defaults to the last match night"), else today.
 */
export function lastMatchNight(now: Date, nights: readonly Weekday[]): string {
  if (!nights.length) return ymd(now)
  for (let back = 0; back < 7; back++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 12)
    if (nights.includes(WEEKDAYS[d.getDay()])) return ymd(d)
  }
  return ymd(now)
}

export function defaultDraft(opts: { now: Date; matchNights?: readonly Weekday[]; last?: Pick<MatchLogRecord, 'competition' | 'serviceGames'> | null }): MatchDraft {
  return {
    date: lastMatchNight(opts.now, opts.matchNights ?? []),
    competition: opts.last?.competition ?? 'night-comp',
    serviceGames: 4,
    doubleFaults: 0,
    firstServesIn: null,
    firstServesAttempted: null,
    cueUsed: null,
    notes: '',
  }
}

export function fromRecord(r: MatchLogRecord): MatchDraft {
  const counted = typeof r.firstServesAttempted === 'number' && r.firstServesAttempted > 0
  return {
    date: r.date,
    competition: r.competition,
    serviceGames: r.serviceGames ?? 4,
    doubleFaults: r.doubleFaults ?? 0,
    firstServesIn: counted ? (r.firstServesIn ?? 0) : null,
    firstServesAttempted: counted ? r.firstServesAttempted! : null,
    cueUsed: r.cueUsed ?? null,
    notes: r.notes ?? '',
  }
}

export type FieldError = 'date' | 'serviceGames' | 'doubleFaults' | 'firstServes' | 'notes'

/** Plain-sentence problems per field (empty when the draft can be saved). */
export function validate(d: MatchDraft, now: Date): Partial<Record<FieldError, string>> {
  const e: Partial<Record<FieldError, string>> = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || Number.isNaN(new Date(`${d.date}T12:00:00`).getTime())) e.date = 'Choose the date of the match.'
  else if (d.date > ymd(now)) e.date = "That date hasn't happened yet."
  if (!Number.isInteger(d.serviceGames) || d.serviceGames < LIMITS.serviceGames.min || d.serviceGames > LIMITS.serviceGames.max) {
    e.serviceGames = `Service games can be ${LIMITS.serviceGames.min} to ${LIMITS.serviceGames.max}.`
  }
  if (!Number.isInteger(d.doubleFaults) || d.doubleFaults < 0 || d.doubleFaults > LIMITS.doubleFaults.max) e.doubleFaults = `Double faults can be 0 to ${LIMITS.doubleFaults.max}.`
  const counting = d.firstServesAttempted !== null
  if (counting) {
    const tried = d.firstServesAttempted ?? 0
    const inn = d.firstServesIn ?? 0
    if (!Number.isInteger(tried) || tried < 1 || tried > LIMITS.firstServes.max) e.firstServes = `First serves hit can be 1 to ${LIMITS.firstServes.max}.`
    else if (!Number.isInteger(inn) || inn < 0 || inn > tried) e.firstServes = "First serves in can't be more than first serves hit."
    // Every double fault starts with a missed first serve.
    else if (d.doubleFaults > tried - inn && !e.doubleFaults) e.doubleFaults = `Each double fault starts with a missed first serve, so this can be at most ${tried - inn}.`
  }
  if (d.notes.length > NOTE_MAX) e.notes = `Keep the note to ${NOTE_MAX} characters.`
  return e
}

/** The record fields for a draft (the repository adds id and times). */
export function toRecord(d: MatchDraft, extra: { experimentId?: string } = {}): Omit<MatchLogRecord, 'id' | 'createdAt' | 'updatedAt'> {
  const counted = d.firstServesAttempted !== null && d.firstServesAttempted > 0
  const notes = d.notes.trim()
  return {
    date: d.date,
    competition: d.competition,
    serviceGames: d.serviceGames,
    doubleFaults: d.doubleFaults,
    ...(counted ? { firstServesIn: d.firstServesIn ?? 0, firstServesAttempted: d.firstServesAttempted! } : {}),
    ...(d.cueUsed ? { cueUsed: d.cueUsed } : {}),
    ...(extra.experimentId ? { experimentId: extra.experimentId } : {}),
    ...(notes ? { notes: notes.slice(0, NOTE_MAX) } : {}),
  }
}
