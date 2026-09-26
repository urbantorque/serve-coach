import type { PartSpec } from '../bodyShape.ts'
import type { LineRect } from '../court.ts'
import type { Vec3 } from '../math/vec.ts'

/** Everything the browser renderer needs once per clip. Court coordinates, metres, z up. */
export interface SceneDescription {
  width: number
  height: number
  /** Undistorted render-target size (larger than the output when lens distortion is simulated). */
  renderWidth: number
  renderHeight: number
  fxPx: number
  fyPx: number
  k1: number
  k2: number
  nearM: number
  farM: number
  parts: PartSpec[]
  bones: readonly string[]
  surface: CourtSurface
  lines: LineRect[]
  fence: { backX: number; farX: number; sideY: number; heightM: number }
  lighting: LightingSpec
  post: PostSpec
  environmentSeed: number
  bodyBlurSamples: number
  msaaSamples: number
  maxBalls: number
  /** Area the sun's shadow map covers (centre and half-size, m). */
  shadowFocus: { centre: Vec3; halfSizeM: number }
  /**
   * Pixel format posted back per frame. 'rgba': W*H*4 bytes, top row first.
   * 'yuv420p': planar BT.709 limited-range Y (W*H), U and V (W/2 * H/2 each), top row first,
   * ready for ffmpeg `-f rawvideo -pix_fmt yuv420p` (W and H must be even, W a multiple of 4).
   */
  output: 'rgba' | 'yuv420p'
}

export type CourtSurface = 'hard-blue' | 'grass-green' | 'clay-red'
export type LightingPreset = 'bright' | 'overcast' | 'dusk' | 'night'

export interface LightingSpec {
  preset: LightingPreset
  /** Unit vector from the scene toward the sun. */
  sunDir: Vec3
  sunIntensity: number
  sunColor: string
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  skyTop: string
  skyHorizon: string
  floodlights: boolean
  floodIntensity: number
  shadowRadius: number
}

export interface PostSpec {
  exposure: number
  whiteBalance: [number, number, number]
  contrast: number
  saturation: number
  vignette: number
  /** Gaussian read noise, sigma in 8-bit code values. */
  readNoise: number
  /** Shot-noise variance per code value (sigma^2 = read^2 + shot * value). */
  shotNoise: number
}

export interface BallRender {
  /** Ball centre positions spread across this sub-frame's exposure (flat xyz). */
  samples: number[]
}

export interface SubFrame {
  /** Packed bone transforms (x,y,z,qx,qy,qz,qw per bone). */
  bones: number[]
  balls: BallRender[]
}

export interface FrameData {
  i: number
  camera: { pos: Vec3; quat: [number, number, number, number] }
  /** Exposure gain for this frame (includes lighting flicker integrated over the shutter). */
  gain: number
  noiseSeed: number
  sub: SubFrame[]
}
