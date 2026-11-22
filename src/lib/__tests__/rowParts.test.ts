/**
 * A fix led by a card row paints the part that row measures on the held frame
 * (W6.4), from the same vocabulary a named fault's part is painted in.
 */
import { rowParts, workParts } from '../figure/swing'
import { METRICS } from '../analysis/coaching'
import { FLAWS } from '../analysis/flaws'
import { assert, check, heading, note, report } from '../analysis/__tests__/harness'

/** Rows about timing: no single part to point at. */
const TIMING = new Set(['dropToContact', 'loadRatio'])

heading('Every card row points at a part, or is a timing')

check('each row of the card paints a part, except the two timings', () => {
  const none: string[] = []
  for (const id of Object.keys(METRICS)) {
    const parts = rowParts(id, 'right')
    if (TIMING.has(id)) assert(parts.length === 0, `${id} is a timing and painted ${parts.join(', ')}`)
    else if (!parts.length) none.push(id)
  }
  assert(none.length === 0, `rows with no part: ${none.join(', ')}`)
  note(`${Object.keys(METRICS).length} rows, ${TIMING.size} timings`)
})

check('the parts are the ones a named fault paints, and a left-hander’s are their own', () => {
  const vocabulary = new Set(FLAWS.flatMap((f) => [...workParts(f.flaw, 'right'), ...workParts(f.flaw, 'left')]))
  for (const id of Object.keys(METRICS)) for (const p of rowParts(id, 'right')) assert(vocabulary.has(p), `${id}: "${p}" is no part a fault paints`)
  assert(rowParts('elbowAtDrop', 'left').every((p) => p.startsWith('left-')), 'a left-hander was painted on the right arm')
})

report()
