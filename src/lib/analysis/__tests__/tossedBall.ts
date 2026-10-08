/**
 * A tossed ball for the rig, which throws none.
 *
 * Gravity-true in the picture, under the gravity `findBall` expects: it falls
 * 0.35 body heights from its apex to a point 0.2 above the racket hand, which
 * it meets at `impact`, seconds on the frames' clock. Every sample from 0.4 s
 * before the apex up to `lastSeen` is on the arc, at the frames' own times.
 */
import type { Skeleton } from '../phases'
import type { Frame } from '../types'
import type { BallFlight } from '../../vision/ballTrack'

export function tossedBall(frames: Frame[], skel: Skeleton, impact: number, lastSeen = impact): BallFlight {
  const wrist = skel.racket === 'left' ? 15 : 16
  const g = (9.81 * skel.bodyHeight) / 1.78
  const hand = frames[skel.keys.contact].image[wrist]
  const atImpact = hand.y - 0.2 * skel.bodyHeight
  const apexY = atImpact - 0.35 * skel.bodyHeight
  const apexT = impact - Math.sqrt((2 * (atImpact - apexY)) / g)
  const coefficients: [number, number, number] = [apexY + (g / 2) * apexT * apexT, -g * apexT, g / 2]
  const y = (t: number) => coefficients[0] + coefficients[1] * t + coefficients[2] * t * t
  const samples = frames
    .filter((f) => f.t >= apexT - 0.4 && f.t <= lastSeen + 1e-9)
    .map((f) => ({ t: f.t, x: hand.x, y: y(f.t) }))
  return { coefficients, apex: { t: apexT, x: hand.x, y: apexY }, samples, confidence: 0.9 }
}
