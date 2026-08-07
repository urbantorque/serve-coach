/**
 * The shape the app is asking for, drawn.
 *
 * Every target in the report is a number with a sentence attached — "35–62° of
 * knee bend", "let the racket fall until you could scratch between your shoulder
 * blades". Those are descriptions of a *position*, and a position is much easier
 * to copy than to read. A player who cannot picture the trophy from the words
 * can copy it from a silhouette in about a second.
 *
 * The model is not an idealised drawing: it is the same parametric rig the tests
 * run against, with every dial set to the middle of the band the report scores
 * against. That matters — it means the ghost and the target band can never drift
 * apart, because they are the same numbers. If a band is retuned, the shape the
 * player is shown moves with it.
 */
import { LM, type Side } from './geometry'
import { detectServe, type Keyframes } from './phases'
import { buildServe, type ServeDials } from './__tests__/syntheticServe'
import type { Frame, Landmark, PhaseId } from './types'

/**
 * Every dial set to the middle of the band the report scores it against.
 *
 * The comment on each line is the measurement it comes from, so the two cannot
 * be changed independently without someone noticing.
 */
export const MODEL_DIALS: Partial<ServeDials> = {
  trophyKneeAngle: 131, // kneeBend 35–62°, mid 48.5 → 180 − 48.5
  shoulderTilt: 23, // shoulderTilt 14–32°
  shoulderYaw: 82, // the rig's side-on reference
  hipYaw: 55, // hipShoulderSeparation 15–38°, mid 26.5 → 82 − 26.5
  contactReach: 1.39, // contactHeight 1.28–1.5×
  dropBelowShoulder: 0.45, // dropDepth 0.16–0.34×, mid 0.25 × 1.8 m
  tossElbow: 172, // tossArmExtension 163–180°
  tossArmHold: 0.78, // tossArmHold 55–100%
  contactHipHeight: 1.15, // legDrive 0.1–0.24×
  motionSeconds: 1.35, // totalTime 900–1800 ms
  tossWobble: 0,
  noise: 0,
  dropout: 0,
}

const MODEL_FPS = 50

let cached: { frames: Frame[]; keys: Keyframes; bodyHeight: number; racket: Side } | undefined

/** Built once and reused — the dials never change at runtime. */
export function modelServe() {
  if (!cached) {
    const frames = buildServe(MODEL_DIALS, MODEL_FPS)
    const skel = detectServe(frames, MODEL_FPS)
    cached = { frames, keys: skel.keys, bodyHeight: skel.bodyHeight, racket: skel.racket }
  }
  return cached
}

/**
 * The model's pose at one keyframe, moved and scaled onto a real player.
 *
 * Aligned on the hips rather than the feet or the head. The hips are the one
 * landmark that is reliably tracked, near the centre of the body, and roughly
 * stationary through the part of the motion being compared — aligning on the
 * feet would make a player who has jumped appear to be standing somewhere else
 * entirely, and aligning on the head would swing the legs around wildly for a
 * few degrees of difference in posture.
 *
 * Both coordinate spaces are aspect-corrected, so x and y share a unit in each
 * and a single uniform scale factor is correct — no separate x and y scaling,
 * which would shear the model and quietly change the very angles it is there to
 * demonstrate.
 */
export function modelPoseAt(
  phase: PhaseId,
  player: { frame: Frame; bodyHeight: number; racket: Side },
): Landmark[] | undefined {
  const model = modelServe()
  const index = model.keys[phase as keyof Keyframes]
  if (index === undefined || !player.bodyHeight || !model.bodyHeight) return undefined

  const source = model.frames[index]
  if (!source) return undefined

  const scale = player.bodyHeight / model.bodyHeight
  const modelHip = midOf(source.image[LM.leftHip], source.image[LM.rightHip])
  const playerHip = midOf(player.frame.image[LM.leftHip], player.frame.image[LM.rightHip])

  // The rig is right-handed. A left-hander needs it mirrored about the hips, or
  // they are shown a model serving with the wrong arm.
  const flip = player.racket === model.racket ? 1 : -1
  const mapped = source.image.map((l) => ({
    x: playerHip.x + (l.x - modelHip.x) * scale * flip,
    y: playerHip.y + (l.y - modelHip.y) * scale,
    z: l.z,
    visibility: 1,
  }))

  if (flip === -1) {
    // Mirroring the coordinates is not enough: left and right landmarks have to
    // swap indices too, or the model's left knee is drawn where its right one
    // should be and every limb crosses over.
    const swapped = [...mapped]
    for (const [a, b] of MIRROR_PAIRS) {
      swapped[a] = mapped[b]
      swapped[b] = mapped[a]
    }
    return swapped
  }

  return mapped
}

const midOf = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** MediaPipe's left/right landmark pairs. */
const MIRROR_PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
]

/** What the model is showing at each position, for the caption under it. */
export const MODEL_NOTES: Partial<Record<PhaseId, string>> = {
  toss: 'Tossing arm straight, ball released at full stretch above eye level.',
  trophy: 'Knees loaded around 45°, hitting shoulder dropped under the tossing one, chest opening to the sky.',
  drop: 'Racket hand fallen well below the shoulder, elbow still high and leading.',
  contact: 'Arm long, body stretched up off the court, contact at the top of the reach and in front.',
}
