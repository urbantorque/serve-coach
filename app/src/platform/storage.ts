/**
 * Persistent storage (ARCHITECTURE §8.1 "PWA quota and eviction"; [A1] WebKit storage policy).
 * A browser may clear a site's data under storage pressure unless the site is persisted, and
 * `navigator.storage.persist()` is granted by the browser's own rules (Home Screen apps, bookmarks,
 * engagement). Serve Coach asks once, at the first saved session, with a one-line explanation, and the
 * player can ask again from Storage and privacy. The answer is kept in settings `storagePersisted`
 * (true | 'denied'; false = never asked) and as a usage event.
 */
import { getSetting, recordEvent, setSetting, showToast } from '../data/index.ts'

export interface StorageStatus {
  /** The browser offers navigator.storage.persist(). */
  canPersist: boolean
  /** Protected from automatic clean-up; null when the browser cannot say. */
  persisted: boolean | null
  /** Bytes this site uses and may use, as the browser estimates them; null when unknown. */
  usage: number | null
  quota: number | null
}

export type PersistResult = 'granted' | 'denied' | 'unsupported'

/** Fired on window after a request, so screens showing the status read it again. */
export const STORAGE_CHANGED_EVENT = 'serve-coach:storage-changed'

export const FIRST_SESSION_LINE = "We asked this browser to keep your sessions, so it doesn't clear them to free up space."

type StorageManagerLike = Pick<StorageManager, 'persist' | 'persisted' | 'estimate'>

function manager(): Partial<StorageManagerLike> | undefined {
  return (globalThis.navigator as Navigator | undefined)?.storage
}

export async function readStorageStatus(storage: Partial<StorageManagerLike> | undefined = manager()): Promise<StorageStatus> {
  if (!storage) return { canPersist: false, persisted: null, usage: null, quota: null }
  const [persisted, estimate] = await Promise.all([
    storage.persisted?.().catch(() => undefined),
    storage.estimate?.().catch(() => undefined),
  ])
  return {
    canPersist: typeof storage.persist === 'function',
    persisted: typeof persisted === 'boolean' ? persisted : null,
    usage: typeof estimate?.usage === 'number' ? estimate.usage : null,
    quota: typeof estimate?.quota === 'number' && estimate.quota > 0 ? estimate.quota : null,
  }
}

/** Asks the browser to persist this site's storage, and records the answer. Never throws. */
export async function requestPersistence(
  from: 'first-session' | 'storage-screen',
  storage: Partial<StorageManagerLike> | undefined = manager(),
): Promise<PersistResult> {
  let result: PersistResult = 'unsupported'
  try {
    if (storage?.persist) result = (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    result = 'denied'
  }
  try {
    if (result !== 'unsupported') await setSetting('storagePersisted', result === 'granted' ? true : 'denied')
    await recordEvent('storage_persist_requested', { result, from })
  } catch {
    // Settings unavailable: the status line still reads the browser directly.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORAGE_CHANGED_EVENT, { detail: result }))
  return result
}

/**
 * The first saved session: explain in one line, then ask. Asks only once (a denial is not repeated
 * automatically), and says nothing when the site is already persisted or the browser has no API.
 */
export async function persistAtFirstSession(storage: Partial<StorageManagerLike> | undefined = manager()): Promise<PersistResult | 'skipped'> {
  try {
    if ((await getSetting('storagePersisted')) !== false) return 'skipped'
    if (!storage?.persist) return 'skipped'
    if ((await storage.persisted?.().catch(() => false)) === true) {
      await setSetting('storagePersisted', true)
      return 'skipped'
    }
  } catch {
    return 'skipped'
  }
  showToast(FIRST_SESSION_LINE)
  return requestPersistence('first-session', storage)
}

/** "1.2 GB", "340 MB": decimal units as phones show storage (same rule as Storage and privacy). */
function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${n / 1e6 >= 10 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)} MB`
  return `${Math.round(n / 1e3)} KB`
}

/** One line for Storage and privacy: what the browser allows and how much of it is used. */
export function storageEstimateLine(s: Pick<StorageStatus, 'usage' | 'quota'>): string {
  if (s.quota === null) return "This browser doesn't say how much space Serve Coach may use."
  const used = s.usage ?? 0
  const share = used / s.quota
  const pct = share > 0 && share < 0.01 ? 'under 1%' : `${Math.round(share * 100)}%`
  return `This browser lets Serve Coach use up to about ${bytes(s.quota)}. In use: ${bytes(used)} (${pct}).`
}
