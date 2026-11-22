/**
 * Restoring a backup (W5.1): split from `backup.ts` so the restore, which runs
 * rarely and only from Settings or a rolling copy, loads when it is used and
 * not with the first screen.
 */
import {
  normalise,
  normalisePracticeLog,
  normaliseServeTag,
  safely,
  type ServeTag,
} from './db'
import { SERVE_TYPES } from '../analysis/coaching'
import { normalisePracticeSession } from '../session/session'
import { DEFAULTS, type Prefs } from './prefs'
import { normaliseTripRecord, type TripRecord } from './ledger'
import type { Analysis } from '../analysis/types'
import { FORMAT, REAL_STORE, type Backup, type BackupStore } from './backup'

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
        const merged = mergeTags(mine, tag)
        if (!merged) {
          result.skippedTags++
          continue
        }
        await store.tagServe(merged)
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

/**
 * Two rows about one serve, as one (W5.1): the newer row's fields where it has
 * them, the older row's where it does not. Whole rows used to win, so a file
 * whose serve was later tagged "second serve" wiped the marks drawn on it on
 * this phone, and a mark drawn here beat an older outcome correction in the
 * file. Undefined when the file adds nothing this phone does not already hold.
 */
export function mergeTags(mine: ServeTag | undefined, theirs: ServeTag): ServeTag | undefined {
  if (!mine) return theirs
  const [newer, older] = mine.taggedAt >= theirs.taggedAt ? [mine, theirs] : [theirs, mine]
  const marks = newer.marks ?? older.marks
  const merged: ServeTag = {
    id: mine.id,
    serveNumber: newer.serveNumber ?? older.serveNumber,
    outcome: newer.outcome ?? older.outcome,
    ...(marks?.length ? { marks } : {}),
    taggedAt: newer.taggedAt,
  }
  const same = merged.serveNumber === mine.serveNumber && merged.outcome === mine.outcome && merged.marks === mine.marks
  return same ? undefined : merged
}
