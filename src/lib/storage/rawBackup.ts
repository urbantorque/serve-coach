/**
 * A backup the crash screen can take when nothing else works (L6.8).
 *
 * The likeliest crash is a stored record the app can no longer read, and the
 * crash screen's way out was to delete every record. The ordinary export
 * reads through the same storage layer that may be what crashed, so this one
 * does not: it opens the database with plain IndexedDB, takes every store as
 * it lies, unchecked, and hands it over as a file in the backup's own shape.
 * A restore then reads it through the normal import, which checks each record
 * and keeps what it can.
 *
 * Loaded only when the button is pressed, so the crash screen costs the app's
 * first load nothing.
 */

const DB_NAME = 'serve-coach'
const PREFS_KEY = 'serve-coach-prefs'

/** Each store, to the field a backup carries it in. */
const FIELDS: Record<string, string> = {
  sessions: 'sessions',
  practice: 'practice',
  serveTags: 'tags',
  practiceSessions: 'practiceSessions',
  tripLedger: 'trips',
}

/**
 * The backup file's contents from the stores as they lie. Pure, so it can be
 * held to the backup format without a database.
 */
export function backupFromStores(
  stores: Record<string, unknown[]>,
  exportedAt: number,
  prefs?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    format: 'serve-coach-backup',
    version: 1,
    exportedAt,
    sessions: [],
  }
  for (const [store, rows] of Object.entries(stores)) {
    const field = FIELDS[store]
    if (field && Array.isArray(rows)) out[field] = rows
  }
  // Who the player is travels as an ordinary backup carries it.
  if (prefs) {
    const picked = Object.fromEntries(
      ['handedness', 'tier', 'serveType', 'sets'].filter((k) => prefs[k] !== undefined).map((k) => [k, prefs[k]]),
    )
    if (Object.keys(picked).length) out.prefs = picked
  }
  return out
}

/** Every store, read raw. Empty where there is no database to read. */
function readStores(idb: IDBFactory): Promise<Record<string, unknown[]>> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = idb.open(DB_NAME)
    } catch {
      resolve({})
      return
    }
    // No version asked for, so an existing database opens as it is; one that
    // does not exist would be created, and that is refused here.
    req.onupgradeneeded = () => req.transaction?.abort()
    req.onerror = () => resolve({})
    req.onsuccess = () => {
      const db = req.result
      const names = [...db.objectStoreNames].filter((n) => n in FIELDS)
      if (!names.length) {
        db.close()
        resolve({})
        return
      }
      const tx = db.transaction(names, 'readonly')
      const out: Record<string, unknown[]> = {}
      for (const n of names) {
        const all = tx.objectStore(n).getAll()
        all.onsuccess = () => {
          out[n] = all.result as unknown[]
        }
      }
      tx.oncomplete = () => {
        db.close()
        resolve(out)
      }
      tx.onerror = () => {
        db.close()
        resolve(out)
      }
    }
  })
}

/** Read everything and hand it to the player as a file. Returns how many reports it held. */
export async function saveRawBackup(): Promise<number> {
  const stores = await readStores(indexedDB)
  let prefs: Record<string, unknown> | undefined
  try {
    prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') ?? undefined
  } catch {
    prefs = undefined
  }
  const now = Date.now()
  const backup = backupFromStores(stores, now, prefs)
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  a.href = url
  a.download = `serve-coach-rescue-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return (backup.sessions as unknown[]).length
}
