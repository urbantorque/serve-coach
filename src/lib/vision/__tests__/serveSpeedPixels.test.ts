/**
 * Serve speed from rendered pixels, end to end (N2.4).
 *
 * `serveSpeed.test.ts` hands the reader ball centres. This draws the frames: a
 * side-on phone five metres away, a toss that rises and falls, and the struck
 * ball leaving the toss with drag and gravity, every frame swept across its
 * shutter on a noisy court-coloured background. `struckCandidates` finds the
 * balls in those pixels, `tossPath` takes metres from the toss, and
 * `measureServeSpeed` reads the struck ball. The true launch speed has to sit
 * inside the range it states, at the frame rates slow motion films at, and 30
 * frames a second has to say so rather than guess.
 *
 * What this still is not: a court. No racket, no player, no second ball. The
 * decoys are `serveSpeed.test.ts`'s.
 */
import { struckCandidates } from '../struckBall'
import { BALL_DRAG, GRAVITY, measureServeSpeed, tossPath, type StruckFrame, type StruckSample } from '../serveSpeed'
import type { Bitmap } from '../ballTrack'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const W = 1280
const H = 720
const ASPECT = W / H
/** The long side's focal length over the long side, as `FOCAL_LONG_SIDE` assumes. */
const FOCAL = 0.8 * ASPECT
const DIST = 5
const CAM_Y = 1.2
const BALL_R = 0.0335

function seeded(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296)
}

type V = { x: number; y: number; z: number }

/** World to picture, frame heights from the top-left, x times the aspect. */
function project(p: V): { x: number; y: number; r: number } {
  const d = p.z + DIST
  return { x: ASPECT / 2 + (FOCAL * p.x) / d, y: 0.5 - (FOCAL * (p.y - CAM_Y)) / d, r: (FOCAL * BALL_R) / d }
}

/** The struck ball's flight from contact, with drag and gravity. */
function flight(v0: V): (t: number) => V {
  const dt = 1e-4
  const out: V[] = []
  let p = { x: 0, y: 2.6, z: 0 }
  let v = { ...v0 }
  for (let i = 0; i < 4000; i++) {
    out.push({ ...p })
    const s = Math.hypot(v.x, v.y, v.z)
    v = { x: v.x - BALL_DRAG * s * v.x * dt, y: v.y - (BALL_DRAG * s * v.y + GRAVITY) * dt, z: v.z - BALL_DRAG * s * v.z * dt }
    p = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt }
  }
  return (t) => out[Math.max(0, Math.min(out.length - 1, Math.round(t / dt)))]
}

/** Where the ball is at t: the toss before contact (apex half a metre up), the struck flight after. */
const ballAt = (struck: (t: number) => V) => (t: number): V =>
  t < 0 ? { x: 0, y: 2.6 + 0.5 - 0.5 * GRAVITY * (t + Math.sqrt(1 / GRAVITY)) ** 2, z: 0 } : struck(t)

/** One frame: the ball swept over [t, t + shutter], on noise. */
function render(t: number, shutter: number, where: (t: number) => V, rand: () => number): Bitmap {
  const data = new Uint8ClampedArray(W * H * 4)
  const cover = new Float32Array(W * H)
  const a = project(where(t))
  const b = project(where(t + shutter))
  const steps = Math.max(6, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * H * 2))
  for (let k = 0; k < steps; k++) {
    const c = project(where(t + ((k + 0.5) / steps) * shutter))
    const cx = c.x * H
    const cy = c.y * H
    const rr = c.r * H
    for (let y = Math.floor(cy - rr - 1); y <= cy + rr + 1; y++) {
      for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        const inside = Math.max(0, Math.min(1, rr + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)))
        cover[y * W + x] += inside / steps
      }
    }
  }
  for (let i = 0; i < W * H; i++) {
    const n = (rand() - 0.5) * 8
    const k = Math.min(1, cover[i])
    data[i * 4 + 1] = 95 + k * 130 + n
    data[i * 4 + 3] = 255
  }
  return { data, width: W, height: H }
}

/** One serve filmed at `fps`, read from its pixels. */
function film(fps: number, speed: number, depthDeg: number, seed: number) {
  const rand = seeded(seed)
  const el = (8 * Math.PI) / 180
  const psi = (depthDeg * Math.PI) / 180
  const where = ballAt(flight({ x: speed * Math.cos(el) * Math.cos(psi), y: -speed * Math.sin(el), z: speed * Math.cos(el) * Math.sin(psi) }))
  const shutter = 0.5 / fps
  const phase = rand() / fps
  const noise = 1 / H
  // The toss, read every fourth frame as the pose pass would, each against the frame before it.
  const toss: StruckSample[] = []
  for (let t = -0.9 + phase; t < -2 / fps; t += 4 / fps) {
    const found = struckCandidates(render(t, shutter, where, rand), render(t - 1 / fps, shutter, where, rand))[0]
    if (found) toss.push({ t, x: found.x, y: found.y })
  }
  const contactT = -0.004
  const fit = tossPath(toss, { noise, aspect: ASPECT, t0: contactT })
  // Every frame round contact, each against the one before.
  const frames: StruckFrame[] = []
  let previous = render(-0.06 + phase - 1 / fps, shutter, where, rand)
  for (let t = -0.06 + phase; t < 0.22; t += 1 / fps) {
    const now = render(t, shutter, where, rand)
    frames.push({ t, candidates: struckCandidates(now, previous).map((c) => ({ x: c.x, y: c.y })) })
    previous = now
  }
  const feet = project({ x: 0, y: 0, z: 0 })
  const head = project({ x: 0, y: 1.75, z: 0 })
  return measureServeSpeed(frames, { contactT, bodyHeight: feet.y - head.y, netSide: 1, aspect: ASPECT, toss: fit, noise })
}

heading('Serve speed, from rendered pixels')

check('slow motion reads the launch speed from pixels, with the truth inside its range', () => {
  const rows: string[] = []
  let read = 0
  let held = 0
  let n = 0
  for (const fps of [120, 240]) {
    for (const [speed, depth] of [[32, 0], [42, 10], [48, -12]] as const) {
      n++
      const r = film(fps, speed, depth, 100 + n)
      if (!('speed' in r)) {
        rows.push(`${fps}fps ${speed}m/s ${depth}°: ${r.miss}`)
        continue
      }
      read++
      if (speed >= r.speed.low && speed <= r.speed.high) held++
      rows.push(`${fps}fps ${speed}m/s ${depth}°: ${r.speed.ms.toFixed(1)} [${r.speed.low.toFixed(1)}–${r.speed.high.toFixed(1)}] on ${r.speed.samples}`)
    }
  }
  note(rows.join(' · '))
  assert(read >= 4, `only ${read} of ${n} rendered serves gave a speed`)
  assert(held === read, `the range missed the truth on ${read - held} of ${read}`)
})

check('thirty frames a second, rendered, says frame rate rather than a number', () => {
  const r = film(30, 42, 0, 7)
  assert('miss' in r && r.miss === 'frame_rate', `30 fps gave ${'miss' in r ? r.miss : 'a speed'}`)
})

report()
