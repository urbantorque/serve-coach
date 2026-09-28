// Finding 44 (D2; PRODUCT §4.2 rule 6; COACHING §5.1, §13): experimental data never picks the focus.
// With "Experimental metrics" off an experimental check is listed "experimental-off"; with it on, the
// check can show under "Also noticed" (marked experimental), but it never becomes the focus, an
// experiment or a verdict, and never interrupts an experiment. The Profile, Metric info, report and
// How we measure copy says "never used for your focus"; these tests pin that promise.
import { describe, expect, it } from 'vitest'
import { decideFocus, EXPERIMENTAL_NOTICED } from './decide.ts'
import { detectItem } from './detect.ts'
import { item } from './library.ts'
import { normaliseProfile } from './profile.ts'
import { apex, exactSpread, mv, profile, session, type SeriesSpec } from './testkit.ts'
import type { CoachingDecision, CoachingProfile, KeepGoingDecision } from './types.ts'

const NOW = '2026-09-27T10:00:00+10:00'

/** A 16-serve side-view session with every non-experimental check inside its resolved band. */
function fine(extra: SeriesSpec, id = 'fine') {
  return session({
    id,
    startedAt: NOW,
    n: 16,
    outcomes: Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 'net' : 'in')),
    metrics: {
      'toss-apex-height': (i) => apex(exactSpread(16, 335, 6)[i], 1.75, { half: 7 }),
      'toss-forward': (i) => mv('toss-forward', exactSpread(16, 35, 8)[i], { half: 7 }),
      'contact-height-ratio': (i) => mv('contact-height-ratio', 1.46 + ((i % 3) - 1) * 0.01, { half: 0.03, unit: 'ratio-of-height' }),
      'contact-forward': () => mv('contact-forward', 35, { half: 8 }),
      'toss-drop': () => mv('toss-drop', 70, { half: 9 }),
      ...extra,
    },
  })
}

const run = (extra: SeriesSpec, p: Partial<CoachingProfile>): CoachingDecision =>
  decideFocus({ profile: profile(p), session: fine(extra), now: NOW, bodyCheck: { answer: 'fine' } })

const focusId = (d: CoachingDecision) => (d.kind === 'focus' ? d.itemId : undefined)
const checkOf = (d: CoachingDecision, id: string) => (d.kind === 'focus' || d.kind === 'keep-going' ? (d as KeepGoingDecision).checks.find((c) => c.itemId === id) : undefined)

const CASES: { itemId: string; extra: SeriesSpec; p?: Partial<CoachingProfile> }[] = [
  // A long trophy pause (trophy-pause is experimental).
  { itemId: 'flowing-motion', extra: { 'trophy-pause': () => mv('trophy-pause', 900, { status: 'experimental', half: 60, unit: 'ms' }) } },
  // A wide rhythm spread: the item's coaching rule is experimental (no club-player thresholds).
  {
    itemId: 'steady-rhythm',
    extra: { 'rhythm-release-to-contact': (i) => mv('rhythm-release-to-contact', exactSpread(16, 950, 160)[i], { status: 'measured', half: 20, unit: 'ms' }) },
  },
  // Shoulders level at the top on nearly every serve (a player-relative band, experimental tier).
  {
    itemId: 'shoulder-tilt',
    extra: { 'shoulder-tilt-trophy': () => mv('shoulder-tilt-trophy', 'low', { status: 'estimated', unit: 'band', band: 'low', bandProbabilities: { low: 0.95 } as never, confidence: 0.95 }) },
  },
]

describe('experimental data never picks the focus, toggle or not (finding 44)', () => {
  for (const c of CASES) {
    it(`${c.itemId}: the detection fires with the toggle on, yet it is never the focus`, () => {
      // The rule itself fires on this session with the toggle on (so the test is not vacuous)...
      const on = normaliseProfile(profile({ showExperimental: true, ...c.p }))
      const det = detectItem(item(c.itemId), { profile: on, session: fine(c.extra), history: [] })
      expect(det.status).toBe('eligible')
      expect(det.pathTier).toBe('experimental')
      // ...toggle off: listed as switched off; toggle on: noticed, marked, never the focus.
      const off = run(c.extra, { ...c.p, showExperimental: false })
      expect(focusId(off)).not.toBe(c.itemId)
      expect(checkOf(off, c.itemId)?.status).toBe('experimental-off')
      const withToggle = run(c.extra, { ...c.p, showExperimental: true })
      expect(focusId(withToggle)).not.toBe(c.itemId)
      expect(checkOf(withToggle, c.itemId)?.status).toBe('eligible')
      expect(checkOf(withToggle, c.itemId)?.text).toContain(EXPERIMENTAL_NOTICED)
    })
  }

  it('with only experimental checks firing, the toggle on still gives "keep going"', () => {
    const extra = Object.assign({}, ...CASES.map((c) => c.extra)) as SeriesSpec
    expect(run(extra, { showExperimental: false }).kind).toBe('keep-going')
    expect(run(extra, { showExperimental: true }).kind).toBe('keep-going')
  })

  it('legs: the population path (experimental) never sets the focus, even with the toggle on', () => {
    const extra: SeriesSpec = { 'leg-drive': (i) => mv('leg-drive', 3 + (i % 3) * 0.2, { half: 1, unit: '% of height' }) }
    const on = normaliseProfile(profile({ showExperimental: true }))
    const det = detectItem(item('legs-spring'), { profile: on, session: fine(extra), history: [] })
    expect(det.status).toBe('eligible')
    expect(det.path).toBe('population')
    expect(det.pathTier).toBe('experimental')
    expect(focusId(run(extra, { showExperimental: true }))).not.toBe('legs-spring')
  })

  it('toss so you don\'t wait: a trophy pause alone never tips the rule into a focus', () => {
    // A high drop (above the high edge, below "likely") with no firm co-signal: only the long,
    // experimental trophy pause would make it "possible".
    const extra: SeriesSpec = {
      'toss-drop': (i) => mv('toss-drop', exactSpread(16, 138, 3)[i], { half: 5 }),
      'trophy-pause': () => mv('trophy-pause', 900, { status: 'experimental', half: 60, unit: 'ms' }),
    }
    const off = normaliseProfile(profile({ showExperimental: false }))
    const on = normaliseProfile(profile({ showExperimental: true }))
    expect(detectItem(item('toss-to-reach-height'), { profile: off, session: fine(extra), history: [] }).status).not.toBe('eligible')
    const d = detectItem(item('toss-to-reach-height'), { profile: on, session: fine(extra), history: [] })
    expect(d.coSignals).toContain('trophy-pause')
    expect(d.status).toBe('eligible')
    expect(d.pathTier).toBe('experimental')
    expect(focusId(run(extra, { showExperimental: true }))).not.toBe('toss-to-reach-height')
  })
})
