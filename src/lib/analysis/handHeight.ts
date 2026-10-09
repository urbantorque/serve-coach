/**
 * How high the racket hand was at contact, without the lens's perspective in
 * it (D7.4).
 *
 * WHAT WAS WRONG. Read straight off the picture, the hand's height is scaled by
 * how far it is from the lens, and at contact it is well off the body's plane:
 * from the guide's side of the court it meets the ball behind the body, further
 * from the phone than the hips the height is measured against, and reads short;
 * from the other side it reads tall. On the forty Bath serves filmed from five
 * places players stand, the medians ran from 1.112 to 1.267 — four rungs of the
 * old ladder, set by where the phone stood (`CAMERA_ALLOWANCE`).
 *
 * WHAT THIS DOES INSTEAD. The hips sit in the body's own plane, so their height
 * is taken from the picture as before; the hand's height ABOVE the hips is taken
 * from the world skeleton, which is metric and carries no perspective, over the
 * stature the same skeleton gives. The same idea D7.7 used for the hand's order
 * against the elbow. The five placements then agree to 0.023 (medians 1.211 to
 * 1.234), every one of the forty serves reads 1.174 to 1.246 from every place,
 * and the rig — drawn without perspective, so its picture and skeleton already
 * agree — moves by a hundredth.
 *
 * Falls back to the picture alone when the world skeleton gives no stature.
 */
import { peakBetween } from './between'
import { LM, clamp, median } from './geometry'
import type { Skeleton } from './phases'
import type { Frame } from './types'

/** The world skeleton's standing height, by the same nose-to-ankles rule `detectServe` uses on the picture. */
function worldStature(frames: Frame[], from: number, to: number): number {
  const statures: number[] = []
  for (let i = Math.max(0, from); i <= Math.min(frames.length - 1, to); i++) {
    const w = frames[i].world
    const s = ((w[LM.leftAnkle].y + w[LM.rightAnkle].y) / 2 - w[LM.nose].y) / 0.93
    if (Number.isFinite(s) && s > 0) statures.push(s)
  }
  return statures.length ? median(statures) : NaN
}

export function handHeightAt(
  frames: Frame[],
  skel: Pick<Skeleton, 'keys' | 'bodyHeight' | 'groundY'>,
  frame: Frame,
  wrist: number,
): number {
  const { keys, bodyHeight, groundY } = skel
  const pictured = (groundY - frame.image[wrist].y) / bodyHeight
  const stature = worldStature(frames, keys.ready, keys.contact)
  if (!(stature > 0)) return pictured
  const hips = (frame.image[LM.leftHip].y + frame.image[LM.rightHip].y) / 2
  const hipsWorld = (frame.world[LM.leftHip].y + frame.world[LM.rightHip].y) / 2
  const above = (hipsWorld - frame.world[wrist].y) / stature
  return Number.isFinite(above) ? (groundY - hips) / bodyHeight + above : pictured
}

/**
 * The hand's height at contact: the top of its reach between samples, not the
 * nearest sample's (`between.ts`, L2.6). The card and the diagnosis both read
 * it here, so the two cannot come apart.
 *
 * Read at 32 fps against 50 on the rig and the six Bath serves from two
 * placements, the nearest sample sat up to 1.58 of the reading's own noise
 * deviations away; this sits 0.68.
 */
export function contactHeightOf(
  frames: Frame[],
  skel: Pick<Skeleton, 'keys' | 'bodyHeight' | 'groundY'>,
  wrist: number,
): number {
  const near = [-1, 0, 1].map((d) => clamp(skel.keys.contact + d, 0, frames.length - 1))
  return peakBetween(
    near.map((i) => handHeightAt(frames, skel, frames[i], wrist)),
    near.map((i) => frames[i].t),
    1,
  )
}
