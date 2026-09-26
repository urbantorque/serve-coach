import { describe, expect, it } from 'vitest'
import { LM, type Landmark } from '../types.ts'
import { BALL_RADIUS_M, bodyHeightFromPose, expectedBallRadiusNorm, scaleFromBodyHeight, tossRegionFromPose } from './scale.ts'

/** Upright player of stature 0.45 frame heights, feet at y = 0.9, centred at x = 0.4 (aspect 9:16). */
function standingPose(): Landmark[] {
  const stature = 0.45
  const floor = 0.9
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.4, y: 0.5, visibility: 0.9 }))
  const at = (fractionOfStature: number) => floor - fractionOfStature * stature
  lm[LM.NOSE] = { x: 0.4, y: at(0.925), visibility: 0.99 }
  lm[LM.LEFT_HEEL] = { x: 0.38, y: at(0.01), visibility: 0.9 }
  lm[LM.RIGHT_HEEL] = { x: 0.42, y: at(0.01), visibility: 0.9 }
  lm[LM.LEFT_SHOULDER] = { x: 0.36, y: at(0.82), visibility: 0.95 }
  lm[LM.RIGHT_SHOULDER] = { x: 0.44, y: at(0.82), visibility: 0.95 }
  lm[LM.LEFT_WRIST] = { x: 0.3, y: at(0.55), visibility: 0.9 }
  lm[LM.RIGHT_WRIST] = { x: 0.5, y: at(0.5), visibility: 0.9 }
  return lm
}

describe('scale from pose', () => {
  it('recovers stature, ground and head top from nose and heels', () => {
    const body = bodyHeightFromPose(standingPose(), 9 / 16)!
    expect(body.heightNorm).toBeCloseTo(0.45, 3)
    expect(body.groundY).toBeCloseTo(0.9, 3)
    expect(body.headTopY).toBeCloseTo(0.9 - 0.45, 3)
  })

  it('falls back to ankles and refuses without feet', () => {
    const pose = standingPose()
    pose[LM.LEFT_HEEL] = { ...pose[LM.LEFT_HEEL], visibility: 0.1 }
    pose[LM.RIGHT_HEEL] = { ...pose[LM.RIGHT_HEEL], visibility: 0.1 }
    pose[LM.LEFT_ANKLE] = { x: 0.4, y: 0.9 - 0.04 * 0.45, visibility: 0.9 }
    pose[LM.RIGHT_ANKLE] = { x: 0.4, y: 0.9 - 0.04 * 0.45, visibility: 0.9 }
    expect(bodyHeightFromPose(pose, 9 / 16)!.heightNorm).toBeCloseTo(0.45, 3)
    pose[LM.LEFT_ANKLE] = { ...pose[LM.LEFT_ANKLE], visibility: 0.1 }
    pose[LM.RIGHT_ANKLE] = { ...pose[LM.RIGHT_ANKLE], visibility: 0.1 }
    expect(bodyHeightFromPose(pose, 9 / 16)).toBeNull()
  })

  it('scale uses entered height when given, the population default otherwise', () => {
    const entered = scaleFromBodyHeight(0.45, 0.03, 1.8)
    expect(entered.unitsPerM).toBeCloseTo(0.25)
    const assumed = scaleFromBodyHeight(0.45, 0.03, null)
    expect(assumed.relSigma).toBeGreaterThan(entered.relSigma)
    expect(expectedBallRadiusNorm(entered)).toBeCloseTo(0.25 * BALL_RADIUS_M)
  })

  it('toss region is a band above the tossing (non-dominant) hand', () => {
    const roi = tossRegionFromPose(standingPose(), 'right', 9 / 16, 0.45)!
    expect(roi.y0).toBe(0)
    // Left wrist at x = 0.30 tosses for a right-hander; the band includes both shoulders.
    expect(roi.x0).toBeLessThan(0.3)
    expect(roi.x1).toBeGreaterThan(0.44)
    expect(roi.y1).toBeGreaterThan(0.9 - 0.55 * 0.45)
    expect(roi.y1).toBeLessThan(1)
  })
})
