import { describe, expect, it } from 'vitest'
import { DEMO_FIXTURES } from '../../../data/fixtures.ts'
import type { ExperimentRecord, PracticeLogRecord, ProfileRecord } from '../../../data/records.ts'
import type { SessionBundle } from '../progress/insights/history.ts'
import { experimentStep, sessionLine, todayModel } from './todayModel.ts'

const FX = DEMO_FIXTURES
const own = (b: SessionBundle, id = b.session.id.replace('demo-', 'own-')): SessionBundle => ({
  session: { ...b.session, id, isDemo: 0 },
  stats: b.stats,
})
const sample = FX.sessions.map((s) => ({ session: s.session, stats: s.stats }))
const NOW = new Date('2026-09-27T09:00:00+10:00')
const profile: ProfileRecord = { ...FX.profile, matchNights: ['sun'] }
const exp = (over: Partial<ExperimentRecord> = {}): ExperimentRecord => ({ ...FX.experiment, isDemo: 0, ...over })
const log = (over: Partial<PracticeLogRecord> = {}): PracticeLogRecord => ({ ...FX.practiceLogs[0], isDemo: 0, ...over })

describe('Today model (PRODUCT §6.2, DESIGN §10.2)', () => {
  it('empty: no sessions at all', () => {
    const m = todayModel({ bundles: [], experiments: [], practiceLogs: [], profile: null, now: NOW })
    expect(m.mode).toBe('empty')
    expect(m.last).toBeNull()
  })

  it('sample: only demo sessions; the sample experiment is shown, never mixed with the player', () => {
    const m = todayModel({ bundles: sample, experiments: [FX.experiment], practiceLogs: FX.practiceLogs, profile: null, now: NOW })
    expect(m.mode).toBe('sample')
    expect(m.last?.session.id).toBe('demo-s3')
    expect(m.experiment?.id).toBe(FX.experiment.id)
    expect(m.baseline).toBeNull()
  })

  it('player: own sessions win over sample ones, and demo experiments are ignored', () => {
    const m = todayModel({ bundles: [...sample, own(sample[0])], experiments: [FX.experiment], practiceLogs: [], profile, now: NOW })
    expect(m.mode).toBe('player')
    expect(m.sessions.every((b) => b.session.isDemo === 0)).toBe(true)
    expect(m.experiment).toBeNull()
  })

  it('baseline building until 2 matched sessions with 8 or more serves', () => {
    const one = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile, now: NOW })
    expect(one.baseline).toEqual({ have: 1, need: 2 })
    const two = todayModel({ bundles: [own(sample[0]), own(sample[2])], experiments: [], practiceLogs: [], profile, now: NOW })
    expect(two.baseline).toBeNull()
  })

  it('experiment step: practise, then re-test due, then the result', () => {
    const e = exp({ result: undefined, retestSessionIds: [] })
    expect(experimentStep(e, [], NOW).kind).toBe('practise')
    const due = experimentStep(e, [log({ experimentId: e.id, minutes: 8 }), log({ id: 'x', experimentId: e.id, minutes: 10 })], NOW)
    expect(due).toMatchObject({ kind: 'retest-due', practices: 2, minutes: 18 })
    expect(experimentStep(exp(), [], NOW)).toMatchObject({ kind: 'result', verdict: 'likely-better' })
    expect(experimentStep(e, [], NOW).day).toBeGreaterThanOrEqual(1)
  })

  it('pain pause and match day', () => {
    const pain = todayModel({
      bundles: [own(sample[0])],
      experiments: [],
      practiceLogs: [],
      profile: { ...profile, comfort: { painFlag: 1 } },
      now: new Date('2026-09-27T15:00:00+10:00'),
    })
    expect(pain.painPause).toBe(true)
    expect(pain.matchDay).toBe(false)
    const match = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile, now: new Date('2026-09-27T15:00:00+10:00') })
    expect(match.matchDay).toBe(true)
    const morning = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile, now: new Date('2026-09-27T09:00:00+10:00') })
    expect(morning.matchDay).toBe(false)
  })

  it('welcome back after 14 days, without any streak language', () => {
    const m = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile, now: new Date('2026-10-20T09:00:00+10:00') })
    expect(m.welcomeBack).toBe(true)
    expect(sessionLine(sample[1].session)).toBe('View from behind, 12 serves')
  })
})
