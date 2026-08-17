/**
 * Where the camera actually was, and how much of the geometry survives it.
 *
 * Everything measured in image space assumes two things about the phone: that
 * its idea of up matches gravity, and that it can see the player's depth. A clip
 * shot over a fence with the phone cocked in somebody's hand breaks the first;
 * one shot from behind the baseline breaks the second. Neither breaks the pose
 * tracking, which is what makes them dangerous — every landmark arrives looking
 * perfectly healthy and the numbers built on them are quietly wrong.
 *
 * A tilted phone is correctable and is corrected: the player's own standing axis
 * is a plumb line, and rotating the image frame back onto it restores every
 * height and depth ratio. A camera that cannot see depth is not correctable, and
 * the honest response is to say so and let the measurements that need depth be
 * discarded rather than reported at half confidence.
 *
 * Court lines would be the textbook reference here and this deliberately does
 * not use them. Finding them means a Hough transform over every frame, and
 * validating it means footage of real courts under real light, in which the
 * lines are variously worn, wet, shadowed, cropped or simply not in shot. A
 * standing player is in every single clip by definition, and their own body is a
 * plumb line accurate to a degree or two. Precision that cannot be checked is
 * not precision.
 */
import { LM, clamp, mean, median } from './geometry'
import type { Frame } from './types'

export interface Spatial {
  /**
   * How far the phone was rolled, in degrees, signed.
   *
   * Positive means the image is rotated clockwise relative to gravity, so the
   * correction rotates the other way. Taken from the player standing still
   * before the motion starts, which is the one moment their own axis can be
   * trusted to be vertical.
   */
  roll_deg: number
  /**
   * Where the camera stood relative to the player, in degrees: 90 is dead
   * side-on, 0 is dead front or back.
   */
  yaw_deg: number
  /**
   * Whether `yaw_deg` was measured at all, or is the fallback standing in for
   * one that could not be.
   *
   * `estimateYaw` returns 45 when there is no body height to divide by and when
   * no frame offered two shoulders — and 45 is also an ordinary reading, from a
   * camera standing at the corner. Two places already know this and correctly
   * decline to care: `axes.ts` calls no axis the owner of image x either way,
   * and `diagnose.ts` records that the same tie deletes three timings. Both are
   * right, because for them the answer really is the same either way.
   *
   * It is not the same for anything comparing two clips. Two serves both filmed
   * at a true 45° agree that the camera did not move between them; two serves
   * whose yaw could not be read agree on nothing at all, and their difference is
   * zero for the one reason that must never pass a gate. Same number, opposite
   * verdicts — so the fallback is now labelled rather than inferred.
   *
   * Nothing consumes it yet in a way that moves a reading: `yaw_deg` is
   * unchanged in both cases, deliberately, so every band derived against it
   * stays exactly where it was.
   */
  yaw_measured: boolean
  /** True when the camera angle collapses the depth axis it would need. */
  depth_unreliable: boolean
  /** 0–1. How much of the spatial geometry is usable at all. */
  confidence: number
  /**
   * 0–1. The part of `confidence` that is about the *angle* rather than the
   * depth axis: what a levelling correction from a noisy vertical is worth.
   *
   * Split out because `confidence` answers two questions at once and one of its
   * two factors is about world z. A caller that never touches world z — `axes.ts`
   * asks only which body axis image x lay across — was paying the
   * `depth_unreliable` quarter anyway, and paying it in the wrong direction: the
   * flag fires above 78°, which is where the axis split is at its *purest*
   * (0.992 of the reading is one axis) and where the yaw estimate is best
   * conditioned. The effect was a 25% cliff between 78° and 79° of yaw for a
   * reading that gets marginally better across it.
   */
  roll_confidence: number
}

/**
 * Shoulder span of a standing adult, as a fraction of standing height.
 *
 * Used to turn a projected span back into a camera angle. It varies between
 * people by a few percent, which moves the recovered angle by a few degrees —
 * fine for deciding whether depth is readable, and nowhere near good enough to
 * measure with, which is why nothing here does.
 */
const SHOULDER_SPAN_RATIO = 0.21

/** Past this roll the phone was not level and the correction earns its keep. */
export const NOTABLE_ROLL = 4

/**
 * Outside this window, one axis of the player's depth is pointing at the lens.
 *
 * Dead side-on the shoulder line foreshortens to nothing and the model is
 * inferring which shoulder is nearer; dead front-on the same is true of how far
 * in front of the body contact happens. Both produce numbers, and both produce
 * them from a guess.
 */
export const DEPTH_YAW_RANGE: [number, number] = [18, 78]

export function assessSpatial(frames: Frame[], readyIndex: number, bodyHeight: number): Spatial {
  const roll = estimateRoll(frames, readyIndex)
  const yaw = estimateYaw(frames, readyIndex, bodyHeight)

  const depth_unreliable = yaw.deg < DEPTH_YAW_RANGE[0] || yaw.deg > DEPTH_YAW_RANGE[1]

  // Roll is corrected rather than merely reported, so it costs confidence only
  // once it is large enough that the correction itself is working from a noisy
  // estimate — a body leaning on its own two degrees looks the same as a phone
  // held two degrees off.
  const rollCost = clamp(1 - Math.max(0, Math.abs(roll) - NOTABLE_ROLL) / 30, 0.25, 1)
  const yawCost = depth_unreliable ? 0.75 : 1

  return {
    roll_deg: Math.round(roll * 10) / 10,
    yaw_deg: Math.round(yaw.deg),
    yaw_measured: yaw.measured,
    depth_unreliable,
    confidence: Math.round(rollCost * yawCost * 100) / 100,
    roll_confidence: Math.round(rollCost * 100) / 100,
  }
}

/**
 * The phone's roll, from the player's own standing axis.
 *
 * Read across the frames before the motion starts and taken as a median rather
 * than a mean: a player rocking on their feet or bouncing a ball produces a few
 * frames leaning several degrees, and one of those in a short window drags an
 * average further than the tilt being measured.
 */
function estimateRoll(frames: Frame[], readyIndex: number): number {
  const lo = Math.max(0, Math.min(readyIndex, frames.length - 1) - 6)
  const hi = Math.max(0, Math.min(readyIndex, frames.length - 1))
  const angles: number[] = []

  for (let i = lo; i <= hi; i++) {
    const f = frames[i]
    const hip = midXY(f, LM.leftHip, LM.rightHip)
    const shoulder = midXY(f, LM.leftShoulder, LM.rightShoulder)
    const ankle = midXY(f, LM.leftAnkle, LM.rightAnkle)

    // Ankles to shoulders is the longest vertical the body offers, so landmark
    // jitter subtends the smallest angle on it. Falls back to the torso when the
    // feet are out of frame, which is the same fallback the scale uses.
    const feetSeen = Math.min(
      f.image[LM.leftAnkle]?.visibility ?? 0,
      f.image[LM.rightAnkle]?.visibility ?? 0,
    )
    const base = feetSeen > 0.5 ? ankle : hip
    const dx = shoulder.x - base.x
    const dy = shoulder.y - base.y
    if (Math.hypot(dx, dy) < 1e-4) continue

    // Image y grows downwards, so a body standing straight up has dy negative.
    // The angle is measured off that vertical, signed the way the image is
    // rotated.
    angles.push((Math.atan2(dx, -dy) * 180) / Math.PI)
  }

  if (!angles.length) return 0
  // A body genuinely leaning past this is not a level reference, and taking it
  // as one would rotate a real lean into every height in the report.
  return clamp(median(angles), -25, 25)
}

/**
 * Camera angle from the foreshortening of the shoulder line.
 *
 * Returns whether it managed it as well as what it got. The two failure exits
 * below both hand back 45, which is a real angle a camera can stand at, and
 * `Spatial.yaw_measured` exists so a caller that cannot treat those two the same
 * is able to tell them apart. See that field for why the callers that can treat
 * them the same are also right to.
 */
function estimateYaw(
  frames: Frame[],
  readyIndex: number,
  bodyHeight: number,
): { deg: number; measured: boolean } {
  if (!(bodyHeight > 0)) return { deg: 45, measured: false }
  const lo = Math.max(0, Math.min(readyIndex, frames.length - 1) - 6)
  const hi = Math.max(0, Math.min(readyIndex, frames.length - 1))

  const spans: number[] = []
  for (let i = lo; i <= hi; i++) {
    const f = frames[i]
    const l = f.image[LM.leftShoulder]
    const r = f.image[LM.rightShoulder]
    if (!l || !r) continue
    spans.push(Math.hypot(r.x - l.x, r.y - l.y) / bodyHeight)
  }
  if (!spans.length) return { deg: 45, measured: false }

  const projected = clamp(median(spans) / SHOULDER_SPAN_RATIO, 0, 1)
  return { deg: (Math.acos(projected) * 180) / Math.PI, measured: true }
}

/**
 * The correction `levelFrames` applied, carried on the report so drawing can
 * invert it. `cx`/`cy` are the pivot in landmark units.
 */
export interface Tilt {
  roll_deg: number
  cx: number
  cy: number
}

/** The centre `levelFrames` rotates about, for callers that need to apply the
 *  identical transform to something else — the ball flight, above all. */
export function levelPivot(frames: Frame[]): { cx: number; cy: number } {
  return {
    cx: 0.5,
    cy: median(frames.map((f) => midXY(f, LM.leftHip, LM.rightHip).y)) || 0.5,
  }
}

/**
 * Rotate the whole clip back onto gravity.
 *
 * Returns the frames untouched when there is nothing worth correcting, so the
 * common case costs one comparison rather than a copy of every landmark.
 *
 * The world landmarks are rotated too, in their own x/y plane about their own
 * hip-centre origin: MediaPipe's world axes follow the *camera*, not gravity
 * (see the convention note in `kinematics.ts`), so a rolled phone rolls the
 * world frame with it and every up-referenced world measurement — shoulder
 * tilt, spine lean, palm-to-sky — would stay biased by the roll the image had
 * just been corrected for. In-plane roll does not touch world z.
 *
 * Visibility rides along untouched: a landmark's confidence is a fact about the
 * tracker, not about the coordinate system it is expressed in.
 */
export function levelFrames(
  frames: Frame[],
  roll_deg: number,
  pivot = levelPivot(frames),
): Frame[] {
  if (Math.abs(roll_deg) < NOTABLE_ROLL) return frames
  return rotateFrames(frames, (-roll_deg * Math.PI) / 180, pivot)
}

/**
 * The inverse of `levelFrames` — takes levelled landmarks back into the raw
 * pixel frame, which is the only frame the video underneath them lives in.
 * Drawing uses this; measurement never should.
 */
export function unlevelFrames(frames: Frame[], tilt: Tilt): Frame[] {
  return rotateFrames(frames, (tilt.roll_deg * Math.PI) / 180, tilt)
}

function rotateFrames(frames: Frame[], theta: number, pivot: { cx: number; cy: number }): Frame[] {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const { cx, cy } = pivot

  return frames.map((f) => ({
    ...f,
    image: f.image.map((p) => {
      const dx = p.x - cx
      const dy = p.y - cy
      return {
        ...p,
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
      }
    }),
    world: f.world.map((p) => ({
      ...p,
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos,
    })),
  }))
}

/** Mean visibility of the landmarks a spatial read depends on. */
export function spatialVisibility(frames: Frame[], readyIndex: number): number {
  const lo = Math.max(0, Math.min(readyIndex, frames.length - 1) - 6)
  const hi = Math.max(0, Math.min(readyIndex, frames.length - 1))
  const keys = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip]
  const seen: number[] = []
  for (let i = lo; i <= hi; i++) {
    seen.push(Math.min(...keys.map((k) => frames[i].image[k]?.visibility ?? 0)))
  }
  return seen.length ? mean(seen) : 0
}

const midXY = (f: Frame, a: number, b: number) => ({
  x: ((f.image[a]?.x ?? 0) + (f.image[b]?.x ?? 0)) / 2,
  y: ((f.image[a]?.y ?? 0) + (f.image[b]?.y ?? 0)) / 2,
})
