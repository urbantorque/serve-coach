import { describe, expect, it } from 'vitest'
import { DEMO_FIXTURES } from '../../../data/fixtures.ts'
import type { ExperimentRecord, PracticeLogRecord, ProfileRecord } from '../../../data/records.ts'
import type { SessionBundle } from '../progress/insights/history.ts'
import { currentExperiment, experimentStep, morningAfter, sessionLine, todayModel } from './todayModel.ts'

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
    expect(one.baseline).toMatchObject({ have: 1, need: 2, minServes: 8, latestCounts: true })
    const two = todayModel({ bundles: [own(sample[0]), own(sample[2])], experiments: [], practiceLogs: [], profile, now: NOW })
    expect(two.baseline).toBeNull()
  })

  it('a 1-serve session does not count towards the baseline, and the card says why', () => {
    const one = own(sample[0])
    const short = { ...one, stats: { ...one.stats!, strata: one.stats!.strata.map((s) => ({ ...s, n: 1 })) } }
    const m = todayModel({ bundles: [short], experiments: [], practiceLogs: [], profile, now: NOW })
    expect(m.baseline).toMatchObject({ have: 0, need: 2, latestServes: 1, latestCounts: false })
  })

  it('a finished experiment is shown once with its verdict, then the next session takes over', () => {
    const done = exp({ status: 'completed', retestSessionIds: ['own-s3'] })
    expect(currentExperiment([done], 'own-s3', false)?.id).toBe(done.id)
    expect(currentExperiment([done], 'own-s4', false)).toBeNull()
    const active = exp({ id: 'active-one', status: 'active' })
    expect(currentExperiment([done, active], 'own-s3', false)?.id).toBe('active-one')
    expect(currentExperiment([done], 'own-s3', true)).toBeNull()
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

  it('a referral raised this session pauses coaching without the saved flag (no consent), and hides match day', () => {
    const at = new Date('2026-09-27T15:00:00+10:00')
    const noConsent = { ...profile, comfort: { painFlag: 0 as const } }
    const m = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile: noConsent, now: at, referral: 'stop-and-book' })
    expect(m.painPause).toBe(true)
    expect(m.referral).toBe('stop-and-book')
    expect(m.matchDay).toBe(false)
    // A red flag answered this session wins over the saved "Stop and book" flag.
    const red = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile: { ...profile, comfort: { painFlag: 1 } }, now: at, referral: 'today' })
    expect(red.referral).toBe('today')
    // The saved flag alone is "Stop and book"; neither means no pause.
    expect(todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile: { ...profile, comfort: { painFlag: 1 } }, now: at }).referral).toBe('stop-and-book')
    const clear = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile: noConsent, now: at })
    expect(clear.painPause).toBe(false)
    expect(clear.referral).toBeNull()
  })

  it('welcome back after 14 days, without any streak language', () => {
    const m = todayModel({ bundles: [own(sample[0])], experiments: [], practiceLogs: [], profile, now: new Date('2026-10-20T09:00:00+10:00') })
    expect(m.welcomeBack).toBe(true)
    expect(sessionLine(sample[1].session)).toBe('View from behind, 12 serves')
  })
})

describe('morning after a comp night (U3)', () => {
  const profile = { ...FX.profile, matchNights: ['tue'] } as ProfileRecord
  // Wednesday 30 September 2026, 8 am: Tuesday was a comp night.
  const wed = new Date(2026, 8, 30, 8, 0)
  const base = { profile, now: wed, mode: 'player' as const, painPause: false, loggedDates: [] as string[] }

  it('the day after a comp night set in the profile, for the player only', () => {
    expect(morningAfter(base)).toEqual({ date: '2026-09-29' })
    expect(morningAfter({ ...base, now: new Date(2026, 8, 30, 21, 0) })).toEqual({ date: '2026-09-29' })
    expect(morningAfter({ ...base, now: new Date(2026, 9, 1, 8, 0) })).toBeNull() // Thursday
    expect(morningAfter({ ...base, mode: 'sample' })).toBeNull()
    expect(morningAfter({ ...base, profile: { ...profile, matchNights: [] } })).toBeNull()
    expect(morningAfter({ ...base, profile: null })).toBeNull()
  })

  it('never during a pain pause, once logged, or after "Not now" for that night', () => {
    expect(morningAfter({ ...base, painPause: true })).toBeNull()
    expect(morningAfter({ ...base, loggedDates: ['2026-09-29'] })).toBeNull()
    expect(morningAfter({ ...base, dismissed: '2026-09-29' })).toBeNull()
    // A dismissal for last week's night does not hide this week's.
    expect(morningAfter({ ...base, dismissed: '2026-09-22' })).toEqual({ date: '2026-09-29' })
  })
})
