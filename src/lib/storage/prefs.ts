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

import type { ActiveSet, SetResult } from '../sets'

/** How often a player gets to a court. */
export type Cadence = 'weekly' | 'fortnightly' | 'monthly'

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
   * When each fault's ladder was last moved (N1.3). A trip's drill check counts
   * only serves filmed since, so serves on the step below never pass this one.
   */
  ladderMovedAt?: Partial<Record<string, number>>
  /**
   * Read the glance aloud after each serve, with a voice on this device
   * (`lib/speech.ts`). Off until the player turns it on, from the glance.
   */
  speakGlance?: boolean
  /**
   * Keep each analysed clip on this device, so a reopened report plays the
   * real video (`storage/clipStore.ts`, D6.4). Off until the player turns it
   * on, in Settings; the store refuses to write without it.
   */
  keepClips?: boolean
  /**
   * How often the player gets to a court, when they have said (L3.6). The
   * streak is counted at this pace; absent, it is read off their visits.
   */
  cadence?: Cadence
  /** A set of serves under way on the glance (L3.7). */
  activeSet?: ActiveSet
  /** Finished sets, oldest first, the newest `SETS_KEPT`: the records live here. */
  sets?: SetResult[]
  /** When the history was last exported to a file (L6.5). */
  lastExportedAt?: number
  /** When "Not now" was tapped on the move from Safari (L6.5). */
  moveQuietedAt?: number
  /** The viewfinder starts on a countdown and stops itself (N1.1). */
  handsFree?: boolean
  /** How many serves a hands-free recording stops after (N1.1). */
  handsFreeServes?: 1 | 6
  /** The viewfinder says its verdict aloud (N1.2). */
  speakFraming?: boolean
  /** How long the player usually has on court, for today's plan (N1.6). */
  courtMinutes?: 30 | 45 | 60
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
