import { describe, expect, it } from 'vitest'
import { LM, type BallObservation, type PoseFrame } from '../types.ts'
import { buildServeFixture } from '../pose/servePoseFixture.ts'
import { MIRROR_INDEX } from '../pose/landmarks.ts'
import { cameraModel, focalLongFromFov, levelRotation, rectifyPoint, setupClassOf, unrectifyPoint, cameraDistanceM } from './geometry.ts'
import { buildTrack, indexAt, localQuadratic, pt } from './track.ts'
import { fuseEvent, detectTrophy, measureNoise, heightOf } from './events.ts'
import { relabelSides } from './relabel.ts'
import { findServeWindows } from './windows.ts'
import { ballBracketContact, ballIntersectionContact, followLeadIn, type ServeBall } from './ball.ts'

const meta = { width: 1080, height: 1920 }

describe('geometry and rectification (§1.1)', () => {
  it('uses the long-side FOV mapped to the displayed orientation', () => {
    expect(focalLongFromFov(67.3)).toBeCloseTo(0.751, 3)
    const portrait = cameraModel(meta)
    expect(portrait.fHU).toBeCloseTo(0.751, 3)
    const landscape = cameraModel({ width: 1920, height: 1080 })
    expect(landscape.fHU).toBeCloseTo(0.751 * (16 / 9), 3)
    expect(portrait.tiltStatus).toBe('unknown')
    expect(portrait.rectified).toBe(false)
  })

  it('levels a camera pitched up: the optical axis maps above the horizon', () => {
    const cam = cameraModel(meta, {
      source: 'in-app-native', declaredView: 'side', serveSide: 'deuce', serveNumber: 1, handedness: 'right', playerHeightM: 1.8,
      playerHeightSource: 'entered', hitSoundTiming: false, orientationSamples: [{ tMs: 0, pitchDeg: 4, rollDeg: 0 }],
    })
    expect(cam.rectified).toBe(true)
    expect(cam.tiltStatus).toBe('measured-corrected')
    const c = rectifyPoint(cam, 0.5, 0.5)
    expect(c.y).toBeLessThan(0.5)
    expect(0.5 - c.y).toBeCloseTo(cam.fHU * Math.tan((4 * Math.PI) / 180), 4)
    const back = unrectifyPoint(cam, c.x, c.y)
    expect(back.x).toBeCloseTo(0.5, 9)
    expect(back.y).toBeCloseTo(0.5, 9)
  })

  it('refuses tilt above the cap and treats a missing sensor as unknown pitch', () => {
    const over = cameraModel(meta, { source: 'in-app-web', declaredView: 'side', serveSide: 'deuce', serveNumber: 1, handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', hitSoundTiming: false, orientationSamples: [{ tMs: 0, pitchDeg: 9, rollDeg: 0 }] })
    expect(over.tiltStatus).toBe('measured-over-cap')
    expect(over.rectified).toBe(false)
    const rear = cameraModel(meta, { source: 'in-app-web', declaredView: 'rear', serveSide: 'deuce', serveNumber: 1, handedness: 'right', playerHeightM: 1.8, playerHeightSource: 'entered', hitSoundTiming: false, orientationSamples: [{ tMs: 0, pitchDeg: -15, rollDeg: 0 }] }, { view: 'rear' })
    expect(rear.rectified).toBe(true)
  })

  it('rotation is orthonormal and roll levels a tilted vertical', () => {
    const R = levelRotation(0.1, 0.05)
    const dot = (i: number, j: number) => R[i * 3] * R[j * 3] + R[i * 3 + 1] * R[j * 3 + 1] + R[i * 3 + 2] * R[j * 3 + 2]
    expect(dot(0, 0)).toBeCloseTo(1, 12)
    expect(dot(0, 1)).toBeCloseTo(0, 12)
    const cam = cameraModel(meta, undefined, { pitchDeg: { value: 0, sigma: 1 }, rollDeg: { value: 3, sigma: 1 } })
    // A vertical line that appears rotated anticlockwise by 3° is vertical after rectification.
    const a = 0.3
    const tilt = (3 * Math.PI) / 180
    const p1 = { x: 0.5 - (a * Math.sin(tilt)) / cam.aspect, y: 0.5 - a * Math.cos(tilt) }
    const p2 = { x: 0.5 + (a * Math.sin(tilt)) / cam.aspect, y: 0.5 + a * Math.cos(tilt) }
    const r1 = rectifyPoint(cam, p1.x, p1.y)
    const r2 = rectifyPoint(cam, p2.x, p2.y)
    expect(Math.abs((r1.x - r2.x) * cam.aspect)).toBeLessThan(0.005)
  })

  it('classifies the D1 set-ups and camera distance', () => {
    const portrait = cameraModel(meta)
    expect(setupClassOf('side', portrait, 7)).toBe('portrait-near')
    const land = cameraModel({ width: 1920, height: 1080 })
    expect(setupClassOf('side', land, 9)).toBe('landscape-fence')
    expect(setupClassOf('side', land, 6)).toBe('landscape-near')
    expect(setupClassOf('rear', land, 6)).toBe('rear')
    expect(cameraDistanceM(portrait, 1.8, 0.2)).toBeCloseTo((0.751 * 1.8) / 0.2, 2)
  })
})

describe('pose track helpers', () => {
  const fx = buildServeFixture({ heightHU: 0.3, floorY: 0.85 })
  const track = buildTrack(fx.frames, cameraModel(meta))
  it('fits a local quadratic to a known parabola', () => {
    const f = localQuadratic(track, (i) => 2 * track.t[i] ** 2 - track.t[i], 1.0, 0.1)!
    expect(f.value).toBeCloseTo(1, 6)
    expect(f.slope).toBeCloseTo(3, 6)
    expect(f.curvature).toBeCloseTo(4, 5)
  })
  it('finds frames by time', () => {
    expect(track.t[indexAt(track, 1.0)]).toBeCloseTo(1.0, 1)
  })
})

describe('generic event fusion (§2.4)', () => {
  it('weights by q/σ², gates outliers at 3σ and reports confidence', () => {
    const f = fuseEvent(
      [
        { method: 'ball-intersection', t: 2.0, sigma: 0.002, q: 0.9 },
        { method: 'ball-bracket', t: 2.004, sigma: 0.006, q: 0.7 },
        { method: 'wrist-apex', t: 2.4, sigma: 0.047, q: 0.5 },
      ],
      null,
    )!
    expect(f.method).toBe('fused')
    expect(f.dropped.map((m) => m.method)).toEqual(['wrist-apex'])
    expect(f.tReal).toBeGreaterThan(2.0)
    expect(f.tReal).toBeLessThan(2.001)
    expect(f.confidence).toBeCloseTo(1 - 0.1 * 0.3, 6)
    const single = fuseEvent([{ method: 'wrist-apex', t: 1, sigma: 0.05, q: 0.5 }], null)!
    expect(single.confidence).toBeCloseTo(0.4, 9)
  })
})

describe('left/right relabelling (mirror fix)', () => {
  it('undoes a persistent whole-body mirror before release using the tossing arm and front foot', () => {
    const fx = buildServeFixture({ heightHU: 0.3, floorY: 0.85, contactT: 2 })
    const cam = cameraModel(meta)
    const clean = buildTrack(fx.frames, cam)
    const mirrored: PoseFrame[] = fx.frames.map((f) => (f.tReal < 1.3 && f.landmarks ? { ...f, landmarks: MIRROR_INDEX.map((j) => f.landmarks![j]) } : f))
    const track = buildTrack(mirrored, cam)
    const report = relabelSides(track, {
      handedness: 'right',
      netDir: 1,
      view: 'side',
      bodyHeightHU: 0.3,
      toss: { tStart: 1.05, tEnd: 1.55 },
      contactT: 2,
      stance: { tStart: 0.2, tEnd: 1.4 },
      from: 0,
      to: track.t.length - 1,
    })
    expect(report.upperEvidenceFrames).toBeGreaterThan(0)
    // After relabelling, the left wrist matches the clean left wrist at release time.
    const i = indexAt(track, 1.4)
    const a = pt(track, i, LM.LEFT_WRIST, 0)!
    const b = pt(clean, i, LM.LEFT_WRIST, 0)!
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9)
  })
})

describe('serve windows (§2.3)', () => {
  it('finds one window around the wrist apex of a fixture serve and none in a still clip', () => {
    const fx = buildServeFixture({ heightHU: 0.3, floorY: 0.85, contactT: 2.4, durationS: 4.5, fps: 30 })
    const w = findServeWindows(fx.frames, { ...meta, durationMediaS: 4.5, timeScale: 1 }, 'right')
    expect(w).toHaveLength(1)
    expect(w[0].anchorReal).toBeGreaterThan(2.0)
    expect(w[0].anchorReal).toBeLessThan(2.8)
    expect(w[0].startReal).toBeLessThan(w[0].anchorReal - 2)
    const still = fx.frames.map((f) => ({ ...f, landmarks: fx.frames[0].landmarks }))
    expect(findServeWindows(still, { ...meta, durationMediaS: 4.5, timeScale: 1 }, 'right')).toHaveLength(0)
  })
})

describe('trophy (§2.4.4) and noise', () => {
  it('finds the lowest mid-hip and accepts it against the measured noise', () => {
    const fx = buildServeFixture({ heightHU: 0.3, floorY: 0.85, contactT: 2 })
    const track = buildTrack(fx.frames, cameraModel(meta))
    const ref = { yFloor: 0.85, bodyHeightHU: 0.3 }
    const noise = measureNoise(track, ref, 0.1, 0.9)
    expect(noise.hipSd).toBeLessThan(0.01)
    const tr = detectTrophy(track, ref, 1.3, 2.0, 'left', noise)!
    expect(tr).not.toBeNull()
    // The fixture knee bend peaks at contact − 0.25 s.
    expect(Math.abs(tr.lowT - 1.75)).toBeLessThan(0.12)
    expect(heightOf(ref, 0.85 - 0.3)).toBeCloseTo(1, 9)
  })
})

describe('ball contact methods (§2.4.5)', () => {
  const a = 1.6
  const tA = 1.5
  const yA = 0.3
  const parab = (t: number) => yA + a * (t - tA) ** 2
  const obs = (t: number, x: number, y: number, fi: number): BallObservation => ({ frameIndex: fi, tReal: t, x, y, radius: 0.005, score: 0.9, source: 'detected' })
  const ball: ServeBall = {
    toss: null,
    tossTrack: null,
    outgoing: { id: 2, kind: 'outgoing', observations: [obs(1.8 + 1 / 60, 0.7, parab(1.8) + 0.002, 109), obs(1.8 + 2 / 60, 0.9, parab(1.8) + 0.004, 110), obs(1.8 + 3 / 60, 1.1, parab(1.8) + 0.006, 111)] },
    parabola: { a, b: -2 * a * tA, c: yA + a * tA * tA, xa: 0, xb: 0, xc: 0.5 },
    apexCase: 'bracketed',
    lastOnT: 1.8 - 1 / 120,
    firstOff: { t: 1.8 + 1 / 60, kind: 'outgoing' },
    radius: 0.005,
    detections: 30,
  }
  it('intersects the outgoing line with the toss parabola', () => {
    const c = ballIntersectionContact(ball, 0.5625)!
    expect(c.method).toBe('ball-intersection')
    expect(Math.abs(c.t - 1.8)).toBeLessThan(0.004)
  })
  it('brackets contact in the gap with σ = gap·√(1/12 + 1/16)', () => {
    const c = ballBracketContact(ball, 1 / 60)!
    const gap = 1 / 60 + 1 / 120
    expect(c.sigma).toBeCloseTo(gap * Math.sqrt(1 / 12 + 1 / 16), 9)
    expect(c.q).toBeLessThanOrEqual(0.7)
  })
  it('follows the ball back into the hand', () => {
    const track = { id: 1, kind: 'toss' as const, observations: [obs(1.0, 0.5, 0.5, 60), obs(1.0 + 1 / 60, 0.5, 0.48, 61), obs(1.0 + 2 / 60, 0.5, 0.46, 62)] }
    const lead = followLeadIn(track, [obs(1.0 - 1 / 60, 0.5, 0.52, 59), obs(1.0 - 2 / 60, 0.5, 0.54, 58), obs(1.0 - 1 / 60, 0.9, 0.1, 59)])
    expect(lead.map((o) => o.frameIndex)).toEqual([58, 59])
  })
})
