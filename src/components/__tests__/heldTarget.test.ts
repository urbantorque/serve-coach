/**
 * The target shape on the report's held frame (B1.1, B2.1): drawn for the fix
 * the report leads with when, and only when, the card would draw one for the
 * same row; never inside the band, never on a soft reading. Off the studio it
 * sits on the picture, and the score has stepped down under the fix.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import Report from '../../screens/Report'
import { faultMetric } from '../../lib/lookFor'
import { targetDrawn } from '../../lib/analysis/targetShape'
import { linkedPlan } from '../../lib/missLinks'
import { sampleAnalysis } from '../../dev/sampleAnalysis'
import { normalise } from '../../lib/storage/db'
import type { Analysis, Metric } from '../../lib/analysis/types'
import { assert, check, heading, note, report } from '../../lib/analysis/__tests__/harness'

const noop = () => {}
/**
 * A report opened again, through the repair storage applies. A report just made
 * plays into the hold first and shows the plate once it settles, which a render
 * on the server never does; one opened again opens on the hold.
 */
const render = (a: Analysis) => {
  const { frames: _f, ...rest } = a
  void _f
  const s = normalise({ ...rest, id: `serve-${a.overall}-0` })
  assert(s !== undefined, 'normalise dropped a report the engine had just produced')
  return renderToStaticMarkup(createElement(Report, { analysis: s!, onBack: noop, onAnalyzeAnother: noop }))
}
const leadOf = (a: Analysis): Metric | undefined => {
  const plan = linkedPlan(a.triage, a.diagnosis, []).plan
  return faultMetric(a.fundamentals, (plan[0] ?? a.focus).flaw)
}

heading('The held frame carries the shape to aim for')

check('the plate is drawn exactly when the lead row would draw a target', () => {
  const cases: [string, Analysis][] = [
    ['the sample', sampleAnalysis()],
    // The sample's tossing arm comes down early and leads every report; held
    // up, the next fault leads.
    ['straight legs', sampleAnalysis({ tossArmHold: 0.72, trophyKneeAngle: 172 })],
    ['a deep squat', sampleAnalysis({ tossArmHold: 0.72, trophyKneeAngle: 70, contactHipHeight: 1.09 })],
    ['a low contact', sampleAnalysis({ tossArmHold: 0.72, trophyKneeAngle: 133, contactHipHeight: 1.09, contactReach: 1.12 })],
    ['a lower contact', sampleAnalysis({ tossArmHold: 0.72, trophyKneeAngle: 133, contactHipHeight: 1.0, contactReach: 1.0 })],
    ['a contact on bent knees', sampleAnalysis({ tossArmHold: 0.72, contactReach: 1.05 })],
    ['a flat shoulder line', sampleAnalysis({ tossArmHold: 0.72, trophyKneeAngle: 133, contactHipHeight: 1.09, shoulderTilt: 4 })],
  ]
  let drawn = 0
  for (const [name, a] of cases) {
    const lead = leadOf(a)
    const expected = !!lead && targetDrawn(lead)
    const out = render(a)
    const shown = out.includes('class="hero-plate"')
    note(`${name}: ${(linkedPlan(a.triage, a.diagnosis, []).plan[0] ?? a.focus).flaw} leads, row ${lead?.id ?? 'none'}, plate ${shown ? 'drawn' : 'withheld'}`)
    assert(shown === expected, `${name}: the plate is ${shown ? 'drawn' : 'withheld'} but the row says ${expected}`)
    if (shown) {
      drawn++
      assert(out.includes('Shape to aim for'), `${name}: the plate lost its caveat`)
    } else {
      assert(out.includes('class="hero-moment"'), `${name}: no plate, and nothing says what the picture is held on`)
    }
    // Off the picture: the score is in the tally under the fix, once.
    assert(out.includes('class="hero-tally"') && !out.includes('class="hero-numbers"'), `${name}: the score is still on the picture`)
    assert(!out.includes('class="hero-target"'), `${name}: the figure is drawn twice`)
  }
  assert(drawn >= 1, 'no case drew the plate, so this check proves nothing')
})

check('a reading inside its band, or soft, never gets a plate', () => {
  const m = {
    id: 'kneeBend',
    value: 50,
    ideal: [35, 80] as [number, number],
    confidence: 1,
    readout: 'Knees well bent',
    target: 'Knees bent over your toes',
  }
  assert(!targetDrawn(m), 'a knee bend inside its band drew a target')
  assert(!targetDrawn({ ...m, value: 20, confidence: 0.2 }), 'a soft knee bend drew a target')
  assert(!targetDrawn({ ...m, value: 20, softness: 'rough' }), 'a knee bend marked soft drew a target')
  assert(targetDrawn({ ...m, value: 20, readout: 'Knees barely bent' }), 'a confident knee bend out of its band drew no target')
  assert(!targetDrawn({ ...m, id: 'racketDrop', value: 20 }), 'a row with no shape drew a target')
})

check('under an injury warning the short picture keeps the score', () => {
  // N7.8 fitted the drill above the action bar with the number on the short
  // picture; the held frame leaves that layout as it was.
  const a = sampleAnalysis({ tossArmHold: 0.72, trophyKneeAngle: 133, contactHipHeight: 1.0, contactReach: 1.0 })
  const warned = { ...a, triage: { ...a.triage, injury_risk: [{ flag: 'wrist_strain_forced_pronation', severity: 'high' }] } } as Analysis
  const out = render(warned)
  const injured = out.includes('hero-stage--short')
  note(`an injury warning: ${injured ? 'short picture' : 'no warning drawn, case skipped'}`)
  if (!injured) return
  assert(out.includes('class="hero-numbers"') && !out.includes('class="hero-tally"'), 'the short picture lost its score')
  assert(!out.includes('class="hero-plate"'), 'a plate was drawn on the short picture')
})

report()
