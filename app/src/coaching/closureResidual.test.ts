// Regression tests for the residual closure findings (2026-09-28): a practice of any drill logged "It
// hurts" holds every harder version (finding 0), and the baseline note counts only matched sessions
// that have the item's metric with its per-session minimum (finding 20).
import { describe, expect, it } from 'vitest'
import { decideFocus, DECISION_COPY } from './decide.ts'
import { chooseDrill, loggedAfter, practiceLogRules, soreLoggedOn, successesSincePain } from './deliver.ts'
import { experimentTransition } from './experiment.ts'
import { item } from './library.ts'
import { normaliseProfile } from './profile.ts'
import { apex, exactSpread, profile, session } from './testkit.ts'
import type { CoachingExperiment, CoachingStratum, FocusDecision, PainLogMark, PracticeLogSummary } from './types.ts'

const DEUCE_FIRST: CoachingStratum = { view: 'side', cameraSide: 'chest', courtSide: 'deuce', serveNumber: 1, intendedType: 'unknown', handedness: 'right' }

const log = (itemId: string, date: string, body: PracticeLogSummary['body'], met: PracticeLogSummary['successCriterionMet'] = 'yes', createdAt?: string): PracticeLogSummary => ({
  date,
  itemId,
  successCriterionMet: met,
  body,
  ...(createdAt ? { createdAt } : {}),
})

const tossSession = (id: string, startedAt: string, s: number, o: { n?: number; courtSide?: 'deuce' | 'ad'; noToss?: boolean } = {}) => {
  const n = o.n ?? 16
  const apexCm = exactSpread(n, 335, s)
  return session({ id, startedAt, n, courtSide: o.courtSide, metrics: o.noToss ? {} : { 'toss-apex-height': (i) => apex(apexCm[i], 1.75, { half: 7 }) } })
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

describe('a practice of any drill logged "It hurts" holds every harder version (finding 0; COACHING §10.3)', () => {
  const p = normaliseProfile(profile())
  // Two successful reach-up practices, then the keep-going drill logged with pain (no experiment).
  const reachUp = [log('reach-up', '2026-09-25', 'fine'), log('reach-up', '2026-09-26', 'fine')]
  const pain: PainLogMark = { date: '2026-09-27', createdAt: '2026-09-27T08:00:00.000Z' }

  for (const today of ['2026-09-27', '2026-09-28']) {
    it(`[reach-up yes, reach-up yes, keep-going pain]: base drill, paused, on ${today}`, () => {
      const r = practiceLogRules(reachUp, 'reach-up', today, pain)
      expect(r.unlockProgression).toBe(false)
      expect(r.painPaused).toBe(true)
      const d = chooseDrill(item('reach-up'), p, 'first-serves-in', reachUp, { today, lastPainLog: pain })
      expect(d.variant).toBe('base')
      expect(d.progression).toBeUndefined()
      expect(d.progressionLocked).toBe('paused-sore')
      expect(JSON.stringify(d)).not.toMatch(/full pace/i)
    })
  }

  it('the same logs without the pain mark would have opened it (the mark is what holds it)', () => {
    expect(chooseDrill(item('reach-up'), p, 'first-serves-in', reachUp, { today: '2026-09-28' }).variant).toBe('progression')
  })

  it('a forced progression falls back to the base drill while the pain mark holds it', () => {
    expect(chooseDrill(item('reach-up'), p, 'first-serves-in', reachUp, { today: '2026-09-28', lastPainLog: pain, forceVariant: 'progression' }).variant).toBe('base')
  })

  it('two successful practices after the pain log open it again, not before', () => {
    const one = [...reachUp, log('reach-up', '2026-09-29', 'fine')]
    expect(practiceLogRules(one, 'reach-up', '2026-09-30', pain).unlockProgression).toBe(false)
    const two = [...one, log('reach-up', '2026-09-30', 'fine')]
    expect(practiceLogRules(two, 'reach-up', '2026-10-01', pain).unlockProgression).toBe(true)
    expect(chooseDrill(item('reach-up'), p, 'first-serves-in', two, { today: '2026-10-01', lastPainLog: pain }).variant).toBe('progression')
  })

  it('on the pain log\'s day, a later successful practice counts only with both save times', () => {
    const later = log('reach-up', '2026-09-27', 'fine', 'yes', '2026-09-27T09:00:00.000Z')
    const earlier = log('reach-up', '2026-09-27', 'fine', 'yes', '2026-09-27T07:00:00.000Z')
    expect(loggedAfter(later, pain)).toBe(true)
    expect(loggedAfter(earlier, pain)).toBe(false)
    expect(loggedAfter({ date: '2026-09-27' }, pain)).toBe(false)
    expect(loggedAfter({ date: '2026-09-27', createdAt: '2026-09-27T09:00:00.000Z' }, { date: '2026-09-27' })).toBe(false)
    expect(successesSincePain([earlier, later, log('reach-up', '2026-09-28', 'fine')], pain).yes).toBe(2)
  })

  it('"It hurts" today holds the day like "A bit sore or tight" (any drill)', () => {
    expect(soreLoggedOn([log('keep-going', '2026-09-28', 'pain', 'partly')], '2026-09-28')).toBe(true)
    expect(soreLoggedOn([], '2026-09-28', { date: '2026-09-28' })).toBe(true)
    expect(soreLoggedOn([log('keep-going', '2026-09-27', 'pain', 'partly')], '2026-09-28')).toBe(false)
    // Every drill's logs passed in: the keep-going pain log today holds reach-up for the day.
    const all = [...reachUp, log('keep-going', '2026-09-28', 'pain', 'partly')]
    const r = practiceLogRules(all, 'reach-up', '2026-09-28')
    expect(r.unlockProgression).toBe(false)
    expect(r.soreLoggedToday).toBe(true)
  })

  it('a "likely better" re-test does not flag the unlock after a pain log of another drill', () => {
    const likely = { verdict: 'likely-better' as const, method: 'x' }
    const logs = [log('toss-height-steady', '2026-09-25', 'fine'), log('toss-height-steady', '2026-09-26', 'fine')]
    expect(experimentTransition(exp(), likely, false, logs, '2026-09-28').unlockProgression).toBe(true)
    expect(experimentTransition(exp(), likely, false, logs, '2026-09-28', pain).unlockProgression).toBe(false)
    expect(experimentTransition(exp(), likely, false, logs, '2026-09-27', pain).unlockProgression).toBe(false)
  })

  it('decideFocus: the continuing experiment serves the base drill, paused, after a keep-going pain log', () => {
    const s = tossSession('base', '2026-09-28T09:00:00+10:00', 21)
    const two = [log('toss-height-steady', '2026-09-25', 'fine'), log('toss-height-steady', '2026-09-26', 'fine')]
    const input = { profile: profile(), session: s, activeExperiment: exp({ startedAt: '2026-09-28T09:00:00+10:00' }), practiceLogs: two, now: '2026-09-28T18:00:00+10:00' }
    const open = decideFocus(input) as FocusDecision
    expect(open.kind).toBe('focus')
    expect(open.drill.variant).not.toBe('base')
    for (const now of ['2026-09-27T18:00:00+10:00', '2026-09-28T18:00:00+10:00']) {
      const held = decideFocus({ ...input, lastPainLog: pain, now }) as FocusDecision
      expect(held.kind).toBe('focus')
      expect(held.drill.variant).toBe('base')
      expect(held.drill.progressionLocked).toBe('paused-sore')
    }
  })
})

describe('the baseline note needs 3 matched sessions with the metric (finding 20; COACHING §6.4)', () => {
  const now = '2026-09-26T10:00:00+10:00'
  const today = () => tossSession('now', '2026-09-26T09:00:00+10:00', 21, { n: 21 })

  it('3 matched sessions with only 4 serves each: the absolute focus still says "Compared with published ranges"', () => {
    const history = ['01', '03', '05'].map((d) => tossSession(`small-${d}`, `2026-09-${d}T09:00:00+10:00`, 20, { n: 4 }))
    const d = decideFocus({ profile: profile(), session: today(), history, now }) as FocusDecision
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.notes).toContain(DECISION_COPY.baselineBuilding)
  })

  it('3 matched sessions with the toss out of frame do not count either', () => {
    const history = ['01', '03', '05'].map((d) => tossSession(`nofr-${d}`, `2026-09-${d}T09:00:00+10:00`, 20, { n: 16, noToss: true }))
    const d = decideFocus({ profile: profile(), session: today(), history, now }) as FocusDecision
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.notes).toContain(DECISION_COPY.baselineBuilding)
  })

  it('3 matched sessions that meet the minimum: the note goes', () => {
    const history = ['01', '03', '05'].map((d) => tossSession(`full-${d}`, `2026-09-${d}T09:00:00+10:00`, 20, { n: 16 }))
    const d = decideFocus({ profile: profile(), session: today(), history, now }) as FocusDecision
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.notes).not.toContain(DECISION_COPY.baselineBuilding)
  })
})
