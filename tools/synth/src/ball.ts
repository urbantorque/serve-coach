import { COURT, netTopHeightM } from './court.ts'
import { add, addScaled, cross, len, norm, scale, type Vec3 } from './math/vec.ts'
import { bisect } from './math/interp.ts'

export const G = 9.81
export const BALL = {
  massKg: 0.057,
  diameterM: 0.067,
  radiusM: 0.0335,
  dragCoefficient: 0.55,
  airDensityKgM3: 1.2,
} as const

export interface AeroParams {
  dragCoefficient: number
  airDensityKgM3: number
  /** Spin rate (rpm) and axis (unit, world). Magnus lift uses C_L = 1 / (2 + v / (r * omega)). */
  spinRpm: number
  spinAxis: Vec3
}

export const NO_AERO: AeroParams = { dragCoefficient: 0, airDensityKgM3: BALL.airDensityKgM3, spinRpm: 0, spinAxis: [0, 1, 0] }

export function defaultAero(spinRpm = 0, spinAxis: Vec3 = [0, 1, 0]): AeroParams {
  return { dragCoefficient: BALL.dragCoefficient, airDensityKgM3: BALL.airDensityKgM3, spinRpm, spinAxis: norm(spinAxis) }
}

const AREA = Math.PI * BALL.radiusM * BALL.radiusM

/** Acceleration of the ball: gravity + quadratic drag + Magnus lift. */
export function ballAcceleration(v: Vec3, aero: AeroParams): Vec3 {
  const speed = len(v)
  let a: Vec3 = [0, 0, -G]
  if (speed < 1e-9) return a
  const q = (0.5 * aero.airDensityKgM3 * AREA * speed * speed) / BALL.massKg
  a = addScaled(a, v, (-q * aero.dragCoefficient) / speed)
  if (aero.spinRpm > 0) {
    const omega = (aero.spinRpm * 2 * Math.PI) / 60
    const cl = 1 / (2 + speed / (BALL.radiusM * omega))
    const liftDir = cross(aero.spinAxis, v)
    const l = len(liftDir)
    if (l > 1e-9) a = addScaled(a, liftDir, (q * cl) / l)
  }
  return a
}

interface State {
  p: Vec3
  v: Vec3
}

function rk4Step(s: State, dt: number, aero: AeroParams): State {
  const k1v = ballAcceleration(s.v, aero)
  const k1p = s.v
  const v2 = addScaled(s.v, k1v, dt / 2)
  const k2v = ballAcceleration(v2, aero)
  const k2p = v2
  const v3 = addScaled(s.v, k2v, dt / 2)
  const k3v = ballAcceleration(v3, aero)
  const k3p = v3
  const v4 = addScaled(s.v, k3v, dt)
  const k4v = ballAcceleration(v4, aero)
  const k4p = v4
  const p = addScaled(s.p, add(add(k1p, scale(k2p, 2)), add(scale(k3p, 2), k4p)), dt / 6)
  const v = addScaled(s.v, add(add(k1v, scale(k2v, 2)), add(scale(k3v, 2), k4v)), dt / 6)
  return { p, v }
}

export interface TrajSample {
  t: number
  p: Vec3
  v: Vec3
}

/** Densely sampled trajectory; positions between samples use cubic Hermite (exact to O(dt^4)). */
export class Trajectory {
  constructor(readonly samples: TrajSample[]) {}

  get tStart(): number {
    return this.samples[0].t
  }

  get tEnd(): number {
    return this.samples[this.samples.length - 1].t
  }

  stateAt(t: number): { p: Vec3; v: Vec3 } {
    const s = this.samples
    if (t <= s[0].t) return { p: s[0].p, v: s[0].v }
    if (t >= s[s.length - 1].t) return { p: s[s.length - 1].p, v: s[s.length - 1].v }
    let lo = 0
    let hi = s.length - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (s[m].t <= t) lo = m
      else hi = m
    }
    const a = s[lo]
    const b = s[hi]
    const h = b.t - a.t
    const u = (t - a.t) / h
    const u2 = u * u
    const u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1
    const h10 = u3 - 2 * u2 + u
    const h01 = -2 * u3 + 3 * u2
    const h11 = u3 - u2
    const d00 = (6 * u2 - 6 * u) / h
    const d10 = 3 * u2 - 4 * u + 1
    const d01 = (-6 * u2 + 6 * u) / h
    const d11 = 3 * u2 - 2 * u
    const p: Vec3 = [0, 0, 0]
    const v: Vec3 = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      p[i] = h00 * a.p[i] + h10 * h * a.v[i] + h01 * b.p[i] + h11 * h * b.v[i]
      v[i] = d00 * a.p[i] + d10 * a.v[i] + d01 * b.p[i] + d11 * b.v[i]
    }
    return { p, v }
  }
}

/** Toss under gravity only (no drag, no spin): initial velocity that reaches `apex` from `release`. */
export function tossVelocity(release: Vec3, apex: Vec3): { v0: Vec3; tUpS: number } {
  const dz = apex[2] - release[2]
  if (dz <= 0) throw new Error(`toss apex (${apex[2].toFixed(2)} m) must be above release (${release[2].toFixed(2)} m)`)
  const tUpS = Math.sqrt((2 * dz) / G)
  return { v0: [(apex[0] - release[0]) / tUpS, (apex[1] - release[1]) / tUpS, G * tUpS], tUpS }
}

/** Analytic ballistic position (gravity only). */
export const ballistic = (p0: Vec3, v0: Vec3, dt: number): Vec3 => [
  p0[0] + v0[0] * dt,
  p0[1] + v0[1] * dt,
  p0[2] + v0[2] * dt - 0.5 * G * dt * dt,
]

export interface FlightResult {
  tContactS: number
  contact: Vec3
  v0: Vec3
  flight: Trajectory
  /** Time the ball first touches the court (centre at z = radius). */
  tBounceS: number
  /** Court point directly below the ball centre at first touch (z = 0). */
  bounce: Vec3
  vBeforeBounce: Vec3
  peakSpeedMs: number
  flightTimeS: number
  /** Straight-line (3D chord) contact-to-bounce-touch distance / flight time. */
  avgSpeedChordMs: number
  /** Path length along the trajectory / flight time. */
  avgSpeedPathMs: number
  /** Horizontal contact-to-bounce distance / flight time. */
  avgSpeedHorizontalMs: number
  netCrossing: { tS: number; y: number; zCentreM: number; clearanceM: number } | null
  /** After the bounce: continues with drag until it reaches the back fence, then drops and rests. */
  afterBounce: Trajectory
}

export interface FlightOptions {
  aero: AeroParams
  dtS?: number
  bounceCorVertical?: number
  bounceHorizontalRetention?: number
  backFenceXM?: number
  endTimeS?: number
}

/** Integrate the outgoing serve from contact to first bounce (RK4, bounce time refined by bisection). */
export function simulateServeFlight(tContactS: number, contact: Vec3, v0: Vec3, opts: FlightOptions): FlightResult {
  const dt = opts.dtS ?? 0.0005
  const r = BALL.radiusM
  const samples: TrajSample[] = [{ t: tContactS, p: contact, v: v0 }]
  let s: State = { p: contact, v: v0 }
  let t = tContactS
  let peak = len(v0)
  let path = 0
  for (let i = 0; i < 200000; i++) {
    const next = rk4Step(s, dt, opts.aero)
    if (next.p[2] <= r) {
      const tau = bisect((x) => rk4Step(s, x, opts.aero).p[2] - r, 0, dt, 1e-12)
      const hit = rk4Step(s, tau, opts.aero)
      path += len(addScaled(hit.p, s.p, -1))
      t += tau
      s = hit
      samples.push({ t, p: s.p, v: s.v })
      peak = Math.max(peak, len(s.v))
      break
    }
    path += len(addScaled(next.p, s.p, -1))
    s = next
    t += dt
    samples.push({ t, p: s.p, v: s.v })
    peak = Math.max(peak, len(s.v))
    if (t - tContactS > 10) throw new Error('serve flight did not reach the court within 10 s')
  }
  const flight = new Trajectory(samples)
  const tBounceS = t
  const touch = s.p
  const bounce: Vec3 = [touch[0], touch[1], 0]
  const flightTimeS = tBounceS - tContactS
  const chord = len(addScaled(touch, contact, -1))
  const horiz = Math.hypot(touch[0] - contact[0], touch[1] - contact[1])

  let netCrossing: FlightResult['netCrossing'] = null
  if (contact[0] < COURT.netXM && touch[0] > COURT.netXM) {
    const tn = bisect((x) => flight.stateAt(x).p[0] - COURT.netXM, tContactS, tBounceS, 1e-10)
    const pn = flight.stateAt(tn).p
    netCrossing = { tS: tn, y: pn[1], zCentreM: pn[2], clearanceM: pn[2] - r - netTopHeightM(pn[1]) }
  }

  const afterBounce = simulateAfterBounce(tBounceS, touch, s.v, opts)
  return {
    tContactS,
    contact,
    v0,
    flight,
    tBounceS,
    bounce,
    vBeforeBounce: s.v,
    peakSpeedMs: peak,
    flightTimeS,
    avgSpeedChordMs: chord / flightTimeS,
    avgSpeedPathMs: path / flightTimeS,
    avgSpeedHorizontalMs: horiz / flightTimeS,
    netCrossing,
    afterBounce,
  }
}

function simulateAfterBounce(t0: number, p0: Vec3, vIn: Vec3, opts: FlightOptions): Trajectory {
  const e = opts.bounceCorVertical ?? 0.75
  const mu = opts.bounceHorizontalRetention ?? 0.65
  const fenceX = opts.backFenceXM ?? COURT.lengthM + 6.4
  const tEnd = opts.endTimeS ?? t0 + 6
  const dt = 0.002
  const r = BALL.radiusM
  const aero: AeroParams = { ...opts.aero, spinRpm: 0 }
  let s: State = { p: p0, v: [vIn[0] * mu, vIn[1] * mu, -vIn[2] * e] }
  let t = t0
  const out: TrajSample[] = [{ t, p: s.p, v: s.v }]
  while (t < tEnd) {
    let next = rk4Step(s, dt, aero)
    if (next.p[0] > fenceX - r) {
      // Dead ball against the back fence: kill horizontal velocity.
      next = { p: [fenceX - r, next.p[1], next.p[2]], v: [0, 0, next.v[2]] }
    }
    if (next.p[2] < r) {
      const vz = -next.v[2] * e
      next = { p: [next.p[0], next.p[1], r], v: vz < 0.3 ? [next.v[0] * 0.98, next.v[1] * 0.98, 0] : [next.v[0] * mu, next.v[1] * mu, vz] }
    }
    s = next
    t += dt
    out.push({ t, p: s.p, v: s.v })
  }
  return new Trajectory(out)
}

export interface LaunchSolution {
  elevationDeg: number
  azimuthDeg: number
  v0: Vec3
  result: FlightResult
}

export function launchVelocity(speedMs: number, elevationDeg: number, azimuthDeg: number): Vec3 {
  const el = (elevationDeg * Math.PI) / 180
  const az = (azimuthDeg * Math.PI) / 180
  return [speedMs * Math.cos(el) * Math.cos(az), speedMs * Math.cos(el) * Math.sin(az), speedMs * Math.sin(el)]
}

/**
 * Find the launch elevation (and azimuth) so the first bounce lands on `target` (x,y).
 * Elevation is solved by bisection on bounce x, azimuth by a few fixed-point corrections on bounce y.
 * When `fixedElevationDeg` is given only the azimuth is solved.
 */
export function solveLaunch(
  tContactS: number,
  contact: Vec3,
  speedMs: number,
  target: Vec3,
  opts: FlightOptions,
  fixedElevationDeg?: number,
): LaunchSolution {
  let azimuthDeg = (Math.atan2(target[1] - contact[1], target[0] - contact[0]) * 180) / Math.PI
  let elevationDeg = fixedElevationDeg ?? 0
  const quick = { ...opts, dtS: 0.002 }
  const bounceX = (el: number, az: number) =>
    simulateServeFlight(tContactS, contact, launchVelocity(speedMs, el, az), quick).bounce[0]
  for (let iter = 0; iter < 6; iter++) {
    if (fixedElevationDeg === undefined) {
      const az = azimuthDeg
      const lo = -25
      const hi = 30
      const fLo = bounceX(lo, az) - target[0]
      const fHi = bounceX(hi, az) - target[0]
      elevationDeg = fLo * fHi > 0 ? (Math.abs(fLo) < Math.abs(fHi) ? lo : hi) : bisect((el) => bounceX(el, az) - target[0], lo, hi, 1e-4)
    }
    const res = simulateServeFlight(tContactS, contact, launchVelocity(speedMs, elevationDeg, azimuthDeg), quick)
    const want = Math.atan2(target[1] - contact[1], target[0] - contact[0])
    const got = Math.atan2(res.bounce[1] - contact[1], res.bounce[0] - contact[0])
    const corr = ((want - got) * 180) / Math.PI
    azimuthDeg += corr
    if (Math.abs(corr) < 1e-4) break
  }
  const v0 = launchVelocity(speedMs, elevationDeg, azimuthDeg)
  return { elevationDeg, azimuthDeg, v0, result: simulateServeFlight(tContactS, contact, v0, opts) }
}

export interface DribbleBounce {
  tPushS: number
  tFloorS: number
  tCatchS: number
  /** Hand position at push and catch (ball centre). */
  hand: Vec3
  vPushZ: number
  vReboundZ: number
}

/**
 * Pre-serve dribble: the ball is pushed down from `hand` at tPush and caught at the same height
 * after `periodS`. Vertical only, gravity only, coefficient of restitution `cor`.
 */
export function planDribble(hand: Vec3, tPushS: number, periodS: number, cor = 0.75): DribbleBounce {
  const h = hand[2] - BALL.radiusM
  // Unknown push speed u (downward). Fall time tf, impact speed w = sqrt(u^2 + 2gh);
  // rebound speed e*w, rise time tr to height h. Solve tf + tr = period.
  const total = (u: number) => {
    const w = Math.sqrt(u * u + 2 * G * h)
    const tf = (w - u) / G
    const vr = cor * w
    const disc = vr * vr - 2 * G * h
    if (disc < 0) return Number.POSITIVE_INFINITY
    const tr = (vr - Math.sqrt(disc)) / G
    return tf + tr
  }
  // Minimum u for which the ball can get back up to h.
  const uMin = Math.sqrt(Math.max(0, (2 * G * h) / (cor * cor) - 2 * G * h)) + 1e-6
  const u = bisect((x) => {
    const tt = total(x)
    return Number.isFinite(tt) ? tt - periodS : 1
  }, uMin, 30, 1e-9)
  const w = Math.sqrt(u * u + 2 * G * h)
  const tf = (w - u) / G
  return { tPushS, tFloorS: tPushS + tf, tCatchS: tPushS + periodS, hand, vPushZ: -u, vReboundZ: cor * w }
}

export function dribblePosition(d: DribbleBounce, t: number): Vec3 {
  if (t <= d.tFloorS) {
    const dt = t - d.tPushS
    return [d.hand[0], d.hand[1], d.hand[2] + d.vPushZ * dt - 0.5 * G * dt * dt]
  }
  const dt = t - d.tFloorS
  return [d.hand[0], d.hand[1], BALL.radiusM + d.vReboundZ * dt - 0.5 * G * dt * dt]
}

export const kmh = (ms: number): number => ms * 3.6
export const speedOf = (v: Vec3): number => len(v)
export const unitOf = (v: Vec3): Vec3 => norm(v)
