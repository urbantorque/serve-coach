/**
 * Small, durable answers to questions the app should only ask once.
 *
 * Kept in `localStorage` rather than IndexedDB deliberately: these are a few
 * dozen bytes that need to be readable synchronously during the first render,
 * and putting them behind an async database means the first paint has to guess
 * and then correct itself. They are also the settings it would be least harmful
 * to lose — an answer re-asked is an annoyance, a lost training history is not.
 *
 * Every read is defensive. `localStorage` throws rather than returning null in
 * Safari private mode and when a site is denied storage, and a preference nobody
 * can read must not be able to take the app down on load.
 */

export type Handedness = 'right' | 'left'
export type ServeType = 'flat' | 'kick' | 'slice'

export interface Prefs {
  /** Which hand holds the racket. Asked once; the detector then cross-checks it. */
  handedness?: Handedness
  /** What the player is practising, which shifts a few target bands. */
  serveType: ServeType
  /** Whether the filming guide has been shown unprompted. */
  seenFilmingGuide: boolean
  /** Whether persistent storage has been requested from the browser. */
  askedToPersist: boolean
  /** Whether the "add to home screen" nudge has been dismissed. */
  dismissedInstallPrompt: boolean
}

const KEY = 'serve-coach-prefs'

export const DEFAULTS: Prefs = {
  serveType: 'flat',
  seenFilmingGuide: false,
  askedToPersist: false,
  dismissedInstallPrompt: false,
}

export function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    // Spread over the defaults rather than trusting the stored shape: a key
    // added in a later version is simply absent from anything written before it.
    return { ...DEFAULTS, ...(typeof parsed === 'object' && parsed !== null ? parsed : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage denied or full. The value still applies for this session.
  }
  return next
}
