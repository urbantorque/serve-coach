/**
 * The glance read aloud (D6.2) — by a voice on this device, or not at all.
 *
 * `speechSynthesis` is not one thing. Some of the voices a browser offers run
 * on the phone; others send the text to the browser maker's servers and play
 * back what comes back — Chrome's "Google" voices are the common case, and they
 * say so with `localService: false`. A spoken summary of somebody's serve is
 * exactly the data this app promises never leaves the device, so this speaks
 * only through a voice that reports itself local, and is silent otherwise.
 * Silent, not degraded: there is no fallback to the default voice, because the
 * default voice can be a remote one. `egress.test.ts` holds speech to this file.
 */
import { plain } from './analysis/voice'

/** What a voice says about itself that decides whether it may be used. */
export type VoiceInfo = Pick<SpeechSynthesisVoice, 'localService' | 'lang' | 'default'>

/**
 * The on-device voice to read with, or none.
 *
 * Only `localService` voices. Among those: the player's own language and
 * region, then their language in any region, then the system default, then
 * any local voice at all — a summary in a neighbouring accent beats silence,
 * a summary sent to a server does not.
 */
export function pickLocalVoice<V extends VoiceInfo>(voices: readonly V[], lang: string): V | undefined {
  const local = voices.filter((v) => v.localService)
  const want = lang.toLowerCase()
  const base = want.split('-')[0]
  return (
    local.find((v) => v.lang.toLowerCase() === want) ??
    local.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base) ??
    local.find((v) => v.default) ??
    local[0]
  )
}

/**
 * Say `text` with an on-device voice, replacing anything still being said.
 * Returns whether anything was spoken.
 */
export function speakLocally(text: string, lang?: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  if (typeof SpeechSynthesisUtterance === 'undefined') return false
  const synth = window.speechSynthesis
  const voice = pickLocalVoice(synth.getVoices(), lang ?? navigator.language ?? 'en')
  if (!voice) return false
  const utterance = new SpeechSynthesisUtterance(plain(text))
  utterance.voice = voice
  utterance.lang = voice.lang
  synth.cancel()
  synth.speak(utterance)
  return true
}

/** Stop whatever is being said — leaving the screen, or turning the voice off. */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}

/** Whether this device has a voice of its own to read with, right now. */
export function hasLocalVoice(lang?: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false
  return pickLocalVoice(window.speechSynthesis.getVoices(), lang ?? navigator.language ?? 'en') !== undefined
}

/**
 * Call `then` when the browser's voice list changes — Chrome fills it in after
 * the page loads, so a first `getVoices()` can be empty. Returns the unsubscribe.
 */
export function onVoicesChanged(then: () => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return () => {}
  const synth = window.speechSynthesis
  synth.addEventListener('voiceschanged', then)
  return () => synth.removeEventListener('voiceschanged', then)
}
