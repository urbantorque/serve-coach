import { describe, expect, it } from 'vitest'
import { METRIC_IDS, REAR_ONLY_METRIC_IDS, REASON_CODES, SIDE_ONLY_METRIC_IDS, type MetricValue } from '../analysis/types.ts'
import { DEMO_FIXTURES, wilson } from './fixtures.ts'

const allValues = (): { where: string; v: MetricValue }[] => {
  const out: { where: string; v: MetricValue }[] = []
  for (const s of DEMO_FIXTURES.sessions) {
    for (const v of Object.values(s.stats.metrics)) if (v) out.push({ where: `${s.session.id} session`, v })
    for (const sv of s.serves) for (const v of Object.values(sv.metrics)) if (v) out.push({ where: sv.id, v })
  }
  return out
}

describe('demo fixtures', () => {
  it('are clearly flagged as demo data', () => {
    expect(DEMO_FIXTURES.demo).toBe(true)
    expect(DEMO_FIXTURES.sessions).toHaveLength(3)
    for (const s of DEMO_FIXTURES.sessions) {
      expect(s.demo).toBe(true)
      expect(s.session.isDemo).toBe(1)
      expect(s.video.isDemo).toBe(1)
      expect(s.session.id.startsWith('demo-')).toBe(true)
      expect(s.serves[0].engine.engineVersion).toContain('fixture')
    }
    for (const r of [DEMO_FIXTURES.decision, DEMO_FIXTURES.experiment, ...DEMO_FIXTURES.practiceLogs, ...DEMO_FIXTURES.matchLogs]) {
      expect(r.isDemo).toBe(1)
    }
  })

  it('every value has a status; unavailable values have no number and a reason code', () => {
    for (const { where, v } of allValues()) {
      expect(v.status, where).toBeDefined()
      expect(METRIC_IDS as readonly string[], where).toContain(v.id)
      if (v.status === 'unavailable') {
        expect(v.value, `${where} ${v.id}`).toBeNull()
        expect(REASON_CODES as readonly string[], `${where} ${v.id}`).toContain(v.reasonCode)
      }
      if (v.status === 'experimental' && typeof v.value !== 'string') {
        expect(v.uncertainty, `${where} ${v.id} needs a range (D4)`).toBeDefined()
      }
    }
  })

  it('statuses are varied: all five data states appear', () => {
    const seen = new Set(allValues().map(({ v }) => v.status))
    expect([...seen].sort()).toEqual(['estimated', 'experimental', 'measured', 'player-entered', 'unavailable'])
  })

  it('never show a side-view knee band, rear bands or rear speed, and spin is always unavailable (D1, D4)', () => {
    for (const s of DEMO_FIXTURES.sessions) {
      const m = s.stats.metrics
      expect(m.spin?.status).toBe('unavailable')
      expect(Object.keys(m)).not.toContain('trunk-tilt-band')
      if (s.session.view === 'side') {
        for (const id of REAR_ONLY_METRIC_IDS) {
          expect(m[id]?.status, id).toBe('unavailable')
          expect(m[id]?.reasonCode, id).toBe('NEEDS_REAR_VIEW')
        }
        for (const sv of s.serves) {
          expect(sv.metrics['knee-bend-band']?.status ?? 'unavailable').toBe('unavailable')
        }
      } else {
        for (const id of SIDE_ONLY_METRIC_IDS) {
          expect(m[id]?.status, id).toBe('unavailable')
        }
      }
    }
  })

  it('rates and spreads carry n (D7)', () => {
    for (const s of DEMO_FIXTURES.sessions) {
      for (const id of ['first-serve-in-rate', 'serve-in-rate', 'toss-height-spread', 'rhythm-spread'] as const) {
        const v = s.stats.metrics[id]
        if (v && v.status !== 'unavailable') expect(v.n, `${s.session.id} ${id}`).toBeGreaterThan(0)
      }
    }
  })

  it('per-serve values stay inside the gap-study hard plausibility bounds (gap ranges §8)', () => {
    for (const s of DEMO_FIXTURES.sessions) {
      for (const sv of s.serves.filter((x) => x.included)) {
        const ratio = Number(sv.metrics['contact-height-ratio']?.value)
        expect(ratio).toBeGreaterThan(1.1)
        expect(ratio).toBeLessThan(1.75)
        const rhythm = Number(sv.metrics['rhythm-release-to-contact']?.value)
        expect(rhythm).toBeGreaterThanOrEqual(400)
        expect(rhythm).toBeLessThanOrEqual(1600)
        const apexCm = Number(sv.metrics['toss-apex-height']?.secondary?.cm)
        expect(apexCm).toBeLessThan(550)
        const drop = Number(sv.metrics['toss-drop']?.value)
        expect(drop).toBeGreaterThan(3)
        expect(drop).toBeLessThan(220)
      }
    }
  })

  it('session values sit in the provisional recreational bands (gap ranges §7)', () => {
    for (const s of DEMO_FIXTURES.sessions) {
      const m = s.stats.metrics
      expect(Number(m['toss-height-spread']?.value)).toBeGreaterThan(5)
      expect(Number(m['toss-height-spread']?.value)).toBeLessThan(35)
      expect(Number(m['contact-height-ratio']?.value)).toBeGreaterThan(1.35)
      expect(Number(m['contact-height-ratio']?.value)).toBeLessThan(1.56)
      expect(Number(m['rhythm-release-to-contact']?.value)).toBeGreaterThan(800)
      expect(Number(m['rhythm-release-to-contact']?.value)).toBeLessThan(1200)
    }
    // The re-test's toss height spread is lower than the baseline (the experiment's story).
    const [s1, , s3] = DEMO_FIXTURES.sessions
    expect(Number(s3.stats.metrics['toss-height-spread']?.value)).toBeLessThan(Number(s1.stats.metrics['toss-height-spread']?.value))
  })

  it('first-serve rates use the Wilson interval of the tags', () => {
    const s1 = DEMO_FIXTURES.sessions[0]
    const k = s1.tags.filter((t) => t.outcome === 'in').length
    const [lo, hi] = wilson(k, s1.tags.length)
    const v = s1.stats.metrics['first-serve-in-rate']
    expect(v?.secondary?.k).toBe(k)
    expect(v?.uncertainty?.low).toBeCloseTo(lo, 2)
    expect(v?.uncertainty?.high).toBeCloseTo(hi, 2)
    // Published check: 12 of 20 -> 38.7% to 78.1% (METRICS §3.18).
    const [a, b] = wilson(12, 20)
    expect(a).toBeCloseTo(0.387, 3)
    expect(b).toBeCloseTo(0.781, 3)
  })
})
