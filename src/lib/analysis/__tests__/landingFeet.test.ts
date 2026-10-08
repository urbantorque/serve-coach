/**
 * The landing from each foot (D3.3): a fall across the front foot and a back
 * foot that follows, both dialled on the rig and read apart.
 */
import { diagnose } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe } from '../syntheticServe'
import { assert, check, heading, near, note, report } from './harness'

const FPS = 50
const BEHIND = 8

const feet = (landingLean: number, landingBackFootDrag: number, cameraYaw = BEHIND) => {
  const frames = buildServe({ landingLean, landingBackFootDrag, cameraYaw }, FPS)
  return diagnose(frames, detectServe(frames, FPS)).landingFeet
}

heading('The landing, from each foot')

check('the fall across the front foot tracks the lean and ignores the back foot', () => {
  for (const lean of [0, 0.06, 0.12]) {
    const row = [0, 0.5, 1].map((drag) => feet(lean, drag)!.front)
    note(`lean ${lean} m: front ${row.join(' / ')} across back-foot drag 0 / 0.5 / 1`)
    for (const v of row) near(v, row[0], 0.002, `lean ${lean} with a different back foot`)
  }
  const step = feet(0.06, 0)!.front - feet(0, 0)!.front
  near(feet(0.12, 0)!.front - feet(0.06, 0)!.front, step, 0.002, 'the second 0.06 m of lean')
  assert(step > 0.02, `0.06 m of lean read only ${step}`)
})

check('the back foot reads its own dial and ignores how far the body fell', () => {
  for (const drag of [0, 0.5, 1]) {
    const row = [0.06, 0.12].map((lean) => feet(lean, drag)!.backFollow!)
    note(`drag ${drag}: follow ${row.join(' / ')} at lean 0.06 / 0.12 m`)
    for (const v of row) near(v, drag, 0.05, `back-foot follow at drag ${drag}`)
  }
  assert(feet(0, 0.5)!.backFollow === null, 'a back foot was said to follow hips that never moved')
})

check('from the side the fall reads smaller, as the existing landing reading does', () => {
  const behind = feet(0.12, 0)!.front
  const side = feet(0.12, 0, 82)!.front
  note(`0.12 m of lean: ${behind} from behind, ${side} from the side`)
  assert(side < behind * 0.6, 'the side view read the fall as fully as from behind')
})

report()
