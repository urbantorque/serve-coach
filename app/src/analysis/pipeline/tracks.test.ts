import { describe, expect, it } from 'vitest'
import type { BallTrack } from '../types.ts'
import { servePoses } from './testPoses.ts'
import { compactBallTrack, compactPoseTrack, LANDMARKS, mergePoses, orientationAt, POSE_FLAG, retimePoses } from './tracks.ts'

describe('orientationAt', () => {
  it('interpolates pitch and roll, NaN when unknown', () => {
    const samples = [
      { tMs: 0, pitchDeg: 0, rollDeg: 1 },
      { tMs: 100, pitchDeg: 2, rollDeg: 3 },
    ]
    expect(orientationAt(samples, 50)).toEqual({ pitchDeg: 1, rollDeg: 2 })
    expect(orientationAt(samples, -5)).toEqual({ pitchDeg: 0, rollDeg: 1 })
    expect(orientationAt(samples, 500)).toEqual({ pitchDeg: 2, rollDeg: 3 })
    expect(Number.isNaN(orientationAt(undefined, 0).pitchDeg)).toBe(true)
  })
})

describe('compactPoseTrack', () => {
  it('packs landmarks into typed arrays with flags', () => {
    const poses = servePoses({ durationS: 0.4 })
    poses[1] = { ...poses[1], landmarks: null }
    poses[2] = { ...poses[2], landmarks: poses[2].landmarks!.map((l, k) => (k === 0 ? { ...l, interpolated: true } : l)) }
    const c = compactPoseTrack(poses, { frameAspect: 9 / 16, bodyHeightHU: 0.5, denseFrames: new Set([poses[0].frameIndex]) })
    expect(c.frameIndices.length).toBe(poses.length)
    expect(c.xyv.length).toBe(poses.length * LANDMARKS * 3)
    expect(c.xyv[0]).toBeCloseTo(poses[0].landmarks![0].x)
    expect(c.flags[0] & POSE_FLAG.dense).toBeTruthy()
    expect(c.flags[1] & POSE_FLAG.noPose).toBeTruthy()
    expect(Number.isNaN(c.xyv[LANDMARKS * 3])).toBe(true)
    expect(c.flags[2] & POSE_FLAG.interpolated).toBeTruthy()
    expect(Number.isNaN(c.pitchDeg[0])).toBe(true)
  })
})

describe('compactBallTrack', () => {
  const track = (id: number, kind: BallTrack['kind'], frames: number[]): BallTrack => ({
    id,
    kind,
    observations: frames.map((f) => ({ frameIndex: f, tReal: f / 60, x: 0.5, y: 0.2, radius: 0.005, score: 0.8, source: f % 2 ? 'predicted' : 'detected' })),
    fit: kind === 'toss' ? { a: 1, b: 2, c: 3, rmse: 0.001, tStart: 0, tEnd: 1 } : undefined,
  })

  it('keeps only observations inside the serve window and codes kind and predictions', () => {
    const c = compactBallTrack([track(1, 'toss', [10, 11, 12]), track(2, 'outgoing', [20, 21, 90])], 0, 50, 1)!
    expect(Array.from(c.frameIndices)).toEqual([10, 11, 12, 20, 21])
    expect(Array.from(c.kind)).toEqual([0, 0, 0, 1, 1])
    expect(Array.from(c.predicted)).toEqual([0, 1, 0, 0, 1])
    expect(c.tossFit).toMatchObject({ a: 1, b: 2, c: 3 })
    expect(compactBallTrack([track(1, 'toss', [100])], 0, 50)).toBeUndefined()
  })
})

describe('mergePoses and retimePoses', () => {
  it('dense wins over sparse for a frame; re-timing scales tReal', () => {
    const sparse = servePoses({ hz: 15, durationS: 1 })
    const dense = [{ ...sparse[1], score: 0.1 }]
    const merged = mergePoses(sparse, dense)
    expect(merged).toHaveLength(sparse.length)
    expect(merged[1].score).toBe(0.1)
    expect(retimePoses(sparse, 0.125)[4].tReal).toBeCloseTo(sparse[4].tReal * 0.125)
  })
})
