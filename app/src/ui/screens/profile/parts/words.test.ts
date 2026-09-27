import { describe, expect, it } from 'vitest'
import type { ProfileRecord } from '../../../../data/records.ts'
import { lintCopy } from '../../../copy/lint.ts'
import { inOptionOrder, toggleChoice } from './choiceLogic.ts'
import * as words from './words.ts'
import {
  checkHeightCm,
  descriptionFromLevel,
  levelFromDescription,
  levelFromUtr,
  parseUtr,
  PLAY_STYLE_OPTIONS,
  profileSummary,
  REGION_OPTIONS,
} from './words.ts'

const profile = (patch: Partial<ProfileRecord> = {}): ProfileRecord => ({
  id: 'me',
  heightM: 1.78,
  handedness: 'right',
  level: 'utr-4-5',
  utr: 4.5,
  goal: 'second-serve-reliability',
  ageBand: '18-plus',
  playStyle: ['night-comp'],
  matchNights: ['tue'],
  inSegment: 1,
  comfortRegions: [],
  comfort: { painFlag: 0 },
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...patch,
})

describe('height (DESIGN §8.22)', () => {
  it('accepts whole cm from 140 to 210 and soft-flags below 145 or above 205', () => {
    expect(checkHeightCm('178')).toEqual({ ok: true, cm: 178, softFlag: false })
    expect(checkHeightCm('143')).toEqual({ ok: true, cm: 143, softFlag: true })
    expect(checkHeightCm('206')).toMatchObject({ ok: true, softFlag: true })
    expect(checkHeightCm('139').ok).toBe(false)
    expect(checkHeightCm('211').ok).toBe(false)
    expect(checkHeightCm('1.78').ok).toBe(false)
    expect(checkHeightCm('').ok).toBe(false)
  })
})

describe('UTR (PRODUCT O6)', () => {
  it('parses 1.00 to 16.50 with a comma or point', () => {
    expect(parseUtr('')).toEqual({ value: null })
    expect(parseUtr('4.5')).toEqual({ value: 4.5 })
    expect(parseUtr('4,25')).toEqual({ value: 4.25 })
    expect(parseUtr('16.5')).toEqual({ value: 16.5 })
    expect(parseUtr('0.5').error).toBeTruthy()
    expect(parseUtr('17').error).toBeTruthy()
    expect(parseUtr('abc').error).toBeTruthy()
  })

  it('maps UTR below 4 to UTR 1 to 3 (COACHING §9.1)', () => {
    expect(levelFromUtr(3.99)).toBe('utr-1-3')
    expect(levelFromUtr(4)).toBe('utr-4-5')
    expect(levelFromUtr(6)).toBe('utr-6-7')
  })

  it('round-trips the three descriptions through the stored band', () => {
    for (const d of ['getting-going', 'most-in', 'competition'] as const) expect(descriptionFromLevel(levelFromDescription(d))).toBe(d)
  })
})

describe('exclusive multi-select (O3 "No comp", O7 "None")', () => {
  it('an exclusive option clears the others, and the reverse', () => {
    expect(toggleChoice(['pennant', 'night-comp'], 'no-comp', ['no-comp'])).toEqual(['no-comp'])
    expect(toggleChoice(['no-comp'], 'pennant', ['no-comp'])).toEqual(['pennant'])
    expect(toggleChoice(['pennant'], 'pennant', ['no-comp'])).toEqual([])
  })

  it('keeps option order regardless of tap order', () => {
    expect(inOptionOrder(['other-league', 'pennant'], PLAY_STYLE_OPTIONS)).toEqual(['pennant', 'other-league'])
    expect(inOptionOrder(['other', 'shoulder'], REGION_OPTIONS)).toEqual(['shoulder', 'other'])
  })
})

describe('profile summary line (DESIGN §10.12)', () => {
  it('reads like the wireframe', () => {
    expect(profileSummary(profile())).toBe('1.78 m, right-handed, UTR 4.5 (you logged). Night comp on Tuesdays. Goal: fewer double faults.')
  })

  it('names what is missing instead of guessing', () => {
    expect(profileSummary(null)).toMatch(/Add your height/)
    expect(profileSummary(profile({ heightM: undefined, utr: undefined, playStyle: ['no-comp'], matchNights: [] }))).toBe(
      'Height not added, right-handed. Social hits or booked courts. Goal: fewer double faults.',
    )
  })
})

describe('copy', () => {
  it('every exported string passes the copy lint (DESIGN §11)', () => {
    const texts: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') texts.push(v)
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(Object.values(words).filter((v) => typeof v !== 'function'))
    expect(texts.length).toBeGreaterThan(20)
    for (const t of texts) expect(lintCopy(t), t).toEqual([])
  })
})
