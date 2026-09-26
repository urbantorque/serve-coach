/**
 * Colour likelihood for an optic-yellow tennis ball in 8-bit sRGB.
 *
 * Works in HSV because hue is the component that survives brightness changes (sun vs
 * shade vs dusk). The hue band is deliberately wide: phone white balance pushes the
 * ball from about 45 deg (warm dusk light) to about 95 deg (bluish shade), and
 * motion blur mixes the ball with the background, which lowers saturation. Colour
 * alone cannot separate the ball from sunlit dry grass or a yellow shirt; the detector
 * combines it with motion and blob shape.
 */

export interface ColourModel {
  /** Hue band (degrees) that scores 1. */
  hueLowDeg: number
  hueHighDeg: number
  /** Linear fall-off widths below and above the band (grass sits just above it). */
  hueRampLowDeg: number
  hueRampHighDeg: number
  /** HSV saturation ((max-min)/max) ramp. */
  saturationLow: number
  saturationHigh: number
  /** HSV value (max/255) ramp; rejects near-black pixels where hue is noise. */
  valueLow: number
  valueHigh: number
  /** Chroma (max-min, 8-bit levels) ramp; rejects sensor-noise hue in grey areas. */
  chromaLow: number
  chromaHigh: number
}

export const DEFAULT_COLOUR_MODEL: ColourModel = {
  hueLowDeg: 48,
  hueHighDeg: 88,
  hueRampLowDeg: 16,
  hueRampHighDeg: 11,
  saturationLow: 0.2,
  saturationHigh: 0.42,
  valueLow: 0.12,
  valueHigh: 0.3,
  chromaLow: 16,
  chromaHigh: 40,
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** HSV hue in degrees [0, 360), or -1 for achromatic pixels. */
export function hueDeg(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  if (chroma <= 0) return -1
  let h: number
  if (max === r) h = ((g - b) / chroma) % 6
  else if (max === g) h = (b - r) / chroma + 2
  else h = (r - g) / chroma + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

/** 0..1 likelihood that an sRGB pixel (0..255 channels) is optic-yellow ball felt. */
export function ballColourLikelihood(r: number, g: number, b: number, model: ColourModel = DEFAULT_COLOUR_MODEL): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = max - min
  if (chroma < model.chromaLow || max <= 0) return 0
  // Blue is the smallest channel for any yellow-green; a quick reject for skies and courts.
  if (b > r && b > g) return 0
  const hue = hueDeg(r, g, b)
  let hueScore: number
  if (hue >= model.hueLowDeg && hue <= model.hueHighDeg) hueScore = 1
  else if (hue < model.hueLowDeg) hueScore = clamp(1 - (model.hueLowDeg - hue) / model.hueRampLowDeg, 0, 1)
  else hueScore = clamp(1 - (hue - model.hueHighDeg) / model.hueRampHighDeg, 0, 1)
  if (hueScore === 0) return 0
  const saturation = chroma / max
  const value = max / 255
  return (
    hueScore *
    smoothstep(model.saturationLow, model.saturationHigh, saturation) *
    smoothstep(model.valueLow, model.valueHigh, value) *
    smoothstep(model.chromaLow, model.chromaHigh, chroma)
  )
}
