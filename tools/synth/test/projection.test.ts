import { describe, expect, it } from 'vitest'
import {
  extrinsicsMatrix,
  focalFromEquiv,
  FULL_FRAME_DIAGONAL_MM,
  lookAt,
  makeIntrinsics,
  makeShake,
  placeCamera,
  project,
  worldToCamera,
  type Camera,
} from '../src/camera.ts'
import { threeCameraQuat } from '../src/frames.ts'
import { cross, dist, dot, len, type Vec3 } from '../src/math/vec.ts'

const rotateByQuat = (q: [number, number, number, number], v: Vec3): Vec3 => {
  const [x, y, z, w] = q
  const u: Vec3 = [x, y, z]
  const uv = cross(u, v)
  const uuv = cross(u, uv)
  return [v[0] + 2 * (w * uv[0] + uuv[0]), v[1] + 2 * (w * uv[1] + uuv[1]), v[2] + 2 * (w * uv[2] + uuv[2])]
}

describe('35 mm-equivalent focal length', () => {
  it('matches the full-frame diagonal field of view on the 4:3 sensor', () => {
    const f = focalFromEquiv(26, 1080, 1920)
    // 16:9 video uses the full sensor width, so the 4:3 diagonal is 1.25 x the long side.
    const fov43 = 2 * Math.atan((1920 * 1.25) / 2 / f)
    const fov35 = 2 * Math.atan(FULL_FRAME_DIAGONAL_MM / 2 / 26)
    expect(fov43).toBeCloseTo(fov35, 12)
    expect(f).toBeCloseTo(1442.2, 1)
  })

  it('is the same for portrait and landscape of the same sensor', () => {
    expect(focalFromEquiv(26, 1080, 1920)).toBe(focalFromEquiv(26, 1920, 1080))
  })
})

describe('pinhole projection', () => {
  const I = makeIntrinsics(1080, 1920, 26)
  const e = lookAt([0, -5, 1.2], [0, 0, 1.6])
  const cam: Camera = { intrinsics: I, extrinsics: e }

  it('builds an orthonormal right-handed camera frame (x right, y down, z forward)', () => {
    for (const a of [e.right, e.down, e.forward]) expect(len(a)).toBeCloseTo(1, 12)
    expect(dot(e.right, e.down)).toBeCloseTo(0, 12)
    expect(dot(e.right, e.forward)).toBeCloseTo(0, 12)
    expect(dist(cross(e.right, e.down), e.forward)).toBeLessThan(1e-12)
    // Image "down" points toward world -z for a level camera.
    expect(e.down[2]).toBeLessThan(0)
  })

  it('projects the look-at target to the principal point', () => {
    const p = project(cam, [0, 0, 1.6])
    expect(p.u).toBeCloseTo(540, 9)
    expect(p.v).toBeCloseTo(960, 9)
    expect(p.x).toBeCloseTo(0.5, 12)
    expect(p.inFrame).toBe(true)
  })

  it('follows u = fx X/Z + cx, v = fy Y/Z + cy in camera coordinates', () => {
    const d = 5.016 // distance to target
    const target: Vec3 = [0, 0, 1.6]
    const pts: Vec3[] = [
      [0.7, 0, 1.6],
      [-1.3, 0.4, 2.9],
      [0.2, 3, 0.1],
    ]
    for (const p of pts) {
      const c = worldToCamera(e, p)
      const q = project(cam, p)
      expect(q.u).toBeCloseTo((I.fxPx * c[0]) / c[2] + I.cxPx, 9)
      expect(q.v).toBeCloseTo((I.fyPx * c[1]) / c[2] + I.cyPx, 9)
      expect(q.depthM).toBeCloseTo(c[2], 12)
    }
    expect(worldToCamera(e, target)[2]).toBeCloseTo(Math.hypot(5, 0.4), 12)
    expect(d).toBeGreaterThan(5)
  })

  it('moving 1 m to image-right at depth Z shifts u by fx / Z', () => {
    const base: Vec3 = [0, 0, 1.6]
    const Z = worldToCamera(e, base)[2]
    const moved: Vec3 = [base[0] + e.right[0], base[1] + e.right[1], base[2] + e.right[2]]
    expect(project(cam, moved).u - project(cam, base).u).toBeCloseTo(I.fxPx / Z, 9)
  })

  it('matches the truth.json extrinsics matrix: X_cam = R X + t', () => {
    const { R, t } = extrinsicsMatrix(e)
    const p: Vec3 = [1.1, -0.3, 2.2]
    const c = worldToCamera(e, p)
    for (let row = 0; row < 3; row++) {
      const v = R[row * 3] * p[0] + R[row * 3 + 1] * p[1] + R[row * 3 + 2] * p[2] + t[row]
      expect(v).toBeCloseTo(c[row], 12)
    }
  })

  it('applies radial distortion about the principal point', () => {
    const Id = makeIntrinsics(1080, 1920, 26, -0.05, 0.01)
    const camD: Camera = { intrinsics: Id, extrinsics: e }
    expect(project(camD, [0, 0, 1.6]).u).toBeCloseTo(540, 9)
    const p: Vec3 = [1.2, 0.5, 2.5]
    const c = worldToCamera(e, p)
    const xn = c[0] / c[2]
    const yn = c[1] / c[2]
    const r2 = xn * xn + yn * yn
    const k = 1 - 0.05 * r2 + 0.01 * r2 * r2
    expect(project(camD, p).u).toBeCloseTo(Id.fxPx * xn * k + 540, 9)
    expect(project(camD, p).v).toBeCloseTo(Id.fyPx * yn * k + 960, 9)
  })

  it('reports points behind the camera as not in frame', () => {
    expect(project(cam, [0, -8, 1.2]).inFrame).toBe(false)
  })

  it('gives three.js a camera quaternion that looks along the optical axis', () => {
    const q = threeCameraQuat(e)
    const fwd = rotateByQuat(q, [0, 0, -1])
    const up = rotateByQuat(q, [0, 1, 0])
    expect(dist(fwd, e.forward)).toBeLessThan(1e-9)
    expect(dist(up, [-e.down[0], -e.down[1], -e.down[2]])).toBeLessThan(1e-9)
  })
})

describe('camera placement', () => {
  const stance: Vec3 = [-0.06, -0.35, 0]
  it('side view sits on the chest side at the requested horizontal distance and height', () => {
    const e = placeCamera({ view: 'side', distanceM: 5, heightM: 1.2, lookAtHeightM: 1.6 }, stance, -1)
    expect(e.position[2]).toBe(1.2)
    expect(Math.hypot(e.position[0] - stance[0], e.position[1] - stance[1])).toBeCloseTo(5, 12)
    expect(e.position[1]).toBeLessThan(stance[1])
  })
  it('rear view is behind the server looking toward the net', () => {
    const e = placeCamera({ view: 'rear', distanceM: 5, heightM: 1.5 }, stance, -1)
    expect(e.position[0]).toBeCloseTo(stance[0] - 5, 12)
    expect(e.forward[0]).toBeGreaterThan(0.99)
  })
  it('front-45 view is inside the court at 45 degrees', () => {
    const e = placeCamera({ view: 'front45', distanceM: 5, heightM: 1.2 }, stance, -1)
    expect(e.position[0] - stance[0]).toBeCloseTo(5 * Math.SQRT1_2, 12)
    expect(e.position[1] - stance[1]).toBeCloseTo(-5 * Math.SQRT1_2, 12)
  })
})

describe('handheld shake', () => {
  it('is deterministic, keeps the frame orthonormal and stays near the requested amplitude', () => {
    const base = lookAt([0, -5, 1.2], [0, 0, 1.6])
    const a = makeShake({ rotationDeg: 0.5, translationM: 0.01, seed: 3 })
    const b = makeShake({ rotationDeg: 0.5, translationM: 0.01, seed: 3 })
    let maxAngle = 0
    for (let t = 0; t < 5; t += 0.01) {
      const x = a(t, base)
      const y = b(t, base)
      expect(dist(x.forward, y.forward)).toBe(0)
      expect(len(x.forward)).toBeCloseTo(1, 12)
      expect(dot(x.right, x.forward)).toBeCloseTo(0, 12)
      maxAngle = Math.max(maxAngle, (Math.acos(Math.min(1, dot(x.forward, base.forward))) * 180) / Math.PI)
    }
    expect(maxAngle).toBeGreaterThan(0.2)
    expect(maxAngle).toBeLessThan(2)
  })
})
