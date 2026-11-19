/**
 * Today on court, in minutes (N1.6).
 */
import { COURT_MINUTES, WARM_LINE, courtPlan } from '../courtPlan'
import type { WeekPlan } from '../weekPlan'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const item = (name: string) => ({ title: name, drill: { name, how: 'x', reps: '15 tosses' }, check: 'x' })
const week = (n: number) => ({ from: {}, items: Array.from({ length: n }, (_, i) => item(`Drill ${i + 1}`)), graduated: [] }) as unknown as WeekPlan

heading("Today's plan")

check('every length adds up to itself, for one, two and three drills and for none', () => {
  for (const m of COURT_MINUTES) {
    for (const n of [0, 1, 2, 3]) {
      const blocks = courtPlan(n ? week(n) : undefined, m)
      const total = blocks.reduce((s, b) => s + b.minutes, 0)
      assert(total === m, `${m} minutes with ${n} drills added to ${total}`)
      assert(blocks.every((b) => b.minutes > 0), `${m} minutes with ${n} drills has an empty block`)
    }
  }
})

check('the first drill, the cause, gets the most time, and a check of six follows the drills', () => {
  const blocks = courtPlan(week(3), 45)
  const drills = blocks.filter((b) => b.kind === 'drill')
  assert(drills.length === 3, `${drills.length} drill blocks`)
  assert(drills[0].minutes >= drills[1].minutes && drills[1].minutes >= drills[2].minutes, `drill minutes ${drills.map((d) => d.minutes).join(', ')}`)
  const kinds = blocks.map((b) => b.kind)
  assert(kinds.indexOf('check') > kinds.lastIndexOf('drill'), 'the check came before the drills')
  assert(blocks.find((b) => b.kind === 'check')!.line.includes('6'), 'the check did not say six')
})

check('with nothing to work on, it says to serve and film one', () => {
  const blocks = courtPlan(undefined, 30)
  assert(blocks.map((b) => b.kind).join() === 'warm,free', blocks.map((b) => b.kind).join())
})

check('a throwing drill runs once, and its spare time goes to free serves (N7.3)', () => {
  const throws = { title: 'Throw', drill: { name: 'Overhead throws', how: 'x', reps: '10 throws' }, check: 'x' }
  for (const m of COURT_MINUTES) {
    const blocks = courtPlan({ from: {}, items: [throws, item('Drill 2')], graduated: [] } as unknown as WeekPlan, m)
    const throwing = blocks.find((b) => b.line.startsWith('Overhead throws'))!
    assert(throwing.minutes <= 3, `${m} minutes gave the throws ${throwing.minutes}`)
    assert(/once\.$/.test(throwing.line) && !/repeat/.test(throwing.line), `"${throwing.line}"`)
    assert(blocks.reduce((s, b) => s + b.minutes, 0) === m, `${m} minutes did not add up`)
  }
})

check('the warm-up loosens the arm before the first serve (N7.3)', () => {
  assert(courtPlan(week(1), 30)[0].line === WARM_LINE, 'the warm-up line moved')
  assert(/arms?\b/.test(WARM_LINE) && /shadow/.test(WARM_LINE), WARM_LINE)
})

check('every line passes the copy lint', () => {
  for (const b of courtPlan(week(3), 60)) {
    const issues = cueIssues(b.line)
    assert(issues.length === 0, `"${b.line}": ${issues.join('; ')}`)
  }
})

report()
