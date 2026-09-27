import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildBetaReport, computeGates, isoWeek, resetBetaInstallRef } from './betaReport.ts'
import { getDb, resetDbForTests } from './db.ts'
import type { EventRecord } from './records.ts'
import { recordEvent } from './repos/events.ts'

const H = 60 * 60 * 1000
const D = 24 * H
const T0 = Date.parse('2026-10-05T08:00:00.000Z')

let seq = 0
function ev(name: string, atMs: number, props: EventRecord['props'] = {}): EventRecord {
  return { seq: ++seq, name, at: new Date(atMs).toISOString(), props }
}

const valid = (at: number) => ev('analysis_completed', at, { valid: true, serves: '15-24', capture: 'good' })

beforeEach(async () => {
  seq = 0
  await resetDbForTests()
})

describe('activation', () => {
  it('is met by a valid session and then the focus, inside 7 days of the first open', () => {
    const g = computeGates([ev('app_first_opened', T0), valid(T0 + 2 * D), ev('focus_opened', T0 + 2 * D + H)], new Date(T0 + 3 * D))
    expect(g.activation.status).toBe('met')
    expect(g.activation.validSessionAt).toBe(new Date(T0 + 2 * D).toISOString())
  })

  it('counts a drill started from Today as opening the decision', () => {
    const g = computeGates([ev('app_first_opened', T0), valid(T0 + D), ev('drill_started', T0 + D)], new Date(T0 + 2 * D))
    expect(g.activation.status).toBe('met')
  })

  it('does not count a focus opened before the valid session, or an invalid session', () => {
    const g = computeGates(
      [
        ev('app_first_opened', T0),
        ev('focus_opened', T0 + H),
        ev('analysis_completed', T0 + 2 * H, { valid: false, serves: '5-9', capture: 'fair' }),
        valid(T0 + 3 * H),
      ],
      new Date(T0 + 3 * D),
    )
    expect(g.activation.status).toBe('open')
    expect(g.activation.focusOpenedAt).toBeNull()
  })

  it('is missed when the window closes, and open while it runs', () => {
    const events = [ev('app_first_opened', T0), valid(T0 + 8 * D), ev('focus_opened', T0 + 8 * D)]
    expect(computeGates(events, new Date(T0 + 6 * D)).activation.status).toBe('open')
    expect(computeGates(events, new Date(T0 + 9 * D)).activation.status).toBe('missed')
    expect(computeGates([], new Date(T0)).activation.status).toBe('not-started')
  })
})

describe('loop completion, weeks and usefulness', () => {
  it('counts verdicts within 14 days that are not "not comparable"', () => {
    const g = computeGates(
      [
        ev('app_first_opened', T0),
        ev('verdict_viewed', T0 + 9 * D, { verdict: 'likely-better', retestWithin14d: true }),
        ev('verdict_viewed', T0 + 20 * D, { verdict: 'about-the-same', retestWithin14d: false }),
        ev('verdict_viewed', T0 + 21 * D, { verdict: 'not-comparable', retestWithin14d: true }),
      ],
      new Date(T0 + 30 * D),
    )
    expect(g.loopCompletion.loops).toBe(1)
    expect(g.loopCompletion.firstAt).toBe(new Date(T0 + 9 * D).toISOString())
  })

  it('marks active weeks from sessions or practice, and weeks after activation', () => {
    const events = [
      ev('app_first_opened', T0),
      valid(T0),
      ev('focus_opened', T0 + H),
      ev('practice_logged', T0 + 8 * D, { minutes: '10-14' }),
      ev('analysis_completed', T0 + 22 * D, { valid: true }),
    ]
    const g = computeGates(events, new Date(T0 + 26 * D))
    expect(g.weekly.activeWeeks).toBe(3)
    expect(g.weekly.afterActivation).toEqual([
      { week: 1, active: true },
      { week: 2, active: true },
      { week: 3, active: false },
      { week: 4, active: true },
    ])
  })

  it('reports ratings of 4 or 5 and skips', () => {
    const g = computeGates(
      [ev('usefulness_rated', T0, { rating: 5 }), ev('usefulness_rated', T0, { rating: 4 }), ev('usefulness_rated', T0, { rating: 2 }), ev('usefulness_skipped', T0)],
      new Date(T0),
    )
    expect(g.usefulness).toMatchObject({ rated: 3, fourOrFive: 2, skipped: 1 })
    expect(g.counts).not.toHaveProperty('pain_referral_shown')
  })

  it('labels ISO weeks from the local calendar', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01')
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53')
    expect(isoWeek(new Date(2026, 8, 28))).toBe('2026-W40')
  })
})

describe('buildBetaReport', () => {
  it('exports the gates and the events without once-keys, with a resettable reference', async () => {
    await recordEvent('app_first_opened', { display: 'standalone', platform: 'pwa' })
    await recordEvent('verdict_viewed', { verdict: 'likely-better', retestWithin14d: true, sameSession: false }, { once: 'exp-01J9' })
    // A row an older build wrote for a pain referral never reaches the report (PRODUCT §9.4) and is removed.
    await getDb().events.add({ name: 'pain_referral_shown', at: '2026-09-01T00:00:00.000Z', props: {} })
    expect(await recordEvent('pain_referral_shown' as never)).toBe(false)
    const report = await buildBetaReport({ display: 'standalone' })
    expect(report.format).toBe('serve-coach-beta-report')
    expect(report.events).toHaveLength(2)
    expect(report.events.map((e) => e.name)).not.toContain('pain_referral_shown')
    expect(report.gates.counts).not.toHaveProperty('pain_referral_shown')
    expect(JSON.stringify({ events: report.events, gates: report.gates })).not.toMatch(/pain|referral/i)
    expect(await getDb().events.filter((e) => e.name === 'pain_referral_shown').count()).toBe(0)
    expect(report.gates.loopCompletion.loops).toBe(1)
    const text = JSON.stringify(report)
    expect(text).not.toContain('onceKey')
    expect(text).not.toContain('exp-01J9')
    expect(report.installRef).toMatch(/^[0-9A-Z]{10}$/)
    expect((await buildBetaReport()).installRef).toBe(report.installRef)
    const next = await resetBetaInstallRef()
    expect(next).not.toBe(report.installRef)
    expect((await buildBetaReport()).installRef).toBe(next)
  })
})
