/**
 * The last practice, carried to the next (W6.4): what changed from its start to
 * its end, in a line that keeps the copy rules for every row the card has.
 */
import { NEXT_TIME, lastPracticeLine, nextTimeLine } from '../sessionCopy'
import { METRICS } from '../../analysis/coaching'
import { cueIssues } from '../../analysis/voice'
import type { PracticeSession } from '../session'
import type { Drift } from '../stats'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

heading('What the last practice says about the next')

check('every row, either way, keeps the copy rules', () => {
  let lines = 0
  for (const id of Object.keys(METRICS)) {
    const [lo, hi] = METRICS[id].ideal
    for (const [early, late] of [[lo, hi], [hi, lo]]) {
      const drift: Drift = { id, early, late, gap: late - early, strength: 4, earlyServes: 6, lateServes: 6 }
      const line = nextTimeLine(drift)
      const issues = cueIssues(line)
      assert(issues.length === 0, `${id}: "${line}": ${issues.join(', ')}`)
      lines++
    }
  }
  assert(cueIssues(NEXT_TIME).length === 0, NEXT_TIME)
  note(`${lines} lines`)
})

check('nothing from an unfinished practice, or with none at all', () => {
  assert(lastPracticeLine([]) === undefined, 'a line with no practice')
  const open = { phase: 'reading', lines: [], updatedAt: 1 } as unknown as PracticeSession
  assert(lastPracticeLine([open]) === undefined, 'a line from a practice still being read')
})

report()
