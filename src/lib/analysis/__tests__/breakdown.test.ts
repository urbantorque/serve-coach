/**
 * Why this score (L3.10): each area's share of the overall, how far its
 * weakest row pulled it down, and which rows were left out or approximate.
 *
 * The proof the roadmap asks for: the shares add up to the overall, on every
 * serve the demos draw, and every line passes the copy lint.
 */
import { breakdownLines, scoreBreakdown } from '../breakdown'
import { DEMO_DIALS, sampleAnalysis } from '../../../dev/sampleAnalysis'
import { cueIssues } from '../voice'
import type { Fundamental } from '../types'
import { assert, check, heading, note, report } from './harness'

const SERVES = {
  default: {},
  example: DEMO_DIALS.example,
  collapsed: DEMO_DIALS.collapsed,
  'low reach': { contactReach: 1.0 },
  'driving legs': { trophyKneeAngle: 133, contactHipHeight: 1.09 },
}

heading('The shares are the overall')

check('the contributions add up to the overall, on every demo serve', () => {
  for (const [name, dials] of Object.entries(SERVES)) {
    const a = sampleAnalysis(dials)
    const parts = scoreBreakdown(a.fundamentals)
    const sum = parts.reduce((s, p) => s + p.contribution, 0)
    const shares = parts.reduce((s, p) => s + p.share, 0)
    note(`${name}: ${parts.map((p) => `${p.id} ${p.contribution.toFixed(1)}`).join(' + ')} = ${sum.toFixed(1)}, overall ${a.overall}`)
    assert(Math.round(sum) === a.overall, `${name}: the parts make ${sum.toFixed(2)}, the overall is ${a.overall}`)
    assert(Math.abs(shares - 1) < 1e-9, `${name}: the shares make ${shares}`)
  }
})

check('an area the clip couldn’t grade takes no share', () => {
  const a = sampleAnalysis(DEMO_DIALS.collapsed)
  const unmeasured = a.fundamentals.filter((f) => f.metrics.length === 0 && f.score === 0).map((f) => f.id)
  const parts = scoreBreakdown(a.fundamentals)
  note(`not measured: ${unmeasured.join(', ') || 'none'}`)
  assert(unmeasured.every((id) => !parts.some((p) => p.id === id)), 'an unmeasured area was given a share')
})

heading('The weakest row, and what was left out')

check('the pull is the weakest-link term the area score applied', () => {
  const area = {
    id: 'contact',
    score: 0,
    metrics: [
      { id: 'contactHeight', label: 'Contact height', score: 40, weight: 1, confidence: 1 },
      { id: 'armExtension', label: 'Arm extension', score: 90, weight: 1, confidence: 1 },
    ],
  } as unknown as Fundamental
  // chainScore: mean 65, worst 40 → 65 × 0.7 + 40 × 0.3 = 57.5 → 58.
  area.score = 58
  const [b] = scoreBreakdown([area])
  assert(b.weakest?.label === 'Contact height' && b.weakest.score === 40 && b.weakest.pull === 7, JSON.stringify(b.weakest))
  assert(b.dropped.length === 3, `dropped ${b.dropped.join(', ')}`)
})

check('rows this clip couldn’t grade, or read only roughly, are named', () => {
  const a = sampleAnalysis(DEMO_DIALS.collapsed)
  const swing = scoreBreakdown(a.fundamentals).find((p) => p.id === 'swing')!
  note(`swing dropped: ${swing.dropped.join(', ')}`)
  assert(swing.dropped.length > 0, 'the collapsed swing named no rows left out')
  const contact = scoreBreakdown(a.fundamentals).find((p) => p.id === 'contact')!
  assert(contact.dropped.some((l) => /ball/i.test(l) || /peak/i.test(l)), `contact dropped: ${contact.dropped.join(', ')}`)
  const soft = scoreBreakdown([
    { id: 'toss', score: 70, metrics: [{ id: 'releaseHeight', label: 'Release height', score: 70, weight: 1, confidence: 0.4 }] },
  ] as unknown as Fundamental[])[0]
  assert(soft.approximate[0] === 'Release height', 'an approximate row wasn’t named')
})

heading('In the player\'s words')

check('every line passes the copy lint', () => {
  for (const [name, dials] of Object.entries(SERVES)) {
    for (const b of scoreBreakdown(sampleAnalysis(dials).fundamentals)) {
      for (const line of breakdownLines(b)) {
        const issues = cueIssues(line)
        assert(issues.length === 0, `${name}, ${b.id}: "${line}" — ${issues.join('; ')}`)
      }
    }
  }
  note(breakdownLines(scoreBreakdown(sampleAnalysis(DEMO_DIALS.example).fundamentals)[0]).join(' / '))
})

report()
