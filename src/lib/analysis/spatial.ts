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
import { NotAServeError, type Frame } from './types'

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
   * Where the camera stood relative to the player's shoulder line at the start,
   * in degrees: 90 is the shoulder line pointing at the lens, 0 is it lying
   * across the picture.
   *
   * A question about the body, not the court, and kept for the body questions:
   * whether the trunk's rotation can be seen without inferring depth
   * (`depth_unreliable`). Where the net is in the picture is `court_yaw_deg`.
   */
  yaw_deg: number
  /**
   * Where the camera stood relative to the court, in degrees: 90 is the net
   * direction running straight across the picture — a phone on the baseline, as
   * the filming guide asks — and 0 is the net direction pointing into the lens,
   * a phone at the back fence or the net.
   *
   * Read from the swing when there is one (`court_yaw_from: 'swing'`): the
   * hitting hand travels from the drop to contact towards the net, and the
   * world landmarks give that travel's direction against the lens with its
   * sign — see `courtYawFromSwing`. Otherwise from the stance, as the
   * complement of the camera's angle to the shoulders at the start, which is
   * all a live preview has: a server starts side-on, so the shoulder line
   * points roughly at the net. Roughly is the trouble, and why the swing is
   * preferred: the Bath servers' shoulders sit 15° off the net direction, and
   * the shoulder span cannot say on which side, so a true 45° corner read 66°
   * from the stance (ANALYSIS-REVIEW.md §9).
   */
  court_yaw_deg: number
  /** Which of the two readings `court_yaw_deg` came from. */
  court_yaw_from: 'swing' | 'stance'
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
 * Past this roll the picture is refused, before a serve is looked for in it.
 *
 * `estimateRoll` levels a roll fully up to 25° and stops there, because past
 * it a body is not trusted as a plumb line — so a clip rolled 40° was levelled
 * by 25 and measured with 15° still in it, and passed. Read over the whole
 * clip (`turnedPicture`) the server's standing axis is a steadier plumb line
 * than the stance alone: on level clips it stays within 5.3° of upright, on the
 * forty Bath serves from seven placements and on the rig. So 30 leaves at most
 * five degrees of roll unlevelled, about `NOTABLE_ROLL`, and refuses the rest.
 */
export const MAX_PICTURE_ROLL = 30

/**
 * Outside this window, one axis of the player's depth is pointing at the lens.
 *
 * Dead side-on the shoulder line foreshortens to nothing and the model is
 * inferring which shoulder is nearer; dead front-on the same is true of how far
 * in front of the body contact happens. Both produce numbers, and both produce
 * them from a guess.
 */
export const DEPTH_YAW_RANGE: [number, number] = [18, 78]

/**
 * The camera's angle to the net, from its angle to the shoulders at the start.
 *
 * The complement, because the stance is side-on: see `Spatial.court_yaw_deg`.
 * Its own function so the capture-time framing check and the analysis cannot
 * convert the two angles different ways.
 */
export const courtYawFrom = (shoulderYawDeg: number): number => clamp(90 - shoulderYawDeg, 0, 90)

/**
 * Which way a clip was filmed, in court terms.
 *
 * `side` has the net direction across the picture, where how far in front of
 * the body contact happens is seen rather than inferred; `front-back` has it
 * pointing into the lens. The boundaries are the shoulder-span thresholds the
 * view was always cut at — a span over 0.17 or under 0.10 of standing height,
 * 36° and 61.5° of shoulder yaw — carried across to the court angle.
 */
export const SIDE_VIEW_COURT_YAW = 54
export const END_VIEW_COURT_YAW = 28.5

export function viewFromCourtYaw(courtYawDeg: number): 'side' | 'front-back' | 'angled' {
  if (courtYawDeg > SIDE_VIEW_COURT_YAW) return 'side'
  if (courtYawDeg < END_VIEW_COURT_YAW) return 'front-back'
  return 'angled'
}

/**
 * How far the hitting hand's path from the drop to contact runs off the net
 * direction, towards the hitting side, in degrees.
 *
 * Measured on the 40 Bath serves: between the drop and contact the hand
 * travels 0.60 m towards the net and 0.21 m towards the hitting side, relative
 * to the hips. One player, so a constant with a known source rather than a
 * population figure — a kick serve, swung up and across, will sit further
 * off. An error here moves the court angle by the same number of degrees and
 * does not flip it, which is the property the stance reading lacks.
 */
export const SWING_OFF_NET_DEG = 19.3

/**
 * The shortest drop-to-contact travel, in metres along the ground, that the
 * court direction is read from. A third of the Bath serves' 0.64 m: below it
 * the swing barely went anywhere, and the depth noise on its two ends is a
 * large share of what is left.
 */
const MIN_SWING_TRAVEL_M = 0.2

/** The keyframes and hand a swing reading needs — a `Skeleton` has them. */
export interface SwingWindow {
  keys: { drop: number; contact: number }
  racket: 'left' | 'right'
}

/**
 * The camera's angle to the court, from the direction the swing travelled.
 *
 * World landmarks come in the camera's frame — x across the picture, z away
 * from the lens — so the hand's travel along the ground from the drop to
 * contact has a direction against the lens, signed, and the net direction is
 * that turned back by `SWING_OFF_NET_DEG`. The depth half of it is inferred,
 * which is the usual objection, and it was measured rather than assumed: on
 * the Bath serves filmed from 24 places round the player, with depth jittered
 * four times as hard as the picture and a shared per-frame depth offset, this
 * reads the true angle to a median 2.9° (p90 7.8°, worst 12°), where the
 * stance reading is off by a median 20° and up to 37°. It neither saturates
 * square-on nor confuses the two sides, because it is an angle from a vector
 * rather than an inverse cosine of a length.
 *
 * Null when the swing went too short a way to point anywhere.
 */
export function courtYawFromSwing(frames: Frame[], swing: SwingWindow): number | null {
  const { drop, contact } = swing.keys
  if (!(contact > drop) || drop < 0 || contact >= frames.length) return null
  const wrist = swing.racket === 'left' ? LM.leftWrist : LM.rightWrist
  // Three samples about each end, so one jittered frame cannot set the
  // direction on its own.
  const at = (k: number) => {
    let x = 0
    let z = 0
    let n = 0
    for (let i = Math.max(0, k - 1); i <= Math.min(frames.length - 1, k + 1); i++) {
      const p = frames[i].world[wrist]
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue
      x += p.x
      z += p.z
      n++
    }
    return n ? { x: x / n, z: z / n } : null
  }
  const from = at(drop)
  const to = at(contact)
  if (!from || !to) return null
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (Math.hypot(dx, dz) < MIN_SWING_TRAVEL_M) return null

  // The swing veers towards the hitting side, so the net is that far back the
  // other way — and a left-hander's mirror image veers the other way.
  const off = swing.racket === 'left' ? SWING_OFF_NET_DEG : -SWING_OFF_NET_DEG
  const net = (Math.atan2(dz, dx) * 180) / Math.PI - off
  // The net direction's line against the picture's horizontal, 0–90.
  const across = ((net % 180) + 180) % 180
  const offPicture = across > 90 ? 180 - across : across
  return 90 - offPicture
}

export function assessSpatial(
  frames: Frame[],
  readyIndex: number,
  bodyHeight: number,
  /** Read the court angle from this swing when it is long enough; the stance otherwise. */
  swing?: SwingWindow,
): Spatial {
  const roll = estimateRoll(frames, readyIndex)
  const yaw = estimateYaw(frames, readyIndex, bodyHeight)
  const fromSwing = swing ? courtYawFromSwing(frames, swing) : null

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
    court_yaw_deg: Math.round(fromSwing ?? courtYawFrom(yaw.deg)),
    court_yaw_from: fromSwing === null ? 'stance' : 'swing',
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

/**
 * Rotate one point the same way `rotateFrames` rotates `Frame.image` points —
 * exported so anything else living in image-landmark space (x already
 * pre-multiplied by aspect, same as every `Frame.image` entry) can be carried
 * through a roll correction without a second copy of this arithmetic. The
 * racket boxes in `analyze.ts` and `PosePlayer.tsx` are the first callers
 * beyond `rotateFrames` itself; a ball flight is not, because `BallFlight.x`
 * is width-normalised rather than aspect-premultiplied — see `levelFlight` in
 * `ballTrack.ts`, which stays its own function for exactly that reason.
 */
export function rotateImagePoint(
  p: { x: number; y: number },
  theta: number,
  pivot: { cx: number; cy: number },
): { x: number; y: number } {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const dx = p.x - pivot.cx
  const dy = p.y - pivot.cy
  return { x: pivot.cx + dx * cos - dy * sin, y: pivot.cy + dx * sin + dy * cos }
}

function rotateFrames(frames: Frame[], theta: number, pivot: { cx: number; cy: number }): Frame[] {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)

  return frames.map((f) => ({
    ...f,
    image: f.image.map((p) => ({ ...p, ...rotateImagePoint(p, theta, pivot) })),
    world: f.world.map((p) => ({
      ...p,
      x: p.x * cos - p.y * sin,
      y: p.x * sin + p.y * cos,
    })),
  }))
}

/**
 * A clip filmed with the phone tilted past levelling, on its side or upside
 * down, refused for that.
 *
 * Asked before a serve is looked for, because the search needs the picture
 * upright. A clip rolled 90–110° used to be read anyway: the keyframes found in
 * a sideways picture put contact on the toss, so the player was told the clip
 * ended before the racket reached the ball, and went to film a longer clip of
 * the same sideways picture. Past 110° it was refused as not a serve. Both were
 * true that the clip was refused and false as to why. Under 30° the clip goes
 * on to be levelled (`assessSpatial`, `levelFrames`).
 *
 * The roll is the circular mean of the ankles-to-shoulders direction, hips
 * standing in for ankles out of shot, so a clip upside down averages to 180°
 * rather than to the 0° a median of ±179° would give.
 *
 * ONLY OVER FRAMES WHERE THAT BODY WAS SEEN, AND ONLY WHEN MOST OF THEM WERE.
 * The Commons table-tennis clip (`/clipbench.html`) tracks something with its
 * "shoulders" below its "hips" in every frame, steady to an R of 0.997, at
 * visibility under a half in three frames of four. It was refused as upside
 * down, which is the wrong reason for a clip with no serve in it — the same
 * failure this function exists to remove, in the other direction. A phone on
 * its side does not hide the body from the pose model; a picture it cannot
 * read does. So under half the clip seen, there is no verdict here, and the
 * search for a serve gives its own.
 */
export function turnedPicture(frames: Frame[]): NotAServeError | undefined {
  let sx = 0
  let sy = 0
  let seen = 0
  const vis = (f: Frame, a: number, b: number) =>
    Math.min(f.image[a]?.visibility ?? 0, f.image[b]?.visibility ?? 0)
  for (const f of frames) {
    const feetSeen = vis(f, LM.leftAnkle, LM.rightAnkle) > 0.5
    if (vis(f, LM.leftShoulder, LM.rightShoulder) <= 0.5) continue
    if (!feetSeen && vis(f, LM.leftHip, LM.rightHip) <= 0.5) continue
    seen++
    const shoulder = midXY(f, LM.leftShoulder, LM.rightShoulder)
    const base = feetSeen ? midXY(f, LM.leftAnkle, LM.rightAnkle) : midXY(f, LM.leftHip, LM.rightHip)
    const dx = shoulder.x - base.x
    const dy = shoulder.y - base.y
    const length = Math.hypot(dx, dy)
    if (length < 1e-4) continue
    // Upright is up the picture, which is negative y.
    sx += dx / length
    sy += -dy / length
  }
  if (seen < Math.max(8, frames.length / 2) || Math.hypot(sx, sy) < 1e-6) return undefined
  const roll = Math.abs((Math.atan2(sx, sy) * 180) / Math.PI)
  if (roll < MAX_PICTURE_ROLL) return undefined
  const place = 'Rest it on something steady at about waist height, ten steps to your side.'
  if (roll < 45) {
    return new NotAServeError('The phone was tilted too far to measure.', [
      'Stand the phone upright and level before you film.',
      'A small tilt is fine, and I straighten it out. This one leans too far to trust.',
      place,
    ])
  }
  return new NotAServeError(roll > 135 ? 'The video is upside down.' : 'The video is on its side.', [
    'Hold the phone upright, so you stand up in the picture.',
    place,
  ])
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
