/**
 * What a stated level changes, and what it does not (N2.12, the handover's
 * findings 2 and 3).
 *
 * The rule: cite each band shift or leave it ungraded. So level moves no
 * target that nothing published moves, and it does move the order the faults
 * are worked in, which is cited (Whiteside 2013, Reid 2008, `faultOrder.ts`),
 * and through the order, the drill the player is sent to first.
 */
import { DEMO_DIALS, sampleAnalysis } from '../../../dev/sampleAnalysis'
import { SIGNALS, bandFor } from '../tiers'
import { ARM_FIRST_AT, hierarchyFor } from '../faultOrder'
import { assert, check, heading, note, report } from './harness'

heading('What a stated level changes')

const LEVELS = [2, 4, 6, 8]

check('the three hand-set shifts are flat: a palm, a spine and an elbow are held to one band at every level', () => {
  for (const signal of ['palm_to_sky_deg', 'spine_lean_deg', 'elbow_lift_ratio']) {
    const bands = LEVELS.map((t) => bandFor(signal, t + 1).join('..'))
    note(`${signal}: ${bands[0]} at every level`)
    assert(new Set(bands).size === 1, `${signal} still moves with level: ${bands.join(' / ')}`)
  }
})

check('every band that still moves with level rests on a study, or names no fault at all', () => {
  const moving = Object.entries(SIGNALS).filter(([id]) => bandFor(id, 3).join() !== bandFor(id, 9).join())
  for (const [id, spec] of moving) {
    const source = spec.source as Record<string, unknown>
    note(`${id} moves with level: ${Object.keys(source).join(', ')}`)
    assert('study' in source || 'unnamed' in source, `${id} moves with level on no study: ${JSON.stringify(source).slice(0, 120)}`)
  }
})

check('the order the faults are worked in moves with level, at the rung the sources put it', () => {
  const groups = (t: number) => hierarchyFor(t).map((g) => g.group)
  const low = groups(ARM_FIRST_AT)
  const high = groups(ARM_FIRST_AT + 2)
  note(`club and below: ${low.join(' > ')}; above: ${high.join(' > ')}`)
  assert(low.indexOf('drop') < low.indexOf('legs') && high.indexOf('legs') < high.indexOf('drop'), 'level doesn’t move the arm against the legs')
})

check('on a serve with both faults, a stated level changes the first fix and its drill', () => {
  // Stiff legs and a racket that never lays back, with a tossing arm that
  // holds up, so the toss, which leads at every level, is out of the way.
  const at = (tier: number) => sampleAnalysis({ ...DEMO_DIALS.example, tossArmHold: 0.9 }, tier)
  const club = at(3)
  const strong = at(7)
  note(`rung 3 fixes "${club.focus.title}" with ${club.focus.drill?.name}; rung 7 fixes "${strong.focus.title}" with ${strong.focus.drill?.name}`)
  assert(club.focus.title !== strong.focus.title, 'a still-learning and a strong club player were told the same first fix')
  assert(club.focus.drill?.name !== strong.focus.drill?.name, 'the first fix moved and the drill didn’t')
})

report()
