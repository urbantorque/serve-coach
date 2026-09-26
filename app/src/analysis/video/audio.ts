/**
 * Audio transients for racket-contact timing.
 *
 * Pure DSP (Node-testable, Float32Array + sampleRate in, seconds out):
 *   high-pass -> onset strength envelope (log-energy rise or spectral flux)
 *   -> adaptive peak picking -> sample-accurate onset refinement
 *   -> features (rise time, high-frequency ratio, centroid, SNR) -> sharpness + label.
 * Browser decode helpers at the bottom (WebCodecs AudioDecoder, or decodeAudioData).
 *
 * The contact/bounce label is a heuristic tuned on synthetic signals only; it is
 * 'experimental' until validated against labelled real recordings.
 */
import type { AudioOnset, VideoMeta } from '../types.ts'
import type { ByteSource } from './byteSource.ts'
import type { AudioTrackInfo } from './probe.ts'

// ---------- basic DSP ----------

export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const length = Math.min(...channels.map((c) => c.length))
  const out = new Float32Array(length)
  for (const channel of channels) for (let i = 0; i < length; i++) out[i] += channel[i] / channels.length
  return out
}

/** 2nd-order Butterworth-style high-pass (RBJ cookbook biquad), causal, so it never moves an onset earlier. */
export function highPass(signal: Float32Array, sampleRate: number, cutoffHz: number, q = Math.SQRT1_2): Float32Array {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate
  const alpha = Math.sin(w0) / (2 * q)
  const cosw = Math.cos(w0)
  const a0 = 1 + alpha
  const b0 = (1 + cosw) / 2 / a0
  const b1 = -(1 + cosw) / a0
  const b2 = b0
  const a1 = (-2 * cosw) / a0
  const a2 = (1 - alpha) / a0
  const out = new Float32Array(signal.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i]
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    out[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }
  return out
}

/** In-place iterative radix-2 FFT. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k]
        const aIm = im[i + k]
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe
        re[i + k] = aRe + bRe
        im[i + k] = aIm + bIm
        re[i + k + len / 2] = aRe - bRe
        im[i + k + len / 2] = aIm - bIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

/** Centered moving average of x^2 over `width` samples (energy envelope, no time shift). */
export function smoothedEnergy(signal: Float32Array, width: number): Float32Array {
  const half = Math.max(0, Math.floor(width / 2))
  const prefix = new Float64Array(signal.length + 1)
  for (let i = 0; i < signal.length; i++) prefix[i + 1] = prefix[i] + signal[i] * signal[i]
  const out = new Float32Array(signal.length)
  for (let i = 0; i < signal.length; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(signal.length, i + half + 1)
    out[i] = (prefix[hi] - prefix[lo]) / (hi - lo)
  }
  return out
}

function medianOf(values: ArrayLike<number>): number {
  const sorted = Array.from(values).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ---------- onset strength envelope ----------

export type OnsetMethod = 'energy-rise' | 'spectral-flux'

export interface OnsetEnvelopeOptions {
  method?: OnsetMethod
  /** High-pass cutoff applied before analysis (removes wind/handling rumble). */
  highPassHz?: number
  /** Envelope hop in seconds (energy-rise default 1 ms, spectral flux uses 128-sample hops). */
  hopS?: number
}

export interface OnsetEnvelope {
  values: Float32Array
  /** Sample index at the centre of envelope frame 0, and samples per hop. */
  firstCenterSample: number
  hopSamples: number
  sampleRate: number
  method: OnsetMethod
  /** The high-passed signal the envelope was computed from (reused for refinement). */
  filtered: Float32Array
}

/**
 * energy-rise: per 1 ms hop, the rise in dB of the 2 ms energy over the previous 5 ms
 * minimum. An impulsive "pop" jumps tens of dB within a hop; steady noise does not.
 * spectral-flux: half-wave rectified increase of log-magnitude spectra (512-pt frames).
 */
export function onsetEnvelope(signal: Float32Array, sampleRate: number, options: OnsetEnvelopeOptions = {}): OnsetEnvelope {
  const method = options.method ?? 'energy-rise'
  const filtered = highPass(signal, sampleRate, options.highPassHz ?? 100)

  if (method === 'spectral-flux') {
    const size = 512
    const hop = 128
    const frames = Math.max(0, Math.floor((filtered.length - size) / hop) + 1)
    const values = new Float32Array(frames)
    const window = new Float64Array(size)
    for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))
    let previous = new Float64Array(size / 2)
    const re = new Float64Array(size)
    const im = new Float64Array(size)
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < size; i++) {
        re[i] = filtered[f * hop + i] * window[i]
        im[i] = 0
      }
      fft(re, im)
      const current = new Float64Array(size / 2)
      let flux = 0
      for (let k = 1; k < size / 2; k++) {
        current[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]))
        const rise = current[k] - previous[k]
        if (rise > 0) flux += rise
      }
      values[f] = f === 0 ? 0 : flux
      previous = current
    }
    return { values, firstCenterSample: size / 2, hopSamples: hop, sampleRate, method, filtered }
  }

  const hop = Math.max(1, Math.round((options.hopS ?? 0.001) * sampleRate))
  const energy = smoothedEnergy(filtered, Math.round(0.002 * sampleRate))
  const frames = Math.floor(filtered.length / hop)
  const db = new Float32Array(frames)
  for (let f = 0; f < frames; f++) db[f] = 10 * Math.log10(energy[f * hop] + 1e-12)
  const lookback = Math.max(1, Math.round(0.005 * sampleRate / hop))
  const values = new Float32Array(frames)
  for (let f = 1; f < frames; f++) {
    let floor = Number.POSITIVE_INFINITY
    for (let k = Math.max(0, f - lookback); k < f; k++) floor = Math.min(floor, db[k])
    values[f] = Math.max(0, db[f] - floor)
  }
  return { values, firstCenterSample: 0, hopSamples: hop, sampleRate, method, filtered }
}

// ---------- peak picking ----------

export interface PeakPickOptions {
  /** Threshold = local median + k * robust sigma (MAD * 1.4826) of the whole envelope. */
  k?: number
  /** Absolute floor for the threshold (envelope units; dB for energy-rise). */
  minValue?: number
  /** Half-width of the local median window, seconds. */
  medianWindowS?: number
  /** Minimum time between reported onsets, seconds. */
  minIntervalS?: number
}

/** Returns envelope frame indices of onset peaks, strongest-first within each min interval. */
export function pickPeaks(env: OnsetEnvelope, options: PeakPickOptions = {}): number[] {
  const values = env.values
  const hopS = env.hopSamples / env.sampleRate
  const k = options.k ?? 6
  // 6 dB within ~5 ms: stationary noise essentially never rises this fast with 2 ms windows.
  const minValue = options.minValue ?? (env.method === 'energy-rise' ? 6 : 0)
  const halfWindow = Math.max(1, Math.round((options.medianWindowS ?? 0.05) / hopS))
  const minGap = Math.max(1, Math.round((options.minIntervalS ?? 0.05) / hopS))

  const globalMedian = medianOf(values)
  const sigma = 1.4826 * medianOf(Array.from(values, (v) => Math.abs(v - globalMedian))) || 1e-9

  const candidates: number[] = []
  for (let i = 1; i < values.length - 1; i++) {
    const v = values[i]
    if (v < values[i - 1] || v < values[i + 1] || v < minValue) continue
    const lo = Math.max(0, i - halfWindow)
    const hi = Math.min(values.length, i + halfWindow + 1)
    const localMedian = medianOf(values.subarray(lo, hi))
    if (v > localMedian + k * sigma) candidates.push(i)
  }
  // Non-maximum suppression: keep the strongest peak within each minGap neighbourhood.
  const byStrength = [...candidates].sort((a, b) => values[b] - values[a])
  const kept: number[] = []
  for (const c of byStrength) if (kept.every((p) => Math.abs(p - c) >= minGap)) kept.push(c)
  return kept.sort((a, b) => a - b)
}

// ---------- refinement and features ----------

export interface TransientFeatures {
  /** Refined onset (first sample above threshold), in samples from the start of the signal. */
  onsetSample: number
  /** 10% -> 90% rise of the 1 ms RMS envelope, milliseconds. */
  riseTimeMs: number
  /** Energy above 2 kHz / energy above 100 Hz over the first 20 ms. */
  hfRatio: number
  spectralCentroidHz: number
  peakDbfs: number
  /** Peak energy over the pre-onset noise floor, dB. */
  snrDb: number
}

const HF_SPLIT_HZ = 2000

/**
 * Walks back from the energy peak near `approxSample` to the first sample whose
 * 0.5 ms energy exceeds noise + 10% of (peak - noise) after a sustained quiet stretch.
 */
export function refineOnset(filtered: Float32Array, sampleRate: number, approxSample: number): { onsetSample: number; peakSample: number; noise: number; peak: number } {
  const ms = sampleRate / 1000
  const window = Math.max(1, Math.round(0.5 * ms))
  const energy = smoothedEnergy(filtered, window)
  const searchLo = Math.max(0, Math.round(approxSample - 5 * ms))
  const searchHi = Math.min(filtered.length, Math.round(approxSample + 15 * ms))
  let peakSample = searchLo
  for (let i = searchLo; i < searchHi; i++) if (energy[i] > energy[peakSample]) peakSample = i
  const noiseLo = Math.max(0, Math.round(peakSample - 60 * ms))
  const noiseHi = Math.max(noiseLo, Math.round(peakSample - 15 * ms))
  const noiseRegion = noiseHi - noiseLo >= 8 ? energy.subarray(noiseLo, noiseHi) : null
  const noise = noiseRegion ? medianOf(noiseRegion) : 0
  const noiseSpread = noiseRegion ? 1.4826 * medianOf(Array.from(noiseRegion, (v) => Math.abs(v - noise))) : 0
  const peak = energy[peakSample]
  // 10% of the rise, but clear of noise fluctuations when the transient is weak (capped at 50%).
  const rise = peak - noise
  const threshold = noise + Math.min(0.5 * rise, Math.max(0.1 * rise, 4 * noiseSpread))
  // Walk back to the last sustained quiet run (>= 3 ms below threshold). Brief dips at the
  // zero crossings of a low-frequency thump must not be mistaken for the onset.
  const quietRun = Math.max(1, Math.round(3 * ms))
  const limit = Math.max(0, Math.round(peakSample - 30 * ms))
  let run = 0
  let onsetSample = -1
  for (let j = peakSample - 1; j >= limit; j--) {
    if (energy[j] < threshold) {
      run++
      if (run >= quietRun) {
        onsetSample = j + run
        break
      }
    } else {
      run = 0
    }
  }
  if (onsetSample < 0) {
    onsetSample = limit
    while (onsetSample < peakSample && energy[onsetSample] < threshold) onsetSample++
  }
  // The centred window sees the transient half a window early; remove that bias
  // (measured: -0.23 ms without it on synthetic clicks at 48 kHz).
  onsetSample = Math.min(peakSample, onsetSample + Math.floor(window / 2))
  return { onsetSample, peakSample, noise, peak }
}

export function transientFeatures(signal: Float32Array, filtered: Float32Array, sampleRate: number, approxSample: number): TransientFeatures {
  const ms = sampleRate / 1000
  const { onsetSample, noise, peak } = refineOnset(filtered, sampleRate, approxSample)

  // Rise time on a 1 ms RMS envelope, peak searched over the first 30 ms.
  const rms = smoothedEnergy(filtered, Math.max(1, Math.round(ms)))
  const end = Math.min(filtered.length, Math.round(onsetSample + 30 * ms))
  let peakRms = 0
  let peakAt = onsetSample
  for (let i = onsetSample; i < end; i++) {
    if (rms[i] > peakRms) {
      peakRms = rms[i]
      peakAt = i
    }
  }
  const amp = (i: number) => Math.sqrt(rms[i])
  const peakAmp = Math.sqrt(peakRms)
  let t10 = onsetSample
  while (t10 < peakAt && amp(t10) < 0.1 * peakAmp) t10++
  let t90 = t10
  while (t90 < peakAt && amp(t90) < 0.9 * peakAmp) t90++
  const riseTimeMs = (t90 - t10) / ms

  // Spectrum of the first ~20 ms (power-of-two length).
  let size = 1
  while (size < 20 * ms) size <<= 1
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  for (let i = 0; i < size && onsetSample + i < signal.length; i++) re[i] = signal[onsetSample + i]
  fft(re, im)
  let total = 0
  let high = 0
  let weighted = 0
  for (let k = 1; k < size / 2; k++) {
    const f = (k * sampleRate) / size
    if (f < 100) continue
    const p = re[k] * re[k] + im[k] * im[k]
    total += p
    weighted += p * f
    if (f >= HF_SPLIT_HZ) high += p
  }

  return {
    onsetSample,
    riseTimeMs,
    hfRatio: total > 0 ? high / total : 0,
    spectralCentroidHz: total > 0 ? weighted / total : 0,
    peakDbfs: 10 * Math.log10(peak + 1e-12),
    snrDb: 10 * Math.log10((peak + 1e-12) / (noise + 1e-12)),
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** 0..1: broadband high-frequency content and a fast rise score as "sharp". */
export function sharpnessScore(features: Pick<TransientFeatures, 'riseTimeMs' | 'hfRatio'>): number {
  const hfScore = clamp01((features.hfRatio - 0.2) / 0.5)
  const riseScore = clamp01((6 - features.riseTimeMs) / 5)
  return 0.65 * hfScore + 0.35 * riseScore
}

export function classifyTransient(sharpness: number): AudioOnset['kind'] {
  if (sharpness >= 0.65) return 'contact'
  if (sharpness <= 0.35) return 'bounce'
  return 'unknown'
}

// ---------- detection entry point ----------

export interface OnsetDetail extends TransientFeatures {
  /** Onset time on the media timeline (seconds). */
  tMedia: number
  tReal: number
  strength: number
  sharpness: number
  kind: AudioOnset['kind']
}

export interface DetectOnsetOptions extends OnsetEnvelopeOptions, PeakPickOptions {
  /** Added to sample times to reach media time (e.g. -priming when the decoder kept it). */
  offsetS?: number
  /** Real seconds per media second (VideoMeta.timeScale). */
  timeScale?: number
  /** When false (e.g. rendered slow motion), every onset is labelled 'unknown'. */
  labelKinds?: boolean
}

export function detectOnsets(signal: Float32Array, sampleRate: number, options: DetectOnsetOptions = {}): OnsetDetail[] {
  const env = onsetEnvelope(signal, sampleRate, options)
  const peaks = pickPeaks(env, options)
  const offsetS = options.offsetS ?? 0
  const timeScale = options.timeScale ?? 1
  const labelKinds = options.labelKinds ?? true
  return peaks.map((frame) => {
    const approx = env.firstCenterSample + frame * env.hopSamples
    const features = transientFeatures(signal, env.filtered, sampleRate, approx)
    const tMedia = features.onsetSample / sampleRate + offsetS
    const sharpness = sharpnessScore(features)
    return {
      ...features,
      tMedia,
      tReal: tMedia * timeScale,
      strength: features.snrDb,
      sharpness,
      kind: labelKinds ? classifyTransient(sharpness) : 'unknown',
    }
  })
}

/** Contract shape (types.ts AudioOnset). */
export function toAudioOnsets(details: readonly OnsetDetail[]): AudioOnset[] {
  return details.map(({ tReal, strength, sharpness, kind }) => ({ tReal, strength, sharpness, kind }))
}

export interface AudioTimingAssessment {
  usable: boolean
  reason: string
}

/**
 * Rendered slow-motion clips carry audio that was time-stretched (or muted) with the
 * picture, so transients are smeared and their times are not real time.
 */
export function assessAudioTiming(meta: Pick<VideoMeta, 'hasAudio' | 'timeScale'>): AudioTimingAssessment {
  if (!meta.hasAudio) return { usable: false, reason: 'No audio track.' }
  if (Math.abs(meta.timeScale - 1) > 1e-3) {
    return {
      usable: false,
      reason: `Timeline is time-scaled (x${meta.timeScale}); slow-motion audio is stretched or silent, so contact timing from audio is unreliable.`,
    }
  }
  return { usable: true, reason: 'Real-time audio track.' }
}

// ---------- browser decoding ----------

export interface DecodedAudio {
  samples: Float32Array
  sampleRate: number
  /** Media time of samples[0]. 0 when the decoder already applied the edit list. */
  startTimeS: number
  method: 'webcodecs' | 'decodeAudioData'
  notes: string[]
}

/** Decodes the whole file's audio with the Web Audio API (resampled to sampleRate, mono). */
export async function decodeAudioFileData(bytes: ArrayBuffer, sampleRate = 48000): Promise<DecodedAudio> {
  if (typeof OfflineAudioContext !== 'function') throw new Error('OfflineAudioContext is not available.')
  const context = new OfflineAudioContext(1, 1, sampleRate)
  const buffer = await context.decodeAudioData(bytes.slice(0))
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  return {
    samples: mixToMono(channels),
    sampleRate: buffer.sampleRate,
    startTimeS: 0,
    method: 'decodeAudioData',
    notes: ['Browser decodeAudioData: whether AAC priming / edit lists are honoured depends on the browser.'],
  }
}

export function hasAudioDecoder(): boolean {
  return typeof AudioDecoder === 'function' && typeof EncodedAudioChunk === 'function'
}

/**
 * Decodes the audio track sample by sample with WebCodecs AudioDecoder, then applies
 * the edit list explicitly (drops AAC priming), so sample 0 is media time 0.
 */
export async function decodeAudioTrack(track: AudioTrackInfo, source: ByteSource): Promise<DecodedAudio> {
  if (!hasAudioDecoder()) throw new Error('WebCodecs AudioDecoder is not available.')
  const config: AudioDecoderConfig = {
    codec: track.codec,
    sampleRate: track.sampleRate,
    numberOfChannels: Math.max(1, track.channelCount),
  }
  if (track.description) config.description = track.description
  const support = await AudioDecoder.isConfigSupported(config)
  if (!support.supported) throw new Error(`AudioDecoder does not support ${track.codec}.`)

  const chunks: { timestampUs: number; mono: Float32Array; rate: number }[] = []
  let failure: unknown = null
  const decoder = new AudioDecoder({
    output: (data) => {
      try {
        const planes: Float32Array[] = []
        for (let c = 0; c < data.numberOfChannels; c++) {
          const plane = new Float32Array(data.numberOfFrames)
          data.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
          planes.push(plane)
        }
        chunks.push({ timestampUs: data.timestamp, mono: mixToMono(planes), rate: data.sampleRate })
      } finally {
        data.close()
      }
    },
    error: (error) => {
      failure = error
    },
  })
  decoder.configure(config)
  const first = track.samples[0]
  const last = track.samples[track.samples.length - 1]
  const bytes = await source.read(first.offset, last.offset + last.size - first.offset)
  for (const sample of track.samples) {
    if (failure) break
    const from = sample.offset - first.offset
    decoder.decode(
      new EncodedAudioChunk({
        type: 'key',
        timestamp: Math.round((sample.ctsTicks * 1e6) / track.timescale),
        duration: Math.round((sample.durationTicks * 1e6) / track.timescale),
        data: bytes.subarray(from, from + sample.size),
      }),
    )
    if (decoder.decodeQueueSize > 64) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await decoder.flush()
  decoder.close()
  if (failure) throw failure

  const rate = chunks[0]?.rate ?? track.sampleRate
  const totalEnd = chunks.reduce((max, c) => Math.max(max, Math.round((c.timestampUs * rate) / 1e6) + c.mono.length), 0)
  const all = new Float32Array(totalEnd)
  for (const chunk of chunks) all.set(chunk.mono, Math.round((chunk.timestampUs * rate) / 1e6))
  const skip = Math.min(all.length, Math.round(track.primingS * rate))
  return {
    samples: all.subarray(skip),
    sampleRate: rate,
    startTimeS: track.presentationOffsetS,
    method: 'webcodecs',
    notes: [`Edit list applied: dropped ${skip} priming samples (${(track.primingS * 1000).toFixed(2)} ms).`],
  }
}
