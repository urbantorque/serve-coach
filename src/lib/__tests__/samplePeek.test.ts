/**
 * The landing's peek at the sample report says what the sample report says (N7.6).
 */
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import { causalPlan } from '../analysis/verdict'
import { SAMPLE_PEEK } from '../samplePeek'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

heading('The landing peek')

check('the score, the first fix and its drill are the sample report\'s own', () => {
  const a = sampleAnalysis(DEMO_DIALS.example)
  const plan = causalPlan(a.triage, a.diagnosis)
  const first = plan[0] ?? a.focus
  note(`sample: ${a.overall}, "${first.title}", ${first.drill.name} (${first.drill.reps})`)
  assert(a.overall === SAMPLE_PEEK.score, `the sample scores ${a.overall}, the landing says ${SAMPLE_PEEK.score}`)
  assert(first.title === SAMPLE_PEEK.fix, `the sample's first fix is "${first.title}"`)
  assert(first.drill.name === SAMPLE_PEEK.drill, `the sample's first drill is "${first.drill.name}"`)
  assert(first.drill.reps === SAMPLE_PEEK.reps, `the sample's first drill runs "${first.drill.reps}"`)
})

report()
