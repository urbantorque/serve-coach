// D6 loop wiring: the stored decision, the re-test link and the stored "Did it work?" result.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDbForTests } from '../data/db.ts'
import { loadDemoData } from '../data/demo.ts'
import { DEMO_FIXTURES } from '../data/fixtures.ts'
import { createExperiment, getExperiment, latestDecision } from '../data/repos/coaching.ts'
import { toServeRecord } from '../data/repos/serves.ts'
import type { ExperimentRecord, SessionRecord } from '../data/records.ts'
import { syncCoaching } from './coachingSync.ts'

beforeEach(async () => {
  await resetDbForTests()
})

/** A fixture session copied as the player's own (not sample) data under a new id. */
async function ownCopy(index: number, id: string, patch: Partial<SessionRecord> = {}) {
  const fx = DEMO_FIXTURES.sessions[index]
  const db = getDb()
  const rename = (s: string) => s.split(fx.session.id).join(id)
  await db.sessions.put({ ...fx.session, ...patch, id, isDemo: 0 })
  await db.serves.bulkPut(fx.serves.map((s) => ({ ...toServeRecord(s), id: rename(s.id), sessionId: id })))
  await db.sessionStats.put({ ...fx.stats, sessionId: id })
  if (fx.tags.length) await db.tags.bulkPut(fx.tags.map((t) => ({ ...t, serveId: rename(t.serveId), sessionId: id })))
}

describe('syncCoaching', () => {
  it('stores the decision for the newest sample session, flagged as sample data', async () => {
    await loadDemoData(DEMO_FIXTURES)
    await getDb().coaching.clear()
    const r = await syncCoaching({ now: new Date('2026-09-26T10:00:00+10:00'), experimental: false })
    expect(r.decision).toBeDefined()
    const newest = [...DEMO_FIXTURES.sessions].sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))[0].session.id
    const stored = await latestDecision(newest)
    expect(stored?.sessionId).toBe(newest)
    expect((stored as { isDemo?: number }).isDemo).toBe(1)
  })

  it('attaches a re-test recorded for the active experiment and stores its verdict', async () => {
    const side = DEMO_FIXTURES.sessions.filter((s) => s.session.view === 'side')
    const first = DEMO_FIXTURES.sessions.indexOf(side[0])
    const last = DEMO_FIXTURES.sessions.indexOf(side.at(-1)!)
    await ownCopy(first, 'own-1')
    const exp: ExperimentRecord = await createExperiment({
      ...DEMO_FIXTURES.experiment,
      id: 'own-exp',
      isDemo: 0,
      baselineSessionIds: ['own-1'],
      retestSessionIds: [],
      result: undefined,
      createdAt: '2026-09-12T12:00:00+10:00',
    })
    await ownCopy(last, 'own-2', { isRetest: 1, experimentId: exp.id })
    const r = await syncCoaching({ now: new Date('2026-09-26T10:00:00+10:00'), experimental: false })
    expect(r.attachedRetest).toBe('own-2')
    const stored = await getExperiment('own-exp')
    expect(stored?.retestSessionIds).toEqual(['own-2'])
    expect(stored?.result?.metricId).toBeDefined()
    expect(stored?.result?.verdict).toBeDefined()
    expect(stored?.result?.baseline.sessionIds).toContain('own-1')
    // Idempotent: a second sync neither re-attaches nor duplicates.
    const again = await syncCoaching({ now: new Date('2026-09-26T10:05:00+10:00'), experimental: false })
    expect(again.attachedRetest).toBeUndefined()
    expect((await getExperiment('own-exp'))?.retestSessionIds).toEqual(['own-2'])
  })

  it('never links a session that was not recorded as this experiment’s re-test', async () => {
    const side = DEMO_FIXTURES.sessions.filter((s) => s.session.view === 'side')
    await ownCopy(DEMO_FIXTURES.sessions.indexOf(side[0]), 'own-1')
    await createExperiment({ ...DEMO_FIXTURES.experiment, id: 'own-exp', isDemo: 0, baselineSessionIds: ['own-1'], retestSessionIds: [], result: undefined })
    await ownCopy(DEMO_FIXTURES.sessions.indexOf(side.at(-1)!), 'own-2')
    const r = await syncCoaching({ now: new Date('2026-09-26T10:00:00+10:00'), experimental: false })
    expect(r.attachedRetest).toBeUndefined()
    expect((await getExperiment('own-exp'))?.retestSessionIds).toEqual([])
  })

  it('serialises concurrent calls and never throws', async () => {
    const results = await Promise.all([syncCoaching(), syncCoaching(), syncCoaching({ sessionId: 'missing' })])
    expect(results).toHaveLength(3)
  })
})
