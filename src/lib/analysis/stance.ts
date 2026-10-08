/**
 * Platform or pinpoint: which stance the serve was hit from (D3.2).
 *
 * A CONTEXT READING, LIKE THE SERVE TYPE, NEVER A FAULT. Both stances are
 * correct; what the answer decides is which of two correct drills applies, and
 * how the leg readings around it should be read. Nothing here is graded.
 *
 * Read as how far the feet close between the ready position and the trophy: a
 * pinpoint server slides the back foot up to the front one during the wind-up,
 * a platform server leaves it where it was. On the rig's `pinpointSlide` dial
 * the closure reads the dial to two hundredths from the guide's placement, with
 * tracker noise or without, and every one of the forty Bath serves reads as a
 * platform (closure 0.09 at most) from the side and from behind.
 *
 * ONLY FROM THE SIDE OR FROM BEHIND. From a corner the feet's projection changes
 * as the hips turn, so a platform stance closes in the picture without the feet
 * moving: the rig's reads 0.26 at 45°, and the Bath serves 0.19–0.72 from a rear
 * corner. There the stance is not read at all.
 */
import { LM, median } from './geometry'
import type { Skeleton } from './phases'
import type { Frame } from './types'

export interface Stance {
  kind: 'platform' | 'pinpoint'
  /** How much of the ready gap between the feet closed by the trophy, 0–1. */
  closure: number
}

/** At least this much of the gap closed: the back foot came up. */
export const PINPOINT_CLOSURE = 0.4
/** At most this much: the feet stayed put. Between the two, no call. */
export const PLATFORM_CLOSURE = 0.25

/**
 * Feet closer than this at the ready, in body heights, leave no gap whose
 * closing can be read — a stance already narrow is neither answer.
 */
const MIN_READY_GAP = 0.04

const feetSeen = (f: Frame) =>
  Math.min(f.image[LM.leftAnkle]?.visibility ?? 0, f.image[LM.rightAnkle]?.visibility ?? 0) > 0.5

const gap = (f: Frame) =>
  Math.hypot(f.image[LM.leftAnkle].x - f.image[LM.rightAnkle].x, f.image[LM.leftAnkle].y - f.image[LM.rightAnkle].y)

export function readStance(
  frames: Frame[],
  skel: Pick<Skeleton, 'keys' | 'bodyHeight'>,
  view: 'side' | 'front-back' | 'angled',
): Stance | undefined {
  if (view === 'angled') return undefined
  const { ready, trophy } = skel.keys
  if (!(trophy > ready)) return undefined
  const window = frames.slice(ready, trophy + 1)
  if (window.length < 3 || window.filter(feetSeen).length < window.length * 0.8) return undefined

  // The stance as it stood: the median of the few samples up to the ready, so
  // one jittered frame cannot set the baseline.
  const standing = median(frames.slice(Math.max(0, ready - 3), ready + 1).filter(feetSeen).map(gap))
  if (!(standing / skel.bodyHeight >= MIN_READY_GAP)) return undefined

  // The narrowest the feet got before the legs drove, on a three-sample mean so
  // a single frame's jitter is not a slide.
  const gaps = window.map(gap)
  const smoothed = gaps.map((_, i) => {
    const near = gaps.slice(Math.max(0, i - 1), i + 2)
    return near.reduce((a, b) => a + b, 0) / near.length
  })
  const closure = Math.max(0, 1 - Math.min(...smoothed) / standing)
  const rounded = Math.round(closure * 100) / 100
  if (closure >= PINPOINT_CLOSURE) return { kind: 'pinpoint', closure: rounded }
  if (closure <= PLATFORM_CLOSURE) return { kind: 'platform', closure: rounded }
  return undefined
}
