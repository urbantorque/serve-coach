/**
 * An analysis the page did not live to finish (L6.4).
 *
 * A phone that locks, or a browser short of memory, can discard a background
 * tab and reload it when the player comes back. The analysis that was running
 * is gone, and the player lands on the home screen with no idea whether it
 * finished, failed or never started. So a marker is left in
 * `sessionStorage` while an analysis runs and cleared however it ends; one
 * still there on the next load is an analysis that was cut off, and the home
 * screen says so once.
 *
 * `sessionStorage` rather than `localStorage`: it survives a reload of the
 * tab, which is the case here, and not a new tab opened tomorrow, which would
 * be a stale sentence about yesterday.
 */

const KEY = 'serve-coach:reading'

export interface Interrupted {
  fileName: string
  startedAt: number
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function tabStore(): Store | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

/** An analysis has started. */
export function markReading(fileName: string, now = Date.now(), store: Store | undefined = tabStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify({ fileName, startedAt: now }))
  } catch {
    // Storage refused: an interruption simply goes unexplained, as before.
  }
}

/** It ended — finished, refused, failed or cancelled. */
export function markRead(store: Store | undefined = tabStore()): void {
  try {
    store?.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The analysis the last page load did not finish, once: reading it clears it. */
export function takeInterrupted(store: Store | undefined = tabStore()): Interrupted | undefined {
  try {
    const raw = store?.getItem(KEY)
    store?.removeItem(KEY)
    if (!raw) return undefined
    const v = JSON.parse(raw) as Partial<Interrupted>
    return typeof v.fileName === 'string' && typeof v.startedAt === 'number'
      ? { fileName: v.fileName, startedAt: v.startedAt }
      : undefined
  } catch {
    return undefined
  }
}

/** What the home screen says about it. */
export function interruptedLine(): string {
  return 'Your last reading stopped part way, most likely because the screen locked. Pick the clip again to read it.'
}
