/**
 * The struck ball's centre, from rendered pixels (N2.2).
 *
 * A ball is drawn the way a camera records it: its disc swept across the frame
 * for the length of the shutter, on a court-coloured background with sensor
 * noise, the frame before drawn the same way a frame earlier. The centre this
 * finds is held to where the ball truly was halfway through the exposure.
 */
import { struckCandidates } from '../struckBall'
import type { Bitmap } from '../ballTrack'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const W = 1280
const H = 720
/** Pixels per metre at the ball: about what a 720-line window sees at five metres. */
const PX_PER_M = 180
const BALL_R = 0.0335 * PX_PER_M

function seeded(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296)
}

/** The ball's centre at time t: launched from (300, 360) px at `speed` m/s, `deg` below level. */
const at = (t: number, speed: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: 300 + Math.cos(a) * speed * PX_PER_M * t, y: 360 + Math.sin(a) * speed * PX_PER_M * t }
}

/** One frame: the ball swept over [t, t + shutter], on noise. */
function render(t: number, shutter: number, speed: number, deg: number, rand: () => number): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4)
  const cover = new Float32Array(W * H)
  const steps = Math.max(8, Math.ceil((speed * PX_PER_M * shutter) / 0.5))
  for (let k = 0; k < steps; k++) {
    const c = at(t + ((k + 0.5) / steps) * shutter, speed, deg)
    const r = Math.ceil(BALL_R) + 1
    for (let y = Math.floor(c.y - r); y <= c.y + r; y++) {
      for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        // Area coverage of the pixel by the disc, approximated at its centre with a soft edge.
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y)
        const inside = Math.max(0, Math.min(1, BALL_R + 0.5 - d))
        cover[y * W + x] += inside / steps
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 8
    const k = Math.min(1, cover[i])
    data[i * 4] = 70 + k * 160 + n
    data[i * 4 + 1] = 95 + k * 130 + n
    data[i * 4 + 2] = 60 + k * 10 + n
    data[i * 4 + 3] = 255
  }
  return { data, width: W, height: H }
}

heading('The struck ball, found in pixels')

check('the centre sits where the ball was halfway through the exposure, round or smeared', () => {
  const rand = seeded(7)
  let worst = 0
  const rows: string[] = []
  for (const fps of [60, 120, 240]) {
    for (const share of [1, 0.5, 0.06]) {
      for (const speed of [30, 45]) {
        const shutter = share / fps
        const t = 3 / fps
        const prev = render(t - 1 / fps, shutter, speed, 8, rand)
        const now = render(t, shutter, speed, 8, rand)
        const found = struckCandidates(now, prev)
        const truth = at(t + shutter / 2, speed, 8)
        const best = found[0]
        assert(Boolean(best), `nothing found at ${fps} fps, shutter ${share}/fps, ${speed} m/s`)
        const err = Math.hypot(best.x * H - truth.x, best.y * H - truth.y)
        worst = Math.max(worst, err)
        rows.push(`${fps}fps ${share}/fps ${speed}m/s: ${err.toFixed(2)} px, elong ${best.elongation.toFixed(1)}`)
      }
    }
  }
  note(rows.join(' · '))
  assert(worst <= 1.5, `a centre was ${worst.toFixed(2)} px from the truth`)
})

check('where the ball was a frame ago isn’t reported as where it is', () => {
  const rand = seeded(9)
  const fps = 120
  const prev = render(0, 0.5 / fps, 45, 8, rand)
  const now = render(1 / fps, 0.5 / fps, 45, 8, rand)
  const found = struckCandidates(now, prev)
  const ghost = at(0.25 / fps, 45, 8)
  assert(found.every((c) => Math.hypot(c.x * H - ghost.x, c.y * H - ghost.y) > 10), 'the ball\'s old position came back as a candidate')
})

check('a still frame has nothing in it, and a first frame has no previous to compare', () => {
  const rand = seeded(11)
  const a = render(-1, 0.001, 0, 0, rand)
  const b = render(-1, 0.001, 0, 0, rand)
  assert(struckCandidates(b, a).length === 0, 'sensor noise came back as a ball')
  assert(struckCandidates(b, undefined).length === 0, 'a first frame produced candidates')
})

report()
