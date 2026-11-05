/**
 * The body's shapes, from landmarks: where the figure's limbs, trunk and head
 * sit on a canvas, with no drawing in this file.
 *
 * The app's main image used to be a wireframe: a few sticks through the joints.
 * It said what the tracker saw and nothing else, so a player's own serve looked
 * like a diagram of somebody. This gives the same landmarks a body. Every limb
 * still runs through the joints it was measured from. What is added is only
 * mass: how wide a thigh or a forearm is on an adult of this height. Nothing
 * moves a joint, so nothing here can flatter a position or change an angle.
 *
 * Pure, so a test can hold it to those promises without a canvas.
 */
import { LM, sided, type Side } from '../analysis/geometry'

export interface Pt {
  x: number
  y: number
}

/** Landmarks already placed on the canvas, by MediaPipe index. */
export type Placed = readonly Pt[]

export type PartId = 'farArm' | 'farLeg' | 'torso' | 'nearLeg' | 'head' | 'nearArm'

/** One solid: its outline, and the line across it the light is read along. */
export interface Solid {
  id: string
  outline: Pt[]
  /** From the shaded edge to the lit edge, across the solid's width. */
  across: [Pt, Pt]
  /** How squarely this solid faces the light, 0 to 1. */
  facing: number
  /** The joints it runs between, where it has two. */
  axis: [Pt, Pt]
}

export interface Shapes {
  /** One percent of the body's height, in canvas units. */
  u: number
  parts: { id: PartId; solids: Solid[] }[]
  head: { centre: Pt; rx: number; ry: number; angle: number }
  /** Where the feet meet the floor, for the shadow. */
  floor: { centre: Pt; rx: number }
}

/** MediaPipe's ears, which `LM` has no use for: nothing is measured from them. */
const EAR = { left: 7, right: 8 } as const

/** The two knuckles and the foot of one side. */
const ends = (side: Side) => ({
  index: side === 'left' ? LM.leftIndex : LM.rightIndex,
  pinky: side === 'left' ? LM.leftPinky : LM.rightPinky,
  heel: side === 'left' ? LM.leftHeel : LM.rightHeel,
  toe: side === 'left' ? LM.leftToe : LM.rightToe,
})

/** Which way the light comes from: up and to the left, as the court wash does. */
export const LIGHT: Pt = { x: -0.62, y: -0.78 }

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const mix = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const len = (a: Pt) => Math.hypot(a.x, a.y)
const unit = (a: Pt): Pt => {
  const l = len(a)
  return l < 1e-6 ? { x: 0, y: -1 } : { x: a.x / l, y: a.y / l }
}
const normal = (a: Pt): Pt => ({ x: -a.y, y: a.x })

/**
 * How tall this body is on the canvas, in canvas units.
 *
 * Read from whichever of the trunk, the leg or the arm is least foreshortened
 * in this frame, so a body turned towards the lens does not shrink. A player
 * passes the largest of these over a whole clip, so the figure holds one size
 * as it moves.
 */
export function statureOf(p: Placed): number {
  const d = (a: number, b: number) => len(sub(p[a], p[b]))
  const shoulders = mix(p[LM.leftShoulder], p[LM.rightShoulder], 0.5)
  const hips = mix(p[LM.leftHip], p[LM.rightHip], 0.5)
  const trunk = len(sub(shoulders, hips)) / 0.3
  const legL = (d(LM.leftHip, LM.leftKnee) + d(LM.leftKnee, LM.leftAnkle)) / 0.49
  const legR = (d(LM.rightHip, LM.rightKnee) + d(LM.rightKnee, LM.rightAnkle)) / 0.49
  const armL = (d(LM.leftShoulder, LM.leftElbow) + d(LM.leftElbow, LM.leftWrist)) / 0.34
  const armR = (d(LM.rightShoulder, LM.rightElbow) + d(LM.rightElbow, LM.rightWrist)) / 0.34
  return Math.max(trunk, legL, legR, armL, armR)
}

/**
 * A limb segment's outline: a rounded taper from `a` to `b`.
 *
 * `belly` swells it part-way along, and `lean` pushes the swell to one side, so
 * a calf sits behind the shin and a thigh in front of the femur. Sampled finely
 * enough to look like a curve once a spline is run through it.
 */
function taper(a: Pt, b: Pt, ra: number, rb: number, belly = 0, at = 0.4, lean = 0): { outline: Pt[]; n: Pt } {
  const dir = unit(sub(b, a))
  const n = normal(dir)
  const left: Pt[] = []
  const right: Pt[] = []
  const steps = 7
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const swell = belly * Math.exp(-((t - at) ** 2) / 0.09)
    const r = ra + (rb - ra) * t
    const p = mix(a, b, t)
    left.push(add(p, mul(n, r + swell * (1 + lean))))
    right.push(add(p, mul(n, -(r + swell * (1 - lean)))))
  }
  const capB = add(b, mul(dir, rb * 1.05))
  const capA = add(a, mul(dir, -ra * 1.05))
  return { outline: [...left, capB, ...right.reverse(), capA], n }
}

/** The solid's lighting: the line from its dark edge to its lit one. */
function lit(a: Pt, b: Pt, n: Pt, r: number): { across: [Pt, Pt]; facing: number } {
  const m = mix(a, b, 0.5)
  const d = dot(n, LIGHT)
  const towards = d >= 0 ? n : mul(n, -1)
  return { across: [add(m, mul(towards, -r)), add(m, mul(towards, r))], facing: Math.abs(d) }
}

function limb(id: string, a: Pt, b: Pt, ra: number, rb: number, belly = 0, at = 0.4, lean = 0): Solid {
  const { outline, n } = taper(a, b, ra, rb, belly, at, lean)
  return { id, outline, axis: [a, b], ...lit(a, b, n, Math.max(ra, rb) + Math.abs(belly)) }
}

/**
 * The trunk: an outline round the spine, wide where the shoulders and hips are
 * and narrower at the waist.
 *
 * A trunk seen from the side has its shoulders one behind the other, and two
 * lines through them would close to nothing. So a width comes from the trunk's
 * own depth, and grows with however far apart the camera sees the shoulders and
 * hips: thin side-on is still a chest.
 */
function trunkOf(p: Placed, u: number, facing: number): { solid: Solid; top: Pt } {
  const ls = p[LM.leftShoulder]
  const rs = p[LM.rightShoulder]
  const lh = p[LM.leftHip]
  const rh = p[LM.rightHip]
  const top = mix(ls, rs, 0.5)
  const base = mix(lh, rh, 0.5)
  const spine = unit(sub(top, base))
  const n = normal(spine)
  const spanTop = Math.abs(dot(sub(ls, rs), n)) / 2
  const spanBase = Math.abs(dot(sub(lh, rh), n)) / 2
  // Along the spine, half-thickness side-on, the share of the shoulders' and
  // the hips' spread that applies there, and how far forward the section sits.
  const sections: [number, number, number, number, number][] = [
    [-0.12, 5.0, 0, 0.92, -0.2],
    [0.03, 6.6, 0, 1.0, -0.9],
    [0.2, 6.2, 0, 0.92, -0.7],
    [0.42, 5.3, 0.3, 0.42, 0.2],
    [0.64, 6.2, 0.62, 0, 1.0],
    [0.84, 6.9, 0.76, 0, 1.0],
    [1.0, 5.8, 0.82, 0, 0.1],
    [1.1, 3.4, 0.34, 0, 0],
  ]
  const right: Pt[] = []
  const left: Pt[] = []
  // Which way along the normal the chest lies.
  const front = (facing >= 0 ? 1 : -1) * (n.x >= 0 ? 1 : -1)
  for (const [t, depth, fromTop, fromBase, fwd] of sections) {
    const spread = fromTop * spanTop + fromBase * spanBase
    const d = depth * u
    const w = (d ** 3 + (spread > 0 ? spread + 1.4 * u : 0) ** 3) ** (1 / 3)
    const centre = add(mix(base, top, t), mul(n, fwd * u * front))
    right.push(add(centre, mul(n, w)))
    left.push(add(centre, mul(n, -w)))
  }
  return { solid: { id: 'torso', outline: [...right, ...left.reverse()], axis: [base, top], ...lit(base, top, n, 13 * u) }, top }
}

/**
 * Which side of the body is nearer the lens.
 *
 * From world depth where the frame has it. A stored swing keeps only the image,
 * and there the way the player faces decides: somebody facing right across the
 * picture shows the camera their right side.
 */
export function nearSide(p: Placed, world?: readonly { z: number }[]): Side {
  if (world && world.length > LM.rightHip) {
    const l = world[LM.leftShoulder].z + world[LM.leftHip].z
    const r = world[LM.rightShoulder].z + world[LM.rightHip].z
    if (Math.abs(l - r) > 0.02) return l < r ? 'left' : 'right'
  }
  return facingOf(p) >= 0 ? 'right' : 'left'
}

/** Which way across the picture the player faces: positive is to the right. */
export function facingOf(p: Placed): number {
  const ears = mix(p[EAR.left], p[EAR.right], 0.5)
  const look = p[LM.nose].x - ears.x
  if (Math.abs(look) > 1e-3) return look
  return (p[LM.leftToe].x + p[LM.rightToe].x - p[LM.leftHeel].x - p[LM.rightHeel].x) / 2
}

function arm(p: Placed, side: Side, u: number, heavy: boolean): Solid[] {
  const l = sided(side)
  const k = heavy ? 1.08 : 1
  const s = p[l.shoulder]
  const e = p[l.elbow]
  const w = p[l.wrist]
  const hand = mix(p[ends(side).index], p[ends(side).pinky], 0.5)
  return [
    limb(`${side}-fore`, e, w, 2.75 * u * k, 1.7 * u * k, 0.6 * u, 0.3),
    limb(`${side}-hand`, w, hand, 1.75 * u, 1.75 * u),
    limb(`${side}-upper`, s, e, 3.7 * u * k, 2.75 * u * k, 0.45 * u, 0.36),
  ]
}

function leg(p: Placed, side: Side, u: number, facing: number): Solid[] {
  const l = sided(side)
  const h = p[l.hip]
  const k = p[l.knee]
  const a = p[l.ankle]
  const shin = unit(sub(a, k))
  const back = dot(normal(shin), { x: facing >= 0 ? -1 : 1, y: 0 }) >= 0 ? 1 : -1
  return [
    shoe(side, a, p[ends(side).heel], p[ends(side).toe], u),
    limb(`${side}-shin`, k, a, 3.5 * u, 2.0 * u, 1.05 * u, 0.28, back * 0.75),
    limb(`${side}-thigh`, h, k, 6.0 * u, 3.6 * u, 0.75 * u, 0.3, -back * 0.5),
  ]
}

/** A shoe: heel to toe, built up to the ankle. */
function shoe(side: Side, ankle: Pt, heel: Pt, toe: Pt, u: number): Solid {
  const along = unit(sub(toe, heel))
  let up = normal(along)
  if (dot(up, sub(ankle, heel)) < 0) up = mul(up, -1)
  const sole = 1.1 * u
  const outline = [
    add(heel, mul(up, -sole * 0.4)),
    add(heel, mul(along, -1.4 * u)),
    add(mix(heel, ankle, 0.72), mul(along, -1.7 * u)),
    add(ankle, mul(along, -1.2 * u)),
    add(ankle, mul(along, 2.1 * u)),
    add(mix(ankle, toe, 0.62), mul(up, 1.2 * u)),
    add(toe, mul(along, 1.9 * u)),
    add(toe, mul(up, -sole * 0.4)),
  ]
  return {
    id: `${side}-shoe`,
    outline,
    axis: [heel, toe],
    ...lit(heel, toe, up, 4 * u),
  }
}

/** Every solid of a body in paint order, far side first. */
export function shapesOf(p: Placed, opts: { stature?: number; near?: Side; racket: Side }): Shapes {
  const stature = opts.stature ?? statureOf(p)
  const u = stature / 100
  const facing = facingOf(p)
  const near = opts.near ?? nearSide(p)
  const far: Side = near === 'left' ? 'right' : 'left'

  const { solid: torso, top } = trunkOf(p, u, facing)
  const ear = mix(p[EAR.left], p[EAR.right], 0.5)
  const nose = p[LM.nose]
  const toFace = sub(nose, ear)
  const faceDir = len(toFace) > 1e-6 ? unit(toFace) : { x: facing >= 0 ? 1 : -1, y: 0 }
  // The skull sits behind and above the nose, about a head's depth back.
  const centre = add(mix(ear, nose, 0.3), { x: 0, y: -0.6 * u })
  const neckTop = add(mix(ear, top, 0.18), mul(faceDir, -0.2 * u))
  const neck = limb('neck', mix(top, neckTop, 0.1), neckTop, 3.7 * u, 3.0 * u)

  return {
    u,
    parts: [
      { id: 'farArm', solids: arm(p, far, u, opts.racket === far) },
      { id: 'farLeg', solids: leg(p, far, u, facing) },
      { id: 'nearLeg', solids: leg(p, near, u, facing) },
      { id: 'torso', solids: [neck, torso] },
      { id: 'head', solids: [] },
      { id: 'nearArm', solids: arm(p, near, u, opts.racket === near) },
    ],
    // Its long axis runs up the neck, whichever way the face is turned: a face
    // turned to the lens has no direction across the picture to lie along.
    head: { centre, rx: 4.6 * u, ry: 5.8 * u, angle: Math.atan2(centre.y - top.y, centre.x - top.x) - Math.PI / 2 },
    floor: {
      centre: mix(mix(p[LM.leftHeel], p[LM.rightHeel], 0.5), mix(p[LM.leftToe], p[LM.rightToe], 0.5), 0.5),
      rx: 24 * u,
    },
  }
}
