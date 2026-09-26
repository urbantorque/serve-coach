import { describe, expect, it } from 'vitest'
import { canvasRotationTransform, codedToDisplay, displaySize, displayToCoded, normalizeRotation, rotationFromMatrix, type RotationDeg } from './rotation.ts'

const ONE = 0x10000 // 1.0 in 16.16
const W = 0x40000000 // 1.0 in 2.30

/** tkhd matrix with a, b, c, d in 16.16 (as mp4box returns it). */
const matrix = (a: number, b: number, c: number, d: number, tx = 0, ty = 0) => [a * ONE, b * ONE, 0, c * ONE, d * ONE, 0, tx * ONE, ty * ONE, W]

describe('rotationFromMatrix', () => {
  it.each<[string, number[], RotationDeg]>([
    ['identity', matrix(1, 0, 0, 1), 0],
    ['iPhone portrait (90 cw)', matrix(0, 1, -1, 0, 1080), 90],
    ['upside down', matrix(-1, 0, 0, -1, 1920, 1080), 180],
    ['portrait, home button up (270 cw)', matrix(0, -1, 1, 0, 0, 1920), 270],
  ])('%s', (_name, m, expected) => {
    const r = rotationFromMatrix(m)
    expect(r.rotationDeg).toBe(expected)
    expect(r.mirrored).toBe(false)
    expect(r.exact).toBe(true)
  })

  it('reads unsigned 32-bit storage of negative entries', () => {
    const m = [0, ONE, 0, 0x100000000 - ONE, 0, 0, 0, 0, W]
    expect(rotationFromMatrix(m).rotationDeg).toBe(90)
  })

  it('detects mirroring and non-right angles', () => {
    expect(rotationFromMatrix(matrix(-1, 0, 0, 1)).mirrored).toBe(true)
    const tilted = rotationFromMatrix(matrix(Math.cos(0.3), Math.sin(0.3), -Math.sin(0.3), Math.cos(0.3)))
    expect(tilted.exact).toBe(false)
    expect(tilted.rotationDeg).toBe(0)
  })

  it('falls back to 0 for missing or zero matrices', () => {
    expect(rotationFromMatrix(undefined).rotationDeg).toBe(0)
    expect(rotationFromMatrix([0, 0, 0, 0, 0, 0, 0, 0, 0]).rotationDeg).toBe(0)
  })

  it('normalises arbitrary angles', () => {
    expect(normalizeRotation(-90)).toBe(270)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(179)).toBe(180)
  })
})

describe('coordinate transforms', () => {
  it('swaps display size for quarter turns', () => {
    expect(displaySize(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 })
    expect(displaySize(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 })
  })

  it('maps the coded top-left corner the way the displayed picture shows it', () => {
    expect(codedToDisplay(0, 0, 90)).toEqual({ x: 1, y: 0 }) // top edge becomes the right edge
    expect(codedToDisplay(0, 0, 180)).toEqual({ x: 1, y: 1 })
    expect(codedToDisplay(0, 0, 270)).toEqual({ x: 0, y: 1 })
  })

  it.each<RotationDeg>([0, 90, 180, 270])('round-trips points at %i deg', (rot) => {
    for (const [x, y] of [[0.1, 0.2], [0.9, 0.3], [0.5, 0.5], [0, 1]]) {
      const d = codedToDisplay(x, y, rot)
      const back = displayToCoded(d.x, d.y, rot)
      expect(back.x).toBeCloseTo(x, 12)
      expect(back.y).toBeCloseTo(y, 12)
    }
  })

  it.each<RotationDeg>([0, 90, 180, 270])('canvas transform agrees with codedToDisplay at %i deg', (rot) => {
    const coded = { w: 320, h: 180 }
    const disp = displaySize(coded.w, coded.h, rot)
    const t = canvasRotationTransform(rot, disp.width, disp.height)
    const [a, b, c, d, e, f] = t.matrix
    // Pixel (u, v) of the coded image is drawn at scale drawW/coded.w.
    for (const [u, v] of [[0, 0], [320, 0], [100, 50]]) {
      const su = (u * t.drawW) / coded.w
      const sv = (v * t.drawH) / coded.h
      const x = a * su + c * sv + e
      const y = b * su + d * sv + f
      const expected = codedToDisplay(u / coded.w, v / coded.h, rot)
      expect(x / disp.width).toBeCloseTo(expected.x, 9)
      expect(y / disp.height).toBeCloseTo(expected.y, 9)
    }
  })
})
