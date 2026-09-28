import { describe, expect, it } from 'vitest'
import type { MetricValue } from '../../analysis/types.ts'
import { formatMetric, outwardTo5 } from './metricFormat.ts'

const mv = (p: Partial<MetricValue> & Pick<MetricValue, 'id' | 'status'>): MetricValue => ({
  value: null,
  unit: '',
  confidence: 1,
  basis: 'test',
  ...p,
})

describe('formatMetric (DESIGN §4.3)', () => {
  it('estimates get "≈" and a "likely ... to ..." range line', () => {
    const f = formatMetric('contact-height-ratio', mv({ id: 'contact-height-ratio', status: 'estimated', value: 1.4567, uncertainty: { kind: 'ci95', low: 1.44, high: 1.47 } }))
    expect(f.approx).toBe(true)
    expect(f.value).toBe('1.46')
    expect(f.unit).toBe('× your height')
    expect(f.detail).toBe('likely 1.44 to 1.47 × your height')
    expect(f.aria).toContain('about 1.46 times your height')
    expect(f.aria).toContain('Estimate')
  })

  it('durations under a second read as seconds with two decimals; timing spreads in ms', () => {
    expect(formatMetric('rhythm-release-to-contact', mv({ id: 'rhythm-release-to-contact', status: 'measured', value: 920 })).text).toBe('0.92 s')
    expect(formatMetric('rhythm-spread', mv({ id: 'rhythm-spread', status: 'measured', value: 47 })).text).toBe('45 ms')
  })

  it('experimental values are an outward-rounded "about" range with the quantity named, never one number (D4)', () => {
    const f = formatMetric(
      'speed-experimental',
      mv({ id: 'speed-experimental', status: 'experimental', uncertainty: { kind: 'range', low: 131, high: 143 }, quantity: 'launch-speed' }),
    )
    expect(f.text).toBe('about 130 to 145 km/h')
    expect(f.detail).toBe('speed just after contact')
    expect(outwardTo5(131, 143)).toEqual([130, 145])
    const rear = formatMetric('speed-average-rear', mv({ id: 'speed-average-rear', status: 'experimental', uncertainty: { kind: 'range', low: 112, high: 124 } }))
    expect(rear.detail).toBe('average speed to the bounce')
  })

  it('unavailable values show the reason, never a number or a dash', () => {
    const f = formatMetric('speed-experimental', mv({ id: 'speed-experimental', status: 'unavailable', reasonCode: 'FPS_TOO_LOW' }))
    expect(f.text).toBe('Needs 120 fps')
    expect(f.value).toBe('')
    expect(formatMetric('knee-bend-band', mv({ id: 'knee-bend-band', status: 'unavailable', reasonCode: 'NEEDS_REAR_VIEW' })).text).toBe('Needs a view from behind')
    expect(formatMetric('knee-bend-band', mv({ id: 'knee-bend-band', status: 'unavailable', reasonCode: 'VIEW_NOT_SUPPORTED' })).text).toBe('Needs a view from behind')
    expect(formatMetric('leg-drive', mv({ id: 'leg-drive', status: 'unavailable', reasonCode: 'VIEW_NOT_SUPPORTED' })).text).toBe('Needs the side view')
  })

  it('rates show k of n, with a percentage and range only from 10 serves (METRICS §4.1)', () => {
    const small = formatMetric('first-serve-in-rate', mv({ id: 'first-serve-in-rate', status: 'player-entered', value: 7 / 9, n: 9, secondary: { k: 7 } }))
    expect(small.text).toBe('7 of 9 in')
    expect(small.percent).toBeUndefined()
    const big = formatMetric(
      'first-serve-in-rate',
      mv({ id: 'first-serve-in-rate', status: 'player-entered', value: 0.6, n: 20, secondary: { k: 12 }, uncertainty: { kind: 'ci95', low: 0.387, high: 0.781 } }),
    )
    expect(big.percent).toBe('(60%)')
    expect(big.detail).toBe('likely 39% to 78%')
  })

  it('negative positions are directions, not signs (DESIGN §3.3 rule 11)', () => {
    const f = formatMetric('contact-forward', mv({ id: 'contact-forward', status: 'measured', value: -5 }))
    expect(f.text).toBe('5 cm behind')
    expect(f.text).not.toContain('-')
  })

  it('bands are player-relative words with a share, never degrees', () => {
    const f = formatMetric('shoulder-tilt-trophy', mv({ id: 'shoulder-tilt-trophy', status: 'estimated', value: 'high', band: 'high', n: 12, secondary: { k: 9 } }))
    expect(f.text).toBe('Higher than your usual')
    expect(f.nLine).toBe('9 of 12 serves')
    expect(f.text).not.toContain('°')
  })

  it('loading depth can never be negative: its range is floored at zero and reads "up to"', () => {
    const f = formatMetric('loading-depth', mv({ id: 'loading-depth', status: 'estimated', value: 1, uncertainty: { kind: 'ci95', low: -1.55, high: 4.4 }, n: 16, nEligible: 16 }))
    expect(f.detail).toBe('likely up to 4% of your height')
    expect(f.aria).not.toMatch(/-d/)
    const exp = formatMetric('loading-depth', mv({ id: 'loading-depth', status: 'experimental', value: 1, uncertainty: { kind: 'range', low: -5, high: 7 } }))
    expect(exp.text).toBe('up to about 7% of your height')
    expect(exp.aria).not.toMatch(/-d/)
    // Leg drive (hip rise from its lowest point) is floored too; a range clear of zero is unchanged.
    expect(formatMetric('leg-drive', mv({ id: 'leg-drive', status: 'estimated', value: 9, uncertainty: { kind: 'ci95', low: 6, high: 12 } })).detail).toBe('likely 6% to 12% of your height')
    const wide = formatMetric('leg-drive', mv({ id: 'leg-drive', status: 'estimated', value: 3, uncertainty: { kind: 'ci95', low: -2, high: 8 } }))
    expect(wide.detail).toBe('likely up to 8% of your height')
    expect(wide.aria).not.toMatch(/-d/)
  })

  it('leg drive as an Estimate always carries its low-read caveat, in the text and the spoken sentence (finding 50)', () => {
    const f = formatMetric('leg-drive', mv({ id: 'leg-drive', status: 'estimated', value: 10, uncertainty: { kind: 'ci95', low: 7, high: 13 }, n: 16, nEligible: 16 }))
    expect(f.note).toMatch(/reads about 2% of your height low/i)
    expect(f.note).toMatch(/your own serves/)
    expect(f.aria).toContain(f.note!)
    // Experimental values are already a rough range; loading depth never gets the note.
    expect(formatMetric('leg-drive', mv({ id: 'leg-drive', status: 'experimental', value: 10, uncertainty: { kind: 'range', low: 5, high: 15 } })).note).toBeUndefined()
    expect(formatMetric('loading-depth', mv({ id: 'loading-depth', status: 'estimated', value: 2, uncertainty: { kind: 'ci95', low: 1, high: 4 } })).note).toBeUndefined()
  })

  it('spreads near the measurement limit read "≤ 4 cm"', () => {
    expect(formatMetric('contact-height-spread', mv({ id: 'contact-height-spread', status: 'estimated', value: 3, nearMeasurementLimit: true })).value).toBe('≤ 4')
  })

  it('never writes en or em dashes', () => {
    const samples = [
      formatMetric('toss-height-spread', mv({ id: 'toss-height-spread', status: 'estimated', value: 11, uncertainty: { kind: 'ci95', low: 8, high: 14 } })),
      formatMetric('trophy-pause', mv({ id: 'trophy-pause', status: 'experimental', value: 260, uncertainty: { kind: 'range', low: 200, high: 320 } })),
    ]
    for (const f of samples) expect(`${f.text} ${f.detail ?? ''} ${f.aria}`).not.toMatch(/[–—]/)
  })
})
