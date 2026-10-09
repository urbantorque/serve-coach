/**
 * Progress by fault (D6.6), on a seeded history built by the real engine.
 */
import { FAULT_WINDOW, faultTrends } from '../progress'
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import { CLEAN_SERVE } from '../analysis/syntheticServe'
import { progressionFor } from '../analysis/progressions'
import type { Analysis } from '../analysis/types'
import type { Session } from '../storage/db'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const FAULTY = sampleAnalysis(DEMO_DIALS.injury)
// The sample serve with a clean load. The sample's own straight legs name
// `no_leg_drive` since the rig's hips follow its knees (L1.9), so it is not a
// clean history any more.
const CLEAN = sampleAnalysis({ trophyKneeAngle: CLEAN_SERVE.trophyKneeAngle })

function at(a: Analysis, i: number): Session {
  const { frames: _f, ...rest } = a
  void _f
  return { ...rest, id: `serve-f-${i}`, createdAt: i * 86_400_000 } as Session
}

heading('Each fault, across the recent serves')

check('a fault named on the older serves and not the newer reads as fewer, with its step', () => {
  const history = [...Array.from({ length: 5 }, (_, i) => at(FAULTY, i)), ...Array.from({ length: 5 }, (_, i) => at(CLEAN, 5 + i))]
  const trends = faultTrends(history, { waiters_tray: 1 })
  note(trends.map((t) => `${t.flaw} ${t.named}/${t.judged} ${t.direction}${t.step ? ` step ${t.step.at}/${t.step.of}` : ''}`).join(' · '))
  const tray = trends.find((t) => t.flaw === 'waiters_tray')
  assert(Boolean(tray), 'a fault named on five serves is missing')
  assert(tray!.named === 5 && tray!.judged === 10, `the tray counted ${tray!.named} of ${tray!.judged}`)
  assert(tray!.direction === 'fewer', `a fault that stopped being named read as ${tray!.direction}`)
  const ladder = progressionFor('waiters_tray')!
  assert(tray!.step?.at === 2 && tray!.step.of === ladder.steps.length, 'the step the player is on was not carried')
})

check('the same fault getting worse reads as more, and a clean history has nothing to list', () => {
  const worse = [...Array.from({ length: 5 }, (_, i) => at(CLEAN, i)), ...Array.from({ length: 5 }, (_, i) => at(FAULTY, 5 + i))]
  assert(faultTrends(worse).find((t) => t.flaw === 'waiters_tray')?.direction === 'more', 'a fault that began was not "more"')
  assert(faultTrends(Array.from({ length: 6 }, (_, i) => at(CLEAN, i))).length === 0, 'a clean history listed a fault')
})

check(`only the last ${FAULT_WINDOW} serves count, and a refused clip is not a clean one`, () => {
  const old = Array.from({ length: 20 }, (_, i) => at(FAULTY, i))
  const recent = Array.from({ length: FAULT_WINDOW }, (_, i) => at(CLEAN, 20 + i))
  assert(!faultTrends([...old, ...recent]).some((t) => t.flaw === 'waiters_tray'), 'serves outside the window were counted')
  const refused = { ...at(CLEAN, 40), triage: { ...CLEAN.triage!, status: 'rejected' as const, reason: 'too_blurry' as const } }
  const tray = faultTrends([at(FAULTY, 41), refused, at(FAULTY, 42)]).find((t) => t.flaw === 'waiters_tray')
  assert(tray?.judged === 2, `a refused clip was judged: ${tray?.judged}`)
})

report()
