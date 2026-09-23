/** The timestamps the pose graph is told, and why they must be true. */
import { CLOCK_BREAK_MS, advanceClock, type VideoClock } from '../poseEngine'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const fresh = (): VideoClock => ({ offset: 0, last: 0 })

heading('The pose graph is told when each frame really was')

check('frames a pass reads are stamped their real spacing, not 33 ms each', () => {
  const c = fresh()
  const stamps = [1.0, 1.083, 1.167].map((t) => advanceClock(c, t))
  assert(stamps[1] - stamps[0] === 83 && stamps[2] - stamps[1] === 84, `stamps ${stamps.join(', ')}`)
})

check('a new pass that seeks back lands after a break, never before the last stamp', () => {
  const c = fresh()
  const end = advanceClock(c, 4.2)
  const restart = advanceClock(c, 1.5)
  assert(restart === end + CLOCK_BREAK_MS, `restart ${restart} after ${end}`)
  const next = advanceClock(c, 1.531)
  assert(next - restart === 31, `the pass after the break kept its own spacing: ${next - restart}`)
})

check('stamps are whole, strictly increasing milliseconds', () => {
  const c = fresh()
  const a = advanceClock(c, 2.0)
  const b = advanceClock(c, 2.0002)
  assert(Number.isInteger(a) && Number.isInteger(b) && b > a, `${a} then ${b}`)
})

check('with no media time the live viewfinder keeps its fixed step', () => {
  const c = fresh()
  const a = advanceClock(c)
  const b = advanceClock(c)
  assert(b - a === 33, `step ${b - a}`)
})

report()
