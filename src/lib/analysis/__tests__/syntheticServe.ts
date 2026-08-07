/**
 * A parametric right-handed serve, built as landmark trajectories.
 *
 * This exists so the detector and the measurements can be exercised without a
 * camera. The rig is driven by the same quantities a coach would name — knee
 * bend, shoulder tilt, hip and shoulder rotation, where the hands are — so a
 * test can dial in a known fault and assert that the app reports that fault.
 *
 * Body model: 1.8 m player, hips at 0.95 m. World landmarks are metres with the
 * origin at the hip centre and +y pointing DOWN, matching MediaPipe. Image
 * landmarks are an orthographic projection along +z, already aspect-corrected.
 */
import { LM } from '../geometry'
import type { Frame, Landmark } from '../types'

const HEIGHT_M = 1.8
const HIP_M = 0.95
const SHOULDER_DROP = -0.52
const HALF_SHOULDER = 0.19
const HALF_HIP = 0.09
const UPPER_ARM = 0.3
const FOREARM = 0.27
const THIGH = 0.44
const SHIN = 0.44
const NOSE_DROP = -0.72

const GROUND_Y = 0.95
/**
 * 1.8 m maps to 0.54 image units, which leaves headroom for the racket hand at
 * full stretch — up to ~1.65× standing height — to stay inside the frame. A rig
 * that pushes contact off the top of the picture is not a clip anyone could
 * actually film, and would hide bugs in anything that maps landmarks to pixels.
 */
const SCALE = 0.54 / HEIGHT_M

export interface ServeDials {
  /** Knee angle in degrees at the trophy. 180 is straight. */
  trophyKneeAngle: number
  /** Shoulder-line tilt at the trophy, degrees. */
  shoulderTilt: number
  /** Yaw of the shoulder and hip lines at the trophy, degrees. */
  shoulderYaw: number
  hipYaw: number
  /** Hip height at contact, metres. Above 0.95 means the player left the ground. */
  contactHipHeight: number
  /** Wrist height at contact as a multiple of standing height. */
  contactReach: number
  /** How far the racket wrist falls below the shoulder at the drop, metres. */
  dropBelowShoulder: number
  /** Elbow angle of the tossing arm at release, degrees. */
  tossElbow: number
  /** Fraction of toss→contact that the tossing arm stays above its shoulder. */
  tossArmHold: number
  /** Sideways wobble amplitude of the tossing hand, metres. */
  tossWobble: number
  /** Seconds from the start of the motion to contact. */
  motionSeconds: number
  /** Camera yaw: 90 is fully side-on, 0 is face-on. */
  cameraYaw: number
  /** Someone standing around with the racket down — used to test rejection. */
  noSwing: boolean
  /**
   * Landmark jitter, as a fraction of the frame. Real pose output is never
   * still: a tracked wrist wobbles roughly 0.5–1.5% of frame height between
   * consecutive frames even when the arm is not moving.
   */
  noise: number
  /** Chance per frame that a limb is partly lost, as happens behind the body. */
  dropout: number
  /**
   * Which noise realisation to draw.
   *
   * Vary this to measure across an ensemble. Holding it fixed while changing
   * `noise` applies *the same* pattern scaled up, so every landmark moves along
   * its own straight line and any one measurement appears to drift smoothly —
   * which looks exactly like systematic bias and is not.
   */
  seed: number
}

/**
 * Deterministic pseudo-random numbers.
 *
 * A test that fails one run in twenty teaches nobody anything, so the noise has
 * to be repeatable — same dials, same jitter, every time.
 */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export const CLEAN_SERVE: ServeDials = {
  trophyKneeAngle: 133,
  shoulderTilt: 24,
  shoulderYaw: 82,
  hipYaw: 56,
  contactHipHeight: 1.09,
  contactReach: 1.38,
  dropBelowShoulder: 0.45,
  tossElbow: 172,
  tossArmHold: 0.72,
  tossWobble: 0.01,
  motionSeconds: 1.35,
  cameraYaw: 82,
  noSwing: false,
  noise: 0,
  dropout: 0,
  seed: 20240803,
}

/* -------------------------------------------------------------- interpolation */

type Key = [u: number, v: number]

/** Piecewise interpolation with a smoothstep on each span, so nothing kinks. */
function track(keys: Key[], u: number): number {
  if (u <= keys[0][0]) return keys[0][1]
  const last = keys[keys.length - 1]
  if (u >= last[0]) return last[1]
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i]
    const [u1, v1] = keys[i + 1]
    if (u >= u0 && u <= u1) {
      const t = (u - u0) / Math.max(1e-6, u1 - u0)
      const s = t * t * (3 - 2 * t)
      return v0 + (v1 - v0) * s
    }
  }
  return last[1]
}

const rad = (d: number) => (d * Math.PI) / 180

/**
 * Phase positions in normalised motion time, taken from real serve kinematics.
 * For a 1350 ms motion that puts the toss release ~700 ms before contact, the
 * trophy ~400 ms before, and the bottom of the racket drop ~150 ms before.
 */
export const U = { ready: 0, toss: 0.48, trophy: 0.7, drop: 0.89, contact: 1 } as const

/* -------------------------------------------------------------------- the rig */

const lm = (x: number, y: number, z: number): Landmark => ({ x, y, z, visibility: 1 })

export function buildServe(dials: Partial<ServeDials> = {}, fps = 50): Frame[] {
  const d = { ...CLEAN_SERVE, ...dials }
  const rand = seeded(d.seed)

  // A little lead-in and follow-through around the measured motion.
  const preroll = 0.35
  const postroll = 0.45
  const total = preroll + d.motionSeconds + postroll
  const count = Math.round(total * fps)
  const frames: Frame[] = []

  const kneeBendDeg = 180 - d.trophyKneeAngle

  for (let i = 0; i < count; i++) {
    const t = i / fps
    const u = (t - preroll) / d.motionSeconds

    /* --- trunk ---------------------------------------------------------- */
    const hipHeight = track(
      [
        [U.ready, HIP_M],
        [U.trophy, HIP_M - 0.08],
        [U.contact, d.contactHipHeight],
        [1.35, HIP_M - 0.02],
      ],
      u,
    )
    const kneeBend = track(
      [
        [U.ready, 6],
        [U.trophy, kneeBendDeg],
        [U.contact, 4],
        [1.35, 22],
      ],
      u,
    )
    const shoulderYaw = track(
      [
        [U.ready, d.shoulderYaw + 4],
        [U.trophy, d.shoulderYaw],
        [U.contact, 16],
      ],
      u,
    )
    const hipYaw = track(
      [
        [U.ready, d.shoulderYaw + 2],
        [U.trophy, d.hipYaw],
        [U.contact, 10],
      ],
      u,
    )
    const tilt = track(
      [
        [U.ready, 2],
        [U.trophy, d.shoulderTilt],
        [U.contact, 6],
      ],
      u,
    )

    /* --- world frame ---------------------------------------------------- */
    // Origin is the hip centre, so the hips sit at y = 0 by construction.
    const world = new Array<Landmark>(33).fill(lm(0, 0, 0))

    const hipDir = { x: Math.cos(rad(hipYaw)), z: Math.sin(rad(hipYaw)) }
    world[LM.leftHip] = lm(-HALF_HIP * hipDir.x, 0, -HALF_HIP * hipDir.z)
    world[LM.rightHip] = lm(HALF_HIP * hipDir.x, 0, HALF_HIP * hipDir.z)

    const shDir = { x: Math.cos(rad(shoulderYaw)), z: Math.sin(rad(shoulderYaw)) }
    const shCos = Math.cos(rad(tilt))
    const shSin = Math.sin(rad(tilt))
    // Right shoulder (the hitting side) drops as the tilt grows.
    world[LM.leftShoulder] = lm(
      -HALF_SHOULDER * shDir.x * shCos,
      SHOULDER_DROP - HALF_SHOULDER * shSin,
      -HALF_SHOULDER * shDir.z * shCos,
    )
    world[LM.rightShoulder] = lm(
      HALF_SHOULDER * shDir.x * shCos,
      SHOULDER_DROP + HALF_SHOULDER * shSin,
      HALF_SHOULDER * shDir.z * shCos,
    )
    world[LM.nose] = lm(0, NOSE_DROP, 0.06)

    // Legs: bend splits evenly between hip and ankle, which is enough for the
    // knee angle to come out as dialled.
    const half = rad(kneeBend / 2)
    for (const side of ['left', 'right'] as const) {
      const hipI = side === 'left' ? LM.leftHip : LM.rightHip
      const kneeI = side === 'left' ? LM.leftKnee : LM.rightKnee
      const ankleI = side === 'left' ? LM.leftAnkle : LM.rightAnkle
      const heelI = side === 'left' ? LM.leftHeel : LM.rightHeel
      const toeI = side === 'left' ? LM.leftToe : LM.rightToe
      const h = world[hipI]
      const knee = lm(h.x, h.y + THIGH * Math.cos(half), h.z + THIGH * Math.sin(half))
      const ankle = lm(knee.x, knee.y + SHIN * Math.cos(half), knee.z - SHIN * Math.sin(half))
      world[kneeI] = knee
      world[ankleI] = ankle
      world[heelI] = lm(ankle.x, ankle.y + 0.03, ankle.z - 0.04)
      world[toeI] = lm(ankle.x, ankle.y + 0.03, ankle.z + 0.12)
    }

    /* --- arms ----------------------------------------------------------- */
    // Wrists are placed directly; elbows are then solved onto the segment so
    // the limb lengths stay honest and the joint angles come out as dialled.
    const rSh = world[LM.rightShoulder]
    const lSh = world[LM.leftShoulder]

    const reachAboveHip = d.contactReach * HEIGHT_M - hipHeight
    const racketWrist = {
      // +x is away from the net: a right-hander stands side-on with the racket
      // shoulder back, so the hand starts on the back side and sweeps across to
      // finish *in front of* the hip line. Contact has to land net-ward of the
      // hips (negative x) or the rig is modelling a serve hit from behind the
      // head — which is a fault, and not one a serve labelled clean should have.
      // The sweep is also what tells the engine which way the net is, and a
      // clean serve should give it plenty to work with.
      x: track([[U.ready, 0.18], [U.trophy, 0.24], [U.drop, 0.2], [U.contact, -0.2]], u),
      y: track(
        [
          [U.ready, 0.38],
          [U.toss, SHOULDER_DROP + 0.05],
          [U.trophy, SHOULDER_DROP - 0.2],
          [U.drop, SHOULDER_DROP + d.dropBelowShoulder],
          [U.contact, -reachAboveHip],
          // The hand leaves contact immediately. Without this key the smoothstep
          // either side of contact makes a flat plateau, and a plateau has no
          // well-defined peak for anything to find.
          [1.1, -0.95],
          [1.35, 0.1],
        ],
        u,
      ),
      z: track([[U.ready, 0.1], [U.trophy, 0.26], [U.drop, 0.3], [U.contact, -0.1]], u),
    }

    // Tossing arm: up to full stretch at release, held, then folded away. The
    // hold fraction controls when it drops back below the shoulder.
    const dropStart = U.toss + (U.contact - U.toss) * d.tossArmHold
    const tossWrist = {
      x:
        track([[U.ready, -0.16], [U.toss, -0.1], [U.contact, -0.22]], u) +
        Math.sin(u * 37) * d.tossWobble,
      y: track(
        [
          [U.ready, 0.36],
          [U.toss, SHOULDER_DROP - 0.55],
          [dropStart, SHOULDER_DROP - 0.5],
          [Math.min(0.999, dropStart + 0.12), SHOULDER_DROP + 0.16],
          [U.contact, 0.1],
        ],
        u,
      ),
      z: track([[U.ready, 0.08], [U.toss, -0.1], [U.contact, 0.1]], u),
    }

    if (d.noSwing) {
      // Idling: both hands stay down by the hips with a little sway.
      racketWrist.x = 0.2
      racketWrist.y = 0.34 + Math.sin(t * 2.1) * 0.03
      racketWrist.z = 0.08
      tossWrist.x = -0.18
      tossWrist.y = 0.34 + Math.cos(t * 1.7) * 0.03
      tossWrist.z = 0.06
    }

    world[LM.rightWrist] = lm(racketWrist.x, racketWrist.y, racketWrist.z)
    world[LM.leftWrist] = lm(tossWrist.x, tossWrist.y, tossWrist.z)
    world[LM.rightElbow] = solveElbow(rSh, world[LM.rightWrist], 1)
    world[LM.leftElbow] = solveElbow(lSh, world[LM.leftWrist], -1, rad(180 - d.tossElbow))
    // Fill the face landmarks the app never reads, so indices are safe.
    for (let k = 0; k < 33; k++) if (!world[k]) world[k] = lm(0, NOSE_DROP, 0)
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) world[k] = lm(0, NOSE_DROP, 0.04)
    for (const k of [21, 22]) world[k] = k === 21 ? world[LM.leftWrist] : world[LM.rightWrist]

    // Knuckles, roughly 9 cm past the wrist along the forearm. These used to be
    // parked on the wrist as filler; the racket estimate reads them, and a hand
    // with no length points nowhere.
    for (const side of ['left', 'right'] as const) {
      const elbow = side === 'left' ? LM.leftElbow : LM.rightElbow
      const wrist = side === 'left' ? LM.leftWrist : LM.rightWrist
      world[side === 'left' ? LM.leftIndex : LM.rightIndex] = extendPast(
        world[elbow],
        world[wrist],
        0.09,
      )
      world[side === 'left' ? LM.leftPinky : LM.rightPinky] = extendPast(
        world[elbow],
        world[wrist],
        0.085,
      )
    }

    /* --- project -------------------------------------------------------- */
    const cam = rad(90 - d.cameraYaw)
    // Gaussian-ish jitter from the sum of two uniforms, cheap and good enough.
    const jitter = () => (d.noise ? ((rand() + rand()) / 2 - 0.5) * 2 * d.noise : 0)

    const image = world.map((p) => {
      // Rotate about the vertical axis so the camera can sit anywhere from
      // side-on to face-on, then drop z.
      const x = p.x * Math.cos(cam) - p.z * Math.sin(cam)
      const heightAboveGround = hipHeight - p.y
      return lm(
        0.5 + x * SCALE + jitter(),
        GROUND_Y - heightAboveGround * SCALE + jitter(),
        p.z + jitter(),
      )
    })

    if (d.noise) {
      // World landmarks come from the same tracker and are just as jittery — but
      // they are in metres, so the image-space figure has to be converted rather
      // than reused. One frame unit spans HEIGHT_M / 0.54 metres here, so 0.6% of
      // the frame is about 2 cm in the world, which is the right order for
      // MediaPipe.
      const toMetres = 1 / SCALE
      for (const p of world) {
        p.x += jitter() * toMetres
        p.y += jitter() * toMetres
        p.z += jitter() * toMetres
      }
    }

    // Occlusion: a limb the tracker briefly loses, reported as low visibility
    // rather than removed — which is exactly how MediaPipe behaves.
    if (d.dropout && rand() < d.dropout) {
      const limb = rand() < 0.5 ? [LM.leftKnee, LM.leftAnkle] : [LM.rightKnee, LM.rightAnkle]
      for (const k of limb) image[k] = { ...image[k], visibility: 0.15 }
    }

    frames.push({ index: i, t, image, world, visibility: 1 })
  }

  return frames
}

/**
 * Place an elbow on a shoulder→wrist segment given the limb lengths, bulging to
 * one side. `straighten` forces a near-straight arm (used for the tossing arm).
 */
function solveElbow(sh: Landmark, wr: Landmark, side: 1 | -1, straighten?: number): Landmark {
  const dx = wr.x - sh.x
  const dy = wr.y - sh.y
  const dz = wr.z - sh.z
  const span = Math.hypot(dx, dy, dz)

  if (straighten !== undefined) {
    // Sit the elbow just off the straight line by the requested bend.
    const bulge = (Math.sin(straighten / 2) * (UPPER_ARM + FOREARM)) / 2
    const t = UPPER_ARM / (UPPER_ARM + FOREARM)
    return {
      x: sh.x + dx * t + bulge * side,
      y: sh.y + dy * t,
      z: sh.z + dz * t + bulge * 0.3,
      visibility: 1,
    }
  }

  const reach = Math.min(span, UPPER_ARM + FOREARM - 1e-3)
  // Distance along the segment to the elbow's foot, from the law of cosines.
  const a = (UPPER_ARM ** 2 - FOREARM ** 2 + reach ** 2) / (2 * Math.max(reach, 1e-4))
  const h = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - a * a))
  const ux = dx / Math.max(span, 1e-6)
  const uy = dy / Math.max(span, 1e-6)
  const uz = dz / Math.max(span, 1e-6)
  // Any unit vector perpendicular to the arm works; bulge sideways and back.
  let px = -uy
  let py = ux
  let pz = 0
  const pn = Math.hypot(px, py, pz) || 1
  px /= pn
  py /= pn
  pz /= pn
  return {
    x: sh.x + ux * a + px * h * side,
    y: sh.y + uy * a + py * h * side,
    z: sh.z + uz * a + pz * h * side + h * 0.35,
    visibility: 1,
  }
}

function extendPast(from: Landmark, through: Landmark, by: number): Landmark {
  const dx = through.x - from.x
  const dy = through.y - from.y
  const dz = through.z - from.z
  const n = Math.hypot(dx, dy, dz) || 1
  return {
    x: through.x + (dx / n) * by,
    y: through.y + (dy / n) * by,
    z: through.z + (dz / n) * by,
    visibility: 1,
  }
}
