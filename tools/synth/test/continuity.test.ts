import { describe, expect, it } from 'vitest'
import { buildClip, type ClipMotion } from '../src/kinematics/motion.ts'
import { LR_SWAP, mirrorPoint } from '../src/kinematics/skeleton.ts'
import { PROFILES, sampleServeParams, type ServeParams } from '../src/params.ts'
import { mulberry32 } from '../src/math/random.ts'
import { BALL } from '../src/ball.ts'
import { dist } from '../src/math/vec.ts'

function serves(seed: number, n: number, sides: ('deuce' | 'ad')[]): ServeParams[] {
  const rng = mulberry32(seed)
  return Array.from({ length: n }, (_, k) =>
    sampleServeParams(rng, PROFILES.intermediate, { direction: (['T', 'wide', 'body'] as const)[k % 3], courtSide: sides[k % sides.length] }),
  )
}

/** Largest single-step landmark displacement (m) sampling the clip every dtS. */
function maxStep(clip: ClipMotion, dtS: number): { step: number; t: number; lm: number; nonFinite: number } {
  let prev = clip.pose(0).lm
  let worst = { step: 0, t: 0, lm: -1, nonFinite: 0 }
  for (let t = dtS; t <= clip.durationS; t += dtS) {
    const lm = clip.pose(t).lm
    for (let i = 0; i < 33; i++) {
      if (!lm[i].every(Number.isFinite)) worst.nonFinite++
      const d = dist(lm[i], prev[i])
      if (d > worst.step) worst = { ...worst, step: d, t, lm: i }
    }
    prev = lm
  }
  return worst
}

describe('landmark continuity', () => {
  const dt = 1 / 480
  // Fastest real body point is the racket hand near contact (< ~25 m/s); anything faster is a jump.
  const maxSpeedMs = 30

  it('a multi-serve clip (walking, dribbles, both court sides) has no jumps', () => {
    const clip = buildClip({ heightM: 1.8, handedness: 'right', serves: serves(11, 3, ['deuce', 'ad']), dribbles: [2, 0, 3], idleS: [0.5, 1.2] })
    const w = maxStep(clip, dt)
    expect(w.nonFinite).toBe(0)
    expect(w.step / dt).toBeLessThan(maxSpeedMs)
  })

  it('a left-handed clip has no jumps', () => {
    const clip = buildClip({ heightM: 1.95, handedness: 'left', serves: serves(12, 2, ['deuce', 'ad']), dribbles: [1, 2] })
    const w = maxStep(clip, dt)
    expect(w.nonFinite).toBe(0)
    expect(w.step / dt).toBeLessThan(maxSpeedMs)
  })

  it('feet stay planted: the front toe does not slide during the loading phase', () => {
    const clip = buildClip({ heightM: 1.8, handedness: 'right', serves: serves(13, 1, ['deuce']) })
    const T = clip.plans[0].times
    const toe0 = clip.pose(T.motionStartS).lm[31]
    for (let t = T.motionStartS; t < T.takeoffS - 0.01; t += 0.01) expect(dist(clip.pose(t).lm[31], toe0)).toBeLessThan(1e-3)
  })
})

describe('ball continuity across state changes', () => {
  const clip = buildClip({ heightM: 1.8, handedness: 'right', serves: serves(21, 2, ['deuce', 'ad']), dribbles: [2, 1] })
  const ballAt = (t: number, id: number) => clip.ballsAt(t).find((b) => b.id === id)!

  it('leaves the hand at release, meets the strings at contact and touches the court at the bounce', () => {
    for (const plan of clip.plans) {
      const T = plan.times
      const eps = 1e-6
      expect(dist(ballAt(T.tossReleaseS - eps, plan.index).p, ballAt(T.tossReleaseS + eps, plan.index).p)).toBeLessThan(1e-4)
      expect(ballAt(T.tossReleaseS - eps, plan.index).state).toBe('in-hand')
      expect(ballAt(T.tossReleaseS + eps, plan.index).state).toBe('toss')
      expect(dist(ballAt(T.contactS - eps, plan.index).p, ballAt(T.contactS + eps, plan.index).p)).toBeLessThan(1e-3)
      // The string-bed centre sits one ball radius (+5 mm) behind the ball centre at contact.
      const pose = clip.canonicalPose(T.contactS)
      expect(dist(pose.racketStringCentre, plan.contact)).toBeCloseTo(BALL.radiusM + 0.005, 6)
      const b = ballAt(T.bounceS + eps, plan.index)
      expect(b.p[2]).toBeCloseTo(BALL.radiusM, 3)
      expect(b.state).toBe('after-bounce')
    }
  })

  it('pre-serve dribbles leave and return to the hand', () => {
    for (const plan of clip.plans) {
      for (const d of plan.dribbles) {
        const before = ballAt(d.tPushS - 1e-6, plan.index).p
        const after = ballAt(d.tPushS + 1e-6, plan.index).p
        expect(dist(before, after)).toBeLessThan(1e-3)
        const caught = ballAt(d.tCatchS - 1e-6, plan.index).p
        const inHand = ballAt(d.tCatchS + 1e-6, plan.index).p
        expect(dist(caught, inHand)).toBeLessThan(0.02)
      }
    }
  })
})

describe('left-handers are exact mirror images', () => {
  it('LH deuce equals the mirrored RH ad-court motion with left/right labels swapped', () => {
    const base = serves(31, 1, ['ad'])[0]
    const rh = buildClip({ heightM: 1.8, handedness: 'right', serves: [base] })
    const lh = buildClip({ heightM: 1.8, handedness: 'left', serves: [{ ...base, courtSide: 'deuce' }] })
    for (const t of [0.3, rh.plans[0].times.tossReleaseS, rh.plans[0].times.contactS, rh.plans[0].times.landingS]) {
      const r = rh.pose(t).lm
      const l = lh.pose(t).lm
      for (let i = 0; i < 33; i++) expect(dist(l[i], mirrorPoint(r[LR_SWAP[i]]))).toBeLessThan(1e-12)
    }
  })
})
