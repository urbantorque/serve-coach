/**
 * The serve speed pass in the engine (N2.1).
 *
 * The decoder is faked: `readBitmaps` here renders the window the pass asks
 * for, at the size it asks for, at each time it asks for — a toss and a struck
 * ball from a side-on phone, with drag. The pass has to find the ball in those
 * pixels, map it back to the whole frame and read the true speed inside its
 * range, and it has to answer a real-time clip without a single seek.
 */
import { readServeSpeed, speedTimes, speedWindow, SPEED_BUDGET_MS } from '../speedPass'
import { BALL_DRAG, GRAVITY } from '../../vision/serveSpeed'
import type { BallFlight } from '../../vision/ballTrack'
import { assert, check, heading, note, report } from './harness'

const W = 1280
const H = 720
const ASPECT = W / H
const FOCAL = 0.8 * ASPECT
const DIST = 5
const CAM_Y = 1.2
const BALL_R = 0.0335
type V = { x: number; y: number; z: number }

const project = (p: V) => {
  const d = p.z + DIST
  return { x: ASPECT / 2 + (FOCAL * p.x) / d, y: 0.5 - (FOCAL * (p.y - CAM_Y)) / d, r: (FOCAL * BALL_R) / d }
}

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

const SPEED = 42
const el = (8 * Math.PI) / 180
const struck = flight({ x: SPEED * Math.cos(el), y: -SPEED * Math.sin(el), z: 0 })
/** Real time; impact at 0. */
const ballAt = (t: number): V => (t < 0 ? { x: 0, y: 3.1 - 0.5 * GRAVITY * (t + Math.sqrt(1 / GRAVITY)) ** 2, z: 0 } : struck(t))

/** A decoder that renders the asked-for window of the asked-for (file) time. */
function fakeDecoder(factor: number, shutter: number) {
  let seeks = 0
  const readBitmaps = async <T,>(
    times: number[],
    read: (frame: ImageData, previous: ImageData | undefined, t: number) => T,
    opts: { maxWidth?: number; region?: { x: number; y: number; w: number; h: number } },
  ): Promise<T[]> => {
    const r = opts.region ?? { x: 0, y: 0, w: W, h: H }
    const scale = Math.min(1, (opts.maxWidth ?? r.w) / r.w)
    const cw = Math.round(r.w * scale)
    const ch = Math.round(r.h * scale)
    const out: T[] = []
    let previous: ImageData | undefined
    for (const ft of times) {
      seeks++
      const t = ft / factor
      const data = new Uint8ClampedArray(cw * ch * 4)
      const cover = new Float32Array(cw * ch)
      const steps = 24
      for (let k = 0; k < steps; k++) {
        const c = project(ballAt(t + ((k + 0.5) / steps) * shutter))
        const cx = (c.x * H - r.x) * scale
        const cy = (c.y * H - r.y) * scale
        const rr = c.r * H * scale
        for (let y = Math.floor(cy - rr - 1); y <= cy + rr + 1; y++) {
          for (let x = Math.floor(cx - rr - 1); x <= cx + rr + 1; x++) {
            if (x < 0 || y < 0 || x >= cw || y >= ch) continue
            cover[y * cw + x] += Math.max(0, Math.min(1, rr + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy))) / steps
          }
        }
      }
      for (let i = 0; i < cw * ch; i++) {
        data[i * 4 + 1] = 95 + Math.min(1, cover[i]) * 130
        data[i * 4 + 3] = 255
      }
      const frame = { data, width: cw, height: ch, colorSpace: 'srgb' } as ImageData
      out.push(read(frame, previous, ft))
      previous = frame
    }
    return out
  }
  return { readBitmaps, seeks: () => seeks }
}

/** The toss as the ball finder hands it over: real time, fractions of width and height. */
function tossFlight(): BallFlight {
  const samples = []
  for (let t = -0.85; t < -0.02; t += 1 / 30) {
    const p = project(ballAt(t))
    samples.push({ t, x: p.x / ASPECT, y: p.y })
  }
  return { coefficients: [0, 0, 0], apex: { t: -0.32, x: 0.5, y: 0.3 }, samples, confidence: 1 }
}

const contact = project({ x: 0, y: 2.6, z: 0 })
const feet = project({ x: 0, y: 0, z: 0 })
const head = project({ x: 0, y: 1.75, z: 0 })
const input = (realFps: number, factor: number) => ({
  realFps,
  factor,
  contactT: -0.004,
  contactAt: { x: contact.x, y: contact.y },
  bodyHeight: feet.y - head.y,
  netSide: 1 as const,
  toss: tossFlight(),
})

heading('The serve speed pass, in the engine')

await check('a clip too slow for even a pinned track is answered frame rate without a single seek', async () => {
  const dec = fakeDecoder(1, 0.5 / 20)
  const r = await readServeSpeed(input(20, 1), { width: W, height: H }, dec.readBitmaps)
  assert(r !== undefined && 'miss' in r && r.miss === 'frame_rate', `20 fps gave ${JSON.stringify(r)}`)
  assert(dec.seeks() === 0, `${dec.seeks()} seeks on a clip that could never give a speed`)
})

check('the window is the net side of contact, and the times every native frame round it', () => {
  const w = speedWindow(input(240, 8), { width: W, height: H })
  assert(w.x < contact.x * H && w.x + w.w === W, 'the window does not run from behind contact to the net-side edge')
  // Contact a second in, so the window is not clamped at the clip's start.
  const times = speedTimes({ ...input(240, 8), contactT: 1 })
  const step = times[1] - times[0]
  assert(Math.abs(step - 1 / 30) < 1e-9, `a stretched 240 fps clip read every ${step} s of file, not every frame`)
  assert(Math.abs(times.length - Math.round(0.24 * 240)) <= 2, `${times.length} frames for a quarter second at 240`)
})

await check('slow motion, read from the pixels the pass asked for, holds the true speed inside its range', async () => {
  const dec = fakeDecoder(4, 0.5 / 120)
  const r = await readServeSpeed(input(120, 4), { width: W, height: H }, dec.readBitmaps)
  note(JSON.stringify(r))
  assert(r !== undefined && 'speed' in r, `no speed: ${JSON.stringify(r)}`)
  if (r && 'speed' in r) assert(SPEED >= r.speed.low && SPEED <= r.speed.high, `${SPEED} outside ${r.speed.low.toFixed(1)}–${r.speed.high.toFixed(1)}`)
  assert(SPEED_BUDGET_MS > 0, 'no time budget')
})

await check('no toss to take metres from says so, after the frame-rate gate and before any seek', async () => {
  const dec = fakeDecoder(4, 0.5 / 120)
  const r = await readServeSpeed({ ...input(120, 4), toss: undefined }, { width: W, height: H }, dec.readBitmaps)
  assert(r !== undefined && 'miss' in r && r.miss === 'no_toss', JSON.stringify(r))
  assert(dec.seeks() === 0, 'it seeked with no toss to measure against')
})

report()
