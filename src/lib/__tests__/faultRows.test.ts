/**
 * The words beside a fault row on Progress (E2.2): the recent window against
 * the drill check's mark, held to the voice lint, and never a claimed pass.
 */
import { faultRowLine } from '../faultRows'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

heading('A fault row says how near the drill check it is, and claims no pass (E2.2)')

check('the line counts the recent window against the ladder’s mark', () => {
  const near = faultRowLine(2, 6, 4, 'same')
  const there = faultRowLine(5, 6, 4, 'fewer')
  const short = faultRowLine(1, 2, 4, 'same')
  note(`${near} | ${there} | ${short}`)
  assert(near === 'Gone on 2 of your last 6. A drill check needs 4.', near)
  assert(there.includes('enough for a drill check') && !/pass/i.test(there), `a row claimed a pass: ${there}`)
  assert(!short.includes('needs'), 'a window shorter than a check was held to its mark')
  for (const l of [near, there, short]) assert(cueIssues(l).length === 0, `${l}: ${cueIssues(l).join(', ')}`)
})

report()
