/**
 * The toss's path, read in seconds (H36), and what happens when the tracker lost
 * part of the lift (H44).
 *
 * The window is a fixed time before the release. A hole the tracker left and
 * nobody bridged closes up in the frames, so the window could hold two or three
 * samples, and those read as a perfect toss at full confidence. And the card
 * priced its confidence over the frames after the release, not the lift it read.
 */
import { runEngine } from '../../../dev/mocap/engine'
import { LM } from '../geometry'
import { bridgeDetectionGaps } from '../kalman'
import { SOFT_MEASUREMENT } from '../softness'
import { unswapFrames } from '../swapGuard'
import { tossLiftStart, tossPathSpread } from '../tossPath'
import type { Frame } from '../types'
import { REAL_SERVES, realOnFile, rigOnFile, seeds } from './repeatability'
import { assert, check, heading, near, note, report } from './harness'

const read = (frames: Frame[]) => {
  const r = runEngine(unswapFrames(frames).frames, 32)
  if (!r.ok) return undefined
  const row = r.run.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'tossPathWobble')
  return { row, signal: r.run.diagnosis.signals.toss_drift_ratio, named: r.run.diagnosis.flaws.some((f) => f.flaw === 'toss_drift' && f.detected), run: r.run }
}

/** The same take with `n` samples gone, ending `before` samples ahead of the release, as the tracker would leave it. */
function holed(frames: Frame[], toss: number, n: number, before = 1): Frame[] {
  const last = toss - before
  return bridgeDetectionGaps(
    frames.map((f, i) => ({ t: f.t, pose: i > last - n && i <= last ? null : { image: f.image, world: f.world } })),
  )
}

heading('A lift the tracker did not see')

check('a lift with a hole in it is no reading, not a perfect toss', () => {
  let named = 0
  let read5 = 0
  for (const seed of seeds(12)) {
    const frames = rigOnFile({ tossWobble: 0.15 }, seed, 30)
    const whole = read(frames)!
    if (whole.named) named++
    const toss = whole.run.skel.keys.toss
    for (const n of [5, 7]) {
      const r = read(holed(frames, toss, n))
      if (!r) continue
      read5++
      assert(r.row === undefined, `a hole of ${n} samples read the toss path as ${r.row?.value}`)
      assert(r.signal === undefined, `a hole of ${n} samples still gave a drift of ${r.signal}`)
    }
  }
  note(`the wandering toss named on ${named} of 12 whole takes; ${read5} holed takes, none read`)
  assert(named >= 10, 'the wandering toss was not named on the whole takes')
})

check('a hole the tracker bridged is still read, along the time it covers', () => {
  // Two missed samples are bridged, and the line the spread is taken about is
  // drawn in time, so the bridge does not read as a bend.
  for (const seed of seeds(6)) {
    const frames = rigOnFile({ tossWobble: 0.15 }, seed, 30)
    const whole = read(frames)!
    const r = read(holed(frames, whole.run.skel.keys.toss, 2))
    assert(r?.row !== undefined && r.named, 'a bridged hole lost the reading')
  }
})

check('two samples, or half the window, are no reading', () => {
  const frames = rigOnFile({}, 7000, 30)
  const r = read(frames)!
  const toss = r.run.skel.keys.toss
  const wrist = r.run.skel.racket === 'left' ? LM.rightWrist : LM.leftWrist
  assert(tossPathSpread(frames, toss - 1, toss, wrist, r.run.skel.bodyHeight) === null, 'two samples were a reading')
  assert(tossPathSpread(frames, toss - 3, toss, wrist, r.run.skel.bodyHeight) === null, 'a tenth of a second was a reading')
  assert(tossPathSpread(frames, tossLiftStart(frames, toss, r.run.skel.keys.ready), toss, wrist, r.run.skel.bodyHeight) !== null, 'the whole window was no reading')
})

heading('One window, priced where it is read')

/** The same take with the tossing wrist barely seen from `from` to `to`. */
function dimmed(frames: Frame[], wrist: number, from: number, to: number): Frame[] {
  return frames.map((f, i) =>
    i < from || i > to ? f : { ...f, image: f.image.map((p, k) => (k === wrist ? { ...p, visibility: 0.05 } : p)) },
  )
}

check('a lift nobody saw hedges the card, and an arm lost after the release does not', () => {
  for (const [name, frames] of [
    ['the rig', rigOnFile({ tossWobble: 0.15 }, 7000, 30)],
    ['a Bath serve from behind', realOnFile(REAL_SERVES[0], { bearing: 180, distance: 6 }, 7000, 30)],
  ] as const) {
    const base = read(frames)!
    const { keys, racket } = base.run.skel
    const wrist = racket === 'left' ? LM.rightWrist : LM.leftWrist
    const from = tossLiftStart(base.run.frames, keys.toss, keys.ready)
    const lift = read(dimmed(frames, wrist, from, keys.toss))
    const after = read(dimmed(frames, wrist, keys.toss + 1, keys.contact))
    const conf = (r: typeof base | undefined) => r?.row?.confidence ?? 0
    note(`${name}: ${conf(base).toFixed(2)} seen, ${conf(lift).toFixed(2)} with the lift unseen, ${conf(after).toFixed(2)} with the arm unseen after`)
    assert(lift?.row === undefined || conf(lift) < SOFT_MEASUREMENT, `${name}: an unseen lift was not hedged`)
    near(conf(after), conf(base), 0.05, `${name}: an arm unseen after the release moved the toss path's confidence`)
  }
})

report()
