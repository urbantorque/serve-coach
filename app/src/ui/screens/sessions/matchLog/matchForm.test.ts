import { describe, expect, it } from 'vitest'
import type { MatchLogRecord } from '../../../../data/records.ts'
import { lintCopy } from '../../../copy/lint.ts'
import { defaultDraft, fromRecord, lastMatchNight, toRecord, validate, type MatchDraft } from './matchForm.ts'

const NOW = new Date(2026, 8, 28, 9, 0) // Monday 28 September 2026

const draft = (over: Partial<MatchDraft> = {}): MatchDraft => ({ ...defaultDraft({ now: NOW }), date: '2026-09-22', ...over })

describe('match log form', () => {
  it('offers the last match night on or before today, else today', () => {
    expect(lastMatchNight(NOW, ['tue'])).toBe('2026-09-22')
    expect(lastMatchNight(NOW, ['mon', 'thu'])).toBe('2026-09-28')
    expect(lastMatchNight(NOW, [])).toBe('2026-09-28')
  })

  it('defaults: 4 service games, no double faults, first serves not counted, last competition kept', () => {
    const d = defaultDraft({ now: NOW, matchNights: ['tue'], last: { competition: 'pennant', serviceGames: 6 } })
    expect(d).toMatchObject({ date: '2026-09-22', competition: 'pennant', serviceGames: 4, doubleFaults: 0, firstServesIn: null, firstServesAttempted: null, cueUsed: null, notes: '' })
    expect(validate(d, NOW)).toEqual({})
  })

  it('first serves in can never exceed first serves hit, and each double fault needs a missed first serve', () => {
    expect(validate(draft({ firstServesIn: 21, firstServesAttempted: 20 }), NOW).firstServes).toMatch(/can't be more than/)
    expect(validate(draft({ firstServesIn: 18, firstServesAttempted: 20, doubleFaults: 3 }), NOW).doubleFaults).toMatch(/at most 2/)
    expect(validate(draft({ firstServesIn: 18, firstServesAttempted: 20, doubleFaults: 2 }), NOW)).toEqual({})
    expect(validate(draft({ firstServesIn: 0, firstServesAttempted: 0 }), NOW).firstServes).toMatch(/1 to 250/)
  })

  it('refuses a future date, zero service games and an over-long note; messages pass the copy lint', () => {
    const e = validate(draft({ date: '2026-10-01', serviceGames: 0, notes: 'x'.repeat(141) }), NOW)
    expect(Object.keys(e).sort()).toEqual(['date', 'notes', 'serviceGames'])
    for (const m of Object.values(e)) expect(lintCopy(m!)).toEqual([])
  })

  it('stores counts only when counted, trims the note, and round-trips', () => {
    const plain = toRecord(draft({ doubleFaults: 2, notes: '  windy  ' }))
    expect(plain).toEqual({ date: '2026-09-22', competition: 'night-comp', serviceGames: 4, doubleFaults: 2, notes: 'windy' })
    const counted = toRecord(draft({ firstServesIn: 17, firstServesAttempted: 29, cueUsed: 'yes' }), { experimentId: 'exp-1' })
    expect(counted).toMatchObject({ firstServesIn: 17, firstServesAttempted: 29, cueUsed: 'yes', experimentId: 'exp-1' })
    const rec: MatchLogRecord = { ...counted, id: 'm1', createdAt: 'x', updatedAt: 'x' }
    expect(fromRecord(rec)).toMatchObject({ firstServesIn: 17, firstServesAttempted: 29, cueUsed: 'yes' })
    // Older entries logged a rough share only: counting starts off.
    expect(fromRecord({ ...rec, firstServesIn: undefined, firstServesAttempted: undefined, firstServeRough: 'most' }).firstServesAttempted).toBeNull()
  })
})
