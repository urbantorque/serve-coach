/**
 * A report a coach can open: self-contained, scriptless, linking nowhere (M3.2).
 */
import { coachReportHtml } from '../coachReport'
import { sampleAnalysis } from '../../../dev/sampleAnalysis'
import { causalPlan } from '../../analysis/verdict'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const analysis = sampleAnalysis()
const plan = causalPlan(analysis.triage, analysis.diagnosis)
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const html = coachReportHtml(analysis, plan, [
  { label: 'Trophy', src: pixel },
  { label: 'Evil', src: 'https://example.com/x.png' },
])

heading('A report a coach can open')

check('no script and nothing that leaves the file', () => {
  assert(!/<script/i.test(html), 'a script in the file')
  assert(!/\son\w+=/i.test(html), 'an inline event handler')
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1])
  assert(refs.length > 0, 'no stills were drawn in, so this checks nothing')
  assert(refs.every((r) => r.startsWith('data:')), `a reference leaves the file: ${refs.filter((r) => !r.startsWith('data:')).join(', ')}`)
  assert(!html.includes('example.com'), 'a still with a remote source was kept')
})

check('it carries the plan, the drills, and every measurement against its band', () => {
  assert(plan.length > 0, 'the sample ranked nothing, so this checks nothing')
  for (const p of plan) {
    assert(html.includes(p.drill.name.replace(/&/g, '&amp;').replace(/'/g, '&#39;')), `the drill ${p.drill.name} is missing`)
  }
  const metrics = analysis.fundamentals.flatMap((f) => f.metrics)
  assert((html.match(/<tr><td>/g) ?? []).length === metrics.length, 'a measurement row is missing')
  assert(!html.includes('**'), 'a bold marker leaked into the text')
})

check('text from the report is escaped, so it cannot become markup', () => {
  const evil = coachReportHtml(analysis, [{ title: '<img src=x onerror=alert(1)>', why: 'w', drill: { name: 'd', how: 'h', reps: 'r' } }], [])
  assert(!evil.includes('<img src=x'), 'markup in a title reached the page')
})

report()
