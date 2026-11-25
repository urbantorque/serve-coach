/**
 * Where the toss went from the front foot (D3.1): the rig's ball dialled
 * forward and sideways, read from the side and from behind, with the ball and
 * without it.
 */
import { diagnose } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe, rigBall, type RigToss } from '../syntheticServe'
import { readTossPlacement } from '../tossPlacement'
import { assert, check, heading, near, note, report } from './harness'

const FPS = 50
const SIDE = 82
const BEHIND = 8

function placed(toss: RigToss, cameraYaw: number, view: 'side' | 'front-back' | 'angled', noise = 0) {
  const dials = { cameraYaw, noise, seed: 5 }
  const frames = buildServe(dials, FPS)
  return readTossPlacement(frames, detectServe(frames, FPS), view, rigBall(frames, toss, dials))
}

heading('The toss against the front foot')

check('from the side, how far in front is read, in step with the dial', () => {
  const row = [0, 0.2, 0.4, 0.6].map((forward) => placed({ forward, sideways: 0 }, SIDE, 'side')!)
  note(`forward 0 / 0.2 / 0.4 / 0.6 m → ${row.map((r) => r.ahead).join(' / ')}`)
  for (const r of row) assert(r.from === 'ball' && r.ahead !== undefined && r.across === undefined, 'not read ahead, from the ball')
  // Linear: each 0.2 m adds the same.
  const steps = row.slice(1).map((r, i) => r.ahead! - row[i].ahead!)
  for (const s of steps) near(s, steps[0], 0.004, 'each 0.2 m step')
  assert(steps[0] > 0.1, `0.2 m forward moved the reading only ${steps[0]}`)
})

check('from behind, how far to the hitting side is read, and the front-back axis barely leaks', () => {
  const row = [0, 0.2, 0.4].map((sideways) => placed({ forward: 0.3, sideways }, BEHIND, 'front-back')!)
  note(`sideways 0 / 0.2 / 0.4 m → ${row.map((r) => r.across).join(' / ')}`)
  for (const r of row) assert(r.across !== undefined && r.ahead === undefined, 'not read across from behind')
  assert(row[1].across! > row[0].across! && row[2].across! > row[1].across!, 'the hitting side read the wrong way')
  // A toss 0.3 m forward reads only its 8° of camera-off-square across.
  assert(Math.abs(row[0].across!) < 0.04, `a forward toss leaked ${row[0].across} across`)
})

check('from a corner, neither is read', () => {
  assert(placed({ forward: 0.3, sideways: 0 }, 45, 'angled') === undefined, 'a corner camera read a toss placement')
})

check('tracker noise moves the reading far less than a toss moves it', () => {
  const clean = placed({ forward: 0.4, sideways: 0 }, SIDE, 'side')!.ahead!
  const noisy = placed({ forward: 0.4, sideways: 0 }, SIDE, 'side', 0.006)!.ahead!
  note(`clean ${clean}, noisy ${noisy}`)
  near(noisy, clean, 0.03, 'the same toss with tracker noise')
})

check('without a ball the hand stands in, and says so at half the confidence', () => {
  const frames = buildServe({}, FPS)
  const skel = detectServe(frames, FPS)
  const hand = readTossPlacement(frames, skel, 'side')
  note(JSON.stringify(hand))
  assert(hand?.from === 'hand' && hand.confidence === 0.5, 'the hand fallback didn’t say what it was')
  // And the diagnosis carries it.
  assert(diagnose(frames, skel).tossPlacement?.from === 'hand', 'the diagnosis didn’t carry the placement')
})

report()
