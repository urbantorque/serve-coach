// Regression tests for the closure round (2026-09-28): a practice logged sore holds the harder version
// for the day (finding 0), stored decisions keep comfort wording out (finding 4), and a continuing
// experiment's evidence never crosses a set-up (finding 19).
import { describe, expect, it } from 'vitest'
import { scrubDecision } from '../data/scrub.ts'
import { decideFocus, withoutComfortClause } from './decide.ts'
import { chooseDrill, practiceLogRules } from './deliver.ts'
import { buildVerdictRequest, experimentTransition, retestKind } from './experiment.ts'
import { item } from './library.ts'
import { normaliseProfile } from './profile.ts'
import { toCoachingRecord } from './record.ts'
import { apex, exactSpread, mv, profile, session } from './testkit.ts'
import type { CoachingExperiment, CoachingStratum, FocusDecision, KeepGoingDecision, PracticeLogSummary } from './types.ts'

const DEUCE_FIRST: CoachingStratum = { view: 'side', cameraSide: 'chest', courtSide: 'deuce', serveNumber: 1, intendedType: 'unknown', handedness: 'right' }

const log = (itemId: string, date: string, body: PracticeLogSummary['body'], met: PracticeLogSummary['successCriterionMet'] = 'yes'): PracticeLogSummary => ({ date, itemId, successCriterionMet: met, body })

const tossSession = (id: string, startedAt: string, s: number, o: { n?: number; setupKey?: string; template?: 'retest' } = {}) => {
  const n = o.n ?? 16
  const apexCm = exactSpread(n, 335, s)
  return {
    ...session({ id, startedAt, n, template: o.template, metrics: { 'toss-apex-height': (i) => apex(apexCm[i], 1.75, { half: 7 }) } }),
    ...(o.setupKey ? { setupKey: o.setupKey } : {}),
  }
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

describe('a practice logged "A bit sore or tight" holds the harder version for the day (finding 0; COACHING §9.3, §10.3)', () => {
  const p = normaliseProfile(profile())
  const TODAY = '2026-09-28'

  it('[yes fine, yes sore today] with the "Where?" sheet closed: no unlock today, the drill says paused', () => {
    const logs = [log('reach-up', '2026-09-26', 'fine'), log('reach-up', TODAY, 'sore')]
    const r = practiceLogRules(logs, 'reach-up', TODAY)
    expect(r.unlockProgression).toBe(false)
    expect(r.soreLoggedToday).toBe(true)
    expect(r.painPaused).toBe(true)
    const d = chooseDrill(item('reach-up'), p, 'first-serves-in', logs, { today: TODAY })
    expect(d.variant).toBe('base')
    expect(d.progression).toBeUndefined()
    expect(d.progressionLocked).toBe('paused-sore')
    // Nothing in the drill asks for full pace on the day the player logged soreness.
    expect(JSON.stringify(d)).not.toMatch(/full pace/i)
  })

  it('the next day the two successful practices open it again (soreness is session only)', () => {
    const logs = [log('reach-up', '2026-09-26', 'fine'), log('reach-up', TODAY, 'sore')]
    expect(practiceLogRules(logs, 'reach-up', '2026-09-29').unlockProgression).toBe(true)
    expect(chooseDrill(item('reach-up'), p, 'first-serves-in', logs, { today: '2026-09-29' }).variant).toBe('progression')
  })

  it("a sore log from another drill today holds it too, and so does the caller's flag", () => {
    const logs = [log('reach-up', '2026-09-25', 'fine'), log('reach-up', '2026-09-26', 'fine'), log('keep-going', TODAY, 'sore', 'partly')]
    expect(practiceLogRules(logs, 'reach-up', TODAY).unlockProgression).toBe(false)
    const mine = logs.slice(0, 2)
    expect(chooseDrill(item('reach-up'), p, 'first-serves-in', mine, { today: TODAY }).variant).toBe('progression')
    const held = chooseDrill(item('reach-up'), p, 'first-serves-in', mine, { today: TODAY, soreLoggedToday: true })
    expect(held.variant).toBe('base')
    expect(held.progressionLocked).toBe('paused-sore')
  })

  it('a "likely better" re-test does not flag the unlock on a day a practice was logged sore', () => {
    const likely = { verdict: 'likely-better' as const, method: 'x' }
    const logs = [log('toss-height-steady', '2026-09-26', 'fine'), log('toss-height-steady', TODAY, 'sore')]
    expect(experimentTransition(exp(), likely, false, logs, TODAY).unlockProgression).toBe(false)
    expect(experimentTransition(exp(), likely, false, logs, '2026-09-29').unlockProgression).toBe(true)
  })

  it('decideFocus: the continuing experiment serves the base drill, paused, with a sore practice today', () => {
    const s = tossSession('base', '2026-09-28T09:00:00+10:00', 21)
    const two = [log('toss-height-steady', '2026-09-26', 'fine'), log('toss-height-steady', '2026-09-27', 'fine')]
    const open = decideFocus({ profile: profile(), session: s, activeExperiment: exp({ startedAt: '2026-09-28T09:00:00+10:00' }), practiceLogs: two, now: '2026-09-28T18:00:00+10:00' }) as FocusDecision
    expect(open.kind).toBe('focus')
    expect(open.drill.variant).not.toBe('base')
    const withSore = [...two, log('toss-height-steady', '2026-09-28', 'sore')]
    const held = decideFocus({ profile: profile(), session: s, activeExperiment: exp({ startedAt: '2026-09-28T09:00:00+10:00' }), practiceLogs: withSore, now: '2026-09-28T18:00:00+10:00' }) as FocusDecision
    expect(held.drill.variant).toBe('base')
    expect(held.drill.progressionLocked).toBe('paused-sore')
    const flagged = decideFocus({ profile: profile(), session: s, activeExperiment: exp({ startedAt: '2026-09-28T09:00:00+10:00' }), practiceLogs: two, soreLoggedToday: true, now: '2026-09-28T18:00:00+10:00' }) as FocusDecision
    expect(flagged.drill.variant).toBe('base')
  })
})

describe('stored decisions keep comfort wording out (finding 4; D8)', () => {
  it('a pinned focus ruled out by a comfort setting: the stored trace names neither the item nor comfort', () => {
    const s = tossSession('now', '2026-09-26T09:00:00+10:00', 21)
    const d = decideFocus({ profile: profile({ pinnedFocusItemId: 'legs-spring', comfortRegions: ['knee'] }), session: s, now: '2026-09-26T10:00:00+10:00' })
    expect(d.kind).toBe('keep-going')
    expect((d as KeepGoingDecision).pinnedRuledOut).toBe(true)
    const rec = toCoachingRecord(d)
    const failed = rec.trace.filter((t) => !t.passed)
    expect(failed.every((t) => !t.faultId || t.faultId !== 'legs-quiet')).toBe(true)
    expect(JSON.stringify(rec.trace)).not.toMatch(/comfort/i)
    // The export without "Include comfort notes" carries nothing that names a comfort setting.
    const scrubbed = scrubDecision(rec)!
    expect(JSON.stringify(scrubbed)).not.toMatch(/comfort|sore|pain|knee/i)
  })

  it('an older record with comfort wording at any trace step is scrubbed, fault id dropped', () => {
    const rec = toCoachingRecord(decideFocus({ profile: profile(), session: tossSession('now', '2026-09-26T09:00:00+10:00', 21), now: '2026-09-26T10:00:00+10:00' }))
    const old = {
      ...rec,
      trace: [
        ...rec.trace,
        { step: 'candidate' as const, faultId: 'legs-quiet', passed: false, detail: 'Pinned focus excluded by a comfort setting.' },
        { step: 'select' as const, passed: false, detail: 'Every eligible item is excluded by comfort.' },
      ],
    }
    const out = scrubDecision(old)!
    expect(JSON.stringify(out.trace)).not.toMatch(/comfort|legs-quiet/i)
    expect(out.trace.at(-1)?.detail).toBe('Safety check applied.')
  })

  it('reach-up with a shoulder setting: the screen says why, the stored "why" does not name the setting', () => {
    const n = 16
    const s = session({
      id: 'now',
      startedAt: '2026-09-26T09:00:00+10:00',
      n,
      metrics: { 'contact-height-ratio': (i) => mv('contact-height-ratio', 1.3 + ((i % 3) - 1) * 0.01, { half: 0.02, unit: 'ratio-of-height' }) },
    })
    const d = decideFocus({ profile: profile({ pinnedFocusItemId: 'reach-up', comfortRegions: ['shoulder'] }), session: s, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.itemId).toBe('reach-up')
    const shown = d.reasons.map((r) => r.text).join(' ')
    expect(shown).toMatch(/shoulder comfort setting/)
    const rec = toCoachingRecord(d)
    expect(rec.focus?.whyChosen).not.toMatch(/comfort|shoulder/i)
    expect(rec.focus?.whyChosen).toMatch(/contact height is compared only with your own best/)
  })

  it('withoutComfortClause keeps the rest of the sentence', () => {
    expect(withoutComfortClause('This session: with your shoulder comfort setting, contact height is compared only with your own best.')).toBe(
      'This session: contact height is compared only with your own best.',
    )
    expect(withoutComfortClause('With your shoulder comfort setting, contact height is compared only with your own best.')).toBe('Contact height is compared only with your own best.')
  })
})

describe("a continuing experiment's evidence never crosses a set-up (finding 19; METRICS §4.4)", () => {
  const PORTRAIT = 'portrait|standard|singles'
  const FENCE = 'landscape|far|singles'
  const e = exp({ stratum: { ...DEUCE_FIRST, setup: PORTRAIT }, startedAt: '2026-09-20T09:00:00+10:00' })
  const baseline = tossSession('base', '2026-09-20T09:00:00+10:00', 20, { setupKey: PORTRAIT })

  it('today at the fence (landscape, far): no evidence under the portrait experiment, and it says why', () => {
    const today = tossSession('today', '2026-09-26T09:00:00+10:00', 20, { setupKey: FENCE })
    const d = decideFocus({ profile: profile(), session: today, history: [baseline], activeExperiment: e, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.experiment?.status).toBe('continue')
    expect(d.measurable).toBe(false)
    expect(d.evidence.stats).toEqual([])
    expect(d.evidence.keyServeId).toBeUndefined()
    expect(d.evidence.viewNote).toMatch(/different set-up/)
    expect(d.reasons.some((r) => /peaked at clearly different heights/.test(r.text))).toBe(false)
  })

  it('a control session at the matching set-up still shows its evidence', () => {
    const today = tossSession('today', '2026-09-26T09:00:00+10:00', 20, { setupKey: PORTRAIT })
    const d = decideFocus({ profile: profile(), session: today, history: [baseline], activeExperiment: e, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(d.measurable).toBe(true)
    expect(d.evidence.stats.length).toBeGreaterThan(0)
  })

  it('no serves in the experiment stratum at all: no whole-session evidence either', () => {
    const ad = { ...tossSession('today', '2026-09-26T09:00:00+10:00', 20, { setupKey: PORTRAIT }) }
    ad.defaults = { ...ad.defaults, courtSide: 'ad' }
    const d = decideFocus({ profile: profile(), session: ad, history: [baseline], activeExperiment: e, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.measurable).toBe(false)
    expect(d.evidence.stats).toEqual([])
    expect(d.evidence.viewNote).toMatch(/ad court/)
  })
})

describe('real recording blocks (extra item C1; CAPTURE §5.5, COACHING §12.3)', () => {
  const profileN = normaliseProfile(profile())
  const on = (s: ReturnType<typeof tossSession>, over: Partial<ReturnType<typeof tossSession>>) => ({ ...s, ...over })

  it('Block B recorded on its own is never a re-test, even as the first recording in the stratum that day', () => {
    const e = exp({ startedAt: '2026-09-20T09:00:00+10:00', startedVisitId: '2026-09-20' })
    const blockB = on(tossSession('b', '2026-09-26T09:40:00+10:00', 12), { template: 'experiment', visitId: '2026-09-26', blockIndex: 2 })
    expect(retestKind(e, blockB)).toBe('same-session')
    // Without real blocks (older sessions) it would have been this visit's re-test.
    expect(retestKind(e, { ...blockB, blockIndex: undefined })).toBe('matched')
  })

  it('a baseline takes all of a stand-alone Block A (no 15-serve cap) and none of Block B', () => {
    const blockA = on(tossSession('a', '2026-09-20T08:00:00+10:00', 20, { n: 18 }), { template: 'experiment', visitId: '2026-09-20', blockIndex: 1, blocksInVisit: 2 })
    const blockB = on(tossSession('b', '2026-09-20T08:40:00+10:00', 10, { n: 15 }), { template: 'experiment', visitId: '2026-09-20', blockIndex: 2, blocksInVisit: 2 })
    const e = exp({ startedSessionId: 'b', startedAt: '2026-09-20T08:40:00+10:00', startedVisitId: '2026-09-20' })
    const retest = tossSession('rt', '2026-09-26T09:00:00+10:00', 12, { template: 'retest' })
    const req = buildVerdictRequest({ exp: e, session: { ...retest, visitId: '2026-09-26' }, history: [blockA, blockB], profile: profileN })
    expect(req.baseline.sessionIds).toEqual(['a'])
    expect(req.baseline.bySession?.[0]).toHaveLength(18)
    // Legacy: the same recording without block numbers keeps the first 15 serves only.
    const legacyA = { ...blockA, blockIndex: undefined, blocksInVisit: undefined }
    const legacy = buildVerdictRequest({ exp: e, session: { ...retest, visitId: '2026-09-26' }, history: [legacyA, { ...blockB, blockIndex: undefined, blocksInVisit: undefined }], profile: profileN })
    expect(legacy.baseline.bySession?.[0]).toHaveLength(15)
  })
})
