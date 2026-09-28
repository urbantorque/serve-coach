import { describe, expect, it } from 'vitest'
import { lintCopy } from '../../copy/lint.ts'
import {
  addMonths,
  ALWAYS_FREE,
  allowanceLine,
  dayMonth,
  isPlus,
  monthKey,
  planLabel,
  PLANS,
  PLUS_ADDS,
  prototypeEntitlement,
  renewalTerms,
  trialTerms,
} from './planModel.ts'

const NOW = new Date(2026, 8, 27, 10) // Sun 27 Sep 2026, local

describe('plans (PRODUCT §5.2, §6.15, §10)', () => {
  it('has the AUD prices: A$99.99 a year with a 7-day trial, A$14.99 a month, season pass A$39.99 (test)', () => {
    expect(PLANS.map((p) => [p.id, p.price])).toEqual([
      ['annual', 'A$99.99'],
      ['monthly', 'A$14.99'],
      ['season', 'A$39.99'],
    ])
    expect(PLANS.find((p) => p.id === 'season')?.test).toBe(true)
    expect(PLANS.every((p) => p.action.split(' ').length <= 3)).toBe(true)
  })

  it('states trial terms in plain words with the real cancel-by date', () => {
    expect(trialTerms(NOW)).toBe(
      "Free for 7 days, then A$99.99 a year. Cancel any time before 4 Oct and you won't be charged. We'll remind you 2 days before.",
    )
    expect(renewalTerms('season', NOW)).toMatch(/doesn't renew/)
    expect(renewalTerms('monthly', NOW)).toMatch(/Renews each month/)
  })

  it('adds months without overflowing short months', () => {
    expect(dayMonth(addMonths(NOW, 4))).toBe('27 Jan')
    expect(dayMonth(addMonths(new Date(2027, 0, 31), 1))).toBe('28 Feb')
  })

  it('the prototype flag records the plan, the trial or season end, and no payment details', () => {
    const annual = prototypeEntitlement('annual', NOW)
    expect(annual).toMatchObject({ tier: 'plus', plan: 'annual', source: 'prototype' })
    expect(new Date(annual.trialEndsAt!).getDate()).toBe(4)
    const season = prototypeEntitlement('season', NOW)
    expect(isPlus(season, NOW)).toBe(true)
    expect(isPlus(season, addMonths(NOW, 5))).toBe(false)
    expect(isPlus({ tier: 'free', source: 'prototype' }, NOW)).toBe(false)
    expect(planLabel(annual, NOW)).toBe('Plus, yearly (test)')
    expect(planLabel(undefined, NOW)).toBe('Beta, everything unlocked')
    expect(planLabel({ tier: 'free', source: 'prototype', afterBetaTest: true }, NOW)).toBe('Free')
  })

  it('shows the allowance with its n', () => {
    expect(allowanceLine(1)).toBe('1 of 2 analysed days this month')
    expect(monthKey(NOW)).toBe('2026-09')
  })

  it('copy passes the lint', () => {
    for (const t of [...PLUS_ADDS, ...ALWAYS_FREE, trialTerms(NOW), ...PLANS.flatMap((p) => [p.title, p.action, p.detail(NOW)])]) {
      expect(lintCopy(t), t).toEqual([])
    }
  })
})
