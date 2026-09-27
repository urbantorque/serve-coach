// Unknown phone pitch (METRICS §1.1 item 3): absolute heights go experimental, their spread does not.
import { describe, expect, it } from 'vitest'
import { finalizeMetric } from './status.ts'

const draft = (downgrades: { cap: 'estimated' | 'experimental' | 'unavailable'; reason: 'PITCH_UNKNOWN' | 'APEX_EXTRAPOLATED' | 'FPS_TOO_LOW' }[]) => ({
  value: 1.85,
  confidence: 0.9,
  basis: 'test',
  downgrades,
})

describe('finalizeMetric and an unknown pitch', () => {
  it('keeps the status the value would have with a known pitch', () => {
    const m = finalizeMetric('toss-apex-height', draft([{ cap: 'experimental', reason: 'PITCH_UNKNOWN' }]), 'day')
    expect(m.status).toBe('experimental')
    expect(m.reasonCode).toBe('PITCH_UNKNOWN')
    expect(m.statusIfLevel).toBe('estimated')
  })
  it('does not set it when another reason already caps the value as low', () => {
    const m = finalizeMetric('toss-apex-height', draft([{ cap: 'experimental', reason: 'PITCH_UNKNOWN' }, { cap: 'experimental', reason: 'FPS_TOO_LOW' }]), 'day')
    expect(m.status).toBe('experimental')
    expect(m.statusIfLevel).toBeUndefined()
  })
  it('does not set it without a pitch downgrade', () => {
    const m = finalizeMetric('toss-apex-height', draft([{ cap: 'estimated', reason: 'APEX_EXTRAPOLATED' }]), 'day')
    expect(m.statusIfLevel).toBeUndefined()
  })
})
