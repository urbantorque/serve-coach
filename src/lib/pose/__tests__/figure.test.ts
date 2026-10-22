/**
 * The player drawn as well as the model (N4.1): fitted to the body with its
 * proportions kept, and the joints the tracker was unsure of drawn faded.
 */
import { fitBody, splitBones } from '../skeleton'
import type { Frame } from '../../analysis/types'
import { assert, check, heading, report } from '../../analysis/__tests__/harness'

/** A standing body two-fifths of a 16:9 frame tall, its shoulders 0.08 frame heights apart. */
const ASPECT = 16 / 9
const frame = (vis = 1): Frame => {
  const image = Array.from({ length: 33 }, () => ({ x: 0.9, y: 0.5, z: 0, visibility: vis }))
  image[0] = { x: 0.9, y: 0.3, z: 0, visibility: vis } // nose
  image[11] = { x: 0.86, y: 0.36, z: 0, visibility: vis }
  image[12] = { x: 0.94, y: 0.36, z: 0, visibility: vis }
  image[27] = { x: 0.88, y: 0.7, z: 0, visibility: vis } // ankles
  image[28] = { x: 0.92, y: 0.7, z: 0, visibility: vis }
  return { index: 0, t: 0, image, world: [], visibility: vis }
}

/** Where the renderer puts a landmark for a rect: the same mapping as `drawSkeleton`. */
const at = (r: ReturnType<typeof fitBody>, p: { x: number; y: number }) => ({ x: r.ox + (p.x / ASPECT) * r.dw, y: r.oy + p.y * r.dh })

heading('The player drawn as well as the model')

check('fitted to the body, the figure fills its tile instead of floating in it', () => {
  const f = frame()
  const r = fitBody(f, ASPECT, 300, 400)
  const top = at(r, f.image[0]).y
  const bottom = at(r, f.image[27]).y
  assert((bottom - top) / 400 >= 0.7, `the body fills ${(((bottom - top) / 400) * 100).toFixed(0)}% of the tile`)
})

check('one scale both ways, so a 16:9 body is not squashed sideways', () => {
  const f = frame()
  const r = fitBody(f, ASPECT, 300, 400)
  const across = at(r, f.image[12]).x - at(r, f.image[11]).x
  const down = at(r, f.image[27]).y - at(r, f.image[11]).y
  const truth = (f.image[12].x - f.image[11].x) / (f.image[27].y - f.image[11].y)
  assert(Math.abs(across / down - truth) < 1e-9, `drawn ${(across / down).toFixed(3)} against ${truth.toFixed(3)}`)
})

check('a bone with an unsure end is set apart to be drawn faded; a sure one is not', () => {
  const f = frame()
  f.image[13] = { ...f.image[13], visibility: 0.2 }
  const bones = [[11, 13, 1, 1], [11, 12, 1, 1]] as const
  const { sure, unsure } = splitBones(f, bones)
  assert(unsure.length === 1 && unsure[0][1] === 13, 'the bone to an unsure elbow was not set apart')
  assert(sure.length === 1 && sure[0][1] === 12, 'a seen bone was faded')
  assert(splitBones(frame(1), bones).unsure.length === 0, 'a fully seen body had unsure bones')
})

report()
