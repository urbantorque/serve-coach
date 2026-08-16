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
import { LM, clamp } from './geometry'
import type { Frame, Landmark } from './types'

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
  /**
   * Front-to-back wobble amplitude of the tossing hand, metres.
   *
   * This dial is applied to world +x, which the racket-wrist block below
   * documents as "away from the net" — the player's DEPTH axis. It was described
   * here as "sideways wobble" for as long as it has existed, and that one word
   * is the whole of the bug this rig hid.
   *
   * Being pointed at depth is exactly what made `tossPathWobble` look correct.
   * The projection below lays image x across the two body axes as
   * `depth·sin(yaw) + lateral·cos(yaw)`, so at the rig's own default of 82° a
   * metre of depth arrives as 0.990 of image x and a metre of lateral as 0.139.
   * The rig drove the axis the camera could see best, the measurement read image
   * x, and the two agreed to four decimal places about a quantity neither of
   * them was naming correctly. Nothing in the suite could tell, because until
   * `tossWobbleLateral` below there was no way to move the other axis at all.
   *
   * Deliberately NOT renamed to `tossWobbleDepth`, which is what it should be
   * called. The dial is set by name in four test files this workstream does not
   * own (engine, triage, flaws, plan), and a rename that silently reverts to the
   * clean-serve default in someone else's file would turn their dialled-in fault
   * into a clean toss and their assertion into a coincidence.
   */
  tossWobble: number
  /**
   * Sideways wobble amplitude of the tossing hand, metres — the real one.
   *
   * Applied to world z, which is across the player: at the ready pose the
   * shoulder line runs along it (`shDir` is built from `shoulderYaw`, 86° at
   * ready, so the line is 0.998 of z and 0.070 of x). This is the axis a
   * fence-line toss drill constrains, and the axis every player-facing string
   * about toss drift used to claim it was describing.
   *
   * Same waveform and same units as `tossWobble`, so the pair differ in nothing
   * but the axis they move. That is the point: a test can now dial an identical
   * wobble onto each axis in turn and assert that the app names them apart,
   * which is the one thing the rig could not previously be asked.
   */
  tossWobbleLateral: number
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
   *
   * KNOWN LIMIT: this dial saturates, and it matters more than it looks. Dialled
   * at 80, 90 and 100 the engine reads back 49–51° every time, so the most
   * extreme waiter's tray this rig can build is about 50° of palm. Against
   * `palm_to_sky_deg`'s own deviation of 6.8° that leaves `waiters_tray` — the
   * top of the triage hierarchy — clearing a tier-5 band by roughly half a
   * degree, and `flaws.test.ts`'s jitter check had to move to tier 7 to stay
   * meaningful because of it. The bound is `placeHand`'s `sin(palmToSky)` against
   * the forearm tilt, so a bigger number cannot fix it; the rig needs a hand
   * orientation with more than one angle in it. Until then, no test here can
   * claim a margin on this signal that it has not separately checked.
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
   *
   * KNOWN LIMIT: it moves the hand, and nothing puts the forearm back. Past
   * about 0.3 the elbow-to-wrist distance starts growing rather than the arm
   * rotating, measured on the clean rig at the trophy frame:
   *
   * ```
   * dial   forearm(m)  upper arm(m)  ratio
   * 0.00       0.272        0.321      0.85   ← a real forearm is about 0.8
   * 0.20       0.268        0.313      0.86
   * 0.30       0.288        0.301      0.96
   * 0.40       0.420        0.301      1.40
   * 0.80       1.007        0.300      3.35
   * ```
   *
   * So a dial above ~0.3 poses a body nobody has, and any measurement read off
   * the racket arm there is a measurement of that. It does not invalidate what
   * the dial is used for — `palm_to_sky_deg` is read from the palm normal and
   * the flags built on it are still earned — but it does mean the dial cannot be
   * turned up to make a fault "more extreme", and `invariants.test.ts` pins the
   * bound so a future dial past it fails rather than quietly stretching an arm.
   *
   * IT IS NOT A ROTATION, and confusing it for one produced a wrong answer once
   * already. Sweeping this dial to ask whether a phone can read shoulder
   * external rotation measured a forearm getting longer, and the deviation that
   * came back — exploding past 0.4 — was the arm straightening out, not a camera
   * failing. `trophyExternalRotation` is the dial for that question and answers
   * it differently; see its own comment.
   */
  trophyForearmDrop: number
  /**
   * External rotation of the racket shoulder at the trophy, in degrees.
   *
   * The one thing this rig could not pose, and the reason a whole investigation
   * into whether a phone can read external rotation had no question to ask: the
   * dial above moves the *hand*, and moving a hand outward past the arm's reach
   * lengthens the forearm rather than rotating anything. That is why it is
   * bounded, and why the bound is pinned in `invariants.test.ts`.
   *
   * This one is a rotation and cannot stretch anything, by construction. The
   * wrist is rotated about the shoulder→elbow axis — the humerus' own long axis,
   * which is what external rotation physically is — and the elbow lies *on* that
   * axis, so the elbow-to-wrist distance is preserved exactly rather than
   * approximately. Positive lays the racket back behind the arm, which is the
   * direction a real serve loads in. Zero is an exact no-op: nothing is applied,
   * so every reading the suite has ever taken is untouched.
   *
   * Weighted to the trophy and back to nothing by the drop, because that is
   * where the load lives — a rotation held through contact would be modelling a
   * different fault, and the swing already has `pronation` for what the forearm
   * does on the way through.
   *
   * WHAT IT ANSWERED. Swept the day it was added, against the same ensemble
   * every `NOISE_FLOOR` figure was derived from — `DEPTH_AWARE`, 24 seeds, at
   * the trophy, reading the forearm's rotation about this same humeral axis
   * against the trunk's up:
   *
   * ```
   * dial   measured°   sd°      dial   measured°   sd°   (depth error removed)
   *    0        19.7   9.5         0        14.9   2.9
   *   15        31.9   9.4        15        29.3   2.6
   *   30        43.9   9.8        30        43.8   2.7
   *   45        55.9  10.6        45        58.3   2.9
   *   60        67.9  11.8        60        72.9   3.4
   * ```
   *
   * Deviation is flat at ~10° across the whole range rather than exploding, the
   * reading tracks the dial at a gain of about 0.8, and the span is 48°. A floor
   * set the way every other one was — 1.5 × the deviation — would be 15°, which
   * leaves **3.15 usable steps**. For scale, `palm_to_sky_deg`'s floor is 11 and
   * the engine grades it; `hip_lead_ms`'s is 85 and it is `UNDER_RESOLVED`. So
   * external rotation sits on the gradeable side, and the earlier conclusion
   * that it did not was an artefact of sweeping `trophyForearmDrop` — a stretched
   * arm, not a rotated one.
   *
   * NOT GRADED YET, AND DELIBERATELY SO. No signal computes it, no band judges it
   * and no flag pairs it. A floor is the *first* number a graded signal needs,
   * not the last: bands per tier, a place in the hierarchy and copy all have to
   * come from somewhere, and inventing them off a synthetic rig is the thing this
   * codebase treats as a defect. The offset at zero (19.7°, the arm's own resting
   * rotation in this reference frame) and the 0.8 gain are also properties of the
   * frame rather than of a shoulder, and both need real footage before anything
   * is said to a player about degrees.
   */
  trophyExternalRotation: number
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
  /**
   * How much worse the depth axis is than the two the camera can actually see.
   *
   * `noise` on its own applies the same jitter to x, y and z, which quietly
   * asserts that a monocular pose estimate resolves depth as well as it resolves
   * position in the frame. It does not, and it is not close: x and y are read
   * off pixels, while z is inferred by the network from apparent size and
   * foreshortening. Published characterisations of MediaPipe's world landmarks
   * put depth error at roughly three to five times the in-plane error.
   *
   * That matters more here than the raw ratio suggests, because two of the
   * engine's readings are computed *entirely* from z — hip-shoulder separation
   * and shoulder tilt are both yaw angles about the vertical axis — and a rig
   * that models depth as exact has never once exercised them under the error
   * they actually carry.
   *
   * A multiplier rather than an absolute, so it composes with `noise`, and
   * defaulting to 1 so every existing expectation in the suite is untouched.
   */
  depthNoise: number
  /**
   * Whole-body depth wobble, in the same frame units as `noise`.
   *
   * The part that independent per-landmark jitter cannot stand in for. A network
   * inferring depth from apparent size gets the *whole player* slightly too near
   * or too far on a given frame, and every landmark moves together. Independent
   * noise largely cancels in a difference of two angles; a shared bias does not
   * cancel at all — it rotates both shoulder and hip lines the same way, which
   * is precisely the failure mode a separation measurement is blind to and a
   * tilt measurement is not.
   */
  depthBias: number
  /**
   * Total lateral camera drift across the whole clip, in the same frame
   * units as `noise` — the handheld counterpart to `depthBias`.
   *
   * `depthBias` gives every landmark a shared offset re-rolled *per frame*,
   * because a network guessing depth infers it for the whole body at once,
   * on every frame independently. This gives every landmark a shared offset
   * that grows smoothly across the *whole clip* instead, because a hand
   * holding a phone does not re-aim randomly frame to frame — it drifts, in
   * one direction, the way a grip settles or an arm tires over three seconds
   * of filming. `noise` cannot stand in for this any more than it can for
   * `depthBias`, and for the same reason: independent per-landmark jitter
   * mostly cancels in a difference of two angles read at one instant, while a
   * shared drift does not cancel at all — it carries the whole skeleton the
   * same way, frame after frame, which a hip-shoulder separation or a
   * toss-height reading has no way to tell apart from the player actually
   * having moved.
   *
   * A straight line rather than a wobble with a frequency to tune: the
   * dominant real case named in this app's own brief is somebody's arm
   * settling in one direction over a few seconds, not a shake, and a linear
   * drift is enough to ask the question this dial exists for — can a
   * measurement taken as a *difference of two frames* survive the reference
   * frame itself moving between them. Zero by default, so the clean rig and
   * every existing expectation in the suite are untouched.
   */
  cameraPan: number
  /**
   * Total fractional change in apparent size across the whole clip — the
   * handheld counterpart to `cameraPan` for a camera that moves along its
   * own optical axis (a dolly, or someone stepping back) instead of across
   * it. 0.1 means the player reads 10% taller in the last frame than the
   * first.
   *
   * Every height this app reports is a fraction of `bodyHeight`, and
   * `bodyHeight` is measured once, from the stance window before the toss —
   * see `detectServe`'s own comment on why a median taken there, not
   * re-measured through the swing. A zoom drifting the apparent size AFTER
   * that window is exactly the case that assumption cannot see happen: the
   * calibration was correct when it was taken, and everything downstream of
   * it is being asked about a body that has since changed size in the
   * frame without changing size in the world.
   *
   * Applied from 1.0 at the first frame — true to the stance calibration,
   * which this dial does not disturb — ramping linearly to `1 + cameraZoom`
   * by the last one, around the player's own ground anchor rather than the
   * frame centre, so a pure zoom is not conflated with `cameraPan`'s
   * lateral drift. Zero by default, so the clean rig and every existing
   * expectation in the suite are untouched.
   */
  cameraZoom: number
  /** Chance per frame that a limb is partly lost, as happens behind the body. */
  dropout: number
  /**
   * Seconds the racket wrist is frozen at its position, starting at the racket
   * drop — a different failure from `dropout`, and the one R8 in `NEXT.md`
   * exists to drive: real occlusion is not always MediaPipe admitting it cannot
   * see a limb. Behind the body for long enough, the model has learned priors
   * about where a wrist plausibly sits and holds roughly still there rather
   * than declining — which reads as full visibility on a track that has
   * stopped moving, not lowered visibility on a track that kept jittering.
   * `dropout` models the first kind, correctly flagged; this models the
   * second, which nothing downstream is told about. Visibility is left at 1.
   * Starts at the drop because that is the window `kalman.ts`'s own docstring
   * names as the costliest: two invented frames there are enough to report a
   * racket drop that never happened.
   */
  occlusionSeconds: number
  /**
   * How well lit the clip is, 1 (full daylight) down towards 0 (too dark to
   * see anything). Scales every landmark's visibility uniformly, for the
   * whole clip — R10 in `NEXT.md`: contrast is the one clip problem that
   * degrades the *whole body at once* rather than one limb, which is what
   * separates it from `dropout` (one limb, one frame) and `occlusionSeconds`
   * (one limb, held still, position corrupted). Position is untouched here —
   * a dusk clip is not one MediaPipe has started guessing coordinates on, it
   * is one where the model is less sure of coordinates it still reads
   * correctly, and visibility is exactly the channel it uses to say so.
   */
  lightLevel: number
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
  // Zero rather than matching `tossWobble`, so every expectation already in the
  // suite keeps the serve it was written against. A clean toss wandering a
  // centimetre front-to-back and not at all sideways is not a claim about real
  // players; it is the rig's previous behaviour, held still while the axis it
  // was driving is finally named.
  tossWobbleLateral: 0,
  motionSeconds: 1.35,
  cameraYaw: 82,
  palmToSky: 6,
  trophyForearmDrop: 0,
  trophyExternalRotation: 0,
  pronation: 95,
  hipLead: 0.07,
  spineLean: 4,
  noSwing: false,
  noise: 0,
  // Both default to the rig's previous behaviour — depth exactly as good as the
  // frame, no shared bias — so nothing already in the suite moves. The depth
  // calibration turns them up deliberately.
  depthNoise: 1,
  depthBias: 0,
  cameraPan: 0,
  cameraZoom: 0,
  dropout: 0,
  occlusionSeconds: 0,
  lightLevel: 1,
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
  // Captured the first frame `u` enters the occlusion window, then held for
  // its whole span — see `occlusionSeconds`.
  let frozenWrist: { x: number; y: number; z: number } | undefined
  const occlusionEnd = U.drop + d.occlusionSeconds / Math.max(1e-6, d.motionSeconds)

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

    // Occlusion: held at the position last seen, not at the true one — see
    // `occlusionSeconds`. Position only; visibility stays at 1 below, because a
    // model that guessed and did not admit it is exactly the failure this
    // dial exists to drive.
    if (d.occlusionSeconds > 0 && u >= U.drop && u < occlusionEnd) {
      frozenWrist ??= { ...racketWrist }
      racketWrist.x = frozenWrist.x
      racketWrist.y = frozenWrist.y
      racketWrist.z = frozenWrist.z
    }

    // Tossing arm: up to full stretch at release, held, then folded away. The
    // hold fraction controls when it drops back below the shoulder.
    const dropStart = U.toss + (U.contact - U.toss) * d.tossArmHold
    const tossWrist = {
      // The two wobble dials, on the two axes they are named for. Splitting them
      // costs one term and buys the only thing that can catch an axis being
      // mislabelled: a serve that wanders on one axis and is dead still on the
      // other. With a single dial on x, a measurement reading raw image x scored
      // identically whether it was told the answer was depth or lateral.
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
      z:
        track([[U.ready, 0.08], [U.toss, -0.1], [U.contact, 0.1]], u) +
        Math.sin(u * 37) * d.tossWobbleLateral,
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

    /*
     * External rotation, applied after the elbow is solved and before the hand
     * is placed.
     *
     * Order is the whole trick. Rotating the wrist first would move the target
     * `solveElbow` places the elbow against, which is how a rotation turns into
     * a different arm; rotating it after means the shoulder and the elbow are
     * both already fixed, the axis between them is the humerus, and the elbow
     * sits on that axis — so the rotation cannot change a single segment length.
     * `placeHand` reads elbow→wrist afterwards, so the hand follows the forearm
     * round without needing to know this happened.
     *
     * Skipped entirely at zero rather than applied as a zero-degree rotation, so
     * the default path is byte-identical to what it was before this dial
     * existed — floating point does not promise that a rotation by 0 returns the
     * same numbers, and every band in `tiers.ts` was set against those numbers.
     */
    if (d.trophyExternalRotation !== 0) {
      const weight = track(
        [
          [U.toss, 0],
          [U.trophy, 1],
          [U.drop, 0],
        ],
        u,
      )
      if (weight !== 0) {
        world[LM.rightWrist] = rotateAboutAxis(
          world[LM.rightWrist],
          rSh,
          world[LM.rightElbow],
          rad(d.trophyExternalRotation) * weight,
        )
      }
    }
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
    // The depth axis, which the camera never measured. Scaled up because the
    // network infers it, and given a shared per-frame offset on top because it
    // infers it for the whole body at once.
    const frameDepthBias = d.depthBias ? ((rand() + rand()) / 2 - 0.5) * 2 * d.depthBias : 0
    const zJitter = () => jitter() * d.depthNoise + frameDepthBias
    // A straight line across the whole clip, centred on zero so `cameraPan`
    // reads as the total drift end to end rather than the drift from some
    // arbitrary start. `Math.max(1, count - 1)` only guards a one-frame clip,
    // which no real dial combination produces — `count` follows `preroll` +
    // `postroll` + `motionSeconds`, all positive, at whatever `fps` is passed.
    const pan = d.cameraPan * (i / Math.max(1, count - 1) - 0.5)
    // 1.0 at the first frame, true to the stance calibration `cameraZoom`'s
    // own doc comment describes — ramping linearly across the clip rather
    // than centred like `pan`, because the thing under test is a
    // calibration taken early drifting out of date, not a symmetric wobble.
    const zoom = 1 + d.cameraZoom * (i / Math.max(1, count - 1))

    const image = world.map((p) => {
      // Rotate about the vertical axis so the camera can sit anywhere from
      // side-on to face-on, then drop z.
      const x = p.x * Math.cos(cam) - p.z * Math.sin(cam)
      const heightAboveGround = hipHeight - p.y
      const rawX = 0.5 + x * SCALE
      const rawY = GROUND_Y - heightAboveGround * SCALE
      // Scaled about the player's own ground anchor, not the frame centre —
      // a pan-like image-position shift would otherwise ride along with
      // the zoom and confound the two dials' own separate questions.
      return lm(
        0.5 + (rawX - 0.5) * zoom + jitter() + pan,
        GROUND_Y + (rawY - GROUND_Y) * zoom + jitter(),
        p.z + zJitter(),
      )
    })

    if (d.noise || frameDepthBias) {
      // World landmarks come from the same tracker and are just as jittery — but
      // they are in metres, so the image-space figure has to be converted rather
      // than reused. One frame unit spans HEIGHT_M / 0.54 metres here, so 0.6% of
      // the frame is about 2 cm in the world, which is the right order for
      // MediaPipe.
      const toMetres = 1 / SCALE
      for (const p of world) {
        p.x += jitter() * toMetres
        p.y += jitter() * toMetres
        p.z += zJitter() * toMetres
      }
    }

    // Poor light: every landmark a little less certain, all at once — the
    // whole-body counterpart to `dropout`'s one limb. Applied before it so a
    // dropped limb on a dark clip still reads as more degraded than the rest
    // of the body, the way a tracker losing a limb entirely would.
    if (d.lightLevel < 1) {
      for (const p of image) p.visibility = clamp(d.lightLevel, 0, 1)
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
 * Rotate a point about the axis running through two others — Rodrigues.
 *
 * Written out rather than pulled from `geometry.ts`, which has no rotation in
 * it: that module measures angles off landmarks the tracker produced, and this
 * one poses landmarks a tracker would have seen. A rotation living there would
 * be the engine owning a way to move a body.
 *
 * Distance from `a` and from `b` is preserved exactly, because both lie on the
 * axis — which is the property `trophyExternalRotation` is built on, and the one
 * `trophyForearmDrop` does not have.
 */
function rotateAboutAxis(p: Landmark, a: Landmark, b: Landmark, theta: number): Landmark {
  const ax = b.x - a.x
  const ay = b.y - a.y
  const az = b.z - a.z
  const n = Math.hypot(ax, ay, az)
  if (n < 1e-9) return p

  const kx = ax / n
  const ky = ay / n
  const kz = az / n

  // Relative to a point on the axis, so the rotation is about the line rather
  // than about a parallel line through the origin.
  const vx = p.x - a.x
  const vy = p.y - a.y
  const vz = p.z - a.z

  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const dot = kx * vx + ky * vy + kz * vz
  const cx = ky * vz - kz * vy
  const cy = kz * vx - kx * vz
  const cz = kx * vy - ky * vx

  return {
    x: a.x + vx * c + cx * s + kx * dot * (1 - c),
    y: a.y + vy * c + cy * s + ky * dot * (1 - c),
    z: a.z + vz * c + cz * s + kz * dot * (1 - c),
    visibility: p.visibility,
  }
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

