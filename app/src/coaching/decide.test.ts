// COACHING §15.1 engine tests: the worked example (§7.7) and the priority, gating and safety rules.
import { describe, expect, it } from 'vitest'
import type { ServeOutcome } from '../analysis/types.ts'
import { decideFocus } from './decide.ts'
import { detectItem } from './detect.ts'
import { getItem, item } from './library.ts'
import { normaliseProfile } from './profile.ts'
import { toCoachingRecord } from './record.ts'
import { spreadBound } from './stats.ts'
import { apex, exactMad13, exactSpread, mv, profile, session, unavailable } from './testkit.ts'
import type { CoachingDecision, CoachingInput, CoachingProfile, CoachingSession, FocusDecision, KeepGoingDecision } from './types.ts'

const NOW = '2026-09-27T10:00:00+10:00'
const MIA_H = 1.68

// ---------- the §7.7 worked example ----------

/** Outcomes for the 16 usable serves by rank of |apex deviation| (no association), then the 2 excluded. */
const MIA_OUT_USABLE: ServeOutcome[] = ['in', 'net', 'net', 'in', 'long', 'net', 'in', 'net', 'in', 'wide', 'net', 'in', 'net', 'long', 'in', 'in']
const CONTACT = [1.3, 1.31, 1.33, 1.37, 1.32, 1.34, 1.33, 1.3, 1.39, 1.31, 1.34, 1.32, 1.41, 1.33, 1.34, 1.32]

function miaSession(opts: { tossSd?: number; id?: string; startedAt?: string } = {}): CoachingSession {
  const apexCm = exactSpread(16, 335, opts.tossSd ?? 21)
  const med = [...apexCm].sort((a, b) => a - b)[8]
  const byDev = apexCm.map((_, i) => i).sort((a, b) => Math.abs(apexCm[a] - med) - Math.abs(apexCm[b] - med))
  const outcomes: ServeOutcome[] = new Array(18)
  byDev.forEach((idx, rank) => (outcomes[idx] = MIA_OUT_USABLE[rank]))
  outcomes[16] = 'in'
  outcomes[17] = 'net'
  const fwd = exactSpread(16, 30, 17)
  const drop = exactSpread(16, 105, 8)
  const rhythm = exactSpread(16, 950, 40)
  const cfwd = exactSpread(16, 30, 10)
  const at = (xs: number[], i: number) => xs[i % 16]
  return session({
    id: opts.id ?? 'mia-1',
    startedAt: opts.startedAt ?? '2026-09-20T09:00:00+10:00',
    n: 18,
    heightM: MIA_H,
    excluded: [16, 17],
    outcomes,
    metrics: {
      'toss-apex-height': (i) => apex(Math.round(at(apexCm, i) * 10) / 10, MIA_H, { half: 7 }),
      'toss-forward': (i) => mv('toss-forward', at(fwd, i), { half: 7 }),
      'toss-drop': (i) => mv('toss-drop', at(drop, i), { half: 9 }),
      'contact-height-ratio': (i) => mv('contact-height-ratio', CONTACT[i % 16], { half: 0.03, unit: 'ratio-of-height' }),
      'contact-forward': (i) => mv('contact-forward', at(cfwd, i), { half: 8 }),
      'rhythm-release-to-contact': (i) => mv('rhythm-release-to-contact', at(rhythm, i), { status: 'measured', half: 20, unit: 'ms' }),
      'trophy-pause': () => mv('trophy-pause', 300, { status: 'experimental', half: 60, unit: 'ms' }),
      'leg-drive': (i) => mv('leg-drive', 10 + (i % 3) - 1, { half: 2, unit: '% of height' }),
    },
  })
}

const MIA: CoachingProfile = profile({
  level: 'utr-4-5',
  utr: 4.8,
  sex: 'female',
  ageBand: '40-59',
  heightM: MIA_H,
  goal: 'first-serves-in',
  comfortRegions: ['knee'],
})

const decide = (over: Partial<CoachingInput> = {}): CoachingDecision =>
  decideFocus({ profile: MIA, session: miaSession(), bodyCheck: { answer: 'fine' }, now: NOW, ...over })

const asFocus = (d: CoachingDecision): FocusDecision => {
  expect(d.kind).toBe('focus')
  return d as FocusDecision
}
const check = (d: FocusDecision | KeepGoingDecision, id: string) => d.checks.find((c) => c.itemId === id)

describe('worked example (§7.7)', () => {
  it('reproduces the spread numbers: sigma_L 16.8 cm, P(sigma > 15) 0.975', () => {
    const b = spreadBound(exactSpread(16, 335, 21), 4, 15)
    expect(b.sigmaHat).toBeCloseTo(20.6, 1)
    expect(Math.abs(b.sigmaLower - 16.8)).toBeLessThan(0.1) // the spec rounds 16.75 up
    expect(b.probAbove).toBeCloseTo(0.975, 2)
  })

  it('chooses toss height; reach-up is ranked second; legs excluded for comfort; experimental items off', () => {
    const d = asFocus(decide())
    expect(d.itemId).toBe('toss-height-steady')
    expect(d.detectionConfidence).toBeCloseTo(0.88, 2)
    expect(d.severity).toBe('moderate')
    expect(d.alsoConsidered[0].itemId).toBe('reach-up')
    expect(d.alsoConsidered[0].status).toBe('later-stage')
    expect(d.alsoConsidered.map((c) => c.itemId)).toContain('clear-the-net')
    expect(check(d, 'legs-spring')?.status).toBe('comfort-setting')
    for (const id of ['steady-rhythm', 'shoulder-tilt', 'flowing-motion']) expect(check(d, id)?.status).toBe('experimental-off')
    expect(check(d, 'toss-to-reach-height')?.status).toBe('in-range')
    expect(check(d, 'toss-spot-steady')?.status).toBe('in-range')
  })

  it('reach-up is major (81% clear, median 0.05 below 1.38) and the static gap is 7/18 for the net-linked items', () => {
    const p = normaliseProfile(MIA)
    const r = detectItem(item('reach-up'), { profile: p, session: miaSession(), history: [] })
    expect(r.status).toBe('eligible')
    expect(r.k).toBe(13)
    expect(r.severity).toBe('major')
    expect(r.confidence).toBeCloseTo(0.89, 2)
    const d = asFocus(decide())
    expect(d.outcomeGap).toBeCloseTo(7 / 18, 2)
  })

  it('delivers the UTR 4-7 register, the drill, the stats and the no-clear-difference line', () => {
    const d = asFocus(decide())
    expect(d.cue.register).toBe('outcome')
    expect(d.cue.text).toBe(getItem('toss-height-steady')?.cues.outcome)
    expect(d.drill.name).toBe(getItem('toss-height-steady')?.drill.name)
    expect(d.drill.variant).toBe('base')
    expect(d.evidence.stats.map((s) => s.metricId)).toEqual(['toss-height-spread', 'toss-apex-height'])
    expect(d.evidence.stats.every((s) => s.value.status === 'estimated')).toBe(true)
    expect(d.evidence.outcomeLine).toBe('no-clear-difference')
    expect(d.evidence.outcomeSentence).toMatch(/No clear difference yet/)
    expect(d.evidence.viewNote).toMatch(/sideways/)
    expect(d.evidence.keyFrameEvent).toBe('apex')
    expect(d.effectiveTier).toBe('coach-recommended')
    expect(d.retest.stratumText).toBe('deuce first serves, side view')
    expect(d.reasons.map((r) => r.kind)).toEqual(['stage', 'detection', 'outcome', 'goal'])
  })

  it('tie-break chain without the toss fault: reach-up over clear-the-net (rule d)', () => {
    const d = asFocus(decide({ session: miaSession({ tossSd: 8 }) }))
    expect(d.itemId).toBe('reach-up')
    expect(d.alsoConsidered.map((c) => c.itemId)).toContain('clear-the-net')
  })

  it('the UTR 1-3 register gets the analogy cue', () => {
    const d = asFocus(decide({ profile: { ...MIA, utr: 3.2, level: 'utr-1-3' } }))
    expect(d.cue.register).toBe('analogy')
    expect(d.cue.other.register).toBe('outcome')
  })
})

// ---------- spread rule details ----------

const tossSession = (values: number[], o: { id?: string; outOfFrame?: number } = {}) =>
  session({
    id: o.id ?? 'toss',
    startedAt: '2026-09-20T09:00:00+10:00',
    n: values.length,
    metrics: {
      'toss-apex-height': (i) => (i < (o.outOfFrame ?? 0) ? unavailable('toss-apex-height', 'APEX_OUT_OF_FRAME') : apex(values[i], 1.75, { half: 7 })),
    },
  })

describe('spread rule (§6.2 b)', () => {
  const env = (s: CoachingSession) => ({ profile: normaliseProfile(profile()), session: s, history: [] })

  it('the old example (s = 17 cm, n = 14, e = 3 cm) is only "possible": shown, not coached', () => {
    const b = spreadBound(exactSpread(14, 330, 17), 3, 15)
    expect(b.sigmaLower).toBeLessThan(15)
    const d = detectItem(item('toss-height-steady'), env(tossSession(exactMad13(330, 17).concat([330]))))
    expect(d.status).toBe('possible-only')
    expect(d.severity).toBe('minor')
  })

  it('MAD effective df: n = 13, s = 19 cm does not fire (sigma_L 13.2); s = 22 cm fires (sigma_L 15.5)', () => {
    const b19 = spreadBound(exactMad13(330, 19), 4, 15)
    const b22 = spreadBound(exactMad13(330, 22), 4, 15)
    expect(b19.estimator).toBe('mad')
    expect(b19.df).toBeCloseTo(4.44, 2)
    expect(b19.sigmaLower).toBeCloseTo(13.2, 1)
    expect(b22.sigmaLower).toBeCloseTo(15.5, 1)
    expect(detectItem(item('toss-height-steady'), env(tossSession(exactMad13(330, 19)))).status).not.toBe('eligible')
    expect(detectItem(item('toss-height-steady'), env(tossSession(exactMad13(330, 22)))).status).toBe('eligible')
  })

  it('not in frame: apex unavailable on 6 of 12 serves lists the toss items as not-in-frame', () => {
    const s = tossSession(exactSpread(12, 330, 20), { outOfFrame: 6 })
    const d = detectItem(item('toss-height-steady'), env(s))
    expect(d.status).toBe('not-in-frame')
    expect(d.text).toMatch(/6 of 12/)
  })

  it('needs 12 serves from one set-up', () => {
    const d = detectItem(item('toss-height-steady'), env(tossSession(exactSpread(9, 330, 25))))
    expect(d.status).toBe('needs-more-serves')
    expect(d.text).toMatch(/needs 12/)
  })
})

// ---------- composite ball-drop rule ----------

describe('composite rule (§6.2 f)', () => {
  const dropSession = (dropMedian: number, rhythmMs: number) =>
    session({
      id: 'drop',
      startedAt: '2026-09-20T09:00:00+10:00',
      n: 12,
      metrics: {
        'toss-drop': (i) => mv('toss-drop', dropMedian + (i % 5) - 2, { half: 9 }),
        'rhythm-release-to-contact': (i) => mv('rhythm-release-to-contact', rhythmMs + (i % 3) * 10, { status: 'measured', unit: 'ms' }),
      },
    })
  const run = (sex: 'male' | 'female', drop: number, rhythm: number) =>
    detectItem(item('toss-to-reach-height'), { profile: normaliseProfile(profile({ sex })), session: dropSession(drop, rhythm), history: [] })

  it('sex-specific drop: 110 cm with one co-signal fires "possible" for a man, not for a woman', () => {
    const m = run('male', 110, 1200)
    expect(m.status).toBe('eligible')
    expect(m.wording).toBe('possible')
    expect(m.severity).toBe('moderate')
    expect(run('female', 110, 1200).status).not.toBe('eligible')
  })

  it('never on the drop alone: 160 cm with no co-signal is shown as a band, never a fault', () => {
    const d = run('male', 160, 950)
    expect(d.status).toBe('in-range')
    expect(d.text).toMatch(/not treated as a fault/)
  })
})

// ---------- legs (relative only; never on depth) ----------

const legsSession = (id: string, startedAt: string, median: number, driveMs = 330, extra: Partial<Parameters<typeof session>[0]> = {}) =>
  session({
    id,
    startedAt,
    n: 12,
    metrics: {
      'leg-drive': (i) => mv('leg-drive', median + ((i % 3) - 1) * 0.3, { half: 2, unit: '% of height' }),
      'drive-time': (i) => mv('drive-time', driveMs + (i % 3) * 5, { half: 40, unit: 'ms' }),
      'loading-depth': () => mv('loading-depth', 2, { unit: '% of height' }),
      'deep-bend-flag': () => mv('deep-bend-flag', 'no', { status: 'experimental', unit: 'yes/no' }),
    },
    ...extra,
  })

describe('legs-spring (§6.2 e, P11)', () => {
  const history = [
    legsSession('h1', '2026-09-01T09:00:00+10:00', 12),
    legsSession('h2', '2026-09-06T09:00:00+10:00', 11.5),
    legsSession('h3', '2026-09-12T09:00:00+10:00', 11.8),
  ]
  const env = (s: CoachingSession, h = history, p: Partial<CoachingProfile> = {}) => ({ profile: normaliseProfile(profile(p)), session: s, history: h })

  it('relative: best median 12%, this session 8% fires at moderate; major with drive time 80 ms longer', () => {
    const d = detectItem(item('legs-spring'), env(legsSession('now', NOW, 8)))
    expect(d.status).toBe('eligible')
    expect(d.path).toBe('relative')
    expect(d.severity).toBe('moderate')
    expect(d.pathTier).toBe('coach-recommended')
    const major = detectItem(item('legs-spring'), env(legsSession('now', NOW, 8, 420)))
    expect(major.severity).toBe('major')
  })

  it('never fires on depth: low loading depth, no deep bend and normal leg drive', () => {
    const d = detectItem(item('legs-spring'), env(legsSession('now', NOW, 11.8)))
    expect(d.status).not.toBe('eligible')
  })

  it('before 3 sessions with the toggle off: needs more sessions', () => {
    const d = detectItem(item('legs-spring'), env(legsSession('now', NOW, 4), history.slice(0, 2)))
    expect(d.status).toBe('needs-more-sessions')
  })

  it('comfort exclusion: a knee setting with a strong legs signal lists it as comfort-setting', () => {
    const d = decideFocus({ profile: profile({ comfortRegions: ['knee'] }), session: legsSession('now', NOW, 6), history, now: NOW })
    expect(d.kind === 'focus' ? d.itemId : 'keep-going').not.toBe('legs-spring')
    const checks = (d as KeepGoingDecision).checks
    expect(checks.find((c) => c.itemId === 'legs-spring')?.status).toBe('comfort-setting')
  })

  it('all excluded: every eligible item contraindicated gives keep-going with the comfort line', () => {
    const d = decideFocus({ profile: profile({ comfortRegions: ['knee'] }), session: legsSession('now', NOW, 6), history, now: NOW })
    expect(d.kind).toBe('keep-going')
    expect((d as KeepGoingDecision).comfortLine).toMatch(/comfort settings rule out/)
  })

  it('other view: a rear-view session runs no side-view item', () => {
    const s = legsSession('rear', NOW, 6, 330, { view: 'rear' })
    const d = decideFocus({ profile: profile(), session: s, history, now: NOW }) as KeepGoingDecision
    expect(d.kind).toBe('keep-going')
    for (const it of ['toss-height-steady', 'legs-spring', 'reach-up', 'clear-the-net']) expect(d.checks.find((c) => c.itemId === it)?.status).toBe('other-view')
  })
})

// ---------- contact height and kick allowances ----------

describe('per-serve rules', () => {
  const contactSession = (median: number) =>
    session({
      id: 'c',
      startedAt: NOW,
      n: 12,
      metrics: { 'contact-height-ratio': (i) => mv('contact-height-ratio', median + ((i % 3) - 1) * 0.01, { half: 0.02, unit: 'ratio-of-height' }) },
    })

  it('reach-up with a shoulder setting (or aged 60+) and no history: relative rule only, listed not coached', () => {
    const run = (p: Partial<CoachingProfile>) =>
      detectItem(item('reach-up'), { profile: normaliseProfile(profile(p)), session: contactSession(1.33), history: [] })
    expect(run({}).status).toBe('eligible')
    expect(run({ comfortRegions: ['shoulder'] }).status).toBe('comfort-setting')
    expect(run({ ageBand: '60-plus' }).status).toBe('age-rule')
  })

  it('kick allowances: toss-forward about -12 cm (upper bound) does not fire toss-behind on a kick stratum; resolved needs mean >= 0', () => {
    const s = (type?: 'kick') =>
      session({
        id: 'k',
        startedAt: NOW,
        n: 10,
        intendedType: type,
        metrics: { 'toss-forward': () => mv('toss-forward', -19, { half: 7 }) },
      })
    const env = (x: CoachingSession) => ({ profile: normaliseProfile(profile()), session: x, history: [] })
    expect(detectItem(item('toss-in-front'), env(s('kick'))).status).not.toBe('eligible')
    expect(detectItem(item('toss-in-front'), env(s())).status).toBe('eligible')
    const resolvedKick = session({ id: 'k2', startedAt: NOW, n: 10, intendedType: 'kick', metrics: { 'toss-forward': () => mv('toss-forward', 1, { half: 7 }) } })
    expect(detectItem(item('toss-in-front'), env(resolvedKick)).resolved).toBe(true)
  })
})

// ---------- outcome rules ----------

describe('outcome rules (§6.2 d)', () => {
  it('real-problem gate: 60 first serves, 52 in, 7 of 8 misses net is not eligible', () => {
    const outcomes: ServeOutcome[] = Array.from({ length: 60 }, (_, i) => (i < 52 ? 'in' : i < 59 ? 'net' : 'long'))
    const s = session({ id: 'rp', startedAt: NOW, n: 60, outcomes })
    const d = detectItem(item('clear-the-net'), { profile: normaliseProfile(profile()), session: s, history: [] })
    expect(d.status).not.toBe('eligible')
    expect(d.text).toMatch(/missed rarely/)
  })

  it('second serves: 5 of 12 in fires; a tally counts as full coverage', () => {
    const s = session({
      id: 'ss',
      startedAt: NOW,
      n: 12,
      serveNumber: 2,
      outcomes: Array.from({ length: 12 }, (_, i) => (i < 5 ? 'in' : i % 2 ? 'net' : 'long')),
    })
    const d = detectItem(item('second-serve-margin'), { profile: normaliseProfile(profile()), session: s, history: [] })
    expect(d.status).toBe('eligible')
    expect(d.playerEntered).toBe(true)
    expect(d.metric?.value.status).toBe('player-entered')
  })
})

// ---------- gates ----------

describe('gates and special decisions', () => {
  it('pain gate: body check pain or any red flag gives a referral with no drill or cue', () => {
    const pain = decide({ bodyCheck: { answer: 'pain' } })
    expect(pain.kind).toBe('referral')
    expect(JSON.stringify(pain)).not.toMatch(/"drill"|"cue"/)
    const red = decide({ bodyCheck: { answer: 'red-flag', level: 'emergency' } })
    expect(red.kind === 'referral' && red.level).toBe('emergency')
    expect(red.kind === 'referral' && red.copy.call000).toBe(true)
  })

  it('an active referral on a match night shows the referral, never the match-day card', () => {
    const d = decide({ activeReferral: 'today', matchDay: true })
    expect(d.kind).toBe('referral')
  })

  it('painFlag (unresolved) routes to stop-and-book', () => {
    const d = decide({ painFlag: true })
    expect(d.kind === 'referral' && d.level).toBe('stop-and-book')
  })

  it('under 18: not available, with no drill, cue or load text', () => {
    const d = decide({ profile: { ...MIA, ageBand: 'under-15' } })
    expect(d.kind).toBe('not-available')
    expect(JSON.stringify(d)).not.toMatch(/drill|"cue"|sessionBudget/)
  })

  it('a red flag beats the under-18 rule (red-flag copy always shows)', () => {
    const d = decide({ profile: { ...MIA, ageBand: 'under-15' }, bodyCheck: { answer: 'red-flag', level: 'today' } })
    expect(d.kind).toBe('referral')
  })

  it('capture gate: 5 usable serves, or quality poor, gives a capture fix', () => {
    const five = session({ id: 'few', startedAt: NOW, n: 8, excluded: [5, 6, 7] })
    expect(decideFocus({ profile: profile(), session: five, now: NOW }).kind).toBe('capture-fix')
    const poor = miaSession()
    poor.captureQuality = 'poor'
    poor.qualityChecks = [{ id: 'cq.toss-headroom', pass: false, severity: 'block', message: 'The toss left the frame on 7 of 12 serves.', fix: 'Move the phone back a metre.' }]
    const d = decide({ session: poor })
    expect(d.kind).toBe('capture-fix')
    expect(d.kind === 'capture-fix' && d.fix).toBe('Move the phone back a metre.')
    // The stored record keeps the reason and next step for Today and the report.
    const few = decideFocus({ profile: profile(), session: five, now: NOW })
    const rec = toCoachingRecord(few, { sessionId: 'few' })
    expect(rec.gate).toBe('too-few-serves')
    expect(rec.captureFix).toEqual({ message: 'We found 5 usable serves. Coaching needs at least 6 from one session.', fix: 'Record 12 to 15 serves from one side, with the whole toss in the picture.', usableServes: 5 })
  })

  it("coach's focus: a pinned contact-in-front beats the engine's toss pick, which goes under Also noticed", () => {
    const d = asFocus(decide({ profile: { ...MIA, pinnedFocusItemId: 'contact-in-front' } }))
    expect(d.itemId).toBe('contact-in-front')
    expect(d.pinnedByCoach).toBe(true)
    expect(d.alsoConsidered[0].itemId).toBe('toss-height-steady')
    expect(d.reasons[0].kind).toBe('pinned')
  })

  it("a pinned focus ruled out by comfort gives keep-going with the coach's focus line", () => {
    const d = decide({ profile: { ...MIA, pinnedFocusItemId: 'legs-spring' } })
    expect(d.kind).toBe('keep-going')
    expect((d as KeepGoingDecision).pinnedRuledOut).toBe(true)
  })

  it('keep going: everything inside the resolved bands lists the checks and invents no flaw', () => {
    const s = session({
      id: 'fine',
      startedAt: NOW,
      n: 16,
      outcomes: Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 'net' : 'in')),
      metrics: {
        'toss-apex-height': (i) => apex(exactSpread(16, 335, 6)[i], 1.75, { half: 7 }),
        'toss-forward': (i) => mv('toss-forward', exactSpread(16, 35, 8)[i], { half: 7 }),
        'contact-height-ratio': (i) => mv('contact-height-ratio', 1.46 + ((i % 3) - 1) * 0.01, { half: 0.03, unit: 'ratio-of-height' }),
        'contact-forward': () => mv('contact-forward', 35, { half: 8 }),
        'toss-drop': () => mv('toss-drop', 70, { half: 9 }),
      },
    })
    const d = decideFocus({ profile: profile(), session: s, now: NOW, bodyCheck: { answer: 'fine' } })
    expect(d.kind).toBe('keep-going')
    const k = d as KeepGoingDecision
    expect(k.checks.filter((c) => c.status === 'in-range').length).toBeGreaterThanOrEqual(5)
    expect(k.cue.text).toBe(getItem('keep-going')?.cues.outcome)
    expect(k.comfortLine).toBeUndefined()
  })

  it('experimental gate: the toggle on lets steady rhythm run', () => {
    const d = asFocus(decide({ profile: { ...MIA, showExperimental: true } }))
    expect(check(d, 'steady-rhythm')?.status).not.toBe('experimental-off')
  })

  it('a sore shoulder today adds the soreness line and lowers the budget to 40 with no hard serves', () => {
    const d = asFocus(decide({ bodyCheck: { answer: 'sore', regions: ['shoulder'] } }))
    expect(d.safetyNotes.join(' ')).toMatch(/go easy on your shoulder/)
    expect(d.load.sessionBudget).toBe(40)
    expect(d.load.hardServeCap).toBe(0)
  })
})

// ---------- match day ----------

describe('match day (§7.9)', () => {
  it('keeps the active cue, adds the warm-up and starts nothing new', () => {
    const exp = {
      id: 'e1',
      itemId: 'reach-up',
      faultId: 'contact-low',
      startedSessionId: 'old',
      startedAt: '2026-09-10T09:00:00+10:00',
      stratum: { view: 'side' as const, cameraSide: 'chest' as const, courtSide: 'deuce' as const, serveNumber: 1 as const, intendedType: 'unknown' as const, handedness: 'right' as const },
      cueRegister: 'analogy' as const,
      drillVariant: 'base' as const,
      retests: [],
      status: 'active' as const,
    }
    const d = decide({ matchDay: true, activeExperiment: exp })
    expect(d.kind).toBe('match-day')
    if (d.kind !== 'match-day') return
    expect(d.itemId).toBe('reach-up')
    expect(d.cue.text).toBe(getItem('reach-up')?.cues.analogy)
    expect(d.routine.maxServes).toBe(10)
    expect(d.message).toBe('No new changes today.')
  })

  it('shoulder comfort stops the warm-up after the half-effort serves', () => {
    const d = decide({ matchDay: true, profile: { ...MIA, comfortRegions: ['shoulder'] } })
    expect(d.kind === 'match-day' && d.routine.steps.length).toBe(2)
  })
})
