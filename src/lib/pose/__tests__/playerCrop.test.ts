/** Choosing the square the pose model reads, and mapping its answer back. */
import { CROP_PAD, choosePlayerCrop, uncrop, type PersonBox } from '../playerCrop'
import { assert, check, heading, near, report } from '../../analysis/__tests__/harness'

const W = 1280
const H = 720
const person = (x: number, y: number, h: number, w = h * 0.45): PersonBox => ({ x, y, width: w, height: h, score: 0.5 })

heading('Where the pose model looks')

check('a distant server is cropped to a padded square round every sighting', () => {
  const crop = choosePlayerCrop(
    [[person(700, 230, 215)], [person(705, 228, 220)], [person(710, 232, 212)]],
    W,
    H,
  )!
  assert(crop !== undefined, 'a 215 px player in a 1280 px frame should be cropped')
  near(crop.side, 220 * CROP_PAD, 1e-6, 'side is the tallest sighting, padded')
  assert(crop.x < 700 && crop.x + crop.side > 710 + 99, 'the square contains every sighting')
})

check('the tallest person is the server, and a partner in the background is ignored', () => {
  const crop = choosePlayerCrop(
    [
      [person(700, 230, 215), person(540, 105, 43)],
      [person(702, 231, 214), person(545, 106, 42)],
    ],
    W,
    H,
  )!
  const cx = crop.x + crop.side / 2
  assert(Math.abs(cx - (700 + 215 * 0.45 / 2)) < 5, `the crop is centred at x=${cx}, not on the server`)
})

check('somebody walking past the lens for one sample does not drag the crop', () => {
  const crop = choosePlayerCrop(
    [[person(700, 230, 215)], [person(60, 100, 600)], [person(704, 229, 216)], [person(701, 232, 214)]],
    W,
    H,
  )!
  assert(crop.x > 550, `one close passer-by moved the crop to x=${crop.x}`)
})

check('a player who already fills the frame gets no crop', () => {
  assert(
    choosePlayerCrop([[person(400, 20, 680)], [person(402, 22, 676)]], W, H) === undefined,
    'a crop was made for a player the detector could already see',
  )
})

check('fewer than two sightings, or sightings that disagree, give no crop', () => {
  assert(choosePlayerCrop([[person(700, 230, 215)], [], []], W, H) === undefined, 'one sighting was trusted')
  assert(
    choosePlayerCrop([[person(100, 230, 215)], [person(1000, 230, 215)]], W, H) === undefined,
    'two sightings a frame apart were trusted',
  )
})

check('a landmark in the crop lands back where it is in the frame', () => {
  const crop = { x: 600, y: 150, side: 330 }
  const back = uncrop({ x: 0.5, y: 0.25, z: 0.1, visibility: 0.9 }, crop, W, H)
  near(back.x, (600 + 165) / W, 1e-9, 'x')
  near(back.y, (150 + 82.5) / H, 1e-9, 'y')
  near(back.z, (0.1 * 330) / W, 1e-9, 'z follows x')
  assert(back.visibility === 0.9, 'visibility is carried through')
})

report()
