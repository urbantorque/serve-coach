import type { Vec3 } from './math/vec.ts'
import type { LightingPreset, LightingSpec, PostSpec } from './render/sceneTypes.ts'

export interface LightingLook {
  lighting: LightingSpec
  post: PostSpec
  /** Default shutter (s) before clamping to 1/fps. */
  defaultShutterS: number
  /** Brightness modulation of the light source (e.g. 100 Hz from 50 Hz mains), 0 = none. */
  flickerAmplitude: number
  flickerHz: number
  /** Body motion-blur sub-frames used for long shutters. */
  bodyBlurSamples: number
}

const dirFromAngles = (elevationDeg: number, azimuthDeg: number): Vec3 => {
  const e = (elevationDeg * Math.PI) / 180
  const a = (azimuthDeg * Math.PI) / 180
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]
}

/**
 * Lighting presets. Sun azimuth is in court coordinates; values were tuned by eye on rendered frames
 * (see README). Noise sigmas are in 8-bit code values.
 */
export function lightingLook(preset: LightingPreset): LightingLook {
  switch (preset) {
    case 'bright':
      return {
        lighting: {
          preset,
          sunDir: dirFromAngles(52, -125),
          sunIntensity: 2.6,
          sunColor: '#fff4e2',
          hemiSky: '#c4dcf2',
          hemiGround: '#6f7a5e',
          hemiIntensity: 1.0,
          skyTop: '#4a8fd6',
          skyHorizon: '#cfe2f3',
          floodlights: false,
          floodIntensity: 0,
          shadowRadius: 2,
        },
        post: { exposure: 1.0, whiteBalance: [1, 1, 1], contrast: 1.04, saturation: 1.05, vignette: 0.12, readNoise: 1.2, shotNoise: 0.015 },
        defaultShutterS: 1 / 1000,
        flickerAmplitude: 0,
        flickerHz: 100,
        bodyBlurSamples: 1,
      }
    case 'overcast':
      return {
        lighting: {
          preset,
          sunDir: dirFromAngles(60, -110),
          sunIntensity: 0.35,
          sunColor: '#f2f2f2',
          hemiSky: '#e0e4e8',
          hemiGround: '#767d6c',
          hemiIntensity: 2.0,
          skyTop: '#9aa4ae',
          skyHorizon: '#d6dbe0',
          floodlights: false,
          floodIntensity: 0,
          shadowRadius: 8,
        },
        post: { exposure: 2.4, whiteBalance: [0.98, 1, 1.03], contrast: 0.95, saturation: 0.85, vignette: 0.12, readNoise: 2.0, shotNoise: 0.04 },
        defaultShutterS: 1 / 250,
        flickerAmplitude: 0,
        flickerHz: 100,
        bodyBlurSamples: 3,
      }
    case 'dusk':
      return {
        lighting: {
          preset,
          sunDir: dirFromAngles(5, -150),
          sunIntensity: 0.9,
          sunColor: '#ffab66',
          hemiSky: '#6e7fb3',
          hemiGround: '#3b3730',
          hemiIntensity: 0.38,
          skyTop: '#22305c',
          skyHorizon: '#e89a5f',
          floodlights: false,
          floodIntensity: 0,
          shadowRadius: 4,
        },
        post: { exposure: 9, whiteBalance: [1.04, 0.98, 0.92], contrast: 0.92, saturation: 0.9, vignette: 0.2, readNoise: 5.5, shotNoise: 0.3 },
        defaultShutterS: 1 / 60,
        flickerAmplitude: 0,
        flickerHz: 100,
        bodyBlurSamples: 5,
      }
    case 'night':
      return {
        lighting: {
          preset,
          sunDir: [0, 0, 1],
          sunIntensity: 0,
          sunColor: '#000000',
          hemiSky: '#27304a',
          hemiGround: '#141414',
          hemiIntensity: 0.12,
          skyTop: '#03050b',
          skyHorizon: '#0f1420',
          floodlights: true,
          floodIntensity: 260,
          shadowRadius: 3,
        },
        post: { exposure: 0.6, whiteBalance: [0.96, 1, 1.1], contrast: 1.0, saturation: 0.9, vignette: 0.18, readNoise: 4.0, shotNoise: 0.2 },
        defaultShutterS: 1 / 240,
        flickerAmplitude: 0.3,
        flickerHz: 100,
        bodyBlurSamples: 2,
      }
  }
}

/**
 * Mean flicker gain over the exposure window [t - s/2, t + s/2] for brightness 1 + A sin(2 pi f t).
 * Integrating over the shutter is what a real sensor does, so short shutters see the full swing.
 */
export function flickerGain(tRealS: number, shutterS: number, amplitude: number, hz: number): number {
  if (amplitude === 0) return 1
  const w = 2 * Math.PI * hz
  if (shutterS <= 0) return 1 + amplitude * Math.sin(w * tRealS)
  const a = tRealS - shutterS / 2
  const b = tRealS + shutterS / 2
  return 1 + (amplitude * (Math.cos(w * a) - Math.cos(w * b))) / (w * shutterS)
}
