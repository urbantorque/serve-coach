/**
 * Whether the camera moved during the serve (L5.5).
 *
 * Every height this app reports is a fraction of `bodyHeight`, measured once
 * in the stance. A phone that drifts closer or further after that, or tips up
 * or down, changes every height read after it without the player changing at
 * all — and until now nothing compared the picture at contact with the
 * picture the calibration was taken from.
 *
 * TWO READINGS, BOTH INDEPENDENT OF THE POSE.
 *
 *   · Scale: the body's segments in the picture against the same segments in
 *     the world skeleton, in the plane the picture shows (x across, y down;
 *     depth left out). A body bending or turning changes both together; only
 *     the camera changes one without the other.
 *   · The ground line: the lowest the feet sit in the picture. Planted feet on
 *     a flat court do not move up or down the picture unless the camera tipped.
 *
 * The thresholds sit well above what a still camera's tracker noise moves
 * either reading (\`cameraMotion.test.ts\` has the margins).
 */
import { LM, median } from './geometry'
import type { Frame } from './types'

/** Scale may drift this share between the ready and contact before the camera counts as moved. */
export const SCALE_DRIFT_LIMIT = 0.07

/** The ground line may move this many standing heights before the camera counts as moved. */
export const GROUND_DRIFT_LIMIT = 0.03

const SEGMENTS: [number, number][] = [
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
]

/** Picture units per world metre for one frame, from the segments that were seen. */
function projectionScale(f: Frame): number | undefined {
  let image = 0
  let world = 0
  for (const [a, b] of SEGMENTS) {
    const ia = f.image[a]
    const ib = f.image[b]
    const wa = f.world[a]
    const wb = f.world[b]
    if (!ia || !ib || !wa || !wb) continue
    if ((ia.visibility ?? 1) < 0.5 || (ib.visibility ?? 1) < 0.5) continue
    image += Math.hypot(ia.x - ib.x, ia.y - ib.y)
    world += Math.hypot(wa.x - wb.x, wa.y - wb.y)
  }
  return world > 1e-6 ? image / world : undefined
}

/** Least-squares slope of values against times. */
function slope(ts: number[], vs: number[]): number {
  const n = ts.length
  const mt = ts.reduce((a, b) => a + b, 0) / n
  const mv = vs.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (ts[i] - mt) * (vs[i] - mv)
    den += (ts[i] - mt) ** 2
  }
  return den > 0 ? num / den : 0
}

/** The lowest a frame's feet sit in the picture. */
function groundOf(f: Frame): number | undefined {
  const ys = [f.image[LM.leftAnkle], f.image[LM.rightAnkle]]
    .filter((l) => l && (l.visibility ?? 1) >= 0.5)
    .map((l) => l.y)
  return ys.length ? Math.max(...ys) : undefined
}

/** The stance has to be at least this many frames for a drift across it to mean anything. */
const MIN_STANCE_FRAMES = 6

export interface CameraMotion {
  /** Fractional change in picture scale the stance's drift carries to contact. */
  scaleDrift?: number
  /** Standing heights the ground line's drift in the stance carries to contact. */
  groundDrift?: number
  moved: boolean
}

/**
 * WHERE IT LOOKS, AND WHY THERE. Across the stance before the toss, the one
 * stretch where the player is known to stand still. Over the swing itself a
 * still camera reads drift too: the player travels towards or away from the
 * lens and lands a foot nearer or further, and a phone stepping back looks
 * exactly like a player stepping forward. In the stance, any drift is the
 * camera's, and its rate carried to contact is how far it moved by then.
 * A phone that lurches once mid-swing is not caught; one drifting steadily in
 * a hand, or sliding on a stand, is.
 */
export function cameraMotion(
  frames: readonly Frame[],
  keys: { ready: number; contact: number },
  bodyHeight: number,
): CameraMotion {
  const stance = frames.slice(0, Math.max(0, keys.ready) + 1)
  const contactT = frames[Math.min(frames.length - 1, keys.contact)]?.t
  if (stance.length < MIN_STANCE_FRAMES || contactT === undefined) return { moved: false }
  const horizon = contactT - stance[0].t

  const scaled = stance.map((f) => ({ t: f.t, s: projectionScale(f) })).filter((x): x is { t: number; s: number } => x.s !== undefined)
  const scaleDrift =
    scaled.length >= MIN_STANCE_FRAMES
      ? Math.abs(slope(scaled.map((x) => x.t), scaled.map((x) => x.s)) * horizon) / median(scaled.map((x) => x.s))
      : undefined

  const grounded = stance.map((f) => ({ t: f.t, y: groundOf(f) })).filter((x): x is { t: number; y: number } => x.y !== undefined)
  const groundDrift =
    grounded.length >= MIN_STANCE_FRAMES && bodyHeight > 0
      ? Math.abs(slope(grounded.map((x) => x.t), grounded.map((x) => x.y)) * horizon) / bodyHeight
      : undefined

  const moved =
    (scaleDrift !== undefined && scaleDrift > SCALE_DRIFT_LIMIT) ||
    (groundDrift !== undefined && groundDrift > GROUND_DRIFT_LIMIT)
  return {
    ...(scaleDrift !== undefined ? { scaleDrift } : {}),
    ...(groundDrift !== undefined ? { groundDrift } : {}),
    moved,
  }
}
