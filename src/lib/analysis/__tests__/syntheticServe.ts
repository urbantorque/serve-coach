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
  /**
   * Which rotational sense the trunk unwinds in: +1 as dialled, -1 the mirror.
   *
   * This dial exists because the rig cannot prove its own convention. It wears
   * right-handed landmark labels and turns the trunk one particular way, and
   * there is no recorded MediaPipe footage in the repo to check that against —
   * `__tests__/fixtures/index.ts` has an empty RECORDED list. So if the rig
   * turned the trunk opposite to a real right-hander and the measurement was
   * oriented to agree with the rig, the two would be inverted together and every
   * test would pass for that reason alone.
   *
   * Negating both trunk yaws produces the same serve rotating the other way
   * round while the labels stay put, which is precisely the case an inverted
   * convention cannot survive: a measurement that assumes a direction reports
   * coil as an open chest under one setting or the other. Anything asserted for
   * both values of this dial is asserted independently of the convention.
   */
  trunkRotationSign: 1 | -1
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
  /**
   * How far the hitting palm has turned towards facing the sky at the trophy,
   * in degrees. Zero is edge-on — the hand a continental grip produces. Large
   * values are the waiter's tray, the palm flat under the racket.
   *
   * Realised by rotating the knuckle line about the forearm, which is what a
   * grip change actually does to the hand. The achievable elevation is bounded
   * by the forearm's own tilt — a dead vertical forearm cannot present its palm
   * to the sky at all — so `trophyForearmDrop` moves with it.
   */
  palmToSky: number
  /**
   * How far the trophy arm flattens out of its cocked position, in metres.
   *
   * The tray is not only a wrist rotation. A cocked arm holds the forearm near
   * vertical, and no grip can present a vertical forearm's palm to the sky —
   * that is a fact about arms, and it is why the fault always comes with the arm
   * laid over towards horizontal. This drops the hand towards shoulder height
   * and pushes it out to the side, which is the shape a player carrying a tray
   * actually makes.
   */
  trophyForearmDrop: number
  /** Degrees the palm rotates about the forearm through contact — the snap. */
  pronation: number
  /**
   * Seconds the hips lead the shoulders into the swing.
   *
   * Positive is the sequence working: the lower body starts and the upper body
   * follows. Negative is arming the ball — the shoulders fire first and the legs
   * contribute nothing.
   */
  hipLead: number
  /** Sideways collapse of the spine by contact, in degrees. */
  spineLean: number
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
  trunkRotationSign: 1,
  contactHipHeight: 1.09,
  contactReach: 1.38,
  dropBelowShoulder: 0.45,
  tossElbow: 172,
  tossArmHold: 0.72,
  tossWobble: 0.01,
  motionSeconds: 1.35,
  cameraYaw: 82,
  palmToSky: 6,
  trophyForearmDrop: 0,
  pronation: 95,
  hipLead: 0.07,
  spineLean: 4,
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
    // Both trunk yaws are negated together, so the dial reverses the direction
    // the trunk rotates in without touching how far it rotates, how the hips
    // lead the shoulders, or which landmark is labelled which.
    const spin = d.trunkRotationSign
    const shoulderYaw =
      spin *
      track(
        [
          [U.ready, d.shoulderYaw + 4],
          [U.trophy, d.shoulderYaw],
          [U.contact, 16],
        ],
        u,
      )
    // The hips run on their own clock, ahead of the shoulders by `hipLead`. A
    // serve where both lines unwind on the same schedule has no sequence in it
    // at all, and the sequencing detector would have nothing to find in either
    // direction — so the lead is part of the rig rather than a fault dialled on
    // top of it.
    const uHips = u + d.hipLead / Math.max(1e-6, d.motionSeconds)
    const hipYaw =
      spin *
      track(
        [
          [U.ready, d.shoulderYaw + 2],
          [U.trophy, d.hipYaw],
          [U.contact, 10],
        ],
        uHips,
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

    // Sideways collapse: the shoulder girdle slides across the hip line as the
    // motion runs, so the spine stops being a straight vertical column. Applied
    // as an offset to the whole girdle rather than as a rotation of each
    // shoulder, because that is what a player chasing a toss actually does —
    // the shoulders travel, they do not pivot in place.
    const leanDeg = track([[U.ready, 0], [U.trophy, d.spineLean * 0.35], [U.contact, d.spineLean]], u)
    const leanShift = Math.tan(rad(leanDeg)) * Math.abs(SHOULDER_DROP)
    const acrossHips = { x: hipDir.x, z: hipDir.z }
    const lx = acrossHips.x * leanShift
    const lz = acrossHips.z * leanShift

    // Right shoulder (the hitting side) drops as the tilt grows.
    world[LM.leftShoulder] = lm(
      lx - HALF_SHOULDER * shDir.x * shCos,
      SHOULDER_DROP - HALF_SHOULDER * shSin,
      lz - HALF_SHOULDER * shDir.z * shCos,
    )
    world[LM.rightShoulder] = lm(
      lx + HALF_SHOULDER * shDir.x * shCos,
      SHOULDER_DROP + HALF_SHOULDER * shSin,
      lz + HALF_SHOULDER * shDir.z * shCos,
    )
    world[LM.nose] = lm(lx, NOSE_DROP, lz + 0.06)

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
      x: track(
        [
          [U.ready, 0.18],
          [U.trophy, 0.24 + d.trophyForearmDrop * 1.25],
          [U.drop, 0.2],
          [U.contact, -0.2],
        ],
        u,
      ),
      y: track(
        [
          [U.ready, 0.38],
          [U.toss, SHOULDER_DROP + 0.05],
          // A flattening arm drops the hand towards shoulder height, which is
          // the shape that lets a palm face the sky at all.
          [U.trophy, SHOULDER_DROP - 0.2 + d.trophyForearmDrop],
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

    // Hands. The knuckles used to sit on the forearm line, one a few
    // millimetres past the other — enough to point a racket along, and useless
    // for anything that needs the hand's *plane*, because two points strung out
    // along an axis do not have one. They are now a real knuckle line: across
    // the hand, perpendicular to the forearm, rotated about it by the grip.
    //
    // The tossing hand keeps a fixed neutral rotation; nothing measures it, and
    // giving it a dial would only be a second thing to get wrong.
    const palmAt = track(
      [
        [U.ready, d.palmToSky],
        [U.trophy, d.palmToSky],
        // Pronation happens through contact, not before it: the palm holds its
        // grip orientation into the drop and turns over as the arm extends.
        [U.drop, d.palmToSky],
        [U.contact, d.palmToSky + d.pronation * 0.55],
        [1.12, d.palmToSky + d.pronation],
      ],
      u,
    )
    placeHand(world, 'right', palmAt)
    placeHand(world, 'left', 10)

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

  // Any unit vector perpendicular to the arm places a valid elbow, and which
  // one is chosen is the difference between two completely different arms. A
  // purely sideways bulge hangs the elbow below the shoulder — a windmill — and
  // the rig produced that on every frame, so a serve dialled clean came back
  // with a collapsed elbow at the bottom of its racket drop.
  //
  // A racket drop is the opposite shape: elbow up and out, racket head hanging
  // down the back. So the bulge tilts towards vertical in proportion to how far
  // the hand has fallen below the shoulder, which is exactly when a real arm
  // does it, and leaves the near-straight arm at contact untouched.
  const belowShoulder = Math.max(0, uy)
  const upX = -ux * -uy
  const upY = -1 - uy * -uy
  const upZ = -uz * -uy
  const upN = Math.hypot(upX, upY, upZ) || 1
  let px = (-uy) * (1 - belowShoulder) + (upX / upN) * belowShoulder
  let py = ux * (1 - belowShoulder) + (upY / upN) * belowShoulder
  let pz = (upZ / upN) * belowShoulder
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

const HAND_LENGTH = 0.09
const KNUCKLE_HALF_SPAN = 0.042

/**
 * Put a hand on the end of a forearm, rotated about it by the grip.
 *
 * `palmToSky` is how far the palm is turned towards facing upwards, in degrees,
 * and it is realised by rotating the knuckle line about the forearm axis — which
 * is exactly what changing grip does to a hand holding a racket. The elevation
 * the palm can actually reach is bounded by the forearm's own tilt: with the
 * forearm dead vertical every direction across the hand is horizontal, so no
 * grip can present the palm to the sky. That is a fact about arms, not a
 * limitation of the rig, and it is why a waiter's tray comes with a flattened
 * arm in the first place.
 *
 * The chirality flip mirrors the hand for the left side, so a left-hander's
 * neutral grip does not come back reading as somebody else's fault.
 */
function placeHand(world: Landmark[], side: 'left' | 'right', palmToSky: number) {
  const elbow = world[side === 'left' ? LM.leftElbow : LM.rightElbow]
  const wrist = world[side === 'left' ? LM.leftWrist : LM.rightWrist]
  const chirality = side === 'left' ? -1 : 1

  const f = unitOf(wrist.x - elbow.x, wrist.y - elbow.y, wrist.z - elbow.z)

  // The most upward direction available perpendicular to the forearm, and its
  // partner. Any palm direction perpendicular to the arm is a rotation in this
  // plane, and `e1` is the one that points as close to the sky as the arm
  // allows — so asking for elevation reduces to a single angle from it.
  const fUp = -f.y
  const e1 = unitOf(-f.x * fUp, -1 - f.y * fUp, -f.z * fUp)
  const e2 = crossOf(f, e1)
  const reach = Math.hypot(e1.x, e1.y, e1.z) < 1e-6 ? 0 : Math.hypot(-f.x * fUp, -1 - f.y * fUp, -f.z * fUp)

  // Solve the rotation that lands the palm normal at the requested elevation,
  // and settle for the closest achievable when the arm cannot reach it.
  const wanted = Math.sin(rad(Math.max(0, palmToSky)))
  const phi = Math.acos(Math.max(-1, Math.min(1, reach > 1e-6 ? wanted / reach : 1)))

  const n = {
    x: e1.x * Math.cos(phi) + e2.x * Math.sin(phi),
    y: e1.y * Math.cos(phi) + e2.y * Math.sin(phi),
    z: e1.z * Math.cos(phi) + e2.z * Math.sin(phi),
  }
  // Knuckle line: perpendicular to both the forearm and the palm normal, which
  // makes the normal come back out of the plane the detector reconstructs.
  const k = crossOf(n, f)

  const base = {
    x: wrist.x + f.x * HAND_LENGTH,
    y: wrist.y + f.y * HAND_LENGTH,
    z: wrist.z + f.z * HAND_LENGTH,
  }
  const span = KNUCKLE_HALF_SPAN * chirality
  world[side === 'left' ? LM.leftIndex : LM.rightIndex] = lm(
    base.x + k.x * span,
    base.y + k.y * span,
    base.z + k.z * span,
  )
  world[side === 'left' ? LM.leftPinky : LM.rightPinky] = lm(
    base.x - k.x * span,
    base.y - k.y * span,
    base.z - k.z * span,
  )
  world[side === 'left' ? LM.leftThumb : LM.rightThumb] = lm(
    base.x + k.x * span * 0.5 + n.x * 0.02,
    base.y + k.y * span * 0.5 + n.y * 0.02,
    base.z + k.z * span * 0.5 + n.z * 0.02,
  )
}

function unitOf(x: number, y: number, z: number) {
  const n = Math.hypot(x, y, z) || 1
  return { x: x / n, y: y / n, z: z / n }
}

function crossOf(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return unitOf(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}

