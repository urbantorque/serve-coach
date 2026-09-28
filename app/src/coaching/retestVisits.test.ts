// Regression tests (2026-09-28 review): a block recorded after the drill is never a re-test, on the
// day an experiment started or on any later visit, and one long "Experiment" recording only counts
// its Block A (COACHING §12.3; CAPTURE §5.5).
import { describe, expect, it } from 'vitest'
import { decideFocus } from './decide.ts'
import { BLOCK_A_SERVES, buildVerdictRequest, DRILL_BREAK_S, experimentBlocks, rederiveRetests, retestDue, retestKind, retestVisitsOf, sameSessionCheck, withRetestVisits } from './experiment.ts'
import { normaliseProfile } from './profile.ts'
import { apex, exactSpread, profile, session } from './testkit.ts'
import type { CoachingExperiment, CoachingSession, CoachingStratum, FocusDecision } from './types.ts'

const DEUCE_FIRST: CoachingStratum = { view: 'side', cameraSide: 'chest', courtSide: 'deuce', serveNumber: 1, intendedType: 'unknown', handedness: 'right' }
const P = normaliseProfile(profile())

/** A toss-height session on a visit; `spreads` gives each run of serves its own spread (cm). */
function toss(id: string, startedAt: string, visitId: string, spreads: { n: number; sd: number }[], o: { template?: 'experiment' | 'retest'; blocks?: number[] } = {}): CoachingSession {
  const cm = spreads.flatMap((r) => exactSpread(r.n, 335, r.sd))
  return {
    ...session({
      id,
      startedAt,
      n: cm.length,
      template: o.template,
      blocks: o.blocks,
      metrics: { 'toss-apex-height': (i) => apex(cm[i], 1.75, { half: 7 }) },
    }),
    visitId,
  }
}

const exp = (over: Partial<CoachingExperiment> = {}): CoachingExperiment => ({
  id: 'e1',
  itemId: 'toss-height-steady',
  faultId: 'toss-height-inconsistent',
  startedSessionId: 'a',
  startedAt: '2026-09-20T09:10:00+10:00',
  startedVisitId: '2026-09-20',
  stratum: DEUCE_FIRST,
  cueRegister: 'outcome',
  drillVariant: 'base',
  retests: [],
  status: 'active',
  ...over,
})

// Started on 20 Sep. On 24 Sep the player records with the Experiment plan: Block A (x), the drill,
// then Block B (y), each its own session on the same visit.
const a = toss('a', '2026-09-20T09:00:00+10:00', '2026-09-20', [{ n: 16, sd: 22 }])
const x = toss('x', '2026-09-24T09:00:00+10:00', '2026-09-24', [{ n: 16, sd: 20 }], { template: 'experiment' })
const y = toss('y', '2026-09-24T09:45:00+10:00', '2026-09-24', [{ n: 16, sd: 5 }], { template: 'experiment' })

describe('only the first recording of a later visit is its re-test (COACHING §12.3)', () => {
  it('Block A of a later Experiment visit is matched; Block B after the drill is same-session', () => {
    const visits = retestVisitsOf(exp(), [a, x, y])
    expect(visits).toEqual({ '2026-09-24': 'x' })
    const e = withRetestVisits(exp(), [a, x, y])
    expect(retestKind(e, x)).toBe('matched')
    expect(retestKind(e, y)).toBe('same-session')
    // A block recorded before the re-test that day never shifts it (start times, not analysis order).
    expect(retestVisitsOf(exp(), [y, a, x])).toEqual({ '2026-09-24': 'x' })
  })

  it('Block B gets no verdict and no transition, only "Straight after practice" against that visit\'s Block A', () => {
    const d = decideFocus({ profile: profile(), session: y, history: [x, a], activeExperiment: exp(), now: '2026-09-24T10:30:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.verdict).toBeUndefined()
    expect(d.experiment?.status).toBe('continue')
    expect(d.trace.some((t) => t.step === 'experiment' && /Not a later matched re-test \(same-session\)/.test(t.detail))).toBe(true)
    expect(d.sameSession?.copy).toMatch(/^Straight after practice/)
    expect(d.sameSession?.before.basis).toMatch(/never used for a verdict/)
    // The re-test (x) that visit is still judged.
    const dx = decideFocus({ profile: profile(), session: x, history: [a], activeExperiment: exp(), now: '2026-09-24T09:30:00+10:00' }) as FocusDecision
    expect(dx.verdict).toBeDefined()
  })

  it('Block B never marks the experiment worked, however good it looks', () => {
    // y's spread (5 cm) against a 22 cm baseline would be "clearly better" if it were a re-test.
    const e = withRetestVisits(exp(), [a, x, y])
    const req = buildVerdictRequest({ exp: e, session: y, history: [a, x], profile: P })
    expect(req.notComparableReason).toMatch(/same-session comparison never decides/)
    expect(req.followUp.sessionIds).toEqual([])
    const d = decideFocus({ profile: profile(), session: y, history: [x, a], activeExperiment: exp(), now: '2026-09-24T10:30:00+10:00' }) as FocusDecision
    expect(d.experiment?.status).not.toBe('worked')
  })

  it('a later re-test never pools Block B into its follow-up', () => {
    const z = toss('z', '2026-09-28T09:00:00+10:00', '2026-09-28', [{ n: 16, sd: 18 }])
    const e = withRetestVisits(exp(), [a, x, y, z])
    const req = buildVerdictRequest({ exp: e, session: z, history: [a, x, y], profile: P })
    expect(req.followUp.sessionIds).toEqual(['x', 'z'])
    expect(req.baseline.sessionIds).toEqual(['a'])
  })

  it('an earlier re-test stored before this fix is dropped when re-derived', () => {
    const e = withRetestVisits(exp(), [a, x, y])
    const retests = rederiveRetests(e, [x, y], [a, x, y], P)
    expect(retests.map((r) => r.sessionId)).toEqual(['x'])
  })

  it("Block B's re-test-due line counts practice from that visit's re-test, not from the start", () => {
    const d = decideFocus({
      profile: profile(),
      session: y,
      history: [x, a],
      activeExperiment: exp({ retests: [{ sessionId: 'x', verdict: 'too-early', resolvedMet: false }] }),
      practiceLogs: [{ date: '2026-09-22', itemId: 'toss-height-steady' }],
      now: '2026-09-24T10:30:00+10:00',
    }) as FocusDecision
    expect(d.retestDue?.state).toBe('practise-first')
    expect(retestDue(exp(), [{ date: '2026-09-22', itemId: 'toss-height-steady' }], '2026-09-24T10:30:00+10:00').state).toBe('ready')
  })
})

describe('one long "Experiment" recording counts only its Block A (CAPTURE §5.5; COACHING §12.3)', () => {
  it('a pause of 5 minutes or more between serves is the drill: serves before it are block 1', () => {
    const t = [0, 20, 40, 60, 60 + DRILL_BREAK_S, 60 + DRILL_BREAK_S + 20]
    expect(experimentBlocks(t)).toEqual([1, 1, 1, 1, 2, 2])
    // Collecting balls (a 2-minute gap) is not a drill.
    expect(experimentBlocks([0, 20, 140, 160])).toBeUndefined()
    // Unknown times: no boundary is invented.
    expect(experimentBlocks([0, undefined, 40])).toBeUndefined()
  })

  it('with the drill pause: the re-test pools Block A only, and "Straight after practice" compares the two', () => {
    const blocks = [...Array(16).fill(1), ...Array(16).fill(2)] as number[]
    const pooled = toss('p', '2026-09-24T09:00:00+10:00', '2026-09-24', [{ n: 16, sd: 20 }, { n: 16, sd: 5 }], { template: 'experiment', blocks })
    const e = withRetestVisits(exp(), [a, pooled])
    expect(retestKind(e, pooled)).toBe('matched')
    const req = buildVerdictRequest({ exp: e, session: pooled, history: [a], profile: P })
    expect(req.followUp.sessionIds).toEqual(['p'])
    expect(req.followUp.bySession?.[0]).toHaveLength(16)
    expect(sameSessionCheck('toss-height-steady', pooled, P, DEUCE_FIRST)?.copy).toMatch(/^Straight after practice/)
  })

  it('without a known pause: only the first 15 serves (the template\'s Block A) count', () => {
    const pooled = toss('p', '2026-09-24T09:00:00+10:00', '2026-09-24', [{ n: 15, sd: 20 }, { n: 15, sd: 5 }], { template: 'experiment' })
    const e = withRetestVisits(exp(), [a, pooled])
    const req = buildVerdictRequest({ exp: e, session: pooled, history: [a], profile: P })
    expect(req.followUp.bySession?.[0]).toHaveLength(BLOCK_A_SERVES)
    // No boundary, so no "Straight after practice" either (display needs a real one).
    expect(sameSessionCheck('toss-height-steady', pooled, P, DEUCE_FIRST)).toBeUndefined()
  })

  it('a check-in or re-test recording keeps every serve', () => {
    const plain = toss('r', '2026-09-24T09:00:00+10:00', '2026-09-24', [{ n: 20, sd: 20 }], { template: 'retest' })
    const e = withRetestVisits(exp(), [a, plain])
    const req = buildVerdictRequest({ exp: e, session: plain, history: [a], profile: P })
    expect(req.followUp.bySession?.[0]).toHaveLength(20)
  })
})
