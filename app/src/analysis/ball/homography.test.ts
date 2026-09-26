import { describe, expect, it } from 'vitest'
import {
  applyHomography,
  classifyServeLanding,
  computeHomography,
  COURT,
  COURT_KEYPOINTS,
  invertHomography,
  reprojectionErrors,
  symmetricEigen,
  type Mat3,
  type Point2,
} from './homography.ts'
import { createRng, gaussian } from './random.ts'
import { project, type Camera } from './testing/synthTrajectories.ts'

// Phone 4 m behind the server's baseline, 1.3 m high, tilted 8 deg down, landscape 16:9.
const rearCamera: Camera = { position: { x: 0.4, y: 1.3, z: -4 }, yawRad: 0.01, pitchRad: (8 * Math.PI) / 180, focalFhu: 1.2, aspect: 16 / 9 }
// Court frame (x across, y along) -> world (x, 0, z).
const courtToImage = (p: Point2): Point2 => {
  const q = project(rearCamera, { x: p.x, y: 0, z: p.y })
  return { x: q.x, y: q.y }
}

describe('symmetricEigen', () => {
  it('diagonalises a symmetric matrix', () => {
    const A = [
      [4, 1, 2],
      [1, 3, 0],
      [2, 0, 5],
    ]
    const { values, vectors } = symmetricEigen(A)
    values.forEach((lambda, i) => {
      const v = vectors[i]
      const Av = A.map((row) => row.reduce((s, a, k) => s + a * v[k], 0))
      Av.forEach((x, k) => expect(x).toBeCloseTo(lambda * v[k], 9))
    })
  })
})

describe('homography', () => {
  const keys = Object.values(COURT_KEYPOINTS)
  const imagePts = keys.map(courtToImage)

  it('round-trips court -> image -> court exactly for noiseless points', () => {
    const fit = computeHomography(imagePts, keys)!
    expect(fit).not.toBeNull()
    expect(fit.rmsError).toBeLessThan(1e-6)
    const rng = createRng(1)
    let worst = 0
    for (let i = 0; i < 200; i++) {
      const p = { x: (rng() - 0.5) * 10, y: rng() * COURT.lengthM }
      const back = applyHomography(fit.H, courtToImage(p))!
      worst = Math.max(worst, Math.hypot(back.x - p.x, back.y - p.y))
    }
    expect(worst).toBeLessThan(1e-6)
    console.info(`[ball-accuracy] homography noiseless round trip max error ${worst.toExponential(2)} m over 200 points`)
    const inverse = invertHomography(fit.H)!
    const img = applyHomography(inverse, { x: 2, y: 15 })!
    const expected = courtToImage({ x: 2, y: 15 })
    expect(img.x).toBeCloseTo(expected.x, 8)
    expect(img.y).toBeCloseTo(expected.y, 8)
  })

  it('degrades gracefully with tapped-point noise (0.5 px at 1080p)', () => {
    const rng = createRng(2)
    const sigma = 0.5 / 1080
    const errors: number[] = []
    const rmsList: number[] = []
    for (let trial = 0; trial < 50; trial++) {
      // Six taps: service-line corners, T and the near baseline corners.
      const names = ['farServiceLineLeft', 'farServiceLineRight', 'farServiceT', 'nearBaselineSinglesLeft', 'nearBaselineSinglesRight', 'nearServiceT']
      const court = names.map((n) => COURT_KEYPOINTS[n])
      const image = court.map((p) => {
        const q = courtToImage(p)
        return { x: q.x + (sigma * gaussian(rng)) / rearCamera.aspect, y: q.y + sigma * gaussian(rng) }
      })
      const fit = computeHomography(image, court)!
      rmsList.push(fit.rmsError)
      // Error at a typical landing spot in the far service box.
      const target = { x: -2, y: 16.5 }
      const mapped = applyHomography(fit.H, courtToImage(target))!
      errors.push(Math.hypot(mapped.x - target.x, mapped.y - target.y))
    }
    errors.sort((a, b) => a - b)
    const median = errors[errors.length >> 1]
    const p95 = errors[Math.floor(0.95 * errors.length)]
    console.info(`[ball-accuracy] homography 6 taps with 0.5 px noise: far-box point error median ${(median * 100).toFixed(1)} cm, p95 ${(p95 * 100).toFixed(1)} cm`)
    expect(median).toBeLessThan(0.15)
  })

  it('reports reprojection error and rejects degenerate input', () => {
    const H: Mat3 = [2, 0.1, 3, -0.2, 1.5, 1, 0.001, 0.002, 1]
    const src = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 3 },
    ]
    const dst = src.map((p) => applyHomography(H, p)!)
    const fit = computeHomography(src, dst)!
    fit.H.forEach((v, i) => expect(v).toBeCloseTo(H[i], 8))
    const moved = dst.map((p, i) => (i === 4 ? { x: p.x + 1, y: p.y } : p))
    expect(reprojectionErrors(fit.H, src, moved).max).toBeCloseTo(1, 6)
    expect(computeHomography(src.slice(0, 3), dst.slice(0, 3))).toBeNull()
    const collinear = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]
    expect(computeHomography(collinear, dst.slice(0, 4))).toBeNull()
  })

  it('classifies serve landings', () => {
    expect(classifyServeLanding({ x: -2, y: 15 }, 'deuce')).toMatchObject({ box: 'deuce', isIn: true })
    expect(classifyServeLanding({ x: -2, y: 15 }, 'ad').isIn).toBe(false)
    expect(classifyServeLanding({ x: 2, y: 17 }, 'ad')).toMatchObject({ box: 'ad', isIn: true })
    const long = classifyServeLanding({ x: -1, y: 19 }, 'deuce')
    expect(long.isIn).toBe(false)
    expect(long.depthFromServiceLineM).toBeCloseTo(COURT.farServiceLineY - 19)
  })
})
