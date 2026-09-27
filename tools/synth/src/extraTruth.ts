import { LM } from '../../../app/src/analysis/types.ts'
import { COURT, FAR_SERVICE_LINE_X } from './court.ts'
import { cameraAt } from './frames.ts'
import type { BuiltScenario } from './setup.ts'

/**
 * Truth for the canonical metric ids that truth.json does not carry (leg drive, drive time,
 * loading depth, shoulder tilt at the trophy position, shoulder-over-shoulder at contact, knee
 * bands, landing distance from the start toe, outcomes, capture-quality inputs), plus a map from
 * every canonical metric id to its truth value. Written as truth-extra.json next to truth.json by
 * src/augmentTruth.ts. Definitions: tools/synth/README.md ("truth-extra.json").
 *
 * Two derivations:
 * - `atFrames`: from the stored per-frame 3D landmarks (`frames[].world`, 0.1 mm rounding) and 2D
 *   landmarks at this clip's frame times: what an ideal per-frame pose estimator could see.
 * - `continuous`: from the kinematic model rebuilt from the clip's scenario, sampled every 0.5 ms,
 *   with exact event instants. Only written when the rebuilt motion reproduces the stored landmarks
 *   (max deviation <= DRIFT_TOLERANCE_M), which also proves the generator code has not drifted.
 * Canonical values use `continuous` when present, else `atFrames`.
 */

export const EXTRA_FORMAT = 'serve-synth-truth-extra/1'
/** Stored landmarks are rounded to 0.1 mm, so a faithful rebuild differs by at most 0.05 mm. */
export const DRIFT_TOLERANCE_M = 0.0002
/** METRICS.md 2.4.4: the trophy (maximum loading) is the lowest mid-hip in [tossRelease, contact - 0.08 s]. */
export const TROPHY_WINDOW_END_BEFORE_CONTACT_S = 0.08
export const CONTINUOUS_STEP_S = 0.0005
/** Research 05 6.5 knee bands (degrees of flexion; 0 = straight). */
export const KNEE_BAND_EDGES = { moderate: 20, deep: 45 } as const

export type V3 = [number, number, number]
type Num = number | string | boolean | null

export interface TruthEvent {
  tReal: number
  tMedia: number
  frameIndex: number
  frame: number
  inClip: boolean
}

export interface TruthServe {
  index: number
  courtSide: 'deuce' | 'ad'
  direction: 'T' | 'body' | 'wide'
  style: string
  stance: string
  events: Record<string, TruthEvent> & { dribbleFloorContacts?: TruthEvent[] }
  metrics: Record<string, Num>
  ball: { release: V3; apex: V3; contact: V3; bounce: V3; spinRpm: number }
  visibility: Record<string, boolean>
  params?: Record<string, unknown>
}

export interface TruthFrame {
  frameIndex: number
  tReal: number
  landmarks: { x: number; y: number; z: number; visibility: number }[] | null
  world: V3[]
  balls: { id: number; state: string; x: number; y: number; radius: number; streak: [number, number, number, number] }[]
  camera?: { position: V3; R: number[] }
}

export interface TruthFile {
  format: string
  clipId: string
  job: string
  groups: string[]
  tags: string[]
  video: { width: number; height: number; fps: number; captureFps: number; timeScale: number; frameCount: number }
  settings: {
    view: 'side' | 'rear' | 'front45'
    orientation: string
    distanceM: number
    distanceFrom?: string
    cameraHeightM: number
    lookAtHeightM: number
    focal35mmEquivMm: number
    intrinsics: { fxPx: number; fyPx: number; cxPx: number; cyPx: number; k1: number; k2: number }
    extrinsics: { R: number[]; t: V3; position: V3 }
    shutterS: number
    crf: number
    lighting: { preset: string; flickerHz: number | null; flickerAmplitude: number }
    shake: unknown
    t0MotionS: number
  }
  player: { profile: string; heightM: number; handedness: 'right' | 'left'; stance: string }
  serves: TruthServe[]
  frames: TruthFrame[]
}

// ---------------------------------------------------------------------------------------------
// Small maths
// ---------------------------------------------------------------------------------------------

const toDeg = (r: number): number => (r * 180) / Math.PI
const r = (x: number, d: number): number => {
  const f = 10 ** d
  return Math.round(x * f) / f
}
const rn = (x: number | null | undefined, d: number): number | null => (x === null || x === undefined || !Number.isFinite(x) ? null : r(x, d))
const midZ = (w: V3[], a: number, b: number): number => (w[a][2] + w[b][2]) / 2

/** Sample standard deviation (n - 1); null below two values. */
export function sampleSD(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null
}

/**
 * Tilt of the line back -> front in image coordinates (y down), degrees from the image horizontal,
 * positive when the front point is higher in the image. Uses |dx|, so it does not depend on which
 * way the player faces in the image. Inputs must be isotropic (pixels, or normalised camera x/z, y/z).
 */
export function tilt2DDeg(front: [number, number], back: [number, number]): number {
  return toDeg(Math.atan2(back[1] - front[1], Math.abs(front[0] - back[0])))
}

/** Elevation of the line back -> front above the horizontal plane (court z up), degrees; positive = front higher. */
export function elevation3DDeg(front: V3, back: V3): number {
  return toDeg(Math.atan2(front[2] - back[2], Math.hypot(front[0] - back[0], front[1] - back[1])))
}

/** 2D flexion (180 deg minus the interior angle at b) of isotropic image points. */
export function flexion2DDeg(a: [number, number], b: [number, number], c: [number, number]): number {
  const ux = a[0] - b[0]
  const uy = a[1] - b[1]
  const vx = c[0] - b[0]
  const vy = c[1] - b[1]
  const cos = (ux * vx + uy * vy) / Math.max(1e-12, Math.hypot(ux, uy) * Math.hypot(vx, vy))
  return 180 - toDeg(Math.acos(Math.min(1, Math.max(-1, cos))))
}

export type KneeBand = 'little' | 'moderate' | 'deep'
export function kneeBand(flexionDeg: number): KneeBand {
  return flexionDeg >= KNEE_BAND_EDGES.deep ? 'deep' : flexionDeg >= KNEE_BAND_EDGES.moderate ? 'moderate' : 'little'
}

/** The older METRICS.md 3.14 band edges (low < 25 deg, typical 25-55, high > 55), which conflict with research 05 6.5. */
export function kneeBandMetricsMd(flexionDeg: number): 'low' | 'typical' | 'high' {
  return flexionDeg > 55 ? 'high' : flexionDeg >= 25 ? 'typical' : 'low'
}

/**
 * Where a good serve landed across the service box width: thirds of the singles half-width measured
 * from the centre service line (T = inner third, body = middle, wide = outer). Null for a fault.
 */
export function placementZone(inBox: boolean, bounceY: number): 'T' | 'body' | 'wide' | null {
  if (!inBox) return null
  const third = COURT.singlesHalfWidthM / 3
  const a = Math.abs(bounceY)
  return a < third ? 'T' : a < 2 * third ? 'body' : 'wide'
}

/** The outcome a player would tag (D3): in, net, long or wide. */
export function serveOutcome(inBox: boolean, bounceX: number, netClearanceM: number | null): 'in' | 'net' | 'long' | 'wide' {
  if (inBox) return 'in'
  if (netClearanceM === null || netClearanceM < 0 || bounceX < COURT.netXM) return 'net'
  if (bounceX > FAR_SERVICE_LINE_X + COURT.lineWidthM / 2) return 'long'
  return 'wide'
}

// ---------------------------------------------------------------------------------------------
// Cameras (truth.json convention: X_cam = R X_court + t, OpenCV axes)
// ---------------------------------------------------------------------------------------------

export interface CamPose {
  /** Row-major world-to-camera rotation: rows are the camera right, down and forward axes. */
  R: number[]
  t: V3
}

export function camPose(truth: TruthFile, frame?: TruthFrame): CamPose {
  if (frame?.camera) {
    const R = frame.camera.R
    const C = frame.camera.position
    return { R, t: [-(R[0] * C[0] + R[1] * C[1] + R[2] * C[2]), -(R[3] * C[0] + R[4] * C[1] + R[5] * C[2]), -(R[6] * C[0] + R[7] * C[1] + R[8] * C[2])] }
  }
  return { R: truth.settings.extrinsics.R, t: truth.settings.extrinsics.t }
}

export function cameraCentre(c: CamPose): V3 {
  const { R, t } = c
  return [-(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]), -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]), -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2])]
}

export function toCam(c: CamPose, p: V3): V3 {
  const { R, t } = c
  return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2]]
}

/** Normalised (isotropic) image coordinates x/z, y/z; distortion-free (the corpus uses k1 = k2 = 0). */
export function normXY(c: CamPose, p: V3): [number, number] {
  const q = toCam(c, p)
  return [q[0] / q[2], q[1] / q[2]]
}

/**
 * The same camera turned level: same centre and horizontal viewing direction, zero pitch and roll.
 * This is what the pure-rotation homography of METRICS.md 1.1 ("level correction") produces.
 */
export function levelPose(c: CamPose): CamPose {
  const C = cameraCentre(c)
  const f = [c.R[6], c.R[7], 0]
  const n = Math.hypot(f[0], f[1])
  const fwd: V3 = [f[0] / n, f[1] / n, 0]
  const right: V3 = [fwd[1], -fwd[0], 0] // fwd x up
  const down: V3 = [0, 0, -1] // fwd x right for a horizontal fwd
  const R = [...right, ...down, ...fwd]
  return { R, t: [-(right[0] * C[0] + right[1] * C[1]), C[2], -(fwd[0] * C[0] + fwd[1] * C[1])] }
}

/** Camera pitch (positive = looking up) and roll (positive = image right edge up), degrees. */
export function pitchRollDeg(c: CamPose): { pitchDeg: number; rollDeg: number } {
  return { pitchDeg: toDeg(Math.asin(Math.max(-1, Math.min(1, c.R[8])))), rollDeg: toDeg(Math.asin(Math.max(-1, Math.min(1, c.R[2])))) }
}

/**
 * Court height where an image row meets the vertical plane through `p0` that faces the camera
 * (normal = the camera's horizontal viewing direction). Used for the frame top / bottom at the server.
 */
export function rowHeightAtPlane(truth: TruthFile, c: CamPose, row: number, p0: V3): number {
  const I = truth.settings.intrinsics
  const d: V3 = [0, (row - I.cyPx) / I.fyPx, 1]
  const { R } = c
  const dw: V3 = [R[0] * d[0] + R[3] * d[1] + R[6] * d[2], R[1] * d[0] + R[4] * d[1] + R[7] * d[2], R[2] * d[0] + R[5] * d[1] + R[8] * d[2]]
  const C = cameraCentre(c)
  const nrm = Math.hypot(R[6], R[7])
  const n: V3 = [R[6] / nrm, R[7] / nrm, 0]
  const s = ((p0[0] - C[0]) * n[0] + (p0[1] - C[1]) * n[1]) / (dw[0] * n[0] + dw[1] * n[1])
  return C[2] + s * dw[2]
}

// ---------------------------------------------------------------------------------------------
// Body sides
// ---------------------------------------------------------------------------------------------

interface SideIdx {
  shoulder: number
  hip: number
  knee: number
  ankle: number
  toe: number
}
const LEFT: SideIdx = { shoulder: LM.LEFT_SHOULDER, hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE, toe: LM.LEFT_FOOT_INDEX }
const RIGHT: SideIdx = { shoulder: LM.RIGHT_SHOULDER, hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE, toe: LM.RIGHT_FOOT_INDEX }

/** Tossing side (front foot, front shoulder at the trophy position) and hitting side. */
export function bodySides(handedness: 'right' | 'left'): { toss: SideIdx; hit: SideIdx } {
  return handedness === 'right' ? { toss: LEFT, hit: RIGHT } : { toss: RIGHT, hit: LEFT }
}

// ---------------------------------------------------------------------------------------------
// Leg drive from a mid-hip height series
// ---------------------------------------------------------------------------------------------

export interface HipSample {
  t: number
  z: number
}

export interface LegDrive {
  /** Lowest mid-hip in [tossRelease, contact - 0.08 s]: the trophy (maximum loading) of METRICS.md 2.4.4. */
  lowestTReal: number
  lowestHeightM: number
  heightAtReleaseM: number
  heightAtContactM: number
  /** leg-drive: mid-hip height at contact minus lowest mid-hip height. */
  hipRiseM: number
  hipRisePctHeight: number
  /** drive-time: contact time minus the time of the lowest mid-hip. */
  driveTimeS: number
  /** loading-depth: mid-hip height at toss release minus lowest mid-hip height. */
  loadingDepthM: number
  loadingDepthPctHeight: number
  /** Peak upward mid-hip speed between the lowest point and contact (experimental proxy). */
  peakUpwardHipSpeedMs: number
  peakUpwardHipSpeedTReal: number
}

/**
 * Leg-drive quantities from time-ordered mid-hip samples covering at least [tRelease, tContact].
 * `refine`, when given, returns the exact height at any time and is used to polish the minimum.
 */
export function legDrive(
  samples: HipSample[],
  ev: { tRelease: number; tContact: number; zRelease: number; zContact: number },
  heightM: number,
  refine?: (t: number) => number,
): LegDrive {
  const tEnd = ev.tContact - TROPHY_WINDOW_END_BEFORE_CONTACT_S
  let lo: HipSample | null = null
  let loIdx = -1
  samples.forEach((s, i) => {
    if (s.t < ev.tRelease - 1e-9 || s.t > tEnd + 1e-9) return
    if (!lo || s.z < lo.z) {
      lo = s
      loIdx = i
    }
  })
  if (!lo) throw new Error('no mid-hip samples between toss release and contact - 0.08 s')
  let low: HipSample = lo
  if (refine && loIdx > 0 && loIdx < samples.length - 1) {
    // Golden-section search between the neighbouring samples.
    let a = samples[loIdx - 1].t
    let b = samples[loIdx + 1].t
    const g = (Math.sqrt(5) - 1) / 2
    let c = b - g * (b - a)
    let d = a + g * (b - a)
    for (let k = 0; k < 40; k++) {
      if (refine(c) < refine(d)) b = d
      else a = c
      c = b - g * (b - a)
      d = a + g * (b - a)
    }
    const t = Math.min(tEnd, Math.max(ev.tRelease, (a + b) / 2))
    const z = refine(t)
    if (z <= low.z) low = { t, z }
  }
  // Upward speed by central differences from the lowest point to contact.
  let vMax = -Infinity
  let tV = low.t
  for (let i = 1; i < samples.length - 1; i++) {
    const s = samples[i]
    if (s.t < low.t - 1e-9 || s.t > ev.tContact + 1e-9) continue
    const v = (samples[i + 1].z - samples[i - 1].z) / (samples[i + 1].t - samples[i - 1].t)
    if (v > vMax) {
      vMax = v
      tV = s.t
    }
  }
  const rise = ev.zContact - low.z
  const depth = ev.zRelease - low.z
  return {
    lowestTReal: low.t,
    lowestHeightM: low.z,
    heightAtReleaseM: ev.zRelease,
    heightAtContactM: ev.zContact,
    hipRiseM: rise,
    hipRisePctHeight: (100 * rise) / heightM,
    driveTimeS: ev.tContact - low.t,
    loadingDepthM: depth,
    loadingDepthPctHeight: (100 * depth) / heightM,
    peakUpwardHipSpeedMs: vMax,
    peakUpwardHipSpeedTReal: tV,
  }
}

// ---------------------------------------------------------------------------------------------
// Line tilts at an instant
// ---------------------------------------------------------------------------------------------

export interface LineTilts {
  /** Anatomical: elevation of the line above horizontal (court z), degrees. */
  deg3D: number
  /** As filmed: this clip's camera, image-plane angle from the image horizontal. */
  deg2D: number
  /** Level-corrected: the same camera rotated level (METRICS.md 1.1), image-plane angle. */
  deg2DLevel: number
}

function lineTilts(front: V3, back: V3, cam: CamPose, filmed?: { front: [number, number]; back: [number, number] }): LineTilts {
  const lvl = levelPose(cam)
  return {
    deg3D: elevation3DDeg(front, back),
    deg2D: filmed ? tilt2DDeg(filmed.front, filmed.back) : tilt2DDeg(normXY(cam, front), normXY(cam, back)),
    deg2DLevel: tilt2DDeg(normXY(lvl, front), normXY(lvl, back)),
  }
}

const roundTilts = (x: LineTilts) => ({ deg3D: r(x.deg3D, 3), deg2D: r(x.deg2D, 3), deg2DLevel: r(x.deg2DLevel, 3) })

// ---------------------------------------------------------------------------------------------
// Per-serve derivations
// ---------------------------------------------------------------------------------------------

interface PoseAt {
  world: V3[]
  cam: CamPose
  /** Pixel landmarks as filmed (stored truth frames only). */
  px?: [number, number][]
}

interface Instants {
  legDrive: LegDrive
  /** Lowest mid-hip (the app's trophy detector, METRICS.md 2.4.4). */
  hipLowest: { tReal: number; pose: PoseAt }
  /** Kinematic trophy position: midpoint of the trophy hold (truth.json events.trophy). */
  trophy: { tReal: number; pose: PoseAt }
  contact: { tReal: number; pose: PoseAt }
  landingToeXM: number
  releaseToeXM: number
  /** Max 3D knee flexion over the loading window [tossRelease, min(takeoff, contact - 0.08 s)]. */
  loadingKneeMax: { front3D: number; back3D: number }
}

/** End of the loading window used for knee maxima: before take-off and before contact - 0.08 s. */
export const loadingWindowEnd = (takeoff: number, contact: number): number => Math.min(takeoff, contact - TROPHY_WINDOW_END_BEFORE_CONTACT_S)

const knee3D = (w: V3[], k: SideIdx): number => {
  const a = w[k.hip]
  const b = w[k.knee]
  const c = w[k.ankle]
  const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
  const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.max(1e-12, Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]))
  return 180 - toDeg(Math.acos(Math.min(1, Math.max(-1, cos))))
}

/** Knee flexion at an instant: 3D, as filmed (2D) and level-corrected (2D). */
function kneesAt(p: PoseAt, k: SideIdx): { deg3D: number; deg2D: number; deg2DLevel: number } {
  const lvl = levelPose(p.cam)
  const img = (q: number) => (p.px ? p.px[q] : normXY(p.cam, p.world[q]))
  return {
    deg3D: knee3D(p.world, k),
    deg2D: flexion2DDeg(img(k.hip), img(k.knee), img(k.ankle)),
    deg2DLevel: flexion2DDeg(normXY(lvl, p.world[k.hip]), normXY(lvl, p.world[k.knee]), normXY(lvl, p.world[k.ankle])),
  }
}

function tiltsAt(p: PoseAt, a: number, b: number): LineTilts {
  return lineTilts(p.world[a], p.world[b], p.cam, p.px ? { front: p.px[a], back: p.px[b] } : undefined)
}

function serveBlock(truth: TruthFile, s: TruthServe, x: Instants, eventFrame: (t: number) => { frameIndex: number; frame: number; inClip: boolean }) {
  const sides = bodySides(truth.player.handedness)
  const L = x.legDrive
  const shoulderTrophy = tiltsAt(x.trophy.pose, sides.toss.shoulder, sides.hit.shoulder)
  const hipTrophy = tiltsAt(x.trophy.pose, sides.toss.hip, sides.hit.hip)
  const shoulderHipLowest = tiltsAt(x.hipLowest.pose, sides.toss.shoulder, sides.hit.shoulder)
  const sos = tiltsAt(x.contact.pose, sides.hit.shoulder, sides.toss.shoulder)
  return {
    events: {
      hipLowest: { tReal: r(L.lowestTReal, 6), ...eventFrame(L.lowestTReal) },
    },
    legDrive: {
      lowestHeightM: r(L.lowestHeightM, 4),
      heightAtReleaseM: r(L.heightAtReleaseM, 4),
      heightAtContactM: r(L.heightAtContactM, 4),
      hipRiseM: r(L.hipRiseM, 4),
      hipRisePctHeight: r(L.hipRisePctHeight, 3),
      driveTimeS: r(L.driveTimeS, 6),
      loadingDepthM: r(L.loadingDepthM, 4),
      loadingDepthPctHeight: r(L.loadingDepthPctHeight, 3),
      peakUpwardHipSpeedMs: r(L.peakUpwardHipSpeedMs, 3),
      peakUpwardHipSpeedTReal: r(L.peakUpwardHipSpeedTReal, 6),
    },
    shoulderTiltTrophy: { atTReal: r(x.trophy.tReal, 6), ...roundTilts(shoulderTrophy) },
    shoulderTiltHipLowest: { atTReal: r(x.hipLowest.tReal, 6), ...roundTilts(shoulderHipLowest) },
    trophySideBend: {
      atTReal: r(x.trophy.tReal, 6),
      deg3D: r(shoulderTrophy.deg3D - hipTrophy.deg3D, 3),
      deg2D: r(shoulderTrophy.deg2D - hipTrophy.deg2D, 3),
      deg2DLevel: r(shoulderTrophy.deg2DLevel - hipTrophy.deg2DLevel, 3),
    },
    shoulderOverShoulderContact: { atTReal: r(x.contact.tReal, 6), ...roundTilts(sos) },
    knees: {
      atTReal: r(x.trophy.tReal, 6),
      front: roundTilts(kneesAt(x.trophy.pose, sides.toss)),
      back: roundTilts(kneesAt(x.trophy.pose, sides.hit)),
      atHipLowest: { atTReal: r(x.hipLowest.tReal, 6), front: roundTilts(kneesAt(x.hipLowest.pose, sides.toss)), back: roundTilts(kneesAt(x.hipLowest.pose, sides.hit)) },
      loadingMaxFront3DDeg: r(x.loadingKneeMax.front3D, 3),
      loadingMaxBack3DDeg: r(x.loadingKneeMax.back3D, 3),
    },
    landing: {
      landingToeXM: r(x.landingToeXM, 4),
      startToeXM: r(x.releaseToeXM, 4),
      fromStartToeM: r(x.landingToeXM - x.releaseToeXM, 4),
    },
    // Not used by the canonical map; shows how far the kinematic trophy events are from the hip minimum.
    hipLowestMinusTrophyStartS: r(L.lowestTReal - s.events.trophyStart.tReal, 6),
    hipLowestMinusTrophyEndS: r(L.lowestTReal - s.events.trophyEnd.tReal, 6),
  }
}

/** Stored-landmark derivation for one serve. */
function instantsAtFrames(truth: TruthFile, s: TruthServe): Instants {
  const H = truth.player.heightM
  const sides = bodySides(truth.player.handedness)
  const F = truth.frames
  const W = truth.video.width
  const Hpx = truth.video.height
  const nearest = (t: number): TruthFrame => {
    let best = F[0]
    for (const f of F) if (Math.abs(f.tReal - t) < Math.abs(best.tReal - t)) best = f
    return best
  }
  const poseOf = (f: TruthFrame): PoseAt => ({
    world: f.world,
    cam: camPose(truth, f),
    px: f.landmarks ? f.landmarks.map((l) => [l.x * W, l.y * Hpx] as [number, number]) : undefined,
  })
  const ev = s.events
  const fRel = nearest(ev.tossRelease.tReal)
  const fCon = nearest(ev.contact.tReal)
  const dt = 1 / truth.video.captureFps
  const samples = F.filter((f) => f.tReal >= ev.tossRelease.tReal - 1.5 * dt && f.tReal <= ev.contact.tReal + 1.5 * dt).map((f) => ({ t: f.tReal, z: midZ(f.world, LM.LEFT_HIP, LM.RIGHT_HIP) }))
  const ld = legDrive(samples, { tRelease: ev.tossRelease.tReal, tContact: fCon.tReal, zRelease: midZ(fRel.world, LM.LEFT_HIP, LM.RIGHT_HIP), zContact: midZ(fCon.world, LM.LEFT_HIP, LM.RIGHT_HIP) }, H)
  const fLow = nearest(ld.lowestTReal)
  const fTro = nearest(ev.trophy.tReal)
  const fLand = nearest(ev.landing.tReal)
  const kneeEnd = loadingWindowEnd(ev.takeoff.tReal, ev.contact.tReal)
  const loadingKneeMax = { front3D: -Infinity, back3D: -Infinity }
  for (const f of F) {
    if (f.tReal < ev.tossRelease.tReal || f.tReal > kneeEnd) continue
    loadingKneeMax.front3D = Math.max(loadingKneeMax.front3D, knee3D(f.world, sides.toss))
    loadingKneeMax.back3D = Math.max(loadingKneeMax.back3D, knee3D(f.world, sides.hit))
  }
  return {
    loadingKneeMax,
    legDrive: ld,
    hipLowest: { tReal: fLow.tReal, pose: poseOf(fLow) },
    trophy: { tReal: fTro.tReal, pose: poseOf(fTro) },
    contact: { tReal: fCon.tReal, pose: poseOf(fCon) },
    landingToeXM: fLand.world[sides.toss.toe][0],
    releaseToeXM: fRel.world[sides.toss.toe][0],
  }
}

/** Model-based derivation for one serve (exact instants, 0.5 ms sampling). */
function instantsContinuous(truth: TruthFile, s: TruthServe, b: BuiltScenario): Instants {
  const H = truth.player.heightM
  const sides = bodySides(truth.player.handedness)
  const t0 = b.t0S
  const plan = b.clip.plans.find((p) => p.index === s.index)
  if (!plan) throw new Error(`serve ${s.index} not in the rebuilt clip`)
  const T = plan.times
  const lm = (tAbs: number): V3[] => b.clip.pose(tAbs).lm as V3[]
  const hipZ = (tAbs: number) => midZ(lm(tAbs), LM.LEFT_HIP, LM.RIGHT_HIP)
  const camOf = (tAbs: number): CamPose => {
    const e = cameraAt(b.setup, tAbs).extrinsics
    const R = [...e.right, ...e.down, ...e.forward]
    const C = e.position
    return { R, t: [-(e.right[0] * C[0] + e.right[1] * C[1] + e.right[2] * C[2]), -(e.down[0] * C[0] + e.down[1] * C[1] + e.down[2] * C[2]), -(e.forward[0] * C[0] + e.forward[1] * C[1] + e.forward[2] * C[2])] }
  }
  const samples: HipSample[] = []
  const n = Math.ceil((T.contactS - T.tossReleaseS) / CONTINUOUS_STEP_S)
  for (let i = -1; i <= n + 1; i++) {
    const tAbs = T.tossReleaseS + i * CONTINUOUS_STEP_S
    samples.push({ t: tAbs - t0, z: hipZ(tAbs) })
  }
  const ld = legDrive(samples, { tRelease: T.tossReleaseS - t0, tContact: T.contactS - t0, zRelease: hipZ(T.tossReleaseS), zContact: hipZ(T.contactS) }, H, (t) => hipZ(t + t0))
  const at = (tReal: number) => ({ tReal, pose: { world: lm(tReal + t0), cam: camOf(tReal + t0) } })
  const kneeEnd = loadingWindowEnd(T.takeoffS, T.contactS)
  const loadingKneeMax = { front3D: -Infinity, back3D: -Infinity }
  for (let tAbs = T.tossReleaseS; tAbs <= kneeEnd + 1e-12; tAbs = Math.min(kneeEnd, tAbs + CONTINUOUS_STEP_S)) {
    const w = lm(tAbs)
    loadingKneeMax.front3D = Math.max(loadingKneeMax.front3D, knee3D(w, sides.toss))
    loadingKneeMax.back3D = Math.max(loadingKneeMax.back3D, knee3D(w, sides.hit))
    if (tAbs >= kneeEnd) break
  }
  return {
    loadingKneeMax,
    legDrive: ld,
    hipLowest: at(ld.lowestTReal),
    trophy: at((T.trophyStartS + T.trophyEndS) / 2 - t0),
    contact: at(T.contactS - t0),
    landingToeXM: lm(T.landingS)[sides.toss.toe][0],
    releaseToeXM: lm(T.tossReleaseS)[sides.toss.toe][0],
  }
}

/** Largest deviation (m) of the rebuilt motion from the stored landmarks, over every frame. */
export function motionDriftM(truth: TruthFile, b: BuiltScenario): number {
  let worst = 0
  for (const f of truth.frames) {
    const lm = b.clip.pose(b.t0S + f.tReal).lm
    for (let k = 0; k < lm.length; k++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(lm[k][c] - f.world[k][c]))
  }
  return worst
}

// ---------------------------------------------------------------------------------------------
// Canonical metric map
// ---------------------------------------------------------------------------------------------

export type View = 'side' | 'rear' | 'front45'

export interface CanonicalSpec {
  id: string
  level: 'serve' | 'clip'
  unit: string
  /** Views in which the app may report the metric (DECISIONS D1/D4/D5); [] = never measurable. */
  views: View[]
  minCaptureFps?: number
  /** Not measured from video: the player enters it (the truth is what they would enter). */
  playerEntered?: boolean
  truth: string
}

/** The canonical metric ids (exact spelling) and how truth maps to each. README mirrors this table. */
export const CANONICAL: CanonicalSpec[] = [
  { id: 'serve-count', level: 'clip', unit: 'count', views: ['side', 'rear'], truth: 'serves whose contact instant lies inside the clip' },
  { id: 'toss-apex-height', level: 'serve', unit: 'ratio of standing height (m in alt)', views: ['side', 'rear'], truth: 'metrics.tossApexHeightM / player.heightM (ball centre)' },
  { id: 'toss-forward', level: 'serve', unit: 'm', views: ['side'], truth: 'metrics.tossApexForwardOfFrontToeM (apex x - front toe x at release)' },
  { id: 'toss-drop', level: 'serve', unit: 'm (s in alt)', views: ['side', 'rear'], truth: 'metrics.tossHeightAboveContactM; alt.timeS = events.contact.tReal - events.tossApex.tReal' },
  { id: 'toss-height-spread', level: 'clip', unit: 'm (sample SD)', views: ['side', 'rear'], truth: 'sample SD (n - 1) of tossApexHeightM over the serves of the clip (series: truth-series.json)' },
  { id: 'toss-forward-spread', level: 'clip', unit: 'm (sample SD)', views: ['side'], truth: 'sample SD of tossApexForwardOfFrontToeM' },
  { id: 'contact-height-ratio', level: 'serve', unit: 'ratio of standing height (m in alt)', views: ['side', 'rear'], truth: 'metrics.contactHeightRatio (ball centre at contact / player.heightM)' },
  { id: 'contact-forward', level: 'serve', unit: 'm', views: ['side'], truth: 'metrics.contactForwardOfFrontToeM' },
  { id: 'rhythm-release-to-contact', level: 'serve', unit: 's', views: ['side', 'rear'], truth: 'metrics.releaseToContactS' },
  { id: 'rhythm-spread', level: 'clip', unit: 's (sample SD)', views: ['side', 'rear'], truth: 'sample SD of releaseToContactS' },
  { id: 'trophy-pause', level: 'serve', unit: 's', views: ['side', 'rear'], truth: 'metrics.trophyPauseS (trophyEnd - trophyStart, the kinematic hold)' },
  { id: 'leg-drive', level: 'serve', unit: '% of standing height', views: ['side'], truth: 'legDrive.hipRisePctHeight: 100 x (mid-hip z at contact - lowest mid-hip z in [tossRelease, contact - 0.08 s]) / player.heightM' },
  { id: 'drive-time', level: 'serve', unit: 's', views: ['side'], truth: 'legDrive.driveTimeS: contact - time of the lowest mid-hip' },
  { id: 'loading-depth', level: 'serve', unit: '% of standing height', views: ['side'], truth: 'legDrive.loadingDepthPctHeight: 100 x (mid-hip z at toss release - lowest mid-hip z) / player.heightM (descriptive only)' },
  { id: 'deep-bend-flag', level: 'serve', unit: 'boolean', views: ['side'], truth: 'front (tossing-side) knee 3D flexion at the kinematic trophy >= 45 deg (research 05 6.5 "deep"); alt gives the loading-window maximum and the truth.json maxFrontKneeFlexion3DDeg' },
  { id: 'shoulder-tilt-trophy', level: 'serve', unit: 'deg (3D; 2D and level-corrected 2D in alt)', views: ['side'], truth: 'shoulderTiltTrophy: elevation of the hitting -> tossing shoulder line at the kinematic trophy position (events.trophy, midpoint of the hold); positive = front (tossing) shoulder up. alt.atHipLowest3D: the same at the lowest mid-hip (METRICS.md 2.4.4 trophy detector)' },
  { id: 'knee-bend-band', level: 'serve', unit: 'little | moderate | deep', views: ['rear'], truth: 'band of the back (hitting-side) knee 3D flexion at the kinematic trophy (the knee nearer a rear camera): < 20 little, 20-45 moderate, >= 45 deep (research 05 6.5); alt.bandMetricsMdEdges uses METRICS.md 3.14 edges (25 / 55)' },
  { id: 'shoulder-over-shoulder-contact', level: 'serve', unit: 'deg (3D; 2D and level-corrected 2D in alt)', views: ['rear'], truth: 'shoulderOverShoulderContact: elevation of the tossing -> hitting shoulder line at contact; positive = hitting shoulder up' },
  { id: 'landing-distance', level: 'serve', unit: 'm', views: ['side'], truth: 'landing.fromStartToeM: tossing-side toe x at landing - the same toe x at toss release (S0); alt.fromBaselineM = metrics.landingDistanceInsideBaselineM' },
  { id: 'repeatability', level: 'clip', unit: 'index', views: ['side', 'rear'], truth: 'no truth value: an app-defined composite; its components are the spreads above' },
  { id: 'serve-in-rate', level: 'clip', unit: 'k of n', views: ['side', 'rear'], playerEntered: true, truth: 'count of serves with metrics.bounceInServiceBox' },
  { id: 'first-serve-in-rate', level: 'clip', unit: 'k of n', views: ['side', 'rear'], playerEntered: true, truth: 'not modelled: the generator has no serve number (null)' },
  { id: 'double-faults', level: 'clip', unit: 'count', views: ['side', 'rear'], playerEntered: true, truth: 'not modelled (null)' },
  { id: 'placement-zone', level: 'serve', unit: 'T | body | wide', views: ['side', 'rear'], playerEntered: true, truth: 'intended = serves[].direction (the aim); actual = thirds of the service-box half-width from the centre line at the first bounce (null for a fault)' },
  { id: 'serve-type-mix', level: 'serve', unit: 'flat | slice | kick', views: ['side', 'rear'], playerEntered: true, truth: 'serves[].style' },
  { id: 'speed-experimental', level: 'serve', unit: 'km/h', views: ['side'], minCaptureFps: 120, truth: 'metrics.ballSpeedAtContactKmh (launch speed just after contact, = ballPeakSpeedKmh); needs a target tag (serves[].direction)' },
  { id: 'speed-average-rear', level: 'serve', unit: 'km/h', views: ['rear'], truth: 'metrics.avgSpeedContactToBouncePathKmh (path length / flight time); alt.chordKmh = avgSpeedContactToBounceKmh' },
  { id: 'speed-radar-entered', level: 'serve', unit: 'km/h', views: ['side', 'rear', 'front45'], playerEntered: true, truth: 'no radar is simulated (null); a radar would read about metrics.ballPeakSpeedKmh' },
  { id: 'spin', level: 'serve', unit: 'rpm', views: [], truth: 'always unavailable in the app; the generating spin is serves[].ball.spinRpm (for reference only)' },
  { id: 'capture-quality', level: 'clip', unit: 'inputs', views: ['side', 'rear'], truth: 'captureQuality block: the true capture conditions behind each METRICS.md 3.25 check' },
]

function availability(spec: CanonicalSpec, view: View, captureFps: number): { supported: boolean; reason?: string } {
  if (spec.views.length === 0) return { supported: false, reason: 'NOT_MEASURABLE' }
  if (spec.playerEntered && spec.id !== 'placement-zone' && spec.id !== 'serve-in-rate') return { supported: true, reason: 'PLAYER_ENTERED' }
  if (!spec.views.includes(view)) return { supported: false, reason: 'VIEW_NOT_SUPPORTED' }
  if (spec.minCaptureFps && captureFps < spec.minCaptureFps) return { supported: false, reason: 'FPS_TOO_LOW' }
  return { supported: true }
}

// ---------------------------------------------------------------------------------------------
// Whole clip
// ---------------------------------------------------------------------------------------------

export interface AugmentOptions {
  /** Rebuilt scenario for the continuous derivation (null: stored landmarks only). */
  rebuilt?: BuiltScenario | null
  generator?: Record<string, unknown>
}

const num = (m: Record<string, Num>, k: string): number => {
  const v = m[k]
  if (typeof v !== 'number') throw new Error(`truth metric ${k} missing`)
  return v
}

export function buildExtraTruth(truth: TruthFile, opts: AugmentOptions = {}): Record<string, unknown> {
  const H = truth.player.heightM
  const view = truth.settings.view
  const fps = truth.video.captureFps
  const eventFrame = (t: number) => {
    const frame = t * fps
    const frameIndex = Math.round(frame)
    return { frameIndex, frame: r(frame, 4), inClip: frameIndex >= 0 && frameIndex < truth.video.frameCount }
  }

  let continuousNote: string | null = null
  let drift: number | null = null
  let rebuilt = opts.rebuilt ?? null
  if (rebuilt) {
    drift = motionDriftM(truth, rebuilt)
    if (Math.abs(rebuilt.t0S - truth.settings.t0MotionS) > 1e-6) {
      continuousNote = `rebuilt clip starts at ${rebuilt.t0S} s, truth at ${truth.settings.t0MotionS} s`
      rebuilt = null
    } else if (drift > DRIFT_TOLERANCE_M) {
      continuousNote = `rebuilt motion differs from the stored landmarks by ${(drift * 1000).toFixed(2)} mm (> ${DRIFT_TOLERANCE_M * 1000} mm): generator code changed since this clip was encoded`
      rebuilt = null
    } else {
      for (const s of truth.serves) {
        const plan = rebuilt.clip.plans.find((p) => p.index === s.index)
        if (!plan || Math.abs(plan.times.contactS - rebuilt.t0S - s.events.contact.tReal) > 2e-6) {
          continuousNote = `serve ${s.index}: rebuilt contact time does not match truth`
          rebuilt = null
          break
        }
      }
    }
  } else continuousNote = 'no rebuilt scenario supplied'

  const serves = truth.serves.map((s) => {
    const m = s.metrics
    const atFrames = serveBlock(truth, s, instantsAtFrames(truth, s), eventFrame)
    const continuous = rebuilt ? serveBlock(truth, s, instantsContinuous(truth, s, rebuilt), eventFrame) : null
    const best = continuous ?? atFrames

    // Knees at the trophy (lowest mid-hip). truth.json's max*KneeFlexion3DDeg span [motionStart,
    // contact] and can pick up the airborne leg tuck just before contact, so they are kept as alt only.
    const kn = best.knees

    // Outcome and flight time (truth.json of the 2026-09-26 corpus stores the flight time as
    // `flightTReal`, shifted by the clip start; recompute it from the events).
    const inBox = m.bounceInServiceBox === true
    const bounceX = num(m, 'bounceXM')
    const bounceY = num(m, 'bounceYM')
    const netClear = typeof m.netClearanceM === 'number' ? m.netClearanceM : null
    const flightTimeS = s.events.bounce.tReal - s.events.contact.tReal
    const outcome = serveOutcome(inBox, bounceX, netClear)

    const values: Record<string, { value: Num; alt?: Record<string, Num>; source: string }> = {
      'toss-apex-height': { value: r(num(m, 'tossApexHeightM') / H, 5), alt: { m: num(m, 'tossApexHeightM') }, source: 'truth' },
      'toss-forward': { value: num(m, 'tossApexForwardOfFrontToeM'), source: 'truth' },
      'toss-drop': { value: num(m, 'tossHeightAboveContactM'), alt: { timeS: r(s.events.contact.tReal - s.events.tossApex.tReal, 6) }, source: 'truth' },
      'contact-height-ratio': { value: num(m, 'contactHeightRatio'), alt: { m: num(m, 'contactHeightM') }, source: 'truth' },
      'contact-forward': { value: num(m, 'contactForwardOfFrontToeM'), source: 'truth' },
      'rhythm-release-to-contact': { value: num(m, 'releaseToContactS'), source: 'truth' },
      'trophy-pause': { value: num(m, 'trophyPauseS'), source: 'truth' },
      'leg-drive': { value: best.legDrive.hipRisePctHeight, alt: { m: best.legDrive.hipRiseM }, source: continuous ? 'continuous' : 'atFrames' },
      'drive-time': { value: best.legDrive.driveTimeS, source: continuous ? 'continuous' : 'atFrames' },
      'loading-depth': { value: best.legDrive.loadingDepthPctHeight, alt: { m: best.legDrive.loadingDepthM }, source: continuous ? 'continuous' : 'atFrames' },
      'deep-bend-flag': {
        value: kn.front.deg3D >= KNEE_BAND_EDGES.deep,
        alt: { frontKneeAtTrophy3DDeg: kn.front.deg3D, frontKneeLoadingMax3DDeg: kn.loadingMaxFront3DDeg, truthJsonMaxFrontKneeFlexion3DDeg: num(m, 'maxFrontKneeFlexion3DDeg'), generatingMaxKneeFlexionDeg: rn(s.params?.maxKneeFlexionDeg as number | undefined, 3) },
        source: continuous ? 'continuous' : 'atFrames',
      },
      'shoulder-tilt-trophy': {
        value: best.shoulderTiltTrophy.deg3D,
        alt: {
          deg2D: best.shoulderTiltTrophy.deg2D,
          deg2DLevel: best.shoulderTiltTrophy.deg2DLevel,
          atTReal: best.shoulderTiltTrophy.atTReal,
          atHipLowest3D: best.shoulderTiltHipLowest.deg3D,
          atHipLowest2DLevel: best.shoulderTiltHipLowest.deg2DLevel,
          sideBend2DLevel: best.trophySideBend.deg2DLevel,
        },
        source: continuous ? 'continuous' : 'atFrames',
      },
      'knee-bend-band': {
        value: kneeBand(kn.back.deg3D),
        alt: {
          backKneeAtTrophy3DDeg: kn.back.deg3D,
          backKneeAtTrophy2DDeg: kn.back.deg2D,
          backKneeAtTrophy2DLevelDeg: kn.back.deg2DLevel,
          bandMetricsMdEdges: kneeBandMetricsMd(kn.back.deg3D),
          frontKneeAtTrophy3DDeg: kn.front.deg3D,
          frontKneeBand: kneeBand(kn.front.deg3D),
          backKneeLoadingMax3DDeg: kn.loadingMaxBack3DDeg,
        },
        source: continuous ? 'continuous' : 'atFrames',
      },
      'shoulder-over-shoulder-contact': {
        value: best.shoulderOverShoulderContact.deg3D,
        alt: { deg2D: best.shoulderOverShoulderContact.deg2D, deg2DLevel: best.shoulderOverShoulderContact.deg2DLevel },
        source: continuous ? 'continuous' : 'atFrames',
      },
      'landing-distance': { value: best.landing.fromStartToeM, alt: { fromBaselineM: num(m, 'landingDistanceInsideBaselineM') }, source: continuous ? 'continuous' : 'atFrames' },
      'placement-zone': { value: s.direction, alt: { actual: placementZone(inBox, bounceY), bounceXM: bounceX, bounceYM: bounceY }, source: 'truth' },
      'serve-type-mix': { value: s.style, source: 'truth' },
      'speed-experimental': { value: num(m, 'ballSpeedAtContactKmh'), alt: { peakKmh: num(m, 'ballPeakSpeedKmh'), targetTag: s.direction }, source: 'truth' },
      'speed-average-rear': { value: num(m, 'avgSpeedContactToBouncePathKmh'), alt: { chordKmh: num(m, 'avgSpeedContactToBounceKmh'), flightTimeS: r(flightTimeS, 6) }, source: 'truth' },
      'speed-radar-entered': { value: null, alt: { radarEquivalentKmh: num(m, 'ballPeakSpeedKmh') }, source: 'not simulated' },
      spin: { value: null, alt: { generatingSpinRpm: s.ball.spinRpm }, source: 'always unavailable' },
    }
    const canonical: Record<string, unknown> = {}
    for (const spec of CANONICAL.filter((c) => c.level === 'serve')) {
      const v = values[spec.id]
      canonical[spec.id] = { ...v, unit: spec.unit, availability: availability(spec, view, fps) }
    }
    return {
      index: s.index,
      courtSide: s.courtSide,
      direction: s.direction,
      style: s.style,
      outcome,
      flightTimeS: r(flightTimeS, 6),
      canonical,
      continuous,
      atFrames,
    }
  })

  // Clip level.
  const counted = truth.serves.filter((s) => s.events.contact.inClip)
  const spread = (k: string) => rn(sampleSD(counted.map((s) => num(s.metrics, k))), 5)
  const inCount = counted.filter((s) => s.metrics.bounceInServiceBox === true).length
  const tally = (xs: (string | null)[]) => xs.reduce<Record<string, number>>((acc, x) => ((acc[x ?? 'fault'] = (acc[x ?? 'fault'] ?? 0) + 1), acc), {})
  const clipValues: Record<string, { value: Num | Record<string, number>; alt?: Record<string, Num>; source: string }> = {
    'serve-count': { value: counted.length, alt: { servesInTruth: truth.serves.length }, source: 'truth' },
    'toss-height-spread': { value: spread('tossApexHeightM'), alt: { n: counted.length }, source: 'truth' },
    'toss-forward-spread': { value: spread('tossApexForwardOfFrontToeM'), alt: { n: counted.length }, source: 'truth' },
    'rhythm-spread': { value: spread('releaseToContactS'), alt: { n: counted.length }, source: 'truth' },
    repeatability: { value: null, source: 'app-defined composite' },
    'serve-in-rate': { value: counted.length ? r(inCount / counted.length, 5) : null, alt: { k: inCount, n: counted.length }, source: 'truth' },
    'first-serve-in-rate': { value: null, source: 'not modelled' },
    'double-faults': { value: null, source: 'not modelled' },
  }
  const clipCanonical: Record<string, unknown> = {}
  for (const spec of CANONICAL.filter((c) => c.level === 'clip' && c.id !== 'capture-quality')) {
    clipCanonical[spec.id] = { ...clipValues[spec.id], unit: spec.unit, availability: availability(spec, view, fps) }
  }
  clipCanonical['placement-zone-counts'] = {
    value: { intended: tally(counted.map((s) => s.direction)), actual: tally(serves.filter((_, i) => truth.serves[i].events.contact.inClip).map((s) => (s.canonical['placement-zone'] as { alt: { actual: string | null } }).alt.actual)) },
    source: 'truth',
  }
  clipCanonical['serve-type-mix-counts'] = { value: tally(counted.map((s) => s.style)), source: 'truth' }
  clipCanonical['capture-quality'] = { value: captureQuality(truth), unit: 'inputs', availability: availability(CANONICAL.find((c) => c.id === 'capture-quality')!, view, fps), source: 'truth' }

  return {
    format: EXTRA_FORMAT,
    clipId: truth.clipId,
    job: truth.job,
    truthFile: 'truth.json',
    generator: opts.generator ?? {},
    view,
    playerHeightM: H,
    handedness: truth.player.handedness,
    derivation: {
      atFrames: 'stored frames[].world / frames[].landmarks at this clip\'s frame times (nearest frame to each instant)',
      continuous: continuousNote ? null : `kinematic model rebuilt from scenario job "${truth.job}", sampled every ${CONTINUOUS_STEP_S * 1000} ms with exact event instants`,
      continuousSkipped: continuousNote,
      rebuildMaxDeviationMm: drift === null ? null : r(drift * 1000, 4),
      canonicalPrefers: 'continuous when present, else atFrames',
    },
    conventions: {
      frontShoulder: 'tossing side (left for a right-hander); hitting shoulder = the other',
      hipMid: 'midpoint of the LEFT_HIP and RIGHT_HIP landmarks (hip joint centres); heights are court z',
      trophy: 'kinematic trophy position = truth.json events.trophy (midpoint of the hold); hipLowest = lowest mid-hip in [tossRelease, contact - 0.08 s], the METRICS.md 2.4.4 trophy detector and the leg-drive lowest point',
      deg2D: 'image-plane angle in this clip\'s camera (pixels, isotropic)',
      deg2DLevel: 'the same camera rotated level about its centre (pitch and roll removed; METRICS.md 1.1 level correction)',
      deg3D: 'elevation above the horizontal plane (court z up)',
    },
    serves,
    clip: clipCanonical,
  }
}

/** True capture conditions behind the METRICS.md 3.25 capture-quality checks. */
export function captureQuality(truth: TruthFile): Record<string, unknown> {
  const S = truth.settings
  const I = S.intrinsics
  const W = truth.video.width
  const Hpx = truth.video.height
  const c0 = camPose(truth, truth.frames[0])
  const { pitchDeg, rollDeg } = pitchRollDeg(c0)
  const sides = bodySides(truth.player.handedness)
  // Standing height in pixels: stature x fy / depth of the mid-hip in the first frame (setup stance).
  const w0 = truth.frames[0].world
  const hip0: V3 = [(w0[LM.LEFT_HIP][0] + w0[LM.RIGHT_HIP][0]) / 2, (w0[LM.LEFT_HIP][1] + w0[LM.RIGHT_HIP][1]) / 2, (w0[LM.LEFT_HIP][2] + w0[LM.RIGHT_HIP][2]) / 2]
  const depth = toCam(c0, hip0)[2]
  const standingPx = (truth.player.heightM * I.fyPx) / depth
  const perServe = truth.serves.map((s) => {
    const nearest = (t: number) => truth.frames.reduce((b, f) => (Math.abs(f.tReal - t) < Math.abs(b.tReal - t) ? f : b), truth.frames[0])
    const fRel = nearest(s.events.tossRelease.tReal)
    const toe = fRel.world[sides.toss.toe]
    const cRel = camPose(truth, fRel)
    const fApex = nearest(s.events.tossApex.tReal)
    const apexCam = toCam(camPose(truth, fApex), s.ball.apex)
    const apexY = (I.fyPx * (apexCam[1] / apexCam[2]) + I.cyPx) / Hpx
    // Full body inside a 3 % margin from motion start to landing (landmark points).
    let framed = true
    for (const f of truth.frames) {
      if (f.tReal < s.events.motionStart.tReal || f.tReal > s.events.landing.tReal) continue
      if (!f.landmarks || f.landmarks.some((l) => l.x < 0.03 || l.x > 0.97 || l.y < 0.03 || l.y > 0.97)) {
        framed = false
        break
      }
    }
    // Serve-ball streak length in ball diameters over the contact frame and the next two.
    const k0 = s.events.contact.frameIndex
    const streaks: number[] = []
    for (const f of truth.frames.slice(Math.max(0, k0), k0 + 3)) {
      for (const b of f.balls) {
        if (b.id !== s.index || b.state !== 'flight' || b.radius <= 0) continue
        streaks.push(Math.hypot((b.streak[2] - b.streak[0]) * W, (b.streak[3] - b.streak[1]) * Hpx) / (2 * b.radius * Hpx))
      }
    }
    const streak = streaks.length ? Math.max(...streaks) : null
    return {
      index: s.index,
      frameTopAtServerM: r(rowHeightAtPlane(truth, cRel, 0, toe), 3),
      frameBottomAtServerM: r(rowHeightAtPlane(truth, cRel, Hpx, toe), 3),
      tossApexInFrame: s.visibility.tossApexInFrame,
      apexRowFromTopFrac: r(apexY, 4),
      apexHeadroomOk: apexY >= 0.03,
      bodyInside3pcMarginMotionStartToLanding: framed,
      contactBallStreakDiameters: rn(streak, 2),
    }
  })
  return {
    captureFps: truth.video.captureFps,
    mediaFps: truth.video.fps,
    timeScale: truth.video.timeScale,
    width: W,
    height: Hpx,
    orientation: S.orientation,
    view: S.view,
    distanceM: S.distanceM,
    distanceFrom: S.distanceFrom ?? 'front toe of the first serve at toss release',
    cameraHeightM: S.cameraHeightM,
    lookAtHeightM: S.lookAtHeightM,
    focal35mmEquivMm: S.focal35mmEquivMm,
    pitchDeg: r(pitchDeg, 3),
    rollDeg: r(rollDeg, 3),
    lighting: S.lighting.preset,
    shutterS: S.shutterS,
    flickerHz: S.lighting.flickerHz,
    shake: S.shake ?? null,
    crf: S.crf,
    standingHeightPx: r(standingPx, 1),
    standingHeightPxPer1080ShortSide: r((standingPx * 1080) / Math.min(W, Hpx), 1),
    standingHeightPxPer1080FrameHeight: r((standingPx * 1080) / Hpx, 1),
    perServe,
  }
}
