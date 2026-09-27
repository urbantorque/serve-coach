/**
 * One-time, per-device conveniences for the Record flow: the camera pre-alert, "Filming at the
 * courts" and the first-import rights reminder (CAPTURE §7.1, §11.2 step 7; DESIGN §10.3). These are
 * not records: losing them only means a note shows again, so localStorage is enough, and every read
 * and write is guarded (private mode and blocked site data throw).
 */
const PREFIX = 'serve-coach:seen:'

export type SeenKey = 'camera-prealert' | 'filming-etiquette' | 'import-rights' | 'full-setup-guide'

export function hasSeen(key: SeenKey): boolean {
  try {
    return globalThis.localStorage?.getItem(PREFIX + key) === '1'
  } catch {
    return false
  }
}

export function markSeen(key: SeenKey): void {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, '1')
  } catch {
    // Showing the note again next time is harmless.
  }
}
