// Finding 48: the Welcome strip follows the current engine, never the hand-made fixtures' statuses.
import { describe, expect, it } from 'vitest'
import { SPREAD_OF, statusCeiling } from '../../../analysis/metrics/catalogue.ts'
import type { MetricStatus, MetricValue } from '../../../analysis/types.ts'
import { DEMO_FIXTURES } from '../../../data/index.ts'
import { welcomeStrip } from './welcomeStrip.ts'

const RANK: Record<MetricStatus, number> = { unavailable: 0, experimental: 1, estimated: 2, measured: 3, 'player-entered': 4 }

const peak = (cm: number, status: MetricStatus, statusIfLevel?: MetricStatus): MetricValue => ({
  id: 'toss-apex-height',
  value: cm / 180,
  unit: 'ratio-of-height',
  status,
  confidence: 0.9,
  basis: 'test',
  secondary: { cm },
  conditionClass: 'day',
  ...(statusIfLevel ? { statusIfLevel } : {}),
})
const sessionOf = (vs: MetricValue[]) => ({
  serves: vs.map((v, i) => ({ id: `s${i + 1}`, index: i + 1, included: true, metrics: { 'toss-apex-height': v } })),
  tags: vs.map((_, i) => ({ serveId: `s${i + 1}`, outcome: i % 3 ? 'in' : 'net' })),
})

describe('Welcome sample strip (finding 48)', () => {
  it('the chip is never better than the current catalogue allows for what is plotted', () => {
    const s = welcomeStrip()
    expect(s).not.toBeNull()
    if (!s) return
    const plotted = s.mode === 'absolute' ? 'toss-apex-height' : (SPREAD_OF['toss-apex-height'] ?? 'toss-height-spread')
    expect(RANK[s.status]).toBeLessThanOrEqual(RANK[statusCeiling(plotted, 'day').status])
    expect(s.status === 'measured' || s.status === 'estimated').toBe(true)
    // While absolute toss height is experimental (V0), the first screen never shows metres.
    if (statusCeiling('toss-apex-height', 'day').status === 'experimental') {
      expect(s.mode).toBe('relative')
      expect(s.unit).toBe('cm')
      expect(s.medianLabel).toBe('middle toss')
      expect(s.peaks.every((p) => /cm (higher|lower)|at the middle/.test(p.callout))).toBe(true)
      expect(s.peaks.some((p) => / m · /.test(p.callout))).toBe(false)
    }
  })

  it('a fixture stored as "estimated" is capped: absolute only while the catalogue allows it', () => {
    const fx = sessionOf([330, 336, 341, 328, 345, 333].map((cm) => peak(cm, 'estimated', 'estimated')))
    const s = welcomeStrip(fx)!
    const absCeiling = statusCeiling('toss-apex-height', 'day').status
    expect(s.mode).toBe(absCeiling === 'experimental' ? 'relative' : 'absolute')
    expect(RANK[s.status]).toBeLessThanOrEqual(RANK[s.mode === 'absolute' ? absCeiling : statusCeiling('toss-height-spread', 'day').status])
  })

  it('relative offsets are centred on the middle toss', () => {
    const fx = sessionOf([330, 336, 341, 328, 345].map((cm) => peak(cm, 'experimental', 'estimated')))
    const s = welcomeStrip(fx)!
    expect(s.mode).toBe('relative')
    expect(s.peaks.map((p) => Math.round(p.value))).toEqual([-6, 0, 5, -8, 9])
    expect(s.peaks[0].callout).toBe('≈ 6 cm lower · Serve 1')
    expect(s.domain).toEqual([-20, 20])
  })

  it('nothing is drawn when neither use is better than experimental', () => {
    expect(welcomeStrip(sessionOf([330, 336, 341, 328, 345].map((cm) => peak(cm, 'experimental', 'experimental'))))).toBeNull()
    expect(welcomeStrip(sessionOf([330, 336, 341].map((cm) => peak(cm, 'estimated', 'estimated'))))).toBeNull()
  })

  it('reads the sample fixtures by default', () => {
    expect(welcomeStrip()?.peaks.length).toBeGreaterThanOrEqual(5)
    expect(DEMO_FIXTURES.sessions.length).toBeGreaterThan(0)
  })
})
