/**
 * The hitch at the trophy (D3.4): a pause and a slow tempo dialled together on
 * the rig, kept apart at 60 fps and above, and refused below.
 */
import { readHitch } from '../hitch'
import { detectServe } from '../phases'
import { buildServe } from '../syntheticServe'
import { filmMocap } from '../mocapServe'
import { REAL_SERVES } from './repeatability'
import { assert, check, heading, note, report } from './harness'

const share = (motionSeconds: number, trophyHitchSeconds: number, fps: number, seed: number) => {
  const frames = buildServe({ motionSeconds, trophyHitchSeconds, noise: 0.006, depthNoise: 4, depthBias: 0.006, seed }, fps)
  return readHitch(frames, detectServe(frames, fps))?.share
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

heading('A pause at the trophy, not a slow serve')

check('a hitch reads apart from no hitch at every tempo, at 60 and 120 fps', () => {
  for (const fps of [60, 120]) {
    for (const motionSeconds of [1.0, 1.35, 2.0]) {
      const seeds = [1, 2, 3, 4, 5, 6].map((s) => s * 977)
      const none = seeds.map((s) => share(motionSeconds, 0, fps, s)!)
      const short = seeds.map((s) => share(motionSeconds, 0.15, fps, s)!)
      const long = seeds.map((s) => share(motionSeconds, 0.3, fps, s)!)
      note(`${fps} fps, ${motionSeconds} s serve: no hitch ${median(none)}, 0.15 s ${median(short)}, 0.3 s ${median(long)}`)
      assert(median(none) < 0.06, `a ${motionSeconds} s serve with no hitch read ${median(none)} at ${fps} fps`)
      assert(median(short) > 0.1, `a 0.15 s hitch read only ${median(short)} at ${fps} fps`)
      assert(Math.max(...none) < Math.min(...long), `no hitch and a 0.3 s hitch overlapped at ${fps} fps`)
    }
  }
})

check('below 60 fps there is no reading', () => {
  const frames = buildServe({ trophyHitchSeconds: 0.3 }, 30)
  assert(readHitch(frames, detectServe(frames, 30)) === undefined, 'a hitch was read at 30 fps')
})

check('real serves flow through the trophy', () => {
  const shares = REAL_SERVES.map((s) => {
    const frames = filmMocap(s, { fps: 60 })
    return readHitch(frames, detectServe(frames, 60))!.share
  })
  note(`Bath at 60 fps: ${shares.join(' / ')}`)
  assert(shares.every((v) => v < 0.03), `a real serve read as hitched: ${shares.join(', ')}`)
})

report()
