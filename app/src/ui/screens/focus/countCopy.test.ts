import { describe, expect, it } from 'vitest'
import { evidenceCountLine } from './copy.ts'

describe('focus evidence count line (reads like the report)', () => {
  it('uses the report headline and capture line phrase when the stat used every measured serve', () => {
    // Sample check-in before the engine fix: 16 serves found, 14 kept; the toss spread used all 14.
    // The card said "14 of 14 serves" while the report said "14 of 16 serves measured".
    expect(evidenceCountLine({ n: 14, nEligible: 14 }, { measured: 14, detected: 16 })).toBe('14 of 16 serves measured')
    expect(evidenceCountLine({ n: 16, nEligible: 16 }, { measured: 16, detected: 16 })).toBe('16 of 16 serves measured')
  })

  it('says how many serves the value used when that is fewer (one court side, or serves without this value)', () => {
    expect(evidenceCountLine({ n: 8, nEligible: 8 }, { measured: 16, detected: 16 })).toBe('16 of 16 serves measured · this uses 8')
  })

  it('falls back to the stat’s own counts without the session’s, and says nothing without n', () => {
    expect(evidenceCountLine({ n: 14, nEligible: 14 }, null)).toBe('14 of 14 serves')
    expect(evidenceCountLine({ n: 1 }, undefined)).toBe('1 serve')
    expect(evidenceCountLine({}, { measured: 3, detected: 3 })).toBeNull()
    expect(evidenceCountLine({ n: 1, nEligible: 1 }, { measured: 1, detected: 1 })).toBe('1 of 1 serve measured')
  })
})
