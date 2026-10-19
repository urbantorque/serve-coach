/**
 * The lit moment pill stays on screen while a serve plays (N0.6).
 *
 * Six pills overflow a phone, so on a loop the lit one ran off the right edge
 * at contact. The caption under the row then described a pill the player could
 * not see, and the one fading out still looked lit: the model serve seemed to
 * caption the wrong moment. The caption and the pill were always one value;
 * what was wrong was where the row sat.
 */
import { scrollToShow } from '../usePillInView'
import { assert, check, heading, report } from '../../lib/analysis/__tests__/harness'

// A 343 px row (a 375 px phone less its gutters) over 520 px of pills.
const ROW = { width: 343, scrollWidth: 520 }

heading('Keeping the lit pill in view')

check('a pill already showing leaves the row where the player put it', () => {
  assert(scrollToShow({ ...ROW, scrollLeft: 0 }, { left: 0, width: 70 }) === undefined, 'moved for the first pill')
  assert(scrollToShow({ ...ROW, scrollLeft: 100 }, { left: 200, width: 80 }) === undefined, 'moved for a pill in view')
})

check('a pill off the right edge is brought in, and the row moves right', () => {
  const to = scrollToShow({ ...ROW, scrollLeft: 0 }, { left: 430, width: 80 })
  assert(to !== undefined && to > 0, `did not scroll: ${to}`)
  assert(430 >= to! && 430 + 80 <= to! + ROW.width, `contact still off screen at ${to}`)
})

check('a pill off the left edge is brought back', () => {
  const to = scrollToShow({ ...ROW, scrollLeft: 177 }, { left: 0, width: 70 })
  assert(to === 0, `left the first pill hidden: ${to}`)
})

check('the row never scrolls past either end', () => {
  const to = scrollToShow({ ...ROW, scrollLeft: 0 }, { left: 500, width: 20 })
  assert(to === ROW.scrollWidth - ROW.width, `went past the end: ${to}`)
  const back = scrollToShow({ ...ROW, scrollLeft: 177 }, { left: 10, width: 60 })
  assert(back === 0, `went before the start: ${back}`)
})

check('a pill cut in half by an edge counts as hidden', () => {
  const to = scrollToShow({ ...ROW, scrollLeft: 0 }, { left: 300, width: 80 })
  assert(to !== undefined, 'a half-shown pill was taken as in view')
})

report()
