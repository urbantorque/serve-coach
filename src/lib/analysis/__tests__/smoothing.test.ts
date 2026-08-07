/**
 * The skeleton's render-time smoothing, checked as pure numbers.
 *
 * `SkeletonSmoother` never touches `frame.image` or `frame.world` — it takes
 * a copy of the points and hands back a steadier copy for drawing. What has
 * to hold, whatever the footage: standing-still jitter should end up
 * visibly smaller, a fast, steady motion should barely lag behind the
 * truth, and a scrub or a loop — a backwards or oversized jump in time —
 * should snap to the raw pose rather than smear a line across the screen.
 */
import type { Landmark } from '../types'
import { SkeletonSmoother } from '../../pose/smoothing'
import { assert, check, heading, note, report, within } from './harness'

const lm = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility: 1 })

/** Deterministic noise; a smoothing test that fails one run in twenty is useless. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const std = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

heading('Smoothing the skeleton for drawing only')

check('a point that is not actually moving is steadied against per-frame noise', () => {
  const rand = seeded(1)
  const smoother = new SkeletonSmoother()
  const fps = 30
  const rawXs: number[] = []
  const smoothXs: number[] = []
  for (let i = 0; i < 90; i++) {
    const t = i / fps
    const noisyX = 0.5 + (rand() - 0.5) * 0.02
    const out = smoother.frame([lm(noisyX, 0.5)], t)
    rawXs.push(noisyX)
    smoothXs.push(out[0].x)
  }
  // Skip the first handful of frames while the filter is still settling in.
  const rawStd = std(rawXs.slice(20))
  const smoothStd = std(smoothXs.slice(20))
  note(`raw std ${rawStd.toFixed(5)}, smoothed std ${smoothStd.toFixed(5)}`)
  assert(smoothStd < rawStd * 0.6, 'standing-still jitter was barely reduced')
})

check('a fast, steady swing is tracked with only a few milliseconds of lag', () => {
  const smoother = new SkeletonSmoother()
  const fps = 60
  const speed = 2.0 // frame-widths per second — a fast hitting wrist
  let out: Landmark[] = []
  let truth = 0
  const frames = 18 // 0.3s, about a racket drop into contact
  for (let i = 0; i < frames; i++) {
    const t = i / fps
    truth = 0.2 + speed * t
    out = smoother.frame([lm(truth, 0.5)], t)
  }
  const lagSeconds = Math.abs(truth - out[0].x) / speed
  note(`lag ${(lagSeconds * 1000).toFixed(1)}ms behind the true position`)
  within(lagSeconds * 1000, 0, 15, 'lag on a fast, steady motion, in milliseconds')
})

check('noise on top of a fast swing still tracks close to the true line', () => {
  const rand = seeded(3)
  const smoother = new SkeletonSmoother()
  const fps = 60
  const speed = 2.0
  const frames = 18
  let worst = 0
  for (let i = 0; i < frames; i++) {
    const t = i / fps
    const truth = 0.2 + speed * t
    const noisy = truth + (rand() - 0.5) * 0.012
    const out = smoother.frame([lm(noisy, 0.5)], t)
    worst = Math.max(worst, Math.abs(out[0].x - truth))
  }
  note(`worst deviation from the true line: ${worst.toFixed(4)}`)
  within(worst, 0, 0.05, 'deviation from the true line during a fast noisy swing')
})

check('a backwards jump in time snaps to the raw pose instead of smoothing across it', () => {
  const smoother = new SkeletonSmoother()
  smoother.frame([lm(0.2, 0.2)], 0)
  smoother.frame([lm(0.8, 0.2)], 0.033) // a big honest jump while playing forward
  const out = smoother.frame([lm(0.1, 0.9)], 0.02) // then time goes backwards — a scrub
  assert(out[0].x === 0.1 && out[0].y === 0.9, 'a scrub was smoothed instead of snapped to')
})

check('a gap of more than half a second — a loop restarting — snaps too', () => {
  const smoother = new SkeletonSmoother()
  smoother.frame([lm(0.5, 0.5)], 1.0)
  const out = smoother.frame([lm(0.1, 0.1)], 1.6)
  assert(out[0].x === 0.1 && out[0].y === 0.1, 'a loop restart was smoothed instead of snapped to')
})

check('the input landmarks are never mutated', () => {
  const smoother = new SkeletonSmoother()
  const original = lm(0.3, 0.4)
  const frozen = { ...original }
  smoother.frame([original], 0)
  smoother.frame([original], 0.02)
  assert(
    original.x === frozen.x && original.y === frozen.y,
    'the smoother mutated a landmark it was only supposed to read',
  )
})

report()
