/**
 * Protecting the history without asking anybody to remember to.
 *
 * A backup file protects a player only if they make one, and the reminder to was
 * a chore that arrived every twenty serves. So after a report is saved the app
 * looks after itself: it asks the browser to keep this site's data once that is
 * likely to be granted, and it keeps a rolling safety copy of the history on the
 * device. Nothing leaves the phone. There is no server and no account.
 *
 * THE COPY IS THE BACKUP FILE'S OWN SHAPE, from the same `buildBackup`, so the
 * same `importBackup` restores it and every rule about what a restore may do
 * still holds: a report already on file and newer wins, and a row that will not
 * read is left behind. Compacted first: no photographs, and each swing traded for
 * the keyframes inside it, 17 kB a report against 39 on the rig before its
 * stills. Held to `SNAPSHOT_BUDGET`, newest reports first, since the season ledger
 * already carries the oldest trips.
 *
 * KEPT APART FROM THE REPORTS, so what breaks them does not break it: the
 * origin-private file system where a page can write there, otherwise a second
 * IndexedDB database. The crash screen's clear does not touch it, on purpose. The
 * newest two are kept, and when the newer of them holds far fewer serves than the
 * older, the older stays: a history lost and then refilmed must not roll its only
 * good copy away.
 *
 * WHAT THIS DOES NOT PROTECT FROM, and the wording must never pretend otherwise.
 * It sits on the same site as the reports, so when the browser evicts the site's
 * data it goes too. It covers a damaged history and a mistaken clear. Only a file
 * survives a lost phone, or Safari clearing a site not added to the Home Screen.
 * `protectionLine` says exactly that, on every path.
 *
 * NEVER IN THE WAY. All of it runs in idle time, one pass at a time, never rejects,
 * and asks the store only for counts until a copy is really due: a save stays as
 * cheap as the prune was rewritten to keep it. A copy that cannot be made is left
 * unmade, and `storageNudge` notices it has stopped keeping up.
 */
import { REAL_STORE, buildBackup, importBackup, isIOS, isInstalled, isPersisted, requestPersistence, type Backup, type ImportResult } from './backup'
import { clipStoreAvailable } from './clipStore'
import { compactSession, countFiledSince, countRows, firstFiledAt, listSummaries, safely } from './db'
import { SNAPSHOT_EVERY } from './nudge'
import { readPrefs, writePrefs, type Prefs } from './prefs'
import { cue } from '../analysis/voice'
import { shortDate } from '../progress'

/** The most a copy may hold, in characters of JSON: over four hundred compact reports. */
export const SNAPSHOT_BUDGET = 8_000_000

/** Copies kept on the shelf. */
export const SNAPSHOTS_KEPT = 2

/** Free space a copy needs, as a multiple of its size: reports always come first. */
const ROOM_MARGIN = 3

/** Serves filed before a browser that is not installed is worth asking. Below this it says no. */
export const PERSIST_AFTER_SERVES = 3

/** How long before a refusal is worth asking about again. */
export const PERSIST_RETRY_MS = 14 * 86_400_000

const DAY = 86_400_000
const DIR = 'snapshots'
const SHELF_DB = 'serve-coach-snapshots'
const SHELF_STORE = 'snapshots'

/** Reports worked through between breaths. */
const CHUNK = 24

/** One copy on the shelf. All of it is in the name, so a list costs no read. */
export interface SnapshotMeta {
  name: string
  at: number
  serves: number
}

/** Where copies live, whichever store that is. */
export interface SnapshotShelf {
  kind: 'opfs' | 'idb'
  names(): Promise<string[]>
  read(name: string): Promise<string | undefined>
  /** Written whole or not at all. */
  write(name: string, text: string): Promise<void>
  remove(name: string): Promise<void>
}

export interface ProtectionStatus {
  /** The browser has promised to keep this site's data. */
  persisted: boolean
  /** The browser may still clear everything by itself: iOS, not added to the Home Screen. */
  mayClear: boolean
  /** The newest safety copy, when there is one. */
  lastSnapshotAt?: number
  lastSnapshotServes?: number
  /** One honest sentence: what the copy covers, and what only a file does. */
  line: string
}

export type RecoveryReason = 'emptied' | 'damaged'

/** A restore worth offering. */
export interface RecoveryOffer {
  reason: RecoveryReason
  serves: number
  at: number
  line: string
}

/** Everything this module touches, named so all of it can run on a Map. */
export interface ProtectDeps {
  now(): number
  /** Idle time. */
  pause(): Promise<void>
  shelf(): Promise<SnapshotShelf | undefined>
  /** The history in the backup's shape, no photographs read back. */
  build(): Promise<Backup>
  /** Reports filed after a moment: a count, never a read. */
  filedSince(at: number): Promise<number>
  firstFiledAt(): Promise<number | undefined>
  /** Rows in the store, readable or not. Rejects when it will not open. */
  rows(): Promise<number>
  readable(): Promise<number>
  restore(text: string): Promise<ImportResult>
  estimate(): Promise<{ usage: number; quota: number } | undefined>
  persisted(): Promise<boolean>
  askPersistence(): Promise<boolean>
  installed(): boolean
  ios(): boolean
  readPrefs(): Prefs
  writePrefs(patch: Partial<Prefs>): Prefs
}

const nameOf = (at: number, serves: number) => `history-${at}-${serves}.json`

/** The copies on a shelf, newest first. Anything else in the folder is not ours to read. */
export function snapshotsOn(names: readonly string[]): SnapshotMeta[] {
  const out: SnapshotMeta[] = []
  for (const name of names) {
    const m = /^history-(\d+)-(\d+)\.json$/.exec(name)
    if (m) out.push({ name, at: Number(m[1]), serves: Number(m[2]) })
  }
  return out.sort((a, b) => b.at - a.at)
}

/** Whether a new copy is due: a first as soon as there is anything to keep, then every `SNAPSHOT_EVERY` serves. */
export function snapshotDue(newest: SnapshotMeta | undefined, filedSince: number, practiceServes = 0): boolean {
  const serves = filedSince + practiceServes
  return newest ? serves >= SNAPSHOT_EVERY : serves > 0
}

/**
 * What goes when a copy is added: `held` newest first, the new one among them.
 *
 * The newest stays, and of the rest the one holding the most serves, the newer of
 * two equal. While a history grows that is the latest two. When it has shrunk,
 * that is the older, larger copy, which a run of small new ones cannot roll away.
 */
export function snapshotsToDrop(held: readonly SnapshotMeta[]): string[] {
  if (held.length <= SNAPSHOTS_KEPT) return []
  const [, ...rest] = held
  const kept = rest.reduce((a, b) => (b.serves > a.serves ? b : a))
  return rest.filter((m) => m !== kept).map((m) => m.name)
}

/** Whether a copy this size leaves the reports plenty of room. A browser that will not say gets the benefit. */
export function roomFor(chars: number, estimate?: { usage: number; quota: number }): boolean {
  return !estimate?.quota || estimate.quota - estimate.usage >= chars * ROOM_MARGIN
}

/**
 * The backup as a compact file, or nothing if it cannot fit.
 *
 * Reports newest first until the budget runs out, a chunk at a time with a breath
 * between: `importBackup` does not mind the order, and a long history must not
 * hold the main thread. Everything that is not a report goes in whole, photographs
 * off a practice session aside: they are what the budget is for.
 */
export async function snapshotText(
  backup: Backup,
  budget: number = SNAPSHOT_BUDGET,
  pause: () => Promise<void> = async () => {},
): Promise<{ text: string; serves: number } | undefined> {
  const { sessions, practiceSessions, ...rest } = backup
  const head = JSON.stringify({
    ...rest,
    ...(practiceSessions ? { practiceSessions: practiceSessions.map(({ stills: _stills, ...p }) => p) } : {}),
  })
  let size = head.length + 16
  if (size > budget) return undefined
  const rows: string[] = []
  const newestFirst = [...sessions].sort((a, b) => b.createdAt - a.createdAt)
  for (const [i, session] of newestFirst.entries()) {
    const row = JSON.stringify(compactSession(session))
    if (size + row.length + 1 > budget) break
    rows.push(row)
    size += row.length + 1
    if (i % CHUNK === CHUNK - 1) await pause()
  }
  return { text: `${head.slice(0, -1)},"sessions":[${rows.join(',')}]}`, serves: rows.length }
}

/** Make a copy now if one is due. Resolves to it, or to nothing when none was made. */
async function snapshotIfDue(practiceServes: number, deps: ProtectDeps): Promise<SnapshotMeta | undefined> {
  const shelf = await deps.shelf()
  if (!shelf) return undefined
  const held = snapshotsOn(await shelf.names())
  const filed = await deps.filedSince(held[0]?.at ?? -Infinity)
  if (!snapshotDue(held[0], filed, practiceServes)) return undefined
  const built = await snapshotText(await deps.build(), SNAPSHOT_BUDGET, deps.pause)
  if (!built?.serves || !roomFor(built.text.length, await deps.estimate())) return undefined
  const at = deps.now()
  const made = { name: nameOf(at, built.serves), at, serves: built.serves }
  await shelf.write(made.name, built.text)
  for (const name of snapshotsToDrop([made, ...held])) await safely(() => shelf.remove(name), undefined)
  return made
}

/**
 * Whether the browser is worth asking to keep this site's data.
 *
 * Asking is free on Chrome and a prompt on Firefox, and either way the answer
 * follows engagement: an installed app, or somebody who has come back. So not on
 * the first serve, which is when it says no, and not again for a while after it did.
 */
export function persistenceWorthAsking(o: {
  persisted: boolean
  installed: boolean
  /** Reports on file. */
  serves: number
  firstFiledAt?: number
  askedAt?: number
  now: number
}): boolean {
  if (o.persisted) return false
  if (o.askedAt !== undefined && o.now - o.askedAt < PERSIST_RETRY_MS) return false
  if (o.installed) return true
  return o.serves >= PERSIST_AFTER_SERVES && o.firstFiledAt !== undefined && o.now - o.firstFiledAt >= DAY
}

async function askForPersistence(deps: ProtectDeps): Promise<void> {
  const now = deps.now()
  const worth = persistenceWorthAsking({
    persisted: await deps.persisted(),
    installed: deps.installed(),
    serves: await deps.filedSince(-Infinity),
    firstFiledAt: await deps.firstFiledAt(),
    askedAt: deps.readPrefs().persistAskedAt,
    now,
  })
  if (!worth) return
  deps.writePrefs({ askedToPersist: true, persistAskedAt: now })
  await deps.askPersistence()
}

/** Only one pass runs at a time. A save that finds one running leaves it to the next save. */
let running = false

/**
 * What the app does after a report is saved. Call it and forget it: it waits for
 * idle time, never rejects, and a second call while one runs does nothing.
 *
 * `practiceServes` is for a practice session, one row however many serves it read,
 * so a player who only films long clips is covered too.
 */
export async function protectAfterSave(o: { practiceServes?: number } = {}, deps: ProtectDeps = REAL_DEPS): Promise<void> {
  if (running) return
  running = true
  try {
    await deps.pause()
    await safely(() => askForPersistence(deps), undefined)
    await safely(() => snapshotIfDue(o.practiceServes ?? 0, deps), undefined)
  } finally {
    running = false
  }
}

/** The honest sentence. Every path says what only a file protects from. */
export function protectionLine(o: { available: boolean; serves?: number; persisted: boolean; mayClear: boolean }): string {
  if (!o.available) return 'This browser gives me nowhere to keep a safety copy. A backup file is your one safeguard.'
  if (!o.serves) return 'No safety copy yet. I make one here once you have filmed a serve, and only a file survives a lost phone.'
  const what = o.serves === 1 ? '1 serve' : `${o.serves} serves`
  const beyond = o.mayClear ? 'a lost phone or Safari clearing this site' : o.persisted ? 'a lost phone' : 'a lost phone or a cleared browser'
  return cue(`My copy of ${what} covers a damaged history or a mistaken clear; only a file survives ${beyond}.`)
}

/** What is true now, for Settings. Reads the shelf's names and nothing else. */
export async function protectionStatus(deps: ProtectDeps = REAL_DEPS): Promise<ProtectionStatus> {
  const [persisted, shelf] = await Promise.all([safely(() => deps.persisted(), false), safely(() => deps.shelf(), undefined)])
  const newest = shelf ? snapshotsOn(await safely(() => shelf.names(), []))[0] : undefined
  const mayClear = deps.ios() && !deps.installed()
  return {
    persisted,
    mayClear,
    ...(newest ? { lastSnapshotAt: newest.at, lastSnapshotServes: newest.serves } : {}),
    line: protectionLine({ available: !!shelf, serves: newest?.serves, persisted, mayClear }),
  }
}

/** The copy a restore reads first: the most serves, the newer of two equal. */
const fullest = (held: readonly SnapshotMeta[]) => [...held].sort((a, b) => b.serves - a.serves || b.at - a.at)

/**
 * Whether a history looks lost, against the serves a copy holds.
 *
 * Emptied: nothing on file. Damaged: the store would not open, or holds rows that
 * will not read. A store that merely holds fewer serves than a copy is neither,
 * since a player deletes serves and the disk prunes them, and an offer that
 * brought those back would be wrong. Silent once the store holds as many as the
 * copy, which is also what ends it after a restore.
 */
export function recoveryReason(o: { opened: boolean; rows: number; readable: number; held?: number }): RecoveryReason | undefined {
  if (!o.held || o.readable >= o.held) return undefined
  if (!o.opened || o.rows > o.readable) return 'damaged'
  return o.readable === 0 ? 'emptied' : undefined
}

export function recoveryLine(reason: RecoveryReason, serves: number, at: number): string {
  const what = `a copy of ${serves === 1 ? '1 serve' : `${serves} serves`} from ${shortDate(at)}`
  return cue(reason === 'emptied' ? `Your history is empty, and I have ${what}. Restore it?` : `Part of your history will not open, and I have ${what}. Restore it?`)
}

/**
 * A restore worth offering, or nothing. `readable` is how many reports the app
 * just loaded, when it has that to hand; otherwise the store is read to count them.
 */
export async function recoveryOffer(readable?: number, deps: ProtectDeps = REAL_DEPS): Promise<RecoveryOffer | undefined> {
  const shelf = await safely(() => deps.shelf(), undefined)
  if (!shelf) return undefined
  const best = fullest(snapshotsOn(await safely(() => shelf.names(), [])))[0]
  if (!best) return undefined
  const rows = await safely<number | undefined>(() => deps.rows(), undefined)
  const count = readable ?? (await safely(() => deps.readable(), 0))
  const reason = recoveryReason({ opened: rows !== undefined, rows: rows ?? 0, readable: count, held: best.serves })
  return reason && { reason, serves: best.serves, at: best.at, line: recoveryLine(reason, best.serves, best.at) }
}

/**
 * Bring a copy back through the existing import, the fullest first, falling back
 * to the other when one will not read. Merges like any restore: a report on file
 * and newer stays, and a row that would not read is written over. Resolves to the
 * import's own tally, or to nothing when no copy could be read.
 */
export async function restoreFromSnapshot(deps: ProtectDeps = REAL_DEPS): Promise<ImportResult | undefined> {
  const shelf = await safely(() => deps.shelf(), undefined)
  if (!shelf) return undefined
  for (const copy of fullest(snapshotsOn(await safely(() => shelf.names(), [])))) {
    const text = await safely(() => shelf.read(copy.name), undefined)
    if (!text) continue
    try {
      return await deps.restore(text)
    } catch {
      // Unreadable, or the store refused it: the other copy may yet do.
    }
  }
  return undefined
}

/** Every copy gone: "Start fresh" on a restore offer. */
export async function forgetSnapshots(deps: ProtectDeps = REAL_DEPS): Promise<void> {
  const shelf = await safely(() => deps.shelf(), undefined)
  if (!shelf) return
  for (const copy of snapshotsOn(await safely(() => shelf.names(), []))) await safely(() => shelf.remove(copy.name), undefined)
}

/* --------------------------------------------------------------- the shelves */

/** A folder of the origin-private file system as a shelf. `createWritable` commits on close, so a copy is whole or absent. */
export function folderShelf(dir: FileSystemDirectoryHandle): SnapshotShelf {
  return {
    kind: 'opfs',
    async names() {
      const out: string[] = []
      for await (const handle of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
        if (handle.kind === 'file') out.push(handle.name)
      }
      return out
    },
    async read(name) {
      const file = await (await dir.getFileHandle(name)).getFile()
      return file.text()
    },
    async write(name, text) {
      const handle = await dir.getFileHandle(name, { create: true })
      try {
        const writable = await handle.createWritable()
        await writable.write(text)
        await writable.close()
      } catch (err) {
        await dir.removeEntry(name).catch(() => undefined)
        throw err
      }
    },
    remove: (name) => dir.removeEntry(name),
  }
}

function openShelf(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(SHELF_DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SHELF_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open the snapshot shelf'))
  })
}

/** One request against the shelf's own database, opened and closed around it. */
async function onShelf<T>(idb: IDBFactory, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openShelf(idb)
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(SHELF_STORE, mode)
      const req = run(t.objectStore(SHELF_STORE))
      t.oncomplete = () => resolve(req.result)
      t.onerror = t.onabort = () => reject(t.error ?? new Error('The snapshot shelf refused that'))
    })
  } finally {
    db.close()
  }
}

/** A database of its own as a shelf: what a browser with no writable private file system gets. */
export function databaseShelf(idb: IDBFactory): SnapshotShelf {
  return {
    kind: 'idb',
    names: async () => (await onShelf(idb, 'readonly', (s) => s.getAllKeys())).map(String),
    read: (name) => onShelf<string | undefined>(idb, 'readonly', (s) => s.get(name)),
    write: async (name, text) => {
      await onShelf(idb, 'readwrite', (s) => s.put(text, name))
    },
    remove: (name) => onShelf(idb, 'readwrite', (s) => s.delete(name)),
  }
}

/** The private file system where a page can write there, otherwise a database of its own. */
async function deviceShelf(): Promise<SnapshotShelf | undefined> {
  try {
    if (clipStoreAvailable()) {
      const root = await navigator.storage.getDirectory()
      return folderShelf(await root.getDirectoryHandle(DIR, { create: true }))
    }
  } catch {
    // A private window, say. The database may still do.
  }
  return typeof indexedDB === 'undefined' ? undefined : databaseShelf(indexedDB)
}

/** Idle time, or a short wait where a browser has no such thing: iOS. */
const breathe = (): Promise<void> =>
  new Promise((resolve) => {
    const idle = (globalThis as { requestIdleCallback?: (run: () => void, o: { timeout: number }) => void }).requestIdleCallback
    if (idle) idle(resolve, { timeout: 2000 })
    else setTimeout(resolve, 50)
  })

const REAL_DEPS: ProtectDeps = {
  now: () => Date.now(),
  pause: breathe,
  shelf: deviceShelf,
  // Summaries rather than whole reports: the photographs are never read back.
  build: () => buildBackup({ ...REAL_STORE, listSessions: listSummaries }),
  filedSince: countFiledSince,
  firstFiledAt,
  rows: countRows,
  readable: async () => (await listSummaries()).length,
  restore: (text) => importBackup(text),
  estimate: async () => {
    const e = await navigator.storage?.estimate?.().catch(() => undefined)
    return e?.quota ? { usage: e.usage ?? 0, quota: e.quota } : undefined
  },
  persisted: isPersisted,
  askPersistence: requestPersistence,
  installed: isInstalled,
  ios: isIOS,
  readPrefs,
  writePrefs,
}
