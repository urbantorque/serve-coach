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
  listSessions,
  logPractice,
  normalise,
  normalisePracticeLog,
  pruneSessions,
  safely,
  saveSession,
  type PracticeLog,
  type Session,
} from './db'
import type { Analysis } from '../analysis/types'

const FORMAT = 'serve-coach-backup'
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

/**
 * Is this running as an installed app?
 *
 * On iOS this is the only thing that exempts a site from the seven-day storage
 * clearance, which makes it the single most effective thing a player can do to
 * keep their history — and worth asking them to do, once.
 */
export function isInstalled(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // Safari's own, pre-standard flag. Still the only signal on iOS.
      (navigator as unknown as { standalone?: boolean }).standalone === true
    )
  } catch {
    return false
  }
}

export const isIOS = (): boolean => {
  try {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPadOS reports itself as a Mac; the touch points give it away.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
  } catch {
    return false
  }
}

export async function buildBackup(): Promise<Backup> {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: Date.now(),
    sessions: await listSessions(),
    practice: await listPracticeLogs(),
  }
}

/** Hand the history to the player as a file. */
export async function downloadBackup(): Promise<number> {
  const backup = await buildBackup()
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // Local date — toISOString is UTC, and an evening export west of Greenwich
  // would be stamped with tomorrow's date.
  const d = new Date(backup.exportedAt)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  a.download = `serve-coach-${stamp}.json`
  a.click()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return backup.sessions.length
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  /**
   * Readable, newer than what is on file, and still not written — storage
   * refused it even after `saveSession`'s own pressure ladder ran.
   *
   * Counted apart from `skipped`, which means the opposite thing: a row that
   * was never going to change anything. A failed row might still fit once
   * something else is deleted, and a player told "4 skipped" would have no
   * reason to think freeing space and importing again could recover it.
   */
  failed: number
  /** Drill records brought in. Counted apart from reports — they are not serves. */
  logs: number
  skippedLogs: number
}

/**
 * Read a backup back in.
 *
 * Merges rather than replaces, and every report goes through the same
 * `normalise` that reads from storage — a file exported by an older version is
 * exactly the case that function exists for, and a hand-edited or truncated one
 * must not be able to put an unrenderable report into the database.
 *
 * A report already present wins if it is the newer of the two, so importing an
 * old backup onto a phone that has kept training does not roll it back.
 */
export async function importBackup(text: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not readable. Pick the .json file the app exported.')
  }

  const backup = parsed as Partial<Backup>
  if (!backup || backup.format !== FORMAT || !Array.isArray(backup.sessions)) {
    throw new Error('That does not look like a Serve Coach backup.')
  }

  const existing = new Map((await listSessions()).map((s) => [s.id, s]))
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, failed: 0, logs: 0, skippedLogs: 0 }

  for (const raw of backup.sessions) {
    const session = normalise(raw)
    if (!session) {
      result.skipped++
      continue
    }
    const here = existing.get(session.id)
    if (here && here.createdAt >= session.createdAt) {
      result.skipped++
      continue
    }
    // A clip the engine refused never enters the record — `saveSession` drops it
    // on the way in. Counted here rather than reported as added, or the panel
    // tells the player nine serves arrived and the history then shows eight.
    if (session.triage?.status === 'rejected') {
      result.skipped++
      continue
    }
    // `saveSession` takes an Analysis and strips the frames a report never had.
    // Unbounded: pruning per report would re-read the whole store once per row.
    //
    // Caught per row rather than left to abort the loop. Unguarded, one report
    // that still would not fit after saveSession's own retries lost every row
    // after it in the file too — and did so silently, because the caller never
    // learns the tally already reached before the throw. Each row gets its own
    // honest attempt: `saveSession` already strips stills and deletes old
    // reports before giving up, and that ladder ran again for this row alone.
    try {
      await saveSession(session as Analysis, false)
      if (here) result.updated++
      else result.added++
    } catch {
      result.failed++
    }
  }

  /*
   * The player's own records, merged on the same terms.
   *
   * Newer wins, per log rather than per file: two phones can each hold drills
   * the other never saw, and a restore that replaced the list would delete
   * whichever side was not in the file. `doneAt` is the comparison because it is
   * the moment the log is about — `assignedAt` can be older on the newer record
   * when a drill sat on the card for a week.
   *
   * Failures here do not fail the import. The reports are the history; a drill
   * tick is a note beside them, and losing one must never be the reason somebody
   * cannot restore their serves.
   */
  const logs = Array.isArray(backup.practice) ? backup.practice : []
  if (logs.length) {
    await safely(async () => {
      const here = new Map((await listPracticeLogs()).map((l) => [l.id, l]))
      for (const raw of logs) {
        const log = normalisePracticeLog(raw)
        if (!log) {
          result.skippedLogs++
          continue
        }
        const mine = here.get(log.id)
        if (mine && mine.doneAt >= log.doneAt) {
          result.skippedLogs++
          continue
        }
        await logPractice(log)
        result.logs++
      }
    }, undefined)
  }

  // Once, over the store the import actually left behind.
  await pruneSessions()

  return result
}
