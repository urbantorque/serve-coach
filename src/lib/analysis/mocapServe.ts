/**
 * Real serves, filmed by a phone that was never there.
 *
 * `syntheticServe.ts` builds a serve from dials, which proves the engine agrees
 * with the rig and nothing more: the rig's clean serve was posed to sit inside
 * the same bands it is then scored against. This module takes joint paths from
 * marker motion capture of real serves instead — the Bath set, see
 * `src/dev/mocap/bath.ts` — and turns them into exactly what the engine reads
 * off a video: MediaPipe-shaped image and world landmarks, sampled at a phone's
 * frame rate, seen through a pinhole camera standing where a player would prop
 * their phone.
 *
 * What it can prove: whether the engine's keyframe rules, measurements and
 * camera assumptions hold on motion a real body made, against truth taken from
 * the same joints in 3D at 180 Hz. What it cannot: anything about the pose
 * model, which is skipped entirely. Landmarks here are where the joints were,
 * plus whatever noise a test dials in, so a reading that is wrong here is
 * wrong for a reason that has nothing to do with MediaPipe.
 *
 * Court frame throughout: metres, +x towards the net, +y the server's left
 * when facing the net, +z up, z = 0 the floor.
 */
import { LM } from './geometry'
import type { Frame, Landmark } from './types'

/** The points a converted serve carries, in storage order. */
export const MOCAP_POINTS = [
  'nose',
  'leftEar',
  'rightEar',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftIndex',
  'rightIndex',
  'leftPinky',
  'rightPinky',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
  'leftHeel',
  'rightHeel',
  'leftToe',
  'rightToe',
  /** The centre of the racket head's three markers — swaps between them cannot move it. */
  'racket',
] as const

export type MocapPoint = (typeof MOCAP_POINTS)[number]

export interface MocapServe {
  id: string
  /** Capture rate, Hz. */
  rate: number
  count: number
  /** `count × MOCAP_POINTS.length × 3`, court frame, metres. */
  xyz: Float32Array
  hand: 'left' | 'right'
  outcome?: 'in' | 'out' | 'net'
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

const INDEX = Object.fromEntries(MOCAP_POINTS.map((p, i) => [p, i])) as Record<MocapPoint, number>

/** One point at one capture frame. */
export function pointAt(serve: MocapServe, point: MocapPoint, frame: number): Vec3 {
  const o = (frame * MOCAP_POINTS.length + INDEX[point]) * 3
  return { x: serve.xyz[o], y: serve.xyz[o + 1], z: serve.xyz[o + 2] }
}

/**
 * One point at any time, by Catmull-Rom between capture frames.
 *
 * Cubic rather than linear because a phone sample lands between two 5.6 ms
 * captures, and the racket hand moves up to 5 cm in that gap: a straight line
 * cuts the corner of every arc, and the corner is the peak the engine reads.
 */
export function pointAtTime(serve: MocapServe, point: MocapPoint, t: number): Vec3 {
  const f = Math.min(Math.max(t * serve.rate, 0), serve.count - 1)
  const i = Math.min(Math.floor(f), serve.count - 2)
  const u = f - i
  const p0 = pointAt(serve, point, Math.max(0, i - 1))
  const p1 = pointAt(serve, point, i)
  const p2 = pointAt(serve, point, i + 1)
  const p3 = pointAt(serve, point, Math.min(serve.count - 1, i + 2))
  const cr = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)
  return { x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), z: cr(p0.z, p1.z, p2.z, p3.z) }
}

export const durationOf = (serve: MocapServe) => (serve.count - 1) / serve.rate

/* ---------------------------------------------------------------- storage */

/**
 * A serve packed for a JSON fixture: millimetres as little-endian int16, base64.
 *
 * Int16 millimetres reach ±32 m, far past any court, and keep a position to a
 * millimetre — well inside the marker system's own accuracy.
 */
export interface PackedMocapServe {
  id: string
  rate: number
  count: number
  hand: 'left' | 'right'
  outcome?: 'in' | 'out' | 'net'
  points: readonly string[]
  mm: string
}

export function packMocap(serve: MocapServe, toBase64: (bytes: Uint8Array) => string): PackedMocapServe {
  const ints = new Int16Array(serve.xyz.length)
  for (let i = 0; i < ints.length; i++) ints[i] = Math.round(serve.xyz[i] * 1000)
  return {
    id: serve.id,
    rate: serve.rate,
    count: serve.count,
    hand: serve.hand,
    ...(serve.outcome ? { outcome: serve.outcome } : {}),
    points: MOCAP_POINTS,
    mm: toBase64(new Uint8Array(ints.buffer)),
  }
}

export function unpackMocap(packed: PackedMocapServe, fromBase64: (text: string) => Uint8Array): MocapServe {
  if (packed.points.join() !== MOCAP_POINTS.join()) throw new Error(`${packed.id}: stored with a different point list`)
  const bytes = fromBase64(packed.mm)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const xyz = new Float32Array(bytes.byteLength / 2)
  for (let i = 0; i < xyz.length; i++) xyz[i] = view.getInt16(i * 2, true) / 1000
  if (xyz.length !== packed.count * MOCAP_POINTS.length * 3) throw new Error(`${packed.id}: wrong number of values`)
  return { id: packed.id, rate: packed.rate, count: packed.count, hand: packed.hand, outcome: packed.outcome, xyz }
}

/* ----------------------------------------------------------------- camera */

/**
 * Where the phone stands, in court terms.
 *
 * `bearing` is the direction from the server to the phone, in degrees measured
 * round from the net: 0 is a phone at the net looking back, 90 the server's
 * left along the baseline — where `FilmingGuide.tsx` draws it — 180 the back
 * fence, 270 the server's right. The phone is level and aimed at the point
 * above the server's feet at its own height, as a phone propped on a bag is.
 */
export interface VirtualPhone {
  bearing: number
  /** Metres from the server's feet at the first frame. */
  distance: number
  /** Lens height, metres. */
  height: number
  /** Vertical field of view, degrees. A phone's main lens held upright is about 65. */
  fov: number
  /** Frame width over height. Upright 9:16 by default. */
  aspect: number
  fps: number
  /** Seconds of standing at the first captured pose before the motion — see `filmMocap`. */
  lead: number
  /**
   * Landmark jitter, as a fraction of frame height, with the same shape as
   * `syntheticServe`'s `noise`, `depthNoise` and `depthBias` — so an ensemble
   * written against the rig runs unchanged on real motion.
   */
  noise: number
  depthNoise: number
  depthBias: number
  seed: number
}

export const GUIDE_PHONE: VirtualPhone = {
  bearing: 90,
  distance: 4.5,
  height: 1.0,
  fov: 65,
  aspect: 9 / 16,
  fps: 30,
  lead: 0.5,
  noise: 0,
  depthNoise: 1,
  depthBias: 0,
  seed: 20251014,
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-9, Math.hypot(a.x, a.y, a.z)))
const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5)

/** Every MediaPipe landmark, from the stored points, at one instant. */
function bodyAt(serve: MocapServe, t: number): Vec3[] {
  const p = (name: MocapPoint) => pointAtTime(serve, name, t)
  const out: Vec3[] = new Array(33)
  const nose = p('nose')
  const lEar = p('leftEar')
  const rEar = p('rightEar')
  // Eyes and mouth, which the engine never measures, from the nose and ears:
  // a face is a nose in front of the line between the ears.
  const earMid = mid(lEar, rEar)
  const across = sub(lEar, rEar)
  const eyeBase = add(earMid, scale(sub(nose, earMid), 0.85))
  out[LM.nose] = nose
  out[1] = add(eyeBase, scale(across, 0.12))
  out[2] = add(eyeBase, scale(across, 0.2))
  out[3] = add(eyeBase, scale(across, 0.28))
  out[4] = sub(eyeBase, scale(across, 0.12))
  out[5] = sub(eyeBase, scale(across, 0.2))
  out[6] = sub(eyeBase, scale(across, 0.28))
  out[7] = lEar
  out[8] = rEar
  out[9] = add(nose, { x: 0, y: 0, z: -0.04 })
  out[10] = add(nose, { x: 0, y: 0, z: -0.04 })
  for (const [name, index] of [
    ['leftShoulder', LM.leftShoulder],
    ['rightShoulder', LM.rightShoulder],
    ['leftElbow', LM.leftElbow],
    ['rightElbow', LM.rightElbow],
    ['leftWrist', LM.leftWrist],
    ['rightWrist', LM.rightWrist],
    ['leftPinky', LM.leftPinky],
    ['rightPinky', LM.rightPinky],
    ['leftIndex', LM.leftIndex],
    ['rightIndex', LM.rightIndex],
    ['leftHip', LM.leftHip],
    ['rightHip', LM.rightHip],
    ['leftKnee', LM.leftKnee],
    ['rightKnee', LM.rightKnee],
    ['leftAnkle', LM.leftAnkle],
    ['rightAnkle', LM.rightAnkle],
    ['leftHeel', LM.leftHeel],
    ['rightHeel', LM.rightHeel],
    ['leftToe', LM.leftToe],
    ['rightToe', LM.rightToe],
  ] as const) {
    out[index] = p(name)
  }
  // Thumbs: beside the index knuckle, back towards the wrist — the motion
  // capture has no thumb marker, and nothing reads the thumb on its own.
  for (const side of ['left', 'right'] as const) {
    const wrist = out[side === 'left' ? LM.leftWrist : LM.rightWrist]
    const index = out[side === 'left' ? LM.leftIndex : LM.rightIndex]
    const pinky = out[side === 'left' ? LM.leftPinky : LM.rightPinky]
    out[side === 'left' ? LM.leftThumb : LM.rightThumb] = add(
      add(wrist, scale(sub(index, wrist), 0.55)),
      scale(sub(index, pinky), 0.6),
    )
  }
  return out
}

/** The server's feet at the first frame — where the phone is aimed. */
function feetAtStart(serve: MocapServe): Vec3 {
  const a = mid(pointAt(serve, 'leftAnkle', 0), pointAt(serve, 'rightAnkle', 0))
  return { x: a.x, y: a.y, z: 0 }
}

/**
 * The serve as a phone would have recorded it, landmarks and all.
 *
 * Image landmarks follow `pose/extract.ts`: x in units of frame height (aspect
 * already applied), y down from the top, visibility 1. World landmarks follow
 * MediaPipe: metres, origin at the hip centre, axes turned with the camera so
 * +x runs right across the picture, +y down and +z away from the lens.
 *
 * `lead` seconds of the first captured pose come first. The capture starts
 * with the racket already moving towards the toss, and the engine reads the
 * player's size and the camera's angle off the stance before the motion; a
 * clip filmed as `FilmingGuide.tsx` asks starts a second before the toss, so a
 * short stand at the first pose is what a phone would have caught.
 */
export function filmMocap(serve: MocapServe, phone: Partial<VirtualPhone> = {}): Frame[] {
  const cam = { ...GUIDE_PHONE, ...phone }
  const rand = seeded(cam.seed)
  const jitter = () => (cam.noise ? ((rand() + rand()) / 2 - 0.5) * 2 * cam.noise : 0)

  const target = feetAtStart(serve)
  const b = (cam.bearing * Math.PI) / 180
  // Bearing 0 is towards the net (+x) and 90 the server's left (+y).
  const toPhone = { x: Math.cos(b), y: Math.sin(b), z: 0 }
  const eye = { x: target.x + toPhone.x * cam.distance, y: target.y + toPhone.y * cam.distance, z: cam.height }
  // Camera axes in the court frame: forward into the scene, right across the
  // picture, down the picture.
  const forward = unit({ x: -toPhone.x, y: -toPhone.y, z: 0 })
  const up = { x: 0, y: 0, z: 1 }
  const right = unit(cross(forward, up))
  const down = scale(up, -1)
  const focal = 0.5 / Math.tan(((cam.fov / 2) * Math.PI) / 180)

  const duration = durationOf(serve)
  const total = cam.lead + duration
  const count = Math.floor(total * cam.fps) + 1
  const frames: Frame[] = []

  for (let i = 0; i < count; i++) {
    const t = i / cam.fps
    const body = bodyAt(serve, Math.max(0, t - cam.lead))
    const frameDepthBias = cam.depthBias ? ((rand() + rand()) / 2 - 0.5) * 2 * cam.depthBias : 0

    const image: Landmark[] = body.map((p) => {
      const rel = sub(p, eye)
      const depth = Math.max(0.05, dot(rel, forward))
      return {
        x: cam.aspect / 2 + (focal * dot(rel, right)) / depth + jitter(),
        y: 0.5 + (focal * dot(rel, down)) / depth + jitter(),
        z: 0,
        visibility: 1,
      }
    })

    const hips = mid(body[LM.leftHip], body[LM.rightHip])
    // Metres per frame-height unit at the player, so world jitter matches the
    // image jitter in size, as the rig's does.
    const toMetres = dot(sub(hips, eye), forward) / focal
    const world: Landmark[] = body.map((p) => {
      const rel = sub(p, hips)
      return {
        x: dot(rel, right) + jitter() * toMetres,
        y: dot(rel, down) + jitter() * toMetres,
        z: dot(rel, forward) + (jitter() * cam.depthNoise + frameDepthBias) * toMetres,
        visibility: 1,
      }
    })
    // MediaPipe's image z is depth relative to the hips in roughly x's units.
    for (let k = 0; k < image.length; k++) image[k].z = world[k].z / Math.max(1e-6, toMetres)

    frames.push({ index: i, t, image, world, visibility: 1 })
  }
  return frames
}

/* ------------------------------------------------------------------ truth */

/**
 * The instants that define the serve, read from the capture itself.
 *
 * In seconds on the capture's clock — `filmMocap` adds its `lead`. Each is the
 * extremum on the 180 Hz path, sharpened by a parabola through it and its
 * neighbours, which at 5.6 ms spacing is well inside a millisecond.
 *
 * Two kinds, kept apart on purpose. Four follow the engine's own definitions
 * in `phases.ts`, in 3D — so the engine against these is the error a phone and
 * its frame rate add. The rest are the events those definitions stand in for —
 * so the gap between the two kinds is what each definition costs, and no
 * camera can close it.
 */
export interface MocapTruth {
  /** Engine's contact: the racket wrist at its highest. */
  wristTop: number
  /** Engine's toss: the tossing wrist highest above its own shoulder. */
  tossPosture: number
  /** Engine's trophy: deepest knee bend, mean of both knees, before the top. */
  kneeBottom: number
  /** Engine's drop: the racket wrist lowest against its own shoulder, knee bend to contact. */
  dropPosture: number
  /** The racket head at its highest. The ball was not marked; this is the nearest stand-in for impact. */
  racketTop: number
  /** The tossing hand at its highest — just after the ball has left it. */
  tossTop: number
  /** The racket head at its lowest between the knee bend and the top: the racket drop itself. */
  racketBottom: number
}

export function heightOf(serve: MocapServe, point: MocapPoint): number[] {
  return Array.from({ length: serve.count }, (_, f) => pointAt(serve, point, f).z)
}

/** Angle at `b` in degrees, between the segments to `a` and `c`. */
export function angle3(a: Vec3, b: Vec3, c: Vec3): number {
  const u = unit(sub(a, b))
  const v = unit(sub(c, b))
  return (Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * 180) / Math.PI
}

export function kneeAngles(serve: MocapServe, frame: number): { left: number; right: number } {
  const at = (p: MocapPoint) => pointAt(serve, p, frame)
  return {
    left: angle3(at('leftHip'), at('leftKnee'), at('leftAnkle')),
    right: angle3(at('rightHip'), at('rightKnee'), at('rightAnkle')),
  }
}

function extremum(series: number[], lo: number, hi: number, sign: 1 | -1): number {
  let best = lo
  for (let i = lo; i <= hi; i++) if (sign * series[i] > sign * series[best]) best = i
  if (best <= 0 || best >= series.length - 1) return best
  const a = series[best - 1]
  const b = series[best]
  const c = series[best + 1]
  const den = a - 2 * b + c
  const shift = den === 0 ? 0 : (0.5 * (a - c)) / den
  return best + Math.max(-0.5, Math.min(0.5, shift))
}

export function mocapTruth(serve: MocapServe): MocapTruth {
  const racketArm = serve.hand
  const tossArm = racketArm === 'right' ? 'left' : 'right'
  const last = serve.count - 1
  const racket = heightOf(serve, 'racket')
  const wrist = heightOf(serve, `${racketArm}Wrist`)
  const toss = heightOf(serve, `${tossArm}Wrist`)
  const above = (w: number[], shoulder: number[]) => w.map((z, f) => z - shoulder[f])
  const wristPosture = above(wrist, heightOf(serve, `${racketArm}Shoulder`))
  const tossPosture = above(toss, heightOf(serve, `${tossArm}Shoulder`))
  const knee = Array.from({ length: serve.count }, (_, f) => {
    const k = kneeAngles(serve, f)
    return (k.left + k.right) / 2
  })
  const wristTop = extremum(wrist, 0, last, 1)
  const top = extremum(racket, 0, last, 1)
  const topFrame = Math.round(top)
  const kneeBottom = extremum(knee, 0, topFrame, -1)
  const from = Math.round(kneeBottom)
  return {
    wristTop: wristTop / serve.rate,
    tossPosture: extremum(tossPosture, 0, Math.round(wristTop), 1) / serve.rate,
    kneeBottom: kneeBottom / serve.rate,
    dropPosture: extremum(wristPosture, from, Math.round(wristTop), -1) / serve.rate,
    racketTop: top / serve.rate,
    tossTop: extremum(toss, 0, topFrame, 1) / serve.rate,
    racketBottom: extremum(racket, from, topFrame, -1) / serve.rate,
  }
}

/**
 * Whether the capture holds a finished swing.
 *
 * Two of the 42 Bath files stop before the racket comes over: its head never
 * gets half a metre above the player's nose, where every finished serve in the
 * set takes it 0.9 m or more. A serve that was never hit is no test of
 * anything the engine measures at contact.
 */
export function swingCompleted(serve: MocapServe): boolean {
  return Math.max(...heightOf(serve, 'racket')) > pointAt(serve, 'nose', 0).z + 0.5
}
