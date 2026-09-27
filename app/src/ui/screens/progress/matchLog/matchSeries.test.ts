import { describe, expect, it } from 'vitest'
import type { MatchLogRecord } from '../../../../data/records.ts'
import { dfWords, firstWords, matchPoints, recentDoubleFaults, recentFirstServes, seasonRows, seasonWeek } from './matchSeries.ts'

const log = (id: string, date: string, over: Partial<MatchLogRecord> = {}): MatchLogRecord => ({
  id,
  date,
  competition: 'night-comp',
  serviceGames: 5,
  doubleFaults: 2,
  createdAt: `${date}T22:00:00.000Z`,
  updatedAt: `${date}T22:00:00.000Z`,
  ...over,
})

describe('comp nights as their own series', () => {
  const logs = [
    log('c', '2026-09-22', { firstServesIn: 18, firstServesAttempted: 30 }),
    log('a', '2026-09-08', { doubleFaults: 4, serviceGames: 4 }),
    log('demo', '2026-09-01', { isDemo: 1, doubleFaults: 9 }),
    log('b', '2026-09-15', { firstServesIn: 5, firstServesAttempted: 8, firstServeRough: 'about-half' }),
    log('d', '2026-09-26', { firstServeRough: 'most', serviceGames: undefined }),
  ]
  const points = matchPoints(logs)

  it('leaves out sample data and orders by date', () => {
    expect(points.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(points[0].dfPerGame).toBe(1)
    expect(points[3].dfPerGame).toBeNull()
  })

  it('pools first serves over recent comp nights only (never practice), with a Wilson interval from 10 serves', () => {
    const f = recentFirstServes(points)!
    expect(f).toMatchObject({ k: 23, n: 38, matches: 2 })
    expect(f.value).toMatchObject({ id: 'first-serve-in-rate', status: 'player-entered', provenance: 'match-log', n: 38, secondary: { k: 23 } })
    expect(f.value.uncertainty!.low).toBeLessThan(23 / 38)
    expect(f.value.uncertainty!.high).toBeGreaterThan(23 / 38)
    const small = recentFirstServes(matchPoints([log('x', '2026-09-01', { firstServesIn: 3, firstServesAttempted: 7 })]))!
    expect(small.value.uncertainty).toBeUndefined()
  })

  it('double faults per service game over recent comp nights with games logged', () => {
    const df = recentDoubleFaults(points)!
    expect(df).toMatchObject({ doubleFaults: 8, serviceGames: 14, matches: 3 })
    expect(df.value).toMatchObject({ id: 'double-faults', status: 'player-entered', provenance: 'match-log', value: 8 })
    expect(df.value.n).toBeUndefined()
  })

  it('words: counts below 10 serves, a percentage from 10, rough shares marked rough', () => {
    expect(firstWords(points[1])).toBe('5 of 8 first serves in')
    expect(firstWords(points[2])).toBe('18 of 30 first serves in (60%)')
    expect(firstWords(points[3])).toBe('First serves in: most (rough)')
    expect(dfWords(points[0])).toBe('4 double faults in 4 service games')
    expect(dfWords({ doubleFaults: 1, serviceGames: 1 })).toBe('1 double fault in 1 service game')
  })
})

describe('season weeks (Plus season view)', () => {
  it('counts weeks from the season start, and leaves out dates outside the season', () => {
    const season = { startDate: '2026-09-01', weeks: 14 }
    expect(seasonWeek('2026-09-01', { season, firstDate: '2026-08-01' })).toBe(1)
    expect(seasonWeek('2026-09-08', { season, firstDate: '2026-08-01' })).toBe(2)
    expect(seasonWeek('2026-08-31', { season, firstDate: '2026-08-01' })).toBeNull()
    expect(seasonWeek('2026-12-30', { season, firstDate: '2026-08-01' })).toBeNull()
  })

  it('builds two separate rows on one week axis, never one combined series', () => {
    const rows = seasonRows({
      practice: [{ date: '2026-09-02', value: 21, label: '21 cm' }, { date: '2026-09-16', value: 14, label: '14 cm' }],
      matches: matchPoints([log('a', '2026-09-08'), log('b', '2026-09-22', { doubleFaults: 1 })]),
    })!
    expect(rows.seasonal).toBe(false)
    expect(rows.firstDate).toBe('2026-09-02')
    expect(rows.practice.map((p) => p.week)).toEqual([1, 3])
    expect(rows.matches.map((m) => [m.week, m.value])).toEqual([[1, 0.4], [3, 0.2]])
    expect(rows.weeks).toBe(3)
    expect(seasonRows({ practice: [], matches: [] })).toBeNull()
  })
})
