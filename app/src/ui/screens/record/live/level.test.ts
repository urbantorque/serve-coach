import { describe, expect, it } from 'vitest'
import { classifyLevel, gravitySignFor, levelInstruction, levelValue, lowPass, tiltFromGravity, tiltFromOrientation } from './level.ts'

const G = 9.81
const deg = (d: number) => (d * Math.PI) / 180

describe('tilt from gravity (CAPTURE §9.3 device test)', () => {
  it('upright portrait reads level', () => {
    const t = tiltFromGravity({ x: 0, y: G, z: 0 }, 0)!
    expect(t.pitchDeg).toBeCloseTo(0, 6)
    expect(t.rollDeg).toBeCloseTo(0, 6)
  })
  it('flat on a table, face up, reads pitch -90 (lens at the floor)', () => {
    expect(tiltFromGravity({ x: 0, y: 0, z: G }, 0)!.pitchDeg).toBeCloseTo(-90, 6)
  })
  it('lens tilted up 10 degrees reads +10; top away from you reads -10', () => {
    expect(tiltFromGravity({ x: 0, y: G * Math.cos(deg(10)), z: -G * Math.sin(deg(10)) }, 0)!.pitchDeg).toBeCloseTo(10, 6)
    expect(tiltFromGravity({ x: 0, y: G * Math.cos(deg(10)), z: G * Math.sin(deg(10)) }, 0)!.pitchDeg).toBeCloseTo(-10, 6)
  })
  it('landscape (screen angle 90) is level when gravity runs along x', () => {
    const t = tiltFromGravity({ x: G, y: 0, z: 0 }, 90)!
    expect(t.pitchDeg).toBeCloseTo(0, 6)
    expect(t.rollDeg).toBeCloseTo(0, 6)
  })
  it('applies the per-platform sign and ignores a zero vector', () => {
    expect(gravitySignFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(-1)
    expect(gravitySignFor('Mozilla/5.0 (Linux; Android 15)')).toBe(1)
    expect(tiltFromGravity({ x: 0, y: -G, z: 0 }, 0, -1)!.rollDeg).toBeCloseTo(0, 6)
    expect(tiltFromGravity({ x: 0, y: 0, z: 0 }, 0)).toBeNull()
  })
  it('the portrait fallback maps beta 90 to level', () => {
    expect(tiltFromOrientation(90, 0)).toEqual({ pitchDeg: 0, rollDeg: 0 })
  })
  it('low-passes with tau 0.3 s', () => {
    const next = lowPass({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, 0.3)
    expect(next.x).toBeCloseTo(1 - Math.exp(-1), 6)
    expect(lowPass(null, { x: 2, y: 2, z: 2 }, 0.1).x).toBe(2)
  })
})

describe('level states (D1: a measured 5 degree cap)', () => {
  it('classifies level, corrected, tilted, over the cap and unknown', () => {
    expect(classifyLevel({ pitchDeg: 1, rollDeg: -1.5 })).toBe('level')
    expect(classifyLevel({ pitchDeg: 2.8, rollDeg: 0 })).toBe('corrected')
    expect(classifyLevel({ pitchDeg: 4, rollDeg: 0 })).toBe('tilted')
    expect(classifyLevel({ pitchDeg: 4, rollDeg: 0 }, { allowUpTiltDeg: 5 })).toBe('corrected')
    expect(classifyLevel({ pitchDeg: -4, rollDeg: 0 }, { allowUpTiltDeg: 5 })).toBe('tilted')
    expect(classifyLevel({ pitchDeg: 7, rollDeg: 0 })).toBe('over-cap')
    expect(classifyLevel(null)).toBe('unknown')
  })
  it('gives one plain instruction and a short value', () => {
    expect(levelInstruction({ pitchDeg: 4, rollDeg: 1 })).toBe('Tilt the top away from you')
    expect(levelInstruction({ pitchDeg: -4, rollDeg: 1 })).toBe('Tilt the top towards you')
    expect(levelInstruction({ pitchDeg: 0.5, rollDeg: 3 })).toBe('Rotate slightly anticlockwise')
    expect(levelValue({ pitchDeg: 2.8, rollDeg: 0 }, 'corrected')).toBe('Tilted 3°, corrected')
    expect(levelValue({ pitchDeg: 7.2, rollDeg: 0 }, 'over-cap')).toBe('Tilted 7°')
    expect(levelValue(null, 'unknown')).toBe('Level unknown')
  })
})
