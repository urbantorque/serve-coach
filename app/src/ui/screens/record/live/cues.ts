/**
 * Serving-spot states and their cues (CAPTURE §9.7, DESIGN §10.3 R4): one word, one glyph kind and
 * one instruction per state, plus the chime, low tone and optional spoken phrase. The mapping is
 * pure and unit-tested; the audio functions do nothing where Web Audio or speech is missing.
 */
import type { LiveEvaluation } from './framing.ts'

export type SpotKind = 'ready' | 'change' | 'toss'

export interface SpotState {
  kind: SpotKind
  /** One word, readable from the serving spot: "Ready", "Back", "Higher", "Closer", "Level", "Still", "Step in". */
  word: string
  /** The instruction line under the word. */
  line: string
}

/** The R4 state for the current evaluation. */
export function spotStateFor(evaluation: Pick<LiveEvaluation, 'ready' | 'instruction'>): SpotState {
  if (evaluation.ready || !evaluation.instruction) return { kind: 'ready', word: 'Ready', line: 'Walk back and tap Record' }
  const { checkId, text } = evaluation.instruction
  const lower = text.toLowerCase()
  let word = 'Phone'
  if (checkId === 'in-frame') word = 'Step in'
  else if (checkId === 'steady') word = 'Still'
  else if (checkId === 'level') word = 'Level'
  else if (lower.startsWith('raise')) word = 'Higher'
  else if (lower.includes('closer')) word = 'Closer'
  else if (lower.includes('back')) word = 'Back'
  return { kind: 'change', word, line: text }
}

type AudioCtor = typeof AudioContext
let audio: AudioContext | null = null

function context(): AudioContext | null {
  if (audio) return audio
  const Ctor = (globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext ??
    (globalThis as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  if (!Ctor) return null
  try {
    audio = new Ctor()
  } catch {
    audio = null
  }
  return audio
}

/** Unlocks audio from a tap (iOS plays nothing until a gesture has resumed the context). */
export function primeAudio(): void {
  void context()?.resume().catch(() => undefined)
}

function tone(freq: number, startS: number, durS: number, gain = 0.18): void {
  const ctx = context()
  if (!ctx) return
  const osc = ctx.createOscillator()
  const amp = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  const t0 = ctx.currentTime + startS
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.02)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + durS)
  osc.connect(amp).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + durS + 0.05)
}

/** Two-tone chime for Ready and for the start of recording. */
export function chime(): void {
  tone(660, 0, 0.25)
  tone(990, 0.18, 0.4)
}

/** Single low tone: "needs a change". */
export function lowTone(): void {
  tone(330, 0, 0.35, 0.14)
}

/** Countdown beep. */
export function beep(): void {
  tone(880, 0, 0.12, 0.12)
}

/** Optional spoken phrase, en-AU voice where available (CAPTURE §9.7). */
export function speak(text: string): void {
  const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
  try {
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-AU'
    const voice = synth.getVoices().find((v) => v.lang === 'en-AU')
    if (voice) u.voice = voice
    u.rate = 1
    synth.speak(u)
  } catch {
    // Speech is an extra; the screen already shows the state.
  }
}
