/**
 * The racket hand at the knee trough (D3.5): the rig's `lateArmCock` dial,
 * read back, from every camera, and left unread when there is no knee trough.
 */
import { diagnose } from '../diagnose'
import { detectServe } from '../phases'
import { buildServe, type ServeDials } from '../syntheticServe'
import { chainDeviations, realise } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const FPS = 50
const cock = (dials: Partial<ServeDials>) => {
  const frames = buildServe(dials, FPS)
  return diagnose(frames, detectServe(frames, FPS)).armCock
}

heading('The arm at the knee trough')

check('the dial is bit-identical at zero', () => {
  const before = buildServe({}, FPS)
  const after = buildServe({ lateArmCock: 0 }, FPS)
  const same = before.every((f, i) => f.image.every((p, k) => p.x === after[i].image[k].x && p.y === after[i].image[k].y))
  assert(same, 'a zero dial moved a landmark')
})

check('a later cock reads lower, in step with the dial, from every camera', () => {
  const row = [0, 0.25, 0.5, 0.75, 1].map((late) => cock({ lateArmCock: late })!.ratio)
  note(`lateArmCock 0 → 1: ${row.join(' / ')}`)
  for (let i = 1; i < row.length; i++) assert(row[i] < row[i - 1], `a later cock read higher: ${row.join(', ')}`)
  for (const cameraYaw of [20, 45]) {
    const at = [0, 1].map((late) => cock({ lateArmCock: late, cameraYaw })!.ratio)
    assert(at[0] === row[0] && at[1] === row[4], `the camera moved the reading at ${cameraYaw}°: ${at.join(', ')}`)
  }
  // Steadier than its own span by a wide margin, on the suite's noise.
  const dev = chainDeviations(realise()).find((d) => d.id === 'arm_cock_ratio')!
  note(`deviation ${dev.sd.toFixed(4)} against a ${(row[0] - row[4]).toFixed(3)} span`)
  assert(dev.sd * 3 < row[0] - row[4], 'the reading moves as far with the camera noise as across its dial')
})

check('no knee trough, no reading: a trophy found from the arms isn’t read', () => {
  const frames = buildServe({ trophyKneeAngle: 174 }, FPS)
  const skel = detectServe(frames, FPS)
  if (skel.derivation.trophyFromArms) {
    assert(diagnose(frames, skel).armCock === undefined, 'the arm was read at a trophy placed by the arm')
  } else {
    note('rigid legs still gave a knee trough on this rig; nothing to check here')
  }
})

report()
