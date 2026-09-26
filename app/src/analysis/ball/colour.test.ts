import { describe, expect, it } from 'vitest'
import { ballColourLikelihood, hueDeg } from './colour.ts'
import { BALL_RGB, LIGHTING, type Rgb } from './testing/synthFrames.ts'

const lit = (rgb: Rgb, gain: Rgb): [number, number, number] => [rgb[0] * gain[0], rgb[1] * gain[1], rgb[2] * gain[2]]

describe('ballColourLikelihood', () => {
  it('scores optic yellow high under sun, shade, dusk and white-balance casts', () => {
    for (const [name, gain] of Object.entries(LIGHTING)) {
      const [r, g, b] = lit(BALL_RGB, gain)
      expect(ballColourLikelihood(r, g, b), name).toBeGreaterThan(0.8)
    }
  })

  it('rejects common court and background colours', () => {
    const backgrounds: Record<string, [number, number, number]> = {
      grass: [70, 125, 45],
      blueHardCourt: [52, 96, 150],
      greenHardCourt: [60, 110, 80],
      clay: [182, 96, 62],
      sky: [150, 190, 235],
      whiteLine: [235, 235, 230],
      lightSkin: [220, 170, 140],
      darkSkin: [120, 80, 60],
      windscreen: [34, 64, 48],
      black: [10, 12, 8],
    }
    for (const [name, [r, g, b]] of Object.entries(backgrounds)) {
      expect(ballColourLikelihood(r, g, b), name).toBeLessThan(0.1)
    }
  })

  it('computes HSV hue', () => {
    expect(hueDeg(255, 0, 0)).toBeCloseTo(0)
    expect(hueDeg(255, 255, 0)).toBeCloseTo(60)
    expect(hueDeg(0, 255, 0)).toBeCloseTo(120)
    expect(hueDeg(0, 0, 255)).toBeCloseTo(240)
    expect(hueDeg(128, 128, 128)).toBe(-1)
  })
})
