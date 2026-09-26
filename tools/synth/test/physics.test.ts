import { describe, expect, it } from 'vitest'
import {
  ballAcceleration,
  ballistic,
  BALL,
  defaultAero,
  dribblePosition,
  G,
  launchVelocity,
  NO_AERO,
  planDribble,
  simulateServeFlight,
  solveLaunch,
  tossVelocity,
} from '../src/ball.ts'
import { apexForReleaseToContact, tossTimes } from '../src/params.ts'
import { len, type Vec3 } from '../src/math/vec.ts'

/** Analytic first-touch time for gravity only: z0 + vz t - g t^2 / 2 = r. */
function analyticTouch(z0: number, vz: number): number {
  return (vz + Math.sqrt(vz * vz + 2 * G * (z0 - BALL.radiusM))) / G
}

describe('serve flight without drag matches the analytic parabola', () => {
  const cases: { contact: Vec3; speed: number; el: number; az: number }[] = [
    { contact: [0.3, -0.4, 2.7], speed: 45, el: -4, az: 2 },
    { contact: [0.1, 0.8, 2.4], speed: 30, el: 2, az: -6 },
    { contact: [0.5, -0.2, 3.0], speed: 55, el: -7, az: 10 },
    { contact: [0.0, 0.0, 2.0], speed: 12, el: 25, az: 0 },
  ]
  for (const c of cases) {
    it(`${c.speed} m/s at ${c.el} deg: flight time, bounce point and speeds`, () => {
      const v0 = launchVelocity(c.speed, c.el, c.az)
      const f = simulateServeFlight(1.5, c.contact, v0, { aero: NO_AERO })
      const tf = analyticTouch(c.contact[2], v0[2])
      expect(f.flightTimeS).toBeCloseTo(tf, 9)
      expect(f.tBounceS).toBeCloseTo(1.5 + tf, 9)
      expect(f.bounce[0]).toBeCloseTo(c.contact[0] + v0[0] * tf, 7)
      expect(f.bounce[1]).toBeCloseTo(c.contact[1] + v0[1] * tf, 7)
      // Speed at touch from energy conservation; drag-free speed is highest at the end for a downward flight.
      const vTouch = Math.sqrt(c.speed * c.speed + 2 * G * (c.contact[2] - BALL.radiusM))
      expect(len(f.vBeforeBounce)).toBeCloseTo(vTouch, 6)
      expect(f.peakSpeedMs).toBeCloseTo(Math.max(c.speed, vTouch), 6)
      // Positions between integration steps follow the parabola.
      for (const u of [0.13, 0.5, 0.91]) {
        const t = 1.5 + u * tf
        const p = f.flight.stateAt(t).p
        const q = ballistic(c.contact, v0, t - 1.5)
        expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeLessThan(1e-7)
      }
    })
  }
})

describe('aerodynamics', () => {
  it('drag deceleration equals 0.5 rho Cd A v^2 / m along -v', () => {
    const v: Vec3 = [40, 0, 0]
    const a = ballAcceleration(v, defaultAero(0))
    const expected = (0.5 * BALL.airDensityKgM3 * BALL.dragCoefficient * Math.PI * BALL.radiusM ** 2 * 40 * 40) / BALL.massKg
    expect(-a[0]).toBeCloseTo(expected, 9)
    expect(a[2]).toBeCloseTo(-G, 12)
  })

  it('a drag serve is slower and lands shorter than the same launch without drag', () => {
    const v0 = launchVelocity(45, -3, 0)
    const withDrag = simulateServeFlight(0, [0, 0, 2.7], v0, { aero: defaultAero(0) })
    const noDrag = simulateServeFlight(0, [0, 0, 2.7], v0, { aero: NO_AERO })
    expect(withDrag.bounce[0]).toBeLessThan(noDrag.bounce[0])
    expect(withDrag.avgSpeedChordMs).toBeLessThan(noDrag.avgSpeedChordMs)
    expect(withDrag.peakSpeedMs).toBeCloseTo(45, 6)
  })

  it('topspin (Magnus) makes the ball dip: it lands shorter than with no spin', () => {
    const v0 = launchVelocity(38, 2, 0)
    const flat = simulateServeFlight(0, [0, 0, 2.7], v0, { aero: defaultAero(0) })
    const top = simulateServeFlight(0, [0, 0, 2.7], v0, { aero: defaultAero(3000, [0, 1, 0]) })
    expect(top.bounce[0]).toBeLessThan(flat.bounce[0])
  })

  it('solveLaunch puts the first bounce on the target', () => {
    const target: Vec3 = [17.5, 1.2, 0]
    const sol = solveLaunch(2, [0.3, -0.4, 2.7], 150 / 3.6, target, { aero: defaultAero(900, [0, 1, 0.15]) })
    expect(Math.hypot(sol.result.bounce[0] - target[0], sol.result.bounce[1] - target[1])).toBeLessThan(0.01)
  })
})

describe('toss', () => {
  it('tossVelocity reaches the apex exactly at tUp', () => {
    const release: Vec3 = [0.1, -0.3, 1.7]
    const apex: Vec3 = [0.4, -0.45, 3.3]
    const { v0, tUpS } = tossVelocity(release, apex)
    const p = ballistic(release, v0, tUpS)
    expect(Math.hypot(p[0] - apex[0], p[1] - apex[1], p[2] - apex[2])).toBeLessThan(1e-12)
    expect(v0[2] - G * tUpS).toBeCloseTo(0, 12)
  })

  it('release-to-contact time inverts correctly', () => {
    const tt = tossTimes(1.7, 3.3, 2.7)
    expect(apexForReleaseToContact(1.7, 2.7, tt.releaseToContactS)).toBeCloseTo(3.3, 8)
    expect(tt.tUpS).toBeCloseTo(Math.sqrt((2 * 1.6) / G), 12)
  })
})

describe('pre-serve dribble', () => {
  it('leaves and returns to the hand at the planned times and touches the floor once', () => {
    const hand: Vec3 = [0.2, -0.3, 0.95]
    const d = planDribble(hand, 1, 0.55)
    const atPush = dribblePosition(d, d.tPushS)
    const atCatch = dribblePosition(d, d.tCatchS)
    expect(atPush[2]).toBeCloseTo(hand[2], 9)
    expect(atCatch[2]).toBeCloseTo(hand[2], 6)
    expect(dribblePosition(d, d.tFloorS)[2]).toBeCloseTo(BALL.radiusM, 9)
    expect(d.tFloorS).toBeGreaterThan(d.tPushS)
    expect(d.tFloorS).toBeLessThan(d.tCatchS)
  })
})

describe('release-to-contact override', () => {
  it('solves the apex so the toss takes the requested time', async () => {
    const { buildClip } = await import('../src/kinematics/motion.ts')
    const { PROFILES, sampleServeParams } = await import('../src/params.ts')
    const { mulberry32 } = await import('../src/math/random.ts')
    const p = sampleServeParams(mulberry32(5), PROFILES.intermediate, { direction: 'T', courtSide: 'deuce', overrides: { releaseToContactS: 1.1 } })
    const clip = buildClip({ heightM: 1.8, handedness: 'right', serves: [p] })
    const T = clip.plans[0].times
    expect(T.contactS - T.tossReleaseS).toBeCloseTo(1.1, 6)
  })
})
