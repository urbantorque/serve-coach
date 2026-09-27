import { describe, expect, it } from 'vitest'
import { LM, type Landmark, type PoseFrame } from '../../../../analysis/types.ts'
import { cameraPrecheck, classifyCameraError, pickBackCamera, pickRecorderType, videoConstraints } from './camera.ts'
import { readPoseFrame, snapshotFromReadings, standingAtSpot, type PoseReading } from './poseSnapshot.ts'
import { classifyLight, lumaOf, meanLuma, medianAbsDiff, SteadyTracker } from './sceneStats.ts'

/** A right-hander standing side-on, net to the image right, in a 9:16 frame. */
function standingFrame(t: number, shiftY = 0): PoseFrame {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
  const set = (i: LM, x: number, y: number) => (lm[i] = { x, y: y + shiftY, visibility: 0.95 })
  set(LM.NOSE, 0.52, 0.47)
  set(LM.LEFT_EYE, 0.515, 0.463)
  set(LM.RIGHT_EYE, 0.515, 0.463)
  set(LM.LEFT_EAR, 0.5, 0.468)
  set(LM.RIGHT_EAR, 0.5, 0.468)
  set(LM.LEFT_SHOULDER, 0.49, 0.51)
  set(LM.RIGHT_SHOULDER, 0.51, 0.51)
  set(LM.LEFT_ELBOW, 0.49, 0.56)
  set(LM.RIGHT_ELBOW, 0.51, 0.56)
  set(LM.LEFT_WRIST, 0.49, 0.6)
  set(LM.RIGHT_WRIST, 0.51, 0.6)
  set(LM.LEFT_HIP, 0.495, 0.62)
  set(LM.RIGHT_HIP, 0.505, 0.62)
  set(LM.LEFT_KNEE, 0.495, 0.7)
  set(LM.RIGHT_KNEE, 0.505, 0.7)
  set(LM.LEFT_ANKLE, 0.495, 0.77)
  set(LM.RIGHT_ANKLE, 0.505, 0.77)
  set(LM.LEFT_HEEL, 0.49, 0.78)
  set(LM.RIGHT_HEEL, 0.5, 0.78)
  set(LM.LEFT_FOOT_INDEX, 0.51, 0.78)
  set(LM.RIGHT_FOOT_INDEX, 0.52, 0.78)
  return { frameIndex: Math.round(t * 5), tReal: t, landmarks: lm, score: 0.9, source: 'mediapipe' }
}

describe('light pose pass readings (CAPTURE §9.4)', () => {
  it('reads head, floor, front toe, in frame and upright from one frame', () => {
    const r = readPoseFrame(standingFrame(0), 0.5625, 'right')!
    expect(r.headTopY).toBeLessThan(0.47)
    expect(r.floorY).toBeCloseTo(0.78, 3)
    expect(r.frontToeX).toBeCloseTo(0.51, 3)
    expect(r.inFrame).toBe(true)
    expect(r.upright).toBe(true)
  })
  it('returns null without a usable pose', () => {
    expect(readPoseFrame({ frameIndex: 0, tReal: 0, landmarks: null, score: 0, source: 'mediapipe' }, 0.5625, 'right')).toBeNull()
  })
  it('needs about 2 s of upright readings for a snapshot, and a still player for the spot state', () => {
    const readings = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((t) => readPoseFrame(standingFrame(t), 0.5625, 'right')!)
    expect(snapshotFromReadings(readings.slice(0, 3), 0.4)).toBeNull()
    const snap = snapshotFromReadings(readings, 1.2)!
    expect(snap.inFrame).toBe(true)
    expect(snap.floorY).toBeCloseTo(0.78, 3)
    expect(standingAtSpot(readings, 1.2)).toBe(true)
    const moving: PoseReading[] = readings.map((r, i) => ({ ...r, floorY: r.floorY + (i % 2 ? 0.05 : 0) }))
    expect(standingAtSpot(moving, 1.2)).toBe(false)
  })
})

describe('steady and light (CAPTURE §9.6)', () => {
  const grid = (v: number) => new Uint8Array(48 * 48).fill(v)
  it('computes luma and median differences', () => {
    expect(Array.from(lumaOf(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])))).toEqual([255, 0])
    expect(medianAbsDiff(grid(10), grid(14))).toBe(4)
    expect(meanLuma(grid(100), 48, 48, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 })).toBe(100)
  })
  it('turns steady after 2 s without movement, and not while the picture moves', () => {
    const s = new SteadyTracker()
    expect(s.push(grid(50), 0)).toBeNull()
    expect(s.push(grid(50), 1)).toBeNull()
    expect(s.push(grid(50), 3.1)).toBe(true)
    expect(s.push(grid(90), 3.3)).toBe(false)
  })
  it('classifies dark and backlit scenes', () => {
    expect(classifyLight(20, 30, 60)).toBe('dark')
    expect(classifyLight(60, 120, 200)).toBe('backlit')
    expect(classifyLight(120, 120, 140)).toBe('good')
    expect(classifyLight(null, null, null)).toBeNull()
  })
})

describe('camera set-up (CAPTURE §9.2)', () => {
  it('maps getUserMedia failures to plain states', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('busy')
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('not-found')
    expect(classifyCameraError(new Error('x'))).toBe('unknown')
    expect(cameraPrecheck({ isSecureContext: false, hasGetUserMedia: true })).toBe('insecure')
    expect(cameraPrecheck({ isSecureContext: true, hasGetUserMedia: false })).toBe('unsupported')
    expect(cameraPrecheck({ isSecureContext: true, hasGetUserMedia: true })).toBeNull()
  })
  it('prefers the plain back camera over virtual multi-lens devices', () => {
    const devices = [
      { kind: 'videoinput' as const, label: 'Back Triple Camera', deviceId: 'triple' },
      { kind: 'videoinput' as const, label: 'Back Camera', deviceId: 'wide' },
      { kind: 'videoinput' as const, label: 'Front Camera', deviceId: 'front' },
    ]
    expect(pickBackCamera(devices)).toBe('wide')
    expect(pickBackCamera([{ kind: 'videoinput', label: '', deviceId: 'x' }])).toBeUndefined()
  })
  it('records MP4 first, WebM second, and asks for video only', () => {
    expect(pickRecorderType((t) => t === 'video/webm')).toBe('video/webm')
    expect(pickRecorderType((t) => t.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1.640028')
    expect(videoConstraints(60)).toMatchObject({ facingMode: { ideal: 'environment' }, frameRate: { ideal: 60, min: 24 } })
  })
})
