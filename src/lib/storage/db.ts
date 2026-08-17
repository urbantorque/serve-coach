import { keyframesFromTrack, readKeyframePoses, readSwingTrack } from './poseTrack'
import { readoutOf, targetOf } from '../analysis/anatomy'
// The table the screens index by `serveType`. Imported rather than restated as
// a list of three names, so a fourth serve type cannot be readable on the
// report and unreadable on the way out of storage.
import { SERVE_TYPES } from '../analysis/coaching'
import { LEGACY_SCORING_VERSION, SCORING_VERSION, type Analysis } from '../analysis/types'

/**
 * A saved report. Deliberately excludes `frames` and the video itself: the
 * numbers and the six keyframe stills are what you want weeks later, and
 * keeping clips would put hundreds of megabytes of video on the device for no
 * benefit. Nothing here ever leaves the phone.
 */
export type Session = Omit<Analysis, 'frames'>

const DB_NAME = 'serve-coach'
const DB_VERSION = 2
const STORE = 'sessions'

/**
 * What the player did, as opposed to what the camera measured.
 *
 * A second store rather than a field on a report, for three reasons that all
 * point the same way.
 *
 * It has to outlive the report it was assigned from. Correcting the handedness,
 * changing the serve type or flicking to another serve all re-run the pipeline
 * and call `saveSession` with a fresh `Analysis` — which carries no player-side
 * anything — so a field on the row would be silently erased by the most ordinary
 * thing a player does on the report screen. Preserving it would mean reading the
 * row back before every save, and nearly all of a row is base64 keyframe images:
 * the exact cost the routine prune was rewritten to stop paying.
 *
 * It has a different lifetime. Reports are pruned to sixty and lose their stills
 * at twenty; a record of having done a drill is a few dozen bytes and there is
 * no reason for it to die with the report that suggested it.
 *
 * And `Session` stays `Omit<Analysis, 'frames'>` exactly. What the camera
 * measured and what the player says they did are different kinds of claim, and
 * the type has been saying so.
 */
const PRACTICE_STORE = 'practice'

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
      // Guarded on existence rather than on the version being upgraded from,
      // so a database at any earlier version — including one this app has never
      // seen because the player restored a profile — arrives with both stores.
      if (!db.objectStoreNames.contains(PRACTICE_STORE)) {
        const store = db.createObjectStore(PRACTICE_STORE, { keyPath: 'id' })
        store.createIndex('doneAt', 'doneAt')
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // A connection can die while we are still holding it, and a cached dead
      // one is worse than no cache: every later transaction throws
      // `InvalidStateError` for the rest of the session, so history stops
      // loading and every save is a silent no-op until a full reload. Safari
      // closes idle connections after the app is backgrounded, and a second tab
      // upgrading the schema closes this one too. Both are recoverable — drop
      // the handle and the next call opens a fresh one.
      db.onclose = () => {
        if (dbPromise === attempt) dbPromise = null
      }
      db.onversionchange = () => {
        db.close()
        if (dbPromise === attempt) dbPromise = null
      }
      resolve(db)
    }
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

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode)
        const req = run(t.objectStore(storeName))
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
export const MAX_SESSIONS = 60
/** Reports that keep their keyframe stills. Older ones keep only their numbers. */
export const KEEP_STILLS = 20

const isQuotaError = (err: unknown) =>
  err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)

const stripStills = (s: Session): Session => ({
  ...s,
  phases: s.phases.map(({ thumbnail: _t, ...phase }) => phase),
})

/**
 * A stored swing traded for the six keyframes inside it.
 *
 * The one rung the stills never had. Stripping a photograph leaves nothing
 * behind, so once the images are gone the ladder's only remaining move is
 * deleting whole reports — a player out of room loses serves rather than
 * pictures. A track is the only thing in a stored report that can get smaller
 * twice: 21 kB becomes the 2.7 kB of keyframes it already contained, the
 * filmstrip is unchanged, and only the replay is lost.
 *
 * Lossless with respect to everything on screen, and that is measured rather
 * than claimed — `footprint.test.ts` checks the rows come back byte for byte.
 */
const downgradeTrack = (s: Session): Session => {
  if (!s.track) return s
  const { track: _t, ...rest } = s
  const poses = keyframesFromTrack(s.track, s.phases)
  return poses ? { ...rest, poses } : rest
}

/**
 * How hard to work to make room.
 *
 * `routine` runs after every save and must be nearly free. The other two are
 * the quota recovery, escalating in the order that costs the player least:
 * images before reports.
 */
type PruneLevel = 'routine' | 'stills' | 'hard'

/** Reports that keep their stills once the disk has actually pushed back. */
export const KEEP_STILLS_UNDER_PRESSURE = 3
/** Reports kept in full once stripping every recoverable image was not enough. */
export const KEEP_ALL_UNDER_PRESSURE = 25

/**
 * Which of the store's keys `prune` would delete outright, and which it would
 * strip stills from, at a given level — the ladder's arithmetic with the
 * IndexedDB calls taken out.
 *
 * Split out so the ladder can be driven by a test without a live IndexedDB:
 * `prune` itself needs a browser, `planPrune` needs an array. `orderedOldestFirst`
 * is exactly what the `createdAt` index hands back, so a caller reading real
 * keys and a test handing in a fabricated run of them exercise the identical
 * arithmetic.
 */
export function planPrune(
  orderedOldestFirst: readonly IDBValidKey[],
  level: PruneLevel,
): { toDelete: IDBValidKey[]; toStrip: IDBValidKey[]; toDowngrade: IDBValidKey[] } {
  const keepStills = level === 'routine' ? KEEP_STILLS : KEEP_STILLS_UNDER_PRESSURE
  const keepAll = level === 'hard' ? KEEP_ALL_UNDER_PRESSURE : MAX_SESSIONS
  const n = orderedOldestFirst.length
  const toStrip = orderedOldestFirst.slice(
    Math.max(0, n - keepAll),
    Math.max(0, n - keepStills),
  )
  return {
    toDelete: orderedOldestFirst.slice(0, Math.max(0, n - keepAll)),
    // Only the band between the two limits: everything past `keepAll` is
    // already in `toDelete`, and everything within `keepStills` of the end
    // keeps its images.
    toStrip,
    /*
     * The swing track goes only once the disk has actually pushed back.
     *
     * A track is 21 kB against the 24–48 kB of photographs on the same report,
     * and it is the only thing here that survives them — so taking it off
     * everything past `KEEP_STILLS` would cost a player the replay on reports
     * that are nowhere near a quota problem, and give them a second horizon to
     * learn on top of the one the pictures already have. Routine pruning
     * therefore leaves it alone entirely.
     *
     * Under pressure it is the same band as the stills rather than a band of its
     * own, deliberately: one limit, one decision, and no third constant to keep
     * in agreement with the other two.
     */
    toDowngrade: level === 'routine' ? [] : toStrip,
  }
}

/**
 * Keep history bounded without throwing away what makes it useful.
 *
 * Nearly all of a stored report's size is its six keyframe JPEGs, and those are
 * the part nobody revisits after a few weeks — while the numbers are what the
 * trend chart and the practice advice are built from. So the stills go first and
 * the measurements survive far longer, which is the opposite of what deleting
 * whole reports oldest-first would do.
 */
async function prune(level: PruneLevel = 'routine'): Promise<void> {
  /*
   * Oldest first, as keys alone.
   *
   * Routine pruning runs after every single save, including the two chip taps
   * that only rescore a report already in the store. Reading the rows
   * themselves to decide meant structured-cloning the entire history back onto
   * the main thread each time — with a full store that is 120 base64 JPEGs,
   * megabytes of text inflated to UTF-16, to conclude almost every time that
   * there was nothing to do. The `createdAt` index was created for this and
   * had never been read.
   *
   * A row with no usable `createdAt` is absent from the index, so it is neither
   * counted against the limits nor deleted here. That is deliberate: it may
   * belong to a newer version of the app. Under real quota pressure
   * `dropUnreadable` reaches them.
   */
  const ordered = await tx<IDBValidKey[]>(
    'readonly',
    (s) => s.index('createdAt').getAllKeys() as IDBRequest<IDBValidKey[]>,
  )

  if (level !== 'routine') await dropUnreadable()

  const { toDelete, toStrip, toDowngrade } = planPrune(ordered, level)
  const downgrading = new Set(toDowngrade.map(String))

  for (const doomed of toDelete) {
    await safely(() => tx('readwrite', (store) => store.delete(doomed)), undefined)
  }

  /*
   * Only the band between the two limits is read back at all: the newest
   * `keepStills` reports keep their images and everything past `keepAll` has
   * just been deleted. One report is resident at a time, which matters because
   * this loop's other caller is the out-of-room path.
   *
   * Every step is best-effort, and that is the point rather than laziness.
   * Stripping stills is itself a `put`, and a `put` rewrites a record before
   * the old copy is released — so under real quota pressure it can throw the
   * very error it is being run to recover from. Unguarded, that rejection
   * propagated out of `prune` and past the retry, and the report the player had
   * just recorded was lost even though the delete loop above had already freed
   * the space for it.
   *
   * Freeing less than hoped for is survivable. Not getting to the retry is not.
   */
  for (const key of toStrip) {
    await safely(async () => {
      const row = await tx<unknown>('readonly', (store) => store.get(key) as IDBRequest<unknown>)
      const s = normalise(row)
      if (!s) return
      const wantsDowngrade = downgrading.has(String(key)) && !!s.track
      // Nothing to free is not the same as a free write: a `put` rewrites a
      // whole record, and this loop's other caller is already out of room.
      if (!s.phases.some((p) => p.thumbnail) && !wantsDowngrade) return
      const stripped = stripStills(s)
      await tx('readwrite', (store) => store.put(wantsDowngrade ? downgradeTrack(stripped) : stripped))
    }, undefined)
  }
}

/**
 * Delete rows nothing can read, one at a time.
 *
 * A row that cannot be parsed still occupies quota, and `listSessions` hides it
 * — so a store full of corrupt rows would defeat the quota recovery entirely,
 * with every retry failing against bytes nothing can free. Read singly rather
 * than with one `getAll`, because the only caller is already out of room and
 * materialising the whole store to find the junk in it is the wrong move at
 * exactly that moment.
 */
async function dropUnreadable(): Promise<void> {
  const keys = await tx<IDBValidKey[]>(
    'readonly',
    (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>,
  )
  for (const key of keys) {
    await safely(async () => {
      const row = await tx<unknown>('readonly', (store) => store.get(key) as IDBRequest<unknown>)
      if (normalise(row)) return
      await tx('readwrite', (store) => store.delete(key))
    }, undefined)
  }
}

/**
 * Bring the store back inside its limits. Exported for `importBackup`, which
 * writes a whole history in one go and must not pay for this per report.
 */
export const pruneSessions = (): Promise<void> => prune()

export async function saveSession(
  analysis: Analysis,
  /**
   * Whether to bound the store afterwards.
   *
   * On by default, because a single save is the only moment the store grows.
   * A bulk restore turns that into the dominant cost: `prune` reads every row
   * back — thumbnails and all — so pruning per report makes an import O(n²) in
   * reads and, past `KEEP_STILLS`, in image-sized writes too. Sixty reports is
   * then sixty full reads of sixty reports. The caller prunes once at the end.
   */
  bound = true,
): Promise<void> {
  /*
   * A clip the engine refused never enters the record.
   *
   * The refusal is rendered on the report page, and for a while that was the
   * only place it applied — the same analysis was then filed like any other, and
   * everything downstream reads the history without ever consulting triage. The
   * score set a personal best in `buildProgress`, landed as a point on the trend
   * chart, became the `previous` the next report's deltas were measured against,
   * fed the practice window and appeared in the history sheet under a confident
   * focus line. Six places acting on a number the app had just told the player
   * not to trust, none of them carrying the banner that said so.
   *
   * Enforced here rather than at the call sites because there are five of them —
   * a fresh analysis, a serve-type rescore, a level change, a cached re-open and
   * the consistency sweep — and a rule that has to be remembered five times is a
   * rule that holds four times.
   */
  if (analysis.triage?.status === 'rejected') return

  const { frames: _frames, ...rest } = analysis
  void _frames

  const session: Session = {
    ...rest,
    // Stamped on the way in, because saving is the moment these scores stop
    // being recomputable — the frames behind them are dropped just above — so a
    // report that reaches storage unstamped can never be placed afterwards.
    // Kept rather than overwritten when the report already carries a
    // version: `importBackup` restores old reports through here, and restamping
    // those as current would put an old-rubric score onto the new trend line —
    // the exact fabricated gain the stamp exists to prevent.
    scoringVersion: rest.scoringVersion ?? SCORING_VERSION,
  }

  try {
    await tx('readwrite', (s) => s.put(session))
  } catch (err) {
    if (!isQuotaError(err)) throw err
    /*
     * Out of room. Free the cheap bytes first, and only the cheap bytes.
     *
     * The recovery used to go in one shot: strip stills back to five reports
     * *and* delete every report past the newest twenty-five. But
     * `QuotaExceededError` is raised by a device with no free space at all, not
     * only by an origin over its own share — so a phone whose disk was filled
     * by photos and podcasts had thirty-five serve reports destroyed to reclaim
     * a few megabytes that were never the problem, and the retry then failed
     * anyway. The player lost most of their history and still lost the report
     * they had just recorded.
     *
     * Stills are almost all of the bytes and can be recaptured from a re-run;
     * the measurements behind a report cannot be recovered once the clip is
     * gone. So the images go first, across the whole history, and reports are
     * deleted only if losing every recoverable image was genuinely not enough.
     */
    await prune('stills')
    try {
      await tx('readwrite', (s) => s.put(session))
    } catch (stillFull) {
      if (!isQuotaError(stillFull)) throw stillFull
      await prune('hard')
      await tx('readwrite', (s) => s.put(session))
    }
  }

  // Bounding the store is housekeeping, not part of the save. A failure here
  // must not turn a report that is already durably written into a rejected
  // promise the caller reports to the player as a lost save.
  if (bound) await safely(() => prune(), undefined)
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
/**
 * A stored landing, brought up to the shape the engine now returns.
 *
 * THE OFFSET IS DROPPED WHENEVER THE WINDOW IS MISSING, and that is the whole
 * point rather than caution. `secondsAfterContact` arrived with the refusal that
 * needs it: before it existed, a clip that stopped as the ball left reported an
 * offset of exactly zero at full confidence -- a body that had not landed yet,
 * read as one that finished square. A stored reading with no window on it is one
 * of those or is indistinguishable from one, and nothing here can tell which.
 *
 * So it is refused rather than repaired. Keeping the number and defaulting the
 * window to zero would be worse than either: a reading that says it was taken at
 * contact, which the current engine would never produce, sitting beside an offset
 * that looks perfectly ordinary.
 */
/**
 * A stored external rotation, brought up to the shape the engine now returns.
 *
 * No build ever wrote a shorter version of this one -- `lever` shipped with the
 * rotation itself -- which is why an earlier round checked its history and
 * cleared it. That was the right answer to the wrong question. History says no
 * OLD report is missing a field; it says nothing about a row corrupted in place,
 * hand-edited in a backup, or written by a build that does not exist yet. The
 * guard either promises the declared shape or it does not, and this one did not.
 *
 * Repaired rather than refused, like the chain and unlike the landing: `deg` is
 * nullable by design, so a rotation nobody stored is one nobody measured, which
 * is the same thing this engine would say today.
 */
function readRotation(v: unknown): NonNullable<Analysis['diagnosis']>['externalRotation'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return {
    deg: num(o.deg),
    confidence: num(o.confidence) ?? 0,
    lever: num(o.lever) ?? 0,
  }
}

/**
 * A stored kinetic chain, brought up to the shape the engine now returns.
 *
 * Every link is nullable by design and a missing one is the honest absence, so
 * unlike the landing there is nothing here to refuse: a link nobody stored is a
 * link nobody measured, which is the same thing the engine would say today.
 */
function readChain(v: unknown): NonNullable<Analysis['diagnosis']>['chain'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  const link = (x: unknown) => {
    const l = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return { ms: num(l.ms), confidence: num(l.confidence) ?? 0 }
  }
  return {
    legs: link(o.legs),
    hips: link(o.hips),
    shoulders: link(o.shoulders),
    elbow: link(o.elbow),
    wrist: link(o.wrist),
    span_ms: num(o.span_ms),
    span_ratio: num(o.span_ratio),
  }
}

function readLanding(v: unknown): NonNullable<Analysis['diagnosis']>['landing'] {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
  const after = num(o.secondsAfterContact)
  const offset = num(o.offset)
  return {
    offset: after === undefined || offset === undefined ? null : offset,
    confidence: num(o.confidence) ?? 0,
    secondsAfterContact: after ?? 0,
    anklesSeen: num(o.anklesSeen) ?? 0,
  }
}

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
      // `text(…)` rather than `?? ''` on every one of these, and the difference
      // is the whole reason the shape fuzz in `render.test.ts` exists. `??`
      // catches an absent field and waves a wrong-typed one straight through,
      // so a hand-edited backup carrying `headline: 0` reached `Cue`, which
      // splits it, and took the report down. Absent and wrong-typed are the same
      // situation to every consumer here: the field is not usable and a default
      // has to stand in.
      label: text(f.label, f.id),
      score: typeof f.score === 'number' ? f.score : 0,
      status: status(f.status),
      blurb: text(f.blurb, ''),
      headline: text(f.headline, ''),
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
    // `VERDICT[analysis.overallStatus]` in `Report` is an unguarded index into a
    // four-key table, so a status this build has never heard of is a blank
    // screen rather than a wrong word.
    overallStatus: status(s.overallStatus),
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
    // bands, which is exactly what 'flat' means. Checked for membership rather
    // than for presence, against the very table the report indexes — three
    // screens do `SERVE_TYPES[analysis.serveType].label` with no guard, so an
    // unknown name is not a mislabelled report, it is no report at all.
    serveType: s.serveType && s.serveType in SERVE_TYPES ? s.serveType : 'flat',
    // Same reasoning, and the same trap in a costlier place: a report saved
    // before the stamp existed was scored under the original rubric, so it is
    // the old version rather than an unknown one. Type-checked rather than
    // `??`-defaulted because a hand-edited backup carrying `"2"` as text would
    // otherwise pass straight through and compare equal to nothing at all.
    scoringVersion:
      typeof s.scoringVersion === 'number' ? s.scoringVersion : LEGACY_SCORING_VERSION,
    video: s.video ?? { name: 'Your serve', durationMs: 0, width: 0, height: 0 },
    handedness: s.handedness === 'left' ? 'left' : 'right',
    quality: usableQuality(s.quality),
    focus: s.focus ?? {
      title: 'Keep filming',
      why: 'This report was saved by an older version of the app, so some detail is missing.',
      drill: { name: '', how: '', reps: '' },
    },
    triage: usableTriage(s.triage),
    // Dropped rather than repaired when it is the wrong shape. Every other field
    // here is load-bearing and worth defaulting; the spreads are an extra a
    // report is complete without, and the panel that draws them reaches through
    // `metrics[].values` and `range` on every row. Half a spread is a crash in a
    // component the ErrorBoundary can only replace with a blank screen.
    consistency: usableConsistency(s.consistency),
    diagnosis: withChain(s.diagnosis),
    /*
     * Dropped rather than repaired, like the spreads above and for a sharper
     * version of the same reason: this one is read straight into a drawing loop.
     * A row of the wrong length or a value that is not a number produces a canvas
     * full of `NaN` rather than an exception, so there is no boundary to catch it
     * — the picture is simply wrong and nothing says so.
     *
     * Absent on every report written before poses existed, which is the ordinary
     * case and not an error: the filmstrip falls back to the placeholder it has
     * always drawn.
     */
    poses: readKeyframePoses(s.poses),
    /*
     * Same door, same reason. A report carries one or the other and never both:
     * fresh ones store the track, and the ladder's downgrade turns it back into
     * `poses` under quota pressure, so both fields are the ordinary state of
     * some report in a real store.
     */
    track: readSwingTrack(s.track),
  }
}

/* ------------------------------------------------------------ field repairs */

/**
 * A stored string, or a stand-in.
 *
 * The workhorse of the repairs above, and it exists because `??` is the wrong
 * operator for this job in a way that is easy to miss: it asks "was this
 * written down" when every consumer is asking "can I use this". A backup
 * carrying `label: 0` answers yes to the first and no to the second, and the
 * screens find out by calling `.toLowerCase()` on a number.
 */
const text = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)

/**
 * The four badges, as the only values `statusOf` can produce.
 *
 * A list rather than an import from `geometry.ts`, which owns the thresholds
 * but exports no roster of the outcomes. Kept next to its one use and named so
 * that a fifth badge added there fails the type here rather than reaching a
 * table lookup on screen.
 */
const STATUSES: readonly Session['overallStatus'][] = ['great', 'good', 'fair', 'work']

const status = (v: unknown): Session['overallStatus'] =>
  STATUSES.includes(v as Session['overallStatus']) ? (v as Session['overallStatus']) : 'fair'

/**
 * How the clip was read, repaired field by field rather than replaced whole.
 *
 * The report reaches through every one of these unguarded — `warnings.length`,
 * `view` into a three-way ternary, `confidence` into a comparison — and a
 * caveat block is not worth losing a whole report over, so this defaults rather
 * than drops. A wrong `view` becomes "angled" for the same reason an absent one
 * does: it is the honest middle answer, and it is what a report written before
 * view detection existed already gets.
 */
function usableQuality(raw: unknown): Session['quality'] {
  const q = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Session['quality']>
  const view = q.view === 'side' || q.view === 'front-back' ? q.view : 'angled'
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    confidence: num(q.confidence, 0.5),
    warnings: Array.isArray(q.warnings) ? q.warnings.filter((w) => typeof w === 'string') : [],
    view,
    sampledFps: num(q.sampledFps, 30),
    swingSamples: num(q.swingSamples, 0),
  }
}

/**
 * A stored diagnosis, with the kinetic chain filled in as never measured.
 *
 * `Diagnosis.chain` is required by the type and absent from every report saved
 * before it existed, so a stored diagnosis is a shape the compiler believes and
 * the data does not. Nothing reads it yet — no card, no flaw, no copy — which is
 * exactly why this is worth doing now rather than after the first reader lands
 * and takes the report screen down for anyone with older history.
 *
 * The links come back `null` at zero confidence, which is this repo's word for
 * "not measured" everywhere else and is the literal truth here: those clips were
 * analysed by a build that never looked. What must not happen is a zero — a
 * chain of `ms: 0` would read as five links all peaking exactly at contact, an
 * invented serve rather than a missing measurement.
 */
function withChain(d: Analysis['diagnosis']): Analysis['diagnosis'] {
  if (!d) return d
  /*
   * The flaw list, element-checked, before anything else.
   *
   * `causalPlan` and `causalFocus` both walk it reading `.detected`,
   * `.severity` and `.flaw` off each entry with no guard — correctly, since
   * every list this app writes is full of real findings. One null in it, from a
   * hand-edited backup or a half-written row, is the plan gone and the report
   * with it. Filtered rather than dropped whole: a diagnosis with four good
   * flaws and one bad entry still has four things worth saying.
   */
  const flaws = Array.isArray(d.flaws)
    ? d.flaws.filter((f) => typeof f?.flaw === 'string')
    : []
  /*
   * External rotation, filled in the same way and for the same reason.
   *
   * Added a build after the chain and absent from everything saved before it,
   * so it needs its own guard rather than riding on the chain's — a report from
   * the build in between has a chain and no rotation, and the early return
   * below would hand that one straight back. `deg: null` at zero confidence is
   * the literal truth (nothing looked) and `lever: 0` says which refusal it was.
   */
  const externalRotation = readRotation(d.externalRotation)

  /*
   * Same guard again for the landing, and it needs its own rather than riding
   * on the chain check for the reason the rotation above does: the three
   * arrived in different builds, so a stored report can carry any combination
   * of them. `offset: null` at zero confidence is the literal truth — nothing
   * looked — and `anklesSeen: 0` says the feet are why.
   *
   * READ FIELD BY FIELD rather than passed through when present, which is the
   * part the first version of this guard missed. A guard that only handles the
   * object being ABSENT is no guard at all against the thing that actually
   * happens here: the object being present in an older SHAPE. `landing` shipped
   * with three fields and gained `secondsAfterContact` a few rounds later, and
   * a report stored in between came back through here untouched — carrying a
   * field the type declares as a required number and storage does not have.
   */
  const landing = readLanding(d.landing)

  /*
   * And the chain read field by field for the same reason the landing is, which
   * this guard missed for exactly as long.
   *
   * `span_ratio` arrived one build after the rest of the chain, so a report
   * stored in between has every link and a `span_ms` and no ratio at all — and
   * the early return below handed it straight back, carrying a field the type
   * declares as `number | null` and storage does not have. Same hole, one field
   * over: presence was checked and shape was not.
   *
   * Repaired rather than dropped, unlike the landing's offset, and the
   * difference is worth stating. That one had to be refused because it was
   * computed before a refusal that might have rejected it, so its value was in
   * doubt. Nothing about `span_ms` changed when the ratio was added — it is the
   * same measurement, and a missing ratio is a derived number nobody has, which
   * is precisely what `null` means here.
   */
  if (d.chain && typeof d.chain === 'object') {
    return { ...d, flaws, externalRotation, landing, chain: readChain(d.chain) }
  }
  const missing = { ms: null, confidence: 0 }
  return {
    ...d,
    flaws,
    externalRotation,
    landing,
    chain: {
      legs: { ...missing },
      hips: { ...missing },
      shoulders: { ...missing },
      elbow: { ...missing },
      wrist: { ...missing },
      span_ms: null,
      span_ratio: null,
    },
  }
}

/**
 * A stored consistency block, or nothing.
 *
 * Structural, not exhaustive: enough of a check that the panel and the trend
 * cannot be handed something they will throw on, without pretending to validate
 * seventeen nested rows a hand-edited backup could still get subtly wrong.
 */
function usableConsistency(raw: unknown): Session['consistency'] {
  if (typeof raw !== 'object' || raw === null) return undefined
  const c = raw as Partial<NonNullable<Session['consistency']>>
  if (typeof c.serves !== 'number' || typeof c.score !== 'number') return undefined
  if (!Array.isArray(c.overallScores) || c.overallScores.some((n) => typeof n !== 'number')) {
    return undefined
  }
  if (!Array.isArray(c.metrics)) return undefined
  const metrics = c.metrics.filter(
    (m) =>
      typeof m?.id === 'string' &&
      // `consistencyHeadline` lowercases this and the panel prints it as the
      // row's name; the same row is also `weakest`, which two screens name in
      // a sentence. A row with no readable label has nothing to be called.
      typeof m.label === 'string' &&
      Array.isArray(m.values) &&
      Array.isArray(m.ideal) &&
      Array.isArray(m.range),
  )
  if (metrics.length === 0) return undefined

  // Re-derived rather than carried over. `weakest` and `steadiest` are the ends
  // of the same ranking the rows above came from, so a row dropped by the filter
  // can leave them pointing at something no longer in the list — and the panel
  // then names an element the table underneath it does not contain.
  const ranked = [...metrics].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
  return {
    ...(c as NonNullable<Session['consistency']>),
    metrics,
    weakest: ranked[0],
    steadiest: ranked[ranked.length - 1],
    /*
     * The serve numbers, or an empty list — never a missing one.
     *
     * This block's whole contract is that the panel and the trend cannot be
     * handed something they will throw on, and `serveNumbers` was the one field
     * in it that nothing checked. Both readers index it directly and then fall
     * back per element (`c.serveNumbers[i] ?? i + 1` in `ConsistencyPanel` and
     * in `renderBasketCard`), so a *short* list is already survivable and an
     * absent one is a `TypeError` on the first chip — a blank screen behind the
     * ErrorBoundary, from a report that otherwise reads perfectly. Nothing this
     * app has ever written lacks it, which is exactly why it went unnoticed:
     * the case is a hand-edited backup or a row from a build that predates the
     * field, and those are the rows this function exists for.
     *
     * Empty rather than rebuilt as `1..n`, so the fallback that decides the
     * numbering stays in one place instead of two that could disagree.
     */
    serveNumbers:
      Array.isArray(c.serveNumbers) && c.serveNumbers.every((n) => typeof n === 'number')
        ? c.serveNumbers
        : [],
    /*
     * Dropped whole rather than repaired, which is this block's own rule for
     * anything a report is complete without.
     *
     * There is no honest repair available. A row missing `bound` cannot have one
     * invented — the bound is the entire licence for printing the delta, and a
     * zero would licence everything. A row missing `delta` has nothing to say.
     * And the field is absent on every report that predates it and on most that
     * do not, since these deltas refuse readily by design, so a reader that
     * cannot cope with its absence is broken already.
     */
    uncalibrated: usableDeltas(c.uncalibrated),
    /*
     * The best-against-worst block, or nothing.
     *
     * Same reasoning as `metrics` above and the same treatment: dropped rather
     * than repaired. `BestAgainstWorst` walks `differences` and prints all four
     * numbers, so half a gap is a crash, and there is no honest way to invent
     * the missing half — which serve was the good one is a claim about serves
     * this row no longer carries. The panel already draws without a gap, since
     * `buildGap` returns nothing when every serve scored the same.
     */
    gap: usableGap(c.gap),
    // Absent from every report saved before R12, and false is the honest
    // default for those: nothing flagged a mismatch because nothing looked,
    // not because a look found none.
    possibleHandoff: c.possibleHandoff ?? false,
  }
}

/** The best-against-worst block, if it carries everything the panel prints. */
/**
 * The ungraded deltas, element-checked, or nothing.
 *
 * Every field is required because every field is load-bearing: `id` decides
 * which reading is being talked about, `from` and `to` name the two serves the
 * player is being pointed at, `delta` is the change, and `bound` is the only
 * reason any of it may be shown. A row short of one of those is not half a
 * delta, it is a claim with its evidence missing.
 */
function usableDeltas(raw: unknown): NonNullable<Session['consistency']>['uncalibrated'] {
  if (!Array.isArray(raw)) return undefined
  const kept = raw.filter(
    (d) =>
      typeof d?.id === 'string' &&
      typeof d.from === 'number' &&
      typeof d.to === 'number' &&
      typeof d.delta === 'number' &&
      typeof d.bound === 'number' &&
      // The rule the writer applied, re-applied on the way back out. A row that
      // no longer clears its own bound was either corrupted or written by a
      // build with a laxer rule, and neither earns a line on the panel.
      d.delta > d.bound,
  )
  return kept.length ? kept : undefined
}

function usableGap(raw: unknown): NonNullable<Session['consistency']>['gap'] {
  if (typeof raw !== 'object' || raw === null) return undefined
  const g = raw as Partial<NonNullable<NonNullable<Session['consistency']>['gap']>>
  const numbered =
    typeof g.best === 'number' &&
    typeof g.worst === 'number' &&
    typeof g.bestScore === 'number' &&
    typeof g.worstScore === 'number'
  if (!numbered || !Array.isArray(g.differences)) return undefined
  return {
    ...(g as NonNullable<NonNullable<Session['consistency']>['gap']>),
    // Element-checked for the same reason `phases` is: one null in the list
    // throws inside the `readoutOf` map rather than at the top level.
    differences: g.differences.filter(
      (d) => typeof d?.id === 'string' && typeof d.bestValue === 'number' && typeof d.worstValue === 'number',
    ),
  }
}

/**
 * Walk the store a row at a time, reshaping each one as it arrives.
 *
 * A cursor rather than `getAll()` so that only one report is materialised at a
 * time. It matters for `listSummaries`, whose whole point is that the keyframe
 * images never reach the caller: `getAll()` would deserialise all 120 base64
 * JPEGs into one array first and only then let us drop them, which is the peak
 * we are trying to avoid on a mid-range phone.
 */
function readAll(shape: (s: Session) => Session): Promise<Session[]> {
  return open().then(
    (db) =>
      new Promise<Session[]>((resolve, reject) => {
        const out: Session[] = []
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
        req.onsuccess = () => {
          const cursor = req.result
          if (!cursor) {
            resolve(out.sort((a, b) => b.createdAt - a.createdAt))
            return
          }
          const s = normalise(cursor.value)
          if (s) out.push(shape(s))
          cursor.continue()
        }
        req.onerror = () => reject(req.error ?? new Error('Could not read local storage'))
      }),
  )
}

/** Every stored report in full, newest first. */
export const listSessions = (): Promise<Session[]> => readAll((s) => s)

/**
 * Every stored report, newest first, without its keyframe images.
 *
 * What the app holds in state for its whole life. The history list and the home
 * screen draw a score ring, a title and a date; the trend chart, the practice
 * window and the consistency sweep read numbers. None of them touch a
 * thumbnail. Keeping the full reports there meant 120 base64 JPEGs — tens of
 * megabytes once the browser inflated them to UTF-16 — pinned from the moment
 * the app opened, for images that are only ever on screen inside one open
 * report. That report is fetched on demand by `getSession`.
 */
export const listSummaries = (): Promise<Session[]> => readAll(stripStills)

/** One stored report in full, images included. */
export async function getSession(id: string): Promise<Session | undefined> {
  return normalise(await tx<unknown>('readonly', (s) => s.get(id) as IDBRequest<unknown>))
}

export async function deleteSession(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

export async function clearSessions(): Promise<void> {
  await tx('readwrite', (s) => s.clear())
}

/* ------------------------------------------------------ what the player did */

/**
 * One drill, assigned by the practice card and marked done by the player.
 *
 * The only thing in this database the camera did not produce, and the gap it
 * fills is a specific one: `findPracticeFocus` can see that a measurement has
 * not moved in five sessions and cannot tell whether the player drilled it and
 * it did not work, or never drilled it at all. Those are opposite situations
 * and they render as the same badge.
 *
 * `drill` is the drill's name as it stood when it was assigned. A drill renamed
 * in a later version would otherwise silently re-label what somebody did last
 * month, and the whole value of this record is that it says what actually
 * happened.
 */
export interface PracticeLog {
  id: string
  /** The measurement the drill was for, matching `PracticeFocus.metricId`. */
  metricId: string
  drill: string
  assignedAt: number
  doneAt: number
}

/**
 * A stored log, or nothing.
 *
 * Same contract as `normalise`: anything readable is kept, anything that would
 * make a caller throw is dropped. Nothing here has a sensible default — a log
 * with no measurement on it cannot be counted towards any measurement, and an
 * undated one cannot be placed in a window — so this repairs nothing and only
 * rejects.
 */
export function normalisePracticeLog(raw: unknown): PracticeLog | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const l = raw as Partial<PracticeLog>
  if (
    typeof l.id !== 'string' ||
    typeof l.metricId !== 'string' ||
    !l.metricId ||
    typeof l.doneAt !== 'number' ||
    !Number.isFinite(l.doneAt)
  ) {
    return undefined
  }
  return {
    id: l.id,
    metricId: l.metricId,
    drill: typeof l.drill === 'string' ? l.drill : '',
    // An older writer, or a hand-edited backup, may not have recorded when it
    // was handed out. The moment it was done is the one every reader uses.
    assignedAt: typeof l.assignedAt === 'number' ? l.assignedAt : l.doneAt,
    doneAt: l.doneAt,
  }
}

export async function listPracticeLogs(): Promise<PracticeLog[]> {
  const rows = await tx<unknown[]>(
    'readonly',
    (s) => s.getAll() as IDBRequest<unknown[]>,
    PRACTICE_STORE,
  )
  return rows
    .map(normalisePracticeLog)
    .filter((l): l is PracticeLog => l !== undefined)
    .sort((a, b) => b.doneAt - a.doneAt)
}

export async function logPractice(log: PracticeLog): Promise<void> {
  await tx('readwrite', (s) => s.put(log), PRACTICE_STORE)
}

/** Undo. A tap on a phone is easy to make by accident and hard to take back. */
export async function unlogPractice(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id), PRACTICE_STORE)
}

export async function clearPracticeLogs(): Promise<void> {
  await tx('readwrite', (s) => s.clear(), PRACTICE_STORE)
}

/** Storage is best-effort: history is a convenience, never a blocker. */
export async function safely<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await op()
  } catch {
    return fallback
  }
}

/**
 * The triage block, shaped so nothing downstream reads a field that is not there.
 *
 * R65, and **its stated premise turned out to be wrong**, which is worth having
 * in the file rather than only in the ledger. That entry said "the consumers in
 * `verdict.ts` read those without asking". There are none: a sweep for readers
 * of `triage.quality` outside tests finds exactly one, `pairTracks`, and it
 * guards its own reads.
 *
 * SO WHY BUILD THE GUARD. Because `pairTracks` had to write that defence itself,
 * in R49·1, precisely because there was none here — and the next consumer would
 * write a third. That is how `withChain` ended up with separate guards for the
 * chain, the rotation and the landing: each arrived, found no shape check, and
 * added its own. One at the door is cheaper than one per reader, and a reader
 * that forgets is a blank screen behind the ErrorBoundary.
 *
 * `pairTracks` KEEPS ITS OWN, and that is not redundancy. `Pairable` accepts a
 * live `Analysis`, which never passes through this function at all, so the local
 * check is the only one on that path.
 *
 * DROPPED RATHER THAN REPAIRED, which is the decision R49·1 declined to make and
 * left named. There is no honest default for a missing `confidence`: inventing
 * 0.9 manufactures a measurement, and 0 refuses every clip that was fine. The
 * whole block goes instead — and `triage` is optional on `Analysis`, so a report
 * without one is a state every pre-triage report already reaches. What is lost is
 * the verdict and the primary flaw; what is not lost is the scores, the
 * filmstrip, the trend and the practice card.
 *
 * The five fields are the shape as shipped. `yaw_measured` is deliberately not
 * among them — it is younger than the block and absent on every report filed
 * before it, so requiring it would drop most of a real history. It is repaired to
 * `false` instead, for the reason R49·1 gives: a comparison must refuse a pair
 * whose camera angle was never read, and defaulting an unknown row to `true`
 * waves through exactly what the field was added to stop.
 */
function usableTriage(raw: Analysis['triage']): Analysis['triage'] {
  if (!raw || typeof raw !== 'object') return undefined
  const q = raw.quality as Partial<NonNullable<Analysis['triage']>['quality']> | undefined
  const shaped =
    !!q &&
    typeof q.confidence === 'number' &&
    typeof q.blur === 'number' &&
    typeof q.roll_deg === 'number' &&
    typeof q.yaw_deg === 'number' &&
    typeof q.swing_samples === 'number'
  return {
    ...raw,
    /*
     * The BLOCK is dropped, not the triage, and an existing check is what taught
     * me the difference. Dropping the whole triage lost `status`, and
     * `importBackup` refuses to restore a clip the engine rejected by reading
     * exactly that — so a rejected row came back into a history that had refused
     * it. A rejected clip legitimately has readings nobody took; the rejection is
     * the one thing about it that must survive.
     */
    quality: shaped
      ? { ...(raw.quality as NonNullable<typeof raw.quality>), yaw_measured: q?.yaw_measured === true }
      : undefined,
    /*
     * Any unreadable injury flag dropped. `injuryNotes` destructures
     * `{ flag, severity }` off every entry, so one null in the list is the
     * report gone. It already skips a flag this build has no copy for — the case
     * it was written against, a row from a newer version — and that guard cannot
     * fire on an entry that is not an object.
     */
    injury_risk: Array.isArray(raw.injury_risk)
      ? raw.injury_risk.filter((i) => typeof i?.flag === 'string')
      : [],
  }
}
