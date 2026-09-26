import { BONES, buildBodyParts, boneTransforms, packBones, type Outfit } from './bodyShape.ts'
import { BALL } from './ball.ts'
import { makeIntrinsics, project, projectedRadiusPx, type Camera, type Extrinsics, type Intrinsics } from './camera.ts'
import { COURT, courtLines } from './court.ts'
import type { ClipMotion } from './kinematics/motion.ts'
import { flickerGain, type LightingLook } from './look.ts'
import { basisToQuat, type Vec3 } from './math/vec.ts'
import type { CourtSurface, FrameData, SceneDescription } from './render/sceneTypes.ts'

export interface RenderSetup {
  clip: ClipMotion
  intrinsics: Intrinsics
  baseExtrinsics: Extrinsics
  shake?: (tRealS: number, base: Extrinsics) => Extrinsics
  captureFps: number
  shutterS: number
  bodyBlurSamples: number
  look: LightingLook
  surface: CourtSurface
  outfit: Outfit
  environmentSeed: number
  /** Real time of frame 0 (s). */
  t0S?: number
}

export const MAX_BALLS = 12

export function frameTimeReal(setup: RenderSetup, i: number): number {
  return (setup.t0S ?? 0) + i / setup.captureFps
}

export function cameraAt(setup: RenderSetup, tRealS: number): Camera {
  const ext = setup.shake ? setup.shake(tRealS, setup.baseExtrinsics) : setup.baseExtrinsics
  return { intrinsics: setup.intrinsics, extrinsics: ext }
}

/** Radial overscan needed so the undistorted render covers every distorted output pixel. */
export function distortionOverscan(I: Intrinsics): number {
  if (I.k1 === 0 && I.k2 === 0) return 1
  const rd = Math.hypot(I.widthPx / 2, I.heightPx / 2) / I.fxPx
  let ru = rd
  for (let i = 0; i < 50; i++) {
    const r2 = ru * ru
    ru = rd / (1 + I.k1 * r2 + I.k2 * r2 * r2)
  }
  return Math.max(1, ru / rd)
}

export function sceneDescription(setup: RenderSetup, output: SceneDescription['output'] = 'rgba'): SceneDescription {
  const I = setup.intrinsics
  const ovs = distortionOverscan(I)
  const even = (x: number) => 2 * Math.ceil(x / 2)
  const cam = setup.baseExtrinsics.position
  const stance = setup.clip.pose(0).pelvis
  return {
    width: I.widthPx,
    height: I.heightPx,
    renderWidth: even(I.widthPx * ovs + 4),
    renderHeight: even(I.heightPx * ovs + 4),
    fxPx: I.fxPx,
    fyPx: I.fyPx,
    k1: I.k1,
    k2: I.k2,
    nearM: 0.05,
    farM: 2000,
    parts: buildBodyParts(setup.clip.anthro, setup.outfit),
    bones: BONES,
    surface: setup.surface,
    lines: courtLines(),
    fence: {
      backX: Math.min(-6.4, cam[0] - 2.5),
      farX: Math.max(COURT.lengthM + 6.4, cam[0] + 2.5),
      sideY: Math.max(COURT.doublesHalfWidthM + 3.66, Math.abs(cam[1]) + 2.5),
      heightM: 3.6,
    },
    lighting: setup.look.lighting,
    post: setup.look.post,
    environmentSeed: setup.environmentSeed,
    bodyBlurSamples: setup.bodyBlurSamples,
    msaaSamples: 4,
    maxBalls: MAX_BALLS,
    shadowFocus: { centre: [stance[0] + 1.5, stance[1], 0.8], halfSizeM: 6 },
    output,
  }
}

/** three.js camera orientation: local x = right, y = up, z = backwards. */
export function threeCameraQuat(e: Extrinsics): [number, number, number, number] {
  return basisToQuat({
    x: e.right,
    y: [-e.down[0], -e.down[1], -e.down[2]],
    z: [-e.forward[0], -e.forward[1], -e.forward[2]],
  })
}

/** Number of samples along the ball's path during an exposure so the streak looks continuous. */
function ballSampleCount(cam: Camera, a: Vec3, b: Vec3): number {
  const pa = project(cam, a)
  const pb = project(cam, b)
  if (pa.depthM <= 0 || pb.depthM <= 0) return 1
  const moved = Math.hypot(pa.u - pb.u, pa.v - pb.v)
  const r = Math.max(0.5, projectedRadiusPx(cam, a, BALL.radiusM))
  return Math.min(48, Math.max(1, Math.ceil(moved / Math.max(0.4, 0.35 * r)) + 1))
}

export function frameData(setup: RenderSetup, i: number): FrameData {
  const t = frameTimeReal(setup, i)
  const cam = cameraAt(setup, t)
  const K = Math.max(1, setup.bodyBlurSamples)
  const S = setup.shutterS
  const sub: FrameData['sub'] = []
  for (let k = 0; k < K; k++) {
    const tk = t - S / 2 + ((k + 0.5) * S) / K
    const bones = packBones(boneTransforms(setup.clip.pose(tk)))
    // Ball positions across this sub-frame's slice of the exposure.
    const ta = tk - S / (2 * K)
    const tb = tk + S / (2 * K)
    const start = setup.clip.ballsAt(ta)
    const end = setup.clip.ballsAt(tb)
    const balls: FrameData['sub'][number]['balls'] = Array.from({ length: MAX_BALLS }, () => ({ samples: [] as number[] }))
    for (const b of start) {
      const e = end.find((x) => x.id === b.id)
      if (!e) continue
      const n = ballSampleCount(cam, b.p, e.p)
      const samples: number[] = []
      if (n === 1) {
        const m = setup.clip.ballsAt(tk).find((x) => x.id === b.id)
        if (m) samples.push(...m.p)
      } else {
        const series = sampleBall(setup.clip, b.id, ta, tb, n)
        for (const p of series) samples.push(...p)
      }
      balls[b.id % MAX_BALLS] = { samples }
    }
    sub.push({ bones, balls })
  }
  const L = setup.look
  return {
    i,
    camera: { pos: cam.extrinsics.position, quat: threeCameraQuat(cam.extrinsics) },
    gain: flickerGain(t, S, L.flickerAmplitude, L.flickerHz),
    noiseSeed: i + 1,
    sub,
  }
}

function sampleBall(clip: ClipMotion, id: number, ta: number, tb: number, n: number): Vec3[] {
  const out: Vec3[] = []
  for (let j = 0; j < n; j++) {
    const tj = ta + ((j + 0.5) * (tb - ta)) / n
    const b = clip.ballsAt(tj).find((x) => x.id === id)
    if (b) out.push(b.p)
  }
  return out
}

export { makeIntrinsics }
