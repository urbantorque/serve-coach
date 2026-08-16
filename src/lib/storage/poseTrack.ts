/**
 * The six keyframes kept as a body rather than as six photographs.
 *
 * A stored report keeps base64 JPEGs of its keyframes, and the prune ladder
 * strips them past `KEEP_STILLS` because they are nearly all of a row's weight.
 * The consequence is on screen: open a report from two months ago and the
 * filmstrip is six grey rectangles. The numbers survived and the pictures did
 * not, so the one thing a player wanted to look back at is the one thing gone.
 *
 * WHY THIS IS AFFORDABLE WHEN THE PICTURES ARE NOT. A keyframe still is 4–8 kB
 * of base64; six of them are 24–48 kB. Six poses at the precision below are
 * about 1.5 kB — fifteen to thirty times cheaper — because a body is 33 points
 * and a photograph is a hundred thousand pixels of court, sky and fence that
 * nothing ever reads. `footprint.test.ts` measures both.
 *
 * WHY ONLY THE KEYFRAMES. The whole swing at this precision is 21.5 kB, which is
 * still cheaper than the stills, and storing it would make a saved serve
 * replayable as motion — that is the larger idea this format is deliberately
 * shaped to grow into. It is not this change. Six poses fix the blank filmstrip,
 * which is a defect on screen today, and a format that ships with a reader is
 * worth more than one that ships with a plan.
 *
 * THREE DECIMALS, AND IT IS A MEASUREMENT. Landmarks are normalised to the
 * frame, so the rounding step is a thousandth of the frame — at most half a
 * pixel at 1080p, against five pixels and a visibly wrong elbow at two decimals.
 * Pinned in `footprint.test.ts` rather than argued here.
 *
 * NOT A PHOTOGRAPH, AND THE DIFFERENCE IS THE POINT. This is what the tracker
 * saw, not what the camera did. It cannot show a player their grip, their face,
 * the light or the fence behind them, and it never becomes a still that could be
 * mistaken for one. It is also, for the same reason, the only part of a report
 * that carries no image of anybody — which is a privacy property worth having on
 * the thing that outlives the pictures.
 */
import type { Frame, Landmark, Phase } from '../analysis/types'

/** Decimals kept for a normalised landmark coordinate. */
export const POSE_PRECISION = 3
/** Decimals kept for visibility, which only ever gates drawing. */
const VISIBILITY_PRECISION = 2
/** Values per landmark in a row: x, y, visibility. */
const STRIDE = 3

export interface KeyframePoses {
  /**
   * Video width ÷ height, carried because `drawSkeleton` pre-multiplies image x
   * by it and a stored report has no video left to ask.
   */
  aspect: number
  /**
   * One row per phase, in the report's own `phases` order, or `null` for a phase
   * whose frame was not available. Flat rather than objects: the keys are two
   * thirds of the bytes in the object form, and nothing reads a row except the
   * function below.
   */
  rows: (number[] | null)[]
}

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p

/**
 * Encode the pose at each keyframe.
 *
 * Takes the phases rather than raw indices so the rows line up with the array
 * the report renders, position for position — a row that meant a different
 * keyframe from the caption beside it would be worse than a grey rectangle.
 *
 * `undefined` when nothing could be encoded at all, so a caller stores no field
 * rather than an empty one.
 */
export function keyframePoses(
  frames: readonly Frame[],
  phases: readonly Pick<Phase, 'frame'>[],
  aspect: number,
): KeyframePoses | undefined {
  if (!frames.length || !phases.length || !(aspect > 0)) return undefined

  let any = false
  const rows = phases.map((p) => {
    const f = frames[p.frame]
    if (!f?.image?.length) return null
    any = true
    const row: number[] = []
    for (const lm of f.image) {
      row.push(
        round(lm.x, POSE_PRECISION),
        round(lm.y, POSE_PRECISION),
        round(lm.visibility, VISIBILITY_PRECISION),
      )
    }
    return row
  })

  return any ? { aspect: round(aspect, 4), rows } : undefined
}

/**
 * Rebuild a drawable frame from one stored row.
 *
 * A `Frame` is more than landmarks — it has an index, a timestamp, a visibility
 * and a world track — and none of that survives, so the parts that are not
 * stored come back as the honest absence rather than as plausible values. `t` is
 * zero because nothing seeks a stored report, `world` is empty because no world
 * landmarks were kept, and anything that wanted those has to notice they are
 * missing rather than read a fabricated number.
 *
 * `undefined` for a row that was never captured or is the wrong length, which is
 * also the guard against a row written by a build that used a different stride.
 */
export function poseFrameAt(poses: KeyframePoses | undefined, index: number): Frame | undefined {
  const row = poses?.rows?.[index]
  if (!row || row.length === 0 || row.length % STRIDE !== 0) return undefined

  const image: Landmark[] = []
  for (let i = 0; i < row.length; i += STRIDE) {
    image.push({ x: row[i], y: row[i + 1], z: 0, visibility: row[i + 2] })
  }
  return { index, t: 0, image, world: [], visibility: 1 }
}

/**
 * A stored value reshaped so nothing downstream throws on it.
 *
 * Reports outlive the code that wrote them, and this one is read straight into a
 * drawing loop. A row of the wrong length, a row that is not an array, or an
 * aspect of zero all produce a canvas full of `NaN` rather than an exception, so
 * the check is here rather than at the point of drawing.
 */
export function readKeyframePoses(v: unknown): KeyframePoses | undefined {
  if (!v || typeof v !== 'object') return undefined
  const raw = v as { aspect?: unknown; rows?: unknown }
  if (typeof raw.aspect !== 'number' || !(raw.aspect > 0)) return undefined
  if (!Array.isArray(raw.rows)) return undefined

  const rows = raw.rows.map((r) =>
    Array.isArray(r) && r.length > 0 && r.length % STRIDE === 0 && r.every((n) => typeof n === 'number')
      ? (r as number[])
      : null,
  )
  return rows.some(Boolean) ? { aspect: raw.aspect, rows } : undefined
}
