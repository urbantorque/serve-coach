/**
 * Camera model and tilt rectification (METRICS §1.1). Every keypoint and ball centre is mapped
 * through H = K · R(pitch, roll) · K⁻¹ before any height, distance or angle is computed; the video
 * itself is never re-rendered.
 *
 * Conventions:
 * - Normalised image coordinates (x, y) in [0, 1], origin top-left, of the DISPLAYED frame.
 * - HU (frame-height units): u = (x − 0.5)·aspect, v = y − 0.5, focal length f_HU.
 * - pitchDeg > 0: the lens is tilted up (CAPTURE §9.3). rollDeg > 0: the phone is rotated
 *   clockwise about the lens axis as seen from behind it, so the scene appears rotated
 *   anticlockwise in the picture. (CAPTURE fixes the sensor signs by a device test.)
 * - Rectified coordinates are those a level camera at the same place would see.
 */
import type { CameraOrientation, CameraView, CaptureContext, Estimate, TiltStatus, VideoMeta } from '../types.ts'

/** Long-side FOV defaults (gap: geometry §6.2): 26 mm-equivalent 67.3°, 24 mm 71.6°. */
export const FOV_LONG_26MM_DEG = 67.3
export const FOV_LONG_24MM_DEG = 71.6
/** Pitch/roll cap for rectification (8° only after the tilt test passes). */
export const TILT_CAP_DEG = 5
/** A measured rear pitch is rectified without the cap (rear metrics are tested on tilted renders). */
export const REAR_TILT_LIMIT_DEG = 25
/** Relative focal-length σ (24 vs 26 mm, residual stabilisation crop). */
export const FOCAL_REL_SIGMA = 0.05

export type SetupClass = 'portrait-near' | 'landscape-fence' | 'landscape-near' | 'rear'

export interface CameraModel {
  aspect: number
  orientation: CameraOrientation
  /** Focal length in frame-height units of the displayed frame. */
  fHU: number
  fovLongDeg: number
  fovSource: 'intrinsics' | 'videoFieldOfView' | 'lens-default'
  tiltStatus: TiltStatus
  tiltSource: 'motion-sensor' | 'native-attitude' | 'none'
  pitch?: Estimate
  roll?: Estimate
  /** True when rectification is applied (a measured tilt within the cap, or any measured rear tilt). */
  rectified: boolean
  /** Rotation from camera to level coordinates, row-major 3×3 (identity when not rectified). */
  R: number[]
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** f_long (long-side units) from a long-side FOV in degrees. */
export function focalLongFromFov(fovLongDeg: number): number {
  return 1 / (2 * Math.tan((fovLongDeg * Math.PI) / 360))
}

/** Level rotation: camera → level coordinates for a camera pitched up by `pitch` and rolled by `roll` (radians). */
export function levelRotation(pitchRad: number, rollRad: number): number[] {
  // First undo the roll about the optical axis (z), then the pitch about the x axis.
  const cr = Math.cos(rollRad)
  const sr = Math.sin(rollRad)
  const cp = Math.cos(pitchRad)
  const sp = Math.sin(pitchRad)
  // Rz (visually clockwise in y-down coordinates undoes an anticlockwise-appearing scene).
  const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1]
  // Rx: Y_l = Y cos p − Z sin p, Z_l = Y sin p + Z cos p.
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp]
  return mul3(Rx, Rz)
}

function mul3(a: number[], b: number[]): number[] {
  const out = new Array<number>(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) out[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return out
}

export interface CameraModelOptions {
  /** Override the pitch/roll source (validation): degrees with 1σ. */
  pitchDeg?: Estimate
  rollDeg?: Estimate
  view?: CameraView
}

/** Builds K and R for a clip from its meta and capture context (METRICS §1.1). */
export function cameraModel(meta: Pick<VideoMeta, 'width' | 'height'>, capture?: CaptureContext, options: CameraModelOptions = {}): CameraModel {
  const aspect = meta.width / meta.height
  const orientation: CameraOrientation = capture?.orientation ?? (aspect < 1 ? 'portrait' : 'landscape')
  const longOverHeight = Math.max(meta.width, meta.height) / meta.height
  let fovSource: CameraModel['fovSource'] = 'lens-default'
  let fovLongDeg = FOV_LONG_26MM_DEG
  let fHU: number
  if (capture?.intrinsics && capture.intrinsics.length >= 9 && capture.intrinsics[0] > 0) {
    // Native intrinsics are in coded pixels; f is the same along both axes for square pixels.
    const codedLong = Math.max(capture.delivered?.width ?? meta.width, capture.delivered?.height ?? meta.height)
    const displayedHeightPx = meta.height * (codedLong / Math.max(meta.width, meta.height))
    fHU = capture.intrinsics[0] / displayedHeightPx
    fovLongDeg = (2 * Math.atan(0.5 * longOverHeight / fHU) * 180) / Math.PI
    fovSource = 'intrinsics'
  } else {
    if (capture?.videoFovDeg && capture.videoFovDeg > 20 && capture.videoFovDeg < 130) {
      fovLongDeg = capture.videoFovDeg
      fovSource = 'videoFieldOfView'
    } else if (capture?.device?.focal35mmEquiv && capture.device.focal35mmEquiv > 10) {
      // 26 mm ↔ 67.3°, scaled by focal length (24 mm Pro ↔ about 71.6°).
      fovLongDeg = (2 * Math.atan(Math.tan((FOV_LONG_26MM_DEG * Math.PI) / 360) * (26 / capture.device.focal35mmEquiv)) * 180) / Math.PI
    }
    fHU = focalLongFromFov(fovLongDeg) * longOverHeight
  }

  const view = options.view ?? capture?.declaredView ?? 'side'
  let pitch = options.pitchDeg
  let roll = options.rollDeg
  let tiltSource: CameraModel['tiltSource'] = 'none'
  const samples = capture?.orientationSamples?.filter((s) => Number.isFinite(s.pitchDeg) && Number.isFinite(s.rollDeg))
  if (!pitch && samples && samples.length > 0) {
    const native = capture?.source === 'in-app-native'
    // σ = √(σ_sensor² + σ_mis²): native 0.5° + 0.5°; PWA 1° + 0.5° (planning values, §1.1).
    const sigma = native ? Math.hypot(0.5, 0.5) : Math.hypot(1, 0.5)
    pitch = { value: median(samples.map((s) => s.pitchDeg)), sigma }
    roll = { value: median(samples.map((s) => s.rollDeg)), sigma }
    tiltSource = native ? 'native-attitude' : 'motion-sensor'
  } else if (pitch) {
    tiltSource = 'motion-sensor'
  }
  let tiltStatus: TiltStatus = 'unknown'
  let rectified = false
  let R = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  if (pitch) {
    const r = roll ?? { value: 0, sigma: pitch.sigma }
    roll = r
    const limit = view === 'rear' ? REAR_TILT_LIMIT_DEG : TILT_CAP_DEG
    const over = Math.abs(pitch.value) > limit || Math.abs(r.value) > TILT_CAP_DEG
    if (over) tiltStatus = 'measured-over-cap'
    else {
      tiltStatus = Math.abs(pitch.value) <= 1 && Math.abs(r.value) <= 1 ? 'measured-level' : 'measured-corrected'
      rectified = true
      R = levelRotation((pitch.value * Math.PI) / 180, (r.value * Math.PI) / 180)
    }
  }
  return { aspect, orientation, fHU, fovLongDeg, fovSource, tiltStatus, tiltSource, pitch, roll, rectified, R }
}

/** Maps a normalised image point to rectified normalised coordinates. */
export function rectifyPoint(cam: CameraModel, x: number, y: number): { x: number; y: number } {
  if (!cam.rectified) return { x, y }
  const u = (x - 0.5) * cam.aspect
  const v = y - 0.5
  const f = cam.fHU
  const R = cam.R
  const X = R[0] * u + R[1] * v + R[2] * f
  const Y = R[3] * u + R[4] * v + R[5] * f
  const Z = R[6] * u + R[7] * v + R[8] * f
  if (!(Z > 1e-9)) return { x, y }
  return { x: (f * X) / Z / cam.aspect + 0.5, y: (f * Y) / Z + 0.5 }
}

/** Inverse of rectifyPoint (rectified → raw image), for overlays. */
export function unrectifyPoint(cam: CameraModel, x: number, y: number): { x: number; y: number } {
  if (!cam.rectified) return { x, y }
  const u = (x - 0.5) * cam.aspect
  const v = y - 0.5
  const f = cam.fHU
  const R = cam.R
  // Rᵀ (orthonormal).
  const X = R[0] * u + R[3] * v + R[6] * f
  const Y = R[1] * u + R[4] * v + R[7] * f
  const Z = R[2] * u + R[5] * v + R[8] * f
  if (!(Z > 1e-9)) return { x, y }
  return { x: (f * X) / Z / cam.aspect + 0.5, y: (f * Y) / Z + 0.5 }
}

/** Camera distance to the player's plane D = f_HU · H_m / H_HU (metres, ±6% with an assumed focal). */
export function cameraDistanceM(cam: CameraModel, playerHeightM: number, bodyHeightHU: number): number {
  return (cam.fHU * playerHeightM) / bodyHeightHU
}

/** D1 set-up class (§1.1): orientation plus distance. */
export function setupClassOf(view: CameraView, cam: CameraModel, distanceM: number): SetupClass {
  if (view === 'rear') return 'rear'
  if (cam.orientation === 'portrait') return 'portrait-near'
  return distanceM >= 8 ? 'landscape-fence' : 'landscape-near'
}

/** Rectified row of the horizon (principal point after levelling), normalised y. */
export function horizonRowY(cam: CameraModel): number {
  return cam.rectified ? 0.5 : 0.5
}
