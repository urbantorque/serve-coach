/** Two serves played together arrive at every phase together (N4.1). */
import { PHASE_ORDER, phaseMarks, syncedFrame } from '../syncPhases'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

const quick = { ready: 0, toss: 10, trophy: 16, drop: 21, contact: 24, finish: 34 }
const slow = { ready: 0, toss: 20, trophy: 40, drop: 52, contact: 58, finish: 80 }

heading('Phase for phase')

check('at every phase mark, each serve is on its own frame for that phase', () => {
  const marks = phaseMarks()
  for (const p of PHASE_ORDER) {
    assert(Math.abs(syncedFrame(quick, marks[p]) - quick[p]) < 1e-9, `quick serve off its ${p}`)
    assert(Math.abs(syncedFrame(slow, marks[p]) - slow[p]) < 1e-9, `slow serve off its ${p}`)
  }
})

check('between phases each serve runs forward at its own pace, never backwards', () => {
  for (const serve of [quick, slow]) {
    let last = -Infinity
    for (let u = 0; u <= 1.0001; u += 0.01) {
      const f = syncedFrame(serve, u)
      assert(f >= last - 1e-9, `went backwards at ${u.toFixed(2)}`)
      last = f
    }
  }
})

check('the ends hold, and a serve missing a phase skips it', () => {
  assert(syncedFrame(quick, -1) === 0 && syncedFrame(quick, 2) === 34, 'the ends don’t hold')
  const noDrop = { ready: 0, toss: 10, trophy: 16, contact: 24, finish: 34 }
  const mid = (phaseMarks().trophy + phaseMarks().contact) / 2
  const f = syncedFrame(noDrop, mid)
  assert(f > 16 && f < 24, `a serve with no drop read ${f} between trophy and contact`)
  assert(syncedFrame({}, 0.5) === 0, 'a serve with no phases didn’t rest on its first frame')
})

report()
