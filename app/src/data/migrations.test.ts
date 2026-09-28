// ARCHITECTURE §7.3 rule 4: open a fixture database at version n - 1, upgrade it, check counts and invariants.
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { describe, expect, it } from 'vitest'
import { CURRENT_DB_VERSION, numberBlocks, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, ServeCoachDB, upgradeToV2, upgradeToV3 } from './db.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import { toServeRecord } from './repos/serves.ts'
import type { SessionRecord } from './records.ts'

const uniqueName = () => `migration-${Math.random().toString(36).slice(2)}`

async function buildV1Fixture(name: string) {
  const v1 = new Dexie(name)
  v1.version(1).stores(SCHEMA_V1)
  await v1.open()
  const fx = DEMO_FIXTURES.sessions[0]
  // A v1 session has no fpsClass yet (the field v2 backfills).
  const { fpsClass: _drop, ...session } = fx.session
  await v1.table('sessions').put({ ...session, isDemo: 0 } satisfies Omit<SessionRecord, 'fpsClass'>)
  await v1.table('serves').bulkPut(fx.serves.map(toServeRecord))
  await v1.table('tags').bulkPut(fx.tags)
  await v1.table('sessionStats').put(fx.stats)
  await v1.table('profile').put({ ...DEMO_FIXTURES.profile })
  await v1.table('practiceLogs').bulkPut(DEMO_FIXTURES.practiceLogs)
  await v1.table('matchLogs').bulkPut(DEMO_FIXTURES.matchLogs)
  await v1.table('experiments').put(DEMO_FIXTURES.experiment)
  await v1.table('events').add({ name: 'session_analysed', at: '2026-09-12T08:00:00.000Z', props: { serves: 22 } })
  v1.close()
  return fx
}

describe('Dexie schema', () => {
  it('a fresh database opens at the current version with every ARCHITECTURE §7.2 table', async () => {
    const db = new ServeCoachDB(uniqueName())
    await db.open()
    expect(db.verno).toBe(CURRENT_DB_VERSION)
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(Object.keys(SCHEMA_V1).sort())
    // Indexes the UI depends on.
    expect(db.sessions.schema.idxByName['[mode+startedAt]']).toBeDefined()
    expect(db.sessions.schema.idxByName['[mode+fpsClass+startedAt]']).toBeDefined()
    expect(db.serves.schema.idxByName['[sessionId+index]']).toBeDefined()
    expect(db.keyFrames.schema.idxByName['[serveId+event]']).toBeDefined()
    expect(db.videos.schema.idxByName.retainUntil).toBeDefined()
    expect(db.experiments.schema.idxByName.retestSessionIds.multi).toBe(true)
    db.close()
  })

  it('v2 keeps every v1 sessions index and adds the fps-class compound index', () => {
    const v1 = SCHEMA_V1.sessions.split(',').map((s) => s.trim())
    const v2 = SCHEMA_V2.sessions.split(',').map((s) => s.trim())
    for (const idx of v1) expect(v2).toContain(idx)
    expect(v2).toContain('[mode+fpsClass+startedAt]')
  })
})

describe('migration v1 -> v2', () => {
  it('upgrades a v1 database without losing player data or rewriting engine output', async () => {
    const name = uniqueName()
    const fx = await buildV1Fixture(name)

    const db = new ServeCoachDB(name)
    await db.open()
    expect(db.verno).toBe(CURRENT_DB_VERSION)

    // Row counts are unchanged.
    expect(await db.sessions.count()).toBe(1)
    expect(await db.serves.count()).toBe(fx.serves.length)
    expect(await db.tags.count()).toBe(fx.tags.length)
    expect(await db.practiceLogs.count()).toBe(DEMO_FIXTURES.practiceLogs.length)
    expect(await db.matchLogs.count()).toBe(DEMO_FIXTURES.matchLogs.length)
    expect(await db.experiments.count()).toBe(1)
    expect(await db.events.count()).toBe(1)
    expect((await db.profile.get('me'))?.heightM).toBe(1.78)

    // The backfill filled the new field from the stored analysis (60 fps -> fps60).
    const s = await db.sessions.get(fx.session.id)
    expect(s?.fpsClass).toBe('fps60')
    // The new compound index answers matched Progress queries.
    const matched = await db.sessions
      .where('[mode+fpsClass+startedAt]')
      .between(['technique', 'fps60', Dexie.minKey], ['technique', 'fps60', Dexie.maxKey])
      .toArray()
    expect(matched.map((r) => r.id)).toEqual([fx.session.id])

    // Engine output is never rewritten by a migration.
    const serve = await db.serves.get(fx.serves[0].id)
    expect(serve?.metrics).toEqual(fx.serves[0].metrics)
    expect(serve?.engine).toEqual(fx.serves[0].engine)
    db.close()
  })

  it('the upgrade is idempotent: running it again changes nothing', async () => {
    const name = uniqueName()
    await buildV1Fixture(name)
    const db = new ServeCoachDB(name)
    await db.open()
    const before = await db.sessions.toArray()
    await db.transaction('rw', db.sessions, (tx) => upgradeToV2(tx))
    expect(await db.sessions.toArray()).toEqual(before)
    db.close()
  })
})

describe('migration v2 -> v3 (real recording blocks)', () => {
  /** A v2 database with one visit holding an Experiment Block A and Block B (both saved as block 0), a failed re-record, and a check-in. */
  async function buildV2Fixture(name: string) {
    const v2 = new Dexie(name)
    v2.version(1).stores(SCHEMA_V1)
    v2.version(2).stores(SCHEMA_V2)
    await v2.open()
    const fx = DEMO_FIXTURES.sessions[0]
    const base = { ...fx.session, isDemo: 0 as const, visitId: '2026-09-20' }
    await v2.table('sessions').bulkPut([
      { ...base, id: 'A', startedAt: '2026-09-20T08:00:00+10:00', template: 'experiment', blockIndex: 0 },
      { ...base, id: 'A-failed', startedAt: '2026-09-20T08:20:00+10:00', template: 'experiment', blockIndex: 0, status: 'failed' },
      { ...base, id: 'B', startedAt: '2026-09-20T08:40:00+10:00', template: 'experiment', blockIndex: 0 },
      { ...base, id: 'C', startedAt: '2026-09-20T07:30:00+10:00', template: 'check-in', blockIndex: 0 },
      { ...base, id: 'D', startedAt: '2026-09-21T08:00:00+10:00', visitId: '2026-09-21', template: 'experiment' },
    ])
    await v2.table('serves').bulkPut(fx.serves.map((s) => ({ ...toServeRecord(s), sessionId: 'A' })))
    v2.close()
    return fx
  }

  it('numbers every visit by template from start times, keeps serves and adds the visit-block index', async () => {
    const name = uniqueName()
    const fx = await buildV2Fixture(name)
    const db = new ServeCoachDB(name)
    await db.open()
    expect(db.verno).toBe(3)
    const by = Object.fromEntries((await db.sessions.toArray()).map((s) => [s.id, s.blockIndex]))
    // Block A = 1, the failed re-record is numbered but does not move the count, Block B = 2.
    expect(by).toEqual({ A: 1, 'A-failed': 2, B: 2, C: 1, D: 1 })
    expect(await db.serves.count()).toBe(fx.serves.length)
    expect(db.sessions.schema.idxByName['[visitId+blockIndex]']).toBeDefined()
    const ordered = await db.sessions.where('[visitId+blockIndex]').between(['2026-09-20', Dexie.minKey], ['2026-09-20', Dexie.maxKey]).toArray()
    expect(ordered.map((s) => s.blockIndex)).toEqual([1, 1, 2, 2])
    db.close()
  })

  it('v3 keeps every v2 sessions index', () => {
    const v2 = SCHEMA_V2.sessions.split(',').map((s) => s.trim())
    const v3 = SCHEMA_V3.sessions.split(',').map((s) => s.trim())
    for (const idx of v2) expect(v3).toContain(idx)
  })

  it('the upgrade is idempotent, and a session that already has a block keeps it', async () => {
    const name = uniqueName()
    await buildV2Fixture(name)
    const db = new ServeCoachDB(name)
    await db.open()
    const before = await db.sessions.toArray()
    await db.transaction('rw', db.sessions, (tx) => upgradeToV3(tx))
    expect(await db.sessions.toArray()).toEqual(before)
    db.close()
    const kept = numberBlocks([
      { id: 'x', startedAt: '2026-09-20T08:00:00Z', createdAt: '2026-09-20T08:00:00Z', status: 'ready', blockIndex: 3 },
      { id: 'y', startedAt: '2026-09-20T09:00:00Z', createdAt: '2026-09-20T09:00:00Z', status: 'ready' },
    ])
    expect(Object.fromEntries(kept)).toEqual({ x: 3, y: 4 })
  })
})
