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
  normalise,
  normalisePracticeLog,
  normaliseServeTag,
  pruneSessions,
  safely,
  savePracticeSession,
  saveSession,
  tagServe,
  type PracticeLog,
  type ServeTag,
  type Session,
} from './db'
import { SERVE_TYPES } from '../analysis/coaching'
import { normalisePracticeSession, type PracticeSession } from '../session/session'
import { DEFAULTS, readPrefs, writePrefs, type Prefs } from './prefs'
import { normaliseTripRecord, type TripRecord } from './ledger'
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
  /**
   * Taps brought in, and taps left behind.
   *
   * Counted apart from the drill records for the same reason those are counted
   * apart from reports: they are a different kind of claim, and a restore that
   * added sixty reports and dropped forty tags should be able to say so. Most
   * of the skips will be orphans — tags for reports the prune dropped on the
   * way in — which is a normal outcome rather than a failure.
   */
  tags: number
  skippedTags: number
  /** Practice sessions brought in (L2.5). */
  practiceSessions: number
  /** Trips in the season ledger the file added or filled in (L3.3). */
  trips: number
  /**
   * Reports on this phone, old or restored, that the store deleted to make
   * room while the file was read in (L3.3). Their trips stay in the ledger.
   * Counted rather than left for the player to find: a restore that said
   * "60 added" and then quietly kept forty is the gap this closes.
   */
  pruned: number
  /**
   * Whether the file filled in a preference this device did not have.
   *
   * A boolean rather than a count: the three that travel are one fact about the
   * player, and "2 preferences restored" is a number nobody can act on. What
   * the panel needs to know is whether to say anything at all.
   */
  prefs?: boolean
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
export async function importBackup(
  text: string,
  store: BackupStore = REAL_STORE,
): Promise<ImportResult> {
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

  const existing = new Map((await store.listSessions()).map((s) => [s.id, s]))
  const result: ImportResult = {
    trips: 0,
    pruned: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    logs: 0,
    skippedLogs: 0,
    tags: 0,
    skippedTags: 0,
    practiceSessions: 0,
  }

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
      await store.saveSession(session as Analysis, false)
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
      const here = new Map((await store.listPracticeLogs()).map((l) => [l.id, l]))
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
        await store.logPractice(log)
        result.logs++
      }
    }, undefined)
  }

  /*
   * And what the player said about individual serves.
   *
   * Last, and after the pruning, which is not tidiness — it is the only order
   * that can tell an orphan from a survivor. A tag is keyed by a report id, and
   * `restoreBackup` prunes as it goes, so a backup written on a phone with
   * sixty reports restored onto one that already had fifty carries tags for
   * serves that no longer exist by the time this runs. Storing those would fill
   * the tag store with rows about serves nobody can open, which is exactly the
   * lifetime `TAG_STORE` was keyed by report id to avoid.
   *
   * Checked against what is actually in the database rather than against the
   * backup's own session list, because the two differ precisely in the case
   * that matters.
   *
   * Failures do not fail the import, for the reason the practice log gives:
   * the reports are the history, and losing a tap must never be why somebody
   * cannot restore their serves.
   */
  /*
   * Practice sessions, newest edit wins, the rule tags follow. Best-effort for
   * the same reason: the reports are the history.
   */
  const practiceSessions = Array.isArray(backup.practiceSessions) ? backup.practiceSessions : []
  if (practiceSessions.length && store.listPracticeSessions && store.savePracticeSession) {
    await safely(async () => {
      const here = new Map((await store.listPracticeSessions!()).map((p) => [p.id, p]))
      for (const raw of practiceSessions) {
        const session = normalisePracticeSession(raw)
        if (!session) continue
        const mine = here.get(session.id)
        if (mine && mine.updatedAt >= session.updatedAt) continue
        await store.savePracticeSession!(session)
        result.practiceSessions++
      }
    }, undefined)
  }

  const tags = Array.isArray(backup.tags) ? backup.tags : []
  if (tags.length) {
    await safely(async () => {
      const live = new Set((await store.listSessions()).map((s) => s.id))
      const here = new Map((await store.listServeTags()).map((t) => [t.id, t]))
      for (const raw of tags) {
        const tag = normaliseServeTag(raw)
        if (!tag || !live.has(tag.id)) {
          result.skippedTags++
          continue
        }
        // Newest tap wins, the rule the practice log already sets — and it is
        // the right one here too: a tag is the player correcting the record,
        // so the later correction is the one they meant.
        const mine = here.get(tag.id)
        if (mine && mine.taggedAt >= tag.taggedAt) {
          result.skippedTags++
          continue
        }
        await store.tagServe(tag)
        result.tags++
      }
    }, undefined)
  }

  /*
   * Who the player is, restored only where this device has no answer of its own.
   *
   * FILLED IN, NEVER OVERWRITTEN, and that is the whole design. The common case
   * is a fresh install on a new phone, where every one of these is unset and the
   * file is the only thing that knows them — that is the gap this closes. The
   * other case is a player importing a file into a phone they already use, and
   * there the local answer is the newer statement of who they are: a file
   * exported in March must not silently move somebody back to a rung they have
   * since climbed off, or flip the hand they corrected last week.
   *
   * `serveType` is the weakest of the three and is treated identically rather
   * than specially — it is what they were last working on, and the report offers
   * it as three chips one tap apart, so getting it wrong costs a tap and getting
   * it right saves one.
   *
   * Best-effort, like the drill records above: `localStorage` throws outright in
   * a Safari private window, and a preference that cannot be written must never
   * be the reason a history fails to restore.
   */
  const prefs = backup.prefs
  if (prefs && typeof prefs === 'object') {
    await safely(async () => {
      const here = store.readPrefs()
      const patch: Partial<Prefs> = {}
      if (!here.handedness && (prefs.handedness === 'left' || prefs.handedness === 'right')) {
        patch.handedness = prefs.handedness
      }
      if (here.tier === undefined && typeof prefs.tier === 'number' && Number.isFinite(prefs.tier)) {
        patch.tier = prefs.tier
      }
      /*
       * `serveType` always has a value, so "has this device answered" cannot be
       * read off its presence. The default is the answer nobody chose.
       *
       * Checked for membership in `SERVE_TYPES` as well, not merely for being
       * different from the default — the same rule `normalise` applies to the
       * field on a stored report, and for the same reason: three screens index
       * that table with no guard, so a hand-edited `"banana"` is not a
       * mislabelled preference, it is a blank report the next time one opens.
       */
      if (
        here.serveType === DEFAULTS.serveType &&
        prefs.serveType &&
        prefs.serveType !== DEFAULTS.serveType &&
        prefs.serveType in SERVE_TYPES
      ) {
        patch.serveType = prefs.serveType
      }
      // Sets merged by when they began, so neither phone's records are lost.
      if (Array.isArray(prefs.sets) && prefs.sets.length) {
        const mine = here.sets ?? []
        const seen = new Set(mine.map((s) => s.startedAt))
        const theirs = prefs.sets.filter(
          (s) =>
            s && typeof s.startedAt === 'number' && typeof s.inServes === 'number' && (s.serveNumber === 1 || s.serveNumber === 2) && !seen.has(s.startedAt),
        )
        if (theirs.length) patch.sets = [...mine, ...theirs].sort((a, b) => a.startedAt - b.startedAt)
      }
      /*
       * The plan (D1.1), on the same rule as the hand: what this phone has
       * already decided stands, and the file fills only what it has not. A
       * ladder is filled fault by fault, with the times its step moved, so a
       * fault started on the new phone keeps its own step.
       */
      const goal = prefs.goal as Prefs['goal'] | undefined
      if (
        !here.goal &&
        goal &&
        typeof goal.startedAt === 'number' &&
        (goal.kind === 'speed' || goal.kind === 'second' || (goal.kind === 'fault' && typeof goal.flaw === 'string'))
      ) {
        patch.goal = goal
      }
      const rung = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 20
      const time = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
      if (prefs.ladder && typeof prefs.ladder === 'object') {
        const ladder = { ...(here.ladder ?? {}) }
        const moved = { ...(here.ladderMovedAt ?? {}) }
        const passed = { ...(here.ladderPassedAt ?? {}) }
        let filled = false
        for (const [flaw, step] of Object.entries(prefs.ladder)) {
          if (ladder[flaw] !== undefined || !rung(step)) continue
          ladder[flaw] = step
          const m = prefs.ladderMovedAt?.[flaw]
          const p = prefs.ladderPassedAt?.[flaw]
          if (time(m)) moved[flaw] = m
          if (time(p)) passed[flaw] = p
          filled = true
        }
        if (filled) Object.assign(patch, { ladder, ladderMovedAt: moved, ladderPassedAt: passed })
      }
      if (!here.cadence && (prefs.cadence === 'weekly' || prefs.cadence === 'fortnightly' || prefs.cadence === 'monthly')) patch.cadence = prefs.cadence
      if (!here.courtMinutes && (prefs.courtMinutes === 30 || prefs.courtMinutes === 45 || prefs.courtMinutes === 60)) {
        patch.courtMinutes = prefs.courtMinutes
      }
      if (Object.keys(patch).length) {
        store.writePrefs(patch)
        result.prefs = true
      }
    }, undefined)
  }

  /*
   * The season (L3.3): the file's ledger rows, then every trip of the reports
   * now on file, both merged on the ledger's own rule — more serves wins — so
   * a row from a phone that had pruned a trip survives a restore onto a phone
   * holding only part of it. Best-effort: the reports are the history.
   */
  const trips = Array.isArray(backup.trips) ? backup.trips : []
  await safely(async () => {
    if (store.listTripRecords && store.saveTripRecords && trips.length) {
      const before = (await store.listTripRecords()).length
      const rows = trips.map(normaliseTripRecord).filter((r): r is TripRecord => r !== undefined)
      await store.saveTripRecords(rows)
      result.trips = Math.max(0, (await store.listTripRecords()).length - before)
    }
    if (store.recordTrips) await store.recordTrips(await store.listSessions())
  }, undefined)

  // Once, over the store the import actually left behind — and what was
  // deleted along the way, by the quota ladder inside a save or by this.
  await store.pruneSessions()
  const after = await safely(async () => (await store.listSessions()).length, existing.size + result.added)
  result.pruned = Math.max(0, existing.size + result.added - after)

  return result
}
