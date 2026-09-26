import { anthropometry, armReachM, legLengthM, type Anthropometry } from '../anthropometry.ts'
import {
  BALL,
  G,
  ballistic,
  defaultAero,
  dribblePosition,
  planDribble,
  simulateServeFlight,
  solveLaunch,
  tossVelocity,
  type DribbleBounce,
  type FlightResult,
} from '../ball.ts'
import { serveTarget, type CourtSide } from '../court.ts'
import { MonotoneCubic, VecTrack, bisect, hermite, smoothstep } from '../math/interp.ts'
import {
  add,
  addScaled,
  dist,
  lerp,
  mid,
  norm,
  scale,
  sub,
  toBasis,
  toRad,
  type Basis,
  type Vec3,
} from '../math/vec.ts'
import { apexForReleaseToContact, tossTimes, type Handedness, type ServeParams } from '../params.ts'
import { legSpanForFlexion } from './ik.ts'
import {
  ankleFromToe,
  assemblePose,
  hipPositions,
  inclinationToFlexLat,
  kneeDrivenPelvisZ,
  mirrorPoint,
  solveLeg,
  mirrorPose,
  thoraxBasis,
  toeFromAnkle,
  type ArmKey,
  type FootState,
  type PosePoints,
  type PostureValues,
} from './skeleton.ts'

/**
 * Builds a whole clip (one or more serves with walking, pauses and ball bounces between them) as
 * keyframed channels evaluated by monotone cubic interpolation, plus a few solved constraints:
 *  - toss release height is exact (tossing-arm elevation solved),
 *  - the ball follows gravity from release through the requested apex to contact,
 *  - the racket string centre meets the ball at the contact instant (pelvis position solved),
 *  - peak front-knee flexion equals the requested value (pelvis height solved from leg geometry),
 *  - trunk inclination at contact equals the requested value (thorax angles solved),
 *  - pelvis height is ballistic while airborne, front toe lands at the requested distance.
 * The model is built for a right-hander; left-handers are mirrored at output.
 */

export interface ClipSpec {
  heightM: number
  handedness: Handedness
  serves: ServeParams[]
  /** Pre-serve ball bounces per serve (default 0). */
  dribbles?: number[]
  /** Extra standing time after each serve's recovery before walking back (s). */
  idleS?: number[]
  /** Time after the last recovery before the clip ends (s). */
  tailS?: number
}

export type BallState = 'in-hand' | 'dribble' | 'toss' | 'flight' | 'after-bounce'

interface BallSegment {
  t0: number
  t1: number
  state: BallState
  /** Canonical-frame position; undefined for in-hand (taken from the pose). */
  pos?: (t: number) => Vec3
}

export interface BallPlan {
  id: number
  tAppearS: number
  segments: BallSegment[]
}

export interface ServeTimes {
  setupStartS: number
  dribbleStartS: number | null
  motionStartS: number
  tossReleaseS: number
  tossApexS: number
  trophyStartS: number
  trophyEndS: number
  contactS: number
  takeoffS: number
  landingS: number
  landingAbsorbEndS: number
  bounceS: number
  recoveryEndS: number
}

export interface ServePlan {
  index: number
  params: ServeParams
  /** Court side in the canonical right-handed frame (mirrored for left-handers). */
  canonicalSide: CourtSide
  times: ServeTimes
  /** Canonical-frame points. */
  frontToeAtRelease: Vec3
  release: Vec3
  apex: Vec3
  contact: Vec3
  tossV0: Vec3
  target: Vec3
  flight: FlightResult
  launchElevationDeg: number
  launchAzimuthDeg: number
  pelvisAtContact: Vec3
  jumpDesignM: number
  reachAngleDeg: number
  trophyPauseActualS: number
  driveActualS: number
  releaseReachable: boolean
  dribbleTimes: number[]
  dribbles: DribbleBounce[]
}

type ScalarName = 'pelvisX' | 'pelvisY' | 'pelvisYaw' | 'thoraxYaw' | 'thoraxLat' | 'thoraxFlex' | 'kneeLead' | 'palmDown'
type VecName = 'footL' | 'footR' | 'rWrist' | 'rPole' | 'lWrist' | 'lPole' | 'racketDir' | 'racketFace'

interface Piece<T> {
  t0: number
  fn: (t: number) => T
}

class KeyStore {
  readonly scalars = new Map<ScalarName, [number, number][]>()
  readonly vecs = new Map<VecName, [number, number[]][]>()

  s(name: ScalarName, t: number, v: number): void {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new Error(`bad key ${name} @${t}: ${v}`)
    const arr = this.scalars.get(name) ?? []
    arr.push([t, v])
    this.scalars.set(name, arr)
  }

  v(name: VecName, t: number, v: readonly number[]): void {
    if (!v.every(Number.isFinite) || !Number.isFinite(t)) throw new Error(`bad key ${name} @${t}: ${v}`)
    const arr = this.vecs.get(name) ?? []
    arr.push([t, [...v]])
    this.vecs.set(name, arr)
  }
}

const footVec = (f: { toe: Vec3; yawDeg: number; pitchDeg: number }): number[] => [f.toe[0], f.toe[1], f.toe[2], f.yawDeg, f.pitchDeg]

// Arm key poses in the thorax frame (forward, left, up), wrist in units of arm reach.
const ARM = {
  readyR: { wrist: [0.42, 0.3, -0.62], pole: [-0.6, -0.8, -0.3] },
  readyL: { wrist: [0.55, -0.1, -0.45], pole: [-0.5, 0.8, -0.3] },
  relaxedR: { wrist: [0.12, -0.05, -0.93], pole: [-1, -0.3, 0] },
  relaxedL: { wrist: [0.12, 0.05, -0.93], pole: [-1, 0.3, 0] },
  downR: { wrist: [0.25, 0.1, -0.9], pole: [-0.6, -1, 0] },
  downL: { wrist: [0.22, 0.02, -0.95], pole: [-0.6, 1, 0] },
  backR: { wrist: [-0.35, -0.35, -0.78], pole: [0, -1, 0.2] },
  riseL: { wrist: [0.45, 0.0, -0.75], pole: [-0.6, 0.5, -0.6] },
  releaseR: { wrist: [-0.5, -0.55, -0.3], pole: [0, -0.3, -1] },
  trophyR: { wrist: [-0.25, -0.38, 0.35], pole: [-0.2, -1, -0.1] },
  dropR: { wrist: [-0.35, 0.02, 0.12], pole: [0.3, -0.2, 1] },
  upR: { wrist: [-0.05, -0.03, 0.72], pole: [0.4, -0.4, 0.8] },
  followR1: { wrist: [0.55, 0.3, 0.05], pole: [0.3, -1, -0.3] },
  followR2: { wrist: [0.3, 0.75, -0.6], pole: [0, -0.5, -1] },
  dropL: { wrist: [0.45, -0.1, 0.1], pole: [0, 1, -0.3] },
  tuckL: { wrist: [0.38, -0.45, -0.45], pole: [0, 1, 0] },
  lowL: { wrist: [0.25, -0.1, -0.8], pole: [-0.5, 1, 0] },
  pocketL: { wrist: [-0.05, 0.05, -0.95], pole: [-1, 0.5, 0] },
  dribbleL: { wrist: [0.55, -0.12, -0.5], pole: [-0.3, 1, -0.4] },
  dribbleLowL: { wrist: [0.55, -0.12, -0.68], pole: [-0.3, 1, -0.4] },
  dribbleR: { wrist: [0.15, -0.05, -0.9], pole: [-1, -0.3, 0] },
} as const

const RACKET_KEYS = {
  ready: { dir: [0.3, 0.85, 0.42], face: [1, 0, 0.3] },
  relaxed: { dir: [0.55, 0.25, -0.8], face: [0, 1, 0] },
  down: { dir: [0.55, 0.35, -0.75], face: [0, 1, 0] },
  back: { dir: [-0.55, -0.45, -0.7], face: [0, 0, 1] },
  release: { dir: [-0.5, -0.5, 0.3], face: [0, 1, 0] },
  trophy: { dir: [-0.35, 0.05, 0.93], face: [0, 1, 0] },
  drop: { dir: [-0.25, 0.1, -0.96], face: [-1, 0, 0] },
  up: { dir: [-0.55, 0, 0.83], face: [0, -1, 0] },
  follow1: { dir: [0.75, 0.45, -0.45], face: [0, 1, 0] },
  follow2: { dir: [-0.25, 0.85, -0.45], face: [0, 0, 1] },
} as const

const armKey = (k: { wrist: readonly number[]; pole: readonly number[] }): ArmKey => ({
  wrist: [k.wrist[0], k.wrist[1], k.wrist[2]],
  pole: [k.pole[0], k.pole[1], k.pole[2]],
})

const v3of = (a: readonly number[]): Vec3 => [a[0], a[1], a[2]]

export class ClipMotion {
  readonly anthro: Anthropometry
  readonly handedness: Handedness
  readonly plans: ServePlan[] = []
  readonly balls: BallPlan[] = []
  durationS = 0

  private scalarTracks = new Map<ScalarName, MonotoneCubic>()
  private vecTracks = new Map<VecName, VecTrack>()
  /** Pelvis height pieces (each valid from t0 until the next piece). */
  zPieces: Piece<number>[] = []
  gazePieces: Piece<Vec3>[] = []
  planted: { left: [number, number][]; right: [number, number][] } = { left: [], right: [] }

  constructor(heightM: number, handedness: Handedness) {
    this.anthro = anthropometry(heightM)
    this.handedness = handedness
  }

  finalize(store: KeyStore): void {
    for (const [name, keys] of store.scalars) this.scalarTracks.set(name, new MonotoneCubic(keys))
    for (const [name, keys] of store.vecs) this.vecTracks.set(name, new VecTrack(keys))
    this.zPieces.sort((a, b) => a.t0 - b.t0)
    this.gazePieces.sort((a, b) => a.t0 - b.t0)
  }

  scalar(name: ScalarName, t: number): number {
    const tr = this.scalarTracks.get(name)
    if (!tr) throw new Error(`no track ${name}`)
    return tr.at(t)
  }

  vec(name: VecName, t: number): number[] {
    const tr = this.vecTracks.get(name)
    if (!tr) throw new Error(`no track ${name}`)
    return tr.at(t)
  }

  isPlanted(side: 'left' | 'right', t: number): boolean {
    return this.planted[side].some(([a, b]) => t >= a - 1e-9 && t <= b + 1e-9)
  }

  foot(side: 'left' | 'right', t: number): FootState {
    const f = this.vec(side === 'left' ? 'footL' : 'footR', t)
    return { toe: [f[0], f[1], Math.max(0, f[2])], yawDeg: f[3], pitchDeg: f[4], planted: this.isPlanted(side, t) }
  }

  pelvisZ(t: number): number {
    return pieceAt(this.zPieces, t)(t)
  }

  gaze(t: number): Vec3 {
    const ps = this.gazePieces
    const blend = 0.25
    let i = 0
    while (i + 1 < ps.length && ps[i + 1].t0 <= t) i++
    let v = ps[i].fn(t)
    // Cross-fade into every later piece that starts within `blend` seconds (chained, so overlapping
    // transitions stay continuous).
    for (let j = i + 1; j < ps.length && ps[j].t0 - t < blend; j++) v = lerp(v, ps[j].fn(t), smoothstep(1 - (ps[j].t0 - t) / blend))
    return v
  }

  bodyAt(t: number): { pelvis: Vec3; T: Basis; lSh: Vec3; rSh: Vec3; yaw: number } {
    const a = this.anthro
    const pelvis: Vec3 = [this.scalar('pelvisX', t), this.scalar('pelvisY', t), this.pelvisZ(t)]
    const T = thoraxBasis(this.scalar('thoraxYaw', t), this.scalar('thoraxLat', t), this.scalar('thoraxFlex', t))
    const ms = addScaled(pelvis, T.z, a.trunkM)
    return {
      pelvis,
      T,
      lSh: addScaled(ms, T.y, a.shoulderHalfWidthM),
      rSh: addScaled(ms, T.y, -a.shoulderHalfWidthM),
      yaw: this.scalar('pelvisYaw', t),
    }
  }

  values(t: number, withGaze = true): PostureValues {
    const r = this.vec('rWrist', t)
    const rp = this.vec('rPole', t)
    const l = this.vec('lWrist', t)
    const lp = this.vec('lPole', t)
    return {
      pelvis: [this.scalar('pelvisX', t), this.scalar('pelvisY', t), this.pelvisZ(t)],
      pelvisYawDeg: this.scalar('pelvisYaw', t),
      thoraxYawDeg: this.scalar('thoraxYaw', t),
      thoraxLatDeg: this.scalar('thoraxLat', t),
      thoraxFlexDeg: this.scalar('thoraxFlex', t),
      rightArm: { wrist: v3of(r), pole: v3of(rp) },
      leftArm: { wrist: v3of(l), pole: v3of(lp) },
      racketDir: v3of(this.vec('racketDir', t)),
      racketFace: v3of(this.vec('racketFace', t)),
      leftFoot: this.foot('left', t),
      rightFoot: this.foot('right', t),
      gaze: withGaze ? this.gaze(t) : [30, 0, 1],
      tossPalmDown: this.scalar('palmDown', t),
    }
  }

  /** Ball-in-hand point without evaluating the head (the gaze itself may follow the ball). */
  tossBallNoGaze(t: number): Vec3 {
    return assemblePose(this.anthro, this.values(t, false)).tossBallPt
  }

  canonicalPose(t: number): PosePoints {
    return assemblePose(this.anthro, this.values(t))
  }

  /** Pose in court coordinates for this player's handedness. */
  pose(t: number): PosePoints {
    const p = this.canonicalPose(t)
    return this.handedness === 'left' ? mirrorPose(p) : p
  }

  /** Canonical-frame ball positions at time t (in-hand balls use the pose). */
  canonicalBalls(t: number, pose?: PosePoints): { id: number; p: Vec3; state: BallState }[] {
    const out: { id: number; p: Vec3; state: BallState }[] = []
    for (const b of this.balls) {
      if (t < b.tAppearS) continue
      const seg = b.segments.find((s) => t >= s.t0 && t < s.t1) ?? b.segments[b.segments.length - 1]
      if (seg.state === 'in-hand') {
        out.push({ id: b.id, p: pose ? pose.tossBallPt : this.tossBallNoGaze(t), state: 'in-hand' })
      } else {
        out.push({ id: b.id, p: seg.pos!(t), state: seg.state })
      }
    }
    return out
  }

  /** World ball positions (mirrored for left-handers). */
  ballsAt(t: number, canonicalPose?: PosePoints): { id: number; p: Vec3; state: BallState }[] {
    const bs = this.canonicalBalls(t, canonicalPose)
    return this.handedness === 'left' ? bs.map((b) => ({ ...b, p: mirrorPoint(b.p) })) : bs
  }

  /** Mirror a canonical point into court coordinates for this player. */
  toWorld(p: Vec3): Vec3 {
    return this.handedness === 'left' ? mirrorPoint(p) : p
  }
}

function pieceAt<T>(pieces: Piece<T>[], t: number): (t: number) => T {
  let i = 0
  while (i + 1 < pieces.length && pieces[i + 1].t0 <= t) i++
  return pieces[i].fn
}

function memo<T>(f: () => T): () => T {
  let done = false
  let v: T
  return () => {
    if (!done) {
      v = f()
      done = true
    }
    return v
  }
}

interface StanceLayout {
  front: FootState
  back: FootState
  backUp: FootState
  pelvisSetup: [number, number]
  pelvisTrophy: [number, number]
}

function stanceLayout(a: Anthropometry, p: ServeParams, side: CourtSide): StanceLayout {
  const s = a.s
  const frontYaw = side === 'deuce' ? -35 : -30
  const F0: Vec3 = [-0.06 + p.stanceXOffsetM, (side === 'deuce' ? -0.35 : 0.85) + p.stanceYOffsetM, 0]
  const B0 = add(F0, [-0.6 * s, -0.25 * s, 0])
  const B1 = add(F0, [-0.22 * s, -0.2 * s, 0])
  const front: FootState = { toe: F0, yawDeg: frontYaw, pitchDeg: 0, planted: true }
  const back: FootState = { toe: B0, yawDeg: -95, pitchDeg: 0, planted: true }
  const backUp: FootState = { toe: B1, yawDeg: -55, pitchDeg: 6, planted: true }
  const ankF = ankleFromToe(a, F0, frontYaw, 0)
  const ankB = ankleFromToe(a, B0, -95, 0)
  const ankB1 = ankleFromToe(a, B1, -55, 6)
  const setup = mid(ankF, ankB)
  const trophy = p.stance === 'foot-up' ? add(mid(ankF, ankB1), [0.06 * s, 0.01, 0]) : lerp(ankB, ankF, 0.62)
  return { front, back, backUp, pelvisSetup: [setup[0], setup[1]], pelvisTrophy: [trophy[0], trophy[1]] }
}

const DRIBBLE_PERIOD_S = 0.55
const THORAX_CONTACT_YAW = -30
const PELVIS_CONTACT_YAW = -15
const SETUP = { pelvisYaw: -65, thoraxYaw: -72, flex: 6, lat: 0, knee: 10 }

/** Build a whole clip. */
export function buildClip(spec: ClipSpec): ClipMotion {
  const m = new ClipMotion(spec.heightM, spec.handedness)
  const a = m.anthro
  const store = new KeyStore()
  const armJobs: ((m: ClipMotion, st: KeyStore) => void)[] = []
  const n = spec.serves.length
  let tSetup = 0
  let prevReady: { left: FootState; right: FootState; tEnd: number } | null = null

  for (let k = 0; k < n; k++) {
    const p = spec.serves[k]
    const side: CourtSide = spec.handedness === 'left' ? (p.courtSide === 'deuce' ? 'ad' : 'deuce') : p.courtSide
    const layout = stanceLayout(a, p, side)
    if (prevReady) {
      tSetup = addWalk(m, store, armJobs, prevReady, layout, prevReady.tEnd + (spec.idleS?.[k] ?? 0.4))
    }
    const plan = planServe(m, store, armJobs, k, p, side, layout, tSetup, spec.dribbles?.[k] ?? 0)
    m.plans.push(plan)
    prevReady = {
      left: { toe: readyToes(plan).left, yawDeg: 0, pitchDeg: 0, planted: true },
      right: { toe: readyToes(plan).right, yawDeg: 0, pitchDeg: 0, planted: true },
      tEnd: plan.times.recoveryEndS,
    }
  }
  const last = m.plans[n - 1]
  m.durationS = Math.max(last.times.recoveryEndS + (spec.tailS ?? 0.8), last.times.bounceS + 0.4)

  m.finalize(store)
  // Arm keys need the finished body tracks (world-space keys are converted into the thorax frame).
  for (const job of armJobs) job(m, store)
  m.finalize(store)
  for (const plan of m.plans) plan.dribbles.push(...plan.dribbleTimes.map((tp) => planDribble(m.tossBallNoGaze(tp), tp, DRIBBLE_PERIOD_S)))
  return m
}

const readyCache = new WeakMap<ServePlan, { left: Vec3; right: Vec3 }>()
function readyToes(plan: ServePlan): { left: Vec3; right: Vec3 } {
  const r = readyCache.get(plan)
  if (!r) throw new Error('ready toes not set')
  return r
}

function planServe(
  m: ClipMotion,
  st: KeyStore,
  armJobs: ((m: ClipMotion, st: KeyStore) => void)[],
  k: number,
  p: ServeParams,
  side: CourtSide,
  L: StanceLayout,
  tSS: number,
  dribbleCount: number,
): ServePlan {
  const a = m.anthro
  const s = a.s
  const H = a.heightM
  const reach = armReachM(a)
  const legL = legLengthM(a)

  // ---- Timing -------------------------------------------------------------------------------
  const dribbleStart = dribbleCount > 0 ? tSS + 0.4 : null
  const dribblePeriod = DRIBBLE_PERIOD_S
  const dribbleGap = 0.25
  const dribbleDur = dribbleCount > 0 ? dribbleCount * (dribblePeriod + dribbleGap) + 0.2 : 0
  const tMS = tSS + (dribbleCount > 0 ? 0.4 + dribbleDur + 0.5 : 0.7)
  const m2r = p.motionToReleaseS
  const tDown = tMS + 0.4 * m2r
  const tBack = tMS + 0.72 * m2r
  const tRel = tMS + m2r
  const zRel = p.tossReleaseHeightM
  const zC = p.contactHeightRatio * H
  const zApex = p.releaseToContactS === undefined ? p.tossApexHeightM : apexForReleaseToContact(zRel, zC, p.releaseToContactS)
  const tt = tossTimes(zRel, zApex, zC)
  const tApex = tRel + tt.tUpS
  const tC = tApex + tt.tDownS
  let tTrE = tC - p.driveDurationS
  let tTrS = tTrE - p.trophyPauseS
  const minTrS = tRel + 0.22
  if (tTrS < minTrS) {
    tTrS = minTrS
    tTrE = Math.max(tTrE, tTrS)
    if (tTrE > tC - 0.18) tTrE = Math.max(tTrS, tC - 0.18)
  }
  const tDrop = tC - 0.4 * (tC - tTrE)
  const tUp = tC - 0.15 * (tC - tTrE)

  // ---- Setup / loading key values (all fixed before any solve) --------------------------------
  const kneeMax = p.maxKneeFlexionDeg
  const kneeRel = SETUP.knee + 0.55 * (kneeMax - SETUP.knee)
  const pSet = L.pelvisSetup
  const pRel: [number, number] = [pSet[0] + 0.02 * s, pSet[1] + 0.005]
  const pTro = L.pelvisTrophy
  const yawRel = -75
  const thoraxRel = { yaw: -92, lat: -6, flex: 0 }
  const backAtRel: FootState =
    p.stance === 'foot-up'
      ? { toe: add(lerp(L.back.toe, L.backUp.toe, 0.5), [0, 0, 0.02]), yawDeg: (L.back.yawDeg + L.backUp.yawDeg) / 2, pitchDeg: 12, planted: false }
      : L.back

  // Pelvis height at release from the front-knee flexion.
  const zPelvisRel = kneeDrivenPelvisZ(a, pRel, yawRel, L.front, 'left', kneeRel)
  const Trel = thoraxBasis(thoraxRel.yaw, thoraxRel.lat, thoraxRel.flex)
  const pelvisRel: Vec3 = [pRel[0], pRel[1], zPelvisRel]
  const lShRel = addScaled(addScaled(pelvisRel, Trel.z, a.trunkM), Trel.y, a.shoulderHalfWidthM)

  // Toss apex relative to the front toe (hitting side is -y in the canonical frame).
  const F0 = L.front.toe
  const apex: Vec3 = [F0[0] + p.tossApexForwardM, F0[1] - p.tossApexLateralM, zApex]

  // ---- Release solve ------------------------------------------------------------------------
  // The ball leaves the hand a little behind the apex (it drifts ~10 cm into the court on the way up).
  // Solve the wrist target so the ball centre sits exactly on that point; if the point is out of
  // reach, keep the height exact and let the horizontal position fall short.
  const releaseAim: Vec3 = [apex[0] - 0.1 * s, apex[1], zRel]
  const relValuesW = (wristRel: Vec3): PostureValues => {
    return {
      pelvis: pelvisRel,
      pelvisYawDeg: yawRel,
      thoraxYawDeg: thoraxRel.yaw,
      thoraxLatDeg: thoraxRel.lat,
      thoraxFlexDeg: thoraxRel.flex,
      rightArm: armKey(ARM.releaseR),
      leftArm: { wrist: wristRel, pole: [-0.6, 0.5, -0.6] },
      racketDir: v3of(RACKET_KEYS.release.dir),
      racketFace: v3of(RACKET_KEYS.release.face),
      leftFoot: L.front,
      rightFoot: backAtRel,
      gaze: apex,
      tossPalmDown: 0,
    }
  }
  const wristKeyFor = (wristW: Vec3): Vec3 => scale(toBasis(Trel, sub(wristW, lShRel)), 1 / reach)
  let wristW = add(releaseAim, [0, 0, -0.08 * s])
  for (let i = 0; i < 30; i++) {
    const ball = assemblePose(a, relValuesW(wristKeyFor(wristW))).tossBallPt
    wristW = add(wristW, sub(releaseAim, ball))
    // Keep the target within reach so the iteration cannot run away.
    const d = sub(wristW, lShRel)
    const dl = Math.hypot(d[0], d[1], d[2])
    if (dl > 0.995 * reach) wristW = addScaled(lShRel, d, (0.995 * reach) / dl)
  }
  let releaseReachable = dist(assemblePose(a, relValuesW(wristKeyFor(wristW))).tossBallPt, releaseAim) < 1e-4
  if (!releaseReachable) {
    // Out of reach: pull the hand in horizontally (toward the shoulder) until the height is exact.
    const dir0 = sub(wristW, lShRel)
    const zErr = (lift: number) => {
      const w = add(lShRel, norm(add(dir0, [0, 0, lift])))
      const ww = addScaled(lShRel, sub(w, lShRel), 0.99 * reach)
      return assemblePose(a, relValuesW(wristKeyFor(ww))).tossBallPt[2] - zRel
    }
    const lift = zErr(-3) * zErr(3) < 0 ? bisect(zErr, -3, 3, 1e-9) : 0
    wristW = addScaled(lShRel, norm(add(dir0, [0, 0, lift])), 0.99 * reach)
    releaseReachable = Math.abs(zErr(lift)) < 1e-4
  }
  const releaseWristKey = relValuesW(wristKeyFor(wristW)).leftArm
  const relPose = assemblePose(a, relValuesW(releaseWristKey.wrist))
  const release = relPose.tossBallPt
  const { v0: tossV0 } = tossVelocity(release, apex)
  const contact = ballistic(release, tossV0, tC - tRel)

  // ---- Outgoing ball ----------------------------------------------------------------------------
  const nominal = serveTarget(side, p.direction)
  const target: Vec3 = [nominal[0] + p.targetDepthOffsetM, nominal[1] + (side === 'deuce' ? 1 : -1) * p.targetLateralOffsetM, 0]
  const aero = defaultAero(p.spinRpm, sideSpinAxis(p.spinAxis, side))
  const speedMs = p.serveSpeedKmh / 3.6
  const launch = solveLaunch(tC, contact, speedMs, target, { aero }, p.launchAngleDeg)
  const flight = simulateServeFlight(tC, contact, launch.v0, { aero })
  const outDir = norm(launch.v0)

  // ---- Contact solve: trunk angles, reach angle and pelvis position ----------------------------
  const relAz = p.trunkLeanAzimuthDeg - THORAX_CONTACT_YAW
  const { flexDeg: flexC, latDeg: latC } = inclinationToFlexLat(p.trunkInclinationContactDeg, relAz)
  const Tc = thoraxBasis(THORAX_CONTACT_YAW, latC, flexC)
  const faceC = toBasis(Tc, outDir)
  const contactArm = (lamDeg: number) => {
    const l = toRad(lamDeg)
    const arm = norm([Math.sin(l), -0.05, Math.cos(l)])
    const l2 = toRad(lamDeg + 12)
    const rk = norm([Math.sin(l2), -0.05, Math.cos(l2)])
    return { arm: { wrist: scale(arm, 0.985), pole: [0.2, -1, 0] as Vec3 }, racket: rk }
  }
  const dummyFoot: FootState = { toe: [0, 0, -0.9], yawDeg: 0, pitchDeg: 60, planted: false }
  const contactValues = (lamDeg: number, pelvis: Vec3): PostureValues => {
    const ca = contactArm(lamDeg)
    return {
      pelvis,
      pelvisYawDeg: PELVIS_CONTACT_YAW,
      thoraxYawDeg: THORAX_CONTACT_YAW,
      thoraxLatDeg: latC,
      thoraxFlexDeg: flexC,
      rightArm: ca.arm,
      leftArm: armKey(ARM.tuckL),
      racketDir: ca.racket,
      racketFace: faceC,
      leftFoot: dummyFoot,
      rightFoot: dummyFoot,
      gaze: contact,
      tossPalmDown: 0,
    }
  }
  const ballOffset = scale(outDir, -(BALL.radiusM + 0.005)) // string centre sits just behind the ball
  const stringTarget = add(contact, ballOffset)
  const reachOffset = (lamDeg: number): Vec3 => assemblePose(a, contactValues(lamDeg, [0, 0, 0])).racketStringCentre
  // Straight-legged, on-toes take-off height (design value).
  const ankleToes = ankleFromToe(a, [0, 0, 0], 0, 35)[2]
  const zTakeoffDesign = ankleToes + Math.sqrt(legSpanForFlexion(a.thighM, a.shankM, 4) ** 2 - (0.12 * s) ** 2)
  const zPelvisTarget = zTakeoffDesign + p.jumpHeightM
  const zAtLam = (lam: number) => stringTarget[2] - reachOffset(lam)[2]
  let lam = 0
  {
    let best = Number.POSITIVE_INFINITY
    for (let l = -15; l <= 75; l += 1) {
      const e = Math.abs(zAtLam(l) - zPelvisTarget)
      if (e < best) {
        best = e
        lam = l
      }
    }
    const f = (l: number) => zAtLam(l) - zPelvisTarget
    for (const [lo, hi] of [
      [lam - 1, lam],
      [lam, lam + 1],
    ]) {
      if (lo >= -15 && hi <= 75 && f(lo) * f(hi) <= 0) {
        lam = bisect(f, lo, hi, 1e-6)
        break
      }
    }
  }
  const pelvisC = sub(stringTarget, reachOffset(lam))
  const jumpDesign = pelvisC[2] - zTakeoffDesign

  // Take-off: ballistic pelvis with apex at contact.
  const Jpos = Math.max(0, jumpDesign)
  let tTO = tC - Math.sqrt((2 * Jpos) / G)
  if (tTO < tTrE + 0.06) tTO = Math.min(tC, tTrE + 0.06)
  const zTO = pelvisC[2] - 0.5 * G * (tC - tTO) ** 2
  const vTO = G * (tC - tTO)

  // ---- Landing ----------------------------------------------------------------------------------
  const landX = p.landingDistanceM
  const landY = F0[1] + 0.1
  const landYaw = -15
  const landFoot: FootState = { toe: [landX, landY, 0], yawDeg: landYaw, pitchDeg: 22, planted: true }
  const pLand: [number, number] = [landX - 0.2 * s, landY - 0.08]
  const yawLand = 5
  let kneeTouch = 8
  let zLand = kneeDrivenPelvisZ(a, pLand, yawLand, landFoot, 'left', kneeTouch)
  const minDrop = 0.5 * G * 0.14 * 0.14
  while (pelvisC[2] - zLand < minDrop && kneeTouch < 45) {
    kneeTouch += 1
    zLand = kneeDrivenPelvisZ(a, pLand, yawLand, landFoot, 'left', kneeTouch)
  }
  const tLand = tC + Math.sqrt((2 * Math.max(1e-4, pelvisC[2] - zLand)) / G)
  const vLand = -G * (tLand - tC)
  const tAbs = tLand + 0.22
  const tRec = tLand + 1.1
  const rightLandToe: Vec3 = [landX + 0.02, landY - 0.4 * s, 0]
  const readyLeft: Vec3 = [landX, landY, 0]
  const pReady = mid(ankleFromToe(a, readyLeft, 0, 0), ankleFromToe(a, rightLandToe, 0, 0))

  // ---- Keys: pelvis & thorax --------------------------------------------------------------------
  const keyBody = (t: number, px: number, py: number, pyaw: number, tyaw: number, lat: number, flex: number) => {
    st.s('pelvisX', t, px)
    st.s('pelvisY', t, py)
    st.s('pelvisYaw', t, pyaw)
    st.s('thoraxYaw', t, tyaw)
    st.s('thoraxLat', t, lat)
    st.s('thoraxFlex', t, flex)
  }
  keyBody(tSS, pSet[0], pSet[1], SETUP.pelvisYaw, SETUP.thoraxYaw, SETUP.lat, SETUP.flex)
  st.s('kneeLead', tSS, SETUP.knee)
  st.s('palmDown', tSS, 0)
  const dribbleTimes: number[] = []
  if (dribbleStart !== null) {
    const tD0 = dribbleStart
    const tD1 = dribbleStart + dribbleDur
    for (const t of [tD0, tD1]) {
      keyBody(t, pSet[0] + 0.03, pSet[1], SETUP.pelvisYaw, SETUP.thoraxYaw + 4, 0, 16)
      st.s('kneeLead', t, 18)
    }
    st.s('palmDown', tD0 - 0.15, 1)
    st.s('palmDown', tD1 + 0.05, 1)
    st.s('palmDown', tD1 + 0.35, 0)
    for (let j = 0; j < dribbleCount; j++) dribbleTimes.push(tD0 + 0.2 + j * (dribblePeriod + dribbleGap))
  }
  keyBody(tMS, pSet[0], pSet[1], SETUP.pelvisYaw, SETUP.thoraxYaw, SETUP.lat, SETUP.flex)
  st.s('kneeLead', tMS, SETUP.knee)
  st.s('palmDown', tMS, 0)
  keyBody(tDown, pSet[0] - 0.06 * s, pSet[1] - 0.01, -68, -76, 0, 4)
  st.s('kneeLead', tDown, SETUP.knee + 4)
  keyBody(tRel, pRel[0], pRel[1], yawRel, thoraxRel.yaw, thoraxRel.lat, thoraxRel.flex)
  st.s('kneeLead', tRel, kneeRel)
  keyBody(tTrS, pTro[0], pTro[1], -88, -112, -17, -8)
  st.s('kneeLead', tTrS, kneeMax)
  keyBody(tTrE, pTro[0] + 0.02 * s, pTro[1], -88, -112, -17, -8)
  st.s('kneeLead', tTrE, kneeMax)
  st.s('kneeLead', tTrE + 0.05, kneeMax * 0.7)
  // Pelvis at take-off (explicit key so the feet can be solved there); thorax keyed at the racket drop.
  const pTroE: Vec3 = [pTro[0] + 0.02 * s, pTro[1], 0]
  const fTO = (tTO - tTrE) / Math.max(1e-6, tC - tTrE)
  const pTO = lerp(pTroE, pelvisC, fTO)
  const yawTO = -88 + (PELVIS_CONTACT_YAW + 88) * fTO
  if (tTO < tC - 1e-6) {
    st.s('pelvisX', tTO, pTO[0])
    st.s('pelvisY', tTO, pTO[1])
    st.s('pelvisYaw', tTO, yawTO)
  }
  st.s('thoraxYaw', tDrop, -80)
  st.s('thoraxLat', tDrop, -6)
  st.s('thoraxFlex', tDrop, -3)
  keyBody(tC, pelvisC[0], pelvisC[1], PELVIS_CONTACT_YAW, THORAX_CONTACT_YAW, latC, flexC)
  const tMidAir = tC + 0.5 * (tLand - tC)
  const pMidAir = lerp(pelvisC, [pLand[0], pLand[1], 0], 0.55)
  keyBody(tMidAir, pMidAir[0], pMidAir[1], 5, -5, latC * 0.6, flexC + 6)
  keyBody(tLand, pLand[0], pLand[1], yawLand, 22, 4, 24)
  keyBody(tAbs, pLand[0] + 0.08 * s, pLand[1] - 0.03, 4, 18, 3, 26)
  keyBody(tLand + 0.5, lerp([pLand[0], pLand[1], 0], pReady, 0.7)[0], lerp([pLand[0], pLand[1], 0], pReady, 0.7)[1], 2, 8, 1, 14)
  keyBody(tRec, pReady[0], pReady[1], 0, 0, 0, 8)
  st.s('kneeLead', tRec, SETUP.knee)

  // ---- Keys: feet -------------------------------------------------------------------------------
  const front = L.front
  st.v('footL', tSS, footVec(front))
  st.v('footL', tTrE, footVec(front))
  const hipsTO = hipPositions(a, [pTO[0], pTO[1], zTO], yawTO)
  const legTO = solveLeg(a, hipsTO.left, { ...front, pitchDeg: 38, planted: true })
  st.v('footL', tTO, footVec({ toe: legTO.toe, yawDeg: front.yawDeg, pitchDeg: legTO.pitchDeg }))
  m.planted.left.push([tSS, tTO])
  // Airborne front leg: hangs under the hip at contact, then reaches for the landing spot.
  const hipsC = hipPositions(a, pelvisC, PELVIS_CONTACT_YAW)
  if (tC - tTO > 0.04) {
    const ankleC = add(hipsC.left, [0.06 * s, 0.02, -0.985 * legL])
    // Short hops (little or no jump) keep the foot near where it left the court, so it never has to
    // swing up under the hip in a few tens of milliseconds.
    const w = Math.min(1, (tC - tTO) / 0.1)
    const toe = lerp(legTO.toe, toeFromAnkle(a, ankleC, -10, 55), w)
    st.v('footL', tC, footVec({ toe, yawDeg: front.yawDeg + (-10 - front.yawDeg) * w, pitchDeg: legTO.pitchDeg + (55 - legTO.pitchDeg) * w }))
  }
  st.v('footL', tLand, footVec(landFoot))
  st.v('footL', tLand + 0.12, footVec({ ...landFoot, pitchDeg: 0 }))
  st.v('footL', tLand + 0.8, footVec({ toe: readyLeft, yawDeg: 0, pitchDeg: 0 }))
  st.v('footL', tRec, footVec({ toe: readyLeft, yawDeg: 0, pitchDeg: 0 }))
  m.planted.left.push([tLand, tRec])

  const back = L.back
  st.v('footR', tSS, footVec(back))
  if (p.stance === 'foot-up') {
    st.v('footR', tRel - 0.12, footVec({ ...back, pitchDeg: 10 }))
    st.v('footR', tRel, footVec(backAtRel))
    st.v('footR', tRel + 0.12, footVec(L.backUp))
    st.v('footR', tTrE, footVec(L.backUp))
    const legR = solveLeg(a, hipsTO.right, { ...L.backUp, pitchDeg: 42, planted: true })
    st.v('footR', tTO, footVec({ toe: legR.toe, yawDeg: L.backUp.yawDeg, pitchDeg: legR.pitchDeg }))
    m.planted.right.push([tSS, tRel - 0.12], [tRel + 0.12, tTO])
  } else {
    st.v('footR', tTrE, footVec(back))
    const legR = solveLeg(a, hipsTO.right, { ...back, pitchDeg: 42, planted: true })
    st.v('footR', tTO, footVec({ toe: legR.toe, yawDeg: back.yawDeg, pitchDeg: legR.pitchDeg }))
    m.planted.right.push([tSS, tTO])
  }
  // Back leg kicks back and up for balance, then steps through after the front foot lands.
  const ankleKick = add(hipsC.right, [-0.38 * s, -0.02, -0.6 * s])
  st.v('footR', tC + 0.03, footVec({ toe: toeFromAnkle(a, ankleKick, -60, 60), yawDeg: -60, pitchDeg: 60 }))
  const hipsLand = hipPositions(a, [pLand[0], pLand[1], zLand], yawLand)
  const ankleLandR = add(hipsLand.right, [-0.3 * s, -0.04, -0.55 * s])
  st.v('footR', tLand, footVec({ toe: toeFromAnkle(a, ankleLandR, -40, 60), yawDeg: -40, pitchDeg: 60 }))
  st.v('footR', tLand + 0.3, footVec({ toe: rightLandToe, yawDeg: -5, pitchDeg: 15 }))
  st.v('footR', tLand + 0.42, footVec({ toe: rightLandToe, yawDeg: -5, pitchDeg: 0 }))
  st.v('footR', tRec, footVec({ toe: rightLandToe, yawDeg: 0, pitchDeg: 0 }))
  m.planted.right.push([tLand + 0.3, tRec])

  // ---- Pelvis height pieces ---------------------------------------------------------------------
  const kneeZ = (t: number, flexDeg: number) =>
    kneeDrivenPelvisZ(a, [m.scalar('pelvisX', t), m.scalar('pelvisY', t)], m.scalar('pelvisYaw', t), m.foot('left', t), 'left', flexDeg)
  m.zPieces.push({ t0: tSS, fn: (t) => kneeZ(t, m.scalar('kneeLead', t)) })
  const zLow = memo(() => kneeZ(tTrE, kneeMax))
  if (tTO > tTrE + 1e-6) {
    m.zPieces.push({
      t0: tTrE,
      fn: (t) => {
        const h = tTO - tTrE
        // Never let the front knee bend beyond the requested peak while the legs drive.
        return Math.max(hermite(zLow(), zTO, 0, vTO * h, (t - tTrE) / h), kneeZ(t, kneeMax))
      },
    })
  }
  m.zPieces.push({ t0: tTO, fn: (t) => pelvisC[2] - 0.5 * G * (t - tC) ** 2 })
  const zAbs = memo(() => kneeZ(tAbs, kneeTouch + 22))
  m.zPieces.push({ t0: tLand, fn: (t) => hermite(zLand, zAbs(), vLand * 0.22, 0, (t - tLand) / 0.22) })
  const zReady = memo(() => kneeZ(tRec, SETUP.knee))
  m.zPieces.push({ t0: tAbs, fn: (t) => hermite(zAbs(), zReady(), 0, 0, Math.min(1, (t - tAbs) / (tRec - tAbs))) })
  m.zPieces.push({ t0: tRec, fn: (t) => kneeZ(t, SETUP.knee) })

  // ---- Ball -------------------------------------------------------------------------------------
  const plan: ServePlan = {
    index: k,
    params: p,
    canonicalSide: side,
    times: {
      setupStartS: tSS,
      dribbleStartS: dribbleStart,
      motionStartS: tMS,
      tossReleaseS: tRel,
      tossApexS: tApex,
      trophyStartS: tTrS,
      trophyEndS: tTrE,
      contactS: tC,
      takeoffS: tTO,
      landingS: tLand,
      landingAbsorbEndS: tAbs,
      bounceS: flight.tBounceS,
      recoveryEndS: tRec,
    },
    frontToeAtRelease: F0,
    release,
    apex,
    contact,
    tossV0,
    target,
    flight,
    launchElevationDeg: launch.elevationDeg,
    launchAzimuthDeg: launch.azimuthDeg,
    pelvisAtContact: pelvisC,
    jumpDesignM: jumpDesign,
    reachAngleDeg: lam,
    trophyPauseActualS: tTrE - tTrS,
    driveActualS: tC - tTrE,
    releaseReachable,
    dribbleTimes,
    dribbles: [],
  }
  readyCache.set(plan, { left: readyLeft, right: rightLandToe })

  const prevBall = m.balls[m.balls.length - 1]
  const tAppear = prevBall ? m.plans[k - 1].times.recoveryEndS - 0.25 : 0
  const ballPlan: BallPlan = { id: k, tAppearS: tAppear, segments: [] }
  m.balls.push(ballPlan)

  // ---- Gaze -------------------------------------------------------------------------------------
  const far: Vec3 = [target[0] - 2, target[1], 0.4]
  const ballPos = (t: number): Vec3 => {
    const b = m.canonicalBalls(t).find((x) => x.id === k)
    return b ? b.p : far
  }
  m.gazePieces.push({ t0: tSS, fn: () => far })
  if (dribbleStart !== null) {
    m.gazePieces.push({ t0: dribbleStart, fn: ballPos })
    m.gazePieces.push({ t0: dribbleStart + dribbleDur + 0.15, fn: () => far })
  }
  // Eyes on the ball through the toss; the head then holds on the contact point (it cannot track a
  // 40 m/s ball 0.4 m from the face) and turns toward the target area 0.1-0.35 s after contact.
  m.gazePieces.push({ t0: tRel - 0.35, fn: (t) => (t < tC ? ballPos(t) : contact) })
  m.gazePieces.push({ t0: tC + 0.35, fn: () => far })
  m.gazePieces.push({ t0: tLand + 0.45, fn: () => [12, pReady[1], 1.0] })

  // ---- Arms (second pass: needs finished body tracks) ---------------------------------------------
  armJobs.push((mm, s2) => {
    const keyR = (t: number, arm: ArmKey, racket: { dir: readonly number[]; face: readonly number[] }) => {
      s2.v('rWrist', t, arm.wrist)
      s2.v('rPole', t, arm.pole)
      s2.v('racketDir', t, racket.dir)
      s2.v('racketFace', t, racket.face)
    }
    const keyL = (t: number, arm: ArmKey) => {
      s2.v('lWrist', t, arm.wrist)
      s2.v('lPole', t, arm.pole)
    }
    /** Wrist key (thorax frame) that puts the left wrist at a world point at time t. */
    const worldLeft = (t: number, wristW: Vec3, pole: Vec3 = [-0.6, 0.5, -0.6]): ArmKey => {
      const b = mm.bodyAt(t)
      return { wrist: scale(toBasis(b.T, sub(wristW, b.lSh)), 1 / reach), pole }
    }
    keyR(tSS, armKey(ARM.readyR), RACKET_KEYS.ready)
    keyL(tSS, armKey(ARM.readyL))
    if (dribbleStart !== null) {
      const tD0 = dribbleStart
      const tD1 = dribbleStart + dribbleDur
      keyR(tD0, armKey(ARM.dribbleR), RACKET_KEYS.relaxed)
      keyR(tD1, armKey(ARM.dribbleR), RACKET_KEYS.relaxed)
      keyL(tD0 - 0.05, armKey(ARM.dribbleL))
      for (const tp of dribbleTimes) {
        keyL(tp, armKey(ARM.dribbleL))
        keyL(tp + 0.12, armKey(ARM.dribbleLowL))
        keyL(tp + dribblePeriod - 0.1, armKey(ARM.dribbleL))
        keyL(tp + dribblePeriod, armKey(ARM.dribbleL))
      }
      keyL(tD1, armKey(ARM.dribbleL))
    }
    keyR(tMS, armKey(ARM.readyR), RACKET_KEYS.ready)
    keyL(tMS, armKey(ARM.readyL))
    keyR(tDown, armKey(ARM.downR), RACKET_KEYS.down)
    keyL(tDown, armKey(ARM.downL))
    keyR(tBack, armKey(ARM.backR), RACKET_KEYS.back)
    keyL(tBack, armKey(ARM.riseL))
    // Hand follows the ball's (back-extrapolated) ballistic path just before release.
    const relWristW = add(relPose.lm[15], [0, 0, 0])
    const wristToBall = sub(relWristW, release)
    for (const dt of [0.1, 0.05]) {
      const bp = ballistic(release, tossV0, -dt)
      keyL(tRel - dt, worldLeft(tRel - dt, add(bp, wristToBall)))
    }
    keyL(tRel, releaseWristKey)
    keyR(tRel, armKey(ARM.releaseR), RACKET_KEYS.release)
    // Tossing arm keeps pointing at the ball (elevation capped at 80 deg).
    const pointAtBall = (t: number): ArmKey => {
      const b = mm.bodyAt(t)
      const ball = ballistic(release, tossV0, t - tRel)
      const d = sub(ball, b.lSh)
      const horiz = Math.hypot(d[0], d[1])
      const elev = Math.min(Math.atan2(d[2], horiz), toRad(80))
      const azm = Math.atan2(d[1], d[0])
      const dirW: Vec3 = [Math.cos(elev) * Math.cos(azm), Math.cos(elev) * Math.sin(azm), Math.sin(elev)]
      return { wrist: scale(toBasis(b.T, dirW), 0.985), pole: [-0.6, 0.5, -0.6] }
    }
    keyL(tRel + 0.15, pointAtBall(tRel + 0.15))
    keyL(tTrS, pointAtBall(tTrS))
    keyL(tTrE, pointAtBall(tTrE))
    keyR(tTrS, armKey(ARM.trophyR), RACKET_KEYS.trophy)
    keyR(tTrE, armKey(ARM.trophyR), RACKET_KEYS.trophy)
    keyR(tDrop, armKey(ARM.dropR), RACKET_KEYS.drop)
    keyL(tDrop, armKey(ARM.dropL))
    keyR(tUp, armKey(ARM.upR), RACKET_KEYS.up)
    const ca = contactArm(lam)
    keyR(tC, ca.arm, { dir: ca.racket, face: faceC })
    keyL(tC, armKey(ARM.tuckL))
    keyR(tC + 0.12, armKey(ARM.followR1), RACKET_KEYS.follow1)
    keyR(tC + 0.4, armKey(ARM.followR2), RACKET_KEYS.follow2)
    keyL(tC + 0.4, armKey(ARM.lowL))
    keyR(tRec - 0.3, armKey(ARM.relaxedR), RACKET_KEYS.relaxed)
    keyL(tRec - 0.3, armKey(ARM.pocketL))
    keyR(tRec, armKey(ARM.relaxedR), RACKET_KEYS.relaxed)
    keyL(tRec, armKey(ARM.relaxedL))

    // Ball segments (need the finished motion for in-hand positions).
    const segs: BallSegment[] = []
    let tCursor = tAppear
    for (const tp of dribbleTimes) {
      segs.push({ t0: tCursor, t1: tp, state: 'in-hand' })
      const d = memo(() => planDribble(mm.tossBallNoGaze(tp), tp, dribblePeriod))
      segs.push({ t0: tp, t1: tp + dribblePeriod, state: 'dribble', pos: (t) => dribblePosition(d(), t) })
      tCursor = tp + dribblePeriod
    }
    segs.push({ t0: tCursor, t1: tRel, state: 'in-hand' })
    segs.push({ t0: tRel, t1: tC, state: 'toss', pos: (t) => ballistic(release, tossV0, t - tRel) })
    segs.push({ t0: tC, t1: flight.tBounceS, state: 'flight', pos: (t) => flight.flight.stateAt(t).p })
    segs.push({ t0: flight.tBounceS, t1: Number.POSITIVE_INFINITY, state: 'after-bounce', pos: (t) => flight.afterBounce.stateAt(t).p })
    ballPlan.segments = segs
  })

  return plan
}

/** Spin axis for the canonical frame; the ad court is served the same way (axis unchanged). */
function sideSpinAxis(axis: [number, number, number], _side: CourtSide): Vec3 {
  return norm(axis)
}

/** Walk from the ready position back to the next stance. Returns the next setup start time. */
function addWalk(
  m: ClipMotion,
  st: KeyStore,
  armJobs: ((m: ClipMotion, st: KeyStore) => void)[],
  from: { left: FootState; right: FootState; tEnd: number },
  to: StanceLayout,
  tStart: number,
): number {
  const a = m.anthro
  const stepS = 0.45
  const fromP = mid(from.left.toe, from.right.toe)
  const toP = mid(to.front.toe, to.back.toe)
  const distM = dist(fromP, toP)
  const nPerFoot = Math.max(1, Math.ceil(distM / 0.7))
  // Steps alternate right, left, right, left ... each foot gets nPerFoot steps.
  type Plant = { toe: Vec3; yaw: number }
  const cur: Record<'left' | 'right', Plant> = {
    left: { toe: from.left.toe, yaw: from.left.yawDeg },
    right: { toe: from.right.toe, yaw: from.right.yawDeg },
  }
  const goal: Record<'left' | 'right', Plant> = {
    left: { toe: to.front.toe, yaw: to.front.yawDeg },
    right: { toe: to.back.toe, yaw: to.back.yawDeg },
  }
  const start: Record<'left' | 'right', Plant> = { left: { ...cur.left }, right: { ...cur.right } }
  const count = { left: 0, right: 0 }
  let t = tStart
  // Hold the ready pose at walk start.
  const pelvisAt = (): [number, number] => {
    const al = ankleFromToe(a, cur.left.toe, cur.left.yaw, 0)
    const ar = ankleFromToe(a, cur.right.toe, cur.right.yaw, 0)
    const p = mid(al, ar)
    return [p[0], p[1]]
  }
  const keyBodyAt = (tt: number, frac: number) => {
    const p = pelvisAt()
    const yaw = -65 * frac
    st.s('pelvisX', tt, p[0])
    st.s('pelvisY', tt, p[1])
    st.s('pelvisYaw', tt, yaw)
    st.s('thoraxYaw', tt, yaw - 7 * frac)
    st.s('thoraxLat', tt, 0)
    st.s('thoraxFlex', tt, 7)
    st.s('kneeLead', tt, 10)
  }
  keyBodyAt(t, 0)
  st.v('footL', t, footVec({ toe: cur.left.toe, yawDeg: cur.left.yaw, pitchDeg: 0 }))
  st.v('footR', t, footVec({ toe: cur.right.toe, yawDeg: cur.right.yaw, pitchDeg: 0 }))
  const totalSteps = nPerFoot * 2
  const plantedWindows: Record<'left' | 'right', [number, number][]> = { left: [], right: [] }
  const lastPlant: Record<'left' | 'right', number> = { left: from.tEnd, right: from.tEnd }
  for (let i = 0; i < totalSteps; i++) {
    const footSide: 'left' | 'right' = i % 2 === 0 ? 'right' : 'left'
    count[footSide]++
    const f = count[footSide] / nPerFoot
    const next: Plant = {
      toe: lerp(start[footSide].toe, goal[footSide].toe, f),
      yaw: start[footSide].yaw + (goal[footSide].yaw - start[footSide].yaw) * f,
    }
    const name = footSide === 'left' ? 'footL' : 'footR'
    plantedWindows[footSide].push([lastPlant[footSide], t])
    st.v(name, t, footVec({ toe: cur[footSide].toe, yawDeg: cur[footSide].yaw, pitchDeg: 0 }))
    const mTo = lerp(cur[footSide].toe, next.toe, 0.5)
    st.v(name, t + stepS * 0.5, footVec({ toe: [mTo[0], mTo[1], 0.06], yawDeg: (cur[footSide].yaw + next.yaw) / 2, pitchDeg: 12 }))
    t += stepS
    cur[footSide] = next
    st.v(name, t, footVec({ toe: next.toe, yawDeg: next.yaw, pitchDeg: 0 }))
    lastPlant[footSide] = t
    keyBodyAt(t, (i + 1) / totalSteps)
  }
  const tEnd = t + 0.3
  plantedWindows.left.push([lastPlant.left, tEnd + 1e-3])
  plantedWindows.right.push([lastPlant.right, tEnd + 1e-3])
  m.planted.left.push(...plantedWindows.left)
  m.planted.right.push(...plantedWindows.right)

  // Pelvis height: stand height (same left-leg rule as the neighbouring pieces) with a small step bob.
  const kneeZ = (tt: number) =>
    kneeDrivenPelvisZ(a, [m.scalar('pelvisX', tt), m.scalar('pelvisY', tt)], m.scalar('pelvisYaw', tt), m.foot('left', tt), 'left', 10)
  const z0 = memo(() => kneeZ(tStart))
  const z1 = memo(() => kneeZ(tEnd))
  const walkEnd = tStart + totalSteps * stepS
  m.zPieces.push({
    t0: tStart,
    fn: (tt) => {
      const u = Math.min(1, Math.max(0, (tt - tStart) / (tEnd - tStart)))
      const phase = ((tt - tStart) / stepS) % 1
      const bob = tt < walkEnd ? 0.012 * Math.sin(Math.PI * phase) ** 2 : 0
      return z0() + (z1() - z0()) * smoothstep(u) - bob
    },
  })
  m.gazePieces.push({ t0: tStart, fn: () => [12, toP[1], 1.0] })
  armJobs.push((_mm, s2) => {
    for (const tt of [tStart, walkEnd]) {
      s2.v('rWrist', tt, ARM.relaxedR.wrist)
      s2.v('rPole', tt, ARM.relaxedR.pole)
      s2.v('racketDir', tt, RACKET_KEYS.relaxed.dir)
      s2.v('racketFace', tt, RACKET_KEYS.relaxed.face)
      s2.v('lWrist', tt, ARM.relaxedL.wrist)
      s2.v('lPole', tt, ARM.relaxedL.pole)
    }
  })
  st.s('palmDown', tStart, 0)
  return tEnd
}
