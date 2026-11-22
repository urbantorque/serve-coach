/**
 * Carrying a training history to a new phone, and what a restore is allowed to
 * do to the one already there.
 *
 * This module had no tests at all until now, on the one path in the app that
 * moves a player's entire record between devices. It has already produced one
 * real defect — a save that failed after every retry looked exactly like one
 * that had succeeded, fixed in Phase 1 in `App.tsx` and `importBackup` alike —
 * and the closest thing to coverage since was one hand-driven export in a
 * browser during R30, which is a walk-through rather than a test.
 *
 * What made it untestable was not the logic, which is ordinary, but the
 * database underneath it. `BackupStore` is that dependency named and injected,
 * the same trade `recordingType` makes for its two capability probes, and the
 * store below is a plain Map. Everything checked here is the real
 * `importBackup` running against it — not a reimplementation of the merge.
 *
 * The rules being pinned are all rules about *losing* something, because that
 * is the only thing that matters here. A restore that adds nothing is an
 * annoyance; a restore that silently drops four reports, rolls a phone back to
 * an older state, or abandons every row after the first failure is the reason
 * somebody stops trusting the app with their history.
 */
import { backupFileName, buildBackup, type BackupStore } from '../backup'
import { importBackup } from '../restore'
import { DEFAULTS, type Prefs } from '../prefs'
import type { PracticeLog, ServeTag, Session } from '../db'
import type { Analysis } from '../../analysis/types'
import { sessionIdFor, type PracticeSession } from '../../session/session'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

/** A report as it appears in a backup file. */
function session(id: string, createdAt: number, overall = 60, extra: Partial<Session> = {}): Session {
  return {
    id,
    createdAt,
    overall,
    overallStatus: 'fair',
    serveType: 'flat',
    fundamentals: [
      {
        id: 'swing',
        label: 'Swing',
        score: overall,
        metrics: [{ id: 'dropDepth', label: 'Racket drop', score: overall }],
      },
    ],
    ...extra,
  } as unknown as Session
}

const log = (id: string, doneAt: number, metricId = 'dropDepth'): PracticeLog => ({
  id,
  metricId,
  drill: 'Wall drops',
  assignedAt: doneAt,
  doneAt,
})

/**
 * The database, as a Map.
 *
 * `refuse` names ids the store will not accept however many times it is asked,
 * standing in for a phone that is genuinely out of room after `saveSession`'s
 * own pressure ladder has already run and given up.
 */
function memoryStore(
  opts: {
    sessions?: Session[]
    logs?: PracticeLog[]
    /** What the player had already said about their own serves, before any import. */
    tags?: ServeTag[]
    refuse?: string[]
    /** What this device already knows about the player, before any import. */
    prefs?: Partial<Prefs>
    /** Make every preference write throw, as a private window does. */
    prefsReadOnly?: boolean
    /** Practice sessions already on this device; `false` for a store from before they existed. */
    practiceSessions?: PracticeSession[] | false
  } = {},
) {
  const sessions = new Map((opts.sessions ?? []).map((s) => [s.id, s]))
  const logs = new Map((opts.logs ?? []).map((l) => [l.id, l]))
  const tags = new Map((opts.tags ?? []).map((t) => [t.id, t]))
  const practiceSessions = new Map((opts.practiceSessions || []).map((p) => [p.id, p]))
  const refuse = new Set(opts.refuse ?? [])
  let prefs: Prefs = { ...DEFAULTS, ...opts.prefs }
  let prunes = 0

  const store: BackupStore = {
    listSessions: async () => [...sessions.values()].sort((a, b) => b.createdAt - a.createdAt),
    saveSession: async (analysis: Analysis) => {
      if (refuse.has(analysis.id)) throw new Error('QuotaExceededError')
      sessions.set(analysis.id, analysis as unknown as Session)
    },
    listServeTags: async () => [...tags.values()],
    tagServe: async (t: ServeTag) => {
      tags.set(t.id, t)
    },
    listPracticeLogs: async () => [...logs.values()].sort((a, b) => b.doneAt - a.doneAt),
    logPractice: async (l: PracticeLog) => {
      logs.set(l.id, l)
    },
    pruneSessions: async () => {
      prunes++
    },
    readPrefs: () => ({ ...prefs }),
    writePrefs: (patch: Partial<Prefs>) => {
      if (opts.prefsReadOnly) throw new Error('storage denied')
      prefs = { ...prefs, ...patch }
      return { ...prefs }
    },
    ...(opts.practiceSessions === false
      ? {}
      : {
          listPracticeSessions: async () => [...practiceSessions.values()],
          savePracticeSession: async (p: PracticeSession) => {
            practiceSessions.set(p.id, p)
          },
        }),
  }
  return { store, sessions, logs, practiceSessions, prunes: () => prunes, prefs: () => prefs }
}

const fileOf = (sessions: Session[], practice?: PracticeLog[]) =>
  JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 1_700_000_000_000,
    sessions,
    ...(practice ? { practice } : {}),
  })

/* ------------------------------------------------------- refusing a bad file */

heading('What is not a backup')

await check('a file that is not JSON is refused by name, not by stack trace', async () => {
  const { store } = memoryStore()
  let message = ''
  try {
    await importBackup('not json at all {', store)
  } catch (err) {
    message = (err as Error).message
  }
  // The player picked the wrong file. The sentence has to tell them which one
  // to pick instead, which is the whole difference between this and a throw.
  assert(/\.json file the app exported/.test(message), `unhelpful refusal: "${message}"`)
})

await check('valid JSON that is not ours is refused', async () => {
  const { store } = memoryStore()
  let message = ''
  try {
    await importBackup(JSON.stringify({ hello: 'world' }), store)
  } catch (err) {
    message = (err as Error).message
  }
  assert(/Serve Coach backup/.test(message), `unhelpful refusal: "${message}"`)
})

await check('our format with no sessions array is refused rather than half-read', async () => {
  const { store } = memoryStore()
  let threw = false
  try {
    await importBackup(JSON.stringify({ format: 'serve-coach-backup', version: 1 }), store)
  } catch {
    threw = true
  }
  assert(threw, 'a backup with no sessions key was accepted')
})

/* ------------------------------------------------------------- the merge itself */

heading('Merging a backup onto a phone that has kept training')

const onto = [session('a', 3_000, 60), session('b', 2_000, 55)]

const fresh = await (async () => {
  const m = memoryStore()
  const result = await importBackup(fileOf([session('c', 5_000, 70)]), m.store)
  return { result, m }
})()

await check('a report the phone has never seen is added', async () => {
  assert(fresh.result.added === 1, `added ${fresh.result.added}, expected 1`)
  assert(fresh.m.sessions.has('c'), 'the new report is not in the store')
})

const older = await (async () => {
  const m = memoryStore({ sessions: onto })
  // Same id, older than what is here. Importing an old backup onto a phone that
  // has kept training must not roll it back — this is the case the whole
  // newer-wins rule exists for.
  const result = await importBackup(fileOf([session('a', 1_000, 20)]), m.store)
  return { result, m }
})()

check('an older copy of a report already here does not roll the phone back', () => {
  assert(older.result.skipped === 1, `skipped ${older.result.skipped}, expected 1`)
  assert(older.result.updated === 0, 'an older report overwrote a newer one')
  assert(
    older.m.sessions.get('a')!.overall === 60,
    `the phone's own report was replaced: overall is now ${older.m.sessions.get('a')!.overall}`,
  )
})

const newer = await (async () => {
  const m = memoryStore({ sessions: onto })
  const result = await importBackup(fileOf([session('a', 9_000, 88)]), m.store)
  return { result, m }
})()

check('a newer copy of a report already here replaces it, and counts as updated', () => {
  assert(newer.result.updated === 1, `updated ${newer.result.updated}, expected 1`)
  assert(newer.result.added === 0, 'an update was counted as an addition')
  assert(newer.m.sessions.get('a')!.overall === 88, 'the newer report did not land')
})

check('a report identical in age is left alone rather than rewritten', () => {
  // `>=`, not `>`. Re-importing the same file twice must be a no-op, because
  // that is what somebody does when they are not sure the first one worked.
  assert(older.result.added === 0 && older.result.updated === 0, 'a same-age import wrote')
})

/* ------------------------------------------------- what must never get through */

heading('What a restore refuses to put back')

const rejected = await (async () => {
  const m = memoryStore()
  const result = await importBackup(
    fileOf([
      session('ok', 4_000, 70),
      session('bad', 5_000, 70, { triage: { status: 'rejected' } } as Partial<Session>),
    ]),
    m.store,
  )
  return { result, m }
})()

check('a clip the engine refused never re-enters the record', () => {
  // `saveSession` drops these on the way in, so counting one as added would tell
  // the player two serves arrived and then show them one.
  assert(!rejected.m.sessions.has('bad'), 'a rejected clip was restored into the history')
  assert(rejected.result.added === 1, `added ${rejected.result.added}, expected only the good one`)
  assert(rejected.result.skipped === 1, `skipped ${rejected.result.skipped}, expected the refusal`)
})

const damaged = await (async () => {
  const m = memoryStore()
  const result = await importBackup(
    fileOf([
      session('good', 4_000, 70),
      { id: 'no-fundamentals', createdAt: 5_000, overall: 70 } as unknown as Session,
      null as unknown as Session,
    ]),
    m.store,
  )
  return { result, m }
})()

check('a truncated or hand-edited row is skipped, and the rest still land', () => {
  // `normalise` is the same gate storage reads through, and this is exactly the
  // case it exists for. The important half is the second one: one unreadable
  // row must not cost the player the readable ones beside it.
  assert(damaged.m.sessions.has('good'), 'a good report was lost beside a damaged one')
  assert(damaged.result.added === 1, `added ${damaged.result.added}, expected 1`)
  assert(damaged.result.skipped === 2, `skipped ${damaged.result.skipped}, expected 2`)
})

const refused = await (async () => {
  const m = memoryStore({ refuse: ['second'] })
  const result = await importBackup(
    fileOf([
      session('first', 1_000),
      session('second', 2_000),
      session('third', 3_000),
      session('fourth', 4_000),
    ]),
    m.store,
  )
  return { result, m }
})()

check('one row that will not fit does not abandon every row after it', () => {
  // The Phase 1 defect, from the other side. Unguarded, a throw here lost every
  // remaining row in the file *and* the tally already reached, so the player was
  // told nothing at all had happened.
  note(`${refused.result.added} added, ${refused.result.failed} failed`)
  assert(refused.result.added === 3, `added ${refused.result.added} of the 3 that could fit`)
  assert(refused.m.sessions.has('fourth'), 'rows after the failure were abandoned')
})

check('a row that would not fit is counted as failed, not as skipped', () => {
  // They mean opposite things to a player. Skipped is "nothing would have
  // changed"; failed is "this might work once you free some space", and only one
  // of those is worth acting on.
  assert(refused.result.failed === 1, `failed ${refused.result.failed}, expected 1`)
  assert(refused.result.skipped === 0, `a full disk was reported as ${refused.result.skipped} skipped`)
})

/* ------------------------------------------------------------- drill records */

heading('The drills the player says they did')

const drills = await (async () => {
  const m = memoryStore({ logs: [log('kept', 5_000), log('stale', 1_000)] })
  const result = await importBackup(
    fileOf(
      [session('s', 9_000)],
      [log('kept', 2_000), log('stale', 8_000), log('new', 4_000), { id: 'junk' } as unknown as PracticeLog],
    ),
    m.store,
  )
  return { result, m }
})()

check('drill records merge per record, newer winning, rather than replacing the list', () => {
  // Two phones can each hold drills the other never saw. A restore that replaced
  // the list would delete whichever side was not in the file.
  assert(drills.m.logs.get('kept')!.doneAt === 5_000, "the phone's newer drill record was overwritten")
  assert(drills.m.logs.get('stale')!.doneAt === 8_000, "the file's newer drill record did not land")
  assert(drills.m.logs.has('new'), 'a drill record only the file had was lost')
})

check('an unidentifiable drill record is dropped without failing the import', () => {
  assert(drills.result.skippedLogs === 2, `skippedLogs ${drills.result.skippedLogs}, expected 2`)
  assert(drills.result.logs === 2, `logs ${drills.result.logs}, expected 2`)
})

check('drill records are counted apart from reports — they are not serves', () => {
  assert(drills.result.added === 1, `added ${drills.result.added}, expected the one report`)
})

const noLogs = await (async () => {
  const m = memoryStore()
  // Every backup written before drill records existed has no `practice` key, and
  // refusing those would strand exactly the histories most worth carrying.
  const result = await importBackup(fileOf([session('s', 1_000)]), m.store)
  return { result, m }
})()

check('a backup from before drill records existed still restores', () => {
  assert(noLogs.result.added === 1, 'an older backup format was refused')
  assert(noLogs.result.logs === 0 && noLogs.result.skippedLogs === 0, 'invented drill records')
})

/* -------------------------------------------------------------- housekeeping */

heading('After the merge')

await check('the store is pruned once, over what the import actually left behind', async () => {
  const m = memoryStore()
  await importBackup(fileOf([session('a', 1), session('b', 2), session('c', 3)]), m.store)
  // Once, not per row: pruning per report would re-read the whole store on every
  // row of the file.
  assert(m.prunes() === 1, `pruned ${m.prunes()} times for a three-report import`)
})

await check('an export carries both the reports and the drill records', async () => {
  const m = memoryStore({ sessions: onto, logs: [log('x', 1_000)] })
  const backup = await buildBackup(m.store)
  assert(backup.format === 'serve-coach-backup', 'the format tag is missing')
  assert(backup.sessions.length === 2, `exported ${backup.sessions.length} reports, expected 2`)
  assert(backup.practice?.length === 1, 'the drill records were left out of the export')
})

await check('a round trip through a file changes nothing', async () => {
  // The claim the whole feature rests on: what comes off one phone is what lands
  // on the next one.
  const from = memoryStore({ sessions: onto, logs: [log('x', 1_000)] })
  const backup = await buildBackup(from.store)
  const to = memoryStore()
  const result = await importBackup(JSON.stringify(backup), to.store)
  assert(result.added === 2, `${result.added} of 2 reports survived the round trip`)
  assert(result.logs === 1, `${result.logs} of 1 drill records survived the round trip`)
  for (const id of ['a', 'b']) assert(to.sessions.has(id), `report ${id} did not arrive`)
})

heading('What a court trip can read back off a phone')

await check('an analysis keeps what it cost, all the way into an exported file', async () => {
  // `COURT-CHECK.md` step 8 now says to read `cost` out of an exported backup
  // rather than to hold a stopwatch, which only works if the field survives
  // both `saveSession`'s spread and `normalise`'s. Neither whitelists fields,
  // and this is what says so — the instruction is worthless the day one of them
  // starts to.
  const timed = session('t', 1_000, 60, {
    cost: { ms: 24_310, coldEngine: false },
  } as Partial<Session>)
  const from = memoryStore({ sessions: [timed] })
  const backup = await buildBackup(from.store)
  const to = memoryStore()
  await importBackup(JSON.stringify(backup), to.store)

  const landed = to.sessions.get('t') as Session & { cost?: { ms: number; coldEngine: boolean } }
  assert(landed !== undefined, 'the timed report did not survive the round trip')
  assert(landed.cost?.ms === 24_310, `cost.ms came back as ${landed.cost?.ms}`)
  assert(landed.cost?.coldEngine === false, 'coldEngine did not survive')
  note('cost survives export and import, so a phone can report its own timings')
})

heading('What the file is called')

check('the stamp is local time, not UTC', () => {
  // Same defect `recordingFileName` avoids: an evening west of Greenwich stamped
  // with tomorrow's date, on the only thing telling two exports apart.
  const at = new Date(2026, 0, 2, 23, 30, 0)
  assert(
    backupFileName(at) === 'serve-coach-2026-01-02.json',
    `stamped ${backupFileName(at)} for a local 2 January`,
  )
})

check('months and days are padded, so the names sort', () => {
  assert(
    backupFileName(new Date(2026, 8, 5)) === 'serve-coach-2026-09-05.json',
    `unpadded: ${backupFileName(new Date(2026, 8, 5))}`,
  )
})

/* ------------------------------------------------- who the player is, moved */

heading('What a file says about the player, and what the phone already knows')

/** A backup file carrying preferences alongside its reports. */
const fileWithPrefs = (prefs: Partial<Prefs>) =>
  JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 1_700_000_000_000,
    sessions: [session('p', 5_000, 70)],
    prefs,
  })

await check('an export carries the three that describe the player', async () => {
  const { store } = memoryStore({ prefs: { handedness: 'left', tier: 4, serveType: 'kick' } })
  const backup = await buildBackup(store)
  assert(backup.prefs?.handedness === 'left', 'the hand did not travel')
  assert(backup.prefs?.tier === 4, 'the rating did not travel')
  assert(backup.prefs?.serveType === 'kick', 'the serve type did not travel')
})

await check('an export carries nothing about this install', async () => {
  const { store } = memoryStore({ prefs: { seenFilmingGuide: true, askedToPersist: true } })
  const backup = await buildBackup(store)
  const keys = Object.keys(backup.prefs ?? {})
  assert(
    !keys.includes('seenFilmingGuide') && !keys.includes('askedToPersist'),
    `an install-local flag was exported: ${keys.join(', ')}`,
  )
})

await check('an export carries the plan: the goal, each ladder step and when it moved, the cadence (D1.1)', async () => {
  const goal = { kind: 'fault' as const, flaw: 'shallow_drop', startedAt: 9 }
  const { store } = memoryStore({
    prefs: { goal, ladder: { shallow_drop: 2 }, ladderMovedAt: { shallow_drop: 7 }, ladderPassedAt: { shallow_drop: 7 }, cadence: 'weekly', courtMinutes: 45 },
  })
  const backup = await buildBackup(store)
  assert(backup.prefs?.goal?.kind === 'fault', 'the goal did not travel')
  assert(backup.prefs?.ladder?.shallow_drop === 2, 'the ladder step did not travel')
  assert(backup.prefs?.ladderMovedAt?.shallow_drop === 7, 'when the step moved did not travel')
  assert(backup.prefs?.cadence === 'weekly' && backup.prefs?.courtMinutes === 45, 'the cadence or court time did not travel')
})

await check('a fresh phone takes the plan; a phone with its own keeps it, fault by fault', async () => {
  const file = fileWithPrefs({
    goal: { kind: 'speed', startedAt: 3 },
    ladder: { shallow_drop: 2, toss_height: 1, bogus: -4 } as never,
    ladderMovedAt: { shallow_drop: 5, toss_height: 6 },
    cadence: 'fortnightly',
  })
  const fresh = memoryStore()
  await importBackup(file, fresh.store)
  assert(fresh.prefs().goal?.kind === 'speed', 'a fresh phone did not take the goal')
  assert(fresh.prefs().ladder?.shallow_drop === 2 && fresh.prefs().ladder?.toss_height === 1, 'a fresh phone did not take the ladders')
  assert(fresh.prefs().ladder?.bogus === undefined, 'a nonsense step was restored')
  assert(fresh.prefs().ladderMovedAt?.toss_height === 6, 'when the step moved was not restored')
  assert(fresh.prefs().cadence === 'fortnightly', 'a fresh phone did not take the cadence')

  const mine = memoryStore({ prefs: { goal: { kind: 'second', startedAt: 8 }, ladder: { shallow_drop: 0 }, cadence: 'weekly' } })
  await importBackup(file, mine.store)
  assert(mine.prefs().goal?.kind === 'second', 'an old file overwrote the goal this phone set')
  assert(mine.prefs().ladder?.shallow_drop === 0, 'an old file moved a step this phone had')
  assert(mine.prefs().ladder?.toss_height === 1, 'a fault this phone never started did not come across')
  assert(mine.prefs().cadence === 'weekly', 'an old file overwrote the cadence')
})

await check('a fresh phone takes the hand and the rating from the file', async () => {
  // The case this whole field exists for: a new device, where nothing local
  // knows any of this and the file is the only thing that does.
  const m = memoryStore()
  const result = await importBackup(fileWithPrefs({ handedness: 'left', tier: 4 }), m.store)
  assert(m.prefs().handedness === 'left', 'a fresh phone did not take the hand')
  assert(m.prefs().tier === 4, 'a fresh phone did not take the rating — every band moves with it')
  assert(result.prefs === true, 'the restore did not report that it filled anything in')
})

await check('a phone that already knows the player is not overwritten by an old file', async () => {
  // The other half. A file exported in March must not move somebody back to a
  // rung they have since climbed off, or flip a hand they corrected last week.
  const m = memoryStore({ prefs: { handedness: 'right', tier: 5 } })
  const result = await importBackup(fileWithPrefs({ handedness: 'left', tier: 2 }), m.store)
  assert(m.prefs().handedness === 'right', 'an imported file overwrote the hand this phone had set')
  assert(m.prefs().tier === 5, 'an imported file rolled the rating backwards')
  assert(!result.prefs, 'the restore claimed to have filled something in when it had not')
})

check('a rating of zero is a stated rating, not an absent one', () => {
  // `tier` is a number and the bottom rung is a legitimate answer, so a
  // presence check written with `||` or `!here.tier` would treat somebody on the
  // lowest rung as never having said.
  const m = memoryStore({ prefs: { tier: 0 } })
  assert(m.store.readPrefs().tier === 0, 'the fixture itself lost the zero')
  return importBackup(fileWithPrefs({ tier: 4 }), m.store).then(() => {
    assert(m.prefs().tier === 0, 'a stated rung of zero was treated as unstated and overwritten')
  })
})

await check('a serve type nobody chose is filled in; one they chose is not', async () => {
  const untouched = memoryStore()
  await importBackup(fileWithPrefs({ serveType: 'kick' }), untouched.store)
  assert(untouched.prefs().serveType === 'kick', 'the default serve type was not filled in')

  const chosen = memoryStore({ prefs: { serveType: 'slice' } })
  await importBackup(fileWithPrefs({ serveType: 'kick' }), chosen.store)
  assert(chosen.prefs().serveType === 'slice', 'a chosen serve type was overwritten')
})

await check('a backup written before preferences travelled still restores', async () => {
  const m = memoryStore()
  const result = await importBackup(fileOf([session('p', 5_000, 70)]), m.store)
  assert(result.added === 1, 'an older backup lost its reports')
  assert(!result.prefs, 'a file with no preferences claimed to have restored some')
})

await check('preferences that cannot be written do not fail the restore', async () => {
  // A Safari private window throws on every `localStorage` write. The reports
  // are the history; a preference is a note beside them.
  const m = memoryStore({ prefsReadOnly: true })
  const result = await importBackup(fileWithPrefs({ handedness: 'left' }), m.store)
  assert(result.added === 1, 'a denied preference write cost the player their reports')
  assert(!result.prefs, 'a failed write was reported as a restore')
})

await check('junk where the preferences should be is ignored rather than written', async () => {
  const m = memoryStore()
  const file = JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 1,
    sessions: [session('p', 5_000, 70)],
    prefs: { handedness: 'sideways', tier: 'four', serveType: 'banana' },
  })
  const result = await importBackup(file, m.store)
  assert(result.added === 1, 'a hand-edited preferences block cost the player their reports')
  assert(m.prefs().handedness === undefined, `"sideways" was written as a hand`)
  assert(m.prefs().tier === undefined, '"four" was written as a rating')
  assert(m.prefs().serveType === 'flat', '"banana" was written as a serve type')
})

/* ------------------------------- what the player said about their own serves */

heading('The taps, which the file did not carry until R74')

const tag = (id: string, taggedAt: number, extra: Partial<ServeTag> = {}): ServeTag => ({
  id,
  serveNumber: 2,
  taggedAt,
  ...extra,
})

await check('a tap survives the round trip', async () => {
  /*
   * The defect this round fixed. Two rounds added to the tag store — R53·2a
   * created it, R56 gave it outcomes — and neither came back here, so a player
   * moving to a new phone kept every report and every drill record and silently
   * lost the one part of the history the camera did not produce.
   */
  const from = memoryStore({
    sessions: [session('a', 1_000)],
    tags: [tag('a', 500, { outcome: 'net' })],
  })
  return buildBackup(from.store).then(async (b) => {
    assert(b.tags?.length === 1, `the export carried ${b.tags?.length ?? 0} taps`)
    const to = memoryStore({ sessions: [session('a', 1_000)] })
    const r = await importBackup(JSON.stringify(b), to.store)
    assert(r.tags === 1, `${r.tags} taps restored, ${r.skippedTags} skipped`)
    const landed = (await to.store.listServeTags())[0]
    assert(landed?.outcome === 'net', `the outcome did not survive: ${JSON.stringify(landed)}`)
    assert(landed?.serveNumber === 2, 'which serve it was did not survive')
  })
})

await check('a tap for a report that did not survive the prune is dropped', async () => {
  /*
   * The reason the tags are read last, after the pruning, rather than beside
   * the sessions. A tag is keyed by a report id and `restoreBackup` prunes as it
   * goes, so a backup from a full phone restored onto a fuller one carries tags
   * for serves that no longer exist by the time they are read. Storing those
   * fills the tag store with rows about serves nobody can open, which is the
   * lifetime `TAG_STORE` was keyed by report id to avoid.
   */
  const to = memoryStore()
  const file = JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 1,
    sessions: [session('kept', 2_000)],
    tags: [tag('kept', 100), tag('gone', 100)],
  })
  return importBackup(file, to.store).then(async (r) => {
    assert(r.tags === 1, `${r.tags} taps stored, expected the one with a report`)
    assert(r.skippedTags === 1, `${r.skippedTags} skipped, expected the orphan`)
    const ids = (await to.store.listServeTags()).map((t) => t.id)
    assert(!ids.includes('gone'), 'a tap was stored about a serve nobody can open')
  })
})

await check('the newer tap wins, in both directions', async () => {
  // The practice log's rule, and it is the right one here too: a tag is the
  // player correcting the record, so the later correction is the one they meant.
  const to = memoryStore({ sessions: [session('a', 1_000)], tags: [tag('a', 900, { outcome: 'in' })] })
  const file = (taggedAt: number, outcome: 'in' | 'long') =>
    JSON.stringify({
      format: 'serve-coach-backup',
      version: 1,
      exportedAt: 1,
      sessions: [session('a', 1_000)],
      tags: [tag('a', taggedAt, { outcome })],
    })
  return importBackup(file(800, 'long'), to.store)
    .then(async (older) => {
      assert(older.skippedTags === 1, 'an older tap overwrote a newer one')
      assert((await to.store.listServeTags())[0].outcome === 'in', 'the newer tap was replaced')
      return importBackup(file(1_500, 'long'), to.store)
    })
    .then(async (newer) => {
      assert(newer.tags === 1, 'a newer tap was refused')
      assert((await to.store.listServeTags())[0].outcome === 'long', 'the newer tap did not land')
    })
})

await check('a file written before taps existed still restores', async () => {
  // The whole reason the field is optional and the version did not move. Every
  // backup taken before this round has no such key, and refusing those would
  // strand the histories most worth carrying to a new phone.
  const to = memoryStore()
  const file = JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 1,
    sessions: [session('a', 1_000)],
  })
  return importBackup(file, to.store).then((r) => {
    assert(r.added === 1, 'a backup with no tags key lost its reports')
    assert(r.tags === 0 && r.skippedTags === 0, 'a missing list was counted as something')
  })
})

await check('a malformed tap costs that tap and nothing else', async () => {
  // The rule the whole restore path follows: losing a tap must never be why
  // somebody cannot restore their serves.
  const to = memoryStore()
  const file = JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 1,
    sessions: [session('a', 1_000), session('b', 2_000)],
    tags: [{ id: 'a', taggedAt: 'yesterday' }, tag('b', 100)],
  })
  return importBackup(file, to.store).then((r) => {
    assert(r.added === 2, `a bad tap cost the player ${2 - r.added} reports`)
    assert(r.tags === 1 && r.skippedTags === 1, `${r.tags} stored, ${r.skippedTags} skipped`)
  })
})

/* ------------------------------------------------------- practice sessions */

heading('Practice sessions (L2.5)')

const practice = (key: string, updatedAt: number, lines = 2): PracticeSession => ({
  id: sessionIdFor(key),
  createdAt: 100,
  updatedAt,
  fileName: `${key}.mov`,
  duration: 600,
  serveType: 'flat',
  handedness: 'right',
  mode: 'sample',
  found: [5, 17, 29, 41],
  chosen: [0, 1, 2, 3],
  lines: Array.from({ length: lines }, (_, i) => ({ number: i + 1, t: 5 + 12 * i, status: 'read' as const, overall: 60 })),
  phase: lines === 4 ? 'done' : 'stopped',
})

await check('a practice session survives the round trip, place and all', async () => {
  const from = memoryStore({ sessions: [session('a', 1_000)], practiceSessions: [practice('k1', 500)] })
  const b = await buildBackup(from.store)
  assert(b.practiceSessions?.length === 1, `the export carried ${b.practiceSessions?.length ?? 0} sessions`)
  const to = memoryStore()
  const r = await importBackup(JSON.stringify(b), to.store)
  assert(r.practiceSessions === 1, `${r.practiceSessions} sessions restored`)
  const landed = to.practiceSessions.get(sessionIdFor('k1'))
  assert(landed?.lines.length === 2 && landed.phase === 'stopped', 'the session lost its lines or its place')
  assert(r.added === 1, 'carrying a session cost a report')
})

await check('the newer session wins, and a malformed one costs only itself', async () => {
  const to = memoryStore({ practiceSessions: [practice('k1', 900, 3)] })
  const file = JSON.stringify({
    format: 'serve-coach-backup',
    version: 1,
    exportedAt: 1,
    sessions: [session('a', 1_000)],
    practiceSessions: [practice('k1', 800, 1), { id: 'practice-bad', createdAt: 'yesterday' }, practice('k2', 50, 4)],
  })
  const r = await importBackup(file, to.store)
  assert(r.practiceSessions === 1, `${r.practiceSessions} stored, expected only the new one`)
  assert(to.practiceSessions.get(sessionIdFor('k1'))!.lines.length === 3, 'an older session overwrote a newer one')
  assert(to.practiceSessions.has(sessionIdFor('k2')), 'the good session beside a bad one was lost')
  assert(r.added === 1, 'a bad session cost a report')
})

await check('a store from before sessions existed still exports and restores', async () => {
  const from = memoryStore({ sessions: [session('a', 1_000)], practiceSessions: false })
  const b = await buildBackup(from.store)
  assert(b.practiceSessions === undefined, 'a store with no sessions wrote an empty list as if it had looked')
  const to = memoryStore({ practiceSessions: false })
  const file = JSON.stringify({ ...b, practiceSessions: [practice('k1', 500)] })
  const r = await importBackup(file, to.store)
  assert(r.added === 1 && r.practiceSessions === 0, `added ${r.added}, sessions ${r.practiceSessions}`)
})

report()
