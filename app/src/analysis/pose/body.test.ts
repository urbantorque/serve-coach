import { describe, expect, it } from 'vitest'
import { LM, type Landmark, type PoseFrame } from '../types.ts'
import {
  bodyHeightInFrameHU,
  elbowFlexionDeg,
  estimateFacingSide,
  estimateStandingBodyHeight,
  frontFootToe,
  inferHandedness,
  interiorAngleDeg,
  kneeFlexionDeg,
  metresPerHeightUnit,
  metresPerPixel,
  segmentElevationDeg,
  trackingQuality,
  trunkInclinationDeg,
} from './body.ts'
import { applyPoseNoise } from './injected.ts'
import { buildServeFixture, fixtureKneeFlexionRad } from './servePoseFixture.ts'

const RAD = 180 / Math.PI

function frameAt(frames: readonly PoseFrame[], tReal: number): PoseFrame {
  return frames.reduce((best, f) => (Math.abs(f.tReal - tReal) < Math.abs(best.tReal - tReal) ? f : best))
}

describe('interiorAngleDeg', () => {
  it('measures right, straight and folded angles in isotropic units', () => {
    expect(interiorAngleDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toBeCloseTo(90, 9)
    expect(interiorAngleDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 0, y: -1 }, 1)).toBeCloseTo(180, 9)
    expect(interiorAngleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toBeCloseTo(0, 6)
  })

  it('corrects for the frame aspect ratio', () => {
    // In a 9:16 portrait frame, 0.1 normalised x is 0.05625 frame heights. A segment
    // going +0.1 x and -0.05625 y is a true 45 degree diagonal.
    const aspect = 9 / 16
    const angle = interiorAngleDeg({ x: 0.6, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 - 0.05625 }, aspect)
    expect(angle).toBeCloseTo(45, 6)
    expect(segmentElevationDeg({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 - 0.05625 }, aspect)).toBeCloseTo(45, 6)
  })

  it('returns null for a zero-length segment', () => {
    expect(interiorAngleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, 1)).toBeNull()
  })
})

describe('joint angles on the kinematic fixture', () => {
  const side = buildServeFixture({ view: 'side', fps: 60 })

  it('recovers knee flexion exactly in a side view', () => {
    for (const t of [0.5, 1.75, 1.95, 2.3]) {
      const frame = frameAt(side.frames, t)
      const truthDeg = fixtureKneeFlexionRad(frame.tReal, side.contactT) * RAD
      expect(kneeFlexionDeg(frame.landmarks!, 'left', side.frameAspect)).toBeCloseTo(truthDeg, 6)
      expect(kneeFlexionDeg(frame.landmarks!, 'right', side.frameAspect)).toBeCloseTo(truthDeg, 6)
    }
  })

  it('underestimates knee flexion from behind (2D projection caveat)', () => {
    const rear = buildServeFixture({ view: 'rear', fps: 60 })
    const trophy = frameAt(rear.frames, 1.75)
    const truthDeg = fixtureKneeFlexionRad(trophy.tReal, rear.contactT) * RAD
    const seenDeg = kneeFlexionDeg(trophy.landmarks!, 'left', rear.frameAspect)!
    expect(truthDeg).toBeGreaterThan(40)
    expect(seenDeg).toBeLessThan(1)
  })

  it('shows a straight hitting arm at contact and a bent one at trophy', () => {
    const contact = frameAt(side.frames, side.contactT)
    expect(elbowFlexionDeg(contact.landmarks!, 'right', side.frameAspect)).toBeCloseTo(0, 3)
    const trophy = frameAt(side.frames, side.contactT - 0.25)
    expect(elbowFlexionDeg(trophy.landmarks!, 'right', side.frameAspect)).toBeCloseTo(90, 3)
  })

  it('measures trunk inclination and its sign', () => {
    const upright = frameAt(side.frames, 0.5).landmarks!
    expect(trunkInclinationDeg(upright, side.frameAspect)!.deg).toBeCloseTo(0, 6)

    // Lean the shoulders forward (+x) by 0.1 HU over a 0.1 HU-tall torso: 45 degrees.
    const leaned: Landmark[] = upright.map((lm) => ({ ...lm }))
    const hipY = (leaned[LM.LEFT_HIP].y + leaned[LM.RIGHT_HIP].y) / 2
    for (const i of [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER]) leaned[i].y = hipY - 0.1
    for (const i of [LM.LEFT_HIP, LM.RIGHT_HIP]) leaned[i].x = 0.5
    for (const i of [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER]) leaned[i].x = 0.5 + 0.1 / side.frameAspect
    const trunk = trunkInclinationDeg(leaned, side.frameAspect)!
    expect(trunk.deg).toBeCloseTo(45, 6)
    expect(trunk.signedDeg).toBeCloseTo(45, 6)
  })
})

describe('standing body height', () => {
  it('recovers the fixture height within 1.5% (side view, shoulders overlapping)', () => {
    const fx = buildServeFixture({ view: 'side', heightHU: 0.6 })
    const est = estimateStandingBodyHeight(fx.frames, { frameAspect: fx.frameAspect, frameHeightPx: 1920 })!
    expect(est.method).toBe('setup-upright-median')
    expect(Math.abs(est.heightHU - 0.6) / 0.6).toBeLessThan(0.015)
    expect(est.heightPx).toBeCloseTo(est.heightHU * 1920, 9)
    expect(est.confidence).toBeGreaterThan(0.9)
  })

  it('recovers the fixture height within 1.5% (rear view, full shoulder width)', () => {
    const fx = buildServeFixture({ view: 'rear', heightHU: 0.45, frameAspect: 16 / 9 })
    // The rear fixture hides the face (visibility 0.2), so allow it for this check.
    const est = estimateStandingBodyHeight(fx.frames, { frameAspect: fx.frameAspect, minVisibility: 0.15 })!
    expect(Math.abs(est.heightHU - 0.45) / 0.45).toBeLessThan(0.015)
  })

  it('skips crouched frames and falls back when no setup frame is upright', () => {
    const fx = buildServeFixture({ view: 'side' })
    const loading = fx.frames.filter((f) => Math.abs(f.tReal - 1.75) < 0.05)
    const est = estimateStandingBodyHeight(loading, { frameAspect: fx.frameAspect })!
    expect(est.method).toBe('fallback-p90')
    expect(est.confidence).toBeLessThan(0.5)
    expect(est.heightHU).toBeLessThan(0.6) // crouched: an underestimate, flagged by low confidence
  })

  it('stays within 2% with MediaPipe-like jitter', () => {
    const fx = buildServeFixture({ view: 'side', heightHU: 0.6 })
    const noisy = applyPoseNoise(fx.frames, { seed: 7, frameDropoutProb: 0, swapProb: 0, landmarkDropoutProb: 0 }, {
      frameAspect: fx.frameAspect,
      bodyHeightHU: 0.6,
    })
    const est = estimateStandingBodyHeight(noisy.frames, { frameAspect: fx.frameAspect })!
    expect(Math.abs(est.heightHU - 0.6) / 0.6).toBeLessThan(0.02)
  })

  it('returns null without a usable pose', () => {
    expect(estimateStandingBodyHeight([{ frameIndex: 0, tReal: 0, landmarks: null, score: 0, source: 'injected' }], { frameAspect: 1 })).toBeNull()
    const fx = buildServeFixture()
    const noFeet = fx.frames[0].landmarks!.map((lm, i) => (i >= LM.LEFT_ANKLE ? { ...lm, visibility: 0 } : lm))
    expect(bodyHeightInFrameHU(noFeet, fx.frameAspect)).toBeNull()
  })

  it('converts to metres', () => {
    expect(metresPerHeightUnit(0.6, 1.8)).toBeCloseTo(3, 12)
    expect(metresPerPixel(1152, 1.8)).toBeCloseTo(1.8 / 1152, 12)
    expect(() => metresPerHeightUnit(0, 1.8)).toThrow(RangeError)
  })
})

describe('handedness', () => {
  for (const view of ['side', 'rear'] as const) {
    for (const handedness of ['right', 'left'] as const) {
      it(`detects a ${handedness}-hander from the ${view}`, () => {
        const fx = buildServeFixture({ view, handedness })
        const est = inferHandedness(fx.frames, { frameAspect: fx.frameAspect })!
        expect(est.handedness).toBe(handedness)
        expect(est.confidence).toBeGreaterThan(0.9)
        expect(Math.abs(fx.frames[est.peakFrameIndex].tReal - fx.contactT)).toBeLessThan(0.02)
      })
    }
  }

  it('uses the contact candidate window when given', () => {
    const fx = buildServeFixture({ handedness: 'left' })
    const contactFrame = Math.round(fx.contactT * 60)
    const est = inferHandedness(fx.frames, { frameAspect: fx.frameAspect, contactFrameIndex: contactFrame })!
    expect(est.handedness).toBe('left')
    expect(est.marginBodyHeights).toBeGreaterThan(0.3)
  })

  it('survives jitter and occasional dropouts', () => {
    const fx = buildServeFixture({ handedness: 'right' })
    const noisy = applyPoseNoise(fx.frames, { seed: 3, swapProb: 0 }, { frameAspect: fx.frameAspect })
    expect(inferHandedness(noisy.frames, { frameAspect: fx.frameAspect })!.handedness).toBe('right')
  })
})

describe('camera-facing side', () => {
  it('identifies the near side in a profile view', () => {
    const right = buildServeFixture({ view: 'side', handedness: 'right' })
    const setup = right.frames.slice(0, 30)
    expect(estimateFacingSide(setup, right.frameAspect).side).toBe('right')
    const left = buildServeFixture({ view: 'side', handedness: 'left' })
    expect(estimateFacingSide(left.frames.slice(0, 30), left.frameAspect).side).toBe('left')
  })

  it('distinguishes back from front', () => {
    const rear = buildServeFixture({ view: 'rear' })
    const est = estimateFacingSide(rear.frames.slice(0, 30), rear.frameAspect)
    expect(est.side).toBe('back')
    expect(est.confidence).toBe(1)
    // Mirror horizontally and make the face visible: a front view.
    const front = rear.frames.slice(0, 30).map((f) => ({
      ...f,
      landmarks: f.landmarks!.map((lm, i) => ({ ...lm, x: 1 - lm.x, visibility: i <= LM.MOUTH_RIGHT ? 0.95 : lm.visibility })),
    }))
    expect(estimateFacingSide(front, rear.frameAspect).side).toBe('front')
  })
})

describe('feet', () => {
  it('returns the front-foot toe on the non-hitting side', () => {
    const fx = buildServeFixture({ handedness: 'right' })
    const lms = fx.frames[0].landmarks!
    expect(frontFootToe(lms, 'right')).toEqual(lms[LM.LEFT_FOOT_INDEX])
    expect(frontFootToe(lms, 'left')).toEqual(lms[LM.RIGHT_FOOT_INDEX])
  })
})

describe('trackingQuality', () => {
  const fx = buildServeFixture({ view: 'rear' })
  const frame = fx.frames[0]

  it('scores a clean frame high and an empty frame zero', () => {
    const q = trackingQuality(frame, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU })
    expect(q.score).toBeGreaterThan(0.9)
    expect(q.scaleConsistency).toBe(1)
    expect(trackingQuality({ ...frame, landmarks: null }, { frameAspect: fx.frameAspect }).score).toBe(0)
  })

  it('drops with occlusion, interpolation, leaving the frame and inconsistent size', () => {
    const base = trackingQuality(frame, { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU }).score
    const occluded = { ...frame, landmarks: frame.landmarks!.map((lm, i) => (i === LM.LEFT_KNEE || i === LM.LEFT_ANKLE ? { ...lm, visibility: 0.1 } : lm)) }
    const interpolated = { ...frame, landmarks: frame.landmarks!.map((lm) => ({ ...lm, visibility: 0, interpolated: true })) }
    const offFrame = { ...frame, landmarks: frame.landmarks!.map((lm) => ({ ...lm, y: lm.y + 0.5 })) }
    const opts = { frameAspect: fx.frameAspect, bodyHeightHU: fx.heightHU }
    expect(trackingQuality(occluded, opts).score).toBeLessThan(base)
    expect(trackingQuality(interpolated, opts).score).toBeLessThan(0.1)
    expect(trackingQuality(offFrame, opts).score).toBeLessThan(base)
    expect(trackingQuality(frame, { ...opts, bodyHeightHU: fx.heightHU * 5 }).scaleConsistency).toBeLessThan(0.5)
  })
})
