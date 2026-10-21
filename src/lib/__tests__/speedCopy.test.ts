/**
 * Every reason for no serve speed is a sentence a player can act on (N2.5).
 */
import { SPEED_MISS_LINE } from '../speedCopy'
import { cueIssues } from '../analysis/voice'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const REASONS = ['view', 'frame_rate', 'no_toss', 'timing', 'not_found', 'unsure'] as const

heading('Why there is no speed, said plainly')

check('every miss has a line, and every line is a miss', () => {
  for (const r of REASONS) assert(Boolean(SPEED_MISS_LINE[r]), `"${r}" has no line`)
  assert(Object.keys(SPEED_MISS_LINE).length === REASONS.length, 'a line exists for a reason the reader never gives')
})

check('each line passes the copy lint and carries no number', () => {
  for (const [r, line] of Object.entries(SPEED_MISS_LINE)) {
    const issues = cueIssues(line)
    assert(issues.length === 0, `${r}: "${line}": ${issues.join('; ')}`)
    assert(!/\d/.test(line), `${r} says a number: "${line}"`)
  }
})

report()
