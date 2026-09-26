import { describe, expect, it } from 'vitest'
import {
  assessAudioTiming,
  classifyTransient,
  detectOnsets,
  fft,
  highPass,
  mixToMono,
  onsetEnvelope,
  pickPeaks,
  sharpnessScore,
  toAudioOnsets,
} from './audio.ts'

/** Deterministic PRNG (mulberry32) so noise is reproducible. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Scene {
  sampleRate: number
  durationS: number
  noiseRms: number
  clicks?: { t: number; amp: number }[]
  thumps?: { t: number; amp: number }[]
  seed?: number
}

/** Background noise + broadband decaying noise bursts ("pops") + low decaying sines ("thumps"). */
function synth(scene: Scene): Float32Array {
  const { sampleRate, durationS } = scene
  const random = rng(scene.seed ?? 1)
  const out = new Float32Array(Math.round(sampleRate * durationS))
  const noiseAmp = scene.noiseRms * Math.sqrt(3) // uniform noise with this RMS
  for (let i = 0; i < out.length; i++) out[i] = noiseAmp * (2 * random() - 1)
  for (const { t, amp } of scene.clicks ?? []) {
    const start = Math.round(t * sampleRate)
    for (let i = start; i < Math.min(out.length, start + Math.round(0.02 * sampleRate)); i++) {
      out[i] += amp * Math.exp(-((i - start) / sampleRate) * 1000) * (2 * random() - 1)
    }
  }
  for (const { t, amp } of scene.thumps ?? []) {
    const start = Math.round(t * sampleRate)
    for (let i = start; i < Math.min(out.length, start + Math.round(0.15 * sampleRate)); i++) {
      const dt = (i - start) / sampleRate
      out[i] += amp * Math.exp(-dt * 40) * Math.sin(2 * Math.PI * 180 * dt)
    }
  }
  return out
}

describe('DSP building blocks', () => {
  it('FFT finds a pure tone in the right bin', () => {
    const n = 256
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 10 * i) / n)
    fft(re, im)
    const mags = Array.from(re, (r, k) => Math.hypot(r, im[k]))
    expect(mags.indexOf(Math.max(...mags.slice(0, n / 2)))).toBe(10)
    expect(mags[10]).toBeCloseTo(n / 2, 6)
  })

  it('high-pass removes low frequencies and keeps high ones', () => {
    const sr = 48000
    const tone = (hz: number) => Float32Array.from({ length: sr / 2 }, (_, i) => Math.sin((2 * Math.PI * hz * i) / sr))
    const rms = (x: Float32Array) => Math.sqrt(x.slice(sr / 4).reduce((s, v) => s + v * v, 0) / (sr / 4))
    expect(rms(highPass(tone(50), sr, 1000))).toBeLessThan(0.01)
    expect(rms(highPass(tone(8000), sr, 1000))).toBeGreaterThan(0.69)
  })

  it('mixes channels to mono', () => {
    expect(Array.from(mixToMono([new Float32Array([1, 1]), new Float32Array([0, -1])]))).toEqual([0.5, 0])
  })
})

describe('detectOnsets timing', () => {
  const truthS = [0.3137, 0.9021, 1.5555, 2.2]

  it.each([
    { sampleRate: 48000, noiseRms: 0.005, method: 'energy-rise' as const },
    { sampleRate: 44100, noiseRms: 0.005, method: 'energy-rise' as const },
    { sampleRate: 48000, noiseRms: 0.03, method: 'energy-rise' as const },
    { sampleRate: 48000, noiseRms: 0.005, method: 'spectral-flux' as const },
  ])('finds every click within 2 ms ($method, $sampleRate Hz, noise $noiseRms)', ({ sampleRate, noiseRms, method }) => {
    const signal = synth({ sampleRate, durationS: 2.5, noiseRms, clicks: truthS.map((t) => ({ t, amp: 0.6 })), seed: 11 })
    const onsets = detectOnsets(signal, sampleRate, { method })
    expect(onsets).toHaveLength(truthS.length)
    const errorsMs = onsets.map((o, i) => Math.abs(o.tMedia - truthS[i]) * 1000)
    for (const e of errorsMs) expect(e).toBeLessThan(2)
    // Typical accuracy is far better than the requirement; keep an eye on it.
    expect(Math.max(...errorsMs)).toBeLessThan(0.3)
  })

  it('keeps sub-2 ms timing at 10 dB lower click level (weak far-court contact)', () => {
    const sr = 48000
    const truth = [0.4, 1.1]
    const signal = synth({ sampleRate: sr, durationS: 1.5, noiseRms: 0.01, clicks: truth.map((t) => ({ t, amp: 0.1 })), seed: 5 })
    const onsets = detectOnsets(signal, sr)
    expect(onsets.map((o) => Math.round(o.tMedia * 10) / 10)).toEqual(truth)
    for (const [i, o] of onsets.entries()) expect(Math.abs(o.tMedia - truth[i]) * 1000).toBeLessThan(2)
  })

  it('does not report onsets in stationary noise', () => {
    const signal = synth({ sampleRate: 48000, durationS: 2, noiseRms: 0.05, seed: 3 })
    expect(detectOnsets(signal, 48000)).toHaveLength(0)
  })

  it('applies the media offset and the real-time scale', () => {
    const sr = 48000
    const signal = synth({ sampleRate: sr, durationS: 1, noiseRms: 0.005, clicks: [{ t: 0.5, amp: 0.5 }] })
    const [onset] = detectOnsets(signal, sr, { offsetS: -0.0213, timeScale: 0.125 })
    expect(onset.tMedia).toBeCloseTo(0.5 - 0.0213, 3)
    expect(onset.tReal).toBeCloseTo(onset.tMedia * 0.125, 9)
  })

  it('respects the minimum interval between onsets', () => {
    const sr = 48000
    const signal = synth({ sampleRate: sr, durationS: 1, noiseRms: 0.005, clicks: [{ t: 0.3, amp: 0.5 }, { t: 0.33, amp: 0.2 }] })
    const env = onsetEnvelope(signal, sr)
    expect(pickPeaks(env, { minIntervalS: 0.05 })).toHaveLength(1)
    expect(pickPeaks(env, { minIntervalS: 0.01 })).toHaveLength(2)
  })
})

describe('contact vs bounce sharpness', () => {
  const sr = 48000
  const signal = synth({
    sampleRate: sr,
    durationS: 2,
    noiseRms: 0.004,
    clicks: [{ t: 0.5, amp: 0.6 }],
    thumps: [{ t: 1.2, amp: 0.6 }],
    seed: 21,
  })
  const onsets = detectOnsets(signal, sr)

  it('detects both transients near their true times', () => {
    expect(onsets).toHaveLength(2)
    expect(Math.abs(onsets[0].tMedia - 0.5) * 1000).toBeLessThan(2)
    expect(Math.abs(onsets[1].tMedia - 1.2) * 1000).toBeLessThan(2)
  })

  it('scores the broadband pop sharper than the low thump and labels them', () => {
    const [pop, thump] = onsets
    expect(pop.hfRatio).toBeGreaterThan(0.8)
    expect(thump.hfRatio).toBeLessThan(0.05)
    expect(pop.sharpness).toBeGreaterThan(thump.sharpness)
    expect(pop.kind).toBe('contact')
    expect(thump.kind).toBe('bounce')
    expect(pop.spectralCentroidHz).toBeGreaterThan(5000)
    expect(thump.spectralCentroidHz).toBeLessThan(1000)
  })

  it('maps to the AudioOnset contract and can suppress labels', () => {
    const contract = toAudioOnsets(onsets)
    expect(contract[0]).toEqual({ tReal: onsets[0].tReal, strength: onsets[0].strength, sharpness: onsets[0].sharpness, kind: 'contact' })
    expect(detectOnsets(signal, sr, { labelKinds: false }).every((o) => o.kind === 'unknown')).toBe(true)
  })

  it('has monotone sharpness scoring and three-way labels', () => {
    expect(sharpnessScore({ hfRatio: 0.9, riseTimeMs: 0.5 })).toBeGreaterThan(sharpnessScore({ hfRatio: 0.4, riseTimeMs: 0.5 }))
    expect(sharpnessScore({ hfRatio: 0.5, riseTimeMs: 1 })).toBeGreaterThan(sharpnessScore({ hfRatio: 0.5, riseTimeMs: 5 }))
    expect(classifyTransient(0.9)).toBe('contact')
    expect(classifyTransient(0.5)).toBe('unknown')
    expect(classifyTransient(0.1)).toBe('bounce')
  })
})

describe('assessAudioTiming', () => {
  it('rejects audio from time-scaled (rendered slow-motion) clips', () => {
    expect(assessAudioTiming({ hasAudio: true, timeScale: 1 }).usable).toBe(true)
    expect(assessAudioTiming({ hasAudio: true, timeScale: 0.125 }).usable).toBe(false)
    expect(assessAudioTiming({ hasAudio: false, timeScale: 1 }).usable).toBe(false)
  })
})
