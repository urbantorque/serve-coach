/**
 * The order the body fires in (D3.8): legs, then the elbow, then the hand —
 * swapped on the rig with `lateLegDrive`, held under noise, and read on real
 * serve motion.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server.browser'
import FiringTimeline from '../../../components/FiringTimeline'
import { diagnose } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { filmMocap } from '../mocapServe'
import { REAL_SERVES, seeds } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const read = (dials: Partial<ServeDials>, fps: number) => {
  const frames = buildServe(dials, fps)
  return diagnose(frames, detectServe(frames, fps))
}

heading('The order the body fires in')

check('legs late enough to follow the elbow are read as out of order, and a clean serve is not', () => {
  for (const fps of [60, 120]) {
    const row = [0, 0.5, 1].map((lateLegDrive) => read({ lateLegDrive }, fps))
    note(`${fps} fps: legs at ${row.map((d) => d.chain.legs.ms).join(' / ')} ms, elbow at ${row.map((d) => d.chain.elbow.ms).join(' / ')}`)
    assert(row[0].firingOrder?.inOrder === true, `${fps} fps: a clean serve read as out of order`)
    assert(row[2].firingOrder?.inOrder === false && row[2].firingOrder.late === 'legs', `${fps} fps: legs after the arm went unread`)
  }
})

check('tracker noise never puts a clean serve out of order', () => {
  const wrong = seeds(24).filter((seed) => read({ noise: 0.006, depthNoise: 4, depthBias: 0.006, seed }, 60).firingOrder?.inOrder === false)
  note(`${wrong.length} of 24 noisy clean serves out of order`)
  assert(wrong.length === 0, `${wrong.length} clean serves were called out of order`)
})

check('below 60 fps the order is not read', () => {
  assert(read({ lateLegDrive: 1 }, 30).firingOrder === undefined, 'the order was read at 30 fps')
})

check('the real serves fire in order', () => {
  const orders = REAL_SERVES.map((s) => {
    const frames = filmMocap(s, { fps: 60 })
    return diagnose(frames, detectServe(frames, 60)).firingOrder
  })
  // A serve whose chain lost a link is not read at all, which is the honest
  // answer; every one that was read must be in order.
  const seen = orders.filter((o) => o !== undefined)
  note(`${seen.length} of ${orders.length} real serves read`)
  assert(seen.length >= 5, `only ${seen.length} real serves could be read`)
  assert(seen.every((o) => o!.inOrder), `a real serve read out of order: ${JSON.stringify(orders)}`)
})

check('the timeline names every link it draws and says the order in words', () => {
  const d = read({ lateLegDrive: 1 }, 60)
  const html = renderToStaticMarkup(createElement(FiringTimeline, { chain: d.chain, order: d.firingOrder! }))
  for (const label of ['Legs', 'Trunk', 'Elbow', 'Hand']) assert(html.includes(`>${label}</text>`), `no ${label} label`)
  assert(html.includes('before your legs had finished'), 'the out-of-order case was not said')
})

report()
