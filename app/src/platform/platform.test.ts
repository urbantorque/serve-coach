import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { createExperiment, createSession, getSetting, listEvents, setSetting, useToastStore } from '../data/index.ts'
import { resetDbForTests } from '../data/db.ts'
import { DEMO_FIXTURES } from '../data/fixtures.ts'
import type { ExperimentRecord, SessionRecord } from '../data/records.ts'
import { analysisProps, noteAnalysisDone, noteVerdictViewed, rateUsefulness, skipUsefulness, usefulnessAnswered } from './beta.ts'
import { FIRST_SESSION_LINE, persistAtFirstSession, readStorageStatus, requestPersistence, storageEstimateLine } from './storage.ts'

const DAY = 86_400_000
const base = DEMO_FIXTURES.sessions[0].session

function session(id: string, patch: Partial<SessionRecord> = {}): SessionRecord {
  return { ...base, id, isDemo: 0, isRetest: 0, status: 'ready', ...patch }
}

function fakeStorage(o: { persisted?: boolean; grant?: boolean; usage?: number; quota?: number } = {}) {
  const calls = { persist: 0 }
  return {
    calls,
    persisted: async () => o.persisted ?? false,
    persist: async () => {
      calls.persist++
      return o.grant ?? false
    },
    estimate: async () => ({ usage: o.usage ?? 0, quota: o.quota ?? 0 }),
  }
}

beforeEach(async () => {
  await resetDbForTests()
  useToastStore.setState({ queue: [] })
})

describe('storage persistence', () => {
  it('asks once at the first saved session, with the one-line explanation', async () => {
    const s = fakeStorage({ grant: true })
    expect(await persistAtFirstSession(s)).toBe('granted')
    expect(useToastStore.getState().queue.map((t) => t.message)).toEqual([FIRST_SESSION_LINE])
    expect(await getSetting('storagePersisted')).toBe(true)
    // Never again automatically.
    expect(await persistAtFirstSession(s)).toBe('skipped')
    expect(s.calls.persist).toBe(1)
    const [event] = await listEvents()
    expect(event).toMatchObject({ name: 'storage_persist_requested', props: { result: 'granted', from: 'first-session' } })
  })

  it('does not ask again after a denial, and says nothing when already protected or unsupported', async () => {
    const denied = fakeStorage({ grant: false })
    expect(await persistAtFirstSession(denied)).toBe('denied')
    expect(await getSetting('storagePersisted')).toBe('denied')
    expect(await persistAtFirstSession(denied)).toBe('skipped')

    await setSetting('storagePersisted', false)
    useToastStore.setState({ queue: [] })
    expect(await persistAtFirstSession(fakeStorage({ persisted: true }))).toBe('skipped')
    expect(await getSetting('storagePersisted')).toBe(true)
    expect(useToastStore.getState().queue).toHaveLength(0)

    await setSetting('storagePersisted', false)
    expect(await persistAtFirstSession({})).toBe('skipped')
    expect(await requestPersistence('storage-screen', undefined)).toBe('unsupported')
  })

  it('reads the estimate and words it plainly', async () => {
    const status = await readStorageStatus(fakeStorage({ usage: 1.2e9, quota: 60e9 }))
    expect(status).toEqual({ canPersist: true, persisted: false, usage: 1.2e9, quota: 60e9 })
    expect(storageEstimateLine(status)).toBe('This browser lets Serve Coach use up to about 60.0 GB. In use: 1.2 GB (2%).')
    expect(storageEstimateLine({ usage: 3e6, quota: 60e9 })).toContain('(under 1%)')
    expect(storageEstimateLine({ usage: null, quota: null })).toBe("This browser doesn't say how much space Serve Coach may use.")
    expect(await readStorageStatus(undefined)).toEqual({ canPersist: false, persisted: null, usage: null, quota: null })
  })
})

describe('beta events from app state', () => {
  const analysis = (analysed: number, overall: 'good' | 'usable' | 'poor') =>
    ({ ...base.analysis!, counts: { ...base.analysis!.counts, analysed }, capture: { ...base.analysis!.capture, quality: { ...base.analysis!.capture.quality, overall } } })

  it('buckets an analysed session and marks it valid only with 10+ serves and Fair or Good capture', () => {
    expect(analysisProps(session('a', { analysis: analysis(12, 'usable') }), null)).toMatchObject({ serves: '10-14', capture: 'fair', valid: true, sinceBaseline: 'none' })
    expect(analysisProps(session('b', { analysis: analysis(12, 'poor') }), null)).toMatchObject({ capture: 'limited', valid: false })
    expect(analysisProps(session('c', { analysis: analysis(8, 'good') }), null)).toMatchObject({ serves: '5-9', valid: false })
    expect(analysisProps(session('d', { analysis: analysis(15, 'good'), template: 'import' }), 9)).toMatchObject({ source: 'imported', sinceBaseline: '8-14' })
    expect(analysisProps(session('e', { analysis: analysis(15, 'good'), isDemo: 1 }), null)).toBeNull()
  })

  it('records a finished session once, never the sample', async () => {
    await createSession(session('own', { analysis: analysis(14, 'good') }))
    await createSession(session('demo', { analysis: analysis(14, 'good'), isDemo: 1 }))
    expect(await noteAnalysisDone('own', async () => undefined)).toBe(true)
    expect(await noteAnalysisDone('own', async () => undefined)).toBe(false)
    expect(await noteAnalysisDone('demo', async () => undefined)).toBe(false)
    expect((await listEvents()).map((e) => e.name)).toEqual(['analysis_completed'])
  })

  it('counts a verdict as a loop only when the re-test came within 14 days of the baseline', async () => {
    const t0 = Date.parse('2026-10-01T09:00:00Z')
    await createSession(session('b1', { startedAt: new Date(t0).toISOString() }))
    await createSession(session('r1', { startedAt: new Date(t0 + 10 * DAY).toISOString(), isRetest: 1 }))
    await createSession(session('r2', { startedAt: new Date(t0 + 20 * DAY).toISOString(), isRetest: 1 }))
    const exp = (retest: string): ExperimentRecord =>
      ({ ...DEMO_FIXTURES.experiment, id: `exp-${retest}`, isDemo: 0, createdAt: new Date(t0).toISOString(), baselineSessionIds: ['b1'], retestSessionIds: [retest] }) as ExperimentRecord
    await createExperiment(exp('r1'))
    expect(await noteVerdictViewed(exp('r1'), 'likely-better', false)).toBe(true)
    expect(await noteVerdictViewed(exp('r1'), 'likely-better', false)).toBe(false)
    expect(await noteVerdictViewed(exp('r2'), 'about-the-same', false)).toBe(true)
    expect(await noteVerdictViewed({ ...exp('r1'), isDemo: 1 }, 'clearly-better', false)).toBe(false)
    expect(await noteVerdictViewed(exp('r1'), 'made-up', false)).toBe(false)
    const events = await listEvents()
    expect(events.map((e) => e.props.retestWithin14d)).toEqual([true, false])
  })

  it('asks the usefulness question once per experiment, whether rated or skipped', async () => {
    expect(await usefulnessAnswered('x')).toBe(false)
    await rateUsefulness('x', 4)
    expect(await usefulnessAnswered('x')).toBe(true)
    await skipUsefulness('y')
    expect(await usefulnessAnswered('y')).toBe(true)
    expect(await rateUsefulness('x', 5)).toBe(false)
  })
})
