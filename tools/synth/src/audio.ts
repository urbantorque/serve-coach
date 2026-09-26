import type { Camera } from './camera.ts'
import type { ClipMotion } from './kinematics/motion.ts'
import { childSeed, gaussian, mulberry32 } from './math/random.ts'
import { dist, type Vec3 } from './math/vec.ts'
import { legLandmarks } from './metrics.ts'

/**
 * Synthetic audio track. Every sound is emitted at a known real time and position, travels to the
 * camera at the speed of sound (so it arrives distance / 343 m/s later), is attenuated as 1/r and is
 * placed with sub-sample accuracy: the waveform is exactly zero before its arrival time. Levels are
 * peak amplitudes at 1 m (full scale = 1).
 */

export const SPEED_OF_SOUND_MS = 343
export const AUDIO_SAMPLE_RATE = 48000

export type SoundKind = 'contact' | 'bounce' | 'bounce-secondary' | 'dribble' | 'footstep' | 'distractor'

export interface SoundEvent {
  kind: SoundKind
  /** Serve index within the clip, null for distractors. */
  serveIndex: number | null
  /** Emission time, absolute motion time (s). */
  emitS: number
  position: Vec3
  distanceM: number
  /** Arrival at the camera microphone, absolute motion time (s). */
  arrivalS: number
  /** Peak amplitude at the microphone (full scale 1). */
  peak: number
}

const LEVEL_AT_1M: Record<SoundKind, number> = {
  contact: 1.2,
  bounce: 0.45,
  'bounce-secondary': 0.3,
  dribble: 0.3,
  footstep: 0.08,
  distractor: 1.2,
}

function event(kind: SoundKind, serveIndex: number | null, emitS: number, position: Vec3, camAt: (t: number) => Camera): SoundEvent {
  const d = Math.max(0.5, dist(position, camAt(emitS).extrinsics.position))
  return { kind, serveIndex, emitS, position, distanceM: d, arrivalS: emitS + d / SPEED_OF_SOUND_MS, peak: LEVEL_AT_1M[kind] / d }
}

/** First-contact times of later bounces in a sampled trajectory (vz flips from - to + near the floor). */
function secondaryBounces(traj: { samples: { t: number; p: Vec3; v: Vec3 }[] }, radiusM: number, maxCount: number): { t: number; p: Vec3 }[] {
  const out: { t: number; p: Vec3 }[] = []
  const s = traj.samples
  for (let i = 1; i < s.length && out.length < maxCount; i++) {
    if (s[i - 1].v[2] < -0.3 && s[i].v[2] > 0.3 && s[i].p[2] <= radiusM + 1e-6) out.push({ t: s[i].t, p: [s[i].p[0], s[i].p[1], 0] })
  }
  return out
}

/** All sounds of a clip (serve hits, bounces, dribbles, landing footsteps, optional distractors). */
export function collectSoundEvents(
  clip: ClipMotion,
  camAt: (t: number) => Camera,
  opts: { distractorsPerMinute?: number; seed: number; startS: number; endS: number },
): SoundEvent[] {
  const out: SoundEvent[] = []
  const w = (p: Vec3) => clip.toWorld(p)
  const legs = legLandmarks(clip.handedness)
  clip.plans.forEach((plan, k) => {
    const T = plan.times
    out.push(event('contact', k, T.contactS, w(plan.contact), camAt))
    out.push(event('bounce', k, T.bounceS, w(plan.flight.bounce), camAt))
    for (const b of secondaryBounces(plan.flight.afterBounce, 0.0335, 2)) out.push(event('bounce-secondary', k, b.t, w(b.p), camAt))
    for (const d of plan.dribbles) out.push(event('dribble', k, d.tFloorS, w([d.hand[0], d.hand[1], 0]), camAt))
    const land = clip.pose(T.landingS)
    out.push(event('footstep', k, T.landingS, land.lm[legs.front.toe], camAt))
    out.push(event('footstep', k, T.landingS + 0.3, clip.pose(T.landingS + 0.3).lm[legs.back.toe], camAt))
  })
  const perMin = opts.distractorsPerMinute ?? 0
  if (perMin > 0) {
    const rng = mulberry32(childSeed(opts.seed, 'distractors'))
    let t = opts.startS
    for (;;) {
      t += (-Math.log(Math.max(1e-9, rng())) * 60) / perMin
      if (t >= opts.endS) break
      // A hit on a neighbouring court, 20-45 m away.
      const r = 20 + 25 * rng()
      const a = 2 * Math.PI * rng()
      const cam = camAt(t).extrinsics.position
      out.push(event('distractor', null, t, [cam[0] + r * Math.cos(a), cam[1] + r * Math.sin(a), 1.2], camAt))
    }
  }
  return out.sort((x, y) => x.arrivalS - y.arrivalS)
}

/** Deterministic unit-variance noise sample for (event seed, sample index). */
function noiseAt(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h / 4294967296) * 3.4641 - 1.732 // uniform with unit variance
}

/** Waveform value `tau` seconds after arrival (0 for tau < 0), before level scaling. */
export function soundShape(kind: SoundKind, tau: number, noise: number): number {
  if (tau < 0) return 0
  const ring = (f: number, decayS: number, phase = 0) => Math.sin(2 * Math.PI * f * tau + phase) * Math.exp(-tau / decayS)
  switch (kind) {
    case 'contact':
    case 'distractor': {
      // Racket-ball impact: broadband click plus string-bed and frame ringing. 0.1 ms attack.
      const attack = Math.min(1, tau / 0.0001)
      return attack * (0.55 * noise * Math.exp(-tau / 0.0012) + 0.5 * ring(1150, 0.006, 0.4) + 0.35 * ring(2700, 0.003, 1.1) + 0.25 * ring(560, 0.012, 0.2))
    }
    case 'bounce':
    case 'bounce-secondary':
    case 'dribble': {
      // Ball on court: low thud with a softer 1.5 ms rise.
      const attack = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, tau / 0.0015))
      return attack * (0.8 * ring(190, 0.014) + 0.4 * ring(420, 0.007, 1) + 0.25 * noise * Math.exp(-tau / 0.003))
    }
    case 'footstep': {
      const attack = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, tau / 0.004))
      return attack * (0.6 * noise * Math.exp(-tau / 0.02) + 0.5 * ring(95, 0.03))
    }
  }
}

/** Peak magnitude of each shape (for level normalisation), measured once. */
const SHAPE_PEAK: Record<SoundKind, number> = (() => {
  const out = {} as Record<SoundKind, number>
  for (const k of ['contact', 'bounce', 'bounce-secondary', 'dribble', 'footstep', 'distractor'] as SoundKind[]) {
    let m = 0
    for (let i = 0; i < 4800; i++) m = Math.max(m, Math.abs(soundShape(k, i / AUDIO_SAMPLE_RATE, 1.732)))
    out[k] = m
  }
  return out
})()

export interface AudioRenderOptions {
  sampleRate?: number
  /** Media duration (s). */
  durationMediaS: number
  /** Real seconds per media second. */
  timeScale: number
  /** Absolute motion time of media time 0. */
  t0S: number
  backgroundDbfs: number
  /** Add a 100/200 Hz floodlight hum (night scenes). */
  hum: boolean
  seed: number
}

/**
 * Mix the events into a mono track in MEDIA time: an event arriving at real time t is placed at
 * media time (t - t0) / timeScale. Sound shapes are not time-stretched for slow-motion media.
 */
export function renderAudio(events: SoundEvent[], o: AudioRenderOptions): Float32Array {
  const sr = o.sampleRate ?? AUDIO_SAMPLE_RATE
  const n = Math.ceil(o.durationMediaS * sr)
  const out = new Float32Array(n)
  // Background: white noise shaped by two one-pole low-passes (wind/traffic rumble plus hiss).
  const rng = mulberry32(childSeed(o.seed, 'audio-bg'))
  const target = 10 ** (o.backgroundDbfs / 20)
  let lp1 = 0
  let lp2 = 0
  const a1 = Math.exp((-2 * Math.PI * 300) / sr)
  const a2 = Math.exp((-2 * Math.PI * 40) / sr)
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const wv = gaussian(rng)
    lp1 = a1 * lp1 + (1 - a1) * wv
    lp2 = a2 * lp2 + (1 - a2) * wv
    const v = 0.35 * wv + 2.2 * lp1 + 6 * lp2
    out[i] = v
    sumSq += v * v
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n))
  const g = rms > 0 ? target / rms : 0
  for (let i = 0; i < n; i++) out[i] *= g
  if (o.hum) {
    const h = 10 ** (-58 / 20)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      out[i] += h * (Math.sin(2 * Math.PI * 100 * t) + 0.5 * Math.sin(2 * Math.PI * 200 * t + 0.7))
    }
  }
  // Events.
  events.forEach((e, idx) => {
    const tMedia = (e.arrivalS - o.t0S) / o.timeScale
    const lengthS = e.kind === 'footstep' ? 0.2 : 0.12
    const i0 = Math.max(0, Math.ceil(tMedia * sr))
    const i1 = Math.min(n, Math.ceil((tMedia + lengthS) * sr))
    const seed = childSeed(o.seed, `ev${idx}`)
    const scale = e.peak / SHAPE_PEAK[e.kind]
    for (let i = i0; i < i1; i++) out[i] += scale * soundShape(e.kind, i / sr - tMedia, noiseAt(seed, i - i0))
  })
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]))
  return out
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate = AUDIO_SAMPLE_RATE): Buffer {
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8, 'ascii')
  h.write('fmt ', 12, 'ascii')
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

export const toDbfs = (amplitude: number): number => 20 * Math.log10(Math.max(1e-12, amplitude))
