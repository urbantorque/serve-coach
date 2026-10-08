/**
 * The hitch at the trophy (D3.4): a body that reaches the trophy, stops, and
 * swings from a standstill.
 *
 * WHAT REVERTED R52 WAS TEMPO. A trough in the racket hand's speed is also what
 * a slow, deliberate serve has, 2.3 times over, so a pause measured in seconds
 * or against a fixed speed calls slow serves hitched. Two things fix it. The
 * speed is the WHOLE body's — racket hand, tossing hand and hips together — so
 * a slow serve, still moving everywhere, never falls to nothing, while a hitch
 * stops all three at once. And "nothing" is measured against the player's own
 * peak, and the time spent there against their own motion, so a slower serve
 * scales both and moves neither.
 *
 * On the rig across `motionSeconds` 1.0, 1.35 and 2.0 with tracker noise, a
 * serve with no hitch reads a share of 0.015 (median, 95th percentile 0.061) at
 * 60 fps, a 0.15 s hitch 0.153 (5th percentile 0.107), and 0.3 s 0.218. All six
 * fixture Bath serves read 0.000 — real serves flow through the trophy.
 *
 * ONLY AT 60 FPS AND ABOVE, as the roadmap asked. The rig separates the two at
 * 30 fps too, but on real footage a pause of a few samples is the tracker
 * losing a limb as often as a body stopping.
 *
 * MEASURED AND NOT GRADED: no study gives a pause length a club serve may
 * carry. See `UNCALIBRATED.hitch_share_ratio`.
 */
import { planarSpeedSeries, sampleRadius, timeline } from './kinematics'
import { LM, sided } from './geometry'
import type { Skeleton } from './phases'
import type { Frame } from './types'

export interface Hitch {
  /** Time between the toss and the drop with the body near still, as a share of the motion. */
  share: number
}

/** "Still" is under this share of the body's own peak speed. */
const STILL = 0.06

/** Below this many samples a second, no reading. */
export const HITCH_MIN_RATE = 55

export function readHitch(frames: Frame[], skel: Pick<Skeleton, 'keys' | 'bodyHeight' | 'racket' | 'toss'>): Hitch | undefined {
  const { keys, bodyHeight } = skel
  const span = frames[frames.length - 1].t - frames[0].t
  if (!(span > 0) || (frames.length - 1) / span < HITCH_MIN_RATE) return undefined
  if (!(keys.drop > keys.toss) || !(keys.contact > keys.ready)) return undefined

  const t = timeline(frames)
  const radius = sampleRadius(t, 0.03)
  const parts = [sided(skel.racket).wrist, sided(skel.toss).wrist, LM.leftHip].map((lm) =>
    planarSpeedSeries(frames, lm, bodyHeight, radius),
  )
  const speed = (i: number) => parts.reduce((sum, s) => sum + s[i], 0)
  let peak = 0
  for (let i = keys.ready; i <= keys.contact; i++) peak = Math.max(peak, speed(i))
  if (!(peak > 0)) return undefined

  let still = 0
  for (let i = keys.toss; i < keys.drop; i++) if (speed(i) < STILL * peak) still += frames[i + 1].t - frames[i].t
  const motion = frames[keys.contact].t - frames[keys.ready].t
  return { share: Math.round((still / motion) * 1000) / 1000 }
}
