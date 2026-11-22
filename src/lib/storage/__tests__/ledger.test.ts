/**
 * The season ledger (L3.3): one small row per trip, kept after the reports
 * behind it are gone.
 *
 * Three things are held here. The rows are built the way the trend cuts trips
 * and merged on one rule — more serves wins — so a pruned trip keeps the row
 * that knew all of it. A history whose oldest reports were deleted still draws
 * the same season: the trips, the best, the six-week line and the streaks.
 * And a backup carries the ledger out and back.
 */
import { mergeTripRecords, normaliseTripRecord, tripRecordId, tripRecordsOf, type TripRecord } from '../ledger'
import { bestTrip, buildProgress, longestStreak, sixWeekMilestone, tripStreak } from '../../progress'
import { buildBackup, type BackupStore } from '../backup'
import { importBackup } from '../restore'
import { DEFAULTS, type Prefs } from '../prefs'
import type { Session } from '../db'
import type { Analysis } from '../../analysis/types'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** A stored report, thin but carrying what a trip row reads. */
function serve(
  createdAt: number,
  overall: number,
  opts: { type?: 'flat' | 'kick'; rubric?: number; flaw?: string; id?: string } = {},
): Session {
  return {
    id: opts.id ?? `s-${createdAt}-${opts.type ?? 'flat'}`,
    createdAt,
    overall,
    overallStatus: 'good',
    serveType: opts.type ?? 'flat',
    scoringVersion: opts.rubric ?? 5,
    fundamentals: [
      { id: 'toss', score: overall - 2, metrics: [{ id: 'releaseHeight', score: overall - 2 }] },
      { id: 'contact', score: overall + 2, metrics: [{ id: 'contactHeight', score: overall + 2 }] },
    ],
    ...(opts.flaw ? { triage: { status: 'ok', primary_flaw: { flaw: opts.flaw } } } : {}),
  } as unknown as Session
}

/** A trip: serves an hour apart. */
const trip = (start: number, scores: number[], opts: Parameters<typeof serve>[2] = {}) =>
  scores.map((o, i) => serve(start + i * HOUR, o, opts))

heading('A trip, as a row')

check('a row is the trip the trend draws: median, range, areas, faults and ladder', () => {
  const sessions = [
    ...trip(0, [60, 70, 66], { flaw: 'shallow_drop' }),
    serve(2 * HOUR + 1, 50, { flaw: 'toss_height' }),
  ]
  const [row] = tripRecordsOf(sessions, { shallow_drop: 2 })
  note(JSON.stringify(row))
  assert(row.id === tripRecordId('flat', 5, 0), `id ${row.id}`)
  assert(row.serves === 4 && row.median === 63 && row.low === 50 && row.high === 70, 'median or range wrong')
  assert(row.byArea.toss === 61 && row.byArea.contact === 65, `areas ${JSON.stringify(row.byArea)}`)
  assert(row.named.shallow_drop === 3 && row.named.toss_height === 1, `faults ${JSON.stringify(row.named)}`)
  assert(row.ladder?.shallow_drop === 2, 'the ladder step was not kept')
})

check('serve types and rubrics are rows of their own', () => {
  const rows = tripRecordsOf([
    ...trip(0, [60, 61]),
    ...trip(10 * 60 * 1000, [80], { type: 'kick' }),
    ...trip(3 * HOUR, [70, 71], { rubric: 6 }),
  ])
  assert(rows.length === 3, `${rows.length} rows`)
  assert(new Set(rows.map((r) => r.id)).size === 3, 'two rows shared an id')
})

heading('One rule for merging: more serves wins')

const row = (from: number, to: number, serves: number, median = 70, extra: Partial<TripRecord> = {}): TripRecord => ({
  id: tripRecordId('flat', 5, from),
  from,
  to,
  serveType: 'flat',
  scoringVersion: 5,
  serves,
  median,
  low: median - 5,
  high: median + 5,
  byArea: {},
  named: {},
  ...extra,
})

check('a new trip is written, and an unchanged one is not written again', () => {
  assert(mergeTripRecords([], [row(0, HOUR, 3)]).write.length === 1, 'a new trip was not written')
  const same = mergeTripRecords([row(0, HOUR, 3)], [row(0, HOUR, 3)])
  assert(same.write.length === 0 && same.drop.length === 0, 'an identical row was written again')
})

check('a trip that grew replaces its row; a pruned remnant does not', () => {
  const grew = mergeTripRecords([row(0, HOUR, 3)], [row(0, 2 * HOUR, 4, 72)])
  assert(grew.write.length === 1 && grew.drop.length === 0, 'a growing trip did not update its row')
  // The oldest serves were pruned: the live trip now starts later and has fewer.
  const remnant = row(2 * HOUR, 3 * HOUR, 2, 90)
  const kept = mergeTripRecords([row(0, 3 * HOUR, 6)], [remnant])
  assert(kept.write.length === 0, 'the remnant of a pruned trip overwrote the row that knew all of it')
})

check('a row for the same visit under another id is dropped when replaced', () => {
  // The trip's first serve was deleted by the player, so its id moved.
  const merged = mergeTripRecords([row(0, 3 * HOUR, 4)], [row(HOUR, 3 * HOUR, 4, 75)])
  assert(merged.write.length === 1 && merged.drop[0] === tripRecordId('flat', 5, 0), JSON.stringify(merged))
})

check('another serve type on the same afternoon is not the same visit', () => {
  const kick = row(0, HOUR, 1, 80, { serveType: 'kick', id: tripRecordId('kick', 5, 0) })
  const merged = mergeTripRecords([row(0, HOUR, 5)], [kick])
  assert(merged.write.length === 1 && merged.drop.length === 0, 'a kick trip replaced the flat one')
})

check('a stored row is read back whole or not at all', () => {
  const good = row(0, HOUR, 3, 70, { named: { shallow_drop: 2 }, ladder: { shallow_drop: 1 } })
  assert(JSON.stringify(normaliseTripRecord(JSON.parse(JSON.stringify(good)))) === JSON.stringify(good), 'a good row changed')
  assert(normaliseTripRecord({ ...good, serves: 0 }) === undefined, 'a trip of no serves was kept')
  assert(normaliseTripRecord({ ...good, low: 90 }) === undefined, 'a range below its median was kept')
  assert(normaliseTripRecord({ ...good, serveType: 'banana' }) === undefined, 'an unknown serve type was kept')
  assert(normaliseTripRecord({ ...good, to: -1 }) === undefined, 'a trip ending before it began was kept')
  const junk = normaliseTripRecord({ ...good, named: { shallow_drop: 'x', toss_height: 1 } })
  assert(junk?.named.toss_height === 1 && !('shallow_drop' in junk.named), 'a bad count was not dropped')
})

heading('A pruned history keeps its season')

/**
 * Thirty trips a week apart, three serves each, scores climbing from 55 to 84.
 * The ledger knows all of them; the store, after a hard prune, keeps the
 * newest twenty-five reports.
 */
const season = Array.from({ length: 30 }, (_, i) => trip(i * WEEK, [54 + i, 55 + i, 56 + i])).flat()
const ledger = tripRecordsOf(season)
const kept = [...season].sort((a, b) => b.createdAt - a.createdAt).slice(0, 25)

check('the trend still draws every trip, and the pruned remnant gives way to its row', () => {
  const whole = buildProgress(season, 'flat')!
  const pruned = buildProgress(kept, 'flat', ledger)!
  const bare = buildProgress(kept, 'flat')!
  note(`${whole.trips.length} trips whole, ${pruned.trips.length} pruned with the ledger, ${bare.trips.length} without`)
  assert(pruned.trips.length === whole.trips.length, `the pruned history drew ${pruned.trips.length} trips`)
  assert(bare.trips.length < whole.trips.length, 'the fixture pruned nothing, so this proves nothing')
  assert(
    JSON.stringify(pruned.trips.map((t) => [t.overall, t.serves])) === JSON.stringify(whole.trips.map((t) => [t.overall, t.serves])),
    'a trip read back from the ledger differs from the one its reports drew',
  )
})

check('the best, the six-week line and the streaks survive the prune', () => {
  assert(bestTrip(kept, 'flat', ledger)?.score === bestTrip(season, 'flat')?.score, 'the best moved')
  const line = (s: Session[], l?: TripRecord[]) => sixWeekMilestone(buildProgress(s, 'flat', l)!)
  assert(line(kept, ledger) === line(season), `the six-week line moved: "${line(kept, ledger)}" against "${line(season)}"`)
  const now = 29 * WEEK + DAY
  assert(longestStreak(kept, undefined, ledger) === longestStreak(season), 'the longest run moved')
  assert(tripStreak(kept, now, undefined, ledger) === tripStreak(season, now), 'the current run moved')
  assert(longestStreak(kept) < longestStreak(season), 'the fixture lost no streak, so this proves nothing')
})

heading('The backup carries the season')

function memoryStore(sessions: Session[], trips: TripRecord[] = []) {
  const rows = new Map(sessions.map((s) => [s.id, s]))
  let records = [...trips]
  const prefs: Prefs = { ...DEFAULTS }
  const store: BackupStore = {
    listSessions: async () => [...rows.values()].sort((a, b) => b.createdAt - a.createdAt),
    saveSession: async (a: Analysis) => {
      rows.set(a.id, a as unknown as Session)
    },
    listPracticeLogs: async () => [],
    logPractice: async () => {},
    listServeTags: async () => [],
    tagServe: async () => {},
    // Keeps the newest twenty-five, as a hard prune does.
    pruneSessions: async () => {
      const doomed = [...rows.values()].sort((a, b) => b.createdAt - a.createdAt).slice(25)
      for (const s of doomed) rows.delete(s.id)
      return doomed.length
    },
    readPrefs: () => ({ ...prefs }),
    writePrefs: () => ({ ...prefs }),
    listTripRecords: async () => [...records],
    saveTripRecords: async (incoming) => {
      const { write, drop } = mergeTripRecords(records, incoming)
      records = [...records.filter((r) => !drop.includes(r.id) && !write.some((w) => w.id === r.id)), ...write]
    },
    recordTrips: async (s) => store.saveTripRecords!(tripRecordsOf(s)),
  }
  return { store, rows, records: () => records }
}

await check('a phone that pruned its oldest reports hands its whole season to the next one', async () => {
  const old = memoryStore(kept, ledger)
  const file = JSON.stringify(await buildBackup(old.store))
  const fresh = memoryStore([])
  const result = await importBackup(file, fresh.store)
  note(`restore: ${result.added} added, ${result.trips} trips, ${result.pruned} pruned`)
  assert(result.added === 25 && result.pruned === 0, `added ${result.added}, pruned ${result.pruned}`)
  assert(fresh.records().length === 30, `${fresh.records().length} trips arrived of 30`)
  const restored = buildProgress([...fresh.rows.values()], 'flat', fresh.records())!
  assert(restored.trips.length === 30, `the restored trend drew ${restored.trips.length} trips`)
})

await check('a restore says how many reports it pruned, and their trips stay', async () => {
  const fresh = memoryStore([])
  const file = JSON.stringify({ format: 'serve-coach-backup', version: 1, exportedAt: 0, sessions: season })
  const result = await importBackup(file, fresh.store)
  note(`restore: ${result.added} added, ${result.pruned} pruned, ${fresh.records().length} trips kept`)
  assert(result.added === 90 && result.pruned === 65, `added ${result.added}, pruned ${result.pruned}`)
  assert(fresh.records().length === 30, 'the trips of the pruned reports were not kept')
})

report()
