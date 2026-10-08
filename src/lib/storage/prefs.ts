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
  /**
   * The player's own rating, on the ladder in `analysis/tiers.ts`.
   *
   * Optional and stays optional: the diagnostic pass estimates one from the
   * serve when it is absent, and a wrong guess low is a target the player
   * clears rather than one they cannot. Stored rather than asked for on every
   * analysis because a rating changes over a season, not over a session.
   */
  tier?: number
  /** Whether the filming guide has been shown unprompted. */
  seenFilmingGuide: boolean
  /** Whether persistent storage has been requested from the browser. */
  askedToPersist: boolean
  /**
   * Which rung of each fault's ladder the player is on, zero-based — see
   * `analysis/progressions.ts`. Absent for a fault means the rung the report's
   * own drill sits on. Moved only by the player, from the report.
   */
  ladder?: Partial<Record<string, number>>
  /**
   * Read the glance aloud after each serve, with a voice on this device
   * (`lib/speech.ts`). Off until the player turns it on, from the glance.
   */
  speakGlance?: boolean
}

const KEY = 'serve-coach-prefs'

export const DEFAULTS: Prefs = {
  serveType: 'flat',
  seenFilmingGuide: false,
  askedToPersist: false,
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
