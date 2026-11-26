/**
 * Keeping the training history, and letting the player take it with them.
 *
 * The trend chart and the practice advice are the reason to come back, and both
 * are built from reports in IndexedDB — which browsers treat as disposable.
 * Safari clears all script-writable storage after seven days without a visit
 * unless the site has been added to the home screen, and a club player who films
 * every other weekend crosses that line constantly. Losing three months of
 * progress silently is the one failure the careful pruning in `db.ts` cannot
 * defend against, because it is not the app doing the deleting.
 *
 * Two defences, because neither is sufficient alone. `persist()` asks the
 * browser not to evict; it is granted on engagement signals and can be refused.
 * Export is the one that always works and is the only way the history survives a
 * new phone — and it keeps the privacy promise intact, because the player is the
 * one who moves the file.
 */
import {
  listPracticeLogs,
  listPracticeSessions,
  listServeTags,
  listSessions,
  listTripRecords,
  recordTrips,
  saveTripRecords,
  logPractice,
  pruneSessions,
  savePracticeSession,
  saveSession,
  tagServe,
  type PracticeLog,
  type ServeTag,
  type Session,
} from './db'
import type { PracticeSession } from '../session/session'
import { readPrefs, writePrefs, type Prefs } from './prefs'
import type { TripRecord } from './ledger'
import type { Analysis } from '../analysis/types'

export const FORMAT = 'serve-coach-backup'
const VERSION = 1

export interface Backup {
  format: typeof FORMAT
  version: number
  exportedAt: number
  sessions: Session[]
  /**
   * What the player did about the reports, when there is any.
   *
   * Optional, and the reader treats a missing list as an empty one, because
   * every backup written before this existed has no such key — and a restore
   * that refused those would strand the histories most worth carrying to a new
   * phone. `version` is deliberately not bumped for the same reason: nothing
   * about the old shape became unreadable, it gained a field no old reader
   * looks at and no new reader requires.
   */
  practice?: PracticeLog[]
  /**
   * Who the player is, as opposed to what they have filmed.
   *
   * THREE FIELDS, NOT THE WHOLE OF `Prefs`, and the split is the point. A backup
   * carried the reports and the drill records and left these behind entirely, so
   * a history restored onto a new phone arrived judged against different target
   * bands than it was built with: `tier` moves every band the diagnostic pass
   * uses, and it reverts to unstated on a fresh install — the app then estimates
   * a rung from the next serve, and the trend the player is looking at was
   * scored against a rung they had chosen. Handedness was the visible half of
   * the same gap: the panel promises the file moves a history to a new phone,
   * and the new phone opens by asking which hand they serve with.
   *
   * `seenFilmingGuide` and `askedToPersist` are deliberately absent. Both are
   * facts about *this install* rather than about the player — whether this
   * browser has shown the guide, whether this origin has asked for persistent
   * storage — and restoring them onto a fresh phone would silently skip the
   * first-run guide and suppress the persistence request on exactly the device
   * where both matter most.
   *
   * Optional, and `version` is not bumped, for the reason `practice` gives above
   * its own field: nothing about the old shape became unreadable.
   */
  prefs?: Pick<
    Prefs,
    'handedness' | 'tier' | 'serveType' | 'sets' | 'goal' | 'ladder' | 'ladderMovedAt' | 'ladderPassedAt' | 'cadence' | 'courtMinutes'
  >
  /**
   * What the player said about individual serves — which serve it was, and
   * where it landed.
   *
   * MISSING UNTIL NOW, AND THAT WAS DATA LOSS THIS FILE PROMISES NOT TO HAVE.
   * The tag store arrived in R53·2a and gained outcomes in R56, and neither
   * round came back here. A player who moved to a new phone kept every report
   * and every drill record and silently lost every tap they had made about
   * their own serves — the one part of the history the camera did not produce.
   *
   * Optional and no version bump, for the reason `practice` gives above.
   *
   * Keyed by report id, which makes this the one carried list whose rows can be
   * orphaned by the restore itself: `restoreBackup` prunes as it goes, so a tag
   * can arrive for a report that has just been dropped. See the restore, which
   * refuses those rather than storing a tag about a serve nobody can look at —
   * the same lifetime rule `TAG_STORE` states in `db.ts`.
   */
  tags?: ServeTag[]
  /**
   * Practice sessions (L2.5): one row per long clip, a line per serve read.
   * Optional and no version bump, for the reason `practice` gives above.
   */
  practiceSessions?: PracticeSession[]
  /**
   * The season ledger (L3.3): one row per trip, including the trips whose
   * reports this phone has already pruned. Optional and no version bump, for
   * the reason `practice` gives above.
   */
  trips?: TripRecord[]
}

/**
 * The preferences a backup carries, pulled out of the whole set.
 *
 * A function rather than a spread at the call site so that the export and the
 * restore cannot disagree about which three travel — the failure this whole
 * field is fixing is two places holding different ideas about what moves with a
 * player.
 */
export function portablePrefs(p: Prefs): Backup['prefs'] {
  // Finished sets travel too (L3.7): a record is about the player, not the phone.
  // And the plan (D1.1): the goal, the step reached on each ladder and when it
  // moved, how often they get to a court and for how long. A paid player must
  // not lose a plan with a phone, and none of it is about the install.
  return {
    handedness: p.handedness,
    tier: p.tier,
    serveType: p.serveType,
    ...(p.sets?.length ? { sets: p.sets } : {}),
    ...(p.goal ? { goal: p.goal } : {}),
    ...(p.ladder && Object.keys(p.ladder).length ? { ladder: p.ladder } : {}),
    ...(p.ladderMovedAt && Object.keys(p.ladderMovedAt).length ? { ladderMovedAt: p.ladderMovedAt } : {}),
    ...(p.ladderPassedAt && Object.keys(p.ladderPassedAt).length ? { ladderPassedAt: p.ladderPassedAt } : {}),
    ...(p.cadence ? { cadence: p.cadence } : {}),
    ...(p.courtMinutes ? { courtMinutes: p.courtMinutes } : {}),
  }
}

/**
 * Ask the browser to stop evicting our data.
 *
 * Best-effort and unprompted in most browsers: Chrome grants it on engagement
 * signals such as being installed or bookmarked, Firefox may show a permission
 * prompt, and Safari does not implement the guarantee at all. Worth asking
 * regardless — where it is granted it is the difference between a history that
 * survives and one that quietly does not.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Whether the browser has already promised to keep our data. */
export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

// In `platform.ts` since Mirror M0.4, so the entry can ask them without the
// backup code; said here too for every importer that reads them from here.
export { isInstalled, isIOS } from '../platform'

/**
 * The storage an import reads and writes through.
 *
 * Named and injected for the same reason `recordingType` takes its two probes:
 * everything interesting about a restore is the merge — which side wins, what
 * is quietly dropped, what happens when one row will not fit — and none of it
 * needs IndexedDB to be interesting. Left implicit, the whole of this module
 * was reachable only from a browser with a database in it, which is to say it
 * was never tested at all, on the one code path that carries a player's entire
 * history to a new phone.
 *
 * The default is the real database, so nothing that does not pass a store
 * changes behaviour.
 */
export interface BackupStore {
  listSessions(): Promise<Session[]>
  saveSession(analysis: Analysis, prune?: boolean): Promise<void>
  listPracticeLogs(): Promise<PracticeLog[]>
  logPractice(log: PracticeLog): Promise<void>
  listServeTags(): Promise<ServeTag[]>
  tagServe(tag: ServeTag): Promise<void>
  /** Resolves to how many reports it deleted, where the store can say. */
  pruneSessions(): Promise<number | void>
  /**
   * The two halves of preferences, on the same seam as the rest.
   *
   * `readPrefs`/`writePrefs` read `localStorage` directly and are safe to call
   * anywhere in a browser — but the point of this interface is that the whole
   * file can be driven without one, and prefs are now part of what a backup
   * carries. Left off, every test of the export would have to provide a
   * `localStorage` shim to exercise a field it does not care about.
   */
  readPrefs(): Prefs
  writePrefs(patch: Partial<Prefs>): Prefs
  /** Optional on the seam, so a store written before sessions existed still drives the file. */
  listPracticeSessions?(): Promise<PracticeSession[]>
  savePracticeSession?(session: PracticeSession): Promise<void>
  /** The season ledger (L3.3), optional on the seam for the same reason. */
  listTripRecords?(): Promise<TripRecord[]>
  saveTripRecords?(records: readonly TripRecord[]): Promise<void>
  /** Fold the trips of the reports on file into the ledger. */
  recordTrips?(sessions: readonly Session[]): Promise<void>
}

export const REAL_STORE: BackupStore = {
  listSessions,
  saveSession,
  listPracticeLogs,
  logPractice,
  listServeTags,
  tagServe,
  pruneSessions,
  readPrefs,
  writePrefs,
  listPracticeSessions,
  savePracticeSession,
  listTripRecords,
  saveTripRecords,
  recordTrips,
}

export async function buildBackup(store: BackupStore = REAL_STORE): Promise<Backup> {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    sessions: await store.listSessions(),
    practice: await store.listPracticeLogs(),
    tags: await store.listServeTags(),
    ...(store.listPracticeSessions ? { practiceSessions: await store.listPracticeSessions() } : {}),
    ...(store.listTripRecords ? { trips: await store.listTripRecords() } : {}),
    // Read through the store like everything else here, so a test can drive the
    // whole file without a `localStorage`.
    prefs: portablePrefs(store.readPrefs()),
  }
}

/**
 * What an exported file is called.
 *
 * Local date rather than `toISOString`, which is UTC: an evening export west of
 * Greenwich would otherwise be stamped with tomorrow's date, and the stamp is
 * the only thing telling two exports apart in a downloads folder. The same
 * defect `recordingFileName` avoids, extracted here for the same reason — it
 * was three lines inside a function that also touches the DOM, so the one part
 * of it that can be checked without a browser could not be.
 */
export function backupFileName(at: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `serve-coach-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}.json`
}

/** Hand the history to the player as a file. */
export async function downloadBackup(): Promise<number> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName(new Date(backup.exportedAt))
  a.click()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  // From here or from Settings, an export is an export (L6.5).
  writePrefs({ lastExportedAt: backup.exportedAt })
  return backup.sessions.length
}
