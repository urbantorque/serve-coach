// readFocusData + buildFocusInput against a real (fake-indexeddb) store: a long experiment keeps its
// baseline, the load guidance reads the whole history after a long break (finding 12), and a practice
// logged sore today reaches the engine whatever drill it was (finding 0).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { decideFocus, rampFlag, type FocusDecision } from '../../../coaching/index.ts'
import { getDb, resetDbForTests } from '../../../data/db.ts'
import { DEMO_FIXTURES } from '../../../data/fixtures.ts'
import { createExperiment, logPractice } from '../../../data/repos/coaching.ts'
import { toServeRecord } from '../../../data/repos/serves.ts'
import type { SessionRecord } from '../../../data/records.ts'
import { buildFocusInput, readFocusData } from './focusInput.ts'

beforeEach(async () => {
  await resetDbForTests()
})

const DAY = 86_400_000
const side = DEMO_FIXTURES.sessions.filter((s) => s.session.view === 'side')

/** A side-view fixture session copied as the player's own data, at another time. */
async function ownCopy(id: string, startedAt: string, patch: Partial<SessionRecord> = {}) {
  const fx = side[0]
  const db = getDb()
  const rename = (s: string) => s.split(fx.session.id).join(id)
  await db.sessions.put({ ...fx.session, ...patch, id, startedAt, visitId: startedAt.slice(0, 10), isDemo: 0 })
  await db.serves.bulkPut(fx.serves.map((s) => ({ ...toServeRecord(s), id: rename(s.id), sessionId: id })))
  await db.sessionStats.put({ ...fx.stats, sessionId: id })
}

const iso = (t: number) => new Date(t).toISOString()

describe('readFocusData: a long experiment keeps its baseline (finding 12)', () => {
  it('17 sessions: the baseline is outside the newest 12 but still reaches the verdict history', async () => {
    const now = new Date('2026-09-28T10:00:00+10:00')
    const start = now.getTime() - 34 * DAY
    for (let i = 0; i < 17; i++) await ownCopy(i === 0 ? 'own-base' : `own-${i}`, iso(start + i * 2 * DAY))
    await createExperiment({
      ...DEMO_FIXTURES.experiment,
      id: 'own-exp',
      isDemo: 0,
      baselineSessionIds: ['own-base'],
      retestSessionIds: Array.from({ length: 15 }, (_, i) => `own-${i + 2}`),
      result: undefined,
      createdAt: iso(start + 60_000),
    })
    const raw = await readFocusData(now)
    expect(raw.sessions).toHaveLength(12)
    expect(raw.sessions.some((s) => s.record.id === 'own-base')).toBe(false)
    expect(raw.experimentSessions.some((s) => s.record.id === 'own-base')).toBe(true)
    const built = buildFocusInput(raw, { experimental: false, now })!
    expect(built.verdictHistory.some((s) => s.id === 'own-base')).toBe(true)
    expect(built.input.experimentHistory?.some((s) => s.id === 'own-base')).toBe(true)
  })
})

describe('load guidance reads the whole history, not only the 36-day window (finding 12; COACHING §11)', () => {
  it('back after a 6-week-plus break with nothing since: the "Welcome back" note shows', async () => {
    const now = new Date('2026-09-28T10:00:00+10:00')
    // Three months of history, the last session 46 days ago.
    for (let i = 0; i < 12; i++) await ownCopy(`old-${i}`, iso(now.getTime() - (90 - i * 4) * DAY))
    const raw = await readFocusData(now)
    expect(raw.load.sessions).toHaveLength(0)
    const built = buildFocusInput(raw, { experimental: false, now })!
    expect(built.input.load?.daysSinceLastServes).toBe(46)
    expect(built.input.load?.historyDays).toBe(90)
    expect(built.input.load?.sessionsInHistory).toBe(12)
    const d = decideFocus(built.input)
    const notes = d.kind === 'focus' || d.kind === 'keep-going' ? d.load.notes.map((n) => n.id) : []
    expect(notes).toContain('return')
  })

  it('a big first week back after the break: the ramp check runs on the full history', async () => {
    const now = new Date('2026-09-28T10:00:00+10:00')
    for (let i = 0; i < 12; i++) await ownCopy(`old-${i}`, iso(now.getTime() - (90 - i * 4) * DAY))
    // 130 drill serves this week, logged as practice (no experiment).
    for (const [ago, reps] of [[3, 45], [2, 45], [1, 40]] as const) {
      await logPractice({ date: new Date(now.getTime() - ago * DAY).toLocaleDateString('en-CA'), minutes: 20, reps, setting: 'court', body: 'fine' })
    }
    const built = buildFocusInput(await readFocusData(now), { experimental: false, now })!
    const load = built.input.load!
    expect(load.last7Days).toBe(130)
    expect(load.chronicWeeklyMean).toBe(0)
    expect(load.historyDays).toBeGreaterThanOrEqual(28)
    expect(rampFlag(load)).toBe(true)
  })
})

describe('a practice logged sore today reaches the engine (finding 0)', () => {
  it('a keep-going practice logged "A bit sore or tight" today sets soreLoggedToday', async () => {
    const now = new Date('2026-09-28T18:00:00+10:00')
    await ownCopy('today', iso(now.getTime() - 6 * 3_600_000))
    await logPractice({ date: now.toLocaleDateString('en-CA'), itemId: 'keep-going', minutes: 10, reps: 20, setting: 'court', body: 'sore' })
    const built = buildFocusInput(await readFocusData(now), { experimental: false, now })!
    expect(built.input.soreLoggedToday).toBe(true)
    const d = decideFocus(built.input)
    if (d.kind === 'focus') expect((d as FocusDecision).drill.progression).toBeUndefined()
  })

  it('a sore log yesterday does not hold today', async () => {
    const now = new Date('2026-09-28T18:00:00+10:00')
    await ownCopy('today', iso(now.getTime() - 6 * 3_600_000))
    await logPractice({ date: new Date(now.getTime() - DAY).toLocaleDateString('en-CA'), itemId: 'keep-going', minutes: 10, reps: 20, setting: 'court', body: 'sore' })
    const built = buildFocusInput(await readFocusData(now), { experimental: false, now })!
    expect(built.input.soreLoggedToday).toBeUndefined()
  })
})
