// Extra item C1: every recording is its own block. The data layer numbers a new session as the visit's
// next block of its template, in the same transaction as the write (CAPTURE §5.5: Block A = 1, B = 2).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb, resetDbForTests, withBlockNumbers } from './db.ts'
import { loadDemoData } from './demo.ts'
import { DEMO_FIXTURES } from './fixtures.ts'
import { createSession, listBlocksOfVisit, markStatus } from './repos/sessions.ts'

beforeEach(async () => {
  await resetDbForTests()
})

const at = (hhmm: string, day = '2026-09-28') => `${day}T${hhmm}:00+10:00`
const base = { status: 'queued' as const, mode: 'technique' as const, view: 'side' as const }

describe('createSession numbers recording blocks per visit and template', () => {
  it('an Experiment visit: Block A is 1, Block B is 2; another template and another day start at 1', async () => {
    const a = await createSession({ ...base, startedAt: at('08:00'), template: 'experiment' })
    const check = await createSession({ ...base, startedAt: at('08:10'), template: 'check-in' })
    const b = await createSession({ ...base, startedAt: at('08:40'), template: 'experiment' })
    const next = await createSession({ ...base, startedAt: at('08:00', '2026-09-29'), template: 'experiment' })
    expect([a.blockIndex, check.blockIndex, b.blockIndex, next.blockIndex]).toEqual([1, 1, 2, 1])
    expect((await listBlocksOfVisit(a.visitId)).map((s) => s.id)).toEqual([a.id, check.id, b.id])
  })

  it('a recording that failed or was stopped does not take a block (its re-record keeps the number)', async () => {
    const a = await createSession({ ...base, startedAt: at('08:00'), template: 'experiment' })
    await markStatus(a.id, 'failed')
    const again = await createSession({ ...base, startedAt: at('08:05'), template: 'experiment' })
    const b = await createSession({ ...base, startedAt: at('08:40'), template: 'experiment' })
    expect([again.blockIndex, b.blockIndex]).toEqual([1, 2])
  })

  it('sample data counts apart from the player\'s own, and a block the caller set is kept', async () => {
    await createSession({ ...base, startedAt: at('08:00'), template: 'experiment', isDemo: 1 })
    const own = await createSession({ ...base, startedAt: at('08:30'), template: 'experiment' })
    const set = await createSession({ ...base, startedAt: at('09:00'), template: 'experiment', blockIndex: 5 })
    expect([own.blockIndex, set.blockIndex]).toEqual([1, 5])
  })
})

describe('sample data is numbered too (it is written outside createSession)', () => {
  it('the fixtures load with a block number per recording', async () => {
    await loadDemoData(DEMO_FIXTURES)
    const rows = await getDb().sessions.toArray()
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((s) => (s.blockIndex ?? 0) >= 1)).toBe(true)
  })

  it('withBlockNumbers fills only a missing or 0 block, per visit and template', () => {
    const row = (id: string, startedAt: string, blockIndex?: number) => ({ ...base, id, startedAt, visitId: startedAt.slice(0, 10), template: 'experiment' as const, createdAt: startedAt, isRetest: 0 as const, isDemo: 1 as const, ...(blockIndex !== undefined ? { blockIndex } : {}) })
    const out = withBlockNumbers([row('a', at('08:00'), 0), row('b', at('08:40')), row('c', at('09:00'), 7)])
    expect(out.map((s) => s.blockIndex)).toEqual([1, 2, 7])
  })
})
