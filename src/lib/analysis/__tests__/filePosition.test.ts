/**
 * The same take reads the same wherever it sits in the file (H44).
 *
 * Every ensemble in this suite starts its file at zero, so every take had one
 * sequence of stamps. A real clip's window opens anywhere, and at exactly 30 a
 * second a span of 0.3 s or 0.05 s is a whole number of steps: floating point in
 * two stamps then chose a window's last sample or a radius sample by sample. On a
 * serve with no drop, 0.3 s decided the trophy and the drop, and a third of takes
 * read as a different serve by where they sat in the file.
 *
 * Two more ways the place in the file reached the reading, both found by the
 * second review (H45): stamps kept as float32, which an hour into a file are a
 * quarter of a millisecond apart, and windows that were exact ties at 50 samples a
 * second, the chain's and the pronation's. So the take is moved up to an hour on,
 * read at 50 too, and the chain and the leg lead are part of what must not move.
 *
 * And what levelling cannot do, held open: a real stance's lean is in the roll
 * reading, so a phone tilted off level from the side is corrected by the wrong
 * amount, or not at all.
 */
import { runEngine } from '../../../dev/mocap/engine'
import { tilt } from '../invariants'
import { filmMocap } from '../mocapServe'
import { unswapFrames } from '../swapGuard'
import type { Frame } from '../types'
import { buildServe } from '../syntheticServe'
import { DEPTH_AWARE, DEPTH_BIAS, DEPTH_MULTIPLIER, IN_PLANE, REAL_SERVES, flattenChain, realOnFile, rigOnFile, seeds } from './repeatability'
import { assert, check, heading, note, report } from './harness'

/** Everything a take read as: the keyframes, every card row, every signal, every fault named, the chain and the leg lead. */
function readingOf(frames: Frame[]): Record<string, string | number> {
  const r = runEngine(unswapFrames(frames).frames, 32)
  if (!r.ok) return { refused: r.refusal }
  const out: Record<string, string | number> = {
    keys: JSON.stringify(r.run.skel.keys),
    named: r.run.diagnosis.flaws.filter((f) => f.detected).map((f) => f.flaw).join(),
  }
  for (const m of r.run.fundamentals.flatMap((f) => f.metrics)) out[m.id] = m.value
  for (const [k, v] of Object.entries(r.run.diagnosis.signals)) out['signal ' + k] = v as number
  // The chain's own timings: the chain window is one of the three that tied at 50.
  for (const [k, v] of Object.entries(flattenChain(r.run.diagnosis.chain))) out['chain ' + k] = v
  out.legLead = JSON.stringify(r.run.diagnosis.legLead ?? null)
  return out
}

/** What differs between two readings, past the last digit a timing is kept to. */
function moved(a: Record<string, string | number>, b: Record<string, string | number>): string[] {
  return Object.keys({ ...a, ...b }).filter((key) => {
    const [x, y] = [a[key], b[key]]
    if (typeof x === 'number' && typeof y === 'number') {
      // The span ratio is kept to four places, so an exact half in the fifth flips
      // it by a step at any position; its span in ms is compared to the hundredth.
      if (key.endsWith('span_ratio')) return Math.abs(x - y) > 1.5e-4
      return Math.abs(x - y) > (key.endsWith('_ms') ? 0.01 : 1e-6 * Math.max(1, Math.abs(x)))
    }
    return x !== y
  })
}

/** The same frames, the file moved on by `k` whole frames. */
const later = (frames: Frame[], k: number, fps: number) => frames.map((f) => ({ ...f, t: f.t + k / fps }))

heading('Where in the file a serve sits')

check('the same take reads the same, keyframes, rows and faults, wherever it sits in the file', () => {
  const MODAL = { trophyKneeAngle: 170, dropBelowShoulder: -0.25 }
  const cells: [string, (seed: number, fps: number) => Frame[]][] = [
    ['the modal club serve', (seed, fps) => rigOnFile(MODAL, seed, fps)],
    ['the clean rig', (seed, fps) => rigOnFile({}, seed, fps)],
    ['a tray', (seed, fps) => rigOnFile({ palmToSky: 80, trophyForearmDrop: 0.22 }, seed, fps)],
    ['a Bath serve from the guide', (seed, fps) => realOnFile(REAL_SERVES[0], {}, seed, fps)],
    ['a Bath serve from behind', (seed, fps) => realOnFile(REAL_SERVES[2], { bearing: 180, distance: 6 }, seed, fps)],
  ]
  // Slow motion read at 50 a second, as every frame of a 2x clip at 25 fps and
  // every other frame of a 4x one are: the rate the three tied windows were tied at.
  const at50: [string, (seed: number, fps: number) => Frame[]][] = [['the clean rig, every frame', (seed, fps) => buildServe({ ...DEPTH_AWARE, seed }, fps)]]
  for (const [fps, cellsHere] of [[30, cells], [60, cells], [25, cells], [50, at50]] as const) {
    for (const [name, film] of cellsHere) {
      let differ = 0
      let pairs = 0
      for (const seed of seeds(8)) {
        const frames = film(seed, fps)
        const base = readingOf(frames)
        // Up to an hour of file before the serve.
        for (const k of [1, 7, 31, 113, 1001, 3 * 60 * fps, 60 * 60 * fps]) {
          pairs++
          const changed = moved(base, readingOf(later(frames, k, fps)))
          if (changed.length) {
            differ++
            note(`${name} at ${fps}, ${k} frames on: ${changed.join(', ')}`)
          }
        }
      }
      note(`${name} at ${fps}: ${differ} of ${pairs} moved`)
      assert(differ === 0, `${name} at ${fps} fps read differently on ${differ} of ${pairs} positions in the file`)
    }
  }
})

heading('What levelling can’t do')

check('KNOWN: from the side, a phone tilted six degrees is levelled by the stance, not the tilt', () => {
  /*
   * The roll is read off the body's own axis, and a real stance leans: from the
   * guide's placement the Bath serves read 3.2° to 5.1° on a level phone. So a
   * phone tilted one way is corrected by too much and one tilted the other way by
   * too little, and contact height moves up to 0.072 with it. The step at 4° did
   * the same. This fails the day the tilt and the lean are told apart, and STATUS
   * then loses the open item.
   */
  let worst = 0
  for (const serve of REAL_SERVES) {
    for (const degrees of [-6, 6]) {
      const level = filmMocap(serve, { fps: 30, seed: 7000, noise: IN_PLANE * 0.6, depthNoise: DEPTH_MULTIPLIER, depthBias: DEPTH_BIAS * 0.6 })
      const read = (frames: Frame[]) => {
        const r = runEngine(unswapFrames(frames).frames, 32)
        return r.ok ? r.run.fundamentals.flatMap((f) => f.metrics).find((m) => m.id === 'contactHeight')?.value : undefined
      }
      const a = read(level)
      const b = read(tilt(level, degrees))
      if (a !== undefined && b !== undefined) worst = Math.max(worst, Math.abs(a - b))
    }
  }
  note(`contact height moved up to ${worst.toFixed(3)} with the phone six degrees off`)
  assert(worst > 0.02, 'a tilted phone is now levelled to within 0.02 of contact height from the side: drop this KNOWN and the STATUS item')
})

report()
