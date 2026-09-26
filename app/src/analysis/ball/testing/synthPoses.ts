/**
 * Standing-player poses projected through a synthetic camera (test support only), so the
 * ball layer's pose-derived scale and toss band can be tested against the same ground truth
 * as the ball. Only the landmarks the ball layer reads are placed; the rest sit at the hip.
 */
import { LM, type Landmark, type PoseFrame } from '../../types.ts'
import { gaussian, type Rng } from '../random.ts'
import { project, type Camera, type Vec3 } from './synthTrajectories.ts'

/** Landmark heights as fractions of stature (nose 0.925 and heel 0.01 match scale.ts). */
const PLACEMENTS: [LM, number, number][] = [
  // [landmark, x offset (m, + toward the net), height fraction]
  [LM.NOSE, 0.08, 0.925],
  [LM.LEFT_SHOULDER, 0.02, 0.82],
  [LM.RIGHT_SHOULDER, -0.02, 0.82],
  [LM.LEFT_WRIST, 0.2, 0.5],
  [LM.RIGHT_WRIST, -0.15, 0.52],
  [LM.LEFT_HIP, 0.02, 0.53],
  [LM.RIGHT_HIP, -0.02, 0.53],
  [LM.LEFT_ANKLE, 0.12, 0.04],
  [LM.RIGHT_ANKLE, -0.12, 0.04],
  [LM.LEFT_HEEL, 0.1, 0.01],
  [LM.RIGHT_HEEL, -0.14, 0.01],
]

export function standingPoseFrames(
  camera: Camera,
  statureM: number,
  times: number[],
  rng: Rng,
  options: { baseX?: number; noiseNorm?: number; timestampOf?: (t: number) => number } = {},
): PoseFrame[] {
  const baseX = options.baseX ?? 0
  const noise = options.noiseNorm ?? 0.002
  return times.map((t, frameIndex) => {
    const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.2 }))
    for (const [index, dx, fraction] of PLACEMENTS) {
      const world: Vec3 = { x: baseX + dx, y: fraction * statureM, z: 0 }
      const p = project(camera, world)
      landmarks[index] = { x: p.x + (noise * gaussian(rng)) / camera.aspect, y: p.y + noise * gaussian(rng), visibility: 0.95 }
    }
    return { frameIndex, tReal: (options.timestampOf ?? ((x) => x))(t), landmarks, score: 0.95, source: 'injected' }
  })
}
