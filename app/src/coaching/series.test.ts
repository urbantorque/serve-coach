// Spreads keep their status under an unknown pitch (METRICS §1.1 item 3); absolute values do not.
import { describe, expect, it } from 'vitest'
import type { MetricValue } from '../analysis/types.ts'
import { seriesFor } from './series.ts'
import type { CoachingServe, CoachingSession } from './types.ts'

const apex = (v: number): MetricValue => ({
  id: 'toss-apex-height',
  value: v,
  unit: 'ratio-of-height',
  status: 'experimental',
  statusIfLevel: 'estimated',
  reasonCode: 'PITCH_UNKNOWN',
  confidence: 0.9,
  basis: 'test',
})
const serves: CoachingServe[] = [1.8, 1.9, 1.85].map((v, i) => ({ id: `s${i}`, included: true, metrics: { 'toss-apex-height': apex(v) } }))
const session = {} as CoachingSession

describe('seriesFor with an unknown pitch', () => {
  it('hides absolute heights while experimental values are off', () => {
    const s = seriesFor(session, serves, 'toss-apex-height', { heightM: 1.8, showExperimental: false })
    expect(s.usable).toHaveLength(0)
    expect(s.hiddenExperimental).toBe(3)
  })
  it('uses them for a spread, at their level status', () => {
    const s = seriesFor(session, serves, 'toss-apex-height', { heightM: 1.8, showExperimental: false, forSpread: true })
    expect(s.usable).toHaveLength(3)
    expect(s.anyExperimental).toBe(false)
    expect(s.usable.every((x) => x.status === 'estimated')).toBe(true)
  })
})
