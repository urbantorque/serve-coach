// COACHING §12 experiment loop and §11 load guidance.
import { describe, expect, it } from 'vitest'
import { decideFocus } from './decide.ts'
import { chooseDrill, practiceLogRules } from './deliver.ts'
import { experimentTransition, matchedComparison, retestDue, retestKind } from './experiment.ts'
import { item } from './library.ts'
import { loadGuidance, rampFlag } from './load.ts'
import { normaliseProfile } from './profile.ts'
import { apex, exactSpread, mv, profile, session } from './testkit.ts'
import type { CoachingExperiment, CoachingStratum, FocusDecision, PracticeLogSummary } from './types.ts'
import { didItWork } from '../analysis/stats/index.ts'
import { metricsVerdict } from './verdict.ts'

const DEUCE_FIRST: CoachingStratum = { view: 'side', cameraSide: 'chest', courtSide: 'deuce', serveNumber: 1, intendedType: 'unknown', handedness: 'right' }

const tossSession = (id: string, startedAt: string, s: number, o: { n?: number; courtSide?: 'deuce' | 'ad'; template?: 'retest' | 'experiment'; blocks?: number[]; contactMedian?: number } = {}) => {
  const n = o.n ?? 16
  const apexCm = o.blocks ? o.blocks.map((b, i) => (b === 0 ? exactSpread(n / 2, 335, s)[i % (n / 2)] : exactSpread(n / 2, 335, 8)[i % (n / 2)])) : exactSpread(n, 335, s)
  return session({
    id,
    startedAt,
    n,
    courtSide: o.courtSide,
    template: o.template,
    blocks: o.blocks,
    metrics: {
      'toss-apex-height': (i) => apex(apexCm[i], 1.75, { half: 7 }),
      ...(o.contactMedian ? { 'contact-height-ratio': (i: number) => mv('contact-height-ratio', o.contactMedian! + ((i % 3) - 1) * 0.01, { half: 0.02, unit: 'ratio-of-height' }) } : {}),
    },
  })
}

const exp = (over: Partial<CoachingExperiment> = {}): CoachingExperiment => ({
  id: 'e1',
  itemId: 'toss-height-steady',
  faultId: 'toss-height-inconsistent',
  startedSessionId: 'base',
  startedAt: '2026-09-20T09:00:00+10:00',
  stratum: DEUCE_FIRST,
  cueRegister: 'outcome',
  drillVariant: 'base',
  retests: [],
  status: 'active',
  ...over,
})

describe('matched comparison and verdicts (§12.3, §12.4)', () => {
  const baseline = tossSession('base', '2026-09-20T09:00:00+10:00', 21)
  const retest = tossSession('rt1', '2026-09-25T09:00:00+10:00', 14, { template: 'retest' })
  const p = normaliseProfile(profile({ sex: 'female', heightM: 1.75 }))

  it('§7.7 re-test numbers follow METRICS §4.5: too early to tell, more than 150 serves, resolved met once, still active', () => {
    // COACHING §7.7 (revised 27 Sep 2026): σ̂ 20.6 cm -> 13.4 cm at n = 16 each side. The spread
    // bootstrap with Pocock bounds (2.29 / 1.65) and τ 0.15 on the log scale leaves the 80% interval
    // across 0, and planning on the log scale finds no N below 150.
    const c = matchedComparison({ exp: exp(), session: retest, history: [baseline], profile: p })
    expect(c.request.baseline.bySession?.[0]).toHaveLength(16)
    expect(c.result.method).toBe('spread-bootstrap')
    expect(c.result.verdict).toBe('too-early')
    expect(c.result.delta).toBeCloseTo(1 - 13.416 / 20.616, 2)
    expect(c.result.low).toBeLessThan(0)
    expect(c.result.tooSmallToConfirm).toBe(true)
    expect(c.copy).toBe('Too early to tell. A change this size needs more than 150 serves to confirm, so keep practising and re-test.')
    expect(c.resolvedMet).toBe(true)
    expect(experimentTransition(exp(), c.result, c.resolvedMet).status).toBe('continue')
  })

  it('the fallback verdict IS the analysis/stats verdict (one implementation, METRICS §4.5)', () => {
    const c = matchedComparison({ exp: exp(), session: retest, history: [baseline], profile: p })
    const b = c.request.baseline
    const f = c.request.followUp
    const out = didItWork({
      metricId: 'toss-height-spread', swc: 0.15, tau: 0.15, seed: 'toss-height-spread', kind: 'spread',
      baseline: [{ sessionId: b.sessionIds[0], values: b.bySession![0], sigmaRandom: b.sigmaR ?? 0 }],
      followUp: [{ sessionId: f.sessionIds[0], values: f.bySession![0], sigmaRandom: f.sigmaR ?? 0 }],
    })
    expect(c.result.verdict).toBe(out.verdict)
    expect(c.result.delta).toBe(out.delta)
    expect([c.result.low, c.result.high]).toEqual(out.ci95)
  })

  it('an unmatched re-test (ad court vs a deuce experiment) is not comparable, with the reason', () => {
    const ad = tossSession('ad', '2026-09-25T09:00:00+10:00', 14, { courtSide: 'ad', template: 'retest' })
    expect(retestKind(exp(), ad)).toBe('unmatched')
    const d = decideFocus({ profile: profile(), session: ad, history: [baseline], activeExperiment: exp(), now: '2026-09-25T10:00:00+10:00' })
    const v = d.kind === 'focus' || d.kind === 'keep-going' ? d.verdict : undefined
    expect(v?.verdict).toBe('not-comparable')
    expect(v?.copy).toBe('Not comparable yet: this session was ad court; your experiment is on the deuce court.')
  })

  it('worked needs clearly-better, or the resolved value in two consecutive matched re-tests', () => {
    const likely = { verdict: 'likely-better' as const, method: 'x' }
    expect(experimentTransition(exp(), likely, true).status).toBe('continue')
    const second = exp({ retests: [{ sessionId: 'rt1', verdict: 'likely-better', resolvedMet: true }] })
    expect(experimentTransition(second, likely, true).status).toBe('worked')
    expect(experimentTransition(exp(), { verdict: 'clearly-better', method: 'x' }, false).status).toBe('worked')
  })

  it('parks after 3 re-tests without progress; worse goes to the regression; two no-change swap the cue', () => {
    const flat = { verdict: 'no-clear-change' as const, method: 'x' }
    const two = exp({ retests: [{ sessionId: 'a', verdict: 'no-clear-change', resolvedMet: false }, { sessionId: 'b', verdict: 'too-early', resolvedMet: false }] })
    expect(experimentTransition(two, flat, false).status).toBe('parked')
    expect(experimentTransition(exp(), { verdict: 'likely-worse', method: 'x' }, false).variant).toBe('regression')
    const one = exp({ retests: [{ sessionId: 'a', verdict: 'no-clear-change', resolvedMet: false }] })
    expect(experimentTransition(one, flat, false).swapCue).toBe(true)
  })
})

describe('stickiness and supersede (§7.4)', () => {
  const reachUpExp = exp({ itemId: 'reach-up', faultId: 'contact-low', startedSessionId: 'old', startedAt: '2026-09-10T09:00:00+10:00' })

  it('an active stage-6 experiment keeps its focus over a new moderate stage-2 fault', () => {
    const s = tossSession('now', '2026-09-26T09:00:00+10:00', 21, { contactMedian: 1.33 })
    const d = decideFocus({ profile: profile(), session: s, activeExperiment: reachUpExp, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.itemId).toBe('reach-up')
    expect(d.experiment?.status).toBe('continue')
  })

  it('a new major stage-2 fault supersedes it', () => {
    const s = tossSession('now', '2026-09-26T09:00:00+10:00', 34, { contactMedian: 1.33 })
    const d = decideFocus({ profile: profile(), session: s, activeExperiment: reachUpExp, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.experiment?.status).toBe('superseded')
    expect(d.experiment?.copy).toBe('Something earlier in your serve needs attention first.')
  })

  it('same-session A/B: shown as "Straight after practice" only; no verdict, no transition, never worked', () => {
    const blocks = Array.from({ length: 24 }, (_, i) => (i < 12 ? 0 : 1))
    const s = tossSession('ab', '2026-09-20T09:00:00+10:00', 22, { n: 24, template: 'experiment', blocks })
    const e = exp({ startedSessionId: 'ab', startedAt: s.startedAt })
    const d = decideFocus({ profile: profile(), session: s, activeExperiment: e, now: '2026-09-20T10:00:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.verdict).toBeUndefined()
    expect(d.experiment?.status).toBe('continue')
    expect(d.sameSession?.copy).toMatch(/^Straight after practice/)
    expect(Number(d.sameSession?.after.value)).toBeLessThan(Number(d.sameSession?.before.value))
  })
})

describe('practice-log rules and drill variants (§12.2, §9.1)', () => {
  const yes: PracticeLogSummary[] = [
    { date: '2026-09-21', itemId: 'second-serve-margin', successCriterionMet: 'yes' },
    { date: '2026-09-23', itemId: 'second-serve-margin', successCriterionMet: 'yes' },
  ]
  const drill = (p: Parameters<typeof profile>[0]) => chooseDrill(item('second-serve-margin'), normaliseProfile(profile(p)), 'second-serve-reliability', yes)

  it('progression gating: UTR 1-3 and UTR 4-7 with back comfort get progression-alt; UTR 4-7 gets the kick progression', () => {
    expect(drill({ level: 'utr-1-3' }).variant).toBe('progression-alt')
    expect(drill({ level: 'utr-4-5', comfortRegions: ['back'] }).variant).toBe('progression-alt')
    const kick = drill({ level: 'utr-6-7' })
    expect(kick.variant).toBe('progression')
    expect(kick.progression?.text).toMatch(/kick/i)
  })

  it('two "no" logs suggest the regression; two awkward logs in a row suggest the other cue', () => {
    const no: PracticeLogSummary[] = [
      { date: '2026-09-21', successCriterionMet: 'no', feel: 'awkward' },
      { date: '2026-09-22', successCriterionMet: 'no', feel: 'awkward' },
    ]
    const r = practiceLogRules(no)
    expect(r.suggestRegression).toBe(true)
    expect(r.suggestOtherCue).toBe(true)
    expect(chooseDrill(item('reach-up'), normaliseProfile(profile()), 'first-serves-in', no).variant).toBe('regression')
  })

  it('the drill counter comes from the success criterion', () => {
    const d = chooseDrill(item('bring-it-down'), normaliseProfile(profile()), 'first-serves-in')
    expect(d.counter).toEqual({ target: 14, of: 20, label: 'Serves land in' })
    expect(d.minutes).toBeGreaterThanOrEqual(5)
    expect(d.minutes).toBeLessThanOrEqual(10)
  })

  it('re-test due: practise first, then ready, then overdue after 7 days', () => {
    const e = exp()
    expect(retestDue(e, [], '2026-09-21').state).toBe('practise-first')
    const logs: PracticeLogSummary[] = [{ date: '2026-09-22', itemId: 'toss-height-steady' }]
    const r = retestDue(e, logs, '2026-09-24')
    expect(r.state).toBe('ready')
    expect(r.dueBy).toBe('2026-09-29')
    expect(retestDue(e, logs, '2026-10-02').state).toBe('overdue')
  })
})

describe('load guidance (§11)', () => {
  it('budgets: 60 for UTR 1-3, 80 for UTR 4-7, 40 with a comfort setting or the less-effort goal', () => {
    expect(loadGuidance(normaliseProfile(profile({ level: 'utr-1-3' })), 'first-serves-in', undefined).sessionBudget).toBe(60)
    expect(loadGuidance(normaliseProfile(profile()), 'first-serves-in', undefined).sessionBudget).toBe(80)
    expect(loadGuidance(normaliseProfile(profile({ comfortRegions: ['back'] })), 'first-serves-in', undefined).sessionBudget).toBe(40)
    const le = loadGuidance(normaliseProfile(profile()), 'less-effort', undefined)
    expect(le.sessionBudget).toBe(40)
    expect(le.hardServeCap).toBe(0)
  })

  it('ramp flag needs 28 days, 3 sessions, a ratio above 1.5 and at least 100 serves', () => {
    expect(rampFlag({ last7Days: 160, chronicWeeklyMean: 90, historyDays: 35, sessionsInHistory: 5 })).toBe(true)
    expect(rampFlag({ last7Days: 90, chronicWeeklyMean: 40, historyDays: 35, sessionsInHistory: 5 })).toBe(false)
    expect(rampFlag({ last7Days: 160, chronicWeeklyMean: 90, historyDays: 20, sessionsInHistory: 5 })).toBe(false)
  })

  it('return after a break halves the week', () => {
    const g = loadGuidance(normaliseProfile(profile()), 'first-serves-in', { daysSinceLastServes: 20, previousWeeklyAverage: 120 })
    expect(g.notes.find((n) => n.id === 'return')?.text).toMatch(/about 60 serves/)
  })
})

describe('METRICS §4.5 fallback verdict', () => {
  it('rates below 10 a side are not comparable; big rate gains read as better', () => {
    expect(metricsVerdict({ metricId: 'serve-in-rate', kind: 'rate', direction: 'increase', baseline: { sessionIds: ['a'], k: 3, n: 8 }, followUp: { sessionIds: ['b'], k: 7, n: 8 }, sameSession: false }).verdict).toBe('not-comparable')
    const v = metricsVerdict({ metricId: 'serve-in-rate', kind: 'rate', direction: 'increase', baseline: { sessionIds: ['a', 'b', 'c'], k: 30, n: 90 }, followUp: { sessionIds: ['d', 'e', 'f'], k: 75, n: 90 }, sameSession: false })
    expect(['likely-better', 'clearly-better']).toContain(v.verdict)
  })

  it('a same-session comparison is never "clearly"', () => {
    const v = metricsVerdict({
      metricId: 'contact-height-ratio',
      kind: 'centre',
      direction: 'increase',
      baseline: { sessionIds: ['s'], bySession: [exactSpread(15, 1.32, 0.01)] },
      followUp: { sessionIds: ['s'], bySession: [exactSpread(15, 1.45, 0.01)] },
      sameSession: true,
    })
    expect(v.verdict).toBe('likely-better')
  })
})
