// Regression tests for the coaching review fixes (2026-09-28): pain and progressions, comfort and
// effort, soreness holds, cooldowns, pinned experiments, same-visit blocks, judged re-tests, local
// dates, the baseline note and what a stored decision may carry.
import { describe, expect, it } from 'vitest'
import { decideFocus, DECISION_COPY } from './decide.ts'
import { chooseDrill, practiceLogRules } from './deliver.ts'
import { cooldownsFrom, experimentRecordStatus, experimentTransition, localYmd, retestDue, retestKind } from './experiment.ts'
import { getItem, item, LIBRARY, type LibraryItem } from './library.ts'
import { lintItem, lintLibrary } from './lint.ts'
import { normaliseProfile } from './profile.ts'
import { toCoachingRecord } from './record.ts'
import { apex, exactSpread, mv, profile, session } from './testkit.ts'
import type { CoachingExperiment, CoachingStratum, FocusDecision, KeepGoingDecision, PracticeLogSummary } from './types.ts'

const DEUCE_FIRST: CoachingStratum = { view: 'side', cameraSide: 'chest', courtSide: 'deuce', serveNumber: 1, intendedType: 'unknown', handedness: 'right' }

const tossSession = (id: string, startedAt: string, s: number, o: { n?: number; courtSide?: 'deuce' | 'ad'; template?: 'retest' | 'experiment'; contactMedian?: number } = {}) => {
  const n = o.n ?? 16
  const apexCm = exactSpread(n, 335, s)
  return session({
    id,
    startedAt,
    n,
    courtSide: o.courtSide,
    template: o.template,
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

const yes = (itemId: string, date: string, body: PracticeLogSummary['body'] = 'fine'): PracticeLogSummary => ({ date, itemId, successCriterionMet: 'yes', body })

describe('a practice logged with pain never opens the harder version (COACHING §10.3, §12.2)', () => {
  const p = normaliseProfile(profile())

  it('two "yes" logs, one of them "It hurts": no unlock, and the drill says the harder version is paused', () => {
    const logs = [yes('reach-up', '2026-09-21'), yes('reach-up', '2026-09-23', 'pain')]
    const r = practiceLogRules(logs, 'reach-up')
    expect(r.unlockProgression).toBe(false)
    expect(r.painPaused).toBe(true)
    const d = chooseDrill(item('reach-up'), p, 'first-serves-in', logs)
    expect(d.variant).toBe('base')
    expect(d.progression).toBeUndefined()
    expect(d.progressionLocked).toBe('paused-sore')
  })

  it('it takes two successful pain-free practices after the painful one', () => {
    const logs = [yes('reach-up', '2026-09-21'), yes('reach-up', '2026-09-23', 'pain'), yes('reach-up', '2026-09-26')]
    expect(practiceLogRules(logs, 'reach-up').unlockProgression).toBe(false)
    const more = [...logs, yes('reach-up', '2026-09-27')]
    expect(practiceLogRules(more, 'reach-up').unlockProgression).toBe(true)
    expect(chooseDrill(item('reach-up'), p, 'first-serves-in', more).variant).toBe('progression')
  })

  it('a "likely better" re-test does not flag the unlock on painful or other-drill logs', () => {
    const likely = { verdict: 'likely-better' as const, method: 'x' }
    expect(experimentTransition(exp(), likely, false, [yes('toss-height-steady', '2026-09-21'), yes('toss-height-steady', '2026-09-22')]).unlockProgression).toBe(true)
    expect(experimentTransition(exp(), likely, false, [yes('toss-height-steady', '2026-09-21'), yes('toss-height-steady', '2026-09-22', 'pain')]).unlockProgression).toBe(false)
    // Keep-going practices (Target ladder) belong to no experiment.
    expect(experimentTransition(exp(), likely, false, [yes('keep-going', '2026-09-21'), yes('keep-going', '2026-09-22')]).unlockProgression).toBe(false)
  })
})

describe('full pace and kick respect the comfort settings (COACHING §9.3, §11)', () => {
  const two = (id: string) => [yes(id, '2026-09-21'), yes(id, '2026-09-23')]
  const drillFor = (id: string, over: Parameters<typeof profile>[0]) => chooseDrill(item(id), normaliseProfile(profile(over)), 'first-serves-in', two(id))

  it('shoulder, elbow, back or other: no progression or alternative asks for full pace', () => {
    for (const region of ['shoulder', 'elbow', 'back', 'other'] as const) {
      for (const id of ['reach-up', 'toss-to-reach-height', 'steady-rhythm', 'flowing-motion', 'legs-spring', 'shoulder-tilt']) {
        const d = drillFor(id, { level: 'utr-6-7', comfortRegions: [region] })
        expect(`${id} ${region}: ${d.progression?.text ?? ''}`).not.toMatch(/full pace|full effort/i)
      }
    }
    // Without a comfort setting the full-pace progression is still there.
    expect(drillFor('reach-up', {}).progression?.text).toMatch(/full pace/)
  })

  it('second-serve kick never reaches a shoulder, elbow, back or other setting; slice to the backhand instead', () => {
    for (const region of ['shoulder', 'elbow', 'back', 'other'] as const) {
      const d = chooseDrill(item('second-serve-margin'), normaliseProfile(profile({ level: 'utr-6-7', comfortRegions: [region] })), 'second-serve-reliability', two('second-serve-margin'))
      expect(d.variant).toBe('progression-alt')
      expect(d.progression?.text).not.toMatch(/kick/i)
    }
  })

  it("today's soreness in the shoulder also rules out full pace", () => {
    const d = chooseDrill(item('reach-up'), normaliseProfile(profile(), { answer: 'sore', regions: ['shoulder'] }), 'first-serves-in', two('reach-up'))
    expect(d.progression).toBeUndefined()
  })

  it('the library lint rejects a full-pace progression without the comfort exclusions, and a full-pace alternative', () => {
    expect(lintLibrary(LIBRARY)).toEqual([])
    const base = structuredClone(getItem('reach-up')) as LibraryItem
    const open = { ...base, drill: { ...base.drill, progressionGate: { ...base.drill.progressionGate, excludeIfComfort: [] } } }
    expect(lintItem(open).some((p) => p.includes('full-effort progression must exclude'))).toBe(true)
    const altFull = { ...base, drill: { ...base.drill, progressionAlt: 'Serves at full pace to a target.' } }
    expect(lintItem(altFull).some((p) => p.includes('progressionAlt must be an easier-effort version'))).toBe(true)
  })
})

describe("today's soreness holds an experiment, never parks it (COACHING §9.3, §12.5)", () => {
  const legsExp = exp({ id: 'legs', itemId: 'legs-spring', faultId: getItem('legs-spring')!.faultId!, startedSessionId: 'old', startedAt: '2026-09-10T09:00:00+10:00' })
  const s = tossSession('now', '2026-09-26T09:00:00+10:00', 21)

  it('a sore knee today: keep going for today, the experiment note says it waits, and it stays active', () => {
    const d = decideFocus({ profile: profile(), session: s, activeExperiment: legsExp, bodyCheck: { answer: 'sore', regions: ['knee'] }, now: '2026-09-26T10:00:00+10:00' })
    expect(d.kind).toBe('keep-going')
    const k = d as KeepGoingDecision
    expect(k.experiment).toMatchObject({ id: 'legs', status: 'continue', copy: DECISION_COPY.soreHold })
    expect(k.experiment?.cooldownSessions).toBeUndefined()
    expect(experimentRecordStatus(k.experiment, 'legs')).toBe('active')
  })

  it('the next day (no soreness) the experiment carries on', () => {
    const d = decideFocus({ profile: profile(), session: s, activeExperiment: legsExp, now: '2026-09-27T10:00:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.itemId).toBe('legs-spring')
    expect(d.experiment?.status).toBe('continue')
  })

  it('a standing knee setting still parks it', () => {
    const d = decideFocus({ profile: profile({ comfortRegions: ['knee'] }), session: s, activeExperiment: legsExp, now: '2026-09-26T10:00:00+10:00' })
    const note = 'experiment' in d ? d.experiment : undefined
    expect(note?.status).toBe('parked')
  })

  it('the stored decision never names the sore areas or keeps soreness-only alternatives (D8)', () => {
    const d = decideFocus({ profile: profile(), session: tossSession('now', '2026-09-26T09:00:00+10:00', 21), bodyCheck: { answer: 'sore', regions: ['knee', 'back'] }, now: '2026-09-26T10:00:00+10:00' })
    const rec = toCoachingRecord(d)
    const text = JSON.stringify({ trace: rec.trace, alternatives: rec.alternatives })
    // Body areas and soreness never appear ("Toss front to back" is an item's name, not an area).
    expect(text).not.toMatch(/knee|(?<!front to )back|sore/i)
    expect(d.kind === 'focus' ? d.checks.some((c) => c.soreToday) : true).toBe(true)
  })
})

describe('cooldowns (COACHING §7.4)', () => {
  const sessions = ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07', '2026-09-09'].map((d) => ({ startedAt: `${d}T09:00:00+10:00` }))

  it('a parked item rests for the ending session and the next two; a worked one for the ending session and the next', () => {
    const parked = [{ itemId: 'toss-height-steady', kind: 'parked' as const, endedAt: sessions[0].startedAt }]
    expect(cooldownsFrom(parked, sessions, sessions[0].startedAt)).toEqual({ 'toss-height-steady': 3 })
    expect(cooldownsFrom(parked, sessions, sessions[1].startedAt)).toEqual({ 'toss-height-steady': 2 })
    expect(cooldownsFrom(parked, sessions, sessions[2].startedAt)).toEqual({ 'toss-height-steady': 1 })
    expect(cooldownsFrom(parked, sessions, sessions[3].startedAt)).toEqual({})
    const worked = [{ itemId: 'reach-up', kind: 'worked' as const, endedAt: sessions[0].startedAt }]
    expect(cooldownsFrom(worked, sessions, sessions[1].startedAt)).toEqual({ 'reach-up': 1 })
    expect(cooldownsFrom(worked, sessions, sessions[2].startedAt)).toEqual({})
  })

  it('an item on cooldown is not picked again, and never supersedes an experiment as an "earlier major" fault', () => {
    const s = tossSession('now', '2026-09-26T09:00:00+10:00', 34, { contactMedian: 1.33 })
    const fresh = decideFocus({ profile: profile(), session: s, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(fresh.itemId).toBe('toss-height-steady')
    const resting = decideFocus({ profile: profile(), session: s, cooldowns: { 'toss-height-steady': 2 }, now: '2026-09-26T10:00:00+10:00' })
    expect(resting.kind === 'focus' ? resting.itemId : resting.kind).not.toBe('toss-height-steady')
    const reachUp = exp({ itemId: 'reach-up', faultId: 'contact-low', startedSessionId: 'old', startedAt: '2026-09-10T09:00:00+10:00' })
    const kept = decideFocus({ profile: profile(), session: s, activeExperiment: reachUp, cooldowns: { 'toss-height-steady': 2 }, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(kept.itemId).toBe('reach-up')
    expect(kept.experiment?.status).toBe('continue')
  })
})

describe("a coach's focus still gets its verdict and transition (PRODUCT §6.8.5)", () => {
  it('a clearly better re-test on the pinned item: verdict shown, experiment worked, the pinned focus stays', () => {
    const baseline = tossSession('base', '2026-09-20T09:00:00+10:00', 24, { n: 30 })
    const retest = tossSession('rt1', '2026-09-25T09:00:00+10:00', 8, { n: 30, template: 'retest' })
    const d = decideFocus({
      profile: profile({ pinnedFocusItemId: 'toss-height-steady' }),
      session: retest,
      history: [baseline],
      activeExperiment: exp({ pinnedByCoach: true }),
      now: '2026-09-25T10:00:00+10:00',
    }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.pinnedByCoach).toBe(true)
    expect(d.verdict?.verdict).toBe('clearly-better')
    expect(d.experiment?.status).toBe('worked')
    expect(d.experiment?.copy).toMatch(/coach's focus stays/)
    expect(experimentRecordStatus(d.experiment, 'e1')).toBe('completed')
  })
})

describe('Block B after the drill is never a re-test (COACHING §12.3)', () => {
  it('a later session on the same visit is same-session: no verdict, no transition, "Straight after practice" only', () => {
    const a = { ...tossSession('a', '2026-09-20T09:00:00+10:00', 22, { n: 16 }), visitId: '2026-09-20' }
    const b = { ...tossSession('b', '2026-09-20T09:45:00+10:00', 6, { n: 16, template: 'experiment' }), visitId: '2026-09-20' }
    const e = exp({ startedSessionId: 'a', startedAt: '2026-09-20T09:10:00+10:00', startedVisitId: '2026-09-20' })
    expect(retestKind(e, b)).toBe('same-session')
    const d = decideFocus({ profile: profile(), session: b, history: [a], activeExperiment: e, now: '2026-09-20T10:00:00+10:00' }) as FocusDecision
    expect(d.kind).toBe('focus')
    expect(d.verdict).toBeUndefined()
    expect(d.experiment?.status).toBe('continue')
    expect(d.sameSession?.copy).toMatch(/^Straight after practice/)
    // The next day's session is a real re-test.
    const later = { ...tossSession('c', '2026-09-24T09:00:00+10:00', 14, { n: 16 }), visitId: '2026-09-24' }
    expect(retestKind(e, later)).toBe('matched')
  })
})

describe('only judged re-tests count towards parking (COACHING §12.5)', () => {
  it('two "not comparable yet" re-tests and one real "about the same" continue; three judged ones park', () => {
    const flat = { verdict: 'no-clear-change' as const, method: 'x' }
    const nc = (id: string) => ({ sessionId: id, verdict: 'not-comparable' as const, resolvedMet: false })
    expect(experimentTransition(exp({ retests: [nc('a'), nc('b')] }), flat, false).status).toBe('continue')
    const judged = exp({ retests: [{ sessionId: 'a', verdict: 'no-clear-change', resolvedMet: false }, nc('b'), { sessionId: 'c', verdict: 'too-early', resolvedMet: false }] })
    expect(experimentTransition(judged, flat, false).status).toBe('parked')
  })
})

describe('re-test timing uses local dates (COACHING §12.3)', () => {
  it('a morning re-test is dated that local day, and a practice the day before does not count after it', () => {
    const morning = new Date(2026, 8, 29, 8, 0).toISOString()
    expect(localYmd(morning)).toBe('2026-09-29')
    expect(localYmd('2026-09-29')).toBe('2026-09-29')
    const r = retestDue(exp(), [{ date: '2026-09-28', itemId: 'toss-height-steady' }], new Date(2026, 8, 29, 9, 0).toISOString(), morning)
    expect(r.state).toBe('practise-first')
  })

  it('"overdue" turns at local midnight, not in the morning', () => {
    const logs: PracticeLogSummary[] = [{ date: '2026-09-21', itemId: 'toss-height-steady' }]
    expect(retestDue(exp(), logs, new Date(2026, 8, 28, 23, 30).toISOString()).state).toBe('ready')
    expect(retestDue(exp(), logs, new Date(2026, 8, 29, 0, 30).toISOString()).state).toBe('overdue')
  })
})

describe('the baseline note follows matched sessions (COACHING §6.4)', () => {
  it('3 ad-court sessions and 1 deuce session do not make a deuce baseline', () => {
    const history = [
      tossSession('ad1', '2026-09-01T09:00:00+10:00', 20, { courtSide: 'ad' }),
      tossSession('ad2', '2026-09-03T09:00:00+10:00', 20, { courtSide: 'ad' }),
      tossSession('ad3', '2026-09-05T09:00:00+10:00', 20, { courtSide: 'ad' }),
      tossSession('d1', '2026-09-07T09:00:00+10:00', 20),
    ]
    const d = decideFocus({ profile: profile(), session: tossSession('now', '2026-09-26T09:00:00+10:00', 21), history, now: '2026-09-26T10:00:00+10:00' }) as FocusDecision
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.notes).toContain(DECISION_COPY.baselineBuilding)
  })
})
