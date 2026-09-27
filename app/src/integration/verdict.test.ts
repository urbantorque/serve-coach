// The one "Did it work?" verdict: coaching's request judged by analysis/stats (METRICS §4.5).
import { describe, expect, it } from 'vitest'
import { buildVerdictRequest, matchedComparison } from '../coaching/experiment.ts'
import { normaliseProfile } from '../coaching/profile.ts'
import { apex, exactSpread, profile, session } from '../coaching/testkit.ts'
import type { CoachingExperiment, CoachingStratum, VerdictRequest } from '../coaching/types.ts'
import { canonicalVerdict, experimentResult, TOO_SMALL_TO_CONFIRM_SERVES, verdictDetail } from './verdict.ts'

const STRATUM: CoachingStratum = { view: 'side', cameraSide: 'chest', courtSide: 'deuce', serveNumber: 1, intendedType: 'unknown', handedness: 'right' }

const tossSession = (id: string, startedAt: string, sd: number, n = 16) => {
  const cm = exactSpread(n, 335, sd)
  return session({ id, startedAt, n, courtSide: 'deuce', metrics: { 'toss-apex-height': (i) => apex(cm[i], 1.75, { half: 7 }) } })
}

const experiment = (over: Partial<CoachingExperiment> = {}): CoachingExperiment => ({
  id: 'e1',
  itemId: 'toss-height-steady',
  faultId: 'toss-height-inconsistent',
  startedSessionId: 'base',
  startedAt: '2026-09-12T09:00:00+10:00',
  stratum: STRATUM,
  cueRegister: 'outcome',
  drillVariant: 'base',
  retests: [],
  status: 'active',
  ...over,
})

describe('canonicalVerdict (coaching request -> analysis/stats didItWork)', () => {
  const base = tossSession('base', '2026-09-12T08:00:00+10:00', 20, 24)
  const after = tossSession('after', '2026-09-26T08:00:00+10:00', 8, 24)
  const p = normaliseProfile(profile())

  it('judges a matched toss-height re-test with METRICS §4.5 and names more serves when not settled', () => {
    const req = buildVerdictRequest({ exp: experiment(), session: after, history: [base], profile: p })
    expect(req.kind).toBe('spread')
    expect(req.metricId).toBe('toss-height-spread')
    const { result, output } = verdictDetail(req)
    expect(output?.method).toMatch(/spread/)
    expect(['clearly-better', 'likely-better', 'too-early']).toContain(result.verdict)
    expect(result.delta).toBeGreaterThan(0)
    // Coaching's own comparison, with the canonical verdict injected, agrees.
    const mc = matchedComparison({ exp: experiment(), session: after, history: [base], profile: p, verdict: canonicalVerdict })
    expect(mc.result.verdict).toBe(result.verdict)
  })

  it('refuses fewer than 12 measured serves per side for a spread', () => {
    const small = tossSession('small', '2026-09-26T08:00:00+10:00', 8, 8)
    const req = buildVerdictRequest({ exp: experiment(), session: small, history: [base], profile: p })
    const { result } = verdictDetail(req)
    expect(result.verdict).toBe('not-comparable')
    expect(result.reason).toMatch(/fewer than 12/)
  })

  it('passes coaching refusals through (unmatched set-up, band metrics) without any maths', () => {
    const req: VerdictRequest = {
      metricId: 'toss-height-spread',
      kind: 'spread',
      direction: 'decrease',
      baseline: { sessionIds: [] },
      followUp: { sessionIds: [] },
      sameSession: false,
      notComparableReason: 'This session was a different set-up from your experiment.',
    }
    expect(verdictDetail(req)).toEqual({ result: { verdict: 'not-comparable', method: 'none', reason: 'This session was a different set-up from your experiment.' } })
  })

  it('judges rates from tags with Newcombe intervals', () => {
    const req: VerdictRequest = {
      metricId: 'serve-in-rate',
      kind: 'rate',
      direction: 'increase',
      baseline: { sessionIds: ['a'], k: 9, n: 20 },
      followUp: { sessionIds: ['b'], k: 15, n: 20 },
      sameSession: false,
    }
    const { result } = verdictDetail(req)
    expect(result.verdict).not.toBe('not-comparable')
    expect(result.delta).toBeCloseTo(0.3, 5)
  })
})

describe('experimentResult (stored ExperimentRecord.result)', () => {
  it('stores both sides in display units with n, and the verdict Compare shows', () => {
    const base = tossSession('base', '2026-09-12T08:00:00+10:00', 20, 24)
    const after = tossSession('after', '2026-09-26T08:00:00+10:00', 8, 24)
    const req = buildVerdictRequest({ exp: experiment(), session: after, history: [base], profile: normaliseProfile(profile()) })
    const r = experimentResult(req, STRATUM, new Date('2026-09-26T09:00:00+10:00'))
    expect(r.metricId).toBe('toss-height-spread')
    expect(r.baseline.n).toBe(24)
    expect(r.current.n).toBe(24)
    expect(r.baseline.value).toBeGreaterThan(r.current.value)
    expect(r.baseline.low).toBeLessThanOrEqual(r.baseline.value)
    expect(r.baseline.high).toBeGreaterThanOrEqual(r.baseline.value)
    expect(r.matchedOn).toEqual(STRATUM)
    expect(r.computedAt).toBe('2026-09-25T23:00:00.000Z')
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
  })

  it('keeps the refusal reason as the first caveat and stores no serve count', () => {
    const base = tossSession('base', '2026-09-12T08:00:00+10:00', 20, 8)
    const after = tossSession('after', '2026-09-26T08:00:00+10:00', 8, 14)
    const req = buildVerdictRequest({ exp: experiment(), session: after, history: [base], profile: normaliseProfile(profile()) })
    const r = experimentResult(req, STRATUM)
    expect(r.verdict).toBe('not-comparable')
    expect(r.caveats[0]).toMatch(/fewer than 12 measured serves/)
    expect(r.moreServesToConfirm).toBeUndefined()
  })

  it('writes "more than 150 serves" as a finite sentinel (JSON has no Infinity)', () => {
    expect(TOO_SMALL_TO_CONFIRM_SERVES).toBeGreaterThan(150)
  })
})
