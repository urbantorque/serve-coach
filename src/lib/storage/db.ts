import { readoutOf, targetOf } from '../analysis/anatomy'
import type { Analysis } from '../analysis/types'

/**
 * A saved report. Deliberately excludes `frames` and the video itself: the
 * numbers and the six keyframe stills are what you want weeks later, and
 * keeping clips would put hundreds of megabytes of video on the device for no
 * benefit. Nothing here ever leaves the phone.
 */
export type Session = Omit<Analysis, 'frames'>

const DB_NAME = 'serve-coach'
const DB_VERSION = 1
const STORE = 'sessions'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  const attempt = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open local storage'))
  })
  // A failed open must not poison the rest of the session. Safari in particular
  // rejects transiently after the app is backgrounded — caching that rejection
  // would leave history empty and every save a silent no-op until a full
  // reload, when the very next attempt would have succeeded.
  attempt.catch(() => {
    if (dbPromise === attempt) dbPromise = null
  })
  dbPromise = attempt
  return attempt
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        const fail = () => reject(t.error ?? req.error ?? new Error('Local storage write failed'))
        if (mode === 'readonly') {
          req.onsuccess = () => resolve(req.result)
          req.onerror = fail
        } else {
          // A write only counts once the transaction durably commits. The
          // request's own success fires first, and a quota failure can still
          // abort the commit after it — resolving there would report success
          // for a report that was never stored, and the quota-retry path in
          // `saveSession` would never see the error it exists to handle.
          t.oncomplete = () => resolve(req.result)
          t.onabort = fail
          t.onerror = fail
        }
      }),
  )
}

/** Reports kept in full. Beyond this the oldest are dropped entirely. */
const MAX_SESSIONS = 60
/** Reports that keep their keyframe stills. Older ones keep only their numbers. */
const KEEP_STILLS = 20

const isQuotaError = (err: unknown) =>
  err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)

const stripStills = (s: Session): Session => ({
  ...s,
  phases: s.phases.map(({ thumbnail: _t, ...phase }) => phase),
})

/**
 * Keep history bounded without throwing away what makes it useful.
 *
 * Nearly all of a stored report's size is its six keyframe JPEGs, and those are
 * the part nobody revisits after a few weeks — while the numbers are what the
 * trend chart and the practice advice are built from. So the stills go first and
 * the measurements survive far longer, which is the opposite of what deleting
 * whole reports oldest-first would do.
 */
async function prune(aggressive = false): Promise<void> {
  const raw = await tx<unknown[]>('readonly', (s) => s.getAll() as IDBRequest<unknown[]>)

  const all: Session[] = []
  for (const row of raw) {
    const s = normalise(row)
    if (s) {
      all.push(s)
      continue
    }
    // A row that cannot even be read still occupies quota, and `listSessions`
    // hides it — so a store full of corrupt rows would defeat the quota
    // recovery entirely, with every retry failing against bytes nothing can
    // free. Under quota pressure they go first; otherwise they are left alone,
    // since an unreadable row may simply belong to a newer version of the app.
    const id = (row as { id?: unknown } | null)?.id
    if (aggressive && typeof id === 'string') {
      await tx('readwrite', (store) => store.delete(id))
    }
  }
  all.sort((a, b) => b.createdAt - a.createdAt)

  const keepStills = aggressive ? 5 : KEEP_STILLS
  const keepAll = aggressive ? 25 : MAX_SESSIONS

  for (const doomed of all.slice(keepAll)) {
    await tx('readwrite', (store) => store.delete(doomed.id))
  }

  for (const s of all.slice(keepStills, keepAll)) {
    if (s.phases.some((p) => p.thumbnail)) {
      await tx('readwrite', (store) => store.put(stripStills(s)))
    }
  }
}

export async function saveSession(analysis: Analysis): Promise<void> {
  const { frames: _frames, ...session } = analysis
  void _frames

  try {
    await tx('readwrite', (s) => s.put(session))
  } catch (err) {
    if (!isQuotaError(err)) throw err
    // Out of room. Free some and try once more, rather than silently losing the
    // report the player just recorded.
    await prune(true)
    await tx('readwrite', (s) => s.put(session))
  }

  await prune()
}

/**
 * Bring a stored report up to the shape the current app expects.
 *
 * Reports outlive the code that wrote them. A field added in a later version —
 * `serves` was — is simply absent from everything saved before it, and a
 * component that reaches through it takes the whole app down with no way back,
 * because a dead render cannot offer to clear the bad data either. So anything
 * readable is repaired with sensible defaults, and only a report missing the
 * parts that carry actual meaning is dropped.
 */
export function normalise(raw: unknown): Session | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const s = raw as Partial<Session> & Record<string, unknown>

  const areas = s.fundamentals
  if (
    typeof s.id !== 'string' ||
    typeof s.createdAt !== 'number' ||
    typeof s.overall !== 'number' ||
    !Array.isArray(areas) ||
    areas.length === 0
  ) {
    return undefined
  }

  // Repair the inside of each area too, not just the top level. A fundamental
  // whose `metrics` is missing or not an array survives every check above and
  // then throws the moment the report renders — which is precisely the failure
  // the ErrorBoundary exists to catch, and precisely the one worth never
  // reaching it.
  const fundamentals = areas
    .filter((f): f is Session['fundamentals'][number] => typeof f?.id === 'string')
    .map((f) => ({
      ...f,
      label: f.label ?? f.id,
      score: typeof f.score === 'number' ? f.score : 0,
      status: f.status ?? 'fair',
      blurb: f.blurb ?? '',
      headline: f.headline ?? '',
      // Reports filed before the app spoke in body positions carry numbers and
      // no readout, and the card would render a blank where the position goes.
      // The ladder is a pure function of the value, so it can be filled in now
      // rather than leaving an old report looking broken.
      metrics: Array.isArray(f.metrics)
        ? f.metrics
            .filter((m) => typeof m?.id === 'string' && typeof m.score === 'number')
            .map((m) => ({
              ...m,
              readout: m.readout ?? readoutOf(m.id, m.value),
              target: m.target ?? (m.ideal ? targetOf(m.id, m.ideal) : ''),
            }))
        : [],
      drill: f.drill ?? { name: '', how: '', reps: '' },
    }))

  if (fundamentals.length === 0) return undefined

  return {
    ...(s as Session),
    fundamentals,
    overallStatus: s.overallStatus ?? 'fair',
    // Element-checked, not just array-checked: a null slipped in by a
    // hand-edited backup would throw in every consumer that reaches for
    // `p.thumbnail`.
    phases: Array.isArray(s.phases)
      ? s.phases.filter((p): p is Session['phases'][number] => typeof p === 'object' && p !== null)
      : [],
    serves: s.serves ?? { count: 1, index: 0 },
    window: s.window ?? { start: 0, end: 0 },
    scale: s.scale ?? { bodyHeight: 0, groundY: 0 },
    // Everything filed before serve types existed was scored against the flat
    // bands, which is exactly what 'flat' means.
    serveType: s.serveType ?? 'flat',
    video: s.video ?? { name: 'Your serve', durationMs: 0, width: 0, height: 0 },
    handedness: s.handedness ?? 'right',
    quality: s.quality ?? {
      confidence: 0.5,
      warnings: [],
      view: 'angled',
      sampledFps: 30,
      swingSamples: 0,
    },
    focus: s.focus ?? {
      title: 'Keep filming',
      why: 'This report was saved by an older version of the app, so some detail is missing.',
      drill: { name: '', how: '', reps: '' },
    },
  }
}

export async function listSessions(): Promise<Session[]> {
  const all = await tx<unknown[]>('readonly', (s) => s.getAll() as IDBRequest<unknown[]>)
  return all
    .map(normalise)
    .filter((s): s is Session => s !== undefined)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteSession(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

export async function clearSessions(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
}

/** Storage is best-effort: history is a convenience, never a blocker. */
export async function safely<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await op()
  } catch {
    return fallback
  }
}
