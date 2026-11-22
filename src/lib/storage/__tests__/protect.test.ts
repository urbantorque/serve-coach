/**
 * Automatic local protection: the rolling safety copy, the ask for persistence,
 * what the app says about it, and the way back.
 *
 * Driven on a Map, with the real `buildBackup` and the real `importBackup`
 * running against it, so the copy is held to the same restore every backup file
 * goes through. The two shelves are thin: the folder one runs here on a directory
 * held in memory, and both were walked in a real browser (see the ledger entry).
 */
import {
  PERSIST_AFTER_SERVES,
  PERSIST_RETRY_MS,
  SNAPSHOT_BUDGET,
  folderShelf,
  forgetSnapshots,
  persistenceWorthAsking,
  protectAfterSave,
  protectionLine,
  protectionStatus,
  recoveryLine,
  recoveryOffer,
  recoveryReason,
  restoreFromSnapshot,
  roomFor,
  snapshotDue,
  snapshotText,
  snapshotsOn,
  snapshotsToDrop,
  type ProtectDeps,
  type SnapshotMeta,
  type SnapshotShelf,
} from '../protect'
import { buildBackup, type Backup, type BackupStore } from '../backup'
import { importBackup } from '../restore'
import { SNAPSHOT_EVERY } from '../nudge'
import { DEFAULTS, type Prefs } from '../prefs'
import type { PracticeLog, ServeTag, Session } from '../db'
import type { TripRecord } from '../ledger'
import type { Analysis } from '../../analysis/types'
import { cueIssues } from '../../analysis/voice'
import { sampleAnalysis, sampleHistory } from '../../../dev/sampleAnalysis'
import { assert, check, heading, note, report } from '../../analysis/__tests__/harness'

const DAY = 86_400_000
const NOW = 500 * DAY

// One real report, swing track and all, so compaction runs on what a phone stores.
const { frames: _frames, ...real } = sampleAnalysis()
void _frames
const reportAt = (i: number, at = NOW - i * DAY): Session =>
  ({
    ...real,
    id: `serve-s${i}-0`,
    createdAt: at,
    scoringVersion: 5,
    phases: real.phases.map((p) => ({ ...p, thumbnail: 'data:image/jpeg;base64,AAAA' })),
  }) as Session

function memoryShelf(kind: SnapshotShelf['kind'] = 'idb') {
  const files = new Map<string, string>()
  const shelf: SnapshotShelf = {
    kind,
    names: async () => [...files.keys()],
    read: async (name) => files.get(name),
    write: async (name, text) => {
      files.set(name, text)
    },
    remove: async (name) => {
      files.delete(name)
    },
  }
  return { files, shelf }
}

/** The history and everything around it, as Maps, behind the real backup code. */
function world(over: Partial<ProtectDeps> = {}, opts: { reports?: Session[]; prefs?: Partial<Prefs> } = {}) {
  const reports = new Map((opts.reports ?? []).map((s) => [s.id, s]))
  const logs: PracticeLog[] = []
  const tags: ServeTag[] = []
  const trips: TripRecord[] = []
  let prefs: Prefs = { ...DEFAULTS, ...opts.prefs }
  let clock = NOW
  const { shelf, files } = memoryShelf()
  const store: BackupStore = {
    listSessions: async () => [...reports.values()],
    saveSession: async (a: Analysis) => {
      reports.set(a.id, a as Session)
    },
    listPracticeLogs: async () => logs,
    logPractice: async (l) => {
      logs.push(l)
    },
    listServeTags: async () => tags,
    tagServe: async (t) => {
      tags.push(t)
    },
    pruneSessions: async () => 0,
    readPrefs: () => prefs,
    writePrefs: (patch) => (prefs = { ...prefs, ...patch }),
    listTripRecords: async () => trips,
    saveTripRecords: async (r) => {
      trips.push(...r)
    },
  }
  const asked: number[] = []
  const deps: ProtectDeps = {
    now: () => clock,
    pause: async () => {},
    shelf: async () => shelf,
    build: () => buildBackup(store),
    filedSince: async (at) => [...reports.values()].filter((s) => s.createdAt > at).length,
    firstFiledAt: async () => {
      const all = [...reports.values()].map((s) => s.createdAt)
      return all.length ? Math.min(...all) : undefined
    },
    rows: async () => reports.size,
    readable: async () => reports.size,
    restore: (text) => importBackup(text, store),
    estimate: async () => undefined,
    persisted: async () => false,
    askPersistence: async () => {
      asked.push(clock)
      return true
    },
    installed: () => false,
    ios: () => false,
    readPrefs: () => prefs,
    writePrefs: store.writePrefs,
    ...over,
  }
  const file = (s: Session) => reports.set(s.id, s)
  return { deps, reports, store, files, asked, file, trips, tick: (ms: number) => (clock += ms), prefs: () => prefs }
}

const backupOf = (sessions: Session[]): Backup =>
  ({ format: 'serve-coach-backup', version: 1, exportedAt: NOW, sessions }) as Backup

heading('A copy in the backup file\'s own shape')

await check('compact: no photographs, the swing traded for its keyframes, and the numbers untouched', async () => {
  const full = reportAt(1)
  assert(!!full.track && full.phases.some((p) => p.thumbnail), 'the fixture meant a whole report')
  const { text, serves } = (await snapshotText(backupOf([full])))!
  const file = JSON.parse(text) as Backup
  const copy = file.sessions[0]
  note(`a report: ${JSON.stringify(full).length} chars whole, ${text.length} in the copy`)
  assert(serves === 1 && file.format === 'serve-coach-backup', 'not a backup')
  assert(copy.phases.every((p) => !p.thumbnail), 'a photograph stayed in')
  assert(!copy.track && !!copy.poses, 'the swing was not traded for its keyframes')
  assert(copy.overall === full.overall && JSON.stringify(copy.fundamentals) === JSON.stringify(full.fundamentals), 'the numbers moved')
  assert(JSON.stringify(copy.diagnosis) === JSON.stringify(full.diagnosis), 'the diagnosis moved')
  assert(text.length * 400 < SNAPSHOT_BUDGET, 'four hundred reports would not fit: the budget is out of step with the report')
})

await check('a practice session keeps every line and leaves its photographs behind', async () => {
  const practiceSessions = [
    { id: 'practice-a', createdAt: 1, updatedAt: 1, duration: 60, lines: [{ number: 1, t: 2, status: 'read' }], stills: { 1: 'data:image/jpeg;base64,AAAA' } },
  ] as unknown as Backup['practiceSessions']
  const { text } = (await snapshotText({ ...backupOf([reportAt(1)]), practiceSessions }))!
  const file = JSON.parse(text) as Backup
  assert(file.practiceSessions?.[0].lines.length === 1, 'the lines went')
  assert(!file.practiceSessions?.[0].stills, 'the photographs stayed')
})

await check('held to its budget by the newest reports, with everything else whole', async () => {
  const sessions = Array.from({ length: 20 }, (_, i) => reportAt(i))
  const one = (await snapshotText(backupOf([sessions[0]])))!.text.length
  const trips = [{ id: 'x', from: 1, to: 2 }] as unknown as TripRecord[]
  const tags = [{ id: 'serve-s19-0', serveNumber: 1, taggedAt: 1 }] as ServeTag[]
  const backup = { ...backupOf(sessions), trips, tags }
  const fit = (await snapshotText(backup, one * 5))!
  const file = JSON.parse(fit.text) as Backup
  note(`${fit.serves} of 20 reports in ${fit.text.length} chars`)
  assert(fit.text.length <= one * 5 && fit.serves >= 4 && fit.serves < 20, `${fit.serves} reports in ${fit.text.length}`)
  assert(file.sessions[0].id === 'serve-s0-0', 'the newest went first')
  assert(file.trips?.length === 1 && file.tags?.length === 1, 'the budget took the ledger or the taps')
  assert((await snapshotText(backup, 10)) === undefined, 'a copy too small to hold even its head came back as a copy')
})

await check('a long history breathes as it goes', async () => {
  let breaths = 0
  await snapshotText(backupOf(Array.from({ length: 60 }, (_, i) => reportAt(i))), SNAPSHOT_BUDGET, async () => {
    breaths++
  })
  assert(breaths >= 2, `${breaths} breaths over sixty reports`)
})

heading('Rolling, at most every few serves')

check('a first copy as soon as there is a serve, then every few', () => {
  const held: SnapshotMeta = { name: 'x', at: 1, serves: 3 }
  assert(snapshotDue(undefined, 1) && !snapshotDue(undefined, 0), 'the first copy waited, or came with nothing')
  assert(!snapshotDue(held, SNAPSHOT_EVERY - 1), 'a copy came early')
  assert(snapshotDue(held, SNAPSHOT_EVERY), 'a copy did not come')
  assert(snapshotDue(held, 1, SNAPSHOT_EVERY - 1), 'a practice session\'s serves did not count')
})

await check('after each save it makes a copy when due, and only then', async () => {
  const w = world()
  w.file(reportAt(1))
  await protectAfterSave({}, w.deps)
  assert(w.files.size === 1, `${w.files.size} copies after the first serve`)
  for (let i = 2; i < 2 + SNAPSHOT_EVERY - 1; i++) {
    w.tick(1000)
    w.file(reportAt(i, w.deps.now()))
    await protectAfterSave({}, w.deps)
  }
  assert(w.files.size === 1, `${w.files.size} copies before the fifth serve since`)
  w.tick(1000)
  w.file(reportAt(99, w.deps.now()))
  await protectAfterSave({}, w.deps)
  const held = snapshotsOn([...w.files.keys()])
  assert(w.files.size === 2 && held[0].serves === SNAPSHOT_EVERY + 1, `copies: ${held.map((m) => m.serves).join()}`)
})

await check('a practice session is enough on its own', async () => {
  const w = world({}, { reports: [reportAt(1)] })
  await protectAfterSave({}, w.deps)
  w.tick(1000)
  await protectAfterSave({ practiceServes: SNAPSHOT_EVERY }, w.deps)
  assert(w.files.size === 2, 'a long session made no copy')
})

await check('a save that finds nothing due reads no history', async () => {
  let built = 0
  const w = world()
  const deps = { ...w.deps, build: () => (built++, w.deps.build()) }
  w.file(reportAt(1))
  await protectAfterSave({}, deps)
  w.tick(1000)
  w.file(reportAt(2, w.deps.now()))
  await protectAfterSave({}, deps)
  assert(built === 1, `the history was read ${built} times`)
})

await check('one pass at a time, and a broken step never reaches the caller', async () => {
  let release = () => {}
  let passes = 0
  const gate = new Promise<void>((r) => (release = r))
  const w = world({ pause: () => (passes++, gate) })
  const first = protectAfterSave({}, w.deps)
  await protectAfterSave({}, w.deps)
  assert(passes === 1, 'two passes ran at once')
  release()
  await first
  const broken = world({
    shelf: async () => {
      throw new Error('no')
    },
    persisted: async () => {
      throw new Error('no')
    },
  })
  await protectAfterSave({}, broken.deps)
  assert(true, 'it threw')
})

await check('a copy never counts as a file: the export date stays the player\'s', async () => {
  const w = world({}, { reports: [reportAt(1)], prefs: { lastExportedAt: 7 } })
  await protectAfterSave({}, w.deps)
  assert(w.files.size === 1 && w.prefs().lastExportedAt === 7, 'a snapshot touched the export date')
})

check('the newest two, and an older copy with more serves in it outlives a run of small ones', () => {
  const m = (at: number, serves: number): SnapshotMeta => ({ name: `n${at}`, at, serves })
  assert(snapshotsToDrop([m(2, 12), m(1, 8)]).length === 0, 'dropped with two held')
  assert(snapshotsToDrop([m(3, 17), m(2, 12), m(1, 8)]).join() === 'n1', 'a growing history kept the wrong two')
  assert(snapshotsToDrop([m(3, 12), m(2, 6), m(1, 100)]).join() === 'n2', 'a small run rolled the full copy away')
  assert(snapshotsToDrop([m(3, 120), m(2, 6), m(1, 100)]).join() === 'n2', 'the older of the two big ones went')
})

await check('a history lost and refilmed keeps its one good copy to the end', async () => {
  const w = world({}, { reports: Array.from({ length: 40 }, (_, i) => reportAt(i)) })
  await protectAfterSave({}, w.deps)
  const full = snapshotsOn([...w.files.keys()])[0]
  w.reports.clear()
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < SNAPSHOT_EVERY; i++) {
      w.tick(1000)
      w.file(reportAt(100 + round * 10 + i, w.deps.now()))
    }
    await protectAfterSave({}, w.deps)
  }
  const held = snapshotsOn([...w.files.keys()])
  note(`held: ${held.map((m) => m.serves).join(', ')}`)
  assert(held.length === 2 && held.some((m) => m.name === full.name), 'the full copy was rolled away')
})

check('room is left for the reports', () => {
  assert(roomFor(1000) && roomFor(1000, { usage: 0, quota: 0 }), 'a browser that will not say was refused')
  assert(roomFor(1000, { usage: 7000, quota: 10_000 }), 'room was refused')
  assert(!roomFor(1000, { usage: 7001, quota: 10_000 }), 'a copy took the last of the room')
})

await check('a device with no room gets no copy, and says nothing of it', async () => {
  const w = world({ estimate: async () => ({ usage: 1000, quota: 1001 }) }, { reports: [reportAt(1)] })
  await protectAfterSave({}, w.deps)
  assert(w.files.size === 0, 'a copy went onto a full device')
})

heading('Asking the browser to keep it')

check('not on the first serve, and on a second visit or once installed', () => {
  const base = { persisted: false, installed: false, serves: PERSIST_AFTER_SERVES, firstFiledAt: NOW - 2 * DAY, now: NOW }
  assert(persistenceWorthAsking(base), 'a returning player was not asked for')
  assert(!persistenceWorthAsking({ ...base, firstFiledAt: NOW - 60_000 }), 'asked on the first visit')
  assert(!persistenceWorthAsking({ ...base, serves: 1 }), 'asked on one serve')
  assert(persistenceWorthAsking({ ...base, installed: true, serves: 1, firstFiledAt: NOW }), 'an installed app was not asked for')
  assert(!persistenceWorthAsking({ ...base, persisted: true }), 'asked again once it was granted')
  assert(!persistenceWorthAsking({ ...base, askedAt: NOW - DAY }), 'asked again straight after a refusal')
  assert(persistenceWorthAsking({ ...base, askedAt: NOW - PERSIST_RETRY_MS }), 'never asked again')
})

await check('asked after a save at the right moment, once, and it says so in the prefs', async () => {
  const w = world({}, { reports: [reportAt(1, NOW - 2 * DAY), reportAt(2, NOW - 2 * DAY), reportAt(3, NOW - 2 * DAY)] })
  await protectAfterSave({}, w.deps)
  assert(w.asked.length === 1 && w.prefs().askedToPersist && w.prefs().persistAskedAt === NOW, JSON.stringify(w.asked))
  await protectAfterSave({}, w.deps)
  assert(w.asked.length === 1, 'asked twice in a row')
})

heading('What it says')

/** Words that promise more than a copy on the same site can give. */
const OVERCLAIM = /\b(safe|secure|guarantee\w*|forever|always|never lost|protected)\b/i

check('every line says what a copy covers and what only a file does, in the voice', () => {
  const variants = [
    { available: true, serves: 42, persisted: true, mayClear: false },
    { available: true, serves: 42, persisted: false, mayClear: false },
    { available: true, serves: 42, persisted: false, mayClear: true },
    { available: true, serves: 1, persisted: true, mayClear: false },
    { available: true, serves: 1000, persisted: false, mayClear: true },
    { available: true, persisted: false, mayClear: false },
    { available: false, persisted: false, mayClear: false },
  ]
  for (const v of variants) {
    const line = protectionLine(v)
    note(line)
    const issues = cueIssues(line)
    assert(issues.length === 0, `"${line}": ${issues.join('; ')}`)
    assert(/\bfile\b/.test(line), `no word of a file in "${line}"`)
    assert(!OVERCLAIM.test(line), `an overclaim in "${line}"`)
    assert(!/—/.test(line), `an em dash in "${line}"`)
    if (v.serves) {
      assert(/damaged history/.test(line) && /mistaken clear/.test(line), `what it covers: "${line}"`)
      assert(/lost phone/.test(line), `what it does not: "${line}"`)
    }
  }
  assert(/Safari/.test(protectionLine(variants[2])), 'iOS not installed did not name Safari')
  // A laptop is not told about a lost phone (N5.8).
  for (const v of variants.filter((x) => x.available)) {
    const line = protectionLine({ ...v, device: 'computer' })
    assert(/lost computer/.test(line) && !/phone/.test(line), `a computer was told about a phone: "${line}"`)
  }
  assert(/1 serve /.test(protectionLine(variants[3])), 'one serve read as serves')
})

await check('the status says what is true now', async () => {
  const w = world({ persisted: async () => true }, { reports: [reportAt(1)] })
  const before = await protectionStatus(w.deps)
  assert(before.persisted && !before.mayClear && before.lastSnapshotAt === undefined, JSON.stringify(before))
  await protectAfterSave({}, w.deps)
  const after = await protectionStatus(w.deps)
  assert(after.lastSnapshotAt === NOW && after.lastSnapshotServes === 1, JSON.stringify(after))
  const safari = await protectionStatus({ ...w.deps, ios: () => true, installed: () => false })
  assert(safari.mayClear && /Safari/.test(safari.line), JSON.stringify(safari))
  const home = await protectionStatus({ ...w.deps, ios: () => true, installed: () => true })
  assert(!home.mayClear && !/Safari/.test(home.line), JSON.stringify(home))
  const none = await protectionStatus({ ...w.deps, shelf: async () => undefined })
  assert(none.lastSnapshotAt === undefined && /nowhere to keep/.test(none.line), none.line)
})

heading('The way back')

check('offered on a history emptied or damaged, and not on one that merely shrank', () => {
  const on = (o: Partial<Parameters<typeof recoveryReason>[0]>) => recoveryReason({ opened: true, rows: 0, readable: 0, held: 10, ...o })
  assert(on({}) === 'emptied', 'an empty store with a copy offered nothing')
  assert(on({ rows: 12, readable: 3 }) === 'damaged', 'rows that will not read offered nothing')
  assert(on({ opened: false }) === 'damaged', 'a store that will not open offered nothing')
  assert(on({ rows: 6, readable: 6 }) === undefined, 'a player who deleted serves was offered them back')
  assert(on({ held: 0 }) === undefined && on({ held: undefined }) === undefined, 'offered with nothing to bring back')
  assert(on({ rows: 12, readable: 11, held: 10 }) === undefined, 'offered with the store ahead of the copy')
})

await check('the offer names what it holds; a copy with nothing behind it is no offer', async () => {
  const w = world({}, { reports: [reportAt(1), reportAt(2), reportAt(3)] })
  await protectAfterSave({}, w.deps)
  assert((await recoveryOffer(undefined, w.deps)) === undefined, 'offered over a whole history')
  w.reports.clear()
  const offer = (await recoveryOffer(0, w.deps))!
  note(offer.line)
  assert(offer.reason === 'emptied' && offer.serves === 3 && offer.at === NOW, JSON.stringify(offer))
  assert(cueIssues(offer.line).length === 0, cueIssues(offer.line).join())
  assert((await recoveryOffer(0, { ...w.deps, shelf: async () => undefined })) === undefined, 'offered with no shelf')
  const damaged = await recoveryOffer(1, { ...w.deps, rows: async () => 3 })
  assert(damaged?.reason === 'damaged', JSON.stringify(damaged))
  const unopened = await recoveryOffer(undefined, {
    ...w.deps,
    rows: async () => {
      throw new Error('will not open')
    },
    readable: async () => {
      throw new Error('will not open')
    },
  })
  assert(unopened?.reason === 'damaged', JSON.stringify(unopened))
  for (const line of [recoveryLine('emptied', 1, NOW), recoveryLine('damaged', 40, NOW)]) {
    assert(cueIssues(line).length === 0, `"${line}": ${cueIssues(line).join('; ')}`)
    note(line)
  }
})

await check('a restore goes through the import and brings the history back, the ledger and taps with it', async () => {
  const w = world({}, { reports: [reportAt(1), reportAt(2), reportAt(3)] })
  w.trips.push({ id: 'flat:5:1', from: 1, to: 2, serveType: 'flat', scoringVersion: 5, serves: 3, median: 70, low: 60, high: 80, byArea: {}, named: {} })
  await w.store.tagServe({ id: 'serve-s1-0', serveNumber: 2, taggedAt: NOW })
  await protectAfterSave({}, w.deps)
  // What the crash screen's clear takes: the reports and the season.
  w.reports.clear()
  w.trips.length = 0
  const result = (await restoreFromSnapshot(w.deps))!
  assert(result.added === 3 && w.reports.size === 3, `${result.added} added, ${w.reports.size} on file`)
  assert(result.trips === 1 && w.trips.length === 1, `${result.trips} trips back`)
  assert((await w.store.listServeTags()).length === 1, 'the taps did not come through the copy')
  const back = w.reports.get('serve-s1-0')!
  assert(back.overall === real.overall, 'the numbers did not come back')
  assert(back.phases.every((p) => !p.thumbnail), 'a photograph came from nowhere')
  assert((await recoveryOffer(undefined, w.deps)) === undefined, 'the offer outlived the restore')
})

await check('a restore never rolls back what is on file', async () => {
  const w = world({}, { reports: [reportAt(1)] })
  await protectAfterSave({}, w.deps)
  // The same serve, whole, and rescored since.
  const newer = { ...reportAt(1), overall: 91, createdAt: NOW + 5 }
  w.reports.set(newer.id, newer)
  await restoreFromSnapshot(w.deps)
  assert(w.reports.get(newer.id)!.overall === 91, 'an older copy overwrote a newer report')
})

await check('a copy that will not read falls back to the other, and none at all resolves to nothing', async () => {
  const w = world({}, { reports: [reportAt(1), reportAt(2)] })
  await protectAfterSave({}, w.deps)
  const [good] = snapshotsOn([...w.files.keys()])
  w.files.set(`history-${NOW + 1}-9.json`, 'not json at all {')
  w.reports.clear()
  const result = await restoreFromSnapshot(w.deps)
  assert(result?.added === 2, `the good copy ${good.name} was not reached`)
  w.files.clear()
  assert((await restoreFromSnapshot(w.deps)) === undefined, 'a restore from nothing')
  assert((await restoreFromSnapshot({ ...w.deps, shelf: async () => undefined })) === undefined, 'a restore with no shelf')
})

await check('forgetting takes every copy and only copies', async () => {
  const w = world({}, { reports: [reportAt(1)] })
  await protectAfterSave({}, w.deps)
  w.files.set('something-else.txt', 'x')
  await forgetSnapshots(w.deps)
  assert(w.files.size === 1 && w.files.has('something-else.txt'), [...w.files.keys()].join())
  assert(w.reports.size === 1, 'forgetting a copy touched a report')
})

heading('On the demo season')

;(globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => null }) }

await check('a season fits with room to spare, and comes back whole', async () => {
  const { sessions } = sampleHistory(NOW)
  const w = world({ persisted: async () => true }, { reports: sessions })
  await protectAfterSave({}, w.deps)
  const [copy] = snapshotsOn([...w.files.keys()])
  const chars = w.files.get(copy.name)!.length
  note(`${copy.serves} serves in ${Math.round(chars / 1000)} kB, of a ${SNAPSHOT_BUDGET / 1_000_000} MB budget`)
  note((await protectionStatus(w.deps)).line)
  assert(copy.serves === sessions.length, `${copy.serves} of ${sessions.length} serves in the copy`)
  w.reports.clear()
  note((await recoveryOffer(0, w.deps))!.line)
  const result = (await restoreFromSnapshot(w.deps))!
  assert(result.added === sessions.length && result.failed === 0, JSON.stringify(result))
  for (const s of sessions) {
    const back = w.reports.get(s.id)
    assert(back?.overall === s.overall && back.createdAt === s.createdAt, `${s.id} came back changed`)
    assert(JSON.stringify(back?.speed) === JSON.stringify(s.speed), `${s.id} lost its speed`)
    assert(JSON.stringify(back?.triage) === JSON.stringify(s.triage), `${s.id} lost its verdict`)
  }
})

heading('The folder shelf')

/** A private folder in memory, the same fake `clipStore.test.ts` drives. */
function memoryFolder() {
  const files = new Map<string, string>()
  let failWrites = false
  const dir = {
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!opts?.create) throw new DOMException('missing', 'NotFoundError')
        files.set(name, '')
      }
      return {
        kind: 'file',
        name,
        async getFile() {
          const text = files.get(name)!
          return { text: async () => text }
        },
        async createWritable() {
          let held = ''
          return {
            async write(text: string) {
              if (failWrites) throw new DOMException('full', 'QuotaExceededError')
              held = text
            },
            async close() {
              files.set(name, held)
            },
          }
        },
      }
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError')
    },
    async *values() {
      yield { kind: 'directory', name: 'other' }
      for (const name of [...files.keys()]) yield { kind: 'file', name }
    },
  }
  return { files, dir: dir as unknown as FileSystemDirectoryHandle, fail: () => (failWrites = true) }
}

await check('a copy goes in, reads back whole, lists by name, and comes out', async () => {
  const { dir } = memoryFolder()
  const shelf = folderShelf(dir)
  assert(shelf.kind === 'opfs', shelf.kind)
  await shelf.write('history-5-2.json', 'hello')
  assert((await shelf.names()).join() === 'history-5-2.json', (await shelf.names()).join())
  assert((await shelf.read('history-5-2.json')) === 'hello', 'did not read back')
  await shelf.remove('history-5-2.json')
  assert((await shelf.names()).length === 0, 'did not come out')
})

await check('a write that fails leaves no empty copy behind', async () => {
  const { dir, files, fail } = memoryFolder()
  fail()
  const shelf = folderShelf(dir)
  let threw = false
  await shelf.write('history-5-2.json', 'hello').catch(() => (threw = true))
  assert(threw, 'the failure was swallowed: the caller must not think it has a copy')
  assert(files.size === 0, 'an empty copy was left on the shelf')
})

report()
