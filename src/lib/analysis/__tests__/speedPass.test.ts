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

/** Nothing after the hit: the ball is behind the camera, out of every frame. */
const goneAt = (t: number): V => (t < 0 ? ballAt(t) : { x: 0, y: 2.6, z: -50 })
/** Struck mostly along the lens's axis, a view the reading refuses. */
const towards = flight({ x: SPEED * 0.25, y: -SPEED * 0.05, z: -SPEED * 0.95 })
const axisAt = (t: number): V => (t < 0 ? ballAt(t) : towards(t))

/** A decoder that renders the asked-for window of the asked-for (file) time. */
function fakeDecoder(factor: number, shutter: number, at: (t: number) => V = ballAt, offset = 0) {
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
      const t = ft / factor - offset
      const data = new Uint8ClampedArray(cw * ch * 4)
      const cover = new Float32Array(cw * ch)
      const steps = 24
      for (let k = 0; k < steps; k++) {
        const p = at(t + ((k + 0.5) / steps) * shutter)
        if (p.z + DIST <= 0.2) continue
        const c = project(p)
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

await check('a clip that stops just after the hit says so, and no moment is planned past where a seek reaches', async () => {
  // A seek past the end is clamped and shows the last frame again, and the timing
  // check then told the player the video carried no frame times (H45).
  const cut = { ...input(120, 4), seekableTo: (input(120, 4).contactT + 0.03) * 4 }
  const times = speedTimes(cut)
  assert(times.length > 0 && times[times.length - 1] <= cut.seekableTo + 1e-9, `planned to ${times[times.length - 1]} past ${cut.seekableTo}`)
  const dec = fakeDecoder(4, 0.5 / 120)
  const r = await readServeSpeed(cut, { width: W, height: H }, dec.readBitmaps)
  note(JSON.stringify(r))
  assert(r !== undefined && 'miss' in r && r.miss === 'clip_end', `a clip cut at the hit gave ${JSON.stringify(r)}`)
  // And a clip that runs on past the window is read as before.
  const whole = await readServeSpeed({ ...input(120, 4), seekableTo: 100 }, { width: W, height: H }, fakeDecoder(4, 0.5 / 120).readBitmaps)
  assert(whole !== undefined && 'speed' in whole, `a clip with room after the hit gave ${JSON.stringify(whole)}`)
})

await check("a clip cut short, though not so short the ball had no flight, keeps the measure's own reason", async () => {
  // Every miss on a window cut at all was said as the clip stopping at the hit,
  // a tenth of a millisecond included, in place of the advice that would have got
  // a speed (H46). Contact a second in, so the window is not clamped at the clip's
  // start, and the window cut by real seconds from 0.2 s after contact.
  const IN = 1
  const cutBy = (realFps: number, factor: number, by: number) => {
    const base = input(realFps, factor)
    const toss = base.toss && { ...base.toss, samples: base.toss.samples.map((p) => ({ ...p, t: p.t + IN })) }
    return { ...base, toss, contactT: base.contactT + IN, seekableTo: (base.contactT + IN + 0.2 - by) * factor }
  }
  for (const by of [0.0001, 0.05, 0.1, 0.15]) {
    const gone = await readServeSpeed(cutBy(120, 4, by), { width: W, height: H }, fakeDecoder(4, 0.5 / 120, goneAt, IN).readBitmaps)
    assert(gone !== undefined && 'miss' in gone && gone.miss === 'not_found', `no ball after the hit, cut ${by * 1000} ms short, gave ${JSON.stringify(gone)}`)
    const axis = await readServeSpeed(cutBy(240, 8, by), { width: W, height: H }, fakeDecoder(8, 0.5 / 240, axisAt, IN).readBitmaps)
    assert(axis !== undefined && 'miss' in axis && axis.miss === 'view', `a ball into the lens, cut ${by * 1000} ms short, gave ${JSON.stringify(axis)}`)
    const found = await readServeSpeed(cutBy(120, 4, by), { width: W, height: H }, fakeDecoder(4, 0.5 / 120, ballAt, IN).readBitmaps)
    assert(found !== undefined && 'speed' in found, `a ball in flight, cut ${by * 1000} ms short, gave ${JSON.stringify(found)}`)
  }
  // A real-time clip cut by a hair is still told to film in slow motion.
  const hair = await readServeSpeed(cutBy(30, 1, 0.0005), { width: W, height: H }, fakeDecoder(1, 0.5 / 30, ballAt, IN).readBitmaps)
  assert(hair !== undefined && 'miss' in hair && hair.miss === 'frame_rate', `a 30 fps clip cut by half a millisecond gave ${JSON.stringify(hair)}`)
  // Too little flight left to read is the clip's end: five frames after contact,
  // the fewest a free track takes, lost a findable ball at 120 a second.
  const by = Array.from({ length: 40 }, (_, k) => 0.12 + k * 0.002).find((b) => {
    const c = cutBy(120, 4, b)
    return speedTimes(c).filter((t) => t / 4 > c.contactT).length === 5
  })
  assert(by !== undefined, 'no cut left five frames after contact, so this checks nothing')
  for (const at of [ballAt, goneAt]) {
    const short = await readServeSpeed(cutBy(120, 4, by!), { width: W, height: H }, fakeDecoder(4, 0.5 / 120, at, IN).readBitmaps)
    assert(short !== undefined && ('speed' in short || short.miss === 'clip_end'), `five frames of flight gave ${JSON.stringify(short)}`)
  }
})

await check('no toss to take metres from says so, after the frame-rate gate and before any seek', async () => {
  const dec = fakeDecoder(4, 0.5 / 120)
  const r = await readServeSpeed({ ...input(120, 4), toss: undefined }, { width: W, height: H }, dec.readBitmaps)
  assert(r !== undefined && 'miss' in r && r.miss === 'no_toss', JSON.stringify(r))
  assert(dec.seeks() === 0, 'it seeked with no toss to measure against')
})

report()
