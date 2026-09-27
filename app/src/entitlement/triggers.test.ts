import { describe, expect, it } from 'vitest'
import { assertGateable, isPlusFeature, PLUS_FEATURES } from './features.ts'
import {
  afterShown,
  allowance,
  allowanceLine,
  firstCompletedExperiment,
  firstLoopSessionIds,
  isPlus,
  localDay,
  t1Due,
  t2Due,
  type ExperimentLike,
  type SessionLike,
} from './triggers.ts'

const S = (id: string, visitId: string, over: Partial<SessionLike> = {}): SessionLike => ({ id, visitId, status: 'ready', isDemo: 0, startedAt: `${visitId}T18:00:00.000Z`, ...over })

const E = (id: string, over: Partial<ExperimentLike> = {}): ExperimentLike => ({
  id,
  createdAt: '2026-09-01T10:00:00.000Z',
  baselineSessionIds: ['b1'],
  retestSessionIds: ['r1'],
  ...over,
})

const NOW = new Date(2026, 8, 28, 19, 0)

describe('Plus flag', () => {
  it('is on only for a Plus flag that has not run out', () => {
    expect(isPlus(undefined)).toBe(false)
    expect(isPlus({ tier: 'free', source: 'prototype' })).toBe(false)
    expect(isPlus({ tier: 'plus', plan: 'monthly', source: 'prototype' })).toBe(true)
    expect(isPlus({ tier: 'plus', plan: 'season', source: 'prototype', endsAt: '2026-01-01T00:00:00.000Z' }, NOW)).toBe(false)
  })
})

describe('features', () => {
  it('names every Plus feature and refuses to gate anything always free', () => {
    for (const f of Object.values(PLUS_FEATURES)) {
      expect(f.name.length).toBeGreaterThan(3)
      expect(f.line).toMatch(/\.$/)
    }
    expect(isPlusFeature('ghost-compare')).toBe(true)
    expect(isPlusFeature('export')).toBe(false)
    for (const free of ['export', 'deletion', 'body-check', 'pain-referral', 'honesty-labels', 'match-log-entry', 'did-it-work-verdict']) {
      expect(() => assertGateable(free)).toThrow(/always free/)
    }
    expect(() => assertGateable('season-view')).not.toThrow()
  })
})

describe('first loop and the monthly allowance', () => {
  it('the first loop is the first experiment: baseline plus its first re-test', () => {
    const loop = firstLoopSessionIds([E('x', { retestSessionIds: ['r1', 'r2'] })], [])
    expect([...loop].sort()).toEqual(['b1', 'r1'])
  })

  it('before any experiment, the earliest analysed session is the first loop; sample data never counts', () => {
    const sessions = [S('demo', '2026-08-01', { isDemo: 1 }), S('a', '2026-09-02'), S('b', '2026-09-05')]
    expect([...firstLoopSessionIds([], sessions)]).toEqual(['a'])
  })

  it('counts practice days, not blocks, and leaves the first loop free', () => {
    const sessions = [
      S('b1', '2026-09-02'),
      S('r1', '2026-09-09'),
      S('p1', '2026-09-12'),
      S('p1b', '2026-09-12'), // a second block the same day counts once
      S('p2', '2026-09-20'),
      S('q', '2026-09-22', { status: 'analysing' }), // not analysed yet
      S('d', '2026-09-23', { isDemo: 1 }),
    ]
    const a = allowance(sessions, [E('x', { result: { verdict: 'likely-better', computedAt: '2026-09-09T20:00:00.000Z' } })], '2026-09')
    expect(a.used).toBe(2)
    expect(a.countedDays).toEqual(['2026-09-12', '2026-09-20'])
    expect(a.freeDays).toEqual(['2026-09-02', '2026-09-09'])
    expect(allowanceLine(a)).toBe('2 of 2 analysed days this month')
  })

  it('the first completed experiment is the earliest verdict, never a sample or a not-comparable one', () => {
    const exps = [
      E('late', { result: { verdict: 'about-the-same', computedAt: '2026-09-20T00:00:00.000Z' } }),
      E('nc', { result: { verdict: 'not-comparable', computedAt: '2026-09-01T00:00:00.000Z' } }),
      E('demo', { isDemo: 1, result: { verdict: 'clearly-better', computedAt: '2026-08-01T00:00:00.000Z' } }),
      E('early', { result: { verdict: 'too-early-to-tell', computedAt: '2026-09-10T00:00:00.000Z' } }),
    ]
    expect(firstCompletedExperiment(exps)?.id).toBe('early')
  })
})

describe('T1: after the first "Did it work?" verdict', () => {
  const exp = E('x', { result: { verdict: 'likely-better', computedAt: '2026-09-27T20:00:00.000Z' } })

  it('is due once for the first completed loop, for free players only', () => {
    expect(t1Due({ plus: false, experiment: exp, experiments: [exp], state: {}, now: NOW })).toBe(true)
    expect(t1Due({ plus: true, experiment: exp, experiments: [exp], state: {}, now: NOW })).toBe(false)
    expect(t1Due({ plus: false, experiment: exp, experiments: [exp], state: {}, now: NOW, painPause: true })).toBe(false)
  })

  it('never for "Not comparable yet", a deleted baseline, sample data or a later loop', () => {
    const nc = E('nc', { result: { verdict: 'not-comparable', computedAt: '2026-09-27T00:00:00.000Z' } })
    expect(t1Due({ plus: false, experiment: nc, experiments: [nc], state: {}, now: NOW })).toBe(false)
    const gone = { ...exp, baselineDeleted: true }
    expect(t1Due({ plus: false, experiment: gone, experiments: [gone], state: {}, now: NOW })).toBe(false)
    const demo = { ...exp, isDemo: 1 as const }
    expect(t1Due({ plus: false, experiment: demo, experiments: [demo], state: {}, now: NOW })).toBe(false)
    const second = E('y', { result: { verdict: 'likely-better', computedAt: '2026-09-28T00:00:00.000Z' } })
    expect(t1Due({ plus: false, experiment: second, experiments: [exp, second], state: {}, now: NOW })).toBe(false)
  })

  it('stays for the rest of the day it was shown, then never again', () => {
    const shown = afterShown({}, 't1', NOW, { experimentId: 'x' })
    expect(shown.t1ExperimentId).toBe('x')
    expect(t1Due({ plus: false, experiment: exp, experiments: [exp], state: shown, now: new Date(2026, 8, 28, 22, 0) })).toBe(true)
    expect(t1Due({ plus: false, experiment: exp, experiments: [exp], state: shown, now: new Date(2026, 8, 29, 9, 0) })).toBe(false)
  })

  it('not on a day another offer was already shown', () => {
    const t2Today = afterShown({}, 't2', NOW, { month: '2026-09' })
    expect(t1Due({ plus: false, experiment: exp, experiments: [exp], state: t2Today, now: NOW })).toBe(false)
  })
})

describe('T2: starting a third analysed day this month', () => {
  const exp = E('x', { result: { verdict: 'likely-better', computedAt: '2026-09-09T20:00:00.000Z' } })
  const base = [S('b1', '2026-09-02'), S('r1', '2026-09-09'), S('p1', '2026-09-12'), S('p2', '2026-09-20')]

  it('is due on the third counted day, once a month, never for Plus', () => {
    const third = S('p3', '2026-09-28', { status: 'analysing' })
    expect(t2Due({ plus: false, session: third, sessions: [...base, third], experiments: [exp], state: {}, now: NOW })).toBe(true)
    expect(t2Due({ plus: true, session: third, sessions: [...base, third], experiments: [exp], state: {}, now: NOW })).toBe(false)
    const shown = afterShown({ lastShownDay: '2026-09-01' }, 't2', new Date(2026, 8, 27), { month: '2026-09' })
    expect(t2Due({ plus: false, session: third, sessions: [...base, third], experiments: [exp], state: shown, now: NOW })).toBe(false)
  })

  it('not for the second counted day, another block on an already counted day, or a first-loop day', () => {
    const second = S('p2', '2026-09-20', { status: 'analysing' })
    expect(t2Due({ plus: false, session: second, sessions: [...base.slice(0, 3), second], experiments: [exp], state: {}, now: NOW })).toBe(false)
    const sameDay = S('p2b', '2026-09-20', { status: 'analysing' })
    expect(t2Due({ plus: false, session: sameDay, sessions: [...base.slice(0, 3), sameDay], experiments: [exp], state: {}, now: NOW })).toBe(false)
    const retestBlock = S('r1b', '2026-09-09', { status: 'analysing' })
    expect(t2Due({ plus: false, session: retestBlock, sessions: [...base, retestBlock], experiments: [exp], state: {}, now: NOW })).toBe(false)
  })

  it('a new month starts a new allowance', () => {
    const oct = S('o1', '2026-10-01', { status: 'analysing' })
    expect(t2Due({ plus: false, session: oct, sessions: [...base, oct], experiments: [exp], state: {}, now: new Date(2026, 9, 1) })).toBe(false)
  })
})

describe('the state log', () => {
  it('keeps the last 20 showings and the day of the last T1 or T2', () => {
    let s = {}
    for (let i = 0; i < 25; i++) s = afterShown(s, 't3', NOW, { feature: 'ghost-compare' })
    expect((s as { log: unknown[] }).log).toHaveLength(20)
    expect((s as { lastShownDay?: string }).lastShownDay).toBeUndefined()
    expect(afterShown(s, 't2', NOW).lastShownDay).toBe(localDay(NOW))
  })
})
