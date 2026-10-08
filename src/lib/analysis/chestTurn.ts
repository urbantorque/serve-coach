/**
 * When the chest turns to the net, read from the side (D3.6).
 *
 * WIDTH, NOT DEPTH. From the side the shoulder line is widest in the picture
 * while it points down the court and narrowest once it faces the net, so how
 * wide it looks against its own length says how far it has turned, with no
 * inferred depth in it. Its length comes from the world skeleton, as a share of
 * the body's height, which a model estimates far better than it estimates where
 * a joint sits along the lens; the vertical part of the line (the shoulders'
 * tilt) is taken out first, so a cartwheel does not read as a turn.
 *
 * TIMING, NEVER DEGREES. A width cannot tell a line coiled past side-on from
 * one turned just as far the other way, so the trophy, where the coil peaks, is
 * exactly where it is least sensitive — the research brief's caution. What it
 * does tell, unambiguously, is when the line passes half-turned on its way to
 * the net: below `HALF_OPEN` of its length after the last moment it was wider.
 * That instant is reported against the racket's low point.
 *
 * WHY THE LOW POINT. The upper trunk turns fastest 58 ms before impact
 * (Fleisig 2003) and the racket's low point comes about 130 ms before it
 * (Newton 2025), so a chest that is half turned before the racket has dropped
 * is unwinding a whole phase ahead of the swing. The forty Bath serves are half
 * turned 75–200 ms after the low point (median 121) from both sides of the
 * court at 30 and 60 fps, and the rig's open chest never closes at all. Read
 * against the hips instead, this would be the shoulders-before-hips order the
 * research retired (`hip_lead_ms`).
 *
 * ONLY FROM THE SIDE. From a corner the widest view of the line is a different
 * yaw, and from behind the turn runs along the lens; there it is not read. And
 * the side is a range, not a line: "half turned" is half turned from the lens,
 * so a camera 8° round moves the instant. A chest turned well ahead of the
 * swing reads early from 82° to 90°; one only a little open (the rig's
 * shoulders 21° round at the trophy) reads −81 ms from 82° and +29 from 90°.
 */
import { LM, median } from './geometry'
import type { Skeleton } from './phases'
import type { Frame } from './types'

export interface ChestTurn {
  /**
   * When the shoulder line passed half-turned to the net, ms against the racket's
   * low point; negative is before it. A chest that never closed after the trophy
   * reads as open at the trophy.
   */
  shouldersMs: number
  /** The same for the hip line. */
  hipsMs: number
}

/** Half-turned: the line's width in the picture falls under this share of its length (45°). */
export const HALF_OPEN = Math.SQRT1_2

/**
 * How wide a girdle line looks against its own length, 0 (facing the lens) to 1
 * (across it), one value per frame.
 */
function openness(frames: Frame[], left: number, right: number, span: number): number[] {
  return frames.map((f) => {
    const a = f.image[left]
    const b = f.image[right]
    const dx = Math.abs(a.x - b.x)
    // The tilt's share of the length comes out first, capped so a noisy
    // vertical cannot leave nothing to divide by.
    const dy = Math.min(Math.abs(a.y - b.y), 0.9 * span)
    return dx / Math.sqrt(span * span - dy * dy)
  })
}

/** A girdle line's length in image units, from the world skeleton's proportions. */
function spanOf(frames: Frame[], from: number, to: number, left: number, right: number, bodyHeight: number): number {
  const shares: number[] = []
  for (let i = from; i <= to; i++) {
    const w = frames[i].world
    const stature = ((w[LM.leftAnkle].y + w[LM.rightAnkle].y) / 2 - w[LM.nose].y) / 0.93
    const length = Math.hypot(w[left].x - w[right].x, w[left].y - w[right].y, w[left].z - w[right].z)
    if (stature > 0 && Number.isFinite(length)) shares.push(length / stature)
  }
  return shares.length ? median(shares) * bodyHeight : NaN
}

/**
 * When, between the trophy and contact, a line last fell through half-open,
 * interpolated between samples. The trophy itself when it was never wider after
 * it.
 */
function halfOpenAt(frames: Frame[], open: number[], trophy: number, contact: number): number {
  for (let i = contact; i >= trophy; i--) {
    if (open[i] < HALF_OPEN) continue
    if (i === contact) return frames[contact].t
    const u = (open[i] - HALF_OPEN) / Math.max(1e-9, open[i] - open[i + 1])
    return frames[i].t + u * (frames[i + 1].t - frames[i].t)
  }
  return frames[trophy].t
}

export function readChestTurn(
  frames: Frame[],
  skel: Pick<Skeleton, 'keys' | 'bodyHeight'>,
  view: 'side' | 'front-back' | 'angled',
): ChestTurn | undefined {
  if (view !== 'side') return undefined
  const { keys, bodyHeight } = skel
  if (!(keys.contact > keys.drop && keys.drop > keys.trophy)) return undefined

  const shoulderSpan = spanOf(frames, keys.ready, keys.contact, LM.leftShoulder, LM.rightShoulder, bodyHeight)
  const hipSpan = spanOf(frames, keys.ready, keys.contact, LM.leftHip, LM.rightHip, bodyHeight)
  if (!(shoulderSpan > 0) || !(hipSpan > 0)) return undefined

  const drop = frames[keys.drop].t
  const ms = (t: number) => Math.round((t - drop) * 1000)
  return {
    shouldersMs: ms(halfOpenAt(frames, openness(frames, LM.leftShoulder, LM.rightShoulder, shoulderSpan), keys.trophy, keys.contact)),
    hipsMs: ms(halfOpenAt(frames, openness(frames, LM.leftHip, LM.rightHip, hipSpan), keys.trophy, keys.contact)),
  }
}
