/**
 * Your frame beside the model's, and what to look for at each moment (L4.6).
 *
 * The marks are only ever band membership, so the test recomputes membership
 * from the rows themselves and holds every tick, cross and check to it. The
 * model is the clean serve on the player's own side, which the left-handed
 * check holds to the hand that is up at contact.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import { LOOK_FOR, faultMoment, momentChecks, momentMark } from '../lookFor'
import { modelServe } from '../faultDemo'
import { modelFrameAt } from '../demoDraw'
import MomentPair from '../../components/MomentPair'
import Report from '../../screens/Report'
import { DEMO_DIALS, sampleAnalysis } from '../../dev/sampleAnalysis'
import { causalPlan } from '../analysis/verdict'
import { SOFT_MEASUREMENT } from '../analysis/confidence'
import { LM } from '../analysis/geometry'
import { cueIssues } from '../analysis/voice'
import { filmstripPoses } from '../storage/poseTrack'
import type { Analysis, PhaseId } from '../analysis/types'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

const PHASES: PhaseId[] = ['ready', 'toss', 'trophy', 'drop', 'contact', 'finish']
const ANALYSES: [string, Analysis][] = [
  ['default', sampleAnalysis()],
  ...Object.entries(DEMO_DIALS).map(([name, dials]) => [name, sampleAnalysis(dials)] as [string, Analysis]),
]

heading('Ticks are band membership, and nothing else')

check('every moment is ticked when its confident readings are all in band, crossed when one is not', () => {
  let ticks = 0
  let crosses = 0
  for (const [name, a] of ANALYSES) {
    for (const phase of PHASES) {
      const rows = a.fundamentals.flatMap((f) => f.metrics).filter((m) => m.phase === phase && !(m.confidence < SOFT_MEASUREMENT))
      const want = rows.length === 0 ? undefined : rows.every((m) => m.value >= m.ideal[0] && m.value <= m.ideal[1]) ? 'tick' : 'cross'
      const got = momentMark(a.fundamentals, phase)
      assert(got === want, `${name} ${phase}: marked ${got}, the bands say ${want}`)
      if (got === 'tick') ticks++
      if (got === 'cross') crosses++
    }
  }
  note(`${ticks} ticks and ${crosses} crosses across ${ANALYSES.length} reports`)
  assert(ticks > 0 && crosses > 0, 'the fixtures never showed both marks')
})

check('each check is a reading from its own moment, ticked by its own band, off-target first, at most three', () => {
  for (const [name, a] of ANALYSES) {
    for (const phase of PHASES) {
      const checks = momentChecks(a.fundamentals, phase)
      assert(checks.length <= 3, `${name} ${phase}: ${checks.length} checks`)
      for (const c of checks) {
        const m = a.fundamentals.flatMap((f) => f.metrics).find((x) => x.id === c.id)!
        assert(m.phase === phase, `${name}: ${c.id} is not read at ${phase}`)
        assert(c.inBand === (m.value >= m.ideal[0] && m.value <= m.ideal[1]), `${name}: ${c.id} ticked against its band`)
        assert(!(m.confidence < SOFT_MEASUREMENT), `${name}: a hedged reading was ticked`)
      }
      const firstIn = checks.findIndex((c) => c.inBand)
      assert(firstIn < 0 || checks.slice(firstIn).every((c) => c.inBand), `${name} ${phase}: an off-target reading came after an on-target one`)
    }
  }
})

check('the top fault is shown at the moment its own row is read', () => {
  const a = sampleAnalysis(DEMO_DIALS.example)
  const plan = causalPlan(a.triage, a.diagnosis)
  const moment = faultMoment(a.fundamentals, plan[0].flaw)
  note(`${plan[0].flaw} shows at the ${moment}`)
  assert(plan[0].flaw === 'shallow_drop' && moment === 'drop', `the drop showed at ${moment}`)
  assert(faultMoment(a.fundamentals, undefined) === undefined, 'a moment for no fault')
})

check('what to look for passes the copy rules', () => {
  for (const [phase, line] of Object.entries(LOOK_FOR)) {
    const issues = cueIssues(line)
    assert(issues.length === 0, `${phase}: "${line}" — ${issues.join('; ')}`)
  }
})

heading('The model beside you, on your side')

check('a left-hander sees the model swing with the left arm, a right-hander with the right', () => {
  for (const racket of ['right', 'left'] as const) {
    const frame = modelFrameAt(modelServe(racket)!, 'contact')!
    const up = frame.image[LM.rightWrist].y < frame.image[LM.leftWrist].y ? 'right' : 'left'
    assert(up === racket, `${racket}-hander: the model hits with the ${up} hand`)
    assert(frame.racket !== undefined, `${racket}: the model holds no racket`)
  }
})

check('the pair renders the player beside the model, with its checks', () => {
  const a = sampleAnalysis(DEMO_DIALS.example)
  const checks = momentChecks(a.fundamentals, 'drop')
  const html = renderToStaticMarkup(
    createElement(MomentPair, {
      poses: filmstripPoses(a),
      index: a.phases.findIndex((p) => p.id === 'drop'),
      phase: 'drop',
      label: 'Racket drop',
      racket: 'left',
      checks,
      model: modelServe('left')!,
    }),
  )
  assert(html.includes('Your racket drop beside the model’s'), 'the pair has no title')
  assert(html.includes('aria-label="Your racket drop, as the tracked body"'), 'the player half is missing')
  assert(html.includes('aria-label="The model serve&#x27;s racket drop"'), 'the model half is missing')
  for (const c of checks) assert(html.includes(c.label), `${c.label} is not listed`)
  // And nothing at all where the report keeps no poses.
  const bare = renderToStaticMarkup(
    createElement(MomentPair, { poses: undefined, index: 0, phase: 'drop', label: 'Racket drop', racket: 'right', checks }),
  )
  assert(bare === '', 'a pair with no player half was drawn')
})

check('the report sets the pair in the top fix, and every moment says what to look for', () => {
  const a = sampleAnalysis(DEMO_DIALS.example)
  const html = renderToStaticMarkup(createElement(Report, { analysis: a, onBack: () => {}, onAnalyzeAnother: () => {} }))
  const focus = html.slice(html.indexOf('class="focus"'), html.indexOf('class="focus-drill"'))
  assert(focus.includes('Your racket drop beside the model’s'), 'the pair is not in the top fix')
  const escaped = (s: string) => s.replace(/'/g, '&#x27;')
  for (const phase of PHASES) assert(html.includes(escaped(LOOK_FOR[phase])), `${phase} does not say what to look for`)
  const marks = (html.match(/strip-mark--(tick|cross)/g) ?? []).length
  const expected = PHASES.filter((p) => momentMark(a.fundamentals, p) !== undefined).length
  assert(marks === expected, `${marks} marks on the strip, ${expected} moments with a reading`)
})

report()
