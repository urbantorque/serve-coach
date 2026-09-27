// One display precision, one headline, one set-up key, and the assumed-level height budget
// (METRICS §4.9, §4.1 headline rule, §1.6 / §4.4 set-up, §1.1.3a).
import { describe, expect, it } from 'vitest'
import type { MetricValue } from '../types.ts'
import { cameraModel, pitchRatioPerDeg, rollRatioPerDeg } from '../serve/geometry.ts'
import { sessionHeadline, spreadPhrase } from './headline.ts'
import { assumedLevelHeight } from './perServe.ts'
import { displayStep, formatNumber, roundForDisplay } from './precision.ts'
import { distanceClassOf, parseSetupKey, sameSetup, setupKeyOf, setupWords } from './setup.ts'

const spread = (value: number, low: number, high: number, over: Partial<MetricValue> = {}): MetricValue => ({
  id: 'toss-height-spread',
  value,
  unit: 'cm',
  status: 'estimated',
  confidence: 0.8,
  basis: '',
  n: 16,
  provisional: true,
  uncertainty: { kind: 'ci95', low, high },
  ...over,
})

describe('display precision (METRICS §4.9)', () => {
  it('spreads to 0.5 cm, widened to 5 cm when the interval half-width is 10 cm or more', () => {
    expect(formatNumber('toss-height-spread', 9.5, spread(9.5, 7.0, 14.7))).toBe('9.5')
    expect(formatNumber('toss-height-spread', 8.56)).toBe('8.5')
    // 20.3 to 45.2 cm: half-width over 10 cm, so the value and both bounds round to 5.
    const wide = spread(28, 20.3, 45.2)
    expect(displayStep('toss-height-spread', wide)).toBe(5)
    expect(formatNumber('toss-height-spread', 28, wide)).toBe('30')
    expect(formatNumber('toss-height-spread', 27.7, wide)).toBe('30')
    expect(formatNumber('toss-height-spread', 20.3, wide)).toBe('20')
  })

  it('heights 1 cm, ratios 2 decimals, durations 10 ms shown in seconds, timing spreads 5 ms', () => {
    expect(formatNumber('toss-forward', 31.6)).toBe('32')
    expect(formatNumber('contact-height-ratio', 1.4649)).toBe('1.46')
    expect(formatNumber('rhythm-release-to-contact', 924)).toBe('0.92')
    expect(formatNumber('rhythm-spread', 47)).toBe('45')
    expect(roundForDisplay('toss-height-spread', 0.1 + 0.2)).toBe(0.5)
  })
})

describe('session headline (METRICS §4.1)', () => {
  it('prints the spread with the same rule as the tiles', () => {
    const s = spread(28, 20.3, 45.2, { n: 14 })
    expect(spreadPhrase(s)).toBe('toss height varied by about 30 cm (early read)')
    expect(sessionHeadline({ metrics: { 'toss-height-spread': s }, strata: [{ key: { courtSide: 'deuce' }, metrics: {} }], measured: 14, detected: 16 })).toBe(
      '14 of 16 serves measured. Toss height varied by about 30 cm (early read).',
    )
  })

  it('never headlines an experimental spread, one at the measurement limit, or a provisional one under 12 serves', () => {
    expect(spreadPhrase(spread(9.5, 7, 14, { status: 'experimental' }))).toBe('')
    expect(spreadPhrase(spread(9.5, 7, 14, { nearMeasurementLimit: true }))).toBe('')
    expect(spreadPhrase(spread(9.5, 7, 14, { n: 9 }))).toBe('')
  })
})

describe('set-up key (METRICS §1.6, §4.4)', () => {
  it('orientation, distance class and serving spot', () => {
    expect(distanceClassOf(6)).toBe('close')
    expect(distanceClassOf(7.5)).toBe('standard')
    expect(distanceClassOf(9)).toBe('far')
    expect(setupKeyOf({ orientation: 'portrait', distanceM: 7.4, servingSpot: 'doubles' })).toBe('portrait|standard|doubles')
    expect(parseSetupKey('landscape|far|singles')).toEqual({ orientation: 'landscape', distanceClass: 'far', servingSpot: 'singles' })
    expect(setupWords('portrait|standard|singles')).toBe('Upright phone, about 7 to 8 m away, singles spot')
  })

  it('different distance classes or serving spots never match; unknown spots and older sessions do', () => {
    expect(sameSetup('portrait|close|singles', 'portrait|standard|singles')).toBe(false)
    expect(sameSetup('portrait|standard|singles', 'portrait|standard|doubles')).toBe(false)
    expect(sameSetup('portrait|standard|unknown', 'portrait|standard|doubles')).toBe(true)
    expect(sameSetup(undefined, 'portrait|standard|doubles')).toBe(true)
  })
})

describe('assumed level from the mount answer (METRICS §1.1.3a)', () => {
  const meta = { width: 1080, height: 1920 }

  it('pitch sensitivity from geometry matches exact projection within 2% up to 5 degrees', () => {
    // Camera 1.5 m high, 7.5 m away, player 1.8 m, toss peak 3.3 m: exact vs first order.
    const H = 1.8
    const D = 7.5
    const hc = 1.5
    const z = 3.3
    const rowOf = (h: number, d: number) => Math.tan(Math.atan((h - hc) / D) - d)
    for (const deg of [1, 3, 5]) {
      const d = (deg * Math.PI) / 180
      const exact = (rowOf(z, d) - rowOf(0, d)) / (rowOf(H, d) - rowOf(0, d)) - z / H
      // Pitched up by d and treated as level: the peak reads low (pitchRatioPerDeg is negative above the head).
      const linear = pitchRatioPerDeg(z / H, H, D) * deg
      expect(Math.abs(linear - exact) / Math.abs(exact)).toBeLessThan(0.02)
    }
    // About 1.2 cm per degree at 7.5 m and 1.7 cm for a 3.5 m peak at 6 m (the gap study's "about 1.8").
    expect(Math.abs(pitchRatioPerDeg(3.3 / 1.8, 1.8, 7.5)) * 180).toBeCloseTo(1.15, 1)
    expect(Math.abs(pitchRatioPerDeg(3.5 / 1.8, 1.8, 6)) * 180).toBeCloseTo(1.73, 1)
    expect(pitchRatioPerDeg(1, 1.8, 7.5)).toBe(0)
    expect(rollRatioPerDeg(0.5, 1.8)).toBeCloseTo((0.5 / 1.8) * (Math.PI / 180), 9)
  })

  it('a level mount keeps a typical contact height estimated; toss height is over its budget with an assumed level', () => {
    const level = cameraModel(meta, { source: 'import', declaredView: 'side', serveSide: 'deuce', serveNumber: 1, handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', mount: 'level-mount' } as never)
    const rough = cameraModel(meta, { source: 'import', declaredView: 'side', serveSide: 'deuce', serveNumber: 1, handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', mount: 'roughly-level' } as never)
    const unsure = cameraModel(meta, { source: 'import', declaredView: 'side', serveSide: 'deuce', serveNumber: 1, handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', mount: 'tilted-or-unsure' } as never)
    expect(level.tiltStatus).toBe('assumed-level')
    expect(level.pitch).toEqual({ value: 0, sigma: 2 })
    expect(rough.pitch?.sigma).toBe(4)
    expect(unsure.tiltStatus).toBe('unknown')
    const contact = 2.7 / 1.8
    const a = assumedLevelHeight('contact-height-ratio', contact, { cam: level, playerHeightM: 1.8 }, 7.5, 0.5)!
    const b = assumedLevelHeight('contact-height-ratio', contact, { cam: rough, playerHeightM: 1.8 }, 7.5, 0.5)!
    expect(a.downgrades).toEqual([{ cap: 'estimated', reason: 'TILT_UNKNOWN' }])
    expect(a.widenedP95).toBeLessThanOrEqual(0.05)
    expect(b.sigmaTilt).toBeCloseTo(2 * a.sigmaTilt, 6)
    expect(b.widenedP95).toBeGreaterThan(a.widenedP95)
    // Toss height: its method-only p95 (0.056, truth landmarks) is already over the 0.05 threshold, so
    // an assumed level makes it experimental whatever the mount (catalogue VALIDATION_LEVELS note).
    const apex = 3.3 / 1.8
    const t = assumedLevelHeight('toss-apex-height', apex, { cam: level, playerHeightM: 1.8 }, 7.5, 0.5)!
    expect(t.downgrades).toEqual([{ cap: 'experimental', reason: 'PITCH_UNKNOWN' }])
    expect(t.widenedP95).toBeGreaterThan(0.05)
    // Forward positions and angles are not in the budget: they stay experimental (null here).
    expect(assumedLevelHeight('toss-forward', 0, { cam: level, playerHeightM: 1.8 }, 7.5, 0.5)).toBeNull()
  })
})
